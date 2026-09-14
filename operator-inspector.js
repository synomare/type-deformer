(function(root){
  'use strict';
  function create(api){
    const node=document.getElementById('glyphOperatorInspector'),summary=node.querySelector('summary'),list=node.querySelector('[data-glyph-operators]'),anchor=document.getElementById('glyphOperatorInlineAnchor');
    let signature='',selection='';
    function place(){
      const docked=matchMedia('(max-width:760px)').matches&&api.sheetOpen();
      const target=docked?anchor:document.body;if(node.parentNode!==target)target.appendChild(node);node.dataset.docked=String(docked);
    }
    function update(metric,mode,ids,active){
      node.hidden=!metric||!['edit','grid'].includes(mode);if(node.hidden){signature='';return;}
      const key=metric.sourceIndex+':'+metric.el.dataset.sourceStart, text=metric.el.dataset.sourceText||metric.el.textContent;
      if(key!==selection){selection=key;node.open=true;}
      summary.textContent='「'+text+'」のOperator · '+ids.length+(metric.locked?' · 固定中':'');
      const next=key+':'+ids.join(',');
      if(signature!==next){
        signature=next;list.replaceChildren();
        if(!ids.length){const p=document.createElement('p');p.textContent='この文字には効果が適用されていません。';list.append(p);}
        for(const id of ids){const b=document.createElement('button');b.type='button';b.dataset.glyphOperator=id;b.textContent=api.label(id)+' →';b.title='このOperatorのパラメーターへ';list.append(b);}
      }
      for(const b of list.querySelectorAll('button'))b.setAttribute('aria-current',String(b.dataset.glyphOperator===active));
      place();
    }
    list.addEventListener('click',e=>{const b=e.target.closest('[data-glyph-operator]');if(b)api.jump(b.dataset.glyphOperator);});
    node.addEventListener('pointerdown',e=>e.stopPropagation());
    window.addEventListener('resize',place);
    return {update,place};
  }
  root.TypeDeformerOperatorInspector={create};
})(typeof globalThis!=='undefined'?globalThis:this);
