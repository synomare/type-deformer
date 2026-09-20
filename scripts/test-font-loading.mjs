import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../font-loading.js',import.meta.url),'utf8');
function fixture(overrides={}){const c=vm.createContext({setTimeout,clearTimeout,ArrayBuffer,DataView,Uint8Array,...overrides});vm.runInContext(source,c);return c.TypeDeformerFontLoading;}
const bytes=name=>{const b=fs.readFileSync(new URL('../tests/fixtures/fonts/'+name,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
test('read supports absent or synchronously failing arrayBuffer APIs and rejects truncated cloud files',async()=>{
 let reads=0;class Reader{readAsArrayBuffer(file){reads++;this.result=file.data;this.onload();}}
 const F=fixture({FileReader:Reader}),data=bytes('narrow.ttf');
 assert.equal(await F.read({size:data.byteLength,data}),data);
 assert.equal(await F.read({size:data.byteLength,data,arrayBuffer(){throw Error('provider');}}),data);assert.equal(reads,2);
 await assert.rejects(F.read({size:0}),{code:'FONT_EMPTY'});await assert.rejects(F.read({size:100,arrayBuffer:async()=>new ArrayBuffer(3)}),{code:'FONT_READ'});
});
test('unresponsive file providers time out and a later retry remains possible',async()=>{
 const F=fixture();await assert.rejects(F.read({size:4,arrayBuffer:()=>new Promise(()=>{})},{timeout:10}),{code:'FONT_TIMEOUT'});
 class Reader{readAsArrayBuffer(){}abort(){this.onabort();}}
 await assert.rejects(fixture({FileReader:Reader}).read({size:4},{timeout:10}),{code:'FONT_TIMEOUT'});
 assert.equal((await F.read({size:4,arrayBuffer:async()=>new ArrayBuffer(4)})).byteLength,4);
});
test('collection extraction yields a standalone face with valid checksums and unchanged glyph tables',()=>{
 const F=fixture(),source=bytes('pair.ttc'),result=F.prepare(source),original=new DataView(source),face=new DataView(result.buffer);
 assert.equal(result.collectionCount,2);assert.equal(face.getUint32(0),0x10000);
 let sum=0;for(let at=0;at<face.byteLength;at+=4)sum=(sum+face.getUint32(at))>>>0;assert.equal(sum,0xB1B0AFBA);
 const base=original.getUint32(12),tables=new Map();for(let i=0;i<original.getUint16(base+4);i++){const at=base+12+i*16;tables.set(original.getUint32(at),[original.getUint32(at+8),original.getUint32(at+12)]);}
 for(let i=0;i<face.getUint16(4);i++){const at=12+i*16,tag=face.getUint32(at);if(tag===0x68656164)continue;const [offset,length]=tables.get(tag);assert.deepEqual(new Uint8Array(result.buffer,face.getUint32(at+8),face.getUint32(at+12)),new Uint8Array(source,offset,length));}
 for(const name of ['narrow.ttf','narrow.otf','narrow.woff','narrow.woff2']){const buffer=bytes(name);assert.equal(F.prepare(buffer).buffer,buffer);}
});
test('invalid font and collection data give actionable errors before browser registration',()=>{
 const F=fixture();assert.throws(()=>F.prepare(new Uint8Array([80,75,3,4]).buffer),{code:'FONT_FORMAT'});
 const b=bytes('pair.ttc');new DataView(b).setUint32(12,0xffffffff);assert.throws(()=>F.prepare(b),{code:'FONT_FORMAT'});
 assert.throws(()=>F.prepare(new ArrayBuffer(1)),{code:'FONT_FORMAT'});
 const missingHead=bytes('pair.ttc'),v=new DataView(missingHead),base=v.getUint32(12);for(let i=0;i<v.getUint16(base+4);i++){const at=base+12+i*16;if(v.getUint32(at)===0x68656164)v.setUint32(at,0x44534947);}assert.throws(()=>F.prepare(missingHead),{code:'FONT_FORMAT'});
});
test('face registration failures are reported and a new face can be loaded on retry',async()=>{
 let attempts=0;class Face{load(){return ++attempts===1?Promise.reject(Error('decode')):Promise.resolve(this);}}
 const F=fixture({FontFace:Face});await assert.rejects(F.loadFace('test',new ArrayBuffer(4)),{code:'FONT_DECODE'});assert.ok(await F.loadFace('test',new ArrayBuffer(4)) instanceof Face);
});
const editor=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('failed secondary registration rolls back the face and buffer, then retries the same file successfully',async()=>{
 const source=editor.match(/^      function ensureRuntimeFontLoaded\([^]*?^      \}/m)[0],installed=new Set(),buffers=new Map(),files=new Map([['test',{file:{},label:'Test'}]]);let attempt=0;
 const c=vm.createContext({studioFontBuffers:buffers,runtimeFontSources:{test:'file-pending'},runtimeFontLoads:new Map(),runtimeFontFiles:files,runtimeFontFaces:[],document:{fonts:{add:f=>installed.add(f),delete:f=>installed.delete(f)}},TypeDeformerFontLoading:{read:async()=>new ArrayBuffer(4),prepare:buffer=>({buffer,collectionCount:1}),loadFace:async()=>({})},axisFieldEditor:{register:async()=>{if(++attempt===1)throw Error('secondary registration');}},registerRuntimeFont(_family,_label,source){c.runtimeFontSources.test=source;}});
 vm.runInContext(source,c);await assert.rejects(c.ensureRuntimeFontLoaded('test'),/secondary/);assert.equal(buffers.size,0);assert.equal(installed.size,0);assert.equal(files.size,1);
 await c.ensureRuntimeFontLoaded('test');assert.equal(buffers.size,1);assert.equal(installed.size,1);assert.equal(files.size,0);assert.equal(c.runtimeFontLoads.size,0);
});
test('worker font payloads retain fonts used by individual glyphs but omit unused library records',()=>{
 const source=editor.match(/^      function surfaceWorkerFontRecords\([^]*?^      \}/m)[0],records=[{family:'Main Font'},{family:'Glyph Font'},{family:'Unused Font'}],c=vm.createContext({studioFontBuffers:new Map(records.map(r=>[r.family,r]))});vm.runInContext(source,c);
 assert.deepEqual(Array.from(c.surfaceWorkerFontRecords({params:{fontFamily:'"Main Font", serif'},glyphs:[{fontFamily:'"Glyph Font"'}]})).map(r=>r.family),['Main Font','Glyph Font']);
});
test('surface rendering chooses compatibility mode when workers lack a usable offscreen 2D API',()=>{
 const source=fs.readFileSync(new URL('../render-jobs.js',import.meta.url),'utf8');
 for(const [OffscreenCanvas,expected] of [[undefined,false],[class{getContext(){return null;}},false],[class{getContext(){return {};}},true]]){const c=vm.createContext({Worker:class{},FontFace:class{},OffscreenCanvas});vm.runInContext(source,c);assert.equal(c.TypeDeformerRenderJobs.supportsSurfaceWorker(),expected);}
});
