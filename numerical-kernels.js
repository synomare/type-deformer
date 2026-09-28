(function(root){
  'use strict';
  // Shared exact numerical kernels. No presentation quality or solver iteration
  // settings live here. See docs/operator-performance.md for research and tests.
  // Reuse radix-2 permutations and twiddles; generate twiddles with the same
  // recurrence as the transform, preserving its floating-point operation order.
  var fftPlans=new Map(),planBytes=0,PLAN_BYTES=512*1024;
  function fftPlan(n,inverse){var key=n+'/'+!!inverse,hit=fftPlans.get(key);if(hit){fftPlans.delete(key);fftPlans.set(key,hit);return hit;}
    var swaps=[],stages=[];
    for(var i=1,j=0;i<n;i++){var bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)swaps.push(i,j);}
    for(var len=2;len<=n;len*=2){var angle=(inverse?2:-2)*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle),re=new Float64Array(len/2),im=new Float64Array(len/2),ur=1,ui=0;
      for(var k=0;k<len/2;k++){re[k]=ur;im[k]=ui;var next=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=next;}stages.push({len:len,re:re,im:im});}
    var bytes=swaps.length*4+stages.reduce(function(total,stage){return total+stage.re.byteLength+stage.im.byteLength;},0);
    hit={swaps:Uint32Array.from(swaps),stages:stages,bytes:bytes};
    if(bytes<=PLAN_BYTES){while(planBytes+bytes>PLAN_BYTES&&fftPlans.size){var first=fftPlans.keys().next().value;planBytes-=fftPlans.get(first).bytes;fftPlans.delete(first);}fftPlans.set(key,hit);planBytes+=bytes;}return hit;
  }
  function fftLine(re,im,n,offset,stride,inverse,plan){var swaps=plan.swaps;
    for(var i=0;i<swaps.length;i+=2){var a=offset+swaps[i]*stride,b=offset+swaps[i+1]*stride,t=re[a];re[a]=re[b];re[b]=t;t=im[a];im[a]=im[b];im[b]=t;}
    for(var si=0;si<plan.stages.length;si++){var stage=plan.stages[si],len=stage.len;for(var start=0;start<n;start+=len)for(var k=0;k<len/2;k++){var a=offset+(start+k)*stride,b=offset+(start+k+len/2)*stride,ur=stage.re[k],ui=stage.im[k],vr=re[b]*ur-im[b]*ui,vi=re[b]*ui+im[b]*ur;re[b]=re[a]-vr;im[b]=im[a]-vi;re[a]+=vr;im[a]+=vi;}}
    if(inverse)for(var i=0;i<n;i++){re[offset+i*stride]/=n;im[offset+i*stride]/=n;}
  }
  function fft2(re,im,w,h,inverse){
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||(w&(w-1))||(h&(h-1))||re.length!==w*h||im.length!==w*h)throw new RangeError('FFT dimensions must be powers of two');
    var rows=fftPlan(w,inverse),columns=fftPlan(h,inverse);
    for(var y=0;y<h;y++)fftLine(re,im,w,y*w,1,inverse,rows);
    for(var x=0;x<w;x++)fftLine(re,im,h,x,w,inverse,columns);
  }
  function nearestIndex(points){
    function build(ids,axis){if(!ids.length)return null;ids.sort(function(a,b){return points[a][axis]-points[b][axis]||a-b;});var m=ids.length>>1;return {id:ids[m],axis:axis,left:build(ids.slice(0,m),1-axis),right:build(ids.slice(m+1),1-axis)};}
    var tree=build(points.map(function(_,i){return i;}),0);
    return function(x,y){var best=0,min=Infinity;
      function visit(node){if(!node)return;var p=points[node.id],dx=x-p[0],dy=y-p[1],ds=dx*dx+dy*dy;
        if(ds<min||ds===min&&node.id<best){min=ds;best=node.id;}
        var delta=node.axis?dy:dx,near=delta<0?node.left:node.right,far=delta<0?node.right:node.left;
        visit(near);if(delta*delta<=min)visit(far);
      }visit(tree);return best;
    };
  }
  // A hash selects a candidate; exact source comparison establishes identity.
  // Each solver owns a byte-bounded LRU, separate from rendered canvas caches.
  var byteAlpha=Float32Array.from({length:256},function(_,i){return i/255;});
  function packAlpha(alpha){
    // This is lossless encoding, not quantization: arbitrary scalar masks fall
    // back to their original typed representation if any value cannot round-trip.
    if(alpha.BYTES_PER_ELEMENT===4){var compact=new Uint8Array(alpha.length);for(var i=0;i<alpha.length;i++){var value=Math.round(alpha[i]*255);if(value<0||value>255||byteAlpha[value]!==alpha[i])return {data:alpha.slice(),compact:false};compact[i]=value;}return {data:compact,compact:true};}
    return {data:alpha.slice(),compact:false};
  }
  var namedCaches=new Map();
  // Cache only owned, explicitly sized values. Disposal runs on replacement,
  // eviction and clear so canvas-backed numerical stages cannot outlive owners.
  function createByteCache(maxBytes,name,dispose,maxEntries){
    if(!Number.isFinite(maxBytes)||maxBytes<0)throw new RangeError('Expected a nonnegative cache budget');
    var entries=new Map(),bytes=0,hits=0,misses=0;maxEntries=maxEntries||128;
    function remove(key){var entry=entries.get(key);if(!entry)return;entries.delete(key);bytes-=entry.bytes;if(dispose)dispose(entry.value);}
    var cache={get:function(key){var e=entries.get(key);if(!e){misses++;return undefined;}hits++;entries.delete(key);entries.set(key,e);return e.value;},
      set:function(key,value,size){var old=entries.get(key);if(old){if(old.value===value){entries.delete(key);bytes-=old.bytes;}else remove(key);}
        if(!Number.isFinite(size)||size<0||size>maxBytes)return false;
        while(entries.size&&(bytes+size>maxBytes||entries.size>=maxEntries))remove(entries.keys().next().value);
        entries.set(key,{value:value,bytes:size});bytes+=size;return true;},
      clear:function(){Array.from(entries.keys()).forEach(remove);hits=misses=0;},
      stats:function(){return {entries:entries.size,bytes:bytes,maxBytes:maxBytes,hits:hits,misses:misses};}};
    if(name)namedCaches.set(name,cache);return cache;
  }
  function createMaskedCache(maxBytes,name){
    if(!Number.isFinite(maxBytes)||maxBytes<0)throw new RangeError('Expected a nonnegative cache budget');
    var entries=new Map(),retainedBytes=0,hits=0,misses=0;
    function remove(key){var entry=entries.get(key);retainedBytes-=entry.bytes;entries.delete(key);}
    var cache={
      get:function(source,parameters,solve,sizeOf){
        var alpha=source.alpha,raw=alpha.byteOffset%4===0&&alpha.byteLength%4===0?new Uint32Array(alpha.buffer,alpha.byteOffset,alpha.byteLength/4):new Uint8Array(alpha.buffer,alpha.byteOffset,alpha.byteLength),hash=2166136261;
        for(var i=0;i<raw.length;i++)hash=Math.imul(hash^raw[i],16777619);
        var key=JSON.stringify([source.w,source.h,source.scale,parameters,hash]),entry=entries.get(key),same=!!entry&&entry.alpha.length===alpha.length;
        if(same)for(var i=0;i<alpha.length;i++)if((entry.compact?byteAlpha[entry.alpha[i]]:entry.alpha[i])!==alpha[i]){same=false;break;}
        if(same){hits++;entries.delete(key);entries.set(key,entry);return entry.value;}
        misses++;var value=solve();if(value==null)return value;
        var saved=packAlpha(alpha),bytes=saved.data.byteLength+sizeOf(value);if(entry)remove(key);
        if(Number.isFinite(bytes)&&bytes>=saved.data.byteLength&&bytes<=maxBytes){
          while(entries.size&&(retainedBytes+bytes>maxBytes||entries.size>=16))remove(entries.keys().next().value);
          entries.set(key,{alpha:saved.data,compact:saved.compact,value:value,bytes:bytes});retainedBytes+=bytes;
        }return value;
      },
      clear:function(){entries.clear();retainedBytes=hits=misses=0;},
      stats:function(){return {entries:entries.size,bytes:retainedBytes,maxBytes:maxBytes,hits:hits,misses:misses};}
    };
    if(name)namedCaches.set(name,cache);return cache;
  }
  function cacheStats(){var bytes=planBytes,maxBytes=PLAN_BYTES,solvers={};namedCaches.forEach(function(cache,name){var stats=cache.stats();solvers[name]=stats;bytes+=stats.bytes;maxBytes+=stats.maxBytes;});return {bytes:bytes,maxBytes:maxBytes,solvers:solvers};}
  function clearCaches(){fftPlans.clear();planBytes=0;namedCaches.forEach(function(cache){cache.clear();});}
  root.TypeDeformerNumerics={fft2:fft2,nearestIndex:nearestIndex,createMaskedCache:createMaskedCache,createByteCache:createByteCache,cacheStats:cacheStats,clearCaches:clearCaches,
    planStats:function(){return {entries:fftPlans.size,bytes:planBytes,maxBytes:PLAN_BYTES};}};
})(typeof globalThis!=='undefined'?globalThis:this);
