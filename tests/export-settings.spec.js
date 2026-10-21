import {test,expect} from '@playwright/test';
import fs from 'node:fs';

async function download(page,id) {
  const pending=page.waitForEvent('download');
  await page.locator(id).click();
  const result=await pending;
  return {name:result.suggestedFilename(),bytes:fs.readFileSync(await result.path())};
}

test('custom image size, print metadata, repeat saving and Project settings survive a roundtrip',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.locator('#textInput').fill('PRINT');await page.locator('#textInput').blur();
  await page.locator('#btnHeaderExport').click();
  await expect(page.locator('#pExportCustomSize')).toBeHidden();
  await page.locator('#pExportLongEdge').selectOption('custom');
  await page.locator('#pExportCustomSize').fill('3000');await page.locator('#pExportCustomSize').blur();
  await page.locator('#pExportPadding').evaluate(el=>{el.value='5';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#pExportDpi').selectOption('600');
  await page.locator('#pExportName').fill('print:test');await page.locator('#pExportName').blur();
  await page.locator('#pTransparent').check();
  const png=await download(page,'#btnPng');
  expect(png.name).toMatch(/^print-test-.*\.png$/);
  expect(Math.max(png.bytes.readUInt32BE(16),png.bytes.readUInt32BE(20))).toBe(3000);
  let phys=[];
  for(let offset=8;offset<png.bytes.length;){
    const length=png.bytes.readUInt32BE(offset),type=png.bytes.toString('ascii',offset+4,offset+8);
    if(type==='pHYs')phys.push([png.bytes.readUInt32BE(offset+8),png.bytes.readUInt32BE(offset+12),png.bytes[offset+16]]);
    offset+=length+12;
  }
  expect(phys).toEqual([[23622,23622,1]]);
  await expect(page.locator('#lastImageExportInfo')).toContainText('600 dpi');
  await page.locator('#pExportName').fill('new-edit');await page.locator('#pExportName').blur();
  const again=await download(page,'#btnSaveLastImage');
  expect(again.name).toBe(png.name);expect(again.bytes.equals(png.bytes)).toBe(true);
  await page.locator('#projectMenu > summary').click();
  const project=await download(page,'[data-project-proxy="btnSaveProj"]'),saved=JSON.parse(project.bytes);
  if(await page.locator('#projectMenu').evaluate(el=>el.open))await page.locator('#projectMenu > summary').click();
  expect(saved.params).toMatchObject({exportTight:true,exportLongEdge:3000,exportPadding:5,exportDpi:600,exportName:'new-edit'});
  await page.locator('#pExportLongEdge').selectOption('2048');
  await expect(page.locator('#pExportCustomSize')).toBeHidden();
  await page.locator('#projFile').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:project.bytes});
  await expect(page.locator('#pExportLongEdge')).toHaveValue('custom');
  await expect(page.locator('#pExportCustomSize')).toHaveValue('3000');
  await expect(page.locator('#pExportDpi')).toHaveValue('600');
  await page.locator('#pExportCustomSize').fill('16384');await page.locator('#pExportCustomSize').blur();
  await expect(page.locator('#btnPng')).toBeEnabled();
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-mobile-section="export"]').click();
  await page.locator('#pExportCustomSize').scrollIntoViewIfNeeded();
  await expect(page.locator('#pExportCustomSize')).toBeVisible();
  expect(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth))).toBe(0);
  expect(errors).toEqual([]);
});
