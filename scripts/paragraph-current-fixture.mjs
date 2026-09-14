// Actual editor functions with explicit DOM/layout mocks. Not browser evidence.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

export const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
export function extract(name) {
  const source = html.match(new RegExp('      function ' + name + '\\([^]*?\\n      }'))?.[0];
  assert.ok(source, `editor function ${name}`);
  return source;
}
const objectSource = name => html.match(new RegExp('      var ' + name + ' = \\{[^]*?\\n      };'))?.[0];
const declarationSource = name => html.match(new RegExp('^      var ' + name + ' = .*;$', 'm'))?.[0];
export function fixture(extra = {}) {
  const c = vm.createContext({
    Math, Map, Set, metrics: [], metricsDirty: false, stage: { style: { setProperty(k, v) { this[k] = v; } } }, stageWorld: { style: {} },
    pageLayoutState: { enabled: false, pages: [] }, pageSourceIndex: [],
    compositionState: { enabled: false }, compositionSourceRevision: 0, compositionCanvas: null,
    compositionScene: { width: 1200, height: 900 },
    document: { createElement: () => ({ getContext: () => null }), getElementById: () => null },
    getComputedStyle: el => el.style,
    fontMetrics: () => ({ ascent: 16, descent: 4 }),
    batchProfileForKey: () => c.params,
    invalidateCompositionSource: () => { c.compositionSourceRevision++; c.snapshotGlyphs.cache = null; },
    scheduleCompositionDraw() {}, scheduleSurfaceFxDraw() {}, scheduleVisualOverscan() {},
    isSurfaceOperator: id => !['stretch', 'rotate', 'skew', 'baselineShift', 'paragraphCurrent', 'readingField', 'gutterFugue', 'caesuraField', 'mirror', 'confuse'].includes(id),
    renderSurfaceFxLayer() {}, surfaceReplacementStrength: () => 0,
    orientedCompositionPoint: (x, y) => ({ x, y, rotation: 0 }),
    ...extra
  });
  vm.runInContext(['STRENGTH_MODES', 'EVALUATION_LAYERS', 'OPERATOR_DEFS', 'params'].map(objectSource).join('\n')
    + '\nvar OPERATOR_IDS = Object.keys(OPERATOR_DEFS); var OPERATOR_BY_SHORT = {}; OPERATOR_IDS.forEach(id => OPERATOR_BY_SHORT[OPERATOR_DEFS[id].short] = id);', c);
  const emptyOperatorStateSource = declarationSource('EMPTY_OPERATOR_STATE');
  assert.ok(emptyOperatorStateSource, 'editor declaration EMPTY_OPERATOR_STATE');
  vm.runInContext(emptyOperatorStateSource + '\n' + ['readingLayoutFrame', 'parameterDisabledReasons', 'updateParameterRowAvailability',
    'setParameterDisabledReason', 'setParameterAvailabilityStatus', 'syncFormFieldAvailability', 'syncParagraphCurrentUI', 'readingScopeAvailable', 'syncReadingScopeUI',
    'gutterFugueAvailable', 'syncGutterFugueUI', 'syncCaesuraFieldUI', 'planPageRows', 'applyPageLayout', 'buildPageSourceIndex', 'sourcePageContext', 'layoutContextLabel', 'updateLayoutSelectionUI',
    'captureContextPages', 'capturePageSourceRange', 'captureSourceLayoutTarget', 'captureCanvasLayoutTarget',
    'updatePageLayoutUI', 'paragraphFrameKey', 'buildParagraphCurrentFrames', 'paragraphCurrentSample', 'paragraphCurrentStrength',
    'applyParagraphCurrentVisual', 'buildReadingFieldFrames', 'readingFieldAxis', 'readingFieldSample', 'readingFieldStrength', 'applyReadingFieldVisual',
    'buildGutterFugueFrames', 'gutterFugueRole', 'gutterFugueStrength', 'gutterFugueValues', 'applyGutterFugueVisual',
    'caesuraPunctuationStrength', 'caesuraClosingMark', 'caesuraSourceAdjacent', 'caesuraBoundaryStrength', 'buildCaesuraFieldFrames', 'caesuraFieldStrength', 'caesuraFieldValues', 'applyCaesuraFieldVisual',
    'createOperatorState', 'createOperatorStates', 'readOperatorState', 'operatorState', 'numericManual', 'pairManual',
    'surfaceOperatorStrength', 'hasVisibleSurfaceOperator', 'cssNumber', 'hasVisibleOperatorDeform', 'snapshotGlyphs', 'measureLayout',
    'glyphLinearMatrix', 'findNearestLetter', 'clampFinite', 'normalizeOperatorManual', 'cloneManualValue',
    'sparseOperatorState', 'restoreOperatorStates', 'encodeOperatorStates', 'decodeOperatorStates',
    'manualValueAtDragStart', 'compositionGlyph', 'applyTextMeasure', 'applyParagraphSpacing', 'drawGlyphs', 'drawSurfaceGlyph', 'baselineOffset',
    'formFieldContext', 'formFieldSignal'
  ].map(extract).join('\n'), c);
  return c;
}

export function metric(c, x, y, { width = 20, height = 30, paragraph = 0, text = 'A' } = {}) {
  const values = new Map();
  const style = { opacity: '1', setProperty: (k, v) => values.set(k, String(v)),
    getPropertyValue: k => values.get(k) || '', removeProperty: k => values.delete(k) };
  const el = { style, dataset: { line: String(paragraph), sourceText: text, upright: '1' }, textContent: text,
    offsetWidth: width, offsetHeight: height, offsetLeft: x, offsetTop: y, offsetParent: c.stage };
  return { el, w: width, h: height, relX: x + width / 2, relY: y + height / 2,
    batchKey: 'latin', operatorStates: c.createOperatorStates(), locked: false };
}
export function apply(c, strength = 1) {
  c.buildParagraphCurrentFrames(c.metrics, c.params.vertical);
  for (const m of c.metrics) {
    const state = c.operatorState(m, 'paragraphCurrent');
    state.current = strength;
    state.toggled = strength > 0;
    c.applyParagraphCurrentVisual(m, c.params);
  }
  c.invalidateCompositionSource();
}
