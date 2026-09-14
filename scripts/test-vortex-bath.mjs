import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(here,'../vortex-bath-operator.js'),'utf8'),ctx);
const api=ctx.TypeDeformerVortexBath,I=api.internals,defaults=api.schemas.vortexBath.defaults;
const maxDiff=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
const field=(n,fn)=>Float64Array.from({length:n*n},(_,i)=>fn(i%n,Math.floor(i/n)));
function mask(w,h,predicate){return {w,h,scale:1,alpha:Float32Array.from({length:w*h},(_,i)=>predicate(i%w,Math.floor(i/w))?1:0)};}
function dft(a,n,kx,ky){let re=0,im=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const phase=-2*Math.PI*(kx*x+ky*y)/n;re+=a[y*n+x]*Math.cos(phase);im+=a[y*n+x]*Math.sin(phase);}return [re,im];}
test('fluid Fourier transform agrees with a direct DFT and returns its original field',()=>{
 const n=8,a=field(n,(x,y)=>Math.sin(x*1.3+y*.71)+.1*x),re=Float64Array.from(a),im=new Float64Array(n*n);I.fft2(re,im,n,false);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const expected=dft(a,n,x,y);assert.ok(Math.abs(re[y*n+x]-expected[0])<3e-13);assert.ok(Math.abs(im[y*n+x]-expected[1])<3e-13);}I.fft2(re,im,n,true);assert.ok(maxDiff(re,a)<1e-14);assert.ok(Math.max(...im.map(Math.abs))<1e-14);
});
test('Helmholtz projection removes a pure gradient and preserves uniform translation',()=>{
 const n=16,u=field(n,(x,y)=>2*Math.cos(2*Math.PI*(2*x+3*y)/n)+1.7),v=field(n,(x,y)=>3*Math.cos(2*Math.PI*(2*x+3*y)/n)-.8);I.project(u,v,n,0,1);assert.ok(maxDiff(u,new Float64Array(n*n).fill(1.7))<2e-14);assert.ok(maxDiff(v,new Float64Array(n*n).fill(-.8))<2e-14);
});
test('solenoidal plane wave decays by the analytic viscous exponential, without artificial divergence',()=>{
 const n=16,nu=.71,dt=.43,kx=2,ky=3,phase=(x,y)=>Math.cos(2*Math.PI*(kx*x+ky*y)/n),u=field(n,(x,y)=>ky*phase(x,y)),v=field(n,(x,y)=>-kx*phase(x,y)),decay=Math.exp(-nu*dt*(2*Math.PI/n)**2*(kx*kx+ky*ky)),expectedU=Float64Array.from(u,a=>a*decay),expectedV=Float64Array.from(v,a=>a*decay);I.project(u,v,n,nu,dt);assert.ok(maxDiff(u,expectedU)<2e-14);assert.ok(maxDiff(v,expectedV)<2e-14);
 const a=field(n,(x,y)=>Math.sin(x*1.13-y*.32)),b=field(n,(x,y)=>Math.cos(x*.35+y*1.21));I.project(a,b,n,.2,.1);let numerator=0,denominator=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const kx=x<n/2?x:x-n,ky=y<n/2?y:y-n,A=dft(a,n,kx,ky),B=dft(b,n,kx,ky);numerator+=(kx*A[0]+ky*B[0])**2+(kx*A[1]+ky*B[1])**2;denominator+=A[0]**2+A[1]**2+B[0]**2+B[1]**2;}assert.ok(Math.sqrt(numerator/denominator)<2e-13);
});
test('advection handles exact periodic integer translation and a zero velocity identity',()=>{
 const n=16,a=field(n,(x,y)=>(x+2*y)%7/7),u=new Float64Array(n*n).fill(1),v=new Float64Array(n*n);for(const corrected of [false,true]){const moved=I.advect(a,u,v,n,1,corrected),expected=field(n,(x,y)=>a[y*n+(x+n-1)%n]);assert.ok(maxDiff(moved,expected)<1e-14);assert.ok(maxDiff(I.advect(a,v,v,n,.37,corrected),a)<1e-14);}
});
test('corrected dye transport preserves constants and prevents new extrema in variable flow',()=>{
 const n=16,u=field(n,(x,y)=>2.1*Math.sin(y*.5)),v=field(n,(x,y)=>1.8*Math.cos(x*.4)),a=field(n,(x,y)=>((x*13+y*7)%19)/18);for(const dt of [.1,.9,2]){const one=I.advect(new Float64Array(n*n).fill(.37),u,v,n,dt,true);assert.ok(maxDiff(one,new Float64Array(n*n).fill(.37))<2e-15);const b=I.advect(a,u,v,n,dt,true);assert.ok(Math.min(...b)>=0);assert.ok(Math.max(...b)<=1);assert.ok(b.every(Number.isFinite));}
});
test('glyph quadrature retains small disjoint islands and does not create dye outside its support',()=>{
 const s=mask(32,34,(x,y)=>(x>6&&x<24&&y>12&&y<30)||(x===15&&y===5)),d=I.makeDomain(s,128);assert.ok(d.dye.reduce((a,b)=>a+b,0)>0);let topMass=0;for(let y=0;y<d.n;y++)for(let x=0;x<d.n;x++)if(d.top+(y+.5)*d.step<9)topMass+=d.dye[y*d.n+x];assert.ok(topMass>0);assert.equal(I.makeDomain(mask(10,10,()=>false),128),null);
});
test('the evolving solver is reproducible, bounded and responsive to the actual glyph and drive',()=>{
 const s=mask(36,40,(x,y)=>x>7&&x<28&&y>8&&y<32&&!(x>14&&x<23&&y>13&&y<23)),p={...defaults,vortexTime:.035},a=I.simulate(s,p,17),b=I.simulate(s,p,17);assert.equal(maxDiff(a.dye,b.dye),0);assert.ok(Math.min(...a.dye)>=0&&Math.max(...a.dye)<=1);assert.ok(a.stats.relativeDivergence<1e-12);assert.ok(a.stats.massRatio>.85&&a.stats.massRatio<1.1);assert.equal(a.stats.edgeMassRatio,0);const c=I.simulate(s,{...p,vortexMode:'lift'},17),d=I.simulate(s,p,44);assert.ok(maxDiff(a.dye,c.dye)>.01);assert.ok(maxDiff(a.dye,d.dye)>.001);assert.equal(I.simulate(mask(5,5,()=>false),p,17),null);
});

test('Evolving fluid body has every host control, shared glyph renderer and output path',()=>{const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),field=fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8');assert.deepEqual(Array.from(api.ids),['vortexBath']);assert.ok(html.includes('<script src="vortex-bath-operator.js"></script>'));assert.ok(field.includes('Object.assign(renderers,vortexBath.renderers)'));assert.ok(html.includes("fieldMaterialRenderer('vortexBath')"));assert.ok(html.includes("fieldMaterialPad('vortexBath')"));for(const k of Object.keys(api.schemas.vortexBath.defaults))assert.ok(html.includes('id="p'+k[0].toUpperCase()+k.slice(1)+'"'));});
