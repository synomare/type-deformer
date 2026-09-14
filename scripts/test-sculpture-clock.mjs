import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import test from 'node:test';
test('completed worker must be painted before the clock can move to the next phase',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),source=html.match(/      function setCompositionPlaying\([^]*?\n      }/)[0];let callback,draws=0,waiting=false;
 const c=vm.createContext({surfaceWorkerClockHold:false,compositionWorkerHold:false,params:{frozenMoment:''},window:{matchMedia:()=>({matches:false})},document:{getElementById:()=>null},compositionState:{enabled:true,phase:.2,speed:1,direction:1},compositionScene:{presented:true,presentedPhase:.1,glyphs:[{}]},compositionPlayRaf:null,compositionLastTime:0,sculptureEditor:{waiting:()=>waiting},surfaceEffectPresent:()=>true,requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame(){},scheduleAutosave(){},scheduleCompositionDraw(){draws++;}});
 vm.runInContext(source,c);c.setCompositionPlaying(true);callback(10000);assert.equal(c.compositionState.phase,.2);assert.equal(draws,1);
 c.compositionScene.presentedPhase=.2;callback(10016);assert.ok(Math.abs(c.compositionState.phase-.216)<1e-12);
 const phase=c.compositionState.phase;callback(10032);assert.equal(c.compositionState.phase,phase,'unpainted frame holds');waiting=true;c.compositionScene.presentedPhase=phase;callback(10048);assert.equal(c.compositionState.phase,phase,'worker holds');
 waiting=false;callback(10064);assert.ok(c.compositionState.phase>phase);c.setCompositionPlaying(false);assert.equal(c.compositionPlayRaf,null);
});
