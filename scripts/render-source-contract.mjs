import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

export const parse = source => acorn.parse(source, { ecmaVersion: 'latest' });
export function patternNames(node, names) {
  if (!node) return;
  if (node.type === 'Identifier') names.add(node.name);
  else if (node.type === 'ObjectPattern') node.properties.forEach(p => patternNames(p.value || p.argument, names));
  else if (node.type === 'ArrayPattern') node.elements.forEach(p => patternNames(p, names));
  else if (node.type === 'AssignmentPattern') patternNames(node.left, names);
  else if (node.type === 'RestElement') patternNames(node.argument, names);
}
function functionLocals(node, names, initial = true) {
  if (!node || typeof node !== 'object') return;
  if (!initial && /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(node.type)) {
    if (node.type === 'FunctionDeclaration') patternNames(node.id, names);
    return;
  }
  if (node.type === 'VariableDeclaration' && node.kind === 'var') node.declarations.forEach(d => patternNames(d.id, names));
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => functionLocals(child, names, false));
    else if (value && typeof value === 'object') functionLocals(value, names, false);
  }
}
export function references(node, initialNames = []) {
  const found = [];
  function walk(n, bound, parent, property) {
    if (!n || typeof n !== 'object') return;
    if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type)) {
      bound = new Set(bound);
      patternNames(n.id, bound); n.params.forEach(p => patternNames(p, bound)); functionLocals(n.body, bound);
    }
    if (n.type === 'BlockStatement' || n.type === 'Program') {
      bound = new Set(bound);
      n.body.forEach(statement => {
        if (statement.type === 'VariableDeclaration') statement.declarations.forEach(d => patternNames(d.id, bound));
        if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') patternNames(statement.id, bound);
      });
    }
    if (n.type === 'CatchClause') { bound = new Set(bound); patternNames(n.param, bound); }
    if (/^(ForStatement|ForOfStatement|ForInStatement)$/.test(n.type)) {
      bound = new Set(bound);
      const declaration = n.init || n.left;
      if (declaration?.type === 'VariableDeclaration') declaration.declarations.forEach(d => patternNames(d.id, bound));
    }
    if (n.type === 'Identifier') {
      const ignored = parent && (
        parent.type === 'MemberExpression' && property === 'property' && !parent.computed ||
        /^(Property|MethodDefinition|PropertyDefinition)$/.test(parent.type) && property === 'key' && !parent.computed ||
        /^(VariableDeclarator|FunctionDeclaration|FunctionExpression|ClassDeclaration|ClassExpression)$/.test(parent.type) && property === 'id' ||
        /^(LabeledStatement|BreakStatement|ContinueStatement)$/.test(parent.type) && property === 'label'
      );
      if (!ignored && !bound.has(n.name)) found.push({ name: n.name, start: n.start, end: n.end, shorthand: parent?.type === 'Property' && parent.shorthand && property === 'value' });
      return;
    }
    for (const [key, value] of Object.entries(n)) {
      if (key === 'start' || key === 'end') continue;
      if (Array.isArray(value)) value.forEach(child => walk(child, bound, n, key));
      else if (value && typeof value === 'object') walk(value, bound, n, key);
    }
  }
  walk(node, new Set(initialNames));
  return [...new Map(found.map(ref => [ref.start, ref])).values()];
}
export function rewriteReferences(source, refs, names, receiver) {
  const edits = refs.filter(ref => names.has(ref.name)).map(ref => ({
    ...ref, text: (ref.shorthand ? ref.name + ': ' : '') + receiver + '.' + ref.name
  }));
  for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  return source;
}
export function globalPropertyReferences(node) {
  const free = new Set(references(node).filter(ref => ref.name === 'globalThis').map(ref => ref.start)), found = new Set();
  function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'MemberExpression' && n.object.type === 'Identifier' && free.has(n.object.start)) {
      const name = n.computed ? n.property.type === 'Literal' && typeof n.property.value === 'string' ? n.property.value : '[dynamic]' : n.property.name;
      found.add(name);
    }
    for (const value of Object.values(n)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(node); return [...found].sort();
}
export function readWorkerEntrypointContract(repo, specification) {
  const source = fs.readFileSync(path.join(repo, specification.path), 'utf8');
  const ast = parse(source), allowed = new Set(specification.globals);
  const dependencies = [...new Set(references(ast).map(ref => ref.name))].sort();
  const globalProperties = globalPropertyReferences(ast), allowedProperties = new Set(specification.globalProperties);
  const unknown = dependencies.filter(name => !allowed.has(name)).concat(
    globalProperties.filter(name => !allowedProperties.has(name)).map(name => 'globalThis.' + name)
  );
  if (unknown.length) throw new Error('Unknown Worker entrypoint dependencies: ' + unknown.sort().join(', '));
  return { path: specification.path, dependencies, globalProperties, unknown: [] };
}
export function readRenderContract(repo) {
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, 'render-source/manifest.json'), 'utf8'));
  const declarations = new Map(), units = [];
  for (const module of manifest.modules) {
    const source = fs.readFileSync(path.join(repo, module.path), 'utf8').replace(/\r\n/g, '\n');
    const ast = parse(source), actual = [];
    for (const node of ast.body) {
      if (node.type === 'FunctionDeclaration') {
        actual.push(node.id.name);
        if (declarations.has(node.id.name)) throw new Error('Duplicate render declaration: ' + node.id.name);
        declarations.set(node.id.name, { name: node.id.name, node, code: source.slice(node.start, node.end), module: module.id, kind: 'function' });
      } else if (node.type === 'VariableDeclaration') {
        for (const declaration of node.declarations) {
          if (declaration.id.type !== 'Identifier') throw new Error('Render module declarations require explicit names: ' + module.path);
          actual.push(declaration.id.name);
          if (declarations.has(declaration.id.name)) throw new Error('Duplicate render declaration: ' + declaration.id.name);
          const code = 'var ' + source.slice(declaration.start, declaration.end) + ';';
          declarations.set(declaration.id.name, { name: declaration.id.name, node: parse(code).body[0].declarations[0].init, code, module: module.id, kind: 'variable' });
        }
      } else if (node.type !== 'EmptyStatement') throw new Error('Render modules contain declarations only: ' + module.path);
    }
    if (JSON.stringify(actual) !== JSON.stringify(module.declarations)) throw new Error('Render declarations differ from manifest: ' + module.path);
    units.push({ ...module, source });
  }
  const order = manifest.declarationOrder;
  if (new Set(order).size !== order.length || order.length !== declarations.size || order.some(name => !declarations.has(name))) throw new Error('Render declaration order must list each declaration exactly once');
  const allowed = new Set([...declarations.keys(), ...manifest.environment.map(p => p.name), ...manifest.globals]);
  const allowedProperties = new Set(manifest.globalProperties || []);
  const dependencies = {}, unknown = new Set();
  for (const [name, declaration] of declarations) {
    dependencies[name] = [...new Set(references(declaration.node).map(ref => ref.name))].sort();
    dependencies[name].forEach(dependency => { if (!allowed.has(dependency)) unknown.add(dependency); });
    globalPropertyReferences(declaration.node).forEach(property => { if (!allowedProperties.has(property)) unknown.add('globalThis.' + property); });
  }
  for (const route of Object.values(manifest.routes)) {
    const ast=parse('(' + route + ')');
    references(ast).forEach(ref => { if (!allowed.has(ref.name)) unknown.add(ref.name); });
    globalPropertyReferences(ast).forEach(property => { if (!allowedProperties.has(property)) unknown.add('globalThis.' + property); });
  }
  if (unknown.size) throw new Error('Unknown render dependencies: ' + [...unknown].sort().join(', '));
  const workerEntrypoint = manifest.workerEntrypoint ? readWorkerEntrypointContract(repo, manifest.workerEntrypoint) : null;
  return { manifest, declarations, units, dependencies, workerEntrypoint };
}
