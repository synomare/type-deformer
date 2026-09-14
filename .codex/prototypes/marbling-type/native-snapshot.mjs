// Native Compose bands may own a mutable Canvas. A plain scene-session packet
// must not retain that Canvas or silently drop it. This owner copies raster
// bands and retains them independently of live edits and output preparation.
// Not an editor registration, clock, font capture or whole-renderer cache.
let nextSnapshotId = 0;
const disposedError = () => new Error('Marbling native snapshot has been released');
const isThenable = value => value != null && typeof value.then === 'function';

function copyPlain(value, visit, path = [], ancestors = new Set(), budget = {count:0}) {
  if (++budget.count > 500000) throw new RangeError('Marbling native snapshot data budget exceeded');
  const replacement = visit?.(value,path);
  if (replacement !== undefined) return replacement;
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object') throw new TypeError('Marbling native state must be finite plain data');
  const array=Array.isArray(value),proto=Object.getPrototypeOf(value);
  if (!array && proto!==null && Object.getPrototypeOf(proto)!==null) throw new TypeError('Unsupported native state object');
  if (ancestors.has(value)) throw new TypeError('Marbling native state cannot contain cycles');
  ancestors.add(value);
  const result=array ? new Array(value.length) : {};
  for(const key of Reflect.ownKeys(value)) {
    if(array&&key==='length')continue;
    const property=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string'||!('value' in property))throw new TypeError('Marbling native state cannot contain accessors or symbols');
    if(!property.enumerable)continue;
    Object.defineProperty(result,key,{value:copyPlain(property.value,visit,[...path,key],ancestors,budget),enumerable:true,writable:true,configurable:true});
  }
  ancestors.delete(value);return result;
}
function freeze(value) {
  if(value&&typeof value==='object'){for(const key of Object.keys(value))freeze(value[key]);Object.freeze(value);}return value;
}

// Defaults apply only to this owner's copies, not the live source. No resizing
// or lossy serialization: use the native canvas dimensions and default sRGB.
export function copyMarblingRasterCanvas(source, createCanvas) {
  const canvas=createCanvas(source.width,source.height);
  if(canvas===source)throw new TypeError('Raster snapshot must own a separate canvas');
  try {
    canvas.width=source.width;canvas.height=source.height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Raster snapshot has no Canvas2D context');
    ctx.drawImage(source,0,0);return canvas;
  } catch(error) { canvas.width=0;canvas.height=0;throw error; }
}
export function releaseMarblingRasterCanvas(canvas) {
  if(typeof canvas.close==='function')canvas.close();else{canvas.width=0;canvas.height=0;}
}

