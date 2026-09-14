(function(root){
  'use strict';
  // Original body constructions. Shared alpha contours and EDT come from the
  // editor; no reference artwork, pre-rendered glyphs or external font assets.
  var schemas={};
  function schema(id,label,short,description,fields,options){
    var s={label:label,short:short,color:'#171717',description:description,defaults:{},limits:{},labels:{},options:options||{},integers:[]};
    fields.forEach(function(f){s.defaults[f[0]]=f[1];s.labels[f[0]]=f[4];if(f[2]!=null)s.limits[f[0]]=[f[2],f[3]];if(f[5])s.integers.push(f[0]);});schemas[id]=s;
  }
  schema('rationalCusp','Rational Cusp','rcu','白地に置いた複数の極で、穴と外周を一緒に尖らせます。',[
    ['cuspAmount',.82,0,1.5,'Cusp / 尖頭'],['cuspPoles',2,1,5,'Poles / 極の数',true],['cuspSpread',.55,0,1,'Spread / 極の配置'],['cuspPhase',22,-180,180,'Phase / 尖る向き']]);
  schema('bladeBody','Blade Body','bld','字画を削りながら斜めへ掃引し、厚い根元と薄い刃先を作ります。',[
    ['bladeLength',.7,0,1.4,'Length / 刃長'],['bladeAngle',-32,-180,180,'Angle / 刃角'],['bladeTaper',.7,0,1,'Taper / 研ぎ'],['bladeSide','double',null,null,'Edge / 片刃・両刃']],{bladeSide:['single','double']});
  schema('blackBastion','Black Bastion','bst','外側を重く太らせ、内側の穴を細い縦の裂け目として残します。',[
    ['bastionMass',.72,0,1.5,'Mass / 黒量'],['bastionSlit',.22,.04,1,'Slit / 穴の幅'],['bastionReach',.9,0,1,'Height / 穴の高さ'],['bastionAxis',0,-90,90,'Axis / 裂け目の傾き']]);
  schema('inktrapAbyss','Inktrap Abyss','iab','実輪郭の凹角から、太い接合部の内部へ深いくさびを切り込みます。',[
    ['abyssDepth',.8,0,1.5,'Depth / 切込み'],['abyssMouth',.35,.05,1,'Mouth / 口幅'],['abyssBias',.22,-1,1,'Bias / 切込角'],['abyssCount',5,1,12,'Cuts / 切込数',true],['abyssPierce','stop',null,null,'Exit / 貫通']],{abyssPierce:['stop','pierce']});
  schema('strangulation','Strangulation','stn','締付け帯の細い首と隣の膨らみで、字の身体を大きく変形します。',[
    ['strangleAmount',.88,0,1,'Pressure / 締付け'],['stranglePosition',.48,.05,.95,'Position / 首の位置'],['strangleBulge',.8,0,1.5,'Bulge / 膨らみ'],['strangleAngle',0,-90,90,'Axis / 締付方向'],['strangleBands',2,1,4,'Bands / 締付け帯',true]]);
  schema('gillArray','Gill Array','gil','曲がった帯を字画から切り出し、付根を残して鰓のように開きます。',[
    ['gillCount',12,3,26,'Fins / 鰓の数',true],['gillOpen',.7,0,1.4,'Opening / 開き'],['gillRoot',.22,.04,.8,'Root / 付根幅'],['gillCurve',.7,-1.5,1.5,'Curve / 湾曲'],['gillGap',.2,0,.7,'Gap / 切れ目']]);
  schema('screwExtrusion','Screw Extrusion','scr','字形断面を回しながら押し出し、側面でつないだ螺旋の量塊を作ります。',[
    ['screwDepth',.65,0,1.2,'Depth / 奥行き'],['screwTurn',55,-150,150,'Turn / 捩り'],['screwTaper',.22,-.35,.75,'Taper / 断面変化'],['screwView',-32,-180,180,'View / 投影方向'],['screwShade',.32,0,1,'Shade / 側面濃淡']]);
  schema('harmonicCage','Harmonic Cage','hcg','外側のケージの変位を調和方程式で内部へ伝え、文字全体を引き延ばします。',[
    ['cagePull',.9,0,1.5,'Pull / 引張り'],['cagePosition',.32,.08,.92,'Position / 支点位置'],['cageSpan',.25,.08,.65,'Span / 支点の幅'],['cageMode','opposed',null,null,'Cage / 引張り方'],['cageCounter',.25,0,1,'Counters / 穴の拘束']],{cageMode:['opposed','fan','shear']});
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function canvas(s){var c=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));c.width=s.w;c.height=s.h;return c;}
  function css(c){return 'rgb('+c.map(Math.round).join(',')+')';}
  function sample(a,w,h,x,y){if(x<0||y<0||x>=w-1||y>=h-1)return 0;var ix=x|0,iy=y|0,tx=x-ix,ty=y-iy,i=iy*w+ix;return (a[i]*(1-tx)+a[i+1]*tx)*(1-ty)+(a[i+w]*(1-tx)+a[i+w+1]*tx)*ty;}
  function bounds(s){var x0=s.w,y0=s.h,x1=-1,y1=-1;for(var y=0;y<s.h;y++)for(var x=0;x<s.w;x++)if(s.alpha[y*s.w+x]>.1){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return {x:x0,y:y0,w:Math.max(1,x1-x0),h:Math.max(1,y1-y0),cx:(x0+x1)/2,cy:(y0+y1)/2,empty:x1<0};}
  function edt(a,w,h){return root.TypeDeformerLoadpathFoundry.internals.euclideanDistance(a,w,h);}
  function loops(s){return s.trace(s.data,s.w,s.h);}
  function path(ctx,cs,fn){ctx.beginPath();cs.forEach(function(c){c.points.forEach(function(p,i){var q=fn?fn(p,c):p;if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.closePath();});}
  function filled(s,color,cs,fn){var out=canvas(s),ctx=out.getContext('2d');ctx.fillStyle=css(color);path(ctx,cs,fn);ctx.fill('nonzero');return out;}
  function inkCanvas(s,color,alpha){var out=canvas(s),ctx=out.getContext('2d'),im=ctx.createImageData(s.w,s.h);for(var i=0;i<alpha.length;i++){for(var j=0;j<3;j++)im.data[4*i+j]=color[j];im.data[4*i+3]=Math.round(255*clamp(alpha[i],0,1));}if(root.TypeDeformerRenderContext)root.TypeDeformerRenderContext.field(im,function(x,y,rgba){rgba[0]=color[0];rgba[1]=color[1];rgba[2]=color[2];rgba[3]=255*clamp(root.TypeDeformerRenderContext.sample(alpha,s.w,s.h,x-.5,y-.5),0,1);});ctx.putImageData(im,0,0);return out;}
  function tint(s,color){return inkCanvas(s,color,s.alpha);}
  function centroid(c){var x=0,y=0;for(var i=0;i<c.points.length;i++){x+=c.points[i].x;y+=c.points[i].y;}return {x:x/c.points.length,y:y/c.points.length};}
  function poleSet(s,cs,b,count,spread){
    var inverse=s.alpha.map(function(v){return 1-v;}),d=edt(inverse,s.w,s.h),out=[],candidates=[];
    // Prefer true counter voids; use their maximum clearance, not the contour
    // centroid (which may lie in ink for crescent-shaped counters).
    cs.filter(function(c){return c.area<0;}).sort(function(a,b){return a.area-b.area;}).forEach(function(c){
      var center=centroid(c),best=null,score=-1;
      for(var y=Math.max(1,Math.floor(center.y-b.h*.35));y<Math.min(s.h-1,center.y+b.h*.35);y+=2)for(var x=Math.max(1,Math.floor(center.x-b.w*.35));x<Math.min(s.w-1,center.x+b.w*.35);x+=2){
        var inside=false;for(var i=0,j=c.points.length-1;i<c.points.length;j=i++){var a=c.points[i],q=c.points[j];if((a.y>y)!==(q.y>y)&&x<(q.x-a.x)*(y-a.y)/(q.y-a.y)+a.x)inside=!inside;}
        if(inside&&d[y*s.w+x]>score){score=d[y*s.w+x];best={x:x,y:y,r:score};}
      }if(best&&best.r>1){var shift=(spread-.5)*best.r*.9;best.x+=shift;best.y-=shift*.45;best.r=Math.max(1,sample(d,s.w,s.h,best.x,best.y));out.push(best);}
    });
    for(var j=0;j<8;j++){var angle=(j+.35+spread*.45)*Math.PI/4,x=b.cx+Math.cos(angle)*b.w*(.35+.2*spread),y=b.cy+Math.sin(angle)*b.h*(.35+.2*spread),r=sample(d,s.w,s.h,x,y);if(r>2)candidates.push({x:x,y:y,r:r});}
    // Guaranteed exterior candidates also support I, periods and holeless CJK.
    candidates.push({x:b.x-b.h*.08-3,y:b.y+b.h*(.2+.5*spread),r:b.h*.08+3},{x:b.x+b.w+b.h*.08+3,y:b.y+b.h*(.8-.5*spread),r:b.h*.08+3});
    candidates.sort(function(a,b){return b.r-a.r;});for(var i=0;out.length<count&&i<candidates.length;i++)if(out.every(function(q){return Math.hypot(q.x-candidates[i].x,q.y-candidates[i].y)>4;}))out.push(candidates[i]);return out.slice(0,count);
  }
  function rationalPoint(q,poles,amount,phase,maxMove){var dx=0,dy=0;poles.forEach(function(p,j){var x=q.x-p.x,y=q.y-p.y,den=Math.max(.25,x*x+y*y),angle=phase*Math.PI/180+(j%2?-.82:.82),a=p.r*p.r*3.5*amount;dx+=a*(Math.cos(angle)*x+Math.sin(angle)*y)/den;dy+=a*(Math.sin(angle)*x-Math.cos(angle)*y)/den;});var r=Math.hypot(dx,dy),cap=r>maxMove?maxMove/r:1;return {x:q.x+dx*cap,y:q.y+dy*cap};}
  function rational(s,p,c){var b=bounds(s),cs=loops(s);if(b.empty)return canvas(s);var poles=poleSet(s,cs,b,p.cuspPoles,p.cuspSpread);return filled(s,c,cs,function(q){return rationalPoint(q,poles,p.cuspAmount,p.cuspPhase,85*s.scale);});}
  function blade(s,p,c){if(p.bladeLength===0)return tint(s,c);var b=bounds(s),d=edt(s.alpha,s.w,s.h),inv=s.alpha.map(function(v){return 1-v;}),outside=edt(inv,s.w,s.h),length=Math.min(b.h*.33,70*s.scale)*p.bladeLength,angle=p.bladeAngle*Math.PI/180,steps=Math.ceil(length*2)+1;
    // A taper-weighted Minkowski envelope: distant samples are eroded before
    // transport. Unlike a drop shadow, the transported ink is the new body.
    var field=new Float32Array(d.length),alpha=s.alpha.slice(),taper=Math.min(b.h*.085,17*s.scale)*p.bladeTaper;
    for(var i=0;i<d.length;i++)field[i]=d[i]-outside[i];
    var x0=Math.max(1,Math.floor(b.x-length-2)),x1=Math.min(s.w-2,Math.ceil(b.x+b.w+length+2)),y0=Math.max(1,Math.floor(b.y-length-2)),y1=Math.min(s.h-2,Math.ceil(b.y+b.h+length+2));
    for(var j=0;j<=steps;j++){var u=j/steps,t=p.bladeSide==='double'?u*2-1:u,dx=Math.cos(angle)*length*t,dy=Math.sin(angle)*length*t,cut=Math.abs(t)*taper;
      for(var y=y0;y<=y1;y++)for(var x=x0;x<=x1;x++){var i=y*s.w+x;if(alpha[i]>=1)continue;var v=sample(field,s.w,s.h,x-dx,y-dy)-cut;alpha[i]=Math.max(alpha[i],clamp(v+.5,0,1));}}
    return inkCanvas(s,c,alpha);
  }
  function bastion(s,p,c){var b=bounds(s);if(b.empty)return canvas(s);var inv=s.alpha.map(function(v){return 1-v;}),d=edt(inv,s.w,s.h),grow=Math.min(b.h*.12,38*s.scale)*p.bastionMass,a=new Float32Array(d.length);for(var i=0;i<a.length;i++)a[i]=Math.max(s.alpha[i],clamp(grow-d[i]+.5,0,1));var out=inkCanvas(s,c,a),ctx=out.getContext('2d'),cs=loops(s).filter(function(q){return q.area<0;}),angle=p.bastionAxis*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle);ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';
    ctx.globalCompositeOperation='source-over';ctx.fillStyle=css(c);path(ctx,cs);ctx.fill('nonzero');
    ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';
    path(ctx,cs,function(q,ring){var o=centroid(ring),x=q.x-o.x,y=q.y-o.y,u=(x*co+y*si)*p.bastionSlit,v=(-x*si+y*co)*p.bastionReach;return {x:o.x+u*co-v*si,y:o.y+u*si+v*co};});ctx.fill('nonzero');return out;
  }
  function resample(cs,step){return cs.map(function(c){var p=c.points,lens=[0],len=0;for(var i=0;i<p.length;i++){len+=Math.hypot(p[(i+1)%p.length].x-p[i].x,p[(i+1)%p.length].y-p[i].y);lens.push(len);}var n=Math.max(12,Math.ceil(len/step)),out=[],j=0;for(var k=0;k<n;k++){var d=k*len/n;while(j<p.length-1&&lens[j+1]<d)j++;var t=(d-lens[j])/(lens[j+1]-lens[j]||1),a=p[j],b=p[(j+1)%p.length];out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}return {area:c.area,points:out};});}
  function cuts(s,cs,b,p){var candidates=[];resample(cs,Math.max(1,s.scale)).forEach(function(c){var pts=c.points,n=pts.length,k=Math.max(3,Math.round(b.h*.022/s.scale));for(var i=0;i<n;i++){var a=pts[(i-k+n)%n],q=pts[i],z=pts[(i+k)%n],ux=q.x-a.x,uy=q.y-a.y,vx=z.x-q.x,vy=z.y-q.y,cross=(ux*vy-uy*vx)/(Math.hypot(ux,uy)*Math.hypot(vx,vy)||1);if(cross>-.32)continue;var tx=z.x-a.x,ty=z.y-a.y,len=Math.hypot(tx,ty)||1;tx/=len;ty/=len;var nx=-ty,ny=tx;if(sample(s.alpha,s.w,s.h,q.x+nx*3,q.y+ny*3)<.5){nx=-nx;ny=-ny;}if(sample(s.alpha,s.w,s.h,q.x+nx*3,q.y+ny*3)<.5)continue;candidates.push({x:q.x,y:q.y,tx:tx,ty:ty,nx:nx,ny:ny,score:-cross});}});candidates.sort(function(a,b){return b.score-a.score;});var out=[];for(var i=0;i<candidates.length&&out.length<p.abyssCount;i++){var q=candidates[i];if(out.some(function(a){return Math.hypot(a.x-q.x,a.y-q.y)<b.h*.12;}))continue;var nx=q.nx+q.tx*p.abyssBias*.55,ny=q.ny+q.ty*p.abyssBias*.55,len=Math.hypot(nx,ny);q.nx=nx/len;q.ny=ny/len;var depth=Math.min(b.h*.35,64*s.scale)*p.abyssDepth,run=2;while(run<depth&&sample(s.alpha,s.w,s.h,q.x+q.nx*run,q.y+q.ny*run)>.35)run++;q.depth=p.abyssPierce==='stop'?Math.min(depth,Math.max(0,run-2*s.scale)):depth;if(q.depth>3)out.push(q);}return out;}
  function abyss(s,p,c){var out=tint(s,c);if(p.abyssDepth===0)return out;var ctx=out.getContext('2d'),b=bounds(s),list=cuts(s,loops(s),b,p);ctx.globalCompositeOperation='destination-out';ctx.fillStyle='#000';list.forEach(function(q){var w=Math.min(b.h*.075,14*s.scale)*p.abyssMouth;ctx.beginPath();ctx.moveTo(q.x-q.tx*w-q.nx*2,q.y-q.ty*w-q.ny*2);ctx.lineTo(q.x+q.tx*w-q.nx*2,q.y+q.ty*w-q.ny*2);ctx.lineTo(q.x+q.nx*q.depth,q.y+q.ny*q.depth);ctx.closePath();ctx.fill();});return out;}
  function stranglePoint(q,b,p){var angle=p.strangleAngle*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle),x=q.x-b.cx,y=q.y-b.cy,u=x*co+y*si,v=-x*si+y*co,h=Math.max(b.h,b.w*.7),t=v/h+.5,waist=0,bulge=0;for(var j=0;j<p.strangleBands;j++){var pos=p.stranglePosition+(j-(p.strangleBands-1)/2)*.42,dd=(t-pos)/.085;waist=Math.max(waist,Math.exp(-dd*dd));bulge+=Math.exp(-Math.pow((t-pos-.15)/.095,2))+Math.exp(-Math.pow((t-pos+.15)/.095,2));}var scale=1-.86*p.strangleAmount*waist+.45*p.strangleBulge*p.strangleAmount*Math.min(1.6,bulge);u*=scale;var X=b.cx+u*co-v*si,Y=b.cy+u*si+v*co,dx=X-q.x,dy=Y-q.y,r=Math.hypot(dx,dy),k=Math.min(1,90*(b.sc||1)/Math.max(1,r));return {x:q.x+dx*k,y:q.y+dy*k};}
  function strangulation(s,p,c){var b=bounds(s);b.sc=s.scale;return filled(s,c,loops(s),function(q){return stranglePoint(q,b,p);});}
  function gill(s,p,c){var b=bounds(s),out=canvas(s),ctx=out.getContext('2d'),src=tint(s,c),step=b.h/p.gillCount,root=b.x+b.w*p.gillRoot;
    // The source's left root strip remains; every fin is clipped from real ink.
    // It preserves existing connections, without inventing bridges over voids.
    ctx.save();ctx.beginPath();ctx.rect(0,0,root,s.h);ctx.clip();ctx.drawImage(src,0,0);ctx.restore();
    for(var j=0;j<p.gillCount;j++){var top=b.y+j*step,bottom=top+step*(1-p.gillGap),pivot=top+step/2,part=canvas(s),pc=part.getContext('2d');pc.beginPath();for(var k=0;k<=40;k++){var x=root+k/40*(s.w-root),bend=p.gillCurve*(x-root)*(x-root)/Math.max(1,b.w)*.17;if(k)pc.lineTo(x,top+bend);else pc.moveTo(x,top+bend);}for(var k=40;k>=0;k--){var x=root+k/40*(s.w-root),bend=p.gillCurve*(x-root)*(x-root)/Math.max(1,b.w)*.17;pc.lineTo(x,bottom+bend);}pc.closePath();pc.clip();pc.drawImage(src,0,0);
      ctx.save();ctx.translate(root,pivot);ctx.rotate((j/(p.gillCount-1)-.5)*p.gillOpen*.38);ctx.translate(-root,-pivot);ctx.drawImage(part,0,0);ctx.restore();if(globalThis.TypeDeformerRenderContext)TypeDeformerRenderContext.release(part);}if(globalThis.TypeDeformerRenderContext)TypeDeformerRenderContext.release(src);return out;
  }
  function screw(s,p,color){var cs=resample(loops(s),Math.max(1.5,s.scale)),b=bounds(s),out=canvas(s),ctx=out.getContext('2d'),steps=32,depth=Math.min(b.h*.35,70*s.scale)*p.screwDepth,view=p.screwView*Math.PI/180;
    function project(q,u){var a=p.screwTurn*Math.PI/180*u,co=Math.cos(a),si=Math.sin(a),scale=1-p.screwTaper*u,x=(q.x-b.cx)*scale,y=(q.y-b.cy)*scale;return {x:b.cx+x*co-y*si+depth*Math.cos(view)*u,y:b.cy+x*si+y*co+depth*Math.sin(view)*u};}
    ctx.fillStyle=css(color);path(ctx,cs,function(q){return project(q,1);});ctx.fill('nonzero');
    for(var layer=steps;layer>0;layer--){var u=layer/steps,v=(layer-1)/steps;cs.forEach(function(ring){var pts=ring.points;for(var i=0;i<pts.length;i++){var j=(i+1)%pts.length,a=project(pts[i],u),b=project(pts[j],u),d=project(pts[i],v),e=project(pts[j],v),light=(.25+.6*Math.abs(Math.sin(Math.atan2(b.y-a.y,b.x-a.x)-view)))*p.screwShade;ctx.fillStyle=css(color.map(function(k){return k+(255-k)*light;}));ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.75;ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(e.x,e.y);ctx.lineTo(d.x,d.y);ctx.closePath();ctx.fill();ctx.stroke();}});}
    ctx.fillStyle=css(color);path(ctx,cs);ctx.fill('nonzero');return out;
  }
  // Dirichlet Laplace solve on a square cage. Interior hole constraints may
  // pin displacement, but they do not delete the hole or its boundary loop.
  function solveCage(n,boundary,pins){var x=new Float64Array(n*n),y=new Float64Array(n*n),fixed=new Uint8Array(n*n);for(var j=0;j<n;j++)for(var i=0;i<n;i++)if(i===0||j===0||i===n-1||j===n-1){var v=boundary(i/(n-1),j/(n-1));x[j*n+i]=v[0];y[j*n+i]=v[1];fixed[j*n+i]=1;}(pins||[]).forEach(function(p){var i=clamp(Math.round(p[0]*(n-1)),1,n-2),j=clamp(Math.round(p[1]*(n-1)),1,n-2);fixed[j*n+i]=1;x[j*n+i]=p[2]||0;y[j*n+i]=p[3]||0;});var residual=Infinity,iterations=0;
    for(var it=0;it<2000;it++){var change=0;for(var parity=0;parity<2;parity++)for(var j=1;j<n-1;j++)for(var i=1;i<n-1;i++){var k=j*n+i;if(fixed[k]||(i+j)%2!==parity)continue;var dx=(x[k-1]+x[k+1]+x[k-n]+x[k+n])*.25-x[k],dy=(y[k-1]+y[k+1]+y[k-n]+y[k+n])*.25-y[k];x[k]+=1.75*dx;y[k]+=1.75*dy;change=Math.max(change,Math.abs(dx),Math.abs(dy));}iterations=it+1;if(change<1e-7)break;}
    residual=0;for(var j=1;j<n-1;j++)for(var i=1;i<n-1;i++){var k=j*n+i;if(!fixed[k])residual=Math.max(residual,Math.abs(4*x[k]-x[k-1]-x[k+1]-x[k-n]-x[k+n]),Math.abs(4*y[k]-y[k-1]-y[k+1]-y[k-n]-y[k+n]));}return {n:n,x:x,y:y,residual:residual,iterations:iterations};
  }
  function cage(s,p,c){var b=bounds(s),cs=loops(s);if(b.empty)return canvas(s);var pins=[];if(p.cageCounter>0)cs.filter(function(c){return c.area<0;}).forEach(function(c){var q=centroid(c);pins.push([(q.x-b.x)/b.w,(q.y-b.y)/b.h,0,0]);});
    function bc(x,y){var g=function(t,pos){return Math.exp(-Math.pow((t-pos)/p.cageSpan,2));};if(p.cageMode==='shear')return [(2*y-1)*.32,0];if(p.cageMode==='fan')return [(x-.5)*g(y,p.cagePosition)*.95,-g(x,p.cagePosition)*.35*(1-y)];return [(2*x-1)*g(y,x<.5?p.cagePosition:1-p.cagePosition)*.5,(2*y-1)*g(x,y<.5?1-p.cagePosition:p.cagePosition)*.28];}
    var free=solveCage(45,bc,[]),pinned=pins.length?solveCage(45,bc,pins):free;var out=filled(s,c,cs,function(q){var x=clamp((q.x-b.x)/b.w,0,.99999)*44,y=clamp((q.y-b.y)/b.h,0,.99999)*44,dx=sample(free.x,45,45,x,y)*(1-p.cageCounter)+sample(pinned.x,45,45,x,y)*p.cageCounter,dy=sample(free.y,45,45,x,y)*(1-p.cageCounter)+sample(pinned.y,45,45,x,y)*p.cageCounter;return {x:q.x+dx*Math.min(b.w,170*s.scale)*p.cagePull,y:q.y+dy*Math.min(b.h,170*s.scale)*p.cagePull};});out._cageDiagnostics={residual:Math.max(free.residual,pinned.residual),iterations:Math.max(free.iterations,pinned.iterations),pins:pins.length};return out;
  }
  root.TypeDeformerExcessBody={schemas:schemas,ids:Object.keys(schemas),renderers:{rationalCusp:rational,bladeBody:blade,blackBastion:bastion,inktrapAbyss:abyss,strangulation:strangulation,gillArray:gill,screwExtrusion:screw,harmonicCage:cage},effectPad:function(id,g){if(id==='rationalCusp')return 90;if(id==='bladeBody')return 102;if(id==='blackBastion')return 62;if(id==='inktrapAbyss')return 6;if(id==='strangulation')return 96;if(id==='harmonicCage')return 132;if(!g)return 160;if(id==='gillArray')return Math.ceil((g.w+g.h)*.27+8);return Math.ceil(.68*Math.hypot(g.w,g.h)-.5*Math.min(g.w,g.h)+90);},internals:{bounds:bounds,sample:sample,poleSet:poleSet,rationalPoint:rationalPoint,resample:resample,cuts:cuts,stranglePoint:stranglePoint,solveCage:solveCage}};
})(typeof globalThis!=='undefined'?globalThis:this);
