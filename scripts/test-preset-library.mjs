import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
const c = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../assets/presets/atlas-v66.js', import.meta.url), 'utf8'), c);
vm.runInContext(fs.readFileSync(new URL('../assets/presets/atlas-v81.js', import.meta.url), 'utf8'), c);
vm.runInContext(fs.readFileSync(new URL('../assets/presets/atlas-v82.js', import.meta.url), 'utf8'), c);
vm.runInContext(fs.readFileSync(new URL('../assets/presets/atlas-v83.js', import.meta.url), 'utf8'), c);
vm.runInContext(fs.readFileSync(new URL('../assets/presets/atlas-v84.js', import.meta.url), 'utf8'), c);
vm.runInContext(fs.readFileSync(new URL('../assets/presets/atlas-v85.js', import.meta.url), 'utf8'), c);
vm.runInContext(fs.readFileSync(new URL('../assets/presets/atlas-overdrive-240.js', import.meta.url), 'utf8'), c);
vm.runInContext(fs.readFileSync(new URL('../assets/presets/atlas-v86.js', import.meta.url), 'utf8'), c);
vm.runInContext(fs.readFileSync(new URL('../assets/presets/atlas-v87.js', import.meta.url), 'utf8'), c);
vm.runInContext(fs.readFileSync(new URL('../assets/presets/atlas-v88.js', import.meta.url), 'utf8'), c);
vm.runInContext(fs.readFileSync(new URL('../assets/presets/atlas-v89.js', import.meta.url), 'utf8'), c);
vm.runInContext(fs.readFileSync(new URL('../assets/presets/atlas-v90.js', import.meta.url), 'utf8'), c);
vm.runInContext(fs.readFileSync(new URL('../assets/presets/atlas-v91.js', import.meta.url), 'utf8'), c);
vm.runInContext(fs.readFileSync(new URL('../preset-library.js', import.meta.url), 'utf8'), c);
const library = c.TypeDeformerPresets;
const original = library.recipes.filter(recipe => recipe.n <= 120);
const added = library.recipes.filter(recipe => recipe.added === '2026-09-08');
const bodies = library.recipes.filter(recipe => recipe.projectVersion === 82);
const plain = value => JSON.parse(JSON.stringify(value));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const loaderSource = fs.readFileSync(new URL('../preset-loader.js', import.meta.url), 'utf8').replaceAll('\r\n', '\n');

test('all 120 reconstructed projects match the original rendered atlas fingerprints', () => {
  assert.equal(original.length, 120);
  assert.equal(new Set(original.map(r => r.family)).size, 12);
  assert.equal(new Set(original.map(r => r.id)).size, 120);
  assert.equal(new Set(original.flatMap(r => r.operators)).size, 59);
  for (const recipe of original) {
    const project = library.project(recipe.id);
    const hash = crypto.createHash('sha256').update(JSON.stringify(canonical(project))).digest('hex');
    assert.equal(hash, recipe.projectHash, recipe.id);
    assert.ok(fs.statSync(new URL('../assets/presets/' + recipe.id + '.jpg', import.meta.url)).size > 1000, recipe.id);
  }
});

test('family, featured, Japanese, normalized full-width and combined search stay consistent', () => {
  for (const family of library.families) {
    const isAdded = added.some(recipe => recipe.family === family.id);
    assert.equal(library.search('', family.id, false).length, family.id === 'body-excess' ? 8 : family.id === 'body-ramified' ? 6 : family.id === 'body-folded' ? 6 : family.id === 'body-letterform' ? 6 : family.id === 'body-metamorphic' ? 6 : family.id === 'gravity-lens' ? 4 : family.id === 'liquid-rope' ? 4 : family.id === 'wulff-body' ? 4 : family.id === 'repulsive-curves' ? 4 : family.id === 'wasserstein-letters' ? 4 : isAdded ? 6 : 10, family.id);
  }
  assert.equal(library.search('', '', true).length, 148);
  assert.equal(library.search('', '', false, '2026-09-08').length, 24);
  assert.equal(library.search('', '', true, '2026-09-08').length, 12);
  assert.equal(library.search('', original[0].family, false, '2026-09-08').length, 0);
  assert.equal(library.search(added[0].id, added[0].family, false, '2026-09-08')[0].id, added[0].id);
  assert.equal(library.search('ｃｈｒｏｍｅ', 'metal', false).length, 10);
  assert.equal(library.search('鋼 棘', '', false)[0].id, '001-steel-thorns');
  assert.equal(library.search('この名前は存在しない', '', false).length, 0);
});

