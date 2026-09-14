import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const block=html.match(/^      \/\/ BEGIN CONFORMAL TYPE GENERATED\n[\s\S]*?^      \/\/ END CONFORMAL TYPE GENERATED/m)[0];
const elements=new Map(), rafs=new Map();let raf=0, native=0, history=0;
const params={fontFamily:'Synthetic',fontWeight:400,fontSize:192,conformalAmount:.82,conformalPower:-1,
  conformalSpiral:0,conformalAngle:-35,conformalMotion:.55};
let fx=1;
const runtime=vm.createContext({studioRendererMode:false,params,compositionState:{enabled:false,phase:0},
  surfaceGlyphStrength:(g,id)=>g.surface?.[id]||0,surfaceOutputOpacity:()=>fx,
  surfaceEffectColor:()=> '#000',drawSurfaceGlyph(){native++;},
  scheduleSurfaceFxDraw(){},scheduleCompositionDraw(){},
  document:{getElementById(id){if(!elements.has(id))elements.set(id,{hidden:false,setAttribute(){}});return elements.get(id);}},
  requestAnimationFrame(fn){rafs.set(++raf,fn);return raf;},cancelAnimationFrame(id){rafs.delete(id);},
  editableBatchProfile:()=>params,pushHistory(){history++;},refreshBatchProfileControls(){},applyAllOperatorVisuals(){},markAutosaveDirty(){}
});
new vm.Script(block).runInContext(runtime);
const compiled=runtime.ConformalType.compileConformalGlyph(runtime.ConformalType.prepareConformalGlyph([
  {points:[{x:0,y:0},{x:30,y:0},{x:30,y:50},{x:0,y:50}]}
]));
const data={compiled,pointCount:4,advance:30,ascent:50,descent:0,middleOffset:20};
let loads=0;
runtime.conformalGlyphData=()=>{loads++;return data;};
const g=ch=>({ch,surface:{conformalType:1},opacity:1,scaleX:1,scaleY:1});
const a=g('A'),b=g('B');
runtime.conformalPrepare([a,b]);runtime.conformalPool.advance();runtime.conformalPool.advance();
const before=JSON.stringify(runtime.conformalPool.state());
runtime.conformalAssertReady([a]);
assert.equal(JSON.stringify(runtime.conformalPool.state()),before,'Subset export readiness must not evict other active glyph sources');
assert.equal(runtime.conformalPool.read(runtime.conformalSourceKey('B')),data);
assert.throws(()=>runtime.conformalAssertReady([g('missing')]),e=>e.code==='CONFORMAL_PENDING');
assert.equal(JSON.stringify(runtime.conformalPool.state()),before,'Missing export source must not mutate live requests');
runtime.conformalRenderError='old preview failed';
assert.doesNotThrow(()=>runtime.conformalAssertReady([a]),'A stale preview error cannot veto a fresh strict render');
runtime.conformalPrepare([]);assert.equal(runtime.conformalPool.state().total,0);assert.equal(rafs.size,0);
assert.equal(runtime.conformalRenderError,'');assert.equal(elements.get('conformalWorkStatus').hidden,true);
params.conformalAmount=0;assert.equal(runtime.conformalRequests([a]).length,0);assert.doesNotThrow(()=>runtime.conformalAssertReady([a]));
params.conformalAmount=.8;params.conformalPower=1;assert.equal(runtime.conformalRequests([a]).length,0);
params.conformalPower=-1;fx=0;assert.equal(runtime.conformalRequests([a]).length,0);assert.doesNotThrow(()=>runtime.conformalAssertReady([a]));fx=1;
runtime.conformalPrepare([a,b]);runtime.conformalPool.advance();runtime.conformalPool.advance();
runtime.conformalRenderError='old preview failed';
runtime.conformalPrepare([]);assert.equal(runtime.conformalRenderError,'');
let sourceFailure=true;
runtime.conformalGlyphData=ch=>{if(ch==='bad'&&sourceFailure)throw new Error('transient source failure');return data;};
runtime.conformalPrepare([g('bad'),a]);runtime.conformalPool.advance();runtime.conformalPool.advance();
assert.doesNotThrow(()=>runtime.conformalAssertReady([a]),'An unrelated failed source must not block a ready subset');
assert.throws(()=>runtime.conformalAssertReady([g('bad')]),e=>e.code==='CONFORMAL_ERROR');
sourceFailure=false;runtime.conformalRetry();runtime.conformalPool.advance();runtime.conformalAssertReady([a,g('bad')]);
const extract=name=>html.match(new RegExp('^      function '+name+'\\([\\s\\S]*?^      \\}', 'm'))[0];
Object.assign(runtime,{surfaceFxCtx:{setTransform(){},clearRect(){}},metrics:[],differentialPrepare(){},auxeticPrepare(){},counterformResetInactive(){},marblingPrepare(){}});
new vm.Script(extract('renderSurfaceFxPreview')).runInContext(runtime);
runtime.renderSurfaceFxPreview(0);assert.equal(runtime.conformalPool.state().total,0,'empty-text branch releases Conformal work');
runtime.conformalPrepare([a]);
Object.assign(runtime,{metrics:[a],metricsDirty:false,snapshotGlyphs:()=>[a],surfaceAnyEffectPresent:()=>false,
  surfaceEffectPresent:()=>false,surfaceAggregate:()=>({value:0}),blobTrackState:{blobs:[]},
  window:{matchMedia:()=>({matches:false})},surfaceFxLastPaint:0,surfaceFxCanvas:{hidden:false,width:10,height:10}});
runtime.renderSurfaceFxPreview(0);assert.equal(runtime.conformalPool.state().total,0,'no-active-FX branch releases Conformal work');
assert.equal(runtime.surfaceFxCanvas.hidden,true);assert.equal(rafs.size,0);
assert.match(html,/if \(!surfaceFxCtx \|\| !metrics.length\) \{ differentialPrepare\(\[\]\); conformalPrepare\(\[\]\); auxeticPrepare\(\[\]\); counterformResetInactive\(\[\]\); return; \}/);
assert.match(html,/if \(!hasEffects\) \{\s*marblingPrepare\(\[\]\);\s*differentialPrepare\(\[\]\); conformalPrepare\(\[\]\); auxeticPrepare\(\[\]\);/);
console.log('Conformal lifecycle: read-only subset/missing export preflight, native identity and muted-FX bypass, stale-error isolation, release/cancel/status passed (VM, not browser).');
