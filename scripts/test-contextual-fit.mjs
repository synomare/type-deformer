import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const realm = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../contextual-fit.js', import.meta.url), 'utf8'), realm);
const api = realm.TypeDeformerContextualFit;
const plain = value => JSON.parse(JSON.stringify(value));
const rect = (x, y, w, h) => ({ points: [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}] });
const scene = (right = rect(120,0,70,100), p = {}) => [
  {id:'left',line:0,rings:[rect(0,0,90,100),rect(20,20,45,60)],settings:p},
  {id:'right',line:0,rings:[right],settings:p}
];
test('pressure zero is exact identity without mutating the source', () => {
  const source=scene(undefined,{pressure:0}), before=JSON.stringify(source);
  const result=api.transport(source,{em:100});
  assert.deepEqual(plain(result.glyphs.map(g=>g.rings)),plain(source.map(g=>g.rings)));
  assert.equal(JSON.stringify(source),before);
});
test('changing only the neighbour changes the same glyph outline', () => {
  const a=api.transport(scene(),{em:100});
  const b=api.transport(scene({points:[{x:120,y:0},{x:190,y:0},{x:190,y:100},{x:150,y:100}]}),{em:100});
  assert.notDeepEqual(plain(a.glyphs[0].rings),plain(b.glyphs[0].rings));
  assert.ok(a.contacts>0 && b.contacts>0);
});
test('counter width and the inter-letter white channel are independent constraints', () => {
  const source=scene(undefined,{pressure:1,channel:.1,counter:1,follow:1});
  const out=api.transport(source,{em:100});
  const a=api.intervals(out.glyphs[0].rings,50),b=api.intervals(out.glyphs[1].rings,50);
  assert.ok(Math.abs((a[2]-a[1])-45)<1e-5);
  assert.ok(b[0]-a[a.length-1]>=10-1e-5);
  assert.equal(out.glyphs[0].rings.length,2);
});
test('monotone slice transport does not fold at extreme pressure', () => {
  for(const pressure of [.01,.5,1,2,3]) for(const counter of [0,.5,1]){
    const out=api.transport(scene(undefined,{pressure,channel:.5,counter,follow:2}),{em:100});
    for(const g of out.glyphs) for(const r of g.rings) for(const p of r.points) assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
    const h=api.intervals(out.glyphs[0].rings,50);
    assert.equal(h.length,4); for(let i=1;i<h.length;i++)assert.ok(h[i]>h[i-1]);
  }
});
test('inactive neighbours are immutable and distant words do not interact', () => {
  const source=scene();source[1].active=false;
  const out=api.transport(source,{em:100});
  assert.deepEqual(plain(out.glyphs[1].rings),source[1].rings);
  const far=scene(rect(900,0,70,100));
  assert.deepEqual(plain(api.transport(far,{em:100}).glyphs.map(g=>g.rings)),far.map(g=>g.rings));
});
test('vertical contact responds to a different neighbouring row', () => {
  const source=scene(undefined,{axis:'vertical',baseline:false});
  source[1].rings=[rect(0,130,90,100)];source[1].line=1;
  const out=api.transport(source,{em:100});
  assert.ok(out.contacts>0);assert.notDeepEqual(plain(out.glyphs[0].rings),source[0].rings);
});
test('bounded invalid inputs fail explicitly, never partially drop glyphs', () => {
  assert.throws(()=>api.transport(Array.from({length:97},()=>scene()[0])),/96/);
  assert.throws(()=>api.transport(scene(),{maxPoints:3}),/輪郭量/);
  assert.throws(()=>api.transport([{rings:[{points:[{x:NaN,y:0}]}]}]),/Invalid/);
});
test('isotonic constraints keep exact anchors and reject infeasible ones',()=>{
  assert.deepEqual(plain(api.project([0,9,8,30],[5,3,5],[true,false,false,true])),[0,7,10,30]);
  assert.equal(api.project([0,4],[5],[true,true]),null);
});
test('baseline anchors cannot steal the white channel to restore their position',()=>{
  const source=[{rings:[rect(0,0,100,100)],baseline:100,settings:{axis:'vertical',channel:.5,baseline:true}},
    {rings:[rect(0,130,100,100)],baseline:230,settings:{axis:'vertical',channel:.5,baseline:true}}];
  const out=api.transport(source,{em:100});
  const a=api.intervals(out.glyphs[0].rings,50,true),b=api.intervals(out.glyphs[1].rings,50,true);
  assert.ok(Math.abs(a.at(-1)-100)<1e-8);assert.ok(Math.abs(b.at(-1)-230)<1e-8);
  assert.ok(b[0]-a.at(-1)>=50-1e-8);
  const map=api.sliceMap([0,20,40,100],-10,110,api.settings(),100,70);
  assert.equal(api.mapAt(map,70),70);
});
