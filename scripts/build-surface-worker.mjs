import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const root=repo;
const acorn={};new Function('exports','module',process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'])(acorn,{exports:acorn});
const html=fs.readFileSync(path.join(repo,'index.html'),'utf8'),offset=html.lastIndexOf('<script>')+8,source=html.slice(offset,html.indexOf('</script>',offset));
const ast=acorn.parse(source,{ecmaVersion:'latest'}),text=n=>source.slice(n.start,n.end);
let body;function find(n){if(!n||typeof n!=='object'||body)return;if(n.type==='FunctionExpression'&&n.body.body.some(s=>s.type==='FunctionDeclaration'&&s.id.name==='renderSurfaceFxLayer')){body=n.body.body;return;}Object.values(n).forEach(v=>Array.isArray(v)?v.forEach(find):find(v));}find(ast);
const declarations=new Map();for(const node of body){if(node.type==='FunctionDeclaration')declarations.set(node.id.name,{node,code:text(node),start:node.start});else if(node.type==='VariableDeclaration')for(const d of node.declarations)if(d.id.type==='Identifier')declarations.set(d.id.name,{node:d.init,code:'var '+text(d)+';',start:d.start});}
function pattern(n,set){if(!n)return;if(n.type==='Identifier')set.add(n.name);else if(n.type==='ObjectPattern')n.properties.forEach(p=>pattern(p.value||p.argument,set));else if(n.type==='ArrayPattern')n.elements.forEach(x=>pattern(x,set));else if(n.type==='AssignmentPattern')pattern(n.left,set);else if(n.type==='RestElement')pattern(n.argument,set);}
function locals(n,set,initial=true){if(!n||typeof n!=='object')return;if(!initial&&['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type)){if(n.type==='FunctionDeclaration')pattern(n.id,set);return;}if(n.type==='VariableDeclarator')pattern(n.id,set);if(n.type==='CatchClause')pattern(n.param,set);for(const [key,value]of Object.entries(n))if(key!=='start'&&key!=='end'){if(Array.isArray(value))value.forEach(v=>locals(v,set,false));else locals(value,set,false);}}
function refs(node){const found=new Set();function walk(n,bound,parent,property){if(!n||typeof n!=='object')return;
 if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type)){bound=new Set(bound);pattern(n.id,bound);n.params.forEach(p=>pattern(p,bound));locals(n.body,bound);}
 if(n.type==='Identifier'){
  const ignore=parent&&(parent.type==='MemberExpression'&&property==='property'&&!parent.computed||['Property','MethodDefinition'].includes(parent.type)&&property==='key'&&!parent.computed||['VariableDeclarator','FunctionDeclaration','FunctionExpression'].includes(parent.type)&&property==='id'||['LabeledStatement','BreakStatement','ContinueStatement'].includes(parent.type)&&property==='label');
  if(!ignore&&!bound.has(n.name))found.add(n.name);return;
 }
 for(const [k,v]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(x=>walk(x,bound,n,k));else if(v&&typeof v==='object')walk(v,bound,n,k);}
 }walk(node,new Set());return found;}
const renderFn=declarations.get('renderSurfaceFxLayer').node,renderers=renderFn.body.body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name==='renderers')).declarations.find(d=>d.id.name==='renderers').init;
const nativeIds=['contextualFit','scrollType','anamorphicType'];
const entries=renderers.properties.filter(p=>!nativeIds.includes(p.key.name));
const supplied=new Set(['params','compositionState','renderedSourceText','surfaceFxPhase','dataMoshFrame','axisFieldEditor','blobTrackState','surfaceFxScratchCanvases','workerFontMetrics','workerCompositionInputs','workerSourceGlyphs','workerCompositionGenerators','compositionScene','compositionQualityOverride','textInput','window','document','navigator','performance','ImageData','Path2D','DOMMatrix','FontFace','OffscreenCanvas','console','globalThis','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame','atob','btoa','fetch','AbortController','ArrayBuffer','DataView','Uint8Array','Uint8ClampedArray','Int32Array','Uint32Array','Float32Array','Float64Array','Uint16Array','Int16Array','Worker','Symbol','Intl','Math','Object','Number','Array','String','Boolean','Map','Set','WeakMap','WeakSet','JSON','Infinity','NaN','Promise','Error','TypeError','RangeError','Date','RegExp','isFinite','parseFloat','parseInt','encodeURIComponent','decodeURIComponent','URL','URLSearchParams','undefined','arguments']);
const override={
 differentialScheduleWork:'function differentialScheduleWork(){}',conformalScheduleWork:'function conformalScheduleWork(){}',auxeticScheduleWork:'function auxeticScheduleWork(){}',marblingScheduleWork:'function marblingScheduleWork(){}',
 differentialUpdateStatus:'function differentialUpdateStatus(){return differentialController.state;}',conformalUpdateStatus:'function conformalUpdateStatus(){return conformalPool.state();}',auxeticUpdateStatus:'function auxeticUpdateStatus(){return auxeticPool.state();}',marblingUpdateStatus:'function marblingUpdateStatus(){return marblingPool.state();}',

 fontMetrics:'function fontMetrics(){return workerFontMetrics;}',
 updateConformalStatus:'function updateConformalStatus(){}',updateAuxeticStatus:'function updateAuxeticStatus(){}',updateMarblingStatus:'function updateMarblingStatus(){}',

 createCompositionInputBus:'function createCompositionInputBus(){return workerCompositionInputs;}',
 snapshotGlyphs:'function snapshotGlyphs(){return workerSourceGlyphs;}',
 compositionEngineContract:'function compositionEngineContract(){}',
 generateCompositionScene:'function generateCompositionScene(width,height){compositionScene={width:width,height:height};var compiled=compileCompositionSource(workerSourceGlyphs,width,height,compositionState);if(!compiled.tokens.length)return {glyphs:[],bands:[],width:width,height:height,masks:[],rasterPasses:[]};var generated=workerCompositionGenerators[compositionState.type](compiled.tokens,width,height,compiled);generated.glyphs=generated.glyphs||[];generated.bands=generated.bands||[];generated.masks=generated.masks||[];generated.rasterPasses=generated.rasterPasses||[];generated=applyCompositionSignalRouter(generated,compiled,width,height);generated=applyCompositionLegibility(generated);generated.width=width;generated.height=height;generated.engine=compositionState.type;generated.clock=compiled.clock;return generated;}',

 counterformSetRenderError:'function counterformSetRenderError() {}',
 glyphFontSpec:'function glyphFontSpec(g,size){return axisFieldEditor.font(g,size);}',
 isIOSLike:"function isIOSLike(){return false;}",
 updateDifferentialStatus:'function updateDifferentialStatus() {}',
 scheduleSurfaceFxDraw:'function scheduleSurfaceFxDraw() {}',scheduleCompositionDraw:'function scheduleCompositionDraw() {}'
};
const composeGenerators={field:'generateFieldScene',fluxRows:'generateFluxScene',cascade:'generateCascadeScene',contourAtlas:'generateContourAtlasScene',feedbackChamber:'generateFeedbackChamberScene',typeMatrix:'generateTypeMatrixScene',pathLoom:'generatePathLoomScene',glyphVessel:'generateGlyphVesselScene'};
const needed=new Set(),unknown=new Set(),stack=entries.flatMap(p=>[...refs(p.value)]);
for(const name of ['surfaceCanonicalRasterPlan','differentialEffectPad','conformalEffectPad','auxeticEffectPad','marblingEffectPad','surfaceOutputOpacity','surfaceBlendMode','generateCompositionScene','applyCompositionSignalRouter','applyCompositionLegibility','compileCompositionSource','applyCompositionFxRack','differentialPrepare','conformalPrepare','auxeticPrepare','marblingPrepare','differentialAssertReady','conformalAssertReady','auxeticAssertReady','marblingAssertReady',...Object.values(composeGenerators)])stack.push(name);
while(stack.length){const name=stack.pop();if(needed.has(name)||supplied.has(name)||name.startsWith('TypeDeformer'))continue;if(override[name]){needed.add(name);continue;}const decl=declarations.get(name);if(!decl){unknown.add(name);continue;}needed.add(name);refs(decl.node).forEach(dep=>stack.push(dep));}
const report={operators:entries.map(p=>p.key.name),nativeIds,functions:[...needed].filter(n=>declarations.get(n)?.node?.type==='FunctionDeclaration'),variables:[...needed].filter(n=>declarations.get(n)?.node?.type!=='FunctionDeclaration'),unknown:[...unknown]};
if(unknown.size)throw new Error('Worker dependencies are not supplied: '+[...unknown].join(', '));
const reportPath=path.join(repo,'worker-dependencies.json'),reportText=JSON.stringify(report,null,2);
if(process.argv.includes('--check')){if(fs.readFileSync(reportPath,'utf8')!==reportText)throw new Error('Worker dependency manifest differs from editor source. Run node scripts/build-surface-worker.mjs.');}else fs.writeFileSync(reportPath,reportText);
const generated=[...needed].sort((a,b)=>(declarations.get(a)?.start||0)-(declarations.get(b)?.start||0)).map(name=>override[name]||declarations.get(name).code).join('\n\n');
const result=generated+'\nvar workerCompositionGenerators={'+Object.entries(composeGenerators).map(([k,v])=>k+':'+v).join(',')+'};\nvar workerRenderers={'+entries.map(p=>['conformalType','auxeticType','marblingType'].includes(p.key.name)?p.key.name+':function(ctx,glyphs,width,height,pixelScale,L,fm,coverBase,livePreview){return '+text(p.value)+'(ctx,glyphs,pixelScale,L,fm,livePreview);}':text(p)).join(',\n')+'};\n';
const target=path.join(repo,'surface-worker-kernels.js');if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==result)throw new Error('Worker kernels differ from editor source. Run node scripts/build-surface-worker.mjs.');}else fs.writeFileSync(target,result);
console.log(JSON.stringify({operators:report.operators.length,functions:report.functions.length,variables:report.variables,unknown:report.unknown,bytes:generated.length},null,2));
