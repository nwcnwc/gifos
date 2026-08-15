/*
 * gifos-perms.js — the app "Abilities / Internet" acknowledgement + opt-out UI.
 *
 * Used by every way an app can run — solo in its own tab, in an app room, or
 * inside a meeting (all one page now: run.html) — so the challenge, and the
 * per-app opt-out checkboxes, look and behave identically wherever the app is
 * mounted. The runtime calls
 * window.__gifosPermissions(policy, manifest, launchReq) on every mount; this
 * module wires that hook to a chip button in the host page's header.
 *
 * launchReq is what the opening LINK asked the app to do (go.<key>=<value>,
 * runtime.js declaredLaunch) — { asked, grant(), deny() } — or null, which is
 * the ordinary case. This sheet is the ONLY thing that can call grant(), so
 * every path out of here that does not reach the buttons must deny().
 *
 *   GifOS.perms.attach(chipEl, { onLeave })
 *     chipEl  — the header button to use as the Abilities/Internet chip.
 *     onLeave — called if the user closes a REQUIRED-capabilities gate without
 *               setting things up (a solo tab closes itself; a shared app stops).
 *               Defaults to a best-effort close/back.
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
    '.perm-row .cap-name{display:block;margin-top:.15rem;opacity:.85;font-size:.74rem}' +
    '.perm-row .cap-name b{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600}' +
    '.perm-row .cap-set b{font-weight:600}' +
    '.perm-row .launch-val{color:var(--text,#e0e0f0);word-break:break-word}' +
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
  var CAP_LABELS = { microphone: 'Record short voice clips', camera: 'Take photos and short videos', motion: 'Sense how you tilt your phone', ai: 'Use your AI', api: 'Use your account with', agent: 'Let an AI assistant operate this app', wasm: 'Run a compiled engine on your device', gpu: 'Use your device’s graphics chip (GPU)', pool: 'Pool downloads with the room' };
  var CAP_DESC = {
    wasm: 'Lets the app run a compiled (WebAssembly) engine — like a chess engine or a codec — in a background worker on your device, so it can do heavy computation fast without freezing. It still cannot reach the internet: the engine runs entirely offline, sealed inside this app.',
    gpu: 'Lets the app run computations on your device’s graphics chip (GPU) via WebGPU — for fast on-device AI, image, or physics work. It still cannot reach the internet: the GPU has no network path, and everything runs offline, sealed inside this app.',
    microphone: 'Lets the app record short audio clips — only when you tap to record, with a recorder shown the whole time. It gets the finished clip, never a live microphone feed.',
    camera: 'Lets the app take a photo or short video — only when you tap, with an indicator shown while it happens. It gets the finished shot, never a live camera feed.',
    motion: 'Lets the app read how you tilt and move your device (for tilt games, levels, and the like). It cannot see your camera or your location.',
    ai: 'Lets the app use an AI model you set up in Settings: it sends text and gets an answer back. Your API key stays in this browser — the app never sees it. A role assigned to a Provider app is answered entirely on this device.',
    api: 'Lets the app use one of your own accounts you set up in Settings. GifOS attaches your key and sends the request only to that service — the app never sees the key.',
    pool: 'When you are in a room with other people, this app shares what it downloads from the sites below with them, and uses what they downloaded instead of fetching it again. It is how ten people in one place cost a donated map server one download instead of ten. Two things to know: the others learn WHICH addresses you fetched (in a shared world that is where everyone already is, but it is not nothing), and what arrives comes from them rather than from the site — this app treats it as data, not as instructions. Your keyed accounts are never pooled.',
    agent: 'Adds a GifOS assistant bar that can read and click/type on <b>this app’s screen</b> for you (driven by your Smartest AI). It only ever touches this one app — never GifOS or your other apps — and never sees your key. You start it, and can stop it any time.'
  };
  var AI_ROLE_LABELS = { smartest: 'Smartest text LLM', cheapest: 'Cheapest text LLM', tts: 'Text → speech', stt: 'Speech → text', image: 'Text → image', image_to_video: 'Image → video', video: 'Text → video' };
  // Hosts an app has asked to POOL. A subset of its declared network hosts, and
  // never one of its keyed API hosts — see poolHosts() in runtime.js, which is
  // where that is enforced rather than merely described.
  var poolHosts = function (manifest) {
    var p = manifest && manifest.capabilities && manifest.capabilities.pool;
    return Array.isArray(p) ? p.filter(Boolean) : [];
  };
  var apiNames = function (manifest) { var a = manifest && manifest.capabilities && manifest.capabilities.api; return Array.isArray(a) ? a.filter(Boolean) : []; };
  var aiRoles = function (manifest) { var a = manifest && manifest.capabilities && manifest.capabilities.ai; return Array.isArray(a) ? a.filter(function (r) { return AI_ROLE_LABELS[r]; }) : []; };
  function ls() { return root.localStorage; }
  function cfgOf(key) { try { return JSON.parse(ls().getItem(key) || '{}') || {}; } catch (e) { return {}; } }
  function hostOf(url) { try { return new URL(url).host; } catch (e) { return String(url || '').replace(/^\w+:\/\//, '').split('/')[0] || ''; } }
  // Current state of a settings-backed ability, so the consent popup can say
  // whether it's set, what to, and (if not) where to set it. "what it's set to"
  // is the configured model (or the endpoint host if no model was named) — never
  // the key, which the popup must never reveal. A role may instead be served by
  // a PROVIDER APP (docs/providers.md) — then the sheet names the app, because
  // that's the third party the user's data flows into, and makes the stronger
  // on-device claim the network-less rule earns.
  function aiRoleState(role) {
    var c = cfgOf('gifos_ai_config')[role] || {};
    if (c.app) return { set: true, label: AI_ROLE_LABELS[role] || role, detail: (c.appName || 'a Provider app') + ' — an app on this device; nothing leaves this browser' };
    return { set: !!c.url, label: AI_ROLE_LABELS[role] || role, detail: c.url ? (c.model || hostOf(c.url)) : '' };
  }
  // Case-insensitive, for the same reason the runtime's lookup is (see
  // apiEntry there): Settings stores the name the user typed and the app asks
  // for the one it declared. "Maptiler" and "maptiler" are the same account,
  // and telling someone to set up what they have already set up is the worst
  // thing this sheet can do.
  function apiCfgLoose(name) {
    var all = cfgOf('gifos_api_config');
    if (all[name]) return all[name];
    var want = String(name || '').toLowerCase();
    for (var k in all) if (k.toLowerCase() === want) return all[k];
    return {};
  }
  function apiAcctState(name) { var c = apiCfgLoose(name) || {}; return { set: !!c.url, key: name, label: name.charAt(0).toUpperCase() + name.slice(1), detail: c.url ? hostOf(c.url) : '' }; }
  function capStatusLine(st, whereHtml) {
    return st.set
      ? '<span class="cap-set on">✓ ' + escapeText(st.label) + ' — set to <b>' + escapeText(st.detail) + '</b></span>'
      // NAME THE ROW EXACTLY. This line used to title-case the app's declared
      // identifier and print "Maptiler isn't set up yet", which reads as an
      // instruction to create a row called "Maptiler" — and the lookup was
      // case-sensitive, so doing precisely what it said produced a saved,
      // tested, working key that the app still could not see. The lookup is
      // loose now, and this says which name to use and that its capitalisation
      // does not matter, so the instruction and the behaviour agree.
      : '<span class="cap-set off">• ' + escapeText(st.label) + ' isn’t set up yet — ' + whereHtml
        + '<br><span class="cap-name">Name the entry <b>' + escapeText(st.key || st.label)
        + '</b> (capitalisation does not matter).</span></span>';
  }

  function attach(chipEl, opts) {
    opts = opts || {};
    injectCss();
    root.__gifosPermissions = function (policy, manifest, launchReq) {
      // What the LINK asked the app to do (runtime.js declaredLaunch). This
      // sheet is the ONLY thing that can release it, so every path out of here
      // that does not reach the buttons must deny — including "there is no chip
      // to hang the sheet on". Fail shut, always.
      var asked = (launchReq && launchReq.asked) || [];
      var launchDone = false;
      function grantLaunch() { if (launchReq && !launchDone) { launchDone = true; launchReq.grant(); } }
      function denyLaunch() { if (launchReq && !launchDone) { launchDone = true; launchReq.deny(); } }
      if (!chipEl) { denyLaunch(); return; }
      var caps = Object.keys(CAP_LABELS).filter(function (k) {
        if (k === 'api') return apiNames(manifest).length;
        if (k === 'pool') return poolHosts(manifest).length;
        return manifest && manifest.capabilities && manifest.capabilities[k];
      });
      var hasNet = !!(policy && policy.hasNetwork());
      // An app with no abilities and no network still gets the sheet when a
      // link is asking it to do something — that ask is the whole reason the
      // sheet exists here, and it is never covered by a stored acknowledgement
      // (the words are different every time, so consent has to be too).
      if (!hasNet && !caps.length && !asked.length) { chipEl.style.display = 'none'; return; }
      var capSig = 'gifos_capack_' + ((manifest && manifest.appId) || 'app');
      var sig = caps.join(',') + '|' + apiNames(manifest).join(',') + '|' + aiRoles(manifest).join(',') + '|' + poolHosts(manifest).join(',');
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
          if (k === 'pool') {
            var ph = poolHosts(manifest);
            return capRow(k, CAP_LABELS.pool, CAP_DESC.pool
              + '<br><span class="cap-name">Pooled: <b>' + escapeText(ph.join(', ')) + '</b></span>');
          }
          return capRow(k, CAP_LABELS[k], CAP_DESC[k]);
        }).join('');
      }
      function openModal() {
        var bg = doc.createElement('div'); bg.className = 'perm-modal';
        var appName = (manifest && manifest.name) || 'This app';
        // A link is asked about ONCE. Reopening this sheet later from the
        // Abilities chip is a person reviewing what the app can do — showing
        // them a settled ask again would read as the link asking twice, over
        // buttons that can no longer decide anything.
        var ask = launchDone ? [] : asked;
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
        // THE LINK'S ASK, FIRST AND IN ITS OWN WORDS. Whoever sent the link
        // wrote these values, so they are shown as quoted DATA — the app's
        // manifest supplies the sentence around them, the link only fills the
        // blank. Nothing here is a checkbox: this is one yes-or-no, and the
        // "no" still opens the app, which is why it is a button and not an X.
        var launchBlock = ask.length
          ? '<div class="warn" id="perm-launch"><b>The link you followed is asking for this.</b> ' +
              'It comes from whoever sent you here, not from ' + escapeText(appName) + '.</div>' +
            ask.map(function (a) {
              return '<div class="perm-row"><span><span class="host">' + escapeText(a.label) + '</span>' +
                '<br><span class="desc">' + (a.detail ? escapeText(a.detail) + ' ' : '') +
                'The link says: <b class="launch-val">' + escapeText(a.value) + '</b></span></span></div>';
            }).join('')
          : '';
        var buttons = ask.length
          ? '<div class="perm-btns"><button class="ghost" id="perm-plain">Just open it</button>' +
            '<button class="done" id="perm-go">Yes, do that</button></div>'
          : '<button class="done">Confirm &amp; Save</button>';
        var title = ask.length
          ? escapeText(appName) + ' is about to open on something'
          : escapeText(appName) + ' would like to…';
        bg.innerHTML = '<div class="perm-box"><h3>' + title + '</h3>' +
          launchBlock + capBlock() + netBlock +
          '<p class="foot">You’re in control. It only ever gets the <b>result</b> — a clip, a photo, an answer — never your live camera, microphone, or keys. You can change this later from the app’s Abilities chip.</p>' +
          buttons + '</div>';
        doc.body.appendChild(bg);
        bg.addEventListener('change', function (ev) {
          var cb = ev.target; if (!cb || cb.type !== 'checkbox') return;
          var cap = cb.getAttribute('data-cap');
          if (cap) { setCapEnabled(cap, cb.checked); return; } // honoured on the next brokered call
          Promise.resolve(policy.set(cb.getAttribute('data-host'), cb.checked)).then(paintChip);
          paintChip();
        });
        // close() settles the ABILITIES question (network + capabilities). The
        // link's ask is settled separately by whichever button was pressed —
        // and a dismissal (backdrop, or reopening the sheet later from the
        // chip) is a NO, because "they tapped somewhere else" is not consent to
        // act on a stranger's instruction.
        function close() {
          if (hasNet) Promise.resolve(policy.acknowledge()).catch(function () {});
          ackCaps(); denyLaunch(); bg.remove();
          // An app with no abilities and no network was only ever shown a chip
          // so the link's ask had somewhere to live. Settled, it has nothing
          // to say, and a permanent "Abilities" button that opens an empty
          // sheet is worse than no button.
          if (!hasNet && !caps.length) chipEl.style.display = 'none';
        }
        var go = bg.querySelector('#perm-go');
        if (go) {
          go.onclick = function () { grantLaunch(); close(); };
          bg.querySelector('#perm-plain').onclick = close;
        } else bg.querySelector('.done').onclick = close;
        bg.addEventListener('click', function (ev) { if (ev.target === bg) close(); });
      }
      function proceed() {
        paintChip();
        chipEl.onclick = openModal;
        // A link's ask ALWAYS opens the sheet — an acknowledgement stored for
        // this app's abilities says nothing about what today's link wants.
        if (asked.length || (hasNet && !policy.acknowledged()) || (caps.length && !capAcked())) openModal();
      }

      // ---- REQUIRED capabilities gate (settings-backed only) ----
      var requires = (manifest && Array.isArray(manifest.requires)) ? manifest.requires : [];
      function lsCfg(key) { try { return JSON.parse(ls().getItem(key) || '{}') || {}; } catch (e) { return {}; } }
      // A role served by a Provider app (c.app) is configured, same as an endpoint.
      function aiConfigured() { var c = lsCfg('gifos_ai_config'); return Object.keys(c).some(function (k) { return c[k] && (c[k].url || c[k].app); }); }
      function aiRoleConfigured(role) { var c = lsCfg('gifos_ai_config')[role]; return !!(c && (c.url || c.app)); }
      function apiConfigured(name) {
        // Loose on case — see apiCfgLoose above. This line is what printed
        // "Maptiler isn't set up yet" over a saved, tested, working key.
        var all = lsCfg('gifos_api_config'), c = all[name];
        if (!c) { var want = String(name || '').toLowerCase();
          for (var k in all) if (k.toLowerCase() === want) { c = all[k]; break; } }
        return !!(c && c.url);
      }
      function titleCase(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
      function missingRequired() {
        var out = [];
        requires.forEach(function (r) {
          if (r === 'ai') { if (!aiConfigured()) out.push({ what: 'an AI model', where: 'Settings → AI models' }); }
          else if (AI_ROLE_LABELS[r]) { if (!aiRoleConfigured(r)) out.push({ what: 'the ' + AI_ROLE_LABELS[r] + ' model', where: 'Settings → AI models' }); }
          else if (r === 'microphone' || r === 'camera' || r === 'motion' || r === 'network') { /* granted at use */ }
          else if (!apiConfigured(r)) out.push({ what: 'your ' + titleCase(r) + ' account', name: r, where: 'Settings → Third-party APIs' });
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
            '<br><span class="desc">On your GifOS Home Screen, open <b>' + escapeText(m.where) + '</b>'
            + (m.name ? ' and name the entry <b>' + escapeText(m.name) + '</b> (capitalisation does not matter)' : '')
            + '.</span></span></div>';
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
        bg.querySelector('#req-leave').onclick = function () { doc.removeEventListener('visibilitychange', onVis); bg.remove(); denyLaunch(); (opts.onLeave || defaultLeave)(); };
        doc.addEventListener('visibilitychange', onVis);
      }

      var missingReq = missingRequired();
      if (missingReq.length) showRequiredGate(missingReq);
      else proceed();
    };
  }

  GifOS.perms = { attach: attach };
})(typeof window !== 'undefined' ? window : globalThis);
