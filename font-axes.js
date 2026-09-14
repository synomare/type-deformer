(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const labels = { wght: '太さ', wdth: '字幅', slnt: '傾斜', ital: 'イタリック', opsz: '光学サイズ' };
  const tagAt = (v, at) => String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
  function reader(buffer) {
    const v = new DataView(buffer);
    function span(at, size) { if (!Number.isSafeInteger(at) || !Number.isSafeInteger(size) || at < 0 || size < 0 || at + size > v.byteLength) throw Error('フォントのテーブル範囲が壊れています。'); return at; }
    return { v, span };
  }
  function names(buffer) {
    const out = new Map(); if (!buffer) return out;
    const {v,span} = reader(buffer);span(0,6);
    const count=v.getUint16(2),strings=v.getUint16(4);span(6,count*12);
    for(let i=0;i<count;i++) {
      const at=6+i*12,platform=v.getUint16(at),language=v.getUint16(at+4),id=v.getUint16(at+6),length=v.getUint16(at+8),offset=strings+v.getUint16(at+10);
      span(offset,length); if(platform!==0&&platform!==3)continue;
      let text='';for(let j=0;j+1<length;j+=2)text+=String.fromCharCode(v.getUint16(offset+j));
      text=text.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,100);
      const score=language===0x409?3:platform===0?2:1;
      if(text&&(!out.has(id)||out.get(id).score<score))out.set(id,{text,score});
    }
    return out;
  }
  function parseTables(tables) {
    if(!tables.fvar)return {axes:[],reason:'この書体には可変軸（fvar）がありません。通常の字形として使えます。'};
    const {v,span}=reader(tables.fvar);span(0,16);
    if(v.getUint16(0)!==1)throw Error('未対応のfvarバージョンです。');
    const offset=v.getUint16(4),count=v.getUint16(8),size=v.getUint16(10);
    if(count>64||size<20||offset<16)throw Error('可変軸の定義が不正か、64軸の上限を超えています。');
    span(offset,count*size);const axisNames=names(tables.name),axes=[],seen=new Set();
    for(let i=0;i<count;i++){
      const at=offset+i*size,tag=tagAt(v,at),min=v.getInt32(at+4)/65536,def=v.getInt32(at+8)/65536,max=v.getInt32(at+12)/65536;
      if(!/^[\x20-\x7e]{4}$/.test(tag)||seen.has(tag)||min>def||def>max)throw Error('可変軸の名前または範囲が不正です。');
      seen.add(tag);axes.push({tag,min,default:def,max,hidden:!!(v.getUint16(at+16)&1),name:labels[tag]||axisNames.get(v.getUint16(at+18))?.text||tag});
    }
    return {axes,reason:axes.some(a=>!a.hidden&&a.min<a.max)?'':'操作できる可変軸がありません。'};
  }
  function sfntTables(buffer) {
    const {v,span}=reader(buffer);span(0,12);let base=0;
    if(tagAt(v,0)==='ttcf'){span(0,16);if(!v.getUint32(8))throw Error('空のフォントコレクションです。');base=v.getUint32(12);span(base,12);}
    const signature=v.getUint32(base);
    if(signature!==0x00010000&&tagAt(v,base)!=='OTTO'&&tagAt(v,base)!=='true')throw Error('TTF／OTF形式のフォントを読み込んでください。');
    const count=v.getUint16(base+4);if(count>512)throw Error('フォントのテーブル数が上限を超えています。');span(base+12,count*16);
    const tables={};for(let i=0;i<count;i++){const at=base+12+i*16,tag=tagAt(v,at),offset=v.getUint32(at+8),size=v.getUint32(at+12);span(offset,size);if(tag==='fvar'||tag==='name')tables[tag]=buffer.slice(offset,offset+size);}
    return tables;
  }
  function parse(buffer) { return parseTables(sfntTables(buffer)); }
  async function inspect(buffer) {
    try {
      const {v,span}=reader(buffer);span(0,4);const signature=tagAt(v,0);
      if(signature==='wOF2')return {axes:[],reason:'このWOFF2の可変軸情報は未対応です。同じ書体の可変TTF／OTFを読み込んでください。'};
      if(signature!=='wOFF')return parse(buffer);
      span(0,44);const count=v.getUint16(12);if(count>512)throw Error('フォントのテーブル数が上限を超えています。');span(44,count*20);const tables={};
      for(let i=0;i<count;i++){
        const at=44+i*20,tag=tagAt(v,at);if(tag!=='fvar'&&tag!=='name')continue;
        const offset=v.getUint32(at+4),compressed=v.getUint32(at+8),original=v.getUint32(at+12);span(offset,compressed);
        if(original>16777216||compressed>original)throw Error('フォントテーブルの展開サイズが上限を超えています。');
        let result=buffer.slice(offset,offset+compressed);
        if(compressed!==original){
          if(typeof DecompressionStream==='undefined')throw Error('このブラウザではWOFF可変軸の読取ができません。TTF／OTFを使用してください。');
          const stream=new Blob([result]).stream().pipeThrough(new DecompressionStream('deflate')),r=stream.getReader(),parts=[];let total=0;
          for(;;){const item=await r.read();if(item.done)break;total+=item.value.length;if(total>original){await r.cancel();throw Error('フォントテーブルの展開サイズが不正です。');}parts.push(item.value);}
          result=await new Blob(parts).arrayBuffer();
        }
        if(result.byteLength!==original)throw Error('フォントテーブルの長さが不正です。');tables[tag]=result;
      }
      return parseTables(tables);
    }catch(error){return {axes:[],reason:error.message};}
  }
  function rawValues(value){try{const data=typeof value==='string'?JSON.parse(value):value;return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch{return {};}}
  function coordinates(meta,raw,weight=400) {
    raw=rawValues(raw);const out={};
    for(const a of meta.axes||[])out[a.tag]=clamp(finite(raw[a.tag],a.tag==='wght'?finite(weight,a.default):a.default),a.min,a.max);
    return out;
  }
  function field(meta,raw,settings,position,strength=1,weight=400){
    const out=coordinates(meta,raw,weight),axis=meta.axes.find(a=>a.tag===settings.axis&&!a.hidden&&a.max>a.min);
    if(!axis||strength<=0)return out;
    const t=clamp(finite(position,0),0,1),cycles=clamp(finite(settings.cycles,1),1,12),phase=finite(settings.phase,0);
    let u=t;
    if(settings.distribution==='wave')u=.5-.5*Math.cos(2*Math.PI*(t*cycles+phase));
    else if(settings.distribution==='mirror')u=1-Math.abs(t*2-1);
    else if(settings.distribution==='steps')u=Math.round(t*Math.round(cycles))/Math.round(cycles);
    const from=clamp(finite(settings.from,axis.min),axis.min,axis.max),to=clamp(finite(settings.to,axis.max),axis.min,axis.max);
    out[axis.tag]=out[axis.tag]+(from+(to-from)*u-out[axis.tag])*clamp(strength,0,1);
    return out;
  }
  function css(values){return Object.keys(values).filter(k=>/^[\x20-\x7e]{4}$/.test(k)&&!/["\\]/.test(k)&&Number.isFinite(values[k])).sort().map(k=>'"'+k+'" '+values[k]).join(', ')||'normal';}
  function fromCSS(value){const out={};for(const m of String(value||'').matchAll(/"([^"\\]{4})"\s+(-?(?:\d*\.)?\d+(?:e[+-]?\d+)?)/gi))out[m[1]]=Number(m[2]);return out;}
  // One separate face per imported variable font, not one full font per glyph.
  // Canvas operations are synchronous; each draw/measurement activates its own
  // frozen coordinates. DOM spans use CSS coordinates on the original face.
  function createRuntime(){
    const entries=new Map();let sequence=0;
    async function register(record){
      if(entries.has(record.family))return entries.get(record.family);
      const meta=await inspect(record.buffer),entry={...record,sourceFamily:record.family,meta,face:null,family:'',reason:meta.reason};entries.set(record.family,entry);
      if(!meta.axes.length)return entry;
      if(typeof FontFace==='undefined'||!('variationSettings' in FontFace.prototype)){entry.reason='このブラウザはCanvasの可変フォントに未対応です。';return entry;}
      const family='TypeDeformer Axis Canvas '+(++sequence),face=new FontFace(family,record.buffer,{variationSettings:css(coordinates(meta,{},400))});
      try{await face.load();document.fonts.add(face);entry.face=face;entry.family=family;}
      catch{entry.reason='可変字形を読み込めませんでした。別のフォントをお試しください。';}
      return entry;
    }
    function find(family){return entries.get(String(family).split(',')[0].replace(/^\s*["']|["']\s*$/g,'').trim());}
    function activate(params,g,size){
      const sourceFamily=g?.fontFamily||params.fontFamily,weight=g?.fontWeight??params.fontWeight,entry=find(sourceFamily),axes=g?.fontAxes||coordinates(entry?.meta||{axes:[]},params.fontAxes,weight);
      const key=JSON.stringify([sourceFamily,weight,axes,size]);
      if(!entry?.face||!Object.keys(axes).length)return {font:weight+' '+size+'px '+sourceFamily,key,axes:{},family:sourceFamily,weight};
      const value=css(axes);if(entry.face.variationSettings!==value)entry.face.variationSettings=value;
      return {font:'400 '+size+'px "'+entry.family+'", '+sourceFamily,key,axes,family:sourceFamily,weight};
    }
    return {register,find,activate,dispose(){for(const e of entries.values())if(e.face)document.fonts.delete(e.face);entries.clear();}};
  }
  root.TypeDeformerAxes={parse,inspect,coordinates,field,css,fromCSS,rawValues,createRuntime};
})(typeof globalThis!=='undefined'?globalThis:this);
