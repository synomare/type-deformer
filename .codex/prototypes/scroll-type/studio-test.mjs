import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareStudio,studioChannel} from '../anamorphic-type/studio.mjs';
import {prepareScrollSource as prepare,buildScrollSurface as build,renderScrollSurface as render} from './core.mjs';
import {createScrollSurfacePool} from './surface-pool.mjs';
const circle=(r,n=48)=>Array.from({length:n},(_,i)=>({x:r*Math.cos(i/n*Math.PI*2),y:r*Math.sin(i/n*Math.PI*2)}));
const fixture=[circle(25),circle(11),[{x:27,y:-10},{x:29,y:-10},{x:29,y:9},{x:27,y:9}]];
const source=prepare(fixture,{steps:40,axis:-24}),frame={width:96,height:88,samples:2,scale:1};
const alpha=r=>Uint8Array.from({length:r.pixels.length/4},(_,i)=>r.pixels[i*4+3]);

test('studio field and metal response remain finite, bounded and continuous without angular seams',()=>{
  const ranges=[];
  for(const roughness of [.04,.2,.6,1]){
    const light=prepareStudio(roughness),energies=[];
    for(let i=0;i<=2000;i++){
      const t=i/2000*Math.PI*2,nx=.8*Math.cos(t),ny=.8*Math.sin(t),nz=.6,energy=light(nx,ny,nz);
      assert.ok(Number.isFinite(energy)&&energy>=0&&energy<9);energies.push(energy);
      if(i)assert.ok(Math.abs(energy-energies[i-1])<.08,'continuous normal orbit');
      for(const tint of [0,.05,.5,1]){const value=studioChannel(tint,nz,energy);assert.ok(Number.isFinite(value)&&value>=0&&value<=1);}
    }
    assert.ok(Math.abs(energies[0]-energies.at(-1))<1e-12);
    ranges.push(Math.max(...energies)-Math.min(...energies));
  }
  assert.ok(ranges.at(-1)<ranges[0],'rougher field has lower orbit contrast');
  assert.equal(studioChannel(0,1,4),0);
  for(const energy of [.1,1,5])for(const tint of [0,.2,.8,1]){
    const expected=((tint**2.2*energy)/(1+tint**2.2*energy))**(1/2.2);
    assert.equal(studioChannel(tint,1,energy),expected,'normal-incidence reflectance');
    assert.equal(studioChannel(tint,0,energy),(energy/(1+energy))**(1/2.2),'grazing limit');
  }
  for(const bad of [NaN,Infinity,-1,0,1.01])assert.throws(()=>prepareStudio(bad),/roughness/);
});

test('classic default, zero metal, unlit, empty and muted surfaces retain exact behavior',()=>{
  const mesh=build(source);
  assert.deepEqual(render(mesh,{},frame).pixels,render(mesh,{finish:'classic'},frame).pixels);
  for(const p of [{metal:0},{unlit:true,metal:1},{opacity:0}])assert.deepEqual(render(mesh,p,frame).pixels,render(mesh,{...p,finish:'studio'},frame).pixels);
  assert.equal(render(build(prepare([])),{finish:'studio'},frame).pixels.some(v=>v),false);
  for(const finish of ['metal',1,false])assert.throws(()=>render(mesh,{finish},frame),/finish/);
  assert.throws(()=>render(mesh,{finish:'studio'},{...frame,maxSampleTests:1}),/budget/);
});

test('studio preserves geometry, exact indexed/soup pixels and alpha throughout extreme poses',()=>{
  const pool=createScrollSurfacePool(source);let cases=0;
  for(const mode of ['roll','spiral','reverse'])for(const curl of [-3,0,3])for(const gauge of [0,.03])for(const yaw of [-180,-42,90]){
    const p={mode,curl,gauge,yaw,tilt:63,motion:1,taper:-.95,metal:1,roughness:.04,opacity:.37,ink:[.9,.08,.2],backInk:[.02,.6,.1],edgeInk:[.2,.3,.9]},lease=pool.acquire(p,.19),mesh=lease.read();
    const before={positions:mesh.positions.slice(),normals:mesh.normals.slice(),indices:mesh.indices.slice()},a=render(mesh,p,frame),b=render(mesh,{...p,finish:'studio'},frame);
    assert.deepEqual(alpha(a),alpha(b));assert.deepEqual(render(build(source,p,.19),{...p,finish:'studio'},frame).pixels,b.pixels);
    for(const k of Object.keys(before))assert.deepEqual(mesh[k],before[k]);
    lease.release();cases++;
  }
  assert.equal(cases,54);pool.dispose();assert.equal(pool.stats().managedBytes,0);
});

test('reflection follows normals, not screen placement, and material mixing/opacity remain separate',()=>{
  const mesh=build(source),p={finish:'studio',metal:1,roughness:.12,ink:[.8,.25,.04],backInk:[.05,.4,.8],edgeInk:[.9,.8,.2]};
  const a=render(mesh,p,frame),b=render(mesh,p,{...frame,centerX:3,centerY:-2});
  for(let y=0;y<frame.height-2;y++)for(let x=3;x<frame.width;x++)for(let c=0;c<4;c++)assert.equal(a.pixels[(y*frame.width+x)*4+c],b.pixels[((y+2)*frame.width+x-3)*4+c]);
  const fade=render(mesh,{...p,opacity:.37},frame);
  for(let i=0;i<a.pixels.length;i+=4){assert.ok(Math.abs(fade.pixels[i+3]-a.pixels[i+3]*.37)<=1);if(fade.pixels[i+3])for(let c=0;c<3;c++)assert.equal(a.pixels[i+c],fade.pixels[i+c]);}
  const recolored=render(mesh,{...p,ink:[.1,.8,.4],backInk:[.8,.1,.3],edgeInk:[.1,.2,.3]},frame);
  assert.deepEqual(alpha(a),alpha(recolored));assert.notDeepEqual(a.pixels,recolored.pixels);
  const rough=render(mesh,{...p,roughness:1},frame);assert.deepEqual(alpha(a),alpha(rough));assert.notDeepEqual(a.pixels,rough.pixels);
});

test('moving studio finish closes the true loop and does not inject motion into a stationary body',()=>{
  const p={finish:'studio',metal:1,roughness:.04,motion:1},paint=t=>render(build(source,p,t),p,frame);
  assert.deepEqual(paint(0).pixels,paint(1).pixels);assert.notDeepEqual(paint(0).pixels,paint(.5).pixels);
  const a=paint(1-1e-6),b=paint(1e-6);let delta=0,coverage=0;
  for(let i=0;i<a.pixels.length;i+=4){coverage+=a.pixels[i+3]/255;for(let c=0;c<3;c++)delta+=Math.abs(a.pixels[i+c]*a.pixels[i+3]-b.pixels[i+c]*b.pixels[i+3])/255;}
  assert.ok(delta/(coverage*3)<.1,'near seam, not merely exactly wrapped time');
  const still={...p,motion:0};assert.deepEqual(render(build(source,still,0),still,frame).pixels,render(build(source,still,.39),still,frame).pixels);
});
