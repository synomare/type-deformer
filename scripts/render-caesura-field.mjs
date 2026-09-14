// Native fixed-camera studies through the actual Caesura frame, snapshot and
// draw functions. Synthetic wrapping is not browser or iPhone evidence.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fixture, metric, html } from './paragraph-current-fixture.mjs';

const require = createRequire(import.meta.url);
const runtime = process.env.TYPE_DEFORMER_CANVAS_MODULE
  || '@napi-rs/canvas';
const { createCanvas, GlobalFonts, loadImage } = require(runtime);
const out = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'type-deformer-caesura-v63-')));
fs.mkdirSync(out, { recursive: true });
GlobalFonts.registerFromPath('C:/Windows/Fonts/times.ttf', 'Caesura Serif');
GlobalFonts.registerFromPath('C:/Windows/Fonts/yumin.ttf', 'Caesura Mincho');

const passages = {
  en: 'A sentence gathers pressure, then opens. A shorter voice interrupts; another continues until the page begins to breathe. Nothing has been erased, yet every pause changes the architecture! The final clause returns to the line.',
  ja: '頁の中央で声が集まり、読点のあとに小さな空隙が生まれる。短い節は鋭く止まり、長い節はゆっくりと版面を横切っていく。原文は失われない。それでも句点を境に、文章の重力は別の方向へ折れ曲がる！'
};

function scene(language, settings, vertical = false) {
  const c = fixture({ document: { createElement: () => createCanvas(1, 1) } });
  Object.assign(c.params, {
    fontSize: language === 'ja' ? 25 : 27,
    fontFamily: language === 'ja' ? '"Caesura Mincho"' : '"Caesura Serif"',
    fontWeight: 400, lineHeight: 1.65, ink: '#17140f', vertical,
    caesuraGrammar: 'aperture', caesuraBreath: 1.2, caesuraLift: 1.8,
    caesuraHierarchy: 1.2, caesuraAngle: 14, caesuraSpan: .8,
    ...settings
  });
  const measure = createCanvas(1, 1).getContext('2d');
  measure.font = `${c.params.fontWeight} ${c.params.fontSize}px ${c.params.fontFamily}`;
  const tm = measure.measureText(language === 'ja' ? '国' : 'Hg');
  const fm = { ascent: tm.actualBoundingBoxAscent, descent: tm.actualBoundingBoxDescent };
  c.fontMetrics = () => fm;
  const source = passages[language];
  const maxInline = vertical ? 810 : 1080, lineStep = c.params.fontSize * c.params.lineHeight;
  let inline = 0, row = 0, glyphIndex = 0;
  for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex++) {
    const ch = source[sourceIndex];
    if (/\s/.test(ch)) { inline += c.params.fontSize * .34; continue; }
    const advance = vertical ? c.params.fontSize : Math.max(5, measure.measureText(ch).width);
    if (inline + advance > maxInline) { inline = 0; row++; }
    const m = metric(c, vertical ? 1240 - row * lineStep : 230 + inline,
      vertical ? 170 + inline : 230 + row * lineStep,
      { width: vertical ? lineStep : advance, height: vertical ? advance : lineStep, text: ch });
    Object.assign(m.el.dataset, { sourceStart: String(sourceIndex), sourceEnd: String(sourceIndex + 1),
      cp: String(ch.codePointAt(0)), j: String(glyphIndex++) });
    Object.assign(c.operatorState(m, 'caesuraField'), { current: 1, toggled: true });
    c.metrics.push(m); inline += advance;
  }
  c.buildCaesuraFieldFrames(c.metrics, vertical);
  for (const m of c.metrics) c.applyCaesuraFieldVisual(m, c.params);
  c.invalidateCompositionSource();
  return { c, glyphs: c.snapshotGlyphs(true), fm, source, rows: row + 1 };
}

function render(name, language, settings, vertical = false) {
  const { c, glyphs, fm, source, rows } = scene(language, settings, vertical);
  const canvas = createCanvas(1700, 1250), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f4f3ef'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  c.drawGlyphs(ctx, glyphs, 1, { dx: 0, dy: 0, s: 1 }, fm, false);
  ctx.fillStyle = '#353532'; ctx.font = '17px Arial'; ctx.fillText(name, 50, 50);
  ctx.font = '12px Arial'; ctx.fillText(`OFFLINE / actual clause model + snapshot + drawGlyphs / ${language} / ${glyphs.length} glyphs / fixed camera`, 50, 76);
  const file = path.join(out, name + '.png'); fs.writeFileSync(file, canvas.toBuffer('image/png'));
  return { file, language, vertical, settings, source, glyphs: glyphs.length, rows };
}

const records = [];
records.push(render('01-A-gap-only', 'en', { caesuraLift: 0, caesuraHierarchy: 0, caesuraAngle: 0 }));
records.push(render('02-B-clause-lattice', 'en', {}));
records.push(render('03-aperture-ja', 'ja', {}));
records.push(render('04-terrace-en', 'en', { caesuraGrammar: 'terrace', caesuraBreath: 1, caesuraLift: 2.4, caesuraHierarchy: 1.65, caesuraAngle: 20 }));
records.push(render('05-hinge-ja', 'ja', { caesuraGrammar: 'hinge', caesuraBreath: .7, caesuraLift: 1.3, caesuraHierarchy: 1.25, caesuraAngle: 34, caesuraSpan: .86 }));
records.push(render('06-aperture-vertical', 'ja', {}, true));

const a = fs.readFileSync(records[0].file), b = fs.readFileSync(records[1].file);
for (const order of ['AB', 'BA']) {
  const pair = createCanvas(3400, 1250), ctx = pair.getContext('2d');
  const first = order === 'AB' ? a : b, second = order === 'AB' ? b : a;
  const imageA = await loadImage(first), imageB = await loadImage(second);
  ctx.drawImage(imageA, 0, 0); ctx.drawImage(imageB, 1700, 0);
  fs.writeFileSync(path.join(out, `comparison-${order}.png`), pair.toBuffer('image/png'));
}

fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
  sourceSha256: createHash('sha256').update(html).digest('hex'), records,
  comparison: { A: 'punctuation gap only', B: 'selected paragraph-wide clause lattice', reverseOrder: true },
  limitations: ['Synthetic wrapping and native system fonts.', 'No browser CSS layout, IME, Compose playback, file-handler, real iPhone, or production claim.', 'System fonts are used for local evidence only and are not redistributed.']
}, null, 2));
console.log(out);
