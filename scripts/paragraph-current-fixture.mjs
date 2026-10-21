import {createAuthoredTestContext} from './authored-test-context.mjs';
// Actual editor functions with explicit DOM/layout mocks. Not browser evidence.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readAuthoredUnits, readPageMarkup, extractDeclaredFunction} from './source-reader.mjs';

const authoredUnits = readAuthoredUnits();
export const authoredSource = authoredUnits.map(unit=>unit.source).join('\n\n');
export const markup = readPageMarkup();
export function extract(name) {
  return extractDeclaredFunction(authoredUnits, name);
}
const objectSource = name => authoredSource.match(new RegExp('      var ' + name + ' = \\{[^]*?\\n      };'))?.[0];
const declarationSource = name => authoredSource.match(new RegExp('^      var ' + name + ' = .*;$', 'm'))?.[0];
export function fixture(extra = {}) {
  const c = createAuthoredTestContext({
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
  vm.runInContext(fs.readFileSync(new URL('../operator-registry.js', import.meta.url), 'utf8'), c);
  vm.runInContext(fs.readFileSync(new URL('../text-layout.js', import.meta.url), 'utf8'), c);
  // Explicit synthetic adapter: these tests supply native/synthetic boxes,
  // not a browser DOM. Browser-run shaping is covered by text-layout.spec.js.
  c.TypeDeformerTextLayout = { ...c.TypeDeformerTextLayout, measure() {
    return { version: 1, engine: 'synthetic-fixture', boxes: c.metrics.map(m => {
      const el = m.el;
      let x = 0, y = 0, node = el;
      while (node && node !== c.stage) { x += node.offsetLeft || 0; y += node.offsetTop || 0; node = node.offsetParent; }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight, direction:'ltr' };
    }) };
  } };
  Object.defineProperty(c, 'letters', { get: () => c.metrics.map(m => m.el) });
  vm.runInContext(fs.readFileSync(new URL('../project-codec.js', import.meta.url), 'utf8'), c);
  vm.runInContext(fs.readFileSync(new URL('../project-migrations.js', import.meta.url), 'utf8'), c);
  c.documentSession = c.TypeDeformerProjectCodec.session();
  c.OPERATOR_DEFS=c.TypeDeformerOperatorRegistry.tables.OPERATOR_DEFS;
  vm.runInContext(['STRENGTH_MODES', 'EVALUATION_LAYERS', 'params'].map(objectSource).join('\n')
    + '\nvar OPERATOR_IDS = Object.keys(OPERATOR_DEFS); var OPERATOR_BY_SHORT = {}; OPERATOR_IDS.forEach(id => OPERATOR_BY_SHORT[OPERATOR_DEFS[id].short] = id);', c);
  vm.runInContext(fs.readFileSync(new URL('../surface-state.js', import.meta.url), 'utf8'), c);
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
    'surfaceOperatorStrength', 'hasVisibleSurfaceOperator', 'cssNumber', 'hasVisibleOperatorDeform', 'snapshotSurfaceState', 'snapshotGlyphs', 'measureLayout',
    'glyphLinearMatrix', 'findNearestLetter', 'clampFinite', 'normalizeOperatorManual', 'cloneManualValue',
    'sparseOperatorState', 'restoreOperatorStates', 'encodeOperatorStates', 'decodeOperatorStates',
    'manualValueAtDragStart', 'compositionGlyph', 'applyTextMeasure', 'applyParagraphSpacing', 'drawGlyphs', 'surfaceGlyphTextSpec', 'drawSurfaceGlyph', 'baselineOffset',
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
    flowX: x + width / 2, flowY: y + height / 2, layoutBox: { x, y, w: width, h: height, direction: 'ltr' },
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
