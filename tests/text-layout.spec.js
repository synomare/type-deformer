import { test, expect } from '@playwright/test';
import {editorHookTarget, insertEditorHook} from '../scripts/editor-hook.mjs';

const editorTarget = editorHookTarget();
const hook = `window.__layoutProbe={
 set(text,settings){Object.assign(params,{fontFamily:'"Times New Roman",serif',fontSize:100,fontWeight:400,letterSpacing:0,lineHeight:1.2,randomness:0,rotation:0,accentRatio:0,textMeasure:0,vertical:false,gridEnabled:false},settings||{});textInput.value=text;createSpans(text);applyStyle();measureLayout();},
 snapshot(){return currentLayoutSnapshot;}, metrics(){return metrics.map(m=>({id:m.el.dataset.sourceId,text:m.el.dataset.sourceText,box:m.layoutBox,w:m.w,h:m.h}));},
 edit(text){textInput.value=text;rebuildPreservingState(text);measureLayout();},undo,redo,
 project:projectData,load:loadProject,
 activate(id){setActiveOperator(id);},openSearch(){document.getElementById('btnMobileParameterSearch').click();},
 provenanceSetup(){this.set('AB');params.currentBend=1;batchProfiles={latin:{...copyBaseDeformProfile(),currentBend:2}};metrics[1].localParams={currentBend:3};activeBatchProfile='all';sourceTarget={mode:'all',start:0,end:0,valid:false};setActiveOperator('paragraphCurrent');refreshBatchProfileControls();document.getElementById('effectiveParameterBlock').open=true;refreshEffectiveParameterInspector();},
 provenanceSelect(){selectedM=metrics[1];operatorState(selectedM,'paragraphCurrent').manual=.4;refreshEffectiveParameterInspector();},
 selectionUndo(){this.set('ABC');selectLetter(metrics[1]);var id=selectedM.el.dataset.sourceId;pushHistory();operatorState(selectedM,'rotate').manual=45;applyAllOperatorVisuals();undo();return {id,selected:selectedM&&selectedM.el.dataset.sourceId};},
 cacheSemantics(){
  this.set('AB');params.deformedOnly=false;var all=snapshotGlyphs(true),shared=snapshotGlyphs();
  operatorState(metrics[1],'rotate').manual=45;applyAllOperatorVisuals();var changed=snapshotGlyphs();
  params.deformedOnly=true;var subset=snapshotGlyphs(),forced=snapshotGlyphs(true);params.deformedOnly=false;
  var beforeCamera=snapshotGlyphs().map(g=>({x:g.x,y:g.y,w:g.w,h:g.h}));stageWorld.style.transform='translate(120px,-73px) scale(.42)';
  var afterCamera=snapshotGlyphs().map(g=>({x:g.x,y:g.y,w:g.w,h:g.h}));
  params.fontSize=200;applyStyle();var wasDirty=metricsDirty;updateImageExportPreflight();var resized=snapshotGlyphs();
  var native=document.createElement('p'),nativeStyle=getComputedStyle(stageWorld.querySelector('p'));
  native.style.cssText='position:fixed;left:0;top:0;margin:0;width:max-content;white-space:pre-wrap;font-variant-ligatures:none';
  ['fontFamily','fontSize','fontWeight','fontStyle','fontFeatureSettings','fontVariationSettings','letterSpacing','lineHeight'].forEach(function(key){native.style[key]=nativeStyle[key];});
  native.textContent='AB';document.body.append(native);var nativeRange=document.createRange();nativeRange.setStart(native.firstChild,0);nativeRange.setEnd(native.firstChild,1);var nativeWidth=nativeRange.getBoundingClientRect().width;native.remove();
  return {shared:all===shared,changed:changed!==all,all:all.length,subset:subset.map(g=>g.ch),forced:forced.length,beforeCamera,afterCamera,wasDirty,dirtyAfterPreflight:metricsDirty,oldWidth:changed[0].w,newWidth:resized[0].w,nativeWidth};
 },
 neutral(){var m=metrics[0],s=operatorState(m,'rotate');s.manual=45;applyOperatorVisual(m);var active=m.el.style.getPropertyValue('--op-rotate');s.manual=null;s.current=0;s.toggled=false;applyOperatorVisual(m);return {active,reset:m.el.style.getPropertyValue('--op-rotate'),neutral:m.visualNeutral};},
 };`;
