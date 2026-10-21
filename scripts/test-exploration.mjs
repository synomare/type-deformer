import {createAuthoredTestContext} from './authored-test-context.mjs';
import {readAuthoredSource, readPageMarkup} from './source-reader.mjs';
const markup = readPageMarkup();
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const context = createAuthoredTestContext({});
vm.runInContext(fs.readFileSync(new URL('../exploration.js', import.meta.url), 'utf8'), context);
const api = context.TypeDeformerExplorer;
const plain = value => JSON.parse(JSON.stringify(value));
const spec = [
  { key: 'field', min: -2, max: 2, step: .05, value: .8, label: 'Field', disabled: false },
  { key: 'power', min: 1, max: 10, step: 1, value: 3, label: 'Power', disabled: false },
  { key: 'orbit', min: 0, max: 1, step: .01, value: .4, label: 'Orbit', disabled: true }
];
const base = { version: 65, text: 'B& / 書', params: { seed: 893, fontFamily: 'Georgia', fontWeight: 400, fontAxes: '{}',
  field: .8, frozenMoment: JSON.stringify({ schema: 1, phase: .4, surfacePhase: 12, logicalWidth: 960, logicalHeight: 680 }) },
  composition: { enabled: true, phase: .4, seed: 19, type: 'field' }, batchProfiles: { latin: { field: .9 }, kana: { field: .5 } },
  letters: [{ o: { ct: { current: 1 } } }] };

test('exploration is a bounded, non-playing schema with at most two distinct numeric axes', () => {
  assert.equal(api.normalize('').mode, 'time');
  assert.equal(api.normalize('bad').seconds, 8);
  const c = api.normalize({ seconds: Infinity, axes: [{ key: 'field', start: 0, end: 1 }, { key: 'field', start: 1, end: 2 },
    { key: '__proto__', start: 0, end: 1 }, { key: 'power', start: 1, end: 10 }, { key: 'orbit', start: 0, end: 1 }] });
  assert.deepEqual(plain(c.axes.map(a => a.key)), ['field', 'power']); assert.equal(c.seconds, 8);
  assert.equal('playing' in c, false);
});
test('time candidates preserve seeds, font, letters and source without mutating the artwork', () => {
  const before = JSON.stringify(base);
  const c = api.variant(base, { mode: 'time', from: .2, to: .8 }, spec, .5, ['all']);
  assert.equal(c.phase, .5); assert.equal(c.state.params.seed, 893); assert.equal(c.state.composition.seed, 19);
  assert.deepEqual(plain(c.state.letters), base.letters); assert.equal(c.state.params.fontFamily, 'Georgia');
  assert.equal(api.normalizeMoment(c.state.params.frozenMoment).logicalWidth, 960);
  assert.equal(JSON.stringify(base), before);
});
test('parameter candidates only change applied target profiles, never discrete grammars or seeds', () => {
  const c = api.variant(base, { mode: 'parameters', axes: [{ key: 'field', start: -2, end: 2 }, { key: 'power', start: 1, end: 10 }] }, spec, .5, ['latin']);
  assert.deepEqual(plain(c.values), { field: 0, power: 6 });
  assert.equal(c.state.params.field, .8); assert.equal(c.state.batchProfiles.latin.field, 0);
  assert.equal(c.state.batchProfiles.kana.field, .5); assert.equal(c.phase, .4);
  assert.equal(c.state.params.seed, 893); assert.deepEqual(plain(c.state.letters), base.letters);
});
test('unavailable axes cannot silently produce no-op candidates; extremes respect real bounds and steps', () => {
  assert.throws(() => api.variant(base, { mode: 'parameters', axes: [{ key: 'orbit', start: 0, end: 1 }] }, spec, .5, ['all']), /数値軸/);
  const axes = api.boundedAxes({ axes: [{ key: 'field', start: -999, end: 999 }, { key: 'power', start: 1.1, end: 8.9 }] }, spec);
  assert.equal(axes[0].start, -2); assert.equal(axes[0].end, 2); assert.equal(axes[1].end, 9);
});
test('6/9/12 time sheets avoid duplicate full-loop endpoints and include non-loop extremes', () => {
  for (const count of [6, 9, 12]) {
    const samples = api.positions(count, { mode: 'time', from: 0, to: 1 });
    assert.equal(samples.length, count); assert.equal(samples[0], 0); assert.ok(samples.at(-1) < 1);
    assert.equal(api.positions(count, { mode: 'parameters' }).at(-1), 1);
  }
  assert.equal(api.positions(100, {}).length, 9);
});
test('frozen moments validate clocks, quality, font references and geometry dimensions independently', () => {
  assert.equal(api.normalizeMoment('bad'), null);
  const moment = api.normalizeMoment({ schema: 1, phase: -9, surfacePhase: Infinity, logicalWidth: -1,
    quality: 'auto', fonts: [{ family: 'Local Font', label: 'Local.otf' }, null] });
  assert.equal(moment.phase, 0); assert.equal(moment.surfacePhase, 0); assert.equal(moment.logicalWidth, 1);
  assert.equal(moment.quality, 'normal'); assert.deepEqual(plain(moment.fonts), [{ family: 'Local Font', label: 'Local.otf' }]);
});

