import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g,'\n');
const catalogRuntime=vm.createContext({});catalogRuntime.globalThis=catalogRuntime;
new vm.Script(fs.readFileSync(new URL('../operator-catalog.js',import.meta.url),'utf8')).runInContext(catalogRuntime);
const generated = html.match(/^      \/\/ BEGIN DIFFERENTIAL TYPE GENERATED\n[\s\S]*?^      \/\/ END DIFFERENTIAL TYPE GENERATED/m)?.[0];
assert.ok(generated);
const extract = name => {
  const result = html.match(new RegExp('^      (?:async )?function '+name+'\\([\\s\\S]*?^      \\}', 'm'));
  assert.ok(result, name); return result[0];
};
let paintCalls = [], nativeCalls = 0, loads = 0, history = 0, autosaves = 0;
const elements = new Map(), rafs = new Map(); let nextRaf=0;
const ctx = () => new Proxy({canvas:{width:400,height:400},globalAlpha:1,save(){paintCalls.push(['save']);},restore(){paintCalls.push(['restore']);}}, {
  get(target,key) { if(key in target)return target[key]; return (...args)=>paintCalls.push([key,...args]); }
});
const work = ctx(), target = ctx();
const params = { fontWeight:400,fontFamily:'Mock serif',fontSize:192,seed:31,vertical:false,
  differentialAge:.05,differentialGrain:3.5,differentialTension:.35,differentialMemory:.0015,
  differentialPatch:.8,differentialArea:1.1,differentialMotion:1,differentialColor:'#123456' };
