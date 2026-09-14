// Exact CPU raster reuse for one prepared Scroll glyph source. Geometry and
// pixels are cache-owned; callers only receive copied RGBA. No resolution,
// phase or parameter quantisation, background work, Canvas or ImageBitmap.
import {scrollSettings,renderScrollSurface} from './core.mjs';
import {createScrollSurfacePool} from './surface-pool.mjs';

const DEFAULT_INK=Object.freeze([.56,.48,.37]);
const mod1=value=>((value%1)+1)%1;
function colour(value,fallback,label){
  const source=value??fallback;
  if(!Array.isArray(source)||source.length!==3||!source.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new TypeError(`Invalid Scroll ${label} RGB`);
  return Object.freeze(source.slice());
}
function geometryKey(p,phase){
  if(!p.curl)return JSON.stringify(['flat',p.gauge]);
  const taper=p.mode==='spiral'?p.taper:0,time=p.motion?phase:0;
  return JSON.stringify([p.mode,p.curl,taper,p.gauge,p.motion,time]);
}

export function normalizeScrollFrameRequest(input={},phase=0,frame={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||!frame||typeof frame!=='object'||Array.isArray(frame))throw new TypeError('Invalid Scroll frame request');
  if(!Number.isFinite(phase))throw new TypeError('Invalid Scroll frame phase');
  const p=scrollSettings(input),shapePhase=p.motion&&p.curl?mod1(phase):0;
  const finish=input.finish??'classic';
  if(finish!=='classic'&&finish!=='studio')throw new TypeError('Invalid Scroll surface finish');
  const ink=colour(input.ink,DEFAULT_INK,'front'),backInk=colour(input.backInk,ink,'back'),edgeInk=colour(input.edgeInk,ink,'edge');
  const width=frame.width??384,height=frame.height??384,scale=frame.scale??1,centerX=frame.centerX??0,centerY=frame.centerY??0,
    samples=frame.samples??2,maxSampleTests=frame.maxSampleTests??100000000,maxSamples=frame.maxSamples??4194304,viewPhase=frame.phase??0;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>4194304
    ||!Number.isInteger(samples)||samples<1||samples>4||![scale,centerX,centerY,viewPhase].every(Number.isFinite)||scale<=0
    ||!Number.isSafeInteger(maxSampleTests)||maxSampleTests<1||!Number.isSafeInteger(maxSamples)||maxSamples<1||width*height*samples*samples>maxSamples)throw new RangeError('Invalid Scroll frame or work budget');
  // renderScrollSurface forces display motion to zero. Validate a supplied view
  // phase like the direct renderer, then canonicalize its provably inert value.
  const renderFrame=Object.freeze({width,height,scale,centerX,centerY,samples,maxSampleTests,maxSamples,phase:0});
  const renderInput=Object.freeze({...p,finish,ink,backInk,edgeInk});
  const meshKey=geometryKey(p,shapePhase);
  const key=JSON.stringify([meshKey,p.yaw,p.tilt,p.metal,p.roughness,p.opacity,p.unlit,finish,ink,backInk,edgeInk,
    width,height,scale,centerX,centerY,samples,maxSampleTests,maxSamples,renderFrame.phase]);
  return Object.freeze({key,geometryKey:meshKey,input:renderInput,phase:shapePhase,frame:renderFrame,bytes:width*height*4});
}

