import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('      function refreshParameterUI()'),html.indexOf('      function syncParameterRowReset('));
function fixture(){
 const count={textContent:''},frames=[],reads=[],rowWrites=[];let editing=false;
 const entries=Array.from({length:100},(_,i)=>{const control={id:'p'+i,type:'range',value:'0',dataset:{}},row={element:{classList:{toggle(){}}}};const entry={control,defaultRaw:'0',label:'Value',group:'Effect',modified:false,row};row.parameterEntries=[entry];return entry;});
 const c=vm.createContext({window:{TypeDeformerNumericControls:{editing:()=>editing}},document:{getElementById:()=>count},parameterEntries:entries,parameterRows:entries.map(e=>e.row),parameterDirtyEntries:new Set(),parameterEntryByControl:new WeakMap(entries.map(e=>[e.control,e])),parameterFullRefresh:true,parameterRefreshFrame:0,parameterModifiedCount:0,requestAnimationFrame(fn){frames.push(fn);return frames.length;},syncOperatorParameterAvailability(){},parameterRawValue(input){reads.push(input.id);return input.value;},parameterValue:input=>input.value,syncParameterRowReset(row,changed){rowWrites.push(changed);},syncMobileStepperStates(){},renderParameterResults(){}});
 vm.runInContext(source,c);c.refreshParameterUI();reads.length=rowWrites.length=0;
 return {c,entries,count,reads,rowWrites,edit(value){editing=value;},flush(){const work=frames.splice(0);work.forEach(fn=>fn());}};
}
test('single and coalesced parameter edits update changed counts and rows without scanning unrelated controls',()=>{
 const {c,entries,count,reads,rowWrites,flush}=fixture();entries[3].control.value='9';c.scheduleParameterUIRefresh(entries[3].control);c.scheduleParameterUIRefresh({target:entries[3].control});flush();
 assert.equal(count.textContent,'1');assert.deepEqual(reads,['p3']);assert.deepEqual(rowWrites,[true]);assert.match(entries[3].searchText,/9/);
 entries[3].control.value='0';entries[8].control.value='2';c.scheduleParameterUIRefresh(entries[3].control);c.scheduleParameterUIRefresh(entries[8].control);flush();assert.equal(count.textContent,'1');assert.equal(entries[3].modified,false);assert.equal(entries[8].modified,true);
});
test('project restore and reset request full reconciliation even with an already pending incremental edit',()=>{
 const {c,entries,count,reads,flush}=fixture();entries[3].control.value='9';c.scheduleParameterUIRefresh(entries[3].control);entries[99].control.value='4';c.scheduleParameterUIRefresh();flush();assert.equal(count.textContent,'2');assert.equal(reads.length,100);
 for(const e of entries)e.control.value='0';c.scheduleParameterUIRefresh();flush();assert.equal(count.textContent,'0');assert.ok(entries.every(e=>!e.modified));
});
test('numeric drafts defer updates and reconcile only their committed source control',()=>{
 const {c,entries,count,reads,flush,edit}=fixture();edit(true);entries[3].control.value='9';c.scheduleParameterUIRefresh(entries[3].control);flush();assert.equal(count.textContent,'0');assert.equal(reads.length,0);
 c.scheduleParameterUIRefresh({target:{dataset:{parameterCompanion:'1'}}});edit(false);c.scheduleParameterUIRefresh(entries[3].control);flush();assert.deepEqual(reads,['p3']);assert.equal(count.textContent,'1');
});
