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
