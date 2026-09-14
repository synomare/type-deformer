// Original glyph-domain driven-wave study. This is a scalar graph resolvent,
// not a physical elastic plate, an eigensolver, or a copied Chladni formula.
const TAU = Math.PI * 2, INF = 1e20;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export function normalizeResonantSettings(input={}) {
  const n=(k,d,a,b)=>clamp(Number.isFinite(input[k])?input[k]:d,a,b);
  return {pitch:n('pitch',38,10,120),loss:n('loss',.12,.025,.6),axis:n('axis',28,-180,180),
    excursion:n('excursion',18,-96,96),cut:n('cut',.55,0,1),bands:n('bands',3,1,16),
    aperture:n('aperture',.16,.015,.6),motion:n('motion',.65,0,1)};
}
export const RESONANT_STARTS=Object.freeze({
  chamber:Object.freeze({pitch:46,loss:.09,axis:25,excursion:22,cut:.9,bands:2,aperture:.22,motion:.65}),
  reed:Object.freeze({pitch:25,loss:.055,axis:-60,excursion:11,cut:1,bands:6,aperture:.13,motion:.65}),
  crest:Object.freeze({pitch:68,loss:.17,axis:80,excursion:42,cut:.35,bands:3,aperture:.12,motion:.65})
});

// Exact squared distances to raster centres, independently implemented via the
// lower envelope of 1D parabolas. No chamfer/octagonal metric.
export function resonantNearest(mask,width,height,ink=true) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>1048576||mask?.length!==width*height||typeof ink!=='boolean')
    throw new RangeError('Resonant Type: invalid distance raster');
  const size=width*height, horizontal=new Float64Array(size), hx=new Int32Array(size);
  const distances=new Float64Array(size),nearest=new Int32Array(size);
  const max=Math.max(width,height),v=new Int32Array(max),z=new Float64Array(max+1),f=new Float64Array(max),d=new Float64Array(max),arg=new Int32Array(max);
  function line(length) {
    let k=-1;
    for(let q=0;q<length;q++){
      if(f[q]>=INF)continue;
      let s=-INF;
      while(k>=0){const p=v[k];s=(f[q]+q*q-f[p]-p*p)/(2*(q-p));if(s>z[k])break;k--;}
      v[++k]=q;z[k]=k===0?-INF:s;z[k+1]=INF;
    }
    if(k<0){d.fill(INF,0,length);arg.fill(-1,0,length);return;}
    let j=0;
    for(let q=0;q<length;q++){while(j<k&&z[j+1]<q)j++;const p=v[j];d[q]=(q-p)*(q-p)+f[p];arg[q]=p;}
  }
  for(let y=0;y<height;y++){
    for(let x=0;x<width;x++)f[x]=(!!mask[y*width+x]===ink)?0:INF;
    line(width);for(let x=0;x<width;x++){horizontal[y*width+x]=d[x];hx[y*width+x]=arg[x];}
  }
  for(let x=0;x<width;x++){
    for(let y=0;y<height;y++)f[y]=horizontal[y*width+x];line(height);
    for(let y=0;y<height;y++){const i=y*width+x,row=arg[y];distances[i]=d[y];nearest[i]=row<0?-1:row*width+hx[row*width+x];}
  }
  return {distances,nearest};
}