const authoredSource = readAuthoredSource().replaceAll('\r\n', '\n');
function scopeRuntime() {
  const input = { id: 'field', min: '0', max: '1', step: '.01', disabled: false,
    closest: () => ({ dataset: { operatorPanel: 'test' } }) };
  const c = createAuthoredTestContext({ activeBatchProfile: 'all', sourceTarget: { mode: 'all' },
    metrics: [{ ch: 'A', batchKey: 'latin' }, { ch: 'a', batchKey: 'latin' }],
    batchProfiles: { latin: { field: .2 } }, syncOperatorParameterAvailability() {},
    rangeControls: [{ key: 'field', profiled: true, input }],
    parameterDisabledReasons: () => new Set(['rotate-grammar']),
    document: { querySelector: () => ({ textContent: 'Field' }) },
    batchProfileForKey: () => ({ field: .2 }), batchSourceText: m => m.ch, operatorAffectsMetric: () => true,
    BATCH_TARGETS: { byKey: { latin: {}, 'latin.upper': { test: true }, 'latin.vowel': { test: true } },
      keys: text => ['latin', ...(text === text.toUpperCase() ? ['latin.upper'] : []), ...(/[Aa]/.test(text) ? ['latin.vowel'] : [])],
      matches: (key, text) => key === 'all' || key === 'latin' || key === 'latin.upper' && text === text.toUpperCase() || key === 'latin.vowel' && /[Aa]/.test(text) }
  });
  const functions = ['studioTargetKeys', 'studioAxes'].map(name => {
    const source = authoredSource.match(new RegExp('^      function ' + name + '\\([\\s\\S]*?^      \\}', 'm'))?.[0];
    assert.ok(source, name); return source;
  }).join('\n');
  vm.runInContext(functions, c); return c;
}
test('All exploration reaches existing detailed overrides; narrow Targets never write their parent family', () => {
  const c = scopeRuntime(); c.batchProfiles['latin.upper'] = { field: .5 };
  assert.deepEqual(plain(c.studioTargetKeys('test')).sort(), ['all', 'latin', 'latin.upper']);
  c.activeBatchProfile = 'latin.upper'; delete c.batchProfiles['latin.upper'];
  assert.deepEqual(plain(c.studioTargetKeys('test')), ['latin.upper']);
  const result = api.variant({ ...base, batchProfiles: { latin: { field: .2 } } },
    { mode: 'parameters', axes: [{ key: 'field', start: 0, end: 1 }] }, spec, 1, ['latin.upper']);
  assert.equal(result.state.batchProfiles['latin.upper'].field, 1);
  assert.equal(result.state.batchProfiles.latin.field, .2);
});
test('overlapping detailed profiles, local overrides and partial source ranges show explicit unavailable reasons', () => {
  const c = scopeRuntime(); c.activeBatchProfile = 'latin.upper';
  assert.equal(c.studioAxes('test')[0].disabled, false);
  c.batchProfiles['latin.vowel'] = { field: .6 };
  assert.match(c.studioAxes('test')[0].reason, /範囲外/); assert.equal(c.studioAxes('test')[0].disabled, true);
  c.activeBatchProfile = 'all'; assert.equal(c.studioAxes('test')[0].disabled, false);
  c.metrics[0].localParams = { field: .7 };
  assert.match(c.studioAxes('test')[0].reason, /個別値/);
  c.metrics[0].localParams = null; c.sourceTarget.mode = 'range';
  assert.match(c.studioAxes('test')[0].reason, /原文の部分範囲/);
  c.sourceTarget.mode = 'all'; c.rangeControls[0].input.disabled = true;
  assert.match(c.studioAxes('test')[0].reason, /文法/);
});

