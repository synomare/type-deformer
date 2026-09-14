import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareResonantDomain,finishResonantField,normalizeResonantSettings,RESONANT_STARTS} from './core.mjs';
import {renderResonantTransportStudy as render} from './transport-study.mjs';

function fixture(rows,pad=24){
  const w=Math.max(...rows.map(r=>r.length))+pad*2,h=rows.length+pad*2,alpha=new Uint8ClampedArray(w*h);
  rows.forEach((row,y)=>[...row].forEach((c,x)=>{alpha[(y+pad)*w+x+pad]=c==='#'?255:c==='+'?160:0;}));
  return prepareResonantDomain(alpha,w,h);
}
function constant(d,real,imag,settings={}){
  return {domain:d,settings:normalizeResonantSettings(settings),normalizedReal:new Float64Array(d.count).fill(real),normalizedImag:new Float64Array(d.count).fill(imag),scale:new Float64Array(d.components.length).fill(Math.hypot(real,imag))};
}
// Inverse sampling of a rigidly translated raster-cell support. Independent of
// the production vertex averaging, triangle transform or barycentric rasteriser.
function rigidOracle(d,dx,dy,grid=2){
  const out=new Uint8ClampedArray(d.alpha.length),w=d.width,h=d.height;
  const at=(x,y)=>x<0||x>=w||y<0||y>=h?0:d.alpha[y*w+x];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let sum=0;
    for(let oy=0;oy<grid;oy++)for(let ox=0;ox<grid;ox++){
      const sy=(oy+.5)/grid-.5,sx=(ox+.5)/grid-.5;
      const u=x+sx-dx,v=y+sy-dy;
      // The transport support is the union of closed ink cells. A sample on
      // a cell boundary can belong to ink on either side, not just floor().
      const cx=Math.floor(u+.5),cy=Math.floor(v+.5),xs=u+.5===cx?[cx,cx-1]:[cx],ys=v+.5===cy?[cy,cy-1]:[cy];
      if(!xs.some(xx=>ys.some(yy=>at(xx,yy))))continue;
      const ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy;
      sum+=at(ix,iy)*(1-fx)*(1-fy)+at(ix+1,iy)*fx*(1-fy)+at(ix,iy+1)*(1-fx)*fy+at(ix+1,iy+1)*fx*fy;
    }
    out[y*w+x]=Math.round(sum/(grid*grid));
  }
  return out;
}

test('mesh raster matches independent rigid inverse oracle in four directions, including alpha edges',()=>{
  const d=fixture(['.++...','+###..','##.##.','+###.+','.++...']);
  for(const [axis,dx,dy] of [[0,4,2],[90,-2,4],[180,-4,-2],[-90,2,-4]]){
    const f=constant(d,.5,.25,{axis}),out=render(d,f,null,{excursion:8,cut:0});
    assert.deepEqual(out,rigidOracle(d,dx,dy));
  }
});

test('source invariants, alpha linearity and empty/unexcited source',()=>{
  const d=fixture(['.###.','##.##','.###.']),copy=d.alpha.slice(),f=constant(d,.5,.25);
  assert.deepEqual(render(d,null,null,{excursion:0,cut:0}),copy);
  assert.deepEqual(render(d,constant(d,0,0),null,{excursion:96,cut:1}),copy);
  const first=render(d,f,null,{excursion:8,cut:0}),half=prepareResonantDomain(Uint8ClampedArray.from(d.alpha,v=>v?128:0),d.width,d.height);
  const second=render(half,constant(half,.5,.25),null,{excursion:8,cut:0});
  assert.ok(first.every((v,i)=>Math.abs(second[i]-v*128/255)<=1));
  assert.deepEqual(d.alpha,copy);
  const empty=fixture(['...']);assert.ok(render(empty,null,null).every(v=>!v));
});

