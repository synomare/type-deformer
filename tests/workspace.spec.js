import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const old={app:'type-deformer',version:92,text:'書式だけの作品',params:{fontSize:100},letters:[]};
async function ready(page){await expect(page.locator('body')).toHaveAttribute('data-workspace-state',/^(ready|blocked)$/);await expect(page.locator('body')).toHaveJSProperty('inert',false);}
async function open(page){const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route(/fonts\.googleapis\.com/,r=>r.fulfill({status:200,contentType:'text/css',body:''}));await page.goto('/');await ready(page);return errors;}
async function records(page){return page.evaluate(async()=>{const s=TypeDeformerWorkspaceStore.create();try{return await s.list();}finally{s.close();}});}
async function flush(page){await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await expect(page.locator('#autosaveIndicator')).toHaveText('保存済');}
async function edit(page,text){if(page.viewportSize().width<=760)await page.locator('.mobile-dock [data-mobile-section="text"]').click();else await page.locator('[data-workflow-stage="text"]').click();await page.locator('#textInput').fill(text);await page.locator('#textInput').press('Tab');await page.waitForTimeout(120);}
async function importProject(page,data){await page.locator('#projFile').setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});}
async function savedProject(page,id='btnSaveProj'){
 const exported=new Promise(resolve=>{
  const finish=(kind,value)=>{page.off('download',onDownload);page.off('popup',onPopup);resolve({kind,value});};
  const onDownload=value=>finish('download',value),onPopup=value=>finish('popup',value);
  page.once('download',onDownload);page.once('popup',onPopup);
 });
 const [{kind,value}]=await Promise.all([exported,page.locator('#'+id).evaluate(e=>e.click())]);
 if(kind==='popup'){await value.waitForLoadState('domcontentloaded');const text=await value.evaluate(async()=>{const response=await fetch(location.href);if(!response.ok)throw Error('Project popup could not be read');return response.text();});await value.close();return JSON.parse(text);}
 return JSON.parse(fs.readFileSync(await value.path(),'utf8'));
}

test('CRLF Project import preserves later glyph state and text-object ranges through real saving',async({page})=>{
 const errors=await open(page);
 const raw={app:'type-deformer',version:93,text:'A\r\nB',params:{fontSize:72,fontFamily:'serif',randomness:0,rotation:0,
  textObjects:JSON.stringify([{id:'first',label:'A',start:0,end:1,x:0,y:0},{id:'second',label:'B',start:3,end:4,x:170,y:60}])},
  letters:[{source:{id:'saved-a',start:0,end:1,text:'A',clusters:[{start:0,end:1}]},o:{rotate:{t:1,i:1,m:11}}},
   {source:{id:'saved-b',start:3,end:4,text:'B',clusters:[{start:3,end:4}]},o:{rotate:{t:1,i:1,m:37}}}]};
 await importProject(page,raw);await expect(page.locator('#projectActionStatus')).toContainText('Project loaded');
 await expect(page.locator('#textInput')).toHaveValue('A\nB');
 const b=page.locator('#stageWorld .c[data-source-id="saved-b"]');
 await expect(b).toBeVisible();await expect(b).toHaveAttribute('data-source-start','2');await expect(b).toHaveAttribute('data-source-end','3');
 await expect.poll(()=>b.evaluate(el=>parseFloat(el.style.getPropertyValue('--op-rotate')))).toBe(37);
 expect(await b.evaluate(el=>getComputedStyle(el).transform)).not.toBe('none');
 const saved=await savedProject(page),savedB=saved.letters.find(letter=>letter.source.id==='saved-b');
 expect(saved.text).toBe('A\nB');expect(savedB.source).toMatchObject({start:2,end:3,text:'B',clusters:[{start:2,end:3}]});
 expect(savedB.o.rotate.m).toBe(37);expect(JSON.parse(saved.params.textObjects).map(o=>[o.start,o.end])).toEqual([[0,1],[2,3]]);
 const originals=(await records(page)).filter(record=>record.reason==='読み込んだ原本');
 expect(originals.some(record=>JSON.stringify(record.project)===JSON.stringify(raw))).toBe(true);
 expect(errors).toEqual([]);
});

