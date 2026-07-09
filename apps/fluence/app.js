// Fluence — spontaneous-speech coach, full port to a GifOS app.
//
// All brokered by the GifOS runtime:
//   gifos.recordAudio      → a take (runtime holds the mic, not the app)
//   gifos.api('deepgram')  → nova-3 transcript (word confidence + filler tags)
//   FL.extractFeatures     → deterministic features (pure JS)
//   gifos.ai.chat/.image   → drill generation, coaching, weekly review, scenes
//   gifos.db               → take + weekly-review history
//
// Nine drill types (drills.js), drill-type-aware grading (coach.js), a weekly
// pattern review (weekly.js), and a suggested-next-drill loop.
(function () {
  'use strict';

  const FREE_PROMPTS = [
    'Describe your morning routine, start to finish.',
    'Explain how something you use every day actually works.',
    'Tell the story of a decision you are glad you made.',
    'Argue for a food that is underrated.',
    'Describe a place you know well to someone who has never been.',
    'Explain a hobby to a complete beginner.',
    'Talk about a book, film, or song that stuck with you and why.',
    'Explain a strong opinion you hold, and steelman the other side.',
  ];

  const DG_QUERY = { model: 'nova-3', smart_format: 'true', punctuate: 'true', filler_words: 'true', language: 'en' };

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const has = () => typeof window.gifos !== 'undefined';
  const takesDb = has() ? gifos.db('takes') : null;
  const reviewsDb = has() ? gifos.db('reviews') : null;
  const fmt = (n) => (n == null ? '—' : (Math.round(n * 100) / 100));

  let recording = false, busy = false;
  let drill = freestyle();

  function freestyle() {
    const p = FREE_PROMPTS[Math.floor((performance.now() + Math.random() * 999) % FREE_PROMPTS.length)];
    return { type: 'free', prompt: p, params: null, duration: 90, generated_by: 'local' };
  }

  // ---- history --------------------------------------------------------------
  async function loadTakes() {
    if (!takesDb) return [];
    let all = []; try { all = await takesDb.getAll(); } catch (e) {}
    return all.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  }
  function recentPrompts(all) { return all.slice(0, 10).map((t) => t.drill_prompt).filter(Boolean); }
  function recentLetters(all) { return all.filter((t) => t.drill_type === 'letter_fluency' && t.drill_params && t.drill_params.letter).slice(0, 6).map((t) => t.drill_params.letter); }

  // ---- drill card -----------------------------------------------------------
  function renderDrill() {
    const d = drill, def = FL.getDrillType(d.type), box = $('drill');
    box.innerHTML = '';
    const head = el('div', 'drill-head');
    head.appendChild(el('span', 'drill-tag', def.short));
    head.appendChild(el('span', 'drill-dur', d.duration + 's'));
    box.appendChild(head);
    box.appendChild(el('div', 'prompt', d.prompt));
    const p = d.params || {};

    if (d.type === 'letter_fluency' && p.letter) box.appendChild(el('div', 'big-letter', p.letter));
    if (d.type === 'semantic_fluency' && p.category) { const c = el('div', 'param-badge'); c.innerHTML = 'Category: <b>' + esc(p.category) + '</b>'; box.appendChild(c); }
    if (d.type === 'forced_substitution' && p.banned_words) {
      const wrap = el('div', 'banned'); wrap.appendChild(el('div', 'param-label', 'Banned words — do not say:'));
      const chips = el('div', 'chips'); (p.banned_words || []).forEach((w) => chips.appendChild(el('span', 'banned-chip', w))); wrap.appendChild(chips); box.appendChild(wrap);
    }
    if (d.type === 'bridging' && (p.start_sentence || p.end_sentence)) {
      const wrap = el('div', 'bridge');
      const s = el('div', 'sent'); s.appendChild(el('div', 'param-label', 'Start with')); s.appendChild(el('div', 'sent-t', p.start_sentence || '')); wrap.appendChild(s);
      wrap.appendChild(el('div', 'bridge-arrow', '↓ speak the bridge ↓'));
      const e = el('div', 'sent'); e.appendChild(el('div', 'param-label', 'End with')); e.appendChild(el('div', 'sent-t', p.end_sentence || '')); wrap.appendChild(e);
      box.appendChild(wrap);
    }
    if (d.type === 'topic_switch' && p.topics) {
      const wrap = el('div', 'switches'); wrap.appendChild(el('div', 'param-label', 'Pivot on the clock — study these first (they’re hidden while recording):'));
      (p.topics || []).forEach((t, i) => { const iv = p.switch_interval_seconds || 30; const row = el('div', 'switch'); row.appendChild(el('span', 'switch-t', mmss(i * iv) + '–' + mmss((i + 1) * iv))); row.appendChild(el('span', null, t)); wrap.appendChild(row); });
      box.appendChild(wrap);
    }
    if (d.type === 'bullet_points' && p.bullets) {
      const ol = el('ol', 'bullets'); (p.bullets || []).forEach((b) => ol.appendChild(el('li', null, b))); box.appendChild(ol);
    }
    if (d.type === 'picture_description' && d.imageUrl) {
      const img = el('img', 'scene'); img.src = d.imageUrl; img.alt = 'scene to describe'; box.appendChild(img);
    }

    const actions = el('div', 'drill-actions');
    const shuffle = el('button', 'ghost', d.type === 'free' ? '↻ New prompt' : '↻ Regenerate');
    shuffle.onclick = () => { if (d.type === 'free') { drill = freestyle(); renderDrill(); } else regen(d.type); };
    actions.appendChild(shuffle);
    const pick = el('button', 'ghost', '☰ Choose a drill');
    pick.onclick = toggleCatalog;
    actions.appendChild(pick);
    box.appendChild(actions);
  }

  function mmss(s) { const m = Math.floor(s / 60), r = s % 60; return m + ':' + String(r).padStart(2, '0'); }
  function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  async function regen(type, topic) {
    if (busy) return; setBusy(true);
    setStatus('Generating a ' + FL.getDrillType(type).label.toLowerCase() + ' drill…', 'live');
    try {
      const all = await loadTakes();
      const ctx = { type, recentTopics: recentPrompts(all), recentLetters: recentLetters(all), topic };
      if (type === 'recast') { const last = all[0]; ctx.stumble = last && last.feedback && (last.feedback.moments || [])[0] ? (last.feedback.moments[0].what_happened || '') : ''; }
      drill = await FL.generateDrill(ctx);
      renderDrill(); setStatus('', ''); closeCatalog();
      $('drill').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      const m = String(e && e.message || e);
      if (/IMAGE_ROLE/.test(m)) setupCard('An image model', 'Picture-description drills render a scene with an image model. Open <b>GifOS Settings → AI models</b> and set up <b>Text → image</b> (e.g. an OpenAI <span class="mono">gpt-image-1</span> endpoint).');
      else if (/not set up|Settings → AI/.test(m)) setupCard('A drill model', 'Generating drills needs an AI model. Open <b>GifOS Settings → AI models</b> and set up <b>Cheapest text</b> (any OpenAI-compatible endpoint + key).');
      else setStatus('Could not generate that drill: ' + m, 'bad');
    } finally { setBusy(false); }
  }

  // ---- catalog --------------------------------------------------------------
  let catalogOpen = false;
  function toggleCatalog() { catalogOpen ? closeCatalog() : openCatalog(); }
  function closeCatalog() { catalogOpen = false; $('catalog').innerHTML = ''; $('catalog').classList.remove('open'); }
  function openCatalog() {
    catalogOpen = true; const box = $('catalog'); box.classList.add('open'); box.innerHTML = '';
    box.appendChild(el('h2', null, 'Drill types'));
    box.appendChild(el('p', 'muted', 'Each targets a different cognitive lift. Pick one, or let the coach suggest the next after a take.'));
    FL.DRILL_TYPE_IDS.forEach((id) => {
      const def = FL.DRILL_TYPES[id];
      const card = el('div', 'cat-card');
      const top = el('div', 'cat-top');
      top.appendChild(el('b', null, def.label));
      top.appendChild(el('span', 'cat-skill', def.skill));
      card.appendChild(top);
      card.appendChild(el('div', 'cat-desc', def.description));
      const go = el('button', 'ghost', id === 'free' ? 'Start' : 'Generate');
      go.onclick = () => { if (id === 'free') { drill = freestyle(); renderDrill(); closeCatalog(); $('drill').scrollIntoView({ behavior: 'smooth' }); } else if (id === 'bullet_points' && def.accepts_topic) { promptTopicThenGen(id); } else regen(id); };
      card.appendChild(go);
      box.appendChild(card);
    });
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function promptTopicThenGen(id) {
    const topic = (window.prompt && window.prompt('Optional: a topic for your bullet points (leave blank for a suggested one).')) || '';
    regen(id, topic.trim() || undefined);
  }

  // ---- the take pipeline ----------------------------------------------------
  function setStatus(msg, kind) { const s = $('status'); s.textContent = msg || ''; s.className = 'status' + (kind ? ' ' + kind : ''); }
  function setBusy(b) { busy = b; $('rec').disabled = b || recording; }
  function setupCard(what, where, extra) {
    const box = $('results'); box.innerHTML = '';
    const c = el('div', 'setup'); c.appendChild(el('h3', null, what + ' isn’t set up yet'));
    const p = el('p'); p.innerHTML = where; c.appendChild(p);
    if (extra) { const e = el('p', 'muted'); e.innerHTML = extra; c.appendChild(e); }
    box.appendChild(c); box.scrollIntoView({ behavior: 'smooth' });
  }

  async function transcribe(clip) {
    const r = await gifos.api('deepgram', { method: 'POST', path: '/v1/listen', query: DG_QUERY, headers: { 'Content-Type': clip.mime || 'audio/webm' }, body: clip.bytes, as: 'json' });
    if (!r.ok) throw new Error('Deepgram returned ' + r.status + (r.json && r.json.err_msg ? ': ' + r.json.err_msg : ''));
    const alt = r.json && r.json.results && r.json.results.channels && r.json.results.channels[0] && r.json.results.channels[0].alternatives && r.json.results.channels[0].alternatives[0];
    if (!alt) throw new Error('Deepgram gave no transcript.');
    const words = (alt.words || []).map((w) => ({ word: w.punctuated_word || w.word, start: w.start, end: w.end, confidence: w.confidence }));
    return { text: alt.transcript || '', words };
  }

  async function coach(transcript, features, history) {
    const messages = [
      { role: 'system', content: FL.COACH_SYSTEM },
      { role: 'user', content: FL.buildCoachUser({ transcript, features, drillPrompt: drill.prompt, drillType: drill.type, drillParams: drill.params, history }) },
    ];
    const res = await gifos.ai.chat({ model: 'smartest', messages, maxTokens: 1500, temperature: 0.4 });
    try { return JSON.parse(FL.stripFences(res.text)); }
    catch (e) { return { overall: (res.text || '').slice(0, 600), strengths: [], weaknesses: [], moments: [] }; }
  }

  const isListing = (t) => t === 'letter_fluency' || t === 'semantic_fluency';

  function renderFeedback(fb, features, transcript) {
    const box = $('results'); box.innerHTML = '';
    const nums = el('div', 'nums');
    const num = (label, val) => { const n = el('div', 'num'); n.appendChild(el('div', 'num-v', String(val))); n.appendChild(el('div', 'num-l', label)); nums.appendChild(n); };
    if (isListing(drill.type)) {
      num('items said', (features.meta && features.meta.word_count) || 0);
      num('duration', ((features.meta && features.meta.duration_seconds) || 0) + 's');
      num('unique', (features.lexical && features.lexical.types) || 0);
      num('long pauses', (features.pauses && features.pauses.long_pause_count) || 0);
    } else {
      num('words/min', (features.pace && features.pace.wpm) || 0);
      num('fillers/min', (features.fillers && features.fillers.per_minute) || 0);
      num('long pauses', (features.pauses && features.pauses.long_pause_count) || 0);
      num('lexical (TTR)', (features.lexical && features.lexical.ttr) || 0);
    }
    box.appendChild(nums);

    if (fb.overall) { const o = el('div', 'overall'); o.appendChild(el('h3', null, 'Coach')); o.appendChild(el('p', null, fb.overall)); box.appendChild(o); }

    const cols = el('div', 'cols');
    const colList = (title, items, cls) => {
      const c = el('div', 'col'); c.appendChild(el('h4', null, title));
      if (!items || !items.length) c.appendChild(el('p', 'muted', '—'));
      else items.forEach((it) => { const d = el('div', 'item ' + cls); d.appendChild(el('b', null, it.label || '')); if (it.evidence) d.appendChild(el('span', null, ' — ' + it.evidence)); c.appendChild(d); });
      return c;
    };
    cols.appendChild(colList('Strengths', fb.strengths, 'good'));
    cols.appendChild(colList('Work on', fb.weaknesses, 'bad'));
    box.appendChild(cols);

    if (fb.moments && fb.moments.length) {
      const m = el('div', 'moments'); m.appendChild(el('h4', null, 'Moments'));
      fb.moments.forEach((mo) => { const row = el('div', 'moment'); row.appendChild(el('span', 'at', mo.at_seconds != null ? mo.at_seconds + 's' : '·')); const b = el('div', 'moment-b'); b.appendChild(el('div', null, mo.what_happened || '')); if (mo.suggestion) b.appendChild(el('div', 'sug', '→ ' + mo.suggestion)); row.appendChild(b); m.appendChild(row); });
      box.appendChild(m);
    }
    if (fb.trend_note) { const tn = el('div', 'trend'); tn.appendChild(el('b', null, 'Trend: ')); tn.appendChild(el('span', null, fb.trend_note)); box.appendChild(tn); }

    if (fb.suggested_drill_type && FL.DRILL_TYPES[fb.suggested_drill_type]) {
      const s = el('div', 'suggest');
      s.appendChild(el('div', 'suggest-l', 'Suggested next drill'));
      s.appendChild(el('b', null, FL.getDrillType(fb.suggested_drill_type).label));
      if (fb.drill_rationale) s.appendChild(el('div', 'muted', fb.drill_rationale));
      const go = el('button', 'primary', 'Do this drill →');
      go.onclick = () => { if (fb.suggested_drill_type === 'free') { drill = freestyle(); renderDrill(); $('drill').scrollIntoView({ behavior: 'smooth' }); } else regen(fb.suggested_drill_type); };
      s.appendChild(go); box.appendChild(s);
    }

    if (transcript) { const det = el('details', 'tx'); det.appendChild(el('summary', null, 'Transcript')); det.appendChild(el('p', null, transcript)); box.appendChild(det); }
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function run() {
    if (recording || busy) return;
    if (!has()) { setStatus('Open this inside GifOS to record.', 'bad'); return; }
    recording = true; $('rec').disabled = true;
    let clip;
    try {
      setStatus('Recording — you have up to ' + drill.duration + 's. Tap the recorder to stop.', 'live');
      clip = await gifos.recordAudio({ maxSeconds: drill.duration });
    } catch (e) {
      recording = false; $('rec').disabled = false;
      setStatus(/denied|permission/i.test(e.message) ? 'Microphone permission was declined.' : ('Recording failed: ' + e.message), 'bad');
      return;
    }
    try {
      setStatus('Transcribing with Deepgram…', 'live');
      const { text, words } = await transcribe(clip);
      if (!words.length) { setStatus('No speech detected in that take — try again.', 'bad'); return; }
      const features = FL.extractFeatures({ text, words, durationSeconds: clip.durationMs ? clip.durationMs / 1000 : undefined });

      setStatus('Coaching…', 'live');
      const history = await loadTakes();
      const feedback = await coach(text, features, history);
      renderFeedback(feedback, features, text);
      setStatus('', '');

      if (takesDb) {
        const me = await gifos.me().catch(() => ({}));
        const rec = {
          id: 't_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6),
          created_at: (history[0] && history[0].created_at ? Math.max(history[0].created_at + 1, nowish()) : nowish()),
          by: me && me.id, by_name: me && me.name,
          drill_type: drill.type, drill_prompt: drill.prompt, drill_params: drill.params,
          transcript: text, features, feedback,
        };
        try { await takesDb.put(rec); } catch (e) {}
        renderHistory(await loadTakes());
      }
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/did not declare/.test(msg)) setStatus('This app needs the "deepgram" API — reinstall the app GIF.', 'bad');
      else if (/not set up|Third-party APIs/.test(msg)) setupCard('Deepgram', 'Open <b>GifOS Settings → Third-party APIs</b> and add an API named <b>deepgram</b>: base URL <span class="mono">https://api.deepgram.com</span>, auth <b>Token</b>, paste your Deepgram key, and tick <b>Route through a CORS proxy</b> (Deepgram blocks direct browser calls).', 'Get a key at deepgram.com — new accounts include free credit.');
      else if (/No "smartest"|No "cheapest"|Settings → AI/.test(msg)) setupCard('A coach model', 'Open <b>GifOS Settings → AI models</b> and set up <b>Smartest text</b> (any OpenAI-compatible endpoint + key).', 'Your take was transcribed — set up a model and record again.');
      else setStatus('Something went wrong: ' + msg, 'bad');
    } finally { recording = false; $('rec').disabled = false; }
  }

  function nowish() { try { return Date.now(); } catch (e) { return Math.floor(performance.now()); } }

  // ---- weekly review --------------------------------------------------------
  async function runWeekly() {
    if (busy) return; setBusy(true);
    setStatus('Reviewing your week…', 'live');
    try {
      const all = await loadTakes();
      const { review } = await FL.generateWeekly(all, nowish());
      if (reviewsDb) { try { await reviewsDb.put({ id: 'wr_' + Math.random().toString(36).slice(2, 10), created_at: nowish(), review }); } catch (e) {} }
      renderWeekly(review); setStatus('', '');
    } catch (e) {
      const m = String(e && e.message || e);
      if (/No takes in the last 7 days/.test(m)) setStatus('No takes in the last 7 days yet — record a few first.', 'bad');
      else if (/not set up|Settings → AI/.test(m)) setStatus('Set up a Smartest text model in GifOS Settings → AI to run the weekly review.', 'bad');
      else setStatus('Weekly review failed: ' + m, 'bad');
    } finally { setBusy(false); }
  }
  function renderWeekly(r) {
    const box = $('weekly-out'); box.innerHTML = '';
    if (r.period_summary) { const s = el('div', 'overall'); s.appendChild(el('h3', null, 'This week')); s.appendChild(el('p', null, r.period_summary)); box.appendChild(s); }
    if (r.patterns && r.patterns.length) {
      const p = el('div', 'patterns'); p.appendChild(el('h4', null, 'Patterns'));
      r.patterns.forEach((pt) => { const row = el('div', 'pattern ' + (pt.direction || 'flat')); row.appendChild(el('span', 'dir', pt.direction === 'improving' ? '▲' : pt.direction === 'worsening' ? '▼' : '▬')); const b = el('div'); b.appendChild(el('b', null, pt.label || '')); if (pt.evidence) b.appendChild(el('div', 'muted', pt.evidence)); row.appendChild(b); p.appendChild(row); });
      box.appendChild(p);
    }
    if (r.breakthroughs && r.breakthroughs.length) {
      const b = el('div', 'moments'); b.appendChild(el('h4', null, 'Breakthroughs'));
      r.breakthroughs.forEach((bt) => { const row = el('div', 'moment'); row.appendChild(el('span', 'at', '#' + (bt.take_index != null ? bt.take_index : '·'))); row.appendChild(el('div', 'moment-b', bt.what_happened || '')); b.appendChild(row); });
      box.appendChild(b);
    }
    const f = r.recommended_focus_next_week;
    if (f) {
      const s = el('div', 'suggest'); s.appendChild(el('div', 'suggest-l', 'Focus next week'));
      s.appendChild(el('b', null, f.what || '')); if (f.why) s.appendChild(el('div', 'muted', f.why));
      if (f.drill_suggestion && FL.DRILL_TYPES[f.drill_suggestion]) { const go = el('button', 'primary', 'Start: ' + FL.getDrillType(f.drill_suggestion).label); go.onclick = () => { if (f.drill_suggestion === 'free') { drill = freestyle(); renderDrill(); } else regen(f.drill_suggestion); $('drill').scrollIntoView({ behavior: 'smooth' }); }; s.appendChild(go); }
      box.appendChild(s);
    }
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- history --------------------------------------------------------------
  function renderHistory(all) {
    const wrap = $('history'); wrap.innerHTML = '';
    if (!all.length) { wrap.appendChild(el('p', 'muted', 'No takes yet. Your history and trends show up here.')); return; }
    wrap.appendChild(el('h2', null, 'Your takes'));
    all.slice(0, 15).forEach((t) => {
      const row = el('div', 'take'), f = t.features || {};
      const top = el('div', 'take-top');
      top.appendChild(el('span', 'take-type', FL.shortLabel(t.drill_type)));
      top.appendChild(el('span', 'take-when', t.created_at ? new Date(t.created_at).toLocaleString() : ''));
      row.appendChild(top);
      const stats = el('div', 'take-stats');
      const chip = (label, val) => { const c = el('span', 'chip'); c.innerHTML = '<b>' + val + '</b> ' + label; stats.appendChild(c); };
      if (isListing(t.drill_type)) { chip('items', (f.meta && f.meta.word_count) || 0); chip('unique', (f.lexical && f.lexical.types) || 0); }
      else { chip('wpm', (f.pace && f.pace.wpm) || 0); chip('fillers/min', (f.fillers && f.fillers.per_minute) || 0); chip('TTR', (f.lexical && f.lexical.ttr) || 0); }
      row.appendChild(stats);
      if (t.feedback && t.feedback.overall) row.appendChild(el('div', 'take-overall', t.feedback.overall));
      wrap.appendChild(row);
    });
  }

  // ---- boot -----------------------------------------------------------------
  async function boot() {
    renderDrill();
    $('rec').onclick = run;
    $('weekly-btn').onclick = runWeekly;
    if (has() && gifos.onBack) gifos.onBack(() => { if (catalogOpen) { closeCatalog(); return true; } return false; });
    if (takesDb && takesDb.subscribe) { try { takesDb.subscribe((all) => renderHistory((all || []).slice().sort((a, b) => (b.created_at || 0) - (a.created_at || 0)))); } catch (e) {} }
    renderHistory(await loadTakes());
    if (!has()) setStatus('This is a GifOS app — open it on a GifOS Home Screen to record and get coached.', 'bad');
  }
  boot();
})();