export function prepareResonantDomain(source,width,height,{maxNodes=65536,maxPixels=1048576}={}) {
  if(!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>65536||!Number.isInteger(maxPixels)||maxPixels<1||maxPixels>1048576)
    throw new RangeError('Resonant Type: invalid domain budget');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>maxPixels)
    throw new RangeError('Resonant Type: source raster budget exceeded');
  if(!source||(source.length!==width*height&&source.length!==width*height*4))throw new RangeError('Resonant Type: alpha dimensions mismatch');
  const stride=source.length===width*height?1:4,alpha=new Uint8ClampedArray(width*height),mask=new Uint8Array(alpha.length),ids=new Int32Array(alpha.length);ids.fill(-1);
  const positions=[];
  for(let i=0;i<alpha.length;i++){
    const value=source[i*stride+stride-1];if(!Number.isFinite(value)||value<0||value>255)throw new TypeError('Resonant Type: invalid alpha');
    alpha[i]=value;mask[i]=value>=127.5?1:0;
    if(mask[i]){ids[i]=positions.length;positions.push(i);if(positions.length>maxNodes)throw new RangeError('Resonant Type: ink-node budget exceeded');}
  }
  // A missing zero border gives an unknowable outside distance, not permission
  // to truncate the input. The compiler must include a paper border.
  for(let x=0;x<width;x++)if(alpha[x]||alpha[(height-1)*width+x])throw new RangeError('Resonant Type: source requires a paper border');
  for(let y=0;y<height;y++)if(alpha[y*width]||alpha[y*width+width-1])throw new RangeError('Resonant Type: source requires a paper border');
  if(!positions.length&&alpha.some(v=>v>0))throw new RangeError('Resonant Type: source too thin for analysis grid; increase source precision');
  const count=positions.length, neighbours=new Int32Array(count*4),degree=new Float64Array(count);neighbours.fill(-1);
  const weights=new Float64Array(count*4);
  for(let i=0;i<count;i++){
    const p=positions[i],x=p%width,y=Math.floor(p/width),candidates=[x>0?p-1:-1,x+1<width?p+1:-1,y>0?p-width:-1,y+1<height?p+width:-1];
    for(let k=0;k<4;k++)if(candidates[k]>=0&&ids[candidates[k]]>=0){
      const j=ids[candidates[k]],weight=Math.min(alpha[p],alpha[candidates[k]])/255;
      neighbours[i*4+k]=j;weights[i*4+k]=weight;degree[i]+=weight;
    }
  }
  const labels=new Int32Array(count);labels.fill(-1);const components=[];
  for(let i=0;i<count;i++)if(labels[i]<0){
    const indices=[i],label=components.length;labels[i]=label;
    for(let c=0;c<indices.length;c++){const at=indices[c];for(let k=0;k<4;k++){const j=neighbours[at*4+k];if(j>=0&&labels[j]<0){labels[j]=label;indices.push(j);}}}
    components.push(Int32Array.from(indices));
  }
  const outside=resonantNearest(mask,width,height,true),inside=resonantNearest(mask,width,height,false),signed=new Float64Array(alpha.length);
  for(let i=0;i<alpha.length;i++)signed[i]=mask[i]?-.5-Math.max(0,Math.sqrt(inside.distances[i])-1):Math.sqrt(outside.distances[i])-.5;
  return {width,height,alpha,mask,ids,positions:Int32Array.from(positions),neighbours,weights,degree,labels,components,
    signed,nearest:outside.nearest,count};
}

export function resonantLaplacian(domain,input,output,shift=0) {
  for(let i=0;i<domain.count;i++){
    let value=(domain.degree[i]-shift)*input[i];
    for(let k=0;k<4;k++){const j=domain.neighbours[i*4+k];if(j>=0)value-=domain.weights[i*4+k]*input[j];}
    output[i]=value;
  }
  return output;
}
const dot=(a,b)=>{let sum=0;for(let i=0;i<a.length;i++)sum+=a[i]*b[i];return sum;};

