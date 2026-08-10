/*
 * Offline Cheap Text LLM Gemma — the driver. Serves the computer's
 * **Cheapest text LLM** AI role via gifos.provider.serve, powered by
 * llama.cpp compiled to WebAssembly (wllama, MIT) running entirely inside
 * the GifOS sandbox: worker + wasm from self-minted blob: URLs, zero network.
 *
 * Sibling of Offline Cheap Text LLM BitNet — same engine, different brain.
 * Both provide the 'cheapest' role; the user picks one in Settings → AI models.
 *
 * Two models, one engine:
 *  - model.gguf from the install-time ASSET CACHE (gifos.assets — the OS
 *    downloaded the manifest-pinned Gemma 3 GGUF and verified its hash;
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
  var live = { model: null, kind: null }; // 'gemma' | 'selftest'

  function bootEngine(onStatus) {
    if (enginePromise) return enginePromise;
    var say = function (m) { if (onStatus) { try { onStatus(m); } catch (e) {} } };
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
            function (buf) { return { blob: new Blob([buf]), kind: 'gemma', ctx: 2048 }; },
            function () { return { blob: new Blob([b64ToU8(window.LLM_DEMO_B64)]), kind: 'selftest', ctx: 512 }; })
        : Promise.resolve({ blob: new Blob([b64ToU8(window.LLM_DEMO_B64)]), kind: 'selftest', ctx: 512 });
      return getModel.then(function (m) {
        say(m.kind === 'gemma' ? 'Loading Gemma weights (this can take a minute)…' : 'Loading the self-test model…');
        return wllama.loadModel([m.blob], { n_ctx: m.ctx }).then(function () {
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

  // Gemma 3's turn format, matching the GGUF's tokenizer.chat_template:
  //   <start_of_turn>user\n…<end_of_turn>\n<start_of_turn>model\n
  // Gemma has NO system role — a system message is folded into the first user
  // turn, which is exactly what Google's own template does.
  var END = '<end_of_turn>';
  function buildPrompt(messages) {
    var out = '', pendingSystem = '';
    for (var i = 0; i < messages.length; i++) {
      var role = messages[i].role;
      var content = String(messages[i].content).trim();
      if (role === 'system') { pendingSystem += (pendingSystem ? '\n\n' : '') + content; continue; }
      if (role !== 'assistant' && pendingSystem) { content = pendingSystem + '\n\n' + content; pendingSystem = ''; }
      out += '<start_of_turn>' + (role === 'assistant' ? 'model' : 'user') + '\n' + content + END + '\n';
    }
    if (pendingSystem) out += '<start_of_turn>user\n' + pendingSystem + END + '\n';
    return out + '<start_of_turn>model\n';
  }

  function chatHandler(req) {
    return bootEngine().then(function (wllama) {
      var messages = Array.isArray(req.messages) && req.messages.length
        ? req.messages.map(function (m) { return { role: String(m.role || 'user'), content: String(m.content || '') }; })
        : [{ role: 'user', content: 'Hello' }];
      var maxTokens = Math.min(Math.max(1, Number(req.maxTokens) || 256), 1024);
      // RAW completion, deliberately NOT createChatCompletion — see the sibling
      // BitNet app: the chat path runs llama.cpp's PEG chat parser, which
      // demands the output begin with the generation-prompt literal and THROWS
      // when it doesn't. This provider only ever returns plain text, so it
      // formats the prompt itself and takes the raw completion.
      var params = {
        prompt: buildPrompt(messages),
        max_tokens: maxTokens,
        stream: false,
        stop: [END, '<start_of_turn>'],
      };
      if (req.temperature != null) params.temperature = Number(req.temperature);
      return wllama.createCompletion(params).then(function (res) {
        var text = (res && res.choices && res.choices[0] && res.choices[0].text) || '';
        text = String(text).split(END)[0].split('<start_of_turn>')[0].replace(/^\s+/, '');
        if (live.kind === 'selftest') {
          // Never let random-weights output masquerade as an answer.
          text = '[self-test model — token soup, not intelligence. Install the Gemma weights for real answers.]\n' + text;
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
    if (live.kind === 'gemma') { el.textContent = '● Gemma 3 1B weights loaded — real answers, fully offline.'; el.style.color = '#7aa2f7'; }
    else if (live.kind === 'selftest') { el.textContent = '● Self-test model loaded (tiny, RANDOM weights — token soup by design). The pipeline works; the Gemma download gives it a brain.'; el.style.color = '#ffb86b'; }
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
