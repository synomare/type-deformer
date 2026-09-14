import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const generated = html.match(/^      \/\/ BEGIN COUNTERFORM ENGINE GENERATED\n[\s\S]*?^      \/\/ END COUNTERFORM ENGINE GENERATED/m)?.[0];
assert.ok(generated, 'embedded Counterform Engine runtime');
const extract = name => {
  const found = html.match(new RegExp('^      function ' + name + '\\([\\s\\S]*?^      \\}', 'm'));
  assert.ok(found, name);
  return found[0];
};

const grammarOptions = ['legacy', 'apertureV29', 'stencilV29', 'trapV29', 'channelV29', 'aperture', 'stencil', 'trap', 'channel'];
const params = { fontWeight: 400, fontFamily: 'Mock Serif', fontSize: 192, seed: 41,
  counterformGrammar: 'aperture', counterformPressure: 3, counterformBridge: 8,
  counterformAperture: .35, counterformAngle: 0, counterformTrap: 8 };
let history = 0;
let autosaves = 0;
let composites = 0;
let paints = 0;
let native = 0;
let variants = [];
let oldCalls = [];
let outputOpacity = 1;
const statusElement = { hidden: true, textContent: '' };
const workContext = { setTransform() {}, clearRect() {} };
const runtime = vm.createContext({
  params,
  document: { getElementById: id => id === 'counterformWorkStatus' ? statusElement : null },
  BATCH_PARAM_OPTIONS: { counterformGrammar: grammarOptions },
  editableBatchProfile: () => params,
  pushHistory: () => history++,
  refreshBatchProfileControls() {},
  applyAllOperatorVisuals() {},
  markAutosaveDirty: () => autosaves++,
  surfaceGlyphStrength: (g, id) => g.surface?.[id] || 0,
  surfaceOutputOpacity: () => outputOpacity,
  surfaceEffectColor: () => '#0b5f57',
  buildSurfaceMask: () => ({}),
  compositeSurfaceSource: () => composites++,
  surfaceScratch: () => ({ ctx: workContext, canvas: {} }),
  paintSurfaceMask: () => paints++,
  drawSurfaceGlyph: () => native++,
  renderCounterformEngineLegacy: (ctx, glyphs, w, h, p, L, fm, cover) => oldCalls.push(['legacy', glyphs.length, cover]),
  renderCounterformEngineV29: (ctx, glyphs, w, h, p, L, fm, cover) => oldCalls.push(['v29', glyphs.length, cover])
});
new vm.Script(generated).runInContext(runtime);

runtime.counterformVariantData = (ch, settings) => {
  variants.push({ ch, settings: { ...settings } });
  return { canvas: {}, cropX: 0, cropY: 0, left: 0, ascentPx: 0, unit: 4, width: 4, height: 4, advance: 80, middleOffset: 40 };
};
runtime.counterformDrawVariant = () => {};
const glyph = (ch, surface) => ({ ch, opacity: 1, surface: { counterformEngine: 1, ...surface } });
function reset() { composites = paints = native = 0; variants = []; oldCalls = []; }

reset();
runtime.renderCounterformEngine({}, [
  glyph('A', { counterformGrammar: 'aperture', counterformPressure: 1, counterformBridge: 5 }),
  glyph('B', { counterformGrammar: 'trap', counterformPressure: 9, counterformTrap: 23 })
], 640, 480, 1, { dx: 0, dy: 0, s: 1 }, {}, true, true);
assert.equal(variants.length, 2, 'active glyphs receive independent body construction');
assert.equal(variants[0].settings.grammar, 'aperture');
assert.equal(variants[0].settings.pressure, 4, 'world controls convert into the fixed 768px source frame');
assert.equal(variants[1].settings.grammar, 'trap');
assert.equal(variants[1].settings.pressure, 36, 'Batch values are not averaged');
assert.equal(variants[1].settings.trap, 92);
assert.equal(composites, 1, 'source cover is composed once');
assert.equal(paints, 1, 'adjacent modern glyphs share one color pass');

