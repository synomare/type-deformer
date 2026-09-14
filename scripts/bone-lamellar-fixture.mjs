// Real Bone kernels on native Canvas. Glyph layout transport is isolated, not browser evidence.
import vm from 'node:vm';
import { canvas, html } from './thorn-rooted-fixture.mjs';
export { canvas, html };
export function boneMask(text, size = 270, font = 'Arial Black', width = 650, height = 420) {
  const mask = canvas.createCanvas(width, height), ctx = mask.getContext('2d');
  ctx.font = `${size}px "${font}"`; ctx.fillStyle = '#fff';
  const measured = ctx.measureText(text);
  let x = (width - measured.width) / 2;
  const y = (height + measured.actualBoundingBoxAscent - measured.actualBoundingBoxDescent) / 2;
  const metas = [];
  for (const ch of text) {
    const m = ctx.measureText(ch); ctx.fillText(ch, x, y);
    metas.push({ x: x + (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2,
      y: y + (m.actualBoundingBoxDescent - m.actualBoundingBoxAscent) / 2,
      halfW: Math.max(5, m.width * .62), halfH: Math.max(5, size * .62), index: metas.length });
    x += m.width;
  }
  return { mask, metas };
}
export function fixture(input, settings = {}, source = html) {
  const mask = input.mask || input;
  const offsets = new Map([...source.matchAll(/^      function (\w+)\(/gm)].map(m => [m[1], m.index]));
  const functions = new Map();
  function body(name) {
    if (functions.has(name)) return functions.get(name);
    const start = offsets.get(name), end = source.indexOf('\n', start);
    const line = source.slice(start, end).trimEnd();
    const result = line.endsWith('}') ? line : source.slice(start, source.indexOf('\n      }', start) + 8);
    functions.set(name, result); return result;
  }
  const stubs = new Set(['buildSurfaceMask', 'compositeSurfaceSource', 'surfaceEffectColor', 'surfaceGlyphAnatomyMetas', 'drawSurfaceGlyph']);
  const needed = new Set();
  function visit(name) {
    if (needed.has(name) || stubs.has(name) || !offsets.has(name)) return;
    needed.add(name);
    for (const call of body(name).matchAll(/\b(\w+)\s*\(/g)) visit(call[1]);
  }
  visit('renderBoneScaffold');
  const c = vm.createContext({ document: { createElement: () => canvas.createCanvas(1, 1) },
    surfaceFxScratchCanvases: {}, compositionState: { enabled: true, phase: 0 }, compositeSurfaceSource() {} });
  vm.runInContext(['params', 'BATCH_PARAM_OPTIONS'].map(n => source.match(new RegExp('      var ' + n + ' = \\{[^]*?\\n      };'))[0]).join('\n')
    + '\n' + [...needed].map(n => functions.get(n)).join('\n'), c);
  Object.assign(c.params, { seed: 41, paper: '#f3f0e8', boneColor: '#63554a' }, settings);
  c.surfaceEffectColor = () => c.params.boneColor;
  c.drawSurfaceGlyph = (ctx, glyph, units, L, fm, alpha) => {
    ctx.save(); ctx.globalAlpha = alpha * (glyph.opacity ?? 1); ctx.drawImage(mask, 0, 0); ctx.restore();
  };
  c.surfaceGlyphAnatomyMetas = glyphs => (input.metas || [{ x: mask.width/2, y: mask.height/2, halfW: mask.width/2, halfH: mask.height/2, index: 0 }])
    .map(meta => ({ ...meta, strength: glyphs[0].surface.boneScaffold }));
  c.buildSurfaceMask = (glyphs, id, w, h, units, L, fm, full) => {
    const result = canvas.createCanvas(mask.width, mask.height), ctx = result.getContext('2d');
    ctx.globalAlpha = full ? 1 : glyphs[0].surface.boneScaffold; ctx.drawImage(mask, 0, 0); return result;
  };
  c.render = (mode = c.params.boneArchitecture, strength = 1, phase = 0, units = 1) => {
    c.params.boneArchitecture = mode; c.compositionState.phase = phase;
    const result = canvas.createCanvas(mask.width, mask.height);
    c.renderBoneScaffold(result.getContext('2d'), [{ surface: { ...c.params, boneScaffold: strength } }],
      mask.width, mask.height, units, { s: 1 }, {}, false);
    return result;
  };
  return c;
}
