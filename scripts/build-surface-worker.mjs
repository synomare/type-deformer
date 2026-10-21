import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse, references, rewriteReferences, readRenderContract } from './render-source-contract.mjs';
import '../operator-registry.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { manifest, declarations, units, dependencies, workerEntrypoint } = readRenderContract(repo);
const registry = globalThis.TypeDeformerOperatorRegistry;
const operators = Object.keys(manifest.routes);
if (operators.length !== registry.workerIds.length || registry.workerIds.some(id => !operators.includes(id))) throw new Error('Canonical render routes differ from OperatorSpec');
if (manifest.nativeIds.length !== registry.nativeIds.length || registry.nativeIds.some(id => !manifest.nativeIds.includes(id))) throw new Error('Native render declarations differ from OperatorSpec');
for (const name of [...manifest.entrypoints, ...Object.values(manifest.compositionGenerators)]) if (!declarations.has(name)) throw new Error('Missing render entrypoint ' + name);

const ports = new Set(manifest.environment.map(port => port.name));
function compiled(code) {
  return rewriteReferences(code, references(parse(code)), ports, 'environment');
}
const source = manifest.declarationOrder.map(name => compiled(declarations.get(name).code)).join('\n\n');
const routes = Object.entries(manifest.routes).map(([id, code]) => {
  if (manifest.routeSignatures[id] === 'native') code = `function(ctx,glyphs,width,height,pixelScale,L,fm,coverBase,livePreview){return (${code})(ctx,glyphs,pixelScale,L,fm,livePreview);}`;
  return JSON.stringify(id) + ': ' + compiled('(' + code + ')');
}).join(',\n');
const exports = manifest.declarationOrder.map(name => JSON.stringify(name) + ': { enumerable: true, get: function(){return ' + name + ';}' + (declarations.get(name).kind === 'variable' ? ', set: function(value){' + name + '=value;}' : '') + ' }').join(',\n');
const signature = crypto.createHash('sha256').update(JSON.stringify(manifest)).update(units.map(unit => unit.source).join('\n')).digest('hex');
const output = `// Generated from render-source/manifest.json and its authored declaration modules.
// Both execution environments instantiate this same factory. Do not edit this bundle.
(function(root){
  'use strict';
  var contract=${JSON.stringify({version:manifest.version,signature,operators,ports:manifest.environment,entrypoints:manifest.entrypoints})};
  function create(environment){
    if(!environment)throw new TypeError('Render environment is required');
    for(var port of contract.ports)if(!(port.name in environment))throw new TypeError('Missing render environment port '+port.name);
${source}
    var api={renderers:{${routes}}};
    Object.defineProperties(api,{${exports}});
    return Object.freeze(api);
  }
  root.TypeDeformerRenderEngine=Object.freeze({create:create,contract:Object.freeze(contract)});
})(typeof globalThis!=='undefined'?globalThis:this);
`;
const report = {
  sourceManifest: 'render-source/manifest.json', signature,
  operators, nativeIds: manifest.nativeIds,
  functions: manifest.declarationOrder.filter(name => declarations.get(name).kind === 'function'),
  variables: manifest.declarationOrder.filter(name => declarations.get(name).kind === 'variable'),
  modules: units.map(unit => ({ path: unit.path, declarations: unit.declarations.length })),
  environment: manifest.environment, globals: manifest.globals, globalProperties: manifest.globalProperties, dependencies, workerEntrypoint, unknown: [],
  sharedRenderers: registry.sharedRendererIds.map(id => ({ id, module:registry.byId[id].rendererModule, export:registry.byId[id].rendererExport }))
};
const workerBootstrap = `// Generated environment wiring only. All renderer implementations live in render-engine.js.
var workerEngine=TypeDeformerWorkerAdapter.create({
  get params(){return params;},set params(value){params=value;},
  get compositionState(){return compositionState;},set compositionState(value){compositionState=value;},
  get renderedSourceText(){return renderedSourceText;},set renderedSourceText(value){renderedSourceText=value;},
  get surfaceFxPhase(){return surfaceFxPhase;},set surfaceFxPhase(value){surfaceFxPhase=value;},
  get dataMoshFrame(){return dataMoshFrame;},set dataMoshFrame(value){dataMoshFrame=value;},
  get blobTrackState(){return blobTrackState;},set blobTrackState(value){blobTrackState=value;},
  get surfaceFxScratchCanvases(){return surfaceFxScratchCanvases;},set surfaceFxScratchCanvases(value){surfaceFxScratchCanvases=value;},
  get compositionScene(){return compositionScene;},set compositionScene(value){compositionScene=value;},
  get compositionQualityOverride(){return compositionQualityOverride;},set compositionQualityOverride(value){compositionQualityOverride=value;},
  get fontMetrics(){return workerFontMetrics;},
  get compositionInputs(){return workerCompositionInputs;},
  get sourceGlyphs(){return workerSourceGlyphs;},
  get mobile(){return workerMobile;},
  get reducedMotion(){return workerReducedMotion;},
  font:function(g,size){return axisFieldEditor.font(g,size);}
});
`;
function writeOrCheck(file, value) {
  const target = path.join(repo, file), normalized = value.replace(/\r\n/g, '\n');
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== normalized) throw new Error(file + ' differs from canonical render source. Run node scripts/build-surface-worker.mjs.');
  } else fs.writeFileSync(target, normalized);
}
writeOrCheck('render-engine.js', output);
writeOrCheck('surface-worker-kernels.js', workerBootstrap);
writeOrCheck('worker-dependencies.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ operators:operators.length, functions:report.functions.length, variables:report.variables.length, modules:units.length, environment:manifest.environment.length, unknown:[], bytes:output.length, signature }, null, 2));
