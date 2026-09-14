import assert from 'node:assert/strict';
import { createContactGuard, vertexEdgeHit } from './contacts.mjs';
import { createGrowthJob, grow } from './runtime.mjs';
import { grow as oldGrowth } from './solver.mjs';

const node = (x, y, mx = 0, my = 0) => ({ x, y, mx, my });
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, message);
const a = node(0, 0), b = node(2, 0), p = node(1, 1, 0, -2);
const hit = vertexEdgeHit(p, a, b);
near(hit.time, .5); near(hit.u, .5); near(hit.nx, 0); near(hit.ny, 1);
assert.equal(vertexEdgeHit(node(1, 1, 0, 2), a, b), null, 'Separating motion is unchanged');
assert.equal(vertexEdgeHit(node(1, 1, 2, 0), a, b), null, 'Parallel motion is unchanged');
assert.equal(vertexEdgeHit(node(3, 1, 0, -2), a, b), null, 'No contact outside finite edge');
near(vertexEdgeHit(node(0, 1, 0, -2), a, b).u, 0, 'Edge endpoint is included');
near(vertexEdgeHit(node(1, 1), node(0, 0, 0, 2), node(2, 0, 0, 2)).time, .5, 'Moving edge hits static vertex');
assert.equal(vertexEdgeHit(p, a, a), null, 'Degenerate edge has no valid normal');
// Start and end orientations have the same sign: endpoint-only tests miss this.
const tunnel = vertexEdgeHit(node(.6, .1, -1, -.2), node(0, 0), node(1, 0, 0, 1));
near(tunnel.time, (.8 - Math.sqrt(.24)) / 2, 'Quadratic time of impact catches tunneling');
for (const scale of [.1, 1, 10]) for (const angle of [0, .8, 2.9]) {
  const transform = v => node(123 + scale * (v.x * Math.cos(angle) - v.y * Math.sin(angle)),
    -217 + scale * (v.x * Math.sin(angle) + v.y * Math.cos(angle)),
    scale * (v.mx * Math.cos(angle) - v.my * Math.sin(angle)), scale * (v.mx * Math.sin(angle) + v.my * Math.cos(angle)));
  const transformed = vertexEdgeHit(...[p, a, b].map(transform));
  near(transformed.time, .5); near(transformed.u, .5);
}
assert.throws(() => createContactGuard(0), RangeError);

function ring(coordinates, hole = false) {
  const points = coordinates.map(([x, y]) => node(x, y)); if (hole) points.reverse();
  return { points, area: signedArea(points) };
}
function signedArea(ps) {
  return ps.reduce((area, p, i) => { const q = ps[(i + 1) % ps.length]; return area + p.x * q.y - q.x * p.y; }, 0) / 2;
}
function crossings(rings) {
  const edges = []; rings.forEach((r, ri) => r.points.forEach((a, i) => edges.push({ a, b: r.points[(i + 1) % r.points.length], ri, i, n: r.points.length })));
  const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); let count = 0;
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const a = edges[i], b = edges[j];
    if (a.ri === b.ri && (Math.abs(a.i - b.i) <= 1 || Math.abs(a.i - b.i) === a.n - 1)) continue;
    if (Math.max(a.a.x, a.b.x) < Math.min(b.a.x, b.b.x) || Math.max(b.a.x, b.b.x) < Math.min(a.a.x, a.b.x)
      || Math.max(a.a.y, a.b.y) < Math.min(b.a.y, b.b.y) || Math.max(b.a.y, b.b.y) < Math.min(a.a.y, a.b.y)) continue;
    if (orient(a.a, a.b, b.a) * orient(a.a, a.b, b.b) < -1e-10
      && orient(b.a, b.b, a.a) * orient(b.a, b.b, a.b) < -1e-10) count++;
  }
  return count;
}
function inside(p, ps) {
  let within = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const a = ps[i], b = ps[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) within = !within;
  }
  return within;
}
const shape = r => r.rings.map(r => r.points.map(p => [p.x, p.y]));
const finish = iterator => { while (!iterator.next().done) { /* deterministic cooperative slices */ } };
const rect = (x, y, w, h, hole = false) => ring([[x,y],[x+w,y],[x+w,y+h],[x,y+h]], hole);