test('style-only restart keeps a pinned exact original through later saves and reloads',async({page})=>{
 await page.addInitScript(data=>{if(!localStorage.getItem('seeded')){localStorage.setItem('typeDeformer.autosave.v1',JSON.stringify(data));localStorage.setItem('seeded','1');}},old);
 const errors=await open(page);await expect(page.locator('#autosaveStatus')).toContainText('文字だけ');expect((await savedProject(page)).params.fontSize).toBe(52);
 expect(await savedProject(page,'btnPreviousProject')).toEqual(old);
 for(const value of ['one','two','three']){await edit(page,value);await flush(page);}
 await page.reload();await ready(page);await expect(page.locator('#autosaveStatus')).toContainText('文字だけ');
 const all=await records(page);expect(all.some(r=>r.reason==='安全起動前の原本'&&r.project.params.fontSize===100&&r.project.text===old.text)).toBe(true);
 expect(await savedProject(page,'btnPreviousProject')).toEqual(old);expect(errors).toEqual([]);
});

for(const fixture of [{name:'malformed JSON',raw:'{"app":"type-deformer","broken":'}, {name:'invalid schema',raw:JSON.stringify({...old,version:'banana'})}]) {
 test('legacy '+fixture.name+' primary falls back to a valid backup without applying its effects',async({page})=>{
  const backup={...old,text:'BACKUP ORIGINAL',composition:{enabled:true,type:'matrix'}};
  await page.addInitScript(({raw,backup})=>{if(!localStorage.getItem('seeded')){localStorage.setItem('typeDeformer.autosave.v1',raw);localStorage.setItem('typeDeformer.autosave.backup.v1',JSON.stringify(backup));localStorage.setItem('seeded','1');}},{raw:fixture.raw,backup});
  const errors=await open(page);await expect(page.locator('#textInput')).toHaveValue(backup.text);await expect(page.locator('#autosaveStatus')).toContainText('バックアップ');
  const restored=await savedProject(page);expect(restored.params.fontSize).toBe(52);expect(restored.composition.enabled).toBe(false);
  expect(await savedProject(page,'btnPreviousProject')).toEqual(backup);
  expect((await records(page)).some(r=>r.reason==='安全起動前の原本'&&JSON.stringify(r.project)===JSON.stringify(backup))).toBe(true);
  expect(await page.evaluate(()=>localStorage.getItem('typeDeformer.autosave.v1'))).toBe(fixture.raw);
  expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('typeDeformer.autosave.backup.v1')))).toEqual(backup);expect(errors).toEqual([]);
 });
}

test('opening another Project checkpoints the edited artwork and its Undo history',async({page})=>{
 const errors=await open(page);await edit(page,'IMPORTANT UNSAVED');await edit(page,'IMPORTANT UNSAVED ARTWORK');
 await importProject(page,{...old,text:'OTHER PROJECT'});await expect(page.locator('#projectActionStatus')).toContainText('Project loaded');
 const checkpoint=(await records(page)).find(r=>r.reason==='Projectを開く前'&&r.project.text==='IMPORTANT UNSAVED ARTWORK');expect(checkpoint).toBeTruthy();expect(checkpoint.history.undo.length).toBeGreaterThan(0);
 await page.locator('#workspaceRecovery').evaluate(e=>e.open=true);await expect(page.locator('#workspaceRecoverySelect option[value="'+checkpoint.id+'"]')).toHaveCount(1);
 await page.locator('#workspaceRecoverySelect').evaluate((e,id)=>{e.value=id;e.dispatchEvent(new Event('change',{bubbles:true}));},checkpoint.id);await page.locator('#btnWorkspaceRestore').evaluate(e=>e.click());await expect(page.locator('#projectActionStatus')).toContainText('復旧コピーを開きました');await expect(page.locator('#textInput')).toHaveValue('IMPORTANT UNSAVED ARTWORK');
 const undo=page.locator(page.viewportSize().width<=760?'#btnMobileUndo':'#btnHeaderUndo');await expect(undo).toBeEnabled();await undo.click();await expect(page.locator('#textInput')).toHaveValue('IMPORTANT UNSAVED');expect(errors).toEqual([]);
});

