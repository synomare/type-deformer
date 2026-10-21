// Offline native output of the actual snapshot + drawGlyphs editor functions.
// Synthetic measured line boxes: does not claim browser wrapping/interaction QA.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fixture, metric, apply, authoredSource } from './paragraph-current-fixture.mjs';
const require = createRequire(import.meta.url);
const runtime = process.env.TYPE_DEFORMER_CANVAS_MODULE;
if (!runtime) throw new Error('Set TYPE_DEFORMER_CANVAS_MODULE to the installed @napi-rs/canvas module.');
const { createCanvas, GlobalFonts } = require(runtime);
const out = path.resolve(process.argv[2] || '.codex/evidence/paragraph-current');
fs.mkdirSync(out, { recursive: true });
GlobalFonts.registerFromPath('C:/Windows/Fonts/times.ttf', 'Current Serif');
GlobalFonts.registerFromPath('C:/Windows/Fonts/yumin.ttf', 'Current Mincho');
const english = 'A page can hold several currents at once. The words remain in their original order while the spaces between the lines become a landscape. A quiet passage opens into a wide interval, then gathers itself again. Reading is not a straight crossing; it is a negotiation between a mark and the next silence. ';
const japanese = '窓の向こうで雨が止み、文字と文字のあいだに余白が生まれた。読む順序は変わらない。それでも行の束が広がるところでは、同じ文章が違う速度を持ちはじめる。密集した声と静かな領域を、一枚の紙の上に残しておく。';
const specimens = [];
function render(name, language, settings, strength = 1, vertical = false, baseline = false) {
  const canvas = createCanvas(1400, 1050), ctx = canvas.getContext('2d');
  const c = fixture({ document: { createElement: () => createCanvas(1, 1) } });
  Object.assign(c.params, { fontSize: language === 'ja' ? 21 : 22, fontFamily: language === 'ja' ? '"Current Mincho"' : '"Current Serif"', fontWeight: 400,
    lineHeight: 1.6, ink: '#202326', vertical, ...settings });
  const p = c.params, font = `${p.fontWeight} ${p.fontSize}px ${p.fontFamily}`;
  ctx.font = font; const tm = ctx.measureText(language === 'ja' ? '国' : 'Hg');
  const fm = { ascent: tm.actualBoundingBoxAscent, descent: tm.actualBoundingBoxDescent };
  c.fontMetrics = () => fm;
  const text = (language === 'ja' ? japanese : english).repeat(language === 'ja' ? 4 : 3);
  const width = vertical ? 670 : 980, h = p.fontSize * 1.6;
  let u = 0, row = 0;
  for (const ch of [...text]) {
    const w = vertical ? p.fontSize : ctx.measureText(ch).width;
    if (u + w > width) { u = 0; row++; }
    const m = metric(c, vertical ? 1000 - row * h : 200 + u, vertical ? 180 + u : 240 + row * h,
      { width: vertical ? h : w, height: vertical ? w : h, text: ch });
    m.el.dataset.j = String(c.metrics.length); m.el.dataset.lineLength = String([...text].length);
    c.metrics.push(m); u += w;
  }
  apply(c, strength);
  if (baseline) {
    // Existing Baseline Shift's actual source-order field, same bend amplitude.
    for (const m of c.metrics) {
      m.el.style.setProperty('--op-baseline-y', String(-c.formFieldSignal(m, p.baselinePattern, p.baselineCycles, p.baselinePhase) * p.currentBend) + 'em');
    }
  }
  ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const glyphs = c.snapshotGlyphs(true);
  c.drawGlyphs(ctx, glyphs, 1, { dx: 0, dy: 0, s: 1 }, fm, false);
  ctx.fillStyle = '#40474c'; ctx.font = '16px Arial'; ctx.fillText(name, 48, 52);
  ctx.font = '12px Arial'; ctx.fillText(`OFFLINE / actual editor snapshot + drawGlyphs / ${language} / ${c.metrics.length} glyphs / fixed camera`, 48, 80);
  const file = path.join(out, name + '.png'); fs.writeFileSync(file, canvas.toBuffer('image/png'));
  specimens.push({ file, language, settings, strength, vertical, baseline, glyphs: c.metrics.length, measuredRows: row + 1 });
}
render('01-neutral', 'en', {}, 0);
render('02-baseline-control', 'en', {}, 0, false, true);
render('03-current-default', 'en', {});
render('04-current-crest', 'en', { currentFlow: 'crest', currentBend: -4, currentSpread: 1.05, currentFocus: .6, currentReach: .35, currentFollow: .85 });
render('05-current-japanese', 'ja', {});
render('06-current-vertical', 'ja', {}, 1, true);
render('07-current-dense', 'en', { currentBend: 5, currentSpread: -.7, currentFollow: .3 });
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ sourceSha256: createHash('sha256').update(authoredSource).digest('hex'), specimens,
  limitations: ['Synthetic measured line boxes, not browser wrapping.', 'System fonts used only in local evidence; not redistributed.', 'Surface layer disabled in this isolated fixture.', 'No iPhone or full file-handler verification.'] }, null, 2));
console.log(out);
