import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const catalogRuntime=vm.createContext({});catalogRuntime.globalThis=catalogRuntime;
new vm.Script(fs.readFileSync(new URL('../operator-catalog.js',import.meta.url),'utf8')).runInContext(catalogRuntime);
const generated = html.match(/^      \/\/ BEGIN CONFORMAL TYPE GENERATED\n[\s\S]*?^      \/\/ END CONFORMAL TYPE GENERATED/m)?.[0];
assert.ok(generated, 'embedded Conformal runtime');
const extract = name => {
  const found = html.match(new RegExp('^      (?:async )?function '+name+'\\([\\s\\S]*?^      \\}', 'm'));
  assert.ok(found, name); return found[0];
};
let calls=[], native=0, history=0, autosaves=0, scheduled=0;
const matrix={a:2,b:0,c:0,d:2};
const context=()=>new Proxy({canvas:{width:640,height:480},globalAlpha:1,
  save(){calls.push(['save']);},restore(){calls.push(['restore']);},getTransform(){return matrix;}}, {
  get(target,key){if(key in target)return target[key];return (...args)=>calls.push([key,...args]);}
});
const work=context(), target=context(), elements=new Map(), rafs=new Map();let nextRaf=0;
const params={fontWeight:400,fontFamily:'Mock Serif',fontSize:192,vertical:false,
  conformalAmount:.82,conformalPower:-1,conformalSpiral:0,conformalAngle:-35,conformalMotion:.55,conformalColor:'#123456'};
const runtime=vm.createContext({params,compositionState:{enabled:false,phase:0},metrics:[],
  surfaceGlyphStrength:(g,id)=>g.surface?.[id]||0,surfaceOperatorStrength:(g,id)=>g.surface?.[id]||0,
  surfaceEffectColor:()=>params.conformalColor,drawSurfaceGlyph(){native++;},baselineOffset:()=>32,
  surfaceOutputOpacity:()=>1,
  differentialPrepare(){},differentialAssertReady(){},auxeticPrepare(){},auxeticAssertReady(){},counterformResetInactive(){},marblingPrepare(){},marblingAssertReady(){},
  scheduleSurfaceFxDraw(){scheduled++;},scheduleCompositionDraw(){scheduled++;},
  editableBatchProfile:()=>params,pushHistory(){history++;},refreshBatchProfileControls(){},applyAllOperatorVisuals(){},markAutosaveDirty(){autosaves++;},
  document:{getElementById(id){if(!elements.has(id))elements.set(id,{hidden:false,value:0,textContent:'',setAttribute(){}});return elements.get(id);}},
  requestAnimationFrame(fn){rafs.set(++nextRaf,fn);return nextRaf;},cancelAnimationFrame(id){rafs.delete(id);}
});
new vm.Script(generated+'\n'+extract('spectralGlyphFrame')).runInContext(runtime);
const contours=[{points:[{x:0,y:-80},{x:70,y:-80},{x:70,y:0},{x:0,y:0}]},
  {points:[{x:20,y:-60},{x:20,y:-20},{x:50,y:-20},{x:50,y:-60}]}];
