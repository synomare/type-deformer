import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dictionaryContext = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(root, 'confuse-dictionary.js'), 'utf8'), dictionaryContext);
const dictionary = dictionaryContext.window.TYPE_DEFORMER_CONFUSE_DICTIONARY;
const classifierCode = '// BEGIN DETAILED BATCH TARGETS' + html.split('// BEGIN DETAILED BATCH TARGETS')[1].split('// END DETAILED BATCH TARGETS')[0];
const profileCode = html.slice(html.indexOf('      var batchProfiles = {};'), html.indexOf('      // Saved projects and URL payloads'));
function functionCode(name) {
  const found = html.match(new RegExp('      function ' + name + '\\([^]*?\\n      }'));
  assert.ok(found, name);
  return found[0];
}
function context(data = dictionary) {
  const c = vm.createContext({ CONFUSE_DATA: data, params: { stretchX: 1, rotation: 0, mode: 'organic', activeOperator: 'stretch' },
    sourceTarget: { mode: 'all', start: 0, end: 0, valid: false }, sourceParagraphs: [], renderedSourceText: '',
    textComposing: false, flushPendingTextRebuild() {}, toGraphemes: text => [...text],
    BATCH_PARAM_KEYS: ['stretchX', 'rotation', 'mode'], BATCH_PARAM_OPTIONS: { mode: ['organic', 'grid'] },
    BATCH_PARAM_LIMITS: { stretchX: [-2,8], rotation: [0,45] } });
  vm.runInContext('function unused() {}\n' + classifierCode + `
    var BATCH_TARGETS = createDetailedBatchTargets(function () { return CONFUSE_DATA; });
    var BATCH_PROFILE_KEYS = BATCH_TARGETS.definitions.filter(d => d.key !== 'all').map(d => d.key);
    var BATCH_PROFILE_LABELS = Object.fromEntries(BATCH_TARGETS.definitions.map(d => [d.key, d.label]));
  ` + profileCode, c);
  vm.runInContext(['sourceParagraphAt', 'sourceTargetBounds', 'sourceTargetSpanIndex', 'sourceTargetLabel', 'updateSourceTargetUI'].map(functionCode).join('\n'), c);
  return c;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('source-local layout fields override class profiles without contaminating identical glyph cache entries', () => {
  const c = context(); c.params.readingPressure = 2; c.params.currentBend = 2.4;
  c.batchProfiles.latin = { readingPressure: 3, currentBend: 5 };
  const a = { ch: 'A', localParams: { readingPressure: -2 } }, b = { ch: 'A', localParams: { currentBend: -8 } };
  const pa = c.batchProfileForKey('latin', a), pb = c.batchProfileForKey('latin', b);
  assert.equal(pa.readingPressure, -2); assert.equal(pa.currentBend, 5);
  assert.equal(pb.readingPressure, 3); assert.equal(pb.currentBend, -8);
  assert.equal(c.batchProfileForKey('latin', a), pa);
  c.batchProfiles.latin.currentBend = 7; assert.equal(pa.currentBend, 7, 'unmodified fields inherit live shared changes');
  a.localParams = { readingPressure: 4 }; assert.equal(c.batchProfileForKey('latin', a).readingPressure, 4);
  a.localParams = null; assert.equal(c.batchProfileForKey('latin', a), c.batchProfiles.latin);
});

test('registry: unique keys, valid parents, all 214 radical categories', () => {
  const c = context(), defs = c.BATCH_TARGETS.definitions;
  assert.equal(new Set(defs.map(d => d.key)).size, defs.length);
  assert.equal(defs.filter(d => d.key.startsWith('kanji.radical.')).length, 214);
  for (const d of defs) if (d.key !== 'all') assert.ok(c.BATCH_TARGETS.byKey[d.parent]);
  assert.equal(c.BATCH_TARGETS.matches('typo', 'A'), false);
  assert.equal(c.BATCH_TARGETS.matches('__proto__', 'A'), false);
  assert.equal(c.BATCH_TARGETS.family('한'), 'hangul');
  assert.equal(c.BATCH_TARGETS.matches('kanji', '한'), false);
  assert.equal(c.BATCH_TARGETS.matches('latin', '１'), false);
});

test('Latin case / width / vowel / consonant / combining accents', () => {
  const e = context().BATCH_TARGETS;
  for (const text of ['A','Ａ','Á','A\u0301']) assert.ok(e.matches('latin.vowel', text), text);
  for (const text of ['a','ａ','é','e\u0301']) assert.ok(e.matches('latin.lower', text), text);
  for (const text of ['B','Ｚ','ñ']) assert.ok(e.matches('latin.consonant', text), text);
  assert.ok(e.matches('latin.accent', 'e\u0301'));
  assert.ok(!e.matches('latin.accent', 'Ａ'));
  assert.ok(e.matches('latin.wide', 'Ａ'));
  assert.ok(!e.matches('latin.narrow', 'Ａ'));
});

test('kana: small / voiced / semi-voiced / rows / halfwidth / marks', () => {
  const e = context().BATCH_TARGETS;
  for (const text of ['が','か\u3099']) {
    assert.ok(e.matches('hira.voiced', text)); assert.ok(e.matches('hira.row.ka', text));
  }
  for (const text of ['ガ','ｶﾞ']) { assert.ok(e.matches('kata.voiced', text)); assert.ok(e.matches('kata.row.ka', text)); }
  for (const text of ['パ','ﾊﾟ']) assert.ok(e.matches('kata.semivoiced', text));
  assert.ok(e.matches('hira.small', 'ゃ'));
  assert.ok(!e.matches('hira.small', 'や'));
  for (const text of ['ッ','ｬ','ㇰ']) assert.ok(e.matches('kata.small', text), text);
  assert.ok(e.matches('kata.narrow', 'ｶﾞ'));
  assert.ok(e.matches('kata.marks', 'ー'));
  assert.ok(e.matches('hira.marks', 'ゞ'));
});

test('digits / punctuation / symbols use original Unicode character identity', () => {
  const e = context().BATCH_TARGETS;
  for (const text of ['2','２']) { assert.ok(e.matches('digit.even', text)); assert.ok(e.matches('digit.value.2', text)); }
  assert.ok(e.matches('digit', '٢'));
  assert.ok(!e.matches('digit.even', '٢')); // category explicitly says halfwidth/fullwidth 0–9
  assert.ok(e.matches('punct.open', '「'));
  assert.ok(e.matches('punct.close', '」'));
  assert.ok(e.matches('punct.quote', '“'));
  assert.ok(e.matches('punct.emphasis', '！'));
  assert.ok(e.matches('symbol.currency', '￥'));
  assert.ok(e.matches('symbol.math', '+'));
});

test('real bundled Unihan: stroke ranges, radical numbers, supplementary Han and IVS', () => {
  const e = context().BATCH_TARGETS;
  assert.ok(e.matches('kanji.strokes.1', '木'));
  assert.ok(e.matches('kanji.strokes.9', '海'));
  assert.ok(e.matches('kanji.radical.85', '海'));
  assert.ok(e.matches('kanji.radical.75', '林'));
  assert.ok(e.matches('kanji.radical.85', '海\u{E0100}'));
  assert.ok(e.matches('kanji', '𠮷'));
  for (const [ch, values] of Object.entries(dictionary.hanRadicalStroke).slice(0, 500)) {
    for (const value of values) assert.ok(e.matches('kanji.radical.' + parseInt(value, 10), ch), ch + ' ' + value);
  }
});

test('dictionary loading invalidates an earlier negative match and profile cache', () => {
  const c = context(null);
  c.batchProfiles['kanji.radical.85'] = { rotation: 32 };
  assert.ok(!c.BATCH_TARGETS.matches('kanji.radical.85', '海'));
  assert.equal(c.batchProfileForKey('kanji', '海').rotation, 0);
  c.CONFUSE_DATA = dictionary;
  assert.ok(c.BATCH_TARGETS.matches('kanji.radical.85', '海'));
  assert.equal(c.batchProfileForKey('kanji', '海').rotation, 32);
});

test('sparse overrides compose by priority while unrelated settings inherit the broad profile', () => {
  const c = context();
  c.batchProfiles.latin = { stretchX: 2, rotation: 1, mode: 'organic' };
  c.batchProfiles['latin.upper'] = { stretchX: 3 };
  c.batchProfiles['latin.vowel'] = { rotation: 25 };
  assert.equal(c.batchProfileForKey('latin','A').stretchX, 3);
  assert.equal(c.batchProfileForKey('latin','A').rotation, 25);
  assert.equal(c.batchProfileForKey('latin','B').rotation, 1);
  assert.equal(c.batchProfileForKey('latin','a').stretchX, 2);
  assert.equal(c.batchProfileForKey('latin.vowel').stretchX, 2);
  // Base updates flow through a cached overlay, without rendering allocations.
  c.batchProfiles.latin.mode = 'grid';
  assert.equal(c.batchProfileForKey('latin','A').mode, 'grid');
  assert.deepEqual(plain(c.copyBaseDeformProfile(c.batchProfileForKey('latin','A'))), {stretchX:3,rotation:25,mode:'grid'});
});

test('fine profile editing / reset / project-share-undo JSON roundtrip stay sparse', () => {
  const c = context(); c.activeBatchProfile = 'hira.small';
  c.editableBatchProfile().rotation = 18;
  assert.deepEqual(plain(c.batchProfiles['hira.small']), {rotation:18});
  const saved = c.cloneBatchProfiles();
  c.batchProfiles = c.normalizeBatchProfiles(saved);
  assert.deepEqual(plain(c.batchProfiles['hira.small']), {rotation:18});
  assert.equal(c.batchProfileForKey('hira','ゃ').rotation, 18);
  c.activeBatchProfile = 'hira'; c.editableBatchProfile().stretchX = 4;
  assert.equal(c.batchProfileForKey('hira','ゃ').stretchX, 4);
  delete c.batchProfiles['hira.small']; c.batchResolvedProfiles.clear();
  assert.equal(c.batchProfileForKey('hira','ゃ').rotation, 0);
  const old = c.normalizeBatchProfiles({latin:{stretchX:100,rotation:2,mode:'grid'}, typo:{rotation:1}});
  assert.equal(old.latin.stretchX, 8); assert.equal(old.latin.mode, 'grid'); assert.ok(!old.typo);
  const invalid = c.normalizeBatchProfiles({'latin.upper':{mode:'invalid',rotation:null},'hira.small':{rotation:'not a number'}});
  assert.deepEqual(plain(invalid), {});
});

test('batch apply/release: locked letters excluded, immutable source used, unknown selector fails closed', () => {
  const c = context();
  vm.runInContext(html.slice(html.indexOf('      var batchMatchers = {'), html.indexOf('      /* ---------------- per-letter state restore')), c);
  let history = 0;
  c.pushHistory = () => history++; c.scheduleEffectStatusUpdate = () => {}; c.schedule = () => {};
  c.operatorState = m => m.state; c.readOperatorState = m => m.state;
  const metric = (source, display, locked=false) => ({ locked, el:{dataset:{sourceText:source},textContent:display},state:{toggled:false} });
  c.metrics = [metric('A','字'),metric('E','E',true),metric('b','b'),metric('a','a')];
  c.batchToggle(c.batchMatchers['latin.upper']);
  assert.deepEqual(c.metrics.map(m => m.state.toggled), [true,false,false,false]);
  c.batchToggle(c.batchMatchers['latin.upper']);
  assert.deepEqual(c.metrics.map(m => m.state.toggled), [false,false,false,false]);
  c.batchToggle(undefined); assert.equal(history,2);
  assert.equal(c.matchingBatchMetrics(c.batchMatchers['latin.upper'],true).length,2);
});

test('integration routes glyph-specific parameters and Compose/Proof source identity', () => {
  const calls = [...html.matchAll(/batchProfileForKey\(([^\n;]*)/g)].map(m=>m[1]);
  for (const call of calls) if (call.includes('.batchKey')) assert.match(call, /\.batchKey, /);
  assert.ok(html.includes('sourceText: source.sourceText || source.ch'));
  assert.ok(html.includes('BATCH_TARGETS.matches(activeBatchProfile, batchSourceText(source))'));
  assert.ok(html.includes('Object.assign(copyBaseDeformProfile(batchProfileForKey(activeBatchProfile)), settings.values)'));
});

test('target selection/filtering preserves the current target and previews only matching source glyphs', () => {
  const c = context();
  const element = () => ({value:'',textContent:'',children:[],appendChild(child){this.children.push(child);}});
  const preview=element();
  const elements = {batchTargetPreview:preview};
  Object.assign(c,{batchFamilySelect:element(),batchGroupSelect:element(),batchTargetGroup:'',batchTargetSearch:element(),batchProfileSelect:element(),batchTargetOptionsSignature:'',
    document:{createElement:element,getElementById:id=>elements[id] || (elements[id]=element())},confuseDictionaryState:'ready'});
  vm.runInContext(functionCode('populateBatchTargetOptions') + functionCode('updateBatchTargetPreview'),c);
  c.activeBatchProfile='latin.upper'; c.batchTargetSearch.value='さんずい';
  c.populateBatchTargetOptions();
  assert.equal(c.batchProfileSelect.value,'latin.upper');
  assert.equal(c.batchFamilySelect.value,'latin');
  const options=c.batchProfileSelect.children.flatMap(child=>child.children.length?child.children:[child]);
  assert.ok(options.some(o=>o.value==='kanji.radical.85'));
  assert.ok(options.some(o=>o.value==='latin.upper'));
  c.updateBatchTargetPreview([{sourceText:'A'},{sourceText:'A'},{sourceText:'Ｅ'}]);
  assert.equal(preview.textContent,'該当 3文字 · 操作可能 3文字\nA Ｅ');
});

test('saved Han profiles load data without selecting Han; duplicate loads and failure are safe', async () => {
  const c = context(null); let loads=0, redraws=0, summaries=0;
  c.batchProfiles['kanji.radical.85']={rotation:20};
  c.batchDictionaryLoading=false;
  c.applyRandom=()=>redraws++; c.reapplyStretches=()=>{}; c.applyAllOperatorVisuals=()=>{};
  c.updateApplicationSummary=()=>summaries++;
  c.loadConfuseDictionary=()=>{loads++; return Promise.resolve().then(()=>{c.CONFUSE_DATA=dictionary;});};
  vm.runInContext(functionCode('ensureBatchDictionary'),c);
  c.ensureBatchDictionary(); c.ensureBatchDictionary();
  await new Promise(setImmediate);
  assert.equal(loads,1); assert.equal(redraws,1); assert.equal(summaries,1);
  assert.equal(c.batchProfileForKey('kanji','海').rotation,20);
  c.CONFUSE_DATA=null;
  c.loadConfuseDictionary=()=>Promise.reject(new Error('offline'));
  c.ensureBatchDictionary(); await new Promise(setImmediate);
  assert.equal(redraws,1); assert.equal(summaries,2); assert.equal(c.batchDictionaryLoading,false);
  assert.equal(c.BATCH_TARGETS.matches('kanji.radical.85','海'),false);
});

function targetUIContext() {
  const c = context();
  function element() {
    let text = '';
    return {value:'',disabled:false,hidden:false,children:[],attributes:{},
      get textContent(){return text;},set textContent(value){text=value;this.children=[];},
      appendChild(child){this.children.push(child);},setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];}};
  }
  const elements = {};
  Object.assign(c,{batchFamilySelect:element(),batchGroupSelect:element(),batchTargetGroup:'',batchTargetSearch:element(),batchProfileSelect:element(),batchTargetOptionsSignature:'',
    document:{createElement:element,getElementById:id=>id==='sourceParameterBlock' ? null : elements[id] || (elements[id]=element())},confuseDictionaryState:'ready',
    OPERATOR_DEFS:{stretch:{label:'Stretch'}},operatorState:m=>m.state,readOperatorState:m=>m.state,operatorAffectsMetric:m=>m.state.current>0 || m.state.manual!=null,
    scheduleEffectStatusUpdate(){},schedule(){},applyOperatorVisual(){},pushHistory(){},refreshBatchProfileControls(){},updateContextUI(){}});
  vm.runInContext(functionCode('populateBatchTargetOptions') + functionCode('updateBatchTargetPreview') + functionCode('setActiveBatchProfile')
    + html.slice(html.indexOf('      var batchMatchers = {'), html.indexOf('      /* ---------------- per-letter state restore')),c);
  return {c,elements};
}

