// Actual Textura Matrix renderer with a synthetic mask. This is native Canvas,
// not browser/editor/device evidence.
import vm from 'node:vm';
import { canvas, html, textMask } from './thorn-rooted-fixture.mjs';

export { canvas, html, textMask };

export function texturaFixture(mask, settings = {}, source = html) {
  const extract = name => {
    const fn = source.match(new RegExp('^      function ' + name + '\\([^]*?^      }', 'm'))?.[0];
    if (!fn) throw new Error('Missing actual function: ' + name);
    return fn;
  };
  const c = vm.createContext({
    Math,
    document: { createElement: () => canvas.createCanvas(1, 1) },
    surfaceFxScratchCanvases: {},
    compositionState: { enabled: true, phase: 0 },
    compositeSurfaceSource() {}
  });
  const names = [
    'renderTexturaMatrix', 'renderTexturaMatrixLegacy', 'traceTexturaStem',
    'traceTexturaGrammarStem', 'surfaceScratch', 'surfaceBoundaryDistance',
    'surfaceToneCss', 'surfaceHexRgb', 'surfaceAggregate', 'surfaceChoice',
    'surfaceGlyphStrength', 'hash',
    'texturaDuctusClampV60', 'texturaDuctusBoundsV60', 'texturaDuctusSignatureV60',
    'texturaDuctusDownsampleV60', 'texturaDuctusChamferV60',
    'texturaDuctusThinV60', 'texturaDuctusNeighborsV60', 'texturaDuctusEdgeKeyV60',
    'texturaDuctusTraceV60', 'texturaDuctusPointLineDistanceV60', 'texturaDuctusSimplifyV60',
    'texturaDuctusMapPointV60', 'texturaDuctusPrepareV60', 'texturaDuctusExtendedPointsV60',
    'texturaDuctusGeometryV60', 'renderTexturaDuctusV60'
  ];
  const ductusGlobals = source.match(/      var TEXTURA_DUCTUS_NEIGHBORS_V60 = \[[^]*?      var texturaDuctusPreparedCacheV60 = \{[^\n]+;/)?.[0];
  if (!ductusGlobals) throw new Error('Missing actual Textura Ductus globals.');
  vm.runInContext(
    ['params', 'BATCH_PARAM_OPTIONS'].map(name => source.match(
      new RegExp('      var ' + name + ' = \\{[^]*?\\n      };'))[0]).join('\n')
      + '\n' + ductusGlobals + '\n' + names.map(extract).join('\n'), c);
  Object.assign(c.params, { seed: 41, paper: '#f3f0e8', texturaColor: '#17140f' }, settings);
  c.surfaceEffectColor = () => c.params.texturaColor;
  c.buildSurfaceMask = glyphs => {
    const result = canvas.createCanvas(mask.width, mask.height);
    const ctx = result.getContext('2d');
    ctx.globalAlpha = Math.max(...glyphs.map(g => c.surfaceGlyphStrength(g, 'texturaMatrix')), 0);
    ctx.drawImage(mask, 0, 0);
    return result;
  };
  c.render = (grammar = c.params.texturaGrammar, strength = 1, phase = 0) => {
    c.params.texturaGrammar = grammar;
    c.compositionState.phase = phase;
    const result = canvas.createCanvas(mask.width, mask.height);
    c.renderTexturaMatrix(result.getContext('2d'), [{
      surface: { ...c.params, texturaMatrix: strength }
    }], mask.width, mask.height, 1, { s: 1 }, {}, false);
    return result;
  };
  return c;
}
