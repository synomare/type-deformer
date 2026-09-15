import { test, expect } from '@playwright/test';
import fs from 'node:fs';

async function openPreview(page, errors) {
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/https:\/\/fonts\.googleapis\.com\//, route => route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '' }));
  await page.route(/https:\/\/fonts\.gstatic\.com\//, route => route.fulfill({ status: 204, body: '' }));
  await page.addInitScript(() => {
    const original = EventTarget.prototype.addEventListener;
    window.__tdListenerCount = 0;
    EventTarget.prototype.addEventListener = function (...args) { window.__tdListenerCount++; return original.apply(this, args); };
  });
  const start = Date.now();
  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  await page.waitForFunction(() => document.querySelector('#stageWorld')?.children.length > 0);
  return Date.now() - start;
}

test('cold start, Discover and lazy Preset Library stay within the preview contract', async ({ page }) => {
  const errors = [], requests = [];
  page.on('request', request => requests.push(request.url()));
  const elapsed = await openPreview(page, errors);
  const initial = await page.evaluate(() => ({
    nodes: document.getElementsByTagName('*').length,
    buttons: document.querySelectorAll('button').length,
    listeners: window.__tdListenerCount,
    noindex: document.querySelector('meta[name="robots"]')?.content,
    preview: document.querySelector('.preview-badge')?.textContent
  }));
  expect(elapsed).toBeLessThanOrEqual(4000);
  expect(initial.nodes).toBeLessThanOrEqual(8500);
  expect(initial.buttons).toBeLessThanOrEqual(800);
  expect(initial.listeners).toBeLessThanOrEqual(7000);
  expect(initial.noindex).toContain('noindex');
  expect(initial.preview).toContain('PREVIEW');
  expect(requests.some(url => /assets\/presets\/atlas-[^/?]+\.js|\/preset-library\.js|mediabunny[^/?]*\.mjs/i.test(url))).toBe(false);

  await page.locator('[data-workflow-stage="effect"]').click();
  await page.locator('#btnOperatorBrowser').click();
  await expect(page.locator('.operator-browser-card')).toHaveCount(12);
  await page.locator('[data-operator-view="all"]').click();
  await expect(page.locator('.operator-browser-card')).toHaveCount(116);
  await page.locator('#operatorBrowserSearch').fill('Chrome Reliquary');
  await expect(page.locator('.operator-browser-card')).toHaveCount(1);
  await page.locator('#operatorBrowserSearch').fill('');
  await page.locator('[data-operator-view="featured"]').click();
  await page.locator('[data-operator-favorite-id]').first().click();
  await page.locator('[data-operator-view="favorites"]').click();
  await expect(page.locator('.operator-browser-card')).toHaveCount(1);
  await page.locator('.operator-browser-item').first().click();
  await expect(page.locator('#btnOperatorBrowser')).toBeFocused();
  await page.locator('#btnOperatorBrowser').click();
  await page.locator('[data-operator-view="recent"]').click();
  await expect(page.locator('.operator-browser-card')).toHaveCount(1);
  await page.locator('#btnOperatorBrowserClose').click();

  await page.locator('#btnPresetLibrary').click();
  await expect(page.locator('#presetLibrary')).toHaveAttribute('open', '');
  await expect(page.locator('.preset-library-card')).toHaveCount(4);
  expect(requests.filter(url => /assets\/presets\/atlas-|preset-library\.js/.test(url)).length).toBe(14);
  await page.locator('#btnPresetLibraryAll').click();
  await expect(page.locator('.preset-library-card')).toHaveCount(48);
  await page.locator('#btnPresetLibraryApply').click();
  await expect(page.locator('#btnHeaderUndo')).toBeEnabled();
  await page.locator('#btnHeaderUndo').click();
  expect(errors).toEqual([]);
});

test('more than 256 font files enter the Library without eagerly reading every file', async ({ page }) => {
  const errors = [];
  await openPreview(page, errors);
  await page.evaluate(() => {
    const original = Blob.prototype.arrayBuffer;
    window.__fontArrayBufferReads = 0;
    Blob.prototype.arrayBuffer = function () {
      window.__fontArrayBufferReads++;
      return original.call(this);
    };
  });
  const files = Array.from({ length: 300 }, (_, index) => ({
    name: `batch-font-${String(index).padStart(3, '0')}.ttf`,
    mimeType: 'font/ttf',
    buffer: Buffer.from([0, 1, 2, index & 255])
  }));
  await page.locator('#pFontFile').setInputFiles(files);
  await expect(page.locator('#fontStatus')).toContainText('300書体をLibraryへ追加');
  await expect(page.locator('#pImportedFont option')).toHaveCount(301);
  expect(await page.evaluate(() => window.__fontArrayBufferReads)).toBe(0);
  const firstFamily = await page.locator('#pImportedFont option').nth(1).getAttribute('value');
  await page.locator('#pImportedFont').selectOption(firstFamily);
  await expect(page.locator('#fontStatus')).toContainText('Import failed');
  expect(await page.evaluate(() => window.__fontArrayBufferReads)).toBe(1);
  expect(await page.evaluate(() => window.TypeDeformerFontImport.limits.maxFiles)).toBe(4096);
  expect(errors).toEqual([]);
});

test('Compare, Project round-trip, Share, PNG/SVG and keyboard flows work', async ({ page }) => {
  const errors = [];
  await openPreview(page, errors);
  const capture = page.locator('button[data-look-action="capture"]').first();
  expect(await capture.count()).toBe(1);
  await capture.evaluate(element => element.click());
  await expect(page.locator('#btnHeaderCompare')).toBeEnabled();
  await page.locator('#btnHeaderCompare').click();
  await expect(page.locator('#lookCompareOverlay')).toBeVisible();
  await expect(page.locator('#lookCompareSourceA')).toHaveValue('current');
  await expect(page.locator('#lookCompareSourceB')).toHaveValue('slot-0');
  await page.keyboard.press('Escape');
  await expect(page.locator('#btnHeaderCompare')).toBeFocused();

  const [projectDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#btnSaveProj').evaluate(element => element.click())
  ]);
  const projectPath = await projectDownload.path();
  expect(projectDownload.suggestedFilename()).toMatch(/\.json$/);
  const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
  project.version = 92;
  project.params.activeOperator = 'stretch';
  project.params.chromeVoltage = 0.333333;
  const modifiedProjectPath = projectPath + '.hidden-value.json';
  fs.writeFileSync(modifiedProjectPath, JSON.stringify(project));
  await page.locator('#projFile').setInputFiles(modifiedProjectPath);
  await expect(page.locator('#projectActionStatus')).toContainText(/loaded|読み込み|復元/i);
  const [roundTrip] = await Promise.all([page.waitForEvent('download'), page.locator('#btnSaveProj').evaluate(element => element.click())]);
  const roundTripProject = JSON.parse(fs.readFileSync(await roundTrip.path(), 'utf8'));
  expect(roundTripProject.params.chromeVoltage).toBe(0.333333);

  await page.locator('#btnShare').evaluate(element => element.click());
  await expect.poll(() => page.url()).toContain('#');
  const manualCopy = page.locator('#manualCopyOverlay');
  await manualCopy.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
  if (await manualCopy.isVisible()) {
    await expect(page.locator('#manualCopyValue')).toHaveValue(/#.+/);
    await page.locator('#btnManualCopyClose').click();
    await expect(manualCopy).toBeHidden();
  }

  const [png] = await Promise.all([page.waitForEvent('download'), page.locator('#btnPng').evaluate(element => element.click())]);
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  const [svg] = await Promise.all([page.waitForEvent('download'), page.locator('#btnSvg').evaluate(element => element.click())]);
  expect(svg.suggestedFilename()).toMatch(/\.svg$/);

  await page.locator('[data-workflow-stage="effect"]').click();
  await page.locator('#btnOperatorBrowser').click();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  await expect(page.locator('#operatorBrowser')).toBeHidden();
  expect(errors).toEqual([]);
});

test('default preview fits complete glyph and Surface effect bounds at narrow width', async ({ page }) => {
  const errors = [];
  await openPreview(page, errors);
  const projectDownload = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#btnSaveProj').evaluate(element => element.click())
  ]).then(values => values[0]);
  const savedPath = await projectDownload.path();
  const project = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
  project.text = 'synomare';
  Object.assign(project.params, {
    fontSize: 160, textMeasure: 0,
    hatchGrammar: 'tonal', hatchDepth: 1.7, hatchSpacing: 5, hatchAngle: -24,
    hatchWarp: 1.1, hatchStroke: 1.4, hatchColor: '#26334a', hatchSourceMode: 'ghost',
    hatchOpacity: 0.9, hatchSourceOpacity: 0.2,
    contourGrammar: 'relief', contourRelief: 1.6, contourBands: 12, contourSpacing: 10,
    contourStroke: 1.35, contourDrift: 1, contourColor: '#c41f1f', contourSourceMode: 'keep',
    contourOpacity: 1, contourSourceOpacity: 0.1
  });
  project.letters = Array.from({ length: project.text.length }, () => ({
    t: 0, l: 0, i: 0, o: { hatchEngrave: { t: 1, i: 1 }, contourEtch: { t: 1, i: 1 } }
  }));
  const fixturePath = savedPath + '.preview-fit.json';
  fs.writeFileSync(fixturePath, JSON.stringify(project));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#projFile').setInputFiles(fixturePath);
  await page.waitForFunction(() => document.querySelectorAll('#stageWorld .c').length === 8
    && Number(document.querySelector('.stage-wrap')?.dataset.viewScale) < 0.9);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#surfaceFxCanvas');
    if (!canvas || canvas.hidden) return false;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 8) return true;
    return false;
  });

  const result = await page.evaluate(() => {
    const frame = document.querySelector('.stage-frame').getBoundingClientRect();
    const glyphs = Array.from(document.querySelectorAll('#stageWorld .c')).map(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left - frame.left, top: rect.top - frame.top,
        right: rect.right - frame.left, bottom: rect.bottom - frame.top };
    });
    const canvas = document.querySelector('#surfaceFxCanvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] <= 8) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return {
      frame: { width: frame.width, height: frame.height }, glyphs,
      effect: { minX, minY, maxX, maxY },
      scale: Number(document.querySelector('.stage-wrap').dataset.viewScale),
      fitLabel: document.querySelector('#btnViewReset').textContent
    };
  });
  expect(result.scale).toBeLessThan(0.9);
  expect(result.fitLabel).toContain('FIT');
  expect(result.glyphs.every(rect => rect.left >= 0 && rect.top >= 0
    && rect.right <= result.frame.width && rect.bottom <= result.frame.height)).toBe(true);
  expect(result.effect.minX).toBeGreaterThan(0);
  expect(result.effect.minY).toBeGreaterThan(0);
  expect(result.effect.maxX).toBeLessThan(390 - 1);
  expect(result.effect.maxY).toBeLessThan(Math.ceil(result.frame.height) - 1);

  await page.locator('#btnCompositionApply').evaluate(element => element.click());
  await page.waitForFunction(() => {
    const frame = document.querySelector('.stage-frame');
    const canvas = document.querySelector('#compositionCanvas');
    if (!frame?.classList.contains('composition-active') || !canvas || getComputedStyle(canvas).display === 'none') return false;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 8) return true;
    return false;
  });
  await expect.poll(() => page.locator('#btnViewReset').textContent()).toMatch(/^FIT /);
  await expect.poll(() => page.locator('#compositionCanvas').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] <= 8) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return minX > 0 && minY > 0 && maxX < canvas.width - 1 && maxY < canvas.height - 1;
  })).toBe(true);
  const compositionBounds = await page.locator('#compositionCanvas').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] <= 8) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { width: canvas.width, height: canvas.height, minX, minY, maxX, maxY };
  });
  expect(compositionBounds.minX).toBeGreaterThan(0);
  expect(compositionBounds.minY).toBeGreaterThan(0);
  expect(compositionBounds.maxX).toBeLessThan(compositionBounds.width - 1);
  expect(compositionBounds.maxY).toBeLessThan(compositionBounds.height - 1);

  const fittedScale = Number(await page.locator('.stage-wrap').getAttribute('data-view-scale'));
  await page.locator('#btnViewMode').click();
  await expect(page.locator('#btnViewMode')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#btnViewZoomIn').click();
  await expect(page.locator('#btnViewReset')).not.toContainText('FIT');
  expect(Number(await page.locator('.stage-wrap').getAttribute('data-view-scale'))).toBeGreaterThan(fittedScale);
  await page.locator('#btnViewReset').click();
  await expect(page.locator('#btnViewMode')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.locator('#btnViewReset').textContent()).toMatch(/^FIT /);
  expect(errors).toEqual([]);
});

