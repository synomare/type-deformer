import {test,expect} from '@playwright/test';
import fs from 'node:fs';

test('Wasserstein endpoints survive cached middle frames and whole-text edits survive Undo',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/fonts\.googleapis\.com/,r=>r.fulfill({status:200,contentType:'text/css',body:''}));
 await page.goto('/');await page.waitForFunction(()=>document.querySelector('#stageWorld')?.children.length);
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#btnSaveProj').evaluate(e=>e.click())]);
 const project=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
 project.text='AB';project.lookMemory=null;project.composition.enabled=false;
 Object.assign(project.params,{fontFamily:'Arial, sans-serif',fontWeight:400,fontSize:72,textMeasure:0,randomness:0,seed:41,activeOperator:'wassersteinLetters',wassersteinPartner:'X',wassersteinScope:'glyph',wassersteinProgress:1,wassersteinEntropy:.006,wassersteinMetric:1,wassersteinSharpness:.75,wassersteinView:'ink',artboard:'auto',exportScale:1});
 project.letters=Array.from(project.text,()=>({t:0,l:0,i:0,o:{wassersteinLetters:{t:1,i:1}}}));
 await page.locator('#projFile').setInputFiles({name:'transport.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
 await page.locator('[data-workflow-stage="effect"]').click();
 async function pixels(){return page.evaluate(async()=>{
  const job=TypeDeformerRenderJobs.inspect()[0],c=document.querySelector('#surfaceFxCanvas');
  if(job&&(job.busy||!job.ready||job.error)||!c||c.hidden)return null;
  const bytes=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  if(!bytes.some((v,i)=>i%4===3&&v>8))return null;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).join(',');
 });}
 async function ready(){await expect.poll(pixels,{timeout:30000}).not.toBeNull();return pixels();}
 async function change(selector,value){const before=await ready();if(selector==='#pWassersteinProgress'){await page.locator(selector+'Number').fill(String(value));await page.locator(selector+'Number').press('Enter');}else await page.locator(selector).selectOption(String(value));await expect.poll(async()=>{const p=await pixels();return p&&p!==before;},{timeout:30000}).toBe(true);return pixels();}
 const endpoint=await ready();await change('#pWassersteinProgress',.5);await change('#pWassersteinProgress',1);expect(await pixels()).toBe(endpoint);
 await change('#pWassersteinProgress',.5);await change('#pWassersteinScope','text');
 const group=await ready();await change('#pWassersteinProgress',.67);await page.locator('#btnHeaderUndo').click();
 await expect.poll(pixels,{timeout:30000}).toBe(group);
 await page.locator('#btnHeaderRedo').click();await expect.poll(async()=>{const p=await pixels();return p&&p!==group;},{timeout:30000}).toBe(true);
 expect(errors).toEqual([]);
});