test('group-first picker avoids mixing 214 radicals with stroke counts; search never changes the selected target', () => {
  const {c,elements}=targetUIContext();
  const options = () => c.batchProfileSelect.children.flatMap(child=>child.children.length?child.children:[child]);
  c.activeBatchProfile='kanji'; c.populateBatchTargetOptions();
  assert.deepEqual(options().map(o=>o.value),['kanji']);
  assert.equal(elements.batchProfileRow.hidden,true);
  c.batchTargetGroup=c.BATCH_TARGETS.byKey['kanji.strokes.1'].group; c.populateBatchTargetOptions();
  assert.equal(options().length,7); assert.equal(elements.batchProfileRow.hidden,false);
  assert.ok(!options().some(o=>o.value.startsWith('kanji.radical.')));
  c.batchTargetSearch.value='no-such-category'; c.populateBatchTargetOptions();
  assert.equal(c.batchProfileSelect.disabled,true);
  assert.equal(c.activeBatchProfile,'kanji');
  assert.match(elements.batchSearchStatus.textContent,/一致する分類がありません/);
  c.batchTargetSearch.value=''; c.populateBatchTargetOptions();
  assert.equal(c.batchProfileSelect.disabled,false);
  assert.equal(options().length,7);
});

test('explicit Apply and Release are idempotent and preserve locked and other-operator state', () => {
  const {c,elements}=targetUIContext(); let history=0;
  c.pushHistory=()=>history++;
  const metric=(text,locked=false)=>({el:{dataset:{sourceText:text},textContent:text},locked,state:{toggled:false,hovered:false,current:0,manual:null},other:{toggled:true,manual:7}});
  c.metrics=[metric('A'),metric('E',true),metric('b')]; c.activeBatchProfile='latin.upper';
  c.updateApplicationSummary();
  assert.equal(elements.btnApplyCurrentTarget.textContent,'1文字へ適用');
  assert.equal(elements.btnReleaseCurrentTarget.disabled,true);
  assert.match(elements.batchTargetPreview.textContent,/操作可能 1文字 · 固定中 1文字/);
  c.batchToggle(c.batchMatchers['latin.upper'],true);
  assert.equal(elements.btnApplyCurrentTarget.disabled,true);
  assert.equal(elements.btnApplyCurrentTarget.textContent,'適用済み');
  assert.equal(elements.btnReleaseCurrentTarget.disabled,false);
  c.batchToggle(c.batchMatchers['latin.upper'],true); assert.equal(history,1);
  c.metrics[0].manualX=3; c.metrics[0].state.manual=9;
  c.metrics[1].state.toggled=true; c.metrics[1].state.manual=11;
  c.batchToggle(c.batchMatchers['latin.upper'],false);
  assert.equal(c.metrics[0].state.toggled,false); assert.equal(c.metrics[0].state.manual,null); assert.equal(c.metrics[0].manualX,null);
  assert.equal(c.metrics[1].state.toggled,true); assert.equal(c.metrics[1].state.manual,11);
  assert.equal(c.metrics[0].other.toggled,true); assert.equal(c.metrics[0].other.manual,7);
  assert.equal(elements.btnReleaseCurrentTarget.disabled,true);
  c.batchToggle(c.batchMatchers['latin.upper'],false); assert.equal(history,2);
});

