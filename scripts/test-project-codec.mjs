import {createAuthoredTestContext} from './authored-test-context.mjs';
import {readAuthoredSource, readPageMarkup} from './source-reader.mjs';
const markup = readPageMarkup();
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
await import('../operator-registry.js');
await import('../parameter-model.js');
await import('../parameter-definitions.js');
await import('../text-layout.js');
await import('../document-layout.js');
await import('../project-codec.js');
const codec=globalThis.TypeDeformerProjectCodec;
const registry=globalThis.TypeDeformerOperatorRegistry;
const parameters=globalThis.TypeDeformerParameters;
const authoredSource=readAuthoredSource();
function functionSource(name){const source=authoredSource.match(new RegExp('^      function '+name+'\\([^]*?^      }','m'));assert.ok(source,name);return source[0];}
const project=()=>({app:'type-deformer',version:92,text:'A\tB אבג',params:{fontSize:100},letters:[{t:0,l:0,i:0,d:'字'}]});
test('old Projects validate without mutating their original and retain source version',()=>{
 const old=project(),before=JSON.stringify(old),result=codec.validate(old,{defaults:{fontSize:52}});
 assert.equal(result.sourceVersion,92);result.data.params.fontSize=20;assert.equal(JSON.stringify(old),before);
});
test('malformed and future files reject before editor application',()=>{
 for(const mutate of [p=>p.version='banana',p=>p.version=94,p=>p.params.fontSize='bad',p=>p.text={},p=>p.letters={},p=>p.letters=[3],p=>p.params.fontSize=Infinity]){
  const p=project();mutate(p);assert.throws(()=>codec.validate(p,{defaults:{fontSize:52}}),{code:'PROJECT_INVALID'});
 }
});
test('prototype keys, cycles and excessive nesting are rejected',()=>{
 const proto=JSON.parse('{"app":"type-deformer","params":{"__proto__":{"polluted":true}}}');assert.throws(()=>codec.validate(proto));
 const p=project();p.params.self=p;assert.throws(()=>codec.validate(p));
 const q=project();let at=q.params;for(let n=0;n<70;n++)at=at.more={};assert.throws(()=>codec.validate(q));assert.equal({}.polluted,undefined);
});
test('declared mathematical domains apply to import as well as controls',()=>{
 const parameters={validate:(key,value)=>value>0?{ok:true}:{ok:false,reason:'positive'}};
 const p=project();p.params.fontSize=0;assert.throws(()=>codec.validate(p,{defaults:{fontSize:52},parameters}),/params.fontSize: positive/);
});
test('unknown settings survive the codec with a visible migration diagnostic',()=>{
 const p=project();p.params.futureSetting=3;const r=codec.validate(p,{defaults:{fontSize:52}});assert.equal(r.data.params.futureSetting,3);assert.equal(r.warnings[0].path,'params.futureSetting');
});
test('document captures are independent, revisions monotonic, and branches have distinct IDs',()=>{
 const s=codec.session(),a=s.capture(project());s.changed();const b=s.capture(project());assert.equal(b.document.revision,a.document.revision+1);
 b.params.fontSize=200;assert.equal(a.params.fontSize,100);const id=s.metadata().id;s.reset(b.document,true);assert.notEqual(s.metadata().id,id);assert.equal(s.metadata().revision,0);
});
test('frozen render data cannot share mutable project objects',()=>{
 const p=project(),render=codec.freeze(codec.clone(p));p.params.fontSize=12;assert.equal(render.params.fontSize,100);assert.throws(()=>{render.params.fontSize=13;},TypeError);
});

test('source identities and per-letter parameter types are validated before application',()=>{
 const p=project();p.letters=[{source:{id:'one',start:0,end:1,text:'A'},p:{fontSize:20}}];
 assert.doesNotThrow(()=>codec.validate(p,{defaults:{fontSize:52}}));
 const duplicate=structuredClone(p);duplicate.letters.push(structuredClone(duplicate.letters[0]));assert.throws(()=>codec.validate(duplicate),/文字ID/);
 const bad=structuredClone(p);bad.letters[0].source.end=1000;assert.throws(()=>codec.validate(bad),/位置情報/);
 p.letters[0].p.fontSize='bad';assert.throws(()=>codec.validate(p,{defaults:{fontSize:52}}),/letters.0.p.fontSize/);
});

