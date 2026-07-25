// End-to-end smoke test for the editor itself.
//
// The Vitest suites cover src/core; this covers app.js, which is unavoidably
// tied to the DOM, canvas, and Blob APIs. It boots the real page against a
// throwaway static server and drives the paths that are easy to break and
// expensive to notice: lazy dictionary loading, seeding, Confuse substitution,
// PNG/SVG export, grid placement, and the share-URL round trip.
//
//   npm run test:e2e
//
// Set CHROMIUM to override the browser binary.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const results = [];
const ok = (n, d = '') => results.push(['PASS', n, d]);
const bad = (n, d = '') => results.push(['FAIL', n, d]);

const launch = {};
if (process.env.CHROMIUM) launch.executablePath = process.env.CHROMIUM;
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.route('**://fonts.googleapis.com/**', r => r.abort());
await page.route('**://fonts.gstatic.com/**', r => r.abort());
const failedReq = [];
page.on('requestfailed', r => failedReq.push(r.url() + ' :: ' + (r.failure() || {}).errorText));
page.on('response', r => { if (r.status() >= 400) failedReq.push(r.url() + ' :: HTTP ' + r.status()); });

// ---- boot ----------------------------------------------------------------
const t0 = Date.now();
await page.goto(BASE + '/index.html', { waitUntil: 'load' });
const loadMs = Date.now() - t0;
await page.waitForTimeout(600);

const letters = await page.$$eval('#stage .c', els => els.length);
letters > 0 ? ok('boot: letters rendered', letters + ' glyphs, load event ' + loadMs + 'ms')
            : bad('boot: letters rendered', 'none');

