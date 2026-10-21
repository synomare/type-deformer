// Font library controller: owns imported sources, loading generations, relinking and font UI.
// This is authored source. Editor and tests consume this file directly.
(function (root) {
  'use strict';
  function create(options) {
    options = options || {};
      var params = options.params;
      var PARAM_DEFAULTS = options.defaults;
      var pushHistory = options.history;
      var applyStyle = options.applyStyle;
      var refreshConfuseFontCandidates = options.refreshCandidates;
      var markAutosaveDirty = options.dirty;
      var scheduleCompositionDraw = options.redraw;
      var fontSelect = document.getElementById('pFont');
      var fontCustom = document.getElementById('pFontCustom');
      var fontFileInput = document.getElementById('pFontFile');
      var fontFolderInput = document.getElementById('pFontFolder');
      var importedFontSelect = document.getElementById('pImportedFont');
      var btnFontFile = document.getElementById('btnFontFile');
      var btnFontFolder = document.getElementById('btnFontFolder');
      var btnSystemFonts = document.getElementById('btnSystemFonts');
      var btnFontCustomClear = document.getElementById('btnFontCustomClear');
      var fontStatus = document.getElementById('fontStatus');
      var runtimeFontFaces = [];
      var fontRegistry = TypeDeformerFontRegistry.create({
        read: TypeDeformerFontLoading.read, prepare: TypeDeformerFontLoading.prepare, loadFace: TypeDeformerFontLoading.loadFace,
        install: function (face) { document.fonts.add(face); }, uninstall: function (face) { document.fonts.delete(face); },
        register: function (record) { return options.registerAxes(record); },
        ready: function (record, face) {
          runtimeFontFaces.push(face); registerRuntimeFont(record.family, record.label, 'file');
          if (globalThis.TypeDeformerFieldMaterials) globalThis.TypeDeformerFieldMaterials.invalidateSources();
          if (globalThis.TypeDeformerTextLayout) globalThis.TypeDeformerTextLayout.invalidate();
        },
        resolved: function (pending, record) {
          var selected = importedFontSelect.value === pending, option = runtimeFontOptions.get(pending);
          if (option) option.remove(); runtimeFontOptions.delete(pending);
          delete runtimeFontLabels[pending]; delete runtimeFontSources[pending];
          if (selected) importedFontSelect.value = record.family;
        }
      });
      var studioFontBuffers = fontRegistry.records;
      var runtimeFontFiles = fontRegistry.sources;
      var runtimeFontLoads = fontRegistry.loading;
      var fontSelectionRevision = 0, fontImportRevision = 0, fontRetryFamily = '';
      var runtimeFontOptions = new Map();
      var fontLibrarySearch = document.getElementById('fontLibrarySearch');
      var btnFontRetry = document.getElementById('btnFontRetry');
      var fontRelinkCandidate = null;
      var btnFontRelink = document.createElement('button');
      btnFontRelink.id = 'btnFontRelink'; btnFontRelink.type = 'button'; btnFontRelink.hidden = true;
      btnFontRetry.insertAdjacentElement('afterend', btnFontRelink);
      var runtimeFontLabels = Object.create(null);
      var runtimeFontSources = Object.create(null);
      var fontCustomTimer = null;
      var fontCustomHistoryOpen = false;

      function setFontStatus(message, loaded) {
        btnFontRetry.hidden = true;
        fontStatus.dataset.state = loaded ? 'ready' : 'idle';
        fontStatus.textContent = message;
        fontStatus.classList.toggle('is-loaded', !!loaded);
      }

      function primaryFontName() {
        return (params.fontFamily.split(',')[0] || '').replace(/"/g, '').trim();
      }

      function syncFontStatus() {
        var primary = primaryFontName();
        var dependency = fontRegistry.inspect(params.fontFamily, externalFontAvailability).fonts[0];
        btnFontRelink.hidden = true;
        if (dependency && dependency.blocking) {
          importedFontSelect.value = '';
          setFontStatus(dependency.state === 'relink-required' ? 'Font relink required: 旧Projectの書体を確認できません。同じ書体をImportし、確認して再リンクしてください。' : 'Font file missing: 同じ内容のファイルをImportしてください。名前や保存場所は変わっていても復元できます。', false);
          fontStatus.dataset.state = 'missing';
          return;
        }
        if (runtimeFontLabels[primary]) {
          importedFontSelect.value = primary;
          if (runtimeFontSources[primary] === 'file-pending') {
            setFontStatus('Library: ' + runtimeFontLabels[primary] + ' · 選択すると端末内で読み込みます。', false);
          } else {
            setFontStatus('Active: ' + runtimeFontLabels[primary] + ' · ' + (runtimeFontSources[primary] === 'system' ? '端末のインストール済みフォント' : 'ブラウザ内ライブラリ'), true);
          }
          return;
        }
        importedFontSelect.value = '';
        if (fontSelect.selectedIndex >= 0) {
          setFontStatus('Preset: ' + fontSelect.options[fontSelect.selectedIndex].textContent + (dependency && dependency.state !== 'ready' ? ' · 指定書体は未確認／利用不可。代替書体で表示しています。' : ''), false);
          if (dependency && dependency.state !== 'ready') fontStatus.dataset.state = 'fallback';
        } else if (primary) {
          setFontStatus('Local font name: ' + primary + (dependency && dependency.state === 'ready' ? ' · この端末で利用可能' : ' · 書体が見つかりません。代替書体で表示しています。'), false);
          if (dependency && dependency.state !== 'ready') fontStatus.dataset.state = 'fallback';
        } else {
          setFontStatus('最大4,096書体をLibraryへ一括登録できます。選択した書体だけ端末内で読み込み、サーバーには送信しません。', false);
        }
      }

      function safeFontFamily(value) {
        return String(value || '').replace(/["\\\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      }

      function externalFontAvailability(family) {
        var loaded = false, pending = false;
        if (document.fonts) document.fonts.forEach(function (face) {
          if (String(face.family).replace(/^["']|["']$/g, '') !== family) return;
          if (face.status === 'loaded') loaded = true; else if (face.status === 'loading' || face.status === 'unloaded') pending = true;
        });
        if (loaded) return 'ready';
        // FontFaceSet.check returns true for unknown family names on some
        // browsers. Compare two generic fallbacks before claiming availability.
        var ctx = document.createElement('canvas').getContext('2d'), sample = 'WimQ@0123456789漢字かな';
        if (ctx) {
          var available = ['monospace', 'serif'].some(function (fallback) {
            ctx.font = '72px ' + fallback; var baseline = ctx.measureText(sample).width;
            ctx.font = '72px "' + safeFontFamily(family) + '", ' + fallback;
            return Math.abs(ctx.measureText(sample).width - baseline) > 0.01;
          });
          if (available) return 'ready';
        }
        return pending ? 'loading' : 'fallback';
      }

      function currentFontDependencies() { return options.dependencies(); }
      window.TypeDeformerFontDependencies = Object.freeze({
        collect: TypeDeformerFontRegistry.families,
        manifest: function (value) { return fontRegistry.manifest(value || currentFontDependencies()); },
        restore: function (manifest, value) {
          fontRegistry.restore(manifest); fontSelectionRevision++; fontRelinkCandidate = null; btnFontRelink.hidden = true;
          syncFontStatus(); return fontRegistry.inspect(value || currentFontDependencies(), externalFontAvailability);
        },
        inspect: function (value) { return fontRegistry.inspect(value || currentFontDependencies(), externalFontAvailability); },
        assertReady: function (value) { return fontRegistry.assertReady(value || currentFontDependencies(), externalFontAvailability); },
        relink: function (oldFamily, newFamily, confirmed) { return fontRegistry.relink(oldFamily, newFamily, confirmed); }
      });
      if (document.fonts && document.fonts.addEventListener) {
        document.fonts.addEventListener('loadingdone', function () { if (!fontRelinkCandidate && fontStatus.dataset.state === 'fallback') syncFontStatus(); });
        document.fonts.addEventListener('loadingerror', function () { if (!fontRelinkCandidate && fontStatus.dataset.state === 'fallback') syncFontStatus(); });
      }

      function registerRuntimeFont(family, label, source) {
        runtimeFontLabels[family] = label;
        runtimeFontSources[family] = source;
        var option = runtimeFontOptions.get(family);
        if (!option) { option = document.createElement('option'); option.value = family; runtimeFontOptions.set(family, option); }
        option.textContent = label;
        if (!option.parentNode) importedFontSelect.appendChild(option);
        importedFontSelect.disabled = false;
        fontLibrarySearch.disabled = false;
      }

      function sortRuntimeFontOptions() {
        var current = importedFontSelect.value || primaryFontName();
        var query = fontLibrarySearch.value.trim().normalize('NFKC').toLocaleLowerCase();
        var options = Array.from(runtimeFontOptions.values()).filter(function(option) {
          return option.value === current || !query || option.textContent.normalize('NFKC').toLocaleLowerCase().includes(query);
        });
        options.sort(function(a,b){ return a.textContent.localeCompare(b.textContent, 'ja'); });
        var placeholder = importedFontSelect.options[0];
        placeholder.textContent = query ? (options.length ? options.length + '書体 · 選択して適用' : '該当する書体がありません') : 'Importしたフォントを選択…';
        var fragment = document.createDocumentFragment(); fragment.appendChild(placeholder);
        options.forEach(function(option){ fragment.appendChild(option); });
        importedFontSelect.replaceChildren(fragment);
        importedFontSelect.value = current;
        if (importedFontSelect.selectedIndex < 0) importedFontSelect.value = '';
      }

      function applyImportedFont(family, recordHistory) {
        if (!family || !runtimeFontLabels[family]) return;
        if (recordHistory !== false) pushHistory();
        clearTimeout(fontCustomTimer);
        params.fontFamily = '"' + safeFontFamily(family) + '", ' + PARAM_DEFAULTS.fontFamily;
        fontSelect.selectedIndex = -1;
        fontCustom.value = '';
        applyFontChange();
      }

      function ensureRuntimeFontLoaded(family) {
        return fontRegistry.ensure(family);
      }

      function showFontLoadError(family,error) {
        setFontStatus('Import failed: 「' + runtimeFontLabels[family] + '」 — ' + TypeDeformerFontLoading.message(error) + ' 現在の書体は保持しています。', false);
        fontStatus.dataset.state = 'error';
        fontRetryFamily = family; btnFontRetry.hidden = false;
      }

      function setImportedFont(family) {
        if (!family || !runtimeFontLabels[family]) return Promise.resolve(false);
        var revision = ++fontSelectionRevision;
        fontRelinkCandidate = null; btnFontRelink.hidden = true;
        importedFontSelect.value = family;
        setFontStatus('「' + runtimeFontLabels[family] + '」を端末内で読み込み中…',false);
        fontStatus.dataset.state = 'loading';
        return ensureRuntimeFontLoaded(family).then(function(record) {
          if (revision !== fontSelectionRevision || (importedFontSelect.value !== family && importedFontSelect.value !== record.family)) return false;
          var current = primaryFontName(), status = fontRegistry.inspect(params.fontFamily).fonts[0];
          if (status && status.blocking && current !== record.family) {
            fontRelinkCandidate = { previous: current, family: record.family, label: record.label };
            setFontStatus('Font relink required: 「' + record.label + '」を候補として読み込みました。' + (status.kind === 'legacy' ? '旧Projectの書体と同じか確認して再リンクしてください。' : '保存された書体とは内容が異なります。置き換える場合だけ確認してください。'), false);
            fontStatus.dataset.state = 'missing'; btnFontRelink.textContent = '確認して「' + record.label + '」に再リンク'; btnFontRelink.hidden = false;
            return false;
          }
          applyImportedFont(record.family,true);
          return true;
        }).catch(function(error) {
          if (revision === fontSelectionRevision && importedFontSelect.value === family) showFontLoadError(family,error);
          return false;
        });
      }

      var FONT_IMPORT_LIMITS = Object.freeze({
        maxFiles: 4096,
        maxFileBytes: 128 * 1024 * 1024,
        maxTotalBytes: 8 * 1024 * 1024 * 1024
      });

      function fontImportPlan(fileList) {
        var allFiles = Array.prototype.slice.call(fileList || []);
        var valid = allFiles.filter(function (file) { return !/^\._/.test(file.name || '') && (/\.(otf|ttf|woff2?|ttc|otc)$/i.test(file.name || '') || /^(font\/|application\/(?:font-|x-font-))/.test(file.type || ''));  });
        var totalBytes = valid.reduce(function (sum, file) { return sum + file.size; }, 0);
        var issue = '';
        if (!valid.length) issue = 'empty';
        else if (valid.some(function(file){return !Number.isFinite(file.size) || file.size <= 0;})) issue = 'unreadable';
        else if (valid.length > FONT_IMPORT_LIMITS.maxFiles) issue = 'count';
        else if (totalBytes > FONT_IMPORT_LIMITS.maxTotalBytes) issue = 'total';
        else if (valid.some(function (file) { return file.size > FONT_IMPORT_LIMITS.maxFileBytes; })) issue = 'file';
        return { files: valid, totalBytes: totalBytes, issue: issue };
      }

      window.TypeDeformerFontImport = Object.freeze({ limits: FONT_IMPORT_LIMITS, plan: fontImportPlan });

      function importFontCollection(fileList, sourceLabel, input) {
        if (!fileList || !fileList.length) return;
        var plan = fontImportPlan(fileList);
        var valid = plan.files;
        if (!valid.length) {
          setFontStatus('Import failed: OTF / TTF / WOFF / WOFF2 / TTC / OTCを選択してください。ZIPはFilesで展開してから選びます。', false);
          fontStatus.dataset.state = 'error';
          input.value = '';
          return;
        }
        if (plan.issue) {
          setFontStatus(plan.issue === 'unreadable' ? 'Import failed: 空のファイルが含まれています。Filesで端末にダウンロードしてから再選択してください。' : 'Import failed: 最大4,096書体・合計8GB・1ファイル128MBまでです。', false);
          fontStatus.dataset.state = 'error';
          input.value = '';
          return;
        }
        if (typeof FontFace === 'undefined' || !document.fonts) {
          setFontStatus('Import failed: このブラウザはフォントファイル読込に対応していません。', false);
          input.value = '';
          return;
        }
        var importRevision = ++fontImportRevision, selectionRevision = fontSelectionRevision;
        fontLibrarySearch.value = '';
        setFontStatus(sourceLabel + 'をLibraryへ登録中… 0 / ' + valid.length, false);
        var added = 0;
        var existing = 0;
        var index = 0, firstFamily = '';
        function registerChunk() {
          if (importRevision !== fontImportRevision) return;
          var stop = Math.min(valid.length, index + 128);
          for (; index < stop; index++) {
            var file = valid[index];
            // Directory scans stay lazy. The temporary menu ID is never saved;
            // SHA-256 identity is assigned only after reading a selected face.
            var family = fontRegistry.addSource({ file: file, label: file.name, origin: 'file' });
            if (!firstFamily) firstFamily = family;
            registerRuntimeFont(family, file.name, 'file-pending');
            added++;
          }
          setFontStatus(sourceLabel + 'をLibraryへ登録中… ' + index + ' / ' + valid.length, false);
          if (index < valid.length) {
            setTimeout(registerChunk, 0);
            return;
          }
          sortRuntimeFontOptions();
          var current = primaryFontName();
          var resultText = added + '書体をLibraryへ追加' + (existing ? '・' + existing + '件は登録済み' : '');
          if (valid.length === 1 && selectionRevision === fontSelectionRevision) {
            setImportedFont(firstFamily);
          } else {
            setFontStatus(resultText + '。Libraryから選ぶと、その書体だけ端末内で読み込みます。', added > 0 || existing > 0);
            if (/^Type Deformer /.test(current) && !studioFontBuffers.has(current)) {
              fontStatus.textContent += ' 使用中の書体は未解決です。同じ書体を選択して再リンクしてください。';
              fontStatus.dataset.state = 'missing';
            }
          }
        }
        registerChunk();
      }

      function applyFontChange() {
        fontSelectionRevision++;
        if (globalThis.TypeDeformerTextLayout) globalThis.TypeDeformerTextLayout.invalidate();
        applyStyle();
        refreshConfuseFontCandidates();
        markAutosaveDirty();
        scheduleCompositionDraw();
        syncFontStatus();
      }

      function applyCustomFontName() {
        var value = fontCustom.value.trim().replace(/["']/g, '');
        if (value) {
          var fallback = fontSelect.selectedIndex >= 0 ? fontSelect.value : PARAM_DEFAULTS.fontFamily;
          params.fontFamily = '"' + value.slice(0, 180) + '", ' + fallback;
          fontSelect.selectedIndex = -1;
        } else {
          if (fontSelect.selectedIndex < 0) fontSelect.selectedIndex = 0;
          params.fontFamily = fontSelect.value;
        }
        importedFontSelect.value = '';
        applyFontChange();
      }

      fontSelect.addEventListener('change', function (e) {
        pushHistory();
        clearTimeout(fontCustomTimer);
        fontCustom.value = '';
        params.fontFamily = e.target.value;
        importedFontSelect.value = '';
        applyFontChange();
      });

      importedFontSelect.addEventListener('change', function () {
        setImportedFont(importedFontSelect.value);
      });

      fontCustom.addEventListener('focus', function () { fontCustomHistoryOpen = false; });
      fontCustom.addEventListener('input', function () {
        fontSelectionRevision++;
        if (!fontCustomHistoryOpen) {
          pushHistory();
          fontCustomHistoryOpen = true;
        }
        clearTimeout(fontCustomTimer);
        fontCustomTimer = setTimeout(applyCustomFontName, 180);
      });
      fontCustom.addEventListener('change', function () {
        clearTimeout(fontCustomTimer);
        applyCustomFontName();
        fontCustomHistoryOpen = false;
      });

      btnFontCustomClear.addEventListener('click', function () {
        if (!fontCustom.value && fontSelect.selectedIndex >= 0) return;
        pushHistory();
        clearTimeout(fontCustomTimer);
        fontCustom.value = '';
        fontSelect.selectedIndex = 0;
        params.fontFamily = fontSelect.value;
        importedFontSelect.value = '';
        applyFontChange();
      });

      fontLibrarySearch.addEventListener('input', sortRuntimeFontOptions);
      btnFontRetry.addEventListener('click', function(){ if(fontRetryFamily)setImportedFont(fontRetryFamily); });
      btnFontRelink.addEventListener('click', function () {
        var candidate = fontRelinkCandidate;
        if (!candidate || primaryFontName() !== candidate.previous) return;
        fontRegistry.relink(candidate.previous, candidate.family, true);
        fontRelinkCandidate = null; btnFontRelink.hidden = true;
        applyImportedFont(candidate.family, true);
      });
      btnFontFolder.hidden = !('webkitdirectory' in fontFolderInput);
      btnFontFile.addEventListener('click', function () {
        fontFileInput.value = '';
        fontFileInput.click();
      });
      fontFileInput.addEventListener('change', function () {
        importFontCollection(fontFileInput.files, 'Font files', fontFileInput);
      });
      btnFontFolder.addEventListener('click', function () {
        fontFolderInput.value = '';
        fontFolderInput.click();
      });
      fontFolderInput.addEventListener('change', function () {
        importFontCollection(fontFolderInput.files, 'Font folder', fontFolderInput);
      });

      if (typeof window.queryLocalFonts === 'function') btnSystemFonts.hidden = false;
      btnSystemFonts.addEventListener('click', function () {
        if (typeof window.queryLocalFonts !== 'function') {
          setFontStatus('このブラウザではインストール済みフォントの一覧取得を利用できません。', false);
          return;
        }
        setFontStatus('端末のフォント一覧への許可を待っています…', false);
        window.queryLocalFonts().then(function (fonts) {
          // Keep FontData lazy, but load the selected face's actual bytes so
          // the editor, workers and export frames all use the same typeface.
          var added = 0;
          fonts.forEach(function(font) {
            var label = font.fullName || font.family, name = safeFontFamily(label);
            if (!name || typeof font.blob !== 'function') return;
            var family = fontRegistry.addSource({label:label + ' · Installed',origin:'installed',getFile:function(){return font.blob();}});
            registerRuntimeFont(family,label + ' · Installed','file-pending'); added++;
          });
          sortRuntimeFontOptions();
          syncFontStatus();
          var activeName = primaryFontName();
          setFontStatus(added + '書体をLibraryへ追加しました。検索して選ぶと、その書体だけを読み込みます。', added > 0);
        }).catch(function () {
          setFontStatus('端末フォントの参照が許可されませんでした。Import folderは引き続き使えます。', false);
        });
      });
      document.getElementById('pWeight').addEventListener('change', function (e) {
        pushHistory();
        params.fontWeight = parseInt(e.target.value, 10) || 400;
        applyFontChange();
      });

      function syncFontControls() {
        var isPreset = false;
        for (var j = 0; j < fontSelect.options.length; j++) {
          if (fontSelect.options[j].value === params.fontFamily) { isPreset = true; break; }
        }
        if (isPreset) {
          fontSelect.value = params.fontFamily;
          fontCustom.value = '';
        } else {
          fontSelect.selectedIndex = -1;
          fontCustom.value = (params.fontFamily.split(',')[0] || '').replace(/"/g, '').trim();
        }
        syncFontStatus();
      }

    return Object.freeze({
      records: studioFontBuffers,
      syncFontStatus: syncFontStatus,
      syncFontControls: syncFontControls,
      setImportedFont: setImportedFont,
      requestImport: function () { fontFileInput.value = ''; fontFileInput.click(); },
      acceptRuntimeFont: function (record, face) { runtimeFontFaces.push(face); studioFontBuffers.set(record.family, record); registerRuntimeFont(record.family, record.label, 'file'); }
    });
  }
  root.TypeDeformerFontLibrary = Object.freeze({ create: create });
})(typeof globalThis !== 'undefined' ? globalThis : this);
