import fs from 'node:fs';import {createRequire} from 'node:module';
import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(repo+'/package.json'),{chromium}=require('@playwright/test');
const args={};for(let i=2;i<process.argv.length;i++){const key=process.argv[i];if(['--sweep','--dense','--software-canvas','--profile'].includes(key))args[key.slice(2)]=true;else if(key.startsWith('--')&&process.argv[i+1]&&!process.argv[i+1].startsWith('--'))args[key.slice(2)]=process.argv[++i];else throw Error('Unknown or incomplete argument '+key);}
const url=(args.url||'http://127.0.0.1:4188').replace(/\/$/,'')+'/',baseline=args.baseline?pathToFileURL(path.resolve(args.baseline)+path.sep):null;
const output=args.output?path.resolve(args.output):null,results=[],repeats=Math.max(1,Math.min(10,Number(args.repeats)||1));
const parameters=args.params?JSON.parse(fs.existsSync(args.params)?fs.readFileSync(args.params,'utf8'):args.params):{};
const versions=Array.from({length:repeats},(_,i)=>baseline?(i%2?['after','before']:['before','after']):['after']).flat();
// The baseline directory may contain only the changed runtime files; unchanged
// files are served from this checkout. Pin the browser, fonts and text to compare.
const hook=`window.__bench={ids:SURFACE_WORKER_IDS,
 setup(text,size,dense,options={}){surfaceFxPhase=0;dataMoshFrame=0;compositionState.phase=0;if(dense){params.swarmCell=5;params.swarmRelax=8;}params.fontFamily='Arial, sans-serif';params.fontSize=size;params.randomness=0;params.seed=41;params.textMeasure=0;Object.assign(params,options);textInput.value=text;createSpans(text);applyStyle();measureLayout();},
 frame(id,changes={},envelope=1){if(changes.ink)changes[SURFACE_COLOR_KEYS[id]]=changes.ink;Object.assign(params,changes);surfaceEnvelopeScale=envelope;for(var m of metrics){m.operatorStates=createOperatorStates();var s=operatorState(m,id);s.current=1;s.toggled=true;}
 invalidateCompositionSource();applyAllOperatorVisuals(true);var glyphs=snapshotGlyphs(true),plan=surfaceCanonicalRasterPlan(glyphs),frame=surfaceWorkerSnapshot(glyphs,fontMetrics());var sc=Math.min(1,640/plan.bounds.w,480/plan.bounds.h);
 var outputScale=window.__bench.scale||1;Object.assign(frame,{kind:'frame',purpose:window.__bench.purpose||'edit',mobile:false,presentation:'standard',scale:outputScale,layout:{s:sc,dx:-plan.bounds.x*sc,dy:-plan.bounds.y*sc},width:Math.ceil(plan.bounds.w*sc*outputScale),height:Math.ceil(plan.bounds.h*sc*outputScale),plan,operators:[id],fonts:[]});pausePreviewRendering();return frame;}
};`;
const browser=await chromium.launch({channel:'chrome',args:args['software-canvas']?['--disable-accelerated-2d-canvas']:[]});
try{for(const version of versions){
 const context=await browser.newContext({viewport:{width:1440,height:900}}),errors=[];
 await context.route(/fonts\.googleapis\.com/,r=>r.fulfill({status:200,contentType:'text/css',body:''}));
 await context.route(url+'**',async r=>{const url=new URL(r.request().url()),name=url.pathname.slice(1)||'index.html',old=baseline?new URL(name,baseline):null;let filename=repo+'/'+name;if(version==='before'&&fs.existsSync(old))filename=old;
 if(name==='index.html'){await r.fulfill({contentType:'text/html',body:fs.readFileSync(filename,'utf8').replace('      setTimeout(scheduleMeasure, 400);',hook+'\n      setTimeout(scheduleMeasure, 400);')});return;}
 if(args.profile&&name==='wasserstein-letters.js'){let source=fs.readFileSync(filename,'utf8');const names=['bounds','distribution','sinkhorn','interpolate','smooth','contours','loops','makeTarget','prepare'];const instrumentation=`root.__wassersteinProfile={};`+names.map(name=>`var original_${name}=${name};${name}=function(){var start=performance.now(),v=original_${name}.apply(this,arguments),s=root.__wassersteinProfile.${name}||(root.__wassersteinProfile.${name}={calls:0,ms:0});s.calls++;s.ms+=performance.now()-start;if('${name}'==='sinkhorn')s.last={iterations:v.iterations,rowError:v.rowError,columnError:v.columnError,source:v.a.length,target:v.b.length};return v;};`).join('');source=source.replace(' root.TypeDeformerWassersteinLetters=',instrumentation+'\n root.TypeDeformerWassersteinLetters=');await r.fulfill({contentType:'text/javascript',body:source});return;}
 if(args.profile&&name==='surface-worker.js'){await r.fulfill({contentType:'text/javascript',body:fs.readFileSync(filename,'utf8').replace('numericalCache:TypeDeformerNumerics.cacheStats(),','numericalCache:TypeDeformerNumerics.cacheStats(),wassersteinProfile:self.__wassersteinProfile,')});return;}
 if(version==='before'&&fs.existsSync(old)&&/\.(js|json)$/.test(name)){await r.fulfill({contentType:name.endsWith('.js')?'text/javascript':'application/json',body:fs.readFileSync(old)});return;}await r.continue();});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await page.waitForFunction(()=>window.__bench);await page.evaluate(()=>document.fonts.ready);await page.evaluate(({scale,purpose})=>{__bench.scale=scale;__bench.purpose=purpose;},{scale:Math.max(1,Math.min(4,Number(args.scale)||1)),purpose:['edit','proof','export'].includes(args.purpose)?args.purpose:'edit'});
 const ids=args.operators?args.operators.split(','):args.sweep?await page.evaluate(()=>__bench.ids):['repulsiveCurves','vortexBath','chromaticSwarm','diffractiveGlyph','screwExtrusion','growthBuckle','wassersteinLetters','gyroidSculpture','tensorFiligree'];
 for(const id of ids){await page.evaluate(({text,size,dense,options})=>__bench.setup(text,size,dense,options),{text:args.text||'AB字形',size:Number(args['font-size'])||72,dense:!!args.dense,options:parameters});const values=await page.evaluate(async ({id,sweep,images,sequence})=>{
  const w=new Worker('surface-worker.js'),records=[];let job=0,envelope=1;
  async function request(frame){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('operator timeout: '+id)),90000);w.onmessage=e=>{clearTimeout(timer);e.data.type==='error'?reject(Error(e.data.message)):resolve(e.data.result);};w.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};w.postMessage({id:++job,payload:frame});});}
  try{for(const step of (sequence||(sweep?['cold']:['cold','warm1','warm2','warm3','ink','material']))){
   const mode=typeof step==='string'?step:step.mode;
   const changes=typeof step==='object'?step.changes:mode==='ink'?{ink:'#743b51',accent:'#397d80'}:mode==='material'?(id==='vortexBath'?{vortexRelief:8}:id==='diffractiveGlyph'?{diffractionExposure:2}:id==='repulsiveCurves'?{repulsiveYaw:55}:id==='wassersteinLetters'?{wassersteinSharpness:.95}:{}):{};
   let r,frame,total=0;for(let retry=0;retry<5;retry++){frame=__bench.frame(id,changes,envelope);r=await request(frame);total+=r.duration;if(r.kind!=='envelope')break;envelope=r.requiredScale;}
   if(r.kind==='envelope')throw Error('unresolved envelope '+id);
   const c=new OffscreenCanvas(frame.width,frame.height),cx=c.getContext('2d');for(const b of Object.values(r.layers)){cx.drawImage(b,0,0);b.close();}const rgba=cx.getImageData(0,0,c.width,c.height).data;
   const digest=await crypto.subtle.digest('SHA-256',rgba),hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
   records.push({png:images?Array.from(new Uint8Array(await (await c.convertToBlob()).arrayBuffer())):undefined,mode,ms:total,hash,width:c.width,height:c.height,peakBytes:r.peakBytes,cacheBytes:r.cacheBytes,alphaPixels:rgba.filter((v,i)=>i%4===3&&v>0).length,numericalCache:r.numericalCache,wassersteinProfile:r.wassersteinProfile,envelope});
  }return records;}finally{w.terminate();}
 },{id,sweep:!!args.sweep,images:!!args.images,sequence:args.sequence?JSON.parse(fs.readFileSync(args.sequence,'utf8')):null});
 if(args.images){fs.mkdirSync(args.images,{recursive:true});for(const v of values)if(v.png){fs.writeFileSync(path.join(args.images,version+'-'+id+(v.mode==='cold'?'':'-'+v.mode)+'.png'),Buffer.from(v.png));delete v.png;}}
 results.push({version,id,browser:browser.version(),fixture:{text:args.text||'AB字形',fontSize:Number(args['font-size'])||72,dense:!!args.dense,softwareCanvas:!!args['software-canvas'],scale:Number(args.scale)||1,purpose:args.purpose||'edit',parameters,sequence:args.sequence?JSON.parse(fs.readFileSync(args.sequence,'utf8')):null,profile:!!args.profile},values,errors:[...errors]});if(output)fs.writeFileSync(output,JSON.stringify(results,null,2));console.error(JSON.stringify({version,id,times:values.map(v=>[v.mode,Math.round(v.ms)]),errors}));
 }
 await context.close();
}if(!output)console.log(JSON.stringify(results,null,2));}finally{await browser.close();}
