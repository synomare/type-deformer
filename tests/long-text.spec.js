import {test, expect} from '@playwright/test';
import {editorHookTarget, insertEditorHook} from '../scripts/editor-hook.mjs';

const editorTarget = editorHookTarget();
const hook = `window.__longTextProbe={
 setup(text){
  Object.assign(params,{mode:'edit',fontFamily:'"Times New Roman",serif',fontSize:25,randomness:0,rotation:0,accentRatio:0,
    textMeasure:30,gridEnabled:false,textObjects:'[]'});
  textInput.value=text;createSpans(text);applyStyle();measureLayout();
  for(var i of [0,21,577,2000]){if(!metrics[i])continue;operatorState(metrics[i],'rotate').manual=25;
    metrics[i].locked=true;metrics[i].explicitLock=true;applyOperatorVisual(metrics[i]);}
  this.nodes=new Map(metrics.map(m=>[m.el.dataset.sourceId,m.el]));
 },
 state(){return {text:renderedSourceText,draft:textInput.value,busy:!!textEditJob,dirty:metricsDirty,
   generation:textEditGeneration,undo:undoStack.length,redo:redoStack.length};},
 audit(){return {ids:metrics.map(m=>m.el.dataset.sourceId),states:metrics.map(letterState),
   reused:metrics.filter(m=>this.nodes.get(m.el.dataset.sourceId)===m.el).length,
   glyphs:snapshotGlyphs(true).map(g=>({ch:g.ch,x:g.x,y:g.y,w:g.w,h:g.h,matrix:g.matrix}))};},
 job(){var job=textEditJob;if(!job)return null;this.cancelled=false;job.promise.then(done=>{this.cancelled=!done;});
   return {generation:job.generation,text:job.text};},
 start(text){pendingTextSelection=textSelectionSnapshot();textInput.value=text;pendingTextValue=text;return startTextEditJob(text);},
 beginWithoutWaiting(text){this.start(text);return this.state();},
 geometry(force){if(force){TypeDeformerTextLayout.invalidate();measureLayout();}
   return {reused:currentLayoutSnapshot.reusedParagraphs,boxes:currentLayoutSnapshot.boxes};},
 configure(values){Object.assign(params,values);applyStyle();measureLayout();},
 saveWhilePending(text){this.beginWithoutWaiting(text);var before=!!textEditJob,data=projectData();
   return {before,data,state:this.state(),committed:renderedSourceText};},
 exportWhilePending(text){this.beginWithoutWaiting(text);var before=!!textEditJob;prepareExportOutput();
   if(metricsDirty)measureLayout();return {before,state:this.state(),source:metrics.map(m=>TypeDeformerTextLayout.reference(m.el)),
     glyphs:snapshotGlyphs(true).map(g=>g.ch)};},
 backgroundWhilePending(text){this.beginWithoutWaiting(text);markAutosaveDirty();var result=saveAutosave();
   return {result,state:this.state()};},
 exitWhilePending(text){this.beginWithoutWaiting(text);markAutosaveDirty();window.dispatchEvent(new Event('pagehide'));
   var key='typeDeformer.workspace.emergency.'+workspaceStore.inspect().writer;
   return {state:this.state(),journal:JSON.parse(localStorage.getItem(key))};},
 historyActions(actions,save){for(var action of actions){if(action==='undo')undo();else redo();}
   var pending={state:this.state(),queued:textEditJob?textEditJob.historyActions.length:0,
     undoDisabled:document.getElementById('btnHeaderUndo').disabled,redoDisabled:document.getElementById('btnHeaderRedo').disabled};
   return {pending,data:save?projectData():null,state:this.state()};},
 undo,redo,project:projectData,
 };`;

async function open(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/fonts\.googleapis\.com/, route => route.fulfill({status:200,contentType:'text/css',body:''}));
  await page.route('**/' + editorTarget.path, route => route.fulfill({
    status:200,contentType:'text/javascript',body:insertEditorHook(editorTarget.source,hook)
  }));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.__longTextProbe && /^(ready|blocked)$/.test(document.body.dataset.workspaceState || '') && !document.body.inert);
  return errors;
}
const prose = count => ('ABC def 123.\n').repeat(Math.ceil(count/13)).slice(0,count);
async function focusText(page) {
  if (page.viewportSize().width <= 760) await page.locator('[data-mobile-section="text"]').click();
  await page.locator('#textInput').click();
}
async function settled(page,text) {
  await page.waitForFunction(text => {
    const s=__longTextProbe.state();
    return s.text===text && !s.busy && !s.dirty;
  },text);
}

