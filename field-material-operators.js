(function (root) {
  'use strict';
  // Original glyph-local numerical material studies. Research and approximation
  // boundaries are documented in field-material-research.md. No external assets.
  var schemas = {
    tensorFiligree: { label:'Tensor Filigree', short:'tf', color:'#192a40', description:'字画の方向場をたどる細線を、間隔・旋回・筆圧で組織化します。',
      options:{tensorMode:['contour','vortex','braid']}, limits:{tensorSpacing:[2,16],tensorTurn:[0,2],tensorWeight:[0.2,2.4],tensorLength:[0.2,2],tensorContour:[0,1]},
      defaults:{tensorMode:'vortex',tensorSpacing:2.8,tensorTurn:1.25,tensorWeight:0.6,tensorLength:1.7,tensorContour:0.36},
      labels:{tensorMode:'Flow / 流れ',tensorSpacing:'Spacing / 線の間隔',tensorTurn:'Vorticity / 旋回',tensorWeight:'Pressure / 線の太さ',tensorLength:'Travel / 線の長さ',tensorContour:'Boundary / 字画への追従'} },
    chromaticSwarm: {label:'Chromatic Swarm',short:'sw',color:'#174caa',description:'字画の厚みから重心ボロノイを解き、重なる記号の群で文字を組み直します。',
      options:{swarmMark:['rosette','orbit','cross']},limits:{swarmCell:[5,28],swarmRelax:[0,8],swarmOverlap:[0.4,1.8],swarmPlates:[1,3],swarmBias:[0,2]},integers:['swarmRelax','swarmPlates'],
      defaults:{swarmMark:'rosette',swarmCell:13,swarmRelax:5,swarmOverlap:1.3,swarmPlates:3,swarmBias:0.8},
      labels:{swarmMark:'Mark / 記号',swarmCell:'Cell / 記号の大きさ',swarmRelax:'Relaxation / 重心整列',swarmOverlap:'Overlap / 重なり',swarmPlates:'Plates / 色版数',swarmBias:'Density / 字画内の密度差'} },
    gyroidSculpture: {label:'Gyroid Sculpture',short:'gy',color:'#285c57',description:'連続した三次元の多孔体を字形で切り出し、穴の奥と表面を描きます。',
      options:{gyroidMode:['gyroid','diamond','primitive']},limits:{gyroidCell:[10,65],gyroidShell:[0.08,0.65],gyroidDepth:[4,50],gyroidTwist:[-1.5,1.5],gyroidLight:[-180,180]},
      defaults:{gyroidMode:'gyroid',gyroidCell:33,gyroidShell:0.18,gyroidDepth:29,gyroidTwist:0.65,gyroidLight:-48},
      labels:{gyroidMode:'Surface / 曲面',gyroidCell:'Period / 孔の周期',gyroidShell:'Wall / 壁の厚さ',gyroidDepth:'Depth / 奥行き',gyroidTwist:'Torsion / ねじれ',gyroidLight:'Light / 光の方向'} },
    causticGlass: {label:'Caustic Glass',short:'cgl',color:'#176273',description:'字画の盛り上がりをレンズにし、屈折した光の重なりと色の分離を描きます。',
      options:{causticMode:['lens','fluted','ripple']},limits:{causticRelief:[1,24],causticFocus:[0,65],causticIOR:[1.05,1.8],causticDispersion:[0,1],causticRidges:[0,1.5]},
      defaults:{causticMode:'fluted',causticRelief:14,causticFocus:34,causticIOR:1.45,causticDispersion:0.3,causticRidges:0.85},
      labels:{causticMode:'Lens / レンズ',causticRelief:'Relief / 隆起',causticFocus:'Projection / 投射距離',causticIOR:'Refraction / 屈折率',causticDispersion:'Dispersion / 色分離',causticRidges:'Fluting / 襞'} }
  };
  var patternTension = root.TypeDeformerPatternTension;
  if(patternTension)Object.assign(schemas,patternTension.schemas);
  var waveGrowth = root.TypeDeformerWaveGrowth;
  if(waveGrowth)Object.assign(schemas,waveGrowth.schemas);
  var orderMatter = root.TypeDeformerOrderMatter;
  if(orderMatter)Object.assign(schemas,orderMatter.schemas);
  var hyperbolicAtlas = root.TypeDeformerHyperbolicAtlas;
  if(hyperbolicAtlas)Object.assign(schemas,hyperbolicAtlas.schemas);
  var loadpathFoundry = root.TypeDeformerLoadpathFoundry;
  if(loadpathFoundry)Object.assign(schemas,loadpathFoundry.schemas);
  var nodalGlaze = root.TypeDeformerNodalGlaze;
  if(nodalGlaze)Object.assign(schemas,nodalGlaze.schemas);
  var spinodalAlloy = root.TypeDeformerSpinodalAlloy;
  if(spinodalAlloy)Object.assign(schemas,spinodalAlloy.schemas);
  var densityRecast = root.TypeDeformerDensityRecast;
  if(densityRecast)Object.assign(schemas,densityRecast.schemas);
  var hopfLoom = root.TypeDeformerHopfLoom;
  if(hopfLoom)Object.assign(schemas,hopfLoom.schemas);
  var miuraVault = root.TypeDeformerMiuraVault;
  if(miuraVault)Object.assign(schemas,miuraVault.schemas);
  var vortexBath = root.TypeDeformerVortexBath;
  if(vortexBath)Object.assign(schemas,vortexBath.schemas);
  var stressGlass = root.TypeDeformerStressGlass;
  if(stressGlass)Object.assign(schemas,stressGlass.schemas);
  var excessBody = root.TypeDeformerExcessBody;
  if(excessBody)Object.assign(schemas,excessBody.schemas);
  var ramifiedBody = root.TypeDeformerRamifiedBody;
  if(ramifiedBody)Object.assign(schemas,ramifiedBody.schemas);
  var foldedBody = root.TypeDeformerFoldedBody;
  if(foldedBody)Object.assign(schemas,foldedBody.schemas);
  var letterformBody = root.TypeDeformerLetterformBody;
  if(letterformBody)Object.assign(schemas,letterformBody.schemas);
  var metamorphicBody = root.TypeDeformerMetamorphicBody;
  if(metamorphicBody)Object.assign(schemas,metamorphicBody.schemas);
  var gravityLens = root.TypeDeformerGravityLens;
  if(gravityLens)Object.assign(schemas,gravityLens.schemas);
  var liquidRope = root.TypeDeformerLiquidRope;
  if(liquidRope)Object.assign(schemas,liquidRope.schemas);
  var wulffBody = root.TypeDeformerWulffBody;
  if(wulffBody)Object.assign(schemas,wulffBody.schemas);
  var repulsiveCurves = root.TypeDeformerRepulsiveCurves;
  if(repulsiveCurves)Object.assign(schemas,repulsiveCurves.schemas);
  var wassersteinLetters = root.TypeDeformerWassersteinLetters;
  if(wassersteinLetters)Object.assign(schemas,wassersteinLetters.schemas);
  var boundedBodyIds=(excessBody?excessBody.ids:[]).concat(ramifiedBody?ramifiedBody.ids:[],foldedBody?foldedBody.ids:[],letterformBody?letterformBody.ids:[],metamorphicBody?metamorphicBody.ids:[],gravityLens?gravityLens.ids:[],liquidRope?liquidRope.ids:[],wulffBody?wulffBody.ids:[],repulsiveCurves?repulsiveCurves.ids:[],wassersteinLetters?wassersteinLetters.ids:[]);
  var ids=Object.keys(schemas), cache=new Map(), cacheBytes=0, MAX_BYTES=32*1024*1024;
  function clamp(v,a,b){v=Number(v);return Math.max(a,Math.min(b,isFinite(v)?v:a));}
  function rand(seed){var s=seed>>>0;return function(){s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
  function rgb(s){s=/^#[0-9a-f]{6}$/i.test(s)?s:'#254953';return [1,3,5].map(function(i){return parseInt(s.slice(i,i+2),16);});}
  function blend(a,b,t){return a.map(function(v,i){return Math.round(v+(b[i]-v)*clamp(t,0,1));});}
  function css(a){return 'rgb('+a.join(',')+')';}
  function canvas(w,h){var c=(globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas'));c.width=w;c.height=h;return c;}
  function fingerprint(a){var h=2166136261;for(var i=3;i<a.length;i+=4)h=Math.imul(h^a[i],16777619);return h>>>0;}
  // Eight-neighbour chamfer metric: bounded O(n), subpixel input retained for
  // compositing. Not advertised as an exact Euclidean distance transform.
  function distance(alpha,w,h){var d=new Float32Array(w*h),r=Math.SQRT2;
    for(var i=0;i<d.length;i++)d[i]=alpha[i]>0.5?1e5:0;
    for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++){var p=y*w+x;d[p]=Math.min(d[p],d[p-1]+1,d[p-w]+1,d[p-w-1]+r,d[p-w+1]+r);}
    for(var y=h-2;y>0;y--)for(var x=w-2;x>0;x--){var p=y*w+x;d[p]=Math.min(d[p],d[p+1]+1,d[p+w]+1,d[p+w-1]+r,d[p+w+1]+r);}return d;
  }
  function sample(a,w,h,x,y){x=clamp(x,0,w-1.001);y=clamp(y,0,h-1.001);var ix=x|0,iy=y|0,fx=x-ix,fy=y-iy,p=iy*w+ix;return (a[p]*(1-fx)+a[p+1]*fx)*(1-fy)+(a[p+w]*(1-fx)+a[p+w+1]*fx)*fy;}
  function settings(id,g,env){var s=schemas[id],v={};Object.keys(s.defaults).forEach(function(k){var raw=g.surface&&g.surface[k];if(s.options[k])v[k]=s.options[k].indexOf(raw)>=0?raw:s.defaults[k];else{v[k]=raw==null?s.defaults[k]:(root.TypeDeformerParameters?root.TypeDeformerParameters.normalize(k,raw,s.defaults[k],s.limits[k][0],s.limits[k][1],(s.integers||[]).indexOf(k)>=0):clamp(raw,s.limits[k][0],s.limits[k][1]));if((s.integers||[]).indexOf(k)>=0)v[k]=Math.round(v[k]);}});return v;}
  function requestedPad(id,g,p){return Math.ceil(wassersteinLetters&&wassersteinLetters.ids.indexOf(id)>=0?wassersteinLetters.effectPad(id,g):repulsiveCurves&&repulsiveCurves.ids.indexOf(id)>=0?repulsiveCurves.effectPad(id,g):wulffBody&&wulffBody.ids.indexOf(id)>=0?wulffBody.effectPad(id,g):liquidRope&&liquidRope.ids.indexOf(id)>=0?liquidRope.effectPad(id,g):gravityLens&&gravityLens.ids.indexOf(id)>=0?gravityLens.effectPad(id,g):metamorphicBody&&metamorphicBody.ids.indexOf(id)>=0?metamorphicBody.effectPad(id,g):letterformBody&&letterformBody.ids.indexOf(id)>=0?letterformBody.effectPad(id,g,p):foldedBody&&foldedBody.ids.indexOf(id)>=0?foldedBody.effectPad(id,g):ramifiedBody&&ramifiedBody.ids.indexOf(id)>=0?ramifiedBody.effectPad(id,g):excessBody&&excessBody.ids.indexOf(id)>=0?excessBody.effectPad(id,g):nodalGlaze&&nodalGlaze.ids.indexOf(id)>=0?nodalGlaze.effectPad(id):spinodalAlloy&&spinodalAlloy.ids.indexOf(id)>=0?spinodalAlloy.effectPad(id):densityRecast&&densityRecast.ids.indexOf(id)>=0?densityRecast.effectPad(id):hopfLoom&&hopfLoom.ids.indexOf(id)>=0?hopfLoom.effectPad(id):miuraVault&&miuraVault.ids.indexOf(id)>=0?miuraVault.effectPad(id):vortexBath&&vortexBath.ids.indexOf(id)>=0?vortexBath.effectPad(id):stressGlass&&stressGlass.ids.indexOf(id)>=0?stressGlass.effectPad(id):loadpathFoundry&&loadpathFoundry.ids.indexOf(id)>=0?loadpathFoundry.effectPad(id):hyperbolicAtlas&&hyperbolicAtlas.ids.indexOf(id)>=0?hyperbolicAtlas.effectPad(id):orderMatter&&orderMatter.ids.indexOf(id)>=0?orderMatter.effectPad(id):waveGrowth&&waveGrowth.ids.indexOf(id)>=0?waveGrowth.effectPad(id):patternTension&&patternTension.ids.indexOf(id)>=0?patternTension.effectPad(id):id==='causticGlass'?90:id==='gyroidSculpture'?40:16);}
  function source(g,L,fm,env,id,p,padOverride){
    var scale=2, pad=padOverride==null?requestedPad(id,g,p):Math.ceil(padOverride);
    // Keep the whole measured ink envelope, not only the CSS line box, inside
    // the glyph-local raster. Long swashes and descenders must survive Surface
    // processing before the global camera and export bounds are evaluated.
    var inkX=Number.isFinite(g.bx)?g.bx:g.x,inkY=Number.isFinite(g.by)?g.by:g.y;
    var inkW=Number.isFinite(g.bw)?Math.max(1,g.bw):g.w,inkH=Number.isFinite(g.bh)?Math.max(1,g.bh):g.h;
    var x=Math.min(g.x,inkX)-pad,y=Math.min(g.y,inkY)-pad;
    var worldW=Math.max(g.x+g.w,inkX+inkW)+pad-x,worldH=Math.max(g.y+g.h,inkY+inkH)+pad-y;
    // The material grid is explicit and shared by preview and all exports.
    var w=Math.max(4,Math.ceil(worldW*scale)),h=Math.max(4,Math.ceil(worldH*scale));
    // These two geometry solvers use an explicit bounded raster source. Large
    // branched extents reduce analysis scale continuously instead of clipping.
    if(((ramifiedBody&&ramifiedBody.ids.indexOf(id)>=0)||(foldedBody&&foldedBody.ids.indexOf(id)>=0)||(letterformBody&&letterformBody.ids.indexOf(id)>=0)||(metamorphicBody&&metamorphicBody.ids.indexOf(id)>=0)||(gravityLens&&gravityLens.ids.indexOf(id)>=0)||(liquidRope&&liquidRope.ids.indexOf(id)>=0)||(wulffBody&&wulffBody.ids.indexOf(id)>=0)||(repulsiveCurves&&repulsiveCurves.ids.indexOf(id)>=0)||(wassersteinLetters&&wassersteinLetters.ids.indexOf(id)>=0))&&w*h>2400000){scale=Math.sqrt(2380000/(worldW*worldH));w=Math.ceil(worldW*scale);h=Math.ceil(worldH*scale);}
    if(w*h>2400000)throw new Error('Field material: glyph raster exceeds 2.4M pixels; reduce text size.');
    var tile=env.scratch('field-material-source',w,h,true), local=Object.assign({},g,{x:g.x-x,y:g.y-y,ox:0,oy:0,tx:0,ty:0,rot:0,skewX:0,skewY:0,scaleX:1,scaleY:1,opacity:1});
    env.drawGlyph(tile.ctx,local,scale,{dx:0,dy:0,s:1},fm,1,'#ffffff');
    var data=tile.ctx.getImageData(0,0,w,h).data,alpha=new Float32Array(w*h);
    for(var i=0;i<alpha.length;i++)alpha[i]=data[i*4+3]/255;
    var result={canvas:tile.canvas,data:data,alpha:alpha,w:w,h:h,scale:scale,pad:pad,x:x,y:y,key:fingerprint(data),trace:env.traceContours};
    if(id==='wassersteinLetters'){
      result.partner=env.params.wassersteinPartner||'X';
      result.targetFont=env.font?env.font(g,320).font:env.params.fontWeight+' 320px '+env.params.fontFamily;
      result.targetAngle=env.params.vertical&&env.charInfo&&!env.charInfo(result.partner,result.partner.codePointAt(0)).upright?Math.PI/2:0;
      if(env.params.vertical&&wassersteinLetters.characters(result.partner).length>1) result.targetAngles=wassersteinLetters.characters(result.partner).map(function(ch){return env.charInfo&&!env.charInfo(ch,ch.codePointAt(0)).upright?Math.PI/2:0;});
      result.key+='/'+result.targetAngles+'/'+result.partner+'/'+result.targetFont+'/'+result.targetAngle+'/'+wassersteinLetters.fontRevision();
    }
    return result;
  }
  function masked(out,s){var c=out.getContext('2d');c.globalCompositeOperation='destination-in';c.drawImage(s.canvas,0,0);c.globalCompositeOperation='source-over';}
  function tensor(s,p,color,accent,seed){
    var out=canvas(s.w,s.h),ctx=out.getContext('2d'),d=distance(s.alpha,s.w,s.h),random=rand(seed),spacing=p.tensorSpacing*s.scale;
    var inverse=s.alpha.map(function(v){return 1-v;}),outside=distance(inverse,s.w,s.h),reach=p.tensorTurn*s.scale*3;
    for(var i=0;i<d.length;i++)if(s.alpha[i]<.5)d[i]=-outside[i];
    var occupied=new Uint8Array(s.w*s.h),paths=[],maxSteps=Math.ceil(200*p.tensorLength),step=1.15*s.scale;
    function field(x,y,previous){
      var dx=sample(d,s.w,s.h,x+2,y)-sample(d,s.w,s.h,x-2,y),dy=sample(d,s.w,s.h,x,y+2)-sample(d,s.w,s.h,x,y-2),a=Math.atan2(dy,dx)+Math.PI/2;
      var u=x/s.scale,v=y/s.scale,flow=Math.atan2(v-s.h/s.scale*0.47,u-s.w/s.scale*0.54)+Math.PI/2;
      flow+=p.tensorTurn*(Math.sin(u*0.07+seed*.01)*1.15+Math.cos(v*.058)*.95);
      if(p.tensorMode==='braid')flow=0.55+Math.sin(v*.035+Math.sin(u*.032))*p.tensorTurn;
      var edge=sample(d,s.w,s.h,x,y),t=p.tensorMode==='contour'?0.94:Math.max(p.tensorContour*Math.min(1,Math.hypot(dx,dy)/3),edge<2?.75:0);
      var angle=.5*Math.atan2(Math.sin(2*a)*t+Math.sin(2*flow)*(1-t),Math.cos(2*a)*t+Math.cos(2*flow)*(1-t));
      var f=[Math.cos(angle),Math.sin(angle)];if(previous&&f[0]*previous[0]+f[1]*previous[1]<0){f[0]*=-1;f[1]*=-1;}return f;
    }
    function blocked(x,y){return x<2||y<2||x>=s.w-2||y>=s.h-2||sample(d,s.w,s.h,x,y)<-reach||occupied[(y|0)*s.w+(x|0)];}
    var seeds=[];for(var y=4;y<s.h-4;y+=spacing)for(var x=4;x<s.w-4;x+=spacing)seeds.push([x+(random()-.5)*spacing,y+(random()-.5)*spacing]);
    seeds.sort(function(a,b){return sample(d,s.w,s.h,b[0],b[1])-sample(d,s.w,s.h,a[0],a[1]);});
    seeds.forEach(function(start){if(blocked(start[0],start[1]))return;var halves=[];
      [-1,1].forEach(function(sign){var points=[],x=start[0],y=start[1],v=field(x,y);v=[v[0]*sign,v[1]*sign];
        for(var k=0;k<maxSteps;k++){if(blocked(x,y))break;points.push([x,y]);var v0=field(x,y,v),v1=field(x+v0[0]*step/2,y+v0[1]*step/2,v0);x+=v1[0]*step;y+=v1[1]*step;v=v1;if(k>12&&Math.hypot(x-start[0],y-start[1])<step*2)break;}halves.push(points);});
      var line=halves[0].reverse().concat(halves[1].slice(1));if(line.length<4)return;paths.push(line);
      var r=Math.max(1,spacing*.69)|0;line.forEach(function(pt){for(var yy=-r;yy<=r;yy++)for(var xx=-r;xx<=r;xx++)if(xx*xx+yy*yy<=r*r){var x=(pt[0]|0)+xx,y=(pt[1]|0)+yy;if(x>=0&&y>=0&&x<s.w&&y<s.h)occupied[y*s.w+x]=1;}});
    });
    ctx.lineCap='round';ctx.lineJoin='round';paths.forEach(function(line,index){
      // Tapered ribbons made from paired offsets preserve sweeping paths.
      var left=[],right=[];for(var i=0;i<line.length;i++){var a=line[Math.max(0,i-1)],b=line[Math.min(line.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
        var taper=Math.pow(Math.sin(Math.PI*(i+.5)/line.length),.55),width=s.scale*p.tensorWeight*(.35+.8*taper)*(1+.35*Math.sin(i*.04+index));
        left.push([line[i][0]-dy/len*width,line[i][1]+dx/len*width]);right.push([line[i][0]+dy/len*width,line[i][1]-dx/len*width]);}
      ctx.fillStyle=css(blend(color,accent,index%11===0?.72:(index%7)*.025));ctx.beginPath();left.concat(right.reverse()).forEach(function(pt,i){if(i)ctx.lineTo(pt[0],pt[1]);else ctx.moveTo(pt[0],pt[1]);});ctx.closePath();ctx.fill();
    });return out;
  }
  // Weighted Lloyd relaxation. Samples are source-mask cells, weights increase
  // toward thick stroke interiors. Empty cells keep their previous location.
  function lloyd(points,samples,iterations){points=points.map(function(p){return p.slice();});for(var t=0;t<iterations;t++){var sums=points.map(function(){return [0,0,0];});samples.forEach(function(s){var best=0,min=Infinity;for(var j=0;j<points.length;j++){var dx=s[0]-points[j][0],dy=s[1]-points[j][1],ds=dx*dx+dy*dy;if(ds<min){min=ds;best=j;}}sums[best][0]+=s[0]*s[2];sums[best][1]+=s[1]*s[2];sums[best][2]+=s[2];});points=points.map(function(p,i){return sums[i][2]?[sums[i][0]/sums[i][2],sums[i][1]/sums[i][2]]:p;});}return points;}
  function swarm(s,p,color,accent,seed){var out=canvas(s.w,s.h),ctx=out.getContext('2d'),d=distance(s.alpha,s.w,s.h),random=rand(seed),cell=p.swarmCell*s.scale,samples=[],area=0;
    for(var i=0;i<s.alpha.length;i++)area+=s.alpha[i];
    var stride=Math.max(2,Math.ceil(Math.sqrt(s.w*s.h/6500)));
    for(var y=1;y<s.h-1;y+=stride)for(var x=1;x<s.w-1;x+=stride)if(s.alpha[y*s.w+x]>.5)samples.push([x,y,1+p.swarmBias*Math.min(3,d[y*s.w+x]/cell*3)]);
    if(!samples.length)return out;
    var count=Math.min(420,Math.max(1,Math.round(area/(cell*cell)*1.5))),points=[];
    for(var n=0;n<count;n++){var best=null,bestDistance=-1;for(var trial=0;trial<12;trial++){var a=samples[Math.floor(random()*samples.length)],dist=Infinity;for(var j=0;j<points.length;j++)dist=Math.min(dist,(a[0]-points[j][0])**2+(a[1]-points[j][1])**2);if(dist>bestDistance){bestDistance=dist;best=a;}}points.push([best[0],best[1]]);}points=lloyd(points,samples,p.swarmRelax);
    var palette=[color,accent,[218,150,32]];ctx.globalCompositeOperation='multiply';
    points.forEach(function(pt,i){var nearest=cell;for(var j=0;j<points.length;j++)if(j!==i)nearest=Math.min(nearest,Math.hypot(pt[0]-points[j][0],pt[1]-points[j][1]));var radius=Math.max(1.8,nearest*.66)*p.swarmOverlap;
      for(var plate=0;plate<p.swarmPlates;plate++){ctx.save();ctx.translate(pt[0]+(plate-1)*radius*.24,pt[1]+Math.sin(i*2.4+plate)*radius*.16);ctx.rotate(i*2.399963+plate*.72);ctx.strokeStyle=css(palette[plate]);ctx.fillStyle=css(palette[plate]);ctx.lineWidth=Math.max(.8,s.scale*.48);ctx.globalAlpha=.9;
        if(p.swarmMark==='rosette'){ctx.lineWidth=Math.max(1,radius*.12);for(var ring=1;ring<=4;ring++){ctx.beginPath();ctx.arc(0,0,radius*ring/4,.12,Math.PI-.12);ctx.stroke();ctx.beginPath();ctx.arc(0,0,radius*ring/4,Math.PI+.12,Math.PI*2-.12);ctx.stroke();}}
        else if(p.swarmMark==='orbit'){for(var ring=1;ring<=4;ring++){ctx.beginPath();ctx.arc(0,0,radius*ring/4,.18+plate*.6,Math.PI*1.8+plate*.6);ctx.stroke();}}
        else{for(var stripe=-2;stripe<=2;stripe++){ctx.fillRect(-radius,stripe*radius*.3,radius*2,Math.max(.8,radius*.13));}ctx.rotate(Math.PI/2);ctx.fillRect(-radius,-radius*.15,radius*2,radius*.3);}ctx.restore();}
    });ctx.globalCompositeOperation='source-over';masked(out,s);return out;
  }
  function implicit(x,y,z,mode){if(mode==='primitive')return Math.cos(x)+Math.cos(y)+Math.cos(z);if(mode==='diamond')return Math.sin(x)*Math.sin(y)*Math.sin(z)+Math.sin(x)*Math.cos(y)*Math.cos(z)+Math.cos(x)*Math.sin(y)*Math.cos(z)+Math.cos(x)*Math.cos(y)*Math.sin(z);return Math.sin(x)*Math.cos(y)+Math.sin(y)*Math.cos(z)+Math.sin(z)*Math.cos(x);}
  function gyroid(s,p,color,accent,seed){
    var out=canvas(s.w,s.h),ctx=out.getContext('2d'),im=ctx.createImageData(s.w,s.h),d=distance(s.alpha,s.w,s.h),k=2*Math.PI/(p.gyroidCell*s.scale),depth=p.gyroidDepth*s.scale,light=p.gyroidLight*Math.PI/180,phase=(seed%997)*.013,step=Math.min(1.1,p.gyroidCell*s.scale*p.gyroidShell*.07);
    var lx=Math.cos(light)*.62,ly=Math.sin(light)*.62,lz=.78;
    function f(x,y,z){return implicit(x+p.gyroidTwist*Math.sin(y*.36+z*.21),y,z+phase,p.gyroidMode);}
    // Oblique view rays pass through an actual glyph-clipped 3D slab. Its rear
    // walls can project outside the front silhouette; this is not a texture fill.
    function volume(x,y,z){var mask=sample(s.alpha,s.w,s.h,x,y);if(mask<.15)return 2;var boundary=sample(d,s.w,s.h,x,y),top=depth*(.6+.4*Math.min(1,boundary/(s.scale*4)));return Math.max(Math.abs(f(x*k,y*k,z*k))-p.gyroidShell,(z-top)*k,-z*k);}
    for(var y=2;y<s.h-2;y++)for(var x=2;x<s.w-2;x++){
      var hit=-1,X=0,Y=0,Z=0;
      for(var travel=0;travel<=depth;travel+=step){Z=depth-travel;X=x-travel*.48;Y=y-travel*.3;if(volume(X,Y,Z)<=0){hit=travel;break;}}
      if(hit<0)continue;
      var lo=Math.max(0,hit-step),hi=hit;for(var b=0;b<4;b++){var mid=(lo+hi)/2;if(volume(x-mid*.48,y-mid*.3,depth-mid)<=0)hi=mid;else lo=mid;}hit=hi;Z=depth-hit;X=x-hit*.48;Y=y-hit*.3;
      var eps=.38,nx=volume(X+eps,Y,Z)-volume(X-eps,Y,Z),ny=volume(X,Y+eps,Z)-volume(X,Y-eps,Z),nz=volume(X,Y,Z+eps)-volume(X,Y,Z-eps),norm=Math.hypot(nx,ny,nz)||1;nx/=norm;ny/=norm;nz/=norm;
      var diffuse=Math.max(0,nx*lx+ny*ly+nz*lz),ao=1;
      for(var probe=1;probe<=4;probe++){var t=probe*s.scale*1.8;if(volume(X+lx*t,Y+ly*t,Z+lz*t)<0)ao-=.15;}
      var occlusion=(.4+.6*Math.exp(-hit/depth*1.5))*ao,shine=Math.pow(Math.max(0,nx*lx*.5+ny*ly*.5+nz*.94),22)*.7;
      var body=blend(color,accent,hit/depth*.23),lightColor=blend(body,[250,239,216],clamp(diffuse*.88+shine,0,1));
      var at=(y*s.w+x)*4;for(var c=0;c<3;c++)im.data[at+c]=lightColor[c]*(.3+.7*occlusion);im.data[at+3]=255;
    }
    // Destination shader: retain the solve and evaluate its material at output pixels.
    if(root.TypeDeformerRenderContext){var R=root.TypeDeformerRenderContext,highAlpha=R.alphaSampler(s.canvas);function highVolume(x,y,z){var mask=highAlpha(x+.5,y+.5);if(mask<.15)return 2;var boundary=sample(d,s.w,s.h,x,y),top=depth*(.6+.4*Math.min(1,boundary/(s.scale*4)));return Math.max(Math.abs(f(x*k,y*k,z*k))-p.gyroidShell,(z-top)*k,-z*k);}
      R.field(im,function(px,py,rgba,footprint){var x=px-.5,y=py-.5;
      var hit=-1,X=0,Y=0,Z=0;
      for(var travel=0;travel<=depth;travel+=step){Z=depth-travel;X=x-travel*.48;Y=y-travel*.3;if(highVolume(X,Y,Z)<=0){hit=travel;break;}}
      if(hit<0)return;
      var lo=Math.max(0,hit-step),hi=hit;for(var b=0;b<4;b++){var mid=(lo+hi)/2;if(highVolume(x-mid*.48,y-mid*.3,depth-mid)<=0)hi=mid;else lo=mid;}hit=hi;Z=depth-hit;X=x-hit*.48;Y=y-hit*.3;
      var eps=.38,nx=highVolume(X+eps,Y,Z)-highVolume(X-eps,Y,Z),ny=highVolume(X,Y+eps,Z)-highVolume(X,Y-eps,Z),nz=highVolume(X,Y,Z+eps)-highVolume(X,Y,Z-eps),norm=Math.hypot(nx,ny,nz)||1;nx/=norm;ny/=norm;nz/=norm;
      var diffuse=Math.max(0,nx*lx+ny*ly+nz*lz),ao=1;
      for(var probe=1;probe<=4;probe++){var t=probe*s.scale*1.8;if(highVolume(X+lx*t,Y+ly*t,Z+lz*t)<0)ao-=.15;}
      var occlusion=(.4+.6*Math.exp(-hit/depth*1.5))*ao,shine=Math.pow(Math.max(0,nx*lx*.5+ny*ly*.5+nz*.94),22)*.7;
      var body=blend(color,accent,hit/depth*.23),lightColor=blend(body,[250,239,216],clamp(diffuse*.88+shine,0,1));
      var at=(y*s.w+x)*4;for(var c=0;c<3;c++)rgba[c]=lightColor[c]*(.3+.7*occlusion);rgba[3]=255;
    });
    }
    ctx.putImageData(im,0,0);return out;
  }
  function smooth(field,w,h,passes){var a=field.slice(),b=new Float32Array(a.length);for(var n=0;n<passes;n++){
    for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++){var i=y*w+x;b[i]=(a[i-1]+a[i]*2+a[i+1])*.25;}
    for(var y=1;y<h-1;y++)for(var x=1;x<w-1;x++){var i=y*w+x;a[i]=(b[i-w]+b[i]*2+b[i+w])*.25;}
  }return a;}
  function refract(nx,ny,eta){var norm=Math.hypot(nx,ny,1);nx/=norm;ny/=norm;var nz=1/norm,r=1/eta,c=Math.sqrt(Math.max(0,1-r*r*(1-nz*nz))),a=r*nz-c;return [a*nx,a*ny,-r+a*nz];}
  function caustic(s,p,color,accent,seed){var out=canvas(s.w,s.h),ctx=out.getContext('2d'),d=distance(s.alpha,s.w,s.h),height=new Float32Array(d.length),flux=[new Float32Array(d.length),new Float32Array(d.length),new Float32Array(d.length)],im=ctx.createImageData(s.w,s.h),scale=s.scale;
    for(var y=1;y<s.h-1;y++)for(var x=1;x<s.w-1;x++){var i=y*s.w+x;if(s.alpha[i]<.01)continue;var distancePx=d[i]/scale,bulge=1-Math.exp(-distancePx/9),u=x/scale,v=y/scale;
      var ridge=p.causticMode==='fluted'?Math.sin(u*.21+v*.055+Math.sin(v*.05)*1.8):p.causticMode==='ripple'?Math.sin(distancePx*.65+Math.sin(u*.065+seed)*1.3):0;
      height[i]=p.causticRelief*scale*bulge*(1+ridge*p.causticRidges*.32);}
    height=smooth(height,s.w,s.h,8);
    function splat(buffer,x,y,value){var ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;if(ix<0||iy<0||ix+1>=s.w||iy+1>=s.h)return;var i=iy*s.w+ix;buffer[i]+=value*(1-fx)*(1-fy);buffer[i+1]+=value*fx*(1-fy);buffer[i+s.w]+=value*(1-fx)*fy;buffer[i+s.w+1]+=value*fx*fy;}
    for(var y=2;y<s.h-2;y++)for(var x=2;x<s.w-2;x++){var i=y*s.w+x;if(s.alpha[i]<.02)continue;var nx=-(height[i+1]-height[i-1])*.5,ny=-(height[i+s.w]-height[i-s.w])*.5;
      for(var channel=0;channel<3;channel++){var ray=refract(nx,ny,p.causticIOR+(channel-1)*p.causticDispersion*.075),travel=p.causticFocus*scale/Math.max(.2,-ray[2]);splat(flux[channel],x+ray[0]*travel,y+ray[1]*travel,s.alpha[i]);}
      var n=Math.hypot(nx,ny,1),normalX=nx/n,normalY=ny/n,reflection=Math.pow(Math.max(0,(-normalX*.35-normalY*.45+1/n)),11),fresnel=.04+.96*Math.pow(1-1/n,5);
      var band=Math.exp(-Math.pow((normalX*.7+normalY*.45-.18)*8,2)),rim=Math.exp(-Math.pow((normalX*.4-normalY*.8+.45)*15,2));
      var c=blend(color,[248,247,239],clamp(band*.86+rim*.95+reflection*.12,0,1)),at=i*4;
      im.data[at]=c[0];im.data[at+1]=c[1];im.data[at+2]=c[2];im.data[at+3]=s.alpha[i]*(.55+fresnel*.38)*255;
    }
    if(root.TypeDeformerRenderContext){var RC=root.TypeDeformerRenderContext,highAlpha=RC.alphaSampler(s.canvas);RC.field(im,function(x,y,rgba){var coverage=highAlpha(x,y);if(coverage<=0)return;x-=.5;y-=.5;var nx=-(RC.sample(height,s.w,s.h,x+1,y)-RC.sample(height,s.w,s.h,x-1,y))*.5,ny=-(RC.sample(height,s.w,s.h,x,y+1)-RC.sample(height,s.w,s.h,x,y-1))*.5,n=Math.hypot(nx,ny,1),normalX=nx/n,normalY=ny/n,reflection=Math.pow(Math.max(0,(-normalX*.35-normalY*.45+1/n)),11),fresnel=.04+.96*Math.pow(1-1/n,5),band=Math.exp(-Math.pow((normalX*.7+normalY*.45-.18)*8,2)),rim=Math.exp(-Math.pow((normalX*.4-normalY*.8+.45)*15,2)),c=blend(color,[248,247,239],clamp(band*.86+rim*.95+reflection*.12,0,1));rgba[0]=c[0];rgba[1]=c[1];rgba[2]=c[2];rgba[3]=coverage*(.55+fresnel*.38)*255;});}
    ctx.putImageData(im,0,0);var light=canvas(s.w,s.h),lc=light.getContext('2d'),li=lc.createImageData(s.w,s.h);
    flux=flux.map(function(channel){return smooth(channel,s.w,s.h,2);});
    for(var i=0;i<d.length;i++){var energy=[flux[0][i],flux[1][i],flux[2][i]],peak=Math.max.apply(Math,energy);if(peak<.18)continue;var at=i*4,focus=1-Math.exp(-Math.max(0,peak-.55)*.7),split=(Math.max.apply(Math,energy)-Math.min.apply(Math,energy))/Math.max(1,peak),c=blend(color,accent,split*.85);
      // Pigmented projection on arbitrary paper: accumulated energy controls
      // optical density. RGB flux differences control chromatic separation.
      li.data[at]=clamp(c[0]+(energy[0]-energy[2])*18,0,255);li.data[at+1]=clamp(c[1]+(energy[1]-energy[0])*15,0,255);li.data[at+2]=clamp(c[2]+(energy[2]-energy[1])*18,0,255);li.data[at+3]=focus*235;
    }if(root.TypeDeformerRenderContext)root.TypeDeformerRenderContext.field(li,function(x,y,rgba){var energy=[root.TypeDeformerRenderContext.sample(flux[0],s.w,s.h,x-.5,y-.5),root.TypeDeformerRenderContext.sample(flux[1],s.w,s.h,x-.5,y-.5),root.TypeDeformerRenderContext.sample(flux[2],s.w,s.h,x-.5,y-.5)],peak=Math.max.apply(Math,energy);if(peak<.18)return;var focus=1-Math.exp(-Math.max(0,peak-.55)*.7),split=(Math.max.apply(Math,energy)-Math.min.apply(Math,energy))/Math.max(1,peak),c=blend(color,accent,split*.85);
      // Pigmented projection on arbitrary paper: accumulated energy controls
      // optical density. RGB flux differences control chromatic separation.
      rgba[0]=clamp(c[0]+(energy[0]-energy[2])*18,0,255);rgba[1]=clamp(c[1]+(energy[1]-energy[0])*15,0,255);rgba[2]=clamp(c[2]+(energy[2]-energy[1])*18,0,255);rgba[3]=focus*235;
    });lc.putImageData(li,0,0);ctx.drawImage(light,0,0);return out;}
  var renderers={tensorFiligree:tensor,chromaticSwarm:swarm,gyroidSculpture:gyroid,causticGlass:caustic};
  if(patternTension)Object.assign(renderers,patternTension.renderers);
  if(waveGrowth)Object.assign(renderers,waveGrowth.renderers);
  if(orderMatter)Object.assign(renderers,orderMatter.renderers);
  if(hyperbolicAtlas)Object.assign(renderers,hyperbolicAtlas.renderers);
  if(loadpathFoundry)Object.assign(renderers,loadpathFoundry.renderers);
  if(stressGlass)Object.assign(renderers,stressGlass.renderers);
  if(vortexBath)Object.assign(renderers,vortexBath.renderers);
  if(miuraVault)Object.assign(renderers,miuraVault.renderers);
  if(hopfLoom)Object.assign(renderers,hopfLoom.renderers);
  if(densityRecast)Object.assign(renderers,densityRecast.renderers);
  if(spinodalAlloy)Object.assign(renderers,spinodalAlloy.renderers);
  if(nodalGlaze)Object.assign(renderers,nodalGlaze.renderers);
  if(excessBody)Object.assign(renderers,excessBody.renderers);
  if(ramifiedBody)Object.assign(renderers,ramifiedBody.renderers);
  if(foldedBody)Object.assign(renderers,foldedBody.renderers);
  if(letterformBody)Object.assign(renderers,letterformBody.renderers);
  if(metamorphicBody)Object.assign(renderers,metamorphicBody.renderers);
  if(gravityLens)Object.assign(renderers,gravityLens.renderers);
  if(liquidRope)Object.assign(renderers,liquidRope.renderers);
  if(wulffBody)Object.assign(renderers,wulffBody.renderers);
  if(repulsiveCurves)Object.assign(renderers,repulsiveCurves.renderers);
  if(wassersteinLetters)Object.assign(renderers,wassersteinLetters.renderers);
  function touchesRasterEdge(c,gutter){var w=c.width,h=c.height;if(!w||!h)return false;var data=c.getContext('2d').getImageData(0,0,w,h).data,g=Math.max(1,Math.min(gutter||3,Math.floor(Math.min(w,h)/2)));for(var y=0;y<h;y++)for(var x=0;x<w;x++)if((x<g||y<g||x>=w-g||y>=h-g)&&data[(y*w+x)*4+3]>1)return true;return false;}
  function nextPad(s,result){var diagnostics=result&&result._lensDiagnostics,viewScale=diagnostics&&Number(diagnostics.viewScale);if(Number.isFinite(viewScale)&&viewScale>0&&viewScale<.997)return Math.ceil(s.pad/viewScale*1.06+8);if(touchesRasterEdge(result,3))return Math.ceil(s.pad*1.7+16);return 0;}
  function entryFor(id,g,L,fm,env){
    var p=settings(id,g,env),color=env.color(id),accent=env.params.accent||'#b52254',seed=(env.params.seed||17),pad=null,s,entry,key;
    // Some bounded-body solvers can expand far beyond their nominal source.
    // Grow their local world envelope before caching instead of shrinking or
    // clipping the effect into a small, invisible per-glyph rectangle.
    for(var attempt=0;attempt<4;attempt++){
      s=source(g,L,fm,env,id,p,pad);key=[id,s.w,s.h,s.x,s.y,s.key,JSON.stringify(p),color,accent,seed,root.TypeDeformerRenderContext&&root.TypeDeformerRenderContext.current()?root.TypeDeformerRenderContext.current().factor:1,root.TypeDeformerRenderContext&&root.TypeDeformerRenderContext.current()?root.TypeDeformerRenderContext.current().purpose:'analysis'].join('|');entry=cache.get(key);
      if(entry){cache.delete(key);cache.set(key,entry);break;}
      var result=renderers[id](s,p,rgb(color),rgb(accent),seed),expanded=boundedBodyIds.indexOf(id)>=0&&attempt<3?nextPad(s,result):0;
      if(expanded>s.pad){if(root.TypeDeformerRenderContext&&result!==s.canvas)root.TypeDeformerRenderContext.release(result);pad=Math.min(16384,expanded);continue;}
      var bytes=root.TypeDeformerRenderContext?root.TypeDeformerRenderContext.byteSize(result):result.width*result.height*4;while(cacheBytes+bytes>MAX_BYTES&&cache.size){var first=cache.keys().next().value;cacheBytes-=cache.get(first).bytes;cache.delete(first);}entry={canvas:result,bytes:bytes};if(bytes<=MAX_BYTES){cache.set(key,entry);cacheBytes+=bytes;}break;
    }
    if(root.TypeDeformerRenderContext&&root.TypeDeformerRenderContext.current()&&entry.canvas!==s.canvas)root.TypeDeformerRenderContext.release(s.canvas);
    return {source:s,entry:entry};
  }
  function wassersteinGroup(glyphs,fm,env){
    if(!wassersteinLetters||env.params.wassersteinScope!=='text')return null;
    var selected=glyphs.filter(function(g){return env.strength(g,'wassersteinLetters')>.002&&(g.opacity==null||g.opacity>.002);});if(!selected.length)return null;
    var box=env.bounds(selected,0),pad=Math.ceil(Math.max(box.w,box.h)*.55+16),x=box.x-pad,y=box.y-pad,W=box.w+2*pad,H=box.h+2*pad,scale=Math.min(2,Math.sqrt(2300000/(W*H))),w=Math.max(4,Math.ceil(W*scale)),h=Math.max(4,Math.ceil(H*scale));
    var c=canvas(w,h),ctx=c.getContext('2d',{willReadFrequently:true}),opacity=Math.max.apply(null,selected.map(function(g){return env.strength(g,'wassersteinLetters')*(g.opacity==null?1:g.opacity);}));
    selected.forEach(function(g){env.drawGlyph(ctx,g,scale,{dx:-x,dy:-y,s:1},fm,env.strength(g,'wassersteinLetters')/opacity,'#ffffff');});
    var data=ctx.getImageData(0,0,w,h).data,alpha=Float32Array.from({length:w*h},function(_,i){return data[i*4+3]/255;}),first=selected[0],partner=env.params.wassersteinPartner||'X',font=env.font(first,320).font;
    var s={canvas:c,data:data,alpha:alpha,w:w,h:h,scale:scale,pad:pad,partner:partner,targetFont:font,multiple:selected.length>1,key:'text/'+fingerprint(data)};
    if(env.params.vertical){var chars=wassersteinLetters.characters(partner),angles=chars.map(function(ch){return env.charInfo&&!env.charInfo(ch,ch.codePointAt(0)).upright?Math.PI/2:0;});if(chars.length>1)s.targetAngles=angles;else s.targetAngle=angles[0];}
    s.key+='/'+partner+'/'+font+'/'+s.targetAngle+'/'+s.targetAngles+'/'+wassersteinLetters.fontRevision();
    var p=settings('wassersteinLetters',first,env),color=env.color('wassersteinLetters'),key=['wasserstein-text',s.w,s.h,s.key,JSON.stringify(p),color,root.TypeDeformerRenderContext&&root.TypeDeformerRenderContext.current()?root.TypeDeformerRenderContext.current().factor:1,root.TypeDeformerRenderContext&&root.TypeDeformerRenderContext.current()?root.TypeDeformerRenderContext.current().purpose:'analysis'].join('|'),entry=cache.get(key);
    if(!entry){var result=renderers.wassersteinLetters(s,p,rgb(color),rgb(color)),bytes=root.TypeDeformerRenderContext?root.TypeDeformerRenderContext.byteSize(result):result.width*result.height*4;while(cacheBytes+bytes>MAX_BYTES&&cache.size){var old=cache.keys().next().value;cacheBytes-=cache.get(old).bytes;cache.delete(old);}entry={canvas:result,bytes:bytes};if(bytes<=MAX_BYTES){cache.set(key,entry);cacheBytes+=bytes;}}
    else{cache.delete(key);cache.set(key,entry);}
    return {source:s,entry:entry,x:x,y:y,opacity:opacity};
  }
  function rasterBounds(entry){if(!entry.bodyBounds){var c=entry.canvas,w=c.width,h=c.height,data=c.getContext('2d').getImageData(0,0,w,h).data,x0=w,y0=h,x1=-1,y1=-1;for(var y=0;y<h;y++)for(var x=0;x<w;x++)if(data[(y*w+x)*4+3]>1){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}entry.bodyBounds=[x0-2,y0-2,x1+2,y1+2];}return entry.bodyBounds;}
  function bodyBounds(glyphs,bounds,fm,env){
    if(!boundedBodyIds.length)return bounds;var minX=bounds.x,minY=bounds.y,maxX=bounds.x+bounds.w,maxY=bounds.y+bounds.h;
    var group=wassersteinGroup(glyphs,fm,env);if(group){var gb=rasterBounds(group.entry),sc=group.source.scale;if(gb[2]>=gb[0]){minX=Math.min(minX,group.x+gb[0]/sc);minY=Math.min(minY,group.y+gb[1]/sc);maxX=Math.max(maxX,group.x+gb[2]/sc);maxY=Math.max(maxY,group.y+gb[3]/sc);}}
    glyphs.forEach(function(g){boundedBodyIds.forEach(function(id){if(env.strength(g,id)<=.002||(g.opacity!=null&&g.opacity<=.002))return;
      if(id==='wassersteinLetters'&&env.params.wassersteinScope==='text')return;
      var pair=entryFor(id,g,{dx:0,dy:0,s:1},fm,env),s=pair.source,e=pair.entry;
      if(!e.bodyBounds){var data=e.canvas.getContext('2d').getImageData(0,0,s.w,s.h).data,x0=s.w,y0=s.h,x1=-1,y1=-1;for(var y=0;y<s.h;y++)for(var x=0;x<s.w;x++)if(data[(y*s.w+x)*4+3]>1){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}e.bodyBounds=[x0-2,y0-2,x1+2,y1+2];}
      var b=e.bodyBounds;if(b[2]<b[0])return;
      [[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]].forEach(function(q){var x=(s.x+q[0]/s.scale-g.ox)*g.scaleX,y=(s.y+q[1]/s.scale-g.oy)*g.scaleY,u=x+Math.tan((g.skewX||0)*Math.PI/180)*y,v=y+Math.tan((g.skewY||0)*Math.PI/180)*x,a=(g.rot||0)*Math.PI/180,X=g.ox+g.tx+u*Math.cos(a)-v*Math.sin(a),Y=g.oy+g.ty+u*Math.sin(a)+v*Math.cos(a);minX=Math.min(minX,X);maxX=Math.max(maxX,X);minY=Math.min(minY,Y);maxY=Math.max(maxY,Y);});
    });});return {x:minX,y:minY,w:maxX-minX,h:maxY-minY};
  }
  function render(id,ctx,glyphs,width,height,pixelScale,L,fm,env){if(!renderers[id])return false;
    if(id==='wassersteinLetters'&&env.params.wassersteinScope==='text'){
      var group=wassersteinGroup(glyphs,fm,env);if(group){ctx.save();ctx.setTransform(pixelScale,0,0,pixelScale,0,0);ctx.translate(L.dx,L.dy);ctx.scale(L.s,L.s);ctx.globalAlpha=group.opacity;ctx.drawImage(group.entry.canvas,group.x,group.y,group.source.w/group.source.scale,group.source.h/group.source.scale);ctx.restore();}return true;
    }
    var finalTarget=ctx;
    if(id==='ornamentReserve')ctx=env.scratch('ornament-reserve-composite',width,height,true).ctx;
    glyphs.forEach(function(g){var strength=env.strength(g,id);if(strength<.002||(g.opacity!=null&&g.opacity<.002))return;
      var pair=entryFor(id,g,L,fm,env),s=pair.source,entry=pair.entry;
      ctx.save();ctx.setTransform(pixelScale,0,0,pixelScale,0,0);ctx.translate(L.dx,L.dy);ctx.scale(L.s,L.s);ctx.translate(g.ox+g.tx,g.oy+g.ty);ctx.rotate((g.rot||0)*Math.PI/180);ctx.transform(1,Math.tan((g.skewY||0)*Math.PI/180),Math.tan((g.skewX||0)*Math.PI/180),1,0,0);ctx.scale(g.scaleX,g.scaleY);ctx.translate(-g.ox,-g.oy);ctx.globalAlpha=strength*(g.opacity==null?1:g.opacity);ctx.drawImage(entry.canvas,s.x,s.y,s.w/s.scale,s.h/s.scale);ctx.restore();
    });
    if(id==='ornamentReserve'){
      // Clear all active letter silhouettes from this effect alone: a neighboring
      // halo must not paint into the reserved word or erase another operator.
      ctx.save();ctx.globalCompositeOperation='destination-out';
      glyphs.forEach(function(g){if(env.strength(g,id)>.002)env.drawGlyph(ctx,Object.assign({},g,{opacity:1}),pixelScale,L,fm,1,'#ffffff');});
      ctx.restore();finalTarget.save();finalTarget.setTransform(1,0,0,1,0,0);finalTarget.drawImage(ctx.canvas,0,0);finalTarget.restore();
    }return true;}
  root.TypeDeformerFieldMaterials={ids:ids,schemas:schemas,needsBodyBounds:function(glyphs,strength){return glyphs.some(function(g){return boundedBodyIds.some(function(id){return strength(g,id)>.002;});});},render:render,bodyBounds:bodyBounds,effectPad:function(id){return wassersteinLetters&&wassersteinLetters.ids.indexOf(id)>=0?wassersteinLetters.effectPad(id):repulsiveCurves&&repulsiveCurves.ids.indexOf(id)>=0?repulsiveCurves.effectPad(id):wulffBody&&wulffBody.ids.indexOf(id)>=0?wulffBody.effectPad(id):liquidRope&&liquidRope.ids.indexOf(id)>=0?liquidRope.effectPad(id):gravityLens&&gravityLens.ids.indexOf(id)>=0?gravityLens.effectPad(id):metamorphicBody&&metamorphicBody.ids.indexOf(id)>=0?metamorphicBody.effectPad(id):letterformBody&&letterformBody.ids.indexOf(id)>=0?letterformBody.effectPad(id):foldedBody&&foldedBody.ids.indexOf(id)>=0?foldedBody.effectPad(id):ramifiedBody&&ramifiedBody.ids.indexOf(id)>=0?ramifiedBody.effectPad(id):excessBody&&excessBody.ids.indexOf(id)>=0?excessBody.effectPad(id):nodalGlaze&&nodalGlaze.ids.indexOf(id)>=0?nodalGlaze.effectPad(id):spinodalAlloy&&spinodalAlloy.ids.indexOf(id)>=0?spinodalAlloy.effectPad(id):densityRecast&&densityRecast.ids.indexOf(id)>=0?densityRecast.effectPad(id):hopfLoom&&hopfLoom.ids.indexOf(id)>=0?hopfLoom.effectPad(id):miuraVault&&miuraVault.ids.indexOf(id)>=0?miuraVault.effectPad(id):vortexBath&&vortexBath.ids.indexOf(id)>=0?vortexBath.effectPad(id):stressGlass&&stressGlass.ids.indexOf(id)>=0?stressGlass.effectPad(id):loadpathFoundry&&loadpathFoundry.ids.indexOf(id)>=0?loadpathFoundry.effectPad(id):hyperbolicAtlas&&hyperbolicAtlas.ids.indexOf(id)>=0?hyperbolicAtlas.effectPad(id):orderMatter&&orderMatter.ids.indexOf(id)>=0?orderMatter.effectPad(id):waveGrowth&&waveGrowth.ids.indexOf(id)>=0?waveGrowth.effectPad(id):patternTension&&patternTension.ids.indexOf(id)>=0?patternTension.effectPad(id):id==='causticGlass'?90:id==='gyroidSculpture'?40:16;},clearCache:function(){cache.clear();cacheBytes=0;},cacheStats:function(){return {entries:cache.size,bytes:cacheBytes,maxBytes:MAX_BYTES};},internals:{distance:distance,lloyd:lloyd,implicit:implicit,refract:refract,settings:settings,source:source,touchesRasterEdge:touchesRasterEdge,nextPad:nextPad}};
})(typeof globalThis!=='undefined'?globalThis:this);
