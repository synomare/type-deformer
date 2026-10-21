// Local, isolated browser evidence. Baseline files are read from Git HEAD;
// current files are read from the checkout. No project or browser storage is reused.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import {editorHookTarget, insertEditorHook, editorBootMarker} from './editor-hook.mjs';
import {readLegacyInlineEditorSource, replaceSourceOnce} from './source-reader.mjs';
const repo = path.resolve(import.meta.dirname,'..');
const out = process.env.TEXT_LAYOUT_EVIDENCE || path.join(repo,'work','text-layout-benchmark');
fs.mkdirSync(out,{recursive:true});
const modeArg=process.argv[2]||'both', modes=modeArg==='both'?['head','current']:[modeArg];
if(modes.some(mode=>!['head','current'].includes(mode)))throw Error('Expected head, current, or both');
const currentEditor=modes.includes('current')?editorHookTarget():null;
const hook=`window.__layoutBench={suspend(){autosaveSuspended=true;},load:loadProject,
 edit(text){textInput.value=text;return rebuildPreservingState(text);},undo,
 metrics(){return metrics.length;},measure:measureLayout,
 snapshot(){return typeof currentLayoutSnapshot==='undefined'?null:currentLayoutSnapshot;},
 set(text){Object.assign(params,{fontFamily:'"Times New Roman",serif',fontSize:70,fontWeight:400,letterSpacing:0,lineHeight:1.35,randomness:0,rotation:0,accentRatio:0,textMeasure:0,vertical:false,gridEnabled:false});textInput.value=text;createSpans(text);applyStyle();measureLayout();}
 };`;
let mode='current';const cache=new Map();
function read(file) {
  if(mode==='current')return fs.readFileSync(path.join(repo,file));
  if(!cache.has(file))cache.set(file,execFileSync('git',['show','HEAD:'+file],{cwd:repo,windowsHide:true,maxBuffer:32*1024*1024,stdio:['ignore','pipe','ignore']}));
  return cache.get(file);
}
const server=http.createServer((req,res)=>{
  try{const file=decodeURIComponent(new URL(req.url,'http://local').pathname).slice(1)||'index.html';
    if(file.includes('..'))throw Error('path');let content=read(file);
    if(mode==='current'&&file===currentEditor.path)content=insertEditorHook(content.toString('utf8'),hook);
    if(mode==='head'&&file==='index.html'){
      // This comparison deliberately names the pre-extraction inline format.
      // A future external-script baseline must declare its own source layout.
      readLegacyInlineEditorSource({read});
      content=replaceSourceOnce(content.toString('utf8'),editorBootMarker,hook+'\n'+editorBootMarker,'historical inline benchmark');
    }
    res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.json')?'application/json':'application/octet-stream','Cache-Control':'no-store'}).end(content);
  }catch(e){res.writeHead(404).end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={date:new Date().toISOString(),browser:browser.version(),head:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),viewport:{width:1440,height:1000},notes:'Three sequential repetitions per size per revision; isolated storage; external Google Fonts blocked; timing includes all integrated application changes, not only the layout adapter. rAF2 is not a paint-completion measurement and may precede a cooperative text revision commit. This legacy probe does not measure source-job completion. No machine-wide performance claim.',runs:[]};
try{
 for(mode of modes){
  for(const count of [100,1000,5000]){
   const ctx=await browser.newContext({viewport:report.viewport});
   await ctx.route(/fonts\.googleapis\.com/,r=>r.fulfill({status:200,contentType:'text/css',body:''}));
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.goto(url,{waitUntil:'load'});await page.waitForFunction(()=>window.__layoutBench&&document.querySelector('#stage .c'));
   if(mode==='current')await page.waitForFunction(()=>/^(ready|blocked)$/.test(document.body.dataset.workspaceState||'')&&!document.body.inert);
   await page.evaluate(()=>__layoutBench.suspend());
   const initial=await page.evaluate(()=>({elements:document.querySelectorAll('*').length,connectedControls:document.querySelectorAll('input,select,textarea,button').length,
     connectedRanges:document.querySelectorAll('input[type="range"]').length,numericCompanions:document.querySelectorAll('[data-parameter-companion]').length,
     operatorPanels:globalThis.TypeDeformerOperatorPanels?TypeDeformerOperatorPanels.stats():null,
     rendererRevision:globalThis.TypeDeformerBuildInfo?TypeDeformerBuildInfo.rendererRevision:null,userAgent:navigator.userAgent,
     navigation:performance.getEntriesByType('navigation').map(n=>({domContentLoadedMs:n.domContentLoadedEventEnd,loadMs:n.loadEventEnd}))[0]}));
   for(let repetition=0;repetition<3;repetition++){
    const text=('文字ABCD 0123\n').repeat(Math.ceil(count/12)).slice(0,count);
    const row=await page.evaluate(async({text,repetition})=>{
      const longTasks=[];const observer=new PerformanceObserver(list=>longTasks.push(...list.getEntries().map(e=>e.duration)));observer.observe({type:'longtask'});
      const steps=[];
      for(const action of ['load','insert','undo']){
        const started=performance.now();
        if(action==='load')__layoutBench.load({app:'type-deformer',version:92,text,params:{}});
        else if(action==='insert')__layoutBench.edit(text.slice(0,Math.floor(text.length/2))+'X'+text.slice(Math.floor(text.length/2)));
        else __layoutBench.undo();
        const syncMs=performance.now()-started;
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        steps.push({action,syncMs,rAF2Ms:performance.now()-started});
      }
      longTasks.push(...observer.takeRecords().map(e=>e.duration));observer.disconnect();
      return {characters:text.length,repetition,steps,maxLongTaskMs:Math.max(0,...longTasks),tokens:__layoutBench.metrics(),elements:document.querySelectorAll('*').length};
    },{text,repetition});
    row.mode=mode;row.initial=initial;row.errors=[...errors];report.runs.push(row);
    fs.writeFileSync(path.join(out,'text-layout-performance.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({mode,count,repetition,steps:row.steps,maxLongTaskMs:row.maxLongTaskMs,errors:row.errors.length}));
   }
   if(mode==='current'&&count===100){await page.evaluate(()=>__layoutBench.set('AV To ffi office\nÁV　文字と空白\nאבג (123) ABC\nABC ⁧אבג (123)⁩ XYZ\nسلام 123 (ABC) نور'));await page.waitForTimeout(1800);await page.locator('#stageWrap').screenshot({path:path.join(out,'text-layout-reference.png')});}
   await ctx.close();
  }
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
