// Bounded, source-owned indexed display meshes. core.mjs remains the independent
// triangle-soup construction oracle. No decimation, precision reduction or GPU.
import {scrollSettings,scrollSection} from './core.mjs';
const validNumber=Number.isFinite;
export function createScrollSurfacePool(source,{slots=2,maxBytes=64*1024*1024}={}){
  if(!Number.isInteger(slots)||slots<1||slots>2||!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new RangeError('Invalid scroll pool budget');
  if(source?.kind!=='scroll-source-v1'||!(source.points instanceof Float64Array)||source.points.length%2||!(source.front instanceof Uint32Array)||source.front.length%3||!(source.walls instanceof Uint32Array)||source.walls.length%2
    ||![source.span,source.center,source.ux,source.uy].every(validNumber)||source.span<=0||!Number.isSafeInteger(source.maxTriangles)||source.maxTriangles<1)throw new TypeError('Invalid scroll pool source');
  const N=source.points.length/2,W=source.walls.length/2,T=source.front.length/3*2+W*2,V=N*2+W*4;
  if(N>100000||T>source.maxTriangles||T>200000||!source.points.every(validNumber)||!source.front.every(i=>i<N)||!source.walls.every(i=>i<N))throw new RangeError('Scroll pool source budget or index');
  const smoothing=source.rimSmoothing??0;
  if(!Number.isFinite(smoothing)||smoothing<0||smoothing>.03||smoothing&&(!(source.wallNormals instanceof Float64Array)||source.wallNormals.length!==W*4||!source.wallNormals.every(validNumber)))throw new TypeError('Invalid scroll pool rim field');
  const normalBytes=smoothing?source.wallNormals.byteLength:0;
  const sourceBytes=source.points.byteLength+source.front.byteLength+source.walls.byteLength+normalBytes+N*(4+8+5*8);
  const slotBytes=V*6*8+T*(3*8+3*4+1)+12*8,managedBytes=sourceBytes+slots*slotBytes;
  if(!Number.isSafeInteger(managedBytes)||managedBytes>maxBytes)throw new RangeError('Scroll pool byte budget exceeded');
  let points=source.points.slice(),front=source.front.slice(),walls=source.walls.slice(),rim=smoothing?source.wallNormals.slice():null;
  const {span,center,ux,uy}=source;
  let levelIds=new Uint32Array(N),heights=new Float64Array(N),sections=new Float64Array(N*5),levelCount=0;
  {const found=new Map();for(let i=0;i<N;i++){const v=points[i*2+1];let id=found.get(v);if(id===undefined){id=levelCount++;heights[id]=v;found.set(v,id);}levelIds[i]=id;}}
  let buffers=Array.from({length:slots},()=>({busy:false,positions:new Float64Array(V*3),normals:new Float64Array(V*3),faceNormals:new Float64Array(T*3),indices:new Uint32Array(T*3),sourceAxis:new Uint8Array(T),geometric:new Float64Array(12)}));
  let closing=false,disposed=false,held=0,builds=0;
  function reclaim(){if(closing&&!held){buffers=null;points=null;front=null;walls=null;rim=null;levelIds=null;heights=null;sections=null;disposed=true;}}
  function update(slot,p,phase){
    const h=p.gauge*span/2,P=slot.positions,A=slot.normals,F=slot.faceNormals,I=slot.indices,S=slot.sourceAxis,G=slot.geometric;
    let count=0,wallBase=0,minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(let i=0;i<levelCount;i++){
      const q=scrollSection(heights[i]-center,span,p,phase),k=i*5;
      sections[k]=q.y;sections[k+1]=q.z;sections[k+2]=Math.sin(q.theta);sections[k+3]=Math.cos(q.theta);sections[k+4]=q.curvature;
    }
    for(let side=1;side>=-1;side-=2)for(let i=0;i<N;i++){
      const k=levelIds[i]*5,u=points[i*2],sn=sections[k+2],cs=sections[k+3],off=side*h;
      const y=sections[k]+center-off*sn,z=sections[k+1]+off*cs,j=(i+(side===1?0:N))*3;
      P[j]=ux*u-uy*y;P[j+1]=uy*u+ux*y;P[j+2]=z;
      A[j]=uy*sn*side;A[j+1]=-ux*sn*side;A[j+2]=cs*side;
      for(let c=0;c<3;c++)if(!Number.isFinite(P[j+c])||!Number.isFinite(A[j+c]))throw new RangeError('Scroll pool geometry overflow');
    }
    function emit(a,b,c,axis){
      let ia=a*3,ib=b*3,ic=c*3;
      let bx=P[ib]-P[ia],by=P[ib+1]-P[ia+1],bz=P[ib+2]-P[ia+2],cx=P[ic]-P[ia],cy=P[ic+1]-P[ia+1],cz=P[ic+2]-P[ia+2];
      let fx=by*cz-bz*cy,fy=bz*cx-bx*cz,fz=bx*cy-by*cx;
      if(!fx&&!fy&&!fz)return;
      if(!Number.isFinite(fx)||!Number.isFinite(fy)||!Number.isFinite(fz))throw new RangeError('Scroll pool geometry overflow');
      const ga=axis===2?(a-wallBase)*3:ia,gb=axis===2?(b-wallBase)*3:ib,gc=axis===2?(c-wallBase)*3:ic,n=axis===2?G:A;
      if(0+fx*(n[ga]+n[gb]+n[gc])+fy*(n[ga+1]+n[gb+1]+n[gc+1])+fz*(n[ga+2]+n[gb+2]+n[gc+2])<0){
        const t=b;b=c;c=t;ib=b*3;ic=c*3;
        bx=P[ib]-P[ia];by=P[ib+1]-P[ia+1];bz=P[ib+2]-P[ia+2];cx=P[ic]-P[ia];cy=P[ic+1]-P[ia+1];cz=P[ic+2]-P[ia+2];
        fx=by*cz-bz*cy;fy=bz*cx-bx*cz;fz=bx*cy-by*cx;
      }
      if(count>=T)throw new RangeError('Scroll pool triangle budget exceeded');
      const length=Math.hypot(fx,fy,fz),k=count*3;F[k]=fx/length;F[k+1]=fy/length;F[k+2]=fz/length;
      I[k]=a;I[k+1]=b;I[k+2]=c;S[count]=axis;count++;
      for(let j=0;j<3;j++){
        const q=j===0?ia:j===1?ib:ic;
        minX=Math.min(minX,P[q]);minY=Math.min(minY,P[q+1]);minZ=Math.min(minZ,P[q+2]);
        maxX=Math.max(maxX,P[q]);maxY=Math.max(maxY,P[q+1]);maxZ=Math.max(maxZ,P[q+2]);
      }
    }
    for(let i=0;i<front.length;i+=3){const a=front[i],b=front[i+1],c=front[i+2];emit(a,b,c,0);emit(c+N,b+N,a+N,1);}
    if(h)for(let i=0;i<W;i++){
      const a=walls[i*2],b=walls[i*2+1],du=points[b*2]-points[a*2],dv=points[b*2+1]-points[a*2+1];wallBase=N*2+i*4;
      for(let j=0;j<4;j++){
        const end=j===1||j===2?1:0,id=end?b:a,sign=j<2?-1:1,k=levelIds[id]*5,d=1-sign*h*sections[k+4],cs=sections[k+3],sn=sections[k+2];
        const from=(id+(sign===1?0:N))*3,to=(wallBase+j)*3;
        P[to]=P[from];P[to+1]=P[from+1];P[to+2]=P[from+2];
        let x=dv*d,y=-du*cs,z=-du*sn,gx=ux*x-uy*y,gy=uy*x+ux*y,length=Math.hypot(gx,gy,z);
        const g=j*3;G[g]=length?gx/length:0;G[g+1]=length?gy/length:0;G[g+2]=length?z/length:1;
        if(smoothing){const r=i*4+end*2,nu=rim[r],nv=rim[r+1];x=nu*d;y=nv*cs;z=nv*sn;gx=ux*x-uy*y;gy=uy*x+ux*y;length=Math.hypot(gx,gy,z);A[to]=length?gx/length:0;A[to+1]=length?gy/length:0;A[to+2]=length?z/length:1;}
        else {A[to]=G[g];A[to+1]=G[g+1];A[to+2]=G[g+2];}
        for(let c=0;c<3;c++)if(!Number.isFinite(A[to+c])||!Number.isFinite(G[g+c]))throw new RangeError('Scroll pool normal overflow');
      }
      emit(wallBase,wallBase+1,wallBase+2,2);emit(wallBase,wallBase+2,wallBase+3,2);
    }
    const vertices=N*2+(h?W*4:0);
    return {positions:P.subarray(0,vertices*3),normals:A.subarray(0,vertices*3),faceNormals:F.subarray(0,count*3),indices:I.subarray(0,count*3),sourceAxis:S.subarray(0,count),triangleCount:count,vertexCount:vertices,bounds:{min:[minX,minY,minZ],max:[maxX,maxY,maxZ]},settings:p,stats:{sections:levelCount,triangles:count,vertices}};
  }
  return Object.freeze({
    acquire(input={},phase=0){
      if(closing)throw new Error('Scroll pool disposed');if(!Number.isFinite(phase))throw new TypeError('Invalid scroll pool phase');
      let slot=buffers.find(b=>!b.busy);if(!slot)throw new RangeError('Scroll pool has no free slot');
      const p=scrollSettings(input);let mesh=update(slot,p,phase),live=true;slot.busy=true;held++;builds++;
      return Object.freeze({read(){if(!live)throw new Error('Scroll mesh lease released');return mesh;},release(){if(!live)return false;live=false;mesh=null;slot.busy=false;slot=null;held--;reclaim();return true;}});
    },
    stats(){return {slots,held,builds,sourceBytes,slotBytes,managedBytes:disposed?0:managedBytes,maxBytes,closing,disposed};},
    dispose(){closing=true;reclaim();}
  });
}
