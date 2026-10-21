// Local browser evidence for the path a person actually waits on after typing:
// keyboard input → debounce → cooperative source revision → commit → layout
// measurement. The legacy benchmark-text-layout.mjs calls the synchronous
// rebuild directly and does not observe this path. No machine-wide claim.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
import {editorHookTarget, insertEditorHook} from './editor-hook.mjs';
const repo = path.resolve(import.meta.dirname,'..');
const out = process.env.TEXT_INPUT_EVIDENCE || path.join(repo,'work','text-input-benchmark');
fs.mkdirSync(out,{recursive:true});
const sizes = (process.env.TEXT_INPUT_SIZES || '1000,5000,10000').split(',').map(Number);
const repetitions = Number(process.env.TEXT_INPUT_REPETITIONS || 3);
const editor = editorHookTarget();
const timed = ['measureLayout','commitTextRevision','updatePageLayoutUI','updateExportInfo','snapshotGlyphs','refreshSourceSelectionUI','recordHistorySnapshot','markAutosaveDirty','flushOperatorVisuals'];
const wrappers = timed.map(name => `(function(previous){${name}=function(){var t=performance.now();try{return previous.apply(this,arguments);}finally{if(window.__inputBenchCalls)(window.__inputBenchCalls['${name}']=window.__inputBenchCalls['${name}']||[]).push(performance.now()-t);}};})(${name});`).join('\n');
const hook = `${wrappers}
(function(previous){measureLayout=function(){var t=performance.now();try{return previous.apply(this,arguments);}finally{if(window.__inputBenchCalls)(window.__inputBenchCalls.layoutMeasure=window.__inputBenchCalls.layoutMeasure||[]).push({ms:performance.now()-t,reused:currentLayoutSnapshot&&currentLayoutSnapshot.reusedParagraphs||0});}};})(measureLayout);
window.__inputBench={suspend(){autosaveSuspended=true;},load:loadProject,
 settled(){return !textEditJob&&!rebuildTimer&&!metricsDirty&&textInput.value===renderedSourceText;},
 glyphs(){return metrics.length;},
 preflight(){var host=document.getElementById('imageExportPreflight');return {stale:typeof imagePreflightStale!=='undefined'&&imagePreflightStale,state:host&&host.dataset.state,filled:!!(host&&host.textContent)};},text(){return renderedSourceText;}};`;
