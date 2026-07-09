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
  // One short code is both the session id and the join key — the link IS the
  // capability either way, so splitting them bought nothing but length. The
  // alphabet drops lookalikes (0/O, 1/l/i) so codes survive being read aloud.
  const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
  function shortCode(len) {
    const n = len || 10; // 31^10 ≈ 2^49 — plenty for ephemeral, unlisted rooms
    const buf = new Uint8Array(n);
    (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(buf) : buf.forEach((_, i) => (buf[i] = i * 7));
    let s = '';
    for (let i = 0; i < n; i++) s += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
    return s;
  }
  // gifos.app/join/<code> on production (404.html routes it into run.html);
  // hash form everywhere else (local dev, custom relays, legacy split ids).
  function buildJoinUrl(page, sid, token, relay) {
    const meet = page === 'video' || page === 'meet'; // 'video' kept as a legacy alias
    const pretty = sid === token && /(^|\.)gifos\.app$/.test(location.hostname) && relay === root.GIFOS_RELAY;
    if (pretty) return location.origin + (meet ? '/meet/' : '/join/') + sid;
    const base = location.origin + (meet ? '/meet.html' : '/run.html');
    const pair = meet ? 'v=' + sid + '&k=' + token : (sid === token ? 'j=' + sid : 's=' + sid + '&k=' + token);
    return base + '#' + pair + '&relay=' + encodeURIComponent(relay);
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
          subscribe: function(cb){ (subs[collection]=subs[collection]||[]).push(cb);
            rpc({type:'db',op:'getAll',collection:collection}).then(cb); }
        }; },
        fetch: function(url, opts){ opts=opts||{};
          return rpc({type:'fetch',url:url,method:opts.method||'GET',headers:opts.headers||{},body:opts.body||null})
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
  //    turn the trusted first-party into a proxy for the relay/mcp/site itself.
  //  - no credentials are ever attached, and the response body is size-capped.
  const FETCH_MAX_BYTES = 8 * 1024 * 1024; // 8 MB response ceiling
  function firstPartyHost(host) {
    // gifos.app and *.gifos.app (relay/mcp/mirrors) are always off-limits.
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
    return fetch(d.url, { method: d.method, headers: d.headers, body: d.body || undefined, credentials: 'omit', redirect: 'follow' })
      .then((resp) => {
        // A redirect can walk an allowed (or '*') host to a first-party or
        // otherwise-forbidden one, and follow makes the FINAL response readable.
        // Re-check the URL we actually landed on and refuse to hand back its body.
        let fu; try { fu = new URL(resp.url); } catch (e) { fu = null; }
        const finalHost = fu ? fu.hostname : u.hostname;
        if (firstPartyHost(finalHost) || !policy.allow(finalHost)) {
          throw new Error('Network denied: redirected to a disallowed host (' + finalHost + ')');
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
    out['.state/db.json'] = gif.textToBytes(JSON.stringify(state));
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
  function saveAppToDesktop(appBytes, manifest, state, parent) {
    const fileId = store.uid('file');
    const name = (manifest.name || manifest.appId || 'App') + '.gif';
    return store.putFile({ id: fileId, name, bytes: appBytes, kind: 'gif', isApp: true,
      appId: manifest.appId, accent: manifest.accent, mime: 'image/gif' })
      .then(() => store.putItem({ id: store.uid('item'), kind: 'file', fileId, name,
        parent: parent || null, x: 24, y: 24, iconSize: 64 }))
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
        return Promise.resolve(null);
      },
    };
  }

  // Remote: forwards every op to the host browser over the relay. Requests are
  // remembered until answered so they can be REPLAYED after a host blip —
  // at-least-once on reconnect beats an app hung on a promise forever.
  function makeRemoteDb(send) {
    let seq = 1; const pending = new Map();
    let hostDown = false;
    const db = {
      op(op, collection, key, value) {
        if (hostDown) return Promise.reject(new Error('host offline'));
        return new Promise((res, rej) => {
          const id = 'q' + (seq++);
          const req = { t: 'rpc', id, op, collection, key, value };
          pending.set(id, { res, rej, req });
          send(req);
        });
      },
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
  function captureOverlay(label, kind, onStop) {
    const doc = root.document;
    const bg = doc.createElement('div');
    bg.setAttribute('data-gifos-capture', '1');
    bg.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62);font:15px system-ui;color:#fff';
    const box = doc.createElement('div');
    box.style.cssText = 'background:#141018;border:1px solid #ff5c5c;border-radius:14px;padding:20px 22px;max-width:320px;text-align:center';
    box.innerHTML = '<div style="width:14px;height:14px;border-radius:50%;background:#ff5c5c;margin:2px auto 12px"></div>'
      + '<div style="font-weight:800;margin:8px 0 4px">GifOS is capturing ' + (kind === 'photo' ? 'a photo' : kind) + '</div>'
      + '<div style="color:#c8c8dc;font-size:13px;margin-bottom:12px">for <b>' + capEsc(label) + '</b> — it receives only this clip, never your live ' + (kind === 'audio' ? 'mic' : 'camera') + '.</div>'
      + '<div id="gc-t" style="font-variant-numeric:tabular-nums;font-weight:700;margin-bottom:12px">0:00</div>'
      + '<button id="gc-stop" style="padding:9px 20px;border:0;border-radius:9px;background:#ff5c5c;color:#fff;font:inherit;font-weight:700;cursor:pointer">' + (kind === 'photo' ? 'Cancel' : 'Stop &amp; use') + '</button>';
    bg.appendChild(box); doc.body.appendChild(bg);
    const t0 = Date.now(), tEl = box.querySelector('#gc-t');
    const iv = kind === 'photo' ? null : setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      tEl.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }, 250);
    box.querySelector('#gc-stop').onclick = onStop;
    return { close: () => { if (iv) clearInterval(iv); try { bg.remove(); } catch (e) {} } };
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
    const nav = root.navigator;
    if (!(nav && nav.mediaDevices && nav.mediaDevices.getUserMedia)) return Promise.reject(new Error('No ' + cap + ' available here.'));
    const wantVideo = kind !== 'audio';
    const wantAudio = kind === 'audio' || (kind === 'video' && d.audio !== false);
    const maxMs = Math.min(Math.max(1, d.maxSeconds || 15), 120) * 1000;
    const label = manifest.name || manifest.appId || 'an app';
    return nav.mediaDevices.getUserMedia({ audio: wantAudio, video: wantVideo ? { facingMode: d.facing || 'user' } : false })
      .then((stream) => new Promise((resolve, reject) => {
        let done = false, ov = null, autoT = null, rec = null, vidEl = null;
        const cleanup = () => {
          if (autoT) clearTimeout(autoT);
          try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
          if (ov) ov.close();
          if (vidEl) { try { vidEl.remove(); } catch (e) {} }
        };
        if (kind === 'photo') {
          vidEl = root.document.createElement('video');
          vidEl.autoplay = true; vidEl.playsInline = true; vidEl.muted = true;
          vidEl.style.cssText = 'position:fixed;left:-9999px;width:2px;height:2px';
          vidEl.srcObject = stream; root.document.body.appendChild(vidEl);
          const snap = () => {
            if (done) return; done = true;
            const w = vidEl.videoWidth || 640, h = vidEl.videoHeight || 480;
            const c = root.document.createElement('canvas'); c.width = w; c.height = h;
            try { c.getContext('2d').drawImage(vidEl, 0, 0, w, h); } catch (e) {}
            c.toBlob((blob) => {
              cleanup();
              if (!blob) return reject(new Error('Could not capture a frame.'));
              blob.arrayBuffer().then((buf) => resolve({ bytes: buf, mime: 'image/jpeg', width: w, height: h }));
            }, 'image/jpeg', 0.9);
          };
          ov = captureOverlay(label, 'photo', () => { if (!done) { done = true; cleanup(); reject(new Error('Capture cancelled.')); } });
          vidEl.onloadeddata = () => setTimeout(snap, 250);
          autoT = setTimeout(snap, 4000);
          return;
        }
        const mime = pickCaptureMime(kind);
        try { rec = new root.MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
        catch (e) { try { rec = new root.MediaRecorder(stream); } catch (e2) { cleanup(); return reject(new Error('Recording is not supported here.')); } }
        const chunks = [], startMs = Date.now();
        rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
        rec.onstop = () => {
          const durationMs = Date.now() - startMs;
          cleanup();
          const blob = new Blob(chunks, { type: (rec && rec.mimeType) || mime || (kind === 'video' ? 'video/webm' : 'audio/webm') });
          blob.arrayBuffer().then((buf) => resolve({ bytes: buf, mime: blob.type, durationMs }));
        };
        const stop = () => { if (done) return; done = true; try { rec.stop(); } catch (e) { cleanup(); reject(new Error('Recording failed.')); } };
        ov = captureOverlay(label, kind, stop);
        autoT = setTimeout(stop, maxMs);
        try { rec.start(); } catch (e) { cleanup(); reject(new Error('Recording failed to start.')); }
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
    smartest: 'Smartest text', cheapest: 'Cheapest text', tts: 'Text → speech',
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
      const reply = (p) => iframe.contentWindow.postMessage(Object.assign({ ns: 'gifos', type: 'reply', id: d.id }, p), '*');
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
      else if (d.type === 'info') reply({ ok: true, result: { appId: manifest.appId, name: manifest.name, version: manifest.version } });
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
    if (hasCap(manifest, 'motion')) { try { iframe.setAttribute('allow', 'gyroscope; accelerometer; magnetometer'); } catch (e) {} }
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

  // A WebSocket that heals itself: exponential-backoff reconnect (instant on
  // tab-visible/online — the "glanced at another app" case), an outbound queue
  // while down, and a stable facade so callers wire handlers exactly once.
  function steadySocket(makeUrl) {
    const s = { onmessage: null, onstate: null, onopen: null, state: 'connecting', downSince: Date.now() };
    let ws = null, closed = false, attempt = 0, timer = null;
    const queue = [];
    const setState = (st) => {
      if (s.state === st) return;
      s.state = st;
      if (st === 'up') s.downSince = null;
      else if (!s.downSince) s.downSince = Date.now();
      if (s.onstate) s.onstate(st);
    };
    function connect() {
      if (closed) return;
      let sock;
      try { sock = new WebSocket(makeUrl()); } catch (e) { schedule(); return; }
      ws = sock;
      sock.onopen = () => {
        if (closed || ws !== sock) return;
        attempt = 0;
        setState('up');
        for (const frame of queue.splice(0)) { try { sock.send(frame); } catch (e) { /* re-dropped */ } }
        if (s.onopen) s.onopen();
      };
      sock.onmessage = (ev) => { if (ws === sock && s.onmessage) s.onmessage(ev); };
      sock.onclose = () => { if (ws === sock) { ws = null; setState('down'); schedule(); } };
      sock.onerror = () => { try { sock.close(); } catch (e) { /* already dead */ } };
    }
    function schedule() {
      if (closed || timer) return;
      const delay = Math.min(5000, 500 * Math.pow(2, attempt++)) * (0.7 + Math.random() * 0.6);
      timer = setTimeout(() => { timer = null; connect(); }, delay);
    }
    const kick = () => {
      if (closed || (ws && ws.readyState <= 1)) return;
      if (timer) { clearTimeout(timer); timer = null; }
      attempt = 0;
      connect();
    };
    if (root.addEventListener) { root.addEventListener('online', kick); root.addEventListener('pageshow', kick); }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
      document.addEventListener('resume', kick); // Page Lifecycle: tab just unfroze
    }
    s.send = (data) => {
      if (ws && ws.readyState === 1) { try { ws.send(data); return; } catch (e) { /* fell through to queue */ } }
      queue.push(data);
      if (queue.length > 500) queue.shift();
      kick();
    };
    s.close = () => { closed = true; if (timer) { clearTimeout(timer); timer = null; } try { if (ws) ws.close(); } catch (e) { /* fine */ } };
    s._raw = () => ws; // test hook: lets the e2e suite yank the live socket
    connect();
    (root.__gifosConns = root.__gifosConns || []).push(s);
    return s;
  }

  // ---- WebRTC ---------------------------------------------------------------
  // The relay is the signaling channel (introductions: SDP offers/answers and
  // ICE candidates). Once a DataChannel opens, session traffic flows directly
  // browser-to-browser; the relay socket stays as automatic fallback for peers
  // whose networks block hole punching. No TURN server: the relay IS plan B.
  const ICE_SERVERS = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ];
  const hasP2P = () => typeof root.RTCPeerConnection === 'function';

  // Browsers FREEZE hidden tabs after a few minutes (Chrome's Page Lifecycle),
  // suspending ALL JS — fatal for a live session: the host tab carries the
  // authoritative DB, so a frozen host hangs every client until refocused.
  // Holding a Web Lock is the documented opt-out from freezing (and costs
  // nothing), so any page with a live multiplayer session — host or client —
  // holds one for its lifetime; it releases automatically when the tab closes.
  // A phone that suspends the whole browser is beyond any page's control:
  // that path stays covered by reconnect, host-back re-sync, and Take Over.
  let sessionLockHeld = false;
  function holdSessionLock() {
    if (sessionLockHeld) return;
    sessionLockHeld = true;
    try {
      if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request)
        navigator.locks.request('gifos-live-session', () => new Promise(() => {}));
    } catch (e) { /* unsupported — the reconnect machinery still covers recovery */ }
  }

  // ---- transport fragmentation ---------------------------------------------
  // Every transport has a per-MESSAGE ceiling (browsers cap a DataChannel
  // message around 256KB; the relay hard-drops anything over its burst), so
  // any session message bigger than FRAG_PART is split into {t:'frag'}
  // envelopes and reassembled on the other side. This lifts the per-record
  // ceiling for apps — a big gifos.db record just works — without touching
  // the relay's BANDWIDTH budget, which still applies to total bytes: bulk
  // data flows freely on the P2P path and stays throttled on the relay, by
  // design. Fragments carry their index, so mixed arrival order across a
  // healing transport is fine; incomplete messages are swept after 30s.
  const FRAG_PART = 100 * 1024; // chars per piece — envelope stays well under DC limits
  const FRAG_MAX_PARTS = 256;   // ~25MB reassembled max — lets a heavy app (e.g. a bundled
                                // WASM engine) ride the P2P DataChannel; still refuses absurd claims
  let fragSeq = 0;
  // emit(pieceObj, pieceStr) is called once for small messages (the original)
  // or once per fragment — the caller picks which form its transport wants.
  const sendChunked = (msg, emit) => {
    const str = JSON.stringify(msg);
    if (str.length <= FRAG_PART) return emit(msg, str);
    const fid = 'f' + (++fragSeq) + '.' + Math.floor(Math.random() * 1e9).toString(36);
    const n = Math.ceil(str.length / FRAG_PART);
    if (root.__fragDebug) console.error('[frag out] ' + fid + ' n=' + n + ' len=' + str.length);
    for (let i = 0; i < n; i++) {
      const piece = { t: 'frag', fid, i, n, p: str.slice(i * FRAG_PART, (i + 1) * FRAG_PART) };
      emit(piece, JSON.stringify(piece));
    }
  };
  // Stateful filter: feed every parsed inbound message with its sender key;
  // frag pieces buffer and return null until the last one completes the
  // original message. Non-frag messages pass straight through.
  const makeDefrag = (onProgress) => {
    const bufs = new Map(); // sender|fid -> { parts, got, n, at }
    return (m, sender) => {
      if (!m || m.t !== 'frag') return m;
      const n = m.n | 0, i = m.i | 0;
      if (typeof m.p !== 'string' || typeof m.fid !== 'string' || n < 2 || n > FRAG_MAX_PARTS || i < 0 || i >= n) return null;
      const key = sender + '|' + m.fid;
      let b = bufs.get(key);
      if (!b) {
        for (const [k, v] of bufs) if (Date.now() - v.at > 30000) bufs.delete(k); // sweep stale partials
        if (bufs.size >= 8) return null; // bounded memory even from a hostile sender
        b = { parts: new Array(n), got: 0, n, at: Date.now() };
        bufs.set(key, b);
      }
      if (b.n !== n || b.parts[i] !== undefined) { bufs.delete(key); return null; } // inconsistent sender
      b.parts[i] = m.p; b.got++;
      if (onProgress) { try { onProgress(m.fid, b.got, b.n); } catch (e) {} }
      if (root.__fragDebug) console.error('[defrag] ' + key + ' ' + b.got + '/' + b.n);
      if (b.got < b.n) return null;
      bufs.delete(key);
      try { return JSON.parse(b.parts.join('')); } catch (e) { if (root.__fragDebug) console.error('[defrag] PARSE FAIL ' + key); return null; }
    };
  };

  // ---- host-side wiring (shared by original host and failover host) --------
  // Returns { sendToAll, stats } so the caller can push db-change events over
  // whichever transport each peer ended up on (channel if open, else relay).
  // opts.selfPeer: during a client takeover our old client seat may linger for
  // a moment — ignore its peer-join echo. opts.onDisplaced: a higher-epoch host
  // claimed the session (we were away and it healed without us); stop serving.
  function attachHost(ws, db, appBytes, onStats, opts) {
    opts = opts || {};
    holdSessionLock(); // friends now depend on THIS tab staying runnable
    // peer -> { pc, channel, away } — `away` is a timestamp while the peer's
    // relay socket is down. Phones drop sockets constantly; an away peer keeps
    // its seat (and its pending state) until PEER_DROP, and a rejoin under the
    // same peer id slots straight back in with a fresh P2P offer.
    const peers = new Map();
    const defrag = makeDefrag();

    const relayTo = (peer, msg) => sendChunked(msg, (piece) => ws.send(JSON.stringify({ t: 'to', to: peer, msg: piece })));
    const sendTo = (peer, msg) => {
      const p = peers.get(peer);
      if (p && p.channel && p.channel.readyState === 'open') sendChunked(msg, (piece, str) => p.channel.send(str));
      else relayTo(peer, msg);
    };
    const sendToAll = (msg) => { for (const peer of peers.keys()) sendTo(peer, msg); };

    // App delivery. A SMALL app goes over the relay the instant a peer joins —
    // fastest first paint, and it fits inside the relay's one-time burst. A
    // HEAVY app (e.g. one bundling a WASM engine) is far past the relay's
    // per-message cap, so it rides the P2P DataChannel instead: sent once the
    // channel opens, and paced to the channel's send buffer so we never
    // overflow it. The relay is only ever the signalling + fallback path; once
    // peers are connected directly there is no bandwidth ceiling. Fragment
    // strings are built once and replayed to each new peer.
    const appMsg = { t: 'app', gif: gif.b64encode(appBytes), heal: !!opts.heal, exp: opts.exp || 0 };
    const APP_RELAY_MAX = 700 * 1024; // bytes; base64 of this stays under the relay's 1MB burst
    const APP_P2P_WAIT = 10000;       // give the DataChannel this long before the paced-relay fallback
    const appSmall = appBytes.length <= APP_RELAY_MAX;
    // Fragment the heavy app ONCE; keep both the object (to relay-wrap) and the
    // string (to DataChannel-send).
    const appFrags = appSmall ? null : (function () { const a = []; sendChunked(appMsg, (o, s) => a.push({ o: o, s: s })); return a; })();
    const pumpApp = (ch) => { // over the direct channel: fast, paced only to the send buffer
      let i = 0; const HIGH = 4 * 1024 * 1024;
      (function pump() {
        try { while (i < appFrags.length && ch.readyState === 'open' && ch.bufferedAmount < HIGH) ch.send(appFrags[i++].s); } catch (e) { return; }
        if (i < appFrags.length && ch.readyState === 'open') setTimeout(pump, 50);
      })();
    };
    // Last resort for a peer that never gets a direct channel (symmetric NAT, no
    // TURN): drip the app over the RELAY, paced under its ~48KB/s refill so
    // nothing is dropped. Slow (minutes for a big app) but it arrives.
    const relayPaced = (peer) => {
      let i = 0; const BURST = 8; // ~800KB up front fits the relay's one-time burst
      (function drip() {
        const q = peers.get(peer); if (!q || !q.appSending) return; // peer gone or superseded
        const target = i < BURST ? BURST : i + 1;
        try { while (i < appFrags.length && i < target) { ws.send(JSON.stringify({ t: 'to', to: peer, msg: appFrags[i].o })); i++; } } catch (e) {}
        if (i < appFrags.length) setTimeout(drip, 2300); // one 100KB piece / 2.3s ≈ 43KB/s, under the refill
      })();
    };
    // Deliver the heavy app to a peer once, over the best transport available:
    // the direct channel if it's open, else a paced relay drip.
    const deliverApp = (peer, ch) => {
      const p = peers.get(peer); if (!p || p.appSending) return;
      p.appSending = true; p.needsApp = false;
      if (p.appTimer) { clearTimeout(p.appTimer); p.appTimer = 0; }
      if (ch && ch.readyState === 'open') pumpApp(ch); else relayPaced(peer);
    };
    const stats = () => {
      let p2p = 0;
      const counts = { up: 0, soft: 0, warn: 0 };
      for (const p of peers.values()) {
        if (p.channel && p.channel.readyState === 'open') p2p++;
        const g = gradeOf(p.away);
        counts[g === 'lost' ? 'warn' : g]++;    // lost peers get dropped by the sweeper
      }
      return { total: peers.size, p2p, counts, self: gradeOf(ws.downSince) };
    };
    const notify = () => onStats(stats());

    // Peers that stay away past PEER_DROP are genuinely gone.
    const sweeper = setInterval(() => {
      let changed = false, anyAway = false;
      for (const [peer, p] of peers) {
        if (!p.away) continue;
        anyAway = true;
        if (Date.now() - p.away > CONN.PEER_DROP) {
          if (p.pc) { try { p.pc.close(); } catch (e) { /* long dead */ } }
          peers.delete(peer);
          putSeen.delete(peer); // the replay window is long gone once we drop them
          changed = true;
        }
      }
      if (changed || anyAway || ws.downSince) notify(); // keep grades ticking soft→warn
    }, 2000);

    // Idempotency for replayed writes: a client re-sends its pending RPCs after a
    // reconnect (see makeRemoteDb._replay). If a `put` reached us but its reply
    // was lost, a naive re-apply would create a SECOND record (the put auto-
    // assigns an id). We remember each peer's recent put op-ids → the reply we
    // gave, and on a repeat we resend that reply without touching the DB. Op-ids
    // are monotonic per client connection and the peer id survives reconnects, so
    // (peer, id) is stable; a small bounded map covers the replay window.
    const putSeen = new Map(); // peer -> Map(opId -> reply)
    const rememberPut = (peer, id, reply) => {
      let m = putSeen.get(peer); if (!m) { m = new Map(); putSeen.set(peer, m); }
      m.set(id, reply);
      while (m.size > 128) m.delete(m.keys().next().value);
    };
    const handleRpc = (peer, req) => {
      if (req.op === 'put') {
        const seen = putSeen.get(peer);
        if (seen && seen.has(req.id)) { sendTo(peer, { t: 'rpc-reply', id: req.id, ok: true, result: seen.get(req.id) }); return; }
      }
      db.op(req.op, req.collection, req.key, req.value)
        .then((result) => {
          // A put's result is the stored record — the client already HAS those
          // bytes (it just sent them). Echo only the assigned id; anything else
          // wastes the relay budget (a 300KB put would reply with 300KB).
          const slim = (req.op === 'put' && result && typeof result === 'object') ? { id: result.id } : result;
          if (req.op === 'put') rememberPut(peer, req.id, slim);
          sendTo(peer, { t: 'rpc-reply', id: req.id, ok: true, result: slim });
        })
        .catch((err) => sendTo(peer, { t: 'rpc-reply', id: req.id, ok: false, result: String(err.message || err) }));
    };

    function offerP2P(peer) {
      if (!hasP2P()) return;
      const entry = peers.get(peer);
      const pc = new root.RTCPeerConnection({ iceServers: ICE_SERVERS });
      entry.pc = pc;
      const channel = pc.createDataChannel('gifos');
      channel.onopen = () => {
        entry.channel = channel;
        // Hand a heavy app across now that we have a direct, uncapped channel.
        if (entry.needsApp) deliverApp(peer, channel);
        notify();
      };
      channel.onclose = () => { if (entry.channel === channel) { entry.channel = null; notify(); } };
      channel.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        m = defrag(m, peer); if (!m) return;
        if (m.t === 'rpc') handleRpc(peer, m);
      };
      pc.onicecandidate = (e) => { if (e.candidate) relayTo(peer, { t: 'sig', ice: e.candidate }); };
      // A dead DataChannel with a live relay link = renegotiate P2P from scratch.
      pc.onconnectionstatechange = () => {
        if (pc.connectionState !== 'failed') return;
        const cur = peers.get(peer);
        if (cur && cur.pc === pc && !cur.away) { try { pc.close(); } catch (e) {} offerP2P(peer); }
      };
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => relayTo(peer, { t: 'sig', sdp: pc.localDescription }))
        .catch(() => { /* P2P offer failed — peer stays on the relay path */ });
    }

    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'error' && /host-(stale|taken)/.test(m.error || '')) {
        // The session healed itself while this tab was away and a newer host
        // now holds the slot — stop competing for it (reconnects would loop).
        clearInterval(sweeper);
        try { ws.close(); } catch (e) { /* already closing */ }
        if (opts.onDisplaced) opts.onDisplaced();
        return;
      }
      if (m.t === 'peer-join') {
        if (opts.selfPeer && m.peer === opts.selfPeer) return; // our own old seat
        const known = peers.get(m.peer);
        // Expiry closes the door to NEW faces only — a known peer reconnecting
        // (dropped socket, refocus) is already inside and always let back in.
        if (!known && opts.exp && Date.now() > opts.exp) { relayTo(m.peer, { t: 'ended', reason: 'expired' }); return; }
        if (known && known.pc) { try { known.pc.close(); } catch (e) { /* stale */ } }
        peers.set(m.peer, { pc: null, channel: null, away: null, needsApp: false });
        // The app GIF only goes to genuinely new peers — a rejoining phone
        // already has it (and the client dedups regardless), and skipping the
        // resend keeps reconnect storms inside the relay's bandwidth budget.
        // Small apps go straight over the relay; a heavy app waits for the peer's
        // DataChannel (set needsApp) and is handed over on channel.onopen — with
        // a paced-relay fallback if that never happens (no direct route).
        if (!known) {
          if (appSmall) relayTo(m.peer, appMsg);
          else { const p = peers.get(m.peer); p.needsApp = true; p.appTimer = setTimeout(() => { if (p.needsApp && !p.appSending) deliverApp(m.peer, null); }, APP_P2P_WAIT); }
        }
        offerP2P(m.peer);
        notify();
      } else if (m.t === 'peer-leave') {
        const p = peers.get(m.peer);
        if (p) {
          p.away = Date.now();
          if (p.pc) { try { p.pc.close(); } catch (e) { /* already closed */ } p.pc = null; p.channel = null; }
        }
        notify();
      } else if (m.t === 'from' && m.msg) {
        const inner = defrag(m.msg, m.from);
        if (!inner) return;
        if (inner.t === 'rpc') handleRpc(m.from, inner);
        else if (inner.t === 'sig') {
          const p = peers.get(m.from);
          if (p && p.pc) {
            if (inner.sdp) p.pc.setRemoteDescription(inner.sdp).catch(() => {});
            else if (inner.ice) p.pc.addIceCandidate(inner.ice).catch(() => {});
          }
        }
      }
    };
    // Our own relay socket healed: tell clients we're back and wake their
    // views; the relay re-sends peer-joins, which re-offers P2P per peer.
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'bcast', msg: { t: 'host-back' } }));
      ws.send(JSON.stringify({ t: 'bcast', msg: { t: 'db-change', collection: '*' } }));
      notify();
    };
    ws.onstate = () => notify();

    return { sendToAll, stats, stop: () => clearInterval(sweeper) };
  }

  function openHostSocket(relay, sid, token, epoch, hostid) {
    return new Promise((resolve, reject) => {
      const sock = steadySocket(() => relay.replace(/\/$/, '') + '/s/' + sid + '?role=host&token=' + token +
        '&epoch=' + (epoch || 0) + (hostid ? '&hostid=' + encodeURIComponent(hostid) : ''));
      const timer = setTimeout(() => { sock.close(); reject(new Error('relay connection failed')); }, 8000);
      // Resolve only on the relay's host-ready — a rejected claim (host-stale /
      // host-taken) must fail the promise, not hand back a dead socket.
      sock.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'host-ready') { clearTimeout(timer); sock.onmessage = null; resolve(sock); }
        else if (m.t === 'error') { clearTimeout(timer); sock.close(); reject(new Error(m.error || 'host claim rejected')); }
      };
    });
  }

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
      const SYSTEM_PAGES = { meet: 'meet.html', video: 'meet.html' }; // 'video' = pre-rename seeds
      if (manifest.system && SYSTEM_PAGES[manifest.system]) {
        location.replace(SYSTEM_PAGES[manifest.system]);
        return noop;
      }
      document.title = (manifest.name || 'App') + ' — GifOS';

      const hasEntry = !!files[norm(manifest.entry || 'index.html')] || !!files['index.html'];
      const iframe = makeIframe();
      mountEl.innerHTML = ''; mountEl.appendChild(iframe);
      if (!hasEntry) { iframe.srcdoc = buildFolderHtml(files); setStatus('Browsable filesystem (no index.html).'); return noop; }

      let hostApi = null;
      const emit = (collection) => {
        if (iframe.contentWindow) iframe.contentWindow.postMessage({ ns: 'gifos', type: 'db-change', collection }, '*');
        if (hostApi) hostApi.sendToAll({ t: 'db-change', collection });
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
        try { gone.ws.send(JSON.stringify({ t: 'bcast', msg: { t: 'ended', reason } })); } catch (e) { /* socket gone */ }
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
          const valid = sess && sess.keep === 'persist' && (!sess.exp || now < sess.exp);
          let sid, token, epoch, keep, exp, heal;
          if (opts.lifetime) {
            // An explicit choice mints a FRESH link, which revokes any old one:
            // one live link per app, so past guests can no longer rejoin.
            const spec = lifetimeToSpec(opts.lifetime, now);
            sid = token = shortCode(); epoch = 0; keep = spec.keep; exp = spec.exp;
            heal = keep === 'persist' && !!opts.resilient; // 'close' can't self-heal
          } else if (valid) {
            sid = sess.sid; token = sess.token; epoch = sess.epoch || 0;
            keep = sess.keep; exp = sess.exp || 0; heal = !!sess.heal;
          } else {
            // No stored link to resume and no choice given → ephemeral default.
            sid = token = shortCode(); epoch = 0; keep = 'close'; exp = 0; heal = false;
          }
          const joinUrl = buildJoinUrl('app', sid, token, relay);
          // If the session healed itself while we were dead, our epoch is stale
          // and the relay bounces us — the newest state lives with the promoted
          // host, so rejoin our own session as a guest instead of clobbering it.
          const displaced = () => {
            setStatus('Your session kept going without you — rejoining as a guest…');
            // replace() alone won't reload when only the #hash differs —
            // run.html#id=… → run.html#j=… needs an explicit reload to reboot
            // this page in client mode.
            location.replace(joinUrl);
            location.reload();
          };
          // Rotating to a new link: tell guests on the old link they've been
          // cut off (so they don't sit "waiting for host"), then retire it.
          const prior = liveHost; liveHost = null;
          if (prior) {
            try { prior.ws.send(JSON.stringify({ t: 'bcast', msg: { t: 'ended', reason: 'revoked' } })); } catch (e) { /* socket gone */ }
            setTimeout(() => retire(prior), 200);
          }
          return openHostSocket(relay, sid, token, epoch, identity().id).then((ws) => {
            hostApi = attachHost(ws, db, appBytes, (s) => {
              root.__gifosHostStats = s;
              announceConn({ mode: 'host', counts: s.counts, total: s.total, p2p: s.p2p, self: s.self });
              setStatus('Live · ' + s.total + ' friend(s) here' + (s.p2p ? ' · ' + s.p2p + ' connected directly' : ''));
            }, { onDisplaced: displaced, heal, exp });
            // Expiry only shuts the door to NEW joiners (attachHost enforces exp
            // per join); a light timer just refreshes the host's own status so
            // they know the link went read-only.
            const timer = exp ? setTimeout(() => { if (liveHost) setStatus('Link no longer admits new people (open Invite for a new one). Everyone here stays.'); }, Math.max(0, exp - now)) : null;
            liveHost = { ws, timer, stop: hostApi.stop };
            announceConn({ mode: 'host', counts: { up: 0, soft: 0, warn: 0 }, total: 0, p2p: 0, self: 'up' });
            setStatus('Live — send your invite link so friends can join');
            // Wake any clients that were locked out while we were away.
            ws.send(JSON.stringify({ t: 'bcast', msg: { t: 'db-change', collection: '*' } }));
            return store.setState(fileId + '::session', { sid, token, relay, epoch, keep, exp, heal }).then(() => ({
              shareUrl: joinUrl, keep, exp, heal,
            }));
          }).catch((err) => {
            if (/host-(stale|taken)/.test(String(err && err.message || ''))) { displaced(); return new Promise(() => {}); }
            throw err;
          });
        });
      }

      return db.load().then((state) => {
        // First run of a snapshot GIF: hydrate the icon's DB from embedded state.
        if (isEmptyState(state) && files['.state/db.json']) {
          try {
            const embedded = JSON.parse(gif.bytesToText(files['.state/db.json']));
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

  // ---- client boot (join a host over the relay) ----------------------------
  function bootClient(mountEl, params, statusEl, hooks) {
    hooks = hooks || {};
    // Join loader: rather than a blank page while we connect and pull the app,
    // narrate what's happening in the mount area and show transfer progress.
    let loaderUp = false, appVia = 'relay';
    const showLoader = () => {
      if (loaderUp || !mountEl) return; loaderUp = true;
      // A self-contained dark card so it reads on any page theme (the join page
      // may be light or dark), rather than relying on the surrounding colors.
      mountEl.innerHTML = '<div style="display:flex;justify-content:center;padding:12vh 16px 0;box-sizing:border-box">'
        + '<div style="max-width:440px;width:100%;background:#14141f;border:1px solid #2a2a3f;border-radius:16px;padding:26px 24px;text-align:center;font:15px system-ui,-apple-system,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.28)">'
        + '<div style="font-size:38px;margin-bottom:14px">🕸️</div>'
        + '<div id="cl-title" style="font-weight:700;font-size:17px;color:#f0f0f8;margin-bottom:6px">Connecting…</div>'
        + '<div id="cl-sub" style="color:#9a9ab5;margin-bottom:16px;min-height:18px;line-height:1.4">&nbsp;</div>'
        + '<div style="height:8px;background:#26263a;border-radius:6px;overflow:hidden"><i id="cl-fill" style="display:block;height:100%;width:0;background:linear-gradient(90deg,#7b5cff,#5cc8ff);transition:width .25s"></i></div>'
        + '</div></div>';
    };
    const loadTitle = (t) => { const e = document.getElementById('cl-title'); if (e) e.textContent = t; };
    const loadSub = (t) => { const e = document.getElementById('cl-sub'); if (e) e.textContent = t || ''; };
    const loadFrac = (f) => { const e = document.getElementById('cl-fill'); if (e) e.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; };
    const setStatus = (m) => { if (statusEl) statusEl.textContent = m; if (loaderUp && !filesRef) loadTitle(m); };
    const narrate = (title, sub) => { showLoader(); setStatus(title); loadSub(sub); };
    const idle = { save: () => Promise.resolve(null), saveToDesktop: () => Promise.reject(new Error('app not loaded yet')), becomeHost: () => Promise.reject(new Error('host still alive')) };
    if (!params.relay) { setStatus('No relay in join link.'); return Promise.resolve(idle); }
    holdSessionLock(); // a frozen client tab would silently miss the session too
    let myPeer = null; // relay-assigned id; reused on reconnect so the host keeps our seat
    const ws = steadySocket(() => params.relay.replace(/\/$/, '') + '/s/' + params.s +
      '?role=client&token=' + params.k + (myPeer ? '&peer=' + myPeer : ''));
    let iframe = null, remoteDb = null, filesRef = null, manifestRef = null;
    let appBytes = null, lastDump = null, hostGone = false, hostGoneAt = null, tookOver = false;
    // Cache the state captured at connect time + memoize the connect-snapshot
    // bytes, so "steal with data at connect" is instant and re-transports nothing.
    const stealCtx = { connectState: null, cache: { bytes: null } };
    let pc = null, channel = null; // P2P DataChannel to the host (when it opens)
    // The host tells us whether this session self-heals (only 'forever' links
    // do). If it doesn't, we never mirror its state — so there's nothing to
    // promote, and the session genuinely ends when the host leaves. `ended` is
    // a terminal stop: the host expired or closed a bounded link.
    let sessionHeal = false, ended = false, sessionExp = 0;

    // The failover mirror re-downloads FULL app state. On every db-change that
    // is O(state) traffic per client — with big records it can drain the whole
    // relay budget in one burst (dropping unrelated replies with it). Rate-
    // limit it: first change syncs immediately, bursts collapse into one
    // trailing dump. A takeover copy a few seconds stale is still a rescue.
    let mirrorTimer = null, mirrorLast = 0;
    const MIRROR_MIN_MS = 5000;
    const mirror = () => {
      if (!remoteDb || hostGone || !sessionHeal) return;
      const due = mirrorLast + MIRROR_MIN_MS - Date.now();
      if (due > 0) { if (!mirrorTimer) mirrorTimer = setTimeout(() => { mirrorTimer = null; mirror(); }, due); return; }
      mirrorLast = Date.now();
      remoteDb.getFullState().then((s) => { lastDump = s; }).catch(() => {});
    };

    // Transport ladder: DataChannel when open, relay WebSocket otherwise.
    // The app never knows which one carried its request. Oversized payloads
    // fragment transparently (see sendChunked); the host defrags per peer.
    const defrag = makeDefrag((fid, got, n) => {
      if (filesRef || tookOver) return; // app already mounted — later big records aren't the app
      showLoader(); loadTitle('Receiving the app…'); loadFrac(got / n);
      loadSub(appVia === 'relay'
        ? 'No direct route found — coming over the relay. This can take a few minutes…'
        : 'Direct connection · ' + Math.round(got / n * 100) + '%');
    });
    const transportSend = (payload) => {
      if (channel && channel.readyState === 'open') sendChunked(payload, (piece, str) => channel.send(str));
      else sendChunked(payload, (piece, str) => ws.send(str));
    };
    const runningStatus = () => setStatus(channel && channel.readyState === 'open'
      ? 'Connected · a direct line to the host'
      : 'Connected · via GifOS');

    // ---- calm connection grading ------------------------------------------
    // Blips (phone glanced away, network hiccup) must not alarm anyone: soft
    // for the first seconds, yellow while recoverable, red ONLY when the host
    // is gone past LOST and can't be waited out. A live DataChannel counts as
    // up even while the relay socket heals.
    let takeoverHinted = false, lostDeclared = false;

    // ---- self-healing election ----------------------------------------------
    // If the host stays gone past AUTO_TAKEOVER, mirrored clients rescue the
    // session themselves: shortly before the deadline everyone gossips a
    // candidacy (their mirror timestamp), the freshest copy claims the host
    // slot first, and lower-ranked backups stagger in behind only if the
    // leader stalls. The relay's epoch-guarded host slot is the real mutex —
    // a lost race is just a rejected claim, and the winner's host-back cancels
    // everyone else. mirrorLast is bucketed to 10s so clock skew between
    // devices can't scramble the ranking.
    let hostEpoch = 0;        // latest epoch seen in a roster; takeover claims +1
    let rosterPeers = [];     // seat ids, for candidacy gossip
    const cands = new Map();  // peer id -> mirror timestamp
    let candSent = false, autoClaiming = false;
    const candRank = () => {
      const order = Array.from(cands.entries())
        .map(([p, at]) => [Math.round((+at || 0) / 10000), p])
        .sort((a, b) => (b[0] - a[0]) || (a[1] < b[1] ? -1 : 1));
      const i = order.findIndex((e) => e[1] === myPeer);
      return i < 0 ? 99 : i;
    };
    const connGrade = () => {
      if (tookOver) return 'up';
      if (channel && channel.readyState === 'open') return 'up';
      if (hostGone) return gradeOf(hostGoneAt);
      if (ws.state !== 'up') return gradeOf(ws.downSince);
      return filesRef ? 'up' : 'soft'; // connected, still waiting for the app
    };
    const announceClient = () => {
      if (tookOver) return;
      announceConn({ mode: 'client', grade: connGrade(), via: (channel && channel.readyState === 'open') ? 'p2p' : 'relay', hostAway: hostGone });
    };
    const escalator = setInterval(() => {
      if (tookOver || ended) { clearInterval(escalator); return; }
      const g = connGrade();
      // The Take Over hint appears once the host has been away a few seconds…
      if (hostGone && !takeoverHinted && hostGoneAt && Date.now() - hostGoneAt > CONN.TAKEOVER_HINT) {
        takeoverHinted = true;
        setStatus(lastDump ? 'The host stepped away — waiting for them. You have a copy, so you can also Take Over.'
          : 'The host stepped away — waiting for them to come back.');
        if (hooks.onHostGone) hooks.onHostGone(!!lastDump);
      }
      // …but pending work is only abandoned when the host is genuinely lost.
      if (hostGone && !lostDeclared && g === 'lost') {
        lostDeclared = true;
        if (remoteDb) remoteDb._setHostDown(true);
        setStatus(lastDump ? 'The host is gone. Take Over to keep the session going from your copy.'
          : 'The host is gone, and nothing was shared with you yet.');
      }
      // Self-healing: candidacy gossip, then the freshest copy claims the slot.
      if (hostGone && hostGoneAt && lastDump && !autoClaiming && myPeer) {
        const down = Date.now() - hostGoneAt;
        if (!candSent && down > CONN.AUTO_TAKEOVER - CONN.CAND_LEAD) {
          candSent = true;
          cands.set(myPeer, mirrorLast);
          for (const p of rosterPeers) if (p !== myPeer) ws.send(JSON.stringify({ t: 'peer', to: p, msg: { t: 'cand', at: mirrorLast } }));
        }
        if (candSent && down > CONN.AUTO_TAKEOVER + candRank() * CONN.RANK_STEP) {
          autoClaiming = true;
          setStatus('The host is gone — healing the session from the freshest copy…');
          becomeHost({ auto: true }).then((r) => {
            if (hooks.onAutoTakeover) hooks.onAutoTakeover(r);
          }).catch(() => { autoClaiming = false; /* lost the race — the winner's host-back is on its way */ });
        }
      }
      announceClient();
    }, 1000);

    const hostIsBack = () => {
      if (!hostGone) return;
      hostGone = false; hostGoneAt = null; takeoverHinted = false;
      if (remoteDb) {
        if (lostDeclared) remoteDb._setHostDown(false);
        lostDeclared = false;
        remoteDb._replay(); // anything asked while they were away goes again
      }
      candSent = false; autoClaiming = false; cands.clear(); // election is off
      if (hooks.onHostBack) hooks.onHostBack();
      if (filesRef) runningStatus();
      announceClient();
    };

    // Receive the app archive (over EITHER transport): the relay for a small
    // app, or the P2P DataChannel for a heavy one. Idempotent — a redelivery
    // once we're already mounted is ignored.
    const receiveApp = (m) => {
      hostIsBack();
      sessionHeal = !!m.heal; // does this link self-heal? governs mirroring
      sessionExp = m.exp || 0; // admission deadline, carried into any takeover
      if (filesRef || tookOver) { runningStatus(); return; }
      appBytes = gif.b64decode(m.gif);
      gif.decode(appBytes).then((archive) => {
        if (tookOver || filesRef) return;
        if (!archive) { setStatus('Bad app from host.'); return; }
        filesRef = archive.files; manifestRef = gif.readManifest(archive) || { name: 'App' };
        document.title = (manifestRef.name || 'App') + ' — GifOS (client)';
        remoteDb = makeRemoteDb(transportSend);
        iframe = makeIframe(); mountEl.innerHTML = ''; mountEl.appendChild(iframe);
        // Client-run: the veto is session-only (no local icon to persist under).
        mountApp(iframe, filesRef, manifestRef, remoteDb, appBytes, makeNetPolicy(null, manifestRef));
        Promise.resolve(remoteDb.getFullState()).then((cs) => { stealCtx.connectState = cs; });
        if (root.__gifosOnApp) root.__gifosOnApp(appBytes, manifestRef);
        root.__gifosTransport = (channel && channel.readyState === 'open') ? 'p2p' : 'relay';
        runningStatus();
        announceClient();
        mirror();
      });
    };

    // Shared dispatch for host->client session messages, from either transport.
    const dispatch = (m) => {
      if (m.t === 'app') { receiveApp(m); return; }
      if (m.t === 'ended') {
        // The host closed or expired a bounded link. It won't come back and
        // there's nothing to take over — stop waiting and say so plainly.
        if (ended) return;
        ended = true; hostGone = true; lastDump = null;
        clearInterval(escalator);
        if (remoteDb) remoteDb._setHostDown(true);
        setStatus(m.reason === 'expired' ? 'This invite link has expired. Ask the host for a new one.'
          : m.reason === 'revoked' ? 'This invite link was replaced. Ask the host for the new one.'
          : 'The host stopped sharing this session.');
        announceConn({ mode: 'client', grade: 'lost', via: 'relay', hostAway: true });
        try { ws.close(); } catch (e) { /* already closing */ }
        return;
      }
      if (m.t === 'host-back') { hostIsBack(); return; }
      if (m.t === 'rpc-reply') {
        hostIsBack();
        if (remoteDb) remoteDb._reply(m.id, m.ok, m.result);
      } else if (m.t === 'db-change') {
        hostIsBack();
        if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage({ ns: 'gifos', type: 'db-change', collection: m.collection }, '*');
        mirror();
      }
    };

    // Host offered P2P: answer it. A fresh offer (e.g. after failover to a new
    // host) replaces any previous connection.
    const onSignal = (msg) => {
      if (!hasP2P()) return; // no WebRTC here — we simply stay on the relay
      if (msg.sdp && msg.sdp.type === 'offer') {
        if (pc) { try { pc.close(); } catch (e) { /* stale */ } pc = null; channel = null; }
        pc = new root.RTCPeerConnection({ iceServers: ICE_SERVERS });
        pc.onicecandidate = (e) => { if (e.candidate) ws.send(JSON.stringify({ t: 'sig', ice: e.candidate })); };
        if (!filesRef) loadSub('Found your friend — opening a direct route…');
        pc.ondatachannel = (e) => {
          const ch = e.channel;
          ch.onopen = () => { channel = ch; root.__gifosTransport = 'p2p'; if (!filesRef) loadSub('Direct connection ready — receiving the app…'); if (!hostGone && !tookOver) runningStatus(); };
          ch.onclose = () => { if (channel === ch) { channel = null; root.__gifosTransport = 'relay'; if (!hostGone && !tookOver) runningStatus(); } };
          ch.onmessage = (ev2) => { appVia = 'p2p'; let mm; try { mm = JSON.parse(ev2.data); } catch (er) { return; } mm = defrag(mm, 'host'); if (mm) dispatch(mm); };
        };
        pc.setRemoteDescription(msg.sdp)
          .then(() => pc.createAnswer())
          .then((answer) => pc.setLocalDescription(answer))
          .then(() => ws.send(JSON.stringify({ t: 'sig', sdp: pc.localDescription })))
          .catch(() => { /* negotiation failed — relay path continues */ });
      } else if (msg.ice && pc) {
        pc.addIceCandidate(msg.ice).catch(() => {});
      }
    };

    narrate('Connecting to your friend’s room…', '');
    // Socket healed: re-sync the view and replay unanswered requests. The host
    // sees our rejoin (same peer id) and re-offers P2P on its own.
    ws.onopen = () => {
      if (tookOver || ended || !remoteDb) return;
      remoteDb._replay();
      if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage({ ns: 'gifos', type: 'db-change', collection: '*' }, '*');
      mirror();
      announceClient();
    };
    ws.onstate = () => announceClient();
    ws.onmessage = (ev) => {
      appVia = 'relay';
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      m = defrag(m, 'host'); if (!m) return; // fragmented app delivery / replies reassemble here
      if (m.t === 'joined') { myPeer = m.peer; if (!filesRef) narrate('Connected', 'Getting the game ready…'); }
      else if (m.t === 'error') {
        if (/token/i.test(m.error || '')) { ws.close(); setStatus('Cannot join: ' + m.error); }
        else if (/no host/i.test(m.error || '')) {
          // The room exists but the host hasn't (re)opened the icon yet — the
          // steady socket keeps knocking and we walk in when they arrive.
          hostGone = true; hostGoneAt = hostGoneAt || Date.now();
          setStatus('Waiting for the host to open the app…');
        } else setStatus('Cannot join: ' + m.error);
      }
      else if (m.t === 'sig') onSignal(m);
      else if (m.t === 'roster') { rosterPeers = m.peers || []; if (m.epoch != null) hostEpoch = m.epoch; }
      else if (m.t === 'peer' && m.msg && m.msg.t === 'cand') { cands.set(m.from, +m.msg.at || 0); }
      else if (m.t === 'host-gone') {
        // No alarm yet: the host's phone probably just blinked. The escalator
        // raises the Take Over hint after a few seconds and red only at LOST.
        hostGone = true; hostGoneAt = Date.now();
        announceClient();
      } else if (m.t === 'app') {
        receiveApp(m);
      } else {
        dispatch(m);
      }
    };

    // Take over the SAME session from the mirrored state: remaining clients
    // stay connected to the relay and keep working against the new host.
    function becomeHost(opts) {
      opts = opts || {};
      if (!lastDump || !appBytes) return Promise.reject(new Error('No mirrored state to take over from.'));
      const claimEpoch = hostEpoch + 1;
      // Durable capture first: the app + state land on THIS desktop, so the
      // takeover survives a reload of this tab too. Then CLAIM the host slot
      // BEFORE tearing down our client seat — losing the race (host-taken)
      // must leave us a working guest, not an orphan.
      return saveAppToDesktop(appBytes, manifestRef, lastDump).then((fileId) =>
        openHostSocket(params.relay, params.s, params.k, claimEpoch, myPeer).then((ws2) => {
          try { ws.onclose = null; ws.close(); } catch (e) { /* already closed */ }
          if (pc) { try { pc.close(); } catch (e) { /* dead host */ } pc = null; channel = null; }
          tookOver = true;
          root.__gifosTransport = 'host';
          let hostApi = null;
          const emit = (collection) => {
            if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage({ ns: 'gifos', type: 'db-change', collection }, '*');
            if (hostApi) hostApi.sendToAll({ t: 'db-change', collection });
          };
          const db = makeLocalDb(fileId, emit);
          hostApi = attachHost(ws2, db, appBytes, (s) => {
            root.__gifosHostStats = s;
            announceConn({ mode: 'host', counts: s.counts, total: s.total, p2p: s.p2p, self: s.self });
            setStatus('Live (you took over) · ' + s.total + ' friend(s) here' + (s.p2p ? ' · ' + s.p2p + ' connected directly' : ''));
          }, {
            selfPeer: myPeer,
            heal: true, // takeover only reaches here for self-healing links
            exp: sessionExp, // keep enforcing the original admission window
            onDisplaced: () => {
              setStatus('A newer host holds the session — rejoining as a guest…');
              location.replace(buildJoinUrl('app', params.s, params.k, params.relay));
              location.reload(); // hash-only change — force the client-mode reboot
            },
          });
          // Remount the app against the local DB and wake the other clients.
          // We now own a desktop icon, so the veto persists under its fileId.
          const takeoverPolicy = makeNetPolicy(fileId, manifestRef);
          const fresh = makeIframe(); mountEl.innerHTML = ''; mountEl.appendChild(fresh);
          iframe = fresh;
          takeoverPolicy.load().then(() => mountApp(fresh, filesRef, manifestRef, db, appBytes, takeoverPolicy));
          ws2.send(JSON.stringify({ t: 'bcast', msg: { t: 'db-change', collection: '*' } }));
          setStatus(opts.auto ? 'The host vanished — you took over automatically · the session continues'
            : 'Live (you took over) · the session continues');
          return store.setState(fileId + '::session', { sid: params.s, token: params.k, relay: params.relay, epoch: claimEpoch })
            .then(() => ({ shareUrl: buildJoinUrl('app', params.s, params.k, params.relay), save: () => downloadSnapshot(appBytes, filesRef, manifestRef, db) }));
        })
      );
    }

    function saveToDesktop() {
      if (!appBytes || !filesRef) return Promise.reject(new Error('app not loaded yet'));
      // Steal the APP, not its data: no session state is captured, and any
      // state baked into the GIF itself (snapshot-origin apps) is stripped,
      // so the stolen copy opens fresh. Steal with data:'current' keeps it.
      const clean = {};
      let hadState = false;
      for (const p in filesRef) { if (p.startsWith('.state/')) hadState = true; else clean[p] = filesRef[p]; }
      const bytes = hadState && gif.repack ? gif.repack(appBytes, clean) : appBytes;
      return Promise.all([Promise.resolve(bytes), ensureStolenFolder()])
        .then(([b, folderId]) => saveAppToDesktop(b, manifestRef, null, folderId));
    }

    return Promise.resolve({
      save: () => (filesRef && remoteDb ? downloadSnapshot(appBytes, filesRef, manifestRef, remoteDb) : Promise.resolve(null)),
      saveToDesktop,
      steal: (opts) => (filesRef && remoteDb ? stealApp(appBytes, filesRef, manifestRef, remoteDb, stealCtx, opts) : Promise.reject(new Error('app not loaded yet'))),
      becomeHost,
    });
  }

  GifOS.runtime = { boot, bootClient, buildAppHtml, buildFolderHtml, norm };
})(typeof window !== 'undefined' ? window : globalThis);
