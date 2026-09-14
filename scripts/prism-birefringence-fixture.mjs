// Isolated native-Canvas fixture for the real Prism Sacrament renderer.
// It validates geometry/material behavior, not the browser editor or export UI.
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const canvas = require(process.env.TYPE_DEFORMER_CANVAS_MODULE
  || 'C:/Users/soran/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js');
export const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

export function extract(name) {
  const start = html.indexOf(`      function ${name}(`);
  if (start < 0) throw new Error(`Missing actual function: ${name}`);
  const next = html.indexOf('\n      function ', start + 20);
  return html.slice(start, next < 0 ? html.length : next);
}

const actualNames = [
  'hash',
  'surfaceBoundaryDistance',
  'surfaceSignedDistanceValue',
  'surfaceFieldNormal',
  'surfaceHexRgb',
  'surfaceToneCss',
  'renderPrismSacramentLegacy',
  'prismFacetCellV61',
  'prismBoundaryEmittersV61',
  'prismRgbaV61',
  'prismBeamPathV61',
  'renderPrismBirefringentV61',
  'renderPrismSacramentV23',
  'renderPrismSacrament'
];

export const defaultSettings = {
  seed: 41,
  paper: '#08090d',
  prismOptics: 'crystal',
  prismIridescence: 1.7,
  prismRefraction: 1.15,
  prismDispersion: 28,
  prismFacets: 8,
  prismCaustic: 1.4,
  prismBloom: 80,
  prismColorA: '#00e8ff',
  prismColorB: '#ff3f9f'
};

export function textMask(text, size = 150, font = 'Times New Roman', width = 820, height = 440) {
  const result = canvas.createCanvas(width, height);
  const ctx = result.getContext('2d');
  ctx.font = `${size}px "${font}"`;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  const measured = ctx.measureText(text);
  const ascent = measured.actualBoundingBoxAscent || size * 0.78;
  const descent = measured.actualBoundingBoxDescent || size * 0.22;
  const startX = (width - measured.width) * 0.5;
  const baseline = (height + ascent - descent) * 0.5;
  ctx.fillText(text, startX, baseline);
  const nodes = [];
  let cursor = startX;
  for (const character of [...text]) {
    const characterWidth = Math.max(1, ctx.measureText(character).width);
    if (!/^\s$/u.test(character)) nodes.push({
      x: cursor + characterWidth * 0.5,
      y: baseline - ascent * 0.42,
      r: Math.max(size * 0.22, characterWidth * 0.45),
      strength: 1
    });
    cursor += characterWidth;
  }
  return { canvas: result, nodes, text, size, font };
}

export function createPrismFixture(source, settings = {}) {
  const sourceCanvas = source.canvas || source;
  const width = sourceCanvas.width, height = sourceCanvas.height;
  const nodes = source.nodes || [{ x: width * 0.5, y: height * 0.5, r: Math.min(width, height) * 0.25, strength: 1 }];
  const sandbox = {
    Math,
    Uint8Array,
    Float32Array,
    Uint8ClampedArray,
    params: { ...defaultSettings, ...settings },
    compositionState: { enabled: false, phase: 0 },
    BATCH_PARAM_OPTIONS: { prismOptics: ['legacy', 'crystal', 'birefringent', 'fresnel', 'spectral', 'lenticular'] },
    surfaceFxScratchCanvases: {},
    surfaceChoice(_glyphs, _operator, key, fallback, options) {
      const value = sandbox.params[key] ?? fallback;
      return options.includes(value) ? value : fallback;
    },
    surfaceAggregate(_glyphs, _operator, key, fallback) {
      const value = sandbox.params[key] ?? fallback;
      return { value, weight: sandbox.strength, strength: sandbox.strength };
    },
    surfaceScratch() {
      const scratch = canvas.createCanvas(width, height);
      return { canvas: scratch, ctx: scratch.getContext('2d') };
    },
    buildSurfaceMask() {
      const copy = canvas.createCanvas(width, height);
      copy.getContext('2d').drawImage(sourceCanvas, 0, 0);
      return copy;
    },
    compositeSurfaceSource() {},
    surfaceEffectColor() { return sandbox.params.prismColorA; },
    surfaceNodesForGlyphs() { return nodes.map(node => ({ ...node, strength: sandbox.strength })); },
    strength: 1
  };
  const context = vm.createContext(sandbox);
  new vm.Script(actualNames.map(extract).join('\n')).runInContext(context);
  function render(optics = sandbox.params.prismOptics, phase = 0, enabled = false, direct = false) {
    sandbox.params.prismOptics = optics;
    sandbox.compositionState = { enabled, phase };
    const result = canvas.createCanvas(width, height);
    const ctx = result.getContext('2d');
    if (direct) context.renderPrismSacramentV23(ctx, [{}], width, height, 1, { s: 1 }, {}, false);
    else context.renderPrismSacrament(ctx, [{}], width, height, 1, { s: 1 }, {}, false);
    return result;
  }
  return { context, params: sandbox.params, source: sourceCanvas, nodes, render, sandbox };
}

export function pixels(target) {
  return target.getContext('2d').getImageData(0, 0, target.width, target.height).data;
}
