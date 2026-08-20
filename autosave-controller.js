(function (global) {
  'use strict';

  var LEGACY_CURRENT_KEY = 'typeDeformer.autosave.v1';
  var LEGACY_BACKUP_KEY = 'typeDeformer.autosave.backup.v1';
  var DB_NAME = 'typeDeformer.autosave.v2';
  var DB_VERSION = 1;
  var STORE_NAME = 'snapshots';
  var CURRENT_ID = 'current';
  var BACKUP_ID = 'backup';

  function create(options) {
    if (!options || typeof options.projectData !== 'function'
      || typeof options.isProjectData !== 'function'
      || typeof options.loadProject !== 'function') {
      throw new Error('TypeDeformerAutosave requires projectData, isProjectData, and loadProject callbacks.');
    }

    var statusElement = options.statusElement || null;
    var intervalMs = Math.max(1000, Number(options.intervalMs) || 8000);
    var dirty = true;
    var revision = 0;
    var suspended = false;
    var started = false;
    var idleHandle = null;
    var idleKind = '';
    var inFlight = null;
    var dbPromise = null;
    var failureCount = 0;
    var retryAt = 0;
    var intervalHandle = null;

    function setStatus(state, text) {
      if (!statusElement) return;
      statusElement.dataset.state = state || 'ready';
      statusElement.textContent = text || 'Autosave ready';
    }

    function timeLabel(timestamp) {
      try {
        return new Date(timestamp).toLocaleTimeString([], {
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
      } catch (error) {
        return '';
      }
    }

    function reportError(context, error) {
      if (typeof options.onError === 'function') options.onError(context, error);
      else if (global.console && console.error) console.error('Type Deformer ' + context + ':', error);
    }

    function openDb() {
      if (!global.indexedDB) return Promise.reject(new Error('IndexedDB is unavailable'));
      if (dbPromise) return dbPromise;
      dbPromise = new Promise(function (resolve, reject) {
        var request;
        try { request = global.indexedDB.open(DB_NAME, DB_VERSION); }
        catch (openError) { reject(openError); return; }

        request.onupgradeneeded = function () {
          var db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
        request.onsuccess = function () {
          var db = request.result;
          db.onversionchange = function () {
            db.close();
            dbPromise = null;
          };
          resolve(db);
        };
        request.onerror = function () { reject(request.error || new Error('IndexedDB open failed')); };
        request.onblocked = function () { reject(new Error('IndexedDB upgrade is blocked')); };
      }).catch(function (error) {
        dbPromise = null;
        throw error;
      });
      return dbPromise;
    }

    function readRecord(id) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE_NAME, 'readonly');
          var request = tx.objectStore(STORE_NAME).get(id);
          request.onsuccess = function () {
            var record = request.result;
            resolve(record && typeof record.payload === 'string' ? record.payload : null);
          };
          request.onerror = function () { reject(request.error || new Error('Autosave read failed')); };
          tx.onabort = function () { reject(tx.error || new Error('Autosave read transaction aborted')); };
        });
      });
    }

    function writeRecord(next) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE_NAME, 'readwrite');
          var store = tx.objectStore(STORE_NAME);
          var request = store.get(CURRENT_ID);
          var unchanged = false;

          request.onsuccess = function () {
            var current = request.result;
            var previous = current && typeof current.payload === 'string' ? current.payload : null;
            if (previous === next) {
              unchanged = true;
              return;
            }
            if (previous) {
              try {
                if (options.isProjectData(JSON.parse(previous))) {
                  store.put({ id: BACKUP_ID, payload: previous, savedAt: Date.now() });
                }
              } catch (invalidPrevious) { /* preserve the existing backup */ }
            }
            store.put({ id: CURRENT_ID, payload: next, savedAt: Date.now() });
          };
          request.onerror = function () {
            try { tx.abort(); } catch (abortError) { /* transaction callbacks handle it */ }
          };
          tx.oncomplete = function () { resolve({ unchanged: unchanged, storage: 'indexedDB' }); };
          tx.onerror = function () { reject(tx.error || request.error || new Error('Autosave write failed')); };
          tx.onabort = function () { reject(tx.error || request.error || new Error('Autosave write aborted')); };
        });
      });
    }

    function legacyCandidates() {
      var candidates = [];
      try {
        var current = global.localStorage.getItem(LEGACY_CURRENT_KEY);
        var backup = global.localStorage.getItem(LEGACY_BACKUP_KEY);
        if (current) candidates.push({ raw: current, source: 'legacy-current' });
        if (backup) candidates.push({ raw: backup, source: 'legacy-backup' });
      } catch (error) { /* IndexedDB may still be available */ }
      return candidates;
    }

    function writeLegacy(next) {
      var previous = global.localStorage.getItem(LEGACY_CURRENT_KEY);
      if (previous === next) return { unchanged: true, storage: 'localStorage' };
      if (previous) {
        try {
          if (options.isProjectData(JSON.parse(previous))) {
            global.localStorage.setItem(LEGACY_BACKUP_KEY, previous);
          }
        } catch (invalidPrevious) { /* preserve the existing backup */ }
      }
      global.localStorage.setItem(LEGACY_CURRENT_KEY, next);
      return { unchanged: false, storage: 'localStorage' };
    }

    function clearLegacy() {
      try {
        global.localStorage.removeItem(LEGACY_CURRENT_KEY);
        global.localStorage.removeItem(LEGACY_BACKUP_KEY);
      } catch (error) { /* nothing else can be done */ }
    }

    function persist(next) {
      return writeRecord(next).then(function (result) {
        clearLegacy();
        return result;
      }).catch(function (indexedDbError) {
        try {
          var result = writeLegacy(next);
          result.fallbackError = indexedDbError;
          return result;
        } catch (localStorageError) {
          throw new Error(
            'IndexedDB: ' + (indexedDbError && indexedDbError.message || 'unavailable')
            + '; localStorage: ' + (localStorageError && localStorageError.message || 'unavailable')
          );
        }
      });
    }

    function markDirty() {
      dirty = true;
      revision++;
      if (!suspended && !inFlight) setStatus('pending', 'Unsaved changes');
    }

    function noteFailure(error) {
      failureCount++;
      var delay = Math.min(60000, 1000 * Math.pow(2, Math.min(failureCount, 6)));
      retryAt = Date.now() + delay;
      dirty = true;
      setStatus('failed', 'Autosave failed · retrying automatically');
      reportError('autosave failed', error);
    }

    function save() {
      if (suspended || !dirty) return Promise.resolve(false);
      if (inFlight) return inFlight;
      if (Date.now() < retryAt) return Promise.resolve(false);

      var revisionAtStart = revision;
      var next;
      setStatus('saving', 'Saving…');
      try { next = JSON.stringify(options.projectData()); }
      catch (serializationError) {
        noteFailure(serializationError);
        return Promise.resolve(false);
      }

      inFlight = persist(next).then(function (result) {
        if (revision === revisionAtStart) dirty = false;
        failureCount = 0;
        retryAt = 0;
        var label = timeLabel(Date.now());
        setStatus('saved', result.storage === 'indexedDB'
          ? 'Saved' + (label ? ' · ' + label : '')
          : 'Saved with limited storage' + (label ? ' · ' + label : ''));
        return true;
      }).catch(function (error) {
        noteFailure(error);
        return false;
      }).then(function (result) {
        inFlight = null;
        if (dirty && !suspended) schedule();
        return result;
      }, function (error) {
        inFlight = null;
        noteFailure(error);
        return false;
      });
      return inFlight;
    }

    function cancelScheduled() {
      if (idleHandle === null) return;
      if (idleKind === 'idle' && global.cancelIdleCallback) global.cancelIdleCallback(idleHandle);
      else global.clearTimeout(idleHandle);
      idleHandle = null;
      idleKind = '';
    }

    function schedule() {
      if (suspended || !dirty || inFlight || idleHandle !== null) return;
      var retryDelay = Math.max(0, retryAt - Date.now());

      function run() {
        idleHandle = null;
        idleKind = '';
        if (suspended || !dirty) return;
        if (typeof options.isPlaybackActive === 'function' && options.isPlaybackActive()) {
          idleKind = 'timer';
          idleHandle = global.setTimeout(run, 1000);
          return;
        }
        if (typeof options.isTyping === 'function' && options.isTyping()) {
          idleKind = 'timer';
          idleHandle = global.setTimeout(run, 750);
          return;
        }
        save();
      }

      if (retryDelay > 0) {
        idleKind = 'timer';
        idleHandle = global.setTimeout(run, retryDelay);
      } else if (global.requestIdleCallback) {
        idleKind = 'idle';
        idleHandle = global.requestIdleCallback(run, { timeout: 2400 });
      } else {
        idleKind = 'timer';
        idleHandle = global.setTimeout(run, 450);
      }
    }

    function readCandidates() {
      return Promise.all([readRecord(CURRENT_ID), readRecord(BACKUP_ID)]).then(function (records) {
        var candidates = [];
        if (records[0]) candidates.push({ raw: records[0], source: 'indexedDB-current' });
        if (records[1]) candidates.push({ raw: records[1], source: 'indexedDB-backup' });
        return candidates.concat(legacyCandidates());
      }).catch(function () {
        return legacyCandidates();
      });
    }

    function restore() {
      setStatus('saving', 'Checking autosave…');
      return readCandidates().then(function (candidates) {
        for (var i = 0; i < candidates.length; i++) {
          try {
            if (!options.loadProject(JSON.parse(candidates[i].raw), true)) continue;
            var legacy = candidates[i].source.indexOf('legacy-') === 0;
            dirty = legacy;
            if (legacy) {
              revision++;
              setStatus('pending', 'Restored · migrating autosave storage');
            } else {
              setStatus('saved', 'Restored autosave');
            }
            return true;
          } catch (invalidAutosave) { /* try the backup or legacy copy */ }
        }
        dirty = true;
        setStatus('ready', 'Autosave ready');
        return false;
      }).catch(function (error) {
        dirty = true;
        setStatus('failed', 'Autosave storage unavailable · changes not yet saved');
        reportError('autosave restore failed', error);
        return false;
      });
    }

    function clearIndexedDb() {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).clear();
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error || new Error('Autosave clear failed')); };
          tx.onabort = function () { reject(tx.error || new Error('Autosave clear aborted')); };
        });
      });
    }

    function clear() {
      var clearDb = clearIndexedDb().catch(function () { });
      var clearLocal = Promise.resolve().then(clearLegacy);
      return Promise.all([clearDb, clearLocal]);
    }

    function suspend() {
      suspended = true;
      cancelScheduled();
    }

    function start() {
      if (started) return;
      started = true;
      intervalHandle = global.setInterval(schedule, intervalMs);
      global.addEventListener('type-deformer-autosave-request', function () {
        cancelScheduled();
        save();
      });
      global.addEventListener('pagehide', function () {
        cancelScheduled();
        save();
      });
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.hidden) {
          cancelScheduled();
          save();
        }
      });
      schedule();
    }

    return {
      markDirty: markDirty,
      save: save,
      schedule: schedule,
      cancelScheduled: cancelScheduled,
      restore: restore,
      clear: clear,
      suspend: suspend,
      start: start,
      setStatus: setStatus,
      isDirty: function () { return dirty; },
      stop: function () {
        suspend();
        if (intervalHandle !== null) global.clearInterval(intervalHandle);
        intervalHandle = null;
      }
    };
  }

  global.TypeDeformerAutosave = { create: create };
})(window);