test('malformed known compact operator states reject before their values can be coerced',()=>{
 const invalid=[
  ['rotate',{t:'false',i:'bad',m:'bad'},'.t'], ['rotate',{t:2},'.t'], ['rotate',{t:null},'.t'],
  ['rotate',{i:'bad'},'.i'], ['rotate',{i:null},'.i'], ['rotate',{i:-.1},'.i'], ['rotate',{i:1.1},'.i'],
  ['rotate',{m:'bad'},'.m'], ['rotate',{m:{x:1,y:2}},'.m'], ['webbing',{m:1.1},'.m'],
  ['skew',{m:5},'.m'], ['skew',{m:{x:1}},'.m.y'], ['skew',{m:{x:90,y:0}},'.m.x'],
  ['mirror',{m:{x:2,y:0}},'.m.x'], ['dataMosh',{m:{x:1,y:'bad'}},'.m.y'],
  ['blobTrack',{m:{x:2001,y:0}},'.m.x'], ['rotate',null,''], ['rotate',[], ''], ['rotate',1,'']
 ];
 for(const [id,state,suffix] of invalid){
  const p=project();p.letters[0].o={[id]:state};const original=JSON.stringify(p);
  assert.throws(()=>codec.validate(p,{parameters}),error=>error.code==='PROJECT_INVALID'&&error.message.startsWith('letters.0.o.'+id+suffix+':'),id+' '+JSON.stringify(state));
  assert.equal(JSON.stringify(p),original,'failure leaves the original untouched');
 }
});

test('actual Project and compact Share serializers keep their legitimate operator representations',()=>{
 const context=createAuthoredTestContext({OPERATOR_DEFS:registry.tables.OPERATOR_DEFS,OPERATOR_IDS:registry.specs.map(s=>s.id),
  OPERATOR_BY_SHORT:Object.fromEntries(registry.specs.map(s=>[s.short,s.id])),params:{frozenMoment:false},readOperatorState:(m,id)=>m.operatorStates[id]});
 vm.runInContext(['cloneManualValue','sparseOperatorState','encodeOperatorStates','decodeOperatorStates'].map(functionSource).join('\n'),context);
 const states=Object.fromEntries(registry.specs.filter(s=>s.id!=='stretch').map(s=>[s.id,{toggled:true,current:.75,manual:.5}]));
 Object.assign(states.rotate,{manual:7200.125});Object.assign(states.baselineShift,{manual:-24.5});
 Object.assign(states.skew,{manual:{x:-104.25,y:95.5}});Object.assign(states.mirror,{manual:{x:-1,y:.5}});
 Object.assign(states.dataMosh,{manual:{x:510,y:-320}});Object.assign(states.blobTrack,{manual:{x:-1024,y:1800}});
 Object.assign(states.misregistration,{manual:{x:64,y:-32}});
 const metric={operatorStates:states};
 const fixtures=[context.sparseOperatorState(metric),context.decodeOperatorStates(context.encodeOperatorStates(metric))];
 for(const version of [4,29,92,93])for(const saved of fixtures){
  const p=project();p.version=version;p.letters[0].o=JSON.parse(JSON.stringify(saved));
  const result=codec.validate(p,{parameters});assert.deepEqual(result.data,p);assert.deepEqual(result.warnings,[]);
 }
 const partial=project();partial.letters[0].o={rotate:{t:true,m:null},webbing:{t:false},dataMosh:{m:.4},blobTrack:{m:0},misregistration:{m:1}};
 assert.deepEqual(codec.validate(partial,{parameters}).data,partial,'boolean toggles, sparse records and scalar Surface history survive');
});

test('unknown operator data and extension fields survive with explicit warnings',()=>{
 const p=project();p.letters[0].o={futureInk:{t:'future-toggle',payload:[1,2]},retiredEffect:null,
  rotate:{t:1,i:.5,m:24,futureCurve:{type:'spring'}},mirror:{m:{x:1,y:0,z:3}}};
 const result=codec.validate(p,{parameters});assert.deepEqual(result.data,p);
 assert.deepEqual(result.warnings.map(w=>w.path),['letters.0.o.futureInk','letters.0.o.retiredEffect','letters.0.o.rotate.futureCurve','letters.0.o.mirror.m.z']);
 result.data.letters[0].o.futureInk.payload.push(3);assert.deepEqual(p.letters[0].o.futureInk.payload,[1,2]);
});

test('operator validation requires the canonical registry or an explicit injected registry',()=>{
 const context=createAuthoredTestContext({});vm.runInContext(fs.readFileSync(new URL('../project-codec.js',import.meta.url),'utf8'),context);
 const p=project();p.letters[0].o={rotate:{t:1,i:.5,m:24}};
 assert.throws(()=>context.TypeDeformerProjectCodec.validate(p),/Operator定義/);
 assert.doesNotThrow(()=>context.TypeDeformerProjectCodec.validate(p,{operatorRegistry:registry,parameters}));
});