test('actual solved wave is deterministic, looped, static at Motion 0, and phase responsive',()=>{
  const d=fixture(['#######','##...##','#######','##...##','#######'],120),s=RESONANT_STARTS.chamber,f=finishResonantField(d,s);
  const a=render(d,f,null,s,0);
  assert.deepEqual(a,render(d,f,null,s,0));assert.deepEqual(a,render(d,f,null,s,1));
  assert.deepEqual(render(d,f,null,{motion:0},.2),render(d,f,null,{motion:0},.7));
  assert.notDeepEqual(a,render(d,f,null,s,.25));
  assert.notDeepEqual(a,render(d,f,null,{cut:0},0));
  assert.notDeepEqual(a,render(d,f,null,{bands:16},0));
  assert.notDeepEqual(a,render(d,f,null,{aperture:.6},0));
});

test('144 paint endpoint combinations remain finite; no reduced declared ranges',()=>{
  const d=fixture(['####','#..#','####'],170),f=finishResonantField(d);let count=0;
  for(const excursion of [-96,0,96])for(const cut of [0,1])for(const bands of [1,16])for(const aperture of [.015,.6])for(const motion of [0,1])for(const phase of [0,.25,.75]){
    const out=render(d,f,null,{excursion,cut,bands,aperture,motion},phase);
    assert.equal(out.length,d.alpha.length);assert.ok(out.every(v=>Number.isFinite(v)&&v>=0&&v<=255));count++;
  }
  assert.equal(count,144);
});

test('field, phase, sample-budget and padding errors fail explicitly without partial output',()=>{
  const d=fixture(['###','###']),f=constant(d,.5,.25);
  assert.throws(()=>render(d,null,null),/mismatch/);
  assert.throws(()=>render(d,{...f,normalizedReal:new Float64Array(1)},null),/mismatch/);
  assert.throws(()=>render(d,f,null,{pitch:120}),/settings changed/);
  assert.throws(()=>render(d,f,null,{},NaN),/phase/);
  assert.throws(()=>render(d,f,null,{},0,{maxSamples:1}),/budget exceeded/);
  assert.throws(()=>render(d,f,null,{},0,{maxSamples:NaN}),/budget/);
  assert.throws(()=>render(d,f,null,{},0,{maxSamples:64000001}),/budget/);
  const small=fixture(['###','###'],2);assert.throws(()=>render(small,constant(small,1,0),null,{excursion:96,cut:0}),/padding/);
  assert.throws(()=>render(d,constant(d,NaN,0),null),/invalid wave/);
});

test('dense sampling diagnostics match fractional rigid inverse oracles without changing native bypass',()=>{
  const d=fixture(['.++...','+###..','##.##.','+###.+','.++...']);
  for(const samplesPerAxis of [2,4,8]){
    for(const [dx,dy] of [[.375,-.625],[-1.25,.125],[.875,1.375],[0,0]]){
      const f=constant(d,dx,dy,{axis:0});
      const actual=render(d,f,null,{excursion:1,cut:0},0,{samplesPerAxis});
      const expected=dx||dy?rigidOracle(d,dx,dy,samplesPerAxis):d.alpha;
      const errors=[];actual.forEach((v,i)=>{if(v!==expected[i])errors.push([i,v,expected[i]]);});
      assert.equal(errors.length,0,JSON.stringify({samplesPerAxis,dx,dy,errors:errors.slice(0,12)}));
    }
    assert.deepEqual(render(d,null,null,{excursion:0,cut:0},.2,{samplesPerAxis}),d.alpha);
  }
  const f=constant(d,.5,.25);
  for(const samplesPerAxis of [0,1,3,16,NaN,'4'])assert.throws(()=>render(d,f,null,{},0,{samplesPerAxis}),/sampling grid/);
  assert.throws(()=>render(d,f,null,{},0,{samplesPerAxis:8,maxSamples:1}),/work budget/);
  // Reuse valid sparse ink in a large paper domain: storage must fail before
  // allocating the dense buffer or starting the triangle loop.
  const alpha=new Uint8ClampedArray(1024*1024);alpha[512*1024+512]=255;
  const large=prepareResonantDomain(alpha,1024,1024);
  assert.throws(()=>render(large,constant(large,.5,.25),null,{},0,{samplesPerAxis:8}),/storage budget/);
});
