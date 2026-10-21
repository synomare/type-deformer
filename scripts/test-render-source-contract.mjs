import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse, references, readRenderContract, readWorkerEntrypointContract } from './render-source-contract.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(repo, name), 'utf8');
test('canonical manifest owns every Worker renderer and Compose generator without HTML inputs', () => {
  const { manifest, declarations } = readRenderContract(repo);
  const context = vm.createContext({});
  vm.runInContext(read('operator-registry.js'), context);
  assert.deepEqual(Object.keys(manifest.routes).sort(), [...context.TypeDeformerOperatorRegistry.workerIds].sort());
  assert.equal(Object.keys(manifest.compositionGenerators).length, 8);
  for (const name of ['document','window','textInput']) assert.ok(!manifest.environment.some(port=>port.name===name), name + ' is not a render capability');
  for (const name of [...manifest.entrypoints, ...Object.values(manifest.compositionGenerators)]) assert.ok(declarations.has(name), name);
  for (const file of ['scripts/build-surface-worker.mjs', 'scripts/render-source-contract.mjs']) assert.doesNotMatch(read(file), /readFileSync[^\n]*(?:index\.html|editor\.js)|lastIndexOf\(['"]<script>|startsWith\(['"]TypeDeformer/);
  assert.doesNotMatch(read('surface-worker.js'), /self\.(?:document|window)\s*=/);
  assert.ok(read('surface-worker.js').includes("'render-engine.js'"));
});
test('the actual build succeeds when HTML and editor implementation reads are forbidden', () => {
  const build=pathToFileURL(path.join(repo,'scripts/build-surface-worker.mjs')).href;
  const probe=`import fs from 'node:fs';
    const read=fs.readFileSync;
    fs.readFileSync=function(file,...rest){
      if(/(?:\\.html$|(?:^|[\\\\/])editor\\.js$|(?:^|[\\\\/])editor-source[\\\\/])/.test(String(file)))throw new Error('Forbidden editor build input: '+file);
      return read.call(this,file,...rest);
    };
    process.argv.push('--check');
    await import(${JSON.stringify(build)});`;
  const result=execFileSync(process.execPath,['--input-type=module','-e',probe],{cwd:repo,encoding:'utf8'});
  assert.match(result,/"operators": 100/);
  assert.match(result,/"unknown": \[\]/);
});
test('dependency validation rejects undeclared globals including TypeDeformer-prefixed names', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'type-deformer-render-contract-'));
  try {
    fs.mkdirSync(path.join(temp, 'render-source'));
    fs.writeFileSync(path.join(temp, 'render-source/unit.js'), 'function renderProbe(){return TypeDeformerUnregistered.draw();}');
    fs.writeFileSync(path.join(temp, 'render-source/manifest.json'), JSON.stringify({
      modules:[{id:'probe',path:'render-source/unit.js',declarations:['renderProbe']}],
      declarationOrder:['renderProbe'],environment:[],globals:[],routes:{probe:'renderProbe'}
    }));
    assert.throws(() => readRenderContract(temp), /Unknown render dependencies: TypeDeformerUnregistered/);
    fs.writeFileSync(path.join(temp, 'render-source/unit.js'), 'function renderProbe(){return globalThis.TypeDeformerUnregistered.draw();}');
    const manifest=JSON.parse(fs.readFileSync(path.join(temp,'render-source/manifest.json'),'utf8'));
    manifest.globals=['globalThis'];manifest.globalProperties=[];
    fs.writeFileSync(path.join(temp,'render-source/manifest.json'),JSON.stringify(manifest));
    assert.throws(() => readRenderContract(temp), /Unknown render dependencies: globalThis.TypeDeformerUnregistered/);
  } finally { fs.rmSync(temp, { recursive:true, force:true }); }
});
test('dependency analysis respects nested lexical scopes and catches escaped block bindings', () => {
  const refs = references(parse('function probe(input){let outer=1;if(input){let hidden=2;outer+=hidden;}return outer+hidden+unprovided;}'));
  assert.deepEqual([...new Set(refs.map(ref=>ref.name))].sort(), ['hidden','unprovided']);
});
test('Worker entrypoint rejects an unconnected render port and prefixed globals', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'type-deformer-worker-contract-'));
  const specification = {path:'worker.js',globals:['globalThis'],globalProperties:[]};
  try {
    fs.writeFileSync(path.join(temp,'worker.js'),'function bounds(){return {font:glyphFontSpec};}');
    assert.throws(()=>readWorkerEntrypointContract(temp,specification),/Unknown Worker entrypoint dependencies: glyphFontSpec/);
    fs.writeFileSync(path.join(temp,'worker.js'),'globalThis.TypeDeformerUnregistered.render();');
    assert.throws(()=>readWorkerEntrypointContract(temp,specification),/Unknown Worker entrypoint dependencies: globalThis.TypeDeformerUnregistered/);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
});
test('engine refuses incomplete environment contracts before creating render state', () => {
  const context = vm.createContext({});
  vm.runInContext(read('render-engine.js'), context);
  assert.throws(() => context.TypeDeformerRenderEngine.create({}), /Missing render environment port params/);
  assert.ok(Object.isFrozen(context.TypeDeformerRenderEngine));
});
function workerFixture(full = false, captureEnvironment = false) {
  const context = vm.createContext({console,performance,setTimeout,clearTimeout,fonts:{add(){},delete(){},addEventListener(){}},navigator:{userAgent:'',platform:'',maxTouchPoints:0}});
  context.self=context;
  context.importScripts=(...files)=>files.forEach(file=>{
    vm.runInContext(read(file),context,{filename:file});
    if(captureEnvironment&&file==='render-engine.js'){
      const factory=context.TypeDeformerRenderEngine;
      context.TypeDeformerRenderEngine={...factory,create(environment){context.renderEnvironment=environment;return factory.create(environment);}};
    }
  });
  const source=read('surface-worker.js');
  vm.runInContext(full?source:source.split('var defaultFontCss=')[0],context,{filename:'surface-worker.js'});
  return context;
}
test('actual Worker bounds jobs connect the font capability and refresh frame media state', async () => {
  const context=workerFixture(true), material=context.TypeDeformerFieldMaterials, original=material.bodyBounds;
  let fontCalls=0;
  material.bodyBounds=function(glyphs,bounds,fm,environment){
    assert.equal(typeof environment.font,'function');
    assert.match(environment.font(glyphs[0],32).font,/32px/);
    fontCalls++;
    return original(glyphs,bounds,fm,environment);
  };
  const frame={
    kind:'bounds',purpose:'export',geometryKey:'bounds-contract',mobile:true,reducedMotion:true,
    params:{fontFamily:'sans-serif',fontSize:32,fontWeight:400,ink:'#000000'},
    composition:{phase:0},text:'A',surfacePhase:0,dataMoshFrame:0,fonts:[],operators:[],operatorKeys:{},
    glyphs:[{ch:'A',x:10,y:20,w:24,h:32,ox:10,oy:20,tx:0,ty:0,scaleX:1,scaleY:1,opacity:1,surface:{}}],
    surfaces:[],fm:{ascent:25,descent:7},bounds:{x:5,y:15,w:34,h:42}
  };
  const result=await context.renderFrame(frame);
  assert.equal(result.kind,'bounds');assert.equal(result.geometryKey,frame.geometryKey);
  assert.deepEqual(JSON.parse(JSON.stringify(result.bounds)),frame.bounds);
  assert.equal(fontCalls,1);assert.equal(context.workerMobile,true);assert.equal(context.workerReducedMotion,true);
  await context.renderFrame({...frame,mobile:false,reducedMotion:false});
  assert.equal(fontCalls,2);assert.equal(context.workerMobile,false);assert.equal(context.workerReducedMotion,false);
});
test('frame replacement stays live while cache and pool ownership stays within each engine', () => {
  const context = workerFixture(), engine=context.workerEngine;
  assert.equal('document' in context,false);
  assert.equal('window' in context,false);
  const key=context.TypeDeformerOperatorRegistry.tables.SURFACE_OPACITY_KEYS.plotterTrace;
  context.params={[key]:.24};assert.equal(engine.surfaceOutputOpacity('plotterTrace'),.24);
  context.params={[key]:.73};assert.equal(engine.surfaceOutputOpacity('plotterTrace'),.73);
  const cache=engine.charInfoCache;engine.charInfo('A',65);assert.equal(cache.size,1);
  context.params={[key]:.41};assert.equal(engine.charInfoCache,cache);assert.equal(engine.surfaceOutputOpacity('plotterTrace'),.41);
  engine.surfaceEnvelopeScale=3.5;assert.equal(engine.surfaceEnvelopeScale,3.5);
  const other=workerFixture().workerEngine;
  assert.notEqual(other.charInfoCache,cache);assert.equal(other.charInfoCache.size,0);
  assert.notEqual(other.differentialController,engine.differentialController);
});
test('composition consumes committed source text rather than an ahead-of-render input draft', () => {
  const context=workerFixture(),engine=context.workerEngine;
  context.params={};
  context.renderedSourceText='AB';
  context.textInput={value:'A B'};
  const glyphs=[{ch:'A'},{ch:'B'}];
  assert.equal(engine.compositionSourceTokens(glyphs).length,2);
  context.renderedSourceText='A B';
  assert.equal(engine.compositionSourceTokens(glyphs).length,3);
});
test('neutral surface bounds skip profile work and retain manual and sub-threshold strengths', () => {
  const context=workerFixture(false,true),engine=context.workerEngine,environment=context.renderEnvironment;
  const model=context.TypeDeformerEditorModel.create({registry:context.TypeDeformerOperatorRegistry,surfaceIds:context.TypeDeformerOperatorRegistry.surfaceIds,dictionary:()=>null});
  context.params=model.params;
  let profileReads=0,padCalls=0;
  context.TypeDeformerFieldMaterials.effectPad=()=>{padCalls++;return 16;};
  const neutral=Array.from({length:20000},()=>({ch:'A',operatorStates:{rotate:{current:1,manual:null}},get batchKey(){profileReads++;return 'latin';}}));
  environment.metrics=neutral;
  assert.equal(engine.surfaceEffectPad(),40);
  assert.equal(profileReads,0);assert.equal(padCalls,0);
  environment.metrics=[{ch:'A',batchKey:'latin',operatorStates:{plotterTrace:{current:0,manual:1}}}];
  context.params.traceJitter=12;
  assert.equal(engine.surfaceEffectPad(),60);
  environment.metrics[0].operatorStates.plotterTrace={current:1,manual:0};
  padCalls=0;assert.equal(engine.surfaceEffectPad(),40);assert.equal(padCalls,0);
  environment.metrics[0].operatorStates.plotterTrace={current:.001,manual:null};
  assert.equal(engine.surfaceEffectPad(),41);
});
