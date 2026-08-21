import { expect, test } from '@playwright/test';

async function setControl(locator, value) {
  await locator.evaluate((element, next) => {
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

test('text animator applies, animates, stacks, and survives project serialization', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page).toHaveTitle(/type deformer/i);
  await expect(page.locator('#stage .c').first()).toBeVisible();

  await page.locator('[data-workflow-stage="compose"]').click();
  await expect(page.locator('#textAnimatorPanel')).toBeVisible();

  await page.locator('#pTextAnimatorEnabled').check();
  await setControl(page.locator('#pTextAnimatorX'), 160);
  await setControl(page.locator('#pTextAnimatorY'), 42);
  await setControl(page.locator('#pTextAnimatorRotation'), 24);

  await expect(page.locator('#stage')).toHaveClass(/text-animator-active/);
  await expect.poll(async () => {
    return page.locator('#stage .c').evaluateAll(elements => {
      const channels = elements.map(element => ({
        x: Math.abs(parseFloat(element.style.getPropertyValue('--ta-x')) || 0),
        y: Math.abs(parseFloat(element.style.getPropertyValue('--ta-y')) || 0),
        rotation: Math.abs(parseFloat(element.style.getPropertyValue('--ta-rotation')) || 0)
      }));
      return {
        x: Math.max(...channels.map(value => value.x)),
        y: Math.max(...channels.map(value => value.y)),
        rotation: Math.max(...channels.map(value => value.rotation))
      };
    });
  }).toMatchObject({ x: 160, y: 42, rotation: 24 });

  await page.locator('#pTextAnimatorMotionEnabled').check();
  await setControl(page.locator('#pTextAnimatorSpeed'), 1.25);
  const phaseControl = page.locator('#pTextAnimatorPhase');
  const playButton = page.locator('#btnTextAnimatorPlay');
  const beforePhase = Number(await phaseControl.inputValue());
  await playButton.click();
  await expect(playButton).toHaveText('Pause');
  await expect.poll(async () => {
    const snapshot = await page.evaluate(() => window.TypeDeformerTextAnimatorRuntime.snapshot());
    const domPhase = Number(await phaseControl.inputValue());
    return {
      enabled: snapshot.enabled,
      playing: snapshot.playing,
      speed: snapshot.speed,
      motionEnabled: snapshot.motionEnabled,
      clockAdvanced: snapshot.lastTime > 0,
      phaseMoved: Math.abs(snapshot.phase - beforePhase) > 0.000001,
      domPhaseMatches: Math.abs(snapshot.phase - domPhase) < 0.000001,
      pageErrors: pageErrors.slice()
    };
  }, { timeout: 3_000 }).toMatchObject({
    enabled: true,
    playing: true,
    speed: 1.25,
    motionEnabled: true,
    clockAdvanced: true,
    phaseMoved: true,
    domPhaseMatches: true,
    pageErrors: []
  });
  await playButton.click();
  await expect(playButton).toHaveText('Play');

  await page.locator('#btnTextAnimatorAdd').click();
  await expect(page.locator('#pTextAnimatorLayer option')).toHaveCount(2);
  await page.locator('[data-text-animator-preset="signalRupture"]').click();
  await expect(page.locator('#textAnimatorStatus')).toContainText('2 animators');

  const project = await page.evaluate(() => {
    const button = document.getElementById('btnSaveProj');
    const originalCreateObjectURL = URL.createObjectURL;
    let captured = null;
    URL.createObjectURL = blob => {
      captured = blob;
      return 'blob:test-project';
    };
    button.click();
    URL.createObjectURL = originalCreateObjectURL;
    return captured ? captured.text() : null;
  });
  expect(project).toBeTruthy();
  const parsed = JSON.parse(await project);
  expect(parsed.params.textAnimator.enabled).toBe(true);
  expect(parsed.params.textAnimator.animators).toHaveLength(2);
  expect(parsed.params.textAnimator.animators[1].motion.waveform).toBe('randomHold');
  expect(pageErrors).toEqual([]);
});

test('mobile Compose sheet exposes animator controls without trapping navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.locator('[data-mobile-section="compose"]').click();
  await expect(page.locator('.panel')).toHaveClass(/mobile-open/);
  await expect(page.locator('#textAnimatorPanel')).toBeVisible();
  await expect(page.locator('#pTextAnimatorEnabled')).toBeVisible();

  await page.locator('#pTextAnimatorEnabled').check();
  await page.locator('#btnMobileSheetClose').click();
  await expect(page.locator('.panel')).not.toHaveClass(/mobile-open/);
  await expect(page.locator('#stage')).toHaveClass(/text-animator-active/);
});
