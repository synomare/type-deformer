import test from 'node:test';
import assert from 'node:assert/strict';
import { autosaveFixture } from './autosave-fixture.mjs';
const saved = text => JSON.stringify({ app: 'type-deformer', version: 50, text, params: {}, letters: [] });

test('failed primary write retains both stored revisions, stays dirty and exposes a persistent error', () => {
  const f = autosaveFixture(), { c } = f;
  f.memory.set(c.AUTOSAVE_KEY, saved('前の作品')); f.memory.set(c.AUTOSAVE_BACKUP_KEY, saved('復旧用'));
  f.failWrite('QuotaExceededError', c.AUTOSAVE_KEY); c.saveAutosave();
  assert.equal(f.memory.get(c.AUTOSAVE_BACKUP_KEY), saved('復旧用'));
  assert.equal(f.memory.get(c.AUTOSAVE_KEY), saved('前の作品')); assert.equal(c.autosaveDirty, true);
  assert.equal(f.elements.autosaveStatus.dataset.state, 'error');
  assert.match(f.elements.autosaveStatus.textContent, /容量|保存.*許可/);
});

test('backup-only failure distinguishes saved latest work and can retry without another primary write', () => {
  const f = autosaveFixture(), { c } = f;
  f.memory.set(c.AUTOSAVE_KEY, saved('前の作品')); f.memory.set(c.AUTOSAVE_BACKUP_KEY, saved('復旧用'));
  f.failWrite('QuotaExceededError', c.AUTOSAVE_BACKUP_KEY); c.saveAutosave();
  assert.equal(f.memory.get(c.AUTOSAVE_KEY), JSON.stringify(c.data)); assert.equal(c.autosaveDirty, false);
  assert.equal(f.elements.autosaveStatus.dataset.state, 'warning');
  const primaryWrites = f.writes.filter(([key]) => key === c.AUTOSAVE_KEY).length;
  f.failWrite(null); c.retryAutosave();
  assert.equal(f.memory.get(c.AUTOSAVE_BACKUP_KEY), saved('前の作品'));
  assert.equal(f.writes.filter(([key]) => key === c.AUTOSAVE_KEY).length, primaryWrites);
  assert.equal(f.elements.autosaveStatus.dataset.state, 'saved');
});

test('normal save, no-op and subsequent edit give accurate status and rotate only the prior valid revision', () => {
  const f = autosaveFixture(), { c } = f;
  c.saveAutosave(); assert.equal(c.autosaveDirty, false); assert.equal(f.elements.autosaveStatus.dataset.state, 'saved');
  const first = JSON.stringify(c.data), count = f.writes.length;
  c.markAutosaveDirty(); assert.equal(f.elements.autosaveStatus.dataset.state, 'pending');
  c.saveAutosave(); assert.equal(f.writes.length, count, 'same project does not rotate backup');
  c.data.text = 'さらに編集'; c.markAutosaveDirty(); c.saveAutosave();
  assert.equal(f.memory.get(c.AUTOSAVE_BACKUP_KEY), first);
  assert.equal(f.memory.get(c.AUTOSAVE_KEY), JSON.stringify(c.data));
  assert.equal(f.elements.autosaveIndicator.textContent, '保存済');
});

test('quota failures back off serialization and manual retry immediately recovers the latest draft', () => {
  const f = autosaveFixture(), { c } = f; f.failWrite('QuotaExceededError');
  c.startAutosave(); c.saveAutosave(); const count = f.serializations();
  for (let i = 0; i < 20; i++) { c.markAutosaveDirty(); c.scheduleAutosave(); c.saveAutosave(); }
  assert.equal(f.serializations(), count); assert.equal(f.timers.size, 0);
  assert.equal(f.elements.autosaveStatus.dataset.state, 'error');
  assert.equal(f.elements.btnMobileProject.textContent, 'Project !');
  assert.equal(f.elements.btnAutosaveRetry.hidden, false);
  c.data.text = '失敗後の変更'; f.failWrite(null);
  f.elements.btnAutosaveRetry.listeners.click();
  assert.equal(f.memory.get(c.AUTOSAVE_KEY), JSON.stringify(c.data));
  assert.equal(f.elements.autosaveStatus.dataset.state, 'saved');
  assert.equal(f.elements.btnAutosaveRetry.hidden, true); assert.equal(c.autosaveRetryAfter, 0);
});

