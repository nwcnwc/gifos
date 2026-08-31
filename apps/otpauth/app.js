/* OTP Auth — TOTP/HOTP codes in this file. Private. Nothing is uploaded. */
(function () {
  'use strict';

  var OTP = window.OTPAuth;
  var $ = function (id) { return document.getElementById(id); };
  var CIRC = 97.39;
  var TINTS = ['#40d2b4', '#6ea8fe', '#f0b429', '#e88dff', '#ff8a65', '#80cbc4', '#90caf9', '#ce93d8'];
  var TRASH = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  var accountsDb = null;
  var prefsDb = null;
  var accounts = [];
  var prefs = { hide: false };
  var editingId = null;
  var detailId = null;
  var query = '';
  var tickTimer = 0;
  var memStore = {};

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 1600);
  }
  function ask(text) {
    var box = $('ask');
    $('ask-text').textContent = text;
    $('ask-input').hidden = true;
    box.hidden = false;
    $('ask-ok').focus();
    return new Promise(function (resolve) {
      function done(v) {
        box.hidden = true;
        $('ask-ok').onclick = null;
        $('ask-cancel').onclick = null;
        box.onkeydown = null;
        resolve(v);
      }
      $('ask-ok').onclick = function () { done(true); };
      $('ask-cancel').onclick = function () { done(false); };
      box.onkeydown = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
      };
    });
  }
  function copyText(t, label) {
    t = t == null ? '' : String(t);
    var ok = function () { toast(label || 'Copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(ok, function () { fallbackCopy(t, ok); });
    } else fallbackCopy(t, ok);
  }
  function fallbackCopy(t, ok) {
    var ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); ok(); } catch (e) { toast('Copy failed'); }
    ta.remove();
  }
  function downloadText(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 1500);
  }

  function memDb(name) {
    if (!memStore[name]) memStore[name] = { rows: [], n: 0, subs: [] };
    var st = memStore[name];
    function notify() {
      var snap = st.rows.slice();
      st.subs.forEach(function (cb) { try { cb(snap); } catch (e) {} });
    }
    return {
      put: function (rec) {
        rec = Object.assign({}, rec);
        if (!rec.id) rec.id = name + '_' + (++st.n);
        var i, found = false;
        for (i = 0; i < st.rows.length; i++) {
          if (st.rows[i].id === rec.id) { st.rows[i] = rec; found = true; break; }
        }
        if (!found) st.rows.push(rec);
        notify();
        return Promise.resolve(rec);
      },
      get: function (id) {
        var i;
        for (i = 0; i < st.rows.length; i++) if (st.rows[i].id === id) return Promise.resolve(st.rows[i]);
        return Promise.resolve(null);
      },
      getAll: function () { return Promise.resolve(st.rows.slice()); },
      delete: function (id) {
        st.rows = st.rows.filter(function (r) { return r.id !== id; });
        notify();
        return Promise.resolve(true);
      },
      subscribe: function (cb) { st.subs.push(cb); cb(st.rows.slice()); }
    };
  }

  function tintFor(s) {
    var h = 0, i;
    s = String(s || '');
    for (i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
    return TINTS[h % TINTS.length];
  }
  function initialOf(rec) {
    var s = String(rec.issuer || rec.label || '?').trim();
    if (!s) return '?';
    return s.charAt(0).toUpperCase();
  }
  function cleanSecret(s) {
    s = String(s == null ? '' : s).toUpperCase().replace(/\s+/g, '').replace(/=+$/g, '');
    s = s.replace(/0/g, 'O').replace(/1/g, 'I').replace(/8/g, 'B');
    return s.replace(/[^A-Z2-7]/g, '');
  }
  function groupDigits(code) {
    code = String(code || '');
    if (code.length === 6) return code.slice(0, 3) + ' ' + code.slice(3);
    if (code.length === 8) return code.slice(0, 4) + ' ' + code.slice(4);
    if (code.length === 7) return code.slice(0, 3) + ' ' + code.slice(3);
    return code;
  }
  function makeOtp(rec) {
    if (!OTP) throw new Error('OTPAuth library missing');
    var secret = OTP.Secret.fromBase32(cleanSecret(rec.secret));
    var algo = rec.algorithm || 'SHA1';
    var digits = rec.digits || 6;
    if (rec.type === 'hotp') {
      return new OTP.HOTP({
        issuer: rec.issuer || '',
        label: rec.label || 'OTP',
        algorithm: algo,
        digits: digits,
        counter: rec.counter || 0,
        secret: secret
      });
    }
    return new OTP.TOTP({
      issuer: rec.issuer || '',
      label: rec.label || 'OTP',
      algorithm: algo,
      digits: digits,
      period: rec.period || 30,
      secret: secret
    });
  }
  function tokenNow(rec, when) {
    var otp = makeOtp(rec);
    if (rec.type === 'hotp') return otp.generate({ counter: rec.counter || 0 });
    return otp.generate(when ? { timestamp: when } : undefined);
  }
  function nextToken(rec) {
    if (rec.type === 'hotp') return '';
    var period = (rec.period || 30) * 1000;
    return tokenNow(rec, Date.now() + period);
  }
  function remainingMs(rec) {
    var period = rec.period || 30;
    if (OTP && OTP.TOTP && typeof OTP.TOTP.remaining === 'function') {
      return OTP.TOTP.remaining({ period: period });
    }
    var p = period * 1000;
    return p - (Date.now() % p);
  }
  function toUri(rec) {
    try { return makeOtp(rec).toString(); } catch (e) { return ''; }
  }

  function parsePaste(raw) {
    raw = String(raw == null ? '' : raw).trim();
    if (!raw) return { empty: true };
    if (/^otpauth-migration:/i.test(raw)) {
      return { error: 'Google Authenticator transfer links are not read here. Paste otpauth:// links or an Aegis JSON backup.' };
    }
    var lines = raw.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var uris = lines.filter(function (s) { return /^otpauth:\/\//i.test(s); });
    if (uris.length > 1) return { many: uris };
    if (uris.length === 1 || /^otpauth:\/\//i.test(raw)) {
      try {
        var otp = OTP.URI.parse(uris[0] || raw);
        var type = (otp instanceof OTP.HOTP) ? 'hotp' : 'totp';
        return {
          rec: {
            type: type,
            issuer: otp.issuer || '',
            label: otp.label || '',
            secret: otp.secret.base32,
            algorithm: otp.algorithm || 'SHA1',
            digits: otp.digits || 6,
            period: otp.period || 30,
            counter: type === 'hotp' ? (otp.counter || 0) : 0
          }
        };
      } catch (e) {
        return { error: 'That otpauth:// link could not be read. Check it and try again.' };
      }
    }
    if (raw.charAt(0) === '{' || raw.charAt(0) === '[') {
      try { return parseBackup(raw); } catch (e) {
        return { error: 'That JSON could not be read.' };
      }
    }
    var secret = cleanSecret(raw);
    if (secret.length >= 8) return { rec: { secret: secret, type: 'totp', algorithm: 'SHA1', digits: 6, period: 30, counter: 0, issuer: '', label: '' } };
    return { error: 'Need an otpauth:// link or a base32 secret.' };
  }

  function parseBackup(text) {
    var data = JSON.parse(text);
    var out = [];
    var i, e, info, type;
    if (data && data.db && Array.isArray(data.db.entries)) {
      for (i = 0; i < data.db.entries.length; i++) {
        e = data.db.entries[i];
        info = e.info || {};
        type = String(e.type || 'totp').toLowerCase();
        if (type !== 'totp' && type !== 'hotp') continue;
        out.push({
          type: type,
          issuer: e.issuer || '',
          label: e.name || e.label || '',
          secret: cleanSecret(info.secret),
          algorithm: String(info.algo || info.algorithm || 'SHA1').replace('-', '').toUpperCase(),
          digits: info.digits || 6,
          period: info.period || 30,
          counter: info.counter || 0,
          favorite: !!e.favorite
        });
      }
      return { manyRecs: out };
    }
    if (data && Array.isArray(data.accounts)) {
      for (i = 0; i < data.accounts.length; i++) {
        e = data.accounts[i];
        out.push(normalizeRec(e));
      }
      return { manyRecs: out };
    }
    if (Array.isArray(data)) {
      for (i = 0; i < data.length; i++) {
        e = data[i];
        type = String(e.type || 'TOTP').toLowerCase();
        if (type !== 'totp' && type !== 'hotp') continue;
        out.push({
          type: type,
          issuer: e.issuer || '',
          label: e.label || e.name || '',
          secret: cleanSecret(e.secret),
          algorithm: String(e.algorithm || 'SHA1').replace('-', '').toUpperCase(),
          digits: e.digits || 6,
          period: e.period || 30,
          counter: e.counter || 0
        });
      }
      return { manyRecs: out };
    }
    throw new Error('unknown');
  }
  function normalizeRec(e) {
    var type = String(e.type || 'totp').toLowerCase();
    if (type !== 'hotp') type = 'totp';
    var algo = String(e.algorithm || 'SHA1').replace('-', '').toUpperCase();
    if (algo !== 'SHA256' && algo !== 'SHA512') algo = 'SHA1';
    var digits = parseInt(e.digits, 10);
    if (digits !== 7 && digits !== 8) digits = 6;
    var period = parseInt(e.period, 10);
    if (period !== 15 && period !== 60) period = 30;
    var counter = parseInt(e.counter, 10);
    if (!isFinite(counter) || counter < 0) counter = 0;
    return {
      type: type,
      issuer: String(e.issuer || '').trim(),
      label: String(e.label || e.name || '').trim(),
      secret: cleanSecret(e.secret),
      algorithm: algo,
      digits: digits,
      period: period,
      counter: counter,
      favorite: !!e.favorite,
      order: e.order
    };
  }
  function validateRec(rec) {
    if (!rec.secret || rec.secret.length < 8) return 'Secret is too short.';
    try {
      var tok = tokenNow(rec);
      if (!tok) return 'Could not make a code from that secret.';
    } catch (e) {
      return 'That secret is not valid base32.';
    }
    if (!rec.issuer && !rec.label) return 'Need a site name or an account.';
    return '';
  }

  function exportJson() {
    return JSON.stringify({
      version: 1,
      header: { slots: [], params: null },
      db: {
        version: 2,
        entries: sorted(accounts).map(function (a) {
          return {
            type: a.type || 'totp',
            uuid: a.id,
            name: a.label || '',
            issuer: a.issuer || '',
            note: '',
            favorite: !!a.favorite,
            info: {
              secret: a.secret,
              algo: a.algorithm || 'SHA1',
              digits: a.digits || 6,
              period: a.period || 30,
              counter: a.counter || 0
            }
          };
        })
      }
    }, null, 2);
  }
  function exportUris() {
    return sorted(accounts).map(toUri).filter(Boolean).join('\n');
  }

  function sorted(rows) {
    return rows.slice().sort(function (a, b) {
      if (!!b.favorite - !!a.favorite) return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0);
      var ia = String(a.issuer || '').toLowerCase();
      var ib = String(b.issuer || '').toLowerCase();
      if (ia < ib) return -1;
      if (ia > ib) return 1;
      var la = String(a.label || '').toLowerCase();
      var lb = String(b.label || '').toLowerCase();
      if (la < lb) return -1;
      if (la > lb) return 1;
      return 0;
    });
  }
  function visible() {
    var q = query.toLowerCase();
    var rows = sorted(accounts);
    if (!q) return rows;
    return rows.filter(function (a) {
      return String(a.issuer || '').toLowerCase().indexOf(q) >= 0
        || String(a.label || '').toLowerCase().indexOf(q) >= 0;
    });
  }

  function render() {
    var rows = visible();
    var empty = $('empty');
    var list = $('list');
    var status = $('status');
    if (!accounts.length) {
      empty.hidden = false;
      list.hidden = true;
      list.innerHTML = '';
      status.hidden = true;
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    var n = accounts.length;
    status.hidden = false;
    status.textContent = n + (n === 1 ? ' account' : ' accounts') + ' · private to this file';
    if (!rows.length) {
      list.innerHTML = '<li class="status">No accounts match that search.</li>';
      return;
    }
    list.innerHTML = rows.map(cardHtml).join('');
    tick();
  }
  function cardHtml(rec) {
    var tint = tintFor(rec.issuer || rec.label);
    var hide = prefs.hide;
    var code = '••• •••';
    var next = '';
    if (!hide) {
      try {
        code = groupDigits(tokenNow(rec));
        if (rec.type !== 'hotp') next = 'next ' + groupDigits(nextToken(rec));
      } catch (e) {
        code = 'error';
      }
    }
    var star = rec.favorite ? '<span class="star" aria-hidden="true">★</span>' : '';
    var ring = rec.type === 'hotp'
      ? '<div class="ring-wrap"><span class="secs">HOTP</span></div>'
      : '<div class="ring-wrap"><svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="track" cx="18" cy="18" r="15.5"/><circle class="val" cx="18" cy="18" r="15.5"/></svg><span class="secs"></span></div>';
    return '<li class="card" data-id="' + esc(rec.id) + '" style="--tint:' + tint + '">'
      + star
      + '<div class="avatar">' + esc(initialOf(rec)) + '</div>'
      + '<div class="issuer">' + esc(rec.issuer || 'Account') + '</div>'
      + '<div class="acct">' + esc(rec.label || '') + '</div>'
      + '<div class="code">' + esc(code) + '</div>'
      + '<div class="next">' + esc(next) + '</div>'
      + ring
      + '<button type="button" class="more" data-more="' + esc(rec.id) + '" aria-label="Account options">···</button>'
      + '</li>';
  }

  function tick() {
    var hide = prefs.hide;
    var cards = document.querySelectorAll('.card[data-id]');
    var i, el, rec, code, next, ms, frac, rem, wrap, val, secs, codeEl, nextEl, cls;
    for (i = 0; i < cards.length; i++) {
      el = cards[i];
      rec = byId(el.getAttribute('data-id'));
      if (!rec) continue;
      try { code = tokenNow(rec); } catch (e) { code = ''; }
      if (rec.type === 'hotp') {
        codeEl = el.querySelector('.code');
        if (codeEl) codeEl.textContent = hide ? '••• •••' : groupDigits(code);
        continue;
      }
      ms = remainingMs(rec);
      rem = Math.max(0, Math.ceil(ms / 1000));
      frac = ms / ((rec.period || 30) * 1000);
      if (frac < 0) frac = 0;
      if (frac > 1) frac = 1;
      cls = rem <= 3 ? 'critical' : rem <= 7 ? 'expiring' : '';
      codeEl = el.querySelector('.code');
      nextEl = el.querySelector('.next');
      wrap = el.querySelector('.ring-wrap');
      val = el.querySelector('.ring .val');
      secs = el.querySelector('.secs');
      if (codeEl) {
        codeEl.textContent = hide ? '••• •••' : groupDigits(code);
        codeEl.className = 'code' + (cls ? ' ' + cls : '');
      }
      if (nextEl) nextEl.textContent = hide ? '' : ('next ' + groupDigits(nextToken(rec)));
      if (wrap) wrap.className = 'ring-wrap' + (cls ? ' ' + cls : '');
      if (val) val.setAttribute('stroke-dashoffset', String((1 - frac) * CIRC));
      if (secs) secs.textContent = String(rem);
    }
    if (detailId && !$('detail').hidden) tickDetail();
    if (editingId !== undefined && !$('sheet').hidden) tickPreview();
  }
  function byId(id) {
    var i;
    for (i = 0; i < accounts.length; i++) if (accounts[i].id === id) return accounts[i];
    return null;
  }

  function openSheet(rec) {
    editingId = rec && rec.id ? rec.id : null;
    $('sheet-title').textContent = editingId ? 'Edit account' : 'Add account';
    $('f-paste').value = '';
    $('f-paste-hint').hidden = true;
    $('f-issuer').value = rec && rec.issuer || '';
    $('f-label').value = rec && rec.label || '';
    $('f-secret').value = rec && rec.secret || '';
    $('f-secret').type = 'password';
    $('f-secret-toggle').textContent = 'Show';
    $('f-type').value = rec && rec.type === 'hotp' ? 'hotp' : 'totp';
    $('f-algo').value = rec && rec.algorithm || 'SHA1';
    $('f-digits').value = String(rec && rec.digits || 6);
    $('f-period').value = String(rec && rec.period || 30);
    $('f-counter').value = String(rec && rec.counter || 0);
    $('f-err').hidden = true;
    $('f-advanced').open = !!(rec && (rec.algorithm !== 'SHA1' || rec.digits !== 6 || rec.period !== 30 || rec.type === 'hotp'));
    syncTypeUi();
    $('sheet').hidden = false;
    tickPreview();
    $('f-paste').focus();
  }
  function closeSheet() { $('sheet').hidden = true; editingId = null; }
  function syncTypeUi() {
    var hotp = $('f-type').value === 'hotp';
    $('f-period-lab').hidden = hotp;
    $('f-counter-lab').hidden = !hotp;
  }
  function fieldsToRec() {
    return normalizeRec({
      type: $('f-type').value,
      issuer: $('f-issuer').value,
      label: $('f-label').value,
      secret: $('f-secret').value,
      algorithm: $('f-algo').value,
      digits: $('f-digits').value,
      period: $('f-period').value,
      counter: $('f-counter').value,
      favorite: editingId && byId(editingId) ? byId(editingId).favorite : false,
      order: editingId && byId(editingId) ? byId(editingId).order : Date.now()
    });
  }
  function applyParsed(p) {
    if (p.error) {
      $('f-paste-hint').hidden = false;
      $('f-paste-hint').textContent = p.error;
      return;
    }
    $('f-paste-hint').hidden = true;
    if (p.many || p.manyRecs) {
      $('f-paste-hint').hidden = false;
      $('f-paste-hint').textContent = 'Several accounts in that paste — use Import.';
      return;
    }
    if (!p.rec) return;
    var r = p.rec;
    if (r.issuer) $('f-issuer').value = r.issuer;
    if (r.label) $('f-label').value = r.label;
    if (r.secret) $('f-secret').value = r.secret;
    if (r.type) $('f-type').value = r.type;
    if (r.algorithm) $('f-algo').value = r.algorithm;
    if (r.digits) $('f-digits').value = String(r.digits);
    if (r.period) $('f-period').value = String(r.period);
    if (r.counter != null) $('f-counter').value = String(r.counter);
    $('f-advanced').open = r.type === 'hotp' || (r.algorithm && r.algorithm !== 'SHA1') || r.digits !== 6 || r.period !== 30;
    syncTypeUi();
    tickPreview();
  }
  function tickPreview() {
    var box = $('f-preview');
    if ($('sheet').hidden) return;
    var rec = fieldsToRec();
    if (!rec.secret) { box.hidden = true; return; }
    try {
      var code = tokenNow(rec);
      var extra = rec.type === 'hotp' ? '' : ('  ·  ' + Math.ceil(remainingMs(rec) / 1000) + 's');
      box.hidden = false;
      box.textContent = groupDigits(code) + extra;
    } catch (e) {
      box.hidden = true;
    }
  }
  function saveForm() {
    var rec = fieldsToRec();
    var err = validateRec(rec);
    var el = $('f-err');
    if (err) { el.hidden = false; el.textContent = err; return; }
    el.hidden = true;
    if (editingId) rec.id = editingId;
    accountsDb.put(rec).then(function () {
      closeSheet();
      toast(editingId ? 'Saved' : 'Account added');
    }).catch(function (e) {
      el.hidden = false;
      el.textContent = String((e && e.message) || e || 'Could not save');
    });
  }

  function openDetail(id) {
    var rec = byId(id);
    if (!rec) return;
    detailId = id;
    $('d-title').textContent = rec.issuer || 'Account';
    $('d-issuer').textContent = rec.issuer || 'Account';
    $('d-label').textContent = rec.label || '';
    $('d-star').textContent = rec.favorite ? 'Unpin' : 'Pin';
    $('d-nextbtn').hidden = rec.type !== 'hotp';
    $('d-qr').hidden = true;
    $('d-showqr').hidden = false;
    $('d-secret-wrap').hidden = true;
    $('d-showsecret').hidden = false;
    $('d-showsecret').textContent = 'Show secret';
    $('detail').hidden = false;
    tickDetail();
  }
  function closeDetail() {
    $('detail').hidden = true;
    detailId = null;
    $('d-qr-target').innerHTML = '';
  }
  function tickDetail() {
    var rec = byId(detailId);
    if (!rec) return;
    var codeEl = $('d-code');
    var nextEl = $('d-next');
    var bar = $('d-bar');
    try {
      var code = tokenNow(rec);
      codeEl.textContent = groupDigits(code);
    } catch (e) {
      codeEl.textContent = 'error';
    }
    if (rec.type === 'hotp') {
      codeEl.className = 'hero-code';
      nextEl.textContent = 'Counter ' + (rec.counter || 0);
      bar.style.transform = 'scaleX(1)';
      return;
    }
    var ms = remainingMs(rec);
    var rem = Math.max(0, Math.ceil(ms / 1000));
    var frac = ms / ((rec.period || 30) * 1000);
    var cls = rem <= 3 ? 'critical' : rem <= 7 ? 'expiring' : '';
    codeEl.className = 'hero-code' + (cls ? ' ' + cls : '');
    nextEl.textContent = 'next ' + groupDigits(nextToken(rec)) + '  ·  ' + rem + 's';
    bar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, frac)) + ')';
    bar.style.background = cls === 'critical' ? '#e0574a' : cls === 'expiring' ? '#f0b429' : '';
  }
  function showQr() {
    var rec = byId(detailId);
    if (!rec) return;
    var uri = toUri(rec);
    var box = $('d-qr-target');
    box.innerHTML = '';
    if (!uri || typeof QRCode !== 'function') {
      toast('Could not draw a QR');
      return;
    }
    try {
      new QRCode(box, {
        text: uri,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
      $('d-qr').hidden = false;
      $('d-showqr').hidden = true;
    } catch (e) {
      toast('Could not draw a QR');
    }
  }

  function openXfer(mode) {
    $('x-title').textContent = mode === 'export' ? 'Export' : 'Import';
    $('x-import-pane').hidden = mode === 'export';
    $('x-export-pane').hidden = mode !== 'export';
    $('x-err').hidden = true;
    $('x-text').value = '';
    $('x-file').value = '';
    if (mode === 'export') $('x-out').value = exportJson();
    $('xfer').hidden = false;
  }
  function closeXfer() { $('xfer').hidden = true; }

  function importText(text) {
    var p = parsePaste(text);
    var recs = [];
    if (p.error) return p.error;
    if (p.many) {
      p.many.forEach(function (u) {
        var one = parsePaste(u);
        if (one.rec) recs.push(one.rec);
      });
    } else if (p.manyRecs) recs = p.manyRecs;
    else if (p.rec) recs = [p.rec];
    recs = recs.filter(function (r) { return r && r.secret && !validateRec(r); });
    if (!recs.length) return 'Nothing to import.';
    var chain = Promise.resolve();
    recs.forEach(function (r) {
      r.order = Date.now();
      chain = chain.then(function () { return accountsDb.put(r); });
    });
    return chain.then(function () {
      closeXfer();
      closeSheet();
      toast(recs.length === 1 ? 'Account added' : recs.length + ' accounts added');
      return '';
    }).catch(function (e) {
      return String((e && e.message) || e || 'Could not import');
    });
  }

  function menuOpen() { return !$('moreMenu').hidden; }
  function closeMenu() {
    $('moreMenu').hidden = true;
    $('moreBtn').setAttribute('aria-expanded', 'false');
  }
  function toggleMenu() {
    if (menuOpen()) closeMenu();
    else {
      $('moreMenu').hidden = false;
      $('moreBtn').setAttribute('aria-expanded', 'true');
    }
  }
  function topModal() {
    if (!$('ask').hidden) return 'ask';
    if (!$('xfer').hidden) return 'xfer';
    if (!$('detail').hidden) return 'detail';
    if (!$('sheet').hidden) return 'sheet';
    if (menuOpen()) return 'menu';
    return null;
  }
  function closeTop() {
    var m = topModal();
    if (m === 'ask') { $('ask-cancel').click(); return true; }
    if (m === 'xfer') { closeXfer(); return true; }
    if (m === 'detail') { closeDetail(); return true; }
    if (m === 'sheet') { closeSheet(); return true; }
    if (m === 'menu') { closeMenu(); return true; }
    return false;
  }

  function onListClick(e) {
    var more = e.target.closest && e.target.closest('[data-more]');
    if (more) {
      e.preventDefault();
      e.stopPropagation();
      openDetail(more.getAttribute('data-more'));
      return;
    }
    var card = e.target.closest && e.target.closest('.card[data-id]');
    if (!card) return;
    var rec = byId(card.getAttribute('data-id'));
    if (!rec) return;
    try {
      var code = tokenNow(rec);
      copyText(code, 'Copied ' + (rec.issuer || 'code'));
      var badge = card.querySelector('.copied');
      if (badge) badge.remove();
      var b = document.createElement('span');
      b.className = 'copied';
      b.textContent = 'Copied';
      card.appendChild(b);
      setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 1200);
      if (prefs.hide) {
        var codeEl = card.querySelector('.code');
        if (codeEl) codeEl.textContent = groupDigits(code);
      }
    } catch (err) {
      toast('Could not make a code');
    }
  }

  function persistPrefs() {
    var rec = { id: 'prefs', hide: !!prefs.hide };
    prefsDb.put(rec).catch(function () {});
  }

  function boot() {
    if (!OTP) {
      $('empty').hidden = false;
      $('empty').innerHTML = '<strong>Could not load the code library.</strong>';
      return;
    }
    if (window.gifos && gifos.db) {
      accountsDb = gifos.db('accounts');
      prefsDb = gifos.db('prefs');
    } else {
      accountsDb = memDb('accounts');
      prefsDb = memDb('prefs');
    }

    accountsDb.subscribe(function (rows) {
      accounts = (rows || []).filter(function (r) { return r && r.secret; });
      render();
      if (detailId && !byId(detailId)) closeDetail();
    });
    prefsDb.subscribe(function (rows) {
      var i, r = null;
      for (i = 0; i < (rows || []).length; i++) if (rows[i].id === 'prefs') r = rows[i];
      prefs.hide = !!(r && r.hide);
      $('hideBtn').setAttribute('aria-pressed', prefs.hide ? 'true' : 'false');
      $('hideBtn').setAttribute('aria-label', prefs.hide ? 'Show codes' : 'Hide codes');
      render();
    });

    $('addBtn').onclick = function () { closeMenu(); openSheet(null); };
    $('emptyAdd').onclick = function () { closeMenu(); openSheet(null); };
    $('emptyImport').onclick = function () { closeMenu(); openXfer('import'); };
    $('f-goto-import').onclick = function () { closeSheet(); openXfer('import'); };
    $('moreBtn').onclick = function (e) { e.stopPropagation(); toggleMenu(); };
    document.addEventListener('click', function (e) {
      if (menuOpen() && !e.target.closest('.more-wrap')) closeMenu();
    });
    $('sheetClose').onclick = closeSheet;
    $('f-cancel').onclick = closeSheet;
    $('f-save').onclick = saveForm;
    $('f-type').onchange = function () { syncTypeUi(); tickPreview(); };
    $('f-algo').onchange = tickPreview;
    $('f-digits').onchange = tickPreview;
    $('f-period').onchange = tickPreview;
    $('f-counter').oninput = tickPreview;
    $('f-secret').oninput = tickPreview;
    $('f-secret-toggle').onclick = function () {
      var on = $('f-secret').type === 'password';
      $('f-secret').type = on ? 'text' : 'password';
      $('f-secret-toggle').textContent = on ? 'Hide' : 'Show';
    };
    $('f-paste').addEventListener('input', function () {
      var p = parsePaste($('f-paste').value);
      if (p.empty) { $('f-paste-hint').hidden = true; return; }
      applyParsed(p);
    });
    $('search').addEventListener('input', function () {
      query = $('search').value || '';
      render();
    });
    $('list').addEventListener('click', onListClick);
    $('hideBtn').onclick = function () {
      prefs.hide = !prefs.hide;
      persistPrefs();
      render();
    };
    $('importBtn').onclick = function () { closeMenu(); openXfer('import'); };
    $('exportBtn').onclick = function () { closeMenu(); openXfer('export'); };
    $('x-close').onclick = closeXfer;
    $('x-cancel').onclick = closeXfer;
    $('x-do-import').onclick = function () {
      var t = $('x-text').value;
      var res = importText(t);
      if (res && typeof res.then === 'function') {
        res.then(function (err) {
          if (err) { $('x-err').hidden = false; $('x-err').textContent = err; }
        });
      } else if (res) {
        $('x-err').hidden = false;
        $('x-err').textContent = res;
      }
    };
    $('x-file').addEventListener('change', function () {
      var f = $('x-file').files && $('x-file').files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { $('x-text').value = String(reader.result || ''); };
      reader.readAsText(f);
    });
    $('x-json').onclick = function () { $('x-out').value = exportJson(); copyText($('x-out').value, 'JSON copied'); };
    $('x-uris').onclick = function () { $('x-out').value = exportUris(); copyText($('x-out').value, 'Links copied'); };
    $('x-dl-json').onclick = function () {
      var t = exportJson();
      $('x-out').value = t;
      downloadText('otpauth-backup.json', t, 'application/json');
    };
    $('x-dl-uris').onclick = function () {
      var t = exportUris();
      $('x-out').value = t;
      downloadText('otpauth-links.txt', t, 'text/plain');
    };

    $('d-close').onclick = closeDetail;
    $('d-copy').onclick = function () {
      var rec = byId(detailId);
      if (!rec) return;
      try { copyText(tokenNow(rec), 'Copied'); } catch (e) { toast('Could not make a code'); }
    };
    $('d-star').onclick = function () {
      var rec = byId(detailId);
      if (!rec) return;
      rec.favorite = !rec.favorite;
      accountsDb.put(rec).then(function () {
        $('d-star').textContent = rec.favorite ? 'Unpin' : 'Pin';
        toast(rec.favorite ? 'Pinned' : 'Unpinned');
      });
    };
    $('d-edit').onclick = function () {
      var rec = byId(detailId);
      closeDetail();
      if (rec) openSheet(rec);
    };
    $('d-uri').onclick = function () {
      var rec = byId(detailId);
      if (!rec) return;
      var u = toUri(rec);
      if (u) copyText(u, 'Link copied');
    };
    $('d-showqr').onclick = showQr;
    $('d-showsecret').onclick = function () {
      var rec = byId(detailId);
      if (!rec) return;
      if ($('d-secret-wrap').hidden) {
        $('d-secret').textContent = rec.secret;
        $('d-secret-wrap').hidden = false;
        $('d-showsecret').textContent = 'Hide secret';
      } else {
        $('d-secret-wrap').hidden = true;
        $('d-showsecret').textContent = 'Show secret';
      }
    };
    $('d-nextbtn').onclick = function () {
      var rec = byId(detailId);
      if (!rec || rec.type !== 'hotp') return;
      rec.counter = (rec.counter || 0) + 1;
      accountsDb.put(rec).then(function () { tickDetail(); toast('Next code'); });
    };
    $('d-del').onclick = function () {
      var rec = byId(detailId);
      if (!rec) return;
      ask('Delete ' + (rec.issuer || rec.label || 'this account') + '? The secret is gone from this file.').then(function (ok) {
        if (!ok) return;
        accountsDb.delete(rec.id).then(function () {
          closeDetail();
          toast('Deleted');
        });
      });
    };

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (closeTop()) e.preventDefault();
        return;
      }
      if (e.key === '/' && topModal() === null && document.activeElement !== $('search')) {
        e.preventDefault();
        $('search').focus();
      }
    });
    if (window.gifos && typeof gifos.onBack === 'function') {
      gifos.onBack(function () { return closeTop(); });
    }

    tickTimer = setInterval(tick, 200);
  }

  boot();
})();
