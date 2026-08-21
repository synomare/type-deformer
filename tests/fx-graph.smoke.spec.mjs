import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

async function setControl(locator, value) {
  await locator.evaluate((element, next) => {
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

test('ordered FX graph renders, reorders, bypasses, and serializes', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await page.locator('[data-workflow-stage="compose"]').click();
  await expect(page.locator('#textAnimatorFxGraph')).toBeVisible();
  await page.waitForTimeout(1800);

  const baseline = digest(await page.locator('#stage').screenshot());

  await page.locator('#pTextAnimatorFxAddType').selectOption('blur');
  await page.locator('#btnTextAnimatorFxAdd').click();
  await setControl(page.locator('#pTextAnimatorFxRadius'), 14);
  await expect(page.locator('#stage')).toHaveClass(/fx-graph-active/);
  await expect(page.locator('#stage')).toHaveAttribute('data-fx-graph-nodes', '1');
  await expect.poll(async () => page.locator('#textAnimatorFxFilter').evaluate(filter =>
    filter.firstElementChild && filter.firstElementChild.tagName.toLowerCase()
  )).toBe('fegaussianblur');

  const blurred = digest(await page.locator('#stage').screenshot());
  expect(blurred).not.toBe(baseline);

  await page.locator('#pTextAnimatorFxAddType').selectOption('chromaticSplit');
  await page.locator('#btnTextAnimatorFxAdd').click();
  await setControl(page.locator('#pTextAnimatorFxAmount'), 18);
  await setControl(page.locator('#pTextAnimatorFxAngle'), 24);
  await expect(page.locator('#pTextAnimatorFxNode option')).toHaveCount(2);
  await expect(page.locator('#stage')).toHaveAttribute('data-fx-graph-nodes', '2');

  const blurThenSplit = await page.locator('#textAnimatorFxFilter').evaluate(filter =>
    Array.from(filter.children, element => element.tagName.toLowerCase()).join(',')
  );
  expect(blurThenSplit.startsWith('fegaussianblur,fecomposite,fecolormatrix')).toBe(true);

  await page.locator('#btnTextAnimatorFxUp').click();
  const splitThenBlur = await page.locator('#textAnimatorFxFilter').evaluate(filter =>
    Array.from(filter.children, element => element.tagName.toLowerCase()).join(',')
  );
  expect(splitThenBlur.startsWith('fecolormatrix,fecolormatrix,feoffset')).toBe(true);
  expect(splitThenBlur).not.toBe(blurThenSplit);

  await page.locator('#pTextAnimatorFxGraphEnabled').uncheck();
  await expect(page.locator('#stage')).not.toHaveClass(/fx-graph-active/);
  await page.locator('#pTextAnimatorFxGraphEnabled').check();
  await expect(page.locator('#stage')).toHaveClass(/fx-graph-active/);

  const project = await page.evaluate(() => {
    const button = document.getElementById('btnSaveProj');
    const originalCreateObjectURL = URL.createObjectURL;
    let captured = null;
    URL.createObjectURL = blob => {
      captured = blob;
      return 'blob:fx-graph-project';
    };
    button.click();
    URL.createObjectURL = originalCreateObjectURL;
    return captured ? captured.text() : null;
  });
  expect(project).toBeTruthy();
  const parsed = JSON.parse(await project);
  expect(parsed.params.textAnimator.fxGraph.nodes.map(node => node.type)).toEqual([
    'chromaticSplit', 'blur'
  ]);
  expect(pageErrors).toEqual([]);
});

test('mobile Compose sheet exposes the ordered FX graph controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('[data-mobile-section="compose"]').click();
  await expect(page.locator('#textAnimatorFxGraph')).toBeVisible();
  await expect(page.locator('#pTextAnimatorFxAddType')).toBeVisible();
  await expect(page.locator('#btnTextAnimatorFxAdd')).toBeVisible();
});
