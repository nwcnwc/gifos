/*
 * runtime.js — The GifOS runtime library (runs in the app tab, run.html).
 *
 * Modes, all behind one app-facing API (window.gifos = { db(), fetch(), save() }):
 *   - standalone/host : boot(mountEl, fileId) runs a local App GIF with a local
 *                       DB persisted to the desktop icon. becomeHost() opens a
 *                       relay session (reusing the icon's stored session id, so
 *                       reopening the icon resumes the SAME share link) and this
 *                       browser serves the authoritative DB to remote clients.
 *   - client          : bootClient(mountEl, {s,k,relay}) joins a host over the
 *                       relay, receives the App GIF, and runs it with a RemoteDB
 *                       forwarded to the host. Clients continuously mirror the
 *                       host's full state, can save a full copy to their own
 *                       desktop, and — if the host dies — can Become Host on the
 *                       same session so remaining clients continue.
 *
 * First run of a GIF with embedded .state/db.json hydrates the icon's DB from
 * the GIF, so dropping a snapshot GIF resumes exactly where it was saved.
 *
 * Attaches to `GifOS.runtime`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  const gif = GifOS.gif;
  const store = GifOS.store;

  const MIME = {
    html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript',
    css: 'text/css', json: 'application/json', txt: 'text/plain', svg: 'image/svg+xml',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', ico: 'image/x-icon', wav: 'audio/wav', mp3: 'audio/mpeg',
  };
  const ext = (p) => (p.split('.').pop() || '').toLowerCase();
  const mimeOf = (p) => MIME[ext(p)] || 'application/octet-stream';
  const dataUrl = (path, bytes) => 'data:' + mimeOf(path) + ';base64,' + gif.b64encode(bytes);
  const norm = (p) => p.replace(/^\.?\//, '');

  function relayUrl() {
    try { return localStorage.getItem('gifos_relay') || root.GIFOS_RELAY || ''; }
    catch (e) { return root.GIFOS_RELAY || ''; }
  }

  // ---- friendly invite links ------------------------------------------------
  // One short code is the whole capability — but the relay only ever sees
  // SHA-256 DERIVATIONS of it (session id, join token); the end-to-end key
  // derives from the same code and is sent nowhere. See gifos-net.js
  // ("derive, don't send"). Ids/hashes come from the shared net fabric.
  const net = GifOS.net;
  const shortCode = net.shortCode;
  const randHex = net.randHex;
  const sha256hex = net.sha256hex;

  // ---- owner-authority for app-state on the mesh ----------------------------
  // App-state rides the meeting mesh's Stage DATA lane (GifOS.meetStageData),
  // NOT a second relay session. The OWNER signs canonical snap/delta frames;
  // every participant verifies against the owner pubkey (site/js/app-owner.js).
  // No page bundles that module in a <script> tag; appOwnerLib injects it on
  // demand the first time owner-authority is needed (and caches it), so runtime.js
  // never requires an HTML edit to function.
  // Anchor the on-demand load to THIS script's own URL, captured now — at
  // static-load time, before anything runs. The page that hosts app-state
  // rewrites its address after boot (run.html → the pretty /meet/<room> form for
  // a meeting, /join/<…> for an app room, via history.replaceState), moving the
  // base URL; a bare relative 'js/app-owner.js' then resolves to
  // /meet/js/app-owner.js (or /join/js/…) and 404s, the signer never builds,
  // and the shared app tears straight back down (~1s after it mounts). runtime.js
  // is always a sibling of app-owner.js, so resolving against our own src is
  // correct in every deploy — subpath, pretty URL, or bare /run.html.
  const _selfSrc = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
  let _appOwnerP = null;
  function appOwnerLib() {
    const G = root.GifOS || {};
    if (G.appOwner) return Promise.resolve(G.appOwner);
    if (_appOwnerP) return _appOwnerP;
    _appOwnerP = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') { reject(new Error('app-owner.js unavailable')); return; }
      const s = document.createElement('script');
      s.src = _selfSrc ? new URL('app-owner.js', _selfSrc).href : 'js/app-owner.js';
      s.onload = () => (root.GifOS && root.GifOS.appOwner) ? resolve(root.GifOS.appOwner) : reject(new Error('app-owner.js loaded but empty'));
      s.onerror = () => reject(new Error('failed to load app-owner.js'));
      document.head.appendChild(s);
    });
    return _appOwnerP;
  }
  // App short-name → a URL-safe room label. Dot-free (a dot marks the verifier),
  // and guaranteed to contain a letter/digit — never empty or all-hyphens, so a
  // room can never be mistaken for a bare verifier segment.
  function slug(s) {
    const out = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
    return /[a-z0-9]/.test(out) ? out : 'app';
  }
  // The link carries the SECRET (lsec); the relay-facing sid/token derive from
  // it at connect time and never appear anywhere. Two app-link shapes:
  //   self-healing — lsec IS the whole link:  /join/<lsec>            (#j=<lsec>)
  //   owned — "<room>.<verifier>" sid + lsec: /join/<room>/<verifier>/<lsec>
  //                                           (#s=<room>.<verifier>&k=<lsec>)
  // The owned sid itself holds no secret (the verifier is a public hash of the
  // HOST secret, which is a different key than lsec and never in any link).
  // gifos.app pretty paths route through 404.html; hash form everywhere else
  // (local dev, custom relays).
  function buildJoinUrl(page, sid, lsec, relay) {
    const meet = page === 'video' || page === 'meet'; // 'video' kept as a legacy alias
    const onProd = /(^|\.)gifos\.app$/.test(location.hostname) && relay === root.GIFOS_RELAY;
    if (meet) {
      return onProd ? location.origin + '/meet/' + sid
        : location.origin + '/run.html#v=' + sid + '&relay=' + encodeURIComponent(relay);
    }
    // lastIndexOf so this can never diverge from the relay's split (which also
    // takes the verifier after the LAST dot), even if a room ever held a dot.
    // The fallback names run.html — the ONE runtime, and the file these hashes
    // are exactly what /404.html's router rewrites the pretty /join/… links into.
    // Get the name wrong here and the link 404s: this branch is not merely a
    // local-dev wart, because `onProd` also requires the DEFAULT relay, so a user
    // on gifos.app with a CUSTOM RELAY takes it and hands the link to real people.
    // (Links minted as meet.html#… before the 2026-08-04 rename are DEAD —
    // the shim was deleted on the 2026-08-05 no-shims flag day.)
    const dot = String(sid || '').lastIndexOf('.');
    if (dot > 0) {
      if (onProd) return location.origin + '/join/' + sid.slice(0, dot) + '/' + sid.slice(dot + 1) + '/' + lsec;
      return location.origin + '/run.html#s=' + sid + '&k=' + lsec + '&relay=' + encodeURIComponent(relay);
    }
    if (onProd) return location.origin + '/join/' + lsec;
    return location.origin + '/run.html#j=' + lsec + '&relay=' + encodeURIComponent(relay);
  }
  GifOS.links = { shortCode, buildJoinUrl };

  // Per-browser identity (defined in gifos-store.js so the desktop shares it).
  const identity = store.identity;
  const setName = store.setName;

  // ---- app-facing shim injected into the sandboxed iframe -----------------
  function clientShim() {
    return `(function(){
      // Neuter WebRTC: CSP's 'webrtc' directive is not universally supported,
      // so hard-remove the constructors before app code runs. connect-src 'none'
      // already blocks fetch/XHR/WebSocket/EventSource/beacons; this closes the
      // one network primitive CSP can't reliably reach. frame-src/worker limits
      // mean the app can't obtain a fresh copy from a child context.
      ['RTCPeerConnection','webkitRTCPeerConnection','RTCDataChannel'].forEach(function(k){
        try { Object.defineProperty(window, k, { value: undefined, configurable: false, writable: false }); } catch(e){ try { window[k] = undefined; } catch(e2){} }
      });
      var pending = {}, subs = {}, backCbs = [];
      function rpc(msg){ return new Promise(function(res, rej){
        var id = 'r'+Math.random().toString(36).slice(2);
        pending[id] = { res: res, rej: rej };
        parent.postMessage(Object.assign({ ns:'gifos', id:id }, msg), '*');
      }); }
      function refresh(collection){
        (subs[collection]||[]).forEach(function(cb){
          rpc({ type:'db', op:'getAll', collection:collection }).then(cb);
        });
      }
      window.addEventListener('message', function(e){
        var d = e.data; if(!d || d.ns!=='gifos') return;
        if(d.type==='reply' && pending[d.id]){
          d.ok ? pending[d.id].res(d.result) : pending[d.id].rej(new Error(d.error));
          delete pending[d.id];
        }
        if(d.type==='db-change'){
          if(d.collection==='*'){ Object.keys(subs).forEach(refresh); }
          else refresh(d.collection);
        }
        if(d.type==='back'){ backCbs.forEach(function(cb){ try { cb(); } catch(e){} }); }
      });
      // Android Chrome only lets the container's Back trap "stick" once the page
      // has real user activation, and the user touches the APP, not the frame
      // around it — those gestures never reach the parent. Ping the container on
      // our first interaction so it can arm the trap under fresh activation
      // (a same-origin gesture propagates activation to our parent too).
      ['pointerdown','touchstart','keydown'].forEach(function(ev){
        window.addEventListener(ev, function(){ try { parent.postMessage({ ns:'gifos', type:'uiactive' }, '*'); } catch(e){} }, { capture:true, passive:true, once:true });
      });
      window.gifos = {
        db: function(collection){ return {
          put:    function(item){ return rpc({type:'db',op:'put',collection:collection,value:item}); },
          get:    function(id){   return rpc({type:'db',op:'get',collection:collection,key:id}); },
          getAll: function(){     return rpc({type:'db',op:'getAll',collection:collection}); },
          delete: function(id){   return rpc({type:'db',op:'delete',collection:collection,key:id}); },
          // Set one record's visibility: 'private' | 'read-only' | 'read-write'.
          // Owner-only — the host runs it; on a guest it is refused. Use it to
          // "make visible" (opt a private item in) or to flip who may write.
          setVisibility: function(id, level){ return rpc({type:'db',op:'setVisibility',collection:collection,key:id,value:level}); },
          subscribe: function(cb){ (subs[collection]=subs[collection]||[]).push(cb);
            rpc({type:'db',op:'getAll',collection:collection}).then(cb); }
        }; },
        fetch: function(url, opts){ opts=opts||{};
          return rpc({type:'fetch',url:url,method:opts.method||'GET',headers:opts.headers||{},body:opts.body||null,proxy:!!opts.proxy})
            .then(function(r){ return { status:r.status, headers:r.headers, ok:r.status>=200&&r.status<300,
              json:function(){return Promise.resolve(JSON.parse(r.body));}, text:function(){return Promise.resolve(r.body);} }; });
        },
        save: function(){ return rpc({type:'save'}); },
        info: function(){ return rpc({type:'info'}); },
        me: function(){ return rpc({type:'me'}); },
        setName: function(n){ return rpc({type:'setName', name:n}); },
        // Brokered device capture. The app never touches the camera/mic: it asks
        // the GifOS computer for a CLIP, which records it behind a visible
        // indicator and hands back { bytes:ArrayBuffer, mime, durationMs }.
        // Needs the matching manifest capability (microphone / camera).
        recordAudio: function(opts){ return rpc(Object.assign({type:'capture',media:'audio'}, opts||{})); },
        recordVideo: function(opts){ return rpc(Object.assign({type:'capture',media:'video'}, opts||{})); },
        takePhoto:   function(opts){ return rpc(Object.assign({type:'capture',media:'photo'}, opts||{})); },
        // Device motion. Granted via the iframe allow-policy when the manifest
        // declares "motion"; this helper does the iOS permission dance and hands
        // you {alpha,beta,gamma} (orientation) or acceleration on each tick.
        motion: function(cb, which){ return (function(){
          if (typeof cb !== 'function') return function(){};
          var evt = which === 'accel' ? 'devicemotion' : 'deviceorientation';
          function attach(){ window.addEventListener(evt, cb); }
          var DO = window.DeviceOrientationEvent, DM = window.DeviceMotionEvent;
          var needsAsk = which === 'accel' ? (DM && DM.requestPermission) : (DO && DO.requestPermission);
          if (needsAsk) { try { needsAsk.call(which==='accel'?DM:DO).then(function(s){ if(s==='granted') attach(); }).catch(function(){}); } catch(e){ attach(); } }
          else attach();
          return function(){ window.removeEventListener(evt, cb); };
        })(); },
        // AI, provided by the GifOS computer (the user configures endpoints +
        // keys in Settings; the app NEVER sees a key). OpenAI-shaped. Needs the
        // "ai" capability. model is a role: 'smartest'|'cheapest' for text, etc.
        ai: {
          models: function(){ return rpc({type:'ai',op:'models'}); },
          chat:   function(o){ return rpc(Object.assign({type:'ai',op:'chat'}, o||{})); },
          tts:    function(o){ return rpc(Object.assign({type:'ai',op:'tts'}, o||{})); },
          stt:    function(o){ return rpc(Object.assign({type:'ai',op:'stt'}, o||{})); },
          image:  function(o){ return rpc(Object.assign({type:'ai',op:'image'}, o||{})); },
          imageToVideo: function(o){ return rpc(Object.assign({type:'ai',op:'image_to_video'}, o||{})); },
          video:  function(o){ return rpc(Object.assign({type:'ai',op:'video'}, o||{})); }
        },
        // Any keyed third-party API (beyond OpenAI-shaped ones) the user has set
        // up in Settings → Third-party APIs. The GifOS computer attaches the
        // credential and pins the call to that API's OWN host — the app never
        // sees the key and can't redirect it. Needs the manifest to declare the
        // API's name under capabilities.api. req: { path, method, query, headers,
        // body, as:'json'|'text'|'bytes' }. Returns { status, ok, json|text|bytes }.
        api: function(name, req){ return rpc(Object.assign({type:'api', name:name}, req||{})); },
        // Ask whether a third-party API the app declared is actually set up
        // (base URL present) — WITHOUT revealing the key. Lets an app tell the
        // user up front "add your Deepgram key in Settings" instead of failing
        // mid-task. Returns true/false.
        apiReady: function(name){ return rpc({type:'apiReady', name:name}); },
        // Ask GifOS to show its own "set this up" prompt for an API / AI model.
        // The generic instructions are GifOS's (consistent across apps); pass an
        // optional hint for app-specific extras ("new accounts include credit").
        // Also fires automatically when a gifos.api / gifos.ai call hits missing
        // config — so an app can just make the call and let GifOS handle it.
        apiSetup: function(name, hint){ return rpc({type:'apiSetup', name:name, hint:hint}); },
        // role is an AI type ('smartest'|'cheapest'|'tts'|'stt'|'image'|'video'…)
        // so GifOS names exactly which model to set up; omit for a generic prompt.
        aiSetup: function(role, hint){ return rpc({type:'aiSetup', role:role, hint:hint}); },
        // Internal: the GifOS-injected in-app agent (capabilities.agent) brokers
        // its Smartest-model calls through here so the KEY never enters this
        // sandbox. Not part of the public app API.
        _agentChat: function(messages){ return rpc({type:'agentChat', messages:messages}); },
        // The container traps the browser Back button so an app is never blown
        // away by a reflex press. By default the press is swallowed; register a
        // callback to make Back meaningful (close a modal, back out a screen).
        onBack: function(cb){ if (typeof cb === 'function') backCbs.push(cb); },
        // Origin-wide storage usage/quota in bytes, so an app can warn a user
        // before they fill the computer up. Shared across all apps on this
        // origin (they live in one IndexedDB), not per-app.
        storage: function(){ return rpc({type:'storage'}); }
      };
    })();`;
  }

  // ---- CSP injected into every app document ---------------------------------
  // The browser itself refuses every direct network primitive from app code:
  // fetch/XHR/WebSocket/EventSource/beacons (connect-src), image/media/font
  // beacons, external form posts, nested frames, and WebRTC. The ONLY network
  // path is the postMessage bridge — enforced by the runtime's manifest
  // allowlist and executed from the runtime's origin, which this CSP does not
  // govern. Inline code and data:/blob: assets (how apps are packed) stay legal.
  // Default policy: no workers, no wasm-eval. An app that declares
  // capabilities.wasm opts into the relaxed policy below (appCsp()).
  const APP_CSP = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'media-src data: blob:',
    'font-src data:',
    // No worker-src: workers are blocked (default-src 'none' covers them). They
    // gained nothing for apps — connect-src 'none' already denies a worker any
    // network — and blocking them shrinks the sandbox's attack/CPU surface.
    "connect-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    // (WebRTC is neutered in the shim instead of via a CSP 'webrtc' directive,
    //  which is not supported across all browsers.)
  ].join('; ');

  // The "wasm hatch": an app that declares capabilities.wasm gets exactly two
  // relaxations and nothing more — 'wasm-unsafe-eval' so it can instantiate a
  // WebAssembly module (Chrome refuses WASM under a bare 'unsafe-inline'
  // script-src), and worker-src blob: so it can spin up the Web Worker that
  // heavy WASM engines (a chess engine, a codec) run on to keep the UI alive.
  // Crucially connect-src STAYS 'none': the worker and the WASM get zero
  // network — same airtight sandbox, just allowed to compute. The hatch is
  // gated by the manifest and surfaced in the abilities acknowledgement, so a
  // user always sees that an app runs a compiled engine before it does.
  const APP_CSP_WASM = APP_CSP
    .replace("script-src 'unsafe-inline'", "script-src 'unsafe-inline' 'wasm-unsafe-eval'")
    .replace("object-src 'none'", "worker-src blob:; object-src 'none'");
  const appCsp = (manifest) => hasCap(manifest, 'wasm') ? APP_CSP_WASM : APP_CSP;

  // ---- build a runnable, self-contained HTML doc from the archive ----------
  function buildAppHtml(files, manifest) {
    const withAgent = hasCap(manifest, 'agent');
    const CSP = appCsp(manifest);
    let html = gif.bytesToText(files['index.html']);
    html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi, (m, src) => {
      const key = norm(src); return files[key] ? '<script>' + gif.bytesToText(files[key]) + '</script>' : m;
    });
    html = html.replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (m, href) => {
      const key = norm(href); return (files[key] && /stylesheet/i.test(m)) ? '<style>' + gif.bytesToText(files[key]) + '</style>' : m;
    });
    html = html.replace(/\b(src|href)=["']([^"']+)["']/gi, (m, attr, ref) => {
      const key = norm(ref); return files[key] ? attr + '="' + dataUrl(key, files[key]) + '"' : m;
    });
    // Parse to a real document so the CSP <meta> lands as the FIRST child of
    // <head> (browsers ignore a CSP meta placed anywhere else). The parser
    // normalizes fragments, apps with a partial <head>, and full documents
    // alike, so the policy is always enforced. The shim rides right behind the
    // CSP so window.gifos exists before any app code runs.
    if (typeof DOMParser === 'function') {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const meta = doc.createElement('meta');
      meta.setAttribute('http-equiv', 'Content-Security-Policy');
      meta.setAttribute('content', CSP);
      const shim = doc.createElement('script');
      shim.textContent = clientShim();
      doc.head.insertBefore(shim, doc.head.firstChild);
      doc.head.insertBefore(meta, doc.head.firstChild);
      if (withAgent) { const ag = doc.createElement('script'); ag.textContent = agentBootstrap(); doc.body.appendChild(ag); }
      return '<!doctype html>' + doc.documentElement.outerHTML;
    }
    // Non-DOM fallback (tooling): best-effort inject into <head> if present.
    const head = '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">' +
      '<script>' + clientShim() + '</script>';
    const tail = withAgent ? '<script>' + agentBootstrap() + '</script>' : '';
    const withHead = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : head + html;
    return withHead + tail;
  }

  function buildFolderHtml(files) {
    const rows = Object.keys(files).sort().map((p) =>
      '<tr><td><a href="' + dataUrl(p, files[p]) + '" target="_blank">' + escapeHtml(p) + '</a></td><td>' + files[p].length + ' B</td></tr>').join('');
    return '<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#0a0a0f;color:#e0e0f0;padding:2rem}' +
      'h2{color:#7b5cff}table{border-collapse:collapse;width:100%}td{padding:.4rem .8rem;border-bottom:1px solid #2a2a3f}' +
      'a{color:#7b5cff;text-decoration:none}a:hover{text-decoration:underline}</style>' +
      '<h2>GIF filesystem — no index.html</h2><p>This GIF has no entry point, so it is browsable like an open folder.</p><table>' + rows + '</table>';
  }
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- external-API bridge (manifest-gated) --------------------------------
  // The ONLY network path out of a sandboxed app: the app's own fetch/XHR/WS
  // are killed by connect-src 'none', so everything funnels through here, gated
  // by the app's manifest allowlist. Hardening (fail closed):
  //  - only https:// (and http:// for localhost dev) — never file:, blob:, etc.
  //  - never the GifOS origin or its own subdomains: an app must not be able to
  //    turn the trusted first-party into a proxy for the relay/site itself.
  //  - no credentials are ever attached, and the response body is size-capped.
  const FETCH_MAX_BYTES = 8 * 1024 * 1024; // 8 MB response ceiling
  function firstPartyHost(host) {
    // gifos.app and *.gifos.app (relay/mirrors) are always off-limits.
    if (host === 'gifos.app' || host.endsWith('.gifos.app')) return true;
    // Custom deployments can protect their own sibling services by setting
    // window.GIFOS_FIRST_PARTY = ['example.com', ...] — each entry blocks that
    // host and its subdomains (mirrors the relay's configurable ALLOWED_ORIGINS).
    const extra = (root.GIFOS_FIRST_PARTY && root.GIFOS_FIRST_PARTY.length) ? root.GIFOS_FIRST_PARTY : [];
    for (const s of extra) { if (s && (host === s || host.endsWith('.' + s))) return true; }
    // Also the actual serving origin — but NOT local dev, which has no
    // first-party infra to protect and is where the test suite reaches itself.
    const self = (root.location && root.location.hostname) || '';
    const selfLocal = self === 'localhost' || self === '127.0.0.1' || self === '[::1]';
    return host === self && !selfLocal;
  }
  // Normalize a manifest host so "EXAMPLE.COM", "example.com." and "Example.Com"
  // can't smuggle in as three distinct permissions. Lower-cased, trailing dots
  // stripped, and anything that isn't a plain ASCII hostname (unicode, punycode
  // confusables, ports, paths, embedded wildcards) is rejected — the URL parser
  // hands us ASCII/lower-case hostnames, so only a clean host can ever match.
  // '*' is the one special token that survives as-is.
  function normHost(h) {
    const s = String(h == null ? '' : h).trim().toLowerCase().replace(/\.+$/, '');
    if (s === '*') return '*';
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(s) ? s : '';
  }
  // The hosts an app's manifest ASKS to reach. A self-contained GIF declares
  // none (empty or absent) and can never touch the network; anything here is a
  // capability the user gets to see and veto.
  function networkHosts(manifest) {
    const raw = (manifest && manifest.capabilities && manifest.capabilities.network) || [];
    const seen = {}, out = [];
    for (const h of raw) { const s = normHost(h); if (s && !seen[s]) { seen[s] = 1; out.push(s); } }
    return out;
  }
  // A per-app network policy: the declared hosts, plus the user's per-host
  // allow/deny choices (persisted with the icon under '<fileId>::netperms', so a
  // veto sticks across launches). The runtime gates every bridged fetch on this,
  // and run.html renders it (the launch acknowledgement + the tab control).
  function makeNetPolicy(fileId, manifest) {
    const declared = networkHosts(manifest);
    const denied = Object.create(null);
    let ack = ''; // the declared-host set the user has already acknowledged
    const key = fileId ? fileId + '::netperms' : null; // client-run apps: session-only
    // A fingerprint of what the app is ASKING for. It only changes when the app
    // itself changes (a new/removed host in its manifest), so we can prompt once
    // and stay quiet until the request actually changes.
    const fingerprint = () => declared.slice().sort().join('');
    const persist = () => (key ? store.setState(key, { denied: Object.keys(denied), ack }) : Promise.resolve());
    return {
      declared: () => declared.slice(),
      hasNetwork: () => declared.length > 0,
      unsafe: () => declared.indexOf('*') >= 0 && !denied['*'],
      list: () => declared.map((h) => ({ host: h, allowed: !denied[h] })),
      allow: (host) => declared.some((p) => !denied[p] && (p === '*' || host === p || host.endsWith('.' + p))),
      set: (host, allowed) => { if (allowed) delete denied[host]; else denied[host] = 1; return persist(); },
      // Has the user seen THIS exact set of requested hosts before? False on first
      // run and again whenever the app changes what it asks for.
      acknowledged: () => ack === fingerprint(),
      acknowledge: () => { ack = fingerprint(); return persist(); },
      load: () => (key ? store.getState(key).then((r) => {
        if (r && Array.isArray(r.denied)) for (const h of r.denied) denied[h] = 1;
        if (r && typeof r.ack === 'string') ack = r.ack;
      }).catch(() => {}) : Promise.resolve()),
    };
  }
  function bridgeFetch(policy, d) {
    let u; try { u = new URL(d.url); } catch (e) { return Promise.reject(new Error('bad url')); }
    const localhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && localhost)) {
      return Promise.reject(new Error('Network denied: only https:// URLs are allowed'));
    }
    if (firstPartyHost(u.hostname)) return Promise.reject(new Error('Network denied: apps cannot call the GifOS origin'));
    if (!policy.allow(u.hostname)) return Promise.reject(new Error('Network denied: ' + u.hostname + ' not in app permissions'));
    // Optional CORS proxy. Some hosts serve public data but send NO
    // Access-Control-Allow-* headers, so a direct browser fetch is blocked. When
    // the app passes { proxy: true }, route through the GifOS CORS proxy (our own
    // first-party Worker, which enforces its OWN host allow-list and adds the CORS
    // headers). The app can ONLY select our default proxy — never an arbitrary URL
    // — so it can't turn the bridge into an exfiltration channel; the operator can
    // override the base once via window.GIFOS_CORS_PROXY on a self-hosted copy.
    // The host allow-list above still gates WHICH sites the app may reach.
    const viaProxy = !!d.proxy;
    const headers = Object.assign({}, d.headers);
    let fetchUrl = d.url;
    if (viaProxy) {
      const pbase = String(root.GIFOS_CORS_PROXY || API_PROXY_DEFAULT).replace(/\/+$/, '');
      headers['x-gifos-target'] = d.url;
      fetchUrl = pbase + '/';
    }
    // Proxied requests all share ONE URL (the proxy origin) with the real target
    // in the x-gifos-target header, so the browser's HTTP cache — which keys on
    // URL — would replay the first target's response for every later one (e.g.
    // every Bible chapter comes back as the home page). Bypass the cache for
    // proxied fetches; direct fetches keep normal caching (distinct URLs).
    return fetch(fetchUrl, { method: d.method, headers: headers, body: d.body || undefined, credentials: 'omit', redirect: 'follow', cache: viaProxy ? 'no-store' : 'default' })
      .then((resp) => {
        // A redirect can walk an allowed (or '*') host to a first-party or
        // otherwise-forbidden one, and follow makes the FINAL response readable.
        // Re-check the URL we actually landed on and refuse to hand back its body.
        // (Via the proxy the final URL is the proxy's own origin — the proxy
        // enforces its host allow-list, so we skip this second-guess there.)
        if (!viaProxy) {
          let fu; try { fu = new URL(resp.url); } catch (e) { fu = null; }
          const finalHost = fu ? fu.hostname : u.hostname;
          if (firstPartyHost(finalHost) || !policy.allow(finalHost)) {
            throw new Error('Network denied: redirected to a disallowed host (' + finalHost + ')');
          }
        }
        return resp.arrayBuffer().then((buf) => {
          if (buf.byteLength > FETCH_MAX_BYTES) throw new Error('response too large');
          return { status: resp.status, headers: Object.fromEntries(resp.headers.entries()), body: gif.bytesToText(new Uint8Array(buf)) };
        });
      });
  }

  // ---- snapshot: re-pack app + current state into a self-contained GIF -----
  // When we have the original GIF bytes we REPACK — swap only the embedded
  // filesystem block and keep every pixel/artwork byte identical, so the app's
  // custom animated icon survives the snapshot. We only fall back to a fresh
  // encode (procedural preview) when the originals aren't available.
  function packSnapshot(originalBytes, files, manifest, state) {
    const out = {};
    for (const p in files) if (!p.startsWith('.state/')) out[p] = files[p];
    out['.state/db.json'] = gif.textToBytes(store.packJSON(state)); // binary-safe: keeps media blobs intact
    return originalBytes && gif.repack
      ? gif.repack(originalBytes, out)
      : gif.encode(out, { accent: manifest.accent }); // Promise<Uint8Array>
  }
  function downloadBytes(bytes, name) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return name;
  }
  function downloadSnapshot(originalBytes, files, manifest, db) {
    return Promise.resolve(db.getFullState())
      .then((state) => packSnapshot(originalBytes, files, manifest, state))
      .then((bytes) => downloadBytes(bytes, (manifest.appId || 'app') + '-snapshot.gif'));
  }
  // Strip any baked-in .state/ so a copy opens FRESH (app only, no data).
  function stripState(originalBytes, files) {
    const clean = {}; let hadState = false;
    for (const p in files) { if (p.startsWith('.state/')) hadState = true; else clean[p] = files[p]; }
    return (hadState && gif.repack) ? gif.repack(originalBytes, clean) : Promise.resolve(originalBytes);
  }
  // Unified "steal". The app bytes were already transported/read ONCE (they live
  // in `originalBytes`); every variant here is a LOCAL repack — never a re-fetch.
  //   opts.data : 'none'    — a clean, empty copy (just the app)
  //               'current' — everything in the app right now
  //               'connect' — everything as of when it loaded (the snapshot the
  //                           corner app-GIF already holds — cached, so it's free
  //                           to reuse and instant on repeat)
  //   opts.toDesktop : file into Stolen Apps (state stored beside the icon) vs
  //                    download a self-contained GIF (state baked into .state/)
  //   opts.bytesOnly : return the packed bytes instead of downloading (the
  //                    corner app-GIF easter egg feeds these to its <img>)
  // ctx = { connectState, cache } holds the state captured at load and memoizes
  // the connect snapshot, so "data at connect time" costs at most one repack.
  function stealApp(originalBytes, files, manifest, db, ctx, opts) {
    opts = opts || {};
    const mode = opts.data || 'none';
    const toDesktop = !!opts.toDesktop;
    const stateFor = () => mode === 'current' ? Promise.resolve(db.getFullState())
      : mode === 'connect' ? Promise.resolve((ctx && ctx.connectState) || null)
        : Promise.resolve(null);
    if (toDesktop) {
      return Promise.all([stripState(originalBytes, files), stateFor(), ensureStolenFolder()])
        .then(([bytes, state, folder]) => saveAppToDesktop(bytes, manifest, state, folder))
        .then(() => ({ toDesktop: true, data: mode }));
    }
    const bakedBytes = () => {
      if (mode === 'none') return stripState(originalBytes, files);
      if (mode === 'connect' && ctx && ctx.cache && ctx.cache.bytes) return Promise.resolve(ctx.cache.bytes);
      return stateFor().then((s) => packSnapshot(originalBytes, files, manifest, s))
        .then((b) => { if (mode === 'connect' && ctx && ctx.cache) ctx.cache.bytes = b; return b; });
    };
    return bakedBytes().then((bytes) => opts.bytesOnly
      ? { bytes: bytes, data: mode }
      : { name: downloadBytes(bytes, (manifest.appId || 'app') + (mode === 'none' ? '' : '-snapshot') + '.gif'), data: mode });
  }

  // ---- desktop capture: write app + state into THIS browser's desktop ------
  // Stolen apps are filed into the system 'Stolen Apps' folder (same fixed id
  // the desktop's ensureSystemItems uses — created here too if a steal happens
  // on a desktop from before the folder shipped).
  const STOLEN_ID = 'sys_stolen';
  function ensureStolenFolder() {
    return store.allItems().then((all) => {
      if (all.find((i) => i.id === STOLEN_ID)) return STOLEN_ID;
      return store.putItem({ id: STOLEN_ID, kind: 'folder', name: 'Stolen Apps',
        parent: null, x: 24, y: 24, iconSize: 64 }).then(() => STOLEN_ID);
    });
  }
  // First free grid cell in a folder, so a stolen app never lands ON the up-hole
  // (the top-left "go up" cell inside a folder) or stacks on top of an earlier
  // steal. Mirrors the desktop's own layout (origin + pitch), computed here
  // because run.html writes the icon into IndexedDB and a separate desktop tab
  // repaints it — the two can't share the desktop's live layout helpers.
  function freeFolderCell(all, parent) {
    const ORIGIN = 12, PITCH = 96, ROW = 104;
    const cellOf = (x, y) => ({ col: Math.max(0, Math.round(((x || ORIGIN) - ORIGIN) / PITCH)), row: Math.max(0, Math.round(((y || ORIGIN) - ORIGIN) / ROW)) });
    const taken = new Set((all || []).filter((i) => (i.parent || null) === (parent || null)).map((i) => { const c = cellOf(i.x, i.y); return c.col + ',' + c.row; }));
    if (parent) taken.add('0,0'); // the up-hole owns the corner cell inside a folder
    for (let r = 0; r < 200; r++) {
      for (let dc = 0; dc <= r; dc++) for (let dr = 0; dr <= r; dr++) {
        if (Math.max(dc, dr) !== r) continue; // grow outward from the top-left
        if (!taken.has(dc + ',' + dr)) return { x: ORIGIN + dc * PITCH, y: ORIGIN + dr * ROW };
      }
    }
    return { x: ORIGIN + PITCH, y: ORIGIN };
  }
  function saveAppToDesktop(appBytes, manifest, state, parent) {
    const fileId = store.uid('file');
    const name = (manifest.name || manifest.appId || 'App') + '.gif';
    return store.allItems()
      .then((all) => {
        const spot = freeFolderCell(all, parent || null);
        return store.putFile({ id: fileId, name, bytes: appBytes, kind: 'gif', isApp: true,
          appId: manifest.appId, accent: manifest.accent, mime: 'image/gif' })
          .then(() => store.putItem({ id: store.uid('item'), kind: 'file', fileId, name,
            parent: parent || null, x: spot.x, y: spot.y, iconSize: 64 }));
      })
      .then(() => (state ? store.setState(fileId, state) : null))
      .then(() => {
        // Let any open desktop tab repaint and show the new icon immediately.
        if ('BroadcastChannel' in root) {
          const chan = new BroadcastChannel(store.syncChannel);
          chan.postMessage(1); chan.close();
        }
        return fileId;
      });
  }

  // ---- DB backends ---------------------------------------------------------
  function emptyState() { return { collections: {} }; }
  function isEmptyState(s) { return !s || !s.collections || Object.keys(s.collections).length === 0; }

  // ---- VISIBILITY: the sharing axis ----------------------------------------
  // Every collection declares a default in the manifest ("data": { coll: {
  // visibility: 'read-write' } }); a single record can override it with the
  // reserved `_vis` field (set ONLY by the host, via setVisibility). Three
  // levels, from tightest to loosest:
  //   private     — never leaves the owner's tab. Each participant keeps their
  //                 OWN copy (font size, scratch state); the host never mirrors
  //                 it to guests and a guest's copy dies with the tab.
  //   read-only   — guests SEE it, but only the host writes (broadcast state).
  //   read-write  — guests see AND write it (communal collaboration).
  // An UNDECLARED collection is 'private' — privacy-first: inviting someone in
  // shares nothing you didn't opt into. Enforcement lives entirely on the host
  // (see handleRpc): a compromised guest can be rejected but never override.
  const VIS = { 'private': true, 'read-only': true, 'read-write': true };
  function collVis(data, collection) {
    const d = data && data[collection];
    const v = d && d.visibility;
    return VIS[v] ? v : 'private';
  }
  function visOf(data, collection, record) {
    const rv = record && record._vis;
    if (VIS[rv]) return rv;
    return collVis(data, collection);
  }
  // Records the host's communal⇄leading toggle controls, declared in the
  // manifest as `lead: [{ collection, id }, ...]` — e.g. Bible's shared nav
  // cursor. Leading them just flips their visibility read-write ⇄ read-only.
  function leadTargetsOf(manifest) {
    const l = manifest && manifest.lead;
    if (!Array.isArray(l)) return [];
    return l.map((t) => (t && t.collection && t.id) ? { collection: t.collection, id: t.id } : null).filter(Boolean);
  }

  // Local: authoritative store persisted with the icon; cross-tab via BroadcastChannel.
  // A record sanitized against prototype pollution: a malicious/careless value
  // carrying "__proto__"/"constructor"/"prototype" keys can't reach Object's
  // prototype, because we rebuild it on a NULL-prototype object and drop those.
  function safeRecord(value) {
    const out = Object.create(null);
    if (value && typeof value === 'object') {
      for (const k of Object.keys(value)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        out[k] = value[k];
      }
    }
    return out;
  }
  function makeLocalDb(fileId, onChange) {
    const chan = ('BroadcastChannel' in root) ? new BroadcastChannel(store.appChannel(fileId)) : null;
    // Another tab of the SAME app committed a change — the record already landed
    // in IndexedDB, so we only need to tell our own app to re-read.
    if (chan) chan.onmessage = (e) => onChange(e.data.collection);
    const notify = (collection) => { if (chan) chan.postMessage({ collection }); onChange(collection); };
    // A per-record app's full state, assembled on demand from its rows.
    const full = () => store.getState(fileId).then((s) => (s && s.collections ? s : emptyState()));
    return {
      owner: true, // this is the app's authoritative local store — its owner
      load: full,
      import: (s) => store.setState(fileId, s),
      getFullState: full,
      op(op, collection, key, value) {
        // Each op is a single atomic IndexedDB transaction — no whole-state blob
        // to reload, no lock: a put writes one record, get/getAll reads one
        // collection's rows straight from disk, and the store serializes the
        // seq bump so concurrent tabs can't reuse an id.
        if (op === 'dump') return full();
        if (op === 'get') return store.appGet(fileId, collection, key);
        if (op === 'getAll') return store.appGetAll(fileId, collection);
        if (op === 'put') return store.appAdd(fileId, collection, safeRecord(value)).then((rec) => { notify(collection); return rec; });
        if (op === 'delete') return store.appDelete(fileId, collection, key).then(() => { notify(collection); return true; });
        // setVisibility(collection, id, level) — stamp one record's per-record
        // visibility override (`_vis`). Owner-only: the host runs this against
        // its authoritative store; guests can't (their op is rejected upstream).
        // This is also how leadership flips live (read-write ⇄ read-only) and
        // how My Media opts an item in ('private' → 'read-only', "make visible").
        if (op === 'setVisibility') {
          if (!VIS[value]) return Promise.reject(new Error('bad visibility level'));
          return store.appGet(fileId, collection, key).then((rec) => {
            if (!rec) return null;
            const next = safeRecord(rec); next._vis = value;
            return store.appAdd(fileId, collection, next).then((r) => { notify(collection); return r; });
          });
        }
        return Promise.resolve(null);
      },
    };
  }

  // Remote (guest): a HYBRID db. Ops on a collection the manifest declares
  // 'private' NEVER leave this tab — they live in an in-memory Map, so a guest's
  // font size / scratch state stays personal and dies with the tab (the host
  // never sees it, and it can't leak to other guests). Ops on any SHARED
  // collection ('read-only' / 'read-write') forward to the host, which is the
  // sole authority on what the guest may read or write. Forwarded requests are
  // remembered until answered so they can be REPLAYED after a host blip —
  // at-least-once on reconnect beats an app hung on a promise forever.
  //   opts.manifest     — for the collection-default visibility lookup
  //   opts.onLocalChange — notify our own iframe after a private-collection write
  function makeRemoteDb(send, opts) {
    opts = opts || {};
    const data = (opts.manifest && opts.manifest.data) || {};
    const onLocalChange = typeof opts.onLocalChange === 'function' ? opts.onLocalChange : function () {};
    let seq = 1; const pending = new Map();
    let hostDown = false;
    // Per-collection in-tab store for private collections: coll -> Map(id -> rec).
    const localCols = new Map();
    let localSeq = 1;
    const localOf = (coll) => { let m = localCols.get(coll); if (!m) { m = new Map(); localCols.set(coll, m); } return m; };
    const isPrivate = (coll) => collVis(data, coll) === 'private';

    const forward = (op, collection, key, value) => {
      if (hostDown) return Promise.reject(new Error('host offline'));
      return new Promise((res, rej) => {
        const id = 'q' + (seq++);
        const req = { t: 'rpc', id, op, collection, key, value };
        pending.set(id, { res, rej, req });
        send(req);
      });
    };
    const putLocal = (collection, value) => {
      const m = localOf(collection);
      const rec = safeRecord(value);
      if (rec.id == null) rec.id = collection + '_local_' + (localSeq++);
      delete rec._vis; // private is a collection fact here; no per-record override in-tab
      m.set(rec.id, rec);
      onLocalChange(collection);
      return Promise.resolve(rec);
    };
    const db = {
      op(op, collection, key, value) {
        // 'dump' is a whole-computer read (steal/mirror) — always the host's
        // authoritative, visibility-filtered copy; local private state is
        // per-tab and deliberately not part of a stolen snapshot. setVisibility
        // is the host's alone: forward it (a guest gets refused).
        if (op === 'dump' || op === 'setVisibility') return forward(op, collection, key, value);
        const priv = collection && isPrivate(collection);
        const m = collection ? localOf(collection) : null;
        if (op === 'get') {
          if (m && m.has(key)) return Promise.resolve(m.get(key));
          return forward(op, collection, key, value); // a shared record, or a host-visible one
        }
        if (op === 'getAll') {
          // A shared collection is the host's to answer. A PRIVATE one is mine —
          // but the host may have opted a few of ITS records in (read-only), so
          // I merge my own in-tab items with whatever it shares, and tolerate a
          // down host so my own copy is always readable.
          if (!priv) return forward(op, collection, key, value);
          return forward(op, collection, key, value).catch(() => []).then((rows) => {
            const out = Array.isArray(rows) ? rows.slice() : [];
            const seen = new Set(out.map((r) => r && r.id));
            for (const rec of m.values()) if (!seen.has(rec.id)) out.push(rec);
            return out;
          });
        }
        if (op === 'put') return priv ? putLocal(collection, value) : forward(op, collection, key, value);
        if (op === 'delete') {
          if (m && m.has(key)) { m.delete(key); onLocalChange(collection); return Promise.resolve(true); }
          return forward(op, collection, key, value); // a shared record — the host decides
        }
        return Promise.resolve(null);
      },
      owner: false, // a guest view — visibility is the host's to change
      getFullState() { return db.op('dump'); },
      _reply(id, ok, result) { const p = pending.get(id); if (!p) return; pending.delete(id); ok ? p.res(result) : p.rej(new Error(result)); },
      _replay() { for (const p of pending.values()) { try { send(p.req); } catch (e) { /* still down */ } } },
      _setHostDown(v) {
        hostDown = v;
        if (v) { for (const p of pending.values()) p.rej(new Error('host offline')); pending.clear(); }
      },
    };
    return db;
  }

  // ---- mount an app into an iframe with the given DB backend ----------------
  // The Back button belongs to the app. The container traps browser Back so a
  // reflex press never unloads a running app: the press is delivered to the
  // app as a 'back' event (see gifos.onBack in the shim) and swallowed
  // otherwise. Installed once per tab; remounts (takeover) just retarget it.
  function armBackTrap(getIframe) {
    if (root.__gifosBackTrap) { root.__gifosBackTrap.target = getIframe; return; }
    if (!(root.history && root.history.pushState && root.addEventListener)) return;
    root.__gifosBackTrap = { target: getIframe };
    root.history.replaceState({ gifos: 'base' }, '');
    // Arm from a real gesture, not at load: Android Chrome SKIPS a history entry
    // pushed without user activation (its anti-back-trapping intervention), so a
    // load-time push is silently ignored on a phone. Gestures land either on the
    // container chrome (caught here) or inside the app iframe (the shim pings us
    // as 'uiactive'); both paths carry activation, so the trap entry sticks.
    const arm = () => {
      if (root.history.state && root.history.state.gifos === 'trap') return;
      root.history.pushState({ gifos: 'trap' }, '');
    };
    ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((ev) =>
      root.addEventListener(ev, arm, { capture: true, passive: true }));
    root.addEventListener('message', (e) => {
      const ifr = root.__gifosBackTrap.target();
      if (ifr && e.source === ifr.contentWindow && e.data && e.data.ns === 'gifos' && e.data.type === 'uiactive') arm();
    });
    root.addEventListener('popstate', () => {
      const ifr = root.__gifosBackTrap.target();
      if (ifr && ifr.contentWindow) ifr.contentWindow.postMessage({ ns: 'gifos', type: 'back' }, '*');
      // The Back press carries activation, so this re-push sticks.
      root.history.pushState({ gifos: 'trap' }, '');
    });
  }

  // ---- brokered device capture: the trusted layer holds the camera/mic ------
  // A sandboxed app has an opaque origin and can't be granted camera/mic, and a
  // live MediaStream can't cross into it anyway. So the app OUTSOURCES the grab:
  // it asks the runtime for a CLIP, the runtime (real gifos.app origin) records
  // one behind a visible, unfakeable indicator it owns, then hands back only the
  // bytes. The app never touches the device — stronger than a raw grant, and it
  // literally cannot record without the user watching an overlay it can't fake.
  const capEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CAP_FOR = { audio: 'microphone', video: 'camera', photo: 'camera' };
  const hasCap = (manifest, cap) => !!(manifest && manifest.capabilities && manifest.capabilities[cap]);
  // A capability the manifest declares can still be turned OFF by the user, per
  // app, from run.html's Abilities panel — stored as a list of vetoed cap names
  // under gifos_capoff_<appId>. The brokers below honour it, so unchecking "Use
  // your AI" (or mic/camera/API/agent) actually stops the app from using it.
  function capOff(manifest) {
    try { const id = (manifest && manifest.appId) || 'app';
      const v = JSON.parse(root.localStorage.getItem('gifos_capoff_' + id) || '[]'); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  const capDisabled = (manifest, cap) => capOff(manifest).indexOf(cap) >= 0;
  const CAP_OFF_MSG = (what) => 'You turned ' + what + ' off for this app. Turn it back on in the Abilities panel (the chip at the top of the app’s tab).';
  // The capture indicator the runtime owns (an app can never fake or hide it).
  // For camera kinds it now shows a LIVE preview of exactly what's being
  // recorded, with a flip button to switch front/back camera. opts: { onStop,
  // onFlip, onCancel }. Returns handles the broker uses to feed it the stream
  // and (on a flip) restart the timer.
  function captureOverlay(label, kind, opts) {
    opts = opts || {};
    const doc = root.document;
    const withPreview = kind !== 'audio';
    const bg = doc.createElement('div');
    bg.setAttribute('data-gifos-capture', '1');
    bg.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62);font:15px system-ui;color:#fff;padding:16px;box-sizing:border-box';
    const box = doc.createElement('div');
    box.style.cssText = 'background:#141018;border:1px solid #ff5c5c;border-radius:14px;padding:16px 18px;max-width:' + (withPreview ? '380px' : '320px') + ';width:100%;text-align:center;box-sizing:border-box';
    const noun = kind === 'photo' ? 'a photo' : kind;
    const dev = kind === 'audio' ? 'mic' : 'camera';
    box.innerHTML =
      (withPreview
        ? '<div style="position:relative;margin-bottom:12px">'
          + '<video id="gc-prev" autoplay playsinline muted style="width:100%;max-height:44vh;border-radius:10px;background:#000;display:block"></video>'
          + (opts.onFlip ? '<button id="gc-flip" title="Switch camera" style="position:absolute;top:8px;right:8px;width:40px;height:40px;border:0;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:18px;line-height:40px;cursor:pointer">🔄</button>' : '')
          + '</div>'
        : '<div style="width:14px;height:14px;border-radius:50%;background:#ff5c5c;margin:2px auto 12px"></div>')
      + '<div style="display:flex;align-items:center;justify-content:center;gap:7px;font-weight:800;margin:2px 0 4px">'
      + (withPreview ? '<span style="width:11px;height:11px;border-radius:50%;background:#ff5c5c;display:inline-block"></span>' : '')
      + '<span>GifOS is capturing ' + noun + '</span></div>'
      + '<div style="color:#c8c8dc;font-size:13px;margin-bottom:10px">for <b>' + capEsc(label) + '</b> — it receives only this clip, never your live ' + dev + '.</div>'
      + (kind === 'photo' ? '' : '<div id="gc-t" style="font-variant-numeric:tabular-nums;font-weight:700;margin-bottom:12px">0:00</div>')
      + '<div style="display:flex;gap:8px;justify-content:center">'
      + '<button id="gc-stop" style="padding:9px 20px;border:0;border-radius:9px;background:#ff5c5c;color:#fff;font:inherit;font-weight:700;cursor:pointer">' + (kind === 'photo' ? '📸 Capture' : 'Stop &amp; use') + '</button>'
      + (opts.onCancel ? '<button id="gc-cancel" style="padding:9px 16px;border:1px solid #3a3a48;border-radius:9px;background:transparent;color:#c8c8dc;font:inherit;cursor:pointer">Cancel</button>' : '')
      + '</div>';
    bg.appendChild(box); doc.body.appendChild(bg);
    let t0 = Date.now(); const tEl = box.querySelector('#gc-t');
    const iv = kind === 'photo' ? null : setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      if (tEl) tEl.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }, 250);
    if (opts.onStop) box.querySelector('#gc-stop').onclick = opts.onStop;
    const flipBtn = box.querySelector('#gc-flip'); if (flipBtn && opts.onFlip) flipBtn.onclick = opts.onFlip;
    const cancelBtn = box.querySelector('#gc-cancel'); if (cancelBtn && opts.onCancel) cancelBtn.onclick = opts.onCancel;
    const prev = box.querySelector('#gc-prev');
    return {
      close: () => { if (iv) clearInterval(iv); try { bg.remove(); } catch (e) {} },
      preview: prev,
      resetTimer: () => { t0 = Date.now(); },
      // Feed the live stream to the preview; mirror ONLY the selfie (front) view
      // so it reads naturally, while the recorded frames stay unmirrored.
      setStream: (stream, facing) => {
        if (!prev) return;
        try { prev.srcObject = stream; } catch (e) {}
        prev.style.transform = facing === 'environment' ? 'none' : 'scaleX(-1)';
        const p = prev.play && prev.play(); if (p && p.catch) p.catch(() => {});
      },
    };
  }
  function pickCaptureMime(kind) {
    const MR = root.MediaRecorder;
    if (!MR || !MR.isTypeSupported) return '';
    const cands = kind === 'video'
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const m of cands) { try { if (MR.isTypeSupported(m)) return m; } catch (e) {} }
    return '';
  }
  function brokerCapture(manifest, d) {
    const kind = d.media === 'video' ? 'video' : d.media === 'photo' ? 'photo' : 'audio';
    const cap = CAP_FOR[kind];
    if (!hasCap(manifest, cap)) return Promise.reject(new Error('This app did not declare the "' + cap + '" capability.'));
    if (capDisabled(manifest, cap)) return Promise.reject(new Error(CAP_OFF_MSG(cap === 'microphone' ? 'the microphone' : 'the camera')));
    const nav = root.navigator;
    if (!(nav && nav.mediaDevices && nav.mediaDevices.getUserMedia)) return Promise.reject(new Error('No ' + cap + ' available here.'));
    const wantVideo = kind !== 'audio';
    const wantAudio = kind === 'audio' || (kind === 'video' && d.audio !== false);
    const maxMs = Math.min(Math.max(1, d.maxSeconds || 15), 120) * 1000;
    const label = manifest.name || manifest.appId || 'an app';
    // Which way the camera faces. `facingMode` is a soft constraint, so on a
    // one-camera device flipping just re-picks the same camera (never errors).
    let facing = d.facing === 'environment' ? 'environment' : 'user';
    const acquire = (f) => nav.mediaDevices.getUserMedia({ audio: wantAudio, video: wantVideo ? { facingMode: f } : false });
    return acquire(facing)
      .then((stream0) => new Promise((resolve, reject) => {
        let done = false, ov = null, autoT = null, rec = null, stream = stream0, chunks = [], startMs = 0, flipping = false;
        const stopTracks = (s) => { try { (s || stream).getTracks().forEach((t) => t.stop()); } catch (e) {} };
        const cleanup = () => { if (autoT) clearTimeout(autoT); stopTracks(); if (ov) ov.close(); };
        // ---- PHOTO: live preview, tap to capture, flip to switch camera ----
        if (kind === 'photo') {
          const snap = () => {
            if (done) return; done = true;
            const v = ov && ov.preview; const w = (v && v.videoWidth) || 640, h = (v && v.videoHeight) || 480;
            const c = root.document.createElement('canvas'); c.width = w; c.height = h;
            try { if (v) c.getContext('2d').drawImage(v, 0, 0, w, h); } catch (e) {}
            c.toBlob((blob) => {
              cleanup();
              if (!blob) return reject(new Error('Could not capture a frame.'));
              blob.arrayBuffer().then((buf) => resolve({ bytes: buf, mime: 'image/jpeg', width: w, height: h }));
            }, 'image/jpeg', 0.9);
          };
          const flipPhoto = () => {
            if (done || flipping) return; flipping = true;
            facing = facing === 'user' ? 'environment' : 'user';
            const prev = stream;
            acquire(facing).then((s) => { stopTracks(prev); stream = s; if (ov) ov.setStream(s, facing); flipping = false; })
              .catch(() => { flipping = false; });
          };
          ov = captureOverlay(label, 'photo', {
            onStop: () => { if (!done && !flipping) snap(); },
            onFlip: flipPhoto,
            onCancel: () => { if (!done) { done = true; cleanup(); reject(new Error('Capture cancelled.')); } },
          });
          ov.setStream(stream, facing);
          autoT = setTimeout(() => { if (!done) snap(); }, 60000); // safety: never hang forever
          return;
        }

        // ---- AUDIO / VIDEO recording ----
        const mime = pickCaptureMime(kind);
        const startRecorder = () => {
          try { rec = new root.MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
          catch (e) { try { rec = new root.MediaRecorder(stream); } catch (e2) { cleanup(); return reject(new Error('Recording is not supported here.')); } }
          chunks = []; startMs = Date.now();
          rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
          rec.onstop = () => {
            if (flipping) return; // a flip stopped it only to swap cameras — the restart continues
            const durationMs = Date.now() - startMs;
            cleanup();
            const blob = new Blob(chunks, { type: (rec && rec.mimeType) || mime || (kind === 'video' ? 'video/webm' : 'audio/webm') });
            blob.arrayBuffer().then((buf) => resolve({ bytes: buf, mime: blob.type, durationMs }));
          };
          try { rec.start(); } catch (e) { cleanup(); return reject(new Error('Recording failed to start.')); }
        };
        const stop = () => { if (done || flipping) return; done = true; try { rec.stop(); } catch (e) { cleanup(); reject(new Error('Recording failed.')); } };
        // Flip mid-recording (video only): stop this recorder, re-acquire the
        // other camera and restart a fresh clip. Old chunks are dropped — a flip
        // means "record from the other camera instead."
        const flipVideo = () => {
          if (done || flipping || kind !== 'video') return;
          flipping = true;
          facing = facing === 'user' ? 'environment' : 'user';
          const prevStream = stream;
          try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) {}
          acquire(facing).then((s) => {
            stopTracks(prevStream); stream = s;
            if (ov) { ov.setStream(s, facing); ov.resetTimer(); }
            if (autoT) clearTimeout(autoT); autoT = setTimeout(stop, maxMs);
            flipping = false; startRecorder();
          }).catch(() => { flipping = false; if (!done) { done = true; cleanup(); reject(new Error('Could not switch camera.')); } });
        };
        ov = captureOverlay(label, kind, { onStop: stop, onFlip: kind === 'video' ? flipVideo : null });
        if (kind === 'video') ov.setStream(stream, facing);
        autoT = setTimeout(stop, maxMs);
        startRecorder();
      }))
      .catch((err) => { throw new Error(err && err.name === 'NotAllowedError' ? 'Permission to use the ' + cap + ' was denied.' : (err && err.message) || String(err)); });
  }

  // ---- brokered AI: the GifOS computer holds the endpoints + keys -----------
  // Apps ask the computer for intelligence; the RUNTIME (gifos.app origin) calls
  // the user's configured OpenAI-shaped endpoint with the key attached and hands
  // back only the result. The key lives in localStorage (per-origin, and NOT in
  // a shareable computer backup) and is NEVER given to an app. `model` is a
  // ROLE — 'smartest'/'cheapest' for text — mapped to a configured endpoint, so
  // an app is portable across whatever provider the user wired up.
  const AI_KEY = 'gifos_ai_config';
  const AI_PATH = { chat: '/chat/completions', tts: '/audio/speech', stt: '/audio/transcriptions', image: '/images/generations', video: '/video/generations', image_to_video: '/video/generations' };
  function aiConfig() { try { return JSON.parse(root.localStorage.getItem(AI_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function aiEndpoint(c, op) {
    const base = (c.url || '').replace(/\/+$/, ''); const path = AI_PATH[op] || '';
    if (!base) return '';
    return (path && base.slice(-path.length) === path) ? base : base + path;
  }
  function b64ToBuf(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  function bufToB64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
  function brokerAI(manifest, d) {
    if (!hasCap(manifest, 'ai')) return Promise.reject(new Error('This app did not declare the "ai" capability.'));
    if (capDisabled(manifest, 'ai')) return Promise.reject(new Error(CAP_OFF_MSG('AI')));
    const cfg = aiConfig();
    if (d.op === 'models') return Promise.resolve({ available: Object.keys(cfg).filter((k) => cfg[k] && cfg[k].url) });
    const role = d.op === 'chat' ? (d.model === 'smartest' ? 'smartest' : 'cheapest') : d.op;
    if (!aiAllowed(manifest, role)) return Promise.reject(new Error('This app did not declare the "' + role + '" AI type in its manifest (capabilities.ai).'));
    const c = cfg[role];
    if (!c || !c.url) { showSystemSetup({ kind: 'ai', role: role, hint: d.hint }); return Promise.reject(new Error('NOT_CONFIGURED:ai:' + role)); }
    const url = aiEndpoint(c, d.op);
    const auth = c.key ? { Authorization: 'Bearer ' + c.key } : {};
    const asError = (r) => r.text().then((t) => { throw new Error('AI error ' + r.status + (t ? ': ' + t.slice(0, 300) : '')); });

    if (d.op === 'chat') {
      const body = { model: c.model || d.modelName || 'gpt-4o-mini', messages: d.messages || [{ role: 'user', content: String(d.prompt || '') }], stream: false };
      if (d.temperature != null) body.temperature = d.temperature;
      if (d.maxTokens != null) body.max_tokens = d.maxTokens;
      return root.fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth), body: JSON.stringify(body) })
        .then((r) => r.ok ? r.json() : asError(r))
        .then((j) => ({ text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '', raw: j }));
    }
    if (d.op === 'tts') {
      const body = { model: c.model || 'tts-1', input: String(d.text || ''), voice: d.voice || c.voice || 'alloy' };
      if (d.format) body.response_format = d.format;
      return root.fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth), body: JSON.stringify(body) })
        .then((r) => r.ok ? r.arrayBuffer().then((buf) => ({ bytes: buf, mime: r.headers.get('content-type') || 'audio/mpeg' })) : asError(r));
    }
    if (d.op === 'stt') {
      const fd = new root.FormData();
      const blob = new Blob([d.bytes || d.audio || new ArrayBuffer(0)], { type: d.mime || 'audio/webm' });
      fd.append('file', blob, 'clip.' + ((d.mime || 'audio/webm').split('/')[1] || 'webm').split(';')[0]);
      fd.append('model', c.model || 'whisper-1');
      if (d.language) fd.append('language', d.language);
      return root.fetch(url, { method: 'POST', headers: auth, body: fd })
        .then((r) => r.ok ? r.json() : asError(r)).then((j) => ({ text: j.text || '', raw: j }));
    }
    if (d.op === 'image') {
      const body = { model: c.model || 'gpt-image-1', prompt: String(d.prompt || ''), n: 1, response_format: 'b64_json' };
      if (d.size) body.size = d.size;
      return root.fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth), body: JSON.stringify(body) })
        .then((r) => r.ok ? r.json() : asError(r))
        .then((j) => {
          const d0 = (j.data && j.data[0]) || {};
          if (d0.b64_json) return { bytes: b64ToBuf(d0.b64_json), mime: 'image/png', raw: j };
          if (d0.url) return { url: d0.url, raw: j };
          return { raw: j };
        });
    }
    // video / image_to_video: provider-shaped, no settled standard — pass the
    // request through and hand back whatever the endpoint returns (json w/ a
    // url or job id, or raw bytes) for the app to poll/render.
    const body = { model: c.model, prompt: d.prompt };
    if (d.image) body.image = d.image; if (d.size) body.size = d.size; if (d.seconds) body.seconds = d.seconds;
    return root.fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth), body: JSON.stringify(body) })
      .then((r) => {
        if (!r.ok) return asError(r);
        const ct = r.headers.get('content-type') || '';
        return /json/.test(ct) ? r.json().then((raw) => ({ raw })) : r.arrayBuffer().then((buf) => ({ bytes: buf, mime: ct || 'video/mp4' }));
      });
  }

  // ---- brokered third-party APIs (Deepgram, Schwab, …) ----------------------
  // Generalises the AI broker to ANY keyed API. The user names an API in
  // Settings → Third-party APIs with its base URL + auth scheme + key (stored
  // in localStorage, per-origin, kept OUT of a shareable backup GIF). An app
  // declares the names it uses under capabilities.api, then calls
  // gifos.api(name, req). The runtime attaches the credential and REFUSES to
  // send it anywhere but that API's own origin, so a key can never be leaked to
  // an app or redirected to another host.
  const API_KEY = 'gifos_api_config';
  const API_PROXY_DEFAULT = 'https://cors-proxy.gifos.app';
  function apiConfig() { try { return JSON.parse(root.localStorage.getItem(API_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function apiAllowed(manifest, name) {
    const list = (manifest && manifest.capabilities && manifest.capabilities.api) || [];
    return Array.isArray(list) && list.indexOf(name) !== -1;
  }
  // Known third-party providers — lets the SYSTEM render specific setup guidance
  // (base URL, auth scheme) when an app asks for one that isn't configured, so
  // apps don't hardcode "go to Settings and type https://api.deepgram.com".
  const KNOWN_APIS = {
    deepgram: { label: 'Deepgram', url: 'https://api.deepgram.com', auth: 'Token' },
  };
  // The AI "types" a manifest can name under capabilities.ai (an array), each a
  // row the user sets up in Settings → AI models. Labels match that screen.
  const AI_ROLE_LABELS = {
    smartest: 'Smartest text LLM', cheapest: 'Cheapest text LLM', tts: 'Text → speech',
    stt: 'Speech → text', image: 'Text → image', image_to_video: 'Image → video', video: 'Text → video',
  };
  // Which AI roles a manifest declares. true / missing array = generic (any).
  function aiRoles(manifest) {
    const a = manifest && manifest.capabilities && manifest.capabilities.ai;
    return Array.isArray(a) ? a.filter((r) => AI_ROLE_LABELS[r]) : null; // null = generic
  }
  function aiAllowed(manifest, role) {
    const roles = aiRoles(manifest);
    return roles === null ? true : roles.indexOf(role) !== -1; // generic allows any; array gates
  }
  function escHtml(s) { const e = root.document.createElement('div'); e.textContent = s == null ? '' : String(s); return e.innerHTML; }

  // The GifOS-owned "you need to set this up" prompt. Apps trigger it (by making
  // the call, or via gifos.apiSetup / gifos.aiSetup) but never author its generic
  // text — GifOS does, consistently. Apps may pass a `hint` with app-specific
  // extras (e.g. "new accounts include free credit"), appended below.
  function showSystemSetup(opts) {
    try {
      const doc = root.document; if (!doc || !doc.body) return;
      const old = doc.getElementById('gifos-setup-modal'); if (old) old.remove();
      let title, body;
      if (opts.kind === 'ai') {
        const label = AI_ROLE_LABELS[opts.role];
        title = (label || 'An AI model') + ' isn’t set up yet';
        body = 'This app uses an AI model you provide. In GifOS <b>Settings → AI models</b>, set up ' +
          (label ? 'the <b>' + escHtml(label) + '</b> model' : 'a text model') + ' — any OpenAI-compatible endpoint and key.';
      } else {
        const k = KNOWN_APIS[String(opts.name || '').toLowerCase()];
        title = (k ? k.label : opts.name) + ' isn’t set up yet';
        body = 'In GifOS <b>Settings → Third-party APIs</b>, add one named <b>' + escHtml(opts.name) + '</b>' +
          (k ? ', base URL <span style="font-family:ui-monospace,monospace">' + escHtml(k.url) + '</span>' + (k.auth ? ', <b>' + escHtml(k.auth) + '</b> auth' : '') : '') + '.';
      }
      body += ' Your key stays in this browser — the app never sees it.';
      const bg = doc.createElement('div'); bg.id = 'gifos-setup-modal'; bg.className = 'perm-modal';
      bg.setAttribute('style', 'position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:1.2rem;');
      const box = doc.createElement('div'); box.className = 'perm-box';
      box.setAttribute('style', 'background:#14141f;color:#e8e8f4;border:1px solid #2a2a3f;border-radius:.8rem;max-width:23rem;width:100%;padding:1.2rem;font:15px/1.55 system-ui,-apple-system,sans-serif;');
      box.innerHTML = '<h3 style="margin:0 0 .5rem;font-size:1.1rem">' + escHtml(title) + '</h3>' +
        '<p style="color:#b6b6cf;font-size:.9rem;margin:0 0 .7rem">' + body + '</p>' +
        (opts.hint ? '<p style="color:#9a9ab5;font-size:.83rem;margin:0 0 .9rem">' + escHtml(opts.hint) + '</p>' : '') +
        '<div style="text-align:right"><button id="gifos-setup-ok" style="padding:.5rem 1.3rem;border-radius:.5rem;border:none;background:#7b5cff;color:#fff;cursor:pointer;font:inherit">Got it</button></div>';
      bg.appendChild(box); doc.body.appendChild(bg);
      box.querySelector('#gifos-setup-ok').onclick = function () { bg.remove(); };
      bg.addEventListener('click', function (e) { if (e.target === bg) bg.remove(); });
    } catch (e) { /* no DOM host — the coded rejection still reaches the app */ }
  }

  function brokerApi(manifest, d) {
    const name = d.name;
    if (!name || !apiAllowed(manifest, name)) return Promise.reject(new Error('This app did not declare the "' + name + '" third-party API in its manifest.'));
    if (capDisabled(manifest, 'api')) return Promise.reject(new Error(CAP_OFF_MSG('your third-party accounts')));
    const c = apiConfig()[name];
    if (!c || !c.url) { showSystemSetup({ kind: 'api', name: name, hint: d.hint }); return Promise.reject(new Error('NOT_CONFIGURED:' + name)); }
    let baseOrigin;
    const base = String(c.url).replace(/\/+$/, '');
    try { baseOrigin = new URL(base).origin; } catch (e) { return Promise.reject(new Error('Bad base URL for "' + name + '".')); }
    let path = String(d.path || '');
    if (/:\/\//.test(path) || path.slice(0, 2) === '//' || /\s/.test(path)) return Promise.reject(new Error('api path must be a relative path on the configured host.'));
    if (path && path[0] !== '/' && path[0] !== '?') path = '/' + path;
    let u;
    try { u = new URL(base + path); } catch (e) { return Promise.reject(new Error('Bad request path.')); }
    if (d.query && typeof d.query === 'object') for (const k in d.query) u.searchParams.append(k, d.query[k]);
    // The credential leaves this origin ONLY for the API's own host. Nothing the
    // app supplies can move it elsewhere.
    if (u.origin !== baseOrigin) return Promise.reject(new Error('api request must stay on the configured host (' + baseOrigin + ').'));
    const headers = {};
    for (const k in (d.headers || {})) headers[k] = d.headers[k]; // app headers first; auth overwrites below
    const at = c.authType || 'bearer', an = c.authName || '', key = c.key || '';
    if (key) {
      if (at === 'bearer') headers.Authorization = 'Bearer ' + key;
      else if (at === 'token') headers.Authorization = 'Token ' + key;      // Deepgram-style
      else if (at === 'header' && an) headers[an] = key;                    // e.g. x-api-key
      else if (at === 'query' && an) u.searchParams.set(an, key);
    }
    let body = d.body;
    if (body && (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) { /* binary, pass through */ }
    else if (body && typeof body === 'object' && typeof body.b64 === 'string') body = b64ToBuf(body.b64);
    else if (body && typeof body === 'object') { body = JSON.stringify(body); if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json'; }
    const method = String(d.method || 'GET').toUpperCase();
    const init = { method, headers };
    if (method !== 'GET' && method !== 'HEAD' && body != null) init.body = body;
    // Server-only APIs (Deepgram's REST, …) send no CORS headers, so a direct
    // browser fetch is blocked. If the user turned on a CORS proxy for this API,
    // we send to the proxy with the true target in x-gifos-target; the proxy
    // forwards and adds the CORS headers. The key still travels ONLY toward the
    // configured host (host-pinning above already proved u.origin === base).
    let fetchUrl = u.toString();
    if (c.proxy) {
      const pbase = (c.proxy === true || c.proxy === 'default') ? API_PROXY_DEFAULT : String(c.proxy).replace(/\/+$/, '');
      headers['x-gifos-target'] = fetchUrl;
      fetchUrl = pbase + '/';
    }
    return root.fetch(fetchUrl, init).then((r) => {
      const ct = r.headers.get('content-type') || '';
      const as = d.as || (/json/.test(ct) ? 'json' : 'text');
      const meta = { status: r.status, ok: r.ok, contentType: ct };
      if (as === 'bytes') return r.arrayBuffer().then((buf) => Object.assign(meta, { bytes: buf, mime: ct }));
      return r.text().then((t) => { if (as === 'json') { try { return Object.assign(meta, { json: JSON.parse(t) }); } catch (e) { /* not json */ } } return Object.assign(meta, { text: t }); });
    });
  }

  // ---- in-app agent (capabilities.agent) ------------------------------------
  // When an app declares `agent`, GifOS injects a small agent (agentBootstrap,
  // below) INTO the app's sandboxed iframe. It reads only that app's DOM and
  // clicks/types on it — the opaque-origin sandbox confines its blast radius to
  // this one app. Its "brain" is the user's Smartest model, brokered here so the
  // KEY never enters the sandbox. Gated by the `agent` capability.
  function brokerAgentChat(manifest, d) {
    if (!hasCap(manifest, 'agent')) return Promise.reject(new Error('This app did not declare the "agent" capability.'));
    if (capDisabled(manifest, 'agent')) return Promise.reject(new Error(CAP_OFF_MSG('the AI assistant')));
    const c = aiConfig().smartest;
    if (!c || !c.url) { showSystemSetup({ kind: 'ai', role: 'smartest' }); return Promise.reject(new Error('NOT_CONFIGURED:ai:smartest')); }
    const url = aiEndpoint(c, 'chat');
    const auth = c.key ? { Authorization: 'Bearer ' + c.key } : {};
    const body = { model: c.model || 'gpt-4o', messages: d.messages || [], stream: false, temperature: 0.1 };
    if (d.maxTokens != null) body.max_tokens = d.maxTokens;
    return root.fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth), body: JSON.stringify(body) })
      .then((r) => r.ok ? r.json() : r.text().then((t) => { throw new Error('AI error ' + r.status + (t ? ': ' + t.slice(0, 200) : '')); }))
      .then((j) => ({ text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '' }));
  }

  // The injected agent: a compact read-DOM → ask-Smartest → click/type loop, plus
  // a visible bar the user drives and can stop. Runs INSIDE the app sandbox (so
  // it can only ever see/touch this app), talks to the model only via
  // gifos._agentChat (key stays out). Returned as a source string; buildAppHtml
  // drops it in as a <script> when the app declares `agent`.
  function agentBootstrap() {
    return "(function(){\n" +
"  if (!window.gifos || typeof gifos._agentChat !== 'function') return;\n" +
"  var running = false, MAXSTEPS = 10;\n" +
"  var css = 'position:fixed;z-index:2147483000;font:13px system-ui,-apple-system,sans-serif;';\n" +
"  var bar = document.createElement('div'); bar.setAttribute('data-agent-ui','1');\n" +
"  bar.setAttribute('style', css+'left:0;right:0;bottom:0;background:#14141f;color:#e8e8f4;border-top:1px solid #2a2a3f;padding:.45rem .5rem;display:flex;gap:.4rem;align-items:center');\n" +
"  var inp = document.createElement('input'); inp.placeholder='Tell the agent what to do on this app…';\n" +
"  inp.setAttribute('style','flex:1;min-width:0;padding:.4rem .55rem;border-radius:.45rem;border:1px solid #2a2a3f;background:#0a0a0f;color:#e8e8f4;font:inherit');\n" +
"  var run = document.createElement('button'); run.textContent='Run'; run.setAttribute('style','padding:.4rem .9rem;border:none;border-radius:.45rem;background:#7b5cff;color:#fff;font:inherit;cursor:pointer');\n" +
"  var stop = document.createElement('button'); stop.textContent='Stop'; stop.setAttribute('style','padding:.4rem .8rem;border:1px solid #2a2a3f;border-radius:.45rem;background:transparent;color:#b6b6cf;font:inherit;cursor:pointer;display:none');\n" +
"  var tag = document.createElement('span'); tag.textContent='\\u2726 Agent'; tag.setAttribute('style','font-weight:700;color:#8f78ff;white-space:nowrap');\n" +
"  bar.appendChild(tag); bar.appendChild(inp); bar.appendChild(run); bar.appendChild(stop);\n" +
"  var logbox = document.createElement('div'); logbox.setAttribute('data-agent-ui','1');\n" +
"  logbox.setAttribute('style', css+'right:.5rem;bottom:3rem;max-width:18rem;max-height:40vh;overflow:auto;color:#b6b6cf;text-align:right;pointer-events:none');\n" +
"  document.addEventListener('DOMContentLoaded', function(){ document.body.appendChild(bar); document.body.appendChild(logbox); });\n" +
"  if (document.body) { document.body.appendChild(bar); document.body.appendChild(logbox); }\n" +
"  function log(m){ var d=document.createElement('div'); d.textContent=m; d.setAttribute('style','background:rgba(20,20,31,.9);border:1px solid #2a2a3f;border-radius:.4rem;padding:.2rem .45rem;margin-top:.25rem;display:inline-block'); logbox.appendChild(d); logbox.scrollTop=logbox.scrollHeight; }\n" +
"  function vis(el){ var r=el.getBoundingClientRect(); if (r.width<1||r.height<1) return false; var s=getComputedStyle(el); return s.visibility!=='hidden'&&s.display!=='none'&&el.offsetParent!==null; }\n" +
"  function label(el){ return (el.getAttribute('aria-label')||el.placeholder||el.value||(el.textContent||'').trim()||el.name||el.title||'').replace(/\\s+/g,' ').trim().slice(0,70); }\n" +
"  function snapshot(){ var sel='a,button,input,textarea,select,[role=button],[contenteditable=\"\"],[contenteditable=\"true\"],[onclick]';\n" +
"    var els=[].slice.call(document.querySelectorAll(sel)), map=[], lines=[];\n" +
"    els.forEach(function(el){ if (el.closest('[data-agent-ui]')) return; if (!vis(el)) return; var i=map.length; map.push(el);\n" +
"      lines.push('['+i+'] '+el.tagName.toLowerCase()+(el.type?(':'+el.type):'')+' \\\"'+label(el)+'\\\"'); });\n" +
"    return { text: lines.join('\\n'), map: map }; }\n" +
"  function setVal(el, v){ var t=el.tagName.toLowerCase();\n" +
"    if (t==='input'||t==='textarea'||t==='select'){ el.focus(); el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }\n" +
"    else { el.focus(); el.textContent=v; el.dispatchEvent(new Event('input',{bubbles:true})); } }\n" +
"  function flash(el){ var o=el.style.outline; el.style.outline='2px solid #8f78ff'; setTimeout(function(){ el.style.outline=o; }, 600); }\n" +
"  var SYS='You operate a web app for the user by choosing ONE UI action at a time. You are given a numbered list of the app\\'s interactive elements and the goal. Reply with STRICT JSON only, no prose: {\\\"action\\\":\\\"click\\\"|\\\"type\\\"|\\\"done\\\",\\\"index\\\":<number>,\\\"text\\\":\\\"<text to type>\\\",\\\"say\\\":\\\"<short status>\\\"}. Choose done when the goal is achieved or clearly impossible. Only use element indices that exist.';\n" +
"  function strip(s){ return String(s||'').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim(); }\n" +
"  function sleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }\n" +
"  async function go(task){ if (running) return; running=true; run.style.display='none'; stop.style.display=''; logbox.innerHTML=''; var hist=[];\n" +
"    log('\\u25B6 '+task);\n" +
"    for (var step=0; step<MAXSTEPS && running; step++){\n" +
"      var snap=snapshot();\n" +
"      var user='GOAL: '+task+'\\n\\nINTERACTIVE ELEMENTS:\\n'+(snap.text||'(none)')+'\\n\\nACTIONS SO FAR:\\n'+(hist.join('\\n')||'(none yet)');\n" +
"      var res; try { res=await gifos._agentChat([{role:'system',content:SYS},{role:'user',content:user}]); } catch(e){ log('\\u26A0 '+(e&&e.message||e)); break; }\n" +
"      var act; try { act=JSON.parse(strip(res.text)); } catch(e){ log('\\u26A0 could not read the model\\'s reply'); break; }\n" +
"      if (act.say) log(act.say);\n" +
"      if (act.action==='done'){ log('\\u2713 done'); break; }\n" +
"      var el=snap.map[act.index]; if (!el){ log('\\u26A0 no element ['+act.index+']'); break; }\n" +
"      flash(el);\n" +
"      if (act.action==='type'){ setVal(el, act.text||''); hist.push('typed \\\"'+(act.text||'')+'\\\" into ['+act.index+']'); }\n" +
"      else { el.click(); hist.push('clicked ['+act.index+']'); }\n" +
"      await sleep(500);\n" +
"      if (step===MAXSTEPS-1) log('\\u26A0 stopped after '+MAXSTEPS+' steps');\n" +
"    }\n" +
"    running=false; run.style.display=''; stop.style.display='none'; }\n" +
"  run.onclick=function(){ var t=inp.value.trim(); if (t) go(t); };\n" +
"  inp.addEventListener('keydown', function(e){ if (e.key==='Enter'){ e.preventDefault(); run.click(); } });\n" +
"  stop.onclick=function(){ running=false; log('stopped'); };\n" +
"})();";
  }

  function mountApp(iframe, files, manifest, db, originalBytes, policy) {
    policy = policy || makeNetPolicy(null, manifest); // client-run: session-only
    armBackTrap(() => iframe);
    const handler = (e) => {
      if (!iframe.contentWindow || e.source !== iframe.contentWindow) return;
      const d = e.data; if (!d || d.ns !== 'gifos') return;
      // Guard at REPLY time, not just receipt: async ops (db/fetch/…) can
      // resolve after the iframe was torn out of the DOM (app takeover /
      // stop), when contentWindow is null — a reply then must be a no-op,
      // not an unhandled "reading 'postMessage'" rejection.
      const reply = (p) => { const w = iframe && iframe.contentWindow; if (w) w.postMessage(Object.assign({ ns: 'gifos', type: 'reply', id: d.id }, p), '*'); };
      if (d.type === 'db') db.op(d.op, d.collection, d.key, d.value).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      else if (d.type === 'fetch') bridgeFetch(policy, d).then((r) => reply({ ok: true, result: r })).catch((err) => reply({ ok: false, error: String(err.message || err) }));
      else if (d.type === 'save') downloadSnapshot(originalBytes, files, manifest, db).then((name) => reply({ ok: true, result: name })).catch((err) => reply({ ok: false, error: String(err.message || err) }));
      else if (d.type === 'capture') brokerCapture(manifest, d).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      else if (d.type === 'ai') brokerAI(manifest, d).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      else if (d.type === 'api') brokerApi(manifest, d).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      else if (d.type === 'apiReady') { const c = apiConfig()[d.name]; reply({ ok: true, result: apiAllowed(manifest, d.name) && !!(c && c.url) }); }
      else if (d.type === 'apiSetup') { showSystemSetup({ kind: 'api', name: d.name, hint: d.hint }); reply({ ok: true, result: true }); }
      else if (d.type === 'aiSetup') { showSystemSetup({ kind: 'ai', role: d.role, hint: d.hint }); reply({ ok: true, result: true }); }
      else if (d.type === 'agentChat') brokerAgentChat(manifest, d).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      // owner = this app runs on its OWNER's computer (host / local), so it may
      // change visibility (setVisibility). A guest view is not the owner.
      else if (d.type === 'info') reply({ ok: true, result: { appId: manifest.appId, name: manifest.name, version: manifest.version, owner: !!(db && db.owner) } });
      else if (d.type === 'me') reply({ ok: true, result: identity() });
      else if (d.type === 'setName') reply({ ok: true, result: setName(d.name) });
      else if (d.type === 'storage') {
        const est = root.navigator && root.navigator.storage && root.navigator.storage.estimate;
        (est ? root.navigator.storage.estimate() : Promise.resolve({}))
          .then((e) => reply({ ok: true, result: { usage: e.usage || 0, quota: e.quota || 0 } }))
          .catch(() => reply({ ok: true, result: { usage: 0, quota: 0 } }));
      }
    };
    root.addEventListener('message', handler);
    // Hand the chrome (run.html) this app's network policy so it can show the
    // launch acknowledgement and the tab control. Fires for every mount path.
    if (root.__gifosPermissions) { try { root.__gifosPermissions(policy, manifest); } catch (e) { /* no chrome */ } }
    // Motion sensors are delegated to the sandbox via the iframe allow-policy
    // (the events fire INSIDE the app frame). Camera/mic are NOT delegated —
    // those are captured by the trusted parent and handed back as clips.
    if (hasCap(manifest, 'motion') && !capDisabled(manifest, 'motion')) { try { iframe.setAttribute('allow', 'gyroscope; accelerometer; magnetometer'); } catch (e) {} }
    iframe.srcdoc = buildAppHtml(files, manifest);
    return () => root.removeEventListener('message', handler);
  }

  function makeIframe() {
    const iframe = document.createElement('iframe');
    // allow-downloads lets an app hand the user a file they clicked for (chat
    // attachments, exports). The browser still requires a user gesture, and a
    // download opens no network or data path — bytes can only come from
    // inside the GIF, and saving is the user's own click.
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-downloads'); // isolated: null origin
    iframe.style.cssText = 'width:100%;height:100%;border:0;background:#fff';
    return iframe;
  }

  // ---- connection resilience -------------------------------------------------
  // Phones freeze tabs and kill sockets the instant the user glances away.
  // That must never end a session, and it must not raise alarms either:
  //   up   (green)       — link healthy
  //   soft (light green) — blip, down < SOFT ms; no cause for concern
  //   warn (yellow)      — down but recoverable; we keep retrying
  //   lost (red)         — down past LOST ms; genuinely gone
  // AUTO_TAKEOVER: how long a host must be gone before mirrored clients heal
  // the session themselves. CAND_LEAD: how far ahead of that they gossip
  // candidacies (mirror freshness) to rank who goes first. RANK_STEP: stagger
  // between ranked candidates so backups only claim if the leader stalls.
  // root.GIFOS_CONN lets tests shrink these without waiting out real clocks.
  const CONN = Object.assign(
    { SOFT: 4000, LOST: 60000, PEER_DROP: 120000, TAKEOVER_HINT: 5000, AUTO_TAKEOVER: 25000, CAND_LEAD: 6000, RANK_STEP: 4000 },
    root.GIFOS_CONN || {});
  function gradeOf(downSince) {
    if (!downSince) return 'up';
    const d = Date.now() - downSince;
    return d < CONN.SOFT ? 'soft' : d < CONN.LOST ? 'warn' : 'lost';
  }
  // Structured connection state for the page chrome (the compact pill). The
  // verbose sentence still goes to #status; this event carries the colors.
  function announceConn(detail) {
    root.__gifosConn = detail;
    try { root.dispatchEvent(new CustomEvent('gifos-conn', { detail })); } catch (e) { /* non-DOM */ }
  }

  // ---- shared transport fabric (gifos-net.js) --------------------------------
  // The self-healing relay socket, WebRTC availability, the session Web Lock,
  // and the fragmentation layer all live in GifOS.net now — one implementation
  // for app sessions AND meetings. The relay is the signaling channel; once a
  // DataChannel opens, session traffic flows directly browser-to-browser, with
  // a friend-hop (P1) and the relay (P2) as the fallback rungs. No TURN server.
  const steadySocket = net.steadySocket;
  const ICE_SERVERS = net.ICE_SERVERS;
  const hasP2P = net.hasP2P;
  const holdSessionLock = net.holdSessionLock;
  const sendChunked = net.sendChunked;
  const makeDefrag = net.makeDefrag;

  // (attachHost + openHostSocket DELETED — one-runtime step 6: the relay star
  // is gone; app state rides the room mesh lane, owner-signed. docs/one-runtime.md)

  // ---- standalone / host boot ----------------------------------------------
  function boot(mountEl, fileId, statusEl) {
    const setStatus = (m) => { if (statusEl) statusEl.textContent = m; };
    const noop = { save: () => Promise.resolve(null), becomeHost: () => Promise.reject(new Error('nothing running')) };
    return store.getFile(fileId).then((rec) => {
      if (!rec) { setStatus('File not found on this desktop.'); return noop; }
      const appBytes = rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes);
      return gif.decode(appBytes).then((archive) => bootDecoded(archive, appBytes, rec));
    });

    function bootDecoded(archive, appBytes, rec) {
      if (!archive) { setStatus('Not a GifOS app — nothing to run.'); return noop; }
      const files = archive.files;
      const manifest = gif.readManifest(archive) || { name: rec.name || 'App' };
      // System apps run as trusted first-party pages, not in the sandbox —
      // live media (camera/mic + WebRTC) is impossible from an opaque origin.
      // Whitelist only; a manifest can't route to arbitrary URLs.
      const SYSTEM_PAGES = { meet: 'run.html', video: 'run.html', broadcast: 'run.html#bc=1', store: 'store.html' }; // 'video' = pre-rename seeds; 'broadcast' = the meet page's broadcast skin
      if (manifest.system && SYSTEM_PAGES[manifest.system]) {
        // The store installs INTO a computer, so it has to land on the one this
        // app was opened from — a booted computer image (boot.html) keeps its
        // own namespace, and an install must not leak into the host desktop.
        const ns = (manifest.system === 'store' && store.dbName && store.dbName !== 'gifos')
          ? '?db=' + encodeURIComponent(store.dbName) : '';
        const target = SYSTEM_PAGES[manifest.system] + ns;
        location.replace(target);
        // A hash-carrying target (broadcast → run.html#bc=1) from THIS page
        // (the app host is run.html too) is a same-document fragment hop —
        // it never re-boots on its own, so force the reload. Hash-less
        // targets are real navigations already; reloading those would race
        // the replace and re-boot the OLD url.
        if (target.indexOf('#') !== -1) location.reload();
        return noop;
      }
      document.title = (manifest.name || 'App') + ' — GifOS';

      const hasEntry = !!files[norm(manifest.entry || 'index.html')] || !!files['index.html'];
      const iframe = makeIframe();
      mountEl.innerHTML = ''; mountEl.appendChild(iframe);
      if (!hasEntry) { iframe.srcdoc = buildFolderHtml(files); setStatus('Browsable filesystem (no index.html).'); return noop; }

      let hostApi = null;
      // When this host is sharing its app over the mesh Stage DATA lane (an
      // app-in-a-meeting), attachStageBus (below) installs a hook here so every
      // authoritative db-change is re-broadcast as an owner-signed frame.
      let stageOnChange = null;
      const emit = (collection) => {
        if (iframe.contentWindow) iframe.contentWindow.postMessage({ ns: 'gifos', type: 'db-change', collection }, '*');
        if (hostApi) hostApi.sendToAll({ t: 'db-change', collection });
        if (stageOnChange) { try { stageOnChange(collection); } catch (e) { /* bus torn down */ } }
      };
      const db = makeLocalDb(fileId, emit);
      const netPolicy = makeNetPolicy(fileId, manifest);

      // ---- invite-link lifetime & resilience ------------------------------
      // The link is a capability: whoever holds it can join live AND pull a
      // full copy of this app's data (their browser mirrors the state to sync,
      // so there is no way to un-share it once seen). Two INDEPENDENT dials let
      // the host tune it — conflated, they made a 1-hour game die at 60 min or
      // freeze on a dead battery:
      //   lifetime — how long the link admits NEW people. 'close' (default) is
      //     a fresh id each open, retired for good when this tab closes or a
      //     new link is minted; '1h'/'24h' stop admitting after that long but
      //     never kick who's already in; 'forever' always admits.
      //   resilient — if the host drops off (close/crash/battery), may a still-
      //     connected guest keep the session going? Off by default (privacy:
      //     it ends with you). On mirrors state to guests for self-healing.
      // 'close' forces resilient off — a link that dies on close can't also be
      // kept alive by someone else. Expiry only shuts the door; it never ends a
      // session in progress.
      let liveHost = null; // { ws, timer, stop } for the session this tab serves
      function lifetimeToSpec(lt, now) {
        if (lt === '1h') return { keep: 'persist', exp: now + 3600e3 };
        if (lt === '24h') return { keep: 'persist', exp: now + 86400e3 };
        if (lt === 'forever') return { keep: 'persist', exp: 0 };
        return { keep: 'close', exp: 0 }; // default: dies on close / on new link
      }
      function sessionInfo() {
        return store.getState(fileId + '::session').then((s) => {
          const now = Date.now();
          return { active: !!(s && s.keep === 'persist' && (!s.exp || now < s.exp)),
            exp: (s && s.exp) || 0, keep: (s && s.keep) || null, heal: !!(s && s.heal) };
        });
      }
      function retire(h) {
        if (!h) return;
        if (h.timer) clearTimeout(h.timer);
        try { if (h.stop) h.stop(); } catch (e) { /* already stopped */ }
        try { h.ws.close(); } catch (e) { /* already closing */ }
      }
      function endSession(reason) {
        const gone = liveHost; liveHost = null;
        if (!gone) return Promise.resolve();
        net.seal(gone.key, { t: 'ended', reason })
          .then((env) => gone.ws.send(JSON.stringify({ t: 'bcast', msg: env })))
          .catch(() => { /* socket gone */ });
        // Let the 'ended' frame flush before dropping the socket.
        setTimeout(() => retire(gone), 200);
        announceConn({ mode: 'local' });
        setStatus(reason === 'expired' ? 'Invite link expired — open Invite to make a new one.' : 'Sharing ended.');
        return store.setState(fileId + '::session', null);
      }

      function becomeHost(opts) {
        opts = opts || {};
        const relay = relayUrl();
        if (!relay) return Promise.reject(new Error('No relay configured (set window.GIFOS_RELAY).'));
        return store.getState(fileId + '::session').then((sess) => {
          const now = Date.now();
          const valid = sess && sess.lsec && sess.keep === 'persist' && (!sess.exp || now < sess.exp);
          // Resolve this session's identity — minting a fresh link when asked.
          // Every link carries a LINK SECRET (lsec): the relay-facing token and
          // the E2E key derive from it; the relay never sees it. DEFAULT is an
          // OWNED link: the host slot is additionally gated by a HOST secret
          // only this app holds (never shown, never in the link). Its sid is
          // "<room>.<verifier>" where room labels the app and verifier =
          // SHA-256(host secret). Only 'resilient' (a friend may keep it going)
          // opts OUT into an anyone-owns, self-healing link whose sid derives
          // from lsec too.
          const resolveMint = () => {
            if (opts.lifetime || !valid) {
              const spec = opts.lifetime ? lifetimeToSpec(opts.lifetime, now) : { keep: 'close', exp: 0 };
              const wantHeal = spec.keep === 'persist' && !!opts.resilient;
              const lsec = shortCode();
              if (wantHeal) return Promise.resolve({ sid: 'j' + lsec, lsec, epoch: 0, keep: spec.keep, exp: spec.exp, heal: true, av: null, sec: null }); // lane id, not crypto — the room key seals transport (one-runtime)
              const signed = !!(GifOS.sign && GifOS.sign.readSig && GifOS.sign.readSig(appBytes));
              const shortName = manifest.shortName || manifest.name || manifest.appId || 'app';
              const room = slug(signed ? shortName : shortName + '-anon');
              const sec = randHex(24);
              return sha256hex(sec).then((h) => {
                const av = h.slice(0, 24);
                return { sid: room + '.' + av, lsec, epoch: 0, keep: spec.keep, exp: spec.exp, heal: false, av: av, sec: sec };
              });
            }
            // Resume the stored link (owned or not) exactly as it was.
            return Promise.resolve({ sid: sess.sid, lsec: sess.lsec, epoch: sess.epoch || 0, keep: sess.keep, exp: sess.exp || 0, heal: !!sess.heal, av: sess.av || null, sec: sess.sec || null });
          };
          return resolveMint().then((m) => Promise.resolve().then(() => {
          // ONE RUNTIME (docs/one-runtime.md step 6): becomeHost is LANELESS —
          // no relay app-session exists anymore, ever. The room's mesh carries
          // the state (attachStageBus below); the relay star, its host slot,
          // epoch race, and deriveJoin are all deleted. The session record
          // still persists (sid names the lane; lsec keeps re-invites stable).
          const sid = m.sid, lsec = m.lsec, epoch = m.epoch, keep = m.keep, exp = m.exp, heal = m.heal, av = m.av, sec = m.sec;
          const joinUrl = buildJoinUrl('app', sid, lsec, relay);
          return Promise.resolve().then(() => {
            setStatus('Ready — waiting for the room mesh');

            // ---- MESH Stage DATA lane (attachStageBus) ----------------------
            // run.html calls this after becomeHost when the app is shared INTO
            // a meeting: app-state then rides the meeting's mesh (the sga lane),
            // and this host's OWN relay session (the "second session") is torn
            // down — app-state is no longer duplicated over the relay. The host
            // signs every snap/delta with an owner key; clients verify it.
            const vis = manifest.data || {};
            const leadTargets = leadTargetsOf(manifest);
            const meshLead = { on: false, keys: new Set(leadTargets.map((t) => t.collection + '::' + t.id)) };
            // Visibility filter: strip 'private' records so a guest snapshot
            // carries only what the app chose to share (parallels the relay
            // host's filterStateForGuest).
            const filterForGuests = (s) => {
              if (!s || !s.collections) return { collections: {} };
              const cols = {};
              for (const name of Object.keys(s.collections)) {
                const c = s.collections[name] || {}; const items = c.items || {}; const kept = {};
                for (const id of Object.keys(items)) if (visOf(vis, name, items[id]) !== 'private') kept[id] = items[id];
                cols[name] = { items: kept, seq: c.seq || 0 };
              }
              return { collections: cols };
            };
            let stageBus = null, stageSigner = null, stageUnsub = null, snapTimer = null;
            // Binary (My Media's photo/video Uint8Array) rides the state RAW:
            // the mesh transport (gifos-net seal/open) already round-trips a
            // typed array losslessly, and canonical() signs it to a stable
            // token — so no {$bin} pre-encode here. Pre-encoding would sign the
            // {$bin} form while the guest verifies the transport-revived typed
            // array — the bad-sig that blanked shared blobs.
            // The LEAD fence rides inside every signed body: the mesh act lane
            // is fire-and-forget (no per-op reply like the relay host's), so a
            // client must refuse a led write LOCALLY — and it may only trust a
            // fence that arrives owner-signed.
            const leadBody = () => ({ on: !!meshLead.on, keys: [...meshLead.keys] });
            // APP BYTES LEFT THE SNAP (2026-08-02, forced by an 8.3MB chess app).
            // The retained snap used to carry the whole app b64 — the owner
            // re-encoded and re-SIGNED ~11MB on every db-change debounce,
            // starving its own main thread (signaling included: a 2-person
            // room's DC took ~40s to form), and every fan re-shipped it. Now
            // the snap carries STATE only (cheap, sign-per-change is fine) and
            // the bytes travel as a separate owner-signed 'app' frame, encoded
            // and signed ONCE, broadcast at startup, then RETAINED on every
            // node it reaches and pulled peer-to-peer by latecomers.
            let appB64 = null, appSeeded = false, appSeedTimer = null;
            // SEED THE APP ONCE, UNPROMPTED — the owner is not a server.
            // This used to run ONLY in reply to a client's 'need-app', i.e.
            // every guest DIALLED THE HOST for the file. That is the star
            // pattern one-runtime deleted everywhere else, left behind here: it
            // makes the owner (typically a phone) an origin server for every
            // guest who ever arrives, so it cannot scale to a large room, and
            // it did not even work at two people — the request rides the stage
            // channel, sgaFan delivers only to peers whose DC is ALREADY open,
            // and a just-seated guest has none. Measured: a guest sent five
            // asks while the owner's ledger read asks=0.
            //
            // Now the bytes are broadcast ONCE and RETAINED on every node they
            // reach (run.html sgaApp), so a latecomer pulls them from whichever
            // PEER already holds them (sga-appreq / sga-app pull-through). The
            // owner seeds itself in the same call and is then just the first
            // seeder — one holder among many.
            const sendAppBytes = () => {
              if (!stageBus || !stageSigner) return Promise.resolve();
              if (!appBytes) return Promise.resolve();
              try {
                if (!appB64) appB64 = gif.b64encode(appBytes); // encode once — the heavy half
              } catch (e) { return Promise.resolve(); }
              // SIGN FRESH: frames carry a monotonic n and the verifier rejects
              // n <= lastN as replay. The signature is also what makes
              // PEER-SERVED bytes safe — a relaying peer passes this frame on
              // verbatim and can carry the app but never forge it.
              return stageSigner.sign(sid, 'app', { app: appB64, name: manifest.name || 'App' })
                .then((f) => { stageBus.send('app', f); appSeeded = true; })
                .catch(() => {});
            };
            // FIRE-AND-FORGET, never in the attach promise. b64encode is a
            // SYNCHRONOUS multi-megabyte call: when the seed sat inside
            // `sendSnap().then(sendAppBytes)` a throw there rejected
            // attachStageBus, the owner's whole setup aborted, and every guest
            // then saw nothing at all — no snap, no app. Retry on a slow drum
            // until it is actually out, so one bad moment cannot leave the room
            // without bytes.
            const seedApp = () => {
              if (appSeeded) return;
              Promise.resolve().then(() => sendAppBytes()).catch(() => {});
            };
            const sendSnap = () => {
              if (!stageBus || !stageSigner) return Promise.resolve();
              return db.getFullState().then((s) => {
                const body = { name: manifest.name || 'App', state: filterForGuests(s), lead: leadBody() };
                return stageSigner.sign(sid, 'snap', body).then((f) => stageBus.send('snap', f));
              }).catch(() => {});
            };
            const sendDelta = () => {
              if (!stageBus || !stageSigner) return Promise.resolve();
              // A lightweight full-state patch (no app bytes) for already-joined
              // clients; the retained snap (with app bytes) is refreshed on a
              // short debounce so late joiners stay current without paying the
              // app-byte cost on every keystroke.
              return db.getFullState().then((s) => {
                const body = { state: filterForGuests(s), lead: leadBody() };
                return stageSigner.sign(sid, 'delta', body).then((f) => stageBus.send('delta', f));
              }).catch(() => {});
            };
            // A client op-PROPOSAL: validate exactly as the relay host would
            // (leadership fence + collection visibility), then apply to the
            // authoritative store. The resulting owner-signed delta is what the
            // room adopts — a non-owner can propose but never author state.
            const onAct = (op) => {
              if (!op || (op.op !== 'put' && op.op !== 'delete')) return;
              // op.value already carries real Uint8Array bytes — the transport
              // revived them; no {$bin} decode needed.
              const targetId = op.op === 'put' ? (op.value && op.value.id) : op.key;
              if (meshLead.on && targetId != null && meshLead.keys.has(op.collection + '::' + targetId)) return;
              const storedP = (targetId != null) ? db.op('get', op.collection, targetId) : Promise.resolve(null);
              storedP.then((stored) => {
                const eff = stored ? visOf(vis, op.collection, stored) : collVis(vis, op.collection);
                if (eff !== 'read-write') return; // read-only / private: refuse
                if (op.op === 'put') {
                  let value = op.value;
                  if (value && typeof value === 'object') { value = safeRecord(value); delete value._vis; if (stored && VIS[stored._vis]) value._vis = stored._vis; }
                  return db.op('put', op.collection, null, value); // emit() re-broadcasts a signed frame
                }
                return db.op('delete', op.collection, op.key);
              }).catch(() => {});
            };
            const attachStageBus = (bus) => {
              if (!bus || typeof bus.send !== 'function' || typeof bus.subscribe !== 'function') return Promise.reject(new Error('bad stage bus'));
              // Kill the redundant relay app-session — app-state now rides the
              // mesh. The local authoritative store (db) and the running iframe
              // are untouched; only the relay transport goes.
              if (liveHost) { const gone = liveHost; liveHost = null; if (gone.timer) clearTimeout(gone.timer); try { gone.stop && gone.stop(); } catch (e) {} try { gone.ws.close(); } catch (e) {} }
              return appOwnerLib().then((AO) => AO.createSigner()).then((signer) => {
                stageSigner = signer; stageBus = bus;
                stageUnsub = bus.subscribe((m) => {
                  if (!m) return;
                  if (m.kind === 'act') onAct(m.d);
                });
                // Refresh the retained snapshot (with app bytes) on a debounce,
                // and push a live delta immediately, on every change.
                stageOnChange = () => {
                  sendDelta();
                  if (!snapTimer) snapTimer = setTimeout(() => { snapTimer = null; sendSnap(); }, 1200);
                };
                announceConn({ mode: 'host', counts: { up: 0, soft: 0, warn: 0 }, total: 0, p2p: 0, self: 'up' });
                setStatus('Live on the meeting mesh — app-state is owner-signed');
                seedApp();                       // fire-and-forget; retried by the drum below
                if (!appSeedTimer) appSeedTimer = setInterval(() => {
                  if (appSeeded) { clearInterval(appSeedTimer); appSeedTimer = null; return; }
                  seedApp();
                }, 3000);
                return sendSnap().then(() => ({ pk: signer.pkHex }));
              });
            };
            const setLead = (on) => { meshLead.on = !!on; try { hostApi.setLead(on); } catch (e) {} if (stageBus) sendDelta(); return Promise.resolve(); };

            return store.setState(fileId + '::session', { sid, lsec, relay, epoch, keep, exp, heal, av, sec }).then(() => ({
              shareUrl: joinUrl, keep, exp, heal, owned: !!av,
              // Leadership controls for the page chrome: how many records this
              // app declares as leadable, and the live communal⇄leading switch
              // (which flips their visibility read-write⇄read-only host-side).
              leadCount: leadTargets.length,
              setLead: setLead,
              // Present iff the runtime can drive the mesh Stage DATA lane;
              // run.html feature-detects this to pick the mesh bus over the
              // relay app-session (and to advertise mesh:true in the app ad).
              attachStageBus: attachStageBus,
            }));
          });
          })); // resolveMint().then(…) — laneless
        });
      }

      return db.load().then((state) => {
        // First run of a snapshot GIF: hydrate the icon's DB from embedded state.
        if (isEmptyState(state) && files['.state/db.json']) {
          try {
            const embedded = store.unpackJSON(gif.bytesToText(files['.state/db.json']));
            if (embedded && embedded.collections) return db.import(embedded);
          } catch (e) { /* corrupt embedded state — start fresh */ }
        }
      }).then(() => netPolicy.load()).then(() => Promise.resolve(db.getFullState())).then((connectState) => {
        // Snapshot the state AT LOAD once, so the corner app-GIF and a
        // "data at connect time" steal share the same (memoized) bytes.
        const stealCtx = { connectState: connectState, cache: { bytes: null } };
        mountApp(iframe, files, manifest, db, appBytes, netPolicy);
        if (root.__gifosOnApp) root.__gifosOnApp(appBytes, manifest);
        announceConn({ mode: 'local' });
        setStatus('Running · state saved to this icon');
        return { save: () => downloadSnapshot(appBytes, files, manifest, db), steal: (opts) => stealApp(appBytes, files, manifest, db, stealCtx, opts), becomeHost, sessionInfo, endSession };
      });
    }
  }

  // (bootClient DELETED — one-runtime step 6: clients mount from the room's
  // owner-signed lane via bootClientBus; the relay star and AUTO_TAKEOVER are gone.)

  // (pullMirrorState / breakMirror / bootMirror DELETED — one-runtime step 6:
  // mirrors were the star's resume story; a ROOM is the resume story now — the
  // link rejoins the room, and Save/Steal snapshots cover offline copies.)

  // ---- client boot over the mesh Stage DATA lane (no relay session) ---------
  // The mesh-native counterpart to bootClient: instead of joining a second
  // relay session, the client renders the shared app from the meeting's own
  // sga lane. It VERIFIES every frame's owner signature (site/js/app-owner.js),
  // rejecting anything unsigned / impostor-signed / tampered, and sends the
  // user's writes back as `act` PROPOSALS the owner validates and re-signs.
  // run.html calls this (mountClientApp) when the shared app advertises mesh
  // and this runtime exposes bootClientBus.
  //   params = { s: <sid namespace>, send(kind,d), subscribe(cb)->unsub }
  function bootClientBus(mountEl, params, statusEl, hooks) {
    hooks = hooks || {};
    const sid = params && params.s;
    const send = params && params.send;
    const subscribe = params && params.subscribe;
    if (!sid || typeof send !== 'function' || typeof subscribe !== 'function') return Promise.reject(new Error('bad stage bus params'));
    const setStatus = (m) => { if (statusEl) statusEl.textContent = m; };
    let iframe = null, filesRef = null, manifestRef = null, appBytes = null, mounted = false;
    let mirror = { collections: {} };
    let dataVis = {};
    const localCols = new Map(); // private collections stay per-tab (never proposed)
    const localOf = (c) => { let m = localCols.get(c); if (!m) { m = new Map(); localCols.set(c, m); } return m; };
    const isPrivate = (c) => collVis(dataVis, c) === 'private';
    const notify = (collection) => { if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage({ ns: 'gifos', type: 'db-change', collection: collection || '*' }, '*'); };
    const itemsOf = (c) => (c && mirror.collections[c] && mirror.collections[c].items) || {};

    return appOwnerLib().then((AO) => {
      const ver = AO.makeVerifier(sid, (params && params.pk) || null);
      // Binary rides raw: the transport revives typed arrays losslessly, so the
      // verified body already holds real Uint8Array bytes — assign it straight
      // into the mirror (a JSON re-clone would mangle the blob into a
      // numeric-key object and break My Media's shared video).
      // The owner-signed LEAD fence (see leadBody in the host): while on, a
      // write to a fenced (collection,id) is refused HERE — the mesh act lane
      // has no per-op host reply, so the honest refusal must be local. The
      // host's own onAct fence stays authoritative against dishonest clients.
      let leadState = { on: false, keys: new Set() };
      let frozen = false; // owner away (one-runtime): shared writes refuse honestly
      // ACT RETRY-UNTIL-ECHO (2026-08-02, found by a dropped chess move): the
      // act lane is fire-and-forget over DCs, and a DC hiccup silently ate a
      // guest's move. A pending act re-sends every 3s until the owner's
      // canonical echo reflects it (or ~4 tries — then the next snap honestly
      // reverts the optimistic apply). Puts/deletes are idempotent, so a
      // false-negative echo check only costs a harmless duplicate.
      const pendingActs = new Map(); // col\x00id -> { d, at, tries }
      const actKey = (c, id) => c + '\x00' + id;
      const echoSatisfied = (p) => {
        const items = (mirror.collections[p.d.collection] || {}).items || {};
        if (p.d.op === 'delete') return !(p.d.key in items);
        const got = items[p.d.value && p.d.value.id];
        try { return JSON.stringify(got) === JSON.stringify(p.d.value); } catch (e) { return !!got; }
      };
      const reconcilePending = () => { for (const [k, p] of pendingActs) if (echoSatisfied(p)) pendingActs.delete(k); };
      const actSweep = setInterval(() => {
        if (frozen) return;
        const now = Date.now();
        for (const [k, p] of pendingActs) {
          if (echoSatisfied(p)) { pendingActs.delete(k); continue; }
          if (now - p.at < 3000) continue;
          if (++p.tries > 4) { pendingActs.delete(k); continue; }
          p.at = now;
          try { send('act', p.d); } catch (e) {}
        }
      }, 1500);
      const takeLead = (b) => { if (b && b.lead) leadState = { on: !!b.lead.on, keys: new Set(Array.isArray(b.lead.keys) ? b.lead.keys.map(String) : []) }; };
      const fenced = (collection, id) => leadState.on && id != null && leadState.keys.has(collection + '::' + id);

      // Reads: from the owner-verified mirror. Writes: an optimistic local apply
      // (so the app sees its own change at once) PLUS an `act` proposal to the
      // owner, whose next owner-signed frame is the canonical truth.
      const db = {
        owner: false,
        getFullState() { return Promise.resolve(mirror); },
        op(op, collection, key, value) {
          if (op === 'dump') return Promise.resolve(mirror);
          const priv = collection && isPrivate(collection);
          // The owner-verified mirror only ever holds records the host SHARED
          // (it stripped private ones), so it is always safe to read — even for
          // a collection whose DEFAULT is private but into which the host opted
          // a few records (read-only), which is exactly how My Media shares one
          // video. Read the mirror first; for a private-default collection also
          // merge this tab's own local writes (mirrors the relay guest).
          if (op === 'get') {
            if (priv) { const loc = localOf(collection); if (loc.has(key)) return Promise.resolve(loc.get(key)); }
            return Promise.resolve(itemsOf(collection)[key] || null);
          }
          if (op === 'getAll') {
            const shared = Object.values(itemsOf(collection));
            if (!priv) return Promise.resolve(shared);
            const seen = new Set(shared.map((r) => r && r.id));
            const out = shared.slice();
            for (const rec of localOf(collection).values()) if (!seen.has(rec.id)) out.push(rec);
            return Promise.resolve(out);
          }
          if (op === 'put') {
            const rec = safeRecord(value); if (rec.id == null) rec.id = AO.newRecordId(collection); delete rec._vis;
            if (priv) { localOf(collection).set(rec.id, rec); notify(collection); return Promise.resolve(rec); }
            // Honest local refusal, mirroring what the host would do to the act
            // anyway (read-only visibility / the signed lead fence) — otherwise
            // the optimistic apply would show a write the room never adopts.
            if (frozen) return Promise.reject(new Error('the app is paused — its owner is away'));
            const stored = itemsOf(collection)[rec.id];
            const eff = stored ? visOf(dataVis, collection, stored) : collVis(dataVis, collection);
            if (eff !== 'read-write') return Promise.reject(new Error('read-only for guests'));
            if (fenced(collection, rec.id)) return Promise.reject(new Error('the leader is driving this record'));
            const c = mirror.collections[collection] || (mirror.collections[collection] = { items: {}, seq: 0 });
            c.items[rec.id] = rec; notify(collection);
            const d = { op: 'put', collection: collection, value: rec };
            pendingActs.set(actKey(collection, rec.id), { d: d, at: Date.now(), tries: 0 });
            try { send('act', d); } catch (e) {}
            return Promise.resolve({ id: rec.id });
          }
          if (op === 'delete') {
            if (priv) { localOf(collection).delete(key); notify(collection); return Promise.resolve(true); }
            if (frozen) return Promise.reject(new Error('the app is paused — its owner is away'));
            const stored0 = itemsOf(collection)[key];
            const eff0 = stored0 ? visOf(dataVis, collection, stored0) : collVis(dataVis, collection);
            if (eff0 !== 'read-write') return Promise.reject(new Error('read-only for guests'));
            if (fenced(collection, key)) return Promise.reject(new Error('the leader is driving this record'));
            const c = mirror.collections[collection]; if (c && c.items) delete c.items[key]; notify(collection);
            const dd = { op: 'delete', collection: collection, key: key };
            pendingActs.set(actKey(collection, key), { d: dd, at: Date.now(), tries: 0 });
            try { send('act', dd); } catch (e) {}
            return Promise.resolve(true);
          }
          if (op === 'setVisibility') return Promise.reject(new Error('the app owner controls visibility'));
          return Promise.resolve(null);
        },
      };

      const mount = () => {
        if (mounted) return; mounted = true;
        trace('mounted');
        iframe = makeIframe(); mountEl.innerHTML = ''; mountEl.appendChild(iframe);
        mountApp(iframe, filesRef, manifestRef, db, appBytes, makeNetPolicy(null, manifestRef));
        if (root.__gifosOnApp) root.__gifosOnApp(appBytes, manifestRef);
        notify('*');
      };

      // The app BYTES arrive as their own owner-signed 'app' frame, once, on
      // request — never inside the retained snap (an 8.3MB chess app re-signed
      // per keystroke starved the owner's signaling; see attachStageBus). Ask
      // on a slow drum until mounted: the first ask may fire before any DC is
      // wired and vanish; a later one lands.
      // NO DIRECT DIAL TO THE HOST — the last star-shaped edge, now gone.
      // There used to be an askApp() drum here sending 'need-app' to the owner
      // until the bytes came back. It could never help the guests that needed
      // it: the request rides the same stage channel as everything else, so a
      // guest with no open DataChannel had its asks dropped silently (measured:
      // five asks sent, owner ledger asks=0), while a guest WITH a channel
      // would be served by the mesh anyway.
      //
      // The app bytes are retained on every node that holds them and pulled
      // peer-to-peer (run.html: sga-appreq / sga-app, mirroring the retained
      // snap's pull-through, re-driven the instant a channel opens). Mounting
      // therefore needs nothing from the owner specifically — this subscriber
      // just waits for the frame to arrive from ANY peer, which is the only
      // shape that scales past a handful of guests.
      // JOIN TIMELINE. The end-to-end "guest sees the app" number cannot say
      // WHICH leg was slow, and the legs are different bugs: no snap means mesh
      // /DC establishment, a snap with no app frame means the bytes path.
      const joinT0 = Date.now();
      const joinTrace = [];
      const trace = (ev, extra) => {
        try {
          joinTrace.push(Object.assign({ ms: Date.now() - joinT0, ev }, extra || {}));
          root.__appJoinTrace = joinTrace;
        } catch (e) {}
      };
      const mountFromB64 = (b64, name) => {
        if (mounted || !b64) return Promise.resolve();
        trace('app-frame', { kb: Math.round((b64.length || 0) / 1024) });
        appBytes = gif.b64decode(b64);
        return gif.decode(appBytes).then((archive) => {
          if (!archive) { setStatus('Bad app from the mesh host.'); try { console.error('[bootClientBus] app frame DECODE failed (bytes ' + (appBytes ? appBytes.length : 0) + ')'); } catch (e2) {} appBytes = null; return; }
          filesRef = archive.files; manifestRef = gif.readManifest(archive) || { name: name || 'App' };
          dataVis = manifestRef.data || {};
          if (typeof document !== 'undefined') document.title = (manifestRef.name || 'App') + ' — GifOS (mesh)';
          mount();
        });
      };
      const onSnap = (body) => {
        trace('snap');
        if (body && body.state && body.state.collections) { mirror = body.state; reconcilePending(); }
        if (!mounted && body && body.app) return mountFromB64(body.app, body.name); // legacy in-snap bytes
        notify('*');
      };

      const unsub = subscribe((m) => {
        if (!m || m.kind === 'act') return; // client->owner direction
        Promise.resolve(ver.verify(m.d)).then((r) => {
          if (!r.ok) { try { console.error('[bootClientBus] frame REJECTED kind=' + (m.kind || '?') + ' reason=' + (r && r.reason || '?')); } catch (e2) {} return; } // unsigned / impostor / tampered — NEVER canonical
          takeLead(r.body); // the signed lead fence rides every canonical frame
          if (r.kind === 'app') return mountFromB64(r.body && r.body.app, r.body && r.body.name);
          if (r.kind === 'snap') return onSnap(r.body);
          if (r.kind === 'delta') {
            if (r.body && r.body.state && r.body.state.collections) { mirror = r.body.state; notify('*'); }
            else if (r.body && r.body.collection && r.body.items) { AO.applyDelta(mirror, r.body); notify(r.body.collection); }
            reconcilePending();
          }
        }).catch(() => {});
      });

      setStatus('Connected to the shared app · owner-signed over the mesh');
      return {
        stop: () => { try { unsub && unsub(); } catch (e) {} clearInterval(actSweep); pendingActs.clear(); },
        // ONE RUNTIME (docs/one-runtime.md): the client's mirror is the room's
        // survival story. snapshot() packs app bytes + the owner-verified
        // mirror into a snapshot GIF — the successor adopts it (resilient
        // rooms) or anyone saves a copy. setFrozen(true) makes shared-
        // collection writes refuse honestly while the owner is away (an
        // optimistic apply the room can never adopt is a lie, not a write).
        snapshot: () => (appBytes && filesRef && manifestRef)
          ? packSnapshot(appBytes, filesRef, manifestRef, mirror)
          : Promise.reject(new Error('app not loaded yet')),
        // Steal from a client mount: app + the owner-verified mirror, filed
        // into this desktop's Stolen Apps — same folder, same ritual.
        stealToDesktop: () => (appBytes && manifestRef)
          ? ensureStolenFolder().then((folder) => saveAppToDesktop(appBytes, manifestRef, mirror, folder))
          : Promise.reject(new Error('app not loaded yet')),
        setFrozen: (f) => { frozen = !!f; },
        // The mounted app's GIF bytes (null until they land). The app bar
        // renders these as the thumbnail — seeing it IS seeing that a Steal
        // would succeed, since it copies exactly these bytes.
        gifBytes: () => appBytes,
      };
    });
  }

  GifOS.runtime = { boot, bootClientBus, buildAppHtml, buildFolderHtml, norm, slug };
})(typeof window !== 'undefined' ? window : globalThis);