test('alternating two tabs never rotates away either working document',async({context,page})=>{
 await open(page);await edit(page,'TAB-A');await flush(page);
 const other=await context.newPage();await open(other);await edit(other,'TAB-B');await flush(other);
 for(const value of ['TAB-A1','TAB-A2','TAB-A3']){await edit(page,value);await flush(page);}
 const docs=(await records(page)).filter(r=>r.kind==='document');expect(docs.some(r=>r.project.text==='TAB-B')).toBe(true);expect(docs.some(r=>r.project.text==='TAB-A3')).toBe(true);await expect(other.locator('#autosaveIndicator')).toHaveText('保存済');
 await other.reload();await ready(other);await expect(other.locator('#textInput')).toHaveValue('TAB-B');
});

test('invalid imports and failed checkpoints preserve the currently edited document',async({page})=>{
 const errors=await open(page);await edit(page,'KEEP ME');
 for(const data of [{...old,version:'banana'},{...old,params:{fontSize:'bad'}},{...old,version:9999},{...old,letters:[{o:{rotate:{t:'false',i:'bad',m:'bad'}}}]},{...old,document:{id:'invalid-revision',revision:-1}},{...old,letters:[{source:{id:'wrong-source',start:0,end:1,text:'違'}}]}]){await importProject(page,data);await expect(page.locator('#projectActionStatus')).toContainText('読み込めません');await expect(page.locator('#textInput')).toHaveValue('KEEP ME');}
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='recoveries')throw new DOMException('Injected full disk','QuotaExceededError');return original.apply(this,args);};});
 await importProject(page,{...old,text:'MUST NOT OPEN'});await expect(page.locator('#projectActionStatus')).toContainText('Injected full disk');await expect(page.locator('#textInput')).toHaveValue('KEEP ME');expect(errors).toEqual([]);
});

test('an apply exception rolls back source, parameters and Undo',async({page})=>{
 const errors=await open(page);await edit(page,'ROLLBACK BEFORE');const before=await savedProject(page);
 await page.evaluate(()=>{const original=TypeDeformerFontDependencies;let once=true;globalThis.TypeDeformerFontDependencies={...original,restore(...args){if(once){once=false;throw new Error('Injected apply failure');}return original.restore(...args);}};});
 await importProject(page,{...old,text:'BROKEN APPLY'});await expect(page.locator('#projectActionStatus')).toContainText('読込を取り消しました');
 const after=await savedProject(page);expect(after.text).toBe(before.text);expect(after.params).toEqual(before.params);await expect(page.locator('#btnHeaderUndo')).toBeEnabled();expect(errors).toEqual([]);
});

test('new Project preserves the previous artwork as a recoverable record',async({page})=>{
 await open(page);await edit(page,'BEFORE NEW');await page.locator('#btnNew').evaluate(e=>e.click());await page.locator('#btnNew').evaluate(e=>e.click());await expect(page.locator('#textInput')).toHaveValue('');
 expect((await records(page)).some(r=>r.reason==='新規作成前'&&r.project.text==='BEFORE NEW')).toBe(true);
});

