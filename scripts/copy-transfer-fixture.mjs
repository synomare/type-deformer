// Actual renderer and native masks. This is not browser/editor validation.
import vm from 'node:vm';
import { canvas, html, extract, textMask } from './thorn-rooted-fixture.mjs';
export { canvas, html, extract, textMask };
export function fixture(mask, settings = {}) {
  const c = vm.createContext({ Math, Float32Array, Uint8Array, document: { createElement: () => canvas.createCanvas(1, 1) },
    surfaceFxScratchCanvases: {}, compositionState: { enabled: true, phase: 0 }, compositeSurfaceSource() {} });
  const names = ['renderCopyDecay', 'renderCopyDecayLegacy', 'surfaceScratch', 'paintSurfaceMask',
    'surfaceBoundaryDistance', 'surfaceAggregate', 'surfaceChoice', 'surfaceGlyphStrength', 'surfaceNoise01', 'hash',
    ...[...html.matchAll(/^      function (copyTransfer\w+|renderCopyTransfer)\(/gm)].map(m => m[1])];
  vm.runInContext(['params', 'BATCH_PARAM_OPTIONS'].map(n => html.match(new RegExp('      var ' + n + ' = \\{[^]*?\\n      };'))[0]).join('\n')
    + '\n' + [...new Set(names)].map(extract).join('\n'), c);
  Object.assign(c.params, { seed: 41, paper: '#f3f0e8' }, settings);
  c.buildSurfaceMask = glyphs => {
    const result = canvas.createCanvas(mask.width, mask.height), ctx = result.getContext('2d');
    ctx.globalAlpha = Math.max(...glyphs.map(g => c.surfaceGlyphStrength(g, 'copyDecay')), 0);
    ctx.drawImage(mask, 0, 0); return result;
  };
  c.surfaceEffectColor = () => c.params.copyColor;
  c.render = (mode = c.params.copyFailure, strength = 1, phase = 0) => {
    c.params.copyFailure = mode; c.compositionState.phase = phase;
    const output = canvas.createCanvas(mask.width, mask.height);
    c.renderCopyDecay(output.getContext('2d'), [{ surface: { ...c.params, copyDecay: strength } }],
      mask.width, mask.height, 1, { s: 1 }, {}, false);
    return output;
  };
  return c;
}