async function open(page) {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const requests = []; page.on('requestfailed', request => requests.push({url:request.url(),failure:request.failure()}));
  page.on('response', response => { if(response.status()>=400)requests.push({url:response.url(),status:response.status()}); });
  await page.route(/fonts\.googleapis\.com/, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/' + editorTarget.path, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: insertEditorHook(editorTarget.source, hook) }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  try { await page.waitForFunction(() => window.__layoutProbe && document.querySelector('#stage .c')); }
  catch (error) { throw new Error('Layout test did not finish boot. '+JSON.stringify({errors,requests}), { cause: error }); }
  await expect(page.locator('body')).toHaveAttribute('data-workspace-state',/^(ready|blocked)$/);
  await expect(page.locator('body')).toHaveJSProperty('inert',false);
  return errors;
}

test('browser inline runs preserve AV/To/ffi advances, grapheme ranges, mixed bidi and whitespace', async ({ page }) => {
  const errors = await open(page);
  for (const text of ['AV', 'To', 'ffi', 'office', 'A\u0301V', 'A\tB C\u00a0D', 'אבג (123) ABC', 'ABC \u2067אבג (123)\u2069 XYZ', 'سلام 123 (ABC) نور', 'ภาษาไทยทดสอบ']) {
    const result = await page.evaluate(text => {
      __layoutProbe.set(text);
      const snapshot = __layoutProbe.snapshot(), world = document.querySelector('#stageWorld'), source = world.querySelector('p');
      const reference = document.createElement('p');
      reference.style.cssText = 'position:fixed;left:0;top:0;margin:0;width:max-content;white-space:pre-wrap;tab-size:4;unicode-bidi:plaintext;font-variant-ligatures:no-common-ligatures no-discretionary-ligatures no-historical-ligatures;';
      const style = getComputedStyle(source);
      for (const key of ['fontFamily','fontSize','fontWeight','fontStyle','fontFeatureSettings','fontVariationSettings','letterSpacing','lineHeight']) reference.style[key] = style[key];
      const segments=[];let cursor=0;
      function addSegment(start,end,joining){
        if(end<=start)return;
        const node=document.createTextNode(text.slice(start,end));
        if(joining){const span=document.createElement('span');span.style.whiteSpace='nowrap';span.append(node);reference.append(span);}else reference.append(node);
        segments.push({node,start,end});
      }
      // Joining-script words are deliberately atomic nowrap runs in the product.
      // Give the independent native paragraph the same wrapping contract.
      for(const box of snapshot.boxes.filter(b=>b.source.unit==='joining-run')){
        addSegment(cursor,box.source.start,false);addSegment(box.source.start,box.source.end,true);cursor=box.source.end;
      }
      addSegment(cursor,text.length,false);document.body.append(reference);
      const range = document.createRange(); range.selectNodeContents(reference); const all = range.getBoundingClientRect();
      const native = snapshot.boxes.map(box => {
        const segment=segments.find(s=>s.start<=box.source.start&&s.end>=box.source.end);
        range.setStart(segment.node,box.source.start-segment.start);range.setEnd(segment.node,box.source.end-segment.start);
        // WebKit includes zero-width bidi boundary carets in its bounding union.
        // Only positive-area text fragments belong to the selected glyph.
        const rects=Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0);
        const x=Math.min(...rects.map(r=>r.left)),y=Math.min(...rects.map(r=>r.top));
        return {x,y,w:Math.max(...rects.map(r=>r.right))-x,h:Math.max(...rects.map(r=>r.bottom))-y};
      });
      const min = Math.min(...snapshot.boxes.map(b=>b.x)), nativeMin = Math.min(...native.map(b=>b.x));
      const errors = snapshot.boxes.map((b,i)=>({text:b.source.text,dx:(b.x-min)-(native[i].x-nativeMin),dw:b.w-native[i].w}));
      const sourceText = Array.from(world.querySelector('p').childNodes).map(n=>n.dataset?.sourceText||n.textContent).join('');
      const result = { errors, sourceText, logical:snapshot.boxes.map(b=>b.source.start), directions:snapshot.boxes.map(b=>b.direction), fullWidth:all.width, optionalLigatures:snapshot.optionalLigatures };
      reference.remove(); return result;
    }, text);
    expect(result.sourceText).toBe(text);
    expect(result.logical).toEqual([...result.logical].sort((a,b)=>a-b));
    expect(result.optionalLigatures).toBe(false);
    for (const item of result.errors) {
      expect(Math.abs(item.dx), `${JSON.stringify(text)} ${item.text} position`).toBeLessThan(0.06);
      expect(Math.abs(item.dw), `${JSON.stringify(text)} ${item.text} advance`).toBeLessThan(0.06);
    }
  }
  expect(errors).toEqual([]);
});

