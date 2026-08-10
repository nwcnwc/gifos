/*
 * Offline Cheap Text LLM Gemma 4 — the driver. Serves the computer's
 * **Cheapest text LLM** AI role via gifos.provider.serve, powered by
 * llama.cpp compiled to WebAssembly (wllama, MIT) running entirely inside
 * the GifOS sandbox: worker + wasm from self-minted blob: URLs, zero network.
 *
 * Third sibling of Offline Cheap Text LLM BitNet / Gemma 3 — same engine,
 * different brain. All three provide the 'cheapest' role; the user picks one
 * in Settings → AI models. This is the Apache-2.0 option.
 *
 * Two models, one engine:
 *  - model.gguf from the install-time ASSET CACHE (gifos.assets — the OS
 *    downloaded the manifest-pinned Gemma 4 GGUF and verified its hash;
 *    gigabyte-class, docs/providers.md). Used whenever present.
 *  - the in-GIF SELF-TEST model (~4.9 MB, real tokenizer, tiny RANDOM
 *    weights — deliberate token soup) so the pipeline is provable instantly,
 *    offline, and in the release gate. The UI never pretends it is a brain.
 */
(function () {
  'use strict';

  var b64ToU8 = function (b64) {
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  };

  var enginePromise = null;
  var live = { model: null, kind: null }; // 'gemma4' | 'selftest'

  function bootEngine(onStatus) {
    if (enginePromise) return enginePromise;
    var say = function (m, frac) { if (onStatus) { try { onStatus(m, frac); } catch (e) {} } };
    enginePromise = Promise.resolve().then(function () {
      if (!window.WllamaLib || !window.WllamaLib.Wllama) throw new Error('The engine library failed to load.');
      if (!window.LLM_WASM_B64) throw new Error('The engine wasm failed to load.');
      say('Starting the engine…');
      var wasmUrl = URL.createObjectURL(new Blob([b64ToU8(window.LLM_WASM_B64)], { type: 'application/wasm' }));
      var wllama = new window.WllamaLib.Wllama({ 'default': wasmUrl });
      // Prefer the real, hash-pinned Gemma weights from the asset cache; fall
      // back to the in-GIF self-test model when the download hasn't completed
      // on this computer.
      var getModel = (window.gifos && gifos.assets)
        ? gifos.assets('model.gguf').then(
            function (buf) { return { blob: new Blob([buf]), kind: 'gemma4', ctx: 2048 }; },
            function () { return { blob: new Blob([b64ToU8(window.LLM_DEMO_B64)]), kind: 'selftest', ctx: 512 }; })
        : Promise.resolve({ blob: new Blob([b64ToU8(window.LLM_DEMO_B64)]), kind: 'selftest', ctx: 512 });
      return getModel.then(function (m) {
        var loadingLabel = m.kind === 'gemma4' ? 'Loading Gemma 4 weights (this can take a minute)…' : 'Loading the self-test model…';
        say(loadingLabel);
        return wllama.loadModel([m.blob], { n_ctx: m.ctx,
          // The OS shows this while the user waits. Loading a
          // gigabyte of weights through a single-threaded wasm engine
          // is the longest wait GifOS ever asks anyone to sit through,
          // and it is the one part that can be honestly measured.
          progressCallback: function (pr) {
            if (!pr || !pr.total) return;
            say(loadingLabel, pr.loaded / pr.total);
          } }).then(function () {
          live.kind = m.kind;
          live.model = wllama;
          say('');
          return wllama;
        });
      });
    });
    enginePromise.catch(function () { enginePromise = null; }); // retryable
    return enginePromise;
  }

  // Gemma 4's turn format — NOT Gemma 3's <start_of_turn>. Taken from
  // llama.cpp's own rendering of this GGUF's canonical template, not guessed:
  //   <|turn>user\n...<turn|>\n<|turn>model\n
  //
  // THINKING IS DELIBERATELY OFF. Gemma 4 is a reasoning model: its default
  // template opens with a system turn holding <|think|>, and it then narrates a
  // "Thinking Process" before answering. Two reasons that is wrong here, and
  // neither is token cost (the tokens are local and free):
  //   1. TIME. The engine runs single-threaded in the browser, so every
  //      reasoning token is wall-clock the user waits through.
  //   2. It can return NOTHING. Measured: a one-sentence question came back
  //      with EMPTY content and finish_reason "length" because the thinking
  //      ate the caller's whole max_tokens budget.
  // Rendering with enable_thinking=false drops that system turn entirely,
  // which is exactly the prompt built below.
  var T_OPEN = '<|turn>', T_CLOSE = '<turn|>';
  function buildPrompt(messages) {
    var out = '', pendingSystem = '';
    for (var i = 0; i < messages.length; i++) {
      var role = messages[i].role;
      var content = String(messages[i].content).trim();
      if (role === 'system') { pendingSystem += (pendingSystem ? '\n\n' : '') + content; continue; }
      if (role !== 'assistant' && pendingSystem) { content = pendingSystem + '\n\n' + content; pendingSystem = ''; }
      out += T_OPEN + (role === 'assistant' ? 'model' : 'user') + '\n' + content + T_CLOSE + '\n';
    }
    if (pendingSystem) out += T_OPEN + 'user\n' + pendingSystem + T_CLOSE + '\n';
    return out + T_OPEN + 'model\n';
  }

  function chatHandler(req, ctx) {
    // KEEPALIVE. The OS times a provider out on SILENCE, not on total time, so
    // a slow answer survives and a wedged one still fails. Everything here can
    // legitimately take minutes on a single-threaded wasm engine — including
    // the FIRST call, which also loads the weights (up to ~1.8 GB) before a
    // single token exists — so the ping runs from the very start, not just
    // once generation begins.
    var beat = function (note, frac) { if (ctx && typeof ctx.progress === 'function') { try { ctx.progress(note, frac); } catch (e) {} } };
    beat(); // at once: "request received, working" — before any weights load
    var alive = ctx && typeof ctx.progress === 'function' ? setInterval(beat, 5000) : null;
    var done = function (v) { if (alive) clearInterval(alive); return v; };
    var died = function (e) { if (alive) clearInterval(alive); throw e; };
    return bootEngine(beat).then(function (wllama) {
      var messages = Array.isArray(req.messages) && req.messages.length
        ? req.messages.map(function (m) { return { role: String(m.role || 'user'), content: String(m.content || '') }; })
        : [{ role: 'user', content: 'Hello' }];
      var maxTokens = Math.min(Math.max(1, Number(req.maxTokens) || 256), 1024);
      // RAW completion, deliberately NOT createChatCompletion — see the sibling
      // apps: the chat path runs llama.cpp's PEG chat parser, which demands the
      // output begin with the generation-prompt literal and THROWS when it
      // doesn't. Going raw also keeps thinking off, since buildPrompt() is the
      // enable_thinking=false rendering.
      var params = {
        prompt: buildPrompt(messages),
        max_tokens: maxTokens,
        stop: [T_CLOSE, T_OPEN],
      };
      if (req.temperature != null) params.temperature = Number(req.temperature);
      // STREAM, so the OS can tell "slow" from "stuck". The broker's timeout is
      // an IDLE one: every chunk pings it, so a long answer is never cut off
      // mid-generation, while a genuinely wedged engine still fails. Before
      // this, a short essay on a 2B model hit a flat 3-minute cap and the
      // user's wait was thrown away.
      var acc = '';
      params.stream = true;
      var tok = 0;
      params.onData = function (chunk) {
        try {
          var t = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].text;
          if (t) {
            acc += t;
            // Tell the OS we are past loading and actually writing, then keep a
            // running count. Not every token: the note is for a human reading a
            // line of text, and repainting it 30 times a second is not reading.
            tok++;
            if (tok === 1 || tok % 16 === 0) beat('Writing the answer… (' + tok + ' tokens)');
          }
        } catch (e) { /* a malformed chunk must not kill the generation */ }
      };
      return wllama.createCompletion(params).then(function () {
        var text = acc;
        text = String(text).split(T_CLOSE)[0].split(T_OPEN)[0].replace(/^\s+/, '');
        if (live.kind === 'selftest') {
          // Never let random-weights output masquerade as an answer.
          text = '[self-test model — token soup, not intelligence. Install the Gemma 4 weights for real answers.]\n' + text;
        }
        return { text: text };
      });
    }).then(done, died);
  }

  if (window.gifos && gifos.provider && gifos.provider.serve) {
    gifos.provider.serve({ cheapest: chatHandler });
  }

  // ---- the visible page: status + try box -----------------------------------
  var $ = function (id) { return document.getElementById(id); };
  function setStatus(m) { var el = $('status'); if (el) el.textContent = m || ''; }
  function paintModelBadge() {
    var el = $('model-live'); if (!el) return;
    if (live.kind === 'gemma4') { el.textContent = '● Gemma 4 E2B weights loaded — real answers, fully offline.'; el.style.color = '#a78bfa'; }
    else if (live.kind === 'selftest') { el.textContent = '● Self-test model loaded (tiny, RANDOM weights — token soup by design). The pipeline works; the Gemma 4 download gives it a brain.'; el.style.color = '#ffb86b'; }
  }
  if ($('ask')) {
    $('ask').onclick = function () {
      var q = $('q').value.trim(); if (!q) return;
      $('ask').disabled = true;
      $('a').textContent = '…';
      bootEngine(setStatus)
        .then(function () { return chatHandler({ messages: [{ role: 'user', content: q }], maxTokens: 96 }); })
        .then(function (r) { $('a').textContent = r.text || '(empty)'; paintModelBadge(); })
        .catch(function (e) { $('a').textContent = '⚠ ' + (e && e.message || e); })
        .then(function () { $('ask').disabled = false; });
    };
    // Warm the engine as soon as the page opens, so the badge tells the truth
    // without the user having to ask something first.
    bootEngine(setStatus).then(paintModelBadge, function (e) { setStatus('⚠ ' + (e && e.message || e)); });
  }
})();