test('source references match exact source slices for graphemes, joining runs and CRLF legacy migration',()=>{
 const layout=globalThis.TypeDeformerTextLayout;
 const segment=text=>Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),part=>part.segment);
 const info=text=>({joins:/[\u0600-\u06ff]/.test(text),rtl:/[\u0590-\u06ff]/.test(text),punct:false});
 const context=createAuthoredTestContext({tokenizeLine:line=>layout.tokenizeLine(line,segment,info)});
 vm.runInContext(functionSource('tokenizeSourceLines'),context);
 const p=project();p.version=93;p.text='A\u0301👩🏽‍💻\tلا\u00a0\r\nאבג';
 const tokens=Array.from(context.tokenizeSourceLines(p.text).flat()).filter(token=>!token.space);
 p.letters=tokens.map(token=>({source:layout.reference({dataset:{sourceId:layout.assignIdentity(token),sourceStart:token.sourceStart,
  sourceEnd:token.sourceEnd,sourceText:token.text,sourceUnit:token.unit,sourceClusters:JSON.stringify(token.clusters)},textContent:'派生字形'}),d:'派生字形'}));
 assert.deepEqual(codec.validate(p).data,p);
 const bad=structuredClone(p);bad.letters[0].source.text='Á';assert.throws(()=>codec.validate(bad),/source.text: 原文の範囲/);
 const legacy=project();legacy.text=p.text;legacy.letters=layout.migrateLegacyStates(legacy.text,tokens.map(()=>({t:0,i:0})),segment,info);
 assert.deepEqual(codec.validate(legacy).data,legacy,'legacy visual-order references also carry exact source text');
});

test('document metadata rejects invalid identity and revision while legacy omissions remain valid',()=>{
 const p=project();assert.doesNotThrow(()=>codec.validate(p));
 for(const document of [{},{id:'legacy-document'},{revision:0},{id:'saved-document',revision:Number.MAX_SAFE_INTEGER}]){
  p.document=document;assert.deepEqual(codec.validate(p).data,p);
 }
 for(const document of [{id:''},{id:null},{id:17},{revision:'1'},{revision:null},{revision:-1},{revision:1.5},{revision:Number.MAX_SAFE_INTEGER+1}]){
  p.document=document;assert.throws(()=>codec.validate(p),/document\.(id|revision)/);
 }
});

test('editor newline preparation keeps source IDs, clusters, object ranges and the raw original',()=>{
 const p=project();p.version=93;p.text='A\r\nB\rC';
 p.letters=[{source:{id:'saved-a',start:0,end:1,text:'A',clusters:[{start:0,end:1}]},o:{rotate:{t:1,i:1,m:11}}},
  {source:{id:'saved-b',start:3,end:4,text:'B',clusters:[{start:3,end:4}]},o:{rotate:{t:1,i:1,m:37}}},
  {source:{id:'saved-c',start:5,end:6,text:'C',clusters:[{start:5,end:6}]},o:{rotate:{t:1,i:1,m:-21}}}];
 p.params.textObjects=JSON.stringify([{id:'one',start:0,end:1,futureLayout:'retained'},{id:'two',start:3,end:4},{id:'three',start:5,end:6}]);
 const original=JSON.stringify(p);codec.validate(p,{parameters});
 const result=codec.prepareEditorText(p),prepared=result.data;
 assert.equal(prepared.text,'A\nB\nC');assert.equal(result.corrections[0].path,'text');
 assert.equal(JSON.stringify(p),original,'the raw recovery source must never be normalized in place');
 assert.deepEqual(prepared.letters.map(s=>s.source.id),['saved-a','saved-b','saved-c']);
 assert.deepEqual(prepared.letters.map(s=>[s.source.start,s.source.end]),[[0,1],[2,3],[4,5]]);
 assert.deepEqual(prepared.letters.map(s=>s.source.clusters),[[{start:0,end:1}],[{start:2,end:3}],[{start:4,end:5}]]);
 const objects=JSON.parse(prepared.params.textObjects);assert.equal(objects[0].futureLayout,'retained');
 assert.deepEqual(objects.map(o=>[o.start,o.end]),[[0,1],[2,3],[4,5]]);
 assert.doesNotThrow(()=>TypeDeformerDocument.objects(prepared.params.textObjects,prepared.text));
 assert.deepEqual(codec.validate(prepared,{parameters}).data,prepared);
 const elements=['A','B','C'].map((text,i)=>({dataset:{sourceId:'fresh-'+i,sourceStart:String(i*2),sourceEnd:String(i*2+1),sourceText:text},textContent:text}));
 assert.deepEqual(TypeDeformerTextLayout.mapStates(elements,prepared.letters).map(s=>s.o.rotate.m),[11,37,-21]);
 assert.equal(codec.prepareEditorText(prepared).data,prepared,'canonical LF input needs no second copy');
 assert.deepEqual(codec.prepareEditorText(prepared).corrections,[]);
 const apply=functionSource('applyProjectData');assert.ok(apply.indexOf('prepareEditorText(data)')<apply.indexOf('prepareProjectMigration(data)'));
});

test('legacy positional states remain positional until the existing visual-order migration',()=>{
 const p=project();p.text='A\r\nB';p.letters=[{t:1,i:.5},{o:{rotate:{t:1,i:1,m:25}}}];
 const prepared=codec.prepareEditorText(p).data;
 assert.equal(prepared.text,'A\nB');assert.deepEqual(prepared.letters,p.letters);
 assert.equal(prepared.letters.some(letter=>letter.source),false);
});
