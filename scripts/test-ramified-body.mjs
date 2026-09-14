import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const c={};vm.createContext(c);vm.runInContext(fs.readFileSync(new URL('../ramified-body-operators.js',import.meta.url),'utf8'),c);const A=c.TypeDeformerRamifiedBody,I=A.internals,near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
function circle(cx,cy,r,n=128,sign=1){return Array.from({length:n},(_,i)=>({x:cx+r*Math.cos(sign*i*Math.PI*2/n),y:cy+r*Math.sin(sign*i*Math.PI*2/n)}));}
function power(p,n){let x=1,y=0;for(let j=0;j<n;j++){const nx=x*p.x-y*p.y;y=x*p.y+y*p.x;x=nx;}return {x,y};}
function inside(p,rings){let winding=0;for(const ring of rings)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],cross=(b.x-a.x)*(p.y-a.y)-(p.x-a.x)*(b.y-a.y);if(a.y<=p.y&&b.y>p.y&&cross>0)winding++;if(a.y>p.y&&b.y<=p.y&&cross<0)winding--;}return winding!==0;}

test('Beltrami tensor is SPD, area-one, and has the prescribed anisotropy eigenvalues',()=>{
 for(const mag of [0,.2,.62,.76])for(const angle of [0,.7,2.1,4.5]){const a=I.metricTensor(mag*Math.cos(angle),mag*Math.sin(angle));near(a[0]*a[2]-a[1]*a[1],1);assert.ok(a[0]>0&&a[2]>0);const hi=(a[0]+a[2]+Math.sqrt((a[0]-a[2])**2+4*a[1]**2))/2;near(hi,(1+mag)/(1-mag));}
 assert.throws(()=>I.metricTensor(1,0));
});
test('Metric PDE reproduces independent affine and anisotropic harmonic polynomial solutions',()=>{
 const rho=.23,tau=.14,T=I.metricTensor(rho,tau),bc=(x,y)=>[T[2]*x*x-T[0]*y*y+.3*x, x*y-T[1]/T[0]*x*x-.2*y];
 for(const n of [17,33]){const f=I.assembleMetric(n,()=>[rho,tau],bc);assert.ok(f.iterations>0);assert.ok(f.residual<1e-7);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const q=bc(-1+2*x/(n-1),-1+2*y/(n-1)),k=y*n+x;near(f.x[k],q[0],2e-7);near(f.y[k],q[1],2e-7);}}
 const affine=(x,y)=>[.3+1.2*x-.4*y,-.6+.2*x+.9*y],f=I.assembleMetric(23,()=>[-.17,.29],affine);for(let y=0;y<23;y++)for(let x=0;x<23;x++){const q=affine(-1+x/11,-1+y/11),k=y*23+x;near(f.x[k],q[0]);near(f.y[k],q[1]);}
});
test('Jacobian guard catches an inverted intermediate shape even when both endpoints are positive',()=>{
 // 180-degree rotation has det=1, but I+t(R-I) collapses at t=.5.
 const f={n:2,x:new Float64Array([1,-1,1,-1]),y:new Float64Array([1,1,-1,-1])};near(I.minimumJacobian(f,1),0);assert.ok(I.minimumJacobian(f,.4)>.039);
});
test('All metric families retain oriented triangles through their entire fractional step and fix boundary',()=>{
 for(const mode of ['vortex','saddle','braid'])for(const angle of [-120,37,78,180]){const p={...A.schemas.beltramiFlow.defaults,beltramiMode:mode,beltramiAngle:angle,beltramiAnisotropy:.76,beltramiFocusX:.42,beltramiFocusY:-.42},f=I.buildMetric(p,33);assert.ok(f.residual<1e-6);assert.ok(f.minJacobian>=.025-1e-8);for(let y=0;y<33;y++)for(let x=0;x<33;x++)if(!x||!y||x===32||y===32){near(f.x[y*33+x],-1+x/16);near(f.y[y*33+x],-1+y/16);}for(const q of [{x:-.6,y:.4},{x:.35,y:-.5}]){const v=I.evolve(f,q,0);near(v.x,q.x);near(v.y,q.y);const a=I.evolve(f,q,2-1e-6),b=I.evolve(f,q,2+1e-6);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-4);}}
});
test('All analytic roots satisfy z^d-a*z+c=w including nearly merged and multiple roots',()=>{
 for(const d of [2,3])for(const a of [0,.001,.9,1.8])for(const w of [{x:0,y:0},{x:.5,y:-.4},{x:-1.2,y:1.1},{x:1e-12,y:-1e-13}]){const c={x:.12,y:-.07},roots=I.polynomialRoots(w,c,d,a);assert.equal(roots.length,d);for(const z of roots){const p=power(z,d);near(p.x-a*z.x+c.x,w.x,1e-8);near(p.y-a*z.y+c.y,w.y,1e-8);}}
 const triple=I.polynomialRoots({x:0,y:0},{x:0,y:0},3,0);assert.ok(triple.every(z=>z.x===0&&z.y===0));
});
test('Argument lifting connects the correct sheets instead of drawing a chord across a branch cut',()=>{
 for(const degree of [2,3]){const joined=I.ramify([circle(0,0,1)],degree,1,{x:0,y:0},.0002);assert.equal(joined.rings.length,1);assert.ok(joined.rings[0].every(p=>Math.abs(Math.hypot(p.x,p.y)-1)<1e-8));const split=I.ramify([circle(1,0,.15)],degree,1,{x:0,y:0},.0002);assert.equal(split.rings.length,degree);for(const ring of split.rings)assert.ok(Math.hypot(ring[0].x-ring.at(-1).x,ring[0].y-ring.at(-1).y)<.01);}
});
test('Cubic monodromy joins two or three sheets according to enclosed critical values',()=>{
 const c={x:0,y:0},a=1.2,critical=2*Math.pow(a/3,1.5);
 const zero=I.ramifyPolynomial([circle(0,1.4,.1)],3,1,c,a,.0001),one=I.ramifyPolynomial([circle(critical,0,.12)],3,1,c,a,.0001),both=I.ramifyPolynomial([circle(0,0,1)],3,1,c,a,.0001);assert.equal(zero.rings.length,3);assert.equal(one.rings.length,2);assert.equal(both.rings.length,1);
});
test('Painted polynomial preimages agree with direct polynomial membership including counters',()=>{
 const source=[circle(0,0,1.1),circle(.25,.12,.31,100,-1)],c={x:-.15,y:.08},a=.9;
 for(const degree of [2,3])for(const depth of [1,2]){const result=I.ramifyPolynomial(source,degree,depth,c,a,.0001);let samples=0;for(let y=-1.9;y<1.9;y+=.091)for(let x=-1.9;x<1.9;x+=.097){let w={x,y};for(let j=0;j<depth;j++){const p=power(w,degree);w={x:p.x-a*w.x+c.x,y:p.y-a*w.y+c.y};}const margin=Math.min(Math.abs(Math.hypot(w.x,w.y)-1.1),Math.abs(Math.hypot(w.x-.25,w.y-.12)-.31));if(margin<.006)continue;assert.equal(inside({x,y},result.rings),inside(w,source),`degree ${degree} depth ${depth} at ${x},${y}`);samples++;}assert.ok(samples>1000);}
});
test('Both operators register every control, per-glyph state, source/effect mixer and output path',()=>{
 const h=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),f=fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8');assert.equal(A.ids.length,2);assert.ok(f.includes('Object.assign(renderers,ramifiedBody.renderers)'));assert.ok(f.includes('boundedBodyIds.forEach'));
 for(const id of A.ids){assert.ok(h.includes(`value="${id}"`));assert.ok(h.includes(`${id}: fieldMaterialRenderer('${id}')`));for(const suffix of ['Color','SourceMode','SourceOpacity','Opacity','Blend'])assert.ok(h.includes(`${id}${suffix}`));for(const k of Object.keys(A.schemas[id].defaults)){const cap=k[0].toUpperCase()+k.slice(1);assert.ok(h.includes('id="p'+cap+'"'));assert.ok(h.includes(k+': deform.'+k));assert.ok(h.includes(k+': params.'+k));}}
});
