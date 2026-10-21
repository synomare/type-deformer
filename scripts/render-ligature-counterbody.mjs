import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canvas, createLigatureFixture, defaultSettings, textMask } from './ligature-counterbody-fixture.mjs';

const outputDir = process.argv[2] || await fs.mkdtemp(path.join(os.tmpdir(), 'type-deformer-ligature-v62-'));
await fs.mkdir(outputDir, { recursive: true });
const cases = [
  { text: 'RITUAL', size: 132, font: 'Times New Roman', settings: { ligatureBodyReach: 180 } },
  { text: '結晶連結', size: 132, font: 'Yu Mincho', settings: { ligatureBodyReach: 180 } },
  { text: 'aeon 04', size: 52, font: 'Arial', settings: { ligatureBodyReach: 120, ligatureBodyBand: 7 } },
  { text: 'AMBIVALENT', size: 88, font: 'Georgia', settings: { ligatureBodyFusion: 2.6,
    ligatureBodyReach: 260, ligatureBodyBand: 30, ligatureBodyCounter: 0.9, ligatureBodyTension: -2.4 } }
];

function paintTile(ctx, effect, source, x, y, width, height, label) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = defaultSettings.paper;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.1;
  ctx.drawImage(source, 0, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.drawImage(effect, 0, 0, width, height);
  ctx.fillStyle = '#222a42';
  ctx.font = '17px Arial';
  ctx.fillText(label, 18, 27);
  ctx.restore();
}

async function renderSheet(order, filename) {
  const tileWidth = 820, tileHeight = 360;
  const sheet = canvas.createCanvas(tileWidth * 2, tileHeight * cases.length);
  const sheetCtx = sheet.getContext('2d');
  for (let row = 0; row < cases.length; row++) {
    const item = cases[row];
    const source = textMask(item.text, item.size, item.font, tileWidth, tileHeight);
    const fixture = createLigatureFixture(source, item.settings);
    for (let column = 0; column < order.length; column++) {
      const grammar = order[column];
      paintTile(sheetCtx, fixture.render(grammar), fixture.source, column * tileWidth, row * tileHeight,
        tileWidth, tileHeight, `${grammar === 'interlock' ? 'A / current interlock' : 'B / compound counterbody'} · ${item.text}`);
    }
  }
  const file = path.join(outputDir, filename);
  await fs.writeFile(file, sheet.toBuffer('image/png'));
  return file;
}

const ab = await renderSheet(['interlock', 'counterbody'], 'ligature-ab.png');
const ba = await renderSheet(['counterbody', 'interlock'], 'ligature-ba.png');
console.log(JSON.stringify({ outputDir, ab, ba, cases }, null, 2));

