(function(root){
  'use strict';
  var queues=new Set();
  function dispose(value){if(!value)return;if(value.layers)Object.values(value.layers).forEach(function(image){if(image&&image.close)image.close();});if(value.bitmap&&value.bitmap.close)value.bitmap.close();if(value.transfers)value.transfers.forEach(function(image){if(image&&image.close)image.close();});}
  // One running request and one replaceable waiting request. Only the newest
  // request may publish a result, including when an older job finishes later.
  function create(options){options=options||{};var worker=null,active=null,waiting=null,desired=null,completed=null,failure=null,sequence=0,disposed=false;
    var counters={submitted:0,completed:0,discarded:0,replaced:0,maxWaiting:0};
    function notify(){if(options.onState)options.onState(status());}
    function ensure(){if(worker)return worker;worker=options.workerFactory?options.workerFactory():new Worker(new URL('surface-worker.js',document.baseURI));
      worker.onmessage=function(event){var message=options.decode?options.decode(event.data):event.data;if(!message)return;if(message.type==='progress'){if(active&&message.id===active.id&&options.onProgress)options.onProgress(message.value);return;}if(message.type!=='result'&&message.type!=='error')return;
        var finished=active;if(!finished||message.id!==finished.id){dispose(message.result);return;}active=null;
        if(desired&&finished.id===desired.id){if(message.type==='error')failure={key:finished.key,message:message.message};else{dispose(completed&&completed.result);completed={key:finished.key,result:message.result};failure=null;counters.completed++;}}
        else{dispose(message.result);counters.discarded++;}
        if(waiting){var next=waiting;waiting=null;launch(next);}notify();
      };
      worker.onerror=function(event){failure={key:desired&&desired.key,message:event.message||'描画Workerを起動できませんでした。'};active=waiting=null;worker.terminate();worker=null;notify();};return worker;
    }
    function launch(job){active=job;counters.submitted++;try{ensure().postMessage(options.encode?options.encode(job):{id:job.id,key:job.key,payload:job.payload});}catch(error){active=null;failure={key:job.key,message:error.message};notify();}}
    function request(key,payload){if(disposed)throw new Error('Render queue is disposed');
      if(desired&&desired.key===key)return status(key);
      var job={id:++sequence,key:key,payload:payload};desired=job;failure=null;
      if(completed&&completed.key===key){waiting=null;notify();return status(key);}
      if(active){if(waiting)counters.replaced++;waiting=job;counters.maxWaiting=1;}else launch(job);notify();return status(key);
    }
    function status(key){key=key==null?desired&&desired.key:key;return {key:key,busy:!!active||!!waiting,ready:!!completed&&completed.key===key,result:completed&&completed.key===key?completed.result:null,error:failure&&failure.key===key?failure.message:null,counters:Object.assign({},counters)};}
    function invalidate(){desired=null;waiting=null;failure=null;notify();}
    function cancel(){if(worker)worker.terminate();worker=null;active=waiting=desired=null;failure=null;notify();}
    function retry(){if(!desired)return;var key=desired.key,payload=desired.payload;cancel();return request(key,payload);}
    function close(){disposed=true;if(worker)worker.terminate();worker=null;active=waiting=desired=null;dispose(completed&&completed.result);completed=null;queues.delete(api);}
    var api={request:request,status:status,invalidate:invalidate,cancel:cancel,retry:retry,dispose:close};queues.add(api);return api;
  }
  root.TypeDeformerRenderJobs={create:create,disposeResult:dispose,inspect:function(){return Array.from(queues).map(function(q){var s=q.status();return {busy:s.busy,ready:s.ready,error:s.error,counters:s.counters,duration:s.result&&s.result.duration,peakBytes:s.result&&s.result.peakBytes,timings:s.result&&s.result.timings};});}};
})(typeof globalThis!=='undefined'?globalThis:this);
