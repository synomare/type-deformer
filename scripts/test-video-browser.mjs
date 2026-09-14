import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const port = 4175;
const baseURL = `http://127.0.0.1:${port}/`;
const server = childProcess.spawn(process.execPath, ['scripts/serve-static.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'type-deformer-video-'));

async function waitForServer() {
  for (let index = 0; index < 50; index++) {
    try { if ((await fetch(baseURL)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Static server did not start.');
}

async function preparePage(channel) {
  const browser = await chromium.launch({ headless: true, channel });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, acceptDownloads: true });
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/https:\/\/fonts\.googleapis\.com\//, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(/https:\/\/fonts\.gstatic\.com\//, route => route.fulfill({ status: 204, body: '' }));
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#stageWorld')?.children.length > 0);
  await page.locator('[data-workflow-stage="compose"]').click();
  await page.locator('#btnCompositionApply').click();
  await page.locator('[data-workflow-stage="export"]').click();
  await page.locator('#videoExportPanel > summary').click();
  return { browser, page, errors };
}

async function generate(spec) {
  const { browser, page, errors } = await preparePage(spec.channel);
  try {
    if (spec.size) await page.locator('#pVideoSize').selectOption(spec.size);
    await page.locator('#pVideoFps').selectOption(String(spec.fps));
    await page.locator('#pVideoLoops').selectOption(String(spec.loops));
    await page.locator('#pVideoStart').selectOption(spec.start);
    await page.locator('#pVideoFormat').selectOption(spec.format);
    await page.locator('#pVideoDuration').evaluate((element, duration) => {
      element.value = String(duration);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, spec.duration);
    const originalPhase = Number(await page.locator('#pCompositionPhase').inputValue());
    const downloadEvent = page.waitForEvent('download', { timeout: 180000 });
    await page.locator('#btnVideoRecord').click();
    const download = await downloadEvent;
    const target = path.join(outputDir, `${spec.channel}-${spec.frames}.${spec.format}`);
    await download.saveAs(target);
    await page.waitForFunction(() => document.querySelector('#videoStatus')?.dataset.state === 'done');
    const restoredPhase = Number(await page.locator('#pCompositionPhase').inputValue());
    assert.ok(Math.abs(restoredPhase - originalPhase) < 0.0001, `${spec.channel} did not restore the Compose phase`);
    assert.deepEqual(errors, []);
    const probe = JSON.parse(childProcess.execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,nb_read_frames', '-show_entries', 'format=format_name,duration,size', '-of', 'json', target], { encoding: 'utf8' }));
    assert.equal(Number(probe.streams[0].nb_read_frames), spec.frames);
    assert.ok(Math.abs(Number(probe.format.duration) - spec.duration) <= 0.05, `${spec.channel} duration ${probe.format.duration}`);
    assert.match(probe.format.format_name, spec.format === 'mp4' ? /mp4/ : /webm/);
    return { channel: spec.channel, format: spec.format, codec: probe.streams[0].codec_name, frames: Number(probe.streams[0].nb_read_frames), duration: Number(probe.format.duration), bytes: Number(probe.format.size), loops: spec.loops, start: spec.start };
  } finally { await browser.close(); }
}

async function cancel() {
  const { browser, page, errors } = await preparePage('chrome');
  let downloads = 0;
  page.on('download', () => downloads++);
  try {
    await page.locator('#pVideoFps').selectOption('60');
    await page.locator('#pVideoStart').selectOption('current');
    await page.locator('#pVideoDuration').evaluate(element => { element.value = '30'; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); });
    const originalPhase = Number(await page.locator('#pCompositionPhase').inputValue());
    await page.locator('#btnVideoRecord').click();
    await page.locator('#btnVideoCancel').click();
    await page.waitForFunction(() => document.querySelector('#videoStatus')?.dataset.state === 'cancelled');
    await page.waitForTimeout(500);
    assert.equal(downloads, 0);
    assert.ok(Math.abs(Number(await page.locator('#pCompositionPhase').inputValue()) - originalPhase) < 0.0001);
    assert.deepEqual(errors, []);
    return { channel: 'chrome', cancelled: true, downloads };
  } finally { await browser.close(); }
}

try {
  await waitForServer();
  const results = [];
  results.push(await generate({ channel: 'chrome', format: 'webm', fps: 24, duration: 3, frames: 72, loops: 2, start: 'current' }));
  results.push(await generate({ channel: 'msedge', format: 'mp4', size: '1080x1080', fps: 30, duration: 4, frames: 120, loops: 4, start: 'zero' }));
  results.push(await cancel());
  console.log(JSON.stringify({ outputDir, results }, null, 2));
} finally {
  server.kill();
}
