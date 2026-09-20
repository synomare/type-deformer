import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../render-jobs.js',import.meta.url),'utf8');
function fixture(options={}){
 const workers=[],timers=new Map();let timerId=0;
 class Worker {constructor(){this.sent=[];workers.push(this);}postMessage(m){this.sent.push(m);}terminate(){this.terminated=true;}result(index=0,result={}){this.onmessage({data:{id:this.sent[index].id,type:'result',result}});}}
 const c=vm.createContext({setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);}});vm.runInContext(source,c);
 const q=c.TypeDeformerRenderJobs.create({workerFactory:()=>new Worker(),interruptAfter:180,cacheFonts:true,...options});
 return {q,workers,tick(){for(const [id,fn] of [...timers]){timers.delete(id);fn();}},timers};
}
const edit={purpose:'edit'};
test('input replaces obsolete heavy work within one grace period and isolates late worker callbacks',()=>{
 const {q,workers,tick,timers}=fixture();let closed=0;
 q.request('last',edit);workers[0].result(0,{bitmap:{close(){closed++;}}});
 q.request('slow',edit);q.invalidate();q.request('middle',edit);const timer=[...timers.keys()][0];q.invalidate();q.request('latest',edit);
 assert.equal([...timers.keys()][0],timer,'continued input does not postpone interruption');tick();
 assert.equal(workers[0].terminated,true);assert.equal(workers[1].sent[0].key,'latest');assert.equal(q.status('last').ready,true);assert.equal(closed,0);
 workers[0].onerror({message:'late error'});workers[0].result(1,{bitmap:{close(){closed++;}}});
 assert.equal(workers[1].terminated,undefined);assert.equal(q.status().error,null);assert.equal(closed,1);
 workers[1].result();assert.equal(q.status().ready,true);assert.equal(q.status().counters.interrupted,1);assert.equal(closed,2);q.dispose();
});
test('animation and proof/export requests finish without starvation or interruption',()=>{
 for(const [purpose,invalidate,nextPurpose] of [['edit',false,'edit'],['proof',true,'edit'],['export',true,'edit'],['edit',true,'export']]){
  const {q,workers,tick}=fixture();q.request('a',{purpose});if(invalidate)q.invalidate();q.request('b',{purpose:nextPurpose});tick();
  assert.equal(workers.length,1);assert.equal(workers[0].terminated,undefined);workers[0].result();assert.equal(workers[0].sent[1].key,'b');workers[0].result(1);assert.equal(q.status().ready,true);q.dispose();
 }
});
test('returning to the running input reuses its work and clears pending interruption',()=>{
 const {q,workers,tick}=fixture();q.request('a',edit);q.invalidate();q.request('b',edit);q.invalidate();q.request('a',edit);tick();
 assert.equal(workers.length,1);workers[0].result();assert.equal(workers[0].sent.length,1);assert.equal(q.status().ready,true);q.dispose();
});
test('returning to a completed frame immediately releases invalidated edit work',()=>{
 const {q,workers}=fixture();q.request('a',edit);workers[0].result();q.request('b',edit);q.invalidate();q.request('a',edit);
 assert.equal(q.status().ready,true);assert.equal(q.status().busy,false);assert.equal(workers[0].terminated,true);q.dispose();
});
test('worker font acknowledgement avoids copies, preserves source buffers and resets after restart',()=>{
 const {q,workers,tick}=fixture(),buffer=new ArrayBuffer(1024),fonts=[{family:'Imported',buffer}],payload={...edit,fonts};
 q.request('a',payload);q.request('b',payload);workers[0].result();
 assert.equal(workers[0].sent[0].payload.fonts.length,1);assert.equal(workers[0].sent[1].payload.fonts.length,0,'discarded result still acknowledges fonts');assert.equal(payload.fonts,fonts);assert.equal(buffer.byteLength,1024);
 workers[0].result(1);const changed={...edit,fonts:[{family:'Imported',buffer:new ArrayBuffer(1024)}]};q.request('c',changed);assert.equal(workers[0].sent[2].payload.fonts.length,1);
 q.invalidate();q.request('d',payload);tick();assert.equal(workers[1].sent[0].payload.fonts.length,1);q.dispose();
});
test('failed font loading is not acknowledged, and worker crashes recover the newest pending input',()=>{
 const {q,workers}=fixture(),payload={...edit,fonts:[{family:'Imported',buffer:new ArrayBuffer(4)}]};
 q.request('a',payload);workers[0].onmessage({data:{id:1,type:'error',message:'font'}});q.request('b',payload);assert.equal(workers[0].sent[1].payload.fonts.length,1);
 q.request('c',payload);workers[0].onerror({message:'crash'});assert.equal(workers[1].sent[0].key,'c');assert.equal(workers[1].sent[0].payload.fonts.length,1);workers[1].result();assert.equal(q.status().ready,true);q.dispose();
});
test('cancelling or disposing clears timers and never revives work',()=>{
 for(const action of ['cancel','dispose']){const {q,workers,tick,timers}=fixture();q.request('a',edit);q.invalidate();q.request('b',edit);q[action]();tick();assert.equal(timers.size,0);assert.equal(workers.length,1);assert.equal(q.status().busy,false);}
});