test('layout floats ignore camera transform and persistent IDs survive insertion and Undo', async ({ page }) => {
  const errors = await open(page);
  const result = await page.evaluate(() => {
    __layoutProbe.set('AV A\u0301 ABC', {fontSize:37.3});
    const before = __layoutProbe.metrics();
    document.querySelector('#stageWorld').style.transform = 'translate(137.7px,-91.3px) scale(.372)';
    const same = TypeDeformerTextLayout.measure(document.querySelector('#stageWorld'),document.querySelector('#stage'),Array.from(document.querySelectorAll('#stage .c')),{});
    __layoutProbe.edit('X AV A\u0301 ABC'); const after = __layoutProbe.metrics();
    __layoutProbe.undo(); const undone = __layoutProbe.metrics();
    return { before, same, after, undone };
  });
  expect(result.same.boxes).toEqual(result.before.map(m=>m.box));
  expect(result.before.some(m=>Math.abs(m.w-Math.round(m.w))>.001)).toBe(true);
  expect(result.after.slice(1).map(m=>m.id)).toEqual(result.before.map(m=>m.id));
  expect(result.undone.map(m=>m.id)).toEqual(result.before.map(m=>m.id));
  expect(errors).toEqual([]);
});

test('layout cache accounts for whitespace and replacement DOM while keeping source records immutable',async({page})=>{
 const errors=await open(page);
 const result=await page.evaluate(()=>{
  __layoutProbe.set('A B');const world=document.querySelector('#stageWorld'),stage=document.querySelector('#stage');
  const options={},measure=()=>TypeDeformerTextLayout.measure(world,stage,Array.from(world.querySelectorAll('.c')),options);
  const before=measure(),same=measure(),paragraph=world.querySelector('p');
  const space=Array.from(paragraph.childNodes).find(node=>node.nodeType===3&&node.textContent===' ');space.textContent='\t';
  const tab=measure(),b=world.querySelectorAll('.c')[1],clone=b.cloneNode(true);clone.style.removeProperty('--layout-x');b.replaceWith(clone);
  const replacement=measure();
  return {same:before===same,spaceX:before.boxes[1].x,tabX:tab.boxes[1].x,changed:tab!==before,replaced:replacement!==tab,
   applied:clone.style.getPropertyValue('--layout-x'),frozen:Object.isFrozen(tab.boxes[0].source)&&Object.isFrozen(tab.boxes[0].source.clusters)&&Object.isFrozen(tab.boxes[0].source.clusters[0])};
 });
 expect(result.same).toBe(true);expect(result.changed).toBe(true);expect(result.tabX).toBeGreaterThan(result.spaceX);expect(result.replaced).toBe(true);expect(result.applied).not.toBe('');expect(result.frozen).toBe(true);expect(errors).toEqual([]);
});

test('shared glyph snapshots preserve subset export, fresh preflight geometry and camera-independent coordinates',async({page})=>{
 const errors=await open(page);const result=await page.evaluate(()=>__layoutProbe.cacheSemantics());
 expect(result.shared).toBe(true);expect(result.changed).toBe(true);expect(result.all).toBe(2);expect(result.subset).toEqual(['B']);expect(result.forced).toBe(2);
 expect(result.afterCamera).toEqual(result.beforeCamera);expect(result.wasDirty).toBe(true);expect(result.dirtyAfterPreflight).toBe(false);
 expect(result.newWidth).toBeGreaterThan(result.oldWidth*1.9);expect(result.newWidth).toBeCloseTo(result.nativeWidth,1);expect(errors).toEqual([]);
});

