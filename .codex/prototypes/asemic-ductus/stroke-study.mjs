// Continuous writing-body trial. No source glyph, UI or global state ownership.
// Original implementation: C1 Bezier guides and a sampled convex elliptical nib.
export function asemicStrokeSweep(points,{weight=7.2,contrast=1.4,flow=1.16,phase=0,seed=1,nibAngle=0,closed=false,voiceScale=1,mode='polygon'}={}){
  if(mode!=='polygon'&&mode!=='linear')throw new TypeError('Invalid asemic sweep mode');
  for(const v of [weight,contrast,flow,phase,seed,nibAngle,voiceScale])if(!Number.isFinite(v))throw new TypeError('Invalid asemic sweep setting');
  if(weight<0||voiceScale<0)throw new RangeError('Negative asemic nib');
  const pts=[];
  for(const p of points){
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y))throw new TypeError('Invalid asemic anchor');
    if(!pts.length||Math.hypot(p.x-pts.at(-1).x,p.y-pts.at(-1).y)>1e-8)pts.push({x:p.x,y:p.y});
  }
  if(closed&&pts.length>1&&Math.hypot(pts[0].x-pts.at(-1).x,pts[0].y-pts.at(-1).y)<1e-8)pts.pop();
  if(pts.length<2||weight===0||voiceScale===0)return {rings:[],samples:[],segments:[]};
  if(pts.length>32)throw new RangeError('Asemic anchor budget');
  closed=closed&&pts.length>2;
  const tau=Math.PI*2,n=pts.length,arc=[0],segments=[];
  for(let i=1;i<n;i++)arc.push(arc.at(-1)+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));
  const total=arc.at(-1)+(closed?Math.hypot(pts[0].x-pts.at(-1).x,pts[0].y-pts.at(-1).y):0);
  const handles=pts.map((p,i)=>{
    const a=pts[i?i-1:closed?n-1:0],b=pts[i+1<n?i+1:closed?0:n-1];
    const da=Math.hypot(p.x-a.x,p.y-a.y),db=Math.hypot(b.x-p.x,b.y-p.y);
    let tx=(p.x-a.x)/(da||1)+(b.x-p.x)/(db||1),ty=(p.y-a.y)/(da||1)+(b.y-p.y)/(db||1);
    const norm=Math.hypot(tx,ty);
    if(norm<1e-8)return {x:0,y:0};
    const turn=flow*.13*Math.sin(phase+seed*.017+tau*arc[i]/total),cs=Math.cos(turn),sn=Math.sin(turn);
    const length=(da&&db?Math.min(da,db):Math.max(da,db))*.34;
    return {x:(tx*cs-ty*sn)/norm*length,y:(tx*sn+ty*cs)/norm*length};
  });
  const samples=[];
  function evaluate(seg,t){
    const [a,b,c,d]=seg,u=1-t;
    return {x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};
  }
  function append(p){if(samples.length>=4096)throw new RangeError('Asemic sweep sample budget');samples.push(p);}
  for(let i=0;i<(closed?n:n-1);i++){
    const j=(i+1)%n,a=pts[i],d=pts[j],b={x:a.x+handles[i].x,y:a.y+handles[i].y},c={x:d.x-handles[j].x,y:d.y-handles[j].y};
    const seg=[a,b,c,d];segments.push(seg);
    if(i===0)append(evaluate(seg,0));
    function split(t0,t1,p0,p1,depth){
      let error=0;
      for(const f of [.25,.5,.75]){const p=evaluate(seg,t0+(t1-t0)*f);error=Math.max(error,Math.hypot(p.x-(p0.x+(p1.x-p0.x)*f),p.y-(p0.y+(p1.y-p0.y)*f)));}
      if((error>.12||Math.hypot(p1.x-p0.x,p1.y-p0.y)>6)&&depth<16){const tm=(t0+t1)/2,pm=evaluate(seg,tm);split(t0,tm,p0,pm,depth+1);split(tm,t1,pm,p1,depth+1);}
      else {if(depth===16&&error>.12)throw new RangeError('Asemic sweep precision budget');append(p1);}
    }
    split(0,1,a,d,0);
  }
  // Pressure is indexed by approximate written distance, not anchor number.
  const travelled=[0];for(let i=1;i<samples.length;i++)travelled.push(travelled.at(-1)+Math.hypot(samples[i].x-samples[i-1].x,samples[i].y-samples[i-1].y));
  const length=travelled.at(-1),radius=weight*voiceScale*.5;
  const major=radius*(1+contrast*.14),minor=radius*Math.max(.22,1-contrast*.08);
  const cos=Math.cos(nibAngle),sin=Math.sin(nibAngle);
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  samples.forEach((p,i)=>{
    const t=travelled[i]/length,reach=Math.min(.16,Math.max(.035,weight*2/length));
    const envelope=closed?1:.08+.92*smooth(t/reach)*smooth((1-t)/reach);
    const pressure=envelope*(.89+.11*Math.sin(t*tau*2+phase+seed*.023));
    p.pressure=pressure;p.distance=travelled[i];
  });
  const sides=Math.max(12,Math.min(64,Math.ceil(Math.PI/Math.acos(Math.max(-1,Math.min(1,1-.12/Math.max(.12,major)))))));
  const nib=[];
  for(let k=0;k<sides;k++){const a=k/sides*tau,x=Math.cos(a)*major,y=Math.sin(a)*minor;nib.push({x:x*cos-y*sin,y:x*sin+y*cos});}
  const compare=(a,b)=>a.x-b.x||a.y-b.y;
  // Positive homothety preserves vertex order; sort the nib just once. Rounding
  // can collapse distinct x coordinates, so repair only exceptional lists.
  if(mode==='linear')nib.sort(compare);
  const nibs=samples.map(p=>{
    const vertices=nib.map(v=>({x:p.x+v.x*p.pressure,y:p.y+v.y*p.pressure}));
    if(mode==='linear'&&vertices.some((v,i)=>i>0&&compare(vertices[i-1],v)>0))vertices.sort(compare);
    return vertices;
  });
  function merge(a,b){
    const out=[];let i=0,j=0;
    while(i<a.length&&j<b.length)out.push(compare(a[i],b[j])<=0?a[i++]:b[j++]);
    while(i<a.length)out.push(a[i++]);while(j<b.length)out.push(b[j++]);return out;
  }
  function hull(sorted){
    const out=[];
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    for(const p of sorted){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}
    const lower=out.length;
    for(let i=sorted.length-2;i>=0;i--){const p=sorted[i];while(out.length>lower&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}
    out.pop();return out;
  }
  const rings=[];
  for(let i=1;i<nibs.length;i++)rings.push(hull(mode==='linear'?merge(nibs[i-1],nibs[i]):[...nibs[i-1],...nibs[i]].sort(compare)));
  return {rings,samples,segments};
}

// Append positive-winding subpaths. Caller owns beginPath/fill/color/opacity.
// One nonzero fill unions overlapping nibs without internal opacity buildup.
export function asemicAppendSweep(ctx,sweep){
  for(const ring of sweep.rings){
    if(!ring.length)continue;
    ctx.moveTo(ring[0].x,ring[0].y);
    for(let i=1;i<ring.length;i++)ctx.lineTo(ring[i].x,ring[i].y);
    ctx.closePath();
  }
}
