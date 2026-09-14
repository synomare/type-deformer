// Actual separation/compositing functions + native Canvas; not a browser/editor.
import vm from 'node:vm';
import { canvas, html, textMask } from './thorn-rooted-fixture.mjs';
export { canvas, html, textMask };
export function fixture(mask, settings = {}, source = html) {
  const extract = name => {
    const code = source.match(new RegExp('^      function ' + name + '\\([^]*?^      }', 'm'))?.[0];
    if (!code) throw new Error('Missing actual function: ' + name);
    return code;
  };
  const c = vm.createContext({ document: { createElement: () => canvas.createCanvas(1, 1) },
    surfaceFxScratchCanvases: {}, compositionState: { enabled: true, phase: 0 }, compositeSurfaceSource() {} });
  const names = [...[...source.matchAll(/^      function (renderRiso\w+)\(/gm)].map(m => m[1]), 'surfaceScratch', 'colorizeSurfaceCanvas',
    'surfaceBoundaryDistance', 'surfaceAggregate', 'surfaceChoice', 'surfaceGlyphStrength', 'surfaceNoise01', 'hash',
    ...[...source.matchAll(/^      function (riso\w+)\(/gm)].map(m => m[1])];
  vm.runInContext(['params', 'BATCH_PARAM_OPTIONS'].map(n => source.match(new RegExp('      var ' + n + ' = \\{[^]*?\\n      };'))[0]).join('\n')
    + '\n' + [...new Set(names)].map(extract).join('\n'), c);
  Object.assign(c.params, { seed: 41, paper: '#f3f0e8' }, settings);
  c.buildSurfaceMask = glyphs => {
    const result = canvas.createCanvas(mask.width, mask.height), ctx = result.getContext('2d');
    ctx.globalAlpha = Math.max(...glyphs.map(g => c.surfaceGlyphStrength(g, 'risoSeparation')), 0);
    ctx.drawImage(mask, 0, 0); return result;
  };
  c.render = (mode = c.params.risoPlateMap, strength = 1, phase = 0, scale = 1) => {
    c.params.risoPlateMap = mode; c.compositionState.phase = phase;
    const output = canvas.createCanvas(mask.width, mask.height);
    c.renderRisoSeparation(output.getContext('2d'), [{ surface: { ...c.params, risoSeparation: strength } }],
      mask.width, mask.height, scale, { s: 1 }, {}, false);
    return output;
  };
  return c;
}
