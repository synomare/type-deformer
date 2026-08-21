(function (global) {
  'use strict';

  var engine = global.TypeDeformerTextAnimator;
  if (!engine) throw new Error('Text Animator must load before deformer-engine.js');
  if (engine.deformers) return;

  var TYPES = ['bend', 'arc', 'wave'];
  var AXES = ['x', 'y'];
  var MAX_NODES = 8;

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

  function defaultNode(type, id) {
    var nodeType = TYPES.indexOf(type) >= 0 ? type : 'bend';
    return {
      id: typeof id === 'string' && id ? id : 'deformer-1',
      type: nodeType,
      name: nodeType === 'bend' ? 'Bend' : nodeType === 'arc' ? 'Arc' : 'Wave',
      enabled: true,
      axis: 'y',
      amount: nodeType === 'wave' ? 48 : 90,
      origin: 0.5,
      frequency: nodeType === 'wave' ? 2 : 1,
      phase: 0,
      speed: nodeType === 'wave' ? 1 : 0,
      falloff: 0.25,
      mix: 1
    };
  }

  function normalizeNode(raw, index) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var type = TYPES.indexOf(raw.type) >= 0 ? raw.type : 'bend';
    var fallback = defaultNode(type, 'deformer-' + (index + 1));
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 80) : fallback.id,
      type: type,
      name: typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim().slice(0, 40) : fallback.name,
      enabled: raw.enabled !== false,
      axis: AXES.indexOf(raw.axis) >= 0 ? raw.axis : fallback.axis,
      amount: clamp(finite(raw.amount, fallback.amount), -720, 720),
      origin: clamp(finite(raw.origin, fallback.origin), 0, 1),
      frequency: clamp(finite(raw.frequency, fallback.frequency), 0.05, 24),
      phase: clamp(finite(raw.phase, fallback.phase), -8, 8),
      speed: clamp(finite(raw.speed, fallback.speed), -8, 8),
      falloff: clamp(finite(raw.falloff, fallback.falloff), 0, 1),
      mix: clamp(finite(raw.mix, fallback.mix), 0, 1)
    };
  }

  function normalizeStack(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var source = Array.isArray(raw.nodes) ? raw.nodes.slice(0, MAX_NODES) : [];
    var ids = Object.create(null);
    var nodes = source.map(function (node, index) {
      var normalized = normalizeNode(node, index);
      var base = normalized.id;
      var suffix = 1;
      while (ids[normalized.id]) normalized.id = base + '-' + suffix++;
      ids[normalized.id] = true;
      return normalized;
    });
    var activeNodeId = typeof raw.activeNodeId === 'string' ? raw.activeNodeId : '';
    if (!nodes.some(function (node) { return node.id === activeNodeId; })) {
      activeNodeId = nodes.length ? nodes[0].id : '';
    }
    return {
      enabled: raw.enabled !== false && nodes.length > 0,
      activeNodeId: activeNodeId,
      nodes: nodes
    };
  }

  function envelope(u, falloff) {
    var edge = Math.sin(Math.PI * clamp(u, 0, 1));
    return (1 - falloff) + falloff * Math.max(0, edge);
  }

  function layoutCoordinate(item, index, total, maxLine) {
    item = item && typeof item === 'object' ? item : {};
    var sequence = finite(item.indexInLine,
      finite(item.characterIndex,
        finite(item.index, index)));
    var sequenceTotal = finite(item.lineLength, finite(item.totalInLine, total));
    var u = sequenceTotal > 1 ? sequence / (sequenceTotal - 1) : (total > 1 ? index / (total - 1) : 0.5);
    var line = finite(item.lineIndex, finite(item.line, 0));
    var v = maxLine > 0 ? line / maxLine : 0.5;
    return { u: clamp(u, 0, 1), v: clamp(v, 0, 1) };
  }

  function applyBend(point, node, span) {
    var centered = (point.u - node.origin) * 2;
    var influence = envelope(point.u, node.falloff) * node.mix;
    var amount = node.amount * influence;
    var curve = centered * centered * (centered < 0 ? -1 : 1);
    var displacement = amount * curve;
    var slope = amount * 6 * centered / Math.max(1, span);
    if (node.axis === 'x') point.u += displacement / span;
    else point.v += displacement / span;
    point.rotation += Math.atan(slope) * 180 / Math.PI * (node.axis === 'x' ? -1 : 1);
  }

  function applyArc(point, node, span) {
    var centered = (point.u - node.origin) * 2;
    var influence = envelope(point.u, node.falloff) * node.mix;
    var radians = node.amount * Math.PI / 180 * centered * influence;
    var radius = span / Math.max(0.1, Math.abs(node.amount) * Math.PI / 180);
    var direction = node.amount < 0 ? -1 : 1;
    var along = Math.sin(radians) * radius / span;
    var across = (1 - Math.cos(radians)) * radius / span * direction;
    var originU = node.origin;
    point.u = originU + along * 0.5;
    if (node.axis === 'x') point.u += across;
    else point.v += across;
    point.rotation += radians * 180 / Math.PI * (node.axis === 'x' ? -1 : 1);
  }

  function applyWave(point, node, span, phase) {
    var influence = envelope(point.u, node.falloff) * node.mix;
    var angle = Math.PI * 2 * (
      point.u * node.frequency + node.phase + phase * node.speed
    );
    var displacement = Math.sin(angle) * node.amount * influence;
    var derivative = Math.cos(angle) * node.amount * node.frequency * Math.PI * 2 / Math.max(1, span);
    if (node.axis === 'x') point.u += displacement / span;
    else point.v += displacement / span;
    point.rotation += Math.atan(derivative) * 180 / Math.PI * (node.axis === 'x' ? -1 : 1);
  }

  function evaluate(stackInput, items, phase) {
    var stack = normalizeStack(stackInput);
    var list = Array.isArray(items) ? items : [];
    var total = list.length;
    var maxLine = 0;
    for (var l = 0; l < total; l++) {
      var sourceLine = list[l] && (list[l].lineIndex != null ? list[l].lineIndex : list[l].line);
      var line = finite(sourceLine, 0);
      if (line > maxLine) maxLine = line;
    }
    var span = clamp(total * 28, 240, 1800);
    var samplePhase = phase01(phase);
    var output = new Array(total);

    for (var i = 0; i < total; i++) {
      var original = layoutCoordinate(list[i], i, total, maxLine);
      var point = { u: original.u, v: original.v, rotation: 0 };
      if (stack.enabled) {
        for (var n = 0; n < stack.nodes.length; n++) {
          var node = stack.nodes[n];
          if (!node.enabled || node.mix <= 0) continue;
          if (node.type === 'arc') applyArc(point, node, span);
          else if (node.type === 'wave') applyWave(point, node, span, samplePhase);
          else applyBend(point, node, span);
        }
      }
      output[i] = {
        x: (point.u - original.u) * span,
        y: (point.v - original.v) * span,
        rotation: point.rotation,
        scaleX: 1,
        scaleY: 1
      };
    }
    return output;
  }

  var previousNormalizeState = engine.normalizeState;
  var previousEvaluateStack = engine.evaluateStack;
  var previousApplyPreset = engine.applyPreset;

  engine.normalizeState = function (input) {
    var normalized = previousNormalizeState(input);
    normalized.deformers = normalizeStack(input && input.deformers);
    return normalized;
  };

  engine.evaluateStack = function (state, items, phase) {
    var normalized = engine.normalizeState(state);
    var samplePhase = phase == null ? normalized.phase : phase;
    var base = previousEvaluateStack(normalized, items, samplePhase);
    var deformation = evaluate(normalized.deformers, items, samplePhase);
    for (var i = 0; i < base.length; i++) {
      base[i].x += deformation[i].x;
      base[i].y += deformation[i].y;
      base[i].rotation += deformation[i].rotation;
      base[i].scaleX *= deformation[i].scaleX;
      base[i].scaleY *= deformation[i].scaleY;
    }
    return base;
  };

  engine.applyPreset = function (state, presetName, animatorId) {
    var before = engine.normalizeState(state);
    var stack = before.deformers;
    var applied = previousApplyPreset(before, presetName, animatorId);
    applied.deformers = stack;
    return engine.normalizeState(applied);
  };

  engine.deformers = Object.freeze({
    types: TYPES.slice(),
    maxNodes: MAX_NODES,
    defaultNode: defaultNode,
    normalizeNode: normalizeNode,
    normalizeStack: normalizeStack,
    evaluate: evaluate,
    phase01: phase01
  });
})(typeof window !== 'undefined' ? window : globalThis);
