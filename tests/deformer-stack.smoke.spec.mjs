import { expect, test } from '@playwright/test';

async function setControl(locator, value) {
  await locator.evaluate((element, next) => {
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function deformationSignature(page) {
  return page.locator('#stage .c').evaluateAll(elements => elements.map(element => ({
    x: Number.parseFloat(element.style.getPropertyValue('--ta-x')) || 0,
    y: Number.parseFloat(element.style.getPropertyValue('--ta-y')) || 0,
    rotation: Number.parseFloat(element.style.getPropertyValue('--ta-rotation')) || 0
  })).reduce((signature, value, index) => {
    signature.x += Math.abs(value.x) * (index + 1);
    signature.y += Math.abs(value.y) * (index + 1);
    signature.rotation += Math.abs(value.rotation) * (index + 1);
    return signature;
  }, { x: 0, y: 0, rotation: 0 }));
}

function signatureDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.rotation - b.rotation);
}

test('ordered Bend and Wave nodes deform, reorder, animate, and serialize', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/');
  await page.locator('[data-workflow-stage="compose"]').click();
  await page.locator('#pTextAnimatorEnabled').check();
  await expect(page.locator('#textAnimatorDeformers')).toBeVisible();

  await page.locator('#pTextAnimatorDeformerAddType').selectOption('bend');
  await page.locator('#btnTextAnimatorDeformerAdd').click();
  await setControl(page.locator('#pTextAnimatorDeformerAmount'), 150);
  await expect(page.locator('#pTextAnimatorDeformerNode option')).toHaveCount(1);
  const bendSignature = await deformationSignature(page);
  expect(bendSignature.y + bendSignature.rotation).toBeGreaterThan(1);

  await page.locator('#pTextAnimatorDeformerAddType').selectOption('wave');
  await page.locator('#btnTextAnimatorDeformerAdd').click();
  await setControl(page.locator('#pTextAnimatorDeformerAmount'), 85);
  await setControl(page.locator('#pTextAnimatorDeformerFrequency'), 3.25);
  await setControl(page.locator('#pTextAnimatorDeformerPhase'), 0.17);
  await expect(page.locator('#pTextAnimatorDeformerNode option')).toHaveCount(2);

  const bendThenWave = await deformationSignature(page);
  await page.locator('#btnTextAnimatorDeformerUp').click();
  const waveThenBend = await deformationSignature(page);
  expect(signatureDistance(bendThenWave, waveThenBend)).toBeGreaterThan(0.1);

  await setControl(page.locator('#pTextAnimatorPhase'), 0);
  const phaseZero = await deformationSignature(page);
  await setControl(page.locator('#pTextAnimatorPhase'), 0.25);
  const phaseQuarter = await deformationSignature(page);
  expect(signatureDistance(phaseZero, phaseQuarter)).toBeGreaterThan(0.1);

  await page.locator('#pTextAnimatorDeformerNodeEnabled').uncheck();
  const waveBypassed = await deformationSignature(page);
  expect(signatureDistance(phaseQuarter, waveBypassed)).toBeGreaterThan(0.1);
  await page.locator('#pTextAnimatorDeformerNodeEnabled').check();

  const project = await page.evaluate(() => {
    const button = document.getElementById('btnSaveProj');
    const originalCreateObjectURL = URL.createObjectURL;
    let captured = null;
    URL.createObjectURL = blob => {
      captured = blob;
      return 'blob:deformer-project';
    };
    button.click();
    URL.createObjectURL = originalCreateObjectURL;
    return captured ? captured.text() : null;
  });
  expect(project).toBeTruthy();
  const parsed = JSON.parse(await project);
  expect(parsed.params.textAnimator.deformers.nodes).toHaveLength(2);
  expect(parsed.params.textAnimator.deformers.nodes.map(node => node.type)).toEqual(['wave', 'bend']);
  expect(pageErrors).toEqual([]);
});

test('mobile Compose sheet exposes the ordered deformer controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('[data-mobile-section="compose"]').click();
  await expect(page.locator('#textAnimatorDeformers')).toBeVisible();
  await expect(page.locator('#pTextAnimatorDeformerAddType')).toBeVisible();
  await expect(page.locator('#btnTextAnimatorDeformerAdd')).toBeVisible();
});
