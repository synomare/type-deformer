import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadImage,createCanvas} from '@napi-rs/canvas';

function pixels(bytes) {
 return loadImage(bytes).then(img=>{const c=createCanvas(img.width,img.height),ctx=c.getContext('2d');ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;
  let changed=0;for(let i=4;i<data.length;i+=4)if(data[i]!==data[0]||data[i+1]!==data[1]||data[i+2]!==data[2]||data[i+3]!==data[3])changed++;
  return {hash:createHash('sha256').update(data).digest('hex'),changed,width:c.width,height:c.height};});
}
async function difference(a,b){
 const data=async bytes=>{const img=await loadImage(bytes),c=createCanvas(img.width,img.height);c.getContext('2d').drawImage(img,0,0);return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
 const x=await data(a),y=await data(b);expect(y.length).toBe(x.length);let total=0,large=0;
 for(let i=0;i<x.length;i+=4){let max=0;for(let j=0;j<4;j++){const d=Math.abs(x[i+j]-y[i+j]);total+=d;max=Math.max(max,d);}if(max>8)large++;}
 return {mean:total/x.length,large:large/(x.length/4)};
}
async function setup(page,context,options={}) {
 await context.addInitScript(()=>{
  const lost=CanvasRenderingContext2D.prototype.isContextLost;
  const toBlob=HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob=function(...args){
   const fault=sessionStorage.getItem('outputFault');
   if(this.tdRenderPurpose&&['empty-once','empty-always'].includes(fault)){
    if(fault==='empty-once')sessionStorage.removeItem('outputFault');
    this.width=this.width;
   }
   if(this.tdRenderPurpose&&sessionStorage.getItem('outputFault')==='encoding-loss-once'){
    sessionStorage.removeItem('outputFault');this.width=this.width;this.__testLost=true;
   }return toBlob.apply(this,args);
  };
  CanvasRenderingContext2D.prototype.isContextLost=function(){
   if(this.canvas.tdRenderPurpose&&sessionStorage.getItem('outputFault')==='lost-once'){
    sessionStorage.removeItem('outputFault');this.canvas.width=this.canvas.width;return true;
   }return this.canvas.__testLost||lost?.call(this)||false;
  };
  const Native=Worker;
  window.Worker=class extends Native {postMessage(message,...rest){
   if(message.payload?.kind==='frame'&&['export','proof'].includes(message.payload.purpose)){
    const entries=JSON.parse(sessionStorage.getItem('outputAttempts')||'[]');entries.push({software:!!message.payload.software,purpose:message.payload.purpose});sessionStorage.setItem('outputAttempts',JSON.stringify(entries));
    const fault=sessionStorage.getItem('outputFault');
    if(fault==='once'||fault==='always'){if(fault==='once')sessionStorage.removeItem('outputFault');setTimeout(()=>this.dispatchEvent(new ErrorEvent('error',{message:'Injected temporary render failure'})),0);return;}
   }return super.postMessage(message,...rest);
  }};
 });
 await page.route('**/*',async route=>{
  if(route.request().resourceType()!=='document')return route.continue();
  const response=await route.fetch();let html=await response.text();
  html=html.replace('var studioOutputOptions','window.__outputReference=snapshotOutputReference;var studioOutputOptions');
  if(options.updateFrame)html=html.replace('var frame=surfaceWorkerSnapshot(glyphs,fm);',
   'var frame=surfaceWorkerSnapshot(glyphs,fm);if(studioRendererMode){if(surfaceWorkerOutput&&surfaceWorkerOutput.completed>0)window.__frameUpdated=true;if(window.__frameUpdated&&frame.glyphs[0])frame.glyphs[0].tx+=0.00001;}');
  return route.fulfill({response,body:html});
 });
 await page.route(/fonts\.googleapis\.com/,r=>r.fulfill({status:200,contentType:'text/css',body:''}));
 await page.goto('/');await page.waitForFunction(()=>document.querySelector('#stageWorld')?.children.length>0);
 const saved=page.waitForEvent('download');await page.locator('#btnSaveProj').evaluate(e=>e.click());
 const project=JSON.parse(fs.readFileSync(await (await saved).path(),'utf8'));
 const ids=['tensorFiligree','contextualFit','copyDecay','risoSeparation','slitSweep'];
 project.text='AB';project.composition.enabled=false;
 Object.assign(project.params,{fontFamily:'Arial',fontSize:240,seed:41,artboard:'custom',abW:1536,abH:1536,exportScale:1,transparentBg:false,paper:'#e2d9c9',ink:'#304f67',surfaceOrder:ids.join(','),tensorFiligreeOpacity:.63,tensorFiligreeBlend:'multiply',copyOpacity:.72,copyBlend:'screen',risoOpacity:.48,risoBlend:'multiply',frozenMoment:JSON.stringify({schema:1,phase:0,surfacePhase:0,dataMoshFrame:0,quality:'high',logicalWidth:960,logicalHeight:680})});
 project.letters=Array.from(project.text,()=>({t:0,l:0,i:0,o:Object.fromEntries(ids.map(id=>[id,{t:1,i:1}]))}));
  if(options.auto)Object.assign(project.params,{artboard:'auto',exportRegion:'work',deformedOnly:false,transparentBg:true,fontSize:100,exportTight:true,exportLongEdge:1024});
 await page.locator('#projFile').setInputFiles({name:'five-effects.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 return project;
}
async function png(page) {
 const event=page.waitForEvent('download',{timeout:180000});await page.locator('#btnPng').evaluate(e=>e.click());
 return fs.readFileSync(await (await event).path());
}

test('five effects retain their pixels in proof, PNG, and a fresh software retry',async({page,context})=>{
 test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page,context);
 const originalBytes=await png(page),original=await pixels(originalBytes);expect(original.changed).toBeGreaterThan(5000);
 fs.writeFileSync(test.info().outputPath('original.png'),originalBytes);
 await page.locator('#btnPreview').evaluate(e=>e.click());await expect(page.locator('#previewOverlay')).toBeVisible();
 const proof=await page.locator('#previewImg').evaluate(async img=>Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())));
 expect(await pixels(Buffer.from(proof))).toEqual(original);await page.locator('#btnPreviewClose').click();
 for(const fault of ['once','lost-once','encoding-loss-once']){
 await page.evaluate(fault=>{sessionStorage.setItem('outputFault',fault);sessionStorage.setItem('outputAttempts','[]');},fault);
 const event=page.waitForEvent('download');await page.locator('#btnPng').evaluate(e=>e.click());
 await expect(page.locator('#btnPng')).toBeDisabled();await page.locator('#btnPng').evaluate(e=>{e.click();e.click();});
 const recoveredBytes=fs.readFileSync(await (await event).path());fs.writeFileSync(test.info().outputPath('recovered.png'),recoveredBytes);
 const recovered=await pixels(recoveredBytes);expect(recovered.changed).toBeGreaterThan(original.changed*.99);
 // CPU and GPU antialiasing differ at edges; missing layers/blank output must fail.
 const delta=await difference(originalBytes,recoveredBytes);expect(delta.mean).toBeLessThan(.1);expect(delta.large).toBeLessThan(.001);
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('outputAttempts')).map(a=>a.software))).toEqual([false,true]);
 await expect(page.locator('#snapshotOutputStatus')).toBeHidden();expect(page.frames()).toHaveLength(1);expect(errors).toEqual([]);
 }
});

