(function (root) {
  'use strict';
  const data = root.TypeDeformerPresetData;
  if (!data) return;
  const recipes = data.recipes;
  const addedTime = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;
  const latestAdded = recipes.reduce((latest, recipe) => addedTime(recipe.added) > addedTime(latest) ? recipe.added : latest, '');
  const byId = new Map(recipes.map(recipe => [recipe.id, recipe]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const keep = ['fontFamily', 'fontSize', 'fontWeight', 'fontAxes', 'fontAxesInfo', 'letterSpacing', 'lineHeight',
    'paragraphGap', 'textMeasure', 'align', 'vertical', 'pageLayout', 'pageDepth', 'pageKeepLines', 'pageGutter',
    'pageGap', 'pageOrder', 'textObjects', 'artboard', 'abW', 'abH', 'anchor', 'fit', 'marginPct',
    'exportRegion', 'exportRegionNumber', 'exportScale', 'transparentBg', 'deformedOnly',
    'videoSize', 'videoFps', 'videoDuration', 'videoLoops', 'videoStart', 'videoFormat',
    'gridEnabled', 'gridCols', 'gridAutoRows', 'gridRows', 'gridCellSize', 'gridGap', 'gridLines', 'gridLineBreak',
    'proofCount', 'proofColumns', 'proofMutation', 'proofVariant', 'proofScale', 'proofLabels'];

  function project(id) {
    const recipe = byId.get(id);
    if (!recipe) return null;
    const targets = recipe.targetTexts.map(text => ({ text,
      operators: Object.fromEntries(recipe.operators.map(operator => [operator, true])) }));
    const moment = JSON.stringify({ ...recipe.moment, targets, fonts: recipe.fonts });
    return clone({ app: 'type-deformer', version: recipe.projectVersion ?? data.projectVersion, text: recipe.text,
      params: { ...data.common, ...recipe.params, frozenMoment: moment }, batchProfiles: {}, composition: { enabled: false },
      letters: Array.from({ length: recipe.letterCount }, () => recipe.letter) });
  }

  function prepare(id, current, mode, letterTexts) {
    const result = project(id);
    if (!result || !current) return result;
    result.lookMemory = clone(current.lookMemory || {});
    if (mode === 'example') return result;
    if (!Array.isArray(letterTexts) || letterTexts.length !== current.letters.length) {
      throw new Error('文字の更新が完了してから適用してください。');
    }
    result.text = current.text;
    for (const key of keep) if (Object.hasOwn(current.params, key)) result.params[key] = clone(current.params[key]);
    const template = result.letters[0];
    result.letters = current.letters.map(letter => {
      const state = clone(template);
      if (letter.gc != null) state.gc = letter.gc;
      return state;
    });
    const moment = JSON.parse(result.params.frozenMoment);
    const operators = Object.fromEntries(byId.get(id).operators.map(operator => [operator, true]));
    moment.targets = letterTexts.map(text => ({ text, operators: { ...operators } }));
    moment.logicalWidth = Math.max(1, Number(current.params.abW) || moment.logicalWidth);
    moment.logicalHeight = Math.max(1, Number(current.params.abH) || moment.logicalHeight);
    result.params.frozenMoment = JSON.stringify(moment);
    return result;
  }

  function search(query, family, featured, added) {
    const terms = String(query || '').normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
    return recipes.filter(recipe => (!family || recipe.family === family) && (!featured || recipe.featured)
      && (!added || recipe.added === added)
      && terms.every(term => [recipe.id, recipe.name, recipe.description, ...recipe.labels,
        data.families.find(group => group.id === recipe.family).jp].join(' ').normalize('NFKC').toLowerCase().includes(term)));
  }

  function mount(api) {
    const dialog = document.getElementById('presetLibrary');
    const grid = document.getElementById('presetLibraryGrid');
    const query = document.getElementById('presetLibrarySearch');
    const family = document.getElementById('presetLibraryFamily');
    const count = document.getElementById('presetLibraryCount');
    const status = document.getElementById('presetLibraryStatus');
    const selectedName = document.getElementById('presetLibrarySelected');
    const description = document.getElementById('presetLibraryDescription');
    const operators = document.getElementById('presetLibraryOperators');
    const preview = document.getElementById('presetLibraryPreview');
    const apply = document.getElementById('btnPresetLibraryApply');
    const example = document.getElementById('btnPresetLibraryExample');
    const newButton = document.getElementById('btnPresetLibraryNew');
    const featuredButton = document.getElementById('btnPresetLibraryFeatured');
    const allButton = document.getElementById('btnPresetLibraryAll');
    let selected = '', view = latestAdded ? 'new' : 'featured', opener = null, busy = false, page = 0;
    const pageSize = 48;
    const total = recipes.length;
    document.getElementById('btnPresetLibrary').textContent = total + ' Presets / 画像から選ぶ';
    document.getElementById('presetLibraryTitle').textContent = total + 'のエフェクトプリセット';
    document.getElementById('presetLibraryFamilies').textContent = 'COMBINATION LIBRARY · ' + data.families.length + ' FAMILIES';
    newButton.textContent = '新作' + (latestAdded ? search('', '', false, latestAdded).length : 0) + '案';
    newButton.hidden = !latestAdded;
    featuredButton.textContent = '厳選' + search('', '', true).length + '案';
    allButton.textContent = '全' + total + '案';
    const pager = document.createElement('nav'); pager.className = 'preset-library-pager'; pager.setAttribute('aria-label', 'Presetページ');
    const previous = document.createElement('button'); previous.type = 'button'; previous.textContent = '← 前へ';
    const pageStatus = document.createElement('output'); pageStatus.setAttribute('aria-live', 'polite');
    const next = document.createElement('button'); next.type = 'button'; next.textContent = '次へ →';
    pager.append(previous, pageStatus, next); grid.insertAdjacentElement('afterend', pager);
    const imagePath = recipe => 'assets/presets/' + recipe.id + '.jpg';
    for (const group of data.families) {
      const option = document.createElement('option');
      option.value = group.id; option.textContent = group.jp + ' · ' + search('', group.id, false).length; family.appendChild(option);
    }
    function select(id) {
      const recipe = byId.get(id);
      if (!recipe) return;
      selected = id;
      api.select(id);
      selectedName.textContent = String(recipe.n).padStart(3, '0') + ' / ' + recipe.name;
      description.textContent = recipe.description;
      operators.textContent = recipe.labels.join(' + ');
      preview.src = imagePath(recipe); preview.alt = recipe.name + 'の実描画'; preview.hidden = false;
      apply.disabled = example.disabled = false;
      status.textContent = '';
      for (const card of grid.querySelectorAll('button[data-preset-id]')) card.setAttribute('aria-pressed', String(card.dataset.presetId === selected));
    }
    function render(resetPage = true) {
      const results = search(query.value, family.value, view === 'featured', view === 'new' ? latestAdded : '');
      if (resetPage) page = 0;
      const pages = Math.max(1, Math.ceil(results.length / pageSize));
      page = Math.max(0, Math.min(page, pages - 1));
      const visible = results.slice(page * pageSize, (page + 1) * pageSize);
      grid.replaceChildren();
      for (const recipe of visible) {
        const card = document.createElement('button');
        card.type = 'button'; card.className = 'preset-library-card'; card.dataset.presetId = recipe.id;
        card.setAttribute('aria-label', String(recipe.n).padStart(3, '0') + ' ' + recipe.name);
        card.setAttribute('aria-pressed', String(recipe.id === selected));
        const img = document.createElement('img');
        img.src = imagePath(recipe); img.alt = ''; img.width = 600; img.height = 370; img.loading = 'lazy'; img.decoding = 'async';
        const label = document.createElement('span');
        label.className = 'preset-library-card-name'; label.textContent = String(recipe.n).padStart(3, '0') + ' / ' + recipe.name;
        const detail = document.createElement('span');
        detail.className = 'preset-library-card-operators'; detail.textContent = recipe.labels.join(' + ');
        card.append(img, label, detail); grid.appendChild(card);
      }
      if (!results.length) {
        const empty = document.createElement('div'); empty.className = 'preset-library-empty';
        const message = document.createElement('p'); message.textContent = '一致するプリセットがありません。';
        const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = '条件を解除して' + total + '案を表示';
        reset.addEventListener('click', () => { query.value = ''; family.value = ''; view = 'all'; render(); query.focus(); });
        empty.append(message, reset); grid.appendChild(empty);
      }
      count.textContent = results.length + ' / ' + total + ' presets';
      pageStatus.textContent = results.length ? (page + 1) + ' / ' + pages : '0 / 0';
      previous.disabled = !results.length || page === 0;
      next.disabled = !results.length || page >= pages - 1;
      newButton.setAttribute('aria-pressed', String(view === 'new'));
      featuredButton.setAttribute('aria-pressed', String(view === 'featured')); allButton.setAttribute('aria-pressed', String(view === 'all'));
      grid.scrollTop = 0;
      return results;
    }
    function close() { if (!busy) dialog.close(); }
    async function adopt(mode) {
      if (busy || !selected) return;
      busy = true; apply.disabled = example.disabled = true;
      status.textContent = '適用中…';
      await new Promise(resolve => requestAnimationFrame(resolve));
      try {
        api.apply(selected, mode);
        busy = false; dialog.close();
      } catch (error) {
        status.textContent = error.message || '適用できませんでした。'; busy = false;
      } finally { apply.disabled = example.disabled = !selected; }
    }
    grid.addEventListener('click', event => { const card = event.target.closest('button[data-preset-id]'); if (card) select(card.dataset.presetId); });
    previous.addEventListener('click', () => { page--; render(false); grid.focus({ preventScroll: true }); });
    next.addEventListener('click', () => { page++; render(false); grid.focus({ preventScroll: true }); });
    query.addEventListener('input', () => render(true)); family.addEventListener('change', () => render(true));
    newButton.addEventListener('click', () => { view = 'new'; render(true); });
    featuredButton.addEventListener('click', () => { view = 'featured'; render(true); });
    allButton.addEventListener('click', () => { view = 'all'; render(true); });
    apply.addEventListener('click', () => adopt('current')); example.addEventListener('click', () => adopt('example'));
    document.getElementById('btnPresetLibraryClose').addEventListener('click', close);
    // Keep canvas shortcuts and the mobile sheet's Escape handler outside this modal.
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    dialog.addEventListener('close', () => { if (opener && opener.isConnected) opener.focus({ preventScroll: true }); });
    return { open(id) {
      opener = document.activeElement;
      const results = render(true);
      select(byId.has(id) ? id : selected || (results[0] || recipes[0]).id);
      dialog.showModal(); query.focus({ preventScroll: true });
    } };
  }
  root.TypeDeformerPresets = { recipes, families: data.families, get: id => byId.get(id), project, prepare, search, mount };
})(typeof globalThis !== 'undefined' ? globalThis : this);