reset();
runtime.renderCounterformEngine({}, [
  glyph('A', { counterformGrammar: 'apertureV29' }),
  glyph('B', { counterformGrammar: 'apertureV29' }),
  glyph('C', { counterformGrammar: 'legacy' }),
  glyph('D', { counterformGrammar: 'channel', counterformPressure: 0, counterformBridge: 0, counterformTrap: 0 })
], 640, 480, 1, { dx: 0, dy: 0, s: 1 }, {}, false, true);
assert.deepEqual(oldCalls, [['v29', 2, false], ['legacy', 1, false]], 'classic and legacy runs retain their historical renderers');
assert.equal(native, 1, 'zero construction uses the native glyph body');
assert.equal(variants.length, 0);
assert.equal(paints, 1, 'native modern output flushes after classic runs');

reset();
runtime.counterformVariantData = () => { throw new Error('fixture failure'); };
runtime.renderCounterformEngine({}, [glyph('A', {})], 640, 480, 1, { dx: 0, dy: 0, s: 1 }, {}, false, true);
assert.equal(native, 1, 'live preview retains a readable source glyph on reconstruction failure');
assert.match(runtime.counterformRenderError, /fixture failure/);
assert.equal(statusElement.hidden, false, 'live fallback has visible status');
assert.match(statusElement.textContent, /A: fixture failure/);
assert.throws(() => runtime.renderCounterformEngine({}, [glyph('A', {})], 640, 480, 1,
  { dx: 0, dy: 0, s: 1 }, {}, false, false), /fixture failure/, 'non-live output refuses a silent fallback');
assert.equal(statusElement.hidden, false, 'export preflight does not erase the live warning');
runtime.counterformResetInactive([]);
assert.equal(statusElement.hidden, true, 'empty or removed output clears stale warning');
runtime.counterformSetRenderError('fixture failure');
outputOpacity = 0;
runtime.counterformResetInactive([glyph('A', {})]);
assert.equal(statusElement.hidden, true, 'muted FX clears stale warning');
outputOpacity = 1;
runtime.counterformSetRenderError('fixture failure');
runtime.renderCounterformEngine({}, [glyph('A', { counterformPressure: 0, counterformBridge: 0, counterformTrap: 0 })],
  640, 480, 1, { dx: 0, dy: 0, s: 1 }, {}, false, true);
assert.equal(statusElement.hidden, true, 'successful live rendering clears stale warning');

runtime.applyCounterformPreset('reservoir');
assert.equal(params.counterformGrammar, 'trap');
assert.equal(params.counterformTrap, 20);
assert.equal(params.counterformAngle, -15);
assert.equal(history, 1);
assert.equal(autosaves, 1);

runtime.counterformSourceCache.set('a', { cells: 12 }); runtime.counterformSourceCells = 12;
runtime.counterformPreparedCache.set('b', { cells: 12 }); runtime.counterformPreparedCells = 12;
runtime.counterformVariantCache.set('c', { cells: 12 }); runtime.counterformVariantCells = 12;
const revision = runtime.counterformFontRevision;
runtime.counterformInvalidateFonts();
assert.equal(runtime.counterformFontRevision, revision + 1);
assert.equal(runtime.counterformSourceCache.size + runtime.counterformPreparedCache.size + runtime.counterformVariantCache.size, 0);
assert.equal(runtime.counterformSourceCells + runtime.counterformPreparedCells + runtime.counterformVariantCells, 0);

const lru = new Map([['a', { cells: 4 }], ['b', { cells: 4 }], ['c', { cells: 4 }]]);
assert.equal(runtime.counterformTrim(lru, 'cells', 3, 10, 12), 8);
assert.deepEqual([...lru.keys()], ['b', 'c']);
runtime.counterformTouch(lru, 'b', lru.get('b'));
assert.deepEqual([...lru.keys()], ['c', 'b'], 'cache hit becomes most recent');
lru.set('d', { cells: 5 });
assert.equal(runtime.counterformTrim(lru, 'cells', 3, 10, 13), 9);
assert.deepEqual([...lru.keys()], ['b', 'd']);
const prepareBody = runtime.CounterformEngine.prepareCounterformBody;
runtime.CounterformEngine.prepareCounterformBody = () => ({ fixture: true });
runtime.counterformPreparedData({ key: 'small', cells: 20 });
assert.equal(runtime.counterformPreparedData({ key: 'oversized', cells: 3145729 }).cells, 3145729);
assert.deepEqual([...runtime.counterformPreparedCache.keys()], ['small'], 'uncacheable topology does not evict useful glyphs');
assert.equal(runtime.counterformPreparedCells, 20);
runtime.CounterformEngine.prepareCounterformBody = prepareBody;
runtime.counterformInvalidateFonts();

