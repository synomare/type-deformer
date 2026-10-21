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
    const resources = await page.evaluate(() => TypeDeformerRenderContext.resources.inspect());
    assert.equal(resources.reservedBytes, 0, 'finished video must release its encoder reservation');
    assert.deepEqual(errors, []);
    const probe = JSON.parse(childProcess.execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,nb_read_frames', '-show_entries', 'format=format_name,duration,size', '-of', 'json', target], { encoding: 'utf8' }));
    assert.equal(Number(probe.streams[0].nb_read_frames), spec.frames);
    assert.ok(Math.abs(Number(probe.format.duration) - spec.duration) <= 0.05, `${spec.channel} duration ${probe.format.duration}`);
    assert.match(probe.format.format_name, spec.format === 'mp4' ? /mp4/ : /webm/);
    const playback = await page.evaluate(async ({ encoded, type }) => {
      const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.src = 'data:' + type + ';base64,' + encoded; document.body.appendChild(video);
      let timer;
      try {
        const ended = new Promise((resolve, reject) => { video.onended = resolve; video.onerror = () => reject(Error('Playback decode failed')); timer = setTimeout(() => reject(Error('Playback timed out')), 20000); });
        await video.play(); await ended;
        return { width: video.videoWidth, height: video.videoHeight, duration: video.duration, decodedFrames: video.getVideoPlaybackQuality().totalVideoFrames };
      } finally { clearTimeout(timer); video.pause(); video.removeAttribute('src'); video.load(); video.remove(); }
    }, { encoded: fs.readFileSync(target).toString('base64'), type: spec.format === 'mp4' ? 'video/mp4' : 'video/webm' });
    assert.ok(playback.decodedFrames > 0);assert.ok(playback.width > 0);assert.ok(Math.abs(playback.duration - spec.duration) < .1);assert.deepEqual(errors, []);
    return { channel: spec.channel, format: spec.format, codec: probe.streams[0].codec_name, frames: Number(probe.streams[0].nb_read_frames), duration: Number(probe.format.duration), bytes: Number(probe.format.size), loops: spec.loops, start: spec.start, resources, playback };
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
    const resources = await page.evaluate(() => TypeDeformerRenderContext.resources.inspect());
    assert.equal(resources.reservedBytes, 0, 'cancelled video must release its encoder reservation');
    return { channel: 'chrome', cancelled: true, downloads, resources };
  } finally { await browser.close(); }
}

