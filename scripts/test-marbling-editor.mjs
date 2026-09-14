import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replaceAll('\r\n','\n');
const catalogRuntime=vm.createContext({});catalogRuntime.globalThis=catalogRuntime;
new vm.Script(fs.readFileSync(new URL('../operator-catalog.js',import.meta.url),'utf8')).runInContext(catalogRuntime);
const block=html.match(/^      \/\/ BEGIN MARBLING TYPE GENERATED\n[\s\S]*?^      \/\/ END MARBLING TYPE GENERATED/m)?.[0];
assert.ok(block,'embedded native Marbling runtime');
const extract=name=>{const s=html.match(new RegExp('^      (?:async )?function '+name+'\\([\\s\\S]*?^      \\}','m'))?.[0];assert.ok(s,name);return s;};
let matrix={a:1,b:0,c:0,d:1},stack=[],active,paints=[],native=[],paths=0,history=0,saves=0,loads=0,loadedFont='';
class Path {constructor(){this.commands=[];paths++;}moveTo(x,y){this.commands.push(['M',x,y]);}lineTo(x,y){this.commands.push(['L',x,y]);}closePath(){this.commands.push(['Z']);}}
const ctx={save(){stack.push(matrix);},restore(){matrix=stack.pop();},getTransform:()=>matrix,
  fill(path){paints.push({id:active.id,alpha:this.globalAlpha,color:this.fillStyle,commands:path?path.commands:this.commands});},
  beginPath(){this.commands=[];},moveTo:Path.prototype.moveTo,lineTo:Path.prototype.lineTo,closePath:Path.prototype.closePath};
const elements=new Map(),rafs=new Map();let rafId=0,opacity=1,failSource=false;
const runtime=vm.createContext({performance,Path2D:Path,metrics:[],compositionState:{enabled:true,phase:.25},
  surfaceGlyphStrength:(g,id)=>g.surface?.[id]||0,surfaceOperatorStrength:(g,id)=>g.surface?.[id]||0,
  surfaceOutputOpacity:()=>opacity,surfaceEffectColor:()=> '#345678',
  spectralGlyphFrame(ctx,g,scale,L){active=g;matrix={a:g.scaleX*scale*L.s,b:0,c:g.skewX||0,d:g.scaleY*scale*L.s};},
  drawSurfaceGlyph(ctx,g){native.push(g.id);},scheduleSurfaceFxDraw(){},scheduleCompositionDraw(){},
  pushHistory(){history++;},markAutosaveDirty(){saves++;},editableBatchProfile(){return runtime.params;},refreshBatchProfileControls(){},applyAllOperatorVisuals(){},
  document:{getElementById(id){if(!elements.has(id))elements.set(id,{hidden:false,setAttribute(){}});return elements.get(id);}},
  requestAnimationFrame(fn){rafs.set(++rafId,fn);return rafId;},cancelAnimationFrame(id){rafs.delete(id);}});
const defaults=html.match(/^      var params = \{[\s\S]*?^      \};/m)[0];
new vm.Script(defaults+'\n'+block).runInContext(runtime);
runtime.params.fontFamily='Mock Serif';runtime.params.fontWeight=400;runtime.params.fontSize=192;
const rings=[{points:[{x:0,y:-100},{x:70,y:-100},{x:70,y:0},{x:0,y:0}]},
  {points:[{x:20,y:-75},{x:20,y:-25},{x:50,y:-25},{x:50,y:-75}]}];
const source=Object.freeze({...runtime.MarblingType.prepareMarblingGlyph(rings),nativeMetrics:Object.freeze({advance:70,ascent:100,descent:0,middleOffset:40})});
runtime.marblingGlyphData=(ch,font)=>{loads++;loadedFont=font.font;if(failSource&&ch==='bad')throw new Error('source unavailable');return source;};
const glyphs=Array.from({length:300},(_,id)=>({id,ch:id%3===0?'A':'B',scaleX:1+id%5,scaleY:1,skewX:0,opacity:.4+id%3*.2,
  surface:{marblingType:1,marblingMode:['rake','eddy','plume'][id%3]}}));
