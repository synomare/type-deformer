import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source=fs.readFileSync(new URL('../font-registry.js',import.meta.url),'utf8');
const loading=fs.readFileSync(new URL('../font-loading.js',import.meta.url),'utf8');
const bytes=name=>{const b=fs.readFileSync(new URL('../tests/fixtures/fonts/'+name,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
function fixture(overrides={}){
 const context=vm.createContext({crypto:webcrypto,ArrayBuffer,DataView,Uint8Array,setTimeout,clearTimeout});vm.runInContext(loading,context);vm.runInContext(source,context);
 let reads=0,decodes=0;const installed=new Set();
 const registry=context.TypeDeformerFontRegistry.create({read:async file=>{reads++;return file.bytes;},prepare:context.TypeDeformerFontLoading.prepare,loadFace:async family=>{decodes++;return {family};},install:f=>installed.add(f),uninstall:f=>installed.delete(f),...overrides});
 return {F:context.TypeDeformerFontRegistry,registry,installed,reads:()=>reads,decodes:()=>decodes};
}
function file(name,buffer,lastModified=1){return {name,size:buffer.byteLength,lastModified,bytes:buffer};}
function sourceFile(registry,name='narrow.ttf',buffer=bytes('narrow.ttf'),lastModified=1){return registry.addSource({label:name,file:file(name,buffer,lastModified)});}
test('directory registration is lazy and content identity survives rename, move and mtime changes',async()=>{
 const x=fixture(),r=x.registry,data=bytes('narrow.ttf');const a=sourceFile(r,'before.ttf',data,1),b=sourceFile(r,'renamed.ttf',data,99999);
 assert.notEqual(a,b);assert.equal(x.reads(),0);assert.equal(x.decodes(),0);
 const first=await r.ensure(a),second=await r.ensure(b);assert.equal(first.family,second.family);assert.match(first.family,/^Type Deformer SHA256 [a-f0-9]{64} F0$/);assert.equal(x.reads(),2);assert.equal(x.decodes(),1);assert.equal(r.records.size,1);
 const manifest=r.manifest('"'+first.family+'", serif');assert.equal(manifest.fonts[0].sourceHash,first.sourceHash);assert.equal(manifest.fonts[0].faceIndex,0);assert.equal(manifest.fonts[0].bufferHash,first.bufferHash);
 const reopened=fixture();reopened.registry.restore(JSON.parse(JSON.stringify(manifest)));assert.equal(reopened.registry.inspect(first.family).ready,false);
 const moved=sourceFile(reopened.registry,'new-directory/new-name.ttf',data,98765);await reopened.registry.ensure(moved);assert.equal(reopened.registry.inspect(first.family).ready,true);
});
test('identical metadata never substitutes different font bytes, and legacy relink requires explicit confirmation',async()=>{
 const x=fixture(),r=x.registry;const narrow=await r.ensure(sourceFile(r,'same.ttf',bytes('narrow.ttf'),7));
 const wide=await r.ensure(sourceFile(r,'same.ttf',bytes('wide.ttf'),7));assert.notEqual(narrow.family,wide.family);assert.equal(r.records.size,2);
 const legacy='Type Deformer same deadbeef';r.restore({version:1,fonts:[{family:legacy,label:'same.ttf',sourceHash:wide.sourceHash}]});
 assert.equal(r.inspect(legacy).fonts[0].state,'relink-required');assert.throws(()=>r.assertReady(legacy),{code:'FONT_DEPENDENCY_MISSING'});
 assert.throws(()=>r.relink(legacy,wide.family),{code:'FONT_RELINK_CONFIRM'});assert.equal(r.relink(legacy,wide.family,true).family,wide.family);
 assert.throws(()=>r.relink(narrow.family,wide.family),{code:'FONT_RELINK_CONFIRM'});assert.equal(r.relink(narrow.family,narrow.family).exact,true);
});
test('concurrent identical sources decode once and failure of secondary registration remains retryable',async()=>{
 let registrations=0;const x=fixture({register:async()=>{registrations++;await new Promise(r=>setTimeout(r,10));if(registrations===1)throw Error('secondary registration');}}),r=x.registry;
 const first=sourceFile(r),second=sourceFile(r,'alias.ttf');const results=await Promise.allSettled([r.ensure(first),r.ensure(second)]);
 assert.equal(results.filter(r=>r.status==='rejected').length,2);assert.equal(x.installed.size,0);assert.equal(r.records.size,0);assert.equal(r.sources.size,2);assert.equal(r.loading.size,0);assert.equal(x.decodes(),1);
 const loaded=await Promise.all([r.ensure(first),r.ensure(second)]);assert.equal(loaded[0].family,loaded[1].family);assert.equal(x.installed.size,1);assert.equal(r.records.size,1);assert.equal(r.sources.size,0);assert.equal(r.loading.size,0);assert.equal(x.decodes(),2);
});
test('collection identity records the original content and face separately from decoded buffer',async()=>{
 const x=fixture(),record=await x.registry.ensure(sourceFile(x.registry,'pair.ttc',bytes('pair.ttc')));
 assert.equal(record.faceIndex,0);assert.notEqual(record.bufferHash,record.sourceHash);assert.equal(new DataView(record.buffer).getUint32(0),0x10000);assert.match(record.label,/collection先頭書体/);
});
test('dependency collection includes active nested objects, retains external fallback health, and ignores inactive look history',async()=>{
 const x=fixture(),record=await x.registry.ensure(sourceFile(x.registry));const input={params:{fontFamily:'"'+record.family+'", serif'},textObjects:[{style:{fontFamily:'Missing External'}}],lookMemory:{slots:[{state:{params:{fontFamily:'Type Deformer old inactive'}}}]}};
 const result=x.registry.assertReady(input,()=> 'fallback');assert.equal(result.ready,true);assert.equal(result.fonts.length,2);assert.equal(result.issues[0].family,'Missing External');assert.equal(result.issues[0].state,'fallback');assert.equal(result.issues[0].blocking,false);
 input.textObjects.push({style:{fontFamily:'Type Deformer missing active'}});assert.throws(()=>x.registry.assertReady(input),{code:'FONT_DEPENDENCY_MISSING'});
});
test('manifest metadata cannot override a content ID or retain stale requirements after restore',()=>{
 const x=fixture(),family=x.F.familyName('a'.repeat(64),0);x.registry.restore({version:1,fonts:[{family,sourceHash:'b'.repeat(64),faceIndex:99,label:'Saved'}]});
 const saved=x.registry.manifest(family).fonts[0];assert.equal(saved.sourceHash,'a'.repeat(64));assert.equal(saved.faceIndex,0);assert.equal(saved.label,'Saved');
 x.registry.restore(null);assert.equal(x.registry.manifest(family).fonts[0].label,family);
});
