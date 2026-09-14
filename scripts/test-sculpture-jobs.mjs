import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as Thread} from 'node:worker_threads';
const url=new URL('../',import.meta.url);
function fixture(){
  const urls=new Map();let next=0,workers=0;
  const localURL={createObjectURL(blob){const id='blob:test-'+next++;urls.set(id,blob);return id},revokeObjectURL(id){urls.delete(id)}};
  class Worker {
    constructor(id){this.queued=[];this.terminated=false;workers++;
      urls.get(id).text().then(source=>{
        if(this.terminated)return;
        this.thread=new Thread(`const {parentPort}=require('node:worker_threads');global.self={postMessage:(m,t)=>parentPort.postMessage(m,t)};${source};parentPort.on('message',data=>self.onmessage({data}));`,{eval:true});
        this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>this.onerror?.(error));
        for(const m of this.queued)this.thread.postMessage(m);this.queued=[];
      });
    }
    postMessage(m){if(this.thread)this.thread.postMessage(m);else this.queued.push(m)}
    terminate(){if(this.terminated)return;workers--;this.terminated=true;this.thread?.terminate()}
  }
  const c=vm.createContext({Worker,Blob,URL:localURL});
  vm.runInContext(fs.readFileSync(new URL('sculpture-engine.js',url),'utf8'),c);
  vm.runInContext(fs.readFileSync(new URL('render-jobs.js',url),'utf8'),c);
  vm.runInContext(fs.readFileSync(new URL('sculpture-jobs.js',url),'utf8'),c);
  const job=c.TypeDeformerSculptureJobs.create();
  return {job,c,workers:()=>workers,urls:()=>urls.size};
}
const ring=(x,y,w,h)=>({points:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]});
const request=(extra={})=>({kind:'scroll',key:'glyph',sourceKey:'O',rings:[ring(-50,-70,100,140),ring(-25,-40,50,80)],
  axis:0,phase:0,density:1,settings:{curl:.7,mode:'roll',yaw:25,tilt:18,ink:[.9,.05,.05],backInk:[.05,.9,.05],edgeInk:[.05,.05,.9]},...extra});
