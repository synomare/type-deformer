import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({ Intl });
vm.runInContext(fs.readFileSync(new URL('../text-layout.js', import.meta.url), 'utf8'), context);
const T = context.TypeDeformerTextLayout;
const segment = text => Array.from(new Intl.Segmenter('ja', {granularity:'grapheme'}).segment(text), s=>s.segment);
const info = text => ({ joins:/[\p{Script=Arabic}\p{Script=Thai}\p{Script=Devanagari}]/u.test(text), rtl:/[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(text), punct:/\p{P}/u.test(text) });
const plain = value => JSON.parse(JSON.stringify(value));
function elements(text) {
  return T.tokenizeLine(text,segment,info).filter(t=>!t.space).map(t=>({dataset:{sourceId:T.assignIdentity(t),sourceStart:String(t.sourceStart),sourceEnd:String(t.sourceEnd),sourceText:t.text,sourceUnit:t.unit,sourceClusters:JSON.stringify(t.clusters)},textContent:t.text}));
}
test('logical units retain distinct whitespace, controls, joining runs and UTF-16 cluster ranges',()=>{
  const text='A\tB C\u00a0D\u2067אב\u2069 ภาษาไทย ก\u0301 👨‍👩‍👧';
  const tokens=T.tokenizeLine(text,segment,info);
  assert.equal(tokens.map(t=>t.text).join(''),text);
  assert.deepEqual(plain(tokens.filter(t=>t.whitespace).slice(0,3).map(t=>[t.text,t.whitespace])),[['\t','tab'],[' ','space'],['\u00a0','nonbreaking']]);
  assert.equal(tokens.filter(t=>t.control).length,2);
  const thai=tokens.find(t=>t.text==='ภาษาไทย');
  assert.equal(thai.unit,'joining-run');assert.ok(thai.clusters.length>1);
  for(const t of tokens){assert.equal(text.slice(t.sourceStart,t.sourceEnd),t.text);for(const c of t.clusters)assert.ok(c.start>=t.sourceStart&&c.end<=t.sourceEnd);}
  assert.deepEqual(plain(tokens.filter(t=>/[אב]/.test(t.text)).map(t=>t.text)),['א','ב']);
});
test('source ID mapping survives state array reorder and never falls back on a mismatched explicit reference',()=>{
  const els=elements('AAA'),states=els.map((e,i)=>({source:T.reference(e),effect:i+1}));
  assert.deepEqual(plain(T.mapStates(els,[states[2],states[0],states[1]]).map(s=>s.effect)),[1,2,3]);
  const newDocument=elements('AAA');
  assert.deepEqual(plain(T.mapStates(newDocument,states).map(s=>s.effect)),[1,2,3]);
  assert.deepEqual(plain(T.mapStates(els,[{source:{id:'unknown',start:99,end:100,text:'A'},effect:7}])),[null,null,null]);
  assert.deepEqual(plain(T.mapStates(els,[{effect:7}]).map(s=>s?.effect??null)),[7,null,null]);
});
test('v92 visual order migrates to logical ranges without moving old effects to another word',()=>{
  const text='A سلام عربية نور Z',els=elements(text);
  const migrated=T.migrateLegacyStates(text,[{tag:'A'},{tag:'نور'},{tag:'عربية'},{tag:'سلام'},{tag:'Z'}],segment,info);
  const states=T.mapStates(els,migrated);
  assert.deepEqual(plain(states.map(s=>s.tag)),['A','سلام','عربية','نور','Z']);
  states.forEach((s,i)=>assert.equal(s.source.text,els[i].dataset.sourceText));
});
test('v92 range migration counts CRLF, blank paragraphs, combining marks and old control slots',()=>{
  const text='A\r\n\r\nאב\nZ',states=[{tag:'A'},{tag:'ב'},{tag:'א'},{tag:'Z'}];
  const migrated=T.migrateLegacyStates(text,states,segment,info);
  assert.deepEqual(plain(migrated.map(s=>[s.tag,s.source.start,s.source.end])),[['A',0,1],['ב',6,7],['א',5,6],['Z',8,9]]);
});
test('fallback keeps combining marks, ZWJ family, regional flags and modifiers intact',()=>{
  assert.deepEqual(plain(T.fallbackGraphemes('A\u0301か\u3099👨‍👩‍👧🇯🇵👍🏽\r\n')),['A\u0301','か\u3099','👨‍👩‍👧','🇯🇵','👍🏽','\r\n']);
});

test('one long paragraph yields incrementally without changing joining runs or source ranges',()=>{
  const text=('AV か\u3099 العربية אב\u2067🇯🇵👨‍👩‍👧\t').repeat(800);
  const segmenter=new Intl.Segmenter('ja',{granularity:'grapheme'});
  let consumed=0;
  const lazy=function*(value){for(const item of segmenter.segment(value)){consumed++;yield item;}};
  const iterator=T.tokenizeLineSteps(text,lazy,info,64);
  let step=iterator.next(),yields=0;
  assert.equal(step.done,false);
  assert.equal(consumed,64);
  while(!step.done){yields++;step=iterator.next();}
  assert.ok(yields>100);
  assert.deepEqual(plain(step.value),plain(T.tokenizeLine(text,segment,info)));
  assert.equal(step.value.map(token=>token.text).join(''),text);
});
