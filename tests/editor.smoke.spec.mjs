import { test, expect } from '@playwright/test';

async function openEditor(page) {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(/https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#stage')).toBeVisible();
  return pageErrors;
}

test('boots, rebuilds text, and keeps the generated dictionary lazy', async ({ page }) => {
  const pageErrors = await openEditor(page);
  await expect(page.locator('script[src="confuse-dictionary.js"]')).toHaveCount(0);

  const text = 'SMOKE 変形 123';
  await page.locator('#textInput').fill(text);
  await expect(page.locator('#stage')).toContainText('SMOKE');
  await expect(page.locator('#stage')).toContainText('変形');

  expect(pageErrors).toEqual([]);
});

test('persists and restores a project through IndexedDB autosave', async ({ page }) => {
  const pageErrors = await openEditor(page);
  const text = `AUTOSAVE-${Date.now()} 保存復元`;
  await page.locator('#textInput').fill(text);
  await expect(page.locator('#stage')).toContainText('AUTOSAVE');

  await page.evaluate(() => {
    window.dispatchEvent(new Event('type-deformer-autosave-request'));
  });
  await expect(page.locator('#autosaveStatus')).toHaveAttribute('data-state', 'saved');

  await page.reload();
  await expect(page.locator('#textInput')).toHaveValue(text);
  await expect(page.locator('#autosaveStatus')).toContainText('Restored');
  expect(pageErrors).toEqual([]);
});

test('loads the Unicode dictionary only when Confuse is selected', async ({ page }) => {
  const pageErrors = await openEditor(page);
  await expect(page.locator('script[src="confuse-dictionary.js"]')).toHaveCount(0);

  await page.locator('#pOperator').selectOption('confuse');
  await expect(page.locator('script[src="confuse-dictionary.js"]')).toHaveCount(1);
  await page.waitForFunction(() => {
    const dictionary = window.TYPE_DEFORMER_CONFUSE_DICTIONARY;
    return Boolean(dictionary && dictionary.meta && dictionary.meta.skeletonKeys > 1000);
  });

  expect(pageErrors).toEqual([]);
});

test('exports SVG and gates motion recording until a composition exists', async ({ page }) => {
  const pageErrors = await openEditor(page);
  await expect(page.locator('#btnVideoRecord')).toBeDisabled();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#btnSvg').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^type-deform-.*\.svg$/);

  expect(pageErrors).toEqual([]);
});

test('mobile workflow opens the requested control sheet and closes the project menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const pageErrors = await openEditor(page);

  await page.locator('#btnMobileProject').click();
  await expect(page.locator('#projectMenu')).toHaveJSProperty('open', true);

  await page.locator('[data-mobile-section="effect"]').click();
  await expect(page.locator('.panel')).toHaveClass(/mobile-open/);
  await expect(page.locator('[data-panel-section="effect"]')).toHaveClass(/mobile-active/);
  await expect(page.locator('#projectMenu')).toHaveJSProperty('open', false);

  await page.locator('#btnMobileSheetClose').click();
  await expect(page.locator('.panel')).not.toHaveClass(/mobile-open/);
  expect(pageErrors).toEqual([]);
});
