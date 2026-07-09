// Fluence — a spontaneous-speech coach, ported to a GifOS app.
//
// Pipeline (all in the browser, brokered by the GifOS runtime):
//   gifos.recordAudio  → a take (mic clip, captured behind the runtime's own
//                        indicator; the app never holds the live mic)
//   gifos.api('deepgram') → Deepgram nova-3 transcript with per-word confidence
//                        + filler tagging (the reason we want Deepgram over a
//                        plain Whisper endpoint). The key lives in the computer,
//                        never in this app.
//   FL.extractFeatures → deterministic pace/pause/filler/lexical features (pure
//                        JS, no LLM — the honest, comparable-across-takes signal)
//   gifos.ai.chat      → one candid coach pass, grounded in those features
//   gifos.db           → take history, so the coach can note trends
(function () {
  'use strict';

  const PROMPTS = [
    'Describe your morning routine, start to finish.',
    'Explain how something you use every day actually works.',
    'Tell the story of a decision you are glad you made.',
    'Argue for a food that is underrated.',
    'Describe a place you know well to someone who has never been.',
    'Explain a hobby to a complete beginner.',
    'Talk about a book, film, or song that stuck with you and why.',
    'Describe your ideal weekend in detail.',
    'Explain a strong opinion you hold, and steelman the other side.',
    'Walk through how you would plan a trip somewhere new.',
  ];

  const DG_QUERY = { model: 'nova-3', smart_format: 'true', punctuate: 'true', filler_words: 'true', language: 'en' };
  const MAX_SECONDS = 90;

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const has = () => typeof window.gifos !== 'undefined';
  const db = has() ? gifos.db('takes') : null;

  let recording = false;
  let pickedPrompt = PROMPTS[Math.floor(seededIndex())];

  function seededIndex() {
    // Vary the opening prompt without Date.now (fine in an app, just want spread).
    return (performance.now() % PROMPTS.length);
  }

  // ---- history --------------------------------------------------------------
  async function loadHistory() {
    if (!db) return [];
    let all = [];
    try { all = await db.getAll(); } catch (e) { all = []; }
    all.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    return all;
  }

  function renderHistory(all) {
    const wrap = $('history');
    wrap.innerHTML = '';
    if (!all.length) { wrap.appendChild(el('p', 'muted', 'No takes yet. Your history and trends show up here.')); return; }
    wrap.appendChild(el('h2', null, 'Your takes'));
    for (const t of all.slice(0, 12)) {
      const row = el('div', 'take');
      const f = t.features || {};
      const when = t.created_at ? new Date(t.created_at).toLocaleString() : '';
      row.appendChild(el('div', 'take-when', when));
      const stats = el('div', 'take-stats');
      const chip = (label, val) => { const c = el('span', 'chip'); c.innerHTML = '<b>' + val + '</b> ' + label; stats.appendChild(c); };
      chip('wpm', (f.pace && f.pace.wpm) || 0);
      chip('fillers/min', (f.fillers && f.fillers.per_minute) || 0);
      chip('long pauses', (f.pauses && f.pauses.long_pause_count) || 0);
      chip('TTR', (f.lexical && f.lexical.ttr) || 0);
      row.appendChild(stats);
      if (t.feedback && t.feedback.overall) row.appendChild(el('div', 'take-overall', t.feedback.overall));
      wrap.appendChild(row);
    }
  }

  // ---- the pipeline ---------------------------------------------------------
  function setStatus(msg, kind) { const s = $('status'); s.textContent = msg || ''; s.className = 'status' + (kind ? ' ' + kind : ''); }

  function setupNeeded(what, where, extra) {
    const box = $('results');
    box.innerHTML = '';
    const card = el('div', 'setup');
    card.appendChild(el('h3', null, what + ' isn’t set up yet'));
    const p = el('p', null, '');
    p.innerHTML = where;
    card.appendChild(p);
    if (extra) { const p2 = el('p', 'muted', ''); p2.innerHTML = extra; card.appendChild(p2); }
    box.appendChild(card);
  }

  async function transcribe(clip) {
    // Deepgram wants the raw audio bytes as the body with the clip's mime type.
    // gifos.api attaches the key (Token auth) and pins the call to Deepgram's
    // host; if Deepgram is CORS-blocked the user turns on the proxy in Settings.
    const r = await gifos.api('deepgram', {
      method: 'POST',
      path: '/v1/listen',
      query: DG_QUERY,
      headers: { 'Content-Type': clip.mime || 'audio/webm' },
      body: clip.bytes,
      as: 'json',
    });
    if (!r.ok) throw new Error('Deepgram returned ' + r.status + (r.json && r.json.err_msg ? ': ' + r.json.err_msg : ''));
    const alt = r.json && r.json.results && r.json.results.channels && r.json.results.channels[0]
      && r.json.results.channels[0].alternatives && r.json.results.channels[0].alternatives[0];
    if (!alt) throw new Error('Deepgram gave no transcript.');
    const words = (alt.words || []).map((w) => ({
      word: w.punctuated_word || w.word, start: w.start, end: w.end, confidence: w.confidence,
    }));
    return { text: alt.transcript || '', words };
  }

  async function coach(transcript, features, history) {
    const messages = [
      { role: 'system', content: FL.COACH_SYSTEM },
      { role: 'user', content: FL.buildCoachUser({ transcript, features, drillPrompt: pickedPrompt, history }) },
    ];
    const res = await gifos.ai.chat({ model: 'smartest', messages, maxTokens: 1500, temperature: 0.4 });
    let parsed;
    try { parsed = JSON.parse(FL.stripFences(res.text)); }
    catch (e) { parsed = { overall: (res.text || '').slice(0, 600), strengths: [], weaknesses: [], moments: [] }; }
    return parsed;
  }

  function renderFeedback(fb, features, transcript) {
    const box = $('results');
    box.innerHTML = '';

    // headline numbers straight from the deterministic features
    const nums = el('div', 'nums');
    const num = (label, val) => { const n = el('div', 'num'); n.appendChild(el('div', 'num-v', String(val))); n.appendChild(el('div', 'num-l', label)); nums.appendChild(n); };
    num('words/min', (features.pace && features.pace.wpm) || 0);
    num('fillers/min', (features.fillers && features.fillers.per_minute) || 0);
    num('long pauses', (features.pauses && features.pauses.long_pause_count) || 0);
    num('lexical (TTR)', (features.lexical && features.lexical.ttr) || 0);
    box.appendChild(nums);

    if (fb.overall) { const o = el('div', 'overall'); o.appendChild(el('h3', null, 'Coach')); o.appendChild(el('p', null, fb.overall)); box.appendChild(o); }

    const cols = el('div', 'cols');
    const colList = (title, items, render) => {
      const c = el('div', 'col');
      c.appendChild(el('h4', null, title));
      if (!items || !items.length) { c.appendChild(el('p', 'muted', '—')); }
      else for (const it of items) c.appendChild(render(it));
      return c;
    };
    cols.appendChild(colList('Strengths', fb.strengths, (s) => {
      const d = el('div', 'item good'); d.appendChild(el('b', null, s.label || '')); if (s.evidence) d.appendChild(el('span', null, ' — ' + s.evidence)); return d;
    }));
    cols.appendChild(colList('Work on', fb.weaknesses, (w) => {
      const d = el('div', 'item bad'); d.appendChild(el('b', null, w.label || '')); if (w.evidence) d.appendChild(el('span', null, ' — ' + w.evidence)); return d;
    }));
    box.appendChild(cols);

    if (fb.moments && fb.moments.length) {
      const m = el('div', 'moments'); m.appendChild(el('h4', null, 'Moments'));
      for (const mo of fb.moments) {
        const row = el('div', 'moment');
        row.appendChild(el('span', 'at', (mo.at_seconds != null ? mo.at_seconds + 's' : '·')));
        const body = el('div', 'moment-b');
        body.appendChild(el('div', null, mo.what_happened || ''));
        if (mo.suggestion) body.appendChild(el('div', 'sug', '→ ' + mo.suggestion));
        row.appendChild(body); m.appendChild(row);
      }
      box.appendChild(m);
    }
    if (fb.trend_note) { const tn = el('div', 'trend'); tn.appendChild(el('b', null, 'Trend: ')); tn.appendChild(el('span', null, fb.trend_note)); box.appendChild(tn); }

    if (transcript) {
      const det = el('details', 'tx'); det.appendChild(el('summary', null, 'Transcript'));
      det.appendChild(el('p', null, transcript)); box.appendChild(det);
    }
  }

  async function run() {
    if (recording) return;
    if (!has()) { setStatus('Open this inside GifOS to record.', 'bad'); return; }
    recording = true;
    $('rec').disabled = true;
    let clip;
    try {
      setStatus('Recording — speak your answer. Tap the recorder to stop.', 'live');
      clip = await gifos.recordAudio({ maxSeconds: MAX_SECONDS });
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
      const history = await loadHistory();
      const feedback = await coach(text, features, history);

      renderFeedback(feedback, features, text);
      setStatus('', '');

      // persist the take (history + trends)
      if (db) {
        const me = await gifos.me().catch(() => ({}));
        const rec = {
          id: 't_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6),
          created_at: (history[0] && history[0].created_at ? Math.max(history[0].created_at + 1, nowish()) : nowish()),
          by: me && me.id, by_name: me && me.name,
          drill_prompt: pickedPrompt, transcript: text, features, feedback,
        };
        try { await db.put(rec); } catch (e) {}
        renderHistory(await loadHistory());
      }
    } catch (e) {
      const msg = String(e && e.message || e);
      if (/did not declare/.test(msg)) setStatus('This app needs the "deepgram" API — reinstall the app GIF.', 'bad');
      else if (/not set up|Third-party APIs/.test(msg)) setupNeeded('Deepgram', 'Open <b>GifOS Settings → Third-party APIs</b> and add an API named <b>deepgram</b>: base URL <span class="mono">https://api.deepgram.com</span>, auth <b>Token</b>, paste your Deepgram key, and tick <b>Route through a CORS proxy</b> (Deepgram blocks direct browser calls).', 'Get a key at deepgram.com — new accounts include free credit.');
      else if (/No "smartest"|No "cheapest"|Settings → AI/.test(msg)) setupNeeded('A coach model', 'Open <b>GifOS Settings → AI models</b> and set up a <b>Smartest text</b> model (any OpenAI-compatible endpoint + key).', 'The transcript was captured — set up a model and record again.');
      else setStatus('Something went wrong: ' + msg, 'bad');
    } finally {
      recording = false; $('rec').disabled = false;
    }
  }

  // monotonic-ish timestamp without Date.now for determinism friendliness; the
  // app is fine using real time, and history sort only needs ordering.
  function nowish() { try { return Date.now(); } catch (e) { return Math.floor(performance.now()); } }

  function newPrompt() {
    let i = Math.floor((performance.now() + Math.random() * 1000) % PROMPTS.length);
    pickedPrompt = PROMPTS[i];
    $('prompt').textContent = pickedPrompt;
  }

  // ---- boot -----------------------------------------------------------------
  async function boot() {
    $('prompt').textContent = pickedPrompt;
    $('rec').onclick = run;
    $('shuffle').onclick = newPrompt;
    if (has() && gifos.onBack) gifos.onBack(() => { /* nothing modal to close in v1 */ return false; });
    if (db && db.subscribe) { try { db.subscribe((all) => renderHistory((all || []).slice().sort((a, b) => (b.created_at || 0) - (a.created_at || 0)))); } catch (e) {} }
    renderHistory(await loadHistory());
    if (!has()) setStatus('This is a GifOS app — open it on a GifOS Home Screen to record and get coached.', 'bad');
  }
  boot();
})();
