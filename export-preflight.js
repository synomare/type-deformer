(function(root){
  'use strict';
  function finite(value,fallback){value=Number(value);return Number.isFinite(value)?value:fallback;}
  function formatBytes(value){
    if(value<1024*1024)return Math.max(1,Math.round(value/1024))+' KB';
    return (value/(1024*1024)).toFixed(value<10*1024*1024?1:0)+' MB';
  }
  function evaluate(input){
    input=input||{};var width=Math.round(finite(input.width,0)),height=Math.round(finite(input.height,0));
    var mode=input.mode==='video'?'video':'image',format=String(input.format||'png').toUpperCase();
    var blockers=[],warnings=[],items=[];
    if(width<1||height<1)blockers.push('出力サイズを計算できません。');
    if(width>16384||height>16384||width*height>67108864)blockers.push('出力サイズがブラウザの安全上限を超えています。');
    items.push({label:'形式',value:format});
    items.push({label:'実寸',value:Math.max(0,width)+' × '+Math.max(0,height)+' px'});
    items.push({label:'範囲',value:String(input.region||'作品全体')});
    if(mode==='image'){
      items.push({label:'背景',value:input.transparent?'透明':'紙色あり'});
      if(format==='SVG'&&input.hasRasterSurface)warnings.push('この作品のSVGにはRaster画像が埋め込まれます。');
    }else{
      var fps=Math.max(1,Math.round(finite(input.fps,24))),duration=Math.max(0,finite(input.duration,0));
      var frames=Math.max(1,Math.round(fps*duration));
      var bitrate=Math.max(0,finite(input.bitrate,0)),workingBytes=Math.max(0,width*height*4*3+bitrate*duration/8);
      var memoryBudget=Math.max(1,finite(input.memoryBudget,root.TypeDeformerRenderContext?root.TypeDeformerRenderContext.budgets.videoBytes:512*1024*1024));
      items.push({label:'Frame',value:frames+' frames · '+fps+' fps'});
      items.push({label:'作業メモリ目安',value:formatBytes(workingBytes)});
      if(!input.compositionEnabled)blockers.push('先にComposeをApplyしてください。');
      if(!input.videoAvailable)blockers.push('動画出力には現行ChromeまたはEdgeが必要です。');
      if(workingBytes>memoryBudget)blockers.push('推定メモリが'+formatBytes(memoryBudget)+'の作業予算を超えています。Frameサイズまたは長さを下げてください。');
    }
    return {status:blockers.length?'blocked':warnings.length?'warning':'ready',items:items,blockers:blockers,warnings:warnings};
  }
  root.TypeDeformerExportPreflight={evaluate:evaluate,formatBytes:formatBytes};
})(typeof globalThis!=='undefined'?globalThis:this);
