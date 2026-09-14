import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareScrollSource,buildScrollSurface,renderScrollSurface} from './core.mjs';
import {createScrollFramePool,normalizeScrollFrameRequest} from './frame-pool.mjs';

const rect=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const fixture=[rect(-25,-35,25,35),rect(-14,-24,14,-6),rect(-14,5,14,24),rect(34,-12,38,12)];
const source=()=>prepareScrollSource(fixture,{axis:-24,steps:48});
function direct(prepared,input,phase,frame){return renderScrollSurface(buildScrollSurface(prepared,input,phase),input,frame);}

test('exact cached RGBA is copied out and duplicate leases share one owned frame',()=>{
  const prepared=source(),pool=createScrollFramePool(prepared),input={mode:'spiral',curl:2.2,taper:.7,gauge:.025,motion:1,yaw:-31,tilt:22,
    finish:'studio',ink:[.7,.28,.13],backInk:[.04,.22,.26],edgeInk:[.9,.76,.3],opacity:.63,metal:.9,roughness:.08},frame={width:92,height:88,scale:.85,samples:2};
  const expected=direct(prepared,input,.23,frame),a=pool.acquire(input,.23,frame),b=pool.acquire({...input,ink:input.ink.slice()},.23,{...frame});
  assert.deepEqual(a.read().pixels,expected.pixels);assert.deepEqual(b.copyPixels(),expected.pixels);
  assert.deepEqual(pool.stats(),{...pool.stats(),entries:1,geometryEntries:1,held:2,hits:1,misses:1,builds:1,geometryHits:0});
  const exposed=a.read();exposed.pixels.fill(0);assert.deepEqual(b.copyPixels(),expected.pixels,'caller mutation cannot poison the cache-owned raster');
  const target=new Uint8ClampedArray(expected.pixels.length);assert.equal(a.copyPixels(target),target);assert.deepEqual(target,expected.pixels);
  assert.throws(()=>a.copyPixels(new Uint8Array(target.length)),/exact Uint8ClampedArray/);
  input.ink.fill(0);prepared.points.fill(NaN);assert.deepEqual(b.copyPixels(),expected.pixels,'caller source and palette are not retained');
  assert.equal(a.release(),true);assert.equal(a.release(),false);assert.throws(()=>a.read(),/released/);b.release();pool.dispose();assert.equal(pool.stats().managedBytes,0);
});

test('keys invalidate every visible dimension while exact loop/static geometry is reused',()=>{
  const prepared=source(),pool=createScrollFramePool(prepared),base={mode:'spiral',curl:1.4,taper:.5,gauge:.02,motion:1,yaw:-20,tilt:15,ink:[.6,.4,.2]},frame={width:72,height:70,scale:.8,samples:1};
  const requests=[
    [base,.2,frame],[{...base,ink:[.2,.7,.8]},.2,frame],[{...base,yaw:41},.2,frame],[{...base,opacity:.4},.2,frame],
    [{...base,finish:'studio',metal:1},.2,frame],[base,.2,{...frame,centerX:3}],[base,.2,{...frame,scale:.9}],[base,.2,{...frame,samples:2}],
  ];
  for(const [input,phase,view] of requests){const lease=pool.acquire(input,phase,view);assert.deepEqual(lease.copyPixels(),direct(prepared,input,phase,view).pixels);lease.release();}
  assert.equal(pool.stats().builds,requests.length);assert.equal(pool.stats().geometryEntries,1);assert.equal(pool.stats().geometryHits,requests.length-1,'camera and material changes retain exact geometry');
  const viewA=normalizeScrollFrameRequest(base,.2,{...frame,centerY:4,phase:.1}),viewB=normalizeScrollFrameRequest(base,.2,{...frame,centerY:4,phase:.9});
  assert.equal(viewA.key,viewB.key);assert.deepEqual(direct(prepared,base,.2,{...frame,centerY:4,phase:.1}).pixels,direct(prepared,base,.2,{...frame,centerY:4,phase:.9}).pixels);
  const seam=pool.acquire(base,1,frame),zero=pool.acquire(base,0,frame);assert.equal(pool.stats().builds,requests.length+1);assert.equal(zero.key,seam.key);seam.release();zero.release();
  const still={...base,motion:0},stillA=pool.acquire(still,.1,frame),stillB=pool.acquire(still,.9,frame);assert.equal(stillA.key,stillB.key);stillA.release();stillB.release();
  const flatA=pool.acquire({...base,curl:0,mode:'roll',taper:-.9,motion:1},.3,frame),flatKey=flatA.key;flatA.release();
  const before=pool.stats(),flatB=pool.acquire({...base,curl:0,mode:'reverse',taper:.9,motion:0},.8,frame);assert.equal(flatB.key,flatKey);flatB.release();
  assert.equal(pool.stats().geometryEntries,before.geometryEntries);assert.equal(pool.stats().builds,before.builds);assert.equal(pool.stats().hits,before.hits+1,'flat output shares across irrelevant mode, taper and phase');
  pool.dispose();
});

