import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareScrollSource as prepare,buildScrollSurface as build,renderScrollSurface as render,scrollSection} from './core.mjs';
const rect=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const circle=(r,n=96)=>Array.from({length:n},(_,i)=>({x:r*Math.cos(i/n*Math.PI*2),y:r*Math.sin(i/n*Math.PI*2)}));
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),unit=a=>a.map(v=>v/Math.hypot(...a));
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,`${a} / ${b}`);
test('rim field follows circular radial normals while leaving all source and surface geometry exact',()=>{
  const rings=[circle(30),circle(12)],a=prepare(rings,{steps:80,rimSmoothing:0}),b=prepare(rings,{steps:80});
  for(const key of ['points','front','walls','levels'])assert.deepEqual(a[key],b[key]);
  let oldError=0,newError=0;
  for(let i=0;i<b.walls.length;i++){
    const id=b.walls[i],point=b.points.subarray(id*2,id*2+2),r=Math.hypot(...point),sign=r>20?1:-1;
    const wanted=unit(point).map(v=>v*sign),normal=unit(b.wallNormals.subarray(i*2,i*2+2));
    const old=unit(a.wallNormals.subarray(i*2,i*2+2));
    oldError+=1-dot(old,wanted);newError+=1-dot(normal,wanted);
  }
  assert.ok(oldError>0&&newError<oldError*.001,'radial lighting normal error reduced without rounding geometry');
  for(const mode of ['roll','spiral','reverse'])for(const curl of [-3,0,3]){
    const p={mode,curl,gauge:.03},ma=build(a,p),mb=build(b,p);
    for(const key of ['positions','faceNormals','sourceAxis','bounds'])assert.deepEqual(ma[key],mb[key]);
    for(let i=0;i<mb.sourceAxis.length;i++)if(mb.sourceAxis[i]!==2)assert.deepEqual(ma.normals.slice(i*9,i*9+9),mb.normals.slice(i*9,i*9+9),'front/back light unchanged');
  }
});
test('hard rectangular corners retain discontinuities and no cross-ring or island smoothing occurs',()=>{
  const rings=[rect(-30,-35,30,35),rect(-14,-20,14,20),rect(34,-4,35,4)];
  const a=prepare(rings,{rimSmoothing:0,steps:80}),b=prepare(rings,{steps:80});
  for(let i=0;i<a.wallNormals.length;i++)near(a.wallNormals[i],b.wallNormals[i]);
  for(const mode of ['roll','spiral','reverse']){
    const p={mode,curl:2,gauge:.03,yaw:42,tilt:-26},frame={width:100,height:100,samples:2};
    assert.deepEqual(render(build(a,p),p,frame).pixels,render(build(b,p),p,frame).pixels);
  }
  for(const input of [rings,rings.map(r=>r.slice().reverse()),rings.slice().reverse()]){
    const s=prepare(input,{steps:32});
    for(let i=0;i<s.walls.length;i+=2){
      const a=s.walls[i],b=s.walls[i+1],du=s.points[b*2]-s.points[a*2],dv=s.points[b*2+1]-s.points[a*2+1];
      for(const k of [i*2,i*2+2])assert.ok(s.wallNormals[k]*dv-s.wallNormals[k+1]*du>0);
    }
  }
});
test('finite-gauge transported rim normals remain perpendicular to independent numerical tangents',()=>{
  const s=prepare([circle(30,32)],{steps:32,axis:-24}),h=s.span*.03/2,epsilon=1e-4;
  for(const mode of ['roll','spiral','reverse'])for(const curl of [-3,3]){
    const p={mode,curl,gauge:.03,taper:.95},m=build(s,p),expected=new Map();
    const point=(u,v,w)=>{const q=scrollSection(v-s.center,s.span,p),y=q.y+s.center-w*Math.sin(q.theta);return [s.ux*u-s.uy*y,s.uy*u+s.ux*y,q.z+w*Math.cos(q.theta)];};
    for(let i=0;i<s.walls.length;i++){
      const id=s.walls[i],u=s.points[id*2],v=s.points[id*2+1],nu=s.wallNormals[i*2],nv=s.wallNormals[i*2+1];
      if(v-s.center<=-s.span/2+epsilon||v-s.center>=s.span/2-epsilon)continue;
      for(const sign of [-1,1]){
        const q=point(u,v,sign*h),a=point(u-epsilon*nv,v+epsilon*nu,sign*h),b=point(u+epsilon*nv,v-epsilon*nu,sign*h);
        const tangent=unit(a.map((v,k)=>v-b[k])),c=point(u,v,sign*h+epsilon),d=point(u,v,sign*h-epsilon),thickness=unit(c.map((v,k)=>v-d[k]));
        expected.set(q.join(','),{tangent,thickness});
      }
    }
    let checked=0;
    for(let i=0;i<m.triangleCount;i++)if(m.sourceAxis[i]===2)for(let j=0;j<9;j+=3){
      const k=i*9+j,q=expected.get(Array.from(m.positions.subarray(k,k+3)).join(','));if(!q)continue;
      const n=m.normals.subarray(k,k+3);near(Math.hypot(...n),1);near(dot(n,q.tangent),0,2e-7);near(dot(n,q.thickness),0,2e-7);checked++;
    }
    assert.ok(checked>100,'actual emitted normals, not only formula fixtures');
  }
});
test('rim lighting keeps alpha, unlit output, exact loop, zero-gauge and disabled baseline',()=>{
  const rings=[circle(30),circle(12)],a=prepare(rings,{rimSmoothing:0,steps:80}),b=prepare(rings,{steps:80});
  const frame={width:90,height:90,samples:2},p={curl:2.2,gauge:.03,motion:1,yaw:35,tilt:-32,ink:[.7,.2,.1],backInk:[.1,.3,.6]};
  const legacy={...b};delete legacy.wallNormals;delete legacy.rimSmoothing;
  assert.deepEqual(build(legacy,p).normals,build(a,p).normals);
  const zero=build(b,p,0),one=build(b,p,1);assert.deepEqual(zero,one);
  for(const phase of [0,.19,.5,.99999]){
    const ma=build(a,p,phase),mb=build(b,p,phase),ra=render(ma,p,frame),rb=render(mb,p,frame);
    for(let k=3;k<ra.pixels.length;k+=4)assert.equal(ra.pixels[k],rb.pixels[k]);
    assert.deepEqual(render(ma,{...p,unlit:true},frame).pixels,render(mb,{...p,unlit:true},frame).pixels);
    const fade=render(mb,{...p,opacity:.37},frame);for(let k=3;k<rb.pixels.length;k+=4)near(fade.pixels[k],rb.pixels[k]*.37,1);
  }
  const flat={...p,gauge:0};assert.deepEqual(render(build(a,flat),flat,frame).pixels,render(build(b,flat),flat,frame).pixels);
  for(const x of [-1,NaN,Infinity,.031])assert.throws(()=>prepare(rings,{rimSmoothing:x}));
});
test('source-relative smoothing follows similarity transforms and preserves caller ownership',()=>{
  const rings=[circle(30),circle(12)],input=JSON.stringify(rings),source=prepare(rings,{steps:80}),p={curl:1.4,gauge:.03,yaw:27,tilt:-21};
  const original=build(source,p),first=render(original,p,{width:100,height:100,samples:2}),saved=first.pixels.slice();
  for(const factor of [.1,10]){
    const s=prepare(rings.map(r=>r.map(q=>({x:q.x*factor,y:q.y*factor}))),{steps:80});
    const image=render(build(s,p),p,{width:100,height:100,samples:2,scale:1/factor});
    for(let k=0;k<saved.length;k++)assert.ok(Math.abs(saved[k]-image.pixels[k])<=(k%4===3?0:1));
  }
  assert.equal(JSON.stringify(rings),input);
  rings[0][0].x=9999;assert.deepEqual(render(original,p,{width:100,height:100,samples:2}).pixels,saved);
  assert.deepEqual(first.pixels,saved);
});
