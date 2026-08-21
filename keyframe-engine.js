(function (global) {
  'use strict';

  var engine = global.TypeDeformerTextAnimator;
  if (!engine) throw new Error('Text Animator must load before keyframe-engine.js');
  if (engine.keyframes) return;

  var PROPERTIES = [
    'x', 'y', 'rotation', 'scaleX', 'scaleY',
    'skewX', 'skewY', 'opacity', 'blur', 'hue'
  ];
  var EASINGS = ['linear', 'hold', 'easeIn', 'easeOut', 'easeInOut'];
  var EPSILON = 0.0005;

  function finite(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function phase01(value) {
    var phase = finite(value, 0) % 1;
    return phase < 0 ? phase + 1 : phase;
  }

  function easingName(value) {
    return EASINGS.indexOf(value) >= 0 ? value : 'linear';
  }

  function normalizeFrame(raw, index, fallbackValue) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var id = typeof raw.id === 'string' && raw.id
      ? raw.id.slice(0, 80)
      : 'keyframe-' + index;
    return {
      id: id,
      time: clamp(finite(raw.time, 0), 0, 1),
      value: finite(raw.value, fallbackValue),
      easing: easingName(raw.easing)
    };
  }

  function normalizeTrack(raw, fallbackValue) {
    if (!Array.isArray(raw)) return [];
    var ids = Object.create(null);
    var track = raw.slice(0, 256).map(function (frame, index) {
      var normalized = normalizeFrame(frame, index, fallbackValue);
      var base = normalized.id;
      var suffix = 1;
      while (ids[normalized.id]) normalized.id = base + '-' + suffix++;
      ids[normalized.id] = true;
      return normalized;
    });
    track.sort(function (a, b) {
      if (Math.abs(a.time - b.time) > EPSILON) return a.time - b.time;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return track;
  }

  function emptyTracks() {
    var tracks = {};
    for (var i = 0; i < PROPERTIES.length; i++) tracks[PROPERTIES[i]] = [];
    return tracks;
  }

  function normalizeTracks(raw, transform) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    transform = transform && typeof transform === 'object' ? transform : {};
    var tracks = {};
    var keys = Object.keys(raw);
    for (var k = 0; k < keys.length; k++) {
      if (PROPERTIES.indexOf(keys[k]) < 0) {
        try { tracks[keys[k]] = JSON.parse(JSON.stringify(raw[keys[k]])); }
        catch (error) { /* unknown future track is bypassed when it cannot clone */ }
      }
    }
    for (var i = 0; i < PROPERTIES.length; i++) {
      var property = PROPERTIES[i];
      tracks[property] = normalizeTrack(raw[property], finite(transform[property], 0));
    }
    return tracks;
  }

  function ease(name, value) {
    var t = clamp(value, 0, 1);
    if (name === 'hold') return 0;
    if (name === 'easeIn') return t * t * t;
    if (name === 'easeOut') return 1 - Math.pow(1 - t, 3);
    if (name === 'easeInOut') {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    return t;
  }

  function evaluateTrack(rawTrack, phase, fallbackValue) {
    var track = normalizeTrack(rawTrack, fallbackValue);
    if (!track.length) return fallbackValue;
    if (track.length === 1) return track[0].value;

    var p = phase01(phase);
    var previous;
    var next;
    var previousTime;
    var nextTime;

    if (p < track[0].time) {
      previous = track[track.length - 1];
      next = track[0];
      previousTime = previous.time - 1;
      nextTime = next.time;
    } else if (p >= track[track.length - 1].time) {
      previous = track[track.length - 1];
      next = track[0];
      previousTime = previous.time;
      nextTime = next.time + 1;
    } else {
      for (var i = 0; i < track.length - 1; i++) {
        if (p >= track[i].time && p < track[i + 1].time) {
          previous = track[i];
          next = track[i + 1];
          previousTime = previous.time;
          nextTime = next.time;
          break;
        }
      }
    }

    if (!previous || !next || nextTime - previousTime <= EPSILON) {
      return previous ? previous.value : track[0].value;
    }
    var progress = (p - previousTime) / (nextTime - previousTime);
    var mixed = ease(previous.easing, progress);
    return previous.value + (next.value - previous.value) * mixed;
  }

  function findSourceAnimator(input, normalizedAnimator, index) {
    if (!input || !Array.isArray(input.animators)) return null;
    for (var i = 0; i < input.animators.length; i++) {
      if (input.animators[i] && input.animators[i].id === normalizedAnimator.id) return input.animators[i];
    }
    return input.animators[index] || null;
  }

  var originalDefaultAnimator = engine.defaultAnimator;
  var originalNormalizeState = engine.normalizeState;
  var originalEvaluateStack = engine.evaluateStack;
  var originalApplyPreset = engine.applyPreset;

  engine.defaultAnimator = function (name, id) {
    var animator = originalDefaultAnimator(name, id);
    animator.tracks = emptyTracks();
    return animator;
  };

  engine.normalizeState = function (input) {
    var normalized = originalNormalizeState(input);
    for (var i = 0; i < normalized.animators.length; i++) {
      var animator = normalized.animators[i];
      var source = findSourceAnimator(input, animator, i);
      animator.tracks = normalizeTracks(source && source.tracks, animator.transform);
    }
    return normalized;
  };

  function projectTracks(state, phase) {
    var normalized = engine.normalizeState(state);
    var projected = Object.assign({}, normalized, { animators: [] });
    for (var i = 0; i < normalized.animators.length; i++) {
      var animator = normalized.animators[i];
      var next = Object.assign({}, animator, {
        transform: Object.assign({}, animator.transform),
        tracks: animator.tracks
      });
      for (var p = 0; p < PROPERTIES.length; p++) {
        var property = PROPERTIES[p];
        var track = animator.tracks[property];
        if (track && track.length) {
          next.transform[property] = evaluateTrack(track, phase, next.transform[property]);
        }
      }
      projected.animators.push(next);
    }
    return projected;
  }

  engine.evaluateStack = function (state, items, phase) {
    var normalized = engine.normalizeState(state);
    var samplePhase = phase == null ? normalized.phase : phase;
    return originalEvaluateStack(projectTracks(normalized, samplePhase), items, samplePhase);
  };

  engine.applyPreset = function (state, presetName, animatorId) {
    var before = engine.normalizeState(state);
    var tracksById = Object.create(null);
    for (var i = 0; i < before.animators.length; i++) {
      tracksById[before.animators[i].id] = before.animators[i].tracks;
    }
    var applied = originalApplyPreset(before, presetName, animatorId);
    var normalized = engine.normalizeState(applied);
    for (var j = 0; j < normalized.animators.length; j++) {
      if (tracksById[normalized.animators[j].id]) {
        normalized.animators[j].tracks = normalizeTracks(
          tracksById[normalized.animators[j].id],
          normalized.animators[j].transform
        );
      }
    }
    return normalized;
  };

  function upsert(track, frame, fallbackValue) {
    var next = normalizeTrack(track, fallbackValue);
    var normalized = normalizeFrame(frame, next.length, fallbackValue);
    var replaced = false;
    for (var i = 0; i < next.length; i++) {
      if (next[i].id === normalized.id || Math.abs(next[i].time - normalized.time) <= EPSILON) {
        next[i] = normalized;
        replaced = true;
        break;
      }
    }
    if (!replaced) next.push(normalized);
    return normalizeTrack(next, fallbackValue);
  }

  function remove(track, id, fallbackValue) {
    return normalizeTrack(track, fallbackValue).filter(function (frame) { return frame.id !== id; });
  }

  function frameAt(track, id, fallbackValue) {
    var normalized = normalizeTrack(track, fallbackValue);
    for (var i = 0; i < normalized.length; i++) if (normalized[i].id === id) return normalized[i];
    return null;
  }

  engine.keyframes = Object.freeze({
    properties: PROPERTIES.slice(),
    easings: EASINGS.slice(),
    emptyTracks: emptyTracks,
    normalizeTrack: normalizeTrack,
    normalizeTracks: normalizeTracks,
    evaluateTrack: evaluateTrack,
    projectTracks: projectTracks,
    upsert: upsert,
    remove: remove,
    frameAt: frameAt,
    phase01: phase01
  });
})(typeof window !== 'undefined' ? window : globalThis);
