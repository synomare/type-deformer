// Original source-material dissection and alternating rigid-panel deployment.
// No font, paper implementation, external mesh or solver is included.
export function normalizeAuxeticSettings(input = {}) {
  const normalized = (() => {
  const n = (key, fallback, min, max) => Math.max(min,Math.min(max,Number.isFinite(input[key])?input[key]:fallback));
  return { opening:n('opening',28,0,90), module:n('module',24,6,96), aspect:n('aspect',1,.25,4),
    axis:n('axis',0,-180,180), ligament:n('ligament',.65,0,1), motion:n('motion',.65,0,1) };
})();
  return globalThis.TypeDeformerParameters ? globalThis.TypeDeformerParameters.core('auxetic',input,normalized) : normalized;
}

export const AUXETIC_TYPE_STARTS = Object.freeze({
  aperture:Object.freeze({opening:28,module:24,aspect:1,axis:0,ligament:.75,motion:.65}),
  lancet:Object.freeze({opening:43,module:26,aspect:3.4,axis:28,ligament:.8,motion:.55}),
  cipher:Object.freeze({opening:78,module:38,aspect:.65,axis:-20,ligament:.5,motion:.8})
});

export function auxeticArea(points) {
  let area=0;
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];area+=a.x*b.y-b.x*a.y;}
  return area/2;
}

function boundsOf(points) {
  const b=[Infinity,Infinity,-Infinity,-Infinity];
  for(const p of points){b[0]=Math.min(b[0],p.x);b[1]=Math.min(b[1],p.y);b[2]=Math.max(b[2],p.x);b[3]=Math.max(b[3],p.y);}
  return b;
}

export function prepareAuxeticGlyph(contours) {
  const rings=[];
  for(const contour of contours){
    if(!contour.points||contour.points.length<3)continue;
    const points=contour.points.map(p=>{if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw new TypeError('Invalid Auxetic source point');return{x:p.x,y:p.y};});
    const area=auxeticArea(points);if(!Number.isFinite(area))throw new RangeError('Auxetic source exceeds numeric precision');if(Math.abs(area)<1e-12)continue;
    rings.push({points,area,bounds:boundsOf(points)});
  }
  if(!rings.length)return{rings,bounds:null,center:{x:0,y:0},pointCount:0};
  if(rings.reduce((sum,r)=>sum+r.area,0)<=0)throw new RangeError('Auxetic source requires positive outer winding and negative counters');
  const bounds=boundsOf(rings.flatMap(r=>r.points));
  return{rings,bounds,center:{x:(bounds[0]+bounds[2])/2,y:(bounds[1]+bounds[3])/2},pointCount:rings.reduce((sum,r)=>sum+r.points.length,0)};
}

// Oriented half-plane clipping. Concave pieces may have coincident boundary
// walks; nonzero winding, not even-odd or ring-by-ring positive filling, is
// required to cancel those walks and subtract clipped counter material.
export function clipAuxeticRing(points, bounds) {
  let result=points.map(p=>({x:p.x,y:p.y}));
  for(const [axis,limit,sign] of [['x',bounds[0],1],['x',bounds[2],-1],['y',bounds[1],1],['y',bounds[3],-1]]){
    const input=result;result=[];if(!input.length)break;
    let a=input[input.length-1],insideA=sign*(a[axis]-limit)>=0;
    for(const b of input){
      const insideB=sign*(b[axis]-limit)>=0;
      if(insideA!==insideB){const t=(limit-a[axis])/(b[axis]-a[axis]);const p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};p[axis]=limit;result.push(p);}
      if(insideB)result.push({x:b.x,y:b.y});a=b;insideA=insideB;
    }
  }
  // Remove only exactly repeated vertices; retain every actual source segment.
  result=result.filter((p,i)=>!i||p.x!==result[i-1].x||p.y!==result[i-1].y);
  if(result.length>1&&result[0].x===result.at(-1).x&&result[0].y===result.at(-1).y)result.pop();
  return result.length>=3?result:[];
}

