import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePneumatic as prepare,solvePneumatic as solve,buildPneumaticMesh as mesh,deformPneumatic as deform,renderPneumatic as render,pneumaticSettings,PNEUMATIC_STARTS} from './core.mjs';
const fixture=(w,h,fn)=>Uint8ClampedArray.from({length:w*h},(_,i)=>fn(i%w,Math.floor(i/w)));
const disk=(size,r)=>fixture(size,size,(x,y)=>Math.max(0,Math.min(255,(r+.5-Math.hypot(x-(size-1)/2,y-(size-1)/2))*255)));
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const build=(a,w,h,s={})=>{const d=prepare(a,w,h,s),f=solve(d);return [d,f,mesh(d,f)];};
// Dense Gaussian elimination is independent of the production CG recurrence.
function dense(matrix,rhs){
  const n=rhs.length,A=matrix.map((row,i)=>Float64Array.from([...row,rhs[i]]));
  for(let k=0;k<n;k++){
    let best=k;for(let i=k+1;i<n;i++)if(Math.abs(A[i][k])>Math.abs(A[best][k]))best=i;[A[k],A[best]]=[A[best],A[k]];
    const p=A[k][k];assert.ok(Math.abs(p)>1e-12);for(let j=k;j<=n;j++)A[k][j]/=p;
    for(let i=0;i<n;i++)if(i!==k){const q=A[i][k];for(let j=k;j<=n;j++)A[i][j]-=q*A[k][j];}
  }
  return Float64Array.from(A,row=>row[n]);
}

test('CG matches an independent dense Dirichlet solve on disconnected, counter and concave domains',()=>{
  for(const kind of ['counter','split','bay']){
    const w=9,h=9,a=fixture(w,h,(x,y)=>x>1&&x<7&&y>1&&y<7&&!(kind==='counter'&&x>3&&x<5&&y>3&&y<5)&&!(kind==='split'&&x===4)&&!(kind==='bay'&&x>3&&y<4)?255:0);
    const d=prepare(a,w,h,{weld:0}),f=solve(d),cells=Array.from(a.keys()).filter(p=>a[p]>127),n=cells.length,lookup=new Map(cells.map((p,i)=>[p,i]));
    const A=Array.from({length:n},()=>new Float64Array(n+1));
    for(let i=0;i<n;i++){
      A[i][n]=2;
      for(const q of [cells[i]-1,cells[i]+1,cells[i]-w,cells[i]+w]){
        if(lookup.has(q)){A[i][i]++;A[i][lookup.get(q)]--;}
        else A[i][i]+=2; // binary alpha -> boundary half a grid step away
      }
    }
    for(let k=0;k<n;k++){
      let best=k;for(let i=k+1;i<n;i++)if(Math.abs(A[i][k])>Math.abs(A[best][k]))best=i;[A[k],A[best]]=[A[best],A[k]];
      const p=A[k][k];for(let j=k;j<=n;j++)A[k][j]/=p;
      for(let i=0;i<n;i++)if(i!==k){const q=A[i][k];for(let j=k;j<=n;j++)A[i][j]-=q*A[k][j];}
    }
    for(let i=0;i<n;i++)near(f.u[i],A[i][n],1e-7);
    assert.ok(f.residual<1e-8);
  }
});

test('disk relief approaches the continuous Poisson dome and boundary stays clamped',()=>{
  for(const r of [8,16,24]){
    const size=r*2+7,[d,f,m]=build(disk(size,r),size,size,{weld:0});
    const center=(size*size-1)/2,actual=f.u[d.ids[center]],expected=r*r/2;
    assert.ok(Math.abs(actual/expected-1)<.025,`${r}: ${actual/expected}`);
    assert.ok(m.vertices.filter(p=>p.boundary).every(p=>p.u===0));
    assert.ok(f.u.every(v=>v>0&&Number.isFinite(v)));
  }
});