test('current-text application preserves source, variable font, pages, objects, grid cells, output preferences and Look Memory', () => {
  const current = { text: 'Á\n骨', params: { fontFamily: 'My variable font', fontAxes: '{"wght":533}', fontSize: 122,
    textObjects: '[{"id":"text-1","start":0,"end":4}]', pageLayout: 'pages', pageDepth: 20,
    gridEnabled: true, abW: 810, abH: 1200, exportScale: 3, ink: '#ff0000', paper: '#000000' },
    letters: [{ t: 0, l: 1, p: { chromeVoltage: 0 }, o: { rotate: { t: 1, i: .3 } }, gc: 7 }, { t: 0, l: 0, i: 0 }],
    lookMemory: { slots: [{ name: 'Keep me', state: { text: '保存' } }, null, null, null] },
    composition: { enabled: true }, batchProfiles: { latin: { chromeVoltage: 0 } } };
  const before = JSON.stringify(current);
  const result = plain(library.prepare('001-steel-thorns', current, 'current', ['Á', '骨']));
  assert.equal(result.text, current.text);
  for (const key of ['fontFamily', 'fontAxes', 'fontSize', 'textObjects', 'pageLayout', 'pageDepth', 'gridEnabled', 'abW', 'abH', 'exportScale']) {
    assert.equal(result.params[key], current.params[key], key);
  }
  assert.deepEqual(result.lookMemory, current.lookMemory);
  assert.equal(result.letters[0].gc, 7); assert.equal(result.letters[0].p, undefined);
  assert.deepEqual(Object.keys(result.letters[1].o).sort(), ['chromeReliquary', 'skew', 'thornCrown']);
  assert.equal(result.letters[0].l, 0);
  assert.equal(result.composition.enabled, false); assert.deepEqual(result.batchProfiles, {});
  assert.equal(result.params.paper, '#0c1018');
  assert.deepEqual(JSON.parse(result.params.frozenMoment).targets.map(t => t.text), ['Á', '骨']);
  assert.equal(JSON.stringify(current), before);
  result.letters[0].o.chromeReliquary.t = 0;
  assert.equal(result.letters[1].o.chromeReliquary.t, 1);
  assert.equal(library.project('001-steel-thorns').letters[0].o.chromeReliquary.t, 1);
});

test('example application restores the original source and layout while retaining saved Looks', () => {
  const current = { text: 'ユーザーの文', params: { abW: 300 }, letters: [], lookMemory: { slots: [{ name: 'A' }] } };
  // Look up by number so the fixture does not depend on a translated slug.
  const recipe = library.recipes.find(r => r.n === 111);
  const example = plain(library.prepare(recipe.id, current, 'example', []));
  assert.equal(example.text, recipe.text);
  assert.equal(example.params.abW, 1200);
  assert.deepEqual(example.lookMemory, current.lookMemory);
  assert.equal(library.project('missing'), null);
  assert.throws(() => library.prepare(recipe.id, { ...current, letters: [{}] }, 'current', []), /文字の更新/);
});