test('font ink outside its CSS line box survives Surface preview, Output Preview, PNG and SVG', async ({ page }) => {
  const errors = [];
  // Model an imported display face with an unusually long y descender. Canvas
  // is patched at its public metrics/drawing boundary so the regression does
  // not depend on a machine-specific test font.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Worker', { configurable: true, value: undefined });
    const measureText = CanvasRenderingContext2D.prototype.measureText;
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.measureText = function (text) {
      const metrics = measureText.call(this, text);
      if (String(text) !== 'y') return metrics;
      return new Proxy(metrics, { get(target, property) {
        if (property === 'actualBoundingBoxDescent') return 520;
        return Reflect.get(target, property, target);
      } });
    };
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (maxWidth == null) fillText.call(this, text, x, y);
      else fillText.call(this, text, x, y, maxWidth);
      if (String(text) !== 'y') return;
      this.save();
      this.fillRect(x - 2, y, 4, 520);
      this.restore();
    };
  });
  await openPreview(page, errors);
  const projectDownload = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#btnSaveProj').evaluate(element => element.click())
  ]).then(values => values[0]);
  const savedPath = await projectDownload.path();
  const project = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
  project.text = 'y';
  Object.assign(project.params, {
    activeOperator: 'stretch', fontFamily: 'Arial', fontWeight: 400,
    fontSize: 160, textMeasure: 0, randomness: 0,
    lensMode: 'single', lensEinstein: 0, lensSeparation: 0, lensRatio: 1,
    lensScale: 1, lensSourceX: 0, lensSourceY: 0, lensAngle: 0, lensShear: 0,
    gravityLensColor: '#343434', gravityLensSourceMode: 'hide', gravityLensSourceOpacity: 0,
    gravityLensOpacity: 1, artboard: 'auto', exportScale: 1
  });
  project.letters = [{ t: 0, l: 0, i: 0, o: { gravityLens: { t: 1, i: 1 } } }];
  const fixturePath = savedPath + '.overflowing-ink.json';
  fs.writeFileSync(fixturePath, JSON.stringify(project));
  await page.locator('#projFile').setInputFiles(fixturePath);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#surfaceFxCanvas');
    if (!canvas || canvas.hidden) return false;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let minY = canvas.height, maxY = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] > 8) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
    return maxY > minY;
  }, null, { timeout: 30000 });

  const liveBounds = await page.locator('#surfaceFxCanvas').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let minY = canvas.height, maxY = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (pixels[(y * canvas.width + x) * 4 + 3] > 8) {
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return { height: canvas.height, minY, maxY, ratio: (maxY - minY) / canvas.height };
  });
  expect(liveBounds.ratio).toBeGreaterThan(.35);
  expect(liveBounds.minY).toBeGreaterThan(2);
  expect(liveBounds.maxY).toBeLessThan(liveBounds.height - 3);

  await page.locator('#btnPreview').evaluate(element => element.click());
  await expect(page.locator('#previewOverlay')).toBeVisible({ timeout: 60000 });
  await expect.poll(() => page.locator('#previewImg').evaluate(image => image.naturalHeight), { timeout: 60000 }).toBeGreaterThan(500);
  await page.locator('#btnPreviewClose').click();

  const [png] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('#btnPng').evaluate(element => element.click())]);
  expect(fs.statSync(await png.path()).size).toBeGreaterThan(1000);
  const [svg] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('#btnSvg').evaluate(element => element.click())]);
  const svgText = fs.readFileSync(await svg.path(), 'utf8');
  expect(svgText).toContain('data-effect-layer="surface-fx"');
  expect(svgText).toContain('data:image/png;base64,');
  expect(errors).toEqual([]);
});

