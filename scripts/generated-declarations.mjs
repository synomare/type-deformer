// Prototype adapters are verified against authored declaration owners. A native
// renderer and its editor scheduling hooks may live in different source units.
import {parse} from 'acorn';
import fs from 'node:fs';
import {readAuthoredUnits, declaredSourceUnit} from './source-reader.mjs';
import {references, rewriteReferences} from './render-source-contract.mjs';

const ast = source => parse(source, {ecmaVersion: 'latest'});
const semantic = node => JSON.stringify(node, (key, value) => ['start', 'end', 'raw'].includes(key) ? undefined : value);
function explicitRenderCapabilities(source) {
  const edits = [];
  const isMember = (node, object, property) => node?.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier' && node.object.name === object && node.property.name === property;
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && isMember(node.callee, 'document', 'createElement') && node.arguments.length === 1 && node.arguments[0].value === 'canvas') {
      edits.push({start: node.start, end: node.end, code: 'createRenderCanvas()'}); return;
    }
    if (isMember(node, 'textInput', 'value')) {
      edits.push({start: node.start, end: node.end, code: 'renderedSourceText'}); return;
    }
    if (node.type === 'LogicalExpression' && node.operator === '&&' && isMember(node.left, 'window', 'matchMedia') &&
      node.right.type === 'MemberExpression' && !node.right.computed && node.right.property.name === 'matches' &&
      node.right.object.type === 'CallExpression' && isMember(node.right.object.callee, 'window', 'matchMedia') && node.right.object.arguments.length === 1) {
      const argument = node.right.object.arguments[0];
      edits.push({start: node.start, end: node.end, code: 'matchesRenderMedia(' + source.slice(argument.start, argument.end) + ')'}); return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end') continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast(source));
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.code + source.slice(edit.end);
  return source;
}
function declarations(source, topLevelOnly = false) {
  const result = new Map();
  const accept = (name, node, statement) => {
    if (!name) throw new Error('Generated declarations must have explicit names');
    const lineStart = source.lastIndexOf('\n', statement.start - 1) + 1;
    if (!topLevelOnly && source.slice(lineStart, statement.start) !== '      ') return;
    const entries = result.get(name) || [];
    entries.push({name, node, statement, source, code: statement.type === 'VariableDeclaration'
      ? statement.kind + ' ' + source.slice(node.start, node.end) + ';'
      : source.slice(statement.start, statement.end)});
    result.set(name, entries);
  };
  function walk(node) {
    if (node.type === 'FunctionDeclaration') accept(node.id?.name, node, node);
    if (node.type === 'VariableDeclaration') {
      for (const declaration of node.declarations) {
        if (declaration.id.type === 'Identifier') accept(declaration.id.name, declaration, node);
        else if (topLevelOnly) throw new Error('Generated adapter declarations must use explicit identifiers');
      }
    }
    if (topLevelOnly) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'start' || key === 'end') continue;
      if (Array.isArray(value)) value.forEach(child => { if (child?.type) walk(child); });
      else if (value?.type) walk(value);
    }
  }
  const program = ast(source);
  if (topLevelOnly) {
    for (const node of program.body) {
      if (!['FunctionDeclaration', 'VariableDeclaration', 'EmptyStatement'].includes(node.type)) throw new Error('Generated adapters must contain declarations only');
      walk(node);
    }
  } else walk(program);
  return result;
}

