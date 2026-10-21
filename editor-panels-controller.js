// Editor panels controller: owns responsive sections, focus, hydration and parameter navigation.
// This is authored source. Editor and tests consume this file directly.
(function (root) {
  'use strict';
  function create(options) {
    options = options || {};
      var panelState = options.state;
      var params = options.params;
      var canvasView = options.canvasView;
      var controlPanel = options.controlPanel;
      var stageWrap = options.stageWrap;
      var operatorSelect = options.operatorSelect;
      var manualCopyOverlay = options.manualCopyOverlay;
      var projectMenu = options.projectMenu;
      var mobileProjectButton = options.mobileProjectButton;
      var btnMobileView = options.btnMobileView;
      var studioRendererMode = options.studioRendererMode;
      var OPERATOR_DEFS = options.OPERATOR_DEFS;
      var COMPOSITION_DEFS = options.COMPOSITION_DEFS;
      var BATCH_PROFILE_LABELS = options.BATCH_PROFILE_LABELS;
      var BATCH_PARAM_KEYS = options.BATCH_PARAM_KEYS;
      var batchProfileForKey = options.batchProfileForKey;
      var cancelNewProjectConfirmation = options.cancelNewProjectConfirmation;
      var closeProjectMenu = options.closeProjectMenu;
      var isSurfaceOperator = options.isSurfaceOperator;
      var redo = options.redo;
      var undo = options.undo;
      var setCanvasViewActive = options.setCanvasViewActive;
      var refreshEffectiveParameterInspector = options.refreshEffectiveParameterInspector;
      var sourceParameterKey = options.sourceParameterKey;
      var sourceParameterTargets = options.sourceParameterTargets;
      var syncOperatorParameterAvailability = options.syncOperatorParameterAvailability;
      var syncProjectMenuA11y = options.syncProjectMenuA11y;
      /* ---------------- progressive desktop / mobile control UI ---------------- */
      var PANEL_UI_KEY = 'typeDeformer.panelUi.v2';
      var MODE_UI_LABELS = { flow: 'Lens', edit: 'Edit', grid: 'Arrange', lock: 'Freeze' };
      var TARGET_UI_LABELS = BATCH_PROFILE_LABELS;
      var WORKFLOW_STAGES = ['text', 'effect', 'apply', 'compose', 'export'];
      var WORKFLOW_LABELS = {
        text: '01 TEXT / 文字', effect: '02 EFFECT / 効果', apply: '03 APPLY / 適用',
        compose: '04 COMPOSE / 構成', export: '05 EXPORT / 書き出し'
      };
      var mobileActiveSection = 'text';
      var mobileSheetReturnFocus = null;

      function uiScrollBehavior() {
        return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      }

      function restoredWorkflowSection(saved) {
        if (saved && WORKFLOW_STAGES.indexOf(saved.active) !== -1) return saved.active;
        for (var i = 0; saved && i < WORKFLOW_STAGES.length; i++) {
          if (saved[WORKFLOW_STAGES[i]] === true) return WORKFLOW_STAGES[i];
        }
        return 'text';
      }

      function contextStatusText() {
        if (canvasView.active) return 'VIEW × PAN / ZOOM';
        var op = OPERATOR_DEFS[params.activeOperator] ? OPERATOR_DEFS[params.activeOperator].label : 'Stretch';
        return op + ' × ' + (MODE_UI_LABELS[params.mode] || 'Lens') + ' × ' + (TARGET_UI_LABELS[panelState.activeBatchProfile] || 'All');
      }

      function updateContextUI() {
        var operatorInspector = options.inspector();
        if (operatorInspector) requestAnimationFrame(operatorInspector.place);
        var text = contextStatusText();
        var ids = ['topContextStatus', 'panelContextStatus', 'mobileContextStatus'];
        for (var i = 0; i < ids.length; i++) {
          var node = document.getElementById(ids[i]);
          if (node) node.textContent = text;
        }
        if (controlPanel) controlPanel.dataset.mode = params.mode;
        Array.prototype.forEach.call(document.querySelectorAll('[data-mobile-mode]'), function (button) {
          button.setAttribute('aria-pressed', String(!canvasView.active && button.dataset.mobileMode === params.mode));
        });
        if (btnMobileView) btnMobileView.setAttribute('aria-pressed', String(canvasView.active));
        Array.prototype.forEach.call(document.querySelectorAll('[data-workflow-stage]'), function (button) {
          button.setAttribute('aria-current', button.dataset.workflowStage === mobileActiveSection ? 'step' : 'false');
        });
        var sheetTitle = document.getElementById('mobileSheetTitle');
        if (sheetTitle) sheetTitle.textContent = WORKFLOW_LABELS[mobileActiveSection] || WORKFLOW_LABELS.text;
        Array.prototype.forEach.call(document.querySelectorAll('button[data-batch]'), function (button) {
          button.setAttribute('aria-current', String(button.dataset.batch === panelState.activeBatchProfile));
        });
      }

      function storePanelSections() {
        if (studioRendererMode) return;
        var state = { active: mobileActiveSection, compositionInspector: panelState.compositionInspector };
        Array.prototype.forEach.call(document.querySelectorAll('.panel-section'), function (section) {
          if (WORKFLOW_STAGES.indexOf(section.dataset.panelSection) !== -1) {
            state[section.dataset.panelSection] = section.classList.contains('is-open');
          }
        });
        try { localStorage.setItem(PANEL_UI_KEY, JSON.stringify(state)); } catch (e) { }
      }

      function setPanelSectionOpen(section, open, persist) {
        if (!section) return;
        section.classList.toggle('is-open', open);
        var toggle = section.querySelector('.section-toggle');
        if (toggle) {
          toggle.setAttribute('aria-expanded', String(open));
          var mark = toggle.querySelector('.section-mark');
          if (mark) mark.textContent = open ? '−' : '＋';
        }
        if (persist !== false) storePanelSections();
      }

      function resetControlPanelScroll() {
        if (!controlPanel) return;
        controlPanel.scrollTop = 0;
        var panelContent = controlPanel.querySelector('.panel-content');
        if (panelContent) panelContent.scrollTop = 0;
      }

      function openDesktopSection(key) {
        if (key === 'create') key = 'text';
        if (key === 'output') key = 'export';
        if (key === 'file') key = 'project';
        var section = document.querySelector('.panel-section[data-panel-section="' + key + '"]');
        Array.prototype.forEach.call(document.querySelectorAll('.panel-section'), function (other) {
          if (other !== section) setPanelSectionOpen(other, false, false);
        });
        setPanelSectionOpen(section, true);
        if (WORKFLOW_STAGES.indexOf(key) !== -1) mobileActiveSection = key;
        storePanelSections();
        updateContextUI();
        resetControlPanelScroll();
      }

      function setMobileSection(key) {
        if (key === 'create') key = 'text';
        if (key === 'output') key = 'export';
        if (key === 'file') key = 'project';
        mobileActiveSection = WORKFLOW_STAGES.indexOf(key) !== -1 ? key : 'text';
        if (controlPanel) controlPanel.dataset.section = mobileActiveSection;
        Array.prototype.forEach.call(document.querySelectorAll('.panel-section'), function (section) {
          section.classList.toggle('mobile-active', section.dataset.panelSection === mobileActiveSection);
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-mobile-section]'), function (button) {
          button.setAttribute('aria-pressed', String(button.dataset.mobileSection === mobileActiveSection));
        });
        storePanelSections();
        updateContextUI();
        resetControlPanelScroll();
      }

      function syncMobilePanelA11y(open) {
        if (!controlPanel) return;
        var mobile = matchMedia('(max-width: 760px)').matches;
        if (!mobile) {
          controlPanel.inert = false;
          controlPanel.removeAttribute('aria-hidden');
          controlPanel.removeAttribute('role');
          controlPanel.removeAttribute('aria-labelledby');
          document.body.classList.remove('mobile-controls-open', 'mobile-keyboard-open');
          return;
        }
        controlPanel.inert = !open;
        controlPanel.setAttribute('aria-hidden', String(!open));
        controlPanel.setAttribute('role', 'dialog');
        controlPanel.setAttribute('aria-labelledby', 'mobileSheetTitle');
        document.body.classList.toggle('mobile-controls-open', open);
      }

      function revealMobileSheetAnchor(anchor) {
        if (!controlPanel || !anchor) return;
        var panelRect = controlPanel.getBoundingClientRect();
        var anchorRect = anchor.getBoundingClientRect();
        var targetTop = controlPanel.scrollTop + anchorRect.top - panelRect.top - 72;
        controlPanel.scrollTo({ top: Math.max(0, targetTop), behavior: uiScrollBehavior() });
      }

      function openMobileSheet(sectionKey, anchorId) {
        if (!controlPanel) return;
        var sheetWasOpen = controlPanel.classList.contains('mobile-open');
        var activeBeforeOpen = document.activeElement;
        closeProjectMenu();
        setMobileSection(sectionKey || mobileActiveSection);
        var activeDockButton = document.querySelector('[data-mobile-section="' + mobileActiveSection + '"]');
        if (!sheetWasOpen && activeBeforeOpen && activeBeforeOpen !== document.body && !controlPanel.contains(activeBeforeOpen)) {
          mobileSheetReturnFocus = activeBeforeOpen;
        } else if (sheetWasOpen || !mobileSheetReturnFocus) {
          mobileSheetReturnFocus = activeDockButton || document.getElementById('btnMobileMenu');
        }
        syncMobilePanelA11y(true);
        controlPanel.classList.add('mobile-open');
        var menuButton = document.getElementById('btnMobileMenu');
        if (menuButton) {
          menuButton.setAttribute('aria-expanded', 'true');
          menuButton.setAttribute('aria-label', 'Close control sheet');
        }
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var anchor = document.getElementById(anchorId);
            var title = document.getElementById('mobileSheetTitle');
            if (anchor) {
              revealMobileSheetAnchor(anchor);
              if (anchor.matches('button, input, select, textarea, [tabindex]')) anchor.focus({ preventScroll: true });
              else if (title) title.focus({ preventScroll: true });
            } else if (title) {
              title.focus({ preventScroll: true });
            }
          });
        });
      }

      function closeMobileSheet() {
        var focusWasInside = controlPanel && controlPanel.contains(document.activeElement);
        var returnFocus = mobileSheetReturnFocus;
        if (controlPanel) controlPanel.classList.remove('mobile-open', 'mobile-text-focus');
        document.body.classList.remove('mobile-keyboard-open');
        syncMobilePanelA11y(false);
        var menuButton = document.getElementById('btnMobileMenu');
        if (menuButton) {
          menuButton.setAttribute('aria-expanded', 'false');
          menuButton.setAttribute('aria-label', 'Open controls');
          if (focusWasInside) requestAnimationFrame(function () {
            var fallback = document.querySelector('[data-mobile-section="' + mobileActiveSection + '"]') || menuButton;
            var target = returnFocus && returnFocus.isConnected && !returnFocus.disabled ? returnFocus : fallback;
            target.focus();
          });
        }
        mobileSheetReturnFocus = null;
      }

      var parameterEntries = [];
      var parameterRows = [];
      var parameterChangedOnly = false;
      var parameterRefreshFrame = 0;
      var parameterFullRefresh = true, parameterDirtyEntries = new Set(), parameterEntryByControl = new WeakMap(), parameterModifiedCount = 0;
      var mobileStepperPairs = [];
      var mobileStepperInputs = new WeakSet();

      function parameterStateValue(input) {
        var definition=globalThis.TypeDeformerParameters&&TypeDeformerParameters.byControl[input.id];
        if(definition&&Object.prototype.hasOwnProperty.call(params,definition.key)){
          if(BATCH_PARAM_KEYS.indexOf(definition.key)===-1)return params[definition.key];
          if(panelState.sourceParameterMode==='range'&&sourceParameterKey(definition.key)){
            var targets=sourceParameterTargets();if(targets.length)return batchProfileForKey(targets[0].batchKey,targets[0])[definition.key];
          }
          return batchProfileForKey(panelState.activeBatchProfile)[definition.key];
        }
        return input.value;
      }

      function installMobileStepper(input) {
        if (!matchMedia('(max-width: 760px)').matches || mobileStepperInputs.has(input)) return;
        mobileStepperInputs.add(input);
        var minus = document.createElement('button');
        var plus = document.createElement('button');
        var controlName = parameterLabel(input);
        minus.type = plus.type = 'button';
        minus.className = plus.className = 'mobile-step';
        minus.textContent = '−'; plus.textContent = '＋';
        minus.setAttribute('aria-label', 'Decrease ' + controlName);
        plus.setAttribute('aria-label', 'Increase ' + controlName);
        minus.setAttribute('aria-controls', input.id); plus.setAttribute('aria-controls', input.id);
        minus.title = 'Decrease ' + controlName; plus.title = 'Increase ' + controlName;
        input.parentNode.insertBefore(minus, input); input.parentNode.insertBefore(plus, input.nextSibling);
        var pair = { input: input, minus: minus, plus: plus }; mobileStepperPairs.push(pair);
        function step(direction) {
          if (input.disabled) { syncMobileStepperPair(pair); return; }
          var amount = Number(input.step) || 1, current = Number(input.value);
          var definition=globalThis.TypeDeformerParameters&&TypeDeformerParameters.byControl[input.id];
          var next=definition?TypeDeformerParameters.normalize(definition.key,current+amount*direction,current):Math.max(Number(input.min),Math.min(Number(input.max),current+amount*direction));
          if (Math.abs(next-current)<Math.max(1e-9,Math.abs(amount)/1000)) { syncMobileStepperPair(pair); return; }
          input.dispatchEvent(new Event('pointerdown',{bubbles:true}));
          if(globalThis.TypeDeformerNumericControls&&TypeDeformerNumericControls.entry(input))TypeDeformerNumericControls.set(input,next);
          else{input.value=String(next);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
          syncMobileStepperPair(pair);
        }
        minus.addEventListener('click',function(){step(-1);}); plus.addEventListener('click',function(){step(1);});
        input.addEventListener('input',function(){syncMobileStepperPair(pair);}); input.addEventListener('change',function(){syncMobileStepperPair(pair);});
        syncMobileStepperPair(pair);
      }

      function hydrateParameterControl(input) {
        if(!input||!window.TypeDeformerNumericControls)return;
        // Viewer navigation ranges do not edit a document parameter.
        if(input.id==='lookCompareRange'||input.dataset&&input.dataset.studio==='position')return;
        var definition=TypeDeformerParameters.byControl[input.id],key=definition&&definition.key,value=parameterStateValue(input);
        if(input.type==='range')TypeDeformerNumericControls.mount(input,key,value);
        else if(input.type==='number')TypeDeformerNumericControls.mountNumber(input,key,value);
        if(input.type==='range')installMobileStepper(input);
      }

      function hydrateParameterScope(scope) {
        if(!scope)return;
        Array.prototype.forEach.call(scope.querySelectorAll('input[type="range"], input[type="number"]'),hydrateParameterControl);
      }

      function hydrateVisibleParameterScopes() {
        Array.prototype.forEach.call(controlPanel.querySelectorAll('input[type="range"], input[type="number"]'),function(input){
          var operatorPanel=(globalThis.TypeDeformerOperatorPanels ? TypeDeformerOperatorPanels.owner(input) : input.closest('[data-operator-panel]')),compositionPanel=input.closest('[data-composition-panel]');
          if((operatorPanel&&operatorPanel.hidden)||(compositionPanel&&compositionPanel.hidden))return;
          hydrateParameterControl(input);
        });
      }

      function hydrateInitialParameterControls() {
        Array.prototype.forEach.call(controlPanel.querySelectorAll('input[type="range"], input[type="number"]'),function(input){
          if(!(globalThis.TypeDeformerOperatorPanels ? TypeDeformerOperatorPanels.owner(input) : input.closest('[data-operator-panel]'))&&!input.closest('[data-composition-panel]'))hydrateParameterControl(input);
        });
        hydrateVisibleParameterScopes();
      }

      function syncMobileStepperPair(pair) {
        if (!pair || !pair.input) return;
        if (pair.input.disabled) {
          pair.minus.disabled = true;
          pair.plus.disabled = true;
          return;
        }
        var value = Number(pair.input.value);
        var definition=globalThis.TypeDeformerParameters&&TypeDeformerParameters.byControl[pair.input.id];
        var min = definition&&definition.domain.min!=null?definition.domain.min:definition?-Infinity:Number(pair.input.min);
        var max = definition&&definition.domain.max!=null?definition.domain.max:definition?Infinity:Number(pair.input.max);
        var step = Math.abs(Number(pair.input.step)) || 1;
        var epsilon = Math.max(1e-9, step / 1000);
        pair.minus.disabled = Number.isFinite(min) && value <= min + epsilon;
        pair.plus.disabled = Number.isFinite(max) && value >= max - epsilon;
      }

      function syncMobileStepperStates() {
        for (var pairIndex = 0; pairIndex < mobileStepperPairs.length; pairIndex++) {
          syncMobileStepperPair(mobileStepperPairs[pairIndex]);
        }
      }

      function parameterTitle(value) {
        return String(value || '')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/[-_]+/g, ' ')
          .replace(/^p(?=[A-Z])/, '')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
      }

      function parameterLabel(control) {
        var label = control.id ? controlPanel.querySelector('label[for="' + control.id + '"]') : null;
        if (!label && control.closest('.row')) label = control.closest('.row').querySelector('label');
        return (label && label.textContent.trim()) || control.getAttribute('aria-label') || parameterTitle(control.id);
      }

      function parameterGroup(control) {
        var operatorPanel = (globalThis.TypeDeformerOperatorPanels ? TypeDeformerOperatorPanels.owner(control) : control.closest('[data-operator-panel]'));
        if (operatorPanel) {
          var operatorId = operatorPanel.dataset.operatorPanel;
          var operatorDefinition = OPERATOR_DEFS[operatorId];
          return 'Operator · ' + (operatorDefinition ? operatorDefinition.label : parameterTitle(operatorId));
        }
        var compositionPanel = control.closest('[data-composition-panel]');
        if (compositionPanel) {
          var compositionId = compositionPanel.dataset.compositionPanel;
          var compositionDefinition = COMPOSITION_DEFS[compositionId];
          return 'Compose · ' + (compositionDefinition ? compositionDefinition.label : parameterTitle(compositionId));
        }
        if (control.closest('#gridControlBlock')) return 'Compose · Grid';
        if (control.closest('#typographyControls')) return 'Create · Typography';
        var details = control.closest('details');
        if (details) {
          var summary = details.querySelector(':scope > summary');
          if (summary) return parameterTitle(summary.textContent);
        }
        var section = control.closest('[data-panel-section]');
        return section ? parameterTitle(section.dataset.panelSection) : 'Controls';
      }

      function parameterValue(control) {
        if (control.type === 'checkbox' || control.type === 'radio') return control.checked ? 'ON' : 'OFF';
        if (control.tagName === 'SELECT') {
          var option = control.options[control.selectedIndex];
          return option ? option.textContent.trim() : control.value;
        }
        var value = parameterStateValue(control);
        return control.type === 'color' ? String(value).toUpperCase() : String(value);
      }

      function parameterRawValue(control) {
        if (control.type === 'checkbox' || control.type === 'radio') return String(control.checked);
        return String(parameterStateValue(control));
      }

      function resetParameterEntry(entry, deferRefresh) {
        if (globalThis.TypeDeformerOperatorPanels) {
          var panel = TypeDeformerOperatorPanels.owner(entry.control);
          if (panel && TypeDeformerOperatorPanels.mount(panel)) hydrateParameterScope(panel);
        }
        var control = entry.control;
        control.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        if (control.type === 'checkbox' || control.type === 'radio') control.checked = entry.defaultChecked;
        else control.value = entry.defaultValue;
        control.dispatchEvent(new Event('input', { bubbles: true }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
        if (!deferRefresh) scheduleParameterUIRefresh();
      }

      function resetParameterRow(row) {
        for (var i = 0; i < row.parameterEntries.length; i++) resetParameterEntry(row.parameterEntries[i], true);
        scheduleParameterUIRefresh();
      }

      function revealParameter(entry) {
        var control = entry.control;
        if (control.closest('#surfaceMixerBlock') && !isSurfaceOperator(params.activeOperator)) {
          operatorSelect.value = 'plotterTrace';
          operatorSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        var operatorPanel = (globalThis.TypeDeformerOperatorPanels ? TypeDeformerOperatorPanels.owner(control) : control.closest('[data-operator-panel]'));
        if (operatorPanel && operatorSelect.value !== operatorPanel.dataset.operatorPanel) {
          operatorSelect.value = operatorPanel.dataset.operatorPanel;
          operatorSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        var compositionPanel = control.closest('[data-composition-panel]');
        if (compositionPanel && compositionPanel.hidden) {
          var tab = document.querySelector('[data-composition-tab="' + compositionPanel.dataset.compositionPanel + '"]');
          if (tab) tab.click();
        }
        var ancestor = control.parentElement;
        while (ancestor && ancestor !== controlPanel) {
          if (ancestor.tagName === 'DETAILS') ancestor.open = true;
          ancestor = ancestor.parentElement;
        }
        var section = control.closest('[data-panel-section]');
        var sectionKey = section ? section.dataset.panelSection : 'text';
        if (matchMedia('(max-width: 760px)').matches) openMobileSheet(sectionKey);
        else openDesktopSection(sectionKey);
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            control.scrollIntoView({ block: 'center', behavior: uiScrollBehavior() });
            control.focus({ preventScroll: true });
          });
        });
      }

      function setMobileKeyboardFocus(active, control) {
        if (!controlPanel) return;
        if (active && !matchMedia('(max-width: 760px)').matches) return;
        controlPanel.classList.toggle('mobile-text-focus', active);
        document.body.classList.toggle('mobile-keyboard-open', active);
        if (active && control) requestAnimationFrame(function () {
          control.scrollIntoView({ block: 'start', behavior: uiScrollBehavior() });
        });
      }

      function openParameterSearch() {
        var search = document.getElementById('parameterSearch');
        var advancedDrawer = document.getElementById('advancedParameterDrawer');
        if (!search) return;
        if (matchMedia('(max-width: 760px)').matches) openMobileSheet('effect');
        else openDesktopSection('effect');
        if (advancedDrawer) advancedDrawer.open = true;
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            search.focus({ preventScroll: true });
            search.select();
            search.scrollIntoView({ block: 'start', behavior: uiScrollBehavior() });
          });
        });
      }

      function keepParameterResultsVisible(search, results) {
        if (!matchMedia('(max-width: 760px)').matches || document.activeElement !== search || results.hidden) return;
        requestAnimationFrame(function () { results.scrollIntoView({ block: 'nearest' }); });
      }

      function renderParameterResults() {
        var search = document.getElementById('parameterSearch');
        var results = document.getElementById('parameterSearchResults');
        var status = document.getElementById('parameterSearchStatus');
        if (!search || !results || !status) return;
        var query = search.value.trim().toLowerCase();
        if (!query && !parameterChangedOnly) {
          results.hidden = true;
          results.replaceChildren();
          status.textContent = 'Search all controls';
          return;
        }
        var matches = parameterEntries.filter(function (entry) {
          return (!parameterChangedOnly || entry.modified) && (!query || entry.searchText.indexOf(query) !== -1);
        });
        if (query) matches.sort(function (a, b) {
          var aStarts = a.label.toLowerCase().indexOf(query) === 0 ? 0 : 1;
          var bStarts = b.label.toLowerCase().indexOf(query) === 0 ? 0 : 1;
          return aStarts - bStarts || a.label.localeCompare(b.label);
        });
        status.textContent = matches.length + (parameterChangedOnly ? ' changed' : ' results');
        results.replaceChildren();
        results.hidden = false;
        if (!matches.length) {
          var empty = document.createElement('div');
          empty.className = 'parameter-empty';
          empty.textContent = 'No matching parameters';
          results.appendChild(empty);
          keepParameterResultsVisible(search, results);
          return;
        }
        matches.slice(0, 16).forEach(function (entry) {
          var row = document.createElement('div');
          row.className = 'parameter-result';
          var main = document.createElement('button');
          main.type = 'button';
          main.className = 'parameter-result-main';
          main.dataset.parameterTarget = entry.control.id;
          var name = document.createElement('span');
          name.className = 'parameter-result-name';
          name.textContent = entry.label;
          var value = document.createElement('span');
          value.className = 'parameter-result-value';
          value.textContent = parameterValue(entry.control) + ' · ';
          var group = document.createElement('span');
          group.className = 'parameter-result-group';
          group.textContent = entry.group;
          value.appendChild(group);
          main.appendChild(name);
          main.appendChild(value);
          main.addEventListener('click', function () { revealParameter(entry); });
          row.appendChild(main);
          if (entry.modified) {
            var reset = document.createElement('button');
            reset.type = 'button';
            reset.className = 'parameter-result-reset';
            reset.textContent = 'RESET';
            reset.setAttribute('aria-label', 'Reset ' + entry.label);
            reset.addEventListener('click', function () { resetParameterEntry(entry); });
            row.appendChild(reset);
          }
          results.appendChild(row);
        });
        keepParameterResultsVisible(search, results);
      }

      function refreshParameterUI() {
        parameterRefreshFrame = 0;
        if (window.TypeDeformerNumericControls && window.TypeDeformerNumericControls.editing()) return;
        syncOperatorParameterAvailability();
        var full = parameterFullRefresh || !parameterDirtyEntries.size;
        var entries = full ? parameterEntries : Array.from(parameterDirtyEntries);
        var rows = full ? parameterRows : Array.from(new Set(entries.map(function(entry){return entry.row;}).filter(Boolean)));
        var changed = full ? 0 : parameterModifiedCount;
        for (var i = 0; i < entries.length; i++) {
          var entry = entries[i], wasModified = entry.modified;
          entry.modified = parameterRawValue(entry.control) !== entry.defaultRaw;
          entry.searchText = (entry.label + ' ' + entry.group + ' ' + entry.control.id + ' ' + parameterValue(entry.control)).toLowerCase();
          changed += (entry.modified ? 1 : 0) - (!full && wasModified ? 1 : 0);
        }
        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          var rowModified=row.parameterEntries.some(function (entry) { return entry.modified; });
          row.element.classList.toggle('is-parameter-modified', rowModified);
          syncParameterRowReset(row,rowModified);
        }
        parameterModifiedCount = changed;
        parameterFullRefresh = false; parameterDirtyEntries.clear();
        var count = document.getElementById('parameterChangedCount');
        if (count) count.textContent = String(changed);
        syncMobileStepperStates();
        renderParameterResults();
        if (document.getElementById('effectiveParameterBlock')) refreshEffectiveParameterInspector();
      }

      function scheduleParameterUIRefresh(eventOrControl) {
        var input = eventOrControl && (eventOrControl.target || eventOrControl);
        if (input && input.dataset && input.dataset.parameterCompanion) return;
        var entry = input && parameterEntryByControl.get(input);
        if (entry && (input.type === 'range' || input.type === 'number' || input.type === 'color')) parameterDirtyEntries.add(entry);
        else parameterFullRefresh = true;
        if (!parameterRefreshFrame) parameterRefreshFrame = requestAnimationFrame(refreshParameterUI);
      }

      function syncParameterRowReset(row, modified) {
        var operatorPanel=(globalThis.TypeDeformerOperatorPanels ? TypeDeformerOperatorPanels.owner(row.element) : row.element.closest('[data-operator-panel]')),compositionPanel=row.element.closest('[data-composition-panel]');
        var visible=(!operatorPanel||!operatorPanel.hidden)&&(!compositionPanel||!compositionPanel.hidden);
        if(!modified||!visible){
          if(row.resetButton){row.resetButton.remove();row.resetButton=null;row.element.classList.remove('has-parameter-reset');}
          return;
        }
        if(row.resetButton)return;
        var reset=document.createElement('button');reset.type='button';reset.className='parameter-row-reset';reset.textContent='RESET';
        reset.setAttribute('aria-label','Reset '+row.resetName);reset.title='Reset '+row.resetName;
        reset.addEventListener('click',function(){resetParameterRow(row);});row.element.appendChild(reset);row.resetButton=reset;row.element.classList.add('has-parameter-reset');
      }

      function initParameterNavigator() {
        var rowMap = new Map();
        var controlSelector = 'input[id^="p"]:not([type="file"]):not(#parameterSearch), select[id^="p"]:not(#pOperator):not(#pCompositionEngine), textarea[id^="p"]';
        var controls = Array.from(controlPanel.querySelectorAll(controlSelector));
        if (globalThis.TypeDeformerOperatorPanels) controls = controls.concat(TypeDeformerOperatorPanels.query(controlSelector));
        Array.prototype.forEach.call(controls, function (control) {
          if (control.closest('#targetControlBlock') || control.closest('#sourceParameterBlock')) return; // navigation is not an effect parameter
          var entry = {
            control: control,
            label: parameterLabel(control),
            group: parameterGroup(control),
            defaultValue: control.value,
            defaultChecked: control.checked,
            defaultRaw: parameterRawValue(control),
            modified: false,
            searchText: ''
          };
          parameterEntries.push(entry);
          parameterEntryByControl.set(control, entry);
          var rowElement = control.closest('.row');
          if (!rowElement) return;
          var row = rowMap.get(rowElement);
          if (!row) {
            row = { element: rowElement, parameterEntries: [], resetButton: null, resetName: 'parameter group' };
            rowMap.set(rowElement, row);
            parameterRows.push(row);
          }
          row.parameterEntries.push(entry); entry.row = row;
        });
        for (var rowIndex = 0; rowIndex < parameterRows.length; rowIndex++) {
          var parameterRow = parameterRows[rowIndex];
          var rowLabels = [];
          for (var entryIndex = 0; entryIndex < parameterRow.parameterEntries.length; entryIndex++) {
            var entryLabel = parameterRow.parameterEntries[entryIndex].label;
            if (entryLabel && rowLabels.indexOf(entryLabel) === -1) rowLabels.push(entryLabel);
          }
          parameterRow.resetName = rowLabels.length ? rowLabels.join(' and ') : 'parameter group';
        }
        var search = document.getElementById('parameterSearch');
        var changedButton = document.getElementById('btnParameterChanged');
        var parameterSearchPointerActive = false;
        controlPanel.addEventListener('pointerdown', function (event) {
          if (document.activeElement === search && event.target !== search) parameterSearchPointerActive = true;
        }, true);
        function finishParameterSearchPointer() {
          if (!parameterSearchPointerActive) return;
          parameterSearchPointerActive = false;
          requestAnimationFrame(function () {
            if (document.activeElement !== search) setMobileKeyboardFocus(false);
          });
        }
        document.addEventListener('pointerup', finishParameterSearchPointer);
        document.addEventListener('pointercancel', finishParameterSearchPointer);
        search.addEventListener('input', renderParameterResults);
        search.addEventListener('focus', function () { setMobileKeyboardFocus(true, search); });
        search.addEventListener('blur', function () {
          if (!parameterSearchPointerActive) setMobileKeyboardFocus(false);
        });
        search.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') {
            var hasActiveSearch = Boolean(search.value || parameterChangedOnly);
            if (!hasActiveSearch) return;
            event.preventDefault();
            event.stopPropagation();
            search.value = '';
            parameterChangedOnly = false;
            changedButton.setAttribute('aria-pressed', 'false');
            renderParameterResults();
          } else if (event.key === 'Enter') {
            var first = document.querySelector('.parameter-result-main');
            if (first) { event.preventDefault(); first.click(); }
          }
        });
        changedButton.addEventListener('click', function () {
          parameterChangedOnly = !parameterChangedOnly;
          changedButton.setAttribute('aria-pressed', String(parameterChangedOnly));
          renderParameterResults();
        });
        controlPanel.addEventListener('input', scheduleParameterUIRefresh, true);
        controlPanel.addEventListener('change', scheduleParameterUIRefresh, true);
        document.addEventListener('keydown', function (event) {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            openParameterSearch();
          }
        });
        refreshParameterUI();
      }

      function initProgressiveUI() {
        var effectSlot = document.getElementById('effectStageSlot');
        var applySlot = document.getElementById('applyStageSlot');
        var effectBlocks = ['effectControlBlock', 'operatorPanelsBlock', 'surfaceMixerBlock', 'effectExtrasBlock'];
        var applyBlocks = ['targetControlBlock', 'applicationControlBlock', 'contextLensBlock'];
        effectBlocks.forEach(function (id) {
          var block = document.getElementById(id);
          if (effectSlot && block) effectSlot.appendChild(block);
        });
        applyBlocks.forEach(function (id) {
          var block = document.getElementById(id);
          if (applySlot && block) applySlot.appendChild(block);
        });
        document.getElementById('targetActionSlot').appendChild(document.getElementById('applicationQuick'));
        document.getElementById('targetBatchSlot').appendChild(document.getElementById('targetBatchBlock'));
        var gridSlot = document.getElementById('composeGridSlot');
        var gridBlock = document.getElementById('gridControlBlock');
        if (gridSlot && gridBlock) gridSlot.appendChild(gridBlock);
        // Compose follows the actual task sequence: choose an engine, build
        // and apply it, then perform. Keep DOM, visual and reading order equal.
        var compositionBody = document.getElementById('sectionCompose');
        var compositionBuildBlock = compositionBody && compositionBody.querySelector('.composition-build-block');
        var compositionPerformBlock = compositionBody && compositionBody.querySelector('.composition-perform-block');
        if (compositionBody && compositionBuildBlock && compositionPerformBlock) {
          compositionBody.insertBefore(compositionBuildBlock, compositionPerformBlock);
        }
        var parameterToolsSlot = document.getElementById('parameterToolsSlot');
        var parameterTools = document.querySelector('.parameter-tools');
        if (parameterToolsSlot && parameterTools) parameterToolsSlot.appendChild(parameterTools);

        Array.prototype.forEach.call(document.querySelectorAll('.operator-panel'), function (panel) {
          var content = globalThis.TypeDeformerOperatorPanels ? TypeDeformerOperatorPanels.content(panel) : panel;
          var rows = Array.prototype.filter.call(content.children, function (child) { return child.classList && child.classList.contains('row'); });
          if (rows.length <= 3) return;
          var details = document.createElement('details');
          details.className = 'operator-advanced';
          var summary = document.createElement('summary');
          summary.textContent = 'More effect controls / 詳細';
          details.appendChild(summary);
          rows.slice(3).forEach(function (row) { details.appendChild(row); });
          content.appendChild(details);
        });

        var saved = null;
        try { saved = JSON.parse(localStorage.getItem(PANEL_UI_KEY)); } catch (e) { }
        if (saved && COMPOSITION_DEFS[saved.compositionInspector]) panelState.compositionInspector = saved.compositionInspector;
        var initialWorkflowSection = restoredWorkflowSection(saved);
        mobileActiveSection = initialWorkflowSection;
        if (controlPanel) controlPanel.dataset.section = initialWorkflowSection;
        Array.prototype.forEach.call(document.querySelectorAll('.panel-section'), function (section) {
          var key = section.dataset.panelSection;
          var shouldOpen = key === initialWorkflowSection;
          setPanelSectionOpen(section, shouldOpen, false);
          var toggle = section.querySelector('.section-toggle');
          if (toggle) toggle.addEventListener('click', function () {
            if (section.classList.contains('is-open')) setPanelSectionOpen(section, false);
            else openDesktopSection(section.dataset.panelSection);
          });
        });

        Array.prototype.forEach.call(document.querySelectorAll('[data-workflow-stage]'), function (button) {
          button.addEventListener('click', function () {
            if (matchMedia('(max-width: 760px)').matches) openMobileSheet(button.dataset.workflowStage);
            else openDesktopSection(button.dataset.workflowStage);
          });
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-next-stage]'), function (button) {
          button.addEventListener('click', function () {
            if (matchMedia('(max-width: 760px)').matches) openMobileSheet(button.dataset.nextStage);
            else openDesktopSection(button.dataset.nextStage);
          });
        });

        Array.prototype.forEach.call(document.querySelectorAll('[data-mobile-section]'), function (button) {
          button.addEventListener('click', function () { openMobileSheet(button.dataset.mobileSection); });
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-mobile-mode]'), function (button) {
          button.addEventListener('click', function () {
            var map = { flow: 'btnModeFlow', edit: 'btnModeEdit', grid: 'btnModeGrid' };
            var source = document.getElementById(map[button.dataset.mobileMode]);
            if (canvasView.active) setCanvasViewActive(false);
            if (source) source.click();
            closeMobileSheet();
          });
        });

        document.getElementById('btnMobileOperator').addEventListener('click', function () { openMobileSheet('effect', 'pOperator'); });
        document.getElementById('btnMobileTarget').addEventListener('click', function () { openMobileSheet('apply', 'pBatchProfile'); });
        document.getElementById('btnMobileType').addEventListener('click', function () { openMobileSheet('text', 'typographyControls'); });
        document.getElementById('btnOpenGridSettings').addEventListener('click', function () {
          if (matchMedia('(max-width: 760px)').matches) {
            openMobileSheet('compose', 'pGridEnabled');
          } else {
            openDesktopSection('compose');
            requestAnimationFrame(function () {
              var gridBlock = document.getElementById('gridControlBlock');
              if (gridBlock) gridBlock.scrollIntoView({ block: 'center', behavior: uiScrollBehavior() });
            });
          }
        });
        document.getElementById('btnMobileMenu').addEventListener('click', function () {
          if (controlPanel.classList.contains('mobile-open')) closeMobileSheet();
          else openMobileSheet(mobileActiveSection);
        });
        document.getElementById('btnMobileSheetClose').addEventListener('click', closeMobileSheet);
        document.getElementById('btnMobileSheetBack').addEventListener('click', closeMobileSheet);
        document.getElementById('btnMobileParameterSearch').addEventListener('click', openParameterSearch);
        document.getElementById('btnMobileUndo').addEventListener('click', undo);
        document.getElementById('btnMobileRedo').addEventListener('click', redo);
        document.getElementById('btnMobilePreview').addEventListener('click', function () { document.getElementById('btnPreview').click(); });
        document.getElementById('btnHeaderUndo').addEventListener('click', undo);
        document.getElementById('btnHeaderRedo').addEventListener('click', redo);
        document.getElementById('btnHeaderPreview').addEventListener('click', function () { document.getElementById('btnPreview').click(); });
        document.getElementById('btnHeaderExport').addEventListener('click', function () { openDesktopSection('export'); });

        if (projectMenu) projectMenu.addEventListener('toggle', function () {
          syncProjectMenuA11y();
          if (!projectMenu.open) cancelNewProjectConfirmation(false);
        });
        if (mobileProjectButton) mobileProjectButton.addEventListener('click', function () {
          if (!projectMenu) return;
          var shouldOpen = !projectMenu.open;
          if (!shouldOpen) {
            closeProjectMenu(false);
            return;
          }
          if (shouldOpen && controlPanel && controlPanel.classList.contains('mobile-open')) closeMobileSheet();
          projectMenu.open = shouldOpen;
          syncProjectMenuA11y();
          if (shouldOpen) requestAnimationFrame(function () {
            var firstAction = projectMenu.querySelector('[data-project-proxy]');
            if (firstAction) firstAction.focus({ preventScroll: true });
          });
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-project-proxy]'), function (button) {
          button.addEventListener('click', function () {
            var source = document.getElementById(button.dataset.projectProxy);
            if (source) source.click();
            // Share is asynchronous. Keep its visible proxy open so copied /
            // failed feedback is not written only to the hidden source button.
            // Save also stays open so the user can see that file generation ran.
            if (button.dataset.projectProxy !== 'btnShare'
              && button.dataset.projectProxy !== 'btnSaveProj'
              && button.dataset.projectProxy !== 'btnLoadProj'
              && button.dataset.projectProxy !== 'btnNew') closeProjectMenu(true);
          });
        });
        document.addEventListener('pointerdown', function (event) {
          if (!projectMenu || !projectMenu.open) return;
          if (manualCopyOverlay && !manualCopyOverlay.hidden && manualCopyOverlay.contains(event.target)) return;
          if (projectMenu.contains(event.target) || event.target === mobileProjectButton) return;
          closeProjectMenu(false);
        });

        var textArea = document.getElementById('textInput');
        textArea.addEventListener('focus', function () {
          setMobileKeyboardFocus(true, textArea);
        });
        textArea.addEventListener('blur', function () {
          setMobileKeyboardFocus(false);
        });

        var sheetNav = document.querySelector('.mobile-sheet-nav');
        var sheetDragStart = 0;
        var sheetDragDistance = 0;
        if (sheetNav) {
          sheetNav.addEventListener('touchstart', function (event) {
            if (!controlPanel.classList.contains('mobile-open') || event.touches.length !== 1) return;
            sheetDragStart = event.touches[0].clientY;
            sheetDragDistance = 0;
            controlPanel.classList.add('mobile-dragging');
          }, { passive: true });
          sheetNav.addEventListener('touchmove', function (event) {
            if (!sheetDragStart || event.touches.length !== 1) return;
            sheetDragDistance = Math.max(0, event.touches[0].clientY - sheetDragStart);
            if (sheetDragDistance > 4) event.preventDefault();
            controlPanel.style.setProperty('--mobile-sheet-drag', Math.min(sheetDragDistance, 180) + 'px');
          }, { passive: false });
          function finishSheetDrag() {
            if (!sheetDragStart) return;
            var shouldClose = sheetDragDistance > 64;
            sheetDragStart = 0;
            sheetDragDistance = 0;
            controlPanel.classList.remove('mobile-dragging');
            controlPanel.style.removeProperty('--mobile-sheet-drag');
            if (shouldClose) closeMobileSheet();
          }
          sheetNav.addEventListener('touchend', finishSheetDrag);
          sheetNav.addEventListener('touchcancel', finishSheetDrag);
        }

        stageWrap.addEventListener('pointerdown', function (event) {
          if (!matchMedia('(max-width: 760px)').matches || !controlPanel.classList.contains('mobile-open')) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          closeMobileSheet();
        }, true);
        document.addEventListener('keydown', function (event) {
          if (event.key !== 'Escape') return;
          if (projectMenu && projectMenu.open) {
            closeProjectMenu(true);
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
          if (controlPanel.classList.contains('mobile-open')) {
            closeMobileSheet();
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        });

        var mobileLayoutQuery = matchMedia('(max-width: 760px)');
        var mobileLayoutWasMobile = mobileLayoutQuery.matches;
        function syncMobileLayoutMode() {
          var isMobile = mobileLayoutQuery.matches;
          if (isMobile && !mobileLayoutWasMobile) {
            // Enter mobile on the section that was genuinely open on desktop.
            var desktopSection = document.querySelector('.panel-section.is-open');
            if (desktopSection && WORKFLOW_STAGES.indexOf(desktopSection.dataset.panelSection) !== -1) {
              setMobileSection(desktopSection.dataset.panelSection);
            }
            controlPanel.classList.remove('mobile-open', 'mobile-text-focus');
          } else if (!isMobile && mobileLayoutWasMobile) {
            // A mobile sheet changes mobileActiveSection without touching the
            // desktop accordion. Reconcile them when the viewport widens.
            controlPanel.classList.remove('mobile-open', 'mobile-text-focus');
            openDesktopSection(mobileActiveSection);
          }
          mobileLayoutWasMobile = isMobile;
          if (isMobile) hydrateVisibleParameterScopes();
          syncMobilePanelA11y(mobileLayoutQuery.matches && controlPanel.classList.contains('mobile-open'));
        }
        if (mobileLayoutQuery.addEventListener) mobileLayoutQuery.addEventListener('change', syncMobileLayoutMode);
        else mobileLayoutQuery.addListener(syncMobileLayoutMode);

        // Numeric companions and mobile steppers are hydrated only for visible
        // scopes after the canonical parameter defaults have been captured.

        setMobileSection(mobileActiveSection);
        syncMobilePanelA11y(false);
        updateContextUI();
      }

      initProgressiveUI();


    return Object.freeze({
      uiScrollBehavior: uiScrollBehavior,
      updateContextUI: updateContextUI,
      storePanelSections: storePanelSections,
      openDesktopSection: openDesktopSection,
      openMobileSheet: openMobileSheet,
      closeMobileSheet: closeMobileSheet,
      mobileStepperPairs: mobileStepperPairs,
      hydrateParameterScope: hydrateParameterScope,
      hydrateVisibleParameterScopes: hydrateVisibleParameterScopes,
      hydrateInitialParameterControls: hydrateInitialParameterControls,
      syncMobileStepperPair: syncMobileStepperPair,
      parameterLabel: parameterLabel,
      scheduleParameterUIRefresh: scheduleParameterUIRefresh,
      initParameterNavigator: initParameterNavigator
    });
  }
  root.TypeDeformerEditorPanels = Object.freeze({ create: create });
})(typeof globalThis !== 'undefined' ? globalThis : this);
