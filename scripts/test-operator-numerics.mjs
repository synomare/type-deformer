import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../numerical-kernels.js';
import '../vortex-bath-operator.js';
import '../wave-growth-operators.js';
const N=globalThis.TypeDeformerNumerics;

test('planned rectangular FFT preserves impulses, round trips and bounded plan ownership',()=>{
 for(const [w,h] of [[1,1],[1,32],[64,1],[16,32],[128,64]]){
  const input=Float64Array.from({length:w*h},(_,i)=>Math.sin(i*.17)+Math.cos(i*.23)),re=input.slice(),im=new Float64Array(input.length);
  N.fft2(re,im,w,h,false);N.fft2(re,im,w,h,true);
  for(let i=0;i<input.length;i++){assert.ok(Math.abs(re[i]-input[i])<1e-13);assert.ok(Math.abs(im[i])<1e-13);}
 }
 for(const n of [2,4,8,16,32,64,128,256,512,1024,2048,4096,8192])N.fft2(new Float64Array(n),new Float64Array(n),n,1,false);
 assert.ok(N.planStats().bytes<=N.planStats().maxBytes);
 for(const [w,h] of [[0,1],[3,1],[2.5,2],[2,3]])assert.throws(()=>N.fft2(new Float64Array(4),new Float64Array(4),w,h,false),/powers of two/);
});

test('nearest-site search agrees with ordered brute force, including duplicates and ties',()=>{
 let state=41;const random=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296);
 for(const count of [1,24,65,420]){
  const points=Array.from({length:count},(_,i)=>i%9===0?[0,0]:[(random()-.5)*200,(random()-.5)*200]);
  const nearest=N.nearestIndex(points);
  for(const [x,y] of [[0,0],[1e-150,-1e-150],...Array.from({length:500},()=>[(random()-.5)*300,(random()-.5)*300])]){
   let best=0,min=Infinity;for(let i=0;i<points.length;i++){const dx=x-points[i][0],dy=y-points[i][1],distance=dx*dx+dy*dy;if(distance<min){min=distance;best=i;}}
   assert.equal(nearest(x,y),best);
  }
 }
 assert.equal(N.nearestIndex([[1,0],[-1,0],[0,1],[0,-1]])(0,0),0);
});

test('masked solutions own their source, invalidate dependencies and evict by bytes',()=>{
 const cache=N.createMaskedCache(80),s={w:2,h:2,scale:2,alpha:new Float32Array([0,1,.5,0])};let calls=0;
 const get=(source,key)=>cache.get(source,key,()=>new Float64Array([++calls]),v=>v.byteLength);
 const a=get(s,['physics',1]);assert.equal(get({...s,alpha:s.alpha.slice()},['physics',1]),a);
 s.alpha[1]=.75;assert.notEqual(get(s,['physics',1]),a);
 assert.notEqual(get(s,['physics',2]),a);get({...s,scale:1},['physics',2]);
 assert.equal(cache.stats().entries,3);assert.ok(cache.stats().bytes<=80);assert.equal(calls,4);
 assert.notEqual(get({...s,alpha:new Float32Array([0,1,.5,0])},['physics',1]),a,'least-recently used entry was evicted');
 cache.clear();assert.deepEqual(cache.stats(),{entries:0,bytes:0,maxBytes:80,hits:0,misses:0});
 const noCache=N.createMaskedCache(0);noCache.get(s,[],()=>new Float64Array(1),v=>v.byteLength);assert.equal(noCache.stats().entries,0);
});

test('fluid and diffraction cache only physics, retaining controls that change the solution',()=>{
 const s={w:24,h:24,scale:1,pad:6,alpha:Float32Array.from({length:576},(_,i)=>i%24>6&&i%24<17&&i/24>6&&i/24<17?1:0)};
 const V=globalThis.TypeDeformerVortexBath,vi=V.internals,p={...V.schemas.vortexBath.defaults,vortexTime:.01};V.clearCache();
 const a=vi.simulationFor(s,p,41);assert.equal(vi.simulationFor(s,{...p,vortexRelief:9},41),a);
 assert.notEqual(vi.simulationFor(s,p,42),a);assert.notEqual(vi.simulationFor(s,{...p,vortexViscosity:.9},41),a);
 assert.ok(V.cacheStats().bytes<=V.cacheStats().maxBytes);
 const W=globalThis.TypeDeformerWaveGrowth,wi=W.internals,q=W.schemas.diffractiveGlyph.defaults;W.clearCache();
 const b=wi.opticalBands(s,q);assert.equal(wi.opticalBands(s,{...q,diffractionExposure:2.8}),b);
 assert.notEqual(wi.opticalBands(s,{...q,diffractionDistance:30}),b);assert.notEqual(wi.opticalBands({...s,pad:8},q),b);
 assert.ok(W.cacheStats().bytes<=W.cacheStats().maxBytes);
});