test('pending workspace restoration blocks real editing until the recovered source is ready',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(data=>{
  localStorage.setItem('typeDeformer.autosave.v1',JSON.stringify(data));
  const original=indexedDB.open.bind(indexedDB);let held=false;
  indexedDB.open=function(...args){
   const request=original(...args);if(held||args[0]!=='type-deformer-workspace')return request;held=true;
   let prototype=request,descriptor;while(prototype&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(prototype,'onsuccess');prototype=Object.getPrototypeOf(prototype);}
   // Hold the real IndexedDB success callback, after its upgrade has completed.
   Object.defineProperty(request,'onsuccess',{configurable:true,set(callback){descriptor.set.call(request,function(event){window.__releaseWorkspaceStartup=()=>callback.call(request,event);window.__workspaceStartupHeld=true;});}});
   return request;
  };
 },{...old,text:'RECOVERED BEFORE EDITING'});
 await page.route(/fonts\.googleapis\.com/,route=>route.fulfill({status:200,contentType:'text/css',body:''}));
 await page.goto('/');await page.waitForFunction(()=>window.__workspaceStartupHeld);
 await expect(page.locator('body')).toHaveAttribute('data-workspace-state','initializing');
 await expect(page.locator('body')).toHaveJSProperty('inert',true);
 const initial=await page.locator('#textInput').inputValue();
 const initialMode=await page.locator('.panel').getAttribute('data-mode');
 await page.evaluate(()=>{window.__startupShuffleClicks=0;document.getElementById('btnShuffle').addEventListener('click',()=>window.__startupShuffleClicks++);});
 await page.locator('#textInput').focus();await page.keyboard.type('MUST NOT ENTER BEFORE RESTORE');
 expect(await page.locator('#textInput').inputValue()).toBe(initial);
 expect(await page.locator('#textInput').evaluate(input=>input===document.activeElement)).toBe(false);
 expect(await page.evaluate(()=>document.activeElement===document.body)).toBe(true);
 await page.keyboard.press('e');await page.keyboard.press('s');
 expect(await page.locator('.panel').getAttribute('data-mode')).toBe(initialMode);
 expect(await page.evaluate(()=>window.__startupShuffleClicks)).toBe(0);
 await page.evaluate(()=>window.__releaseWorkspaceStartup());
 await expect(page.locator('body')).toHaveAttribute('data-workspace-state','ready');
 await expect(page.locator('body')).toHaveJSProperty('inert',false);
 await expect(page.locator('#textInput')).toHaveValue('RECOVERED BEFORE EDITING');
 await edit(page,'EDIT AFTER RESTORE');expect((await savedProject(page)).text).toBe('EDIT AFTER RESTORE');
 await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('e');
 await expect(page.locator('.panel')).toHaveAttribute('data-mode','edit');
 await page.keyboard.press('s');expect(await page.evaluate(()=>window.__startupShuffleClicks)).toBe(1);
 expect((await records(page)).some(record=>record.reason==='安全起動前の原本'&&record.project.text==='RECOVERED BEFORE EDITING')).toBe(true);
 expect(errors).toEqual([]);
});

test('a failed workspace startup unlocks editing and actual Project export',async({page})=>{
 await page.addInitScript(()=>{
  window.__startupStorageFailures=0;
  IDBFactory.prototype.open=function(){window.__startupStorageFailures++;throw new DOMException('Injected startup storage failure','UnknownError');};
 });
 const errors=await open(page);
 expect(await page.evaluate(()=>window.__startupStorageFailures)).toBeGreaterThan(0);
 await expect(page.locator('body')).toHaveAttribute('data-workspace-state','blocked');
 await expect(page.locator('#autosaveStatus')).toContainText('Injected startup storage failure');
 await edit(page,'MANUAL SAVE AFTER STORAGE FAILURE');
 expect((await savedProject(page)).text).toBe('MANUAL SAVE AFTER STORAGE FAILURE');
 await page.evaluate(()=>document.activeElement.blur());await page.keyboard.press('e');
 await expect(page.locator('.panel')).toHaveAttribute('data-mode','edit');
 expect(errors).toEqual([]);
});

