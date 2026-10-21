import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalSourceText, readManifestUnits, readEditorSource, readRenderSource,
  readPageMarkup, declaredSourceUnit, extractDeclaredFunction, readLegacyInlineEditorSource, replaceSourceOnce
} from './source-reader.mjs';
import {compareGeneratedDeclarations} from './generated-declarations.mjs';

function fixture(modules, extra = {}) {
  const files = {
    'editor-source/manifest.json': JSON.stringify({modules}),
    'render-source/manifest.json': JSON.stringify({modules}),
    'a.js': 'function alpha() {\r\n  return 1;\r\n}\r\n',
    'b.js': 'function beta() {\r  return 2;\r}\r',
    'index.html': '<main>markup only</main>',
    ...extra
  };
  const reads = [];
  return {reads, read(file) {
    reads.push(file);
    if (!(file in files)) throw new Error('fixture file absent: ' + file);
    return files[file];
  }};
}
const alpha = {id: 'alpha', path: 'a.js', declarations: ['alpha']};
const beta = {id: 'beta', path: 'b.js', declarations: ['beta']};

test('manifest order and authored ownership survive text normalization', () => {
  const options = fixture([beta, alpha]);
  const units = readManifestUnits('render-source/manifest.json', options);
  assert.deepEqual(units.map(unit => unit.id), ['beta', 'alpha']);
  assert.equal(declaredSourceUnit(units, 'alpha').path, 'a.js');
  assert.equal(readRenderSource(options), 'function beta() {\n  return 2;\n}\n\n\nfunction alpha() {\n  return 1;\n}\n');
  assert.ok(units.every(unit => Object.isFrozen(unit) && Object.isFrozen(unit.declarations)));
  assert.equal(readPageMarkup(options), '<main>markup only</main>');
  assert.equal(canonicalSourceText(Buffer.from('a\r\nb\rc')), 'a\nb\nc');
});

test('missing manifests or modules fail without falling back to page markup', () => {
  const missingManifest = fixture([alpha], {'editor-source/manifest.json': undefined});
  assert.throws(() => readEditorSource(missingManifest), /Cannot read authored source editor-source\/manifest.json/);
  assert.deepEqual(missingManifest.reads, ['editor-source/manifest.json']);
  const missingModule = fixture([{...alpha, path: 'missing.js'}]);
  assert.throws(() => readRenderSource(missingModule), /Cannot read authored source missing.js/);
  assert.ok(!missingModule.reads.includes('index.html'));
});

test('manifest rejects empty modules, duplicate identity, invalid paths and declaration lists', () => {
  for (const modules of [
    [], [alpha, alpha], [alpha, {...beta, id: alpha.id}],
    [{...alpha, path: '../outside.js'}], [{...alpha, path: 'C:/outside.js'}],
    [{...alpha, path: '/outside.js'}], [{...alpha, path: 'a//b.js'}],
    [{...alpha, path: 'page.html'}], [{...alpha, declarations: ['alpha', 'alpha']}]
  ]) assert.throws(() => readRenderSource(fixture(modules)));
});

test('named ownership fails when absent or ambiguous', () => {
  assert.throws(() => declaredSourceUnit(readManifestUnits('render-source/manifest.json', fixture([alpha])), 'missing'), /found 0/);
  const units = readManifestUnits('render-source/manifest.json', fixture([alpha, {...beta, declarations: ['alpha']}]));
  assert.throws(() => declaredSourceUnit(units, 'alpha'), /found 2: a.js, b.js/);
});

test('function extraction uses its declared owner and parser boundary', () => {
  const options = fixture([alpha, beta], {
    'a.js': '      function alpha() {\n        return "} and function beta("; // }\n      }\n      var unrelated = true;\n',
    'b.js': '      function beta() { return 2; }\n'
  });
  const units = readManifestUnits('render-source/manifest.json', options);
  assert.equal(extractDeclaredFunction(units, 'alpha'),
    '      function alpha() {\n        return "} and function beta("; // }\n      }');
  assert.throws(() => extractDeclaredFunction(units, 'missing'), /found 0/);
  const malformed = readManifestUnits('render-source/manifest.json', fixture([alpha], {'a.js': '      var alpha = 1;'}));
  assert.throws(() => extractDeclaredFunction(malformed, 'alpha'), /found 0/);
  const generator = readManifestUnits('render-source/manifest.json', fixture([alpha], {'a.js': '      function* alpha() { yield 1; }\n'}));
  assert.equal(extractDeclaredFunction(generator, 'alpha'), '      function* alpha() { yield 1; }');
});

test('historical inline extraction is explicit and rejects ambiguous inline scripts', () => {
  const oldScript = '<script>/* ---------------- boot ---------------- */\noldEditor();</script>';
  assert.equal(readLegacyInlineEditorSource(fixture([alpha], {'index.html': '<script src="editor.js"></script>' + oldScript})),
    '/* ---------------- boot ---------------- */\noldEditor();');
  assert.throws(() => readLegacyInlineEditorSource(fixture([alpha])), /found 0/);
  assert.throws(() => readLegacyInlineEditorSource(fixture([alpha], {'index.html': oldScript + oldScript})), /found 2/);
});

test('browser instrumentation requires exactly one hook', () => {
  assert.equal(replaceSourceOnce('before HOOK after', 'HOOK', 'instrumented'), 'before instrumented after');
  assert.throws(() => replaceSourceOnce('before after', 'HOOK', ''), /exactly one marker/);
  assert.throws(() => replaceSourceOnce('HOOK HOOK', 'HOOK', ''), /exactly one marker/);
  assert.throws(() => replaceSourceOnce('anything', '', ''), /exactly one marker/);
});

test('generated checks follow split owners and detect changed behavior without requiring a synthetic inline block', () => {
  const expected = 'var Pool = {ready: false};\nfunction prepare() { return Pool.ready; }\nfunction showStatus() { return "wait"; }';
  const units = [
    {path: 'render.js', declarations: ['Pool', 'prepare'], source: '      var Pool = {ready: false};\n      function prepare() {\n        return Pool.ready;\n      }\n'},
    {path: 'editor.js', declarations: ['showStatus'], source: "(function(root){\n      function showStatus() { return 'wait'; }\n})(globalThis);"}
  ];
  assert.deepEqual(compareGeneratedDeclarations(expected, units), {count: 3, changes: []});
  const changed = units.map(unit => ({...unit, source: unit.source.replace('return Pool.ready;', 'return !Pool.ready;')}));
  assert.deepEqual(compareGeneratedDeclarations(expected, changed).changes.map(change => change.name), ['prepare']);
  assert.throws(() => compareGeneratedDeclarations(expected, units.slice(0, 1)), /showStatus, found 0/);
  assert.throws(() => compareGeneratedDeclarations('prepare();', units), /declarations only/);
});
