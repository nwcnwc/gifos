/* QR Code: type text / a link / a contact, draw a code, print or download.
 * Last payload is private. Meeting share is optional (mp.js). Nothing is fetched. */
(function (root) {
  'use strict';

  var DEL_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  var KINDS = ['text', 'url', 'phone', 'sms', 'email', 'contact'];
  var FIELD_SPEC = {
    text: [{ id: 'text', label: 'Text', tag: 'textarea', rows: 4, placeholder: 'gifos.app or any text' }],
    url: [{ id: 'url', label: 'Link', tag: 'input', type: 'url', placeholder: 'gifos.app' }],
    phone: [{ id: 'phone', label: 'Phone number', tag: 'input', type: 'tel', placeholder: '+1 555 0100' }],
    sms: [
      { id: 'phone', label: 'Phone number', tag: 'input', type: 'tel', placeholder: '+1 555 0100' },
      { id: 'body', label: 'Message', tag: 'textarea', rows: 3, placeholder: 'Optional message' }
    ],
    email: [
      { id: 'email', label: 'Email', tag: 'input', type: 'email', placeholder: 'name@example.com' },
      { id: 'subject', label: 'Subject', tag: 'input', type: 'text', placeholder: 'Optional' },
      { id: 'body', label: 'Message', tag: 'textarea', rows: 3, placeholder: 'Optional' }
    ],
    contact: [
      { id: 'name', label: 'Name', tag: 'input', type: 'text', placeholder: 'Full name' },
      { id: 'phone', label: 'Phone', tag: 'input', type: 'tel', placeholder: '+1 555 0100' },
      { id: 'email', label: 'Email', tag: 'input', type: 'email', placeholder: 'name@example.com' },
      { id: 'org', label: 'Organisation', tag: 'input', type: 'text', placeholder: 'Optional' }
    ]
  };

  function hasScheme(s) {
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s);
  }

  function qParam(key, val) {
    if (!val) return '';
    return encodeURIComponent(key) + '=' + encodeURIComponent(val);
  }

  function escapeVcard(v) {
    return String(v == null ? '' : v)
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  function encodeKind(kind, fields) {
    fields = fields || {};
    kind = kind || 'text';
    if (kind === 'url') {
      var u = String(fields.url || '').trim();
      if (!u) return '';
      if (!hasScheme(u)) u = 'https://' + u;
      return u;
    }
    if (kind === 'phone') {
      var tel = String(fields.phone || '').trim();
      return tel ? ('tel:' + tel.replace(/\s+/g, '')) : '';
    }
    if (kind === 'sms') {
      var num = String(fields.phone || '').trim().replace(/\s+/g, '');
      if (!num) return '';
      var body = String(fields.body || '');
      return body ? ('SMSTO:' + num + ':' + body) : ('SMSTO:' + num);
    }
    if (kind === 'email') {
      var em = String(fields.email || '').trim();
      if (!em) return '';
      var parts = [];
      var sub = qParam('subject', String(fields.subject || '').trim());
      var bod = qParam('body', String(fields.body || ''));
      if (sub) parts.push(sub);
      if (bod) parts.push(bod);
      return 'mailto:' + em + (parts.length ? ('?' + parts.join('&')) : '');
    }
    if (kind === 'contact') {
      var name = String(fields.name || '').trim();
      var phone = String(fields.phone || '').trim();
      var email = String(fields.email || '').trim();
      var org = String(fields.org || '').trim();
      if (!name && !phone && !email) return '';
      var lines = ['BEGIN:VCARD', 'VERSION:3.0'];
      if (name) {
        lines.push('FN:' + escapeVcard(name));
        lines.push('N:' + escapeVcard(name));
      }
      if (phone) lines.push('TEL:' + escapeVcard(phone));
      if (email) lines.push('EMAIL:' + escapeVcard(email));
      if (org) lines.push('ORG:' + escapeVcard(org));
      lines.push('END:VCARD');
      return lines.join('\n');
    }
    return String(fields.text || '');
  }

  function labelOf(kind, fields, payload) {
    fields = fields || {};
    if (kind === 'url') return String(fields.url || payload || 'Link');
    if (kind === 'phone') return String(fields.phone || payload || 'Phone');
    if (kind === 'sms') return String(fields.phone || 'SMS');
    if (kind === 'email') return String(fields.email || 'Email');
    if (kind === 'contact') return String(fields.name || fields.phone || fields.email || 'Contact');
    var t = String(fields.text || payload || '');
    return t.length > 48 ? t.slice(0, 45) + '…' : t;
  }

  function hexLum(hex) {
    hex = String(hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    if (hex.length !== 6) return 0;
    var r = parseInt(hex.slice(0, 2), 16) / 255;
    var g = parseInt(hex.slice(2, 4), 16) / 255;
    var b = parseInt(hex.slice(4, 6), 16) / 255;
    function lin(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function contrastRatio(a, b) {
    var L1 = hexLum(a), L2 = hexLum(b);
    var hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }

  function eccOf(name) {
    var C = root.QRCode && root.QRCode.CorrectLevel;
    if (!C) return 0;
    return C[name] != null ? C[name] : C.M;
  }

  function makeGrid(text, eccName) {
    if (!text || typeof QRCode !== 'function') return null;
    var el = {
      innerHTML: '',
      title: '',
      appendChild: function (c) { this._c = c; }
    };
    var q;
    try {
      q = new QRCode(el, {
        text: text,
        width: 64,
        height: 64,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: eccOf(eccName || 'M')
      });
    } catch (e) {
      var msg = String(e && e.message || e || 'Could not draw that text');
      if (/too long/i.test(msg) || /reading ['"]?[0-3]['"]?/.test(msg)) {
        return { error: 'That text is too long for a code. Shorten it, or pick L correction.' };
      }
      return { error: msg };
    }
    var model = q._oQRCode;
    if (!model || !model.getModuleCount) return { error: 'Could not draw that text' };
    var n = model.getModuleCount();
    var dark = [];
    for (var r = 0; r < n; r++) {
      var row = [];
      for (var c = 0; c < n; c++) row.push(!!model.isDark(r, c));
      dark.push(row);
    }
    return { n: n, dark: dark };
  }

  function rasterGrid(grid, cell, quiet) {
    if (!grid || !grid.n) return null;
    cell = cell || 4;
    quiet = quiet == null ? 4 : quiet;
    var n = grid.n;
    var dim = (n + quiet * 2) * cell;
    var data = new Uint8ClampedArray(dim * dim * 4);
    for (var y = 0; y < dim; y++) {
      for (var x = 0; x < dim; x++) {
        var mx = Math.floor(x / cell) - quiet;
        var my = Math.floor(y / cell) - quiet;
        var on = mx >= 0 && my >= 0 && mx < n && my < n && grid.dark[my][mx];
        var o = (y * dim + x) * 4;
        var v = on ? 0 : 255;
        data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255;
      }
    }
    return { data: data, width: dim, height: dim };
  }

  var $ = function (id) {
    return root.document ? root.document.getElementById(id) : null;
  };
  var saveDb = null;
  var saveTimer = 0;
  var applying = false;
  var qr = null;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var settings = {
    payload: '',
    kind: 'text',
    fields: { text: '' },
    ecc: 'M',
    size: 224,
    dark: '#000000',
    light: '#ffffff'
  };
  var recents = [];

  function persist(immediate) {
    if (applying || !saveDb) return;
    if (root.QrMp && root.QrMp.guest) return;
    if (saveTimer) clearTimeout(saveTimer);
    var write = function () {
      saveTimer = 0;
      saveDb.put({
        id: 'last',
        payload: settings.payload,
        kind: settings.kind,
        fields: settings.fields,
        ecc: settings.ecc,
        size: settings.size,
        dark: settings.dark,
        light: settings.light,
        recents: recents
      }).catch(function () {});
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 250);
  }

  function commitRecent() {
    var p = settings.payload;
    if (!p) return;
    recents = (recents || []).filter(function (r) { return r && r.payload !== p; });
    recents.unshift({
      kind: settings.kind,
      fields: settings.fields,
      payload: p,
      label: labelOf(settings.kind, settings.fields, p),
      at: Date.now()
    });
    if (recents.length > 8) recents = recents.slice(0, 8);
    persist(true);
    renderRecents();
  }

  function readFields() {
    var spec = FIELD_SPEC[settings.kind] || FIELD_SPEC.text;
    var out = {};
    spec.forEach(function (f) {
      var el = $('f-' + f.id);
      out[f.id] = el ? el.value : '';
    });
    return out;
  }

  function readUi() {
    settings.fields = readFields();
    settings.payload = encodeKind(settings.kind, settings.fields);
    settings.size = parseInt($('size').value, 10) || 224;
    settings.dark = $('dark').value || '#000000';
    settings.light = $('light').value || '#ffffff';
    var ecc = document.querySelector('input[name=ecc]:checked');
    settings.ecc = ecc ? ecc.value : 'M';
  }

  function renderFields() {
    var box = $('fields');
    if (!box) return;
    box.innerHTML = '';
    var spec = FIELD_SPEC[settings.kind] || FIELD_SPEC.text;
    spec.forEach(function (f) {
      var lab = document.createElement('label');
      lab.className = 'field';
      lab.appendChild(document.createTextNode(f.label));
      var el;
      if (f.tag === 'textarea') {
        el = document.createElement('textarea');
        el.rows = f.rows || 3;
      } else {
        el = document.createElement('input');
        el.type = f.type || 'text';
      }
      el.id = 'f-' + f.id;
      el.placeholder = f.placeholder || '';
      el.value = (settings.fields && settings.fields[f.id]) || '';
      el.setAttribute('autocomplete', 'off');
      el.setAttribute('autocorrect', 'off');
      el.setAttribute('autocapitalize', 'none');
      el.spellcheck = false;
      if (f.id === 'text') el.maxLength = 2000;
      el.addEventListener('input', onChange);
      el.addEventListener('change', commitRecent);
      lab.appendChild(el);
      box.appendChild(lab);
    });
  }

  function markKind() {
    var btns = document.querySelectorAll('#kinds .kind');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-kind') === settings.kind;
      btns[i].classList.toggle('on', on);
      btns[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function writeUi() {
    if (!$('fields') || !$('size')) return;
    applying = true;
    markKind();
    renderFields();
    $('size').value = settings.size;
    $('sizeVal').textContent = String(settings.size);
    $('dark').value = settings.dark;
    $('light').value = settings.light;
    var radios = document.querySelectorAll('input[name=ecc]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].checked = radios[i].value === settings.ecc;
    }
    applying = false;
  }

  function hydrate(row) {
    if (!row) return;
    settings.payload = row.payload || '';
    settings.kind = KINDS.indexOf(row.kind) >= 0 ? row.kind : 'text';
    settings.fields = row.fields && typeof row.fields === 'object' ? row.fields : { text: settings.payload };
    if (settings.kind === 'text' && settings.fields.text == null) settings.fields.text = settings.payload;
    settings.ecc = row.ecc || 'M';
    settings.size = row.size >= 128 ? row.size : 224;
    settings.dark = row.dark || '#000000';
    settings.light = row.light || '#ffffff';
  }

  function applyState(row) {
    applying = true;
    hydrate(row);
    writeUi();
    applying = false;
    paint();
  }

  function applyRemote(row) {
    applyState(row);
  }

  function setReady(on) {
    if (!$('pngBtn')) return;
    $('pngBtn').disabled = !on;
    $('copyBtn').disabled = !on;
    $('printBtn').disabled = !on;
  }

  function drawQR() {
    var box = $('qr');
    box.innerHTML = '';
    qr = null;
    var text = settings.payload;
    if (!text || typeof QRCode !== 'function') return false;
    try {
      qr = new QRCode(box, {
        text: text,
        width: settings.size,
        height: settings.size,
        colorDark: settings.dark,
        colorLight: settings.light,
        correctLevel: eccOf(settings.ecc)
      });
      return true;
    } catch (e) {
      box.innerHTML = '';
      qr = null;
      var msg = String(e && e.message || e || 'Could not draw that text');
      if (/too long/i.test(msg) || /reading ['"]?[0-3]['"]?/.test(msg)) {
        return 'That text is too long for a code. Shorten it, or pick L correction.';
      }
      return msg;
    }
  }

  function paint() {
    if (!$('qr') || !$('empty')) return;
    $('sizeVal').textContent = String(settings.size);
    $('qr').style.width = settings.size + 'px';
    $('qr').style.height = settings.size + 'px';
    var err = $('err');
    var empty = $('empty');
    var cap = $('caption');
    var warn = $('warn');
    var n = settings.payload.length;
    if (n) {
      $('count').hidden = false;
      $('count').textContent = n + (n === 1 ? ' character' : ' characters');
    } else {
      $('count').hidden = true;
    }
    if (!settings.payload) {
      $('qr').innerHTML = '';
      $('qr').hidden = true;
      qr = null;
      err.hidden = true;
      cap.hidden = true;
      warn.hidden = true;
      empty.hidden = false;
      setReady(false);
      return;
    }
    empty.hidden = true;
    $('qr').hidden = false;
    var r = drawQR();
    if (r === true) {
      err.hidden = true;
      err.textContent = '';
      cap.hidden = false;
      cap.textContent = labelOf(settings.kind, settings.fields, settings.payload);
      var ratio = contrastRatio(settings.dark, settings.light);
      if (ratio < 3) {
        warn.hidden = false;
        warn.textContent = 'These colours are too close. Phones need a light background and a dark code.';
      } else if (hexLum(settings.light) < hexLum(settings.dark)) {
        warn.hidden = false;
        warn.textContent = 'The light colour is darker than the dark colour. Swap them so a phone can read it.';
      } else if (n > 800) {
        warn.hidden = false;
        warn.textContent = 'Long text makes a dense code. A phone may need to stand closer.';
      } else {
        warn.hidden = true;
      }
      setReady(true);
    } else {
      cap.hidden = true;
      warn.hidden = true;
      err.hidden = false;
      err.textContent = r || 'Could not draw that text. Try a shorter string or a lower correction level.';
      setReady(false);
    }
  }

  function onChange() {
    if (applying) return;
    if (root.QrMp && root.QrMp.guest) return;
    readUi();
    paint();
    persist();
    if (root.QrMp) root.QrMp.publish();
  }

  function setKind(kind) {
    if (KINDS.indexOf(kind) < 0 || kind === settings.kind) return;
    if (settings.payload) commitRecent();
    var prev = settings.fields || {};
    settings.kind = kind;
    var next = {};
    var spec = FIELD_SPEC[kind] || FIELD_SPEC.text;
    spec.forEach(function (f) {
      next[f.id] = prev[f.id] || (f.id === 'text' ? (prev.url || '') : '');
    });
    settings.fields = next;
    settings.payload = encodeKind(kind, next);
    writeUi();
    paint();
    persist();
    if (root.QrMp) root.QrMp.publish();
  }

  function pngOf() {
    var node = $('qr').querySelector('canvas, img');
    if (!node) return '';
    if (node.tagName === 'CANVAS') {
      try { return node.toDataURL('image/png'); } catch (e) { return ''; }
    }
    return node.src || '';
  }

  function downloadPng() {
    var url = pngOf();
    if (!url) return;
    var a = document.createElement('a');
    a.href = url;
    a.download = 'qr-code.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    commitRecent();
  }

  function copyPicture() {
    var node = $('qr').querySelector('canvas');
    var done = function (ok, msg) {
      var el = $('meet');
      if (!el) return;
      var prev = el.textContent;
      el.textContent = msg;
      setTimeout(function () { if (el.textContent === msg) el.textContent = prev; }, 1600);
      if (ok) commitRecent();
    };
    if (node && node.toBlob && root.navigator && root.navigator.clipboard && root.ClipboardItem) {
      node.toBlob(function (blob) {
        if (!blob) { done(false, 'Could not copy the picture.'); return; }
        root.navigator.clipboard.write([new root.ClipboardItem({ 'image/png': blob })]).then(function () {
          done(true, 'Copied the picture.');
        }).catch(function () { copyPayloadFallback(done); });
      });
      return;
    }
    copyPayloadFallback(done);
  }

  function copyPayloadFallback(done) {
    var text = settings.payload;
    if (!text) { done(false, 'Nothing to copy.'); return; }
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(text).then(function () {
        done(true, 'Copied the text. Download PNG for the picture.');
      }).catch(function () { done(false, 'Could not copy.'); });
      return;
    }
    done(false, 'Could not copy. Download the PNG instead.');
  }

  function printCard() {
    if (!settings.payload) return;
    var area = $('print-area');
    area.innerHTML = '';
    area.hidden = false;
    var el = document.createElement('article');
    el.className = 'card-print';
    var url = pngOf();
    if (url) {
      var img = document.createElement('img');
      img.src = url;
      img.width = settings.size;
      img.height = settings.size;
      el.appendChild(img);
    }
    var cap = document.createElement('p');
    cap.textContent = labelOf(settings.kind, settings.fields, settings.payload);
    el.appendChild(cap);
    area.appendChild(el);
    commitRecent();
    root.print();
  }

  function renderRecents() {
    var ul = $('recentList');
    var box = $('recents');
    if (!ul || !box) return;
    ul.innerHTML = '';
    var list = recents || [];
    box.hidden = list.length === 0;
    list.forEach(function (r, idx) {
      if (!r || !r.payload) return;
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'txt';
      btn.appendChild(document.createTextNode(r.label || r.payload));
      var meta = document.createElement('span');
      meta.textContent = (r.kind || 'text');
      btn.appendChild(meta);
      btn.addEventListener('click', function () {
        applyState(r);
        persist();
        if (root.QrMp) root.QrMp.publish();
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'row-del';
      del.title = 'Remove';
      del.innerHTML = DEL_ICON;
      del.addEventListener('click', function () {
        recents = recents.filter(function (_, i) { return i !== idx; });
        persist(true);
        renderRecents();
      });
      li.appendChild(btn);
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  function loadSave() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (!r || r.id !== 'last') return;
        settings.payload = r.payload || '';
        settings.kind = KINDS.indexOf(r.kind) >= 0 ? r.kind : 'text';
        settings.fields = r.fields && typeof r.fields === 'object' ? r.fields : { text: settings.payload };
        if (settings.kind === 'text' && settings.fields.text == null) settings.fields.text = settings.payload;
        settings.ecc = r.ecc || 'M';
        settings.size = r.size >= 128 ? r.size : 224;
        settings.dark = r.dark || '#000000';
        settings.light = r.light || '#ffffff';
        recents = Array.isArray(r.recents) ? r.recents.slice(0, 8) : [];
      });
    }).catch(function () {});
  }

  function applyLaunch(go) {
    if (!go) return;
    if (go.url) {
      settings.kind = 'url';
      settings.fields = { url: String(go.url) };
    } else if (go.text != null && String(go.text)) {
      settings.kind = 'text';
      settings.fields = { text: String(go.text) };
    } else {
      return;
    }
    settings.payload = encodeKind(settings.kind, settings.fields);
    writeUi();
    paint();
    persist(true);
    if (root.QrMp) root.QrMp.publish();
  }

  function boot() {
    writeUi();
    paint();
    renderRecents();
    var kinds = document.querySelectorAll('#kinds .kind');
    for (var i = 0; i < kinds.length; i++) {
      kinds[i].addEventListener('click', function (ev) {
        setKind(ev.currentTarget.getAttribute('data-kind'));
      });
    }
    $('size').addEventListener('input', onChange);
    $('dark').addEventListener('input', onChange);
    $('light').addEventListener('input', onChange);
    var radios = document.querySelectorAll('input[name=ecc]');
    for (var j = 0; j < radios.length; j++) radios[j].addEventListener('change', onChange);
    $('pngBtn').addEventListener('click', downloadPng);
    $('copyBtn').addEventListener('click', copyPicture);
    $('printBtn').addEventListener('click', printCard);

    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        var looks = $('looks');
        if (looks && looks.open) { looks.open = false; return; }
      });
    }

    var Mp = root.QrMp;
    if (Mp) {
      Mp.getState = function () {
        return {
          payload: settings.payload,
          kind: settings.kind,
          fields: settings.fields,
          ecc: settings.ecc,
          size: settings.size,
          dark: settings.dark,
          light: settings.light
        };
      };
      Mp.onRemote = applyRemote;
      Mp.onHost = function () {};
      Mp.onStatus = function (text, isGuest) {
        var el = $('meet');
        el.textContent = text;
        el.classList.toggle('live', !!isGuest || /meeting/.test(text));
      };
      Mp.watch();
    } else if ($('meet')) {
      $('meet').textContent = 'Press Invite (top bar) to show this code in a meeting.';
    }

    if (root.gifos && root.gifos.launch) {
      Promise.resolve(root.gifos.launch()).then(applyLaunch).catch(function () {});
    }
  }

  root.QrCodeApp = {
    KINDS: KINDS,
    encodeKind: encodeKind,
    labelOf: labelOf,
    contrastRatio: contrastRatio,
    hexLum: hexLum,
    eccOf: eccOf,
    makeGrid: makeGrid,
    rasterGrid: rasterGrid,
    settings: function () { return settings; },
    applyState: applyState,
    hydrate: hydrate
  };

  if ($('fields') && $('kinds')) {
    loadSave().then(boot);
    root.addEventListener('pagehide', function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
      if (settings.payload) commitRecent();
      persist(true);
    });
  }
})(window);
