import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const fontPath=name=>new URL('./fixtures/fonts/'+name,import.meta.url).pathname.replace(/^\/(\w:)/,'$1');
async function open(page){const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/fonts\.googleapis\.com/,r=>r.fulfill({status:200,contentType:'text/css',body:''}));await page.goto('/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#stageWorld')?.children.length>0);if(page.viewportSize().width<760)await page.locator('[data-mobile-section="text"]').click();return errors;}
async function active(page,width=35){await expect(page.locator('#fontStatus')).toContainText('Active:');const family=await page.locator('#pImportedFont').inputValue();expect(family).toBeTruthy();await expect.poll(()=>page.evaluate(f=>{const c=document.createElement('canvas').getContext('2d');c.font='100px "'+f+'"';return c.measureText('A').width;},family)).toBeCloseTo(width,0);return family;}
async function projectData(page){
 const exported=new Promise(resolve=>{const finish=(kind,value)=>{page.off('download',download);page.off('popup',popup);resolve({kind,value});},download=value=>finish('download',value),popup=value=>finish('popup',value);page.once('download',download);page.once('popup',popup);});
 const [{kind,value}]=await Promise.all([exported,page.locator('#btnSaveProj').evaluate(e=>e.click())]);
 if(kind==='popup'){await value.waitForLoadState('domcontentloaded');const data=await value.evaluate(()=>JSON.parse(document.body.textContent));await value.close();return data;}
 return JSON.parse(fs.readFileSync(await value.path(),'utf8'));
}
test('one file applies immediately through the Import button and survives Undo/Redo',async({page})=>{
 const errors=await open(page);const chooserPromise=page.waitForEvent('filechooser');await page.locator('#btnFontFile').click();const chooser=await chooserPromise;expect(chooser.isMultiple()).toBe(true);await chooser.setFiles(fontPath('narrow.ttf'));const family=await active(page);
 expect(await page.locator('#pFontFile').getAttribute('accept')).toBeNull();await page.locator('#btnHeaderUndo').evaluate(e=>e.click());await expect(page.locator('#pImportedFont')).toHaveValue('');await page.locator('#btnHeaderRedo').evaluate(e=>e.click());await expect(page.locator('#pImportedFont')).toHaveValue(family);await active(page);expect(errors).toEqual([]);
});
test('OTF, WOFF, WOFF2 and collection bytes render their imported face',async({page})=>{
 const errors=await open(page);for(const name of ['narrow.otf','narrow.woff','narrow.woff2','pair.ttc']){await page.locator('#pFontFile').setInputFiles(fontPath(name));await expect(page.locator('#fontStatus')).toContainText(name);await active(page);}
 await expect(page.locator('#fontStatus')).toContainText('collection先頭書体');expect(errors).toEqual([]);
});
test('empty files, bad data and a failed FontFace leave the current font intact and can be retried',async({page})=>{
 const errors=await open(page);await page.locator('#pFontFile').setInputFiles(fontPath('narrow.ttf'));const previous=await active(page);
 await page.locator('#pFontFile').setInputFiles({name:'empty.ttf',mimeType:'font/ttf',buffer:Buffer.alloc(0)});await expect(page.locator('#fontStatus')).toContainText('空のファイル');
 await page.locator('#pFontFile').setInputFiles({name:'broken.ttf',mimeType:'font/ttf',buffer:Buffer.from('broken')});await expect(page.locator('#fontStatus')).toContainText('対応するフォントデータではありません');await expect(page.locator('#btnFontRetry')).toBeVisible();
 await page.evaluate(()=>{const original=FontFace.prototype.load;window.__failFontOnce=true;FontFace.prototype.load=function(){if(window.__failFontOnce){window.__failFontOnce=false;return Promise.reject(Error('test decode failure'));}return original.apply(this,arguments);};});
 await page.locator('#pFontFile').setInputFiles(fontPath('wide.ttf'));await expect(page.locator('#fontStatus')).toContainText('ブラウザがこの書体');
 expect((await projectData(page)).params.fontFamily).toContain(previous);
 await page.locator('#btnFontRetry').click();await active(page,95);expect(errors).toEqual([]);
});
test('the FileReader fallback works and an older delayed font cannot replace a newer selection',async({page})=>{
 const errors=await open(page);await page.evaluate(()=>{Blob.prototype.arrayBuffer=undefined;});await page.locator('#pFontFile').setInputFiles(fontPath('narrow.ttf'));await active(page);
 await page.evaluate(()=>{const original=FileReader.prototype.readAsArrayBuffer;FileReader.prototype.readAsArrayBuffer=function(file){const reader=this;setTimeout(()=>original.call(reader,file),300);};});
 await page.locator('#pFontFile').setInputFiles(fontPath('wide.ttf'));await expect(page.locator('#fontStatus')).toContainText('読み込み中');await page.locator('#pFont').selectOption({label:'Space Mono'});await expect(page.locator('#fontStatus')).toContainText('Preset: Space Mono');await expect.poll(()=>page.evaluate(()=>document.fonts.size)).toBeGreaterThan(1);await expect(page.locator('#pImportedFont')).toHaveValue('');expect(errors).toEqual([]);
});
test('multiple files stay lazy, searchable, and selected fonts render with the available canvas backend',async({page})=>{
 const errors=await open(page);await page.evaluate(()=>{const original=Blob.prototype.arrayBuffer;window.__reads=0;Blob.prototype.arrayBuffer=function(){__reads++;return original.call(this);};});
 await page.locator('#pFontFile').setInputFiles([fontPath('narrow.ttf'),fontPath('wide.ttf')]);await expect(page.locator('#fontStatus')).toContainText('2書体をLibraryへ追加');expect(await page.evaluate(()=>__reads)).toBe(0);
 await page.locator('#fontLibrarySearch').fill('wide');await expect(page.locator('#pImportedFont option')).toHaveCount(2);await page.locator('#pImportedFont').selectOption({label:'wide.ttf'});const family=await active(page,95);expect(await page.evaluate(()=>__reads)).toBe(1);
 const project=await projectData(page);project.text='AA';Object.assign(project.params,{fontSize:90,tensorSpacing:4,artboard:'auto',exportScale:1});project.letters=[0,1].map(()=>({t:0,l:0,i:0,o:{tensorFiligree:{t:1,i:1}}}));await page.locator('#projFile').setInputFiles({name:'worker-font.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await page.waitForFunction(()=>{const q=TypeDeformerRenderJobs.inspect()[0];if(q?.error)return true;const canvas=document.querySelector('#surfaceFxCanvas');return (!q||q.ready&&!q.busy)&&canvas&&!canvas.hidden&&canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3&&v>8);});await expect(page.locator('#fontStatus')).toContainText('wide.ttf');expect(await page.evaluate(()=>TypeDeformerRenderJobs.inspect().every(q=>!q.error))).toBe(true);expect(errors).toEqual([]);
});

test('Installed fonts lazily loads the selected face bytes and preserves its exact glyph metrics',async({page})=>{
 const data=Array.from(fs.readFileSync(fontPath('wide.ttf')));
 await page.addInitScript(bytes=>{window.__systemFontReads=0;window.queryLocalFonts=async()=>[{family:'Test installed',fullName:'Test installed Regular',postscriptName:'TestInstalled-Regular',blob:async()=>{__systemFontReads++;return new Blob([new Uint8Array(bytes)],{type:'font/ttf'});}}];},data);
 const errors=await open(page);await page.locator('#btnSystemFonts').click();await expect(page.locator('#fontStatus')).toContainText('1書体をLibraryへ追加');expect(await page.evaluate(()=>__systemFontReads)).toBe(0);
 await page.locator('#pImportedFont').selectOption({label:'Test installed Regular · Installed'});await active(page,95);expect(await page.evaluate(()=>__systemFontReads)).toBe(1);expect(errors).toEqual([]);
});


test('material rendering follows font changes and restores the same pixels from a warm cache',async({page})=>{
 const errors=await open(page);
 await page.locator('#pFontFile').setInputFiles([fontPath('narrow.ttf'),fontPath('wide.ttf')]);
 await page.locator('#pImportedFont').selectOption({label:'wide.ttf'});const wide=await active(page,95);
 const project=await projectData(page);project.text='AA';project.lookMemory=null;
 Object.assign(project.params,{fontSize:90,tensorSpacing:5,randomness:0,seed:41,textMeasure:0,artboard:'auto',exportScale:1});
 project.letters=[0,1].map(()=>({t:0,l:0,i:0,o:{tensorFiligree:{t:1,i:1}}}));project.composition.enabled=false;
 await page.locator('#projFile').setInputFiles({name:'cache-fonts.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 async function pixels(){return page.evaluate(async()=>{
  const job=TypeDeformerRenderJobs.inspect()[0];if(job&&(job.busy||!job.ready||job.error))return null;
  const c=document.querySelector('#surfaceFxCanvas');if(!c||c.hidden||!c.width||!c.height)return null;
  const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;if(!data.some((v,i)=>i%4===3&&v>8))return null;
  return [c.width,c.height,Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).join(',')].join('/');
 });}
 await expect.poll(pixels).not.toBeNull();const first=await pixels();
 await page.locator('#pImportedFont').selectOption({label:'narrow.ttf'});await active(page,35);
 await expect.poll(async()=>{const value=await pixels();return value&&value!==first;}).toBe(true);
 await page.locator('#pImportedFont').selectOption(wide);await active(page,95);
 await expect.poll(pixels,{timeout:30000}).toBe(first);expect(errors).toEqual([]);
});

