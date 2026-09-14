import assert from 'node:assert/strict';
import test from 'node:test';
import {createMarblingNativeSnapshot,copyMarblingRasterCanvas} from './native-snapshot.mjs';
import {prepareMarblingGlyph} from './core.mjs';
import {createMarblingSceneSession} from './scene-session.mjs';
import {createMarblingOutputJob} from './output-job.mjs';
const canvas=(n=1)=>({width:4,height:3,pixels:[n,n+1,n+2]});
const clone=source=>({...source,pixels:[...source.pixels]});
const input=(source=canvas())=>({scene:{glyphs:[{ch:'B',opacity:1,x:12}],bands:[{kind:'raster',source,x:2,y:4,w:8,h:6},{kind:'path',points:[{x:0,y:0},{x:20,y:10}],source:'guide'}],
  presentedPhase:.25,presentedSurfacePhase:1.25,presentedDataMoshFrame:8},params:{ink:'#0ff',fontSize:192,nested:{angle:40}},compositionState:{enabled:true,phase:.25,fxRack:{echo:{amount:.3}}},
  surfaceFxPhase:1.25,dataMoshFrame:8,fontRevision:'font-1',destination:{scale:2,L:{s:1,dx:0,dy:0}},fontMetrics:{ascent:140,descent:30}});
function host(){let state={params:{ink:'#f00'},compositionState:{phase:.8},surfaceFxPhase:3,dataMoshFrame:30,fontRevision:'font-1'};
  return {read:()=>state,set:value=>{state=value;}};}

test('snapshots all supplied plain native state and one copy per shared Canvas',()=>{
  const source=canvas(),data=input(source);data.scene.bands.push({...data.scene.bands[0],x:80});let copies=0,releases=0;
  const snapshot=createMarblingNativeSnapshot(data,{copyRaster:s=>{copies++;return clone(s);},releaseRaster:()=>{releases++;}});
  assert.equal(copies,1);assert.equal(snapshot.state().rasterPixels,12);assert.ok(Object.isFrozen(snapshot.scene.marblingNative.state.params.nested));
  data.params.ink='#123';data.params.nested.angle=99;data.scene.glyphs[0].x=100;data.scene.bands[0].x=99;data.compositionState.phase=.9;source.pixels[0]=200;
  const h=host(),previous=h.read();snapshot.paint(h,scene=>{
    assert.equal(h.read().params.ink,'#0ff');assert.equal(h.read().params.nested.angle,40);assert.equal(h.read().compositionState.phase,.25);
    assert.equal(h.read().surfaceFxPhase,1.25);assert.equal(h.read().dataMoshFrame,8);
    assert.equal(scene.glyphs[0].x,12);assert.equal(scene.bands[0].x,2);assert.equal(scene.bands[0].source.pixels[0],1);
    assert.equal(scene.bands[0].source,scene.bands[2].source);assert.notEqual(scene.bands[0].source,source);assert.equal(scene.bands[1].source,'guide');
    h.read().params.nested.angle=-8;
  });assert.equal(h.read(),previous);assert.equal(snapshot.scene.marblingNative.state.params.nested.angle,40);snapshot.dispose();assert.equal(releases,1);
});

test('separate output lease survives replacement and releases only after last owner',()=>{
  let releases=0;const snapshot=createMarblingNativeSnapshot(input(),{copyRaster:clone,releaseRaster:()=>releases++}),output=snapshot.retain();
  const scene=output.scene;snapshot.dispose();assert.equal(releases,0);assert.throws(()=>snapshot.retain());assert.throws(()=>snapshot.scene);
  output.paint(host(),restored=>assert.equal(restored.glyphs[0].ch,'B'),scene);assert.equal(output.dispose(),true);assert.equal(output.dispose(),false);
  assert.equal(releases,1);assert.equal(output.state().rasters,0);assert.throws(()=>output.paint(host(),()=>{}));
});

