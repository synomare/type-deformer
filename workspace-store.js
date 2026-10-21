(function (root) {
  'use strict';
  // Each page has its own writer. Even duplicated tabs never share a write key.
  // Checkpoints are pinned records; ordinary saves cannot rotate them away.
  var DB_NAME = 'type-deformer-workspace', POINTER = 'typeDeformer.workspace.branch', EMERGENCY = 'typeDeformer.workspace.emergency.';
  function identity() { return root.TypeDeformerProjectCodec.identity(); }
  function request(req) { return new Promise(function (resolve, reject) { req.onsuccess = function () { resolve(req.result); }; req.onerror = function () { reject(req.error); }; }); }
  function create(options) {
    options = options || {};
    var factory = options.indexedDB || root.indexedDB, local = options.localStorage || root.localStorage, session = options.sessionStorage || root.sessionStorage;
    var writer = identity(), branch = writer, sequence = 0, db = null, opening = null, queue = Promise.resolve(), closed = false;
    var channel = typeof root.BroadcastChannel === 'function' ? new root.BroadcastChannel('type-deformer-workspace') : null;
    if (channel) channel.onmessage = function () { if (options.onChange) options.onChange(); };
    function connect() {
      if (db) return Promise.resolve(db);
      if (opening) return opening;
      opening = new Promise(function (resolve, reject) {
        if (!factory) { reject(new Error('この環境では作品用ストレージを利用できません')); return; }
        var req = factory.open(options.name || DB_NAME, 1);
        req.onupgradeneeded = function () {
          var database = req.result;
          ['documents', 'recoveries', 'meta'].forEach(function (name) { if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'id' }); });
        };
        req.onerror = function () { opening = null; reject(req.error); };
        req.onblocked = function () { opening = null; reject(new Error('作品用ストレージの更新が別タブで待機しています')); };
        req.onsuccess = function () {
          db = req.result;
          if (closed) { db.close(); db = null; reject(new Error('Workspace closed')); return; }
          db.onversionchange = function () { db.close(); db = null; opening = null; };
          resolve(db);
        };
      });
      return opening;
    }
    async function transaction(names, mode, operation) {
      var database = await connect(), tx = database.transaction(names, mode);
      var done = new Promise(function (resolve, reject) {
        tx.oncomplete = resolve; tx.onerror = function () { reject(tx.error); }; tx.onabort = function () { reject(tx.error || new Error('保存が中断されました')); };
      });
      var result;
      try { result = await operation(tx); } catch (error) { try { tx.abort(); } catch (_) {} await done.catch(function () {}); throw error; }
      await done; return result;
    }
    function serialize(operation) { var next = queue.then(operation); queue = next.catch(function () {}); return next; }
    function signal() { if (channel) channel.postMessage({ writer: writer, at: Date.now() }); if (options.onChange) options.onChange(); }
    function remember() { try { session.setItem(POINTER, branch); } catch (_) {} }
    function removeJournal(key, raw) { try { if (local.getItem(key) === raw) local.removeItem(key); } catch (_) {} }
    function documentId(project) { return project && project.document && project.document.id || ''; }
    function revision(project) { var value = project && project.document && project.document.revision; return Number.isSafeInteger(value) && value >= 0 ? value : null; }
    function shouldReplace(candidate, prior) {
      if (!prior) return true;
      // Replaying the same journal must not replace the retained previous
      // generation with another copy of the already-current document.
      if (JSON.stringify(candidate.project) === JSON.stringify(prior.project)) return false;
      var nextRevision = revision(candidate.project), priorRevision = revision(prior.project);
      if (documentId(candidate.project) && documentId(candidate.project) === documentId(prior.project)
        && nextRevision != null && priorRevision != null && nextRevision !== priorRevision) return nextRevision > priorRevision;
      if (candidate.writer === prior.writer && Number.isSafeInteger(candidate.sequence) && Number.isSafeInteger(prior.sequence)
        && candidate.sequence !== prior.sequence) return candidate.sequence > prior.sequence;
      return Number(candidate.savedAt) >= Number(prior.savedAt || 0);
    }
    function checkpointContent(value) { return JSON.stringify([value.reason, value.project, value.history || null, value.raw || null]); }
    function captureCheckpoint(project, reason, history, raw) {
      // Capture synchronously, before queueing or hashing. History is caller-owned too.
      var record = { id: identity(), writer: writer, documentId: documentId(project), reason: reason,
        savedAt: Date.now(), project: root.TypeDeformerProjectCodec.clone(project),
        history: history ? root.TypeDeformerProjectCodec.clone(history) : null,
        raw: raw && typeof raw === 'object' ? root.TypeDeformerProjectCodec.clone(raw) : raw || null };
      return record;
    }
    async function checkpointIdentity(record) {
      if (root.crypto && root.crypto.subtle && root.TextEncoder) {
        var bytes = new root.TextEncoder().encode(checkpointContent(record));
        var digest = new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes));
        record.id = 'checkpoint-' + Array.from(digest, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      }
      return record;
    }
    async function writeCheckpoint(store, record) {
      var existing = await request(store.get(record.id));
      if (existing && checkpointContent(existing) === checkpointContent(record)) return existing;
      // A mismatched existing record must never be overwritten, even if its key collides.
      if (existing) record.id = identity();
      await request(store.put(record)); return record;
    }
    function put(project, reason, history, raw) {
      var captured = captureCheckpoint(project, reason, history, raw);
      return serialize(async function () {
        await checkpointIdentity(captured);
        var record = await transaction(['recoveries'], 'readwrite', function (tx) { return writeCheckpoint(tx.objectStore('recoveries'), captured); });
        signal(); return record;
      });
    }
    function save(project) {
      // Capture before queuing. A later UI edit cannot change an enqueued save.
      project = root.TypeDeformerProjectCodec.clone(project);
      var target = branch, savedAt = Date.now(), order = ++sequence, projectRaw = JSON.stringify(project);
      return serialize(function () { return transaction(['documents', 'meta'], 'readwrite', async function (tx) {
        var documents = tx.objectStore('documents'), prior = await request(documents.get(target));
        var record = { id: target, writer: writer, documentId: documentId(project), revision: revision(project) || 0, savedAt: savedAt, sequence: order, project: project, previous: prior && prior.project || null };
        // Another tab can reconcile this writer's newer exit journal while this
        // save is queued. Do not let the older queued snapshot undo that recovery.
        if (!shouldReplace(record, prior)) return prior;
        await request(documents.put(record)); await request(tx.objectStore('meta').put({ id: 'lastActive', branch: target })); return record;
      }).then(function (record) {
        if (target === branch) remember();
        try {
          var key = EMERGENCY + writer, raw = local.getItem(key), journal = raw && JSON.parse(raw);
          if (journal && journal.branch === target && documentId(journal.project) === documentId(project)
            && revision(journal.project) === revision(project) && JSON.stringify(journal.project) === projectRaw
            && JSON.stringify(record.project) === projectRaw) removeJournal(key, raw);
        } catch (_) {}
        signal(); return record;
      }); });
    }
    async function startup() {
      await connect();
      var preferred = ''; try { preferred = session.getItem(POINTER) || ''; } catch (_) {}
      // Synchronous exit drafts are a crash journal only, not the normal save path.
      var emergency = [];
      try { for (var i = 0; i < local.length; i++) { var key = local.key(i); if (key && key.indexOf(EMERGENCY) === 0) { try { var raw = local.getItem(key); emergency.push({ key: key, raw: raw, data: JSON.parse(raw) }); } catch (_) {} } } } catch (_) {}
      for (var entry of emergency) {
        if (!entry.data || !entry.data.project || typeof entry.data.branch !== 'string' || !entry.data.branch
          || !Number.isFinite(entry.data.savedAt)) continue;
        var journal = entry.data, pinned = captureCheckpoint(journal.project, '終了前の未完了保存', null, null);
        await checkpointIdentity(pinned);
        await serialize(function () { return transaction(['documents', 'recoveries', 'meta'], 'readwrite', async function (tx) {
          // Pin and reconcile the original branch in one atomic transaction.
          // Merely pinning a different tab's journal would leave its next reload stale.
          await writeCheckpoint(tx.objectStore('recoveries'), pinned);
          var documents = tx.objectStore('documents'), prior = await request(documents.get(journal.branch));
          var candidate = { id: journal.branch, writer: journal.writer || '', sequence: journal.sequence,
            documentId: documentId(journal.project), revision: revision(journal.project) || 0,
            savedAt: journal.savedAt, project: journal.project, previous: prior && prior.project || null };
          if (shouldReplace(candidate, prior)) {
            await request(documents.put(candidate));
            var meta = tx.objectStore('meta'), last = await request(meta.get('lastActive'));
            var lastDocument = last && await request(documents.get(last.branch));
            if (!lastDocument || last.branch === candidate.id || candidate.savedAt >= lastDocument.savedAt) await request(meta.put({ id: 'lastActive', branch: candidate.id }));
          }
        }); });
        // A writer may have replaced this key while IDB was committing. Only
        // remove the exact journal whose pinned record and document are durable.
        removeJournal(entry.key, entry.raw); signal();
      }
      var found = await transaction(['documents', 'meta'], 'readonly', async function (tx) {
        var doc = preferred ? await request(tx.objectStore('documents').get(preferred)) : null;
        if (!doc) { var last = await request(tx.objectStore('meta').get('lastActive')); if (last) doc = await request(tx.objectStore('documents').get(last.branch)); }
        return doc;
      });
      return found || null;
    }
    async function list() {
      return transaction(['documents', 'recoveries'], 'readonly', async function (tx) {
        var a = await request(tx.objectStore('documents').getAll()), b = await request(tx.objectStore('recoveries').getAll());
        return a.map(function (r) { r.kind = 'document'; return r; }).concat(b.map(function (r) { r.kind = 'recovery'; return r; })).sort(function (a, b) { return b.savedAt - a.savedAt; });
      });
    }
    return Object.freeze({
      startup: startup, save: save, list: list, checkpoint: put,
      fork: function () { branch = identity(); remember(); return branch; },
      emergency: function (project) { local.setItem(EMERGENCY + writer, JSON.stringify({ id: branch, branch: branch, writer: writer, sequence: ++sequence, savedAt: Date.now(), project: project })); },
      inspect: function () { return { writer: writer, branch: branch }; },
      close: function () { closed = true; if (channel) channel.close(); if (db) db.close(); db = null; }
    });
  }
  root.TypeDeformerWorkspaceStore = Object.freeze({ create: create });
})(typeof globalThis !== 'undefined' ? globalThis : this);
