import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(here,'../miura-vault-operator.js'),'utf8'),ctx);
const api=ctx.TypeDeformerMiuraVault,I=api.internals,defaults=api.schemas.miuraVault.defaults;
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i])),sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function mask(w,h,predicate){return {w,h,scale:1,alpha:Float32Array.from({length:w*h},(_,i)=>predicate(i%w,Math.floor(i/w))?1:0)};}
test('folded unit cell matches Schenk and Guest independent trigonometric dimensions',()=>{
 for(const gamma of [25,58,75])for(const fold of [0,.23,.68,1]){const g=gamma*Math.PI/180,theta=fold*Math.PI*.49,a=13.2,b=8.7,m=I.cellMetrics(a,b,g,fold),den=Math.sqrt(1+Math.cos(theta)**2*Math.tan(g)**2);assert.ok(Math.abs(m.H-a*Math.sin(theta)*Math.sin(g))<1e-13);assert.ok(Math.abs(m.W-b*Math.cos(theta)*Math.tan(g)/den)<1e-12);assert.ok(Math.abs(m.V-b/den)<1e-12);assert.ok(m.L>0&&m.W>0);}
});
test('each parallelogram preserves all six pairwise distances, area, angles and planarity',()=>{
 for(const gamma of [25,58,75])for(const fold of [0,.23,.68,1])for(let j=-2;j<3;j++)for(let i=-2;i<3;i++){const m=I.cellMetrics(17,11,gamma*Math.PI/180,fold),ids=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]],flat=ids.map(q=>I.node(...q,m,true)),v=ids.map(q=>I.node(...q,m,false));for(let k=0;k<4;k++)for(let l=k+1;l<4;l++)assert.ok(Math.abs(dist(flat[k],flat[l])-dist(v[k],v[l]))<3e-12);const e=sub(v[1],v[0]),f=sub(v[3],v[0]),n=cross(e,f);assert.ok(Math.abs(Math.hypot(...n)-17*11*Math.sin(gamma*Math.PI/180))<1e-11);assert.ok(Math.abs(dot(n,sub(v[2],v[0])))<2e-10);assert.ok(Math.abs(Math.abs(dot(e,f))-17*11*Math.cos(gamma*Math.PI/180))<1e-11);}
});
test('shared hinges are continuous and unfolded map is the identity over positive and negative cells',()=>{
 for(const gamma of [25,58,75]){const flat=I.cellMetrics(13,9,gamma*Math.PI/180,0);for(let k=0;k<60;k++){const p=[Math.sin(k*1.2)*44,Math.cos(k*.71)*43,0];assert.ok(dist(I.foldedPoint(p[0],p[1],flat),p)<3e-13);}const m=I.cellMetrics(13,9,gamma*Math.PI/180,.9);for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){const p=I.node(i,j,m,true),q=I.node(i,j,m,false);assert.ok(dist(I.foldedPoint(p[0],p[1],m),q)<2e-12);for(const axis of [0,1]){const a=p.slice(),b=p.slice();a[axis]-=1e-7;b[axis]+=1e-7;assert.ok(dist(I.foldedPoint(a[0],a[1],m),I.foldedPoint(b[0],b[1],m))<2.01e-7);}}}
});
test('in-plane contraction gives the negative Poisson ratio from Eq.9, independently differentiated',()=>{
 for(const gamma of [25,58,75])for(const fold of [.2,.55,.88]){const g=gamma*Math.PI/180,h=1e-5,lo=I.cellMetrics(17,11,g,fold-h),hi=I.cellMetrics(17,11,g,fold+h),nu=-(Math.log(hi.L)-Math.log(lo.L))/(Math.log(hi.W)-Math.log(lo.W)),expected=-(Math.cos(fold*Math.PI*.49)**2)*Math.tan(g)**2;assert.ok(hi.L<lo.L&&hi.W<lo.W);assert.ok(Math.abs(nu-expected)<3e-8);}
});
test('contour segments are split at actual row and column hinges, so each span folds affinely',()=>{
 const m=I.cellMetrics(12,9,.91,.83);for(const [a,b]of [[[-50,-19],[65,41]],[[30,20],[-60,20]],[[0,0],[0,60]],[[-8,8],[12,-31]]]){const ts=I.segmentBreaks(a,b,m,.18);assert.equal(ts[0],0);assert.equal(ts.at(-1),1);for(let k=1;k<ts.length;k++){const at=t=>a.map((v,i)=>v+(b[i]-v)*t),x=I.foldedPoint(...at(ts[k-1]),m),y=I.foldedPoint(...at(ts[k]),m),z=I.foldedPoint(...at((ts[k-1]+ts[k])/2),m);assert.ok(dist(z,x.map((v,i)=>(v+y[i])/2))<2e-12);}}
});
test('all three bodies keep finite geometry for extreme folds and tiny sources, with bounded contour extraction',()=>{
 const s=mask(28,30,(x,y)=>x>7&&x<21&&y>5&&y<25&&!(x>12&&x<17&&y>10&&y<17));for(const mode of ['sheet','fretwork','layers'])for(const fold of [0,1])for(const angle of [25,75]){const g=I.geometry(s,{...defaults,miuraMode:mode,miuraFold:fold,miuraAngle:angle,miuraCell:4,miuraGauge:8,miuraSpin:-90});assert.ok(g.triangles.length);assert.ok(g.fit>0&&g.fit<=1);for(const t of g.triangles)for(const p of t.v)assert.ok(Number.isFinite(p.x+p.y+p.z+p.u+p.v));}
 const tiny=mask(8,8,(x,y)=>x===3&&y===4);for(const mode of ['sheet','fretwork','layers'])assert.ok(I.geometry(tiny,{...defaults,miuraMode:mode}).triangles.length);assert.equal(I.geometry(mask(10,10,()=>false),defaults).triangles.length,0);const noisy=mask(200,180,(x,y)=>(x+y)%2===0);assert.ok(I.contour(noisy,I.boxFromMask(noisy)).length<=2048);
});

test('large sources adapt cell scale before mesh growth exceeds the fixed work budget',()=>{const src=mask(360,360,()=>true),g=I.geometry(src,{...defaults,miuraCell:4,miuraAngle:25,miuraSpin:45,miuraGauge:0});assert.ok(g.cells<=4096);assert.ok(g.metrics.a>4);assert.ok(g.triangles.length<=8192);});

test('Rigid Miura body has every host control, shared glyph renderer and output path',()=>{const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),field=fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8');assert.deepEqual(Array.from(api.ids),['miuraVault']);assert.ok(html.includes('<script src="miura-vault-operator.js"></script>'));assert.ok(field.includes('Object.assign(renderers,miuraVault.renderers)'));assert.ok(html.includes("fieldMaterialRenderer('miuraVault')"));assert.ok(html.includes("fieldMaterialPad('miuraVault')"));for(const k of Object.keys(api.schemas.miuraVault.defaults))assert.ok(html.includes('id="p'+k[0].toUpperCase()+k.slice(1)+'"'));});
