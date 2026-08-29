#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const htmlPath = path.join(root, 'index.html');
const dictionaryPath = path.join(root, 'confuse-dictionary.js');

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

const html = readRequired(htmlPath);
const dictionarySource = readRequired(dictionaryPath);

if (html) {
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
  for (const match of html.matchAll(getByIdPattern)) {
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
  if (!/script\.src\s*=\s*(["'])confuse-dictionary\.js\1/.test(html)) {
    noteFailure('The lazy loader for confuse-dictionary.js is missing.');
  }
  if (!html.includes('TYPE_DEFORMER_CONFUSE_DICTIONARY')) {
    noteFailure('index.html does not consume the generated dictionary global.');
  }

  const proceduralOperators = [
    'plotterTrace', 'webbing', 'softBlob', 'sigilForge', 'thornCrown', 'cipherLiturgy',
    'boneScaffold', 'roseEngine', 'chromeReliquary', 'ligatureCrypt', 'moireChoir', 'naveCutter',
    'cloisterFold', 'prismSacrament', 'texturaMatrix', 'voidPortal', 'recursiveShrine', 'morphProcession', 'chimeraGraft', 'monolithCast',
    'rasterPress', 'hatchEngrave', 'contourEtch', 'pressureStroke', 'cellFracture', 'ribbonEcho',
    'copyDecay', 'risoSeparation', 'slitSweep'
  ];
  const proceduralLabels = [
    'Kinetic Trace', 'Field Webbing', 'Physarum Blob', 'Sigil Forge', 'Thorn Crown', 'Cipher Liturgy',
    'Bone Scaffold', 'Rose Engine', 'Chrome Reliquary', 'Ligature Crypt', 'Moiré Choir', 'Nave Cutter',
    'Cloister Fold', 'Prism Sacrament', 'Textura Matrix', 'Void Portal', 'Recursive Shrine', 'Morph Procession', 'Chimera Graft', 'Monolith Cast',
    'Raster Press', 'Hatch Engrave', 'Contour Etch', 'Pressure Stroke', 'Cell Fracture', 'Ribbon Echo',
    'Copy Decay', 'Riso Separation', 'Slit Sweep'
  ];
  const surfaceSnapshotBody = html.match(/var surface = \{([\s\S]*?)\n\s*\};\n\s*var w =/)?.[1] || '';
  const surfaceSnapshotKeys = [...surfaceSnapshotBody.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((match) => match[1]);
  const duplicateSurfaceSnapshotKeys = [...new Set(surfaceSnapshotKeys.filter((key, index) => surfaceSnapshotKeys.indexOf(key) !== index))];
  if (!surfaceSnapshotBody || duplicateSurfaceSnapshotKeys.length) {
    noteFailure(duplicateSurfaceSnapshotKeys.length
      ? `Surface snapshot reuses strength/parameter key(s): ${duplicateSurfaceSnapshotKeys.join(', ')}.`
      : 'Surface snapshot object could not be inspected for strength/parameter key collisions.');
  }
  if (!html.includes('cloisterFoldAmount: deform.cloisterFold')
    || !html.includes("surfaceAggregate(glyphs, 'cloisterFold', 'cloisterFoldAmount', params.cloisterFold)")) {
    noteFailure('Cloister Fold strength and Fold amount do not have independent snapshot keys.');
  }
  for (const operator of proceduralOperators) {
    if (!new RegExp(`<option\\s+value=["']${operator}["']`).test(markupOnly)) {
      noteFailure(`Procedural operator "${operator}" is missing from the Operator select.`);
    }
    if (!new RegExp(`data-operator-panel=["']${operator}["']`).test(markupOnly)) {
      noteFailure(`Procedural operator "${operator}" is missing its control panel.`);
    }
    if (!new RegExp(`${operator}:\\s*\\{\\s*id:\\s*["']${operator}["']`).test(html)) {
      noteFailure(`Procedural operator "${operator}" is missing from OPERATOR_DEFS.`);
    }
  }
  for (const label of proceduralLabels) {
    if (!markupOnly.includes(`>${label}</option>`)) {
      noteFailure(`Procedural operator label "${label}" is missing from the Operator select.`);
    }
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
    ['pTraceDensity', '4'], ['pTraceDefinition', '256'], ['pTraceStroke', '40'], ['pTraceJitter', '500'], ['pTraceLift', '1'],
    ['pWebDensity', '6'], ['pWebReach', '1800'], ['pWebChaos', '8'], ['pWebSag', '6'], ['pWebStroke', '48'],
    ['pSoftBlobInflation', '6'], ['pSoftBlobStiffness', '5'], ['pSoftBlobChaos', '8'], ['pSoftBlobMembrane', '4'],
    ['pSoftBlobSporeReach', '2400'], ['pSoftBlobSporeDensity', '4'], ['pSoftBlobSpeed', '8'],
    ['pSigilComplexity', '24'], ['pSigilReach', '640'], ['pSigilSymmetry', '4'], ['pSigilStroke', '20'], ['pSigilBarbs', '6'],
    ['pThornLength', '360'], ['pThornDensity', '6'], ['pThornCurl', '3'], ['pThornStroke', '16'], ['pThornBranches', '4'],
    ['pCipherScale', '36'], ['pCipherDensity', '4'], ['pCipherOrbit', '360'], ['pCipherDrift', '160'], ['pCipherCallouts', '4'],
    ['pBoneCell', '40'], ['pBoneBranching', '4'], ['pBoneWeight', '16'], ['pBoneJoint', '28'], ['pBoneWarp', '4'],
    ['pRosePetals', '32'], ['pRoseRings', '8'], ['pRoseRadius', '560'], ['pRoseWarp', '2'], ['pRoseStroke', '18'],
    ['pChromeBevel', '96'], ['pChromeAngle', '180'], ['pChromeBands', '24'], ['pChromeContrast', '4'], ['pChromeWarp', '4'],
    ['pLigatureReach', '1800'], ['pLigatureBand', '180'], ['pLigatureRise', '4'], ['pLigatureCounter', '1.5'], ['pLigatureKnot', '64'],
    ['pMoirePitch', '160'], ['pMoireDetune', '0.95'], ['pMoireAngle', '180'], ['pMoireDepth', '8'], ['pMoireReach', '1200'],
    ['pNaveColumns', '24'], ['pNaveRise', '4'], ['pNaveVoid', '1'], ['pNaveButtress', '80'], ['pNaveWarp', '2'],
    ['pCloisterPlanes', '32'], ['pCloisterFold', '2'], ['pCloisterAxis', '180'], ['pCloisterPerspective', '4'], ['pCloisterCrease', '64'],
    ['pPrismRefraction', '4'], ['pPrismDispersion', '320'], ['pPrismFacets', '32'], ['pPrismCaustic', '6'], ['pPrismBloom', '640'],
    ['pTexturaPitch', '180'], ['pTexturaAngle', '90'], ['pTexturaWeight', '4'], ['pTexturaSplit', '1'], ['pTexturaSpur', '96'],
    ['pVoidDepth', '1600'], ['pVoidAngle', '180'], ['pVoidAperture', '1'], ['pVoidTaper', '2'], ['pVoidRibs', '32'],
    ['pRecursiveIterations', '24'], ['pRecursiveScale', '1.5'], ['pRecursiveTurn', '180'], ['pRecursiveOrbit', '1200'], ['pRecursiveParity', '1'],
    ['pMorphInbetweens', '24'], ['pMorphSpan', '2.5'], ['pMorphMelt', '2'], ['pMorphTwist', '360'], ['pMorphHalo', '160'],
    ['pChimeraGrafts', '32'], ['pChimeraSpan', '320'], ['pChimeraAssimilation', '1'], ['pChimeraForeignness', '4'], ['pChimeraSeam', '20'],
    ['pMonolithMass', '360'], ['pMonolithModule', '120'], ['pMonolithFault', '480'], ['pMonolithCounter', '1'], ['pMonolithFormwork', '4'],
    ['pRasterCell', '72'], ['pRasterGain', '3'], ['pRasterAngle', '90'], ['pRasterNoise', '2'],
    ['pHatchSpacing', '80'], ['pHatchAngle', '180'], ['pHatchWarp', '5'], ['pHatchStroke', '12'],
    ['pContourEtchBands', '64'], ['pContourEtchSpacing', '40'], ['pContourEtchStroke', '14'], ['pContourEtchDrift', '6'],
    ['pPressureWeight', '260'], ['pPressureContrast', '4'], ['pPressureAngle', '180'], ['pPressureFrequency', '32'], ['pPressureSoftness', '24'],
    ['pPressureBreath', '4'], ['pPressureDryness', '1'], ['pPressureTaper', '2'],
    ['pFractureCell', '140'], ['pFractureScatter', '520'], ['pFractureGap', '28'], ['pFractureSpin', '720'],
    ['pRibbonDepth', '520'], ['pRibbonSteps', '96'], ['pRibbonTwist', '540'], ['pRibbonFade', '1'],
    ['pCopyGenerations', '48'], ['pCopyExposure', '1.5'], ['pCopyMotion', '640'], ['pCopyErosion', '24'], ['pCopyToner', '5'], ['pCopyDust', '4'],
    ['pRisoSplit', '1'], ['pRisoOverlap', '1.5'], ['pRisoRegister', '160'], ['pRisoGrain', '2'],
    ['pSlitWidth', '96'], ['pSlitTravel', '720'], ['pSlitFrequency', '16'], ['pSlitMemory', '64'], ['pSlitSpeed', '4']
  ];
  for (const [id, expectedMax] of extremeRangeChecks) {
    const tag = markupOnly.match(new RegExp(`<input\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i'));
    if (!tag || !new RegExp(`\\bmax=["']${expectedMax.replace('.', '\\.') }["']`).test(tag[0])) {
      noteFailure(`${id} does not expose the expected extreme maximum (${expectedMax}).`);
    }
  }
  const extremeMinChecks = [
    ['pTraceDensity', '0.02'], ['pTraceDefinition', '1'], ['pTraceStroke', '0.1'], ['pTraceJitter', '0'], ['pTraceLift', '0'],
    ['pWebDensity', '0'], ['pWebReach', '4'], ['pWebChaos', '0'], ['pWebSag', '-6'], ['pWebStroke', '0.1'],
    ['pSoftBlobInflation', '0'], ['pSoftBlobStiffness', '0'], ['pSoftBlobChaos', '0'], ['pSoftBlobMembrane', '0'],
    ['pSoftBlobSporeReach', '0'], ['pSoftBlobSporeDensity', '0'], ['pSoftBlobSpeed', '0'],
    ['pSigilComplexity', '1'], ['pSigilReach', '0'], ['pSigilSymmetry', '0'], ['pSigilStroke', '0.2'], ['pSigilBarbs', '0'],
    ['pThornLength', '0'], ['pThornDensity', '0.05'], ['pThornCurl', '-3'], ['pThornStroke', '0.2'], ['pThornBranches', '0'],
    ['pCipherScale', '3'], ['pCipherDensity', '0.1'], ['pCipherOrbit', '0'], ['pCipherDrift', '0'], ['pCipherCallouts', '0'],
    ['pBoneCell', '2'], ['pBoneBranching', '0'], ['pBoneWeight', '0.2'], ['pBoneJoint', '0'], ['pBoneWarp', '0'],
    ['pRosePetals', '3'], ['pRoseRings', '1'], ['pRoseRadius', '8'], ['pRoseWarp', '-2'], ['pRoseStroke', '0.2'],
    ['pChromeBevel', '1'], ['pChromeAngle', '-180'], ['pChromeBands', '2'], ['pChromeContrast', '0'], ['pChromeWarp', '0'],
    ['pLigatureReach', '0'], ['pLigatureBand', '1'], ['pLigatureRise', '-4'], ['pLigatureCounter', '0'], ['pLigatureKnot', '0'],
    ['pMoirePitch', '2'], ['pMoireDetune', '-0.95'], ['pMoireAngle', '-180'], ['pMoireDepth', '0'], ['pMoireReach', '0'],
    ['pNaveColumns', '1'], ['pNaveRise', '0.25'], ['pNaveVoid', '0'], ['pNaveButtress', '0'], ['pNaveWarp', '-2'],
    ['pCloisterPlanes', '1'], ['pCloisterFold', '-2'], ['pCloisterAxis', '-180'], ['pCloisterPerspective', '0'], ['pCloisterCrease', '0'],
    ['pPrismRefraction', '-4'], ['pPrismDispersion', '0'], ['pPrismFacets', '1'], ['pPrismCaustic', '0'], ['pPrismBloom', '0'],
    ['pTexturaPitch', '2'], ['pTexturaAngle', '-90'], ['pTexturaWeight', '0.1'], ['pTexturaSplit', '0'], ['pTexturaSpur', '0'],
    ['pVoidDepth', '0'], ['pVoidAngle', '-180'], ['pVoidAperture', '0'], ['pVoidTaper', '-2'], ['pVoidRibs', '1'],
    ['pRecursiveIterations', '1'], ['pRecursiveScale', '0.25'], ['pRecursiveTurn', '-180'], ['pRecursiveOrbit', '0'], ['pRecursiveParity', '0'],
    ['pMorphInbetweens', '1'], ['pMorphSpan', '0.1'], ['pMorphMelt', '-2'], ['pMorphTwist', '-360'], ['pMorphHalo', '0'],
    ['pChimeraGrafts', '1'], ['pChimeraSpan', '4'], ['pChimeraAssimilation', '0'], ['pChimeraForeignness', '0'], ['pChimeraSeam', '0'],
    ['pMonolithMass', '-120'], ['pMonolithModule', '2'], ['pMonolithFault', '-480'], ['pMonolithCounter', '0'], ['pMonolithFormwork', '0'],
    ['pRasterCell', '2'], ['pRasterGain', '0.05'], ['pRasterAngle', '-90'],
    ['pHatchSpacing', '1'], ['pHatchAngle', '-180'], ['pHatchStroke', '0.1'],
    ['pContourEtchBands', '1'], ['pContourEtchSpacing', '1'], ['pContourEtchStroke', '0.25'],
    ['pPressureWeight', '-120'], ['pPressureFrequency', '0.1'], ['pPressureSoftness', '0.1'],
    ['pPressureBreath', '0'], ['pPressureDryness', '0'], ['pPressureTaper', '-2'],
    ['pFractureCell', '4'], ['pFractureSpin', '-720'],
    ['pRibbonDepth', '-520'], ['pRibbonSteps', '1'], ['pRibbonTwist', '-540'],
    ['pCopyGenerations', '1'], ['pCopyExposure', '-1.5'], ['pCopyMotion', '-640'],
    ['pRisoSplit', '-1'], ['pSlitWidth', '1'], ['pSlitTravel', '-720'], ['pSlitFrequency', '0.25'], ['pSlitMemory', '1']
  ];
  for (const [id, expectedMin] of extremeMinChecks) {
    const tag = markupOnly.match(new RegExp(`<input\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i'));
    if (!tag || !new RegExp(`\\bmin=["']${expectedMin.replace('.', '\\.') }["']`).test(tag[0])) {
      noteFailure(`${id} does not expose the expected extreme minimum (${expectedMin}).`);
    }
  }
  for (const renderer of ['renderSigilForge', 'renderThornCrown', 'renderCipherLiturgy', 'renderBoneScaffold', 'renderRoseEngine', 'renderChromeReliquary', 'renderLigatureCrypt', 'renderMoireChoir', 'renderNaveCutter', 'renderCloisterFold', 'renderPrismSacrament', 'renderTexturaMatrix', 'renderVoidPortal', 'renderRecursiveShrine', 'renderMorphProcession', 'renderChimeraGraft', 'renderMonolithCast', 'renderRasterPress', 'renderHatchEngrave', 'renderContourEtch', 'renderPressureStroke', 'renderCellFracture',
    'renderRibbonEcho', 'renderCopyDecay', 'renderRisoSeparation', 'renderSlitSweep']) {
    if (!html.includes(`function ${renderer}(`)) noteFailure(`${renderer} is missing from the surface renderer.`);
  }
  if (!html.includes('function renderSoftBlobSporeField(') || !html.includes('softBlobSporeReach')
    || !html.includes('softBlobSporeDensity') || !html.includes("'blob-spore-cloud-color'")) {
    noteFailure('Physarum Blob far-field spore rendering is incomplete.');
  }
  if (!html.includes("surfaceNodesForGlyphs(glyphs, 'sigilForge'") || !html.includes('function strokeBranch(')
    || !html.includes("sampleSurfaceMask(mask, Math.min(1, density / 2.2), true")
    || !html.includes('source.codePointAt(0)') || !html.includes("ctx.globalCompositeOperation = 'destination-in'")) {
    noteFailure('Digital Gothic Operator geometry, contour growth, or source-derived inscriptions are incomplete.');
  }
  for (const refinement of ['function drawLancet(', 'function drawHook(', 'function drawBud(',
    'function cipherSecondaryToken(', "return 'B' + binary.slice(-8)"]) {
    if (!html.includes(refinement)) noteFailure(`Digital Gothic ornament or inscription variation is missing ${refinement}.`);
  }
  if (!html.includes("surfaceBoundaryDistance(source.data, width, height)")
    || !html.includes("surfaceNodesForGlyphs(glyphs, 'roseEngine'")
    || !html.includes("surfaceHexRgb(surfaceEffectColor('chromeReliquary'))")
    || !html.includes('points.length < 2600') || !html.includes('ring < rings') || !html.includes('petal < petals')) {
    noteFailure('Cathedral Topology geometry, source linkage, or bounded rendering is incomplete.');
  }
  for (const refinement of ['function addPoint(x, y, distance, tangentX, tangentY, ridge)',
    'function drawRoseHub(hubRadius)', 'function chromeOffsetShell(name, shiftX, shiftY, color, opacity)',
    "chrome-reliquary-magenta-rim", 'var acidAmount =']) {
    if (!html.includes(refinement)) noteFailure(`Cathedral Topology refinement is missing ${refinement}.`);
  }
  for (const key of ['boneOpacity', 'roseOpacity', 'chromeOpacity',
    'boneSourceOpacity', 'roseSourceOpacity', 'chromeSourceOpacity',
    'boneBlend', 'roseBlend', 'chromeBlend', 'boneColor', 'roseColor', 'chromeColor']) {
    if (!html.includes(key)) noteFailure(`Cathedral Topology Surface Mixer state is missing ${key}.`);
  }
  if (!html.includes("surfaceNodesForGlyphs(glyphs, 'ligatureCrypt', 97")
    || !html.includes('pairs.length < 96') || !html.includes('traceLigatureCryptBand(ctx')
    || !html.includes('counterPair = pairs[c]') || !html.includes('function cutLigatureCryptAperture(')
    || !html.includes('function strokeLigatureCryptSpine(')
    || !html.includes('function ligatureCryptCurve(')
    || !html.includes('cryptHalfWidth * 0.46')) {
    noteFailure('Ligature Crypt source-order, bounded-band, or counter geometry is incomplete.');
  }
  if (!html.includes("surfaceBoundaryDistance(source.data, width, height)")
    || !html.includes('secondFrequency = frequency') || !html.includes('phaseA - phaseB')
    || !html.includes("surfaceEffectColor('moireChoir')")) {
    noteFailure('Moiré Choir distance-linked detuned interference renderer is incomplete.');
  }
  if (!html.includes("buildSurfaceMask(glyphs, 'naveCutter'")
    || !html.includes("surfaceScratch('nave-cutter-supports'")
    || !html.includes("ctx.globalCompositeOperation = 'destination-out'")
    || !html.includes("supports.ctx.globalCompositeOperation = 'destination-in'")) {
    noteFailure('Nave Cutter subtractive apertures or mask-clipped buttresses are incomplete.');
  }
  for (const mapping of ['ligatureCrypt: renderLigatureCrypt', 'moireChoir: renderMoireChoir', 'naveCutter: renderNaveCutter']) {
    if (!html.includes(mapping)) noteFailure(`Word-Bound Optical Architecture dispatch is missing ${mapping}.`);
  }
  for (const key of ['ligatureOpacity', 'moireOpacity', 'naveOpacity',
    'ligatureSourceOpacity', 'moireSourceOpacity', 'naveSourceOpacity',
    'ligatureBlend', 'moireBlend', 'naveBlend', 'ligatureColor', 'moireColor', 'naveColor']) {
    if (!html.includes(key)) noteFailure(`Word-Bound Optical Architecture Surface Mixer state is missing ${key}.`);
  }
  for (const marker of ["ligatureCrypt: [{ key: 'ligatureReach'", "moireChoir: [{ key: 'moirePitch'", "naveCutter: [{ key: 'naveColumns'",
    "bindRange('pLigatureReach'", "bindRange('pMoirePitch'", "bindRange('pNaveColumns'",
    'reach: params.ligatureReach', 'pitch: params.moirePitch', 'columns: params.naveColumns']) {
    if (!html.includes(marker)) noteFailure(`Word-Bound Optical Architecture Batch/Proof/binding/metadata integration is missing ${marker}.`);
  }
  if (!html.includes("buildSurfaceMask(glyphs, 'cloisterFold'")
    || !html.includes('ctx.transform(axialScale, 0, shear, compression')
    || !html.includes('plane < planes')) {
    noteFailure('Cloister Fold coherent plane clipping or affine fold geometry is incomplete.');
  }
  if (!html.includes("buildSurfaceMask(glyphs, 'prismSacrament'")
    || !html.includes('function signedDistanceAt(') || !html.includes('offsetA = baseShift + dispersion')
    || !html.includes('causticBand = outsideFalloff') || !html.includes('params.prismColorB')) {
    noteFailure('Prism Sacrament alpha-normal refraction, dispersion, or caustic rendering is incomplete.');
  }
  if (!html.includes("buildSurfaceMask(glyphs, 'texturaMatrix'")
    || !html.includes('function traceTexturaStem(') || !html.includes('runs.push({ x: sampleX')
    || !html.includes("ctx.globalCompositeOperation = 'destination-in'")) {
    noteFailure('Textura Matrix continuous-run reconstruction or source clipping is incomplete.');
  }
  for (const mapping of ['cloisterFold: renderCloisterFold', 'prismSacrament: renderPrismSacrament', 'texturaMatrix: renderTexturaMatrix']) {
    if (!html.includes(mapping)) noteFailure(`Hard-Surface Rite dispatch is missing ${mapping}.`);
  }
  for (const key of ['cloisterOpacity', 'prismOpacity', 'texturaOpacity',
    'cloisterSourceOpacity', 'prismSourceOpacity', 'texturaSourceOpacity',
    'cloisterBlend', 'prismBlend', 'texturaBlend', 'cloisterColor', 'prismColorA', 'prismColorB', 'texturaColor']) {
    if (!html.includes(key)) noteFailure(`Hard-Surface Rite Surface Mixer state is missing ${key}.`);
  }
  for (const marker of ["cloisterFold: [{ key: 'cloisterPlanes'", "prismSacrament: [{ key: 'prismRefraction'", "texturaMatrix: [{ key: 'texturaPitch'",
    "bindRange('pCloisterPlanes'", "bindRange('pPrismRefraction'", "bindRange('pTexturaPitch'",
    'planes: params.cloisterPlanes', 'refraction: params.prismRefraction', 'pitch: params.texturaPitch']) {
    if (!html.includes(marker)) noteFailure(`Hard-Surface Rite Batch/Proof/binding/metadata integration is missing ${marker}.`);
  }
  if (!html.includes('function surfaceVoidApertureMask(')
    || !html.includes('var queue = new Int32Array(count)')
    || !html.includes('var enclosed = !solid[i] && !outside[i]')
    || !html.includes("buildSurfaceMask(glyphs, 'voidPortal'")) {
    noteFailure('Void Portal counter flood-fill, chamber detection, or source-mask routing is incomplete.');
  }
  if (!html.includes("buildSurfaceMask(glyphs, 'recursiveShrine'")
    || !html.includes('function drawRecursiveMask(')
    || !html.includes("xorLayer.ctx.globalCompositeOperation = 'xor'")
    || !html.includes('iteration < iterations')) {
    noteFailure('Recursive Shrine affine recursion or parity/XOR rendering is incomplete.');
  }
  if (!html.includes('function surfaceMorphGlyphField(')
    || !html.includes('var signed = new Float32Array(size * size)')
    || !html.includes("buildSurfaceMask(glyphs, 'morphProcession'")
    || !html.includes('pairIndex < 12')) {
    noteFailure('Morph Procession signed-distance interpolation or bounded pair rendering is incomplete.');
  }
  for (const mapping of ['voidPortal: renderVoidPortal', 'recursiveShrine: renderRecursiveShrine', 'morphProcession: renderMorphProcession']) {
    if (!html.includes(mapping)) noteFailure(`Null-Space Logic dispatch is missing ${mapping}.`);
  }
  for (const key of ['voidOpacity', 'recursiveOpacity', 'morphOpacity',
    'voidSourceOpacity', 'recursiveSourceOpacity', 'morphSourceOpacity',
    'voidBlend', 'recursiveBlend', 'morphBlend', 'voidColor', 'recursiveColor', 'morphColor']) {
    if (!html.includes(key)) noteFailure(`Null-Space Logic Surface Mixer state is missing ${key}.`);
  }
  for (const marker of ["voidPortal: [{ key: 'voidDepth'", "recursiveShrine: [{ key: 'recursiveScale'", "morphProcession: [{ key: 'morphInbetweens'",
    "bindRange('pVoidDepth'", "bindRange('pRecursiveIterations'", "bindRange('pMorphInbetweens'",
    'depth: params.voidDepth', 'iterations: params.recursiveIterations', 'inbetweens: params.morphInbetweens']) {
    if (!html.includes(marker)) noteFailure(`Null-Space Logic Batch/Proof/binding/metadata integration is missing ${marker}.`);
  }
  if (!html.includes("buildSurfaceMask(glyphs, 'monolithCast'")
    || !html.includes('var course = Math.floor((y - originY) / moduleSize)')
    || !html.includes('surfaceVoidApertureMask(mask, 0)')
    || !html.includes('var courseGroove = formwork')) {
    noteFailure('Monolith Cast mass, construction-course, counter, or formwork rendering is incomplete.');
  }
  if (!html.includes("buildSurfaceMask(glyphs, 'chimeraGraft'")
    || !html.includes('var donor = active[(hostIndex + 1) % active.length]')
    || !html.includes('work.ctx.bezierCurveTo(')
    || !html.includes('work.ctx.ellipse(targetX, targetY')
    || !html.includes("work.ctx.globalCompositeOperation = 'destination-out'")) {
    noteFailure('Chimera Graft donor, tissue, transplant, or incision rendering is incomplete.');
  }
  if (!html.includes("surfaceAggregate(glyphs, 'pressureStroke', 'pressureBreath'")
    || !html.includes("surfaceAggregate(glyphs, 'pressureStroke', 'pressureDryness'")
    || !html.includes("surfaceAggregate(glyphs, 'pressureStroke', 'pressureTaper'")
    || !html.includes('var respiration = Math.sin(phase')
    || !html.includes('coverage *= retention')) {
    noteFailure('Pressure Stroke breath, dry-brush, taper, or unified energy field is incomplete.');
  }
  for (const mapping of ['chimeraGraft: renderChimeraGraft', 'monolithCast: renderMonolithCast']) {
    if (!html.includes(mapping)) noteFailure(`Body-Energy-Relation dispatch is missing ${mapping}.`);
  }
  for (const key of ['chimeraOpacity', 'monolithOpacity', 'chimeraSourceOpacity', 'monolithSourceOpacity',
    'chimeraBlend', 'monolithBlend', 'chimeraColor', 'monolithColor']) {
    if (!html.includes(key)) noteFailure(`Body-Energy-Relation Surface Mixer state is missing ${key}.`);
  }
  for (const marker of ["chimeraGraft: [{ key: 'chimeraGrafts'", "monolithCast: [{ key: 'monolithMass'", "pressureStroke: [{ key: 'pressureBreath'",
    "bindRange('pChimeraGrafts'", "bindRange('pMonolithMass'", "bindRange('pPressureBreath'",
    'grafts: params.chimeraGrafts', 'mass: params.monolithMass', 'breath: params.pressureBreath']) {
    if (!html.includes(marker)) noteFailure(`Body-Energy-Relation Batch/Proof/binding/metadata integration is missing ${marker}.`);
  }
  if (!html.includes("prismSacrament: 'prismColorB'")
    || !html.includes('SURFACE_SECONDARY_COLOR_KEYS[params.activeOperator]')) {
    noteFailure('Surface Mixer secondary effect-ink routing is not extensible beyond Riso Separation.');
  }
  if (!/id=["']surfaceFxCanvas["']/.test(markupOnly) || !html.includes('renderSurfaceFxLayer')) {
    noteFailure('The shared procedural surface renderer is incomplete.');
  }
  if (!html.includes('surfaceEffectColor') || !html.includes('surfaceSourceOpacity') || !html.includes('compositeSurfaceSource')) {
    noteFailure('Independent effect color or source-text compositing is missing from the surface renderer.');
  }
  for (const id of ['surfaceMixerBlock', 'pSurfaceOpacity', 'vSurfaceOpacity', 'pSurfaceBlend',
    'btnSurfaceBack', 'btnSurfaceFront', 'surfaceOrderLabel']) {
    if (!ids.has(id)) noteFailure(`Surface Mixer is missing ${id}.`);
  }
  if (!html.includes('SURFACE_OPACITY_KEYS') || !html.includes('SURFACE_BLEND_KEYS')
    || !html.includes('normalizedSurfaceRenderOrder') || !html.includes('surfaceMixerChanged')) {
    noteFailure('Surface Mixer state, migration, or UI wiring is incomplete.');
  }
  if (!html.includes("'operatorPanelsBlock', 'surfaceMixerBlock', 'effectExtrasBlock'")) {
    noteFailure('Surface Mixer is not routed into the progressive Effect workflow.');
  }
  if (!html.includes('targetCtx.globalAlpha = surfaceOutputOpacity(id)')
    || !html.includes('targetCtx.globalCompositeOperation = surfaceBlendMode(id)')) {
    noteFailure('Surface render layers no longer composite with independent opacity and blend mode.');
  }
  if (!html.includes('data-surface-effect-opacity="0.5"') || !html.includes('setActiveSurfaceOpacity')
    || !html.includes('surfaceOpacityPresetButtons')) {
    noteFailure('Surface Mixer no longer exposes touch-friendly effect-opacity controls.');
  }
  if (html.includes('surfaceGlyphStrength(g, id) * surfaceOutputOpacity(id)')
    || html.includes('surfaceOperatorStrength(info, id) * surfaceOutputOpacity(id)')) {
    noteFailure('Effect opacity is coupled to source-text opacity.');
  }
  if (!html.includes('applySurfaceSourceVisual') || !html.includes('updateAllSurfaceSourceVisuals')
    || !markupOnly.includes('.stage .c[data-surface-source]')) {
    noteFailure('Live editable glyphs no longer expose continuous source-opacity compositing.');
  }
  if (!html.includes('surfaceEffects: {') || !html.includes('surfaceMixer: { order: surfaceRenderOrder()')) {
    noteFailure('SVG metadata does not preserve procedural surface output settings.');
  }
  for (const id of ['pMatrixGrammar', 'pMatrixSignal', 'pMatrixReading', 'pMatrixColumns', 'pMatrixRows',
    'pMatrixMinScale', 'pMatrixMaxScale', 'pMatrixSpan', 'pMatrixEmphasis', 'pMatrixAlignment',
    'pMatrixCopies', 'pMatrixMargin', 'pMatrixGutter', 'pMatrixVoidX', 'pMatrixVoidY',
    'pMatrixVoidSize', 'pMatrixCollision', 'pMatrixRotation', 'pMatrixJitter', 'pMatrixMorph',
    'pMatrixColorMode', 'pMatrixGuides', 'pMatrixGuideOpacity']) {
    if (!ids.has(id)) noteFailure(`Type Matrix is missing ${id}.`);
  }
  if (!html.includes("typeMatrix: { id: 'typeMatrix', label: 'Type Matrix' }")
    || !html.includes('function generateTypeMatrixScene(')
    || !html.includes("'typeMatrix', 'Type Matrix', generateTypeMatrixScene")
    || !html.includes('editorialSignal:') || !html.includes('kineticTension:')) {
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
    if (!html.includes(`function ${fn}(`)) noteFailure(`Path Loom is missing ${fn}().`);
  }
  if (!html.includes("pathLoom: { id: 'pathLoom', label: 'Path Loom' }")
    || !html.includes("'pathLoom', 'Path Loom', generatePathLoomScene")
    || !html.includes('counterBraid:') || !html.includes('orbitChorus:') || !html.includes('kineticCoil:')
    || !html.includes('customPath: []') || !html.includes('customPathPoints: loom.customPath.length')) {
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
    if (!html.includes(`function ${fn}(`)) noteFailure(`Glyph Signal Router is missing ${fn}().`);
  }
  if (!html.includes('SIGNAL_ROUTER_PRESETS') || !html.includes('generated = applyCompositionSignalRouter(generated, compiled, width, height)')) {
    noteFailure('Glyph Signal Router recipes or scene-pipeline integration are incomplete.');
  }
  if (!html.includes('schemaVersion: 10') || !html.includes('out.schemaVersion = 10')) {
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
    if (!html.includes(`function ${fn}(`)) noteFailure(`Glyph Vessel is missing ${fn}().`);
  }
  if (!html.includes("glyphVessel: compositionEngineContract(") ||
      !html.includes("['counterformPress', 'packedManifesto', 'portraitField', 'edgeAssembly', 'ruptureVessel']")) {
    noteFailure('Glyph Vessel registry or preset contract is incomplete.');
  }
  if (!html.includes('var state = { active: mobileActiveSection, compositionInspector: compositionInspector };')
    || !html.includes('function restoredWorkflowSection(saved)')
    || !html.includes('if (saved && COMPOSITION_DEFS[saved.compositionInspector]) compositionInspector = saved.compositionInspector;')
    || !html.includes('var initialWorkflowSection = restoredWorkflowSection(saved);')
    || !html.includes('var shouldOpen = key === initialWorkflowSection;')
    || !html.includes('compositionInspector = silent && COMPOSITION_DEFS[localCompositionInspector]')) {
    noteFailure('The active workflow section or draft Compose engine is not persisted.');
  }
  if (!ids.has('compositionEngineGuide')
    || !html.includes('var COMPOSITION_ENGINE_GUIDES = {')
    || !html.includes("glyphVessel: 'Glyph Vessel —")
    || !html.includes("document.getElementById('compositionEngineGuide').textContent = COMPOSITION_ENGINE_GUIDES[compositionInspector]")) {
    noteFailure('Compose does not explain the selected engine before its dense controls.');
  }
  if (!html.includes('id="mobileSheetTitle" tabindex="-1"')
    || !html.includes('var mobileSheetReturnFocus = null;')
    || !html.includes("controlPanel.setAttribute('role', 'dialog')")
    || !html.includes("title.focus({ preventScroll: true })")) {
    noteFailure('The mobile workflow sheet no longer establishes and restores a clear focus context.');
  }
  if (!ids.has('btnMobileParameterSearch')
    || !html.includes('function openParameterSearch()')
    || !html.includes("document.getElementById('btnMobileParameterSearch').addEventListener('click', openParameterSearch)")
    || !html.includes('var hasActiveSearch = Boolean(search.value || parameterChangedOnly);')
    || !html.includes('event.stopPropagation();')
    || !html.includes('var parameterSearchPointerActive = false;')
    || !html.includes("document.addEventListener('pointerup', finishParameterSearchPointer)")
    || !html.includes('function keepParameterResultsVisible(search, results)')
    || !html.includes('.panel.mobile-text-focus .stage-actions { display: none; }')) {
    noteFailure('Mobile parameter search is not discoverable or Escape can close it while clearing a filter.');
  }
  if (!html.includes('var operatorDefinition = OPERATOR_DEFS[operatorId];')
    || !html.includes('var compositionDefinition = COMPOSITION_DEFS[compositionId];')) {
    noteFailure('Parameter search results no longer use the visible operator and composition names.');
  }
  for (const id of ['btnOperatorBrowser', 'operatorGuideCategory', 'operatorGuideSummary',
    'operatorBrowser', 'operatorBrowserKicker', 'operatorBrowserTitle', 'operatorBrowserSearch', 'operatorBrowserCategory',
    'operatorBrowserStatus', 'operatorBrowserList', 'btnOperatorBrowserClose']) {
    if (!ids.has(id)) noteFailure(`Effect Browser is missing ${id}.`);
  }
  const operatorDefsBlock = html.match(/var OPERATOR_DEFS = \{([\s\S]*?)\r?\n      \};\r?\n      var OPERATOR_GUIDES = \{/);
  const operatorGuidesBlock = html.match(/var OPERATOR_GUIDES = \{([\s\S]*?)\r?\n      \};\r?\n      var OPERATOR_IDS/);
  if (!operatorDefsBlock || !operatorGuidesBlock) {
    noteFailure('Effect Browser guide data is not adjacent to the Operator registry.');
  } else {
    const literalKeys = (block) => [...block.matchAll(/^\s{8}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]);
    const operatorDefKeys = literalKeys(operatorDefsBlock[1]);
    const operatorGuideKeys = new Set(literalKeys(operatorGuidesBlock[1]));
    const missingGuides = operatorDefKeys.filter((id) => !operatorGuideKeys.has(id));
    const extraGuides = [...operatorGuideKeys].filter((id) => !operatorDefKeys.includes(id));
    if (missingGuides.length || extraGuides.length) {
      noteFailure(`Effect Browser guide coverage mismatch: missing=${missingGuides.join(',') || 'none'} extra=${extraGuides.join(',') || 'none'}.`);
    }
  }
  if (!html.includes('function renderOperatorBrowser()')
    || !html.includes('function syncOperatorGuide()')
    || !html.includes("setActiveOperator(button.dataset.operatorBrowserId)")
    || !html.includes("operatorBrowser.addEventListener('keydown'")
    || !html.includes("operatorBrowserReturnFocus")
    || !html.includes('var currentIndex = focusable.indexOf(document.activeElement);')
    || !html.includes('if (operatorChanged) markAutosaveDirty();')
    || !html.includes('select[id^="p"]:not(#pOperator)')
    || !html.includes('id="pOperator" aria-describedby="operatorGuideSummary"')) {
    noteFailure('Effect Browser search, selection, persistence, focus return, or current-effect explanation is incomplete.');
  }
  for (const id of ['applicationModeHint', 'applicationQuickTitle', 'applicationQuickStatus', 'btnApplyCurrentTarget']) {
    if (!ids.has(id)) noteFailure(`Apply-stage quick action is missing ${id}.`);
  }
  if (!html.includes('function matchingBatchMetrics(')
    || !html.includes('function updateApplicationSummary()')
    || !html.includes("batchToggle(batchMatchers[activeBatchProfile] || batchMatchers.all)")
    || !html.includes('.panel-section[data-panel-section="apply"] .stage-lede { display: none; }')) {
    noteFailure('The selected Effect cannot be applied to the current target from the first Apply-stage viewport.');
  }
  if (!html.includes('var partial = toggled > 0 && !allOn;')
    || !html.includes('var releasing = 0;')
    || !html.includes("'\u6587\u5b57\u3092\u89e3\u9664\u4e2d\u2026'")
    || html.includes('var partial = affected > 0 && !allOn;')) {
    noteFailure('Quick apply confuses visual easing residue with a still-applied Effect after release.');
  }
  if (!html.includes('<span>Active / 作用中</span>')
    || !html.includes("var activeLayerCount = active.length + (compositionActive ? 1 : 0);")
    || !html.includes("activeLayerCount + ' active / ' + activeLayerCount + '件'")
    || html.includes("' / ' + (OPERATOR_IDS.length + 1)")) {
    noteFailure('The Apply-stage active inventory still presents Composition as a missing Effect count.');
  }
  for (const id of ['exportQuickTitle', 'exportQuickSummary', 'btnQuickPreview', 'btnQuickPng', 'btnQuickSvg',
    'exportActionStatus', 'exportQuickActionStatus']) {
    if (!ids.has(id)) noteFailure(`Mobile Quick export is missing ${id}.`);
  }
  if (!html.includes('.export-quick { display: grid;')
    || !html.includes("document.getElementById('btnQuickPreview').addEventListener('click'")
    || !html.includes("document.getElementById('btnQuickPng').addEventListener('click'")
    || !html.includes("document.getElementById('btnQuickSvg').addEventListener('click'")
    || !html.includes("var quick = document.getElementById('exportQuickSummary');")) {
    noteFailure('Mobile Export does not expose visible Preview/PNG/SVG actions or keep their summary in sync.');
  }
  if (!html.includes('function previewScaleForLayout(width, height, requestedScale)')
    || !html.includes('var renderScale = previewMode ? previewScaleForLayout(L.w, L.h, requestedScale) : requestedScale;')
    || !html.includes('renderCanvas(params.exportScale, true)')
    || !html.includes('canvas.dataset.previewRequestedWidth')
    || !html.includes("' px preview'")) {
    noteFailure('Preview still renders the full export scale instead of a bounded calibration image.');
  }
  if (!html.includes('function hasExportDeformation()')
    || !html.includes('function updateExportActionAvailability()')
    || !html.includes("var actionIds = ['btnPng', 'btnSvg', 'btnCopy', 'btnPreview', 'btnQuickPreview', 'btnQuickPng', 'btnQuickSvg', 'btnMobilePreview', 'btnHeaderPreview'];")
    || !html.includes("'変形のみ：対象なし'")
    || !html.includes('updateExportActionAvailability();')) {
    noteFailure('Deformed-only export actions still open a blocking alert when the artwork has no deformation.');
  }
  if (!html.includes('function downloadOutcomeLabel(mode)')
    || !html.includes("return 'share';")
    || !html.includes("return 'tab';")
    || !html.includes("return 'download';")
    || !html.includes("if (mode === 'share') return 'share sheet requested';")
    || !html.includes("if (mode === 'tab') return 'opened in a new tab';")) {
    noteFailure('Download actions no longer report the desktop, iOS share-sheet, or iOS tab outcome.');
  }
  if (!html.includes('var exportActionStatuses = [')
    || !html.includes("document.getElementById('exportActionStatus')")
    || !html.includes("document.getElementById('exportQuickActionStatus')")
    || !html.includes('function setExportActionStatus(message, state)')
    || !html.includes("setExportActionStatus('Generating PNG…', 'working')")
    || !html.includes("exportReadyMessage('PNG', pngCanvas.width, pngCanvas.height, mode)")
    || !html.includes("setExportActionStatus('Generating View shot…', 'working')")
    || !html.includes("exportReadyMessage('View shot', shotCanvas.width, shotCanvas.height, mode)")
    || !html.includes("setExportActionStatus('Preparing PNG for clipboard…', 'working')")
    || !html.includes("setExportActionStatus('Generating SVG…', 'working')")
    || !html.includes("exportReadyMessage('SVG', W, H, mode)")) {
    noteFailure('PNG, SVG, View shot, or clipboard actions no longer expose mirrored working and completion feedback.');
  }
  const dataMoshValuesFunction = html.match(/function dataMoshValues\(info, deform\) \{[\s\S]*?(?=\n\s*function applyDataMoshVisual)/)?.[0] || '';
  if (!dataMoshValuesFunction.includes("var active = state.manual != null || strength > 0.001;")
    || !dataMoshValuesFunction.includes('if (!active) return {')
    || !dataMoshValuesFunction.includes('scaleX: 1, scaleY: 1')
    || !dataMoshValuesFunction.includes('passAX: 0, passAY: 0, passBX: 0, passBY: 0')
    || !dataMoshValuesFunction.includes('active: false')) {
    noteFailure('Unapplied Data Mosh does not return a complete identity transform before its destructive hash logic.');
  }
  if (!html.includes('var disabled = compositionState.enabled;')
    || !html.includes("if (gridSettingsLink) gridSettingsLink.click();")
    || !html.includes("openMobileSheet('compose', 'pGridEnabled')")
    || !html.includes('function revealMobileSheetAnchor(anchor)')
    || !html.includes('.panel-section[data-panel-section="compose"] #composeGridSlot { order: 1; }')
    || html.includes('var disabled = !params.gridEnabled || compositionState.enabled;')) {
    noteFailure('Arrange cannot route a Grid-off user to Grid settings.');
  }
  if (!html.includes('var frontCoreIndex = Math.min(cores.length - 1,')
    || html.includes('var core = cores[front];')) {
    noteFailure('Physarum spore fronts can index past a sparse core array.');
  }
  const stagePointerEnterStart = html.indexOf("stage.addEventListener('pointerenter'");
  const stagePointerMoveStart = html.indexOf("stage.addEventListener('pointermove'", stagePointerEnterStart);
  const stagePointerEnterBody = stagePointerEnterStart >= 0 && stagePointerMoveStart > stagePointerEnterStart
    ? html.slice(stagePointerEnterStart, stagePointerMoveStart)
    : '';
  if (!stagePointerEnterBody || stagePointerEnterBody.includes('pointer.active = true')
    || !html.includes("if (!pointer.active && params.mode === 'flow') pushHistory();")
    || !html.includes('var pointerDriving = pointer.active || pointer.pulse;')
    || !html.includes('pointer.pulse = true;')) {
    noteFailure('A stationary pointer can paint a Lens Effect when a control sheet moves the canvas underneath it.');
  }
  if (!html.includes("item.count === 1 ? ' glyph' : ' glyphs'")) {
    noteFailure('The active Effect inventory announces a singular glyph as plural.');
  }
  if (!html.includes('function uiScrollBehavior()')
    || (html.match(/behavior:\s*'smooth'/g) || []).length > 0) {
    noteFailure('UI reveal scrolling no longer respects reduced-motion preferences.');
  }
  if (!html.includes('compositionBody.insertBefore(compositionBuildBlock, compositionPerformBlock)')
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
  if (/#modeHelp\s*\{[^}]*display:\s*none;/s.test(html)) {
    noteFailure('Application help opens to an empty disclosure on mobile.');
  }
  if (!/id="btnHeaderUndo"[^>]*\sdisabled/.test(html)
    || !/id="btnHeaderRedo"[^>]*\sdisabled/.test(html)
    || !/id="btnMobileUndo"[^>]*\sdisabled/.test(html)
    || !/id="btnMobileRedo"[^>]*\sdisabled/.test(html)
    || !html.includes('function syncHistoryControls()')
    || !html.includes("'|U=' + uiSnapshot")
    || !html.includes('function recordHistorySnapshot(s)')
    || !html.includes('function initControlHistoryTracking()')) {
    noteFailure('Undo/Redo availability or full parameter-history tracking is incomplete.');
  }
  if (!html.includes('aria-keyshortcuts="Control+Z Meta+Z"')
    || !html.includes('aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z"')
    || !html.includes('function keepsNativeHistoryTarget(target)')
    || !html.includes("shortcutKey === 'y' || e.shiftKey")) {
    noteFailure('Undo/Redo keyboard shortcuts are incomplete or incorrectly delegated to non-text controls.');
  }
  if (!html.includes("var waitsForChange = type === 'checkbox' || type === 'radio' || control.tagName === 'SELECT'")
    || !html.includes("event.type === 'input' && waitsForChange")
    || !html.includes('pendingControlHistory = { control: control, snapshot: snapState() }')
    || !html.includes("baseline === current && event.type === 'input' && waitsForChange")
    || !/if \(baseline !== current\) \{\s*markAutosaveDirty\(\);\s*recordHistorySnapshot\(baseline\);/s.test(html)) {
    noteFailure('Checkbox, radio, or select changes can bypass Undo/Redo and autosave history.');
  }
  if (!html.includes('var controlName = parameterLabel(input)')
    || !html.includes("minus.setAttribute('aria-controls', input.id)")
    || !html.includes("plus.setAttribute('aria-controls', input.id)")
    || !html.includes('function syncMobileStepperStates()')
    || !html.includes('syncMobileStepperPair(pair)')) {
    noteFailure('Mobile range steppers lack readable names, endpoint state, or control relationships.');
  }
  if (!html.includes("var resetName = rowLabels.length ? rowLabels.join(' and ') : 'parameter group'")
    || !html.includes("parameterRow.resetButton.setAttribute('aria-label', 'Reset ' + resetName)")) {
    noteFailure('Parameter-row reset actions no longer expose distinct readable names.');
  }
  if (!/populatePresets\(\);\s*syncCompositionUI\(\);[\s\S]*?initParameterNavigator\(\);\s*syncLookMemoryUI\(\);/s.test(html)
    || /initProgressiveUI\(\);\s*initParameterNavigator\(\);/.test(html)
    || !html.includes('select[id^="p"]:not(#pOperator):not(#pCompositionEngine)')) {
    noteFailure('Parameter RESET baselines can be captured before canonical Compose defaults or include the engine picker.');
  }
  for (const id of ['pPreset', 'btnApplyPreset', 'pPresetName', 'btnSavePreset', 'btnDelPreset', 'presetCount', 'presetStatus']) {
    if (!ids.has(id)) noteFailure(`Inline Preset management is missing ${id}.`);
  }
  const presetManagerStart = html.indexOf("var PRESET_KEY = 'typeDeformer.presets.v1';");
  const presetManagerEnd = html.indexOf('/* ---------------- share via URL ---------------- */', presetManagerStart);
  const presetManagerBody = presetManagerStart >= 0 && presetManagerEnd > presetManagerStart
    ? html.slice(presetManagerStart, presetManagerEnd)
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
    || !html.includes('pPreset: true')
    || /\b(?:alert|confirm|prompt)\s*\(/.test(presetManagerBody)) {
    noteFailure('Preset save, apply, update, and selected-delete must remain non-blocking, focusable, undoable, and visible inside the Effect panel.');
  }
  if (!html.includes("var firstAction = projectMenu.querySelector('[data-project-proxy]')")
    || !html.includes("document.addEventListener('pointerdown', function (event)")
    || !html.includes('closeProjectMenu(true)')
    || !html.includes("if (projectMenu && projectMenu.open)")) {
    noteFailure('The Project popover does not fully manage focus, outside dismissal, and Escape dismissal.');
  }
  if (!html.includes("var btnShareProxies = document.querySelectorAll('[data-project-proxy=\"btnShare\"]')")
    || !html.includes('function setShareButtonLabel(label)')
    || !html.includes("button.dataset.projectProxy !== 'btnShare'")) {
    noteFailure('Project Share feedback can disappear with the popover before copying finishes.');
  }
  for (const id of ['projectActionStatus', 'projectMenuActionStatus']) {
    if (!ids.has(id)) noteFailure(`Project action feedback is missing ${id}.`);
  }
  if (!html.includes('var projectActionStatuses = [')
    || !html.includes('function setProjectActionStatus(message, state, timeoutMs)')
    || !html.includes("setProjectActionStatus('Project JSON · '")
    || !html.includes('Math.max(1, Math.round(blob.size / 1024))')
    || !html.includes("button.dataset.projectProxy !== 'btnShare'")
    || !html.includes("button.dataset.projectProxy !== 'btnSaveProj'")
    || !html.includes("button.dataset.projectProxy !== 'btnLoadProj'")
    || !html.includes("setProjectActionStatus(ok ? 'Share URL copied to clipboard' : 'Share URL copy failed'")
    || !html.includes("setProjectActionStatus('Share URL ready · manual copy opened', 'error', 0)")) {
    noteFailure('Project Save, Load, or Share no longer keeps the visible menu open with mirrored completion feedback.');
  }
  const newProjectFlowStart = html.indexOf("var NEW_PROJECT_NOTICE_KEY = 'typeDeformer.projectNotice.v1';");
  const newProjectFlowEnd = html.indexOf('/* ---------------- parameter presets ---------------- */', newProjectFlowStart);
  const newProjectFlowBody = newProjectFlowStart >= 0 && newProjectFlowEnd > newProjectFlowStart
    ? html.slice(newProjectFlowStart, newProjectFlowEnd)
    : '';
  if (!newProjectFlowBody
    || !html.includes('aria-describedby="projectMenuActionStatus"')
    || !html.includes('aria-describedby="projectActionStatus"')
    || !html.includes('.project-action-status[data-state="warning"]')
    || !html.includes('.project-menu-body .project-danger[data-confirming="true"]')
    || !html.includes("button.dataset.projectProxy !== 'btnNew'")
    || !html.includes('if (wasOpen) cancelNewProjectConfirmation(false);')
    || !newProjectFlowBody.includes('var newProjectConfirmArmed = false;')
    || !newProjectFlowBody.includes('function cancelNewProjectConfirmation(announce)')
    || !newProjectFlowBody.includes("'Confirm new / 初期化確認'")
    || !newProjectFlowBody.includes("setProjectActionStatus('This clears the current work and both autosaves · press Confirm new within 8 seconds', 'warning', 0)")
    || !newProjectFlowBody.includes('}, 8000);')
    || !newProjectFlowBody.includes('autosaveSuspended = true;')
    || !newProjectFlowBody.includes("sessionStorage.setItem(NEW_PROJECT_NOTICE_KEY, 'ready')")
    || !newProjectFlowBody.includes('localStorage.removeItem(AUTOSAVE_KEY)')
    || !newProjectFlowBody.includes('localStorage.removeItem(AUTOSAVE_BACKUP_KEY)')
    || !newProjectFlowBody.includes("location.replace(location.href.split('#')[0])")
    || !newProjectFlowBody.includes('function consumeNewProjectNotice()')
    || !newProjectFlowBody.includes('sessionStorage.removeItem(NEW_PROJECT_NOTICE_KEY)')
    || !newProjectFlowBody.includes("setProjectActionStatus('New project ready · autosave cleared', 'done', 8000)")
    || !newProjectFlowBody.includes("projectMenu.querySelector('[data-project-proxy=\"btnNew\"]')")
    || /\b(?:alert|confirm|prompt)\s*\(/.test(newProjectFlowBody)) {
    noteFailure('New project must remain a non-blocking, two-step, focus-preserving reset with visible timeout and reload completion feedback.');
  }
  const projectFileLoadStart = html.indexOf("var projFile = document.getElementById('projFile');");
  const projectFileLoadEnd = html.indexOf('/* ---------------- autosave ---------------- */', projectFileLoadStart);
  const projectFileLoadBody = projectFileLoadStart >= 0 && projectFileLoadEnd > projectFileLoadStart
    ? html.slice(projectFileLoadStart, projectFileLoadEnd)
    : '';
  if (!html.includes('function projectLoadError(data)')
    || !html.includes("typeof data.params === 'object' && !Array.isArray(data.params)")
    || !html.includes('var validationError = projectLoadError(data);')
    || !projectFileLoadBody.includes("setProjectActionStatus('Project JSONを選択…', 'working')")
    || !projectFileLoadBody.includes("projFile.addEventListener('cancel'")
    || !projectFileLoadBody.includes("setProjectActionStatus('Loading ' + file.name + '…', 'working')")
    || !projectFileLoadBody.includes("loadProject(data, true)")
    || !projectFileLoadBody.includes("setProjectActionStatus('Project loaded · ' + file.name + ' · ' + fileSizeLabel, 'done')")
    || !projectFileLoadBody.includes("setProjectActionStatus('Projectを読み込めません · JSON形式を確認', 'error')")
    || projectFileLoadBody.includes('alert(')
    || !html.includes('.project-action-status { overflow-wrap: anywhere; }')) {
    noteFailure('Project Load no longer provides a non-blocking choose, loading, success, cancel, and error flow inside the visible popover.');
  }
  if (!/else if \(wasCancelled\) \{\s*setVideoProgress\(0\);\s*setVideoStatus\('Recording cancelled\.'/s.test(html)) {
    noteFailure('Cancelling a motion export can leave a stale partial-progress bar.');
  }
  if (!html.includes('id="previewOverlay" hidden role="dialog" aria-modal="true" aria-labelledby="previewCaption"')
    || !ids.has('btnPreviewClose')
    || !html.includes('function showPreviewOverlay()')
    || !html.includes('function closePreview()')
    || !html.includes("document.getElementById('btnPreviewClose').focus({ preventScroll: true })")) {
    noteFailure('Preview dialog semantics, explicit dismissal, or focus restoration is incomplete.');
  }
  for (const id of ['copyTextStatus', 'manualCopyOverlay', 'manualCopyTitle', 'manualCopyLabel',
    'manualCopyValue', 'manualCopyStatus', 'btnManualCopyClose', 'btnManualCopyRetry', 'btnManualCopySelect']) {
    if (!ids.has(id)) noteFailure(`Non-blocking copy recovery is missing ${id}.`);
  }
  if (!html.includes('id="manualCopyOverlay" hidden role="dialog" aria-modal="true"')
    || !html.includes('function openManualCopy(value, label, returnFocus, resultHandler)')
    || !html.includes('function closeManualCopy()')
    || !html.includes('function retryManualCopy()')
    || !html.includes("if (event.key === 'Escape')")
    || !html.includes("returnFocus.focus({ preventScroll: true })")
    || !html.includes("if (manualCopyOverlay && !manualCopyOverlay.hidden && manualCopyOverlay.contains(event.target)) return;")
    || !/if \(manualCopyOverlay\.hidden\) return;[\s\S]*?event\.stopImmediatePropagation\(\);[\s\S]*?\}, true\);/.test(html)
    || !/\.manual-copy-value\s*\{[\s\S]*?font-size:\s*16px;/.test(html)
    || !/\.manual-copy-actions button\s*\{[^}]*min-height:\s*44px;/.test(html)
    || !html.includes("openManualCopy(url, 'Share URL', shareOrigin")
    || !html.includes("copyPlainTextValue(textInput.value, btnCopySourceText, 'Source text / 原文')")) {
    noteFailure('Clipboard failure no longer opens a focus-preserving manual-copy dialog for source text and Share URL.');
  }
  for (const nextStage of ['effect', 'apply', 'compose', 'export']) {
    if (!html.includes(`data-next-stage="${nextStage}"`)) noteFailure(`Workflow is missing the transition to ${nextStage}.`);
  }
  const resetAllEffectsStart = html.indexOf('function resetAllEffects()');
  const resetAllEffectsEnd = html.indexOf('/* ---------------- batch toggle', resetAllEffectsStart);
  const resetAllEffectsBody = resetAllEffectsStart >= 0 && resetAllEffectsEnd > resetAllEffectsStart
    ? html.slice(resetAllEffectsStart, resetAllEffectsEnd)
    : '';
  if (!resetAllEffectsBody || resetAllEffectsBody.includes('compositionState = cloneCompositionDefaults()')) {
    noteFailure('Reset all effects must not remove the separately controlled Composition state.');
  }
  if ((html.match(/version:\s*19/g) || []).length < 2 || !html.includes('data.version > 19') || !html.includes("a: 'td', v: 19")) {
    noteFailure('Project/SVG/share schema version 19 or its forward-version guard is incomplete.');
  }
  for (const id of ['lookMemoryBlock', 'lookMemoryCount', 'lookMemoryGrid', 'lookMemoryStatus',
    'btnLookCompare', 'btnLookReturn', 'lookCompareOverlay', 'lookCompareFrame',
    'lookCompareImageA', 'lookCompareImageB', 'lookCompareRange', 'btnLookCompareClose']) {
    if (!ids.has(id)) noteFailure(`Look Memory is missing ${id}.`);
  }
  for (const fn of ['normalizeLookMemory', 'currentLookState', 'captureLookSlot', 'recallLookSlot',
    'clearLookSlot', 'syncLookMemoryUI', 'setLookMemoryStatus', 'armLookMemoryConfirmation',
    'cancelLookMemoryConfirmation', 'focusLookMemoryAction', 'openLookCompare', 'setLookCompareWipe']) {
    if (!html.includes(`function ${fn}(`)) noteFailure(`Look Memory is missing ${fn}().`);
  }
  const lookMemoryUiStart = html.indexOf("var lookMemoryGrid = document.getElementById('lookMemoryGrid');");
  const lookMemoryUiEnd = html.indexOf("var lookCompareOverlay = document.getElementById('lookCompareOverlay');", lookMemoryUiStart);
  const lookMemoryUiBody = lookMemoryUiStart >= 0 && lookMemoryUiEnd > lookMemoryUiStart
    ? html.slice(lookMemoryUiStart, lookMemoryUiEnd)
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
  if (!html.includes('lookMemory: cloneLookMemory()') || !html.includes('M: cloneLookMemory()')
    || !html.includes('lookMemory: d.M')) {
    noteFailure('Look Memory is not preserved by Project and Share serialization.');
  }
  for (const id of ['proofSheetPanel', 'pProofCount', 'pProofColumns', 'pProofMutation', 'pProofVariant',
    'pProofScale', 'pProofLabels', 'btnProofPreview', 'btnProofPng', 'btnProofAdopt', 'proofStatus']) {
    if (!ids.has(id)) noteFailure(`Design Space Sheet is missing ${id}.`);
  }
  for (const fn of ['proofVariantSettings', 'renderProofSheet', 'previewProofSheet', 'exportProofSheet', 'adoptProofVariant']) {
    if (!html.includes(`function ${fn}(`)) noteFailure(`Design Space Sheet is missing ${fn}().`);
  }
  if (!ids.has('stageWorld') || !html.includes('stageWorld.appendChild(frag)')
    || !html.includes('stageWorld.style.transform =')) {
    noteFailure('The unbounded stage world or its independent camera transform is incomplete.');
  }
  const canvasCameraBlock = html.match(/\/\* ---------------- canvas view camera ----------------[\s\S]*?window\.addEventListener\('type-deformer-frame-resize', applyCanvasView\);\s*\n\s*applyCanvasView\(\);/)?.[0] || '';
  if (!canvasCameraBlock) {
    noteFailure('The canvas camera implementation block could not be isolated for mutation checks.');
  } else {
    const outsideCameraBlock = html.replace(canvasCameraBlock, '');
    if (/\bcanvasView\.(?:scale|x|y)\s*=/.test(outsideCameraBlock)) {
      noteFailure('Effect, layout, persistence, or export code mutates the canvas camera outside its dedicated controls.');
    }
  }
  if (html.includes('function clampCanvasView(') || html.includes('oldScrollLeft + delta')
    || html.includes('oldScrollTop + delta')) {
    noteFailure('A finite camera clamp or effect-driven viewport shift remains in the preview path.');
  }
  if (!html.includes('var CANVAS_VIEW_MIN = 0.05;') || !html.includes('var CANVAS_VIEW_MAX = 32;')
    || !html.includes('function canvasCameraLayout(')) {
    noteFailure('The wide-range unbounded canvas camera contract is incomplete.');
  }
  if (!html.includes('compositionPreviewLayout = canvasCameraLayout(width, height)')
    || !html.includes('renderSurfaceFxLayer(surfaceFxCtx, glyphs, dpr, canvasCameraLayout(width, height)')
    || !html.includes('var screenshotLayout = canvasCameraLayout(cssWidth, cssHeight)')) {
    noteFailure('DOM text, procedural effects, Compose, or View shot no longer share one explicit camera.');
  }
  if (ids.has('canvasSizeBadge') || ids.has('canvasSizeText') || ids.has('btnCanvasReset')) {
    noteFailure('Legacy finite/resizable canvas-frame UI is still present.');
  }
  if (!ids.has('btnViewMode') || /#btnViewMode\s*\{[^}]*display\s*:\s*none/i.test(html)) {
    noteFailure('Canvas View mode is missing or hidden on a responsive breakpoint.');
  }
  if (!html.includes("localStorage.removeItem('typeDeformer.frameSize.v1')")
    || !html.includes("stage.style.removeProperty('--visual-overscan')")) {
    noteFailure('Legacy finite-frame persistence or dynamic preview overscan is not retired.');
  }
  const visualOverscanBody = html.match(/function updateVisualOverscan\(\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  if (!visualOverscanBody || /(?:width|height|inset|padding|margin|transform)\s*=|setProperty\(/.test(visualOverscanBody)) {
    noteFailure('Visual overscan may resize, shift, or transform the preview instead of remaining camera-neutral.');
  }
  if (!html.includes('var mobileLayoutWasMobile = mobileLayoutQuery.matches;')
    || !html.includes('openDesktopSection(mobileActiveSection);')) {
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
