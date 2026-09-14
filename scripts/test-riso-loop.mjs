// Actual renderer and separation pixels; Canvas compositing/real UI are separate.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extract(name) {
  const source = html.match(new RegExp('      function ' + name + '\\([^]*?\\n      }'))?.[0];
  assert.ok(source, name); new vm.Script(source); return source;
}
const names = ['surfaceBoundaryDistance', 'surfaceNoise01', 'risoLoopMotion', 'renderRisoSeparation'];
const source = names.map(extract).join('\n');
const width = 64, height = 72, mask = new Uint8ClampedArray(width * height * 4);
for (let y = 8; y < 64; y++) for (let x = 8; x < 56; x++) {
  if (x > 21 && x < 43 && ((y > 17 && y < 29) || (y > 39 && y < 53))) continue;
  mask[(y * width + x) * 4 + 3] = (x === 8 || y === 8) ? 96 : 255;
}
const maskBefore = mask.slice();
const modes = ['area', 'field', 'edge', 'halftone'];
const defaults = { seed: 41, risoColorA: '#ff3f78', risoColorB: '#2468ff' };
for (const name of ['Pressure', 'Split', 'Overlap', 'Register', 'Grain'])
  defaults['riso' + name] = Number(html.match(new RegExp('riso' + name + ': (-?[0-9.]+)'))[1]);
const endpoints = { risoPressure: [0, 4], risoSplit: [-1, 1], risoOverlap: [0, 1.5], risoRegister: [0, 160], risoGrain: [0, 2] };
const profiles = [{}, { risoPressure: 4, risoSplit: -.72, risoOverlap: 1.5, risoRegister: 160, risoGrain: 2 },
  ...Object.entries(endpoints).flatMap(([key, values]) => values.map(value => ({ [key]: value })))];
let plates, placements, legacyCalls = 0, currentMask = mask, strength = 1;
const c = vm.createContext({ Math, Uint8Array, Float32Array,
  BATCH_PARAM_OPTIONS: { risoPlateMap: ['legacy', ...modes] },
  surfaceChoice: (_g, _id, _key, value) => value,
  surfaceAggregate: (_g, _id, _key, value) => ({ value, weight: strength, strength }),
  buildSurfaceMask: () => ({ getContext: () => ({ getImageData: () => ({ data: currentMask }) }) }),
  compositeSurfaceSource: () => {},
  surfaceScratch: name => ({ canvas: { name }, ctx: {
    createImageData: (w, h) => ({ data: new Float64Array(w * h * 4) }),
    putImageData: image => { assert.ok(image.data.every(v => Number.isFinite(v) && v >= 0 && v <= 255)); plates[name] = image.data; }
  } }),
  colorizeSurfaceCanvas: (canvas, color) => ({ name: canvas.name, color }),
  renderRisoSeparationLegacy: () => { legacyCalls++; }
});
function compile(code) { new vm.Script(code).runInContext(c); }
compile(source);
function render(mode, phase, profile = {}, enabled = true) {
  plates = {}; placements = [];
  c.params = { ...defaults, ...profile, risoPlateMap: mode };
  c.compositionState = { enabled, phase };
  const stack = [];
  const ctx = { canvas: { width, height }, globalAlpha: .37, globalCompositeOperation: 'source-over',
    save() { stack.push([this.globalAlpha, this.globalCompositeOperation]); },
    restore() { [this.globalAlpha, this.globalCompositeOperation] = stack.pop(); },
    setTransform(...args) { assert.deepEqual(args, [1, 0, 0, 1, 0, 0]); },
    drawImage(image, ...args) { assert.ok(args.every(Number.isFinite)); placements.push([image.name, image.color, this.globalAlpha, this.globalCompositeOperation, ...args]); }
  };
  c.renderRisoSeparation(ctx, [{}], width, height, 1, { s: 1 }, {}, false);
  assert.equal(ctx.globalAlpha, .37); assert.equal(ctx.globalCompositeOperation, 'source-over'); assert.equal(stack.length, 0);
  assert.deepEqual(mask, maskBefore, 'input mask not changed');
  return { plates, placements };
}
function alphaDifference(a, b) {
  let sum = 0, count = 0;
  for (const name of Object.keys(a)) for (let i = 3; i < a[name].length; i += 4) {
    if (a[name][i] || b[name][i]) { sum += Math.abs(a[name][i] - b[name][i]); count++; }
  }
  return sum / Math.max(1, count);
}
function placementDifference(a, b) {
  assert.equal(a.length, b.length);
  let largest = 0;
  a.forEach((entry, i) => entry.forEach((value, j) => {
    if (typeof value === 'number') largest = Math.max(largest, Math.abs(value - b[i][j]));
    else assert.equal(value, b[i][j]);
  }));
  return largest;
}
const epsilon = 1e-6;
test('closed two-axis drives are neutral at rest, C1 at wrap and not a shared ping-pong', () => {
  const motion = c.risoLoopMotion, tau = Math.PI * 2, e = 1e-5;
  for (const key of Object.keys(motion(0))) {
    assert.equal(motion(0)[key], 0);
    assert.ok(Math.abs(motion(-e)[key] - motion(tau - e)[key]) < 1e-12);
    const left = (motion(0)[key] - motion(tau - e)[key]) / e;
    const right = (motion(e)[key] - motion(0)[key]) / e;
    assert.ok(Math.abs(left - right) < 4e-5);
    assert.ok(Math.abs(left - 1) < 2e-5, 'keep the prior local drive speed');
    assert.ok(Math.abs(motion(Math.PI)[key]) > 3, 'do not freeze the middle of the cycle');
  }
  const a = motion(Math.PI / 2), b = motion(Math.PI * 1.5);
  assert.ok(Math.abs(a.screenA * b.screenB - b.screenA * a.screenB) > 1, 'separate plate trajectories');
});