const runtime = vm.createContext({ performance, params, compositionState:{enabled:false,phase:0},
  surfaceGlyphStrength:(g,id)=>g.surface?.[id]||0,
  surfaceEffectColor:()=>params.differentialColor,
  surfaceScratch:()=>({ctx:work,canvas:work.canvas}),
  drawSurfaceGlyph:()=>{nativeCalls++;}, baselineOffset:()=>32,
  conformalPrepare(){}, conformalAssertReady(){}, auxeticPrepare(){}, auxeticAssertReady(){}, counterformResetInactive(){}, marblingPrepare(){}, marblingAssertReady(){},
  scheduleSurfaceFxDraw(){}, scheduleCompositionDraw(){},
  document:{getElementById(id){if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',setAttribute(){}});return elements.get(id);}},
  requestAnimationFrame(fn){rafs.set(++nextRaf,fn);return nextRaf;}, cancelAnimationFrame(id){rafs.delete(id);},
  editableBatchProfile:()=>params,pushHistory(){history++;},refreshBatchProfileControls(){},applyAllOperatorVisuals(){},markAutosaveDirty(){autosaves++;}
});
new vm.Script(generated+'\n'+extract('spectralGlyphFrame')).runInContext(runtime);
const data = { contours:[
  {area:1600,points:[{x:0,y:-40},{x:40,y:-40},{x:40,y:0},{x:0,y:0}]},
  {area:-400,points:[{x:10,y:-30},{x:10,y:-10},{x:30,y:-10},{x:30,y:-30}]},
  {area:16,points:[{x:45,y:-40},{x:49,y:-40},{x:49,y:-36},{x:45,y:-36}]}
],advance:52,ascent:40,descent:0,middleOffset:20 };
let requestedFont;
runtime.differentialGlyphData=(ch,fontSpec)=>{loads++;requestedFont=fontSpec;return data;};
const g = {ch:'B',surface:{differentialType:1},opacity:.7,x:10,y:20,w:52,h:40,ox:10,oy:20,tx:13,ty:-8,rot:17,scaleX:1.2,scaleY:.8,skewX:9,skewY:0};
const lazyRequest=runtime.differentialRequests([g])[0];
params.fontFamily='Different font before next task';lazyRequest.load();
assert.equal(requestedFont.font,'400 192px Mock serif','Deferred mask load must capture the requested font, not later params');
assert.equal(requestedFont.key,lazyRequest.sourceKey);params.fontFamily='Mock serif';loads=0;
const L={dx:50,dy:70,s:1.3};
const render = glyphs => runtime.renderDifferentialType(target,glyphs,400,400,1,L,{},false);
runtime.differentialPrepare([g,{...g,ch:' '},{...g,tx:100}]);
assert.equal(runtime.differentialController.state.total,1,'Repeated instances share preparation; whitespace allocates nothing');
assert.equal(loads,0);
assert.throws(()=>runtime.differentialAssertReady([g]),err=>err.code==='GROWTH_PENDING');
render([g]);assert.equal(nativeCalls,1,'Pending preview remains visible, explicitly native');
for(let i=0;runtime.differentialController.state.pending;i++){runtime.differentialController.advance(12);assert.ok(i<10000);}
runtime.differentialUpdateStatus();assert.match(elements.get('differentialWorkText').textContent,/準備できました/);
assert.equal(loads,1);runtime.differentialAssertReady([g]);
paintCalls=[];nativeCalls=0;render([g]);assert.equal(nativeCalls,0);
assert.ok(paintCalls.some(c=>c[0]==='clip'),'Negative counters cannot paint outside positive body');
assert.ok(paintCalls.some(c=>c[0]==='fill'&&c[1]==='evenodd'));
assert.equal(work.fillStyle,params.differentialColor);assert.equal(work.globalAlpha,.7);
const geometry=()=>JSON.stringify(paintCalls.filter(c=>['moveTo','lineTo','closePath'].includes(c[0])));
const originalGeometry=geometry(); L.s=3.7;L.dx=-1000; paintCalls=[];render([g]);
assert.equal(geometry(),originalGeometry,'Camera cannot become an input to the growth solver');
runtime.compositionState.enabled=true;runtime.compositionState.phase=0;paintCalls=[];render([g]);const start=geometry();
runtime.compositionState.phase=1;paintCalls=[];render([g]);assert.equal(geometry(),start,'Compose loop seam');
runtime.compositionState.phase=.5; nativeCalls=0;render([g]);assert.equal(nativeCalls,1,'Native zero at the rewind endpoint');
runtime.compositionState.phase=.25;paintCalls=[];render([g]);assert.notEqual(geometry(),start,'Actual intermediate growth, not a rigid translation');
g.surface.differentialMotion=0;paintCalls=[];render([g]);assert.equal(geometry(),start,'Motion zero is fixed');
runtime.compositionState.enabled=false;g.surface.differentialAge=0;nativeCalls=0;render([g]);assert.equal(nativeCalls,1);
runtime.differentialPrepare([g]);assert.equal(runtime.differentialController.state.total,0);
delete g.surface.differentialAge;delete g.surface.differentialMotion;
runtime.differentialPrepare([g]);for(let i=0;runtime.differentialController.state.pending;i++){runtime.differentialController.advance(12);assert.ok(i<10000);}
const key=runtime.differentialSourceKey('B'); runtime.differentialInvalidateFonts();
assert.notEqual(runtime.differentialSourceKey('B'),key);assert.equal(runtime.differentialController.state.total,0);
assert.throws(()=>runtime.differentialAssertReady([g]),err=>err.code==='GROWTH_PENDING');
runtime.applyDifferentialTypePreset('labyrinth');assert.equal(params.differentialAge,3);assert.equal(params.differentialMemory,.0008);
assert.equal(history,1);assert.equal(autosaves,1);runtime.applyDifferentialTypePreset('invalid');assert.equal(history,1);

// Execute the real Surface entry guard. No Canvas or browser claim: effects
// after this guard are excluded here and tested above with drawing spies.
runtime.compositionCanvas={};runtime.surfaceFxCanvas={};runtime.surfaceAnyEffectPresent=()=>false;
runtime.sculptureEditor={clearInactive(){}}; // Scroll lifecycle is exercised by its own worker/browser tests.
new vm.Script(extract('renderSurfaceFxLayer')).runInContext(runtime);
assert.throws(()=>runtime.renderSurfaceFxLayer(target,[g],1,L,{},false),err=>err.code==='GROWTH_PENDING');
assert.doesNotThrow(()=>runtime.renderSurfaceFxLayer({canvas:runtime.surfaceFxCanvas},[g],1,L,{},false));
assert.equal(runtime.differentialController.state.pending,true);

const fields=['Age','Grain','Memory','Tension','Patch','Area','Motion'];
for(const field of fields){
  assert.match(html,new RegExp(`bindRange\\('pDifferential${field}', 'vDifferential${field}', 'differential${field}'`));
  assert.match(html,new RegExp(`differential${field}: deform.differential${field}`),'Current Batch reaches glyph snapshot');
  assert.match(html,new RegExp(`clampParam\\('differential${field}'`));
}
for(const suffix of ['Opacity','SourceOpacity','Color','SourceMode','Blend'])assert.ok(html.includes(`differentialType: 'differential${suffix}'`));
for(const registry of ['SURFACE_OPERATOR_IDS','GLYPH_BODY_OPERATOR_IDS','SURFACE_RENDER_ORDER_DEFAULT']){
  const ids=registry==='SURFACE_OPERATOR_IDS'?Array.from(catalogRuntime.TypeDeformerCatalog.surfaceIds):
    html.match(new RegExp(`var ${registry} = \\[([^\\]]+)`))[1].match(/'[^']+'/g).map(id=>id.slice(1,-1));
  assert.ok(ids.includes('differentialType'));
}
assert.ok(extract('renderCanvas').includes('drawGlyphs('));
assert.ok(extract('drawGlyphs').includes('renderSurfaceFxLayer('));
assert.ok(extract('exportSvg').includes('renderSurfaceFxLayer('));
assert.ok(extract('startVideoExport').includes('differentialAssertReady(exportGlyphs)'));
assert.ok(extract('projectData').includes('version: 92'));
assert.ok(html.includes("a: 'td', v: 92"));assert.ok(html.includes('data.version > 92'));
assert.ok(html.includes('GLYPH_BODY_OPERATOR_IDS.indexOf(surfaceParamId) === -1 ? 1 : 0'));
assert.ok(!html.match(/src=["'][^"']*differential/),'One-file editor must not require an ESM fetch');
console.log('Differential editor: embedded preparation, native zero/whitespace, pending export guard, shared copies, contour renderer, Mixer ink/alpha, camera-invariant geometry, Compose seam/rewind, font invalidation, presets and v40 coexistence passed (VM/mocks, not browser QA).');
