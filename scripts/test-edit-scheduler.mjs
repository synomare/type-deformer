import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function fixture(){
 const frames=new Map();let next=0;
 const c=vm.createContext({requestAnimationFrame(fn){frames.set(++next,fn);return next;},cancelAnimationFrame(id){frames.delete(id);}});
 vm.runInContext(fs.readFileSync(new URL('../edit-scheduler.js',import.meta.url),'utf8'),c);
 return {q:c.TypeDeformerEditScheduler,frames,tick(){const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn());}};
}
test('a burst paints only the latest state once per visual callback',()=>{
 const {q,frames,tick}=fixture();let value=0;const painted=[],paint=()=>painted.push(value);
 for(let i=1;i<=100;i++){value=i;q.schedule(paint);}
 assert.equal(frames.size,1);assert.deepEqual(painted,[]);tick();assert.deepEqual(painted,[100]);assert.equal(q.pending(),0);
});
test('commit and export flush pending work without leaving a duplicate frame',()=>{
 const {q,frames,tick}=fixture(),order=[];q.schedule(()=>order.push('layout'));q.schedule(()=>order.push('surface'));
 q.flush();assert.deepEqual(order,['layout','surface']);assert.equal(frames.size,0);tick();assert.equal(order.length,2);
});
test('snapshot reentry and callbacks that invalidate another visual stage drain coherently',()=>{
 const {q,tick}=fixture(),order=[];q.schedule(()=>{order.push('first');q.flush();q.schedule(()=>order.push('second'));});
 tick();assert.deepEqual(order,['first','second']);assert.equal(q.pending(),0);
});
test('cancel and a throwing callback leave the scheduler reusable',()=>{
 const {q,frames,tick}=fixture();q.schedule(()=>assert.fail('cancelled'));q.cancel();tick();assert.equal(frames.size,0);
 let recovered=false;q.schedule(()=>{throw Error('paint');});q.schedule(()=>recovered=true);
 assert.throws(()=>q.flush(),/paint/);assert.equal(recovered,true,'one failed stage must not lose other pending edits');
 let painted=false;q.schedule(()=>painted=true);tick();assert.equal(painted,true);
});
