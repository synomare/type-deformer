import assert from 'node:assert/strict';
import { grow as oracle, resample } from './solver.mjs';
import { createGrowthJob, grow, growthLoopAge, normalizeGrowthSettings, runGrowthJob } from './runtime.mjs';

const shape = result => result.rings.map(r => ({ area: r.area, points: r.points.map(p => [p.x, p.y]) }));
function ring(points) {
  return { points, area: points.reduce((a, p, i) => { const q = points[(i + 1) % points.length]; return a + p.x * q.y - q.x * p.y; }, 0) / 2 };
}
const circle = (r, x = 0, y = 0, hole = false) => {
  const points = Array.from({ length: 36 }, (_, i) => ({ x: x + r * Math.cos(i / 36 * Math.PI * 2), y: y + r * Math.sin(i / 36 * Math.PI * 2) }));
  return ring(hole ? points.reverse() : points);
};
const inputs = [
  [circle(28)],
  [circle(38), circle(15, 2, 3, true), circle(4, 50, -30)],
  [ring([[0,0],[18,0],[18,10],[6,10],[6,28],[0,28]].map(([x,y]) => ({x,y})))],
  [circle(5, -200, 80), circle(8, -170, 80), circle(6, -190, 115)]
];
for (const input of inputs) for (const settings of [{age:0}, {age:.1}, {age:.6,grain:2.5,memory:.0008,tension:.35}, {age:.4,seed:92,patch:.25,areaGain:.5}]) {
  const before = JSON.stringify(input), expected = oracle(input, settings);
  const actual = grow(input, settings);
  assert.deepEqual(shape(actual), shape(expected), 'Optimizations preserve exact coordinates');
  assert.equal(JSON.stringify(input), before, 'Caller source is immutable');
  const job = createGrowthJob(input, settings);
  while (job.status !== 'complete') job.advance({ budgetMs: Infinity, maxSteps: 7 });
  assert.deepEqual(shape(job.snapshot()), shape(expected), 'Chunk boundaries cannot change growth');
  assert.deepEqual(shape({rings:job.sample(settings.age)}), shape(expected), 'Final history is exact');
}

const input = inputs[1], job = createGrowthJob(input, {age:.3});
assert.equal(job.status, 'pending');
job.advance({budgetMs:0}); assert.equal(job.completedSteps, 0);
job.advance({budgetMs:Infinity,maxSteps:1});
assert.equal(job.status, 'paused'); assert.equal(job.completedSteps, 1);
assert.deepEqual(shape(job.snapshot()),shape(oracle(input,{age:1/960})));
let clock = 0; job.advance({budgetMs:3, now:()=>clock++});
assert.ok(job.completedSteps < job.totalSteps, 'Interruptible inside the force pass');
assert.deepEqual(shape(job.snapshot()),shape(oracle(input,{age:job.completedSteps/960})), 'Snapshots are atomic completed steps');
job.advance({budgetMs:Infinity,maxSteps:11-job.completedSteps}); job.checkpoint();
assert.deepEqual(shape({rings:job.sample(11/960)}),shape(job.snapshot()), 'Arbitrary requested age can be checkpointed');
job.advance({budgetMs:Infinity}); assert.equal(job.status,'complete');
const saved = shape(job.snapshot()), sample = job.sample(.3); sample[0].points[0].x += 999;
assert.deepEqual(shape(job.snapshot()),saved); assert.deepEqual(shape({rings:job.sample(.3)}),saved);
assert.ok(job.historyFrames > 2 && job.historyBytes > 0);
for(const r of job.snapshot().rings) assert.ok(r.points.every((p,i)=>p.u>=0&&p.u<1&&(!i||p.u>r.points[i-1].u)), 'Material IDs stay ordered after splits');
assert.deepEqual(shape({rings:job.sample(growthLoopAge(0,.3))}),shape({rings:job.sample(growthLoopAge(1,.3))}), 'Exact loop seam');
assert.equal(growthLoopAge(.5,3),0); assert.equal(growthLoopAge(.3,3,0),3);
assert.equal(growthLoopAge(-.25,3),growthLoopAge(.75,3));
assert.equal(createGrowthJob([]).progress,1);
assert.equal(normalizeGrowthSettings({grain:NaN}).grain,4);
const oversized = createGrowthJob([circle(1500)], {age:.02, grain:2.5}, {history:false});
oversized.advance({budgetMs:Infinity});
assert.ok(oversized.snapshot().initialPoints>4096);
assert.equal(oversized.snapshot().maxPoints,oversized.snapshot().initialPoints, 'Large input is retained; no generated points exceed its cap');
assert.equal(oversized.snapshot().rings.length,1);assert.equal(oversized.snapshot().budgetReached,true);
assert.throws(()=>createGrowthJob(null),TypeError);
assert.throws(()=>createGrowthJob([{area:1,points:[{x:NaN,y:0},{x:0,y:0},{x:1,y:1}]}]),TypeError);

const stopped=createGrowthJob(input,{age:.4});
stopped.advance({budgetMs:Infinity,maxSteps:5}); const snapshot=shape(stopped.snapshot());
stopped.cancel().advance({budgetMs:Infinity}); assert.equal(stopped.status,'cancelled');
assert.deepEqual(shape(stopped.snapshot()),snapshot);
const aborted=new AbortController();aborted.abort();
const emptyRun=createGrowthJob(input,{age:.1});let notifications=0;
await runGrowthJob(emptyRun,{signal:aborted.signal,onProgress:()=>notifications++});
assert.equal(emptyRun.status,'cancelled');assert.equal(notifications,0);assert.equal(emptyRun.completedSteps,0);
const interrupted=createGrowthJob(input,{age:.4});const controller=new AbortController();let yields=0;
await runGrowthJob(interrupted,{budgetMs:.1,signal:controller.signal,yieldTask:async()=>{yields++;controller.abort();},onProgress:()=>notifications++});
assert.equal(yields,1);assert.equal(interrupted.status,'cancelled');assert.equal(notifications,1);
const failing=createGrowthJob(input,{age:.4});
await assert.rejects(runGrowthJob(failing,{budgetMs:.1,yieldTask:()=>Promise.reject(new Error('scheduler failure'))}),/scheduler failure/);
assert.equal(failing.status,'cancelled');
const asyncJob=createGrowthJob(inputs[0],{age:.1});let ticks=0,callbacks=0;
const timer=setInterval(()=>ticks++,0);
await runGrowthJob(asyncJob,{budgetMs:.1,onProgress:()=>callbacks++});
clearInterval(timer);
assert.equal(asyncJob.status,'complete');assert.ok(ticks>0 && callbacks>1,'Macrotask fallback allows other event-loop work');
assert.deepEqual(shape(asyncJob.snapshot()),shape(oracle(inputs[0],{age:.1})));
console.log('Differential runtime: 16 exact oracle comparisons; sliced/async equality; atomic snapshots; material IDs/history; loop seam; abort/cancel/reject; event-loop yielding passed. Browser and phone not tested.');
