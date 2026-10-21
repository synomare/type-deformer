// Fixed native comparison of two actual Textura Matrix grammars from authored render sources.
// This is not browser, editor, export, Compose-performance, or device evidence.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { canvas, textMask, texturaFixture } from './textura-matrix-fixture.mjs';

canvas.GlobalFonts.registerFromPath('C:/Windows/Fonts/yumin.ttf', 'Textura Proof Yu Mincho');
const outputDir = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'type-deformer-textura-v60-'));
fs.mkdirSync(outputDir, { recursive: true });
const paper = '#f3f0e8';
const cases = [
  { id: 'display', text: 'B&O', size: 245, font: 'Times New Roman', width: 680, height: 440 },
  { id: 'word', text: 'RITUAL', size: 170, font: 'Arial Black', width: 760, height: 400 },
  { id: 'japanese', text: '永書', size: 230, font: 'Textura Proof Yu Mincho', width: 680, height: 440 },
  { id: 'small', text: 'BOUND', size: 54, font: 'Arial', width: 600, height: 260 },
  { id: 'marks', text: '.?!', size: 92, font: 'Georgia', width: 420, height: 260 }
];

function panel(surface, label) {
  const result = canvas.createCanvas(surface.width, surface.height + 30), ctx = result.getContext('2d');
  ctx.fillStyle = paper; ctx.fillRect(0, 0, result.width, result.height);
  ctx.fillStyle = '#292622'; ctx.font = '13px Arial'; ctx.fillText(label, 14, 19);
  ctx.drawImage(surface, 0, 30);
  return result;
}
function strip(left, right) {
  const result = canvas.createCanvas(left.width + right.width, Math.max(left.height, right.height));
  const ctx = result.getContext('2d'); ctx.drawImage(left, 0, 0); ctx.drawImage(right, left.width, 0);
  return result;
}
function save(name, surface) {
  fs.writeFileSync(path.join(outputDir, name + '.png'), surface.toBuffer('image/png'));
}

const manifest = {
  version: 60,
  evidence: 'native Canvas, authored Textura quadrata A vs authored Medial Ductus B; no browser/editor/export/device',
  cases: []
};
for (const spec of cases) {
  const mask = textMask(spec.text, spec.size, spec.font, spec.width, spec.height);
  const fixture = texturaFixture(mask, { texturaColor: '#17140f' });
  const startA = performance.now(), current = fixture.render('textura', 1, 0), currentMs = performance.now() - startA;
  const startB = performance.now(), ductus = fixture.render('ductus', 1, 0), ductusMs = performance.now() - startB;
  const a = panel(current, 'A · current Textura quadrata');
  const b = panel(ductus, 'B · v60 Medial ductus');
  save(spec.id + '-A', a); save(spec.id + '-B', b);
  save(spec.id + '-AB', strip(a, b)); save(spec.id + '-BA', strip(b, a));
  save(spec.id + '-phase', strip(
    panel(fixture.render('ductus', 1, 0.25), 'Ductus phase .25'),
    panel(fixture.render('ductus', 1, 0.75), 'Ductus phase .75')
  ));
  manifest.cases.push({ ...spec, currentMs: +currentMs.toFixed(1), ductusFirstMs: +ductusMs.toFixed(1) });
}
manifest.sha256 = Object.fromEntries(fs.readdirSync(outputDir).filter(name => name.endsWith('.png')).map(name => [name,
  crypto.createHash('sha256').update(fs.readFileSync(path.join(outputDir, name))).digest('hex')]));
fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(outputDir);
console.log(JSON.stringify(manifest.cases, null, 2));
