import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const c={};vm.createContext(c);vm.runInContext(fs.readFileSync(new URL('../folded-body-operators.js',import.meta.url),'utf8'),c);const A=c.TypeDeformerFoldedBody,I=A.internals,near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('radial twists preserve radius, fix the outer domain, and invert exactly',()=>{
 const center={x:.3,y:-.2};for(const r of [0,.01,.6,1,1.4])for(const angle of [-9.5,0,.5,8.2]){const q={x:center.x+r*.6,y:center.y+r*.8},m=I.radialTwist(q,center,1.2,angle),back=I.radialTwist(m,center,1.2,-angle);near(Math.hypot(m.x-center.x,m.y-center.y),r,1e-12);near(back.x,q.x,1e-12);near(back.y,q.y,1e-12);if(r>=1.2){near(m.x,q.x,0);near(m.y,q.y,0);}}
 const a=I.radialTwist({x:1.2-1e-6,y:0},{x:0,y:0},1.2,10),b=I.radialTwist({x:1.2+1e-6,y:0},{x:0,y:0},1.2,10);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<2.01e-6);
});
test('composed and fractional linked twists preserve the Jacobian and have reverse-order inverses',()=>{
 for(const cycles of [.1,.9,1,1.25,2.7,3])for(const balance of [-1,.2,1])for(let j=0;j<15;j++){const p={...A.schemas.linkedTwist.defaults,twistCycles:cycles,twistTurns:.9,twistBalance:balance,twistAxis:37},q={x:Math.sin(j*2.8)*1.3,y:Math.cos(j*1.9)*1.2},v=I.twistMap(q,p),back=I.twistMap(v,p,true);near(back.x,q.x,4e-10);near(back.y,q.y,4e-10);const e=1e-7,px=I.twistMap({x:q.x+e,y:q.y},p),mx=I.twistMap({x:q.x-e,y:q.y},p),py=I.twistMap({x:q.x,y:q.y+e},p),my=I.twistMap({x:q.x,y:q.y-e},p),det=((px.x-mx.x)*(py.y-my.y)-(px.y-mx.y)*(py.x-my.x))/(4*e*e);near(det,1,3e-4);}
});
test('adaptive linked outlines preserve signed material area including a counter',()=>{
 const rings=[[{x:-.65,y:-.5},{x:.65,y:-.5},{x:.65,y:.5},{x:-.65,y:.5}],[{x:-.16,y:-.2},{x:-.16,y:.2},{x:.16,y:.2},{x:.16,y:-.2}]],area=r=>r.reduce((sum,a,i)=>{const b=r[(i+1)%r.length];return sum+(a.x*b.y-a.y*b.x)/2;},0),p={...A.schemas.linkedTwist.defaults,twistTurns:.75,twistCycles:1.2},source=rings.reduce((sum,r)=>sum+area(r),0),mapped=rings.map(r=>I.mappedRing(r,q=>I.twistMap(q,p),2e-6,{count:0}));assert.ok(area(mapped[0])>0&&area(mapped[1])<0);near(mapped.reduce((sum,r)=>sum+area(r),0),source,.001);
});
test('order-one Enneper coordinates match the independent real polynomial',()=>{
 for(const u of [-1.3,-.2,.8])for(const v of [-1.1,.1,.6]){const actual=I.enneperPoint(u,v,1,0),expected=[u-u**3/3+u*v*v,v-v**3/3+v*u*u,u*u-v*v];assert.ok(distance(actual,expected)<1e-12);}
});
test('generalized associate surfaces have an isotropic metric and zero mean curvature',()=>{
 for(const n of [1,2,3])for(const phase of [0,.3,1.2,Math.PI])for(const [u,v]of [[0,0],[.25,-.4],[1.1,.6],[-1.3,-.9]]){const [du,dv]=I.enneperTangents(u,v,n,phase),E=dot(du,du),G=dot(dv,dv),expected=(1+Math.pow(u*u+v*v,n))**2;near(E,expected,1e-8);near(G,expected,1e-8);near(dot(du,dv),0,1e-8);
 const h=1e-4,f=I.enneperPoint(u,v,n,phase),xp=I.enneperPoint(u+h,v,n,phase),xm=I.enneperPoint(u-h,v,n,phase),yp=I.enneperPoint(u,v+h,n,phase),ym=I.enneperPoint(u,v-h,n,phase),lap=f.map((_,j)=>(xp[j]+xm[j]+yp[j]+ym[j]-4*f[j])/(h*h));assert.ok(Math.hypot(...lap)<.002);assert.ok(distance(du,xp.map((x,j)=>(x-xm[j])/(2*h)))<.0001);assert.ok(distance(dv,yp.map((x,j)=>(x-ym[j])/(2*h)))<.0001);
 }
});
test('camera rotation is isometric and the domain normalization bounds the full surface',()=>{
 for(const n of [1,2,3])for(const span of [.15,.7,1.8,2.6])for(let i=0;i<24;i++){const a=i*Math.PI/12,p=I.enneperPoint(span*Math.cos(a),span*Math.sin(a),n,.7),r=I.rotate(p,1.4,-.8),norm=span*(1+span**(2*n)/(2*n+1));near(Math.hypot(...p),Math.hypot(...r));assert.ok(Math.hypot(...p)/norm<Math.sqrt(3)+1e-10);}
});
test('depth rasterization is order independent and a front hole reveals the back sheet',()=>{
 const source=(hole=false)=>({w:9,h:9,alpha:Float32Array.from({length:81},(_,i)=>hole&&(i%9>=3&&i%9<=5&&Math.floor(i/9)>=3&&Math.floor(i/9)<=5)?0:1)}),make=()=>({w:8,h:8,depth:new Float32Array(64).fill(-Infinity),pixels:new Uint8ClampedArray(256),fragments:0}),quad=(target,z,color,s)=>{const v=[[0,0,z,0,0,0,0,1],[8,0,z,8,0,0,0,1],[8,8,z,8,8,0,0,1],[0,8,z,0,8,0,0,1]];I.rasterTriangle(target,v[0],v[1],v[2],s,color,0);I.rasterTriangle(target,v[0],v[2],v[3],s,color,0);},a=make(),b=make();quad(a,0,[0,0,200],source());quad(a,1,[200,0,0],source(true));quad(b,1,[200,0,0],source(true));quad(b,0,[0,0,200],source());assert.deepEqual(a.pixels,b.pixels);const color=(t,x,y)=>Array.from(t.pixels.slice((y*8+x)*4,(y*8+x)*4+4));assert.deepEqual(color(a,4,4),[0,0,200,255]);assert.deepEqual(color(a,1,1),[200,0,0,255]);assert.equal(a.depth[4*8+4],0);assert.equal(a.depth[1*8+1],1);
});
test('all folded-body controls, per-glyph state and renderer routes are connected',()=>{
 const h=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),f=fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8');assert.equal(A.ids.length,2);assert.ok(f.includes('Object.assign(renderers,foldedBody.renderers)'));assert.ok(f.includes('foldedBody?foldedBody.ids:[]'));
 for(const id of A.ids){assert.ok(h.includes(`value="${id}"`));assert.ok(h.includes(`${id}: fieldMaterialRenderer('${id}')`));for(const suffix of ['Color','SourceMode','SourceOpacity','Opacity','Blend'])assert.ok(h.includes(`${id}${suffix}`));for(const k of Object.keys(A.schemas[id].defaults)){const cap=k[0].toUpperCase()+k.slice(1);assert.ok(h.includes('id="p'+cap+'"'));assert.ok(h.includes(k+': deform.'+k));assert.ok(h.includes(k+': params.'+k));}}
});
