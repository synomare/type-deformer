// Emit an apply_patch patch; never write the editor from this generator.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
const path = fileURLToPath(new URL('index.html', root));
const html = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const old = html.match(/^      \/\/ BEGIN COUNTERFORM ENGINE GENERATED\n[\s\S]*?^      \/\/ END COUNTERFORM ENGINE GENERATED/m)?.[0];
if (process.argv.includes('--check')) {
  if (old !== embedded) throw new Error('Counterform Engine embedded core/adapter mismatch');
  console.log('Counterform Engine: embedded core/adapter match source modules.');
} else {
  const anchor = '      function surfaceStemWidthAt(field, width, height, x, y, nx, ny, maximum) {';
  if (!old && !html.includes(anchor)) throw new Error('Counterform Engine integration anchor missing');
  console.log(['*** Begin Patch', '*** Update File: ' + path.replaceAll('\\', '/'), '@@',
    ...(old ? old.split('\n').map(line => '-' + line) : []), ...embedded.split('\n').map(line => '+' + line),
    ...(!old ? ['+', ' ' + anchor] : []), '*** End Patch'].join('\n'));
}
