// Print an apply_patch patch (no file writes), or verify the embedded source.
// Keeps file://, one-file distribution and offline exports independent of ESM.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
const path = fileURLToPath(new URL('index.html', root));
const html = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const old = html.match(/^      \/\/ BEGIN DIFFERENTIAL TYPE GENERATED\n[\s\S]*?^      \/\/ END DIFFERENTIAL TYPE GENERATED/m)?.[0];
if (process.argv.includes('--check')) {
  if (old !== embedded) throw new Error('Differential Type embedded source is stale. Apply the patch printed by scripts/embed-differential.mjs.');
  console.log('Differential Type: embedded runtime/controller/adapter match source modules.');
} else {
  const anchor = '      function renderAsemicDuctus(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {';
  if (!old && !html.includes(anchor)) throw new Error('Integration anchor missing');
  console.log(['*** Begin Patch', '*** Update File: ' + path.replaceAll('\\', '/'), '@@',
    ...(old ? old.split('\n').map(line => '-' + line) : []), ...embedded.split('\n').map(line => '+' + line),
    ...(!old ? ['+', ' ' + anchor] : []), '*** End Patch'].join('\n'));
}
