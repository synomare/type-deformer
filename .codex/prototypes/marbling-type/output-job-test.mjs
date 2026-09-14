import assert from 'node:assert/strict';
import { createMarblingOutputJob } from './output-job.mjs';
import { createMarblingSceneSession } from './scene-session.mjs';
import { prepareMarblingGlyph, MARBLING_PRESETS } from './core.mjs';
import { compileMarblingGlyph, createMarblingCompileTask, renderMarblingLod, marblingPixelTolerance } from './lod.mjs';

const source=prepareMarblingGlyph([{points:[{x:0,y:-80},{x:80,y:-80},{x:80,y:0},{x:0,y:0}]},
  {points:[{x:20,y:-60},{x:20,y:-20},{x:60,y:-20},{x:60,y:-60}]}]);
const fast={source:{maxWork:100000,maxMs:Infinity},frame:{maxWork:100000,maxMs:Infinity}};
const small={source:{maxWork:1,maxMs:Infinity},frame:{maxWork:1,maxMs:Infinity}};
function request(phase=.23,copies=1) {
  return {revision:'edit-1',stamp:phase,scene:{glyphs:Array.from({length:copies},(_,i)=>({ch:'B',x:i*100,opacity:.6,
    surface:{ink:i%2?'#e64043':'#231442'}})),bands:[{x:12}],presentedPhase:phase,presentedSurfacePhase:phase+3,
    presentedDataMoshFrame:23,paint:{paper:'#eee9df',fontSize:192}},
    instances:Array.from({length:copies},(_,glyphIndex)=>({glyphIndex,phase,settings:MARBLING_PRESETS.eddy,
      transform:{a:.8,b:0,c:0,d:.8},source:{key:'B',revision:'font-1',load:()=>source}}))};
}
function drainLive(session){let slices=0;while(session.state().status!=='ready'&&slices++<10000)session.advance(fast);
  assert.equal(session.state().status,'ready',session.state().error?.stack);return session.read();}
function live(input=request()){const session=createMarblingSceneSession();session.submit(input);return {session,packet:drainLive(session)};}
function destination(packet,scale=5){return {transforms:packet.instances.filter(i=>i.kind==='body').map(i=>({glyphIndex:i.glyphIndex,a:scale,b:.3,c:.1,d:scale*.8,e:30,f:50})),pixelError:.2};}
function drain(job){let slices=0;while(job.state().status==='preparing'&&slices++<10000)job.advance(fast);assert.equal(job.state().status,'ready',job.state().error?.stack);return job.require();}
const tests=[];
async function test(name,callback){await callback();tests.push(name);console.log('PASS',name);}