test('active paint lease survives dispose during callback and exception restores bindings',()=>{
  let releases=0;const snapshot=createMarblingNativeSnapshot(input(),{copyRaster:clone,releaseRaster:()=>releases++}),h=host(),previous=h.read(),error={test:1};
  assert.throws(()=>snapshot.paint(h,scene=>{snapshot.dispose();assert.equal(releases,0);assert.equal(scene.bands[0].source.pixels[0],1);throw error;}),e=>e===error);
  assert.equal(releases,1);assert.equal(h.read(),previous);
});

test('nested synchronous paints restore outer state then live state',()=>{
  const first=createMarblingNativeSnapshot(input(),{copyRaster:clone}),other=input();other.params.ink='#f80';other.compositionState.phase=.6;
  const second=createMarblingNativeSnapshot(other,{copyRaster:clone}),h=host(),previous=h.read();
  first.paint(h,()=>{const outer=h.read();second.paint(h,()=>assert.equal(h.read().params.ink,'#f80'));assert.equal(h.read(),outer);assert.equal(outer.compositionState.phase,.25);});
  assert.equal(h.read(),previous);first.dispose();second.dispose();
});

test('invalid ordinary state, getters, unsupported objects and budget fail before capture',()=>{
  let copies=0;const options={copyRaster:s=>{copies++;return clone(s);}};
  for(const mutate of [d=>d.params.ink=NaN,d=>d.params.circular=d.params,d=>d.params.bad=new Date(),d=>d.scene.marblingNative={},d=>d.fontRevision='',d=>d.scene.glyphs=1,
    d=>Object.defineProperty(d.params,'bad',{get(){throw new Error('getter must not run');},enumerable:true})]){
    const d=input();mutate(d);assert.throws(()=>createMarblingNativeSnapshot(d,options));
  }
  const d=input();Object.defineProperty(d,'params',{get(){throw new Error('unexpected getter');},enumerable:true});assert.throws(()=>createMarblingNativeSnapshot(d,options),/accessors/);
  assert.throws(()=>createMarblingNativeSnapshot(input(),{...options,maxRasterPixels:11}),/budget/);
  const invalid=input();invalid.scene.bands[0].source.width=0;assert.throws(()=>createMarblingNativeSnapshot(invalid,options));
  assert.equal(copies,0);
});

test('capture failure closes all owned copies but never live or aliased inputs',()=>{
  const d=input(),second=canvas(20);d.scene.bands.push({kind:'raster',source:second});const closed=[];let calls=0;
  assert.throws(()=>createMarblingNativeSnapshot(d,{copyRaster:s=>{if(++calls===2)throw new Error('capture');return clone(s);},releaseRaster:r=>closed.push(r)}),/capture/);
  assert.equal(closed.length,1);assert.notEqual(closed[0],d.scene.bands[0].source);
  assert.throws(()=>createMarblingNativeSnapshot(d,{copyRaster:()=>second,releaseRaster:r=>closed.push(r)}),/independent/);assert.equal(closed.length,1);
  const common=clone(second);assert.throws(()=>createMarblingNativeSnapshot(d,{copyRaster:()=>common,releaseRaster:r=>closed.push(r)}),/independent/);assert.equal(closed.length,2);
});

test('dimension mismatch is cleaned up; failing disposers do not skip other copies',()=>{
  let cleaned=0;assert.throws(()=>createMarblingNativeSnapshot(input(),{copyRaster:s=>({...clone(s),width:5}),releaseRaster:()=>cleaned++}),/dimensions/);assert.equal(cleaned,1);
  const d=input();d.scene.bands.push({kind:'raster',source:canvas(4)});const snapshot=createMarblingNativeSnapshot(d,{copyRaster:clone,releaseRaster:()=>{cleaned++;throw new Error('release');}});
  assert.throws(()=>snapshot.dispose(),AggregateError);assert.equal(cleaned,3);assert.equal(snapshot.state().rasters,0);assert.equal(snapshot.dispose(),false);
});

