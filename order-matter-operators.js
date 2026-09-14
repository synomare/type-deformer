(function(root){
  'use strict';
  // Original implementations of multigrid dual geometry and planar nematic
  // relaxation. The source/approximation contract accompanies integration.
  var schemas={
    quasicrystalBody:{label:'Quasicrystal Body',short:'qcb',color:'#3b554b',description:'周期の揃わない多重格子から菱形の結晶面を接続し、字形の立体を切り出します。',
      options:{quasiMode:['pentagrid','octagrid','heptagrid']},limits:{quasiCell:[4,30],quasiDepth:[0,50],quasiPhason:[-2,2],quasiRotation:[-90,90],quasiLight:[-180,180]},
      defaults:{quasiMode:'pentagrid',quasiCell:10,quasiDepth:23,quasiPhason:.25,quasiRotation:12,quasiLight:-55},
      labels:{quasiMode:'Order / 結晶の秩序',quasiCell:'Edge / 菱形の大きさ',quasiDepth:'Relief / 隆起',quasiPhason:'Phason / 配列の組替え',quasiRotation:'Lattice / 格子の角度',quasiLight:'Light / 光の方向'}},
    nematicFilm:{label:'Nematic Film',short:'nmf',color:'#263b59',description:'字形の境界に分子の向きを沿わせ、液晶の欠陥と偏光による色を描きます。',
      options:{nematicMode:['crossed','compensated','parallel']},limits:{nematicDomain:[4,32],nematicAnneal:[0,1],nematicAnchor:[0,6],nematicRetardance:[0,3],nematicPolarizer:[-90,90]},
      defaults:{nematicMode:'crossed',nematicDomain:11,nematicAnneal:.45,nematicAnchor:2.4,nematicRetardance:1.25,nematicPolarizer:18},
      labels:{nematicMode:'Optics / 偏光の組合せ',nematicDomain:'Domains / 向きの領域',nematicAnneal:'Annealing / 向きの緩和',nematicAnchor:'Anchoring / 字画への結合',nematicRetardance:'Thickness / 光学的な厚み',nematicPolarizer:'Polarizer / 偏光板の角度'}}
  };
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function rng(seed){var v=seed>>>0;return function(){v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};}
  function canvas(w,h){var c=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));c.width=w;c.height=h;return c;}
  function sample(a,w,h,x,y){x=clamp(x,0,w-1.001);y=clamp(y,0,h-1.001);var ix=x|0,iy=y|0,dx=x-ix,dy=y-iy,i=iy*w+ix;return (a[i]*(1-dx)+a[i+1]*dx)*(1-dy)+(a[i+w]*(1-dx)+a[i+w+1]*dx)*dy;}
  function distance(a,w,h){var d=new Float32Array(w*h),r=Math.SQRT2;for(var i=0;i<d.length;i++)d[i]=a[i]>.5?1e5:0;for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++){var i=y*w+x;d[i]=Math.min(d[i],d[i-1]+1,d[i-w]+1,d[i-w-1]+r,d[i-w+1]+r);}for(var y=h-2;y>0;y--)for(var x=w-2;x>0;x--){var i=y*w+x;d[i]=Math.min(d[i],d[i+1]+1,d[i+w]+1,d[i+w-1]+r,d[i+w+1]+r);}return d;}
  function bounds(s){var x0=s.w,y0=s.h,x1=0,y1=0;for(var y=0;y<s.h;y++)for(var x=0;x<s.w;x++)if(s.alpha[y*s.w+x]>.01){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return x0>x1?null:[x0/s.scale,y0/s.scale,(x1+1)/s.scale,(y1+1)/s.scale];}
  function mix(a,b,t){return a.map(function(v,i){return v+(b[i]-v)*t;});}

  // Each intersection of two grid families corresponds to one dual rhomb.
  // Shared integer K-vectors give shared vertices, independent of tile order.
  function multigrid(w,h,edge,n,rotation,phason,seed,clip){
    var random=rng(seed),axes=[],gamma=[],sum=0,theta=rotation*Math.PI/180;
    for(var j=0;j<n;j++){var t=(n%2?2:1)*Math.PI*j/n+theta;axes.push([Math.cos(t),Math.sin(t)]);var g=random()-.5+phason*Math.cos(4*Math.PI*j/n+.371);gamma.push(g);sum+=g;}
    for(var j=0;j<n;j++)gamma[j]-=sum/n; // zero-sum pentagrid offsets
    var eta=[0,0],axisSum=[0,0];for(var j=0;j<n;j++){eta[0]+=gamma[j]*axes[j][0];eta[1]+=gamma[j]*axes[j][1];axisSum[0]+=axes[j][0];axisSum[1]+=axes[j][1];}
    var center=[w/2,h/2],region=clip||[0,0,w,h],lim=[],verts=new Map(),tiles=[];
    var extX=Math.max(Math.abs(region[0]-center[0]),Math.abs(region[2]-center[0]))/edge+n;
    var extY=Math.max(Math.abs(region[1]-center[1]),Math.abs(region[3]-center[1]))/edge+n;
    for(var j=0;j<n;j++)lim[j]=Math.ceil(2*(Math.abs(axes[j][0])*extX+Math.abs(axes[j][1])*extY)/n+Math.abs(gamma[j])+2);
    function vertex(k){var key=k.join(','),v=verts.get(key);if(v)return v;var x=-eta[0]-axisSum[0]/2,y=-eta[1]-axisSum[1]/2,hash=2166136261;for(var a=0;a<n;a++){x+=k[a]*axes[a][0];y+=k[a]*axes[a][1];hash=Math.imul(hash^(k[a]+32768),16777619);}v={x:center[0]+x*edge,y:center[1]+y*edge,key:key,k:k.slice(),hash:hash>>>0};verts.set(key,v);return v;}
    for(var r=0;r<n;r++)for(var t=r+1;t<n;t++){
      var a=axes[r],b=axes[t],det=a[0]*b[1]-a[1]*b[0];if(Math.abs(det)<1e-9)continue;
      for(var kr=-lim[r];kr<=lim[r];kr++)for(var kt=-lim[t];kt<=lim[t];kt++){
        var ur=kr-gamma[r],ut=kt-gamma[t],x=(ur*b[1]-a[1]*ut)/det,y=(a[0]*ut-ur*b[0])/det;
        // Bound in the approximately linear dual plane before allocating K.
        if(Math.abs(x*n/2)>extX||Math.abs(y*n/2)>extY)continue;
        var k=[];for(var j=0;j<n;j++)k[j]=j===r?kr:j===t?kt:Math.ceil(x*axes[j][0]+y*axes[j][1]+gamma[j]-1e-10);
        var coords=[],base=k.slice();coords.push(vertex(k));k=k.slice();k[r]++;coords.push(vertex(k));k=k.slice();k[t]++;coords.push(vertex(k));k=base.slice();k[t]++;coords.push(vertex(k));
        var xs=coords.map(function(v){return v.x;}),ys=coords.map(function(v){return v.y;});
        if(Math.max.apply(null,xs)<region[0]-edge||Math.min.apply(null,xs)>region[2]+edge||Math.max.apply(null,ys)<region[1]-edge||Math.min.apply(null,ys)>region[3]+edge)continue;
        tiles.push({v:coords,families:[r,t],area:Math.abs(det)*edge*edge});
        if(tiles.length>40000)throw Error('Quasicrystal geometry exceeds 40K rhombs');
      }
    }
    return {tiles:tiles,vertices:verts,axes:axes,gamma:gamma,edge:edge,n:n};
  }
  function barycentric(v,x,y){var a=v[0],b=v[1],c=v[2],det=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(det)<1e-10)return null;var u=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/det,w=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/det;return [u,w,1-u-w];}
  function normal(v){var a=v[0],b=v[1],c=v[2],u=[b.x-a.x,b.y-a.y,b.z-a.z],w=[c.x-a.x,c.y-a.y,c.z-a.z],n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],len=Math.hypot.apply(null,n)||1;if(n[2]<0)len=-len;return n.map(function(x){return x/len;});}
  function liftMesh(mesh,depth,seed){var lift=[],total=0,n=mesh.n;for(var j=0;j<n;j++){var c=Math.cos((n%2?4:3)*Math.PI*j/n+seed*.013);lift.push(c);total+=Math.abs(c);}mesh.vertices.forEach(function(v){var z=0;for(var j=0;j<n;j++)z+=lift[j]*(v.k[j]-mesh.gamma[j]-.5);v.z=depth*(.65+z/total);});return lift;}
  function crystal(s,p,color,accent,seed){
    var out=canvas(s.w,s.h),ctx=out.getContext('2d'),box=bounds(s);if(!box)return out;
    var w=s.w/s.scale,h=s.h/s.scale,edge=Math.max(p.quasiCell,Math.sqrt((box[2]-box[0])*(box[3]-box[1])/18000)),n=p.quasiMode==='octagrid'?4:p.quasiMode==='heptagrid'?7:5;
    var mesh=multigrid(w,h,edge,n,p.quasiRotation,p.quasiPhason,seed,box),height=new Float32Array(s.w*s.h),zbuf=new Float32Array(s.w*s.h);zbuf.fill(-1e9);
    // A height linear in the integer lift K keeps every rhomb planar and every
    // shared edge connected. The coefficient is perpendicular to both physical
    // projection axes, so the height stays bounded instead of forming a ramp.
    liftMesh(mesh,p.quasiDepth,seed);
    var presentationFaces=[],im=ctx.createImageData(s.w,s.h),projX=.34,projY=-.54,la=p.quasiLight*Math.PI/180,light=[Math.cos(la)*.66,Math.sin(la)*.66,.75],half=[light[0]-projX,light[1]-projY,light[2]+1],hlen=Math.hypot.apply(null,half);half=half.map(function(v){return v/hlen;});
    function draw(v,ink,top){
      var q=v.map(function(a){return {x:(a.x+projX*a.z)*s.scale,y:(a.y+projY*a.z)*s.scale};}),norm=normal(v),diff=Math.max(0,norm[0]*light[0]+norm[1]*light[1]+norm[2]*light[2]),spec=Math.pow(Math.max(0,norm[0]*half[0]+norm[1]*half[1]+norm[2]*half[2]),22)*.65;
      var rgb=ink.map(function(c){return clamp(c*(.32+.83*diff)+215*spec,0,255);}),x0=Math.max(0,Math.floor(Math.min(q[0].x,q[1].x,q[2].x))),x1=Math.min(s.w-1,Math.ceil(Math.max(q[0].x,q[1].x,q[2].x))),y0=Math.max(0,Math.floor(Math.min(q[0].y,q[1].y,q[2].y))),y1=Math.min(s.h-1,Math.ceil(Math.max(q[0].y,q[1].y,q[2].y)));
      presentationFaces.push({v:v.map(function(p,i){return {x:q[i].x,y:q[i].y,z:p.z-projX*p.x-projY*p.y,u:p.x,v:p.y};}),ink:rgb,mask:top});
      for(var y=y0;y<=y1;y++)for(var x=x0;x<=x1;x++){
        var b=barycentric(q,x+.5,y+.5);if(!b||Math.min.apply(null,b)<-1e-6)continue;
        var u=b[0]*v[0].x+b[1]*v[1].x+b[2]*v[2].x,yy=b[0]*v[0].y+b[1]*v[1].y+b[2]*v[2].y,z=b[0]*v[0].z+b[1]*v[1].z+b[2]*v[2].z,depth=z-projX*u-projY*yy,at=y*s.w+x;
        if(depth<zbuf[at]-.0001)continue;var alpha=top?sample(s.alpha,s.w,s.h,u*s.scale-.5,yy*s.scale-.5):1;if(alpha<.01)continue;zbuf[at]=depth;
        var oldAlpha=im.data[at*4+3]/255,combined=alpha+oldAlpha*(1-alpha);for(var k=0;k<3;k++)im.data[at*4+k]=(rgb[k]*alpha+im.data[at*4+k]*oldAlpha*(1-alpha))/combined;im.data[at*4+3]=combined*255;
      }
    }
    var triangles=[];mesh.tiles.forEach(function(tile){var hue=((tile.families[0]*3+tile.families[1])%7)/6,ink=mix(mix(color,[199,170,94],.38),accent,hue*.28);
      [[0,1,2],[0,2,3]].forEach(function(ids){var v=ids.map(function(i){return tile.v[i];});triangles.push({v:v,ink:ink});
        var x0=Math.max(0,Math.floor(Math.min(v[0].x,v[1].x,v[2].x)*s.scale)),x1=Math.min(s.w-1,Math.ceil(Math.max(v[0].x,v[1].x,v[2].x)*s.scale)),y0=Math.max(0,Math.floor(Math.min(v[0].y,v[1].y,v[2].y)*s.scale)),y1=Math.min(s.h-1,Math.ceil(Math.max(v[0].y,v[1].y,v[2].y)*s.scale));
        for(var y=y0;y<=y1;y++)for(var x=x0;x<=x1;x++){var b=barycentric(v,(x+.5)/s.scale,(y+.5)/s.scale);if(b&&Math.min.apply(null,b)>=-1e-6)height[y*s.w+x]=b[0]*v[0].z+b[1]*v[1].z+b[2]*v[2].z;}
      });
    });
    // Marching squares of the actual glyph form the extruded exterior and
    // counter walls; top faces remain the shared multigrid mesh.
    var segments={1:[[3,0]],2:[[0,1]],3:[[3,1]],4:[[1,2]],5:[[3,0],[1,2]],6:[[0,2]],7:[[3,2]],8:[[2,3]],9:[[2,0]],10:[[0,1],[2,3]],11:[[2,1]],12:[[1,3]],13:[[1,0]],14:[[0,3]]};
    if(p.quasiDepth>0)for(var y=Math.floor(box[1])-1;y<=Math.ceil(box[3]);y++)for(var x=Math.floor(box[0])-1;x<=Math.ceil(box[2]);x++){
      var pts=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]],a=pts.map(function(v){return sample(s.alpha,s.w,s.h,v[0]*s.scale-.5,v[1]*s.scale-.5);}),code=(a[0]>.5?1:0)+(a[1]>.5?2:0)+(a[2]>.5?4:0)+(a[3]>.5?8:0),lines=segments[code];if(!lines)continue;
      function hit(e){var j=(e+1)%4,t=clamp((.5-a[e])/(a[j]-a[e]),0,1),u=pts[e][0]+t*(pts[j][0]-pts[e][0]),v=pts[e][1]+t*(pts[j][1]-pts[e][1]);return {x:u,y:v,z:sample(height,s.w,s.h,u*s.scale-.5,v*s.scale-.5)};}
      lines.forEach(function(seg){var a=hit(seg[0]),b=hit(seg[1]),aa={x:a.x,y:a.y,z:0},bb={x:b.x,y:b.y,z:0},ink=mix(color,[75,52,28],.35);draw([aa,bb,b],ink,false);draw([aa,b,a],ink,false);});
    }
    triangles.forEach(function(t){draw(t.v,t.ink,true);});ctx.putImageData(im,0,0);if(root.TypeDeformerRenderContext){var RC=root.TypeDeformerRenderContext,highAlpha=RC.alphaSampler(s.canvas);RC.shadedMesh(out,presentationFaces,function(t,wa,wb,wc,rgba){var a=t.v[0],b=t.v[1],c=t.v[2];for(var k=0;k<3;k++)rgba[k]=t.ink[k];rgba[3]=255*(t.mask?highAlpha((a.u*wa+b.u*wb+c.u*wc)*s.scale,(a.v*wa+b.v*wb+c.v*wc)*s.scale):1);},{blend:true});}return out;
  }

  // q=(S cos(2 theta), S sin(2 theta)) respects the head-tail symmetry of a
  // planar nematic. A boundary penalty couples q to the glyph's tangent.
  function nematicGrid(s,p,seed){
    var step=Math.max(1,Math.sqrt(s.w*s.h/(s.scale*s.scale*260000))),w=Math.ceil(s.w/s.scale/step),h=Math.ceil(s.h/s.scale/step),mask=new Float32Array(w*h),active=[],inside=new Uint8Array(w*h),boundary=new Float32Array(w*h),gx=new Float32Array(w*h),gy=new Float32Array(w*h),qx=new Float32Array(w*h),qy=new Float32Array(w*h);
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){var i=y*w+x;mask[i]=sample(s.alpha,s.w,s.h,(x+.5)*step*s.scale-.5,(y+.5)*step*s.scale-.5);if(mask[i]>.25){inside[i]=1;active.push(i);}}
    var d=distance(mask,w,h),random=rng(seed),domain=p.nematicDomain/step,nw=Math.ceil(w/domain)+2,nh=Math.ceil(h/domain)+2,nx=new Float32Array(nw*nh),ny=new Float32Array(nw*nh);
    for(var i=0;i<nx.length;i++){var a=random()*2*Math.PI;nx[i]=Math.cos(a);ny[i]=Math.sin(a);}
    active.forEach(function(i){var x=i%w,y=Math.floor(i/w);qx[i]=sample(nx,nw,nh,x/domain,y/domain)*.85;qy[i]=sample(ny,nw,nh,x/domain,y/domain)*.85;
      var miss=(x===0||!inside[i-1]?1:0)+(x===w-1||!inside[i+1]?1:0)+(y===0||!inside[i-w]?1:0)+(y===h-1||!inside[i+w]?1:0);boundary[i]=miss*.5;
      var dx=sample(mask,w,h,x+1,y)-sample(mask,w,h,x-1,y),dy=sample(mask,w,h,x,y+1)-sample(mask,w,h,x,y-1),mag=dx*dx+dy*dy;
      if(mag<1e-9){gx[i]=1;gy[i]=0;}else{gx[i]=(dy*dy-dx*dx)/mag;gy[i]=-2*dx*dy/mag;}
    });
    return {w:w,h:h,step:step,mask:mask,inside:inside,active:active,boundary:boundary,gx:gx,gy:gy,qx:qx,qy:qy,d:d,kappa:1,bulk:.18,anchor:p.nematicAnchor};
  }
  function energy(g){var e=0,w=g.w;g.active.forEach(function(i){var x=g.qx[i],y=g.qy[i],r=x*x+y*y-1;e+=g.bulk*.25*r*r+g.anchor*.5*g.boundary[i]*((x-g.gx[i])**2+(y-g.gy[i])**2);if(i%w<w-1&&g.inside[i+1])e+=g.kappa*.5*((x-g.qx[i+1])**2+(y-g.qy[i+1])**2);if(i<g.w*(g.h-1)&&g.inside[i+w])e+=g.kappa*.5*((x-g.qx[i+w])**2+(y-g.qy[i+w])**2);});return e;}
  function relax(g,iterations,record){
    var tx=new Float32Array(g.w*g.h),ty=new Float32Array(g.w*g.h),dt=.9/(8*g.kappa+2*g.bulk+2*g.anchor),history=record?[energy(g)]:null,w=g.w;
    for(var t=0;t<iterations;t++){
      for(var at=0;at<g.active.length;at++){var i=g.active[at],x=g.qx[i],y=g.qy[i],sx=0,sy=0,degree=0,j;
        j=i-1;if(i%w>0&&g.inside[j]){sx+=g.qx[j];sy+=g.qy[j];degree++;}j=i+1;if(i%w<w-1&&g.inside[j]){sx+=g.qx[j];sy+=g.qy[j];degree++;}j=i-w;if(i>=w&&g.inside[j]){sx+=g.qx[j];sy+=g.qy[j];degree++;}j=i+w;if(i<w*(g.h-1)&&g.inside[j]){sx+=g.qx[j];sy+=g.qy[j];degree++;}
        var reaction=g.bulk*(x*x+y*y-1),a=x-dt*(g.kappa*(degree*x-sx)+reaction*x+g.anchor*g.boundary[i]*(x-g.gx[i])),b=y-dt*(g.kappa*(degree*y-sy)+reaction*y+g.anchor*g.boundary[i]*(y-g.gy[i])),norm=Math.max(1,Math.hypot(a,b));tx[i]=a/norm;ty[i]=b/norm;
      }
      var old=g.qx;g.qx=tx;tx=old;old=g.qy;g.qy=ty;ty=old;if(history)history.push(energy(g));
    }
    return history;
  }
  function retarder(exr,exi,eyr,eyi,theta,delta){
    // J = cos(delta/2) I - i sin(delta/2) Q(theta), fast axis at theta.
    var c=Math.cos(delta/2),s=Math.sin(delta/2),a=Math.cos(2*theta),b=Math.sin(2*theta);
    return [c*exr+s*(a*exi+b*eyi),c*exi-s*(a*exr+b*eyr),c*eyr+s*(b*exi-a*eyi),c*eyi-s*(b*exr-a*eyr)];
  }
  function jones(theta,delta,polarizer,mode){var e=retarder(Math.cos(polarizer),0,Math.sin(polarizer),0,theta,delta);if(mode==='compensated')e=retarder(e[0],e[1],e[2],e[3],polarizer+Math.PI/4,Math.PI/2);var a=polarizer+(mode==='parallel'?0:Math.PI/2),c=Math.cos(a),s=Math.sin(a),re=e[0]*c+e[2]*s,im=e[1]*c+e[3]*s;return re*re+im*im;}
  function film(s,p,color,accent,seed){
    var out=canvas(s.w,s.h),ctx=out.getContext('2d'),g=nematicGrid(s,p,seed);if(!g.active.length)return out;relax(g,Math.round(p.nematicAnneal*500));var im=ctx.createImageData(s.w,s.h),angle=p.nematicPolarizer*Math.PI/180,wavelength=[650/550,1,450/550],tint=mix(color,accent,.22);
    for(var y=0;y<s.h;y++)for(var x=0;x<s.w;x++){var i=y*s.w+x,alpha=s.alpha[i];if(alpha<.005)continue;var u=(x+.5)/(s.scale*g.step)-.5,v=(y+.5)/(s.scale*g.step)-.5,qx=sample(g.qx,g.w,g.h,u,v),qy=sample(g.qy,g.w,g.h,u,v),order=Math.hypot(qx,qy),theta=.5*Math.atan2(qy,qx),d=sample(g.d,g.w,g.h,u,v)*g.step,thickness=.13+.87*(1-Math.exp(-d/6));
      for(var k=0;k<3;k++){var intensity=jones(theta,2*Math.PI*p.nematicRetardance*order*thickness/wavelength[k],angle,p.nematicMode);im.data[i*4+k]=clamp(12+tint[k]*.14+230*Math.pow(clamp(intensity,0,1),.7),0,255);}im.data[i*4+3]=alpha*255;
    }
    if(root.TypeDeformerRenderContext){var RC=root.TypeDeformerRenderContext,highAlpha=RC.alphaSampler(s.canvas);RC.field(im,function(px,py,rgba){var x=px-.5,y=py-.5;var i=y*s.w+x,alpha=highAlpha(x+.5,y+.5);if(alpha<.005)return;var u=(x+.5)/(s.scale*g.step)-.5,v=(y+.5)/(s.scale*g.step)-.5,qx=sample(g.qx,g.w,g.h,u,v),qy=sample(g.qy,g.w,g.h,u,v),order=Math.hypot(qx,qy),theta=.5*Math.atan2(qy,qx),d=sample(g.d,g.w,g.h,u,v)*g.step,thickness=.13+.87*(1-Math.exp(-d/6));
      for(var k=0;k<3;k++){var intensity=jones(theta,2*Math.PI*p.nematicRetardance*order*thickness/wavelength[k],angle,p.nematicMode);rgba[k]=clamp(12+tint[k]*.14+230*Math.pow(clamp(intensity,0,1),.7),0,255);}rgba[3]=alpha*255;
    });}
    ctx.putImageData(im,0,0);return out;
  }
  root.TypeDeformerOrderMatter={schemas:schemas,ids:Object.keys(schemas),renderers:{quasicrystalBody:crystal,nematicFilm:film},effectPad:function(){return 60;},internals:{multigrid:multigrid,liftMesh:liftMesh,barycentric:barycentric,nematicGrid:nematicGrid,relax:relax,energy:energy,retarder:retarder,jones:jones}};
})(typeof globalThis!=='undefined'?globalThis:this);
