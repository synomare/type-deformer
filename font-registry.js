(function (root) {
  'use strict';
  var CONTENT = /^Type Deformer SHA256 ([a-f0-9]{64}) F(\d+)$/;
  var GENERIC = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|emoji|math|fangsong)$/i;
  function failure(code, message) { var e = new Error(message); e.code = code; return e; }
  function contentIdentity(family) { var m = CONTENT.exec(family || ''); return m ? { sourceHash: m[1], faceIndex: Number(m[2]) } : null; }
  function familyName(hash, faceIndex) { return 'Type Deformer SHA256 ' + hash + ' F' + faceIndex; }
  async function sha256(buffer) {
    if (!root.crypto || !root.crypto.subtle) throw failure('FONT_HASH_UNAVAILABLE', '書体の内容を検証できません。HTTPSまたはlocalhostで開いてください。');
    var bytes = new Uint8Array(await root.crypto.subtle.digest('SHA-256', buffer));
    return Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  // Each CSS stack is a dependency on its first family; fallbacks are recorded
  // by the stack itself, not mistaken for additional required font assets.
  function families(value) {
    var found = new Set(), visited = new Set();
    function stack(text) { var m = /^\s*(?:"([^"]+)"|'([^']+)'|([^,]+))/.exec(text || ''); if (m) { var name = (m[1] || m[2] || m[3]).trim(); if (name && !GENERIC.test(name)) found.add(name); } }
    function visit(item, depth) {
      if (depth > 24 || !item) return;
      if (typeof item === 'string') { stack(item); return; }
      if (typeof item !== 'object' || visited.has(item)) return;
      visited.add(item);
      if (Array.isArray(item)) { item.forEach(function (entry) { visit(entry, depth + 1); }); return; }
      Object.keys(item).forEach(function (key) {
        if (key === 'fontFamily') stack(item[key]);
        else if (key === 'textObjects' && typeof item[key] === 'string') { try { visit(JSON.parse(item[key]), depth + 1); } catch (_) {} }
        else if (key !== 'fontManifest' && key !== 'fontDependencies' && key !== 'lookMemory' && key !== 'frozenMoment' && typeof item[key] === 'object') visit(item[key], depth + 1);
      });
    }
    visit(value, 0); return Array.from(found);
  }
  function descriptor(record) {
    var identity = contentIdentity(record.family);
    var result = { family: record.family, label: String(record.label || record.family).slice(0, 300), kind: identity ? 'imported' : /^Type Deformer /.test(record.family) ? 'legacy' : 'external' };
    if (identity) { result.sourceHash = identity.sourceHash; result.faceIndex = identity.faceIndex; if (/^[a-f0-9]{64}$/.test(record.bufferHash || '')) result.bufferHash = record.bufferHash; }
    if (record.source) result.source = { name: String(record.source.name || '').slice(0, 300), size: Number(record.source.size) || 0, lastModified: Number(record.source.lastModified) || 0, origin: record.source.origin === 'installed' ? 'installed' : 'file' };
    return result;
  }
  function create(api) {
    api = api || {};
    var records = new Map(), sources = new Map(), loading = new Map(), aliases = new Map(), expected = new Map(), sequence = 0;
    function resolve(family) { return aliases.get(family) || family; }
    function addSource(source) {
      var id = 'Type Deformer Pending ' + (++sequence);
      sources.set(id, source); return id;
    }
    function ensure(family) {
      family = resolve(family);
      if (records.has(family)) return Promise.resolve(records.get(family));
      if (loading.has(family)) return loading.get(family);
      var source = sources.get(family);
      if (!source) return Promise.reject(failure('FONT_DEPENDENCY_MISSING', 'フォントファイルを再度Importしてください。'));
      var task = (async function () {
        var file = source.getFile ? await source.getFile() : source.file;
        var buffer = await api.read(file), sourceHash = await sha256(buffer), faceIndex = 0;
        var canonical = familyName(sourceHash, faceIndex), record = records.get(canonical);
        if (!record) {
          // Concurrent imports of the same bytes share one decode/registration.
          var existing = loading.get(canonical);
          if (existing) record = await existing;
          else {
            var install = (async function () {
              var prepared = api.prepare(buffer), face, installed = false;
              var next = { family: canonical, label: source.label + (prepared.collectionCount > 1 ? ' · collection先頭書体 / ' + prepared.collectionCount : ''), buffer: prepared.buffer,
                sourceHash: sourceHash, faceIndex: faceIndex, bufferHash: await sha256(prepared.buffer),
                source: { name: file.name || source.label, size: file.size, lastModified: file.lastModified || 0, origin: source.origin || 'file' } };
              try {
                face = await api.loadFace(canonical, prepared.buffer);
                if (api.install) { api.install(face); installed = true; }
                if (api.register) await api.register(next);
                records.set(canonical, next);
                if (api.ready) api.ready(next, face);
                return next;
              } catch (error) { if (installed && api.uninstall) api.uninstall(face); records.delete(canonical); throw error; }
            })();
            loading.set(canonical, install);
            try { record = await install; } finally { loading.delete(canonical); }
          }
        }
        aliases.set(family, canonical); sources.delete(family);
        if (api.resolved) api.resolved(family, record);
        return record;
      })();
      loading.set(family, task);
      task.then(function () { loading.delete(family); }, function () { loading.delete(family); });
      return task;
    }
    function restore(manifest) {
      expected.clear();
      if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.fonts)) return;
      manifest.fonts.slice(0, 4096).forEach(function (item) {
        if (!item || typeof item.family !== 'string' || !item.family.trim() || item.family.length > 500) return;
        // The content ID is authoritative. Metadata cannot overwrite its hash.
        expected.set(item.family, descriptor(item));
      });
    }
    function manifest(value) { return { version: 1, fonts: families(value).map(function (family) { return descriptor(records.get(family) || expected.get(family) || { family: family }); }) }; }
    function inspect(value, available) {
      var fonts = manifest(value).fonts.map(function (font) {
        var state = font.kind === 'external' ? (available ? available(font.family) : 'unverified') : records.has(font.family) ? 'ready' : font.kind === 'legacy' ? 'relink-required' : 'missing';
        return Object.assign({}, font, { state: state, blocking: font.kind !== 'external' && state !== 'ready' });
      });
      return { ready: fonts.every(function (font) { return !font.blocking; }), fonts: fonts, issues: fonts.filter(function (font) { return font.state !== 'ready'; }) };
    }
    function assertReady(value, available) {
      var result = inspect(value, available), missing = result.fonts.filter(function (font) { return font.blocking; });
      if (missing.length) throw failure('FONT_DEPENDENCY_MISSING', 'フォントを再読込・再リンクしてから記録／出力してください: ' + missing.map(function (font) { return font.label; }).join('、'));
      return result;
    }
    function relink(oldFamily, newFamily, confirmed) {
      var record = records.get(resolve(newFamily));
      if (!record) throw failure('FONT_DEPENDENCY_MISSING', '再リンク先の書体を読み込んでください。');
      if (oldFamily !== record.family && confirmed !== true) throw failure('FONT_RELINK_CONFIRM', '異なる識別子への再リンクは書体を確認してから実行してください。');
      return { previous: oldFamily, family: record.family, exact: oldFamily === record.family, legacy: /^Type Deformer /.test(oldFamily) && !contentIdentity(oldFamily) };
    }
    return { records: records, sources: sources, loading: loading, addSource: addSource, ensure: ensure, resolve: resolve, restore: restore, manifest: manifest, inspect: inspect, assertReady: assertReady, relink: relink };
  }
  root.TypeDeformerFontRegistry = Object.freeze({ create: create, sha256: sha256, contentIdentity: contentIdentity, familyName: familyName, families: families });
})(typeof globalThis !== 'undefined' ? globalThis : this);
