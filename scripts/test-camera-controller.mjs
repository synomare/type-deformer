import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../blob-camera-controller.js',import.meta.url),'utf8');
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function harness({permission,play}={}){
 const nodes=new Map(),frames=[],changes=[];
 const node=id=>{
  if(!nodes.has(id))nodes.set(id,{dataset:{},hidden:false,disabled:false,textContent:'',handlers:new Map(),
   getContext(){return {clearRect(){}};},
   addEventListener(type,handler){this.handlers.set(type,handler);},
   removeEventListener(type,handler){if(this.handlers.get(type)===handler)this.handlers.delete(type);}
  });
  return nodes.get(id);
 };
 const media={stops:0,getTracks(){return [{stop:()=>this.stops++}];}};
 const video={srcObject:null,pauses:0,play:()=>play?.promise||Promise.resolve(),pause(){this.pauses++;}};
 const window=node('window');window.devicePixelRatio=1;
 const scope=vm.createContext({document:{getElementById:node,createElement:name=>{assert.equal(name,'video');return video;}},
  navigator:{mediaDevices:{getUserMedia:()=>permission?.promise||Promise.resolve(media)}},window,
  requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},cancelAnimationFrame(){}});
 vm.runInContext(source,scope);
 const controller=scope.TypeDeformerBlobCamera.create({params:()=>({blobDrawBounds:false}),frameChanged:()=>changes.push('frame')});
 return {controller,node,media,video,frames,changes,start:()=>node('btnBlobCamera').handlers.get('click')()};
}

test('camera controller stops an installed owned stream and detaches callbacks on disposal',async()=>{
 const h=harness();await h.start();
 assert.equal(h.controller.state.stream,h.media);assert.equal(h.frames.length,1);
 assert.equal(h.node('btnBlobCamera').textContent,'Stop Camera');
 h.controller.dispose();
 assert.equal(h.media.stops,1);assert.equal(h.controller.state.stream,null);assert.equal(h.video.srcObject,null);
 assert.equal(h.node('btnBlobCamera').handlers.size,0);assert.equal(h.node('window').handlers.size,0);
 assert.equal(h.changes.length,1);
});

test('a camera permission response arriving after disposal is released without playback',async()=>{
 const permission=deferred(),h=harness({permission}),pending=h.start();
 h.controller.dispose();permission.resolve(h.media);await pending;
 assert.equal(h.media.stops,1);assert.equal(h.controller.state.stream,null);
 assert.equal(h.video.srcObject,null);assert.equal(h.frames.length,0);
 assert.equal(h.node('btnBlobCamera').textContent,'Start Camera');
});

test('a rejected video play releases the acquired stream and leaves camera retry available',async()=>{
 const play=deferred(),h=harness({play}),pending=h.start();
 await Promise.resolve();play.reject(new Error('video decode failed'));await pending;
 assert.equal(h.media.stops,1);assert.equal(h.video.srcObject,null);assert.equal(h.video.pauses,1);
 assert.equal(h.controller.state.stream,null);assert.equal(h.frames.length,0);
 assert.equal(h.node('blobTrackStatus').dataset.state,'error');assert.equal(h.node('btnBlobCamera').disabled,false);
});

test('pagehide during pending playback prevents a late stream from restarting',async()=>{
 const play=deferred(),h=harness({play}),pending=h.start();
 await Promise.resolve();h.node('window').handlers.get('pagehide')();play.resolve();await pending;
 assert.equal(h.media.stops,1);assert.equal(h.video.srcObject,null);assert.equal(h.frames.length,0);
 assert.equal(h.node('blobTrackStatus').dataset.state,'idle');assert.equal(h.node('btnBlobCamera').disabled,false);
});