test('run measurement preserves original glyph nodes, style boundaries and restoration after a range failure',async({page})=>{
 const errors=await open(page);
 const result=await page.evaluate(()=>{
  __layoutProbe.set('AV AV');const world=document.querySelector('#stageWorld'),stage=document.querySelector('#stage'),paragraph=world.querySelector('p');
  const originalNodes=Array.from(paragraph.childNodes),elements=Array.from(paragraph.querySelectorAll('.c'));
  elements[2].style.fontWeight='700';elements[2].style.fontSize='80px';elements[2].lang='en';
  stage.focus({preventScroll:true});
  let events=0;elements[0].addEventListener('layout-survival',()=>events++);
  const measure=()=>TypeDeformerTextLayout.measure(world,stage,elements,{});
  const first=measure(),cached=measure();const rect=Range.prototype.getBoundingClientRect;
  TypeDeformerTextLayout.invalidate();let caught=false;
  try{Range.prototype.getBoundingClientRect=function(){throw Error('intentional range read failure');};measure();}catch(error){caught=/intentional/.test(error.message);}finally{Range.prototype.getBoundingClientRect=rect;}
  const restored=originalNodes.every((node,i)=>paragraph.childNodes[i]===node),clean=!world.classList.contains('text-layout-reading')&&!world.classList.contains('text-layout-measuring');
  elements[0].dispatchEvent(new Event('layout-survival'));const after=measure();
  return {engine:first.engine,cached:first===cached,caught,restored,clean,events,focused:document.activeElement===stage,sourceIds:after.boxes.map(b=>b.source.id),originalIds:elements.map(el=>el.dataset.sourceId),style:{weight:elements[2].style.fontWeight,size:elements[2].style.fontSize,lang:elements[2].lang},before:first.boxes,after:after.boxes};
 });
 expect(result.cached).toBe(true);expect(result.caught).toBe(true);expect(result.restored).toBe(true);expect(result.clean).toBe(true);expect(result.events).toBe(1);
 expect(result.sourceIds).toEqual(result.originalIds);expect(result.style).toEqual({weight:'700',size:'80px',lang:'en'});expect(result.after).toEqual(result.before);expect(errors).toEqual([]);
 expect(result.focused).toBe(true);
});

test('wrapped, vertical and grid layouts retain independent deformation boxes', async ({ page }) => {
  const errors = await open(page);
  for (const settings of [{ textMeasure:4 }, { vertical:true, textMeasure:4 }, { gridEnabled:true, gridCols:4, gridCellSize:50 }]) {
    const result = await page.evaluate(settings => {
      __layoutProbe.set('AV 文字\nA\u0301V',settings);
      return { snapshot:__layoutProbe.snapshot(), boxes:__layoutProbe.metrics(), visual:Array.from(document.querySelectorAll('#stage .c'),el=>({position:getComputedStyle(el).position,width:getComputedStyle(el).width})) };
    },settings);
    expect(result.boxes).toHaveLength(6);
    expect(result.boxes.every(m=>m.w>0&&m.h>0&&Number.isFinite(m.box.x)&&Number.isFinite(m.box.y))).toBe(true);
    expect(result.visual.every(m=>m.position==='absolute')).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('actual beforeinput range anchors repeated letters and neutral fast path clears prior effects', async ({ page }) => {
  const errors = await open(page);
  const before = await page.evaluate(() => { __layoutProbe.set('AAA'); return __layoutProbe.metrics().map(m=>m.id); });
  await page.evaluate(() => {
    const input=document.querySelector('#textInput');input.setSelectionRange(0,0);
    input.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:'A',bubbles:true,cancelable:true}));
    input.value='AAAA';input.setSelectionRange(1,1);input.dispatchEvent(new InputEvent('input',{inputType:'insertText',data:'A',bubbles:true}));
  });
  await page.waitForFunction(()=>__layoutProbe.metrics().length===4);
  expect(await page.evaluate(()=>__layoutProbe.metrics().slice(1).map(m=>m.id))).toEqual(before);
  const after = await page.evaluate(() => { __layoutProbe.undo();return {ids:__layoutProbe.metrics().map(m=>m.id),effect:__layoutProbe.neutral()}; });
  expect(after.ids).toEqual(before);
  expect(after.effect).toEqual({active:'45.000deg',reset:'0.000deg',neutral:true});
  expect(errors).toEqual([]);
});

