import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarblingNativeSession} from './native-session.mjs';
import {prepareMarblingGlyph} from './core.mjs';
const glyph=prepareMarblingGlyph([{points:[{x:0,y:0},{x:30,y:0},{x:30,y:40},{x:0,y:40}]}]);
function fixture(){let copies=0,closes=0;const session=createMarblingNativeSession({snapshotOptions:{copyRaster:s=>{copies++;return {...s};},releaseRaster:()=>closes++}});
  return {session,count:()=>({copies,closes})};}
function input(stamp,revision='r1',amount=.8){return {revision,stamp,scene:{glyphs:[{ch:'B',opacity:1}],bands:[{kind:'raster',source:{width:4,height:4,pixel:stamp}}]},
  params:{ink:'#00f'},compositionState:{enabled:true,phase:stamp},surfaceFxPhase:stamp,dataMoshFrame:stamp,fontRevision:'font1',
  instances:[{glyphIndex:0,settings:{mode:'eddy',amount,motion:1},phase:stamp,source:{key:'B',revision:'font1',load:()=>glyph},transform:{a:1,b:0,c:0,d:1}}]};}
const budget={source:{maxWork:10000,maxMs:100},frame:{maxWork:10000,maxMs:100}};
function drain(session){for(let i=0;i<10000&&session.state().status!=='ready';i++)session.advance(budget);assert.equal(session.state().status,'ready');}
function host(){let state={fontRevision:'font1',params:{ink:'live'},compositionState:{phase:.9}};return {read:()=>state,set:s=>{state=s;}};}
const destination={transforms:[{glyphIndex:0,a:4,b:0,c:0,d:4,e:0,f:0}]};

test('native session retains only display/pending/latest candidates during playback',()=>{
  const {session,count}=fixture();session.submit(input(0));drain(session);
  for(let i=1;i<=50;i++){session.submit(input(i/100),{intent:'play'});session.advance({source:{maxWork:1,maxMs:0},frame:{maxWork:1,maxMs:0}});
    assert.ok(session.state().native.scenes<=3);assert.ok(count().copies-count().closes<=3);
  }
  drain(session);assert.equal(session.read().stamp,.5);assert.equal(session.state().native.scenes,1);assert.equal(count().copies-count().closes,1);
  session.paint(host(),scene=>assert.equal(scene.bands[0].source.pixel,.5));session.reset();assert.equal(count().copies,count().closes);
});

test('invalid submission leaves displayed/native resources untouched',()=>{
  const {session,count}=fixture();session.submit(input(0));drain(session);const before=session.read(),d=input(.2);d.instances[0].transform.a=NaN;
  assert.throws(()=>session.submit(d));assert.equal(session.read(),before);assert.equal(session.state().native.scenes,1);assert.equal(count().copies-count().closes,1);session.reset();
});

test('higher-resolution output keeps exact frame and raster after live reset',()=>{
  const {session,count}=fixture();session.submit(input(.12));drain(session);const output=session.output(destination);session.reset();assert.equal(session.state().native.scenes,0);
  assert.equal(count().copies-count().closes,1);
  for(let i=0;i<10000&&!output.read();i++)output.advance(budget);
  assert.equal(output.require().packet.stamp,.12);const h=host(),previous=h.read();output.paint(h,scene=>{assert.equal(scene.bands[0].source.pixel,.12);assert.equal(h.read().compositionState.phase,.12);});
  assert.equal(h.read(),previous);output.dispose();assert.equal(count().copies,count().closes);assert.throws(()=>output.paint(h,()=>{}));
});

test('output cancellation, abort and dispose release independent native leases',async()=>{
  for(const mode of ['cancel','abort','dispose']){const {session,count}=fixture();session.submit(input(0));drain(session);const output=session.output(destination);session.reset();
    if(mode==='cancel'){assert.equal(output.cancel(),true);assert.equal(output.cancel(),false);}
    else if(mode==='dispose')output.dispose();
    else{const abort=new AbortController(),run=output.run({signal:abort.signal,yieldWork:()=>new Promise(()=>{}),budget:{source:{maxWork:1,maxMs:0},frame:{maxWork:1,maxMs:0}}});abort.abort();await assert.rejects(run);}
    assert.equal(count().copies,count().closes);assert.equal(output.state().native.closed,true);output.dispose();
  }
});

test('pause, edits, native zero and empty scene release superseded rasters',()=>{
  const {session,count}=fixture();session.submit(input(0));drain(session);session.setPaused(true);session.submit(input(.3,'edit2'));assert.equal(session.read(),null);
  assert.equal(session.advance(budget),false);session.setPaused(false);drain(session);
  session.submit(input(.8,'edit3',0));assert.equal(session.read().instances[0].kind,'native');assert.equal(session.state().native.scenes,1);
  const empty=input(0,'empty',0);empty.scene={glyphs:[],bands:[]};empty.instances=[];session.submit(empty);assert.equal(session.read().instances.length,0);assert.equal(count().copies,count().closes);session.reset();
});

test('output validation and async callback failure do not orphan raster resources',()=>{
  const {session,count}=fixture();session.submit(input(0));drain(session);assert.throws(()=>session.output({transforms:[]}));assert.equal(count().copies-count().closes,1);
  assert.throws(()=>session.paint(host(),async()=>{}),/synchronous/);session.reset();assert.equal(count().copies,count().closes);
});
