import assert from 'node:assert/strict';
import { MARBLING_MODES, MARBLING_PRESETS, normalizeMarblingSettings, prepareMarblingGlyph,
  createMarblingMap, deformMarblingGlyph } from './core.mjs';

const source = [
  { points: [{ x: -67, y: -90 }, { x: 73, y: -90 }, { x: 73, y: 90 }, { x: -67, y: 90 }] },
  { points: [{ x: -23, y: -48 }, { x: -23, y: 46 }, { x: 29, y: 46 }, { x: 29, y: -48 }] },
  { points: [{ x: 86, y: -85 }, { x: 97, y: -82 }, { x: 92, y: -64 }] },
];
const snapshot = JSON.stringify(source), glyph = prepareMarblingGlyph(source);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const result = [];
function winding(rings, point) {
  let number = 0;
  for (const ring of rings) for (let i = 0; i < ring.points.length; i++) {
    const a = ring.points[i], b = ring.points[(i + 1) % ring.points.length];
    const side = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y);
    if (a.y <= point.y && b.y > point.y && side > 0) number++;
    if (a.y > point.y && b.y <= point.y && side < 0) number--;
  }
  return number;
}

for (const mode of MARBLING_MODES) {
  const settings = MARBLING_PRESETS[mode];
  const map = createMarblingMap(glyph, settings, .173);
  let maxInverse = 0, maxDet = 0;
  for (let i = 0; i < 70; i++) {
    const point = { x: Math.sin(i * 3.71) * 210, y: Math.cos(i * 1.93) * 230 };
    maxInverse = Math.max(maxInverse, distance(point, map.inverse(map.map(point))), distance(point, map.map(map.inverse(point))));
    const h = .00001;
    const l = map.map({ x: point.x - h, y: point.y }), r = map.map({ x: point.x + h, y: point.y });
    const t = map.map({ x: point.x, y: point.y - h }), b = map.map({ x: point.x, y: point.y + h });
    const determinant = ((r.x - l.x) * (b.y - t.y) - (b.x - t.x) * (r.y - l.y)) / (4 * h * h);
    maxDet = Math.max(maxDet, Math.abs(determinant - 1));
  }
  assert.ok(maxInverse < 1e-8, `${mode} inverse: ${maxInverse}`);
  assert.ok(maxDet < 2e-5, `${mode} determinant: ${maxDet}`);
  const started = performance.now();
  const output = deformMarblingGlyph(glyph, settings, .173, { tolerance: .08 });
  assert.equal(output.rings.length, source.length);
  assert.ok(output.maxErrorBound <= .08);
  let oracleError = 0, areaError = 0;
  for (let r = 0; r < output.rings.length; r++) {
    const ring = output.rings[r], original = glyph.rings[r];
    assert.equal(Math.sign(ring.area), Math.sign(original.area));
    areaError = Math.max(areaError, Math.abs(ring.area - original.area) / Math.abs(original.area));
    for (let i = 0; i < ring.points.length; i++) {
      const u0 = ring.material[i], u1 = i + 1 === ring.points.length ? original.points.length : ring.material[i + 1];
      const sourceEdge = Math.floor(u0), a = original.points[sourceEdge], b = original.points[(sourceEdge + 1) % original.points.length];
      for (let k = 1; k < 8; k++) {
        const t = k / 8, u = u0 + (u1 - u0) * t - sourceEdge;
        const expected = map.map(lerp(a, b, u));
        const chord = lerp(ring.points[i], ring.points[(i + 1) % ring.points.length], t);
        oracleError = Math.max(oracleError, distance(expected, chord));
      }
    }
  }
  assert.ok(oracleError <= .080001, `${mode} oracle error: ${oracleError}`);
  assert.ok(areaError < .01, `${mode} polygon area error: ${areaError}`);
  for (const [point, expected] of [[{ x: -47, y: 0 }, 1], [{ x: 0, y: 0 }, 0], [{ x: 0, y: 120 }, 0], [{ x: 92, y: -78 }, 1]]) {
    assert.equal(winding(output.rings, map.map(point)), expected, `${mode} counter/component transport`);
  }
  assert.deepEqual(output, deformMarblingGlyph(glyph, settings, .173, { tolerance: .08 }));
  const seam0 = deformMarblingGlyph(glyph, settings, 0), seam1 = deformMarblingGlyph(glyph, settings, 1);
  assert.deepEqual(seam0, seam1);
  assert.deepEqual(deformMarblingGlyph(glyph, { ...settings, motion: 0 }, .19), deformMarblingGlyph(glyph, { ...settings, motion: 0 }, .87));
  const nearStart = createMarblingMap(glyph, settings, .000001), nearEnd = createMarblingMap(glyph, settings, .999999);
  assert.ok(distance(nearStart.map({ x: 32, y: 18 }), nearEnd.map({ x: 32, y: 18 })) < .02);
  assert.notDeepEqual(map.map({ x: 32, y: 18 }), createMarblingMap(glyph, settings, .53).map({ x: 32, y: 18 }));
  assert.throws(() => deformMarblingGlyph(glyph, settings, 0, { maxPoints: 3 }), /budget exceeded/);
  assert.throws(() => deformMarblingGlyph(glyph, settings, 0, { maxDepth: 0, tolerance: .00001 }), /budget exceeded/);
  const native = deformMarblingGlyph(glyph, { ...settings, amount: 0 }, .173);
  assert.equal(native.identity, true);
  assert.deepEqual(native.rings.map(r => r.points), source.map(r => r.points));
  const extreme = createMarblingMap(glyph, { ...settings, amount: 4, pitch: 12, focus: 1, circulation: -4 }, .18);
  for (let i = 0; i < 100; i++) {
    const point = { x: Math.sin(i * 2.1) * 200, y: Math.cos(i * 5.3) * 200 };
    assert.ok(distance(point, extreme.inverse(extreme.map(point))) < 1e-7);
  }
  result.push({ mode, points: output.pointCount, maxInverse, maxDet, oracleError, areaError, testMs: performance.now() - started });
}
assert.equal(JSON.stringify(source), snapshot);
assert.ok(Object.isFrozen(glyph.rings[0].points[0]));
assert.deepEqual(deformMarblingGlyph(prepareMarblingGlyph([]), {}, .2).rings, []);
assert.throws(() => prepareMarblingGlyph(null), /array/);
assert.throws(() => prepareMarblingGlyph([{ points: [{ x: 1, y: 2 }] }]), /three points/);
assert.throws(() => prepareMarblingGlyph([{ points: [{ x: NaN, y: 2 }, { x: 0, y: 0 }, { x: 1, y: 2 }] }]), /non-finite/);
assert.equal(normalizeMarblingSettings({ amount: Infinity }).amount, .65);
assert.equal(normalizeMarblingSettings({ mode: 'not-an-operator', pitch: 0 }).mode, 'rake');
assert.equal(normalizeMarblingSettings({ pitch: 0 }).pitch, 12);
assert.ok(glyph.anchors.some(p => distance(p, { x: 3, y: -1 }) < 1e-8), 'counter centroid is an anatomical anchor');
const reversed = prepareMarblingGlyph(source.map(r => ({ points: [...r.points].reverse() })));
assert.deepEqual(reversed.anchors, glyph.anchors, 'all winding reversed leaves anatomy unchanged');
const offset = { x: 10000, y: -15000 };
const translated = prepareMarblingGlyph(source.map(r => ({ points: r.points.map(p => ({ x: p.x + offset.x, y: p.y + offset.y })) })));
for (const mode of MARBLING_MODES) {
  const a = createMarblingMap(glyph, MARBLING_PRESETS[mode], .28), b = createMarblingMap(translated, MARBLING_PRESETS[mode], .28);
  for (const point of source[0].points) {
    const moved = b.map({ x: point.x + offset.x, y: point.y + offset.y });
    assert.ok(distance(a.map(point), { x: moved.x - offset.x, y: moved.y - offset.y }) < 1e-8, 'source translation covariant');
  }
}
console.log(JSON.stringify({ status: 'pass', assertions: 'inverse, local area, contour accuracy, ink/counter winding, identity, loop, static, immutable, empty, budgets, extreme inverse', result }, null, 2));