test('security and serialization failures are distinct and never clear or misreport the dirty draft', () => {
  const f = autosaveFixture(), { c } = f; f.failRead('SecurityError');
  c.saveAutosave(); assert.match(f.elements.autosaveStatus.textContent, /アクセス/); assert.equal(c.autosaveDirty, true);
  assert.equal(f.writes.length, 0); f.failRead(null); c.data.circular = c.data; c.retryAutosave();
  assert.match(f.elements.autosaveStatus.textContent, /データを作成/); assert.equal(c.autosaveDirty, true);
  delete c.data.circular; c.retryAutosave(); assert.equal(c.autosaveDirty, false);
});

test('backup retry survives a later primary failure; latest edits do not display saved status', () => {
  const f = autosaveFixture(), { c } = f;
  f.memory.set(c.AUTOSAVE_KEY, saved('前')); f.failWrite('QuotaExceededError', c.AUTOSAVE_BACKUP_KEY); c.saveAutosave();
  const stored = f.memory.get(c.AUTOSAVE_KEY); c.data.text = '未保存'; c.markAutosaveDirty();
  assert.match(f.elements.autosaveStatus.textContent, /未保存の変更/);
  f.failWrite('QuotaExceededError', c.AUTOSAVE_KEY); c.retryAutosave();
  assert.equal(f.memory.get(c.AUTOSAVE_KEY), stored); assert.equal(f.memory.has(c.AUTOSAVE_BACKUP_KEY), false);
  assert.equal(f.elements.autosaveStatus.dataset.state, 'error');
  f.failWrite(null); c.retryAutosave();
  assert.equal(f.memory.get(c.AUTOSAVE_BACKUP_KEY), stored);
  assert.equal(f.memory.get(c.AUTOSAVE_KEY), JSON.stringify(c.data));
});

test('IME, playing motion and active input defer autosave; idle and lifecycle events use the same safe path', () => {
  const f = autosaveFixture(), { c } = f; c.startAutosave();
  c.textComposing = true; c.saveAutosave(true); assert.equal(f.serializations(), 0);
  assert.match(f.elements.autosaveStatus.textContent, /変換/);
  c.textComposing = false; c.compositionPlayRaf = 123;
  c.scheduleAutosave(); f.runTimer(); assert.equal(f.serializations(), 0);
  c.compositionPlayRaf = null; c.rebuildTimer = 1; c.document.activeElement = c.textInput;
  c.scheduleAutosave(); f.runTimer(); assert.equal(f.serializations(), 0); assert.equal(f.timers.size, 1);
  c.rebuildTimer = null; f.runTimer(); assert.equal(f.serializations(), 1);
  c.data.text = '閉じる前'; c.markAutosaveDirty(); c.scheduleAutosave(); f.events['window:pagehide']();
  assert.equal(f.timers.size, 0); assert.equal(f.memory.get(c.AUTOSAVE_KEY), JSON.stringify(c.data));
  c.autosaveSuspended = true; c.data.text = '新規への移行中'; c.markAutosaveDirty();
  const count = f.writes.length; c.document.hidden = true; f.events['document:visibilitychange']();
  assert.equal(f.writes.length, count);
});

test('idle callback handles are cancelled through the matching API and failures do not schedule tight loops', () => {
  const f = autosaveFixture(), { c } = f; const cancelled = [];
  let callback;
  c.window.requestIdleCallback = fn => { callback = fn; return 77; };
  c.window.cancelIdleCallback = id => cancelled.push(id);
  c.scheduleAutosave(); assert.equal(c.autosaveIdleKind, 'idle'); c.cancelScheduledAutosave();
  assert.deepEqual(cancelled, [77]);
  c.scheduleAutosave(); f.failWrite('QuotaExceededError'); callback();
  assert.equal(c.autosaveIdleHandle, null);
  for (let i = 0; i < 10; i++) { f.advance(120000); c.saveAutosave(); assert.ok(c.autosaveRetryAfter - c.Date.now() <= 120000); }
});

test('unreadable, future or inaccessible stored recovery data is never overwritten by the default document', () => {
  for (const raw of ['{broken', JSON.stringify({ app: 'type-deformer', params: {}, version: 9999 })]) {
    const f = autosaveFixture(), { c } = f; f.memory.set(c.AUTOSAVE_KEY, raw);
    assert.equal(c.tryRestoreAutosave(), false); assert.equal(c.autosaveRecoveryBlocked, true);
    c.startAutosave(); c.data.text = '新しく編集'; c.markAutosaveDirty(); c.retryAutosave();
    c.scheduleAutosave(); f.events['window:pagehide']();
    assert.equal(f.writes.length, 0); assert.equal(f.memory.get(c.AUTOSAVE_KEY), raw);
    assert.equal(f.elements.autosaveStatus.dataset.state, 'blocked');
  }
  const f = autosaveFixture(); f.failRead('SecurityError'); f.c.tryRestoreAutosave();
  f.failRead(null); f.c.saveAutosave(true); assert.equal(f.writes.length, 0);
});

