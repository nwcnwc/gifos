// All the tab wiring. app.js boots, loads state, then calls SIO.ui.init().
(function () {
  const SIO = (window.SIO = window.SIO || {});
  const $ = (id) => document.getElementById(id);

  // GifOS-standard row-delete glyph (button.row-del): trash, never ✕ — ✕ is
  // reserved for close/dismiss.
  const TRASH_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

  const state = {
    prefs: { level: 1, theme: 'night', minutes: 10, reps: 3, pause: 1.5, nonsense: true, stage: 3, text: '' },
    wordsText: '',
    savedWordsText: '',
    groups: [],
    caps: { recordings: false, recordedSentences: false, tts: false, wordlistReady: false },
    building: false,
  };
  const overlays = []; // stack of close functions, for Back

  // ------------------------------------------------------------- helpers

  async function savePrefs() {
    await SIO.store.db('prefs').put(Object.assign({ id: 'prefs' }, state.prefs));
  }

  function parseWords() {
    state.groups = SIO.wordlist.parse(state.wordsText);
  }

  async function refreshCaps() {
    const meta = await SIO.store.db('recmeta').getAll();
    state.caps.recordings = (meta || []).some((m) => !m.id.endsWith('/previous'));
    state.caps.recordedSentences = (meta || []).some((m) => m.part === 'sentences');
    const oe = SIO.openended;
    state.caps.wordlistReady = SIO.openended.fromWordlist(state.groups, 1).length > 0;
    state.caps.tts = false;
    if (window.gifos && window.gifos.ai) {
      try {
        const m = await window.gifos.ai.models();
        state.caps.tts = !!(m && m.available && m.available.includes('tts'));
      } catch (e) { /* not configured is not an error */ }
    }
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((t) => {
      t.setAttribute('aria-selected', String(t.dataset.screen === name));
    });
    for (const s of ['words', 'make', 'voice', 'about']) {
      $('screen-' + s).hidden = s !== name;
    }
    if (name === 'make') renderMake();
    if (name === 'voice') renderVoiceTab();
    if (name === 'about') renderAbout();
  }

  // --------------------------------------------------------- words tab

  function renderWordsTab() {
    $('wordlist').value = state.wordsText;
    renderPreview();
    renderNudge();
  }

  function renderPreview() {
    const groups = SIO.wordlist.parse($('wordlist').value);
    const words = SIO.wordlist.allWords(groups);
    $('word-count').textContent = words.length
      ? `${words.length} words, roughly ${Math.max(1, Math.floor(words.length * 12 / 60))} minutes to record`
      : 'No words yet';
    const box = $('groups');
    box.innerHTML = '';
    for (const g of groups) {
      const name = document.createElement('div');
      name.className = 'group-name';
      name.textContent = g.name;
      box.appendChild(name);
      const chips = document.createElement('div');
      chips.className = 'word-chips';
      for (const [w, c] of g.words) {
        const chip = document.createElement('span');
        chip.className = 'word-chip';
        chip.textContent = w;
        if (c) chip.style.color = c;
        chips.appendChild(chip);
      }
      box.appendChild(chips);
    }
  }

  function renderNudge() {
    const ph = SIO.wordlist.placeholders(SIO.wordlist.parse($('wordlist').value));
    $('people-nudge').hidden = !ph.length;
    if (ph.length) {
      $('people-nudge-text').innerHTML =
        `The <b>People</b> group still has example names in it (${ph.join(', ')}).`;
    }
  }

  function wireWordsTab() {
    const ta = $('wordlist');
    ta.addEventListener('input', () => {
      $('dirty-dot').hidden = ta.value === state.savedWordsText;
      $('save-state').textContent = '';
      renderPreview();
      renderNudge();
    });
    $('save-words').addEventListener('click', async () => {
      state.wordsText = ta.value;
      state.savedWordsText = ta.value;
      parseWords();
      await SIO.store.db('words').put({ id: 'wordlist', text: ta.value });
      $('dirty-dot').hidden = true;
      $('save-state').textContent = SIO.store.inGifOS()
        ? 'Saved on this device, inside this app.'
        : 'Kept for this visit only - open inside GifOS to keep it for good.';
      renderNudge();
    });
    $('revert-words').addEventListener('click', () => {
      ta.value = state.savedWordsText;
      $('dirty-dot').hidden = true;
      renderPreview();
      renderNudge();
    });
  }

  // ---------------------------------------------------------- make tab

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

  function renderMake() {
    // levels
    const statuses = SIO.curriculum.levelStatus(state.caps);
    const box = $('levels');
    box.innerHTML = '';
    for (const st of statuses) {
      const label = document.createElement('label');
      label.className = 'choice' + (st.id === state.prefs.level ? ' selected' : '') + (st.available ? '' : ' unavailable');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'level';
      input.value = st.id;
      input.checked = st.id === state.prefs.level;
      input.disabled = !st.available;
      input.addEventListener('change', () => {
        state.prefs.level = st.id;
        savePrefs();
        renderMake();
      });
      const name = document.createElement('span');
      name.className = 'choice-name';
      name.textContent = `${st.id}. ${st.name}`;
      const desc = document.createElement('div');
      desc.className = 'choice-desc';
      desc.textContent = st.description;
      label.appendChild(input);
      label.appendChild(name);
      label.appendChild(desc);
      if (st.reason) {
        const r = document.createElement('div');
        r.className = 'choice-reason';
        r.textContent = st.reason;
        label.appendChild(r);
      }
      box.appendChild(label);
    }

    // open-ended extras
    const lvl = state.prefs.level;
    $('level-text-wrap').hidden = lvl !== 10;
    $('level-stage-wrap').hidden = lvl !== 12;
    if (lvl === 10) {
      $('level-text').value = state.prefs.text || '';
      updateTextCount();
    }
    if (lvl === 12) {
      segmented($('stage'), [
        { value: 1, label: 's a t p i n' },
        { value: 2, label: '+ m d g o c k' },
        { value: 3, label: '+ e u r h b f l' },
      ], state.prefs.stage, (v) => { state.prefs.stage = v; savePrefs(); updateStageNote(); });
      updateStageNote();
    }

    // themes
    const themes = SIO.frames.THEMES;
    const tl = $('themes');
    tl.innerHTML = '';
    for (const key of Object.keys(themes)) {
      const t = themes[key];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'theme-card' + (key === state.prefs.theme ? ' selected' : '');
      const sw = document.createElement('div');
      sw.className = 'theme-swatch';
      sw.style.background = t.bg;
      sw.innerHTML = `<span style="color:${t.fg}">s<span style="color:${t.highlight}">a</span>t</span>`;
      const nm = document.createElement('div');
      nm.className = 'theme-name';
      nm.textContent = t.name;
      card.appendChild(sw);
      card.appendChild(nm);
      card.addEventListener('click', () => { state.prefs.theme = key; savePrefs(); renderMake(); });
      tl.appendChild(card);
    }

    // how it plays
    segmented($('minutes'), [5, 10, 20, 30].map((v) => ({ value: v, label: v + ' min' })),
      state.prefs.minutes, (v) => { state.prefs.minutes = v; savePrefs(); updateSummary(); });
    segmented($('reps'), [2, 3, 4].map((v) => ({ value: v, label: v + '×' })),
      state.prefs.reps, (v) => { state.prefs.reps = v; savePrefs(); updateSummary(); });
    segmented($('pause'), [
      { value: 1.0, label: 'Short' }, { value: 1.5, label: 'Medium' }, { value: 2.5, label: 'Long' },
    ], state.prefs.pause, (v) => { state.prefs.pause = v; savePrefs(); updateSummary(); });

    updateSummary();
  }

  function updateTextCount() {
    const lines = SIO.openended.splitSentences($('level-text').value);
    $('level-text-count').textContent = lines.length
      ? `${lines.length} line${lines.length === 1 ? '' : 's'} to read.`
      : '';
  }

  function updateStageNote() {
    const p = SIO.openended.storyProgress(state.prefs.stage);
    $('stage-note').textContent =
      `With ${p.letters.length} letters, ${p.lines} of the story's ${p.total} lines can be read.`;
  }

  function updateSummary() {
    const lv = SIO.curriculum.LEVELS.find((l) => l.id === state.prefs.level);
    $('make-summary').textContent =
      `Level ${state.prefs.level} (${lv ? lv.name : ''}), ${state.prefs.minutes} minutes, ` +
      `${state.prefs.theme} theme, each word ${state.prefs.reps}×.`;
  }

  function buildOpts() {
    return {
      minutes: state.prefs.minutes,
      reps: state.prefs.reps,
      pauseSeconds: state.prefs.pause,
      nonsense: state.prefs.nonsense,
      stage: state.prefs.stage,
      text: state.prefs.text,
    };
  }

  async function buildPlanWithProgress() {
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
        state.prefs.level, buildOpts(), state.groups, voice,
        (done, total) => {
          $('make-progress-text').textContent = `Preparing the sounds… ${done} of ${total}`;
          $('make-progress-fill').style.width = Math.round((done / total) * 100) + '%';
        });
      const note = $('voice-note');
      let html = `<b>Voices:</b> ${plan.voiceSummary}.`;
      if (plan.missing.length) {
        const labels = [...new Set(plan.missing.map((m) => m.label))];
        const shown = labels.slice(0, 6).join(', ') + (labels.length > 6 ? '…' : '');
        html += ` <br><b>No voice yet for:</b> ${shown} — record them on the Your&nbsp;voice tab` +
          (state.caps.tts ? '.' : ', or set up a Text-to-speech model in GifOS Settings → AI models.');
        note.classList.add('warn');
      } else {
        note.classList.remove('warn');
      }
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

  function wireMakeTab() {
    $('level-text').addEventListener('input', () => {
      state.prefs.text = $('level-text').value;
      updateTextCount();
    });
    $('level-text').addEventListener('change', savePrefs);

    $('btn-play').addEventListener('click', async () => {
      if (state.building) return;
      try {
        const plan = await buildPlanWithProgress();
        const theme = SIO.frames.THEMES[state.prefs.theme] || SIO.frames.THEMES.night;
        const colors = SIO.wordlist.colors(state.groups);
        openOverlay(SIO.player.openPlayer(plan, theme, colors).close);
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
        const colors = SIO.wordlist.colors(state.groups);
        $('make-progress').hidden = false;
        $('btn-cancel-export').hidden = false;
        $('btn-play').disabled = true;
        $('btn-export').disabled = true;
        const blob = await SIO.exporter.exportVideo(plan, theme, colors, (t, total) => {
          $('make-progress-text').textContent =
            `Saving… ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} of ` +
            `${Math.floor(total / 60)}:${String(Math.floor(total % 60)).padStart(2, '0')} (runs in real time)`;
          $('make-progress-fill').style.width = Math.round((t / total) * 100) + '%';
        });
        SIO.exporter.download(blob, `sound-it-out-level-${state.prefs.level}-${state.prefs.theme}.webm`);
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

  // --------------------------------------------------------- voice tab

  async function renderVoiceTab() {
    const done = await SIO.studio.doneMap();
    for (const part of ['phonemes', 'words', 'sentences']) {
      const items = SIO.studio.plan(part, state.groups);
      const n = items.filter((it) => done.has(SIO.studio.storageId(it))).length;
      $('count-' + part).textContent = n ? `${n} of ${items.length} recorded` : `${items.length} to record`;
    }
    if (!SIO.store.inGifOS()) {
      $('voice-foot').textContent = 'Recording needs this app to be open inside GifOS (it does the microphone part).';
    } else {
      $('voice-foot').textContent = '';
    }
  }

  function wireVoiceTab() {
    document.querySelectorAll('.vpart-record').forEach((b) =>
      b.addEventListener('click', () => openStudio(b.dataset.part)));
    document.querySelectorAll('.vpart-review').forEach((b) =>
      b.addEventListener('click', () => openReview(b.dataset.part)));
    document.querySelectorAll('.vpart-script').forEach((b) =>
      b.addEventListener('click', () => openScript(b.dataset.part)));
  }

  // ------------------------------------------------------------ studio

  const studio = { part: null, queue: [], index: 0, takes: [], busy: false };

  async function openStudio(part) {
    if (!SIO.store.inGifOS()) { alert('Recording needs this app to be open inside GifOS.'); return; }
    const done = await SIO.studio.doneMap();
    const items = SIO.studio.plan(part, state.groups);
    studio.part = part;
    studio.queue = items.filter((it) => !done.has(SIO.studio.storageId(it)));
    studio.index = 0;
    studio.takes = [];
    if (!studio.queue.length) {
      alert('Everything in this part is recorded. Use “Listen back & redo” to change one.');
      return;
    }
    $('studio').hidden = false;
    openOverlay(closeStudio);
    renderStudioItem();
  }

  function closeStudio() {
    $('studio').hidden = true;
    renderVoiceTab();
    refreshCaps();
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
    const need = SIO.dsp.takesFor(studio.part);
    $('studio-go').textContent = need > 1 ? `Record (take 1 of ${need})` : 'Record';
    $('studio-go').disabled = false;
  }

  function renderTakeDots(it) {
    const need = SIO.dsp.takesFor(studio.part);
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
    const need = SIO.dsp.takesFor(studio.part);
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
      // enough takes: choose, save, show the reason, move on
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
      $('studio-say').textContent = 'That is everything in this part. Done!';
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
    // wipe what was just saved for this item and record it afresh
    const it = studio.queue[studio.index];
    await SIO.studio.remove(it);
    renderStudioItem();
  }

  function wireStudio() {
    $('studio-go').addEventListener('click', studioRecordOnce);
    $('studio-skip').addEventListener('click', () => { if (!studio.busy) studioAdvance(); });
    $('studio-redo').addEventListener('click', studioRedo);
    $('studio-close').addEventListener('click', () => closeOverlay(closeStudio));
  }

  // ------------------------------------------------------------ review

  async function openReview(part) {
    const done = await SIO.studio.doneMap();
    const items = SIO.studio.plan(part, state.groups)
      .filter((it) => done.has(SIO.studio.storageId(it)));
    $('review-title').textContent = 'Listen back — ' + { phonemes: 'the sounds', words: 'the words', sentences: 'the sentences' }[part];
    $('review-hint').textContent = items.length
      ? 'Tap one to hear it. Deleting one puts it back in the recording queue — that is how you redo it.'
      : 'Nothing recorded in this part yet.';
    const list = $('review-list');
    list.innerHTML = '';
    for (const it of items) {
      const meta = done.get(SIO.studio.storageId(it));
      const row = document.createElement('div');
      row.className = 'review-row';
      const play = document.createElement('button');
      play.className = 'btn btn-quiet';
      play.textContent = '▶';
      play.setAttribute('aria-label', 'Play ' + it.display);
      play.addEventListener('click', () => SIO.studio.playBack(it));
      const word = document.createElement('span');
      word.className = 'rv-word';
      word.textContent = it.display;
      const metaEl = document.createElement('span');
      metaEl.className = 'rv-meta';
      metaEl.textContent = meta && meta.seconds ? meta.seconds.toFixed(1) + 's' : '';
      const noteEl = document.createElement('span');
      noteEl.className = 'rv-note';
      noteEl.textContent = meta && meta.notes && meta.notes.length ? meta.notes.join(', ') : '';
      const del = document.createElement('button');
      del.className = 'row-del';
      del.innerHTML = TRASH_SVG;
      del.setAttribute('aria-label', 'Delete the recording of ' + it.display);
      del.addEventListener('click', async () => {
        await SIO.studio.remove(it);
        row.remove();
        renderVoiceTab();
      });
      row.appendChild(play);
      row.appendChild(word);
      row.appendChild(metaEl);
      row.appendChild(noteEl);
      row.appendChild(del);
      list.appendChild(row);
    }
    $('review-clear').onclick = async () => {
      if (!confirm('Delete every recording in this part, so it can be done again?')) return;
      await SIO.studio.clearPart(part, state.groups);
      closeOverlay(closeReview);
      renderVoiceTab();
    };
    $('review').hidden = false;
    openOverlay(closeReview);
  }

  function closeReview() { $('review').hidden = true; }

  // ------------------------------------------------------------ script

  async function openScript(part) {
    const done = await SIO.studio.doneMap();
    const items = SIO.studio.plan(part, state.groups);
    $('script-title').textContent = 'What to say — ' + { phonemes: 'the sounds', words: 'the words', sentences: 'the sentences' }[part];
    const body = $('script-body');
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'script-group';
    items.forEach((it, i) => {
      const div = document.createElement('div');
      div.className = 'script-item';
      const isDone = done.has(SIO.studio.storageId(it));
      div.innerHTML = `${isDone ? '<span class="done">✓</span>' : ''}${i + 1}. <b>${it.display}</b>` +
        (it.kind === 'phoneme' ? ` <span class="rv-meta">(${it.say.replace(/^Say the /, 'the ')})</span>` : '');
      wrap.appendChild(div);
    });
    body.appendChild(wrap);
    $('script').hidden = false;
    openOverlay(closeScript);
  }

  function closeScript() { $('script').hidden = true; }

  // ------------------------------------------------------------- about

  async function renderAbout() {
    const done = await SIO.studio.doneMap();
    const counts = { phonemes: 0, words: 0, sentences: 0 };
    for (const m of done.values()) if (counts[m.part] !== undefined) counts[m.part] += 1;
    const clips = window.SIO_CLIPS && window.SIO_CLIPS.clips;
    const nClips = clips ? Object.values(clips).reduce((s, t) => s + Object.keys(t).length, 0) : 0;
    const rows = [
      [true, `Built-in voice: ${nClips} prepared clips packed inside this app.`],
      [counts.phonemes > 0, `Your sounds: ${counts.phonemes} of 42 recorded.`],
      [counts.words > 0, `Your words: ${counts.words} recorded.`],
      [counts.sentences > 0, `Your sentences: ${counts.sentences} recorded.`],
      [state.caps.tts, state.caps.tts
        ? 'Text-to-speech model: set up (used for words nobody recorded).'
        : 'Text-to-speech model: not set up. Optional — only needed for new words nobody recorded (GifOS Settings → AI models).'],
      [SIO.store.inGifOS(), SIO.store.inGifOS()
        ? 'Running inside GifOS: recordings and words are saved on this device.'
        : 'Opened outside GifOS: nothing can be saved or recorded. Install it from the GifOS App Store.'],
    ];
    const ul = $('capabilities');
    ul.innerHTML = '';
    for (const [ok, text] of rows) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '○'}</span><span>${text}</span>`;
      ul.appendChild(li);
    }
  }

  function wireAbout() {
    $('btn-backup').addEventListener('click', () => {
      if (window.gifos && window.gifos.save) window.gifos.save();
      else alert('Open this app inside GifOS to save a backup.');
    });
  }

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
    // else swallowed: a reflex Back press never closes the app
  }

  // player calls this when it closes itself
  function playerClosed() {
    // the player's close is on the stack; drop it without re-running
    overlays.pop();
  }

  // --------------------------------------------------------------- init

  async function init(loaded) {
    state.prefs = Object.assign(state.prefs, loaded.prefs || {});
    state.wordsText = loaded.wordsText;
    state.savedWordsText = loaded.wordsText;
    parseWords();
    await refreshCaps();

    document.querySelectorAll('.tab').forEach((t) =>
      t.addEventListener('click', () => switchTab(t.dataset.screen)));

    wireWordsTab();
    wireMakeTab();
    wireVoiceTab();
    wireStudio();
    wireAbout();

    renderWordsTab();
    switchTab('words');

    if (window.gifos && window.gifos.onBack) window.gifos.onBack(backPressed);
  }

  SIO.ui = { init, playerClosed, refreshCaps, state };
})();
