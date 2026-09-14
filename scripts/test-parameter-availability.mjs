import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fixture, metric, extract, html } from './paragraph-current-fixture.mjs';

function mockRow(control) {
  const classes = new Set();
  const row = {
    classList: {
      toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    querySelectorAll() { return [control]; }
  };
  control.closest = selector => selector === '.row' ? row : null;
  return row;
}

function mockControl(value = '') {
  const control = { value, disabled: false, dataset: {} };
  control.row = mockRow(control);
  return control;
}

function mockStatus() {
  return { textContent: '', hidden: true };
}

function mount(c, controls) {
  c.document.getElementById = id => controls[id] || null;
  return controls;
}

test('grammar-dependent axes disable only when their current grammar cannot consume them', () => {
  const c = fixture();
  const controls = mount(c, {
    pRotatePattern: mockControl('wave'), pRotateCycles: mockControl('1.5'), pRotatePhase: mockControl('0'),
    rotateGrammarStatus: mockStatus(),
    pSkewPattern: mockControl('alternate'), pSkewCycles: mockControl('1.25'), pSkewPhase: mockControl('0'),
    skewGrammarStatus: mockStatus(),
    pBaselinePattern: mockControl('wave'), pBaselineCycles: mockControl('1'), pBaselinePhase: mockControl('0'),
    baselineGrammarStatus: mockStatus(),
    pMirrorPattern: mockControl('alternate'), pMirrorSpan: mockControl('2'), pMirrorPhase: mockControl('0'),
    mirrorGrammarStatus: mockStatus()
  });

  c.syncFormFieldAvailability();
  assert.equal(controls.pRotateCycles.disabled, false);
  assert.equal(controls.pSkewCycles.disabled, true);
  assert.equal(controls.pSkewPhase.disabled, false);
  assert.match(controls.skewGrammarStatus.textContent, /Cyclesは休止中/);
  assert.equal(controls.pMirrorSpan.disabled, true);
  assert.equal(controls.pMirrorPhase.disabled, false);

  controls.pSkewPattern.value = 'wave';
  controls.pMirrorPattern.value = 'blocks';
  controls.pRotatePattern.value = 'uniform';
  controls.pBaselinePattern.value = 'uniform';
  c.syncFormFieldAvailability();
  assert.equal(controls.pSkewCycles.disabled, false);
  assert.equal(controls.pMirrorSpan.disabled, false);
  assert.equal(controls.pRotateCycles.disabled, true);
  assert.equal(controls.pRotatePhase.disabled, true);
  assert.equal(controls.pBaselineCycles.disabled, true);
  assert.equal(controls.pBaselinePhase.disabled, true);
  assert.equal(controls.pRotateCycles.row.classList.contains('is-parameter-inactive'), true);
});

test('layout and source-target reasons compose instead of re-enabling each other', () => {
  const c = fixture();
  const controls = { pReadingScope: mockControl('spread'), readingScopeHint: mockStatus() };
  for (const id of ['pReadingPressure', 'pReadingWidth', 'pReadingHeight', 'pReadingFocusU', 'pReadingFocusV', 'pReadingFeather', 'pReadingBody']) {
    controls[id] = mockControl('1');
  }
  mount(c, controls);
  c.params.pageLayout = 'continuous'; c.params.gridEnabled = false;
  c.syncReadingScopeUI();
  assert.ok(['pReadingPressure', 'pReadingWidth', 'pReadingHeight', 'pReadingFocusU', 'pReadingFocusV', 'pReadingFeather', 'pReadingBody']
    .every(id => controls[id].disabled));
  assert.match(controls.readingScopeHint.textContent, /休止中/);

  c.setParameterDisabledReason(controls.pReadingPressure, 'source-target', true);
  c.params.pageLayout = 'spreads';
  c.syncReadingScopeUI();
  assert.equal(controls.pReadingWidth.disabled, false, 'layout-compatible controls re-enable');
  assert.equal(controls.pReadingPressure.disabled, true, 'independent empty-range lock remains');
  c.setParameterDisabledReason(controls.pReadingPressure, 'source-target', false);
  assert.equal(controls.pReadingPressure.disabled, false);
});

test('Paragraph Current disables row-bundle spread until a paragraph actually wraps', () => {
  const c = fixture();
  const controls = mount(c, { pCurrentSpread: mockControl('.55'), paragraphCurrentStatus: mockStatus() });
  c.metrics = [{ currentFrame: { lineCount: 1 } }, { currentFrame: { lineCount: 1 } }];
  c.syncParagraphCurrentUI();
  assert.equal(controls.pCurrentSpread.disabled, true);
  assert.match(controls.paragraphCurrentStatus.textContent, /すべて1行/);

  c.setParameterDisabledReason(controls.pCurrentSpread, 'source-target', true);
  c.metrics[1].currentFrame.lineCount = 3;
  c.syncParagraphCurrentUI();
  assert.equal(controls.pCurrentSpread.disabled, true, 'independent source lock remains');
  assert.equal(controls.paragraphCurrentStatus.hidden, true);
  c.setParameterDisabledReason(controls.pCurrentSpread, 'source-target', false);
  assert.equal(controls.pCurrentSpread.disabled, false);
});

test('Gutter Fugue exposes its sliders only in an active spread layout', () => {
  const c = fixture();
  const controls = { gutterFugueStatus: mockStatus() };
  for (const id of ['pGutterTension', 'pGutterResponse', 'pGutterClearance', 'pGutterRhythm', 'pGutterOffset', 'pGutterHierarchy']) {
    controls[id] = mockControl('1');
  }
  mount(c, controls);
  for (const [pageLayout, gridEnabled, enabled] of [
    ['continuous', false, false], ['pages', false, false], ['spreads', true, false], ['spreads', false, true]
  ]) {
    c.params.pageLayout = pageLayout; c.params.gridEnabled = gridEnabled;
    c.syncGutterFugueUI();
    assert.equal(controls.pGutterTension.disabled, !enabled);
    assert.equal(controls.pGutterHierarchy.disabled, !enabled);
    assert.match(controls.gutterFugueStatus.textContent, enabled ? /作動中/ : /休止中/);
  }
});

test('Caesura reports punctuation-dependent axes while retaining grammar-specific controls', () => {
  const c = fixture();
  const controls = mount(c, {
    pCaesuraGrammar: mockControl('aperture'), pCaesuraBreath: mockControl('1.2'),
    pCaesuraHierarchy: mockControl('1.2'), pCaesuraSpan: mockControl('.8'), caesuraFieldStatus: mockStatus()
  });
  c.metrics = [{ caesuraMarkStrength: 0 }, { caesuraMarkStrength: 0 }];

  c.syncCaesuraFieldUI();
  assert.equal(controls.pCaesuraBreath.disabled, true);
  assert.equal(controls.pCaesuraHierarchy.disabled, true);
  assert.equal(controls.pCaesuraSpan.disabled, true);
  assert.match(controls.caesuraFieldStatus.textContent, /句読点がない/);

  controls.pCaesuraGrammar.value = 'terrace'; c.syncCaesuraFieldUI();
  assert.equal(controls.pCaesuraBreath.disabled, true);
  assert.equal(controls.pCaesuraHierarchy.disabled, false);
  assert.equal(controls.pCaesuraSpan.disabled, true);

  controls.pCaesuraGrammar.value = 'hinge'; c.syncCaesuraFieldUI();
  assert.equal(controls.pCaesuraBreath.disabled, true);
  assert.equal(controls.pCaesuraHierarchy.disabled, false);
  assert.equal(controls.pCaesuraSpan.disabled, false);

  c.metrics[1].caesuraMarkStrength = 1; c.syncCaesuraFieldUI();
  assert.equal(controls.pCaesuraBreath.disabled, false);
  assert.equal(controls.pCaesuraHierarchy.disabled, false);
  assert.equal(controls.pCaesuraSpan.disabled, false);
  assert.equal(controls.caesuraFieldStatus.hidden, true);
});

test('mobile steppers inherit native range disabled state and cannot synthesize a change', () => {
  assert.match(extract('syncMobileStepperPair'), /pair\.input\.disabled/);
  assert.match(extract('installMobileStepper'), /if \(input\.disabled\) \{ syncMobileStepperPair\(pair\); return; \}/);
});

test('Moiré Field angle is consumed by every interference grammar', () => {
  const source = extract('renderMoireChoir');
  assert.match(source, /phaseA = \(x \* cosA \+ y \* sinA\)/, 'linear carriers');
  assert.match(source, /orientedRadial[\s\S]*fieldX[\s\S]*fieldY/, 'concentric wells');
  assert.match(source, /polar = Math\.atan2\(dy, dx\) - angle/, 'radial caustics');
  assert.match(source, /wovenX = localX \* 0\.48 \+ fieldX \* 0\.52/, 'interlace lattice');
  assert.match(source, /localX \* 0\.035 \+ fieldX \* 0\.12/, 'nodal choir');
});

function stretchPreviewFixture() {
  const frames = [], draws = { surface: 0, composition: 0, overscan: 0 };
  const c = fixture({
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    scheduleSurfaceFxDraw() { draws.surface++; },
    scheduleCompositionDraw() { draws.composition++; },
    scheduleVisualOverscan() { draws.overscan++; }
  });
  vm.runInContext('var stretchQueued = false;\n' + extract('applyStretch') + '\n' + extract('reapplyStretches'), c);
  const m = metric(c, 0, 0);
  Object.assign(m, { currentIntensity: 1, seedX: .3, seedY: -.1, mode: 'organic', blend: 0,
    manualX: null, manualY: null, locked: false });
  c.operatorState(m, 'stretch').current = 1;
  c.metrics = [m];
  c.params.stretchX = .5; c.params.stretchY = .5;
  c.applyStretch(m);
  return { c, m, frames, draws, flush() { const scheduled = frames.splice(0); scheduled.forEach(callback => callback()); } };
}

test('Stretch parameter edits invalidate the cached glyph shape used by Surface and Compose', () => {
  const { c, frames, draws, flush } = stretchPreviewFixture();
  const before = c.snapshotGlyphs(true);
  assert.equal(c.snapshotGlyphs(true), before, 'the static glyph cache is populated before the edit');
  c.params.stretchX = 3;
  c.reapplyStretches();
  assert.equal(frames.length, 1);
  flush();
  const after = c.snapshotGlyphs(true);
  assert.notEqual(after, before, 'a parameter edit must not reuse the old geometry');
  assert.ok(after[0].scaleX > before[0].scaleX);
  assert.equal(after[0].scaleY, before[0].scaleY);
  assert.deepEqual(draws, { surface: 1, composition: 1, overscan: 1 });
});

test('continuous Stretch edits coalesce into one paint and use the final parameter values', () => {
  const { c, frames, draws, flush } = stretchPreviewFixture();
  const before = c.snapshotGlyphs(true);
  for (const value of [1, 2, 4]) { c.params.stretchY = value; c.reapplyStretches(); }
  assert.equal(frames.length, 1);
  flush();
  const after = c.snapshotGlyphs(true);
  assert.ok(after[0].scaleY > before[0].scaleY);
  assert.equal(after[0].scaleX, before[0].scaleX);
  assert.deepEqual(draws, { surface: 1, composition: 1, overscan: 1 });
  c.params.stretchY = .5; c.reapplyStretches(); flush();
  assert.equal(c.snapshotGlyphs(true)[0].scaleY, before[0].scaleY, 'returning to a value restores the same shape');
});

test('Stretch repaint does not unfreeze locked, manually sized, or inactive glyphs', () => {
  for (const state of [{ locked: true }, { manualX: 2 }, { currentIntensity: 0 }]) {
    const { c, m, draws, flush } = stretchPreviewFixture();
    Object.assign(m, state);
    const before = c.snapshotGlyphs(true), style = m.el.style.getPropertyValue('--ix');
    c.params.stretchX = 6; c.reapplyStretches(); flush();
    assert.equal(m.el.style.getPropertyValue('--ix'), style);
    assert.equal(c.snapshotGlyphs(true), before);
    assert.deepEqual(draws, { surface: 0, composition: 0, overscan: 0 });
  }
});

// Keep the real input -> profile resolution -> source glyph snapshot path.
// Only unrelated DOM effects, paint scheduling and navigation UI are mocked.
function profileSliderFixture() {
  const controls = {}, paintRequests = { surface: 0, composition: 0 };
  const node = value => ({ value: String(value ?? ''), textContent: '', disabled: false,
    addEventListener(type, listener) { this[type] = listener; }, setAttribute() {}, removeAttribute() {} });
  const c = fixture({ CONFUSE_DATA: null, rangeControls: [], profileSelectControls: [],
    ensureBatchDictionary() {}, populateBatchTargetOptions() {}, scheduleParameterUIRefresh() {},
    applyConfuseText() {}, applyBlobTrackVisual() {}, applyDataMoshVisual() {}, applyMisregistrationVisual() {},
    applySurfaceSourceVisual() {}, updateAllSurfaceSourceVisuals() {}, scheduleEffectStatusUpdate() {}, updateProofSheetAvailability() {},
    scheduleSurfaceFxDraw() { paintRequests.surface++; }, scheduleCompositionDraw() { paintRequests.composition++; },
    document: { createElement: () => ({ getContext: () => null }), getElementById: id => controls[id] || null },
    mirrorXInput: node(), mirrorYInput: node(), batchProfileStatus: node(), btnBatchProfileReset: node()
  });
  const classifier = html.slice(html.indexOf('      // BEGIN DETAILED BATCH TARGETS'), html.indexOf('      var PROOF_AXIS_DEFS'));
  const profiles = html.slice(html.indexOf('      var batchProfiles = {};'), html.indexOf('      // Saved projects and URL payloads'));
  vm.runInContext(classifier + '\n' + profiles + '\n' + [
    'applyStretch', 'mirrorGrammarMask', 'applyOperatorVisual', 'applyAllOperatorVisuals',
    'refreshBatchProfileControls', 'bindRange', 'bindProfileSelect', 'updateMirrorAxis'
  ].map(extract).join('\n'), c);
  function bind(key, operator) {
    const input = controls[key] = node(c.params[key]); controls[key + 'Value'] = node();
    c.params.activeOperator = operator;
    c.bindRange(key, key + 'Value', key, value => value.toFixed(2), c.applyAllOperatorVisuals);
    return value => { input.value = String(value); input.input({ type: 'input', target: input }); };
  }
  const m = metric(c, 0, 0);
  Object.assign(m, { currentIntensity: 0, manualX: null, manualY: null, seedX: .2, seedY: .3 });
  c.metrics = [m]; c.params.rotatePattern = 'uniform';
  return { c, m, controls, node, paintRequests, bind };
}

test('All slider edits reach FORM geometry and Surface payloads after a different Batch parameter was edited', () => {
  for (const [key, operator, next] of [['rotateAngle', 'rotate', 153], ['boneMarrow', 'boneScaffold', 5.8]]) {
    const { c, m, bind, paintRequests } = profileSliderFixture();
    c.activeBatchProfile = 'latin'; c.editableBatchProfile().randomness = .3;
    c.activeBatchProfile = 'all';
    Object.assign(c.operatorState(m, operator), { toggled: true, current: 1 });
    const move = bind(key, operator); c.applyOperatorVisual(m);
    const sample = glyph => operator === 'rotate' ? glyph.rot : glyph.surface[key];
    const before = sample(c.snapshotGlyphs(true)[0]);
    move(next);
    assert.equal(c.params[key], next, 'the displayed All value is committed');
    assert.equal(sample(c.snapshotGlyphs(true)[0]), next, 'the same value must reach the visible glyph, not an old full Batch snapshot');
    assert.notEqual(sample(c.snapshotGlyphs(true)[0]), before);
    assert.equal(c.batchProfiles.latin.randomness, .3, 'unrelated authored values survive');
    assert.equal(paintRequests.surface, 2); assert.equal(paintRequests.composition, 2);
  }
});

test('All changes only the edited key in broad and fine profiles, including restored full legacy snapshots', () => {
  const { c, bind } = profileSliderFixture();
  c.activeBatchProfile = 'latin'; c.editableBatchProfile().randomness = .3;
  c.batchProfiles['latin.upper'] = { rotateAngle: -30, randomness: .1 };
  c.batchProfiles.kata = c.copyBaseDeformProfile();
  c.batchProfiles = c.normalizeBatchProfiles(c.cloneBatchProfiles());
  const original = c.cloneBatchProfiles(); c.activeBatchProfile = 'all';
  const move = bind('rotateAngle', 'rotate'); move(153);
  for (const key of Object.keys(original)) {
    assert.equal(c.batchProfiles[key].rotateAngle, 153);
    const { rotateAngle: oldAngle, ...oldRest } = original[key];
    const { rotateAngle: newAngle, ...newRest } = c.batchProfiles[key];
    assert.deepEqual(JSON.parse(JSON.stringify(newRest)), JSON.parse(JSON.stringify(oldRest)));
  }
  const saved = c.cloneBatchProfiles();
  c.batchProfiles = c.normalizeBatchProfiles(saved);
  assert.equal(c.batchProfileForKey('latin', 'A').rotateAngle, 153);
  move(-72); assert.equal(c.batchProfileForKey('latin', 'A').rotateAngle, -72);
});

test('class-targeted sliders keep the global baseline and other classes unchanged', () => {
  const { c, bind } = profileSliderFixture();
  c.batchProfiles.kata = c.copyBaseDeformProfile();
  const before = c.params.rotateAngle, kata = JSON.stringify(c.batchProfiles.kata);
  c.activeBatchProfile = 'latin'; bind('rotateAngle', 'rotate')(153);
  assert.equal(c.batchProfileForKey('latin', 'a').rotateAngle, 153);
  assert.equal(c.params.rotateAngle, before);
  assert.equal(JSON.stringify(c.batchProfiles.kata), kata);
});

test('All grammar and Mirror controls follow the same edit scope as numeric sliders', () => {
  const { c, controls, node } = profileSliderFixture();
  c.batchProfiles.latin = c.copyBaseDeformProfile(); c.activeBatchProfile = 'all';
  const select = controls.rotatePattern = node('uniform');
  c.bindProfileSelect('rotatePattern', 'rotatePattern', c.applyAllOperatorVisuals);
  select.value = 'wave'; select.change({ type: 'change', target: select });
  assert.equal(c.batchProfileForKey('latin', 'A').rotatePattern, 'wave');
  c.updateMirrorAxis('mirrorX', true);
  assert.equal(c.batchProfileForKey('latin', 'A').mirrorX, 1);
});

test('every bound numeric Batch parameter reaches legacy class and fine overrides through the actual slider handler', t => {
  const { c, bind } = profileSliderFixture();
  c.batchProfiles.latin = c.copyBaseDeformProfile(); c.batchProfiles.kata = c.copyBaseDeformProfile();
  c.batchProfiles['latin.upper'] = c.copyBaseDeformProfile();
  const keys = [...new Set([...html.matchAll(/bindRange\('[^']+', '[^']+', '([^']+)'/g)]
    .map(match => match[1]).filter(key => c.BATCH_PARAM_KEYS.includes(key)))];
  assert.ok(keys.length > 250, 'audit actual registered controls, not a hand-picked short list');
  for (const key of keys) {
    const limits = c.BATCH_PARAM_LIMITS[key]; assert.ok(limits, key);
    const next = c.params[key] === limits[1] ? limits[0] : limits[1];
    bind(key, 'stretch')(next);
    assert.equal(c.params[key], next, key + ' All');
    assert.equal(c.batchProfileForKey('latin', 'A')[key], next, key + ' uppercase override');
    assert.equal(c.batchProfileForKey('latin', 'a')[key], next, key + ' Latin');
    assert.equal(c.batchProfileForKey('kata', 'ア')[key], next, key + ' Katakana');
  }
  t.diagnostic(keys.length + ' actual numeric bindings checked for effective profile values; not all-operator pixel or device evidence.');
});

test('a slider edit changes native Bone pixels through its resolved glyph payload and returning the value restores the image', async () => {
  const { createHash } = await import('node:crypto');
  const bone = await import('./bone-lamellar-fixture.mjs');
  const { c, m, bind } = profileSliderFixture();
  c.activeBatchProfile = 'latin'; c.editableBatchProfile().randomness = .3; c.activeBatchProfile = 'all';
  Object.assign(c.operatorState(m, 'boneScaffold'), { toggled: true, current: 1 });
  const move = bind('boneMarrow', 'boneScaffold'); c.applyOperatorVisual(m);
  const mask = bone.boneMask('B', 210, 'Arial Black', 320, 260);
  const renderHash = () => createHash('sha256').update(bone.fixture(mask, c.snapshotGlyphs(true)[0].surface).render().toBuffer('image/png')).digest('hex');
  const originalValue = c.params.boneMarrow, before = renderHash();
  move(6); assert.notEqual(renderHash(), before, 'a changed UI value must reach rendered pixels');
  move(originalValue); assert.equal(renderHash(), before, 'the same setting restores the same shape');
});