test('partial, empty, locked-only and dictionary-error states explain availability without changing glyphs', () => {
  const {c,elements}=targetUIContext();
  c.metrics=['A','E','I'].map((text,i)=>({el:{dataset:{sourceText:text},textContent:text},locked:false,state:{toggled:i===0,hovered:false,current:i===0?1:0,manual:null}}));
  c.activeBatchProfile='latin.vowel'; c.updateApplicationSummary();
  assert.equal(elements.btnApplyCurrentTarget.textContent,'残り2文字へ適用');
  const before=plain(c.metrics);
  c.setActiveBatchProfile('latin.upper'); assert.deepEqual(plain(c.metrics),before);
  c.metrics.forEach(m=>m.locked=true); c.updateApplicationSummary();
  assert.equal(elements.btnApplyCurrentTarget.disabled,true); assert.equal(elements.btnReleaseCurrentTarget.disabled,true);
  c.setActiveBatchProfile('hira.small');
  assert.equal(elements.btnApplyCurrentTarget.disabled,true);
  assert.match(elements.applicationQuickStatus.textContent,/該当する文字はありません/);
  c.CONFUSE_DATA=null; c.confuseDictionaryState='error'; c.setActiveBatchProfile('kanji.radical.85');
  assert.equal(elements.btnApplyCurrentTarget.disabled,true);
  assert.match(elements.applicationQuickStatus.textContent,/漢字辞書を読み込めない/);
});

