(function (global) {
  'use strict';

  var DICTIONARY_URL = 'confuse-dictionary.js';
  var PREFETCH_MARKER = 'type-deformer-confuse-prefetch';
  var warmupScheduled = false;

  function dictionaryData() {
    return global.TYPE_DEFORMER_CONFUSE_DICTIONARY || null;
  }

  function findDictionaryScript() {
    var scripts = global.document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute('src') || '';
      if (/confuse-dictionary\.js(?:[?#]|$)/.test(src)) return scripts[i];
    }
    return null;
  }

  function prefetch() {
    if (dictionaryData() || global.document.getElementById(PREFETCH_MARKER)) return;
    var link = global.document.createElement('link');
    link.id = PREFETCH_MARKER;
    link.rel = 'prefetch';
    link.as = 'script';
    link.href = DICTIONARY_URL;
    global.document.head.appendChild(link);
  }

  function load() {
    if (dictionaryData()) return Promise.resolve(dictionaryData());
    if (global.TYPE_DEFORMER_CONFUSE_PRELOAD_PROMISE) {
      return global.TYPE_DEFORMER_CONFUSE_PRELOAD_PROMISE;
    }

    var existing = findDictionaryScript();
    var basePromise = new Promise(function (resolve, reject) {
      function finish() {
        var data = dictionaryData();
        if (data) resolve(data);
        else reject(new Error('Unicode dictionary did not expose data'));
      }
      function fail() {
        reject(new Error('Unicode dictionary could not be loaded'));
      }

      if (existing) {
        if (dictionaryData()) { resolve(dictionaryData()); return; }
        existing.addEventListener('load', finish, { once: true });
        existing.addEventListener('error', fail, { once: true });
        return;
      }

      var script = global.document.createElement('script');
      script.src = DICTIONARY_URL;
      script.async = true;
      script.dataset.confusePrewarm = 'true';
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', fail, { once: true });
      global.document.head.appendChild(script);
    });

    global.TYPE_DEFORMER_CONFUSE_PRELOAD_PROMISE = basePromise.then(function (data) {
      return data;
    }, function (error) {
      global.TYPE_DEFORMER_CONFUSE_PRELOAD_PROMISE = null;
      throw error;
    });
    return global.TYPE_DEFORMER_CONFUSE_PRELOAD_PROMISE;
  }

  function shouldAutoWarm() {
    var memory = Number(global.navigator.deviceMemory || 0);
    if (!isFinite(memory) || memory < 8) return false;
    var connection = global.navigator.connection
      || global.navigator.mozConnection
      || global.navigator.webkitConnection;
    if (connection) {
      if (connection.saveData) return false;
      if (/^(?:slow-)?2g$/i.test(connection.effectiveType || '')) return false;
    }
    return true;
  }

  function runWarmup(deadline) {
    warmupScheduled = false;
    if (dictionaryData() || global.document.hidden || !shouldAutoWarm()) return;
    if (deadline && !deadline.didTimeout && deadline.timeRemaining() < 12) {
      scheduleIdleWarmup(2500);
      return;
    }
    prefetch();
    load().catch(function () { /* normal on-demand loading remains available */ });
  }

  function scheduleIdleWarmup(delay) {
    if (warmupScheduled || dictionaryData() || !shouldAutoWarm()) return;
    warmupScheduled = true;
    global.setTimeout(function () {
      if (global.requestIdleCallback) {
        global.requestIdleCallback(runWarmup, { timeout: 15000 });
      } else {
        runWarmup(null);
      }
    }, Math.max(0, Number(delay) || 0));
  }

  function bindIntentHints() {
    var operator = global.document.getElementById('pOperator');
    if (!operator) return;
    operator.addEventListener('pointerenter', prefetch, { once: true, passive: true });
    operator.addEventListener('focus', prefetch, { once: true });
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', bindIntentHints, { once: true });
  } else {
    bindIntentHints();
  }

  global.addEventListener('type-deformer-confuse-prewarm', function () {
    prefetch();
    load().catch(function () { });
  });

  scheduleIdleWarmup(4500);

  global.TypeDeformerConfusePrewarm = {
    prefetch: prefetch,
    load: load,
    shouldAutoWarm: shouldAutoWarm,
    schedule: scheduleIdleWarmup
  };
})(window);
