(function(root){
  'use strict';
  var schemas={
    linkedTwist:{label:'Linked Twist',short:'lkt',color:'#243329',description:'二つの回転域を交互に通し、字画と穴の面積を保つ座標写像で文字を絡ませます。',options:{},integers:[],
      defaults:{twistCycles:1,twistTurns:.6,twistSeparation:.3,twistRadius:1.1,twistBalance:-1,twistAxis:12},
      limits:{twistCycles:[0,3],twistTurns:[0,1.6],twistSeparation:[.12,.95],twistRadius:[.6,1.8],twistBalance:[-1,1],twistAxis:[-180,180]},
      labels:{twistCycles:'Passage / 交互の通過',twistTurns:'Twist / 巻込み',twistSeparation:'Separation / 渦の間隔',twistRadius:'Reach / 回転域',twistBalance:'Balance / 二つ目の回転',twistAxis:'Axis / 渦の軸'}},
    enneperBody:{label:'Enneper Body',short:'enb',color:'#38262d',description:'文字を極小曲面へ写し、折り重なる面と穴を奥行き付きで描きます。',options:{},integers:['enneperOrder'],
      defaults:{enneperOrder:1,enneperSpan:2.05,enneperAssociate:24,enneperYaw:32,enneperTilt:-24,enneperRelief:.85},
      limits:{enneperOrder:[1,3],enneperSpan:[.15,2.6],enneperAssociate:[0,180],enneperYaw:[-180,180],enneperTilt:[-80,80],enneperRelief:[0,1]},
      labels:{enneperOrder:'Order / 曲面の次数',enneperSpan:'Immersion / 曲面の広がり',enneperAssociate:'Associate / 共役面の位相',enneperYaw:'Yaw / 横からの視点',enneperTilt:'Tilt / 上下の視点',enneperRelief:'Shading / 面の濃淡'}}
  };
  var TAU=2*Math.PI,MAX_POINTS=300000;
  function canvas(s){var c=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));c.width=s.w;c.height=s.h;return c;}
  function bounds(s){var x0=s.w,y0=s.h,x1=-1,y1=-1;for(var y=0;y<s.h;y++)for(var x=0;x<s.w;x++)if(s.alpha[y*s.w+x]>.02){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return {cx:(x0+x1)/2,cy:(y0+y1)/2,w:Math.max(1,x1-x0),h:Math.max(1,y1-y0),x0:x0,y0:y0,x1:x1,y1:y1,empty:x1<0};}
  function tint(s,color){var c=canvas(s),ctx=c.getContext('2d');ctx.fillStyle='rgb('+color.join(',')+')';ctx.fillRect(0,0,s.w,s.h);ctx.globalCompositeOperation='destination-in';ctx.drawImage(s.canvas,0,0);return c;}
  // Compact C2 radial twist. Polar radius and the planar area form r dr dtheta
  // are invariant; reversing the angle gives its exact inverse.
  function radialTwist(q,c,radius,angle){var x=q.x-c.x,y=q.y-c.y,t=(x*x+y*y)/(radius*radius);if(t>=1||angle===0)return {x:q.x,y:q.y};var a=angle*Math.pow(1-t,3),cs=Math.cos(a),sn=Math.sin(a);return {x:c.x+x*cs-y*sn,y:c.y+x*sn+y*cs};}
  function twistMap(q,p,inverse){var a=p.twistAxis*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a),c1={x:-p.twistSeparation*cs,y:-p.twistSeparation*sn},c2={x:-c1.x,y:-c1.y},whole=Math.floor(p.twistCycles),rest=p.twistCycles-whole,angle=p.twistTurns*TAU;
    function pair(v,t,back){if(back){v=radialTwist(v,c2,p.twistRadius,-angle*p.twistBalance*t);return radialTwist(v,c1,p.twistRadius,-angle*t);}v=radialTwist(v,c1,p.twistRadius,angle*t);return radialTwist(v,c2,p.twistRadius,angle*p.twistBalance*t);}
    var v=q;if(inverse){if(rest>0)v=pair(v,rest,true);for(var j=0;j<whole;j++)v=pair(v,1,true);}else {for(var j=0;j<whole;j++)v=pair(v,1,false);if(rest>0)v=pair(v,rest,false);}return v;
  }
  function mappedRing(r,map,tolerance,budget){var out=[];function add(q){out.push(q);if(++budget.count>MAX_POINTS)throw Error('Linked Twist exceeds 300000 curve points');}
    function edge(a,b,fa,fb,depth){var m={x:(a.x+b.x)/2,y:(a.y+b.y)/2},fm=map(m),error=Math.hypot(fm.x-(fa.x+fb.x)/2,fm.y-(fa.y+fb.y)/2),length=Math.hypot(fb.x-fa.x,fb.y-fa.y);
      if((error>tolerance||length>2)&&depth<20){edge(a,m,fa,fm,depth+1);edge(m,b,fm,fb,depth+1);}else{if(depth===20&&error>tolerance*4)throw Error('Linked Twist curve refinement did not converge');add(fa);}}
    for(var i=0;i<r.length;i++)edge(r[i],r[(i+1)%r.length],map(r[i]),map(r[(i+1)%r.length]),0);return out;
  }
  function linked(s,p,color){if(p.twistCycles===0||p.twistTurns===0)return tint(s,color);var b=bounds(s),out=canvas(s);if(b.empty)return out;var radius=Math.hypot(b.w,b.h)*.5,budget={count:0},ctx=out.getContext('2d');
    function map(q){var v=twistMap({x:(q.x-b.cx)/radius,y:(q.y-b.cy)/radius},p,false);return {x:b.cx+v.x*radius,y:b.cy+v.y*radius};}
    try{ctx.fillStyle='rgb('+color.join(',')+')';ctx.beginPath();s.trace(s.data,s.w,s.h).forEach(function(c){var r=mappedRing(c.points,map,.12,budget);r.forEach(function(q,i){if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.closePath();});ctx.fill('nonzero');out._bodyDiagnostics={points:budget.count,inverseRaster:false};return out;}catch(e){if(!/Linked Twist/.test(e.message))throw e;return linkedInverse(s,p,color);}
  }
  // Highly stretched curves can become finer than the output pixels. Evaluate
  // the exact inverse map at four subpixel positions instead of dropping paths.
  function linkedInverse(s,p,color){var b=bounds(s),out=canvas(s);if(b.empty)return out;var radius=Math.hypot(b.w,b.h)*.5,reach=radius*(p.twistSeparation+p.twistRadius),x0=Math.max(0,Math.floor(Math.min(b.x0,b.cx-reach))-1),x1=Math.min(s.w-1,Math.ceil(Math.max(b.x1,b.cx+reach))+1),y0=Math.max(0,Math.floor(Math.min(b.y0,b.cy-reach))-1),y1=Math.min(s.h-1,Math.ceil(Math.max(b.y1,b.cy+reach))+1),ctx=out.getContext('2d'),im=ctx.createImageData(s.w,s.h),pixels=0;
    for(var y=y0;y<=y1;y++)for(var x=x0;x<=x1;x++){var alpha=0;for(var j=0;j<2;j++)for(var i=0;i<2;i++){var v=twistMap({x:(x+(i+.5)/2-b.cx)/radius,y:(y+(j+.5)/2-b.cy)/radius},p,true);alpha+=sampleAlpha(s,b.cx+v.x*radius,b.cy+v.y*radius);}if(alpha>0){var k=(y*s.w+x)*4;im.data[k]=color[0];im.data[k+1]=color[1];im.data[k+2]=color[2];im.data[k+3]=Math.round(alpha*255/4);}pixels++;}if(root.TypeDeformerRenderContext){var RC=root.TypeDeformerRenderContext,highAlpha=RC.alphaSampler(s.canvas);RC.field(im,function(x,y,rgba,footprint){var alpha=0;for(var j=0;j<2;j++)for(var i=0;i<2;i++){var v=twistMap({x:(x+((i+.5)/2-.5)*footprint-b.cx)/radius,y:(y+((j+.5)/2-.5)*footprint-b.cy)/radius},p,true);alpha+=highAlpha(b.cx+v.x*radius+.5,b.cy+v.y*radius+.5);}rgba[0]=color[0];rgba[1]=color[1];rgba[2]=color[2];rgba[3]=alpha*255/4;});}ctx.putImageData(im,0,0);out._bodyDiagnostics={inverseRaster:true,pixels:pixels,samples:4};return out;
  }
  function mul(a,b){return [a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];}
  function power(z,n){var a=[1,0];for(var j=0;j<n;j++)a=mul(a,z);return a;}
  function associate(z,angle){var cs=Math.cos(angle),sn=Math.sin(angle);return [cs*z[0]-sn*z[1],sn*z[0]+cs*z[1]];}
  // The real and imaginary parts of entire polynomial Weierstrass integrals.
  // Reflection of the conventional second coordinate keeps canvas Y positive.
  function enneperPoint(u,v,n,phase){var z=[u,v],a=power(z,2*n+1),b=power(z,n+1),x=associate([u-a[0]/(2*n+1),v-a[1]/(2*n+1)],phase),y=associate([u+a[0]/(2*n+1),v+a[1]/(2*n+1)],phase),h=associate([2*b[0]/(n+1),2*b[1]/(n+1)],phase);return [x[0],y[1],h[0]];}
  function enneperTangents(u,v,n,phase){var a=power([u,v],2*n),b=power([u,v],n),x=associate([1-a[0],-a[1]],phase),y=associate([1+a[0],a[1]],phase),h=associate([2*b[0],2*b[1]],phase);return [[x[0],y[1],h[0]],[-x[1],y[0],-h[1]]];}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function rotate(q,yaw,tilt){var c=Math.cos(yaw),s=Math.sin(yaw),x=q[0]*c+q[2]*s,z=-q[0]*s+q[2]*c;return [x,q[1]*Math.cos(tilt)-z*Math.sin(tilt),q[1]*Math.sin(tilt)+z*Math.cos(tilt)];}
  function sampleAlpha(s,x,y){if(s.presentationAlpha)return s.presentationAlpha(x+.5,y+.5);if(x<0||y<0||x>=s.w-1||y>=s.h-1)return 0;var ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,i=iy*s.w+ix;return (s.alpha[i]*(1-fx)+s.alpha[i+1]*fx)*(1-fy)+(s.alpha[i+s.w]*(1-fx)+s.alpha[i+s.w+1]*fx)*fy;}
  function rasterTriangle(target,a,b,c,s,color,relief){var w=target.w,h=target.h,D=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(Math.abs(D)<1e-10)return;var x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(w-1,Math.ceil(Math.max(a[0],b[0],c[0]))),y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(h-1,Math.ceil(Math.max(a[1],b[1],c[1])));
    for(var y=y0;y<=y1;y++)for(var x=x0;x<=x1;x++){var px=x+.5-a[0],py=y+.5-a[1],v=(px*(c[1]-a[1])-py*(c[0]-a[0]))/D,t=((b[0]-a[0])*py-(b[1]-a[1])*px)/D,u=1-v-t;if(u< -1e-8||v< -1e-8||t< -1e-8)continue;var z=u*a[2]+v*b[2]+t*c[2],idx=y*w+x;if(z<target.depth[idx])continue;var sx=u*a[3]+v*b[3]+t*c[3],sy=u*a[4]+v*b[4]+t*c[4],alpha=sampleAlpha(s,sx,sy);if(alpha<.01)continue;
      if(alpha<.5)continue;var nx=u*a[5]+v*b[5]+t*c[5],ny=u*a[6]+v*b[6]+t*c[6],nz=u*a[7]+v*b[7]+t*c[7],norm=Math.hypot(nx,ny,nz),light=Math.abs((nx*.35-ny*.4+nz*.846)/Math.max(1e-10,norm)),shade=relief*(.09+.82*Math.pow(1-light,1.35));target.depth[idx]=z;var j=idx*4;target.pixels[j]=Math.round(color[0]+(235-color[0])*shade);target.pixels[j+1]=Math.round(color[1]+(232-color[1])*shade);target.pixels[j+2]=Math.round(color[2]+(224-color[2])*shade);target.pixels[j+3]=255;target.fragments++;}
  }
  function enneper(s,p,color){var b=bounds(s),out=canvas(s);if(b.empty)return out;var radius=Math.hypot(b.w,b.h)*.5,span=p.enneperSpan,n=p.enneperOrder,phase=p.enneperAssociate*Math.PI/180,yaw=p.enneperYaw*Math.PI/180,tilt=p.enneperTilt*Math.PI/180,norm=span*(1+Math.pow(span,2*n)/(2*n+1)),scale=radius/norm,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],grid=Math.min(320,Math.max(128+(n-1)*32+Math.ceil(span*16),Math.ceil(Math.max(b.w,b.h)/.9))),verts=[],triangles=0;
    for(var j=0;j<=grid;j++)for(var i=0;i<=grid;i++){var sx=b.x0-1+(b.w+2)*i/grid,sy=b.y0-1+(b.h+2)*j/grid,u=(sx-b.cx)/radius*span,v=(sy-b.cy)/radius*span,pos=enneperPoint(u,v,n,phase),tangents=enneperTangents(u,v,n,phase),normal=rotate(cross(tangents[0],tangents[1]),yaw,tilt),len=Math.hypot.apply(null,normal);if(sampleAlpha(s,sx,sy)>.02)for(var axis=0;axis<3;axis++){lo[axis]=Math.min(lo[axis],pos[axis]);hi[axis]=Math.max(hi[axis],pos[axis]);}verts.push([pos[0],pos[1],pos[2],sx,sy,normal[0]/len,normal[1]/len,normal[2]/len]);}
    // Frame the occupied glyph surface in 3D before applying the viewing angle.
    // A uniform similarity preserves minimality; empty bbox corners no longer
    // shrink higher-order glyphs. Every component and counter shares this frame.
    var center=[0,0,0],extent=0;for(var axis=0;axis<3;axis++){center[axis]=(lo[axis]+hi[axis])/2;extent=Math.max(extent,hi[axis]-lo[axis]);}if(!Number.isFinite(extent)||extent<=0)return out;scale=Math.max(b.w,b.h)/extent;
    verts.forEach(function(q){var pos=rotate([q[0]-center[0],q[1]-center[1],q[2]-center[2]],yaw,tilt);q[0]=b.cx+pos[0]*scale;q[1]=b.cy+pos[1]*scale;q[2]=pos[2]*scale;});
    var ox=s.w,oy=s.h,rx=0,ry=0;verts.forEach(function(q){ox=Math.min(ox,q[0]);oy=Math.min(oy,q[1]);rx=Math.max(rx,q[0]);ry=Math.max(ry,q[1]);});ox=Math.max(0,Math.floor(ox)-1);oy=Math.max(0,Math.floor(oy)-1);rx=Math.min(s.w,Math.ceil(rx)+1);ry=Math.min(s.h,Math.ceil(ry)+1);var tw=Math.max(2,(rx-ox)*2),th=Math.max(2,(ry-oy)*2),target={w:tw,h:th,depth:new Float32Array(tw*th).fill(-Infinity),pixels:new Uint8ClampedArray(tw*th*4),fragments:0};verts.forEach(function(q){q[0]=(q[0]-ox)*2;q[1]=(q[1]-oy)*2;});
    for(var j=0;j<grid;j++)for(var i=0;i<grid;i++){var a=j*(grid+1)+i,bc=a+grid+1;rasterTriangle(target,verts[a],verts[a+1],verts[bc+1],s,color,p.enneperRelief);rasterTriangle(target,verts[a],verts[bc+1],verts[bc],s,color,p.enneperRelief);triangles+=2;}
    var temp=canvas({w:tw,h:th}),ctx=temp.getContext('2d'),im=ctx.createImageData(tw,th);im.data.set(target.pixels);ctx.putImageData(im,0,0);out.getContext('2d').drawImage(temp,ox,oy,tw/2,th/2);if(root.TypeDeformerRenderContext){var R=root.TypeDeformerRenderContext,highSource=Object.assign({},s,{presentationAlpha:R.alphaSampler(s.canvas)}),faces=[];for(var row=0;row<grid;row++)for(var col=0;col<grid;col++){var a=row*(grid+1)+col,b=a+grid+1;faces.push([a,a+1,b+1],[a,b+1,b]);}R.mesh(out,verts,faces,function(target,a,b,c){rasterTriangle(target,a,b,c,highSource,color,p.enneperRelief);},{x:ox,y:oy,coordinateScale:2});}out._bodyDiagnostics={triangles:triangles,fragments:target.fragments,grid:grid};return out;
  }
  root.TypeDeformerFoldedBody={schemas:schemas,ids:Object.keys(schemas),renderers:{linkedTwist:linked,enneperBody:enneper},effectPad:function(id,g){var extent=g?Math.max(g.w,g.h):180;return Math.ceil(extent*(id==='linkedTwist'?2.5:1.1)+8);},internals:{radialTwist:radialTwist,twistMap:twistMap,mappedRing:mappedRing,linkedInverse:linkedInverse,enneperPoint:enneperPoint,enneperTangents:enneperTangents,rotate:rotate,cross:cross,rasterTriangle:rasterTriangle,bounds:bounds}};
})(typeof globalThis!=='undefined'?globalThis:this);
