import {readEditorUnits, readRenderManifest, replaceSourceOnce} from './source-reader.mjs';
import {parse, references, rewriteReferences} from './render-source-contract.mjs';

export const editorBootMarker = '      /* ---------------- boot ---------------- */';
export function editorHookTarget(options = {}) {
  const owners = readEditorUnits(options).filter(unit => unit.source.includes(editorBootMarker));
  if (owners.length !== 1) throw new Error('Expected one authored editor boot owner, found ' + owners.length);
  return owners[0];
}
export function rewriteEditorHook(hook, options = {}) {
  const names = new Set(readRenderManifest(options).modules.flatMap(unit => unit.declarations));
  return rewriteReferences(hook, references(parse(hook)), names, 'renderEngine');
}
export function insertEditorHook(source, hook, marker = editorBootMarker, options = {}) {
  return replaceSourceOnce(source, marker, rewriteEditorHook(hook, options) + '\n' + marker, 'authored editor instrumentation');
}
