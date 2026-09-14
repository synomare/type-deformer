import assert from 'node:assert/strict';
import { CONFORMAL_TYPE_PRESETS, normalizeConformalSettings, prepareConformalGlyph, createConformalMap, deformConformalGlyph } from './core.mjs';

const circle = (r, cx = 0, cy = 0, reverse = false) => ({ points: Array.from({ length: 48 }, (_, i) => {
  const a = (reverse ? -1 : 1) * i * Math.PI / 24;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}) });
const source = [circle(60), circle(20, 5, 0, true), circle(7, 81, -45)];
const before = JSON.stringify(source), glyph = prepareConformalGlyph(source);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
const close = (a, b, eps = 1e-8) => assert.ok(distance(a, b) <= eps, JSON.stringify({ a, b, eps }));
assert.deepEqual(deformConformalGlyph(glyph, { amount: 0 }).rings.map(r => r.points), glyph.rings.map(r => r.points));
assert.deepEqual(deformConformalGlyph(glyph, { power: 1, spiral: 0 }).rings.map(r => r.points), glyph.rings.map(r => r.points));
assert.equal(deformConformalGlyph(prepareConformalGlyph([])).rings.length, 0);
assert.throws(() => prepareConformalGlyph(null), TypeError);
assert.throws(() => prepareConformalGlyph([{ points: [{ x: NaN, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }] }]), TypeError);
assert.equal(normalizeConformalSettings({ amount: 900 }).amount, .94);
assert.equal(normalizeConformalSettings({ power: NaN }).power, -1);
for (const preset of Object.values(CONFORMAL_TYPE_PRESETS)) for (let step = 0; step <= 16; step++) {
  assert.equal(createConformalMap(glyph, preset, step / 16).injectivity, 'certified-domain', 'Starting presets must stay in the analytic injective domain throughout motion');
}
assert.throws(() => deformConformalGlyph(glyph, { amount: .94, power: -3 }, 0, { maxPoints: 3 }), /budget exceeded/);

// Independent rational inverse for the p=-1 specialization.
const disk = prepareConformalGlyph([circle(60)]);
const lens = createConformalMap(disk, { amount: .81, power: -1, angle: 0 });
for (const p of disk.rings[0].points) {
  const w = lens.map(p), x = w.x / disk.radius, y = w.y / disk.radius;
  const dx = 1 - .81 * x, dy = -.81 * y, den = dx * dx + dy * dy;
  close({ x: disk.radius * (x * dx + y * dy) / den, y: disk.radius * (y * dx - x * dy) / den }, p);
}

let cases = 0, errorSamples = 0, derivativeSamples = 0;
for (const amount of [0, 1e-12, .3, .8, .94]) for (const power of [-3, -1, 0, 1e-12, 1, 4]) for (const spiral of [-4, 0, 2.5, 4]) {
  const settings = { amount, power, spiral, angle: 29, motion: .8 };
  const map = createConformalMap(glyph, settings, .37), shape = deformConformalGlyph(glyph, settings, .37);
  assert.equal(shape.rings.length, glyph.rings.length);
  assert.ok(shape.maxErrorBound <= .08);
  assert.ok(shape.rings.every(r => Math.sign(r.area) === Math.sign(r.sourceArea)));
  assert.ok(shape.rings.every(r => r.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
  assert.deepEqual(shape, deformConformalGlyph(glyph, settings, .37));
  assert.deepEqual(deformConformalGlyph(glyph, settings, 0), deformConformalGlyph(glyph, settings, 1));
  assert.deepEqual(deformConformalGlyph(glyph, { ...settings, motion: 0 }, 0), deformConformalGlyph(glyph, { ...settings, motion: 0 }, .47));
  for (let ri = 0; ri < shape.rings.length; ri++) {
    const ring = shape.rings[ri], original = glyph.rings[ri].points;
    function sourceAt(u) {
      const edge = Math.floor(u) % original.length, t = u - Math.floor(u);
      return lerp(original[edge], original[(edge + 1) % original.length], t);
    }
    for (let i = 0; i < ring.points.length; i++) {
      const u0 = ring.material[i], u1 = i + 1 < ring.material.length ? ring.material[i + 1] : original.length;
      for (const t of [.13, .5, .87]) {
        const actual = map.map(sourceAt(u0 + (u1 - u0) * t));
        const chord = lerp(ring.points[i], ring.points[(i + 1) % ring.points.length], t);
        assert.ok(distance(actual, chord) <= .08000001, 'Conservative chord bound must control actual interpolation error');
        errorSamples++;
      }
    }
  }
  for (const p of [{ x: 0, y: 0 }, { x: 9, y: -17 }, { x: -21, y: 25 }]) {
    const h = .0001, f = map.map(p), d = map.derivative(p);
    const fx = map.map({ x: p.x + h, y: p.y }), fy = map.map({ x: p.x, y: p.y + h });
    close({ x: (fx.x - f.x) / h, y: (fx.y - f.y) / h }, d, Math.max(1e-4, Math.hypot(d.x, d.y) * .00005));
    close({ x: (fy.x - f.x) / h, y: (fy.y - f.y) / h }, { x: -d.y, y: d.x }, Math.max(1e-4, Math.hypot(d.x, d.y) * .00005));
    assert.ok(d.x * d.x + d.y * d.y > 0, 'No local fold'); derivativeSamples++;
  }
  cases++;
}
assert.equal(JSON.stringify(source), before);
const settings = { amount: .8, power: -.4, spiral: 1.8, angle: 34 };
const base = createConformalMap(glyph, settings);
const shifted = prepareConformalGlyph(source.map(r => ({ points: r.points.map(p => ({ x: p.x * 3 + 13000, y: p.y * 3 - 27000 })) })));
const shiftedMap = createConformalMap(shifted, settings);
for (const ring of glyph.rings) for (const p of ring.points) {
  const a = base.map(p), b = shiftedMap.map({ x: p.x * 3 + 13000, y: p.y * 3 - 27000 });
  close(b, { x: a.x * 3 + 13000, y: a.y * 3 - 27000 }, 1e-7);
}
assert.equal(createConformalMap(disk, { amount: .94, power: -1, spiral: 0 }).injectivity, 'certified-domain');
assert.equal(createConformalMap(disk, { amount: .94, power: 4, spiral: 4 }).injectivity, 'overlap-possible');
// In a multiple-covered image the correct body is nonzero winding, NOT parity.
// The two right-half-plane fourth roots of -1 both lie in this source annulus.
const annulus = prepareConformalGlyph([circle(60), circle(20, 0, 0, true)]);
const covered = deformConformalGlyph(annulus, { amount: .94, power: 4, spiral: 0 });
const point = { x: -120 / (4 * .94), y: 0 };
function winding(points, p) {
  let n = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (a.y <= p.y && b.y > p.y && cross > 0) n++;
    if (a.y > p.y && b.y <= p.y && cross < 0) n--;
  }
  return n;
}
assert.equal(covered.rings.reduce((n, r) => n + winding(r.points, point), 0), 2,
  'Even-odd would incorrectly erase an ink region with two source preimages');
console.log(JSON.stringify({ status: 'pass', cases, errorSamples, derivativeSamples,
  checks: 'identity, tiny limits, rational inverse, determinism, source ownership, loop, static phase, ring winding, finite geometry, chord error, Cauchy-Riemann, translation/scale, budget failure; not browser QA' }));
