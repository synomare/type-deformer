// Native glyph metrics + explicitly synthetic line wrapping. This is not CSS,
// browser, font-loading or real-device evidence. Uses the actual page mapper,
// effect frame builders, snapshot and output handlers from the editor.
import vm from 'node:vm';
import { metric, extract } from './paragraph-current-fixture.mjs';
import { canvas } from './export-fixture.mjs';
export function setMeasuredPageSource(c, source, states = null, { paragraphSpacing = false } = {}) {
  const p = c.params, ctx = canvas.createCanvas(1, 1).getContext('2d');
  ctx.font = `${p.fontWeight} ${p.fontSize}px ${p.fontFamily}`;
  const tm = ctx.measureText('国Hg');
  c.fontMetrics = () => ({ ascent: tm.actualBoundingBoxAscent, descent: tm.actualBoundingBoxDescent });
  c.textInput.value = source; c.renderedSourceText = source; c.metrics = [];
  const measure = (p.textMeasure > 0 ? p.textMeasure : 32) * p.fontSize, step = p.fontSize * p.lineHeight;
  let u = 0, row = 0, paragraph = 0;
  for (const part of new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(source)) {
    const ch = part.segment;
    // Opt-in em spacing model; legacy studies keep their recorded 1.5-line
    // approximation. Neither model executes CSS margin collapsing/line boxes.
    if (/^[\r\n]+$/.test(ch)) {
      row += paragraphSpacing ? 1 + (p.paragraphGap ?? .55) / p.lineHeight : 1.5;
      u = 0; paragraph++; continue;
    }
    const width = p.vertical ? p.fontSize : ctx.measureText(ch).width;
    if (u > 0 && u + width > measure) { u = 0; row++; }
    if (!/^[ \t\u00a0]+$/.test(ch)) {
      const m = metric(c, p.vertical ? 4000 - row * step : 50 + u, p.vertical ? 50 + u : 50 + row * step,
        { width: p.vertical ? step : width, height: p.vertical ? width : step, text: ch, paragraph });
      Object.assign(m.el.dataset, { sourceStart: String(part.index), sourceEnd: String(part.index + ch.length) });
      m.sourceIndex = c.metrics.length;
      const saved = states?.[c.metrics.length];
      if (saved) { c.restoreOperatorStates(m, saved.o); m.localParams = saved.p || null; }
      c.metrics.push(m);
    }
    u += width;
  }
  vm.runInContext(extract('sourceParameterProfile'), c);
  c.batchProfileForKey = (key, m) => c.sourceParameterProfile(c.params, m);
  c.measureLayout();
  return c.pageLayoutState;
}