// Exercise actual projection, not only the hit predicate. Edges would cross
// during the step even though the small rectangle finishes on the other side.
const moving = [rect(0, 0, 10, 1), rect(4, 2, 2, 1)];
for (const v of moving[1].points) v.my = -4;
const original = JSON.stringify(moving.map(r => r.points.map(v => [v.x, v.y])));
const guard = createContactGuard(3); finish(guard.constrain(moving));
assert.equal(JSON.stringify(moving.map(r => r.points.map(v => [v.x, v.y]))), original, 'Projection only edits proposed movement');
assert.ok(guard.stats.contacts > 0); assert.equal(guard.stats.stops, 0);
for (let t = 0; t <= 1; t += .02) {
  const moved = moving.map(r => ({ points: r.points.map(v => ({ x: v.x + t * v.mx, y: v.y + t * v.my })) }));
  assert.equal(crossings(moved), 0, 'Constrained step remains separated at intermediate positions');
}
const zero = [rect(0, 0, 4, 4), rect(10, 0, 4, 4)], zeroBefore = JSON.stringify(zero);
finish(guard.constrain(zero)); assert.equal(JSON.stringify(zero), zeroBefore);
const stats = guard.stats; guard.dispose(); assert.deepEqual(guard.stats, stats, 'Disposal preserves diagnostics');

// Original synthetic double chamber with a narrow waist. No font data or
// artwork is redistributed. The old point-only solver crosses at both grains.
const source = [ring([[0,0],[80,0],[80,50],[50,50],[50,54],[80,54],[80,104],[0,104],[0,54],[30,54],[30,50],[0,50]]),
  rect(7,7,66,36,true), rect(7,61,66,36,true)];
for (const grain of [3, 8]) {
  const settings = { age: 1.5, grain, tension: .22, memory: .0015, patch: 1, areaGain: 1.6, seed: 31 };
  assert.ok(crossings(oldGrowth(source, { ...settings, age: .15 }).rings) > 0, 'Regression fixture reproduces old failure');
  const before = JSON.stringify(source), job = createGrowthJob(source, settings);
  for (let step = 0; step <= 1440; step += 12) {
    job.advance({ budgetMs: Infinity, maxSteps: step - job.completedSteps });
    assert.equal(crossings(job.snapshot().rings), 0, 'Every history checkpoint stays uncrossed');
  }
  for (let i = 0; i < 150; i++) {
    const rings = job.sample(i * .01 + .003);
    assert.equal(crossings(rings), 0, 'Playback between checkpoints also stays uncrossed');
    for (const r of rings) {
      assert.ok(r.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
      assert.equal(Math.sign(signedArea(r.points)), Math.sign(r.area), 'Ring winding survives');
      if (r.area < 0) assert.ok(r.points.every(p => inside(p, rings[0].points)), 'Both counters remain inside the body');
    }
  }
  assert.equal(JSON.stringify(source), before);
  const result = job.snapshot(); assert.ok(result.contact.contacts > 0); assert.equal(result.contact.stops, 0);
  assert.ok(result.maxPoints > result.initialPoints * 1.2, 'Contact does not prevent growth or refinement');
  const chunked = createGrowthJob(source, settings);
  while (chunked.status !== 'complete') chunked.advance({ budgetMs: Infinity, maxSteps: 7 });
  assert.deepEqual(shape(chunked.snapshot()), shape(result), 'Contact is independent of chunking');
  assert.deepEqual(chunked.snapshot().contact, result.contact);
  assert.deepEqual(shape(grow(source, settings)), shape(result), 'No-history mode has the same geometry');
}
// Cancel in an unfinished, potentially projected step. No partial coordinates
// become public, and restarting the same input is still deterministic.
const cancelled = createGrowthJob(source, { age: .3, grain: 8, tension: .22, areaGain: 1.6 });
cancelled.advance({ budgetMs: Infinity, maxSteps: 100 });
let clock = 0; cancelled.advance({ budgetMs: 5, now: () => clock++ });
const completed = cancelled.completedSteps, atomic = shape(cancelled.snapshot());
cancelled.cancel(); assert.deepEqual(shape(cancelled.snapshot()), atomic);
const replay = createGrowthJob(source, { age: .3, grain: 8, tension: .22, areaGain: 1.6 });
replay.advance({ budgetMs: Infinity, maxSteps: completed }); assert.deepEqual(shape(replay.snapshot()), atomic);
console.log('Differential contacts: continuous/moving-edge/tunneling hits; finite-edge rejection; projection; 2 reproduced regressions; 242 checkpoints + 300 playback samples; winding/counter containment; growth; chunk equality and atomic cancellation passed. Tolerant geometry tests, not an exact topology proof or browser QA.');
