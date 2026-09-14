import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const c={};vm.createContext(c);for(const file of ['loadpath-foundry-operator.js','letterform-body-operators.js'])vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),c);
const A=c.TypeDeformerLetterformBody,I=A.internals,D=c.TypeDeformerLoadpathFoundry.internals.euclideanDistance,near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function mask(w,h,fn){return {w,h,alpha:Float32Array.from({length:w*h},(_,k)=>+fn(k%w,Math.floor(k/w)))};}
function components(s,foreground=true){const seen=new Uint8Array(s.w*s.h);let count=0;for(let k=0;k<seen.length;k++){if(seen[k]||!!s.alpha[k]!==foreground)continue;const todo=[k];seen[k]=1;let outer=false;while(todo.length){const q=todo.pop(),x=q%s.w,y=Math.floor(q/s.w);outer||=!x||!y||x===s.w-1||y===s.h-1;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if((!dx&&!dy)||(!foreground&&dx&&dy)||x+dx<0||y+dy<0||x+dx>=s.w||y+dy>=s.h)continue;const n=(y+dy)*s.w+x+dx;if(!seen[n]&&!!s.alpha[n]===foreground){seen[n]=1;todo.push(n);}}}if(foreground||!outer)count++;}return count;}
const fixtures=[
 mask(24,28,(x,y)=>x>3&&x<20&&y>3&&y<24&&!(x>8&&x<15&&y>9&&y<18)),
 mask(25,25,(x,y)=>(x>=11&&x<=13&&y>2&&y<23)||(y>=10&&y<=13&&x>2&&x<23)),
 mask(21,21,(x,y)=>(x===5&&y===5)||(x>=13&&x<=14&&y>=13&&y<=14)),
 mask(22,22,(x,y)=>x>3&&x<18&&Math.abs(x-y)<3),
 mask(30,28,(x,y)=>((x>2&&x<13)||(x>16&&x<27))&&y>3&&y<24)
];
test('thinning preserves isolated dots, connected strokes and closed counters',()=>{
 for(const s of fixtures){const r=I.thin(s.alpha,s.w,s.h),slim={...s,alpha:r.mask};assert.equal(components(slim),components(s));assert.equal(components(slim,false),components(s,false));assert.ok(r.mask.some(Boolean));assert.ok(r.mask.every((v,k)=>!v||s.alpha[k]));assert.deepEqual(I.thin(r.mask,s.w,s.h).mask,r.mask);}
});
test('smoothed pen paths do not bridge disconnected components or delete isolated marks',()=>{
 for(const s of fixtures){const g=I.graph(s.alpha,s.w,s.h,D(s.alpha,s.w,s.h)),seen=new Set();let count=0;for(let i=0;i<g.nodes.length;i++){if(seen.has(i))continue;count++;const todo=[i];seen.add(i);while(todo.length){const j=todo.pop(),n=g.nodes[j];assert.ok(Number.isFinite(n.x+n.y+n.r)&&n.r>0);for(const k of n.adj){assert.ok(g.nodes[k].adj.includes(j));if(!seen.has(k)){seen.add(k);todo.push(k);}}}}assert.equal(count,components(s));}
});
test('stroke radius uses exact Euclidean distances, including diagonals',()=>{
 const s=fixtures[0],d=D(s.alpha,s.w,s.h),outside=[];s.alpha.forEach((v,k)=>{if(!v)outside.push([k%s.w,Math.floor(k/s.w)]);});for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++){const oracle=Math.min(...outside.map(q=>Math.hypot(x-q[0],y-q[1])));near(d[y*s.w+x],oracle,5e-7);}
});
test('counter protection excludes open background and only erases existing closed white',()=>{
 const s=fixtures[0],dist=D(s.alpha.map(v=>1-v),s.w,s.h),weak=I.holeGuard(s,dist,.2),strong=I.holeGuard(s,dist,1);assert.ok(strong[13*s.w+11]>.99);for(let i=0;i<weak.length;i++){assert.ok(strong[i]>=weak[i]);if(s.alpha[i])assert.equal(strong[i],0);}assert.equal(strong[0],0);const open=mask(24,28,(x,y)=>s.alpha[y*24+x]&&!(y===12&&x<15));assert.ok(I.holeGuard(open,D(open.alpha.map(v=>1-v),open.w,open.h),1).every(v=>v===0));
});
test('all bounded stress axes preserve endpoints and landmark order with finite derivatives',()=>{
 for(const k of [.35,.62,1,2.1,2.8])for(const focus of [.2,.5,.8]){near(I.axis(0,focus,k),0);near(I.axis(focus,focus,k),focus);near(I.axis(1,focus,k),1);let previous=-Infinity;for(let i=-50;i<=150;i++){const t=i/100,v=I.axis(t,focus,k);assert.ok(Number.isFinite(v)&&v>previous);previous=v;const derivative=(I.axis(t+1e-7,focus,k)-I.axis(t-1e-7,focus,k))/2e-7;assert.ok(derivative>0&&Number.isFinite(derivative));}}
});
test('stress and sequential bow maps have a reverse-order inverse and positive Jacobian',()=>{
 for(const x of [.35,1,2.8])for(const y of [.35,1,2.8])for(const bow of [-.25,.25]){const p={...A.schemas.anatomyWarp.defaults,anatomyX:x,anatomyY:y,anatomyFocusX:.2,anatomyFocusY:.8,anatomyBowX:bow,anatomyBowY:-bow};for(let i=0;i<60;i++){const q={x:(i%10)/7-.12,y:Math.floor(i/10)/4-.1},v=I.map(q,p),back=I.inverse(v,p);near(back.x,q.x);near(back.y,q.y);const e=1e-7,dx=I.map({x:q.x+e,y:q.y},p),dy=I.map({x:q.x,y:q.y+e},p),det=((dx.x-v.x)*(dy.y-v.y)-(dy.x-v.x)*(dx.y-v.y))/e**2;assert.ok(det>0&&Number.isFinite(det));}}
});
test('adaptive anatomy paths retain outer and hole orientation in one shared coordinate frame',()=>{
 const rings=[[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],[{x:.3,y:.3},{x:.3,y:.7},{x:.7,y:.7},{x:.7,y:.3}]],area=r=>r.reduce((v,a,i)=>{const b=r[(i+1)%r.length];return v+(a.x*b.y-a.y*b.x)/2;},0);for(const p of [A.schemas.anatomyWarp.defaults,{...A.schemas.anatomyWarp.defaults,anatomyX:.35,anatomyY:2.8,anatomyBowX:.25,anatomyBowY:-.25}]){const mapped=rings.map(r=>I.ring(r,q=>{const v=I.map(q,p);return{x:v.x*300,y:v.y*300};}));assert.ok(area(mapped[0])>0&&area(mapped[1])<0);for(const r of mapped)assert.ok(r.every(q=>Number.isFinite(q.x+q.y)));}
});
test('every letterform control is connected to editor, per-glyph persistence and native rendering',()=>{
 const h=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),f=fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8');assert.equal(A.ids.length,2);assert.ok(f.includes('Object.assign(renderers,letterformBody.renderers)'));assert.ok(f.includes('letterformBody?letterformBody.ids:[]'));
 for(const id of A.ids){assert.ok(h.includes(`value="${id}"`));assert.ok(h.includes(`${id}: fieldMaterialRenderer('${id}')`));for(const suffix of ['Color','SourceMode','SourceOpacity','Opacity','Blend'])assert.ok(h.includes(`${id}${suffix}`));for(const k of Object.keys(A.schemas[id].defaults)){const cap=k[0].toUpperCase()+k.slice(1);assert.ok(h.includes('id="p'+cap+'"'));assert.ok(h.includes(k+': deform.'+k));assert.ok(h.includes(k+': params.'+k));}}
});