// Intersections with a cut face, using all oriented rings together. A hole
// is never a positive cut interval. Coordinates are in the fixed cut frame.
export function auxeticCutIntervals(rings,axis,value,lo,hi) {
  const across=axis==='x'?'y':'x',events=[];
  for(const ring of rings)for(let i=0;i<ring.points.length;i++){
    const a=ring.points[i],b=ring.points[(i+1)%ring.points.length];
    if(!((a[axis]<=value&&value<b[axis])||(b[axis]<=value&&value<a[axis])))continue;
    const t=(value-a[axis])/(b[axis]-a[axis]);
    events.push({at:a[across]+(b[across]-a[across])*t,delta:b[axis]>a[axis]?1:-1});
  }
  events.sort((a,b)=>a.at-b.at);const intervals=[];let winding=0,previous=null;
  for(let i=0;i<events.length;){
    const at=events[i].at;
    if(winding&&previous!==null){const a=Math.max(lo,previous),b=Math.min(hi,at);if(b>a+1e-9)intervals.push([a,b]);}
    let delta=0;while(i<events.length&&Math.abs(events[i].at-at)<1e-10)delta+=events[i++].delta;
    winding+=delta;previous=at;
  }
  return intervals;
}

export function compileAuxeticGlyph(glyph,input={},budget={}) {
  const settings=normalizeAuxeticSettings(input),radians=settings.axis*Math.PI/180,ca=Math.cos(radians),sa=Math.sin(radians);
  const px=settings.module*Math.sqrt(settings.aspect),py=settings.module/Math.sqrt(settings.aspect);
  const result={glyph,settings,px,py,ca,sa,panels:[],joints:[],pointCount:0};if(!glyph.bounds)return result;
  const rings=glyph.rings.map(r=>{const points=r.points.map(p=>{const x=p.x-glyph.center.x,y=p.y-glyph.center.y;return{x:ca*x+sa*y,y:-sa*x+ca*y};});return{points,bounds:boundsOf(points)};});
  const b=boundsOf(rings.flatMap(r=>r.points)),i0=Math.floor(b[0]/px),i1=Math.ceil(b[2]/px)-1,j0=Math.floor(b[1]/py),j1=Math.ceil(b[3]/py)-1;
  const maxCells=budget.maxCells??8192,maxPoints=budget.maxPoints??262144;
  if(!Number.isInteger(maxCells)||maxCells<1||!Number.isInteger(maxPoints)||maxPoints<1)throw new RangeError('Invalid Auxetic geometry budget');
  if((i1-i0+1)*(j1-j0+1)>maxCells)throw new RangeError('Auxetic cell budget exceeded');
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
    const bounds=[i*px,j*py,(i+1)*px,(j+1)*py],pieces=[];
    for(const ring of rings){
      if(ring.bounds[0]>=bounds[2]||ring.bounds[2]<=bounds[0]||ring.bounds[1]>=bounds[3]||ring.bounds[3]<=bounds[1])continue;
      const points=clipAuxeticRing(ring.points,bounds),area=auxeticArea(points);
      if(Math.abs(area)<1e-12)continue;
      result.pointCount+=points.length;if(result.pointCount>maxPoints)throw new RangeError('Auxetic point budget exceeded');
      pieces.push({points,area});
    }
    // A counter-only interior cell has exactly cancelling oriented material.
    // Retain nonzero material, including disconnected fragments of one cell.
    const area=pieces.reduce((sum,r)=>sum+r.area,0);
    if(area>1e-10)result.panels.push({i,j,x:(i+.5)*px,y:(j+.5)*py,pieces,area});
  }
  const panelAt=new Map(result.panels.map(p=>[p.i+':'+p.j,p]));
  for(const panel of result.panels)for(const axis of ['x','y']){
    const neighbour=panelAt.get((panel.i+(axis==='x'?1:0))+':'+(panel.j+(axis==='y'?1:0)));if(!neighbour)continue;
    const value=axis==='x'?(panel.i+1)*px:(panel.j+1)*py,lo=axis==='x'?panel.j*py:panel.i*px,hi=lo+(axis==='x'?py:px);
    // Require real ink on both sides of the cut, not a tangent boundary.
    const epsilon=Math.min(px,py)*1e-8;
    const left=auxeticCutIntervals(rings,axis,value-epsilon,lo,hi),right=auxeticCutIntervals(rings,axis,value+epsilon,lo,hi);
    for(const a of left)for(const b of right){
      const low=Math.max(a[0],b[0]),high=Math.min(a[1],b[1]);
      if(high-low>1e-8)result.joints.push({a:panel,b:neighbour,axis,value,lo:low,hi:high});
    }
  }
  return result;
}

export function auxeticDeployment(compiled,opening,phase=0,motion=0) {
  if(!Number.isFinite(opening)||!Number.isFinite(motion))throw new TypeError('Invalid Auxetic deployment');
  const loop=Number.isFinite(phase)?((phase%1)+1)%1:0;
  const angle=Math.max(0,Math.min(90,opening))*(1-Math.max(0,Math.min(1,motion))*(1-Math.cos(loop*Math.PI*2))/2)*Math.PI/180;
  const c=Math.cos(angle),s=Math.sin(angle),{px,py}=compiled;
  return{angle,c,s,stepX:px*c+py*s,stepY:py*c+px*s};
}

