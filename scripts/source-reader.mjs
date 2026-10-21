// Test/build tooling reads authored sources, never a generated runtime bundle.
// A custom read(path) provider supports a pinned historical checkout without
// falling back to files from the current checkout.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse, parseExpressionAt} from 'acorn';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export const sourceManifests = Object.freeze({
  editor: 'editor-source/manifest.json',
  render: 'render-source/manifest.json'
});
export function canonicalSourceText(value) {
  if (typeof value !== 'string' && !Buffer.isBuffer(value)) throw new TypeError('Source reader must return UTF-8 text or a Buffer');
  return value.toString('utf8').replace(/\r\n?/g, '\n');
}
function repositoryPath(value) {
  if (typeof value !== 'string' || !value || /^[a-z][a-z0-9+.-]*:|^[\\/]/i.test(value)) throw new Error('Expected repository-relative source path: ' + value);
  const normalized = value.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid source path: ' + value);
  return normalized;
}
function readSource(file, options = {}) {
  file = repositoryPath(file);
  const root = options.root instanceof URL ? fileURLToPath(options.root) : options.root || repositoryRoot;
  try {
    return canonicalSourceText(options.read ? options.read(file) : fs.readFileSync(path.resolve(root, file), 'utf8'));
  } catch (error) {
    throw new Error('Cannot read authored source ' + file + ': ' + error.message, {cause: error});
  }
}
export function readPageMarkup(options = {}) {
  return readSource('index.html', options);
}
export function readManifestUnits(manifestPath, options = {}) {
  manifestPath = repositoryPath(manifestPath);
  const manifest = JSON.parse(readSource(manifestPath, options));
  if (!Array.isArray(manifest.modules) || !manifest.modules.length) throw new Error(manifestPath + ' must declare ordered modules');
  const paths = new Set(), ids = new Set();
  return Object.freeze(manifest.modules.map((module, index) => {
    if (!module || typeof module !== 'object' || typeof module.id !== 'string' || !module.id) throw new Error(manifestPath + ' has an invalid module at ' + index);
    const file = repositoryPath(module.path);
    if (!/\.(?:m?js)$/.test(file)) throw new Error('Authored module must be JavaScript: ' + file);
    if (paths.has(file) || ids.has(module.id)) throw new Error(manifestPath + ' repeats a module id or path: ' + file);
    paths.add(file); ids.add(module.id);
    if (!Array.isArray(module.declarations) || module.declarations.some(name => typeof name !== 'string' || !name) || new Set(module.declarations).size !== module.declarations.length) {
      throw new Error('Invalid declaration list for ' + file);
    }
    return Object.freeze({id: module.id, path: file, declarations: Object.freeze([...module.declarations]), source: readSource(file, options)});
  }));
}
export function readEditorUnits(options = {}) {
  return readManifestUnits(options.editorManifest || sourceManifests.editor, options);
}
export function readRenderUnits(options = {}) {
  return readManifestUnits(options.renderManifest || sourceManifests.render, options);
}
export function readRenderManifest(options = {}) {
  return JSON.parse(readSource(options.renderManifest || sourceManifests.render, options));
}
export function readEditorSource(options = {}) {
  return readEditorUnits(options).map(unit => unit.source).join('\n\n');
}
export function readRenderSource(options = {}) {
  return readRenderUnits(options).map(unit => unit.source).join('\n\n');
}
// Cross-boundary fixtures still inspect actual declarations from both scopes;
// page markup is deliberately excluded and must be requested separately.
export function readAuthoredUnits(options = {}) {
  return Object.freeze([...readEditorUnits(options), ...readRenderUnits(options)]);
}
export function readAuthoredSource(options = {}) {
  return readAuthoredUnits(options).map(unit => unit.source).join('\n\n');
}
export function declaredSourceUnit(units, name) {
  const matches = units.filter(unit => unit.declarations.includes(name));
  if (matches.length !== 1) throw new Error('Expected one authored owner for ' + name + ', found ' + matches.length + (matches.length ? ': ' + matches.map(unit => unit.path).join(', ') : ''));
  return matches[0];
}
export function extractDeclaredFunction(units, name) {
  const unit = declaredSourceUnit(units, name);
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) throw new Error('Invalid function name: ' + name);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...unit.source.matchAll(new RegExp('^ {6}(?:async\\s+)?function\\s*\\*?\\s+' + escaped + '\\s*\\(', 'gm'))];
  if (matches.length !== 1) throw new Error('Expected one declared function ' + name + ' in ' + unit.path + ', found ' + matches.length);
  const start = matches[0].index + 6;
  const node = parseExpressionAt(unit.source, start, {ecmaVersion: 'latest'});
  if (node.type !== 'FunctionExpression' || node.id?.name !== name) throw new Error('Invalid authored function ' + name + ' in ' + unit.path);
  return '      ' + unit.source.slice(start, node.end);
}
const unitDeclarationMaps = new WeakMap();
export function extractDeclaredCode(units, name) {
  const unit = declaredSourceUnit(units, name);
  if (!unitDeclarationMaps.has(unit)) {
    const found = new Map();
    const accept = (name, statement, code) => {
      const start = unit.source.lastIndexOf('\n', statement.start - 1) + 1;
      if (!unit.declarations.includes(name) || unit.source.slice(start, statement.start) !== '      ') return;
      const entries = found.get(name) || [];
      entries.push('      ' + code); found.set(name, entries);
    };
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'FunctionDeclaration') accept(node.id.name, node, unit.source.slice(node.start, node.end));
      if (node.type === 'VariableDeclaration') for (const declaration of node.declarations) {
        if (declaration.id.type === 'Identifier') accept(declaration.id.name, node, node.kind + ' ' + unit.source.slice(declaration.start, declaration.end) + ';');
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === 'start' || key === 'end') continue;
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object') walk(value);
      }
    }
    walk(parse(unit.source, {ecmaVersion: 'latest'}));
    unitDeclarationMaps.set(unit, found);
  }
  const entries = unitDeclarationMaps.get(unit).get(name) || [];
  if (entries.length !== 1) throw new Error('Expected one authored declaration ' + name + ' in ' + unit.path + ', found ' + entries.length);
  return entries[0];
}
// Explicit historical adapter for before/after evidence. Current source readers
// never select this when a manifest is absent or broken.
export function readLegacyInlineEditorSource(options = {}) {
  const html = readPageMarkup(options);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\bsrc\s*=/i.test(match[1]) && match[2].includes('/* ---------------- boot ---------------- */'));
  if (scripts.length !== 1) throw new Error('Expected one historical inline editor, found ' + scripts.length);
  return scripts[0][2];
}
export function replaceSourceOnce(source, marker, replacement, label = 'source hook') {
  const at = source.indexOf(marker);
  if (!marker || at < 0 || source.indexOf(marker, at + marker.length) >= 0) throw new Error(label + ' requires exactly one marker: ' + marker);
  return source.slice(0, at) + replacement + source.slice(at + marker.length);
}