async function loadProjectFile(page,project){await page.locator('#projFile').setInputFiles({name:'font-dependency.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});}
async function injectFont(page,buffer,name,lastModified){
 await page.evaluate(({bytes,name,lastModified})=>{const input=document.querySelector('#pFontFile'),transfer=new DataTransfer();transfer.items.add(new File([new Uint8Array(bytes)],name,{type:'font/ttf',lastModified}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));},{bytes:Array.from(buffer),name,lastModified});
}
test('saved font content relinks in a fresh page after rename and mtime changes',async({page,browser})=>{
 const errors=await open(page);const data=fs.readFileSync(fontPath('narrow.ttf'));
 await injectFont(page,data,'original.ttf',1);const family=await active(page),project=await projectData(page);
 const dependency=project.fontManifest.fonts.find(f=>f.family===family);expect(dependency.kind).toBe('imported');expect(dependency.sourceHash).toMatch(/^[a-f0-9]{64}$/);expect(dependency.faceIndex).toBe(0);
 const freshContext=await browser.newContext({viewport:page.viewportSize()}),fresh=await freshContext.newPage(),freshErrors=await open(fresh);await loadProjectFile(fresh,project);await expect(fresh.locator('#fontStatus')).toContainText('Font file missing');
 expect(await fresh.evaluate(()=>{try{TypeDeformerFontDependencies.assertReady();return '';}catch(e){return e.code;}})).toBe('FONT_DEPENDENCY_MISSING');
 await injectFont(fresh,data,'moved-and-renamed.ttf',999999);expect(await active(fresh)).toBe(family);await expect(fresh.locator('#btnFontRelink')).toBeHidden();
 expect((await projectData(fresh)).fontManifest.fonts.find(f=>f.family===family).sourceHash).toBe(dependency.sourceHash);
 expect(await fresh.evaluate(()=>TypeDeformerFontDependencies.assertReady().ready)).toBe(true);expect(errors.concat(freshErrors)).toEqual([]);await freshContext.close();
});
test('same name, size and mtime with different bytes cannot silently replace a saved dependency',async({page,browser},testInfo)=>{
 const errors=await open(page),narrow=fs.readFileSync(fontPath('narrow.ttf')),wide=fs.readFileSync(fontPath('wide.ttf'));
 const alternate=Buffer.concat([wide,Buffer.alloc(narrow.length-wide.length)]);expect(alternate.length).toBe(narrow.length);
 await injectFont(page,narrow,'same.ttf',7);const original=await active(page),project=await projectData(page);
 const freshContext=await browser.newContext({viewport:page.viewportSize()}),fresh=await freshContext.newPage(),freshErrors=await open(fresh);await loadProjectFile(fresh,project);await expect(fresh.locator('#fontStatus')).toContainText('Font file missing');
 await injectFont(fresh,alternate,'same.ttf',7);await expect(fresh.locator('#btnFontRelink')).toBeVisible();await expect(fresh.locator('#fontStatus')).toContainText('内容が異なります');
 expect((await projectData(fresh)).params.fontFamily).toContain(original);expect(await fresh.evaluate(()=>TypeDeformerFontDependencies.inspect().ready)).toBe(false);
 await fresh.locator('#btnFontRelink').scrollIntoViewIfNeeded();await fresh.screenshot({path:testInfo.outputPath('font-relink-candidate.png')});
 await fresh.locator('#btnFontRelink').click();const replacement=await active(fresh,95);expect(replacement).not.toBe(original);expect((await projectData(fresh)).params.fontFamily).toContain(replacement);
 expect(errors.concat(freshErrors)).toEqual([]);await freshContext.close();
});
test('version 92 file identities require a visible explicit relink and Undo restores the unresolved dependency',async({page})=>{
 const errors=await open(page),project=await projectData(page),legacy='Type Deformer narrow legacy-file-id';project.version=92;delete project.fontManifest;project.params.fontFamily='"'+legacy+'", serif';
 await loadProjectFile(page,project);await expect(page.locator('#fontStatus')).toContainText('旧Project');
 await page.locator('#pFontFile').setInputFiles(fontPath('narrow.ttf'));await expect(page.locator('#btnFontRelink')).toBeVisible();expect((await projectData(page)).params.fontFamily).toContain(legacy);
 await page.locator('#btnFontRelink').click();const family=await active(page);expect(family).toMatch(/^Type Deformer SHA256 /);
 await page.locator('#btnHeaderUndo').evaluate(e=>e.click());await expect(page.locator('#fontStatus')).toContainText('旧Project');expect(await page.evaluate(()=>TypeDeformerFontDependencies.inspect().ready)).toBe(false);
 await page.locator('#btnHeaderRedo').evaluate(e=>e.click());await active(page);expect(errors).toEqual([]);
});
test('unavailable external font names report fallback in the UI and captured dependency health',async({page})=>{
 const errors=await open(page);await page.getByText('Advanced · installed font name',{exact:true}).click();await page.locator('#pFontCustom').fill('Definitely Missing Font 89173');await page.locator('#pFontCustom').dispatchEvent('change');
 await expect(page.locator('#fontStatus')).toContainText('書体が見つかりません');await expect(page.locator('#fontStatus')).toHaveAttribute('data-state','fallback');
 const health=await page.evaluate(()=>TypeDeformerFontDependencies.assertReady());expect(health.ready).toBe(true);expect(health.issues[0].state).toBe('fallback');expect(health.issues[0].blocking).toBe(false);
 expect((await projectData(page)).fontManifest.fonts[0]).toMatchObject({kind:'external',family:'Definitely Missing Font 89173'});expect(errors).toEqual([]);
});
