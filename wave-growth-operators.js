(function(root){
  'use strict';
  // Original numerical studies; source and approximation contract in
  // wave-growth-research.md. No copied artwork or external runtime dependency.
  var schemas={
    diffractiveGlyph:{label:'Diffractive Glyph',short:'dfg',color:'#253e77',description:'字形を通過した複素光波を伝播させ、回折縞と波長ごとのずれを描きます。',
      options:{diffractionMode:['aperture','relief','grating']},limits:{diffractionDistance:[0,80],diffractionPhase:[0,4],diffractionPeriod:[3,30],diffractionSpectrum:[0,1],diffractionExposure:[0.3,3]},
      defaults:{diffractionMode:'relief',diffractionDistance:24,diffractionPhase:1.8,diffractionPeriod:12,diffractionSpectrum:0.8,diffractionExposure:1.4},
      labels:{diffractionMode:'Plate / 光を通す面',diffractionDistance:'Travel / 伝播距離',diffractionPhase:'Phase / 位相の深さ',diffractionPeriod:'Period / 溝の間隔',diffractionSpectrum:'Spectrum / 波長の差',diffractionExposure:'Exposure / 光の濃さ'}},
    dendriteCast:{label:'Dendrite Cast',short:'drc',color:'#243f46',description:'字画の芯へ粒子が歩いて付着し、先端の成長と遮蔽から枝の字身を作ります。',
      options:{dendriteMode:['coral','frost','copper']},limits:{dendriteGrain:[0.7,3],dendriteGrowth:[0.05,1],dendriteReach:[0,30],dendriteStick:[0.1,1],dendriteBias:[-1,1]},
      defaults:{dendriteMode:'coral',dendriteGrain:1.55,dendriteGrowth:0.48,dendriteReach:9,dendriteStick:0.85,dendriteBias:0.1},
      labels:{dendriteMode:'Crystal / 枝の構造',dendriteGrain:'Grain / 粒の大きさ',dendriteGrowth:'Growth / 成長量',dendriteReach:'Reach / 字の外へ',dendriteStick:'Adhesion / 付着率',dendriteBias:'Drift / 流れの偏り'}}
  };
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function random(seed){var v=seed>>>0;return function(){v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};}
  function canvas(w,h){var c=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));c.width=w;c.height=h;c.getContext('2d',{willReadFrequently:true});return c;}
  function mix(a,b,t){return a.map(function(v,i){return v+(b[i]-v)*t;});}
  function power2(n){var p=1;while(p<n)p*=2;return p;}
  function fftLine(re,im,n,offset,stride,inverse){
    for(var i=1,j=0;i<n;i++){var bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){var a=offset+i*stride,b=offset+j*stride,t=re[a];re[a]=re[b];re[b]=t;t=im[a];im[a]=im[b];im[b]=t;}}
    for(var len=2;len<=n;len*=2){var angle=(inverse?2:-2)*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle);for(var start=0;start<n;start+=len){var ur=1,ui=0;for(var k=0;k<len/2;k++){var a=offset+(start+k)*stride,b=offset+(start+k+len/2)*stride,vr=re[b]*ur-im[b]*ui,vi=re[b]*ui+im[b]*ur;re[b]=re[a]-vr;im[b]=im[a]-vi;re[a]+=vr;im[a]+=vi;var next=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=next;}}}
    if(inverse)for(var i=0;i<n;i++){re[offset+i*stride]/=n;im[offset+i*stride]/=n;}
  }
  function fft2(re,im,w,h,inverse){if(w<1||h<1||(w&(w-1))||(h&(h-1))||re.length!==w*h||im.length!==w*h)throw Error('FFT dimensions must be powers of two');for(var y=0;y<h;y++)fftLine(re,im,w,y*w,1,inverse);for(var x=0;x<w;x++)fftLine(re,im,h,x,w,inverse);}
  function propagate(re,im,w,h,beta,pupil){
    fft2(re,im,w,h,false);
    for(var y=0;y<h;y++){var fy=(y<=h/2?y:y-h)/h;for(var x=0;x<w;x++){var fx=(x<=w/2?x:x-w)/w,f2=fx*fx+fy*fy,phase=-Math.PI*beta*f2,c=Math.cos(phase),s=Math.sin(phase),i=y*w+x,a=re[i],window=1;if(pupil&&Math.sqrt(f2)>pupil*.75)window=.5+.5*Math.cos(Math.PI*clamp((Math.sqrt(f2)/pupil-.75)/.25,0,1));re[i]=(a*c-im[i]*s)*window;im[i]=(a*s+im[i]*c)*window;}}
    fft2(re,im,w,h,true);return {re:re,im:im};
  }
  function sample(a,w,h,x,y){x=clamp(x,0,w-1.001);y=clamp(y,0,h-1.001);var ix=x|0,iy=y|0,dx=x-ix,dy=y-iy,p=iy*w+ix;return (a[p]*(1-dx)+a[p+1]*dx)*(1-dy)+(a[p+w]*(1-dx)+a[p+w+1]*dx)*dy;}
  function distance(mask,w,h){var d=new Float32Array(w*h),q=Math.SQRT2;for(var i=0;i<d.length;i++)d[i]=mask[i]>.5?1e5:0;for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++){var i=y*w+x;d[i]=Math.min(d[i],d[i-1]+1,d[i-w]+1,d[i-w-1]+q,d[i-w+1]+q);}for(var y=h-2;y>0;y--)for(var x=w-2;x>0;x--){var i=y*w+x;d[i]=Math.min(d[i],d[i+1]+1,d[i+w]+1,d[i+w-1]+q,d[i+w+1]+q);}return d;}
  function opticalGrid(s){
    // One numerical sample per source CSS pixel. The source alpha is sampled
    // from the host's 2x mask; visual output is reconstructed at host resolution.
    var w=power2(Math.ceil(s.w/s.scale)),h=power2(Math.ceil(s.h/s.scale));if(w*h>1048576)throw Error('Diffraction grid exceeds 1M cells');
    var mask=new Float32Array(w*h);
    for(var y=0;y<Math.ceil(s.h/s.scale);y++)for(var x=0;x<Math.ceil(s.w/s.scale);x++)mask[y*w+x]=sample(s.alpha,s.w,s.h,(x+.5)*s.scale-.5,(y+.5)*s.scale-.5);
    return {w:w,h:h,mask:mask,d:distance(mask,w,h)};
  }
  function opticalField(s,p,wavelength,grid){
    grid=grid||opticalGrid(s);var w=grid.w,h=grid.h,mask=grid.mask,d=grid.d,re=new Float64Array(w*h),im=new Float64Array(w*h),period=p.diffractionPeriod,phaseDepth=p.diffractionPhase*Math.PI/wavelength;
    var quadrature=Math.min(8,Math.max(2,Math.ceil(2*Math.abs(phaseDepth)/period)));
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){var i=y*w+x,a=mask[i];if(a<=0)continue;
      for(var sy=0;sy<quadrature;sy++)for(var sx=0;sx<quadrature;sx++){var dx=(sx+.5)/quadrature-.5,dy=(sy+.5)/quadrature-.5,u=x+dx,v=y+dy,phase=0,aa=sample(s.alpha,s.w,s.h,(u+.5)*s.scale-.5,(v+.5)*s.scale-.5)/(quadrature*quadrature);
        if(p.diffractionMode==='grating')phase=phaseDepth*Math.sin(2*Math.PI*((u+.5-s.pad)*.86+(v+.5-s.pad)*.5)/period);
        else phase=phaseDepth*(p.diffractionMode==='aperture'?.12:1)*Math.sin(2*Math.PI*sample(d,w,h,u,v)/period);
        re[i]+=aa*Math.cos(phase);im[i]+=aa*Math.sin(phase);
      }
    }
    var beta=p.diffractionDistance*p.diffractionDistance*.28*wavelength;
    // At long propagation distances a smooth numerical pupil attenuates the
    // frequencies whose lateral travel would wrap around the finite FFT tile.
    // Default-range fields retain their spectrum. This is an explicit optical
    // approximation, not a claim to simulate an unbounded physical instrument.
    var pupil=beta>0?Math.min(.75,s.pad*.8/beta):0;
    propagate(re,im,w,h,beta,pupil);
    var intensity=new Float32Array(w*h);for(var i=0;i<intensity.length;i++)intensity[i]=re[i]*re[i]+im[i]*im[i];return {intensity:intensity,w:w,h:h};
  }
  function diffraction(s,p,color,accent){
    var spread=p.diffractionSpectrum,grid=opticalGrid(s),bands=[1-.24*spread,1,1+.32*spread].map(function(w){return opticalField(s,p,w,grid);}),out=canvas(s.w,s.h),ctx=out.getContext('2d',{willReadFrequently:true}),im=ctx.createImageData(s.w,s.h);
    var inks=[mix(color,accent,.78),mix(color,[35,116,85],.62),mix(color,[56,57,196],.72)],b0=bands[0],b1=bands[1],b2=bands[2];
    for(var y=0;y<s.h;y++)for(var x=0;x<s.w;x++){var u=(x+.5)/s.scale-.5,v=(y+.5)/s.scale-.5,i0=Math.max(0,sample(b0.intensity,b0.w,b0.h,u,v)),i1=Math.max(0,sample(b1.intensity,b1.w,b1.h,u,v)),i2=Math.max(0,sample(b2.intensity,b2.w,b2.h,u,v)),sum=i0+i1+i2,max=Math.max(i0,i1,i2),alpha=1-Math.exp(-max*p.diffractionExposure*1.7);if(alpha<.004)continue;var at=(y*s.w+x)*4,contrast=(max-Math.min(i0,i1,i2))/(max||1);
      for(var k=0;k<3;k++){var v=(inks[0][k]*i0+inks[1][k]*i1+inks[2][k]*i2)/(sum||1);im.data[at+k]=clamp(v*(.6+.85*contrast),0,255);}im.data[at+3]=alpha*255;
    }

    // Destination shader: retain the solve and evaluate its material at output pixels.
    if(root.TypeDeformerRenderContext){var R=root.TypeDeformerRenderContext,highAlpha=R.alphaSampler(s.canvas);
      R.field(im,function(px,py,rgba,footprint){var x=px-.5,y=py-.5;var u=(x+.5)/s.scale-.5,v=(y+.5)/s.scale-.5,i0=Math.max(0,sample(b0.intensity,b0.w,b0.h,u,v)),i1=Math.max(0,sample(b1.intensity,b1.w,b1.h,u,v)),i2=Math.max(0,sample(b2.intensity,b2.w,b2.h,u,v)),sum=i0+i1+i2,max=Math.max(i0,i1,i2),alpha=1-Math.exp(-max*p.diffractionExposure*1.7);if(alpha<.004)return;var at=(y*s.w+x)*4,contrast=(max-Math.min(i0,i1,i2))/(max||1);
      for(var k=0;k<3;k++){var v=(inks[0][k]*i0+inks[1][k]*i1+inks[2][k]*i2)/(sum||1);rgba[k]=clamp(v*(.6+.85*contrast),0,255);}rgba[3]=alpha*255;
    });
    }
    ctx.putImageData(im,0,0);return out;
  }
  function thin(mask,w,h){
    var a=Uint8Array.from(mask,function(v){return v>.5?1:0;}),removed=[];
    for(var iter=0;iter<256;iter++){var changed=0;for(var pass=0;pass<2;pass++){removed.length=0;for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++){var i=y*w+x;if(!a[i])continue;var n=[a[i-w],a[i-w+1],a[i+1],a[i+w+1],a[i+w],a[i+w-1],a[i-1],a[i-w-1]],count=0,turns=0;for(var k=0;k<8;k++){count+=n[k];if(!n[k]&&n[(k+1)%8])turns++;}if(count<2||count>6||turns!==1)continue;if(pass===0?(n[0]*n[2]*n[4]||n[2]*n[4]*n[6]):(n[0]*n[2]*n[6]||n[0]*n[4]*n[6]))continue;removed.push(i);}removed.forEach(function(i){a[i]=0;});changed+=removed.length;}if(!changed)break;}
    // Tiny 2x2 islands can disappear under simultaneous thinning. Retain one
    // original cell when an entire source component would otherwise be lost.
    var seen=new Uint8Array(w*h);for(var i=0;i<mask.length;i++)if(mask[i]>.5&&!seen[i]){var queue=[i],hasSeed=false;seen[i]=1;for(var q=0;q<queue.length;q++){var at=queue[q],x=at%w,y=Math.floor(at/w);if(a[at])hasSeed=true;for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){var nx=x+dx,ny=y+dy,ni=ny*w+nx;if(nx<0||ny<0||nx>=w||ny>=h||seen[ni]||mask[ni]<=.5)continue;seen[ni]=1;queue.push(ni);}}if(!hasSeed)a[queue[Math.floor(queue.length/2)]]=1;}
    return a;
  }
  function aggregate(s,p,seed){
    var step=p.dendriteGrain,w=Math.ceil(s.w/s.scale/step),h=Math.ceil(s.h/s.scale/step),mask=new Float32Array(w*h),rng=random(seed),eligible=[];
    if(w*h>300000)throw Error('Dendrite lattice exceeds 300K cells');for(var y=0;y<h;y++)for(var x=0;x<w;x++)mask[y*w+x]=sample(s.alpha,s.w,s.h,(x+.5)*step*s.scale,(y+.5)*step*s.scale);
    var core=thin(mask,w,h),occupied=new Uint8Array(core),order=new Int32Array(w*h),parents=new Int32Array(w*h);parents.fill(-1);var inverse=Float32Array.from(mask,function(v){return 1-v;}),outside=distance(inverse,w,h),count=0,seeds=[];
    for(var i=0;i<mask.length;i++){if(occupied[i]){seeds.push(i);order[i]=++count;}else if(mask[i]>.5||outside[i]*step<p.dendriteReach)eligible.push(i);}
    var rootCount=count,target=Math.min(eligible.length,Math.round(eligible.length*p.dendriteGrowth*.72)),deposits=[],visits=0,maxSteps=Math.max(300,Math.min(4000,Math.round(750/step))),budget=Math.min(16000000,Math.max(600000,target*1600)),dirs=p.dendriteMode==='frost'?[[1,0],[-1,0],[0,1],[0,-1]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
    for(var attempt=0;deposits.length<target&&visits<budget&&attempt<target*12+100;attempt++){
      var at=eligible[Math.floor(rng()*eligible.length)];if(at==null||occupied[at])continue;var x=at%w,y=Math.floor(at/w);
      for(var walk=0;walk<maxSteps&&visits<budget;walk++,visits++){
        at=y*w+x;var contacts=[];for(var k=0;k<dirs.length;k++){var nx=x+dirs[k][0],ny=y+dirs[k][1],ni=ny*w+nx;if(nx>=0&&nx<w&&ny>=0&&ny<h&&occupied[ni])contacts.push(ni);}
        var attachment=p.dendriteStick*(p.dendriteMode==='copper'?Math.min(1,contacts.length*.28):1);
        if(contacts.length&&rng()<attachment){var parent=contacts[Math.floor(rng()*contacts.length)];occupied[at]=1;parents[at]=parent;order[at]=++count;deposits.push(at);break;}
        var dir=dirs[Math.floor(rng()*dirs.length)],nx=x+dir[0],ny=y+dir[1];if(rng()<Math.abs(p.dendriteBias)*.2)ny=y+(p.dendriteBias>0?1:-1);
        if(nx<1||nx>=w-1||ny<1||ny>=h-1)break;var next=ny*w+nx;if(occupied[next])continue;if(mask[next]<=.5&&outside[next]*step>=p.dendriteReach)continue;x=nx;y=ny;
      }
    }
    return {w:w,h:h,step:step,occupied:occupied,core:core,seeds:seeds,order:order,parents:parents,deposits:deposits,target:target,visits:visits,rootCount:rootCount};
  }
  function dendrite(s,p,color,accent,seed){
    var a=aggregate(s,p,seed),out=canvas(s.w,s.h),ctx=out.getContext('2d',{willReadFrequently:true}),scale=a.step*s.scale,base=p.dendriteMode==='copper'?mix(color,[147,75,43],.6):color,highlight=p.dendriteMode==='frost'?[139,197,204]:[225,183,112];ctx.lineCap='round';ctx.lineJoin='round';
    // Roots are the thinned source structure; deposits keep their true parent.
    ctx.strokeStyle='rgb('+base.map(Math.round).join(',')+')';ctx.lineWidth=scale*.62;ctx.beginPath();a.seeds.forEach(function(i){var x=i%a.w,y=Math.floor(i/a.w);[[1,0],[0,1],[1,1],[-1,1]].forEach(function(d){var nx=x+d[0],ny=y+d[1],j=ny*a.w+nx;if(nx>=0&&nx<a.w&&ny<a.h&&a.core[j]){ctx.moveTo((x+.5)*scale,(y+.5)*scale);ctx.lineTo((nx+.5)*scale,(ny+.5)*scale);}});});ctx.stroke();
    a.seeds.forEach(function(i){ctx.fillStyle='rgb('+base.map(Math.round).join(',')+')';ctx.beginPath();ctx.arc((i%a.w+.5)*scale,(Math.floor(i/a.w)+.5)*scale,scale*.34,0,Math.PI*2);ctx.fill();});
    var mass=new Float32Array(a.w*a.h);a.deposits.forEach(function(i){mass[i]=1;});for(var n=a.deposits.length-1;n>=0;n--){var i=a.deposits[n],parent=a.parents[i];if(parent>=0)mass[parent]+=mass[i];}
    a.deposits.forEach(function(i,n){var parent=a.parents[i],x=(i%a.w+.5)*scale,y=(Math.floor(i/a.w)+.5)*scale,px=(parent%a.w+.5)*scale,py=(Math.floor(parent/a.w)+.5)*scale,t=n/Math.max(1,a.deposits.length-1),ink=mix(base,accent,t*.4),radius=scale*clamp(.28+Math.sqrt(mass[i])*.13,.4,2.2),len=Math.hypot(x-px,y-py)||1,nx=-(y-py)/len,ny=(x-px)/len;
      if(p.dendriteMode!=='frost'){var gradient=ctx.createLinearGradient(x+nx*radius,y+ny*radius,x-nx*radius,y-ny*radius);gradient.addColorStop(0,'rgb('+ink.map(function(v){return Math.round(v*.35);}).join(',')+')');gradient.addColorStop(.35,'rgb('+mix(ink,highlight,.65).map(Math.round).join(',')+')');gradient.addColorStop(.65,'rgb('+ink.map(Math.round).join(',')+')');gradient.addColorStop(1,'rgb('+ink.map(function(v){return Math.round(v*.45);}).join(',')+')');ctx.strokeStyle=gradient;}else ctx.strokeStyle='rgb('+mix(ink,highlight,t*.45).map(Math.round).join(',')+')';
      ctx.lineWidth=radius*2;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x,y);ctx.stroke();
    });
    return out;
  }
  root.TypeDeformerWaveGrowth={schemas:schemas,ids:Object.keys(schemas),renderers:{diffractiveGlyph:diffraction,dendriteCast:dendrite},effectPad:function(){return 112;},internals:{fft2:fft2,propagate:propagate,opticalField:opticalField,thin:thin,aggregate:aggregate}};
})(typeof globalThis!=='undefined'?globalThis:this);
