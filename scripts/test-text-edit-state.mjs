import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { exportFixture } from './export-fixture.mjs';
import path from 'node:path';
import { installAutosave } from './autosave-fixture.mjs';
import { setMeasuredPageSource } from './page-layout-fixture.mjs';
import { fixture as risoFixture, textMask as risoTextMask } from './riso-fixture.mjs';
import { fixture as hatchFixture, textMask as hatchTextMask } from './hatch-copper-fixture.mjs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const names = ['splitSourceTokenEdit', 'matchSourceTokens', 'snapshotLetters', 'carryLetter', 'rebuildPreservingState'];
const sourceTargetFunctions = ['parameterDisabledReasons', 'updateParameterRowAvailability', 'setParameterDisabledReason', 'setParameterAvailabilityStatus',
  'readingScopeAvailable', 'syncReadingScopeUI', 'gutterFugueAvailable', 'syncGutterFugueUI', 'syncCaesuraFieldUI',
  'tokenizeSourceLines', 'sourceParagraphAt', 'sourceTargetBounds', 'sourceTargetSpanIndex', 'sourceTargetLabel',
  'updateSourceTargetUI', 'updatePageLayoutUI', 'updateLayoutSelectionUI', 'layoutContextLabel', 'sourcePageContext', 'buildPageSourceIndex',
  'captureContextPages', 'capturePageSourceRange', 'captureSourceLayoutTarget', 'captureCanvasLayoutTarget',
  'remapSourceTarget', 'refreshSourceSelectionUI', 'captureSourceTarget', 'editSourceTarget'];
function extract(name) {
  const source = html.match(new RegExp('      function ' + name + '\\([^]*?\\n      }'))?.[0];
  assert.ok(source, `Actual editor function: ${name}`);
  return source;
}
function extractDeclaration(name) {
  const source = html.match(new RegExp('^      var ' + name + ' = .*;$', 'm'))?.[0];
  assert.ok(source, `Actual editor declaration: ${name}`);
  return source;
}
const pure = vm.createContext({});
vm.runInContext(extract(names[0]) + '\n' + extract(names[1]), pure);
const match = (a, b) => Array.from(pure.matchSourceTokens(a, b));
const plain = value => JSON.parse(JSON.stringify(value));
const graphemes = text => Array.from(new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text), s => s.segment);

function lcsLength(a, b) {
  const row = new Uint32Array(b.length + 1);
  for (const token of a) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j++) {
      const previous = row[j];
      row[j] = token === b[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = previous;
    }
  }
  return row[b.length];
}
function check(a, b, expectedLength = lcsLength(a, b)) {
  const before = [...a], after = [...b], mapping = match(a, b);
  let last = -1, count = 0;
  assert.equal(mapping.length, b.length);
  for (let j = 0; j < mapping.length; j++) {
    const i = mapping[j];
    if (i < 0) { assert.equal(i, -1); continue; }
    assert.ok(i > last && i < a.length, 'unique, increasing source indices');
    assert.equal(a[i], b[j], 'never carry state to a different source token');
    last = i; count++;
  }
  assert.equal(count, expectedLength, 'independent dynamic-programming LCS length');
  assert.deepEqual(a, before); assert.deepEqual(b, after);
  assert.deepEqual(match(a, b), mapping, 'deterministic repeated-token tie breaking');
  return mapping;
}

test('noncontiguous replacement retains the unchanged interior C', () => {
  assert.deepEqual(check([... 'ABCDE'], [... 'AXCYE']), [0, -1, 2, -1, 4]);
  assert.deepEqual(check([... 'ABCDE'], [... 'ABXCDE']), [0, 1, -1, 2, 3, 4]);
  for (const [a, b] of [['', 'ABC'], ['ABC', ''], ['ABC', 'ABC'], ['ABC', 'XYZ'], ['ABABAB', 'BABABA'], ['AAA', 'AAAA'], ['AB', 'X'.repeat(500) + 'AYB']]) check([...a], [...b]);
});

test('all binary sequences through length 6 agree with independent LCS oracle', () => {
  const samples = [[]];
  for (let length = 1; length <= 6; length++) {
    for (let bits = 0; bits < 2 ** length; bits++) samples.push(Array.from({ length }, (_, i) => (bits >> i) & 1 ? 'B' : 'A'));
  }
  for (const a of samples) for (const b of samples) check(a, b);
});

test('seeded unequal-length edits and Unicode tokens agree with LCS oracle', () => {
  let seed = 0x513ad;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  const alphabet = ['A', '永', '。', 'か\u3099', '👨‍👩‍👧', '𠮷', 'العربية'];
  for (let iteration = 0; iteration < 1200; iteration++) {
    const a = Array.from({ length: random(44) }, () => alphabet[random(alphabet.length)]);
    const b = Array.from({ length: random(44) }, () => alphabet[random(alphabet.length)]);
    check(a, b);
  }
  check(graphemes('永か\u3099👨‍👩‍👧𠮷書'), graphemes('永風か\u3099👨‍👩‍👧海𠮷書'));
});

function element(text, data = {}, style = '') {
  const classes = new Set();
  let css = style;
  return { textContent: text, dataset: { sourceText: text, ...data },
    getAttribute: key => key === 'style' ? css : null,
    setAttribute: (key, value) => { assert.equal(key, 'style'); css = value; },
    classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name), toggle: (name, value) => value ? classes.add(name) : classes.delete(name) },
    style: {
      getPropertyValue: name => css.match(new RegExp(name + ':([^;]+)'))?.[1] || '',
      setProperty: (name, value) => { css = css.replace(new RegExp(name + ':[^;]*;?', 'g'), '') + name + ':' + value + ';'; },
      removeProperty: name => { css = css.replace(new RegExp(name + ':[^;]*;?', 'g'), ''); }
    }
  };
}
function harness(before) {
  const c = vm.createContext({ metrics: [], selectedM: null, params: { gridEnabled: true }, events: [],
    renderedSourceText: before, pendingTextSelection: null, sourceParagraphs: [], textInput: null, textComposing: false,
    sourceTarget: { mode: 'all', start: 0, end: 0, valid: false },
    snapDocumentState: rows => ({ letters: rows }), recordHistorySnapshot() {}, markAutosaveDirty() {},
    cancelPendingTextRebuild() {},
    tokenizeLine: line => graphemes(line).map(text => ({ text, space: /^[ \t\u00a0]$/.test(text) })),
    letterState: m => m.savedState,
    restoreOperatorStates: (m, state) => { m.operators = plain(state); },
    hasManualOverrides: () => false,
    batchProfileForKey: key => ({ key }),
    applyConfuseText() {},
    restoreSavedDerivedText: (m, saved) => { if (saved) { m.el.textContent = saved; m.el.dataset.renderText = saved; } }
  });
  c.metrics = [...before].map((text, i) => ({ el: element(text, { originalId: String(i), line: '0', lineLength: '5', word: '0', j: String(i), batch: 'latin', sourceText: text }, '--ix:2;--sx:1.25;'),
    savedState: { t: 1, l: 1, i: 0.65, mx: 2, my: 3, gc: i, x: 1, o: { marblingType: { t: 1, i: 0.72 }, rotate: { t: 1, i: 0.5, m: 30 } } }
  }));
  c.createSpans = text => {
    c.events.push('rebuild');
    c.selectedM = null;
    let word = 0;
    c.metrics = text.split('\n').flatMap((line, li) => graphemes(line).flatMap((token, j) => {
      if (/^\s+$/.test(token)) { word++; return []; }
      return [{ el: element(token, { line: String(li), lineLength: String(line.length), word: String(word), j: String(j) }),
        sourceIndex: j, savedState: { t: 0, l: 0, i: 0, o: {} } }];
    }));
  };
  c.selectLetter = m => { c.selectedM = m; };
  for (const name of ['syncMetricsSeeds', 'layoutGrid', 'scheduleEffectStatusUpdate', 'scheduleMeasure']) c[name] = () => c.events.push(name);
  vm.runInContext([...names, ...sourceTargetFunctions].map(extract).join('\n'), c);
  return c;
}

test('actual rebuild/snapshot/carry preserve source, locked style, per-operator state and fresh line metadata', () => {
  const c = harness('ABCDE');
  c.metrics[2].el.textContent = 'Ω';
  c.metrics[2].savedState.d = 'Ω';
  c.rebuildPreservingState('A X\nC Y\nE');
  assert.deepEqual(Array.from(c.metrics, m => m.el.dataset.originalId ?? null), ['0', null, '2', null, '4']);
  const middle = c.metrics[2];
  assert.equal(middle.el.dataset.sourceText, 'C');
  assert.equal(middle.el.textContent, 'Ω');
  assert.equal(middle.el.dataset.line, '1');
  assert.equal(middle.el.dataset.word, '1');
  assert.equal(middle.el.dataset.lineLength, '3');
  assert.equal(middle.el.getAttribute('style'), '--ix:2;--sx:1.25;');
  assert.equal(middle.locked, true); assert.equal(middle.explicitLock, true);
  assert.equal(middle.manualX, 2); assert.equal(middle.manualY, 3); assert.equal(middle.gridCell, 2);
  assert.equal(middle.operators.marblingType.i, 0.72);
  assert.equal(middle.operators.rotate.m, 30);
  assert.equal(c.metrics[1].el.getAttribute('style'), '');
  assert.deepEqual(Array.from(c.events), ['rebuild', 'syncMetricsSeeds', 'layoutGrid', 'scheduleEffectStatusUpdate', 'scheduleMeasure']);
});

test('matching ignores display substitutions in the freshly rebuilt metrics', () => {
  const c = harness('ABCDE'), create = c.createSpans;
  c.createSpans = text => { create(text); for (const m of c.metrics) m.el.textContent = 'display'; };
  c.rebuildPreservingState('AXCYE');
  assert.deepEqual(Array.from(c.metrics, m => m.el.dataset.originalId ?? null), ['0', null, '2', null, '4']);
});

test('a matching failure cannot discard the live spans or their state', () => {
  const c = harness('ABCDE'), original = c.metrics;
  c.matchSourceTokens = () => { throw new Error('test matching failure'); };
  assert.throws(() => c.rebuildPreservingState('AXCYE'), /test matching failure/);
  assert.equal(c.metrics, original);
  assert.deepEqual(Array.from(c.events), []);
});

test('rebuild supplies the exact precomputed token lines, including empty lines and CRLF', () => {
  const c = harness('ABC'), create = c.createSpans;
  let lines;
  c.createSpans = (text, prepared) => { lines = plain(prepared); create(text.replace(/\r\n?/g, '\n')); };
  c.rebuildPreservingState('A\r\n\r\nB C');
  assert.deepEqual(lines.map(line => line.map(t => t.text).join('')), ['A', '', 'B C']);
  assert.deepEqual(Array.from(c.metrics, m => m.el.dataset.originalId), ['0', '1', '2']);
  assert.deepEqual(Array.from(c.metrics, m => m.el.dataset.line), ['0', '2', '2']);
});