test('editor integration records a document Undo, protects pending IME and retains prior history', () => {
  const applied = [];
  const context = vm.createContext({ window: { TypeDeformerPresets: library }, TypeDeformerPresets: library, textComposing: false,
    projectData: () => ({ text: '字', params: {}, letters: [{}], lookMemory: { slots: [] } }),
    metrics: [{ text: '字' }], batchSourceText: metric => metric.text,
    projectLoadError: () => '', undoStack: ['previous'], redoStack: ['future'], pendingControlHistory: 1,
    snapDocumentState: () => ({ kind: 'source', text: '字', artwork: 'original' }),
    loadProject: project => { applied.push(project); vm.runInContext('undoStack = []; redoStack = []', context); return true; },
    recordHistorySnapshot: snapshot => { context.undoStack.push(snapshot); }, syncHistoryControls() {}, setMode() {}, markAutosaveDirty() {}, scheduleAutosave() {}
  });
  const fn = html.match(/^      function applyCombinationPreset\([^]*?^      \}/m)?.[0];
  assert.ok(fn); vm.runInContext(fn, context);
  assert.equal(context.applyCombinationPreset('001-steel-thorns', 'current'), true);
  assert.equal(context.undoStack[0], 'previous');
  assert.equal(context.undoStack[1].kind, 'source'); assert.equal(context.undoStack[1].text, '字');
  assert.equal(context.redoStack.length, 0); assert.equal(context.pendingControlHistory, null);
  assert.equal(applied[0].letters[0].o.chromeReliquary.t, 1);
  context.textComposing = true;
  assert.throws(() => context.applyCombinationPreset('001-steel-thorns', 'current'), /文字変換/);
  assert.equal(applied.length, 1);
  context.textComposing = false; context.metrics = [];
  assert.throws(() => context.applyCombinationPreset('001-steel-thorns', 'current'), /文字を入力/);
  context.metrics = [{ text: '字' }];
  assert.equal(context.applyCombinationPreset(added[0].id, 'example'), true);
  assert.equal(applied.length, 2);
  assert.equal(applied[1].version, 81);
  assert.equal(context.undoStack[0], 'previous');
  assert.equal(context.undoStack.length, 3);
  assert.equal(context.undoStack[2].text, '字');
  assert.equal(context.redoStack.length, 0);
});


test('the 24 new rendered projects extend the catalog without sharing IDs or changing the original project version', () => {
  assert.equal(library.recipes.length, 436);
  assert.equal(library.families.length, 50);
  assert.equal(new Set(library.recipes.map(recipe => recipe.id)).size, 436);
  assert.equal(new Set(library.families.map(family => family.id)).size, 50);
  assert.equal(added.length, 24);
  assert.equal(new Set(added.map(recipe => recipe.family)).size, 4);
  assert.deepEqual(plain(added.map(recipe => recipe.n)), Array.from({ length: 24 }, (_, n) => 121 + n));
  assert.equal(c.TypeDeformerPresetData.projectVersion, 66);
  for (const recipe of original) assert.equal(library.project(recipe.id).version, 66);
  for (const recipe of added) {
    assert.equal(recipe.projectVersion, 81, recipe.id);
    const project = library.project(recipe.id);
    assert.equal(project.version, 81, recipe.id);
    const hash = crypto.createHash('sha256').update(JSON.stringify(canonical(project))).digest('hex');
    assert.equal(hash, recipe.projectHash, recipe.id);
    assert.ok(fs.statSync(new URL('../assets/presets/' + recipe.id + '.jpg', import.meta.url)).size > 1000, recipe.id);
  }
  const oldScript = loaderSource.indexOf("'assets/presets/atlas-v66.js'");
  const newScript = loaderSource.indexOf("'assets/presets/atlas-v81.js'");
  const libraryScript = loaderSource.indexOf("'preset-library.js'");
  assert.ok(oldScript >= 0 && newScript > oldScript && libraryScript > newScript);
  assert.equal(html.includes('src="assets/presets/atlas-v66.js"'), false);
  assert.match(html, /src="preset-loader\.js"/);
});

test('new recipes preserve the current source on Apply and reconstruct the complete sample on Example', () => {
  const current = { text: '文字\nÁ', params: { fontFamily: 'Source font', fontAxes: '{"wght":420}',
    abW: 600, abH: 900, textObjects: '[{"id":"object-1"}]', exportScale: 2 },
    letters: [{ gc: 3 }, {}, {}], lookMemory: { slots: [{ name: 'Saved' }] } };
  const before = JSON.stringify(current);
  for (const recipe of added) {
    const applied = plain(library.prepare(recipe.id, current, 'current', ['文', '字', 'Á']));
    assert.equal(applied.version, 81);
    assert.equal(applied.text, current.text);
    for (const key of Object.keys(current.params)) assert.equal(applied.params[key], current.params[key], recipe.id + ':' + key);
    assert.equal(applied.letters.length, 3);
    assert.equal(applied.letters[0].gc, 3);
    assert.deepEqual(JSON.parse(applied.params.frozenMoment).targets.map(target => target.text), ['文', '字', 'Á']);
    assert.deepEqual(applied.lookMemory, current.lookMemory);
    const sample = plain(library.prepare(recipe.id, current, 'example', []));
    assert.deepEqual(sample, { ...plain(library.project(recipe.id)), lookMemory: current.lookMemory });
  }
  assert.equal(JSON.stringify(current), before);
});