function* resonantComplexSolve(domain,rhs,k2,eta,tolerance,maxIterations) {
  const n=domain.count,array=()=>new Float64Array(n),real=array(),imag=array(),r=rhs.slice(),ri=array(),shadow=rhs.slice(),shadowI=array();
  const p=array(),pi=array(),v=array(),vi=array(),s=array(),si=array(),t=array(),ti=array(),pre=array(),preI=array(),ps=array(),psI=array();
  const norm=(a,b)=>Math.sqrt(dot(a,a)+dot(b,b));
  const bNorm=Math.sqrt(dot(rhs,rhs));if(!bNorm)return {real,imag,iterations:0,relativeResidual:0};
  const multiply=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];
  const divide=(a,b)=>{const d=b[0]*b[0]+b[1]*b[1];if(!(d>0)||!Number.isFinite(d))throw new Error('Resonant Type: complex solver breakdown');return[(a[0]*b[0]+a[1]*b[1])/d,(a[1]*b[0]-a[0]*b[1])/d];};
  function inner(a,ai,b,bi){let x=0,y=0;for(let i=0;i<n;i++){x+=a[i]*b[i]+ai[i]*bi[i];y+=a[i]*bi[i]-ai[i]*b[i];}return[x,y];}
  function apply(a,ai,b,bi){
    for(let i=0;i<n;i++){
      let x=(domain.degree[i]-k2)*a[i]-eta*ai[i],y=(domain.degree[i]-k2)*ai[i]+eta*a[i];
      for(let j=0;j<4;j++){const at=domain.neighbours[i*4+j];if(at>=0){const w=domain.weights[i*4+j];x-=w*a[at];y-=w*ai[at];}}
      b[i]=x;bi[i]=y;
    }
  }
  // Zero-fill complex incomplete LU on the actual ink graph. The retained
  // lower/upper edges are source neighbours, not a rectangular surrogate.
  const diagonal=array(),diagonalI=array(),lower=new Float64Array(n*4),lowerI=new Float64Array(n*4),forward=array(),forwardI=array();
  for(let i=0;i<n;i++){
    let dr=domain.degree[i]-k2,di=eta;
    for(let edge=0;edge<4;edge++){
      const at=i*4+edge,j=domain.neighbours[at];if(j<0||j>=i)continue;
      const weight=domain.weights[at],den=diagonal[j]*diagonal[j]+diagonalI[j]*diagonalI[j];
      const lr=-weight*diagonal[j]/den,li=weight*diagonalI[j]/den;lower[at]=lr;lowerI[at]=li;
      dr+=weight*lr;di+=weight*li;
    }
    diagonal[i]=dr;diagonalI[i]=di;
  }
  function precondition(a,ai,b,bi){
    for(let i=0;i<n;i++){
      let x=a[i],y=ai[i];
      for(let edge=0;edge<4;edge++){
        const at=i*4+edge,j=domain.neighbours[at];if(j<0||j>=i)continue;
        x-=lower[at]*forward[j]-lowerI[at]*forwardI[j];y-=lower[at]*forwardI[j]+lowerI[at]*forward[j];
      }
      forward[i]=x;forwardI[i]=y;
    }
    for(let i=n-1;i>=0;i--){
      let x=forward[i],y=forwardI[i];
      for(let edge=0;edge<4;edge++){const at=i*4+edge,j=domain.neighbours[at];if(j>i){x+=domain.weights[at]*b[j];y+=domain.weights[at]*bi[j];}}
      const d=diagonal[i],e=diagonalI[i],den=d*d+e*e;b[i]=(d*x+e*y)/den;bi[i]=(d*y-e*x)/den;
    }
  }
  let rhoOld=[1,0],alpha=[1,0],omega=[1,0],iterations=0,relativeResidual=1;
  while(relativeResidual>tolerance&&iterations<maxIterations){
    const rho=inner(shadow,shadowI,r,ri),beta=multiply(divide(rho,rhoOld),divide(alpha,omega));
    for(let i=0;i<n;i++){
      const x=p[i]-omega[0]*v[i]+omega[1]*vi[i],y=pi[i]-omega[0]*vi[i]-omega[1]*v[i];
      p[i]=r[i]+beta[0]*x-beta[1]*y;pi[i]=ri[i]+beta[0]*y+beta[1]*x;
    }
    precondition(p,pi,pre,preI);apply(pre,preI,v,vi);alpha=divide(rho,inner(shadow,shadowI,v,vi));
    for(let i=0;i<n;i++){s[i]=r[i]-alpha[0]*v[i]+alpha[1]*vi[i];si[i]=ri[i]-alpha[0]*vi[i]-alpha[1]*v[i];}
    if(norm(s,si)/bNorm<=tolerance){
      for(let i=0;i<n;i++){real[i]+=alpha[0]*pre[i]-alpha[1]*preI[i];imag[i]+=alpha[0]*preI[i]+alpha[1]*pre[i];}
      iterations++;break;
    }
    precondition(s,si,ps,psI);apply(ps,psI,t,ti);omega=divide(inner(t,ti,s,si),inner(t,ti,t,ti));
    for(let i=0;i<n;i++){
      real[i]+=alpha[0]*pre[i]-alpha[1]*preI[i]+omega[0]*ps[i]-omega[1]*psI[i];
      imag[i]+=alpha[0]*preI[i]+alpha[1]*pre[i]+omega[0]*psI[i]+omega[1]*ps[i];
      r[i]=s[i]-omega[0]*t[i]+omega[1]*ti[i];ri[i]=si[i]-omega[0]*ti[i]-omega[1]*t[i];
    }
    iterations++;relativeResidual=norm(r,ri)/bNorm;rhoOld=rho;
    if(iterations%32===0)yield {iterations,relativeResidual};
  }
  apply(real,imag,t,ti);for(let i=0;i<n;i++){t[i]-=rhs[i];}
  relativeResidual=norm(t,ti)/bNorm;
  if(!Number.isFinite(relativeResidual)||relativeResidual>tolerance*1.1)throw new Error(`Resonant Type: solve did not converge (${iterations}, residual ${relativeResidual})`);
  return {real,imag,iterations,relativeResidual};
}

