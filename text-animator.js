(function (root) {
  'use strict';

  var VERSION = 1;
  var MAX_ANIMATORS = 8;

  var ANIMATOR_DEFAULTS = {
    id: 'animator-1',
    name: 'Animator 1',
    enabled: true,
    selector: {
      basis: 'character',
      shape: 'smooth',
      start: 0,
      end: 100,
      offset: 0,
      ease: 0.65,
      randomize: false,
      seed: 1,
      invert: false
    },
    transform: {
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 100,
      scaleY: 100,
      skewX: 0,
      skewY: 0,
      opacity: 100,
      blur: 0,
      hue: 0
    },
    motion: {
      enabled: false,
      waveform: 'sine',
      speed: 0.25,
      cycles: 1,
      stagger: 0.08,
      amount: 1
    },
    wiggle: {
      enabled: false,
      frequency: 1.4,
      position: 0,
      rotation: 0,
      scale: 0
    }
  };

  var STATE_DEFAULTS = {
    version: VERSION,
    enabled: false,
    phase: 0,
    activeAnimatorId: 'animator-1',
    animators: [ANIMATOR_DEFAULTS]
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function finite(value, fallback) {
    value = Number(value);
    return isFinite(value) ? value : fallback;
  }

  function clamp(value, min, max, fallback) {
    return Math.max(min, Math.min(max, finite(value, fallback)));
  }

  function bool(value, fallback) {
    if (value == null) return !!fallback;
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function choice(value, values, fallback) {
    return values.indexOf(value) !== -1 ? value : fallback;
  }

  function safeText(value, fallback, limit) {
    if (typeof value !== 'string') return fallback;
    value = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return value ? value.slice(0, limit || 48) : fallback;
  }

  function stableId(value, fallback) {
    value = safeText(value, fallback, 64).replace(/[^0-9A-Za-z_-]+/g, '-');
    return value || fallback;
  }

  function defaultAnimator(name, id) {
    var animator = clone(ANIMATOR_DEFAULTS);
    animator.id = stableId(id || 'animator-' + Date.now().toString(36), 'animator-1');
    animator.name = safeText(name, 'Animator', 40);
    return animator;
  }

  function defaultState() {
    return clone(STATE_DEFAULTS);
  }

  function normalizeAnimator(raw, index, usedIds) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    var fallbackId = 'animator-' + (index + 1);
    var id = stableId(raw.id, fallbackId);
    while (usedIds[id]) id += '-' + (index + 1);
    usedIds[id] = true;

    var animator = defaultAnimator('Animator ' + (index + 1), id);
    animator.name = safeText(raw.name, animator.name, 40);
    animator.enabled = bool(raw.enabled, true);

    var selector = raw.selector && typeof raw.selector === 'object' ? raw.selector : {};
    animator.selector.basis = choice(selector.basis, ['character', 'word', 'line'], 'character');
    animator.selector.shape = choice(selector.shape, ['square', 'rampUp', 'rampDown', 'triangle', 'smooth'], 'smooth');
    animator.selector.start = clamp(selector.start, 0, 100, 0);
    animator.selector.end = clamp(selector.end, 0, 100, 100);
    animator.selector.offset = clamp(selector.offset, -200, 200, 0);
    animator.selector.ease = clamp(selector.ease, 0, 1, 0.65);
    animator.selector.randomize = bool(selector.randomize, false);
    animator.selector.seed = Math.round(clamp(selector.seed, -2147483647, 2147483647, 1));
    animator.selector.invert = bool(selector.invert, false);

    var transform = raw.transform && typeof raw.transform === 'object' ? raw.transform : {};
    animator.transform.x = clamp(transform.x, -2000, 2000, 0);
    animator.transform.y = clamp(transform.y, -2000, 2000, 0);
    animator.transform.rotation = clamp(transform.rotation, -720, 720, 0);
    animator.transform.scaleX = clamp(transform.scaleX, 1, 800, 100);
    animator.transform.scaleY = clamp(transform.scaleY, 1, 800, 100);
    animator.transform.skewX = clamp(transform.skewX, -85, 85, 0);
    animator.transform.skewY = clamp(transform.skewY, -85, 85, 0);
    animator.transform.opacity = clamp(transform.opacity, 0, 100, 100);
    animator.transform.blur = clamp(transform.blur, 0, 80, 0);
    animator.transform.hue = clamp(transform.hue, -720, 720, 0);

    var motion = raw.motion && typeof raw.motion === 'object' ? raw.motion : {};
    animator.motion.enabled = bool(motion.enabled, false);
    animator.motion.waveform = choice(motion.waveform, ['sine', 'triangle', 'saw', 'square', 'randomHold'], 'sine');
    animator.motion.speed = clamp(motion.speed, -8, 8, 0.25);
    animator.motion.cycles = clamp(motion.cycles, 0.05, 32, 1);
    animator.motion.stagger = clamp(motion.stagger, -4, 4, 0.08);
    animator.motion.amount = clamp(motion.amount, 0, 1, 1);

    var wiggle = raw.wiggle && typeof raw.wiggle === 'object' ? raw.wiggle : {};
    animator.wiggle.enabled = bool(wiggle.enabled, false);
    animator.wiggle.frequency = clamp(wiggle.frequency, 0.05, 24, 1.4);
    animator.wiggle.position = clamp(wiggle.position, 0, 1000, 0);
    animator.wiggle.rotation = clamp(wiggle.rotation, 0, 360, 0);
    animator.wiggle.scale = clamp(wiggle.scale, 0, 300, 0);
    return animator;
  }

  function normalizeState(raw) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    // Early prototypes stored one animator directly. Preserve that data while
    // moving the public contract to an explicit stack.
    if (!Array.isArray(raw.animators) && (raw.selector || raw.transform || raw.motion || raw.wiggle)) {
      raw = {
        version: VERSION,
        enabled: raw.enabled,
        phase: raw.phase,
        activeAnimatorId: raw.id || 'animator-1',
        animators: [raw]
      };
    }

    var state = defaultState();
    state.enabled = bool(raw.enabled, false);
    state.phase = ((finite(raw.phase, 0) % 1) + 1) % 1;
    var source = Array.isArray(raw.animators) ? raw.animators.slice(0, MAX_ANIMATORS) : [];
    if (!source.length) source.push(ANIMATOR_DEFAULTS);
    var usedIds = Object.create(null);
    state.animators = source.map(function (animator, index) {
      return normalizeAnimator(animator, index, usedIds);
    });
    var requestedId = stableId(raw.activeAnimatorId, state.animators[0].id);
    state.activeAnimatorId = state.animators.some(function (animator) { return animator.id === requestedId; })
      ? requestedId : state.animators[0].id;
    return state;
  }

  function activeAnimator(state) {
    state = normalizeState(state);
    for (var i = 0; i < state.animators.length; i++) {
      if (state.animators[i].id === state.activeAnimatorId) return state.animators[i];
    }
    return state.animators[0];
  }

  function mod(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function smoothstep(value) {
    value = Math.max(0, Math.min(1, value));
    return value * value * (3 - 2 * value);
  }

  function mix(left, right, amount) {
    return left + (right - left) * amount;
  }

  function hash32(value) {
    value = value | 0;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return (value ^ (value >>> 16)) >>> 0;
  }

  function seededRandom(seed) {
    var state = hash32(seed || 1) || 0x6d2b79f5;
    return function () {
      state += 0x6d2b79f5;
      var value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function unitKey(item, basis, fallbackIndex) {
    if (basis === 'line') return finite(item.lineIndex, 0);
    if (basis === 'word') return finite(item.wordIndex, fallbackIndex);
    return finite(item.characterIndex, fallbackIndex);
  }

  function unitRanks(items, selector) {
    var keys = [];
    var keyToNaturalRank = Object.create(null);
    for (var i = 0; i < items.length; i++) {
      var key = String(unitKey(items[i], selector.basis, i));
      if (Object.prototype.hasOwnProperty.call(keyToNaturalRank, key)) continue;
      keyToNaturalRank[key] = keys.length;
      keys.push(key);
    }
    var ordered = keys.slice();
    if (selector.randomize && ordered.length > 1) {
      var random = seededRandom(selector.seed);
      for (var index = ordered.length - 1; index > 0; index--) {
        var swapIndex = Math.floor(random() * (index + 1));
        var temporary = ordered[index];
        ordered[index] = ordered[swapIndex];
        ordered[swapIndex] = temporary;
      }
    }
    var rankByKey = Object.create(null);
    for (var rank = 0; rank < ordered.length; rank++) rankByKey[ordered[rank]] = rank;
    return { count: Math.max(1, ordered.length), rankByKey: rankByKey };
  }

  function rangeProgress(position, start, end) {
    position = mod(position, 100);
    start = mod(start, 100);
    end = mod(end, 100);
    var length = mod(end - start, 100);
    // 0 → 100 is the common full-range state even though both values wrap to
    // the same position. Other equal endpoints intentionally select nothing.
    if (Math.abs(end - start) < 0.000001) return null;
    if (length < 0.000001) return null;
    var distance = mod(position - start, 100);
    if (distance > length + 0.000001) return null;
    return Math.max(0, Math.min(1, distance / length));
  }

  function selectorShape(shape, progress) {
    if (progress == null) return 0;
    if (shape === 'square') return 1;
    if (shape === 'rampUp') return progress;
    if (shape === 'rampDown') return 1 - progress;
    if (shape === 'triangle') return 1 - Math.abs(progress * 2 - 1);
    var edge = 0.2;
    return smoothstep(progress / edge) * smoothstep((1 - progress) / edge);
  }

  function selectorWeight(selector, rank, count) {
    var position = count <= 1 ? 50 : rank / (count - 1) * 100;
    position = mod(position + selector.offset, 100);
    var start = selector.start;
    var end = selector.end;
    var progress;
    if (start === 0 && end === 100) progress = position / 100;
    else progress = rangeProgress(position, start, end);
    var weight = selectorShape(selector.shape, progress);
    weight = mix(weight, smoothstep(weight), selector.ease);
    if (selector.invert) weight = 1 - weight;
    return Math.max(0, Math.min(1, weight));
  }

  function waveform(kind, turn, seed) {
    turn = mod(turn, 1);
    if (kind === 'triangle') return 1 - 4 * Math.abs(turn - 0.5);
    if (kind === 'saw') return turn * 2 - 1;
    if (kind === 'square') return turn < 0.5 ? 1 : -1;
    if (kind === 'randomHold') {
      var step = Math.floor(turn * 16);
      return seededRandom(hash32(seed + step * 1013))() * 2 - 1;
    }
    return Math.sin(turn * Math.PI * 2);
  }

  function loopNoise(turn, seed) {
    var random = seededRandom(seed);
    var phaseA = random() * Math.PI * 2;
    var phaseB = random() * Math.PI * 2;
    var phaseC = random() * Math.PI * 2;
    var angle = turn * Math.PI * 2;
    return (
      Math.sin(angle + phaseA)
      + Math.sin(angle * 2 + phaseB) * 0.5
      + Math.sin(angle * 3 + phaseC) * 0.25
    ) / 1.75;
  }

  function evaluateAnimator(rawAnimator, items, phase) {
    var animator = normalizeAnimator(rawAnimator, 0, Object.create(null));
    var ranks = unitRanks(items, animator.selector);
    phase = ((finite(phase, 0) % 1) + 1) % 1;
    var output = new Array(items.length);

    for (var i = 0; i < items.length; i++) {
      var key = String(unitKey(items[i], animator.selector.basis, i));
      var rank = ranks.rankByKey[key] || 0;
      var selected = selectorWeight(animator.selector, rank, ranks.count);
      var weight = selected;
      if (animator.motion.enabled) {
        var motionTurn = phase * animator.motion.cycles + rank * animator.motion.stagger;
        var wave = waveform(animator.motion.waveform, motionTurn, animator.selector.seed + rank * 7919);
        weight = selected * mix(1, wave, animator.motion.amount);
      }

      var wigglePositionX = 0;
      var wigglePositionY = 0;
      var wiggleRotation = 0;
      var wiggleScale = 0;
      if (animator.wiggle.enabled && selected > 0.0001) {
        var wiggleTurn = phase * animator.wiggle.frequency;
        var baseSeed = animator.selector.seed + rank * 104729;
        wigglePositionX = loopNoise(wiggleTurn, baseSeed + 11) * animator.wiggle.position * selected;
        wigglePositionY = loopNoise(wiggleTurn, baseSeed + 29) * animator.wiggle.position * selected;
        wiggleRotation = loopNoise(wiggleTurn, baseSeed + 47) * animator.wiggle.rotation * selected;
        wiggleScale = loopNoise(wiggleTurn, baseSeed + 71) * animator.wiggle.scale / 100 * selected;
      }

      var transform = animator.transform;
      output[i] = {
        selected: selected,
        weight: weight,
        x: transform.x * weight + wigglePositionX,
        y: transform.y * weight + wigglePositionY,
        rotation: transform.rotation * weight + wiggleRotation,
        scaleX: Math.max(0.02, 1 + (transform.scaleX / 100 - 1) * weight + wiggleScale),
        scaleY: Math.max(0.02, 1 + (transform.scaleY / 100 - 1) * weight + wiggleScale),
        skewX: transform.skewX * weight,
        skewY: transform.skewY * weight,
        opacity: Math.max(0, Math.min(1, 1 + (transform.opacity / 100 - 1) * weight)),
        blur: Math.max(0, Math.abs(transform.blur * weight)),
        hue: transform.hue * weight
      };
    }
    return output;
  }

  function identityResult() {
    return {
      selected: 0,
      weight: 0,
      x: 0,
      y: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      opacity: 1,
      blur: 0,
      hue: 0
    };
  }

  function evaluateStack(rawState, items, phase) {
    var state = normalizeState(rawState);
    var result = new Array(items.length);
    for (var i = 0; i < items.length; i++) result[i] = identityResult();
    if (!state.enabled) return result;

    for (var animatorIndex = 0; animatorIndex < state.animators.length; animatorIndex++) {
      var animator = state.animators[animatorIndex];
      if (!animator.enabled) continue;
      var channel = evaluateAnimator(animator, items, phase == null ? state.phase : phase);
      for (var itemIndex = 0; itemIndex < result.length; itemIndex++) {
        var target = result[itemIndex];
        var source = channel[itemIndex];
        target.selected = Math.max(target.selected, source.selected);
        target.weight += source.weight;
        target.x += source.x;
        target.y += source.y;
        target.rotation += source.rotation;
        target.scaleX *= source.scaleX;
        target.scaleY *= source.scaleY;
        target.skewX += source.skewX;
        target.skewY += source.skewY;
        target.opacity *= source.opacity;
        target.blur += source.blur;
        target.hue += source.hue;
      }
    }
    return result;
  }

  var PRESETS = {
    cascadeReveal: {
      label: 'Cascade Reveal',
      selector: { basis: 'character', shape: 'smooth', start: 0, end: 38, offset: 0, ease: 0.85, randomize: false },
      transform: { x: 0, y: 72, rotation: 8, scaleX: 92, scaleY: 92, opacity: 0, blur: 7, hue: 0 },
      motion: { enabled: true, waveform: 'sine', speed: 0.22, cycles: 1, stagger: 0.045, amount: 1 },
      wiggle: { enabled: false, frequency: 1.4, position: 0, rotation: 0, scale: 0 }
    },
    kineticWave: {
      label: 'Kinetic Wave',
      selector: { basis: 'character', shape: 'triangle', start: 0, end: 100, offset: 0, ease: 0.55, randomize: false },
      transform: { x: 0, y: 48, rotation: 18, scaleX: 118, scaleY: 84, opacity: 100, blur: 0, hue: 0 },
      motion: { enabled: true, waveform: 'sine', speed: 0.34, cycles: 1.5, stagger: 0.08, amount: 1 },
      wiggle: { enabled: false, frequency: 1.4, position: 0, rotation: 0, scale: 0 }
    },
    rubberType: {
      label: 'Rubber Type',
      selector: { basis: 'word', shape: 'smooth', start: 0, end: 100, offset: 0, ease: 0.8, randomize: false },
      transform: { x: 0, y: 0, rotation: 0, scaleX: 178, scaleY: 58, opacity: 100, blur: 0, hue: 0, skewX: 16 },
      motion: { enabled: true, waveform: 'triangle', speed: 0.18, cycles: 1, stagger: 0.16, amount: 0.92 },
      wiggle: { enabled: true, frequency: 0.8, position: 3, rotation: 2, scale: 8 }
    },
    signalRupture: {
      label: 'Signal Rupture',
      selector: { basis: 'character', shape: 'square', start: 0, end: 100, offset: 0, ease: 0.2, randomize: true, seed: 73 },
      transform: { x: 86, y: -18, rotation: 42, scaleX: 126, scaleY: 72, opacity: 42, blur: 3, hue: 160 },
      motion: { enabled: true, waveform: 'randomHold', speed: 0.5, cycles: 3, stagger: 0.21, amount: 1 },
      wiggle: { enabled: true, frequency: 3.2, position: 24, rotation: 22, scale: 16 }
    }
  };

  function mergeAnimator(animator, patch) {
    var next = clone(animator);
    ['selector', 'transform', 'motion', 'wiggle'].forEach(function (section) {
      if (!patch[section]) return;
      Object.keys(patch[section]).forEach(function (key) {
        next[section][key] = patch[section][key];
      });
    });
    return normalizeAnimator(next, 0, Object.create(null));
  }

  function applyPreset(rawState, presetName, animatorId) {
    var state = normalizeState(rawState);
    var preset = PRESETS[presetName];
    if (!preset) return state;
    var targetId = animatorId || state.activeAnimatorId;
    for (var i = 0; i < state.animators.length; i++) {
      if (state.animators[i].id !== targetId) continue;
      var id = state.animators[i].id;
      var name = state.animators[i].name;
      state.animators[i] = mergeAnimator(state.animators[i], preset);
      state.animators[i].id = id;
      state.animators[i].name = name;
      state.animators[i].enabled = true;
      state.enabled = true;
      break;
    }
    return normalizeState(state);
  }

  var api = {
    version: VERSION,
    maxAnimators: MAX_ANIMATORS,
    defaults: clone(STATE_DEFAULTS),
    presets: clone(PRESETS),
    defaultAnimator: defaultAnimator,
    defaultState: defaultState,
    normalizeAnimator: function (raw) { return normalizeAnimator(raw, 0, Object.create(null)); },
    normalizeState: normalizeState,
    activeAnimator: activeAnimator,
    selectorWeight: selectorWeight,
    evaluateAnimator: evaluateAnimator,
    evaluateStack: evaluateStack,
    applyPreset: applyPreset
  };

  root.TypeDeformerTextAnimator = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