test('mesh is consistently wound with at most two incident front faces; counters stay open',()=>{
  const a=fixture(35,35,(x,y)=>{const r=Math.hypot(x-17,y-17);return r>7&&r<14?255:0;}),[d,f,m]=build(a,35,35);
  const edges=new Map();
  for(const t of m.triangles){
    const [a,b,c]=t.map(i=>m.vertices[i]);assert.ok((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)>0);
    assert.ok(Math.hypot((a.x+b.x+c.x)/3-17.5,(a.y+b.y+c.y)/3-17.5)>6);
    for(let i=0;i<3;i++){const e=[t[i],t[(i+1)%3]].sort((a,b)=>a-b).join(':');edges.set(e,(edges.get(e)||0)+1);}
  }
  assert.ok([...edges.values()].every(n=>n===1||n===2));
  for(const [edge,count] of edges)if(count===1)assert.ok(edge.split(':').every(i=>m.vertices[+i].boundary));
  const body=deform(d,m,{pressure:2,motion:0,yaw:0,tilt:0});
  m.vertices.forEach((v,i)=>{if(v.boundary)for(const k of ['x','y','z','nx','ny','nz'])near(body.front[i][k],body.back[i][k],1e-12);});
});

test('weld modifies the scalar body before lighting, preserves source, and repeats at 180 degrees',()=>{
  const a=disk(51,20),saved=a.slice(),plain=prepare(a,51,51,{weld:0}),u=solve(plain).u;
  const welded=prepare(a,51,51,{weld:1,pitch:16,axis:0}),v=solve(welded).u;
  assert.ok(v.every((x,i)=>x<=u[i]+1e-6));assert.ok(Math.max(...v)<Math.max(...u)*.6);
  const rotated=solve(prepare(a,51,51,{weld:1,pitch:16,axis:180})).u;
  v.forEach((x,i)=>near(x,rotated[i]));assert.deepEqual(a,saved);
});

test('retained tethers match independent dense and superposition oracles on holes, islands and bays',()=>{
  for(const kind of ['counter','split','bay']){
    const w=9,a=fixture(w,w,(x,y)=>x>1&&x<7&&y>1&&y<7&&!(kind==='counter'&&x===4&&y===4)&&!(kind==='split'&&x===4)&&!(kind==='bay'&&x>3&&y<4)?255:0);
    const cells=Array.from(a.keys()).filter(p=>a[p]>127),n=cells.length,ids=new Map(cells.map((p,i)=>[p,i]));
    const matrix=Array.from({length:n},()=>new Float64Array(n)),rhs=new Float64Array(n).fill(2),lambda=new Float64Array(n);
    for(let i=0;i<n;i++){
      const x=cells[i]%w,y=Math.floor(cells[i]/w);
      for(const q of [cells[i]-1,cells[i]+1,cells[i]-w,cells[i]+w]){
        if(ids.has(q)){matrix[i][i]++;matrix[i][ids.get(q)]--;}else matrix[i][i]+=2;
      }
      // These binary fixtures have independent bounds [2,6] on both axes.
      const u=(x-4)*Math.cos(27*Math.PI/180)+(y-4)*Math.sin(27*Math.PI/180);
      lambda[i]=.85*32*Math.exp(-((Math.sin(Math.PI*u/6)/.11)**2));
    }
    const free=dense(matrix,rhs),constrained=matrix.map((row,i)=>{const v=row.slice();v[i]+=lambda[i];return v;}),hard=dense(constrained,rhs);
    const expected=dense(constrained,Float64Array.from(rhs,(v,i)=>v+.4*lambda[i]*free[i]));
    const d=prepare(a,w,w,{weld:.85,pitch:6,axis:27}),f=solve(d,{tolerance:1e-10});
    f.u.forEach((v,i)=>{
      near(v,expected[i],1e-8);near(v,.4*free[i]+.6*hard[i],1e-8);
      assert.ok(v>=hard[i]-1e-8&&v<=free[i]+1e-8);near(d.tethers[i],lambda[i],1e-10);
    });
    assert.equal(f.iterations,f.freeIterations+f.tetherIterations);
    assert.ok(f.residual<=1.02e-10&&f.freeResidual<=1.02e-10);
  }
});

test('retained solve reports its true target residual without mutating domain or source topology',()=>{
  const a=disk(45,17),d=prepare(a,45,45,{weld:1,pitch:12,axis:-31}),saved=structuredClone(d),f=solve(d,{tolerance:1e-10});
  const free=solve(prepare(a,45,45,{weld:0}),{tolerance:1e-10}),m=mesh(d,f),plain=mesh(d,free);
  let residual2=0,target2=0;
  f.u.forEach((v,i)=>{
    const target=d.rhs[i]+.4*d.tethers[i]*free.u[i];let r=d.diag[i]*v-target;
    for(let k=0;k<4;k++){const j=d.neighbors[i*4+k];if(j>=0)r-=f.u[j];}
    residual2+=r*r;target2+=target*target;
  });
  near(Math.sqrt(residual2/target2),f.residual,1e-13);
  assert.deepEqual(d,saved);assert.deepEqual(m.triangles,plain.triangles);
  m.vertices.forEach((v,i)=>{near(v.x,plain.vertices[i].x,0);near(v.y,plain.vertices[i].y,0);if(v.boundary)assert.equal(v.u,0);});
  const base=solve(prepare(a,45,45,{weld:0}));assert.equal(base.freeIterations,undefined,'unwelded uses one solve');
  assert.throws(()=>solve(d,{maxIterations:1}),/converge/);
  assert.deepEqual(solve(d,{tolerance:1e-10,maxIterations:f.iterations}).u,f.u);
  assert.throws(()=>solve(d,{tolerance:1e-10,maxIterations:f.iterations-1}),/converge/);
});

