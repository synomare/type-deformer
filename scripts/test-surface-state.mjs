import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,metric} from './paragraph-current-fixture.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));

test('identical glyphs share immutable Surface settings; mixed strengths and profiles stay independent',()=>{
 const c=fixture(),a=metric(c,0,0),b=metric(c,30,0),d=metric(c,60,0);
 c.metrics=[a,b,d];c.operatorState(a,'tensorFiligree').current=1;c.operatorState(b,'tensorFiligree').current=1;c.operatorState(d,'tensorFiligree').current=.5;
 const glyphs=c.snapshotGlyphs(true);
 assert.equal(glyphs[0].surface,glyphs[1].surface);assert.notEqual(glyphs[0].surface,glyphs[2].surface);
 assert.equal(Object.isFrozen(glyphs[0].surface),true);
 assert.equal(glyphs[2].surface.tensorFiligree,.5);
 assert.equal(glyphs[0].surface.cloisterFold,0,'parameter alias cannot accidentally enable another effect');
 assert.equal(glyphs[0].surface.cloisterFoldAmount,c.params.cloisterFold);
 const prior=glyphs[0].surface.tensorSpacing;c.params.tensorSpacing=prior+1;c.invalidateCompositionSource();
 const next=c.snapshotGlyphs(true);assert.equal(glyphs[0].surface.tensorSpacing,prior);assert.equal(next[0].surface.tensorSpacing,prior+1);
 const local={...c.params,tensorSpacing:3};c.batchProfileForKey=(_,m)=>m===b?local:c.params;c.invalidateCompositionSource();
 const mixed=c.snapshotGlyphs(true);assert.notEqual(mixed[0].surface,mixed[1].surface);assert.equal(mixed[1].surface.tensorSpacing,3);
});

test('packed worker profiles round-trip every renderer field and preserve glyph-specific misregistration',()=>{
 const c=fixture();c.metrics=Array.from({length:300},(_,i)=>metric(c,i*20,0));
 for(const m of c.metrics)c.operatorState(m,'boneScaffold').current=1;
 c.operatorState(c.metrics[1],'misregistration').manual={x:-11,y:17};
 const before=c.snapshotGlyphs(true),packed=c.TypeDeformerSurfaceState.pack(before,c.params);
 assert.equal(packed.surfaces.length,2);
 assert.ok(JSON.stringify(packed).length<JSON.stringify(before).length*.15,'frame data scales with shared profiles, not glyphs times all parameters');
 const after=c.TypeDeformerSurfaceState.unpack(structuredClone(packed.glyphs),structuredClone(packed.surfaces),c.params);
 for(let i=0;i<before.length;i++){
  for(const key of Object.keys(before[i].surface))assert.equal(after[i].surface[key],before[i].surface[key],key);
  assert.equal(after[i].x,before[i].x);assert.equal(after[i].ch,before[i].ch);
 }
 assert.equal(after[1].surface.misregOffsetX,-11);assert.equal(after[1].surface.misregOffsetY,17);
 assert.equal(before[0].surfaceIndex,undefined,'packing never mutates cached glyphs');
 assert.equal(after[0].surface,after[2].surface);
 assert.throws(()=>c.TypeDeformerSurfaceState.unpack([{surfaceIndex:999}],[],{}),/Invalid Surface/);
});

test('clean glyphs have no Surface payload; legacy frame objects still unpack',()=>{
 const c=fixture();c.metrics=[metric(c,0,0)];const glyph=c.snapshotGlyphs(true)[0];assert.equal(glyph.surface,null);
 const packed=c.TypeDeformerSurfaceState.pack([glyph],c.params);assert.equal(packed.surfaces.length,0);
 const old=[{surface:{boneScaffold:1,boneMarrow:9}}];c.TypeDeformerSurfaceState.unpack(old,null,c.params);
 assert.equal(old[0].surface.boneMarrow,9);assert.equal(old[0].surface.boneWeight,c.params.boneWeight);
});

test('ink measurement reuses repeated glyphs but separates variable-font coordinates',()=>{
 let calls=0,weight=100;
 const ctx={measureText(){calls++;return {actualBoundingBoxLeft:0,actualBoundingBoxRight:weight,actualBoundingBoxAscent:16,actualBoundingBoxDescent:4};}};
 const c=fixture({document:{createElement:()=>({getContext:()=>ctx}),getElementById:()=>null},
  axisFieldEditor:{read(m){m.fontAxes={wght:m.testWeight};}},
  glyphFontSpec(m){weight=m.fontAxes.wght;return {font:'400 40px "Shared variable canvas family"'};}
 });
 c.metrics=[metric(c,0,0),metric(c,200,0),metric(c,600,0)];
 c.metrics[0].testWeight=100;c.metrics[1].testWeight=300;c.metrics[2].testWeight=100;
 const glyphs=c.snapshotGlyphs(true);assert.equal(calls,2);
 assert.equal(glyphs[0].bw,100);assert.equal(glyphs[1].bw,300);assert.equal(glyphs[2].bw,100);
});
