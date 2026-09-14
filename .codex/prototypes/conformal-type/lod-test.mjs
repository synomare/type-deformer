import assert from 'node:assert/strict';
import { prepareConformalGlyph, createConformalMap, CONFORMAL_TYPE_PRESETS } from './core.mjs';
import { compileConformalGlyph, renderConformalLod, conformalPixelTolerance } from './lod.mjs';
const circle = (r, reverse = false) => ({ points: Array.from({ length: 2048 }, (_, i) => {
  const a = (reverse ? -1 : 1) * i / 2048 * Math.PI * 2; return { x: r * Math.cos(a), y: r * Math.sin(a) };
}) });
const glyph = prepareConformalGlyph([circle(70), circle(32, true)]), compiled = compileConformalGlyph(glyph);
const before = JSON.stringify(compiled), samples = [];
const distanceToEdge = (p, a, b) => {
  const x = b.x - a.x, y = b.y - a.y, d = x * x + y * y;
  const t = d ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y) / d)) : 0;
  return Math.hypot(p.x - a.x - t * x, p.y - a.y - t * y);
};
let comparisons = 0;
for (const settings of [...Object.values(CONFORMAL_TYPE_PRESETS), { amount: .94, power: -3, spiral: 4 }, { amount: 0 }, { amount: .9, power: 0 }]) {
  for (const tolerance of [.2, .08, .005]) {
    const phase = .27, map = createConformalMap(glyph, settings, phase), result = renderConformalLod(compiled, settings, phase, { tolerance });
    assert.ok(result.maxErrorBound <= tolerance);
    assert.equal(result.rings.length, 2);
    assert.ok(result.rings.every(r => Math.sign(r.area) === Math.sign(r.sourceArea)));
    assert.deepEqual(result, renderConformalLod(compiled, settings, phase, { tolerance }));
    for (let r = 0; r < result.rings.length; r++) {
      const ring = result.rings[r], original = glyph.rings[r].points, n = original.length;
      for (let i = 0; i < ring.points.length; i++) {
        const [start, end] = ring.spans[i], a = ring.points[i], b = ring.points[(i + 1) % ring.points.length];
        for (let u = start; u < end; u = Math.min(end, Math.floor(u) + .5 <= u ? Math.floor(u) + 1 : Math.floor(u) + .5)) {
          const k = Math.floor(u), t = u - k, from = original[k % n], to = original[(k + 1) % n];
          const mapped = map.map({ x: from.x + t * (to.x - from.x), y: from.y + t * (to.y - from.y) });
          assert.ok(distanceToEdge(mapped, a, b) <= tolerance + 1e-8, 'Mapped original arc must remain inside the output error envelope');
          comparisons++;
        }
      }
    }
    samples.push({ tolerance, points: result.pointCount });
  }
}
assert.equal(JSON.stringify(compiled), before, 'LOD never mutates prepared source or hierarchy');
assert.ok(samples[0].points < glyph.rings.reduce((n, r) => n + r.points.length, 0) / 8, 'Smooth contour must actually reduce work');
assert.ok(samples[2].points > samples[0].points, 'Higher precision must restore detail');
assert.deepEqual(renderConformalLod(compiled, CONFORMAL_TYPE_PRESETS.coil, 0), renderConformalLod(compiled, CONFORMAL_TYPE_PRESETS.coil, 1));
assert.throws(() => renderConformalLod(compiled, CONFORMAL_TYPE_PRESETS.coil, 0, { maxPoints: 3 }), /budget/);
assert.deepEqual(renderConformalLod(compileConformalGlyph(prepareConformalGlyph([])), {}).rings, []);
for (const matrix of [{ a: 3, b: 0, c: 0, d: 3 }, { a: 0, b: -8, c: 8, d: 0 }, { a: 12, b: 6, c: -3, d: 1 }, { a: -.5, b: 0, c: 9, d: -2 }]) {
  const tolerance = conformalPixelTolerance(matrix);
  for (let i = 0; i < 360; i++) {
    const x = Math.cos(i / 180 * Math.PI) * tolerance, y = Math.sin(i / 180 * Math.PI) * tolerance;
    assert.ok(Math.hypot(matrix.a * x + matrix.c * y, matrix.b * x + matrix.d * y) <= .20000000001);
  }
}
assert.equal(conformalPixelTolerance({ a: 0, b: 0, c: 0, d: 0 }), 10);
assert.throws(() => conformalPixelTolerance({ a: Infinity, b: 0, c: 0, d: 1 }), TypeError);
assert.throws(() => conformalPixelTolerance({ a: 1e200, b: 0, c: 0, d: 1e200 }), RangeError);
assert.throws(() => conformalPixelTolerance({ a: 1e10, b: 0, c: 0, d: 1e10 }), RangeError);
console.log(JSON.stringify({ status: 'pass', states: samples.length, comparisons, points: samples.slice(0, 3),
  checks: 'source-arc error envelope, precision refinement, original ownership, loop, signed rings, explicit budget, physical-pixel skew/mirror/scale bounds; not a topology guarantee or browser test' }));