test('phase closes exactly and Motion zero is phase independent; zero pressure returns original alpha',()=>{
  const a=disk(41,15),[d,f,m]=build(a,41,41);
  assert.deepEqual(deform(d,m,{},0),deform(d,m,{},1));
  assert.deepEqual(deform(d,m,{motion:0},.2),deform(d,m,{motion:0},.7));
  assert.notDeepEqual(deform(d,m,{},.25),deform(d,m,{},.75));
  const r=render(d,m,{pressure:0,yaw:75,tilt:75},.5);
  assert.deepEqual(Uint8ClampedArray.from(a,(_,i)=>r.data[i*4+3]),a);
  const flat=deform(d,m,{pressure:0});assert.ok(flat.front.every(p=>p.z===0));
});

test('declared endpoints remain finite, bounds grow without fitting, and output is nonblank',()=>{
  const a=disk(37,13),cases=[...Object.values(PNEUMATIC_STARTS),...Object.entries({pressure:[0,6],weld:[0,1],pitch:[6,128],axis:[-180,180],yaw:[-75,75],tilt:[-75,75],motion:[0,1]}).flatMap(([k,v])=>v.map(x=>({[k]:x}))),{pressure:6,weld:1,pitch:6,yaw:75,tilt:-75,motion:1}];
  for(const opts of cases){
    const s=pneumaticSettings(opts),[d,f,m]=build(a,37,37,s),shape=deform(d,m,s,.25),r=render(d,m,s,.25);
    assert.ok([...shape.front,...shape.back].every(p=>Object.values(p).every(Number.isFinite)));
    assert.ok(r.data.some((v,i)=>i%4===3&&v>0));
    for(const p of [...shape.front,...shape.back])assert.ok(p.x>=r.originX&&p.x<=r.originX+r.width&&p.y>=r.originY&&p.y<=r.originY+r.height);
  }
  const [d,f,m]=build(a,37,37),r=render(d,m,{pressure:6,yaw:75,motion:0});assert.ok(r.width>37);assert.ok(r.originX<0);
});

test('ink/roughness change material only and near-loop geometry is continuous',()=>{
  const [d,f,m]=build(disk(37,13),37,37),a=render(d,m),b=render(d,m,{},0,{ink:[20,140,210],roughness:1});
  for(let i=3;i<a.data.length;i+=4)assert.equal(a.data[i],b.data[i]);assert.notDeepEqual(a.data,b.data);
  const x=deform(d,m,{},1-1e-6),y=deform(d,m,{},1e-6);
  x.front.forEach((p,i)=>near(p.z,y.front[i].z,.001));
});

test('empty input stays empty and invalid, stale or excessive requests fail explicitly',()=>{
  const [d,f,m]=build(new Uint8Array(25),5,5);assert.equal(m.triangles.length,0);assert.ok(render(d,m).data.every(v=>v===0));
  assert.throws(()=>prepare(new Uint8Array(16).fill(255),4,4),/border/);
  assert.throws(()=>prepare(new Uint8Array(20),4,4),/budget/);
  assert.throws(()=>pneumaticSettings({pressure:Infinity}),/pressure/);
  assert.throws(()=>pneumaticSettings({weld:-1}),/weld/);
  assert.throws(()=>render(d,m,{},NaN),/phase/);
  assert.throws(()=>render(d,m,{},0,{scale:4}),/budget/);
  assert.throws(()=>deform(d,m,{weld:1}),/stale/);
  const full=prepare(disk(41,16),41,41);assert.throws(()=>solve(full,{maxIterations:1}),/converge/);
});

