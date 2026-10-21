import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parse} from 'acorn';
import {readEditorUnits} from './source-reader.mjs';

const source=readEditorUnits().find(unit=>unit.path==='editor.js').source;
const names=new Set([
  'syncHistoryControls','useCooperativeTextRevision','cancelTextEditJob','runTextEditJob',
  'startTextEditJob','queueTextHistoryAction','drainTextHistoryActions','recordHistorySnapshot',
  'textSelectionSnapshot','undo','redo','cancelPendingTextRebuild','flushPendingTextRebuild',
  'queueTextRebuild','handleTextInput'
]);
const declarations=new Map();
let compositionStart;
function collect(node) {
  if(!node||typeof node!=='object')return;
  if(node.type==='FunctionDeclaration'&&names.has(node.id.name)){
    assert.equal(declarations.has(node.id.name),false,'one actual function '+node.id.name);
    declarations.set(node.id.name,source.slice(node.start,node.end));
  }
  if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'
    &&node.callee.object.name==='textInput'&&node.callee.property.name==='addEventListener'
    &&node.arguments[0]?.value==='compositionstart'){
    compositionStart=source.slice(node.arguments[1].start,node.arguments[1].end);
  }
  for(const value of Object.values(node)){
    if(Array.isArray(value))value.forEach(collect);
    else if(value&&typeof value==='object')collect(value);
  }
}
collect(parse(source,{ecmaVersion:'latest'}));
for(const name of names)assert.ok(declarations.has(name),'actual editor function '+name);
assert.ok(compositionStart,'actual textarea compositionstart handler');
const runtime=[...declarations.values()].join('\n')+'\nvar onCompositionStart='+compositionStart+';';
const text=n=>'revision-'+n+'\n'+'A'.repeat(2000);
const snapshot=n=>({kind:'source',text:text(n)});
const labels=stack=>Array.from(stack,row=>row.text.slice(0,row.text.indexOf('\n')));

function fixture({current=2,undo=[0,1],redo=[]}={}) {
  let timerId=0,clock=0;
  const timers=new Map(),buttons=Object.fromEntries(
    ['btnHeaderUndo','btnMobileUndo','btnHeaderRedo','btnMobileRedo'].map(id=>[id,{}])
  );
  const commits=[];
  const c=vm.createContext({
    performance:{now:()=>clock+=9},
    console:{error(error){throw error;}},
    setTimeout(callback){const id=++timerId;timers.set(id,callback);return id;},
    clearTimeout(id){timers.delete(id);},
    document:{getElementById:id=>buttons[id]||null}
  });
  Object.assign(c,{
    textComposing:false,textInput:{value:text(current),selectionStart:0,selectionEnd:0,selectionDirection:'none',
      setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction;}},
    renderedSourceText:text(current),metrics:[],documentEditor:null,
    pendingTextSelection:null,pendingTextValue:null,pendingControlHistory:null,rebuildTimer:null,
    textEditGeneration:0,textEditJob:null,undoStack:undo.map(snapshot),redoStack:redo.map(snapshot),
    refreshSourceSelectionUI(){},schedule(){},markAutosaveDirty(){},setProjectActionStatus(){},
    snapDocumentState:()=>({kind:'source',text:c.renderedSourceText}),
    snapState:()=>c.renderedSourceText,
    applyHistorySnapshot(row){c.renderedSourceText=row.text;c.textInput.value=row.text;},
    rebuildPreservingState(value){assert.equal(value,c.renderedSourceText,'flush completes queued revisions before rebuilding');return false;}
  });
  // The scheduler, queue, stack operations, controls, input cancellation and
  // flush are real editor functions. Preparation/commit stand in for DOM work
  // so timer ordering is deterministic without a browser or layout benchmark.
  c.prepareTextRevision=function*(value,historySnapshot){
    const before={kind:'source',text:c.renderedSourceText};
    yield;yield;
    return {text:value,historySnapshot,before};
  };
  c.commitTextRevision=prepared=>{
    c.renderedSourceText=prepared.text;c.textInput.value=prepared.text;commits.push(prepared.text);
    if(!prepared.historySnapshot)c.recordHistorySnapshot(prepared.before);
  };
  vm.runInContext(runtime,c,{filename:'actual-editor-history-functions.js'});
  c.syncHistoryControls();
  function tick(){
    const entry=timers.entries().next().value;
    if(!entry)return false;
    timers.delete(entry[0]);entry[1]();return true;
  }
  function drain(){
    let ticks=0;
    while(tick())assert.ok(++ticks<100,'bounded queued work');
    assert.equal(c.textEditJob,null);
  }
  return {c,timers,buttons,commits,tick,drain};
}

