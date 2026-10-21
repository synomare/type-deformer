// Fixed native-Canvas comparison for Raster Press. No browser or device claim.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { canvas, authoredSource, textMask, createRasterFixture } from './raster-gravure-fixture.mjs';

const [sourceFile, outputDirectory, sourceOpacityArgument] = process.argv.slice(2);
if (!outputDirectory) throw new Error('Usage: node scripts/render-raster-gravure.mjs source.html output-directory [source-opacity]');
const source = sourceFile === 'current' ? authoredSource : fs.readFileSync(sourceFile, 'utf8');
const sourcePreviewOpacity = Math.max(0, Math.min(1,
  sourceOpacityArgument == null ? 0.12 : Number(sourceOpacityArgument)));
if (!Number.isFinite(sourcePreviewOpacity)) throw new Error('source-opacity must be finite');
fs.mkdirSync(outputDirectory, { recursive: true });
canvas.GlobalFonts.registerFromPath('C:/Windows/Fonts/yumin.ttf', 'Raster Yu Mincho');

const specs = [
  { id: 'counter', text: 'B&O', size: 250, font: 'Times New Roman' },
  { id: 'mass', text: 'RIFT', size: 205, font: 'Arial Black' },
  { id: 'cjk', text: '印刷', size: 245, font: 'Raster Yu Mincho' },
  { id: 'small', text: 'press', size: 52, font: 'Georgia', settings: { rasterCell: 4, rasterGain: 1.28 } }
];
const modes = ['adaptive', 'stochastic', 'line', 'mezzotint'];
if (source.includes('<option value="gravure"')) modes.unshift('gravure');
const manifest = {
  evidence: `native Canvas; isolated actual renderer; fixed masks; source preview ${sourcePreviewOpacity}; no browser/editor/device claim`,
  sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
  modes,
  specs: [],
  files: []
};

function save(name, surface) {
  const filename = name + '.png';
  const buffer = surface.toBuffer('image/png');
  fs.writeFileSync(path.join(outputDirectory, filename), buffer);
  manifest.files.push({ filename, sha256: crypto.createHash('sha256').update(buffer).digest('hex') });
}

function panel(mask, effect, label) {
  const result = canvas.createCanvas(mask.width, mask.height + 30);
  const ctx = result.getContext('2d');
  ctx.fillStyle = '#f3f0e8';
  ctx.fillRect(0, 0, result.width, result.height);
  ctx.globalAlpha = sourcePreviewOpacity;
  ctx.drawImage(mask, 0, 30);
  ctx.globalAlpha = 1;
  ctx.drawImage(effect, 0, 30);
  ctx.fillStyle = '#182d35';
  ctx.font = '14px Arial';
  ctx.fillText(label, 14, 20);
  return result;
}

function strip(items) {
  const width = items.reduce((sum, item) => sum + item.width, 0);
  const height = Math.max(...items.map(item => item.height));
  const result = canvas.createCanvas(width, height);
  const ctx = result.getContext('2d');
  let x = 0;
  for (const item of items) { ctx.drawImage(item, x, 0); x += item.width; }
  return result;
}

for (const spec of specs) {
  const mask = textMask(spec.text, spec.size, spec.font, 720, 520);
  const fixture = createRasterFixture(mask, spec.settings || {}, source);
  const panels = [];
  const rendered = {};
  const timings = {};
  const effectSha256 = {};
  for (const mode of modes) {
    const startedAt = performance.now();
    const effect = fixture.render(mode, 1, 0);
    timings[mode] = Number((performance.now() - startedAt).toFixed(3));
    rendered[mode] = effect;
    effectSha256[mode] = crypto.createHash('sha256').update(effect.toBuffer('image/png')).digest('hex');
    const item = panel(mask, effect, mode);
    save(spec.id + '-' + mode, item);
    panels.push(item);
  }
  save(spec.id + '-modes', strip(panels));
  if (modes.includes('gravure')) {
    save(spec.id + '-AB', strip([panel(mask, rendered.adaptive, 'A · Adaptive'), panel(mask, rendered.gravure, 'B · Gravure')]));
    save(spec.id + '-BA', strip([panel(mask, rendered.gravure, 'B · Gravure'), panel(mask, rendered.adaptive, 'A · Adaptive')]));
    const phases = [0, 0.25, 0.5, 0.75, 1].map(phase => panel(mask,
      fixture.render('gravure', 1, phase), 'Gravure ' + phase));
    save(spec.id + '-gravure-phase', strip(phases));
    if (!fixture.render('gravure', 1, 0).toBuffer('image/png')
      .equals(fixture.render('gravure', 1, 1).toBuffer('image/png'))) {
      throw new Error('Gravure phase 0/1 mismatch: ' + spec.id);
    }
  }
  manifest.specs.push({ ...spec, timingsMs: timings, effectSha256 });
}

fs.writeFileSync(path.join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
