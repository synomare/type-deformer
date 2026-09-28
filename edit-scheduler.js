(function(root){
  'use strict';
  // State and numeric feedback update immediately. Expensive visual callbacks
  // run once per frame; commits and snapshot readers flush them synchronously.
  function create(requestFrame,cancelFrame){
    var pending=new Set(),frame=null,flushing=false;
    function flush(){
      if(flushing)return;
      if(frame!==null){cancelFrame(frame);frame=null;}
      flushing=true;var failure=null;
      try{
        while(pending.size){
          var callbacks=Array.from(pending);pending.clear();
          for(var callback of callbacks){try{callback();}catch(error){if(!failure)failure=error;}}
        }
      }finally{flushing=false;}
      if(failure)throw failure;
    }
    function schedule(callback){
      pending.add(callback);
      if(frame===null&&!flushing)frame=requestFrame(function(){frame=null;flush();});
    }
    function cancel(){if(frame!==null)cancelFrame(frame);frame=null;pending.clear();}
    return {schedule:schedule,flush:flush,cancel:cancel,pending:function(){return pending.size;}};
  }
  root.TypeDeformerEditScheduler=create(root.requestAnimationFrame.bind(root),root.cancelAnimationFrame.bind(root));
  root.TypeDeformerEditScheduler.create=create;
})(typeof globalThis!=='undefined'?globalThis:this);
