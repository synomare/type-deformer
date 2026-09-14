// Isolated native-Canvas fixture for the real Ligature Body renderer.
// It exercises the production functions without browser/editor state.
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const canvas = require(process.env.TYPE_DEFORMER_CANVAS_MODULE
  || '@napi-rs/canvas');
export const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

export function extract(name) {
  const start = html.indexOf(`      function ${name}(`);
  if (start < 0) throw new Error(`Missing actual function: ${name}`);
  const next = html.indexOf('\n      function ', start + 20);
  return html.slice(start, next < 0 ? html.length : next);
}

const actualNames = [
  'hash',
  'paintSurfaceMask',
  'surfaceLigatureCurve',
  'surfaceSnapToMaskPoint',
  'surfaceLigatureShoulder',
  'renderLigatureBodyV29',
  'surfaceLigatureBezierPointV62',
  'surfaceLigatureRibbonV62',
  'surfaceLigatureWaistV62',
  'surfaceLigatureLensV62',
  'surfaceLigatureAnchorV62',
  'renderLigatureCounterbodyV62',
  'renderLigatureBody'
];

export const defaultSettings = {
  seed: 41,
  paper: '#f4f1e9',
  vertical: false,
  fontSize: 126,
  ligatureBodyGrammar: 'counterbody',
  ligatureBodyFusion: 0.7,
  ligatureBodyReach: 72,
  ligatureBodyBand: 12,
  ligatureBodyCounter: 0.42,
  ligatureBodyTension: 0.8,
  ligatureBodyColor: '#3048c7'
};

export function textMask(text, size = 126, font = 'Times New Roman', width = 820, height = 360) {
  const source = canvas.createCanvas(width, height);
  const ctx = source.getContext('2d');
  ctx.font = `${size}px "${font}"`;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  const characters = [...text];
  const widths = characters.map(character => ctx.measureText(character).width);
  const total = widths.reduce((sum, value) => sum + value, 0);
  const baseline = height * 0.62;
  const ascent = ctx.measureText('Hg永').actualBoundingBoxAscent || size * 0.78;
  const descent = ctx.measureText('Hg永').actualBoundingBoxDescent || size * 0.22;
  let cursor = Math.max(18, (width - total) * 0.5);
  let word = 0;
  const glyphs = [];
  const spaces = [];
  for (let index = 0; index < characters.length; index++) {
    const character = characters[index];
    const characterWidth = Math.max(1, widths[index]);
    if (/^\s$/u.test(character)) {
      spaces.push({ x: cursor, width: characterWidth });
      word++;
      cursor += characterWidth;
      continue;
    }
    ctx.fillText(character, cursor, baseline);
    glyphs.push({
      ch: character,
      x: cursor,
      y: baseline - ascent,
      w: characterWidth,
      h: ascent + descent,
      bw: characterWidth,
      bh: ascent + descent,
      scaleX: 1,
      scaleY: 1,
      line: 0,
      word,
      strength: 1
    });
    cursor += characterWidth;
  }
  return { canvas: source, glyphs, spaces, text, size, font };
}

export function createLigatureFixture(source, settings = {}) {
  const sourceCanvas = source.canvas || source;
  const glyphs = source.glyphs || [];
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const sandbox = {
    Math,
    Uint8Array,
    Uint8ClampedArray,
    Float32Array,
    params: { ...defaultSettings, fontSize: source.size || defaultSettings.fontSize, ...settings },
    BATCH_PARAM_OPTIONS: {
      ligatureBodyGrammar: ['legacy', 'counterbody', 'interlock', 'sharedStem', 'counterWeave', 'melt'],
      ligatureBodyLegacyGrammar: ['interlock', 'sharedStem', 'counterWeave', 'melt']
    },
    surfaceFxScratchCanvases: {},
    surfaceChoice(_glyphs, _operator, key, fallback, options) {
      const value = sandbox.params[key] ?? fallback;
      return options.includes(value) ? value : fallback;
    },
    surfaceAggregate(_glyphs, _operator, key, fallback) {
      return { value: sandbox.params[key] ?? fallback, weight: 1, strength: 1 };
    },
    surfaceGlyphStrength(glyph) { return glyph.strength ?? 1; },
    surfaceGlyphNode(glyph, _operator, _pixelScale, _layout, _phase, _chaos, _speed, index, localU = 0.5, localV = 0.5) {
      return {
        x: glyph.x + glyph.w * localU,
        y: glyph.y + glyph.h * localV,
        r: Math.min(glyph.w, glyph.h) * 0.24,
        strength: glyph.strength ?? 1,
        glyphIndex: index,
        glyph
      };
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
    surfaceEffectColor() { return sandbox.params.ligatureBodyColor; }
  };
  const context = vm.createContext(sandbox);
  new vm.Script(actualNames.map(extract).join('\n')).runInContext(context);
  function render(grammar = sandbox.params.ligatureBodyGrammar, directV29 = false) {
    sandbox.params.ligatureBodyGrammar = grammar;
    const result = canvas.createCanvas(width, height);
    const ctx = result.getContext('2d');
    if (directV29) context.renderLigatureBodyV29(ctx, glyphs, width, height, 1, { s: 1 }, {}, false);
    else context.renderLigatureBody(ctx, glyphs, width, height, 1, { s: 1 }, {}, false);
    return result;
  }
  return { context, params: sandbox.params, source: sourceCanvas, glyphs, render, sandbox };
}

export function pixels(target) {
  return target.getContext('2d').getImageData(0, 0, target.width, target.height).data;
}