// Actual source-capture adapter, with only the browser Canvas API mocked.
let captures = 0, large = false;
runtime.document.createElement = () => {
  const canvas = {};
  const ctx = {
    textBaseline: 'alphabetic',
    measureText: () => ({ width: large ? 5000 : 600, actualBoundingBoxLeft: 24,
      actualBoundingBoxRight: 620, actualBoundingBoxAscent: ctx.textBaseline === 'middle' ? 300 : 560,
      actualBoundingBoxDescent: 100 }),
    fillText: () => { captures++; assert.match(ctx.font, /768px/); assert.equal(ctx.textBaseline, 'alphabetic'); },
    getImageData: () => ({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4) })
  };
  canvas.getContext = () => ctx;
  return canvas;
};
const captured = runtime.counterformSourceData('Q');
assert.equal(captured.width, 676); assert.equal(captured.height, 692);
assert.equal(captured.advance, 150); assert.equal(captured.middleOffset, 65);
assert.equal(captured.alpha.length, 676 * 692);
assert.equal(runtime.counterformSourceData('Q'), captured); assert.equal(captures, 1);
assert.equal(runtime.counterformSourceData(' '), null); assert.equal(captures, 1);
params.fontWeight = 500;
assert.notEqual(runtime.counterformSourceData('Q'), captured); assert.equal(captures, 2);
large = true; assert.throws(() => runtime.counterformSourceData('wide'), /上限/); large = false;
runtime.counterformInvalidateFonts();
runtime.counterformSourceData('Q'); assert.equal(captures, 3);

// Compare the actual cropped-mask draw transform with native text placement.
const frameRuntime = vm.createContext({ params, baselineOffset: () => 17 });
new vm.Script(extract('spectralGlyphFrame') + '\n' + extract('drawSurfaceGlyph') + '\n' + extract('counterformDrawVariant')).runInContext(frameRuntime);
function frameContext() {
  return {
    matrix: [1, 0, 0, 1, 0, 0], stack: [], globalAlpha: .73,
    setTransform(...m) { this.matrix = m; },
    transform(a, b, c, d, e, f) {
      const [A, B, C, D, E, F] = this.matrix;
      this.matrix = [A*a+C*b, B*a+D*b, A*c+C*d, B*c+D*d, A*e+C*f+E, B*e+D*f+F];
    },
    translate(x, y) { this.transform(1, 0, 0, 1, x, y); },
    scale(x, y) { this.transform(x, 0, 0, y, 0, 0); },
    rotate(a) { this.transform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0); },
    save() { this.stack.push({ matrix: this.matrix.slice(), alpha: this.globalAlpha }); },
    restore() { const s = this.stack.pop(); this.matrix = s.matrix; this.globalAlpha = s.alpha; },
    point(x, y) { const [a,b,c,d,e,f] = this.matrix; return [a*x+c*y+e, b*x+d*y+f]; },
    fillText(ch, x, y) {
      const scale = params.fontSize / 192;
      this.nativeOrigin = this.point(x - (this.textAlign === 'center' ? 90*scale : 0),
        y + (this.textBaseline === 'middle' ? 70*scale : 0));
      this.nativeAxes = this.matrix.slice(0, 4);
    },
    drawImage(canvas, x, y, width, height) {
      this.imageOrigin = this.point(x, y); this.imageAxes = this.matrix.slice(0, 4);
      this.imageAlpha = this.globalAlpha; this.imageSize = [width, height];
    }
  };
}
const frameData = { canvas: {}, cropX: 24, cropY: 576, left: 24, ascentPx: 576,
  width: 400, height: 600, unit: 4, advance: 180, middleOffset: 70 };
