(function(root){
  'use strict';
  // Original finite-element metric flow and polynomial-preimage bodies.
  // See ramified-body-research.md for equations, references and approximations.
  var schemas={
    beltramiFlow:{label:'Beltrami Flow',short:'btf',color:'#1c2936',
      description:'局所ごとの伸縮方向を有限要素法で解き、穴と外周を同じ場で巻き替えます。',
      options:{beltramiMode:['vortex','saddle','braid']},integers:[],
      defaults:{beltramiMode:'vortex',beltramiAmount:2.1,beltramiAnisotropy:.62,beltramiAngle:78,beltramiFocusX:0,beltramiFocusY:0,beltramiDomain:.74},
      limits:{beltramiAmount:[0,4],beltramiAnisotropy:[0,.76],beltramiAngle:[-180,180],beltramiFocusX:[-.42,.42],beltramiFocusY:[-.42,.42],beltramiDomain:[.56,1.05]},
      labels:{beltramiMode:'Field / 伸縮場',beltramiAmount:'Evolution / 変形の進行',beltramiAnisotropy:'Anisotropy / 異方性',beltramiAngle:'Direction / 伸縮方向',beltramiFocusX:'Focus X / 焦点の横位置',beltramiFocusY:'Focus Y / 焦点の縦位置',beltramiDomain:'Domain / 場の広さ'}},
    riemannRamification:{label:'Riemann Ramification',short:'rrm',color:'#34202c',
      description:'多項式の逆像へ文字を展開し、分岐点を介して字画と穴を新しい身体へつなぎます。',
      options:{},integers:['ramificationDegree','ramificationDepth'],
      defaults:{ramificationDegree:3,ramificationDepth:2,ramificationCoupling:1.25,ramificationX:-.15,ramificationY:.08,ramificationScale:1,ramificationAngle:-18},
      limits:{ramificationDegree:[2,3],ramificationDepth:[0,3],ramificationCoupling:[0,1.8],ramificationX:[-1.15,1.15],ramificationY:[-1.15,1.15],ramificationScale:[.55,1.5],ramificationAngle:[-180,180]},
      labels:{ramificationDegree:'Sheets / 分岐数',ramificationDepth:'Generation / 逆像の世代',ramificationCoupling:'Critical split / 分岐点の分離',ramificationX:'Critical X / 分岐点の横位置',ramificationY:'Critical Y / 分岐点の縦位置',ramificationScale:'Source span / 元字の広がり',ramificationAngle:'Orbit / 全体の回転'}}
  };
  var TAU=Math.PI*2,meshCache=new Map(),MAX_POINTS=240000;
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function createCanvas(s){var c=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));c.width=s.w;c.height=s.h;return c;}
  function sourceBounds(s){var x0=s.w,y0=s.h,x1=-1,y1=-1;for(var y=0;y<s.h;y++)for(var x=0;x<s.w;x++)if(s.alpha[y*s.w+x]>.02){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return {cx:(x0+x1)/2,cy:(y0+y1)/2,w:Math.max(1,x1-x0),h:Math.max(1,y1-y0),empty:x1<0};}
  function tint(s,color){var out=createCanvas(s),ctx=out.getContext('2d');ctx.fillStyle='rgb('+color.join(',')+')';ctx.fillRect(0,0,s.w,s.h);ctx.globalCompositeOperation='destination-in';ctx.drawImage(s.canvas,0,0);return out;}
  function fill(s,color,rings,project){var out=createCanvas(s),ctx=out.getContext('2d');ctx.fillStyle='rgb('+color.join(',')+')';ctx.beginPath();rings.forEach(function(r){r.forEach(function(p,i){var q=project?project(p):p;if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y);});ctx.closePath();});ctx.fill('nonzero');return out;}
  function cross(ax,ay,bx,by){return ax*by-ay*bx;}
  function triangleIndices(n,fn){for(var y=0;y<n-1;y++)for(var x=0;x<n-1;x++){var a=y*n+x;fn(a,a+1,a+n+1,x,y,0);fn(a,a+n+1,a+n,x,y,1);}}
  function point(n,i){return {x:-1+2*(i%n)/(n-1),y:-1+2*Math.floor(i/n)/(n-1)};}
  function metricTensor(rho,tau){var m=rho*rho+tau*tau,den=1-m;if(den<=0)throw new Error('Beltrami magnitude must be below one');return [(1-2*rho+m)/den,-2*tau/den,(1+2*rho+m)/den];}
  // Standard P1 finite elements for div(A grad u)=0. Both coordinates use the
  // same SPD matrix, with a fixed square boundary. This is a constrained metric
  // reconstruction, not an extremal Teichmuller optimizer or exact prescribed mu.
  function assembleMetric(n,coefficient,boundary){
    var N=n*n,weights=new Float64Array(N*9),fixed=new Uint8Array(N),bx=new Float64Array(N),by=new Float64Array(N),x=new Float64Array(N),y=new Float64Array(N);
    for(var i=0;i<N;i++){var p=point(n,i),ix=i%n,iy=Math.floor(i/n);fixed[i]=ix===0||iy===0||ix===n-1||iy===n-1?1:0;var q=fixed[i]?boundary(p.x,p.y):[0,0];x[i]=q[0];y[i]=q[1];}
    triangleIndices(n,function(a,b,c){
      var ids=[a,b,c],ps=ids.map(function(i){return point(n,i);}),area=cross(ps[1].x-ps[0].x,ps[1].y-ps[0].y,ps[2].x-ps[0].x,ps[2].y-ps[0].y),gx=[ps[1].y-ps[2].y,ps[2].y-ps[0].y,ps[0].y-ps[1].y].map(function(v){return v/area;}),gy=[ps[2].x-ps[1].x,ps[0].x-ps[2].x,ps[1].x-ps[0].x].map(function(v){return v/area;}),m=coefficient((ps[0].x+ps[1].x+ps[2].x)/3,(ps[0].y+ps[1].y+ps[2].y)/3),A=metricTensor(m[0],m[1]);
      for(var i=0;i<3;i++)for(var j=0;j<3;j++){var dx=ids[j]%n-ids[i]%n,dy=Math.floor(ids[j]/n)-Math.floor(ids[i]/n),v=(gx[i]*(A[0]*gx[j]+A[1]*gy[j])+gy[i]*(A[1]*gx[j]+A[2]*gy[j]))*area*.5;weights[ids[i]*9+(dy+1)*3+dx+1]+=v;}
    });
    var offsets=[-n-1,-n,-n+1,-1,0,1,n-1,n,n+1];
    for(var i=0;i<N;i++)if(!fixed[i])for(var j=0;j<9;j++){var k=i+offsets[j];if(fixed[k]){bx[i]-=weights[i*9+j]*x[k];by[i]-=weights[i*9+j]*y[k];}}
    function apply(v,out){out.fill(0);for(var i=n+1;i<N-n-1;i++)if(!fixed[i]){var sum=0;for(var j=0;j<9;j++){var k=i+offsets[j];if(!fixed[k])sum+=weights[i*9+j]*v[k];}out[i]=sum;}}
    function solve(initial,rhs){
      var solution=initial.slice(),r=new Float64Array(N),z=new Float64Array(N),d=new Float64Array(N),ad=new Float64Array(N),rs=0,norm=0;apply(solution,ad);
      for(var i=0;i<N;i++)if(!fixed[i]){r[i]=rhs[i]-ad[i];z[i]=r[i]/weights[i*9+4];d[i]=z[i];rs+=r[i]*z[i];norm+=rhs[i]*rhs[i];}
      var it=0,target=Math.max(1e-22,norm*1e-19),err=Infinity;
      for(;it<1600;it++){var r2=0;for(var i=0;i<N;i++)r2+=r[i]*r[i];if(r2<=target)break;apply(d,ad);var dad=0;for(var i=0;i<N;i++)dad+=d[i]*ad[i];if(!(dad>0))throw new Error('Beltrami metric solve lost positive definiteness');var a=rs/dad,newRs=0;
        for(var i=0;i<N;i++)if(!fixed[i]){solution[i]+=a*d[i];r[i]-=a*ad[i];z[i]=r[i]/weights[i*9+4];newRs+=r[i]*z[i];}var beta=newRs/rs;for(var i=0;i<N;i++)d[i]=z[i]+beta*d[i];rs=newRs;
      }
      apply(solution,ad);err=0;for(var i=0;i<N;i++)if(!fixed[i])err=Math.max(err,Math.abs(ad[i]-rhs[i]));if(!isFinite(err)||err>1e-6)throw new Error('Beltrami metric solve did not converge');return {values:solution,residual:err,iterations:it};
    }
    var sx=solve(x,bx),sy=solve(y,by);return {n:n,x:sx.values,y:sy.values,residual:Math.max(sx.residual,sy.residual),iterations:Math.max(sx.iterations,sy.iterations)};
  }
  // A triangle's determinant during I+t(F-I) is quadratic. Check its interior
  // minimum too, rather than assuming that positive endpoint areas suffice.
  function minimumJacobian(mesh,tmax){var n=mesh.n,h=2/(n-1),min=Infinity;
    triangleIndices(n,function(a,b,c){var pa=point(n,a),pb=point(n,b),pc=point(n,c),ux=pb.x-pa.x,uy=pb.y-pa.y,vx=pc.x-pa.x,vy=pc.y-pa.y,du=mesh.x[b]-mesh.x[a]-ux,dv=mesh.y[b]-mesh.y[a]-uy,eu=mesh.x[c]-mesh.x[a]-vx,ev=mesh.y[c]-mesh.y[a]-vy,A=cross(du,dv,eu,ev)/(h*h),B=(cross(du,dv,vx,vy)+cross(ux,uy,eu,ev))/(h*h);
      function at(t){return 1+B*t+A*t*t;}var value=Math.min(1,at(tmax));if(A>0){var t=-B/(2*A);if(t>0&&t<tmax)value=Math.min(value,at(t));}min=Math.min(min,value);
    });return min;
  }
  function buildMetric(p,n){
    var angle=p.beltramiAngle*Math.PI/180;
    function coefficient(x,y){var xx=x-p.beltramiFocusX,yy=y-p.beltramiFocusY,r=Math.hypot(xx,yy),theta=Math.atan2(yy,xx),phase=p.beltramiMode==='vortex'?2*theta+angle:p.beltramiMode==='saddle'?-2*theta+angle:3*Math.sin(xx*2)+2*Math.cos(yy*3)+angle;
      var mag=p.beltramiAnisotropy*Math.min(1,r/.18);return [mag*Math.cos(phase),mag*Math.sin(phase)];}
    var f=assembleMetric(n,coefficient,function(x,y){return [x,y];}),step=1;
    if(minimumJacobian(f,1)<.025){var lo=0,hi=1;for(var j=0;j<25;j++){var mid=(lo+hi)/2;if(minimumJacobian(f,mid)<.025)hi=mid;else lo=mid;}step=lo*(1-1e-7);}
    if(step<=1/1024)throw new Error('Beltrami map could not retain triangle orientation');
    if(step<1)for(var i=0;i<f.x.length;i++){var q=point(n,i);f.x[i]=q.x+(f.x[i]-q.x)*step;f.y[i]=q.y+(f.y[i]-q.y)*step;}
    f.step=step;f.minJacobian=minimumJacobian(f,1);return f;
  }
  function metricFor(p){var key=JSON.stringify([p.beltramiMode,p.beltramiAnisotropy,p.beltramiAngle,p.beltramiFocusX,p.beltramiFocusY]);if(meshCache.has(key)){var v=meshCache.get(key);meshCache.delete(key);meshCache.set(key,v);return v;}var f=buildMetric(p,65);meshCache.set(key,f);while(meshCache.size>12)meshCache.delete(meshCache.keys().next().value);return f;}
  function sampleMesh(f,q){var n=f.n,u=clamp((q.x+1)*(n-1)/2,0,n-1-1e-9),v=clamp((q.y+1)*(n-1)/2,0,n-1-1e-9),ix=Math.floor(u),iy=Math.floor(v),x=u-ix,y=v-iy,a=iy*n+ix;
    if(x>=y)return {x:f.x[a]*(1-x)+f.x[a+1]*(x-y)+f.x[a+n+1]*y,y:f.y[a]*(1-x)+f.y[a+1]*(x-y)+f.y[a+n+1]*y};
    return {x:f.x[a]*(1-y)+f.x[a+n+1]*x+f.x[a+n]*(y-x),y:f.y[a]*(1-y)+f.y[a+n+1]*x+f.y[a+n]*(y-x)};
  }
  function evolve(f,q,amount){var count=Math.floor(amount),rest=amount-count,p=q;for(var i=0;i<count;i++)p=sampleMesh(f,p);if(rest>1e-12){var b=sampleMesh(f,p);p={x:p.x+(b.x-p.x)*rest,y:p.y+(b.y-p.y)*rest};}return p;}
  function adaptiveRing(r,map,tolerance,budget){var out=[];
    function push(p){out.push(p);if(++budget.count>MAX_POINTS)throw new Error('Body curve exceeds the 240000 point limit');}
    function edge(a,b,fa,fb,depth){var m={x:(a.x+b.x)/2,y:(a.y+b.y)/2},fm=map(m),error=Math.hypot(fm.x-(fa.x+fb.x)/2,fm.y-(fa.y+fb.y)/2),length=Math.hypot(fb.x-fa.x,fb.y-fa.y);
      if((error>tolerance||length>2.5)&&depth<19){edge(a,m,fa,fm,depth+1);edge(m,b,fm,fb,depth+1);}else {if(depth===19&&error>tolerance*4)throw new Error('Body curve refinement did not converge');push(fa);}}
    for(var i=0;i<r.length;i++){var a=r[i],b=r[(i+1)%r.length];edge(a,b,map(a),map(b),0);}return out;
  }
  function beltrami(s,p,color){if(p.beltramiAmount===0||p.beltramiAnisotropy===0)return tint(s,color);var b=sourceBounds(s);if(b.empty)return createCanvas(s);var f=metricFor(p),radius=Math.max(b.w,b.h)*p.beltramiDomain,budget={count:0};
    function map(q){var v=evolve(f,{x:(q.x-b.cx)/radius,y:(q.y-b.cy)/radius},p.beltramiAmount/f.step);return {x:b.cx+v.x*radius,y:b.cy+v.y*radius};}
    var rings=s.trace(s.data,s.w,s.h).map(function(c){return adaptiveRing(c.points,map,.16,budget);}),out=fill(s,color,rings);out._bodyDiagnostics={solverResidual:f.residual,iterations:f.iterations,minStepJacobian:f.minJacobian,stepFactor:f.step,points:budget.count};return out;
  }
  function angleDelta(a,b){var d=b-a;return d-TAU*Math.round(d/TAU);}
  function rootAt(p,c,degree,theta){var x=p.x-c.x,y=p.y-c.y,r=Math.pow(Math.hypot(x,y),1/degree);return {x:r*Math.cos(theta/degree),y:r*Math.sin(theta/degree)};}
  // Lift a closed outline on all sheets; its argument winding determines which
  // sheets join. A branch is never closed across the principal-root cut.
  function liftRing(r,c,degree,tolerance,budget){
    var lifted=[],a0=Math.atan2(r[0].y-c.y,r[0].x-c.x),angle=a0,first=rootAt(r[0],c,degree,a0);
    function add(p){lifted.push(p);if(++budget.count>MAX_POINTS)throw new Error('Branched body exceeds the 240000 point limit');}
    function edge(a,b,aa,bb,fa,fb,depth){var m={x:(a.x+b.x)/2,y:(a.y+b.y)/2},raw=Math.atan2(m.y-c.y,m.x-c.x),am=aa+angleDelta(aa,raw),fm=rootAt(m,c,degree,am),error=Math.hypot(fm.x-(fa.x+fb.x)/2,fm.y-(fa.y+fb.y)/2);
      if((error>tolerance||Math.abs(bb-aa)>.25)&&depth<20){edge(a,m,aa,am,fa,fm,depth+1);edge(m,b,am,bb,fm,fb,depth+1);}else {if(depth===20&&error>tolerance*4)throw new Error('Branched body critical-point refinement did not converge');add(fa);}}
    for(var i=0;i<r.length;i++){var a=r[i],b=r[(i+1)%r.length],next=angle+angleDelta(angle,Math.atan2(b.y-c.y,b.x-c.x)),fa=rootAt(a,c,degree,angle),fb=rootAt(b,c,degree,next);edge(a,b,angle,next,fa,fb,0);angle=next;}
    var winding=Math.round((angle-a0)/TAU),jump=((winding%degree)+degree)%degree,used=new Uint8Array(degree),result=[];
    for(var j=0;j<degree;j++)if(!used[j]){var ring=[],k=j;do{used[k]=1;var cs=Math.cos(TAU*k/degree),sn=Math.sin(TAU*k/degree);for(var i=0;i<lifted.length;i++){var q=lifted[i];ring.push({x:q.x*cs-q.y*sn,y:q.x*sn+q.y*cs});}k=(k+jump)%degree;}while(!used[k]);result.push(ring);}
    budget.count+=(degree-1)*lifted.length;if(budget.count>MAX_POINTS)throw new Error('Branched body exceeds the 240000 point limit');return result;
  }
  function ramify(rings,degree,depth,c,tolerance){var out=rings,budget={count:0};for(var j=0;j<depth;j++){var next=[];budget.count=0;out.forEach(function(r){next.push.apply(next,liftRing(r,c,degree,tolerance,budget));});out=next;}return {rings:out,points:out.reduce(function(n,r){return n+r.length;},0)};}
  function complexRoot(z,degree){var a=Math.atan2(z.y,z.x)/degree,r=Math.pow(Math.hypot(z.x,z.y),1/degree);return {x:r*Math.cos(a),y:r*Math.sin(a)};}
  function polynomialRoots(w,c,degree,coupling){
    var q={x:c.x-w.x,y:c.y-w.y};
    if(degree===2){var sq=complexRoot({x:coupling*coupling-4*q.x,y:-4*q.y},2);return [{x:(coupling+sq.x)/2,y:sq.y/2},{x:(coupling-sq.x)/2,y:-sq.y/2}];}
    // Cardano with uv=a/3 avoids inconsistent cube-root branches.
    var disc=complexRoot({x:(q.x*q.x-q.y*q.y)/4-Math.pow(coupling/3,3),y:q.x*q.y/2},2),plus={x:-q.x/2+disc.x,y:-q.y/2+disc.y},minus={x:-q.x/2-disc.x,y:-q.y/2-disc.y},u=complexRoot(plus.x*plus.x+plus.y*plus.y>=minus.x*minus.x+minus.y*minus.y?plus:minus,3),norm=u.x*u.x+u.y*u.y;
    if(norm<1e-20){u=complexRoot({x:-q.x/2-disc.x,y:-q.y/2-disc.y},3);norm=u.x*u.x+u.y*u.y;}
    var v=norm<1e-24?{x:0,y:0}:{x:coupling*u.x/(3*norm),y:-coupling*u.y/(3*norm)},out=[];
    for(var j=0;j<3;j++){var cs=Math.cos(TAU*j/3),sn=Math.sin(TAU*j/3);out.push({x:cs*(u.x+v.x)-sn*(u.y-v.y),y:sn*(u.x-v.x)+cs*(u.y+v.y)});}return out;
  }
  var permutations={2:[[0,1],[1,0]],3:[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]};
  function matchRoots(previous,roots){var best=null,score=Infinity;permutations[roots.length].forEach(function(p){var sum=0;for(var j=0;j<p.length;j++){var a=previous[j],b=roots[p[j]];sum+=(a.x-b.x)*(a.x-b.x)+(a.y-b.y)*(a.y-b.y);}if(sum<score){score=sum;best=p;}});return best.map(function(i){return roots[i];});}
  function liftPolynomialRing(r,c,degree,coupling,tolerance,budget){
    var initial=polynomialRoots(r[0],c,degree,coupling),branches=initial.map(function(){return [];}),previous=initial;
    function edge(a,b,ra,depth){var mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},rm=matchRoots(ra,polynomialRoots(mid,c,degree,coupling)),rb=matchRoots(rm,polynomialRoots(b,c,degree,coupling)),error=0,move=0,sep=Infinity;
      for(var j=0;j<degree;j++){error=Math.max(error,Math.hypot(rm[j].x-(ra[j].x+rb[j].x)/2,rm[j].y-(ra[j].y+rb[j].y)/2));move=Math.max(move,Math.hypot(rb[j].x-ra[j].x,rb[j].y-ra[j].y));for(var k=0;k<j;k++)sep=Math.min(sep,Math.hypot(rm[j].x-rm[k].x,rm[j].y-rm[k].y));}
      if((error>tolerance||move>Math.max(tolerance*4,sep*.45))&&depth<20){var left=edge(a,mid,ra,depth+1);return edge(mid,b,left,depth+1);}
      if(depth===20&&error>tolerance*8)throw new Error('Polynomial branch tracking did not converge');
      for(var j=0;j<degree;j++)branches[j].push(ra[j]);budget.count+=degree;if(budget.count>MAX_POINTS)throw new Error('Branched body exceeds the 240000 point limit');return rb;
    }
    for(var i=0;i<r.length;i++)previous=edge(r[i],r[(i+1)%r.length],previous,0);
    var ends=matchRoots(previous,initial),jump=ends.map(function(p){return initial.indexOf(p);}),used=new Uint8Array(degree),out=[];
    for(var i=0;i<degree;i++)if(!used[i]){var ring=[],j=i;do{used[j]=1;ring.push.apply(ring,branches[j]);j=jump[j];}while(!used[j]);out.push(ring);}return out;
  }
  function ramifyPolynomial(rings,degree,depth,c,coupling,tolerance){if(coupling===0)return ramify(rings,degree,depth,c,tolerance);var out=rings,budget={count:0};for(var j=0;j<depth;j++){var next=[];budget.count=0;out.forEach(function(r){next.push.apply(next,liftPolynomialRing(r,c,degree,coupling,tolerance,budget));});out=next;}return {rings:out,points:out.reduce(function(n,r){return n+r.length;},0)};}
  function ramification(s,p,color){if(p.ramificationDepth===0)return tint(s,color);var b=sourceBounds(s);if(b.empty)return createCanvas(s);var radius=Math.max(b.w,b.h)*.66,sc=p.ramificationScale,rings=s.trace(s.data,s.w,s.h).map(function(c){return c.points.map(function(q){return {x:(q.x-b.cx)/radius*sc,y:(q.y-b.cy)/radius*sc};});});
    var result=ramifyPolynomial(rings,p.ramificationDegree,p.ramificationDepth,{x:p.ramificationX,y:p.ramificationY},p.ramificationCoupling,.11/radius),a=p.ramificationAngle*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a),out=fill(s,color,result.rings,function(q){return {x:b.cx+(q.x*cs-q.y*sn)*radius,y:b.cy+(q.x*sn+q.y*cs)*radius};});out._bodyDiagnostics={rings:result.rings.length,points:result.points,degree:p.ramificationDegree,depth:p.ramificationDepth};return out;
  }
  root.TypeDeformerRamifiedBody={schemas:schemas,ids:Object.keys(schemas),renderers:{beltramiFlow:beltrami,riemannRamification:ramification},effectPad:function(id,g){var extent=g?Math.max(g.w,g.h):180;return Math.ceil(id==='beltramiFlow'?extent*.82+8:extent*1.85+8);},internals:{metricTensor:metricTensor,assembleMetric:assembleMetric,minimumJacobian:minimumJacobian,buildMetric:buildMetric,sampleMesh:sampleMesh,evolve:evolve,adaptiveRing:adaptiveRing,liftRing:liftRing,ramify:ramify,polynomialRoots:polynomialRoots,matchRoots:matchRoots,liftPolynomialRing:liftPolynomialRing,ramifyPolynomial:ramifyPolynomial,sourceBounds:sourceBounds}};
})(typeof globalThis!=='undefined'?globalThis:this);
