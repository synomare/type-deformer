// Emit an apply_patch patch; never write the editor from this generator.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url), base = new URL('.codex/prototypes/conformal-type/', root);
const read = name => readFileSync(new URL(name, base), 'utf8').replace(/\r\n/g, '\n').trimEnd();
const strip = text => text.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
const names = ['CONFORMAL_TYPE_PRESETS', 'normalizeConformalSettings', 'prepareConformalGlyph', 'createConformalMap',
  'compileConformalGlyph', 'renderConformalLod', 'conformalPixelTolerance', 'createConformalSourcePool'];
const embedded = ['// BEGIN CONFORMAL TYPE GENERATED', 'var ConformalType = (function () {',
  ...['core.mjs','lod.mjs','source-pool.mjs'].map(name => strip(read(name))),
  `return { ${names.join(', ')} };`, '})();', read('editor-adapter.js'), '// END CONFORMAL TYPE GENERATED']
  .join('\n').split('\n').map(line => line ? '      ' + line : '').join('\n');
const path = fileURLToPath(new URL('index.html', root));
const html = readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const old = html.match(/^      \/\/ BEGIN CONFORMAL TYPE GENERATED\n[\s\S]*?^      \/\/ END CONFORMAL TYPE GENERATED/m)?.[0];
if (process.argv.includes('--check')) {
  if (old !== embedded) throw new Error('Conformal embedded source is stale. Apply scripts/embed-conformal.mjs output.');
  console.log('Conformal Type: embedded core/LOD/source-pool/adapter match source modules.');
} else {
  const anchor = '      function renderAsemicDuctus(targetCtx, glyphs, width, height, pixelScale, L, fm, coverBase) {';
  if (!old && !html.includes(anchor)) throw new Error('Conformal integration anchor missing');
  console.log(['*** Begin Patch','*** Update File: '+path.replaceAll('\\','/'),'@@',
    ...(old ? old.split('\n').map(line => '-'+line) : []),...embedded.split('\n').map(line => '+'+line),
    ...(!old ? ['+',' '+anchor] : []),'*** End Patch'].join('\n'));
}
