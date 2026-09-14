import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const c={};vm.createContext(c);vm.runInContext(fs.readFileSync(new URL('../excess-body-operators.js',import.meta.url),'utf8'),c);const A=c.TypeDeformerExcessBody,I=A.internals,near=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
test('Dirichlet cage reproduces independent harmonic polynomials and boundary values',()=>{
 for(const n of [13,29,45]){const f=(x,y)=>[.31+2*x-.7*y,x*x-y*y+.2*x];const sol=I.solveCage(n,f,[]);assert.ok(sol.residual<1e-6);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=f(x/(n-1),y/(n-1)),k=y*n+x;near(sol.x[k],v[0],2e-5);near(sol.y[k],v[1],2e-5);}}
});
test('Cage point constraints hold, preserve the maximum principle and alter the interior',()=>{
 const f=(x,y)=>[x,y],a=I.solveCage(31,f,[]),b=I.solveCage(31,f,[[.5,.5,0,0]]);near(b.x[15*31+15],0);near(b.y[15*31+15],0);assert.ok(b.x[15*31+14]<a.x[15*31+14]);for(const value of [...b.x,...b.y])assert.ok(value>=-1e-7&&value<=1+1e-7);assert.ok(b.residual<1e-6);
});
test('Single-pole complex mapping agrees with an independent complex quotient and bounds displacement',()=>{
 const q={x:7,y:9},pole={x:2,y:3,r:4},amount=.8,phase=20;const v=I.rationalPoint(q,[pole],amount,phase,1e6),x=5,y=6,theta=phase*Math.PI/180+.82,a=16*3.5*amount;near(v.x,7+a*(Math.cos(theta)*x+Math.sin(theta)*y)/(x*x+y*y));near(v.y,9+a*(Math.sin(theta)*x-Math.cos(theta)*y)/(x*x+y*y));
 const original=I.rationalPoint(q,[pole],0,phase,85);near(original.x,q.x);near(original.y,q.y);
 for(let j=0;j<30;j++){const p={x:2+10**(-j),y:3};const b=I.rationalPoint(p,[pole],1.5,180,85);assert.ok(Number.isFinite(b.x)&&Number.isFinite(b.y));assert.ok(Math.hypot(b.x-p.x,b.y-p.y)<=85+1e-9);}
});
test('Contour resampling preserves square perimeter, orientation and all rings',()=>{
 const outer={area:100,points:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}]},inner={area:-4,points:[{x:4,y:4},{x:4,y:6},{x:6,y:6},{x:6,y:4}]};const out=I.resample([outer,inner],1);assert.equal(out.length,2);assert.equal(out[0].points.length,40);assert.equal(out[1].area,-4);let area=0;const p=out[0].points;for(let j=0;j<p.length;j++){const a=p[j],b=p[(j+1)%p.length];near(Math.hypot(a.x-b.x,a.y-b.y),1);area+=a.x*b.y-b.x*a.y;}near(area/2,100);
});
test('Strangulation is identity at zero and keeps its selected axis fixed under compression',()=>{
 const b={cx:100,cy:100,w:200,h:200,sc:1},p={...A.schemas.strangulation.defaults,strangleAngle:0,strangleAmount:0};for(const q of [{x:20,y:20},{x:180,y:170}]){const a=I.stranglePoint(q,b,p);near(a.x,q.x);near(a.y,q.y);}p.strangleAmount=1;p.strangleBands=1;p.stranglePosition=.5;const a=I.stranglePoint({x:100,y:110},b,p);near(a.x,100);near(a.y,110);const left=I.stranglePoint({x:10,y:100},b,p),right=I.stranglePoint({x:190,y:100},b,p);assert.ok(left.x<right.x);assert.ok(right.x-left.x<60);
});
test('All eight bodies register complete state, metadata, controls and render paths',()=>{
 const h=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),f=fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8');assert.equal(A.ids.length,8);assert.ok(f.includes('Object.assign(renderers,excessBody.renderers)'));assert.ok(h.includes('TypeDeformerFieldMaterials.bodyBounds(scene.glyphs'));
 for(const id of A.ids){for(const suffix of ['Opacity','SourceOpacity','Blend','Color','SourceMode'])assert.ok(h.includes(`${id}: '${id+suffix}'`),id+suffix);assert.ok(h.includes(`${id}: fieldMaterialRenderer('${id}')`));assert.ok(h.includes(`${id}: surfaceOperatorStrength(m, '${id}')`));for(const k of Object.keys(A.schemas[id].defaults)){assert.ok(h.includes(`${k}: deform.${k}`));assert.ok(h.includes(`${k}: params.${k}`));assert.ok(h.includes(`id="p${k[0].toUpperCase()+k.slice(1)}"`));}}
});
