import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(here,'../hopf-loom-operator.js'),'utf8'),ctx);
const api=ctx.TypeDeformerHopfLoom,I=api.internals,defaults=api.schemas.hopfLoom.defaults;
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
function mask(w,h,predicate){return {w,h,scale:1,alpha:Float32Array.from({length:w*h},(_,i)=>predicate(i%w,Math.floor(i/w))?1:0)};}
test('inverse stereographic lift preserves unit S3 and recovers arbitrary finite 3D points',()=>{
 for(const p of [[0,0,0],[.2,-.7,.1],[12,3,-6],[-.3,0,2]]){const q=I.lift(...p);assert.ok(Math.abs(dot(q,q)-1)<1e-14);assert.ok(dist(I.project(q),p)<3e-12);}
});
test('common complex phase is a group action and keeps the Hopf base invariant',()=>{
 for(let k=0;k<30;k++){const q=I.lift(.45+k*.06,-.7+k*.031,0),base=I.hopf(q);assert.ok(Math.abs(dot(base,base)-1)<1e-13);for(const t of [0,.13,1.8,3.1,2*Math.PI]){const moved=I.flow(q,t);assert.ok(dist(I.hopf(moved),base)<2e-14);assert.ok(dist(I.flow(moved,.37),I.flow(q,t+.37))<2e-14);assert.ok(dist(I.flow(moved,-t),q)<2e-14);}assert.ok(dist(I.flow(q,2*Math.PI),q)<1e-14);}
});
test('projected complete fibres are planar circles, not a decorative helix',()=>{
 for(const p of [[.45,-.3,0],[1.2,.4,0],[3.3,-.5,0]]){const q=I.lift(...p),curve=Array.from({length:257},(_,i)=>I.project(I.flow(q,2*Math.PI*i/256))),a=curve[0],b=curve[85],c=curve[170],ab=sub(b,a),ac=sub(c,a),n=cross(ab,ac),n2=dot(n,n),term1=cross(ac,n),term2=cross(n,ab),center=a.map((v,i)=>v+(dot(ab,ab)*term1[i]+dot(ac,ac)*term2[i])/(2*n2)),radius=dist(center,a);
  assert.ok(radius>0);for(const v of curve){assert.ok(Math.abs(dot(sub(v,a),n))/Math.sqrt(n2)<3e-12);assert.ok(Math.abs(dist(v,center)-radius)<3e-12);}assert.ok(dist(curve[0],curve.at(-1))<2e-12);
 }
});
test('two distinct complete fibres have unit linking number from independent Gauss quadrature',()=>{
 const n=360,q1=I.lift(.65,.2,0),q2=I.lift(1.8,-.3,0);assert.ok(dist(I.hopf(q1),I.hopf(q2))>.1);
 const a=Array.from({length:n+1},(_,i)=>I.project(I.flow(q1,2*Math.PI*i/n))),b=Array.from({length:n+1},(_,i)=>I.project(I.flow(q2,2*Math.PI*i/n)));let integral=0;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){const r=a[i].map((v,k)=>(v+a[i+1][k]-b[j][k]-b[j+1][k])/2),da=sub(a[i+1],a[i]),db=sub(b[j+1],b[j]);integral+=dot(cross(da,db),r)/Math.pow(Math.hypot(...r),3);}
 assert.ok(Math.abs(Math.abs(integral/(4*Math.PI))-1)<.0002, String(integral/(4*Math.PI)));
});
test('glyph contours include counters and disjoint dots; adaptive extraction has a hard segment bound',()=>{
 const s=mask(44,38,(x,y)=>(x>5&&x<25&&y>5&&y<30&&!(x>10&&x<20&&y>10&&y<24))||(x>32&&x<37&&y>3&&y<8)),b=I.boxFromMask(s),lines=I.contour(s,b);assert.ok(lines.some(l=>l.some(p=>p[0]>10&&p[0]<21&&p[1]>10&&p[1]<25)));assert.ok(lines.some(l=>l.some(p=>p[0]>31)));assert.ok(lines.length<=1536);
 const noisy=mask(200,180,(x,y)=>(x+y)%2===0);assert.ok(I.contour(noisy,I.boxFromMask(noisy)).length<=1536);
});
test('all body modes stay finite inside the declared envelope; tiny sources still yield geometry',()=>{
 const s=mask(28,30,(x,y)=>x>7&&x<21&&y>5&&y<25&&!(x>12&&x<17&&y>10&&y<17));
 for(const mode of ['shell','lamina','fibers'])for(const chart of [.7,2.2])for(const sweep of [0,1]){const p={...defaults,hopfMode:mode,hopfChart:chart,hopfSweep:sweep,hopfYaw:180,hopfTilt:-65},g=I.geometry(s,p),points=g.triangles.flatMap(t=>Array.from(t.v)).concat(g.lines.flatMap(l=>[l.a,l.b]));assert.ok(points.length);for(const v of points){assert.ok(Number.isFinite(v.x+v.y+v.z));assert.ok(v.x>=g.box[0]-36-1e-8&&v.x<=g.box[2]+36+1e-8);assert.ok(v.y>=g.box[1]-36-1e-8&&v.y<=g.box[3]+36+1e-8);}}
 const tiny=mask(8,8,(x,y)=>x===3&&y===4);for(const mode of ['shell','lamina','fibers']){const g=I.geometry(tiny,{...defaults,hopfMode:mode});assert.ok(g.triangles.length+g.lines.length>0);}
 const empty=I.geometry(mask(10,10,()=>false),defaults);assert.equal(empty.triangles.length+empty.lines.length,0);
});

test('Hopf orbital body has every host control, shared glyph renderer and output path',()=>{const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),field=fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8');assert.deepEqual(Array.from(api.ids),['hopfLoom']);assert.ok(html.includes('<script src="hopf-loom-operator.js"></script>'));assert.ok(field.includes('Object.assign(renderers,hopfLoom.renderers)'));assert.ok(html.includes("fieldMaterialRenderer('hopfLoom')"));assert.ok(html.includes("fieldMaterialPad('hopfLoom')"));for(const k of Object.keys(api.schemas.hopfLoom.defaults))assert.ok(html.includes('id="p'+k[0].toUpperCase()+k.slice(1)+'"'));});