function mountLibrary() {
  const elements = new Map();
  const document = { activeElement: null, getElementById: id => elements.get(id), createElement: tag => new Element(tag) };
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.events = {};
      this.value = ''; this.textContent = ''; this.isConnected = true;
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); }
    replaceChildren(...children) { this.children = children; }
    insertAdjacentElement(position, child) { this.adjacent = { position, child }; return child; }
    querySelectorAll() { return this.children.filter(child => child.tagName === 'button' && child.dataset.presetId); }
    addEventListener(type, callback) { (this.events[type] ||= []).push(callback); }
    async dispatch(type, event = {}) { await Promise.all((this.events[type] || []).map(callback => callback({ stopPropagation() {}, preventDefault() {}, ...event }))); }
    closest(selector) { return selector === 'button[data-preset-id]' && this.dataset.presetId ? this : null; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; return this.dispatch('close'); }
  }
  for (const match of html.matchAll(/id="((?:presetLibrary|btnPresetLibrary)[^"]*)"/g)) elements.set(match[1], new Element());
  document.activeElement = elements.get('btnPresetLibrary');
  const context = vm.createContext({ document, requestAnimationFrame: callback => callback() });
  for (const file of ['assets/presets/atlas-v66.js', 'assets/presets/atlas-v81.js', 'assets/presets/atlas-v82.js', 'assets/presets/atlas-v83.js', 'assets/presets/atlas-v84.js', 'assets/presets/atlas-v85.js', 'assets/presets/atlas-overdrive-240.js', 'assets/presets/atlas-v86.js', 'assets/presets/atlas-v87.js', 'assets/presets/atlas-v88.js', 'assets/presets/atlas-v89.js', 'assets/presets/atlas-v90.js', 'assets/presets/atlas-v91.js', 'preset-library.js']) {
    vm.runInContext(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'), context);
  }
  const selected = [], applied = [];
  const controller = context.TypeDeformerPresets.mount({ select: id => selected.push(id), apply: (id, mode) => applied.push({ id, mode }) });
  return { elements, selected, applied, controller, document };
}

test('the library opens on new work and derives every count from its loaded recipes', async () => {
  const { elements, selected, applied, controller, document } = mountLibrary();
  const get = id => elements.get(id);
  controller.open();
  assert.equal(get('btnPresetLibrary').textContent, '436 Presets / 画像から選ぶ');
  assert.equal(get('presetLibraryTitle').textContent, '436のエフェクトプリセット');
  assert.equal(get('presetLibraryFamilies').textContent, 'COMBINATION LIBRARY · 50 FAMILIES');
  assert.equal(get('btnPresetLibraryNew').textContent, '新作4案');
  assert.equal(get('btnPresetLibraryFeatured').textContent, '厳選148案');
  assert.equal(get('btnPresetLibraryAll').textContent, '全436案');
  assert.equal(get('presetLibraryCount').textContent, '4 / 436 presets');
  assert.equal(get('btnPresetLibraryNew').attributes['aria-pressed'], 'true');
  assert.equal(get('presetLibraryGrid').children.length, 4);
  assert.equal(selected.at(-1), library.recipes.find(r=>r.projectVersion===91).id);
  assert.equal(get('presetLibraryPreview').src, 'assets/presets/' + library.recipes.find(r=>r.projectVersion===91).id + '.jpg');
  for (const option of get('presetLibraryFamily').children) {
    const expected = library.search('', option.value, false).length;
    assert.ok(option.textContent.endsWith(' · ' + expected), option.textContent);
  }
  await get('btnPresetLibraryFeatured').dispatch('click');
  assert.equal(get('presetLibraryGrid').children.length, 48);
  assert.equal(get('btnPresetLibraryFeatured').attributes['aria-pressed'], 'true');
  await get('btnPresetLibraryAll').dispatch('click');
  assert.equal(get('presetLibraryGrid').children.length, 48);
  await get('btnPresetLibraryNew').dispatch('click');
  get('presetLibraryFamily').value = library.recipes.find(r=>r.projectVersion===91).family;
  await get('presetLibraryFamily').dispatch('change');
  assert.equal(get('presetLibraryGrid').children.length, 4);
  get('presetLibrarySearch').value = 'この名前は存在しない';
  await get('presetLibrarySearch').dispatch('input');
  assert.equal(get('presetLibraryCount').textContent, '0 / 436 presets');
  const reset = get('presetLibraryGrid').children[0].children[1];
  assert.equal(reset.textContent, '条件を解除して436案を表示');
  await reset.dispatch('click');
  assert.equal(get('presetLibraryGrid').children.length, 48);
  assert.equal(get('btnPresetLibraryAll').attributes['aria-pressed'], 'true');
  assert.equal(get('presetLibrarySearch').value, '');
  assert.equal(get('presetLibraryFamily').value, '');
  assert.equal(applied.length, 0);
  const card = get('presetLibraryGrid').children[0];
  await get('presetLibraryGrid').dispatch('click', { target: card });
  assert.equal(selected.at(-1), card.dataset.presetId);
  assert.equal(card.attributes['aria-pressed'], 'true');
  await get('btnPresetLibraryApply').dispatch('click');
  assert.deepEqual(applied, [{ id: card.dataset.presetId, mode: 'current' }]);
  assert.equal(get('presetLibrary').open, false);
  assert.equal(document.activeElement, get('btnPresetLibrary'));
  controller.open(bodies[2].id);
  await get('btnPresetLibraryExample').dispatch('click');
  assert.deepEqual(applied.at(-1), { id: bodies[2].id, mode: 'example' });
});


