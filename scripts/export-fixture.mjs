// Actual output/layout handlers with explicit native Canvas and browser-boundary mocks.
// No browser, CSS layout, font-loading, OS download, or iPhone evidence.
import vm from 'node:vm';
import { canvas } from './thorn-rooted-fixture.mjs';
import { fixture, metric, extract, html } from './paragraph-current-fixture.mjs';
export { canvas, html };
const registeredJapaneseTestFont = canvas.GlobalFonts.registerFromPath('C:/Windows/Fonts/yumin.ttf', 'Yu Mincho');
if (process.platform === 'win32' && !registeredJapaneseTestFont) throw Error('Native Japanese test font unavailable');
export function exportFixture() {
  const downloads = [], statuses = [];
  let allocations = 0;
  const c = fixture({ Blob, isIOS: false, studioRendererMode: false, textComposing: false, textInput: { value: '' },
    document: { getElementById: () => null, createElement(tag) {
      if (tag !== 'canvas') throw Error('Unexpected element: ' + tag);
      allocations++;
      const result = canvas.createCanvas(1, 1); result.dataset = {};
      result.toBlob = callback => callback(new Blob([result.toBuffer('image/png')], { type: 'image/png' }));
      return result;
    } },
    flushPendingTextRebuild() {},
    compositionState: { enabled: false, phase: 0 }, surfaceFxPhase: 0, dataMoshFrame: 0,
    surfaceEffectPad: () => 16, copyTransferEffectPad: () => 0, ribbonLaminaEffectPad: () => 0,
    differentialEffectPad: () => 0, conformalEffectPad: () => 0, auxeticEffectPad: () => 0,
    calligraphyEffectPad: () => 0, marblingEffectPad: () => 0,
    drawSceneBands() {}, surfaceAnyEffectPresent: () => false,
    surfaceEffectPresent: (glyphs, id) => glyphs.some(g => (g.surface?.[id] || 0) > .002),
    surfaceRenderOrder: () => [], surfaceSourceOpacity: () => 1,
    surfaceOutputOpacity: () => 1, surfaceBlendMode: () => 'source-over',
    lookMemory: { slots: [], active: 0 }, LOOK_MEMORY_SLOT_IDS: [],
    persistentCompositionState: () => ({ enabled: false }),
    COMPOSITION_DEFAULTS: { logicalViewport: {} },
    setExportActionStatus: (message, state) => statuses.push({ message, state }),
    download: (blob, filename) => { downloads.push({ blob, filename }); return 'download'; }
  });
  const names = ['contentBounds', 'contextualBounds', 'sceneContentBounds', 'exportLayout', 'compositionExportLayout',
    'exportRegionState', 'prepareExportOutput', 'exportScenePlan', 'exportClipRect', 'clipExportCanvas', 'exportRegionSuffix',
    'rasterOutputDimensions', 'createSafeCanvas', 'previewScaleForLayout', 'renderCanvas', 'snapshotRenderableScene',
    'markSceneRenderClock', 'withSceneRenderClock', 'exportBoundsPad', 'nothingToExport',
    'hasExportDeformation', 'operatorAffectsMetric', 'sculptureUsesIsolatedOutput', 'exportPng', 'exportSvg', 'runSvgExport', 'exportReadyMessage',
    'downloadOutcomeLabel', 'escXml', 'escXmlAttr', 'stamp'];
  if (html.includes('function inspectExport(')) names.push('inspectExport');
  vm.runInContext(names.map(extract).join('\n'), c);
  Object.assign(c.params, { fontFamily: '"Yu Mincho"', fontWeight: 400, fontSize: 18,
    artboard: 'custom', abW: 1200, abH: 1500, anchor: 'cc', fit: true, marginPct: 6,
    deformedOnly: false, exportScale: 1, transparentBg: false });
  c.setSource = (source, kind = 'paragraphCurrent', states = null) => {
    c.textInput.value = source; c.renderedSourceText = source; c.metrics = [];
    let row = 0, column = 0, paragraph = 0;
    for (const ch of source) {
      if (ch === '\n') { row++; column = 0; paragraph++; continue; }
      if (column === 50) { row++; column = 0; }
      const m = metric(c, column++ * 18, row * 30, { width: 18, height: 30, paragraph, text: ch });
      const saved = states?.[c.metrics.length];
      if (saved) {
        c.restoreOperatorStates(m, saved.o);
        m.localParams = saved.p || null;
      } else Object.assign(c.operatorState(m, kind), { current: 1, toggled: true });
      c.metrics.push(m);
    }
    vm.runInContext(extract('sourceParameterProfile'), c);
    c.batchProfileForKey = (key, m) => c.sourceParameterProfile(c.params, m);
    c.buildParagraphCurrentFrames(c.metrics, false); c.buildReadingFieldFrames(c.metrics, false);
    for (const m of c.metrics) {
      const profile = c.batchProfileForKey(m.batchKey, m);
      c.applyParagraphCurrentVisual(m, profile); c.applyReadingFieldVisual(m, profile);
    }
    c.invalidateCompositionSource();
  };
  return { c, downloads, statuses, allocations: () => allocations };
}
