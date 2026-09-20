(function(root){
  'use strict';
  function failure(code,message){var error=new Error(message);error.code=code;return error;}
  function timed(promise,ms){return new Promise(function(resolve,reject){var timer=setTimeout(function(){reject(failure('FONT_TIMEOUT','読み込みが完了しませんでした。Filesで端末にダウンロードしてから、もう一度選択してください。'));},ms);Promise.resolve(promise).then(function(value){clearTimeout(timer);resolve(value);},function(error){clearTimeout(timer);reject(error);});});}
  function readWithReader(file,ms){return new Promise(function(resolve,reject){
    if(typeof root.FileReader!=='function'){reject(failure('FONT_READ','ファイルを読み取れませんでした。Filesで端末に保存してから再選択してください。'));return;}
    var reader=new root.FileReader(),timer=setTimeout(function(){reject(failure('FONT_TIMEOUT','ファイルの読み取りが完了しませんでした。端末にダウンロードしてから再選択してください。'));reader.abort();},ms);
    reader.onload=function(){clearTimeout(timer);resolve(reader.result);};
    reader.onerror=function(){clearTimeout(timer);reject(reader.error||failure('FONT_READ','ファイルを読み取れませんでした。'));};
    reader.onabort=function(){clearTimeout(timer);reject(failure('FONT_READ','ファイルの読み取りを中断しました。もう一度選択してください。'));};
    try{reader.readAsArrayBuffer(file);}catch(error){clearTimeout(timer);reject(error);}
  });}
  async function read(file,options){
    var ms=options&&options.timeout||30000,buffer;
    if(!file||!Number.isFinite(file.size)||file.size<=0)throw failure('FONT_EMPTY','ファイルが空か、まだダウンロードされていません。Filesでファイルを開いてから再選択してください。');
    try{
      if(typeof file.arrayBuffer==='function'){
        try{buffer=await timed(Promise.resolve().then(function(){return file.arrayBuffer();}),ms);}
        catch(error){if(error.code==='FONT_TIMEOUT')throw error;buffer=await readWithReader(file,ms);}
      }else buffer=await readWithReader(file,ms);
    }catch(error){if(error.code)throw error;throw failure('FONT_READ','ファイルを読み取れませんでした。Filesで端末に保存し、再選択してください。');}
    if(!buffer||buffer.byteLength!==file.size)throw failure('FONT_READ','ファイルを最後まで読み取れませんでした。端末にダウンロードしてから再選択してください。');
    return buffer;
  }
  function prepare(buffer){
    var view=new DataView(buffer),size=view.byteLength;
    function span(offset,length){if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>size)throw failure('FONT_FORMAT','フォントのデータが途中で切れているか、壊れています。元のファイルを再取得してください。');}
    function tag(at){span(at,4);return String.fromCharCode(view.getUint8(at),view.getUint8(at+1),view.getUint8(at+2),view.getUint8(at+3));}
    span(0,4);var signature=tag(0);
    if(signature!=='ttcf'){
      if(view.getUint32(0)!==0x00010000&&!['OTTO','true','wOFF','wOF2'].includes(signature))throw failure('FONT_FORMAT','対応するフォントデータではありません。ZIPはFilesで展開し、OTF／TTF／WOFF／WOFF2を選択してください。');
      return {buffer:buffer,collectionCount:1};
    }
    // Collections use absolute table offsets. Rebuild their first face as a
    // standalone sfnt so browsers need not support TTC/OTC as FontFace sources.
    span(0,16);var count=view.getUint32(8);if(!count||count>4096)throw failure('FONT_FORMAT','フォントコレクションの書体数が不正です。');span(12,count*4);
    var base=view.getUint32(12);span(base,12);if(view.getUint32(base)!==0x00010000&&!['OTTO','true'].includes(tag(base)))throw failure('FONT_FORMAT','未対応のコレクション形式です。単体のOTF／TTFを選択してください。');
    var n=view.getUint16(base+4);if(!n||n>512)throw failure('FONT_FORMAT','フォントのテーブル数が不正です。');span(base+12,n*16);
    var tables=[],seen=new Set(),total;
    for(var i=0;i<n;i++){var at=base+12+i*16,name=tag(at),offset=view.getUint32(at+8),length=view.getUint32(at+12);span(offset,length);if(seen.has(name))throw failure('FONT_FORMAT','重複したフォントテーブルがあります。');seen.add(name);if(name!=='DSIG')tables.push({tag:view.getUint32(at),name:name,offset:offset,length:length});}
    if(!tables.length||!seen.has('head'))throw failure('FONT_FORMAT','必要なフォントテーブルがありません。元のファイルを再取得してください。');
    tables.sort(function(a,b){return a.tag-b.tag;});n=tables.length;total=12+n*16;tables.forEach(function(t){t.target=total;total+=Math.ceil(t.length/4)*4;});
    if(total>128*1024*1024)throw failure('FONT_FORMAT','展開後の書体が128 MiBを超えます。単体のOTF／TTFを使用してください。');
    var result=new ArrayBuffer(total),out=new DataView(result),bytes=new Uint8Array(result),power=Math.floor(Math.log2(n)),head;
    out.setUint32(0,view.getUint32(base));out.setUint16(4,n);out.setUint16(6,16*Math.pow(2,power));out.setUint16(8,power);out.setUint16(10,n*16-16*Math.pow(2,power));
    function checksum(start,end){var sum=0;for(var pos=start;pos<end;pos+=4)sum=(sum+out.getUint32(pos))>>>0;return sum;}
    tables.forEach(function(t,index){bytes.set(new Uint8Array(buffer,t.offset,t.length),t.target);if(t.name==='head'){if(t.length<12)throw failure('FONT_FORMAT','headテーブルが壊れています。');head=t.target;out.setUint32(head+8,0);}var at=12+index*16;out.setUint32(at,t.tag);out.setUint32(at+4,checksum(t.target,t.target+Math.ceil(t.length/4)*4));out.setUint32(at+8,t.target);out.setUint32(at+12,t.length);});
    if(head!==undefined)out.setUint32(head+8,(0xB1B0AFBA-checksum(0,total))>>>0);
    return {buffer:result,collectionCount:count};
  }
  async function loadFace(family,buffer,options){
    if(typeof root.FontFace!=='function')throw failure('FONT_UNSUPPORTED','このブラウザでは書体を読み込めません。Safari／Chrome／Edgeを更新してください。');
    try{var face=new root.FontFace(family,buffer);await timed(face.load(),options&&options.timeout||20000);return face;}
    catch(error){if(error.code==='FONT_TIMEOUT')throw error;throw failure('FONT_DECODE','ブラウザがこの書体を読み込めませんでした。壊れていないOTF／TTF／WOFFを再選択してください。');}
  }
  function message(error){return error&&/^FONT_/.test(error.code||'')?error.message:'読み込みを完了できませんでした。同じファイルを再選択するか、別の書体を試してください。';}
  root.TypeDeformerFontLoading={read:read,prepare:prepare,loadFace:loadFace,message:message};
})(typeof globalThis!=='undefined'?globalThis:this);