export function auxeticPanelMatrix(compiled,panel,deployment) {
  const {ca,sa,px,py,glyph}=compiled,{c,s,stepX,stepY}=deployment;
  const sn=((panel.i+panel.j)&1)?-s:s;
  const a=ca*c-sa*sn,b=sa*c+ca*sn,cc=-ca*sn-sa*c,d=-sa*sn+ca*c;
  const x=panel.x*stepX/px,y=panel.y*stepY/py;
  return{a,b,c:cc,d,e:glyph.center.x+ca*x-sa*y-a*panel.x-cc*panel.y,
    f:glyph.center.y+sa*x+ca*y-b*panel.x-d*panel.y};
}

function pointSegmentDistance(point,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;
  const t=d2?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/d2)):0;
  return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);
}

function ligamentRing(joint,ma,mb,amount,tolerance) {
  const mid=(joint.lo+joint.hi)/2,width=(joint.hi-joint.lo)*amount/2;
  const source=joint.axis==='x'?{x:joint.value,y:mid}:{x:mid,y:joint.value};
  const point=(m,p)=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f});
  const a=point(ma,source),b=point(mb,source),distance=Math.hypot(b.x-a.x,b.y-a.y);
  if(distance<1e-9||width<1e-9)return null;
  const nx=joint.axis==='x'?1:0,ny=1-nx,orientation=joint.axis==='x'?1:-1;
  const na={x:ma.a*nx+ma.c*ny,y:ma.b*nx+ma.d*ny},nb={x:mb.a*nx+mb.c*ny,y:mb.b*nx+mb.d*ny};
  const handle=distance*.42,p1={x:a.x+na.x*handle,y:a.y+na.y*handle},p2={x:b.x-nb.x*handle,y:b.y-nb.y*handle};
  function boundary(t,side) {
    const u=1-t;
    const p={x:u*u*u*a.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*b.y};
    const dx=3*u*u*(p1.x-a.x)+6*u*t*(p2.x-p1.x)+3*t*t*(b.x-p2.x),dy=3*u*u*(p1.y-a.y)+6*u*t*(p2.y-p1.y)+3*t*t*(b.y-p2.y);
    const length=Math.hypot(dx,dy),taper=.28+.72*Math.pow(Math.abs(2*t-1),1.25);
    const ox=side*orientation*(-dy)/Math.max(1e-12,length)*width*taper,oy=side*orientation*dx/Math.max(1e-12,length)*width*taper;
    return{x:p.x+ox,y:p.y+oy};
  }
  let subdivisions=0,maxErrorEstimate=0;
  function flatten(side) {
    const points=[boundary(0,side)];
    function segment(t0,q0,t1,q1,depth) {
      const span=t1-t0,tests=[t0+span*.25,t0+span*.5,t0+span*.75].map(t=>boundary(t,side));
      const error=Math.max(...tests.map(q=>pointSegmentDistance(q,q0,q1)));
      if(error>tolerance){
        if(depth>=24||subdivisions>=8192)throw new RangeError('Auxetic ligament precision budget exceeded');
        const tm=(t0+t1)/2,qm=tests[1];subdivisions++;
        segment(t0,q0,tm,qm,depth+1);segment(tm,qm,t1,q1,depth+1);
      }else{points.push(q1);maxErrorEstimate=Math.max(maxErrorEstimate,error);}
    }
    segment(0,points[0],1,boundary(1,side),0);return points;
  }
  const left=flatten(1),right=flatten(-1);
  const points=left.concat(right.reverse());if(auxeticArea(points)<0)points.reverse();
  return {points,area:auxeticArea(points),panel:null,ligament:true,subdivisions,maxErrorEstimate};
}

