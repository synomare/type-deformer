// Fixed native-Canvas comparison for Contour Etch. No browser or device claim.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { canvas, authoredSource, textMask, createContourFixture } from './contour-relief-fixture.mjs';

const [sourceFile, outputDirectory, sourceOpacityArgument] = process.argv.slice(2);
if (!outputDirectory) throw new Error('Usage: node scripts/render-contour-relief.mjs source.html output-directory [source-opacity]');
const source = sourceFile === 'current' ? authoredSource : fs.readFileSync(sourceFile, 'utf8');
const sourcePreviewOpacity = Math.max(0, Math.min(1,
  sourceOpacityArgument == null ? 0.22 : Number(sourceOpacityArgument)));
if (!Number.isFinite(sourcePreviewOpacity)) throw new Error('source-opacity must be finite');
fs.mkdirSync(outputDirectory, { recursive: true });
canvas.GlobalFonts.registerFromPath('C:/Windows/Fonts/yumin.ttf', 'Contour Yu Mincho');

const specs = [
  { id: 'counter', text: 'B&O', size: 250, font: 'Times New Roman' },
  { id: 'mass', text: 'RIFT', size: 205, font: 'Arial Black' },
  { id: 'cjk', text: '地形', size: 245, font: 'Contour Yu Mincho' },
  { id: 'small', text: 'terrain', size: 72, font: 'Georgia', settings: { contourSpacing: 4, contourStroke: 0.9 } }
];
const modes = ['isobars', 'index', 'terraces', 'watershed'];
if (source.includes('<option value="relief"')) modes.push('relief');
const manifest = {
  evidence: `native Canvas; isolated current renderer; fixed masks; source preview ${sourcePreviewOpacity}; no browser/editor/device claim`,
  sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
  modes,
  specs: [],
  files: []
};

function save(name, surface) {
  const filename = name + '.png';
  fs.writeFileSync(path.join(outputDirectory, filename), surface.toBuffer('image/png'));
  manifest.files.push(filename);
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
  ctx.fillStyle = '#192c35';
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
  for (const item of items) {
    ctx.drawImage(item, x, 0);
    x += item.width;
  }
  return result;
}

for (const spec of specs) {
  const mask = textMask(spec.text, spec.size, spec.font, 720, 520);
  const fixture = createContourFixture(mask, spec.settings || {}, source);
  const panels = [];
  const rendered = {};
  const timings = {};
  for (const mode of modes) {
    const startedAt = performance.now();
    const effect = fixture.render(mode, 1, 0);
    timings[mode] = Number((performance.now() - startedAt).toFixed(3));
    rendered[mode] = effect;
    const item = panel(mask, effect, mode);
    save(spec.id + '-' + mode, item);
    panels.push(item);
  }
  save(spec.id + '-modes', strip(panels));
  if (modes.includes('relief')) {
    save(spec.id + '-AB', strip([panel(mask, rendered.index, 'A'), panel(mask, rendered.relief, 'B')]));
    save(spec.id + '-BA', strip([panel(mask, rendered.relief, 'B'), panel(mask, rendered.index, 'A')]));
    const phases = [0, 0.25, 0.5, 0.75, 1].map(phase => panel(mask,
      fixture.render('relief', 1, phase), 'relief ' + phase));
    save(spec.id + '-relief-phase', strip(phases));
    const phaseZero = fixture.render('relief', 1, 0).toBuffer('image/png');
    const phaseOne = fixture.render('relief', 1, 1).toBuffer('image/png');
    if (!phaseZero.equals(phaseOne)) throw new Error('Relief phase 0/1 mismatch: ' + spec.id);
  }
  manifest.specs.push({ ...spec, timingsMs: timings });
}

fs.writeFileSync(path.join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
