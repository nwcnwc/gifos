// The two screens. app.js boots, loads state, then calls SIO.ui.init().
(function () {
  const SIO = (window.SIO = window.SIO || {});
  const $ = (id) => document.getElementById(id);

  // GifOS-standard row-delete glyph (button.row-del): trash, never ✕.
  const TRASH_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

  const state = {
    prefs: { theme: 'night', pause: 1.5, unticked: [] },
    rows: [],       // library rows {id, text, order}
    status: [],     // statusOf() result, same order
    done: new Map(),
    building: false,
  };
  const unticked = () => new Set(state.prefs.unticked || []);
  const overlays = [];

  async function savePrefs() {
    await SIO.store.db('prefs').put(Object.assign({ id: 'prefs' }, state.prefs));
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((t) =>
      t.setAttribute('aria-selected', String(t.dataset.screen === name)));
    $('screen-sentences').hidden = name !== 'sentences';
    $('screen-setup').hidden = name !== 'setup';
    if (name === 'setup') renderSetup();
  }

  // ------------------------------------------------------------ the library

  async function refreshLibrary() {
    state.rows = await SIO.library.load();
    state.done = await SIO.studio.doneMap();
    state.status = SIO.library.statusOf(state.rows, new Set(state.done.keys()));
    renderList();
    renderPacks();
    updateSummary();
  }

  // Only READY entries can enter a video: an entry with sounds nobody can
  // say would play half-voiced, which teaches worse than leaving it out.
  function tickedReady() {
    const off = unticked();
    return state.status.filter((s) => !off.has(s.key) && s.ready);
  }
  function tickedUnready() {
    const off = unticked();
    return state.status.filter((s) => !off.has(s.key) && !s.ready);
  }

  function stateLine(s) {
    if (s.kind === 'letter') {
      return s.ready ? 'Uses the sounds from Setup.' : 'Uses the sounds from Setup - not recorded yet.';
    }
    const bits = [];
    if (s.words === 1) {
      bits.push(s.missing.length
        ? (s.ready ? 'Starter voice until you record it.' : 'Not recorded yet.')
        : 'In your voice.');
    } else {
      bits.push(`${s.recordedWords} of ${s.words} words in your voice.`);
      bits.push(s.lineRecorded ? 'Line recorded.' : 'Line still to read.');
    }
    if (!s.ready) bits.push('Record it to include it in the video.');
    return bits.join(' ');
  }

  function renderList() {
    const box = $('sentence-list');
    box.innerHTML = '';
    if (!state.status.length) {
      const p = document.createElement('p');
      p.className = 'hint empty-note';
      p.textContent = 'Nothing here yet. Add something above, or open a starter pack.';
      box.appendChild(p);
      return;
    }
    const off = unticked();
    for (const s of state.status) {
      const row = document.createElement('div');
      row.className = 'sentence-row' + (off.has(s.key) ? ' is-out' : '');

      const label = document.createElement('label');
      label.className = 'sentence-tick';
      const tick = document.createElement('input');
      tick.type = 'checkbox';
      tick.checked = !off.has(s.key);
      tick.setAttribute('aria-label', `Include "${s.text}" in the video`);
      tick.addEventListener('change', async () => {
        const o = unticked();
        if (tick.checked) o.delete(s.key); else o.add(s.key);
        state.prefs.unticked = [...o];
        await savePrefs();
        row.classList.toggle('is-out', !tick.checked);
        updateSummary();
      });
      label.appendChild(tick);

      const body = document.createElement('div');
      body.className = 'sentence-body';
      const text = document.createElement('div');
      text.className = 'sentence-text' + (s.kind === 'letter' ? ' is-letter' : '');
      text.textContent = s.text;
      const meta = document.createElement('div');
      meta.className = 'sentence-meta' + (s.ready ? ' is-ready' : '');
      meta.textContent = stateLine(s);
      body.appendChild(text);
      body.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'sentence-actions';
      if (s.kind !== 'letter' && (s.missing.length || !s.lineRecorded)) {
        const rec = document.createElement('button');
        rec.className = 'btn btn-primary btn-small';
        rec.textContent = 'Record';
        rec.addEventListener('click', () => recordEntry(s));
        actions.appendChild(rec);
      }
      if (s.kind !== 'letter') {
        const listen = document.createElement('button');
        listen.className = 'btn btn-quiet btn-small';
        listen.textContent = 'Listen';
        listen.addEventListener('click', () => openEntryListen(s));
        actions.appendChild(listen);
      }
      const del = document.createElement('button');
      del.className = 'row-del';
      del.innerHTML = TRASH_SVG;
      del.setAttribute('aria-label', 'Remove "' + s.text + '" from the list');
      del.addEventListener('click', async () => {
        // Recordings are kept: the words belong to the shared bank, and the
        // line clip is precious if she re-adds the sentence.
        await SIO.library.remove(s.key);
        refreshLibrary();
      });
      actions.appendChild(del);

      row.appendChild(label);
      row.appendChild(body);
      row.appendChild(actions);
      box.appendChild(row);
    }
  }

  async function renderPacks() {
    const packs = await SIO.library.packs();
    const box = $('packs');
    box.innerHTML = '';
    for (const group of ['favourites', 'skills']) {
      const h = document.createElement('h3');
      h.textContent = group === 'favourites' ? 'Stories and favourites' : 'Learning to sound out';
      box.appendChild(h);
      for (const p of packs.filter((x) => x.group === group)) {
        const row = document.createElement('div');
        row.className = 'pack-row';
        const body = document.createElement('div');
        body.className = 'pack-body';
        body.innerHTML = `<b>${p.name}</b> <span class="pack-count">${p.added ? p.added + ' of ' + p.count + ' added' : p.count + ' entries'}</span><br><span class="hint">${p.description}</span>`;
        const add = document.createElement('button');
        add.className = 'btn btn-second btn-small';
        add.textContent = p.added >= p.count ? 'Added' : 'Add';
        add.disabled = p.added >= p.count;
        add.addEventListener('click', async () => {
          await SIO.library.addPack(p.id);
          refreshLibrary();
        });
        row.appendChild(body);
        row.appendChild(add);
        box.appendChild(row);
      }
    }
  }

  // The length is told, not asked for: nobody can guess what an entry costs
  // in buildup time, so the summary does the sums after every tick.
  function updateSummary() {
    const ready = tickedReady();
    const waiting = tickedUnready();
    const total = state.status.length;
    if (!ready.length) {
      $('make-summary').textContent = !total ? ' '
        : waiting.length
          ? 'Nothing recorded yet - the video needs at least one recorded (or letter) entry.'
          : 'Nothing ticked - tick at least one entry.';
      return;
    }
    const secs = SIO.library.estimateSeconds(ready.map((s) => s.text), 3, state.prefs.pause);
    const mins = secs / 60;
    const len = mins < 1.4 ? 'About a minute long'
      : `About ${Math.round(mins)} minutes long`;
    $('make-summary').textContent =
      `${ready.length} of ${total} entries ready and ticked` +
      (waiting.length ? ` (${waiting.length} more waiting on recording)` : '') +
      `. ${len}, then it starts again.`;
  }

  // ----------------------------------------------------------- make / play

  async function buildPlanWithProgress() {
    const ready = tickedReady();
    const skipped = tickedUnready();
    const texts = ready.map((s) => s.text);
    if (!texts.length) {
      throw new Error(skipped.length
        ? 'Nothing here is recorded yet. Record an entry first - or add the Letter sounds pack, which needs no recording.'
        : 'Tick at least one entry first.');
    }
    state.building = true;
    $('make-progress').hidden = false;
    $('btn-play').disabled = true;
    $('btn-export').disabled = true;
    $('voice-note').hidden = true;
    $('make-progress-text').textContent = 'Working out the sounds…';
    $('make-progress-fill').style.width = '0%';
    try {
      const voice = new SIO.VoiceSource();
      const plan = await SIO.storyboard.buildPlan(
        texts, { reps: 3, pauseSeconds: state.prefs.pause }, voice,
        (done, totalN) => {
          $('make-progress-text').textContent = `Preparing the sounds… ${done} of ${totalN}`;
          $('make-progress-fill').style.width = Math.round((done / totalN) * 100) + '%';
        });
      const note = $('voice-note');
      let html = `<b>Voices:</b> ${plan.voiceSummary}.`;
      if (skipped.length) {
        html += ` <br><b>Left out (not recorded yet):</b> `
          + skipped.slice(0, 5).map((s) => s.text).join(' · ')
          + (skipped.length > 5 ? ' …' : '')
          + ' — record them from the list above.';
        note.classList.add('warn');
      } else note.classList.remove('warn');
      note.innerHTML = html;
      note.hidden = false;
      return plan;
    } finally {
      state.building = false;
      $('make-progress').hidden = true;
      $('btn-cancel-export').hidden = true;
      $('btn-play').disabled = false;
      $('btn-export').disabled = false;
    }
  }

  function wireMake() {
    $('btn-play').addEventListener('click', async () => {
      if (state.building) return;
      try {
        const plan = await buildPlanWithProgress();
        const theme = SIO.frames.THEMES[state.prefs.theme] || SIO.frames.THEMES.night;
        openOverlay(SIO.player.openPlayer(plan, theme).close);
      } catch (e) {
        alert(e && e.message || 'That did not work.');
      }
    });

    $('btn-export').addEventListener('click', async () => {
      if (state.building) return;
      if (!SIO.exporter.supported()) {
        alert('This browser cannot record video files. Playing on this screen still works.');
        return;
      }
      $('export-note').hidden = false;
      try {
        const plan = await buildPlanWithProgress();
        const theme = SIO.frames.THEMES[state.prefs.theme] || SIO.frames.THEMES.night;
        $('make-progress').hidden = false;
        $('btn-cancel-export').hidden = false;
        $('btn-play').disabled = true;
        $('btn-export').disabled = true;
        const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
        const blob = await SIO.exporter.exportVideo(plan, theme, (t, total) => {
          $('make-progress-text').textContent = `Saving… ${fmt(t)} of ${fmt(total)} (runs in real time)`;
          $('make-progress-fill').style.width = Math.round((t / total) * 100) + '%';
        });
        SIO.exporter.download(blob, `sound-it-out-${state.prefs.theme}.webm`);
        $('make-progress-text').textContent = 'Saved.';
      } catch (e) {
        if (String(e && e.message) !== 'cancelled') alert(e && e.message || 'That did not work.');
      } finally {
        $('make-progress').hidden = true;
        $('btn-cancel-export').hidden = true;
        $('btn-play').disabled = false;
        $('btn-export').disabled = false;
      }
    });
    $('btn-cancel-export').addEventListener('click', () => SIO.exporter.cancel());
  }

  function segmented(el, options, value, onPick) {
    el.innerHTML = '';
    for (const o of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(o.value === value));
      b.textContent = o.label;
      b.addEventListener('click', () => {
        el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', 'false'));
        b.setAttribute('aria-checked', 'true');
        onPick(o.value);
      });
      el.appendChild(b);
    }
  }

  function renderOptions() {
    segmented($('pause'), [
      { value: 1.0, label: 'Short' }, { value: 1.5, label: 'Medium' }, { value: 2.5, label: 'Long' },
    ], state.prefs.pause, (v) => { state.prefs.pause = v; savePrefs(); updateSummary(); });

    const themes = SIO.frames.THEMES;
    const tl = $('themes');
    tl.innerHTML = '';
    for (const key of Object.keys(themes)) {
      const t = themes[key];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'theme-card' + (key === state.prefs.theme ? ' selected' : '');
      card.innerHTML = `<div class="theme-swatch" style="background:${t.bg}">`
        + `<span style="color:${t.fg}">s<span style="color:${t.highlight}">a</span>t</span></div>`
        + `<div class="theme-name">${t.name}</div>`;
      card.addEventListener('click', () => { state.prefs.theme = key; savePrefs(); renderOptions(); });
      tl.appendChild(card);
    }
  }

  function wireAdd() {
    $('sentence-add').addEventListener('click', async () => {
      const err = $('sentence-error');
      err.hidden = true;
      try {
        const added = await SIO.library.add($('sentence-input').value);
        $('sentence-input').value = '';
        $('sentence-added').textContent = added.length
          ? (added.length === 1 ? 'Added.' : `Added ${added.length}.`)
          : 'Already on the list.';
        setTimeout(() => { $('sentence-added').textContent = ''; }, 2500);
        refreshLibrary();
      } catch (e) {
        err.textContent = (e && e.message) || 'That did not work.';
        err.hidden = false;
      }
    });
  }

  // ------------------------------------------------------------ the studio

  const studio = { queue: [], index: 0, takes: [], busy: false, onDone: null };

  function takesNeeded(item) {
    return item.takes || (item.kind === 'phoneme' ? 3 : 1);
  }

  function openStudio(items, onDone) {
    if (!SIO.store.inGifOS()) { alert('Recording needs this app to be open inside GifOS.'); return; }
    if (!items.length) { alert('Everything here is recorded. Use “Listen back & redo” to change one.'); return; }
    studio.queue = items;
    studio.index = 0;
    studio.takes = [];
    studio.onDone = onDone || null;
    $('studio').hidden = false;
    openOverlay(closeStudio);
    renderStudioItem();
  }

  function closeStudio() {
    $('studio').hidden = true;
    if (studio.onDone) studio.onDone();
    refreshLibrary();
    renderSetup();
  }

  function renderStudioItem() {
    const it = studio.queue[studio.index];
    const total = studio.queue.length;
    $('studio-progress').textContent = `${studio.index + 1} of ${total}`;
    $('studio-bar-fill').style.width = Math.round((studio.index / total) * 100) + '%';
    $('studio-say').textContent = it.say;
    const w = $('studio-word');
    w.textContent = it.display;
    w.classList.toggle('sentence', it.kind === 'sentence');
    $('studio-state').textContent = '';
    $('studio-result').hidden = true;
    $('studio-redo').hidden = true;
    studio.takes = [];
    renderTakeDots(it);
    const need = takesNeeded(it);
    $('studio-go').textContent = need > 1 ? `Record (take 1 of ${need})` : 'Record';
    $('studio-go').disabled = false;
  }

  function renderTakeDots(it) {
    const need = takesNeeded(it);
    const box = $('studio-takes');
    box.innerHTML = '';
    if (need <= 1) return;
    for (let i = 0; i < need; i++) {
      const d = document.createElement('span');
      d.className = 'take-dot' + (i < studio.takes.length ? (studio.takes[i]._fatal ? ' bad' : ' ok') : '');
      box.appendChild(d);
    }
  }

  async function studioRecordOnce() {
    if (studio.busy) return;
    const it = studio.queue[studio.index];
    const need = takesNeeded(it);
    studio.busy = true;
    $('studio-go').disabled = true;
    $('studio-state').textContent = 'Recording — GifOS is listening. Stop when you have said it.';
    try {
      const take = await SIO.studio.takeOne(it);
      if (!take) { $('studio-state').textContent = 'Nothing captured — try again.'; return; }
      const score = SIO.dsp.scoreTake(take.audio, take.sr, it);
      take._fatal = !!score.fatal;
      studio.takes.push(take);
      renderTakeDots(it);
      $('studio-state').textContent = score.fatal ? score.fatal : 'Got that one.';

      if (studio.takes.length < need) {
        $('studio-go').textContent = `Record (take ${studio.takes.length + 1} of ${need})`;
        return;
      }
      const result = await SIO.studio.saveBest(it, studio.takes);
      const res = $('studio-result');
      res.hidden = false;
      if (result.allFailed) {
        res.className = 'studio-result bad';
        res.textContent = (result.takes[0] && result.takes[0].fatal
          ? result.takes[0].fatal : 'None of those takes worked.') + ' Have another go.';
        $('studio-redo').hidden = false;
        $('studio-go').textContent = 'Record again';
        studio.takes = [];
        renderTakeDots(it);
        return;
      }
      res.className = 'studio-result ' + (result.weak ? 'bad' : 'good');
      res.textContent = result.reason + (result.weak ? ' (' + result.advice.join('; ') + ' — kept anyway; redo it from Listen back if you like.)' : '');
      $('studio-redo').hidden = false;
      setTimeout(studioAdvance, result.weak ? 2200 : 900);
    } catch (e) {
      $('studio-state').textContent = (e && e.message) || 'That did not work.';
    } finally {
      studio.busy = false;
      $('studio-go').disabled = false;
    }
  }

  function studioAdvance() {
    if ($('studio').hidden) return;
    if (studio.index + 1 >= studio.queue.length) {
      $('studio-say').textContent = 'That is everything here. Done!';
      $('studio-word').textContent = '✓';
      $('studio-state').textContent = '';
      $('studio-result').hidden = true;
      $('studio-go').disabled = true;
      $('studio-redo').hidden = true;
      $('studio-bar-fill').style.width = '100%';
      setTimeout(() => { if (!$('studio').hidden) closeOverlay(closeStudio); }, 1600);
      return;
    }
    studio.index += 1;
    renderStudioItem();
  }

  async function studioRedo() {
    const it = studio.queue[studio.index];
    await SIO.studio.remove(it);
    renderStudioItem();
  }

  function wireStudio() {
    $('studio-go').addEventListener('click', studioRecordOnce);
    $('studio-skip').addEventListener('click', () => { if (!studio.busy) studioAdvance(); });
    $('studio-redo').addEventListener('click', studioRedo);
    $('studio-close').addEventListener('click', () => closeOverlay(closeStudio));
    $('review-close').addEventListener('click', () => closeOverlay(closeReview));
    $('script-close').addEventListener('click', () => closeOverlay(closeScript));
  }

  // The walk-through for one entry: its unrecorded words, then the line.
  async function recordEntry(s) {
    const done = await SIO.studio.doneMap();
    const items = SIO.library.walkthroughItems(s.text)
      .filter((it) => !done.has(SIO.studio.storageId(it)));
    openStudio(items);
  }

  // ------------------------------------------------------------- listen back

  // rows: [{id, display, meta, missing}] - missing rows show as still-to-do.
  function openReview(title, hint, rows, recordRemainder) {
    $('review-title').textContent = title;
    $('review-hint').textContent = hint;
    const list = $('review-list');
    list.innerHTML = '';
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'review-row' + (r.missing ? ' is-missing' : '');
      const play = document.createElement('button');
      play.className = 'btn btn-quiet';
      play.textContent = '▶';
      play.disabled = !!r.missing;
      play.setAttribute('aria-label', 'Play ' + r.display);
      play.addEventListener('click', () => SIO.studio.playBackId(r.id));
      const word = document.createElement('span');
      word.className = 'rv-word';
      word.textContent = r.display;
      const metaEl = document.createElement('span');
      metaEl.className = 'rv-meta';
      metaEl.textContent = r.missing ? 'still to record' : (r.meta || '');
      row.appendChild(play);
      row.appendChild(word);
      row.appendChild(metaEl);
      if (!r.missing) {
        const del = document.createElement('button');
        del.className = 'row-del';
        del.innerHTML = TRASH_SVG;
        del.setAttribute('aria-label', 'Delete the recording of ' + r.display);
        del.addEventListener('click', async () => {
          await SIO.studio.removeId(r.id);
          row.classList.add('is-missing');
          play.disabled = true;
          metaEl.textContent = 'still to record';
          del.remove();
          refreshLibrary();
          renderSetup();
        });
        row.appendChild(del);
      }
      list.appendChild(row);
    }
    const rec = $('review-record');
    rec.hidden = !recordRemainder;
    rec.onclick = recordRemainder ? () => { closeOverlay(closeReview); recordRemainder(); } : null;
    $('review').hidden = false;
    openOverlay(closeReview);
  }
  function closeReview() { $('review').hidden = true; }

  // Every clip behind one entry: each word, then the line.
  async function openEntryListen(s) {
    const done = await SIO.studio.doneMap();
    const rows = SIO.library.walkthroughItems(s.text).map((it) => {
      const id = SIO.studio.storageId(it);
      const meta = done.get(id);
      return {
        id, display: it.display,
        meta: meta && meta.seconds ? meta.seconds.toFixed(1) + 's' : '',
        missing: !meta,
      };
    });
    openReview('Listen back — ' + s.text,
      'Each word, then the whole line. Deleting one puts it back in the recording queue.',
      rows, () => recordEntry(s));
  }

  // ------------------------------------------------------------------ setup

  async function renderSetup() {
    const done = await SIO.studio.doneMap();
    const plan = SIO.studio.phonemePlan();
    const n = plan.filter((it) => done.has(SIO.studio.storageId(it))).length;
    $('count-phonemes').textContent = n ? `${n} of ${plan.length} recorded` : `${plan.length} to record`;
    const rimes = SIO.studio.rimesPlan();
    const nr = rimes.filter((it) => done.has(SIO.studio.storageId(it))).length;
    $('count-rimes').textContent = nr ? `${nr} of ${rimes.length} recorded` : `${rimes.length}, starter voice for now`;
    const bank = await SIO.studio.bankList();
    $('count-bank').textContent = bank.length ? `${bank.length} words` : 'empty so far';

    const C = window.SIO_CLIPS && window.SIO_CLIPS.clips;
    const nStP = C && C.phonemes ? Object.keys(C.phonemes).length : 0;
    const nStW = C && C.words ? Object.keys(C.words).length : 0;
    const nStS = C && C.sentences ? Object.keys(C.sentences).length : 0;
    const rows = [
      [n > 0, `Your sounds: ${n} of ${plan.length} recorded.`],
      [bank.length > 0, `Your word bank: ${bank.length} words.`],
      [nStP > 0, `Starter voice: ${nStP} sounds` + (nStW + nStS ? `, ${nStW} words, ${nStS} lines` : '') + ' — the app author’s real voice, shipped with the app.'],
      [SIO.store.inGifOS(), SIO.store.inGifOS()
        ? 'Running inside GifOS: everything is saved on this device.'
        : 'Opened outside GifOS: nothing can be saved or recorded.'],
    ];
    const ul = $('capabilities');
    ul.innerHTML = '';
    for (const [ok, text] of rows) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '○'}</span><span>${text}</span>`;
      ul.appendChild(li);
    }
  }

  function wireSetup() {
    $('sounds-record').addEventListener('click', async () => {
      const done = await SIO.studio.doneMap();
      const items = SIO.studio.phonemePlan().filter((it) => !done.has(SIO.studio.storageId(it)));
      openStudio(items);
    });
    $('sounds-review').addEventListener('click', async () => {
      const done = await SIO.studio.doneMap();
      const rows = SIO.studio.phonemePlan().map((it) => {
        const id = SIO.studio.storageId(it);
        const meta = done.get(id);
        return {
          id, display: it.display + '  (as in ' + it.example + ')',
          meta: meta && meta.seconds ? meta.seconds.toFixed(1) + 's' : '',
          missing: !meta,
        };
      });
      openReview('Listen back — the sounds',
        'Tap one to hear it. Deleting one puts it back in the recording queue.', rows);
    });
    $('sounds-script').addEventListener('click', async () => {
      const done = await SIO.studio.doneMap();
      const body = $('script-body');
      body.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'script-group';
      SIO.studio.phonemePlan().forEach((it, i) => {
        const div = document.createElement('div');
        div.className = 'script-item';
        const isDone = done.has(SIO.studio.storageId(it));
        div.innerHTML = `${isDone ? '<span class="done">✓</span>' : ''}${i + 1}. <b>${it.display}</b> `
          + `<span class="rv-meta">as in “${it.example}” — ${it.length === 'hold' ? 'hold it' : it.length === 'crisp' ? 'short and crisp' : 'naturally'}</span>`;
        wrap.appendChild(div);
      });
      body.appendChild(wrap);
      $('script').hidden = false;
      openOverlay(closeScript);
    });
    $('rimes-record').addEventListener('click', async () => {
      const done = await SIO.studio.doneMap();
      const items = SIO.studio.rimesPlan().filter((it) => !done.has(SIO.studio.storageId(it)));
      openStudio(items);
    });
    $('rimes-review').addEventListener('click', async () => {
      const done = await SIO.studio.doneMap();
      const rows = SIO.studio.rimesPlan().map((it) => {
        const id = SIO.studio.storageId(it);
        const meta = done.get(id);
        return {
          id,
          display: it.display + (SIO.curriculum.RIME_EXAMPLES[it.key] ? '  (as in ' + SIO.curriculum.RIME_EXAMPLES[it.key] + ')' : ''),
          meta: meta && meta.seconds ? meta.seconds.toFixed(1) + 's' : '',
          missing: !meta,
        };
      });
      openReview('Listen back — the word endings',
        'Tap one to hear your recording. Unrecorded ones use the starter voice.', rows);
    });
    $('bank-review').addEventListener('click', async () => {
      const bank = await SIO.studio.bankList();
      const rows = bank.map((m) => ({
        id: m.id, display: m.display || m.key,
        meta: (m.seconds ? m.seconds.toFixed(1) + 's' : '')
          + (m.notes && m.notes.length ? ' · ' + m.notes.join(', ') : ''),
        missing: false,
      }));
      openReview('Listen back — your word bank',
        rows.length ? 'Every word on record, from every sentence. Deleting one puts it back in the queue of whatever uses it.'
          : 'Nothing in the bank yet - record an entry on the Sentences tab.', rows);
    });
    $('btn-backup').addEventListener('click', () => {
      if (window.gifos && window.gifos.save) window.gifos.save();
      else alert('Open this app inside GifOS to save a backup.');
    });
  }

  function closeScript() { $('script').hidden = true; }

  // ------------------------------------------------------- overlay stack

  function openOverlay(closeFn) { overlays.push(closeFn); }
  function closeOverlay(closeFn) {
    const i = overlays.lastIndexOf(closeFn);
    if (i >= 0) overlays.splice(i, 1);
    closeFn();
  }
  function backPressed() {
    const top = overlays.pop();
    if (top) top();
  }
  function playerClosed() { overlays.pop(); }

  // --------------------------------------------------------------- init

  async function init(loaded) {
    state.prefs = Object.assign(state.prefs, loaded.prefs || {});
    document.querySelectorAll('.tab').forEach((t) =>
      t.addEventListener('click', () => switchTab(t.dataset.screen)));
    wireAdd();
    wireMake();
    wireStudio();
    wireSetup();
    renderOptions();
    await refreshLibrary();
    switchTab('sentences');
    if (window.gifos && window.gifos.onBack) window.gifos.onBack(backPressed);
  }

  SIO.ui = { init, playerClosed, state };
})();
