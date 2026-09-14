(function(root){
  'use strict';
  var key='typeDeformer.previewQuality.v1',mode='standard',proof=false,last=0;
  try{if(localStorage.getItem(key)==='low')mode='low';}catch(error){}
  function density(width,height,dpr){return mode==='low'?Math.min(.65,dpr,Math.sqrt(1000000/Math.max(1,width*height))):Math.min(2,dpr);}
  function throttle(now){if(mode!=='low'||!Number.isFinite(now))return false;if(now-last<66)return true;last=now;return false;}
  function mount(options){var select=document.getElementById('previewQuality'),button=document.getElementById('btnHighQualityCheck');select.value=mode;
    select.addEventListener('change',function(){mode=select.value==='low'?'low':'standard';proof=false;last=0;try{localStorage.setItem(key,mode);}catch(error){}options.redraw();});
    button.addEventListener('click',function(){proof=true;options.proof();});
  }
  root.TypeDeformerPreview={mode:function(){return mode;},density:density,throttle:throttle,mount:mount,isProof:function(){return proof;},edit:function(){proof=false;},finishProof:function(){proof=false;}};
})(window);