const server = http.createServer((req,res) => {
  try {
    const file = decodeURIComponent(new URL(req.url,'http://local').pathname).slice(1) || 'index.html';
    if (file.includes('..')) throw Error('path');
    let content = fs.readFileSync(path.join(repo,file));
    if (file === editor.path) content = insertEditorHook(content.toString('utf8'), hook);
    res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.json')?'application/json':'application/octet-stream','Cache-Control':'no-store'}).end(content);
  } catch (e) { res.writeHead(404).end('Not found'); }
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({channel:'msedge',headless:true});
const report = {date:new Date().toISOString(),browser:browser.version(),viewport:{width:1440,height:1000},
  notes:'settledMs runs from the keyboard event until the source job, debounce timer and layout dirty flag are clear and two animation frames have passed. It includes the 250 ms input debounce. Long tasks are observed in the page main thread. External Google Fonts are blocked.',runs:[]};
async function waitSettled(page) {
  return page.evaluate(() => new Promise(resolve => {
    const start = performance.now();
    (function poll() {
      if (__inputBench.settled()) requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)));
      else if (performance.now() - start > 60000) resolve(-1);
      else setTimeout(poll, 4);
    })();
  }));
}
try {
  for (const count of sizes) {
    const ctx = await browser.newContext({viewport:report.viewport});
    await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({status:200,contentType:'text/css',body:''}));
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error('pageerror', e.message); }); page.on('dialog', d => d.accept());
    await page.goto(url,{waitUntil:'load'});
    await page.waitForFunction(() => window.__inputBench && /^(ready|blocked)$/.test(document.body.dataset.workspaceState||'') && !document.body.inert);
    const text = ('文字ABCD 0123\n').repeat(Math.ceil(count/12)+1).slice(0,count);
    await page.evaluate(text => { __inputBench.suspend(); __inputBench.load({app:'type-deformer',version:92,text,params:{}}); }, text);
    await waitSettled(page);
    const input = page.locator('#textInput');
    for (let repetition = 0; repetition < repetitions; repetition++) {
      for (const action of ['insert','undo']) {
        const at = Math.floor(count/2) + repetition;
        await page.evaluate(at => {
          const el = document.getElementById('textInput'); el.focus(); el.setSelectionRange(at, at);
          window.__inputBenchCalls = {}; window.__inputBenchLong = [];
          window.__inputBenchObserver = new PerformanceObserver(list => window.__inputBenchLong.push(...list.getEntries().map(e => ({start:e.startTime,ms:e.duration}))));
          window.__inputBenchObserver.observe({type:'longtask'});
          window.__inputBenchStart = performance.now();
        }, at);
        const profiling = process.env.TEXT_INPUT_PROFILE && repetition === 0;
        let cdp = null;
        if (profiling) { cdp = await page.context().newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval',{interval:200}); await cdp.send('Profiler.start'); }
        const t0 = Date.now();
        if (action === 'insert') await input.press('X'); else await input.press('Control+z');
        const pressMs = Date.now() - t0;
        await waitSettled(page);
        if (cdp) {
          const {profile} = await cdp.send('Profiler.stop'); await cdp.detach();
          const nodes = new Map(profile.nodes.map(n => [n.id,n])), self = new Map(), total = new Map(), parent = new Map();
          profile.nodes.forEach(n => (n.children||[]).forEach(c => parent.set(c,n.id)));
          const label = n => (n.callFrame.functionName||'(anon)')+' '+(n.callFrame.url||'').split('/').pop()+':'+(n.callFrame.lineNumber+1);
          profile.samples.forEach((id,i) => { const ms=(profile.timeDeltas[i]||0)/1000, n=nodes.get(id); self.set(label(n),(self.get(label(n))||0)+ms);
            const seen=new Set(); for (let cur=id; cur!=null; cur=parent.get(cur)) { const l=label(nodes.get(cur)); if(!seen.has(l)){seen.add(l);total.set(l,(total.get(l)||0)+ms);} } });
          const top = m => [...m].sort((x,y)=>y[1]-x[1]).slice(0,40).map(([k,v])=>[Math.round(v),k]);
          fs.writeFileSync(path.join(out,`profile-${count}-${action}.json`),JSON.stringify({self:top(self),total:top(total)},null,1));
        }
        const row = await page.evaluate(() => {
          window.__inputBenchLong.push(...window.__inputBenchObserver.takeRecords().map(e => ({start:e.startTime,ms:e.duration})));
          window.__inputBenchObserver.disconnect();
          const calls = {};
          for (const [k,v] of Object.entries(window.__inputBenchCalls)) calls[k] = {count:v.length,totalMs:v.reduce((a,b)=>a+(b.ms??b),0),maxMs:Math.max(...v.map(b=>b.ms??b)),reused:v.map(b=>b.reused).filter(x=>x!=null)};
          const long = window.__inputBenchLong.filter(t => t.start >= window.__inputBenchStart - 1);
          return {settledMs:performance.now()-window.__inputBenchStart,maxLongTaskMs:Math.max(0,...long.map(t=>t.ms)),totalLongTaskMs:long.reduce((a,t)=>a+t.ms,0),longTasks:long.length,calls,glyphs:__inputBench.glyphs(),chars:__inputBench.text().length};
        });
        row.preflightCatchUpMs = await page.evaluate(() => new Promise(resolve => { const start = performance.now();
          (function poll() { if (!__inputBench.preflight().stale) resolve(performance.now() - start); else if (performance.now() - start > 5000) resolve(-1); else setTimeout(poll, 10); })(); }));
        row.preflight = await page.evaluate(() => __inputBench.preflight());
        Object.assign(row,{count,repetition,action,pressMs,errors:[...errors]});
        report.runs.push(row);
        console.log(JSON.stringify({count,repetition,action,settledMs:Math.round(row.settledMs),maxLongTaskMs:Math.round(row.maxLongTaskMs),totalLongTaskMs:Math.round(row.totalLongTaskMs),measure:row.calls.layoutMeasure&&row.calls.layoutMeasure.reused,commit:row.calls.commitTextRevision&&Math.round(row.calls.commitTextRevision.totalMs),measureLayout:row.calls.measureLayout&&Math.round(row.calls.measureLayout.totalMs),preflightCatchUpMs:Math.round(row.preflightCatchUpMs),preflight:row.preflight,chars:row.chars,errors:errors.length}));
      }
    }
    await ctx.close();
  }
  const median = a => { const s = [...a].sort((x,y)=>x-y); return s[s.length>>1]; };
  report.summary = [];
  for (const count of sizes) for (const action of ['insert','undo']) {
    const rows = report.runs.filter(r => r.count === count && r.action === action);
    report.summary.push({count,action,settledMedianMs:median(rows.map(r=>r.settledMs)),maxLongTaskMedianMs:median(rows.map(r=>r.maxLongTaskMs)),maxLongTaskMs:Math.max(...rows.map(r=>r.maxLongTaskMs))});
  }
  console.table(report.summary);
  fs.writeFileSync(path.join(out,'text-input-performance.json'),JSON.stringify(report,null,2));
} finally { await browser.close(); await new Promise(r => server.close(r)); }