test('effective settings expose batch and source precedence and distinguish manual glyph overrides', async ({ page }) => {
  const errors=await open(page);
  await page.evaluate(()=>__layoutProbe.provenanceSetup());
  const row=page.locator('#effectiveParameterRows [data-parameter-key="currentBend"]');
  await expect(row).toContainText('複数値（2種類）');
  await expect(row).toContainText('原文の範囲');
  await expect(row).toContainText('英字');
  await page.evaluate(()=>__layoutProbe.provenanceSelect());
  await expect(row).toContainText('3.00');
  await expect(page.locator('#effectiveParameterStatus')).toContainText('選択した「B」');
  await expect(page.locator('#effectiveManualStatus')).toContainText('1字形に個別の手動変形');
  await expect(page.locator('#effectiveManualStatus')).toContainText('0.4');
  expect(errors).toEqual([]);
});

test('artwork Undo retains the surviving selected source glyph',async({page})=>{
 const errors=await open(page);const result=await page.evaluate(()=>__layoutProbe.selectionUndo());expect(result.selected).toBe(result.id);expect(errors).toEqual([]);
});

test('84 inert operator panels mount and bind only on first activation without losing the complete control registry',async({page})=>{
 const errors=await open(page);
 const result=await page.evaluate(()=>{
   const before=TypeDeformerOperatorPanels.stats();
   const ids=Array.from(document.querySelectorAll('[data-operator-panel] > template'),t=>t.parentElement.dataset.operatorPanel);
   const checks=[];
   for(const id of ids){
     __layoutProbe.activate(id);const panel=document.querySelector('[data-operator-panel="'+id+'"]');
     checks.push({id,template:!!panel.querySelector('template'),inputs:Array.from(panel.querySelectorAll('input[type="range"]')).map(input=>({id:input.id,entry:!!TypeDeformerNumericControls.entry(input),companions:panel.querySelectorAll('#'+input.id+'Number').length}))});
   }
   const all=TypeDeformerOperatorPanels.stats();__layoutProbe.activate(ids[0]);
   return {before,all,again:TypeDeformerOperatorPanels.stats(),checks};
 });
 expect(result.before).toEqual({templates:84,mounted:0,deferredBindings:523});
 expect(result.all).toEqual({templates:84,mounted:84,deferredBindings:0});expect(result.again).toEqual(result.all);
 for(const row of result.checks){expect(row.template,row.id).toBe(false);for(const input of row.inputs){expect(input.entry,input.id).toBe(true);expect(input.companions,input.id).toBe(1);}}
 expect(errors).toEqual([]);
});

test('search opens an unmounted parameter with its saved logical value beyond the slider and edits it once',async({page})=>{
 const errors=await open(page);
 await page.evaluate(()=>{__layoutProbe.load({app:'type-deformer',version:93,text:'AB',params:{sinewPull:512}});__layoutProbe.openSearch();});
 expect(await page.locator('#pSinewPull').count()).toBe(0);
 await page.locator('#parameterSearch').fill('pSinewPull');
 await page.locator('.parameter-result-main').click();
 const number=page.locator('#pSinewPullNumber');await expect(number).toHaveValue('512');
 await expect(page.locator('[data-operator-panel="sinewTorque"]')).toBeVisible();
 await number.fill('513');await number.press('Enter');
 expect(await page.evaluate(()=>__layoutProbe.project().params.sinewPull)).toBe(513);
 await page.evaluate(()=>__layoutProbe.undo());
 await expect(number).toHaveValue('512');
 expect(errors).toEqual([]);
});
