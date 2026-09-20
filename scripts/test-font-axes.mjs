import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../font-axes.js';
const A=globalThis.TypeDeformerAxes;
const editorSource=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const limitsSource=editorSource.match(/^      var FONT_IMPORT_LIMITS = Object\.freeze\(\{[^]*?^      \}\);/m)?.[0];
const planSource=editorSource.match(/^      function fontImportPlan\([^]*?^      \}/m)?.[0];
if(!limitsSource||!planSource)throw Error('Font import policy is missing from the editor source');
const importPolicy=vm.createContext({});
vm.runInContext(limitsSource+'\n'+planSource,importPolicy);
function fixture(axes=[['wght',100,400,1000,0],['wdth',25,100,151,0],['GRAD',-200,0,150,0],['XXXX',0,0,1,1]]){
 const bytes=new ArrayBuffer(28+16+axes.length*20),v=new DataView(bytes);
 v.setUint32(0,0x00010000);v.setUint16(4,1);new Uint8Array(bytes).set([102,118,97,114],12);v.setUint32(20,28);v.setUint32(24,16+axes.length*20);
 v.setUint16(28,1);v.setUint16(32,16);v.setUint16(36,axes.length);v.setUint16(38,20);
 axes.forEach(([tag,min,def,max,flags],i)=>{const p=44+i*20;for(let j=0;j<4;j++)v.setUint8(p+j,tag.charCodeAt(j));v.setInt32(p+4,min*65536);v.setInt32(p+8,def*65536);v.setInt32(p+12,max*65536);v.setUint16(p+16,flags);});return bytes;
}
test('fvar keeps actual tags, signed limits, defaults and hidden-axis flags',()=>{
 const meta=A.parse(fixture());assert.equal(meta.axes.length,4);assert.deepEqual(meta.axes[2],{tag:'GRAD',min:-200,default:0,max:150,hidden:false,name:'GRAD'});assert.equal(meta.axes[3].hidden,true);
});
test('malformed bounds, duplicate axes and invalid ordering cannot enter the axis controls',async()=>{
 assert.throws(()=>A.parse(fixture().slice(0,40)));
 assert.throws(()=>A.parse(fixture([['wght',900,400,1000,0]])));
 assert.throws(()=>A.parse(fixture([['wght',0,0,1,0],['wght',0,0,1,0]])));
 const b=fixture();new DataView(b).setUint16(36,65535);assert.throws(()=>A.parse(b));
 assert.equal((await A.inspect(new Uint8Array([119,79,70,50]).buffer)).axes.length,0);
 assert.match((await A.inspect(new Uint8Array([119,79,70,50]).buffer)).reason,/WOFF2/);
});
test('unapplied and missing axes are native coordinates, extremes clamp to real font limits',()=>{
 const meta=A.parse(fixture()),settings={axis:'wdth',from:-5000,to:1e9,distribution:'sequence'};
 assert.equal(A.field(meta,{},settings,0,1).wdth,25);assert.equal(A.field(meta,{},settings,1,1).wdth,151);
 assert.equal(A.field(meta,{},settings,.5,0).wdth,100);assert.equal(A.field(meta,{},settings,.5,.5).wdth,94);
 assert.deepEqual(A.field(meta,{}, {...settings,axis:'nope'},.5,1),A.coordinates(meta,{},400));
 assert.equal(A.field(meta,{}, {...settings,axis:'XXXX'},1,1).XXXX,0);
 assert.equal(A.coordinates(meta,'{"wght":9999,"GRAD":-500}',400).wght,1000);
});
test('distributions are deterministic, distinct, continuous for wave and phase closed',()=>{
 const meta=A.parse(fixture()),base={axis:'wdth',from:25,to:151,cycles:3,phase:.13};
 const samples=mode=>Array.from({length:41},(_,i)=>A.field(meta,{}, {...base,distribution:mode},i/40).wdth);
 const sequence=samples('sequence');assert.ok(sequence.every((n,i)=>!i||n>=sequence[i-1]));
 assert.equal(new Set(['sequence','mirror','wave','steps'].map(mode=>JSON.stringify(samples(mode)))).size,4);
 for(let i=0;i<20;i++)assert.ok(Math.abs(A.field(meta,{}, {...base,distribution:'wave'},i/20).wdth-A.field(meta,{}, {...base,distribution:'wave',phase:base.phase+1},i/20).wdth)<1e-10);
 assert.equal(A.css({wght:400,wdth:100}),'"wdth" 100, "wght" 400');
});
test('font import policy accepts a large lazy library and rejects only declared hard budgets',()=>{
 const L=importPolicy.FONT_IMPORT_LIMITS,plan=importPolicy.fontImportPlan;
 assert.equal(L.maxFiles,4096);assert.equal(L.maxFileBytes,128*1024*1024);assert.equal(L.maxTotalBytes,8*1024*1024*1024);
 const many=Array.from({length:1024},(_,i)=>({name:'font-'+i+'.otf',size:4*1024*1024}));
 const accepted=plan(many);assert.equal(accepted.issue,'');assert.equal(accepted.files.length,1024);
 assert.equal(plan([...many,{name:'notes.txt',size:1}]).files.length,1024);
 assert.equal(plan(Array.from({length:4097},(_,i)=>({name:i+'.ttf',size:1}))).issue,'count');
 assert.equal(plan([{name:'oversize.woff2',size:L.maxFileBytes+1}]).issue,'file');
 assert.equal(plan(Array.from({length:65},(_,i)=>({name:i+'.ttc',size:L.maxFileBytes}))).issue,'total');
});
test('font selection accepts MIME-identified provider files, rejects empty downloads and ignores metadata sidecars',()=>{
 const plan=importPolicy.fontImportPlan;
 assert.equal(plan([{name:'provider-file',type:'font/ttf',size:900}]).files.length,1);
 assert.equal(plan([{name:'empty.ttf',size:0}]).issue,'unreadable');
 assert.equal(plan([{name:'._font.ttf',size:128},{name:'font.ttf',size:900}]).files.length,1);
});