export function compareGeneratedDeclarations(source, units = readAuthoredUnits()) {
  const expected = declarations(source, true), actualMaps = new Map(), changes = [];
  const renderUnits = units.filter(unit => unit.path.startsWith('render-source/'));
  const renderPaths = new Set(renderUnits.map(unit => unit.path));
  const renderNames = new Set(renderUnits.flatMap(unit => unit.declarations));
  for (const [name, entries] of expected) {
    if (entries.length !== 1) throw new Error('Repeated generated declaration: ' + name);
    const unit = declaredSourceUnit(units, name);
    if (!actualMaps.has(unit)) actualMaps.set(unit, declarations(unit.source));
    const actual = actualMaps.get(unit).get(name) || [];
    if (actual.length !== 1) throw new Error('Expected one authored declaration ' + name + ' in ' + unit.path + ', found ' + actual.length);
    let comparison = declarations(explicitRenderCapabilities(entries[0].code), true).get(name)[0];
    if (!renderPaths.has(unit.path)) {
      const rewritten = rewriteReferences(comparison.code, references(ast(comparison.code)), renderNames, 'renderEngine');
      comparison = declarations(rewritten, true).get(name)[0];
    }
    if (semantic({kind: comparison.statement.kind, node: comparison.node}) !== semantic({kind: actual[0].statement.kind, node: actual[0].node})) changes.push({name, unit, expected: comparison, actual: actual[0]});
  }
  return {count: expected.size, changes};
}

const nativeAdapters = Object.freeze({
  auxetic: '.codex/prototypes/auxetic-type/editor-adapter.js',
  conformal: '.codex/prototypes/conformal-type/editor-adapter.js',
  counterform: '.codex/prototypes/counterform-engine/editor-adapter.js',
  differential: '.codex/prototypes/differential-type/editor-adapter.js',
  marbling: '.codex/prototypes/marbling-type/editor-adapter.js',
  calligraphy: '.codex/prototypes/calligraphic-field/editor.js'
});
// Execute the actual migrated declarations in integration fixtures. The adapter
// supplies only the names/order; every emitted body comes from an authored unit.
export function readNativeIntegrationSource(id) {
  if (!nativeAdapters[id]) throw new Error('Unknown native integration: ' + id);
  const units = readAuthoredUnits(), render = units.find(unit => unit.id === id + '-render');
  if (!render) throw new Error('Missing native render unit: ' + id);
  const adapter = fs.readFileSync(new URL('../' + nativeAdapters[id], import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
  const editorDeclarations = [...declarations(adapter, true).keys()].filter(name => !render.declarations.includes(name));
  const maps = new Map(), result = [render.source];
  // Unrelated renderer dependencies remain the fixture's explicit mocks.
  result.push('var renderEngine = Object.create(globalThis);\n' + render.declarations.map(name =>
    'Object.defineProperty(renderEngine, ' + JSON.stringify(name) + ', {get:function(){return ' + name + ';},set:function(value){' + name + '=value;}});').join('\n'));
  for (const name of editorDeclarations) {
    const unit = declaredSourceUnit(units, name);
    if (!maps.has(unit)) maps.set(unit, declarations(unit.source));
    const found = maps.get(unit).get(name) || [];
    if (found.length !== 1) throw new Error('Expected one authored native adapter declaration: ' + name);
    result.push('      ' + found[0].code);
  }
  return result.join('\n\n');
}

export function handleGeneratedDeclarations(source, label, options = {}) {
  const result = compareGeneratedDeclarations(source, options.units);
  if (options.check ?? process.argv.includes('--check')) {
    if (result.changes.length) throw new Error(label + ' authored declarations are stale: ' + result.changes.map(item => item.unit.path + ':' + item.name).join(', '));
    console.log(label + ': ' + result.count + ' authored declarations match prototype sources.');
    return result;
  }
  if (!result.changes.length) {
    console.log(label + ': authored declarations already match prototype sources.');
    return result;
  }
  const files = new Map();
  for (const change of result.changes) {
    if (change.actual.statement.type === 'VariableDeclaration' && change.actual.statement.declarations.length !== 1) {
      throw new Error('Review the grouped declaration manually before regenerating: ' + change.unit.path + ':' + change.name);
    }
    if (!files.has(change.unit.path)) files.set(change.unit.path, []);
    files.get(change.unit.path).push(change);
  }
  const patch = ['*** Begin Patch'];
  for (const [file, changes] of files) {
    patch.push('*** Update File: ' + file);
    for (const change of changes) {
      const old = '      ' + change.actual.code;
      const replacement = '      ' + change.expected.code;
      patch.push('@@', ...old.split('\n').map(line => '-' + line), ...replacement.split('\n').map(line => '+' + line));
    }
  }
  patch.push('*** End Patch');
  console.log(patch.join('\n'));
  return result;
}
