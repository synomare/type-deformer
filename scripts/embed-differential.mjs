// Print a patch for authored declaration owners, or verify prototype parity.
import { readFileSync } from 'node:fs';
import {handleGeneratedDeclarations} from './generated-declarations.mjs';
const root = new URL('../', import.meta.url);
const base = new URL('.codex/prototypes/differential-type/', root);
const read = name => readFileSync(new URL(name, base), 'utf8').replace(/\r\n/g, '\n').trimEnd();
const strip = text => text.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const resample = strip(read('solver.mjs').split('export function grow(')[0]);
const exports = ['normalizeGrowthSettings', 'createGrowthJob', 'sampleGrowthHistory', 'growthLoopAge', 'createGrowthPool', 'growthRequestKey', 'createGrowthController'];
const body = [resample, strip(read('contacts.mjs')), strip(read('history.mjs')), strip(read('runtime.mjs')), strip(read('pool.mjs')), strip(read('controller.mjs'))].join('\n\n');
const embedded = ['// BEGIN DIFFERENTIAL TYPE GENERATED', 'var DifferentialGrowth = (function () {', body,
  `return { ${exports.join(', ')} };`, '})();', read('editor-adapter.js'), '// END DIFFERENTIAL TYPE GENERATED']
  .join('\n').split('\n').map(line => line ? '      ' + line : '').join('\n');
handleGeneratedDeclarations(embedded, 'Differential Type');
