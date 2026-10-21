(function(root){
  'use strict';
  var current=null,metadata=new WeakMap(),gradientPairs=new WeakMap(),fieldSamplers=new WeakMap(),rasterSources=new WeakMap(),owners=new WeakMap(),scopeOwners=new WeakMap(),retained=new WeakMap(),releasing=new WeakSet(),retainedBytes=0,peakRetainedBytes=0,scope=null;
  var nativeCreate=typeof document!=='undefined'?document.createElement.bind(document):null;
  var MiB=1024*1024;
  var budgets=Object.freeze({workBytes:768*MiB,layerBytes:512*MiB,composeBytes:512*MiB,textureBytes:256*MiB,videoBytes:512*MiB,maxCanvasPixels:64*MiB});
  var exportBudgets=Object.freeze({workBytes:2048*MiB,layerBytes:1024*MiB,composeBytes:1024*MiB,textureBytes:512*MiB,videoBytes:budgets.videoBytes,maxCanvasPixels:128*MiB,timeoutMs:30*60*1000});
  var mobileExportBudgets=Object.freeze({workBytes:1024*MiB,layerBytes:384*MiB,composeBytes:512*MiB,textureBytes:256*MiB,videoBytes:budgets.videoBytes,maxCanvasPixels:64*MiB,timeoutMs:exportBudgets.timeoutMs});
  function limits(purpose,mobile){
    if(purpose==='proof')return budgets;
    if(mobile==null)mobile=!!(root.navigator&&(/Android|iPhone|iPad|iPod/.test((root.navigator.userAgent||'')+' '+(root.navigator.platform||''))||/Mac/.test(root.navigator.userAgent||'')&&(root.navigator.maxTouchPoints>1||root.document&&'ontouchend' in root.document)));
    if(purpose==='export')return mobile?mobileExportBudgets:exportBudgets;
    return {workBytes:(mobile?128:256)*MiB,layerBytes:(mobile?64:128)*MiB,composeBytes:(mobile?96:192)*MiB,textureBytes:64*MiB,videoBytes:budgets.videoBytes,maxCanvasPixels:(mobile?8:16)*MiB};
  }
  // Reservations coordinate independent iframe/video jobs. These are declared
  // working-set estimates, not a claim to measure DOM, driver or JS heap bytes.
  function createResourcePool(capacity){
    var leases=new Map(),sequence=0,bytes=0,peakBytes=0;
    function reserve(label,estimate,exclusive,group){
      if(!Number.isFinite(estimate)||estimate<0||estimate>capacity-bytes)throw Object.assign(new Error('同時描画のメモリ予約が上限を超えます。実行中の書き出しや探索を終了して再試行してください。'),{code:'RENDER_RESERVATION_EXCEEDED'});
      if(exclusive&&Array.from(leases.values()).some(function(item){return item.exclusive&&item.group!==group;}))throw Object.assign(new Error('別の書き出し・探索が描画資源を使用しています。終了または取消後に再試行してください。'),{code:'RENDER_RESOURCE_BUSY'});
      var id=++sequence,closed=false;group=group||'render-job-'+id;leases.set(id,{id:id,label:label,bytes:estimate,exclusive:!!exclusive,group:group});bytes+=estimate;peakBytes=Math.max(bytes,peakBytes);
      return {group:group,release:function(){if(closed)return;closed=true;bytes-=leases.get(id).bytes;leases.delete(id);}};
    }
    return {reserve:reserve,inspect:function(){return {capacity:capacity,reservedBytes:bytes,peakReservedBytes:peakBytes,leases:Array.from(leases.values()).map(function(item){return Object.assign({},item);})};}};
  }
  var resources;
  try{resources=root.parent&&root.parent!==root&&root.parent.TypeDeformerRenderContext&&root.parent.TypeDeformerRenderContext.resources;}catch(error){/* standalone/cross-origin realm */}
  if(!resources)resources=createResourcePool(limits('export').workBytes+limits('edit').workBytes+budgets.videoBytes);
  function nativeCanvas(w,h){var c=nativeCreate?nativeCreate('canvas'):new OffscreenCanvas(w||1,h||1);c.width=w||1;c.height=h||1;return c;}
  function dimension(value){value=Number(value);if(!Number.isFinite(value)||value<0||value>4294967295)throw Object.assign(new RangeError('描画面の寸法が不正です。'),{code:'RENDER_MEMORY_EXCEEDED'});return Math.floor(value);}
  function checkDimensions(width,height,context){if(context&&width*height>context.maxCanvasPixels)throw Object.assign(new Error('描画面が作業メモリ予算を超えました。設定値は保持されています。'),{code:'RENDER_MEMORY_EXCEEDED'});}
  function guardDimensions(canvas){
    ['width','height'].forEach(function(key){
      var descriptor,prototype=canvas,value=canvas[key];while(prototype&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(prototype,key);prototype=Object.getPrototypeOf(prototype);}
      if(!descriptor||descriptor.configurable===false&&Object.prototype.hasOwnProperty.call(canvas,key))return;
      Object.defineProperty(canvas,key,{configurable:true,enumerable:descriptor.enumerable,get:function(){return descriptor.get?descriptor.get.call(canvas):value;},set:function(next){
        if(releasing.has(canvas)){if(descriptor.set)descriptor.set.call(canvas,next);else value=next;return;}
        next=dimension(next);var width=key==='width'?next:canvas.width,height=key==='height'?next:canvas.height,owner=owners.get(canvas)||current,planned=width*height*4;
        checkDimensions(width,height,owner);assertAllocation(planned,owner&&owner.accounted.get(canvas),owner);
        if(descriptor.set)descriptor.set.call(canvas,next);else value=next;
        if(retained.has(canvas)){unretain(canvas);retained.set(canvas,planned);retainedBytes+=planned;peakRetainedBytes=Math.max(peakRetainedBytes,retainedBytes);}else if(owner)account(canvas,planned,owner);
      }});
    });return canvas;
  }
  function make(options){options=options||{};var purpose=['edit','proof','export'].includes(options.purpose)?options.purpose:'edit',budget=limits(purpose,options.mobile);
    var c={purpose:purpose,presentation:options.presentation==='low'&&purpose==='edit'?'low':'standard',
      width:Math.max(1,Number(options.width)||1),height:Math.max(1,Number(options.height)||1),
      viewScale:Math.max(.000001,Number(options.viewScale)||1),factor:Math.max(.000001,Number(options.factor)||1),
      precision:purpose==='edit'?'display':'output',nativeLocalDensity:!!options.nativeLocalDensity,software:options.software==null?!!(current&&current.software):!!options.software,memoryBudget:options.memoryBudget||budget.workBytes,
      maxCanvasPixels:options.maxCanvasPixels||budget.maxCanvasPixels,tile:options.tile||null,
      referenceWidth:options.referenceWidth||0,referenceHeight:options.referenceHeight||0,overscan:options.overscan||0,
      accounted:new WeakMap(),bytes:0,peakBytes:0,created:0};
    c.key=[purpose,c.presentation,c.software?'cpu':'auto',c.factor,c.tile&&[c.tile.x,c.tile.y,c.tile.width,c.tile.height].join(',')].join('/');if(c.nativeLocalDensity)c.key+='/local-native';return c;
  }
  function synchronous(fn){
    if(typeof fn!=='function'||Object.prototype.toString.call(fn)==='[object AsyncFunction]')throw Object.assign(new TypeError('RenderContext scopes require a synchronous callback; scope each render step after awaiting preparation.'),{code:'RENDER_ASYNC_SCOPE'});
    var result=fn();if(result&&typeof result.then==='function'){Promise.resolve(result).catch(function(){});throw Object.assign(new TypeError('RenderContext scopes cannot return a Promise; scope each synchronous render step separately.'),{code:'RENDER_ASYNC_SCOPE'});}return result;
  }
  function withContext(context,fn){var before=current;current=context;try{return synchronous(fn);}finally{current=before;}}
  // Renderers are synchronous. Reclaim a glyph/tile's temporaries even when
  // drawing fails; explicitly retained cache images have a separate byte cap.
  function withScope(fn){var before=scope,local=new Set();scope=local;try{return synchronous(fn);}finally{scope=before;local.forEach(release);}}
  function unscope(value){var owner=scopeOwners.get(value);if(owner){owner.delete(value);scopeOwners.delete(value);}}
  function unretain(value){var bytes=retained.get(value);if(bytes!=null){retainedBytes-=bytes;retained.delete(value);}}
  function retain(value){unscope(value);unaccount(value);unretain(value);var bytes=byteSize(value);retained.set(value,bytes);retainedBytes+=bytes;peakRetainedBytes=Math.max(peakRetainedBytes,retainedBytes);return value;}
  function unaccount(value){var owner=owners.get(value);if(owner){owner.bytes-=owner.accounted.get(value)||0;owner.accounted.delete(value);owners.delete(value);}}
  function assertAllocation(bytes,old,context){context=context||current;if(!Number.isFinite(bytes)||bytes<0)throw Object.assign(new RangeError('描画メモリ量が不正です。'),{code:'RENDER_MEMORY_EXCEEDED'});if(!context)return;var next=context.bytes+bytes-(old||0);
    if(next>context.memoryBudget)throw Object.assign(new Error('描画に必要な作業メモリが '+Math.ceil(next/MiB)+' MB になり、予算 '+Math.round(context.memoryBudget/MiB)+' MB を超えました。設定値は保持されています。'),{code:'RENDER_MEMORY_EXCEEDED'});
  }
  function account(canvas,plannedBytes,context){context=context||current;if(!context)return;var bytes=plannedBytes==null?byteSize(canvas):plannedBytes,old=context.accounted.get(canvas)||0,next=context.bytes+bytes-old;
    assertAllocation(bytes,old,context);
    if(owners.get(canvas)!==context){unaccount(canvas);unscope(canvas);}unretain(canvas);
    context.accounted.set(canvas,bytes);context.bytes=next;context.peakBytes=Math.max(context.peakBytes,next);
    owners.set(canvas,context);if(scope&&!scopeOwners.has(canvas)){scope.add(canvas);scopeOwners.set(canvas,scope);}
  }
  function physical(canvas){return metadata.get(canvas)?.visual||canvas;}
  function analysis(canvas){return metadata.get(canvas)?.logical||canvas;}
  function byteSize(canvas){if(ArrayBuffer.isView(canvas)||canvas instanceof ArrayBuffer)return canvas.byteLength;var m=metadata.get(canvas);return m?(m.logical.width*m.logical.height+m.visual.width*m.visual.height)*4:(canvas.width||0)*(canvas.height||0)*4;}
  function release(canvas){var m=metadata.get(canvas);unaccount(canvas);unretain(canvas);unscope(canvas);
    if(ArrayBuffer.isView(canvas)||canvas instanceof ArrayBuffer)return;
    if(m){m.logical.width=m.logical.height=m.visual.width=m.visual.height=1;}else if(canvas){releasing.add(canvas);try{canvas.width=canvas.height=1;}finally{releasing.delete(canvas);}}
  }
  function imageRect(source,args,visual){
    var m=metadata.get(source),sw=m?m.logical.width:source.width,sh=m?m.logical.height:source.height;
    if(!m)return [source].concat(args);
    if(!visual)return [m.logical].concat(args);
    var r=args.length===2?[0,0,sw,sh,args[0],args[1],sw,sh]:args.length===4?[0,0,sw,sh,...args]:args.slice();
    var x0=Math.max(r[0],m.originX),y0=Math.max(r[1],m.originY),x1=Math.min(r[0]+r[2],m.originX+m.visual.width/m.factor),y1=Math.min(r[1]+r[3],m.originY+m.visual.height/m.factor);
    if(x1<=x0||y1<=y0||!r[2]||!r[3])return null;
    return [m.visual,(x0-m.originX)*m.factor,(y0-m.originY)*m.factor,(x1-x0)*m.factor,(y1-y0)*m.factor,
      r[4]+(x0-r[0])/r[2]*r[6],r[5]+(y0-r[1])/r[3]*r[7],(x1-x0)/r[2]*r[6],(y1-y0)/r[3]*r[7]];
  }
  function drawImage(ctx,source){if(source.getContext)assertCanvas(source);requireContext(ctx);var args=Array.prototype.slice.call(arguments,2),resolved=imageRect(source,args,true);if(resolved)ctx.drawImage.apply(ctx,resolved);}
  function requireContext(ctx){
    if(!ctx||ctx.isContextLost&&ctx.isContextLost())throw Object.assign(new Error('画像の描画領域が不足したか、描画中に失われました。'),{code:'CANVAS_CONTEXT_LOST'});
    return ctx;
  }
  function assertCanvas(canvas,expected){
    if(expected&&(canvas.width!==expected.width||canvas.height!==expected.height))throw Object.assign(new Error('出力用の描画領域が描画中に変更されました。同じ設定で再計算してください。'),{code:'CANVAS_CONTEXT_LOST'});
    for(var source of new Set([physical(canvas),analysis(canvas)]))requireContext(source.getContext('2d'));return canvas;
  }
  function hasVisiblePixels(canvas,background){
    var source=physical(canvas),ctx=requireContext(source.getContext('2d'));
    // Bound readback memory even for a large output; do not downsample thin ink.
    for(var y=0;y<source.height;y+=128)for(var x=0;x<source.width;x+=1024){
      var data=ctx.getImageData(x,y,Math.min(1024,source.width-x),Math.min(128,source.height-y)).data;
      for(var i=0;i<data.length;i+=4)if(data[i+3]&&(!background||Math.max(Math.abs(data[i]-background[0]),Math.abs(data[i+1]-background[1]),Math.abs(data[i+2]-background[2]))*data[i+3]>255))return true;
    }
    return false;
  }
  function createCanvas(w,h,options){
    w=dimension(w||1);h=dimension(h||1);
    if(current&&Math.max(1,w||1)*Math.max(1,h||1)>current.maxCanvasPixels)throw Object.assign(new Error('描画面が作業メモリ予算を超えました。文字サイズや効果を軽くしてください。設定値は保持されています。'),{code:'RENDER_MEMORY_EXCEEDED'});
    var preferred=options&&options.willReadFrequently||current&&current.software?{willReadFrequently:true}:undefined;
    var requestedFactor=options&&Number.isFinite(options.factor)&&options.factor>0?options.factor:current&&current.factor;
    assertAllocation(Math.max(1,w||1)*Math.max(1,h||1)*4);
    if(!current || (Math.abs(requestedFactor-1)<1e-8&&!current.tile)){var normal=nativeCanvas(w,h);try{if(preferred)requireContext(normal.getContext('2d',preferred));account(normal);guardDimensions(normal);}catch(error){release(normal);throw error;}return normal;}
    var context=current,logical=nativeCanvas(w,h),visual=nativeCanvas(1,1),m={logical:logical,visual:visual,factor:requestedFactor,originX:0,originY:0,context:context},proxy,ctxProxy;
    function resize(key,value){
      var logicalWidth=key==='width'?dimension(value):logical.width,logicalHeight=key==='height'?dimension(value):logical.height;
      checkDimensions(logicalWidth,logicalHeight,context);
      var tile=context.tile,clipped=options&&options.tiled&&tile&&logicalWidth===context.referenceWidth&&logicalHeight===context.referenceHeight;
      var pad=clipped?context.overscan:0;
      m.originX=clipped?(tile.x-pad)/m.factor:0;m.originY=clipped?(tile.y-pad)/m.factor:0;
      var width=clipped?tile.width+pad*2:Math.max(1,Math.ceil(logicalWidth*m.factor)),height=clipped?tile.height+pad*2:Math.max(1,Math.ceil(logicalHeight*m.factor));
      if(width*height>context.maxCanvasPixels)throw Object.assign(new Error('効果の描画面 '+width+' × '+height+' px が1枚の作業上限を超えました。分割できる出力領域を選ぶか、文字サイズを調整してください。設定値は保持されています。'),{code:'RENDER_MEMORY_EXCEEDED'});
      if(proxy)account(proxy,(logicalWidth*logicalHeight+width*height)*4,context);
      if(key)logical[key]=dimension(value);
      visual.width=width;visual.height=height;
      requireContext(visual.getContext('2d',preferred)).setTransform(m.factor,0,0,m.factor,-m.originX*m.factor,-m.originY*m.factor);
    }
    function context2d(options){
      if(ctxProxy)return ctxProxy;
      var attributes=preferred?Object.assign({},options,preferred):options;
      var low=requireContext(logical.getContext('2d',attributes)),high=requireContext(visual.getContext('2d',attributes));
      var readers=new Set(['getImageData','createImageData','measureText','getTransform','getLineDash','isPointInPath','isPointInStroke','getContextAttributes','isContextLost']);
      var methods=new Map();
      function pair(value,which){var p=gradientPairs.get(value);return p?p[which]:value;}
      ctxProxy=new Proxy(low,{
        get:function(target,key){
          if(key==='canvas')return proxy;
          if(typeof target[key]!=='function')return target[key];
          if(methods.has(key))return methods.get(key);
          var fn;
          if(key==='getImageData')fn=function(x,y,w,h){var result=low.getImageData.apply(low,arguments);rasterSources.set(result.data,{canvas:visual,factor:m.factor,originX:m.originX-x,originY:m.originY-y});return result;};
          else if(readers.has(key))fn=target[key].bind(target);
          else if(key==='drawImage')fn=function(source){if(source.getContext)assertCanvas(source);var args=Array.prototype.slice.call(arguments,1),a=imageRect(source,args,false),b=imageRect(source,args,true);if(a)low.drawImage.apply(low,a);if(b)high.drawImage.apply(high,b);};
          else if(key==='setTransform')fn=function(){var a=Array.prototype.slice.call(arguments);low.setTransform.apply(low,a);var t=low.getTransform();high.setTransform(t.a*m.factor,t.b*m.factor,t.c*m.factor,t.d*m.factor,(t.e-m.originX)*m.factor,(t.f-m.originY)*m.factor);};
          else if(key==='resetTransform')fn=function(){low.resetTransform();high.setTransform(m.factor,0,0,m.factor,-m.originX*m.factor,-m.originY*m.factor);};
          else if(key==='putImageData')fn=function(data,x,y,dx,dy,dw,dh){
            low.putImageData.apply(low,arguments);
            var field=fieldSamplers.get(data);
            if(field){paintField(high,m,data,x,y,field);return;}
            // Pixel arrays are sampled fields in reference coordinates. Their
            // algorithm stays fixed; the presentation resamples this field.
            var dirty=arguments.length>3?[dx,dy,dw,dh]:[0,0,data.width,data.height],scratch=nativeCanvas(data.width,data.height);scratch.getContext('2d').putImageData(data,0,0);
            var px=Math.max(0,Math.floor((x+dirty[0]-m.originX)*m.factor)),py=Math.max(0,Math.floor((y+dirty[1]-m.originY)*m.factor)),pw=Math.min(visual.width-px,Math.ceil(dirty[2]*m.factor)),ph=Math.min(visual.height-py,Math.ceil(dirty[3]*m.factor));
            try{account(scratch);if(pw>0&&ph>0)for(var region of tiles(pw,ph,512)){
              var tile=nativeCanvas(region.width,region.height),tc=tile.getContext('2d'),im;
              try{account(tile);tc.setTransform(m.factor,0,0,m.factor,-m.originX*m.factor-px-region.x,-m.originY*m.factor-py-region.y);tc.imageSmoothingEnabled=true;tc.imageSmoothingQuality='high';tc.drawImage(scratch,dirty[0],dirty[1],dirty[2],dirty[3],x+dirty[0],y+dirty[1],dirty[2],dirty[3]);
                im=tc.getImageData(0,0,region.width,region.height);account(im.data);high.save();high.resetTransform();try{high.putImageData(im,px+region.x,py+region.y);}finally{high.restore();}
              }finally{if(im)release(im.data);release(tile);}
            }}finally{release(scratch);}
          };
          else if(['createLinearGradient','createRadialGradient','createConicGradient'].includes(key))fn=function(){var a=low[key].apply(low,arguments),b=high[key].apply(high,arguments),p=new Proxy(a,{get:function(t,k){if(k==='addColorStop')return function(offset,color){a.addColorStop(offset,color);b.addColorStop(offset,color);};var v=t[k];return typeof v==='function'?v.bind(t):v;}});gradientPairs.set(p,[a,b]);return p;};
          else if(key==='createPattern')fn=function(source,repetition){var a=low.createPattern(analysis(source),repetition),b=high.createPattern(physical(source),repetition),sm=metadata.get(source);if(!a||!b)return a;
            var p=new Proxy(a,{get:function(t,k){if(k==='setTransform')return function(matrix){a.setTransform(matrix);var f=sm?sm.factor:1;b.setTransform(new DOMMatrix([matrix.a/f,matrix.b/f,matrix.c/f,matrix.d/f,matrix.e,matrix.f]));};var v=t[k];return typeof v==='function'?v.bind(t):v;}});if(sm)b.setTransform(new DOMMatrix().scale(1/sm.factor));gradientPairs.set(p,[a,b]);return p;};
          else fn=function(){var args=Array.prototype.slice.call(arguments),a=args.map(v=>pair(v,0)),b=args.map(v=>pair(v,1));low[key].apply(low,a);return high[key].apply(high,b);};
          methods.set(key,fn);return fn;
        },
        set:function(target,key,value){target[key]=pair(value,0);var presented=pair(value,1);if(['shadowBlur','shadowOffsetX','shadowOffsetY'].includes(key))presented=Number(value)*m.factor;if(key==='filter'&&typeof value==='string')presented=value.replace(/([\d.]+)px/g,function(_,v){return Number(v)*m.factor+'px';});high[key]=presented;return true;}
      });return ctxProxy;
    }
    proxy=new Proxy(logical,{get:function(target,key){if(key==='getContext')return function(type,options){if(type!=='2d')throw new Error('Only 2D rendering is supported');return context2d(options);};if(key==='tdContextKey')return context.key;var value=target[key];return typeof value==='function'?value.bind(target):value;},set:function(target,key,value){if(key==='width'||key==='height')resize(key,value);else target[key]=value;return true;}});
    metadata.set(proxy,m);try{resize();}catch(error){release(proxy);throw error;}context.created++;return proxy;
  }
  // A solve uses its fixed reference grid. Only its final shader runs at the
  // destination pixel centers; nonlinear shading is never resized as a bitmap.
  function paintField(ctx,m,data,x,y,sampler){
    var left=Math.max(0,Math.floor((x-m.originX)*m.factor)),top=Math.max(0,Math.floor((y-m.originY)*m.factor));
    var right=Math.min(m.visual.width,Math.ceil((x+data.width-m.originX)*m.factor)),bottom=Math.min(m.visual.height,Math.ceil((y+data.height-m.originY)*m.factor));
    if(right<=left||bottom<=top)return;
    var rgba=new Float64Array(4),rows=Math.max(1,Math.floor(1048576/(right-left)));
    ctx.save();ctx.resetTransform();try{for(var ty=top;ty<bottom;ty+=rows){var h=Math.min(rows,bottom-ty),im=ctx.createImageData(right-left,h);account(im.data);try{
      for(var j=0;j<h;j++)for(var i=0;i<im.width;i++){
        rgba.fill(0);sampler((left+i+.5)/m.factor+m.originX-x,(ty+j+.5)/m.factor+m.originY-y,rgba,1/m.factor);
        var at=(j*im.width+i)*4;for(var c=0;c<4;c++)im.data[at+c]=rgba[c];
      }ctx.putImageData(im,left,ty);}finally{release(im.data);}
    }}finally{ctx.restore();}
  }
  function field(image,sampler){fieldSamplers.set(image,sampler);return image;}
  function copyField(image,source){var sampler=fieldSamplers.get(source);if(sampler)fieldSamplers.set(image,sampler);return image;}
  function sample(values,w,h,x,y,channels,channel){
    channels=channels||1;channel=channel||0;x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));
    var ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(w-1,ix+1),jy=Math.min(h-1,iy+1),fx=x-ix,fy=y-iy;
    return (values[(iy*w+ix)*channels+channel]*(1-fx)+values[(iy*w+jx)*channels+channel]*fx)*(1-fy)+(values[(jy*w+ix)*channels+channel]*(1-fx)+values[(jy*w+jx)*channels+channel]*fx)*fy;
  }
  function alphaSampler(canvas){var m=metadata.get(canvas),c=physical(canvas),w=c.width,h=c.height,factor=m?m.factor:1,ox=m?m.originX:0,oy=m?m.originY:0;
    assertAllocation(w*h);var alpha=new Uint8Array(w*h),rows=Math.max(1,Math.floor(1048576/w));account(alpha);
    try{for(var row=0;row<h;row+=rows){assertAllocation(w*Math.min(rows,h-row)*4);var strip=c.getContext('2d').getImageData(0,row,w,Math.min(rows,h-row));try{account(strip.data);for(var i=0;i<strip.data.length/4;i++)alpha[row*w+i]=strip.data[i*4+3];}finally{release(strip.data);}}}catch(error){release(alpha);throw error;}
    var sampler=function(x,y){x=(x-ox)*factor-.5;y=(y-oy)*factor-.5;if(x<-.5||y<-.5||x>w-.5||y>h-.5)return 0;return sample(alpha,w,h,x,y)/255;};sampler.release=function(){release(alpha);};return sampler;
  }
  function rasterSample(data,w,h,x,y,channel){var record=rasterSources.get(data);if(record){if(!record.data){record.width=record.canvas.width;record.height=record.canvas.height;record.data=record.canvas.getContext('2d').getImageData(0,0,record.width,record.height).data;account(record.data);}x=(x+.5-record.originX)*record.factor-.5;y=(y+.5-record.originY)*record.factor-.5;w=record.width;h=record.height;data=record.data;}if(x<-.5||y<-.5||x>w-.5||y>h-.5)return 0;return sample(data,w,h,x,y,4,channel||0);}
  function signed(field,w,h,x,y){x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));var ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(w-1,ix+1),jy=Math.min(h-1,iy+1),fx=x-ix,fy=y-iy;
    function at(i){return (field.inside[i]?1:-1)*((field.distance[i]||0)+.5);}
    return (at(iy*w+ix)*(1-fx)+at(iy*w+jx)*fx)*(1-fy)+(at(jy*w+ix)*(1-fx)+at(jy*w+jx)*fx)*fy;
  }
  function normal(field,w,h,x,y,values){function value(x,y){return values?sample(values,w,h,x,y):signed(field,w,h,x,y);}var gx=value(x+2,y)-value(x-2,y),gy=value(x,y+2)-value(x,y-2),length=Math.hypot(gx,gy);
    if(length<.0001){var b=field.bounds||[0,0,w-1,h-1];gx=(b[0]+b[2])*.5-x;gy=(b[1]+b[3])*.5-y;length=Math.max(.0001,Math.hypot(gx,gy));}return {x:-gx/length,y:-gy/length};
  }
  function present(canvas,paint){var m=metadata.get(canvas);if(!m)return false;
    var ctx=m.visual.getContext('2d');ctx.save();ctx.setTransform(m.factor,0,0,m.factor,-m.originX*m.factor,-m.originY*m.factor);
    try{withContext(null,function(){paint(ctx,m.factor,m);});}finally{ctx.restore();}return true;
  }
  function applyAlpha(canvas,sampler){var m=metadata.get(canvas);if(!m)return false;var c=m.visual,ctx=c.getContext('2d'),rows=Math.max(1,Math.floor(1048576/c.width));ctx.save();ctx.resetTransform();
    try{for(var y=0;y<c.height;y+=rows){assertAllocation(c.width*Math.min(rows,c.height-y)*4);var im=ctx.getImageData(0,y,c.width,Math.min(rows,c.height-y));try{account(im.data);
      for(var py=0;py<im.height;py++)for(var x=0;x<im.width;x++){var coverage=sampler((x+.5)/m.factor+m.originX,(y+py+.5)/m.factor+m.originY,1/m.factor);im.data[(py*im.width+x)*4+3]*=Math.max(0,Math.min(1,coverage));}
      ctx.putImageData(im,0,y);}finally{release(im.data);}
    }}finally{ctx.restore();}return true;
  }
  function mesh(canvas,vertices,triangles,draw,options){
    var m=metadata.get(canvas);if(!m)return false;options=options||{};
    var f=m.factor,cs=options.coordinateScale||1,ox=options.x||0,oy=options.y||0;
    var v=vertices.map(function(q){var p=q.slice();p[0]=(q[0]/cs+ox-m.originX)*f;p[1]=(q[1]/cs+oy-m.originY)*f;return p;});
    var bounds=triangles.map(function(t){return [Math.min(v[t[0]][0],v[t[1]][0],v[t[2]][0]),Math.min(v[t[0]][1],v[t[1]][1],v[t[2]][1]),Math.max(v[t[0]][0],v[t[1]][0],v[t[2]][0]),Math.max(v[t[0]][1],v[t[1]][1],v[t[2]][1])];});
    var ctx=m.visual.getContext('2d');ctx.save();ctx.resetTransform();ctx.clearRect(0,0,m.visual.width,m.visual.height);
    try{for(var tile of tiles(m.visual.width,m.visual.height,512)){
      assertAllocation(tile.width*tile.height*12);
      var target={w:tile.width,h:tile.height,depth:new Float32Array(tile.width*tile.height).fill(-Infinity),pixels:new Uint8ClampedArray(tile.width*tile.height*4),fragments:0};
      var im;try{account(target.depth);account(target.pixels);
      for(var i=0;i<triangles.length;i++){var b=bounds[i];if(b[2]<tile.x||b[3]<tile.y||b[0]>tile.x+tile.width||b[1]>tile.y+tile.height)continue;
        var t=triangles[i],p=t.map(function(j){var a=v[j].slice();a[0]-=tile.x;a[1]-=tile.y;return a;});draw(target,p[0],p[1],p[2],i);
      }if(options.afterTile)options.afterTile(target,tile,m);im=ctx.createImageData(tile.width,tile.height);account(im.data);im.data.set(target.pixels);ctx.putImageData(im,tile.x,tile.y);
      }finally{release(target.depth);release(target.pixels);if(im)release(im.data);}
    }}finally{ctx.restore();}return true;
  }
  function shadedMesh(canvas,faces,shade,options){options=options||{};var vertices=[],indices=[],rgba=new Float64Array(4);
    faces.forEach(function(face){var at=vertices.length;face.v.forEach(function(q){vertices.push([q.x,q.y,q.z]);});indices.push([at,at+1,at+2]);});
    return mesh(canvas,vertices,indices,function(target,a,b,c,faceIndex){
      var D=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(D)<1e-10)return;
      var left=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),right=Math.min(target.w-1,Math.ceil(Math.max(a[0],b[0],c[0]))),top=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),bottom=Math.min(target.h-1,Math.ceil(Math.max(a[1],b[1],c[1])));
      for(var y=top;y<=bottom;y++)for(var x=left;x<=right;x++){var dx=x+.5-a[0],dy=y+.5-a[1],wb=(dx*(c[1]-a[1])-dy*(c[0]-a[0]))/D,wc=((b[0]-a[0])*dy-(b[1]-a[1])*dx)/D,wa=1-wb-wc;if(wa< -1e-8||wb< -1e-8||wc< -1e-8)continue;
        var z=a[2]*wa+b[2]*wb+c[2]*wc,i=y*target.w+x;if(z<target.depth[i]-1e-6)continue;rgba.fill(0);shade(faces[faceIndex],wa,wb,wc,rgba);if(rgba[3]<=.003*255)continue;target.depth[i]=z;
        var alpha=rgba[3]/255,old=options.blend?target.pixels[i*4+3]/255:0,combined=alpha+old*(1-alpha);for(var k=0;k<3;k++)target.pixels[i*4+k]=(rgba[k]*alpha+target.pixels[i*4+k]*old*(1-alpha))/combined;target.pixels[i*4+3]=combined*255;target.fragments++;
      }
    },options);
  }
  function tiles(width,height,size){size=size||2048;var out=[];for(var y=0;y<height;y+=size)for(var x=0;x<width;x+=size)out.push({x:x,y:y,width:Math.min(size,width-x),height:Math.min(size,height-y)});return out;}
  root.TypeDeformerRenderContext={assertCanvas:assertCanvas,budgets:budgets,limits:limits,make:make,withContext:withContext,withScope:withScope,retain:retain,current:function(){return current;},createCanvas:createCanvas,physical:physical,analysis:analysis,byteSize:byteSize,drawImage:drawImage,account:account,release:release,tiles:tiles,field:field,copyField:copyField,sample:sample,alphaSampler:alphaSampler,rasterSample:rasterSample,signed:signed,normal:normal,present:present,applyAlpha:applyAlpha,mesh:mesh,shadedMesh:shadedMesh,key:function(){return current?current.key:'analysis';}};
  root.TypeDeformerRenderContext.hasVisiblePixels=hasVisiblePixels;
  root.TypeDeformerRenderContext.resources=resources;
  root.TypeDeformerRenderContext.createResourcePool=createResourcePool;
  root.TypeDeformerRenderContext.memoryStats=function(){return {workBytes:current?current.bytes:0,peakWorkBytes:current?current.peakBytes:0,retainedBytes:retainedBytes,peakRetainedBytes:peakRetainedBytes,reservations:resources.inspect()};};
})(typeof globalThis!=='undefined'?globalThis:this);