for (const fontSize of [96, 192]) for (const vertical of [false, true]) for (const grid of [false, true]) for (const upright of [false, true]) {
  params.fontSize = fontSize; params.vertical = vertical;
  const g = { ch: 'B', x: 12, y: -30, w: 160, h: 190, ox: 92, oy: 65, tx: 33, ty: -27,
    rot: 33, skewX: -19, skewY: 12, scaleX: -1.3, scaleY: .8, opacity: .45, grid, upright };
  const before = JSON.stringify(g), nativeFrame = frameContext(), maskFrame = frameContext(), layout = { dx: 180, dy: -55, s: 1.2 };
  frameRuntime.drawSurfaceGlyph(nativeFrame, g, 2, layout, {}, .6, '#000');
  frameRuntime.counterformDrawVariant(maskFrame, g, frameData, 2, layout, {}, .6);
  assert.ok(maskFrame.imageOrigin.every((v, i) => Math.abs(v - nativeFrame.nativeOrigin[i]) < 1e-9));
  assert.ok(maskFrame.imageAxes.every((v, i) => Math.abs(v - nativeFrame.nativeAxes[i]*fontSize/192) < 1e-9));
  assert.deepEqual(maskFrame.imageSize, [100, 150]);
  assert.equal(maskFrame.imageAlpha, .27); assert.equal(maskFrame.globalAlpha, .73);
  assert.equal(maskFrame.stack.length, 0); assert.equal(JSON.stringify(g), before);
}
params.fontSize = 192; params.vertical = false;

for (const id of ['pCounterformGrammar', 'pCounterformPressure', 'pCounterformBridge',
  'pCounterformAperture', 'pCounterformAngle', 'pCounterformTrap']) assert.ok(html.includes(`id="${id}"`), id);
for (const name of ['chamber', 'stencil', 'reservoir', 'canal']) assert.ok(html.includes(`data-counterform-preset="${name}"`), name);
for (const hidden of ['apertureV29', 'stencilV29', 'trapV29', 'channelV29']) {
  assert.match(html, new RegExp(`value="${hidden}" hidden`), `${hidden} hidden option`);
}
assert.ok(html.includes("counterformGrammar: ['legacy', 'apertureV29', 'stencilV29', 'trapV29', 'channelV29', 'aperture', 'stencil', 'trap', 'channel']"));
assert.ok(html.includes('var legacyCounterformV29 = Number(data.version || 0) < 42'));
assert.ok(html.includes("return ['aperture', 'stencil', 'trap', 'channel'].indexOf(value) !== -1 ? value + 'V29' : value"));
assert.ok(html.includes('batchProfiles[counterformProfileKey].counterformGrammar = preserveV29CounterformGrammar'));
assert.match(extract('renderSurfaceFxLayer'), /canonicalLayout,\s*fm,\s*false,\s*livePreview,\s*context/);
assert.ok(extract('renderSurfaceFxLayer').includes('counterformResetInactive(glyphs)'));
assert.ok(extract('renderSurfaceFxPreview').includes('counterformResetInactive([])'));
assert.ok(html.includes('id="counterformWorkStatus" role="status" aria-live="polite"'));
assert.ok(html.includes('counterformInvalidateFonts(); refreshConfuseFontCandidates()'));
assert.ok(extract('projectData').includes('version: 92'));
assert.ok(html.includes("a: 'td', v: 92"));
assert.ok(html.includes('data.version > 92'));
assert.ok(!html.match(/src=["'][^"']*counterform/i), 'one-file editor has no Counterform module fetch');

console.log('Counterform editor: four starts, per-Batch settings, 16 native frames, 768px capture, native/live fallback with status/reset, strict non-live failure, v29/legacy preservation, LRU/oversized accounting, font invalidation and schema v42 wiring passed (VM/static, not browser QA).');
