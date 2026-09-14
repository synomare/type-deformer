import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../pattern-tension-operators.js';
import '../field-material-operators.js';
const A=globalThis.TypeDeformerPatternTension,I=A.internals;

test('Truchet paths partition all arcs, matching opposite boundary ports with no broken internal strands',()=>{
  for(const seed of [0,1,19]){const cols=8,rows=7,orient=Array.from({length:cols*rows},(_,i)=>(Math.imul(i+3,seed+19)>>>2)%2),graph=I.truchetGraph(cols,rows,orient),visited=[];
    for(const path of graph.paths){for(let i=0;i<path.segments.length;i++){const s=path.segments[i];visited.push(s.edge.id);const points=I.arcPoints(s.edge,s.entry,s.exit,20,0,0,'ribbon');if(i+1<path.segments.length){const n=path.segments[i+1],next=I.arcPoints(n.edge,n.entry,n.exit,20,0,0,'ribbon');assert.ok(Math.hypot(points.at(-1)[0]-next[0][0],points.at(-1)[1]-next[0][1])<1e-8);}else if(!path.closed)assert.equal(graph.neighbor(s.edge,s.exit),-1);}}
    assert.equal(visited.length,cols*rows*2);assert.equal(new Set(visited).size,visited.length);
  }
});

function source(w,h,ink){const alpha=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)alpha[y*w+x]=ink(x,y)?1:0;return {w,h,alpha,scale:1};}
test('glyph mesh keeps holes and disconnected punctuation, and pairs manifold interior edges',()=>{
  const s=source(80,80,(x,y)=>(x>=10&&x<=55&&y>=10&&y<=60&&!(x>22&&x<43&&y>24&&y<47))||(x>=64&&x<=72&&y>=10&&y<=18)),mesh=I.meshFromMask(s,2);
  assert.equal(mesh.components.length,2);assert.ok(mesh.boundary.length>50);assert.ok(mesh.edges.every(e=>e.bend||e.faces===1||e.faces===2));
  for(const tri of mesh.triangles){const x=tri.reduce((a,i)=>a+mesh.nodes[i].ox,0)/3,y=tri.reduce((a,i)=>a+mesh.nodes[i].oy,0)/3;assert.ok(!(x>24&&x<41&&y>26&&y<45),'counter has no triangle');}
  assert.equal(I.meshFromMask(source(10,10,()=>false),2).nodes.length,0);
});

test('XPBD distance update satisfies the compliant equation and keeps the fixed anchor exact',()=>{
  const nodes=[{x:0,y:0,z:0,w:0},{x:14,y:0,z:0,w:1}],edge={a:0,b:1,rest:10,lambda:0};
  I.solveDistance(nodes,edge,.5);assert.equal(nodes[0].x,0);assert.ok(Math.abs(nodes[1].x-11.333333333333334)<1e-12);
  const lambda=edge.lambda;I.solveDistance(nodes,edge,.5);assert.ok(Math.abs(edge.lambda-lambda)<1e-12,'multiplier accumulates instead of restarting each iteration');
  assert.ok(Math.abs(nodes[1].x-edge.rest+.5*edge.lambda)<1e-12);
});

test('membrane settles deterministically, keeps all components supported, and load changes the solved volume',()=>{
  const s=source(52,66,(x,y)=>x>=8&&x<=42&&y>=6&&y<=56),defaults=A.schemas.tensionMembrane.defaults,states=[];
  for(const mode of ['canopy','drape','twist']){const p={...defaults,membraneMode:mode},a=I.simulate(I.meshFromMask(s,3.2),p,17),b=I.simulate(I.meshFromMask(s,3.2),p,17);assert.deepEqual(a.nodes,b.nodes);assert.ok(a.components.every(c=>c.some(i=>a.nodes[i].w===0)));assert.ok(a.nodes.every(n=>[n.x,n.y,n.z].every(Number.isFinite)));states.push(a.nodes.map(n=>n.z).join(','));}
  assert.equal(new Set(states).size,3);const flat=I.simulate(I.meshFromMask(s,3.2),{...defaults,membraneSlack:0,membraneLoad:0,membraneBias:0},17);assert.ok(flat.nodes.every(n=>Math.abs(n.z)<1e-12));
});

test('all extreme controls leave finite supported geometry without changing connectivity',()=>{
  const s=source(70,80,(x,y)=>x>6&&x<61&&y>8&&y<65&&!(x>18&&x<46&&y>25&&y<50)),defaults=A.schemas.tensionMembrane.defaults;
  for(const mode of ['canopy','drape','twist'])for(const high of [false,true]){const p={...defaults,membraneMode:mode};for(const [k,[min,max]]of Object.entries(A.schemas.tensionMembrane.limits))p[k]=high?max:min;const mesh=I.meshFromMask(s,3.2),count=mesh.triangles.length;I.simulate(mesh,p,19);assert.equal(mesh.triangles.length,count);assert.ok(mesh.nodes.every(n=>[n.x,n.y,n.z].every(v=>Number.isFinite(v)&&Math.abs(v)<1000)));}
});

test('both operators retain independent glyph profiles and all host persistence connections',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),fields=globalThis.TypeDeformerFieldMaterials;
  assert.ok(html.indexOf('src="pattern-tension-operators.js"')<html.indexOf('src="field-material-operators.js"'));
  for(const id of A.ids){assert.ok(fields.ids.includes(id));for(const suffix of ['Opacity','SourceOpacity','Color','SourceMode','Blend'])assert.ok(html.includes(`${id}: '${id+suffix}'`));
    assert.ok(html.includes(`${id}: fieldMaterialRenderer('${id}')`));assert.ok(html.includes(`fieldMaterialPad('${id}')`));
    for(const key of Object.keys(A.schemas[id].defaults)){assert.ok(html.includes(`${key}: deform.${key}`));assert.ok(html.includes(`${key}: params.${key}`));}
  }
  assert.equal(fields.internals.settings('tensionMembrane',{surface:{membraneLoad:0,membraneMode:'twist'}},{}).membraneLoad,0);
  assert.equal(fields.internals.settings('tensionMembrane',{surface:{membraneLoad:2,membraneMode:'drape'}},{}).membraneMode,'drape');
  assert.equal(fields.internals.settings('ornamentReserve',{surface:{reserveReach:8}},{}).reserveReach,8);
  assert.equal(fields.internals.settings('ornamentReserve',{surface:{reserveReach:90}},{}).reserveReach,90);
});