test('wide Contour field is not cut by the shared raster in preview, Output Preview, PNG or SVG', async ({ page }) => {
  const errors = [];
  await openPreview(page, errors);
  const projectDownload = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#btnSaveProj').evaluate(element => element.click())
  ]).then(values => values[0]);
  const savedPath = await projectDownload.path();
  const project = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
  project.text = 'synomare';
  Object.assign(project.params, {
    fontSize: 160, textMeasure: 0,
    contourGrammar: 'relief', contourRelief: 4, contourBands: 32, contourSpacing: 20,
    contourStroke: 3, contourDrift: 3, contourColor: '#d8ccb2', contourSourceMode: 'keep',
    contourOpacity: 1, contourSourceOpacity: 0.1,
    paper: '#14322f', ink: '#d8ccb2', artboard: 'custom', abW: 1200, abH: 740,
    fit: true, marginPct: 6, transparentBg: false, exportScale: 1
  });
  project.letters = Array.from({ length: project.text.length }, () => ({
    t: 0, l: 0, i: 0, o: { contourEtch: { t: 1, i: 1 } }
  }));
  const fixturePath = savedPath + '.wide-contour.json';
  fs.writeFileSync(fixturePath, JSON.stringify(project));
  await page.setViewportSize({ width: 989, height: 512 });
  await page.locator('#projFile').setInputFiles(fixturePath);
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#surfaceFxCanvas');
    if (!canvas || canvas.hidden) return false;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] <= 8) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return maxX - minX > canvas.width * 0.72 && maxY - minY > canvas.height * 0.68
      && minX > 8 && minY > 8 && maxX < canvas.width - 9 && maxY < canvas.height - 9;
  }, null, { timeout: 30000 });

  const live = await page.locator('#surfaceFxCanvas').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] <= 8) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { width: canvas.width, height: canvas.height, minX, minY, maxX, maxY };
  });
  expect((live.maxX - live.minX) / live.width).toBeGreaterThan(0.72);
  expect((live.maxY - live.minY) / live.height).toBeGreaterThan(0.68);

  await page.locator('#btnPreview').evaluate(element => element.click());
  await expect(page.locator('#previewOverlay')).toBeVisible({ timeout: 60000 });
  await expect.poll(() => page.locator('#previewImg').evaluate(image => image.naturalWidth * image.naturalHeight),
    { timeout: 60000 }).toBeGreaterThan(0);
  await expect(page.locator('#previewCaption')).toContainText(/preview|高品質確認/);
  await page.locator('#btnPreviewClose').click();

  const [png] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.locator('#btnPng').evaluate(element => element.click())
  ]);
  expect(png.suggestedFilename()).toMatch(/\.png$/);
  expect(fs.statSync(await png.path()).size).toBeGreaterThan(100000);

  const [svg] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.locator('#btnSvg').evaluate(element => element.click())
  ]);
  expect(svg.suggestedFilename()).toMatch(/\.svg$/);
  const svgText = fs.readFileSync(await svg.path(), 'utf8');
  expect(svgText).toContain('data-effect-layer="surface-fx"');
  expect(svgText).toContain('data:image/png;base64,');
  expect(errors).toEqual([]);
});
