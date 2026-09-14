import assert from 'node:assert/strict';
import * as Aux from './core.mjs';
const polygon=points=>({points:points.map(([x,y])=>({x,y}))});
const box=(x0,y0,x1,y1,reverse=false)=>{const p=polygon([[x0,y0],[x1,y0],[x1,y1],[x0,y1]]);if(reverse)p.points.reverse();return p;};
const source=[box(-54,-62,56,64),box(-28,-35,31,38,true),box(68,-58,74,-51)];
const glyph=Aux.prepareAuxeticGlyph(source),snapshot=JSON.stringify(source),area=glyph.rings.reduce((s,r)=>s+r.area,0);
const at=(m,p)=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f});
function contains(rings,x,y){let winding=0;for(const ring of rings)for(let i=0;i<ring.points.length;i++){
  const a=ring.points[i],b=ring.points[(i+1)%ring.points.length],side=(b.x-a.x)*(y-a.y)-(x-a.x)*(b.y-a.y);
  if(a.y<=y&&b.y>y&&side>0)winding++;if(a.y>y&&b.y<=y&&side<0)winding--;
}return winding!==0;}
const interior=(rings,x,y)=>contains(rings,x,y);
// Concave ring clipping must preserve two disconnected strips and the gap.
const u=polygon([[0,0],[60,0],[60,60],[44,60],[44,15],[16,15],[16,60],[0,60]]);
const clipped=Aux.clipAuxeticRing(u.points,[0,30,60,55]);
assert.ok(contains([{points:clipped}],8,40));assert.ok(contains([{points:clipped}],52,40));assert.equal(contains([{points:clipped}],30,40),false);
assert.deepEqual(Aux.auxeticCutIntervals(glyph.rings,'x',0,-100,100),[[-62,-35],[38,64]]);
assert.deepEqual(Aux.auxeticCutIntervals(glyph.rings,'y',0,-100,100),[[-54,-28],[31,56]]);
let state=819,checks=0;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);
for(const module of [6,24,96])for(const aspect of [.25,1,4])for(const axis of [-73,0,39]){
  const compiled=Aux.compileAuxeticGlyph(glyph,{module,aspect,axis});
  assert.ok(Math.abs(compiled.panels.reduce((s,p)=>s+p.area,0)-area)<1e-7,'Dissection conserves panel ink area');
  for(const opening of [0,28,45,78,90]){
    const settings={opening,ligament:0,motion:0},shape=Aux.renderAuxeticGlyph(compiled,settings);
    assert.ok(Math.abs(shape.rings.reduce((s,r)=>s+Aux.auxeticArea(r.points),0)-area)<1e-7,'Rigid deployment conserves material area');
    const d=shape.deployment;
    for(const panel of compiled.panels){
      const m=Aux.auxeticPanelMatrix(compiled,panel,d);
      assert.ok(Math.abs(m.a*m.d-m.b*m.c-1)<1e-12);assert.ok(Math.abs(m.a*m.a+m.b*m.b-1)<1e-12);
      for(let i=0;i<4;i++){
        const x=panel.x+(random()-.5)*compiled.px,y=panel.y+(random()-.5)*compiled.py;
        const point=at(m,{x,y}),sourcePoint={x:glyph.center.x+compiled.ca*x-compiled.sa*y,y:glyph.center.y+compiled.sa*x+compiled.ca*y};
        assert.equal(interior(shape.rings,point.x,point.y),interior(glyph.rings,sourcePoint.x,sourcePoint.y),'Inverse material membership');checks++;
      }
    }
  }
  // Every ligament starts at an actually shared positive interval on both faces.
  for(const joint of compiled.joints){
    const mid=(joint.lo+joint.hi)/2,epsilon=1e-6;
    for(const sign of [-1,1]){
      const x=joint.axis==='x'?joint.value+sign*epsilon:mid,y=joint.axis==='y'?joint.value+sign*epsilon:mid;
      assert.ok(contains(glyph.rings,glyph.center.x+compiled.ca*x-compiled.sa*y,glyph.center.y+compiled.sa*x+compiled.ca*y));
    }
  }
}
// Exact rigid full-cell corner hinges, including anisotropic rectangular units.
const full=Aux.prepareAuxeticGlyph([box(-48,-48,48,48)]);
for(const aspect of [.25,1,4]){
  const mesh=Aux.compileAuxeticGlyph(full,{module:24,aspect});
  for(const opening of [1,28,45,89,90]){
    const d=Aux.auxeticDeployment(mesh,opening);
    for(const panel of mesh.panels){
      const right=mesh.panels.find(p=>p.i===panel.i+1&&p.j===panel.j);if(!right)continue;
      const sign=((panel.i+panel.j)&1)?1:-1;
      const p={x:(panel.i+1)*mesh.px,y:panel.y+sign*mesh.py/2};
      const a=at(Aux.auxeticPanelMatrix(mesh,panel,d),p),b=at(Aux.auxeticPanelMatrix(mesh,right,d),p);
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-10,'Shared full-cell corner stays joined');
    }
  }
}
for(const settings of Object.values(Aux.AUXETIC_TYPE_STARTS)){
  const mesh=Aux.compileAuxeticGlyph(glyph,settings);
  assert.deepEqual(Aux.renderAuxeticGlyph(mesh,settings,0),Aux.renderAuxeticGlyph(mesh,settings,1));
  assert.notDeepEqual(Aux.renderAuxeticGlyph(mesh,settings,0).rings,Aux.renderAuxeticGlyph(mesh,settings,.5).rings);
  assert.deepEqual(Aux.renderAuxeticGlyph(mesh,{...settings,motion:0},.1),Aux.renderAuxeticGlyph(mesh,{...settings,motion:0},.7));
  const shape=Aux.renderAuxeticGlyph(mesh,settings,.31);
  assert.ok(shape.rings.some(r=>r.ligament));
  for(const r of shape.rings)for(const p of r.points)assert.ok(Number.isFinite(p.x+p.y));
  assert.equal(Aux.renderAuxeticGlyph(mesh,{opening:0}).rings.length,glyph.rings.length);
  assert.deepEqual(Aux.renderAuxeticGlyph(mesh,{opening:0}).rings.map(r=>r.points),glyph.rings.map(r=>r.points));
  assert.throws(()=>Aux.renderAuxeticGlyph(mesh,settings,.31,{maxPoints:1}),/budget/);
  assert.throws(()=>Aux.renderAuxeticGlyph(mesh,{opening:0},0,{maxPoints:1}),/budget/);
  assert.throws(()=>Aux.renderAuxeticGlyph(mesh,{motion:1},.5,{maxPoints:1}),/budget/);
  assert.throws(()=>Aux.renderAuxeticGlyph(mesh,settings,.31,{tolerance:1e-12}),/budget/);
}
for(const [key,values] of Object.entries({opening:[0,90],module:[6,96],aspect:[.25,4],axis:[-180,180],ligament:[0,1],motion:[0,1]})){
  for(const value of values){
    const settings={...Aux.AUXETIC_TYPE_STARTS.lancet,[key]:value},mesh=Aux.compileAuxeticGlyph(glyph,settings),saved=JSON.stringify(mesh);
    for(const phase of [0,.31,.5,1]){
      const shape=Aux.renderAuxeticGlyph(mesh,settings,phase);
      assert.ok(shape.rings.length);for(const ring of shape.rings)for(const p of ring.points)assert.ok(Number.isFinite(p.x+p.y));
    }
    assert.equal(JSON.stringify(mesh),saved,'Rendering cannot mutate prepared cut material');
  }
}
const disconnected=Aux.prepareAuxeticGlyph([box(-30,-18,-.01,18),box(.01,-18,30,18)]);
const disconnectedMesh=Aux.compileAuxeticGlyph(disconnected,{module:24});
assert.equal(disconnectedMesh.joints.some(j=>j.axis==='x'&&j.value===0),false,'No ligament across an existing source gap');
const shifted=Aux.prepareAuxeticGlyph(source.map(r=>({points:r.points.map(p=>({x:p.x+150,y:p.y-74}))})));
const shapeA=Aux.renderAuxeticGlyph(Aux.compileAuxeticGlyph(glyph)),shapeB=Aux.renderAuxeticGlyph(Aux.compileAuxeticGlyph(shifted));
assert.equal(shapeA.rings.length,shapeB.rings.length);
for(let r=0;r<shapeA.rings.length;r++)for(let i=0;i<shapeA.rings[r].points.length;i++){
  const a=shapeA.rings[r].points[i],b=shapeB.rings[r].points[i];assert.ok(Math.hypot(b.x-a.x-150,b.y-a.y+74)<1e-9,'Glyph translation cannot re-cut or change anatomy');
}
assert.equal(JSON.stringify(source),snapshot);
const empty=Aux.prepareAuxeticGlyph([]);assert.equal(Aux.renderAuxeticGlyph(Aux.compileAuxeticGlyph(empty)).rings.length,0);
assert.throws(()=>Aux.prepareAuxeticGlyph([polygon([[0,0],[NaN,1],[1,0]])]));
assert.throws(()=>Aux.prepareAuxeticGlyph([box(0,0,10,10,true)]),/winding/);
assert.throws(()=>Aux.compileAuxeticGlyph(glyph,{}, {maxCells:1}),/budget/);
assert.throws(()=>Aux.compileAuxeticGlyph(glyph,{}, {maxPoints:2}),/budget/);
const mesh=Aux.compileAuxeticGlyph(glyph);assert.throws(()=>Aux.renderAuxeticGlyph(mesh,{module:50}),/recompilation/);
assert.throws(()=>Aux.renderAuxeticGlyph(mesh,{},0,{tolerance:0}),/budget/);
assert.equal(Aux.auxeticPixelTolerance({a:2,b:0,c:0,d:2}),.1);
assert.ok(Math.abs(Aux.auxeticPixelTolerance({a:2,b:0,c:1,d:3})-.2/3.25661653798294)<1e-12);
assert.equal(Aux.auxeticPixelTolerance({a:0,b:0,c:0,d:0}),10);
assert.throws(()=>Aux.auxeticPixelTolerance({a:Infinity,b:0,c:0,d:1}));
const pool=Aux.createAuxeticSourcePool({pointLimit:8});let loads=0;
pool.sync([{key:'A',load:available=>{loads++;assert.equal(available,8);return{pointCount:5};}},{key:'A',load(){throw new Error('duplicate');}},{key:'B',load:available=>{loads++;assert.equal(available,3);return{pointCount:4};}}]);
assert.equal(pool.state().total,2);pool.advance();assert.equal(pool.read('A').pointCount,5);pool.advance();
assert.match(pool.state().error,/budget/);assert.equal(loads,2);pool.setPaused(true);assert.equal(pool.advance(),false);pool.retry();
pool.sync([{key:'A',load(){throw new Error('reloaded');}}]);assert.equal(pool.state().points,5);assert.equal(pool.inspect('B').status,'missing');pool.reset();assert.equal(pool.state().total,0);
// A much finer render is an independent dense oracle for the accepted adaptive
// polyline. Check the complete two-sided ligament outlines at difficult poses.
const distanceToRing=(p,points)=>Math.min(...points.map((a,i)=>pointSegmentDistanceForTest(p,a,points[(i+1)%points.length])));
function pointSegmentDistanceForTest(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy,t=d2?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d2)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
for(const settings of [{...Aux.AUXETIC_TYPE_STARTS.lancet,opening:90},{...Aux.AUXETIC_TYPE_STARTS.cipher,opening:90,aspect:4}]){
  const candidate=Aux.renderAuxeticGlyph(Aux.compileAuxeticGlyph(glyph,settings),settings,.17,{tolerance:.08});
  const oracle=Aux.renderAuxeticGlyph(Aux.compileAuxeticGlyph(glyph,settings),settings,.17,{tolerance:.0005});
  const a=candidate.rings.filter(r=>r.ligament),b=oracle.rings.filter(r=>r.ligament);assert.equal(a.length,b.length);
  for(let i=0;i<a.length;i++)for(const p of b[i].points)assert.ok(distanceToRing(p,a[i].points)<=.081,'Adaptive ligament outline stays inside requested sampled error');
}
console.log('Auxetic Type: '+checks+' inverse material samples; 135 rigid states, area/winding, concave clipping, real-cut ligaments, source gaps, full-cell hinges, native zero, loop, 48 axis-extreme states, translation, ownership and explicit budgets passed (offline prototype).');
