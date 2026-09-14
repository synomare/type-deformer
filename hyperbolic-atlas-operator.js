(function(root){
  'use strict';
  // Original glyph-based hyperbolic tiling. See hyperbolic-atlas-research.md.
  var schemas={hyperbolicAtlas:{"label":"Hyperbolic Atlas","short":"hya","color":"#213c58","description":"双曲空間の鏡映で字形を反復し、円の縁へ向かって縮み続ける文字の地図を作ります。","options":{"atlasMode":["pentagon","square","triangle"]},"limits":{"atlasRadius":[28,112],"atlasScale":[0.5,2.4],"atlasShift":[-0.7,0.7],"atlasSpin":[-180,180],"atlasEdge":[0,1]},"defaults":{"atlasMode":"pentagon","atlasRadius":64,"atlasScale":1.1,"atlasShift":0.12,"atlasSpin":12,"atlasEdge":0.25},"labels":{"atlasMode":"Tiling / 空間の分割","atlasRadius":"Radius / 円の大きさ","atlasScale":"Motif / 文字の占有率","atlasShift":"Journey / 視点の移動","atlasSpin":"Orbit / 回転","atlasEdge":"Edges / 境界線"}}};
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function sample(a,w,h,x,y){if(x<0||y<0||x>w-1||y>h-1)return 0;x=clamp(x,0,w-1.001);y=clamp(y,0,h-1.001);var ix=x|0,iy=y|0,dx=x-ix,dy=y-iy,i=iy*w+ix;return (a[i]*(1-dx)+a[i+1]*dx)*(1-dy)+(a[i+w]*(1-dx)+a[i+w+1]*dx)*dy;}
  function bounds(s){var b=[s.w,s.h,-1,-1];for(var y=0;y<s.h;y++)for(var x=0;x<s.w;x++)if(s.alpha[y*s.w+x]>.01){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}return b[2]<0?null:b.map(function(v){return v/s.scale;});}
  function canvas(w,h){var c=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));c.width=w;c.height=h;return c;}
  // Finite Poincare-disk reflections. The selected q are even, so each whole
  // regular polygon is a reflection chamber with a consistent parity.
  function polygon(p,q){if(1/p+1/q>=.5||q%2)throw Error('A hyperbolic reflection chamber requires 1/p+1/q<1/2 and even q');var ct=Math.cos(2*Math.PI/q),rho2=(1+ct)/(ct+Math.cos(2*Math.PI/p)),rho=Math.sqrt(rho2),r2=rho2-1,walls=[];for(var i=0;i<p;i++){var t=2*Math.PI*i/p+Math.PI/p;walls.push([rho*Math.cos(t),rho*Math.sin(t)]);}return {p:p,q:q,r2:r2,rho:rho,walls:walls,inradius:rho-Math.sqrt(r2)};}
  function invert(x,y,c,r2){var dx=x-c[0],dy=y-c[1],k=r2/(dx*dx+dy*dy);return [c[0]+k*dx,c[1]+k*dy];}
  function fold(x,y,g){var count=0;for(var sweep=0;sweep<96;sweep++){var moved=false;for(var i=0;i<g.walls.length;i++){var c=g.walls[i],dx=x-c[0],dy=y-c[1],d=dx*dx+dy*dy;if(d<g.r2-1e-12){var k=g.r2/d;x=c[0]+k*dx;y=c[1]+k*dy;count++;moved=true;}}if(!moved)return {x:x,y:y,count:count,converged:true};}return {x:x,y:y,count:count,converged:false};}
  function shift(x,y,a){var dr=1-a*x,di=-a*y,den=dr*dr+di*di,nr=x-a;return [(nr*dr+y*di)/den,(y*dr-nr*di)/den];}
  function atlas(s,p,color,accent,seed){var out=canvas(s.w,s.h),ctx=out.getContext('2d'),b=bounds(s);if(!b)return out;var pair=p.atlasMode==='square'?[4,6]:p.atlasMode==='triangle'?[3,8]:[5,4],g=polygon(pair[0],pair[1]),radius=p.atlasRadius,center=[(b[0]+b[2])/2,(b[1]+b[3])/2],textureScale=Math.max(b[2]-b[0],b[3]-b[1])/(2*g.inradius*p.atlasScale*.72),spin=((p.atlasSpin%360)+360)%360*Math.PI/180,c=Math.cos(spin),sn=Math.sin(spin),im=ctx.createImageData(s.w,s.h);
    var xmin=Math.max(0,Math.floor((center[0]-radius)*s.scale)),xmax=Math.min(s.w-1,Math.ceil((center[0]+radius)*s.scale)),ymin=Math.max(0,Math.floor((center[1]-radius)*s.scale)),ymax=Math.min(s.h-1,Math.ceil((center[1]+radius)*s.scale));
    for(var y=ymin;y<=ymax;y++)for(var x=xmin;x<=xmax;x++){var dx=((x+.5)/s.scale-center[0])/radius,dy=((y+.5)/s.scale-center[1])/radius,rr=dx*dx+dy*dy;if(rr>=.998)continue;var shifted=shift(dx*c+dy*sn,-dx*sn+dy*c,p.atlasShift),f=fold(shifted[0],shifted[1],g);if(!f.converged)continue;
      var alpha=sample(s.alpha,s.w,s.h,(center[0]+f.x*textureScale)*s.scale,(center[1]+f.y*textureScale)*s.scale),edge=1e9,den=1-f.x*f.x-f.y*f.y;
      if(p.atlasEdge>0)for(var k=0;k<g.walls.length;k++){var u=f.x-g.walls[k][0],v=f.y-g.walls[k][1];edge=Math.min(edge,Math.abs(u*u+v*v-g.r2)/(Math.sqrt(g.r2)*den));}
      var stroke=p.atlasEdge?1-clamp(edge/(.004+p.atlasEdge*.05),0,1):0,fade=clamp((.998-rr)/.025,0,1),coverage=Math.max(alpha,stroke*.78)*fade,ink=f.count%2?accent:color;
      // Detail finer than a display pixel is attenuated close to the horizon.
      var footprint=2/(radius*s.scale*(1-rr)),blur=clamp((footprint-.5)/2,0,1);coverage=coverage*(1-blur)+.28*fade*blur;var at=(y*s.w+x)*4;
      for(var k=0;k<3;k++)im.data[at+k]=ink[k]*(1-stroke*.28);im.data[at+3]=coverage*255;
    }
    // Destination shader: sample the original glyph and fixed material solution.
    if(root.TypeDeformerRenderContext){var RC=root.TypeDeformerRenderContext,highAlpha=RC.alphaSampler(s.canvas);
      RC.field(im,function(px,py,rgba,pixelFootprint){var x=px-.5,y=py-.5;var dx=((x+.5)/s.scale-center[0])/radius,dy=((y+.5)/s.scale-center[1])/radius,rr=dx*dx+dy*dy;if(rr>=.998)return;var shifted=shift(dx*c+dy*sn,-dx*sn+dy*c,p.atlasShift),f=fold(shifted[0],shifted[1],g);if(!f.converged)return;
      var alpha=highAlpha((center[0]+f.x*textureScale)*s.scale+.5,(center[1]+f.y*textureScale)*s.scale+.5),edge=1e9,den=1-f.x*f.x-f.y*f.y;
      if(p.atlasEdge>0)for(var k=0;k<g.walls.length;k++){var u=f.x-g.walls[k][0],v=f.y-g.walls[k][1];edge=Math.min(edge,Math.abs(u*u+v*v-g.r2)/(Math.sqrt(g.r2)*den));}
      var stroke=p.atlasEdge?1-clamp(edge/(.004+p.atlasEdge*.05),0,1):0,fade=clamp((.998-rr)/.025,0,1),coverage=Math.max(alpha,stroke*.78)*fade,ink=f.count%2?accent:color;
      // Detail finer than a display pixel is attenuated close to the horizon.
      var footprint=2*pixelFootprint/(radius*s.scale*(1-rr)),blur=clamp((footprint-.5)/2,0,1);coverage=coverage*(1-blur)+.28*fade*blur;var at=(y*s.w+x)*4;
      for(var k=0;k<3;k++)rgba[k]=ink[k]*(1-stroke*.28);rgba[3]=coverage*255;
    });
    }
    ctx.putImageData(im,0,0);return out;
  }
  root.TypeDeformerHyperbolicAtlas={schemas:schemas,ids:Object.keys(schemas),renderers:{hyperbolicAtlas:atlas},effectPad:function(){return 116;},internals:{polygon:polygon,invert:invert,fold:fold,shift:shift}};
})(typeof globalThis!=='undefined'?globalThis:this);