async function immutableVideo() {
  const { browser, page, errors } = await preparePage('chrome');
  try {
    await page.locator('#pVideoFps').selectOption('24');
    await page.locator('#pVideoLoops').selectOption('1');
    await page.locator('#pVideoStart').selectOption('zero');
    await page.locator('#pVideoFormat').selectOption('webm');
    await page.locator('#pVideoDuration').evaluate(element => { element.value = '1'; element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); });
    // Apply animates the canvas camera. Both captures must start after that
    // settles, otherwise this would compare two intentionally different views.
    await page.evaluate(() => new Promise(resolve => {
      let previous = '', unchangedSince = performance.now();
      function check() {
        const current = document.querySelector('#stageWorld').style.transform;
        if (current !== previous) { previous = current; unchangedSince = performance.now(); }
        if (performance.now() - unchangedSince >= 500) resolve(); else requestAnimationFrame(check);
      }
      requestAnimationFrame(check);
    }));
    // Observe the actual Canvas handed to the public encoder, without replacing
    // the renderer or codec. Pause after frame 2 so real editor inputs can change.
    await page.evaluate(() => {
      const create = TypeDeformerVideoEncoder.create;
      const rendererClient = TypeDeformerExplorer.rendererClient;
      TypeDeformerExplorer.rendererClient = options => {
        const client = rendererClient(options), render = client.render;
        client.render = request => { if (!window.__videoRecord.firstRequest) window.__videoRecord.firstRequest = JSON.parse(JSON.stringify(request)); return render(request); };
        return client;
      };
      TypeDeformerVideoEncoder.create = async (canvas, options) => {
        const encoder = await create(canvas, options), record = window.__videoRecord;
        return { ...encoder, async add(index) {
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          const hash = await crypto.subtle.digest('SHA-256', pixels);
          record.hashes.push(Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join(''));
          if (record.mutate && index === 2) { record.paused = true; await new Promise(resolve => { record.resume = resolve; }); }
          return encoder.add(index);
        } };
      };
    });
    async function capture(mutate) {
      await page.evaluate(mutate => { window.__videoRecord = { mutate, hashes: [], paused: false }; }, mutate);
      const downloading = page.waitForEvent('download', { timeout: 180000 });
      await page.locator('#btnVideoRecord').click();
      if (mutate) {
        await page.waitForFunction(() => window.__videoRecord.paused, null, { timeout: 60000 });
        await page.evaluate(() => {
          for (const [id, value] of [['textInput', 'LIVE EDIT SURVIVES'], ['pInk', '#137c42'], ['pPaper', '#ffffff'], ['pCompositionIntensity', '0.91'], ['pCompositionPhase', '0.813']]) {
            const input = document.getElementById(id); input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          document.getElementById('textInput').dispatchEvent(new Event('blur'));
        });
        await page.waitForFunction(() => Array.from(document.querySelectorAll('#stage .c')).map(element => element.dataset.sourceText || element.textContent).join('').replace(/\s/g, '') === 'LIVEEDITSURVIVES');
        await page.evaluate(() => window.__videoRecord.resume());
      }
      const download = await downloading;
      const target = path.join(outputDir, mutate ? 'immutable-live-edits.webm' : 'immutable-baseline.webm');
      await download.saveAs(target);
      await page.waitForFunction(() => document.querySelector('#videoStatus')?.dataset.state === 'done');
      const hashes = await page.evaluate(() => window.__videoRecord.hashes);
      const resources = await page.evaluate(() => TypeDeformerRenderContext.resources.inspect());
      assert.equal(resources.reservedBytes, 0);
      const probe = JSON.parse(childProcess.execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'json', target], { encoding: 'utf8' }));
      assert.equal(Number(probe.streams[0].nb_read_frames), 24);
      return { hashes, resources, request: await page.evaluate(() => window.__videoRecord.firstRequest) };
    }
    const baseline = await capture(false), edited = await capture(true);
    fs.writeFileSync(path.join(outputDir, 'immutable-comparison.json'), JSON.stringify({ baseline, edited }, null, 2));
    assert.deepEqual(edited.request, baseline.request, 'both runs must start from identical captured scene, clocks and camera');
    assert.equal(new Set(baseline.hashes).size, 24, 'comparison must contain 24 distinct moving frames');
    assert.deepEqual(edited.hashes, baseline.hashes, 'live text, ink, paper, effect and phase edits must not change captured video frames');
    const finalInputs = await page.evaluate(() => Object.fromEntries(['textInput', 'pInk', 'pPaper', 'pCompositionIntensity', 'pCompositionPhase'].map(id => [id, document.getElementById(id).value])));
    assert.deepEqual(finalInputs, { textInput: 'LIVE EDIT SURVIVES', pInk: '#137c42', pPaper: '#ffffff', pCompositionIntensity: '0.91', pCompositionPhase: '0.813' });
    assert.deepEqual(errors, []);
    return { channel: 'chrome', immutableVideo: true, equalInputFrames: edited.hashes.length, distinctInputFrames: new Set(baseline.hashes).size, mutationsAfterFrame: 2, finalInputs, resources: edited.resources, frameHashes: edited.hashes };
  } finally { await browser.close(); }
}

try {
  await waitForServer();
  const results = [];
  if (!process.env.VIDEO_ISOLATION_ONLY) {
    results.push(await generate({ channel: 'chrome', format: 'webm', fps: 24, duration: 3, frames: 72, loops: 2, start: 'current' }));
    results.push(await generate({ channel: 'msedge', format: 'mp4', size: '1080x1080', fps: 30, duration: 4, frames: 120, loops: 4, start: 'zero' }));
    results.push(await cancel());
  }
  results.push(await immutableVideo());
  console.log(JSON.stringify({ outputDir, results }, null, 2));
} finally {
  server.kill();
}
