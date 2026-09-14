import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
vm.runInThisContext(fs.readFileSync(new URL('../density-recast-operator.js',import.meta.url),'utf8'));
const api=globalThis.TypeDeformerDensityRecast,I=api.internals;
function near(a,b,tol=1e-10){assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);}
function dist(n,fn){return I.distribution(n,Float64Array.from({length:(n+1)**2},(_,i)=>fn(i%(n+1)/n,Math.floor(i/(n+1))/n)));}
function mask(w,h,fn){return {w,h,scale:1,alpha:Float32Array.from({length:w*h},(_,i)=>fn(i%w,Math.floor(i/w))?1:0)};}
function invert(p,x,y){return I.inverseComposite(p,x,y,new Float64Array(7),new Float64Array(6),new Float64Array(6));}
test('Bilinear densities have analytically correct marginal and conditional integrals and inverses',()=>{
 const d=dist(32,(x,y)=>2+x*y);near(d.total,2.25);for(let i=0;i<=40;i++){const x=i/40,y=((i*17)%41)/40,Fx=(2*x+x*x/4)/2.25,Fy=(2*y+x*y*y/2)/(2+x/2);near(I.cdfX(d,x),Fx);near(I.cdfY(d,x,y),Fy);near(I.inverseX(d,Fx),x);near(I.inverseY(d,x,Fy),y);}
 assert.throws(()=>dist(4,()=>0),/positive/);assert.throws(()=>dist(4,()=>NaN),/positive/);
});
test('A separable source produces the known independent quadratic transport',()=>{
 const n=96,s=dist(n,(x,y)=>(1+x)*(1+2*y)),t=dist(n,()=>1),m=I.makeMesh(s,t,1,n);for(let i=0;i<=32;i++){const x=i/32,y=((i*13)%33)/32,q=I.forward(m,x,y);near(q.x,(x+x*x/2)/1.5,1e-12);near(q.y,(y+y*y)/2,1e-12);const p=I.inverse(m,q.x,q.y);near(p.x,x);near(p.y,y);}
 const q=I.forward(m,.413,.627);near(q.x,(.413+.413**2/2)/1.5,1e-5);near(q.y,(.627+.627**2)/2,1.4e-5);
});
test('Every triangular cell and identity interpolation has a positive Jacobian and an exact inverse',()=>{
 const s=dist(64,(x,y)=>.08+Math.exp(-25*((x-.27)**2+(y-.61)**2))),t=dist(64,(x,y)=>.08+Math.exp(-35*((x-.71)**2+(y-.29)**2)));
 for(const amount of [0,.25,.7,1]){const m=I.makeMesh(s,t,amount,64);assert.ok(m.minDet>0);for(let i=0;i<250;i++){const x=(i*97%251)/251,y=(i*157%251)/251,q=I.forward(m,x,y),p=I.inverse(m,q.x,q.y),fast=I.inverseFast(m,q.x,q.y,new Float64Array(6));near(p.x,x,2e-12);near(p.y,y,2e-12);near(fast[0],x,2e-12);near(fast[1],y,2e-12);assert.ok(fast[5]>=m.minDet-1e-10);if(amount===0){near(q.x,x);near(q.y,y);}}}
});
test('A nonseparable target matches transport CDF constraints with controlled mesh approximation',()=>{
 const s=dist(96,(x,y)=>(1+x)*(1+2*y)),t=dist(96,(x,y)=>2+x*y),m=I.makeMesh(s,t,1,96);for(let i=1;i<35;i++){const x=i/36,y=(i*7%35+.5)/36,q=I.forward(m,x,y),sourceX=(x+x*x/2)/1.5,sourceY=(y+y*y)/2,targetX=(2*q.x+q.x*q.x/4)/2.25,targetY=(2*q.y+q.x*q.y*q.y/2)/(2+q.x/2);near(targetX,sourceX,2e-5);near(targetY,sourceY,4e-5);}
});
test('Alternating transports remain bijective at all form and control endpoints',()=>{
 const s=mask(62,70,(x,y)=>x>5&&x<55&&y>6&&y<65&&!(x>21&&x<40&&y>20&&y<44));
 for(const recastForm of ['disk','annulus','channel'])for(const recastAmount of [0,1])for(const recastAir of [.08,.65])for(const recastDrift of [-.5,.5]){const p=I.prepare(s,{...api.schemas.densityRecast.defaults,recastForm,recastAmount,recastAir,recastWidth:recastAir===.08?.45:1.4,recastDrift},48);assert.ok(p.mesh.minDet*p.upper.minDet>0);assert.ok(Number.isFinite(p.middleMassRatio));for(let i=0;i<31;i++){const x=(i*17%31+.21)/32,y=(i*23%31+.37)/32,q=I.forwardComposite(p,x,y),z=invert(p,q.x,q.y);near(z[0],x,3e-12);near(z[1],y,3e-12);near((z[2]*z[5]-z[3]*z[4])*z[6],1,1e-10);if(recastAmount===0){near(q.x,x);near(q.y,y);}}}
 assert.equal(I.prepare(mask(5,5,()=>false),api.schemas.densityRecast.defaults),null);
});
test('Composite inverse differential agrees with finite differences, preserving orientation',()=>{
 const s=mask(61,67,(x,y)=>x>7&&x<54&&y>5&&y<62&&!(x>22&&x<37&&y>17&&y<44)),p=I.prepare(s,{...api.schemas.densityRecast.defaults,recastAmount:.81,recastForm:'channel'},64),eps=1e-7;
 for(const [x,y]of [[.3213,.4617],[.6831,.4123],[.5109,.7171]]){const z=invert(p,x,y),xp=invert(p,x+eps,y),xm=invert(p,x-eps,y),yp=invert(p,x,y+eps),ym=invert(p,x,y-eps);near((xp[0]-xm[0])/(2*eps),z[2],3e-7);near((yp[0]-ym[0])/(2*eps),z[3],3e-7);near((xp[1]-xm[1])/(2*eps),z[4],3e-7);near((yp[1]-ym[1])/(2*eps),z[5],3e-7);assert.ok(z[6]>0);}
});

test('density transport body has every host control, shared glyph renderer and output path',()=>{const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),field=fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8');assert.deepEqual(Array.from(api.ids),['densityRecast']);assert.ok(html.includes('<script src="density-recast-operator.js"></script>'));assert.ok(field.includes('Object.assign(renderers,densityRecast.renderers)'));assert.ok(html.includes("fieldMaterialRenderer('densityRecast')"));assert.ok(html.includes("fieldMaterialPad('densityRecast')"));for(const k of Object.keys(api.schemas.densityRecast.defaults))assert.ok(html.includes('id="p'+k[0].toUpperCase()+k.slice(1)+'"'));});