test('material fast path skips source reads and respects fonts, geometry, controls and eviction',()=>{
 let reads=0,solves=0,font='A',oversize=false;const listeners={};
 const context={document:{fonts:{addEventListener:(event,fn)=>listeners[event]=fn}},TypeDeformerVortexBath:{
  ids:['vortexBath'],schemas:{vortexBath:{defaults:{value:1},options:{},limits:{value:[0,2]}}},effectPad:()=>4,
  renderers:{vortexBath:s=>({width:oversize?4096:s.w,height:oversize?4096:s.h,serial:++solves})}}};
 vm.runInNewContext(fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8'),context);
 const F=context.TypeDeformerFieldMaterials,g={ch:'A',x:10,y:20,w:12,h:16,surface:{}},env={params:{seed:41},color:()=>'#123456',sourceKey:g=>[g.ch,font],drawGlyph(){},
  scratch(_name,w,h){return {canvas:{width:w,height:h},ctx:{getImageData(){reads++;const data=new Uint8ClampedArray(w*h*4);data[3]=255;return {data};}}};}};
 const get=()=>F.internals.entryFor('vortexBath',g,{}, {},env).entry;
 const a=get();assert.equal(get(),a);assert.equal(reads,1);assert.equal(solves,1);
 g.rot=90;assert.equal(get(),a);assert.equal(reads,1,'world transforms do not change the local source');
 font='B';get();assert.equal(reads,2);listeners.loadingdone();get();assert.equal(reads,3);
 g.x++;get();assert.equal(reads,4);assert.equal(solves,3,'identical local sources at different world positions reuse material');
 g.surface.value=2;assert.notEqual(get(),a);assert.equal(solves,4);
 const evicted=get();oversize=true;font='C';g.surface.value=1;get();assert.equal(evicted.alpha,null,'evicted descriptors release retained masks');oversize=false;
 F.invalidateSources();get();assert.equal(reads,7);F.clearCache();assert.equal(F.cacheStats().bytes,0);
 oversize=true;const b=get();assert.notEqual(get(),b,'uncached oversized output cannot be held by the fast path');
 assert.equal(F.cacheStats().entries,0);
});

test('byte alpha encoding is lossless and arbitrary fractional masks retain full precision',()=>{
 const cache=N.createMaskedCache(64),s={w:2,h:2,scale:1,alpha:Float32Array.from([0,1,1/255,128/255])};let count=0;
 const get=()=>cache.get(s,[],()=>new Float64Array([++count]),v=>v.byteLength);
 const a=get();assert.equal(cache.stats().bytes,12);assert.equal(get(),a);
 s.alpha[2]+=1e-6;assert.notEqual(get(),a);assert.equal(cache.stats().entries,2);assert.equal(cache.stats().bytes,36);
});

test('a fingerprint collision cannot substitute a different source mask',()=>{
 const words=new Uint32Array([0x3f000000,0x3e800000]),seed=2166136261,prime=16777619;
 const first=Math.imul(seed^words[0],prime);let collision;
 for(let a=words[0]+1;a<words[0]+1000;a++){const b=(first^Math.imul(seed^a,prime)^words[1])>>>0;if(b<=0x3f800000){collision=new Uint32Array([a,b]);break;}}
 assert.ok(collision);const hash=w=>Math.imul(Math.imul(seed^w[0],prime)^w[1],prime);assert.equal(hash(words),hash(collision));
 const cache=N.createMaskedCache(128);let calls=0;const get=alpha=>cache.get({w:2,h:1,scale:1,alpha},[],()=>new Float64Array([++calls]),v=>v.byteLength);
 const a=get(new Float32Array(words.buffer)),b=get(new Float32Array(collision.buffer));assert.notEqual(a,b);assert.equal(calls,2);
});

test('rendered material cache verifies colliding mask hashes and releases the replaced entry',()=>{
 const masks=['63b827feb6fb42344e8995962eda18d3', '85347ce5cbe4819e21ce24243cf31d23'].map(hex=>Uint8Array.from(Buffer.from(hex,'hex')));let mask=masks[0],solves=0;
 const hash=data=>data.reduce((h,b)=>Math.imul(h^b,16777619),2166136261)>>>0;assert.equal(hash(masks[0]),hash(masks[1]));
 const context={TypeDeformerVortexBath:{ids:['vortexBath'],schemas:{vortexBath:{defaults:{},options:{},limits:{}}},effectPad:()=>0,
  renderers:{vortexBath:s=>({width:s.w,height:s.h,serial:++solves})}}};
 vm.runInNewContext(fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8'),context);
 const F=context.TypeDeformerFieldMaterials,g={ch:'A',x:0,y:0,w:2,h:2,surface:{}},env={params:{},color:()=>'#123456',drawGlyph(){},scratch(_name,w,h){return {canvas:{width:w,height:h},ctx:{getImageData(){const data=new Uint8ClampedArray(w*h*4);mask.forEach((v,i)=>data[i*4+3]=v);return {data};}}};}};
 const get=()=>F.internals.entryFor('vortexBath',g,{}, {},env).entry;
 const a=get(),bytes=F.cacheStats().bytes;mask=masks[1];const b=get();assert.notEqual(a,b);assert.equal(solves,2);
 assert.equal(a.canvas.width,1);assert.equal(a.alpha,null);assert.equal(F.cacheStats().bytes,bytes);assert.equal(get(),b);assert.equal(solves,2);
});

test('byte-bounded cache releases owned resources on eviction, replacement and clear',()=>{
 const released=[],c=N.createByteCache(24,undefined,v=>released.push(v)),a={},b={},d={};
 assert.equal(c.set('a',a,12),true);assert.equal(c.set('b',b,12),true);assert.equal(c.get('a'),a);
 c.set('d',d,12);assert.deepEqual(released,[b]);assert.equal(c.get('b'),undefined);
 const replacement={};c.set('a',replacement,12);assert.deepEqual(released,[b,a]);
 assert.equal(c.set('oversized',{},25),false);assert.equal(c.stats().bytes,24);
 c.clear();assert.deepEqual(new Set(released),new Set([a,b,d,replacement]));assert.equal(c.stats().bytes,0);assert.equal(c.stats().entries,0);
});

test('Wasserstein source shortcut includes partner font, orientation and font invalidation',()=>{
 let reads=0,solves=0,font='400 320px Arial',revision=0;
 const context={TypeDeformerWassersteinLetters:{ids:['wassersteinLetters'],schemas:{wassersteinLetters:{defaults:{value:1},options:{},limits:{value:[0,2]}}},effectPad:()=>0,characters:s=>Array.from(s),fontRevision:()=>revision,invalidateFonts:()=>revision++,renderers:{wassersteinLetters:s=>({width:s.w,height:s.h,serial:++solves,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(s.w*s.h*4)})})})}}};
 vm.runInNewContext(fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8'),context);
 const F=context.TypeDeformerFieldMaterials,g={ch:'A',x:0,y:0,w:6,h:6,surface:{}},env={params:{wassersteinPartner:'B'},color:()=>'#123456',sourceKey:g=>g.ch,font:()=>({font}),charInfo:()=>({upright:false}),drawGlyph(){},scratch(_name,w,h){return {canvas:{width:w,height:h},ctx:{getImageData(){reads++;const data=new Uint8ClampedArray(w*h*4);data[3]=255;return {data};}}};}};
 const get=()=>F.internals.entryFor('wassersteinLetters',g,{}, {},env).entry;
 const a=get();assert.equal(get(),a);assert.equal(reads,1);env.params.wassersteinPartner='C';assert.notEqual(get(),a);
 font='700 320px Arial';get();env.params.vertical=true;get();env.params.wassersteinPartner='AB';get();F.invalidateSources();get();assert.equal(reads,6);assert.equal(solves,6);
});