const prepared=runtime.ConformalType.prepareConformalGlyph(contours);
const data={compiled:runtime.ConformalType.compileConformalGlyph(prepared),pointCount:8,advance:70,ascent:80,descent:0,middleOffset:40};
let requestedFont='';
runtime.conformalGlyphData=(ch,fontSpec)=>{requestedFont=fontSpec.font;return data;};
const g={ch:'B',surface:{conformalType:1},opacity:.8,x:10,y:20,w:70,h:80,ox:10,oy:20,tx:4,ty:-3,rot:8,scaleX:1.1,scaleY:.9,skewX:4,skewY:0};
const pending=runtime.conformalRequests([g,{...g,tx:100},{...g,ch:' '}]);
assert.equal(pending.length,1,'copies share one high-resolution source; whitespace allocates none');
params.fontFamily='Changed before work';pending[0].load(100);assert.equal(requestedFont,'400 768px Mock Serif');params.fontFamily='Mock Serif';
runtime.conformalPrepare([g,{...g,tx:100}]);assert.equal(runtime.conformalPool.state().total,1);assert.throws(()=>runtime.conformalAssertReady([g]),e=>e.code==='CONFORMAL_PENDING');
runtime.renderConformalTypeDirect(target,[g],1,{dx:0,dy:0,s:1},{},true);assert.equal(native,1,'pending preview is explicitly native');
runtime.conformalPool.advance();runtime.conformalUpdateStatus();runtime.conformalAssertReady([g]);
calls=[];native=0;runtime.renderConformalTypeDirect(target,[g],1,{dx:0,dy:0,s:1},{},false);
assert.equal(native,0);assert.ok(calls.some(c=>c[0]==='lineTo'));assert.ok(calls.some(c=>c[0]==='fill'&&c.length===1),'nonzero winding fill');
const geometry=()=>JSON.stringify(calls.filter(c=>c[0]==='moveTo'||c[0]==='lineTo'));
const at0=geometry();runtime.compositionState.enabled=true;runtime.compositionState.phase=1;calls=[];
runtime.renderConformalTypeDirect(target,[g],1,{dx:-900,dy:700,s:4},{},false);assert.equal(geometry(),at0,'loop closes and camera cannot alter local geometry');
runtime.compositionState.phase=.5;calls=[];runtime.renderConformalTypeDirect(target,[g],1,{dx:0,dy:0,s:1},{},false);assert.notEqual(geometry(),at0,'Compose changes the actual body');
params.conformalAmount=0;native=0;runtime.renderConformalTypeDirect(target,[g],1,{dx:0,dy:0,s:1},{},false);assert.equal(native,1,'zero retains native font rendering');
runtime.applyConformalTypePreset('coil');assert.equal(params.conformalSpiral,2.5);assert.equal(params.conformalPower,.2);assert.equal(history,1);assert.equal(autosaves,1);
runtime.conformalInvalidateFonts();assert.equal(runtime.conformalPool.state().total,0);assert.ok(scheduled>0);

runtime.compositionCanvas={};runtime.surfaceFxCanvas={};runtime.surfaceAnyEffectPresent=()=>false;
runtime.sculptureEditor={clearInactive(){}}; // Scroll lifecycle is outside this isolated Conformal guard.
new vm.Script(extract('renderSurfaceFxLayer')).runInContext(runtime);
params.conformalAmount=.82;assert.throws(()=>runtime.renderSurfaceFxLayer(target,[g],1,{dx:0,dy:0,s:1},{},false),e=>e.code==='CONFORMAL_PENDING');
assert.doesNotThrow(()=>runtime.renderSurfaceFxLayer({canvas:runtime.surfaceFxCanvas},[g],1,{dx:0,dy:0,s:1},{},false));

for(const field of ['Amount','Power','Spiral','Angle','Motion']){
  assert.match(html,new RegExp(`bindRange\\('pConformal${field}', 'vConformal${field}', 'conformal${field}'`));
  assert.match(html,new RegExp(`conformal${field}: deform.conformal${field}`));
  assert.match(html,new RegExp(`clampParam\\('conformal${field}'`));
}
for(const suffix of ['Opacity','SourceOpacity','Color','SourceMode','Blend'])assert.ok(html.includes(`conformalType: 'conformal${suffix}'`));
for(const name of ['SURFACE_OPERATOR_IDS','GLYPH_BODY_OPERATOR_IDS','SURFACE_RENDER_ORDER_DEFAULT']){
  const ids=name==='SURFACE_OPERATOR_IDS'?Array.from(catalogRuntime.TypeDeformerCatalog.surfaceIds):
    html.match(new RegExp(`var ${name} = \\[([^\\]]+)`))[1].match(/'[^']+'/g).map(id=>id.slice(1,-1));
  assert.ok(ids.includes('conformalType'));
}
const layer=extract('renderSurfaceFxLayer');
assert.ok(layer.includes("id === 'conformalType'"));assert.ok(layer.includes("surfaceScratch('conformal-type-v40-direct', targetCtx.canvas.width, targetCtx.canvas.height"));
assert.ok(layer.includes('renderConformalTypeDirect(direct.ctx, glyphs, scale, L, fm, livePreview)'));
assert.ok(extract('sceneContentBounds').includes('conformalEffectPad(scene.glyphs)'));
assert.ok(extract('startVideoExport').includes('conformalAssertReady(exportGlyphs)'));
assert.ok(extract('projectData').includes('version: 92'));assert.ok(html.includes("a: 'td', v: 92"));assert.ok(html.includes('data.version > 92'));
assert.ok(!html.match(/src=["'][^"']*conformal/),'one-file editor has no module fetch');
console.log('Conformal editor: source sharing/preparation, strict export guard, native zero/pending, direct destination LOD, nonzero fill, presets, Compose loop, camera-independent local geometry, font reset, Mixer/Batch/state/v40 wiring passed (VM/mocks, not browser QA).');