// Load the real storage modules on the application's origin without starting
// editor autosave. These cases use browser IndexedDB and local/sessionStorage.
async function openStoreHarness(page) {
 await page.route('**/workspace-test-harness',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><script src="/project-codec.js"></script><script src="/workspace-store.js"></script>'}));
 await page.goto('/workspace-test-harness');
 await page.waitForFunction(()=>window.TypeDeformerWorkspaceStore&&window.TypeDeformerProjectCodec);
}

test('workspace journal survives completion of an older pending save, even with the same revision',async({page})=>{
 await openStoreHarness(page);
 const results=await page.evaluate(async()=>{
  const out=[];
  for(const sameRevision of [false,true]) {
   const s=TypeDeformerWorkspaceStore.create();await s.startup();
   const first={app:'type-deformer',version:93,text:'PENDING OLD',params:{},document:{id:crypto.randomUUID(),revision:7}};
   const newer={...first,text:'PAGEHIDE NEW',document:{...first.document,revision:sameRevision?7:8}};
   const original=IDBObjectStore.prototype.put;let release=false,started;
   const blocked=new Promise(resolve=>started=resolve);
   IDBObjectStore.prototype.put=function(value,...rest){
    const req=original.call(this,value,...rest);
    if(this.name==='documents'&&value.project.text==='PENDING OLD') {
     const store=this;function keepAlive(){const hold=store.get('__hold_transaction__');hold.onsuccess=()=>{if(!release)keepAlive();};}keepAlive();started();
    }
    return req;
   };
   const pending=s.save(first);await blocked;
   const onExit=()=>s.emergency(newer);window.addEventListener('pagehide',onExit,{once:true});window.dispatchEvent(new Event('pagehide'));
   const key='typeDeformer.workspace.emergency.'+s.inspect().writer,raw=localStorage.getItem(key);
   release=true;try{await pending;}finally{IDBObjectStore.prototype.put=original;}
   const retained=localStorage.getItem(key)===raw,committed=(await s.list()).find(r=>r.kind==='document'&&r.id===s.inspect().branch);
   s.close();const restarted=TypeDeformerWorkspaceStore.create();const loaded=await restarted.startup();
   out.push({sameRevision,retained,committed:committed.project.text,loaded:loaded.project,removed:localStorage.getItem(key)===null});restarted.close();
  }
  return out;
 });
 for(const row of results){expect(row.retained).toBe(true);expect(row.committed).toBe('PENDING OLD');expect(row.loaded.text).toBe('PAGEHIDE NEW');expect(row.loaded.document.revision).toBe(row.sameRevision?7:8);expect(row.removed).toBe(true);}
});

test('workspace journal reconciliation updates the other branch atomically and preserves its later reload',async({context,page})=>{
 await openStoreHarness(page);const other=await context.newPage();await openStoreHarness(other);
 const a=await page.evaluate(async()=>{
  window.aStore=TypeDeformerWorkspaceStore.create();await aStore.startup();const project={app:'type-deformer',version:93,text:'TAB A ORIGINAL',params:{fontSize:100},document:{id:'doc-a',revision:1}};
  await aStore.save(project);const pinned=await aStore.checkpoint(project,'PINNED ORIGINAL');return {branch:aStore.inspect().branch,pinned:pinned.id};
 });
 const b=await other.evaluate(async()=>{
  window.bStore=TypeDeformerWorkspaceStore.create();await bStore.startup();const project={app:'type-deformer',version:93,text:'TAB B SAVED',params:{},document:{id:'doc-b',revision:1}};
  await bStore.save(project);bStore.emergency({...project,text:'TAB B EXIT NEW',document:{id:'doc-b',revision:2}});return {...bStore.inspect(),raw:localStorage.getItem('typeDeformer.workspace.emergency.'+bStore.inspect().writer)};
 });
 const reconciled=await page.evaluate(async({a,b})=>{
  const reader=TypeDeformerWorkspaceStore.create();try{const loaded=await reader.startup(),all=await reader.list();return {loaded:loaded.project.text,a:all.find(r=>r.id===a.branch).project.text,b:all.find(r=>r.id===b.branch),pinned:all.find(r=>r.id===a.pinned).project,journal:localStorage.getItem('typeDeformer.workspace.emergency.'+b.writer)};}finally{reader.close();}
 },{a,b});
 expect(reconciled.loaded).toBe('TAB A ORIGINAL');expect(reconciled.a).toBe('TAB A ORIGINAL');expect(reconciled.pinned.params.fontSize).toBe(100);expect(reconciled.b.project.text).toBe('TAB B EXIT NEW');expect(reconciled.b.previous.text).toBe('TAB B SAVED');expect(reconciled.journal).toBeNull();
 const replayed=await page.evaluate(async(b)=>{localStorage.setItem('typeDeformer.workspace.emergency.'+b.writer,b.raw);const reader=TypeDeformerWorkspaceStore.create();try{await reader.startup();const all=await reader.list();return {previous:all.find(r=>r.id===b.branch).previous.text,pins:all.filter(r=>r.kind==='recovery'&&r.project.text==='TAB B EXIT NEW').length};}finally{reader.close();}},b);
 expect(replayed).toEqual({previous:'TAB B SAVED',pins:1});
 await other.reload();await other.waitForFunction(()=>window.TypeDeformerWorkspaceStore);
 expect(await other.evaluate(async()=>{const reader=TypeDeformerWorkspaceStore.create();try{return (await reader.startup()).project.text;}finally{reader.close();}})).toBe('TAB B EXIT NEW');
 // A legacy journal with an older timestamp is pinned but cannot replace a
 // newer document belonging to the same branch.
 const older=await page.evaluate(async(b)=>{
  const reader=TypeDeformerWorkspaceStore.create();try{const doc=(await reader.list()).find(r=>r.kind==='document'&&r.id===b.branch);localStorage.setItem('typeDeformer.workspace.emergency.old-writer',JSON.stringify({branch:b.branch,writer:'old-writer',savedAt:doc.savedAt-100,project:{app:'type-deformer',version:92,text:'OLDER LEGACY EXIT',params:{}}}));await reader.startup();const all=await reader.list();return {current:all.find(r=>r.kind==='document'&&r.id===b.branch).project.text,olderPinned:all.some(r=>r.kind==='recovery'&&r.project.text==='OLDER LEGACY EXIT')};}finally{reader.close();}
 },b);
 expect(older).toEqual({current:'TAB B EXIT NEW',olderPinned:true});
});

test('workspace journal abort keeps the journal and prior document until the entire reconciliation commits',async({page})=>{
 await openStoreHarness(page);
 const result=await page.evaluate(async()=>{
  const s=TypeDeformerWorkspaceStore.create();await s.startup();const prior={app:'type-deformer',version:93,text:'DURABLE BEFORE',params:{},document:{id:'atomic-doc',revision:1}};await s.save(prior);s.emergency({...prior,text:'JOURNAL AFTER',document:{id:'atomic-doc',revision:2}});
  const key='typeDeformer.workspace.emergency.'+s.inspect().writer,raw=localStorage.getItem(key),original=IDBObjectStore.prototype.put;let failed='';
  IDBObjectStore.prototype.put=function(value,...rest){if(this.name==='documents'&&value.project.text==='JOURNAL AFTER')throw new DOMException('Injected reconciliation abort','QuotaExceededError');return original.call(this,value,...rest);};
  try{await s.startup();}catch(error){failed=error.name;}finally{IDBObjectStore.prototype.put=original;}
  const afterFailure=await s.list(),journalRetained=localStorage.getItem(key)===raw;
  const reloaded=await s.startup(),afterRetry=await s.list();s.close();
  return {failed,journalRetained,prior:afterFailure.find(r=>r.kind==='document').project.text,abortedPins:afterFailure.filter(r=>r.kind==='recovery'&&r.project.text==='JOURNAL AFTER').length,reloaded:reloaded.project.text,pins:afterRetry.filter(r=>r.kind==='recovery'&&r.project.text==='JOURNAL AFTER').length,removed:localStorage.getItem(key)===null};
 });
 expect(result).toEqual({failed:'QuotaExceededError',journalRetained:true,prior:'DURABLE BEFORE',abortedPins:0,reloaded:'JOURNAL AFTER',pins:1,removed:true});
});

test('workspace journal written during reconciliation survives the older transaction completion',async({page})=>{
 await openStoreHarness(page);
 const result=await page.evaluate(async()=>{
  const writer=TypeDeformerWorkspaceStore.create();await writer.startup();const project={app:'type-deformer',version:93,text:'FIRST',params:{},document:{id:'racing-journal',revision:1}};await writer.save(project);writer.emergency({...project,text:'SECOND',document:{id:'racing-journal',revision:2}});
  const reader=TypeDeformerWorkspaceStore.create(),original=IDBObjectStore.prototype.put;let release=false,started;const blocked=new Promise(resolve=>started=resolve);
  IDBObjectStore.prototype.put=function(value,...rest){const req=original.call(this,value,...rest);if(this.name==='documents'&&value.project.text==='SECOND'){const store=this;function keepAlive(){const hold=store.get('__hold_transaction__');hold.onsuccess=()=>{if(!release)keepAlive();};}keepAlive();started();}return req;};
  const reconciling=reader.startup();await blocked;writer.emergency({...project,text:'THIRD',document:{id:'racing-journal',revision:3}});const key='typeDeformer.workspace.emergency.'+writer.inspect().writer,raw=localStorage.getItem(key);release=true;
  try{await reconciling;}finally{IDBObjectStore.prototype.put=original;}
  const retained=localStorage.getItem(key)===raw,loaded=await reader.startup(),all=await reader.list();writer.close();reader.close();return {retained,text:loaded.project.text,previous:loaded.previous.text,pins:all.filter(r=>r.kind==='recovery').map(r=>r.project.text).sort(),removed:localStorage.getItem(key)===null};
 });
 expect(result).toEqual({retained:true,text:'THIRD',previous:'SECOND',pins:['SECOND','THIRD'],removed:true});
});

test('workspace journal reconciled by another store cannot be overwritten by an older queued save',async({page})=>{
 await openStoreHarness(page);
 const result=await page.evaluate(async()=>{
  const writer=TypeDeformerWorkspaceStore.create();await writer.startup();const project={app:'type-deformer',version:93,text:'QUEUED OLD',params:{},document:{id:'queued-after-recovery',revision:1}};
  const original=crypto.subtle.digest;let unblock,started;const gate=new Promise(resolve=>unblock=resolve),blocked=new Promise(resolve=>started=resolve);
  crypto.subtle.digest=function(...args){const digest=original.apply(this,args);started();return digest.then(async value=>{await gate;return value;});};
  const holding=writer.checkpoint(project,'HOLD QUEUE');await blocked;crypto.subtle.digest=original;
  const queued=writer.save(project);writer.emergency({...project,text:'RECOVERED NEW',document:{id:'queued-after-recovery',revision:2}});
  const reader=TypeDeformerWorkspaceStore.create();const recovered=await reader.startup();unblock();await holding;await queued;
  const current=(await reader.list()).find(r=>r.kind==='document'&&r.id===writer.inspect().branch);writer.close();reader.close();return {recovered:recovered.project.text,current:current.project.text};
 });
 expect(result).toEqual({recovered:'RECOVERED NEW',current:'RECOVERED NEW'});
});

test('workspace checkpoint captures queued input immediately and deduplicates identical durable records',async({page})=>{
 await openStoreHarness(page);
 const result=await page.evaluate(async()=>{
  const s=TypeDeformerWorkspaceStore.create();await s.startup();const project={app:'type-deformer',version:93,text:'CHECKPOINT ORIGINAL',params:{fontSize:100},document:{id:'snapshot-doc',revision:1}},history={undo:[{text:'UNDO ORIGINAL'}],redo:[]};
  const original=IDBObjectStore.prototype.put;let release=false,started;const blocked=new Promise(resolve=>started=resolve);
  IDBObjectStore.prototype.put=function(value,...rest){const req=original.call(this,value,...rest);if(this.name==='documents'){const store=this;function keepAlive(){const hold=store.get('__hold_transaction__');hold.onsuccess=()=>{if(!release)keepAlive();};}keepAlive();started();}return req;};
  const save=s.save(project);await blocked;const savedInput=JSON.parse(JSON.stringify(project)),savedHistory=JSON.parse(JSON.stringify(history));const queued=s.checkpoint(project,'SAME REASON',history);
  project.text='MUTATED LATER';project.params.fontSize=52;history.undo[0].text='MUTATED HISTORY';release=true;try{await save;}finally{IDBObjectStore.prototype.put=original;}
  const first=await queued,again=await s.checkpoint(savedInput,'SAME REASON',savedHistory);s.close();
  const restarted=TypeDeformerWorkspaceStore.create();await restarted.startup();const afterRestart=await restarted.checkpoint(savedInput,'SAME REASON',savedHistory),otherHistory=await restarted.checkpoint(savedInput,'SAME REASON',{undo:[],redo:[]}),otherReason=await restarted.checkpoint(savedInput,'OTHER REASON',savedHistory),all=await restarted.list();restarted.close();
  return {project:first.project,history:first.history,ids:[first.id,again.id,afterRestart.id],otherHistory:otherHistory.id,otherReason:otherReason.id,count:all.filter(r=>r.kind==='recovery').length};
 });
 expect(result.project.text).toBe('CHECKPOINT ORIGINAL');expect(result.project.params.fontSize).toBe(100);expect(result.history.undo[0].text).toBe('UNDO ORIGINAL');expect(new Set(result.ids).size).toBe(1);expect(result.otherHistory).not.toBe(result.ids[0]);expect(result.otherReason).not.toBe(result.ids[0]);expect(result.count).toBe(3);
});
