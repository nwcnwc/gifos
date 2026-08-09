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
    var say = function (m) { if (onStatus) { try { onStatus(m); } catch (e) {} } };
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
        say(m.kind === 'bitnet' ? 'Loading BitNet weights (this can take a minute)…' : 'Loading the self-test model…');
        // skip_chat_parsing: this provider returns PLAIN TEXT — it never wants
        // llama.cpp's structured chat parser (tool calls, reasoning blocks).
        // That parser THROWS on anything it can't parse, and the self-test
        // model emits token soup by design, so leaving it on makes the
        // self-test path fail outright ("Failed to parse input at pos 0: …").
        return wllama.loadModel([m.blob], { n_ctx: m.ctx, skip_chat_parsing: true }).then(function () {
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

  function chatHandler(req) {
    return bootEngine().then(function (wllama) {
      var messages = Array.isArray(req.messages) && req.messages.length
        ? req.messages.map(function (m) { return { role: String(m.role || 'user'), content: String(m.content || '') }; })
        : [{ role: 'user', content: 'Hello' }];
      var maxTokens = Math.min(Math.max(1, Number(req.maxTokens) || 256), 1024);
      var params = { messages: messages, max_tokens: maxTokens, stream: false };
      if (req.temperature != null) params.temperature = Number(req.temperature);
      return wllama.createChatCompletion(params).then(function (res) {
        var text = (res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
        if (live.kind === 'selftest') {
          // Never let random-weights output masquerade as an answer.
          text = '[self-test model — token soup, not intelligence. Install the BitNet weights for real answers.]\n' + text;
        }
        return { text: text };
      });
    });
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
