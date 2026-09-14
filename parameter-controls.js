(function(root){
  'use strict';
  var entries=new WeakMap(),active=new Set(),serial=0,options={};
  var nativeValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  function finishPointers(){Array.from(active).forEach(function(entry){if(entry.pointer&&entry.endPointer)entry.endPointer();});}
  root.addEventListener('pointerup',finishPointers);root.addEventListener('pointercancel',finishPointers);
  function editing(){return active.size>0;}
  function mount(input,key,initialValue){
    if(entries.has(input))return entries.get(input);
    var model=root.TypeDeformerParameters,d=model.byControl[input.id];
    key=key||(d&&d.key)||input.id||'numeric-'+(++serial);
    if(!d)d=model.register(input.id||key,key,input.min||0,input.max||100,input.step||1,false);
    var initial=initialValue==null?nativeValue.get.call(input):String(initialValue);
    nativeValue.set.call(input,initial);
    var entry={input:input,key:key,value:initial,editing:false,pointer:false,committing:false};
    entries.set(input,entry);
    var box=document.createElement('input');box.type='text';box.inputMode='decimal';box.className='parameter-number';box.id=(input.id||key)+'Number';box.value=initial;box.autocomplete='off';box.spellcheck=false;
    var label=input.getAttribute('aria-label')||(input.labels&&input.labels[0]&&input.labels[0].textContent.trim())||input.closest('.row')?.querySelector('label')?.textContent.trim()||key;
    box.setAttribute('aria-label',label+' 数値');box.dataset.parameterCompanion='1';
    var message=document.createElement('span');message.id=box.id+'Error';message.className='parameter-number-error';message.hidden=true;message.setAttribute('role','status');box.setAttribute('aria-describedby',message.id);
    input.insertAdjacentElement('afterend',box);box.insertAdjacentElement('afterend',message);entry.box=box;entry.message=message;
    function sync(){if(!entry.editing){box.value=entry.value;box.setAttribute('aria-invalid','false');message.hidden=true;}box.disabled=input.disabled;input.setAttribute('aria-valuetext',entry.value);}
    // Preserve the logical number separately from the native range thumb. All
    // existing handlers continue to use .value, including Compose and steppers.
    Object.defineProperty(input,'value',{configurable:true,get:function(){return entry.value;},set:function(v){
      if((entry.pointer||entry.editing)&&!entry.committing)return;
      entry.value=String(v);nativeValue.set.call(input,String(v));sync();
    }});
    input.addEventListener('input',function(event){if(!entry.committing){entry.value=nativeValue.get.call(input);sync();}if(options.onEdit)options.onEdit();},true);
    function start(event){if(event.type==='pointerdown'&&!event.isTrusted)return;entry.pointer=true;active.add(entry);}
    function end(){if(!entry.pointer)return;entry.pointer=false;active.delete(entry);if(options.onEnd)options.onEnd(input);sync();}
    input.addEventListener('pointerdown',start);
    entry.endPointer=end;
    input.addEventListener('keydown',function(e){if(/^(Arrow|Home|End|Page)/.test(e.key))start(e);});
    input.addEventListener('keyup',end);input.addEventListener('blur',end);
    input.addEventListener('change',end);
    box.addEventListener('focus',function(){entry.editing=true;active.add(entry);});
    function commit(){if(!entry.editing)return true;
      var result=model.validate(key,box.value);
      if(!result.ok){box.setAttribute('aria-invalid','true');message.textContent=result.reason;message.hidden=false;return false;}
      var changed=String(result.value)!==entry.value;
      if(changed&&options.begin)options.begin(input);
      entry.committing=true;entry.editing=false;active.delete(entry);input.value=String(result.value);
      if(changed){input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
      entry.committing=false;sync();if(options.onEnd)options.onEnd(input);return true;
    }
    box.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();e.stopPropagation();if(commit())box.blur();}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();entry.editing=false;active.delete(entry);sync();box.blur();}});
    box.addEventListener('blur',function(){if(!commit()){entry.editing=false;active.delete(entry);/* Keep the rejected text and reason until the next edit. */}if(options.onEnd)options.onEnd(input);});
    new MutationObserver(sync).observe(input,{attributes:true,attributeFilter:['disabled']});
    entry.sync=sync;return entry;
  }
  function mountNumber(input,key,initialValue){
    if(entries.has(input))return entries.get(input);var d=TypeDeformerParameters.byControl[input.id];if(!d)return;
    if(initialValue!=null)nativeValue.set.call(input,String(initialValue));
    var entry={input:input,box:input,key:key||d.key,value:input.value,editing:false,committing:false};entries.set(input,entry);
    input.type='text';input.inputMode='decimal';input.autocomplete='off';input.spellcheck=false;
    var message=document.createElement('span');message.id=input.id+'Error';message.className='parameter-number-error';message.hidden=true;message.setAttribute('role','status');input.setAttribute('aria-describedby',message.id);input.insertAdjacentElement('afterend',message);entry.message=message;
    Object.defineProperty(input,'value',{configurable:true,get:function(){return nativeValue.get.call(input);},set:function(v){if(entry.editing&&!entry.committing)return;entry.value=String(v);nativeValue.set.call(input,String(v));}});
    function clear(){input.setAttribute('aria-invalid','false');message.hidden=true;}
    function end(){entry.editing=false;active.delete(entry);if(options.onEnd)options.onEnd(input);}
    function commit(){if(!entry.editing)return true;var result=TypeDeformerParameters.validate(entry.key,nativeValue.get.call(input));
      if(!result.ok){input.setAttribute('aria-invalid','true');message.textContent=result.reason;message.hidden=false;return false;}
      var changed=String(result.value)!==entry.value;if(changed&&options.begin)options.begin(input);
      entry.committing=true;entry.editing=false;active.delete(entry);input.value=result.value;
      if(changed){input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
      entry.committing=false;clear();end();return true;
    }
    input.addEventListener('focus',function(){entry.editing=true;active.add(entry);});
    ['input','change'].forEach(function(type){input.addEventListener(type,function(event){if(!entry.committing)event.stopImmediatePropagation();},true);});
    input.addEventListener('keydown',function(event){if(event.key==='Enter'){event.preventDefault();event.stopPropagation();if(commit())input.blur();}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();nativeValue.set.call(input,entry.value);clear();end();input.blur();}});
    input.addEventListener('blur',function(){if(!commit())end();});entry.sync=function(){};return entry;
  }
  function configuredValue(values,input,key){
    if(typeof values==='function')return values(input,key);
    if(values&&Object.prototype.hasOwnProperty.call(values,key))return values[key];
    return undefined;
  }
  function install(container,values){
    container.querySelectorAll('input[type="range"]').forEach(function(input){var d=root.TypeDeformerParameters.byControl[input.id],key=d&&d.key;mount(input,key,configuredValue(values,input,key));});
    container.querySelectorAll('input[type="number"]').forEach(function(input){var d=root.TypeDeformerParameters.byControl[input.id],key=d&&d.key;mountNumber(input,key,configuredValue(values,input,key));});
  }
  root.TypeDeformerNumericControls={configure:function(config){options=config||{};},mount:mount,mountNumber:mountNumber,install:install,editing:editing,set:function(input,value){var e=entries.get(input);if(!e)return;var v=TypeDeformerParameters.validate(e.key,value);if(!v.ok)return;if(options.begin)options.begin(input);e.committing=true;input.value=v.value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));e.committing=false;if(options.onEnd)options.onEnd(input);},entry:function(input){return entries.get(input);}};
})(window);
