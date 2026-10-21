// Native isolated-FX comparison. No browser/Compose/UI/device claim.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { canvas, authoredSource, textMask, fixture } from './hatch-copper-fixture.mjs';
const [beforeFile, outputDir] = process.argv.slice(2);
if (!beforeFile || !outputDir) throw new Error('Usage: node scripts/render-hatch-copper.mjs before.html output-directory');
fs.mkdirSync(outputDir, { recursive: true });
const before = fs.readFileSync(beforeFile, 'utf8');
canvas.GlobalFonts.registerFromPath('C:/Windows/Fonts/yumin.ttf', 'Copper Yu Mincho');
const specs = [
  { id: 'large-B', text: 'B', font: 'Arial Black', size: 320 },
  { id: 'serif', text: 'B&O', font: 'Times New Roman', size: 235 },
  { id: 'japanese', text: '永書', font: 'Copper Yu Mincho', size: 225 },
  { id: 'small', text: 'BOUND', font: 'Arial', size: 45 },
  { id: 'strong', text: 'DARK', font: 'Arial Black', size: 142,
    settings: { hatchDepth: 3.4, hatchWarp: 3.5, hatchStroke: 2.2 } },
  { id: 'counter', text: 'O', font: 'Arial Black', size: 330 }
];
const manifest = { before: crypto.createHash('sha256').update(before).digest('hex'),
  after: crypto.createHash('sha256').update(authoredSource).digest('hex'), evidence: 'native Canvas; isolated FX; synthetic mask transport; no browser or device', cases: [] };
function panel(fx, title) {
  const p = canvas.createCanvas(620, 480), ctx = p.getContext('2d');
  ctx.fillStyle = '#f3f0e8'; ctx.fillRect(0, 0, p.width, p.height);
  ctx.drawImage(fx, 10, 30); ctx.fillStyle = '#242322'; ctx.font = '14px Arial'; ctx.fillText(title, 20, 23); return p;
}
function save(name, p) { fs.writeFileSync(path.join(outputDir, name + '.png'), p.toBuffer('image/png')); }
function strip(images) {
  const p = canvas.createCanvas(images.length * 620, 480), ctx = p.getContext('2d');
  images.forEach((img, i) => ctx.drawImage(img, i * 620, 0)); return p;
}
for (const spec of specs) {
  const mask = textMask(spec.text, spec.size, spec.font, 600, 440);
  const old = fixture(mask, spec.settings, before), next = fixture(mask, spec.settings);
  save(spec.id + '-baseline', strip(['tonal', 'crosscut', 'woodcut'].map(mode => panel(old.render(mode), mode))));
  for (const mode of ['legacy', 'tonalV29', 'crosscutV29', 'woodcutV29', 'tonal', 'crosscut', 'woodcut']) {
    for (const phase of [0, .37, 1]) assert.deepEqual(next.render(mode, 1, phase).toBuffer('image/png'), old.render(mode, 1, phase).toBuffer('image/png'));
  }
  if (next.BATCH_PARAM_OPTIONS.hatchGrammar.includes('copperplate')) {
    const a = panel(old.render('tonal'), 'A'), b = panel(next.render('copperplate'), 'B');
    save(spec.id + '-A', a); save(spec.id + '-B', b);
    save(spec.id + '-AB', strip([a, b])); save(spec.id + '-BA', strip([b, a]));
    save(spec.id + '-phase', strip([0, .25, .5, .75].map(t => panel(next.render('copperplate', 1, t), `phase ${t}`))));
  }
  manifest.cases.push(spec);
}
fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
