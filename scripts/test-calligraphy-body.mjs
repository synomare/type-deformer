import assert from 'node:assert/strict';
import * as Body from '../.codex/prototypes/calligraphic-field/body.mjs';
const ring = (rx,ry,n,cx=48,cy=48,reverse=false) => ({points:Array.from({length:n},(_,i)=>{
  const a=i/n*Math.PI*2*(reverse?-1:1);return {x:cx+rx*Math.cos(a),y:cy+ry*Math.sin(a)};
})});
const contours=[ring(23,34,101),ring(9,17,49,50,47,true),ring(3,3,15,80,12)];
const snapshot=JSON.stringify(contours),body=Body.prepareCalligraphyBody(contours);
const identity={a:1,b:0,c:0,d:1,e:0,f:0},rotation={a:0,b:1,c:-1,d:0,e:96,f:0};
const render=(tool,phase=0,extra={},matrix=identity,alpha=1)=>{
  const data=new Uint8ClampedArray(96*96*4);Body.rasterCalligraphyBody(body,{tool,fontSize:96,...extra},phase,matrix,96,96,data,alpha);return data;
};
const sums=[];
for(const tool of ['broad','brush','split','chisel']){
  const a=render(tool),b=render(tool,1),mid=render(tool,.31),rot=render(tool,0,{},rotation);
  assert.deepEqual(a,b,'Loop 0 = 1');assert.notDeepEqual(a,mid,'Motion changes geometry');
  for(let y=0;y<96;y++)for(let x=0;x<96;x++)assert.equal(a[(y*96+x)*4+3],rot[(x*96+95-y)*4+3],'90 degree instance preserves local body');
  sums.push(a.reduce((sum,v,i)=>sum+(i%4===3?v:0),0));
  const faded=render(tool,0,{},identity,.052);
  for(let i=3;i<a.length;i+=4)assert.ok(Math.abs(faded[i]-a[i]*.052)<=1,'Alpha-only fade');
  for(const [key,values] of Object.entries({expansion:[-120,260],contrast:[0,4],angle:[-180,180],pulse:[0,4],wetness:[0,1]}))
    for(const value of values)assert.ok(render(tool,.31,{[key]:value}) instanceof Uint8ClampedArray);
}
assert.equal(new Set(sums).size,4,'Four distinct writing tool bodies');assert.equal(JSON.stringify(contours),snapshot);
for(const matrix of [identity,rotation,{a:-1.3,b:.3,c:.4,d:.8,e:77,f:-19},{a:.2,b:-.5,c:2,d:3,e:-210,f:99}]){
  const inverse=Body.calligraphyInverseMatrix(matrix),sampler=Body.createCalligraphyBodySampler(body,{tool:'brush'},.3);
  for(let y=-10;y<120;y+=7)for(let x=-10;x<120;x+=7){
    const px=matrix.a*x+matrix.c*y+matrix.e,py=matrix.b*x+matrix.d*y+matrix.f;
    const bx=inverse.a*px+inverse.c*py+inverse.e,by=inverse.b*px+inverse.d*py+inverse.f;
    assert.ok(Math.hypot(bx-x,by-y)<1e-10);
    assert.ok(Math.abs(sampler.sample(x,y)-sampler.sample(bx,by))<1e-10,'Affine inverse preserves source coverage');
  }
  assert.ok(render('brush',.3,{},matrix).some(v=>v>0)||matrix.e===-210);
}
const empty=Body.prepareCalligraphyBody([]),target=new Uint8ClampedArray(96*96*4);
assert.equal(Body.rasterCalligraphyBody(empty,{},0,identity,96,96,target).pixels,0);
assert.equal(Body.rasterCalligraphyBody(body,{},0,{...identity,a:0,d:0},96,96,target).pixels,0);
assert.equal(Body.rasterCalligraphyBody(body,{},0,identity,96,96,target,0).pixels,0);
assert.equal(Body.calligraphyInverseMatrix({...identity,a:0,d:0}),null);
assert.throws(()=>Body.calligraphyInverseMatrix({...identity,a:NaN}));
assert.throws(()=>Body.rasterCalligraphyBody(body,{},0,identity,96,96,new Uint8Array(1)));
assert.throws(()=>Body.rasterCalligraphyBody(body,{},0,identity,96,96,target,NaN));
// Separate glyph alphas combine source-over; neither body is reassigned to its neighbour.
const first=render('broad',0,{},identity,.4),second=render('chisel',0,{angle:-65},identity,.3),combined=first.slice();
Body.rasterCalligraphyBody(body,{tool:'chisel',fontSize:96,angle:-65},0,identity,96,96,combined,.3);
for(let i=3;i<first.length;i+=4)assert.ok(Math.abs(combined[i]-(second[i]+first[i]*(1-second[i]/255)))<=1);
console.log('Calligraphy body: 4 nibs, exact 90-degree permutations, affine inverse coverage, loop/fade, 40 extrema, source-over overlap, empty/singular/invalid inputs passed (offline).');
