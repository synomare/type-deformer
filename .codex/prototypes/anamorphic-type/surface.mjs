// Cached boundary of A(x,y) AND B(-z,y). Depth is a later affine transform.
// Polygon-height slabs, not a voxel resolution: no source vertices discarded.
// Display triangle soup, not a welded/manufacturing mesh. core.mjs is the oracle.
import {anamorphicSettings,anamorphicView} from './core.mjs';
import {prepareStudio,studioChannel} from './studio.mjs';
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const unit=a=>{const d=Math.hypot(...a);return a.map(v=>v/d);};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function atY(e,y){
  // Shared source vertices are reproduced exactly at slab joins.
  if(y===e.y)return e.x;
  if(y===(e.dy>0?e.maxY:e.minY))return e.dx>0?e.maxX:e.minX;
  return e.x+e.dx*((y-e.y)/e.dy);
}
function edgeNormal(e,x,y,axis,sign){
  const t=clamp(Math.abs(e.dx)>Math.abs(e.dy)?(x-e.x)/e.dx:(y-e.y)/e.dy,0,1);
  const nx=(e.n0[0]*(1-t)+e.n1[0]*t)*sign,ny=(e.n0[1]*(1-t)+e.n1[1]*t)*sign;
  return axis===0?[nx,ny,0]:[0,ny,-nx];
}
function sweep(profile,tick){
  const edges=profile.edges.filter(e=>e.dy).sort((a,b)=>a.minY-b.minY),active=new Set();let cursor=0;
  return (y0,y1)=>{
    // Test the slab endpoints, not a rounded midpoint that can equal a vertex
    // when two consecutive source heights are adjacent floating-point values.
    while(cursor<edges.length&&edges[cursor].minY<=y0)active.add(edges[cursor++]);
    const hits=[];
    for(const e of active){tick();if(e.maxY<y1){active.delete(e);continue;}hits.push({e,x:atY(e,y0)/2+atY(e,y1)/2});}
    hits.sort((a,b)=>a.x-b.x);
    if(hits.length%2)throw new Error('Odd profile crossing count');
    const pairs=[];for(let i=0;i+1<hits.length;i+=2)if(atY(hits[i+1].e,y0)>atY(hits[i].e,y0)||atY(hits[i+1].e,y1)>atY(hits[i].e,y1))pairs.push([hits[i].e,hits[i+1].e]);
    return pairs;
  };
}
const intervalsAt=(pairs,y)=>pairs.map(p=>p.map(e=>atY(e,y))).filter(p=>p[1]>p[0]);
const member=(intervals,x)=>intervals.some(p=>p[0]<x&&x<p[1]);
export function buildAnamorphicSurface(a,b,{maxTriangles=200000,maxWork=20000000,indexed=false}={}){
  if(!Number.isSafeInteger(maxTriangles)||maxTriangles<1||!Number.isSafeInteger(maxWork)||maxWork<1)throw new RangeError('Invalid surface budget');
  const positions=[],normals=[],faceNormals=[],sourceAxis=[];
  const indices=[],vertices=indexed?new Map():null;
  const stats={triangles:0,slabs:0,caps:0,work:0};
  const tick=()=>{if(++stats.work>maxWork)throw new RangeError('Surface work budget exceeded');};
  function triangle(p,n,face,axis){
    const area=cross(sub(p[1],p[0]),sub(p[2],p[0]));
    if(!area.some(v=>v))return;
    if(![...p.flat(),...n.flat(),...area].every(Number.isFinite))throw new RangeError('Non-finite surface geometry');
    if(stats.triangles>=maxTriangles)throw new RangeError('Surface triangle budget exceeded');
    if(dot(area,face)<0){[p[1],p[2]]=[p[2],p[1]];[n[1],n[2]]=[n[2],n[1]];}
    if(indexed){
      for(let i=0;i<3;i++){
        const component=v=>Object.is(v,-0)?'-0':String(v);
        const key=p[i].map(component).join(',')+':'+n[i].map(component).join(',');let id=vertices.get(key);
        if(id===undefined){id=positions.length/3;vertices.set(key,id);positions.push(...p[i]);normals.push(...n[i]);}
        indices.push(id);
      }
    }else{positions.push(...p.flat());normals.push(...n.flat());}
    faceNormals.push(...unit(face));sourceAxis.push(axis);stats.triangles++;
  }
  function quad(p,n,face,axis){triangle([p[0],p[1],p[2]],[n[0],n[1],n[2]],face,axis);triangle([p[0],p[2],p[3]],[n[0],n[2],n[3]],face,axis);}
  function side(e,span,y0,y1,axis,polarity){
    const sign=polarity*Math.sign(e.dy),face=axis===0?[e.dy*sign,-e.dx*sign,0]:[0,-e.dx*sign,-e.dy*sign];
    const points=[[y0,span[0]],[y0,span[1]],[y1,span[1]],[y1,span[0]]].map(([y,q])=>{
      const x=atY(e,y),u=atY(q,y);return axis===0?[x,y,-u]:[u,y,-x];
    });
    const ns=points.map(p=>edgeNormal(e,axis===0?p[0]:-p[2],p[1],axis,sign));quad(points,ns,face,axis);
  }
  const horizontals=p=>{const result=new Map();for(const e of p.edges)if(!e.dy){const list=result.get(e.y)||[];list.push(e);result.set(e.y,list);}return result;};
  const ha=horizontals(a),hb=horizontals(b);
  function cap(before,after,y){
    const lowA=intervalsAt(before.a,y),lowB=intervalsAt(before.b,y),highA=intervalsAt(after.a,y),highB=intervalsAt(after.b,y);
    const xs=[...new Set([...lowA.flat(),...highA.flat(),...(ha.get(y)||[]).flatMap(e=>[e.minX,e.maxX])])].sort((x,y)=>x-y);
    const us=[...new Set([...lowB.flat(),...highB.flat(),...(hb.get(y)||[]).flatMap(e=>[e.minX,e.maxX])])].sort((x,y)=>x-y);
    for(let i=0;i+1<xs.length;i++){
      const x=(xs[i]+xs[i+1])/2,la=member(lowA,x),ua=member(highA,x);if(!la&&!ua)continue;
      for(let j=0;j+1<us.length;j++){
        tick();const u=(us[j]+us[j+1])/2,lb=member(lowB,u),ub=member(highB,u),low=la&&lb,high=ua&&ub;
        if(low===high)continue;
        const axis=la!==ua?0:2,coordinate=axis===0?x:u;
        const e=(axis===0?ha:hb).get(y)?.find(e=>e.minX<=coordinate&&coordinate<=e.maxX);
        if(!e)throw new Error('Missing horizontal boundary; simple closed rings required');
        const polarity=low?1:-1,sign=-polarity*Math.sign(e.dx),face=[0,polarity,0];
        const p=[[xs[i],y,-us[j]],[xs[i+1],y,-us[j]],[xs[i+1],y,-us[j+1]],[xs[i],y,-us[j+1]]];
        const n=p.map(q=>edgeNormal(e,axis===0?q[0]:-q[2],y,axis,sign));quad(p,n,face,axis);stats.caps++;
      }
    }
  }
  const ys=[...new Set([...a.rings,...b.rings].flatMap(r=>r.map(p=>p.y)))].sort((x,y)=>x-y);
  const scanA=sweep(a,tick),scanB=sweep(b,tick);let before={a:[],b:[]};
  for(let i=0;i+1<ys.length;i++){
    tick();const y0=ys[i],y1=ys[i+1];
    const after={a:scanA(y0,y1),b:scanB(y0,y1)};cap(before,after,y0);
    for(const ap of after.a)for(const bp of after.b){
      tick();side(ap[0],bp,y0,y1,0,-1);side(ap[1],bp,y0,y1,0,1);
      side(bp[0],ap,y0,y1,2,-1);side(bp[1],ap,y0,y1,2,1);
    }
    stats.slabs++;before=after;
  }
  if(ys.length)cap(before,{a:[],b:[]},ys.at(-1));
  const bounds={min:[a.bounds.minX,Math.max(a.bounds.minY,b.bounds.minY),-b.bounds.maxX],max:[a.bounds.maxX,Math.min(a.bounds.maxY,b.bounds.maxY),-b.bounds.minX]};
  return {positions:Float64Array.from(positions),normals:Float64Array.from(normals),faceNormals:Float64Array.from(faceNormals),sourceAxis:Uint8Array.from(sourceAxis),...(indexed?{indices:Uint32Array.from(indices)}:{}),triangleCount:stats.triangles,bounds,stats};
}

