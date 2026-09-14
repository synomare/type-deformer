import assert from 'node:assert/strict';
import {test} from 'node:test';
import '../document-layout.js';
import {fixture,metric,apply} from './paragraph-current-fixture.mjs';
const D=globalThis.TypeDeformerDocument;
test('all saved Operator codes are unique and new layout channels do not replace Calligraphic Stress',()=>{
 const c=fixture(),codes=c.OPERATOR_IDS.map(id=>c.OPERATOR_DEFS[id].short);assert.equal(new Set(codes).size,codes.length);
 const m=metric(c,0,0);for(const id of ['calligraphicStress','counterspaceFlow','concordanceField']){const s=c.operatorState(m,id);s.toggled=true;s.current=.625;}
 const restored=c.decodeOperatorStates(c.encodeOperatorStates(m));for(const id of ['calligraphicStress','counterspaceFlow','concordanceField'])assert.equal(restored[id].t,1,id);
});
test('paired Paragraph Current improvement measures bend in each text object font size',()=>{
 const c=fixture();c.params.fontSize=100;c.params.vertical=false;c.params.currentFlow='crest';c.params.currentFocus=.5;c.params.currentReach=1;c.params.currentBend=2;
 const a=metric(c,0,0,{width:1000}),b=metric(c,0,0,{paragraph:1,width:1000});a.objectScale=1;b.objectScale=.25;c.metrics=[a,b];apply(c,1);
 const dy=m=>parseFloat(m.el.style.getPropertyValue('--op-current-y'));assert.ok(Math.abs(dy(a)-4*dy(b))<.01);
});
test('paired Reading Field uses the body size, not the headline minimum reading frame',()=>{
 const c=fixture();Object.assign(c.params,{fontSize:120,vertical:false,readingScope:'paragraph',readingPressure:1,readingWidth:.4,readingHeight:.4,readingFocusU:.5,readingFocusV:.5,readingFeather:.1,readingBody:1});
 const m=metric(c,0,0,{width:12,height:18});m.objectScale=.25;m.readingParagraphFrame={minU:0,maxU:50,minV:0,maxV:20};c.operatorState(m,'readingField').current=1;
 c.applyReadingFieldVisual(m,c.params);
 const sample=fs=>c.readingFieldSample(m.relX,m.relY,m.w/2,m.h/2,m.readingParagraphFrame,c.params,1,fs),expected=sample(30),old=sample(120);
 const x=parseFloat(m.el.style.getPropertyValue('--op-reading-x'));assert.ok(Math.abs(x-expected.du)<.0001);assert.ok(Math.abs(x-old.du)>.1);
 m.objectScale=1;c.applyReadingFieldVisual(m,c.params);assert.ok(Math.abs(parseFloat(m.el.style.getPropertyValue('--op-reading-x'))-old.du)<.0001,'legacy single-size behavior remains');
});
test('an odd-page text object cannot borrow the first page of the next object as its spread partner',()=>{
 const objects=[{id:'head',scale:1,measure:8},{id:'body',scale:.4,measure:12}],c=fixture({documentEditor:{records:()=>objects}});
 Object.assign(c.params,{fontSize:30,pageLayout:'spreads',pageDepth:4,pageGutter:2,pageGap:3,pageKeepLines:1,vertical:false});
 const head=metric(c,0,0,{width:60,height:30});head.el.dataset.textObject='head';c.metrics=[head];
 for(let i=0;i<30;i++){const m=metric(c,i%6*12,100+Math.floor(i/6)*24,{width:12,height:20,paragraph:1});m.el.dataset.textObject='body';c.metrics.push(m);}
 for(const m of c.metrics){m.flowX=m.relX;m.flowY=m.relY;}
 const result=c.applyPageLayout(c.metrics,c.params),owners=new Map();for(const m of c.metrics){if(!owners.has(m.spreadIndex))owners.set(m.spreadIndex,new Set());owners.get(m.spreadIndex).add(m.el.dataset.textObject);}
 assert.ok([...owners.values()].every(ids=>ids.size===1),'different source objects never share a spread identity');
 assert.equal(result.pages[1].isBlank,true);assert.equal(result.pages[1].glyphs,0);assert.equal(c.metrics[1].pageIndex,2);
 assert.deepEqual(JSON.parse(JSON.stringify(result.pages[0].spreadFrame)),JSON.parse(JSON.stringify(result.pages[1].spreadFrame)));
 assert.ok(result.pages.every(p=>[p.frame.x,p.frame.y,p.frame.w,p.frame.h].every(Number.isFinite)));
 c.params.pageLayout='pages';assert.ok(!c.applyPageLayout(c.metrics,c.params).pages.some(p=>p.isBlank),'ordinary pages have no invented blank');
});
test('objects preserve complete source and independent ranges; reject loss, injection and bad bounds',()=>{
 const data=D.compose([{id:'a',label:'見出し',text:'永遠\nの余白',scale:1},{id:'b',text:'A body.\n\n本文。',scale:.3}]);
 assert.equal(data.text,'永遠\nの余白\n\nA body.\n\n本文。');assert.equal(D.objects(JSON.stringify(data.objects),data.text)[1].scale,.3);
 assert.throws(()=>D.objects([{id:'a',start:2,end:3}],'abc'));assert.throws(()=>D.objects([{id:'<x>',start:0,end:3}],'abc'));
 assert.deepEqual(D.objects('',data.text),[]);assert.equal(D.compose([{id:'a',text:''}]).objects[0].end,0);
});
const tokens=(text)=>Array.from(text,(ch,i)=>ch==='\n'?{break:true}:({start:i,text:ch,width:ch===' '?3:7,space:ch===' '}));
test('reflow uses both sides of author voids without losing/reordering text',()=>{
 const source='永遠の余白を渡る文章。A paragraph of words.\nA second line. 第二の文章。'.repeat(3),input=tokens(source),shapes=[{kind:'ellipse',x:70,y:30,w:60,h:50}];
 const a=D.reflow(input,{width:140,line:12,height:10,shapes,margin:3,gap:6});
 assert.deepEqual(a.positions.map(p=>p.start),input.filter(t=>!t.space&&!t.break).map(t=>t.start));
 for(const p of a.positions)assert.ok(D.exclusions(p.y,10,140,shapes,3).some(([x,z])=>p.x>=x-.01&&p.x+p.width<=z+.01));
 assert.ok(a.positions.some(p=>p.y<60&&p.x>103));assert.deepEqual(a,D.reflow(input,{width:140,line:12,height:10,shapes,margin:3,gap:6}));
 const b=D.reflow(input,{width:140,line:12,height:10,shapes:[{...shapes[0],x:20}],margin:3,gap:6});assert.notDeepEqual(a.positions,b.positions);
});
test('full-width blockage moves below, excessive words overflow honestly, 3 shapes differ',()=>{
 const input=tokens('HELLO WORLD 永遠の余白。'.repeat(60)),spec={width:84,line:12,height:10,margin:2};
 const signatures=['ellipse','rect','river'].map(kind=>JSON.stringify(D.reflow(input,{...spec,shapes:[{kind,x:42,y:50,w:50,h:70}]}).positions));assert.equal(new Set(signatures).size,3);
 const full=D.reflow(tokens('ABC'),{...spec,shapes:[{kind:'rect',x:42,y:25,w:90,h:50}]});assert.ok(full.positions[0].y>=52);
 const long=D.reflow([{start:0,text:'joining',width:130}],spec);assert.equal(long.positions.length,1);assert.equal(long.oversized,1);
});
test('concordance exact UTF-16 phrases, no inferred semantics; stable zero and meaningful controls',()=>{
 const text='余白を読む\nここに余白\nRead the void\nvoid';const matches=D.occurrences(text,['余白','void','余白']);assert.equal(matches.length,4);assert.equal(D.occurrences(text,['Void']).length,0);
 const items=[];let x=0,y=0;for(let i=0;i<text.length;i++){if(text[i]==='\n'){x=0;y+=20;continue;}items.push({start:i,end:i+1,x,y,w:10,line:y/20});x+=10;}
 const settings={axis:.5,amount:0,spacing:0,emphasis:1,direction:'center'};const a=D.concordance(items,matches,settings);assert.ok(a.positions.every(p=>p.dx===0&&p.dy===0&&p.scale===1));assert.equal(a.matched,4);
 const b=D.concordance(items,matches,{...settings,amount:1,spacing:8,emphasis:1.5});assert.ok(b.positions.some(p=>p.dx));assert.ok(b.positions.at(-1).dy>0);assert.ok(b.positions.some(p=>p.scale===1.5));assert.ok(!items.some(m=>'_row' in m));
 assert.notDeepEqual(b.positions,D.concordance(items,matches,{...settings,amount:1,spacing:8,emphasis:1.5,direction:'alternate'}).positions);
});
test('long prose matching is bounded and leaves input unchanged',()=>{const text='余白は余白。'.repeat(2000),items=Array.from(text,(ch,i)=>({start:i,end:i+1,x:i%32*10,y:Math.floor(i/32)*20,w:10,line:Math.floor(i/32)}));const start=performance.now(),plan=D.concordance(items,D.occurrences(text,['余白']),{axis:.5,amount:1,spacing:2,emphasis:1.1,direction:'center'});assert.equal(plan.positions.length,items.length);assert.equal(plan.matched,4000);assert.ok(performance.now()-start<2000);});
