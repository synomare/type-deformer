// Emit an apply_patch patch; never write the editor from this generator.
import { readFileSync } from 'node:fs';
import {handleGeneratedDeclarations} from './generated-declarations.mjs';
const root = new URL('../', import.meta.url), base = new URL('.codex/prototypes/counterform-engine/', root);
const read = name => readFileSync(new URL(name, base), 'utf8').replace(/\r\n/g, '\n').trimEnd();
const strippedCore = read('core.mjs').replace(
  /\/\/ A single-glyph reconstruction[\s\S]*?(?=export function counterformMaskMetrics)/,
  ''
).replace(/^export /gm, '');
const names = ['COUNTERFORM_GRAMMARS', 'normalizeCounterformSettings', 'isCounterformNative',
  'prepareCounterformBody', 'renderCounterformBody', 'counterformMaskMetrics'];
const embedded = ['// BEGIN COUNTERFORM ENGINE GENERATED', 'var CounterformEngine = (function () {', strippedCore,
  `return { ${names.join(', ')} };`, '})();', read('editor-adapter.js'), '// END COUNTERFORM ENGINE GENERATED']
  .join('\n').split('\n').map(line => line ? '      ' + line : '').join('\n');
handleGeneratedDeclarations(embedded, 'Counterform Engine');
