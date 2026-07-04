/*
 * runtime.js — The GifOS runtime library (runs in the app tab, run.html).
 *
 * Three modes, one app-facing API (window.gifos = { db(), fetch(), save() }):
 *   - standalone/host : boot(mountEl, fileId) runs a local App GIF with a local
 *                       DB. becomeHost() opens a relay session so remote clients
 *                       can join; the local browser hosts the authoritative DB.
 *   - client          : bootClient(mountEl, {s,k,relay}) joins a host over the
 *                       relay, receives the App GIF, and runs it with a RemoteDB
 *                       whose reads/writes are forwarded to the host browser.
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

  // ---- app-facing shim injected into the sandboxed iframe -----------------
  function clientShim() {
    return `(function(){
      var pending = {}, subs = {};
      function rpc(msg){ return new Promise(function(res, rej){
        var id = 'r'+Math.random().toString(36).slice(2);
        pending[id] = { res: res, rej: rej };
        parent.postMessage(Object.assign({ ns:'gifos', id:id }, msg), '*');
      }); }
      window.addEventListener('message', function(e){
        var d = e.data; if(!d || d.ns!=='gifos') return;
        if(d.type==='reply' && pending[d.id]){
          d.ok ? pending[d.id].res(d.result) : pending[d.id].rej(new Error(d.error));
          delete pending[d.id];
        }
        if(d.type==='db-change' && subs[d.collection]){
          subs[d.collection].forEach(function(cb){
            rpc({ type:'db', op:'getAll', collection:d.collection }).then(cb);
          });
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
        info: function(){ return rpc({type:'info'}); }
      };
    })();`;
  }

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
    const shim = '<script>' + clientShim() + '</script>';
    if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => m + shim);
    else html = shim + html;
    return html;
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
  function snapshot(files, manifest, db) {
    return Promise.resolve(db.getFullState()).then((state) => {
      const out = {};
      for (const p in files) if (!p.startsWith('.state/')) out[p] = files[p];
      out['.state/db.json'] = gif.textToBytes(JSON.stringify(state));
      const bytes = gif.encode(out, { accent: manifest.accent });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
      const a = document.createElement('a');
      const name = (manifest.appId || 'app') + '-snapshot.gif';
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return name;
    });
  }

  // ---- DB backends ---------------------------------------------------------
  // Local: authoritative store persisted with the icon; cross-tab via BroadcastChannel.
  function makeLocalDb(fileId, onChange) {
    let state = { collections: {} };
    const chan = ('BroadcastChannel' in root) ? new BroadcastChannel('gifos-app-' + fileId) : null;
    if (chan) chan.onmessage = (e) => { load().then(() => onChange(e.data.collection)); };
    const load = () => store.getState(fileId).then((s) => { if (s) state = s; return state; });
    const persist = () => store.setState(fileId, state);
    const coll = (n) => (state.collections[n] = state.collections[n] || { items: {}, seq: 1 });
    const deep = () => JSON.parse(JSON.stringify(state));
    return {
      load,
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

  // Remote: forwards every op to the host browser over the relay.
  function makeRemoteDb(send) {
    let seq = 1; const pending = new Map();
    const db = {
      op(op, collection, key, value) {
        return new Promise((res, rej) => {
          const id = 'q' + (seq++); pending.set(id, { res, rej });
          send({ t: 'rpc', id, op, collection, key, value });
        });
      },
      getFullState() { return db.op('dump'); },
      _reply(id, ok, result) { const p = pending.get(id); if (!p) return; pending.delete(id); ok ? p.res(result) : p.rej(new Error(result)); },
    };
    return db;
  }

  // ---- mount an app into an iframe with the given DB backend ----------------
  function mountApp(iframe, files, manifest, db) {
    root.addEventListener('message', (e) => {
      if (e.source !== iframe.contentWindow) return;
      const d = e.data; if (!d || d.ns !== 'gifos') return;
      const reply = (p) => iframe.contentWindow.postMessage(Object.assign({ ns: 'gifos', type: 'reply', id: d.id }, p), '*');
      if (d.type === 'db') db.op(d.op, d.collection, d.key, d.value).then((result) => reply({ ok: true, result })).catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
      else if (d.type === 'fetch') bridgeFetch(manifest, d).then((r) => reply({ ok: true, result: r })).catch((err) => reply({ ok: false, error: String(err.message || err) }));
      else if (d.type === 'save') snapshot(files, manifest, db).then((name) => reply({ ok: true, result: name })).catch((err) => reply({ ok: false, error: String(err.message || err) }));
      else if (d.type === 'info') reply({ ok: true, result: { appId: manifest.appId, name: manifest.name, version: manifest.version } });
    });
    iframe.srcdoc = buildAppHtml(files);
  }

  function makeIframe() {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms'); // isolated: null origin
    iframe.style.cssText = 'width:100%;height:100%;border:0;background:#fff';
    return iframe;
  }

  // ---- standalone / host boot ----------------------------------------------
  function boot(mountEl, fileId, statusEl) {
    const setStatus = (m) => { if (statusEl) statusEl.textContent = m; };
    const noop = { save: () => Promise.resolve(null), becomeHost: () => Promise.reject(new Error('nothing running')) };
    return store.getFile(fileId).then((rec) => {
      if (!rec) { setStatus('File not found on this desktop.'); return noop; }
      const appBytes = rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes);
      const archive = gif.decode(appBytes);
      if (!archive) { setStatus('Not a GifOS app — nothing to run.'); return noop; }
      const files = archive.files;
      const manifest = gif.readManifest(archive) || { name: rec.name || 'App' };
      document.title = (manifest.name || 'App') + ' — GifOS';

      const hasEntry = !!files[norm(manifest.entry || 'index.html')] || !!files['index.html'];
      const iframe = makeIframe();
      mountEl.innerHTML = ''; mountEl.appendChild(iframe);
      if (!hasEntry) { iframe.srcdoc = buildFolderHtml(files); setStatus('Browsable filesystem (no index.html).'); return noop; }

      let hostWs = null, clientCount = 0;
      const emit = (collection) => {
        iframe.contentWindow.postMessage({ ns: 'gifos', type: 'db-change', collection }, '*');
        if (hostWs && hostWs.readyState === 1) hostWs.send(JSON.stringify({ t: 'bcast', msg: { t: 'db-change', collection } }));
      };
      const db = makeLocalDb(fileId, emit);

      function becomeHost() {
        const relay = relayUrl();
        if (!relay) return Promise.reject(new Error('No relay configured (set window.GIFOS_RELAY).'));
        const sid = store.uid('s'), token = store.uid('k');
        return new Promise((resolve, reject) => {
          const ws = new WebSocket(relay.replace(/\/$/, '') + '/s/' + sid + '?role=host&token=' + token);
          const timer = setTimeout(() => reject(new Error('relay timeout')), 8000);
          ws.onopen = () => {
            clearTimeout(timer); hostWs = ws;
            setStatus('Hosting · 0 players connected');
            resolve({ shareUrl: location.origin + location.pathname + '#s=' + sid + '&k=' + token + '&relay=' + encodeURIComponent(relay) });
          };
          ws.onerror = () => { clearTimeout(timer); reject(new Error('relay connection failed')); };
          ws.onmessage = (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
            if (m.t === 'peer-join') { clientCount++; ws.send(JSON.stringify({ t: 'to', to: m.peer, msg: { t: 'app', gif: gif.b64encode(appBytes) } })); setStatus('Hosting · ' + clientCount + ' player(s) connected'); }
            else if (m.t === 'peer-leave') { clientCount = Math.max(0, clientCount - 1); setStatus('Hosting · ' + clientCount + ' player(s) connected'); }
            else if (m.t === 'from' && m.msg && m.msg.t === 'rpc') {
              const req = m.msg;
              db.op(req.op, req.collection, req.key, req.value)
                .then((result) => ws.send(JSON.stringify({ t: 'to', to: m.from, msg: { t: 'rpc-reply', id: req.id, ok: true, result } })))
                .catch((err) => ws.send(JSON.stringify({ t: 'to', to: m.from, msg: { t: 'rpc-reply', id: req.id, ok: false, result: String(err.message || err) } })));
            }
          };
        });
      }

      return db.load().then(() => {
        mountApp(iframe, files, manifest, db);
        setStatus('Running · state saved to this icon');
        return { save: () => snapshot(files, manifest, db), becomeHost };
      });
    });
  }

  // ---- client boot (join a host over the relay) ----------------------------
  function bootClient(mountEl, params, statusEl) {
    const setStatus = (m) => { if (statusEl) statusEl.textContent = m; };
    if (!params.relay) { setStatus('No relay in join link.'); return Promise.resolve({ save: () => Promise.resolve(null) }); }
    const ws = new WebSocket(params.relay.replace(/\/$/, '') + '/s/' + params.s + '?role=client&token=' + params.k);
    let iframe = null, remoteDb = null, filesRef = null, manifestRef = null;
    setStatus('Connecting to host…');
    ws.onerror = () => setStatus('Relay connection failed.');
    ws.onclose = () => setStatus('Disconnected from host.');
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'joined') setStatus('Connected · waiting for app…');
      else if (m.t === 'error') setStatus('Cannot join: ' + m.error);
      else if (m.t === 'host-gone') setStatus('Host went offline. Snapshot to keep a copy.');
      else if (m.t === 'app') {
        const archive = gif.decode(gif.b64decode(m.gif));
        if (!archive) { setStatus('Bad app from host.'); return; }
        filesRef = archive.files; manifestRef = gif.readManifest(archive) || { name: 'App' };
        document.title = (manifestRef.name || 'App') + ' — GifOS (client)';
        remoteDb = makeRemoteDb((payload) => ws.send(JSON.stringify(payload)));
        iframe = makeIframe(); mountEl.innerHTML = ''; mountEl.appendChild(iframe);
        mountApp(iframe, filesRef, manifestRef, remoteDb);
        setStatus('Running as client · state hosted remotely');
      } else if (m.t === 'rpc-reply') { if (remoteDb) remoteDb._reply(m.id, m.ok, m.result); }
      else if (m.t === 'db-change') { if (iframe) iframe.contentWindow.postMessage({ ns: 'gifos', type: 'db-change', collection: m.collection }, '*'); }
    };
    return Promise.resolve({ save: () => (filesRef ? snapshot(filesRef, manifestRef, remoteDb) : Promise.resolve(null)) });
  }

  GifOS.runtime = { boot, bootClient, buildAppHtml, buildFolderHtml, norm };
})(typeof window !== 'undefined' ? window : globalThis);