async function settled(job,key){
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){const s=job.inspect();if(s.error)throw Error(s.error);if(s.completedKey===key&&!s.pending)return s.completed;await new Promise(r=>setTimeout(r,10))}
  throw Error('Sculpture worker did not settle '+key);
}
const bytes=result=>Buffer.concat(result.results.flatMap(r=>r.tiles.map(t=>Buffer.from(t.pixels))));
test('real worker renders the same cut plate deterministically with independent face inks',async t=>{
  const f=fixture();t.after(()=>f.job.dispose());
  const r=request();f.job.request('a',[r]);const a=await settled(f.job,'a');
  assert.ok(a.results[0].triangles>100);assert.ok(bytes(a).some(x=>x));
  f.job.request('b',[r]);const b=await settled(f.job,'b');assert.deepEqual(bytes(a),bytes(b));
  f.job.request('ink',[request({settings:{...r.settings,backInk:[.1,.1,.1],edgeInk:[1,1,1]}})]);
  assert.notDeepEqual(bytes(a),bytes(await settled(f.job,'ink')));
});
test('rapid input coalesces to the newest request; pause keeps the last completion',async t=>{
  const f=fixture();t.after(()=>f.job.dispose());
  f.job.request('initial',[request()]);await settled(f.job,'initial');
  for(let i=0;i<12;i++)f.job.request('move-'+i,[request({settings:{curl:i/8,mode:'roll'}})]);
  await settled(f.job,'move-11');const last=f.job.inspect().completed;
  f.job.request('paused',[request({density:8})]);f.job.pause(true);
  await new Promise(r=>setTimeout(r,50));assert.equal(f.job.inspect().completed,last);assert.equal(f.workers(),0);assert.equal(f.urls(),0);
  assert.throws(()=>f.job.assert('paused'),/停止中/);
  f.job.request('resumed',[request({phase:.3})]);f.job.pause(false);await settled(f.job,'resumed');
});
test('large output is tiled at requested density, not resized from a preview',async t=>{
  const f=fixture();t.after(()=>f.job.dispose());
  f.job.request('large',[request({density:8,settings:{curl:0,yaw:0,tilt:0,gauge:0,unlit:true}})]);
  const result=(await settled(f.job,'large')).results[0];
  assert.equal(result.density,8);assert.ok(result.width>800&&result.height>1100);assert.ok(result.tiles.length>4);
  assert.equal(result.tiles.reduce((n,t)=>n+t.width*t.height,0),result.width*result.height);
  const canvas=new Uint8ClampedArray(result.width*result.height*4);
  for(const tile of result.tiles)for(let y=0;y<tile.height;y++)canvas.set(tile.pixels.subarray(y*tile.width*4,(y+1)*tile.width*4),((tile.y+y)*result.width+tile.x)*4);
  // Interior of the O remains transparent across the tile seams.
  const middle=(Math.floor(result.height/2)*result.width+Math.floor(result.width/2))*4;
  assert.equal(canvas[middle+3],0);
});
test('worker failure never overwrites a completed image and a changed request recovers',async t=>{
  const f=fixture();t.after(()=>f.job.dispose());
  f.job.request('good',[request()]);const good=await settled(f.job,'good');
  f.job.request('bad',[request({density:NaN})]);
  await assert.rejects(settled(f.job,'bad'),/resolution/);assert.equal(f.job.inspect().completed,good);
  f.job.request('recovery',[request({phase:.5})]);await settled(f.job,'recovery');
  f.job.cancel();assert.equal(f.workers(),0);assert.equal(f.urls(),0);assert.equal(f.job.inspect().desiredKey,undefined);
});
test('Anamorphic worker retains both profiles, exposes support loss and moves the actual camera',async t=>{
  const f=fixture();t.after(()=>f.job.dispose());
  const a=[ring(-50,-70,100,140),ring(-30,-45,60,90)],b=[ring(-35,-70,70,140)];
  const r=request({kind:'anamorphic',partnerKey:'partner',rings:a,partnerRings:b,geometryKey:'two-readings',settings:{yaw:0,tilt:0,depth:1,unlit:true,ink:[.2,.3,.4]}});
  f.job.request('front',[r]);const front=await settled(f.job,'front');
  assert.equal(front.results[0].geometryKey,'two-readings');assert.equal(front.results[0].compatibility.lossA,0);assert.equal(front.results[0].compatibility.lossB,0);
  f.job.request('side',[{...r,settings:{...r.settings,yaw:90}}]);const side=await settled(f.job,'side');assert.notDeepEqual(bytes(front),bytes(side));
  f.job.request('motion',[{...r,phase:.25,settings:{...r.settings,yaw:45,motion:1}}]);const midway=await settled(f.job,'motion');
  f.job.request('exact',[{...r,settings:{...r.settings,yaw:45}}]);assert.deepEqual(bytes(midway),bytes(await settled(f.job,'exact')));
  f.job.request('incompatible',[{...r,partnerKey:'split',partnerRings:[ring(-35,-70,70,20),ring(-35,50,70,20)]}]);
  assert.ok((await settled(f.job,'incompatible')).results[0].compatibility.lossA>.5);
});
test('continuous edits retain a completed frame, bound the waiting queue and settle the final edit',async t=>{
  const f=fixture();t.after(()=>f.job.dispose());let i=0;
  f.job.request('initial',[request()]);const initial=await settled(f.job,'initial');
  const timer=setInterval(()=>f.job.request('frame-'+i,[request({phase:(i++%100)/100})]),12);
  try{await new Promise(r=>setTimeout(r,750));
    assert.ok(f.job.inspect().completed,'the last completed scene stays available');
    assert.ok(f.c.TypeDeformerRenderJobs.inspect()[0].counters.maxWaiting<=1);
  }finally{clearInterval(timer)}
  f.job.request('final',[request({settings:{...request().settings,curl:.15}})]);const final=await settled(f.job,'final');assert.notDeepEqual(bytes(initial),bytes(final));
  f.job.cancel();
  assert.equal(f.workers(),0);assert.equal(f.urls(),0);
});
