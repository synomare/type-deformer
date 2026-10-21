// Real layout-field/snapshot/draw functions; native fonts and synthetic wrapping.
// Not a browser screenshot or file-handler verification.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canvas } from './thorn-rooted-fixture.mjs';
import { fixture, metric, extract, authoredSource } from './paragraph-current-fixture.mjs';
const out = process.argv[2]; if (!out) throw Error('Supply an evidence directory outside the repo');
fs.mkdirSync(out, { recursive: true });
assert.ok(canvas.GlobalFonts.registerFromPath('C:/Windows/Fonts/yumin.ttf', 'Scope Mincho'));
const text = '窓の向こうで雨が止み、文字と文字のあいだに余白が生まれた。読む順序は変わらない。同じ文章が違う速度を持ちはじめる。';
const records = [];
for (const kind of ['paragraphCurrent', 'readingField']) {
  const renders = [], snapshots = [];
  for (const variant of ['baseline', 'shared', 'range']) {
    const image = canvas.createCanvas(1000, 980), ctx = image.getContext('2d');
    const c = fixture({ document: { createElement: () => canvas.createCanvas(1, 1) } });
    Object.assign(c.params, { fontSize: 18, fontFamily: '"Scope Mincho"', fontWeight: 400,
      lineHeight: 1.8, currentFlow: 'crest', currentReach: 1, currentFollow: .8, readingScope: 'paragraph' });
    vm.runInContext(extract('sourceParameterProfile'), c);
    c.batchProfileForKey = (key, m) => c.sourceParameterProfile(c.params, m);
    const change = kind === 'paragraphCurrent' ? { currentBend: -5, currentSpread: -.8 } : { readingPressure: 4.2, readingWidth: .28 };
    if (variant === 'shared') Object.assign(c.params, change);
    ctx.font = '400 18px "Scope Mincho"';
    const tm = ctx.measureText('国'), fm = { ascent: tm.actualBoundingBoxAscent, descent: tm.actualBoundingBoxDescent };
    c.fontMetrics = () => fm;
    for (let paragraph = 0; paragraph < 2; paragraph++) {
      const source = text.repeat(5).slice(0, 222);
      for (const [i, ch] of [...source].entries()) {
        const m = metric(c, 155 + (i % 37) * 18, 180 + paragraph * 400 + Math.floor(i / 37) * 32,
          { width: 18, height: 32, paragraph, text: ch });
        if (variant === 'range' && paragraph === 1) m.localParams = { ...change };
        Object.assign(c.operatorState(m, kind), { current: 1, toggled: true }); c.metrics.push(m);
      }
    }
    c.buildParagraphCurrentFrames(c.metrics, false); c.buildReadingFieldFrames(c.metrics, false);
    for (const m of c.metrics) {
      const p = c.batchProfileForKey(m.batchKey, m);
      c.applyParagraphCurrentVisual(m, p); c.applyReadingFieldVisual(m, p);
    }
    c.invalidateCompositionSource(); const glyphs = c.snapshotGlyphs(true);
    const snapshot = JSON.parse(JSON.stringify(glyphs)); snapshots.push(snapshot);
    ctx.fillStyle = '#f3f0e8'; ctx.fillRect(0, 0, 1000, 980);
    c.drawGlyphs(ctx, glyphs, 1, { dx: 0, dy: 0, s: 1 }, fm, false);
    ctx.fillStyle = '#353535'; ctx.font = '20px "Scope Mincho"';
    ctx.fillText(`${kind} / ${variant}`, 35, 48);
    ctx.font = '16px "Scope Mincho"';
    ctx.fillText(variant === 'range' ? '下段の原文範囲だけ変更。上段は元の値。' : variant === 'shared' ? '共有設定を変更。上段と下段が一緒に変化。' : '変更前の共通設定。', 35, 80);
    ctx.fillText('OFFLINE / same source, font, camera / synthetic wrapping', 35, 930);
    fs.writeFileSync(path.join(out, `${kind}-${variant}.png`), image.toBuffer('image/png')); renders.push(image);
  }
  assert.deepEqual(snapshots[0].slice(0, 222), snapshots[2].slice(0, 222), 'unselected paragraph is unchanged');
  assert.notDeepEqual(snapshots[0].slice(222), snapshots[2].slice(222), 'selected paragraph visibly changes');
  const sheet = canvas.createCanvas(2000, 980), ctx = sheet.getContext('2d');
  ctx.drawImage(renders[1], 0, 0); ctx.drawImage(renders[2], 1000, 0);
  fs.writeFileSync(path.join(out, kind + '-AB.png'), sheet.toBuffer('image/png'));
  ctx.drawImage(renders[2], 0, 0); ctx.drawImage(renders[1], 1000, 0);
  fs.writeFileSync(path.join(out, kind + '-BA.png'), sheet.toBuffer('image/png'));
  records.push({ kind, glyphs: 444, outsideTargetSnapshotUnchanged: true, targetSnapshotChanged: true });
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ sourceSha256: createHash('sha256').update(authoredSource).digest('hex'), records,
  scope: 'actual per-glyph layout/snapshot/native draw, shared base profile, synthetic wrapping. No browser, DOM layout, UI, actual file handler, iPhone or real-time performance claim.' }, null, 2));
console.log(JSON.stringify(records));
