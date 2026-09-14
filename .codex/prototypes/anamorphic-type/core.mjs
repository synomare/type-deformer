// Original two-profile intersection solid. Polygon rings use even-odd fill.
// A(x,y) AND B(-z/depth,y): two orthogonal readings of one material body.
// No voxel grid, copied sculpture, shadow optimizer, or editor registration.
const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const unit = a => { const d=Math.hypot(...a); return d ? a.map(x=>x/d) : [0,0,1]; };
const cross = (ax,ay,bx,by) => ax*by-ay*bx;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const option = (x,d,a,b) => Number.isFinite(x) ? clamp(x,a,b) : d;

export const ANAMORPHIC_PRESETS = Object.freeze({
  dual: Object.freeze({yaw:45,tilt:0,depth:1,motion:0,metal:.25,roughness:.3}),
  oblique: Object.freeze({yaw:38,tilt:-24,depth:1.35,motion:0,metal:.7,roughness:.18}),
  reveal: Object.freeze({yaw:45,tilt:0,depth:1,motion:1,metal:.35,roughness:.3})
});
export function anamorphicSettings(p={}) {
  return {yaw:option(p.yaw,45,-180,180),tilt:option(p.tilt,0,-80,80),depth:option(p.depth,1,.1,4),
    motion:option(p.motion,0,0,1),metal:option(p.metal,.3,0,1),roughness:option(p.roughness,.3,.04,1),
    opacity:option(p.opacity,1,0,1),unlit:!!p.unlit};
}
function box(edges) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const e of edges){minX=Math.min(minX,e.minX);minY=Math.min(minY,e.minY);maxX=Math.max(maxX,e.maxX);maxY=Math.max(maxY,e.maxY);}
  return {minX,minY,maxX,maxY};
}
function tree(edges) {
  const bounds=box(edges);
  if(edges.length<=8)return {...bounds,edges};
  const axis=bounds.maxX-bounds.minX>=bounds.maxY-bounds.minY?'X':'Y';
  edges.sort((a,b)=>(a['min'+axis]+a['max'+axis])-(b['min'+axis]+b['max'+axis]));
  const half=edges.length>>1;
  return {...bounds,left:tree(edges.slice(0,half)),right:tree(edges.slice(half))};
}
// Internal shared normal field for valid, nondegenerate closed polygon rings.
// Exposing this helper does not change Anamorphic profile preparation.
export function shadingTangents(points,radius){
  const cumulative=[0];
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];cumulative.push(cumulative[i]+Math.hypot(b.x-a.x,b.y-a.y));}
  const length=cumulative.at(-1);if(!length||!radius)return points.map(()=>null);
  const reach=Math.min(radius,length*.075);
  function at(s){
    s=((s%length)+length)%length;let lo=0,hi=points.length;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(cumulative[mid]<=s)lo=mid;else hi=mid;}
    const a=points[lo],b=points[(lo+1)%points.length],span=cumulative[lo+1]-cumulative[lo],u=span?(s-cumulative[lo])/span:0;
    return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u};
  }
  return points.map((p,i)=>{
    const a=at(cumulative[i]-reach),b=at(cumulative[i]+reach),ix=p.x-a.x,iy=p.y-a.y,ox=b.x-p.x,oy=b.y-p.y;
    const cosine=(ix*ox+iy*oy)/Math.max(1e-30,Math.hypot(ix,iy)*Math.hypot(ox,oy));
    if(cosine<.6)return null; // retain genuine serif/corner creases
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);
    return len?[dy/len,-dx/len]:null;
  });
}
export function prepareAnamorphicProfile(input,{maxEdges=16384,smoothRadius=1.4}={}) {
  if(!Array.isArray(input)||!Number.isInteger(maxEdges)||maxEdges<3||!Number.isFinite(smoothRadius)||smoothRadius<0)throw new TypeError('Invalid profile or edge budget');
  const edges=[],rings=[];
  for(const ring of input){
    const points=(ring.points||ring).map(p=>{
      if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw new TypeError('Non-finite profile point');
      return {x:p.x,y:p.y};
    });
    if(points.length<3)continue;
    rings.push(points);
    const shading=shadingTangents(points,smoothRadius);
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y;
      if(!dx&&!dy)continue;
      if(edges.length>=maxEdges)throw new RangeError('Profile edge budget exceeded');
      const length=Math.hypot(dx,dy),normal=[dy/length,-dx/length];
      edges.push({x:a.x,y:a.y,dx,dy,n0:shading[i]||normal,n1:shading[(i+1)%points.length]||normal,
        minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)});
    }
  }
  return {rings,edges,bounds:box(edges),tree:edges.length?tree(edges.slice()):null};
}
function lineBox(node,ox,oy,dx,dy) {
  let lo=-Infinity,hi=Infinity;
  for(const [o,d,min,max] of [[ox,dx,node.minX,node.maxX],[oy,dy,node.minY,node.maxY]]){
    if(Math.abs(d)<1e-14){if(o<min||o>max)return false;}
    else {const a=(min-o)/d,b=(max-o)/d;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return false;}
  }
  return true;
}
function events(profile,ox,oy,dx,dy,stats) {
  const hits=[],side=dx<0||(dx===0&&dy<0)?-1:1;
  function visit(node){
    if(!lineBox(node,ox,oy,dx,dy))return;
    if(!node.edges){visit(node.left);visit(node.right);return;}
    for(const e of node.edges){
      if(stats && ++stats.edgeTests>stats.maxEdgeTests)throw new RangeError('Ray edge-test budget exceeded');
      // Canonical half-open side, independent of the ray's travel direction.
      // Reversing the ray must not swap top/bottom boundary inclusion. Tangent
      // extrema still contribute zero or two events, never one.
      const sa=cross(dx,dy,e.x-ox,e.y-oy),sb=cross(dx,dy,e.x+e.dx-ox,e.y+e.dy-oy);
      if((sa*side>0)===(sb*side>0))continue;
      const det=cross(dx,dy,e.dx,e.dy);
      const t=cross(e.x-ox,e.y-oy,e.dx,e.dy)/det;
      if(!Number.isFinite(t))continue;
      const u=clamp(sa/(sa-sb),0,1),n=[e.n0[0]*(1-u)+e.n1[0]*u,e.n0[1]*(1-u)+e.n1[1]*u];
      // Geometric intersections remain exact. Only lighting normals are
      // interpolated, on this ring alone; no cross-counter smoothing.
      const face=[e.dy,-e.dx],dotFace=face[0]*dx+face[1]*dy,dotShade=n[0]*dx+n[1]*dy;
      hits.push({t,n:dotFace*dotShade<0?face:n});
    }
  }
  if(profile.tree)visit(profile.tree);
  hits.sort((a,b)=>a.t-b.t);
  return hits;
}
export function anamorphicContains(profile,x,y,stats=null) {
  if(!profile.tree||x<profile.bounds.minX||x>profile.bounds.maxX||y<profile.bounds.minY||y>profile.bounds.maxY)return false;
  let count=0;
  for(const hit of events(profile,x,y,1,0,stats))if(hit.t>0)count++;
  return count%2===1;
}
function intervals(profile,ox,oy,dx,dy,stats){
  if(!profile.tree)return [];
  if(Math.hypot(dx,dy)<1e-14)return anamorphicContains(profile,ox,oy,stats)?[{lo:-Infinity,hi:Infinity,n:null}]:[];
  const hit=events(profile,ox,oy,dx,dy,stats),result=[];
  // Each pair delimits an even-odd interior interval; zero-length tangencies
  // naturally disappear. No numerical distance stepping through thin ink.
  for(let i=0;i+1<hit.length;i+=2){
    if(hit[i+1].t<=hit[i].t)continue;
    let n=hit[i].n;if(n[0]*dx+n[1]*dy>0)n=[-n[0],-n[1]];
    result.push({lo:hit[i].t,hi:hit[i+1].t,n});
  }
  return result;
}
export function anamorphicRay(a,b,origin,direction,depth=1,stats=null){
  if(!Number.isFinite(depth)||depth<=0||origin.length!==3||direction.length!==3
    ||!origin.every(Number.isFinite)||!direction.every(Number.isFinite)||!Math.hypot(...direction))throw new TypeError('Invalid ray');
  const ax=intervals(a,origin[0],origin[1],direction[0],direction[1],stats);
  if(!ax.length)return null;
  const bz=intervals(b,-origin[2]/depth,origin[1],-direction[2]/depth,direction[1],stats);
  let i=0,j=0;
  while(i<ax.length&&j<bz.length){
    const x=ax[i],z=bz[j],lo=Math.max(x.lo,z.lo),hi=Math.min(x.hi,z.hi);
    if(hi>Math.max(0,lo)){
      // Callers start outside the solid. Entry from inside is explicitly
      // reported without an invented entry normal.
      if(lo<0)return {t:0,normal:null,inside:true};
      const fromA=x.lo>=z.lo,n=fromA?x.n:z.n;
      const normal=fromA?[n[0],n[1],0]:[0,n[1],-n[0]/depth];
      return {t:lo,normal:unit(normal),inside:false};
    }
    if(x.hi<z.hi)i++;else j++;
  }
  return null;
}
export function anamorphicView(settings={},phase=0){
  if(!Number.isFinite(phase))throw new TypeError('Invalid phase');
  const p=anamorphicSettings(settings),cycle=((phase%1)+1)%1;
  // A cosine shuttle returns to the identical solid/view at the loop seam.
  const degrees=p.yaw+45*p.motion*Math.cos(cycle*Math.PI*2),yaw=degrees*Math.PI/180,tilt=p.tilt*Math.PI/180;
  // Exact cardinal poses must not move boundary samples by cos(PI/2)'s tiny
  // residual. Do not snap nearby user poses or alter the continuous motion.
  const quadrant=degrees/90,cardinal=Number.isInteger(quadrant),q=((quadrant%4)+4)%4;
  const cy=cardinal?[1,0,-1,0][q]:Math.cos(yaw),sy=cardinal?[0,1,0,-1][q]:Math.sin(yaw),ct=Math.cos(tilt),st=Math.sin(tilt);
  return {right:[cy,0,-sy],down:[-sy*st,ct,-cy*st],toward:[sy*ct,st,cy*ct]};
}
function solidBox(a,b,depth){
  return {min:[a.bounds.minX,Math.max(a.bounds.minY,b.bounds.minY),-b.bounds.maxX*depth],
    max:[a.bounds.maxX,Math.min(a.bounds.maxY,b.bounds.maxY),-b.bounds.minX*depth]};
}
function rayBox(origin,direction,bounds){
  let lo=0,hi=Infinity;
  for(let i=0;i<3;i++){
    if(Math.abs(direction[i])<1e-14){if(origin[i]<bounds.min[i]||origin[i]>bounds.max[i])return false;}
    else {const a=(bounds.min[i]-origin[i])/direction[i],b=(bounds.max[i]-origin[i])/direction[i];
      lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));if(lo>hi)return false;}
  }
  return hi>lo;
}
export function renderAnamorphic(a,b,input={},frame={}){
  const {width=384,height=384,scale=1,centerX=0,centerY=0,samples=2,maxEdgeTests=100000000}=frame;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>4194304
    ||!Number.isInteger(samples)||samples<1||samples>4||![scale,centerX,centerY].every(Number.isFinite)||scale<=0
    ||!Number.isSafeInteger(maxEdgeTests)||maxEdgeTests<1)throw new RangeError('Invalid frame or work budget');
  const p=anamorphicSettings(input),view=anamorphicView(p,frame.phase??0),pixels=new Uint8ClampedArray(width*height*4);
  const stats={edgeTests:0,maxEdgeTests,rays:0,hits:0},bounds=solidBox(a,b,p.depth);
  if(!a.tree||!b.tree||bounds.min[1]>=bounds.max[1]||!p.opacity)return {pixels,width,height,stats};
  const ink=input.ink??[.21,.26,.25];
  if(!Array.isArray(ink)||ink.length!==3||!ink.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new TypeError('Invalid ink RGB');
  const distance=Math.max(...bounds.min.map(Math.abs),...bounds.max.map(Math.abs))*3+1;
  const direction=view.toward.map(v=>-v),key=unit([-.55,-.75,1]),rim=unit([.9,.25,.5]),half=unit([key[0],key[1],key[2]+1]);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let count=0,red=0,green=0,blue=0;
    for(let sy=0;sy<samples;sy++)for(let sx=0;sx<samples;sx++){
      const px=(x+(sx+.5)/samples-width/2)/scale+centerX,py=(y+(sy+.5)/samples-height/2)/scale+centerY;
      const origin=view.right.map((v,i)=>v*px+view.down[i]*py+view.toward[i]*distance);
      if(!rayBox(origin,direction,bounds))continue;
      stats.rays++;
      const hit=anamorphicRay(a,b,origin,direction,p.depth,stats);if(!hit)continue;
      stats.hits++;count++;
      if(p.unlit){red+=ink[0];green+=ink[1];blue+=ink[2];continue;}
      const n=hit.normal,nv=[dot(n,view.right),dot(n,view.down),dot(n,view.toward)];
      const diffuse=.22+.6*Math.max(0,dot(nv,key))+.17*Math.max(0,dot(nv,rim));
      const exponent=2+126*(1-p.roughness)**2,specular=Math.max(0,dot(nv,half))**exponent;
      const edge=(1-Math.max(0,nv[2]))**4;
      const sheen=specular*(.2+p.metal*.75)+edge*p.metal*.2;
      red+=clamp(ink[0]*diffuse+sheen,0,1);green+=clamp(ink[1]*diffuse+sheen,0,1);blue+=clamp(ink[2]*diffuse+sheen,0,1);
    }
    if(count){const k=(y*width+x)*4;pixels[k]=red/count*255;pixels[k+1]=green/count*255;pixels[k+2]=blue/count*255;
      pixels[k+3]=count/(samples*samples)*p.opacity*255;}
  }
  return {pixels,width,height,stats};
}
// Integrate horizontal support exactly over all vertex-height slabs. This
// diagnoses incompatible readings; it never fills, warps or deletes the input.
export function anamorphicCompatibility(a,b,{maxEdgeTests=100000000}={}){
  if(!Number.isSafeInteger(maxEdgeTests)||maxEdgeTests<1)throw new RangeError('Invalid compatibility budget');
  const stats={edgeTests:0,maxEdgeTests};
  const ys=[...new Set([...a.rings,...b.rings].flatMap(r=>r.map(p=>p.y)))].sort((x,y)=>x-y);
  let areaA=0,areaB=0,retainedA=0,retainedB=0;
  for(let i=0;i+1<ys.length;i++){
    const dy=ys[i+1]-ys[i],y=(ys[i]+ys[i+1])/2;
    const ia=intervals(a,0,y,1,0,stats),ib=intervals(b,0,y,1,0,stats);
    const wa=ia.reduce((s,q)=>s+q.hi-q.lo,0),wb=ib.reduce((s,q)=>s+q.hi-q.lo,0);
    areaA+=wa*dy;areaB+=wb*dy;if(wb>0)retainedA+=wa*dy;if(wa>0)retainedB+=wb*dy;
  }
  return {areaA,areaB,retainedA,retainedB,lossA:areaA?1-retainedA/areaA:0,lossB:areaB?1-retainedB/areaB:0,edgeTests:stats.edgeTests};
}
