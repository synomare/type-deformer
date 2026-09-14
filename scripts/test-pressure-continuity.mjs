// No browser/Canvas dependency. Exercise the actual renderer with raw raster I/O.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = await fs.readFile(new URL('../index.html', import.meta.url), 'utf8');
const extract = name => {
  const start = html.indexOf(`      function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const end = html.indexOf('\n      function ', start + 1);
  return html.slice(start, end);
};
const source = ['surfaceNoise01', 'surfaceBoundaryDistance', 'pressureContinuousNoise', 'renderPressureStroke'].map(extract).join('\n');
const width = 90, height = 104;
const alpha = new Uint8ClampedArray(width * height * 4);
for (let y = 19; y < 83; y++) for (let x = 22; x < 66; x++) {
  if (x > 32 && x < 56 && ((y > 27 && y < 44) || (y > 54 && y < 74))) continue;
  alpha[(y * width + x) * 4 + 3] = 255;
}
const defaults = { seed: 41, fontSize: 52, pressureSystem: 'gesture' };
for (const key of ['Weight', 'Contrast', 'Angle', 'Frequency', 'Softness', 'Breath', 'Dryness', 'Taper'])
  defaults[`pressure${key}`] = Number(html.match(new RegExp(`pressure${key}: (-?[0-9.]+)`))[1]);
let result, legacyCalls = 0;
const sandbox = { Math, Uint8Array, Float32Array, params: defaults, compositionState: { enabled: true, phase: 0 },
  sourceAlpha: alpha, strength: 1, BATCH_PARAM_OPTIONS: {},
  surfaceChoice: () => sandbox.params.pressureSystem,
  surfaceAggregate: (_glyphs, _op, _key, value) => ({ value, weight: sandbox.strength, strength: sandbox.strength }),
  buildSurfaceMask: () => ({ getContext: () => ({ getImageData: () => ({ data: sandbox.sourceAlpha }) }) }),
  compositeSurfaceSource: () => {}, surfaceEffectColor: () => '#123456',
  renderPressureStrokeLegacy: () => { legacyCalls++; },
  surfaceScratch: () => { const canvas = {}; return { canvas, ctx: {
    // Retain invalid writes for detection instead of Uint8 clamping NaN to 0.
    createImageData: (w, h) => ({ data: new Float64Array(w * h * 4) }), putImageData: data => { canvas.data = data.data; }
  } }; },
  paintSurfaceMask: (_ctx, canvas, color) => { assert.equal(color, '#123456'); result = canvas.data; }
};
const context = vm.createContext(sandbox);
new vm.Script(`${source}\nthis.noise = pressureContinuousNoise; this.render = renderPressureStroke;`).runInContext(context);
const noise = context.noise;
let noiseChecks = 0, largestGridJump = 0;
for (let i = 0; i < 400; i++) {
  const x = Math.sin(i * 4.7) * 20, y = Math.cos(i * 1.39) * 18, salt = i % 17;
  const value = noise(x, y, salt);
  assert.ok(value >= -1e-12 && value <= 1 + 1e-12);
  assert.equal(value, noise(x, y, salt));
  const edge = Math.floor(x), e = 1e-5;
  const jump = Math.abs(noise(edge - e, y, salt) - noise(edge + e, y, salt));
  largestGridJump = Math.max(largestGridJump, jump);
  assert.ok(jump < 1e-9, 'macro field value crosses cell edge continuously');
  const step = 1e-3, centre = noise(edge, y, salt);
  const leftSlope = (centre - noise(edge - step, y, salt)) / step;
  const rightSlope = (noise(edge + step, y, salt) - centre) / step;
  assert.ok(Math.abs(leftSlope - rightSlope) < 3e-5, 'no grid-edge tangent kink');
  noiseChecks++;
}
assert.notEqual(noise(.31, .67, 41), noise(.31, .67, 42), 'seed remains meaningful');
function render(system, phase, overrides = {}, enabled = true) {
  sandbox.params = { ...defaults, ...overrides, pressureSystem: system };
  sandbox.compositionState = { enabled, phase }; result = undefined;
  context.render({}, [{}], width, height, 1, { s: 1 }, {}, false);
  return result;
}
function diff(a, b) {
  let total = 0, union = 0;
  for (let i = 3; i < a.length; i += 4) { total += Math.abs(a[i] - b[i]); union += Math.max(a[i], b[i]); }
  return total / Math.max(1, union);
}
const systems = ['gesture', 'bristle', 'pool', 'flyingWhite'];
const profiles = [{}, { pressureContrast: 1.6, pressureBreath: 1.1, pressureDryness: .38 },
  { pressureWeight: 9, pressureContrast: 3, pressureAngle: -113, pressureFrequency: 7.25, pressureSoftness: .1, pressureDryness: .8 }];
let renderedChecks = 0, largestNearSeam = 0;
const starts = [];
for (const system of systems) for (const profile of profiles) {
  const zero = render(system, 0, profile), one = render(system, 1, profile);
  assert.deepEqual(zero, one, `${system} exact loop endpoints`);
  const left = render(system, 1 - 1e-6, profile), right = render(system, 1e-6, profile);
  const seam = diff(left, right); largestNearSeam = Math.max(largestNearSeam, seam);
  assert.ok(seam < .001, `${system} near-seam jump: ${seam}`);
  assert.deepEqual(render(system, .24, profile, false), render(system, .83, profile, false), `${system} disabled animation static`);
  assert.ok(diff(zero, render(system, .37, profile)) > .001, `${system} still animates`);
  if (Object.keys(profile).length === 0) { assert.ok(zero.some((v, i) => i % 4 === 3 && v > 20), `${system} nonblank`); starts.push(zero); }
  renderedChecks += 7;
}
// Exercise every declared endpoint without reducing any creative range. This
// checks execution/finiteness, not guaranteed readability at destructive values.
const endpoints = { pressureWeight: [-120, 260], pressureContrast: [0, 4], pressureAngle: [-180, 180],
  pressureFrequency: [.1, 32], pressureSoftness: [.1, 24], pressureBreath: [0, 4], pressureDryness: [0, 1], pressureTaper: [-2, 2] };
let endpointChecks = 0;
for (const system of systems) for (const [key, values] of Object.entries(endpoints)) for (const value of values) {
  const output = render(system, .173, { [key]: value });
  assert.equal(output.length, alpha.length);
  assert.ok(output.every(v => Number.isFinite(v) && v >= 0 && v <= 255), `${system}/${key}/${value}: finite channel writes`);
  endpointChecks++;
}
for (let i = 0; i < starts.length; i++) for (let j = i + 1; j < starts.length; j++)
  assert.ok(diff(starts[i], starts[j]) > .001, 'brush systems remain distinct');
// Isolate the phase fix from the new spatial field: at phase zero, replacing
// just the periodic driver with the previous expression is pixel-identical.
assert.ok(source.includes('- Math.sin(phase) * 0.31'));
const stable = render('bristle', 0, profiles[1]);
new vm.Script(source.replace('- Math.sin(phase) * 0.31', '- phase * 0.31') + '\nthis.render = renderPressureStroke;').runInContext(context);
assert.deepEqual(stable, render('bristle', 0, profiles[1]));
assert.ok(diff(render('bristle', 1 - 1e-6, profiles[1]), render('bristle', 1e-6, profiles[1])) > .05, 'negative control catches old fractional-phase snap');
new vm.Script(`${source}\nthis.render = renderPressureStroke;`).runInContext(context);
sandbox.sourceAlpha = new Uint8ClampedArray(alpha.length); assert.equal(render('gesture', 0), undefined);
sandbox.sourceAlpha = alpha; sandbox.strength = 0; assert.equal(render('bristle', 0), undefined);
sandbox.strength = 1; render('legacy', .4); assert.equal(legacyCalls, 1, 'legacy delegates unchanged');
console.log(JSON.stringify({ status: 'pass', noiseChecks, largestGridJump, renderedChecks, endpointChecks, largestNearSeam,
  scope: 'actual isolated renderer and synthetic mask, C2 grid transitions, loop neighbourhood, negative control, disabled motion, four distinct systems, empty/muted/legacy; not browser or all-font topology' }));
