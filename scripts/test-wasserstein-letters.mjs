import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import '../numerical-kernels.js';import '../wasserstein-letters.js';
import * as reference from './wasserstein-reference.mjs';
import {createCanvas} from '@napi-rs/canvas';
const A=globalThis.TypeDeformerWassersteinLetters,I=A.internals,near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`),sum=a=>a.reduce((s,x)=>s+x,0);
test('a single mass moves through space, not a cross-fade at the two endpoints',()=>{const a=[{x:.2,y:.4,m:1}],b=[{x:.8,y:.6,m:1}],q=I.sinkhorn(a,b,.006,1);near(q.plan[0],1);near(q.cost,.4);const N=100,r=I.interpolate(q,.5,N);near(sum(r),1);let x=0,y=0;for(let k=0;k<r.length;k++){x+=r[k]*(k%N+.5)/N;y+=r[k]*(Math.floor(k/N)+.5)/N;}near(x,.5);near(y,.5);near(r[40*N+20],0);});
test('symmetric two-point plan agrees with the analytic entropy-regularized solution',()=>{const a=[{x:.25,y:.5,m:.5},{x:.75,y:.5,m:.5}],eps=.04,q=I.sinkhorn(a,a,eps,1),cross=.5/(1+Math.exp(.25/eps));near(q.plan[1],cross,1e-12);near(q.plan[0],.5-cross,1e-12);});
test('unequal marginals and split masses are conserved at every interpolation time',()=>{const a=[{x:.1,y:.2,m:.7},{x:.8,y:.7,m:.3}],b=[{x:.2,y:.8,m:.2},{x:.5,y:.5,m:.3},{x:.9,y:.1,m:.5}],q=I.sinkhorn(a,b,.006,1);assert.ok(q.rowError<1e-7);assert.ok(q.columnError<1e-12);for(const t of [0,.1,.5,.9,1])near(sum(I.interpolate(q,t,96)),1,1e-12);});
test('swapping endpoints reverses the coupling and interpolation',()=>{const a=[{x:.1,y:.4,m:.3},{x:.7,y:.2,m:.7}],b=[{x:.6,y:.5,m:.45},{x:.8,y:.9,m:.55}],q=I.sinkhorn(a,b,.015,1.7),z=I.sinkhorn(b,a,.015,1.7);near(q.cost,z.cost,1e-7);for(let i=0;i<2;i++)for(let j=0;j<2;j++)near(q.plan[i*2+j],z.plan[j*2+i],1e-7);const r=I.interpolate(q,.3,80),s=I.interpolate(z,.7,80);near(r.reduce((v,x,i)=>v+Math.abs(x-s[i]),0),0,1e-6);});
test('anisotropic quadratic cost changes routes and obeys the matching rotation rule',()=>{const a=[{x:.2,y:.3,m:.5},{x:.8,y:.7,m:.5}],b=[{x:.3,y:.8,m:.5},{x:.7,y:.2,m:.5}],lo=I.sinkhorn(a,b,.006,.4),hi=I.sinkhorn(a,b,.006,2.5);assert.ok(Math.abs(lo.plan[0]-hi.plan[0])>.45);const rot=p=>p.map(({x,y,m})=>({x:y,y:x,m})),q=I.sinkhorn(rot(a),rot(b),.006,2.5);near(q.cost,lo.cost,1e-10);});
test('discretization keeps thin disconnected components and normalizes total mass',()=>{const s={w:80,h:80,alpha:new Float32Array(6400)};for(let y=10;y<70;y++){s.alpha[y*80+17]=.5;s.alpha[y*80+61]=1;}const d=I.distribution(s,38);near(sum(d.points.map(x=>x.m)),1,1e-12);near(d.total,90);assert.ok(d.points.some(p=>p.x<.2));assert.ok(d.points.some(p=>p.x>.8));assert.equal(I.distribution({w:2,h:2,alpha:new Float32Array(4)},38),null);});
test('transport is deterministic, finite and convergent at all supported cost and entropy corners',()=>{const a=Array.from({length:25},(_,i)=>({x:(i%5+.3)/5,y:(Math.floor(i/5)+.4)/5,m:1/25})),b=a.map((p,i)=>({x:.15+.65*p.x,y:.1+.7*p.y,m:(i+1)/325}));for(const e of [.003,.04])for(const k of [.4,2.5]){const q=I.sinkhorn(a,b,e,k),r=I.sinkhorn(a,b,e,k);assert.deepEqual(q.plan,r.plan);assert.ok(q.rowError<1e-7);assert.ok(q.plan.every(x=>Number.isFinite(x)&&x>=0));near(sum(q.plan),1,1e-12);}});
test('native controls and output metadata include all axes and the shared Unicode partner',()=>{const h=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');for(const k of Object.keys(A.schemas.wassersteinLetters.defaults)){const c=k[0].toUpperCase()+k.slice(1);for(const text of [`id="p${c}"`,`${k}: deform.${k}`,`${k}: params.${k}`])assert.ok(h.includes(text),text);}for(const s of ['id="pWassersteinPartner"','TypeDeformerWassersteinLetters.validText(params.wassersteinPartner)', 'id="pWassersteinScope"', "wassersteinScope: 'glyph'",'pushHistory(); params.wassersteinPartner = value','version: 92'])assert.ok(h.includes(s),s);});

test('reconstruction conserves mass at edges and corners without leaking across the opposite edge',()=>{const n=48;for(const index of [0,n-1,n*(n-1),n*n-1,Math.floor(n*n/2)]){const f=new Float64Array(n*n);f[index]=1;for(const sigma of [1,2.5,5]){const g=I.smooth(f,n,sigma);near(sum(g),1,1e-12);assert.ok(g.every(x=>Number.isFinite(x)&&x>=-1e-15));if(index===0)near(g[n*n-1],0,1e-15);}}});

test('reconstruction width remains continuous across integer filter radii',()=>{const n=48,f=new Float64Array(n*n);f[24*n+24]=1;for(const sigma of [Math.sqrt(2),Math.sqrt(6),Math.sqrt(12),Math.sqrt(20)]){const a=I.smooth(f,n,sigma-1e-7),b=I.smooth(f,n,sigma+1e-7);assert.ok(a.reduce((sum,x,i)=>sum+Math.abs(x-b[i]),0)<1e-6);}});

test('isocontours close at the tile boundary and retain holes and separate islands',()=>{const n=48;for(const kind of ['ring','islands','border']){const f=Float64Array.from({length:n*n},(_,k)=>{const x=(k%n+.5)/n,y=(Math.floor(k/n)+.5)/n,r=Math.hypot(x-.5,y-.5);return kind==='ring'?(r>.17&&r<.36?1:0):kind==='islands'?(Math.hypot(x-.22,y-.5)<.1||Math.hypot(x-.78,y-.5)<.1?1:0):(x<.35&&y<.8?1:0);}),segments=I.contours(f,n,.5),paths=I.loops(segments);assert.equal(paths.length,kind==='border'?1:2,kind);assert.equal(sum(paths.map(p=>p.length)),segments.length,kind+' dropped an open segment');assert.ok(paths.flat(2).every(Number.isFinite));}});

test('ambiguous saddle connectivity follows the bilinear determinant, including cases a center average misclassifies',()=>{for(const [a,b,c,d,expected]of [[5,-2,.1,-2,2],[2,-5,2,-.1,1]]){const f=new Float64Array([a,b,d,c]),paths=I.loops(I.contours(f,2,0.001));assert.equal(paths.length,expected);}});

test('contour reconstruction is invariant under transposing a nonsymmetric density field',()=>{const n=37,f=Float64Array.from({length:n*n},(_,k)=>{const x=(k%n+.5)/n,y=(Math.floor(k/n)+.5)/n;return Math.exp(-((x-.35)**2/.03+(y-.65)**2/.09));}),transpose=Float64Array.from({length:n*n},(_,k)=>f[(k%n)*n+Math.floor(k/n)]),points=lines=>lines.flat().map(([x,y])=>[x,y].map(v=>v.toFixed(7)).join(',')).sort();assert.deepEqual(points(I.contours(f,n,.31).map(line=>line.map(([x,y])=>[y,x]))),points(I.contours(transpose,n,.31)));});

test('text validation accepts words, spaces and 32 graphemes without splitting combining marks',()=>{for(const s of ['TYPE','言 葉','é'.repeat(32),'👩‍💻'.repeat(32)])assert.equal(A.validText(s),true,s);for(const s of ['', ' ', 'A'.repeat(33), 'A\nB', 'A\tB', null])assert.equal(A.validText(s),false);assert.equal(A.characters('é👩‍💻').length,2);});

test('fused transport and reconstruction preserve every scalar-reference value',()=>{
 const a=Array.from({length:53},(_,i)=>({x:(i*17%59+.3)/60,y:(i*29%61+.4)/62,m:(i+1)/(53*54/2)}));
 const b=Array.from({length:47},(_,i)=>({x:(i*13%53+.2)/54,y:(i*31%67+.7)/68,m:(48-i)/(47*50/2)}));
 const total=sum(b.map(p=>p.m));for(const p of b)p.m/=total;
 for(const eps of [.003,.006,.04])for(const metric of [.4,1,2.5]){
  const q=I.sinkhorn(a,b,eps,metric),r=reference.sinkhorn(a,b,eps,metric);
  assert.deepEqual(q,r);
  for(const t of [0,.001,.37,.67,.999,1]){
   const f=I.interpolate(q,t,48),g=reference.interpolate(r,t,48);assert.deepEqual(f,g);
   const x=I.smooth(f,48,1.73),y=reference.smooth(g,48,1.73);assert.deepEqual(x,y);assert.deepEqual(I.contours(x,48,.0004),reference.contours(y,48,.0004));
  }
 }
});

test('staged caches verify source pixels, reuse display-independent solves and own endpoint canvases',async()=>{
 globalThis.document={createElement:()=>createCanvas(1,1)};await import('../render-context.js');
 const R=globalThis.TypeDeformerRenderContext,canvas=createCanvas(24,28),ctx=canvas.getContext('2d');ctx.fillRect(4,3,7,22);ctx.fillRect(4,15,16,5);
 const data=ctx.getImageData(0,0,24,28).data,s={w:24,h:28,scale:1,canvas,alpha:Float32Array.from({length:24*28},(_,i)=>data[i*4+3]/255),key:'deliberately-identical-key',partner:'B',targetFont:'700 32px Arial'},p={...A.schemas.wassersteinLetters.defaults};
 const render=(progress,factor=1)=>R.withContext(R.make({factor,purpose:'proof'}),()=>R.withScope(()=>{const c=A.renderers.wassersteinLetters(s,{...p,wassersteinProgress:progress},[30,60,90]);return c.getContext('2d').getImageData(0,0,s.w,s.h).data.slice();}));
 A.clearCache();const endpoint=render(1);assert.ok(endpoint.some((v,i)=>i%4===3&&v));assert.equal(A.cacheStats().stages.plans.entries,0,'endpoints require no transport solve');
 render(.5);assert.deepEqual(render(1),endpoint,'target remains live after the preceding render scope closes');
 const q=I.prepare(s,p),r=I.prepare(s,{...p,wassersteinSharpness:.1,wassersteinProgress:.9,wassersteinView:'tracks'});assert.equal(q.transport,r.transport);assert.equal(q.target,r.target);
 const f=I.reconstructed(q,.5,512);assert.equal(I.reconstructed(r,.5,512),f);
 s.alpha[3*24+4]=.125;const changed=I.prepare(s,p);assert.notEqual(changed.transport,q.transport,'an unchanged external key cannot hide changed source mass');
 const other=I.prepare({...s,partner:'C'},p);assert.notEqual(other.transport,changed.transport);
 const large=()=>R.withContext(R.make({factor:4,purpose:'export'}),()=>R.withScope(()=>I.prepare(s,p).transport));
 assert.equal(large(),changed.transport,'physical density must not change logical transport identity');
 assert.equal(large(),changed.transport,'an uncached oversized target must still reuse its transport');
 const targets=A.cacheStats().stages.targets.misses;render(1,2);assert.ok(A.cacheStats().stages.targets.misses>targets,'proof resolves a target at its own physical density');
 assert.ok(A.cacheStats().bytes<=64*1024*1024,'all stages respect the combined byte allowance');
 A.invalidateFonts();assert.equal(A.cacheStats().bytes,0);assert.equal(q.target.canvas.width,1,'font invalidation disposes owned targets');
 assert.notEqual(I.prepare(s,p).transport,changed.transport);A.clearCache();assert.equal(A.cacheStats().bytes,0);
 delete globalThis.document;delete globalThis.TypeDeformerRenderContext;
});
