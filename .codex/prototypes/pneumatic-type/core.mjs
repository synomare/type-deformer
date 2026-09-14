// Standalone glyph-body trial. No editor, source-font, UI, cache or camera state.
// Poisson relief is an art-directed inflation model, NOT a cloth/air simulation.
export const PNEUMATIC_STARTS=Object.freeze({
  bladder:{pressure:1.25,weld:0,pitch:52,axis:0,yaw:-26,tilt:18,motion:.45},
  quilt:{pressure:2.1,weld:.9,pitch:48,axis:35,yaw:-24,tilt:22,motion:.6},
  bellows:{pressure:3.4,weld:1,pitch:24,axis:-20,yaw:36,tilt:-18,motion:.8}
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),TAU=Math.PI*2;
export function pneumaticSettings(input={}){
  const s={...PNEUMATIC_STARTS.bladder,...input};
  for(const [key,min,max] of [['pressure',0,6],['weld',0,1],['pitch',6,128],['axis',-180,180],['yaw',-75,75],['tilt',-75,75],['motion',0,1]]){
    if(!Number.isFinite(s[key])||s[key]<min||s[key]>max)throw new RangeError(`Pneumatic ${key}`);
  }
  return s;
}
export function preparePneumatic(alpha,width,height,settings={}, {pixelSize=1}={}){
  const s=pneumaticSettings(settings),count=width*height;
  if(!Number.isFinite(pixelSize)||pixelSize<.125||pixelSize>8)throw new RangeError('Pneumatic source pixel size');
  const edgeWeight=1/(pixelSize*pixelSize);
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<3||height<3||count>512*512||alpha.length!==count)throw new RangeError('Pneumatic source budget');
  const source=Uint8ClampedArray.from(alpha),ids=new Int32Array(count).fill(-1),active=[];
  let x0=width,y0=height,x1=-1,y1=-1;
  for(let p=0;p<count;p++){
    if(!Number.isFinite(alpha[p])||alpha[p]<0||alpha[p]>255)throw new RangeError('Pneumatic source alpha');
    if(source[p]<=127.5)continue;
    const x=p%width,y=Math.floor(p/width);
    if(!x||!y||x===width-1||y===height-1)throw new RangeError('Pneumatic source needs a transparent border');
    ids[p]=active.length;active.push(p);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
  }
  if(active.length>90000)throw new RangeError('Pneumatic active node budget');
  const n=active.length,diag=new Float64Array(n),baseDiag=new Float64Array(n),tethers=new Float64Array(n),neighbors=new Int32Array(n*4).fill(-1),rhs=new Float64Array(n).fill(2);
  const cx=(n?(x0+x1+1)/2:width/2)*pixelSize,cy=(n?(y0+y1+1)/2:height/2)*pixelSize,angle=s.axis*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle);
  for(let i=0;i<n;i++){
    const p=active[i],x=p%width,y=Math.floor(p/width),u=((x+.5)*pixelSize-cx)*cs+((y+.5)*pixelSize-cy)*sn;
    // Periodic internal tethers alter the field itself, not painted seam marks.
    const wave=Math.sin(Math.PI*u/s.pitch),seam=Math.exp(-Math.pow(wave/.11,2));
    tethers[i]=s.weld*32*seam/Math.max(1,(s.pitch*.035)**2);
    for(let k=0;k<4;k++){
      const q=p+[-1,1,-width,width][k],j=ids[q];neighbors[i*4+k]=j;
      // Subpixel Dirichlet distance at the 50%-alpha contour. Symmetric for
      // interior edges; only a diagonal contribution for exterior edges.
      baseDiag[i]+=edgeWeight*(j>=0?1:1/Math.max(.01,(source[p]-127.5)/(source[p]-source[q])));
    }
    diag[i]=baseDiag[i]+tethers[i];
  }
  return {width,height,pixelSize,edgeWeight,source,active:Int32Array.from(active),ids,diag,baseDiag,tethers,neighbors,rhs,cx,cy,settings:{weld:s.weld,pitch:s.pitch,axis:s.axis}};
}
export function solvePneumatic(domain,{tolerance=1e-8,maxIterations=1600}={}){
  if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>.01||!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>10000)throw new RangeError('Pneumatic solver settings');
  const {diag,baseDiag,tethers,neighbors,rhs,edgeWeight}=domain;
  if(!tethers.some(v=>v>0))return solveRelief(diag,neighbors,rhs,tolerance,maxIterations,edgeWeight);
  // Internal tethers retain a common inflated core, not a zero-height plane.
  // A0*f=b; (A0+L)*u=b+.4*L*f. Equivalently u=.4*f+.6*hard,
  // so valleys rise without exceeding the free dome or closing source holes.
  // This is an art-directed relief constraint, not a physical tether law.
  const free=solveRelief(baseDiag,neighbors,rhs,tolerance,maxIterations,edgeWeight);
  const target=Float64Array.from(rhs,(v,i)=>v+.4*tethers[i]*free.u[i]);
  // The caller's iteration budget covers both stages, not 2x that budget.
  const remaining=maxIterations-free.iterations;
  if(remaining<1)throw new Error('Pneumatic solve did not converge: total iteration budget');
  const field=solveRelief(diag,neighbors,target,tolerance,remaining,edgeWeight);
  return {...field,iterations:field.iterations+free.iterations,freeIterations:free.iterations,tetherIterations:field.iterations,freeResidual:free.residual};
}
function solveRelief(diag,neighbors,rhs,tolerance,maxIterations,edgeWeight){
  const n=diag.length,u=new Float64Array(n),r=rhs.slice(),z=new Float64Array(n),p=new Float64Array(n),ap=new Float64Array(n);
  if(!n)return {u,iterations:0,residual:0};
  const dot=(a,b)=>{let v=0;for(let i=0;i<n;i++)v+=a[i]*b[i];return v;};
  for(let i=0;i<n;i++)p[i]=z[i]=r[i]/diag[i];
  let rz=dot(r,z),iteration=0,relative=1;const base=dot(rhs,rhs);
  for(;iteration<maxIterations;iteration++){
    for(let i=0;i<n;i++){let v=diag[i]*p[i];for(let k=0;k<4;k++){const j=neighbors[i*4+k];if(j>=0)v-=edgeWeight*p[j];}ap[i]=v;}
    const denominator=dot(p,ap);if(!(denominator>0))throw new Error('Pneumatic nonpositive solver step');
    const step=rz/denominator;
    for(let i=0;i<n;i++){u[i]+=step*p[i];r[i]-=step*ap[i];}
    relative=Math.sqrt(dot(r,r)/base);
    if(relative<=tolerance){iteration++;break;}
    for(let i=0;i<n;i++)z[i]=r[i]/diag[i];
    const next=dot(r,z),beta=next/rz;rz=next;
    for(let i=0;i<n;i++)p[i]=z[i]+beta*p[i];
  }
  // Re-evaluate the true residual independently of the CG recurrence.
  let residual2=0;
  for(let i=0;i<n;i++){
    let v=diag[i]*u[i]-rhs[i];for(let k=0;k<4;k++){const j=neighbors[i*4+k];if(j>=0)v-=edgeWeight*u[j];}residual2+=v*v;
    if(!Number.isFinite(u[i])||u[i]<-1e-5)throw new Error('Pneumatic invalid relief');
    u[i]=Math.max(0,u[i]);
  }
  const residual=Math.sqrt(residual2/base);
  if(residual>tolerance*1.02)throw new Error(`Pneumatic solve did not converge: ${residual}`);
  return {u,iterations:iteration,residual};
}
export function buildPneumaticMesh(domain,field){
  const {width:w,height:h,source,ids}=domain;
  if(field.u.length!==domain.active.length)throw new RangeError('Pneumatic field size');
  const vertices=[],triangles=[],cache=new Map();
  function vertex(a,b=null){
    if(b!==null&&a>b)[a,b]=[b,a];
    const key=b===null?String(a):`${a}:${b}`;
    if(cache.has(key))return cache.get(key);
    const x=a%w,y=Math.floor(a/w),t=b===null?0:(127.5-source[a])/(source[b]-source[a]);
    const px=b===null?x:x+(b%w-x)*t,py=b===null?y:y+(Math.floor(b/w)-y)*t;
    const i=vertices.length;
    vertices.push({x:(px+.5)*domain.pixelSize,y:(py+.5)*domain.pixelSize,u:b===null?field.u[ids[a]]:0,boundary:b!==null});cache.set(key,i);return i;
  }
  for(let y=0;y<h-1;y++)for(let x=0;x<w-1;x++){
    const a=y*w+x,b=a+1,c=a+w,d=c+1;
    for(const input of [[a,b,d],[a,d,c]]){
      const polygon=[];
      for(let k=0;k<3;k++){
        const p=input[k],q=input[(k+1)%3],inside=source[p]>127.5,next=source[q]>127.5;
        if(inside)polygon.push(vertex(p));if(inside!==next)polygon.push(vertex(p,q));
      }
      for(let k=1;k+1<polygon.length;k++)triangles.push([polygon[0],polygon[k],polygon[k+1]]);
    }
  }
  if(vertices.length>110000||triangles.length>220000)throw new RangeError('Pneumatic mesh budget');
  // Recover the relief gradient before the square-root height transform.
  // Averaging sqrt(u) triangle slopes amplifies contour sampling near u=0.
  // These area-weighted gradients belong to the fixed field, not the phase.
  const gradients=new Float64Array(vertices.length*2),weights=new Float64Array(vertices.length);
  for(const tri of triangles){
    const [a,b,c]=tri.map(i=>vertices[i]),bx=b.x-a.x,by=b.y-a.y,cx=c.x-a.x,cy=c.y-a.y;
    const area=bx*cy-by*cx,bu=b.u-a.u,cu=c.u-a.u;
    for(const i of tri){gradients[2*i]+=bu*cy-cu*by;gradients[2*i+1]+=bx*cu-cx*bu;weights[i]+=area;}
  }
  for(let i=0;i<vertices.length;i++){gradients[2*i]/=weights[i]||1;gradients[2*i+1]/=weights[i]||1;}
  return {vertices,triangles,gradients};
}
export function deformPneumatic(domain,mesh,settings={},phase=0){
  const s=pneumaticSettings(settings);
  if(!Number.isFinite(phase))throw new RangeError('Pneumatic phase');
  for(const k of ['weld','pitch','axis'])if(s[k]!==domain.settings[k])throw new Error(`Pneumatic stale field: ${k}`);
  phase=((phase%1)+1)%1;
  const pressure=s.pressure*(1+s.motion*.25*Math.sin(TAU*phase));
  // The body is F=z²-2*pressure²*u(x,y)=0. Its outward smooth normal is
  // proportional to (-pressure*u_x,-pressure*u_y,sqrt(2*u)), avoiding
  // division by zero at the shared front/back contour. Geometry is unchanged.
  const vertices=mesh.vertices.map((p,i)=>({x:p.x-domain.cx,y:p.y-domain.cy,z:Math.sqrt(2*p.u)*pressure,nx:-pressure*mesh.gradients[2*i],ny:-pressure*mesh.gradients[2*i+1],nz:Math.sqrt(2*p.u),boundary:p.boundary}));
  const gain=Math.min(1,s.pressure),ay=s.yaw*Math.PI/180*gain,ax=s.tilt*Math.PI/180*gain;
  const cy=Math.cos(ay),sy=Math.sin(ay),cx=Math.cos(ax),sx=Math.sin(ax);
  const rotate=(x,y,z)=>{const X=cy*x+sy*z,Z=-sy*x+cy*z;return [X,cx*y-sx*Z,sx*y+cx*Z];};
  const front=[],back=[];
  for(const v of vertices){
    if(v.boundary)v.nz=0;
    const norm=Math.hypot(v.nx,v.ny,v.nz)||1;
    for(const [sign,list] of [[1,front],[-1,back]]){
      const p=rotate(v.x,v.y,v.z*sign),n=rotate(v.nx/norm,v.ny/norm,v.nz/norm*sign);
      list.push({x:p[0]+domain.cx,y:p[1]+domain.cy,z:p[2],nx:n[0],ny:n[1],nz:n[2]});
    }
  }
  return {front,back,triangles:mesh.triangles,pressure};
}
export function renderPneumatic(domain,mesh,settings={},phase=0,{scale=1,ink=[105,43,29],roughness=.35}={}){
  const s=pneumaticSettings(settings);
  if(!Number.isFinite(phase))throw new RangeError('Pneumatic phase');
  if(!Number.isFinite(scale)||scale<=0||scale>3||!Number.isFinite(1/(scale*domain.pixelSize)))throw new RangeError('Pneumatic output budget');
  if(ink.length!==3||ink.some(v=>!Number.isFinite(v)||v<0||v>255)||!Number.isFinite(roughness)||roughness<0||roughness>1)throw new RangeError('Pneumatic material');
  const shape=s.pressure>0?deformPneumatic(domain,mesh,s,phase):null;
  // Expand the output plane, never shrink the geometry to fit a source box.
  // Offsets are placement metadata, not a camera adjustment.
  let originX=0,originY=0,right=domain.width*domain.pixelSize,bottom=domain.height*domain.pixelSize;
  if(shape)for(const list of [shape.front,shape.back])for(const p of list){originX=Math.min(originX,Math.floor(p.x-2));originY=Math.min(originY,Math.floor(p.y-2));right=Math.max(right,Math.ceil(p.x+2));bottom=Math.max(bottom,Math.ceil(p.y+2));}
  const w=Math.ceil((right-originX)*scale),h=Math.ceil((bottom-originY)*scale);
  if(w*h>2400000)throw new RangeError('Pneumatic expanded output budget');
  const data=new Uint8ClampedArray(w*h*4);
  if(s.pressure===0){
    // Box-integrate the supplied alpha over each output pixel. This is exact
    // at the old integer scales and avoids nearest-neighbour thin-stroke loss
    // when a canonical source is minified. Outside source coverage is zero.
    const density=scale*domain.pixelSize,footprint=1/density;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const x0=x*footprint,x1=(x+1)*footprint,y0=y*footprint,y1=(y+1)*footprint;let a=0;
      for(let sy=Math.floor(y0);sy<Math.min(domain.height,Math.ceil(y1));sy++)for(let sx=Math.floor(x0);sx<Math.min(domain.width,Math.ceil(x1));sx++){
        const area=(Math.min(sx+1,x1)-Math.max(sx,x0))*(Math.min(sy+1,y1)-Math.max(sy,y0));
        a+=domain.source[sy*domain.width+sx]*area;
      }
      data.set([...ink,a/(footprint*footprint)],(y*w+x)*4);
    }
    return {data,width:w,height:h,originX,originY,triangles:0};
  }
  const depth=new Float64Array(w*h).fill(-Infinity);
  const norm=v=>{const d=Math.hypot(...v);return v.map(x=>x/d);},light=norm([-.5,-.8,1.1]),fill=norm([.8,.15,.5]),half=norm([light[0],light[1],light[2]+1]);
  const edge=(a,b,x,y)=>(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);
  for(const vertices of [shape.back,shape.front])for(const tri of shape.triangles){
    const [a,b,c]=tri.map(i=>({...vertices[i],x:(vertices[i].x-originX)*scale,y:(vertices[i].y-originY)*scale}));
    const area=edge(a,b,c.x,c.y);if(Math.abs(area)<1e-12)continue;
    const x0=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),x1=Math.min(w-1,Math.ceil(Math.max(a.x,b.x,c.x)));
    const y0=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))),y1=Math.min(h-1,Math.ceil(Math.max(a.y,b.y,c.y)));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
      const A=edge(b,c,x+.5,y+.5)/area,B=edge(c,a,x+.5,y+.5)/area,C=1-A-B;
      if(A< -1e-9||B< -1e-9||C< -1e-9)continue;
      const z=A*a.z+B*b.z+C*c.z,p=y*w+x;if(z<=depth[p])continue;depth[p]=z;
      let nx=A*a.nx+B*b.nx+C*c.nx,ny=A*a.ny+B*b.ny+C*c.ny,nz=A*a.nz+B*b.nz+C*c.nz;
      const length=Math.hypot(nx,ny,nz)||1;nx/=length;ny/=length;nz/=length;
      const dot=v=>Math.max(0,nx*v[0]+ny*v[1]+nz*v[2]);
      const diffuse=.18+.64*dot(light)+.14*dot(fill),rim=Math.pow(1-clamp(nz,0,1),4)*.2;
      const spec=(1-roughness)*.8*Math.pow(dot(half),12+140*(1-roughness)**2)+.08*Math.pow(dot(half),6);
      for(let k=0;k<3;k++)data[p*4+k]=clamp(ink[k]*diffuse+255*(spec+rim*.3),0,255);
      data[p*4+3]=255;
    }
  }
  return {data,width:w,height:h,originX,originY,triangles:shape.triangles.length*2};
}