test('a same-size scene update keeps the streamed output destination intact',async({page,context})=>{
 test.setTimeout(180000);await setup(page,context,{updateFrame:true});
 const bytes=await png(page);expect((await pixels(bytes)).changed).toBeGreaterThan(5000);
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('outputAttempts')).map(a=>a.software))).toEqual([false,false]);
 await page.locator('#btnPreview').evaluate(e=>e.click());await expect(page.locator('#previewOverlay')).toBeVisible();
 const proof=await page.locator('#previewImg').evaluate(async img=>Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())));
 expect(await pixels(Buffer.from(proof))).toEqual(await pixels(bytes));
});

test('healthy but empty encoded output is retried, and repeated emptiness is not downloaded',async({page,context})=>{
 test.setTimeout(180000);await setup(page,context,{auto:true});
 await page.waitForFunction(()=>window.__outputReference?.());
 await page.evaluate(()=>{sessionStorage.setItem('outputFault','empty-once');sessionStorage.setItem('outputAttempts','[]');});
 const recovered=await png(page);expect((await pixels(recovered)).changed).toBeGreaterThan(1000);
 // Tight framing adds a measurement render inside each backend attempt.
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('outputAttempts')).map(a=>a.software).filter((value,index,list)=>!index||value!==list[index-1]))).toEqual([false,true]);
 await page.waitForFunction(()=>window.__outputReference?.());
 let downloads=0;page.on('download',()=>downloads++);
 await page.evaluate(()=>sessionStorage.setItem('outputFault','empty-always'));
 await page.locator('#btnPng').evaluate(e=>e.click());
 await expect(page.locator('#snapshotOutputStatus')).toHaveAttribute('data-state','error');
 await expect(page.locator('#snapshotOutputText')).toContainText('空の画像は保存していません');
 expect(downloads).toBe(0);expect(page.frames()).toHaveLength(1);
});

