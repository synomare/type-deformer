import assert from 'node:assert/strict';
import { createGrowthHistory, createHistoryRefiner } from './history.mjs';
import { createContactGuard } from './contacts.mjs';
import { createGrowthJob, sampleGrowthHistory } from './runtime.mjs';
import { grow as oldGrowth } from './solver.mjs';

const rect = (x, y, w = .6, h = .6) => ({ area: w * h,
  points: [[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([x,y],i) => ({x,y,u:i/4})) });
const frame = (rings, step) => ({step,rings:rings.map(r=>({area:r.area,data:Float64Array.from(r.points.flatMap(p=>[p.u,p.x,p.y]))}))});
const coords = rings => rings.map(r=>r.points.map(p=>[p.x,p.y]));
function chord(from, to) {
  const a=sampleGrowthHistory([from,to],from.step), b=sampleGrowthHistory([from,to],to.step);
  return a.map((r,ri)=>({points:r.points.map((p,i)=>({...p,mx:b[ri].points[i].x-p.x,my:b[ri].points[i].y-p.y}))}));
}
const detector=createContactGuard(4);
const route=Array.from({length:13},(_,i)=>frame([rect(-2,-.5,4,1),rect(-3*Math.cos(i/12*Math.PI)-.3,-3*Math.sin(i/12*Math.PI)-.3)],i));
assert.ok(detector.intersects(chord(route[0],route[12])), 'A shortcut through the obstacle reproduces the history defect');
const frozen=JSON.stringify(route),refiner=createHistoryRefiner(4,{tolerance:10});
const selected=[route[0],...refiner.select(route)];
assert.ok(refiner.stats.contactSplits>0); assert.equal(refiner.stats.errorSplits,0, 'Contact criterion is tested independently of error threshold');
for(let i=1;i<selected.length;i++)assert.equal(detector.intersects(chord(selected[i-1],selected[i])),false, 'Every retained chord follows a separated route');
assert.equal(JSON.stringify(route),frozen,'Refinement never projects or edits source positions');
assert.equal(JSON.stringify(detector.stats),JSON.stringify({contacts:0,stops:0}),'Read-only contact tests do not alter solver diagnostics');

const straight=Array.from({length:13},(_,i)=>frame([rect(i*.3,0)],i));
assert.deepEqual(createHistoryRefiner(4).select(straight),[straight[12]], 'Uniform motion costs no extra keyframes');
const curved=Array.from({length:13},(_,i)=>frame([rect(i*.3,Math.sin(i/12*Math.PI))],i));
const accurate=createHistoryRefiner(4,{tolerance:.02}), keys=[curved[0],...accurate.select(curved)];
assert.ok(accurate.stats.errorSplits>0);
for(let i=0;i<=12;i++){
 const r=sampleGrowthHistory(keys,i)[0].points;
 for(let j=0;j<4;j++)assert.ok(Math.hypot(r[j].x-curved[i].rings[0].data[j*3+1],r[j].y-curved[i].rings[0].data[j*3+2])<=.0200000001);
}
// New material vertices are born on existing edges, not remapped by index.
const subdivided=structuredClone(straight);for(let i=6;i<13;i++){
 const d=subdivided[i].rings[0].data;
 subdivided[i].rings[0].data=Float64Array.from([...d.slice(0,3),.125,(d[1]+d[4])/2,(d[2]+d[5])/2,...d.slice(3)]);
}
assert.equal(createHistoryRefiner(4).select(subdivided).length,1,'Collinear subdivision adds no temporal bend');
const middle=sampleGrowthHistory([subdivided[0],subdivided[12]],6)[0].points;
assert.equal(middle.length,5);assert.ok(Math.abs(middle[1].x-2.1)<1e-12);assert.equal(middle[1].y,0);
assert.deepEqual(createHistoryRefiner(4).select([]),[]);
assert.deepEqual(createHistoryRefiner(4).select([straight[0]]),[]);
assert.throws(()=>createHistoryRefiner(4,{tolerance:-1}),RangeError);

const history=createGrowthHistory(4);
for(let i=0;i<13;i++)history.capture([rect(i*.3,0)],i);
assert.equal(history.pendingSteps,12);history.commit();
const saved=coords(sampleGrowthHistory(history.frames,6));
for(let i=13;i<37;i++){history.capture([rect(i*.3,0)],i);if(i%12===0)history.commit();}
assert.deepEqual(coords(sampleGrowthHistory(history.frames,6)),saved, 'Recycled captures cannot mutate retained history');
assert.ok(history.captureBytes<=12*32*8,'Rolling capture storage is reused');
assert.equal(history.bytes,history.frames.reduce((n,f)=>n+f.rings.reduce((n,r)=>n+r.data.byteLength,0),0));
for(const f of history.frames)for(const r of f.rings)assert.equal(r.data.byteLength,r.data.buffer.byteLength,'Retained bytes do not hide scratch capacity');
history.disposeScratch();assert.equal(history.captureBytes,0);assert.deepEqual(coords(sampleGrowthHistory(history.frames,6)),saved);
assert.throws(()=>history.capture([],40),/disposed/);

const source=[rect(0,0,20,30)],job=createGrowthJob(source,{age:.16,grain:3},{historyEvery:1000});
job.advance({budgetMs:Infinity,maxSteps:50});assert.ok(job.historyFrames>4,'Large requested interval cannot grow the rolling buffer without bound');
assert.ok(job.historyCaptureBytes>0);const before=coords(job.sample(.02));job.cancel();
assert.equal(job.historyCaptureBytes,0);assert.deepEqual(coords(job.sample(.02)),before);
const disabled=createGrowthJob(source,{age:.03},{history:false});disabled.advance({budgetMs:Infinity});
assert.equal(disabled.historyBytes,0);assert.equal(disabled.historyCaptureBytes,0);assert.equal(disabled.snapshot().history,null);
const empty=createGrowthJob([]);assert.equal(empty.historyCaptureBytes,0);assert.deepEqual(empty.sample(0),[]);
const complete=createGrowthJob(source,{age:.03});complete.advance({budgetMs:Infinity});assert.equal(complete.historyCaptureBytes,0);
// The former explicit update hid a period-two instability at high bending when
// only every twelfth step was saved. Adaptive history must not expose that buzz.
const stiff={age:1.5,grain:8,tension:1.2,memory:.05,patch:0,areaGain:.5,seed:31};
const distance=(a,b)=>Math.max(...a.rings.flatMap((r,ri)=>r.points.map((p,i)=>Math.hypot(p.x-b.rings[ri].points[i].x,p.y-b.rings[ri].points[i].y))));
const oldJump=distance(oldGrowth(source,stiff),oldGrowth(source,{...stiff,age:stiff.age-1/960}));
const stable=createGrowthJob(source,stiff);stable.advance({budgetMs:Infinity,maxSteps:1439});const previous=stable.snapshot();stable.advance({budgetMs:Infinity});
const newJump=distance(stable.snapshot(),previous);
assert.ok(oldJump>.1,'Synthetic stiff fixture reproduces the old numerical oscillation');
assert.ok(newJump<oldJump/20,'Bending-dependent stable step removes the alternating mode');
assert.ok(newJump>0,'Stable high bending still grows');
assert.ok(stable.historyFrames<300,'Stable motion does not demand a keyframe at every step');
assert.equal(stable.snapshot().settings.tension,1.2,'The user-facing range is not clamped away');
detector.dispose();refiner.dispose();accurate.dispose();
console.log('Differential history: curved route/contact-only refinement; bounded temporal error; straight-motion compression; material subdivision; immutable retained buffers; rolling capture reuse; disabled/empty/complete/cancel disposal; stiff-growth stability without range reduction passed. Not an exact-arithmetic or browser guarantee.');
