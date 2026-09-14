import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../wave-growth-operators.js';
const api=globalThis.TypeDeformerWaveGrowth,{fft2,propagate,opticalField,thin,aggregate}=api.internals;
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const energy=(a,b)=>a.reduce((sum,v,i)=>sum+v*v+b[i]*b[i],0);
function specimen(){const w=88,h=72,scale=2,alpha=new Float32Array(w*h);for(let y=14;y<56;y++)for(let x=16;x<62;x++)if(!(x>28&&x<48&&y>25&&y<45))alpha[y*w+x]=1;for(let y=16;y<20;y++)for(let x=70;x<74;x++)alpha[y*w+x]=1;return {w,h,scale,pad:7,alpha};}
test('complex 2D FFT matches independent direct DFT and inverts rectangular grids',()=>{
  const w=8,h=4,re=Float64Array.from({length:w*h},(_,i)=>Math.sin(i*.71)+i*.02),im=Float64Array.from(re,(_,i)=>Math.cos(i*.3)),r=re.slice(),q=im.slice();fft2(r,q,w,h,false);
  for(let v=0;v<h;v++)for(let u=0;u<w;u++){let er=0,ei=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=y*w+x,angle=-2*Math.PI*(u*x/w+v*y/h),c=Math.cos(angle),s=Math.sin(angle);er+=re[at]*c-im[at]*s;ei+=re[at]*s+im[at]*c;}near(r[v*w+u],er);near(q[v*w+u],ei);}
  fft2(r,q,w,h,true);r.forEach((v,i)=>{near(v,re[i]);near(q[i],im[i]);});assert.throws(()=>fft2(new Float64Array(6),new Float64Array(6),3,2,false),/powers of two/);
});
test('Fresnel propagator preserves energy, reverses, and matches a single plane wave',()=>{
  const w=16,h=8,re=new Float64Array(w*h),im=new Float64Array(w*h),u=3,v=-2,beta=23;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let phase=2*Math.PI*(u*x/w+v*y/h);re[y*w+x]=Math.cos(phase);im[y*w+x]=Math.sin(phase);}
  const r=re.slice(),q=im.slice(),e=energy(re,im);propagate(re,im,w,h,beta);near(energy(re,im),e,1e-8);const delta=-Math.PI*beta*((u/w)**2+(v/h)**2);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const phase=2*Math.PI*(u*x/w+v*y/h)+delta;near(re[y*w+x],Math.cos(phase));near(im[y*w+x],Math.sin(phase));}
  propagate(re,im,w,h,-beta);re.forEach((value,i)=>{near(value,r[i]);near(im[i],q[i]);});propagate(re,im,w,h,15,.08);assert.ok(energy(re,im)<e*.001,'pupil removes the high-frequency carrier');
});
test('glyph transmission responds to geometry and phase, and equal wavelengths are identical',()=>{
  const s=specimen(),p={...api.schemas.diffractiveGlyph.defaults,diffractionDistance:0,diffractionPhase:0};const zero=opticalField(s,p,1);near(zero.intensity[16*zero.w+11],1,1e-6);near(zero.intensity[17*zero.w+19],0,1e-6);
  p.diffractionDistance=16;const a=opticalField(s,p,1),same=opticalField(s,p,1);assert.deepEqual(a.intensity,same.intensity);assert.notDeepEqual(a.intensity,zero.intensity);p.diffractionPhase=2.1;const changed=opticalField(s,p,1);assert.notDeepEqual(a.intensity,changed.intensity);assert.ok(changed.intensity.every(Number.isFinite));
  const shape={...s,alpha:s.alpha.slice()};for(let y=10;y<32;y++)for(let x=32;x<38;x++)shape.alpha[y*s.w+x]=0;assert.notDeepEqual(opticalField(shape,p,1).intensity,changed.intensity);
});
test('thinning retains tiny components, endpoints and the counter of a ring',()=>{
  const w=20,h=20,mask=new Float32Array(w*h);for(let y=3;y<15;y++)for(let x=3;x<15;x++)if(x<6||x>11||y<6||y>11)mask[y*w+x]=1;mask[17*w+17]=mask[17*w+18]=mask[18*w+17]=mask[18*w+18]=1;
  const a=thin(mask,w,h);assert.ok(a.reduce((s,v)=>s+v,0)>25);assert.ok([17*w+17,17*w+18,18*w+17,18*w+18].some(i=>a[i]));for(let y=6;y<=11;y++)for(let x=6;x<=11;x++)assert.equal(a[y*w+x],0);a.forEach((v,i)=>{if(v)assert.equal(mask[i],1);});assert.equal(thin(new Float32Array(400),w,h).reduce((s,v)=>s+v,0),0);
});
test('aggregation has ordered neighboring parents, deterministic growth and distinct adhesion regimes',()=>{
  const s=specimen(),defaults={...api.schemas.dendriteCast.defaults,dendriteGrain:1,dendriteReach:0,dendriteGrowth:.4},results=[];
  for(const mode of api.schemas.dendriteCast.options.dendriteMode){const p={...defaults,dendriteMode:mode},a=aggregate(s,p,17),again=aggregate(s,p,17);assert.deepEqual(a.deposits,again.deposits);assert.equal(new Set(a.deposits).size,a.deposits.length);assert.ok(a.deposits.length>20);assert.ok(a.deposits.length<=a.target);assert.ok(a.rootCount>5);
    for(const i of a.deposits){const parent=a.parents[i];assert.ok(parent>=0);assert.ok(a.occupied[parent]);assert.ok(a.order[parent]<a.order[i]);const dx=Math.abs(i%a.w-parent%a.w),dy=Math.abs(Math.floor(i/a.w)-Math.floor(parent/a.w));assert.ok(mode==='frost'?dx+dy===1:Math.max(dx,dy)===1);}
    assert.notDeepEqual(a.deposits,aggregate(s,p,19).deposits);results.push(a.deposits);
  }
  assert.notDeepEqual(results[0],results[1]);assert.notDeepEqual(results[0],results[2]);
});
test('every extreme remains bounded and finite; empty source produces no deposits',()=>{
  const s=specimen();for(const id of api.ids){const schema=api.schemas[id];for(const end of [0,1]){const p={...schema.defaults};for(const k of Object.keys(schema.limits))p[k]=schema.limits[k][end];if(id==='diffractiveGlyph'){const f=opticalField(s,p,1.2);assert.ok(f.intensity.every(v=>Number.isFinite(v)&&v>=0));}else{const a=aggregate(s,p,17);assert.ok(a.visits<=16000000);assert.ok(a.deposits.length<=a.target);}}}
  const empty={...s,alpha:new Float32Array(s.alpha.length)},a=aggregate(empty,api.schemas.dendriteCast.defaults,17);assert.equal(a.deposits.length,0);assert.equal(a.rootCount,0);
});
test('two independent kernels and unique schemas have a complete host path',()=>{
  assert.notEqual(api.renderers.diffractiveGlyph,api.renderers.dendriteCast);assert.equal(new Set(api.ids.map(id=>api.schemas[id].short)).size,2);
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),field=fs.readFileSync(new URL('../field-material-operators.js',import.meta.url),'utf8');
  assert.match(html,/<script src="wave-growth-operators.js"><\/script>/);assert.match(field,/Object.assign\(renderers,waveGrowth.renderers\)/);
  for(const id of api.ids){assert.ok(html.includes(`fieldMaterialRenderer('${id}')`));for(const k of Object.keys(api.schemas[id].defaults))assert.ok(html.includes('id="p'+k[0].toUpperCase()+k.slice(1)+'"'));}
});