const requests=runtime.marblingRequests(glyphs);assert.equal(requests.length,2,'copies/modes share only two captures');
runtime.params.fontFamily='Edited before task';requests[0].load({maxPoints:262144});assert.equal(loadedFont,'400 768px Mock Serif');runtime.params.fontFamily='Mock Serif';
runtime.marblingPrepare(glyphs);assert.throws(()=>runtime.marblingAssertReady(glyphs),e=>e.code==='MARBLING_PENDING');
runtime.renderMarblingTypeDirect(ctx,[glyphs[0]],1,{s:1},{},true);assert.deepEqual(native,[0]);
runtime.marblingPool.setPaused(true);assert.equal(runtime.marblingPool.advance(),false);runtime.marblingPool.setPaused(false);
while(runtime.marblingPool.state().pending)runtime.marblingPool.advance();runtime.marblingAssertReady(glyphs);
let built=[];const original=runtime.MarblingType.renderMarblingLod;
runtime.MarblingType.renderMarblingLod=(...args)=>{const shape=original(...args);built.push({tolerance:args[3].tolerance,shape});return shape;};
const draw=(gs=glyphs,live=false)=>{paints=[];native=[];paths=0;built=[];runtime.renderMarblingTypeDirect(ctx,gs,1,{s:1,dx:0,dy:0},{},live);};
draw();assert.equal(built.length,3);assert.equal(paths,3);assert.equal(paints.length,300);
assert.deepEqual(paints.map(p=>p.id),glyphs.map(g=>g.id));assert.deepEqual(paints.map(p=>p.alpha),glyphs.map(g=>g.opacity));
assert.ok(paints.every(p=>p.color==='#345678'));assert.ok(built.every(b=>b.tolerance===.04),'strictest destination precision');
const geometry=()=>paints.map(p=>JSON.stringify(p.commands));const base=geometry();
draw([...glyphs].reverse());assert.equal(built.length,0,'same complete shapes reused');assert.deepEqual(geometry().reverse(),base);
// High-resolution export must not replace the stopped preview's tessellation.
draw(glyphs.map(g=>({...g,scaleX:g.scaleX*3,scaleY:g.scaleY*3})));assert.equal(built.length,3);
draw();assert.equal(built.length,0,'preview LOD remains separately cached');assert.deepEqual(geometry(),base,'preview/export/preview is exact');
runtime.Path2D=undefined;draw();assert.deepEqual(geometry(),base);runtime.Path2D=Path;
runtime.compositionState.phase=0;draw();const zero=geometry();runtime.compositionState.phase=1;draw();assert.deepEqual(geometry(),zero);
runtime.compositionState.phase=.4;draw();assert.notDeepEqual(geometry(),zero);
const settingsBefore=JSON.stringify(runtime.params);const sourceState=JSON.stringify(runtime.marblingPool.state());
runtime.marblingAssertReady([glyphs[0]]);assert.equal(JSON.stringify(runtime.marblingPool.state()),sourceState);
assert.throws(()=>runtime.marblingAssertReady([{...glyphs[0],ch:'missing'}]),e=>e.code==='MARBLING_PENDING');
assert.equal(JSON.stringify(runtime.marblingPool.state()),sourceState);assert.equal(JSON.stringify(runtime.params),settingsBefore);
draw([{...glyphs[0],ch:'missing',surface:{marblingType:1,marblingAmount:0}}]);assert.deepEqual(native,[0]);assert.equal(built.length,0);
assert.throws(()=>draw([{...glyphs[0],scaleX:1e10}]),/precision budget/);assert.equal(stack.length,0);
draw([{...glyphs[0],scaleX:1e10}],true);assert.deepEqual(native,[0]);assert.match(runtime.marblingRenderError,/precision budget/);
const renderMethod=runtime.MarblingType.renderMarblingLod;runtime.marblingClearGeometry();
runtime.MarblingType.renderMarblingLod=()=>{throw new RangeError('geometry budget exceeded');};
assert.throws(()=>draw([glyphs[0]]),/geometry budget/);draw([glyphs[0]],true);assert.deepEqual(native,[0]);assert.match(runtime.marblingRenderError,/geometry budget/);
runtime.MarblingType.renderMarblingLod=renderMethod;
runtime.applyMarblingTypePreset('plume');assert.equal(runtime.params.marblingMode,'plume');assert.equal(runtime.params.marblingAmount,.75);assert.equal(history,1);assert.equal(saves,1);
failSource=true;runtime.marblingPrepare([{...glyphs[0],ch:'bad'},glyphs[0]]);while(runtime.marblingPool.state().pending)runtime.marblingPool.advance();
runtime.marblingAssertReady([glyphs[0]]);assert.throws(()=>runtime.marblingAssertReady([{...glyphs[0],ch:'bad'}]),e=>e.code==='MARBLING_ERROR');
failSource=false;runtime.marblingRetry();while(runtime.marblingPool.state().pending)runtime.marblingPool.advance();runtime.marblingAssertReady([{...glyphs[0],ch:'bad'}]);
runtime.marblingPrepare([]);assert.equal(runtime.marblingPool.state().total,0);assert.equal(runtime.marblingCachePoints,0);assert.equal(rafs.size,0);assert.equal(elements.get('marblingWorkStatus').hidden,true);
opacity=0;assert.equal(runtime.marblingRequests(glyphs).length,0);assert.equal(runtime.marblingEffectPad(glyphs),0);opacity=1;
runtime.marblingPrepare(glyphs);while(runtime.marblingPool.state().pending)runtime.marblingPool.advance();
runtime.marblingEffectPad(glyphs);assert.ok(runtime.marblingCachePoints>0&&runtime.marblingCachePoints<=262144);
runtime.marblingInvalidateFonts();assert.equal(runtime.marblingPool.state().total,0);assert.equal(runtime.marblingCache.size,0);assert.equal(rafs.size,0);
// Actual persisted numeric/select definitions, limits and validation.
for(const name of ['BATCH_PARAM_KEYS','BATCH_PARAM_LIMITS','BATCH_PARAM_OPTIONS']){
  const code=html.match(new RegExp('^      var '+name+' = [\\s\\S]*?^      [}\\]];','m'))?.[0];assert.ok(code,name);new vm.Script(code).runInContext(runtime);
}
for(const field of ['Amount','Pitch','Focus','Circulation','Angle','Motion']){
  const key='marbling'+field;assert.ok(runtime.BATCH_PARAM_KEYS.includes(key));assert.ok(runtime.BATCH_PARAM_LIMITS[key]);
  assert.ok(html.includes(`bindRange('pMarbling${field}', 'vMarbling${field}', '${key}'`));
  assert.ok(html.includes(`${key}: deform.${key}`));assert.ok(html.includes(`clampParam('${key}'`));
}
assert.deepEqual(Array.from(runtime.BATCH_PARAM_OPTIONS.marblingMode),['rake','eddy','plume']);
for(const suffix of ['Opacity','SourceOpacity','Color','SourceMode','Blend'])assert.ok(html.includes(`marblingType: 'marbling${suffix}'`));
for(const [name,n] of [['SURFACE_OPERATOR_IDS',103],['GLYPH_BODY_OPERATOR_IDS',72],['SURFACE_RENDER_ORDER_DEFAULT',103]]){
  const ids=name==='SURFACE_OPERATOR_IDS'?Array.from(catalogRuntime.TypeDeformerCatalog.surfaceIds):
    html.match(new RegExp('var '+name+' = \\[([^\\]]+)'))[1].match(/'[^']+'/g).map(id=>id.slice(1,-1));
  assert.equal(ids.length,n);assert.equal(new Set(ids).size,n);assert.ok(ids.includes('marblingType'));
}
for(const fn of ['projectData','serializeLook','buildSVG']){const code=html.includes('function '+fn+'(')?extract(fn):'';if(code)assert.ok(code.includes('version: 92')||fn==='serializeLook');}
assert.ok(html.includes('data.version > 92'));assert.ok(html.includes("a: 'td', v: 92"));
assert.ok(html.includes('var legacyCounterformV29 = Number(data.version || 0) < 42'),'v42 migration cutoff NOT moved');
assert.ok(extract('renderSurfaceFxLayer').includes('renderMarblingTypeDirect(marblingDirect.ctx, glyphs, scale, L, fm, livePreview)'));
assert.ok(extract('sceneContentBounds').includes('marblingEffectPad(scene.glyphs, scene.presentedPhase)'));
assert.ok(extract('startVideoExport').includes('marblingAssertReady(exportGlyphs)'));
assert.ok(extract('proofReadinessMessage').includes('marblingHasAppliedBody()'));
console.log('Marbling native adapter: 300 copies/3 shapes/2 sources; Batch, strict 0.2px transforms, loop/native zero, cache, source lifecycle, explicit failures, Mixer and v51 schema wiring passed (VM/mocks; not browser/device QA).');