test('all four current modes and every control endpoint preserve rest, wrap and finite pixels', t => {
  let maxPixels = 0, maxPlacement = 0;
  for (const mode of modes) for (const profile of profiles) {
    const zero = render(mode, 0, profile);
    assert.deepEqual(zero, render(mode, 1, profile));
    assert.deepEqual(zero, render(mode, .37, profile, false));
    assert.deepEqual(render(mode, -.125, profile), render(mode, .875, profile));
    const left = render(mode, 1 - epsilon, profile), right = render(mode, epsilon, profile);
    const pixel = alphaDifference(left.plates, right.plates), placement = placementDifference(left.placements, right.placements);
    maxPixels = Math.max(maxPixels, pixel); maxPlacement = Math.max(maxPlacement, placement);
    assert.ok(pixel < .3, `${mode} alpha seam ${pixel}`);
    assert.ok(placement < .001, `${mode} placement seam ${placement}`);
    for (const phase of [.25, .5, .75]) {
      const frame = render(mode, phase, profile);
      assert.equal(Object.keys(frame.plates).length, 2);
      assert.equal(frame.placements.length, 2);
    }
  }
  t.diagnostic(JSON.stringify({ profiles: profiles.length, modes: modes.length, maxPixels, maxPlacement }));
});

test('each mode still animates, with independent ink colors and unchanged multiplication order', () => {
  for (const mode of modes) {
    const zero = render(mode, 0), middle = render(mode, .5);
    assert.ok(placementDifference(zero.placements, middle.placements) > .1);
    assert.equal(zero.placements[0][1], defaults.risoColorA);
    assert.equal(zero.placements[1][1], defaults.risoColorB);
    assert.equal(zero.placements[0][3], 'source-over');
    assert.equal(zero.placements[1][3], 'multiply');
  }
  const halfA = render('halftone', .25).plates, halfB = render('halftone', .75).plates;
  for (const name of Object.keys(halfA)) assert.notDeepEqual(halfA[name], halfB[name], 'screen trajectories do not simply retrace');
});

test('counterfactual old drives preserve every static plate and expose the original seam', () => {
  const references = modes.flatMap(mode => profiles.map(profile => render(mode, 0, profile)));
  let previous = source;
  for (const key of ['area', 'field', 'screenA', 'screenB', 'registration']) {
    const needle = 'motion.' + key;
    assert.ok(previous.includes(needle), needle);
    previous = previous.replaceAll(needle, 'time');
  }
  compile(previous);
  try {
    let index = 0;
    for (const mode of modes) for (const profile of profiles) assert.deepEqual(render(mode, 0, profile), references[index++]);
    for (const mode of modes) {
      const left = render(mode, 1 - epsilon), right = render(mode, epsilon);
      assert.ok(placementDifference(left.placements, right.placements) > 1, `${mode} detects old snap`);
    }
    const left = render('halftone', 1 - epsilon), right = render('halftone', epsilon);
    assert.ok(alphaDifference(left.plates, right.plates) > 40, 'old screen pattern also snaps');
  } finally { compile(source); }
});

test('seek/repeat order is deterministic, empty/muted inputs stay empty and legacy dispatch is retained', () => {
  const snapshot = render('field', .37);
  render('halftone', .83); render('edge', .12);
  assert.deepEqual(render('field', .37), snapshot);
  strength = 0;
  assert.deepEqual(render('field', .2), { plates: {}, placements: [] });
  strength = 1; currentMask = new Uint8ClampedArray(mask.length);
  assert.deepEqual(render('field', .2), { plates: {}, placements: [] });
  currentMask = mask;
  const before = legacyCalls;
  render('legacy', .4);
  assert.equal(legacyCalls, before + 1);
});
