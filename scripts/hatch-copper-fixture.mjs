// Actual Hatch renderer and native Canvas. Mask/DOM are isolated, not a browser.
import vm from 'node:vm';
import { canvas, html, textMask } from './thorn-rooted-fixture.mjs';
export { canvas, html, textMask };
// Wire the real shared Surface compositor into the synthetic-layout export
// fixture. Other renderer readiness is outside this isolated Hatch test.
export function installHatchOutput(c) {
  const extract = name => html.match(new RegExp('^      function ' + name + '\\([^]*?^      }', 'm'))[0];
  const kernel = fixture(canvas.createCanvas(1,1));
  for (const key of Object.keys(kernel)) if (typeof kernel[key] === 'function' && key !== 'render' && key !== 'buildSurfaceMask' && key !== 'surfaceEffectColor') {
    // Recompile into the output realm; do not retain the isolated fixture's params.
    if (html.includes('      function '+key+'(')) vm.runInContext(extract(key),c);
  }
  const layer=extract('renderSurfaceFxLayer');
  for(const m of layer.matchAll(/:\s*(render\w+)[,\r\n]/g))if(!c[m[1]])c[m[1]]=()=>{throw Error('Unexpected non-Hatch renderer: '+m[1]);};
  for(const name of ['differentialAssertReady','conformalAssertReady','auxeticAssertReady','marblingAssertReady'])c[name]=()=>{};
  c.surfaceFxCanvas=null;c.surfaceFxScratchCanvases={};
  c.SURFACE_OPERATOR_IDS=['hatchEngrave'];c.SURFACE_RENDER_ORDER_DEFAULT=['hatchEngrave'];
  for(const name of ['BATCH_PARAM_OPTIONS','SURFACE_OPACITY_KEYS','SURFACE_SOURCE_OPACITY_KEYS','SURFACE_SOURCE_MODE_KEYS','SURFACE_BLEND_KEYS','SURFACE_COLOR_KEYS']) {
    vm.runInContext(html.match(new RegExp('      var '+name+' = \\{[^]*?\\n      };'))[0],c);
  }
  vm.runInContext(html.match(/      var SURFACE_BLEND_MODES = \[[^\n]+/)[0],c);
  vm.runInContext(['buildSurfaceMask','drawSurfaceGlyph','surfaceEffectColor','surfaceOutputOpacity','surfaceSourceOpacity','surfaceSourceMode',
    'surfaceReplacementStrength','surfaceBlendMode','surfaceRenderOrder','normalizedSurfaceRenderOrder',
    'surfaceEffectPresent','surfaceAnyEffectPresent','surfaceCanonicalRasterPlan',
    'structuralSurfaceRenderer','conditionSurfaceRenderer','fieldMaterialRenderer','renderSurfaceFxLayer'].map(extract).join('\n'),c);
  Object.assign(c.params,{hatchOpacity:1,hatchSourceOpacity:0,hatchBlend:'source-over',hatchGrammar:'copperplate'});
  return c;
}
export function fixture(mask, settings = {}, source = html) {
  const extract = name => {
    const fn = source.match(new RegExp('^      function ' + name + '\\([^]*?^      }', 'm'))?.[0];
    if (!fn) throw new Error('Missing actual function: ' + name);
    return fn;
  };
  const c = vm.createContext({ Math, document: { createElement: () => canvas.createCanvas(1, 1) },
    surfaceFxScratchCanvases: {}, compositionState: { enabled: true, phase: 0 }, compositeSurfaceSource() {} });
  const names = ['renderHatchEngrave', 'renderHatchEngraveLegacy', 'drawHatchFamily', 'drawAdaptiveHatchFamily',
    'surfaceScratch', 'surfaceBoundaryDistance', 'surfaceBoundaryEnvelopeCanvas', 'colorizeSurfaceCanvas',
    'surfaceAggregate', 'surfaceChoice', 'surfaceGlyphStrength', 'hash',
    ...[...source.matchAll(/^      function (hatchCopper\w+)\(/gm)].map(m => m[1])];
  vm.runInContext(['params', 'BATCH_PARAM_OPTIONS'].map(n => source.match(new RegExp('      var ' + n + ' = \\{[^]*?\\n      };'))[0]).join('\n')
    + '\n' + names.map(extract).join('\n'), c);
  Object.assign(c.params, { seed: 41, paper: '#f3f0e8' }, settings);
  c.surfaceEffectColor = () => c.params.hatchColor || '#242322';
  // Burin fan's node distribution is not covered by this fixture.
  c.buildSurfaceMask = (glyphs, id, w, h, s, L, fm, fullShape) => {
    const result = canvas.createCanvas(mask.width, mask.height), ctx = result.getContext('2d');
    ctx.globalAlpha = fullShape ? 1 : Math.max(...glyphs.map(g => c.surfaceGlyphStrength(g, 'hatchEngrave')), 0);
    ctx.drawImage(mask, 0, 0); return result;
  };
  c.render = (mode = c.params.hatchGrammar, strength = 1, phase = 0, scale = 1) => {
    c.params.hatchGrammar = mode; c.compositionState.phase = phase;
    const output = canvas.createCanvas(mask.width, mask.height);
    c.renderHatchEngrave(output.getContext('2d'), [{ surface: { ...c.params, hatchEngrave: strength } }],
      mask.width, mask.height, scale, { s: 1 }, {}, false);
    return output;
  };
  return c;
}
