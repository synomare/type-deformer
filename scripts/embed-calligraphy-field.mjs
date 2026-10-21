import { readFileSync } from 'node:fs';
import {handleGeneratedDeclarations} from './generated-declarations.mjs';
const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL('.codex/prototypes/calligraphic-field/' + name, root), 'utf8').replace(/\r\n/g, '\n').trimEnd();
const source = ['core.mjs', 'body.mjs'].map(name => read(name).replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
const block = ['// BEGIN CALLIGRAPHY FIELD GENERATED', 'var CalligraphyField = (function () {', source,
  'return { createCalligraphyContourQuery, buildCalligraphyContourField, normalizeCalligraphyBodySettings, prepareCalligraphyBody, createCalligraphyBodySampler, calligraphyInverseMatrix, rasterCalligraphyBody };',
  '})();', read('editor.js'), '// END CALLIGRAPHY FIELD GENERATED']
  .join('\n').split('\n').map(line => line ? '      ' + line : '').join('\n');
handleGeneratedDeclarations(block, 'Calligraphy Field');
