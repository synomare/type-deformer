// Real renderer; supplied native masks, no browser or full output-handler claim.
import vm from 'node:vm';
import { canvas, html, extract, textMask } from './thorn-rooted-fixture.mjs';
export { canvas, html, extract, textMask };
const names = ['renderRibbonEcho', 'renderRibbonLamina', 'renderRibbonEchoLegacy',
  'surfaceScratch', 'paintSurfaceMask', 'fractureMaskBounds', 'surfaceHexRgb', 'surfaceToneCss',
  'surfaceAggregate', 'surfaceChoice', 'surfaceGlyphStrength', 'hash',
  ...[...html.matchAll(/^      function (ribbon\w+)\(/gm)].map(m => m[1])];
export function fixture(mask, settings = {}, oldSource = '') {
  const c = vm.createContext({ document: { createElement: () => canvas.createCanvas(1, 1) },
    surfaceFxScratchCanvases: {}, compositionState: { enabled: true, phase: 0 },
    ribbonEchoEffectPadCache: { key: '', value: 0 }, compositeSurfaceSource() {} });
  vm.runInContext(['params', 'BATCH_PARAM_OPTIONS'].map(n => html.match(new RegExp('      var ' + n + ' = \\{[^]*?\\n      };'))[0]).join('\n')
    + '\n' + [...new Set(names)].map(extract).join('\n') + '\n' + oldSource, c);
  Object.assign(c.params, { seed: 41, paper: '#f3f0e8' }, settings);
  c.buildSurfaceMask = () => mask;
  c.surfaceEffectColor = () => c.params.ribbonColor;
  c.render = (path = c.params.ribbonPath, strength = 1, phase = 0, renderer = 'renderRibbonEcho') => {
    c.params.ribbonPath = path; c.compositionState.phase = phase;
    const output = canvas.createCanvas(mask.width, mask.height);
    c[renderer](output.getContext('2d'), [{ surface: { ribbonEcho: strength, ...c.params } }],
      mask.width, mask.height, 1, { s: 1 }, {}, false);
    return output;
  };
  return c;
}
