import assert from 'node:assert/strict';
import { prepareMarblingGlyph, MARBLING_PRESETS } from './core.mjs';
import { createMarblingCompileTask, compileMarblingGlyph, renderMarblingLod, runMarblingLodTask } from './lod.mjs';
import { createMarblingSourcePool } from './source-pool.mjs';
import { createMarblingFramePool } from './frame-pool.mjs';

// Independent synchronous hierarchy oracle. Uses slice/reduce traversal,
// retaining the original inclusive source-arc and 4-root construction.
export function referenceCompile(glyph) {
  let nodeCount = 0;
  const trees = glyph.rings.map(({ points }) => {
    const n = points.length;
    function node(start, end) {
      const a = points[start % n], b = points[end % n], dx = b.x - a.x, dy = b.y - a.y;
      const arc = Array.from({ length: end - start + 1 }, (_, i) => points[(start + i) % n]);
      const box = arc.reduce((v, p) => [Math.min(v[0], p.x), Math.min(v[1], p.y), Math.max(v[2], p.x), Math.max(v[3], p.y)], [Infinity, Infinity, -Infinity, -Infinity]);
      const sourceError = Math.sqrt(Math.max(...arc.map(p => {
        const t = dx * dx + dy * dy ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
        return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
      })));
      nodeCount++;
      const mid = Math.floor((start + end) / 2);
      return { start, end, a, b, box, sourceError, left: end - start > 1 ? node(start, mid) : null, right: end - start > 1 ? node(mid, end) : null };
    }
    return Array.from({ length: Math.min(4, n) }, (_, i) => node(Math.floor(i * n / Math.min(4, n)), Math.floor((i + 1) * n / Math.min(4, n))));
  });
  return { glyph, trees, nodeCount };
}
const circle = (n, scale = 1, winding = 1) => ({ points: Array.from({ length: n }, (_, i) => ({
  x: 70 * scale * Math.cos(winding * i * 2 * Math.PI / n), y: 90 * scale * Math.sin(winding * i * 2 * Math.PI / n),
})) });
const glyphs = [prepareMarblingGlyph([]), prepareMarblingGlyph([circle(3)]),
  prepareMarblingGlyph([circle(1024), circle(128, .35, -1)]), prepareMarblingGlyph([circle(4097)])];
for (const glyph of glyphs) {
  const oracle = referenceCompile(glyph), sync = compileMarblingGlyph(glyph);
  assert.deepEqual(sync, oracle);
  for (const size of [1, 31, 2048]) {
    const task = createMarblingCompileTask(glyph);
    while (task.status === 'working') {
      const before = task.progress.workCount;
      task.step({ maxWork: size, maxMs: Infinity });
      assert.ok(task.progress.workCount - before <= size);
    }
    assert.deepEqual(task.result, oracle);
    assert.ok(Object.isFrozen(task.result) && Object.isFrozen(task.result.trees));
  }
  const asynchronous = await runMarblingLodTask(createMarblingCompileTask(glyph), { maxWork: 256, yieldWork: () => new Promise(resolve => setImmediate(resolve)) });
  assert.deepEqual(asynchronous, oracle);
}
const glyph = glyphs[2], task = createMarblingCompileTask(glyph);
let clock = 0;
task.step({ maxWork: 10000, maxMs: 2, now: () => clock++ });
assert.equal(task.progress.workCount, 64, 'wall-clock checked within a point scan');
const stopped = task.progress.workCount;
assert.equal(task.cancel(), true); assert.equal(task.status, 'cancelled');
assert.equal(task.cancel(), false); task.step(); assert.equal(task.progress.workCount, stopped);
assert.equal(task.result, null);
const aborted = createMarblingCompileTask(glyph), controller = new AbortController();
const abortReason = new Error('font revision changed');
await assert.rejects(runMarblingLodTask(aborted, { signal: controller.signal, maxWork: 1,
  yieldWork: () => { controller.abort(abortReason); return new Promise(() => {}); } }), error => error === abortReason);
assert.equal(aborted.status, 'cancelled');
const thrown = createMarblingCompileTask(glyph);
await assert.rejects(runMarblingLodTask(thrown, { maxWork: 1, yieldWork: () => { throw new Error('scheduler failed'); } }), /scheduler failed/);
assert.equal(thrown.status, 'cancelled');

