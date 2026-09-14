import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const catalogRuntime=vm.createContext({});catalogRuntime.globalThis=catalogRuntime;
new vm.Script(fs.readFileSync(new URL('../operator-catalog.js',import.meta.url),'utf8')).runInContext(catalogRuntime);
const generated=html.match(/^      \/\/ BEGIN AUXETIC TYPE GENERATED\n[\s\S]*?^      \/\/ END AUXETIC TYPE GENERATED/m)?.[0];
assert.ok(generated,'embedded Auxetic runtime');
const extract=name=>{const found=html.match(new RegExp('^      (?:async )?function '+name+'\\([\\s\\S]*?^      \\}','m'));assert.ok(found,name);return found[0];};
let calls=[],native=0,history=0,autosaves=0,scheduled=0;
const matrix={a:2,b:0,c:.4,d:1.5};
const context=()=>new Proxy({canvas:{width:640,height:480},globalAlpha:1,
  save(){calls.push(['save']);},restore(){calls.push(['restore']);},getTransform(){return matrix;}},{
  get(target,key){if(key in target)return target[key];return(...args)=>calls.push([key,...args]);}
});
const target=context(),elements=new Map(),rafs=new Map();let nextRaf=0;
const params={fontWeight:400,fontFamily:'Mock Serif',fontSize:192,vertical:false,
  auxeticOpening:28,auxeticModule:24,auxeticAspect:1,auxeticAxis:0,auxeticLigament:.75,auxeticMotion:.65,auxeticColor:'#123d33'};
const runtime=vm.createContext({params,compositionState:{enabled:false,phase:0},metrics:[],
  surfaceGlyphStrength:(g,id)=>g.surface?.[id]||0,surfaceOperatorStrength:(g,id)=>g.surface?.[id]||0,
  surfaceEffectColor:()=>params.auxeticColor,surfaceOutputOpacity:()=>1,drawSurfaceGlyph(){native++;},baselineOffset:()=>32,
  scheduleSurfaceFxDraw(){scheduled++;},scheduleCompositionDraw(){scheduled++;},editableBatchProfile:()=>params,pushHistory(){history++;},
  refreshBatchProfileControls(){},applyAllOperatorVisuals(){},markAutosaveDirty(){autosaves++;},
  document:{getElementById(id){if(!elements.has(id))elements.set(id,{hidden:false,value:0,textContent:'',setAttribute(){}});return elements.get(id);}},
  requestAnimationFrame(fn){rafs.set(++nextRaf,fn);return nextRaf;},cancelAnimationFrame(id){rafs.delete(id);}
});
new vm.Script(generated+'\n'+extract('spectralGlyphFrame')).runInContext(runtime);
const source=[{points:[{x:0,y:-80},{x:70,y:-80},{x:70,y:0},{x:0,y:0}]},
  {points:[{x:20,y:-60},{x:20,y:-20},{x:50,y:-20},{x:50,y:-60}]}];
const makeData=settings=>{const glyph=runtime.AuxeticType.prepareAuxeticGlyph(source),compiled=runtime.AuxeticType.compileAuxeticGlyph(glyph,settings);
  return{compiled,pointCount:glyph.pointCount+compiled.pointCount,advance:70,ascent:80,descent:0,middleOffset:40};};
