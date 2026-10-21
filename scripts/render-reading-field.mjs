// Real snapshot/drawGlyphs, native font metrics, synthetic line composition.
// A source-preserving specimen, not a screenshot or browser file-handler test.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fixture, metric, apply, authoredSource } from './paragraph-current-fixture.mjs';
const require = createRequire(import.meta.url);
const { createCanvas, GlobalFonts } = require(process.env.TYPE_DEFORMER_CANVAS_MODULE || 'C:/Users/soran/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js');
const out = path.resolve(process.argv[2]); fs.mkdirSync(out, { recursive: true });
GlobalFonts.registerFromPath('C:/Windows/Fonts/times.ttf', 'Reading Serif');
GlobalFonts.registerFromPath('C:/Windows/Fonts/yumin.ttf', 'Reading Mincho');
const en = 'A page holds a field of voices. Some remain close enough to read while others gather at its edge. Nothing has been erased. The same sentence can be a foreground, a border, or a distant texture. The reader chooses a place to pause, and the rest of the page continues around it. ';
const ja = '窓の向こうで雨が止み、文字と文字のあいだに余白が生まれた。読む順序は変わらない。それでも行の束が広がるところでは、同じ文章が違う速度を持ちはじめる。密集した声と静かな領域を、一枚の紙の上に残しておく。';
const specimens = [];
function render(name, language, settings = {}, variant = 'reading', vertical = false, count = 1800) {
  const canvas = createCanvas(1400, count >= 10000 ? 3400 : 1100), ctx = canvas.getContext('2d');
  const c = fixture({ document: { createElement: () => createCanvas(1, 1) } });
  Object.assign(c.params, { fontSize: language === 'ja' ? 18 : 22, fontFamily: language === 'ja' ? '"Reading Mincho"' : '"Reading Serif"',
    fontWeight: 400, lineHeight: 1.6, ink: '#202326', vertical, readingScope: 'document', ...settings });
  const p = c.params; ctx.font = `${p.fontWeight} ${p.fontSize}px ${p.fontFamily}`;
  const tm = ctx.measureText(language === 'ja' ? '国' : 'Hg'), fm = { ascent: tm.actualBoundingBoxAscent, descent: tm.actualBoundingBoxDescent };
  c.fontMetrics = () => fm;
  const source = (language === 'ja' ? ja : en).repeat(Math.ceil(count / (language === 'ja' ? ja.length : en.length))).slice(0, count);
  let u = 0, row = 0;
  const measure = vertical ? 700 : 1040, lineHeight = p.fontSize * 1.6;
  for (const ch of source) {
    const w = vertical ? p.fontSize : ctx.measureText(ch).width;
    if (u + w > measure) { u = 0; row++; }
    c.metrics.push(metric(c, vertical ? 1160 - row * lineHeight : 180 + u, vertical ? 190 + u : 180 + row * lineHeight,
      { width: vertical ? lineHeight : w, height: vertical ? w : lineHeight, text: ch, paragraph: settings.readingScope === 'paragraph' ? Math.floor(row / 7) : 0 }));
    u += w;
  }
  c.buildReadingFieldFrames(c.metrics, vertical);
  if (variant === 'current' || variant === 'combined') apply(c, 1);
  if (variant === 'reading' || variant === 'combined') for (const m of c.metrics) {
    Object.assign(c.operatorState(m, 'readingField'), { current: 1, toggled: true }); c.applyReadingFieldVisual(m, p);
  }
  const before = c.snapshotGlyphs(true);
  // Actual sparse-state serialize/restore and repaint. Params use real schema.
  const saved = JSON.parse(JSON.stringify({ text: source, params: c.params, states: c.metrics.map(m => c.sparseOperatorState(m)) }));
  c.metrics.forEach((m, i) => { c.restoreOperatorStates(m, saved.states[i]); c.applyReadingFieldVisual(m, saved.params); });
  c.invalidateCompositionSource(); const glyphs = c.snapshotGlyphs(true);
  assert.deepEqual(JSON.parse(JSON.stringify(glyphs)), JSON.parse(JSON.stringify(before)));
  ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  c.drawGlyphs(ctx, glyphs, 1, { dx: 0, dy: 0, s: 1 }, fm, false);
  ctx.font = '16px Arial'; ctx.fillStyle = '#40474c'; ctx.fillText(name, 48, 52);
  ctx.font = '12px Arial'; ctx.fillText(`OFFLINE / ${source.length} source characters / actual snapshot + drawGlyphs / fixed camera / ${variant}`, 48, 80);
  const file = path.join(out, name + '.png'); fs.writeFileSync(file, canvas.toBuffer('image/png'));
  if (count >= 10000) fs.writeFileSync(path.join(out, name + '-state.json'), JSON.stringify(saved));
  specimens.push({ file, sourceChars: source.length, glyphs: glyphs.length, rows: row + 1, language, settings, variant, vertical,
    pngBytes: fs.statSync(file).size, restoredSnapshotIdentical: true });
}
render('01-neutral-en', 'en', {}, 'neutral');
render('02-current-en', 'en', {}, 'current');
render('03-reading-en', 'en');
render('04-reading-ja', 'ja');
render('05-reading-vertical', 'ja', {}, 'reading', true, 1000);
render('06-reading-per-paragraph', 'en', { readingScope: 'paragraph', readingPressure: 3.5, readingHeight: .4, readingWidth: .55 });
render('07-reading-combined', 'en', { currentBend: 1.5, currentSpread: .3 }, 'combined');
render('08-reading-extreme', 'en', { readingPressure: 6, readingWidth: .22, readingHeight: .12, readingFeather: .04 });
render('09-reading-10k', 'ja', { fontSize: 15, readingPressure: 3.5, readingHeight: .24 }, 'reading', false, 10000);
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ sourceSha256: createHash('sha256').update(authoredSource).digest('hex'), specimens,
  limitations: ['Native Canvas, synthetic wrapping, real glyph snapshot and draw functions.', 'Surface output disabled in fixture; no browser/IME/Mixer/file-handler or iPhone claim.', '10k state JSON is a specimen snapshot, not the actual Project load handler.', 'System fonts not redistributed; prose independently written for tests.'] }, null, 2));
console.log(JSON.stringify(specimens.map(({ file, sourceChars, rows, restoredSnapshotIdentical }) => ({ file, sourceChars, rows, restoredSnapshotIdentical })), null, 2));