export function createMarblingNativeSnapshot(input, {
  copyRaster, releaseRaster=releaseMarblingRasterCanvas, maxRasterPixels=16777216,
} = {}) {
  if(!Number.isSafeInteger(maxRasterPixels)||maxRasterPixels<1)throw new RangeError('Invalid native raster pixel budget');
  if(typeof releaseRaster!=='function')throw new TypeError('Native raster release must be a function');
  const descriptors=[],ids=new Map();
  // Validate/clone all ordinary state BEFORE allocating any raster resource.
  const data=copyPlain(input,(value,path)=>{
    if(path.length!==4||path[0]!=='scene'||path[1]!=='bands'||path[3]!=='source')return undefined;
    const band=Object.getOwnPropertyDescriptor(input.scene.bands,path[2])?.value;
    if(Object.getOwnPropertyDescriptor(band||{},'kind')?.value!=='raster'||!value)return undefined;
    if(typeof value!=='object')throw new TypeError('Raster band needs a native canvas source');
    if(!ids.has(value)){ids.set(value,descriptors.length);descriptors.push(value);}
    return {marblingRaster:ids.get(value)};
  });
  if(!Array.isArray(data?.scene?.glyphs)||!Array.isArray(data.scene.bands)
    ||typeof data.fontRevision!=='string'||!data.fontRevision||!data.params||!data.compositionState)
    throw new TypeError('Native snapshot needs scene, parameters, composition and font revision');
  if('marblingNative' in data.scene)throw new TypeError('Reserved native snapshot field');
  if(!Number.isFinite(data.surfaceFxPhase)||!Number.isFinite(data.dataMoshFrame))throw new TypeError('Native snapshot needs finite render clocks');
  let pixels=0;
  for(const source of descriptors){
    if(!Number.isSafeInteger(source.width)||!Number.isSafeInteger(source.height)||source.width<1||source.height<1)
      throw new RangeError('Invalid native raster dimensions');
    pixels+=source.width*source.height;
    if(!Number.isSafeInteger(pixels)||pixels>maxRasterPixels)throw new RangeError('Marbling native raster pixel budget exceeded');
  }
  if(descriptors.length&&(typeof copyRaster!=='function'||copyRaster.constructor?.name==='AsyncFunction'))throw new TypeError('Raster snapshot needs a synchronous copy adapter');
  const resources=[];
  function releaseCopies() {
    const failures=[];
    for(const resource of resources.splice(0))try{releaseRaster(resource);}catch(error){failures.push(error);}
    if(failures.length)throw new AggregateError(failures,'Native raster release failed');
  }
  try {
    for(const source of descriptors){
      const copy=copyRaster(source);
      if(ids.has(copy)||resources.includes(copy)||!copy||isThenable(copy))throw new TypeError('Raster adapter must synchronously return an independent copy');
      resources.push(copy);
      if(copy.width!==source.width||copy.height!==source.height)throw new RangeError('Raster snapshot dimensions changed');
    }
  } catch(error) {try{releaseCopies();}catch(cleanup){throw new AggregateError([error,cleanup],'Native snapshot capture failed');}throw error;}
  ids.clear();descriptors.length=0; // Never retain the mutable live Canvases.
  input=null;copyRaster=null;
  const token='marbling-native-'+(++nextSnapshotId);
  let retained=freeze({...data.scene,marblingNative:{token,state:{params:data.params,compositionState:data.compositionState,
    surfaceFxPhase:data.surfaceFxPhase,dataMoshFrame:data.dataMoshFrame,fontRevision:data.fontRevision},
    destination:data.destination ?? null,fontMetrics:data.fontMetrics ?? null}});
  let references=0,released=false;
  function lease() {
    if(released)throw disposedError();references++;
    let closed=false;
    function check(scene=retained){
      if(closed||released)throw disposedError();
      if(scene?.marblingNative?.token!==token)throw new TypeError('Native scene belongs to a different snapshot');
    }
    return Object.freeze({
      get scene(){check();return retained;},
      retain(){check();return lease();},
      state(){return {closed,released,references,rasters:resources.length,rasterPixels:released?0:pixels};},
      // read/set are synchronous host accessors for the actual editor lexical
      // bindings. Restoring object references also preserves live UI edits.
      // Only params/composition/two clocks are scoped; caches and external
      // history engines are NOT snapshotted. The callback must be synchronous
      // and must treat borrowed band Canvases as read-only.
      paint(host,callback,scene=retained){
        check(scene);
        if(typeof host?.read!=='function'||typeof host.set!=='function'||typeof callback!=='function'
          ||callback.constructor?.name==='AsyncFunction')throw new TypeError('Native paint needs synchronous host accessors and callback');
        const previous=host.read(),state=retained.marblingNative.state;
        if(isThenable(previous))throw new TypeError('Native host read must be synchronous');
        if(previous?.fontRevision!==state.fontRevision)throw new Error('Native font revision changed; capture a fresh scene');
        const active=lease();
        try {
          const paintScene=copyPlain(scene,(value,path)=>{
            if(path.length===3&&path[0]==='bands'&&path[2]==='source'&&scene.bands[path[1]].kind==='raster'&&value){
              const id=value?.marblingRaster;
              if(!Number.isInteger(id)||id<0||id>=resources.length)throw new TypeError('Invalid native raster reference');
              return resources[id];
            }
            return undefined;
          });
          const result=host.set(copyPlain(state));if(isThenable(result))throw new TypeError('Native host set must be synchronous');
          const painted=callback(paintScene);
          if(isThenable(painted))throw new TypeError('Native paint cannot outlive its state transaction');
          return painted;
        } finally {try{host.set(previous);}finally{active.dispose();}}
      },
      dispose(){
        if(closed)return false;closed=true;
        if(--references===0){released=true;retained=null;releaseCopies();}return true;
      },
    });
  }
  return lease();
}