test('font revision changes, foreign frames and asynchronous painting fail explicitly',()=>{
  const snapshot=createMarblingNativeSnapshot(input(),{copyRaster:clone}),h=host(),other=createMarblingNativeSnapshot(input(),{copyRaster:clone});
  h.read().fontRevision='font-2';assert.throws(()=>snapshot.paint(h,()=>{}),/font revision/);h.read().fontRevision='font-1';
  assert.throws(()=>snapshot.paint(h,()=>{},other.scene),/different snapshot/);
  const previous=h.read();assert.throws(()=>snapshot.paint(h,async()=>{}),/synchronous/);assert.equal(h.read(),previous);
  assert.throws(()=>snapshot.paint(h,()=>Promise.resolve()),/outlive/);assert.equal(h.read(),previous);
  assert.throws(()=>createMarblingNativeSnapshot(input(),{copyRaster:async s=>clone(s)}),/synchronous/);
  snapshot.dispose();other.dispose();
});

test('partial host-set exception rolls back original binding identities',()=>{
  const snapshot=createMarblingNativeSnapshot(input(),{copyRaster:clone}),h=host(),previous=h.read();let first=true;
  const failing={read:h.read,set:s=>{h.set(s);if(first){first=false;throw new Error('host swap');}}};
  assert.throws(()=>snapshot.paint(failing,()=>{}),/host swap/);assert.equal(h.read(),previous);assert.equal(snapshot.state().references,1);snapshot.dispose();
});

test('plain snapshots retain sparse arrays and own prototype-named data',()=>{
  const d=input();d.scene.bands=[];d.params.sparse=new Array(4);d.params.sparse[2]=undefined;
  Object.defineProperty(d.params,'__proto__',{value:{safe:1},enumerable:true});
  const snapshot=createMarblingNativeSnapshot(d),p=snapshot.scene.marblingNative.state.params;
  assert.equal(p.sparse.length,4);assert.equal(0 in p.sparse,false);assert.equal(2 in p.sparse,true);assert.equal(Object.getPrototypeOf(p),Object.prototype);assert.equal(p.__proto__.safe,1);snapshot.dispose();
});

test('native Canvas copy is independent, full sized, and cleaned on failed draw',()=>{
  const source=canvas();let target;
  const copied=copyMarblingRasterCanvas(source,(w,h)=>target={width:w,height:h,getContext:()=>({drawImage:s=>{target.pixels=[...s.pixels];}})});
  assert.notEqual(copied,source);source.pixels[0]=200;assert.equal(copied.pixels[0],1);
  assert.throws(()=>copyMarblingRasterCanvas(source,()=>source),/separate/);
  assert.throws(()=>copyMarblingRasterCanvas(source,(w,h)=>target={width:w,height:h,getContext:()=>({drawImage:()=>{throw new Error('draw failed');}})}),/draw failed/);
  assert.equal(target.width,0);assert.equal(target.height,0);
});

test('real scene-session and high-resolution output keep the native snapshot token and lease',()=>{
  const source=prepareMarblingGlyph([{points:[{x:0,y:0},{x:20,y:0},{x:20,y:30},{x:0,y:30}]}]);
  let releases=0;const snapshot=createMarblingNativeSnapshot(input(),{copyRaster:clone,releaseRaster:()=>releases++});
  const session=createMarblingSceneSession();session.submit({revision:'r1',stamp:.25,scene:snapshot.scene,instances:[{glyphIndex:0,settings:{mode:'rake',amount:.2},phase:.25,
    source:{key:'glyph',revision:'f1',load:()=>source},transform:{a:1,b:0,c:0,d:1}}]});
  for(let i=0;i<10000&&session.state().status!=='ready';i++)session.advance({source:{maxWork:10000,maxMs:100},frame:{maxWork:10000,maxMs:100}});
  assert.equal(session.state().status,'ready');const packet=session.read(),outputLease=snapshot.retain();
  const job=createMarblingOutputJob(packet,{transforms:[{glyphIndex:0,a:4,b:0,c:0,d:4,e:0,f:0}]});
  snapshot.dispose();session.reset();assert.equal(releases,0);
  for(let i=0;i<10000&&!job.read();i++)job.advance({source:{maxWork:10000,maxMs:100},frame:{maxWork:10000,maxMs:100}});
  const output=job.require();outputLease.paint(host(),scene=>{assert.equal(scene.bands[0].source.pixels[0],1);assert.equal(scene.marblingNative.state.compositionState.phase,.25);},output.packet.scene);
  job.dispose();outputLease.dispose();assert.equal(releases,1);
});
