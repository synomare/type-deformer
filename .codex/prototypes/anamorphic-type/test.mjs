import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareAnamorphicProfile as prepare,anamorphicContains as inside,anamorphicRay as ray,
  renderAnamorphic as render,anamorphicView as view,anamorphicCompatibility as compatibility} from './core.mjs';
const rect=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const unit=p=>{const n=Math.hypot(...p);return p.map(v=>v/n);};
let seed=4123;const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
function slab(o,d,min,max){
  let lo=-Infinity,hi=Infinity;
  for(let k=0;k<3;k++){
    if(!d[k]){if(o[k]<min[k]||o[k]>max[k])return null;}
    else {const t=[(min[k]-o[k])/d[k],(max[k]-o[k])/d[k]].sort((a,b)=>a-b);lo=Math.max(lo,t[0]);hi=Math.min(hi,t[1]);}
  }
  return hi>Math.max(lo,0)?Math.max(0,lo):null;
}
test('two-profile ray intersections equal an independent box-slab oracle',()=>{
  const a=prepare([rect(-3,-4,3,4)]),b=prepare([rect(-2,-4,2,4)]);
  for(const depth of [.1,1,4])for(let n=0;n<300;n++){
    const o=[random()*24-12,random()*24-12,random()*24-12],d=unit([random()-.5,random()-.5,random()-.5]);
    const expected=slab(o,d,[-3,-4,-2*depth],[3,4,2*depth]),actual=ray(a,b,o,d,depth);
    assert.equal(!!actual,expected!==null);
    if(actual){assert.ok(Math.abs(actual.t-expected)<1e-10);if(!actual.inside){assert.ok(actual.normal.every(Number.isFinite));assert.ok(actual.normal.reduce((s,x,k)=>s+x*d[k],0)<=0);}}
  }
});
test('both counters and disconnected ink agree with a union-of-boxes oracle',()=>{
  const a=prepare([rect(-4,-4,4,4),rect(-1,-2,1,2)]),b=prepare([rect(-3,-4,3,4),rect(-1,-1,1,1)]);
  const ar=[[-4,-4,4,-2],[-4,2,4,4],[-4,-2,-1,2],[1,-2,4,2]];
  const br=[[-3,-4,3,-1],[-3,1,3,4],[-3,-1,-1,1],[1,-1,3,1]];
  for(let n=0;n<600;n++){
    const o=unit([random()-.5,random()-.5,random()-.5]).map(x=>x*15),d=unit(o.map(x=>-x+(random()-.5)*8));
    let expected=Infinity;
    for(const r of ar)for(const q of br){const y0=Math.max(r[1],q[1]),y1=Math.min(r[3],q[3]);if(y1<=y0)continue;
      const hit=slab(o,d,[r[0],y0,-q[2]],[r[2],y1,-q[0]]);if(hit!==null)expected=Math.min(expected,hit);}
    const actual=ray(a,b,o,d);assert.equal(!!actual,Number.isFinite(expected));
    if(actual)assert.ok(Math.abs(actual.t-expected)<1e-10);
  }
  const islands=prepare([rect(-3,-3,-1,3),rect(1,-3,3,3)]);
  assert.equal(inside(islands,0,0),false);assert.equal(inside(islands,2,0),true);
});
test('thin ink, tangent vertices, source order/winding, translation and scale',()=>{
  const rings=[[{x:0,y:-4},{x:3,y:0},{x:0,y:4},{x:-3,y:0}]],a=prepare(rings),b=prepare([rect(-2,-4,2,4)]);
  const reversed=prepare(rings.map(r=>[...r].reverse()));
  for(const y of [-4,-3.2,0,1,3.1,4])for(const x of [-4,-1.9,0,.6,4])assert.equal(inside(a,x,y),inside(reversed,x,y));
  const thin=prepare([rect(-.00001,-4,.00001,4)]);
  const hit=ray(thin,b,[-10,0,0],[1,0,0]);assert.ok(Math.abs(hit.t-9.99999)<1e-12);
  const o=[10,12,15],d=unit([-10,-12,-15]),base=ray(a,b,o,d);
  const shifted=(p,x,y)=>prepare(p.rings.map(r=>r.map(q=>({x:q.x+x,y:q.y+y}))));
  const translated=ray(shifted(a,120,-72),shifted(b,-18,-72),[o[0]+120,o[1]-72,o[2]+18],d);
  assert.ok(Math.abs(base.t-translated.t)<1e-10);
  const scaled=p=>prepare(p.rings.map(r=>r.map(q=>({x:q.x*7,y:q.y*7}))));
  assert.ok(Math.abs(ray(scaled(a),scaled(b),o.map(x=>x*7),d).t-base.t*7)<1e-10);
  assert.deepEqual(a.rings,rings);
});
test('orthogonal profiles render their own silhouettes, never an overlaid partner',()=>{
  const a=prepare([rect(-15,-20,15,20),rect(-5,-10,5,10)]),b=prepare([rect(-12,-20,12,20)]);
  for(const [yaw,profile] of [[0,a],[90,b]]){
    const image=render(a,b,{yaw,unlit:true},{width:64,height:64,samples:2});
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      let covered=0;for(const sy of [.25,.75])for(const sx of [.25,.75])covered+=inside(profile,x+sx-32,y+sy-32)?1:0;
      assert.equal(image.pixels[(y*64+x)*4+3],Math.round(covered/4*255));
    }
  }
});
test('incompatible vertical support is measured exactly without silently repairing the letters',()=>{
  const a=prepare([rect(-3,-4,3,4)]),b=prepare([rect(-2,-4,2,-1),rect(-2,1,2,4)]);
  const d=compatibility(a,b);assert.equal(d.areaA,48);assert.equal(d.areaB,24);assert.equal(d.retainedA,36);assert.equal(d.lossA,.25);assert.equal(d.lossB,0);
  assert.equal(ray(a,b,[0,0,15],[0,0,-1]),null,'inconsistent band remains absent');
  const diamond=prepare([[{x:0,y:-4},{x:3,y:0},{x:0,y:4},{x:-3,y:0}]]);
  assert.equal(compatibility(diamond,a).areaA,24,'linear slab integration is exact for straight polygon edges');
});
test('loop and disabled motion, fixed camera scale, one opacity application and independent results',()=>{
  const a=prepare([rect(-16,-20,16,20),rect(-7,-8,7,8)]),b=prepare([rect(-10,-20,10,20)]),frame={width:64,height:64,samples:2};
  const p={yaw:45,tilt:-16,motion:1,depth:1.4},base=render(a,b,p,frame);
  assert.deepEqual(base.pixels,render(a,b,p,{...frame,phase:1}).pixels);
  assert.notDeepEqual(base.pixels,render(a,b,p,{...frame,phase:.5}).pixels);
  assert.deepEqual(view({...p,motion:0},.1),view({...p,motion:0},.6));
  const faded=render(a,b,{...p,opacity:.45},frame);
  for(let i=3;i<base.pixels.length;i+=4)assert.ok(Math.abs(faded.pixels[i]-base.pixels[i]*.45)<=1);
  assert.ok(base.pixels.some((v,i)=>i%4===3&&v));
  const snapshot=base.pixels.slice();render(a,b,{yaw:-120,depth:4},frame);assert.deepEqual(base.pixels,snapshot);
});
test('all declared extremes stay finite with explicit work budgets and empty/invalid handling',()=>{
  const a=prepare([rect(-8,-10,8,10)]),b=prepare([rect(-6,-10,6,10)]);
  for(const yaw of [-180,0,180])for(const tilt of [-80,80])for(const depth of [.1,4])for(const roughness of [.04,1]){
    const r=render(a,b,{yaw,tilt,depth,roughness,metal:1},{width:48,height:48,samples:1});
    assert.ok(r.pixels.some((v,i)=>i%4===3&&v));assert.ok(r.stats.edgeTests>0);
  }
  assert.equal(render(prepare([]),b).pixels.some(v=>v),false);
  assert.throws(()=>prepare([[{x:NaN,y:0}]]),/Non-finite/);
  assert.throws(()=>prepare([rect(0,0,1,1)],{maxEdges:3}),/budget/);
  assert.throws(()=>render(a,b,{yaw:0},{maxEdgeTests:1}),/budget/);
  assert.throws(()=>render(a,b,{}, {width:0}),/Invalid frame/);
  assert.throws(()=>compatibility(a,b,{maxEdgeTests:1}),/budget/);
  assert.throws(()=>view({},NaN),/Invalid phase/);
});
test('arc-normal filtering preserves all hit distances and alpha, keeps corners, and reduces circle normal noise',()=>{
  const points=Array.from({length:320},(_,i)=>{const t=i/320*Math.PI*2,r=20+.045*Math.sin(i*2.3);return {x:r*Math.cos(t),y:r*Math.sin(t)};});
  const raw=prepare([points],{smoothRadius:0}),smooth=prepare([points]),b=prepare([rect(-10,-24,10,24)]);
  let rawError=0,smoothError=0;
  for(let i=0;i<180;i++){
    const angle=(i+.17)/180*Math.PI*2,o=[Math.cos(angle)*40,Math.sin(angle)*40,0],d=[-Math.cos(angle),-Math.sin(angle),0];
    const a=ray(raw,b,o,d),c=ray(smooth,b,o,d);assert.equal(a.t,c.t);
    const expected=[Math.cos(angle),Math.sin(angle),0];
    rawError+=Math.hypot(...a.normal.map((v,k)=>v-expected[k]));smoothError+=Math.hypot(...c.normal.map((v,k)=>v-expected[k]));
  }
  assert.ok(smoothError<rawError*.45,`${rawError} -> ${smoothError}`);
  const frame={width:80,height:80,samples:2};
  const a=render(raw,b,{yaw:35,tilt:-20},frame),c=render(smooth,b,{yaw:35,tilt:-20},frame);
  for(let p=3;p<a.pixels.length;p+=4)assert.equal(a.pixels[p],c.pixels[p]);
  const cube=prepare([rect(-10,-10,10,10)]),sharp=prepare([rect(-10,-10,10,10)],{smoothRadius:0});
  assert.deepEqual(render(cube,cube,{yaw:30,tilt:-22},frame).pixels,render(sharp,sharp,{yaw:30,tilt:-22},frame).pixels);
});
test('exact cardinal views preserve half-open endpoint samples without snapping neighboring angles',()=>{
  assert.equal(view({yaw:90}).right[0],0);assert.equal(view({yaw:90}).toward[2],0);
  assert.notEqual(view({yaw:90-1e-10}).right[0],0);
  const a=prepare([rect(-12.25,-15.25,12.25,15.25)]),b=prepare([rect(-10.25,-15.25,10.25,15.25)]);
  for(const [yaw,profile] of [[0,a],[90,b]]){
    const image=render(a,b,{yaw,unlit:true},{width:64,height:60,samples:2});
    for(let y=0;y<60;y++)for(let x=0;x<64;x++){
      let coverage=0;for(const sy of [.25,.75])for(const sx of [.25,.75])coverage+=inside(profile,x+sx-32,y+sy-30)?1:0;
      assert.equal(image.pixels[(y*64+x)*4+3],Math.round(coverage/4*255));
    }
  }
});
