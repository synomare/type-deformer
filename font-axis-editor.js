(function(root){
  'use strict';
  function create(api){
    const A=root.TypeDeformerAxes,runtime=A.createRuntime(),fonts=new Map();let optionsKey='',baseKey='',fontKey='';
    const byId=id=>document.getElementById(id),axisSelect=byId('pAxisFieldAxis');
    function current(){const p=api.params(),entry=runtime.find(p.fontFamily);return {p,entry,meta:entry?.meta||{axes:[]}};}
    function format(n){return String(Math.round(n*1000)/1000);}
    function refresh(){
      const {p,entry,meta}=current(),visible=meta.axes.filter(a=>!a.hidden&&a.max>a.min),key=JSON.stringify([p.fontFamily,p.axisFieldAxis,visible]);
      const picker=byId('pAxisFieldFont'),nextFonts=JSON.stringify([[...fonts.keys()],p.fontFamily]);
      if(fontKey!==nextFonts){fontKey=nextFonts;picker.replaceChildren(new Option('読み込んだ可変書体を選択',''));fonts.forEach((label,family)=>picker.add(new Option(label,family)));picker.value=entry?.sourceFamily||'';picker.disabled=!fonts.size;}
      if(entry?.face)p.fontAxesInfo=JSON.stringify({family:entry.sourceFamily,label:entry.label,axes:meta.axes});
      if(key!==optionsKey){
        optionsKey=key;axisSelect.replaceChildren();
        if(!visible.some(a=>a.tag===p.axisFieldAxis)){const o=new Option(visible.length?'保存した軸 '+p.axisFieldAxis+' はこの書体にありません':'可変フォントを読み込んでください',p.axisFieldAxis);o.disabled=true;axisSelect.add(o);}
        visible.forEach(a=>axisSelect.add(new Option(a.name+' · '+a.tag+' ('+format(a.min)+' – '+format(a.max)+')',a.tag)));
      }
      axisSelect.value=p.axisFieldAxis;axisSelect.disabled=!entry?.face||!visible.length;
      const axis=visible.find(a=>a.tag===p.axisFieldAxis),available=!!axis&&!!entry?.face;
      for(const id of ['pAxisFieldFrom','pAxisFieldTo','pAxisFieldDistribution','pAxisFieldCycles','pAxisFieldPhase'])api.disabled(id,'font-axis',!available);
      for(const id of ['pAxisFieldFrom','pAxisFieldTo'])if(axis){const input=byId(id);input.min=axis.min;input.max=axis.max;input.step=(axis.max-axis.min)>=100?'1':'0.001';const definition=root.TypeDeformerParameters?.byControl[id];if(definition){definition.slider.min=axis.min;definition.slider.max=axis.max;definition.slider.step=Number(input.step);definition.domain.min=axis.min;definition.domain.max=axis.max;definition.reason='書体ファイルで定義された実軸の範囲';}}
      api.disabled('pAxisFieldCycles','font-distribution',p.axisFieldDistribution!=='wave'&&p.axisFieldDistribution!=='steps');
      api.disabled('pAxisFieldPhase','font-distribution',p.axisFieldDistribution!=='wave');
      const override=!!entry?.face&&Object.prototype.hasOwnProperty.call(A.rawValues(p.fontAxes),'wght');
      api.disabled('pWeight','font-weight-override',override);
      byId('pWeight').title=override?'Axis Fieldの基準字形にある「太さ」が優先されています。そちらで変更してください。':'';
      byId('axisFieldStatus').textContent=!entry?'SOURCEで可変TTF／OTF／WOFFを読み込んで選択してください。OS内蔵書体の軸情報は取得できません。'
        :entry.reason||(!axis?'この書体に存在する軸を選んでください。':'実軸 '+axis.tag+' · '+format(axis.min)+' ～ '+format(axis.max)+'、既定 '+format(axis.default)+'。原文の先頭から末尾へ割り当てます。');
      const nextBase=JSON.stringify([p.fontFamily,meta.axes,p.fontAxes,p.fontWeight]);
      if(baseKey!==nextBase&&!byId('fontAxesControls').contains(document.activeElement)){
        baseKey=nextBase;const box=byId('fontAxesControls');box.replaceChildren();
        if(available){const note=document.createElement('p');note.className='hint';note.textContent='基準字形：以下は書体全体の座標です。Applyした文字の選択軸だけを上の分布で変奏します。';box.append(note);}
        const values=A.coordinates(meta,p.fontAxes,p.fontWeight);
        for(const a of visible){
          const row=document.createElement('div');row.className='row';const label=document.createElement('label'),input=document.createElement('input'),value=document.createElement('span');
          input.id='font-axis-base-'+a.tag.trim();input.type='range';input.min=a.min;input.max=a.max;input.step=(a.max-a.min)>=100?'1':'0.001';input.value=values[a.tag];input.disabled=!entry?.face;
          label.htmlFor=input.id;label.textContent=a.name+' · '+a.tag;value.className='val';value.textContent=format(values[a.tag]);
          let editing=false;
          input.addEventListener('input',()=>{if(!root.TypeDeformerNumericControls&&!editing){api.history();editing=true;}const raw=A.rawValues(api.params().fontAxes);raw[a.tag]=Number(input.value);api.params().fontAxes=JSON.stringify(raw);value.textContent=format(raw[a.tag]);api.redraw();api.dirty();});
          input.addEventListener('change',()=>{editing=false;});row.append(label,input,value);box.append(row);
          if(root.TypeDeformerNumericControls&&root.TypeDeformerParameters){const key='fontAxes.'+a.tag,definition=root.TypeDeformerParameters.register(input.id,key,a.min,a.max,Number(input.step),false);definition.domain.min=a.min;definition.domain.max=a.max;definition.reason='書体ファイルで定義された実軸の範囲';root.TypeDeformerNumericControls.mount(input,key);input.value=values[a.tag];}
        }
      }
    }
    axisSelect.addEventListener('change',()=>{
      const {p,meta}=current(),a=meta.axes.find(a=>a.tag===axisSelect.value&&!a.hidden);if(!a)return;
      api.history();p.axisFieldAxis=a.tag;api.setProfile('axisFieldFrom',a.min);api.setProfile('axisFieldTo',a.max);refresh();api.controls();api.redraw();api.dirty();
    });
    byId('btnAxisFieldFont').addEventListener('click',api.importFont);
    byId('pAxisFieldFont').addEventListener('change',e=>{if(e.target.value){api.history();api.chooseFont(e.target.value);refresh();api.dirty();}});
    function apply(m,profile){
      const {p,entry,meta}=current();let values={};
      if(entry?.face){
        const position=(m.sourceIndex||0)/Math.max(1,api.metrics().length-1);
        values=A.field(meta,p.fontAxes,{axis:p.axisFieldAxis,from:profile.axisFieldFrom,to:profile.axisFieldTo,distribution:profile.axisFieldDistribution,cycles:profile.axisFieldCycles,phase:profile.axisFieldPhase},position,api.strength(m),p.fontWeight);
      }
      const css=Object.keys(values).length?A.css(values):'';m.fontAxes=Object.keys(values).length?values:null;
      if(m.el.style.fontVariationSettings!==css){m.el.style.fontVariationSettings=css;m.el.style.fontOpticalSizing=css?'none':'';api.measure();}
    }
    return {refresh,apply,font(g,size){return runtime.activate(api.params(),g,size);},
      read(m,style){const {entry,meta,p}=current(),values=A.fromCSS(style.fontVariationSettings);m.fontAxes=entry?.face&&Object.keys(values).length?A.coordinates(meta,values,p.fontWeight):null;},
      assertReady(){const {entry,p}=current();let saved={};try{saved=JSON.parse(p.fontAxesInfo||'{}');}catch{}if((api.metrics().some(m=>api.strength(m)>.002)||saved.family&&p.fontFamily.includes(saved.family))&&!entry?.face)throw Error('Axis Fieldの可変フォントを再読込してください。代替字形では記録・書き出しを行いません。');},
      async register(record){const result=await runtime.register(record);if(result.face)fonts.set(record.family,record.label);refresh();api.redraw();return result;},
      inspect(){const {p,entry}=current();return {family:p.fontFamily,axes:entry?.meta.axes||[],reason:entry?.reason||'',ready:!!entry?.face};},
      dispose:runtime.dispose};
  }
  root.TypeDeformerAxisEditor={create};
})(typeof globalThis!=='undefined'?globalThis:this);