test('physical grid spacing keeps the same analytic dome as the source is refined',()=>{
  const errors=[];
  for(const step of [1,.5,.25]){
    const size=48/step,radius=12.3;
    const a=fixture(size,size,(x,y)=>Math.max(0,Math.min(255,((radius-Math.hypot((x+.5)*step-24,(y+.5)*step-24))/step+.5)*255)));
    const d=prepare(a,size,size,{weld:0},{pixelSize:step}),f=solve(d),m=mesh(d,f);let error=0,n=0;
    f.u.forEach((v,i)=>{const p=d.active[i],r=Math.hypot((p%size+.5)*step-24,(Math.floor(p/size)+.5)*step-24);if(r<radius-2){error+=Math.abs(v-(radius*radius-r*r)/2);n++;}});
    errors.push(error/n);assert.ok(error/n<radius*radius*.005);
    near(d.cx,24,0);near(d.cy,24,0);assert.ok(m.vertices.every(p=>p.x>=0&&p.x<=48&&p.y>=0&&p.y<=48));
  }
  assert.ok(errors[2]<errors[0],`refinement errors ${errors}`);
});

test('nonunit grid uses the physical Laplacian and obeys geometric scale covariance',()=>{
  const a=fixture(9,9,(x,y)=>x>1&&x<7&&y>1&&y<7&&!(x===4&&y===4)?255:0),cells=Array.from(a.keys()).filter(p=>a[p]>127),n=cells.length,lookup=new Map(cells.map((p,i)=>[p,i]));
  for(const step of [.25,2]){
    const M=Array.from({length:n},()=>new Float64Array(n)),rhs=new Float64Array(n).fill(2),lambda=new Float64Array(n);
    for(let i=0;i<n;i++){
      for(const q of [cells[i]-1,cells[i]+1,cells[i]-9,cells[i]+9]){
        M[i][i]+=(lookup.has(q)?1:2)/(step*step);if(lookup.has(q))M[i][lookup.get(q)]-=1/(step*step);
      }
      const x=(cells[i]%9-4)*step;lambda[i]=32*Math.exp(-((Math.sin(Math.PI*x/6)/.11)**2));
    }
    const free=dense(M,rhs),T=M.map((r,i)=>{const row=r.slice();row[i]+=lambda[i];return row;});
    const expected=dense(T,Float64Array.from(rhs,(v,i)=>v+.4*lambda[i]*free[i]));
    const d=prepare(a,9,9,{weld:1,pitch:6,axis:0},{pixelSize:step}),f=solve(d,{tolerance:1e-10});
    f.u.forEach((v,i)=>near(v,expected[i],1e-8));
  }
  const alpha=disk(45,17),s={weld:.8,pitch:32,axis:31,pressure:2,yaw:24,tilt:-13};
  const d1=prepare(alpha,45,45,s,{pixelSize:.5}),f1=solve(d1),m1=mesh(d1,f1),p1=deform(d1,m1,s,.3);
  const s2={...s,pitch:64},d2=prepare(alpha,45,45,s2,{pixelSize:1}),f2=solve(d2),m2=mesh(d2,f2),p2=deform(d2,m2,s2,.3);
  f1.u.forEach((v,i)=>near(v*4,f2.u[i],1e-7));
  p1.front.forEach((p,i)=>{for(const k of ['x','y','z'])near(p[k]*2,p2.front[i][k],1e-7);for(const k of ['nx','ny','nz'])near(p[k],p2.front[i][k],1e-7);});
});

