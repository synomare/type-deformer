import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { canvas, fixture, textMask, authoredSource } from './ribbon-lamina-fixture.mjs';
const output = process.argv[2];
if (!output) throw Error('Provide an evidence directory outside the repository');
fs.mkdirSync(output, { recursive: true });
for (const [file, family] of [['times.ttf', 'RibbonSerif'], ['yumin.ttf', 'RibbonMincho']]) {
  if (!canvas.GlobalFonts.registerFromPath('C:/Windows/Fonts/' + file, family)) throw Error('Font unavailable: ' + file);
}
const specimens = [
  ['B', 192, 'RibbonSerif', {}], ['永書', 160, 'RibbonMincho', {}], ['BOUND', 54, 'RibbonSerif', {}],
  ['RIBBON', 116, 'RibbonSerif', { ribbonDepth: 135, ribbonTwist: 200, ribbonWeave: 2.3 }],
  ['O O', 160, 'RibbonSerif', { ribbonDepth: 48, ribbonWeave: .6, ribbonSteps: 48 }],
  ['thin &', 36, 'RibbonSerif', { ribbonDepth: 42 }],
  ['界面', 140, 'RibbonMincho', { ribbonDepth: -220, ribbonTwist: -360, ribbonWeave: 4 }]
];
const records = [];
for (const [i, [text, size, font, settings]] of specimens.entries()) {
  const mask = textMask(text, size, font, 900, 620), c = fixture(mask, settings), time = performance.now();
  const source = canvas.createCanvas(900, 620), sourceCtx = source.getContext('2d');
  sourceCtx.drawImage(mask, 0, 0); sourceCtx.globalCompositeOperation = 'source-in';
  sourceCtx.fillStyle = '#111'; sourceCtx.fillRect(0, 0, 900, 620);
  const images = ['helix', 'lamina'].map(mode => c.render(mode));
  const sheet = canvas.createCanvas(1800, 660), ctx = sheet.getContext('2d');
  ctx.fillStyle = '#f3f0e8'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  images.forEach((image, col) => {
    // Same source opacity and fixed camera for both candidates.
    ctx.save(); ctx.globalAlpha = .28; ctx.drawImage(source, col * 900, 40); ctx.restore();
    ctx.drawImage(image, col * 900, 40);
    ctx.fillStyle = '#111'; ctx.font = '18px "RibbonMincho"';
    ctx.fillText(`${col ? 'B' : 'A'} / ${text} ${size}px / ${col ? 'lamina' : 'helix'} / offline`, col * 900 + 18, 28);
    fs.writeFileSync(path.join(output, `${i}-${col ? 'B' : 'A'}-fx.png`), image.toBuffer('image/png'));
  });
  const file = `${i}-AB.png`; fs.writeFileSync(path.join(output, file), sheet.toBuffer('image/png'));
  const reversed = canvas.createCanvas(1800, 660), reversedCtx = reversed.getContext('2d');
  reversedCtx.drawImage(sheet, 900, 0, 900, 660, 0, 0, 900, 660);
  reversedCtx.drawImage(sheet, 0, 0, 900, 660, 900, 0, 900, 660);
  fs.writeFileSync(path.join(output, `${i}-BA.png`), reversed.toBuffer('image/png'));
  records.push({ file, text, size, font, settings, pairRenderMs: +(performance.now() - time).toFixed(1) });
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ sourceSha256: createHash('sha256').update(authoredSource).digest('hex'), records,
  scope: 'Native Canvas, actual renderer/aggregation; supplied masks, source .28 composite. Not browser, UI, live Compose, Mixer or export handler. System fonts not redistributed.' }, null, 2));
console.log(JSON.stringify(records));