// CPU triangle display path; source intersection and normal construction are
// not re-evaluated per pixel. This is NOT a browser/GPU implementation.
export function renderAnamorphicSurface(mesh,input={},frame={}){
  const {width=384,height=384,scale=1,centerX=0,centerY=0,samples=2,maxSampleTests=100000000,maxSamples=4194304}=frame;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>4194304
    ||!Number.isInteger(samples)||samples<1||samples>4||![scale,centerX,centerY].every(Number.isFinite)||scale<=0
    ||!Number.isSafeInteger(maxSampleTests)||maxSampleTests<1||!Number.isSafeInteger(maxSamples)||maxSamples<1||width*height*samples*samples>maxSamples)throw new RangeError('Invalid surface frame or work budget');
  const finish=input.finish??'classic';
  if(finish!=='classic'&&finish!=='studio')throw new TypeError('Invalid surface finish');
  const p=anamorphicSettings(input),view=anamorphicView(p,frame.phase??0),pixels=new Uint8ClampedArray(width*height*4);
  const studio=finish==='studio'&&p.metal&&!p.unlit?prepareStudio(p.roughness):null;
  const stats={triangles:mesh.triangleCount,visibleTriangles:0,rowTests:0,sampleTests:0,hits:0,maxSampleTests};
  if(!mesh.triangleCount||!p.opacity)return {pixels,width,height,stats};
  const indices=mesh.indices;
  if(indices!==undefined&&(!(indices instanceof Uint32Array)||indices.length!==mesh.triangleCount*3||mesh.positions.length%3||mesh.normals.length!==mesh.positions.length||mesh.faceNormals.length!==mesh.triangleCount*3||mesh.sourceAxis.length!==mesh.triangleCount||!indices.every(i=>i<mesh.positions.length/3)))throw new TypeError('Invalid indexed surface');
  const ink=input.ink??[.21,.26,.25];if(!Array.isArray(ink)||ink.length!==3||!ink.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new TypeError('Invalid ink RGB');
  // Optional exact face-material palette for other glyph solids (e.g. a
  // duplex Scroll sheet). Anamorphic's default single material is unchanged.
  const palette=input.axisInks;
  if(palette!==undefined&&(!Array.isArray(palette)||palette.length!==3||!palette.every(c=>Array.isArray(c)&&c.length===3&&c.every(v=>Number.isFinite(v)&&v>=0&&v<=1))||!mesh.sourceAxis.every(a=>a<3)))throw new TypeError('Invalid surface material palette');
  const sw=width*samples,sh=height*samples,count=sw*sh,zbuffer=new Float64Array(count).fill(-Infinity),owners=new Int32Array(count).fill(-1);
  const baryA=new Float64Array(count),baryB=new Float64Array(count);
  const screen=new Float64Array(mesh.positions.length),faces=new Float64Array(mesh.faceNormals.length),shade=new Float64Array(mesh.normals.length);
  for(let i=0;i<mesh.positions.length;i+=3){
    const point=[mesh.positions[i],mesh.positions[i+1],mesh.positions[i+2]*p.depth];
    screen[i]=((dot(point,view.right)-centerX)*scale+width/2)*samples;
    screen[i+1]=((dot(point,view.down)-centerY)*scale+height/2)*samples;screen[i+2]=dot(point,view.toward);
    if(!Number.isFinite(screen[i])||!Number.isFinite(screen[i+1])||!Number.isFinite(screen[i+2]))throw new RangeError('Non-finite projected surface');
    const n=[mesh.normals[i],mesh.normals[i+1],mesh.normals[i+2]/p.depth];
    shade[i]=dot(n,view.right);shade[i+1]=dot(n,view.down);shade[i+2]=dot(n,view.toward);
  }
  for(let i=0;i<mesh.faceNormals.length;i+=3){
    const n=unit([mesh.faceNormals[i],mesh.faceNormals[i+1],mesh.faceNormals[i+2]/p.depth]);
    faces[i]=dot(n,view.right);faces[i+1]=dot(n,view.down);faces[i+2]=dot(n,view.toward);
  }
  const edge=(ax,ay,bx,by,x,y)=>(bx-ax)*(y-ay)-(by-ay)*(x-ax);
  const topLeft=(ax,ay,bx,by)=>by<ay||(by===ay&&bx>ax);
  for(let tri=0;tri<mesh.triangleCount;tri++){
    if(faces[tri*3+2]<=1e-14)continue;
    const k=indices?indices[tri*3]*3:tri*9,kb=indices?indices[tri*3+1]*3:k+3,kc=indices?indices[tri*3+2]*3:k+6;
    const ax=screen[k],ay=screen[k+1],bx=screen[kb],by=screen[kb+1],cx=screen[kc],cy=screen[kc+1];
    const area=edge(ax,ay,bx,by,cx,cy);if(!area)continue;const sign=Math.sign(area),abs=Math.abs(area);
    const xmin=Math.max(0,Math.ceil(Math.min(ax,bx,cx)-.5)),xmax=Math.min(sw-1,Math.floor(Math.max(ax,bx,cx)-.5));
    const ymin=Math.max(0,Math.ceil(Math.min(ay,by,cy)-.5)),ymax=Math.min(sh-1,Math.floor(Math.max(ay,by,cy)-.5));
    if(xmin>xmax||ymin>ymax)continue;stats.visibleTriangles++;
    const ab=sign>0?topLeft(ax,ay,bx,by):topLeft(bx,by,ax,ay),bc=sign>0?topLeft(bx,by,cx,cy):topLeft(cx,cy,bx,by),ca=sign>0?topLeft(cx,cy,ax,ay):topLeft(ax,ay,cx,cy);
    for(let y=ymin;y<=ymax;y++){
      if(++stats.rowTests>maxSampleTests)throw new RangeError('Surface row-test budget exceeded');
      // Long tilted strips have huge bounding boxes but tiny row spans. Clip
      // the candidate interval before the exact edge test, not after sampling
      // the entire box. Expand out by one sample to retain roundoff boundaries.
      const py=y+.5;let left=Infinity,right=-Infinity;
      function cut(x0,y0,x1,y1){
        if(py<Math.min(y0,y1)||py>Math.max(y0,y1))return;
        if(y0===y1){left=Math.min(left,x0,x1);right=Math.max(right,x0,x1);return;}
        const x=x0+(x1-x0)*(py-y0)/(y1-y0);left=Math.min(left,x);right=Math.max(right,x);
      }
      cut(ax,ay,bx,by);cut(bx,by,cx,cy);cut(cx,cy,ax,ay);
      const from=Math.max(xmin,Math.floor(left-.5)),to=Math.min(xmax,Math.ceil(right-.5));
      for(let x=from;x<=to;x++){
      if(++stats.sampleTests>maxSampleTests)throw new RangeError('Surface sample-test budget exceeded');
      const ea=edge(bx,by,cx,cy,x+.5,y+.5)*sign,eb=edge(cx,cy,ax,ay,x+.5,y+.5)*sign,ec=edge(ax,ay,bx,by,x+.5,y+.5)*sign;
      if(ea<0||eb<0||ec<0||(!ea&&!bc)||(!eb&&!ca)||(!ec&&!ab))continue;
      const wa=ea/abs,wb=eb/abs,wc=1-wa-wb,z=wa*screen[k+2]+wb*screen[kb+2]+wc*screen[kc+2],q=y*sw+x;
      if(z<zbuffer[q])continue;
      // A owns coincident profile entries, as in the independent ray oracle.
      if(z===zbuffer[q]&&owners[q]>=0&&mesh.sourceAxis[owners[q]]<=mesh.sourceAxis[tri])continue;
      zbuffer[q]=z;owners[q]=tri;baryA[q]=wa;baryB[q]=wb;
      }
    }
  }
  const key=unit([-.55,-.75,1]),rim=unit([.9,.25,.5]),half=unit([key[0],key[1],key[2]+1]),exponent=2+126*(1-p.roughness)**2;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let hits=0,r=0,g=0,b=0;
    for(let sy=0;sy<samples;sy++)for(let sx=0;sx<samples;sx++){
      const q=(y*samples+sy)*sw+x*samples+sx,tri=owners[q];if(tri<0)continue;hits++;
      const material=palette?palette[mesh.sourceAxis[tri]]:ink;
      if(p.unlit){r+=material[0];g+=material[1];b+=material[2];continue;}
      const k=indices?indices[tri*3]*3:tri*9,kb=indices?indices[tri*3+1]*3:k+3,kc=indices?indices[tri*3+2]*3:k+6,wa=baryA[q],wb=baryB[q],wc=1-wa-wb;
      let nx=shade[k]*wa+shade[kb]*wb+shade[kc]*wc,ny=shade[k+1]*wa+shade[kb+1]*wb+shade[kc+1]*wc,nz=shade[k+2]*wa+shade[kb+2]*wb+shade[kc+2]*wc;
      if(nz<0){nx=faces[tri*3];ny=faces[tri*3+1];nz=faces[tri*3+2];}
      const length=Math.hypot(nx,ny,nz);nx/=length;ny/=length;nz/=length;
      const diffuse=.22+.6*Math.max(0,nx*key[0]+ny*key[1]+nz*key[2])+.17*Math.max(0,nx*rim[0]+ny*rim[1]+nz*rim[2]);
      const specular=Math.max(0,nx*half[0]+ny*half[1]+nz*half[2])**exponent,sheen=specular*(.2+p.metal*.75)+(1-Math.max(0,nz))**4*p.metal*.2;
      const cr=clamp(material[0]*diffuse+sheen,0,1),cg=clamp(material[1]*diffuse+sheen,0,1),cb=clamp(material[2]*diffuse+sheen,0,1);
      if(studio){const energy=studio(nx,ny,nz),m=p.metal;
        r+=cr*(1-m)+studioChannel(material[0],nz,energy)*m;
        g+=cg*(1-m)+studioChannel(material[1],nz,energy)*m;
        b+=cb*(1-m)+studioChannel(material[2],nz,energy)*m;
      }else{r+=cr;g+=cg;b+=cb;}
    }
    if(hits){const k=(y*width+x)*4;pixels[k]=r/hits*255;pixels[k+1]=g/hits*255;pixels[k+2]=b/hits*255;pixels[k+3]=hits/(samples*samples)*p.opacity*255;stats.hits+=hits;}
  }
  return {pixels,width,height,stats};
}
