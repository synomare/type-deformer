// Original, analytic camera-rig studio. No environment image, texture lookup,
// copied BRDF, ray-traced shadow or physical light-transport claim.
const unit=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const panels=[
  {direction:[-.42,-.48,.77],width:.65,height:.9,power:3.5},
  {direction:[.8,.15,.58],width:.24,height:.8,power:2.4},
  {direction:[-.7,.4,-.6],width:.36,height:.75,power:2.6}
].map(p=>{const d=unit(p.direction),u=unit(cross([0,1,0],d));return {...p,d,u,v:cross(d,u)};});

// Roughness broadens the analytic panel lobes and reduces their peak. This is
// a bounded, continuous approximation, NOT a GGX environment convolution.
export function prepareStudio(roughness){
  if(!Number.isFinite(roughness)||roughness<.04||roughness>1)throw new RangeError('Invalid studio roughness');
  const blur=.015+.6*roughness*roughness;
  const lights=panels.map(p=>{const w=Math.hypot(p.width,blur),h=Math.hypot(p.height,blur);return {...p,w,h,power:p.power*p.width*p.height/(w*h)};});
  return (nx,ny,nz)=>{
    // Orthographic outgoing direction (0,0,1). Reflection is in view space,
    // so pan/zoom have no lighting input and normals drive every reflection.
    const r=[2*nx*nz,2*ny*nz,2*nz*nz-1];
    let energy=.07+.16*smooth((1-r[1])*.5);
    for(const p of lights){const a=dot(r,p.u)/p.w,b=dot(r,p.v)/p.h;
      energy+=p.power*Math.exp(-a*a-b*b)*smooth(dot(r,p.d)/.4);
    }
    return energy;
  };
}

// Input ink is a display RGB reflectance tint. Convert only this optional
// finish to a linear approximation; the existing classic path stays exact.
export function studioChannel(tint,nz,energy){
  const f0=tint**2.2,f=f0+(1-f0)*(1-Math.max(0,Math.min(1,nz)))**5;
  const light=f*energy;
  return (light/(1+light))**(1/2.2);
}
