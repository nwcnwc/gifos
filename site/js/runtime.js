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
    css: 'text/css', json: 'application/json', txt: 'text/plain', md: 'text/markdown',
    markdown: 'text/markdown', svg: 'image/svg+xml',
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
  // SHA-256 of BYTES (net.sha256hex hashes a string); app-owner's verifier
  // binding hashes the raw public key, so the owned-link mint must too.
  const sha256hexOfBytes = (u8) => root.crypto.subtle.digest('SHA-256', u8).then((d) => Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join(''));

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
  function clientShim(gen, nonce) {
    return `(function(){
      var GEN = ${Number(gen) || 1}, NONCE = ${JSON.stringify(String(nonce || ''))};
      // Neuter WebRTC: CSP's 'webrtc' directive is not universally supported,
      // so hard-remove the constructors before app code runs. connect-src 'none'
      // already blocks fetch/XHR/WebSocket/EventSource/beacons; this closes the
      // one network primitive CSP can't reliably reach. frame-src/worker limits
      // mean the app can't obtain a fresh copy from a child context.
      ['RTCPeerConnection','webkitRTCPeerConnection','RTCDataChannel'].forEach(function(k){
        try { Object.defineProperty(window, k, { value: undefined, configurable: false, writable: false }); } catch(e){ try { window[k] = undefined; } catch(e2){} }
      });
      // THE DOCUMENT UNDER THE BRIDGE MAY NEVER CHANGE. Two ways it could:
      // 1. A sandboxed frame may always navigate ITSELF (the sandbox forbids
      //    navigating others; CSP has no self-navigation directive). The
      //    replacement document carries no CSP and no shim, yet it would keep
      //    this bridge, because contentWindow is stable across navigations.
      //    run.html's own frame-src refuses every non-about: target; this
      //    beacon covers the rest. pagehide fires BEFORE the replacement
      //    document exists, so the runtime freezes the bridge first and then
      //    re-mounts the app fresh (a reload still works — it boots again).
      // 2. A NESTED frame is a fresh window: frame-src 'none' does not reach
      //    about:srcdoc children, and their RTCPeerConnection is untouched by
      //    the deletion above. No app ships a nested frame, so any that
      //    appears is removed before it can load (the sweep runs as a
      //    microtask, ahead of the child's navigation task).
      var toOS = parent.postMessage.bind(parent);
      window.addEventListener('pagehide', function(){ try { toOS({ ns:'gifos', type:'unloading', gen: GEN, nonce: NONCE }, '*'); } catch(e){} }, true);
      try { toOS({ ns:'gifos', type:'hello', gen: GEN }, '*'); } catch(e){}
      (function(){
        var KILL = { IFRAME:1, FRAME:1, FENCEDFRAME:1, PORTAL:1, OBJECT:1, EMBED:1 };
        function sweep(n){
          if (!n || n.nodeType !== 1) return;
          if (KILL[n.tagName]) { try { n.remove(); } catch(e){} return; }
          if (n.querySelectorAll) n.querySelectorAll('iframe,frame,fencedframe,portal,object,embed').forEach(function(x){ try { x.remove(); } catch(e){} });
        }
        try {
          new MutationObserver(function(rs){ for (var i = 0; i < rs.length; i++) { var a = rs[i].addedNodes; for (var j = 0; j < a.length; j++) sweep(a[j]); } })
            .observe(document, { childList: true, subtree: true });
        } catch(e){}
      })();
      var pending = {}, subs = {}, backCbs = [];
      // onPart: an OPTIONAL callback kept on THIS side of the wall. A function
      // cannot cross postMessage, so the app hands it to rpc() and the runtime
      // sends back plain 'part' messages carrying the id — the callback is
      // looked up here and called. Used by streaming chat (gifos.ai.chat's
      // onDelta); the promise still resolves once, with the whole answer.
      function rpc(msg, onPart){ return new Promise(function(res, rej){
        var id = 'r'+Math.random().toString(36).slice(2);
        pending[id] = { res: res, rej: rej, part: typeof onPart === 'function' ? onPart : null };
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
        // A partial result for a call still in flight. Never resolves and never
        // rejects: a stream that dies mid-answer still lands on the reply.
        // Text parts are chat deltas; a 'shot' part is one camera-studio
        // capture, delivered the moment it is taken.
        if(d.type==='part' && pending[d.id] && pending[d.id].part){
          try { pending[d.id].part(d.shot !== undefined ? d.shot : (d.text || '')); } catch(err){}
        }
        if(d.type==='db-change'){
          if(d.collection==='*'){ Object.keys(subs).forEach(refresh); }
          else refresh(d.collection);
        }
        if(d.type==='back'){ backCbs.forEach(function(cb){ try { cb(); } catch(e){} }); }
        // Provider service plumbing (docs/providers.md): when this app is
        // mounted as a hidden provider service, the runtime forwards brokered
        // AI calls here as provider-request; the handler registered via
        // gifos.provider.serve answers, and the result crosses back as
        // provider-result. In a normal app mount these never arrive.
        if(d.type==='provider-request'){
          var h = provHandlers && provHandlers[d.role];
          var send = function(p){ parent.postMessage(Object.assign({ ns:'gifos', type:'provider-result', id:d.id }, p), '*'); };
          if (typeof h !== 'function') { send({ ok:false, error:'This provider does not serve "'+d.role+'".' }); return; }
          // ctx.progress(note, frac) — re-arms the OS's idle clock AND says what
          // is happening. The note is shown to the user by the OS, not by the
          // asking app: an on-device model can take minutes to warm up, and
          // every app that asks for AI would otherwise have to grow its own
          // "please wait" out of nothing. Both arguments are optional; a bare
          // progress() is still just a heartbeat.
          //
          // ctx.delta(text) — the ANSWER as it is written, one fragment at a
          // time. A provider that generates token by token (all three offline
          // LLMs do) had nowhere to put those tokens: they were accumulated
          // privately and handed over in one lump at the end, so an on-device
          // model that took six minutes showed nothing for six minutes. This is
          // the same fragment channel a streaming HTTP endpoint gets — it comes
          // out of the asking app's gifos.ai.chat onDelta, indistinguishable
          // from a cloud stream. Optional: a provider that never calls it is
          // exactly as correct as before, just silent until it finishes.
          var ctx = { progress: function(note, frac){ try { parent.postMessage({ ns:'gifos', type:'provider-progress', id:d.id,
            note: note == null ? '' : String(note).slice(0, 120),
            frac: (typeof frac === 'number' && isFinite(frac)) ? Math.max(0, Math.min(1, frac)) : null }, '*'); } catch(e){} },
            delta: function(text){ if (text == null || text === '') return;
              try { parent.postMessage({ ns:'gifos', type:'provider-delta', id:d.id, text: String(text) }, '*'); } catch(e){} } };
          Promise.resolve().then(function(){ return h(d.req || {}, ctx); })
            .then(function(result){ send({ ok:true, result:result }); })
            .catch(function(err){ send({ ok:false, error:String(err && err.message || err) }); });
        }
      });
      var provHandlers = null;
      // Android Chrome only lets the container's Back trap "stick" once the page
      // has real user activation, and the user touches the APP, not the frame
      // around it — those gestures never reach the parent. Ping the container on
      // interaction so it can arm the trap under fresh activation
      // (a same-origin gesture propagates activation to our parent too).
      //
      // NOT once-only, AND THAT IS THE POINT NOW. (No backticks in here: this
      // whole shim is a TEMPLATE LITERAL, and one in a comment ends it — the
      // file then fails to parse and every app mounts into nothing.)
      // DOM events do not cross a
      // document boundary at all, so a person playing an app on a phone touches
      // the screen a hundred times a minute and the page AROUND the app sees
      // exactly none of it. The container's parked-phone timer — three minutes
      // with no touch and no speech, which means nobody is holding this phone —
      // therefore fired on somebody in the middle of a game (measured
      // 2026-08-17: "😴 Phone looks parked" during a live deathmatch). One ping
      // per interaction was never about the count; it was about the FIRST one
      // arming the trap. A ping that repeats also re-arms a trap whose entry
      // has since been spent, which the once-only version could not do.
      //
      // Throttled to 20s: the clock upstairs is measured in minutes, so this is
      // a handful of postMessages an hour, not one per touch.
      var lastActivePing = 0;
      ['pointerdown','touchstart','keydown'].forEach(function(ev){
        window.addEventListener(ev, function(){
          var now = Date.now();
          if (now - lastActivePing < 20000) return;
          lastActivePing = now;
          try { parent.postMessage({ ns:'gifos', type:'uiactive' }, '*'); } catch(e){}
        }, { capture:true, passive:true });
      });
      // window.alert DOES NOTHING in an app frame. The sandbox carries no
      // allow-modals, so Chrome logs "Ignored call to 'alert()'" and returns
      // without showing anything. Ported apps lean on it as their only way to
      // say something went wrong or cannot be done — 35 call sites across 15
      // apps when this was written, most inside vendored engines nobody is
      // going to rewrite — and every one of those messages was invisible. A
      // person pressed a button, nothing happened, and the app had no way to
      // say why.
      //
      // So show it. The overlay lives in a SHADOW ROOT hung off
      // documentElement, not body: the app's own CSS cannot reach inside it,
      // and the app's own DOM does not change shape (a "body > *" selector or
      // a childNodes walk sees exactly what it saw before). It does not block
      // — nothing in a sandboxed frame can — but today's behaviour is already
      // "returns immediately", so no app's timing changes.
      //
      // window.confirm has the same problem and one extra constraint: its
      // contract is a SYNCHRONOUS boolean, so no dialog-and-await replacement
      // can honour it. Ignored, it returns FALSE, which means every action an
      // app guards with it is unreachable — a board that cannot be deleted, a
      // game that cannot be restarted, a plan that cannot be stopped.
      //
      // Answer it as a two-press confirm, which IS synchronous. The first call
      // shows the question and returns false; a second call, with the same
      // text and after a FRESH user gesture, returns true. Requiring a new
      // gesture is what makes it safe: code that loops over a list inside one
      // click can never talk itself into a yes, because the gesture counter
      // has not moved. A person pressing the same button twice gets exactly
      // what they asked for.
      //
      // prompt() is left alone. There is no way to invent a string
      // synchronously, and guessing one is worse than not answering.
      (function(){
        var host = null, box = null, hideTimer = 0;
        function ensure(){
          if (host && host.isConnected) return;
          host = document.createElement('gifos-alert');
          host.style.cssText = 'all:initial;position:fixed;inset:auto 0 0 0;z-index:2147483647';
          var root = host.attachShadow ? host.attachShadow({ mode:'closed' }) : host;
          box = document.createElement('div');
          box.setAttribute('role','alert');
          box.style.cssText = [
            'margin:0 auto 16px;max-width:min(34rem,calc(100vw - 24px));',
            'box-sizing:border-box;padding:12px 16px;border-radius:12px;',
            'background:#1b1b1f;color:#f4f4f5;border:1px solid #3f3f46;',
            'font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;',
            'box-shadow:0 12px 40px rgba(0,0,0,.5);text-align:center;',
            'white-space:pre-wrap;word-break:break-word;pointer-events:auto;cursor:pointer'
          ].join('');
          box.addEventListener('click', function(){ hide(); });
          root.appendChild(box);
          (document.documentElement || document.body).appendChild(host);
        }
        function hide(){ if (host && host.parentNode) host.parentNode.removeChild(host); host = null; box = null; }
        function show(text, ms){
          ensure();
          box.textContent = text;
          clearTimeout(hideTimer);
          hideTimer = setTimeout(hide, ms);
        }
        window.alert = function(msg){
          try { show(msg === undefined ? '' : String(msg), 6000); } catch(e){}
        };
        var gestures = 0;
        ['pointerdown','keydown','touchstart'].forEach(function(ev){
          window.addEventListener(ev, function(e){ if (e.isTrusted) gestures++; }, { capture:true, passive:true });
        });
        var armed = null;
        window.confirm = function(msg){
          var text = msg === undefined ? '' : String(msg);
          var now = Date.now();
          if (armed && armed.text === text && armed.gesture !== gestures && now - armed.at < 8000) {
            armed = null;
            try { hide(); } catch(e){}
            return true;
          }
          armed = { text: text, gesture: gestures, at: now };
          try { show(text + '\\n\\nPress again to confirm.', 8000); } catch(e){}
          return false;
        };
      })();
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
        // The bridge hands back the RAW BYTES and the decode happens here, so the
        // response behaves like a real one: .text()/.json() for APIs, and
        // .arrayBuffer()/.blob() for binary (map tiles, images, audio). Pair a
        // blob with URL.createObjectURL — the app CSP allows blob: for img/media.
        // Decoding lazily means a JSON call never touches the binary path, and a
        // tile fetch never builds a throwaway string.
        fetch: function(url, opts){ opts=opts||{};
          return rpc({type:'fetch',url:url,method:opts.method||'GET',headers:opts.headers||{},body:opts.body||null,proxy:!!opts.proxy})
            .then(function(r){
              var txt = null; // memoized: re-reading a Response is a convenience here, not an error
              function asText(){ if (txt === null) txt = new TextDecoder().decode(new Uint8Array(r.bytes)); return txt; }
              // Header names come from the Headers iterator, so they are lower-cased.
              var mime = (r.headers && r.headers['content-type']) || '';
              return { status:r.status, headers:r.headers, ok:r.status>=200&&r.status<300,
                json:function(){return Promise.resolve(JSON.parse(asText()));},
                text:function(){return Promise.resolve(asText());},
                arrayBuffer:function(){return Promise.resolve(r.bytes);},
                blob:function(){return Promise.resolve(new Blob([r.bytes], { type: mime }));} };
            });
        },
        save: function(){ return rpc({type:'save'}); },
        // Hash-pinned assets (gifos-assets.js): bytes the OS downloaded FOR
        // this app (required pins at install/boot, optional pins when this
        // call names them). Returns an ArrayBuffer. A miss after the OS has
        // tried names the fix rather than hanging.
        assets: function(path){ return rpc({type:'asset', path:path}).then(function(r){ return r.bytes; }); },
        info: function(){ return rpc({type:'info'}); },
        me: function(){ return rpc({type:'me'}); },
        // What the LINK that opened this app asked for — an object of the
        // arguments declared in this app's manifest "launch" block, or null if
        // the link said nothing (the ordinary case) or the person declined.
        // It RESOLVES LATE on purpose: the OS is showing the "this link would
        // like to…" sheet, and the answer arrives when they tap. So call it at
        // boot, and treat null as "open normally" — never wait for it before
        // drawing something.
        launch: function(){ return rpc({type:'launch'}); },
        setName: function(n){ return rpc({type:'setName', name:n}); },
        // APP -> APP HANDOFF (manifest "handoff", docs/app-handoff.md). One
        // structured document, of a kind GifOS itself names, put on a shelf
        // the OS owns so another app can pick it up. Neither app can read the
        // other's storage — that has never been possible and still isn't.
        //   offer(kind, doc) -> { ok:true } | { ok:false, reason:'declined' }
        //     raises a sheet showing the document before anything is written.
        //   take(kind)       -> { kind, doc, from:{appId,name}, at } | null
        // Declare the kinds you use: "handoff": { "offers":[], "takes":[] }.
        handoff: {
          offer: function(kind, doc){ return rpc({type:'handoffOffer', kind:kind, doc:doc}); },
          take:  function(kind){ return rpc({type:'handoffTake', kind:kind}); }
        },
        // Brokered device capture. The app never touches the camera/mic: it asks
        // the GifOS computer for a CLIP, which records it behind a visible
        // indicator and hands back { bytes:ArrayBuffer, mime, durationMs }.
        // Needs the matching manifest capability (microphone / camera).
        recordAudio: function(opts){ return rpc(Object.assign({type:'capture',media:'audio'}, opts||{})); },
        recordVideo: function(opts){ return rpc(Object.assign({type:'capture',media:'video'}, opts||{})); },
        takePhoto:   function(opts){ return rpc(Object.assign({type:'capture',media:'photo'}, opts||{})); },
        // Full-screen camera studio in the trusted parent (never a live stream
        // in the sandbox). cameraInfo probes devices then stops the tracks.
        // A studio session can hold MANY captures: pass onShot to receive each
        // one the moment it is taken. The promise still settles once, with the
        // last capture (or rejects "Capture cancelled." if there were none).
        cameraInfo: function(){ return rpc({type:'cameraInfo'}); },
        camera: function(opts, onShot){ opts=opts||{};
          return rpc({type:'capture',studio:true, mode:opts.mode, facing:opts.facing, filter:opts.filter, timer:opts.timer, aspect:opts.aspect, grid:opts.grid, audio:opts.audio, maxSeconds:opts.maxSeconds},
            typeof onShot==='function'?onShot:null); },
        // Deposit bytes into the seeded My Media library (and this app's roll
        // if it declared one). The app cannot name another icon's db.
        // open() asks the OS to switch this tab to the My Media app itself —
        // solo mounts only, so a shared room is never navigated away.
        library: { put: function(item){ item=item||{};
          return rpc({type:'libraryPut', bytes:item.bytes, mime:item.mime, name:item.name, mediaType:item.type, category:item.category, thumb:item.thumb}); },
          open: function(){ return rpc({type:'libraryOpen'}); } },
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
          // chat(o) — o.onDelta(piece) is OPTIONAL. Pass it and the computer
          // streams the answer token by token as it arrives; the promise still
          // resolves once with the complete { text }. An endpoint that ignores
          // stream:true, or a Provider app (which answers in one piece), simply
          // never calls onDelta — so an app that renders deltas AND writes
          // r.text at the end works either way. Nothing else changes.
          chat:   function(o){ o = o || {}; var onDelta = o.onDelta;
                    var msg = Object.assign({type:'ai',op:'chat'}, o); delete msg.onDelta;
                    if (typeof onDelta === 'function') msg.stream = true;
                    return rpc(msg, onDelta); },
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
        // Provider apps (manifest "provides", docs/providers.md): register the
        // role handlers this app serves when the OS mounts it as a service.
        // Keyed by AI role ('tts', 'smartest', …); each handler takes the
        // request and returns the same shape the endpoint broker would
        // ({ bytes, mime } for tts, { text } for chat/stt, …). Calling this in
        // a normal (visible) mount is harmless — requests only ever arrive in
        // a service mount.
        provider: {
          serve: function(handlers){ provHandlers = handlers || {};
            try { parent.postMessage({ ns:'gifos', type:'provider-ready', roles:Object.keys(provHandlers) }, '*'); } catch(e){} }
        },
        // The container traps the browser Back button so an app is never blown
        // away by a reflex press. By default the press is swallowed; register a
        // callback to make Back meaningful (close a modal, back out a screen).
        onBack: function(cb){ if (typeof cb === 'function') backCbs.push(cb); },
        // Origin-wide storage usage/quota in bytes, so an app can warn a user
        // before they fill the computer up. Shared across all apps on this
        // origin (they live in one IndexedDB), not per-app.
        storage: function(){ return rpc({type:'storage'}); },
        // Payments (capabilities.pay, docs/payments.md). charge() asks the OS,
        // which shows ITS OWN sheet — verified author, amount, reason — and
        // moves the money only if the human approves. Resolves with a receipt;
        // REJECTS with "DECLINED_BY_USER" when they say no, which is a normal
        // outcome an app must handle, not an error to report. amount is a
        // decimal integer STRING of USDC base units ($1 = '1000000').
        // entitled(sku) answers from the OS's own record of what was bought on
        // THIS computer — the app must not keep its own copy in gifos.db,
        // because app state travels inside the shared GIF and a purchase must
        // not travel with it.
        charge: function(o){ return rpc(Object.assign({type:'charge'}, o||{})); },
        entitled: function(sku){ return rpc({type:'entitled', sku:sku}); },
        // The LICENSE id behind a purchased sku: the receipt's transaction id,
        // stable, unique per purchase, and the same on every computer this
        // receipt is restored to. Anchor saves / room identity / a server
        // account to it and a shared receipt becomes a shared IDENTITY — the
        // buyer's own — rather than a free copy. null until purchased.
        license: function(sku){ return rpc({type:'license', sku:sku}); }
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
    // about: — and ONLY about: — so the OS can pin the app's base to
    // about:srcdoc (see THE APP'S BASE URL IS ITS OWN DOCUMENT below). 'none'
    // here blocks the OS's own <base> as readily as an app's, and that is the
    // policy that kept every app based on run.html. A scheme-source cannot
    // name a network origin, so an app still cannot repoint its base at one.
    "base-uri about:",
    // (WebRTC is neutered in the shim instead of via a CSP 'webrtc' directive,
    //  which is not supported across all browsers.)
  ].join('; ');

  // The "wasm hatch": an app that declares capabilities.wasm gets exactly
  // three relaxations and nothing more — 'wasm-unsafe-eval' so it can
  // instantiate a WebAssembly module (Chrome refuses WASM under a bare
  // 'unsafe-inline' script-src), worker-src blob: so it can spin up the Web
  // Worker that heavy WASM engines (a chess engine, an LLM) run on to keep
  // the UI alive, and connect-src blob: data: so emscripten-style loaders
  // can fetch() the wasm binary / worker code the app minted from its OWN
  // bytes as a blob:/data: URL (wllama does exactly this). Crucially the
  // NETWORK stays unreachable: blob: and data: fetches carry no origin and
  // touch no wire — this is same-process plumbing, not connectivity. The
  // hatch is gated by the manifest and surfaced in the abilities
  // acknowledgement, so a user always sees that an app runs a compiled
  // engine before it does.
  const APP_CSP_WASM = APP_CSP
    .replace("script-src 'unsafe-inline'", "script-src 'unsafe-inline' 'wasm-unsafe-eval'")
    .replace("connect-src 'none'", 'connect-src blob: data:')
    .replace("object-src 'none'", "worker-src blob:; object-src 'none'");
  const appCsp = (manifest) => hasCap(manifest, 'wasm') ? APP_CSP_WASM : APP_CSP;

  /*
   * THE APP'S BASE URL IS ITS OWN DOCUMENT — NEVER THE OS PAGE'S.
   *
   * An app is mounted as `srcdoc`, and a srcdoc document INHERITS ITS BASE URL
   * FROM THE PARENT. Without this tag the base URL of every app on this
   * computer is run.html's own address, which is wrong twice over:
   *
   *   1. IT IS A TRAPDOOR OUT OF THE APP. A RELATIVE navigation resolves
   *      against the base, so `location.replace('#x')` or a click on a plain
   *      `<a href="#section">` walks the frame off about:srcdoc and onto
   *      run.html — which, finding no #id= in the hash it just landed on,
   *      opens THE MEETING LOBBY. Regexper did exactly that on every launch
   *      (its boot line seeded the example regex with location.replace), and
   *      bip39's "Read more" and piskel's "+" did it on a click. Assigning
   *      location.hash was never affected: that edits this document's own
   *      fragment, and is why the same apps' other hash code was fine.
   *   2. IT HANDS THE APP THE OS'S URL. document.baseURI is readable from
   *      inside the sandbox, and in an app room run.html's hash carries the
   *      room's link secret (#j=<code>, or #s=<room>.<verifier>&k=<lsec>).
   *      An app has no business reading the key to the room it is running in.
   *
   * about:srcdoc is what the frame's own URL already is, so fragment links
   * keep working (they scroll and fire hashchange, resolved same-document),
   * SVG `<use href="#id">` and CSS url(#filter) resolve same-document instead
   * of against a foreign page, and anything else relative simply fails to
   * resolve — which is honest, because a sandboxed app has no network and
   * every one of its own files is already inlined as a data: URL.
   *
   * Guarded by test/browser/e2e-app-frame-escape.js, which boots every built
   * App GIF and clicks every in-page anchor.
   */
  const APP_BASE_TAG = '<base href="about:srcdoc">';
  const baseTag = (doc) => { const b = doc.createElement('base'); b.setAttribute('href', 'about:srcdoc'); return b; };

  // ---- build a runnable, self-contained HTML doc from the archive ----------
  function buildAppHtml(files, manifest, gen, nonce) {
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
    // alike, so the policy is always enforced. The BASE rides second and the
    // shim third, so window.gifos exists before any app code runs.
    if (typeof DOMParser === 'function') {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const meta = doc.createElement('meta');
      meta.setAttribute('http-equiv', 'Content-Security-Policy');
      meta.setAttribute('content', CSP);
      const shim = doc.createElement('script');
      shim.textContent = clientShim(gen, nonce);
      doc.head.insertBefore(shim, doc.head.firstChild);
      doc.head.insertBefore(baseTag(doc), doc.head.firstChild);
      doc.head.insertBefore(meta, doc.head.firstChild);
      if (withAgent) { const ag = doc.createElement('script'); ag.textContent = agentBootstrap(); doc.body.appendChild(ag); }
      return '<!doctype html>' + doc.documentElement.outerHTML;
    }
    // Non-DOM fallback (tooling): best-effort inject into <head> if present.
    const head = '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">' +
      APP_BASE_TAG + '<script>' + clientShim(gen, nonce) + '</script>';
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
  // The body may be ANY content type: the response crosses back as raw bytes and
  // the app picks .text()/.json() or .arrayBuffer()/.blob(). What an app may
  // reach is decided entirely by the declared-and-user-approved host allowlist —
  // never by what the bytes happen to contain.
  const FETCH_MAX_BYTES = 8 * 1024 * 1024; // 8 MB response ceiling
  // Read a response body up to `max` bytes and refuse past it — WHILE it
  // streams, not after arrayBuffer() has already pulled the whole thing into
  // this tab. A Content-Length beyond the cap is refused before a byte is read.
  function readBodyCapped(resp, max) {
    const cl = Number(resp.headers.get('content-length'));
    if (cl > max) { try { resp.body && resp.body.cancel(); } catch (e) {} return Promise.reject(new Error('response too large')); }
    if (!resp.body || typeof resp.body.getReader !== 'function') {
      return resp.arrayBuffer().then((buf) => { if (buf.byteLength > max) throw new Error('response too large'); return buf; });
    }
    const reader = resp.body.getReader();
    const chunks = []; let total = 0;
    return (function pump() {
      return reader.read().then(({ done, value }) => {
        if (done) {
          const out = new Uint8Array(total); let o = 0;
          for (const c of chunks) { out.set(c, o); o += c.length; }
          return out.buffer;
        }
        total += value.length;
        if (total > max) { try { reader.cancel(); } catch (e) {} throw new Error('response too large'); }
        chunks.push(value);
        return pump();
      });
    })();
  }
  // A URL's hostname as the denylist and allowlist see it: lower-case with
  // trailing dots stripped (the URL parser keeps "gifos.app." verbatim, and
  // DNS and the certificate check treat it as gifos.app).
  function canonHost(h) { return String(h == null ? '' : h).toLowerCase().replace(/\.+$/, ''); }
  function firstPartyHost(host) {
    host = canonHost(host);
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
    const x = manifest && manifest.capabilities && manifest.capabilities.network;
    // One string is one host, not a list of its characters; anything that
    // is not an array or a string declares nothing.
    const raw = Array.isArray(x) ? x : (typeof x === 'string' ? [x] : []);
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
    const fingerprint = () => declared.slice().sort().join('\x01');
    const persist = () => (key ? store.setState(key, { denied: Object.keys(denied), ack }) : Promise.resolve());
    return {
      declared: () => declared.slice(),
      hasNetwork: () => declared.length > 0,
      unsafe: () => declared.indexOf('*') >= 0 && !denied['*'],
      list: () => declared.map((h) => ({ host: h, allowed: !denied[h] })),
      allow: (host) => { host = canonHost(host); return declared.some((p) => !denied[p] && (p === '*' || host === p || host.endsWith('.' + p))); },
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
        return readBodyCapped(resp, FETCH_MAX_BYTES).then((buf) => {
          // Hand back the BYTES, not a decoded string. structuredClone carries an
          // ArrayBuffer across postMessage natively (the same way brokered capture
          // and gifos.api's as:'bytes' already do), and the shim decodes on demand.
          // Decoding here instead would run every response through a UTF-8
          // TextDecoder, which mangles any non-text body beyond recovery — an
          // accident of reusing the GIF codec's text helper, never a boundary.
          // Nothing about the trust model lives in the body's shape: the gate is
          // the manifest host allowlist the user approves, plus https-only, the
          // first-party refusal, credentials:'omit', the post-redirect re-check,
          // and the size cap above — all of which are enforced before this point.
          return { status: resp.status, headers: Object.fromEntries(resp.headers.entries()), bytes: buf };
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
    for (const p in files) if (!p.startsWith('.state/') && !p.startsWith('.lock/')) out[p] = files[p];
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
    for (const p in files) {
      if (p.startsWith('.state/') || p.startsWith('.lock/')) hadState = true;
      else clean[p] = files[p];
    }
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
  //
  // Two overlays: takePhoto/recordVideo keep the small 380px dialog. gifos.camera()
  // opens the full-viewport studio (camera-studio.js) — still this origin, still
  // unfakeable, still bytes-only back to the GIF.
  const capEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CAP_FOR = { audio: 'microphone', video: 'camera', photo: 'camera' };
  const hasCap = (manifest, cap) => !!(manifest && manifest.capabilities && manifest.capabilities[cap]);
  // A capability the manifest declares can still be turned OFF by the user, per
  // app, from run.html's Abilities panel — stored as a list of vetoed cap names
  // under gifos_capoff_<appId>. The brokers below honour it, so unchecking "Use
  // your AI" (or mic/camera/API/agent/extra files) actually stops the app from using it.
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
    // Audio keeps the page READABLE: a mic capture is often a prompt the user
    // is reading aloud (a recording studio, a karaoke line), and a 62% dim
    // over the very text being read defeats the capture. The indicator box —
    // the unfakeable part — stays; only the darkness goes. Camera kinds keep
    // the full dim: the preview is the thing to look at there.
    bg.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,' + (withPreview ? '.62' : '.15') + ');font:15px system-ui;color:#fff;padding:16px;box-sizing:border-box';
    const box = doc.createElement('div');
    box.style.cssText = 'background:#141018;border:1px solid #ff5c5c;border-radius:14px;padding:16px 18px;max-width:' + (withPreview ? '380px' : '320px') + ';width:100%;text-align:center;box-sizing:border-box;box-shadow:0 12px 40px rgba(0,0,0,.5)';
    const noun = kind === 'photo' ? 'a photo' : kind;
    const dev = kind === 'audio' ? 'mic' : 'camera';
    box.innerHTML =
      '<div id="gc-grip" style="color:#8a8a9a;font-size:12px;letter-spacing:2px;margin:-6px 0 6px;cursor:grab;user-select:none;touch-action:none">⠿ drag to move</div>'
      + (withPreview
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
    // The dialog can be MOVED OUT OF THE WAY: it lands over the middle of the
    // screen, which is often exactly where the text being recorded is. Drag
    // by the grip or any non-interactive part of the box; pointer events so
    // one path serves mouse and touch alike. The position is REMEMBERED per
    // capture kind (a 42-item recording session opens this dialog 42 times —
    // parking it once has to be enough), clamped on restore so a spot chosen
    // on a big screen cannot strand it off a small one.
    (function draggable() {
      const POS_KEY = 'gifos_capture_pos';
      const clamp = (x, y) => {
        // keep a graspable corner on-screen
        const w = root.innerWidth || 320, h = root.innerHeight || 480;
        return [Math.max(-w / 2 + 40, Math.min(w / 2 - 40, x)),
                Math.max(-h / 2 + 40, Math.min(h / 2 - 40, y))];
      };
      let dx = 0, dy = 0;
      try {
        const saved = JSON.parse(root.localStorage.getItem(POS_KEY) || '{}')[kind];
        if (saved) { [dx, dy] = clamp(saved[0] || 0, saved[1] || 0); }
      } catch (e) { /* a bad value just means centred */ }
      if (dx || dy) box.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      let sx = 0, sy = 0, bx = 0, by = 0, dragging = false;
      const move = (e) => {
        if (!dragging) return;
        [dx, dy] = clamp(bx + (e.clientX - sx), by + (e.clientY - sy));
        box.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      };
      box.addEventListener('pointerdown', (e) => {
        const t = e.target;
        if (t && (t.closest && t.closest('button,video,a,input'))) return;
        dragging = true; sx = e.clientX; sy = e.clientY; bx = dx; by = dy;
        try { box.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
      });
      box.addEventListener('pointermove', move);
      const end = () => {
        if (!dragging) return;
        dragging = false;
        try {
          const all = JSON.parse(root.localStorage.getItem(POS_KEY) || '{}') || {};
          all[kind] = [Math.round(dx), Math.round(dy)];
          root.localStorage.setItem(POS_KEY, JSON.stringify(all));
        } catch (e) { /* private mode: it still moves, just forgets */ }
      };
      box.addEventListener('pointerup', end);
      box.addEventListener('pointercancel', end);
    })();
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
  let captureBusy = false; // a brokered photo/audio/video capture is open
  function brokerCapture(manifest, d, onShot) {
    if (d && d.studio) {
      const CS = GifOS.cameraStudio;
      if (!CS || !CS.open) return Promise.reject(new Error('Camera studio is not available.'));
      if (!hasCap(manifest, 'camera')) return Promise.reject(new Error('This app did not declare the "camera" capability.'));
      if (capDisabled(manifest, 'camera')) return Promise.reject(new Error(CAP_OFF_MSG('the camera')));
      const nav = root.navigator;
      if (!(nav && nav.mediaDevices && nav.mediaDevices.getUserMedia)) return Promise.reject(new Error('No camera available here.'));
      const hasMic = hasCap(manifest, 'microphone') && !capDisabled(manifest, 'microphone');
      const label = manifest.name || manifest.appId || 'Camera';
      return CS.open(Object.assign({}, d, { label: label, audio: d.audio !== false && hasMic }), { hasMic: hasMic, onShot: onShot })
        .catch((err) => { throw new Error(err && err.name === 'NotAllowedError' ? 'Permission to use the camera was denied.' : (err && err.message) || String(err)); });
    }
    // One capture at a time: each call would otherwise open another overlay
    // and another device stream, stacking dialogs a user can only dismiss
    // one by one.
    if (captureBusy) return Promise.reject(new Error('A capture is already open.'));
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
        captureBusy = true;
        let done = false, ov = null, autoT = null, rec = null, stream = stream0, chunks = [], startMs = 0, flipping = false;
        const stopTracks = (s) => { try { (s || stream).getTracks().forEach((t) => t.stop()); } catch (e) {} };
        const cleanup = () => { captureBusy = false; if (autoT) clearTimeout(autoT); stopTracks(); if (ov) ov.close(); };
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
          // The sheet promises a photo "only when you tap"; a dialog nobody
          // answered in a minute is CANCELLED, never snapped on their behalf.
          autoT = setTimeout(() => { if (!done) { done = true; cleanup(); reject(new Error('Capture cancelled.')); } }, 60000);
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

  const CAMERA_INFO_NO = (reason) => ({
    ok: false, reason: reason || 'No camera available here.',
    cameras: [], count: 0, facingModes: [], torch: false, zoom: null,
    focus: false, exposure: false, maxWidth: 0, maxHeight: 0, maxFrameRate: 0,
    video: false, mimeVideo: '', mimeAudio: '', highFps: false,
  });
  function brokerCameraInfo(manifest) {
    if (!hasCap(manifest, 'camera')) return Promise.reject(new Error('This app did not declare the "camera" capability.'));
    if (capDisabled(manifest, 'camera')) return Promise.resolve(CAMERA_INFO_NO(CAP_OFF_MSG('the camera')));
    const CS = GifOS.cameraStudio;
    if (!CS || !CS.probe) return Promise.resolve(CAMERA_INFO_NO('Camera studio is not available.'));
    return CS.probe().then((info) => info || CAMERA_INFO_NO());
  }

  const LIB_MAX = 25 * 1024 * 1024;
  function asU8(bytes) {
    if (bytes instanceof Uint8Array) return bytes;
    if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
    if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return null;
  }
  function libTypeOf(mime) {
    mime = String(mime || '');
    return mime.indexOf('image/') === 0 ? 'image' : mime.indexOf('audio/') === 0 ? 'audio' : mime.indexOf('video/') === 0 ? 'video' : '';
  }
  function libDownscale(src, w, h) {
    if (!w || !h) return '';
    const max = 280, sc = Math.min(1, max / Math.max(w, h));
    const c = root.document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
    try { c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.7); }
    catch (e) { return ''; }
  }
  function libThumb(bytes, mime, type) {
    return new Promise((resolve) => {
      const blob = new Blob([bytes], { type: mime || '' });
      const url = URL.createObjectURL(blob);
      if (type === 'image') {
        const img = new Image();
        img.onload = () => { resolve(libDownscale(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(url); };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
        img.src = url;
        return;
      }
      if (type === 'video') {
        const v = root.document.createElement('video');
        v.muted = true; v.playsInline = true;
        let done = false;
        const fin = () => { if (done) return; done = true; resolve(libDownscale(v, v.videoWidth, v.videoHeight)); URL.revokeObjectURL(url); };
        v.onloadeddata = () => { try { v.currentTime = Math.min(0.4, (v.duration || 1) / 3); } catch (e) { fin(); } };
        v.onseeked = fin;
        v.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
        setTimeout(fin, 2500);
        v.src = url;
        return;
      }
      URL.revokeObjectURL(url);
      resolve('');
    });
  }
  function notifyAppDb(fileId, collection) {
    try {
      const ch = new root.BroadcastChannel(store.appChannel(fileId));
      ch.postMessage({ collection: collection });
      ch.close();
    } catch (e) {}
  }
  async function findMyMediaFileId() {
    const files = await store.allFiles();
    const items = await store.allItems();
    const byId = {};
    for (let i = 0; i < files.length; i++) byId[files[i].id] = files[i];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || it.parent === 'sys_trash') continue;
      const f = byId[it.fileId];
      if (f && f.isApp && f.isDefault && f.appId === 'mymedia') return f.id;
    }
    return null;
  }
  const libPutLog = new Map(); // mountFileId -> timestamps of recent library saves
  async function brokerLibraryPut(manifest, mountFileId, d, emit) {
    const bytes = asU8(d && d.bytes);
    if (!bytes || !bytes.length) throw new Error('Nothing to save.');
    if (bytes.length > LIB_MAX) throw new Error('That file is too big (max 25 MB).');
    const mime = String((d && d.mime) || 'application/octet-stream');
    const type = (d && d.mediaType) || libTypeOf(mime);
    if (type !== 'image' && type !== 'video' && type !== 'audio') throw new Error('Only images, audio and video can be added.');
    // Bounded, like every other app string that lands in a trusted store:
    // a name and a category are labels, and a thumb is a small data: image
    // or it is regenerated here — never a 100 MB string riding in a record
    // the library has to read to paint.
    const name = String((d && d.name) || type).slice(0, 120);
    const category = String((d && d.category) || 'Camera').slice(0, 40);
    const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    let thumb = (d && typeof d.thumb === 'string' && /^data:image\//.test(d.thumb) && d.thumb.length <= 65536) ? d.thumb : '';
    if (!thumb) {
      try { thumb = await libThumb(bytes, mime, type); } catch (e) { thumb = ''; }
    }
    // A loop that files entries by the thousand fills the origin's quota with
    // things the user then deletes one by one: sixty a minute per app is
    // beyond any camera and under any flood.
    const lp = libPutLog.get(mountFileId || '?') || [];
    const nowMs = Date.now();
    while (lp.length && nowMs - lp[0] > 60000) lp.shift();
    if (lp.length >= 60) throw new Error('Too many library saves — try again in a minute.');
    lp.push(nowMs); libPutLog.set(mountFileId || '?', lp);
    const mediaRec = { id: id, name: name, type: type, mime: mime, category: category, size: bytes.length, at: Date.now(), thumb: thumb };
    const blobRec = { id: id, bytes: bytes };
    let myMedia = false;
    let missing = null;
    const mmId = await findMyMediaFileId();
    if (mmId) {
      await store.appAdd(mmId, 'blobs', blobRec);
      await store.appAdd(mmId, 'media', mediaRec);
      notifyAppDb(mmId, 'blobs');
      notifyAppDb(mmId, 'media');
      myMedia = true;
    } else {
      missing = "My Media isn't on this computer";
    }
    const hasRoll = !!(manifest && manifest.data && manifest.data.roll);
    if (hasRoll && mountFileId) {
      const roll = Object.assign({}, mediaRec, { kind: type === 'video' ? 'video' : (type === 'audio' ? 'audio' : 'image') });
      if (!myMedia) roll.bytes = bytes;
      await store.appAdd(mountFileId, 'roll', roll);
      notifyAppDb(mountFileId, 'roll');
      if (typeof emit === 'function') emit('roll');
    } else if (!myMedia) {
      throw new Error(missing);
    }
    return { id: id, myMedia: myMedia, missing: missing, thumb: thumb };
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
  // ---- streaming chat: SSE in, deltas out ----------------------------------
  // OpenAI-shaped streaming is server-sent events whose data: lines each carry
  // one choices[0].delta.content fragment (plus a final "[DONE]"). Two shapes
  // are tolerated on purpose — delta.content for a real stream, message.content
  // for a server that answers a stream request with one complete chunk.
  function chatPiece(payload) {
    let j; try { j = JSON.parse(payload); } catch (e) { return ''; }
    const ch = (j.choices && j.choices[0]) || {};
    const p = (ch.delta && ch.delta.content) || (ch.message && ch.message.content) || '';
    return typeof p === 'string' ? p : '';
  }
  function sseLines(buf, onPiece) { // consumes whole lines, returns the remainder
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '').trim();
      buf = buf.slice(i + 1);
      if (!line || line.charAt(0) === ':' || line.slice(0, 5) !== 'data:') continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      const piece = chatPiece(payload);
      if (piece) onPiece(piece);
    }
    return buf;
  }
  // Reads the body incrementally and reports what it turned out to be:
  // { text, streamed, raw }. `raw` is kept ONLY while nothing has streamed yet
  // — a body that never yields a single SSE fragment is not a stream at all,
  // and the caller re-reads those same bytes as one plain JSON answer.
  function readChatStream(reader, emit) {
    const dec = new TextDecoder();
    let buf = '', text = '', raw = '', streamed = false;
    const take = (piece) => { streamed = true; text += piece; try { emit(piece); } catch (e) {} };
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) { sseLines(buf + '\n', take); return; }
      const chunk = dec.decode(value, { stream: true });
      if (!streamed) raw += chunk;
      buf = sseLines(buf + chunk, take);
      return pump();
    });
    const out = () => ({ text: text, streamed: streamed, raw: raw });
    // A stream that dies mid-answer keeps what already arrived: the app has
    // already PAINTED those tokens, so throwing here would blank a visible
    // answer. Half an answer, honestly returned, beats an error over the top.
    return pump().then(out, out);
  }
  // A body we asked to stream but got in one piece: plain JSON, or an SSE
  // transcript we could not read incrementally. Either way, one final text.
  function parseChatBody(t) {
    try {
      const j = JSON.parse(t);
      return { text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '', raw: j };
    } catch (e) {
      let text = '';
      sseLines(String(t || '') + '\n', (piece) => { text += piece; });
      return { text, raw: null };
    }
  }

  // emit(piece) — set when the asking app passed an onDelta to gifos.ai.chat.
  // Optional by construction: every caller that does not want a stream passes
  // nothing and gets exactly the old single-shot behaviour.
  function brokerAI(manifest, d, emit) {
    if (!hasCap(manifest, 'ai')) return Promise.reject(new Error('This app did not declare the "ai" capability.'));
    if (capDisabled(manifest, 'ai')) return Promise.reject(new Error(CAP_OFF_MSG('AI')));
    const cfg = aiConfig();
    // A role counts as available whether an endpoint or a provider app serves it.
    if (d.op === 'models') return Promise.resolve({ available: Object.keys(cfg).filter((k) => cfg[k] && (cfg[k].url || cfg[k].app)) });
    const role = d.op === 'chat' ? (d.model === 'smartest' ? 'smartest' : 'cheapest') : d.op;
    if (!aiAllowed(manifest, role)) return Promise.reject(new Error('This app did not declare the "' + role + '" AI type in its manifest (capabilities.ai).'));
    const c = cfg[role];
    if (!c || (!c.url && !c.app)) { showSystemSetup({ kind: 'ai', role: role, hint: d.hint }); return Promise.reject(new Error('NOT_CONFIGURED:ai:' + role)); }
    // Served by an installed Provider app (docs/providers.md) — the guard,
    // hidden mount and request shape all live in providerCall/providerReq.
    // A chat the app wanted streamed streams here too: the provider's ctx.delta
    // fragments ride the same channel a cloud endpoint's SSE frames do.
    if (c.app) {
      // `streamed` reports what ACTUALLY happened, not what was asked for: a
      // provider that never calls ctx.delta answers in one piece and says so.
      let streamed = false;
      const relay = (d.op === 'chat' && d.stream && emit) ? (t) => { streamed = true; emit(t); } : null;
      return providerCall(c, role, providerReq(role, d.op, d), relay)
        .then((out) => (d.op === 'chat' && out && typeof out === 'object')
          ? Object.assign({}, out, { streamed: streamed }) : out);
    }
    const url = aiEndpoint(c, d.op);
    const auth = c.key ? { Authorization: 'Bearer ' + c.key } : {};
    const asError = (r) => r.text().then((t) => { throw new Error('AI error ' + r.status + (t ? ': ' + t.slice(0, 300) : '')); });

    if (d.op === 'chat') {
      const wantStream = !!(d.stream && emit);
      const body = { model: c.model || d.modelName || 'gpt-4o-mini', messages: d.messages || [{ role: 'user', content: String(d.prompt || '') }], stream: wantStream };
      if (d.temperature != null) body.temperature = d.temperature;
      if (d.maxTokens != null) body.max_tokens = d.maxTokens;
      const post = root.fetch(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth), body: JSON.stringify(body) });
      if (!wantStream) {
        return post.then((r) => r.ok ? r.json() : asError(r))
          .then((j) => ({ text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '', raw: j, streamed: false }));
      }
      return post.then((r) => {
        if (!r.ok) return asError(r);
        // NEVER decide by Content-Type. Plenty of OpenAI-shaped gateways answer
        // stream:true with real server-sent events but label them
        // application/json; sniffing the header buffered those whole and made
        // the answer land in one lump at the end — indistinguishable, from the
        // outside, from "this build does not stream". So read the body
        // incrementally ALWAYS. An endpoint that genuinely ignores stream:true
        // yields no SSE fragment at all, and its bytes are then parsed as the
        // one plain JSON answer they are — the app's onDelta simply never
        // fires, which is what "degrades honestly" means here.
        if (!r.body || !r.body.getReader) {
          return r.text().then((t) => {
            const j = parseChatBody(t);
            return { text: j.text, raw: j.raw, streamed: false };
          });
        }
        return readChatStream(r.body.getReader(), emit).then((s) => {
          if (s.streamed) return { text: s.text, streamed: true };
          const j = parseChatBody(s.raw);
          return { text: j.text, raw: j.raw, streamed: false };
        });
      });
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

  // ---- Provider apps: an installed app SERVES an AI role -------------------
  // docs/providers.md. Settings may assign an AI role to an installed app
  // instead of an endpoint: gifos_ai_config[role] = { app:<fileId>, appId,
  // appName }. The provider runs as a HIDDEN sandboxed iframe inside THIS
  // consumer tab (per fileId, lazily, cached for the tab's life) — same
  // buildAppHtml pipeline, same opaque origin, no db/fetch/capture: a pure
  // request→response engine. Three refusals guard the mount, in order:
  //   1. the manifest must list the role under `provides.ai`;
  //   2. THE HARD RULE — a provider may not declare capabilities.network or
  //      capabilities.api. Every consumer's prompts flow into this sandbox,
  //      and connect-src 'none' is what makes that safe to promise; a
  //      networked provider would be an exfiltration machine, so it is
  //      refused mechanically, not consented to.
  //   3. recognition is a PLACE — the icon must sit DIRECTLY in the desktop's
  //      Providers folder (sys_providers). Outside it the desktop paints the
  //      red ✕ and this broker refuses, so the folder is the one honest
  //      answer to "what code answers my apps' AI calls?".
  const PROVIDER_BOOT_MS = 30000;   // engine load (a WASM voice/model takes a while)
  const PROVIDER_CALL_MS = 180000;  // per request; big models are slow, but not forever
  const provArchives = new Map();   // fileId -> Promise<{files, manifest} | null>
  const providerServices = new Map(); // fileId -> Promise<{ call }>
  function providesRoles(manifest) {
    const p = manifest && manifest.provides && manifest.provides.ai;
    return Array.isArray(p) ? p.filter(Boolean).map(String) : [];
  }
  function providerNetworky(manifest) {
    const caps = (manifest && manifest.capabilities) || {};
    const some = (v) => Array.isArray(v) ? v.length > 0 : !!v;
    return some(caps.network) || some(caps.api);
  }
  function providerArchive(fileId) {
    if (!provArchives.has(fileId)) {
      provArchives.set(fileId, store.getFile(fileId).then((rec) => {
        if (!rec || !rec.bytes) return null;
        const bytes = rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes);
        return gif.decode(bytes).then((arc) => arc ? { files: arc.files, manifest: gif.readManifest(arc) || {} } : null);
      }).catch(() => null));
    }
    return provArchives.get(fileId);
  }
  function providerService(fileId, files, manifest) {
    if (providerServices.has(fileId)) return providerServices.get(fileId);
    const label = manifest.name || manifest.appId || 'The provider app';
    const p = new Promise((resolve, reject) => {
      const doc = root.document;
      if (!doc || !doc.body) { reject(new Error('No page to run the provider in.')); return; }
      const iframe = makeIframe();
      // Hidden, not display:none — some engines size a canvas/context at boot.
      iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;border:0;visibility:hidden';
      iframe.setAttribute('data-gifos-provider', manifest.appId || '');
      // WebGPU delegation — the SAME hatch mountApp opens, for the same
      // reason: it is a Permissions-Policy feature, fixed at navigation, and
      // a sandboxed (opaque-origin) frame gets navigator.gpu only if the
      // parent delegates it here. Without this line a GPU engine
      // (capabilities.gpu — Kokoro) silently fell back to WASM in every
      // provider mount while running full-speed as a normal app. The rest of
      // mountApp's delegations stay off DELIBERATELY: fullscreen, pointer
      // lock and orientation lock need a gesture in a visible frame this
      // hidden mount can never have, autoplay rides only on a link's ask,
      // and motion would feed device sensors to a frame the user never sees
      // — a permission surface that grants nothing is the one lie it must
      // never tell.
      if (hasCap(manifest, 'gpu') && !capDisabled(manifest, 'gpu')) { try { iframe.setAttribute('allow', 'webgpu'); } catch (e) {} }
      const pending = new Map();
      let ready = false, idSeq = 0;
      const fail = (err) => { root.removeEventListener('message', handler); try { iframe.remove(); } catch (e) {} providerServices.delete(fileId); reject(err); };
      const bootTimer = setTimeout(() => { if (!ready) fail(new Error(label + ' did not start serving (no gifos.provider.serve call) — it may not be a working provider.')); }, PROVIDER_BOOT_MS);
      // A provider that changes its document loses its mount (see mountApp
      // and clientShim: the replacement document would keep every consumer's
      // provider-request while carrying no CSP). It is simply dropped — the
      // next call re-mounts it from its bytes.
      const nonce = mountNonce();
      const handler = (e) => {
        const d = e.data; if (!d || d.ns !== 'gifos') return;
        if (d.type === 'unloading') { if (d.nonce === nonce) fail(new Error(label + ' left its frame and was stopped.')); return; }
        if (!iframe.contentWindow || e.source !== iframe.contentWindow) return;
        if (d.type === 'provider-ready') { ready = true; clearTimeout(bootTimer); resolve(service); }
        // A provider that is still generating says so; each ping re-arms the
        // idle clock. Cheap (one postMessage per token) and it cannot mask a
        // hang, because a hung provider stops pinging.
        else if (d.type === 'provider-progress') {
          const pend = pending.get(d.id);
          if (pend && pend.bump) pend.bump();
          // …and the note the provider attached rides straight to the user.
          if (pend && pend.onNote && (d.note || d.frac != null)) pend.onNote(d.note || '', d.frac);
        }
        // A fragment of the answer itself (ctx.delta). It is progress too — it
        // proves the engine is writing — so it re-arms the idle clock on the
        // same terms, and then goes on to the app that asked.
        else if (d.type === 'provider-delta') {
          const pend = pending.get(d.id);
          if (!pend) return;
          if (pend.bump) pend.bump();
          if (pend.onDelta && d.text) { try { pend.onDelta(String(d.text)); } catch (e) {} }
        }
        else if (d.type === 'provider-result') {
          const pend = pending.get(d.id); if (!pend) return;
          pending.delete(d.id); clearTimeout(pend.timer);
          d.ok ? pend.res(d.result) : pend.rej(new Error(d.error || (label + ' failed to answer.')));
        }
        // The service mount answers info (apps use it to label themselves) and
        // REFUSES everything else loudly — a hung promise inside the provider
        // would otherwise look like a broken engine.
        else if (d.type === 'info') { const w = iframe.contentWindow; if (w) w.postMessage({ ns: 'gifos', type: 'reply', id: d.id, ok: true, result: { appId: manifest.appId, name: manifest.name, version: manifest.version, provider: true } }, '*'); }
        else if (d.type === 'asset') { replyAsset(files, fileId, manifest, d, (p, t) => { const w = iframe.contentWindow; if (w) w.postMessage(Object.assign({ ns: 'gifos', type: 'reply', id: d.id }, p), '*', t || []); }); }
        else if (d.id) { const w = iframe.contentWindow; if (w) w.postMessage({ ns: 'gifos', type: 'reply', id: d.id, ok: false, error: 'Not available in a provider service mount.' }, '*'); }
      };
      const service = {
        call: (role, req, onNote, onDelta) => new Promise((res, rej) => {
          const w = iframe.contentWindow;
          if (!w) { rej(new Error(label + ' is not running.')); return; }
          const id = 'p' + (++idSeq);
          // IDLE timeout, not a total budget. An on-device LLM legitimately
          // takes minutes — the engine runs single-threaded in the browser
          // (Pages cannot set COOP/COEP), so a few hundred tokens is a long
          // wall-clock wait and the answer is still worth having. Killing it
          // at a fixed 3 minutes just threw away work the user was waiting for.
          // What must still fail fast is a WEDGED provider, so the clock is
          // reset by every provider-progress ping the provider sends as it
          // generates: silence for PROVIDER_CALL_MS means stuck, not slow.
          const entry = { res, rej, timer: null, onNote, onDelta };
          const arm = () => setTimeout(() => { pending.delete(id); rej(new Error(label + ' stopped responding while answering (no progress for ' + Math.round(PROVIDER_CALL_MS / 1000) + 's).')); }, PROVIDER_CALL_MS);
          entry.timer = arm();
          entry.bump = () => { clearTimeout(entry.timer); entry.timer = arm(); };
          pending.set(id, entry);
          w.postMessage({ ns: 'gifos', type: 'provider-request', id, role, req }, '*');
        }),
      };
      root.addEventListener('message', handler);
      doc.body.appendChild(iframe);
      iframe.srcdoc = buildAppHtml(files, manifest, 1, nonce);
    });
    providerServices.set(fileId, p);
    p.catch(() => providerServices.delete(fileId)); // a failed boot may be retried
    return p;
  }
  // `emit` is the asking app's onDelta, or null. It reaches the provider's
  // ctx.delta and comes back out fragment by fragment.
  function providerCall(c, role, req, emit) {
    const cfgName = c.appName || 'Your provider app';
    return providerArchive(c.app).then((arc) => {
      if (!arc || !arc.files) {
        showSystemSetup({ kind: 'provider', name: cfgName, role, problem: 'missing' });
        return Promise.reject(new Error('PROVIDER_MISSING: ' + cfgName + ' is assigned to this AI type but its file is no longer on this computer. Re-install it, or pick another model in Settings → AI models.'));
      }
      const m = arc.manifest || {};
      const name = m.name || cfgName;
      if (providesRoles(m).indexOf(role) < 0) {
        return Promise.reject(new Error(name + ' does not provide the "' + role + '" AI type (its manifest lists: ' + (providesRoles(m).join(', ') || 'none') + ').'));
      }
      if (providerNetworky(m)) {
        return Promise.reject(new Error(name + ' declares network access, and a provider must be network-less — every app’s AI requests flow into it. Refused.'));
      }
      return store.allItems().then((its) => {
        const it = (its || []).find((i) => i && i.fileId === c.app);
        if (!it || it.parent !== 'sys_providers') {
          showSystemSetup({ kind: 'provider', name, role, problem: 'outside' });
          return Promise.reject(new Error('PROVIDER_NOT_IN_FOLDER: ' + name + ' only works from inside the Providers folder on your Home Screen. Move its icon back there (it wears a red ✕ anywhere else).'));
        }
        // Install-time assets (gifos-assets.js): the store normally cached
        // them at install, but a hand-dropped or shared slim GIF arrives
        // without — backfill from the pinned URLs into the computer's asset
        // store (Blob-backed IndexedDB, keyed by this icon), so a model
        // downloads once per computer, never per tab.
        const A = GifOS.assets;
        const cache = A ? A.assetCache(store, c.app) : null;
        // A failed backfill is NOT fatal to the serve. An app that pins weights
        // may still have an honest degraded mode (Offline Cheap Text LLM
        // BitNet boots its labeled self-test model when gifos.assets() misses),
        // and only the app knows that. Refusing here pre-empted the app's own
        // fallback and made a pinned provider unusable offline / on a small
        // storage quota. The miss is still reported clearly at READ time by
        // gifos.assets(path), which names the fix; an app that genuinely cannot
        // work without its asset surfaces that message instead of this one.
        // COLD means the service is not mounted, so this call pays for the
        // engine boot and the weight load. It is the difference between "a
        // moment" and "a couple of minutes", so the indicator is told which
        // one it is, and the two are timed separately.
        const cold = !providerServices.has(c.app);
        const t0 = Date.now();
        return loadTimings().then((tt) => {
          const rec = tt[c.app] || {};
          busyStart(name, { cold, expect: cold ? rec.cold : rec.warm });
          const prep = A
            ? A.missing(arc.files, m, cache).then((need) => need.length
              // The weights are the biggest wait there is and the OS is the one
              // fetching them — before this, gigabytes downloaded behind a
              // completely silent screen because ensure() was handed a null.
                ? A.ensure(arc.files, m, (s, frac) => busyNote(s, frac), cache)
                  .catch((e) => { try { console.warn(name + ': asset download did not complete — the app will run in whatever degraded mode it offers. ' + (e && e.message || e)); } catch (_) {} return null; })
                : null)
            : Promise.resolve();
          return prep
            .then(() => { if (cold) busyNote('Starting ' + name + '…', null); return providerService(c.app, arc.files, m); })
            .then((svc) => svc.call(role, req, (note, frac) => busyNote(note, frac), emit || null))
            .then(
              (out) => { recordTiming(c.app, cold, Date.now() - t0); busyEnd(); return out; },
              (err) => { busyEnd(); throw err; });          // a failed run teaches nothing about timing
        });
      });
    });
  }
  // gifos.assets(path) — hand an app the bytes for a hash-pinned path
  // (gifos-assets.js). Serves a hand-sealed .assets/ file from the packed
  // filesystem first, else the computer's asset store IF that row is still
  // the pin (same sha256, or for pre-hash rows the same byte length). A
  // store Update keeps the fileId, so a rebuilt file at the same path must
  // re-fetch, not keep serving the first download. If the pin is in the
  // manifest and not cached as this pin, the OS FETCHES that one row now
  // (busy pill) — required pins the store/boot missed, and optional pins
  // the app just asked for. Unknown paths are a miss, not a free-form
  // download.
  // Gigabyte-friendly: the ArrayBuffer crosses as a TRANSFER.
  const assetInflight = new Map();
  function replyAsset(files, fileId, manifest, d, post) {
    const p = String(d.path || '').replace(/^\.?\/+/, '');
    const u8 = files['.assets/' + p];
    if (u8 && u8.buffer) { post({ ok: true, result: { bytes: u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) } }); return; }
    const miss = (why) => post({ ok: false, error: 'Asset not available: ' + (d.path || '?') + ' — ' +
      (why || 'its download hasn’t completed on this computer') +
      '. Reopen the app while online (or reinstall it from the App Store).' });
    const sendBlob = (blob) => blob.arrayBuffer().then((buf) => post({ ok: true, result: { bytes: buf } }, [buf]));
    const fetchOnce = () => {
      const A = GifOS.assets;
      if (!A || !manifest || !fileId) return Promise.resolve(null);
      const k = fileId + '\0' + p;
      if (assetInflight.has(k)) return assetInflight.get(k);
      const cache = A.assetCache(store, fileId);
      busyStart(manifest.name || 'This app');
      busyNote('Downloading ' + p.split('/').pop() + '…', 0);
      const pending = A.ensurePath(files, manifest, p, (s, frac) => busyNote(s, frac), cache)
        .then((r) => {
          busyEnd();
          if (r && r.unknown) return { unknown: true };
          return store.getAsset(fileId, p).then((blob) => ({ blob: blob || null }));
        })
        .catch((e) => {
          const msg = 'the download failed — ' + (e && e.message || e);
          busyNote(msg, null);
          setTimeout(busyEnd, 4000);
          return { error: msg };
        })
        .finally(() => { assetInflight.delete(k); });
      assetInflight.set(k, pending);
      return pending;
    };
    const after = (got) => {
      if (got && got.blob) return sendBlob(got.blob);
      if (got && got.unknown) return miss('this app did not pin that file.');
      if (got && got.error) return miss(got.error);
      return miss();
    };
    if (!fileId) { miss(); return; }
    const A = GifOS.assets;
    const pin = (A && manifest) ? A.list(manifest).find((a) => a.path === p) : null;
    const rowP = store.getAssetRow
      ? store.getAssetRow(fileId, p)
      : store.getAsset(fileId, p).then((blob) => (blob ? { blob: blob, bytes: blob.size } : null));
    rowP.then((row) => {
      if (row && row.blob && (!A || !A.rowMatches || A.rowMatches(row, pin))) return sendBlob(row.blob);
      if (pin && pin.optional && capDisabled(manifest, 'assets')) {
        return miss(CAP_OFF_MSG('extra file downloads'));
      }
      return fetchOnce().then(after);
    }).catch(() => fetchOnce().then(after));
  }

  // The sanitized request a provider sees — the broker's own vocabulary, never
  // the raw bridge message (no ids, no model names, no stray fields).
  function providerReq(role, op, d) {
    if (op === 'chat') return { op, role, messages: d.messages || [{ role: 'user', content: String(d.prompt || '') }], temperature: d.temperature, maxTokens: d.maxTokens };
    if (op === 'tts') return { op, role, text: String(d.text || ''), voice: d.voice, format: d.format, speed: d.speed, pitch: d.pitch };
    if (op === 'stt') return { op, role, bytes: d.bytes || d.audio || null, mime: d.mime, language: d.language };
    if (op === 'image') return { op, role, prompt: String(d.prompt || ''), size: d.size };
    return { op, role, prompt: d.prompt, image: d.image, size: d.size, seconds: d.seconds };
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

  /*
   * Look an API up by name, CASE-INSENSITIVELY, and that is not a nicety.
   *
   * Settings stores the row under exactly what the user typed into the name
   * box; an app asks for exactly what it declared in its manifest. Type
   * "Maptiler" — which is how MapTiler spell it, and what the permission sheet
   * shows you — and an app declaring `maptiler` gets NOT_CONFIGURED with the
   * key sitting right there, saved and tested and working. The player is told
   * to set up something they have already set up, and there is nothing on
   * either screen to suggest why.
   *
   * The name is a human-typed label for a service, not an identifier anyone
   * agreed on, so it must not carry meaning in its capitalisation. Read
   * loosely; keep storing whatever they typed, so Settings still shows their
   * spelling back to them.
   */
  function apiEntry(name) {
    const cfg = apiConfig();
    if (cfg[name]) return cfg[name];
    const want = String(name || '').toLowerCase();
    for (const k in cfg) if (k.toLowerCase() === want) return cfg[k];
    return null;
  }
  /*
   * POOLING — a declared MODE, not a hidden optimisation.
   *
   * An app may list a SUBSET of its network hosts under capabilities.pool. What
   * that buys: when the app is in a room with other people, a GET to one of
   * those hosts is answered from the room if anyone there already has it, and
   * fetched once and shared if nobody does. Ten people driving the same street
   * cost a donated map server one Overpass query instead of ten.
   *
   * Three rules, enforced here rather than documented:
   *
   *  1. POOL ⊆ NETWORK. You cannot pool a host you were not allowed to reach.
   *     Otherwise `pool` is a second, quieter network allowlist.
   *  2. NEVER A KEYED HOST. Anything under capabilities.api is refused outright.
   *     Those responses were bought with someone's key and quota, and re-serving
   *     them to a room is a licensing decision the app does not get to make on
   *     the player's behalf. This is the guard, not the guidance.
   *  3. GET ONLY, AND ONLY WHAT IS CACHEABLE. A pooled answer is content
   *     addressed by its URL; a POST is not a question with a stable answer.
   */
  function poolHosts(manifest) {
    const caps = (manifest && manifest.capabilities) || {};
    const want = Array.isArray(caps.pool) ? caps.pool.filter(Boolean) : [];
    if (!want.length) return [];
    const net = Array.isArray(caps.network) ? caps.network : [];
    const keyed = Array.isArray(caps.api) ? caps.api : [];
    // A keyed API's host is not named in the manifest — the user configures it
    // in Settings — so the check is "does this app use keyed APIs at all, and
    // is this host one of their configured bases".
    // HOSTNAME, never host:port — `network` is matched on u.hostname in
    // bridgeFetch, and a `pool` list that quietly meant something else would
    // be a second vocabulary for the same idea (and would silently never match
    // on any non-default port, which is exactly where the test fixtures live).
    const keyedHosts = keyed.map((n) => {
      const c = apiEntry(n);
      try { return c && c.url ? new URL(c.url).hostname : null; } catch (e) { return null; }
    }).filter(Boolean);
    const netN = net.map(normHost).filter(Boolean);
    // '*' is deliberately unpoolable. An app may ask to reach anywhere — and
    // the sheet shouts about it — but "share everything you download from
    // anywhere with the room" is not a thing a manifest gets to say.
    return want.filter((h) => {
      const n = normHost(h);
      return n && n !== '*' && netN.indexOf(n) !== -1 && keyedHosts.indexOf(n) === -1;
    });
  }

  function poolable(manifest, d) {
    if (!d || (d.method && String(d.method).toUpperCase() !== 'GET')) return false;
    if (capDisabled(manifest, 'pool')) return false;
    const hosts = poolHosts(manifest).map(normHost);
    if (!hosts.length) return false;
    let host;
    try { host = normHost(new URL(d.url).hostname); } catch (e) { return false; }
    return hosts.indexOf(host) !== -1;
  }

  /*
   * The pool, and the two parts of it that are subtle.
   *
   * THE COLD START. "Share what you downloaded" is the easy half and it does
   * nothing on its own. At the moment a race begins nobody has anything, so
   * all ten players miss at once, all ten ask the map server, and the sharing
   * engages after every request it existed to prevent has already been made.
   * What makes the difference is CLAIMING BEFORE FETCHING: announce the intent,
   * WAIT OUT A SHORT SETTLE WINDOW, and then the peer whose id sorts lowest
   * goes while the rest wait for its answer. The window is the whole trick — a
   * claim that decides instantly decides against an empty room and every peer
   * still elects itself. SETTLE_MS is one mesh hop's worth of grace, paid only
   * on a miss, and it is invisible next to an Overpass query.
   *
   * THE ANSWER STAMPEDE, which is the same bug wearing the other hat. Once
   * everybody holds a URL, one latecomer's `want` is answered by ALL of them
   * at once — N copies of the same payload across the mesh to serve one miss.
   * So an answer is DAMPED: each holder waits a deterministic slot derived
   * from its own id and the URL, and cancels the moment it sees somebody
   * else's answer go by. One reply, no coordinator, and a holder that leaves
   * mid-slot just means the next slot fires.
   *
   * Both election rules have to be able to LOSE. A claimer who leaves, or
   * whose request hangs, must not stop everyone else loading the world — so a
   * claim expires, and a wait always ends, in the worst case by doing exactly
   * what the unpooled app would have done.
   */
  const POOL_TTL = 30 * 60 * 1000;      // an answer is good for half an hour
  const POOL_MAX = 96;                  // entries retained per app session
  const POOL_BYTES = 3 * 1024 * 1024;   // never RETAIN a response bigger than this
  // …and never PUSH one bigger than this onto the room's data channels. The
  // mesh's own history is the argument (see run.html sgaApp): a multi-megabyte
  // frame on the stage lane starved the signaling that keeps the room alive.
  // A response over the fan cap is still cached locally and still served on
  // request — it just never travels unasked.
  const POOL_FAN_BYTES = 384 * 1024;
  const CLAIM_MS = 9000;                // a claim nobody honours expires
  const SETTLE_MS = 300;                // …the window competing claims land in
  const WAIT_MS = 7000;                 // …and a waiter never waits longer
  const SERVE_SLOT = 90;                // damping slot per holder, ms
  const SERVE_SLOTS = 8;

  const poolHave = new Map();           // url -> { bytes, headers, status, at }
  const poolClaim = new Map();          // url -> { by, at }
  const poolWaiters = new Map();        // url -> [ {resolve, timer} ]
  const poolServing = new Map();        // url -> timer for our damped answer
  let poolSend = null;                  // set when a room bus exists
  let poolSelf = '';                    // this node's id, for the claim ordering
  // The pool's account of itself. `self` and `rx` are here because the two ways
  // this quietly degrades into "everybody fetches anyway" are indistinguishable
  // from the outside: nobody's frames are crossing (rx stays 0), or every node
  // is calling itself the same thing so no claim can ever lose (self collides).
  const poolStats = { self: '', rx: 0, lag: 0, hits: 0, served: 0, fetched: 0, waited: 0, yielded: 0, damped: 0 };
  const poolAsked = new Map();          // url -> when WE claimed it (lag measurement)

  function poolTrim() {
    if (poolHave.size <= POOL_MAX) return;
    const old = [...poolHave.entries()].sort((a, b) => a[1].at - b[1].at);
    for (let i = 0; i < old.length - POOL_MAX; i++) poolHave.delete(old[i][0]);
  }

  function poolLocal(url) {
    const e = poolHave.get(url);
    if (!e) return null;
    if (Date.now() - e.at > POOL_TTL) { poolHave.delete(url); return null; }
    return e;
  }

  const poolHit = (e) => ({ status: e.status, headers: e.headers, bytes: e.bytes });
  const poolSize = (b) => (b ? (b.byteLength || b.length || 0) : 0);

  // Release everyone waiting on this URL. entry===null means "nobody is coming"
  // — the waiter falls back to a real fetch rather than failing the app.
  function poolSettle(url, entry) {
    const list = poolWaiters.get(url);
    if (!list) return;
    poolWaiters.delete(url);
    list.forEach((w) => { clearTimeout(w.timer); w.resolve(entry || null); });
  }

  // A promise for "the room answers this URL", or null after ms. Never rejects:
  // every caller has a fallback and a rejection here would surface as an app
  // network error for a request that has not actually failed.
  function poolAwait(url, ms) {
    const held = poolLocal(url);
    if (held) return Promise.resolve(held);
    return new Promise((resolve) => {
      const list = poolWaiters.get(url) || [];
      const w = { resolve: resolve };
      w.timer = setTimeout(() => {
        const rest = (poolWaiters.get(url) || []).filter((x) => x !== w);
        if (rest.length) poolWaiters.set(url, rest); else poolWaiters.delete(url);
        resolve(null);
      }, ms);
      list.push(w);
      poolWaiters.set(url, list);
    });
  }

  // Somebody in the room offered us one. Retain it and release anyone waiting —
  // this is the same retain-and-fan the app bytes use, keyed by URL instead of
  // by session. Also cancels our own pending answer: theirs got there first,
  // which is exactly what the damping window is for.
  function poolAccept(url, entry) {
    if (!url || !entry || !poolSize(entry.bytes)) return;
    poolHave.set(url, { bytes: entry.bytes, headers: entry.headers || {}, status: entry.status || 200, at: Date.now() });
    poolTrim();
    poolClaim.delete(url);
    const t = poolServing.get(url);
    if (t) { clearTimeout(t); poolServing.delete(url); poolStats.damped++; }
    poolSettle(url, poolHave.get(url));
  }

  // Our slot in the answer order. A stable hash of (self, url) — so two holders
  // pick different slots, and the SAME holder picks the same slot for a URL
  // every time (no thrash, and a test can predict it).
  function poolSlot(url) {
    const s = String(poolSelf) + '\u0000' + url;
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return (h % SERVE_SLOTS) * SERVE_SLOT;
  }

  function poolOffer(url) {
    poolServing.delete(url);
    const e = poolLocal(url);
    if (!e || !poolSend) return;
    if (poolSize(e.bytes) > POOL_FAN_BYTES) return;
    poolStats.served++;
    poolSend({ k: 'data', url: url, bytes: e.bytes, headers: e.headers, status: e.status });
  }

  // Lowest id wins, and a claim only ever moves DOWN within its window — a peer
  // that claims late cannot displace an earlier lower bidder.
  //
  // OUR OWN claim goes through here too, and that is the whole point. It used
  // to be written straight into the map, which CLOBBERED a lower claim that had
  // already arrived — so the peer that asked second always re-elected itself,
  // both peers fetched, and the pool degraded into pure overhead while every
  // frame still crossed and every log looked healthy. Measured lag was 15ms
  // against a 300ms window: the window was never the problem.
  function poolBid(url, by) {
    const cur = poolClaim.get(url);
    if (!cur || Date.now() - cur.at > CLAIM_MS || String(by) < String(cur.by)) poolClaim.set(url, { by: by, at: Date.now() });
  }

  function poolOnFrame(m) {
    if (!m || typeof m.url !== 'string') return;
    poolStats.rx++;
    if (m.k === 'claim') {
      // How long a competing claim took to reach us. This is the ONE number
      // that says whether SETTLE_MS is big enough for the room we are actually
      // in — a settle window shorter than the lag means every peer elects
      // itself and the pool silently becomes a no-op that still costs frames.
      if (String(m.by) !== String(poolSelf)) {
        const t = poolAsked.get(m.url);
        if (t) poolStats.lag = Math.max(poolStats.lag, Date.now() - t);
      }
      poolBid(m.url, m.by);
    } else if (m.k === 'data') poolAccept(m.url, m);
    else if (m.k === 'want') {
      if (poolServing.has(m.url) || !poolLocal(m.url) || !poolSend) return;
      poolServing.set(m.url, setTimeout(() => poolOffer(m.url), poolSlot(m.url)));
    }
  }

  // Did we win the right to fetch? Nobody claimed, or nobody claimed lower.
  function poolWon(url) {
    const c = poolClaim.get(url);
    if (!c || Date.now() - c.at > CLAIM_MS) return true;
    return String(c.by) >= String(poolSelf);
  }

  function poolFetch(policy, d, url) {
    poolStats.fetched++;
    return bridgeFetch(policy, d)
      .then((r) => {
        const kept = poolKeep(url, r);
        const e = poolLocal(url);
        if (e && poolSend && poolSize(e.bytes) <= POOL_FAN_BYTES) {
          poolStats.served++;
          poolSend({ k: 'data', url: url, bytes: e.bytes, headers: e.headers, status: e.status });
        }
        poolSettle(url, e);
        return kept;
      })
      .catch((err) => { poolClaim.delete(url); poolSettle(url, null); throw err; });
  }

  function pooledFetch(policy, d) {
    const url = d.url;
    const local = poolLocal(url);
    if (local) { poolStats.hits++; return Promise.resolve(poolHit(local)); }

    // Alone in the room: there is nobody to pool with, so this is an ordinary
    // fetch and must not pay a millisecond for the machinery.
    if (!poolSend) return bridgeFetch(policy, d).then((r) => poolKeep(url, r));

    poolSend({ k: 'want', url: url });                       // somebody may hold it
    poolBid(url, poolSelf);
    poolAsked.set(url, Date.now());
    poolSend({ k: 'claim', url: url, by: poolSelf });

    return poolAwait(url, SETTLE_MS).then((e) => {
      if (e) { poolStats.hits++; return poolHit(e); }
      if (poolWon(url)) return poolFetch(policy, d, url);
      // Somebody lower claimed it. Wait for their answer — but never for ever:
      // a claimer who left must cost us a few seconds, not the world.
      poolStats.yielded++;
      return poolAwait(url, WAIT_MS).then((e2) => {
        if (e2) { poolStats.hits++; return poolHit(e2); }
        poolStats.waited++;
        poolClaim.delete(url);
        return poolFetch(policy, d, url);  // exactly what the unpooled app would have done
      });
    });
  }

  function poolKeep(url, r) {
    const n = poolSize(r && r.bytes);
    if (r && r.status >= 200 && r.status < 300 && n > 0 && n <= POOL_BYTES) {
      poolHave.set(url, { bytes: r.bytes, headers: r.headers || {}, status: r.status, at: Date.now() });
      poolTrim();
    }
    poolClaim.delete(url);
    return r;
  }

  // The room bus arrives AFTER the app mounts (becomeHost / bootClientBus), so
  // the pool is wired on attach and unwired on teardown. Everything a departing
  // bus owns goes with it — a stale claim or a scheduled answer outliving the
  // room is a frame sent into the dark.
  function poolAttach(bus, self) {
    poolSend = (d) => { try { bus.send('pool', d); } catch (e) {} };
    // A node with no id cannot lose a claim to a node with the same no-id, so
    // a missing self is not "use a default" — it is a bug that must be loud
    // rather than a room where everybody quietly fetches everything.
    if (!self) { poolSend = null; try { console.error('[pool] no node id — pooling stays off'); } catch (e) {} return; }
    poolSelf = String(self);
    poolStats.self = poolSelf;
  }
  function poolDetach() {
    poolSend = null; poolSelf = ''; poolStats.self = '';
    poolClaim.clear();
    for (const t of poolServing.values()) clearTimeout(t);
    poolServing.clear();
    for (const url of [...poolWaiters.keys()]) poolSettle(url, null);
  }

  function apiAllowed(manifest, name) {
    const list = (manifest && manifest.capabilities && manifest.capabilities.api) || [];
    return Array.isArray(list) && list.indexOf(name) !== -1;
  }
  // Known third-party providers — lets the SYSTEM render specific setup guidance
  // (base URL, auth scheme) when an app asks for one that isn't configured, so
  // apps don't hardcode "go to Settings and type https://api.deepgram.com".
  //
  // `auth`/`authName` here are also the DEFAULT WIRING for a saved entry that
  // never chose one. The generic default is a Bearer header, and MapTiler
  // ignores headers entirely — it wants ?key= on the URL — so a user who saved
  // their key with the defaults had a key that tested fine (the base URL
  // answers without auth) and then silently failed on every actual tile. The
  // system knows the provider; the user should not need to know its trivia.
  // (desktop.js's Settings Test mirrors these defaults — keep them in step.)
  const KNOWN_APIS = {
    // ws: paths the broker serves over Deepgram's WebSocket protocol instead
    // of REST (deepgramListenWS below) — no CORS proxy, key straight to the
    // API's own host. desktop.js KNOWN_API_SHAPES mirrors this; keep in step.
    deepgram: { label: 'Deepgram', url: 'https://api.deepgram.com', auth: 'token', ws: ['/v1/listen'] },
    // SimpleFIN: the post-Mint bank aggregator, and the only one in its class
    // that fits a static site (Plaid/Teller/MX all need a server-side secret).
    // The base URL is the user's OWN claimed access URL — a different host per
    // user, and self-hosted servers exist — so unlike the others there is no
    // fixed url here, only the auth shape. `only` because Basic is the sole
    // scheme SimpleFIN speaks: a wrong dropdown must not be able to break a
    // correct credential.
    simplefin: { label: 'SimpleFIN', auth: 'basic', only: true },
    maptiler: { label: 'MapTiler', url: 'https://api.maptiler.com', auth: 'query', authName: 'key',
                only: true,   // MapTiler accepts exactly this shape — no entry setting can improve on it
                probePath: '/tiles/satellite-v2/tiles.json' },
  };
  // The auth a request should ACTUALLY use. For a provider that accepts
  // EXACTLY ONE shape (MapTiler reads ?key= and nothing else), the known shape
  // wins over whatever the entry says — "the app should not care about the
  // formulation" cuts both ways: the user should not need to get a dropdown
  // right for their key to count, and a wrong dropdown must not be able to
  // break a correct key. For providers with several real schemes, the entry's
  // own explicit choice still stands; only the generic default gives way.
  function resolveAuth(name, c) {
    const known = KNOWN_APIS[String(name || '').toLowerCase()];
    let at = c.authType || 'bearer', an = c.authName || '';
    if (known && known.auth && (known.only || !c.authType || c.authType === 'bearer')) {
      at = known.auth; an = known.authName || c.authName || '';
    }
    return { at: at, an: an };
  }
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
  // ---- the warm-up indicator (system-owned) ---------------------------------
  // An on-device provider has to load its weights before it can say anything —
  // hundreds of megabytes through a single-threaded wasm engine, which is
  // minutes on a phone. Until now the OS said NOTHING while that happened: the
  // asking app sat on a promise, the user sat on a blank answer, and there was
  // no way to tell a model warming up from a computer that had given up.
  //
  // It belongs to the OS, not the app. Every app that asks for AI would
  // otherwise have to grow its own "please wait" out of nothing, and each one
  // would guess differently — while the only party that knows a Provider is
  // mounting, that its weights are still downloading, or that it has been
  // 90 seconds, is the broker doing the work.
  //
  // Non-blocking on purpose: a pill at the bottom of the screen, over whatever
  // app is running, never a modal. You are waiting for an answer, not being
  // interrupted.
  const busy = { n: 0, el: null, noteEl: null, subEl: null, barEl: null, t0: 0, tick: null, show: null, name: '', note: '', expect: 0, frac: null };

  const fmtDur = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return s < 60 ? s + 's' : Math.floor(s / 60) + 'm' + (s % 60 ? ' ' + (s % 60) + 's' : '');
  };

  function busyPaint() {
    if (!busy.el) return;
    const ms = Date.now() - busy.t0;
    // A cold call is warming up; a warm one is thinking. Saying "warming up"
    // for a model already in memory would train people to expect the long wait
    // every time.
    busy.noteEl.textContent = busy.note || (busy.name + (busy.cold ? ' is warming up…' : ' is thinking…'));
    // Elapsed ALWAYS; the expectation only when we have actually measured it
    // before on this computer. "Usually about a minute" invented on the first
    // run is a guess, and a guess that turns out short is worse than silence.
    let sub = fmtDur(ms) + ' so far';
    if (busy.expect > 0) {
      sub += ms < busy.expect * 1.35
        ? ' · usually about ' + fmtDur(busy.expect)
        : ' · longer than its usual ' + fmtDur(busy.expect);
    } else if (busy.cold) {
      sub += ' · first answer loads the model, so it is the slow one';
    }
    busy.subEl.textContent = sub;
    // A known fraction drives the bar; otherwise it sweeps, for the same reason
    // the store's asset bar does — a bar parked at a number it cannot justify
    // reads as finished.
    if (busy.frac == null) { busy.barEl.parentNode.setAttribute('data-busy', '1'); busy.barEl.style.width = '100%'; }
    else { busy.barEl.parentNode.removeAttribute('data-busy'); busy.barEl.style.width = Math.round(busy.frac * 100) + '%'; }
  }

  function busyMount() {
    const doc = root.document;
    if (!doc || !doc.body || busy.el) return;
    if (!doc.getElementById('gifos-busy-css')) {
      const st = doc.createElement('style'); st.id = 'gifos-busy-css';
      st.textContent = '@keyframes gifosBusySweep{from{transform:translateX(-100%)}to{transform:translateX(100%)}}'
        + '#gifos-provider-busy .bar[data-busy] i{background:linear-gradient(90deg,transparent,#7b5cff,transparent);animation:gifosBusySweep 1.1s linear infinite}'
        + '@media (prefers-reduced-motion:reduce){#gifos-provider-busy .bar[data-busy] i{animation:none;opacity:.55}}';
      doc.head.appendChild(st);
    }
    const el = doc.createElement('div');
    el.id = 'gifos-provider-busy';
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.setAttribute('style', 'position:fixed;left:50%;bottom:1rem;transform:translateX(-50%);z-index:70;max-width:min(26rem,92vw);'
      + 'background:#14141f;color:#e8e8f4;border:1px solid #2a2a3f;border-radius:.7rem;padding:.6rem .85rem;'
      + 'box-shadow:0 .5rem 1.6rem rgba(0,0,0,.45);font:14px/1.4 system-ui,-apple-system,sans-serif;pointer-events:none');
    el.innerHTML = '<div id="gifos-busy-note" style="font-weight:600"></div>'
      + '<div id="gifos-busy-sub" style="color:#9a9ab5;font-size:.82rem;margin-top:.15rem"></div>'
      + '<div class="bar" style="height:.28rem;border-radius:999px;background:#2a2a3f;overflow:hidden;margin-top:.45rem">'
      + '<i style="display:block;height:100%;width:0;background:#7b5cff;transition:width .2s linear"></i></div>';
    doc.body.appendChild(el);
    busy.el = el;
    busy.noteEl = el.querySelector('#gifos-busy-note');
    busy.subEl = el.querySelector('#gifos-busy-sub');
    busy.barEl = el.querySelector('.bar i');
    busyPaint();
    busy.tick = setInterval(busyPaint, 1000);
  }

  // Held back briefly: a warm provider answers in a few hundred ms, and
  // flashing a "please wait" for that is noise, not information.
  const BUSY_DELAY_MS = 600;
  function busyStart(name, opts) {
    busy.n++;
    if (busy.n > 1) return;                       // one pill, whoever is asking
    busy.name = name || 'The provider';
    busy.note = ''; busy.frac = null;
    busy.cold = !!(opts && opts.cold);
    busy.expect = (opts && opts.expect) || 0;
    busy.t0 = Date.now();
    busy.show = setTimeout(() => { busy.show = null; busyMount(); }, BUSY_DELAY_MS);
  }
  function busyNote(note, frac) {
    if (!busy.n) return;
    if (note) busy.note = String(note);
    busy.frac = (typeof frac === 'number' && isFinite(frac)) ? frac : null;
    busyPaint();
  }
  function busyEnd() {
    busy.n = Math.max(0, busy.n - 1);
    if (busy.n) return;
    if (busy.show) { clearTimeout(busy.show); busy.show = null; }
    if (busy.tick) { clearInterval(busy.tick); busy.tick = null; }
    if (busy.el) { try { busy.el.remove(); } catch (e) {} busy.el = null; }
  }
  // Exposed so the indicator can be asserted directly rather than inferred from
  // a screenshot — same reason the store exports its build decision.
  GifOS.providerBusy = { start: busyStart, note: busyNote, end: busyEnd, get showing() { return !!busy.el; }, get text() { return busy.el ? busy.noteEl.textContent + ' | ' + busy.subEl.textContent : ''; } };

  // How long this provider took last time, so "warming up" can carry a number
  // instead of asking the user to guess. Cold (weights not loaded yet) and warm
  // are recorded separately because they differ by orders of magnitude, and
  // quoting the warm figure while the model loads would be a lie that makes the
  // wait feel broken. Smoothed, so one slow run under memory pressure doesn't
  // become "usually".
  const TIMING_KEY = 'sys::provider-timing';
  let timings = null;
  function loadTimings() {
    if (timings) return Promise.resolve(timings);
    return store.getState(TIMING_KEY).then((t) => (timings = t || {}), () => (timings = {}));
  }
  function recordTiming(fileId, cold, ms) {
    if (!fileId || !(ms > 0)) return;
    return loadTimings().then((t) => {
      const rec = t[fileId] || {};
      const k = cold ? 'cold' : 'warm';
      rec[k] = rec[k] > 0 ? Math.round(rec[k] * 0.6 + ms * 0.4) : Math.round(ms);
      t[fileId] = rec;
      return store.setState(TIMING_KEY, t).catch(() => {});
    });
  }

  function showSystemSetup(opts) {
    try {
      const doc = root.document; if (!doc || !doc.body) return;
      const old = doc.getElementById('gifos-setup-modal'); if (old) old.remove();
      let title, body;
      if (opts.kind === 'ai') {
        const label = AI_ROLE_LABELS[opts.role];
        title = (label || 'An AI model') + ' isn’t set up yet';
        body = 'This app uses an AI model you provide. In GifOS <b>Settings → AI models</b>, set up ' +
          (label ? 'the <b>' + escHtml(label) + '</b> model' : 'a text model') + ' — any OpenAI-compatible endpoint and key, or a <b>Provider app</b> from your Providers folder (answers on this device, no key).';
      } else if (opts.kind === 'provider') {
        // A Provider APP is assigned to this role but can't serve right now.
        const label = AI_ROLE_LABELS[opts.role];
        title = escHtml(opts.name || 'Your provider app') + ' can’t answer right now';
        body = opts.problem === 'outside'
          ? '<b>' + escHtml(opts.name) + '</b> serves ' + (label ? 'your <b>' + escHtml(label) + '</b>' : 'an AI type') +
            ', but its icon isn’t in the <b>Providers</b> folder on your Home Screen. A provider only works from inside that folder (it wears a red ✕ anywhere else) — move it back, or pick another model in <b>Settings → AI models</b>.'
          : '<b>' + escHtml(opts.name) + '</b> is assigned to ' + (label ? 'your <b>' + escHtml(label) + '</b>' : 'an AI type') +
            ', but its file is no longer on this computer. Re-install it from the App Store, or pick another model in <b>Settings → AI models</b>.';
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

  // ---- app -> app handoff: a typed document on a shelf the OS owns ---------
  // docs/app-handoff.md. Two apps that have never heard of each other need a
  // way to pass ONE structured thing: the Financial Tracker knows what you have
  // and what you spend, and the Retirement Calculator opens by asking for
  // exactly those numbers. Neither may read the other's storage — an app's db
  // is its own, and nothing here changes that.
  //
  // So the OS keeps a SHELF. A producing app OFFERS a document of a declared
  // KIND; a consuming app TAKES the newest one of a kind it declared. One
  // document per kind, per computer, in the OS's own state — never in either
  // app's storage, and never in a shared backup of somebody else's room.
  //
  // Four rules, and each one is load-bearing:
  //
  //  1. THE KINDS ARE THE OS's, NOT THE APP's. HANDOFF_KINDS is a fixed
  //     vocabulary with first-party words, exactly as the capability sheet is
  //     (docs/providers.md: "third-party text does not get to define what a
  //     checkbox means"). An app that could name its own kind would be writing
  //     the sentence the user reads before agreeing to it.
  //  2. THE OS NAMES THE FIELDS TOO, and the document is REBUILT from that
  //     list before it is shown or stored. Anything the app put in that GifOS
  //     did not ask for is dropped, not carried. This is what makes the sheet
  //     honest by construction rather than by review: the sheet cannot
  //     under-report the payload, because the payload IS what the sheet lists.
  //  3. AN OFFER IS A VISIBLE ACT. Every offer raises a sheet the runtime owns,
  //     naming the app and showing the document itself, before a byte is
  //     written. There is no silent publish and no remembered consent — the
  //     numbers differ every time, so "don't ask again" would be agreeing to
  //     something not yet written.
  //  4. OWNER MOUNTS ONLY. A guest looking at a mirror of someone else's app
  //     may neither read this computer's shelf nor write to it. An invite link
  //     is not a way to ask a stranger's computer what it is worth.
  const HANDOFF_KEY = 'sys::handoff';
  const HANDOFF_KINDS = {
    'finance.plan': {
      label: 'a retirement plan summary',
      never: 'No account numbers, no institution names, and none of your transactions.',
      // [field, the words the user reads, 'money' | 'age' | 'text']
      fields: [
        ['currentAge', 'Your age', 'age'],
        ['netWorth', 'Net worth', 'money'],
        ['portfolio', 'Savings and investments', 'money'],
        ['illiquid', 'Property and other things you own', 'money'],
        ['debts', 'What you owe', 'money'],
        ['annualSavings', 'Put away each year', 'money'],
        ['annualSpend', 'Spent each year', 'money'],
        ['asOf', 'As of', 'text'],
      ],
    },
  };
  const HANDOFF_KIND_ERR = (k) => '"' + k + '" is not a kind of document GifOS hands between apps.';
  function handoffDeclares(manifest, dir, kind) {
    const h = (manifest && manifest.handoff) || {};
    const list = Array.isArray(h[dir]) ? h[dir] : [];
    return list.indexOf(kind) >= 0;
  }
  // Rule 2: the stored document is BUILT FROM the OS's field list, never
  // copied from the app's object. An unknown key cannot survive this.
  function handoffShape(spec, doc) {
    const out = {};
    if (!doc || typeof doc !== 'object') return out;
    for (const f of spec.fields) {
      const v = doc[f[0]];
      if (v === undefined || v === null || v === '') continue;
      if (f[2] === 'text') out[f[0]] = String(v).slice(0, 120);
      else { const n = Number(v); if (isFinite(n)) out[f[0]] = n; }
    }
    return out;
  }
  function handoffRow(f, v) {
    if (f[2] === 'text') return escHtml(String(v));
    if (f[2] === 'age') return escHtml(String(Math.round(v)));
    const neg = v < 0;
    const s = '$' + Math.round(Math.abs(v)).toLocaleString('en-US');
    return escHtml(neg ? '-' + s : s);
  }
  // The sheet. Owned by the runtime (real origin), so the app can neither fake
  // it nor suppress it, and it shows the document rather than describing it.
  function askHandoff(manifest, spec, doc) {
    return new Promise((resolve) => {
      const doc_ = root.document;
      if (!doc_ || !doc_.body) { resolve(false); return; }   // no surface = no consent
      const old = doc_.getElementById('gifos-handoff-modal'); if (old) old.remove();
      const rows = spec.fields.filter((f) => doc[f[0]] !== undefined).map((f) =>
        '<tr><td style="padding:.18rem .8rem .18rem 0;color:#b6b6cf">' + escHtml(f[1]) + '</td>' +
        '<td style="padding:.18rem 0;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">' + handoffRow(f, doc[f[0]]) + '</td></tr>').join('');
      const bg = doc_.createElement('div'); bg.id = 'gifos-handoff-modal'; bg.className = 'perm-modal';
      bg.setAttribute('style', 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:1.2rem;');
      const box = doc_.createElement('div'); box.className = 'perm-box';
      box.setAttribute('style', 'background:#14141f;color:#e8e8f4;border:1px solid #2a2a3f;border-radius:.8rem;max-width:24rem;width:100%;padding:1.2rem;font:15px/1.55 system-ui,-apple-system,sans-serif;');
      box.innerHTML =
        '<h3 style="margin:0 0 .5rem;font-size:1.1rem">Hand this to your other apps?</h3>' +
        '<p style="color:#b6b6cf;font-size:.9rem;margin:0 0 .8rem"><b>' + escHtml(manifest.name || 'This app') +
          '</b> wants to put ' + escHtml(spec.label) + ' where your other apps can pick it up.</p>' +
        (rows ? '<table style="width:100%;border-collapse:collapse;font-size:.88rem;margin:0 0 .8rem;' +
          'background:#0f0f18;border:1px solid #2a2a3f;border-radius:.5rem;padding:.5rem">' + rows + '</table>'
              : '<p style="color:#ff9d9d;font-size:.88rem">There is nothing in it.</p>') +
        '<p style="color:#9a9ab5;font-size:.82rem;margin:0 0 1rem">That is the whole of it — ' + escHtml(spec.never) +
          ' It stays on this device, and only an app that asks for this exact kind of summary can read it.</p>' +
        '<div style="display:flex;gap:.5rem;justify-content:flex-end">' +
        '<button id="gifos-handoff-no" style="padding:.5rem 1rem;border-radius:.5rem;border:1px solid #3a3a52;background:transparent;color:#e8e8f4;cursor:pointer;font:inherit">Not now</button>' +
        '<button id="gifos-handoff-yes" style="padding:.5rem 1.3rem;border-radius:.5rem;border:none;background:#7b5cff;color:#fff;cursor:pointer;font:inherit">Hand it over</button></div>';
      bg.appendChild(box); doc_.body.appendChild(bg);
      let done = false;
      const finish = (v) => { if (done) return; done = true; bg.remove(); resolve(v); };
      box.querySelector('#gifos-handoff-yes').onclick = () => finish(true);
      box.querySelector('#gifos-handoff-no').onclick = () => finish(false);
      bg.addEventListener('click', (e) => { if (e.target === bg) finish(false); });
    });
  }
  function handoffGuard(manifest, dir, kind) {
    const spec = HANDOFF_KINDS[kind];
    if (!spec) throw new Error(HANDOFF_KIND_ERR(kind));
    if (!handoffDeclares(manifest, dir, kind)) {
      throw new Error('This app\'s manifest does not declare handoff.' + dir + ' ["' + kind + '"].');
    }
    return spec;
  }
  function brokerHandoffOffer(manifest, db, d) {
    const kind = String(d.kind || '');
    let spec;
    try { spec = handoffGuard(manifest, 'offers', kind); } catch (e) { return Promise.reject(e); }
    if (!(db && db.owner)) {
      return Promise.reject(new Error('Only the computer this app belongs to can hand a document to another app.'));
    }
    const doc = handoffShape(spec, d.doc);
    if (!Object.keys(doc).length) return Promise.reject(new Error('There is nothing GifOS recognises in that document.'));
    return askHandoff(manifest, spec, doc).then((yes) => {
      if (!yes) return { ok: false, reason: 'declined' };
      return store.getState(HANDOFF_KEY).catch(() => null).then((shelf) => {
        shelf = (shelf && typeof shelf === 'object') ? shelf : {};
        shelf[kind] = { doc, from: { appId: manifest.appId || '', name: manifest.name || '' }, at: new Date().toISOString() };
        return store.setState(HANDOFF_KEY, shelf).then(() => ({ ok: true }));
      });
    });
  }
  function brokerHandoffTake(manifest, db, d) {
    const kind = String(d.kind || '');
    try { handoffGuard(manifest, 'takes', kind); } catch (e) { return Promise.reject(e); }
    // A guest reads nothing. Not an error — there simply is no shelf here that
    // is theirs, and an app booting into a shared room should carry on.
    if (!(db && db.owner)) return Promise.resolve(null);
    return store.getState(HANDOFF_KEY).catch(() => null).then((shelf) => {
      const rec = shelf && shelf[kind];
      if (!rec || !rec.doc) return null;
      return { kind, doc: rec.doc, from: rec.from || {}, at: rec.at || '' };
    });
  }

  // ---- Deepgram's WebSocket door, REST-shaped -------------------------------
  // Opens ws(s)://<configured host>/v1/listen?<the app's own query>, sends the
  // clip as binary frames + {"type":"CloseStream"}, collects every is_final
  // Results and the closing Metadata, and resolves the exact shape the REST
  // endpoint would have returned — the calling app cannot tell the transport
  // changed, which is the point. The key rides the subprotocol list
  // (['token', key]) because a browser may not set headers on a WS handshake.
  function deepgramListenWS(u, key, body, d, baseOrigin) {
    return new Promise((resolve, reject) => {
      const wsUrl = (u.protocol === 'http:' ? 'ws:' : 'wss:') + '//' + u.host + u.pathname + u.search;
      let ws = null, opened = false, done = false, guard = null;
      const finals = []; let meta = null;
      const stop = () => { clearTimeout(guard); try { if (ws) { ws.onclose = null; ws.close(); } } catch (e) {} };
      const fail = (e) => { if (done) return; done = true; stop(); reject(e); };
      // Idle guard, not a total cap: a long clip takes long to transcribe, but
      // a healthy stream is never silent for a whole minute.
      const arm = () => { clearTimeout(guard); guard = setTimeout(() => fail(new Error('Deepgram WebSocket went silent — no answer in 60s.')), 60000); };
      const finish = () => {
        if (done) return; done = true; stop();
        const words = []; const parts = []; let confSum = 0, confN = 0;
        finals.forEach((r) => {
          const alt = r.channel && r.channel.alternatives && r.channel.alternatives[0];
          if (!alt) return;
          if (alt.transcript) parts.push(alt.transcript);
          if (Array.isArray(alt.words)) alt.words.forEach((w) => words.push(w));
          if (typeof alt.confidence === 'number') { confSum += alt.confidence; confN++; }
        });
        const json = { metadata: meta || {}, results: { channels: [{ alternatives: [{
          transcript: parts.join(' '), confidence: confN ? confSum / confN : 0, words }] }] } };
        const out = { status: 200, ok: true, contentType: 'application/json' };
        if (d.as === 'bytes') { const b = new TextEncoder().encode(JSON.stringify(json)); resolve(Object.assign(out, { bytes: b.buffer, mime: 'application/json' })); }
        else if (d.as === 'text') resolve(Object.assign(out, { text: JSON.stringify(json) }));
        else resolve(Object.assign(out, { json }));
      };
      try { ws = new root.WebSocket(wsUrl, key ? ['token', key] : undefined); } catch (e) {
        return fail(new Error('UNREACHABLE: could not open a WebSocket toward ' + baseOrigin + ' (' + (e && e.message || e) + ')'));
      }
      ws.binaryType = 'arraybuffer';
      arm();
      ws.onopen = () => {
        opened = true; arm();
        let bytes = null;
        if (body instanceof ArrayBuffer) bytes = new Uint8Array(body);
        else if (body && ArrayBuffer.isView(body)) bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
        else if (body != null) bytes = new TextEncoder().encode(String(body));
        // Chunked so no single frame is huge; the socket buffers, we don't pace
        // — a recorded clip is a one-shot replay, not a live stream.
        const CHUNK = 256 * 1024;
        if (bytes) for (let i = 0; i < bytes.length; i += CHUNK) ws.send(bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
        ws.send(JSON.stringify({ type: 'CloseStream' }));
      };
      ws.onmessage = (ev) => {
        arm();
        if (typeof ev.data !== 'string') return;
        let m = null; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.type === 'Results' && m.is_final) finals.push(m);
        else if (m.type === 'Metadata') { meta = m; finish(); } // Metadata is Deepgram's end-of-stream marker
      };
      ws.onclose = (ev) => {
        if (done) return;
        if (opened && finals.length) return finish(); // closed after answering — tolerate a missing Metadata
        if (root.navigator && root.navigator.onLine === false) {
          return fail(new Error('OFFLINE: you are offline — the entry is set up; it will work when the connection returns.'));
        }
        // A browser hides the handshake's HTTP status, so a rejected key and a
        // blocked network are indistinguishable here. Say so instead of guessing.
        fail(new Error(opened
          ? 'Deepgram closed the stream without a transcript (code ' + ev.code + (ev.reason ? ', ' + ev.reason : '') + ').'
          : 'Deepgram WebSocket: could not connect to ' + baseOrigin + ' — a rejected key and a blocked network look identical at a WebSocket handshake; check the key in Settings and your connection.'));
      };
      ws.onerror = () => { /* the close event that follows carries the verdict */ };
    });
  }

  function brokerApi(manifest, d) {
    const name = d.name;
    if (!name || !apiAllowed(manifest, name)) return Promise.reject(new Error('This app did not declare the "' + name + '" third-party API in its manifest.'));
    if (capDisabled(manifest, 'api')) return Promise.reject(new Error(CAP_OFF_MSG('your third-party accounts')));
    const c = apiEntry(name);
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
    const auth = resolveAuth(name, c), at = auth.at, an = auth.an, key = c.key || '';
    if (key) {
      if (at === 'bearer') headers.Authorization = 'Bearer ' + key;
      else if (at === 'token') headers.Authorization = 'Token ' + key;      // Deepgram-style
      // HTTP Basic. The user pastes "user:password" as the key — and for
      // SimpleFIN that is what its access URL literally hands them, embedded in
      // the URL as https://<user>:<pass>@host/…. It has to be lifted out and
      // re-sent as a header because a browser fetch() REJECTS a URL carrying
      // credentials outright (TypeError, before any request is made); Settings
      // does the splitting when the entry is saved.
      else if (at === 'basic') headers.Authorization = 'Basic ' + btoa(key);
      else if (at === 'header' && an) headers[an] = key;                    // e.g. x-api-key
      else if (at === 'query' && an) u.searchParams.set(an, key);
    }
    let body = d.body;
    if (body && (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) { /* binary, pass through */ }
    else if (body && typeof body === 'object' && typeof body.b64 === 'string') body = b64ToBuf(body.b64);
    else if (body && typeof body === 'object') { body = JSON.stringify(body); if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json'; }
    const method = String(d.method || 'GET').toUpperCase();
    // Deepgram, NATIVELY. Its REST API is server-only (no Access-Control-Allow-*
    // headers), so a browser POST to /v1/listen used to need the CORS proxy —
    // meaning the user's key and audio transited that proxy. Its WebSocket API
    // is browser-native: a WS handshake has no CORS preflight, and the key
    // rides the Sec-WebSocket-Protocol subprotocol straight to the API's own
    // host. So the broker TRANSLATES the app-side REST shape to WS on the fly:
    // same gifos.api() call in, same REST-shaped JSON out (reassembled from
    // the stream's is_final Results + closing Metadata), no proxy anywhere,
    // and the key still travels ONLY to the configured host. Triggered by the
    // entry NAME (how every other KNOWN_APIS default is keyed — and what lets
    // a test or a self-hosted Deepgram at another URL take the same path) OR
    // by the production hostname, so a differently-named entry still works.
    if ((String(name).toLowerCase() === 'deepgram' || u.hostname === 'api.deepgram.com')
        && method === 'POST' && /\/v1\/listen(\/|$)/.test(u.pathname)) {
      return deepgramListenWS(u, key, body, d, baseOrigin);
    }
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
    }).catch((e) => {
      // A dead network is not a missing key. fetch throws the same bare
      // TypeError ("Failed to fetch") for airplane mode, a down host and a
      // CORS block — and apps relayed it to players as "check your key",
      // sending them to re-enter a credential that was saved, tested and
      // fine. Name the actual failure, and keep a machine-readable prefix so
      // apps can tell "network down" from "key wrong" without string-guessing.
      if (root.navigator && root.navigator.onLine === false) {
        throw new Error('OFFLINE: you are offline — "' + name + '" is set up; it will work when the connection returns.');
      }
      throw new Error('UNREACHABLE: could not reach ' + baseOrigin + ' — the "' + name + '" entry is set up; this is a network problem, not a key problem.');
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
    if (!c || (!c.url && !c.app)) { showSystemSetup({ kind: 'ai', role: 'smartest' }); return Promise.reject(new Error('NOT_CONFIGURED:ai:smartest')); }
    if (c.app) {
      return providerCall(c, 'smartest', { op: 'chat', role: 'smartest', messages: d.messages || [], temperature: 0.1, maxTokens: d.maxTokens })
        .then((r) => ({ text: (r && r.text) || '' }));
    }
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

  // ---- link-borne launch arguments (docs/architecture.md "the go. link") ----
  // A link may ask an app to open ON something: a place, a message, a document.
  // Two rules make that safe enough to hand a stranger, and both are enforced
  // here rather than described anywhere:
  //
  // 1. AN APP ONLY EVER HEARS WHAT IT PUBLISHED A NAME FOR. The manifest's
  //    "launch" block declares each argument and the words the consent sheet
  //    says about it. An undeclared key is DROPPED — a link cannot reach a knob
  //    the app never offered, so adding a URL surface is a deliberate act by the
  //    app author, not an ambient consequence of being mountable.
  // 2. NOTHING IS DELIVERED UNTIL THE PERSON SAYS SO. The values sit in a gate
  //    that only the consent sheet can open (see gifos-perms.js). No chrome to
  //    ask with = no delivery, which is why the gate DENIES rather than hangs
  //    when __gifosPermissions is absent: a silent grant is the one outcome a
  //    link-borne instruction must never have.
  //
  // Values are strings, capped — a launch argument is an intention, not a
  // payload. Anything bigger belongs in the app's own data.
  const LAUNCH_VALUE_MAX = 2000;
  function declaredLaunch(manifest, raw) {
    const spec = manifest && manifest.launch;
    if (!raw || !spec || typeof spec !== 'object') return [];
    const out = [];
    for (const key of Object.keys(spec)) {
      if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
      const v = raw[key];
      if (v == null) continue;
      const d = spec[key] || {};
      out.push({
        key,
        value: String(v).slice(0, LAUNCH_VALUE_MAX),
        label: String(d.label || key),
        detail: String(d.detail || ''),
      });
    }
    return out;
  }

  let setupShownAt = 0; // the last time an app raised an apiSetup/aiSetup modal
  function mountApp(iframe, files, manifest, db, originalBytes, policy, mountFileId, launch) {
    policy = policy || makeNetPolicy(null, manifest); // client-run: session-only
    mountFileId = mountFileId || null; // set for host mounts — lets gifos.assets() serve the icon's asset cache
    // The gate: gifos.launch() answers from here, and only once someone has
    // said yes. asked=[] resolves null immediately, so an app that always calls
    // launch() never waits for a sheet that isn't coming.
    const asked = declaredLaunch(manifest, launch);
    let openGate = null;
    const launchGate = asked.length
      ? new Promise((res) => { openGate = res; })
      : Promise.resolve(null);
    armBackTrap(() => iframe);
    // A receipt GIF (manifest.receipt — see gifos-pay-broker.js) re-grants its
    // entitlement the moment it is OPENED, on any computer: that is the whole
    // restore story. Trust is the embedded signature, never the manifest —
    // ingest verifies against this site's published key and a forgery grants
    // nothing. Fire-and-forget: the viewer renders either way.
    if (manifest && manifest.receipt && GifOS.payBroker) {
      try { Promise.resolve(GifOS.payBroker.ingestReceiptFiles(files)).catch(() => {}); } catch (e) {}
    }
    // THE DOCUMENT UNDER THE BRIDGE MAY NEVER CHANGE (see clientShim). The
    // shim's pagehide beacon freezes the bridge the instant the app's
    // document starts to go away; the frame's next load is then either the
    // app reloading itself or a navigation the parent's frame-src already
    // refused (an about: URL is all that is left) — either way the runtime
    // re-mounts the ORIGINAL document, so a reload still boots and a
    // replacement document never gets served. An app that keeps leaving is
    // stopped for good after a few tries.
    //
    // Documents are told apart by a GENERATION the shim is built with: the
    // shim says `hello` with it first thing and `unloading` with it last
    // thing. Only the generation of the LAST document mounted is served
    // (`live`); a beacon from the live document re-mounts the next
    // generation; a hello or beacon from any other generation is a stale
    // document being superseded and is ignored. The shim's two listeners are
    // registered before app code and cannot be removed by it.
    //
    // The frame's `load` event is no clock: it lands before or after the
    // beacon's message task, and before or after the next document's hello.
    // The one hazard the beacon alone leaves is a refused navigation whose
    // error page commits AFTER the re-mount was issued and clobbers it; a
    // single timed retry per beacon covers that (a re-mount whose hello
    // never came is issued once more, then left alone).
    let gen = 1, live = 0, remounts = 0, torn = false, retry = false;
    const nonce = mountNonce();
    const teardown = () => {
      if (torn) return; torn = true; live = 0;
      root.removeEventListener('message', handler);
      try { iframe.srcdoc = LEFT_FRAME_HTML; } catch (e) {}
    };
    const remount = () => {
      if (torn) return;
      if (++remounts > 6) { teardown(); return; }
      const g = ++gen;
      try { iframe.srcdoc = buildAppHtml(files, manifest, g, nonce); } catch (e) { teardown(); return; }
      if (retry) setTimeout(() => { if (retry && !torn && gen === g && live !== g) { retry = false; remount(); } }, 5000);
    };
    const handler = (e) => {
      const d = e.data; if (!d || d.ns !== 'gifos') return;
      // The beacon is posted during pagehide, and by the time it is
      // dispatched its document is gone, so e.source is null (per spec) and
      // the source check below cannot authenticate it. The per-mount nonce
      // baked into the shim does: nothing outside that document ever sees
      // it (the app's origin is opaque, so no popup can read its scripts).
      if (d.type === 'unloading') {
        if (d.nonce === nonce && d.gen === live && live) { live = 0; retry = true; remount(); }
        return;
      }
      if (!iframe.contentWindow || e.source !== iframe.contentWindow) return;
      if (d.type === 'hello') { if (d.gen === gen) { live = gen; retry = false; } return; }
      if (!live) return;
      // Guard at REPLY time, not just receipt: async ops (db/fetch/…) can
      // resolve after the iframe was torn out of the DOM (app takeover /
      // stop), when contentWindow is null — a reply then must be a no-op,
      // not an unhandled "reading 'postMessage'" rejection.
      const reply = (p) => { const w = iframe && iframe.contentWindow; if (w) w.postMessage(Object.assign({ ns: 'gifos', type: 'reply', id: d.id }, p), '*'); };
      // The collection name is the ONE app-chosen string that indexes a
      // trusted-side map (store.badCollectionName says why it is gated); and
      // a synchronous throw inside an op must still become a reply, never an
      // uncaught error that leaves the app's promise hanging.
      if (d.type === 'db') {
        (d.op !== 'dump' && store.badCollectionName(d.collection)
          ? Promise.reject(new Error('bad collection name'))
          : Promise.resolve().then(() => db.op(d.op, d.collection, d.key, d.value)))
          .then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      }
      else if (d.type === 'fetch') {
        (poolable(manifest, d) ? pooledFetch(policy, d) : bridgeFetch(policy, d))
          .then((r) => reply({ ok: true, result: r }))
          .catch((err) => reply({ ok: false, error: String(err.message || err) }));
      }
      else if (d.type === 'save') downloadSnapshot(originalBytes, files, manifest, db).then((name) => reply({ ok: true, result: name })).catch((err) => reply({ ok: false, error: String(err.message || err) }));
      else if (d.type === 'capture') {
        // Studio sessions stream every capture back as a 'shot' part so the
        // app can save each one as it lands — the reply carries only the last.
        const emitShot = d.studio ? (shot) => { const w = iframe && iframe.contentWindow; if (w) w.postMessage({ ns: 'gifos', type: 'part', id: d.id, shot: shot }, '*'); } : null;
        brokerCapture(manifest, d, emitShot).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      }
      else if (d.type === 'cameraInfo') brokerCameraInfo(manifest).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      else if (d.type === 'libraryPut') brokerLibraryPut(manifest, mountFileId, d, (collection) => {
        const w = iframe && iframe.contentWindow;
        if (w) w.postMessage({ ns: 'gifos', type: 'db-change', collection: collection }, '*');
      }).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      // Switch this tab to the My Media app. Solo mounts only (#id=): inside a
      // room or meeting the tab belongs to the room, and navigating away would
      // tear the user out of it.
      else if (d.type === 'libraryOpen') {
        if (!/[#&]id=/.test(String(root.location.hash || ''))) reply({ ok: false, error: 'My Media can only be opened from an app running on its own.' });
        else findMyMediaFileId().then((mmId) => {
          if (!mmId) { reply({ ok: false, error: "My Media isn't on this computer" }); return; }
          reply({ ok: true, result: true });
          root.location.hash = '#id=' + mmId;
          root.location.reload();
        }).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      }
      // Streaming chat: each fragment rides back as a 'part' carrying this
      // call's id, and the single 'reply' still closes it out. Same guard as
      // reply() — an app torn out mid-stream must not be posted to.
      else if (d.type === 'ai') {
        const emit = d.stream ? (text) => { const w = iframe && iframe.contentWindow; if (w) w.postMessage({ ns: 'gifos', type: 'part', id: d.id, text }, '*'); } : null;
        brokerAI(manifest, d, emit).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      }
      else if (d.type === 'api') brokerApi(manifest, d).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      else if (d.type === 'apiReady') { const c = apiEntry(d.name); reply({ ok: true, result: apiAllowed(manifest, d.name) && !!(c && c.url) }); }
      // A setup modal is OS chrome with the app's words in it: only for an
      // API or role the manifest declares (the same gate as the call itself),
      // with a short hint, and not more than once every few seconds.
      else if (d.type === 'apiSetup' || d.type === 'aiSetup') {
        const okName = d.type === 'apiSetup' ? apiAllowed(manifest, d.name) : aiAllowed(manifest, d.role);
        const nowMs = Date.now();
        if (!okName) reply({ ok: false, error: d.type === 'apiSetup' ? 'This app did not declare that API.' : 'This app did not declare that AI role.' });
        else if (nowMs - setupShownAt < 5000) reply({ ok: false, error: 'A setup panel was just shown.' });
        else {
          setupShownAt = nowMs;
          const hint = String(d.hint == null ? '' : d.hint).slice(0, 200);
          showSystemSetup(d.type === 'apiSetup' ? { kind: 'api', name: d.name, hint } : { kind: 'ai', role: d.role, hint });
          reply({ ok: true, result: true });
        }
      }
      else if (d.type === 'agentChat') brokerAgentChat(manifest, d).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      // owner = this app runs on its OWNER's computer (host / local), so it may
      // change visibility (setVisibility). A guest view is not the owner.
      else if (d.type === 'info') reply({ ok: true, result: { appId: manifest.appId, name: manifest.name, version: manifest.version, owner: !!(db && db.owner) } });
      else if (d.type === 'me') reply({ ok: true, result: identity() });
      // The app asking what its link said. Answers once — and only once — the
      // person has confirmed; null if nothing was asked, or if they declined.
      else if (d.type === 'launch') launchGate.then((result) => reply({ ok: true, result }));
      else if (d.type === 'asset') replyAsset(files, mountFileId, manifest, d, (p, t) => { const w = iframe && iframe.contentWindow; if (w) w.postMessage(Object.assign({ ns: 'gifos', type: 'reply', id: d.id }, p), '*', t || []); });
      else if (d.type === 'setName') reply({ ok: true, result: setName(d.name) });
      // App -> app handoff. Both directions are refused unless the manifest
      // declared this exact kind, and an offer always raises the sheet.
      else if (d.type === 'handoffOffer') brokerHandoffOffer(manifest, db, d).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      else if (d.type === 'handoffTake') brokerHandoffTake(manifest, db, d).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      // Payments. Only in a NORMAL app mount — the provider service-mount
      // handler refuses every unknown type, which is exactly the doctrine:
      // a hidden mount has no surface to show a human what they are approving.
      else if (d.type === 'charge') {
        (GifOS.payBroker ? GifOS.payBroker.charge(manifest, originalBytes, d, manifest.name) : Promise.reject(new Error('Payments are not available on this computer.')))
          .then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      }
      else if (d.type === 'entitled') {
        (GifOS.payBroker ? GifOS.payBroker.entitled(manifest, d.sku, originalBytes) : Promise.reject(new Error('Payments are not available on this computer.')))
          .then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      }
      else if (d.type === 'license') {
        (GifOS.payBroker ? GifOS.payBroker.license(manifest, d.sku, originalBytes) : Promise.reject(new Error('Payments are not available on this computer.')))
          .then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      }
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
    // The launch request rides along: the sheet is the only thing that can open
    // the gate, and if there is no sheet — a mount with no chrome — the gate
    // CLOSES. Fail shut: an unattended page must not act on a link's say-so.
    const launchReq = asked.length ? {
      asked,
      grant: () => { if (openGate) { openGate(asked.reduce((o, a) => (o[a.key] = a.value, o), {})); openGate = null; } },
      deny: () => { if (openGate) { openGate(null); openGate = null; } },
    } : null;
    if (root.__gifosPermissions) {
      try {
        root.__gifosPermissions(policy, manifest, launchReq, {
          pullOptional: function (onStatus) {
            const A = GifOS.assets;
            if (!A) return Promise.reject(new Error('Downloads are not available on this computer.'));
            const cache = A.assetCache(store, mountFileId);
            return A.ensure(files, manifest, onStatus, cache, { optionalOnly: true, parallelHosts: true });
          },
        });
      } catch (e) { if (launchReq) launchReq.deny(); }
    } else if (launchReq) launchReq.deny();
    // Motion sensors are delegated to the sandbox via the iframe allow-policy
    // (the events fire INSIDE the app frame). Camera/mic are NOT delegated —
    // those are captured by the trusted parent and handed back as clips.
    //
    // AUTOPLAY rides along for a mount a LINK asked something of, and only
    // that mount. "Click this link and your computer says the message" has a
    // gesture behind it — the tap that answered the sheet — but it happens in
    // THIS document, and a sandboxed frame is a different one, so without the
    // delegation the app is left asking for a second tap to do the exact thing
    // that was just agreed to. What it buys is sound: an app cannot reach the
    // camera, the microphone, or the network any differently for having it.
    // Set here because a permissions policy is fixed at navigation — after
    // srcdoc lands it is too late, which is why this cannot wait for the yes.
    const allow = [];
    if (hasCap(manifest, 'motion') && !capDisabled(manifest, 'motion')) allow.push('gyroscope', 'accelerometer', 'magnetometer');
    // WebGPU is a Permissions-Policy feature, so a sandboxed (opaque-origin)
    // frame gets navigator.gpu only if the parent delegates it here — same hatch
    // as motion, and fixed at navigation for the same reason. It needs NO CSP
    // relaxation: WebGPU opens no network path (connect-src 'none' still holds),
    // it runs a compute/render pipeline on the device's GPU. The engine still
    // has to reach the sandbox as bytes; capabilities.wasm remains the way in.
    if (hasCap(manifest, 'gpu') && !capDisabled(manifest, 'gpu')) allow.push('webgpu');
    // FULLSCREEN is half a permissions-policy feature and half a sandbox flag,
    // and a phone game needs BOTH halves (the sandbox half is set below).
    //
    // The policy half: `fullscreen`'s default allowlist is 'self', and this
    // frame's document is srcdoc inside a sandbox with no allow-same-origin, so
    // it has an OPAQUE origin — cross-origin to us by definition, never 'self'.
    // Without this delegation requestFullscreen() rejects with a TypeError
    // ("Permissions check failed") thrown INSIDE the app, where nobody sees it.
    // Note this is the modern spelling: the legacy `allowfullscreen` attribute
    // means exactly `allow="fullscreen"`, and there is no such SANDBOX token —
    // `allow-fullscreen` in a sandbox attribute is an invalid flag Chrome warns
    // about and ignores. It grants a bigger picture and nothing else: no
    // network, no origin, no storage, and the browser keeps its own two guards
    // (a user gesture to enter, Esc to leave).
    //
    // AND THE ALLOWLIST IS `*`, NOT THE DEFAULT. `allow="fullscreen"` means
    // `fullscreen 'src'` — granted to the frame's OWN origin — and this frame's
    // origin is opaque, so on some browsers there is nothing for 'src' to match
    // and the grant silently does not apply. Measured: desktop Chrome accepted
    // the default and Chrome 150 on Android refused it, and the app reported
    // back from the device with `refused:TypeError:Permissions check failed`
    // while document.fullscreenEnabled still read true. `*` removes the origin
    // match from the question. It is not a wider grant in any way that matters:
    // the only document this policy can ever reach is the one app in this frame.
    if (hasCap(manifest, 'fullscreen') && !capDisabled(manifest, 'fullscreen')) allow.push('fullscreen *');
    //
    // NO SCREEN-CAPTURE CAPABILITY, AND IT IS NOT AN OVERSIGHT — IT CANNOT BE
    // BUILT THIS WAY. `display-capture` IS a permissions-policy feature, so
    // `allow.push('display-capture *')` looked like the same one-liner that
    // gave apps webgpu and fullscreen, and it delegates cleanly: the attribute
    // lands and the policy check passes. Then getDisplayMedia rejects anyway,
    // with `SecurityError: Invalid security origin` — measured 2026-08-16 in a
    // real app frame, inside a real click, on Chromium 1228. The refusal is
    // the OPAQUE ORIGIN, not the policy: this frame is srcdoc-sandboxed with
    // no allow-same-origin (makeIframe below), which is the property the whole
    // app boundary rests on, and display capture will not run in a document
    // whose origin is opaque. The proof it is the origin and not the policy is
    // that the error CHANGES when the delegation is added — NotAllowedError
    // "disallowed by permissions policy" before, SecurityError after.
    //
    // So screen capture for an app would need either allow-same-origin (never
    // — that is the sandbox) or a BROKER like camera/mic, where the parent
    // captures behind an unfakeable overlay and hands the app the result. That
    // is a real design with a real cost, and nothing has asked for it yet.
    // What we will not ship in the meantime is a checkbox in the Abilities
    // sheet that grants nothing: a permission surface that moves and changes
    // nothing is the one lie it must never tell.
    //
    // The MEETING's screen share is unaffected and unrelated: run.html is a
    // top-level page with a real origin and calls getDisplayMedia itself
    // (docs/media-plane.md). test/browser/e2e-screen-share.js gates both — the
    // meeting share works, and no app can reach the screen however it is
    // declared.
    if (asked.length) allow.push('autoplay');
    if (allow.length) { try { iframe.setAttribute('allow', allow.join('; ')); } catch (e) {} }
    // Pointer lock is a SANDBOX flag, not a permissions-policy feature, so it
    // cannot ride in `allow` above: a sandboxed frame is refused outright —
    // "Blocked pointer lock on an element because the element's frame is
    // sandboxed and the 'allow-pointer-lock' permission is not set" — until the
    // token is on the frame itself. Declared in the manifest and revocable in
    // the sheet like motion and WebGPU, and set HERE rather than in
    // makeIframe() for the same reason they are: the sandbox is fixed at
    // navigation, and makeIframe() has no manifest to ask.
    //
    // What it grants is the POINTER, not data: the cursor hides and mousemove
    // reports movementX/Y deltas instead of coordinates. No network, no origin,
    // no storage — connect-src 'none' is untouched. The browser keeps both
    // guards it always had: entering needs a user gesture, and Esc always
    // leaves. A first-person game cannot aim without it; nothing else needs it.
    if (hasCap(manifest, 'pointer') && !capDisabled(manifest, 'pointer')) sandboxToken(iframe, 'allow-pointer-lock');
    // ORIENTATION LOCK is the second half of capabilities.fullscreen, and it is
    // the half nobody expects, because it is a SANDBOX flag while fullscreen
    // itself is a policy feature. The HTML sandbox sets a "sandboxed
    // orientation lock browsing context flag" unless allow-orientation-lock is
    // present, and with it set screen.orientation.lock('landscape') rejects
    // with a SecurityError — inside the app, unseen, exactly like pointer lock.
    //
    // It rides on `fullscreen` rather than being its own capability because it
    // cannot be used without it: the browser only honours an orientation lock
    // while the document is fullscreen, and releases it on exit. So the two are
    // one ability — "take the whole screen, the way round the game is drawn" —
    // and one checkbox turns off both halves. A phone that cannot do either is
    // a first-person game played through a letterbox.
    if (hasCap(manifest, 'fullscreen') && !capDisabled(manifest, 'fullscreen')) sandboxToken(iframe, 'allow-orientation-lock');
    // LINKS is two sandbox flags and nothing else. A sandboxed frame cannot
    // open a tab: without allow-popups, target=_blank and window.open are
    // swallowed, and the tap looks like a dead control. With allow-popups
    // alone the new window INHERITS the sandbox, so Google Maps (or any
    // real page) still cannot run. allow-popups-to-escape-sandbox is the
    // second half — the new tab is a normal browser tab.
    //
    // What it does not grant: no fetch, no origin, no storage, no way to
    // navigate THIS window. connect-src 'none' is untouched; there is no
    // allow-top-navigation / allow-top-navigation-by-user-activation. The
    // app still cannot reach the internet itself. A tap on an <a> is a
    // user gesture, and the browser's popup blocker still applies.
    if (hasCap(manifest, 'links') && !capDisabled(manifest, 'links')) {
      sandboxToken(iframe, 'allow-popups');
      sandboxToken(iframe, 'allow-popups-to-escape-sandbox');
    }
    iframe.srcdoc = buildAppHtml(files, manifest, gen, nonce);
    return () => root.removeEventListener('message', handler);
  }

  // A per-mount secret the shim's unload beacon carries (see mountApp).
  function mountNonce() {
    const b = new Uint8Array(16);
    try { root.crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0; }
    return Array.from(b, (x) => ('0' + x.toString(16)).slice(-2)).join('');
  }

  // What an app frame shows once its bridge has been withdrawn for good.
  const LEFT_FRAME_HTML = '<!doctype html><meta charset="utf-8"><body style="margin:0;padding:24px;font:14px system-ui,sans-serif;color:#333;background:#fff">This app kept trying to leave its frame, so it was stopped. Close this tab and open the app again.</body>';

  // Add one token to a frame's sandbox, once. Every caller is a capability, so
  // the token must never appear on a frame whose manifest did not ask for it —
  // and adding the same one twice would put a duplicate in the attribute the
  // capability suites read back.
  function sandboxToken(iframe, token) {
    try {
      const sb = iframe.getAttribute('sandbox') || '';
      if (!new RegExp('(^|\\s)' + token + '(\\s|$)').test(sb)) iframe.setAttribute('sandbox', (sb + ' ' + token).trim());
    } catch (e) {}
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
  // launch — the raw `go.<key>=<value>` bag off the opening link, or null. It
  // is only ever passed for a SOLO mount of MY OWN icon (run.html #id=): an app
  // I joined over somebody else's link is their mount, and their URL has no
  // business arming my copy. declaredLaunch() filters it against the manifest.
  // A launch is never a blank pane: statusEl lives in .bar, which the solo
  // chrome hides, so the ONLY place feedback is guaranteed visible is the
  // mount itself. This splash paints immediately, names the app once its
  // record lands, and is replaced the moment the sandbox iframe mounts
  // (bootDecoded clears mountEl). Refusals land here too, or a locked app's
  // "why" is invisible in a solo tab.
  // The app's accent, read straight out of its GIF's global color table (a
  // few hundred bytes at a fixed offset) — no decode, no canvas. Picks the
  // most saturated mid-brightness entry; returns null when there is nothing
  // sensible, and the splash simply stays neutral.
  function paletteAccent(bytes) {
    try {
      if (!bytes || bytes.length < 14 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return null;
      const packed = bytes[10];
      if (!(packed & 0x80)) return null;
      const n = 1 << ((packed & 0x07) + 1);
      let best = null, bestScore = 0;
      for (let i = 0; i < n; i++) {
        const r = bytes[13 + i * 3], g = bytes[14 + i * 3], b = bytes[15 + i * 3];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx < 60 || mx > 245) continue; // near-black/near-white brand nothing
        const score = (mx - mn) * (1 - Math.abs(mx + mn - 255) / 255);
        if (score > bestScore) { bestScore = score; best = [r, g, b]; }
      }
      return best;
    } catch (e) { return null; }
  }

  function launchSplash(mountEl) {
    // An absolute overlay with its own opaque background: the sandbox iframe
    // mounts UNDER it at opacity 0, so the handoff can never flash white
    // (the blank-iframe white void was the top finding of the first blind
    // load critique — a screen that reads as "crashed").
    try { if (getComputedStyle(mountEl).position === 'static') mountEl.style.position = 'relative'; } catch (e) {}
    const wrap = document.createElement('div');
    // Always a DARK stage, whatever the OS theme: every judge of this pane
    // read it as a game's loading screen, and the light-gray-to-black cut
    // when a dark app document took over was the single most jarring frame.
    // A light app simply fades in over the dark stage instead.
    wrap.setAttribute('style',
      'position:absolute;inset:0;z-index:5;background:#0a0a0f;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'gap:10px;font:15px/1.5 system-ui,sans-serif;color:#8f93a8;text-align:center;padding:0 16px');
    const dot = document.createElement('div');
    dot.setAttribute('style',
      'width:10px;height:10px;border-radius:50%;background:var(--accent,#7b5cff);' +
      // will-change promotes the pulse to the compositor: it keeps beating
      // even while the main thread chews the unpack, which is the whole
      // point of showing it (a frozen "Opening…" reads as a dead tap).
      'will-change:transform,opacity;animation:gifos-launch-pulse 1.1s ease-in-out infinite');
    if (!document.getElementById('gifos-launch-pulse')) {
      const st = document.createElement('style');
      st.id = 'gifos-launch-pulse';
      st.textContent = '@keyframes gifos-launch-pulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.6);opacity:1}}';
      document.head.appendChild(st);
    }
    const line = document.createElement('div');
    line.textContent = 'Opening…';
    const img = document.createElement('img');
    img.setAttribute('style', 'width:96px;height:96px;object-fit:contain;image-rendering:pixelated;border-radius:12px;display:none');
    img.alt = '';
    let artUrl = null;
    wrap.appendChild(img);
    wrap.appendChild(dot);
    wrap.appendChild(line);
    mountEl.innerHTML = '';
    mountEl.appendChild(wrap);
    return {
      say: (m) => { if (wrap.parentNode) line.textContent = m; },
      // The app's own animation IS on-device before anything decodes — the
      // splash shows it (display-only stripped bytes) so the wait is branded
      // by the app from the first second, not by generic OS chrome.
      art: (bytes) => {
        try {
          const shown = gif.stripForDisplay(bytes);
          artUrl = URL.createObjectURL(new Blob([shown], { type: 'image/gif' }));
          img.src = artUrl;
          img.style.display = 'block';
          setTimeout(() => { try { URL.revokeObjectURL(artUrl); } catch (e) {} }, 60000);
        } catch (e) { /* identity is a nicety, never a blocker */ }
      },
      // Once the manifest lands, the wait takes the app's own color: a dark
      // ground tinted with its accent, so the handoff to a dark app document
      // is a dissolve, not a light-to-black cut.
      tint: (accent) => {
        if (!wrap.parentNode || !accent || accent.length < 3) return;
        // deep, near-black tint: dark app documents open over this without a
        // brightness step (the judged seam was brown-dark → near-black)
        const c = (i) => Math.max(0, Math.min(48, Math.round(accent[i] * 0.12)));
        wrap.style.background = 'rgb(' + (c(0) + 6) + ',' + (c(1) + 6) + ',' + (c(2) + 8) + ')';
        wrap.style.color = 'rgb(' + Math.min(255, accent[0] + 60) + ',' + Math.min(255, accent[1] + 60) + ',' + Math.min(255, accent[2] + 60) + ')';
        dot.style.background = 'rgb(' + accent[0] + ',' + accent[1] + ',' + accent[2] + ')';
      },
      gone: () => !wrap.parentNode,
    };
  }

  function boot(mountEl, fileId, statusEl, launch) {
    const setStatus = (m) => { if (statusEl) statusEl.textContent = m; };
    const noop = { save: () => Promise.resolve(null), becomeHost: () => Promise.reject(new Error('nothing running')), help: () => '' };
    const lock = GifOS.lock;
    const splash = launchSplash(mountEl);
    const refuse = (m) => { setStatus(m); splash.say(m); return noop; };
    return Promise.all([store.getFile(fileId), store.allItems()]).then(([rec, all]) => {
      if (!rec) return refuse('File not found on this desktop.');
      const appName = String(rec.name || 'app').replace(/\.gif$/i, '');
      const big = rec.bytes && rec.bytes.length > 2097152;
      splash.say('Opening ' + appName + (big ? ' — unpacking ' + (rec.bytes.length / 1048576).toFixed(0) + ' MB…' : '…'));
      if (big) {
        splash.art(rec.bytes);
        // The GIF's own global color table is sitting in its first bytes — the
        // app's palette can brand the wait BEFORE anything decodes.
        splash.tint(paletteAccent(rec.bytes));
      }
      const item = lock ? lock.itemOfFile(all, fileId) : null;
      const lockKey = (lock && lock.session.get(fileId)) || null;
      const appBytes = rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes);
      // "step 1 of 2": a heavy app counts twice (the OS unpacks the archive,
      // then the app carries its own assets in), and an unlabeled second
      // count reads as progress being thrown away — so both counters say
      // which step they are.
      const unpackNote = big ? {
        onProgress: (frac, done, total) => splash.say('Unpacking ' + appName + ' (step 1 of 2) — ' +
          (done * 0.75 / 1048576).toFixed(1) + ' of ' + (total * 0.75 / 1048576).toFixed(1) + ' MB…'),
      } : undefined;
      return Promise.all([gif.decode(appBytes, unpackNote), store.getState(fileId)]).then(([archive, st]) => {
        const locked = !!(lock && (lock.isLockedItem(item) || lock.isSealed(st)));
        if (locked && !lockKey) {
          return refuse('This app is passkey-locked on this device. Unlock it with your passkey to open.');
        }
        const go = (arch) => {
          if (!lockKey) return bootDecoded(arch, appBytes, rec, null, null);
          const opened = (st && lock.isSealed(st)) ? lock.openState(st, lockKey) : Promise.resolve(st && st.collections ? st : { collections: {} });
          return opened.then((initial) => bootDecoded(arch, appBytes, rec, lockKey, initial || { collections: {} }));
        };
        if (lockKey && archive && lock.isWrappedFiles(archive.files)) {
          return lock.unwrapGif(appBytes, lockKey).then((o) => go({ files: o.files }));
        }
        return go(archive);
      });
    });

    function bootDecoded(archive, appBytes, rec, lockKey, lockState) {
      if (!archive) return refuse('Not a GifOS app — nothing to run.');
      const files = archive.files;
      const manifest = gif.readManifest(archive) || { name: rec.name || 'App' };
      if (manifest.accent) splash.tint(manifest.accent);
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
      // The splash stays up while the sandbox document parses; the frame fades
      // in on its load event — capped, so a document that never finishes
      // loading still cannot park the splash over a working app forever.
      iframe.style.opacity = '0';
      iframe.style.transition = 'opacity 0.2s linear';
      let revealed = false;
      const reveal = () => {
        if (revealed) return;
        revealed = true;
        iframe.style.opacity = '1';
        // The splash is an absolute z-5 overlay and the iframe is not
        // positioned at all, so the frame's fade-in happens UNDER it. Until
        // 0.9.13 the splash simply stayed — opaque and taking pointer events —
        // for the 250 ms before its removal, and then cut away. On a fast box
        // that is a live, title-screened game under a pane that EATS the
        // first tap (e2e-battle-city's "a touch reveals the pad" was red
        // every run on the <gpu-box> and green on every slower box). From
        // the moment the app is revealed the app owns the input: the splash
        // goes pointer-transparent NOW and fades out over the same 0.2 s the
        // frame fades in — the dark-stage cross-fade this always meant.
        let n = mountEl.firstChild;
        while (n) {
          if (n !== iframe && n.style) {
            n.style.pointerEvents = 'none';
            n.style.transition = 'opacity 0.2s linear';
            n.style.opacity = '0';
          }
          n = n.nextSibling;
        }
        setTimeout(() => {
          let n = mountEl.firstChild;
          while (n) { const nx = n.nextSibling; if (n !== iframe) mountEl.removeChild(n); n = nx; }
        }, 250);
      };
      iframe.addEventListener('load', reveal);
      setTimeout(reveal, 3000);
      let stale = mountEl.firstChild; // drop stale frames from a re-mount; keep the splash
      while (stale) { const nx = stale.nextSibling; if (stale.tagName === 'IFRAME') mountEl.removeChild(stale); stale = nx; }
      mountEl.appendChild(iframe);
      if (!hasEntry) { iframe.srcdoc = buildFolderHtml(files); setStatus('Browsable filesystem (no index.html).'); reveal(); return noop; }

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
      const db = (lockKey && GifOS.lock)
        ? GifOS.lock.makeDb(fileId, lockKey, emit, lockState || { collections: {} })
        : makeLocalDb(fileId, emit);
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
        poolDetach(); // the room is gone; a pending claim or answer has nowhere to land
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
        if (lockKey) {
          return Promise.reject(new Error('This app is passkey-locked. Other devices do not have your passkey, so it cannot be shared live.'));
        }
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
              // The verifier COMMITS TO THE OWNER'S PUBLIC KEY: sec seeds the
              // stage signer's Ed25519 keypair (app-owner createSigner), and
              // av is the 24-hex prefix of SHA-256(raw public key) — the same
              // hash app-owner's makeVerifier binds the first signed frame to.
              // It was SHA-256(sec) before, which nothing could ever match, so
              // every guest trusted whichever status ad named a pk first.
              const sec = randHex(32);
              return appOwnerLib().then((AO) => AO.createSigner(sec)).then((signer) => sha256hexOfBytes(Uint8Array.from(signer.pkHex.match(/../g), (x) => parseInt(x, 16)))).then((h) => {
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
            let stageBus = null, stageSigner = null, stageUnsub = null, snapTimer = null, deltaTimer = null;
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
              if (store.badCollectionName(op.collection)) return;
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
              return appOwnerLib().then((AO) => AO.createSigner(sec || undefined)).then((signer) => {
                stageSigner = signer; stageBus = bus;
                // The pool rides the same lane, UNSIGNED and by design: any peer
                // may answer, and what it answers is content addressed by URL —
                // an owner signature would say only that the owner relayed it,
                // which is not a fact worth the owner's main thread. What that
                // costs is stated plainly in the permission sheet: a pooled
                // answer comes from a peer, not from the site.
                if (poolHosts(manifest).length && !capDisabled(manifest, 'pool')) poolAttach(bus, bus.self);
                stageUnsub = bus.subscribe((m) => {
                  if (!m) return;
                  if (m.kind === 'act') onAct(m.d);
                  else if (m.kind === 'pool') poolOnFrame(m.d);
                });
                // Refresh the retained snapshot (with app bytes) on a debounce,
                // and push a live delta immediately, on every change.
                // The delta is coalesced on a short trailing edge: every put
                // used to assemble, sign and broadcast the FULL state, so an
                // app writing per keystroke multiplied that by its rate.
                stageOnChange = () => {
                  if (!deltaTimer) deltaTimer = setTimeout(() => { deltaTimer = null; sendDelta(); }, 40);
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
        // A locked launch already unwrapped private data into makeDb; do not
        // import leftover clear .state (there should not be any).
        if (lockKey) return;
        if (isEmptyState(state) && files['.state/db.json']) {
          try {
            const embedded = store.unpackJSON(gif.bytesToText(files['.state/db.json']));
            if (embedded && embedded.collections) return db.import(embedded);
          } catch (e) { /* corrupt embedded state — start fresh */ }
        }
      }).then(() => netPolicy.load()).then(() => {
        // Install-time assets backfill (gifos-assets.js): a store install
        // cached these already; a hand-dropped GIF, a ?run= link or a shared
        // SLIM GIF fetches its pinned downloads on first run here into the
        // computer's asset store. SOFT on failure — the app still mounts
        // (offline it can at least explain itself); its gifos.assets() calls
        // name the fix.
        const A = GifOS.assets;
        if (!A) return;
        const cache = A.assetCache(store, fileId);
        return A.missing(files, manifest, cache, { requiredOnly: true }).then((need) => {
          if (!need.length) return null;
          // This wait is minutes, not moments (vocal-remover pins 120 MB of
          // model weights), and statusEl is the MEETING bar's status line —
          // which body.solo-app hides. So the one entry every desktop launch
          // goes through (run.html#id=) watched a BLANK pane while the OS
          // downloaded weights into a hidden element; the meeting-host boot
          // passes no statusEl at all and was silent by construction. The
          // busy pill is the surface built for exactly this shape of work —
          // the OS doing heavy, measured work on an app's behalf — so the
          // backfill drives it too, with ensure()'s own honest fraction.
          // (Held back 600 ms like every pill, so a small asset never flashes.)
          busyStart(manifest.name || 'This app');
          busyNote('One-time download of this app’s data…', null);
          return A.ensure(files, manifest, (s, frac) => { setStatus(s); busyNote(s, frac); }, cache, { requiredOnly: true })
            .then(() => busyEnd(), (e) => {
              // The app still mounts (SOFT), but the person must SEE why it is
              // about to open degraded — hold the pill long enough to read.
              const msg = 'App data download failed — ' + (e && e.message || e) + '. The app opens without it and tries again next launch.';
              setStatus(msg); busyNote(msg, null);
              setTimeout(busyEnd, 8000);
            });
        });
      }).then(() => Promise.resolve(db.getFullState())).then((connectState) => {
        // Snapshot the state AT LOAD once, so the corner app-GIF and a
        // "data at connect time" steal share the same (memoized) bytes.
        const stealCtx = { connectState: connectState, cache: { bytes: null } };
        mountApp(iframe, files, manifest, db, appBytes, netPolicy, fileId, launch);
        if (root.__gifosOnApp) root.__gifosOnApp(appBytes, manifest);
        announceConn({ mode: 'local' });
        setStatus('Running · state saved to this icon');
        return {
          save: () => downloadSnapshot(appBytes, files, manifest, db),
          steal: (opts) => stealApp(appBytes, files, manifest, db, stealCtx, opts),
          becomeHost, sessionInfo, endSession,
          // OS Help: markdown from help.md (or manifest.help) inside the GIF.
          help: () => (GifOS.help && GifOS.help.read) ? GifOS.help.read(files, manifest) : '',
          // Credits: credits.json + manifest name/version from the same sealed bytes.
          credits: () => (GifOS.help && GifOS.help.readCredits) ? GifOS.help.readCredits(files, manifest) : null,
        };
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
            if (store.badCollectionName(collection)) return Promise.reject(new Error('bad collection name'));
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
        // Pool AFTER the manifest lands — capabilities.pool is the app's own
        // declaration, and until the bytes arrive this client does not know
        // what app it is running, let alone what it is allowed to share.
        if (poolHosts(manifestRef).length && !capDisabled(manifestRef, 'pool')) poolAttach({ send: send }, params.self);
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
      // "As I joined": the first FULL state this client ever adopted, kept
      // aside so a steal can take the room as it stood when you walked in —
      // the third of the three steal choices. structuredClone, not JSON: the
      // mirror can carry real Uint8Array blobs (My Media's video).
      let connectState = null;
      const captureConnect = () => {
        if (connectState) return;
        try { connectState = structuredClone(mirror); }
        catch (e) { try { connectState = JSON.parse(JSON.stringify(mirror)); } catch (e2) {} }
      };
      const onSnap = (body) => {
        trace('snap');
        if (body && body.state && body.state.collections) { mirror = body.state; captureConnect(); reconcilePending(); }
        if (!mounted && body && body.app) return mountFromB64(body.app, body.name); // legacy in-snap bytes
        notify('*');
      };

      const unsub = subscribe((m) => {
        if (!m || m.kind === 'act') return; // client->owner direction
        // The pool lane is peer-to-peer and UNSIGNED — it must be handled
        // BEFORE the owner verifier, which exists to make canonical STATE
        // unforgeable and would (correctly) reject every pool frame. A pooled
        // answer makes no claim to authority: it is a cache entry addressed by
        // its URL, offered by whoever has it.
        if (m.kind === 'pool') { poolOnFrame(m.d); return; }
        Promise.resolve(ver.verify(m.d)).then((r) => {
          if (!r.ok) { try { console.error('[bootClientBus] frame REJECTED kind=' + (m.kind || '?') + ' reason=' + (r && r.reason || '?')); } catch (e2) {} return; } // unsigned / impostor / tampered — NEVER canonical
          takeLead(r.body); // the signed lead fence rides every canonical frame
          if (r.kind === 'app') return mountFromB64(r.body && r.body.app, r.body && r.body.name);
          if (r.kind === 'snap') return onSnap(r.body);
          if (r.kind === 'delta') {
            if (r.body && r.body.state && r.body.state.collections) { mirror = r.body.state; captureConnect(); notify('*'); }
            else if (r.body && r.body.collection && r.body.items) { AO.applyDelta(mirror, r.body); notify(r.body.collection); }
            reconcilePending();
          }
        }).catch(() => {});
      });

      setStatus('Connected to the shared app · owner-signed over the mesh');
      return {
        stop: () => { try { unsub && unsub(); } catch (e) {} clearInterval(actSweep); pendingActs.clear(); poolDetach(); },
        // ONE RUNTIME (docs/one-runtime.md): the client's mirror is the room's
        // survival story. snapshot() packs app bytes + the owner-verified
        // mirror into a snapshot GIF — the successor adopts it (resilient
        // rooms) or anyone saves a copy. setFrozen(true) makes shared-
        // collection writes refuse honestly while the owner is away (an
        // optimistic apply the room can never adopt is a lie, not a write).
        snapshot: () => (appBytes && filesRef && manifestRef)
          ? packSnapshot(appBytes, filesRef, manifestRef, mirror)
          : Promise.reject(new Error('app not loaded yet')),
        // Steal from a client mount, filed into this desktop's Stolen Apps —
        // same folder, same ritual. opts.data chooses WHICH copy — the same
        // three the engine has always had (stealApp), restored to the person:
        //   'current' (default) — app + the owner-verified mirror, data and all
        //   'connect'           — app + the room as it stood WHEN YOU JOINED
        //   'none'              — a clean copy: the app alone, nothing shared
        stealToDesktop: (opts) => {
          if (!(appBytes && manifestRef)) return Promise.reject(new Error('app not loaded yet'));
          const dmode = (opts && opts.data) || 'current';
          const clean = dmode === 'none';
          const state = clean ? null
            : dmode === 'connect' ? (connectState || mirror)   // joined pre-snap: honest best
              : mirror;
          return Promise.all([
            clean && filesRef ? stripState(appBytes, filesRef) : Promise.resolve(appBytes),
            ensureStolenFolder(),
          ]).then(([bytes, folder]) => saveAppToDesktop(bytes, manifestRef, state, folder));
        },
        // The live mirror, for suites to watch convergence without stealing.
        mirrorState: () => mirror,
        setFrozen: (f) => { frozen = !!f; },
        // The mounted app's GIF bytes (null until they land). The app bar
        // renders these as the thumbnail — seeing it IS seeing that a Steal
        // would succeed, since it copies exactly these bytes.
        gifBytes: () => appBytes,
        // OS Help: same help.md the host packed. Empty until the bytes land.
        help: () => (GifOS.help && GifOS.help.read) ? GifOS.help.read(filesRef, manifestRef) : '',
        credits: () => (GifOS.help && GifOS.help.readCredits) ? GifOS.help.readCredits(filesRef, manifestRef) : null,
      };
    });
  }

  // poolHosts is EXPORTED because it is the enforcement point for the three
  // pool rules (⊆ network, never keyed, GET only) and a rule nothing can call
  // is a rule nothing can test. poolStats is the same argument for the
  // algorithm: "did the room actually save a fetch" is not visible from
  // outside otherwise.
  GifOS.runtime = { boot, bootClientBus, buildAppHtml, buildFolderHtml, norm, slug, poolHosts, poolStats };
})(typeof window !== 'undefined' ? window : globalThis);
