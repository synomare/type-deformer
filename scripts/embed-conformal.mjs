// Emit an apply_patch patch; never write the editor from this generator.
import { readFileSync } from 'node:fs';
import {handleGeneratedDeclarations} from './generated-declarations.mjs';
const root = new URL('../', import.meta.url), base = new URL('.codex/prototypes/conformal-type/', root);
const read = name => readFileSync(new URL(name, base), 'utf8').replace(/\r\n/g, '\n').trimEnd();
const strip = text => text.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const names = ['CONFORMAL_TYPE_PRESETS', 'normalizeConformalSettings', 'prepareConformalGlyph', 'createConformalMap',
  'compileConformalGlyph', 'renderConformalLod', 'conformalPixelTolerance', 'createConformalSourcePool'];
const embedded = ['// BEGIN CONFORMAL TYPE GENERATED', 'var ConformalType = (function () {',
  ...['core.mjs','lod.mjs','source-pool.mjs'].map(name => strip(read(name))),
  `return { ${names.join(', ')} };`, '})();', read('editor-adapter.js'), '// END CONFORMAL TYPE GENERATED']
  .join('\n').split('\n').map(line => line ? '      ' + line : '').join('\n');
handleGeneratedDeclarations(embedded, 'Conformal Type');
