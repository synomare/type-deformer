(function(root){
  'use strict';
  var library,MiB=1024*1024;
  function available(){return typeof VideoEncoder!=='undefined'&&typeof VideoFrame!=='undefined';}
  function error(message,code){return Object.assign(new Error(message),{code:code});}
  function plan(canvas,options){
    options=options||{};
    if(!canvas||!Number.isSafeInteger(canvas.width)||!Number.isSafeInteger(canvas.height)||canvas.width<1||canvas.height<1)throw error('動画Frameの寸法が不正です。','VIDEO_OPTIONS_INVALID');
    if(!['mp4','webm'].includes(options.format)||!Number.isFinite(options.fps)||options.fps<=0||!Number.isFinite(options.bitrate)||options.bitrate<=0)throw error('動画の形式、FPS、bitrateを確認してください。','VIDEO_OPTIONS_INVALID');
    if(options.expectedFrames!=null&&(!Number.isSafeInteger(options.expectedFrames)||options.expectedFrames<1))throw error('動画Frame数が不正です。','VIDEO_OPTIONS_INVALID');
    var budget=options.memoryBudget==null?(root.TypeDeformerRenderContext?root.TypeDeformerRenderContext.budgets.videoBytes:512*MiB):options.memoryBudget;
    if(!Number.isFinite(budget)||budget<=0)throw error('動画メモリ予算が不正です。','VIDEO_OPTIONS_INVALID');
    // Canvas, encoder input and one in-flight frame; BufferTarget growth,
    // final Blob and (for MP4) fast-start sample storage coexist at finalize.
    var fixedBytes=canvas.width*canvas.height*12+16*MiB,copies=options.format==='mp4'?4:3;
    var expectedBytes=options.expectedFrames==null?0:Math.ceil(options.bitrate/8*options.expectedFrames/options.fps);
    var requiredBytes=fixedBytes+expectedBytes*copies;
    if(requiredBytes>budget)throw error('動画の推定ピークメモリ '+Math.ceil(requiredBytes/MiB)+' MB が予算 '+Math.round(budget/MiB)+' MB を超えます。長さまたはFrameサイズを調整してください。設定値は保持されています。','VIDEO_MEMORY_EXCEEDED');
    return {budget:budget,fixedBytes:fixedBytes,copies:copies,expectedBytes:expectedBytes,estimatedPeakBytes:requiredBytes,maxEncodedBytes:Math.floor((budget-fixedBytes)/copies)};
  }
  async function create(canvas,options){
    options=Object.assign({},options);
    if(!available())throw error('高品質動画にはWebCodecs対応ブラウザが必要です。ChromeまたはEdgeで開いてください。','VIDEO_CODEC_UNAVAILABLE');
    if(options&&options.signal&&options.signal.aborted)throw error('動画生成を取り消しました。','RENDER_CANCELLED');
    var memory=plan(canvas,options),R=root.TypeDeformerRenderContext,lease=null,output=null,source=null,target=null;
    var bytes=0,frames=0,state='preparing',sourceClosed=false,busy=false,finishPromise=null,cancelPromise=null,cancelled=false;
    var width=canvas.width,height=canvas.height;
    var mp4=options.format==='mp4',codec=mp4?'avc':'vp9';
    function checkCancellation(){if(cancelled)throw error('動画生成を取り消しました。','RENDER_CANCELLED');}
    function assertActive(){if(cancelled)throw error('動画生成を取り消しました。','RENDER_CANCELLED');if(state!=='ready')throw error('動画生成は終了しています。','VIDEO_CLOSED');}
    function closeSource(){if(source&&!sourceClosed){sourceClosed=true;source.close();}}
    function release(){output=source=target=null;if(lease){lease.release();lease=null;}if(options.signal)options.signal.removeEventListener('abort',onAbort);}
    function checkMemory(encoded){if(encoded>memory.maxEncodedBytes)throw error('動画データの推定ピークメモリが予算 '+Math.round(memory.budget/MiB)+' MB を超えました。長さまたはFrameサイズを調整してください。設定値は保持されています。','VIDEO_MEMORY_EXCEEDED');}
    async function abort(){try{closeSource();}finally{try{if(output)await output.cancel();}finally{release();}}}
    function cancelJob(){
      if(cancelPromise)return cancelPromise;
      if(state==='finished'||state==='failed'||state==='cancelled')return Promise.resolve();
      cancelled=true;state='cancelled';
      // The muxer cannot interrupt finalize. Keep its lease until it settles;
      // a cancellation during codec preparation has no output to retain.
      cancelPromise=finishPromise?finishPromise.then(function(){},function(){}):abort();return cancelPromise;
    }
    function onAbort(){cancelJob().catch(function(){});}
    if(options.signal)options.signal.addEventListener('abort',onAbort,{once:true});
    try{
      if(R&&R.resources)lease=R.resources.reserve('video',memory.budget,true);
      library=library||import('./assets/vendor/mediabunny-1.56.1.mjs');
      var M=await library;checkCancellation();var quality=new M.Quality({bitrate:options.bitrate});
      var supported=await M.canEncodeVideo(codec,{width:canvas.width,height:canvas.height,quality:quality});checkCancellation();
      if(!supported)throw error('このブラウザでは指定サイズの'+(mp4?'MP4':'WebM')+'を符号化できません。形式またはFrameサイズを変更してください。','VIDEO_CODEC_UNAVAILABLE');
      target=new M.BufferTarget();
      output=new M.Output({format:mp4?new M.Mp4OutputFormat({fastStart:'in-memory'}):new M.WebMOutputFormat(),target:target});
      source=new M.CanvasSource(canvas,{codec:codec,quality:quality,keyFrameInterval:2,latencyMode:'quality',onEncodedPacket:function(packet){bytes+=packet.byteLength;checkMemory(bytes);}});
      output.addVideoTrack(source,{frameRate:options.fps});await output.start();checkCancellation();state='ready';
    }catch(failure){state=cancelled?'cancelled':'failed';try{await abort();}catch(cleanupError){/* preserve the codec/allocation failure */}if(cancelled)throw error('動画生成を取り消しました。','RENDER_CANCELLED');throw failure;}
    return {
      resourceGroup:lease&&lease.group,
      async add(index){
        assertActive();if(busy)throw error('前のFrameの符号化完了を待ってください。','VIDEO_FRAME_BUSY');
        if(!Number.isSafeInteger(index)||index!==frames||options.expectedFrames!=null&&index>=options.expectedFrames)throw error('動画Frameは0から順番に追加してください。','VIDEO_FRAME_SEQUENCE');
        busy=true;
        try{if(canvas.width!==width||canvas.height!==height)throw error('動画Frameの寸法が途中で変わったため停止しました。','VIDEO_FRAME_CHANGED');await source.add(index/options.fps,1/options.fps);assertActive();frames++;}
        catch(failure){if(!cancelled){state='failed';try{await abort();}catch(cleanupError){/* preserve encoder error */}}throw failure;}
        finally{busy=false;}
      },
      finish(){
        if(finishPromise)return finishPromise;
        try{assertActive();if(busy)throw error('符号化中のFrameが残っています。','VIDEO_FRAME_BUSY');if(options.expectedFrames!=null&&frames!==options.expectedFrames)throw error('予定したFrame数に達していないため動画を保存できません。','VIDEO_FRAME_COUNT');}
        catch(failure){return Promise.reject(failure);}
        state='finalizing';
        finishPromise=(async function(){
          try{
            closeSource();await output.finalize();
            if(cancelled)throw error('動画生成を取り消しました。','RENDER_CANCELLED');
            if(!target.buffer)throw error('動画ファイルを確定できませんでした。','VIDEO_FINALIZE_FAILED');
            checkMemory(Math.max(bytes,target.buffer.byteLength));
            var blob=new Blob([target.buffer],{type:mp4?'video/mp4':'video/webm'});state='finished';return {blob:blob,frames:frames};
          }catch(failure){state=cancelled?'cancelled':'failed';try{if(output)await output.cancel();}catch(cleanupError){/* preserve finalize error */}throw failure;}
          finally{release();}
        })();return finishPromise;
      },
      cancel:cancelJob,
      inspect:function(){return {frames:frames,bytes:bytes,closed:state!=='ready',state:state,estimatedPeakBytes:memory.fixedBytes+bytes*memory.copies,memoryBudget:memory.budget,reserved:!!lease};}
    };
  }
  root.TypeDeformerVideoEncoder={available:available,plan:plan,create:create};
})(typeof globalThis!=='undefined'?globalThis:this);
