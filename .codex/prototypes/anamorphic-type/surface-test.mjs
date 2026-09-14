import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAnamorphicProfile as prepare,anamorphicRay as ray,renderAnamorphic as oracle} from './core.mjs';
import {buildAnamorphicSurface as build,renderAnamorphicSurface as render} from './surface.mjs';
const rect=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const circle=(r,n=60)=>Array.from({length:n},(_,i)=>({x:r*Math.cos(i/n*Math.PI*2),y:r*Math.sin(i/n*Math.PI*2)}));
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>a.map(v=>v/Math.hypot(...a));
let seed=74013;const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
const fixtures=[
  [[rect(-12,-15,12,15)],[rect(-10,-15,10,15)]],
  [[rect(-12,-15,12,15),rect(-4,-9,4,9)],[rect(-10,-15,10,15),rect(-3,-6,3,6)]],
  [[circle(15),circle(6)],[rect(-11,-15,11,-2),rect(-11,3,11,15)]],
  [[[{x:-15,y:-15},{x:15,y:-15},{x:8,y:0},{x:15,y:15},{x:-15,y:15},{x:-8,y:0}]],[circle(15,47)]],
  [[rect(-15,-15,-12,15),rect(2,-12,14,-3),rect(2,7,14,15)],[rect(-10,-15,10,15)]],
];
test('indexed native display preserves all triangle attributes and exact rendered samples',()=>{
  for(const input of fixtures){
    const [a,b]=input.map(r=>prepare(r)),plain=build(a,b),indexed=build(a,b,{indexed:true});
    assert.equal(indexed.triangleCount,plain.triangleCount);assert.equal(indexed.indices.length,plain.triangleCount*3);
    for(let i=0;i<indexed.indices.length;i++)for(let k=0;k<3;k++){
      assert.equal(indexed.positions[indexed.indices[i]*3+k],plain.positions[i*3+k]);
      assert.equal(indexed.normals[indexed.indices[i]*3+k],plain.normals[i*3+k]);
    }
    for(const yaw of [0,37,90]){
      const frame={width:70,height:70,scale:1.5,samples:2},p={yaw,tilt:yaw===37?-21:0,depth:1.4,ink:[.2,.4,.3],metal:.8};
      assert.deepEqual(render(indexed,p,frame).pixels,render(plain,p,frame).pixels);
    }
  }
});
// Independent Moller-Trumbore intersection, not the renderer's edge test.
function meshRay(m,o,d,depth){
  let best=null;
  for(let i=0;i<m.triangleCount;i++){
    const k=i*9,v=[0,3,6].map(j=>[m.positions[k+j],m.positions[k+j+1],m.positions[k+j+2]*depth]);
    const e1=sub(v[1],v[0]),e2=sub(v[2],v[0]),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-14)continue;
    const s=sub(o,v[0]),u=dot(s,h)/det;if(u<0||u>1)continue;
    const q=cross(s,e1),w=dot(d,q)/det;if(w<0||u+w>1)continue;
    const t=dot(e2,q)/det;if(t<0||best&&t>=best.t)continue;
    const normal=unit(cross(e1,e2));best={t,normal};
  }
  return best;
}
test('cached polygon boundary equals independent ray volume through counters, islands and caps',()=>{
  for(const input of fixtures){const [a,b]=input.map(r=>prepare(r)),m=build(a,b);
    for(const depth of [.1,1,4])for(let i=0;i<180;i++){
      const o=unit([random()-.5,random()-.5,random()-.5]).map(v=>v*150),d=unit(o.map(v=>-v+(random()-.5)*35));
      const wanted=ray(a,b,o,d,depth),actual=meshRay(m,o,d,depth);assert.equal(!!actual,!!wanted);
      if(actual){assert.ok(Math.abs(actual.t-wanted.t)<1e-8);assert.ok(dot(actual.normal,d)<=0,'outward winding at entry');}
    }
  }
});
test('surface renderer preserves endpoint silhouettes and full shaded oblique views',()=>{
  const frame={width:72,height:68,samples:2,scale:1.37,centerX:.123,centerY:.234};
  for(const input of fixtures){const [a,b]=input.map(r=>prepare(r)),m=build(a,b);
    for(const pose of [{yaw:0},{yaw:90},{yaw:37,tilt:-26,depth:1.6},{yaw:-126,tilt:55,depth:.1}]){
      const p={...pose,metal:.6,roughness:.24,ink:[.52,.49,.43]},ref=oracle(a,b,p,frame),got=render(m,p,frame);
      let alpha=0,rgb=0,max=0;
      for(let i=0;i<ref.pixels.length;i++){const diff=Math.abs(ref.pixels[i]-got.pixels[i]);if(i%4===3)alpha+=diff;else {rgb+=diff;max=Math.max(max,diff);}}
      assert.equal(alpha,0,JSON.stringify(pose));assert.ok(max<=1,`shading difference ${rgb}/${max} at ${JSON.stringify(pose)}`);
    }
  }
});
test('thin sources are not quantized away, no interior caps and geometric volume is correct',()=>{
  const a=prepare([rect(-.00001,-4,.00001,4)]),b=prepare([rect(-2,-4,2,4)]),m=build(a,b);
  const hit=meshRay(m,[-10,0,0],[1,0,0],1);assert.ok(Math.abs(hit.t-9.99999)<1e-12);
  const rectWithExtra=[{x:-3,y:-4},{x:0,y:-4},{x:3,y:-4},{x:3,y:0},{x:3,y:4},{x:-3,y:4},{x:-3,y:0}];
  const box=build(prepare([rectWithExtra]),b);let volume=0;
  for(let i=0;i<box.positions.length;i+=9){const p=[0,3,6].map(k=>[...box.positions.slice(i+k,i+k+3)]);volume+=dot(p[0],cross(p[1],p[2]))/6;}
  assert.ok(Math.abs(volume-192)<1e-10);
  for(let i=0;i<box.triangleCount;i++)if(Math.abs(box.faceNormals[i*3+1])===1)assert.ok(Math.abs(box.positions[i*9+1])===4,'no interior cap at extra vertex y');
});
test('reuse across depth, view, loop and opacity leaves source and old frames untouched',()=>{
  const [a,b]=fixtures[1].map(r=>prepare(r)),m=build(a,b),snapshot=m.positions.slice(),frame={width:60,height:60,samples:2};
  const p={yaw:32,tilt:-30,motion:1,depth:2},first=render(m,p,frame),saved=first.pixels.slice();
  assert.deepEqual(first.pixels,render(m,p,{...frame,phase:1}).pixels);
  assert.notDeepEqual(first.pixels,render(m,p,{...frame,phase:.5}).pixels);
  const fade=render(m,{...p,opacity:.32},frame);
  for(let i=3;i<saved.length;i+=4)assert.ok(Math.abs(fade.pixels[i]-saved[i]*.32)<=1);
  for(const depth of [.1,4])render(m,{depth,yaw:137,tilt:-80},frame);
  assert.deepEqual(first.pixels,saved);assert.deepEqual(m.positions,snapshot);
  a.rings[0][0].x=99999;a.edges[0].x=99999;assert.deepEqual(render(m,p,frame).pixels,saved,'mesh owns copied data');
});
test('fixed viewport, source winding and empty/invalid/over-budget handling',()=>{
  const [a,b]=fixtures[0].map(r=>prepare(r)),m=build(a,b),frame={width:64,height:64,samples:2};
  const reversed=build(prepare(a.rings.map(r=>r.slice().reverse())),prepare(b.rings.map(r=>r.slice().reverse())));
  assert.deepEqual(render(m,{yaw:28,tilt:30},frame).pixels,render(reversed,{yaw:28,tilt:30},frame).pixels);
  assert.equal(render(build(prepare([]),b),{},frame).pixels.some(v=>v),false);
  assert.equal(render(m,{opacity:0},frame).pixels.some(v=>v),false);
  assert.throws(()=>build(a,b,{maxTriangles:1}),/triangle budget/);
  assert.throws(()=>build(a,b,{maxWork:1}),/work budget/);
  assert.throws(()=>build(a,b,{maxTriangles:0}),/Invalid surface budget/);
  assert.throws(()=>render(m,{}, {...frame,maxSampleTests:1}),/sample-test budget/);
  assert.throws(()=>render(m,{}, {...frame,maxSamples:1}),/Invalid surface frame/);
  assert.throws(()=>render(m,{ink:[2,0,0]},frame),/Invalid ink/);
  assert.throws(()=>render(m,{}, {...frame,scale:Number.MAX_VALUE}),/Non-finite projected/);
});
test('shared vertex heights, sample-edge ownership and partially offscreen material',()=>{
  const a=prepare([rect(-12.25,-15.25,12.25,15.25),rect(-4.25,-9.25,4.25,9.25)]),b=prepare([rect(-10.25,-15.25,10.25,15.25)]),m=build(a,b);
  for(const yaw of [0,90])for(const centerX of [0,25,-25]){
    const frame={width:64,height:60,samples:2,centerX},p={yaw,unlit:true};
    const got=render(m,p,frame).pixels,want=oracle(a,b,p,frame).pixels;
    const first=got.findIndex((v,i)=>v!==want[i]);assert.equal(first,-1,`yaw ${yaw} / center ${centerX} / first ${first}: ${got[first]} vs ${want[first]}`);
  }
  // This circle has nearly equal but not identical y values. No tolerance weld
  // may collapse two distinct slabs and accidentally remove a narrow feature.
  const narrow=prepare([circle(15,60),circle(14.99998,60)]),mesh=build(narrow,b);
  for(let i=0;i<120;i++){
    const angle=(i+.123)/120*Math.PI*2,o=[Math.cos(angle)*30,Math.sin(angle)*30,0],d=unit(o.map(v=>-v));
    const ref=ray(narrow,b,o,d),got=meshRay(mesh,o,d,1);assert.equal(!!got,!!ref);if(got)assert.ok(Math.abs(got.t-ref.t)<1e-8);
  }
});
test('bounded randomized poses and declared extremes keep the cached surface equivalent',()=>{
  const a=prepare([circle(15,40),circle(6,31)]),b=prepare([rect(-10,-15,10,15),rect(-4,-9,4,2)]),m=build(a,b);
  const frame={width:52,height:46,samples:1,scale:.91,centerX:.271,centerY:-.192};
  for(let i=0;i<36;i++){
    const p={yaw:i<12?[-180,0,180][i%3]:random()*360-180,tilt:i%2?80:-80,depth:i%3?.1:4,metal:1,roughness:i%2?.04:1};
    const expected=oracle(a,b,p,frame),actual=render(m,p,frame);
    for(let j=0;j<actual.pixels.length;j++)assert.ok(Math.abs(actual.pixels[j]-expected.pixels[j])<=(j%4===3?0:1),`pose ${i} / component ${j}`);
  }
});
test('optional face palette preserves single-ink output, depth ownership and alpha',()=>{
  const [a,b]=fixtures[1].map(r=>prepare(r)),m=build(a,b),frame={width:64,height:64,samples:2};
  const ink=[.32,.57,.19],axisInks=[[1,0,0],[0,1,0],[0,0,1]],saved=m.positions.slice();
  for(const pose of [{yaw:0},{yaw:90},{yaw:32,tilt:-30,depth:2},{yaw:-130,tilt:45,depth:.2}]){
    const p={...pose,ink,metal:.7,roughness:.16,opacity:.37};
    const ordinary=render(m,p,frame),same=render(m,{...p,axisInks:[ink,ink,ink]},frame);
    assert.deepEqual(same.pixels,ordinary.pixels,'equal palettes do not alter the legacy material');
    const coloured=render(m,{...p,unlit:true,opacity:1,axisInks},frame);
    const alpha=render(m,{...p,unlit:true,opacity:1},frame);
    for(let k=0;k<coloured.pixels.length;k+=4){
      assert.equal(coloured.pixels[k+3],alpha.pixels[k+3],'coverage independent of material');
      if(coloured.pixels[k+3]){
        assert.equal(coloured.pixels[k+1],0,'no axis1 face exists in this solid');
        assert.ok(Math.abs(coloured.pixels[k]+coloured.pixels[k+2]-255)<=1);
        if(pose.yaw===0)assert.equal(coloured.pixels[k+2],255,'frontal profile is B boundary');
        if(pose.yaw===90)assert.equal(coloured.pixels[k],255,'side profile is A boundary');
      }
    }
  }
  for(const palette of [null,[],[ink,ink],[ink,ink,[1,0,NaN]],[ink,ink,[1,0,-.01]]])assert.throws(()=>render(m,{axisInks:palette},frame),/material palette/);
  const invalid={...m,sourceAxis:m.sourceAxis.map(()=>3)};
  assert.throws(()=>render(invalid,{axisInks},frame),/material palette/);
  assert.deepEqual(m.positions,saved);
});
