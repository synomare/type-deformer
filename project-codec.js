(function (root) {
  'use strict';
  // The file contract has no DOM or editor dependency. Validation never repairs
  // the caller's object in place; a failed import leaves the live document alone.
  var VERSION = 93;
  function object(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function failure(message, path) { var error = new Error((path ? path + ': ' : '') + message); error.code = 'PROJECT_INVALID'; throw error; }
  function validate(data, options) {
    options = options || {};
    if (!object(data) || data.app !== 'type-deformer' || !object(data.params)) failure('Type DeformerのProject JSONではありません');
    if (data.version != null && (!Number.isSafeInteger(data.version) || data.version < 1)) failure('版番号は正の整数である必要があります', 'version');
    if (data.version > VERSION) failure('新しいバージョンで保存されています', 'version');
    if (data.text != null && typeof data.text !== 'string') failure('文字列が必要です', 'text');
    if ((data.text || '').length > 500000) failure('テキストが大きすぎます（上限50万文字）', 'text');
    ['letters'].forEach(function (key) { if (data[key] != null && !Array.isArray(data[key])) failure('配列が必要です', key); });
    ['composition', 'batchProfiles', 'lookMemory', 'document', 'renderer'].forEach(function (key) { if (data[key] != null && !object(data[key])) failure('オブジェクトが必要です', key); });
    var count = 0, seen = new Set();
    function visit(value, path, depth) {
      if (++count > 2000000 || depth > 64) failure('構造が大きすぎます', path);
      if (typeof value === 'number' && !Number.isFinite(value)) failure('有限の数値が必要です', path);
      if (value == null || typeof value !== 'object') return;
      if (seen.has(value)) failure('循環参照は保存できません', path);
      seen.add(value);
      Object.keys(value).forEach(function (key) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') failure('許可されていないキーです', path + '.' + key);
        visit(value[key], path + '.' + key, depth + 1);
      });
      seen.delete(value);
    }
    visit(data, 'project', 0);
    var warnings = [], defaults = options.defaults || {}, parameters = options.parameters;
    var operatorRegistry = options.operatorRegistry || root.TypeDeformerOperatorRegistry;
    function unused(path) { warnings.push({ path: path, reason: 'この版で未使用の設定を原本に保持します' }); }
    function number(value, path, min, max, parameter) {
      if (typeof value !== 'number' || !Number.isFinite(value)) failure('有限の数値が必要です', path);
      if (min != null && value < min || max != null && value > max) failure('値が有効範囲外です', path);
      if (parameter && parameters) {
        var result = parameters.validate(parameter, value);
        if (!result.ok) failure(result.reason, path);
      }
    }
    function operatorStates(states, path) {
      if (!object(states)) failure('効果状態オブジェクトが必要です', path);
      var ids = Object.keys(states);
      if (ids.length && (!operatorRegistry || !operatorRegistry.byId)) failure('Operator定義を読み込んでから検証してください', path);
      ids.forEach(function (id) {
        var at = path + '.' + id, state = states[id];
        if (!Object.prototype.hasOwnProperty.call(operatorRegistry.byId, id)) { unused(at); return; }
        if (!object(state)) failure('効果状態オブジェクトが必要です', at);
        if (Object.prototype.hasOwnProperty.call(state, 't') && typeof state.t !== 'boolean' && state.t !== 0 && state.t !== 1) failure('切替値はbooleanまたは0/1である必要があります', at + '.t');
        if (Object.prototype.hasOwnProperty.call(state, 'i')) number(state.i, at + '.i', 0, 1);
        Object.keys(state).forEach(function (key) { if (['t', 'i', 'm'].indexOf(key) === -1) unused(at + '.' + key); });
        // Stretch is stored in the letter's mx/my fields, not in this map.
        if (id === 'stretch') { unused(at); return; }
        if (state.m == null) return;
        var manual = state.m, manualPath = at + '.m';
        var pair = id === 'skew' || id === 'mirror';
        // Earlier and current gesture serializers can emit pair offsets for
        // these Surface operators; later records can also carry a scalar strength.
        var legacyPair = ['misregistration', 'dataMosh', 'blobTrack'].indexOf(id) !== -1;
        if (pair || legacyPair && object(manual)) {
          if (!object(manual)) failure('x/yの数値オブジェクトが必要です', manualPath);
          var bound = id === 'mirror' ? 1 : id === 'misregistration' ? 120 : id === 'dataMosh' ? 640 : id === 'blobTrack' ? 2000 : null;
          ['x', 'y'].forEach(function (axis) { number(manual[axis], manualPath + '.' + axis, bound == null ? null : -bound, bound, id === 'skew' ? 'skew' + axis.toUpperCase() : null); });
          Object.keys(manual).forEach(function (key) { if (key !== 'x' && key !== 'y') unused(manualPath + '.' + key); });
        } else if (id === 'rotate' || id === 'baselineShift') number(manual, manualPath, null, null, id === 'rotate' ? 'rotateAngle' : 'baselineShift');
        else number(manual, manualPath, 0, 1);
      });
    }
    function profile(values, path) {
      if (!object(values)) failure('設定オブジェクトが必要です', path);
      Object.keys(values).forEach(function (key) {
        var value = values[key];
        if (Object.prototype.hasOwnProperty.call(defaults, key) && defaults[key] != null && typeof defaults[key] !== 'object') {
          if (typeof value !== typeof defaults[key]) failure(typeof defaults[key] + '型が必要です', path + '.' + key);
          if (typeof value === 'number' && parameters) {
            var result = parameters.validate(key, value);
            if (!result.ok) failure(result.reason, path + '.' + key);
          }
        } else if (path === 'params' && !Object.prototype.hasOwnProperty.call(defaults, key) && Object.keys(defaults).length) {
          unused(path + '.' + key);
        }
      });
    }
    profile(data.params, 'params');
    if (data.batchProfiles) Object.keys(data.batchProfiles).forEach(function (key) { profile(data.batchProfiles[key], 'batchProfiles.' + key); });
    if (data.document) {
      if (Object.prototype.hasOwnProperty.call(data.document, 'id') && (typeof data.document.id !== 'string' || !data.document.id)) failure('空でない文書IDが必要です', 'document.id');
      if (Object.prototype.hasOwnProperty.call(data.document, 'revision') && (!Number.isSafeInteger(data.document.revision) || data.document.revision < 0)) failure('編集世代は0以上の安全な整数である必要があります', 'document.revision');
    }
    var sourceIds = new Set();
    (data.letters || []).forEach(function (letter, index) {
      if (!object(letter)) failure('文字状態オブジェクトが必要です', 'letters.' + index);
      ['t', 'l', 'i', 'mx', 'my'].forEach(function (key) { if (letter[key] != null && typeof letter[key] !== 'number' && typeof letter[key] !== 'boolean') failure('数値が必要です', 'letters.' + index + '.' + key); });
      if (letter.d != null && typeof letter.d !== 'string') failure('派生文字列が必要です', 'letters.' + index + '.d');
      if (letter.p != null) profile(letter.p, 'letters.' + index + '.p');
      if (letter.o != null) operatorStates(letter.o, 'letters.' + index + '.o');
      if (letter.source != null) {
        var source=letter.source, at='letters.' + index + '.source';
        if (!object(source) || !Number.isSafeInteger(source.start) || !Number.isSafeInteger(source.end) || source.start < 0 || source.end <= source.start || source.end > (data.text||'').length || typeof source.text!=='string') failure('原文の位置情報が不正です',at);
        if (source.text !== (data.text || '').slice(source.start, source.end)) failure('原文の範囲と文字列が一致しません', at + '.text');
        if (source.id != null) {
          if (typeof source.id!=='string' || !source.id || source.id.length>256 || sourceIds.has(source.id)) failure('文字IDが不正または重複しています',at+'.id');
          sourceIds.add(source.id);
        }
      }
    });
    return { data: clone(data), warnings: warnings, sourceVersion: data.version || 1 };
  }
  // A textarea exposes LF line endings even when its assigned value contains CR.
  // Prepare a separate application copy so all source offsets use that same text.
  function prepareEditorText(data) {
    var text = typeof data.text === 'string' ? data.text : '';
    if (text.indexOf('\r') === -1) return { data: data, corrections: [] };
    var prepared = clone(data), offsets = new Uint32Array(text.length + 1), length = 0;
    for (var i = 0; i < text.length; i++) {
      if (!(text[i] === '\n' && i > 0 && text[i - 1] === '\r')) length++;
      offsets[i + 1] = length;
    }
    prepared.text = text.replace(/\r\n?/g, '\n');
    function range(value) {
      if (!object(value)) return;
      ['start', 'end'].forEach(function (key) {
        if (Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= text.length) value[key] = offsets[value[key]];
      });
    }
    (prepared.letters || []).forEach(function (letter) {
      if (!letter || !object(letter.source)) return;
      var source = letter.source;
      range(source);
      source.text = prepared.text.slice(source.start, source.end);
      if (Array.isArray(source.clusters)) source.clusters.forEach(range);
    });
    if (prepared.params && prepared.params.textObjects) {
      var objects = JSON.parse(prepared.params.textObjects);
      if (!Array.isArray(objects)) failure('テキストオブジェクトの配列が必要です', 'params.textObjects');
      objects.forEach(range);
      prepared.params.textObjects = JSON.stringify(objects);
    }
    return { data: prepared, corrections: [{ path: 'text', reason: '編集欄の改行形式に合わせ、文字参照とテキストオブジェクトの範囲を変換しました。読込原本は保持しています' }] };
  }
  function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.keys(value).forEach(function (key) { freeze(value[key]); }); Object.freeze(value); } return value; }
  function identity() { return root.crypto && root.crypto.randomUUID ? root.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2); }
  function session() {
    var id = identity(), revision = 0;
    return {
      changed: function () { return ++revision; },
      reset: function (metadata, fork) { id = !fork && metadata && typeof metadata.id === 'string' ? metadata.id : identity(); revision = !fork && metadata && Number.isSafeInteger(metadata.revision) ? metadata.revision : 0; },
      metadata: function () { return { id: id, revision: revision }; },
      capture: function (data) { var result = clone(data); result.version = VERSION; result.document = { id: id, revision: revision }; return result; }
    };
  }
  root.TypeDeformerProjectCodec = Object.freeze({ version: VERSION, validate: validate, prepareEditorText: prepareEditorText, clone: clone, freeze: freeze, identity: identity, session: session });
})(typeof globalThis !== 'undefined' ? globalThis : this);
