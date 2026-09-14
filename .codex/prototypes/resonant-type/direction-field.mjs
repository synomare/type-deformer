// Source-local normal/coherence tensor, not a font outline or stroke skeleton.
// Independent implementation: signed-distance gradients, ink-only weights,
// separable triangular neighbourhood, and a sign-invariant rank-one response.
function triangular(input,width,height,radius){
  const temp=new Float64Array(input.length),output=new Float64Array(input.length);
  const sum=new Float64Array(Math.max(width,height)+1),boxIntegral=new Float64Array(sum.length+radius),den=(radius+1)**2;
  function line(length,read,write){
    sum[0]=boxIntegral[0]=0;
    for(let j=0;j<length;j++)sum[j+1]=sum[j]+read(j);
    // Opposing causal boxes give the triangular kernel with a complete halo.
    // Avoid subtracting x-weighted moments, which amplify cancellation.
    for(let q=0;q<length+radius;q++)boxIntegral[q+1]=boxIntegral[q]+sum[Math.min(length,q+1)]-sum[Math.max(0,q-radius)];
    for(let x=0;x<length;x++)write(x,(boxIntegral[x+radius+1]-boxIntegral[x])/den);
  }
  for(let y=0;y<height;y++)line(width,x=>input[y*width+x],(x,v)=>{temp[y*width+x]=v;});
  for(let x=0;x<width;x++)line(height,y=>temp[y*width+x],(y,v)=>{output[y*width+x]=v;});
  return output;
}

export function prepareResonantDirection(domain,{radius=6}={}){
  if(!Number.isInteger(radius)||radius<1||radius>64)throw new RangeError('Resonant Type: invalid direction radius');
  const {width:w,height:h,mask,signed}=domain,n=w*h;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||n>1048576||mask?.length!==n||signed?.length!==n)throw new RangeError('Resonant Type: invalid direction domain');
  const rawXX=new Float64Array(n),rawXY=new Float64Array(n),rawYY=new Float64Array(n);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const p=y*w+x;if(!mask[p])continue;
    const gx=(signed[p+1]-signed[p-1])*.5,gy=(signed[p+w]-signed[p-w])*.5;
    rawXX[p]=gx*gx;rawXY[p]=gx*gy;rawYY[p]=gy*gy;
  }
  const xx=triangular(rawXX,w,h,radius),xy=triangular(rawXY,w,h,radius),yy=triangular(rawYY,w,h,radius);
  const normalXX=new Float32Array(n),normalXY=new Float32Array(n),normalYY=new Float32Array(n);
  for(let p=0;p<n;p++){
    const a=Math.max(0,xx[p]),d=Math.max(0,yy[p]),limit=Math.sqrt(a*d),b=Math.max(-limit,Math.min(limit,xy[p]));
    const trace=a+d;if(trace<=1e-12)continue;
    const diff=a-d,delta=Math.min(trace,Math.hypot(diff,2*b));
    // Q = coherence * n*n^T. No eigenvector sign is selected; at isotropy it
    // tends continuously to zero instead of choosing a random direction.
    normalXX[p]=(delta+diff)/(2*trace);normalXY[p]=b/trace;normalYY[p]=(delta-diff)/(2*trace);
  }
  return {domain,radius,normalXX,normalXY,normalYY};
}