test('workflow wiring: target before direct gestures, preview before action, shortcuts select without applying', () => {
  assert.ok(html.includes("var applyBlocks = ['targetControlBlock', 'applicationControlBlock', 'contextLensBlock']"));
  const target=html.slice(html.indexOf('<div id="targetControlBlock">'),html.indexOf('<div id="operatorPanelsBlock">'));
  assert.ok(target.indexOf('id="batchTargetPreview"')<target.indexOf('id="targetActionSlot"'));
  assert.ok(target.indexOf('id="targetActionSlot"')<target.indexOf('id="batchProfileSettings"'));
  assert.ok(html.includes("document.getElementById('targetActionSlot').appendChild(document.getElementById('applicationQuick'))"));
  const wiring=html.slice(html.indexOf("document.querySelectorAll('[data-batch]')"),html.indexOf("document.getElementById('btnApplyCurrentTarget').addEventListener"));
  assert.ok(wiring.includes('setActiveBatchProfile(btn.dataset.batch)')); assert.ok(!wiring.includes('batchToggle('));
  assert.ok(html.includes('min-height: 48px; white-space: normal'));
  const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
  const touchInputRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(match => /^\s*font-size:\s*16px;\s*$/.test(match[2]))
    .map(match => match[1].split(',').map(selector => selector.trim()));
  for (const id of ['pBatchSearch', 'pBatchFamily', 'pBatchGroup', 'pBatchProfile', 'pSourceScope', 'pSourceParameterMode']) {
    assert.ok(touchInputRules.some(selectors => selectors.includes('#' + id)), id + ' retains a 16px mobile input rule');
  }
});

