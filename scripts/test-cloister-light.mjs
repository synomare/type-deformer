// Actual renderer/control math, dependency-free. Native Canvas has a separate
// source-versioned proof in .codex/prototypes/cloister-fold/compare.mjs.
import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');
function extract(name){const start=html.indexOf(`      function ${name}(`);assert.ok(start>=0,name);const tail=html.slice(start);return tail.slice(0,tail.indexOf('\n      }')+8);}
const defaults={};for(const key of ['Relief','Planes','Fold','Axis','Perspective','Crease'])defaults['cloister'+key]=+html.match(new RegExp(`cloister${key}: (-?[0-9.]+)`))[1];
const W=100,H=120,mask={getContext:()=>({getImageData:()=>({data:[]})})};
let strength=1,nonempty=true,layers,captured,legacy=0;
function ctx(name){
  const log=layers[name]=[], stack=[],c={canvas:{width:W,height:H},globalAlpha:1};
  for(const op of ['setTransform','beginPath','moveTo','lineTo','closePath','clip','clearRect','fillRect','stroke']) c[op]=(...args)=>{assert.ok(args.every(Number.isFinite),op);log.push([op,...args]);};
  c.save=()=>stack.push({alpha:c.globalAlpha,blend:c.globalCompositeOperation});
  c.restore=()=>{const s=stack.pop();assert.ok(s);c.globalAlpha=s.alpha;c.globalCompositeOperation=s.blend;};
  c.fillRect=(...args)=>{assert.ok(args.every(Number.isFinite));c.canvas.ink=c.fillStyle;log.push(['fillRect',...args]);};
  c.drawImage=(_image,...args)=>{assert.ok(args.every(Number.isFinite));assert.ok(Number.isFinite(c.globalAlpha)&&c.globalAlpha>=0&&c.globalAlpha<=1);log.push(['draw',c.globalAlpha,...args,_image.ink||null]);};
  return c;
}
const s=vm.createContext({Math,params:{},compositionState:{},BATCH_PARAM_OPTIONS:{cloisterTessellation:['miura','accordion','diamond','fan','strips']},
  surfaceChoice:()=>s.params.cloisterTessellation,surfaceAggregate:(_g,_o,_k,v)=>({value:v,weight:strength,strength}),
  buildSurfaceMask:()=>mask,compositeSurfaceSource:()=>{},surfaceBoundaryDistance:()=>({bounds:nonempty?[12,16,88,105]:null}),
  surfaceEffectColor:()=> '#7057ff',surfaceHexRgb:()=>[112,87,255],
  surfaceScratch:(name)=>{const c=ctx(name);return {canvas:c.canvas,ctx:c};},
  renderCloisterFoldLegacy:()=>legacy++,capture:f=>{captured=JSON.parse(JSON.stringify(f));}});
