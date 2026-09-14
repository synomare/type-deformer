import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function load(storage) {
  const context = { localStorage: storage };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(new URL('../discovery-store.js', import.meta.url), 'utf8'), context);
  return context.TypeDeformerDiscoveryStore;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('Discovery keeps catalog-order favorites and explicit recent limit', () => {
  const memory = new Map();
  const storage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
  const api = load(storage);
  const ids = Array.from({ length: 20 }, (_, index) => `op-${index}`);
  const store = api.create(ids, storage);
  store.toggleFavorite('op-4'); store.toggleFavorite('op-1');
  ids.forEach(id => store.recordRecent(id));
  assert.deepEqual(plain(store.snapshot().favorites), ['op-4', 'op-1']);
  assert.deepEqual(plain(store.snapshot().recent), ids.slice(8).reverse());
  assert.equal(store.snapshot().recent.length, 12);
});

test('Discovery discards corrupt JSON and unknown ids', () => {
  const bad = { getItem: () => '{broken', setItem() {} };
  assert.deepEqual(plain(load(bad).create(['known'], bad).snapshot()), { version: 1, favorites: [], recent: [] });
  const stored = { getItem: () => JSON.stringify({ favorites: ['missing', 'known'], recent: ['unknown', 'known'] }), setItem() {} };
  assert.deepEqual(plain(load(stored).create(['known'], stored).snapshot()), { version: 1, favorites: ['known'], recent: ['known'] });
});

test('Discovery remains usable when localStorage rejects writes', () => {
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const store = load(blocked).create(['known'], blocked);
  store.toggleFavorite('known'); store.recordRecent('known');
  assert.equal(store.persistent(), false);
  assert.deepEqual(plain(store.snapshot()), { version: 1, favorites: ['known'], recent: ['known'] });
});
