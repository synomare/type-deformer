// Actual Chrome renderer, deterministic synthetic mask and recorded Canvas calls.
// No native Canvas/browser dependency. Native compositing is a separate QA gate.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
function extract(name) {
  const start = html.indexOf(`      function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const tail = html.slice(start), line = tail.split('\n', 1)[0];
  const source = line.trimEnd().endsWith('}') ? line : tail.slice(0, tail.indexOf('\n      }') + 8);
  new vm.Script(source); return source;
}
const source = ['surfaceNoise01', 'surfaceBoundaryDistance', 'chromeReflectionMotion', 'renderChromeReliquary'].map(extract).join('\n');
const width = 78, height = 94, mask = new Uint8ClampedArray(width * height * 4);
for (let y = 16; y < 78; y++) for (let x = 20; x < 59; x++) {
  if (x > 29 && x < 50 && ((y > 23 && y < 40) || (y > 49 && y < 68))) continue;
  mask[(y * width + x) * 4 + 3] = 255;
}
const defaults = { seed: 41 };
for (const key of ['Voltage', 'Bevel', 'Angle', 'Bands', 'Contrast', 'Warp'])
  defaults['chrome' + key] = Number(html.match(new RegExp(`chrome${key}: (-?[0-9.]+)`))[1]);
let layers, pixels, legacyPixels, strength = 1, currentMask = mask;
function fakeContext(name) {
  const calls = []; layers[name] = calls;
  const ctx = { canvas: { width, height } };
  for (const method of ['save', 'restore', 'setTransform', 'translate', 'rotate', 'beginPath', 'moveTo', 'bezierCurveTo', 'stroke', 'fillRect']) {
    ctx[method] = (...args) => {
      assert.ok(args.every(Number.isFinite), `${name}/${method} finite arguments`);
      calls.push([method, ...args]);
    };
  }
  ctx.drawImage = (_image, ...args) => { assert.ok(args.every(Number.isFinite)); calls.push(['drawImage', ...args]); };
  ctx.createLinearGradient = (...args) => {
    assert.ok(args.every(Number.isFinite)); calls.push(['gradient', ...args]);
    return { addColorStop: (offset, color) => { assert.ok(Number.isFinite(offset)); calls.push(['stop', offset, color]); } };
  };
  ctx.createImageData = (w, h) => ({ data: new Float64Array(w * h * 4) }); // Do not hide NaN by clamping.
  ctx.putImageData = image => { pixels = image.data; };
  return ctx;
}
const sandbox = { Math, Uint8Array, Float32Array, params: defaults, compositionState: { enabled: true, phase: 0 },
  BATCH_PARAM_OPTIONS: { chromeModel: ['acid', 'studio'] }, surfaceChoice: () => 'acid',
  surfaceAggregate: (_glyphs, _op, _key, value) => ({ value, weight: strength, strength }),
  buildSurfaceMask: () => ({ getContext: () => ({ getImageData: () => ({ data: currentMask }) }) }),
  compositeSurfaceSource: () => {}, surfaceEffectColor: () => '#123456', surfaceHexRgb: () => [18, 52, 86],
  surfaceScratch: name => { const ctx = fakeContext(name); return { ctx, canvas: ctx.canvas }; }
};
const context = vm.createContext(sandbox);
function compile(code) { new vm.Script(code + '\nthis.render = renderChromeReliquary; this.motion = chromeReflectionMotion;').runInContext(context); }
compile(source);
function render(phase, overrides = {}, enabled = true) {
  layers = {}; pixels = undefined; sandbox.params = { ...defaults, ...overrides }; sandbox.compositionState = { enabled, phase };
  context.render(fakeContext('target'), [{}], width, height, 1, { s: 1 }, {}, false);
  if (pixels) assert.ok(pixels.every(v => Number.isFinite(v) && v >= 0 && v <= 255), 'finite channel writes');
  return { pixels, coat: layers['chrome-reliquary-reflection'], layers };
}
function pixelDiff(a, b) {
  let sum = 0, count = 0;
  for (let i = 0; i < a.length; i += 4) if (Math.max(a[i + 3], b[i + 3]) > 0)
    for (let c = 0; c < 3; c++) { sum += Math.abs(a[i + c] - b[i + c]); count++; }
  return sum / Math.max(1, count);
}
function coatDiff(a, b) {
  assert.equal(a.length, b.length); let largest = 0;
  a.forEach((call, i) => call.forEach((value, j) => {
    const other = b[i][j];
    if (typeof value === 'number') largest = Math.max(largest, Math.abs(value - other));
    else assert.equal(value, other);
  })); return largest;
}
const tau = 2 * Math.PI, e = 1e-5;
// The orbit itself is C1 across the seam, not merely wrapped at exact endpoints.
for (const key of Object.keys(context.motion(0))) {
  assert.equal(context.motion(0)[key], 0, `${key} neutral at rest`);
  assert.ok(Math.abs(context.motion(-e)[key] - context.motion(tau - e)[key]) < 1e-12);
  const left = (context.motion(0)[key] - context.motion(tau - e)[key]) / e;
  const right = (context.motion(e)[key] - context.motion(0)[key]) / e;
  assert.ok(Math.abs(left - right) < 2e-5, `${key} seam tangent`);
  assert.notEqual(context.motion(Math.PI)[key], 0, `${key} not global ping-pong`);
}
// Distinct layer projections must not collapse to a one-dimensional backtrack.
const a = context.motion(Math.PI * .5), b = context.motion(Math.PI * 1.5);
assert.ok(Math.abs(a.environment * b.glint - b.environment * a.glint) > .1);
const endpoints = { chromeVoltage: [0, 6], chromeBevel: [1, 96], chromeAngle: [-180, 180], chromeBands: [2, 24], chromeContrast: [0, 4], chromeWarp: [0, 4] };
const profiles = [{}, { chromeVoltage: 6, chromeBevel: 96, chromeAngle: -137, chromeBands: 24, chromeContrast: 4, chromeWarp: 4 },
  ...Object.entries(endpoints).flatMap(([key, values]) => values.map(value => ({ [key]: value })))];
let largestSeam = 0, largestCoatSeam = 0;
const references = [];
for (const profile of profiles) {
  const zero = render(0, profile), one = render(1, profile);
  assert.deepEqual(zero, one, 'exact endpoints including coat and layer calls');
  assert.deepEqual(zero, render(.37, profile, false), 'Compose disabled exactly static');
  assert.ok(zero.pixels.some((v, i) => i % 4 === 3 && v > 0));
  const left = render(1 - e, profile), right = render(e, profile);
  const seam = pixelDiff(left.pixels, right.pixels), coat = coatDiff(left.coat, right.coat);
  largestSeam = Math.max(largestSeam, seam); largestCoatSeam = Math.max(largestCoatSeam, coat);
  assert.ok(seam < .15, `near seam ${seam}`); assert.ok(coat < .05, `coat seam ${coat}`);
  for (const phase of [.25, .5, .75]) assert.ok(pixelDiff(zero.pixels, render(phase, profile).pixels) > .05, 'material keeps moving');
  assert.deepEqual(render(-.125, profile), render(.875, profile), 'negative scrub wraps');
  references.push(zero);
}
// Counterfactual old drives: catches the former near-loop snap and proves the
// phase-zero pixels/coat/rim commands unchanged, without storing a second shader.
const replacements = [
  ['motion.mercury', 'phase * 0.42'], ['motion.environment', 'phase * 0.18'],
  ['motion.glint', 'phase * 0.72'], ['motion.mirror', 'phase'],
  ['motion.chroma', 'phase * 0.22'], ['motion.coat', 'phase * 0.34']
];
let previous = source;
for (const [needle, value] of replacements) { assert.ok(previous.includes(needle), needle); previous = previous.replaceAll(needle, value); }
compile(previous);
profiles.forEach((profile, i) => assert.deepEqual(render(0, profile), references[i], 'prior static image preserved'));
legacyPixels = pixelDiff(render(1 - e).pixels, render(e).pixels);
assert.ok(legacyPixels > 10, 'negative control must detect the old large material jump');
assert.ok(coatDiff(render(1 - e).coat, render(e).coat) > 1, 'negative control detects old coat jump');
compile(source);
currentMask = new Uint8ClampedArray(mask.length); assert.equal(render(.4).pixels, undefined);
currentMask = mask; strength = 0; assert.equal(render(.4).pixels, undefined);
console.log(JSON.stringify({ status: 'pass', profiles: profiles.length, largestSeam, largestCoatSeam, legacyPixels,
  scope: 'actual renderer, raw raster and recorded coat/layer commands; all control endpoints, C1 driver seam, nonfrozen orbit, exact still frame, negative controls, empty/muted; not native Canvas compositing/browser/Compose engine/device' }));