test('cooperative insertion preserves surviving DOM, authored state, and Undo export geometry', async ({page}) => {
  const errors=await open(page),original=prose(5000);
  await page.evaluate(text=>__longTextProbe.setup(text),original);
  const before=await page.evaluate(()=>__longTextProbe.audit());
  await focusText(page);
  await page.evaluate(()=>document.getElementById('textInput').setSelectionRange(2500,2500));
  await page.keyboard.insertText('X');
  const edited=original.slice(0,2500)+'X'+original.slice(2500);
  await expect(page.locator('#textInput')).toHaveValue(edited);
  await settled(page,edited);
  const after=await page.evaluate(()=>__longTextProbe.audit());
  expect(after.reused).toBe(before.ids.length);
  const afterById=new Map(after.ids.map((id,i)=>[id,after.states[i]]));
  for(let i=0;i<before.ids.length;i++){
    const {source:_,...expected}=before.states[i],{source:__,...actual}=afterById.get(before.ids[i]);
    expect(actual).toEqual(expected);
  }
  await page.keyboard.press('Control+z');
  await settled(page,original);
  const undo=await page.evaluate(()=>__longTextProbe.audit());
  expect(undo.ids).toEqual(before.ids);
  expect(undo.states).toEqual(before.states);
  expect(undo.glyphs).toEqual(before.glyphs);
  await page.keyboard.press('Control+Shift+z');
  await settled(page,edited);
  const redo=await page.evaluate(()=>__longTextProbe.audit());
  expect(redo.ids).toEqual(after.ids);
  expect(redo.states).toEqual(after.states);
  expect(errors).toEqual([]);
});

test('20k keyboard edits interrupt preparation and superseded jobs cannot replace the latest source', async ({page},testInfo) => {
  const errors=await open(page),original=prose(20000);
  await page.evaluate(text=>__longTextProbe.setup(text),original);
  await focusText(page);
  await page.evaluate(n=>document.getElementById('textInput').setSelectionRange(n,n),original.length);
  await page.keyboard.insertText('X');
  await page.waitForFunction(()=>__longTextProbe.state().busy);
  const running=await page.evaluate(()=>({job:__longTextProbe.job(),state:__longTextProbe.state()}));
  expect(running.state.text).toBe(original);
  const started=Date.now();
  await page.keyboard.insertText('Y');
  const afterInput=await page.evaluate(()=>({state:__longTextProbe.state(),cancelled:__longTextProbe.cancelled}));
  const inputElapsedMs=Date.now()-started;
  expect(afterInput.cancelled).toBe(true);
  expect(afterInput.state.generation).toBeGreaterThan(running.job.generation);
  expect(afterInput.state.draft).toBe(original+'XY');
  await settled(page,original+'XY');
  expect((await page.evaluate(()=>__longTextProbe.state())).undo).toBe(1);
  await testInfo.attach('input-interruption.json',{body:JSON.stringify({inputElapsedMs,originalLength:original.length,
    note:'Measured browser automation response; no fixed wall-time threshold or real-device latency claim.'}),contentType:'application/json'});
  expect(errors).toEqual([]);
});

