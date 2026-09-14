// Emit an apply_patch patch; never write the editor from this generator.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=new URL('../',import.meta.url),base=new URL('.codex/prototypes/auxetic-type/',root);
const read=name=>readFileSync(new URL(name,base),'utf8').replace(/\r\n/g,'\n').trimEnd();
const strip=text=>text.replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const names=['AUXETIC_TYPE_STARTS','normalizeAuxeticSettings','auxeticArea','prepareAuxeticGlyph','clipAuxeticRing','auxeticCutIntervals',
  'compileAuxeticGlyph','auxeticDeployment','auxeticPanelMatrix','renderAuxeticGlyph','auxeticPixelTolerance','createAuxeticSourcePool'];
const embedded=['// BEGIN AUXETIC TYPE GENERATED','var AuxeticType = (function () {',strip(read('core.mjs')),
  `return { ${names.join(', ')} };`,'})();',read('editor-adapter.js'),'// END AUXETIC TYPE GENERATED']
  .join('\n').split('\n').map(line=>line?'      '+line:'').join('\n');
const path=fileURLToPath(new URL('index.html',root));
const html=readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const old=html.match(/^      \/\/ BEGIN AUXETIC TYPE GENERATED\n[\s\S]*?^      \/\/ END AUXETIC TYPE GENERATED/m)?.[0];
if(process.argv.includes('--check')){
  if(old!==embedded)throw new Error('Auxetic embedded source is stale. Apply scripts/embed-auxetic.mjs output.');
  console.log('Auxetic Type: embedded core/adapter match source modules.');
}else{
  const anchor='      // BEGIN CONFORMAL TYPE GENERATED';
  if(!old&&!html.includes(anchor))throw new Error('Auxetic integration anchor missing');
  console.log(['*** Begin Patch','*** Update File: '+path.replaceAll('\\','/'),'@@',
    ...(old?old.split('\n').map(line=>'-'+line):[]),...embedded.split('\n').map(line=>'+'+line),
    ...(!old?['+',' '+anchor]:[]),'*** End Patch'].join('\n'));
}
