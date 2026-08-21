import { expect, test } from '@playwright/test';

async function setControl(locator, value) {
  await locator.evaluate((element, next) => {
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function maxAnimatedX(page) {
  return page.locator('#stage .c').evaluateAll(elements => Math.max(...elements.map(element =>
    Math.abs(parseFloat(element.style.getPropertyValue('--ta-x')) || 0)
  )));
}

test('keyframe timeline authors, interpolates, drags, and serializes a property track', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await page.locator('[data-workflow-stage="compose"]').click();
  await page.locator('#pTextAnimatorEnabled').check();
  await expect(page.locator('#textAnimatorKeyframes')).toBeVisible();

  await setControl(page.locator('#pTextAnimatorPhase'), 0);
  await page.locator('#btnTextAnimatorKeyframeAdd').click();
  await setControl(page.locator('#pTextAnimatorPhase'), 0.5);
  await page.locator('#btnTextAnimatorKeyframeAdd').click();
  await page.locator('#pTextAnimatorKeyframeValue').fill('200');
  await page.locator('#pTextAnimatorKeyframeValue').press('Enter');

  const dots = page.locator('#textAnimatorKeyframeRail .keyframe-dot');
  await expect(dots).toHaveCount(2);

  await dots.nth(0).click();
  await page.locator('#pTextAnimatorKeyframeEasing').selectOption('linear');
  await setControl(page.locator('#pTextAnimatorPhase'), 0.25);
  await expect.poll(() => maxAnimatedX(page)).toBeCloseTo(100, 0);

  await dots.nth(0).click();
  await page.locator('#pTextAnimatorKeyframeEasing').selectOption('hold');
  await setControl(page.locator('#pTextAnimatorPhase'), 0.25);
  await expect.poll(() => maxAnimatedX(page)).toBeCloseTo(0, 0);
  await page.locator('#pTextAnimatorKeyframeEasing').selectOption('linear');

  await dots.nth(1).click();
  const railBox = await page.locator('#textAnimatorKeyframeRail').boundingBox();
  const dotBox = await dots.nth(1).boundingBox();
  expect(railBox).toBeTruthy();
  expect(dotBox).toBeTruthy();
  await page.mouse.move(dotBox.x + dotBox.width / 2, dotBox.y + dotBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(railBox.x + railBox.width * 0.75, railBox.y + railBox.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await page.locator('#pTextAnimatorKeyframeTime').inputValue()))
    .toBeCloseTo(0.75, 1);

  const project = await page.evaluate(() => {
    const button = document.getElementById('btnSaveProj');
    const originalCreateObjectURL = URL.createObjectURL;
    let captured = null;
    URL.createObjectURL = blob => {
      captured = blob;
      return 'blob:keyframe-project';
    };
    button.click();
    URL.createObjectURL = originalCreateObjectURL;
    return captured ? captured.text() : null;
  });
  expect(project).toBeTruthy();
  const parsed = JSON.parse(await project);
  expect(parsed.params.textAnimator.animators[0].tracks.x).toHaveLength(2);
  expect(parsed.params.textAnimator.animators[0].tracks.x[1].time).toBeCloseTo(0.75, 1);
  expect(pageErrors).toEqual([]);
});

test('mobile Compose sheet exposes the compact keyframe editor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('[data-mobile-section="compose"]').click();
  await expect(page.locator('#textAnimatorKeyframes')).toBeVisible();
  await expect(page.locator('#pTextAnimatorKeyframeProperty')).toBeVisible();
  await expect(page.locator('#textAnimatorKeyframeRail')).toBeVisible();
});
