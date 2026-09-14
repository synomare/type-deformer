import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url), path = fileURLToPath(new URL('index.html', root));
const read = name => readFileSync(new URL('.codex/prototypes/calligraphic-field/' + name, root), 'utf8').replace(/\r\n/g, '\n').trimEnd();
const source = ['core.mjs', 'body.mjs'].map(name => read(name).replace(/^import .*;\n/gm, '').replace(/^export /gm, '')).join('\n');
const block = ['// BEGIN CALLIGRAPHY FIELD GENERATED', 'var CalligraphyField = (function () {', source,
  'return { createCalligraphyContourQuery, buildCalligraphyContourField, normalizeCalligraphyBodySettings, prepareCalligraphyBody, createCalligraphyBodySampler, calligraphyInverseMatrix, rasterCalligraphyBody };',
  '})();', read('editor.js'), '// END CALLIGRAPHY FIELD GENERATED']
  .join('\n').split('\n').map(line => line ? '      ' + line : '').join('\n');
const html = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const old = html.match(/^      \/\/ BEGIN CALLIGRAPHY FIELD GENERATED\n[\s\S]*?^      \/\/ END CALLIGRAPHY FIELD GENERATED/m)?.[0];
if (process.argv.includes('--check')) {
  if (old !== block) throw new Error('Calligraphy field embedded source mismatch');
  console.log('Calligraphy field: embedded geometry matches module.');
} else {
  const anchor = '      function renderCalligraphicStress(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {';
  if (!old && !html.includes(anchor)) throw new Error('Calligraphy anchor missing');
  console.log(['*** Begin Patch', '*** Update File: ' + path.replaceAll('\\', '/'), '@@',
    ...(old ? old.split('\n').map(l => '-' + l) : []), ...block.split('\n').map(l => '+' + l),
    ...(!old ? ['+', ' ' + anchor] : []), '*** End Patch'].join('\n'));
}
