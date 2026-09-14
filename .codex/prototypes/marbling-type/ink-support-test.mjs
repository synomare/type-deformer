import assert from 'node:assert/strict';
import {marblingInkSupport} from './ink-support.mjs';
const rect=(x0,y0,x1,y1)=>({points:[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}]});
const close=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
const source=[rect(-8,-6,8,6),{points:rect(-2,-2,2,2).points.reverse()}],sites=[{x:-4,y:0},{x:4,y:0}];
const profile=marblingInkSupport(source,sites),snapshot=JSON.stringify(source);
// Independent closed-form integrals of the left/right rectangles, minus half
// of the hole. Integrate around each site, rather than reusing polygon code.
const integral=(lo,hi,c,p)=>(Math.pow(hi-c,p+1)-Math.pow(lo-c,p+1))/(p+1);
for(let i=0;i<2;i++){
  const p=profile[i],cx=sites[i].x,outer=i?[0,8]:[-8,0],hole=i?[0,2]:[-2,0];
  const area=8*12-2*4;
  close(p.area,area);close(p.covariance[0],(12*integral(...outer,cx,2)-4*integral(...hole,cx,2))/area);
  close(p.covariance[1],0);close(p.covariance[2],(8*integral(-6,6,0,2)-2*integral(-2,2,0,2))/area);
}
close(profile.reduce((s,p)=>s+p.area,0),16*12-16);
// Winding, density, translation and rigid rotation do not change ink support.
const reverse=marblingInkSupport(source.map(r=>({points:[...r.points].reverse()})),sites);
const split=marblingInkSupport(source.map(r=>({points:r.points.flatMap((a,i)=>{const b=r.points[(i+1)%r.points.length];return[a,{x:(a.x+b.x)/2,y:(a.y+b.y)/2}];})})),sites);
for(let i=0;i<2;i++)for(const other of[reverse[i],split[i]]){
  close(other.area,profile[i].area);other.covariance.forEach((v,k)=>close(v,profile[i].covariance[k]));close(other.radius,profile[i].radius);
}
for(const angle of[0,.31,Math.PI/2])for(const scale of[.2,1,4]){
  const co=Math.cos(angle),si=Math.sin(angle),map=p=>({x:10000+scale*(co*p.x-si*p.y),y:-7500+scale*(si*p.x+co*p.y)});
  const actual=marblingInkSupport(source.map(r=>({points:r.points.map(map)})),sites.map(map));
  for(let i=0;i<2;i++){
    const[xx,xy,yy]=profile[i].covariance;
    const expected=[co*co*xx-2*co*si*xy+si*si*yy,co*si*(xx-yy)+(co*co-si*si)*xy,si*si*xx+2*co*si*xy+co*co*yy];
    actual[i].covariance.forEach((v,k)=>close(v,expected[k]*scale*scale,2e-8));
    close(actual[i].area,profile[i].area*scale*scale,2e-8);close(actual[i].radius,profile[i].radius*scale,1e-8);
  }
}
// A shrinking counter does not shrink the surrounding ink footprint to zero.
for(const hole of[.001,.1,1]){
  const body=[rect(-20,-30,20,30),{points:rect(-hole,-hole,hole,hole).points.reverse()}];
  const p=marblingInkSupport(body,[{x:0,y:0},{x:0,y:22}]);
  assert.ok(p[0].radius>20);assert.ok(p[1].radius>10);
}
assert.equal(JSON.stringify(source),snapshot);
console.log(JSON.stringify({status:'pass',checks:'exact rectangle-minus-hole moments; partition area; reversed winding; edge subdivision; nine rigid/scale covariance cases; tiny counter retains ink footprint; immutable'}));
