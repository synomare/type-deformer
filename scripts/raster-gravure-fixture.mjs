// Actual Raster Press renderer in an isolated native-Canvas fixture.
// This validates deterministic pixels, not the browser editor or a device UI.
import vm from 'node:vm';
import { canvas, html, textMask } from './thorn-rooted-fixture.mjs';

export { canvas, html, textMask };

function functionSource(source, name) {
  const match = source.match(new RegExp('^      function ' + name + '\\([^]*?^      }', 'm'));
  if (!match) throw new Error('Missing actual function: ' + name);
  return match[0];
}

function objectSource(source, name) {
  const match = source.match(new RegExp('      var ' + name + ' = \\{[^]*?\\n      };'));
  if (!match) throw new Error('Missing actual object: ' + name);
  return match[0];
}

export function createRasterFixture(mask, settings = {}, source = html) {
  const { width, height } = mask;
  const context = vm.createContext({
    Math,
    document: { createElement: () => canvas.createCanvas(1, 1) },
    surfaceFxScratchCanvases: {},
    compositionState: { enabled: true, phase: 0 },
    compositeSurfaceSource() {}
  });
  const helpers = [
    'renderRasterPress', 'renderRasterPressLegacy', 'rasterPressOutput',
    'surfaceBoundaryEnvelopeCanvas', 'surfaceBoundaryDistance', 'surfaceSignedDistanceValue',
    'surfaceFieldNormal', 'sampleMaskNeighborhoodAlpha', 'surfaceScratch',
    'surfaceAggregate', 'surfaceChoice', 'surfaceGlyphStrength', 'hash'
  ];
  for (const optional of ['rasterGravureCellPathV58', 'rasterGravurePlanV58', 'drawRasterGravureV58']) {
    if (source.includes('function ' + optional + '(')) helpers.push(optional);
  }
  vm.runInContext(
    objectSource(source, 'params') + '\n' + objectSource(source, 'BATCH_PARAM_OPTIONS')
      + '\n' + helpers.map(name => functionSource(source, name)).join('\n'),
    context
  );
  Object.assign(context.params, {
    seed: 41,
    paper: '#f3f0e8',
    rasterColor: '#182d35',
    rasterScreen: 'gravure',
    rasterModulation: 1.56,
    rasterCell: 6,
    rasterGain: 1.16,
    rasterAngle: 24,
    rasterNoise: 0.18
  }, settings);
  context.surfaceEffectColor = () => context.params.rasterColor;
  context.buildSurfaceMask = glyphs => {
    const result = canvas.createCanvas(width, height);
    const ctx = result.getContext('2d');
    ctx.globalAlpha = glyphs.reduce((maximum, glyph) => Math.max(
      maximum, context.surfaceGlyphStrength(glyph, 'rasterPress')), 0);
    ctx.drawImage(mask, 0, 0);
    return result;
  };
  const glyph = { surface: {} };
  context.render = (grammar = context.params.rasterScreen, strength = 1, phase = 0, units = 1) => {
    Object.assign(glyph.surface, context.params, { rasterPress: strength, rasterScreen: grammar });
    context.params.rasterScreen = grammar;
    context.compositionState.phase = phase;
    const result = canvas.createCanvas(width, height);
    context.renderRasterPress(result.getContext('2d'), [glyph], width, height, units, { s: 1 }, {}, false);
    return result;
  };
  return context;
}
