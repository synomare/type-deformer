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
