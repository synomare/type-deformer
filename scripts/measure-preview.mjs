import { chromium } from '@playwright/test';
import childProcess from 'node:child_process';

const port = 4176;
const baseURL = `http://127.0.0.1:${port}/`;
const server = childProcess.spawn(process.execPath, ['scripts/serve-static.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});

const waitForServer = async () => {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Static server did not start.');
};

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ channel: 'chrome' });
  const runs = [];
  for (let index = 0; index < 3; index++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.addInitScript(() => {
      const original = EventTarget.prototype.addEventListener;
      window.__tdListenerCount = 0;
      EventTarget.prototype.addEventListener = function (...args) {
        window.__tdListenerCount++;
        return original.apply(this, args);
      };
    });
    const startedAt = performance.now();
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#stageWorld')?.children.length > 0);
    const usableMs = performance.now() - startedAt;
    const metrics = await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource');
      return {
        nodes: document.getElementsByTagName('*').length,
        buttons: document.querySelectorAll('button').length,
        listeners: window.__tdListenerCount,
        transferBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
        decodedBytes: resources.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0),
        presetRequests: resources.filter(entry => /assets\/presets\/atlas-|preset-library\.js/i.test(entry.name)).length,
        mediabunnyRequests: resources.filter(entry => /mediabunny/i.test(entry.name)).length
      };
    });
    runs.push({ run: index + 1, usableMs: Math.round(usableMs), ...metrics });
    await context.close();
  }
  const summary = {
    environment: 'Windows · installed Chrome · 1440x900 · cache disabled · 3 cold contexts',
    runs,
    median: {
      usableMs: median(runs.map(run => run.usableMs)),
      nodes: median(runs.map(run => run.nodes)),
      buttons: median(runs.map(run => run.buttons)),
      listeners: median(runs.map(run => run.listeners)),
      transferBytes: median(runs.map(run => run.transferBytes)),
      decodedBytes: median(runs.map(run => run.decodedBytes))
    }
  };
  console.log(JSON.stringify(summary, null, 2));
  const pass = summary.median.usableMs <= 4000
    && summary.median.nodes <= 8500
    && summary.median.buttons <= 800
    && summary.median.listeners <= 7000
    && runs.every(run => run.presetRequests === 0 && run.mediabunnyRequests === 0);
  if (!pass) process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
