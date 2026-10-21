import {createAuthoredTestContext} from './authored-test-context.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {readPageMarkup, readAuthoredSource, readAuthoredUnits, extractDeclaredFunction} from './source-reader.mjs';
import '../operator-registry.js';
const require=createRequire(import.meta.url),canvas=require(process.env.TYPE_DEFORMER_CANVAS_MODULE||'@napi-rs/canvas');
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=readPageMarkup(),authoredSource=readAuthoredSource(),authoredUnits=readAuthoredUnits(),registry=globalThis.TypeDeformerOperatorRegistry;
function parameters(){const c=createAuthoredTestContext({});for(const file of ['parameter-model.js','parameter-definitions.js'])vm.runInContext(read(file),c);return c.TypeDeformerParameters;}

test('one immutable OperatorSpec covers every panel, route, mixer key and guide',()=>{
 assert.equal(registry.specs.length,116);assert.equal(registry.surfaceIds.length,103);assert.equal(registry.workerIds.length,100);assert.equal(registry.nativeIds.length,3);assert.equal(registry.glyphBodyIds.length,72);
 assert.equal(new Set(registry.specs.map(s=>s.short)).size,116);
 assert.deepEqual([...registry.workerIds,...registry.nativeIds].sort(),[...registry.surfaceIds].sort());
 assert.deepEqual([...registry.renderOrder].sort(),[...registry.surfaceIds].sort());
 assert.equal(Object.keys(registry.tables.OPERATOR_DEFS).length,116);assert.equal(Object.keys(registry.tables.OPERATOR_GUIDES).length,116);
 const fields={opacity:'SURFACE_OPACITY_KEYS',sourceOpacity:'SURFACE_SOURCE_OPACITY_KEYS',blend:'SURFACE_BLEND_KEYS',sourceMode:'SURFACE_SOURCE_MODE_KEYS',color:'SURFACE_COLOR_KEYS',secondaryColor:'SURFACE_SECONDARY_COLOR_KEYS'};
 for(const s of registry.specs){
  assert.ok(Object.isFrozen(s)&&Object.isFrozen(s.capabilities),s.id);assert.ok(s.guide.trim(),s.id);
  assert.ok(html.includes('data-operator-panel="'+s.id+'"'),s.id+' panel');
  assert.equal(registry.tables.OPERATOR_DEFS[s.id].label,s.label);assert.equal(registry.metadata[s.id],s.capabilities);
  if(s.surface){for(const key of ['opacity','sourceOpacity','blend','sourceMode','color'])assert.ok(s.keys[key],s.id+'.'+key);}
  for(const [key,table] of Object.entries(fields))assert.equal(registry.tables[table][s.id],s.keys?.[key],s.id+'.'+key);
 }
 assert.throws(()=>{registry.byId.webbing.keys.color='wrong';},TypeError);
 assert.deepEqual(registry.sharedRendererIds,['plotterTrace','webbing','softBlob']);
});

test('all 841 explicit control specs and aliases preserve the migrated numeric contract exactly',()=>{
 const p=parameters();assert.equal(Object.keys(p.byControl).length,841);
 // Captured from the pre-migration model plus its complete control inventory.
 // A policy change requires deliberate review of this full-contract baseline.
 const serialized=JSON.stringify({definitions:p.definitions,controls:p.byControl});
 assert.equal(crypto.createHash('sha256').update(serialized).digest('hex'),'8b158a567113f7cfd8cf7d2506b5b51975327906e3b8a21bae8f171b08e2f639');
 assert.throws(()=>{p.byControl.pRotateAngle.domain.min=0;},TypeError);
 const original=p.byControl.pRotateAngle;
 p.register('futureSlider','renamedAmount',{...original,slider:{min:0,max:1,step:.001}});
 for(const value of [-1080.5,7200])assert.equal(p.validate('renamedAmount',value).ok,p.validate('rotateAngle',value).ok);
 assert.deepEqual(p.definitions.renamedAmount.domain,original.domain);
 assert.throws(()=>p.register('missing','missing',0,1,.01,false),/Explicit parameter specification/);
 assert.throws(()=>p.register('incomplete','incomplete',{slider:{min:0,max:1,step:.1},domain:{},budget:{absolute:100}}),/semantic domain/);
});

