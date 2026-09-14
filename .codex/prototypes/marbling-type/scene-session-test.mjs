import assert from 'node:assert/strict';
import { createMarblingSceneSession } from './scene-session.mjs';
import { MARBLING_PRESETS, prepareMarblingGlyph } from './core.mjs';
import { compileMarblingGlyph, renderMarblingLod } from './lod.mjs';

const glyph = prepareMarblingGlyph([{ points: [{x:0,y:-80},{x:80,y:-80},{x:80,y:0},{x:0,y:0}] },
  { points: [{x:20,y:-60},{x:20,y:-20},{x:60,y:-20},{x:60,y:-60}] }]);
const fast = { source: { maxWork: 100000, maxMs: Infinity }, frame: { maxWork: 100000, maxMs: Infinity } };
function drain(session) {
  let count = 0;
  while (!['ready','error'].includes(session.state().status) && count++ < 10000) session.advance(fast);
  assert.equal(session.state().status, 'ready', session.state().error?.stack); return session.read();
}
function request(stamp = 0, overrides = {}) {
  const scene = { glyphs: [{ch:'B',x:stamp*200,opacity:.7,surface:{color:'#123456'}}], bands:[{x:stamp*30}],
    clock:{phase:stamp,surfacePhase:stamp+9,dataMoshFrame:Math.floor(stamp*20)}, paint:{textColor:'#ff0000',fxOpacity:.6} };
  return { revision:'edit-1', stamp, scene,
    instances:[{glyphIndex:0, source:{key:'font:B:768',revision:'font-1',load:()=>glyph}, settings:MARBLING_PRESETS.eddy,
      phase:stamp, transform:{a:1,b:0,c:0,d:1}}], ...overrides };
}
const cases = [];
function test(name, run) { run(); cases.push(name); console.log('PASS',name); }

test('immutable whole-scene handoff and current geometry oracle', () => {
  const session=createMarblingSceneSession(), input=request(.13);
  input.scene.sparse=new Array(3);input.scene.sparse[1]='retained';
  session.submit(input); assert.equal(session.read(),null); assert.equal(session.state().status,'preparing');
  input.scene.glyphs[0].x=999; input.scene.glyphs[0].surface.color='#ffffff'; input.scene.clock.phase=.9;
  input.instances[0].transform.a=99; input.instances[0].phase=.95;
  const display=drain(session);
  assert.equal(display.scene.glyphs[0].x,26); assert.equal(display.scene.clock.phase,.13);
  assert.equal(display.scene.glyphs[0].surface.color,'#123456'); assert.equal(display.scene.paint.fxOpacity,.6);
  assert.equal(display.scene.sparse.length,3);assert.equal(0 in display.scene.sparse,false);assert.equal(display.scene.sparse[1],'retained');
  assert.throws(()=>display.scene.glyphs[0].x=10,TypeError); assert.equal(session.read(),display,'packet is retained, not rebuilt every state read');
  const oracle=renderMarblingLod(compileMarblingGlyph(glyph),MARBLING_PRESETS.eddy,.13,{tolerance:.2,maxPoints:262144});
  assert.deepEqual(display.instances[0].shape,oracle);
});

test('playback completes old geometry with OLD pose, bands, all clocks and paint; latest follows', () => {
  const session=createMarblingSceneSession(); session.submit(request(0));drain(session);
  session.submit(request(.1),{intent:'play'}); session.advance({frame:{maxWork:1,maxMs:Infinity}});
  for(let i=2;i<=25;i++) {
    session.submit(request(i/100),{intent:'play'}); session.advance({frame:{maxWork:1,maxMs:Infinity}});
    assert.ok(session.state().retainedScenes<=3);
  }
  assert.equal(session.read().stamp,0);
  let sawPending=false;
  for(let i=0;i<2000 && session.state().status!=='ready';i++) {
    session.advance({frame:{maxWork:32,maxMs:Infinity}});
    const display=session.read();
    assert.equal(display.scene.clock.phase,display.stamp);
    assert.equal(display.scene.glyphs[0].x,display.stamp*200);
    assert.equal(display.scene.bands[0].x,display.stamp*30);
    if(display.stamp===.1) sawPending=true;
  }
  assert.ok(sawPending,'in-flight scene was completed rather than starved');
  assert.equal(session.read().stamp,.25);assert.equal(session.state().status,'ready');
  assert.equal(session.state().source.loads,1);
});

