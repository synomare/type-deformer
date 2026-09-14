/* Isolated, transactional artwork exploration. No dependency or network service. */
(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, lo, hi, fallback) => Number.isFinite(Number(value))
    ? Math.max(lo, Math.min(hi, Number(value))) : fallback;
  function parse(value) {
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch (_) { return null; }
  }
  function normalize(raw) {
    raw = parse(raw) || {};
    const keys = new Set();
    return {
      schema: 1, mode: raw.mode === 'parameters' ? 'parameters' : 'time',
      operator: typeof raw.operator === 'string' ? raw.operator.slice(0, 60) : '',
      from: clamp(raw.from, 0, 1, 0), to: clamp(raw.to, 0, 1, 1),
      seconds: clamp(raw.seconds, 0.5, 120, 8), position: clamp(raw.position, 0, 1, 0),
      axes: (Array.isArray(raw.axes) ? raw.axes : []).filter(axis => {
        if (!axis || typeof axis.key !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(axis.key)
          || keys.has(axis.key) || !Number.isFinite(axis.start) || !Number.isFinite(axis.end)) return false;
        keys.add(axis.key); return true;
      }).slice(0, 2).map(axis => ({ key: axis.key, start: axis.start, end: axis.end }))
    };
  }
  function normalizeMoment(raw) {
    raw = parse(raw);
    if (!raw || raw.schema !== 1) return null;
    return {
      schema: 1, phase: clamp(raw.phase, 0, 1, 0), surfacePhase: clamp(raw.surfacePhase, 0, 1e9, 0),
      dataMoshFrame: clamp(raw.dataMoshFrame, 0, 1e9, 0),
      ...(raw.blobTrack ? {blobTrack:normalizeBlobTrack(raw.blobTrack)} : {}),
      quality: ['performance', 'normal', 'high'].includes(raw.quality) ? raw.quality : 'normal',
      logicalWidth: clamp(raw.logicalWidth, 1, 100000, 1080), logicalHeight: clamp(raw.logicalHeight, 1, 100000, 1080),
      targets: (Array.isArray(raw.targets) ? raw.targets : []).slice(0, 4096).map(item => ({
        text: typeof item?.text === 'string' ? item.text.slice(0, 100) : '',
        operators: Object.fromEntries(Object.entries(item?.operators || {}).filter(([key, value]) => /^[a-z][a-zA-Z0-9]*$/.test(key) && typeof value === 'boolean'))
      })),
      fonts: (Array.isArray(raw.fonts) ? raw.fonts : []).filter(f => f && typeof f.family === 'string')
        .slice(0, 256).map(f => ({ family: f.family.slice(0, 300), label: String(f.label || '').slice(0, 300) }))
    };
  }
  function normalizeBlobTrack(raw) {
    const fields=['id','cx','cy','vx','vy','area','angle','eccentricity','lost'];
    const blobs=(Array.isArray(raw.blobs)?raw.blobs:[]).slice(0,64).map(blob=>Object.fromEntries(fields.filter(key=>Number.isFinite(blob[key])).map(key=>[key,blob[key]])));
    const trails={};for(const blob of blobs){const source=raw.trails?.[blob.id];if(Array.isArray(source))trails[blob.id]=source.slice(-512).filter(p=>Number.isFinite(p.cx)&&Number.isFinite(p.cy)).map(p=>({cx:p.cx,cy:p.cy}));}
    return {blobs,trails};
  }
  function boundedAxes(config, available) {
    return normalize(config).axes.map(axis => {
      const spec = available.find(item => item.key === axis.key && !item.disabled);
      if (!spec) return null;
      const snap = value => Math.max(spec.min, Math.min(spec.max,
        Number((spec.min + Math.round((clamp(value, spec.min, spec.max, spec.value) - spec.min) / spec.step) * spec.step).toFixed(8))));
      return { ...axis, start: snap(axis.start), end: snap(axis.end), ...spec, snap };
    }).filter(Boolean).slice(0, 2);
  }
  function variant(base, config, available, position, targetKeys) {
    const state = clone(base), settings = normalize(config), t = clamp(position, 0, 1, 0);
    const moment = normalizeMoment(state.params.frozenMoment) || normalizeMoment({ schema: 1 });
    const values = {};
    if (settings.mode === 'time') {
      const phase = settings.from + (settings.to - settings.from) * t;
      state.composition.phase = phase;
      moment.phase = phase;
      moment.surfacePhase = phase;
    } else {
      const axes = boundedAxes(settings, available);
      if (!axes.length) throw new Error('現在の文法で使用できる数値軸を選んでください。');
      for (const axis of axes) {
        const value = axis.snap(axis.start + (axis.end - axis.start) * t);
        values[axis.key] = value;
        // Only profiles used by already-applied target glyphs participate.
        for (const key of targetKeys) {
          if (key === 'all') state.params[axis.key] = value;
          else {
            if (!state.batchProfiles[key]) state.batchProfiles[key] = {};
            state.batchProfiles[key][axis.key] = value;
          }
        }
      }
    }
    settings.position = t;
    state.params.explorationSettings = JSON.stringify(settings);
    state.params.frozenMoment = JSON.stringify(moment);
    return { state, position: t, values, phase: state.composition.phase };
  }
  function positions(count, config) {
    count = [6, 9, 12].includes(count) ? count : 9;
    const c = normalize(config);
    const fullLoop = c.mode === 'time' && Math.abs(c.to - c.from) === 1;
    return Array.from({ length: count }, (_, i) => i / (fullLoop ? count : count - 1));
  }

  // A single renderer lives only for the active session. Cancellation destroys
  // its document, pools, queued jobs and font buffers rather than sharing global
  // params/leases with the artwork. Validate source as well as request identity;
  // file:// uses an opaque origin, so checking origin alone is insufficient.
  function rendererClient(api) {
    let frame = null, ready = null, seq = 0, pending = new Map(), loadTimer = null, rejectLoad = null;
    const token = Array.from(root.crypto.getRandomValues(new Uint32Array(4))).join('-');
    function receive(event) {
      if (!frame || event.source !== frame.contentWindow || event.data?.token !== token) return;
      const message = event.data, request = pending.get(message.id);
      if (!request) return;
      if (message.progress) { request.progress?.(message.progress); return; }
      pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error)); else request.resolve(message.result);
    }
    root.addEventListener('message', receive);
    function call(type, payload, progress) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => {
          pending.delete(id); reject(new Error('字形の準備が時間内に完了しませんでした。文字数や複製数を減らして再試行してください。'));
        }, 120000);
        pending.set(id, { resolve, reject, progress, timer });
        frame.contentWindow.postMessage({ channel: 'td-exploration', token, id, type, payload }, '*');
      });
    }
    function start() {
      if (ready) return ready;
      ready = new Promise((resolve, reject) => {
        rejectLoad = reject;
        loadTimer = setTimeout(() => reject(new Error('比較用の描画画面を読み込めませんでした。接続を確認して再試行してください。')), 30000);
        frame = document.createElement('iframe');
        frame.title = 'Type Deformer isolated renderer'; frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
        // Non-zero layout is necessary to measure native fonts in Chromium and Safari.
        Object.assign(frame.style, { position: 'fixed', left: '0', top: '0', width: api.viewport().windowWidth + 'px',
          height: api.viewport().windowHeight + 'px', opacity: '0', pointerEvents: 'none', zIndex: '-1000', border: '0' });
        const url = new URL(location.href); url.hash = ''; url.search = '?td-renderer=1';
        frame.src = url.href;
        frame.onload = () => { clearTimeout(loadTimer); loadTimer = null; call('init', { fonts: api.fonts() }).then(resolve, reject); };
        frame.onerror = () => { clearTimeout(loadTimer); loadTimer = null; reject(new Error('比較用の描画画面を読み込めませんでした。')); };
        document.body.appendChild(frame);
      });
      return ready;
    }
    return {
      async render(payload, progress) { await start(); return call('render', payload, progress); },
      dispose() {
        clearTimeout(loadTimer); loadTimer = null; rejectLoad?.(new Error('生成を取り消しました。')); rejectLoad = null;
        for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('生成を取り消しました。')); }
        pending.clear(); frame?.remove(); frame = null; ready = null;
        root.removeEventListener('message', receive);
      }
    };
  }
  function installRenderer(api) {
    let busy = false, establishedToken = null;
    root.addEventListener('message', async event => {
      const m = event.data;
      if (event.source !== root.parent || m?.channel !== 'td-exploration' || typeof m.token !== 'string') return;
      if (establishedToken && m.token !== establishedToken) return;
      if (!establishedToken && m.type !== 'init') return;
      establishedToken = m.token;
      const respond = fields => event.source.postMessage({ token: m.token, id: m.id, ...fields }, '*');
      if (busy) { respond({ error: '描画中です。前の候補を待ってください。' }); return; }
      busy = true;
      try {
        const result = m.type === 'init' ? await api.importFonts(m.payload.fonts)
          : m.type === 'render' ? await api.render(m.payload, progress => respond({ progress }))
            : (() => { throw new Error('Unknown exploration request'); })();
        respond({ result });
      } catch (error) { respond({ error: error.message || '候補を描画できませんでした。' }); }
      finally { busy = false; }
    });
  }

  function mount(api) {
    const host = document.querySelector('[data-panel-section="compose"] > .section-body');
    const panel = document.createElement('section'); panel.className = 'studio-panel';
    panel.setAttribute('aria-label', '瞬間の探索');
    panel.innerHTML = `<div class="studio-title"><span>EXPLORE</span><strong>動かして、形を見つける</strong></div>
      <div class="studio-transport">
        <button type="button" data-studio="play" aria-pressed="false">探索する</button>
        <button type="button" data-studio="capture" class="primary">この瞬間を残す</button>
      </div>
      <div class="studio-scrub"><button type="button" data-studio="back" aria-label="探索を1ステップ戻す">−</button>
        <input data-studio="position" type="range" min="0" max="1" step="0.001" value="0" aria-label="探索位置">
        <button type="button" data-studio="forward" aria-label="探索を1ステップ進める">＋</button></div>
      <div class="studio-actions"><button type="button" data-studio="adopt" disabled>この形を採用</button>
        <button type="button" data-studio="cancel" disabled>元作品へ戻る</button><button type="button" data-studio="sheet">一覧で比較</button></div>
      <p data-studio="status" class="studio-status" role="status">元作品を保持して探索します。採用するまで設定は変わりません。</p>
      <details class="studio-settings"><summary>探索の設定 <span data-studio="summary">時間 · 8秒</span></summary>
        <label>動かすもの<select data-studio="mode"><option value="time">時間 / Composeの位相</option><option value="parameters">Operatorのパラメーター</option></select></label>
        <div data-studio="time" class="studio-pair"><label>開始位相<input data-studio="from" type="number" min="0" max="1" step="0.01" value="0"></label>
          <label>終了位相<input data-studio="to" type="number" min="0" max="1" step="0.01" value="1"></label></div>
        <div data-studio="parameters" hidden><label>適用済みOperator<select data-studio="operator"></select></label>
          <div data-studio="axes"></div><p data-studio="axis-hint" class="studio-status"></p></div>
        <div class="studio-pair"><label>片道の秒数<input data-studio="seconds" type="number" min="0.5" max="120" step="0.5" value="8"></label>
          <label>保存先<select data-studio="slot"><option value="auto">空いているLook</option><option value="0">Look A</option><option value="1">Look B</option><option value="2">Look C</option><option value="3">Look D</option></select></label></div>
        <p class="studio-status">数値軸は最大2本。現在の文法で働かない軸は除外します。保存した形はLook Memoryから復元・編集できます。</p>
      </details>`;
    host.prepend(panel);
    const el = key => panel.querySelector(`[data-studio="${key}"]`);
    const overlay = document.createElement('img'); overlay.className = 'studio-artwork'; overlay.alt = '探索中の一時プレビュー'; overlay.hidden = true;
    document.getElementById('stageFrame').appendChild(overlay);
    const badge = document.createElement('span'); badge.className = 'studio-preview-badge'; badge.textContent = '探索プレビュー · 未採用'; badge.hidden = true;
    document.getElementById('stageFrame').appendChild(badge);
    const dialog = document.createElement('dialog'); dialog.className = 'studio-dialog';
    dialog.innerHTML = `<header><div><small>DESIGN SPACE SHEET</small><h2>同じ乱数、同じ画角で比べる</h2></div><button type="button" data-sheet="close">閉じる</button></header>
      <p data-sheet="status" role="status"></p><div class="studio-sheet-actions"><button type="button" data-sheet="cancel">生成を取消</button>
        <button type="button" data-sheet="png" disabled>PNG sheet</button></div><div data-sheet="grid" class="studio-grid"></div>
      <section data-sheet="detail" class="studio-detail" hidden><h3 data-sheet="label"></h3><img data-sheet="image" alt="選択した候補の拡大表示">
        <div class="studio-sheet-actions"><button type="button" data-sheet="adopt" class="primary">この候補を採用</button><button type="button" data-sheet="save">Lookへ保存</button><button type="button" data-sheet="back">一覧へ戻る</button></div></section>`;
    document.body.appendChild(dialog);
    const sheet = key => dialog.querySelector(`[data-sheet="${key}"]`);
    let config = normalize(api.settings()), source = null, client = null, accepted = null, candidates = [], selected = -1;
    let playing = false, direction = 1, job = 0, displayRevision = 0, timer = null, inFlight = false, desired = null, generation = false, viewport = null, saving = false;
    let available = [], targetKeys = [], lastSetting = '', replacement = null, sheetSource = null, sheetViewport = null;
    function status(text, error = false) { el('status').textContent = text; el('status').dataset.state = error ? 'error' : ''; }
    function busyUI() {
      el('play').textContent = playing ? '一時停止' : accepted ? '探索を再開' : '探索する';
      el('play').setAttribute('aria-pressed', String(playing));
      el('adopt').disabled = !accepted || generation; el('cancel').disabled = !source && !generation && !inFlight;
      el('sheet').disabled = generation; sheet('cancel').disabled = !generation;
      sheet('png').disabled = !candidates.length || generation;
      document.getElementById('btnProofPng').disabled = !candidates.length || generation;
      document.getElementById('btnProofAdopt').disabled = selected < 0 || generation;
      el('summary').textContent = (config.mode === 'time' ? '時間' : '数値軸') + ' · ' + config.seconds + '秒';
    }
    function refreshAxes() {
      available = api.axes(config.operator);
      const valid = available.filter(axis => !axis.disabled);
      if (!config.axes.length && valid.length) config.axes = valid.slice(0, 1).map(axis => ({ key: axis.key, start: axis.value,
        end: Math.min(axis.max, axis.value + (axis.max - axis.min) * 0.3) }));
      el('axes').textContent = '';
      for (let i = 0; i < 2; i++) {
        const wrapper = document.createElement('div'); wrapper.className = 'studio-axis';
        const label = document.createElement('label'); label.textContent = '数値軸 ' + (i + 1);
        const select = document.createElement('select'); select.setAttribute('aria-label', '数値軸 ' + (i + 1));
        select.add(new Option('使用しない', ''));
        valid.forEach(axis => select.add(new Option(axis.label, axis.key)));
        const current = config.axes[i]; select.value = current?.key || '';
        label.appendChild(select); wrapper.appendChild(label);
        const pair = document.createElement('div'); pair.className = 'studio-pair';
        const spec = valid.find(axis => axis.key === select.value);
        for (const side of ['start', 'end']) {
          const l = document.createElement('label'); l.textContent = side === 'start' ? '開始値' : '終了値';
          const input = document.createElement('input'); input.type = 'number'; input.disabled = !spec;
          input.setAttribute('aria-label', '数値軸 ' + (i + 1) + ' ' + l.textContent);
          if (spec) { input.min = spec.min; input.max = spec.max; input.step = spec.step; input.value = current?.[side] ?? spec.value; }
          input.addEventListener('change', () => {
            if (!config.axes[i]) return;
            config.axes[i][side] = clamp(input.value, spec.min, spec.max, spec.value); input.value = config.axes[i][side]; changed();
          }); l.appendChild(input); pair.appendChild(l);
        }
        select.addEventListener('change', () => {
          const spec = valid.find(axis => axis.key === select.value);
          if (spec) config.axes[i] = { key: spec.key, start: spec.value, end: Math.min(spec.max, spec.value + (spec.max - spec.min) * .3) };
          else config.axes.splice(i, 1);
          config.axes = normalize(config).axes; changed(); refreshAxes();
        });
        wrapper.appendChild(pair); el('axes').appendChild(wrapper);
      }
      const inactive = available.filter(axis => axis.disabled);
      el('axis-hint').textContent = inactive.length ? '休止中の軸を除外: ' + inactive.map(axis => axis.label + '（' + (axis.reason || '現在の文法では使用しません') + '）').join('、')
        : !valid.length ? '現在の文字種Targetへ適用済みのOperatorを選んでください。'
          : '現在の文字種Targetに適用済みの文字を探索します。乱数・文法は固定。';
    }
    function refresh() {
      if (source || generation) return;
      const external = api.settings();
      if (external !== lastSetting) { config = normalize(external); lastSetting = external; }
      const options = api.operators();
      el('operator').textContent = '';
      options.forEach(item => el('operator').add(new Option(item.label, item.id)));
      if (!options.some(item => item.id === config.operator)) { config.operator = options[0]?.id || ''; config.axes = []; }
      el('operator').value = config.operator;
      ['mode', 'from', 'to', 'seconds', 'position'].forEach(key => { el(key).value = config[key]; });
      el('time').hidden = config.mode !== 'time'; el('parameters').hidden = config.mode !== 'parameters';
      refreshAxes(); busyUI();
    }
    function pause() {
      playing = false; clearTimeout(timer); timer = null;
      // The last completed image is the actual visible moment. Do not let an
      // already-running renderer move it after Pause or while saving that image.
      displayRevision++; desired = null; busyUI();
    }
    function dispose() {
      ++job; pause(); client?.dispose(); client = null; inFlight = false; desired = null; generation = false;
    }
    function cancel(message = '探索を取り消しました。元作品は変更していません。') {
      dispose(); source = null; accepted = null; overlay.hidden = true; badge.hidden = true;
      api.previewing(false); status(message); busyUI(); refresh();
    }
    function changed() {
      if (source || generation) cancel('範囲を更新しました。新しい条件で探索できます。');
      config = normalize(config); lastSetting = JSON.stringify(config); api.saveSettings(lastSetting); busyUI();
    }
    async function begin(identity) {
      if (source) { if (!client) client = rendererClient(api); return; }
      api.pause(); api.previewing(true); busyUI();
      const started = performance.now();
      while (identity === job) {
        try { source = api.snapshot(); break; }
        catch (error) {
          if (!/_PENDING$/.test(error.code || '') || performance.now() - started > 90000) { api.previewing(false); throw error; }
          status(error.message); if (generation) sheet('status').textContent = error.message;
          await new Promise(resolve => setTimeout(resolve, 24));
        }
      }
      if (identity !== job) throw new Error('生成を取り消しました。');
      viewport = api.viewport();
      available = api.axes(config.operator); targetKeys = api.targetKeys(config.operator);
      if (config.mode === 'time' && !source.composition.enabled) { source = null; api.previewing(false); throw new Error('時間探索はComposeをApplyしてから使えます。字形だけを動かす場合は「パラメーター」を選んでください。'); }
      if (config.mode === 'parameters' && (!targetKeys.length || !boundedAxes(config, available).length)) {
        source = null; api.previewing(false); throw new Error('適用済みOperatorと、現在の文法で働く数値軸を選んでください。');
      }
      client = rendererClient(api); api.previewing(true); busyUI();
    }
    function take(position) { return variant(source, config, available, position, targetKeys); }
    function label(candidate, index) {
      const values = Object.entries(candidate.values).map(([key, value]) => (available.find(a => a.key === key)?.label || key) + ' ' + Number(value.toFixed(3)));
      return (index == null ? '' : '#' + (index + 1) + ' · ') + (values.length ? values.join(' / ') : '位相 ' + candidate.phase.toFixed(3));
    }
    async function request(position) {
      desired = position;
      if (inFlight || generation) return;
      const identity = job; inFlight = true;
      try { await begin(identity); } catch (e) { if (identity === job) { inFlight = false; pause(); status(e.message, true); } return; }
      while (desired != null && identity === job) {
        const next = desired, revision = displayRevision; desired = null;
        const candidate = take(next);
        status('字形を準備中… 最後の完成形を表示しています。');
        try {
          const result = await client.render({ state: candidate.state, viewport }, text => { if (identity === job && revision === displayRevision) status(text); });
          if (identity !== job) return;
          if (revision !== displayRevision) {
            if (desired == null) status(accepted ? label(accepted) + ' · 停止中・未採用' : '停止しました。元作品を表示しています。');
            continue;
          }
          accepted = { ...candidate, ...result }; overlay.src = result.preview; overlay.hidden = false; badge.hidden = false;
          config.position = next; el('position').value = next;
          status(label(accepted) + ' · 未採用'); busyUI();
        } catch (e) { if (identity === job) { pause(); client?.dispose(); client = null; status(e.message, true); } break; }
      }
      if (identity === job) inFlight = false;
      if (playing && identity === job) timer = setTimeout(tick, 16);
    }
    let lastTick = 0;
    function tick() {
      if (!playing) return;
      const now = performance.now(); let next = config.position + direction * Math.min(.15, (now - lastTick) / 1000 / config.seconds);
      lastTick = now;
      if (next >= 1) { next = 1; direction = -1; } else if (next <= 0) { next = 0; direction = 1; }
      request(next);
    }
    async function adopt(candidate) {
      if (!candidate) return;
      pause();
      try { await api.adopt(candidate.state); cancel('候補を採用しました。Undo 1回で元の作品へ戻せます。'); if (dialog.open) dialog.close(); }
      catch (e) { status(e.message, true); sheet('status').textContent = e.message; }
    }
    async function save(candidate) {
      if (saving) return;
      pause();
      const identity = job;
      saving = true; el('capture').disabled = true; sheet('save').disabled = true;
      try {
        const value = el('slot').value;
        const state = candidate ? candidate.state : api.snapshot();
        let preview = candidate ? candidate.preview : api.preview();
        const choice = value === 'auto' ? api.emptySlot() : Number(value);
        if (choice < 0) throw new Error('Look A–Dはすべて使用中です。「探索の設定」で保存先を選んでください。');
        if (api.slotUsed(choice) && (replacement?.slot !== choice || performance.now() > replacement.until || replacement.state !== JSON.stringify(state))) {
          replacement = { slot: choice, until: performance.now() + 10000, state: JSON.stringify(state) }; status('Look ' + 'ABCD'[choice] + 'を上書きします。10秒以内にもう一度「この瞬間を残す」を押すと確定します。');
          sheet('status').textContent = 'Look ' + 'ABCD'[choice] + 'を上書きします。もう一度「Lookへ保存」で確定。'; return;
        }
        if (candidate) {
          const image = new Image(); image.src = preview; await image.decode();
          const canvas = (globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas')), scale = Math.min(1, 960 / image.width, 600 / image.height);
          canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); preview = canvas.toDataURL('image/jpeg', .72);
        }
        if (identity !== job) throw new Error('編集状態が変わったため保存を取り消しました。Lookは変更していません。');
        api.saveLook(choice, state, preview); replacement = null;
        const message = 'Look ' + 'ABCD'[choice] + 'へ保存しました。元作品は変更していません。';
        status(message); sheet('status').textContent = message;
      } catch (e) { status(e.message, true); sheet('status').textContent = e.message; }
      finally { saving = false; el('capture').disabled = false; sheet('save').disabled = false; }
    }
    function select(index, reveal = false) {
      selected = index; const candidate = candidates[index];
      if (!candidate) return;
      sheet('detail').hidden = false; sheet('label').textContent = label(candidate, index); sheet('image').src = candidate.preview;
      sheet('grid').querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
      if (reveal) { sheet('detail').scrollIntoView({ block: 'start' }); sheet('adopt').focus({ preventScroll: true }); }
      busyUI();
    }
    async function generate() {
      if (generation) return;
      pause();
      if (inFlight) { status('現在の字形準備が完了してから一覧を生成してください。'); return; }
      const identity = ++job; generation = true; candidates = []; selected = -1; sheet('grid').textContent = ''; sheet('detail').hidden = true;
      if (!dialog.open) dialog.showModal();
      sheet('close').focus(); busyUI();
      try {
        await begin(identity); if (identity !== job) return;
        sheetSource = clone(source); sheetViewport = { ...viewport };
        const samples = positions(api.count(), config);
        for (let i = 0; i < samples.length; i++) {
          const candidate = take(samples[i]);
          sheet('status').textContent = '生成中 ' + (i + 1) + ' / ' + samples.length + ' · 元作品を保持';
          const result = await client.render({ state: candidate.state, viewport }, text => {
            sheet('status').textContent = (i + 1) + ' / ' + samples.length + ' · ' + text;
          });
          if (identity !== job) return;
          candidates.push({ ...candidate, ...result });
          const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-pressed', 'false');
          const img = document.createElement('img'); img.src = result.preview; img.alt = label(candidate, i);
          const caption = document.createElement('span'); caption.textContent = label(candidate, i);
          button.append(img, caption); button.addEventListener('click', () => select(i, true)); sheet('grid').appendChild(button);
        }
        sheet('status').textContent = candidates.length + '候補 · Seed ' + source.params.seed + '固定 · 現在のキャンバス画角で比較。クリックで拡大。';
        if (candidates.length) select(Math.floor(candidates.length / 2));
      } catch (e) { if (identity === job) { client?.dispose(); client = null; sheet('status').textContent = e.message; } }
      finally { if (identity === job) { generation = false; busyUI(); } }
    }
    async function exportSheet() {
      if (!candidates.length || generation) { status('一覧を生成してからPNG sheetを保存してください。'); return; }
      // Export the requested sheet even if a different generation starts while
      // the browser is decoding its thumbnails. Never mix two candidate sets.
      const items = candidates.slice(), captions = items.map((candidate, i) => label(candidate, i));
      const source = sheetSource, viewport = sheetViewport, mode = config.mode;
      const columns = api.columns(), scale = api.sheetScale(), width = 1200, labels = api.sheetLabels();
      const gap = 16, margin = 32, cellWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
      const imageHeight = cellWidth * viewport.height / viewport.width;
      const cellHeight = imageHeight + (labels ? 54 : 0), rows = Math.ceil(items.length / columns);
      const canvas = (globalThis.TypeDeformerRenderContext ? globalThis.TypeDeformerRenderContext.createCanvas() : document.createElement('canvas')); canvas.width = width * scale; canvas.height = Math.ceil(100 + rows * (cellHeight + gap) + margin) * scale;
      if (canvas.height > 16384 || canvas.width * canvas.height > 32000000) throw new Error('シートが大きすぎます。Columnsを増やすかScaleを1xにしてください。');
      const ctx = canvas.getContext('2d'); ctx.scale(scale, scale); ctx.fillStyle = source.params.paper; ctx.fillRect(0, 0, width, canvas.height / scale);
      ctx.fillStyle = source.params.ink; ctx.font = '600 18px sans-serif'; ctx.fillText('TYPE DEFORMER / DESIGN SPACE', margin, 40);
      ctx.font = '12px sans-serif'; ctx.fillText('Seed ' + source.params.seed + ' · SAME CAMERA · ' + mode.toUpperCase(), margin, 65);
      for (let i = 0; i < items.length; i++) {
        const image = new Image(); image.src = items[i].preview; await image.decode();
        const x = margin + (i % columns) * (cellWidth + gap), y = 100 + Math.floor(i / columns) * (cellHeight + gap);
        ctx.drawImage(image, x, y, cellWidth, imageHeight); ctx.fillStyle = source.params.ink; ctx.font = '11px sans-serif';
        if (labels) ctx.fillText(captions[i], x, y + imageHeight + 20, cellWidth);
      }
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG sheetを作れませんでした。Scaleを下げてください。');
      api.download(blob, 'type-deformer-design-space.png');
      sheet('status').textContent = '比較用PNGを保存しました。作品の高解像度出力は候補を採用してPNG / SVGから。';
    }
    function safeExport() { exportSheet().catch(e => { sheet('status').textContent = e.message; status(e.message, true); }); }
    el('play').addEventListener('click', () => {
      if (playing) { pause(); status(accepted ? label(accepted) + ' · 停止中・未採用' : '停止しました。元作品を表示しています。'); }
      else { playing = true; lastTick = performance.now(); request(config.position); busyUI(); }
    });
    el('position').addEventListener('input', e => { pause(); request(Number(e.target.value)); });
    el('back').addEventListener('click', () => { pause(); request(Math.max(0, config.position - .01)); });
    el('forward').addEventListener('click', () => { pause(); request(Math.min(1, config.position + .01)); });
    el('capture').addEventListener('click', () => save(accepted));
    el('adopt').addEventListener('click', () => adopt(accepted)); el('cancel').addEventListener('click', () => cancel());
    el('sheet').addEventListener('click', generate);
    ['mode', 'from', 'to', 'seconds'].forEach(key => el(key).addEventListener('change', () => {
      config[key] = key === 'mode' ? el(key).value : Number(el(key).value); changed(); refresh();
    }));
    el('operator').addEventListener('change', () => { config.operator = el('operator').value; config.axes = []; changed(); refreshAxes(); });
    el('slot').addEventListener('change', () => { replacement = null; });
    sheet('close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', () => { if (generation) cancel(); });
    dialog.addEventListener('close', () => { if (generation) cancel(); el('sheet').focus({ preventScroll: true }); });
    sheet('cancel').addEventListener('click', () => { cancel(); sheet('status').textContent = '生成を取り消しました。元作品はそのままです。'; });
    sheet('adopt').addEventListener('click', () => adopt(candidates[selected]));
    sheet('save').addEventListener('click', () => save(candidates[selected]));
    sheet('back').addEventListener('click', () => { sheet('grid').scrollIntoView({ block: 'start' }); sheet('grid').querySelector('button[aria-pressed="true"]')?.focus({ preventScroll: true }); });
    sheet('png').addEventListener('click', safeExport);
    // Ordinary edits always abandon the transient projection first; no hidden
    // candidate may overwrite an independently edited source on later Adopt.
    document.addEventListener('input', e => {
      if ((source || generation) && !panel.contains(e.target) && !dialog.contains(e.target)) cancel('編集へ戻りました。探索中の値は採用していません。');
    }, true);
    document.addEventListener('click', e => {
      if (!(source || generation) || panel.contains(e.target) || dialog.contains(e.target)) return;
      if (e.target.closest('.desktop-workflow-nav, .mobile-dock, .section-toggle, #btnProofPreview, #btnProofPng, #btnProofAdopt')) return;
      if (e.target.closest('button, select, .letter')) cancel('編集へ戻りました。探索中の値は採用していません。');
    }, true);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') replacement = null;
      if ((source || generation) && (e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) cancel();
    }, true);
    document.getElementById('stageFrame').addEventListener('pointerdown', () => { if (source || generation) cancel('キャンバス操作へ戻りました。探索値は未採用です。'); }, true);
    document.getElementById('stageFrame').addEventListener('wheel', () => { if (source || generation) cancel('新しい画角で探索を再開できます。探索値は未採用です。'); }, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    root.addEventListener('resize', () => { if (source || generation) cancel('画面サイズが変わったため元作品へ戻りました。新しい画角で探索できます。'); });
    root.addEventListener('pagehide', dispose);
    refresh();
    return { refresh, generate, exportSheet: safeExport, adoptSelected: () => adopt(candidates[selected]), cancel,
      // Read-only diagnostics for state/render/output regression tests.
      inspect: () => ({ active: !!source, playing, pending: inFlight, generation, candidateCount: candidates.length,
        accepted: accepted ? { position: accepted.position, values: clone(accepted.values), phase: accepted.phase } : null }) };
  }
  root.TypeDeformerExplorer = { normalize, normalizeMoment, boundedAxes, variant, positions, mount, installRenderer, rendererClient };
})(globalThis);
