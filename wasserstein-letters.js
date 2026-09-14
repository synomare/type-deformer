(function(root){
 'use strict';
 // Entropic discrete optimal transport (Cuturi 2013). Full coupling is pushed
 // along straight segments; this is not the convolutional barycenter solver.
 var schema={label:'Wasserstein Letters',short:'wsl',color:'#374e64',description:'二つの字形の黒い部分を同じ総質量にそろえ、輸送量から中間の文字をつくります。',defaults:{wassersteinProgress:.5,wassersteinEntropy:.006,wassersteinMetric:1,wassersteinSharpness:.75,wassersteinView:'ink'},limits:{wassersteinProgress:[0,1],wassersteinEntropy:[.003,.04],wassersteinMetric:[.4,2.5],wassersteinSharpness:[0,1]},options:{wassersteinView:['ink','density','tracks']},integers:[],labels:{wassersteinProgress:'Transfer / 移動の途中',wassersteinEntropy:'Entropy / 輸送の広がり',wassersteinMetric:'Cost / 横移動の重さ',wassersteinSharpness:'Edge / 輪郭の強さ',wassersteinView:'View / 描き方'}};
 function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
 var segmenter=typeof Intl!=='undefined'&&Intl.Segmenter?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
 function characters(text){return segmenter?Array.from(segmenter.segment(text),function(s){return s.segment;}):Array.from(text);}
 function validText(text){return typeof text==='string'&&text.length<=512&&!!text.trim()&&!/[\x00-\x1f\x7f]/.test(text)&&characters(text).length<=32;}
 function samplingResolution(s){var b=bounds(s);return b?Math.min(144,Math.ceil(38*Math.sqrt(Math.max(b.w,b.h)/Math.max(1,Math.min(b.w,b.h))))):38;}
 function bounds(s){var x0=s.w,y0=s.h,x1=-1,y1=-1;for(var y=0;y<s.h;y++)for(var x=0;x<s.w;x++)if(s.alpha[y*s.w+x]>0){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return x1<0?null:{x0:x0,y0:y0,w:x1-x0+1,h:y1-y0+1,cx:(x0+x1+1)/2,cy:(y0+y1+1)/2};}
 function distribution(s,n){var b=bounds(s);if(!b)return null;var D=Math.max(b.w,b.h),mass=new Float64Array(n*n),xs=new Float64Array(n*n),ys=new Float64Array(n*n),total=0;
  for(var y=b.y0;y<b.y0+b.h;y++)for(var x=b.x0;x<b.x0+b.w;x++){var a=s.alpha[y*s.w+x];if(!a)continue;var u=(x+.5-b.cx)/D+.5,v=(y+.5-b.cy)/D+.5,i=clamp(Math.floor(u*n),0,n-1),j=clamp(Math.floor(v*n),0,n-1),k=j*n+i;mass[k]+=a;xs[k]+=a*u;ys[k]+=a*v;total+=a;}
  var points=[];for(var k=0;k<mass.length;k++)if(mass[k]>0)points.push({x:xs[k]/mass[k],y:ys[k]/mass[k],m:mass[k]/total});return {points:points,total:total,area:total/(D*D),bounds:b,D:D,n:n};
 }
 function sinkhorn(a,b,epsilon,metric,maxIter,tolerance){var A=a.points||a,B=b.points||b,n=A.length,m=B.length,K=new Float64Array(n*m),u=new Float64Array(n).fill(1),v=new Float64Array(m).fill(1),error=Infinity,iterations=0;maxIter=maxIter||1800;tolerance=tolerance||1e-7;
  for(var i=0;i<n;i++)for(var j=0;j<m;j++){var dx=A[i].x-B[j].x,dy=A[i].y-B[j].y;K[i*m+j]=Math.exp(-(metric*dx*dx+dy*dy/metric)/epsilon);}
  for(var it=0;it<maxIter;it++){for(var i=0;i<n;i++){var sum=0;for(var j=0;j<m;j++)sum+=K[i*m+j]*v[j];u[i]=A[i].m/Math.max(1e-300,sum);}var sums=new Float64Array(m);for(var i=0;i<n;i++)for(var j=0;j<m;j++)sums[j]+=K[i*m+j]*u[i];for(var j=0;j<m;j++)v[j]=B[j].m/Math.max(1e-300,sums[j]);iterations=it+1;
   if(it%10===9){error=0;for(var i=0;i<n;i++){var sum=0;for(var j=0;j<m;j++)sum+=K[i*m+j]*v[j];error+=Math.abs(u[i]*sum-A[i].m);}if(error<tolerance)break;}
  }
  var plan=new Float64Array(n*m),row=new Float64Array(n),col=new Float64Array(m),total=0,cost=0;for(var i=0;i<n;i++)for(var j=0;j<m;j++){var k=i*m+j,p=u[i]*K[k]*v[j];if(!Number.isFinite(p))throw Error('Transport did not remain finite');plan[k]=p;row[i]+=p;col[j]+=p;total+=p;var dx=A[i].x-B[j].x,dy=A[i].y-B[j].y;cost+=p*(metric*dx*dx+dy*dy/metric);}
  var rowError=row.reduce(function(s,x,i){return s+Math.abs(x-A[i].m);},0),columnError=col.reduce(function(s,x,j){return s+Math.abs(x-B[j].m);},0);return {a:A,b:B,plan:plan,total:total,cost:cost,rowError:rowError,columnError:columnError,iterations:iterations,epsilon:epsilon,metric:metric};
 }
 function splat(r,n,x,y,m){var u=clamp(x*n-.5,0,n-1.000001),v=clamp(y*n-.5,0,n-1.000001),i=Math.floor(u),j=Math.floor(v),fx=u-i,fy=v-j;r[j*n+i]+=m*(1-fx)*(1-fy);r[j*n+i+1]+=m*fx*(1-fy);r[(j+1)*n+i]+=m*(1-fx)*fy;r[(j+1)*n+i+1]+=m*fx*fy;}
 function interpolate(q,t,n){var r=new Float64Array(n*n),m=q.b.length;for(var i=0;i<q.a.length;i++)for(var j=0;j<m;j++){var p=q.plan[i*m+j];if(!p)continue;splat(r,n,(1-t)*q.a[i].x+t*q.b[j].x,(1-t)*q.a[i].y+t*q.b[j].y,p);}return r;}
 function blur(src,n,passes){for(var it=0;it<passes;it++){var tmp=new Float64Array(src.length),out=new Float64Array(src.length);for(var y=0;y<n;y++)for(var x=0;x<n;x++)tmp[y*n+x]=.5*src[y*n+x]+.25*(src[y*n+Math.max(0,x-1)]+src[y*n+Math.min(n-1,x+1)]);for(var y=0;y<n;y++)for(var x=0;x<n;x++)out[y*n+x]=.5*tmp[y*n+x]+.25*(tmp[Math.max(0,y-1)*n+x]+tmp[Math.min(n-1,y+1)*n+x]);src=out;}return src;}

 // Three reflected fractional box filters approximate a Gaussian in linear
 // time. Fractional outer taps keep the width continuous as Transfer changes.
 // Symmetric extension retains numerical mass, including border cells.
 function smooth(src,n,sigma){
  var variance=sigma*sigma/3,radius=Math.floor((Math.sqrt(12*variance+1)-1)/2),base=radius*2+1,fraction=(variance*base-radius*(radius+1)*base/3)/(2*((radius+1)*(radius+1)-variance)),w=base+2*fraction;
  function mirror(i){return i<0?-i-1:i>=n?2*n-i-1:i;}
  for(var pass=0;pass<3;pass++){
   var tmp=new Float64Array(src.length),out=new Float64Array(src.length);
   for(var y=0;y<n;y++){var sum=0;for(var k=-radius;k<=radius;k++)sum+=src[y*n+mirror(k)];for(var x=0;x<n;x++){tmp[y*n+x]=(sum+fraction*(src[y*n+mirror(x-radius-1)]+src[y*n+mirror(x+radius+1)]))/w;sum+=src[y*n+mirror(x+radius+1)]-src[y*n+mirror(x-radius)];}}
   for(var x=0;x<n;x++){var sum=0;for(var k=-radius;k<=radius;k++)sum+=tmp[mirror(k)*n+x];for(var y=0;y<n;y++){out[y*n+x]=(sum+fraction*(tmp[mirror(y-radius-1)*n+x]+tmp[mirror(y+radius+1)*n+x]))/w;sum+=tmp[mirror(y+radius+1)*n+x]-tmp[mirror(y-radius)*n+x];}}src=out;
  }return src;
 }
 function field(q,t,n){var raw=interpolate(q.transport,t,n),width=q.a.n===38&&q.b.n===38?n/38:n*((1-t)/q.a.n+t/q.b.n),sigma=width*(.56-.28*Math.sin(Math.PI*t)),density=smooth(raw,n,sigma);return {density:density,mass:raw.reduce(function(a,b){return a+b;},0)};}

 // Marching squares emits subpixel isocontours; ambiguous saddles use the
 // bilinear saddle to keep the local topology consistent.
 function contours(f,n,level){var segments=[];function edge(x,y,a,b,c,d){var v=[a,b,c,d],p=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]],es=[];for(var k=0;k<4;k++){var j=(k+1)%4;if((v[k]>=level)!==(v[j]>=level)){var t=(level-v[k])/(v[j]-v[k]);es.push({e:k,p:[(p[k][0]+t*(p[j][0]-p[k][0])+.5)/n,(p[k][1]+t*(p[j][1]-p[k][1])+.5)/n]});}}if(es.length===2)segments.push([es[0].p,es[1].p]);else if(es.length===4){var join=(a-level)*(c-level)>=(b-level)*(d-level);if(join){segments.push([es[0].p,es[1].p],[es[2].p,es[3].p]);}else segments.push([es[0].p,es[3].p],[es[1].p,es[2].p]);}}
  function at(x,y){return x<0||y<0||x>=n||y>=n?0:f[y*n+x];}for(var y=-1;y<n;y++)for(var x=-1;x<n;x++)edge(x,y,at(x,y),at(x+1,y),at(x+1,y+1),at(x,y+1));return segments;
 }

 function loops(segments){var nodes=new Map(),used=new Set(),result=[];function key(p){return Math.round(p[0]*1e8)+','+Math.round(p[1]*1e8);}for(var i=0;i<segments.length;i++)for(var p of segments[i]){var k=key(p);if(!nodes.has(k))nodes.set(k,[]);nodes.get(k).push(i);}for(var i=0;i<segments.length;i++){if(used.has(i))continue;var path=[segments[i][0]],current=segments[i][1],first=key(path[0]);used.add(i);for(var steps=0;steps<=segments.length;steps++){path.push(current);var k=key(current);if(k===first)break;var next=(nodes.get(k)||[]).find(function(j){return !used.has(j);});if(next===undefined)break;used.add(next);current=key(segments[next][0])===k?segments[next][1]:segments[next][0];}if(path.length>3&&key(path[path.length-1])===first){path.pop();result.push(path);}}return result;}
 function trace(ctx,paths,cx,cy,D){ctx.beginPath();for(var path of paths){var last=path[path.length-1],first=path[0];ctx.moveTo(cx+((last[0]+first[0])/2-.5)*D,cy+((last[1]+first[1])/2-.5)*D);for(var i=0;i<path.length;i++){var p=path[i],next=path[(i+1)%path.length];ctx.quadraticCurveTo(cx+(p[0]-.5)*D,cy+(p[1]-.5)*D,cx+((p[0]+next[0])/2-.5)*D,cy+((p[1]+next[1])/2-.5)*D);}ctx.closePath();}}
 function drawTracks(ctx,q,t,cx,cy,D,color){
  var n=224,steps=t===0?0:10;ctx.strokeStyle='rgb('+color.join(',')+')';ctx.lineJoin='round';ctx.lineCap='round';
  for(var step=0;step<=steps;step++){var fraction=steps?step/steps:1,time=t*fraction,f=field(q,time,n).density,area=(1-time)*q.a.area+time*q.b.area;var paths=loops(contours(f,n,.5/(n*n*area)));ctx.globalAlpha=step===steps?1:.32+.5*fraction;ctx.lineWidth=Math.max(.45,D*(step===steps?.0035:.0022));trace(ctx,paths,cx,cy,D);ctx.stroke();}ctx.globalAlpha=1;
 }
 function makeTarget(text,font,angle,verticalAngles){
  var c=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas')),ctx=c.getContext('2d',{willReadFrequently:true}),chars=characters(text);ctx.font=font||'700 320px Georgia';ctx.textAlign='center';ctx.textBaseline='alphabetic';
  // Keep the established single-character raster exactly as before.
  if(chars.length===1){c.width=c.height=480;ctx.font=font||'700 320px Georgia';ctx.textAlign='center';ctx.textBaseline='alphabetic';var mt=ctx.measureText(text),H=mt.actualBoundingBoxAscent+mt.actualBoundingBoxDescent,W=mt.actualBoundingBoxLeft+mt.actualBoundingBoxRight,sc=Math.min(1,420/Math.max(H,W,1));ctx.translate(240,240);ctx.rotate(angle||0);ctx.scale(sc,sc);ctx.fillText(text,(mt.actualBoundingBoxLeft-mt.actualBoundingBoxRight)/2,(mt.actualBoundingBoxAscent-mt.actualBoundingBoxDescent)/2);}
  else{
   var mt=ctx.measureText(text),H=mt.actualBoundingBoxAscent+mt.actualBoundingBoxDescent,W=mt.actualBoundingBoxLeft+mt.actualBoundingBoxRight,metrics=verticalAngles?chars.map(function(ch){return ctx.measureText(ch);}):null;
   if(metrics){W=Math.max.apply(null,metrics.map(function(m){return Math.max(m.actualBoundingBoxLeft+m.actualBoundingBoxRight,m.actualBoundingBoxAscent+m.actualBoundingBoxDescent);}));H=320*chars.length;}
   var scale=Math.min(1,1472/Math.max(W,H,1));c.width=Math.max(64,Math.ceil(W*scale)+64);c.height=Math.max(64,Math.ceil(H*scale)+64);ctx.font=font||'700 320px Georgia';ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.translate(c.width/2,c.height/2);ctx.scale(scale,scale);
   if(metrics){chars.forEach(function(ch,i){var m=metrics[i];ctx.save();ctx.translate(0,(i-(chars.length-1)/2)*320);ctx.rotate(verticalAngles[i]||0);ctx.fillText(ch,(m.actualBoundingBoxLeft-m.actualBoundingBoxRight)/2,(m.actualBoundingBoxAscent-m.actualBoundingBoxDescent)/2);ctx.restore();});}
   else ctx.fillText(text,(mt.actualBoundingBoxLeft-mt.actualBoundingBoxRight)/2,(mt.actualBoundingBoxAscent-mt.actualBoundingBoxDescent)/2);
  }
  var data=ctx.getImageData(0,0,c.width,c.height).data;return {w:c.width,h:c.height,canvas:c,alpha:Float32Array.from({length:c.width*c.height},function(_,i){return data[i*4+3]/255;})};
 }
 var cache=new Map(),cacheBytes=0,CACHE_BUDGET=64*1024*1024,fontRevision=0,cacheHits=0,cacheMisses=0;
 function clearCache(){cache.clear();cacheBytes=0;}
 if(root.document&&root.document.fonts&&root.document.fonts.addEventListener)root.document.fonts.addEventListener('loadingdone',function(){fontRevision++;clearCache();});
 function prepare(s,p){var key=[s.key??s.alpha.reduce(function(h,v){return Math.imul(h^Math.round(v*255),16777619)>>>0;},2166136261),s.w,s.h,s.partner,s.targetFont,s.targetAngle,s.targetAngles,s.multiple,fontRevision,p.wassersteinEntropy,p.wassersteinMetric].join('|'),q=cache.get(key);if(q){cache.delete(key);cache.set(key,q);cacheHits++;return q;}
  var a=distribution(s,s.multiple?samplingResolution(s):38);if(!a)return null;var target=makeTarget(s.partner||'X',s.targetFont,s.targetAngle,s.targetAngles),b=distribution(target,characters(s.partner||'X').length>1?samplingResolution(target):38);if(!b)return null;q={a:a,b:b,target:target,transport:sinkhorn(a,b,p.wassersteinEntropy,p.wassersteinMetric)};cacheMisses++;
  // The plan dominates storage. Include raster and a conservative per-point
  // allowance so ordinary words reuse their solve without an entry-count cliff.
  q.bytes=q.transport.plan.byteLength+target.alpha.byteLength+target.w*target.h*4+(a.points.length+b.points.length)*96;
  while(cacheBytes+q.bytes>CACHE_BUDGET&&cache.size){var first=cache.keys().next().value;cacheBytes-=cache.get(first).bytes;cache.delete(first);}if(q.bytes<=CACHE_BUDGET){cache.set(key,q);cacheBytes+=q.bytes;}return q;
 }

 function endpoint(s,q,t,color){
  var out=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));out.width=s.w;out.height=s.h;var ctx=out.getContext('2d'),a=q.a,b=q.b,D=a.D,original=t===0?s:q.target,bb=t===0?a.bounds:b.bounds,scale=D/(t===0?a.D:b.D);
  ctx.drawImage(original.canvas,bb.x0,bb.y0,bb.w,bb.h,a.bounds.cx-bb.w*scale/2,a.bounds.cy-bb.h*scale/2,bb.w*scale,bb.h*scale);ctx.globalCompositeOperation='source-in';ctx.fillStyle='rgb('+color.join(',')+')';ctx.fillRect(0,0,s.w,s.h);return out;
 }
 function render(s,p,color,accent){
  var out=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));out.width=s.w;out.height=s.h;var ctx=out.getContext('2d'),q=prepare(s,p);if(!q)return out;
  var t=p.wassersteinProgress,a=q.a,b=q.b,D=a.D,cx=a.bounds.cx,cy=a.bounds.cy,mass=q.transport.total;
  if(p.wassersteinView==='tracks')drawTracks(ctx,q,t,cx,cy,D,color);
  else if(t===0||t===1)ctx.drawImage(endpoint(s,q,t,color),0,0);
  else{
   var N=512,fields=field(q,t,N),density=fields.density,area=(1-t)*a.area+t*b.area;mass=fields.mass;
   if(p.wassersteinView==='ink'){
    trace(ctx,loops(contours(density,N,.5/(N*N*area))),cx,cy,D);ctx.fillStyle='rgb('+color.join(',')+')';ctx.filter='blur('+(Math.pow(1-p.wassersteinSharpness,2)*D/70)+'px)';ctx.fill('evenodd');ctx.filter='none';
   }else{
    var tile=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));tile.width=tile.height=N;var tc=tile.getContext('2d'),im=tc.createImageData(N,N);
    for(var k=0;k<density.length;k++){im.data[k*4]=color[0];im.data[k*4+1]=color[1];im.data[k*4+2]=color[2];im.data[k*4+3]=Math.round(clamp(density[k]*N*N*area,0,1)*255);}if(root.TypeDeformerRenderContext)root.TypeDeformerRenderContext.field(im,function(x,y,rgba){var value=root.TypeDeformerRenderContext.sample(density,N,N,x-.5,y-.5);rgba[0]=color[0];rgba[1]=color[1];rgba[2]=color[2];rgba[3]=clamp(value*N*N*area,0,1)*255;});tc.putImageData(im,0,0);ctx.drawImage(tile,cx-D/2,cy-D/2,D,D);
   }
   // Display-only endpoint reconstruction: fade the finite-grid error over the
   // first/last 4%. The interior remains the full-coupling pushforward. This
   // does not modify the numerical transport or claim exact black-area mass.
   var distance=Math.min(t,1-t);if(distance<.04){var v=distance/.04,w=v*v*(3-2*v);ctx.globalCompositeOperation='destination-in';ctx.globalAlpha=w;ctx.fillRect(0,0,s.w,s.h);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=1-w;ctx.drawImage(endpoint(s,q,t<.5?0:1,color),0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}
  }
  out._wassersteinDiagnostics={mass:mass,rowError:q.transport.rowError,columnError:q.transport.columnError,cost:q.transport.cost,iterations:q.transport.iterations,sourcePoints:a.points.length,targetPoints:b.points.length};return out;
 }
 root.TypeDeformerWassersteinLetters={revision:'text-3',characters:characters,validText:validText,schemas:{wassersteinLetters:schema},ids:['wassersteinLetters'],renderers:{wassersteinLetters:render},effectPad:function(id,g){return g?Math.ceil(Math.max(g.w,g.h)*.6+12):100;},clearCache:clearCache,fontRevision:function(){return fontRevision;},cacheStats:function(){return {entries:cache.size,bytes:cacheBytes,maxBytes:CACHE_BUDGET,hits:cacheHits,misses:cacheMisses};},internals:{samplingResolution:samplingResolution,loops:loops,trace:trace,smooth:smooth,field:field,contours:contours,bounds:bounds,distribution:distribution,sinkhorn:sinkhorn,splat:splat,interpolate:interpolate,blur:blur,makeTarget:makeTarget,prepare:prepare}};
})(typeof globalThis!=='undefined'?globalThis:this);