test('eight body presets preserve their native sample fingerprints and apply to current text',()=>{
  assert.equal(bodies.length,8);
  const current={text:'文字',params:{fontFamily:'User font',abW:800,abH:500},letters:[{},{}],lookMemory:{slots:[]}};
  for(const recipe of bodies){const project=library.project(recipe.id);assert.equal(project.version,82);assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical(project))).digest('hex'),recipe.projectHash,recipe.id);const applied=library.prepare(recipe.id,current,'current',['文','字']);assert.equal(applied.text,'文字');assert.equal(applied.params.fontFamily,'User font');assert.equal(applied.params.abW,800);assert.ok(applied.letters.every(l=>l.o[recipe.operators[0]].t===1));assert.equal(library.search(recipe.labels[0],'body-excess',false).length,1);assert.ok(fs.statSync(new URL('../assets/presets/'+recipe.id+'.jpg',import.meta.url)).size>1000);}
});

test('six ramified-body presets preserve their rendered fingerprints and current-text application',()=>{
 const entries=library.recipes.filter(r=>r.projectVersion===83);assert.equal(entries.length,6);assert.equal(library.recipes.length,436);assert.equal(library.search('','','', '2026-09-08T12:00:00Z').length,6);
 for(const r of entries){const p=library.project(r.id);assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex'),r.projectHash);assert.ok(fs.statSync(new URL('../assets/presets/'+r.id+'.jpg',import.meta.url)).size>1000);assert.equal(p.version,83);const src={...p,text:'書',letters:[p.letters[0]],params:{...p.params,fontFamily:'User font',fontSize:97}},result=library.prepare(r.id,src,'current',['書']);assert.equal(result.text,'書');assert.equal(result.params.fontFamily,'User font');assert.equal(result.params.fontSize,97);assert.equal(result.letters.length,1);assert.ok(result.letters[0].o[r.operators[0]].t);}
});

test('six folded-body presets preserve their rendered fingerprints and current-text application',()=>{
 const entries=library.recipes.filter(r=>r.projectVersion===84);assert.equal(entries.length,6);assert.equal(library.recipes.length,436);assert.equal(library.search('','','', '2026-09-08T13:10:06Z').length,6);
 for(const r of entries){const p=library.project(r.id);assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex'),r.projectHash);assert.ok(fs.statSync(new URL('../assets/presets/'+r.id+'.jpg',import.meta.url)).size>1000);assert.equal(p.version,84);const src={...p,text:'書',letters:[p.letters[0]],params:{...p.params,fontFamily:'User font',fontSize:97}},result=library.prepare(r.id,src,'current',['書']);assert.equal(result.text,'書');assert.equal(result.params.fontFamily,'User font');assert.equal(result.params.fontSize,97);assert.equal(result.letters.length,1);assert.ok(result.letters[0].o[r.operators[0]].t);}
});

test('six letterform-body presets preserve their rendered fingerprints and current-text application',()=>{
 const entries=library.recipes.filter(r=>r.projectVersion===85&&r.n<=170);assert.equal(entries.length,6);assert.equal(library.recipes.length,436);assert.equal(library.search('','','', '2026-09-08T15:20:00Z').length,6);
 for(const r of entries){const p=library.project(r.id);assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex'),r.projectHash);assert.ok(fs.statSync(new URL('../assets/presets/'+r.id+'.jpg',import.meta.url)).size>1000);assert.equal(p.version,85);const src={...p,text:'書',letters:[p.letters[0]],params:{...p.params,fontFamily:'User font',fontSize:97}},result=library.prepare(r.id,src,'current',['書']);assert.equal(result.text,'書');assert.equal(result.params.fontFamily,'User font');assert.equal(result.params.fontSize,97);assert.equal(result.letters.length,1);assert.ok(result.letters[0].o[r.operators[0]].t);}
});


test('OVERDRIVE adds 240 distinct three-operator compositions with exact sample reconstruction', () => {
 const entries=library.recipes.filter(r=>r.collection==='overdrive-240');
 assert.equal(entries.length,240);
 assert.equal(new Set(entries.map(r=>r.family)).size,24);
 assert.equal(new Set(entries.map(r=>r.operators.slice().sort().join('|'))).size,240);
 const earlier=new Set(library.recipes.filter(r=>r.n<=170).map(r=>r.operators.slice().sort().join('|')));
 const current={text:'書\nÁ',params:{fontFamily:'Personal Variable',fontAxes:'{"wght":615}',fontSize:92,abW:810,abH:1200,textObjects:'[{"id":"keep"}]',exportScale:3,pageLayout:'pages',gridEnabled:true},letters:[{gc:8},{}],lookMemory:{slots:[{name:'Saved Look'}]}};
 const before=JSON.stringify(current);
 for(const r of entries){
  assert.equal(r.operators.length,3,r.id);assert.equal(new Set(r.operators).size,3,r.id);
  assert.ok(!earlier.has(r.operators.slice().sort().join('|')),r.id);
  const sample=library.project(r.id);assert.equal(sample.version,85);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical(sample))).digest('hex'),r.projectHash,r.id);
  assert.ok(fs.statSync(new URL('../assets/presets/'+r.id+'.jpg',import.meta.url)).size>1000,r.id);
  const applied=plain(library.prepare(r.id,current,'current',['書','Á']));
  assert.equal(applied.text,current.text,r.id);
  for(const k of Object.keys(current.params))assert.deepEqual(applied.params[k],current.params[k],r.id+':'+k);
  assert.deepEqual(applied.lookMemory,current.lookMemory,r.id);assert.equal(applied.letters[0].gc,8);
  assert.ok(applied.letters.every(l=>r.operators.every(id=>l.o[id].t===1)),r.id);
  assert.deepEqual(JSON.parse(applied.params.frozenMoment).targets.map(t=>t.text),['書','Á']);
  assert.deepEqual(plain(library.prepare(r.id,current,'example',[])),{...plain(sample),lookMemory:current.lookMemory});
 }
 assert.equal(JSON.stringify(current),before);
 assert.equal(library.search('','','',entries[0].added).length,240);
 assert.ok(loaderSource.indexOf("'assets/presets/atlas-overdrive-240.js'")>loaderSource.indexOf("'assets/presets/atlas-v85.js'"));
 assert.ok(loaderSource.indexOf("'preset-library.js'")>loaderSource.indexOf("'assets/presets/atlas-overdrive-240.js'"));
});

