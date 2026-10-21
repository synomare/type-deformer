import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {inflateRawSync} from 'node:zlib';

async function open(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/fonts\.googleapis\.com/,r=>r.fulfill({status:200,contentType:'text/css',body:''}));
 await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-workspace-state',/^(ready|blocked)$/);
 await expect(page.locator('body')).toHaveJSProperty('inert',false);
 return errors;
}
async function download(page,id){
 const exported=new Promise(resolve=>{
  const finish=(kind,value)=>{page.off('download',onDownload);page.off('popup',onPopup);resolve({kind,value});};
  const onDownload=value=>finish('download',value),onPopup=value=>finish('popup',value);
  page.once('download',onDownload);page.once('popup',onPopup);
 });
 const [{kind,value}]=await Promise.all([exported,page.locator('#'+id).evaluate(e=>e.click())]);
 if(kind==='popup'){
  await value.waitForLoadState('domcontentloaded');
  // Read the actual generated resource, including SVG markup rather than its rendered DOM.
  const text=await value.evaluate(async()=>{const response=await fetch(location.href);if(!response.ok)throw Error('Export popup could not be read');return response.text();});
  await value.close();return text;
 }
 return fs.readFileSync(await value.path(),'utf8');
}
async function importProject(page,data){await page.locator('#projFile').setInputFiles({name:'delivery.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await expect(page.locator('#projectActionStatus')).toContainText('Project loaded');await expect(page.locator('#textInput')).toHaveValue(data.text);}

test('keyboard can begin selection, move through source units, change a glyph and undo',async({page})=>{
 const errors=await open(page),stage=page.locator('#stage');
 await stage.focus();await stage.press('Enter');await expect(page.locator('#stage .c.selected')).toHaveCount(1);await expect(page.locator('#stageKeyboardStatus')).toContainText('1 /');
 const before=JSON.parse(await download(page,'btnSaveProj'));
 await stage.focus();await stage.press('ArrowRight');const after=JSON.parse(await download(page,'btnSaveProj'));expect(after.letters).not.toEqual(before.letters);
 await stage.focus();await stage.press('Control+z');const undone=JSON.parse(await download(page,'btnSaveProj'));expect(undone.letters).toEqual(before.letters);
 await stage.focus();await stage.press('Alt+ArrowRight');await expect(page.locator('#stageKeyboardStatus')).toContainText('2 /');
 await stage.press('End');expect(await page.locator('#stage .c.selected').getAttribute('data-source-id')).toBe(await page.locator('#stage .c').last().getAttribute('data-source-id'));
 await stage.press('Escape');await expect(page.locator('#stage .c.selected')).toHaveCount(0);expect(errors).toEqual([]);
});

test('mobile controls leave the artwork visible at narrow and landscape sizes',async({page})=>{
 const errors=await open(page);
 for(const viewport of [{width:390,height:844},{width:320,height:568},{width:667,height:375}]){
  await page.setViewportSize(viewport);await page.locator('.mobile-dock [data-mobile-section="effect"]').click();
  await expect.poll(()=>page.evaluate(()=>{
   const s=document.querySelector('#stageFrame').getBoundingClientRect(),p=document.querySelector('.panel').getBoundingClientRect();
   const overlap=Math.max(0,Math.min(s.right,p.right)-Math.max(s.left,p.left))*Math.max(0,Math.min(s.bottom,p.bottom)-Math.max(s.top,p.top));
   const visible=Array.from(document.querySelectorAll('#stage .c')).filter(e=>{const b=e.getBoundingClientRect(),at=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return at===e||e.contains(at);}).length;
   return visible>0&&overlap<10&&document.documentElement.scrollWidth<=innerWidth;
  })).toBe(true);
 }
 expect(errors).toEqual([]);
});

test('viewport controller preserves saved artwork through pan, zoom and mobile panel handoff',async({page},testInfo)=>{
 await page.setViewportSize({width:1440,height:900});
 const errors=await open(page);
 const before=JSON.parse(await download(page,'btnSaveProj'));
 await page.locator('#btnViewMode').click();
 await expect(page.locator('#btnViewMode')).toHaveAttribute('aria-pressed','true');
 const wrap=page.locator('#stageWrap'),frame=await page.locator('#stageFrame').boundingBox();
 const oldX=Number(await wrap.getAttribute('data-view-x'));
 await page.mouse.move(frame.x+frame.width*.5,frame.y+frame.height*.5);
 await page.mouse.down();await page.mouse.move(frame.x+frame.width*.5+40,frame.y+frame.height*.5+20,{steps:5});await page.mouse.up();
 await expect.poll(async()=>Number(await wrap.getAttribute('data-view-x'))).toBeCloseTo(oldX+40,1);
 const oldScale=Number(await wrap.getAttribute('data-view-scale'));
 await page.locator('#btnViewZoomIn').click();
 await expect.poll(async()=>Number(await wrap.getAttribute('data-view-scale'))).toBeCloseTo(oldScale*1.25,4);
 const after=JSON.parse(await download(page,'btnSaveProj'));
 expect(after.text).toBe(before.text);expect(after.params).toEqual(before.params);expect(after.letters).toEqual(before.letters);
 await page.locator('#btnViewReset').click();
 await expect(page.locator('#btnViewMode')).toHaveAttribute('aria-pressed','false');
 await expect(page.locator('#btnViewReset')).toContainText('FIT');
 await page.screenshot({path:testInfo.outputPath('controller-desktop.png')});
 await page.setViewportSize({width:390,height:844});
 await page.locator('.mobile-dock [data-mobile-section="effect"]').click();
 await expect(page.locator('.panel')).toHaveClass(/mobile-open/);
 await page.locator('#btnMobileSheetBack').click();
 await expect(page.locator('.panel')).not.toHaveClass(/mobile-open/);
 await page.locator('#btnViewMode').click();
 await expect(page.locator('#btnViewMode')).toHaveAttribute('aria-pressed','true');
 await page.locator('#btnViewReset').click();
 await expect(page.locator('#btnViewReset')).toContainText('FIT');
 await page.screenshot({path:testInfo.outputPath('controller-mobile.png')});
 expect(errors).toEqual([]);
});

test('SVG portability and source metadata are independent explicit choices',async({page})=>{
 const errors=await open(page),source='PRIVATE_SOURCE_1937';
 await importProject(page,{app:'type-deformer',version:93,text:source,params:{fontFamily:'"Times New Roman", serif',artboard:'custom',abW:400,abH:160,exportTight:false,exportLongEdge:0,exportScale:1,svgMode:'portable',svgMetadata:false},letters:[]});
  if(page.viewportSize().width<=760)await page.locator('.mobile-dock [data-mobile-section="export"]').click();
  else await page.locator('[data-workflow-stage="export"]').click();
 const portable=await download(page,'btnSvg');expect(portable).toContain('<image');expect(portable).not.toContain('<text ');expect(portable).not.toContain(source);expect(portable).not.toContain('sourceText');expect(portable).not.toContain('@import');
 await page.locator('#pSvgMetadata').check();const withSource=await download(page,'btnSvg');expect(withSource).toContain(source);
 await page.locator('#pSvgMode').selectOption('text');await page.locator('#pSvgMetadata').uncheck();const editable=await download(page,'btnSvg');expect(editable).toContain('<text ');expect(editable).not.toContain('sourceText');expect(editable).not.toContain('@import');
 expect(errors).toEqual([]);
});

test('Project and Share carry renderer identity and source references',async({page})=>{
 const errors=await open(page),saved=JSON.parse(await download(page,'btnSaveProj'));
 expect(saved.renderer.schemaVersion).toBe(93);expect(saved.renderer.rendererRevision).toMatch(/^[a-f0-9]{64}$/);expect(saved.letters.every(row=>row.source?.id)).toBe(true);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__capturedShare=value;}}}));
 await page.locator('#btnShare').evaluate(e=>e.click());await page.waitForFunction(()=>window.__capturedShare);
 const url=await page.evaluate(()=>window.__capturedShare),payload=url.split('#p=')[1],tag=payload[0],bytes=Buffer.from(payload.slice(2),'base64url');
 const share=JSON.parse((tag==='d'?inflateRawSync(bytes):bytes).toString('utf8'));
 expect(share.G.map(row=>row.id)).toEqual(saved.letters.map(row=>row.source.id));expect(share.R).toEqual(saved.renderer);expect(share.F).toEqual(saved.fontManifest);
 const loaded=await page.evaluate(()=>({revision:TypeDeformerBuildInfo.rendererRevision,count:Object.keys(TypeDeformerBuildInfo.assets).length}));
 expect(saved.renderer.rendererRevision).toBe(loaded.revision);expect(loaded.count).toBeGreaterThan(50);expect(errors).toEqual([]);
});
