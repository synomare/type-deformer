import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
vm.runInThisContext(fs.readFileSync(new URL('../spinodal-alloy-operator.js',import.meta.url),'utf8'));
const api=globalThis.TypeDeformerSpinodalAlloy,I=api.internals;
function mask(w,h,fn=()=>true){return {w,h,scale:1,alpha:Float32Array.from({length:w*h},(_,i)=>fn(i%w,Math.floor(i/w))?1:0)};}
function graph(w,h,fn){return I.domainFromMask(mask(w,h,fn),1);}
function near(a,b,tol=1e-10){assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);}
function mat(sys){const n=sys.n,A=Array.from({length:n},()=>Array(n).fill(0));for(let i=0;i<n;i++){A[i][i]=sys.diagonal[i];for(let k=0;k<4;k++){let j=sys.neighbors[i*4+k];if(j>=0)A[i][j]-=sys.weights[i*4+k];}}return A;}
function mv(A,x){return Float64Array.from(A,row=>row.reduce((a,v,i)=>a+v*x[i],0));}
test('No-flux glyph graphs keep holes, dots, symmetry and component mass nullspaces',()=>{
 const d=graph(13,10,(x,y)=>x<9&&!(x>2&&x<6&&y>2&&y<7)||x===12&&y===1);
 assert.equal(d.parts.length,2);assert.equal(d.ids[4*d.cols+4],-1);
 for(const mode of ['duplex','wetting','drawn']){const sys=I.systemForDomain(d,mode),A=mat(sys),one=new Float64Array(sys.n).fill(1),lo=I.laplacian(sys,one,new Float64Array(sys.n));lo.forEach(v=>near(v,0));for(let i=0;i<sys.n;i++)for(let j=0;j<sys.n;j++)near(A[i][j],A[j][i]);const x=Float64Array.from({length:sys.n},(_,i)=>Math.sin(i)),lx=mv(A,x);assert.ok(x.reduce((a,v,i)=>a+v*lx[i],0)>0);}
});
test('Paired band factors and small-step CG solve an independently assembled polynomial matrix',()=>{
 for(const mode of ['duplex','drawn']){const sys=I.systemForDomain(graph(9,7,(x,y)=>!(x>2&&x<6&&y>1&&y<5)),mode),L=mat(sys),v=Float64Array.from({length:sys.n},(_,i)=>Math.sin(i*.29)+.1),lv=mv(L,v),llv=mv(L,lv);
  for(const dt of [2,.02]){const rhs=Float64Array.from(v,(a,i)=>a+4*dt*lv[i]+.66*dt*llv[i]),pair=I.factorPair(sys,dt,4,.66),sol=pair?I.solvePaired(sys,pair,rhs,dt,4,.66):I.solveImplicit(sys,rhs,new Float64Array(sys.n),dt,4,.66,1e-11);if(pair){near(pair.alpha+pair.beta,4*dt);near(pair.alpha*pair.beta,.66*dt);}assert.ok(sol.residual<1e-10);sol.x.forEach((a,i)=>near(a,v[i],3e-10));}
 }
});
test('Chemical potential is the energy derivative and conservative flux dissipates energy',()=>{
 const sys=I.systemForDomain(graph(10,8,(x,y)=>!(x===3&&y>1&&y<6)),'wetting'),u=Float64Array.from({length:sys.n},(_,i)=>.8*Math.sin(i*.51)),lu=I.laplacian(sys,u,new Float64Array(sys.n)),mu=Float64Array.from(u,(v,i)=>v*v*v-v+.66*lu[i]-sys.wall[i]);
 for(const i of [0,7,25,sys.n-1]){const a=Float64Array.from(u),b=Float64Array.from(u),eps=1e-6;a[i]+=eps;b[i]-=eps;near((I.energy(sys,a,.66)-I.energy(sys,b,.66))/(2*eps),mu[i],2e-8);}
 const lm=I.laplacian(sys,mu,new Float64Array(sys.n)),loss=-mu.reduce((a,v,i)=>a+v*lm[i],0);assert.ok(loss<0);near(lm.reduce((a,v)=>a+v,0),0,1e-10);
});
test('Linearized spinodal growth matches an analytic no-flux cosine mode',()=>{
 const n=31,k=3,mean=.12,eps=1e-6,sys=I.systemForDomain(graph(n,1),'duplex'),lambda=2-2*Math.cos(Math.PI*k/n),wave=Float64Array.from({length:n},(_,i)=>Math.cos(Math.PI*k*(i+.5)/n)),u=Float64Array.from(wave,v=>mean+eps*v),lu=I.laplacian(sys,u,new Float64Array(n)),g=Float64Array.from(u,v=>v*v*v-v),lg=I.laplacian(sys,g,new Float64Array(n));
 for(const dt of [.5,2]){const rhs=Float64Array.from(u,(v,i)=>v+dt*4*lu[i]-dt*lg[i]),v=I.solvePaired(sys,I.factorPair(sys,dt,4,.66),rhs,dt,4,.66).x,ratio=(1+dt*(5-3*mean*mean)*lambda)/(1+4*dt*lambda+.66*dt*lambda*lambda),measured=v.reduce((a,z,i)=>a+(z-mean)*wave[i],0)/(eps*wave.reduce((a,z)=>a+z*z,0));near(measured,ratio,2e-8);assert.ok(ratio>1);}
});
test('All three regimes reduce energy, conserve each component and reproduce the evolving phase',()=>{
 const d=graph(19,17,(x,y)=>x<16&&!(x>4&&x<9&&y>3&&y<12)||x===18&&y===2),hashes=[];
 for(const mode of ['duplex','wetting','drawn'])for(const mix of [.25,.52,.75]){const f=I.phaseField(d,mode,mix,1,17);assert.ok(f.maxResidual<2e-8);assert.ok(f.massError<1e-12);assert.ok(f.maxAbs<1.65);assert.ok(f.energies.at(-1)<f.energies[0]-.001);for(let i=1;i<f.energies.length;i++)assert.ok(f.energies[i]<=f.energies[i-1]+1e-7);f.values.forEach(v=>assert.ok(Number.isFinite(v)));if(mix===.52)hashes.push(f.values.reduce((a,v,i)=>a+v*Math.sin(i),0));}
 assert.equal(new Set(hashes.map(v=>v.toFixed(6))).size,3);
 const a=I.phaseField(d,'duplex',.52,.15,17),b=I.phaseField(d,'duplex',.52,.15,17);assert.deepEqual(a.values,b.values);assert.deepEqual(a.energies,b.energies);
});
test('Retained fields key exact domains, phase parameters and seed, while empty and tiny parts stay finite',()=>{
 api.clearCache();const d=graph(9,8),a=I.fieldForDomain(d,'duplex',.52,.05,17);assert.equal(I.fieldForDomain(d,'duplex',.52,.05,17),a);assert.equal(api.cacheStats().hits,1);
 for(const args of [[d,'wetting',.52,.05,17],[d,'duplex',.5,.05,17],[d,'duplex',.52,.06,17],[d,'duplex',.52,.05,18],[graph(9,8,(x,y)=>!(x===3&&y===3)),'duplex',.52,.05,17]])assert.notEqual(I.fieldForDomain(...args),a);
 assert.equal(api.cacheStats().entries,6);assert.ok(api.cacheStats().bytes<api.cacheStats().maxBytes);api.clearCache();assert.equal(api.cacheStats().bytes,0);
 assert.equal(I.phaseField(graph(3,3,()=>false),'duplex',.52,.05,17).nodes,0);const tiny=I.phaseField(graph(1,1),'wetting',.25,1,17);near(tiny.values[0],-.5);near(tiny.massError,0);
});

test('phase-separating body has every host control, shared glyph renderer and output path',()=>{const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),field=fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8');assert.deepEqual(Array.from(api.ids),['spinodalAlloy']);assert.ok(html.includes('<script src="spinodal-alloy-operator.js"></script>'));assert.ok(field.includes('Object.assign(renderers,spinodalAlloy.renderers)'));assert.ok(html.includes("fieldMaterialRenderer('spinodalAlloy')"));assert.ok(html.includes("fieldMaterialPad('spinodalAlloy')"));for(const k of Object.keys(api.schemas.spinodalAlloy.defaults))assert.ok(html.includes('id="p'+k[0].toUpperCase()+k.slice(1)+'"'));});