test('static geometry shares new native layout stamp without rebuilding', () => {
  const session=createMarblingSceneSession(), a=request(0);a.instances[0].settings={...MARBLING_PRESETS.rake,motion:0};
  session.submit(a);const before=drain(session), builds=session.state().frame.pool.builds;
  const b=request(.8);b.instances[0].settings=a.instances[0].settings;
  session.submit(b,{intent:'play'});
  assert.equal(session.state().status,'ready');assert.equal(session.read().scene.glyphs[0].x,160);
  assert.equal(session.read().instances[0].shape,before.instances[0].shape);
  assert.equal(session.state().frame.pool.builds,builds);
});

test('strict read-only output refuses newer phase or finer precision, allows reordered subset', () => {
  const session=createMarblingSceneSession(), input=request(.2);
  input.scene.glyphs.push({...input.scene.glyphs[0],ch:'S'});
  input.instances.push({...input.instances[0],glyphIndex:1,source:{key:'font:S:768',revision:'font-1',load:()=>glyph},transform:{a:3,b:.3,c:1,d:.8}});
  session.submit(input);drain(session);const state=JSON.stringify(session.state());
  assert.equal(session.readExact(request(.4)),null);
  assert.throws(()=>session.requireExact(request(.4)),e=>e.code==='MARBLING_PENDING');
  const finer=request(.2);finer.instances[0].transform.a=4;assert.equal(session.readExact(finer),null);
  const subset={...input,instances:[input.instances[1],input.instances[0]]};
  assert.deepEqual(session.requireExact(subset).instances.map(i=>i.glyphIndex),[1,0]);
  const unknown=request(.2);unknown.instances[0].source={key:'missing',revision:'font-1',load(){throw new Error('must not run');}};
  assert.equal(session.readExact(unknown),null); assert.equal(JSON.stringify(session.state()),state,'output does not prune, schedule or load');
});

test('native zero, whitespace and invisible copies allocate no source or output', () => {
  const session=createMarblingSceneSession(), input=request();
  input.instances[0]={glyphIndex:0,settings:{amount:0}};
  input.scene.glyphs.push({ch:' ',opacity:1},{ch:'B',opacity:0});input.instances.push({glyphIndex:1},{glyphIndex:2});
  session.submit(input);assert.equal(session.state().status,'ready');
  assert.deepEqual(session.read().instances.map(i=>i.kind),['native','skip','skip']);
  assert.equal(session.state().source.loads,0);assert.equal(session.state().frame.pool.builds,0);
  assert.equal(session.requireExact(input).instances[0].kind,'native','host must use native font path, not traced identity');
  session.submit({revision:'empty',stamp:1,scene:{glyphs:[]},instances:[]});assert.equal(session.read().scene.glyphs.length,0);
});

test('edit revision, font replacement and removal never retain a stale display', () => {
  const session=createMarblingSceneSession();session.submit(request());drain(session);
  const edit=request(.3,{revision:'edit-2'});session.submit(edit);assert.equal(session.read(),null);drain(session);
  assert.equal(session.state().source.loads,1,'non-font edits retain source compilation');
  const font=request(.3,{revision:'edit-2'});font.instances[0].source.revision='font-2';session.submit(font);
  assert.equal(session.read(),null);drain(session);assert.equal(session.state().source.loads,2);
  session.reset();assert.equal(session.read(),null);assert.equal(session.state().source.usage.points,0);
  assert.equal(session.state().frame.pool.pointUsage.total,0);assert.equal(session.state().retainedScenes,0);
});

