// Actual Contour Etch renderer in an isolated native-Canvas fixture.
// This validates the renderer, not the browser editor, DOM layout, or device UI.
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

export function createContourFixture(mask, settings = {}, source = html) {
  const width = mask.width;
  const height = mask.height;
  const context = vm.createContext({
    Math,
    document: { createElement: () => canvas.createCanvas(1, 1) },
    surfaceFxScratchCanvases: {},
    compositionState: { enabled: true, phase: 0 },
    compositeSurfaceSource() {}
  });
  const helpers = [
    'renderContourEtch', 'renderContourEtchLegacy', 'renderContourReliefV57', 'surfaceBoundaryDistance',
    'surfaceSignedDistanceValue', 'surfaceFieldNormal', 'surfaceVoidTopology',
    'surfaceSmoothCoverage', 'surfaceScratch', 'surfaceAggregate', 'surfaceChoice',
    'surfaceGlyphStrength', 'paintSurfaceMask', 'hash'
  ];
  for (const match of source.matchAll(/^      function (contourRelief\w+)\(/gm)) {
    if (!helpers.includes(match[1])) helpers.push(match[1]);
  }
  vm.runInContext(
    objectSource(source, 'params') + '\n' + objectSource(source, 'BATCH_PARAM_OPTIONS')
      + '\n' + helpers.map(name => functionSource(source, name)).join('\n'),
    context
  );
  Object.assign(context.params, {
    seed: 41,
    paper: '#f3f0e8',
    contourColor: '#192c35',
    contourGrammar: 'index',
    contourRelief: 1.4,
    contourBands: 10,
    contourSpacing: 7,
    contourStroke: 1.15,
    contourDrift: 0.45
  }, settings);
  context.surfaceEffectColor = () => context.params.contourColor;
  context.buildSurfaceMask = glyphs => {
    const result = canvas.createCanvas(width, height);
    const ctx = result.getContext('2d');
    ctx.globalAlpha = glyphs.reduce((maximum, glyph) => Math.max(
      maximum, context.surfaceGlyphStrength(glyph, 'contourEtch')), 0);
    ctx.drawImage(mask, 0, 0);
    return result;
  };
  context.surfaceNodesForGlyphs = () => [{ x: width * 0.5, y: height * 0.5, strength: 1 }];
  const glyph = { surface: {} };
  context.render = (grammar = context.params.contourGrammar, strength = 1, phase = 0, units = 1) => {
    Object.assign(glyph.surface, context.params, { contourEtch: strength, contourGrammar: grammar });
    context.params.contourGrammar = grammar;
    context.compositionState.phase = phase;
    const result = canvas.createCanvas(width, height);
    context.renderContourEtch(result.getContext('2d'), [glyph], width, height, units, { s: 1 }, {}, false);
    return result;
  };
  return context;
}