test('persistent failures stay visible and a manual retry succeeds without changing the artwork',async({page,context})=>{
 test.setTimeout(120000);await setup(page,context);let downloads=0;page.on('download',()=>downloads++);
 await page.evaluate(()=>sessionStorage.setItem('outputFault','always'));await page.locator('#btnPng').evaluate(e=>e.click());
 await expect(page.locator('#snapshotOutputStatus')).toHaveAttribute('data-state','error');
 await expect(page.locator('#snapshotOutputText')).toContainText('Injected temporary render failure');
 await expect(page.locator('#btnRetrySnapshotOutput')).toBeVisible();expect(page.frames()).toHaveLength(1);expect(downloads).toBe(0);
 await page.evaluate(()=>sessionStorage.removeItem('outputFault'));const event=page.waitForEvent('download');await page.locator('#btnRetrySnapshotOutput').click();
 expect((await pixels(fs.readFileSync(await (await event).path()))).changed).toBeGreaterThan(5000);
 await expect(page.locator('#snapshotOutputStatus')).toBeHidden();expect(downloads).toBe(1);
});

test('five heavy field effects produce nonempty 4K PNG and proof under CPU pressure',async({page,context})=>{
 test.setTimeout(240000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const project=await setup(page,context);
 const ids=['gravityLens','liquidRope','tensorFiligree','risoSeparation','slitSweep'];
 Object.assign(project.params,{fontSize:180,abW:2048,abH:2048,exportScale:2,transparentBg:true,surfaceOrder:ids.join(',')});
 project.letters=Array.from(project.text,()=>({t:0,l:0,i:0,o:Object.fromEntries(ids.map(id=>[id,{t:1,i:1}]))}));
 await page.locator('#projFile').setInputFiles({name:'heavy-fields.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:2});
 const bytes=await png(page),image=await pixels(bytes);expect(image.width).toBe(4096);expect(image.height).toBe(4096);expect(image.changed).toBeGreaterThan(5000);
 await page.locator('#btnPreview').evaluate(e=>e.click());await expect(page.locator('#previewOverlay')).toBeVisible({timeout:120000});
 const proof=await page.locator('#previewImg').evaluate(async img=>Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())));
 expect(await pixels(Buffer.from(proof))).toEqual(image);expect(errors).toEqual([]);
});