export function renderAuxeticGlyph(compiled,input={},phase=0,options={}) {
  const settings=normalizeAuxeticSettings({...compiled.settings,...input});
  const maxPoints=options.maxPoints??524288,tolerance=options.tolerance??.08;
  if(!Number.isInteger(maxPoints)||maxPoints<1||!Number.isFinite(tolerance)||tolerance<=0)throw new RangeError('Invalid Auxetic output budget');
  if(settings.module!==compiled.settings.module||settings.aspect!==compiled.settings.aspect||settings.axis!==compiled.settings.axis)throw new Error('Auxetic cut layout requires recompilation');
  const deployment=auxeticDeployment(compiled,settings.opening,phase,settings.motion);
  if(!compiled.glyph.bounds)return{rings:[],bounds:null,panels:0,deployment};
  // Identity returns original rings once, avoiding artificial raster cut seams.
  if(deployment.angle===0){
    if(compiled.glyph.pointCount>maxPoints)throw new RangeError('Auxetic output point budget exceeded');
    return{rings:compiled.glyph.rings.map(r=>({points:r.points.map(p=>({...p})),area:r.area,panel:null})),bounds:compiled.glyph.bounds.slice(),panels:compiled.panels.length,deployment};
  }
  const rings=[],matrices=new Map(compiled.panels.map(panel=>[panel,auxeticPanelMatrix(compiled,panel,deployment)]));
  for(const panel of compiled.panels){const m=matrices.get(panel);
    for(const piece of panel.pieces)rings.push({panel:[panel.i,panel.j],area:piece.area,points:piece.points.map(p=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f}))});
  }
  let pointCount=rings.reduce((sum,r)=>sum+r.points.length,0);
  if(pointCount>maxPoints)throw new RangeError('Auxetic output point budget exceeded');
  if(settings.ligament>0)for(const joint of compiled.joints){
    const ring=ligamentRing(joint,matrices.get(joint.a),matrices.get(joint.b),settings.ligament,tolerance);
    if(ring){pointCount+=ring.points.length;if(pointCount>maxPoints)throw new RangeError('Auxetic output point budget exceeded');rings.push(ring);}
  }
  return{rings,bounds:rings.length?boundsOf(rings.flatMap(r=>r.points)):null,panels:compiled.panels.length,deployment};
}

// Maximum singular value maps local approximation error to physical pixels,
// including output scale, rotation, mirror and skew.
export function auxeticPixelTolerance(matrix,pixelError=.2) {
  const {a,b,c,d}=matrix;
  if(![a,b,c,d,pixelError].every(Number.isFinite)||pixelError<=0)throw new TypeError('Invalid Auxetic output transform');
  const scale=Math.max(Math.abs(a),Math.abs(b),Math.abs(c),Math.abs(d));if(scale===0)return 10;
  const an=a/scale,bn=b/scale,cn=c/scale,dn=d/scale;
  const aa=an*an+bn*bn,cc=cn*cn+dn*dn,ac=an*cn+bn*dn;
  const sigma=scale*Math.sqrt((aa+cc+Math.hypot(aa-cc,2*ac))/2);
  const tolerance=sigma>0?pixelError/sigma:10;
  if(tolerance<.00001)throw new RangeError('Output scale exceeds Auxetic precision budget');
  return Math.min(10,tolerance);
}

// Active prepared layouts only. Repeated copies share one entry; when the
// explicit point budget is exceeded, no active glyph is silently evicted.
export function createAuxeticSourcePool(options={}) {
  const limit=options.pointLimit??262144;
  if(!Number.isInteger(limit)||limit<1)throw new RangeError('Invalid Auxetic source budget');
  let entries=new Map(),points=0,paused=false;
  function sync(requests){
    const next=new Map();
    for(const request of requests)if(!next.has(request.key))next.set(request.key,entries.get(request.key)||{request,data:null,error:''});
    entries=next;points=[...entries.values()].reduce((sum,entry)=>sum+(entry.data?.pointCount||0),0);
  }
  function advance(){
    if(paused)return false;const entry=[...entries.values()].find(e=>!e.data&&!e.error);if(!entry)return false;
    try{
      const data=entry.request.load(Math.max(0,limit-points));
      if(!Number.isInteger(data.pointCount)||data.pointCount<0)throw new Error('Invalid Auxetic glyph source');
      if(points+data.pointCount>limit)throw new RangeError('Auxetic source budget exceeded');
      entry.data=data;points+=data.pointCount;
    }catch(error){entry.error=error.message||String(error);}return true;
  }
  function retry(){for(const entry of entries.values())entry.error='';paused=false;}
  function state(){const all=[...entries.values()],ready=all.filter(e=>e.data).length;
    return{total:all.length,ready,pending:all.some(e=>!e.data&&!e.error),paused,points,error:all.find(e=>e.error)?.error||'',limit};}
  function inspect(key){const entry=entries.get(key);return{status:!entry?'missing':entry.data?'ready':entry.error?'error':'pending',error:entry?.error||''};}
  return{sync,advance,retry,state,inspect,read:key=>entries.get(key)?.data||null,setPaused:value=>{paused=!!value;},reset:()=>{entries.clear();points=0;paused=false;}};
}
