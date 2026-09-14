(function(root){
  'use strict';
  // Yu, Schumacher & Crane (2021), Eqs. 3,17,18: edge-pair trapezoidal
  // tangent-point energy. The segment-clearance penalty, raster domain and
  // bounded L-BFGS solve below are independent adaptations, not their
  // fractional Sobolev/multigrid implementation.
  var schema={label:'Repulsive Curves',short:'rpc',color:'#354338',
    description:'字形を容器として、接線方向に応じた反発と長さの目標から、閉曲線を立体的にたわませます。',
    defaults:{repulsiveLength:1.55,repulsiveForce:1,repulsiveWidth:.04,repulsiveDepth:.3,repulsiveStrands:1,repulsiveBend:.6,repulsiveYaw:28,repulsiveTilt:-24},
    limits:{repulsiveLength:[1,2.2],repulsiveForce:[.15,2.5],repulsiveWidth:[.01,.08],repulsiveDepth:[.06,.6],repulsiveStrands:[1,2],repulsiveBend:[0,1],repulsiveYaw:[-180,180],repulsiveTilt:[-80,80]},
    options:{},integers:['repulsiveStrands'],
    labels:{repulsiveLength:'Length / 長さの目標',repulsiveForce:'Repulsion / 反発',repulsiveWidth:'Tube / 太さの上限',repulsiveDepth:'Depth / 容器の奥行き',repulsiveStrands:'Layers / 曲線の層数',repulsiveBend:'Bending / 曲げ抵抗',repulsiveYaw:'Yaw / 横からの視点',repulsiveTilt:'Tilt / 上下の視点'}};
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function dot(a,b){var v=0;for(var i=0;i<a.length;i++)v+=a[i]*b[i];return v;}
  function random(seed){var n=seed>>>0;return function(){n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
  function distanceTransform(mask,w,h,target){var d=new Float64Array(mask.length),sq=Math.SQRT2;for(var i=0;i<d.length;i++)d[i]=(mask[i]===target)?0:1e5;
    for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++){var i=y*w+x;d[i]=Math.min(d[i],d[i-1]+1,d[i-w]+1,d[i-w-1]+sq,d[i-w+1]+sq);}
    for(var y=h-2;y>0;y--)for(var x=w-2;x>0;x--){var i=y*w+x;d[i]=Math.min(d[i],d[i+1]+1,d[i+w]+1,d[i+w-1]+sq,d[i+w+1]+sq);}return d;
  }
  function domainFromSource(s,resolution){var I=root.TypeDeformerMetamorphicBody.internals,b=I.bounds(s);if(b.empty)return {empty:true,b:b};var R=resolution||144,D=Math.max(b.w,b.h),w=Math.ceil(b.w/D*R)+8,h=Math.ceil(b.h/D*R)+8,mask=new Uint8Array(w*h);
    for(var y=3;y<h-3;y++)for(var x=3;x<w-3;x++){var px=Math.round(b.x0+(x-3.5)*D/R),py=Math.round(b.y0+(y-3.5)*D/R);if(px>=0&&py>=0&&px<s.w&&py<s.h)mask[y*w+x]=s.alpha[py*s.w+px]>.4?1:0;}
    var inside=distanceTransform(mask,w,h,0),outside=distanceTransform(mask,w,h,1),field=new Float64Array(w*h),labels=new Int32Array(w*h).fill(-1),components=[];
    for(var i=0;i<field.length;i++)field[i]=(mask[i]?inside[i]-.5:.5-outside[i])/R;
    for(var i=0;i<mask.length;i++){if(!mask[i]||labels[i]>=0)continue;var id=components.length,queue=[i],cells=[],peak=i;labels[i]=id;for(var q=0;q<queue.length;q++){var j=queue[q];cells.push(j);if(field[j]>field[peak])peak=j;var x=j%w,y=(j/w)|0;for(var n of [j-1,j+1,j-w,j+w])if(n>=0&&n<mask.length&&Math.abs(n%w-x)+Math.abs(((n/w)|0)-y)===1&&mask[n]&&labels[n]<0){labels[n]=id;queue.push(n);}}
      components.push({cells:cells,peak:peak,clearance:field[peak]});
    }
    return {empty:!components.length,b:b,w:w,h:h,R:R,mask:mask,field:field,labels:labels,components:components,ox:(w-1)/2,oy:(h-1)/2};
  }
  // Bilinear value and exact derivative of the same sampled field.
  function fieldAt(d,x,y){var u=x*d.R+d.ox,v=y*d.R+d.oy;
    if(u<1||v<1||u>d.w-2||v>d.h-2){var cu=clamp(u,1,d.w-2),cv=clamp(v,1,d.h-2),dx=cu-u,dy=cv-v,len=Math.hypot(dx,dy)||1;return {value:-Math.hypot(dx,dy)/d.R-1/d.R,dx:dx/len,dy:dy/len};}
    var ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy,j=iy*d.w+ix,a=d.field[j],b=d.field[j+1],c=d.field[j+d.w],e=d.field[j+d.w+1];
    return {value:(a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+e*fx)*fy,dx:((b-a)*(1-fy)+(e-c)*fy)*d.R,dy:((c-a)*(1-fx)+(e-b)*fx)*d.R};
  }
  function contourLoops(mask,w,h){var edges=new Map();function add(x,y,u,v){var k=x+','+y,a=edges.get(k);if(!a)edges.set(k,a=[]);a.push([u,v]);}
    for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++)if(mask[y*w+x]){if(!mask[(y-1)*w+x])add(x,y,x+1,y);if(!mask[y*w+x+1])add(x+1,y,x+1,y+1);if(!mask[(y+1)*w+x])add(x+1,y+1,x,y+1);if(!mask[y*w+x-1])add(x,y+1,x,y);}
    var loops=[];while(edges.size){var k=edges.keys().next().value,start=k.split(',').map(Number),p=start,pts=[];for(var guard=0;guard<w*h*5;guard++){pts.push(p);var key=p[0]+','+p[1],a=edges.get(key);if(!a?.length)break;p=a.pop();if(!a.length)edges.delete(key);if(p[0]===start[0]&&p[1]===start[1])break;}if(pts.length>=4)loops.push(pts);}return loops;
  }
  function resample(points,count){var lens=[0],total=0;for(var i=0;i<points.length;i++){var a=points[i],b=points[(i+1)%points.length];total+=Math.hypot(b[0]-a[0],b[1]-a[1]);lens.push(total);}var out=[],j=0;
    for(var n=0;n<count;n++){var target=total*n/count;while(j+1<points.length&&lens[j+1]<target)j++;var a=points[j],b=points[(j+1)%points.length],f=(target-lens[j])/(lens[j+1]-lens[j]||1);out.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,0]);}return out;
  }
  function initialize(d,p,seed){var rng=random(seed),loops=[],zhalf=p.repulsiveDepth/2,layers=p.repulsiveStrands,all=[];
    d.components.forEach(function(comp){var radius=Math.min(p.repulsiveWidth/2,comp.clearance*.22,zhalf*.22),margin=radius+Math.min(.008,comp.clearance*.23),mask=new Uint8Array(d.mask.length);comp.cells.forEach(function(i){if(d.field[i]>margin)mask[i]=1;});var raw=contourLoops(mask,d.w,d.h);
      if(!raw.length){var x=(comp.peak%d.w-d.ox)/d.R,y=(((comp.peak/d.w)|0)-d.oy)/d.R,rr=comp.clearance*.5;raw=[Array.from({length:24},function(_,i){var a=i*Math.PI/12;return [(x+rr*Math.cos(a))*d.R+d.ox+.5,(y+rr*Math.sin(a))*d.R+d.oy+.5];})];}
      raw.forEach(function(ring){var points=ring.map(function(q){return [(q[0]-.5-d.ox)/d.R,(q[1]-.5-d.oy)/d.R];}),length=points.reduce(function(sum,q,i){var a=points[(i+1)%points.length];return sum+Math.hypot(a[0]-q[0],a[1]-q[1]);},0);all.push({points:points,length:length,radius:radius,comp:comp});});
    });
    var total=all.reduce(function(a,b){return a+b.length;},0),budget=220;
    all.forEach(function(a){var count=Math.max(12,Math.min(180,Math.round(budget*a.length/total/layers))),base=resample(a.points,count);
      for(var smooth=0;smooth<5;smooth++){var old=base.map(function(q){return q.slice();});for(var i=0;i<count;i++){var prev=old[(i+count-1)%count],next=old[(i+1)%count];base[i][0]=old[i][0]*.5+(prev[0]+next[0])*.25;base[i][1]=old[i][1]*.5+(prev[1]+next[1])*.25;}}
      // Resampled chords can cut across a concave glyph boundary. Move both
      // endpoints using the derivative at the violating edge sample.
      for(var repair=0;repair<80;repair++){var worst=0;for(var j=0;j<count;j++){var q=base[j],r=base[(j+1)%count];for(var ss=0;ss<5;ss++){var t=ss/4,f=fieldAt(d,q[0]*(1-t)+r[0]*t,q[1]*(1-t)+r[1]*t),target=a.radius+.003,missing=target-f.value,norm=f.dx*f.dx+f.dy*f.dy;if(missing<=0||norm<1e-8)continue;worst=Math.max(worst,missing);var v=missing/(norm*((1-t)*(1-t)+t*t));q[0]+=v*f.dx*(1-t);q[1]+=v*f.dy*(1-t);r[0]+=v*f.dx*t;r[1]+=v*f.dy*t;}}if(worst<1e-6)break;}
      for(var layer=0;layer<layers;layer++){var z=(layer-(layers-1)/2)*(2*zhalf*.8/layers),phase=rng()*Math.PI*2,points=base.map(function(q,i){return [q[0],q[1],z+Math.sin(i/count*Math.PI*8+phase)*Math.min(zhalf*.25/layers,.04)];});loops.push({points:points,radius:Math.min(a.radius,zhalf*.16/layers)});}
    });
    var positions=[],edges=[],starts=[];
    loops.forEach(function(loop,li){var start=positions.length/3;starts.push({start:start,count:loop.points.length,radius:loop.radius});loop.points.forEach(function(q){positions.push(...q);});for(var i=0;i<loop.points.length;i++){var a=start+i,b=start+(i+1)%loop.points.length,qa=loop.points[i],qb=loop.points[(i+1)%loop.points.length];edges.push({a:a,b:b,rest:Math.hypot(qb[0]-qa[0],qb[1]-qa[1],qb[2]-qa[2]),radius:loop.radius,loop:li});}});
    // Thickness adapts to local sampled geometry; expose the effective radius.
    var x=Float64Array.from(positions);for(var i=0;i<edges.length;i++)for(var j=i+1;j<edges.length;j++){var a=edges[i],b=edges[j];if(localPair(a,b,{loops:starts}))continue;var close=segmentDistance(x,a,b);var sum=a.radius+b.radius;if(sum>close.distance*.6){var scale=close.distance*.6/sum;a.radius*=scale;b.radius*=scale;}}
    return {x:x,edges:edges,loops:starts,domain:d,halfDepth:zhalf,baseLength:edges.reduce(function(sum,e){return sum+e.rest;},0)};
  }
  function initializeDisks(d,p,seed){var rng=random(seed),zhalf=p.repulsiveDepth/2,seeds=[];
    d.components.forEach(function(comp){var count=Math.max(1,Math.ceil(comp.cells.length/(d.R*d.R)*10*p.repulsiveStrands)),chosen=[];
      for(var n=0;n<count;n++){var best=null,bestScore=-1;for(var j=0;j<comp.cells.length;j++){var id=comp.cells[j],x=(id%d.w-d.ox)/d.R,y=(((id/d.w)|0)-d.oy)/d.R,available=d.field[id];for(var k=0;k<chosen.length;k++)available=Math.min(available,Math.hypot(x-chosen[k].x,y-chosen[k].y)-chosen[k].disk);var score=available*(.96+.04*Math.sin(id*1.137+seed));if(score>bestScore){bestScore=score;best={x:x,y:y,available:available};}}
        if(!best||best.available<Math.min(.006,comp.clearance*.3))break;best.disk=best.available*.82;best.radius=best.available*.62;chosen.push(best);seeds.push(best);
      }
    });
    var x=[],edges=[],loops=[],count=Math.max(24,Math.min(90,Math.floor(320/Math.max(1,seeds.length))));
    seeds.forEach(function(site,li){var start=x.length/3,phase=rng()*Math.PI*2,tilt=.3+rng()*.65,co=Math.cos(tilt),si=Math.sin(tilt),roll=rng()*Math.PI*2,cr=Math.cos(roll),sr=Math.sin(roll),r=site.radius,tube=Math.min(p.repulsiveWidth/2,r*.18,zhalf*.16),zs=Math.min(1,(zhalf-tube-.004)/(r*si)),z=(rng()-.5)*Math.max(0,zhalf-r*si*zs-tube)*.5;
      loops.push({start:start,count:count,radius:tube});
      for(var j=0;j<count;j++){var a=j/count*Math.PI*2+phase,u=r*Math.cos(a),v=r*Math.sin(a)*co;x.push(site.x+cr*u-sr*v,site.y+sr*u+cr*v,z+r*Math.sin(a)*si*zs);}
      for(var j=0;j<count;j++){var a=start+j,b=start+(j+1)%count,l=Math.hypot(x[a*3]-x[b*3],x[a*3+1]-x[b*3+1],x[a*3+2]-x[b*3+2]);edges.push({a:a,b:b,rest:l,radius:tube,loop:li});}
    });
    return {x:Float64Array.from(x),edges:edges,loops:loops,domain:d,halfDepth:zhalf,baseLength:edges.reduce(function(sum,e){return sum+e.rest;},0)};
  }
  function localPair(A,B,model){if(A.loop!==B.loop)return false;var count=model.loops[A.loop].count,d=Math.abs(A.a-B.a);d=Math.min(d,count-d);return d<=(model.localReach||2);}
  function segmentDistance(x,A,B){var a=A.a*3,b=A.b*3,c=B.a*3,d=B.b*3,ux=x[b]-x[a],uy=x[b+1]-x[a+1],uz=x[b+2]-x[a+2],vx=x[d]-x[c],vy=x[d+1]-x[c+1],vz=x[d+2]-x[c+2],wx=x[a]-x[c],wy=x[a+1]-x[c+1],wz=x[a+2]-x[c+2],aa=ux*ux+uy*uy+uz*uz,bb=ux*vx+uy*vy+uz*vz,cc=vx*vx+vy*vy+vz*vz,dd=ux*wx+uy*wy+uz*wz,ee=vx*wx+vy*wy+vz*wz,den=aa*cc-bb*bb,s=den>1e-20?clamp((bb*ee-cc*dd)/den,0,1):0,t=(bb*s+ee)/(cc||1);
    if(t<0){t=0;s=clamp(-dd/(aa||1),0,1);}else if(t>1){t=1;s=clamp((bb-dd)/(aa||1),0,1);}var dx=wx+s*ux-t*vx,dy=wy+s*uy-t*vy,dz=wz+s*uz-t*vz;
    return {distance:Math.hypot(dx,dy,dz),s:s,t:t,dx:dx,dy:dy,dz:dz};
  }
  function evaluate(x,model,factor,p,gradient){var n=x.length,g=gradient?new Float64Array(n):null,E=0,edges=model.edges,len=new Float64Array(edges.length),tx=new Float64Array(edges.length),ty=new Float64Array(edges.length),tz=new Float64Array(edges.length),rp=2e-5*p.repulsiveForce,minGap=Infinity,boundaryGap=Infinity;
    function add(i,xv,yv,zv){if(g){g[i*3]+=xv;g[i*3+1]+=yv;g[i*3+2]+=zv;}}
    for(var i=0;i<edges.length;i++){var e=edges[i],a=e.a*3,b=e.b*3,dx=x[b]-x[a],dy=x[b+1]-x[a+1],dz=x[b+2]-x[a+2],l=Math.hypot(dx,dy,dz);if(l<1e-9)return {energy:Infinity,gradient:g,minGap:0,boundaryGap:0};len[i]=l;tx[i]=dx/l;ty[i]=dy/l;tz[i]=dz/l;var target=e.rest*factor,k=35/e.rest,err=l-target;E+=.5*k*err*err;add(e.a,-k*err*tx[i],-k*err*ty[i],-k*err*tz[i]);add(e.b,k*err*tx[i],k*err*ty[i],k*err*tz[i]);
      // Five samples per polygon edge constrain the actual displayed segments.
      for(var sample=0;sample<5;sample++){var t=sample/4,qx=x[a]+dx*t,qy=x[a+1]+dy*t,qz=x[a+2]+dz*t,f=fieldAt(model.domain,qx,qy),gap=f.value-e.radius,zgap=model.halfDepth-Math.abs(qz)-e.radius;boundaryGap=Math.min(boundaryGap,gap,zgap);if(gap<=0||zgap<=0)return {energy:Infinity,gradient:g,minGap:minGap,boundaryGap:boundaryGap};
        var delta=.018,weight=2*e.rest/5;
        if(gap<delta){E+=weight*(-Math.log(gap/delta)+gap/delta-1);var deriv=weight*(1/delta-1/gap),gx=deriv*f.dx,gy=deriv*f.dy;add(e.a,gx*(1-t),gy*(1-t),0);add(e.b,gx*t,gy*t,0);}
        if(zgap<delta){E+=weight*(-Math.log(zgap/delta)+zgap/delta-1);var gz=weight*(1/delta-1/zgap)*(-Math.sign(qz));add(e.a,0,0,gz*(1-t));add(e.b,0,0,gz*t);}
      }
    }
    for(var i=0;i<edges.length;i++)for(var j=i+1;j<edges.length;j++){var A=edges[i],B=edges[j];if(A.a===B.a||A.a===B.b||A.b===B.a||A.b===B.b)continue;
      var close=segmentDistance(x,A,B),gap=close.distance-1e-5,isLocal=localPair(A,B,model);if(!isLocal){minGap=Math.min(minGap,gap);if(gap<=0)return {energy:Infinity,gradient:g,minGap:minGap,boundaryGap:boundaryGap};}
      var delta=.018,weight=.2*Math.sqrt(A.rest*B.rest);
      if(!isLocal&&gap<delta){E+=weight*(-Math.log(gap/delta)+gap/delta-1);var v=weight*(1/delta-1/gap)/close.distance,gx=v*close.dx,gy=v*close.dy,gz=v*close.dz;add(A.a,gx*(1-close.s),gy*(1-close.s),gz*(1-close.s));add(A.b,gx*close.s,gy*close.s,gz*close.s);add(B.a,-gx*(1-close.t),-gy*(1-close.t),-gz*(1-close.t));add(B.b,-gx*close.t,-gy*close.t,-gz*close.t);}
      var sum=0,dti=[0,0,0],dtj=[0,0,0],w=rp*.25*len[i]*len[j];
      for(var ai=0;ai<2;ai++)for(var bj=0;bj<2;bj++){var a=(ai?A.b:A.a),b=(bj?B.b:B.a),dx=x[a*3]-x[b*3],dy=x[a*3+1]-x[b*3+1],dz=x[a*3+2]-x[b*3+2],R2=dx*dx+dy*dy+dz*dz,R6=R2*R2*R2,inv6=1/R6,inv8=inv6/R2,gx=0,gy=0,gz=0;
        for(var side=0;side<2;side++){var k=side?j:i,Tdx=tx[k]*dx+ty[k]*dy+tz[k]*dz,C=Math.max(0,R2-Tdx*Tdx),rt=Math.sqrt(C),val=C*rt*inv6;sum+=val;
          if(g){var v=3*rt*inv6,zv=6*C*rt*inv8;gx+=v*(dx-Tdx*tx[k])-zv*dx;gy+=v*(dy-Tdx*ty[k])-zv*dy;gz+=v*(dz-Tdx*tz[k])-zv*dz;var dt=side?dtj:dti;dt[0]-=v*Tdx*dx;dt[1]-=v*Tdx*dy;dt[2]-=v*Tdx*dz;}
        }
        add(a,w*gx,w*gy,w*gz);add(b,-w*gx,-w*gy,-w*gz);
      }
      E+=w*sum;
      if(g){for(var side=0;side<2;side++){var k=side?j:i,e=side?B:A,dt=side?dtj:dti,td=dt[0]*tx[k]+dt[1]*ty[k]+dt[2]*tz[k],wl=w/len[k],gx=wl*((dt[0]-td*tx[k])+sum*tx[k]),gy=wl*((dt[1]-td*ty[k])+sum*ty[k]),gz=wl*((dt[2]-td*tz[k])+sum*tz[k]);add(e.a,-gx,-gy,-gz);add(e.b,gx,gy,gz);}}
    }
    var bend=.025*p.repulsiveBend;
    if(bend)model.loops.forEach(function(loop){for(var j=0;j<loop.count;j++){var a=loop.start+(j+loop.count-1)%loop.count,b=loop.start+j,c=loop.start+(j+1)%loop.count,k=bend/Math.pow(edges[b].rest,2);for(var axis=0;axis<3;axis++){var v=x[a*3+axis]-2*x[b*3+axis]+x[c*3+axis];E+=.5*k*v*v;if(g){g[a*3+axis]+=k*v;g[b*3+axis]-=2*k*v;g[c*3+axis]+=k*v;}}}});
    return {energy:E,gradient:g,minGap:minGap,boundaryGap:boundaryGap};
  }
  function minimize(model,p,iterations){var x=Float64Array.from(model.x),history=[],memory=[],factor=1,iterations=iterations||170,accepted=0,rejected=0,start=evaluate(x,model,1,p,true);
    if(!Number.isFinite(start.energy))return {x:x,history:[],initialValid:false,diagnostics:{energy:start.energy,minGap:start.minGap,boundaryGap:start.boundaryGap,vertices:x.length/3,loops:model.loops.length}};
    for(var step=0;step<iterations;step++){factor=1+(p.repulsiveLength-1)*Math.min(1,(step+1)/(iterations*.72));var state=evaluate(x,model,factor,p,true);if(!Number.isFinite(state.energy))break;var grad=state.gradient,q=Float64Array.from(grad),alphas=[];
      for(var m=memory.length-1;m>=0;m--){var item=memory[m],a=item.rho*dot(item.s,q);alphas[m]=a;for(var k=0;k<q.length;k++)q[k]-=a*item.y[k];}
      var scale=memory.length?1/memory[memory.length-1].rho/dot(memory[memory.length-1].y,memory[memory.length-1].y):.0003;
      for(var k=0;k<q.length;k++)q[k]*=scale;
      for(var m=0;m<memory.length;m++){var item=memory[m],b=item.rho*dot(item.y,q);for(var k=0;k<q.length;k++)q[k]+=item.s[k]*(alphas[m]-b);}
      var gd=0,max=0;for(var k=0;k<q.length;k++){q[k]=-q[k];gd+=grad[k]*q[k];}for(var k=0;k<q.length;k+=3)max=Math.max(max,Math.hypot(q[k],q[k+1],q[k+2]));
      if(!(gd<0)){memory=[];q=Float64Array.from(grad,function(v){return -v*.0003;});gd=-dot(grad,grad)*.0003;max=0;for(var k=0;k<q.length;k+=3)max=Math.max(max,Math.hypot(q[k],q[k+1],q[k+2]));}
      // Armijo decrease with a displacement cap. This is not continuous collision detection; no isotopy guarantee.
      var tau=Math.min(1,.012/Math.max(max,1e-12)),next,trial;
      for(var back=0;back<12;back++){next=Float64Array.from(x,function(v,k){return v+q[k]*tau;});trial=evaluate(next,model,factor,p,false);if(trial.energy<=state.energy+1e-4*tau*gd)break;tau*=.5;rejected++;}
      if(!(trial.energy<=state.energy+1e-4*tau*gd))continue;
      var nextGrad=evaluate(next,model,factor,p,true).gradient,ss=Float64Array.from(x,function(v,k){return next[k]-v;}),yy=Float64Array.from(grad,function(v,k){return nextGrad[k]-v;}),sy=dot(ss,yy);
      if(sy>1e-14){memory.push({s:ss,y:yy,rho:1/sy});if(memory.length>5)memory.shift();}x=next;accepted++;
      if(step%20===0||step===iterations-1)history.push({step:step,energy:trial.energy,minGap:trial.minGap,boundaryGap:trial.boundaryGap,factor:factor});
    }
    var final=evaluate(x,model,p.repulsiveLength,p,false),length=model.edges.reduce(function(sum,e){return sum+Math.hypot(x[e.a*3]-x[e.b*3],x[e.a*3+1]-x[e.b*3+1],x[e.a*3+2]-x[e.b*3+2]);},0);
    return {x:x,history:history,initialValid:true,diagnostics:{accepted:accepted,rejected:rejected,vertices:x.length/3,loops:model.loops.length,initialLength:model.baseLength,actualLength:length,targetLength:model.baseLength*p.repulsiveLength,achievedFactor:length/model.baseLength,minGap:final.minGap,boundaryGap:final.boundaryGap,energy:final.energy}};
  }
  // Rounded display corners are a bounded post-process of the optimized
  // polygon. The scientific diagnostics refer to that polygon, not a spline.
  function displayCurve(model,result){var x=[],edges=[],loops=[],radii=[],source=result.x;
    model.loops.forEach(function(loop,li){var start=x.length/3,count=loop.count*4;loops.push({start:start,count:count,radius:loop.radius});
      for(var j=0;j<loop.count;j++){var a=(loop.start+(j+loop.count-1)%loop.count)*3,b=(loop.start+j)*3,c=(loop.start+(j+1)%loop.count)*3,rr=Math.min(model.edges[loop.start+j].radius,model.edges[loop.start+(j+loop.count-1)%loop.count].radius);
        for(var k=0;k<4;k++){var t=k/3,pt=[];for(var axis=0;axis<3;axis++){var P=source[b+axis]*.73+source[a+axis]*.27,Q=source[b+axis]*.73+source[c+axis]*.27;pt.push(P*(1-t)*(1-t)+2*source[b+axis]*t*(1-t)+Q*t*t);}var field=fieldAt(model.domain,pt[0],pt[1]);for(var repair=0;repair<12&&field.value<.0001;repair++){for(var axis=0;axis<3;axis++)pt[axis]=(pt[axis]+source[b+axis])*.5;field=fieldAt(model.domain,pt[0],pt[1]);}x.push(...pt);radii.push(Math.max(1e-7,Math.min(rr,field.value*.8,(model.halfDepth-Math.abs(pt[2]))*.8)));}
      }
      for(var j=0;j<count;j++){var a=start+j,b=start+(j+1)%count;edges.push({a:a,b:b,loop:li,radius:Math.min(radii[a],radii[b]),rest:0});}
    });return {x:Float64Array.from(x),edges:edges,loops:loops,localReach:8};
  }
  function tubeMesh(model,result){var mesh={v:[],t:[],diagnostics:result.diagnostics},smooth=displayCurve(model,result);model=smooth;var x=smooth.x,sides=8;
    var radii=model.edges.map(function(e){return e.radius;});
    for(var i=0;i<model.edges.length;i++)for(var j=i+1;j<model.edges.length;j++)if(!localPair(model.edges[i],model.edges[j],model)){var cap=.4*segmentDistance(x,model.edges[i],model.edges[j]).distance;radii[i]=Math.min(radii[i],cap);radii[j]=Math.min(radii[j],cap);}
    function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
    function unit(v){var n=Math.hypot(...v)||1;return v.map(function(q){return q/n;});}
    function transport(n,a,b){var v=cross(a,b),c=dot(a,b),v1=cross(v,n),v2=cross(v,v1),q=c<-.9999?n.slice():n.map(function(z,k){return z+v1[k]+v2[k]/(1+c);}),d=dot(q,b);return unit(q.map(function(z,k){return z-d*b[k];}));}
    model.loops.forEach(function(loop){var base=mesh.v.length,count=loop.count,r=loop.radius;
      var tangents=[],normals=[];for(var j=0;j<count;j++){var a=(loop.start+(j+count-1)%count)*3,c=(loop.start+(j+1)%count)*3;tangents.push(unit([x[c]-x[a],x[c+1]-x[a+1],x[c+2]-x[a+2]]));}
      var t0=tangents[0],axis=Math.abs(t0[0])<.8?[1,0,0]:[0,1,0];normals.push(unit(cross(t0,axis)));for(var j=1;j<count;j++)normals.push(transport(normals[j-1],tangents[j-1],tangents[j]));var end=transport(normals[count-1],tangents[count-1],t0),twist=Math.atan2(dot(t0,cross(end,normals[0])),dot(end,normals[0]));
      for(var j=0;j<count;j++){var r=Math.min(radii[loop.start+j],radii[loop.start+(j+count-1)%count]),b=(loop.start+j)*3,T=tangents[j],N=normals[j],B=cross(T,N),angle=twist*j/count,co=Math.cos(angle),si=Math.sin(angle);N=N.map(function(z,k){return z*co+B[k]*si;});B=cross(T,N);var nx=N[0],ny=N[1],nz=N[2],bx=B[0],by=B[1],bz=B[2];
        for(var k=0;k<sides;k++){var angle=k/sides*Math.PI*2,co=Math.cos(angle),si=Math.sin(angle),u=nx*co+bx*si,v=ny*co+by*si,w=nz*co+bz*si;mesh.v.push([x[b]+u*r,x[b+1]+v*r,x[b+2]+w*r,-1,-1,u,v,w]);}
      }
      for(var j=0;j<count;j++)for(var k=0;k<sides;k++){var a=base+j*sides+k,b=base+j*sides+(k+1)%sides,c=base+(j+1)%count*sides+k,d=base+(j+1)%count*sides+(k+1)%sides;mesh.t.push([a,b,d],[a,d,c]);}
    });return mesh;
  }
  var cache=new Map();
  function prepareModel(domain,p,seed){var model=initialize(domain,p,seed);model.initialization='contours';if(!Number.isFinite(evaluate(model.x,model,1,p,false).energy)){model=initializeDisks(domain,p,seed);model.initialization='interior rings';}return model;}
  function construct(s,p,seed){var domain=domainFromSource(s);if(domain.empty)return {empty:true,domain:domain};seed=seed==null?17:seed;var h=2166136261;for(var i=0;i<domain.mask.length;i++)h=Math.imul(h^domain.mask[i],16777619);var key=[h,domain.w,domain.h,p.repulsiveLength,p.repulsiveForce,p.repulsiveWidth,p.repulsiveDepth,p.repulsiveStrands,p.repulsiveBend,seed].join('|'),hit=cache.get(key);if(hit)return {domain:domain,model:hit.model,result:hit.result,cached:true};var model=prepareModel(domain,p,seed),result=minimize(model,p);result.diagnostics.initialization=model.initialization;if(!result.initialValid)return {empty:true,domain:domain,failure:result.diagnostics};if(cache.size>=12)cache.delete(cache.keys().next().value);cache.set(key,{model:model,result:result});return {domain:domain,model:model,result:result,cached:false};}
  function render(s,p,color,accent,seed){var q=construct(s,p,seed==null?17:seed);if(q.empty){var c=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));c.width=s.w;c.height=s.h;c._repulsiveDiagnostics=q.failure||{empty:true};return c;}var template=q.result.meshTemplate||(q.result.meshTemplate=tubeMesh(q.model,q.result)),mesh={v:template.v.map(function(v){return v.slice();}),t:template.t,diagnostics:template.diagnostics},out=root.TypeDeformerMetamorphicBody.internals.renderMesh(s,q.domain.b,mesh,color,p.repulsiveYaw,p.repulsiveTilt);out._repulsiveDiagnostics=q.result.diagnostics;return out;}
  root.TypeDeformerRepulsiveCurves={schemas:{repulsiveCurves:schema},ids:['repulsiveCurves'],renderers:{repulsiveCurves:render},effectPad:function(id,g){return Math.ceil((g?Math.max(g.w,g.h):180)*1.1+12);},internals:{distanceTransform:distanceTransform,domainFromSource:domainFromSource,fieldAt:fieldAt,contourLoops:contourLoops,resample:resample,initialize:initialize,prepareModel:prepareModel,segmentDistance:segmentDistance,localPair:localPair,evaluate:evaluate,minimize:minimize,displayCurve:displayCurve,tubeMesh:tubeMesh,construct:construct}};
})(typeof globalThis!=='undefined'?globalThis:this);
