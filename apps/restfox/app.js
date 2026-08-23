/* Restfox — GifOS HTTP client.
 *
 * Collections live in gifos.db. The only network path is Host.fetch → gifos.fetch
 * (connect-src is 'none'). Restfox's web-standalone is a Node proxy; there is no
 * Node here, so Send is the browser's CORS rules plus an optional GifOS proxy.
 */
(function () {
  'use strict';

  var METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  var BODY_TYPES = [
    { id: '', label: 'No Body' },
    { id: 'application/json', label: 'JSON' },
    { id: 'text/plain', label: 'Text' },
    { id: 'application/x-www-form-urlencoded', label: 'Form URL encoded' },
  ];
  var STATUS = {
    200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently',
    302: 'Found', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized',
    403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
    408: 'Request Timeout', 409: 'Conflict', 413: 'Payload Too Large',
    415: 'Unsupported Media Type', 429: 'Too Many Requests',
    500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable',
  };
  var HIST_CAP = 64 * 1024;
  var DEL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  var $ = function (id) { return document.getElementById(id); };
  var itemsDb = Host.db('items');
  var wsDb = Host.db('workspace');
  var histDb = Host.db('history');

  var items = [];
  var ws = { id: 'ws', envs: [], envId: '', proxy: false, selectedId: '' };
  var selectedId = '';
  var reqTab = 'query';
  var respTab = 'body';
  var sending = false;
  var response = null;
  var saveTimer = 0;
  var sheetKind = null;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function byId(id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }
  function childrenOf(pid) {
    return items.filter(function (it) { return (it.parent || null) === pid; })
      .sort(function (a, b) { return (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name); });
  }
  function envMap() {
    var e = null;
    for (var i = 0; i < ws.envs.length; i++) if (ws.envs[i].id === ws.envId) e = ws.envs[i];
    return (e && e.vars) || {};
  }
  function subst(str) {
    var vars = envMap();
    return String(str == null ? '' : str).replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (_, k) {
      var key = k.trim();
      return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : '{{' + key + '}}';
    });
  }
  function kv(list) {
    return (list || []).map(function (r) {
      return { n: r.n || '', v: r.v || '', on: r.on !== false };
    });
  }
  function blankReq(parent) {
    return {
      id: uid(), type: 'request', parent: parent || null, name: 'New Request',
      method: 'GET', url: 'https://', query: [], headers: [],
      bodyMime: '', bodyText: '',
      auth: { type: 'none', user: '', pass: '', token: '' },
      sort: Date.now(), collapsed: false,
    };
  }
  function blankFolder(parent) {
    return {
      id: uid(), type: 'folder', parent: parent || null, name: 'New Folder',
      sort: Date.now(), collapsed: false,
    };
  }

  function seed() {
    var f = blankFolder(null);
    f.name = 'examples';
    var a = blankReq(f.id);
    a.name = 'httpbin json'; a.method = 'GET'; a.url = 'https://httpbin.org/json';
    var b = blankReq(f.id);
    b.name = 'jsonplaceholder todo'; b.method = 'GET';
    b.url = 'https://jsonplaceholder.typicode.com/todos/1';
    var c = blankReq(f.id);
    c.name = 'httpbin post'; c.method = 'POST'; c.url = 'https://httpbin.org/post';
    c.bodyMime = 'application/json';
    c.bodyText = '{\n  "ok": true\n}';
    c.headers = [{ n: 'Content-Type', v: 'application/json', on: true }];
    return [f, a, b, c];
  }

  function persistItem(it) { return itemsDb.put(it); }
  function persistWs() {
    ws.selectedId = selectedId;
    return wsDb.put(ws);
  }
  function queueSave(it) {
    if (it) persistItem(it);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistWs, 200);
  }

  function current() { return byId(selectedId); }

  function applyEditor() {
    var it = current();
    if (!it || it.type !== 'request') return;
    it.method = $('method').value;
    it.url = $('url').value;
    it.name = $('req-name').value || it.name;
    it.auth = it.auth || { type: 'none', user: '', pass: '', token: '' };
    queueSave(it);
  }

  function setSelected(id) {
    applyEditor();
    selectedId = id;
    ws.selectedId = id;
    persistWs();
    response = null;
    if (id) {
      histDb.get(id).then(function (h) {
        if (selectedId !== id) return;
        if (h) response = h;
        render();
      });
    }
    render();
  }

  function addItem(it) {
    items.push(it);
    persistItem(it);
    if (it.type === 'request') setSelected(it.id);
    else render();
  }

  function removeItem(id) {
    var drop = {};
    function walk(pid) {
      drop[pid] = 1;
      childrenOf(pid).forEach(function (c) { walk(c.id); });
    }
    walk(id);
    items = items.filter(function (it) {
      if (!drop[it.id]) return true;
      itemsDb.delete(it.id);
      histDb.delete(it.id);
      return false;
    });
    if (drop[selectedId]) selectedId = '';
    persistWs();
    render();
  }

  function duplicate(id) {
    var src = byId(id);
    if (!src || src.type !== 'request') return;
    var it = JSON.parse(JSON.stringify(src));
    it.id = uid();
    it.name = src.name + ' copy';
    it.sort = Date.now();
    addItem(it);
  }

  function filterMatch(it, q) {
    if (!q) return true;
    var hay = (it.name + ' ' + (it.url || '') + ' ' + (it.method || '')).toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function renderTree() {
    var q = ($('filter').value || '').trim().toLowerCase();
    var html = '';
    function draw(pid, depth) {
      childrenOf(pid).forEach(function (it) {
        var kids = childrenOf(it.id);
        var show = filterMatch(it, q) || kids.some(function (k) { return filterMatch(k, q); });
        if (q && !show) return;
        var pad = 8 + depth * 14;
        if (it.type === 'folder') {
          html += '<div class="item' + (it.id === selectedId ? ' on' : '') + '" data-id="' + esc(it.id) + '" style="padding-left:' + pad + 'px">';
          html += '<span class="twist">' + (it.collapsed && !q ? '▸' : '▾') + '</span>';
          html += '<span class="nm">' + esc(it.name) + '</span></div>';
          if (!it.collapsed || q) draw(it.id, depth + 1);
        } else {
          html += '<div class="item' + (it.id === selectedId ? ' on' : '') + '" data-id="' + esc(it.id) + '" style="padding-left:' + pad + 'px">';
          html += '<span class="twist"></span>';
          html += '<span class="method-tag m-' + esc(it.method || 'GET') + '">' + esc(it.method || 'GET') + '</span>';
          html += '<span class="nm">' + esc(it.name) + '</span></div>';
        }
      });
    }
    draw(null, 0);
    $('tree').innerHTML = html || '<div class="item" style="color:var(--muted)">No requests yet</div>';
  }

  function renderKv(kind, rows) {
    var html = '<table class="kv"><tbody>';
    (rows || []).forEach(function (r, i) {
      html += '<tr class="' + (r.on === false ? 'gone' : '') + '" data-i="' + i + '">';
      html += '<td style="width:28px"><input type="checkbox" data-f="on"' + (r.on === false ? '' : ' checked') + '></td>';
      html += '<td><input type="text" data-f="n" value="' + esc(r.n) + '" placeholder="name" spellcheck="false"></td>';
      html += '<td><input type="text" data-f="v" value="' + esc(r.v) + '" placeholder="value" spellcheck="false"></td>';
      html += '<td style="width:36px;text-align:center"><button type="button" class="row-del" data-del="' + i + '" title="Remove">' + DEL + '</button></td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    html += '<button type="button" class="btn" id="kv-add" style="margin-top:.4rem">+ Add</button>';
    $('req-pane').innerHTML = html;
    $('req-pane').onchange = $('req-pane').oninput = function (e) {
      var t = e.target, tr = t.closest('tr'), it = current();
      if (!it || !tr) return;
      var i = +tr.getAttribute('data-i'), f = t.getAttribute('data-f');
      if (f === 'on') it[kind][i].on = t.checked;
      else if (f) it[kind][i][f] = t.value;
      queueSave(it);
      if (f === 'on') tr.classList.toggle('gone', !t.checked);
    };
    $('req-pane').onclick = function (e) {
      var t = e.target, it = current();
      if (!it) return;
      if (t.id === 'kv-add') {
        it[kind] = kv(it[kind]);
        it[kind].push({ n: '', v: '', on: true });
        queueSave(it); renderReqPane(); return;
      }
      var btn = t.closest && t.closest('[data-del]');
      if (btn) {
        it[kind].splice(+btn.getAttribute('data-del'), 1);
        queueSave(it); renderReqPane();
      }
    };
  }

  function renderReqPane() {
    var it = current();
    if (!it) return;
    if (reqTab === 'query') return renderKv('query', kv(it.query));
    if (reqTab === 'headers') return renderKv('headers', kv(it.headers));
    if (reqTab === 'body') {
      var opts = BODY_TYPES.map(function (b) {
        return '<option value="' + esc(b.id) + '"' + (it.bodyMime === b.id ? ' selected' : '') + '>' + esc(b.label) + '</option>';
      }).join('');
      var html = '<select id="body-mime" class="body-mime">' + opts + '</select>';
      if (it.bodyMime) html += '<textarea id="body-text" class="body" spellcheck="false">' + esc(it.bodyText || '') + '</textarea>';
      $('req-pane').innerHTML = html;
      $('req-pane').onchange = $('req-pane').oninput = function (e) {
        if (e.target.id === 'body-mime') { it.bodyMime = e.target.value; queueSave(it); renderReqPane(); }
        if (e.target.id === 'body-text') { it.bodyText = e.target.value; queueSave(it); }
      };
      $('req-pane').onclick = null;
      return;
    }
    var a = it.auth || { type: 'none' };
    var html = '<div class="auth-row"><label>Type <select id="auth-type">';
    [['none', 'No Auth'], ['basic', 'Basic'], ['bearer', 'Bearer']].forEach(function (p) {
      html += '<option value="' + p[0] + '"' + (a.type === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
    });
    html += '</select></label>';
    if (a.type === 'basic') {
      html += '<input id="auth-user" type="text" placeholder="username" value="' + esc(a.user || '') + '">';
      html += '<input id="auth-pass" type="password" placeholder="password" value="' + esc(a.pass || '') + '">';
    } else if (a.type === 'bearer') {
      html += '<input id="auth-token" type="text" placeholder="token" value="' + esc(a.token || '') + '" spellcheck="false">';
    }
    html += '</div>';
    $('req-pane').innerHTML = html;
    $('req-pane').onchange = $('req-pane').oninput = function (e) {
      it.auth = it.auth || { type: 'none', user: '', pass: '', token: '' };
      if (e.target.id === 'auth-type') { it.auth.type = e.target.value; queueSave(it); renderReqPane(); }
      if (e.target.id === 'auth-user') { it.auth.user = e.target.value; queueSave(it); }
      if (e.target.id === 'auth-pass') { it.auth.pass = e.target.value; queueSave(it); }
      if (e.target.id === 'auth-token') { it.auth.token = e.target.value; queueSave(it); }
    };
    $('req-pane').onclick = null;
  }

  function pretty(text, mime) {
    if (!text) return '';
    if (/json/i.test(mime || '') || /^\s*[\[{]/.test(text)) {
      try { return JSON.stringify(JSON.parse(text), null, 2); } catch (e) {}
    }
    return text;
  }

  function renderResp() {
    var meta = $('resp-meta');
    var body = $('resp-body');
    if (sending) { meta.innerHTML = 'Sending…'; body.textContent = ''; return; }
    if (!response) { meta.textContent = 'Response'; body.textContent = ''; return; }
    if (response.error) {
      meta.innerHTML = '<span class="err">Error</span>';
      body.textContent = response.error;
      return;
    }
    var cls = response.status >= 500 || response.status === 0 ? 'err'
      : response.status >= 400 ? 'warn'
      : 'ok';
    var st = response.statusText || STATUS[response.status] || '';
    var bits = [
      '<span class="' + cls + '">' + esc(response.status) + (st ? ' ' + esc(st) : '') + '</span>',
      response.time != null ? esc(response.time) + ' ms' : '',
      response.size != null ? humanSize(response.size) : '',
      response.url ? '<span title="' + esc(response.url) + '">' + esc(shortUrl(response.url)) + '</span>' : '',
    ];
    meta.innerHTML = bits.filter(Boolean).join('<span>·</span>');
    if (respTab === 'headers') {
      var h = response.headers || {};
      var lines = Object.keys(h).sort().map(function (k) { return k + ': ' + h[k]; });
      body.textContent = lines.join('\n') || '(none)';
    } else {
      body.textContent = pretty(response.body || '', (response.headers && response.headers['content-type']) || '');
    }
  }

  function humanSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (Math.round(n / 102.4) / 10) + ' KB';
    return (Math.round(n / 10485.76) / 10) + ' MB';
  }
  function shortUrl(u) {
    try { var x = new URL(u); return x.host + x.pathname; } catch (e) { return u; }
  }

  function renderTabs() {
    function tabs(el, ids, cur, set) {
      el.innerHTML = ids.map(function (p) {
        return '<button type="button" class="tab' + (cur === p[0] ? ' on' : '') + '" data-t="' + p[0] + '">' + p[1] + '</button>';
      }).join('');
      el.onclick = function (e) {
        var t = e.target.getAttribute && e.target.getAttribute('data-t');
        if (t) { set(t); render(); }
      };
    }
    tabs($('req-tabs'), [['query', 'Query'], ['headers', 'Headers'], ['body', 'Body'], ['auth', 'Auth']], reqTab, function (t) { reqTab = t; });
    tabs($('resp-tabs'), [['body', 'Body'], ['headers', 'Headers']], respTab, function (t) { respTab = t; });
  }

  function renderEnv() {
    var sel = $('env');
    sel.innerHTML = ws.envs.map(function (e) {
      return '<option value="' + esc(e.id) + '"' + (e.id === ws.envId ? ' selected' : '') + '>' + esc(e.name) + '</option>';
    }).join('') || '<option value="">Default</option>';
  }

  function renderEditor() {
    var it = current();
    var empty = !it || it.type !== 'request';
    $('empty').hidden = !empty;
    $('editor').hidden = empty;
    if (empty) return;
    $('method').value = it.method || 'GET';
    $('url').value = it.url || '';
    $('req-name').value = it.name || '';
    $('proxy').checked = !!ws.proxy;
    $('btn-send').disabled = sending;
    $('btn-send').textContent = sending ? '…' : 'Send';
    renderReqPane();
    renderResp();
  }

  function render() {
    renderTree();
    renderEnv();
    renderTabs();
    renderEditor();
  }

  function headersOf(it) {
    var h = {};
    kv(it.headers).forEach(function (r) {
      if (!r.on || !r.n) return;
      var name = subst(r.n), val = subst(r.v);
      if (name in h) h[name] += ', ' + val;
      else h[name] = val;
    });
    var a = it.auth || { type: 'none' };
    if (a.type === 'basic' && a.user != null) {
      h.Authorization = 'Basic ' + btoa(unescape(encodeURIComponent(subst(a.user) + ':' + subst(a.pass || ''))));
    } else if (a.type === 'bearer' && a.token) {
      h.Authorization = 'Bearer ' + subst(a.token);
    }
    if (it.bodyMime && it.method !== 'GET' && it.method !== 'HEAD' && !headerHas(h, 'content-type')) {
      h['Content-Type'] = it.bodyMime;
    }
    return h;
  }
  function headerHas(h, name) {
    name = name.toLowerCase();
    for (var k in h) if (k.toLowerCase() === name) return true;
    return false;
  }

  function buildUrl(it) {
    var raw = subst(it.url || '').trim();
    if (!raw) throw new Error('URL is empty');
    var u;
    try { u = new URL(raw); } catch (e) { throw new Error('Invalid URL'); }
    var qs = kv(it.query).filter(function (r) { return r.on && r.n; });
    if (qs.length) {
      u.search = '';
      qs.forEach(function (r) { u.searchParams.append(subst(r.n), subst(r.v)); });
    }
    return u.toString();
  }

  function buildBody(it) {
    if (!it.bodyMime || it.method === 'GET' || it.method === 'HEAD') return null;
    return subst(it.bodyText || '');
  }

  function corsHint(err) {
    var m = String(err || '');
    if (/Network denied/i.test(m)) {
      return m + '\n\nThis app asks to reach any site, which is why GifOS labelled it Unsafe. If you unticked a host, turn it back on from the chip in the tab.';
    }
    if (/Failed to fetch|CORS|NetworkError|TypeError/i.test(m) || /Load failed/i.test(m)) {
      return m + '\n\nThe host refused the browser (CORS). Restfox on the desktop would get past this with its own proxy; here the request runs in this browser, so only sites that send CORS headers will answer. The CORS-proxy checkbox only helps for hosts on GifOS\'s own allow-list, not arbitrary APIs.';
    }
    if (/only https/i.test(m)) {
      return m + '\n\ngifos.fetch is https only (localhost http is the exception).';
    }
    if (/too large/i.test(m)) {
      return m + '\n\nResponses are capped at 8 MB.';
    }
    return m;
  }

  function send() {
    applyEditor();
    var it = current();
    if (!it || it.type !== 'request' || sending) return;
    var url, headers, body;
    try {
      url = buildUrl(it);
      headers = headersOf(it);
      body = buildBody(it);
    } catch (e) {
      response = { error: String(e.message || e), status: 0 };
      renderResp();
      return;
    }
    sending = true;
    renderEditor();
    var t0 = Date.now();
    Host.fetch(url, { method: it.method || 'GET', headers: headers, body: body, proxy: !!ws.proxy })
      .then(function (r) {
        return r.text().then(function (text) {
          var rec = {
            id: it.id,
            status: r.status,
            statusText: STATUS[r.status] || '',
            headers: r.headers || {},
            body: text,
            time: Date.now() - t0,
            size: text ? new Blob([text]).size : 0,
            url: url,
            error: '',
            at: Date.now(),
          };
          response = rec;
          var stored = Object.assign({}, rec);
          if (stored.body && stored.body.length > HIST_CAP) stored.body = stored.body.slice(0, HIST_CAP) + '\n…truncated';
          histDb.put(stored);
        });
      })
      .catch(function (err) {
        response = { error: corsHint(err && err.message ? err.message : err), status: 0, time: Date.now() - t0, url: url };
      })
      .then(function () { sending = false; render(); });
  }

  function exportCollection() {
    var payload = {
      exportedFrom: 'Restfox-1.0.0',
      collection: items.map(toRestfoxItem),
      environments: ws.envs.map(function (e) {
        return { name: e.name, environment: e.vars || {}, color: e.color || '#7f4fd5' };
      }),
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Restfox.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function toRestfoxItem(it) {
    if (it.type === 'folder') {
      return { _id: it.id, _type: 'request_group', name: it.name, parentId: it.parent, sortOrder: it.sort };
    }
    return {
      _id: it.id, _type: 'request', name: it.name, parentId: it.parent,
      method: it.method, url: it.url, sortOrder: it.sort,
      headers: kv(it.headers).map(function (r) { return { name: r.n, value: r.v, disabled: r.on === false }; }),
      parameters: kv(it.query).map(function (r) { return { name: r.n, value: r.v, disabled: r.on === false }; }),
      body: { mimeType: it.bodyMime || 'No Body', text: it.bodyText || '' },
      authentication: it.auth && it.auth.type === 'basic'
        ? { type: 'basic', username: it.auth.user, password: it.auth.pass }
        : it.auth && it.auth.type === 'bearer'
          ? { type: 'bearer', token: it.auth.token }
          : { type: 'No Auth' },
    };
  }

  function fromRestfox(json) {
    var col = json.collection || json;
    if (!Array.isArray(col)) throw new Error('Not a Restfox export');
    var out = [];
    function flatten(arr, parent) {
      arr.forEach(function (n) {
        var id = n._id || uid();
        var pid = n.parentId == null ? parent : n.parentId;
        if (n._type === 'request_group' || n._type === 'folder') {
          out.push({ id: id, type: 'folder', parent: pid || null, name: n.name || 'Folder', sort: n.sortOrder || 0, collapsed: false });
          if (n.children) flatten(n.children, id);
        } else if (n._type === 'socket') {
          /* sockets are not available in the sandbox */
        } else {
          var body = n.body || {};
          var mime = body.mimeType && body.mimeType !== 'No Body' ? body.mimeType : '';
          var auth = n.authentication || {};
          var a = { type: 'none', user: '', pass: '', token: '' };
          if (auth.type === 'basic') a = { type: 'basic', user: auth.username || '', pass: auth.password || '', token: '' };
          if (auth.type === 'bearer' || auth.type === 'oauth2') a = { type: 'bearer', user: '', pass: '', token: auth.token || '' };
          out.push({
            id: id, type: 'request', parent: pid || null, name: n.name || 'Request',
            method: n.method || 'GET', url: n.url || '',
            query: (n.parameters || []).map(function (p) { return { n: p.name || '', v: p.value || '', on: !p.disabled }; }),
            headers: (n.headers || []).map(function (p) { return { n: p.name || '', v: p.value || '', on: !p.disabled }; }),
            bodyMime: mime, bodyText: body.text || '', auth: a,
            sort: n.sortOrder || 0, collapsed: false,
          });
        }
      });
    }
    flatten(col, null);
    return out;
  }

  function importJson(text) {
    var json = JSON.parse(text);
    var next = fromRestfox(json);
    if (!next.length) throw new Error('Nothing to import');
    var map = {};
    next.forEach(function (it) { map[it.id] = uid(); });
    next.forEach(function (it) {
      it.id = map[it.id];
      it.parent = it.parent && map[it.parent] ? map[it.parent] : null;
      items.push(it);
      persistItem(it);
    });
    if (json.environments && json.environments.length) {
      json.environments.forEach(function (e) {
        ws.envs.push({ id: uid(), name: e.name || 'Env', vars: e.environment || e.vars || {}, color: e.color });
      });
      if (!ws.envId && ws.envs.length) ws.envId = ws.envs[0].id;
    }
    var first = next.filter(function (i) { return i.type === 'request'; })[0];
    if (first) selectedId = first.id;
    persistWs();
    render();
  }

  function parseCurl(src) {
    var s = src.trim().replace(/^curl\s+/i, '');
    var method = 'GET', url = '', headers = [], body = '', bodyMime = '';
    var re = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+)/g, parts = [], m;
    while ((m = re.exec(s))) parts.push(m[1]);
    function unq(x) {
      if ((x[0] === '"' && x.slice(-1) === '"') || (x[0] === "'" && x.slice(-1) === "'")) return x.slice(1, -1);
      return x;
    }
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === '-X' || p === '--request') { method = unq(parts[++i] || 'GET').toUpperCase(); continue; }
      if (p === '-H' || p === '--header') {
        var hv = unq(parts[++i] || ''), sp = hv.indexOf(':');
        if (sp > 0) headers.push({ n: hv.slice(0, sp).trim(), v: hv.slice(sp + 1).trim(), on: true });
        continue;
      }
      if (p === '-d' || p === '--data' || p === '--data-raw' || p === '--data-binary') {
        body = unq(parts[++i] || '');
        if (method === 'GET') method = 'POST';
        continue;
      }
      if (p[0] === '-') continue;
      url = unq(p);
    }
    if (/^\s*[\[{]/.test(body)) bodyMime = 'application/json';
    else if (body) bodyMime = 'application/x-www-form-urlencoded';
    if (!url) throw new Error('No URL in curl');
    var it = blankReq(null);
    it.name = url.replace(/^https?:\/\//, '').slice(0, 40);
    it.method = METHODS.indexOf(method) >= 0 ? method : 'GET';
    it.url = url; it.headers = headers; it.bodyMime = bodyMime; it.bodyText = body;
    return it;
  }

  function openSheet(kind, extra) {
    sheetKind = kind;
    var html = '<div class="modal">';
    if (kind === 'menu') {
      html += '<h2>Collection</h2>';
      html += '<div class="row"><button type="button" class="btn" data-act="export">Export JSON</button>';
      html += '<button type="button" class="btn" data-act="import">Import JSON</button>';
      html += '<button type="button" class="btn" data-act="curl">Import curl</button></div>';
      html += '<p class="hint">Restfox-1.0.0 export. Sockets and plugins are dropped — the sandbox has no WebSocket and no eval.</p>';
      html += '<div class="row"><button type="button" class="btn" data-act="close">Close</button></div>';
    } else if (kind === 'env') {
      var e = null;
      for (var i = 0; i < ws.envs.length; i++) if (ws.envs[i].id === ws.envId) e = ws.envs[i];
      var lines = '';
      if (e && e.vars) Object.keys(e.vars).forEach(function (k) { lines += k + '=' + e.vars[k] + '\n'; });
      html += '<h2>Environment</h2>';
      html += '<p class="hint">One NAME=value per line. Use them as {{NAME}} in the URL, headers, or body. They stay in gifos.db on this device.</p>';
      html += '<input id="env-name" type="text" value="' + esc(e ? e.name : 'Default') + '" placeholder="name">';
      html += '<textarea id="env-body" style="margin-top:.4rem">' + esc(lines) + '</textarea>';
      html += '<div class="row"><button type="button" class="btn send" data-act="save-env">Save</button>';
      html += '<button type="button" class="btn" data-act="close">Close</button></div>';
    } else if (kind === 'import') {
      html += '<h2>Import</h2><p class="hint">Paste a Restfox JSON export, or choose a file.</p>';
      html += '<textarea id="import-text" placeholder="{ &quot;exportedFrom&quot;: &quot;Restfox-1.0.0&quot;, … }"></textarea>';
      html += '<input id="import-file" type="file" accept="application/json,.json" style="margin-top:.4rem">';
      html += '<div class="row"><button type="button" class="btn send" data-act="do-import">Import</button>';
      html += '<button type="button" class="btn" data-act="close">Close</button></div>';
    } else if (kind === 'curl') {
      html += '<h2>Import curl</h2><p class="hint">A single curl command. Flags beyond -X -H -d are ignored.</p>';
      html += '<textarea id="curl-text" placeholder="curl -X POST https://httpbin.org/post -H \'Content-Type: application/json\' -d \'{\"a\":1}\'"></textarea>';
      html += '<div class="row"><button type="button" class="btn send" data-act="do-curl">Import</button>';
      html += '<button type="button" class="btn" data-act="close">Close</button></div>';
    } else if (kind === 'item') {
      var it = byId(extra);
      html += '<h2>' + esc(it ? it.name : '') + '</h2>';
      html += '<div class="row">';
      if (it && it.type === 'request') html += '<button type="button" class="btn" data-act="dup">Duplicate</button>';
      html += '<button type="button" class="btn" data-act="ren">Rename</button>';
      html += '<button type="button" class="btn" data-act="del">Delete</button>';
      html += '<button type="button" class="btn" data-act="close">Close</button></div>';
    } else if (kind === 'rename') {
      var it = byId(extra);
      html += '<h2>Rename</h2><input id="ren-name" type="text" value="' + esc(it ? it.name : '') + '">';
      html += '<div class="row"><button type="button" class="btn send" data-act="do-ren">Save</button>';
      html += '<button type="button" class="btn" data-act="close">Close</button></div>';
    }
    html += '</div>';
    $('sheet').innerHTML = html;
    $('sheet').hidden = false;
    $('sheet').dataset.extra = extra || '';
  }
  function closeSheet() { sheetKind = null; $('sheet').hidden = true; $('sheet').innerHTML = ''; }

  function sheetClick(e) {
    var act = e.target.getAttribute && e.target.getAttribute('data-act');
    if (!act) return;
    var extra = $('sheet').dataset.extra;
    if (act === 'close') return closeSheet();
    if (act === 'export') { closeSheet(); exportCollection(); return; }
    if (act === 'import') { openSheet('import'); return; }
    if (act === 'curl') { openSheet('curl'); return; }
    if (act === 'dup') { closeSheet(); duplicate(extra); return; }
    if (act === 'ren') { openSheet('rename', extra); return; }
    if (act === 'del') { closeSheet(); if (extra && confirm('Delete this?')) removeItem(extra); return; }
    if (act === 'save-env') {
      var name = $('env-name').value.trim() || 'Default';
      var vars = {};
      ($('env-body').value || '').split(/\n/).forEach(function (line) {
        var s = line.trim(); if (!s || s[0] === '#') return;
        var sp = s.indexOf('='); if (sp < 1) return;
        vars[s.slice(0, sp).trim()] = s.slice(sp + 1);
      });
      var e = null;
      for (var i = 0; i < ws.envs.length; i++) if (ws.envs[i].id === ws.envId) e = ws.envs[i];
      if (!e) { e = { id: uid(), name: name, vars: vars }; ws.envs.push(e); ws.envId = e.id; }
      else { e.name = name; e.vars = vars; }
      persistWs(); closeSheet(); render(); return;
    }
    if (act === 'do-import') {
      var go = function (text) {
        try { importJson(text); closeSheet(); }
        catch (err) { alert(String(err.message || err)); }
      };
      var f = $('import-file').files && $('import-file').files[0];
      if (f) { var r = new FileReader(); r.onload = function () { go(String(r.result)); }; r.readAsText(f); }
      else go($('import-text').value);
      return;
    }
    if (act === 'do-curl') {
      try { addItem(parseCurl($('curl-text').value)); closeSheet(); }
      catch (err) { alert(String(err.message || err)); }
      return;
    }
    if (act === 'do-ren') {
      var it = byId(extra);
      if (it) { it.name = $('ren-name').value.trim() || it.name; persistItem(it); }
      closeSheet(); render();
    }
  }

  function onTreeClick(e) {
    var row = e.target.closest && e.target.closest('.item');
    if (!row || !row.getAttribute('data-id')) return;
    var id = row.getAttribute('data-id');
    var it = byId(id);
    if (!it) return;
    if (e.target.classList.contains('twist') && it.type === 'folder') {
      it.collapsed = !it.collapsed; persistItem(it); render(); return;
    }
    if (it.type === 'folder') {
      it.collapsed = !it.collapsed; persistItem(it); render(); return;
    }
    setSelected(id);
    document.getElementById('app').classList.remove('nav');
  }
  function onTreeContext(e) {
    var row = e.target.closest && e.target.closest('.item');
    if (!row || !row.getAttribute('data-id')) return;
    e.preventDefault();
    openSheet('item', row.getAttribute('data-id'));
  }

  function bind() {
    var msel = $('method');
    msel.innerHTML = METHODS.map(function (m) { return '<option value="' + m + '">' + m + '</option>'; }).join('');
    $('btn-send').onclick = send;
    $('url').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !e.shiftKey)) { e.preventDefault(); send(); } });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); }
    });
    $('method').onchange = $('url').oninput = $('req-name').oninput = function () { applyEditor(); renderTree(); };
    $('proxy').onchange = function () { ws.proxy = $('proxy').checked; persistWs(); };
    $('env').onchange = function () { ws.envId = $('env').value; persistWs(); };
    $('btn-new-req').onclick = function () {
      var parent = null;
      var cur = current();
      if (cur && cur.type === 'folder') parent = cur.id;
      else if (cur && cur.parent) parent = cur.parent;
      addItem(blankReq(parent));
    };
    $('btn-new-folder').onclick = function () { addItem(blankFolder(null)); };
    $('btn-menu').onclick = function () { openSheet('menu'); };
    $('btn-env').onclick = function () { openSheet('env'); };
    $('filter').oninput = function () { renderTree(); };
    $('tree').onclick = onTreeClick;
    $('tree').oncontextmenu = onTreeContext;
    var holdTimer = 0;
    $('tree').addEventListener('pointerdown', function (e) {
      var row = e.target.closest && e.target.closest('.item');
      if (!row || !row.getAttribute('data-id')) return;
      var id = row.getAttribute('data-id');
      holdTimer = setTimeout(function () { openSheet('item', id); }, 550);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      $('tree').addEventListener(ev, function () { clearTimeout(holdTimer); });
    });
    $('sheet').onclick = function (e) { if (e.target.id === 'sheet') closeSheet(); else sheetClick(e); };
    $('btn-sidebar').onclick = function () { $('app').classList.toggle('nav'); };
    Host.onBack(function () {
      if (!$('sheet').hidden) { closeSheet(); return true; }
      if ($('app').classList.contains('nav')) { $('app').classList.remove('nav'); return true; }
      return false;
    });
  }

  function boot() {
    bind();
    Promise.all([itemsDb.getAll(), wsDb.get('ws')]).then(function (pair) {
      items = pair[0] || [];
      if (pair[1]) {
        ws = pair[1];
        ws.envs = ws.envs || [];
      }
      if (!ws.envs.length) {
        ws.envs = [{ id: uid(), name: 'Default', vars: {} }];
        ws.envId = ws.envs[0].id;
      }
      if (!items.length) {
        items = seed();
        items.forEach(persistItem);
        selectedId = items[1].id;
        persistWs();
      } else {
        selectedId = ws.selectedId || '';
        if (selectedId && !byId(selectedId)) selectedId = '';
      }
      if (selectedId) return histDb.get(selectedId).then(function (h) { if (h) response = h; });
    }).then(render);
  }

  boot();
})();