test('two Undo commands consume two distinct source revisions after atomic commits',()=>{
  const {c,drain,commits}=fixture();
  c.undo();const first=c.textEditJob;c.undo();
  assert.equal(c.textEditJob,first,'the second command must not replace its predecessor');
  drain();
  assert.equal(c.renderedSourceText,text(0));
  assert.deepEqual(commits,[text(1),text(0)]);
  assert.deepEqual(labels(c.undoStack),[]);
  assert.deepEqual(labels(c.redoStack),['revision-2','revision-1']);
});

test('two Redo commands consume two distinct source revisions',()=>{
  const {c,drain,commits}=fixture({current:0,undo:[],redo:[2,1]});
  c.redo();c.redo();drain();
  assert.equal(c.renderedSourceText,text(2));
  assert.deepEqual(commits,[text(1),text(2)]);
  assert.deepEqual(labels(c.undoStack),['revision-0','revision-1']);
  assert.deepEqual(labels(c.redoStack),[]);
});

test('opposite queued directions resolve against the preceding committed stacks',()=>{
  for(const actions of [['undo','redo'],['redo','undo']]){
    const {c,drain,commits}=fixture({current:1,undo:[0],redo:[2]});
    actions.forEach(action=>c[action]());drain();
    assert.equal(c.renderedSourceText,text(1),actions.join(' then '));
    assert.deepEqual(commits,[text(actions[0]==='undo'?0:2),text(1)]);
    assert.deepEqual(labels(c.undoStack),['revision-0']);
    assert.deepEqual(labels(c.redoStack),['revision-2']);
  }
});

test('explicit cancellation drops both an in-progress revision and its queued commands',async()=>{
  const {c,tick,drain,commits}=fixture();
  c.undo();c.undo();const result=c.textEditJob.promise;tick();
  c.cancelPendingTextRebuild();
  assert.equal(await result,false);
  drain();
  assert.equal(c.renderedSourceText,text(2));
  assert.deepEqual(commits,[]);
  assert.deepEqual(labels(c.undoStack),['revision-0','revision-1']);
  assert.deepEqual(labels(c.redoStack),[]);
});

test('new input cancels queued history and commits only the replacement draft',async()=>{
  const {c,tick,drain,commits}=fixture();
  c.undo();c.redo();const result=c.textEditJob.promise;tick();
  c.textInput.value=text(3);c.handleTextInput({inputType:'insertText',isComposing:false});
  assert.equal(await result,false);
  drain();
  assert.equal(c.renderedSourceText,text(3));
  assert.deepEqual(commits,[text(3)]);
  assert.deepEqual(labels(c.undoStack),['revision-0','revision-1','revision-2']);
  assert.deepEqual(labels(c.redoStack),[]);
});

test('save/blur flush drains every queued history command synchronously',()=>{
  const {c,timers,commits}=fixture();
  c.undo();c.undo();c.redo();c.flushPendingTextRebuild();
  assert.equal(c.textEditJob,null);assert.equal(timers.size,0);
  assert.equal(c.renderedSourceText,text(1));
  assert.deepEqual(commits,[text(1),text(0),text(1)]);
  assert.deepEqual(labels(c.undoStack),['revision-0']);
  assert.deepEqual(labels(c.redoStack),['revision-2']);
});

test('IME starts after queued history is flushed and defers new composing input',()=>{
  const {c,timers,commits}=fixture();
  c.undo();c.undo();c.onCompositionStart();
  assert.equal(c.textComposing,true);assert.equal(c.textEditJob,null);
  assert.equal(c.renderedSourceText,text(0));assert.equal(timers.size,0);
  c.textInput.value=text(3);c.handleTextInput({inputType:'insertCompositionText',isComposing:true});
  assert.equal(c.renderedSourceText,text(0));assert.equal(c.pendingTextValue,text(3));
  assert.equal(timers.size,0);assert.deepEqual(commits,[text(1),text(0)]);
});

test('history buttons project pending directions and permit the opposite action',()=>{
  const {c,buttons,drain}=fixture({current:1,undo:[0],redo:[]});
  c.undo();
  assert.equal(buttons.btnHeaderUndo.disabled,true);
  assert.equal(buttons.btnHeaderRedo.disabled,false);
  c.redo();
  assert.equal(buttons.btnHeaderUndo.disabled,false);
  assert.equal(buttons.btnHeaderRedo.disabled,true);
  drain();assert.equal(c.renderedSourceText,text(1));
});

test('redo of an uncommitted draft can be followed immediately by Undo',()=>{
  const {c,drain}=fixture({current:1,undo:[0],redo:[]});
  c.redoStack.push({kind:'sourceDraft',text:text(2),selection:{start:0,end:0,direction:'none'}});
  c.redo();c.undo();drain();
  assert.equal(c.renderedSourceText,text(1));
  assert.deepEqual(labels(c.undoStack),['revision-0']);
  assert.deepEqual(labels(c.redoStack),['revision-2']);
});