// Solve the complex shifted graph Laplacian directly. Normal-equation CG was
// rejected: squaring its condition number prevented default convergence.
// Yielding is preparation only, and a true complex residual gates completion.
export function* solveResonantField(domain,input={},options={}) {
  const settings=normalizeResonantSettings(input),n=domain.count;
  const tolerance=options.tolerance??1e-6,maxIterations=options.maxIterations??6000;
  if(!(tolerance>0&&tolerance<1)||!Number.isInteger(maxIterations)||maxIterations<1)throw new RangeError('Invalid Resonant solve budget');
  const k2=(TAU/settings.pitch)**2,eta=Math.max(1e-7,k2*settings.loss),axis=settings.axis*Math.PI/180;
  const rhs=new Float64Array(n),projection=new Float64Array(n);
  for(let i=0;i<n;i++){const p=domain.positions[i];projection[i]=(p%domain.width)*Math.cos(axis)+Math.floor(p/domain.width)*Math.sin(axis);}
  for(const component of domain.components){
    let low=Infinity,high=-Infinity;
    for(const i of component){low=Math.min(low,projection[i]);high=Math.max(high,projection[i]);}
    const span=Math.max(1,high-low),reach=Math.max(1,Math.min(settings.pitch*.12,span*.18));let mean=0;
    for(const i of component){const p=projection[i];rhs[i]=Math.exp(-(((high-p)/reach)**2))-Math.exp(-(((p-low)/reach)**2));mean+=rhs[i];}
    mean/=component.length;
    for(const i of component)rhs[i]-=mean;
    if(component.length===1)rhs[component[0]]=1;
  }
  const solver=resonantComplexSolve(domain,rhs,k2,eta,tolerance,maxIterations);let next;
  do{next=solver.next();if(!next.done)yield next.value;}while(!next.done);
  const {real,imag,iterations}=next.value,bNorm=Math.sqrt(dot(rhs,rhs));
  const rr=new Float64Array(n),ri=new Float64Array(n);resonantLaplacian(domain,real,rr,k2);resonantLaplacian(domain,imag,ri,k2);
  let error=0;
  for(let i=0;i<n;i++){rr[i]-=eta*imag[i]+rhs[i];ri[i]+=eta*real[i];error+=rr[i]*rr[i]+ri[i]*ri[i];}
  const complexResidual=bNorm?Math.sqrt(error)/bNorm:0;
  if(complexResidual>tolerance*1.1)throw new Error('Resonant Type: complex residual verification failed');
  const scale=new Float64Array(domain.components.length);
  for(let i=0;i<n;i++)scale[domain.labels[i]]=Math.max(scale[domain.labels[i]],Math.hypot(real[i],imag[i]));
  const normalizedReal=new Float64Array(n),normalizedImag=new Float64Array(n);
  for(let i=0;i<n;i++){const s=scale[domain.labels[i]]||1;normalizedReal[i]=real[i]/s;normalizedImag[i]=imag[i]/s;}
  return {domain,settings,real,imag,normalizedReal,normalizedImag,scale,rhs,iterations,complexResidual,k2,eta};
}
export function finishResonantField(domain,input,options) {
  const work=solveResonantField(domain,input,options);let next;do{next=work.next();}while(!next.done);return next.value;
}

export function renderResonantBody(domain,field,input={},phase=0) {
  const s=normalizeResonantSettings({...field?.settings,...input}),pixels=new Uint8ClampedArray(domain.alpha.length);
  if(!Number.isFinite(phase))throw new TypeError('Resonant Type: invalid phase');
  if(!domain.count)return pixels;
  if(s.excursion===0&&s.cut===0)return domain.alpha.slice();
  if(!field||field.domain!==domain||field.normalizedReal.length!==domain.count||field.normalizedImag.length!==domain.count)throw new RangeError('Resonant Type: field/domain mismatch');
  for(const key of ['pitch','loss','axis'])if(s[key]!==field.settings[key])throw new RangeError('Resonant Type: field settings changed; prepare a new field');
  // Closed-phase displacement, with explicit static Motion=0.
  const angle=Math.sin((((phase%1)+1)%1)*TAU)*s.motion*Math.PI,cos=Math.cos(angle),sin=Math.sin(angle);
  const fringe=.85;
  let clipped=false;
  for(let p=0;p<pixels.length;p++){
    const nearest=domain.nearest[p],i=nearest<0?-1:domain.ids[nearest];if(i<0)continue;
    if(!field.scale[domain.labels[i]]){pixels[p]=domain.alpha[p];continue;}
    const response=field.normalizedReal[i]*cos-field.normalizedImag[i]*sin;
    const weight=s.excursion*response;
    let coverage=clamp(.5+(weight-domain.signed[p])/(2*fringe),0,1);coverage=coverage*coverage*(3-2*coverage);
    // Nodes carve actual negative space out of the replacement ink. Successive
    // amplitude levels make ribs; they are not a coloured overlay on the source.
    const lane=Math.abs(Math.sin(response*Math.PI*s.bands));
    const opening=clamp((lane-s.aperture)/Math.max(.015,s.aperture*.45),0,1);
    coverage*=1-s.cut+s.cut*opening;
    pixels[p]=Math.round(255*coverage);
    if(pixels[p]&&(p<domain.width||p>=pixels.length-domain.width||p%domain.width===0||p%domain.width===domain.width-1))clipped=true;
  }
  if(clipped)throw new RangeError('Resonant Type: output exceeds source padding; enlarge paper margin');
  return pixels;
}
