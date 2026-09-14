import assert from 'node:assert/strict';
import {
  COUNTERFORM_GRAMMARS,
  counterformMaskDistance,
  prepareCounterformBody,
  renderCounterformBody,
  traceCounterformMask
} from './core.mjs';

function mask(width, height, sample) {
  const alpha = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    alpha[y * width + x] = sample(x + 0.5, y + 0.5) ? 255 : 0;
  }
  return alpha;
}

const width = 180;
const height = 180;
const ring = mask(width, height, (x, y) => {
  const dx = (x - 90) / 1.02;
  const dy = (y - 88) / 0.91;
  const radius = Math.hypot(dx, dy);
  const notch = x > 88 && x < 104 && y < 48;
  return radius < 67 && radius > 29 && !notch;
});
const body = prepareCounterformBody(ring, width, height);
assert.equal(body.topology.components.length, 1, 'ring counter must be labelled independently from paper');
assert.ok(body.ridge.some(Boolean), 'ring must have a medial ridge');

const native = renderCounterformBody(body, { grammar: 'aperture', pressure: 0, bridge: 0, trap: 0 });
assert.equal(counterformMaskDistance(native.mask, body.inside).difference, 0, 'zero controls must preserve the exact source mask');

const settings = { pressure: 7, bridge: 15, aperture: 0.58, angle: 18, trap: 24, seed: 31 };
const rendered = new Map();
for (const grammar of COUNTERFORM_GRAMMARS) {
  const first = renderCounterformBody(body, { ...settings, grammar });
  const second = renderCounterformBody(body, { ...settings, grammar });
  assert.deepEqual(first.mask, second.mask, `${grammar} must be deterministic`);
  assert.ok(counterformMaskDistance(first.mask, body.inside).normalized > 0.008, `${grammar} must materially change the source`);
  const contours = traceCounterformMask(first.mask, width, height);
  assert.ok(contours.length, `${grammar} must produce closed output contours`);
  assert.ok(contours.every(ring => ring.points.length >= 3 && Number.isFinite(ring.area)), `${grammar} contours must be finite`);
  rendered.set(grammar, first.mask);
}

for (let i = 0; i < COUNTERFORM_GRAMMARS.length; i++) for (let j = i + 1; j < COUNTERFORM_GRAMMARS.length; j++) {
  const a = COUNTERFORM_GRAMMARS[i];
  const b = COUNTERFORM_GRAMMARS[j];
  assert.ok(counterformMaskDistance(rendered.get(a), rendered.get(b)).normalized > 0.012,
    `${a} and ${b} must remain visibly distinct constructions`);
}

const expanded = renderCounterformBody(body, { ...settings, grammar: 'aperture', pressure: 18 });
const contracted = renderCounterformBody(body, { ...settings, grammar: 'aperture', pressure: -18 });
assert.ok(expanded.metrics.ink < contracted.metrics.ink, 'positive counter pressure must remove more body than negative pressure');

const openC = mask(width, height, (x, y) => {
  const radius = Math.hypot(x - 92, y - 90);
  return radius < 68 && radius > 31 && !(x > 84 && Math.abs(y - 90) < 27);
});
const openBody = prepareCounterformBody(openC, width, height);
assert.equal(openBody.topology.components.length, 0, 'open C must not be mistaken for a closed counter');
assert.ok(openBody.openChambers.length, 'an open but enclosed bay must be available as a fallback chamber');
const openAperture = renderCounterformBody(openBody, { ...settings, grammar: 'aperture' });
const openStencil = renderCounterformBody(openBody, { ...settings, grammar: 'stencil' });
assert.ok(counterformMaskDistance(openAperture.mask, openBody.inside).normalized > 0.006, 'open chamber aperture must remain active');
assert.ok(counterformMaskDistance(openStencil.mask, openBody.inside).normalized > 0.004, 'open chamber stencil must remain active');

const solid = mask(width, height, (x, y) => x > 38 && x < 142 && y > 35 && y < 145);
const solidBody = prepareCounterformBody(solid, width, height);
const solidChannel = renderCounterformBody(solidBody, { ...settings, grammar: 'channel' });
assert.ok(counterformMaskDistance(solidChannel.mask, solidBody.inside).normalized > 0.004,
  'channel grammar must not require an enclosed counter');

assert.throws(() => prepareCounterformBody(new Uint8Array(3), 2, 2), /length/);
assert.throws(() => prepareCounterformBody(new Uint8Array(5000), 5000, 1), /bounded/);

console.log('Counterform Engine core: topology, open bays, native identity, pressure polarity, four distinct deterministic grammars and contour closure passed.');
