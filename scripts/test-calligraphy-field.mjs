import assert from 'node:assert/strict';
import * as Field from '../.codex/prototypes/calligraphic-field/core.mjs';
const ring = (r, count, ox = 0, oy = 0, reverse = false) => ({points: Array.from({length:count}, (_,i) => {
  const a = (reverse ? -1 : 1) * i * Math.PI * 2 / count;return {x:ox+r*Math.cos(a),y:oy+r*Math.sin(a)};
})});
const contours = [ring(23,101),ring(7,31,2,0,true),ring(3,12,40,3)], original=JSON.stringify(contours);
const query = Field.createCalligraphyContourQuery(contours, 3);
function brute(x,y) {let min=Infinity;for(const ring of contours)for(let i=0;i<ring.points.length;i++){
  const a=ring.points[i],b=ring.points[(i+1)%ring.points.length],dx=b.x-a.x,dy=b.y-a.y;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));
  min=Math.min(min,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));
}return min;}
let state=17;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);
function winding(x,y) {let count=0;for(const ring of contours)for(let i=0;i<ring.points.length;i++){
  const a=ring.points[i],b=ring.points[(i+1)%ring.points.length];
  const cross=(b.x-a.x)*(y-a.y)-(x-a.x)*(b.y-a.y);
  if(a.y<=y&&b.y>y&&cross>0)count++;if(b.y<=y&&a.y>y&&cross<0)count--;
}return count!==0;}
for(let i=0;i<1000;i++) {const x=random()*100-40,y=random()*80-40,p=query.query(x,y);
  assert.ok(Math.abs(p.distance-brute(x,y))<1e-10);assert.ok(Math.abs(Math.hypot(p.nx,p.ny)-1)<1e-10);
  assert.equal(query.contains(x,y),winding(x,y),'BVH winding agrees with independent crossing oracle');
}
assert.equal(query.contains(2,0),false);assert.equal(query.contains(16,0),true);assert.equal(query.contains(40,3),true);
assert.throws(()=>query.contains(NaN,0));assert.equal(Field.createCalligraphyContourQuery([]).contains(0,0),false);
assert.equal(JSON.stringify(contours),original);
const moved=contours.map(r=>({points:r.points.map(p=>({x:p.x*3+12,y:p.y*3-8}))}));
const transformed=Field.createCalligraphyContourQuery(moved,9);
for(const [x,y] of [[-35,17],[18,-8],[8,2],[30,14]]){
  const a=query.query(x,y),b=transformed.query(x*3+12,y*3-8);
  assert.ok(Math.abs(b.distance-a.distance*3)<1e-9);assert.ok(Math.abs(a.nx-b.nx)<1e-9);assert.ok(Math.abs(a.ny-b.ny)<1e-9);
}
const outer=Field.createCalligraphyContourQuery([ring(20,200)],3);
const hole=Field.createCalligraphyContourQuery([ring(20,200,0,0,true)],3);
assert.ok(outer.query(25,0).nx>.999);assert.ok(hole.query(15,0).nx<-.999);
assert.equal(Field.createCalligraphyContourQuery([]).query(0,0).distance,Infinity);
assert.equal(Field.createCalligraphyContourQuery([{points:[{x:1,y:1},{x:1,y:1},{x:1,y:1}]}]).edgeCount,0);
assert.throws(()=>Field.createCalligraphyContourQuery([{points:[{x:NaN,y:0},{x:1,y:0},{x:0,y:1}]}]));
assert.throws(()=>Field.createCalligraphyContourQuery([],NaN));assert.throws(()=>query.query(Infinity,0));
assert.throws(()=>Field.buildCalligraphyContourField([],new Uint8Array(1),3,3,1,2));

console.log("Calligraphy field: 1000 brute-force distance comparisons, unit normals, hole orientation, scale/translation, ownership and invalid/empty inputs passed.");
