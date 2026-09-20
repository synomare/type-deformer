(function(root){
  'use strict';
  var queues=new Set();
  function dispose(value){if(!value)return;if(value.layers)Object.values(value.layers).forEach(function(image){if(image&&image.close)image.close();});if(value.bitmap&&value.bitmap.close)value.bitmap.close();if(value.transfers)value.transfers.forEach(function(image){if(image&&image.close)image.close();});}
  // One running request and one replaceable waiting request. Only the newest
  // request may publish a result, including when an older job finishes later.
  function supportsSurfaceWorker(){
    if(typeof root.Worker!=='function'||typeof root.OffscreenCanvas!=='function'||typeof root.FontFace!=='function')return false;
    try{return !!new root.OffscreenCanvas(1,1).getContext('2d');}catch(error){return false;}
  }
  function create(options){
    options=options||{};
    var worker=null,active=null,waiting=null,desired=null,completed=null,failure=null,sequence=0,disposed=false,interruptTimer=null,deadlineTimer=null;
    var knownFonts=new Map();
    var counters={submitted:0,completed:0,discarded:0,replaced:0,maxWaiting:0,interrupted:0};
    function notify(){if(options.onState)options.onState(status());}
    function clearInterrupt(){if(interruptTimer!==null){clearTimeout(interruptTimer);interruptTimer=null;}}
    function clearDeadline(){if(deadlineTimer!==null){clearTimeout(deadlineTimer);deadlineTimer=null;}}
    function stopWorker(){clearInterrupt();clearDeadline();if(worker)worker.terminate();worker=null;knownFonts.clear();}
    function editable(job){return job&&job.payload&&job.payload.purpose==='edit';}
    function armInterrupt(){
      // Input invalidation can abandon obsolete work. Animation alone must not
      // continually restart a slow frame, and proof/export jobs must finish.
      if(!options.interruptAfter||interruptTimer!==null||!active||!active.invalidated||!editable(active)||!editable(waiting))return;
      interruptTimer=setTimeout(function(){
        interruptTimer=null;
        if(disposed||!active||!active.invalidated||!editable(active)||!editable(waiting))return;
        var next=waiting;waiting=null;stopWorker();active=null;counters.interrupted++;counters.discarded++;launch(next);notify();
      },options.interruptAfter);
    }
    function ensure(){
      if(worker)return worker;
      var instance=options.workerFactory?options.workerFactory():new Worker(new URL('surface-worker.js',document.baseURI));worker=instance;
      instance.onmessage=function(event){
        var message=options.decode?options.decode(event.data):event.data;if(!message)return;
        if(instance!==worker||disposed){dispose(message.result);return;}
        if(message.type==='progress'){if(active&&message.id===active.id&&desired===active&&options.onProgress)options.onProgress(message.value);return;}
        if(message.type!=='result'&&message.type!=='error')return;
        var finished=active;if(!finished||message.id!==finished.id){dispose(message.result);return;}
        active=null;clearInterrupt();clearDeadline();
        // A result acknowledges successful font loading, even if its image is
        // obsolete. Keep caller-owned buffers intact; never transfer them.
        if(options.cacheFonts&&message.type==='result')for(var font of finished.sentFonts||[])knownFonts.set(font.family,font.buffer);
        if(desired&&finished.id===desired.id){
          if(message.type==='error')failure={key:finished.key,message:message.message};
          else{dispose(completed&&completed.result);completed={key:finished.key,result:message.result};failure=null;counters.completed++;}
        }else{dispose(message.result);counters.discarded++;}
        if(waiting){var next=waiting;waiting=null;launch(next);}notify();
      };
      instance.onerror=function(event){
        if(instance!==worker||disposed)return;
        var finished=active,next=waiting;active=waiting=null;stopWorker();
        if(next)launch(next);
        else if(finished&&desired===finished)failure={key:finished.key,message:event.message||'描画Workerを起動できませんでした。'};
        notify();
      };
      return instance;
    }
    function launch(job){
      active=job;counters.submitted++;
      if(options.editTimeout&&editable(job))deadlineTimer=setTimeout(function(){
        if(active!==job||disposed)return;
        var next=waiting;
        if(next&&!editable(next)){stopWorker();active=waiting=null;counters.interrupted++;launch(next);notify();return;}
        var message='描画が時間上限を超えたため停止しました。設定を軽くしてから描画を再開してください。';
        stopWorker();active=waiting=null;failure={key:job.key,message:message};counters.interrupted++;
        notify();if(options.onTimeout)options.onTimeout(message);
      },options.editTimeout);
      try{
        var instance=ensure(),messageJob=job;
        if(options.cacheFonts&&job.payload&&job.payload.fonts){
          job.sentFonts=job.payload.fonts.filter(function(font){return knownFonts.get(font.family)!==font.buffer;});
          messageJob=Object.assign({},job,{payload:Object.assign({},job.payload,{fonts:job.sentFonts})});
        }
        instance.postMessage(options.encode?options.encode(messageJob):{id:job.id,key:job.key,payload:messageJob.payload});
      }catch(error){clearDeadline();active=null;failure={key:job.key,message:error.message};notify();}
    }
    function request(key,payload){
      if(disposed)throw new Error('Render queue is disposed');
      if(desired&&desired.key===key)return status(key);
      failure=null;
      if(active&&active.key===key){desired=active;active.invalidated=false;waiting=null;clearInterrupt();notify();return status(key);}
      var job={id:++sequence,key:key,payload:payload};desired=job;
      if(completed&&completed.key===key){waiting=null;clearInterrupt();if(active&&active.invalidated&&editable(active)&&editable(job)){stopWorker();active=null;counters.interrupted++;counters.discarded++;}notify();return status(key);}
      if(active){if(waiting)counters.replaced++;waiting=job;counters.maxWaiting=1;armInterrupt();}else launch(job);
      notify();return status(key);
    }
    function status(key){key=key==null?desired&&desired.key:key;return {key:key,busy:!!active||!!waiting,ready:!!completed&&completed.key===key,result:completed&&completed.key===key?completed.result:null,error:failure&&failure.key===key?failure.message:null,counters:Object.assign({},counters)};}
    function invalidate(){desired=null;waiting=null;failure=null;if(active)active.invalidated=true;notify();}
    function cancel(){if(!worker&&!active&&!waiting&&!desired&&!completed&&!failure)return;stopWorker();active=waiting=desired=null;failure=null;dispose(completed&&completed.result);completed=null;notify();}
    function cancelEditing(){if([active,waiting,desired].some(function(job){return job&&!editable(job);}))return;cancel();}
    function retry(){if(!desired)return;var key=desired.key,payload=desired.payload;cancel();return request(key,payload);}
    function close(){disposed=true;stopWorker();active=waiting=desired=null;dispose(completed&&completed.result);completed=null;queues.delete(api);}
    var api={request:request,status:status,invalidate:invalidate,cancel:cancel,cancelEditing:cancelEditing,retry:retry,dispose:close};queues.add(api);return api;
  }
  root.TypeDeformerRenderJobs={supportsSurfaceWorker:supportsSurfaceWorker,create:create,disposeResult:dispose,inspect:function(){return Array.from(queues).map(function(q){var s=q.status();return {busy:s.busy,ready:s.ready,error:s.error,counters:s.counters,duration:s.result&&s.result.duration,peakBytes:s.result&&s.result.peakBytes,resultBytes:s.result&&s.result.resultBytes,cacheBytes:s.result&&s.result.cacheBytes,workBudget:s.result&&s.result.workBudget,timings:s.result&&s.result.timings};});}};
})(typeof globalThis!=='undefined'?globalThis:this);
