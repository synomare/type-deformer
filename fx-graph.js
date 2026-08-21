(function (global) {
  'use strict';

  var engine = global.TypeDeformerTextAnimator;
  if (!engine) throw new Error('Text Animator must load before fx-graph.js');
  if (engine.fxGraph) return;

  var TYPES = ['blur', 'glow', 'chromaticSplit', 'threshold'];
  var MAX_NODES = 12;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function finite(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function safeId(value, fallback) {
    return typeof value === 'string' && value ? value.slice(0, 80) : fallback;
  }

  function safeName(value, fallback) {
    return typeof value === 'string' && value.trim()
      ? value.trim().slice(0, 40) : fallback;
  }

  function normalizeColor(value, fallback) {
    var text = typeof value === 'string' ? value.trim() : '';
    return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : fallback;
  }

  function typeLabel(type) {
    if (type === 'chromaticSplit') return 'Chromatic Split';
    if (type === 'threshold') return 'Threshold';
    if (type === 'glow') return 'Glow';
    return 'Blur';
  }

  function defaultNode(type, id) {
    var nodeType = TYPES.indexOf(type) >= 0 ? type : 'blur';
    return {
      id: safeId(id, 'fx-1'),
      type: nodeType,
      name: typeLabel(nodeType),
      enabled: true,
      mix: 1,
      radius: nodeType === 'glow' ? 18 : nodeType === 'blur' ? 6 : 0,
      strength: nodeType === 'glow' ? 1.4 : 1,
      color: '#ffffff',
      amount: nodeType === 'chromaticSplit' ? 12 : 0,
      angle: 0,
      level: 0.5,
      softness: 0.06,
      unsupported: false
    };
  }

  function cloneUnknown(raw) {
    try { return JSON.parse(JSON.stringify(raw)); }
    catch (error) { return {}; }
  }

  function normalizeNode(raw, index) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var rawType = typeof raw.type === 'string' ? raw.type.slice(0, 80) : 'blur';
    var known = TYPES.indexOf(rawType) >= 0;
    if (!known) {
      return {
        id: safeId(raw.id, 'fx-' + (index + 1)),
        type: rawType || 'unknown',
        name: safeName(raw.name, rawType || 'Unknown effect'),
        enabled: false,
        mix: clamp(finite(raw.mix, 1), 0, 1),
        radius: 0,
        strength: 1,
        color: '#ffffff',
        amount: 0,
        angle: 0,
        level: 0.5,
        softness: 0.06,
        unsupported: true,
        passthrough: cloneUnknown(raw)
      };
    }
    var fallback = defaultNode(rawType, 'fx-' + (index + 1));
    return {
      id: safeId(raw.id, fallback.id),
      type: rawType,
      name: safeName(raw.name, fallback.name),
      enabled: raw.enabled !== false,
      mix: clamp(finite(raw.mix, fallback.mix), 0, 1),
      radius: clamp(finite(raw.radius, fallback.radius), 0, 100),
      strength: clamp(finite(raw.strength, fallback.strength), 0, 8),
      color: normalizeColor(raw.color, fallback.color),
      amount: clamp(finite(raw.amount, fallback.amount), 0, 160),
      angle: clamp(finite(raw.angle, fallback.angle), -180, 180),
      level: clamp(finite(raw.level, fallback.level), 0, 1),
      softness: clamp(finite(raw.softness, fallback.softness), 0.001, 0.5),
      unsupported: false
    };
  }

  function normalizeGraph(raw) {
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

  function operation(node, input, output, index) {
    var prefix = 'fx' + index;
    if (node.type === 'blur') {
      return {
        type: 'blur', input: input, output: output,
        effect: prefix + '-blur', radius: node.radius,
        mix: node.mix
      };
    }
    if (node.type === 'glow') {
      return {
        type: 'glow', input: input, output: output,
        alpha: prefix + '-alpha', amplified: prefix + '-amplified',
        flood: prefix + '-flood', tinted: prefix + '-tinted', effect: prefix + '-glow',
        radius: node.radius, strength: node.strength, color: node.color, mix: node.mix
      };
    }
    if (node.type === 'chromaticSplit') {
      var radians = node.angle * Math.PI / 180;
      var dx = Math.cos(radians) * node.amount;
      var dy = Math.sin(radians) * node.amount;
      return {
        type: 'chromaticSplit', input: input, output: output,
        red: prefix + '-red', cyan: prefix + '-cyan',
        redOffset: prefix + '-red-offset', cyanOffset: prefix + '-cyan-offset',
        effect: prefix + '-split', dx: dx, dy: dy, mix: node.mix
      };
    }
    return {
      type: 'threshold', input: input, output: output,
      effect: prefix + '-threshold', level: node.level,
      softness: node.softness, mix: node.mix
    };
  }

  function buildPlan(graphInput) {
    var graph = normalizeGraph(graphInput);
    var operations = [];
    var input = 'SourceGraphic';
    if (graph.enabled) {
      for (var i = 0; i < graph.nodes.length; i++) {
        var node = graph.nodes[i];
        if (!node.enabled || node.unsupported || node.mix <= 0) continue;
        var output = 'fx' + i + '-out';
        operations.push(operation(node, input, output, i));
        input = output;
      }
    }
    return { graph: graph, operations: operations, output: input };
  }

  function svgElement(documentRef, name, attributes) {
    var element = documentRef.createElementNS(SVG_NS, name);
    var keys = Object.keys(attributes || {});
    for (var i = 0; i < keys.length; i++) {
      element.setAttribute(keys[i], String(attributes[keys[i]]));
    }
    return element;
  }

  function appendMix(documentRef, filter, operation) {
    filter.appendChild(svgElement(documentRef, 'feComposite', {
      in: operation.input,
      in2: operation.effect,
      operator: 'arithmetic',
      k1: 0,
      k2: 1 - operation.mix,
      k3: operation.mix,
      k4: 0,
      result: operation.output
    }));
  }

  function appendOperation(documentRef, filter, operation) {
    if (operation.type === 'blur') {
      filter.appendChild(svgElement(documentRef, 'feGaussianBlur', {
        in: operation.input,
        stdDeviation: operation.radius,
        result: operation.effect
      }));
      appendMix(documentRef, filter, operation);
      return;
    }

    if (operation.type === 'glow') {
      filter.appendChild(svgElement(documentRef, 'feGaussianBlur', {
        in: 'SourceAlpha',
        stdDeviation: operation.radius,
        result: operation.alpha
      }));
      var amplified = svgElement(documentRef, 'feComponentTransfer', {
        in: operation.alpha,
        result: operation.amplified
      });
      amplified.appendChild(svgElement(documentRef, 'feFuncA', {
        type: 'linear', slope: operation.strength, intercept: 0
      }));
      filter.appendChild(amplified);
      filter.appendChild(svgElement(documentRef, 'feFlood', {
        'flood-color': operation.color,
        'flood-opacity': 1,
        result: operation.flood
      }));
      filter.appendChild(svgElement(documentRef, 'feComposite', {
        in: operation.flood,
        in2: operation.amplified,
        operator: 'in',
        result: operation.tinted
      }));
      filter.appendChild(svgElement(documentRef, 'feBlend', {
        in: operation.input,
        in2: operation.tinted,
        mode: 'screen',
        result: operation.effect
      }));
      appendMix(documentRef, filter, operation);
      return;
    }

    if (operation.type === 'chromaticSplit') {
      filter.appendChild(svgElement(documentRef, 'feColorMatrix', {
        in: operation.input,
        type: 'matrix',
        values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
        result: operation.red
      }));
      filter.appendChild(svgElement(documentRef, 'feColorMatrix', {
        in: operation.input,
        type: 'matrix',
        values: '0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0',
        result: operation.cyan
      }));
      filter.appendChild(svgElement(documentRef, 'feOffset', {
        in: operation.red, dx: operation.dx, dy: operation.dy,
        result: operation.redOffset
      }));
      filter.appendChild(svgElement(documentRef, 'feOffset', {
        in: operation.cyan, dx: -operation.dx, dy: -operation.dy,
        result: operation.cyanOffset
      }));
      filter.appendChild(svgElement(documentRef, 'feBlend', {
        in: operation.redOffset,
        in2: operation.cyanOffset,
        mode: 'screen',
        result: operation.effect
      }));
      appendMix(documentRef, filter, operation);
      return;
    }

    var slope = 1 / Math.max(0.001, operation.softness);
    var intercept = 0.5 - operation.level * slope;
    var transfer = svgElement(documentRef, 'feComponentTransfer', {
      in: operation.input,
      result: operation.effect
    });
    ['R', 'G', 'B'].forEach(function (channel) {
      transfer.appendChild(svgElement(documentRef, 'feFunc' + channel, {
        type: 'linear', slope: slope, intercept: intercept
      }));
    });
    transfer.appendChild(svgElement(documentRef, 'feFuncA', { type: 'identity' }));
    filter.appendChild(transfer);
    appendMix(documentRef, filter, operation);
  }

  function renderSvgFilter(filterElement, graphInput) {
    if (!filterElement || !filterElement.ownerDocument) return buildPlan(graphInput);
    var plan = buildPlan(graphInput);
    while (filterElement.firstChild) filterElement.removeChild(filterElement.firstChild);
    filterElement.setAttribute('x', '-100%');
    filterElement.setAttribute('y', '-100%');
    filterElement.setAttribute('width', '300%');
    filterElement.setAttribute('height', '300%');
    filterElement.setAttribute('color-interpolation-filters', 'sRGB');
    for (var i = 0; i < plan.operations.length; i++) {
      appendOperation(filterElement.ownerDocument, filterElement, plan.operations[i]);
    }
    return plan;
  }

  var previousNormalizeState = engine.normalizeState;
  var previousApplyPreset = engine.applyPreset;

  engine.normalizeState = function (input) {
    var normalized = previousNormalizeState(input);
    normalized.fxGraph = normalizeGraph(input && input.fxGraph);
    return normalized;
  };

  engine.applyPreset = function (state, presetName, animatorId) {
    var before = engine.normalizeState(state);
    var graph = before.fxGraph;
    var applied = previousApplyPreset(before, presetName, animatorId);
    applied.fxGraph = graph;
    return engine.normalizeState(applied);
  };

  engine.fxGraph = Object.freeze({
    types: TYPES.slice(),
    maxNodes: MAX_NODES,
    defaultNode: defaultNode,
    normalizeNode: normalizeNode,
    normalizeGraph: normalizeGraph,
    buildPlan: buildPlan,
    renderSvgFilter: renderSvgFilter,
    typeLabel: typeLabel
  });
})(typeof window !== 'undefined' ? window : globalThis);
