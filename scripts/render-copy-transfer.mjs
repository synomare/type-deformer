import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { canvas, fixture, textMask, authoredSource } from './copy-transfer-fixture.mjs';
const output = process.argv[2];
if (!output) throw Error('Supply an evidence directory outside the repository');
fs.mkdirSync(output, { recursive: true });
for (const [file, family] of [['times.ttf', 'CopySerif'], ['arialbd.ttf', 'CopyBold'], ['yumin.ttf', 'CopyMincho']]) {
  if (!canvas.GlobalFonts.registerFromPath('C:/Windows/Fonts/' + file, family)) throw Error('Font unavailable: ' + file);
}
const candidates = process.argv.includes('--baseline') ? ['generational', 'ghosting'] : ['generational', 'transfer'];
const specimens = [
  ['B O', 180, 'CopySerif', {}], ['複写', 160, 'CopyMincho', {}],
  ['TRANSFER', 90, 'CopyBold', { copyGenerations: 24, copyDust: .9 }],
  ['thin & repeated', 36, 'CopySerif', {}],
  ['LOSS', 140, 'CopyBold', { copyGenerations: 32, copyErosion: 6, copyToner: .1, copyDust: 1.8 }],
  ['TONER', 110, 'CopyBold', { copyGenerations: 32, copyErosion: 0, copyToner: 3, copyExposure: .7 }],
  ['N N', 120, 'CopySerif', { copyGenerations: 48, copyMotion: -130, copyInstability: 3 }]
];
const records = [];
for (const [i, [text, size, font, settings]] of specimens.entries()) {
  const mask = textMask(text, size, font, 740, 420), c = fixture(mask, settings), times = [];
  const images = candidates.map(mode => { const t = performance.now(); const image = c.render(mode); times.push(performance.now() - t); return image; });
  const sheet = canvas.createCanvas(1480, 460), ctx = sheet.getContext('2d');
  ctx.fillStyle = '#f3f0e8'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  images.forEach((image, col) => {
    ctx.drawImage(image, col * 740, 40);
    ctx.fillStyle = '#111'; ctx.font = '17px "CopyMincho"';
    ctx.fillText(`${col ? 'B' : 'A'} / ${text} ${size}px / ${candidates[col]} / FX only / offline`, col * 740 + 15, 28);
    fs.writeFileSync(path.join(output, `${i}-${col ? 'B' : 'A'}-fx.png`), image.toBuffer('image/png'));
  });
  const file = `${i}-AB.png`; fs.writeFileSync(path.join(output, file), sheet.toBuffer('image/png'));
  const reverse = canvas.createCanvas(1480, 460), r = reverse.getContext('2d');
  r.drawImage(sheet, 740, 0, 740, 460, 0, 0, 740, 460); r.drawImage(sheet, 0, 0, 740, 460, 740, 0, 740, 460);
  fs.writeFileSync(path.join(output, `${i}-BA.png`), reverse.toBuffer('image/png'));
  records.push({ file, text, size, font, settings, candidates, renderMs: times.map(t => +t.toFixed(1)) });
}
if (!process.argv.includes('--baseline')) {
  const mask = textMask('AFTER', 86, 'CopyBold', 420, 240);
  const sheet = canvas.createCanvas(1680, 560), ctx = sheet.getContext('2d');
  const source = canvas.createCanvas(420, 240), sourceCtx = source.getContext('2d');
  sourceCtx.drawImage(mask, 0, 0); sourceCtx.globalCompositeOperation = 'source-in';
  sourceCtx.fillStyle = '#20201d'; sourceCtx.fillRect(0, 0, 420, 240);
  ctx.fillStyle = '#f3f0e8'; ctx.fillRect(0, 0, 1680, 560);
  const settings = { copyMotion: 0, copyInstability: 1.5, copyErosion: 3, copyDust: 1.2, copyToner: .4 };
  for (const [col, generations] of [1, 8, 24, 48].entries()) {
    const result = fixture(mask, { ...settings, copyGenerations: generations }).render('transfer');
    for (const [row, opacity] of [0, .72].entries()) {
      ctx.save(); ctx.globalAlpha = opacity; ctx.drawImage(source, col * 420, row * 280 + 40); ctx.restore();
      ctx.drawImage(result, col * 420, row * 280 + 40);
      ctx.font = '16px "CopyMincho"'; ctx.fillStyle = '#111';
      ctx.fillText(`N=${generations} / source ${opacity} / offline`, col * 420 + 16, row * 280 + 28);
    }
  }
  fs.writeFileSync(path.join(output, 'transfer-generations.png'), sheet.toBuffer('image/png'));
  records.push({ file: 'transfer-generations.png', settings, generations: [1, 8, 24, 48],
    sourceOpacity: [0, .72], scope: 'native manual source composite, not actual Mixer handler' });
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ sourceSha256: createHash('sha256').update(authoredSource).digest('hex'), records,
  scope: 'Actual renderer, native supplied masks, fixed seed/camera/phase. FX only. No browser, UI, source mixer, export handler or iPhone verification. System fonts are not redistributed.' }, null, 2));
console.log(JSON.stringify(records));
