import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareScrollSource as prepare,buildScrollSurface as oracle,renderScrollSurface as render} from './core.mjs';
import {createScrollSurfacePool as create} from './surface-pool.mjs';
const rect=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const circle=(r,n=48)=>Array.from({length:n},(_,i)=>({x:r*Math.cos(i/n*Math.PI*2),y:r*Math.sin(i/n*Math.PI*2)}));
const fixture=[circle(30),circle(12),rect(32,-6,34,8)];
function soup(m,key){const out=new Float64Array(m.indices.length*3);for(let i=0;i<m.indices.length;i++)for(let c=0;c<3;c++)out[i*3+c]=m[key][m.indices[i]*3+c];return out;}
function equalMesh(a,b){assert.equal(a.triangleCount,b.triangleCount);for(const key of ['positions','normals'])assert.deepEqual(soup(a,key),b[key],key);for(const key of ['faceNormals','sourceAxis','bounds'])assert.deepEqual(a[key],b[key],key);}
test('indexed reusable construction preserves exact scalar geometry, normals, ordering and bounds',()=>{
  let cases=0;
  for(const axis of [0,-24,90])for(const rimSmoothing of [0,.007]){
    const source=prepare(fixture,{axis,rimSmoothing,steps:40}),pool=create(source);
    for(const mode of ['roll','spiral','reverse'])for(const curl of [-3,0,1.15,3])for(const phase of [0,.19,.5,1]){
      const p={mode,curl,taper:curl<0?-.95:.95,gauge:phase===.5?0:.03,motion:1},lease=pool.acquire(p,phase);
      equalMesh(lease.read(),oracle(source,p,phase));assert.ok(lease.read().positions.length<=lease.read().triangleCount*9||!lease.read().triangleCount);lease.release();cases++;
    }
    assert.equal(pool.stats().held,0);pool.dispose();assert.equal(pool.stats().managedBytes,0);
  }
  assert.equal(cases,288);
});
test('indexed shading, visibility, clipping and alpha equal triangle soup without changing light',()=>{
  const source=prepare(fixture,{axis:-24,steps:60}),pool=create(source),frame={width:70,height:66,scale:.9,samples:2};
  for(const pose of [{yaw:0,tilt:0},{yaw:90,tilt:-35},{yaw:-180,tilt:80},{yaw:41,tilt:-26}])for(const phase of [0,.39])for(const centerX of [0,24]){
    const p={...pose,curl:2.5,gauge:.03,motion:1,ink:[.6,.4,.2],backInk:[.1,.2,.3],opacity:.37,roughness:.04,metal:1},lease=pool.acquire(p,phase),expected=oracle(source,p,phase);
    assert.deepEqual(render(lease.read(),p,{...frame,centerX}).pixels,render(expected,p,{...frame,centerX}).pixels);
    lease.release();
  }
  const invalidLease=pool.acquire(),invalid=invalidLease.read();
  assert.throws(()=>render({...invalid,indices:new Uint32Array([999999,0,0])},{},{width:10,height:10}),/Invalid indexed surface/);
  assert.throws(()=>render({...invalid,indices:new Uint16Array(invalid.indices)},{},{width:10,height:10}),/Invalid indexed surface/);
  invalidLease.release();pool.dispose();assert.equal(pool.stats().managedBytes,0);
});
test('held display and staging meshes cannot be overwritten or silently evicted',()=>{
  const source=prepare(fixture,{steps:40}),pool=create(source),a=pool.acquire({curl:1}),view=a.read(),saved=soup(view,'positions');
  const b=pool.acquire({curl:2});assert.equal(pool.stats().held,2);
  assert.throws(()=>pool.acquire({curl:3}),/no free slot/);assert.deepEqual(soup(a.read(),'positions'),saved);
  const buffer=b.read().positions.buffer;b.release();assert.equal(b.release(),false);assert.throws(()=>b.read(),/released/);
  for(let i=0;i<32;i++){const next=pool.acquire({curl:Math.sin(i),motion:1},i/31);assert.equal(next.read().positions.buffer,buffer);next.release();assert.deepEqual(soup(a.read(),'positions'),saved);}
  pool.dispose();assert.throws(()=>pool.acquire(),/disposed/);assert.deepEqual(soup(a.read(),'positions'),saved);assert.ok(pool.stats().managedBytes>0);
  a.release();assert.equal(pool.stats().managedBytes,0);assert.equal(pool.stats().disposed,true);
});
test('pool owns its source snapshot and rejects invalid settings before changing a held result',()=>{
  const source=prepare(fixture,{steps:40}),expected=oracle(source,{curl:1.2}),pool=create(source),a=pool.acquire({curl:1.2}),snapshot=soup(a.read(),'positions');
  source.points.fill(NaN);source.front.fill(999999);source.walls.fill(999999);source.wallNormals.fill(NaN);source.center=Infinity;
  const b=pool.acquire({curl:1.2});equalMesh(b.read(),expected);b.release();
  assert.throws(()=>pool.acquire({},Infinity),/phase/);assert.deepEqual(soup(a.read(),'positions'),snapshot);assert.equal(pool.stats().held,1);
  a.release();pool.dispose();
});
test('managed-byte preflight, empty source, legacy source and variable triangle counts stay bounded',()=>{
  const source=prepare(fixture,{steps:40}),one=create(source,{slots:1}),bytes=one.stats().managedBytes;one.dispose();
  assert.throws(()=>create(source,{slots:1,maxBytes:bytes-1}),/byte budget/);
  const exact=create(source,{slots:1,maxBytes:bytes});assert.equal(exact.stats().managedBytes,bytes);exact.dispose();
  for(const options of [{slots:0},{slots:3},{maxBytes:0}])assert.throws(()=>create(source,options));
  for(const bad of [{...source,rimSmoothing:NaN},{...source,front:new Uint32Array([999999,0,1])},{...source,points:new Float64Array([NaN,0])}])assert.throws(()=>create(bad));
  const pool=create(prepare([]));const empty=pool.acquire();assert.equal(empty.read().triangleCount,0);assert.equal(render(empty.read()).pixels.some(v=>v),false);empty.release();pool.dispose();
  const legacy={...prepare(fixture,{steps:40,rimSmoothing:0})};delete legacy.wallNormals;delete legacy.rimSmoothing;
  const p=create(legacy);for(const gauge of [.03,0,.01,0]){const a=p.acquire({gauge});equalMesh(a.read(),oracle(legacy,{gauge}));a.release();}p.dispose();
});
test('a failed staged geometry build does not poison a held frame or consume a slot',()=>{
  const source={...prepare([rect(-1000,-40,1000,40)],{steps:16}),span:1e308};
  const pool=create(source),held=pool.acquire({gauge:0}),saved=soup(held.read(),'positions');
  assert.throws(()=>pool.acquire({gauge:.03}),/overflow/);assert.equal(pool.stats().held,1);
  assert.deepEqual(soup(held.read(),'positions'),saved);
  const next=pool.acquire({gauge:0});assert.deepEqual(soup(next.read(),'positions'),saved);next.release();held.release();pool.dispose();
});