const pool = createMarblingSourcePool(), loadCounts = [0, 0, 0];
const sources = glyphs.slice(1).map((g, i) => ({ key: `font/grapheme/capture-${i}`, revision: '1', load: ({ maxPoints }) => {
  loadCounts[i]++; assert.ok(maxPoints >= g.pointCount); return g;
} }));
const requests = Array.from({ length: 300 }, (_, i) => sources[i % 3]);
let tickets = pool.sync(requests);
assert.equal(pool.state().total, 3); assert.equal(pool.state().loads, 0, 'sync does not block on preparation');
pool.setPaused(true); assert.equal(pool.advance(), false); pool.setPaused(false);
// Repeated scene syncs must not reset round-robin fairness or recreate work.
for (let i = 0; i < 3; i++) { pool.sync(requests); pool.advance({ maxWork: 1 }); }
assert.deepEqual(loadCounts, [1, 1, 1]);
pool.sync(requests.map(r => ({ ...r, load: () => { throw new Error('mutable per-frame loader must not replace the source revision'); } })));
while (pool.state().pending) { pool.sync(requests); pool.advance({ maxWork: 512, maxMs: Infinity }); }
assert.equal(pool.state().builds, 3); assert.ok(tickets.every(t => t.status === 'ready'));
for (let i = 0; i < tickets.length; i++) assert.equal(tickets[i].result, tickets[i % 3].result);
const first = tickets[0].result;
const state = pool.state();
assert.equal(pool.peek(sources[0]).result, first); assert.equal(pool.peek({ key: 'absent', revision: '1' }), null);
assert.deepEqual(pool.state(), state, 'partial export inspection cannot evict live sources');
assert.throws(() => pool.sync([...requests, { key: 'bad', revision: '2' }]), /loader/);
assert.deepEqual(pool.state(), state);
const reversed = pool.sync([...requests].reverse());
assert.deepEqual(reversed.map(t => t.result).reverse(), tickets.map(t => t.result));
const changed = pool.sync([{ ...sources[0], revision: '2' }]);
assert.equal(tickets[0].status, 'missing'); assert.equal(changed[0].status, 'pending');
pool.advance(); pool.sync([]); assert.equal(pool.state().pending, false); assert.deepEqual(pool.state().usage, { points: 0, nodes: 0 });
assert.equal(changed[0].status, 'missing');
const failPool = createMarblingSourcePool({ pointLimit: 4, nodeLimit: 100 });
const bad = failPool.sync([{ ...sources[1], load: () => glyph }]);
failPool.advance(); assert.equal(bad[0].status, 'error'); assert.equal(bad[0].result, null);
assert.deepEqual(failPool.state().usage, { points: 0, nodes: 0 });
const failures = failPool.state().loads; failPool.sync([{ ...sources[1], load: () => glyph }]);
assert.equal(failPool.advance(), false); assert.equal(failPool.state().loads, failures);
failPool.retry(); assert.equal(failPool.state().pending, true); failPool.advance(); assert.equal(failPool.state().loads, failures + 1);
failPool.reset(); assert.equal(bad[0].status, 'missing');
const limitPool = createMarblingSourcePool({ pointLimit: glyphs[1].pointCount, nodeLimit: 3 });
const limits = limitPool.sync([sources[0], { key: 'space', revision: '1', load: () => glyphs[0] }]);
while (limitPool.state().pending) limitPool.advance();
assert.ok(limits.every(t => t.status === 'ready'), 'empty source remains valid at a full budget');
const nodePool = createMarblingSourcePool({ nodeLimit: 2 });
const nodeOverflow = nodePool.sync([sources[0]]); nodePool.advance();
assert.equal(nodeOverflow[0].status, 'error'); assert.match(nodeOverflow[0].error.message, /budget/);
const activePool = createMarblingSourcePool({ pointLimit: 3, nodeLimit: 3 });
const active = activePool.sync([{ key: 'kept', revision: '1', load: () => glyphs[1] }]);
while (activePool.state().pending) activePool.advance();
const retained = active[0].result;
const extra = activePool.sync([{ key: 'kept', revision: '1', load: () => glyphs[1] },
  { key: 'over-budget', revision: '1', load: () => glyphs[1] }]);
while (activePool.state().pending) activePool.advance();
assert.equal(extra[0].result, retained, 'over-budget addition cannot evict a valid active source');
assert.equal(extra[1].status, 'error');
assert.deepEqual(activePool.state().usage, { points: 3, nodes: 3 });
const broken = createMarblingSourcePool({ taskFactory: () => { throw new Error('compile unavailable'); } });
const brokenTickets = broken.sync([sources[0]]); broken.advance();
assert.match(brokenTickets[0].error.message, /unavailable/); assert.equal(broken.state().usage.points, 0);
const loaderFailure = createMarblingSourcePool();
const errorTickets = loaderFailure.sync([{ key: 'font', revision: 'broken', load() { throw new Error('font unavailable'); } }]);
loaderFailure.advance(); assert.match(errorTickets[0].error.message, /font unavailable/);

// The new prepared source can feed the existing phase/tolerance frame pool
// without any output change or duplicate-source geometry builds.
pool.sync(requests); while (pool.state().pending) pool.advance({ maxWork: 4096, maxMs: Infinity });
tickets = pool.sync(requests);
const frame = createMarblingFramePool();
const frameTickets = frame.sync(tickets.map(t => ({ compiled: t.result, settings: MARBLING_PRESETS.eddy, phase: .37, tolerance: .08 })));
while (frame.state().pending) frame.advance();
assert.equal(frame.state().builds, 3);
for (let i = 0; i < 3; i++) assert.deepEqual(frameTickets[i].result,
  renderMarblingLod(referenceCompile(glyphs[i + 1]), MARBLING_PRESETS.eddy, .37, { tolerance: .08 }));
pool.reset(); assert.equal(tickets[0].status, 'missing');
assert.throws(() => createMarblingSourcePool({ pointLimit: 0 }), /limit/);
console.log('Marbling source: exact independent hierarchy oracle; work/time slicing; yield/abort/cancel; 300 leases -> 3 sources and 3 frames; revision/fairness/paused lifecycle; read-only preflight; transactional validation; source/node reservations and stable error/retry passed. Offline, not browser/UI.');
