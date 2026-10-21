// Local native comparison: synthetic wrapping, actual editor page mapper and
// drawGlyphs. No screenshots or browser/device QA are implied by these files.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { exportFixture, canvas, authoredSource } from './export-fixture.mjs';
import { setMeasuredPageSource } from './page-layout-fixture.mjs';
import { extract } from './paragraph-current-fixture.mjs';
const out = path.resolve(process.argv[2] || '.codex/evidence/page-layout'); fs.mkdirSync(out, { recursive: true });
const passage = '窓を開くと、遠くの雨の音が聞こえた。読み終えたはずの文章が、余白を隔ててもう一度現れる。声の強さではなく、そのあいだにある距離を記しておく。頁をめくる前とあとで、同じ言葉の重さは少しだけ違っている。';
const source = ('余白の往復\n' + passage + '\n\n' + passage + '\n\n' + passage + '\n\n' + passage + '\n\n' + passage);
const records = [];
for (const vertical of [false,true]) for (const mode of ['continuous','spreads','expression']) {
  const { c } = exportFixture();
  Object.assign(c.params, { fontSize: 20, fontFamily: '"Yu Mincho"', lineHeight: 1.45,
    textMeasure: 24, pageLayout: mode === 'continuous' ? 'continuous' : 'spreads',
    pageDepth: 12, pageGutter: 6, pageGap: 6, pageOrder: 'auto', vertical,
    currentFlow: 'crest', currentBend: -1.8, currentSpread: .35, currentFollow: .35,
    readingPressure: 2, readingWidth: .7, readingHeight: .5 });
  setMeasuredPageSource(c, source);
  if (mode === 'expression') {
    for (const m of c.metrics) {
      const kind = m.pageIndex % 2 ? 'paragraphCurrent' : 'readingField';
      Object.assign(c.operatorState(m, kind), { toggled: true, current: 1 });
    }
    c.measureLayout();
  }
  const image = canvas.createCanvas(1360, 2000), ctx = image.getContext('2d');
  ctx.fillStyle = '#f4f3ef'; ctx.fillRect(0, 0, image.width, image.height);
  const minX = Math.min(...c.metrics.map(m => m.flowX - m.w/2));
  const minY = Math.min(...c.metrics.map(m => m.flowY - m.h/2));
  const viewport = { dx: 90-minX, dy: 140-minY, s: 1 };
  const glyphs = c.snapshotGlyphs(true), bounds = c.contentBounds(glyphs, 0);
  assert.ok(bounds.x + viewport.dx >= 0 && bounds.y + viewport.dy >= 0
    && bounds.x + bounds.w + viewport.dx <= image.width && bounds.y + bounds.h + viewport.dy <= image.height,
    'comparison canvas must contain every glyph');
  c.drawGlyphs(ctx, glyphs, 1, viewport, c.fontMetrics(), false);
  const name = (vertical ? 'vertical-' : 'horizontal-') + mode;
  ctx.fillStyle = '#3f4449'; ctx.font = '18px Arial'; ctx.fillText(name, 48, 42);
  ctx.font = '12px Arial'; ctx.fillText('OFFLINE / same source + font + size + viewport within writing direction / synthetic wrapping', 48, 68);
  ctx.fillText('Page arrangement, not a clip. No Surface effects. Not browser or iPhone evidence.', 48, 89);
  fs.writeFileSync(path.join(out, name + '.png'), image.toBuffer('image/png'));
  // A local, reloadable starting example; no font files or borrowed assets.
  c.renderedSourceText = source; c.cloneBatchProfiles = () => ({}); c.cloneLookMemory = () => ({ slots: [] });
  for (const m of c.metrics) { m.currentIntensity = 0; m.toggled = false; }
  vm.runInContext(extract('projectData') + '\n' + extract('letterState'), c);
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(c.projectData()));
  records.push({ name, params: c.params, source, glyphs: c.metrics.length, pages: c.pageLayoutState.pages.length, viewport });
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ sourceSha256: createHash('sha256').update(authoredSource).digest('hex'), records,
  limitations: ['Native system font used for local testing only, not redistributed.', 'Synthetic wrapping does not implement full Japanese kinsoku, vertical punctuation or browser layout.', 'No preview frame, no app screenshot, no iPhone or browser interaction.'] }, null, 2));
console.log(out);
