(function(root){
  'use strict';
  var schema={label:'Gravity Lens',short:'grl',color:'#353044',description:'重力レンズの光線追跡で、文字の像を環状の弧や複数の像へ分裂させます。',options:{lensMode:['single','binary']},integers:[],
    defaults:{lensEinstein:1,lensSeparation:1.1,lensRatio:.6,lensScale:.4,lensSourceX:.22,lensSourceY:.08,lensAngle:25,lensShear:0,lensMode:'binary'},
    limits:{lensEinstein:[0,1.8],lensSeparation:[0,2.6],lensRatio:[.05,1],lensScale:[.18,1],lensSourceX:[-1.2,1.2],lensSourceY:[-1.2,1.2],lensAngle:[-180,180],lensShear:[-.45,.45]},
    labels:{lensEinstein:'Einstein radius / レンズの強さ',lensSeparation:'Separation / 連星の間隔',lensRatio:'Mass ratio / 連星の質量比',lensScale:'Source size / 元の像の大きさ',lensSourceX:'Source X / 像の横位置',lensSourceY:'Source Y / 像の縦位置',lensAngle:'Angle / 連星・剪断の方向',lensShear:'Shear / 外部の剪断',lensMode:'Lenses / レンズの数'}};
  function canvas(w,h){var c=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));c.width=w;c.height=h;return c;}
  function bounds(s){var x0=s.w,y0=s.h,x1=-1,y1=-1;for(var y=0;y<s.h;y++)for(var x=0;x<s.w;x++)if(s.alpha[y*s.w+x]>0){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return {cx:(x0+x1)/2,cy:(y0+y1)/2,w:Math.max(1,x1-x0+2),h:Math.max(1,y1-y0+2),empty:x1<0};}
  function model(p){var angle=p.lensAngle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),mass=p.lensEinstein*p.lensEinstein,q=p.lensRatio,d=p.lensMode==='binary'?p.lensSeparation:0,a=d*q/(1+q),b=-d/(1+q);return {lenses:d?[{x:a*c,y:a*s,m:mass/(1+q)},{x:b*c,y:b*s,m:mass*q/(1+q)}]:[{x:0,y:0,m:mass}],mass:mass,a:Math.max(a,-b),g1:p.lensShear*Math.cos(2*angle),g2:p.lensShear*Math.sin(2*angle)};}
  // Thin lens equation beta = (I + Gamma) theta - sum m_j r_j / |r_j|^2.
  // This inverse ray map preserves surface brightness and includes reversed
  // images. A pole has no finite source and is excluded without softening it.
  function ray(x,y,m,out){var bx=(1+m.g1)*x+m.g2*y,by=m.g2*x+(1-m.g1)*y;for(var i=0;i<m.lenses.length;i++){var l=m.lenses[i];if(!l.m)continue;var dx=x-l.x,dy=y-l.y,d=dx*dx+dy*dy;if(d<1e-24){out[0]=out[1]=Infinity;return out;}bx-=l.m*dx/d;by-=l.m*dy/d;}out[0]=bx;out[1]=by;return out;}
  function jacobian(x,y,m){var a=1+m.g1,b=m.g2,c=1-m.g1;for(var i=0;i<m.lenses.length;i++){var l=m.lenses[i],dx=x-l.x,dy=y-l.y,r2=dx*dx+dy*dy;if(!l.m)continue;if(r2<1e-24)return [Infinity,Infinity,Infinity];var t=l.m/(r2*r2);a+=t*(dx*dx-dy*dy);b+=2*t*dx*dy;c+=t*(dy*dy-dx*dx);}return [a,b,c];}
  // For r > a, |beta| >= (1-|gamma|)r-M/(r-a). Solving at the
  // source bounding disk gives a conservative disk enclosing every image.
  function imageRadius(b,p,m){var radius=Math.max(b.w,b.h)/2,B=Math.hypot(p.lensSourceX,p.lensSourceY)+p.lensScale*Math.hypot(b.w,b.h)/(2*radius),lambda=1-Math.abs(p.lensShear);return ((lambda*m.a+B)+Math.sqrt(Math.pow(lambda*m.a-B,2)+4*lambda*m.mass))/(2*lambda)+.025;}
  function sample(s,x,y){if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=s.w-1||y>=s.h-1)return 0;var ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,i=iy*s.w+ix;return (s.alpha[i]*(1-fx)+s.alpha[i+1]*fx)*(1-fy)+(s.alpha[i+s.w]*(1-fx)+s.alpha[i+s.w+1]*fx)*fy;}
  function render(s,p,color){var out=canvas(s.w,s.h),b=bounds(s);if(b.empty)return out;var ctx=out.getContext('2d'),im=ctx.createImageData(s.w,s.h),pixels=im.data,m=model(p),radius=Math.max(b.w,b.h)/2,R=imageRadius(b,p,m),margin=Math.min(b.cx,b.cy,s.w-b.cx,s.h-b.cy)-4,unit=Math.min(radius,margin/R),sourceUnit=radius/p.lensScale,extent=R*unit+2,xy=[0,0],samples=[-.25,.25],area=0;
    var x0=Math.max(0,Math.floor(b.cx-extent)),x1=Math.min(s.w-1,Math.ceil(b.cx+extent)),y0=Math.max(0,Math.floor(b.cy-extent)),y1=Math.min(s.h-1,Math.ceil(b.cy+extent));
    for(var y=y0;y<=y1;y++)for(var x=x0;x<=x1;x++){var alpha=0;for(var sy=0;sy<2;sy++)for(var sx=0;sx<2;sx++){ray((x+samples[sx]-b.cx)/unit,(y+samples[sy]-b.cy)/unit,m,xy);alpha+=sample(s,b.cx+(xy[0]-p.lensSourceX)*sourceUnit,b.cy+(xy[1]-p.lensSourceY)*sourceUnit);}alpha*=.25;if(alpha<=0)continue;var k=(y*s.w+x)*4;pixels[k]=color[0];pixels[k+1]=color[1];pixels[k+2]=color[2];pixels[k+3]=Math.round(alpha*255);area+=alpha;}

    // Destination shader: sample the original glyph and fixed material solution.
    if(root.TypeDeformerRenderContext){var RC=root.TypeDeformerRenderContext,highAlpha=RC.alphaSampler(s.canvas);
      RC.field(im,function(px,py,rgba,pixelFootprint){var x=px-.5,y=py-.5;var alpha=0;for(var sy=0;sy<2;sy++)for(var sx=0;sx<2;sx++){ray((x+samples[sx]*pixelFootprint-b.cx)/unit,(y+samples[sy]*pixelFootprint-b.cy)/unit,m,xy);alpha+=highAlpha(b.cx+(xy[0]-p.lensSourceX)*sourceUnit+.5,b.cy+(xy[1]-p.lensSourceY)*sourceUnit+.5);}alpha*=.25;if(alpha<=0)return;var k=(y*s.w+x)*4;rgba[0]=color[0];rgba[1]=color[1];rgba[2]=color[2];rgba[3]=Math.round(alpha*255);});
    }
    ctx.putImageData(im,0,0);out._lensDiagnostics={radius:R,unit:unit,viewScale:unit/radius,area:area,lenses:m.lenses.length};return out;
  }
  root.TypeDeformerGravityLens={ids:['gravityLens'],schemas:{gravityLens:schema},renderers:{gravityLens:render},effectPad:function(id,g){return g?Math.ceil(Math.max(g.w,g.h)*1.15+24):260;},internals:{model:model,ray:ray,jacobian:jacobian,imageRadius:imageRadius,bounds:bounds,sample:sample}};
})(typeof window!=='undefined'?window:globalThis);