test('isolated export accepts structured progress and waits thirty minutes, while comparison/proof retain their shorter deadline',async()=>{
 for(const purpose of ['export','proof',null]){
  const timers=new Map(),events=new Map(),sent=[];let next=0,frame;
  const c=createAuthoredTestContext({URL,location:{href:'http://localhost/'},crypto:{getRandomValues:value=>value.fill(7)},setTimeout(fn,ms){timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),document:{createElement(){frame={style:{},setAttribute(){},remove(){},contentWindow:{postMessage:m=>sent.push(m)}};return frame;},body:{appendChild(){}}}});
  vm.runInContext(fs.readFileSync(new URL('../render-context.js',import.meta.url),'utf8'),c);vm.runInContext(fs.readFileSync(new URL('../exploration.js',import.meta.url),'utf8'),c);
  const client=c.TypeDeformerExplorer.rendererClient({viewport:()=>({windowWidth:960,windowHeight:680}),fonts:()=>[]}),progress=[];
  const waiting=client.render(purpose?{output:{format:'png',purpose}}:{state:{}},v=>progress.push(v));
  frame.onload();let m=sent.at(-1);events.get('message')({source:frame.contentWindow,data:{token:m.token,id:m.id,result:{}}});await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(sent.at(-1).type,'render');assert.equal([...timers.values()][0].ms,purpose==='export'?1800000:120000);
  m=sent.at(-1);const value={text:'効果を描画中',fraction:.4};events.get('message')({source:frame.contentWindow,data:{token:m.token,id:m.id,progress:value}});assert.deepEqual(progress,[value]);
  events.get('message')({source:frame.contentWindow,data:{token:m.token,id:m.id,result:{complete:true}}});await waiting;assert.equal(timers.size,0);client.dispose();assert.equal(events.size,0);
 }
});

test('export progress counts native effects in their actual position between streamed layers',()=>{
 const c=createAuthoredTestContext({surfaceWorkerOutput:{order:['tensor','native','copy','riso'],progress:{operator:'tensor',operatorIndex:0,totalOperators:3,completed:2,total:6}},operatorOption:id=>({textContent:id})});
 const fn=authoredSource.match(/^      function surfaceOutputProgress\([\s\S]*?^      \}/m)?.[0];assert.ok(fn);vm.runInContext(fn,c);
 assert.equal(c.surfaceOutputProgress().fraction,.25);assert.match(c.surfaceOutputProgress().text,/1 \/ 4/);
 Object.assign(c.surfaceWorkerOutput.progress,{operator:'copy',operatorIndex:1,completed:3});assert.equal(c.surfaceOutputProgress().fraction,.625);assert.match(c.surfaceOutputProgress().text,/3 \/ 4/);
});

