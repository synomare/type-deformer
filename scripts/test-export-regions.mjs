// Actual editor/output functions with native raster and explicit DOM/layout mocks.
// Not browser CSS, download/clipboard, accessibility or iPhone evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { exportFixture, canvas, html } from './export-fixture.mjs';
import { extract } from './paragraph-current-fixture.mjs';
import { setMeasuredPageSource } from './page-layout-fixture.mjs';
import { installHatchOutput } from './hatch-copper-fixture.mjs';
const plain = v => JSON.parse(JSON.stringify(v));
const passage = 'WAVE & BODY 永書\nSmall forms in a wide field.\n'.repeat(6);
function setup(settings = {}, source = passage) {
  const env = exportFixture(), c = env.c;
  Object.assign(c.params, { fontSize:20, textMeasure:8, lineHeight:1.25, pageDepth:5, pageKeepLines:1,
    pageLayout:'spreads', pageGutter:2, pageGap:3, artboard:'auto', transparentBg:true, exportRegion:'page', exportRegionNumber:2 }, settings);
  setMeasuredPageSource(c, source);
  c.canvasView = {x:-314, y:731, scale:.42};
  return env;
}
function uncut(c, scene, L) {
  const output = canvas.createCanvas(Math.round(L.w), Math.round(L.h)), ctx = output.getContext('2d');
  if (!c.params.transparentBg) {ctx.fillStyle=c.params.paper; ctx.fillRect(0,0,output.width,output.height);}
  c.withSceneRenderClock(scene,()=>{c.drawSceneBands(ctx,scene.bands,1,L);c.drawGlyphs(ctx,scene.glyphs,1,L,c.fontMetrics(),false);});
  return output;
}
test('page/spread windows use the declared untransformed frame on horizontal, vertical, LTR and RTL layouts',()=>{
  for (const vertical of [false,true]) for (const order of ['ltr','rtl','auto']) {
    const {c}=setup({vertical,pageOrder:order}), before=JSON.stringify([c.params,c.canvasView,c.metrics.map(m=>[m.relX,m.relY,m.operatorStates])]);
    const glyph=c.metrics.find(m=>m.pageIndex===1), f=glyph.readingPageFrame, state=c.exportRegionState();
    assert.deepEqual(plain(state.frame),vertical?{x:-f.maxV,y:f.minU,w:f.maxV-f.minV,h:f.maxU-f.minU}
      :{x:f.minU,y:f.minV,w:f.maxU-f.minU,h:f.maxV-f.minV});
    c.params.exportRegion='spread'; c.params.exportRegionNumber=1;
    const spread=c.exportRegionState(), page=c.pageLayoutState.pages[0].frame;
    assert.equal(spread.frame.w,2*page.w+c.params.pageGutter*c.params.fontSize);
    assert.equal(spread.frame.h,page.h);
    c.params.exportRegion='page'; c.params.exportRegionNumber=2;
    assert.equal(JSON.stringify([c.params,c.canvasView,c.metrics.map(m=>[m.relX,m.relY,m.operatorStates])]),before);
  }
  const {c}=setup({},'字'.repeat(65));
  // The exact line count varies with the native fallback font. Construct the
  // odd-page case explicitly; this assertion covers the empty spread slot,
  // not platform font metrics.
  if(c.pageLayoutState.pages.length%2===0)c.pageLayoutState.pages.pop();
  assert.equal(c.pageLayoutState.pages.length%2,1);
  c.params.exportRegion='spread';c.params.exportRegionNumber=Math.ceil(c.pageLayoutState.pages.length/2);
  assert.equal(c.exportRegionState().frame.w,360,'empty last partner keeps its declared slot');
});
test('work/default path retains legacy content-bound rendering and never adds a crop',()=>{
  for(const artboard of ['auto','custom']) {
    const {c}=setup({exportRegion:'work',artboard,abW:480,abH:360});
    const scene=c.snapshotRenderableScene(), bounds=c.sceneContentBounds(scene,c.exportBoundsPad());
    const oldL=c.compositionExportLayout(scene,c.exportLayout(bounds));
    assert.deepEqual(plain(c.exportScenePlan(scene).layout),plain(oldL));
    assert.equal(c.exportClipRect(c.exportScenePlan(scene)),null);
    assert.deepEqual(c.renderCanvas(1).toBuffer('image/png'),uncut(c,scene,oldL).toBuffer('image/png'));
  }
});
test('crop keeps every glyph and shared Surface geometry; opaque margins never leak outside the chosen frame',()=>{
  for(const fit of [false,true]) for(const anchor of ['tl','cc','br']) {
    const {c}=setup({artboard:'custom',abW:460,abH:340,fit,anchor,marginPct:10});installHatchOutput(c);
    for(const m of c.metrics) Object.assign(c.operatorState(m, 'hatchEngrave'),{current:1,toggled:true});
    // A glyph belonging to page 1 crosses page 2's top edge: cropping must
    // retain its contribution inside but not leak it into the output margin.
    const foreign=c.metrics[0], frame=c.pageLayoutState.pages[1].frame;
    foreign.el.style.setProperty('--op-current-x',String(frame.x+frame.w/2-foreign.relX));
    foreign.el.style.setProperty('--op-current-y',String(frame.y-5-foreign.relY));
    const scene=c.snapshotRenderableScene(), plan=c.exportScenePlan(scene), rect=c.exportClipRect(plan);
    const before=JSON.stringify([c.params,c.canvasView,c.metrics.map(m=>[m.relX,m.relY,m.operatorStates])]);
    const raw=uncut(c,scene,plan.layout), actual=c.renderCanvas(1), a=actual.getContext('2d').getImageData(0,0,actual.width,actual.height).data;
    const b=raw.getContext('2d').getImageData(0,0,raw.width,raw.height).data;
    let seen=0,outsideInk=0;
    for(let y=0;y<actual.height;y++)for(let x=0;x<actual.width;x++){
      const offset=(y*actual.width+x)*4;
      if(x>=Math.ceil(rect.x)+1&&y>=Math.ceil(rect.y)+1&&x<Math.floor(rect.x+rect.w)-1&&y<Math.floor(rect.y+rect.h)-1){
        assert.deepEqual(a.slice(offset,offset+4),b.slice(offset,offset+4));seen+=a[offset+3]>0;
      } else if(x+1<rect.x||y+1<rect.y||x>rect.x+rect.w+1||y>rect.y+rect.h+1){
        assert.equal(a[offset+3],0);outsideInk+=b[offset+3]>0;
      }
    }
    assert.ok(seen>50);assert.ok(outsideInk>0,'fixture must include out-of-page marks that would leak into the margins');
    assert.equal(scene.glyphs.length,c.metrics.length,'do not filter source or rebuild per-page FX');
    assert.equal(JSON.stringify([c.params,c.canvasView,c.metrics.map(m=>[m.relX,m.relY,m.operatorStates])]),before);
  }
});
test('PNG, preview and SVG share crop identity and surface pixels, including independent FX opacity',async()=>{
  for(const opacity of [0,.25,1]){
    const {c,downloads}=setup({exportRegion:'spread',exportRegionNumber:1,artboard:'custom',abW:440,abH:240});installHatchOutput(c);
    c.params.hatchOpacity=opacity;c.params.hatchSourceOpacity=0;
    for(const m of c.metrics) Object.assign(c.operatorState(m, 'hatchEngrave'),{current:1,toggled:true});
    const png=c.renderCanvas(1),preview=c.renderCanvas(1,true);
    assert.deepEqual(png.toBuffer('image/png'),preview.toBuffer('image/png'));
    c.exportPng();c.runSvgExport();assert.equal(downloads.length,2);
    assert.match(downloads[0].filename,/-spread-1\.png$/);assert.match(downloads[1].filename,/-spread-1\.svg$/);
    const svg=await downloads[1].blob.text();assert.match(svg,/<g clip-path="url\(#td-output-region\)">/);
    assert.equal((svg.match(/<text /g)||[]).length,c.metrics.length,'SVG is explicitly not a redacted source document');
    const metadata=JSON.parse(svg.match(/<metadata>([^]*?)<\/metadata>/)[1].replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&'));
    assert.deepEqual(metadata.exportRegion.frame,plain(c.exportRegionState().frame));assert.equal(metadata.exportRegion.sourceTextIncludesOutsideCrop,true);
    if(opacity){const embedded=svg.match(/data-effect-layer="surface-fx"[^]*?href="data:image\/png;base64,([^"]+)"/)[1];
      const image=await canvas.loadImage(Buffer.from(embedded,'base64')), output=canvas.createCanvas(png.width,png.height);output.getContext('2d').drawImage(image,0,0);
      assert.deepEqual(output.toBuffer('image/png'),png.toBuffer('image/png'));}
  }
});
test('invalid, empty, pending, IME and incompatible modes stop output without silently retargeting',()=>{
  const variations=[{exportRegionNumber:999},{exportRegionNumber:0},{exportRegionNumber:1.5},{gridEnabled:true},{pageLayout:'continuous'},
    {pageLayout:'pages',exportRegion:'spread'}];
  for(const change of variations){const {c,downloads,statuses}=setup(change),before=plain(c.params);c.exportPng();c.runSvgExport();
    assert.equal(downloads.length,0);assert.equal(statuses.at(-1).state,'error');assert.deepEqual(plain(c.params),before);}
  for(const mode of ['compose','ime','pending','empty']){
    const {c,downloads}=setup();if(mode==='compose')c.compositionState.enabled=true;
    if(mode==='ime')c.textComposing=true;if(mode==='pending')c.textInput.value+='未反映';if(mode==='empty')setMeasuredPageSource(c,'');
    assert.throws(()=>c.renderCanvas(1));c.exportPng();assert.equal(downloads.length,0);
  }
  const {c}=setup();c.params.exportRegionNumber=c.pageLayoutState.pages.length;setMeasuredPageSource(c,'短文');
  assert.match(c.exportRegionState().error,/番号/);assert.ok(c.params.exportRegionNumber>1);
  c.params.exportRegionNumber=1;c.metricsDirty=true;assert.doesNotThrow(()=>c.renderCanvas(1));assert.equal(c.metricsDirty,false);
});
test('async PNG naming belongs to the rendered page even if output settings change during encoding',()=>{
  const {c,downloads}=setup(), create=c.document.createElement;let encode;
  c.document.createElement=tag=>{const el=create(tag);const toBlob=el.toBlob;el.toBlob=callback=>{encode=()=>toBlob(callback);};return el;};
  c.exportPng();c.params.exportRegion='work';c.params.exportRegionNumber=9;encode();
  assert.match(downloads[0].filename,/-page-2\.png$/);
});
test('scope UI events preserve Apply/camera, distinguish pending numbers and capture the source caret (mock DOM)',()=>{
  const {c}=setup();let dirty=0,history=0;
  let offset=0;c.sourceParagraphs=passage.split('\n').map(line=>{const p={start:offset,end:offset+line.length};offset+=line.length+1;return p;});
  c.textInput.selectionStart=Number(c.metrics.find(m=>m.pageIndex===4).el.dataset.sourceStart);
  const target={mode:'range',start:3,end:12},view=plain(c.canvasView);c.sourceTarget=target;
  const ids=['pExportRegion','exportRegionControls','pExportRegionNumber','exportRegionNumberLabel','btnExportRegionPrev','btnExportRegionNext',
    'btnExportRegionSource','exportRegionStatus','vExportSize','exportQuickSummary','exportQuickTitle','btnPng','btnSvg','btnCopy','btnPreview','btnQuickPreview',
    'btnQuickPng','btnQuickSvg','btnMobilePreview','btnHeaderPreview'];
  const controls=Object.fromEntries(ids.map(id=>[id,{id,value:'',textContent:'',listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}}]));
  c.document.getElementById=id=>controls[id]||null;c.document.querySelector=()=>null;
  c.pushHistory=()=>{history++;};c.markAutosaveDirty=()=>{dirty++;};c.scheduleParameterUIRefresh=()=>{};
  c.latestImagePreflight=null;c.updateImageExportPreflight=()=>{};
  vm.runInContext(['setExportRegion','captureExportRegionFromSource','updateExportRegionUI','updateExportActionAvailability','updateExportInfo'].map(extract).join('\n'),c);
  vm.runInContext(html.match(/      document.getElementById\('pExportRegion'\).addEventListener[^]*?(?=      abSelect.addEventListener)/)[0],c);
  c.updateExportInfo();controls.btnExportRegionNext.listeners.click();assert.equal(c.params.exportRegionNumber,3);
  controls.pExportRegionNumber.value='999';controls.pExportRegionNumber.listeners.change({target:controls.pExportRegionNumber});
  assert.equal(controls.btnPng.disabled,true);assert.match(controls.exportRegionStatus.textContent,/番号/);
  controls.btnExportRegionSource.listeners.click();assert.equal(c.params.exportRegionNumber,5);assert.equal(controls.btnPng.disabled,false);
  c.params.gridEnabled=true;c.updateExportInfo();assert.equal(controls.btnPng.disabled,true);assert.equal(c.params.exportRegionNumber,5);
  c.params.gridEnabled=false;c.updateExportInfo();assert.equal(controls.btnPng.disabled,false);
  assert.equal(c.sourceTarget,target);assert.deepEqual(plain(c.canvasView),view);assert.equal(history,3);assert.equal(dirty,3);
  c.document.activeElement=controls.pExportRegionNumber;controls.pExportRegionNumber.value='12';c.updateExportInfo();
  assert.equal(controls.pExportRegionNumber.value,'12','background status updates preserve an uncommitted numeric draft');
  c.setExportRegion('page',2);assert.equal(controls.pExportRegionNumber.value,'2','explicit changes synchronize even while focused');
});
test('normalization keeps output scope global, rejects invalid values and defaults missing old settings',()=>{
  const {c}=setup();c.PARAM_DEFAULTS={exportRegion:'work',exportRegionNumber:1};
  vm.runInContext(['clampParam','chooseParam'].map(extract).join('\n'),c);
  const statements=extract('normalizeParams').split('\n').filter(line=>/Param\('exportRegion/.test(line)).join('\n');
  for(const [value,expected] of [[-1,1],[1000001,1000000],[NaN,1],['bad',1],[5,5]]){
    c.params.exportRegionNumber=value;vm.runInContext(statements,c);assert.equal(c.params.exportRegionNumber,expected);
  }
  c.params.exportRegion='invalid';vm.runInContext(statements,c);assert.equal(c.params.exportRegion,'work');
  assert.ok(!html.match(/var BATCH_PARAM_KEYS[^]*?\n      \];/)?.[0].includes('exportRegion'));
});
test('3k/10k/50k Current + Reading retain full geometry when a single spread is rendered',t=>{
  const line='余白を読み、次の声へ。 Words remain across the page.\n';
  for(const size of [3000,10000,50000]){
    const source=line.repeat(Math.ceil(size/line.length)).slice(0,size),start=performance.now();
    const {c}=setup({fontSize:18,textMeasure:28,pageDepth:28,exportRegion:'spread',exportRegionNumber:2},source);
    for(const [i,m] of c.metrics.entries()){
      if(i%3)Object.assign(c.operatorState(m, 'paragraphCurrent'),{current:1,toggled:true});
      if(i%5)Object.assign(c.operatorState(m, 'readingField'),{current:1,toggled:true});
    }
    c.measureLayout();const measured=performance.now(),before=JSON.stringify([c.params,c.canvasView]);
    const output=c.renderCanvas(1),done=performance.now();
    assert.equal(c.textInput.value,source);assert.equal(c.snapshotGlyphs(true).length,c.metrics.length);
    assert.equal(JSON.stringify([c.params,c.canvasView]),before);assert.equal(output.width,1044);assert.equal(output.height,504);
    t.diagnostic(JSON.stringify({chars:size,glyphs:c.metrics.length,pages:c.pageLayoutState.pages.length,
      setupAndMeasureMs:+(measured-start).toFixed(1),snapshotAndDrawMs:+(done-measured).toFixed(1),
      scope:'native/synthetic Current+Reading spread; no Surface, browser input latency, device heap or FPS claim'}));
  }
});
