// Native output evidence, not a screenshot of the application or mobile UI.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { exportFixture, canvas, authoredSource } from './export-fixture.mjs';
import { extract } from './paragraph-current-fixture.mjs';
const out = process.argv[2]; if (!out) throw Error('Supply an evidence directory outside the repository');
fs.mkdirSync(out, { recursive: true });
const boards = [];
for (const variant of ['before', 'after']) {
  const board = canvas.createCanvas(1440, 960), ctx = board.getContext('2d');
  const { c } = exportFixture();
  Object.assign(c.params, { abW: 480, abH: 320, fit: false, marginPct: 10 });
  c.setSource('余白の位置\nLIGHT', 'paragraphCurrent', Array(10).fill({ o: {} }));
  if (variant === 'before') vm.runInContext(extract('exportLayout')
    .replace('if (ax == null) ax = 0.5;', 'ax = ax || 0.5;')
    .replace('if (ay == null) ay = 0.5;', 'ay = ay || 0.5;'), c);
  for (const [index, anchor] of ['tl','tc','tr','cl','cc','cr','bl','bc','br'].entries()) {
    c.params.anchor = anchor;
    const tile = c.renderCanvas(1), tileCtx = tile.getContext('2d');
    tileCtx.strokeStyle = '#bb715c'; tileCtx.lineWidth = 1; tileCtx.strokeRect(32, 32, 416, 256);
    tileCtx.fillStyle = '#333'; tileCtx.font = '14px "Yu Mincho"'; tileCtx.fillText(variant + ' / ' + anchor, 14, 19);
    ctx.drawImage(tile, index % 3 * 480, Math.floor(index / 3) * 320);
  }
  fs.writeFileSync(path.join(out, 'anchors-' + variant + '.png'), board.toBuffer('image/png')); boards.push(board);
}
const pair = canvas.createCanvas(2880, 960), ctx = pair.getContext('2d');
ctx.drawImage(boards[0], 0, 0); ctx.drawImage(boards[1], 1440, 0);
fs.writeFileSync(path.join(out, 'anchors-AB.png'), pair.toBuffer('image/png'));
const records = [];
for (const kind of ['paragraphCurrent', 'readingField']) {
  const png = path.join(out, kind + '.png'); if (!fs.existsSync(png)) continue;
  const img = await canvas.loadImage(png), crop = canvas.createCanvas(Math.min(img.width, 1200), 1000);
  // Around the selected original-text range, not a rescaled whole 10k image.
  const y = Math.max(0, Math.min(img.height - 1000, Math.round(img.height * .23)));
  crop.getContext('2d').drawImage(img, 0, y, crop.width, 1000, 0, 0, crop.width, 1000);
  fs.writeFileSync(path.join(out, kind + '-detail.png'), crop.toBuffer('image/png'));
  records.push({ kind, width: img.width, height: img.height, cropY: y,
    pngSha256: createHash('sha256').update(fs.readFileSync(png)).digest('hex') });
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
  sourceSha256: createHash('sha256').update(authoredSource).digest('hex'), records,
  scope: 'Actual export/layout functions and native Yu Mincho. Synthetic wrapping/DOM/FileReader. No browser/device/download/UI success claim.'
}, null, 2));
console.log(JSON.stringify(records));