let loadedFont='',loads=0;
runtime.auxeticGlyphData=(ch,fontSpec,settings)=>{loads++;loadedFont=fontSpec.font;return makeData(settings);};
const g={ch:'B',surface:{auxeticType:1},opacity:.8,x:10,y:20,w:70,h:80,ox:10,oy:20,tx:4,ty:-3,rot:8,scaleX:1.1,scaleY:.9,skewX:4,skewY:0};
const requests=runtime.auxeticRequests([g,{...g,tx:100},{...g,ch:' '}]);assert.equal(requests.length,1,'copies share one prepared cut layout; whitespace allocates none');
params.fontFamily='Changed before work';requests[0].load(1000);assert.equal(loadedFont,'400 768px Mock Serif');params.fontFamily='Mock Serif';
runtime.auxeticPrepare([g,{...g,tx:100}]);assert.equal(runtime.auxeticPool.state().total,1);assert.throws(()=>runtime.auxeticAssertReady([g]),e=>e.code==='AUXETIC_PENDING');
runtime.renderAuxeticTypeDirect(target,[g],1,{dx:0,dy:0,s:1},{},true);assert.equal(native,1,'pending preview explicitly retains native body');
runtime.auxeticPool.advance();runtime.auxeticUpdateStatus();runtime.auxeticAssertReady([g]);
calls=[];native=0;runtime.renderAuxeticTypeDirect(target,[g],1,{dx:0,dy:0,s:1},{},false);assert.equal(native,0);assert.ok(calls.some(c=>c[0]==='lineTo'));assert.ok(calls.some(c=>c[0]==='fill'&&c.length===1),'nonzero winding fill');
const geometry=()=>JSON.stringify(calls.filter(c=>c[0]==='moveTo'||c[0]==='lineTo'));
const at0=geometry();runtime.compositionState.enabled=true;runtime.compositionState.phase=1;calls=[];
runtime.renderAuxeticTypeDirect(target,[g],1,{dx:-900,dy:700,s:4},{},false);assert.equal(geometry(),at0,'closed loop and camera-independent glyph geometry');
runtime.compositionState.phase=.25;calls=[];runtime.renderAuxeticTypeDirect(target,[g],1,{dx:0,dy:0,s:1},{},false);assert.notEqual(geometry(),at0,'Compose changes the cut body');
params.auxeticOpening=0;native=0;runtime.renderAuxeticTypeDirect(target,[g],1,{dx:0,dy:0,s:1},{},false);assert.equal(native,1,'Opening zero uses native font rendering');
params.auxeticOpening=28;params.auxeticMotion=1;runtime.compositionState.phase=.5;native=0;runtime.renderAuxeticTypeDirect(target,[g],1,{dx:0,dy:0,s:1},{},false);assert.equal(native,1,'closed Compose midpoint uses native font rendering');
runtime.compositionState.enabled=false;params.auxeticMotion=.65;
runtime.applyAuxeticTypePreset('lancet');assert.equal(params.auxeticAspect,3.4);assert.equal(params.auxeticAxis,28);assert.equal(history,1);assert.equal(autosaves,1);
// Same cut layout but different opening/ligament values must not share rendered geometry.
const sharedSettings=runtime.auxeticGlyphSettings(g),sharedData=makeData(sharedSettings),sharedKey=runtime.auxeticSourceKey('B',sharedSettings);
runtime.auxeticPool.reset();runtime.auxeticPool.sync([{key:sharedKey,load:()=>sharedData}]);runtime.auxeticPool.advance();
let generatedCount=0,originalRender=runtime.AuxeticType.renderAuxeticGlyph;
runtime.AuxeticType.renderAuxeticGlyph=(...args)=>{generatedCount++;return originalRender(...args);};
const differentlyOpened={...g,surface:{...g.surface,auxeticOpening:70,auxeticLigament:.2}};
calls=[];runtime.renderAuxeticTypeDirect(target,[g,differentlyOpened],1,{dx:0,dy:0,s:1},{},false);assert.equal(generatedCount,2,'Batch output settings remain isolated');
runtime.auxeticInvalidateFonts();assert.equal(runtime.auxeticPool.state().total,0);assert.ok(scheduled>0);assert.ok(loads>=1);

for(const field of ['Opening','Module','Aspect','Axis','Ligament','Motion']){
  assert.match(html,new RegExp(`bindRange\\('pAuxetic${field}', 'vAuxetic${field}', 'auxetic${field}'`));
  assert.match(html,new RegExp(`auxetic${field}: deform.auxetic${field}`));
  assert.match(html,new RegExp(`clampParam\\('auxetic${field}'`));
}
for(const suffix of ['Opacity','SourceOpacity','Color','SourceMode','Blend'])assert.ok(html.includes(`auxeticType: 'auxetic${suffix}'`));
for(const name of ['SURFACE_OPERATOR_IDS','GLYPH_BODY_OPERATOR_IDS','SURFACE_RENDER_ORDER_DEFAULT']){
  const ids=name==='SURFACE_OPERATOR_IDS'?Array.from(catalogRuntime.TypeDeformerCatalog.surfaceIds):
    html.match(new RegExp(`var ${name} = \\[([^\\]]+)`))[1].match(/'[^']+'/g).map(id=>id.slice(1,-1));
  assert.ok(ids.includes('auxeticType'));
}
const layer=extract('renderSurfaceFxLayer');assert.ok(layer.includes("id === 'auxeticType'"));assert.ok(layer.includes("surfaceScratch('auxetic-type-v41-direct'"));
assert.ok(layer.includes('renderAuxeticTypeDirect(auxeticDirect.ctx, glyphs, scale, L, fm, livePreview)'));
assert.ok(extract('sceneContentBounds').includes('auxeticEffectPad(scene.glyphs)'));
assert.ok(extract('startVideoExport').includes('auxeticAssertReady(exportGlyphs)'));
assert.ok(extract('projectData').includes('version: 92'));assert.ok(html.includes("a: 'td', v: 92"));assert.ok(html.includes('data.version > 92'));
assert.ok(!html.match(/src=["'][^"']*auxetic/),'one-file editor has no Auxetic module fetch');
console.log('Auxetic editor: shared preparation, Batch isolation, strict export guard, native zero/pending, adaptive destination precision, presets, Compose loop, camera-independent geometry, font reset and current schema wiring passed (VM/mocks, not browser QA).');