test('fractional output preserves source coverage, nonzero bounds and a shared canonical mesh',()=>{
  const a=fixture(8,8,(x,y)=>(x===2||x===5)&&y>=2&&y<=5?255:0),[d,f,m]=build(a,8,8);
  const r=render(d,m,{pressure:0},0,{scale:.25});assert.deepEqual([r.width,r.height],[2,2]);
  for(let i=3;i<r.data.length;i+=4)assert.equal(r.data[i],32,'2 covered samples / 16 per output footprint');
  const thin=fixture(4,4,(x,y)=>x===1&&y===1?64:0),[td,tf,tm]=build(thin,4,4),tr=render(td,tm,{pressure:0},0,{scale:.5});
  assert.equal(tr.data[3],16,'subthreshold thin ink survives the identity minifier');
  const alpha=disk(41,15),settings={...PNEUMATIC_STARTS.bellows,pressure:6},domain=prepare(alpha,41,41,settings,{pixelSize:.5}),field=solve(domain),body=mesh(domain,field),saved=structuredClone(body);
  for(const scale of [.17,.5,1.37,3]){
    const output=render(domain,body,settings,.25,{scale}),shape=deform(domain,body,settings,.25);
    assert.ok(Number.isInteger(output.width)&&Number.isInteger(output.height)&&output.width>0&&output.height>0);
    for(const p of [...shape.front,...shape.back])assert.ok(p.x>=output.originX&&p.y>=output.originY&&p.x<=output.originX+output.width/scale&&p.y<=output.originY+output.height/scale);
    assert.ok(output.data.some((v,i)=>i%4===3&&v>0));
  }
  assert.deepEqual(body,saved,'output scale must not rewrite source geometry');
  assert.deepEqual(deform(domain,body,settings,0),deform(domain,body,settings,1));
  assert.deepEqual(render(domain,body,settings,0,{scale:.37}),render(domain,body,settings,1,{scale:.37}));
  assert.deepEqual(render(domain,body,{...settings,motion:0},.2,{scale:.37}),render(domain,body,{...settings,motion:0},.7,{scale:.37}));
  for(const step of [0,-1,NaN,Infinity,.01,16])assert.throws(()=>prepare(a,8,8,{}, {pixelSize:step}),/pixel size/);
  for(const scale of [0,-1,NaN,Infinity,Number.MIN_VALUE,4])assert.throws(()=>render(d,m,{},0,{scale}),/budget/);
});

test('relief gradients reproduce analytic dome normals before pressure and view transforms',()=>{
  // Independent continuous ellipsoid oracle, not a second implementation of
  // triangle-normal averaging. Restrict to complete interior one-rings.
  for(const step of [.5,1,2]){
    const d=prepare(disk(41,15),41,41,{}, {pixelSize:step}),radius=15*step;
    const field={u:Float64Array.from(d.active,p=>{const x=(p%41+.5)*step-d.cx,y=(Math.floor(p/41)+.5)*step-d.cy;return (radius*radius-x*x-y*y)/2;})};
    const m=mesh(d,field),saved=structuredClone(m);let checked=0;
    for(const pressure of [.1,1,6])for(const phase of [0,.25,.75]){
      const settings={pressure,motion:1,yaw:0,tilt:0},body=deform(d,m,settings,phase),p=pressure*(1+.25*Math.sin(2*Math.PI*phase));
      m.vertices.forEach((v,i)=>{
        const x=v.x-d.cx,y=v.y-d.cy;if(v.boundary||Math.hypot(x,y)>radius-2*step)return;
        checked++;near(m.gradients[2*i],-x,1e-11);near(m.gradients[2*i+1],-y,1e-11);
        const z=Math.sqrt(radius*radius-x*x-y*y),length=Math.hypot(p*x,p*y,z);
        for(const [side,sign] of [['front',1],['back',-1]]){
          const n=body[side][i];near(n.nx,p*x/length,1e-12);near(n.ny,p*y/length,1e-12);near(n.nz,sign*z/length,1e-12);
          near(Math.hypot(n.nx,n.ny,n.nz),1,1e-12);near(n.z,sign*p*z,1e-11);
        }
      });
    }
    assert.ok(checked>1000);assert.deepEqual(m,saved);
  }
});

test('implicit normals remain finite and outward on counters, isolated islands and narrow boundaries',()=>{
  const alpha=fixture(37,37,(x,y)=>{const r=Math.hypot(x-18,y-18);return (r>8&&r<14)||(x===3&&y>13&&y<21)?255:0;});
  const s={...PNEUMATIC_STARTS.bellows,pressure:6,motion:1,yaw:0,tilt:0},[d,f,m]=build(alpha,37,37,s);
  const saved=structuredClone(m);
  for(const phase of [0,.25,.75,1]){
    const body=deform(d,m,s,phase);
    m.vertices.forEach((v,i)=>{
      for(const side of ['front','back']){
        const n=body[side][i];assert.ok(Object.values(n).every(Number.isFinite));near(Math.hypot(n.nx,n.ny,n.nz),1,1e-12);
        assert.ok(n.nx*m.gradients[2*i]+n.ny*m.gradients[2*i+1]<=1e-12,'normal points away from increasing relief');
      }
      if(v.boundary)for(const k of ['x','y','z','nx','ny','nz'])near(body.front[i][k],body.back[i][k],1e-12);
    });
  }
  assert.deepEqual(m,saved);
  const empty=build(new Uint8ClampedArray(25),5,5);assert.equal(empty[2].gradients.length,0);
});
