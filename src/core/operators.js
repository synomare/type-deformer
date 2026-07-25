// The operator registry and the pure codec used by undo snapshots and
// share links. Layer order is evaluation order.

/* ---------------- state ---------------- */
// Operators are deliberately data, not branches scattered through the UI.
// Layer order is evaluation order; operators may only be reordered
// inside their own layer. Every operator accepts strength 0..1 under one
// of the four contracts, while direction/sign stays in its target value.
var STRENGTH_MODES = {
  CONTINUOUS: 'continuous',
  STEPPED: 'stepped',
  STOCHASTIC: 'stochastic',
  STRUCTURAL: 'structural'
};

var EVALUATION_LAYERS = {
  codepoint: 0, glyph: 1, stroke: 2, box: 3,
  layout: 4, relation: 5, ink: 6
};

/** @typedef {{id:string, short:string, label:string, layer:string, layerOrder:number, order:number, strengthMode:string}} OperatorDefinition */
/** @type {Object.<string, OperatorDefinition>} */
var OPERATOR_DEFS = {
  confuse: { id: 'confuse', short: 'c', label: 'Confuse', layer: 'codepoint', layerOrder: EVALUATION_LAYERS.codepoint, order: 5, strengthMode: STRENGTH_MODES.STEPPED },
  stretch: { id: 'stretch', short: 's', label: 'Stretch', layer: 'box', layerOrder: EVALUATION_LAYERS.box, order: 10, strengthMode: STRENGTH_MODES.CONTINUOUS },
  rotate: { id: 'rotate', short: 'r', label: 'Rotate', layer: 'box', layerOrder: EVALUATION_LAYERS.box, order: 20, strengthMode: STRENGTH_MODES.CONTINUOUS },
  skew: { id: 'skew', short: 'k', label: 'Skew', layer: 'box', layerOrder: EVALUATION_LAYERS.box, order: 30, strengthMode: STRENGTH_MODES.CONTINUOUS },
  baselineShift: { id: 'baselineShift', short: 'b', label: 'Baseline Shift', layer: 'box', layerOrder: EVALUATION_LAYERS.box, order: 40, strengthMode: STRENGTH_MODES.CONTINUOUS },
  mirror: { id: 'mirror', short: 'm', label: 'Mirror', layer: 'box', layerOrder: EVALUATION_LAYERS.box, order: 50, strengthMode: STRENGTH_MODES.CONTINUOUS },
  misregistration: { id: 'misregistration', short: 'p', label: 'Misregistration', layer: 'ink', layerOrder: EVALUATION_LAYERS.ink, order: 60, strengthMode: STRENGTH_MODES.CONTINUOUS }
};

var OPERATOR_IDS = Object.keys(OPERATOR_DEFS).sort(function (a, b) {
  return OPERATOR_DEFS[a].layerOrder - OPERATOR_DEFS[b].layerOrder || OPERATOR_DEFS[a].order - OPERATOR_DEFS[b].order;
});

var OPERATOR_BY_SHORT = OPERATOR_IDS.reduce(function (map, id) {
  map[OPERATOR_DEFS[id].short] = id;
  return map;
}, {});

function clampFinite(value, min, max, fallback) {
  value = Number(value);
  if (!isFinite(value)) value = fallback;
  return Math.max(min, Math.min(max, value));
}

/* ---------------- per-letter state restore (undo / project load) ---------------- */
function cloneManualValue(value) {
  if (value == null) return null;
  if (typeof value === 'object') return { x: Number(value.x) || 0, y: Number(value.y) || 0 };
  return Number(value) || 0;
}

// Project/Share data is user-editable input. Enforce the same bounds as
// Edit gestures before a restored value can reach a CSS transform.
function normalizeOperatorManual(id, value) {
  if (id === 'confuse') return clampFinite(value, 0, 1, 0);
  if (id === 'rotate') return clampFinite(value, -360, 360, 0);
  if (id === 'baselineShift') return clampFinite(value, -5, 5, 0);
  var pair = value && typeof value === 'object' ? value : {};
  if (id === 'skew') return { x: clampFinite(pair.x, -85, 85, 0), y: clampFinite(pair.y, -85, 85, 0) };
  if (id === 'mirror') return { x: clampFinite(pair.x, -1, 1, 1), y: clampFinite(pair.y, -1, 1, 1) };
  if (id === 'misregistration') return { x: clampFinite(pair.x, -120, 120, 0), y: clampFinite(pair.y, -120, 120, 0) };
  return null;
}

// Takes the per-operator state map rather than the metric it normally lives
// on, so the codec stays independent of the editor's object graph.
function encodeOperatorStates(states) {
  var rows = [];
  for (var i = 0; i < OPERATOR_IDS.length; i++) {
    var id = OPERATOR_IDS[i];
    if (id === 'stretch') continue;
    var state = (states && states[id]) || { toggled: false, current: 0, manual: null };
    if (!state.toggled && state.current < 0.0005 && state.manual == null) continue;
    var manual = '';
    if (state.manual != null) {
      manual = typeof state.manual === 'object'
        ? Math.round((Number(state.manual.x) || 0) * 1000) + '@' + Math.round((Number(state.manual.y) || 0) * 1000)
        : String(Math.round((Number(state.manual) || 0) * 1000));
    }
    rows.push(OPERATOR_DEFS[id].short + ':' + (state.toggled ? 1 : 0) + ':' + Math.round(state.current * 1000) + ':' + manual);
  }
  return rows.join('~');
}

function decodeOperatorStates(encoded) {
  var result = {};
  if (!encoded || typeof encoded !== 'string') return result;
  var rows = encoded.split('~');
  for (var i = 0; i < rows.length; i++) {
    var fields = rows[i].split(':');
    var id = OPERATOR_BY_SHORT[fields[0]];
    if (!id || id === 'stretch') continue;
    var saved = { t: +fields[1] ? 1 : 0, i: Math.max(0, Math.min(1, (+fields[2] || 0) / 1000)) };
    if (fields[3]) {
      if (fields[3].indexOf('@') !== -1) {
        var pair = fields[3].split('@');
        saved.m = { x: (+pair[0] || 0) / 1000, y: (+pair[1] || 0) / 1000 };
      } else saved.m = (+fields[3] || 0) / 1000;
    }
    result[id] = saved;
  }
  return result;
}

export {
  STRENGTH_MODES,
  EVALUATION_LAYERS,
  OPERATOR_DEFS,
  OPERATOR_IDS,
  OPERATOR_BY_SHORT,
  clampFinite,
  cloneManualValue,
  normalizeOperatorManual,
  encodeOperatorStates,
  decodeOperatorStates
};