// Real segmentation/classification, tokenizeLine, createSpans and rebuild.
// Only the DOM implementation, random initialization, metric initialization
// and scheduling are replaced. This does not exercise browser layout/history.
function sourceDomHarness() {
  const c = harness('');
  function node(tag, text = '') {
    const n = element(text);
    n.tag = tag; n.children = [];
    n.dataset = new Proxy({}, { set: (target, key, value) => { target[key] = String(value); return true; } });
    n.appendChild = child => {
      if (child.tag === 'fragment') n.children.push(...child.children);
      else n.children.push(child);
      return child;
    };
    Object.defineProperty(n, 'innerHTML', { set: value => { assert.equal(value, ''); n.children = []; } });
    return n;
  }
  Object.assign(c, { Intl, stageWorld: node('world'), stage: node('stage'), gridLinesEl: null, targetEl: null,
    letters: [], lineEnds: [], undoStack: [], redoStack: [],
    document: { createElement: tag => node(tag), createTextNode: text => node('text', text), createDocumentFragment: () => node('fragment'), getElementById: () => null },
    updateHud: () => {},
    applyRandom: () => {}, syncHistoryControls: () => {},
    rebuildMetrics: () => { c.metrics = c.letters.map(el => ({ el, savedState: { t: 0, l: 0, i: 0, o: {} } })); }
  });
  const start = html.indexOf('      var graphemeSegmenter =');
  const end = html.indexOf('      var digitRe =', start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(html.slice(start, end) + '\n' + ['tokenizeLine', 'createSpans', 'setTarget', 'selectLetter', 'clearEditSelection'].map(extract).join('\n'), c);
  return c;
}

test('actual createSpans prepared and one-argument paths agree for graphemes, joining words, blank lines and whitespace', () => {
  const text = 'Aか\u3099👨‍👩‍👧\r\n\r\nالعربية سلام\tB';
  const direct = sourceDomHarness(), prepared = sourceDomHarness();
  direct.createSpans(text);
  const lines = prepared.tokenizeSourceLines(text);
  prepared.tokenizeLine = () => { throw new Error('prepared lines must not be segmented again'); };
  prepared.createSpans(text, lines);
  const snapshot = c => plain({ letters: c.letters.map(el => ({ text: el.textContent, data: el.dataset, className: el.className })),
    ends: c.lineEnds, paragraphs: c.stageWorld.children.map(p => p.children.map(n => [n.tag, n.textContent])) });
  assert.deepEqual(snapshot(prepared), snapshot(direct));
  assert.deepEqual(Array.from(direct.letters, el => el.dataset.sourceText), ['A', 'か\u3099', '👨‍👩‍👧', 'سلام', 'العربية', 'B']);
  assert.deepEqual(Array.from(direct.lineEnds), [3, 3, 6]);
  assert.equal(direct.stageWorld.children[1].children[0].tag, 'br');
});

test('actual tokenizer/createSpans/rebuild retain joining-word state across separated edits', () => {
  const c = sourceDomHarness();
  c.createSpans('A العربية B 永 C');
  for (const m of c.metrics) {
    m.el.dataset.originalId = m.el.dataset.sourceText;
    m.savedState = { t: 1, l: 1, x: 1, i: 0.7, o: { rotate: { t: 1, i: 0.7, m: 27 } } };
  }
  c.rebuildPreservingState('X العربية B\n海 C');
  assert.deepEqual(Array.from(c.metrics, m => m.el.dataset.originalId ?? null), [null, 'العربية', 'B', null, 'C']);
  const word = c.metrics[1];
  assert.equal(word.locked, true);
  assert.equal(word.operators.rotate.m, 27);
  assert.equal(word.el.dataset.sourceText, 'العربية');
  assert.equal(c.metrics[4].el.dataset.line, '1');
});

test('editor selection follows a surviving source token and clears only when that token is removed', () => {
  for (const [selected, revision, expected] of [[2, 'AXCYE', 2], [4, 'AB\nXCDE', 5], [1, 'AXCYE', -1], [2, '', -1]]) {
    const c = sourceDomHarness();
    c.createSpans('ABCDE');
    const old = c.metrics[selected];
    c.selectLetter(old); c.setTarget(old);
    c.rebuildPreservingState(revision);
    assert.equal(c.targetEl, null, 'do not transfer stale pointer hover');
    assert.equal(old.el.classList.contains('selected'), false, 'old selection class removed');
    assert.equal(c.selectedM, expected < 0 ? null : c.metrics[expected]);
    if (c.selectedM) {
      assert.notEqual(c.selectedM, old, 'HUD references the new live metric');
      assert.equal(c.selectedM.el.dataset.sourceText, old.el.dataset.sourceText);
      assert.equal(c.selectedM.el.classList.contains('selected'), true);
    }
  }
});

test('edit-path failure keeps the existing selection and target intact', () => {
  const c = sourceDomHarness();
  c.createSpans('ABCDE');
  c.selectLetter(c.metrics[2]); c.setTarget(c.metrics[2]);
  const old = c.selectedM;
  c.matchSourceTokens = () => { throw Error('matching failed'); };
  assert.throws(() => c.rebuildPreservingState('AXCYE'), /matching failed/);
  assert.equal(c.selectedM, old); assert.equal(c.targetEl, old.el);
  assert.equal(old.el.classList.contains('selected'), true);
});

test('3k / 10k / 50k token revisions retain every unchanged token, matching only', t => {
  const sentence = graphemes('雨の午後、川沿いの道を歩いた。遠くの窓にはまだ灯りが残り、書きかけの文章だけが机にあった。');
  for (const length of [3000, 10000, 50000]) {
    const before = Array.from({ length }, (_, i) => sentence[i % sentence.length]);
    const after = [...before];
    after[11] = '§'; after[Math.floor(length / 2)] = '※'; after[length - 12] = '♣';
    after.splice(Math.floor(length / 3), 0, '♠');
    const started = performance.now();
    check(before, after, before.length - 3);
    t.diagnostic(JSON.stringify({ tokens: length, matchingChecksMs: +(performance.now() - started).toFixed(2), scope: 'two matches plus assertions; not DOM, layout, total heap, animation or mobile performance' }));
  }
});

test('unrelated 50k replacement and highly unequal overlap avoid quadratic storage', () => {
  check(Array(50000).fill('A'), Array(50000).fill('B'), 0);
  check(Array(50000).fill('A'), ['B', 'A', 'C'], 1);
  const repeated = Array.from({ length: 50000 }, (_, i) => i % 2 ? 'B' : 'A');
  check(repeated, ['§', 'B', 'A', '※'], 2);
  check(['§', 'B', 'A', '※'], repeated, 2);
  const lengths = [];
  class TrackedArray extends Int32Array { constructor(length) { super(length); lengths.push(length); } }
  const c = vm.createContext({ Int32Array: TrackedArray });
  vm.runInContext(extract('splitSourceTokenEdit') + '\n' + extract('matchSourceTokens'), c);
  const a = Array.from({ length: 300 }, (_, i) => 'ABCDE'[i % 5]);
  const b = Array.from({ length: 350 }, (_, i) => 'EBFDA'[i % 5]);
  assert.equal(Array.from(c.matchSourceTokens(a, b)).filter(i => i >= 0).length, lcsLength(a, b));
  assert.ok(lengths.length > 2, 'exercise actual divide and conquer');
  assert.ok(Math.max(...lengths) <= a.length + b.length + 4, 'each frontier buffer is linear, not a DP table');
});

// Session history is actual source/gesture serialization, matching, restoration,
// input handlers and timer callbacks. DOM, drawing, full params/UI and browser
// dispatch are mocked; this is not native IME/Safari or rendered interaction QA.
function historyHarness(text = 'ABCDE') {
  const c = sourceDomHarness();
  const listeners = new Map(), timers = new Map();
  let nextTimer = 0;
  const input = { tagName: 'TEXTAREA', value: text, selectionStart: 0, selectionEnd: 0, selectionDirection: 'none',
    setSelectionRange(start, end, direction) { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; },
    focus() {},
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(callback); }
  };
  const defaults = { seed: 41, fontFamily: 'Test | F= font', fontWeight: 400, gridEnabled: false,
    mode: 'edit', activeOperator: 'rotate', ink: '#123456' };
  Object.assign(c, {
    PARAM_DEFAULTS: defaults, params: { ...defaults }, textInput: input, sourceParameterMode: 'base',
    OPERATOR_IDS: ['stretch', 'rotate', 'marblingType', 'confuse'],
    OPERATOR_DEFS: { stretch: { short: 'st' }, rotate: { short: 'ro' }, marblingType: { short: 'mt' }, confuse: { short: 'co' } },
    OPERATOR_BY_SHORT: { st: 'stretch', ro: 'rotate', mt: 'marblingType', co: 'confuse' },
    isSurfaceOperator: id => id === 'marblingType',
    batchProfiles: { latin: { ink: '#654321', marblingMass: 2 } },
    compositionState: { type: 'field', phase: 0.36 }, pendingControlHistory: null,
    cloneKnownParams: value => plain(value), cloneBatchProfiles: () => plain(c.batchProfiles),
    cloneCompositionState: () => plain(c.compositionState), normalizeBatchProfiles: plain, normalizeComposition: plain,
    persistentCompositionState: () => plain(c.compositionState), cloneLookMemory: () => ({ slots: [] }),
    normalizeParams() {}, cloneCompositionDefaults: () => ({ type: 'field', phase: 0 }),
    setCompositionPlaying() {}, syncCompositionUI() {}, syncUI() {}, clearGridStyles() {}, applyStyle() {},
    refreshConfuseFontCandidates() {}, scheduleCompositionDraw() {}, applyOperatorVisual() {}, applyStretch() {},
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout: id => timers.delete(id)
  });
  c.scopeControls = Object.fromEntries(['btnUseSourceRange', 'btnUseSourceParagraphs', 'btnEditSourceTarget', 'pSourceScope',
    'btnUseSourcePages', 'btnUseSourceSpreads', 'btnUseCanvasPage', 'btnUseCanvasSpread',
    'pSourceParameterMode', 'btnSourceParameterTarget', 'btnSourceParameterReset',
    'sourceSelectionHint', 'sourceTargetPreview'].map(id => [id, { disabled: false, textContent: '', value: '', listeners: {},
      focus() { c.focusedControl = id; }, addEventListener(event, fn) { this.listeners[event] = fn; } }]));
  c.document.getElementById = id => id === 'textInput' ? input : c.scopeControls[id] || null;
  c.openSourceTargetSection = section => { c.openedSection = section; };
  c.updateApplicationSummary = () => c.updateSourceTargetUI();
  c.document.activeElement = input;
  c.runTimers = () => { const queued = [...timers]; for (const [id, callback] of queued) { if (timers.delete(id)) callback(); } };
  c.timerCount = () => timers.size;
  c.dispatch = (type, values = {}) => {
    const event = { target: input, type, cancelable: true, isComposing: false, defaultPrevented: false,
      preventDefault() { if (this.cancelable) this.defaultPrevented = true; }, ...values };
    for (const callback of listeners.get(type) || []) callback(event);
    return event;
  };
  vm.runInContext(extractDeclaration('EMPTY_OPERATOR_STATE') + '\n' + [
    'createOperatorState', 'createOperatorStates', 'readOperatorState', 'operatorState', 'cloneManualValue', 'clampFinite', 'normalizeOperatorManual',
    'sparseOperatorState', 'restoreOperatorStates', 'encodeOperatorStates', 'decodeOperatorStates',
    'letterState', 'applyLetterState', 'restoreStates', 'snapState', 'applySnap',
    'textSelectionSnapshot', 'snapDocumentState', 'recordHistorySnapshot', 'pushHistory', 'applyHistorySnapshot',
    'undo', 'redo', 'keepsNativeHistoryTarget', 'beginControlHistory', 'historyControlFor',
    'projectData', 'shareData', 'currentLookState', 'resetSourceParameters', 'refreshSourceParameterControls'
  ].map(extract).join('\n'), c);
  // Deterministic initializer substitutes for random base/layout only.
  c.applyRandom = () => { for (const el of c.letters) el.style.setProperty('--sx', '1.' + el.dataset.j); };
  c.rebuildMetrics = () => {
    c.metrics = c.letters.map(el => ({ el, operatorStates: c.createOperatorStates(), toggled: false,
      currentIntensity: 0, manualX: null, manualY: null, gridCell: null, locked: false, explicitLock: false }));
  };
  const start = html.indexOf("      var textInput = document.getElementById('textInput');");
  const end = html.indexOf("      document.getElementById('btnShuffle')", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(html.slice(start, end), c);
  installAutosave(c);
  c.createSpans(text);
  return c;
}
function revise(c, text, flush = true) {
  c.dispatch('beforeinput', { inputType: 'insertFromPaste' });
  c.textInput.value = text;
  c.dispatch('input', { inputType: 'insertFromPaste' });
  if (flush) c.runTimers();
}
function decorate(c, index, angle = 37) {
  const m = c.metrics[index];
  m.toggled = true; m.locked = true; m.explicitLock = true; m.currentIntensity = 0.68;
  m.manualX = 2; m.manualY = 3;
  m.operatorStates.rotate = { toggled: true, current: 0.8, manual: angle, hovered: false };
  m.operatorStates.marblingType = { toggled: true, current: 0.73, manual: 0.6, hovered: false };
  m.operatorStates.confuse = { toggled: true, current: 0.8, manual: 1, hovered: false };
  m.el.textContent = 'Ω'; m.el.dataset.renderText = 'Ω';
  m.el.style.setProperty('--sx', '1.765'); m.el.style.setProperty('--ix', '2');
}

test('source Undo restores deleted effects, frozen presentation, caret, selection and paragraph metadata', () => {
  const c = historyHarness();
  decorate(c, 1); c.selectLetter(c.metrics[1]);
  c.textInput.setSelectionRange(1, 2, 'backward');
  const original = plain(c.snapshotLetters());
  revise(c, 'AX\nCYE');
  assert.equal(c.undoStack.length, 1);
  assert.equal(c.undoStack[0].kind, 'source');
  assert.equal(c.undoStack[0].text, 'ABCDE', 'not the already-mutated textarea value');
  assert.equal(c.selectedM, null);
  const revised = plain(c.snapshotLetters());
  c.undo();
  assert.equal(c.textInput.value, 'ABCDE'); assert.equal(c.renderedSourceText, 'ABCDE');
  assert.deepEqual(plain(c.snapshotLetters()), original);
  assert.equal(c.selectedM, c.metrics[1]);
  assert.equal(c.textInput.selectionStart, 1); assert.equal(c.textInput.selectionEnd, 2);
  assert.equal(c.textInput.selectionDirection, 'backward');
  assert.equal(c.metrics[1].el.textContent, 'Ω');
  c.redo();
  assert.equal(c.textInput.value, 'AX\nCYE');
  assert.deepEqual(plain(c.snapshotLetters()), revised);
  assert.deepEqual(Array.from(c.lineEnds), [2, 5]);
});

test('source revisions and artwork gestures share one ordered Undo/Redo stack', () => {
  const c = historyHarness();
  c.pushHistory(); decorate(c, 1);
  const decorated = plain(c.snapshotLetters());
  revise(c, 'AXCYE');
  c.pushHistory(); c.params.ink = '#abcdef'; c.batchProfiles.latin.marblingMass = 4;
  c.compositionState.phase = 0.88;
  assert.equal(c.undoStack.length, 3);
  c.undo(); assert.equal(c.params.ink, '#123456'); assert.equal(c.textInput.value, 'AXCYE');
  assert.equal(c.batchProfiles.latin.marblingMass, 2); assert.equal(c.compositionState.phase, 0.36);
  c.params.mode = 'grid'; c.params.activeOperator = 'stretch';
  c.undo(); assert.deepEqual(plain(c.snapshotLetters()), decorated);
  assert.equal(c.params.mode, 'grid'); assert.equal(c.params.activeOperator, 'stretch');
  c.undo(); assert.equal(c.readOperatorState(c.metrics[1], 'rotate').toggled, false);
  c.redo(); assert.equal(c.metrics[1].operatorStates.rotate.manual, 37);
  c.redo(); assert.equal(c.textInput.value, 'AXCYE');
  c.redo(); assert.equal(c.params.ink, '#abcdef'); assert.equal(c.compositionState.phase, 0.88);
});

test('pending typing is flushed before immediate Undo, gestures and control baselines', () => {
  for (const action of ['undo', 'gesture', 'control']) {
    const c = historyHarness(); decorate(c, 1);
    revise(c, 'AXCYE', false);
    assert.equal(c.renderedSourceText, 'ABCDE');
    if (action === 'undo') c.undo();
    else if (action === 'gesture') c.pushHistory();
    else c.beginControlHistory({ target: { id: 'pSomething', type: 'range', matches: () => true } });
    assert.equal(c.timerCount(), 0);
    if (action === 'undo') {
      assert.equal(c.textInput.value, 'ABCDE'); assert.equal(c.metrics[1].operatorStates.rotate.manual, 37);
      c.redo(); assert.equal(c.textInput.value, 'AXCYE');
    } else assert.equal(c.renderedSourceText, 'AXCYE');
    c.runTimers(); assert.equal(c.textInput.value, c.renderedSourceText, 'no stale draft callback');
  }
});

test('empty text, whitespace, Unicode and repeated letters round-trip without guessing identity on Undo', () => {
  for (const [initial, next] of [['ABABA', 'ABA'], ['A\n\nB\tC', ' \n\t'], ['', '永書'], ['Aか\u3099👨‍👩‍👧\nالعربية B', 'X👨‍👩‍👧\nالعربية C']]) {
    const c = historyHarness(initial);
    for (let i = 0; i < c.metrics.length; i++) decorate(c, i, i + 11);
    const old = plain(c.snapshotLetters());
    revise(c, next); const changed = plain(c.snapshotLetters());
    c.undo(); assert.equal(c.textInput.value, initial); assert.deepEqual(plain(c.snapshotLetters()), old);
    c.redo(); assert.equal(c.textInput.value, next); assert.deepEqual(plain(c.snapshotLetters()), changed);
  }
});

test('no-op source changes retain Redo; a real branch invalidates it; new documents clear both stacks', () => {
  const c = historyHarness();
  revise(c, 'ABXDE'); c.undo();
  revise(c, 'ABCDE'); assert.equal(c.redoStack.length, 1);
  revise(c, 'ABYDE'); assert.equal(c.redoStack.length, 0);
  c.createSpans('New'); assert.equal(c.undoStack.length, 0); assert.equal(c.redoStack.length, 0);
  assert.equal(c.renderedSourceText, 'New');
});

test('cancelable beforeinput and uncancelable/missing beforeinput route native history through document state', () => {
  for (const path of ['cancelable', 'uncancelable', 'missing']) {
    const c = historyHarness(); decorate(c, 1);
    revise(c, 'AXCYE', false);
    for (const type of ['historyUndo', 'historyRedo']) {
      if (path !== 'missing') {
        const event = c.dispatch('beforeinput', { inputType: type, cancelable: path === 'cancelable' });
        assert.equal(event.defaultPrevented, path === 'cancelable');
      }
      if (path !== 'cancelable') {
        c.textInput.value = 'native text-only result';
        c.dispatch('input', { inputType: type });
      }
      assert.equal(c.textInput.value, type === 'historyUndo' ? 'ABCDE' : 'AXCYE');
      if (type === 'historyUndo') assert.equal(c.metrics[1].operatorStates.rotate.manual, 37);
      c.runTimers(); assert.equal(c.textInput.value, c.renderedSourceText);
    }
  }
});

test('IME updates stay native and one committed source revision is recorded after compositionend', () => {
  const c = historyHarness('AB');
  c.dispatch('compositionstart');
  assert.equal(c.keepsNativeHistoryTarget(c.textInput), true);
  for (const text of ['AかB', 'AかんB', 'A漢B']) {
    const event = c.dispatch('beforeinput', { inputType: 'insertCompositionText', isComposing: true, cancelable: false });
    assert.equal(event.defaultPrevented, false);
    c.textInput.value = text;
    c.dispatch('input', { inputType: 'insertCompositionText', isComposing: true });
    c.runTimers(); c.undo();
    assert.equal(c.renderedSourceText, 'AB'); assert.equal(c.undoStack.length, 0);
  }
  c.dispatch('compositionend'); c.runTimers();
  assert.equal(c.undoStack.length, 1); assert.equal(c.renderedSourceText, 'A漢B');
  assert.equal(c.keepsNativeHistoryTarget(c.textInput), false);
  assert.equal(c.keepsNativeHistoryTarget({ tagName: 'INPUT', type: 'number' }), true);
  c.undo(); assert.equal(c.textInput.value, 'AB'); c.redo(); assert.equal(c.textInput.value, 'A漢B');
});

test('history preflight failure retains stack entries and the live document', () => {
  const c = historyHarness(); revise(c, 'AXCYE');
  const old = c.metrics, entry = c.undoStack[0];
  c.tokenizeLine = () => [];
  assert.throws(() => c.undo(), /no longer matches/);
  assert.equal(c.metrics, old); assert.equal(c.undoStack[0], entry); assert.equal(c.redoStack.length, 0);
});

test('source snapshots share unchanged presentation rows and never alias live mutable state', () => {
  const c = historyHarness(); decorate(c, 1);
  const first = c.snapDocumentState(), second = c.snapDocumentState();
  assert.equal(first.letters[1], second.letters[1]);
  c.metrics[1].operatorStates.rotate.manual = 92;
  c.metrics[1].el.dataset.lensX = '0.8';
  const third = c.snapDocumentState();
  assert.notEqual(first.letters[1], third.letters[1]);
  assert.equal(first.letters[1].s.o.rotate.m, 37); assert.equal(first.letters[1].data.lensX, undefined);
  assert.equal(first.letters[2], third.letters[2]);
  revise(c, 'ABCDX');
  const next = c.snapDocumentState();
  assert.equal(next.letters[1], third.letters[1], 'row sharing survives source rebuilding');
});

test('a new document cancels a queued draft and composition state from the previous document', () => {
  const c = historyHarness();
  revise(c, 'Old draft', false);
  assert.ok(c.timerCount() > 0);
  c.textInput.value = 'New project'; c.createSpans(c.textInput.value);
  assert.equal(c.timerCount(), 0); assert.equal(c.pendingTextValue, null);
  c.runTimers(); assert.equal(c.renderedSourceText, 'New project'); assert.equal(c.undoStack.length, 0);
  c.dispatch('compositionstart'); c.textInput.value = '未確定'; c.dispatch('input', { isComposing: true });
  c.textInput.value = 'Loaded'; c.createSpans(c.textInput.value);
  assert.equal(c.textComposing, false); assert.equal(c.pendingTextValue, null);
});

test('Project, Share and Look snapshots match live source/letters; autosave waits for IME commit', () => {
  const c = historyHarness(); decorate(c, 1);
  revise(c, 'AXCYE', false);
  const data = c.projectData();
  assert.equal(data.text, 'AXCYE'); assert.equal(data.letters.length, 5);
  c.undo();
  const restored = c.projectData();
  assert.equal(restored.text, 'ABCDE'); assert.equal(restored.letters[1].o.rotate.m, 37);
  c.dispatch('compositionstart'); c.textInput.value = '未確定';
  c.dispatch('input', { isComposing: true });
  for (const name of ['projectData', 'shareData', 'currentLookState']) assert.equal(c[name]().text, 'ABCDE');
  c.autosaveSuspended = false; c.autosaveDirty = true;
  let storageWrites = 0;
  c.localStorage = { getItem: () => null, setItem: () => storageWrites++ };
  c.AUTOSAVE_KEY = 'test'; c.AUTOSAVE_BACKUP_KEY = 'backup';
  c.saveAutosave(); assert.equal(storageWrites, 0); assert.equal(c.autosaveDirty, true);
  c.dispatch('compositionend'); c.runTimers(); c.saveAutosave(); assert.equal(storageWrites, 1);
});

test('desktop and mobile Undo availability includes a pending draft, but excludes active IME', () => {
  const c = historyHarness();
  const buttons = Object.fromEntries(['btnHeaderUndo', 'btnMobileUndo', 'btnHeaderRedo', 'btnMobileRedo'].map(id => [id, {}]));
  c.document.getElementById = id => buttons[id] || null;
  vm.runInContext(extract('syncHistoryControls'), c);
  c.syncHistoryControls(); assert.equal(buttons.btnMobileUndo.disabled, true);
  revise(c, 'AXCYE', false);
  assert.equal(buttons.btnHeaderUndo.disabled, false); assert.equal(buttons.btnMobileUndo.disabled, false);
  assert.equal(buttons.btnMobileRedo.disabled, true);
  c.undo(); assert.equal(buttons.btnHeaderRedo.disabled, false);
  c.dispatch('compositionstart');
  assert.equal(buttons.btnMobileUndo.disabled, true); assert.equal(buttons.btnMobileRedo.disabled, true);
  c.dispatch('compositionend'); c.runTimers(); c.syncHistoryControls();
  assert.equal(buttons.btnHeaderRedo.disabled, false);
});

test('3k / 10k / 50k source-history round trips keep decorated deletions; measure mock-DOM cost explicitly', t => {
  const line = '雨の午後、川沿いの道を歩いた。遠くの窓には灯りが残る。';
  for (const count of [3000, 10000, 50000]) {
    const source = line.repeat(Math.ceil(count / line.length)).slice(0, count);
    const c = historyHarness(source);
    decorate(c, 11); decorate(c, count - 12, 52);
    const initial = c.snapDocumentState();
    const revision = source.slice(0, 11) + '§' + source.slice(12, count - 12) + '※' + source.slice(count - 11);
    const start = performance.now(); revise(c, revision); const editMs = performance.now() - start;
    const edited = c.snapDocumentState();
    const shared = edited.letters.filter((row, i) => row === initial.letters[i]).length;
    assert.equal(shared, count - 2, 'unchanged rows share immutable presentation');
    const undoStart = performance.now(); c.undo(); const undoMs = performance.now() - undoStart;
    assert.equal(c.textInput.value, source); assert.equal(c.metrics[11].operatorStates.rotate.manual, 37);
    assert.equal(c.metrics[count - 12].operatorStates.rotate.manual, 52);
    const redoStart = performance.now(); c.redo(); const redoMs = performance.now() - redoStart;
    assert.equal(c.textInput.value, revision); assert.equal(c.metrics.length, count);
    const data = c.projectData(); assert.equal(data.text, revision); assert.equal(data.letters.length, count);
    t.diagnostic(JSON.stringify({ chars: count, editMs: +editMs.toFixed(1), undoMs: +undoMs.toFixed(1), redoMs: +redoMs.toFixed(1), sharedRows: shared,
      scope: 'actual history/source functions; mock DOM, four operator states and layout/paint stubs; not full-editor, browser, heap, export or iPhone performance' }));
  }
});

function withBatch(c) {
  c.batchMatchers = { all: () => true, none: () => false };
  c.schedule = () => {};
  vm.runInContext(['matchingBatchMetrics', 'batchToggle'].map(extract).join('\n'), c);
  return c;
}
const selectSource = (c, start, end, mode = 'range') => {
  c.textInput.setSelectionRange(start, end, 'forward'); c.dispatch('select');
  return c.captureSourceTarget(mode);
};
const inScope = c => Array.from(c.matchingBatchMetrics(c.batchMatchers.all, true), m => m.el.dataset.sourceText).join('');

test('source map uses exact UTF-16 offsets across CRLF, CR, empty paragraphs, graphemes and visual RTL order', () => {
  const text = 'Aか\u3099👨‍👩‍👧\r\n\r\nالعربية سلام\tB\rC\n';
  const c = sourceDomHarness(); c.createSpans(text);
  assert.deepEqual(plain(c.sourceParagraphs), [
    { start: 0, end: 11 }, { start: 13, end: 13 }, { start: 15, end: 29 }, { start: 30, end: 31 }, { start: 32, end: 32 }
  ]);
  for (const m of c.metrics) {
    const d = m.el.dataset;
    assert.equal(text.slice(+d.sourceStart, +d.sourceEnd), d.sourceText);
  }
  const rtl = c.metrics.filter(m => /[\u0600-\u06ff]/.test(m.el.dataset.sourceText));
  assert.equal(rtl[0].el.dataset.sourceText, 'سلام');
  assert.ok(+rtl[0].el.dataset.sourceStart > +rtl[1].el.dataset.sourceStart, 'offsets follow source, not visual order');
});

test('paragraph targets distinguish caret, exclusive end, blank paragraph and terminal newline', () => {
  const c = historyHarness('AB\n\nCD\nEF\n');
  for (const [start, end, expected, label] of [
    [1, 1, [0, 2], '段落 1'], [2, 2, [0, 2], '段落 1'], [3, 3, [3, 3], '段落 2'],
    [0, 4, [0, 3], '段落 1–2'], [4, 7, [4, 6], '段落 3'], [4, 8, [4, 9], '段落 3–4'],
    [10, 10, [10, 10], '段落 5']
  ]) {
    selectSource(c, start, end, 'paragraph');
    const bounds = c.sourceTargetBounds();
    assert.deepEqual([bounds.start, bounds.end], expected);
    assert.equal(c.sourceTargetLabel(), label);
  }
});

test('Text buttons capture a range or caret paragraph and open Apply without changing any effect', () => {
  const c = withBatch(historyHarness('AB\nCDE'));
  c.textInput.setSelectionRange(3, 5, 'forward'); c.dispatch('select');
  assert.equal(c.scopeControls.btnUseSourceRange.disabled, false);
  c.scopeControls.btnUseSourceRange.listeners.click();
  assert.equal(c.openedSection, 'apply'); assert.equal(c.focusedControl, 'pSourceScope');
  assert.equal(inScope(c), 'CD'); assert.equal(c.undoStack.length, 0);
  assert.ok(c.metrics.every(m => !c.operatorState(m, 'rotate').toggled));
  c.editSourceTarget(); assert.equal(c.openedSection, 'text');
  assert.deepEqual([c.textInput.selectionStart, c.textInput.selectionEnd], [3, 5]);
  c.textInput.setSelectionRange(4, 4); c.dispatch('select');
  assert.equal(c.scopeControls.btnUseSourceRange.disabled, true);
  c.scopeControls.btnUseSourceParagraphs.listeners.click();
  assert.equal(inScope(c), 'CDE'); assert.equal(c.sourceTargetLabel(), '段落 2');
  assert.match(c.scopeControls.sourceTargetPreview.textContent, /「CDE」/);
});

test('range follows surviving source through outside edits and includes insertions between anchors', () => {
  const c = withBatch(historyHarness('ABCDE'));
  selectSource(c, 2, 4);
  revise(c, 'XXABCPDEY');
  assert.equal(inScope(c), 'CPD');
  assert.deepEqual(plain(c.sourceTarget), { mode: 'range', start: 4, end: 7, valid: true });
  assert.equal(c.metrics.find(m => m.el.dataset.sourceText === 'D').el.dataset.sourceStart, '6', 'fresh offsets survive carry');
  c.undo(); assert.equal(inScope(c), 'CD');
  c.redo(); assert.equal(inScope(c), 'CPD');
});

test('deleting the selected source fails closed and Undo restores the scope, not replacement positions', () => {
  const c = withBatch(historyHarness('ABCDEF'));
  selectSource(c, 2, 4); revise(c, 'ABXYEF');
  assert.equal(c.sourceTarget.mode, 'range'); assert.equal(c.sourceTarget.valid, false);
  assert.equal(inScope(c), '');
  c.batchToggle(c.batchMatchers.all, true);
  assert.equal(c.undoStack.length, 1); assert.ok(c.metrics.every(m => !c.operatorState(m, 'rotate').toggled));
  c.updateSourceTargetUI(); assert.match(c.scopeControls.sourceTargetPreview.textContent, /選び直してください/);
  c.undo(); assert.equal(inScope(c), 'CD'); c.redo(); assert.equal(inScope(c), '');
});

test('paragraph scope follows line split/merge and is independent of display layout parameters', () => {
  const c = withBatch(historyHarness('A\nB C\nD'));
  selectSource(c, 3, 3, 'paragraph');
  revise(c, 'X\nB\nC\nY');
  assert.equal(inScope(c), 'BC'); assert.equal(c.sourceTargetLabel(), '段落 2–3');
  revise(c, 'X\nBC\nY');
  assert.equal(inScope(c), 'BC'); assert.equal(c.sourceTargetLabel(), '段落 2');
  const scope = plain(c.sourceTargetBounds());
  c.params.fontSize = 130; c.params.vertical = true; c.params.gridEnabled = true;
  assert.deepEqual(plain(c.sourceTargetBounds()), scope, 'explicit paragraphs are not wrapped lines or grid rows');
});

test('partial UTF-16 selection includes a whole grapheme or joining word without selecting its neighbours', () => {
  const text = 'Aか\u3099👨‍👩‍👧B العربية C';
  const c = withBatch(historyHarness(text));
  selectSource(c, 2, 3); assert.equal(inScope(c), 'か\u3099');
  selectSource(c, 4, 5); assert.equal(inScope(c), '👨‍👩‍👧');
  selectSource(c, text.indexOf('العربية') + 2, text.indexOf('العربية') + 3);
  assert.equal(inScope(c), 'العربية');
  c.batchToggle(c.batchMatchers.all, true);
  assert.deepEqual(Array.from(c.metrics.filter(m => c.operatorState(m, 'rotate').toggled), m => m.el.dataset.sourceText), ['العربية']);
});

test('scope reset and invalid scope never reuse stale offsets after editing another document', () => {
  const c = withBatch(historyHarness('ABCDE'));
  selectSource(c, 2, 4);
  const control = c.scopeControls.pSourceScope;
  control.value = 'all'; control.listeners.change({ target: control });
  assert.equal(c.sourceTarget.valid, false);
  revise(c, 'XXABCDE');
  control.value = 'range'; control.listeners.change({ target: control });
  assert.equal(inScope(c), '');
  control.value = 'unknown'; control.listeners.change({ target: control });
  assert.equal(inScope(c), '');
  c.textInput.value = 'New'; c.createSpans('New');
  assert.equal(c.sourceTarget.mode, 'all'); assert.equal(inScope(c), 'New');
});

test('Apply flushes a pending text revision before capturing metrics and remains separate in Undo', () => {
  const c = withBatch(historyHarness('ABCDE'));
  const old = c.metrics;
  revise(c, 'AXCYE', false);
  c.batchToggle(c.batchMatchers.all, true);
  assert.equal(c.renderedSourceText, 'AXCYE'); assert.notEqual(c.metrics, old);
  assert.ok(c.metrics.every(m => c.operatorState(m, 'rotate').toggled));
  assert.ok(old.every(m => !c.operatorState(m, 'rotate').toggled), 'no detached metric mutation');
  assert.equal(c.undoStack.length, 2);
  c.undo(); assert.equal(c.renderedSourceText, 'AXCYE');
  assert.ok(c.metrics.every(m => !c.operatorState(m, 'rotate').toggled));
  c.undo(); assert.equal(c.renderedSourceText, 'ABCDE');
});

test('IME blocks range capture and Apply; committed draft is captured before its debounce fires', () => {
  const c = withBatch(historyHarness('ABC'));
  c.dispatch('compositionstart'); c.textInput.value = 'A漢BC';
  c.textInput.setSelectionRange(1, 2); c.dispatch('input', { isComposing: true });
  assert.equal(c.scopeControls.btnUseSourceRange.disabled, true);
  assert.equal(c.scopeControls.btnUseSourceParagraphs.disabled, true);
  assert.equal(c.captureSourceTarget('range'), false); c.batchToggle(c.batchMatchers.all, true);
  assert.equal(c.undoStack.length, 0); assert.equal(c.renderedSourceText, 'ABC');
  c.dispatch('compositionend');
  assert.equal(c.captureSourceTarget('range'), true);
  assert.equal(c.renderedSourceText, 'A漢BC'); assert.equal(c.timerCount(), 0);
  assert.equal(inScope(c), '漢'); assert.equal(c.undoStack.length, 1);
});

test('10k paragraph Apply survives source editing and actual Project JSON state roundtrip (mock DOM, not file output)', () => {
  const source = ('雨の午後、川沿いの道を歩いた。\n灯りが残る窓。\n\n').repeat(400).slice(0, 10000);
  const c = withBatch(historyHarness(source));
  const at = source.indexOf('灯り', 3500), end = at + 3;
  selectSource(c, at, end, 'paragraph');
  const expectedText = source.slice(source.lastIndexOf('\n', at) + 1, source.indexOf('\n', end));
  assert.equal(inScope(c), expectedText);
  c.batchToggle(c.batchMatchers.all, true);
  const count = c.metrics.filter(m => c.operatorState(m, 'rotate').toggled).length;
  assert.equal(count, graphemes(expectedText).length);
  revise(c, '冒頭\n' + source.slice(0, 90) + '※' + source.slice(91));
  assert.equal(inScope(c), expectedText);
  const saved = JSON.parse(JSON.stringify(c.projectData()));
  c.textInput.value = saved.text; c.createSpans(saved.text); c.restoreStates(saved.letters);
  assert.equal(c.metrics.filter(m => c.operatorState(m, 'rotate').toggled).length, count);
  assert.equal(c.sourceTarget.mode, 'all', 'source selection is session navigation, not a saved Project field');
  assert.equal(c.metrics.length, graphemes(saved.text).filter(ch => !/^[\r\n\t \u00a0]$/.test(ch)).length);
});

test('Paragraph Current: 10k partial Apply, distant edits, common Undo/Redo and Project parameters/state roundtrip', () => {
  const source = ('雨の午後、川沿いの道を歩いた。\n灯りが残る窓。\n\n').repeat(400).slice(0, 10000);
  const c = withBatch(historyHarness(source));
  c.OPERATOR_IDS.push('paragraphCurrent'); c.OPERATOR_DEFS.paragraphCurrent = { short: 'pc' };
  c.OPERATOR_BY_SHORT.pc = 'paragraphCurrent';
  Object.assign(c.params, { activeOperator: 'paragraphCurrent', textMeasure: 32, currentFlow: 'crest',
    currentBend: -3.5, currentSpread: .75, currentFocus: .6, currentReach: .4, currentFollow: .8 });
  const at = source.indexOf('灯り', 3500);
  selectSource(c, at, at + 3, 'paragraph');
  c.batchToggle(c.batchMatchers.all, true);
  const countApplied = () => c.metrics.filter(m => c.operatorState(m, 'paragraphCurrent').toggled).length;
  const count = countApplied(); assert.ok(count > 0 && count < c.metrics.length);
  c.undo(); assert.equal(countApplied(), 0);
  c.redo(); assert.equal(countApplied(), count); assert.equal(c.params.currentBend, -3.5);
  revise(c, '冒頭\n' + source.slice(0, 90) + '※' + source.slice(91));
  assert.equal(countApplied(), count);
  const saved = JSON.parse(JSON.stringify(c.projectData()));
  assert.equal(saved.version, 92); assert.equal(saved.params.textMeasure, 32); assert.equal(saved.params.currentFlow, 'crest');
  c.textInput.value = saved.text; c.createSpans(saved.text); c.restoreStates(saved.letters);
  assert.equal(countApplied(), count);
  assert.equal(c.metrics.filter(m => c.operatorState(m, 'rotate').toggled).length, 0);
});

function withSourceParameters(c) {
  vm.runInContext(['SOURCE_PARAMETER_KEYS', 'BATCH_PARAM_OPTIONS', 'BATCH_PARAM_LIMITS'].map(name =>
    html.match(new RegExp('      var ' + name + ' = \\{[^]*?\\n      };'))[0]).join('\n'), c);
  vm.runInContext(['sourceParameterKey', 'normalizeSourceParameters', 'decodeSourceParameters', 'sourceParameterProfile',
    'sourceParameterTargets', 'writeSourceParameter', 'resetSourceParameters', 'applyShareData'].map(extract).join('\n'), c);
  vm.runInContext(html.match(/      var params = \{[^]*?\n      };/)[0].replace('var params', 'var layoutDefaults'), c);
  for (const key of [...c.SOURCE_PARAMETER_KEYS.paragraphCurrent, ...c.SOURCE_PARAMETER_KEYS.readingField]) {
    c.PARAM_DEFAULTS[key] = c.params[key] = c.layoutDefaults[key];
  }
  c.activeBatchProfile = 'all';
  c.BATCH_PARAM_KEYS = [...c.SOURCE_PARAMETER_KEYS.paragraphCurrent, ...c.SOURCE_PARAMETER_KEYS.readingField];
  c.batchProfileForKey = (key, m) => c.sourceParameterProfile(c.params, m);
  c.applyAllOperatorVisuals = () => {}; c.refreshBatchProfileControls = () => {};
  return c;
}

// Real Project save/load and change handler. FileReader transport, DOM/UI,
// composition normalization and parameter normalization are explicit mocks.
function withProjectFileHandlers(c) {
  const downloads = [], statuses = [], pending = [];
  Object.assign(c.PARAM_DEFAULTS, plain(c.layoutDefaults));
  c.params = { ...plain(c.PARAM_DEFAULTS), ...c.params };
  const controls = Object.fromEntries(['projFile', 'btnSaveProj', 'btnLoadProj'].map(id => [id, {
    value: '', files: [], listeners: {}, click() {}, addEventListener(type, fn) { this.listeners[type] = fn; }
  }]));
  const originalGet = c.document.getElementById;
  c.document.getElementById = id => controls[id] || originalGet(id);
  Object.assign(c, { Blob, SURFACE_OPERATOR_IDS: [], GLYPH_BODY_OPERATOR_IDS: [],
    compositionInspector: 'field', COMPOSITION_DEFS: { field: {} }, normalizeLookMemory: plain,
    syncLookMemoryUI() {}, updateProofSheetAvailability() {}, lookMemoryBeforeRecall: null,
    stamp: () => 'test', downloadOutcomeLabel: () => 'download started',
    setProjectActionStatus: (message, state) => statuses.push({ message, state }),
    download: (blob, filename) => { downloads.push({ blob, filename }); return 'download'; },
    FileReader: class {
      readAsText(file) {
        pending.push(file.text().then(text => { this.result = text; this.onload(); }, () => this.onerror()));
      }
    }
  });
  vm.runInContext(['saveProject', 'isProjectData', 'projectLoadError', 'loadProject'].map(extract).join('\n'), c);
  const start = html.indexOf("      document.getElementById('btnSaveProj').addEventListener");
  const end = html.indexOf('      /* ---------------- autosave', start);
  assert.ok(start > 0 && end > start); vm.runInContext(html.slice(start, end), c);
  return { downloads, statuses, controls, async read(blob) {
    controls.projFile.files = [{ name: 'roundtrip.json', size: blob.size, text: () => blob.text() }];
    controls.projFile.listeners.change(); await Promise.all(pending.splice(0));
  } };
}

test('10k Current and Reading: real Project handlers to native PNG and SVG after remote source edits', async t => {
  for (const kind of ['paragraphCurrent', 'readingField']) {
    const source = '雨の午後、川沿いの道を歩いた。窓の灯りと行間の余白。\n'.repeat(400).slice(0, 10000);
    assert.equal(source.length, 10000);
    const c = withSourceParameters(withBatch(historyHarness(source)));
    const short = kind === 'paragraphCurrent' ? 'pc' : 'rf';
    c.OPERATOR_IDS.push(kind); c.OPERATOR_DEFS[kind] = { short }; c.OPERATOR_BY_SHORT[short] = kind;
    c.params.activeOperator = kind; selectSource(c, 2100, 3400);
    c.batchToggle(c.batchMatchers.all, true);
    // This harness has no animation frames: explicitly settle Apply's easing.
    // Test active paint, not only toggles saved before their first visible frame.
    for (const m of c.metrics) if (c.operatorState(m, kind).toggled) c.operatorState(m, kind).current = 1;
    c.writeSourceParameter(kind === 'paragraphCurrent' ? 'currentBend' : 'readingPressure', 2.2);
    revise(c, '冒頭\n' + source.slice(0, 90) + '※' + source.slice(91, 9800) + '終' + source.slice(9801));
    const savedStates = plain(c.metrics.map(c.letterState)), savedSource = c.renderedSourceText;
    const applied = savedStates.filter(s => s.o?.[kind]?.t).length;
    assert.ok(applied > 1000 && applied < 1400, 'real nonempty partial effect');
    assert.equal(savedStates.filter(s => s.o?.[kind]?.i > 0).length, applied);
    const files = withProjectFileHandlers(c);
    files.controls.btnSaveProj.listeners.click(); assert.equal(files.downloads.length, 1);
    const savedBlob = files.downloads[0].blob;
    revise(c, '別の作品'); await files.read(savedBlob);
    assert.equal(files.statuses.at(-1).state, 'done', files.statuses.at(-1).message);
    assert.equal(c.renderedSourceText, savedSource); assert.deepEqual(plain(c.metrics.map(c.letterState)), savedStates);
    assert.equal(c.sourceParameterMode, 'base');
    const out = exportFixture(), original = exportFixture();
    for (const env of [out, original]) Object.assign(env.c.params, {
      fontFamily: '"Yu Mincho"', fontSize: 18, artboard: 'auto',
      currentFlow: c.params.currentFlow, currentBend: c.params.currentBend, readingPressure: c.params.readingPressure
    });
    original.c.setSource(savedSource, kind, savedStates);
    out.c.setSource(c.renderedSourceText, kind, plain(c.metrics.map(c.letterState)));
    const active = out.c.snapshotGlyphs();
    assert.ok(active.some(g => kind === 'paragraphCurrent' ? Math.abs(g.ty) > 1 : Math.abs(g.scaleX - 1) > .01), 'effect is actually painted');
    assert.deepEqual(plain(out.c.snapshotGlyphs()), plain(original.c.snapshotGlyphs()));
    const before = original.c.renderCanvas(1).toBuffer('image/png');
    out.c.exportPng(); out.c.runSvgExport();
    assert.equal(out.downloads.length, 2, out.statuses.at(-1)?.message);
    const png = Buffer.from(await out.downloads[0].blob.arrayBuffer());
    assert.deepEqual(png, before, 'exact same native PNG after Project handler roundtrip');
    const svg = await out.downloads[1].blob.text();
    assert.equal((svg.match(/<text /g) || []).length, c.metrics.length, 'no dropped glyphs');
    assert.ok(svg.includes(savedSource.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\n','\\n')));
    if (process.env.TYPE_DEFORMER_EXPORT_EVIDENCE) {
      const directory = process.env.TYPE_DEFORMER_EXPORT_EVIDENCE; fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, kind + '.json'), Buffer.from(await savedBlob.arrayBuffer()));
      fs.writeFileSync(path.join(directory, kind + '.png'), png); fs.writeFileSync(path.join(directory, kind + '.svg'), svg);
    }
    t.diagnostic(kind + ': ' + c.metrics.length + ' glyphs, ' + applied + ' applied, Project ' + savedBlob.size + ' bytes, PNG ' + png.length + ', SVG ' + svg.length);
  }
});

test('1万字の見開き: textarea selectionchange and page buttons to Apply, edit, Undo, Project/Share and native PNG/SVG roundtrip', async t => {
  const source = ('雨が止むまで、頁をひらいた。余白にもう一つの声が残る。 The page remains open.\n\n').repeat(220).slice(0, 10000);
  assert.equal(source.length, 10000);
  const c = withSourceParameters(withBatch(historyHarness(source))), files = withProjectFileHandlers(c);
  if (!c.OPERATOR_IDS.includes('paragraphCurrent')) c.OPERATOR_IDS.push('paragraphCurrent');
  c.OPERATOR_DEFS.paragraphCurrent = { short: 'pc' }; c.OPERATOR_BY_SHORT.pc = 'paragraphCurrent';
  Object.assign(c.params, { pageLayout: 'spreads', pageDepth: 28, pageKeepLines: 3, pageGutter: 4, pageGap: 8,
    pageOrder: 'rtl', textMeasure: 28, fontSize: 18, lineHeight: 1.5, paragraphGap: 2.25, activeOperator: 'paragraphCurrent',
    fontFamily: '"Yu Mincho"', currentBend: 2.1, currentSpread: .25 });
  const measured = exportFixture();
  Object.assign(measured.c.params, c.params);
  setMeasuredPageSource(measured.c, source, null, { paragraphSpacing: true });
  c.pageLayoutState = measured.c.pageLayoutState; c.pageSourceIndex = measured.c.pageSourceIndex; c.metricsDirty = false;
  c.scopeControls.sourceLayoutTarget = { hidden: true }; c.scopeControls.sourceLayoutLocation = { textContent: '' };
  // The registered textarea/button handlers are actual code; native wrapping and
  // event dispatch remain explicit mocks. No page number is entered by the user.
  c.textInput.setSelectionRange(c.pageLayoutState.pages[2].start, c.pageLayoutState.pages[2].start);
  const unselected = plain(c.sourceTarget);
  c.dispatch('selectionchange');
  assert.match(c.scopeControls.sourceLayoutLocation.textContent, /ページ 3 \/ 見開き 2/);
  assert.equal(c.scopeControls.btnUseSourceSpreads.disabled, false);
  assert.deepEqual(plain(c.sourceTarget), unselected, 'caret navigation never changes the Apply target');
  c.scopeControls.btnUseSourceSpreads.listeners.click();
  assert.equal(c.openedSection, 'apply'); assert.equal(c.focusedControl, 'pSourceScope');
  // Subsequent edits mark the measured index stale; this fixture does not pretend
  // to run browser reflow. Actual native-output measurement is exercised below.
  c.schedule = () => {}; c.invalidateCompositionSource = () => {};
  vm.runInContext(extract('scheduleMeasure'), c);
  const captured = plain(c.sourceTarget), expected = measured.c.pageLayoutState.pages.slice(2,4).reduce((n,p) => n+p.glyphs, 0);
  c.batchToggle(c.batchMatchers.all, true);
  assert.equal(c.metrics.filter(m => c.operatorState(m, 'paragraphCurrent').toggled).length, expected);
  for (const m of c.metrics) if (c.operatorState(m, 'paragraphCurrent').toggled) c.operatorState(m, 'paragraphCurrent').current = 1;
  c.writeSourceParameter('currentBend', -2.5);
  c.pushHistory(); c.params.paragraphGap=0; c.undo(); assert.equal(c.params.paragraphGap,2.25);
  c.redo(); assert.equal(c.params.paragraphGap,0); c.undo();
  c.pushHistory(); c.params.pageKeepLines=1; c.undo(); assert.equal(c.params.pageKeepLines,3);
  c.redo(); assert.equal(c.params.pageKeepLines,1); c.undo();
  c.pushHistory(); c.params.pageGutter = 12; c.undo(); assert.equal(c.params.pageGutter, 4);
  c.redo(); assert.equal(c.params.pageGutter, 12); c.undo();
  revise(c, '前書き\n' + source.slice(0, 30) + '※' + source.slice(31));
  assert.ok(c.sourceTarget.start > captured.start, 'selection stays anchored to source, not old page number');
  const data = plain(c.projectData()), state = plain(c.metrics.map(c.letterState));
  const original = exportFixture(); Object.assign(original.c.params, data.params, { artboard: 'auto', exportScale: .5 });
  setMeasuredPageSource(original.c, data.text, state, { paragraphSpacing: true });
  assert.ok(original.c.snapshotGlyphs().some(g => Math.abs(g.ty) > 1), 'nonzero page-local flow is actually painted');
  assert.throws(() => original.c.renderCanvas(1), { code: 'CANVAS_TOO_LARGE' }, 'expanded 10k spread must explicitly refuse an oversized 1x PNG, not silently reduce it');
  const before = original.c.renderCanvas(.5).toBuffer('image/png');
  files.controls.btnSaveProj.listeners.click(); revise(c, '別の原文'); await files.read(files.downloads.at(-1).blob);
  assert.equal(c.renderedSourceText, data.text); assert.deepEqual(plain(c.metrics.map(c.letterState)), state);
  for (const key of ['paragraphGap','pageLayout','pageDepth','pageKeepLines','pageGutter','pageGap','pageOrder']) assert.equal(c.params[key], data.params[key]);
  const out = exportFixture(); Object.assign(out.c.params, c.params, { artboard: 'auto', exportScale: .5 });
  setMeasuredPageSource(out.c, c.renderedSourceText, plain(c.metrics.map(c.letterState)), { paragraphSpacing: true });
  assert.deepEqual(plain(out.c.pageLayoutState), plain(original.c.pageLayoutState));
  out.c.exportPng(); out.c.runSvgExport(); assert.equal(out.downloads.length, 2);
  assert.deepEqual(Buffer.from(await out.downloads[0].blob.arrayBuffer()), before);
  const svg = await out.downloads[1].blob.text(); assert.equal((svg.match(/<text /g) || []).length, c.metrics.length);
  assert.ok(svg.includes('pageLayout'));
  assert.ok(svg.includes('&quot;gapEm&quot;:2.25') || svg.includes('"gapEm":2.25'));
  const shared = plain(c.shareData()); c.params.pageLayout = 'continuous'; c.applyShareData(shared);
  assert.equal(c.params.pageLayout, 'spreads'); assert.equal(c.params.pageOrder, 'rtl'); assert.equal(c.params.pageKeepLines,3);
  assert.equal(c.params.paragraphGap,2.25);
  const v52 = plain(data); v52.version=52; delete v52.params.paragraphGap;
  assert.equal(c.loadProject(v52,true),true); assert.equal(c.params.paragraphGap,.55,'old artworks retain their fixed gap rather than inheriting the open document');
  const v50 = plain(data); v50.version = 50; delete v50.params.pageKeepLines;
  assert.equal(c.loadProject(v50,true),true); assert.equal(c.params.pageKeepLines,1,'old page boundaries remain opt-in');
  const legacy = plain(data); legacy.version = 49;
  for (const key of ['pageLayout','pageDepth','pageKeepLines','pageGutter','pageGap','pageOrder']) delete legacy.params[key];
  assert.equal(c.loadProject(legacy, true), true); assert.equal(c.params.pageLayout, 'continuous');
  t.diagnostic(`${data.text.length} source units, ${state.length} glyphs, ${expected} targeted, ${out.c.pageLayoutState.pages.length} pages, explicit 0.5x PNG ${before.length} bytes (1x rejected by size limit); native output + mocked file handlers, not browser CSS/UI`);
});

test('10k Reading page/spread scope survives partial Apply, separated edits, Undo, Project, Share, Look and native output', async t => {
  const passage='同じ頁に二つの声がある。片方は読める距離にとどまり、もう片方は余白へ集まる。 A page holds two voices. Nothing has been erased.\n';
  const source=passage.repeat(Math.ceil(10000/passage.length)).slice(0,10000);
  const c=withSourceParameters(withBatch(historyHarness(source))),files=withProjectFileHandlers(c);
  if(!c.OPERATOR_IDS.includes('readingField')) c.OPERATOR_IDS.push('readingField');
  c.OPERATOR_DEFS.readingField={short:'rf'};c.OPERATOR_BY_SHORT.rf='readingField';
  Object.assign(c.params,{activeOperator:'readingField',readingScope:'spread',readingPressure:2.4,readingWidth:.38,readingHeight:.65,
    readingFocusU:.23,readingFocusV:.5,pageLayout:'spreads',textMeasure:32,pageDepth:32,paragraphGap:.55,
    fontFamily:'"Yu Mincho"',fontSize:18,lineHeight:1.5,artboard:'auto',exportScale:1});
  selectSource(c,1000,9000);c.batchToggle(c.batchMatchers.all,true);
  for(const m of c.metrics) if(c.operatorState(m,'readingField').toggled) c.operatorState(m,'readingField').current=1;
  selectSource(c,3000,3600);c.pushHistory();assert.equal(c.writeSourceParameter('readingScope','page'),true);
  c.undo();assert.ok(c.metrics.every(m=>!m.localParams?.readingScope));c.redo();
  assert.ok(c.metrics.some(m=>m.localParams?.readingScope==='page'));
  revise(c,'冒頭\n'+source.slice(0,200)+'※'+source.slice(201,9700)+'終'+source.slice(9701));
  const saved=plain(c.projectData()),state=plain(c.metrics.map(c.letterState));
  const render=(params,text,letters)=>{const env=exportFixture();Object.assign(env.c.params,params);
    setMeasuredPageSource(env.c,text,letters,{paragraphSpacing:true});return env;};
  const original=render(saved.params,saved.text,state),before=original.c.renderCanvas(1).toBuffer('image/png');
  const active=original.c.snapshotGlyphs(true);assert.ok(active.some(g=>g.scaleX<.9));assert.ok(active.some(g=>g.scaleX===1));
  files.controls.btnSaveProj.listeners.click();revise(c,'別');c.params.readingScope='document';await files.read(files.downloads.at(-1).blob);
  assert.equal(c.params.readingScope,'spread');assert.equal(c.renderedSourceText,saved.text);assert.deepEqual(plain(c.metrics.map(c.letterState)),state);
  const restored=render(c.params,c.renderedSourceText,plain(c.metrics.map(c.letterState)));
  restored.c.exportPng();restored.c.runSvgExport();assert.equal(restored.downloads.length,2);
  assert.deepEqual(Buffer.from(await restored.downloads[0].blob.arrayBuffer()),before);
  const svg=await restored.downloads[1].blob.text();assert.equal((svg.match(/<text /g)||[]).length,c.metrics.length);
  assert.ok(svg.includes('spread'));
  const shared=plain(c.shareData());c.params.readingScope='paragraph';assert.equal(c.applyShareData(shared),true);
  assert.equal(c.params.readingScope,'spread');assert.deepEqual(plain(c.metrics.map(c.letterState)),state);
  vm.runInContext(['cloneKnownParams','normalizeLookState','applyLookState'].map(extract).join('\n'),c);
  const look=c.normalizeLookState(plain(c.currentLookState()));c.lookMemory={slots:[],active:-1};c.params.readingScope='page';
  assert.equal(c.applyLookState(look,0,true),true);assert.equal(c.params.readingScope,'spread');
  const old=plain(saved);old.version=53;old.params.readingScope='paragraph';assert.equal(c.loadProject(old,true),true);assert.equal(c.params.readingScope,'paragraph');
  t.diagnostic(`${saved.text.length} source units / ${state.length} glyphs / ${original.c.pageLayoutState.pages.length} pages / PNG ${before.length} bytes; real handlers + native/synthetic output, not browser UI`);
});

test('10k page export keeps Current/Reading through remote edits, region Undo, Project, Share, Look and native PNG/SVG', async t => {
  const passage='雨の音を記した頁。余白を残して次の声へ。 The same words remain.\n';
  const source=passage.repeat(Math.ceil(10000/passage.length)).slice(0,10000);
  const c=withSourceParameters(withBatch(historyHarness(source))),files=withProjectFileHandlers(c);
  for(const [id,short] of [['paragraphCurrent','pc'],['readingField','rf']]){
    if(!c.OPERATOR_IDS.includes(id))c.OPERATOR_IDS.push(id);c.OPERATOR_DEFS[id]={short};c.OPERATOR_BY_SHORT[short]=id;
    c.params.activeOperator=id;selectSource(c,1000,7000);c.batchToggle(c.batchMatchers.all,true);
    for(const m of c.metrics)if(c.operatorState(m,id).toggled)c.operatorState(m,id).current=1;
  }
  Object.assign(c.params,{pageLayout:'spreads',textMeasure:28,pageDepth:28,pageKeepLines:2,paragraphGap:.75,
    fontFamily:'"Yu Mincho"',fontSize:18,lineHeight:1.5,readingScope:'spread',readingPressure:2.1,currentBend:1.2,
    artboard:'auto',exportScale:1,exportRegion:'work',exportRegionNumber:1});
  c.updateExportInfo=()=>{};c.updateExportRegionUI=()=>{};c.scheduleParameterUIRefresh=()=>{};vm.runInContext(extract('setExportRegion'),c);
  const target=plain(c.sourceTarget);c.setExportRegion('spread',2);c.undo();assert.equal(c.params.exportRegion,'work');
  c.redo();assert.equal(c.params.exportRegion,'spread');assert.equal(c.params.exportRegionNumber,2);assert.deepEqual(plain(c.sourceTarget),target);
  revise(c,'冒頭\n'+source.slice(0,200)+'※'+source.slice(201,9700)+'終'+source.slice(9701));
  const saved=plain(c.projectData()),states=plain(c.metrics.map(c.letterState));
  const render=()=>{const e=exportFixture();Object.assign(e.c.params,c.params);setMeasuredPageSource(e.c,c.renderedSourceText,plain(c.metrics.map(c.letterState)),{paragraphSpacing:true});return e;};
  const before=render(),png=before.c.renderCanvas(1).toBuffer('image/png');
  files.controls.btnSaveProj.listeners.click();revise(c,'別');c.params.exportRegion='page';c.params.exportRegionNumber=1;
  await files.read(files.downloads.at(-1).blob);assert.equal(c.renderedSourceText,saved.text);assert.deepEqual(plain(c.metrics.map(c.letterState)),states);
  assert.equal(c.params.exportRegion,'spread');assert.equal(c.params.exportRegionNumber,2);
  const after=render();after.c.exportPng();after.c.runSvgExport();assert.equal(after.downloads.length,2);
  assert.deepEqual(Buffer.from(await after.downloads[0].blob.arrayBuffer()),png);
  assert.match(await after.downloads[1].blob.text(),/"exportRegion":\{"kind":"spread","number":2/);
  const shared=plain(c.shareData());c.params.exportRegion='work';assert.equal(c.applyShareData(shared),true);assert.equal(c.params.exportRegion,'spread');
  vm.runInContext(['cloneKnownParams','normalizeLookState','applyLookState'].map(extract).join('\n'),c);
  const look=c.normalizeLookState(plain(c.currentLookState()));c.lookMemory={slots:[],active:-1};c.params.exportRegion='page';
  assert.equal(c.applyLookState(look,0,true),true);assert.equal(c.params.exportRegion,'spread');assert.equal(c.params.exportRegionNumber,2);
  const old=plain(saved);old.version=55;delete old.params.exportRegion;delete old.params.exportRegionNumber;
  assert.equal(c.loadProject(old,true),true);assert.equal(c.params.exportRegion,'work');assert.equal(c.params.exportRegionNumber,1);
  t.diagnostic(`${saved.text.length} source units / ${states.length} glyphs / ${before.c.pageLayoutState.pages.length} pages / cropped PNG ${png.length} bytes; actual state/file handlers with native raster + synthetic layout, not browser`);
});

test('Riso tonal settings survive Apply, source edit, Undo, Project handlers, Share and Look with native master reproduction', async () => {
  const c=withSourceParameters(withBatch(historyHarness('ABO\nCD'))),files=withProjectFileHandlers(c);
  c.OPERATOR_IDS.push('risoSeparation');c.OPERATOR_DEFS.risoSeparation={short:'i'};c.OPERATOR_BY_SHORT.i='risoSeparation';
  Object.assign(c.params,{activeOperator:'risoSeparation',risoPlateMap:'duotone',risoToneDepth:38.5,risoScreenPitch:2.25,risoColorA:'#e43519',risoColorB:'#162555',risoRegister:2});
  selectSource(c,1,3);c.batchToggle(c.batchMatchers.all,true);
  const applied=()=>c.metrics.filter(m=>c.operatorState(m,'risoSeparation').toggled).length;
  assert.equal(applied(),2);
  c.pushHistory();c.params.risoScreenPitch=29;c.undo();assert.equal(c.params.risoScreenPitch,2.25);
  c.redo();assert.equal(c.params.risoScreenPitch,29);c.undo();
  revise(c,'XABO\nCD');assert.equal(applied(),2);
  const original=plain(c.projectData()),nativeMask=risoTextMask('B O',95,'Times New Roman',270,180);
  const expected=risoFixture(nativeMask,c.params).render('duotone').toBuffer('image/png');
  files.controls.btnSaveProj.listeners.click();c.params.risoToneDepth=0;revise(c,'別');await files.read(files.downloads.at(-1).blob);
  assert.equal(c.renderedSourceText,original.text);assert.equal(applied(),2);assert.equal(c.params.risoToneDepth,38.5);assert.equal(c.params.risoScreenPitch,2.25);
  assert.deepEqual(plain(c.metrics.map(c.letterState)),original.letters);
  const shared=plain(c.shareData());c.params.risoPlateMap='area';assert.equal(c.applyShareData(shared),true);assert.equal(c.params.risoPlateMap,'duotone');
  vm.runInContext(['cloneKnownParams','normalizeLookState','applyLookState'].map(extract).join('\n'),c);
  const look=c.normalizeLookState(plain(c.currentLookState()));c.lookMemory={slots:[],active:-1};
  c.params.risoScreenPitch=48;assert.equal(c.applyLookState(look,0,true),true);assert.equal(c.params.risoScreenPitch,2.25);
  assert.deepEqual(risoFixture(nativeMask,c.params).render('duotone').toBuffer('image/png'),expected,'native supplied-mask output is reproduced; not full UI/export proof');
  const old=plain(original);old.version=51;old.params.risoPlateMap='area';delete old.params.risoToneDepth;delete old.params.risoScreenPitch;
  assert.equal(c.loadProject(old,true),true);assert.equal(c.params.risoPlateMap,'area');assert.equal(c.params.risoToneDepth,24);assert.equal(c.params.risoScreenPitch,7);
});

test('Hatch Copperplate survives Apply, source edits, Undo, Project handlers, Share and Look with native ink reproduction', async () => {
  const c=withSourceParameters(withBatch(historyHarness('ABO\nCD'))),files=withProjectFileHandlers(c);
  c.OPERATOR_IDS.push('hatchEngrave');c.OPERATOR_DEFS.hatchEngrave={short:'h'};c.OPERATOR_BY_SHORT.h='hatchEngrave';
  Object.assign(c.params,{activeOperator:'hatchEngrave',hatchGrammar:'copperplate',hatchDepth:2.25,hatchSpacing:3,hatchWarp:1.2,hatchColor:'#953015'});
  selectSource(c,1,3);c.batchToggle(c.batchMatchers.all,true);
  const applied=()=>c.metrics.filter(m=>c.operatorState(m,'hatchEngrave').toggled).length;
  assert.equal(applied(),2);c.pushHistory();c.params.hatchSpacing=29;c.undo();assert.equal(c.params.hatchSpacing,3);
  c.redo();assert.equal(c.params.hatchSpacing,29);c.undo();
  revise(c,'XABO\nCD!');assert.equal(applied(),2);
  const original=plain(c.projectData()),nativeMask=hatchTextMask('B O',95,'Times New Roman',270,180);
  const expected=hatchFixture(nativeMask,c.params).render('copperplate').toBuffer('image/png');
  files.controls.btnSaveProj.listeners.click();c.params.hatchGrammar='tonal';revise(c,'別');await files.read(files.downloads.at(-1).blob);
  assert.equal(c.renderedSourceText,original.text);assert.equal(applied(),2);assert.equal(c.params.hatchGrammar,'copperplate');
  assert.deepEqual(plain(c.metrics.map(c.letterState)),original.letters);
  const shared=plain(c.shareData());c.params.hatchGrammar='woodcut';assert.equal(c.applyShareData(shared),true);assert.equal(c.params.hatchGrammar,'copperplate');
  vm.runInContext(['cloneKnownParams','normalizeLookState','applyLookState'].map(extract).join('\n'),c);
  const look=c.normalizeLookState(plain(c.currentLookState()));c.lookMemory={slots:[],active:-1};
  c.params.hatchGrammar='crosscut';assert.equal(c.applyLookState(look,0,true),true);assert.equal(c.params.hatchGrammar,'copperplate');
  assert.deepEqual(hatchFixture(nativeMask,c.params).render('copperplate').toBuffer('image/png'),expected,'supplied-mask renderer, not actual export UI');
  const old=plain(original);old.version=54;old.params.hatchGrammar='tonal';
  assert.equal(c.loadProject(old,true),true);assert.equal(c.params.hatchGrammar,'tonal','prior mode never changes on migration');
});

test('Chrome Studio survives Apply, source edits, Undo, Project handlers, Share and Look while old files retain Acid defaults', async () => {
  const c=withSourceParameters(withBatch(historyHarness('ABO\nCD'))),files=withProjectFileHandlers(c);
  c.OPERATOR_IDS.push('chromeReliquary');c.OPERATOR_DEFS.chromeReliquary={short:'cr'};c.OPERATOR_BY_SHORT.cr='chromeReliquary';
  Object.assign(c.params,{activeOperator:'chromeReliquary',chromeModel:'studio',chromeRoughness:.67,chromeBevel:42,chromeBands:17,chromeVoltage:5.4});
  selectSource(c,1,3);c.batchToggle(c.batchMatchers.all,true);
  const applied=()=>c.metrics.filter(m=>c.operatorState(m,'chromeReliquary').toggled).length;
  assert.equal(applied(),2);c.pushHistory();c.params.chromeRoughness=.94;c.undo();assert.equal(c.params.chromeRoughness,.67);
  c.redo();assert.equal(c.params.chromeRoughness,.94);c.undo();revise(c,'XABO\nCD!');assert.equal(applied(),2);
  const original=plain(c.projectData());files.controls.btnSaveProj.listeners.click();c.params.chromeModel='acid';c.params.chromeRoughness=.12;revise(c,'別');
  await files.read(files.downloads.at(-1).blob);assert.equal(c.renderedSourceText,original.text);assert.equal(applied(),2);
  assert.equal(c.params.chromeModel,'studio');assert.equal(c.params.chromeRoughness,.67);assert.equal(c.params.chromeBevel,42);
  assert.deepEqual(plain(c.metrics.map(c.letterState)),original.letters);
  const shared=plain(c.shareData());c.params.chromeModel='acid';assert.equal(c.applyShareData(shared),true);assert.equal(c.params.chromeModel,'studio');
  vm.runInContext(['cloneKnownParams','normalizeLookState','applyLookState'].map(extract).join('\n'),c);
  const look=c.normalizeLookState(plain(c.currentLookState()));c.lookMemory={slots:[],active:-1};
  c.params.chromeRoughness=.04;assert.equal(c.applyLookState(look,0,true),true);assert.equal(c.params.chromeRoughness,.67);
  const old=plain(original);old.version=55;delete old.params.chromeModel;delete old.params.chromeRoughness;
  assert.equal(c.loadProject(old,true),true);assert.equal(c.params.chromeModel,'acid');assert.equal(c.params.chromeRoughness,.12);
});

test('Look retains its schema version through normalization and real recall instead of forcing modern operators into legacy renderers', () => {
  const c=withSourceParameters(withBatch(historyHarness('版面とLook'))); withProjectFileHandlers(c);
  Object.assign(c.params,{pageLayout:'spreads',pageKeepLines:4,paragraphGap:1.75,counterformGrammar:'chamber',voidPerspective:'aperture',ribbonPath:'lamina'});
  vm.runInContext(['normalizeLookState','applyLookState'].map(extract).join('\n'),c);
  const saved=plain(c.currentLookState());
  assert.equal(saved.version, 92);
  const original=plain(saved),normalized=c.normalizeLookState(saved);
  assert.equal(normalized.version, 92); assert.deepEqual(plain(saved),original);
  c.lookMemory={slots:[],active:-1}; c.syncLookMemoryUI=()=>{};
  c.params.pageKeepLines=1; c.params.paragraphGap=0; c.params.counterformGrammar='legacy';
  assert.equal(c.applyLookState(saved,0,true),true);
  assert.equal(c.params.pageKeepLines,4); assert.equal(c.params.counterformGrammar,'chamber'); assert.equal(c.params.ribbonPath,'lamina');
  assert.equal(c.lookMemory.active,0);
  assert.equal(c.params.paragraphGap,1.75);
  for(const version of [28,43,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91]) assert.equal(c.normalizeLookState({...saved,version}).version,version);
  for(const version of [0,-1,28.5,NaN,Infinity,saved.version+1,'bad']) assert.equal(c.normalizeLookState({...saved,version}),null);
  const unversioned={...saved}; delete unversioned.version;
  assert.equal(c.normalizeLookState(unversioned).version,28,'genuinely unversioned historical Looks retain the existing default');
});

test('Contour v57 starts in Relief/Ghost while partial and explicit older Projects retain their terrain contract', () => {
  const c=withSourceParameters(withBatch(historyHarness('地形 B&O'))); withProjectFileHandlers(c);
  Object.assign(c, {
    SURFACE_OPERATOR_IDS:['contourEtch'], GLYPH_BODY_OPERATOR_IDS:[],
    SURFACE_SOURCE_OPACITY_KEYS:{contourEtch:'contourSourceOpacity'},
    SURFACE_SOURCE_MODE_KEYS:{contourEtch:'contourSourceMode'}
  });
  const fresh=plain(c.projectData());
  assert.equal(fresh.version, 92); assert.equal(fresh.params.contourGrammar,'relief'); assert.equal(fresh.params.contourSourceMode,'ghost');

  const partialV56=plain(fresh); partialV56.version=56;
  delete partialV56.params.contourGrammar; delete partialV56.params.contourSourceMode; delete partialV56.params.contourSourceOpacity;
  assert.equal(c.loadProject(partialV56,true),true);
  assert.equal(c.params.contourGrammar,'index'); assert.equal(c.params.contourSourceOpacity,1);

  const partialV24=plain(fresh); partialV24.version=24;
  delete partialV24.params.contourGrammar; delete partialV24.params.contourRelief;
  delete partialV24.params.contourSourceMode; delete partialV24.params.contourSourceOpacity;
  assert.equal(c.loadProject(partialV24,true),true);
  assert.equal(c.params.contourGrammar,'legacy'); assert.equal(c.params.contourRelief,0); assert.equal(c.params.contourSourceOpacity,1);

  const explicitV56=plain(fresh); explicitV56.version=56;
  explicitV56.params.contourGrammar='watershed'; explicitV56.params.contourSourceMode='hide'; delete explicitV56.params.contourSourceOpacity;
  assert.equal(c.loadProject(explicitV56,true),true);
  assert.equal(c.params.contourGrammar,'watershed'); assert.equal(c.params.contourSourceOpacity,0);
});

test('Raster v58 starts in Gravure while partial and explicit older Projects retain their press grammar', () => {
  const c=withSourceParameters(withBatch(historyHarness('印刷 B&O'))); withProjectFileHandlers(c);
  Object.assign(c, {
    SURFACE_OPERATOR_IDS:['rasterPress'], GLYPH_BODY_OPERATOR_IDS:[],
    SURFACE_SOURCE_OPACITY_KEYS:{rasterPress:'rasterSourceOpacity'},
    SURFACE_SOURCE_MODE_KEYS:{rasterPress:'rasterSourceMode'}
  });
  c.PARAM_DEFAULTS.rasterSourceOpacity=c.params.rasterSourceOpacity=.12;
  const fresh=plain(c.projectData());
  assert.equal(fresh.version, 92); assert.equal(fresh.params.rasterScreen,'gravure'); assert.equal(fresh.params.rasterSourceOpacity,.12);

  const partialV57=plain(fresh); partialV57.version=57;
  delete partialV57.params.rasterScreen; delete partialV57.params.rasterSourceMode; delete partialV57.params.rasterSourceOpacity;
  partialV57.batchProfiles={};
  assert.equal(c.loadProject(partialV57,true),true);
  assert.equal(c.params.rasterScreen,'adaptive'); assert.equal(c.params.rasterSourceOpacity,1);

  const partialV23=plain(fresh); partialV23.version=23;
  delete partialV23.params.rasterScreen; delete partialV23.params.rasterModulation;
  delete partialV23.params.rasterSourceMode; delete partialV23.params.rasterSourceOpacity;
  partialV23.batchProfiles={};
  assert.equal(c.loadProject(partialV23,true),true);
  assert.equal(c.params.rasterScreen,'legacy'); assert.equal(c.params.rasterModulation,0); assert.equal(c.params.rasterSourceOpacity,1);

  const explicitV57=plain(fresh); explicitV57.version=57;
  explicitV57.params.rasterScreen='line'; explicitV57.params.rasterSourceMode='hide'; delete explicitV57.params.rasterSourceOpacity;
  assert.equal(c.loadProject(explicitV57,true),true);
  assert.equal(c.params.rasterScreen,'line'); assert.equal(c.params.rasterSourceOpacity,0);
});

test('Prism v61 starts in Birefringent while partial v23-v60 Projects retain Cut crystal', () => {
  const c=withSourceParameters(withBatch(historyHarness('光学 B&永'))); withProjectFileHandlers(c);
  Object.assign(c, {
    SURFACE_OPERATOR_IDS:['prismSacrament'], GLYPH_BODY_OPERATOR_IDS:[],
    SURFACE_SOURCE_OPACITY_KEYS:{prismSacrament:'prismSourceOpacity'},
    SURFACE_SOURCE_MODE_KEYS:{prismSacrament:'prismSourceMode'}
  });
  const fresh=plain(c.projectData());
  assert.equal(fresh.version, 92); assert.equal(fresh.params.prismOptics,'birefringent');

  const partialV60=plain(fresh); partialV60.version=60;
  delete partialV60.params.prismOptics; partialV60.batchProfiles={};
  assert.equal(c.loadProject(partialV60,true),true);
  assert.equal(c.params.prismOptics,'crystal');

  const partialV22=plain(fresh); partialV22.version=22;
  delete partialV22.params.prismOptics; delete partialV22.params.prismIridescence; partialV22.batchProfiles={};
  assert.equal(c.loadProject(partialV22,true),true);
  assert.equal(c.params.prismOptics,'legacy'); assert.equal(c.params.prismIridescence,0);

  const explicitV60=plain(fresh); explicitV60.version=60; explicitV60.params.prismOptics='lenticular';
  assert.equal(c.loadProject(explicitV60,true),true);
  assert.equal(c.params.prismOptics,'lenticular');
});

test('Ligature v62 starts in Counterbody while partial v29-v61 Projects retain Interlock', () => {
  const c=withSourceParameters(withBatch(historyHarness('RITUAL BODY'))); withProjectFileHandlers(c);
  Object.assign(c, {
    SURFACE_OPERATOR_IDS:['ligatureBody'], GLYPH_BODY_OPERATOR_IDS:['ligatureBody'],
    SURFACE_SOURCE_OPACITY_KEYS:{ligatureBody:'ligatureBodySourceOpacity'},
    SURFACE_SOURCE_MODE_KEYS:{ligatureBody:'ligatureBodySourceMode'}
  });
  const fresh=plain(c.projectData());
  assert.equal(fresh.version, 92); assert.equal(fresh.params.ligatureBodyGrammar,'counterbody');

  const partialV61=plain(fresh); partialV61.version=61;
  delete partialV61.params.ligatureBodyGrammar; partialV61.batchProfiles={};
  assert.equal(c.loadProject(partialV61,true),true);
  assert.equal(c.params.ligatureBodyGrammar,'interlock');

  const explicitV61=plain(fresh); explicitV61.version=61; explicitV61.params.ligatureBodyGrammar='counterWeave';
  assert.equal(c.loadProject(explicitV61,true),true);
  assert.equal(c.params.ligatureBodyGrammar,'counterWeave');
});

test('Bone v64 preserves old architectures and round-trips Lamellar settings and assignment', () => {
  const c=withSourceParameters(withBatch(historyHarness('B骨。'))); withProjectFileHandlers(c);
  c.OPERATOR_IDS.push('boneScaffold');c.OPERATOR_DEFS.boneScaffold={short:'bs'};c.OPERATOR_BY_SHORT.bs='boneScaffold';
  Object.assign(c,{SURFACE_OPERATOR_IDS:['boneScaffold'],GLYPH_BODY_OPERATOR_IDS:[],
    SURFACE_SOURCE_OPACITY_KEYS:{boneScaffold:'boneSourceOpacity'},SURFACE_SOURCE_MODE_KEYS:{boneScaffold:'boneSourceMode'}});
  c.params.activeOperator='boneScaffold';c.params.boneMarrow=4.4;c.params.boneJoint=26;
  Object.assign(c.operatorState(c.metrics[0],'boneScaffold'),{toggled:true,current:1});
  const fresh=plain(c.projectData());assert.equal(fresh.version, 92);assert.equal(fresh.params.boneArchitecture,'lamellar');
  for(const [version,expected] of [[21,'adaptive'],[22,'trabecular'],[36,'trabecular'],[63,'trabecular']]){
    const partial=plain(fresh);partial.version=version;delete partial.params.boneArchitecture;partial.batchProfiles={};
    assert.equal(c.loadProject(partial,true),true);assert.equal(c.params.boneArchitecture,expected);
  }
  const explicit=plain(fresh);explicit.version=63;explicit.params.boneArchitecture='ribcage';
  assert.equal(c.loadProject(explicit,true),true);assert.equal(c.params.boneArchitecture,'ribcage');
  assert.equal(c.loadProject(fresh,true),true);
  assert.equal(c.params.boneArchitecture,'lamellar');assert.equal(c.params.boneMarrow,4.4);assert.equal(c.params.boneJoint,26);
  assert.equal(c.metrics[0].operatorStates.boneScaffold.toggled,true);
});

test('RTL page membership keeps source holes through Apply, local parameters, edits and common Undo/Redo', () => {
  const source = 'A سلام عربية نور Z';
  const c = withSourceParameters(withBatch(historyHarness(source)));
  assert.deepEqual(Array.from(c.metrics, m => m.el.dataset.sourceText), ['A','نور','عربية','سلام','Z'], 'real joining-word tokenizer reorders the RTL run');
  Object.assign(c.params, { pageLayout: 'spreads', activeOperator: 'readingField' });
  c.metrics.forEach((m, i) => { m.pageIndex = Math.floor(i / 2); });
  c.pageLayoutState = { enabled: true, pages: [{},{},{}] };
  c.pageSourceIndex = c.buildPageSourceIndex(c.metrics); c.metricsDirty = false;
  assert.equal(c.captureCanvasLayoutTarget('page'), false, 'no selected glyph');
  c.selectLetter(c.metrics[1]);
  c.scopeControls.btnUseCanvasPage.listeners.click();
  const originalTarget = plain(c.sourceTarget);
  assert.equal(originalTarget.ranges.length, 2); assert.equal(inScope(c), 'Aنور');
  assert.match(c.scopeControls.sourceTargetPreview.textContent, /別ページの文字は対象に含めません/);
  const beforeNavigation = plain(c.projectData()); c.editSourceTarget();
  assert.equal(c.textInput.selectionStart, 0); assert.equal(c.textInput.selectionEnd, 1, 'native selection shows first fragment, not an expanded envelope');
  assert.deepEqual(plain(c.projectData()), beforeNavigation);
  c.batchToggle(c.batchMatchers.all, true); c.pushHistory();
  assert.equal(c.writeSourceParameter('readingPressure', 2.75), true);
  for (const m of c.metrics) {
    const selected = ['A','نور'].includes(m.el.dataset.sourceText);
    assert.equal(c.operatorState(m, 'readingField').toggled, selected);
    assert.equal(m.localParams?.readingPressure ?? null, selected ? 2.75 : null);
  }
  const applied = plain(c.metrics.map(c.letterState));
  revise(c, 'X A كتاب عربية نور Z!');
  assert.equal(inScope(c), 'Aنور'); assert.equal(c.sourceTarget.ranges.length, 2);
  assert.deepEqual(originalTarget.ranges, [{ start: 0, end: 1 }, { start: source.indexOf('نور'), end: source.indexOf('نور') + 3 }], 'previous snapshot not aliased');
  c.undo(); assert.equal(c.renderedSourceText, source);
  assert.deepEqual(plain(c.sourceTarget), originalTarget); assert.deepEqual(plain(c.metrics.map(c.letterState)), applied);
  c.redo(); assert.equal(inScope(c), 'Aنور');
  c.undo(); c.undo(); assert.ok(c.metrics.every(m => !m.localParams));
  c.redo(); assert.equal(c.metrics[1].localParams.readingPressure, 2.75);
  revise(c, 'سلام عربية Z');
  assert.equal(c.sourceTarget.valid, false); assert.equal(inScope(c), '');
  c.batchToggle(c.batchMatchers.all, true);
  assert.ok(c.metrics.every(m => !c.operatorState(m, 'readingField').toggled), 'complete target deletion never falls back to All');
  c.undo(); assert.equal(inScope(c), 'Aنور');
});

test('disjoint ranges validate strictly, retain surviving fragments and never widen local writes into holes', () => {
  const c = withSourceParameters(withBatch(historyHarness('ABCDEFGH')));
  Object.assign(c.params, { activeOperator: 'readingField' });
  const target = { mode: 'range', start: 1, end: 7, valid: true, ranges: [{start:1,end:3},{start:5,end:7}] };
  c.sourceTarget = plain(target); assert.equal(inScope(c), 'BCFG');
  c.metrics[1].locked = true;
  assert.equal(c.writeSourceParameter('readingPressure', 3), true);
  assert.deepEqual(Array.from(c.metrics, m => m.localParams?.readingPressure ?? null), [null,null,3,null,null,3,3,null]);
  for (const ranges of [[], [{start:1,end:3},{start:2,end:7}], [{start:2,end:3},{start:5,end:7}],
    [{start:1,end:3},{start:5,end:6}], [{start:1.5,end:3},{start:5,end:7}], [{start:1,end:3},null], 'invalid']) {
    c.sourceTarget = { ...target, ranges }; const before = plain(c.projectData());
    assert.equal(c.sourceTargetBounds(), null); assert.equal(inScope(c), '');
    assert.equal(c.writeSourceParameter('readingPressure', -3), false);
    assert.deepEqual(plain(c.projectData()), before);
  }
  c.sourceTarget = plain(target);
  revise(c, 'ABxCDEFGH!'); assert.equal(inScope(c), 'BxCFG', 'inner insertions are included only within surviving fragments');
  assert.equal(c.sourceTarget.ranges.length, 2);
  revise(c, 'ADEFGH!'); assert.equal(inScope(c), 'FG'); assert.equal(c.sourceTarget.ranges, undefined);
  c.undo(); assert.equal(inScope(c), 'BxCFG'); assert.equal(c.sourceTarget.ranges.length, 2);
});

test('Project file validation rejects malformed/foreign/future/oversized input without losing current text or effects', async () => {
  const c = withSourceParameters(withBatch(historyHarness('保持する本文')));
  selectSource(c, 0, 3); c.writeSourceParameter('readingPressure', 3);
  const files = withProjectFileHandlers(c), before = plain(c.projectData());
  for (const input of ['{broken', JSON.stringify({ app: 'foreign', params: {} }),
    JSON.stringify({ app: 'type-deformer', version: 9999, params: {} }),
    JSON.stringify({ app: 'type-deformer', version: 50, text: 'A'.repeat(500001), params: {} })]) {
    await files.read(new Blob([input]));
    assert.equal(files.statuses.at(-1).state, 'error'); assert.deepEqual(plain(c.projectData()), before);
  }
  files.controls.projFile.files = [{ size: 65 * 1024 * 1024 }]; files.controls.projFile.listeners.change();
  assert.match(files.statuses.at(-1).message, /64 MB/); assert.deepEqual(plain(c.projectData()), before);
});

test('3k / 10k / 50k real Project autosave failure, JSON fallback and retry preserve every scoped value', async t => {
  for (const size of [3000, 10000, 50000]) {
    const source = '自動保存と原文の範囲。\n'.repeat(Math.ceil(size / 12)).slice(0, size);
    assert.equal(source.length, size);
    const c = withSourceParameters(withBatch(historyHarness(source)));
    selectSource(c, Math.floor(size * .3), Math.floor(size * .4));
    c.writeSourceParameter('readingPressure', 2.5);
    const files = withProjectFileHandlers(c), memory = new Map();
    const old = JSON.stringify({ app: 'type-deformer', version: 50, text: '前回の保存', params: {} });
    memory.set(c.AUTOSAVE_KEY, old); memory.set(c.AUTOSAVE_BACKUP_KEY, old);
    let quota = true;
    c.localStorage = {
      getItem: key => memory.get(key) || null,
      setItem(key, value) { if (quota) throw Object.assign(Error(), { name: 'QuotaExceededError' }); memory.set(key, value); }
    };
    const before = plain(c.projectData());
    const start = performance.now(); c.saveAutosave(true); const failedMs = performance.now() - start;
    assert.equal(c.autosaveDirty, true); assert.equal(c.autosaveFeedback.state, 'error');
    assert.equal(memory.get(c.AUTOSAVE_KEY), old); assert.equal(memory.get(c.AUTOSAVE_BACKUP_KEY), old);
    files.controls.btnSaveProj.listeners.click(); const json = await files.downloads[0].blob.text();
    assert.deepEqual(JSON.parse(json), before, 'JSON fallback retains every letter and range value');
    assert.equal(c.autosaveDirty, true); assert.equal(c.autosaveFeedback.state, 'error', 'manual file request does not claim autosave recovery');
    quota = false; const retryStart = performance.now(); c.retryAutosave(); const retryMs = performance.now() - retryStart;
    assert.deepEqual(JSON.parse(memory.get(c.AUTOSAVE_KEY)), before); assert.equal(c.autosaveDirty, false);
    assert.equal(c.autosaveFeedback.state, 'saved'); assert.deepEqual(plain(c.projectData()), before);
    t.diagnostic(size + ' characters: failed save ' + failedMs.toFixed(1) + 'ms, retry ' + retryMs.toFixed(1)
      + 'ms, JSON ' + files.downloads[0].blob.size + ' bytes. Mock storage/DOM, not browser latency.');
  }
});

test('range parameters change only the selected unlocked text; source edits and common Undo retain sparse values', () => {
  const c = withSourceParameters(withBatch(historyHarness('ABC\nDEF\nGHI')));
  Object.assign(c.params, { activeOperator: 'readingField', readingPressure: 2 });
  selectSource(c, 4, 7); c.metrics[4].locked = true;
  const base = plain(c.params); c.pushHistory(); assert.equal(c.writeSourceParameter('readingPressure', -1.5), true);
  assert.deepEqual(Array.from(c.metrics, m => m.localParams?.readingPressure ?? null), [null,null,null,-1.5,null,-1.5,null,null,null]);
  assert.deepEqual(plain(c.params), base);
  const beforeEdit = plain(c.snapshotLetters());
  c.undo(); assert.ok(c.metrics.every(m => !m.localParams));
  c.redo(); assert.equal(c.metrics[3].localParams.readingPressure, -1.5);
  revise(c, 'XBC\nDEF\nGHI!');
  assert.equal(inScope(c), 'DEF'); assert.equal(c.metrics[3].localParams.readingPressure, -1.5);
  assert.equal(beforeEdit[3].s.p.readingPressure, -1.5, 'snapshot not aliased');
  c.pushHistory(); c.writeSourceParameter('readingWidth', .2);
  assert.deepEqual(plain(c.metrics[3].localParams), { readingPressure: -1.5, readingWidth: .2 });
  assert.deepEqual(plain(beforeEdit[3].s.p), { readingPressure: -1.5 });
});

test('invalid/deleted/full/IME targets cannot write global values and local reset preserves the other Operator', () => {
  const c = withSourceParameters(withBatch(historyHarness('ABC\nDEF')));
  const base = plain(c.params); assert.equal(c.writeSourceParameter('currentBend', 8), false);
  selectSource(c, 4, 7); c.writeSourceParameter('currentBend', 8); c.writeSourceParameter('readingPressure', -2);
  c.params.activeOperator = 'paragraphCurrent'; c.resetSourceParameters();
  assert.deepEqual(plain(c.metrics[3].localParams), { readingPressure: -2 });
  c.undo(); assert.equal(c.metrics[3].localParams.currentBend, 8);
  c.textComposing = true; assert.equal(c.writeSourceParameter('currentBend', 4), false); c.textComposing = false;
  revise(c, 'ABC'); assert.equal(c.sourceTarget.valid, false);
  assert.equal(c.writeSourceParameter('currentBend', 4), false);
  assert.equal(c.params.currentBend, base.currentBend);
  assert.equal(c.writeSourceParameter('copyMotion', 2), false);
});

test('10k range parameters persist through Project, compact Share, text replacement and state restoration', () => {
  const source = '本文の範囲と段落を保持する。\n'.repeat(700).slice(0, 10000);
  const c = withSourceParameters(withBatch(historyHarness(source)));
  selectSource(c, 2100, 2600); c.writeSourceParameter('readingPressure', 4); c.writeSourceParameter('currentFlow', 'crest');
  const count = c.metrics.filter(m => m.localParams).length; assert.ok(count > 400 && count < 500);
  revise(c, '冒頭\n' + source.slice(0, 90) + '※' + source.slice(91));
  const saved = JSON.parse(JSON.stringify(c.projectData()));
  assert.equal(saved.version, 92); assert.equal(saved.letters.filter(s => s.p).length, count);
  const shared = JSON.parse(JSON.stringify(c.shareData()));
  let payload; c.loadProject = data => { payload = data; return true; };
  assert.equal(c.applyShareData(shared), true);
  assert.equal(payload.letters.filter(s => s.p).length, count, 'parameter-only letters included in sparse Share');
  c.createSpans(payload.text); c.restoreStates(payload.letters);
  assert.equal(c.metrics.filter(m => m.localParams?.currentFlow === 'crest').length, count);
  assert.equal(c.metrics.filter(m => m.localParams?.readingPressure === 4).length, count);
  c.createSpans(saved.text); c.restoreStates(saved.letters);
  assert.equal(c.metrics.filter(m => m.localParams).length, count);
  c.restoreStates(c.metrics.map(() => ({ t: 0, l: 0, i: 0 })));
  assert.ok(c.metrics.every(m => !m.localParams), 'old state clears newer local settings');
});

test('local parameter normalization rejects unknown fields, prototype keys, invalid enums and nonfinite values', () => {
  const c = withSourceParameters(withBatch(historyHarness('A')));
  assert.deepEqual(plain(c.normalizeSourceParameters(JSON.parse('{"readingPressure":999,"currentFlow":"bad","ink":"red","__proto__":{"polluted":1}}'))), { readingPressure: 6 });
  assert.equal(c.normalizeSourceParameters({ currentBend: NaN, readingWidth: Infinity, readingBody: '1' }), null);
  assert.equal(c.normalizeSourceParameters([]), null); assert.equal(c.decodeSourceParameters('%broken'), null);
  assert.equal({}.polluted, undefined);
});

test('parameter controls show mixed values, keep navigation non-destructive and block empty range writes', () => {
  const c = withSourceParameters(withBatch(historyHarness('ABC\nDEF')));
  c.params.activeOperator = 'readingField'; c.sourceParameterMode = 'range';
  c.sourceParameterUIStamp = ''; c.sourceParameterUIMetrics = null;
  c.BATCH_PROFILE_LABELS = { all: 'All' }; c.rangeControls = []; c.profileSelectControls = [];
  const control = () => ({ value: '', dataset: {}, listeners: {}, children: [], attributes: {},
    addEventListener(type, fn) { this.listeners[type] = fn; }, setAttribute(k, v) { this.attributes[k] = v; },
    querySelector() { return this.children.find(v => v.dataset.sourceMixed); },
    appendChild(option) { this.children.push(option); option.remove = () => { this.children = this.children.filter(v => v !== option); }; }
  });
  for (const id of ['sourceParameterBlock', 'sourceParameterStatus', 'pReadingPressure', 'vReadingPressure', 'pReadingScope']) c.scopeControls[id] = control();
  c.document.createElement = () => control();
  c.refreshBatchProfileControls = () => c.refreshSourceParameterControls(true);
  vm.runInContext(extract('bindRange') + '\n' + extract('bindProfileSelect'), c);
  c.scopeControls.pReadingPressure.value = '2';
  c.bindRange('pReadingPressure', 'vReadingPressure', 'readingPressure', n => n.toFixed(2), () => {});
  c.bindProfileSelect('pReadingScope', 'readingScope', () => {});
  c.refreshSourceParameterControls(true);
  assert.equal(c.scopeControls.pReadingPressure.disabled, true);
  const base = plain(c.params);
  c.scopeControls.pReadingPressure.value = '5'; c.scopeControls.pReadingPressure.listeners.input();
  assert.deepEqual(plain(c.params), base);
  selectSource(c, 0, 3);
  c.metrics[0].localParams = { readingPressure: -1, readingScope: 'document' };
  const before = c.snapState(); c.refreshSourceParameterControls(true);
  assert.equal(c.scopeControls.vReadingPressure.textContent, '複数値');
  assert.equal(c.scopeControls.pReadingScope.value, '__mixed'); assert.equal(c.snapState(), before);
  c.pushHistory(); c.scopeControls.pReadingPressure.value = '4'; c.scopeControls.pReadingPressure.listeners.input();
  assert.equal(c.scopeControls.vReadingPressure.textContent, '4.00');
  assert.equal(c.metrics.filter(m => m.localParams?.readingPressure === 4).length, 3);
  assert.equal(c.params.readingPressure, base.readingPressure);
  c.scopeControls.pReadingScope.value = 'paragraph'; c.scopeControls.pReadingScope.listeners.change();
  assert.equal(c.scopeControls.pReadingScope.querySelector(), undefined);
  assert.ok(c.metrics.slice(0, 3).every(m => m.localParams.readingScope === 'paragraph'));
  c.metrics.slice(0, 3).forEach(m => { m.locked = true; }); c.refreshSourceParameterControls(false);
  assert.equal(c.scopeControls.pReadingPressure.disabled, true, 'locking refreshes scope availability');
  c.sourceParameterMode = 'base'; c.refreshSourceParameterControls(true);
  assert.equal(c.scopeControls.pReadingPressure.disabled, false);
  assert.equal(c.scopeControls.pReadingPressure.value, base.readingPressure);
  assert.equal(c.historyControlFor({ id: 'pSourceParameterMode', matches: () => true }), null);
});

test('3k / 10k / 50k sparse range write and snapshot cost is measured without hiding state', t => {
  const line = '文章の設定を保持する。';
  for (const size of [3000, 10000, 50000]) {
    const c = withSourceParameters(withBatch(historyHarness(line.repeat(Math.ceil(size / line.length)).slice(0, size))));
    assert.equal(c.renderedSourceText.length, size);
    selectSource(c, 0, size); const count = c.metrics.length;
    const start = performance.now(); c.writeSourceParameter('currentBend', -3.5); const writeMs = performance.now() - start;
    const snapshotStart = performance.now(); const data = c.projectData(); const snapshotMs = performance.now() - snapshotStart;
    assert.equal(data.letters.filter(s => s.p?.currentBend === -3.5).length, count);
    assert.equal(c.params.currentBend, 2.4);
    t.diagnostic(JSON.stringify({ chars: size, glyphs: count, writeMs: +writeMs.toFixed(1), snapshotMs: +snapshotMs.toFixed(1),
      jsonBytes: Buffer.byteLength(JSON.stringify(data)), scope: 'actual range write and Project snapshot, mock DOM; not input/paint latency, heap or iPhone' }));
  }
});

test('Copy transfer target, global/Batch parameters and assignment survive history and Project JSON', () => {
  const c = withBatch(historyHarness('COPY\n複写\nBODY'));
  c.OPERATOR_IDS.push('copyDecay'); c.OPERATOR_DEFS.copyDecay = { short: 'y' }; c.OPERATOR_BY_SHORT.y = 'copyDecay';
  Object.assign(c.params, { activeOperator: 'copyDecay', copyFailure: 'transfer', copyGenerations: 24, copyExposure: -.8,
    copyColor: '#aa3322', copySourceOpacity: .15, copyOpacity: .4 });
  c.batchProfiles.latin = { copyFailure: 'transfer', copyGenerations: 38, copyErosion: 3.5 };
  selectSource(c, 0, 4, 'range');
  assert.equal(inScope(c), 'COPY', 'source range');
  assert.equal(c.params.activeOperator, 'copyDecay');
  c.batchToggle(c.batchMatchers.all, true);
  const applied = () => c.metrics.filter(m => c.operatorState(m, 'copyDecay').toggled).length;
  assert.equal(applied(), 4, 'Apply'); c.undo(); assert.equal(applied(), 0, 'Undo'); c.redo(); assert.equal(applied(), 4, 'Redo');
  revise(c, 'COPY\n複写\nBODY!'); assert.equal(applied(), 4);
  const data = JSON.parse(JSON.stringify(c.projectData()));
  assert.equal(data.version, 92); assert.equal(data.params.copyFailure, 'transfer');
  assert.equal(data.params.copySourceOpacity, .15); assert.equal(data.params.copyOpacity, .4);
  assert.equal(data.batchProfiles.latin.copyGenerations, 38);
  c.textInput.value = data.text; c.createSpans(data.text); c.restoreStates(data.letters);
  assert.equal(applied(), 4);
});

test('Reading Field: 10k paragraph target survives edits, mixed Undo/Redo and actual Project serialization/restoration', () => {
  const source = ('雨の午後、川沿いの道を歩いた。\n灯りが残る窓。\n\n').repeat(400).slice(0, 10000);
  const c = withBatch(historyHarness(source));
  c.OPERATOR_IDS.push('readingField'); c.OPERATOR_DEFS.readingField = { short: 'rf' };
  c.OPERATOR_BY_SHORT.rf = 'readingField';
  for (const m of c.metrics) m.operatorStates.readingField = { toggled: false, current: 0, manual: null };
  Object.assign(c.params, { activeOperator: 'readingField', textMeasure: 36, readingScope: 'document', readingPressure: 3.5,
    readingWidth: .44, readingHeight: .28, readingFocusU: .33, readingFocusV: .6, readingFeather: .1, readingBody: 1 });
  c.textInput.selectionStart = 600; c.textInput.selectionEnd = 1300; c.captureSourceTarget('range');
  const selectedText = inScope(c); const selectedCount = c.matchingBatchMetrics(c.batchMatchers.all).length;
  assert.ok(selectedCount > 0 && selectedCount < c.metrics.length, 'the test must actually apply Reading Field to a nonempty partial target');
  c.batchToggle(c.batchMatchers.all, true);
  const applied = () => c.metrics.filter(m => c.operatorState(m, 'readingField').toggled).length;
  assert.equal(applied(), selectedCount);
  c.undo(); assert.equal(applied(), 0); c.redo(); assert.equal(applied(), selectedCount);
  revise(c, '冒頭\n' + source.slice(0, 90) + '※' + source.slice(91));
  assert.equal(inScope(c), selectedText); assert.equal(applied(), selectedCount);
  const saved = JSON.parse(JSON.stringify(c.projectData()));
  assert.equal(saved.version, 92); assert.equal(saved.params.readingPressure, 3.5);
  assert.equal(saved.params.readingFocusU, .33); assert.equal(saved.params.readingScope, 'document');
  c.textInput.value = saved.text; c.createSpans(saved.text); c.restoreStates(saved.letters);
  assert.equal(applied(), selectedCount);
  assert.equal(c.metrics.filter(m => c.operatorState(m, 'rotate').toggled).length, 0);
  assert.equal(c.sourceTarget.mode, 'all', 'saved effect survives, session Apply bookmark is not a persisted reading anchor');
});
