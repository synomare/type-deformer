(function(root){
  'use strict';
  var current=null,metadata=new WeakMap(),gradientPairs=new WeakMap(),fieldSamplers=new WeakMap(),rasterSources=new WeakMap(),owners=new WeakMap(),scope=null;
  var nativeCreate=typeof document!=='undefined'?document.createElement.bind(document):null;
  var MiB=1024*1024;
  var budgets=Object.freeze({workBytes:768*MiB,layerBytes:512*MiB,composeBytes:512*MiB,textureBytes:256*MiB,videoBytes:512*MiB,maxCanvasPixels:64*MiB});
  function nativeCanvas(w,h){var c=nativeCreate?nativeCreate('canvas'):new OffscreenCanvas(w||1,h||1);c.width=w||1;c.height=h||1;return c;}
  function make(options){options=options||{};var purpose=['edit','proof','export'].includes(options.purpose)?options.purpose:'edit';
    var c={purpose:purpose,presentation:options.presentation==='low'&&purpose==='edit'?'low':'standard',
      width:Math.max(1,Number(options.width)||1),height:Math.max(1,Number(options.height)||1),
      viewScale:Math.max(.000001,Number(options.viewScale)||1),factor:Math.max(.000001,Number(options.factor)||1),
      precision:purpose==='edit'?'display':'output',memoryBudget:options.memoryBudget||budgets.workBytes,
      maxCanvasPixels:options.maxCanvasPixels||budgets.maxCanvasPixels,tile:options.tile||null,
      referenceWidth:options.referenceWidth||0,referenceHeight:options.referenceHeight||0,overscan:options.overscan||0,
      accounted:new WeakMap(),bytes:0,peakBytes:0,created:0};
    c.key=[purpose,c.presentation,c.factor,c.tile&&[c.tile.x,c.tile.y,c.tile.width,c.tile.height].join(',')].join('/');return c;
  }
  function withContext(context,fn){var before=current;current=context;try{return fn();}finally{current=before;}}
  // Renderers are synchronous. Reclaim a glyph/tile's temporaries even when
  // drawing fails; explicitly retained cache images have a separate byte cap.
  function withScope(fn){var before=scope,local=new Set();scope=local;try{return fn();}finally{scope=before;local.forEach(release);}}
  function retain(value){if(scope)scope.delete(value);unaccount(value);return value;}
  function unaccount(value){var owner=owners.get(value);if(owner){owner.bytes-=owner.accounted.get(value)||0;owner.accounted.delete(value);owners.delete(value);}}
  function assertAllocation(bytes,old){if(!current)return;var next=current.bytes+bytes-(old||0);
    if(next>current.memoryBudget)throw new Error('描画に必要な作業メモリが '+Math.ceil(next/MiB)+' MB になり、予算 '+Math.round(current.memoryBudget/MiB)+' MB を超えました。設定値は保持されています。');
  }
  function account(canvas,plannedBytes){if(!current)return;var bytes=plannedBytes==null?byteSize(canvas):plannedBytes,old=current.accounted.get(canvas)||0,next=current.bytes+bytes-old;
    assertAllocation(bytes,old);
    if(owners.get(canvas)!==current)unaccount(canvas);
    current.accounted.set(canvas,bytes);current.bytes=next;current.peakBytes=Math.max(current.peakBytes,next);
    owners.set(canvas,current);if(scope&&!old)scope.add(canvas);
  }
  function physical(canvas){return metadata.get(canvas)?.visual||canvas;}
  function analysis(canvas){return metadata.get(canvas)?.logical||canvas;}
  function byteSize(canvas){if(ArrayBuffer.isView(canvas)||canvas instanceof ArrayBuffer)return canvas.byteLength;var m=metadata.get(canvas);return m?(m.logical.width*m.logical.height+m.visual.width*m.visual.height)*4:(canvas.width||0)*(canvas.height||0)*4;}
  function release(canvas){var m=metadata.get(canvas);unaccount(canvas);if(scope)scope.delete(canvas);
    if(ArrayBuffer.isView(canvas)||canvas instanceof ArrayBuffer)return;
    if(m){m.logical.width=m.logical.height=m.visual.width=m.visual.height=1;}else if(canvas)canvas.width=canvas.height=1;
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
  function drawImage(ctx,source){var args=Array.prototype.slice.call(arguments,2),resolved=imageRect(source,args,true);if(resolved)ctx.drawImage.apply(ctx,resolved);}
  function createCanvas(w,h,options){
    var requestedFactor=options&&Number.isFinite(options.factor)&&options.factor>0?options.factor:current&&current.factor;
    assertAllocation(Math.max(1,w||1)*Math.max(1,h||1)*4);
    if(!current || (Math.abs(requestedFactor-1)<1e-8&&!current.tile)){var normal=nativeCanvas(w,h);try{account(normal);}catch(error){release(normal);throw error;}return normal;}
    var context=current,logical=nativeCanvas(w,h),visual=nativeCanvas(1,1),m={logical:logical,visual:visual,factor:requestedFactor,originX:0,originY:0,context:context},proxy,ctxProxy;
    function resize(){
      var tile=context.tile,clipped=options&&options.tiled&&tile&&logical.width===context.referenceWidth&&logical.height===context.referenceHeight;
      var pad=clipped?context.overscan:0;
      m.originX=clipped?(tile.x-pad)/m.factor:0;m.originY=clipped?(tile.y-pad)/m.factor:0;
      var width=clipped?tile.width+pad*2:Math.max(1,Math.ceil(logical.width*m.factor)),height=clipped?tile.height+pad*2:Math.max(1,Math.ceil(logical.height*m.factor));
      if(width*height>context.maxCanvasPixels)throw new Error('効果の描画面 '+width+' × '+height+' px が1枚の作業上限を超えました。分割できる出力領域を選ぶか、文字サイズを調整してください。設定値は保持されています。');
      if(proxy)account(proxy,(logical.width*logical.height+width*height)*4);
      visual.width=width;visual.height=height;
      visual.getContext('2d').setTransform(m.factor,0,0,m.factor,-m.originX*m.factor,-m.originY*m.factor);
    }
    function context2d(options){
      if(ctxProxy)return ctxProxy;
      var low=logical.getContext('2d',options),high=visual.getContext('2d',options);
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
          else if(key==='drawImage')fn=function(source){var args=Array.prototype.slice.call(arguments,1),a=imageRect(source,args,false),b=imageRect(source,args,true);if(a)low.drawImage.apply(low,a);if(b)high.drawImage.apply(high,b);};
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
    proxy=new Proxy(logical,{get:function(target,key){if(key==='getContext')return function(type,options){if(type!=='2d')throw new Error('Only 2D rendering is supported');return context2d(options);};if(key==='tdContextKey')return context.key;var value=target[key];return typeof value==='function'?value.bind(target):value;},set:function(target,key,value){target[key]=value;if(key==='width'||key==='height')resize();return true;}});
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
    var alpha=new Uint8Array(w*h),rows=Math.max(1,Math.floor(1048576/w));account(alpha);
    for(var row=0;row<h;row+=rows){var strip=c.getContext('2d').getImageData(0,row,w,Math.min(rows,h-row));account(strip.data);for(var i=0;i<strip.data.length/4;i++)alpha[row*w+i]=strip.data[i*4+3];release(strip.data);}
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
    try{for(var y=0;y<c.height;y+=rows){var im=ctx.getImageData(0,y,c.width,Math.min(rows,c.height-y));account(im.data);
      for(var py=0;py<im.height;py++)for(var x=0;x<im.width;x++){var coverage=sampler((x+.5)/m.factor+m.originX,(y+py+.5)/m.factor+m.originY,1/m.factor);im.data[(py*im.width+x)*4+3]*=Math.max(0,Math.min(1,coverage));}
      ctx.putImageData(im,0,y);release(im.data);
    }}finally{ctx.restore();}return true;
  }
  function mesh(canvas,vertices,triangles,draw,options){
    var m=metadata.get(canvas);if(!m)return false;options=options||{};
    var f=m.factor,cs=options.coordinateScale||1,ox=options.x||0,oy=options.y||0;
    var v=vertices.map(function(q){var p=q.slice();p[0]=(q[0]/cs+ox-m.originX)*f;p[1]=(q[1]/cs+oy-m.originY)*f;return p;});
    var bounds=triangles.map(function(t){return [Math.min(v[t[0]][0],v[t[1]][0],v[t[2]][0]),Math.min(v[t[0]][1],v[t[1]][1],v[t[2]][1]),Math.max(v[t[0]][0],v[t[1]][0],v[t[2]][0]),Math.max(v[t[0]][1],v[t[1]][1],v[t[2]][1])];});
    var ctx=m.visual.getContext('2d');ctx.save();ctx.resetTransform();ctx.clearRect(0,0,m.visual.width,m.visual.height);
    try{for(var tile of tiles(m.visual.width,m.visual.height,512)){
      var target={w:tile.width,h:tile.height,depth:new Float32Array(tile.width*tile.height).fill(-Infinity),pixels:new Uint8ClampedArray(tile.width*tile.height*4),fragments:0};
      for(var i=0;i<triangles.length;i++){var b=bounds[i];if(b[2]<tile.x||b[3]<tile.y||b[0]>tile.x+tile.width||b[1]>tile.y+tile.height)continue;
        var t=triangles[i],p=t.map(function(j){var a=v[j].slice();a[0]-=tile.x;a[1]-=tile.y;return a;});draw(target,p[0],p[1],p[2],i);
      }if(options.afterTile)options.afterTile(target,tile,m);var im=ctx.createImageData(tile.width,tile.height);im.data.set(target.pixels);ctx.putImageData(im,tile.x,tile.y);
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
  root.TypeDeformerRenderContext={budgets:budgets,make:make,withContext:withContext,withScope:withScope,retain:retain,current:function(){return current;},createCanvas:createCanvas,physical:physical,analysis:analysis,byteSize:byteSize,drawImage:drawImage,account:account,release:release,tiles:tiles,field:field,copyField:copyField,sample:sample,alphaSampler:alphaSampler,rasterSample:rasterSample,signed:signed,normal:normal,present:present,applyAlpha:applyAlpha,mesh:mesh,shadedMesh:shadedMesh,key:function(){return current?current.key:'analysis';}};
})(typeof globalThis!=='undefined'?globalThis:this);
