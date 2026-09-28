// Pre-optimization all-pairs oracle. Deliberately keeps the direct algorithm.
import '../numerical-kernels.js';
import '../repulsive-curves-body.js';
const {fieldAt,segmentDistance,localPair}=globalThis.TypeDeformerRepulsiveCurves.internals;
function dot(a,b){let value=0;for(let i=0;i<a.length;i++)value+=a[i]*b[i];return value;}
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

export {evaluate,minimize};
