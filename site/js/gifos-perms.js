/*
 * gifos-perms.js — the app "Abilities / Internet" acknowledgement + opt-out UI.
 *
 * Shared by BOTH places an app can run: its own tab (run.html) and inside a
 * meeting (meet.html), so the challenge — and the per-app opt-out checkboxes —
 * look and behave identically wherever the app is mounted. The runtime calls
 * window.__gifosPermissions(policy, manifest) on every mount; this module wires
 * that hook to a chip button in the host page's header.
 *
 *   GifOS.perms.attach(chipEl, { onLeave })
 *     chipEl  — the header button to use as the Abilities/Internet chip.
 *     onLeave — called if the user closes a REQUIRED-capabilities gate without
 *               setting things up (run.html closes the tab; meet.html stops the
 *               shared app). Defaults to a best-effort close/back.
 *
 * Capability opt-out is persisted per app under gifos_capoff_<appId> and the
 * runtime's brokers (brokerAI/brokerApi/brokerAgentChat/brokerCapture, motion at
 * mount) honour it — so unticking "Use your AI" actually stops the app calling.
 */
(function (root) {
  var GifOS = (root.GifOS = root.GifOS || {});
  if (GifOS.perms) return;
  var doc = root.document;

  var CSS = '' +
    '.perm-modal{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:1rem}' +
    '.perm-box{background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:.8rem;padding:1.4rem 1.5rem;max-width:440px;width:100%;max-height:90vh;overflow-y:auto;color:var(--text,#e0e0f0);font:15px system-ui,sans-serif}' +
    '.perm-box h3{margin:0 0 .5rem;font-size:1.1rem}' +
    '.perm-box .lead{color:var(--muted,#b0b0c8);font-size:.88rem;line-height:1.5;margin-bottom:1rem}' +
    '.perm-box .warn{background:#2a1710;border:1px solid #ff8a3d;color:#ffcbab;border-radius:.5rem;padding:.6rem .75rem;font-size:.82rem;line-height:1.5;margin-bottom:1rem}' +
    '.perm-row{display:flex;align-items:flex-start;gap:.6rem;padding:.55rem .2rem;border-top:1px solid #22222f}' +
    '.perm-row input{margin-top:.2rem;width:1.1rem;height:1.1rem;flex:0 0 auto;accent-color:#4a9eff}' +
    '.perm-row .host{display:block;font-weight:600;word-break:break-word;cursor:pointer}' +
    '.perm-row.any .host{color:color-mix(in srgb,#ff8a3d 60%,var(--text,#e0e0f0))}' +
    '.perm-row .desc{display:block;margin-top:.15rem;color:var(--muted,#8888aa);font-size:.8rem;line-height:1.35}' +
    '.perm-row .cap-set{display:block;margin-top:.3rem;font-size:.78rem;line-height:1.35;word-break:break-word}' +
    '.perm-row .cap-set.on{color:color-mix(in srgb,#4ade80 68%,var(--text,#e0e0f0))}' +
    '.perm-row .cap-set.off{color:color-mix(in srgb,#ff8a3d 66%,var(--text,#e0e0f0))}' +
    '.perm-row .cap-set b{font-weight:600}' +
    '.perm-box .foot{color:var(--muted,#6a6a86);font-size:.75rem;line-height:1.5;margin:1rem 0 1.1rem}' +
    '.perm-box .done{padding:.5rem 1.4rem;border-radius:.5rem;border:1px solid var(--accent,#7b5cff);background:var(--accent,#7b5cff);color:var(--onaccent,#fff);cursor:pointer;font:inherit}' +
    '.perm-btns{display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.1rem}' +
    '.perm-box .ghost{padding:.5rem 1.1rem;border-radius:.5rem;border:1px solid var(--border,#2a2a3f);background:transparent;color:var(--text,#e0e0f0);cursor:pointer;font:inherit}';
  function injectCss() {
    if (!doc || doc.getElementById('gifos-perms-css')) return;
    var s = doc.createElement('style'); s.id = 'gifos-perms-css'; s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }

  function escapeText(s) { var d = doc.createElement('div'); d.textContent = s; return d.innerHTML; }
  var CAP_LABELS = { microphone: 'Record short voice clips', camera: 'Take photos and short videos', motion: 'Sense how you tilt your phone', ai: 'Use your AI', api: 'Use your account with', agent: 'Let an AI assistant operate this app', wasm: 'Run a compiled engine on your device' };
  var CAP_DESC = {
    wasm: 'Lets the app run a compiled (WebAssembly) engine — like a chess engine or a codec — in a background worker on your device, so it can do heavy computation fast without freezing. It still cannot reach the internet: the engine runs entirely offline, sealed inside this app.',
    microphone: 'Lets the app record short audio clips — only when you tap to record, with a recorder shown the whole time. It gets the finished clip, never a live microphone feed.',
    camera: 'Lets the app take a photo or short video — only when you tap, with an indicator shown while it happens. It gets the finished shot, never a live camera feed.',
    motion: 'Lets the app read how you tilt and move your device (for tilt games, levels, and the like). It cannot see your camera or your location.',
    ai: 'Lets the app use an AI model you set up in Settings: it sends text and gets an answer back. Your API key stays in this browser — the app never sees it.',
    api: 'Lets the app use one of your own accounts you set up in Settings. GifOS attaches your key and sends the request only to that service — the app never sees the key.',
    agent: 'Adds a GifOS assistant bar that can read and click/type on <b>this app’s screen</b> for you (driven by your Smartest AI). It only ever touches this one app — never GifOS or your other apps — and never sees your key. You start it, and can stop it any time.'
  };
  var AI_ROLE_LABELS = { smartest: 'Smartest text', cheapest: 'Cheapest text', tts: 'Text → speech', stt: 'Speech → text', image: 'Text → image', image_to_video: 'Image → video', video: 'Text → video' };
  var apiNames = function (manifest) { var a = manifest && manifest.capabilities && manifest.capabilities.api; return Array.isArray(a) ? a.filter(Boolean) : []; };
  var aiRoles = function (manifest) { var a = manifest && manifest.capabilities && manifest.capabilities.ai; return Array.isArray(a) ? a.filter(function (r) { return AI_ROLE_LABELS[r]; }) : []; };
  function ls() { return root.localStorage; }
  function cfgOf(key) { try { return JSON.parse(ls().getItem(key) || '{}') || {}; } catch (e) { return {}; } }
  function hostOf(url) { try { return new URL(url).host; } catch (e) { return String(url || '').replace(/^\w+:\/\//, '').split('/')[0] || ''; } }
  // Current state of a settings-backed ability, so the consent popup can say
  // whether it's set, what to, and (if not) where to set it. "what it's set to"
  // is the configured model (or the endpoint host if no model was named) — never
  // the key, which the popup must never reveal.
  function aiRoleState(role) { var c = cfgOf('gifos_ai_config')[role] || {}; return { set: !!c.url, label: AI_ROLE_LABELS[role] || role, detail: c.url ? (c.model || hostOf(c.url)) : '' }; }
  function apiAcctState(name) { var c = cfgOf('gifos_api_config')[name] || {}; return { set: !!c.url, label: name.charAt(0).toUpperCase() + name.slice(1), detail: c.url ? hostOf(c.url) : '' }; }
  function capStatusLine(st, whereHtml) {
    return st.set
      ? '<span class="cap-set on">✓ ' + escapeText(st.label) + ' — set to <b>' + escapeText(st.detail) + '</b></span>'
      : '<span class="cap-set off">• ' + escapeText(st.label) + ' isn’t set up yet — ' + whereHtml + '</span>';
  }

  function attach(chipEl, opts) {
    opts = opts || {};
    injectCss();
    root.__gifosPermissions = function (policy, manifest) {
      if (!chipEl) return;
      var caps = Object.keys(CAP_LABELS).filter(function (k) {
        return k === 'api' ? apiNames(manifest).length : (manifest && manifest.capabilities && manifest.capabilities[k]);
      });
      var hasNet = !!(policy && policy.hasNetwork());
      if (!hasNet && !caps.length) { chipEl.style.display = 'none'; return; }
      var capSig = 'gifos_capack_' + ((manifest && manifest.appId) || 'app');
      var sig = caps.join(',') + '|' + apiNames(manifest).join(',') + '|' + aiRoles(manifest).join(',');
      function capAcked() { try { return ls().getItem(capSig) === sig; } catch (e) { return false; } }
      function ackCaps() { try { ls().setItem(capSig, sig); } catch (e) {} }
      function paintChip() {
        var unsafe = hasNet && policy.unsafe();
        chipEl.style.display = '';
        chipEl.className = 'perms ' + (unsafe ? 'unsafe' : 'ok');
        chipEl.textContent = unsafe ? '⚠ Unsafe' : (hasNet ? 'Internet' : 'Abilities');
        chipEl.title = unsafe
          ? 'Unsafe: this app can reach any website. Tap to see why, or to stop it.'
          : (hasNet ? 'This app can reach the internet. Tap to see or change what it can reach.'
            : 'What this app can do on your device. Tap to review or turn things off.');
      }
      // Per-app capability opt-out (gifos_capoff_<appId>) — the runtime brokers honour it.
      var capOffKey = 'gifos_capoff_' + ((manifest && manifest.appId) || 'app');
      function capOff() { try { var v = JSON.parse(ls().getItem(capOffKey) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
      function capEnabled(k) { return capOff().indexOf(k) < 0; }
      function setCapEnabled(k, on) {
        try { var s = capOff().filter(function (x) { return x !== k; }); if (!on) s.push(k); ls().setItem(capOffKey, JSON.stringify(s)); } catch (e) {}
      }
      function capRow(k, title, desc, statusHtml) {
        return '<label class="perm-row"><input type="checkbox" data-cap="' + escapeText(k) + '"' + (capEnabled(k) ? ' checked' : '') + '>' +
          '<span><span class="host">' + title + '</span>' +
          '<br><span class="desc">' + desc + ' Uncheck to turn this off for this app.</span>' +
          (statusHtml || '') + '</span></label>';
      }
      function capBlock() {
        if (!caps.length) return '';
        return caps.map(function (k) {
          if (k === 'api') {
            var apis = apiNames(manifest);
            var names = apis.map(function (n) { return escapeText(n.charAt(0).toUpperCase() + n.slice(1)); });
            // Per-account: is it wired up in Settings, and if so to which host?
            var apiStatus = apis.map(function (n) { return capStatusLine(apiAcctState(n), 'add it in <b>Settings → Third-party APIs</b>'); }).join('');
            return capRow('api', 'Use your ' + names.join(', ') + ' account' + (names.length > 1 ? 's' : ''), CAP_DESC.api, apiStatus);
          }
          if (k === 'ai') {
            var roles = aiRoles(manifest);
            var which = roles.length
              ? ' <span class="host" style="font-weight:400">— ' + roles.map(function (r) { return escapeText(AI_ROLE_LABELS[r]); }).join(', ') + '</span>'
              : '';
            // Per-role: is a model set up, and if so which one? (else where to set it)
            var aiStatus = roles.map(function (r) { return capStatusLine(aiRoleState(r), 'add it in <b>Settings → AI models</b>'); }).join('');
            return capRow('ai', CAP_LABELS.ai + which, CAP_DESC.ai, aiStatus);
          }
          return capRow(k, CAP_LABELS[k], CAP_DESC[k]);
        }).join('');
      }
      function openModal() {
        var bg = doc.createElement('div'); bg.className = 'perm-modal';
        var appName = (manifest && manifest.name) || 'This app';
        var rows = (hasNet ? policy.list() : []).map(function (e) {
          var any = e.host === '*';
          var desc = any
            ? 'Lets the app reach any website, so it could send whatever it sees to anyone.'
            : 'Lets the app send and receive data with this one website.';
          return '<label class="perm-row' + (any ? ' any' : '') + '">' +
            '<input type="checkbox" data-host="' + escapeText(e.host) + '" ' + (e.allowed ? 'checked' : '') + '>' +
            '<span><span class="host">' + (any ? 'Go anywhere on the internet' : 'Connect to ' + escapeText(e.host)) + '</span>' +
            '<br><span class="desc">' + desc + ' Uncheck to block it.</span></span></label>';
        }).join('');
        var unsafeNote = (hasNet && policy.unsafe())
          ? '<div class="warn"><b>Careful.</b> This one wants to reach <b>any</b> website, so it could quietly send what it sees to a stranger. Only leave this on for something you really trust — otherwise uncheck it below.</div>'
          : '';
        var netBlock = hasNet ? unsafeNote + rows : '';
        bg.innerHTML = '<div class="perm-box"><h3>' + escapeText(appName) + ' would like to…</h3>' +
          capBlock() + netBlock +
          '<p class="foot">You’re in control. It only ever gets the <b>result</b> — a clip, a photo, an answer — never your live camera, microphone, or keys. You can change this later from the app’s Abilities chip.</p>' +
          '<button class="done">Confirm &amp; Save</button></div>';
        doc.body.appendChild(bg);
        bg.addEventListener('change', function (ev) {
          var cb = ev.target; if (!cb || cb.type !== 'checkbox') return;
          var cap = cb.getAttribute('data-cap');
          if (cap) { setCapEnabled(cap, cb.checked); return; } // honoured on the next brokered call
          Promise.resolve(policy.set(cb.getAttribute('data-host'), cb.checked)).then(paintChip);
          paintChip();
        });
        function close() { if (hasNet) Promise.resolve(policy.acknowledge()).catch(function () {}); ackCaps(); bg.remove(); }
        bg.querySelector('.done').onclick = close;
        bg.addEventListener('click', function (ev) { if (ev.target === bg) close(); });
      }
      function proceed() {
        paintChip();
        chipEl.onclick = openModal;
        if ((hasNet && !policy.acknowledged()) || (caps.length && !capAcked())) openModal();
      }

      // ---- REQUIRED capabilities gate (settings-backed only) ----
      var requires = (manifest && Array.isArray(manifest.requires)) ? manifest.requires : [];
      function lsCfg(key) { try { return JSON.parse(ls().getItem(key) || '{}') || {}; } catch (e) { return {}; } }
      function aiConfigured() { var c = lsCfg('gifos_ai_config'); return Object.keys(c).some(function (k) { return c[k] && c[k].url; }); }
      function aiRoleConfigured(role) { var c = lsCfg('gifos_ai_config')[role]; return !!(c && c.url); }
      function apiConfigured(name) { var c = lsCfg('gifos_api_config')[name]; return !!(c && c.url); }
      function titleCase(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
      function missingRequired() {
        var out = [];
        requires.forEach(function (r) {
          if (r === 'ai') { if (!aiConfigured()) out.push({ what: 'an AI model', where: 'Settings → AI models' }); }
          else if (AI_ROLE_LABELS[r]) { if (!aiRoleConfigured(r)) out.push({ what: 'the ' + AI_ROLE_LABELS[r] + ' model', where: 'Settings → AI models' }); }
          else if (r === 'microphone' || r === 'camera' || r === 'motion' || r === 'network') { /* granted at use */ }
          else if (!apiConfigured(r)) out.push({ what: 'your ' + titleCase(r) + ' account', where: 'Settings → Third-party APIs' });
        });
        return out;
      }
      function defaultLeave() {
        try { root.close(); } catch (e) {}
        if (!root.closed) { if (root.history.length > 1) root.history.back(); else root.location.href = '/'; }
      }
      function showRequiredGate(missing) {
        var old = doc.getElementById('req-gate'); if (old) old.remove();
        var bg = doc.createElement('div'); bg.className = 'perm-modal'; bg.id = 'req-gate';
        var appName = (manifest && manifest.name) || 'This app';
        var rows = missing.map(function (m) {
          return '<div class="perm-row"><span><span class="host">Set up ' + escapeText(m.what) + '</span>' +
            '<br><span class="desc">On your GifOS Home Screen, open <b>' + escapeText(m.where) + '</b>.</span></span></div>';
        }).join('');
        bg.innerHTML = '<div class="perm-box"><h3>' + escapeText(appName) + ' needs setup to run</h3>' +
          '<p class="lead">This app can’t do its job until you set the following up. Your keys stay in this browser — the app never sees them.</p>' +
          rows +
          '<div class="perm-btns"><button class="ghost" id="req-leave">Close</button><button class="done" id="req-recheck">I’ve set it up</button></div></div>';
        doc.body.appendChild(bg);
        function recheck() {
          if (!missingRequired().length) { doc.removeEventListener('visibilitychange', onVis); bg.remove(); proceed(); }
          else { bg.querySelector('#req-recheck').textContent = 'Still not set up — check Settings, then tap again'; }
        }
        function onVis() { if (!doc.hidden) recheck(); }
        bg.querySelector('#req-recheck').onclick = recheck;
        bg.querySelector('#req-leave').onclick = function () { doc.removeEventListener('visibilitychange', onVis); bg.remove(); (opts.onLeave || defaultLeave)(); };
        doc.addEventListener('visibilitychange', onVis);
      }

      var missingReq = missingRequired();
      if (missingReq.length) showRequiredGate(missingReq);
      else proceed();
    };
  }

  GifOS.perms = { attach: attach };
})(typeof window !== 'undefined' ? window : globalThis);