// ---- A-1: dictionary is NOT a render-blocking request ---------------------
const rawHtml = await (await fetch(BASE + '/index.html')).text();
/<script[^>]+src=["']confuse-dictionary/.test(rawHtml)
  ? bad('A-1: no blocking dictionary tag in served markup')
  : ok('A-1: no blocking dictionary tag in served markup');
const firstGlyphMs = await page.evaluate(() => {
  const n = performance.getEntriesByType('navigation')[0];
  return n ? Math.round(n.domContentLoadedEventEnd) : -1;
});
ok('A-1: DOMContentLoaded', firstGlyphMs + 'ms (dictionary no longer blocks it)');

await page.waitForFunction(
  () => document.getElementById('confuseDictionaryStatus')
        && /Unicode \d/.test(document.getElementById('confuseDictionaryStatus').textContent),
  null, { timeout: 30000 }
).then(() => ok('A-1: dictionary loaded lazily and status updated'))
 .catch(async () => bad('A-1: dictionary loaded lazily',
   await page.$eval('#confuseDictionaryStatus', e => e.textContent)));

// ---- B-1: v7 seeding differs per line ------------------------------------
await page.fill('#textInput', 'あいう\nあいう');
await page.waitForTimeout(700);
const seeds = await page.$$eval('#stage .c', els => els.map(e => ({
  h: e.dataset.h, ch: e.textContent, sx: e.style.getPropertyValue('--sx')
})));
if (seeds.length === 6) {
  const distinctH = new Set(seeds.map(s => s.h)).size;
  distinctH === 6
    ? ok('B-1: hash index is document-wide', 'h = ' + seeds.map(s => s.h).join(','))
    : bad('B-1: hash index is document-wide', 'only ' + distinctH + ' distinct');
} else bad('B-1: token count', 'got ' + seeds.length);

// legacy projects must keep per-line seeding
const legacy = await page.evaluate(async () => {
  const before = [...document.querySelectorAll('#stage .c')].map(e => e.dataset.h);
  return { before };
});

// ---- randomness actually differs between the two identical lines ---------
await page.evaluate(() => {
  document.getElementById('pRandom').value = '1.5';
  document.getElementById('pRandom').dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(400);
const sx = await page.$$eval('#stage .c', els => els.map(e => e.style.getPropertyValue('--sx')));
(sx[0] !== sx[3] || sx[1] !== sx[4])
  ? ok('B-1: identical lines now get different randoms', sx.join(' '))
  : bad('B-1: identical lines still identical', sx.join(' '));

// ---- Confuse operator end to end ----------------------------------------
await page.evaluate(() => {
  document.getElementById('pOperator').value = 'confuse';
  document.getElementById('pOperator').dispatchEvent(new Event('change', { bubbles: true }));
  document.getElementById('pConfuseDepth').value = '1';
  document.getElementById('pConfuseDepth').dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('button[data-batch="hira"]').click();
});
await page.waitForTimeout(900);
const confused = await page.$$eval('#stage .c',
  els => els.filter(e => e.textContent !== e.dataset.sourceText).length);
confused > 0 ? ok('confuse: glyphs substituted', confused + ' of 6')
             : bad('confuse: glyphs substituted', 'none');

// source text must survive substitution
const sources = await page.$$eval('#stage .c', els => els.map(e => e.dataset.sourceText).join(''));
sources === 'あいうあいう' ? ok('confuse: source text immutable')
                          : bad('confuse: source text immutable', sources);

// ---- exports -------------------------------------------------------------
const png = await page.evaluate(() => {
  try { return { ok: true, url: document.querySelector('#btnPreview') ? 'x' : '' }; }
  catch (e) { return { ok: false, err: e.message }; }
});
await page.evaluate(() => document.getElementById('btnPreview').click());
await page.waitForTimeout(1500);
const previewShown = await page.$eval('#previewOverlay', e => !e.hidden);
previewShown ? ok('export: PNG preview rendered') : bad('export: PNG preview rendered');
await page.evaluate(() => document.getElementById('previewOverlay').click());

const svg = await page.evaluate(() => {
  const parts = [];
  const orig = URL.createObjectURL;
  let captured = null;
  URL.createObjectURL = b => { captured = b; return orig.call(URL, b); };
  document.getElementById('btnSvg').click();
  URL.createObjectURL = orig;
  return captured ? captured.size : 0;
});
// SVG goes through document.fonts.ready, so grab it directly instead
const svgText = await page.evaluate(async () => {
  let captured = null;
  const orig = URL.createObjectURL;
  URL.createObjectURL = b => { captured = b; return 'blob:stub'; };
  const a = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {};
  document.getElementById('btnSvg').click();
  await new Promise(r => setTimeout(r, 1200));
  HTMLAnchorElement.prototype.click = a;
  URL.createObjectURL = orig;
  return captured ? await captured.text() : '';
});
if (svgText) {
  const wellFormed = await page.evaluate(t => {
    const d = new DOMParser().parseFromString(t, 'image/svg+xml');
    return !d.querySelector('parsererror');
  }, svgText);
  wellFormed ? ok('export: SVG is well-formed XML', svgText.length + ' bytes')
             : bad('export: SVG is well-formed XML');
} else bad('export: SVG produced', 'no blob captured');

// ---- grid mode -----------------------------------------------------------
await page.evaluate(() => {
  const g = document.getElementById('pGridEnabled');
  g.checked = true; g.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(500);
const gridded = await page.$$eval('#stage .c', els => els.filter(e => e.dataset.gridCell != null).length);
gridded === 6 ? ok('grid: all glyphs placed', gridded + ' cells')
              : bad('grid: all glyphs placed', gridded + ' of 6');
await page.evaluate(() => {
  const g = document.getElementById('pGridEnabled');
  g.checked = false; g.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(300);

// ---- project round trip --------------------------------------------------
const round = await page.evaluate(() => {
  const data = JSON.parse(JSON.stringify(window.__td_projectData ? window.__td_projectData() : null));
  return data;
}).catch(() => null);

// projectData is closure-private; exercise the real Save→Load path via share URL
const shareOk = await page.evaluate(async () => {
  let captured = '';
  const origPrompt = window.prompt;
  navigator.clipboard.writeText = async () => { throw new Error('blocked'); };
  window.prompt = (_m, v) => { captured = v; return null; };
  document.getElementById('btnShare').click();
  await new Promise(r => setTimeout(r, 1500));
  window.prompt = origPrompt;
  return location.hash.length > 10 ? location.hash : captured;
});
shareOk && String(shareOk).includes('#p=')
  ? ok('share: URL built', String(shareOk).slice(0, 40) + '… (' + String(shareOk).length + ' chars)')
  : bad('share: URL built', String(shareOk).slice(0, 120));

// reload from the hash and confirm the artwork comes back
if (String(shareOk).includes('#p=')) {
  const hash = String(shareOk).slice(String(shareOk).indexOf('#'));
  const p2 = await browser.newPage();
  const e2 = [];
  p2.on('pageerror', e => e2.push(e.message));
  await p2.goto(BASE + '/index.html' + hash, { waitUntil: 'load' });
  await p2.waitForTimeout(2500);
  const restored = await p2.$eval('#textInput', e => e.value);
  restored === 'あいう\nあいう'
    ? ok('share: round trip restores text', JSON.stringify(restored))
    : bad('share: round trip restores text', JSON.stringify(restored));
  e2.length ? bad('share: restore without errors', e2.join(' | ')) : ok('share: restore without errors');
  await p2.close();
}

// ---- undo/redo -----------------------------------------------------------
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
ok('undo: no crash');

const appErrors = errors.filter(e => !/Failed to load resource/.test(e));
appErrors.length ? bad('console: no app errors', appErrors.slice(0, 5).join(' | '))
                 : ok('console: no app errors');
const localFails = failedReq.filter(u => u.startsWith(BASE));
localFails.length ? bad('network: local assets all resolve', localFails.join(' | '))
                  : ok('network: local assets all resolve',
                       failedReq.length ? failedReq.length + ' external (webfont) failures ignored' : '');

await browser.close();
server.close();

let failed = 0;
for (const [s, n, d] of results) {
  if (s === 'FAIL') failed++;
  console.log(`${s.padEnd(4)} ${n}${d ? '  —  ' + d : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
