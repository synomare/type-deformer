import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../operator-catalog.js';
const C=globalThis.TypeDeformerCatalog,html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const ids=[...html.matchAll(/^\s+(\w+): \{ id: '\1', short:/gm)].map(m=>m[1]);
test('every real operator has an intentional purpose, basic tools stay first',()=>{
 assert.equal(ids.length,116);for(const id of ids)assert.ok(C.purposes(id).length,id);
 for(const group of Object.values(C.groups))for(const id of group)assert.ok(ids.includes(id),'unknown catalog id '+id);
 assert.deepEqual(C.order(ids).slice(0,6),C.basic);assert.equal(new Set(C.order(ids)).size,ids.length);
});
test('all 116 operators expose release metadata and a matching panel',()=>{
 const intents=new Set(C.intents.map(intent=>intent.id)),scopes=new Set(['glyph','relation','layout','surface']);
 assert.equal(intents.size,6);assert.equal(Object.keys(C.metadata).length,116);assert.equal(C.featured.length,12);
 for(const id of ids){const meta=C.metadata[id];assert.ok(meta,id);assert.ok(meta.intents.length,id);for(const intent of meta.intents)assert.ok(intents.has(intent),id+':'+intent);for(const scope of meta.scopes)assert.ok(scopes.has(scope),id+':'+scope);assert.ok(['instant','async'].includes(meta.preparation),id);assert.ok(['text','camera-optional'].includes(meta.input),id);assert.ok(['native','embedded-raster'].includes(meta.svgFidelity),id);assert.equal(meta.svgFidelity==='embedded-raster',C.surfaceIds.includes(id),id);assert.match(html,new RegExp('data-operator-panel="'+id+'"'),id+' panel');}
 assert.equal(C.metadata.blobTrack.input,'camera-optional');
 assert.deepEqual(ids.filter(id=>C.metadata[id].preparation==='async'),['differentialType','conformalType','auxeticType','marblingType']);
});
test('all gallery examples are real decodable-size PNG assets with rendering provenance',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../assets/operator-previews/manifest.json',import.meta.url),'utf8'));
 const entries=manifest.examples;
 assert.ok(entries,'preview manifest records');
 for(const id of ids){
   const record=entries.find(x=>x.id===id);assert.ok(record,'rendered example '+id);assert.equal(record.seed,17);assert.match(record.source,/actual Type Deformer renderer/);
   const png=fs.readFileSync(new URL('../assets/operator-previews/'+id+'.png',import.meta.url));
   assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),208);assert.equal(png.readUInt32BE(20),172);
 }
});
