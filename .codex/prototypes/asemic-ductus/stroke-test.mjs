import test from 'node:test';
import assert from 'node:assert/strict';
import {asemicStrokeSweep as sweep,asemicAppendSweep} from './stroke-study.mjs';
const points=[{x:0,y:0},{x:36,y:80},{x:66,y:14},{x:103,y:100},{x:145,y:45}];
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function inConvex(p,ring){return ring.every((v,i)=>cross(v,ring[(i+1)%ring.length],p)>=-1e-8);}
test('shared cubic position and derivative at every joint, including closed seam',()=>{
  for(const closed of [false,true])for(const flow of [-4,0,4]){
    const {segments}=sweep(points,{closed,flow});
    for(let i=0;i<(closed?segments.length:segments.length-1);i++){
      const a=segments[i],b=segments[(i+1)%segments.length];
      for(const k of ['x','y']){near(a[3][k],b[0][k]);near(a[3][k]-a[2][k],b[1][k]-b[0][k]);}
    }
  }
});
test('straight constant-axis guide stays collinear and pressure varies by written distance',()=>{
  const result=sweep([{x:0,y:0},{x:80,y:0},{x:160,y:0}],{flow:0,contrast:0,weight:12});
  assert.ok(result.samples.every(p=>Math.abs(p.y)<1e-12));
  near(result.samples.at(-1).distance,160);
  assert.ok(result.samples[0].pressure<.1&&result.samples.at(-1).pressure<.1);
  assert.ok(Math.max(...result.samples.map(p=>p.pressure))>.9);
  const refined=sweep([{x:0,y:0},{x:40,y:0},{x:80,y:0},{x:120,y:0},{x:160,y:0}],{flow:0,contrast:0,weight:12});
  for(const r of [result,refined])for(const p of r.samples){
    const t=p.x/160,reach=.15,smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
    near(p.pressure,(.08+.92*smooth(t/reach)*smooth((1-t)/reach))*(.89+.11*Math.sin(t*Math.PI*4+.023)));
  }
});
test('positive convex patches contain both nib centers and preserve compound ink union',()=>{
  for(const closed of [false,true])for(const weight of [.4,7.2,64]){
    const r=sweep(points,{closed,weight,contrast:6,flow:4,nibAngle:.78});
    r.rings.forEach((ring,i)=>{
      assert.ok(ring.length>=3);
      assert.ok(ring.every((p,j)=>cross(p,ring[(j+1)%ring.length],ring[(j+2)%ring.length])>=-1e-9));
      assert.ok(inConvex(r.samples[i],ring));assert.ok(inConvex(r.samples[i+1],ring));
    });
  }
});
test('straight sweep support follows independently computed ellipse support',()=>{
  const weight=64,contrast=6,nibAngle=.41,r=sweep([{x:0,y:0},{x:80,y:0}],{weight,contrast,flow:0,nibAngle});
  const a=weight/2*(1+.14*contrast),b=weight/2*(1-.08*contrast);
  for(let i=0;i<r.rings.length;i++)for(let k=0;k<64;k++){
    const theta=k*Math.PI/32,nx=Math.cos(theta),ny=Math.sin(theta);
    const support=Math.hypot(a*Math.cos(theta-nibAngle),b*Math.sin(theta-nibAngle));
    const expected=Math.max(...[r.samples[i],r.samples[i+1]].map(p=>p.x*nx+p.y*ny+p.pressure*support));
    const actual=Math.max(...r.rings[i].map(p=>p.x*nx+p.y*ny));
    assert.ok(expected-actual>=-1e-9&&expected-actual<=.121,`polygon support deviation ${expected-actual}`);
  }
});
test('deterministic closed phase, unchanged anchors, finite declared extremes and retraced path',()=>{
  const saved=JSON.stringify(points),round=r=>JSON.stringify(r.rings.map(ring=>ring.map(p=>[+p.x.toFixed(8),+p.y.toFixed(8)])));
  for(const closed of [false,true])for(const weight of [.4,64])for(const contrast of [0,6])for(const flow of [-4,4]){
    const opts={closed,weight,contrast,flow,phase:0},a=sweep(points,opts),b=sweep(points,{...opts,phase:Math.PI*2});
    assert.equal(round(a),round(b));assert.equal(round(a),round(sweep(points,opts)));
    assert.ok(a.rings.flat().every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
    assert.notEqual(round(a),round(sweep(points,{...opts,phase:Math.PI})));
  }
  assert.equal(JSON.stringify(points),saved);
  const retrace=sweep([{x:0,y:0},{x:80,y:0},{x:0,y:0}],{weight:32});
  assert.ok(retrace.rings.length>0&&retrace.samples.every(p=>Number.isFinite(p.pressure)));
});
test('degenerate inputs are empty and invalid or excessive work fails explicitly',()=>{
  for(const p of [[],[{x:0,y:0}],[{x:0,y:0},{x:0,y:0}]])assert.equal(sweep(p).rings.length,0);
  assert.equal(sweep(points,{weight:0}).rings.length,0);
  assert.throws(()=>sweep([{x:NaN,y:0}]),/anchor/);
  assert.throws(()=>sweep(points,{flow:Infinity}),/setting/);
  assert.throws(()=>sweep(points,{weight:-1}),/Negative/);
  assert.throws(()=>sweep(Array.from({length:33},(_,i)=>({x:i,y:i%3}))),/anchor budget/);
  assert.throws(()=>sweep([{x:0,y:0},{x:1000000,y:0}]),/sample budget/);
});

test('linear hull merge preserves every polygon vertex, guide and pressure exactly',()=>{
  for(const closed of [false,true])for(const weight of [.4,7.2,64])for(const contrast of [0,6])for(const flow of [-4,4]){
    const opts={closed,weight,contrast,flow,nibAngle:.83},a=sweep(points,opts),b=sweep(points,{...opts,mode:'linear'});
    assert.deepEqual(a,b);
    const repeat=sweep(points,{...opts,mode:'linear',phase:2*Math.PI});
    const round=r=>JSON.stringify(r,(k,v)=>typeof v==='number'?+v.toFixed(8):v);
    assert.equal(round(b),round(repeat));
    assert.ok(b.rings.flat().every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  }
  assert.throws(()=>sweep(points,{mode:'unknown'}),/mode/);
});

test('linear order repair preserves hulls at translated and near-axis floating point ties',()=>{
  for(const offset of [0,1e6,-1e8])for(const nibAngle of [0,Math.PI/2,Math.PI,1e-16]){
    const p=points.map(p=>({x:p.x+offset,y:p.y-offset}));
    for(const weight of [.4,64]){
      const opts={weight,nibAngle,contrast:6};
      assert.deepEqual(sweep(p,{...opts,mode:'linear'}),sweep(p,opts));
    }
  }
});

test('append-only painter preserves rings and never composites',()=>{
  const r=sweep(points,{mode:'linear'}),calls=[];
  const ctx=Object.fromEntries(['moveTo','lineTo','closePath'].map(name=>[name,(...args)=>calls.push({name,args})]));
  asemicAppendSweep(ctx,r);
  assert.equal(calls.filter(c=>c.name==='moveTo').length,r.rings.length);
  assert.equal(calls.filter(c=>c.name==='closePath').length,r.rings.length);
  const baseline=[];
  for(const ring of r.rings){baseline.push({name:'moveTo',args:[ring[0].x,ring[0].y]});for(const p of ring.slice(1))baseline.push({name:'lineTo',args:[p.x,p.y]});baseline.push({name:'closePath',args:[]});}
  assert.deepEqual(calls,baseline);
  for(const p of [[],[{x:0,y:0}]])asemicAppendSweep(ctx,sweep(p,{mode:'linear'}));
});
