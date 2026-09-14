// EXPERIMENTAL: offline research only; not registered in the editor.
// Original code. No reference source, font, image or third-party dependency is included.
export function resample(points, spacing) {
  const lengths=[0]; let total=0;
  points.forEach((p,i)=>{const q=points[(i+1)%points.length]; total+=Math.hypot(p.x-q.x,p.y-q.y); lengths.push(total);});
  const n=Math.max(12,Math.ceil(total/spacing)); let k=0;
  return Array.from({length:n},(_,i)=>{const d=total*i/n; while(k+1<points.length&&lengths[k+1]<d)k++; const a=points[k],b=points[(k+1)%points.length],t=(d-lengths[k])/(lengths[k+1]-lengths[k]||1);return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};});
}
export function grow(contours, settings={}) {
  const s={age:1,grain:4,tension:.8,memory:.007,patch:.8,seed:31,areaGain:1.1,...settings};
  const ranges={age:[0,5,1],grain:[2.5,12,4],tension:[.18,1.2,.8],memory:[0,.05,.007],patch:[0,1,.8],areaGain:[.5,2,1.1],seed:[-2147483648,2147483647,31]};
  for(const [key,[lo,hi,fallback]] of Object.entries(ranges))s[key]=Number.isFinite(s[key])?Math.max(lo,Math.min(hi,s[key])):fallback;
  if(!Array.isArray(contours))throw new TypeError('Expected contour array');
  for(const c of contours)if(!Number.isFinite(c.area)||!Array.isArray(c.points)||c.points.length<3||c.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw new TypeError('Expected finite closed contours');
  const rand=(x,y)=>{const v=Math.sin(x*127.1+y*311.7+s.seed*91.37)*43758.5453123;return v-Math.floor(v);};
  function noise(x,y) {const ix=Math.floor(x),iy=Math.floor(y);let u=x-ix,v=y-iy;u=u*u*(3-2*u);v=v*v*(3-2*v);return (rand(ix,iy)*(1-u)+rand(ix+1,iy)*u)*(1-v)+(rand(ix,iy+1)*(1-u)+rand(ix+1,iy+1)*u)*v;}
  const rings=contours.map(c=>({area:c.area,points:resample(c.points,s.grain*.8).map(p=>({...p,ax:p.x,ay:p.y,rest:0}))}));
  for(const r of rings)r.points.forEach((p,i)=>{const q=r.points[(i+1)%r.points.length];p.rest=Math.hypot(p.x-q.x,p.y-q.y);});
  const steps=Math.round(s.age*960);let maxPoints=0;
  const initialPoints=rings.reduce((n,r)=>n+r.points.length,0), pointBudget=Math.max(4096,initialPoints);
  let livePoints=initialPoints, budgetReached=false;
  for(let step=0;step<steps;step++) {
    const radius=s.grain*2.5,grid=new Map(),all=[];
    for(let ri=0;ri<rings.length;ri++){const r=rings[ri];for(let i=0;i<r.points.length;i++){const p=r.points[i];p.ri=ri;p.i=i;p.dx=0;p.dy=0;all.push(p);const key=Math.floor(p.x/radius)+','+Math.floor(p.y/radius);if(!grid.has(key))grid.set(key,[]);grid.get(key).push(p);}}
    for(const r of rings) {const ps=r.points,n=ps.length;
      let area=0,perimeter=0;
      for(let j=0;j<n;j++){const a=ps[j],b=ps[(j+1)%n];area+=a.x*b.y-b.x*a.y;perimeter+=Math.hypot(a.x-b.x,a.y-b.y);}
      const pressure=Math.max(-.5,Math.min(.5,(r.area*s.areaGain-area*.5)/Math.max(1,perimeter)*.09));
      for(let i=0;i<n;i++){
        const p=ps[i],q=ps[(i+1)%n],a=ps[(i+n-1)%n],aa=ps[(i+n-2)%n],qq=ps[(i+2)%n];
        const nutrient=(1-s.patch)+s.patch*(.2+1.8*noise(p.ax/28,p.ay/28));
        p.rest=Math.min(s.grain*1.5,p.rest*(1+.0018*nutrient));
        const vx=q.x-p.x,vy=q.y-p.y,d=Math.max(.0001,Math.hypot(vx,vy)),force=(d-p.rest)*.6;
        p.dx+=vx/d*force;p.dy+=vy/d*force;q.dx-=vx/d*force;q.dy-=vy/d*force;
        const tx=q.x-a.x,ty=q.y-a.y,td=Math.max(.001,Math.hypot(tx,ty));
        const bulge=pressure;
        p.dx+=(-aa.x+4*a.x-6*p.x+4*q.x-qq.x)*s.tension+(p.ax-p.x)*s.memory+ty/td*bulge;
        p.dy+=(-aa.y+4*a.y-6*p.y+4*q.y-qq.y)*s.tension+(p.ay-p.y)*s.memory-tx/td*bulge;
        const cx=Math.floor(p.x/radius),cy=Math.floor(p.y/radius);
        for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++)for(const b of grid.get((cx+ox)+','+(cy+oy))||[]){
          if(b===p||b.ri===p.ri&&(Math.abs(b.i-i)<=3||Math.abs(b.i-i)>=n-3))continue;
          const bx=p.x-b.x,by=p.y-b.y,bd=Math.hypot(bx,by);
          if(bd<radius&&bd>1e-5){const repel=(1-bd/radius)**2*.8;p.dx+=bx/bd*repel;p.dy+=by/bd*repel;}
        }
      }
    }
    for(const p of all){const dt=.11,limit=Math.min(dt,s.grain*.15/Math.max(.0001,Math.hypot(p.dx,p.dy)));p.x+=p.dx*limit;p.y+=p.dy*limit;}
    if(step%12===11)for(const r of rings){const next=[];for(let i=0;i<r.points.length;i++){const p=r.points[i],q=r.points[(i+1)%r.points.length];next.push(p);if(Math.hypot(p.x-q.x,p.y-q.y)>s.grain*1.25&&livePoints<pointBudget){p.rest*=.5;livePoints++;next.push({x:(p.x+q.x)/2,y:(p.y+q.y)/2,ax:(p.ax+q.ax)/2,ay:(p.ay+q.ay)/2,rest:p.rest});}}r.points=next;}
    maxPoints=Math.max(maxPoints,livePoints);budgetReached=budgetReached||livePoints===pointBudget;
  }
  return {rings,steps,maxPoints,initialPoints,pointBudget,budgetReached,settings:s};
}
