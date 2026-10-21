#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {readAuthoredSource, readEditorUnits, readRenderManifest, readAuthoredUnits, declaredSourceUnit, extractDeclaredFunction} from './source-reader.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const htmlPath = path.join(root, 'index.html');
const dictionaryPath = path.join(root, 'confuse-dictionary.js');
const packagePath = path.join(root, 'package.json');

import '../operator-registry.js';
const operatorRegistry=globalThis.TypeDeformerOperatorRegistry;
const operatorParameterKeys=new Set(operatorRegistry.specs.flatMap(spec=>Object.values(spec.keys||{})));

const failures = [];
const warnings = [];
const noteFailure = (message) => failures.push(message);
const noteWarning = (message) => warnings.push(message);

function readRequired(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    noteFailure(`Cannot read ${path.relative(root, filePath)}: ${error.message}`);
    return '';
  }
}

function localAssetPath(rawUrl) {
  const value = rawUrl.trim();
  if (!value || value.startsWith('#') || value.startsWith('//')) return null;
  if (/^(?:[a-z]+:|data:|blob:|javascript:)/i.test(value)) return null;
  const clean = value.split('#')[0].split('?')[0];
  return clean ? path.resolve(root, decodeURIComponent(clean)) : null;
}

const html = readRequired(htmlPath).replace(/\r\n/g, '\n');
const migrationSource=readRequired(path.join(root,'project-migrations.js')).replace(/\r\n/g,'\n');
const authoredSource=readAuthoredSource();
const authoredUnits=readAuthoredUnits();
// Historical marker inventories span authored code and markup; executable
// fixtures use named declaration owners instead of this broad existence view.
const applicationSource=html+'\n'+authoredSource;
const renderManifest=readRenderManifest();
const hasRenderRouteMapping=marker=>{
  const [id,route]=marker.split(/:\s*/,2);
  return !!route && Object.hasOwn(renderManifest.routes,id) && renderManifest.routes[id]===route;
};
const hasEditorOrMigrationMarker=marker=>applicationSource.includes(marker) || hasRenderRouteMapping(marker)
  || /^(?:params\.|(?:if \()?Number\(data\.version)/.test(marker) && migrationSource.includes(marker);
const renderingSource=authoredSource+'\n'+readRequired(path.join(root,'shared-surface-renderers.js'));
const dictionarySource = readRequired(dictionaryPath);
const packageJson = readRequired(packagePath);

if (html) {
  for (const method of ['normalizeParams', 'normalizeBatchProfiles', 'migrate']) {
    if (!authoredSource.includes('TypeDeformerProjectMigrations.' + method + '(')) noteFailure(`Project migration adapter is missing ${method}().`);
  }
  try { new vm.Script(migrationSource, { filename: 'project-migrations.js' }); }
  catch (error) { noteFailure(`JavaScript syntax error in project-migrations.js: ${error.message}`); }
  for(const unit of readEditorUnits()){
    try { new vm.Script(unit.source,{filename:unit.path}); }
    catch(error){noteFailure(`JavaScript syntax error in ${unit.path}: ${error.message}`);}
    if(/\b(?:window\.)?(alert|confirm|prompt)\s*\(/.test(unit.source))noteFailure(`${unit.path} calls a blocking browser dialog.`);
  }
  if (!/^<!doctype html>/i.test(html.trimStart())) noteFailure('index.html is missing an HTML doctype.');
  if (!/<html\b[^>]*\blang=["']ja["']/i.test(html)) noteWarning('index.html does not declare lang="ja".');

  for (const marker of ['<<<<<<<', '=======', '>>>>>>>']) {
    if (html.includes(marker)) noteFailure(`index.html contains an unresolved merge marker: ${marker}`);
  }

  const markupOnly = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  const ids = new Map();
  const idPattern = /\bid\s*=\s*(["'])([^"']+)\1/gi;
  for (const match of markupOnly.matchAll(idPattern)) {
    ids.set(match[2], (ids.get(match[2]) || 0) + 1);
  }
  const duplicateIds = [...ids.entries()].filter(([, count]) => count > 1);
  for (const [id, count] of duplicateIds) noteFailure(`Duplicate HTML id "${id}" appears ${count} times.`);

  const rangePattern = /<input\b[^>]*\btype\s*=\s*(["'])range\1[^>]*>/gi;
  const rangeAttribute = (tag, name) => {
    const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']+)\\1`, 'i'));
    return match ? match[2] : null;
  };
  for (const match of markupOnly.matchAll(rangePattern)) {
    const tag = match[0];
    const id = rangeAttribute(tag, 'id') || '(unnamed range)';
    const min = Number(rangeAttribute(tag, 'min'));
    const max = Number(rangeAttribute(tag, 'max'));
    const step = Number(rangeAttribute(tag, 'step'));
    const value = Number(rangeAttribute(tag, 'value'));
    if (![min, max, step, value].every(Number.isFinite) || step <= 0 || max < min) {
      noteFailure(`${id} has an invalid min, max, step, or default value.`);
      continue;
    }
    if (value < min || value > max) {
      noteFailure(`${id} default value ${value} is outside ${min}…${max}.`);
      continue;
    }
    const stepPosition = (value - min) / step;
    const tolerance = 1e-7 * Math.max(1, Math.abs(stepPosition));
    if (Math.abs(stepPosition - Math.round(stepPosition)) > tolerance) {
      noteFailure(`${id} default value ${value} does not align to step ${step} from min ${min}.`);
    }
  }

  const referencedIds = new Map();
  const addReference = (id, source) => {
    if (!id) return;
    if (!referencedIds.has(id)) referencedIds.set(id, new Set());
    referencedIds.get(id).add(source);
  };

  const getByIdPattern = /\bgetElementById\(\s*(["'`])([^"'`]+)\1\s*\)/g;
  for (const match of authoredSource.matchAll(getByIdPattern)) {
    if (!match[2].includes('${')) addReference(match[2], 'getElementById');
  }
  const labelPattern = /<label\b([^>]*)>/gi;
  for (const match of markupOnly.matchAll(labelPattern)) {
    const forMatch = match[1].match(/(?:^|\s)for\s*=\s*(["'])([^"']+)\1/i);
    if (forMatch) addReference(forMatch[2], 'label[for]');
  }
  const ariaControlsPattern = /\baria-controls\s*=\s*(["'])([^"']+)\1/gi;
  for (const match of markupOnly.matchAll(ariaControlsPattern)) {
    for (const id of match[2].trim().split(/\s+/)) addReference(id, 'aria-controls');
  }

  for (const [id, sources] of referencedIds) {
    if (!ids.has(id)) noteFailure(`Missing HTML id "${id}" referenced by ${[...sources].join(', ')}.`);
  }

  const inlineScripts = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let scriptIndex = 0;
  for (const match of html.matchAll(scriptPattern)) {
    scriptIndex += 1;
    const attrs = match[1];
    const body = match[2];
    const srcMatch = attrs.match(/\bsrc\s*=\s*(["'])([^"']+)\1/i);
    if (srcMatch) {
      const asset = localAssetPath(srcMatch[2]);
      if (asset && !fs.existsSync(asset)) {
        noteFailure(`Missing local script referenced by index.html: ${path.relative(root, asset)}`);
      }
      continue;
    }
    inlineScripts.push({ index: scriptIndex, body });
  }

  for (const script of inlineScripts) {
    try {
      new vm.Script(script.body, { filename: `index.html:inline-script-${script.index}` });
    } catch (error) {
      noteFailure(`JavaScript syntax error in inline script ${script.index}: ${error.message}`);
    }
    const blockingDialogs = [...script.body.matchAll(/\b(?:window\.)?(alert|confirm|prompt)\s*\(/g)]
      .map((match) => match[1]);
    if (blockingDialogs.length) {
      noteFailure(`Inline script ${script.index} calls blocking browser dialog(s): ${[...new Set(blockingDialogs)].join(', ')}.`);
    }
  }

  const linkPattern = /<link\b([^>]*)>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const hrefMatch = match[1].match(/\bhref\s*=\s*(["'])([^"']+)\1/i);
    if (!hrefMatch) continue;
    const asset = localAssetPath(hrefMatch[2]);
    if (asset && !fs.existsSync(asset)) {
      noteFailure(`Missing local link target referenced by index.html: ${path.relative(root, asset)}`);
    }
  }

  const eagerDictionaryTag = /<script\b[^>]*\bsrc\s*=\s*(["'])confuse-dictionary\.js\1[^>]*>/i;
  if (eagerDictionaryTag.test(html)) {
    noteFailure('confuse-dictionary.js is loaded eagerly; keep the generated dictionary on the Confuse operator lazy path.');
  }
  if (!/script\.src\s*=\s*(["'])confuse-dictionary\.js\1/.test(authoredSource)) {
    noteFailure('The lazy loader for confuse-dictionary.js is missing.');
  }
  if (!authoredSource.includes('TYPE_DEFORMER_CONFUSE_DICTIONARY')) {
    noteFailure('The authored editor does not consume the generated dictionary global.');
  }

  const proceduralOperators = [
    'plotterTrace', 'webbing', 'softBlob', 'etchantBloom', 'sigilForge', 'thornCrown', 'cipherLiturgy',
    'calligraphicStress', 'asemicDuctus', 'spectralType', 'differentialType', 'conformalType', 'auxeticType', 'marblingType', 'counterformEngine', 'terminalExcess', 'ligatureBody',
    'boneScaffold', 'roseEngine', 'chromeReliquary', 'ligatureCrypt', 'moireChoir', 'naveCutter',
    'cloisterFold', 'prismSacrament', 'texturaMatrix', 'voidPortal', 'recursiveShrine', 'morphProcession', 'chimeraGraft', 'monolithCast',
    'rasterPress', 'hatchEngrave', 'contourEtch', 'pressureStroke', 'sinewTorque', 'cellFracture', 'ribbonEcho',
    'copyDecay', 'risoSeparation', 'slitSweep'
  ];
  const proceduralLabels = [
    'Kinetic Trace', 'Field Webbing', 'Physarum Blob', 'Etchant Bloom', 'Sigil Forge', 'Thorn Crown', 'Cipher Liturgy',
    'Calligraphic Stress', 'Asemic Ductus', 'Spectral Type', 'Differential Type', 'Conformal Type', 'Auxetic Type', 'Marbling Type', 'Counterform Engine', 'Terminal Excess', 'Ligature Body',
    'Bone Scaffold', 'Rose Engine', 'Chrome Reliquary', 'Ligature Crypt', 'Moiré Choir', 'Nave Cutter',
    'Cloister Fold', 'Prism Sacrament', 'Textura Matrix', 'Void Portal', 'Recursive Shrine', 'Morph Procession', 'Chimera Graft', 'Monolith Cast',
    'Raster Press', 'Hatch Engrave', 'Contour Etch', 'Pressure Stroke', 'Sinew Torque', 'Cell Fracture', 'Ribbon Echo',
    'Copy Decay', 'Riso Separation', 'Slit Sweep'
  ];
  const surfaceSnapshotBody = authoredSource.match(/var surface = snapshotSurfaceState\(m, deform, misreg, surfaceSnapshots, function\(\) \{ return \{([\s\S]*?)\n\s*\}; \}\);/)?.[1] || '';
  const surfaceSnapshotKeys = [...surfaceSnapshotBody.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((match) => match[1]);
  const duplicateSurfaceSnapshotKeys = [...new Set(surfaceSnapshotKeys.filter((key, index) => surfaceSnapshotKeys.indexOf(key) !== index))];
  if (!surfaceSnapshotBody || duplicateSurfaceSnapshotKeys.length) {
    noteFailure(duplicateSurfaceSnapshotKeys.length
      ? `Surface snapshot reuses strength/parameter key(s): ${duplicateSurfaceSnapshotKeys.join(', ')}.`
      : 'Surface snapshot object could not be inspected for strength/parameter key collisions.');
  }
  if (!authoredSource.includes('cloisterFoldAmount: deform.cloisterFold')
    || !authoredSource.includes("surfaceAggregate(glyphs, 'cloisterFold', 'cloisterFoldAmount', params.cloisterFold)")) {
    noteFailure('Cloister Fold strength and Fold amount do not have independent snapshot keys.');
  }
  if (!authoredSource.includes('sinewTorqueAmount: deform.sinewTorque')
    || !authoredSource.includes("surfaceAggregate(glyphs, 'sinewTorque', 'sinewTorqueAmount', params.sinewTorque)")) {
    noteFailure('Sinew Torque strength and Torque amount do not have independent snapshot keys.');
  }
  for (const operator of proceduralOperators) {
    if (!new RegExp(`<option\\s+value=["']${operator}["']`).test(markupOnly)) {
      noteFailure(`Procedural operator "${operator}" is missing from the Operator select.`);
    }
    if (!new RegExp(`data-operator-panel=["']${operator}["']`).test(markupOnly)) {
      noteFailure(`Procedural operator "${operator}" is missing its control panel.`);
    }
    if (!operatorRegistry.byId[operator]) {
      noteFailure(`Procedural operator "${operator}" is missing from OPERATOR_DEFS.`);
    }
  }
  for (const label of proceduralLabels) {
    if (!markupOnly.includes(`>${label}</option>`)) {
      noteFailure(`Procedural operator label "${label}" is missing from the Operator select.`);
    }
  }
  for (const operator of ['calligraphicStress', 'asemicDuctus', 'spectralType', 'differentialType', 'conformalType', 'auxeticType', 'marblingType', 'counterformEngine', 'terminalExcess', 'ligatureBody', 'pressureStroke', 'sinewTorque', 'chimeraGraft', 'contextualFit', 'scrollType']) {
    if (!operatorRegistry.glyphBodyIds.includes(operator)) {
      noteFailure('Glyph Body replacement Operator registry is incomplete.');
      break;
    }
    if (!/^render[A-Z]/.test(renderManifest.routes[operator]||'')
      && !(renderManifest.nativeIds.includes(operator)&&new RegExp(`${operator}:\\s*render[A-Z]`).test(authoredSource))) {
      noteFailure(`Glyph Body renderer "${operator}" is missing from the Surface renderer map.`);
    }
  }
  if (!authoredSource.includes("GLYPH_BODY_OPERATOR_IDS.indexOf(surfaceParamId) === -1 ? 1 : 0")
    || !migrationSource.includes("GLYPH_BODY_OPERATOR_IDS.indexOf(sourceMigrationId) !== -1")) {
    noteFailure('Glyph Body source text must default to hidden without changing legacy Surface source opacity.');
  }
  for (const id of ['pSurfaceTextColor', 'pSurfaceEffectColor', 'pSurfaceEffectColorB',
    'pSurfaceSourceOpacity', 'vSurfaceSourceOpacity']) {
    if (!ids.has(id)) noteFailure(`Surface color/source separation is missing ${id}.`);
  }
  if (!ids.has('pSlitAxis')) noteFailure('slitSweep is missing its scan-axis control.');
  for (const opacity of ['1', '0.22', '0']) {
    if (!new RegExp(`data-surface-source-opacity=["']${opacity.replace('.', '\\.') }["']`).test(markupOnly)) {
      noteFailure(`Original-text opacity preset "${opacity}" is missing.`);
    }
  }
  const extremeRangeChecks = [
    ['pStretchX', '8'], ['pStretchY', '8'],
    ['pRotateAngle', '720'], ['pRotateCycles', '16'], ['pRotatePhase', '1'],
    ['pSkewX', '85'], ['pSkewY', '85'], ['pSkewCycles', '16'], ['pSkewPhase', '1'],
    ['pBaselineShift', '12'], ['pBaselineCycles', '16'], ['pBaselinePhase', '1'],
    ['pMirrorSpan', '16'], ['pMirrorPhase', '15'],
    ['pTraceDensity', '4'], ['pTraceDefinition', '256'], ['pTraceStroke', '40'], ['pTraceJitter', '500'], ['pTraceLift', '1'],
    ['pWebDensity', '6'], ['pWebReach', '1800'], ['pWebChaos', '8'], ['pWebSag', '6'], ['pWebStroke', '48'],
    ['pSoftBlobInflation', '6'], ['pSoftBlobStiffness', '5'], ['pSoftBlobChaos', '8'], ['pSoftBlobMembrane', '4'],
    ['pSoftBlobSporeReach', '2400'], ['pSoftBlobSporeDensity', '4'], ['pSoftBlobSpeed', '8'],
    ['pEtchantPattern', '1'], ['pEtchantCell', '72'], ['pEtchantGrowth', '192'], ['pEtchantPolarity', '1'], ['pEtchantSpill', '640'],
    ['pCalligraphyExpansion', '260'], ['pCalligraphyContrast', '4'], ['pCalligraphyAngle', '180'], ['pCalligraphyPulse', '4'], ['pCalligraphyWetness', '1'],
    ['pAsemicMemory', '1'], ['pAsemicGestures', '16'], ['pAsemicWeight', '64'], ['pAsemicFlow', '4'], ['pAsemicContrast', '6'], ['pAsemicFlourish', '480'], ['pAsemicCounter', '1.5'],
    ['pCounterformPressure', '160'], ['pCounterformBridge', '180'], ['pCounterformAperture', '1'], ['pCounterformAngle', '180'], ['pCounterformTrap', '160'],
    ['pTerminalReach', '360'], ['pTerminalMass', '4'], ['pTerminalSelection', '1'], ['pTerminalBias', '1'], ['pTerminalTrap', '160'],
    ['pLigatureBodyFusion', '4'], ['pLigatureBodyReach', '1800'], ['pLigatureBodyBand', '240'], ['pLigatureBodyCounter', '1.5'], ['pLigatureBodyTension', '4'],
    ['pSigilBinding', '4'], ['pSigilComplexity', '24'], ['pSigilReach', '640'], ['pSigilSymmetry', '4'], ['pSigilStroke', '20'], ['pSigilBarbs', '6'],
    ['pThornArmor', '4'], ['pThornLength', '360'], ['pThornDensity', '6'], ['pThornCurl', '3'], ['pThornStroke', '16'], ['pThornBranches', '4'],
    ['pCipherRegisters', '4'], ['pCipherScale', '36'], ['pCipherDensity', '4'], ['pCipherOrbit', '360'], ['pCipherDrift', '160'], ['pCipherCallouts', '4'],
    ['pBoneMarrow', '6'], ['pBoneCell', '96'], ['pBoneBranching', '8'], ['pBoneWeight', '32'], ['pBoneJoint', '64'], ['pBoneWarp', '8'],
    ['pRoseInterlace', '4'], ['pRosePetals', '32'], ['pRoseRings', '8'], ['pRoseRadius', '560'], ['pRoseWarp', '2'], ['pRoseStroke', '18'],
    ['pChromeVoltage', '6'], ['pChromeBevel', '96'], ['pChromeAngle', '180'], ['pChromeBands', '24'], ['pChromeContrast', '4'], ['pChromeWarp', '4'],
    ['pLigatureWeave', '4'], ['pLigatureReach', '1800'], ['pLigatureBand', '180'], ['pLigatureRise', '4'], ['pLigatureCounter', '1.5'], ['pLigatureKnot', '64'],
    ['pMoireResonance', '8'], ['pMoirePitch', '240'], ['pMoireDetune', '1.5'], ['pMoireAngle', '180'], ['pMoireDepth', '16'], ['pMoireReach', '1800'],
    ['pNaveColumns', '24'], ['pNaveRise', '4'], ['pNaveVoid', '1'], ['pNaveButtress', '80'], ['pNaveWarp', '2'],
    ['pCloisterPlanes', '32'], ['pCloisterFold', '2'], ['pCloisterAxis', '180'], ['pCloisterPerspective', '4'], ['pCloisterCrease', '64'],
    ['pPrismRefraction', '4'], ['pPrismDispersion', '320'], ['pPrismFacets', '32'], ['pPrismCaustic', '6'], ['pPrismBloom', '640'],
    ['pTexturaPitch', '180'], ['pTexturaAngle', '90'], ['pTexturaWeight', '4'], ['pTexturaSplit', '1'], ['pTexturaSpur', '96'],
    ['pVoidDepth', '1600'], ['pVoidAngle', '180'], ['pVoidAperture', '1'], ['pVoidTaper', '2'], ['pVoidRibs', '32'],
    ['pRecursiveIterations', '24'], ['pRecursiveScale', '1.5'], ['pRecursiveTurn', '180'], ['pRecursiveOrbit', '1200'], ['pRecursiveParity', '1'],
    ['pMorphInbetweens', '24'], ['pMorphSpan', '2.5'], ['pMorphMelt', '2'], ['pMorphTwist', '360'], ['pMorphHalo', '160'],
    ['pChimeraGrafts', '32'], ['pChimeraSpan', '320'], ['pChimeraAssimilation', '1'], ['pChimeraForeignness', '4'], ['pChimeraSeam', '20'],
    ['pMonolithMass', '360'], ['pMonolithModule', '120'], ['pMonolithFault', '480'], ['pMonolithCounter', '1'], ['pMonolithFormwork', '4'],
    ['pRasterModulation', '4'], ['pRasterCell', '72'], ['pRasterGain', '3'], ['pRasterAngle', '90'], ['pRasterNoise', '2'],
    ['pHatchDepth', '4'], ['pHatchSpacing', '80'], ['pHatchAngle', '180'], ['pHatchWarp', '5'], ['pHatchStroke', '12'],
    ['pContourRelief', '4'], ['pContourEtchBands', '64'], ['pContourEtchSpacing', '40'], ['pContourEtchStroke', '14'], ['pContourEtchDrift', '6'],
    ['pPressureWeight', '260'], ['pPressureContrast', '4'], ['pPressureAngle', '180'], ['pPressureFrequency', '32'], ['pPressureSoftness', '24'],
    ['pPressureBreath', '4'], ['pPressureDryness', '1'], ['pPressureTaper', '2'],
    ['pSinewPull', '640'], ['pSinewTorque', '540'], ['pSinewTension', '8'], ['pSinewWaist', '4'], ['pSinewAxis', '180'],
    ['pFractureEnergy', '4'], ['pFractureCell', '140'], ['pFractureScatter', '520'], ['pFractureGap', '28'], ['pFractureSpin', '720'],
    ['pRibbonWeave', '4'], ['pRibbonDepth', '520'], ['pRibbonSteps', '96'], ['pRibbonTwist', '540'], ['pRibbonFade', '1'],
    ['pCopyInstability', '4'], ['pCopyGenerations', '48'], ['pCopyExposure', '1.5'], ['pCopyMotion', '640'], ['pCopyErosion', '24'], ['pCopyToner', '5'], ['pCopyDust', '4'],
    ['pRisoPressure', '4'], ['pRisoSplit', '1'], ['pRisoOverlap', '1.5'], ['pRisoRegister', '160'], ['pRisoGrain', '2'],
    ['pSlitNonlinearity', '4'], ['pSlitWidth', '96'], ['pSlitTravel', '720'], ['pSlitFrequency', '16'], ['pSlitMemory', '64'], ['pSlitSpeed', '4']
  ];
  for (const [id, expectedMax] of extremeRangeChecks) {
    const tag = markupOnly.match(new RegExp(`<input\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i'));
    if (!tag || !new RegExp(`\\bmax=["']${expectedMax.replace('.', '\\.') }["']`).test(tag[0])) {
      noteFailure(`${id} does not expose the expected extreme maximum (${expectedMax}).`);
    }
  }
  const extremeMinChecks = [
    ['pStretchX', '-2'], ['pStretchY', '-2'],
    ['pRotateAngle', '-720'], ['pRotateCycles', '0.25'], ['pRotatePhase', '-1'],
    ['pSkewX', '-85'], ['pSkewY', '-85'], ['pSkewCycles', '0.25'], ['pSkewPhase', '-1'],
    ['pBaselineShift', '-12'], ['pBaselineCycles', '0.25'], ['pBaselinePhase', '-1'],
    ['pMirrorSpan', '1'], ['pMirrorPhase', '0'],
    ['pTraceDensity', '0.02'], ['pTraceDefinition', '1'], ['pTraceStroke', '0.1'], ['pTraceJitter', '0'], ['pTraceLift', '0'],
    ['pWebDensity', '0'], ['pWebReach', '4'], ['pWebChaos', '0'], ['pWebSag', '-6'], ['pWebStroke', '0.1'],
    ['pSoftBlobInflation', '0'], ['pSoftBlobStiffness', '0'], ['pSoftBlobChaos', '0'], ['pSoftBlobMembrane', '0'],
    ['pSoftBlobSporeReach', '0'], ['pSoftBlobSporeDensity', '0'], ['pSoftBlobSpeed', '0'],
    ['pEtchantPattern', '0'], ['pEtchantCell', '2'], ['pEtchantGrowth', '8'], ['pEtchantPolarity', '-1'], ['pEtchantSpill', '0'],
    ['pCalligraphyExpansion', '-120'], ['pCalligraphyContrast', '0'], ['pCalligraphyAngle', '-180'], ['pCalligraphyPulse', '0'], ['pCalligraphyWetness', '0'],
    ['pAsemicMemory', '0'], ['pAsemicGestures', '2'], ['pAsemicWeight', '0.4'], ['pAsemicFlow', '-4'], ['pAsemicContrast', '0'], ['pAsemicFlourish', '0'], ['pAsemicCounter', '0'],
    ['pCounterformPressure', '-120'], ['pCounterformBridge', '0'], ['pCounterformAperture', '0'], ['pCounterformAngle', '-180'], ['pCounterformTrap', '0'],
    ['pTerminalReach', '0'], ['pTerminalMass', '0.1'], ['pTerminalSelection', '0.05'], ['pTerminalBias', '-1'], ['pTerminalTrap', '0'],
    ['pLigatureBodyFusion', '0'], ['pLigatureBodyReach', '0'], ['pLigatureBodyBand', '1'], ['pLigatureBodyCounter', '0'], ['pLigatureBodyTension', '-4'],
    ['pSigilBinding', '0'], ['pSigilComplexity', '1'], ['pSigilReach', '0'], ['pSigilSymmetry', '0'], ['pSigilStroke', '0.2'], ['pSigilBarbs', '0'],
    ['pThornArmor', '0'], ['pThornLength', '0'], ['pThornDensity', '0.05'], ['pThornCurl', '-3'], ['pThornStroke', '0.2'], ['pThornBranches', '0'],
    ['pCipherRegisters', '0'], ['pCipherScale', '3'], ['pCipherDensity', '0.1'], ['pCipherOrbit', '0'], ['pCipherDrift', '0'], ['pCipherCallouts', '0'],
    ['pBoneMarrow', '0'], ['pBoneCell', '2'], ['pBoneBranching', '0'], ['pBoneWeight', '0.2'], ['pBoneJoint', '0'], ['pBoneWarp', '0'],
    ['pRoseInterlace', '0'], ['pRosePetals', '3'], ['pRoseRings', '1'], ['pRoseRadius', '8'], ['pRoseWarp', '-2'], ['pRoseStroke', '0.2'],
    ['pChromeVoltage', '0'], ['pChromeBevel', '1'], ['pChromeAngle', '-180'], ['pChromeBands', '2'], ['pChromeContrast', '0'], ['pChromeWarp', '0'],
    ['pLigatureWeave', '0'], ['pLigatureReach', '0'], ['pLigatureBand', '1'], ['pLigatureRise', '-4'], ['pLigatureCounter', '0'], ['pLigatureKnot', '0'],
    ['pMoireResonance', '0'], ['pMoirePitch', '2'], ['pMoireDetune', '-1.5'], ['pMoireAngle', '-180'], ['pMoireDepth', '0'], ['pMoireReach', '0'],
    ['pNaveColumns', '1'], ['pNaveRise', '0.25'], ['pNaveVoid', '0'], ['pNaveButtress', '0'], ['pNaveWarp', '-2'],
    ['pCloisterPlanes', '1'], ['pCloisterFold', '-2'], ['pCloisterAxis', '-180'], ['pCloisterPerspective', '0'], ['pCloisterCrease', '0'],
    ['pPrismRefraction', '-4'], ['pPrismDispersion', '0'], ['pPrismFacets', '1'], ['pPrismCaustic', '0'], ['pPrismBloom', '0'],
    ['pTexturaPitch', '2'], ['pTexturaAngle', '-90'], ['pTexturaWeight', '0.1'], ['pTexturaSplit', '0'], ['pTexturaSpur', '0'],
    ['pVoidDepth', '0'], ['pVoidAngle', '-180'], ['pVoidAperture', '0'], ['pVoidTaper', '-2'], ['pVoidRibs', '1'],
    ['pRecursiveIterations', '1'], ['pRecursiveScale', '0.25'], ['pRecursiveTurn', '-180'], ['pRecursiveOrbit', '0'], ['pRecursiveParity', '0'],
    ['pMorphInbetweens', '1'], ['pMorphSpan', '0.1'], ['pMorphMelt', '-2'], ['pMorphTwist', '-360'], ['pMorphHalo', '0'],
    ['pChimeraGrafts', '1'], ['pChimeraSpan', '4'], ['pChimeraAssimilation', '0'], ['pChimeraForeignness', '0'], ['pChimeraSeam', '0'],
    ['pMonolithMass', '-120'], ['pMonolithModule', '2'], ['pMonolithFault', '-480'], ['pMonolithCounter', '0'], ['pMonolithFormwork', '0'],
    ['pRasterModulation', '0'], ['pRasterCell', '2'], ['pRasterGain', '0.05'], ['pRasterAngle', '-90'],
    ['pHatchDepth', '0'], ['pHatchSpacing', '1'], ['pHatchAngle', '-180'], ['pHatchStroke', '0.1'],
    ['pContourRelief', '0'], ['pContourEtchBands', '1'], ['pContourEtchSpacing', '1'], ['pContourEtchStroke', '0.25'],
    ['pPressureWeight', '-120'], ['pPressureFrequency', '0.1'], ['pPressureSoftness', '0.1'],
    ['pPressureBreath', '0'], ['pPressureDryness', '0'], ['pPressureTaper', '-2'],
    ['pSinewPull', '-640'], ['pSinewTorque', '-540'], ['pSinewTension', '0.1'], ['pSinewWaist', '-2'], ['pSinewAxis', '-180'],
    ['pFractureEnergy', '0'], ['pFractureCell', '4'], ['pFractureSpin', '-720'],
    ['pRibbonWeave', '0'], ['pRibbonDepth', '-520'], ['pRibbonSteps', '1'], ['pRibbonTwist', '-540'],
    ['pCopyInstability', '0'], ['pCopyGenerations', '1'], ['pCopyExposure', '-1.5'], ['pCopyMotion', '-640'],
    ['pRisoPressure', '0'], ['pRisoSplit', '-1'], ['pSlitNonlinearity', '0'], ['pSlitWidth', '1'], ['pSlitTravel', '-720'], ['pSlitFrequency', '0.25'], ['pSlitMemory', '1']
  ];
  for (const [id, expectedMin] of extremeMinChecks) {
    const tag = markupOnly.match(new RegExp(`<input\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i'));
    if (!tag || !new RegExp(`\\bmin=["']${expectedMin.replace('.', '\\.') }["']`).test(tag[0])) {
      noteFailure(`${id} does not expose the expected extreme minimum (${expectedMin}).`);
    }
  }
  const formCadenceSelects = {
    pRotatePattern: ['uniform', 'alternate', 'wave', 'unicode'],
    pSkewPattern: ['uniform', 'alternate', 'wave', 'unicode'],
    pBaselinePattern: ['uniform', 'wave', 'triangle', 'unicode'],
    pMirrorPattern: ['all', 'alternate', 'blocks', 'words', 'unicode']
  };
  for (const [id, values] of Object.entries(formCadenceSelects)) {
    const select = markupOnly.match(new RegExp(`<select\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/select>`, 'i'));
    if (!select || values.some((value) => !new RegExp(`value=["']${value}["']`).test(select[1]))) {
      noteFailure(`${id} is missing one or more foundational FORM cadence modes.`);
    }
  }
  const legacyOperatorGrammarSelects = {
    pThornGrammar: ['hybrid', 'lancet', 'hook', 'vine', 'trident'],
    pCipherDialect: ['mixed', 'unicode', 'machine', 'ledger', 'ritual'],
    pBoneArchitecture: ['trabecular', 'adaptive', 'spine', 'ribcage', 'truss'],
    pRoseCore: ['auto', 'oculus', 'foil', 'compass', 'knot', 'rosette'],
    pLigatureGrammar: ['ribbon', 'joinery', 'blackletter', 'suture']
  };
  for (const [id, values] of Object.entries(legacyOperatorGrammarSelects)) {
    const select = markupOnly.match(new RegExp(`<select\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/select>`, 'i'));
    if (!select || values.some((value) => !new RegExp(`value=["']${value}["']`).test(select[1]))) {
      noteFailure(`${id} is missing one or more legacy Operator grammar modes.`);
    }
  }
  const evolvedEarlyOperatorSelects = {
    pMoireLattice: ['linear', 'choral', 'concentric', 'radial', 'interlace'],
    pNavePlan: ['arcade', 'ribbed', 'fan', 'loop', 'clerestory'],
    pCloisterTessellation: ['strips', 'miura', 'accordion', 'diamond', 'fan'],
    pPrismOptics: ['legacy', 'crystal', 'fresnel', 'spectral', 'lenticular'],
    pTexturaGrammar: ['stems', 'textura', 'fraktur', 'bastarda', 'lattice']
  };
  for (const [id, values] of Object.entries(evolvedEarlyOperatorSelects)) {
    const select = markupOnly.match(new RegExp(`<select\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/select>`, 'i'));
    if (!select || values.some((value) => !new RegExp(`value=["']${value}["']`).test(select[1]))) {
      noteFailure(`${id} is missing one or more evolved early Operator grammar modes.`);
    }
  }
  const adaptiveMaterialSelects = {
    pRasterScreen: ['legacy', 'gravure', 'adaptive', 'stochastic', 'line', 'mezzotint'],
    pHatchGrammar: ['legacy', 'tonal', 'crosscut', 'burin', 'woodcut'],
    pFractureTopology: ['triangles', 'impact', 'fault', 'crystal', 'spall'],
    pRibbonPath: ['legacy', 'extrude', 'helix', 'fan', 'braid', 'lamina']
  };
  for (const [id, values] of Object.entries(adaptiveMaterialSelects)) {
    const select = markupOnly.match(new RegExp(`<select\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/select>`, 'i'));
    if (!select || values.some((value) => !new RegExp(`value=["']${value}["']`).test(select[1]))) {
      noteFailure(`${id} is missing one or more Adaptive Material grammar modes.`);
    }
  }
  const processGrammarSelects = {
    pSigilTopology: ['legacy', 'cartouche', 'constellation', 'radial', 'branching'],
    pContourGrammar: ['legacy', 'isobars', 'index', 'terraces', 'watershed'],
    pRisoPlateMap: ['legacy', 'field', 'area', 'edge', 'halftone'],
    pCopyFailure: ['legacy', 'generational', 'banding', 'ghosting', 'residual'],
    pSlitTimeMap: ['legacy', 'wave', 'staircase', 'fold', 'feedback']
  };
  for (const [id, values] of Object.entries(processGrammarSelects)) {
    const select = markupOnly.match(new RegExp(`<select\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/select>`, 'i'));
    if (!select || values.some((value) => !new RegExp(`value=["']${value}["']`).test(select[1]))) {
      noteFailure(`${id} is missing one or more Five Process grammar modes.`);
    }
  }
  for (const marker of ['function formFieldContext(', 'function formFieldSignal(', 'function mirrorGrammarMask(',
    "bindProfileSelect('pRotatePattern'", "bindProfileSelect('pSkewPattern'",
    "bindProfileSelect('pBaselinePattern'", "bindProfileSelect('pMirrorPattern'",
    "params.rotatePattern = 'uniform'", "params.mirrorPattern = 'all'"]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Foundational FORM cadence integration is missing ${marker}.`);
  }
  for (const marker of ['function surfaceChoice(',
    "bindProfileSelect('pThornGrammar'", "bindProfileSelect('pCipherDialect'",
    "bindProfileSelect('pBoneArchitecture'", "bindProfileSelect('pRoseCore'",
    "bindProfileSelect('pLigatureGrammar'", "bindRange('pChromeVoltage'",
    "params.thornGrammar = 'hybrid'", "params.boneArchitecture = 'adaptive'",
    "params.ligatureGrammar = 'ribbon'", 'if (Number(data.version || 0) < 22)']) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Legacy Operator grammar state integration is missing ${marker}.`);
  }
  for (const marker of [
    "boneArchitecture: 'lamellar'",
    "boneArchitecture: ['trabecular', 'adaptive', 'spine', 'ribcage', 'truss', 'lamellar']",
    'function renderBoneLamellar(',
    'function boneLamellarFullMask(',
    'function renderBoneTrabecularV36(',
    "surfaceScratch('bone-v36-trabecular-body'",
    "'bone-v36-periosteal-envelope'",
    'var constructionMask = surfaceBoundaryEnvelopeCanvas(',
    'function strokeTrabecula(',
    'function drawOsteon(',
    "if (architecture === 'trabecular')"
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Bone Scaffold v36 trabecular-body integration is missing ${marker}.`);
  }
  for (const marker of [
    "bindProfileSelect('pMoireLattice'", "bindRange('pMoireResonance'",
    "bindProfileSelect('pNavePlan'", "bindRange('pNaveRibwork'",
    "bindProfileSelect('pCloisterTessellation'", "bindRange('pCloisterRelief'",
    "bindProfileSelect('pPrismOptics'", "bindRange('pPrismIridescence'",
    "bindProfileSelect('pTexturaGrammar'", "bindRange('pTexturaRhythm'",
    "surfaceChoice(glyphs, 'moireChoir', 'moireLattice'",
    "surfaceChoice(glyphs, 'naveCutter', 'navePlan'",
    "surfaceChoice(glyphs, 'cloisterFold', 'cloisterTessellation'",
    "surfaceChoice(glyphs, 'prismSacrament', 'prismOptics'",
    "surfaceChoice(glyphs, 'texturaMatrix', 'texturaGrammar'",
    "params.moireLattice = 'linear'", "params.navePlan = 'arcade'",
    "params.cloisterTessellation = 'strips'", "params.prismOptics = 'legacy'",
    "params.texturaGrammar = 'stems'", 'if (Number(data.version || 0) < 23)'
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Early Operator evolution state integration is missing ${marker}.`);
  }
  for (const marker of [
    "surfaceNodesForGlyphs(glyphs, 'moireChoir', 12", "topology === 'concentric'",
    "surfaceScratch('nave-cutter-v34-body-mask'", "plan === 'fan'", 'Ribwork detail',
    'var miuraGrid = []', "surfaceScratch('cloister-fold-piecewise-seams'",
    "surfaceScratch('prism-sacrament-rays'", "optics === 'fresnel'",
    'function traceTexturaGrammarStem(', "grammar === 'bastarda'"
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Early Operator evolved renderer is missing ${marker}.`);
  }
  for (const marker of [
    'topology: params.moireLattice', 'plan: params.navePlan',
    'topology: params.cloisterTessellation', 'optics: params.prismOptics',
    'grammar: params.texturaGrammar'
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Early Operator SVG metadata is missing ${marker}.`);
  }
  for (const marker of [
    "bindProfileSelect('pRasterScreen'", "bindRange('pRasterModulation'",
    "bindProfileSelect('pHatchGrammar'", "bindRange('pHatchDepth'",
    "bindProfileSelect('pFractureTopology'", "bindRange('pFractureEnergy'",
    "bindProfileSelect('pRibbonPath'", "bindRange('pRibbonWeave'",
    "surfaceChoice(glyphs, 'rasterPress', 'rasterScreen'",
    "surfaceChoice(glyphs, 'hatchEngrave', 'hatchGrammar'",
    "surfaceChoice(glyphs, 'cellFracture', 'fractureTopology'",
    "surfaceChoice(glyphs, 'ribbonEcho', 'ribbonPath'",
    "params.rasterScreen = 'legacy'", "params.hatchGrammar = 'legacy'",
    "params.fractureTopology = 'triangles'", "params.ribbonPath = 'legacy'",
    'if (Number(data.version || 0) < 24)'
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Adaptive Material state integration is missing ${marker}.`);
  }
  for (const marker of [
    'function renderRasterPressLegacy(', 'function renderHatchEngraveLegacy(',
    'function renderCellFractureLegacy(', 'function renderRibbonEchoLegacy(',
    "screen === 'line'", "screen === 'mezzotint'",
    "grammar === 'burin'", "grammar === 'crosscut'", "grammar === 'woodcut'",
    "topology === 'fault'", "topology === 'spall'", "topology === 'crystal'",
    "path === 'helix'", "path === 'fan'", "path === 'braid'",
    'Math.min(96', 'surfaceBoundaryDistance(source.data, width, height)'
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Adaptive Material renderer is missing ${marker}.`);
  }
  for (const marker of [
    'screen: params.rasterScreen, modulation: params.rasterModulation',
    'grammar: params.hatchGrammar, depth: params.hatchDepth',
    'topology: params.fractureTopology, energy: params.fractureEnergy',
    'path: params.ribbonPath, weave: params.ribbonWeave'
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Adaptive Material SVG metadata is missing ${marker}.`);
  }
  for (const marker of [
    "bindProfileSelect('pSigilTopology'", "bindRange('pSigilBinding'",
    "bindProfileSelect('pContourGrammar'", "bindRange('pContourRelief'",
    "bindProfileSelect('pRisoPlateMap'", "bindRange('pRisoPressure'",
    "bindProfileSelect('pCopyFailure'", "bindRange('pCopyInstability'",
    "bindProfileSelect('pSlitTimeMap'", "bindRange('pSlitNonlinearity'",
    "surfaceChoice(glyphs, 'sigilForge', 'sigilTopology'",
    "surfaceChoice(glyphs, 'contourEtch', 'contourGrammar'",
    "surfaceChoice(glyphs, 'risoSeparation', 'risoPlateMap'",
    "surfaceChoice(glyphs, 'copyDecay', 'copyFailure'",
    "surfaceChoice(glyphs, 'slitSweep', 'slitTimeMap'",
    "params.sigilTopology = 'legacy'", "params.contourGrammar = 'legacy'",
    "params.risoPlateMap = 'legacy'", "params.copyFailure = 'legacy'",
    "params.slitTimeMap = 'legacy'", 'if (Number(data.version || 0) < 25)'
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Five Process state integration is missing ${marker}.`);
  }
  for (const marker of [
    'function renderSigilForgeLegacy(', 'function renderContourEtchLegacy(',
    'function renderRisoSeparationLegacy(', 'function renderCopyDecayLegacy(',
    'function renderSlitSweepLegacy(', "topology === 'cartouche'",
    "topology === 'radial'", "topology === 'branching'",
    "grammar === 'terraces'", "grammar === 'watershed'",
    "plateMap === 'edge'", "plateMap === 'halftone'",
    "failure === 'banding'", "failure === 'ghosting'", "failure === 'residual'",
    "timeMap === 'feedback'", "timeMap === 'staircase'", 'function slitTimeCoordinate('
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Five Process renderer is missing ${marker}.`);
  }
  for (const marker of [
    '<option value="relief" selected>Hachure relief</option>',
    "contourGrammar: 'relief'", "contourSourceMode: 'ghost'",
    'function contourReliefFieldV57(', 'function contourReliefHachuresV57(',
    'function contourReliefCounterTicksV57(', 'function renderContourReliefV57(',
    "if (grammar === 'relief')", 'level % 5 === 0',
    'surfaceVoidTopology(field, width, height)', 'maximumMarks == null ? 12000',
    'Number(data.version || 0) < 57'
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Contour Etch v57 relief integration is missing ${marker}.`);
  }
  for (const marker of [
    'topology: params.sigilTopology, binding: params.sigilBinding',
    'grammar: params.contourGrammar, relief: params.contourRelief',
    'master: params.risoPlateMap, pressure: params.risoPressure',
    'failure: params.copyFailure, instability: params.copyInstability',
    'timeMap: params.slitTimeMap, nonlinearity: params.slitNonlinearity'
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Five Process SVG metadata is missing ${marker}.`);
  }
  for (const renderer of ['renderSigilForge', 'renderThornCrown', 'renderCipherLiturgy', 'renderBoneScaffold', 'renderRoseEngine', 'renderChromeReliquary', 'renderLigatureCrypt', 'renderMoireChoir', 'renderNaveCutter', 'renderCloisterFold', 'renderPrismSacrament', 'renderTexturaMatrix', 'renderVoidPortal', 'renderRecursiveShrine', 'renderMorphProcession', 'renderChimeraGraft', 'renderMonolithCast', 'renderRasterPress', 'renderHatchEngrave', 'renderContourEtch', 'renderPressureStroke', 'renderEtchantBloom', 'renderSinewTorque', 'renderCellFracture',
    'renderRibbonEcho', 'renderCopyDecay', 'renderRisoSeparation', 'renderSlitSweep']) {
    if (!applicationSource.includes(`function ${renderer}(`)) noteFailure(`${renderer} is missing from the surface renderer.`);
  }
  if (!authoredSource.includes('function renderSoftBlobSporeField(') || !authoredSource.includes('softBlobSporeReach')
    || !authoredSource.includes('softBlobSporeDensity') || !renderingSource.includes("'blob-spore-cloud-color'")) {
    noteFailure('Physarum Blob far-field spore rendering is incomplete.');
  }
  if (!authoredSource.includes("surfaceNodesForGlyphs(glyphs, 'sigilForge'") || !authoredSource.includes('function strokeBranch(')
    || !authoredSource.includes("sampleSurfaceMask(mask, Math.min(1, density / 2.2), true")
    || !authoredSource.includes('source.codePointAt(0)') || !authoredSource.includes("ctx.globalCompositeOperation = 'destination-in'")) {
    noteFailure('Digital Gothic Operator geometry, contour growth, or source-derived inscriptions are incomplete.');
  }
  for (const refinement of ['function drawLancet(', 'function drawHook(', 'function drawBud(',
    'function cipherSecondaryToken(', "return 'B' + binary.slice(-8)",
    "surfaceChoice(glyphs, 'thornCrown'", "surfaceChoice(glyphs, 'cipherLiturgy'",
    'var registerKind =', 'var armorStrength =', 'function drawTaperedArmature(',
    'var rootLimit = Math.min(72', 'function drawBasalPad(', 'function drawBackBarb(',
    'function drawTrident(']) {
    if (!applicationSource.includes(refinement)) noteFailure(`Digital Gothic ornament or inscription variation is missing ${refinement}.`);
  }
  if (!authoredSource.includes("surfaceBoundaryDistance(source.data, width, height)")
    || !authoredSource.includes("surfaceNodesForGlyphs(glyphs, 'roseEngine'")
    || !authoredSource.includes("surfaceHexRgb(surfaceEffectColor('chromeReliquary'))")
    || !authoredSource.includes('points.length < 2600') || !authoredSource.includes('ring < rings') || !authoredSource.includes('petal < petals')) {
    noteFailure('Cathedral Topology geometry, source linkage, or bounded rendering is incomplete.');
  }
  for (const refinement of ['function addPoint(x, y, distance, tangentX, tangentY, ridge)',
    'function drawRoseHub(hubRadius)', 'function chromeOffsetShell(name, shiftX, shiftY, color, opacity)',
    "chrome-reliquary-magenta-rim", "chrome-reliquary-white-rim", 'var acidAmount =',
    'function strokeBoneEdge(', 'function connectRidgeSlices(previous, current)',
    'forcedIndex < forcedEdges.length', 'var ringTipSets =', 'var posterSteps =']) {
    if (!applicationSource.includes(refinement)) noteFailure(`Cathedral Topology refinement is missing ${refinement}.`);
  }
  for (const refinement of ['function traceRoseEngineRail(', 'function traceRoseConnection(',
    'var satelliteCandidates = nodes.slice().sort', 'var environmentBand =',
    "surfaceScratch('chrome-reliquary-reflection'", 'var anisotropicGlint =',
    'function cipherCollectGroups(', 'function cipherMacroToken(', 'function drawCipherHierarchy()',
    'drawCipherHierarchy();', 'bone-scaffold-structural', 'function sampleSlice(',
    'function strokeRoseCurrentPath(', 'function drawRoseBoss(', 'var archivolt = 0']) {
    if (!applicationSource.includes(refinement)) noteFailure(`Second Operator quality pass is missing ${refinement}.`);
  }
  for (const key of ['boneOpacity', 'roseOpacity', 'chromeOpacity',
    'boneSourceOpacity', 'roseSourceOpacity', 'chromeSourceOpacity',
    'boneBlend', 'roseBlend', 'chromeBlend', 'boneColor', 'roseColor', 'chromeColor']) {
    if (!operatorParameterKeys.has(key)) noteFailure(`Cathedral Topology Surface Mixer state is missing ${key}.`);
  }
  if (!authoredSource.includes("surfaceNodesForGlyphs(glyphs, 'ligatureCrypt', 97")
    || !authoredSource.includes('pairs.length < 96') || !authoredSource.includes('traceLigatureCryptBand(ctx')
    || !authoredSource.includes('counterPair = pairs[c]') || !authoredSource.includes('function cutLigatureCryptAperture(')
    || !authoredSource.includes('function strokeLigatureCryptSpine(')
    || !authoredSource.includes('function ligatureCryptCurve(')
    || !authoredSource.includes('cryptHalfWidth * 0.46')) {
    noteFailure('Ligature Crypt source-order, bounded-band, or counter geometry is incomplete.');
  }
  for (const refinement of ['function traceLigatureConstructionBand(', 'function ligatureConstructionPoint(',
    "grammar !== 'ribbon'", 'constructionPairs.length < 96', 'Construction density',
    'line: Math.max(0, parseInt(el.dataset.line, 10) || 0)',
    'word: Math.max(0, parseInt(el.dataset.word, 10) || 0)',
    'constructionA.glyph.word !== constructionB.glyph.word', 'var joineryRailOffset =',
    'var freshStructure = {', 'el.dataset.line = freshStructure.line',
    'el.dataset.word = freshStructure.word']) {
    if (!applicationSource.includes(refinement)) noteFailure(`Ligature Crypt construction refinement is missing ${refinement}.`);
  }
  for (const refinement of ['function renderLigatureCryptV31(', 'function renderLigatureCryptV32(',
    'function ligatureCryptMaskAnchorV32(', 'function ligatureCryptPairCompatibleV32(',
    'sourceB !== sourceA + 1', 'function ligatureCryptDrawMortiseMaskV32(',
    'function ligatureCryptDrawBraidMaskV32(', 'function ligatureCryptPrepareSutureV32(',
    "surfaceScratch('ligature-crypt-word-form-v32'", 'line: source.line', 'word: source.word',
    'params.ligatureSourceOpacity = 0.12', 'Construction density', 'Mortise fusion',
    'Textura counter braid', 'Cut-edge suture']) {
    if (!applicationSource.includes(refinement)) noteFailure(`Ligature Crypt v32 word-form renderer is missing ${refinement}.`);
  }
  if ((authoredSource.match(/\.glyph\.line !== [^\n]*\.glyph\.line/g) || []).length < 2) {
    noteFailure('Ligature Crypt must reject cross-line joins in both construction and ribbon grammars.');
  }
  if (!authoredSource.includes("surfaceBoundaryDistance(source.data, width, height)")
    || !authoredSource.includes('secondFrequency = frequency') || !authoredSource.includes('phaseA - phaseB')
    || !authoredSource.includes("surfaceEffectColor('moireChoir')")) {
    noteFailure('Moiré Choir distance-linked detuned interference renderer is incomplete.');
  }
  for (const refinement of ["surfaceScratch('moire-choir-v35-wavefront-field'",
    'var thirdFrequency = frequency', 'thirdDistance = Infinity',
    'Math.PI * (radial - secondRadial) / pitch', 'var waveSum =',
    'var causticPhase =', 'var beatPhase = (phaseA - phaseB) * 0.5',
    'var antinodeRail =', 'var nodalRail =', 'var choralEnvelope =',
    'Nodal choir', 'Wavefront wells', 'Angular caustics', 'Woven beat lattice',
    'params.moireResonance = 0']) {
    if (!hasEditorOrMigrationMarker(refinement)) noteFailure(`Moiré Choir v35 wavefront-field refinement is missing ${refinement}.`);
  }
  if (!authoredSource.includes("buildSurfaceMask(glyphs, 'naveCutter'")
    || !authoredSource.includes("surfaceScratch('nave-cutter-supports'")
    || !authoredSource.includes("ctx.globalCompositeOperation = 'destination-out'")
    || !authoredSource.includes("supports.ctx.globalCompositeOperation = 'destination-in'")) {
    noteFailure('Nave Cutter subtractive apertures or mask-clipped buttresses are incomplete.');
  }
  for (const refinement of ["surfaceNodesForGlyphs(glyphs, 'naveCutter', 192",
    "surfaceScratch('nave-cutter-v34-masonry'", "surfaceScratch('nave-cutter-v34-rib-network'",
    'var groupsByLine = {}', 'function tracePointedOpening(', 'function strokeNaveRib(',
    'function drawNaveBoss(', 'function drawClusteredPier(',
    "ctx.globalCompositeOperation = 'destination-out'", 'voidAmount * (0.72 + voidAmount * 0.38)',
    "plan === 'loop'", "plan === 'clerestory'", 'params.naveSourceOpacity = 0.14', 'Legacy arcade · Rib 0']) {
    if (!applicationSource.includes(refinement)) noteFailure(`Nave Cutter v34 architectural-body refinement is missing ${refinement}.`);
  }
  for (const mapping of ['ligatureCrypt: renderLigatureCrypt', 'moireChoir: renderMoireChoir', 'naveCutter: renderNaveCutter']) {
    if (!hasRenderRouteMapping(mapping)) noteFailure(`Word-Bound Optical Architecture dispatch is missing ${mapping}.`);
  }
  for (const key of ['ligatureOpacity', 'moireOpacity', 'naveOpacity',
    'ligatureSourceOpacity', 'moireSourceOpacity', 'naveSourceOpacity',
    'ligatureBlend', 'moireBlend', 'naveBlend', 'ligatureColor', 'moireColor', 'naveColor']) {
    if (!operatorParameterKeys.has(key)) noteFailure(`Word-Bound Optical Architecture Surface Mixer state is missing ${key}.`);
  }
  for (const marker of ["ligatureCrypt: [{ key: 'ligatureReach'", "moireChoir: [{ key: 'moirePitch'", "naveCutter: [{ key: 'naveColumns'",
    "bindRange('pLigatureReach'", "bindRange('pMoirePitch'", "bindRange('pNaveColumns'",
    'reach: params.ligatureReach', 'pitch: params.moirePitch', 'columns: params.naveColumns']) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Word-Bound Optical Architecture Batch/Proof/binding/metadata integration is missing ${marker}.`);
  }
  if (!authoredSource.includes("buildSurfaceMask(glyphs, 'cloisterFold'")
    || !authoredSource.includes('function affineTriangle(')
    || !authoredSource.includes('ctx.setTransform(a, b, c, d, e, f)')
    || !authoredSource.includes('function foldVertex(')
    || !authoredSource.includes("surfaceScratch('cloister-fold-piecewise-body'")) {
    noteFailure('Cloister Fold coherent plane clipping or affine fold geometry is incomplete.');
  }
  for (const marker of [
    "if (topology === 'strips')", 'var accordionRows = []', 'var diamondGrid = []',
    'var fanInner = [], fanOuter = []', 'var miuraGrid = []',
    'var toneAmounts = [-0.84, -0.62, -0.4, -0.14, 0.08, 0.3, 0.54]',
    'function cloisterFacetTone(tone)', 'tone: cloisterFacetTone(tone)',
    'function facetInkForTone(tone)', 'facetInkCache.length < 7',
    'params.cloisterSourceOpacity = 0.14', 'Facet relief', 'Fold density',
    'Fold depth', 'Depth projection', 'Crease weight'
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Cloister Fold v32 piecewise-sheet refinement is missing ${marker}.`);
  }
  if (!authoredSource.includes("buildSurfaceMask(glyphs, 'prismSacrament'")
    || !authoredSource.includes('function signedDistanceAt(') || !authoredSource.includes('offsetA = baseShift + dispersion')
    || !authoredSource.includes('causticBand = outsideFalloff') || !authoredSource.includes('params.prismColorB')) {
    noteFailure('Prism Sacrament alpha-normal refraction, dispersion, or caustic rendering is incomplete.');
  }
  if (!authoredSource.includes("buildSurfaceMask(glyphs, 'texturaMatrix'")
    || !authoredSource.includes('function traceTexturaStem(') || !authoredSource.includes('runs.push({ x: sampleX')
    || !authoredSource.includes("ctx.globalCompositeOperation = 'destination-in'")) {
    noteFailure('Textura Matrix continuous-run reconstruction or source clipping is incomplete.');
  }
  for (const mapping of ['cloisterFold: renderCloisterFold', 'prismSacrament: renderPrismSacrament', 'texturaMatrix: renderTexturaMatrix']) {
    if (!hasRenderRouteMapping(mapping)) noteFailure(`Hard-Surface Rite dispatch is missing ${mapping}.`);
  }
  for (const key of ['cloisterOpacity', 'prismOpacity', 'texturaOpacity',
    'cloisterSourceOpacity', 'prismSourceOpacity', 'texturaSourceOpacity',
    'cloisterBlend', 'prismBlend', 'texturaBlend', 'cloisterColor', 'prismColorA', 'prismColorB', 'texturaColor']) {
    if (!operatorParameterKeys.has(key)) noteFailure(`Hard-Surface Rite Surface Mixer state is missing ${key}.`);
  }
  for (const marker of ["cloisterFold: [{ key: 'cloisterPlanes'", "prismSacrament: [{ key: 'prismRefraction'", "texturaMatrix: [{ key: 'texturaPitch'",
    "bindRange('pCloisterPlanes'", "bindRange('pPrismRefraction'", "bindRange('pTexturaPitch'",
    'planes: params.cloisterPlanes', 'refraction: params.prismRefraction', 'pitch: params.texturaPitch']) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Hard-Surface Rite Batch/Proof/binding/metadata integration is missing ${marker}.`);
  }
  if (!authoredSource.includes('function surfaceVoidApertureMask(')
    || !authoredSource.includes('var queue = new Int32Array(count)')
    || !authoredSource.includes('var enclosed = !solid[i] && !outside[i]')
    || !authoredSource.includes("buildSurfaceMask(glyphs, 'voidPortal'")) {
    noteFailure('Void Portal counter flood-fill, chamber detection, or source-mask routing is incomplete.');
  }
  if (!authoredSource.includes("buildSurfaceMask(glyphs, 'recursiveShrine'")
    || !authoredSource.includes('function drawRecursiveMask(')
    || !authoredSource.includes('function renderRecursiveShrineLegacy(')
    || !authoredSource.includes("xorLayer.ctx.globalCompositeOperation = 'xor'")
    || !authoredSource.includes('iteration < iterations')) {
    noteFailure('Recursive Shrine Legacy affine recursion or parity/XOR rendering is incomplete.');
  }
  if (!authoredSource.includes('function surfaceMorphGlyphField(')
    || !authoredSource.includes('var signed = new Float32Array(size * size)')
    || !authoredSource.includes("buildSurfaceMask(glyphs, 'morphProcession'")
    || !authoredSource.includes('pairIndex < 12')) {
    noteFailure('Morph Procession signed-distance interpolation or bounded pair rendering is incomplete.');
  }
  for (const mapping of ['voidPortal: renderVoidPortal', 'recursiveShrine: renderRecursiveShrine', 'morphProcession: renderMorphProcession']) {
    if (!hasRenderRouteMapping(mapping)) noteFailure(`Null-Space Logic dispatch is missing ${mapping}.`);
  }
  for (const key of ['voidOpacity', 'recursiveOpacity', 'morphOpacity',
    'voidSourceOpacity', 'recursiveSourceOpacity', 'morphSourceOpacity',
    'voidBlend', 'recursiveBlend', 'morphBlend', 'voidColor', 'recursiveColor', 'morphColor']) {
    if (!operatorParameterKeys.has(key)) noteFailure(`Null-Space Logic Surface Mixer state is missing ${key}.`);
  }
  for (const marker of ["voidPortal: [{ key: 'voidDepth'", "recursiveShrine: [{ key: 'recursiveScale'", "morphProcession: [{ key: 'morphInbetweens'",
    "bindRange('pVoidDepth'", "bindRange('pRecursiveIterations'", "bindRange('pMorphInbetweens'",
    'depth: params.voidDepth', 'iterations: params.recursiveIterations', 'inbetweens: params.morphInbetweens']) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Null-Space Logic Batch/Proof/binding/metadata integration is missing ${marker}.`);
  }
  if (!authoredSource.includes("buildSurfaceMask(glyphs, 'monolithCast'")
    || !authoredSource.includes('var course = Math.floor((y - originY) / moduleSize)')
    || !authoredSource.includes('surfaceVoidApertureMask(mask, 0)')
    || !authoredSource.includes('var courseGroove = formwork')) {
    noteFailure('Monolith Cast legacy mass, construction-course, counter, or formwork rendering is incomplete.');
  }
  if (!ids.has('pMonolithGrammar')
    || !authoredSource.includes("monolithGrammar: ['legacy', 'strata', 'ashlar', 'vault', 'stereotomy']")
    || !authoredSource.includes("bindProfileSelect('pMonolithGrammar', 'monolithGrammar'")
    || !authoredSource.includes("surfaceChoice(glyphs, 'monolithCast', 'monolithGrammar'")
    || !authoredSource.includes('function renderMonolithCastLegacy(')
    || !authoredSource.includes('function monolithGlyphBoundsV35(')
    || !authoredSource.includes('function monolithBodyV35(')
    || !authoredSource.includes('function monolithDrawStrataV35(')
    || !authoredSource.includes('function monolithDrawAshlarV35(')
    || !authoredSource.includes('function monolithDrawVaultV35(')
    || !authoredSource.includes('function monolithDrawStereotomyV35(')
    || !authoredSource.includes('voidPortalGlyphScanV33(entry.glyph, bounds')
    || !migrationSource.includes('var legacyMonolithCast = Number(data.version || 0) < 35')
    || !migrationSource.includes("params.monolithGrammar = 'legacy'")
    || !migrationSource.includes("batchProfiles[monolithProfileKey].monolithGrammar = 'legacy'")) {
    noteFailure('Monolith Cast v35 grammar, glyph-local construction renderer, or v34 compatibility migration is incomplete.');
  }
  if (!authoredSource.includes("buildSurfaceMask(glyphs, 'chimeraGraft'")
    || !authoredSource.includes('var donor = active[(hostIndex + 1) % active.length]')
    || !authoredSource.includes('work.ctx.bezierCurveTo(')
    || !authoredSource.includes('work.ctx.ellipse(targetX, targetY')
    || !authoredSource.includes("work.ctx.globalCompositeOperation = 'destination-out'")) {
    noteFailure('Chimera Graft donor, tissue, transplant, or incision rendering is incomplete.');
  }
  if (!authoredSource.includes("surfaceAggregate(glyphs, 'pressureStroke', 'pressureBreath'")
    || !authoredSource.includes("surfaceAggregate(glyphs, 'pressureStroke', 'pressureDryness'")
    || !authoredSource.includes("surfaceAggregate(glyphs, 'pressureStroke', 'pressureTaper'")
    || !authoredSource.includes('var respiration = Math.sin(phase')
    || !authoredSource.includes('coverage *= retention')) {
    noteFailure('Pressure Stroke breath, dry-brush, taper, or unified energy field is incomplete.');
  }
  for (const mapping of ['chimeraGraft: renderChimeraGraft', 'monolithCast: renderMonolithCast']) {
    if (!hasRenderRouteMapping(mapping)) noteFailure(`Body-Energy-Relation dispatch is missing ${mapping}.`);
  }
  for (const key of ['chimeraOpacity', 'monolithOpacity', 'chimeraSourceOpacity', 'monolithSourceOpacity',
    'chimeraBlend', 'monolithBlend', 'chimeraColor', 'monolithColor']) {
    if (!operatorParameterKeys.has(key)) noteFailure(`Body-Energy-Relation Surface Mixer state is missing ${key}.`);
  }
  for (const marker of ["chimeraGraft: [{ key: 'chimeraGrafts'", "monolithCast: [{ key: 'monolithMass'", "pressureStroke: [{ key: 'pressureBreath'",
    "bindRange('pChimeraGrafts'", "bindRange('pMonolithMass'", "bindRange('pPressureBreath'",
    'grafts: params.chimeraGrafts', 'mass: params.monolithMass', 'breath: params.pressureBreath']) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Body-Energy-Relation Batch/Proof/binding/metadata integration is missing ${marker}.`);
  }
  if (!authoredSource.includes("buildSurfaceMask(glyphs, 'etchantBloom'")
    || !authoredSource.includes('var chemicalA = new Float32Array(count)')
    || !authoredSource.includes('var reaction = a * b * b')
    || !authoredSource.includes('var permitted = new Float32Array(count)')
    || !authoredSource.includes("paintSurfaceMask(targetCtx, expanded.canvas, surfaceEffectColor('etchantBloom')")) {
    noteFailure('Etchant Bloom reaction-diffusion field, glyph boundary, or colored output is incomplete.');
  }
  if (!authoredSource.includes("buildSurfaceMask(glyphs, 'sinewTorque'")
    || !authoredSource.includes('function sourceAlphaAt(x, y)')
    || !authoredSource.includes('for (var solve = 0; solve < 4; solve++)')
    || !authoredSource.includes('Math.exp(waistAmount * centerPressure * 0.42)')
    || !authoredSource.includes("paintSurfaceMask(targetCtx, warped.canvas, surfaceEffectColor('sinewTorque')")) {
    noteFailure('Sinew Torque continuous inverse warp, bilinear sampling, or colored output is incomplete.');
  }
  for (const mapping of ['etchantBloom: renderEtchantBloom', 'sinewTorque: renderSinewTorque']) {
    if (!hasRenderRouteMapping(mapping)) noteFailure(`Morphogenetic Body Fields dispatch is missing ${mapping}.`);
  }
  for (const key of ['etchantOpacity', 'sinewOpacity', 'etchantSourceOpacity', 'sinewSourceOpacity',
    'etchantBlend', 'sinewBlend', 'etchantColor', 'sinewColor']) {
    if (!operatorParameterKeys.has(key)) noteFailure(`Morphogenetic Body Fields Surface Mixer state is missing ${key}.`);
  }
  for (const marker of ["etchantBloom: [{ key: 'etchantPattern'", "sinewTorque: [{ key: 'sinewPull'",
    "bindRange('pEtchantPattern'", "bindRange('pSinewPull'",
    'morphology: params.etchantPattern', 'pull: params.sinewPull']) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Morphogenetic Body Fields Batch/Proof/binding/metadata integration is missing ${marker}.`);
  }
  if (!authoredSource.includes('function signedStretch(amount, response)')
    || !authoredSource.includes('Math.exp(info.currentIntensity * response * amount)')
    || !authoredSource.includes('stretchX < 0.04')) {
    noteFailure('Stretch no longer supports continuous signed compression and extreme expansion.');
  }
  if (operatorRegistry.byId.prismSacrament.keys.secondaryColor !== 'prismColorB'
    || !authoredSource.includes('SURFACE_SECONDARY_COLOR_KEYS[params.activeOperator]')) {
    noteFailure('Surface Mixer secondary effect-ink routing is not extensible beyond Riso Separation.');
  }
  if (!/id=["']surfaceFxCanvas["']/.test(markupOnly) || !authoredSource.includes('renderSurfaceFxLayer')) {
    noteFailure('The shared procedural surface renderer is incomplete.');
  }
  if (!authoredSource.includes('surfaceEffectColor') || !authoredSource.includes('surfaceSourceOpacity') || !authoredSource.includes('compositeSurfaceSource')) {
    noteFailure('Independent effect color or source-text compositing is missing from the surface renderer.');
  }
  for (const id of ['surfaceMixerBlock', 'pSurfaceOpacity', 'vSurfaceOpacity', 'pSurfaceBlend',
    'btnSurfaceBack', 'btnSurfaceFront', 'surfaceOrderLabel']) {
    if (!ids.has(id)) noteFailure(`Surface Mixer is missing ${id}.`);
  }
  if (!authoredSource.includes('SURFACE_OPACITY_KEYS') || !authoredSource.includes('SURFACE_BLEND_KEYS')
    || !authoredSource.includes('normalizedSurfaceRenderOrder') || !authoredSource.includes('surfaceMixerChanged')) {
    noteFailure('Surface Mixer state, migration, or UI wiring is incomplete.');
  }
  if (!authoredSource.includes("'operatorPanelsBlock', 'surfaceMixerBlock', 'effectExtrasBlock'")) {
    noteFailure('Surface Mixer is not routed into the progressive Effect workflow.');
  }
  if (!authoredSource.includes('targetCtx.globalAlpha = renderEngine.surfaceOutputOpacity(id)')
    || !authoredSource.includes('targetCtx.globalCompositeOperation = renderEngine.surfaceBlendMode(id)')) {
    noteFailure('Surface render layers no longer composite with independent opacity and blend mode.');
  }
  if (!html.includes('data-surface-effect-opacity="0.5"') || !authoredSource.includes('setActiveSurfaceOpacity')
    || !authoredSource.includes('surfaceOpacityPresetButtons')) {
    noteFailure('Surface Mixer no longer exposes touch-friendly effect-opacity controls.');
  }
  if (authoredSource.includes('surfaceGlyphStrength(g, id) * surfaceOutputOpacity(id)')
    || authoredSource.includes('surfaceOperatorStrength(info, id) * surfaceOutputOpacity(id)')) {
    noteFailure('Effect opacity is coupled to source-text opacity.');
  }
  if (!authoredSource.includes('applySurfaceSourceVisual') || !authoredSource.includes('updateAllSurfaceSourceVisuals')
    || !markupOnly.includes('.stage .c[data-surface-source]')) {
    noteFailure('Live editable glyphs no longer expose continuous source-opacity compositing.');
  }
  if (!authoredSource.includes('surfaceEffects: {') || !authoredSource.includes('surfaceMixer: { order: surfaceRenderOrder()')) {
    noteFailure('SVG metadata does not preserve procedural surface output settings.');
  }
  for (const id of ['pMatrixGrammar', 'pMatrixSignal', 'pMatrixReading', 'pMatrixColumns', 'pMatrixRows',
    'pMatrixMinScale', 'pMatrixMaxScale', 'pMatrixSpan', 'pMatrixEmphasis', 'pMatrixAlignment',
    'pMatrixCopies', 'pMatrixMargin', 'pMatrixGutter', 'pMatrixVoidX', 'pMatrixVoidY',
    'pMatrixVoidSize', 'pMatrixCollision', 'pMatrixRotation', 'pMatrixJitter', 'pMatrixMorph',
    'pMatrixColorMode', 'pMatrixGuides', 'pMatrixGuideOpacity']) {
    if (!ids.has(id)) noteFailure(`Type Matrix is missing ${id}.`);
  }
  if (!authoredSource.includes("typeMatrix: { id: 'typeMatrix', label: 'Type Matrix' }")
    || !authoredSource.includes('function generateTypeMatrixScene(')
    || !authoredSource.includes("'typeMatrix', 'Type Matrix', renderEngine.generateTypeMatrixScene")
    || !authoredSource.includes('editorialSignal:') || !authoredSource.includes('kineticTension:')) {
    noteFailure('Type Matrix definition, generator, registry, or presets are incomplete.');
  }
  for (const id of ['pPathGrammar', 'pPathStrands', 'pPathCopies', 'pPathSpread', 'btnPathDraw', 'btnPathClear', 'pathLoomStatus',
    'pPathFlow', 'pPathSpacingMode', 'pPathSpacing', 'pPathStart', 'pPathLength', 'pPathOrientation', 'pPathFlip', 'pPathCollision',
    'pPathAmplitude', 'pPathTurns', 'pPathWeave', 'pPathPush', 'pPathScale', 'pPathScalePulse', 'pPathTravel', 'pPathLoop',
    'pPathSmoothing', 'pPathColorMode', 'pPathGuides', 'pPathGuideOpacity']) {
    if (!ids.has(id)) noteFailure(`Path Loom is missing ${id}.`);
  }
  for (const fn of ['pathLoomSimplifyPoints', 'pathLoomSmoothPoints', 'pathLoomPointAt', 'createPathLoomBasePath',
    'offsetPathLoomPolyline', 'generatePathLoomScene', 'beginPathLoomDrawing', 'stopPathLoomDrawing']) {
    if (!applicationSource.includes(`function ${fn}(`)) noteFailure(`Path Loom is missing ${fn}().`);
  }
  if (!authoredSource.includes("pathLoom: { id: 'pathLoom', label: 'Path Loom' }")
    || !authoredSource.includes("'pathLoom', 'Path Loom', renderEngine.generatePathLoomScene")
    || !authoredSource.includes('counterBraid:') || !authoredSource.includes('orbitChorus:') || !authoredSource.includes('kineticCoil:')
    || !authoredSource.includes('customPath: []') || !authoredSource.includes('customPathPoints: loom.customPath.length')) {
    noteFailure('Path Loom definition, registry, recipes, or custom-path persistence is incomplete.');
  }
  if (!html.includes('min="0.03" max="12"') || !html.includes('min="-4" max="4"')
    || !html.includes('min="-8" max="8"') || !html.includes('min="-3" max="3"')) {
    noteFailure('Path Loom does not expose the intended extreme parameter ranges.');
  }
  for (const id of ['pSignalRouterPreset', 'btnSignalRouterPresetApply',
    'pSignal1Enabled', 'pSignal1Source', 'pSignal1Shape', 'pSignal1Range', 'pSignal1Target', 'pSignal1Amount', 'pSignal1Frequency', 'pSignal1Phase', 'pSignal1Motion', 'pSignal1Steps', 'pSignal1Color',
    'pSignal2Enabled', 'pSignal2Source', 'pSignal2Shape', 'pSignal2Range', 'pSignal2Target', 'pSignal2Amount', 'pSignal2Frequency', 'pSignal2Phase', 'pSignal2Motion', 'pSignal2Steps', 'pSignal2Color',
    'pSignal3Enabled', 'pSignal3Source', 'pSignal3Shape', 'pSignal3Range', 'pSignal3Target', 'pSignal3Amount', 'pSignal3Frequency', 'pSignal3Phase', 'pSignal3Motion', 'pSignal3Steps', 'pSignal3Color']) {
    if (!ids.has(id)) noteFailure(`Glyph Signal Router is missing ${id}.`);
  }
  for (const fn of ['compositionSignalSource', 'compositionSignalShape', 'applyCompositionSignalRouter']) {
    if (!applicationSource.includes(`function ${fn}(`)) noteFailure(`Glyph Signal Router is missing ${fn}().`);
  }
  if (!authoredSource.includes('SIGNAL_ROUTER_PRESETS') || !authoredSource.includes('generated = applyCompositionSignalRouter(generated, compiled, width, height)')) {
    noteFailure('Glyph Signal Router recipes or scene-pipeline integration are incomplete.');
  }
  if (!authoredSource.includes('schemaVersion: 10') || !authoredSource.includes('out.schemaVersion = 10')) {
    noteFailure('Composition schema version 10 is incomplete.');
  }
  for (const id of ['pVesselSource', 'pVesselGlyph', 'pVesselMode', 'pVesselUnit', 'pVesselCount',
    'pVesselMinScale', 'pVesselMaxScale', 'pVesselGap', 'pVesselRelaxation', 'pVesselThreshold',
    'pVesselEdgePull', 'pVesselSizeSignal', 'pVesselOrientation', 'pVesselMotion', 'pVesselColorMode',
    'pVesselColorA', 'pVesselColorB', 'pVesselColorC', 'pVesselGuides', 'pVesselImageFile']) {
    if (!ids.has(id)) noteFailure(`Glyph Vessel is missing #${id}.`);
  }
  for (const fn of ['glyphVesselBuildField', 'glyphVesselSample', 'glyphVesselUnits',
    'glyphVesselGuideBands', 'generateGlyphVesselScene', 'syncGlyphVesselUI']) {
    if (!applicationSource.includes(`function ${fn}(`)) noteFailure(`Glyph Vessel is missing ${fn}().`);
  }
  if (!authoredSource.includes("glyphVessel: compositionEngineContract(") ||
      !authoredSource.includes("['counterformPress', 'packedManifesto', 'portraitField', 'edgeAssembly', 'ruptureVessel']")) {
    noteFailure('Glyph Vessel registry or preset contract is incomplete.');
  }
  if (!authoredSource.includes('var state = { active: mobileActiveSection, compositionInspector: panelState.compositionInspector };')
    || !authoredSource.includes('function restoredWorkflowSection(saved)')
    || !authoredSource.includes('if (saved && COMPOSITION_DEFS[saved.compositionInspector]) panelState.compositionInspector = saved.compositionInspector;')
    || !authoredSource.includes('var initialWorkflowSection = restoredWorkflowSection(saved);')
    || !authoredSource.includes('var shouldOpen = key === initialWorkflowSection;')
    || !authoredSource.includes('compositionInspector = silent && COMPOSITION_DEFS[localCompositionInspector]')) {
    noteFailure('The active workflow section or draft Compose engine is not persisted.');
  }
  if (!ids.has('compositionEngineGuide')
    || !authoredSource.includes('var COMPOSITION_ENGINE_GUIDES = {')
    || !authoredSource.includes("glyphVessel: 'Glyph Vessel —")
    || !authoredSource.includes("document.getElementById('compositionEngineGuide').textContent = COMPOSITION_ENGINE_GUIDES[compositionInspector]")) {
    noteFailure('Compose does not explain the selected engine before its dense controls.');
  }
  if (!html.includes('id="mobileSheetTitle" tabindex="-1"')
    || !authoredSource.includes('var mobileSheetReturnFocus = null;')
    || !authoredSource.includes("controlPanel.setAttribute('role', 'dialog')")
    || !authoredSource.includes("title.focus({ preventScroll: true })")) {
    noteFailure('The mobile workflow sheet no longer establishes and restores a clear focus context.');
  }
  if (!ids.has('btnMobileParameterSearch')
    || !authoredSource.includes('function openParameterSearch()')
    || !authoredSource.includes("document.getElementById('btnMobileParameterSearch').addEventListener('click', openParameterSearch)")
    || !authoredSource.includes('var hasActiveSearch = Boolean(search.value || parameterChangedOnly);')
    || !authoredSource.includes('event.stopPropagation();')
    || !authoredSource.includes('var parameterSearchPointerActive = false;')
    || !authoredSource.includes("document.addEventListener('pointerup', finishParameterSearchPointer)")
    || !authoredSource.includes('function keepParameterResultsVisible(search, results)')
    || !html.includes('.panel.mobile-text-focus .stage-actions { display: none; }')) {
    noteFailure('Mobile parameter search is not discoverable or Escape can close it while clearing a filter.');
  }
  if (!authoredSource.includes('var operatorDefinition = OPERATOR_DEFS[operatorId];')
    || !authoredSource.includes('var compositionDefinition = COMPOSITION_DEFS[compositionId];')) {
    noteFailure('Parameter search results no longer use the visible operator and composition names.');
  }
  for (const id of ['btnOperatorBrowser', 'operatorGuideCategory', 'operatorGuideSummary',
    'operatorBrowser', 'operatorBrowserKicker', 'operatorBrowserTitle', 'operatorBrowserSearch', 'operatorBrowserCategory',
    'operatorBrowserStatus', 'operatorBrowserList', 'btnOperatorBrowserClose']) {
    if (!ids.has(id)) noteFailure(`Effect Browser is missing ${id}.`);
  }
  const missingGuides=operatorRegistry.specs.filter(spec=>typeof spec.guide!=='string'||!spec.guide.trim()).map(spec=>spec.id);
  if(missingGuides.length)noteFailure('Effect Browser guide coverage mismatch: '+missingGuides.join(','));
  if (!authoredSource.includes('function renderOperatorBrowser()')
    || !authoredSource.includes('function syncOperatorGuide()')
    || !authoredSource.includes("setActiveOperator(button.dataset.operatorBrowserId, 'user')")
    || !authoredSource.includes("operatorBrowser.addEventListener('keydown'")
    || !authoredSource.includes("operatorBrowserReturnFocus")
    || !authoredSource.includes('var currentIndex = focusable.indexOf(document.activeElement);')
    || !authoredSource.includes('if (operatorChanged) markAutosaveDirty();')
    || !authoredSource.includes('select[id^="p"]:not(#pOperator)')
    || !html.includes('id="pOperator" aria-describedby="operatorGuideSummary"')) {
    noteFailure('Effect Browser search, selection, persistence, focus return, or current-effect explanation is incomplete.');
  }
  for (const id of ['applicationModeHint', 'applicationQuickTitle', 'applicationQuickStatus', 'btnApplyCurrentTarget', 'btnReleaseCurrentTarget', 'pBatchGroup', 'batchTargetName']) {
    if (!ids.has(id)) noteFailure(`Apply-stage quick action is missing ${id}.`);
  }
  if (!authoredSource.includes('function matchingBatchMetrics(')
    || !authoredSource.includes('function updateApplicationSummary()')
    || !authoredSource.includes("batchToggle(batchMatchers[activeBatchProfile] || batchMatchers.none, true)")
    || !authoredSource.includes("batchToggle(batchMatchers[activeBatchProfile] || batchMatchers.none, false)")
    || !html.includes('.panel-section[data-panel-section="apply"] .stage-lede { display: none; }')) {
    noteFailure('The selected Effect cannot be applied to the current target from the first Apply-stage viewport.');
  }
  if (!authoredSource.includes('var partial = toggled > 0 && !allOn;')
    || !authoredSource.includes('var releasing = 0;')
    || !authoredSource.includes("'\u6587\u5b57\u3092\u89e3\u9664\u4e2d\u2026'")
    || authoredSource.includes('var partial = affected > 0 && !allOn;')) {
    noteFailure('Quick apply confuses visual easing residue with a still-applied Effect after release.');
  }
  if (!html.includes('<span>Active / 作用中</span>')
    || !authoredSource.includes("var activeLayerCount = active.length + (compositionActive ? 1 : 0);")
    || !authoredSource.includes("activeLayerCount + ' active / ' + activeLayerCount + '件'")
    || authoredSource.includes("' / ' + (OPERATOR_IDS.length + 1)")) {
    noteFailure('The Apply-stage active inventory still presents Composition as a missing Effect count.');
  }
  for (const id of ['exportQuickTitle', 'exportQuickSummary', 'btnQuickPreview', 'btnQuickPng', 'btnQuickSvg',
    'exportActionStatus', 'exportQuickActionStatus']) {
    if (!ids.has(id)) noteFailure(`Mobile Quick export is missing ${id}.`);
  }
  if (!html.includes('.export-quick { display: grid;')
    || !authoredSource.includes("document.getElementById('btnQuickPreview').addEventListener('click'")
    || !authoredSource.includes("document.getElementById('btnQuickPng').addEventListener('click'")
    || !authoredSource.includes("document.getElementById('btnQuickSvg').addEventListener('click'")
    || !authoredSource.includes("var quick = document.getElementById('exportQuickSummary');")) {
    noteFailure('Mobile Export does not expose visible Preview/PNG/SVG actions or keep their summary in sync.');
  }
  if (!authoredSource.includes('function previewScaleForLayout(width, height, requestedScale)')
    || !authoredSource.includes('var renderScale = previewMode ? previewScaleForLayout(L.w, L.h, requestedScale) : requestedScale;')
    || !authoredSource.includes('renderCanvas(params.exportScale, true)')
    || !authoredSource.includes('canvas.dataset.previewRequestedWidth')
    || !authoredSource.includes("' px preview'")) {
    noteFailure('Preview still renders the full export scale instead of a bounded calibration image.');
  }
  if (!authoredSource.includes('function hasExportDeformation()')
    || !authoredSource.includes('function updateExportActionAvailability()')
    || !authoredSource.includes("var actionIds = ['btnPng', 'btnSvg', 'btnCopy', 'btnPreview', 'btnQuickPreview', 'btnQuickPng', 'btnQuickSvg', 'btnMobilePreview', 'btnHeaderPreview', 'btnHighQualityCheck'];")
    || !authoredSource.includes("'変形のみ：対象なし'")
    || !authoredSource.includes('updateExportActionAvailability();')) {
    noteFailure('Deformed-only export actions still open a blocking alert when the artwork has no deformation.');
  }
  if (!authoredSource.includes('function downloadOutcomeLabel(mode)')
    || !authoredSource.includes("return 'share';")
    || !authoredSource.includes("return 'tab';")
    || !authoredSource.includes("return 'download';")
    || !authoredSource.includes("if (mode === 'share') return 'share sheet requested';")
    || !authoredSource.includes("if (mode === 'tab') return 'opened in a new tab';")) {
    noteFailure('Download actions no longer report the desktop, iOS share-sheet, or iOS tab outcome.');
  }
  if (!authoredSource.includes('var exportActionStatuses = [')
    || !authoredSource.includes("document.getElementById('exportActionStatus')")
    || !authoredSource.includes("document.getElementById('exportQuickActionStatus')")
    || !authoredSource.includes('function setExportActionStatus(message, state)')
    || !authoredSource.includes("setExportActionStatus('Generating PNG…', 'working')")
    || !authoredSource.includes("exportReadyMessage('PNG', pngCanvas.width, pngCanvas.height, mode)")
    || !authoredSource.includes("setExportActionStatus('Generating View shot…', 'working')")
    || !authoredSource.includes("exportReadyMessage('View shot', shotCanvas.width, shotCanvas.height, mode)")
    || !authoredSource.includes("setExportActionStatus('Preparing PNG for clipboard…', 'working')")
    || !authoredSource.includes("setExportActionStatus('Generating SVG…', 'working')")
    || !authoredSource.includes("exportReadyMessage('SVG', W, H, mode)")) {
    noteFailure('PNG, SVG, View shot, or clipboard actions no longer expose mirrored working and completion feedback.');
  }
  const dataMoshValuesFunction = authoredSource.match(/function dataMoshValues\(info, deform\) \{[\s\S]*?(?=\n\s*function applyDataMoshVisual)/)?.[0] || '';
  if (!dataMoshValuesFunction.includes("var active = state.manual != null || strength > 0.001;")
    || !dataMoshValuesFunction.includes('if (!active) return {')
    || !dataMoshValuesFunction.includes('scaleX: 1, scaleY: 1')
    || !dataMoshValuesFunction.includes('passAX: 0, passAY: 0, passBX: 0, passBY: 0')
    || !dataMoshValuesFunction.includes('active: false')) {
    noteFailure('Unapplied Data Mosh does not return a complete identity transform before its destructive hash logic.');
  }
  if (!authoredSource.includes('var disabled = compositionState.enabled;')
    || !authoredSource.includes("if (gridSettingsLink) gridSettingsLink.click();")
    || !authoredSource.includes("openMobileSheet('compose', 'pGridEnabled')")
    || !authoredSource.includes('function revealMobileSheetAnchor(anchor)')
    || !html.includes('.panel-section[data-panel-section="compose"] #composeGridSlot { order: 1; }')
    || authoredSource.includes('var disabled = !params.gridEnabled || compositionState.enabled;')) {
    noteFailure('Arrange cannot route a Grid-off user to Grid settings.');
  }
  if (!renderingSource.includes('var frontCoreIndex = Math.min(cores.length - 1,')
    || renderingSource.includes('var core = cores[front];')) {
    noteFailure('Physarum spore fronts can index past a sparse core array.');
  }
  const stagePointerEnterStart = authoredSource.indexOf("stage.addEventListener('pointerenter'");
  const stagePointerMoveStart = authoredSource.indexOf("stage.addEventListener('pointermove'", stagePointerEnterStart);
  const stagePointerEnterBody = stagePointerEnterStart >= 0 && stagePointerMoveStart > stagePointerEnterStart
    ? authoredSource.slice(stagePointerEnterStart, stagePointerMoveStart)
    : '';
  if (!stagePointerEnterBody || stagePointerEnterBody.includes('pointer.active = true')
    || !authoredSource.includes("if (!pointer.active && params.mode === 'flow') pushHistory();")
    || !authoredSource.includes('var pointerDriving = pointer.active || pointer.pulse;')
    || !authoredSource.includes('pointer.pulse = true;')) {
    noteFailure('A stationary pointer can paint a Lens Effect when a control sheet moves the canvas underneath it.');
  }
  if (!authoredSource.includes("item.count === 1 ? ' glyph' : ' glyphs'")) {
    noteFailure('The active Effect inventory announces a singular glyph as plural.');
  }
  if (!authoredSource.includes('function uiScrollBehavior()')
    || (authoredSource.match(/behavior:\s*'smooth'/g) || []).length > 0) {
    noteFailure('UI reveal scrolling no longer respects reduced-motion preferences.');
  }
  if (!authoredSource.includes('compositionBody.insertBefore(compositionBuildBlock, compositionPerformBlock)')
    || !/<span class="index">02<\/span><span>Build<\/span>/.test(html)
    || !/<span class="index">03<\/span><span>Perform<\/span>/.test(html)) {
    noteFailure('Compose build and performance controls are no longer in a consistent task order.');
  }
  if (!/\.composition-actions-sticky\s*>\s*\.primary\s*\{[^}]*background:\s*var\(--ink\);[^}]*color:\s*var\(--paper\);/s.test(html)) {
    noteFailure('The sticky Compose Apply action can lose text contrast in a retained hover state.');
  }
  if (!html.includes('.mobile-topbar button:not(:disabled):hover { background: var(--ink); color: var(--paper); transform: none; box-shadow: none; }')
    || !html.includes('.mobile-topbar button:not(:disabled):hover { background: transparent; color: var(--ink); }')
    || !html.includes('.mobile-topbar button:not(:disabled):active { background: var(--ink); color: var(--paper); }')) {
    noteFailure('The mobile topbar can lose text contrast after a retained touch or hover state.');
  }
  if (!/\.panel\s+input\[type=["']checkbox["']\]\s*\{[^}]*flex:\s*0\s+0\s+44px;[^}]*width:\s*44px;[^}]*height:\s*44px;/s.test(html)
    || !/\.panel\s+details\s*>\s*summary\s*\{[^}]*min-height:\s*44px;/s.test(html)
    || !/\.panel\s+button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s.test(html)
    || !/\.panel\s+\.parameter-row-reset\s*\{[^}]*min-width:\s*44px;/s.test(html)) {
    noteFailure('Mobile buttons, checkboxes, disclosures, or row resets can fall below the 44 px touch target.');
  }
  if (!/\.panel\s+\.row\.has-parameter-reset\s*\{[^}]*padding-right:\s*0\.4rem;/s.test(html)
    || !/\.panel\s+\.row\.has-parameter-reset\.is-parameter-modified\s*\{[^}]*padding-right:\s*3\.2rem;/s.test(html)
    || !/@media\s*\(max-width:\s*760px\)\s*and\s*\(max-height:\s*620px\)[\s\S]*?\.panel\s+\.stage-actions\s*\{[^}]*position:\s*static;/s.test(html)) {
    noteFailure('Mobile reset spacing or short-viewport Next actions can cover nearby controls.');
  }
  if (/#modeHelp\s*\{[^}]*display:\s*none;/s.test(authoredSource)) {
    noteFailure('Application help opens to an empty disclosure on mobile.');
  }
  if (!/id="btnHeaderUndo"[^>]*\sdisabled/.test(html)
    || !/id="btnHeaderRedo"[^>]*\sdisabled/.test(html)
    || !/id="btnMobileUndo"[^>]*\sdisabled/.test(html)
    || !/id="btnMobileRedo"[^>]*\sdisabled/.test(html)
    || !authoredSource.includes('function syncHistoryControls()')
    || !authoredSource.includes("'|U=' + uiSnapshot")
    || !authoredSource.includes('function recordHistorySnapshot(s)')
    || !authoredSource.includes('function initControlHistoryTracking()')) {
    noteFailure('Undo/Redo availability or full parameter-history tracking is incomplete.');
  }
  if (!html.includes('aria-keyshortcuts="Control+Z Meta+Z"')
    || !html.includes('aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z"')
    || !authoredSource.includes('function keepsNativeHistoryTarget(target)')
    || !authoredSource.includes("shortcutKey === 'y' || e.shiftKey")) {
    noteFailure('Undo/Redo keyboard shortcuts are incomplete or incorrectly delegated to non-text controls.');
  }
  if (!authoredSource.includes("var waitsForChange = type === 'checkbox' || type === 'radio' || control.tagName === 'SELECT'")
    || !authoredSource.includes("event.type === 'input' && waitsForChange")
    || !authoredSource.includes('pendingControlHistory = { control: control, snapshot: snapState() }')
    || !authoredSource.includes("baseline === current && event.type === 'input' && waitsForChange")
    || !/if \(baseline !== current\) \{\s*markAutosaveDirty\(\);\s*recordHistorySnapshot\(baseline\);/s.test(authoredSource)) {
    noteFailure('Checkbox, radio, or select changes can bypass Undo/Redo and autosave history.');
  }
  if (!authoredSource.includes('var controlName = parameterLabel(input)')
    || !authoredSource.includes("minus.setAttribute('aria-controls', input.id)")
    || !authoredSource.includes("plus.setAttribute('aria-controls', input.id)")
    || !authoredSource.includes('function syncMobileStepperStates()')
    || !authoredSource.includes('syncMobileStepperPair(pair)')) {
    noteFailure('Mobile range steppers lack readable names, endpoint state, or control relationships.');
  }
  if (!authoredSource.includes("parameterRow.resetName = rowLabels.length ? rowLabels.join(' and ') : 'parameter group'")
    || !authoredSource.includes("reset.setAttribute('aria-label','Reset '+row.resetName)")) {
    noteFailure('Parameter-row reset actions no longer expose distinct readable names.');
  }
  if (!/populatePresets\(\);\s*syncCompositionUI\(\);[\s\S]*?initParameterNavigator\(\);[\s\S]*?syncLookMemoryUI\(\);/s.test(authoredSource)
    || /initProgressiveUI\(\);\s*initParameterNavigator\(\);/.test(authoredSource)
    || !authoredSource.includes('select[id^="p"]:not(#pOperator):not(#pCompositionEngine)')) {
    noteFailure('Parameter RESET baselines can be captured before canonical Compose defaults or include the engine picker.');
  }
  for (const id of ['pPreset', 'btnApplyPreset', 'pPresetName', 'btnSavePreset', 'btnDelPreset', 'presetCount', 'presetStatus']) {
    if (!ids.has(id)) noteFailure(`Inline Preset management is missing ${id}.`);
  }
  const presetManagerStart = authoredSource.indexOf("var PRESET_KEY = 'typeDeformer.presets.v1';");
  const presetManagerEnd = authoredSource.indexOf('/* ---------------- share via URL ---------------- */', presetManagerStart);
  const presetManagerBody = presetManagerStart >= 0 && presetManagerEnd > presetManagerStart
    ? authoredSource.slice(presetManagerStart, presetManagerEnd)
    : '';
  if (!html.includes('class="preset-manager" role="group" aria-labelledby="presetManagerTitle"')
    || !html.includes('id="presetStatus" role="status" aria-live="polite" aria-atomic="true"')
    || !html.includes('.preset-status[data-state="warning"]')
    || !html.includes('.preset-status {')
    || !html.includes('overflow-wrap: anywhere;')
    || !presetManagerBody.includes('function applySelectedPreset()')
    || !presetManagerBody.includes('pushHistory();')
    || !presetManagerBody.includes('scheduleAutosave();')
    || !presetManagerBody.includes("setPresetStatus('Preset applied · ' + label, 'done')")
    || !presetManagerBody.includes("setPresetStatus((existed ? 'Preset updated · ' : 'Preset saved · ') + name, 'done')")
    || !presetManagerBody.includes("setPresetStatus('Preset deleted · ' + name, 'done')")
    || !presetManagerBody.includes("presetDeleteConfirmName !== name")
    || !presetManagerBody.includes("'Confirm delete / 削除確認'")
    || !authoredSource.includes('pPreset: true')
    || /\b(?:alert|confirm|prompt)\s*\(/.test(presetManagerBody)) {
    noteFailure('Preset save, apply, update, and selected-delete must remain non-blocking, focusable, undoable, and visible inside the Effect panel.');
  }
  if (!authoredSource.includes("var firstAction = projectMenu.querySelector('[data-project-proxy]')")
    || !authoredSource.includes("document.addEventListener('pointerdown', function (event)")
    || !authoredSource.includes('closeProjectMenu(true)')
    || !authoredSource.includes("if (projectMenu && projectMenu.open)")) {
    noteFailure('The Project popover does not fully manage focus, outside dismissal, and Escape dismissal.');
  }
  if (!authoredSource.includes("var btnShareProxies = document.querySelectorAll('[data-project-proxy=\"btnShare\"]')")
    || !authoredSource.includes('function setShareButtonLabel(label)')
    || !authoredSource.includes("button.dataset.projectProxy !== 'btnShare'")) {
    noteFailure('Project Share feedback can disappear with the popover before copying finishes.');
  }
  for (const id of ['projectActionStatus', 'projectMenuActionStatus']) {
    if (!ids.has(id)) noteFailure(`Project action feedback is missing ${id}.`);
  }
  if (!authoredSource.includes('var projectActionStatuses = [')
    || !authoredSource.includes('function setProjectActionStatus(message, state, timeoutMs)')
    || !authoredSource.includes("setProjectActionStatus('Project JSON · '")
    || !authoredSource.includes('Math.max(1, Math.round(blob.size / 1024))')
    || !authoredSource.includes("button.dataset.projectProxy !== 'btnShare'")
    || !authoredSource.includes("button.dataset.projectProxy !== 'btnSaveProj'")
    || !authoredSource.includes("button.dataset.projectProxy !== 'btnLoadProj'")
    || !authoredSource.includes("setProjectActionStatus(ok ? 'Share URL copied to clipboard' : 'Share URL copy failed'")
    || !authoredSource.includes("setProjectActionStatus('Share URL ready · manual copy opened', 'error', 0)")) {
    noteFailure('Project Save, Load, or Share no longer keeps the visible menu open with mirrored completion feedback.');
  }
  const newProjectFlowStart = authoredSource.indexOf("var NEW_PROJECT_NOTICE_KEY = 'typeDeformer.projectNotice.v1';");
  const newProjectFlowEnd = authoredSource.indexOf('/* ---------------- parameter presets ---------------- */', newProjectFlowStart);
  const newProjectFlowBody = newProjectFlowStart >= 0 && newProjectFlowEnd > newProjectFlowStart
    ? authoredSource.slice(newProjectFlowStart, newProjectFlowEnd)
    : '';
  if (!newProjectFlowBody
    || !html.includes('aria-describedby="projectMenuActionStatus"')
    || !html.includes('aria-describedby="projectActionStatus"')
    || !html.includes('.project-action-status[data-state="warning"]')
    || !html.includes('.project-menu-body .project-danger[data-confirming="true"]')
    || !authoredSource.includes("button.dataset.projectProxy !== 'btnNew'")
    || !authoredSource.includes('if (wasOpen) cancelNewProjectConfirmation(false);')
    || !newProjectFlowBody.includes('var newProjectConfirmArmed = false;')
    || !newProjectFlowBody.includes('function cancelNewProjectConfirmation(announce)')
    || !newProjectFlowBody.includes("'Confirm new / 初期化確認'")
    || !newProjectFlowBody.includes("setProjectActionStatus('現在の作品を復旧コピーへ保存して新規作成")
    || !newProjectFlowBody.includes('}, 8000);')
    || !newProjectFlowBody.includes("switchWorkspaceProject(clean, '新規作成前')")
    || newProjectFlowBody.includes('localStorage.removeItem(AUTOSAVE_KEY)')
    || !newProjectFlowBody.includes('function consumeNewProjectNotice()')
    || !newProjectFlowBody.includes('sessionStorage.removeItem(NEW_PROJECT_NOTICE_KEY)')
    || !newProjectFlowBody.includes("setProjectActionStatus('New project ready · autosave cleared', 'done', 8000)")
    || !newProjectFlowBody.includes("projectMenu.querySelector('[data-project-proxy=\"btnNew\"]')")
    || /\b(?:alert|confirm|prompt)\s*\(/.test(newProjectFlowBody)) {
    noteFailure('New project must checkpoint the current document and remain a non-blocking, two-step, focus-preserving reset with visible feedback.');
  }
  const projectFileLoadStart = authoredSource.indexOf("var projFile = document.getElementById('projFile');");
  const projectFileLoadEnd = authoredSource.indexOf('/* ---------------- autosave ---------------- */', projectFileLoadStart);
  const projectFileLoadBody = projectFileLoadStart >= 0 && projectFileLoadEnd > projectFileLoadStart
    ? authoredSource.slice(projectFileLoadStart, projectFileLoadEnd)
    : '';
  if (!authoredSource.includes('function projectLoadError(data)')
    || !authoredSource.includes("typeof data.params === 'object' && !Array.isArray(data.params)")
    || !authoredSource.includes('var validationError = projectLoadError(data);')
    || !projectFileLoadBody.includes("setProjectActionStatus('Project JSONを選択…', 'working')")
    || !projectFileLoadBody.includes("projFile.addEventListener('cancel'")
    || !projectFileLoadBody.includes("setProjectActionStatus('Loading ' + file.name + '…', 'working')")
    || !projectFileLoadBody.includes("switchWorkspaceProject(data, 'Projectを開く前')")
    || !projectFileLoadBody.includes("setProjectActionStatus('Project loaded · ' + file.name")
    || !projectFileLoadBody.includes("setProjectActionStatus('Projectを読み込めません · ' + err.message")
    || projectFileLoadBody.includes('alert(')
    || !html.includes('.project-action-status { overflow-wrap: anywhere; }')) {
    noteFailure('Project Load no longer provides a non-blocking choose, loading, success, cancel, and error flow inside the visible popover.');
  }
  const videoReleaseStart = authoredSource.indexOf('async function releaseVideoExport(');
  const videoStart = authoredSource.indexOf('async function startVideoExport(', videoReleaseStart);
  const videoReleaseBody = videoReleaseStart >= 0 && videoStart > videoReleaseStart ? authoredSource.slice(videoReleaseStart, videoStart) : '';
  if (!videoReleaseBody.includes("if (state === 'cancelled') setVideoProgress(0);")
    || !/await releaseVideoExport\('Recording cancelled\.[^']*', 'cancelled'\);/.test(videoReleaseBody)) {
    noteFailure('Cancelling a motion export can leave a stale partial-progress bar.');
  }
  if (!html.includes('id="previewOverlay" hidden role="dialog" aria-modal="true" aria-labelledby="previewCaption"')
    || !ids.has('btnPreviewClose')
    || !authoredSource.includes('function showPreviewOverlay()')
    || !authoredSource.includes('function closePreview()')
    || !authoredSource.includes("document.getElementById('btnPreviewClose').focus({ preventScroll: true })")) {
    noteFailure('Preview dialog semantics, explicit dismissal, or focus restoration is incomplete.');
  }
  for (const id of ['copyTextStatus', 'manualCopyOverlay', 'manualCopyTitle', 'manualCopyLabel',
    'manualCopyValue', 'manualCopyStatus', 'btnManualCopyClose', 'btnManualCopyRetry', 'btnManualCopySelect']) {
    if (!ids.has(id)) noteFailure(`Non-blocking copy recovery is missing ${id}.`);
  }
  if (!html.includes('id="manualCopyOverlay" hidden role="dialog" aria-modal="true"')
    || !authoredSource.includes('function openManualCopy(value, label, returnFocus, resultHandler)')
    || !authoredSource.includes('function closeManualCopy()')
    || !authoredSource.includes('function retryManualCopy()')
    || !authoredSource.includes("if (event.key === 'Escape')")
    || !authoredSource.includes("returnFocus.focus({ preventScroll: true })")
    || !authoredSource.includes("if (manualCopyOverlay && !manualCopyOverlay.hidden && manualCopyOverlay.contains(event.target)) return;")
    || !/if \(manualCopyOverlay\.hidden\) return;[\s\S]*?event\.stopImmediatePropagation\(\);[\s\S]*?\}, true\);/.test(authoredSource)
    || !/\.manual-copy-value\s*\{[\s\S]*?font-size:\s*16px;/.test(html)
    || !/\.manual-copy-actions button\s*\{[^}]*min-height:\s*44px;/.test(html)
    || !authoredSource.includes("openManualCopy(url, 'Share URL', shareOrigin")
    || !authoredSource.includes("copyPlainTextValue(textInput.value, btnCopySourceText, 'Source text / 原文')")) {
    noteFailure('Clipboard failure no longer opens a focus-preserving manual-copy dialog for source text and Share URL.');
  }
  for (const nextStage of ['effect', 'apply', 'compose', 'export']) {
    if (!applicationSource.includes(`data-next-stage="${nextStage}"`)) noteFailure(`Workflow is missing the transition to ${nextStage}.`);
  }
  const resetAllEffectsStart = authoredSource.indexOf('function resetAllEffects()');
  const resetAllEffectsEnd = authoredSource.indexOf('/* ---------------- batch toggle', resetAllEffectsStart);
  const resetAllEffectsBody = resetAllEffectsStart >= 0 && resetAllEffectsEnd > resetAllEffectsStart
    ? authoredSource.slice(resetAllEffectsStart, resetAllEffectsEnd)
    : '';
  if (!resetAllEffectsBody || resetAllEffectsBody.includes('compositionState = cloneCompositionDefaults()')) {
    noteFailure('Reset all effects must not remove the separately controlled Composition state.');
  }
  if ((authoredSource.match(/version:\s*93/g) || []).length < 2 || !authoredSource.includes('data.version > 93') || !authoredSource.includes("a: 'td', v: 93")) {
    noteFailure('Project/SVG/share schema version 93 or its forward-version guard is incomplete.');
  }
  for (const marker of [
    '<script src="conditions-of-type.js"></script>', 'CONDITIONS OF TYPE / 文字の条件',
    "rubyUsurper: conditionSurfaceRenderer('rubyUsurper')", "punctuationLoom: conditionSurfaceRenderer('punctuationLoom')",
    "counterpage: conditionSurfaceRenderer('counterpage')", "rendererDebt: conditionSurfaceRenderer('rendererDebt')",
    "ligatureContagion: conditionSurfaceRenderer('ligatureContagion')", "strokeCommons: conditionSurfaceRenderer('strokeCommons')",
    "rubyText: ''", "counterpageText: ''", 'function conditionSurfaceRenderer(', 'test:conditions'
  ]) {
    if (!hasEditorOrMigrationMarker(marker) && !packageJson.includes(marker)) noteFailure(`Conditions of Type v68 integration is missing ${marker}.`);
  }
  for (const relativePath of ['conditions-of-type.js', 'scripts/test-conditions-of-type.mjs']) {
    if (!fs.existsSync(path.join(root, relativePath))) noteFailure(`Conditions of Type v68 evidence is missing ${relativePath}.`);
  }
  for (const marker of [
    '<option value="caesuraField">Caesura Field · 句読点の呼吸</option>',
    'data-operator-panel="caesuraField"',
    "caesuraGrammar: ['aperture', 'terrace', 'hinge']",
    "caesuraField: ['caesuraGrammar', 'caesuraBreath', 'caesuraLift', 'caesuraHierarchy', 'caesuraAngle', 'caesuraSpan']",
    'function caesuraPunctuationStrength(', 'function buildCaesuraFieldFrames(',
    'function caesuraFieldValues(', 'function applyCaesuraFieldVisual(',
    'buildCaesuraFieldFrames(metrics, params.vertical)', "'--op-caesura-x'",
    "bindProfileSelect('pCaesuraGrammar'", "segmentation: 'explicit punctuation classes; no semantic inference'",
    'test:caesura'
  ]) {
    if (!hasEditorOrMigrationMarker(marker) && !packageJson.includes(marker)) noteFailure(`Caesura Field v63 integration is missing ${marker}.`);
  }
  for (const relativePath of ['scripts/test-caesura-field.mjs', 'scripts/render-caesura-field.mjs']) {
    if (!fs.existsSync(path.join(root, relativePath))) noteFailure(`Caesura Field v63 evidence is missing ${relativePath}.`);
  }
  for (const marker of ["<option value=\"counterbody\" selected>Compound counterbody</option>",
    "ligatureBodyGrammar: ['legacy', 'counterbody', 'interlock'", 'function renderLigatureBodyV29(',
    'function surfaceLigatureRibbonV62(', 'function renderLigatureCounterbodyV62(',
    "grammar === 'counterbody'", "params.ligatureBodyGrammar = 'interlock'", 'test:ligature']) {
    if (!hasEditorOrMigrationMarker(marker) && !packageJson.includes(marker)) noteFailure(`Ligature Body v62 Counterbody integration is missing ${marker}.`);
  }
  for (const marker of ["<option value=\"birefringent\" selected>Birefringent field</option>",
    "prismOptics: ['legacy', 'crystal', 'birefringent'", 'function prismFacetCellV61(',
    'function prismBoundaryEmittersV61(', 'function renderPrismBirefringentV61(',
    "optics === 'birefringent'", "params.prismOptics = 'crystal'"]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Prism Sacrament v61 integration is missing ${marker}.`);
  }
  for (const marker of [
    '<option value="ductus">Medial ductus</option>',
    "texturaGrammar: ['stems', 'textura', 'ductus', 'fraktur', 'bastarda', 'lattice']",
    'function texturaDuctusBoundsV60(', 'function texturaDuctusSignatureV60(', 'function texturaDuctusThinV60(',
    'function texturaDuctusTraceV60(', 'function texturaDuctusPrepareV60(',
    'function texturaDuctusGeometryV60(', 'function renderTexturaDuctusV60(',
    "if (grammar === 'ductus')", "surfaceScratch('textura-matrix-v60-ductus'",
    'texturaDuctusPreparedCacheV60', 'test:textura'
  ]) {
    if (!hasEditorOrMigrationMarker(marker) && !packageJson.includes(marker)) noteFailure(`Textura Matrix v60 Medial Ductus integration is missing ${marker}.`);
  }
  for (const marker of [
    '<option value="gutterFugue">Gutter Fugue · 見開きの対位</option>',
    'data-operator-panel="gutterFugue"',
    'function buildGutterFugueFrames(', 'function gutterFugueValues(', 'function applyGutterFugueVisual(',
    'buildGutterFugueFrames(metrics, params.vertical)', "'--op-fugue-x'", "gutterFugue: ['--op-fugue-x'",
    "bindRange('pGutterTension'", 'activeOnlyInSpreads: true'
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Gutter Fugue v59 integration is missing ${marker}.`);
  }
  for (const marker of [
    'function rasterGravureCellPathV58(', 'function rasterGravurePlanV58(', 'function drawRasterGravureV58(',
    "if (screen === 'gravure')", 'maxCells || 12000', "rasterScreen: 'gravure'",
    "Number(data.version || 0) < 58", "params.rasterScreen = 'adaptive'"
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Raster Press v58 Gravure integration is missing ${marker}.`);
  }
  const asemicGrammarSelect = markupOnly.match(/<select\b[^>]*\bid=["']pAsemicGrammar["'][^>]*>([\s\S]*?)<\/select>/i);
  const asemicModes = ['current', 'chamber', 'incised', 'polyphonic'];
  if (!asemicGrammarSelect || asemicModes.some((value) => !new RegExp(`value=["']${value}["']`).test(asemicGrammarSelect[1]))) {
    noteFailure('Asemic Ductus v37 is missing one or more script grammars.');
  }
  for (const marker of [
    'function renderAsemicDuctus(', 'function asemicCandidatePool(', 'function asemicSelectAnchors(',
    'function asemicRenderChamber(', 'function asemicCutCounters(', "surfaceVoidTopology(field, width, height)",
    "asemicDuctus: renderAsemicDuctus", "asemicDuctus: [{ key: 'asemicMemory'",
    "bindProfileSelect('pAsemicGrammar', 'asemicGrammar'", "surfaceOperatorStrength(m, 'asemicDuctus')",
    "if (!glyphText.trim()) continue", "if (metas.length > 96) gestures = Math.min(gestures, 6)",
    "(((compositionState.phase % 1) + 1) % 1) * Math.PI * 2"
  ]) {
    if (!hasEditorOrMigrationMarker(marker)) noteFailure(`Asemic Ductus v37 body integration is missing ${marker}.`);
  }
  const extractIndentedFunction = (name) => {
    const match = authoredSource.match(new RegExp(`^      function ${name}\\([\\s\\S]*?^      \\}`, 'm'));
    return match ? match[0] : '';
  };
  const asemicRuntimeNames = [
    'hash', 'surfaceNearestGlyphMeta', 'asemicCanonicalPoint', 'asemicCandidatePool',
    'asemicSelectAnchors', 'asemicOrderAnchors', 'asemicBuildAnchors'
  ];
  const asemicRuntimeSource = asemicRuntimeNames.map(extractIndentedFunction).join('\n');
  if (asemicRuntimeNames.some((name) => !extractIndentedFunction(name))) {
    noteFailure('Asemic Ductus geometry functions cannot be isolated for deterministic validation.');
  } else {
    try {
      const sandbox = { Math, Uint8Array, Float32Array, params: { seed: 7, vertical: false } };
      vm.createContext(sandbox);
      new vm.Script(asemicRuntimeSource, { filename: 'asemic-ductus-v37-geometry.js' }).runInContext(sandbox);
      const width = 96, height = 96;
      const inside = new Uint8Array(width * height);
      const distance = new Float32Array(width * height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const nx = (x - 48) / 30;
        const ny = (y - 48) / 34;
        const radial = Math.hypot(nx, ny);
        const index = y * width + x;
        if (radial <= 1) {
          inside[index] = 1;
          distance[index] = Math.max(0, (1 - radial) * 24);
        }
      }
      const meta = { index: 0, x: 48, y: 48, halfW: 30, halfH: 34 };
      const metas = [meta];
      const field = { inside, distance, bounds: [18, 14, 78, 82] };
      const roundAnchors = (points) => points.map(({ x, y }) => [Number(x.toFixed(6)), Number(y.toFixed(6))]);
      const modes = ['current', 'chamber', 'incised', 'polyphonic'];
      const modeKeys = new Set();
      for (const mode of modes) {
        const atZero = sandbox.asemicBuildAnchors(field, width, height, metas, meta, mode, 0.68, 7, 1.16, 34, 0, 9243);
        const atLoop = sandbox.asemicBuildAnchors(field, width, height, metas, meta, mode, 0.68, 7, 1.16, 34, Math.PI * 2, 9243);
        const atHalf = sandbox.asemicBuildAnchors(field, width, height, metas, meta, mode, 0.68, 7, 1.16, 34, Math.PI, 9243);
        if (atZero.length < 2 || atZero.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))) {
          noteFailure(`Asemic Ductus ${mode} geometry is blank or non-finite.`);
        }
        const zeroKey = JSON.stringify(roundAnchors(atZero));
        if (zeroKey !== JSON.stringify(roundAnchors(atLoop))) {
          noteFailure(`Asemic Ductus ${mode} geometry does not close exactly at Compose phase 1.`);
        }
        if (zeroKey === JSON.stringify(roundAnchors(atHalf))) {
          noteFailure(`Asemic Ductus ${mode} geometry does not respond at Compose phase 0.5.`);
        }
        modeKeys.add(zeroKey);
      }
      if (modeKeys.size !== modes.length) {
        noteFailure('Asemic Ductus script grammars collapse to the same anchor geometry.');
      }
      const minimum = sandbox.asemicBuildAnchors(field, width, height, metas, meta, 'current', 0, 2, -4, 0, 0, 0, 9243);
      const maximum = sandbox.asemicBuildAnchors(field, width, height, metas, meta, 'current', 1, 16, 4, 480, Math.PI, 9243);
      if (minimum.length !== 2 || maximum.length < 16 || JSON.stringify(roundAnchors(minimum)) === JSON.stringify(roundAnchors(maximum))) {
        noteFailure('Asemic Ductus minimum and maximum geometry budgets are ineffective.');
      }
    } catch (error) {
      noteFailure(`Asemic Ductus deterministic geometry validation failed: ${error.message}`);
    }
  }
  if (!ids.has('pTraceGrammar')
    || !authoredSource.includes("traceGrammar: ['legacy', 'circuit', 'relay', 'carriage', 'duet']")
    || !authoredSource.includes("bindProfileSelect('pTraceGrammar', 'traceGrammar'")
    || !renderingSource.includes("surfaceChoice(glyphs, 'plotterTrace', 'traceGrammar'")
    || !authoredSource.includes('function renderPlotterTraceLegacy(')
    || !authoredSource.includes('function traceMaskContoursV34(')
    || !authoredSource.includes('function traceTimelineV34(')
    || !authoredSource.includes('function renderTraceTimelineV34(')
    || !migrationSource.includes('var legacyKineticTrace = Number(data.version || 0) < 34')
    || !migrationSource.includes("params.traceGrammar = 'legacy'")
    || !migrationSource.includes("batchProfiles[traceProfileKey].traceGrammar = 'legacy'")) {
    noteFailure('Kinetic Trace v34 grammar, contour/timeline renderer, or v33 compatibility migration is incomplete.');
  }
  for (const id of ['pCalligraphyTool', 'pCounterformGrammar', 'pTerminalStyle', 'pLigatureBodyGrammar']) {
    if (!ids.has(id)) noteFailure(`Glyph Anatomy v29 grammar suite is missing ${id}.`);
  }
  for (const fn of ['renderCalligraphicStressLegacy', 'renderCounterformEngineLegacy', 'renderTerminalExcessLegacy',
    'renderLigatureBodyLegacy', 'surfaceCounterExit', 'surfaceStemWidthAt', 'surfaceLigatureShoulder']) {
    if (!applicationSource.includes(`function ${fn}(`)) noteFailure(`Glyph Anatomy v29 grammar suite is missing ${fn}().`);
  }
  if (!migrationSource.includes('var legacyGlyphAnatomy = Number(data.version || 0) < 29')
    || !migrationSource.includes("params.calligraphyTool = 'legacy'")
    || !migrationSource.includes("params.counterformGrammar = 'legacy'")
    || !migrationSource.includes("params.terminalStyle = 'legacy'")
    || !migrationSource.includes("params.ligatureBodyGrammar = 'legacy'")
    || !authoredSource.includes('calligraphyLegacyTool')
    || !authoredSource.includes('counterformLegacyGrammar')
    || !authoredSource.includes('terminalLegacyStyle')
    || !authoredSource.includes('ligatureBodyLegacyGrammar')) {
    noteFailure('Glyph Anatomy v29 no longer preserves the exact v28 renderer sub-modes.');
  }
  if (!renderManifest.modules.some(unit=>unit.id==='counterform-render')
    || !authoredSource.includes('function renderCounterformEngineV29(')
    || !authoredSource.includes('function renderCounterformEngine(')
    || !authoredSource.includes("counterformGrammar: ['legacy', 'apertureV29', 'stencilV29', 'trapV29', 'channelV29', 'aperture', 'stencil', 'trap', 'channel']")
    || !migrationSource.includes('var legacyCounterformV29 = Number(data.version || 0) < 42')
    || !migrationSource.includes("value + 'V29' : value")
    || !migrationSource.includes('batchProfiles[counterformProfileKey].counterformGrammar = preserveV29CounterformGrammar')
    || !authoredSource.includes("surfaceScratch('counterform-engine-v42-local-body'")
    || !authoredSource.includes('counterformInvalidateFonts(); refreshConfuseFontCandidates()')) {
    noteFailure('Counterform Engine v42 glyph-local runtime, v29 preservation, bounded source lifecycle or schema migration is incomplete.');
  }
  if (!ids.has('pPressureSystem')
    || !authoredSource.includes("pressureSystem: ['legacy', 'gesture', 'bristle', 'pool', 'flyingWhite']")
    || !authoredSource.includes('function renderPressureStrokeLegacy(')
    || !authoredSource.includes("bindProfileSelect('pPressureSystem', 'pressureSystem'")
    || !migrationSource.includes("params.pressureSystem = 'legacy'")
    || !migrationSource.includes('Number(data.version || 0) < 30')
    || !migrationSource.includes('function preserveV29MaterialGrammar(')
    || !authoredSource.includes('adaptiveV29')
    || !authoredSource.includes('tonalV29')
    || !authoredSource.includes('ghostingV29')
    || !authoredSource.includes('var rasterV29')
    || !authoredSource.includes('var hatchV29')
    || !authoredSource.includes('var copyV29')
    || !authoredSource.includes('function surfaceBoundaryEnvelopeCanvas(')
    || !authoredSource.includes('var defectLevel = 0;')) {
    noteFailure('Material-transfer v30 grammars, exact Pressure migration, or visible plate/machine failure structures are incomplete.');
  }
  if (!ids.has('pMorphChoreography')
    || !authoredSource.includes("morphChoreography: ['legacy', 'corridor', 'braid', 'cascade', 'membrane']")
    || !authoredSource.includes("bindProfileSelect('pMorphChoreography', 'morphChoreography'")
    || !migrationSource.includes('var legacyMorphProcession = Number(data.version || 0) < 31')
    || !migrationSource.includes("params.morphChoreography = 'legacy'")
    || !authoredSource.includes('function renderMorphProcessionLegacy(')
    || !authoredSource.includes('function surfaceMorphGlyphDescriptor(')
    || !authoredSource.includes('function surfaceMorphFieldSample(')
    || !authoredSource.includes('function strokeMorphCorrespondence(')
    || !authoredSource.includes("rendering === 'doubleContour'")
    || !authoredSource.includes('var edgeInset = Math.min(distance * 0.18')
    || !authoredSource.includes('if (pairs.length <= 18) return pairs')
    || !authoredSource.includes("'morph-procession-v31-color'")) {
    noteFailure('Morph Procession v31 choreography, Batch binding, or v30 migration is incomplete.');
  }
  if (!ids.has('pRecursiveStructure')
    || !authoredSource.includes("recursiveStructure: ['legacy', 'reliquary', 'tracery', 'cantor', 'mandorla']")
    || !authoredSource.includes("bindProfileSelect('pRecursiveStructure', 'recursiveStructure'")
    || !migrationSource.includes('var legacyRecursiveShrine = Number(data.version || 0) < 32')
    || !migrationSource.includes("params.recursiveStructure = 'legacy'")
    || !migrationSource.includes("batchProfiles[recursiveProfileKey].recursiveStructure = 'legacy'")
    || !authoredSource.includes('params.recursiveSourceOpacity = 0.16')
    || !authoredSource.includes('function drawRecursiveNodeMaskV32(')
    || !authoredSource.includes('function recursiveShrineGraphV32(')
    || !authoredSource.includes('function recursiveShrineFrameV32(')
    || !authoredSource.includes('function drawRecursiveShrineRailsV32(')
    || !authoredSource.includes('var totalNodeBudget = 360')
    || !authoredSource.includes("'recursive-shrine-v32-paper-apertures'")
    || !authoredSource.includes("'recursive-shrine-v32-body-color'")
    || !authoredSource.includes("'recursive-shrine-v32-rail-color'")
    || !authoredSource.includes("'recursive-shrine-v32-glint-color'")) {
    noteFailure('Recursive Shrine v32 per-glyph graph, compatibility migration, bounded layers, or persistence is incomplete.');
  }
  if (!ids.has('pVoidArchitecture')
    || !authoredSource.includes("voidArchitecture: ['legacy', 'archivolt', 'carceri', 'horizon']")
    || !authoredSource.includes("bindProfileSelect('pVoidArchitecture', 'voidArchitecture'")
    || !migrationSource.includes('var legacyVoidPortal = Number(data.version || 0) < 33')
    || !migrationSource.includes("params.voidArchitecture = 'legacy'")
    || !migrationSource.includes("batchProfiles[voidProfileKey].voidArchitecture = 'legacy'")
    || !authoredSource.includes('params.voidSourceOpacity = 0.18')
    || !authoredSource.includes('function renderVoidPortalLegacy(')
    || !authoredSource.includes('function voidPortalGlyphBoundsV33(')
    || !authoredSource.includes('function voidPortalLabelComponentsV33(')
    || !authoredSource.includes('function voidPortalAperturesV33(')
    || !authoredSource.includes('function voidPortalSectionStateV33(')
    || !authoredSource.includes('var maxGlyphs = 56')
    || !authoredSource.includes("'void-portal-v33-paper-color'")
    || !authoredSource.includes("'void-portal-v33-terminal-color'")
    || !authoredSource.includes("'void-portal-v33-rib-color'")
    || !authoredSource.includes("'void-portal-v33-rail-color'")
    || !authoredSource.includes("'void-portal-v33-rim-color'")) {
    noteFailure('Void Portal v33 per-glyph aperture topology, architecture modes, migration, or layered rendering is incomplete.');
  }
  if (!authoredSource.includes('function renderCellFractureV24(')
    || !authoredSource.includes('function drawTransformedFractureFragment(')
    || !authoredSource.includes('function renderImpactFractureV31(')
    || !authoredSource.includes('function renderFaultFractureV31(')
    || !authoredSource.includes('function renderCrystalFractureV31(')
    || !authoredSource.includes('function renderSpallFractureV31(')
    || !authoredSource.includes("'cell-fracture-v31-paper-cuts'")
    || !authoredSource.includes("'cell-fracture-v31-propagation-edges'")) {
    noteFailure('Cell Fracture v31 fragments, distinct fracture regimes, or layered crack output is incomplete.');
  }
  if (!authoredSource.includes('function renderSigilForgeV25(')
    || !authoredSource.includes('function prepareSigilComponentsV31(')
    || !authoredSource.includes('function sigilComponentTransformV31(')
    || !authoredSource.includes('function sigilRosettePathV31(')
    || !authoredSource.includes('componentBudget || active.length')
    || !authoredSource.includes("'sigil-forge-v31-compound-body'")
    || !authoredSource.includes("'sigil-forge-v31-negative-counters'")
    || !authoredSource.includes("'sigil-forge-v31-compound-color'")) {
    noteFailure('Sigil Forge v31 affine glyph components, functional component budget, body fusion, or negative-counter layers are incomplete.');
  }
  if (!authoredSource.includes('function renderRibbonEchoV25(')
    || !authoredSource.includes('function ribbonSectionStateV31(')
    || !authoredSource.includes('function ribbonSkinStripV31(')
    || !authoredSource.includes('function ribbonFanLeavesV31(')
    || !authoredSource.includes('params.ribbonSourceOpacity = 0.28')
    || !authoredSource.includes('Math.min(96, Math.max(8,')
    || !authoredSource.includes("'ribbon-echo-v31-section-body'")
    || !authoredSource.includes("'ribbon-echo-v31-paper-gaps'")
    || !authoredSource.includes("'ribbon-echo-v31-section-color'")) {
    noteFailure('Ribbon Echo v31 ordered sections, bounded sweep, skinned bodies, paper gaps, source-opacity default, or layered output is incomplete.');
  }
  if (!authoredSource.includes('function renderSlitSweepV25(')
    || !authoredSource.includes('function slitTimeCoordinateV31(')
    || !authoredSource.includes('function slitTemporalSamplesV31(')
    || !authoredSource.includes('function slitDrawTemporalStateV31(')
    || !authoredSource.includes('params.slitSourceOpacity = 0.26')
    || !authoredSource.includes("'slit-sweep-v31-temporal-field'")
    || !authoredSource.includes("'slit-sweep-v31-temporal-color'")
    || !authoredSource.includes('var maxDraws = 6800')) {
    noteFailure('Slit Sweep v31 finite cache, temporal sampling, source-opacity default, bounded draw cap, or layered output is incomplete.');
  }
  for (const id of ['pWebTopology', 'pEtchantRegime', 'pSinewSystem', 'pChimeraSystem']) {
    if (!ids.has(id)) noteFailure(`Organic field/anatomy grammar suite is missing ${id}.`);
  }
  for (const fn of ['renderWebbingLegacy', 'renderEtchantBloomLegacy', 'renderSinewTorqueLegacy',
    'renderChimeraGraftLegacy', 'strokeEtchantContours']) {
    if (!applicationSource.includes(`function ${fn}(`)) noteFailure(`Organic field/anatomy grammar suite is missing ${fn}().`);
  }
  if (!migrationSource.includes("params.webTopology = 'legacy'")
    || !migrationSource.includes("params.etchantRegime = 'legacy'")
    || !migrationSource.includes("params.sinewSystem = 'legacy'")
    || !migrationSource.includes("params.chimeraSystem = 'legacy'")
    || !authoredSource.includes("bindProfileSelect('pWebTopology', 'webTopology'")
    || !authoredSource.includes("bindProfileSelect('pEtchantRegime', 'etchantRegime'")
    || !authoredSource.includes("bindProfileSelect('pSinewSystem', 'sinewSystem'")
    || !authoredSource.includes("bindProfileSelect('pChimeraSystem', 'chimeraSystem'")) {
    noteFailure('Organic field/anatomy grammars no longer preserve v27 rendering or participate in Batch/UI state.');
  }
  for (const id of ['pMisregSystem', 'pMisregWarp', 'pMisregZones', 'pMisregSlur', 'pMisregTrap',
    'pMoshGrammar', 'pMoshMemory', 'pMoshCoherence', 'pBlobVisual', 'pBlobInfluence',
    'pBlobDensity', 'pBlobVector', 'pBlobTrails', 'pBlobStroke', 'pBlobMaxMove', 'pBlobRevive']) {
    if (!ids.has(id)) noteFailure(`Signal/press/tracker Operator suite is missing ${id}.`);
  }
  for (const fn of ['renderMisregistration', 'renderDataMosh', 'renderBlobTrack',
    'drawRegistrationSliceField', 'dataMoshFrameIndex', 'blobTrackSurfaceSources']) {
    if (!applicationSource.includes(`function ${fn}(`)) noteFailure(`Signal/press/tracker Operator suite is missing ${fn}().`);
  }
  if (!authoredSource.includes('var SURFACE_OPERATOR_IDS = TypeDeformerCatalog.surfaceIds.slice()')
    || !authoredSource.includes("surfaceFieldNodesForGlyphs(glyphs, 'blobTrack'")
    || !authoredSource.includes("var sourcePairs = {};")
    || !migrationSource.includes("params.blobVisual = 'legacy'")
    || !migrationSource.includes("params.misregSystem = 'legacy'")
    || !migrationSource.includes("params.moshGrammar = 'legacy'")
    || !html.includes('select, input[type="text"], input[type="search"] { flex: 1 1 auto; min-width: 0; }')) {
    noteFailure('Signal/press/tracker rendering, v26 migration, Surface registration, or narrow-panel containment is incomplete.');
  }
  for (const id of ['lookMemoryBlock', 'lookMemoryCount', 'lookMemoryGrid', 'lookMemoryStatus',
    'btnLookCompare', 'btnLookReturn', 'lookCompareOverlay', 'lookCompareFrame',
    'lookCompareImageA', 'lookCompareImageB', 'lookCompareRange', 'btnLookCompareClose']) {
    if (!ids.has(id)) noteFailure(`Look Memory is missing ${id}.`);
  }
  for (const fn of ['normalizeLookMemory', 'currentLookState', 'captureLookSlot', 'recallLookSlot',
    'clearLookSlot', 'syncLookMemoryUI', 'setLookMemoryStatus', 'armLookMemoryConfirmation',
    'cancelLookMemoryConfirmation', 'focusLookMemoryAction', 'openLookCompare', 'setLookCompareWipe']) {
    if (!applicationSource.includes(`function ${fn}(`)) noteFailure(`Look Memory is missing ${fn}().`);
  }
  const lookMemoryUiStart = authoredSource.indexOf("var lookMemoryGrid = document.getElementById('lookMemoryGrid');");
  const lookMemoryUiEnd = authoredSource.indexOf("var lookCompareOverlay = document.getElementById('lookCompareOverlay');", lookMemoryUiStart);
  const lookMemoryUiBody = lookMemoryUiStart >= 0 && lookMemoryUiEnd > lookMemoryUiStart
    ? authoredSource.slice(lookMemoryUiStart, lookMemoryUiEnd)
    : '';
  if (!lookMemoryUiBody
    || /\b(?:alert|confirm|prompt)\s*\(/.test(lookMemoryUiBody)
    || !html.includes('id="lookMemoryCount" aria-live="polite" aria-atomic="true"')
    || !html.includes('id="lookMemoryStatus" role="status" aria-live="polite" aria-atomic="true"')
    || !html.includes('.look-memory-card.is-confirming')
    || !html.includes('grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));')
    || !html.includes('.look-memory-actions .look-clear {')
    || !html.includes('button[data-confirming="true"]')
    || !lookMemoryUiBody.includes("capture.dataset.lookAction = 'capture';")
    || !lookMemoryUiBody.includes("clear.textContent = confirmingClear ? 'Confirm clear / 消去確認' : 'Clear / 消去';")
    || !lookMemoryUiBody.includes("armLookMemoryConfirmation('overwrite', index)")
    || !lookMemoryUiBody.includes("armLookMemoryConfirmation('clear', index)")
    || !lookMemoryUiBody.includes('}, 8000);')
    || !lookMemoryUiBody.includes("event.key !== 'Escape'")
    || !lookMemoryUiBody.includes('event.stopImmediatePropagation();')
    || !/document\.addEventListener\('click',[\s\S]*?cancelLookMemoryConfirmation\(false, false\);\s*}, true\);/.test(lookMemoryUiBody)
    || (lookMemoryUiBody.match(/scheduleAutosave\(\);/g) || []).length < 3
    || (lookMemoryUiBody.match(/focusLookMemoryAction\(index, 'capture'\);/g) || []).length < 2
    || !lookMemoryUiBody.includes("focusLookMemoryAction(index, 'recall');")) {
    noteFailure('Look Memory capture, overwrite and clear must stay nonblocking, two-stage and focus-preserving.');
  }
  if (!authoredSource.includes('lookMemory: cloneLookMemory()') || !authoredSource.includes('M: cloneLookMemory()')
    || !authoredSource.includes('lookMemory: d.M')) {
    noteFailure('Look Memory is not preserved by Project and Share serialization.');
  }
  for (const id of ['proofSheetPanel', 'pProofCount', 'pProofColumns', 'pProofMutation', 'pProofVariant',
    'pProofScale', 'pProofLabels', 'btnProofPreview', 'btnProofPng', 'btnProofAdopt', 'proofStatus']) {
    if (!ids.has(id)) noteFailure(`Design Space Sheet is missing ${id}.`);
  }
  for (const fn of ['proofVariantSettings', 'renderProofSheet', 'previewProofSheet', 'exportProofSheet', 'adoptProofVariant']) {
    if (!applicationSource.includes(`function ${fn}(`)) noteFailure(`Design Space Sheet is missing ${fn}().`);
  }
  if (!ids.has('stageWorld') || !authoredSource.includes('stageWorld.appendChild(frag)')
    || !authoredSource.includes('stageWorld.style.transform =')) {
    noteFailure('The unbounded stage world or its independent camera transform is incomplete.');
  }
  const canvasCameraBlock = declaredSourceUnit(authoredUnits,'canvasCameraLayout').source;
  if (!canvasCameraBlock) {
    noteFailure('The canvas camera implementation block could not be isolated for mutation checks.');
  } else {
    const outsideCameraBlock = authoredSource.replace(canvasCameraBlock, '');
    if (/\bcanvasView\.(?:scale|x|y)\s*=/.test(outsideCameraBlock)) {
      noteFailure('Effect, layout, persistence, or export code mutates the canvas camera outside its dedicated controls.');
    }
  }
  if (authoredSource.includes('function clampCanvasView(') || authoredSource.includes('oldScrollLeft + delta')
    || authoredSource.includes('oldScrollTop + delta')) {
    noteFailure('A finite camera clamp or effect-driven viewport shift remains in the preview path.');
  }
  if (!authoredSource.includes('var CANVAS_VIEW_MIN = 0.05;') || !authoredSource.includes('var CANVAS_VIEW_MAX = 32;')
    || !authoredSource.includes('function canvasCameraLayout(')) {
    noteFailure('The wide-range unbounded canvas camera contract is incomplete.');
  }
  if (!authoredSource.includes('autoFit: true') || !authoredSource.includes('function canvasAutoFitBounds(scene)')
    || !authoredSource.includes('function fitCanvasViewToScene(scene)')
    || !canvasCameraBlock.includes('var effectPad = options.effectPad();')
    || !authoredSource.includes('effectPad: function () { return renderEngine.surfaceEffectPad(); }')
    || !authoredSource.includes('if (canvasView.active || !canvasView.autoFit) return false;')
    || !authoredSource.includes('if (canvasView.autoFit && !canvasView.active) scheduleVisualOverscan();')) {
    noteFailure('The default preview camera no longer fits complete glyph and effect bounds while preserving explicit VIEW control.');
  }
  if (!/data-operator-panel="etchantBloom"[\s\S]*?EtchantSpill[\s\S]*?<\/div>\s*<div class="operator-panel" data-operator-panel="sigilForge"/.test(html)) {
    noteFailure('The Etchant Bloom control panel is not closed before the following operator panel.');
  }
  const viewModePointerGuards = authoredSource.match(/if \(canvasView\.active\) return;/g) || [];
  if (viewModePointerGuards.length < 2
    || !extractDeclaredFunction(authoredUnits,'setCanvasViewActive').includes('options.modeChanged(canvasView.active)')
    || !/modeChanged: function \(active\)[\s\S]*?pointer\.strength = 0;[\s\S]*?pointer\.active = false; pointer\.pulse = false;/.test(authoredSource)) {
    noteFailure('Canvas VIEW mode does not fully isolate pan gestures from Lens pointer editing.');
  }
  if (!authoredSource.includes('compositionPreviewLayout = canvasCameraLayout(width, height)')
    || !authoredSource.includes('renderSurfaceFxLayer(surfaceFxCtx, glyphs, dpr, canvasCameraLayout(width, height)')
    || !authoredSource.includes('var screenshotLayout = canvasCameraLayout(cssWidth, cssHeight)')) {
    noteFailure('DOM text, procedural effects, Compose, or View shot no longer share one explicit camera.');
  }
  const surfaceCanonicalRasterBlock = extractDeclaredFunction(authoredUnits,'surfaceCanonicalRasterPlan');
  if (!surfaceCanonicalRasterBlock
    || surfaceCanonicalRasterBlock.includes('matchMedia')
    || !authoredSource.includes('var plan = renderEngine.surfaceCanonicalRasterPlan(glyphs);')
    || !authoredSource.includes('var canonicalLayout = plan.layout;')
    || !authoredSource.includes('var rasterFactor = outputDensity / plan.density;')
    || !authoredSource.includes('scale*(L.dx+plan.bounds.x*L.s)')
    || !authoredSource.includes('renderers[id](layer.ctx,glyphs,width,height,pixelScale,canonicalLayout,fm,false,livePreview,context);')) {
    noteFailure('Surface topology is no longer built in one camera- and export-independent world raster.');
  }
  if (!authoredSource.includes('if (!regenerate && compositionScene && compositionScene.presented) return compositionScene;')
    || !authoredSource.includes('function withSceneRenderClock(scene, callback)')
    || !authoredSource.includes('snapshotRenderableScene(width, height, true)')
    || (authoredSource.match(/withSceneRenderClock\([^,]+, function \(\)/g) || []).length < 4) {
    noteFailure('Static outputs no longer reuse the presented Compose scene and render clock.');
  }
  if (!authoredSource.includes('var compositionCameraOnlyPending = false;')
    || !authoredSource.includes('scheduleCompositionDraw(true);')
    || !authoredSource.includes('var canReusePresentedScene = cameraOnly && compositionScene && compositionScene.presented')
    || !authoredSource.includes('withSceneRenderClock(compositionScene, function ()')) {
    noteFailure('Camera-only Compose redraws are rebuilding or retiming the logical scene.');
  }
  if (authoredSource.includes("if (qualityMode === 'export') compositionQualityOverride = 'high';")
    || authoredSource.includes("if (qualityMode === 'export') return compact ? 24000 : 48000;")) {
    noteFailure('Export silently overrides the preview quality or FX budget, breaking screen/output parity.');
  }
  if (ids.has('canvasSizeBadge') || ids.has('canvasSizeText') || ids.has('btnCanvasReset')) {
    noteFailure('Legacy finite/resizable canvas-frame UI is still present.');
  }
  if (!ids.has('btnViewMode') || /#btnViewMode\s*\{[^}]*display\s*:\s*none/i.test(authoredSource)) {
    noteFailure('Canvas View mode is missing or hidden on a responsive breakpoint.');
  }
  if (!authoredSource.includes("localStorage.removeItem('typeDeformer.frameSize.v1')")
    || !authoredSource.includes("stage.style.removeProperty('--visual-overscan')")) {
    noteFailure('Legacy finite-frame persistence or dynamic preview overscan is not retired.');
  }
  const visualOverscanBody = authoredSource.match(/function updateVisualOverscan\(\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  if (!visualOverscanBody || /(?:width|height|inset|padding|margin|transform)\s*=|setProperty\(/.test(visualOverscanBody)) {
    noteFailure('Visual overscan may resize, shift, or transform the preview instead of remaining camera-neutral.');
  }
  if (!authoredSource.includes('var mobileLayoutWasMobile = mobileLayoutQuery.matches;')
    || !authoredSource.includes('openDesktopSection(mobileActiveSection);')) {
    noteFailure('Desktop and mobile workflow sections are not reconciled across the responsive breakpoint.');
  }
  if (!/data-batch=["']all["']/.test(markupOnly)) {
    noteFailure('The all-glyph batch action is missing.');
  }

  console.log(`HTML: ${ids.size} unique ids, ${referencedIds.size} literal id references, ${inlineScripts.length} inline script(s).`);
}

if (dictionarySource) {
  const bytes = fs.statSync(dictionaryPath).size;
  if (bytes < 1_000_000) noteWarning(`Dictionary is unexpectedly small (${bytes} bytes).`);
  if (!dictionarySource.includes('window.TYPE_DEFORMER_CONFUSE_DICTIONARY=')) {
    noteFailure('confuse-dictionary.js does not expose window.TYPE_DEFORMER_CONFUSE_DICTIONARY.');
  }
  for (const marker of ['<<<<<<<', '=======', '>>>>>>>']) {
    if (dictionarySource.includes(marker)) noteFailure(`confuse-dictionary.js contains an unresolved merge marker: ${marker}`);
  }

  try {
    const sandbox = { window: Object.create(null) };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    new vm.Script(dictionarySource, { filename: 'confuse-dictionary.js' })
      .runInContext(sandbox, { timeout: 30_000 });

    const data = sandbox.window.TYPE_DEFORMER_CONFUSE_DICTIONARY;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      noteFailure('Generated dictionary did not evaluate to an object.');
    } else {
      const meta = data.meta;
      if (!meta || typeof meta !== 'object') noteFailure('Generated dictionary is missing meta data.');
      else {
        if (meta.schema !== 3) noteFailure(`Unsupported dictionary schema: ${String(meta.schema)} (expected 3).`);
        if (typeof meta.unicode !== 'string' || !meta.unicode) noteFailure('Dictionary meta.unicode is missing.');
        if (!Array.isArray(meta.sources) || meta.sources.length < 3) noteFailure('Dictionary source provenance is incomplete.');
      }

      if (!data.skeleton || typeof data.skeleton !== 'object' || Array.isArray(data.skeleton)) {
        noteFailure('Generated dictionary is missing the skeleton map.');
      } else {
        const skeletonKeys = Object.keys(data.skeleton).length;
        if (skeletonKeys < 1_000) noteFailure(`Skeleton map is unexpectedly small (${skeletonKeys} keys).`);
        if (meta && Number.isFinite(meta.skeletonKeys) && skeletonKeys !== meta.skeletonKeys) {
          noteFailure(`Skeleton key count mismatch: meta=${meta.skeletonKeys}, actual=${skeletonKeys}.`);
        }
        console.log(`Dictionary: ${bytes} bytes, schema ${meta && meta.schema}, Unicode ${meta && meta.unicode}, ${skeletonKeys} skeleton keys.`);
      }
    }
  } catch (error) {
    noteFailure(`confuse-dictionary.js could not be evaluated: ${error.message}`);
  }
}

for (const warning of warnings) console.warn(`WARNING: ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  console.error(`Validation failed with ${failures.length} error(s) and ${warnings.length} warning(s).`);
  process.exitCode = 1;
} else {
  console.log(`Validation passed with ${warnings.length} warning(s).`);
}