test('source range intersects real Unicode classification; locked and outside glyphs remain unchanged', () => {
  const { c, elements } = targetUIContext();
  c.renderedSourceText = 'AがB\nEかG'; c.sourceParagraphs = [{ start: 0, end: 3 }, { start: 4, end: 7 }];
  c.sourceTarget = { mode: 'paragraph', start: 4, end: 5, valid: true };
  c.metrics = [...c.renderedSourceText].flatMap((text, i) => text === '\n' ? [] : [{
    el: { dataset: { sourceText: text, sourceStart: String(i), sourceEnd: String(i + 1) }, textContent: text },
    locked: text === 'G', state: { toggled: false, hovered: false, current: 0, manual: null }
  }]);
  c.activeBatchProfile = 'latin.upper'; c.updateApplicationSummary();
  assert.match(elements.applicationQuickTitle.textContent, /段落 2/);
  assert.equal(elements.btnApplyCurrentTarget.textContent, '1文字へ適用');
  c.batchToggle(c.batchMatchers['latin.upper'], true);
  assert.deepEqual(c.metrics.map(m => m.state.toggled), [false, false, false, true, false, false]);
  c.batchToggle(c.batchMatchers['latin.upper'], false);
  assert.ok(c.metrics.every(m => !m.state.toggled));
  c.activeBatchProfile = 'hira'; c.batchToggle(c.batchMatchers.hira, true);
  assert.deepEqual(c.metrics.filter(m => m.state.toggled).map(m => m.el.dataset.sourceText), ['か']);
});