new vm.Script(['surfaceToneCss','cloisterFacetTone','renderCloisterFold'].map(extract).join('\n').replace('var orderedFacets =','capture(facets); var orderedFacets =')).runInContext(s);
const ramp=[-.84,-.62,-.4,-.14,.08,.3,.54];
for(let i=0;i<7;i++)assert.ok(Math.abs(s.cloisterFacetTone(-.82+1.54*i/6)-ramp[i])<1e-14,'preserve each original ramp knot');
assert.equal(s.cloisterFacetTone(-100),ramp[0]);assert.equal(s.cloisterFacetTone(100),ramp[6]);
let last=-Infinity;
for(let i=0;i<=10000;i++){const t=-1+2*i/10000,v=s.cloisterFacetTone(t);assert.ok(v>=last&&v>=ramp[0]&&v<=ramp[6]);last=v;}
// At every old rounding threshold, continuous transfer has no finite jump.
for(let i=0;i<6;i++){
  const t=-.82+1.54*(i+.5)/6,e=1e-9;
  assert.ok(Math.abs(s.cloisterFacetTone(t+e)-s.cloisterFacetTone(t-e))<3e-9);
  const old=t=>ramp[Math.max(0,Math.min(6,Math.round((t+.82)/1.54*6)))];
  assert.ok(Math.abs(old(t+e)-old(t-e))>.2,'negative control catches old quantization');
}
function render(mode,overrides={},phase=0,enabled=true){
  layers={};captured=[];s.params={...defaults,...overrides,cloisterTessellation:mode};s.compositionState={phase,enabled};
  s.renderCloisterFold(ctx('target'),[{}],W,H,1,{s:1},{},false);return {facets:captured,layers};
}
const endpoints={cloisterRelief:[0,4],cloisterPlanes:[1,32],cloisterFold:[-2,2],cloisterAxis:[-180,180],cloisterPerspective:[0,4],cloisterCrease:[0,64]};
const profiles=[{},...Object.entries(endpoints).flatMap(([key,values])=>values.map(v=>({[key]:v}))),{cloisterRelief:4,cloisterPlanes:32,cloisterFold:2,cloisterPerspective:4,cloisterCrease:64}];
let states=0,maxFacets=0;
for(const mode of ['miura','accordion','diamond','fan'])for(const p of profiles){
  const zero=render(mode,p),one=render(mode,p,1);assert.deepEqual(one,zero,'exact phase endpoints');
  assert.deepEqual(render(mode,p,.39,false),zero,'disabled motion is neutral');
  assert.deepEqual(render(mode,p,-.25),render(mode,p,.75),'negative phase wraps');
  assert.ok(zero.facets.length>0&&zero.facets.length<=144);maxFacets=Math.max(maxFacets,zero.facets.length);
  const inks=Object.keys(zero.layers).filter(k=>k.includes('piecewise-tone-'));
  assert.ok(inks.length>0&&inks.length<=7,'bounded exact-colour reuse');
  assert.deepEqual(zero.layers['cloister-fold-piecewise-body'].filter(c=>c[0]==='draw').map(c=>c.at(-1)),
    zero.facets.slice().sort((a,b)=>a.depth-b.depth).map(f=>s.surfaceToneCss([112,87,255],f.tone)),
    'LRU hits and evictions retain the exact unquantized facet colours');
  const left=render(mode,p,-1e-6).facets,right=render(mode,p,1e-6).facets;
  left.forEach((f,i)=>{assert.ok(Number.isFinite(f.tone)&&f.tone>=ramp[0]&&f.tone<=ramp[6]);assert.ok(Math.abs(f.tone-right[i].tone)<1e-5);});
  strength=.37;const semi=render(mode,p);assert.deepEqual(semi.facets,zero.facets,'opacity does not alter geometry or light');
  assert.ok(semi.layers['cloister-fold-piecewise-body'].filter(c=>c[0]==='draw').every(c=>c[1]===.37));
  strength=1;states++;
}
for(const mode of ['miura','accordion','diamond','fan']){
  const a=render(mode,{cloisterFold:-1e-6}).facets,b=render(mode,{cloisterFold:1e-6}).facets;
  assert.equal(a.length,b.length);
  a.forEach((facet,i)=>facet.vertices.forEach((v,k)=>{
    const w=b[i].vertices[k];assert.ok(Math.hypot(v.dest.x-w.dest.x,v.dest.y-w.dest.y)<1e-6,'Fold crosses zero without a geometric jump: '+mode);
  }));
  assert.ok(render(mode,{cloisterFold:0}).facets.every(f=>f.vertices.every(v=>v.z===0)),'Fold zero is a flat sheet: '+mode);
}
render('strips');assert.equal(legacy,1,'legacy dispatch preserved');
strength=0;assert.equal(render('miura').facets.length,0);
strength=1;nonempty=false;assert.equal(render('fan').facets.length,0);
console.log(JSON.stringify({status:'pass',states,maxFacets,scope:'actual tone/renderer math and finite Canvas commands; not raster compositing, editor integration, browser or device QA'}));
