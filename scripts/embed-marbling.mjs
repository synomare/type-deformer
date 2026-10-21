// Emit an apply_patch patch; never write the editor from this generator.
import {readFileSync} from 'node:fs';
import {handleGeneratedDeclarations} from './generated-declarations.mjs';
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
handleGeneratedDeclarations(embedded, 'Marbling Type');
