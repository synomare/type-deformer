import { expect, test } from '@playwright/test';

async function setControl(locator, value) {
  await locator.evaluate((element, next) => {
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function maxTimelineX(page) {
  return page.locator('#stage .c').evaluateAll(elements => Math.max(...elements.map(element =>
    Math.abs(parseFloat(element.style.getPropertyValue('--ta-x')) || 0)
  )));
}

async function timelineTrack(page, property = 'x') {
  return page.evaluate(prop => {
    const state = window.TypeDeformerTextAnimatorBridge.getState();
    const animator = state.animators.find(item => item.id === state.activeAnimatorId) || state.animators[0];
    return animator.tracks[prop];
  }, property);
}

test('timeline authors loopable keys, interpolates, drags, undoes, and saves', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await page.locator('[data-workflow-stage="compose"]').click();
  await page.locator('#pTextAnimatorEnabled').check();
  await expect(page.locator('#textTimelinePanel')).toBeVisible();

  await page.locator('#pTextTimelineProperty').selectOption('x');
  await setControl(page.locator('#pTextTimelineScrub'), 0);
  await setControl(page.locator('#pTextTimelineValue'), 0);
  await page.locator('#btnTextTimelineSet').click();

  await setControl(page.locator('#pTextTimelineScrub'), 0.5);
  await setControl(page.locator('#pTextTimelineValue'), 200);
  await page.locator('#btnTextTimelineSet').click();
  await expect(page.locator('#pTextTimelineKey option')).toHaveCount(3);

  await setControl(page.locator('#pTextTimelineScrub'), 0.25);
  await expect.poll(() => maxTimelineX(page)).toBeCloseTo(100, 1);

  let keys = await timelineTrack(page);
  await page.locator('#pTextTimelineKey').selectOption(keys[0].id);
  await page.locator('#pTextTimelineEasing').selectOption('hold');
  await setControl(page.locator('#pTextTimelineScrub'), 0.25);
  await expect.poll(() => maxTimelineX(page)).toBeCloseTo(0, 1);

  keys = await timelineTrack(page);
  const movingId = keys[1].id;
  const movingKey = page.locator(`.text-timeline-key[data-key-id="${movingId}"]`);
  const ruler = page.locator('#textTimelineRuler');
  const keyBox = await movingKey.boundingBox();
  const rulerBox = await ruler.boundingBox();
  expect(keyBox).toBeTruthy();
  expect(rulerBox).toBeTruthy();
  await page.mouse.move(keyBox.x + keyBox.width / 2, keyBox.y + keyBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rulerBox.x + rulerBox.width * 0.75, rulerBox.y + rulerBox.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => {
    const track = await timelineTrack(page);
    const key = track.find(item => item.id === movingId);
    return key ? key.time : -1;
  }).toBeCloseTo(0.75, 2);

  await page.keyboard.press('Control+z');
  await expect.poll(async () => {
    const track = await timelineTrack(page);
    const key = track.find(item => item.id === movingId);
    return key ? key.time : -1;
  }).toBeCloseTo(0.5, 2);

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
  const parsed = JSON.parse(await project);
  expect(parsed.params.textAnimator.animators[0].tracks.x).toHaveLength(2);
  expect(parsed.params.textAnimator.animators[0].tracks.x[0].easing).toBe('hold');
  expect(pageErrors).toEqual([]);
});

test('timeline keyboard movement and mobile fallback remain operable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('[data-mobile-section="compose"]').click();
  await page.locator('#pTextAnimatorEnabled').check();

  await expect(page.locator('#textTimelinePanel')).toBeVisible();
  await expect(page.locator('#pTextTimelineProperty')).toBeVisible();
  await setControl(page.locator('#pTextTimelineScrub'), 0.2);
  await setControl(page.locator('#pTextTimelineValue'), 48);
  await page.locator('#btnTextTimelineSet').click();

  const key = (await timelineTrack(page))[0];
  const keyButton = page.locator(`.text-timeline-key[data-key-id="${key.id}"]`);
  await keyButton.focus();
  await keyButton.press('ArrowRight');
  await expect.poll(async () => (await timelineTrack(page))[0].time).toBeCloseTo(7 / 30, 3);

  await page.locator('#btnMobileSheetClose').click();
  await expect(page.locator('.panel')).not.toHaveClass(/mobile-open/);
  await expect(page.locator('#stage')).toHaveClass(/text-animator-active/);
});