test('viewer sliders stay outside document numeric hydration while unknown document controls fail visibly',()=>{
 const c=createAuthoredTestContext({window:{TypeDeformerNumericControls:{}},TypeDeformerParameters:{byControl:{}},parameterStateValue(){throw Error('viewer must not hydrate');}});
 vm.runInContext(extractDeclaredFunction(authoredUnits,'hydrateParameterControl'),c);
 assert.doesNotThrow(()=>c.hydrateParameterControl({id:'lookCompareRange',type:'range',dataset:{}}));
 assert.doesNotThrow(()=>c.hydrateParameterControl({id:'',type:'range',dataset:{studio:'position'}}));
 assert.throws(()=>c.hydrateParameterControl({id:'missingDocumentParameter',type:'range',dataset:{}}),/viewer must not hydrate/);
});

function rendererFixture(){
 const c=createAuthoredTestContext({Math,performance,Uint8Array,Uint8ClampedArray,Float32Array,Float64Array,ArrayBuffer,DOMMatrix:canvas.DOMMatrix,Path2D:canvas.Path2D,setTimeout,clearTimeout,
  OffscreenCanvas:function(w,h){return canvas.createCanvas(w,h);},fonts:{add(){},addEventListener(){}}});
 c.self=c;c.importScripts=(...files)=>files.forEach(file=>vm.runInContext(read(file),c,{filename:file}));
 const bootstrap=read('surface-worker.js').split('var defaultFontCss=')[0];
 assert.match(bootstrap,/importScripts\([^)]*'surface-worker-kernels\.js'/,'actual Worker bootstrap imports the generated bootstrap');
 vm.runInContext(bootstrap,c);vm.runInContext(authoredSource.match(/      var params = \{[^]*?\r?\n      };/)[0],c);
 Object.assign(c.params,{fontFamily:'serif',fontSize:40,seed:17});c.workerFontMetrics={ascent:32,descent:8};
 c.compositionState={enabled:false,phase:0};
 return c;
}
function glyphs(strength=1){return [{ch:'A',x:28,w:30},{ch:'B',x:83,w:28}].map(g=>({...g,y:30,h:40,ox:g.x+g.w/2,oy:50,tx:0,ty:0,scaleX:1,scaleY:1,rot:0,opacity:1,surface:{plotterTrace:strength,webbing:strength,softBlob:strength}}));}
function render(c,fn,strength){c.surfaceFxScratchCanvases={};const out=canvas.createCanvas(160,112);fn(out.getContext('2d'),glyphs(strength),160,112,1,{s:1,dx:0,dy:0},c.workerFontMetrics,false);return out.getContext('2d').getImageData(0,0,160,112).data;}
for(const [id,name] of [['plotterTrace','renderPlotterTrace'],['webbing','renderWebbing'],['softBlob','renderSoftBlob']]){
 test(id+': shared engine route calls its authored renderer with deterministic visible pixels and empty-input behavior',()=>{
  const c=rendererFixture(),worker=c.workerEngine.renderers[id];
  const wrappers=['renderPlotterTrace','renderWebbing','renderSoftBlobSporeField','renderSoftBlob','strokeWebCatenary'].map(n=>extractDeclaredFunction(authoredUnits,n));
  for(const wrapper of wrappers)assert.ok(wrapper.includes('TypeDeformerSharedSurface.'),'wrapper injects authored shared renderer dependencies');
  for(const phase of [0,.37]){
   c.compositionState={enabled:phase!==0,phase};c.surfaceFxPhase=phase;
   const expected=render(c,worker,1),actual=render(c,c.workerEngine[name],1);
   assert.deepEqual(actual,expected);assert.ok(actual.some((v,i)=>i%4===3&&v>0),'visible ink');
   assert.deepEqual(render(c,c.workerEngine[name],1),actual,'repeat is deterministic');
  }
  assert.ok(render(c,c.workerEngine[name],0).every(v=>v===0),'zero assignments stay empty');
  const spec=registry.byId[id];assert.equal(spec.rendererModule,'shared-surface-renderers.js');assert.equal(spec.rendererExport,name);
 });
}