test('six metamorphic-body presets preserve rendered fingerprints, earlier recipe IDs and current-text application',()=>{
 const entries=library.recipes.filter(r=>r.projectVersion===86);assert.equal(entries.length,6);assert.equal(library.recipes.length,436);assert.equal(library.search('','','', '2026-09-09T02:20:39.538Z').length,6);
 for(const r of entries){const p=library.project(r.id);assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex'),r.projectHash);assert.ok(fs.statSync(new URL('../assets/presets/'+r.id+'.jpg',import.meta.url)).size>1000);assert.equal(p.version,86);const src={...p,text:'書',letters:[p.letters[0]],params:{...p.params,fontFamily:'User font',fontSize:97}},result=library.prepare(r.id,src,'current',['書']);assert.equal(result.text,'書');assert.equal(result.params.fontFamily,'User font');assert.equal(result.params.fontSize,97);assert.equal(result.letters.length,1);assert.ok(result.letters[0].o[r.operators[0]].t);}
});

test('four gravity-lens presets preserve exact projects, earlier fingerprints and current text',()=>{const entries=library.recipes.filter(r=>r.projectVersion===87);assert.equal(entries.length,4);assert.equal(library.recipes.length,436);assert.equal(library.search('','','','2026-09-09T03:08:27.526Z').length,4);for(const r of entries){const p=library.project(r.id);assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex'),r.projectHash);const src={...p,text:'書',letters:[p.letters[0]],params:{...p.params,fontFamily:'User font',fontSize:97}},result=library.prepare(r.id,src,'current',['書']);assert.equal(result.text,'書');assert.equal(result.params.fontFamily,'User font');assert.equal(result.params.fontSize,97);assert.ok(result.letters[0].o.gravityLens.t);}});

test('four liquid-rope presets preserve exact projects and current typography',()=>{const entries=library.recipes.filter(r=>r.projectVersion===88);assert.equal(entries.length,4);assert.equal(library.recipes.length,436);assert.equal(library.search('','','','2026-09-09T03:49:12.646Z').length,4);for(const r of entries){const p=library.project(r.id);assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex'),r.projectHash);const src={...p,text:'書',letters:[p.letters[0]],params:{...p.params,fontFamily:'User font',fontSize:97}},result=library.prepare(r.id,src,'current',['書']);assert.equal(result.text,'書');assert.equal(result.params.fontFamily,'User font');assert.equal(result.params.fontSize,97);assert.ok(result.letters[0].o.liquidRope.t);}});

test('four wulff-body presets preserve exact projects and current typography',()=>{const entries=library.recipes.filter(r=>r.projectVersion===89);assert.equal(entries.length,4);assert.equal(library.recipes.length,436);assert.equal(library.search('','','','2026-09-09T04:32:32.779Z').length,4);for(const r of entries){const p=library.project(r.id);assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex'),r.projectHash);const src={...p,text:'書',letters:[p.letters[0]],params:{...p.params,fontFamily:'User font',fontSize:97}},result=library.prepare(r.id,src,'current',['書']);assert.equal(result.text,'書');assert.equal(result.params.fontFamily,'User font');assert.equal(result.params.fontSize,97);assert.ok(result.letters[0].o.wulffBody.t);}});

test('four Repulsive Curves presets preserve exact projects and current typography',()=>{const entries=library.recipes.filter(r=>r.projectVersion===90);assert.equal(entries.length,4);assert.equal(library.recipes.length,436);assert.equal(library.search('','','','2026-09-09T07:14:36.218Z').length,4);for(const r of entries){const p=library.project(r.id);assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex'),r.projectHash);const src={...p,text:'書',letters:[p.letters[0]],params:{...p.params,fontFamily:'User font',fontSize:97}},result=library.prepare(r.id,src,'current',['書']);assert.equal(result.text,'書');assert.equal(result.params.fontFamily,'User font');assert.equal(result.params.fontSize,97);assert.ok(result.letters[0].o.repulsiveCurves.t);}});

test('four Wasserstein Letters presets preserve exact projects and current typography',()=>{const entries=library.recipes.filter(r=>r.projectVersion===91);assert.equal(entries.length,4);assert.equal(library.recipes.length,436);assert.equal(library.search('','','','2026-09-09T11:23:36.562Z').length,4);for(const r of entries){const p=library.project(r.id);assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex'),r.projectHash);const src={...p,text:'書',letters:[p.letters[0]],params:{...p.params,fontFamily:'User font',fontSize:97}},result=library.prepare(r.id,src,'current',['書']);assert.equal(result.text,'書');assert.equal(result.params.fontFamily,'User font');assert.equal(result.params.fontSize,97);assert.ok(result.letters[0].o.wassersteinLetters.t);}});
