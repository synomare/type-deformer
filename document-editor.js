(function(root){
  'use strict';
  const D=root.TypeDeformerDocument;
  function create(api){
    const by=id=>document.getElementById(id),p=api.params(),list=by('pTextObject'),editor=by('textObjectEditor'),input=by('textObjectText');
    let active='',composing=false,pending=false,timer=null,error='',lastText='',lastRaw='',model=[];
    function records(){const text=api.text();if(text!==lastText||p.textObjects!==lastRaw){model=D.objects(p.textObjects,text);lastRaw=p.textObjects;lastText=text;}return model;}
    function current(){return records().find(o=>o.id===active)||records()[0];}
    function refresh(){
      const objects=records(),o=current();active=o?.id||'';editor.hidden=!o;by('textInput').readOnly=!!o;by('textObjectFullSource').hidden=!o;
      const signature=objects.map(o=>o.id+':'+o.label).join('|');if(list.dataset.signature!==signature){list.replaceChildren();for(const record of objects){const option=document.createElement('option');option.value=record.id;option.textContent=record.label;list.append(option);}list.dataset.signature=signature;}
      list.value=active;
      if(o){if(!pending&&document.activeElement!==input)input.value=api.text().slice(o.start,o.end);for(const [key,id] of Object.entries({label:'pTextObjectName',x:'pTextObjectX',y:'pTextObjectY',scale:'pTextObjectScale',measure:'pTextObjectMeasure',ink:'pTextObjectInk'})){if(document.activeElement!==by(id))by(id).value=key==='ink'?(o.ink||p.ink):o[key];}by('pTextObjectOwnInk').checked=!!o.ink;by('pTextObjectInk').disabled=!o.ink;}
      by('textObjectStatus').textContent=error||(o?(objects.length+' objects · 書体は共通／大きさ・色・位置・行長は個別'+(p.gridEnabled?' · Grid中は個別配置を休止':p.pageLayout!=='continuous'?' · ページ配置はオブジェクトごと':'')):'現在の原文を残して、見出し・本文・注記を追加できます。');
      by('btnTextObjectAdd').disabled=objects.length>=32||composing;by('btnTextObjectDelete').disabled=!o||composing;
    }
    function allTextRecords(){const objects=records();return objects.length?objects.map(o=>({...o,text:api.text().slice(o.start,o.end)})):[{id:'text-main',label:'Main',x:0,y:0,scale:1,measure:p.textMeasure,ink:'',text:api.text()}];}
    function replace(next){try{api.replace(D.compose(next));error='';}catch(e){error=e.message;}refresh();}
    function flush(){if(composing||!pending)return;clearTimeout(timer);pending=false;const o=current();if(!o)return;replace(allTextRecords().map(r=>r.id===o.id?{...r,text:input.value}:r));}
    function queue(){pending=true;clearTimeout(timer);if(!composing)timer=setTimeout(flush,250);}
    input.addEventListener('input',queue);input.addEventListener('blur',flush);
    input.addEventListener('compositionstart',()=>{flush();composing=true;api.composing(true);});
    input.addEventListener('compositionend',()=>{composing=false;api.composing(false);queue();});
    input.addEventListener('beforeinput',e=>{if(!composing&&['historyUndo','historyRedo'].includes(e.inputType)){e.preventDefault();flush();api.historyAction(e.inputType==='historyUndo'?'undo':'redo');refresh();}});
    list.addEventListener('change',()=>{flush();active=list.value;pending=false;input.value='';refresh();if(current())input.value=api.text().slice(current().start,current().end);});
    by('btnTextObjectAdd').addEventListener('click',()=>{flush();if(composing)return;const rows=allTextRecords(),n=rows.length;active='text-'+Date.now().toString(36)+'-'+n;rows.push({id:active,label:n===1?'本文':'注記 '+n,x:n===1?0:580,y:n===1?260:120,scale:n===1?.32:.2,measure:24,ink:'',text:n===1?'本文をここに入力。\n見出しと独立して編集できます。':'注記をここに入力。'});replace(rows);input.value=current()?api.text().slice(current().start,current().end):'';});
    by('btnTextObjectDelete').addEventListener('click',()=>{flush();const o=current();if(!o||composing)return;const rows=allTextRecords().filter(r=>r.id!==o.id);if(!rows.length)rows.push({...o,text:''});active=rows[0].id;replace(rows);input.value=api.text().slice(current().start,current().end);});
    by('btnTextObjectTarget').addEventListener('click',()=>{flush();const o=current();if(o)api.target(o.start,o.end);});
    for(const [key,id] of Object.entries({label:'pTextObjectName',x:'pTextObjectX',y:'pTextObjectY',scale:'pTextObjectScale',measure:'pTextObjectMeasure',ink:'pTextObjectInk'})){
      by(id).addEventListener('change',()=>{flush();const o=current();if(!o)return;api.history();const next=records().map(r=>r.id===o.id?{...r,[key]:['label','ink'].includes(key)?by(id).value:Number(by(id).value)}:r);p.textObjects=JSON.stringify(D.objects(next,api.text()));api.redraw();refresh();});
    }
    by('pTextObjectOwnInk').addEventListener('change',()=>{const o=current();if(!o)return;api.history();p.textObjects=JSON.stringify(records().map(r=>r.id===o.id?{...r,ink:by('pTextObjectOwnInk').checked?by('pTextObjectInk').value:''}:r));api.redraw();refresh();});
    function containers(text,fragment){
      const objects=D.objects(p.textObjects,text),nodes=new Map();
      for(const o of objects){const node=document.createElement('div');node.className='text-object';node.dataset.textObject=o.id;node.setAttribute('aria-label',o.label);fragment.append(node);nodes.set(o.id,node);}
      return {append(node,line){if(!objects.length){fragment.append(node);return;}const o=objects.find(o=>line.sourceStart>=o.start&&(line.sourceStart<o.end||o.start===o.end&&line.sourceStart===o.start||line.sourceStart===o.end&&/[\r\n]/.test(text[o.end-1]||'')));if(o){nodes.get(o.id).append(node);for(const span of node.querySelectorAll('.c'))span.dataset.textObject=o.id;}}};
    }
    function style(){
      const objects=records(),world=by('stageWorld'),cs=getComputedStyle(world),px=parseFloat(cs.paddingLeft)||0,py=parseFloat(cs.paddingTop)||0;
      for(const node of world.querySelectorAll('.text-object')){const o=objects.find(o=>o.id===node.dataset.textObject);if(!o)continue;node.setAttribute('aria-label',o.label);const enabled=!p.gridEnabled;
        Object.assign(node.style,{position:enabled?'absolute':'',left:enabled?(px+o.x)+'px':'',top:enabled?(py+o.y)+'px':'',fontSize:enabled?(p.fontSize*o.scale)+'px':'',letterSpacing:p.letterSpacing+'em',color:o.ink||'',inlineSize:enabled?(o.measure>0?o.measure+'em':p.textMeasure>0?p.textMeasure+'em':'max-content'):'',minInlineSize:'0',textAlign:p.align});
      }
      refresh();
    }
    function shapes(settings,width,fs,amount){
      let fixed=[];try{fixed=JSON.parse(settings.counterSpaces||'[]');}catch{}
      const current={kind:settings.counterShape,x:settings.counterX,y:settings.counterY,w:settings.counterWidth,h:settings.counterHeight};
      return [...fixed.slice(0,7),current].map(s=>({kind:s.kind,x:s.x*width,y:s.y*fs,w:s.w*fs*amount,h:s.h*fs*amount,phase:0}));
    }
    function arrange(items){
      error='';let counterCount=0,concordCount=0,oversized=0,spanning=0;const objects=records(),groups=new Map();
      for(const m of items){m.layoutX=0;m.layoutY=0;m.concordanceScale=1;m.documentOperators=[];m.objectScale=!p.gridEnabled?(objects.find(o=>o.id===m.el.dataset.textObject)?.scale||1):1;m.el.style.removeProperty('--document-x');m.el.style.removeProperty('--document-y');m.el.style.removeProperty('--concordance-scale');const key=m.el.dataset.textObject||'main';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}
      const unsupported=p.vertical?'この2つの組版Operatorは横組み専用です。縦書きの設定は保持しています。':p.gridEnabled?'Grid中は組版Operatorを休止しています。':'';
      if(!unsupported){try{
        if(items.length>16000&&items.some(m=>api.strength(m,'counterspaceFlow')>.001||api.strength(m,'concordanceField')>.001))throw new Error('新しい組版Operatorの上限は1万6千字形です。テキストを分けてください。原文は保持しています。');
        for(const [id,group] of groups){
          const affected=group.filter(m=>api.strength(m,'counterspaceFlow')>.001);if(!affected.length)continue;
          const settings=api.profile(affected[0]),amount=Math.max(...affected.map(m=>api.strength(m,'counterspaceFlow'))),o=objects.find(o=>o.id===id),fs=p.fontSize*(o?.scale||1),width=(o?.measure||p.textMeasure||32)*fs;
          const start=o?.start||0,end=o?.end??api.text().length,source=api.text().slice(start,end),byStart=new Map(group.map(m=>[Number(m.el.dataset.sourceStart),m])),tokens=[];
          const tokenLines=api.tokenize(source);let maxHeight=fs*p.lineHeight;
          for(let li=0;li<tokenLines.length;li++){if(li)tokens.push({break:true});for(const t of [...tokenLines[li]].sort((a,b)=>a.sourceStart-b.sourceStart)){const m=byStart.get(start+t.sourceStart);if(t.space){tokens.push({space:true,text:t.text,width:fs*.33});continue;}if(m){maxHeight=Math.max(maxHeight,m.h);tokens.push({start:Number(m.el.dataset.sourceStart),text:t.text,width:Math.max(.1,m.w)});}}}
          const minX=Math.min(...group.map(m=>m.flowX-m.w/2)),minY=Math.min(...group.map(m=>m.flowY-m.h/2));
          const plan=D.reflow(tokens,{width,line:fs*p.lineHeight/(1+(settings.counterDensity-1)*amount),height:maxHeight,gap:p.paragraphGap*fs,margin:settings.counterChannel*fs*amount,shapes:shapes(settings,width,fs,amount)});
          for(const q of plan.positions){const m=byStart.get(q.start);m.layoutX=minX+q.x+m.w/2-m.flowX;m.layoutY=minY+q.y+m.h/2-m.flowY;m.flowX+=m.layoutX;m.flowY+=m.layoutY;}
          group.forEach(m=>m.documentOperators.push('counterspaceFlow'));counterCount+=plan.rows.length;oversized+=plan.oversized;
        }
        const selected=items.filter(m=>api.strength(m,'concordanceField')>.001);
        if(selected.length){
          const settings=api.profile(selected[0]),amount=settings.concordanceResponse*Math.max(...selected.map(m=>api.strength(m,'concordanceField'))),selectedObjects=new Set(selected.map(m=>m.el.dataset.textObject||'main'));
          const group=items.filter(m=>selectedObjects.has(m.el.dataset.textObject||'main')),matches=D.occurrences(api.text(),String(p.concordanceTerms||'').split(/\r?\n/));
          const plan=D.concordance(group.map(m=>({start:Number(m.el.dataset.sourceStart),end:Number(m.el.dataset.sourceEnd),x:m.flowX-m.w/2,y:m.flowY-m.h/2,w:m.w,line:m.el.dataset.line,object:m.el.dataset.textObject})),matches,{direction:settings.concordanceDirection,axis:settings.concordanceAxis,amount,spacing:settings.concordanceSpacing*p.fontSize*amount,emphasis:settings.concordanceEmphasis});
          const byStart=new Map(group.map(m=>[Number(m.el.dataset.sourceStart),m]));
          for(const q of plan.positions){const m=byStart.get(q.start);m.layoutX+=q.dx;m.layoutY+=q.dy;m.flowX+=q.dx;m.flowY+=q.dy;m.concordanceScale=q.scale;m.el.style.setProperty('--concordance-scale',q.scale.toFixed(6));}
          if(plan.matched)group.forEach(m=>m.documentOperators.push('concordanceField'));concordCount=plan.matched;spanning=plan.spanning;
        }
      }catch(e){error=e.message;}}
      for(const m of items){m.relX=m.flowX;m.relY=m.flowY;if(m.layoutX||m.layoutY){m.el.style.setProperty('--document-x',m.layoutX.toFixed(4)+'px');m.el.style.setProperty('--document-y',m.layoutY.toFixed(4)+'px');}}
      by('counterspaceStatus').textContent=error||unsupported||(counterCount?counterCount+'行に再組版 · 原文順序を保持'+(oversized?' · 長い語を緊急折返し '+oversized+'件':''):'適用すると、対象文字を含むテキストオブジェクト全体を再組版します。');
      by('concordanceStatus').textContent=error||unsupported||(concordCount?concordCount+'箇所の一致'+(spanning?' · 行をまたぐ語句は先頭行を支点に使用 '+spanning+'件':''):'一致する語句がありません。完全一致・大文字小文字を区別します。');
      for(const id of ['counterspaceFlow','concordanceField'])for(const control of document.querySelectorAll('[data-operator-panel="'+id+'"] input, [data-operator-panel="'+id+'"] select'))api.disabled(control.id,'document-layout',!!unsupported);
      api.disabled('pConcordanceAxis','concordance-direction',p.concordanceDirection!=='center');
      const hasPhrase=String(p.concordanceTerms||'').split(/\r?\n/).filter(Boolean).some(term=>api.text().includes(term));
      for(const id of ['pConcordanceResponse','pConcordanceAxis','pConcordanceSpacing','pConcordanceEmphasis'])api.disabled(id,'concordance-source',!hasPhrase);
      by('btnCounterspacePin').disabled=JSON.parse(p.counterSpaces||'[]').length>=7;
      if(error)for(const m of items){m.flowX-=m.layoutX;m.flowY-=m.layoutY;m.relX=m.flowX;m.relY=m.flowY;m.layoutX=m.layoutY=0;m.concordanceScale=1;m.documentOperators=[];m.el.style.removeProperty('--document-x');m.el.style.removeProperty('--document-y');m.el.style.removeProperty('--concordance-scale');}
      preview();
    }
    function preview(){const svg=by('counterspaceMap'),width=Number(current()?.measure||p.textMeasure||32),height=Math.max(14,Math.min(72,p.counterY+p.counterHeight/2+2));svg.setAttribute('viewBox','0 0 '+width+' '+height);svg.replaceChildren();for(const s of shapes(p,width,1,1)){const el=document.createElementNS('http://www.w3.org/2000/svg',s.kind==='ellipse'?'ellipse':s.kind==='river'?'path':'rect');if(s.kind==='ellipse'){for(const [key,val] of Object.entries({cx:s.x,cy:s.y,rx:s.w/2,ry:s.h/2}))el.setAttribute(key,val);}else if(s.kind==='river'){let d='';for(let i=0;i<=40;i++){const y=s.y-s.h/2+s.h*i/40,x=s.x+Math.sin((y-s.y)/s.h*Math.PI*2)*s.w*.65;d+=(i?' L':'M')+x+' '+y;}el.setAttribute('d',d);el.setAttribute('fill','none');el.setAttribute('stroke-width',s.w*.35);}else for(const [key,val] of Object.entries({x:s.x-s.w/2,y:s.y-s.h/2,width:s.w,height:s.h}))el.setAttribute(key,val);svg.append(el);}}
    by('counterspaceMap').addEventListener('click',e=>{const svg=e.currentTarget,pt=svg.createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const local=pt.matrixTransform(svg.getScreenCTM().inverse());api.history();api.setProfile('counterX',Math.max(-.5,Math.min(1.5,local.x/svg.viewBox.baseVal.width)));api.setProfile('counterY',Math.max(-20,Math.min(80,local.y)));api.redraw();});
    by('btnCounterspacePin').addEventListener('click',()=>{let saved;try{saved=JSON.parse(p.counterSpaces);}catch{saved=[];}if(saved.length>=7)return;api.history();saved.push({kind:p.counterShape,x:p.counterX,y:p.counterY,w:p.counterWidth,h:p.counterHeight});p.counterSpaces=JSON.stringify(saved);api.redraw();});
    by('btnCounterspaceClear').addEventListener('click',()=>{api.history();p.counterSpaces='[]';api.redraw();});
    by('pConcordanceTerms').addEventListener('input',()=>{p.concordanceTerms=by('pConcordanceTerms').value.slice(0,4096);api.redraw();});
    return {containers,style,arrange,refresh,flush,records,preview,assertReady(){if(error)throw new Error(error);if(composing)throw new Error('文字変換を確定してください。');},isComposing:()=>composing};
  }
  root.TypeDeformerDocumentEditor={create};
})(typeof globalThis!=='undefined'?globalThis:this);
