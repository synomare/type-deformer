import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../field-material-operators.js';
const api=globalThis.TypeDeformerFieldMaterials,I=api.internals;
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('weighted Lloyd relaxation reduces weighted quantization error and computes true centroids',()=>{
 const points=[[0,0],[10,0]], samples=[[0,0,1],[2,0,3],[8,0,1],[10,0,1]];
 const next=I.lloyd(points,samples,1);assert.deepEqual(next,[[1.5,0],[9,0]]);assert.deepEqual(points,[[0,0],[10,0]]);
 function energy(p){return samples.reduce((sum,s)=>sum+s[2]*Math.min(...p.map(q=>(q[0]-s[0])**2+(q[1]-s[1])**2)),0);}
 assert.ok(energy(next)<energy(points));assert.ok(energy(I.lloyd(points,samples,5))<=energy(next));
 assert.deepEqual(I.lloyd([[50,50]],[],3),[[50,50]],'empty cells remain finite');
});

test('chamfer distances respect ink, enclosed counters, and disconnected strokes',()=>{
 const w=30,h=30,a=new Float32Array(w*h);for(let y=3;y<27;y++)for(let x=3;x<27;x++)a[y*w+x]=1;
 for(let y=11;y<19;y++)for(let x=11;x<19;x++)a[y*w+x]=0;
 const d=I.distance(a,w,h);assert.equal(d[15*w+15],0);assert.equal(d[3*w+10],1);assert.ok(d[7*w+7]>3);assert.equal(d[1*w+1],0);
 assert.ok([...d].every(Number.isFinite));
});

test('three implicit surface families are periodic, continuous, and distinct',()=>{
 const values=[];for(const mode of ['gyroid','diamond','primitive']){const f=(x,y,z)=>I.implicit(x,y,z,mode);const v=f(.3,.8,1.3);values.push(v);assert.ok(Math.abs(v-f(.3+Math.PI*2,.8,1.3))<1e-12);assert.ok(Math.abs(v-f(.300001,.8,1.3))<.00001);assert.ok(Number.isFinite(f(-1e3,1e3,0)));}assert.equal(new Set(values).size,3);
});

test('refracted rays are normalized and obey Snell at normal and oblique incidence',()=>{
 const normal=I.refract(0,0,1.5);assert.ok(normal[0]===0&&normal[1]===0&&normal[2]===-1);
 for(const eta of [1.05,1.45,1.8])for(const slope of [.2,1,3]){
  const ray=I.refract(slope,0,eta),n=[slope/Math.hypot(slope,1),0,1/Math.hypot(slope,1)];
  assert.ok(Math.abs(Math.hypot(...ray)-1)<1e-12);
  const cosT=-(ray[0]*n[0]+ray[2]*n[2]);
  assert.ok(Math.abs(Math.sqrt(1-cosT*cosT)-n[0]/eta)<1e-12);
 }
});

test('glyph-local settings never average opposing batches and sanitize invalid data',()=>{
 const left={surface:{gyroidMode:'diamond',gyroidCell:12}},right={surface:{gyroidMode:'primitive',gyroidCell:60}};
 assert.equal(I.settings('gyroidSculpture',left,{}).gyroidCell,12);assert.equal(I.settings('gyroidSculpture',right,{}).gyroidCell,60);
 const invalid=I.settings('gyroidSculpture',{surface:{gyroidMode:'unknown',gyroidCell:Infinity}},{});assert.equal(invalid.gyroidMode,'gyroid');assert.equal(invalid.gyroidCell,10);
 assert.equal(I.settings('chromaticSwarm',{surface:{swarmPlates:2.8}},{}).swarmPlates,3);
});

test('operator short keys remain unique for lossless share and project decoding',()=>{
 const definitions=[...html.matchAll(/\w+: \{ id: '(\w+)', short: '(\w+)'/g)];assert.equal(definitions.length,116);assert.equal(new Set(definitions.map(m=>m[2])).size,116);
});

test('new operators integrate independent source/effect mixing, per-glyph profiles and export',()=>{
 for(const id of api.ids){
  for(const suffix of ['Opacity','SourceOpacity','Blend','SourceMode','Color'])assert.ok(html.includes(`${id}: '${id+suffix}'`),id+' '+suffix);
  assert.ok(html.includes(`${id}: fieldMaterialRenderer('${id}')`));
  assert.ok(html.includes(`${id}: surfaceOperatorStrength(m, '${id}')`));
  for(const [key,value] of Object.entries(api.schemas[id].defaults)){
   assert.ok(html.includes(`${key}: deform.${key}`),key+' per-glyph');assert.ok(html.includes(`${key}: params.${key}`),key+' SVG metadata');
   const c=key[0].toUpperCase()+key.slice(1);assert.ok(html.includes('id="p'+c+'"'));
   assert.ok(html.includes("'"+key+"'"),key+' batch registration');
  }
 }
 assert.ok(html.includes('version: 92'));assert.ok(html.includes("a: 'td', v: 92"));assert.ok(html.includes('data.version > 92'));
});

test('seeded raster cache is bounded and clearable',()=>{
 api.clearCache();assert.deepEqual(api.cacheStats(),{entries:0,bytes:0,maxBytes:32*1024*1024});
 const source=fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8');
 assert.ok(source.includes('while(cacheBytes+bytes>MAX_BYTES&&cache.size)'));new vm.Script(source);
});
