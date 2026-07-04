/*
 * runtime.js — The GifOS runtime library (runs in the app tab, run.html).
 *
 * Unpacks an App GIF into a filesystem, mounts its index.html in an isolated
 * (sandboxed) iframe, and mediates every privileged operation the app asks for:
 *   - db(): a collection store persisted WITH the app's desktop icon, and
 *           synced live across tabs (local server/client demo via BroadcastChannel).
 *   - fetch(): external-API bridge, gated by the manifest network allowlist.
 *   - save(): snapshot the app + state back into a self-contained GIF.
 * If the GIF has no index.html, we render a browsable filesystem instead.
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

  function dataUrl(path, bytes) {
    return 'data:' + mimeOf(path) + ';base64,' + gif.b64encode(bytes);
  }

  // ---- the shim injected into the app iframe (app-facing `window.gifos`) ---
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
        db: function(collection){
          return {
            put:    function(item){ return rpc({type:'db',op:'put',collection:collection,value:item}); },
            get:    function(id){   return rpc({type:'db',op:'get',collection:collection,key:id}); },
            getAll: function(){     return rpc({type:'db',op:'getAll',collection:collection}); },
            delete: function(id){   return rpc({type:'db',op:'delete',collection:collection,key:id}); },
            subscribe: function(cb){
              (subs[collection]=subs[collection]||[]).push(cb);
              rpc({type:'db',op:'getAll',collection:collection}).then(cb); // prime
            }
          };
        },
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
    // inline <script src="rel">
    html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi, (m, src) => {
      const key = norm(src);
      if (files[key]) return '<script>' + gif.bytesToText(files[key]) + '</script>';
      return m;
    });
    // inline <link rel=stylesheet href="rel">
    html = html.replace(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi, (m, href) => {
      const key = norm(href);
      if (files[key] && /stylesheet/i.test(m)) return '<style>' + gif.bytesToText(files[key]) + '</style>';
      return m;
    });
    // rewrite remaining src="rel"/href="rel" (images, etc.) to data URLs
    html = html.replace(/\b(src|href)=["']([^"']+)["']/gi, (m, attr, ref) => {
      const key = norm(ref);
      if (files[key]) return attr + '="' + dataUrl(key, files[key]) + '"';
      return m;
    });
    const shim = '<script>' + clientShim() + '</script>';
    // put the shim first so window.gifos exists before app code runs
    if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => m + shim);
    else html = shim + html;
    return html;
  }
  // strip leading "./" and "/" so "index.html", "./index.html", "/index.html" match
  const norm = (p) => p.replace(/^\.?\//, '');

  // ---- browsable-folder fallback (no index.html) ---------------------------
  function buildFolderHtml(files) {
    const rows = Object.keys(files).sort().map((p) => {
      const size = files[p].length;
      return '<tr><td><a href="' + dataUrl(p, files[p]) + '" target="_blank">' + escapeHtml(p) + '</a></td><td>' + size + ' B</td></tr>';
    }).join('');
    return '<!doctype html><meta charset="utf-8"><style>' +
      'body{font:14px system-ui;background:#0a0a0f;color:#e0e0f0;padding:2rem}' +
      'h2{color:#7b5cff}table{border-collapse:collapse;width:100%}td{padding:.4rem .8rem;border-bottom:1px solid #2a2a3f}' +
      'a{color:#7b5cff;text-decoration:none}a:hover{text-decoration:underline}</style>' +
      '<h2>📁 GIF filesystem — no index.html</h2><p>This GIF has no entry point, so it is browsable like an open folder.</p>' +
      '<table>' + rows + '</table>';
  }
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- DB backing (state lives with the icon; synced across tabs) ----------
  function makeDb(fileId, onChange) {
    let state = { collections: {} };
    const chan = ('BroadcastChannel' in root) ? new BroadcastChannel('gifos-app-' + fileId) : null;
    if (chan) chan.onmessage = (e) => { load().then(() => onChange(e.data.collection)); };

    function load() { return store.getState(fileId).then((s) => { if (s) state = s; return state; }); }
    function persist() { return store.setState(fileId, state); }
    function coll(name) { return (state.collections[name] = state.collections[name] || { items: {}, seq: 1 }); }

    return {
      load,
      op(op, collection, key, value) {
        return load().then(() => {
          const c = coll(collection);
          let result = null, changed = false;
          if (op === 'put') {
            const item = Object.assign({}, value);
            if (item.id == null) item.id = collection + '_' + (c.seq++);
            c.items[item.id] = item; result = item; changed = true;
          } else if (op === 'get') {
            result = c.items[key] || null;
          } else if (op === 'getAll') {
            result = Object.keys(c.items).map((k) => c.items[k]);
          } else if (op === 'delete') {
            delete c.items[key]; result = true; changed = true;
          }
          if (!changed) return result;
          return persist().then(() => {
            if (chan) chan.postMessage({ collection });
            onChange(collection);
            return result;
          });
        });
      },
      snapshotState() { return JSON.parse(JSON.stringify(state)); },
    };
  }

  // ---- main boot -----------------------------------------------------------
  function boot(mountEl, fileId, statusEl) {
    const setStatus = (m) => { if (statusEl) statusEl.textContent = m; };
    return store.getFile(fileId).then((rec) => {
      if (!rec) { setStatus('File not found on this desktop.'); return; }
      const bytes = rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes);
      const archive = gif.decode(bytes);
      if (!archive) { setStatus('Not a GifOS app — nothing to run.'); return; }
      const files = archive.files;
      const manifest = gif.readManifest(archive) || { name: rec.name || 'App' };
      document.title = (manifest.name || 'App') + ' — GifOS';

      const hasEntry = !!files[norm(manifest.entry || 'index.html')] || !!files['index.html'];
      const iframe = document.createElement('iframe');
      // Isolated: null origin (no same-origin escape). allow-forms lets apps use
      // <form> submit handlers; we deliberately withhold allow-same-origin.
      iframe.setAttribute('sandbox', 'allow-scripts allow-forms');
      iframe.style.cssText = 'width:100%;height:100%;border:0;background:#fff';
      mountEl.innerHTML = '';
      mountEl.appendChild(iframe);

      if (!hasEntry) {
        iframe.srcdoc = buildFolderHtml(files);
        setStatus('Browsable filesystem (no index.html).');
        return { save: () => Promise.resolve(null) };
      }

      const db = makeDb(fileId, (collection) => {
        iframe.contentWindow.postMessage({ ns: 'gifos', type: 'db-change', collection }, '*');
      });

      // message bridge from the app
      root.addEventListener('message', (e) => {
        if (e.source !== iframe.contentWindow) return;
        const d = e.data; if (!d || d.ns !== 'gifos') return;
        const reply = (payload) => iframe.contentWindow.postMessage(Object.assign({ ns: 'gifos', type: 'reply', id: d.id }, payload), '*');

        if (d.type === 'db') {
          db.op(d.op, d.collection, d.key, d.value)
            .then((result) => reply({ ok: true, result }))
            .catch((err) => reply({ ok: false, error: String(err && err.message || err) }));
        } else if (d.type === 'fetch') {
          bridgeFetch(manifest, d).then((r) => reply({ ok: true, result: r })).catch((err) => reply({ ok: false, error: String(err.message || err) }));
        } else if (d.type === 'save') {
          snapshot(files, manifest, db).then((name) => reply({ ok: true, result: name })).catch((err) => reply({ ok: false, error: String(err.message || err) }));
        } else if (d.type === 'info') {
          reply({ ok: true, result: { appId: manifest.appId, name: manifest.name, version: manifest.version, fileId } });
        }
      });

      return db.load().then(() => {
        iframe.srcdoc = buildAppHtml(files);
        setStatus('Running · state saved to this icon');
        return { save: () => snapshot(files, manifest, db) };
      });
    });
  }

  // ---- external-API bridge (manifest-gated) --------------------------------
  function isAllowed(manifest, host) {
    const allowed = (manifest.capabilities && manifest.capabilities.network) || [];
    return allowed.some((p) => p === '*' || host === p || host.endsWith('.' + p));
  }
  function bridgeFetch(manifest, d) {
    let host;
    try { host = new URL(d.url).hostname; } catch (e) { return Promise.reject(new Error('bad url')); }
    if (!isAllowed(manifest, host)) return Promise.reject(new Error('Network denied: ' + host + ' not in app permissions'));
    return fetch(d.url, { method: d.method, headers: d.headers, body: d.body || undefined })
      .then((resp) => resp.text().then((body) => ({
        status: resp.status, headers: Object.fromEntries(resp.headers.entries()), body,
      })));
  }

  // ---- snapshot: re-pack app + current state into a self-contained GIF -----
  function snapshot(files, manifest, db) {
    const out = {};
    for (const p in files) if (!p.startsWith('.state/')) out[p] = files[p];
    out['.state/db.json'] = gif.textToBytes(JSON.stringify(db.snapshotState()));
    const bytes = gif.encode(out, { accent: manifest.accent });
    const blob = new Blob([bytes], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = (manifest.appId || 'app') + '-snapshot.gif';
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return Promise.resolve(name);
  }

  GifOS.runtime = { boot, buildAppHtml, buildFolderHtml, norm };
})(typeof window !== 'undefined' ? window : globalThis);
