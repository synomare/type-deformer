import { test, expect } from '@playwright/test';

async function blockRemoteFonts(page) {
  await page.route(/https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) => route.abort());
}

function minimalProject(text) {
  return {
    app: 'type-deformer',
    version: 6,
    text,
    params: {},
    letters: []
  };
}

test('migrates a legacy localStorage autosave into IndexedDB', async ({ page }) => {
  const text = `LEGACY-${Date.now()} 移行`;
  await page.addInitScript(({ project }) => {
    localStorage.setItem('typeDeformer.autosave.v1', JSON.stringify(project));
  }, { project: minimalProject(text) });
  await blockRemoteFonts(page);
  await page.goto('/');

  await expect(page.locator('#textInput')).toHaveValue(text);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('type-deformer-autosave-request'));
  });
  await expect(page.locator('#autosaveStatus')).toHaveAttribute('data-state', 'saved');

  const stored = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('typeDeformer.autosave.v2', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readonly');
      const request = tx.objectStore('snapshots').get('current');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return {
      payload: record && record.payload,
      legacyCurrent: localStorage.getItem('typeDeformer.autosave.v1'),
      legacyBackup: localStorage.getItem('typeDeformer.autosave.backup.v1')
    };
  });

  expect(stored.payload).toContain(text);
  expect(stored.legacyCurrent).toBeNull();
  expect(stored.legacyBackup).toBeNull();
});

test('falls back visibly to localStorage when IndexedDB is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      value: undefined,
      configurable: true
    });
  });
  await blockRemoteFonts(page);
  await page.goto('/');

  const text = `FALLBACK-${Date.now()} 保存`;
  await page.locator('#textInput').fill(text);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('type-deformer-autosave-request'));
  });

  await expect(page.locator('#autosaveStatus')).toHaveAttribute('data-state', 'saved');
  await expect(page.locator('#autosaveStatus')).toContainText('limited storage');
  const raw = await page.evaluate(() => localStorage.getItem('typeDeformer.autosave.v1'));
  expect(raw).toContain(text);
});

test('keeps MP4 disabled until timestamped encoding is available', async ({ page }) => {
  await blockRemoteFonts(page);
  await page.goto('/');

  await expect(page.locator('#pVideoFormat option[value="mp4"]')).toBeDisabled();
  await expect(page.locator('#pVideoFormat')).toHaveValue('auto');
});
