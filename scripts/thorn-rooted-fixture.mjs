// Isolated real renderer + native Canvas. Does not emulate the browser editor.
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const canvas = require(process.env.TYPE_DEFORMER_CANVAS_MODULE || '@napi-rs/canvas');
export const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
export const extract = name => {
  const source = html.match(new RegExp('^      function ' + name + '\\([^]*?^      }', 'm'))?.[0];
  if (!source) throw new Error('Missing actual function: ' + name);
  return source;
};
const names = ['renderThornCrown', 'renderThornCrownLegacy', 'renderThornRooted', 'thornSpine', 'thornOrganPaths', 'thornContourRoots',
  'surfaceScratch', 'sampleSurfaceMask', 'surfaceAggregate', 'surfaceChoice', 'surfaceGlyphStrength', 'hash'];
export function createThornFixture(mask, settings = {}, oldSource = '') {
  const { width, height } = mask;
  const c = vm.createContext({ document: { createElement: () => canvas.createCanvas(1, 1) }, surfaceFxScratchCanvases: {},
    compositeSurfaceSource() {}, surfaceEffectColor: () => c.params.thornColor });
  vm.runInContext(['params', 'BATCH_PARAM_OPTIONS'].map(name => html.match(new RegExp('      var ' + name + ' = \\{[^]*?\\n      };'))[0]).join('\n')
    + '\n' + names.map(extract).join('\n') + '\n' + oldSource, c);
  Object.assign(c.params, { seed: 41, paper: '#f3f0e8' }, settings);
  c.buildSurfaceMask = glyphs => {
    const result = canvas.createCanvas(width, height), ctx = result.getContext('2d');
    ctx.globalAlpha = glyphs.reduce((max, g) => Math.max(max, c.surfaceGlyphStrength(g, 'thornCrown')), 0);
    ctx.drawImage(mask, 0, 0); return result;
  };
  const glyph = { surface: { thornCrown: 1, ...settings } };
  c.render = (strength = 1, units = 1) => {
    glyph.surface.thornCrown = strength;
    const result = canvas.createCanvas(width, height);
    c.renderThornCrown(result.getContext('2d'), [glyph], width, height, units, { s: 1 }, {}, false);
    return result;
  };
  return c;
}
export function textMask(text, size = 160, font = 'Times New Roman', width = 700, height = 520) {
  const result = canvas.createCanvas(width, height), ctx = result.getContext('2d');
  ctx.font = `${size}px "${font}"`; ctx.fillStyle = '#fff';
  const m = ctx.measureText(text);
  ctx.fillText(text, (width - m.width) / 2, (height + m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  return result;
}
