import {createAuthoredTestContext} from './authored-test-context.mjs';
import {readAuthoredSource, readPageMarkup} from './source-reader.mjs';
const markup = readPageMarkup();
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const authoredSource=readAuthoredSource();
const extract=name=>authoredSource.match(new RegExp('      function '+name+'\\([^]*?\\n      }'))[0];
function fixture(){
 const c=createAuthoredTestContext({params:{amount:1,other:8},batchProfiles:{},activeBatchProfile:'latin',batchResolvedProfiles:new Map(),CONFUSE_DATA:{},
  BATCH_PROFILE_LABELS:{all:'All',latin:'Latin',vowel:'Vowel',accent:'Accent'},
  BATCH_TARGETS:{byKey:{all:{},latin:{},vowel:{test:true,parent:'latin'},accent:{test:true,parent:'latin'}},keys:()=>['latin','vowel','accent']}});
 c.batchResolvedSource=c.batchProfiles;c.batchResolvedDictionary=c.CONFUSE_DATA;
 vm.runInContext(['batchSourceText','sourceParameterProfile','batchProfileForKey','effectiveParameterSource'].map(extract).join('\n'),c);
 return c;
}
test('displayed parameter provenance follows actual All, class, overlapping subtype and source precedence',()=>{
 const c=fixture(),glyph={batchKey:'latin',sourceText:'é'};
 const check=(kind,owner,value)=>{const result=c.effectiveParameterSource('amount',glyph);assert.equal(result.kind,kind);assert.equal(result.owner,owner);assert.equal(result.value,value);assert.equal(result.value,c.batchProfileForKey('latin',glyph).amount);};
 check('all','all',1);
 c.batchProfiles.latin={amount:2,other:8};c.batchResolvedProfiles.clear();check('batch','latin',2);
 c.batchProfiles.vowel={amount:3};c.batchProfiles.accent={amount:4};c.batchResolvedProfiles.clear();check('batch','accent',4);
 glyph.localParams={amount:5};check('range','range',5);
 delete glyph.localParams;check('batch','accent',4);
 delete c.batchProfiles.accent.amount;c.batchResolvedProfiles.clear();check('batch','vowel',3);
});
test('missing source overrides retain inherited value and manual deformation does not become a parameter owner',()=>{
 const c=fixture(),glyph={batchKey:'latin',sourceText:'é',localParams:{other:6},operatorStates:{rotate:{manual:45}}};
 assert.equal(c.effectiveParameterSource('amount',glyph).owner,'all');assert.equal(c.effectiveParameterSource('amount',glyph).value,1);
 assert.equal(c.effectiveParameterSource('other',glyph).owner,'range');assert.equal(c.effectiveParameterSource('other',glyph).value,6);
});