await test('destination-precision output equals direct oracle, never displayed coarse polygons',()=>{
  const {session,packet}=live(),before=JSON.stringify(session.state()),dest=destination(packet),job=createMarblingOutputJob(packet,dest);
  assert.equal(job.read(),null);assert.throws(()=>job.require(),e=>e.code==='MARBLING_PENDING');
  const result=drain(job),body=result.packet.instances[0];
  const tolerance=marblingPixelTolerance(dest.transforms[0],.2);
  assert.deepEqual(body.shape,renderMarblingLod(compileMarblingGlyph(source),MARBLING_PRESETS.eddy,.23,{tolerance,maxPoints:262144}));
  assert.ok(body.shape.tolerance<packet.instances[0].shape.tolerance);
  assert.equal(result.packet.stamp,.23);assert.equal(result.packet.scene.presentedSurfacePhase,3.23);
  assert.equal(JSON.stringify(session.state()),before);job.dispose();assert.equal(session.read(),packet);
});
await test('accepted font, pose, ink and clock survive new live edits and fonts',()=>{
  const {session,packet}=live(),dest=destination(packet),job=createMarblingOutputJob(packet,dest);
  dest.transforms[0].a=999;dest.transforms[0].e=999;dest.pixelError=8;
  const edited=request(.78);edited.revision='edit-2';edited.scene.glyphs[0].x=700;edited.scene.paint.paper='#ffffff';
  edited.instances[0].source={key:'new-font',revision:'font-2',load:()=>prepareMarblingGlyph([])};
  session.submit(edited);drainLive(session);
  const result=drain(job);assert.equal(result.packet.scene.glyphs[0].x,0);assert.equal(result.packet.scene.paint.paper,'#eee9df');
  assert.equal(result.packet.stamp,.23);assert.equal(result.transforms[0].a,5);assert.equal(result.transforms[0].e,30);
  assert.ok(Object.isFrozen(result.transforms[0]));assert.deepEqual(result.packet.instances[0].source,source);job.dispose();
});
await test('300 copies share an independent source and strictest output geometry',()=>{
  const {session,packet}=live(request(.12,300)),before=JSON.stringify(session.state()),dest=destination(packet,2);
  dest.transforms[11].a=7;const job=createMarblingOutputJob(packet,dest),result=drain(job);
  assert.equal(result.packet.instances.length,300);assert.equal(job.state().resources.source.loads,1);
  assert.equal(job.state().resources.frame.pool.builds,1);
  assert.ok(result.packet.instances.every(i=>i.shape===result.packet.instances[0].shape));
  assert.equal(JSON.stringify(session.state()),before);job.dispose();
  assert.equal(job.state().resources.source.usage.points,0);assert.equal(job.state().resources.frame.pool.pointUsage.total,0);
});
await test('zero/native and invisible/space paths preserve native dispatch without tracing',()=>{
  const input=request();input.instances[0]={glyphIndex:0,settings:{amount:0}};
  input.scene.glyphs.push({ch:' ',opacity:1},{ch:'B',opacity:0});input.instances.push({glyphIndex:1},{glyphIndex:2});
  const {packet}=live(input),job=createMarblingOutputJob(packet,{transforms:[]});
  assert.deepEqual(job.require().packet.instances.map(i=>i.kind),['native','skip','skip']);
  assert.equal(job.state().resources.source.loads,0);job.dispose();
});
await test('output point-cap failure is explicit and cannot poison the live frame',()=>{
  const {session,packet}=live(),before=JSON.stringify(session.state());
  const job=createMarblingOutputJob(packet,destination(packet),{frameOptions:{pointLimit:3}});
  for(let i=0;i<1000&&job.state().status==='preparing';i++)job.advance(fast);
  assert.equal(job.state().status,'error');assert.equal(job.read(),null);assert.throws(()=>job.require());
  assert.equal(JSON.stringify(session.state()),before);job.dispose();assert.equal(session.read(),packet);
});
await test('cancel during source or geometry releases all job leases',()=>{
  for(const stage of ['source','geometry']){
    const {session,packet}=live(),before=JSON.stringify(session.state()),job=createMarblingOutputJob(packet,destination(packet));
    if(stage==='geometry')for(let i=0;i<1000&&job.state().resources.source.pending;i++)job.advance({source:fast.source,frame:small.frame});
    const reason=new Error(stage);assert.equal(job.cancel(reason),true);assert.equal(job.state().status,'cancelled');
    assert.equal(job.advance(fast),false);assert.equal(job.read(),null);assert.throws(()=>job.require(),e=>e===reason);
    assert.equal(job.state().resources.source.usage.points,0);assert.equal(job.state().resources.frame.pool.pointUsage.total,0);
    assert.equal(JSON.stringify(session.state()),before);assert.equal(job.retry(),false);job.dispose();
  }
});
await test('abort interrupts a never-settling yield and removes its listener',async()=>{
  const {packet}=live(),job=createMarblingOutputJob(packet,destination(packet)),controller=new AbortController();let entered;
  const waiting=new Promise(resolve=>entered=resolve),reason=new Error('stop');let attached=0;
  const signal=controller.signal,add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);
  signal.addEventListener=(...args)=>{attached++;return add(...args);};signal.removeEventListener=(...args)=>{attached--;return remove(...args);};
  const run=job.run({signal,budget:small,yieldWork:()=>{entered();return new Promise(()=>{});}});
  await waiting;controller.abort(reason);await assert.rejects(run,e=>e===reason);
  assert.equal(attached,0);assert.equal(job.state().status,'cancelled');assert.equal(job.state().resources.source.usage.points,0);
});
await test('failure has no automatic retry; explicit retry uses the same pinned source',async()=>{
  const {packet}=live();let failures=1,attempts=0;
  const job=createMarblingOutputJob(packet,destination(packet),{sourceOptions:{taskFactory:g=>{attempts++;if(failures-- >0)throw new Error('compile failure');return createMarblingCompileTask(g);}}});
  await assert.rejects(job.run({budget:fast}),/compile failure/);assert.equal(job.state().status,'error');
  for(let i=0;i<10;i++)job.advance(fast);assert.equal(attempts,1);
  assert.equal(job.retry(),true);const result=await job.run({budget:fast});assert.equal(result.packet.stamp,.23);assert.equal(attempts,2);job.dispose();
});
await test('invalid transforms and packets fail before acquiring output leases',()=>{
  const {session,packet}=live(),before=JSON.stringify(session.state());
  for(const bad of [{transforms:[]},{transforms:[{glyphIndex:0,a:NaN,b:0,c:0,d:1,e:0,f:0}]},
    {transforms:[...destination(packet).transforms,...destination(packet).transforms]},
    {...destination(packet),pixelError:-1}])assert.throws(()=>createMarblingOutputJob(packet,bad));
  assert.throws(()=>createMarblingOutputJob({...packet},destination(packet)));
  assert.equal(JSON.stringify(session.state()),before);
});
await test('runner ownership, yield failure and disposal are terminal and observable',async()=>{
  const {packet}=live();let entered;const waiting=new Promise(resolve=>entered=resolve);
  const job=createMarblingOutputJob(packet,destination(packet));
  const run=job.run({budget:small,yieldWork:()=>{entered();return new Promise(()=>{});}});
  await assert.rejects(job.run(),/already active/);await waiting;job.dispose();await assert.rejects(run,/disposed/);
  assert.equal(job.state().status,'disposed');assert.equal(job.read(),null);assert.equal(job.state().resources.frame.pool.pointUsage.total,0);
  const failed=createMarblingOutputJob(packet,destination(packet));
  await assert.rejects(failed.run({budget:small,yieldWork:()=>{throw new Error('scheduler failed');}}),/scheduler failed/);
  assert.equal(failed.state().status,'error');assert.equal(failed.state().resources.source.usage.points,0);failed.dispose();
});
await test('abort preserves even a null reason and ready results have explicit lifetime',async()=>{
  const {packet}=live(),controller=new AbortController();controller.abort(null);
  const job=createMarblingOutputJob(packet,destination(packet));let caught=Symbol();
  try{await job.run({signal:controller.signal});}catch(e){caught=e;}assert.equal(caught,null);
  try{job.require();}catch(e){assert.equal(e,null);}assert.equal(job.state().status,'cancelled');
  const ready=createMarblingOutputJob(packet,destination(packet));const result=drain(ready);assert.equal(ready.cancel(),false);
  await assert.rejects(ready.run({signal:{aborted:true}}),e=>e.name==='AbortError');assert.equal(ready.read(),result);
  assert.equal(await ready.run(),result);ready.dispose();assert.equal(ready.read(),null);assert.throws(()=>ready.require(),/disposed/);
});
await test('default runner yields to real timers and completes strict output',async()=>{
  const {packet}=live(),job=createMarblingOutputJob(packet,destination(packet));let ticks=0;
  const timer=setInterval(()=>ticks++,0);try {await job.run({budget:{source:{maxWork:64,maxMs:1},frame:{maxWork:32,maxMs:1}}});}finally{clearInterval(timer);}
  assert.ok(ticks>0);assert.equal(job.state().status,'ready');job.dispose();
});
console.log(JSON.stringify({status:'pass',groups:tests.length,scope:'isolated output preparation; no editor export handler, UI or browser validation'}));