test('isolated renderer cancellation and transport failure cannot resurrect frames or leak deadlines',async()=>{
 for(const phase of ['loading','init','render','transport','fonts']){
  const timers=new Map(),events=new Map(),sent=[];let next=0,frame,removed=0;
  const c=createAuthoredTestContext({URL,location:{href:'http://localhost/'},crypto:{getRandomValues:value=>value.fill(7)},setTimeout(fn,ms){timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),document:{createElement(){frame={style:{},setAttribute(){},remove(){removed++;},contentWindow:{postMessage(m){if(phase==='transport')throw Error('closed port');sent.push(m);}}};return frame;},body:{appendChild(){}}}});
  vm.runInContext(fs.readFileSync(new URL('../exploration.js',import.meta.url),'utf8'),c);
  const client=c.TypeDeformerExplorer.rendererClient({viewport:()=>({windowWidth:960,windowHeight:680}),fonts(){if(phase==='fonts')throw Error('font data unavailable');return [];}});
  const promise=client.render({output:{purpose:'export'}}),rejected=assert.rejects(promise,phase==='transport'?{code:'RENDER_TRANSPORT_FAILED'}:phase==='fonts'?/font data/:{code:'RENDER_CANCELLED'});
  const lateLoad=frame.onload;
  if(phase!=='loading')frame.onload();
  if(phase==='render'){const m=sent[0];events.get('message')({source:frame.contentWindow,data:{token:m.token,id:m.id,result:{}}});await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(sent.at(-1).type,'render');}
  client.dispose();client.dispose();lateLoad();await rejected;
  assert.equal(timers.size,0);assert.equal(events.size,0);assert.equal(removed,1);
  await assert.rejects(client.render({}),phase==='transport'?{code:'RENDER_TRANSPORT_FAILED'}:phase==='fonts'?/font data/:{code:'RENDER_CANCELLED'});
 }
});

test('render requests capture immutable source state before iframe preparation yields',()=>{
 const source={state:{text:'before',params:{fontSize:52},letters:[{id:'a',x:1}]},viewport:{width:960},output:{purpose:'export'}};
 const request=api.snapshotRequest(source);source.state.text='after';source.state.letters[0].x=2;
 assert.equal(request.state.text,'before');assert.equal(request.state.letters[0].x,1);assert.equal(Object.isFrozen(request.state.params),true);
 assert.throws(()=>{request.state.params.fontSize=100;},TypeError);
});

test('renderer owns one shared reservation and releases it after timeout, cancellation and transport failure',async()=>{
 for(const phase of ['timeout','cancel','transport']){
  const timers=new Map(),events=new Map(),sent=[];let next=0,frame;
  const c=createAuthoredTestContext({URL,location:{href:'http://localhost/'},crypto:{getRandomValues:value=>value.fill(7)},setTimeout(fn,ms){timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),document:{createElement(){frame={style:{},setAttribute(){},remove(){},contentWindow:{postMessage(m){if(phase==='transport')throw Error('port closed');sent.push(m);}}};return frame;},body:{appendChild(){}}}});
  for(const file of ['render-context.js','exploration.js'])vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),c);
  const R=c.TypeDeformerRenderContext,bridge={viewport:()=>({windowWidth:960,windowHeight:680}),fonts:()=>[]};
  const client=c.TypeDeformerExplorer.rendererClient(bridge),payload={state:{text:'captured'},output:{purpose:'export'}};
  const pending=client.render(payload),rejected=assert.rejects(pending,{code:phase==='timeout'?'RENDER_START_FAILED':phase==='transport'?'RENDER_TRANSPORT_FAILED':'RENDER_CANCELLED'});
  assert.ok(R.resources.inspect().reservedBytes>0);
  await assert.rejects(client.render(payload),{code:'RENDER_RESOURCE_BUSY'});
  const competitor=c.TypeDeformerExplorer.rendererClient(bridge);await assert.rejects(competitor.render(payload),{code:'RENDER_RESERVATION_EXCEEDED'});competitor.dispose();
  if(phase==='timeout')[...timers.values()][0].fn();else if(phase==='transport')frame.onload();else client.dispose();
  await rejected;assert.equal(R.resources.inspect().reservedBytes,0);assert.equal(client.inspect().pending,0);assert.equal(events.size,0);
 }
});