test('unselected or malformed source range cannot enable Apply or Release or silently target All', () => {
  const { c, elements } = targetUIContext();
  c.renderedSourceText = 'A'; c.sourceParagraphs = [{ start: 0, end: 1 }]; c.activeBatchProfile = 'all';
  c.metrics = [{ el: { dataset: { sourceText: 'A', sourceStart: '0', sourceEnd: '1' }, textContent: 'A' },
    locked: false, state: { toggled: true, current: 1, hovered: false, manual: null } }];
  for (const target of [
    { mode: 'range', valid: false, start: 0, end: 1 }, { mode: 'range', valid: true, start: 0, end: 0 },
    { mode: 'range', valid: true, start: -1, end: 1 }, { mode: 'range', valid: true, start: 0, end: 99 },
    { mode: 'range', valid: true, start: NaN, end: 1 }, { mode: 'unknown', valid: true, start: 0, end: 1 }
  ]) {
    c.sourceTarget = target; c.updateApplicationSummary();
    assert.equal(elements.btnApplyCurrentTarget.disabled, true); assert.equal(elements.btnReleaseCurrentTarget.disabled, true);
    assert.match(elements.sourceTargetPreview.textContent, /全文へは切り替わりません/);
    c.batchToggle(c.batchMatchers.all, false); assert.equal(c.metrics[0].state.toggled, true);
  }
});

test('unchanged scope status does not repeatedly mutate its polite live region', () => {
  const { c, elements } = targetUIContext();
  c.renderedSourceText = 'AB'; c.sourceParagraphs = [{ start: 0, end: 2 }];
  c.sourceTarget = { mode: 'range', start: 0, end: 1, valid: true };
  let writes = 0, text = '';
  elements.sourceTargetPreview = { get textContent() { return text; }, set textContent(value) { writes++; text = value; } };
  c.updateSourceTargetUI(); c.updateSourceTargetUI();
  assert.equal(writes, 1);
  c.sourceTarget.end = 2; c.updateSourceTargetUI(); assert.equal(writes, 2);
  c.sourceTarget.valid = false; c.updateSourceTargetUI(); c.updateSourceTargetUI(); assert.equal(writes, 3);
});
