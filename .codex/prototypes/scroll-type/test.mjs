import test from 'node:test';
import assert from 'node:assert/strict';
import {scrollSettings,scrollSection,prepareScrollSource,buildScrollSurface,renderScrollSurface} from './core.mjs';
const rect=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const fixture=[rect(-25,-35,25,35),rect(-14,-24,14,-6),rect(-14,5,14,24),rect(34,-12,38,12)];
const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const sumArea=s=>{let sum=0;for(let i=0;i<s.front.length;i+=3){const [a,b,c]=s.front.slice(i,i+3);sum+=((s.points[b*2]-s.points[a*2])*(s.points[c*2+1]-s.points[a*2+1])-(s.points[c*2]-s.points[a*2])*(s.points[b*2+1]-s.points[a*2+1]))/2;}return sum;};
function volume(m){let v=0;for(let i=0;i<m.positions.length;i+=9){const p=m.positions,a=p.slice(i,i+3),b=p.slice(i+3,i+6),c=p.slice(i+6,i+9);v+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}return v;}
function inside(r,x,y){let value=false;for(const ring of r)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)value=!value;}return value;}
test('arc-length section equals independent circular cylinder and exact flat limit',()=>{
  for(const span of [1,70,200])for(const curl of [-3,-.5,0,.5,3])for(let i=-20;i<=20;i++){
    const v=span*i/40,q=scrollSection(v,span,{mode:'roll',curl}),k=2*Math.PI*curl/span;
    near(q.y,k?Math.sin(k*v)/k:v,1e-11*span);near(q.z,k?2*Math.sin(k*v/2)**2/k:0,1e-11*span);
  }
});
test('all directrices are unit-speed and derivatives match analytic tangent/curvature',()=>{
  for(const mode of ['roll','spiral','reverse'])for(const curl of [-3,.8,3])for(const taper of [-.95,.95])for(const s of [-.47,-.19,0,.23,.47]){
    const v=200*s,e=.0002,p={mode,curl,taper},a=scrollSection(v-e,200,p),b=scrollSection(v+e,200,p),q=scrollSection(v,200,p);
    const dy=(b.y-a.y)/(2*e),dz=(b.z-a.z)/(2*e);near(dy,Math.cos(q.theta),3e-9);near(dz,Math.sin(q.theta),3e-9);near(dy*dy+dz*dz,1,4e-9);near((b.theta-a.theta)/(2*e),q.curvature,1e-10);
  }
});
test('source decomposition preserves filled area, holes, islands, winding and caller data',()=>{
  const original=JSON.stringify(fixture),expected=3500-28*18-28*19+96;
  for(const axis of [0,-24,90,137])for(const steps of [32,180]){
    const s=prepareScrollSource(fixture,{axis,steps}),reversed=prepareScrollSource(fixture.map(r=>r.slice().reverse()),{axis,steps});
    near(sumArea(s),expected,1e-7);near(sumArea(reversed),expected,1e-7);
    assert.ok(s.front.length>0&&s.stats.points<100000);assert.equal(JSON.stringify(fixture),original);
  }
});
test('flat solid volume and outward normals are independent of ring orientation',()=>{
  for(const input of [fixture,fixture.map(r=>r.slice().reverse())]){
    const s=prepareScrollSource(input,{steps:32}),m=buildScrollSurface(s,{curl:0,gauge:.02});
    near(volume(m),sumArea(s)*s.span*.02,1e-7);
    for(let i=0;i<m.faceNormals.length;i+=3)near(Math.hypot(...m.faceNormals.slice(i,i+3)),1,1e-12);
  }
});
test('flat transparent sheet raster matches independent even-odd sample occupancy',()=>{
  const source=prepareScrollSource(fixture,{steps:40}),m=buildScrollSurface(source,{curl:0,gauge:0});
  const frame={width:100,height:100,samples:2,scale:1},p={curl:0,yaw:0,tilt:0,gauge:0,unlit:true,ink:[.5,.2,.7]},r=renderScrollSurface(m,p,frame);
  for(let y=0;y<100;y++)for(let x=0;x<100;x++){
    let hits=0;for(const sy of [.25,.75])for(const sx of [.25,.75])if(inside(fixture,x+sx-50,y+sy-50))hits++;
    assert.equal(r.pixels[(y*100+x)*4+3],Math.round(255*hits/4));
  }
});
test('loop, disabled motion, integer pan, opacity once and source immutability',()=>{
  const s=prepareScrollSource(fixture,{steps:80,axis:-24}),snapshot=JSON.stringify(s),p={mode:'spiral',curl:1.8,gauge:.015,motion:1},frame={width:140,height:140,samples:2};
  const a=buildScrollSurface(s,p,0),b=buildScrollSurface(s,p,1);assert.deepEqual(a,b);
  assert.deepEqual(buildScrollSurface(s,{...p,motion:0},.21),buildScrollSurface(s,{...p,motion:0},.79));
  const zero=renderScrollSurface(a,p,frame),one=renderScrollSurface(b,p,frame),fade=renderScrollSurface(a,{...p,opacity:.37},frame);assert.deepEqual(zero.pixels,one.pixels);
  for(let k=3;k<zero.pixels.length;k+=4)near(fade.pixels[k],zero.pixels[k]*.37,1);
  const pan=renderScrollSurface(a,p,{...frame,centerX:5});
  for(let y=0;y<140;y++)for(let x=5;x<140;x++)for(let c=0;c<4;c++)assert.equal(zero.pixels[(y*140+x)*4+c],pan.pixels[(y*140+x-5)*4+c]);
  assert.equal(JSON.stringify(s),snapshot);
});
test('extreme geometry remains finite with a regular gauge offset',()=>{
  const source=prepareScrollSource(fixture);
  for(const mode of ['roll','spiral','reverse'])for(const curl of [-3,3])for(const taper of [-.95,.95]){
    const p={mode,curl,taper,gauge:.03},m=buildScrollSurface(source,p,.19);
    assert.ok(m.positions.every(Number.isFinite)&&m.normals.every(Number.isFinite));assert.ok(m.triangleCount<=source.maxTriangles);
    for(let i=-50;i<=50;i++)assert.ok(Math.abs(scrollSection(source.span*i/100,source.span,p).curvature*source.span*.03/2)<1,'offset never folds locally');
    near(volume(m),sumArea(source)*source.span*.03,8,'finite discretized volume; not collision freedom');
  }
});
test('coarse triangulation volume error converges at the default source density',()=>{
  const p={mode:'reverse',curl:3,gauge:.03},errors=[];
  for(const steps of [90,180,480]){const s=prepareScrollSource(fixture,{steps});errors.push(Math.abs(volume(buildScrollSurface(s,p))-sumArea(s)*s.span*.03));}
  assert.ok(errors[0]>errors[1]*3&&errors[1]>errors[2]*5);assert.ok(errors[2]<8);
});
test('duplex material changes back/edge colour without changing geometry or coverage',()=>{
  const source=prepareScrollSource([rect(-25,-30,25,30)],{steps:80}),m=buildScrollSurface(source,{curl:0,gauge:.02});
  const frame={width:80,height:80,samples:2},ink=[1,0,0],backInk=[0,1,0],edgeInk=[0,0,1];
  const center=r=>Array.from(r.pixels.slice((40*80+40)*4,(40*80+40)*4+4));
  assert.deepEqual(center(renderScrollSurface(m,{yaw:0,tilt:0,unlit:true,ink,backInk,edgeInk},frame)),[255,0,0,255]);
  assert.deepEqual(center(renderScrollSurface(m,{yaw:180,tilt:0,unlit:true,ink,backInk,edgeInk},frame)),[0,255,0,255]);
  const a=renderScrollSurface(m,{yaw:60,tilt:25,ink},frame),b=renderScrollSurface(m,{yaw:60,tilt:25,ink,backInk,edgeInk},frame);
  for(let k=3;k<a.pixels.length;k+=4)assert.equal(a.pixels[k],b.pixels[k]);
  assert.deepEqual(renderScrollSurface(m,{ink,backInk:ink,edgeInk:ink},frame).pixels,renderScrollSurface(m,{ink},frame).pixels);
  assert.throws(()=>renderScrollSurface(m,{backInk:[1,NaN,0]},frame));
});
test('empty, malformed, explicit budgets and sanitization',()=>{
  const empty=buildScrollSurface(prepareScrollSource([]));assert.equal(empty.triangleCount,0);assert.ok(renderScrollSurface(empty).pixels.every(v=>v===0));
  assert.throws(()=>prepareScrollSource([[{x:NaN,y:0},{x:1,y:0},{x:0,y:1}]]));
  for(const o of [{steps:0},{maxPoints:3},{maxTriangles:5},{maxWork:1}])assert.throws(()=>prepareScrollSource(fixture,o));
  assert.throws(()=>scrollSection(100,10));assert.throws(()=>buildScrollSurface({},{}));
  assert.throws(()=>buildScrollSurface(prepareScrollSource(fixture),{},Infinity));
  assert.equal(scrollSettings({curl:Infinity}).curl,1.15);assert.equal(scrollSettings({gauge:100}).gauge,.03);
  const s=prepareScrollSource(fixture,{steps:32}),m=buildScrollSurface(s);assert.throws(()=>renderScrollSurface(m,{}, {maxSampleTests:1}));
});
