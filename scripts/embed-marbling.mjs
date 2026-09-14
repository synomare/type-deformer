// Emit an apply_patch patch; never write the editor from this generator.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),base=new URL('.codex/prototypes/marbling-type/',root);
const read=name=>readFileSync(new URL(name,base),'utf8').replace(/\r\n/g,'\n').trimEnd();
const modules=['ink-support.mjs','core.mjs','lod.mjs','source-pool.mjs'];
const bundled=modules.map((name,index)=>{
  const source=read(name),names=[...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map(m=>m[1]);
  const body=source.replace(/^import \{([^}]+)\} from '(.*?)';$/gm,(_,keys,path)=>{
    const dependency=modules.indexOf(path.replace('./',''));
    if(dependency<0||dependency>=index)throw new Error('Unexpected Marbling dependency '+path);
    return `const {${keys}} = modules[${dependency}];`;
  }).replace(/^export /gm,'');
  return `modules[${index}] = (function () {\n${body}\nreturn {${names.join(',')}};\n})();`;
});
const embedded=['// BEGIN MARBLING TYPE GENERATED','var MarblingType = (function () {',
  '// Lexical intrinsic bindings avoid repeated global-proxy lookups in hot interval arithmetic.',
  'var Math = globalThis.Math, Number = globalThis.Number, Object = globalThis.Object, Array = globalThis.Array;',
  'var performance = globalThis.performance;', 'var modules = [];',...bundled,
  'return Object.assign({}, ...modules);','})();',read('editor-adapter.js'),'// END MARBLING TYPE GENERATED']
  .join('\n').split('\n').map(line=>line?'      '+line:'').join('\n');
const path=fileURLToPath(new URL('index.html',root)),html=readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const old=html.match(/^      \/\/ BEGIN MARBLING TYPE GENERATED\n[\s\S]*?^      \/\/ END MARBLING TYPE GENERATED/m)?.[0];
if(process.argv.includes('--check')){
  if(old!==embedded)throw new Error('Marbling embedded runtime is stale. Apply scripts/embed-marbling.mjs output.');
  console.log('Marbling embedded ink-support/core/LOD/source-pool/adapter match source modules.');
}else{
  const anchor='      // BEGIN AUXETIC TYPE GENERATED';
  if(!old&&!html.includes(anchor))throw new Error('Marbling integration anchor missing');
  console.log(['*** Begin Patch','*** Update File: '+path.replaceAll('\\','/'),'@@',
    ...(old?old.split('\n').map(line=>'-'+line):[]),...embedded.split('\n').map(line=>'+'+line),
    ...(!old?['+',' '+anchor]:[]),'*** End Patch'].join('\n'));
}
