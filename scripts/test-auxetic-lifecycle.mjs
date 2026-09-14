import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const block = html.match(/^      \/\/ BEGIN AUXETIC TYPE GENERATED\n[\s\S]*?^      \/\/ END AUXETIC TYPE GENERATED/m)?.[0];
assert.ok(block, 'embedded Auxetic runtime');

const elements = new Map();
const rafs = new Map();
let raf = 0;
let fx = 1;
const params = {
  fontFamily: 'Synthetic', fontWeight: 400, fontSize: 192,
  auxeticOpening: 28, auxeticModule: 24, auxeticAspect: 1,
  auxeticAxis: 0, auxeticLigament: .75, auxeticMotion: .65
};
const runtime = vm.createContext({
  params, studioRendererMode: false, compositionState: { enabled: false, phase: 0 }, metrics: [],
  surfaceGlyphStrength: (g, id) => g.surface?.[id] || 0,
  surfaceOperatorStrength: (g, id) => g.surface?.[id] || 0,
  surfaceOutputOpacity: () => fx,
  surfaceEffectColor: () => '#000',
  drawSurfaceGlyph() {}, scheduleSurfaceFxDraw() {}, scheduleCompositionDraw() {},
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { hidden: false, value: 0, textContent: '', setAttribute() {} });
      return elements.get(id);
    }
  },
  requestAnimationFrame(fn) { rafs.set(++raf, fn); return raf; },
  cancelAnimationFrame(id) { rafs.delete(id); },
  editableBatchProfile: () => params, pushHistory() {}, refreshBatchProfileControls() {},
  applyAllOperatorVisuals() {}, markAutosaveDirty() {}
});
new vm.Script(block).runInContext(runtime);

const source = [{ points: [{ x: 0, y: -80 }, { x: 70, y: -80 }, { x: 70, y: 0 }, { x: 0, y: 0 }] }];
const settings = runtime.AuxeticType.normalizeAuxeticSettings({
  opening: 28, module: 24, aspect: 1, axis: 0, ligament: .75, motion: .65
});
const glyph = runtime.AuxeticType.prepareAuxeticGlyph(source);
const compiled = runtime.AuxeticType.compileAuxeticGlyph(glyph, settings);
const data = { compiled, pointCount: glyph.pointCount + compiled.pointCount, advance: 70, ascent: 80, descent: 0, middleOffset: 40 };
let sourceFailure = false;
runtime.auxeticGlyphData = ch => {
  if (ch === 'bad' && sourceFailure) throw new Error('transient source failure');
  return data;
};
const makeGlyph = ch => ({ ch, surface: { auxeticType: 1 }, opacity: 1, scaleX: 1, scaleY: 1 });
const a = makeGlyph('A');
const b = makeGlyph('B');

runtime.auxeticPrepare([a, b]);
runtime.auxeticPool.advance();
runtime.auxeticPool.advance();
const before = JSON.stringify(runtime.auxeticPool.state());
runtime.auxeticAssertReady([a]);
assert.equal(JSON.stringify(runtime.auxeticPool.state()), before, 'subset export readiness does not evict another active source');
assert.equal(runtime.auxeticPool.read(runtime.auxeticSourceKey('B', runtime.auxeticGlyphSettings(b))), data);
assert.throws(() => runtime.auxeticAssertReady([makeGlyph('missing')]), error => error.code === 'AUXETIC_PENDING');
assert.equal(JSON.stringify(runtime.auxeticPool.state()), before, 'missing export source does not mutate live requests');

runtime.auxeticRenderError = 'old preview failed';
assert.doesNotThrow(() => runtime.auxeticAssertReady([a]), 'stale preview errors cannot veto a fresh strict render');
runtime.auxeticPrepare([]);
assert.equal(runtime.auxeticPool.state().total, 0);
assert.equal(rafs.size, 0);
assert.equal(runtime.auxeticRenderError, '');
assert.equal(elements.get('auxeticWorkStatus').hidden, true);

params.auxeticOpening = 0;
assert.equal(runtime.auxeticRequests([a]).length, 0, 'native opening allocates no source');
assert.doesNotThrow(() => runtime.auxeticAssertReady([a]));
params.auxeticOpening = 28;
fx = 0;
assert.equal(runtime.auxeticRequests([a]).length, 0, 'muted Auxetic output allocates no source');
assert.doesNotThrow(() => runtime.auxeticAssertReady([a]));
assert.equal(runtime.auxeticEffectPad([a]), 0, 'muted output adds no canvas pad');
fx = 1;

sourceFailure = true;
runtime.auxeticPrepare([makeGlyph('bad'), a]);
runtime.auxeticPool.advance();
runtime.auxeticPool.advance();
assert.doesNotThrow(() => runtime.auxeticAssertReady([a]), 'unrelated failed sources do not block a ready subset');
assert.throws(() => runtime.auxeticAssertReady([makeGlyph('bad')]), error => error.code === 'AUXETIC_ERROR');
sourceFailure = false;
runtime.auxeticRetry();
runtime.auxeticPool.advance();
runtime.auxeticAssertReady([a, makeGlyph('bad')]);

const pad1 = runtime.auxeticEffectPad([a]);
const pad2 = runtime.auxeticEffectPad([{ ...a, scaleX: 2, skewX: 25 }]);
assert.ok(Number.isFinite(pad1) && pad1 >= 0, 'prepared Auxetic bounds are finite');
assert.ok(pad2 >= pad1, 'larger transformed glyph does not under-report its canvas pad');

const extract = name => html.match(new RegExp('^      function ' + name + '\\([\\s\\S]*?^      \\}', 'm'))?.[0];
Object.assign(runtime, {
  surfaceFxCtx: { setTransform() {}, clearRect() {} }, differentialPrepare() {}, conformalPrepare() {}, counterformResetInactive() {}, marblingPrepare() {},
  blobTrackState: { blobs: [] }, window: { matchMedia: () => ({ matches: false }) },
  surfaceFxLastPaint: 0, surfaceFxCanvas: { hidden: false, width: 10, height: 10 }
});
new vm.Script(extract('renderSurfaceFxPreview')).runInContext(runtime);
runtime.metrics = [];
runtime.renderSurfaceFxPreview(0);
assert.equal(runtime.auxeticPool.state().total, 0, 'empty-text preview releases Auxetic work');

runtime.auxeticPrepare([a]);
runtime.metrics = [a];
Object.assign(runtime, {
  metricsDirty: false, snapshotGlyphs: () => [a], surfaceAnyEffectPresent: () => false,
  surfaceEffectPresent: () => false, surfaceAggregate: () => ({ value: 0 })
});
runtime.renderSurfaceFxPreview(0);
assert.equal(runtime.auxeticPool.state().total, 0, 'no-active-FX preview releases Auxetic work');
assert.equal(runtime.surfaceFxCanvas.hidden, true);
assert.equal(rafs.size, 0);

console.log('Auxetic lifecycle: read-only subset/missing export preflight, native and muted bypass, bounds, stale-error isolation, retry, release/cancel/status passed (VM/mocks, not browser).');