test('two geometry slots preserve recent shapes and evict only the least-recent idle shape',()=>{
  const pool=createScrollFramePool(source(),{surfaceSlots:2,maxFrames:16}),frame={width:36,height:34,samples:1,scale:.4};
  const shape=n=>({curl:n,mode:'spiral',taper:.4,motion:0,ink:[.5,.4,.3]});
  for(const input of [shape(1),shape(2),{...shape(1),yaw:20}]){const lease=pool.acquire(input,0,frame);lease.release();}
  assert.equal(pool.stats().geometryEntries,2);assert.equal(pool.stats().geometryHits,1);
  const builds=pool.stats().geometryHits;let lease=pool.acquire(shape(3),0,frame);lease.release();
  lease=pool.acquire({...shape(1),yaw:35},0,frame);lease.release();assert.equal(pool.stats().geometryHits,builds+1,'recent geometry survives third-shape replacement');
  lease=pool.acquire({...shape(2),yaw:35},0,frame);lease.release();assert.equal(pool.stats().geometryHits,builds+1,'evicted geometry is rebuilt rather than falsely shared');pool.dispose();
});

test('retained-byte and entry LRU never evict active frames',()=>{
  const prepared=source(),probe=createScrollFramePool(prepared,{surfaceSlots:1,maxFrames:8}),base=probe.stats().surfaceBytes;probe.dispose();
  const frame={width:20,height:20,samples:1,scale:.25},bytes=20*20*4,pool=createScrollFramePool(prepared,{surfaceSlots:1,maxFrames:2,maxBytes:base+bytes*2});
  const get=yaw=>{const lease=pool.acquire({yaw,unlit:true},0,frame);return lease;};
  get(0).release();get(10).release();const touch=get(0);touch.release();get(20).release();
  assert.equal(pool.stats().entries,2);assert.equal(pool.stats().evictions,1);
  const builds=pool.stats().builds;get(0).release();assert.equal(pool.stats().builds,builds,'touched MRU survives');get(10).release();assert.equal(pool.stats().builds,builds+1,'idle LRU was evicted');
  pool.clear();const heldA=get(30),heldB=get(40);assert.throws(()=>get(50),/no evictable capacity/);assert.deepEqual(heldA.copyPixels(),direct(prepared,{yaw:30,unlit:true},0,frame).pixels);
  assert.equal(pool.clear(),0,'clear cannot invalidate active leases');heldA.release();heldB.release();assert.equal(pool.clear(),2);pool.dispose();
});

test('validation and renderer failure are bounded without poisoning a held result',()=>{
  const prepared=source();let calls=0,fail=false;
  const renderer=(...args)=>{calls++;if(fail)throw new Error('paint failed');return renderScrollSurface(...args);};
  const pool=createScrollFramePool(prepared,{renderer}),frame={width:42,height:40,samples:1,scale:.45},held=pool.acquire({curl:1},0,frame),saved=held.copyPixels(),prior=pool.stats();
  for(const bad of [[{},NaN,frame],[{finish:'bad'},0,frame],[{ink:[1,NaN,0]},0,frame],[{},0,{...frame,width:0}],[{},0,{...frame,maxSampleTests:0}]])assert.throws(()=>pool.acquire(...bad));
  assert.deepEqual(pool.stats(),prior,'invalid requests are transactional');
  fail=true;assert.throws(()=>pool.acquire({curl:2},0,frame),/paint failed/);assert.deepEqual(held.copyPixels(),saved);assert.equal(calls,2);assert.equal(pool.stats().builds,1);
  fail=false;const recovered=pool.acquire({curl:2},0,frame);assert.deepEqual(recovered.copyPixels(),direct(prepared,{curl:2},0,frame).pixels);recovered.release();held.release();pool.dispose();
  assert.throws(()=>createScrollFramePool(prepared,{renderer:async()=>{}}),/synchronous/);
  assert.throws(()=>normalizeScrollFrameRequest({},0,{width:4096,height:4096,samples:1}),/work budget/);
});

test('dispose keeps active copied frames readable, rejects new work and releases on final lease',()=>{
  const pool=createScrollFramePool(source()),lease=pool.acquire({curl:1.2},0,{width:40,height:38,samples:1,scale:.4}),saved=lease.copyPixels();
  assert.equal(pool.dispose(),true);assert.equal(pool.dispose(),false);assert.equal(pool.stats().closing,true);assert.ok(pool.stats().managedBytes>0);
  assert.deepEqual(lease.copyPixels(),saved);assert.throws(()=>pool.acquire(),/disposed/);assert.equal(lease.release(),true);
  assert.equal(pool.stats().managedBytes,0);assert.equal(pool.stats().disposed,true);
});
