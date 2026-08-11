/*
 * Offline Cheap Text LLM BitNet — the driver. Serves the computer's
 * **Cheapest text LLM** AI role via gifos.provider.serve, powered by
 * llama.cpp compiled to WebAssembly (wllama, MIT) running entirely inside
 * the GifOS sandbox: worker + wasm from self-minted blob: URLs, zero network.
 *
 * Two models, one engine:
 *  - model.gguf from the install-time ASSET CACHE (gifos.assets — the OS
 *    downloaded the manifest-pinned BitNet b1.58 ternary GGUF and verified
 *    its hash; gigabyte-class, docs/providers.md). Used whenever present.
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
  var live = { model: null, kind: null }; // 'bitnet' | 'selftest'

  function bootEngine(onStatus) {
    if (enginePromise) return enginePromise;
    var say = function (m, frac) { if (onStatus) { try { onStatus(m, frac); } catch (e) {} } };
    enginePromise = Promise.resolve().then(function () {
      if (!window.WllamaLib || !window.WllamaLib.Wllama) throw new Error('The engine library failed to load.');
      if (!window.LLM_WASM_B64) throw new Error('The engine wasm failed to load.');
      say('Starting the engine…');
      var wasmUrl = URL.createObjectURL(new Blob([b64ToU8(window.LLM_WASM_B64)], { type: 'application/wasm' }));
      var wllama = new window.WllamaLib.Wllama({ 'default': wasmUrl });
      // Prefer the real, hash-pinned BitNet weights from the asset cache;
      // fall back to the in-GIF self-test model when the pin isn't declared
      // or its download hasn't completed on this computer.
      var getModel = (window.gifos && gifos.assets)
        ? gifos.assets('model.gguf').then(
            function (buf) { return { blob: new Blob([buf]), kind: 'bitnet', ctx: 2048 }; },
            function () { return { blob: new Blob([b64ToU8(window.LLM_DEMO_B64)]), kind: 'selftest', ctx: 512 }; })
        : Promise.resolve({ blob: new Blob([b64ToU8(window.LLM_DEMO_B64)]), kind: 'selftest', ctx: 512 });
      return getModel.then(function (m) {
        var loadingLabel = m.kind === 'bitnet' ? 'Loading BitNet weights (this can take a minute)…' : 'Loading the self-test model…';
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

  // BitNet b1.58 2B-4T's prompt format, which is also what the GGUF's
  // tokenizer.chat_template renders:
  //   User: <text><|eot_id|>Assistant: <text><|eot_id|>…  then "Assistant: "
  var EOT = '<|eot_id|>';
  function buildPrompt(messages) {
    var out = '';
    for (var i = 0; i < messages.length; i++) {
      var role = messages[i].role === 'assistant' ? 'Assistant'
        : messages[i].role === 'system' ? 'System' : 'User';
      out += role + ': ' + String(messages[i].content).trim() + EOT;
    }
    return out + 'Assistant: ';
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
      // RAW completion, deliberately NOT createChatCompletion. The chat path
      // runs llama.cpp's PEG chat parser, which requires the model's output to
      // begin with the generation-prompt literal and THROWS when it doesn't —
      // and `skip_chat_parsing` does not save you: force_pure_content still
      // builds `literal(generation_prompt) << content(rest)`. The self-test
      // model emits random tokens, so that parse failed ~half the time, at
      // random, which is exactly the kind of flake a release gate cannot carry.
      // This provider only ever returns plain text, so it formats the prompt
      // itself and takes the raw completion.
      var params = {
        prompt: buildPrompt(messages),
        max_tokens: maxTokens,
        stop: [EOT, '\nUser:', 'User:'],
      };
      if (req.temperature != null) params.temperature = Number(req.temperature);
      // STREAM, so the OS can tell "slow" from "stuck". The broker's timeout is
      // an IDLE one: every chunk pings it, so a long answer is never cut off
      // mid-generation, while a genuinely wedged engine still fails. Before
      // this, a short essay on a 2B model hit a flat 3-minute cap and the
      // user's wait was thrown away.
      // ONE definition of what the answer is, used by the stream and by the
      // final result — two copies would be two answers.
      var cleanUp = function (raw) { return String(raw).split(EOT)[0].replace(/^\s+/, ''); };
      var acc = '';
      params.stream = true;
      var tok = 0;
      // The ANSWER AS IT IS WRITTEN, not just a token count. Every fragment goes
      // to ctx.delta, which the OS hands to the asking app's onDelta — the same
      // channel a streaming cloud endpoint uses, so Ask AI paints an on-device
      // answer exactly the way it paints a hosted one. Before this the tokens
      // existed here and had nowhere to go: they were accumulated privately and
      // delivered in one lump, so a six-minute answer showed nothing for six
      // minutes and then everything at once.
      //
      // What is streamed is the CLEANED text — the same trimming the final
      // answer gets — so you never watch template scaffolding being typed and
      // then see it vanish. `sent` is how much of it has already gone.
      // Self-test output is token soup and must NEVER masquerade as an answer,
      // so its label is streamed FIRST — before a single token of soup — rather
      // than being prepended once the whole thing is already on screen.
      var label = live.kind === 'selftest'
        ? '[self-test model — token soup, not intelligence. Install the BitNet weights for real answers.]\n' : '';
      var canDelta = ctx && typeof ctx.delta === 'function';
      var sent = 0, labeled = false;
      var stream = function () {
        if (!canDelta) return;
        var clean = cleanUp(acc);
        if (clean.length <= sent) return;
        if (label && !labeled) { ctx.delta(label); labeled = true; }
        ctx.delta(clean.slice(sent));
        sent = clean.length;
      };
      params.onData = function (chunk) {
        try {
          var t = chunk && chunk.choices && chunk.choices[0] && chunk.choices[0].text;
          if (t) {
            acc += t;
            stream();
            // Tell the OS we are past loading and actually writing, then keep a
            // running count. Not every token: the note is for a human reading a
            // line of text, and repainting it 30 times a second is not reading.
            tok++;
            if (tok === 1 || tok % 16 === 0) beat('Writing the answer… (' + tok + ' tokens)');
          }
        } catch (e) { /* a malformed chunk must not kill the generation */ }
      };
      return wllama.createCompletion(params).then(function () {
        // Same label, same text, whether it was watched arriving or not.
        return { text: label + cleanUp(acc) };
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
    if (live.kind === 'bitnet') { el.textContent = '● BitNet b1.58 weights loaded — real answers, fully offline.'; el.style.color = '#4ade80'; }
    else if (live.kind === 'selftest') { el.textContent = '● Self-test model loaded (tiny, RANDOM weights — token soup by design). The pipeline works; the BitNet download gives it a brain.'; el.style.color = '#ffb86b'; }
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
