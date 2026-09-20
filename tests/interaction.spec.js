import {test,expect} from '@playwright/test';
import fs from 'node:fs';
async function open(page){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/fonts\.googleapis\.com/,r=>r.fulfill({status:200,contentType:'text/css',body:''}));
 await page.goto('/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#stageWorld')?.children.length>0);
 await page.locator('[data-workflow-stage="effect"]').click();
 await page.locator('#pOperator').evaluate(e=>{e.value='rotate';e.dispatchEvent(new Event('change',{bubbles:true}));});
 return errors;
}
test('slider gesture, out-of-range numeric draft, Undo/Redo and project restore retain exact values',async({page})=>{
 const errors=await open(page),slider=page.locator('#pRotateAngle'),number=page.locator('#pRotateAngleNumber');
 await expect(slider).toBeVisible();const before=await slider.inputValue();const box=await slider.boundingBox();
 await page.mouse.move(box.x+box.width*.4,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height/2,{steps:20});await page.mouse.up();
 const dragged=await slider.inputValue();expect(dragged).not.toBe(before);await expect(number).toHaveValue(dragged);
 await page.locator('#btnHeaderUndo').click();await expect(slider).toHaveValue(before);await page.locator('#btnHeaderRedo').click();await expect(slider).toHaveValue(dragged);
 await number.fill('1080.5');await expect(slider).toHaveValue(dragged);await number.press('Enter');await expect(slider).toHaveAttribute('aria-valuetext','1080.5');await expect(number).toHaveValue('1080.5');
 await expect(slider.locator('..')).toHaveClass(/is-parameter-modified/);
 await page.locator('#btnHeaderUndo').click();await expect(slider).toHaveValue(dragged);await page.locator('#btnHeaderRedo').click();await expect(number).toHaveValue('1080.5');
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#btnSaveProj').evaluate(e=>e.click())]);const saved=await download.path();expect(JSON.parse(fs.readFileSync(saved,'utf8')).params.rotateAngle).toBe(1080.5);
 await slider.locator('..').locator('.parameter-row-reset').click();await expect(number).toHaveValue('60');await expect(slider.locator('..')).not.toHaveClass(/is-parameter-modified/);
 await page.locator('#projFile').setInputFiles(saved);await expect(number).toHaveValue('1080.5');
 await page.setViewportSize({width:390,height:844});await page.locator('[data-mobile-section="effect"]').click();await expect(number).toBeVisible();await number.fill('-');await number.press('Enter');await expect(number).toHaveAttribute('aria-invalid','true');await expect(slider).toHaveAttribute('aria-valuetext','1080.5');await number.press('Escape');await expect(number).toHaveValue('1080.5');
 expect(errors).toEqual([]);
});
test('a real Worker abandons obsolete edit work and completes the latest input',async({page})=>{
 await open(page);
 const result=await page.evaluate(async()=>{
  const code=`onmessage=e=>{const m=e.data;postMessage({type:'progress',id:m.id,value:'started'});const end=performance.now()+m.payload.ms;while(performance.now()<end){};postMessage({type:'result',id:m.id,result:{key:m.key}});}`;
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));let started,finished;const ready=new Promise(r=>started=r),done=new Promise(r=>finished=r);
  const q=TypeDeformerRenderJobs.create({workerFactory:()=>new Worker(url),interruptAfter:180,onProgress:started,onState:s=>{if(s.ready)finished(s);}});
  q.request('obsolete',{purpose:'edit',ms:2000});await ready;const t=performance.now();q.invalidate();q.request('latest',{purpose:'edit',ms:10});const state=await done;const elapsed=performance.now()-t;q.dispose();URL.revokeObjectURL(url);return {elapsed,key:state.result.key,counters:state.counters};
 });
 expect(result.key).toBe('latest');expect(result.counters.interrupted).toBe(1);expect(result.elapsed).toBeLessThan(1500);
});
