// Real autosave block. Storage, clock, events and DOM are controlled test doubles.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
export function installAutosave(c) {
  const start = html.indexOf('      /* ---------------- autosave ---------------- */');
  const end = html.indexOf('      var NEW_PROJECT_NOTICE_KEY', start);
  assert.ok(start > 0 && end > start); vm.runInContext(html.slice(start, end), c);
}
export function autosaveFixture() {
  const memory = new Map(), writes = [], elements = {}, events = {}, timers = new Map();
  let now = 100000, sequence = 0, readError = null, writeError = null, failingKey = null, serializations = 0;
  const element = id => elements[id] ||= { textContent: '', hidden: false, disabled: false, dataset: {}, attrs: {}, listeners: {},
    setAttribute(k,v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(type, fn) { this.listeners[type] = fn; } };
  const c = vm.createContext({ Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } },
    textComposing: false, compositionPlayRaf: null, rebuildTimer: null, textInput: {},
    data: { app: 'type-deformer', version: 49, text: '新しい作品', params: {}, letters: [] },
    document: { activeElement: null, hidden: false, getElementById: element, querySelector: () => element('panel'),
      addEventListener(type, fn) { events['document:' + type] = fn; } },
    window: { addEventListener(type, fn) { events['window:' + type] = fn; } },
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
    setInterval(fn) { events.interval = fn; }, flushPendingTextRebuild() {},
    isProjectData: data => data?.app === 'type-deformer' && data.params && !Array.isArray(data.params),
    projectData() { serializations++; return c.data; },
    loadProject(data) { if (data?.app !== 'type-deformer' || data.version > 65) return false; c.data = data; c.markAutosaveDirty(); return true; },
    localStorage: {
      getItem(key) { if (readError) throw readError; return memory.get(key) ?? null; },
      setItem(key, value) { if (writeError && (!failingKey || failingKey === key)) throw writeError; writes.push([key, value]); memory.set(key, value); },
      removeItem() { throw Error('Autosave must never delete recovery data'); }, clear() { throw Error('Must never clear storage'); }
    }
  });
  installAutosave(c);
  return { c, memory, writes, elements, events, timers,
    advance(ms) { now += ms; }, serializations: () => serializations,
    failRead(name) { readError = name ? Object.assign(Error('test'), { name }) : null; },
    failWrite(name, key = null) { writeError = name ? Object.assign(Error('test'), { name }) : null; failingKey = key; },
    runTimer() { const entry = timers.entries().next().value; if (entry) { timers.delete(entry[0]); entry[1].fn(); } }
  };
}
