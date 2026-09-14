// Alternative reconstruction, not layered on the rejected thickness study.
// Move a shared source-ink mesh with the same solved wave, then rasterise its
// union. This is a graphic folding map, not a topology-preserving physical FEM.
import {normalizeResonantSettings} from './core.mjs';

export function renderResonantTransportStudy(domain,field,direction,input={},phase=0,{maxSamples=64000000,samplesPerAxis=2}={}){
  const s=normalizeResonantSettings({...field?.settings,...input});
  if(!Number.isFinite(phase))throw new TypeError('Resonant Type: invalid phase');
  if(!Number.isInteger(maxSamples)||maxSamples<1||maxSamples>64000000)throw new RangeError('Invalid transport work budget');
  if(![2,4,8].includes(samplesPerAxis))throw new RangeError('Invalid transport sampling grid');
  if(!domain.count)return new Uint8ClampedArray(domain.alpha.length);
  if(s.excursion===0&&s.cut===0)return domain.alpha.slice();
  if(field?.domain!==domain||field.normalizedReal?.length!==domain.count||field.normalizedImag?.length!==domain.count||field.scale?.length!==domain.components.length)throw new RangeError('Resonant Type: field/domain mismatch');
  for(const key of ['pitch','loss','axis'])if(s[key]!==field.settings[key])throw new RangeError('Resonant Type: field settings changed; prepare a new field');
  if(direction&&(direction.domain!==domain||direction.normalXX?.length!==domain.alpha.length||direction.normalXY?.length!==domain.alpha.length||direction.normalYY?.length!==domain.alpha.length))throw new RangeError('Resonant Type: direction/domain mismatch');
  if(field.scale.every(value=>value===0))return domain.alpha.slice();
  const w=domain.width,h=domain.height,stride=w+1,sampleCount=samplesPerAxis**2;
  // Dense grids are offline diagnostics, not an unbounded quality setting.
  if(w*h*sampleCount>16777216)throw new RangeError('Resonant Type: transport sample storage budget exceeded');
  const vertices=new Map(),samples=new Float32Array(w*h*sampleCount);
  const offsetsX=new Float64Array(sampleCount),offsetsY=new Float64Array(sampleCount);
  for(let k=0;k<sampleCount;k++){
    offsetsX[k]=(k%samplesPerAxis+.5)/samplesPerAxis-.5;
    offsetsY[k]=(Math.floor(k/samplesPerAxis)+.5)/samplesPerAxis-.5;
  }
  const theta=Math.sin((((phase%1)+1)%1)*Math.PI*2)*s.motion*Math.PI,ct=Math.cos(theta),st=Math.sin(theta);
  const axis=s.axis*Math.PI/180,ax=Math.cos(axis),ay=Math.sin(axis);
  let visits=0;
  function vertex(x,y){
    const key=y*stride+x;if(vertices.has(key))return vertices.get(key);
    let real=0,imag=0,weight=0,nxx=0,nxy=0,nyy=0;
    for(const sy of [y-1,y])for(const sx of [x-1,x]){
      if(sx<0||sx>=w||sy<0||sy>=h)continue;
      const p=sy*w+sx,i=domain.ids[p];if(i<0)continue;
      const a=domain.alpha[p]/255;real+=a*field.normalizedReal[i];imag+=a*field.normalizedImag[i];weight+=a;
      if(direction){nxx+=a*direction.normalXX[p];nxy+=a*direction.normalXY[p];nyy+=a*direction.normalYY[p];}
    }
    if(!weight){
      const sx=Math.max(0,Math.min(w-1,x)),sy=Math.max(0,Math.min(h-1,y)),nearest=domain.nearest[sy*w+sx],i=domain.ids[nearest];
      if(i>=0){
        real=field.normalizedReal[i];imag=field.normalizedImag[i];weight=1;
        if(direction){nxx=direction.normalXX[nearest];nxy=direction.normalXY[nearest];nyy=direction.normalYY[nearest];}
      }
    }
    real/=weight||1;imag/=weight||1;
    if(!Number.isFinite(real)||!Number.isFinite(imag))throw new TypeError('Resonant Type: invalid wave sample');
    const response=real*ct-imag*st,quadrature=real*st+imag*ct;
    // The former Cut/Bands/Aperture axes are *provisional* fold/strata/focus
    // controls here. No claim that this variant preserves cut semantics.
    const fold=s.cut*s.pitch*.3*Math.sin(response*Math.PI*s.bands)*Math.exp(-quadrature*quadrature/(.015+s.aperture));
    const u=s.excursion*response,v=s.excursion*quadrature+fold;
    let result;
    if(direction){
      nxx/=weight||1;nxy/=weight||1;nyy/=weight||1;
      const fx=-ay*nxx+ax*nxy,fy=-ay*nxy+ax*nyy;
      if(!Number.isFinite(fx)||!Number.isFinite(fy))throw new TypeError('Resonant Type: invalid direction sample');
      const q=s.excursion*quadrature;
      result=[x-.5+ax*u-ay*q+fold*fx,y-.5+ay*u+ax*q+fold*fy];
    }else result=[x-.5+ax*u-ay*v,y-.5+ay*u+ax*v];
    vertices.set(key,result);return result;
  }
  function alphaAt(x,y){
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const a=(xx,yy)=>xx<0||xx>=w||yy<0||yy>=h?0:domain.alpha[yy*w+xx];
    return a(ix,iy)*(1-fx)*(1-fy)+a(ix+1,iy)*fx*(1-fy)+a(ix,iy+1)*(1-fx)*fy+a(ix+1,iy+1)*fx*fy;
  }
  function triangle(a,b,c,ua,ub,uc){
    const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-12)return;
    const minX=Math.floor(Math.min(a[0],b[0],c[0])),maxX=Math.ceil(Math.max(a[0],b[0],c[0]));
    const minY=Math.floor(Math.min(a[1],b[1],c[1])),maxY=Math.ceil(Math.max(a[1],b[1],c[1]));
    if(minX<1||minY<1||maxX>=w-1||maxY>=h-1)throw new RangeError('Resonant Type: output exceeds source padding; enlarge paper margin');
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)for(let sample=0;sample<sampleCount;sample++){
      if(++visits>maxSamples)throw new RangeError('Resonant Type: transport work budget exceeded');
      const px=x+offsetsX[sample],py=y+offsetsY[sample];
      const f=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den;
      const g=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den,t=1-f-g;
      if(f< -1e-8||g< -1e-8||t< -1e-8)continue;
      const sx=f*ua[0]+g*ub[0]+t*uc[0],sy=f*ua[1]+g*ub[1]+t*uc[1],at=(y*w+x)*sampleCount+sample;
      samples[at]=Math.max(samples[at],alphaAt(sx,sy));
    }
  }
  for(let p=0;p<domain.alpha.length;p++)if(domain.alpha[p]){
    const x=p%w,y=Math.floor(p/w),a=vertex(x,y),b=vertex(x+1,y),c=vertex(x+1,y+1),d=vertex(x,y+1);
    const ua=[x-.5,y-.5],ub=[x+.5,y-.5],uc=[x+.5,y+.5],ud=[x-.5,y+.5];
    triangle(a,b,c,ua,ub,uc);triangle(a,c,d,ua,uc,ud);
  }
  const output=new Uint8ClampedArray(w*h);
  for(let p=0;p<output.length;p++){
    let sum=0;for(let k=0;k<sampleCount;k++)sum+=samples[p*sampleCount+k];
    output[p]=Math.round(sum/sampleCount);
  }
  return output;
}
