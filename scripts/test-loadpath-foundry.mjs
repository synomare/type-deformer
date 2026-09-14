import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const scope={};vm.createContext(scope);vm.runInContext(fs.readFileSync(new URL('../loadpath-foundry-operator.js',import.meta.url),'utf8'),scope);
const api=scope.TypeDeformerLoadpathFoundry,I=api.internals,defaults=api.schemas.loadpathFoundry.defaults;
function near(a,b,t=1e-8){assert.ok(Math.abs(a-b)<=t,`${a} != ${b} (${t})`);}
function mask(w,h,fn){return {w,h,scale:1,alpha:Float32Array.from({length:w*h},(_,i)=>fn(i%w,Math.floor(i/w))?1:0)};}
function energy(k,u){let r=0;for(let i=0;i<u.length;i++)for(let j=0;j<u.length;j++)r+=u[i]*k[i*u.length+j]*u[j];return r;}
function denseSolve(sys,f){const n=sys.n,A=Array.from({length:n},()=>new Float64Array(n+1));for(let i=0;i<n;i++){for(let p=sys.ptr[i];p<sys.ptr[i+1];p++)A[i][sys.col[p]]=sys.values[p];A[i][n]=f[i];}for(let k=0;k<n;k++){let p=k;for(let i=k+1;i<n;i++)if(Math.abs(A[i][k])>Math.abs(A[p][k]))p=i;[A[p],A[k]]=[A[k],A[p]];assert.ok(Math.abs(A[k][k])>1e-14,'nonsingular reference');for(let i=k+1;i<n;i++){let f=A[i][k]/A[k][k];for(let j=k;j<=n;j++)A[i][j]-=f*A[k][j];}}const x=new Float64Array(n);for(let i=n-1;i>=0;i--){let r=A[i][n];for(let j=i+1;j<n;j++)r-=A[i][j]*x[j];x[i]=r/A[i][i];}return x;}
test('Gauss quad has analytic affine energies, symmetry and three rigid null modes',()=>{
 const nu=.3,k=I.elementStiffness(nu);for(let i=0;i<8;i++)for(let j=0;j<8;j++)near(k[i*8+j],k[j*8+i],1e-14);
 for(const u of [[1,0,1,0,1,0,1,0],[0,1,0,1,0,1,0,1],[0,0,0,1,-1,1,-1,0]])near(energy(k,u),0,2e-15);
 near(energy(k,[0,0,1,0,1,0,0,0]),1/(1-nu*nu),1e-12);
 near(energy(k,[0,0,0,0,1,0,1,0]),1/(2*(1+nu)),1e-12);
 near(energy(k,[0,0,1,0,1,1,0,1]),2/(1-nu),1e-12);
});
test('Sparse PCG agrees with independent pivoted dense solves for all support modes',()=>{
 const m=I.meshFromMask(mask(15,10,(x,y)=>x>1&&x<13&&y>1&&y<8),8),ke=I.elementStiffness(.3);
 for(const mode of ['bridge','cantilever','shear']){const bc=I.boundaryConditions(m,mode,23),sys=I.sparseSystem(m,bc,ke),rho=Float64Array.from(m.cells,(_,i)=>.28+.65*(i%7)/7);I.assemble(sys,rho,ke);const ref=denseSolve(sys,bc.f),p=I.pcg(sys,bc.f,null,1e-10,1200);assert.ok(p.residual<1e-9);let scale=Math.max(1,...ref.map(Math.abs));for(let i=0;i<ref.length;i++)near(p.x[i],ref[i],scale*2e-8);for(let i=0;i<bc.fixed.length;i++)if(bc.fixed[i])near(p.x[i],0,1e-12);}
});
test('SIMP compliance sensitivity matches central differences of solved force work',()=>{
 const m=I.meshFromMask(mask(12,9,(x,y)=>x>0&&x<11&&y>0&&y<8),7),ke=I.elementStiffness(.3),bc=I.boundaryConditions(m,'cantilever',-17),sys=I.sparseSystem(m,bc,ke),rho=new Float64Array(m.cells.length).fill(.55),e=Math.floor(rho.length/2);
 function solve(){I.assemble(sys,rho,ke);const u=denseSolve(sys,bc.f);return {u,c:u.reduce((s,v,i)=>s+v*bc.f[i],0)};}
 const base=solve(),dofs=m.cells[e].dofs,u=dofs.map(i=>base.u[i]),analytic=-3*rho[e]**2*.9999*energy(ke,u),eps=1e-5;rho[e]+=eps;const a=solve().c;rho[e]-=2*eps;const b=solve().c;near((a-b)/(2*eps),analytic,Math.max(1,Math.abs(analytic))*2e-6);
});
test('Optimality update preserves protected material, bounds, move limit and free volume',()=>{
 const n=70,x=Float64Array.from({length:n},(_,i)=>i%9===0?1:.44),dc=Float64Array.from({length:n},(_,i)=>-.02-(i*13%47)),passive=Uint8Array.from({length:n},(_,i)=>i%9===0?1:0),out=I.optimalityUpdate(x,dc,.44,.15,passive);let sum=0,free=0;for(let i=0;i<n;i++){if(passive[i])near(out[i],1);else{assert.ok(out[i]>=.001&&out[i]<=1);assert.ok(Math.abs(out[i]-x[i])<=.150000001);sum+=out[i];free++;}}near(sum/free,.44,1e-8);
});
test('Load-driven optimization lowers compliance, keeps volume and changes with supports',()=>{
 const s=mask(42,25,(x,y)=>x>2&&x<39&&y>2&&y<22),m=I.meshFromMask(s,22),p={...defaults,foundryEvolution:.55},results=[];
 for(const mode of ['bridge','cantilever','shear']){const r=I.optimize(m,{...p,foundryMode:mode},17);assert.ok(r.history.at(-1).compliance<r.history[0].compliance*.92,mode);assert.ok(r.history.every(h=>h.residual<5e-5),mode+' convergence');const fixed=r.passive.reduce((s,v)=>s+v,0),target=(fixed+(m.cells.length-fixed)*p.foundryMass)/m.cells.length;for(const h of r.history)near(h.mass,target,1e-8);r.passive.forEach((v,i)=>{if(v)near(r.density[i],1);});results.push(Array.from(r.density));}
 assert.notDeepEqual(results[0],results[1]);assert.notDeepEqual(results[1],results[2]);const repeat=I.optimize(m,p,17);assert.deepEqual(Array.from(repeat.density),results[0]);
});
test('Mask mesh retains counters, disconnected islands and bounded resolution; EDT matches brute force',()=>{
 const s=mask(90,80,(x,y)=>(x>8&&x<70&&y>8&&y<70&&!(x>25&&x<50&&y>25&&y<50))||(x>77&&x<82&&y>15&&y<20)),m=I.meshFromMask(s,30);assert.equal(m.components.length,2);assert.ok(m.cols<=32&&m.rows<=32);assert.ok(!m.cells.some(c=>{const x=m.ox+(c.x+.5)*m.step,y=m.oy+(c.y+.5)*m.step;return x>30&&x<45&&y>30&&y<45;}));const empty=I.meshFromMask(mask(5,6,()=>false),30);assert.equal(empty.cells.length,0);assert.equal(I.optimize(empty,defaults,17).density.length,0);
 const w=15,h=11,a=Float32Array.from({length:w*h},(_,i)=>((i*31+3)%13>2)?1:0),d=I.euclideanDistance(a,w,h);for(let i=0;i<a.length;i++){let best=Infinity;for(let j=0;j<a.length;j++)if(a[j]<=.5)best=Math.min(best,Math.hypot(i%w-j%w,Math.floor(i/w)-Math.floor(j/w)));near(d[i],best,2e-7);}
});

test('load-bearing glyph has complete host controls, shared bridge and export paths',()=>{const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),field=fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8');assert.deepEqual(Array.from(api.ids),['loadpathFoundry']);assert.ok(html.includes('<script src="loadpath-foundry-operator.js"></script>'));assert.ok(field.includes('Object.assign(renderers,loadpathFoundry.renderers)'));assert.ok(html.includes("fieldMaterialRenderer('loadpathFoundry')"));assert.ok(html.includes("fieldMaterialPad('loadpathFoundry')"));for(const k of Object.keys(defaults))assert.ok(html.includes('id="p'+k[0].toUpperCase()+k.slice(1)+'"'));});
