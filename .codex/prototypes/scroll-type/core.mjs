// A cut glyph sheet bent along an arc-length directrix. No font template,
// glyph overlay, physical cloth solve, browser registration or shadow study.
import {renderAnamorphicSurface} from '../anamorphic-type/surface.mjs';
import {shadingTangents} from '../anamorphic-type/core.mjs';
const TAU=2*Math.PI, clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const opt=(v,d,a,b)=>Number.isFinite(v)?clamp(v,a,b):d;
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((r,v,i)=>r+v*b[i],0);
const unit=a=>{const n=Math.hypot(...a);return n?a.map(v=>v/n):[0,0,1];};
export const SCROLL_PRESETS=Object.freeze({
  volute:Object.freeze({mode:'spiral',curl:1.15,taper:.85,gauge:.012,yaw:-28,tilt:-22,motion:0,metal:.65,roughness:.2}),
  scroll:Object.freeze({mode:'roll',curl:.62,taper:0,gauge:.008,yaw:28,tilt:18,motion:0,metal:.25,roughness:.3}),
  reverse:Object.freeze({mode:'reverse',curl:1.25,taper:0,gauge:.01,yaw:-30,tilt:-15,motion:0,metal:.55,roughness:.24})
});
export function scrollSettings(p={}){
  return {mode:['roll','spiral','reverse'].includes(p.mode)?p.mode:'spiral',curl:opt(p.curl,1.15,-3,3),
    taper:opt(p.taper,.85,-.95,.95),gauge:opt(p.gauge,.012,0,.03),
    yaw:opt(p.yaw,-28,-180,180),tilt:opt(p.tilt,-22,-80,80),motion:opt(p.motion,0,0,1),
    metal:opt(p.metal,.65,0,1),roughness:opt(p.roughness,.2,.04,1),opacity:opt(p.opacity,1,0,1),unlit:!!p.unlit};
}
function angle(v,span,p,phase){
  const time=((phase%1)+1)%1,drive=1-p.motion*.4*(1-Math.cos(TAU*time));
  const k=TAU*p.curl*drive,s=v/span;
  if(p.mode==='reverse')return {theta:2*k*s*s,curvature:4*k*s/span};
  if(p.mode==='spiral')return {theta:k*(s+p.taper*s*s),curvature:k*(1+2*p.taper*s)/span};
  return {theta:k*s,curvature:k/span};
}
// Eight-point Gauss-Legendre, split by a conservative angular-variation bound.
// This integrates unit tangents, not linearly interpolated sampled positions.
const GX=[.1834346424956498,.525532409916329,.7966664774136267,.9602898564975363];
const GW=[.362683783378362,.3137066458778873,.2223810344533745,.1012285362903763];
export function scrollSection(v,span,input={},phase=0){
  if(!Number.isFinite(v)||!Number.isFinite(span)||span<=0||Math.abs(v)>span*.500000000001||!Number.isFinite(phase))throw new RangeError('Invalid scroll section');
  const p=scrollSettings(input),state=angle(v,span,p,phase);
  if(!p.curl)return {y:v,z:0,theta:0,curvature:0};
  const divisions=Math.max(1,Math.ceil(Math.abs(v)*12*Math.PI/span/.35));
  let y=0,z=0;
  for(let j=0;j<divisions;j++){
    const a=v*j/divisions,b=v*(j+1)/divisions,m=(a+b)/2,h=(b-a)/2;
    for(let i=0;i<4;i++)for(const sign of [-1,1]){const t=angle(m+sign*h*GX[i],span,p,phase).theta;y+=h*GW[i]*Math.cos(t);z+=h*GW[i]*Math.sin(t);}
  }
  return {y,z,...state};
}
function contains(r,x,y){let yes=false;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];if((a.v>y)!==(b.v>y)&&x<(b.u-a.u)*(y-a.v)/(b.v-a.v)+a.u)yes=!yes;}return yes;}
function area(r){const o=r[0];let sum=0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];sum+=(a.u-o.u)*(b.v-o.v)-(b.u-o.u)*(a.v-o.v);}return sum/2;}
function edgeAt(e,v){if(v===e.a.v)return e.a.u;if(v===e.b.v)return e.b.u;return e.a.u+(e.b.u-e.a.u)*(v-e.a.v)/(e.b.v-e.a.v);}
export function prepareScrollSource(input,{axis=0,steps=480,rimSmoothing=.007,maxPoints=100000,maxTriangles=200000,maxWork=5000000}={}){
  if(!Array.isArray(input)||!Number.isFinite(axis)||!Number.isInteger(steps)||steps<8||steps>4096
    ||!Number.isFinite(rimSmoothing)||rimSmoothing<0||rimSmoothing>.03
    ||![maxPoints,maxTriangles,maxWork].every(n=>Number.isSafeInteger(n)&&n>0))throw new RangeError('Invalid scroll source options');
  const a=axis*Math.PI/180,ux=Math.cos(a),uy=Math.sin(a),rings=[];
  let minV=Infinity,maxV=-Infinity,inputPoints=0;
  for(const ring of input){const r=[];for(const q of (ring.points||ring)){
    if(!q||!Number.isFinite(q.x)||!Number.isFinite(q.y))throw new TypeError('Invalid source point');
    if(++inputPoints>16384)throw new RangeError('Scroll source edge budget exceeded');
    const u=q.x*ux+q.y*uy,v=-q.x*uy+q.y*ux;
    if(!Number.isFinite(u)||!Number.isFinite(v))throw new RangeError('Source rotation overflow');
    if(!r.length||u!==r.at(-1).u||v!==r.at(-1).v)r.push({u,v});
  }if(r.length>1&&r[0].u===r.at(-1).u&&r[0].v===r.at(-1).v)r.pop();if(r.length>=3&&area(r)!==0)rings.push(r);}
  // Simple non-touching nested rings: winding belongs to the filled material,
  // not the input font convention. Self-intersecting rings are not supported.
  for(const r of rings){const depth=rings.filter(q=>q!==r&&contains(q,r[0].u,r[0].v)).length;if((area(r)>0)!==(depth%2===0))r.reverse();for(const p of r){minV=Math.min(minV,p.v);maxV=Math.max(maxV,p.v);}}
  const span=rings.length?maxV-minV:1,center=rings.length?(minV+maxV)/2:0;
  if(!Number.isFinite(span)||span<=0)throw new RangeError('Invalid source extent');
  const levels=[...new Set([...rings.flatMap(r=>r.map(p=>p.v)),...Array.from({length:rings.length?steps+1:0},(_,i)=>minV+span*i/steps)])].sort((a,b)=>a-b);
  const points=[],front=[],walls=[],wallNormals=[],lookup=new Map(),edges=[];let work=0;
  const tick=()=>{if(++work>maxWork)throw new RangeError('Scroll preparation work budget exceeded');};
  const node=(u,v)=>{const key=u+','+v;let id=lookup.get(key);if(id===undefined){id=points.length/2;if(id>=maxPoints)throw new RangeError('Scroll point budget exceeded');lookup.set(key,id);points.push(u,v);}return id;};
  const triangle=(a,b,c)=>{if((points[b*2]-points[a*2])*(points[c*2+1]-points[a*2+1])===(points[c*2]-points[a*2])*(points[b*2+1]-points[a*2+1]))return;front.push(a,b,c);if(front.length/3*2+walls.length*1>maxTriangles)throw new RangeError('Scroll triangle budget exceeded');};
  for(const r of rings){
    const shading=shadingTangents(r.map(p=>({x:p.u,y:p.v})),span*rimSmoothing);
    for(let i=0;i<r.length;i++){
      const a=r[i],b=r[(i+1)%r.length],du=b.u-a.u,dv=b.v-a.v,length=Math.hypot(du,dv),normal=[dv/length,-du/length];
      // Never use a filtered normal across the opposite side of this edge.
      const safe=n=>n&&n[0]*dv-n[1]*du>0?n:normal;
      edges.push({a,b,n0:safe(shading[i]),n1:safe(shading[(i+1)%r.length]),low:Math.min(a.v,b.v),high:Math.max(a.v,b.v)});
    }
  }
  const sorted=edges.filter(e=>e.low!==e.high).sort((a,b)=>a.low-b.low),active=new Set();let cursor=0;
  for(let j=0;j+1<levels.length;j++){
    const v0=levels[j],v1=levels[j+1];while(cursor<sorted.length&&sorted[cursor].low<=v0)active.add(sorted[cursor++]);
    const hits=[];for(const e of active){tick();if(e.high<v1){active.delete(e);continue;}hits.push(e);}
    hits.sort((a,b)=>(edgeAt(a,v0)/2+edgeAt(a,v1)/2)-(edgeAt(b,v0)/2+edgeAt(b,v1)/2));
    if(hits.length%2)throw new Error('Odd scroll crossing count');
    for(let i=0;i<hits.length;i+=2){const l=hits[i],r=hits[i+1],q=[node(edgeAt(l,v0),v0),node(edgeAt(r,v0),v0),node(edgeAt(r,v1),v1),node(edgeAt(l,v1),v1)];triangle(q[0],q[1],q[2]);triangle(q[0],q[2],q[3]);}
  }
  function lower(v){let a=0,b=levels.length;while(a<b){const m=(a+b)>>1;if(levels[m]<v)a=m+1;else b=m;}return a;}
  function wall(e,a,b){
    walls.push(a,b);
    for(const id of [a,b]){
      const du=e.b.u-e.a.u,dv=e.b.v-e.a.v;
      const t=clamp(Math.abs(du)>Math.abs(dv)?(points[id*2]-e.a.u)/du:(points[id*2+1]-e.a.v)/dv,0,1);
      wallNormals.push(e.n0[0]*(1-t)+e.n1[0]*t,e.n0[1]*(1-t)+e.n1[1]*t);
    }
  }
  for(const e of edges){
    if(e.low===e.high){wall(e,node(e.a.u,e.a.v),node(e.b.u,e.b.v));continue;}
    const lo=lower(e.low),hi=lower(e.high),forward=e.a.v<e.b.v;
    for(let j=lo;j<hi;j++){tick();const a=node(edgeAt(e,levels[j]),levels[j]),b=node(edgeAt(e,levels[j+1]),levels[j+1]);wall(e,...(forward?[a,b]:[b,a]));}
  }
  if(front.length/3*2+walls.length>maxTriangles)throw new RangeError('Scroll triangle budget exceeded');
  return {kind:'scroll-source-v1',axis,ux,uy,span,center,rings,levels:Float64Array.from(levels),points:Float64Array.from(points),front:Uint32Array.from(front),walls:Uint32Array.from(walls),wallNormals:Float64Array.from(wallNormals),rimSmoothing,stats:{inputPoints,points:points.length/2,frontTriangles:front.length/3,wallSegments:walls.length/2,work},maxTriangles};
}
export function buildScrollSurface(source,input={},phase=0){
  if(source?.kind!=='scroll-source-v1'||!Number.isFinite(phase))throw new TypeError('Invalid scroll source or phase');
  const p=scrollSettings(input),h=p.gauge*source.span/2,sections=new Map();
  const sect=v=>{let s=sections.get(v);if(!s){s=scrollSection(v-source.center,source.span,p,phase);sections.set(v,s);}return s;};
  const positions=[],normals=[],faceNormals=[],sourceAxis=[],bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  const vertex=(id,side)=>{const u=source.points[id*2],v=source.points[id*2+1],s=sect(v),sn=Math.sin(s.theta),cs=Math.cos(s.theta),off=side*h;
    const y=s.y+source.center-off*sn,z=s.z+off*cs;
    return {p:[source.ux*u-source.uy*y,source.uy*u+source.ux*y,z],n:[source.uy*sn*side,-source.ux*sn*side,cs*side],s};};
  const triangle=(a,b,c,axis)=>{const face=cross(sub(b.p,a.p),sub(c.p,a.p));if(!face.some(v=>v))return;
    if(![...a.p,...b.p,...c.p,...a.n,...b.n,...c.n,...face].every(Number.isFinite))throw new RangeError('Scroll geometry overflow');
    if(sourceAxis.length>=source.maxTriangles)throw new RangeError('Scroll triangle budget exceeded');
    // Visibility/winding must not depend on the filtered lighting field.
    if(dot(face,(a.g||a.n).map((v,i)=>v+(b.g||b.n)[i]+(c.g||c.n)[i]))<0)[b,c]=[c,b];
    const normal=unit(cross(sub(b.p,a.p),sub(c.p,a.p)));
    for(const q of [a,b,c]){positions.push(...q.p);normals.push(...q.n);for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],q.p[k]);bounds.max[k]=Math.max(bounds.max[k],q.p[k]);}}
    faceNormals.push(...normal);sourceAxis.push(axis);
  };
  const front=Array.from({length:source.points.length/2},(_,i)=>vertex(i,1)),back=Array.from({length:source.points.length/2},(_,i)=>vertex(i,-1));
  for(let i=0;i<source.front.length;i+=3){const [a,b,c]=source.front.slice(i,i+3);triangle(front[a],front[b],front[c],0);triangle(back[c],back[b],back[a],1);}
  if(h)for(let i=0;i<source.walls.length;i+=2){const a=source.walls[i],b=source.walls[i+1],du=source.points[b*2]-source.points[a*2],dv=source.points[b*2+1]-source.points[a*2+1];
    const side=(id,sign,end)=>{const q=sign>0?front[id]:back[id],s=q.s,d=1-sign*h*s.curvature,cs=Math.cos(s.theta),sn=Math.sin(s.theta);
      const rotate=(x,y,z)=>unit([source.ux*x-source.uy*y,source.uy*x+source.ux*y,z]);
      const g=rotate(dv*d,-du*cs,-du*sn);
      if(!source.rimSmoothing||!source.wallNormals)return {p:q.p,n:g};
      // Cofactor of the sheet deformation: equivalent to inverse-transpose
      // normal transport up to a positive scalar. Do not rotate normals only.
      const k=i*2+end*2,nu=source.wallNormals[k],nv=source.wallNormals[k+1];
      return {p:q.p,n:rotate(nu*d,nv*cs,nv*sn),g};};
    const q=[side(a,-1,0),side(b,-1,1),side(b,1,1),side(a,1,0)];triangle(q[0],q[1],q[2],2);triangle(q[0],q[2],q[3],2);
  }
  return {positions:Float64Array.from(positions),normals:Float64Array.from(normals),faceNormals:Float64Array.from(faceNormals),sourceAxis:Uint8Array.from(sourceAxis),triangleCount:sourceAxis.length,bounds,stats:{sections:sections.size,triangles:sourceAxis.length},settings:p};
}
export function renderScrollSurface(mesh,input={},frame={}){
  const p=scrollSettings(input);
  const ink=input.ink??[.56,.48,.37],back=input.backInk??ink,edge=input.edgeInk??ink;
  return renderAnamorphicSurface(mesh,{...p,finish:input.finish,ink,axisInks:[ink,back,edge],motion:0,depth:1},frame);
}