test('backup restore is disclosed and protects the failed primary; clean primary restore remains writable', () => {
  const f = autosaveFixture(), { c } = f;
  f.memory.set(c.AUTOSAVE_KEY, '{broken'); f.memory.set(c.AUTOSAVE_BACKUP_KEY, saved('復旧する作品'));
  assert.equal(c.tryRestoreAutosave(), true); assert.equal(c.data.text, '復旧する作品');
  assert.equal(c.autosaveRecoveryBlocked, true); assert.match(f.elements.autosaveStatus.textContent, /バックアップから復元/);
  c.saveAutosave(true); assert.equal(f.memory.get(c.AUTOSAVE_KEY), '{broken');
  const clean = autosaveFixture(); clean.memory.set(clean.c.AUTOSAVE_KEY, saved('正常'));
  assert.equal(clean.c.tryRestoreAutosave(), true); assert.equal(clean.c.autosaveRecoveryBlocked, false);
  clean.c.data.text = '編集済み'; clean.c.markAutosaveDirty(); clean.c.saveAutosave();
  assert.equal(JSON.parse(clean.memory.get(clean.c.AUTOSAVE_KEY)).text, '編集済み');
});

test('unchanged pending/error messages do not repeatedly mutate the status live region', () => {
  const f = autosaveFixture(), { c } = f; c.markAutosaveDirty();
  let mutations = 0, text = f.elements.autosaveStatus.textContent;
  Object.defineProperty(f.elements.autosaveStatus, 'textContent', { get: () => text, set: value => { mutations++; text = value; } });
  for (let i = 0; i < 30; i++) c.markAutosaveDirty(); assert.equal(mutations, 0);
  f.failWrite('QuotaExceededError'); c.saveAutosave(); const errors = mutations;
  for (let i = 0; i < 30; i++) c.markAutosaveDirty(); assert.equal(mutations, errors);
});

test('startup strips every effect before loading, preserves raw recovery and does not overwrite it with a later plain boot', () => {
 const f=autosaveFixture(),{c}=f,heavy={app:'type-deformer',version:50,text:'残す原文',params:{fontSize:5000,textObjects:'untrusted layout'},letters:[{t:1,o:{tensorFiligree:{t:1,i:1}},mx:20}],composition:{enabled:true},lookMemory:{heavy:true}};
 const raw=JSON.stringify(heavy);f.memory.set(c.AUTOSAVE_KEY,raw);assert.equal(c.tryRestoreAutosave(),true);
 assert.equal(c.data.text,heavy.text);assert.equal(c.data.letters.length,0);assert.equal(Object.keys(c.data.params).length,0);assert.equal(c.data.composition.enabled,false);assert.equal(f.memory.get(c.AUTOSAVE_RECOVERY_KEY),raw);
 c.saveAutosave();c.tryRestoreAutosave();assert.equal(f.memory.get(c.AUTOSAVE_RECOVERY_KEY),raw);assert.equal(c.data.letters.length,0);
});
test('recovery write failure still starts plain and protects original data',()=>{
 const f=autosaveFixture(),{c}=f,raw=JSON.stringify({app:'type-deformer',version:50,text:'原文',params:{},letters:[{o:{x:{t:1}}}]});f.memory.set(c.AUTOSAVE_KEY,raw);f.failWrite('QuotaExceededError',c.AUTOSAVE_RECOVERY_KEY);
 assert.equal(c.tryRestoreAutosave(),true);assert.equal(c.data.letters.length,0);assert.equal(c.autosaveRecoveryBlocked,true);c.saveAutosave();assert.equal(f.memory.get(c.AUTOSAVE_KEY),raw);
});
test('refresh warning is independent of autosave success and performs no serialization',()=>{
 const f=autosaveFixture(),{c}=f;c.startAutosave();c.sessionHasChanges=false;let warnings=0;const event={preventDefault(){warnings++;}};
 f.events['window:beforeunload'](event);assert.equal(warnings,0);c.markAutosaveDirty();c.saveAutosave();const count=f.serializations();f.events['window:beforeunload'](event);assert.equal(warnings,1);assert.equal(event.returnValue,'');assert.equal(f.serializations(),count);
 c.autosaveSuspended=true;f.events['window:beforeunload'](event);assert.equal(warnings,1);
});
