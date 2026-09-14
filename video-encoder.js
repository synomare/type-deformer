(function(root){
  'use strict';
  var library;
  function available(){return typeof VideoEncoder!=='undefined'&&typeof VideoFrame!=='undefined';}
  async function create(canvas,options){
    if(!available())throw new Error('高品質動画にはWebCodecs対応ブラウザが必要です。ChromeまたはEdgeで開いてください。');
    library=library||import('./assets/vendor/mediabunny-1.56.1.mjs');
    var M=await library,mp4=options.format==='mp4',codec=mp4?'avc':'vp9',quality=new M.Quality({bitrate:options.bitrate}),bytes=0,frames=0,closed=false;
    if(!await M.canEncodeVideo(codec,{width:canvas.width,height:canvas.height,quality:quality}))throw new Error('このブラウザでは指定サイズの'+(mp4?'MP4':'WebM')+'を符号化できません。形式またはFrameサイズを変更してください。');
    var output=new M.Output({format:mp4?new M.Mp4OutputFormat({fastStart:'in-memory'}):new M.WebMOutputFormat(),target:new M.BufferTarget()});
    var source=new M.CanvasSource(canvas,{codec:codec,quality:quality,keyFrameInterval:2,latencyMode:'quality',onEncodedPacket:function(packet){bytes+=packet.byteLength;if(bytes>(options.memoryBudget||192*1024*1024))throw new Error('動画データが作業メモリ予算を超えました。長さまたはFrameサイズを調整してください。設定値は保持されています。');}});
    output.addVideoTrack(source,{frameRate:options.fps});await output.start();
    return {async add(index){if(closed)throw new Error('動画生成は終了しています。');await source.add(index/options.fps,1/options.fps);frames++;},
      async finish(){if(closed)throw new Error('動画生成は終了しています。');source.close();await output.finalize();closed=true;return {blob:new Blob([output.target.buffer],{type:mp4?'video/mp4':'video/webm'}),frames:frames};},
      async cancel(){if(closed)return;closed=true;await output.cancel();},inspect:function(){return {frames:frames,bytes:bytes,closed:closed};}};
  }
  root.TypeDeformerVideoEncoder={available:available,create:create};
})(typeof globalThis!=='undefined'?globalThis:this);
