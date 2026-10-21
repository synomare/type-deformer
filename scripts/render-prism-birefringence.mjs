import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canvas, createPrismFixture, defaultSettings, textMask } from './prism-birefringence-fixture.mjs';

const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'type-deformer-prism-v61-'));
const cases = [
  { text: 'SACRAMENT', size: 122, font: 'Times New Roman', settings: {} },
  { text: '永晶', size: 176, font: 'Yu Mincho', settings: { prismFacets: 12, prismBloom: 112 } },
  { text: 'aegis 04', size: 54, font: 'Arial', settings: { prismFacets: 18, prismDispersion: 14, prismBloom: 56 } },
  { text: 'B&8', size: 208, font: 'Georgia', settings: { prismIridescence: 3.2, prismDispersion: 74, prismCaustic: 3.1, prismBloom: 156 } }
];

function paintTile(ctx, effect, source, x, y, width, height, label) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = defaultSettings.paper;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.13;
  ctx.drawImage(source, 0, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.drawImage(effect, 0, 0, width, height);
  ctx.fillStyle = 'rgba(255,255,255,.82)';
  ctx.font = '17px Arial';
  ctx.fillText(label, 18, 28);
  ctx.restore();
}

async function renderSheet(order, filename) {
  const tileWidth = 820, tileHeight = 440;
  const sheet = canvas.createCanvas(tileWidth * 2, tileHeight * cases.length);
  const sheetCtx = sheet.getContext('2d');
  for (let row = 0; row < cases.length; row++) {
    const item = cases[row];
    const source = textMask(item.text, item.size, item.font, tileWidth, tileHeight);
    const fixture = createPrismFixture(source, item.settings);
    for (let column = 0; column < order.length; column++) {
      const optics = order[column];
      paintTile(sheetCtx, fixture.render(optics), fixture.source, column * tileWidth, row * tileHeight, tileWidth, tileHeight,
        `${optics === 'crystal' ? 'A / current crystal' : 'B / birefringent field'} · ${item.text} · ${item.font} ${item.size}px`);
    }
  }
  const file = path.join(outputDir, filename);
  await fs.writeFile(file, sheet.toBuffer('image/png'));
  return file;
}

const ab = await renderSheet(['crystal', 'birefringent'], 'prism-ab.png');
const ba = await renderSheet(['birefringent', 'crystal'], 'prism-ba.png');
console.log(JSON.stringify({ outputDir, ab, ba, cases }, null, 2));
