// Emit an apply_patch patch; never write the editor from this generator.
import { readFileSync } from 'node:fs';
import {handleGeneratedDeclarations} from './generated-declarations.mjs';
const root=new URL('../',import.meta.url),base=new URL('.codex/prototypes/auxetic-type/',root);
const read=name=>readFileSync(new URL(name,base),'utf8').replace(/\r\n/g,'\n').trimEnd();
const strip=text=>text.replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const names=['AUXETIC_TYPE_STARTS','normalizeAuxeticSettings','auxeticArea','prepareAuxeticGlyph','clipAuxeticRing','auxeticCutIntervals',
  'compileAuxeticGlyph','auxeticDeployment','auxeticPanelMatrix','renderAuxeticGlyph','auxeticPixelTolerance','createAuxeticSourcePool'];
const embedded=['// BEGIN AUXETIC TYPE GENERATED','var AuxeticType = (function () {',strip(read('core.mjs')),
  `return { ${names.join(', ')} };`,'})();',read('editor-adapter.js'),'// END AUXETIC TYPE GENERATED']
  .join('\n').split('\n').map(line=>line?'      '+line:'').join('\n');
handleGeneratedDeclarations(embedded, 'Auxetic Type');