export function createScrollFramePool(source,{maxBytes=64*1024*1024,maxFrames=8,surfaceSlots=2,renderer=renderScrollSurface}={}){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isInteger(maxFrames)||maxFrames<1||maxFrames>1024
    ||!Number.isInteger(surfaceSlots)||surfaceSlots<1||surfaceSlots>2)throw new RangeError('Invalid Scroll frame-pool budget');
  if(typeof renderer!=='function'||renderer.constructor?.name==='AsyncFunction')throw new TypeError('Scroll frame renderer must be synchronous');
  const surfaces=createScrollSurfacePool(source,{slots:surfaceSlots,maxBytes});
  const surfaceBytes=surfaces.stats().managedBytes;
  let frames=new Map(),geometries=new Map(),frameBytes=0,held=0,sequence=0,hits=0,misses=0,builds=0,evictions=0,geometryHits=0,rendering=0,closing=false,disposed=false;
  function dropFrame(entry,countEviction=false){
    if(entry.held||frames.get(entry.key)!==entry)return false;
    frames.delete(entry.key);frameBytes-=entry.bytes;entry.pixels=null;if(countEviction)evictions++;return true;
  }
  function makeRoom(bytes){
    if(surfaceBytes+bytes>maxBytes)throw new RangeError('Scroll frame byte budget exceeded');
    const idle=[...frames.values()].filter(entry=>!entry.held).sort((a,b)=>a.used-b.used);
    while((frames.size>=maxFrames||surfaceBytes+frameBytes+bytes>maxBytes)&&idle.length)dropFrame(idle.shift(),true);
    if(frames.size>=maxFrames||surfaceBytes+frameBytes+bytes>maxBytes)throw new RangeError('Scroll frame pool has no evictable capacity');
  }
  function releaseGeometry(entry){
    if(entry.busy||geometries.get(entry.key)!==entry)return false;
    geometries.delete(entry.key);entry.lease.release();entry.lease=null;return true;
  }
  function takeGeometry(description){
    let entry=geometries.get(description.geometryKey);
    if(entry){geometryHits++;entry.used=++sequence;entry.busy++;return entry;}
    if(geometries.size>=surfaceSlots){
      const idle=[...geometries.values()].filter(item=>!item.busy).sort((a,b)=>a.used-b.used)[0];
      if(!idle)throw new RangeError('Scroll geometry pool has no free slot');
      releaseGeometry(idle);
    }
    const lease=surfaces.acquire(description.input,description.phase);
    entry={key:description.geometryKey,lease,busy:1,used:++sequence};geometries.set(entry.key,entry);return entry;
  }
  function finishGeometry(entry){
    entry.busy--;
    if(closing)releaseGeometry(entry);
  }
  function finishDispose(){
    if(closing&&!frames.size&&!geometries.size&&!rendering)disposed=true;
  }
  function metadata(entry){return Object.freeze({width:entry.width,height:entry.height,bytes:entry.bytes,stats:entry.stats});}
  function copyStats(value){
    if(value===undefined)return Object.freeze({});
    if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Invalid Scroll frame renderer stats');
    const result={};
    for(const key of Reflect.ownKeys(value)){
      const property=Object.getOwnPropertyDescriptor(value,key);
      if(typeof key!=='string'||!property?.enumerable||!('value' in property))throw new TypeError('Invalid Scroll frame renderer stats');
      const item=property.value;
      if(typeof item==='number'&&!Number.isFinite(item)||!['number','string','boolean'].includes(typeof item)&&item!==null)throw new TypeError('Invalid Scroll frame renderer stats');
      result[key]=item;
    }
    return Object.freeze(result);
  }
  function ticket(entry){
    entry.held++;held++;entry.used=++sequence;let live=true;
    const check=()=>{if(!live)throw new Error('Scroll frame lease released');};
    return Object.freeze({
      get key(){check();return entry.key;},
      metadata(){check();return metadata(entry);},
      copyPixels(target){
        check();
        if(target===undefined)return entry.pixels.slice();
        if(!(target instanceof Uint8ClampedArray)||target.length!==entry.pixels.length)throw new TypeError('Scroll frame copy target must be exact Uint8ClampedArray');
        target.set(entry.pixels);return target;
      },
      read(){check();return Object.freeze({pixels:entry.pixels.slice(),width:entry.width,height:entry.height,stats:entry.stats});},
      release(){
        if(!live)return false;live=false;entry.held--;held--;
        if(closing)dropFrame(entry);entry=null;finishDispose();return true;
      }
    });
  }
  function validateResult(result,description){
    if(!result||result.width!==description.frame.width||result.height!==description.frame.height
      ||!(result.pixels instanceof Uint8ClampedArray)||result.pixels.length!==description.bytes)throw new TypeError('Invalid Scroll frame renderer result');
    const stats=copyStats(result.stats);
    return {pixels:result.pixels.slice(),stats};
  }
  return Object.freeze({
    acquire(input={},phase=0,frame={}){
      if(closing)throw new Error('Scroll frame pool disposed');
      const description=normalizeScrollFrameRequest(input,phase,frame);
      let entry=frames.get(description.key);
      if(entry){hits++;return ticket(entry);}
      makeRoom(description.bytes);misses++;
      const geometry=takeGeometry(description);let result;
      rendering++;
      try{result=validateResult(renderer(geometry.lease.read(),description.input,description.frame),description);}
      finally{rendering--;finishGeometry(geometry);finishDispose();}
      if(closing)throw new Error('Scroll frame pool disposed during render');
      entry={key:description.key,pixels:result.pixels,width:description.frame.width,height:description.frame.height,bytes:description.bytes,
        stats:result.stats,held:0,used:++sequence};
      frames.set(entry.key,entry);frameBytes+=entry.bytes;builds++;return ticket(entry);
    },
    clear(){
      if(closing)throw new Error('Scroll frame pool disposed');
      let removed=0;for(const entry of [...frames.values()])if(dropFrame(entry))removed++;return removed;
    },
    stats(){const surface=surfaces.stats();return {entries:frames.size,geometryEntries:geometries.size,held,hits,misses,builds,evictions,geometryHits,
      frameBytes,surfaceBytes:surface.managedBytes,managedBytes:surface.managedBytes+frameBytes,maxBytes,maxFrames,surfaceSlots,closing,disposed};},
    dispose(){
      if(closing)return false;closing=true;
      for(const entry of [...frames.values()])dropFrame(entry);
      surfaces.dispose();for(const entry of [...geometries.values()])releaseGeometry(entry);
      finishDispose();return true;
    }
  });
}
