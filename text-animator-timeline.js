(function (root) {
  'use strict';

  var engine = root.TypeDeformerTextAnimator;
  if (!engine) throw new Error('Text Animator must load before its timeline extension.');

  var VERSION = 1;
  var MAX_KEYS_PER_TRACK = 64;
  var TIME_EPSILON = 0.0005;
  var EASINGS = ['linear', 'hold', 'easeIn', 'easeOut', 'easeInOut'];
  var PROPERTY_SPECS = {
    x: { label: 'Position X', min: -2000, max: 2000, step: 1, fallback: 0, unit: 'px' },
    y: { label: 'Position Y', min: -2000, max: 2000, step: 1, fallback: 0, unit: 'px' },
    rotation: { label: 'Rotation', min: -720, max: 720, step: 1, fallback: 0, unit: '°' },
    scaleX: { label: 'Scale X', min: 1, max: 800, step: 1, fallback: 100, unit: '%' },
    scaleY: { label: 'Scale Y', min: 1, max: 800, step: 1, fallback: 100, unit: '%' },
    skewX: { label: 'Skew X', min: -85, max: 85, step: 1, fallback: 0, unit: '°' },
    skewY: { label: 'Skew Y', min: -85, max: 85, step: 1, fallback: 0, unit: '°' }
  };
  var PROPERTY_NAMES = Object.keys(PROPERTY_SPECS);

  var original = {
    defaultAnimator: engine.defaultAnimator,
    defaultState: engine.defaultState,
    normalizeAnimator: engine.normalizeAnimator,
    normalizeState: engine.normalizeState,
    activeAnimator: engine.activeAnimator,
    evaluateAnimator: engine.evaluateAnimator,
    evaluateStack: engine.evaluateStack,
    applyPreset: engine.applyPreset
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function finite(value, fallback) {
    value = Number(value);
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, min, max, fallback) {
    return Math.max(min, Math.min(max, finite(value, fallback)));
  }

  function normalizePhase(value) {
    value = finite(value, 0);
    value = ((value % 1) + 1) % 1;
    return Math.abs(value - 1) <= TIME_EPSILON || Math.abs(value) <= 1e-12 ? 0 : value;
  }

  function normalizeEasing(value) {
    return EASINGS.indexOf(value) !== -1 ? value : 'linear';
  }

  function safeId(value, fallback) {
    if (typeof value !== 'string') return fallback;
    value = value.replace(/[^0-9A-Za-z_-]+/g, '-').slice(0, 80);
    return value || fallback;
  }

  function keyId(property, time, index) {
    return 'kf-' + property + '-' + Math.round(normalizePhase(time) * 1000000).toString(36) + '-' + index;
  }

  function emptyTracks() {
    var tracks = {};
    for (var i = 0; i < PROPERTY_NAMES.length; i++) tracks[PROPERTY_NAMES[i]] = [];
    return tracks;
  }

  function normalizeKey(raw, property, index) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    var spec = PROPERTY_SPECS[property];
    return {
      id: safeId(raw.id, keyId(property, raw.time, index)),
      time: normalizePhase(raw.time),
      value: clamp(raw.value, spec.min, spec.max, spec.fallback),
      easing: normalizeEasing(raw.easing),
      _sourceIndex: index
    };
  }

  function normalizeTrack(raw, property) {
    if (!PROPERTY_SPECS[property]) return [];
    var source = Array.isArray(raw) ? raw.slice(0, MAX_KEYS_PER_TRACK * 2) : [];
    var keys = source.map(function (key, index) {
      return normalizeKey(key, property, index);
    });
    keys.sort(function (left, right) {
      return left.time === right.time ? left._sourceIndex - right._sourceIndex : left.time - right.time;
    });

    var deduped = [];
    var usedIds = Object.create(null);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (deduped.length && Math.abs(deduped[deduped.length - 1].time - key.time) <= TIME_EPSILON) {
        deduped[deduped.length - 1] = key;
      } else {
        deduped.push(key);
      }
    }
    deduped = deduped.slice(0, MAX_KEYS_PER_TRACK);
    for (var j = 0; j < deduped.length; j++) {
      var nextId = deduped[j].id;
      while (usedIds[nextId]) nextId += '-' + (j + 1);
      usedIds[nextId] = true;
      deduped[j].id = nextId;
      delete deduped[j]._sourceIndex;
    }
    return deduped;
  }

  function normalizeTracks(raw) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    var tracks = emptyTracks();
    for (var i = 0; i < PROPERTY_NAMES.length; i++) {
      var property = PROPERTY_NAMES[i];
      tracks[property] = normalizeTrack(raw[property], property);
    }
    return tracks;
  }

  function applyEase(kind, amount) {
    amount = Math.max(0, Math.min(1, amount));
    if (kind === 'hold') return 0;
    if (kind === 'easeIn') return amount * amount;
    if (kind === 'easeOut') return 1 - (1 - amount) * (1 - amount);
    if (kind === 'easeInOut') return amount * amount * (3 - 2 * amount);
    return amount;
  }

  function sampleTrack(rawTrack, phase, fallback, property) {
    var keys = normalizeTrack(rawTrack, property);
    if (!keys.length) return finite(fallback, PROPERTY_SPECS[property].fallback);
    if (keys.length === 1) return keys[0].value;

    phase = normalizePhase(phase);
    var rightIndex = -1;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].time > phase + TIME_EPSILON) {
        rightIndex = i;
        break;
      }
    }

    var left;
    var right;
    var sampleTime = phase;
    if (rightIndex === -1) {
      left = keys[keys.length - 1];
      right = clone(keys[0]);
      right.time += 1;
    } else if (rightIndex === 0) {
      left = clone(keys[keys.length - 1]);
      left.time -= 1;
      right = keys[0];
    } else {
      left = keys[rightIndex - 1];
      right = keys[rightIndex];
    }

    if (Math.abs(sampleTime - left.time) <= TIME_EPSILON) return left.value;
    if (Math.abs(sampleTime - right.time) <= TIME_EPSILON) return right.value;
    var span = right.time - left.time;
    if (span <= TIME_EPSILON) return right.value;
    var amount = applyEase(left.easing, (sampleTime - left.time) / span);
    return left.value + (right.value - left.value) * amount;
  }

  function sampleTransform(rawAnimator, phase) {
    var animator = original.normalizeAnimator(rawAnimator);
    var tracks = normalizeTracks(rawAnimator && rawAnimator.tracks);
    var transform = clone(animator.transform);
    for (var i = 0; i < PROPERTY_NAMES.length; i++) {
      var property = PROPERTY_NAMES[i];
      if (!tracks[property].length) continue;
      transform[property] = sampleTrack(tracks[property], phase, transform[property], property);
    }
    return transform;
  }

  function normalizeAnimator(raw) {
    var animator = original.normalizeAnimator(raw);
    animator.tracks = normalizeTracks(raw && raw.tracks);
    return animator;
  }

  function sourceAnimators(raw) {
    if (raw && Array.isArray(raw.animators)) return raw.animators;
    if (raw && (raw.selector || raw.transform || raw.motion || raw.wiggle || raw.tracks)) return [raw];
    return [];
  }

  function normalizeState(raw) {
    var state = original.normalizeState(raw);
    var sources = sourceAnimators(raw);
    var byId = Object.create(null);
    for (var i = 0; i < sources.length; i++) {
      if (sources[i] && typeof sources[i].id === 'string') byId[sources[i].id] = sources[i];
    }
    for (var j = 0; j < state.animators.length; j++) {
      var source = byId[state.animators[j].id] || sources[j] || {};
      state.animators[j].tracks = normalizeTracks(source.tracks);
    }
    state.version = Math.max(finite(state.version, 1), VERSION);
    return state;
  }

  function defaultAnimator(name, id) {
    var animator = original.defaultAnimator(name, id);
    animator.tracks = emptyTracks();
    return animator;
  }

  function defaultState() {
    var state = original.defaultState();
    for (var i = 0; i < state.animators.length; i++) state.animators[i].tracks = emptyTracks();
    return state;
  }

  function activeAnimator(rawState) {
    var state = normalizeState(rawState);
    for (var i = 0; i < state.animators.length; i++) {
      if (state.animators[i].id === state.activeAnimatorId) return state.animators[i];
    }
    return state.animators[0];
  }

  function animatorAtPhase(rawAnimator, phase) {
    var animator = normalizeAnimator(rawAnimator);
    animator.transform = sampleTransform(animator, phase);
    return animator;
  }

  function evaluateAnimator(rawAnimator, items, phase) {
    return original.evaluateAnimator(animatorAtPhase(rawAnimator, phase), items, phase);
  }

  function evaluateStack(rawState, items, phase) {
    var state = normalizeState(rawState);
    var samplePhase = phase == null ? state.phase : phase;
    var sampled = clone(state);
    sampled.animators = state.animators.map(function (animator) {
      return animatorAtPhase(animator, samplePhase);
    });
    return original.evaluateStack(sampled, items, samplePhase);
  }

  function applyPreset(rawState, presetName, animatorId) {
    var before = normalizeState(rawState);
    var tracksById = Object.create(null);
    for (var i = 0; i < before.animators.length; i++) {
      tracksById[before.animators[i].id] = clone(before.animators[i].tracks);
    }
    var next = original.applyPreset(before, presetName, animatorId);
    for (var j = 0; j < next.animators.length; j++) {
      next.animators[j].tracks = tracksById[next.animators[j].id] || emptyTracks();
    }
    return normalizeState(next);
  }

  function findKeyIndex(keys, keyIdValue) {
    for (var i = 0; i < keys.length; i++) if (keys[i].id === keyIdValue) return i;
    return -1;
  }

  function keyNearTime(keys, time) {
    time = normalizePhase(time);
    for (var i = 0; i < keys.length; i++) {
      var distance = Math.abs(keys[i].time - time);
      distance = Math.min(distance, 1 - distance);
      if (distance <= TIME_EPSILON) return keys[i];
    }
    return null;
  }

  function uniqueNewId(keys, property, time) {
    var base = keyId(property, time, Date.now().toString(36));
    var id = base;
    var suffix = 1;
    while (findKeyIndex(keys, id) !== -1) id = base + '-' + suffix++;
    return id;
  }

  function upsertKey(rawAnimator, property, time, value, easing) {
    if (!PROPERTY_SPECS[property]) return normalizeAnimator(rawAnimator);
    var animator = normalizeAnimator(rawAnimator);
    var keys = animator.tracks[property];
    var nearby = keyNearTime(keys, time);
    if (nearby) {
      nearby.time = normalizePhase(time);
      nearby.value = clamp(value, PROPERTY_SPECS[property].min, PROPERTY_SPECS[property].max, nearby.value);
      nearby.easing = normalizeEasing(easing || nearby.easing);
    } else if (keys.length < MAX_KEYS_PER_TRACK) {
      keys.push({
        id: uniqueNewId(keys, property, time),
        time: normalizePhase(time),
        value: clamp(value, PROPERTY_SPECS[property].min, PROPERTY_SPECS[property].max, PROPERTY_SPECS[property].fallback),
        easing: normalizeEasing(easing)
      });
    }
    animator.tracks[property] = normalizeTrack(keys, property);
    return animator;
  }

  function removeKey(rawAnimator, property, keyIdValue) {
    var animator = normalizeAnimator(rawAnimator);
    if (!PROPERTY_SPECS[property]) return animator;
    animator.tracks[property] = animator.tracks[property].filter(function (key) {
      return key.id !== keyIdValue;
    });
    return animator;
  }

  function moveKey(rawAnimator, property, keyIdValue, time, value, easing) {
    var animator = normalizeAnimator(rawAnimator);
    if (!PROPERTY_SPECS[property]) return animator;
    var index = findKeyIndex(animator.tracks[property], keyIdValue);
    if (index === -1) return animator;
    var key = animator.tracks[property][index];
    key.time = normalizePhase(time);
    if (value != null) key.value = clamp(value, PROPERTY_SPECS[property].min, PROPERTY_SPECS[property].max, key.value);
    if (easing != null) key.easing = normalizeEasing(easing);
    animator.tracks[property] = normalizeTrack(animator.tracks[property], property);
    return animator;
  }

  function duplicateKey(rawAnimator, property, keyIdValue, frameStep) {
    var animator = normalizeAnimator(rawAnimator);
    if (!PROPERTY_SPECS[property]) return animator;
    var index = findKeyIndex(animator.tracks[property], keyIdValue);
    if (index === -1) return animator;
    var key = animator.tracks[property][index];
    var nextTime = normalizePhase(key.time + Math.max(1 / 1000, finite(frameStep, 1 / 30)));
    return upsertKey(animator, property, nextTime, key.value, key.easing);
  }

  function copyTrack(rawAnimator, property) {
    var animator = normalizeAnimator(rawAnimator);
    return {
      version: VERSION,
      property: property,
      keys: PROPERTY_SPECS[property] ? clone(animator.tracks[property]) : []
    };
  }

  function pasteTrack(rawAnimator, property, payload) {
    var animator = normalizeAnimator(rawAnimator);
    if (!PROPERTY_SPECS[property] || !payload || !Array.isArray(payload.keys)) return animator;
    animator.tracks[property] = normalizeTrack(payload.keys, property);
    return animator;
  }

  function phaseToFrame(phase, fps) {
    fps = Math.max(1, Math.min(240, Math.round(finite(fps, 30))));
    return Math.round(normalizePhase(phase) * fps);
  }

  function frameToPhase(frame, fps) {
    fps = Math.max(1, Math.min(240, Math.round(finite(fps, 30))));
    return normalizePhase(Math.round(finite(frame, 0)) / fps);
  }

  var timeline = {
    version: VERSION,
    maxKeysPerTrack: MAX_KEYS_PER_TRACK,
    timeEpsilon: TIME_EPSILON,
    propertySpecs: clone(PROPERTY_SPECS),
    propertyNames: PROPERTY_NAMES.slice(),
    easings: EASINGS.slice(),
    emptyTracks: emptyTracks,
    normalizePhase: normalizePhase,
    normalizeTrack: normalizeTrack,
    normalizeTracks: normalizeTracks,
    sampleTrack: sampleTrack,
    sampleTransform: sampleTransform,
    keyNearTime: keyNearTime,
    upsertKey: upsertKey,
    removeKey: removeKey,
    moveKey: moveKey,
    duplicateKey: duplicateKey,
    copyTrack: copyTrack,
    pasteTrack: pasteTrack,
    phaseToFrame: phaseToFrame,
    frameToPhase: frameToPhase
  };

  engine.defaultAnimator = defaultAnimator;
  engine.defaultState = defaultState;
  engine.normalizeAnimator = normalizeAnimator;
  engine.normalizeState = normalizeState;
  engine.activeAnimator = activeAnimator;
  engine.evaluateAnimator = evaluateAnimator;
  engine.evaluateStack = evaluateStack;
  engine.applyPreset = applyPreset;
  engine.timeline = timeline;
  engine.defaults = defaultState();

  root.TypeDeformerTextTimeline = timeline;
})(typeof window !== 'undefined' ? window : globalThis);
