import { test, expect } from '@playwright/test';

async function openEditor(page) {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(/https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('#stage')).toBeVisible();
  return pageErrors;
}

test('prewarms once and hands the loaded dictionary to the Confuse operator', async ({ page }) => {
  const pageErrors = await openEditor(page);
  await expect(page.locator('script[src="confuse-dictionary.js"]')).toHaveCount(0);

  await page.evaluate(() => {
    window.dispatchEvent(new Event('type-deformer-confuse-prewarm'));
  });
  await page.waitForFunction(() => {
    const dictionary = window.TYPE_DEFORMER_CONFUSE_DICTIONARY;
    return Boolean(dictionary && dictionary.meta && dictionary.meta.skeletonKeys > 1000);
  });
  await expect(page.locator('script[src="confuse-dictionary.js"]')).toHaveCount(1);

  await page.locator('#pOperator').selectOption('confuse');
  await expect(page.locator('script[src="confuse-dictionary.js"]')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});

test('does not auto-warm on a low-memory device profile', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', {
      value: 2,
      configurable: true
    });
  });
  await openEditor(page);

  const shouldWarm = await page.evaluate(() => {
    return window.TypeDeformerConfusePrewarm.shouldAutoWarm();
  });
  expect(shouldWarm).toBe(false);
});