test('Undo cancels an uncommitted revision, Redo restores it, and loading replaces all pending work', async ({page}) => {
  const errors=await open(page),original=prose(5000);
  await page.evaluate(text=>__longTextProbe.setup(text),original);
  await focusText(page);
  await page.evaluate(text=>__longTextProbe.beginWithoutWaiting(text),original+'PENDING');
  await page.keyboard.press('Control+z');
  await settled(page,original);
  expect((await page.evaluate(()=>__longTextProbe.state())).draft).toBe(original);
  await page.keyboard.press('Control+Shift+z');
  await settled(page,original+'PENDING');
  await page.evaluate(text=>__longTextProbe.beginWithoutWaiting(text),original+'OBSOLETE');
  await page.locator('#projFile').setInputFiles({name:'replacement.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({
    app:'type-deformer',version:93,text:'Imported final',params:{fontSize:35}
  }))});
  await settled(page,'Imported final');
  // Allow obsolete scheduled slices to run if cancellation failed.
  await page.waitForTimeout(100);
  const saved=await page.evaluate(()=>__longTextProbe.project());
  expect(saved.text).toBe('Imported final');
  expect(saved.letters).toHaveLength(13);
  expect((await page.evaluate(()=>__longTextProbe.state())).undo).toBe(0);
  expect(errors).toEqual([]);
});

test('paragraph reuse agrees with a fresh full native measurement and invalidates changed font or measure', async ({page}) => {
  const errors=await open(page);
  const original=('AV office 123.\nABC אבג (123) XYZ\nか\u3099 العربية。\n').repeat(100);
  await page.evaluate(text=>__longTextProbe.setup(text),original);
  for(const settings of [
    {textMeasure:30,align:'left',vertical:false},
    {textMeasure:30,align:'center',vertical:false},
    {textMeasure:14,align:'right',vertical:true},
    {textMeasure:0,align:'left',vertical:false}
  ]){
    await page.evaluate(({text,settings})=>{__longTextProbe.setup(text);__longTextProbe.configure(settings);},{text:original,settings});
    await page.evaluate(text=>__longTextProbe.beginWithoutWaiting(text),original.replace('AV office','AV longer office'));
    await settled(page,original.replace('AV office','AV longer office'));
    const incremental=await page.evaluate(()=>__longTextProbe.geometry(false));
    const full=await page.evaluate(()=>__longTextProbe.geometry(true));
    expect(incremental.reused).toBeGreaterThan(0);
    expect(incremental.boxes).toEqual(full.boxes);
    await page.evaluate(()=>__longTextProbe.configure({fontSize:31.5}));
    expect((await page.evaluate(()=>__longTextProbe.geometry(false))).reused).toBe(0);
  }
  // A new longest line expands max-content width and changes every centered
  // paragraph's native alignment. Cached widths must never conceal that change.
  await page.evaluate(text=>{__longTextProbe.setup(text);__longTextProbe.configure({textMeasure:0,align:'center'});},original);
  const expanded='W'.repeat(250)+'\n'+original;
  await page.evaluate(text=>__longTextProbe.beginWithoutWaiting(text),expanded);
  await settled(page,expanded);
  const expandedIncremental=await page.evaluate(()=>__longTextProbe.geometry(false));
  const expandedFull=await page.evaluate(()=>__longTextProbe.geometry(true));
  expect(expandedIncremental.reused).toBe(0);
  expect(expandedIncremental.boxes).toEqual(expandedFull.boxes);
  await page.evaluate(text=>__longTextProbe.beginWithoutWaiting(text),original);
  await settled(page,original);
  const shrunken=await page.evaluate(()=>__longTextProbe.geometry(false));
  expect(shrunken.boxes).toEqual((await page.evaluate(()=>__longTextProbe.geometry(true))).boxes);
  expect(errors).toEqual([]);
});

test('saving during preparation finishes one coherent source and authored glyph set', async ({page}) => {
  const errors=await open(page),original=prose(5000);
  await page.evaluate(text=>__longTextProbe.setup(text),original);
  const before=await page.evaluate(()=>__longTextProbe.audit());
  const edited='Q'+original;
  const saved=await page.evaluate(text=>__longTextProbe.saveWhilePending(text),edited);
  expect(saved.before).toBe(true);
  expect(saved.state.busy).toBe(false);
  expect(saved.data.text).toBe(edited);
  expect(saved.committed).toBe(edited);
  expect(saved.data.letters.length).toBe(before.ids.length+1);
  const byId=new Map(saved.data.letters.map(s=>[s.source.id,s]));
  for(let i=0;i<before.ids.length;i++){
    const {source,...expected}=before.states[i],{source:ref,...actual}=byId.get(before.ids[i]);
    expect(actual).toEqual(expected);
    expect(ref.start).toBe(source.start+1);
    expect(ref.end).toBe(source.end+1);
    expect(edited.slice(ref.start,ref.end)).toBe(ref.text);
  }
  expect(errors).toEqual([]);
});