test('invalid submissions leave current leases, geometry and scene intact', () => {
  const session=createMarblingSceneSession();session.submit(request());const display=drain(session), before=JSON.stringify(session.state());
  const invalid=[];
  const badMatrix=request();badMatrix.instances[0].transform.a=NaN;invalid.push(badMatrix);
  const repeated=request();repeated.instances.push(repeated.instances[0]);invalid.push(repeated);
  const cycle=request();cycle.scene.self=cycle.scene;invalid.push(cycle);
  const clock=request();clock.scene.clock.phase=Infinity;invalid.push(clock);
  const getter=request();Object.defineProperty(getter.scene,'sideEffect',{enumerable:true,get(){throw new Error('getter executed');}});invalid.push(getter);
  const conflict=request();conflict.scene.glyphs.push({ch:'B'});conflict.instances.push({...conflict.instances[0],glyphIndex:1,source:{...conflict.instances[0].source,revision:'other'}});invalid.push(conflict);
  for(const input of invalid) {assert.throws(()=>session.submit(input),TypeError);assert.equal(session.read(),display);assert.equal(JSON.stringify(session.state()),before);}
});

test('pause/resume, stable source error, explicit retry and preparation cancellation', () => {
  const session=createMarblingSceneSession(), input=request();let fail=true;
  input.instances[0].source.load=()=>{if(fail)throw new Error('font capture failed');return glyph;};
  session.submit(input);session.setPaused(true);const before=JSON.stringify(session.state());assert.equal(session.advance(),false);assert.equal(JSON.stringify(session.state()),before);
  session.setPaused(false);session.advance();assert.equal(session.state().status,'error');
  const loads=session.state().source.loads;for(let i=0;i<20;i++)session.advance();assert.equal(session.state().source.loads,loads);
  fail=false;session.retry();drain(session);
  const font=request(.4);font.instances[0].source.revision='pending-font';session.submit(font);session.advance();
  session.reset();assert.equal(session.advance(),false);assert.equal(session.state().status,'empty');assert.equal(session.read(),null);
});

test('geometry budget error holds a coherent accepted scene without automatic retry', () => {
  const session=createMarblingSceneSession({frameOptions:{pointLimit:60}}), initial=request(0);
  initial.instances[0].settings={...MARBLING_PRESETS.rake,amount:.001};session.submit(initial);const display=drain(session);
  const extreme=request(.5);extreme.instances[0].settings={...MARBLING_PRESETS.eddy,amount:4,focus:1,circulation:4};
  session.submit(extreme,{intent:'play'});
  for(let i=0;i<1000 && session.state().status!=='error';i++)session.advance(fast);
  assert.equal(session.state().status,'error');assert.equal(session.read(),display);
  const builds=session.state().frame.pool.builds;for(let i=0;i<10;i++)session.advance(fast);assert.equal(session.state().frame.pool.builds,builds);
  assert.ok(session.state().frame.pool.pointUsage.total<=60);
  session.submit(initial);drain(session);assert.equal(session.state().status,'ready');
});

test('duplicate destinations use strictest tolerance and preserve input paint order', () => {
  const session=createMarblingSceneSession(), input=request(.1);
  input.scene.glyphs=Array.from({length:300},(_,i)=>({ch:'B',opacity:i/300,x:i}));
  input.instances=Array.from({length:300},(_,i)=>({...input.instances[0],glyphIndex:i,transform:{a:1+i/100,b:.1,c:0,d:1}}));
  session.submit(input);const display=drain(session);
  const bodies=display.instances.filter(i=>i.kind==='body');
  assert.equal(session.state().source.loads,1);assert.equal(session.state().frame.pool.total,1);
  assert.equal(new Set(bodies.map(i=>i.shape)).size,1);assert.equal(display.instances[0].kind,'skip');
  assert.deepEqual(display.instances.map(i=>i.glyphIndex),Array.from({length:300},(_,i)=>i));
  assert.equal(display.scene.glyphs[299].opacity,299/300);
});
console.log(`Marbling scene session: ${cases.length} groups passed (Node, not native editor/browser QA).`);
