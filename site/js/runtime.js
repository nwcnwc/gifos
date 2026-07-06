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
    const pretty = sid === token && /(^|\.)gifos\.app$/.test(location.hostname) && relay === root.GIFOS_RELAY;
    if (pretty) return location.origin + (page === 'video' ? '/call/' : '/join/') + sid;
    const base = location.origin + (page === 'video' ? '/video.html' : '/run.html');
    const pair = page === 'video' ? 'v=' + sid + '&k=' + token : (sid === token ? 'j=' + sid : 's=' + sid + '&k=' + token);
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
      var pending = {}, subs = {};
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
        setName: function(n){ return rpc({type:'setName', name:n}); }
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
  const APP_CSP = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'media-src data: blob:',
    'font-src data:',
    'worker-src blob:',
    "connect-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    // (WebRTC is neutered in the shim instead of via a CSP 'webrtc' directive,
    //  which is not supported across all browsers.)
  ].join('; ');

  // ---- build a runnable, self-contained HTML doc from the archive ----------
  function buildAppHtml(files) {
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
      meta.setAttribute('content', APP_CSP);
      const shim = doc.createElement('script');
      shim.textContent = clientShim();
      doc.head.insertBefore(shim, doc.head.firstChild);
      doc.head.insertBefore(meta, doc.head.firstChild);
      return '<!doctype html>' + doc.documentElement.outerHTML;
    }
    // Non-DOM fallback (tooling): best-effort inject into <head> if present.
    const head = '<meta http-equiv="Content-Security-Policy" content="' + APP_CSP + '">' +
      '<script>' + clientShim() + '</script>';
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : head + html;
  }

  function buildFolderHtml(files) {
    const rows = Object.keys(files).sort().map((p) =>
      '<tr><td><a href="' + dataUrl(p, files[p]) + '" target="_blank">' + escapeHtml(p) + '</a></td><td>' + files[p].length + ' B</td></tr>').join('');
    return '<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#0a0a0f;color:#e0e0f0;padding:2rem}' +
      'h2{color:#7b5cff}table{border-collapse:collapse;width:100%}td{padding:.4rem .8rem;border-bottom:1px solid #2a2a3f}' +
      'a{color:#7b5cff;text-decoration:none}a:hover{text-decoration:underline}</style>' +
      '<h2>📁 GIF filesystem — no index.html</h2><p>This GIF has no entry point, so it is browsable like an open folder.</p><table>' + rows + '</table>';
  }
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- external-API bridge (manifest-gated) --------------------------------
  function isAllowed(manifest, host) {
    const allowed = (manifest.capabilities && manifest.capabilities.network) || [];
    return allowed.some((p) => p === '*' || host === p || host.endsWith('.' + p));
  }
  function bridgeFetch(manifest, d) {
    let host; try { host = new URL(d.url).hostname; } catch (e) { return Promise.reject(new Error('bad url')); }
    if (!isAllowed(manifest, host)) return Promise.reject(new Error('Network denied: ' + host + ' not in app permissions'));
    return fetch(d.url, { method: d.method, headers: d.headers, body: d.body || undefined })
      .then((resp) => resp.text().then((body) => ({ status: resp.status, headers: Object.fromEntries(resp.headers.entries()), body })));
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
  function downloadSnapshot(originalBytes, files, manifest, db) {
    return Promise.resolve(db.getFullState()).then((state) => packSnapshot(originalBytes, files, manifest, state)).then((bytes) => {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
      const a = document.createElement('a');
      const name = (manifest.appId || 'app') + '-snapshot.gif';
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return name;
    });
  }

  // ---- desktop capture: write app + state into THIS browser's desktop ------
  function saveAppToDesktop(appBytes, manifest, state) {
    const fileId = store.uid('file');
    const name = (manifest.name || manifest.appId || 'App') + '.gif';
    return store.putFile({ id: fileId, name, bytes: appBytes, kind: 'gif', isApp: true,
      appId: manifest.appId, accent: manifest.accent, mime: 'image/gif' })
      .then(() => store.putItem({ id: store.uid('item'), kind: 'file', fileId, name,
        parent: null, x: 24, y: 24, iconSize: 64 }))
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
  function makeLocalDb(fileId, onChange) {
    let state = emptyState();
    const chan = ('BroadcastChannel' in root) ? new BroadcastChannel(store.appChannel(fileId)) : null;
    if (chan) chan.onmessage = (e) => { load().then(() => onChange(e.data.collection)); };
    const load = () => store.getState(fileId).then((s) => { if (s) state = s; return state; });
    const persist = () => store.setState(fileId, state);
    const coll = (n) => (state.collections[n] = state.collections[n] || { items: {}, seq: 1 });
    const deep = () => JSON.parse(JSON.stringify(state));
    return {
      load,
      import(s) { state = s; return persist(); },
      getFullState: () => load().then(deep),
      op(op, collection, key, value) {
        return load().then(() => {
          if (op === 'dump') return deep();
          const c = coll(collection); let result = null, changed = false;
          if (op === 'put') { const it = Object.assign({}, value); if (it.id == null) it.id = collection + '_' + (c.seq++); c.items[it.id] = it; result = it; changed = true; }
          else if (op === 'get') result = c.items[key] || null;
          else if (op === 'getAll') result = Object.keys(c.items).map((k) => c.items[k]);
          else if (op === 'delete') { delete c.items[key]; result = true; changed = true; }
          if (!changed) return result;
          return persist().then(() => { if (chan) chan.postMessage({ collection }); onChange(collection); return result; });
        });
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
  function mountApp(iframe, files, manifest, db, originalBytes) {
    const handler = (e) => {
      if (!iframe.contentWindow || e.source !== iframe.contentWindow) return;
      const d = e.data; if (!d || d.ns !== 'gifos') return;
      const reply = (p) => iframe.contentWindow.postMessage(Object.assign({ ns: 'gifos', type: 'reply', id: d.id }, p), '*');
      if (d.type === 'db') db.op(d.op, d.collection, d.key, d.value).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      else if (d.type === 'fetch') bridgeFetch(manifest, d).then((r) => reply({ ok: true, result: r })).catch((err) => reply({ ok: false, error: String(err.message || err) }));
      else if (d.type === 'save') downloadSnapshot(originalBytes, files, manifest, db).then((name) => reply({ ok: true, result: name })).catch((err) => reply({ ok: false, error: String(err.message || err) }));
      else if (d.type === 'info') reply({ ok: true, result: { appId: manifest.appId, name: manifest.name, version: manifest.version } });
      else if (d.type === 'me') reply({ ok: true, result: identity() });
      else if (d.type === 'setName') reply({ ok: true, result: setName(d.name) });
    };
    root.addEventListener('message', handler);
    iframe.srcdoc = buildAppHtml(files);
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
  const FRAG_MAX_PARTS = 96;    // ~9.6MB reassembled max; refuse absurd claims
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
  const makeDefrag = () => {
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
          changed = true;
        }
      }
      if (changed || anyAway || ws.downSince) notify(); // keep grades ticking soft→warn
    }, 2000);

    const handleRpc = (peer, req) => {
      db.op(req.op, req.collection, req.key, req.value)
        .then((result) => {
          // A put's result is the stored record — the client already HAS those
          // bytes (it just sent them). Echo only the assigned id; anything else
          // wastes the relay budget (a 300KB put would reply with 300KB).
          const slim = (req.op === 'put' && result && typeof result === 'object') ? { id: result.id } : result;
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
      channel.onopen = () => { entry.channel = channel; notify(); };
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
        if (known && known.pc) { try { known.pc.close(); } catch (e) { /* stale */ } }
        peers.set(m.peer, { pc: null, channel: null, away: null });
        // The app GIF only goes to genuinely new peers — a rejoining phone
        // already has it (and the client dedups regardless), and skipping the
        // resend keeps reconnect storms inside the relay's bandwidth budget.
        if (!known) relayTo(m.peer, { t: 'app', gif: gif.b64encode(appBytes) });
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
      const SYSTEM_PAGES = { video: 'video.html' };
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

      function becomeHost() {
        const relay = relayUrl();
        if (!relay) return Promise.reject(new Error('No relay configured (set window.GIFOS_RELAY).'));
        // Reuse the icon's stored session so reopening the app resumes the SAME
        // share link — closing the tab "locks" clients until the icon reopens
        // (unless self-healing promoted someone meanwhile; see host-stale below).
        return store.getState(fileId + '::session').then((sess) => {
          const code = shortCode();
          const sid = (sess && sess.sid) || code;
          const token = (sess && sess.token) || code;
          const epoch = (sess && sess.epoch) || 0;
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
          return openHostSocket(relay, sid, token, epoch, identity().id).then((ws) => {
            hostApi = attachHost(ws, db, appBytes, (s) => {
              root.__gifosHostStats = s;
              announceConn({ mode: 'host', counts: s.counts, total: s.total, p2p: s.p2p, self: s.self });
              setStatus('Live · ' + s.total + ' friend(s) here' + (s.p2p ? ' · ' + s.p2p + ' P2P direct' : ''));
            }, { onDisplaced: displaced });
            announceConn({ mode: 'host', counts: { up: 0, soft: 0, warn: 0 }, total: 0, p2p: 0, self: 'up' });
            setStatus('Live — send your invite link so friends can join');
            // Wake any clients that were locked out while we were away.
            ws.send(JSON.stringify({ t: 'bcast', msg: { t: 'db-change', collection: '*' } }));
            return store.setState(fileId + '::session', { sid, token, relay, epoch }).then(() => ({
              shareUrl: joinUrl,
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
      }).then(() => {
        mountApp(iframe, files, manifest, db, appBytes);
        if (root.__gifosOnApp) root.__gifosOnApp(appBytes);
        announceConn({ mode: 'local' });
        setStatus('Running · state saved to this icon');
        return { save: () => downloadSnapshot(appBytes, files, manifest, db), becomeHost };
      });
    }
  }

  // ---- client boot (join a host over the relay) ----------------------------
  function bootClient(mountEl, params, statusEl, hooks) {
    hooks = hooks || {};
    const setStatus = (m) => { if (statusEl) statusEl.textContent = m; };
    const idle = { save: () => Promise.resolve(null), saveToDesktop: () => Promise.reject(new Error('app not loaded yet')), becomeHost: () => Promise.reject(new Error('host still alive')) };
    if (!params.relay) { setStatus('No relay in join link.'); return Promise.resolve(idle); }
    holdSessionLock(); // a frozen client tab would silently miss the session too
    let myPeer = null; // relay-assigned id; reused on reconnect so the host keeps our seat
    const ws = steadySocket(() => params.relay.replace(/\/$/, '') + '/s/' + params.s +
      '?role=client&token=' + params.k + (myPeer ? '&peer=' + myPeer : ''));
    let iframe = null, remoteDb = null, filesRef = null, manifestRef = null;
    let appBytes = null, lastDump = null, hostGone = false, hostGoneAt = null, tookOver = false;
    let pc = null, channel = null; // P2P DataChannel to the host (when it opens)

    // The failover mirror re-downloads FULL app state. On every db-change that
    // is O(state) traffic per client — with big records it can drain the whole
    // relay budget in one burst (dropping unrelated replies with it). Rate-
    // limit it: first change syncs immediately, bursts collapse into one
    // trailing dump. A takeover copy a few seconds stale is still a rescue.
    let mirrorTimer = null, mirrorLast = 0;
    const MIRROR_MIN_MS = 5000;
    const mirror = () => {
      if (!remoteDb || hostGone) return;
      const due = mirrorLast + MIRROR_MIN_MS - Date.now();
      if (due > 0) { if (!mirrorTimer) mirrorTimer = setTimeout(() => { mirrorTimer = null; mirror(); }, due); return; }
      mirrorLast = Date.now();
      remoteDb.getFullState().then((s) => { lastDump = s; }).catch(() => {});
    };

    // Transport ladder: DataChannel when open, relay WebSocket otherwise.
    // The app never knows which one carried its request. Oversized payloads
    // fragment transparently (see sendChunked); the host defrags per peer.
    const defrag = makeDefrag();
    const transportSend = (payload) => {
      if (channel && channel.readyState === 'open') sendChunked(payload, (piece, str) => channel.send(str));
      else sendChunked(payload, (piece, str) => ws.send(str));
    };
    const runningStatus = () => setStatus(channel && channel.readyState === 'open'
      ? 'Running as client · P2P direct'
      : 'Running as client · Via relay');

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
      if (tookOver) { clearInterval(escalator); return; }
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

    // Shared dispatch for host->client session messages, from either transport.
    const dispatch = (m) => {
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
        pc.ondatachannel = (e) => {
          const ch = e.channel;
          ch.onopen = () => { channel = ch; root.__gifosTransport = 'p2p'; if (!hostGone && !tookOver) runningStatus(); };
          ch.onclose = () => { if (channel === ch) { channel = null; root.__gifosTransport = 'relay'; if (!hostGone && !tookOver) runningStatus(); } };
          ch.onmessage = (ev2) => { let mm; try { mm = JSON.parse(ev2.data); } catch (er) { return; } mm = defrag(mm, 'host'); if (mm) dispatch(mm); };
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

    setStatus('Connecting to host…');
    // Socket healed: re-sync the view and replay unanswered requests. The host
    // sees our rejoin (same peer id) and re-offers P2P on its own.
    ws.onopen = () => {
      if (tookOver || !remoteDb) return;
      remoteDb._replay();
      if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage({ ns: 'gifos', type: 'db-change', collection: '*' }, '*');
      mirror();
      announceClient();
    };
    ws.onstate = () => announceClient();
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      m = defrag(m, 'host'); if (!m) return; // fragmented app delivery / replies reassemble here
      if (m.t === 'joined') { myPeer = m.peer; if (!filesRef) setStatus('Connected · waiting for app…'); }
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
        hostIsBack();
        if (filesRef || tookOver) { runningStatus(); return; } // rejoin redelivery — already mounted
        appBytes = gif.b64decode(m.gif);
        gif.decode(appBytes).then((archive) => {
          if (tookOver || filesRef) return;
          if (!archive) { setStatus('Bad app from host.'); return; }
          filesRef = archive.files; manifestRef = gif.readManifest(archive) || { name: 'App' };
          document.title = (manifestRef.name || 'App') + ' — GifOS (client)';
          remoteDb = makeRemoteDb(transportSend);
          iframe = makeIframe(); mountEl.innerHTML = ''; mountEl.appendChild(iframe);
          mountApp(iframe, filesRef, manifestRef, remoteDb, appBytes);
          if (root.__gifosOnApp) root.__gifosOnApp(appBytes);
          root.__gifosTransport = (channel && channel.readyState === 'open') ? 'p2p' : 'relay';
          runningStatus();
          announceClient();
          mirror();
        });
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
            setStatus('Live (you took over) · ' + s.total + ' friend(s) here' + (s.p2p ? ' · ' + s.p2p + ' P2P direct' : ''));
          }, {
            selfPeer: myPeer,
            onDisplaced: () => {
              setStatus('A newer host holds the session — rejoining as a guest…');
              location.replace(buildJoinUrl('app', params.s, params.k, params.relay));
              location.reload(); // hash-only change — force the client-mode reboot
            },
          });
          // Remount the app against the local DB and wake the other clients.
          const fresh = makeIframe(); mountEl.innerHTML = ''; mountEl.appendChild(fresh);
          iframe = fresh;
          mountApp(fresh, filesRef, manifestRef, db, appBytes);
          ws2.send(JSON.stringify({ t: 'bcast', msg: { t: 'db-change', collection: '*' } }));
          setStatus(opts.auto ? 'The host vanished — you took over automatically · the session continues'
            : 'Live (you took over) · the session continues');
          return store.setState(fileId + '::session', { sid: params.s, token: params.k, relay: params.relay, epoch: claimEpoch })
            .then(() => ({ shareUrl: buildJoinUrl('app', params.s, params.k, params.relay), save: () => downloadSnapshot(appBytes, filesRef, manifestRef, db) }));
        })
      );
    }

    function saveToDesktop() {
      if (!appBytes) return Promise.reject(new Error('app not loaded yet'));
      return saveAppToDesktop(appBytes, manifestRef, lastDump);
    }

    return Promise.resolve({
      save: () => (filesRef && remoteDb ? downloadSnapshot(appBytes, filesRef, manifestRef, remoteDb) : Promise.resolve(null)),
      saveToDesktop,
      becomeHost,
    });
  }

  GifOS.runtime = { boot, bootClient, buildAppHtml, buildFolderHtml, norm };
})(typeof window !== 'undefined' ? window : globalThis);
