import assert from 'node:assert/strict';
import { prepareMarblingGlyph, createMarblingMap, MARBLING_MODES, MARBLING_PRESETS } from './core.mjs';
import { compileMarblingGlyph, createMarblingLodTask, renderMarblingLod, runMarblingLodTask, marblingPixelTolerance } from './lod.mjs';

const circle = (cx, cy, rx, ry, count, sign = 1) => ({ points: Array.from({ length: count }, (_, i) => {
  const angle = sign * i * Math.PI * 2 / count;
  return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
}) });
const glyph = prepareMarblingGlyph([circle(0, 0, 73, 91, 768), circle(4, -23, 25, 31, 192, -1),
  circle(-2, 49, 19, 22, 128, -1), circle(91, -76, 4, 6, 32)]);
const compiled = compileMarblingGlyph(glyph), snapshot = JSON.stringify(glyph);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
  const t = d2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / d2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
let oracleSamples = 0, derivativeSamples = 0, largestError = 0;
const counts = [];
for (const mode of MARBLING_MODES) for (const extreme of [false, true]) {
  const settings = { ...MARBLING_PRESETS[mode], ...(extreme ? { amount: 2.4, focus: .85, circulation: 3.3 } : {}) };
  const transform = createMarblingMap(glyph, settings, .19);
  const output = renderMarblingLod(compiled, settings, .19, { tolerance: .08 });
  assert.ok(output.maxErrorBound <= .08);
  assert.equal(output.rings.length, glyph.rings.length);
  for (let ri = 0; ri < output.rings.length; ri++) {
    const ring = output.rings[ri], original = glyph.rings[ri].points;
    assert.equal(Math.sign(ring.area), Math.sign(glyph.rings[ri].area));
    for (let i = 0; i < ring.points.length; i++) {
      const [start, end] = ring.spans[i], a = ring.points[i], b = ring.points[(i + 1) % ring.points.length];
      const count = Math.max(4, Math.ceil((end - start) * 4));
      for (let j = 0; j <= count; j++) {
        const u = start + (end - start) * j / count, index = Math.floor(u), t = u - index;
        const point = transform.map(lerp(original[index % original.length], original[(index + 1) % original.length], t));
        const error = segmentDistance(point, a, b);
        largestError = Math.max(largestError, error); oracleSamples++;
        assert.ok(error <= .080001, `${mode} source arc oracle ${error}`);
      }
    }
  }
  // Bound each entire box, not only the centre derivative. All sampled
  // directions of finite differences must fall below its singular-value cap.
  for (let i = 0; i < 20; i++) {
    const x = Math.sin(i * 3.71) * 140, y = Math.cos(i * 1.93) * 130, r = .25 + (i % 4) * 3;
    const box = [x - r, y - r, x + r, y + r], bound = transform.derivativeBoundForBox(box);
    for (let k = 0; k < 10; k++) {
      const p = { x: x + Math.cos(k) * r * .95, y: y + Math.sin(k * 2) * r * .95 };
      const h = .00001, angle = k * 2.37, dx = Math.cos(angle) * h, dy = Math.sin(angle) * h;
      const a = transform.map({ x: p.x - dx, y: p.y - dy }), b = transform.map({ x: p.x + dx, y: p.y + dy });
      const derivative = Math.hypot(a.x - b.x, a.y - b.y) / (2 * h);
      assert.ok(derivative <= bound * 1.00001, `${mode} box derivative underestimated: ${derivative} > ${bound}`);
      derivativeSamples++;
    }
  }
  const sliced = createMarblingLodTask(compiled, settings, .19, { tolerance: .08 });
  assert.equal(sliced.result, null);
  while (sliced.status === 'working') {
    const before = sliced.progress.workCount;
    sliced.step({ maxWork: 7, now: () => 0 });
    assert.ok(sliced.progress.workCount - before <= 7);
    if (sliced.status === 'working') assert.equal(sliced.result, null, 'no partial publication');
  }
  assert.deepEqual(sliced.result, output, 'chunk schedule never changes output');
  assert.ok(Object.isFrozen(output.rings[0].points[0]));
  assert.ok(Object.isFrozen(output.rings[0].spans[0]));
  counts.push({ mode, extreme, points: output.pointCount });
}
assert.equal(JSON.stringify(glyph), snapshot);
const settings = MARBLING_PRESETS.plume;
const seam = renderMarblingLod(compiled, settings, 0);
assert.deepEqual(seam, renderMarblingLod(compiled, settings, 1));
assert.deepEqual(renderMarblingLod(compiled, { ...settings, motion: 0 }, .2), renderMarblingLod(compiled, { ...settings, motion: 0 }, .9));
const native = renderMarblingLod(compiled, { amount: 0 });
assert.deepEqual(native.rings.map(r => r.points), glyph.rings.map(r => r.points));
assert.equal(native.identity, true);
assert.equal(renderMarblingLod(compileMarblingGlyph(prepareMarblingGlyph([])), {}).pointCount, 0);
const lowBudget = createMarblingLodTask(compiled, settings, 0, { maxPoints: 3 });
assert.throws(() => { while (lowBudget.status === 'working') lowBudget.step(); }, /budget/);
assert.equal(lowBudget.status, 'error');
assert.equal(lowBudget.result, null);
assert.equal(lowBudget.progress.pendingNodes, 0);
assert.throws(() => renderMarblingLod(compileMarblingGlyph(prepareMarblingGlyph([{ points: [{ x: 0, y: 0 }, { x: 190, y: 0 }, { x: 0, y: 190 }] }])), settings, 0, { maxDepth: 0, tolerance: .00001 }), /budget/);
let ticks = 0;
const timer = setInterval(() => { ticks++; }, 0);
const asynchronous = createMarblingLodTask(compiled, settings, .11);
const asyncOutput = await runMarblingLodTask(asynchronous, { maxWork: 40, maxMs: 3 });
clearInterval(timer);
assert.ok(ticks > 1, 'real event-loop yielding, not only microtasks');
assert.deepEqual(asyncOutput, renderMarblingLod(compiled, settings, .11));
const cancelled = createMarblingLodTask(compiled, settings);
cancelled.step({ maxWork: 2 });
assert.equal(cancelled.cancel(), true);
assert.equal(cancelled.cancel(), false);
assert.equal(cancelled.step(), 'cancelled');
assert.equal(cancelled.result, null);
assert.equal(cancelled.progress.pendingNodes, 0);
await assert.rejects(runMarblingLodTask(cancelled), { name: 'AbortError' });
const ac = new AbortController(), reason = new Error('replace font');
const replace = createMarblingLodTask(compiled, settings);
await assert.rejects(runMarblingLodTask(replace, { signal: ac.signal, maxWork: 1, yieldWork: () => { ac.abort(reason); return new Promise(() => {}); } }), error => error === reason);
assert.equal(replace.status, 'cancelled');
assert.equal(replace.progress.pendingNodes, 0);
const preaborted = new AbortController(); preaborted.abort(reason);
await assert.rejects(runMarblingLodTask(createMarblingLodTask(compiled, settings), { signal: preaborted.signal }), error => error === reason);
const rejected = createMarblingLodTask(compiled, settings);
await assert.rejects(runMarblingLodTask(rejected, { maxWork: 1, yieldWork: () => Promise.reject(reason) }), error => error === reason);
assert.equal(rejected.status, 'cancelled');
const clocked = createMarblingLodTask(compiled, settings);
let clock = 0;
clocked.step({ maxWork: 1000, maxMs: 4, now: () => clock++ });
assert.equal(clocked.progress.workCount, 4);
for (const matrix of [{ a: 1, b: 0, c: 0, d: 1 }, { a: -4, b: 7, c: 20, d: 5 }, { a: .1, b: -.1, c: .1, d: .1 }]) {
  const tolerance = marblingPixelTolerance(matrix);
  for (let i = 0; i < 100; i++) {
    const x = Math.cos(i) * tolerance, y = Math.sin(i) * tolerance;
    assert.ok(Math.hypot(matrix.a * x + matrix.c * y, matrix.b * x + matrix.d * y) <= .2000001);
  }
}
assert.equal(marblingPixelTolerance({ a: 0, b: 0, c: 0, d: 0 }), 10);
assert.throws(() => marblingPixelTolerance({ a: 1e7, b: 0, c: 0, d: 1e7 }), /precision budget/);
assert.throws(() => marblingPixelTolerance({ a: NaN, b: 0, c: 0, d: 1 }), /Invalid/);
console.log(JSON.stringify({ status: 'pass', oracleSamples, derivativeSamples, largestError, ticks, counts,
  assertions: 'source-arc accuracy, box derivative bounds, winding, retained source, atomic sync/sliced/async equality, real task yielding, abort during pending yield, failure/cancel cleanup, native zero, loop, static and affine precision' }, null, 2));
