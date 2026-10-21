(function(root){
  'use strict';
  // Pure compatibility preparation. No live editor state, DOM, cache, or storage
  // is read or written. The caller applies a completed result only after success.
  function clone(value){if(Array.isArray(value))return value.map(clone);if(value&&typeof value==='object'){var out={};Object.keys(value).forEach(function(key){if(key!=='__proto__'&&key!=='constructor'&&key!=='prototype')out[key]=clone(value[key]);});return out;}return value;}
  function context(input,options){
    options=options||{};
    var params=clone(input),PARAM_DEFAULTS=options.defaults||{},parameterModel=options.parameters||null;
    var BATCH_PROFILE_KEYS=options.batchProfileKeys||[],BATCH_TARGETS=options.batchTargets||{byKey:{}},BATCH_PARAM_KEYS=options.batchParamKeys||[];
    var BATCH_PARAM_OPTIONS=options.batchOptions||{},BATCH_PARAM_LIMITS=options.batchLimits||{};
    var registry=options.registry||{specs:[],surfaceIds:[],renderOrder:[],tables:{}};
    var SURFACE_OPERATOR_IDS=registry.surfaceIds,SURFACE_RENDER_ORDER_DEFAULT=registry.renderOrder;
    var SURFACE_OPACITY_KEYS=registry.tables.SURFACE_OPACITY_KEYS||{},SURFACE_SOURCE_OPACITY_KEYS=registry.tables.SURFACE_SOURCE_OPACITY_KEYS||{};
    var SURFACE_BLEND_KEYS=registry.tables.SURFACE_BLEND_KEYS||{},SURFACE_SOURCE_MODE_KEYS=registry.tables.SURFACE_SOURCE_MODE_KEYS||{};
    var SURFACE_BLEND_MODES=options.blendModes||['source-over','multiply','screen','overlay','difference','lighter'];
    var OPERATOR_IDS=registry.specs.map(function(spec){return spec.id;});
    var TypeDeformerWassersteinLetters={validText:options.validPartner||function(){return false;}},toGraphemes=options.graphemes||Array.from;
      function clampParam(key, min, max, integer) {
        var value = Number(params[key]);
        if (!isFinite(value)) value = PARAM_DEFAULTS[key];
        params[key] = typeof parameterModel!=='undefined' && parameterModel ? parameterModel.normalize(key,value,PARAM_DEFAULTS[key],min,max,integer) : Math.max(min,Math.min(max,integer?Math.round(value):value));
      }

      function chooseParam(key, values) {
        if (values.indexOf(params[key]) === -1) params[key] = PARAM_DEFAULTS[key];
      }

      function normalizeParams() {
        ['counterX','counterY','counterWidth','counterHeight','counterChannel','counterDensity','concordanceResponse','concordanceAxis','concordanceSpacing','concordanceEmphasis'].forEach(function(key){ clampParam(key,BATCH_PARAM_LIMITS[key][0],BATCH_PARAM_LIMITS[key][1],false); });
        chooseParam('counterShape', BATCH_PARAM_OPTIONS.counterShape); chooseParam('concordanceDirection', BATCH_PARAM_OPTIONS.concordanceDirection);
        params.textObjects = typeof params.textObjects === 'string' && params.textObjects.length < 20000 ? params.textObjects : '';
        params.concordanceTerms = typeof params.concordanceTerms === 'string' ? params.concordanceTerms.slice(0,4096) : '';
        try { var spaces = JSON.parse(params.counterSpaces); params.counterSpaces = JSON.stringify(Array.isArray(spaces) ? spaces.slice(0,7).filter(function(s){return s && ['ellipse','rect','river'].indexOf(s.kind)>=0 && [s.x,s.y,s.w,s.h].every(Number.isFinite);}).map(function(s){return {kind:s.kind,x:Math.max(-.5,Math.min(1.5,s.x)),y:Math.max(-20,Math.min(80,s.y)),w:Math.max(0,Math.min(80,s.w)),h:Math.max(0,Math.min(100,s.h))};}) : []); } catch(e) { params.counterSpaces = '[]'; }
        clampParam('stretchX', -2, 8, false);
        clampParam('stretchY', -2, 8, false);
        clampParam('radius', 15, 180, false);
        clampParam('ease', 0.02, 0.3, false);
        clampParam('geoRatio', 0, 1, false);
        clampParam('randomness', 0, 2, false);
        clampParam('rotation', 0, 45, false);
        clampParam('rotateAngle', -720, 720, false);
        chooseParam('rotatePattern', BATCH_PARAM_OPTIONS.rotatePattern);
        clampParam('rotateCycles', 0.25, 16, false);
        clampParam('rotatePhase', -1, 1, false);
        clampParam('skewX', -85, 85, false);
        clampParam('skewY', -85, 85, false);
        chooseParam('skewPattern', BATCH_PARAM_OPTIONS.skewPattern);
        clampParam('skewCycles', 0.25, 16, false);
        clampParam('skewPhase', -1, 1, false);
        clampParam('baselineShift', -12, 12, false);
        chooseParam('baselinePattern', BATCH_PARAM_OPTIONS.baselinePattern);
        clampParam('baselineCycles', 0.25, 16, false);
        clampParam('baselinePhase', -1, 1, false);
        chooseParam('currentFlow', BATCH_PARAM_OPTIONS.currentFlow);
        chooseParam('readingScope', BATCH_PARAM_OPTIONS.readingScope);
        clampParam('readingPressure', -3, 6, false);
        clampParam('readingWidth', 0, 1, false);
        clampParam('readingHeight', 0, 1, false);
        clampParam('readingFocusU', -0.25, 1.25, false);
        clampParam('readingFocusV', -0.25, 1.25, false);
        clampParam('readingFeather', 0.01, 1, false);
        clampParam('readingBody', 0, 1, false);
        clampParam('gutterTension', 0, 4, false);
        clampParam('gutterResponse', 0, 1, false);
        clampParam('gutterClearance', 0, 12, false);
        clampParam('gutterRhythm', 2, 12, true);
        clampParam('gutterOffset', 0, 11, true);
        clampParam('gutterHierarchy', 0, 3, false);
        chooseParam('caesuraGrammar', BATCH_PARAM_OPTIONS.caesuraGrammar);
        clampParam('caesuraBreath', 0, 12, false);
        clampParam('caesuraLift', -12, 12, false);
        clampParam('caesuraHierarchy', 0, 4, false);
        clampParam('caesuraAngle', -120, 120, false);
        clampParam('caesuraSpan', 0.1, 3, false);
        clampParam('currentBend', -24, 24, false);
        clampParam('currentSpread', -2, 2.5, false);
        clampParam('currentFocus', -0.5, 1.5, false);
        clampParam('currentReach', 0.08, 2, false);
        clampParam('currentFollow', 0, 1, false);
        clampParam('mirrorX', 0, 1, true);
        clampParam('mirrorY', 0, 1, true);
        chooseParam('mirrorPattern', BATCH_PARAM_OPTIONS.mirrorPattern);
        clampParam('mirrorSpan', 1, 16, true);
        clampParam('mirrorPhase', 0, 15, true);
        chooseParam('misregSystem', BATCH_PARAM_OPTIONS.misregSystem);
        clampParam('misregX', -240, 240, false);
        clampParam('misregY', -240, 240, false);
        clampParam('misregWarp', 0, 4, false);
        clampParam('misregZones', 1, 24, true);
        clampParam('misregSlur', 0, 4, false);
        clampParam('misregTrap', 0, 48, false);
        chooseParam('moshGrammar', BATCH_PARAM_OPTIONS.moshGrammar);
        clampParam('moshShift', 0, 960, false);
        clampParam('moshBlock', 4, 128, true);
        clampParam('moshMemory', 1, 32, true);
        clampParam('moshCoherence', 0, 1, false);
        clampParam('moshChroma', 0, 320, false);
        clampParam('moshCrush', 0, 1, false);
        clampParam('moshSmear', 0, 12, false);
        clampParam('moshTear', 0, 1, false);
        clampParam('moshHold', 1, 24, true);
        chooseParam('blobVisual', BATCH_PARAM_OPTIONS.blobVisual);
        clampParam('blobPull', 0, 1, false);
        clampParam('blobSwirl', -1, 1, false);
        clampParam('blobScale', 0, 2, false);
        clampParam('blobInfluence', 24, 1600, false);
        clampParam('blobDensity', 0.1, 4, false);
        clampParam('blobVector', 0, 8, false);
        clampParam('blobTrails', 0, 48, true);
        clampParam('blobStroke', 0.2, 16, false);
        clampParam('blobThreshold', 0.02, 0.8, false);
        clampParam('blobMinArea', 0.001, 0.2, false);
        clampParam('blobMaxArea', 0.05, 1, false);
        clampParam('blobMaxBlobs', 1, 12, true);
        clampParam('blobSmoothing', 0, 0.95, false);
        clampParam('blobMaxMove', 0.02, 0.6, false);
        clampParam('blobRevive', 0, 30, true);
        clampParam('blobAnchorX', 0, 1, false);
        clampParam('blobAnchorY', 0, 1, false);
        chooseParam('traceGrammar', BATCH_PARAM_OPTIONS.traceGrammar);
        clampParam('traceDensity', 0.02, 4, false);
        clampParam('traceDefinition', 1, 256, true);
        clampParam('traceStroke', 0.1, 40, false);
        clampParam('traceJitter', 0, 500, false);
        clampParam('traceLift', 0, 1, false);
        chooseParam('webTopology', BATCH_PARAM_OPTIONS.webTopology);
        clampParam('webDensity', 0, 6, false);
        clampParam('webReach', 4, 1800, false);
        clampParam('webChaos', 0, 8, false);
        clampParam('webSag', -6, 6, false);
        clampParam('webStroke', 0.1, 48, false);
        clampParam('softBlobInflation', 0, 6, false);
        clampParam('softBlobStiffness', 0, 5, false);
        clampParam('softBlobChaos', 0, 8, false);
        clampParam('softBlobMembrane', 0, 4, false);
        clampParam('softBlobSporeReach', 0, 2400, false);
        clampParam('softBlobSporeDensity', 0, 4, false);
        clampParam('softBlobSpeed', 0, 8, false);
        chooseParam('etchantRegime', BATCH_PARAM_OPTIONS.etchantRegime);
        clampParam('etchantPattern', 0, 1, false);
        clampParam('etchantCell', 2, 72, false);
        clampParam('etchantGrowth', 8, 192, true);
        clampParam('etchantPolarity', -1, 1, false);
        clampParam('etchantSpill', 0, 640, false);
        chooseParam('calligraphyTool', BATCH_PARAM_OPTIONS.calligraphyTool);
        chooseParam('calligraphyLegacyTool', BATCH_PARAM_OPTIONS.calligraphyLegacyTool);
        clampParam('calligraphyExpansion', -120, 260, false);
        clampParam('calligraphyContrast', 0, 4, false);
        clampParam('calligraphyAngle', -180, 180, false);
        clampParam('calligraphyPulse', 0, 4, false);
        clampParam('calligraphyWetness', 0, 1, false);
        chooseParam('asemicGrammar', BATCH_PARAM_OPTIONS.asemicGrammar);
        clampParam('asemicMemory', 0, 1, false);
        clampParam('asemicGestures', 2, 16, true);
        clampParam('asemicWeight', 0.4, 64, false);
        clampParam('asemicFlow', -4, 4, false);
        clampParam('asemicContrast', 0, 6, false);
        clampParam('asemicFlourish', 0, 480, false);
        clampParam('asemicCounter', 0, 1.5, false);
        chooseParam('spectralMode', BATCH_PARAM_OPTIONS.spectralMode);
        clampParam('spectralAmount', 0, 4, false);
        clampParam('spectralDetail', 2, 48, true);
        clampParam('spectralFrequency', 2, 24, true);
        clampParam('spectralPhase', -180, 180, false);
        clampParam('spectralCounter', 0, 1, false);
        clampParam('spectralMotion', 0, 2, false);
        clampParam('differentialAge', 0, 5, false);
        clampParam('differentialGrain', 2.5, 12, false);
        clampParam('differentialMemory', 0, 0.05, false);
        clampParam('differentialTension', 0.18, 1.2, false);
        clampParam('differentialPatch', 0, 1, false);
        clampParam('differentialArea', 0.5, 2, false);
        clampParam('differentialMotion', 0, 1, false);
        clampParam('conformalAmount', 0, 0.94, false);
        clampParam('conformalPower', -3, 4, false);
        clampParam('conformalSpiral', -4, 4, false);
        clampParam('conformalAngle', -180, 180, false);
        clampParam('conformalMotion', 0, 1, false);
        clampParam('auxeticOpening', 0, 90, false);
        clampParam('contextualPressure', 0, 3, false);
        ['scrollCurl', 'scrollAxis', 'scrollThickness', 'scrollTaper', 'scrollYaw', 'scrollTilt', 'scrollMotion', 'scrollMetal', 'scrollRoughness'].forEach(function (key) { clampParam(key, BATCH_PARAM_LIMITS[key][0], BATCH_PARAM_LIMITS[key][1], false); });
        chooseParam('scrollMode', BATCH_PARAM_OPTIONS.scrollMode);
        ['anamorphicYaw', 'anamorphicDepth', 'anamorphicTilt', 'anamorphicMotion', 'anamorphicMetal', 'anamorphicRoughness'].forEach(function (key) { clampParam(key, BATCH_PARAM_LIMITS[key][0], BATCH_PARAM_LIMITS[key][1], false); });
        chooseParam('anamorphicFinish', BATCH_PARAM_OPTIONS.anamorphicFinish);
        if (!TypeDeformerWassersteinLetters.validText(params.wassersteinPartner)) params.wassersteinPartner = PARAM_DEFAULTS.wassersteinPartner;
        if (params.wassersteinScope !== 'text') params.wassersteinScope = 'glyph';
        if (typeof params.anamorphicPartner !== 'string' || !params.anamorphicPartner.trim() || params.anamorphicPartner.length > 32 || toGraphemes(params.anamorphicPartner).length !== 1) params.anamorphicPartner = PARAM_DEFAULTS.anamorphicPartner;
        chooseParam('scrollFinish', BATCH_PARAM_OPTIONS.scrollFinish);
        clampParam('contextualChannel', 0, 0.5, false);
        clampParam('contextualFollow', 0, 2, false);
        clampParam('contextualCounter', 0, 1, false);
        chooseParam('contextualAxis', BATCH_PARAM_OPTIONS.contextualAxis);
        chooseParam('contextualSide', BATCH_PARAM_OPTIONS.contextualSide);
        chooseParam('contextualBaseline', BATCH_PARAM_OPTIONS.contextualBaseline);
        clampParam('auxeticModule', 6, 96, false);
        clampParam('auxeticAspect', 0.25, 4, false);
        clampParam('auxeticAxis', -180, 180, false);
        clampParam('auxeticLigament', 0, 1, false);
        clampParam('auxeticMotion', 0, 1, false);
        chooseParam('marblingMode', BATCH_PARAM_OPTIONS.marblingMode);
        clampParam('marblingAmount', 0, 4, false);
        clampParam('marblingPitch', 12, 180, false);
        clampParam('marblingFocus', 0, 1, false);
        clampParam('marblingCirculation', -4, 4, false);
        clampParam('marblingAngle', -180, 180, false);
        clampParam('marblingMotion', 0, 1, false);
        chooseParam('counterformGrammar', BATCH_PARAM_OPTIONS.counterformGrammar);
        chooseParam('counterformLegacyGrammar', BATCH_PARAM_OPTIONS.counterformLegacyGrammar);
        clampParam('counterformPressure', -120, 160, false);
        clampParam('counterformBridge', 0, 180, false);
        clampParam('counterformAperture', 0, 1, false);
        clampParam('counterformAngle', -180, 180, false);
        clampParam('counterformTrap', 0, 160, false);
        chooseParam('terminalStyle', BATCH_PARAM_OPTIONS.terminalStyle);
        chooseParam('terminalLegacyStyle', BATCH_PARAM_OPTIONS.terminalLegacyStyle);
        clampParam('terminalReach', 0, 360, false);
        clampParam('terminalMass', 0.1, 4, false);
        clampParam('terminalSelection', 0.05, 1, false);
        clampParam('terminalBias', -1, 1, false);
        clampParam('terminalTrap', 0, 160, false);
        chooseParam('ligatureBodyGrammar', BATCH_PARAM_OPTIONS.ligatureBodyGrammar);
        chooseParam('ligatureBodyLegacyGrammar', BATCH_PARAM_OPTIONS.ligatureBodyLegacyGrammar);
        clampParam('ligatureBodyFusion', 0, 4, false);
        clampParam('ligatureBodyReach', 0, 1800, false);
        clampParam('ligatureBodyBand', 1, 240, false);
        clampParam('ligatureBodyCounter', 0, 1.5, false);
        clampParam('ligatureBodyTension', -4, 4, false);
        chooseParam('sigilTopology', BATCH_PARAM_OPTIONS.sigilTopology);
        clampParam('sigilBinding', 0, 4, false);
        clampParam('sigilComplexity', 1, 24, true);
        clampParam('sigilReach', 0, 640, false);
        clampParam('sigilSymmetry', 0, 4, false);
        clampParam('sigilStroke', 0.2, 20, false);
        clampParam('sigilBarbs', 0, 6, false);
        chooseParam('thornGrammar', BATCH_PARAM_OPTIONS.thornGrammar);
        chooseParam('thornConstruction', BATCH_PARAM_OPTIONS.thornConstruction);
        clampParam('thornClearance', 0, 1, false);
        clampParam('thornArmor', 0, 4, false);
        clampParam('thornLength', 0, 360, false);
        clampParam('thornDensity', 0.05, 6, false);
        clampParam('thornCurl', -3, 3, false);
        clampParam('thornStroke', 0.2, 16, false);
        clampParam('thornBranches', 0, 4, false);
        chooseParam('cipherDialect', BATCH_PARAM_OPTIONS.cipherDialect);
        clampParam('cipherRegisters', 0, 4, false);
        clampParam('cipherScale', 3, 36, false);
        clampParam('cipherDensity', 0.1, 4, false);
        clampParam('cipherOrbit', 0, 360, false);
        clampParam('cipherDrift', 0, 160, false);
        clampParam('cipherCallouts', 0, 4, false);
        chooseParam('boneArchitecture', BATCH_PARAM_OPTIONS.boneArchitecture);
        clampParam('boneMarrow', 0, 6, false);
        clampParam('boneCell', 2, 96, false);
        clampParam('boneBranching', 0, 8, false);
        clampParam('boneWeight', 0.2, 32, false);
        clampParam('boneJoint', 0, 64, false);
        clampParam('boneWarp', 0, 8, false);
        chooseParam('roseCore', BATCH_PARAM_OPTIONS.roseCore);
        clampParam('roseInterlace', 0, 4, false);
        clampParam('rosePetals', 3, 32, true);
        clampParam('roseRings', 1, 8, true);
        clampParam('roseRadius', 8, 560, false);
        clampParam('roseWarp', -2, 2, false);
        clampParam('roseStroke', 0.2, 18, false);
        clampParam('chromeVoltage', 0, 6, false);
        chooseParam('chromeModel', BATCH_PARAM_OPTIONS.chromeModel);
        clampParam('chromeRoughness', 0, 1, false);
        clampParam('chromeBevel', 1, 96, false);
        clampParam('chromeAngle', -180, 180, false);
        clampParam('chromeBands', 2, 24, true);
        clampParam('chromeContrast', 0, 4, false);
        clampParam('chromeWarp', 0, 4, false);
        chooseParam('ligatureGrammar', BATCH_PARAM_OPTIONS.ligatureGrammar);
        clampParam('ligatureWeave', 0, 4, false);
        clampParam('ligatureReach', 0, 1800, false);
        clampParam('ligatureBand', 1, 180, false);
        clampParam('ligatureRise', -4, 4, false);
        clampParam('ligatureCounter', 0, 1.5, false);
        clampParam('ligatureKnot', 0, 64, false);
        chooseParam('moireLattice', BATCH_PARAM_OPTIONS.moireLattice);
        clampParam('moireResonance', 0, 8, false);
        clampParam('moirePitch', 2, 240, false);
        clampParam('moireDetune', -1.5, 1.5, false);
        clampParam('moireAngle', -180, 180, false);
        clampParam('moireDepth', 0, 16, false);
        clampParam('moireReach', 0, 1800, false);
        chooseParam('navePlan', BATCH_PARAM_OPTIONS.navePlan);
        clampParam('naveRibwork', 0, 4, false);
        clampParam('naveColumns', 1, 24, true);
        clampParam('naveRise', 0.25, 4, false);
        clampParam('naveVoid', 0, 1, false);
        clampParam('naveButtress', 0, 80, false);
        clampParam('naveWarp', -2, 2, false);
        chooseParam('cloisterTessellation', BATCH_PARAM_OPTIONS.cloisterTessellation);
        clampParam('cloisterRelief', 0, 4, false);
        clampParam('cloisterPlanes', 1, 32, true);
        clampParam('cloisterFold', -2, 2, false);
        clampParam('cloisterAxis', -180, 180, false);
        clampParam('cloisterPerspective', 0, 4, false);
        clampParam('cloisterCrease', 0, 64, false);
        chooseParam('prismOptics', BATCH_PARAM_OPTIONS.prismOptics);
        clampParam('prismIridescence', 0, 4, false);
        clampParam('prismRefraction', -4, 4, false);
        clampParam('prismDispersion', 0, 320, false);
        clampParam('prismFacets', 1, 32, true);
        clampParam('prismCaustic', 0, 6, false);
        clampParam('prismBloom', 0, 640, false);
        chooseParam('texturaGrammar', BATCH_PARAM_OPTIONS.texturaGrammar);
        clampParam('texturaRhythm', 0, 4, false);
        clampParam('texturaPitch', 2, 180, false);
        clampParam('texturaAngle', -90, 90, false);
        clampParam('texturaWeight', 0.1, 4, false);
        clampParam('texturaSplit', 0, 1, false);
        clampParam('texturaSpur', 0, 96, false);
        chooseParam('voidArchitecture', BATCH_PARAM_OPTIONS.voidArchitecture);
        clampParam('voidDepth', 0, 1600, false);
        clampParam('voidAngle', -180, 180, false);
        clampParam('voidAperture', 0, 1, false);
        clampParam('voidTaper', -2, 2, false);
        clampParam('voidRibs', 1, 32, true);
        chooseParam('recursiveStructure', BATCH_PARAM_OPTIONS.recursiveStructure);
        clampParam('recursiveIterations', 1, 24, true);
        clampParam('recursiveScale', 0.25, 1.5, false);
        clampParam('recursiveTurn', -180, 180, false);
        clampParam('recursiveOrbit', 0, 1200, false);
        clampParam('recursiveParity', 0, 1, false);
        chooseParam('morphChoreography', BATCH_PARAM_OPTIONS.morphChoreography);
        clampParam('morphInbetweens', 1, 24, true);
        clampParam('morphSpan', 0.1, 2.5, false);
        clampParam('morphMelt', -2, 2, false);
        clampParam('morphTwist', -360, 360, false);
        clampParam('morphHalo', 0, 160, false);
        chooseParam('chimeraSystem', BATCH_PARAM_OPTIONS.chimeraSystem);
        clampParam('chimeraGrafts', 1, 32, true);
        clampParam('chimeraSpan', 4, 320, false);
        clampParam('chimeraAssimilation', 0, 1, false);
        clampParam('chimeraForeignness', 0, 4, false);
        clampParam('chimeraSeam', 0, 20, false);
        chooseParam('fiberGrammar', BATCH_PARAM_OPTIONS.fiberGrammar);
        clampParam('fiberUnit', 3, 18, false); clampParam('fiberDensity', 0.4, 3, false); clampParam('fiberFlow', -2, 2, false); clampParam('fiberFray', 0, 1, false);
        chooseParam('mutationGrammar', BATCH_PARAM_OPTIONS.mutationGrammar);
        clampParam('mutationRegions', 2, 12, true); clampParam('mutationDisplace', 0, 160, false); clampParam('mutationContrast', 0, 1, false); clampParam('mutationSeam', 0, 20, false);
        chooseParam('suspensionGrammar', BATCH_PARAM_OPTIONS.suspensionGrammar);
        clampParam('suspensionDrop', 0, 320, false); clampParam('suspensionTension', 0, 2, false); clampParam('suspensionCable', 0.2, 16, false); clampParam('suspensionTypeSize', 3, 24, false);
        chooseParam('livingGrammar', BATCH_PARAM_OPTIONS.livingGrammar);
        clampParam('livingCell', 3, 32, false); clampParam('livingDensity', 0.1, 3, false); clampParam('livingDrift', 0, 240, false); clampParam('livingMotion', 0, 2, false);
        chooseParam('eruptionGrammar', BATCH_PARAM_OPTIONS.eruptionGrammar);
        clampParam('eruptionForce', 0, 3, false); clampParam('eruptionLayers', 1, 18, true); clampParam('eruptionReach', 0, 320, false); clampParam('eruptionRupture', 0, 1, false);
        chooseParam('graftGrammar', BATCH_PARAM_OPTIONS.graftGrammar);
        clampParam('graftGenerations', 1, 7, true); clampParam('graftReach', 4, 240, false); clampParam('graftTurn', -120, 120, false); clampParam('graftFusion', 0, 240, false); clampParam('graftWeight', 0.2, 16, false);
        chooseParam('collisionSystem', BATCH_PARAM_OPTIONS.collisionSystem); chooseParam('collisionReaction', BATCH_PARAM_OPTIONS.collisionReaction);
        clampParam('collisionBodies', 2, 5, true); clampParam('collisionForce', 0, 240, false); clampParam('collisionAngle', -180, 180, false); clampParam('collisionSeam', 0, 32, false);
        chooseParam('peelGrammar', BATCH_PARAM_OPTIONS.peelGrammar);
        clampParam('peelLayers', 2, 18, true); clampParam('peelDepth', 0, 240, false); clampParam('peelBand', 2, 80, false); clampParam('peelTwist', -2, 2, false); clampParam('peelKnot', 0, 1, false);
        chooseParam('voidPressureMode', BATCH_PARAM_OPTIONS.voidPressureMode);
        clampParam('voidPressureForce', 0, 3, false); clampParam('voidPressureReach', 0, 240, false); clampParam('voidPressureRupture', 0, 1, false); clampParam('voidPressureAxis', -180, 180, false);
        chooseParam('reserveMode', BATCH_PARAM_OPTIONS.reserveMode);
        clampParam('reserveCell', 8, 40, false);
        clampParam('reserveReach', 8, 90, false);
        clampParam('reserveWeight', 0.25, 2.4, false);
        clampParam('reserveClearance', 0, 8, false);
        clampParam('reserveDisorder', 0, 1, false);
        chooseParam('membraneMode', BATCH_PARAM_OPTIONS.membraneMode);
        clampParam('membraneLoad', 0, 2, false);
        clampParam('membraneSlack', 0, 0.6, false);
        clampParam('membraneSoftness', 0, 1, false);
        clampParam('membraneBias', -1, 1, false);
        clampParam('membraneView', -65, 65, false);
        chooseParam('diffractionMode', BATCH_PARAM_OPTIONS.diffractionMode);
        clampParam('diffractionDistance', 0, 80, false);
        clampParam('diffractionPhase', 0, 4, false);
        clampParam('diffractionPeriod', 3, 30, false);
        clampParam('diffractionSpectrum', 0, 1, false);
        clampParam('diffractionExposure', 0.3, 3, false);
        chooseParam('dendriteMode', BATCH_PARAM_OPTIONS.dendriteMode);
        clampParam('dendriteGrain', 0.7, 3, false);
        clampParam('dendriteGrowth', 0.05, 1, false);
        clampParam('dendriteReach', 0, 30, false);
        clampParam('dendriteStick', 0.1, 1, false);
        clampParam('dendriteBias', -1, 1, false);
        chooseParam('quasiMode', BATCH_PARAM_OPTIONS.quasiMode);
        clampParam('quasiCell', 4, 30, false);
        clampParam('quasiDepth', 0, 50, false);
        clampParam('quasiPhason', -2, 2, false);
        clampParam('quasiRotation', -90, 90, false);
        clampParam('quasiLight', -180, 180, false);
        chooseParam('nematicMode', BATCH_PARAM_OPTIONS.nematicMode);
        clampParam('nematicDomain', 4, 32, false);
        clampParam('nematicAnneal', 0, 1, false);
        clampParam('nematicAnchor', 0, 6, false);
        clampParam('nematicRetardance', 0, 3, false);
        clampParam('nematicPolarizer', -90, 90, false);
        chooseParam('atlasMode', BATCH_PARAM_OPTIONS.atlasMode);
        clampParam('atlasRadius', 28, 112, false);
        clampParam('atlasScale', 0.5, 2.4, false);
        clampParam('atlasShift', -0.7, 0.7, false);
        clampParam('atlasSpin', -180, 180, false);
        clampParam('atlasEdge', 0, 1, false);
        chooseParam('foundryMode', BATCH_PARAM_OPTIONS.foundryMode);
        clampParam('foundryMass', 0.22, 0.85, false);
        clampParam('foundryFilter', 1.1, 4, false);
        clampParam('foundryEvolution', 0.1, 1, false);
        clampParam('foundryAngle', -80, 80, false);
        clampParam('foundryRelief', 0, 12, false);
        chooseParam('nodalBoundary', BATCH_PARAM_OPTIONS.nodalBoundary);
        clampParam('nodalOrder', 1, 18, false);
        clampParam('nodalMix', 0, 1, false);
        clampParam('nodalBands', 1, 8, false);
        clampParam('nodalRelief', 0, 12, false);
        clampParam('nodalInlay', 0, 1, false);
        chooseParam('alloyMode', BATCH_PARAM_OPTIONS.alloyMode);
        clampParam('alloyMix', 0.25, 0.75, false);
        clampParam('alloyAge', 0.05, 1, false);
        clampParam('alloyGrain', 1.4, 7, false);
        clampParam('alloyRelief', 0, 14, false);
        clampParam('alloyEtch', 0, 1, false);
        chooseParam('recastForm', BATCH_PARAM_OPTIONS.recastForm);
        clampParam('recastAmount', 0, 1, false);
        clampParam('recastAir', 0.08, 0.65, false);
        clampParam('recastWidth', 0.45, 1.4, false);
        clampParam('recastDrift', -0.5, 0.5, false);
        clampParam('recastRelief', 0, 14, false);
        chooseParam('hopfMode', BATCH_PARAM_OPTIONS.hopfMode);
        clampParam('hopfSweep', 0, 1, false);
        clampParam('hopfChart', 0.7, 2.2, false);
        clampParam('hopfGauge', 0.3, 2.5, false);
        clampParam('hopfYaw', -180, 180, false);
        clampParam('hopfTilt', -65, 65, false);
        chooseParam('miuraMode', BATCH_PARAM_OPTIONS.miuraMode);
        clampParam('miuraFold', 0, 1, false);
        clampParam('miuraCell', 4, 32, false);
        clampParam('miuraAngle', 25, 75, false);
        clampParam('miuraGauge', 0, 8, false);
        clampParam('miuraSpin', -90, 90, false);
        chooseParam('vortexMode', BATCH_PARAM_OPTIONS.vortexMode);
        clampParam('vortexTime', 0, 1, false);
        clampParam('vortexForce', 0, 2, false);
        clampParam('vortexEddy', 6, 48, false);
        clampParam('vortexViscosity', 0, 1, false);
        clampParam('vortexRelief', 0, 10, false);
        clampParam('cuspAmount', 0, 1.5, false);
        clampParam('cuspPoles', 1, 5, true);
        clampParam('cuspSpread', 0, 1, false);
        clampParam('cuspPhase', -180, 180, false);
        clampParam('bladeLength', 0, 1.4, false);
        clampParam('bladeAngle', -180, 180, false);
        clampParam('bladeTaper', 0, 1, false);
        chooseParam('bladeSide', BATCH_PARAM_OPTIONS.bladeSide);
        clampParam('bastionMass', 0, 1.5, false);
        clampParam('bastionSlit', 0.04, 1, false);
        clampParam('bastionReach', 0, 1, false);
        clampParam('bastionAxis', -90, 90, false);
        clampParam('abyssDepth', 0, 1.5, false);
        clampParam('abyssMouth', 0.05, 1, false);
        clampParam('abyssBias', -1, 1, false);
        clampParam('abyssCount', 1, 12, true);
        chooseParam('abyssPierce', BATCH_PARAM_OPTIONS.abyssPierce);
        clampParam('strangleAmount', 0, 1, false);
        clampParam('stranglePosition', 0.05, 0.95, false);
        clampParam('strangleBulge', 0, 1.5, false);
        clampParam('strangleAngle', -90, 90, false);
        clampParam('strangleBands', 1, 4, true);
        clampParam('gillCount', 3, 26, true);
        clampParam('gillOpen', 0, 1.4, false);
        clampParam('gillRoot', 0.04, 0.8, false);
        clampParam('gillCurve', -1.5, 1.5, false);
        clampParam('gillGap', 0, 0.7, false);
        clampParam('screwDepth', 0, 1.2, false);
        clampParam('screwTurn', -150, 150, false);
        clampParam('screwTaper', -0.35, 0.75, false);
        clampParam('screwView', -180, 180, false);
        clampParam('screwShade', 0, 1, false);
        clampParam('cagePull', 0, 1.5, false);
        clampParam('cagePosition', 0.08, 0.92, false);
        clampParam('cageSpan', 0.08, 0.65, false);
        chooseParam('cageMode', BATCH_PARAM_OPTIONS.cageMode);
        clampParam('cageCounter', 0, 1, false);
        chooseParam('beltramiMode', BATCH_PARAM_OPTIONS.beltramiMode);
        clampParam('beltramiAmount', 0, 4, false);
        clampParam('beltramiAnisotropy', 0, 0.76, false);
        clampParam('beltramiAngle', -180, 180, false);
        clampParam('beltramiFocusX', -0.42, 0.42, false);
        clampParam('beltramiFocusY', -0.42, 0.42, false);
        clampParam('beltramiDomain', 0.56, 1.05, false);
        clampParam('ramificationDegree', 2, 3, true);
        clampParam('ramificationDepth', 0, 3, true);
        clampParam('ramificationCoupling', 0, 1.8, false);
        clampParam('ramificationX', -1.15, 1.15, false);
        clampParam('ramificationY', -1.15, 1.15, false);
        clampParam('ramificationScale', 0.55, 1.5, false);
        clampParam('ramificationAngle', -180, 180, false);
        clampParam('twistCycles', 0, 3, false);
        clampParam('twistTurns', 0, 1.6, false);
        clampParam('twistSeparation', 0.12, 0.95, false);
        clampParam('twistRadius', 0.6, 1.8, false);
        clampParam('twistBalance', -1, 1, false);
        clampParam('twistAxis', -180, 180, false);
        clampParam('enneperOrder', 1, 3, true);
        clampParam('enneperSpan', 0.15, 2.6, false);
        clampParam('enneperAssociate', 0, 180, false);
        clampParam('enneperYaw', -180, 180, false);
        clampParam('enneperTilt', -80, 80, false);
        clampParam('enneperRelief', 0, 1, false);
        clampParam('nibContrast', -1.15, 1.15, false);
        clampParam('nibAngle', -90, 90, false);
        clampParam('nibWeight', 0.25, 1.5, false);
        clampParam('nibShape', 1, 8, false);
        clampParam('nibUniformity', 0, 1, false);
        clampParam('nibCounter', 0, 1, false);
        clampParam('anatomyX', 0.35, 2.8, false);
        clampParam('anatomyY', 0.35, 2.8, false);
        clampParam('anatomyFocusX', 0.2, 0.8, false);
        clampParam('anatomyFocusY', 0.2, 0.8, false);
        clampParam('anatomyBowX', -0.25, 0.25, false);
        clampParam('anatomyBowY', -0.25, 0.25, false);
        clampParam('kreslingFold', 0, 1, false);
        clampParam('kreslingSides', 4, 12, true);
        clampParam('kreslingTiers', 1, 5, true);
        clampParam('kreslingWrap', 0.2, 1, false);
        clampParam('kreslingYaw', -180, 180, false);
        clampParam('kreslingTilt', -80, 80, false);
        chooseParam('kreslingMode', BATCH_PARAM_OPTIONS.kreslingMode);
        clampParam('growthAmount', 0, 2, false);
        clampParam('growthBand', 0.08, 0.9, false);
        clampParam('growthStiffness', 0.01, 1, false);
        clampParam('growthWaves', 2, 8, true);
        clampParam('growthYaw', -180, 180, false);
        clampParam('growthTilt', -80, 80, false);
        chooseParam('growthMode', BATCH_PARAM_OPTIONS.growthMode);
        clampParam('inversionPoleX', -1.2, 1.2, false);
        clampParam('inversionPoleY', -1.2, 1.2, false);
        clampParam('inversionClearance', 0.12, 2, false);
        clampParam('inversionThickness', 0.04, 1.4, false);
        clampParam('inversionYaw', -180, 180, false);
        clampParam('inversionTilt', -80, 80, false);
        clampParam('lensEinstein', 0, 1.8, false);
        clampParam('lensSeparation', 0, 2.6, false);
        clampParam('lensRatio', 0.05, 1, false);
        clampParam('lensScale', 0.18, 1, false);
        clampParam('lensSourceX', -1.2, 1.2, false);
        clampParam('lensSourceY', -1.2, 1.2, false);
        clampParam('lensAngle', -180, 180, false);
        clampParam('lensShear', -0.45, 0.45, false);
        chooseParam('lensMode', BATCH_PARAM_OPTIONS.lensMode);
        clampParam('ropeSpeed', 0.12, 1, false);
        clampParam('ropeRadius', 0.025, 0.35, false);
        clampParam('ropeWidth', 0.004, 0.055, false);
        clampParam('ropeSpread', 0.25, 1.6, false);
        clampParam('ropePhase', 0, 1, false);
        chooseParam('ropeHistory', BATCH_PARAM_OPTIONS.ropeHistory);
        clampParam('wulff111', 0.45, 1.9, false);
        clampParam('wulff110', 0.65, 1.9, false);
        clampParam('wulffSize', 0.04, 0.26, false);
        clampParam('wulffFill', 0.55, 1.55, false);
        clampParam('wulffHabit', 0.22, 3, false);
        clampParam('wulffDisorder', 0, 1, false);
        clampParam('wulffYaw', -180, 180, false);
        clampParam('wulffTilt', -80, 80, false);
        clampParam('repulsiveLength', 1, 2.2, false);
        clampParam('repulsiveForce', 0.15, 2.5, false);
        clampParam('repulsiveWidth', 0.01, 0.08, false);
        clampParam('repulsiveDepth', 0.06, 0.6, false);
        clampParam('repulsiveStrands', 1, 2, true);
        clampParam('repulsiveBend', 0, 1, false);
        clampParam('repulsiveYaw', -180, 180, false);
        clampParam('repulsiveTilt', -80, 80, false);
        clampParam('wassersteinProgress', 0, 1, false);
        clampParam('wassersteinEntropy', 0.003, 0.04, false);
        clampParam('wassersteinMetric', 0.4, 2.5, false);
        clampParam('wassersteinSharpness', 0, 1, false);
        chooseParam('wassersteinView', BATCH_PARAM_OPTIONS.wassersteinView);
        chooseParam('stressMode', BATCH_PARAM_OPTIONS.stressMode);
        clampParam('stressLoad', 0, 1.5, false);
        clampParam('stressFringes', 0.2, 5, false);
        clampParam('stressAngle', -80, 80, false);
        clampParam('stressAnalyzer', -90, 90, false);
        clampParam('stressRelief', 0, 10, false);
        chooseParam('tensorMode', BATCH_PARAM_OPTIONS.tensorMode);
        clampParam('tensorSpacing', 2, 16, false);
        clampParam('tensorTurn', 0, 2, false);
        clampParam('tensorWeight', 0.2, 2.4, false);
        clampParam('tensorLength', 0.2, 2, false);
        clampParam('tensorContour', 0, 1, false);
        chooseParam('swarmMark', BATCH_PARAM_OPTIONS.swarmMark);
        clampParam('swarmCell', 5, 28, false);
        clampParam('swarmRelax', 0, 8, true);
        clampParam('swarmOverlap', 0.4, 1.8, false);
        clampParam('swarmPlates', 1, 3, true);
        clampParam('swarmBias', 0, 2, false);
        chooseParam('gyroidMode', BATCH_PARAM_OPTIONS.gyroidMode);
        clampParam('gyroidCell', 10, 65, false);
        clampParam('gyroidShell', 0.08, 0.65, false);
        clampParam('gyroidDepth', 4, 50, false);
        clampParam('gyroidTwist', -1.5, 1.5, false);
        clampParam('gyroidLight', -180, 180, false);
        chooseParam('causticMode', BATCH_PARAM_OPTIONS.causticMode);
        clampParam('causticRelief', 1, 24, false);
        clampParam('causticFocus', 0, 65, false);
        clampParam('causticIOR', 1.05, 1.8, false);
        clampParam('causticDispersion', 0, 1, false);
        clampParam('causticRidges', 0, 1.5, false);
        chooseParam('rubyGrammar', BATCH_PARAM_OPTIONS.rubyGrammar);
        clampParam('rubyDominance', 0, 1, false); clampParam('rubyLayers', 1, 4, true); clampParam('rubySpread', 0, 240, false); clampParam('rubyBodyRetention', 0.08, 1, false); clampParam('rubyThread', 0.2, 8, false);
        chooseParam('punctuationAnchors', BATCH_PARAM_OPTIONS.punctuationAnchors);
        clampParam('punctuationTension', 0, 2, false); clampParam('punctuationSag', -240, 240, false); clampParam('punctuationScale', 0.25, 3, false); clampParam('punctuationBands', 1, 7, true); clampParam('punctuationThread', 0.2, 10, false);
        chooseParam('counterpageMode', BATCH_PARAM_OPTIONS.counterpageMode);
        clampParam('counterpageReveal', 0, 1, false); clampParam('counterpageLayers', 1, 5, true); clampParam('counterpageDepth', 0, 320, false); clampParam('counterpageShift', -240, 240, false); clampParam('counterpageAperture', 0, 1, false); clampParam('counterpagePerspective', -1.5, 1.5, false);
        chooseParam('rendererPath', BATCH_PARAM_OPTIONS.rendererPath);
        clampParam('rendererInertia', 0, 1.5, false); clampParam('rendererMemory', 1, 12, true); clampParam('rendererDrag', 0, 1, false); clampParam('rendererPooling', 0, 1, false); clampParam('rendererSettle', 0, 1, false);
        chooseParam('contagionTrait', BATCH_PARAM_OPTIONS.contagionTrait);
        clampParam('contagionOrigin', 0, 1, false); clampParam('contagionReach', 1, 12, true); clampParam('contagionInheritance', 0, 1, false); clampParam('contagionBridge', 0, 120, false); clampParam('contagionRecovery', 0, 1, false);
        chooseParam('commonsAllocation', BATCH_PARAM_OPTIONS.commonsAllocation);
        clampParam('commonsFocus', 0, 1, false); clampParam('commonsBudget', 0.25, 2, false); clampParam('commonsTransfer', 0, 1, false); clampParam('commonsMinimum', 0.05, 0.8, false); clampParam('commonsReach', 1, 16, true);
        chooseParam('monolithGrammar', BATCH_PARAM_OPTIONS.monolithGrammar);
        clampParam('monolithMass', -120, 360, false);
        clampParam('monolithModule', 2, 120, false);
        clampParam('monolithFault', -480, 480, false);
        clampParam('monolithCounter', 0, 1, false);
        clampParam('monolithFormwork', 0, 4, false);
        chooseParam('rasterScreen', BATCH_PARAM_OPTIONS.rasterScreen);
        clampParam('rasterModulation', 0, 4, false);
        clampParam('rasterCell', 2, 72, false);
        clampParam('rasterGain', 0.05, 3, false);
        clampParam('rasterAngle', -90, 90, false);
        clampParam('rasterNoise', 0, 2, false);
        chooseParam('hatchGrammar', BATCH_PARAM_OPTIONS.hatchGrammar);
        clampParam('hatchDepth', 0, 4, false);
        clampParam('hatchSpacing', 1, 80, false);
        clampParam('hatchAngle', -180, 180, false);
        clampParam('hatchWarp', 0, 5, false);
        clampParam('hatchStroke', 0.1, 12, false);
        chooseParam('contourGrammar', BATCH_PARAM_OPTIONS.contourGrammar);
        clampParam('contourRelief', 0, 4, false);
        clampParam('contourBands', 1, 64, true);
        clampParam('contourSpacing', 1, 40, false);
        clampParam('contourStroke', 0.25, 14, false);
        clampParam('contourDrift', 0, 6, false);
        chooseParam('pressureSystem', BATCH_PARAM_OPTIONS.pressureSystem);
        clampParam('pressureWeight', -120, 260, false);
        clampParam('pressureContrast', 0, 4, false);
        clampParam('pressureAngle', -180, 180, false);
        clampParam('pressureFrequency', 0.1, 32, false);
        clampParam('pressureSoftness', 0.1, 24, false);
        clampParam('pressureBreath', 0, 4, false);
        clampParam('pressureDryness', 0, 1, false);
        clampParam('pressureTaper', -2, 2, false);
        chooseParam('sinewSystem', BATCH_PARAM_OPTIONS.sinewSystem);
        clampParam('sinewPull', -640, 640, false);
        clampParam('sinewTorque', -540, 540, false);
        clampParam('sinewTension', 0.1, 8, false);
        clampParam('sinewWaist', -2, 4, false);
        clampParam('sinewAxis', -180, 180, false);
        chooseParam('fractureTopology', BATCH_PARAM_OPTIONS.fractureTopology);
        clampParam('fractureEnergy', 0, 4, false);
        clampParam('fractureCell', 4, 140, false);
        clampParam('fractureScatter', 0, 520, false);
        clampParam('fractureGap', 0, 28, false);
        clampParam('fractureSpin', -720, 720, false);
        chooseParam('ribbonPath', BATCH_PARAM_OPTIONS.ribbonPath);
        clampParam('ribbonWeave', 0, 4, false);
        clampParam('ribbonDepth', -520, 520, false);
        clampParam('ribbonSteps', 1, 96, true);
        clampParam('ribbonTwist', -540, 540, false);
        clampParam('ribbonFade', 0, 1, false);
        chooseParam('risoPlateMap', BATCH_PARAM_OPTIONS.risoPlateMap);
        clampParam('risoPressure', 0, 4, false);
        clampParam('risoToneDepth', 0, 160, false);
        clampParam('risoScreenPitch', 1, 48, false);
        clampParam('risoSplit', -1, 1, false);
        clampParam('risoOverlap', 0, 1.5, false);
        clampParam('risoRegister', 0, 160, false);
        clampParam('risoGrain', 0, 2, false);
        chooseParam('copyFailure', BATCH_PARAM_OPTIONS.copyFailure);
        clampParam('copyInstability', 0, 4, false);
        clampParam('copyGenerations', 1, 48, true);
        clampParam('copyExposure', -1.5, 1.5, false);
        clampParam('copyMotion', -640, 640, false);
        clampParam('copyErosion', 0, 24, false);
        clampParam('copyToner', 0, 5, false);
        clampParam('copyDust', 0, 4, false);
        chooseParam('slitTimeMap', BATCH_PARAM_OPTIONS.slitTimeMap);
        clampParam('slitNonlinearity', 0, 4, false);
        clampParam('slitWidth', 1, 96, false);
        clampParam('slitTravel', -720, 720, false);
        clampParam('slitFrequency', 0.25, 16, false);
        clampParam('slitMemory', 1, 64, true);
        clampParam('slitSpeed', 0, 4, false);
        for (var surfaceIndex = 0; surfaceIndex < SURFACE_OPERATOR_IDS.length; surfaceIndex++) {
          var surfaceId = SURFACE_OPERATOR_IDS[surfaceIndex];
          clampParam(SURFACE_OPACITY_KEYS[surfaceId], 0, 1, false);
          clampParam(SURFACE_SOURCE_OPACITY_KEYS[surfaceId], 0, 1, false);
          syncSurfaceSourceModeFromOpacity(surfaceId);
          chooseParam(SURFACE_BLEND_KEYS[surfaceId], SURFACE_BLEND_MODES);
        }
        params.surfaceOrder = normalizedSurfaceRenderOrder(params.surfaceOrder).join(',');
        clampParam('confuseDepth', 0, 1, false);
        clampParam('proofCount', 6, 12, true);
        if ([6, 9, 12].indexOf(params.proofCount) === -1) params.proofCount = PARAM_DEFAULTS.proofCount;
        clampParam('proofColumns', 2, 4, true);
        clampParam('proofMutation', 0, 1.5, false);
        clampParam('proofVariant', 1, params.proofCount, true);
        params.proofScale = [1, 2].indexOf(Number(params.proofScale)) !== -1 ? Number(params.proofScale) : PARAM_DEFAULTS.proofScale;
        clampParam('seed', -1000000000, 1000000000, false);
        clampParam('fontSize', 18, 160, false);
        clampParam('lineHeight', 0.9, 2.2, false);
        clampParam('paragraphGap', 0, 12, false);
        clampParam('textMeasure', 0, 100, true);
        chooseParam('pageLayout', ['continuous', 'pages', 'spreads']);
        chooseParam('pageOrder', ['auto', 'ltr', 'rtl']);
        clampParam('pageDepth', 4, 160, false);
        clampParam('pageKeepLines', 1, 6, true);
        clampParam('pageGutter', 0, 40, false);
        clampParam('pageGap', 0, 80, false);
        clampParam('letterSpacing', -0.1, 0.5, false);
        clampParam('accentRatio', 0, 1, false);
        clampParam('abW', 16, 20000, true);
        clampParam('abH', 16, 20000, true);
        chooseParam('exportRegion', ['work', 'page', 'spread']);
        clampParam('exportRegionNumber', 1, 1000000, true);
        clampParam('marginPct', 0, 25, false);
        clampParam('videoDuration', 1, 30, true);
        clampParam('gridCols', 1, 60, true);
        clampParam('gridRows', 1, 60, true);
        clampParam('gridCellSize', 16, 240, true);
        clampParam('gridGap', 0, 40, true);

        params.fontWeight = Number(params.fontWeight) === 700 ? 700 : 400;
        params.exportScale = [1, 2, 4, 8].indexOf(Number(params.exportScale)) !== -1 ? Number(params.exportScale) : PARAM_DEFAULTS.exportScale;
        params.exportTight = params.exportTight !== false;
        params.exportLongEdge = Number(params.exportLongEdge) === 0 ? 0 : Math.round(Math.max(256, Math.min(16384, Number(params.exportLongEdge) || 8192)));
        clampParam('exportPadding', 0, 10);
        params.exportDpi = [72, 150, 300, 600].includes(Number(params.exportDpi)) ? Number(params.exportDpi) : 300;
        params.exportName = cleanExportName(params.exportName);
        params.videoFps = [24, 30, 60].indexOf(Number(params.videoFps)) !== -1 ? Number(params.videoFps) : PARAM_DEFAULTS.videoFps;
        params.videoLoops = [1, 2, 4, 8].indexOf(Number(params.videoLoops)) !== -1 ? Number(params.videoLoops) : PARAM_DEFAULTS.videoLoops;
        chooseParam('align', ['left', 'center', 'right']);
        chooseParam('anchor', ['tl', 'tc', 'tr', 'cl', 'cc', 'cr', 'bl', 'bc', 'br']);
        chooseParam('artboard', ['auto', 'custom', '1080x1080', '1080x1350', '1080x1920', '1920x1080', '2480x3508', '3508x2480']);
        chooseParam('videoSize', ['canvas', '1080x1080', '1920x1080', '1080x1920']);
        chooseParam('videoStart', ['zero', 'current']);
        chooseParam('videoFormat', ['webm', 'mp4']);
        chooseParam('mode', ['flow', 'lock', 'edit', 'grid']);
        chooseParam('activeOperator', OPERATOR_IDS);
        chooseParam('confuseDictionary', ['core', 'unicode', 'deep', 'hanmax']);
        chooseParam('traceSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('webSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('blobSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('softBlobSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('etchantSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('calligraphySourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('counterformSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('terminalSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('ligatureBodySourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('sigilSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('thornSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('cipherSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('boneSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('roseSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('chromeSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('ligatureSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('moireSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('naveSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('cloisterSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('prismSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('texturaSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('rasterSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('hatchSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('fractureSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('ribbonSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('contourSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('pressureSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('sinewSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('risoSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('copySourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('misregSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('dataMoshSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('slitSourceMode', ['keep', 'ghost', 'hide']);
        chooseParam('slitAxis', ['vertical', 'horizontal']);

        var boolKeys = ['vertical', 'fit', 'transparentBg', 'deformedOnly', 'gridEnabled', 'gridAutoRows', 'gridLines', 'gridLineBreak', 'confuseMixed', 'confuseGlyphGuard', 'blobDrawBounds', 'proofLabels'];
        for (var i = 0; i < boolKeys.length; i++) {
          var boolValue = params[boolKeys[i]];
          params[boolKeys[i]] = boolValue === true || boolValue === 1;
        }
        var colorKeys = ['wassersteinLettersColor', 'repulsiveCurvesColor', 'wulffBodyColor', 'liquidRopeColor', 'gravityLensColor', 'kreslingShellColor', 'growthBuckleColor', 'inversionBodyColor', 'nibRecastColor', 'anatomyWarpColor', 'linkedTwistColor', 'enneperBodyColor', 'beltramiFlowColor', 'riemannRamificationColor', 'rationalCuspColor', 'bladeBodyColor', 'blackBastionColor', 'inktrapAbyssColor', 'strangulationColor', 'gillArrayColor', 'screwExtrusionColor', 'harmonicCageColor', 'stressGlassColor', 'vortexBathColor', 'miuraVaultColor', 'hopfLoomColor', 'densityRecastColor', 'spinodalAlloyColor', 'nodalGlazeColor', 'loadpathFoundryColor', 'hyperbolicAtlasColor', 'quasicrystalBodyColor', 'nematicFilmColor', 'diffractiveGlyphColor', 'dendriteCastColor', 'ornamentReserveColor', 'tensionMembraneColor', 'tensorFiligreeColor', 'chromaticSwarmColor', 'gyroidSculptureColor', 'causticGlassColor', 'ink', 'paper', 'accent', 'misregColorA', 'misregColorB', 'moshColorA', 'moshColorB', 'blobColor', 'traceColor', 'webColor', 'softBlobColor', 'etchantColor',
          'calligraphyColor', 'counterformColor', 'terminalColor', 'ligatureBodyColor', 'contextualColor', 'scrollColor', 'scrollBackColor', 'scrollEdgeColor',
          'anamorphicColor',
          'sigilColor', 'thornColor', 'cipherColor', 'boneColor', 'roseColor', 'chromeColor',
          'ligatureColor', 'moireColor', 'naveColor', 'cloisterColor', 'prismColorA', 'prismColorB', 'texturaColor',
          'rubyColor', 'punctuationLoomColor', 'counterpageColor', 'rendererDebtColor', 'contagionColor', 'commonsColor',
          'rasterColor', 'hatchColor', 'contourColor', 'pressureColor', 'sinewColor', 'fractureColor', 'ribbonColor', 'copyColor', 'risoColorA', 'risoColorB', 'slitColor'];
        for (var c = 0; c < colorKeys.length; c++) {
          var colorKey = colorKeys[c];
          if (typeof params[colorKey] !== 'string' || !/^#[0-9a-f]{6}$/i.test(params[colorKey])) {
            params[colorKey] = PARAM_DEFAULTS[colorKey];
          }
        }
        if (typeof params.fontFamily !== 'string' || !params.fontFamily.trim()) {
          params.fontFamily = PARAM_DEFAULTS.fontFamily;
        } else {
          params.fontFamily = params.fontFamily.slice(0, 500).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
        }
        ['axisFieldFrom', 'axisFieldTo', 'axisFieldCycles', 'axisFieldPhase'].forEach(function (key) { clampParam(key, BATCH_PARAM_LIMITS[key][0], BATCH_PARAM_LIMITS[key][1], key === 'axisFieldCycles'); });
        chooseParam('axisFieldDistribution', BATCH_PARAM_OPTIONS.axisFieldDistribution);
        if (typeof params.axisFieldAxis !== 'string' || !/^[A-Za-z0-9 ]{4}$/.test(params.axisFieldAxis)) params.axisFieldAxis = 'wght';
        if (typeof params.fontAxes !== 'string' || params.fontAxes.length > 8192) params.fontAxes = '{}';
        if (typeof params.fontAxesInfo !== 'string' || params.fontAxesInfo.length > 32768) params.fontAxesInfo = '';
        if (typeof params.confuseCustom !== 'string') params.confuseCustom = '';
        params.confuseCustom = params.confuseCustom.slice(0, 20000).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
        if (typeof params.rubyText !== 'string') params.rubyText = '';
        params.rubyText = params.rubyText.slice(0, 4096).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
        if (typeof params.counterpageText !== 'string') params.counterpageText = '';
        params.counterpageText = params.counterpageText.slice(0, 8192).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
      }

      function normalizeBatchProfiles(raw) {
        var normalized = {};
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return normalized;
        for (var i = 0; i < BATCH_PROFILE_KEYS.length; i++) {
          var profileKey = BATCH_PROFILE_KEYS[i];
          var source = raw[profileKey];
          if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
          var sparse = !!BATCH_TARGETS.byKey[profileKey].test;
          var profile = {};
          for (var j = 0; j < BATCH_PARAM_KEYS.length; j++) {
            var key = BATCH_PARAM_KEYS[j];
            // Legacy broad profiles remain full snapshots; new subcategories
            // retain only explicit overrides through Undo / Project / Share.
            if (sparse && !Object.prototype.hasOwnProperty.call(source, key)) continue;
            var options = BATCH_PARAM_OPTIONS[key];
            if (options) {
              if (sparse && options.indexOf(source[key]) === -1) continue;
              profile[key] = options.indexOf(source[key]) !== -1 ? source[key] : params[key];
              continue;
            }
            var limits = BATCH_PARAM_LIMITS[key];
            if (sparse && (source[key] == null || source[key] === '' || !isFinite(Number(source[key])))) continue;
            var value = Number(source[key]);
            if (!isFinite(value)) value = params[key];
            profile[key] = typeof parameterModel!=='undefined' && parameterModel ? parameterModel.normalize(key,value,params[key],limits[0],limits[1],false) : Math.max(limits[0],Math.min(limits[1],value));
          }
          if (!sparse || Object.keys(profile).length) normalized[profileKey] = profile;
        }
        return normalized;
      }

      function surfaceSourceMode(id) {
        var key = SURFACE_SOURCE_MODE_KEYS[id];
        return key && params[key] ? params[key] : 'keep';
      }

      function surfaceSourceOpacity(id) {
        var key = SURFACE_SOURCE_OPACITY_KEYS[id];
        var value = key ? Number(params[key]) : NaN;
        if (isFinite(value)) return Math.max(0, Math.min(1, value));
        var mode = surfaceSourceMode(id);
        return mode === 'hide' ? 0 : (mode === 'ghost' ? 0.22 : 1);
      }

      function syncSurfaceSourceModeFromOpacity(id) {
        var key = SURFACE_SOURCE_MODE_KEYS[id];
        if (!key) return;
        var opacity = surfaceSourceOpacity(id);
        params[key] = opacity <= 0.005 ? 'hide' : (opacity >= 0.995 ? 'keep' : 'ghost');
      }

      function normalizedSurfaceRenderOrder(value) {
        var raw = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(',') : []);
        var seen = Object.create(null);
        var order = [];
        for (var i = 0; i < raw.length; i++) {
          var id = String(raw[i] || '').trim();
          if (SURFACE_OPERATOR_IDS.indexOf(id) === -1 || seen[id]) continue;
          seen[id] = true;
          order.push(id);
        }
        for (var d = 0; d < SURFACE_RENDER_ORDER_DEFAULT.length; d++) {
          var fallback = SURFACE_RENDER_ORDER_DEFAULT[d];
          if (!seen[fallback]) order.push(fallback);
        }
        return order;
      }

      function cleanExportName(value) {
        return String(value || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').trim().slice(0, 80);
      }
    return {normalize:function(){normalizeParams();return params;},profiles:normalizeBatchProfiles};
  }
  function normalize(input,options){return context(input,options).normalize();}
  function profiles(raw,base,options){return context(base,options).profiles(raw);}
  function corrections(before,after,defaults,path){
    var changes=[];before=before||{};defaults=defaults||{};
    Object.keys(after).forEach(function(key){var existed=Object.prototype.hasOwnProperty.call(before,key),previous=existed?before[key]:defaults[key];
      if(JSON.stringify(previous)!==JSON.stringify(after[key]))changes.push({path:path+'.'+key,before:clone(previous),after:clone(after[key]),reason:existed?'互換読込で設定を補正しました':'旧版の見た目を保つ設定を補いました'});
    });return changes;
  }
  function migrate(data,options){
    options=options||{};
    if(!data||!data.params||typeof data.params!=='object'||Array.isArray(data.params))throw new TypeError('Project params object required');
    var PARAM_DEFAULTS=clone(options.defaults||{}),params=clone(PARAM_DEFAULTS),batchProfiles={};
    var BATCH_PARAM_OPTIONS=options.batchOptions||{},registry=options.registry||{surfaceIds:[],glyphBodyIds:[],tables:{}};
    var SURFACE_OPERATOR_IDS=registry.surfaceIds,GLYPH_BODY_OPERATOR_IDS=registry.glyphBodyIds;
    var SURFACE_SOURCE_OPACITY_KEYS=registry.tables.SURFACE_SOURCE_OPACITY_KEYS||{},SURFACE_SOURCE_MODE_KEYS=registry.tables.SURFACE_SOURCE_MODE_KEYS||{};
    function normalizeParams(){params=options.normalizeParams?options.normalizeParams(clone(params)):normalize(params,options);}
    function normalizeBatchProfiles(raw){return options.normalizeBatchProfiles?options.normalizeBatchProfiles(clone(raw||{}),clone(params)):profiles(raw,params,options);}
        // Start from this version's defaults so fields absent from an older
        // project do not accidentally inherit the currently open artwork.
        for (var defaultParam in params) params[defaultParam] = PARAM_DEFAULTS[defaultParam];
        for (var k in params) {
          if (Object.prototype.hasOwnProperty.call(data.params, k)) params[k] = data.params[k];
        }
        // Retain v50 page boundaries; new documents start with two-line guards.
        if (Number(data.version || 0) < 51 && !Object.prototype.hasOwnProperty.call(data.params, 'pageKeepLines')) {
          params.pageKeepLines = 1;
        }
        // Old crowns keep their renderer; Rooted is opt-in on old projects.
        if (Number(data.version || 0) < 45 && !Object.prototype.hasOwnProperty.call(data.params, 'thornConstruction')) {
          params.thornConstruction = 'legacy';
        }
        if (Number(data.version || 0) < 47 && !Object.prototype.hasOwnProperty.call(data.params, 'ribbonPath')) {
          params.ribbonPath = Number(data.version || 0) < 24 ? 'legacy' : 'helix';
        }
        if (Number(data.version || 0) < 48 && !Object.prototype.hasOwnProperty.call(data.params, 'copyFailure')) {
          params.copyFailure = 'ghosting';
        }
        // v20 and earlier used one uniform value for each foundational FORM
        // transform. Preserve that exact look while new projects start with
        // source-driven cadence defaults.
        if (Number(data.version || 0) < 21) {
          if (!Object.prototype.hasOwnProperty.call(data.params, 'rotatePattern')) params.rotatePattern = 'uniform';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'skewPattern')) params.skewPattern = 'uniform';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'baselinePattern')) params.baselinePattern = 'uniform';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'mirrorPattern')) params.mirrorPattern = 'all';
        }
        // v21 and earlier did not expose the six legacy Operator grammars.
        // Preserve their exact restrained/ribbon render paths while new work
        // starts with structurally distinct defaults.
        if (Number(data.version || 0) < 64 && !Object.prototype.hasOwnProperty.call(data.params, 'boneArchitecture')) {
          params.boneArchitecture = Number(data.version || 0) < 22 ? 'adaptive' : 'trabecular';
        }
        if (Number(data.version || 0) < 22) {
          if (!Object.prototype.hasOwnProperty.call(data.params, 'thornGrammar')) params.thornGrammar = 'hybrid';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'thornArmor')) params.thornArmor = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'cipherDialect')) params.cipherDialect = 'mixed';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'cipherRegisters')) params.cipherRegisters = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'boneArchitecture')) params.boneArchitecture = 'adaptive';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'boneMarrow')) params.boneMarrow = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'roseCore')) params.roseCore = 'auto';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'roseInterlace')) params.roseInterlace = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'chromeVoltage')) params.chromeVoltage = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'ligatureGrammar')) params.ligatureGrammar = 'ribbon';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'ligatureWeave')) params.ligatureWeave = 0;
        }
        // v22 and earlier used one restrained global-mask treatment for each
        // of these five Operators. Keep those render paths exact while new
        // work starts from independent frequency, vault, fold, optical and
        // broad-nib grammars.
        if (Number(data.version || 0) < 23) {
          if (!Object.prototype.hasOwnProperty.call(data.params, 'moireLattice')) params.moireLattice = 'linear';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'moireResonance')) params.moireResonance = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'navePlan')) params.navePlan = 'arcade';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'naveRibwork')) params.naveRibwork = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'cloisterTessellation')) params.cloisterTessellation = 'strips';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'cloisterRelief')) params.cloisterRelief = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'prismOptics')) params.prismOptics = 'legacy';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'prismIridescence')) params.prismIridescence = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'texturaGrammar')) params.texturaGrammar = 'stems';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'texturaRhythm')) params.texturaRhythm = 0;
        }
        // v23 and earlier exposed only one visual law for each early material
        // Operator. Preserve those exact renderers while new projects begin
        // with adaptive screen, tonal cut, impact and helical path grammars.
        if (Number(data.version || 0) < 24) {
          if (!Object.prototype.hasOwnProperty.call(data.params, 'rasterScreen')) params.rasterScreen = 'legacy';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'rasterModulation')) params.rasterModulation = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'hatchGrammar')) params.hatchGrammar = 'legacy';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'hatchDepth')) params.hatchDepth = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'fractureTopology')) params.fractureTopology = 'triangles';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'fractureEnergy')) params.fractureEnergy = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'ribbonPath')) params.ribbonPath = 'legacy';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'ribbonWeave')) params.ribbonWeave = 0;
        }
        // v24 and earlier had only one renderer for each of these five
        // process Operators. Preserve that exact visual result while v25
        // starts new work with independent terrain, master, machine-failure,
        // time-map, and source-node graph grammars.
        if (Number(data.version || 0) < 25) {
          if (!Object.prototype.hasOwnProperty.call(data.params, 'sigilTopology')) params.sigilTopology = 'legacy';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'sigilBinding')) params.sigilBinding = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'contourGrammar')) params.contourGrammar = 'legacy';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'contourRelief')) params.contourRelief = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'risoPlateMap')) params.risoPlateMap = 'legacy';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'risoPressure')) params.risoPressure = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'copyFailure')) params.copyFailure = 'legacy';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'copyInstability')) params.copyInstability = 0;
          if (!Object.prototype.hasOwnProperty.call(data.params, 'slitTimeMap')) params.slitTimeMap = 'legacy';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'slitNonlinearity')) params.slitNonlinearity = 0;
        }
        // v26 and earlier treated camera tracking, plate offset and codec
        // damage as glyph-local transforms. Keep that visual contract on old
        // files; v27 starts new work with tracker fields, press failures and
        // reference-frame grammars in independent Surface layers.
        if (Number(data.version || 0) < 27) {
          if (!Object.prototype.hasOwnProperty.call(data.params, 'blobVisual')) params.blobVisual = 'legacy';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'misregSystem')) params.misregSystem = 'legacy';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'moshGrammar')) params.moshGrammar = 'legacy';
        }
        // v27 and earlier stored only one causal grammar for these organic
        // systems. Preserve their exact catenary, continuous-field, membrane
        // and protrusion renderers while v28 starts with force-density,
        // reaction-regime, fascicle and graft-reconnection systems.
        if (Number(data.version || 0) < 28) {
          if (!Object.prototype.hasOwnProperty.call(data.params, 'webTopology')) params.webTopology = 'legacy';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'etchantRegime')) params.etchantRegime = 'legacy';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'sinewSystem')) params.sinewSystem = 'legacy';
          if (!Object.prototype.hasOwnProperty.call(data.params, 'chimeraSystem')) params.chimeraSystem = 'legacy';
        }
        // v28 and earlier used the first, global-outline implementation of the
        // four Glyph Body Operators. Preserve not only that renderer but the
        // exact historical sub-mode (Broad/Brush/etc.) in a hidden companion
        // field. Selecting any visible v29 grammar opts that profile into the
        // new anatomy engine without rewriting the old Project on load.
        var legacyGlyphAnatomy = Number(data.version || 0) < 29;
        if (legacyGlyphAnatomy) {
          var oldCalligraphyTool = data.params.calligraphyTool;
          params.calligraphyLegacyTool = BATCH_PARAM_OPTIONS.calligraphyLegacyTool.indexOf(oldCalligraphyTool) !== -1
            ? oldCalligraphyTool : PARAM_DEFAULTS.calligraphyLegacyTool;
          params.calligraphyTool = 'legacy';
          var oldCounterformGrammar = data.params.counterformGrammar;
          params.counterformLegacyGrammar = BATCH_PARAM_OPTIONS.counterformLegacyGrammar.indexOf(oldCounterformGrammar) !== -1
            ? oldCounterformGrammar : PARAM_DEFAULTS.counterformLegacyGrammar;
          params.counterformGrammar = 'legacy';
          var oldTerminalStyle = data.params.terminalStyle;
          params.terminalLegacyStyle = BATCH_PARAM_OPTIONS.terminalLegacyStyle.indexOf(oldTerminalStyle) !== -1
            ? oldTerminalStyle : PARAM_DEFAULTS.terminalLegacyStyle;
          params.terminalStyle = 'legacy';
          var oldLigatureBodyGrammar = data.params.ligatureBodyGrammar;
          params.ligatureBodyLegacyGrammar = BATCH_PARAM_OPTIONS.ligatureBodyLegacyGrammar.indexOf(oldLigatureBodyGrammar) !== -1
            ? oldLigatureBodyGrammar : PARAM_DEFAULTS.ligatureBodyLegacyGrammar;
          params.ligatureBodyGrammar = 'legacy';
        }
        // v41 and earlier used the whole-scene v29 Counterform renderer. Keep
        // its pixels behind hidden grammar values; new v42 work uses the
        // glyph-local chamber, structural stencil, reservoir and canal engine.
        var legacyCounterformV29 = Number(data.version || 0) < 42;
        function preserveV29CounterformGrammar(value) {
          return ['aperture', 'stencil', 'trap', 'channel'].indexOf(value) !== -1 ? value + 'V29' : value;
        }
        if (legacyCounterformV29) params.counterformGrammar = preserveV29CounterformGrammar(params.counterformGrammar);
        // v29 and earlier used the pre-transfer Raster, Hatch and Copy paths,
        // plus one source-over Pressure distance field. Hidden v29 grammar
        // values preserve those pixels exactly; choosing any visible grammar
        // opts the profile into the richer v30 material law.
        var legacyMaterialTransfer = Number(data.version || 0) < 30;
        function preserveV29MaterialGrammar(value, values) {
          return values.indexOf(value) !== -1 ? value + 'V29' : value;
        }
        if (legacyMaterialTransfer) {
          params.rasterScreen = preserveV29MaterialGrammar(params.rasterScreen,
            ['adaptive', 'stochastic', 'line', 'mezzotint']);
          params.hatchGrammar = preserveV29MaterialGrammar(params.hatchGrammar,
            ['tonal', 'crosscut', 'burin', 'woodcut']);
          params.copyFailure = preserveV29MaterialGrammar(params.copyFailure,
            ['generational', 'banding', 'ghosting', 'residual']);
        }
        if (legacyMaterialTransfer
          && !Object.prototype.hasOwnProperty.call(data.params, 'pressureSystem')) {
          params.pressureSystem = 'legacy';
        }
        // v30 and earlier used one normalized SDF chain with no choreography.
        // Preserve that renderer exactly; selecting any visible v31 system
        // opts the artwork into feature frames, structural paths and counters.
        var legacyMorphProcession = Number(data.version || 0) < 31;
        if (legacyMorphProcession
          && !Object.prototype.hasOwnProperty.call(data.params, 'morphChoreography')) {
          params.morphChoreography = 'legacy';
        }
        // v31 and earlier stored only the whole-phrase Union/XOR spiral.
        // Preserve that exact renderer; choosing any visible v32 structure
        // opts the artwork into per-glyph compound construction.
        var legacyRecursiveShrine = Number(data.version || 0) < 32;
        if (legacyRecursiveShrine
          && !Object.prototype.hasOwnProperty.call(data.params, 'recursiveStructure')) {
          params.recursiveStructure = 'legacy';
        }
        // v32 and earlier only knew the whole-phrase aperture copy. Keep that
        // exact renderer for saved work; choosing a v33 architecture opts into
        // per-glyph connected components, local extrusion and carved chambers.
        var legacyVoidPortal = Number(data.version || 0) < 33;
        if (legacyVoidPortal
          && !Object.prototype.hasOwnProperty.call(data.params, 'voidArchitecture')) {
          params.voidArchitecture = 'legacy';
        }
        // v33 and earlier used one nearest-neighbour polyline plus an
        // unrelated Composition graph. Preserve those exact pixels; choosing
        // a visible v34 plot grammar opts the profile into contour circuits,
        // reading-order relays, spatial carriage order or a machine duet.
        var legacyKineticTrace = Number(data.version || 0) < 34;
        if (legacyKineticTrace
          && !Object.prototype.hasOwnProperty.call(data.params, 'traceGrammar')) {
          params.traceGrammar = 'legacy';
        }
        // v34 and earlier cast one union mask into a phrase-wide horizontal
        // wall. Preserve that exact output; choosing a v35 construction
        // grammar opts into glyph-local mass, real counter vaults and
        // structurally aligned block joints.
        var legacyMonolithCast = Number(data.version || 0) < 35;
        if (legacyMonolithCast
          && !Object.prototype.hasOwnProperty.call(data.params, 'monolithGrammar')) {
          params.monolithGrammar = 'legacy';
        }
        // v56 and earlier began Contour Etch with weighted index lines and
        // fully retained source text. Preserve that appearance when a partial
        // payload omitted the grammar; complete v56 payloads already carry it.
        // The shared source-opacity migration below converts Keep to exactly 1.
        if (Number(data.version || 0) >= 25 && Number(data.version || 0) < 57
          && !Object.prototype.hasOwnProperty.call(data.params, 'contourGrammar')) {
          params.contourGrammar = 'index';
        }
        // v57 and earlier began Raster Press with Adaptive AM. A complete
        // Project already stores its chosen grammar; partial payloads must not
        // inherit the new Gravure wells default merely because the field is
        // absent. v23 and earlier stay on their dedicated Legacy migration.
        if (Number(data.version || 0) >= 24 && Number(data.version || 0) < 58
          && !Object.prototype.hasOwnProperty.call(data.params, 'rasterScreen')) {
          params.rasterScreen = 'adaptive';
        }
        // v23-v60 began Prism Sacrament with Cut crystal. Preserve that
        // authored default when a partial payload omitted its optical body;
        // v22 and earlier retain the dedicated Legacy lens migration above.
        if (Number(data.version || 0) >= 23 && Number(data.version || 0) < 61
          && !Object.prototype.hasOwnProperty.call(data.params, 'prismOptics')) {
          params.prismOptics = 'crystal';
        }
        // v29-v61 began Ligature Body with Contextual interlock. A partial
        // payload from that range must not silently adopt v62 Counterbody;
        // explicitly stored grammars always win.
        if (Number(data.version || 0) >= 29 && Number(data.version || 0) < 62
          && !Object.prototype.hasOwnProperty.call(data.params, 'ligatureBodyGrammar')) {
          params.ligatureBodyGrammar = 'interlock';
        }
        // v12 and earlier stored only three source-text presets. Preserve the
        // exact old look while upgrading to the continuous 0–100% control.
        for (var sourceMigrationIndex = 0; sourceMigrationIndex < SURFACE_OPERATOR_IDS.length; sourceMigrationIndex++) {
          var sourceMigrationId = SURFACE_OPERATOR_IDS[sourceMigrationIndex];
          var sourceOpacityKey = SURFACE_SOURCE_OPACITY_KEYS[sourceMigrationId];
          if (Object.prototype.hasOwnProperty.call(data.params, sourceOpacityKey)) continue;
          var sourceModeKey = SURFACE_SOURCE_MODE_KEYS[sourceMigrationId];
          var legacySourceMode = data.params[sourceModeKey];
          // v26 Glyph Body Operators are complete replacement silhouettes.
          // Older projects did not know these IDs, so activating one after a
          // load should still receive the new Hide default. Existing Surface
          // Operators preserve their historical Keep/Ghost/Hide migration.
          if (GLYPH_BODY_OPERATOR_IDS.indexOf(sourceMigrationId) !== -1 && legacySourceMode == null) {
            params[sourceOpacityKey] = 0;
            continue;
          }
          params[sourceOpacityKey] = legacySourceMode === 'hide' ? 0 : (legacySourceMode === 'ghost' ? 0.22 : 1);
        }
        // Projects/autosaves created by the first, restrained Data Mosh build
        // should open with the new rupture model instead of preserving its
        // much weaker 34px/9px defaults.
        var legacyDataMosh = !Object.prototype.hasOwnProperty.call(data.params, 'moshSmear');
        if (legacyDataMosh) {
          params.moshShift = PARAM_DEFAULTS.moshShift;
          params.moshBlock = PARAM_DEFAULTS.moshBlock;
          params.moshChroma = PARAM_DEFAULTS.moshChroma;
          params.moshCrush = PARAM_DEFAULTS.moshCrush;
          params.moshSmear = PARAM_DEFAULTS.moshSmear;
          params.moshTear = PARAM_DEFAULTS.moshTear;
          params.moshHold = PARAM_DEFAULTS.moshHold;
        }
        normalizeParams();
        batchProfiles = normalizeBatchProfiles(data.batchProfiles);
        if (Number(data.version || 0) >= 29 && Number(data.version || 0) < 62) {
          for (var ligatureProfileKey in batchProfiles) {
            var rawLigatureProfile = data.batchProfiles && data.batchProfiles[ligatureProfileKey];
            if (rawLigatureProfile
              && !Object.prototype.hasOwnProperty.call(rawLigatureProfile, 'ligatureBodyGrammar')
              && Object.prototype.hasOwnProperty.call(batchProfiles[ligatureProfileKey], 'ligatureBodyGrammar')) {
              batchProfiles[ligatureProfileKey].ligatureBodyGrammar = 'interlock';
            }
          }
        }
        if (legacyMaterialTransfer) for (var materialProfileKey in batchProfiles) {
          var materialProfile = batchProfiles[materialProfileKey];
          materialProfile.rasterScreen = preserveV29MaterialGrammar(materialProfile.rasterScreen,
            ['adaptive', 'stochastic', 'line', 'mezzotint']);
          materialProfile.hatchGrammar = preserveV29MaterialGrammar(materialProfile.hatchGrammar,
            ['tonal', 'crosscut', 'burin', 'woodcut']);
          materialProfile.copyFailure = preserveV29MaterialGrammar(materialProfile.copyFailure,
            ['generational', 'banding', 'ghosting', 'residual']);
        }
        if (legacyMorphProcession) for (var morphProfileKey in batchProfiles) {
          batchProfiles[morphProfileKey].morphChoreography = 'legacy';
        }
        if (legacyRecursiveShrine) for (var recursiveProfileKey in batchProfiles) {
          batchProfiles[recursiveProfileKey].recursiveStructure = 'legacy';
        }
        if (legacyVoidPortal) for (var voidProfileKey in batchProfiles) {
          batchProfiles[voidProfileKey].voidArchitecture = 'legacy';
        }
        if (legacyKineticTrace) for (var traceProfileKey in batchProfiles) {
          batchProfiles[traceProfileKey].traceGrammar = 'legacy';
        }
        if (legacyMonolithCast) for (var monolithProfileKey in batchProfiles) {
          batchProfiles[monolithProfileKey].monolithGrammar = 'legacy';
        }
        if (legacyGlyphAnatomy) for (var anatomyProfileKey in batchProfiles) {
          var anatomyProfile = batchProfiles[anatomyProfileKey];
          if (BATCH_PARAM_OPTIONS.calligraphyLegacyTool.indexOf(anatomyProfile.calligraphyTool) !== -1) {
            anatomyProfile.calligraphyLegacyTool = anatomyProfile.calligraphyTool;
          }
          anatomyProfile.calligraphyTool = 'legacy';
          if (BATCH_PARAM_OPTIONS.counterformLegacyGrammar.indexOf(anatomyProfile.counterformGrammar) !== -1) {
            anatomyProfile.counterformLegacyGrammar = anatomyProfile.counterformGrammar;
          }
          anatomyProfile.counterformGrammar = 'legacy';
          if (BATCH_PARAM_OPTIONS.terminalLegacyStyle.indexOf(anatomyProfile.terminalStyle) !== -1) {
            anatomyProfile.terminalLegacyStyle = anatomyProfile.terminalStyle;
          }
          anatomyProfile.terminalStyle = 'legacy';
          if (BATCH_PARAM_OPTIONS.ligatureBodyLegacyGrammar.indexOf(anatomyProfile.ligatureBodyGrammar) !== -1) {
            anatomyProfile.ligatureBodyLegacyGrammar = anatomyProfile.ligatureBodyGrammar;
          }
          anatomyProfile.ligatureBodyGrammar = 'legacy';
        }
        if (legacyCounterformV29) for (var counterformProfileKey in batchProfiles) {
          batchProfiles[counterformProfileKey].counterformGrammar = preserveV29CounterformGrammar(
            batchProfiles[counterformProfileKey].counterformGrammar);
        }
        if (legacyDataMosh) for (var profileKey in batchProfiles) {
          batchProfiles[profileKey].moshShift = params.moshShift;
          batchProfiles[profileKey].moshBlock = params.moshBlock;
          batchProfiles[profileKey].moshChroma = params.moshChroma;
          batchProfiles[profileKey].moshCrush = params.moshCrush;
          batchProfiles[profileKey].moshSmear = params.moshSmear;
          batchProfiles[profileKey].moshTear = params.moshTear;
          batchProfiles[profileKey].moshHold = params.moshHold;
        }

    var report=corrections(data.params,params,PARAM_DEFAULTS,'params');
    Object.keys(batchProfiles).forEach(function(key){report=report.concat(corrections(data.batchProfiles&&data.batchProfiles[key],batchProfiles[key],params,'batchProfiles.'+key));});
    return {params:params,batchProfiles:batchProfiles,sourceVersion:Number(data.version||0),corrections:report};
  }
  root.TypeDeformerProjectMigrations=Object.freeze({normalizeParams:normalize,normalizeBatchProfiles:profiles,migrate:migrate});
})(typeof globalThis!=='undefined'?globalThis:this);
