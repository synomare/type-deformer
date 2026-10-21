/* Worker capabilities for the shared render engine. Frame values stay live through
 * accessors; preparation pools and render caches are owned by the engine. */
(function (root) {
  'use strict';
  function create(state) {
    var engine, environment = Object.create(null);
    var statePorts = ['params', 'compositionState', 'renderedSourceText', 'surfaceFxPhase', 'dataMoshFrame', 'blobTrackState', 'surfaceFxScratchCanvases', 'compositionScene', 'compositionQualityOverride'];
    statePorts.forEach(function (name) {
      Object.defineProperty(environment, name, { enumerable: true, get: function () { return state[name]; }, set: function (value) { state[name] = value; } });
    });
    environment.CONFUSE_DATA = null;
    environment.batchProfiles = {};
    environment.metrics = [];
    var model = root.TypeDeformerEditorModel.create({registry:root.TypeDeformerOperatorRegistry,surfaceIds:root.TypeDeformerOperatorRegistry.surfaceIds,dictionary:function(){return environment.CONFUSE_DATA;}});
    environment.BATCH_TARGETS = model.BATCH_TARGETS;
    environment.BATCH_PARAM_OPTIONS = model.BATCH_PARAM_OPTIONS;
    // Workers advance solvers explicitly in renderFrame; UI notifications and
    // animation scheduling have no ownership in this environment.
    function editorNotification() {}
    ['differentialScheduleWork', 'conformalScheduleWork', 'auxeticScheduleWork', 'marblingScheduleWork',
      'updateConformalStatus', 'updateAuxeticStatus', 'updateMarblingStatus', 'counterformSetRenderError',
      'updateDifferentialStatus', 'scheduleSurfaceFxDraw', 'scheduleCompositionDraw', 'reportRubyMappings']
      .forEach(function (name) { environment[name] = editorNotification; });
    environment.differentialUpdateStatus = function () { return engine.differentialController.state; };
    environment.conformalUpdateStatus = function () { return engine.conformalPool.state(); };
    environment.auxeticUpdateStatus = function () { return engine.auxeticPool.state(); };
    environment.marblingUpdateStatus = function () { return engine.marblingPool.state(); };
    environment.fontMetrics = function () { return state.fontMetrics; };
    environment.createCompositionInputBus = function () { return state.compositionInputs; };
    environment.snapshotGlyphs = function () { return state.sourceGlyphs; };
    environment.glyphFontSpec = function (glyph, size) { return state.font(glyph, size); };
    environment.isIOSLike = function () { return false; };
    environment.createRenderCanvas = function () { return new OffscreenCanvas(1, 1); };
    environment.matchesRenderMedia = function (query) {
      if (query === '(max-width: 760px)') return !!state.mobile;
      if (query === '(prefers-reduced-motion: reduce)') return !!state.reducedMotion;
      throw new Error('Unsupported render media query: ' + query);
    };
    environment.performance = root.performance;
    environment.setTimeout = root.setTimeout.bind(root);
    environment.cancelAnimationFrame = editorNotification;
    environment.Worker = root.Worker;
    engine = root.TypeDeformerRenderEngine.create(environment);
    return engine;
  }
  root.TypeDeformerWorkerAdapter = Object.freeze({ create: create });
})(typeof globalThis !== 'undefined' ? globalThis : this);
