import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const box={};vm.createContext(box);vm.runInContext(fs.readFileSync(new URL('../order-matter-operators.js',import.meta.url),'utf8'),box);const I=box.TypeDeformerOrderMatter.internals,D=box.TypeDeformerOrderMatter.schemas.nematicFilm.defaults;
const near=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
test('multigrid produces exact unit rhombs, shared edges and expected angle families',()=>{
 for(const n of [4,5,7]){const m=I.multigrid(90,80,6,n,12,.25,17),angles=new Set(),edges=new Map();near(m.gamma.reduce((a,b)=>a+b,0),0);
  for(const tile of m.tiles){assert.ok(tile.area>0);const v=tile.v;for(let k=0;k<4;k++){near(Math.hypot(v[k].x-v[(k+1)%4].x,v[k].y-v[(k+1)%4].y),6);const key=[v[k].key,v[(k+1)%4].key].sort().join('|');edges.set(key,(edges.get(key)||0)+1);}near(v[0].x+v[2].x,v[1].x+v[3].x);near(v[0].y+v[2].y,v[1].y+v[3].y);angles.add(Math.round(tile.area/36*1e6));}
  assert.ok([...edges.values()].every(n=>n<=2));assert.ok([...edges.values()].filter(n=>n===2).length>m.tiles.length);assert.equal(angles.size,n===4?2:n===5?2:3);
 }
});
test('dual rhombs cover interior without overlaps at independent test points',()=>{
 for(const n of [4,5,7]){const m=I.multigrid(90,80,6,n,-18,-1.33,92);for(let y=10.317;y<70;y+=3.29)for(let x=10.713;x<80;x+=3.11){let hits=0;for(const t of m.tiles){const b1=I.barycentric([t.v[0],t.v[1],t.v[2]],x,y),b2=I.barycentric([t.v[0],t.v[2],t.v[3]],x,y);if((b1&&Math.min(...b1)>0)||(b2&&Math.min(...b2)>0))hits++;}assert.equal(hits,1,`n=${n}, ${x},${y}`);}}
});
test('perpendicular lift is bounded, shared, coplanar and changes under phason shift',()=>{
 for(const n of [4,5,7]){const m=I.multigrid(80,80,8,n,35,.25,17),c=I.liftMesh(m,50,17);for(let dim=0;dim<2;dim++)near(c.reduce((a,v,j)=>a+v*m.axes[j][dim],0),0);
  for(const t of m.tiles){near(t.v[0].z+t.v[2].z,t.v[1].z+t.v[3].z,1e-7);for(const v of t.v)assert.ok(v.z>=7.5-1e-7&&v.z<=57.5+1e-7);}
  const other=I.multigrid(80,80,8,n,35,1.75,17);assert.notEqual(JSON.stringify(m.tiles.map(t=>t.v.map(v=>v.key))),JSON.stringify(other.tiles.map(t=>t.v.map(v=>v.key))));
 }
});
function source(shape){const w=42,h=38,alpha=Float32Array.from({length:w*h},(_,i)=>shape(i%w,Math.floor(i/w))?1:0);return {w,h,scale:1,alpha};}
test('nematic projected gradient lowers independently tracked energy; order stays bounded',()=>{
 const s=source((x,y)=>x>4&&x<37&&y>4&&y<33&&!(x>14&&x<25&&y>13&&y<24));for(const anchor of [0,2.4,6]){const g=I.nematicGrid(s,{...D,nematicAnchor:anchor},17),hist=I.relax(g,160,true);for(let i=1;i<hist.length;i++)assert.ok(hist[i]<=hist[i-1]+1e-6,`${i} ${hist[i]}>${hist[i-1]}`);assert.ok(hist.at(-1)<hist[0]*.65);for(const i of g.active)assert.ok(Math.hypot(g.qx[i],g.qy[i])<=1.000001);}
});
test('nematic responds to boundary geometry, anchoring and seed; empty mask stays finite',()=>{
 const s=source((x,y)=>x>4&&x<37&&y>4&&y<33),g=I.nematicGrid(s,D,17),same=I.nematicGrid(s,D,17),other=I.nematicGrid(s,D,18);I.relax(g,70);I.relax(same,70);I.relax(other,70);assert.deepEqual(Array.from(g.qx),Array.from(same.qx));assert.notDeepEqual(Array.from(g.qx),Array.from(other.qx));
 const weak=I.nematicGrid(s,{...D,nematicAnchor:0},17),strong=I.nematicGrid(s,{...D,nematicAnchor:6},17);I.relax(weak,100);I.relax(strong,100);const error=g=>g.active.reduce((e,i)=>e+g.boundary[i]*((g.qx[i]-g.gx[i])**2+(g.qy[i]-g.gy[i])**2),0);assert.ok(error(strong)<error(weak));
 const hole=I.nematicGrid(source((x,y)=>x>4&&x<37&&y>4&&y<33&&!(x>15&&x<25&&y>12&&y<25)),D,17);I.relax(hole,70);assert.notDeepEqual(Array.from(g.qx),Array.from(hole.qx));const empty=I.nematicGrid(source(()=>false),D,17);I.relax(empty,20);assert.equal(I.energy(empty),0);
});
test('Jones propagation conserves norm, agrees with crossed formula, and complementary analyzers sum to one',()=>{
 for(let j=0;j<80;j++){const t=j*.137,d=j*.229,p=j*.078,e=I.retarder(.2,-.3,.6,.7,t,d);near(e.reduce((a,v)=>a+v*v,0),.04+.09+.36+.49);const cross=I.jones(t,d,p,'crossed'),parallel=I.jones(t,d,p,'parallel');near(cross,Math.sin(2*(t-p))**2*Math.sin(d/2)**2);near(cross+parallel,1);const comp=I.jones(t,d,p,'compensated');assert.ok(comp>=-1e-12&&comp<=1+1e-12);near(I.jones(t+Math.PI,d,p,'crossed'),cross);}
 near(I.jones(0,0,0,'crossed'),0);near(I.jones(0,0,0,'parallel'),1);near(I.jones(0,0,0,'compensated'),.5);near(I.jones(Math.PI/4,Math.PI,0,'crossed'),1);
});

test('two independent kernels and unique schemas have complete host paths',()=>{
 const api=box.TypeDeformerOrderMatter,html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),field=fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8');
 assert.notEqual(api.renderers.quasicrystalBody,api.renderers.nematicFilm);assert.equal(new Set(api.ids.map(id=>api.schemas[id].short)).size,2);
 assert.ok(html.includes('<script src="order-matter-operators.js"></script>'));assert.ok(field.includes('Object.assign(renderers,orderMatter.renderers)'));
 for(const id of api.ids){assert.ok(html.includes("fieldMaterialRenderer('"+id+"')"));for(const k of Object.keys(api.schemas[id].defaults))assert.ok(html.includes('id="p'+k[0].toUpperCase()+k.slice(1)+'"'));}
});