test('background autosave yields to preparation while export and pagehide flush a coherent revision', async ({page}) => {
  const errors=await open(page),original=prose(5000);
  await page.evaluate(text=>__longTextProbe.setup(text),original);
  const deferred=await page.evaluate(text=>__longTextProbe.backgroundWhilePending(text),original+'D');
  expect(deferred.result).toBe(false);
  expect(deferred.state.busy).toBe(true);
  expect(deferred.state.text).toBe(original);
  const exported=await page.evaluate(text=>__longTextProbe.exportWhilePending(text),'E'+original);
  expect(exported.before).toBe(true);
  expect(exported.state.busy).toBe(false);
  expect(exported.state.text).toBe('E'+original);
  expect(exported.glyphs.join('')).toBe(exported.source.map(ref=>ref.text).join(''));
  for(const ref of exported.source)expect(('E'+original).slice(ref.start,ref.end)).toBe(ref.text);
  const exited=await page.evaluate(text=>__longTextProbe.exitWhilePending(text),original+'EXIT');
  expect(exited.state.busy).toBe(false);
  expect(exited.state.text).toBe(original+'EXIT');
  expect(exited.journal.project.text).toBe(original+'EXIT');
  for(const state of exited.journal.project.letters){
    expect(exited.journal.project.text.slice(state.source.start,state.source.end)).toBe(state.source.text);
  }
  expect(errors).toEqual([]);
});

test('rapid history commands preserve every step, opposite directions, cancellation and forced save', async ({page}) => {
  const errors=await open(page),original=prose(5000);
  await page.evaluate(text=>__longTextProbe.setup(text),original);
  const first=original+'A',second=first+'B';
  for(const text of [first,second]){
    await page.evaluate(text=>__longTextProbe.beginWithoutWaiting(text),text);
    await settled(page,text);
  }
  const originalEnd=await page.evaluate(()=>__longTextProbe.audit());
  const pending=await page.evaluate(()=>__longTextProbe.historyActions(['undo','undo']));
  expect(pending.pending.state.busy).toBe(true);
  expect(pending.pending.queued).toBe(1);
  expect(pending.pending.undoDisabled).toBe(true);
  expect(pending.pending.redoDisabled).toBe(false);
  await settled(page,original);
  expect((await page.evaluate(()=>__longTextProbe.state())).undo).toBe(0);
  expect((await page.evaluate(()=>__longTextProbe.state())).redo).toBe(2);
  await page.evaluate(()=>__longTextProbe.historyActions(['redo','redo']));
  await settled(page,second);
  expect((await page.evaluate(()=>__longTextProbe.audit())).states).toEqual(originalEnd.states);
  for(const actions of [['undo','redo'],['undo'],['redo','undo']]){
    await page.evaluate(actions=>__longTextProbe.historyActions(actions),actions);
    await settled(page,actions.length===2&&actions[0]==='undo'?second:first);
  }
  const middle=await page.evaluate(()=>__longTextProbe.state());
  expect([middle.undo,middle.redo]).toEqual([1,1]);
  await page.evaluate(()=>__longTextProbe.historyActions(['redo']));
  await settled(page,second);
  const saved=await page.evaluate(()=>__longTextProbe.historyActions(['undo','undo'],true));
  expect(saved.pending.queued).toBe(1);
  expect(saved.state.busy).toBe(false);
  expect(saved.data.text).toBe(original);
  expect([saved.state.undo,saved.state.redo]).toEqual([0,2]);
  await page.evaluate(()=>__longTextProbe.historyActions(['redo','redo']));
  await settled(page,second);
  await page.evaluate(text=>{
    __longTextProbe.historyActions(['undo','undo']);
    __longTextProbe.beginWithoutWaiting(text);
  },second+'C');
  await settled(page,second+'C');
  const cancelled=await page.evaluate(()=>__longTextProbe.state());
  expect([cancelled.undo,cancelled.redo]).toEqual([3,0]);
  expect(errors).toEqual([]);
});
