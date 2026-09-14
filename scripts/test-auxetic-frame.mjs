import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const block = html.match(/^      \/\/ BEGIN AUXETIC TYPE GENERATED\n[\s\S]*?^      \/\/ END AUXETIC TYPE GENERATED/m)?.[0];
assert.ok(block, 'embedded Auxetic runtime');

let paths = 0;
let native = [];
let paints = [];
let matrix = { a: 1, b: 0, c: 0, d: 1 };
const matrixStack = [];
let active;
class TestPath {
  constructor() { paths++; this.commands = []; }
  moveTo(x, y) { this.commands.push(['M', x, y]); }
  lineTo(x, y) { this.commands.push(['L', x, y]); }
  closePath() { this.commands.push(['Z']); }
}
const ctx = {
  globalAlpha: 1,
  save() { matrixStack.push(matrix); },
  restore() { matrix = matrixStack.pop(); },
  getTransform() { return matrix; },
  fill(path) { paints.push({ id: active.id, alpha: this.globalAlpha, commands: path ? path.commands : this.commands }); },
  beginPath() { this.commands = []; },
  moveTo: TestPath.prototype.moveTo,
  lineTo: TestPath.prototype.lineTo,
  closePath: TestPath.prototype.closePath
};
const elements = new Map();
const params = {
  fontFamily: 'Synthetic', fontWeight: 400, fontSize: 192,
  auxeticOpening: 28, auxeticModule: 24, auxeticAspect: 1,
  auxeticAxis: 0, auxeticLigament: .75, auxeticMotion: .65
};
const runtime = vm.createContext({
  params, compositionState: { enabled: true, phase: .3 }, Path2D: TestPath,
  surfaceGlyphStrength: (g, id) => g.surface?.[id] || 0,
  surfaceOutputOpacity: () => 1, surfaceEffectColor: () => '#321',
  spectralGlyphFrame(target, g, pixelScale, L) {
    active = g;
    matrix = { a: g.scaleX * pixelScale * L.s, b: 0, c: 0, d: g.scaleY * pixelScale * L.s };
  },
  drawSurfaceGlyph(target, g) { native.push(g.id); },
  scheduleSurfaceFxDraw() {}, scheduleCompositionDraw() {},
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { hidden: false, value: 0, textContent: '', setAttribute() {} });
      return elements.get(id);
    }
  },
  requestAnimationFrame() { return 1; }, cancelAnimationFrame() {}
});
new vm.Script(block).runInContext(runtime);

const outline = Array.from({ length: 512 }, (_, i) => ({
  x: 80 * Math.cos(i * Math.PI / 256), y: 110 * Math.sin(i * Math.PI / 256)
}));
const source = runtime.AuxeticType.prepareAuxeticGlyph([{ points: outline }]);
const baseSettings = runtime.AuxeticType.normalizeAuxeticSettings({
  opening: 28, module: 24, aspect: 1, axis: 0, ligament: .75, motion: .65
});
const compiled = runtime.AuxeticType.compileAuxeticGlyph(source, baseSettings);
const data = { compiled, pointCount: source.pointCount + compiled.pointCount, advance: 160, ascent: 110, descent: 110, middleOffset: 40 };
runtime.auxeticGlyphData = () => data;

const glyphs = Array.from({ length: 300 }, (_, i) => ({
  id: i, ch: 'A', opacity: .4 + (i % 3) * .2,
  surface: { auxeticType: 1, auxeticOpening: [24, 52, 80][i % 3] },
  scaleX: 1 + (i % 5), scaleY: 1
}));
runtime.auxeticPrepare(glyphs);
while (runtime.auxeticPool.state().pending) runtime.auxeticPool.advance();

const original = runtime.AuxeticType.renderAuxeticGlyph;
let generated = [];
runtime.AuxeticType.renderAuxeticGlyph = (...args) => {
  const result = original(...args);
  generated.push({ settings: args[1], tolerance: args[3].tolerance, shape: result });
  return result;
};
const render = items => {
  paths = 0; paints = []; native = []; generated = [];
  runtime.renderAuxeticTypeDirect(ctx, items, 1, { s: 1, dx: 0, dy: 0 }, {}, false);
};

render(glyphs);
assert.equal(generated.length, 3, '300 copies require only three distinct output geometry evaluations');
assert.equal(paths, 3, 'one retained vector path is built per output geometry');
assert.equal(paints.length, 300);
assert.deepEqual(paints.map(p => p.id), glyphs.map(g => g.id), 'original paint order is retained');
assert.deepEqual(paints.map(p => p.alpha), glyphs.map(g => g.opacity), 'per-copy opacity survives grouping');
for (const group of generated) assert.equal(group.tolerance, .04, 'strictest 5x transform chooses the shared 0.2px error budget');

const forward = paints.map(p => JSON.stringify(p.commands));
render([...glyphs].reverse());
assert.deepEqual(paints.map(p => JSON.stringify(p.commands)).reverse(), forward, 'geometry is independent of request order');

runtime.Path2D = undefined;
render(glyphs);
assert.deepEqual(paints.map(p => JSON.stringify(p.commands)), forward, 'non-Path2D fallback produces identical paths');
runtime.Path2D = TestPath;

runtime.compositionState.phase = 0;
render(glyphs);
const at0 = paints.map(p => JSON.stringify(p.commands));
runtime.compositionState.phase = 1;
render(glyphs);
assert.deepEqual(paints.map(p => JSON.stringify(p.commands)), at0, 'phase 0/1 loop survives shared geometry');

const missing = { ...glyphs[0], id: 'missing', ch: 'unprepared' };
assert.throws(() => render([missing]), error => error.code === 'AUXETIC_PENDING');
assert.equal(paints.length, 0, 'strict missing-source failure precedes partial paint');
const nativeGlyph = { ...missing, surface: { auxeticType: 1, auxeticOpening: 0 } };
render([nativeGlyph]);
assert.deepEqual(native, [nativeGlyph.id]);
assert.equal(generated.length, 0);

paints = []; native = [];
runtime.renderAuxeticTypeDirect(ctx, [missing], 1, { s: 1 }, {}, true);
assert.deepEqual(native, [missing.id], 'live pending state falls back to native glyph');
assert.equal(runtime.auxeticRenderError, '', 'pending preparation is not reported as a render failure');

const extreme = { ...glyphs[0], scaleX: 1e10 };
paints = [];
assert.throws(() => render([extreme]), /precision budget/);
assert.equal(paints.length, 0, 'strict precision failure precedes partial paint');
assert.equal(matrixStack.length, 0, 'all prepass and paint transforms are restored');

console.log('Auxetic frame: 300 copies -> 3 geometry/path builds; strictest 0.2px tolerance, order/alpha, reverse order, Path2D fallback, loop, native/missing source and transactional precision checks passed (VM/mocks, not browser FPS).');
