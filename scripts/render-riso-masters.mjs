// Offline comparison: native fonts/masks and actual renderer; UI/Compose are not exercised.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { canvas, authoredSource, textMask, fixture } from './riso-fixture.mjs';
const [beforeFile, outputDir] = process.argv.slice(2);
if (!beforeFile || !outputDir) throw new Error('Usage: node scripts/render-riso-masters.mjs before.html output-directory');
fs.mkdirSync(outputDir, { recursive: true });
const before = fs.readFileSync(beforeFile, 'utf8');
canvas.GlobalFonts.registerFromPath('C:/Windows/Fonts/yumin.ttf', 'Riso Yu Mincho');
const specs = [
  { id: 'large-B', text: 'B', font: 'Arial Black', size: 320 },
  { id: 'serif', text: 'B&O', font: 'Times New Roman', size: 235 },
  { id: 'japanese', text: '永書', font: 'Riso Yu Mincho', size: 225 },
  { id: 'small', text: 'BOUND', font: 'Arial', size: 45 },
  { id: 'strong', text: 'DARK', font: 'Arial Black', size: 142,
    settings: { risoPressure: 2.8, risoSplit: -.45, risoOverlap: .75, risoRegister: 15, risoGrain: .7 } },
  { id: 'aligned', text: 'Aa', font: 'Arial Black', size: 280, settings: { risoRegister: 0 } }
];
const background = '#f3f0e8', manifest = { before: crypto.createHash('sha256').update(before).digest('hex'),
  after: crypto.createHash('sha256').update(authoredSource).digest('hex'), evidence: 'native Canvas; isolated FX; not browser, CSS or real device', cases: [] };
function panel(fx, title) {
  const p = canvas.createCanvas(620, 480), ctx = p.getContext('2d');
  ctx.fillStyle = background; ctx.fillRect(0, 0, p.width, p.height);
  ctx.drawImage(fx, 10, 30); ctx.fillStyle = '#242322'; ctx.font = '14px Arial'; ctx.fillText(title, 20, 23); return p;
}
function save(name, img) { fs.writeFileSync(path.join(outputDir, name + '.png'), img.toBuffer('image/png')); }
function strip(images) {
  const p = canvas.createCanvas(images.length * 620, 480), ctx = p.getContext('2d');
  images.forEach((image, i) => ctx.drawImage(image, i * 620, 0)); return p;
}
for (const spec of specs) {
  const mask = textMask(spec.text, spec.size, spec.font, 600, 440);
  const old = fixture(mask, spec.settings, before), next = fixture(mask, spec.settings);
  const baseline = ['area', 'edge', 'halftone'].map(mode => panel(old.render(mode), mode));
  save(spec.id + '-baseline', strip(baseline));
  for (const mode of ['legacy', 'area', 'edge', 'field', 'halftone']) for (const phase of [0, .37, 1]) {
    assert.deepEqual(next.render(mode, 1, phase).toBuffer('image/png'), old.render(mode, 1, phase).toBuffer('image/png'), `${spec.id} preserved ${mode}/${phase}`);
  }
  if (next.BATCH_PARAM_OPTIONS.risoPlateMap.includes('duotone')) {
    const a = panel(old.render('area'), 'A'), b = panel(next.render('duotone'), 'B');
    save(spec.id + '-A', a); save(spec.id + '-B', b);
    save(spec.id + '-AB', strip([a, b])); save(spec.id + '-BA', strip([b, a]));
    save(spec.id + '-phase', strip([0, .25, .5, .75].map(phase => panel(next.render('duotone', 1, phase), `phase ${phase}`))));
  }
  manifest.cases.push(spec);
}
fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ outputDir, ...manifest }, null, 2));
