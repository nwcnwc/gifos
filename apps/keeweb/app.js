/*
 * KeeWeb — local .kdbx vault.
 *
 * kdbxweb reads and writes KeePass files; @noble/hashes Argon2 unlocks KDBX4.
 * Copy-paste only: username, password, URL and OTP go to the clipboard when
 * you ask. There is no autofill into other sites, and no network path.
 * KeeWeb's Dropbox, Google Drive, OneDrive, WebDAV, plugin gallery and
 * KeePassHTTP are not shipped.
 */
(function () {
  'use strict';

  var kw = window.kdbxweb;
  var DEL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
  var STD = { Title: 1, UserName: 1, Password: 1, URL: 1, Notes: 1 };
  var IDLE_MS = 5 * 60 * 1000;
  var SAVE_MS = 450;

  var $ = function (id) { return document.getElementById(id); };
  var vaultDb = (window.gifos && window.gifos.db) ? window.gifos.db('vault') : null;
  var stored = null;
  var kdbx = null;
  var creds = null;
  var groupId = '';
  var entryId = '';
  var saveTimer = 0;
  var idleTimer = 0;
  var otpTimer = 0;
  var busy = false;

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
  // window.confirm and window.prompt DO NOTHING in an app frame. The sandbox
  // carries no allow-modals, so Chrome logs "Ignored call to 'confirm()'" and
  // returns FALSE (prompt returns null) without ever asking. Every action
  // guarded by one was therefore unreachable: an entry could not be deleted,
  // a group could not be named, and a vault could not be replaced or
  // imported once one existed — the guard always said no. This is the
  // in-page ask; #ask in index.html is its markup.
  //
  //   ask('Delete this?')                  -> Promise<boolean>
  //   ask('Group name', 'New group')       -> Promise<string|null>
  function ask(text, initial) {
    var box = $('ask'), input = $('ask-input');
    var wantsText = arguments.length > 1;
    $('ask-text').textContent = text;
    input.hidden = !wantsText;
    input.value = wantsText ? (initial == null ? '' : String(initial)) : '';
    box.hidden = false;
    if (wantsText) { input.focus(); input.select(); } else $('ask-ok').focus();
    return new Promise(function (resolve) {
      function done(v) {
        box.hidden = true;
        $('ask-ok').onclick = null;
        $('ask-cancel').onclick = null;
        box.onkeydown = null;
        resolve(v);
      }
      $('ask-ok').onclick = function () { done(wantsText ? (input.value.trim() || null) : true); };
      $('ask-cancel').onclick = function () { done(wantsText ? null : false); };
      box.onkeydown = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); done(wantsText ? null : false); }
        else if (e.key === 'Enter' && wantsText) { e.preventDefault(); $('ask-ok').onclick(); }
      };
    });
  }

  function setMsg(id, msg, kind) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  function setBar(msg) {
    var el = $('status');
    if (el) el.textContent = msg || '';
  }
  function uidOf(obj) { return obj && obj.uuid ? String(obj.uuid) : ''; }
  function fieldText(entry, name) {
    if (!entry || !entry.fields) return '';
    var v = entry.fields.get(name);
    if (v == null) return '';
    if (typeof v.getText === 'function') return v.getText();
    return String(v);
  }
  function isRecycle(g) {
    return !!(kdbx && kdbx.meta && kdbx.meta.recycleBinUuid && g && g.uuid && g.uuid.equals(kdbx.meta.recycleBinUuid));
  }
  function defaultGroup() { return kdbx ? kdbx.getDefaultGroup() : null; }
  function findGroup(id, from) {
    var root = from || defaultGroup();
    if (!root) return null;
    if (uidOf(root) === id) return root;
    var gs = root.groups || [], i, hit;
    for (i = 0; i < gs.length; i++) {
      hit = findGroup(id, gs[i]);
      if (hit) return hit;
    }
    return null;
  }
  function findEntry(id, from) {
    var root = from || defaultGroup();
    if (!root) return null;
    var es = root.entries || [], i, e;
    for (i = 0; i < es.length; i++) if (uidOf(es[i]) === id) return es[i];
    var gs = root.groups || [];
    for (i = 0; i < gs.length; i++) {
      e = findEntry(id, gs[i]);
      if (e) return e;
    }
    return null;
  }
  function walkGroups(g, fn, depth) {
    fn(g, depth || 0);
    (g.groups || []).forEach(function (sg) { walkGroups(sg, fn, (depth || 0) + 1); });
  }
  function allEntries() {
    var out = [];
    if (!kdbx) return out;
    walkGroups(defaultGroup(), function (g) {
      if (isRecycle(g)) return;
      (g.entries || []).forEach(function (e) { out.push({ entry: e, group: g }); });
    });
    return out;
  }
  function bytesToB64(ab) {
    return kw.ByteUtils.bytesToBase64(new Uint8Array(ab));
  }
  function b64ToAb(b64) {
    var u = kw.ByteUtils.base64ToBytes(b64);
    return kw.ByteUtils.arrayToBuffer ? kw.ByteUtils.arrayToBuffer(u) : u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
  }
  function readKey(input) {
    var f = input && input.files && input.files[0];
    if (!f) return Promise.resolve(null);
    return f.arrayBuffer();
  }
  function makeCreds(password, keyAb) {
    var pv = kw.ProtectedValue.fromString(password || '');
    return new kw.Credentials(pv, keyAb || null);
  }
  function errMsg(e) {
    var m = (e && e.message) || String(e || 'failed');
    if (/InvalidKey/i.test(m) || /invalid key/i.test(m)) return 'Wrong password or key file.';
    if (/NotImplemented/i.test(m) && /argon2/i.test(m)) return 'This vault needs Argon2, which failed to load.';
    return m.replace(/^Error:\s*/, '');
  }

  function persist() {
    if (!kdbx) return Promise.resolve();
    setBar('Saving…');
    return kdbx.save().then(function (ab) {
      var rec = {
        id: 'current',
        name: (kdbx.meta && kdbx.meta.name) || 'Vault',
        b64: bytesToB64(ab),
        updated: Date.now()
      };
      stored = rec;
      if (!vaultDb) {
        setBar('Not saved — open this app inside GifOS to keep the vault.');
        return rec;
      }
      return vaultDb.put(rec).then(function () {
        if (window.gifos && window.gifos.save) return window.gifos.save();
      }).then(function () {
        setBar('Saved on this device');
        $('bar-name').textContent = rec.name;
        return rec;
      });
    }).catch(function (err) {
      setBar('Could not save: ' + errMsg(err));
    });
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, SAVE_MS);
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

  function b32decode(s) {
    s = String(s || '').toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
    var A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    var bits = '', i, v, out = [];
    for (i = 0; i < s.length; i++) {
      v = A.indexOf(s.charAt(i));
      if (v < 0) continue;
      bits += ('00000' + v.toString(2)).slice(-5);
    }
    for (i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
    return new Uint8Array(out);
  }
  function otpInfo(entry) {
    var raw = fieldText(entry, 'otp') || fieldText(entry, 'OTP');
    if (raw && raw.indexOf('otpauth:') === 0) {
      try {
        var u = new URL(raw);
        return {
          secret: u.searchParams.get('secret') || '',
          digits: parseInt(u.searchParams.get('digits') || '6', 10) || 6,
          period: parseInt(u.searchParams.get('period') || '30', 10) || 30
        };
      } catch (e) { /* not a URL */ }
    }
    var secret = fieldText(entry, 'TimeOtp-Secret') || fieldText(entry, 'TimeOtp-Secret-Base32');
    if (!secret) return null;
    return {
      secret: secret,
      digits: parseInt(fieldText(entry, 'TimeOtp-Length') || fieldText(entry, 'TimeOtp-Digits') || '6', 10) || 6,
      period: parseInt(fieldText(entry, 'TimeOtp-Period') || '30', 10) || 30
    };
  }
  function totp(info) {
    var key = b32decode(info.secret);
    if (!key.length) return Promise.resolve(null);
    var period = info.period || 30;
    var digits = info.digits || 6;
    var counter = Math.floor(Date.now() / 1000 / period);
    var buf = new ArrayBuffer(8);
    new DataView(buf).setUint32(4, counter >>> 0);
    return crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
      .then(function (k) { return crypto.subtle.sign('HMAC', k, buf); })
      .then(function (sig) {
        var u = new Uint8Array(sig);
        var off = u[u.length - 1] & 0xf;
        var bin = ((u[off] & 0x7f) << 24) | (u[off + 1] << 16) | (u[off + 2] << 8) | u[off + 3];
        var code = String(bin % Math.pow(10, digits));
        while (code.length < digits) code = '0' + code;
        return { code: code, left: period - (Math.floor(Date.now() / 1000) % period) };
      });
  }

  function genPassword(len) {
    len = Math.max(8, Math.min(64, len || 20));
    var chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()-_=+';
    var buf = new Uint8Array(len);
    crypto.getRandomValues(buf);
    var out = '', i;
    for (i = 0; i < len; i++) out += chars.charAt(buf[i] % chars.length);
    return out;
  }

  function bumpIdle() {
    clearTimeout(idleTimer);
    if (!kdbx) return;
    idleTimer = setTimeout(function () { doLock('Locked after 5 minutes idle.'); }, IDLE_MS);
  }

  function showApp(on) {
    $('gate').hidden = !!on;
    $('app').hidden = !on;
    if (on) bumpIdle();
  }

  function doLock(msg) {
    clearTimeout(saveTimer);
    clearTimeout(idleTimer);
    clearInterval(otpTimer);
    var finish = function () {
      kdbx = null;
      creds = null;
      groupId = '';
      entryId = '';
      $('pw-unlock').value = '';
      $('pw-import').value = '';
      $('detail').innerHTML = '';
      $('list').innerHTML = '';
      $('groups').innerHTML = '';
      showApp(false);
      refreshGate();
      if (msg) setMsg('unlock-status', msg);
    };
    if (kdbx) persist().then(finish, finish);
    else finish();
  }

  function openDb(db, c, rec) {
    kdbx = db;
    creds = c;
    stored = rec || stored;
    groupId = uidOf(defaultGroup());
    entryId = '';
    $('bar-name').textContent = (kdbx.meta && kdbx.meta.name) || (stored && stored.name) || 'Vault';
    showApp(true);
    render();
    setBar('Unlocked on this device');
  }

  function refreshGate() {
    var has = !!(stored && stored.b64);
    $('panel-unlock').hidden = !has;
    $('unlock-title').textContent = has ? ('Unlock ' + (stored.name || 'vault')) : 'Unlock vault';
    $('panel-create').querySelector('h2').textContent = has ? 'Replace with a new vault' : 'New vault';
  }

  function render() {
    if (!kdbx) return;
    renderGroups();
    renderList();
    renderDetail();
  }

  function renderGroups() {
    var host = $('groups');
    var html = '<div class="side-actions"><button type="button" class="ghost" id="btn-new-group">New group</button></div>';
    walkGroups(defaultGroup(), function (g, depth) {
      var id = uidOf(g);
      var name = isRecycle(g) ? (g.name || 'Recycle Bin') : (g.name || 'Group');
      html += '<button type="button" class="g-row' + (id === groupId ? ' on' : '') +
        '" data-gid="' + esc(id) + '" style="--d:' + depth + '">' + esc(name) + '</button>';
    });
    host.innerHTML = html;
  }

  function renderList() {
    var host = $('list');
    var q = ($('search').value || '').trim().toLowerCase();
    var rows = [];
    if (q) {
      allEntries().forEach(function (row) {
        var e = row.entry;
        var blob = [fieldText(e, 'Title'), fieldText(e, 'UserName'), fieldText(e, 'URL'), fieldText(e, 'Notes')].join('\n').toLowerCase();
        if (blob.indexOf(q) >= 0) rows.push(e);
      });
    } else {
      var g = findGroup(groupId) || defaultGroup();
      rows = (g && g.entries) ? g.entries.slice() : [];
    }
    if (!rows.length) {
      host.innerHTML = '<div class="empty">' + (q ? 'No matches.' : 'No entries in this group.') + '</div>';
      return;
    }
    host.innerHTML = rows.map(function (e) {
      var id = uidOf(e);
      return '<button type="button" class="e-row' + (id === entryId ? ' on' : '') +
        '" data-eid="' + esc(id) + '"><span class="t">' + esc(fieldText(e, 'Title') || '(untitled)') +
        '</span><span class="u">' + esc(fieldText(e, 'UserName') || fieldText(e, 'URL')) + '</span></button>';
    }).join('');
  }

  function extraFields(entry) {
    var out = [];
    if (!entry || !entry.fields) return out;
    entry.fields.forEach(function (val, name) {
      if (STD[name]) return;
      if (/^(otp|OTP|TimeOtp-)/.test(name)) return;
      out.push({ name: name, value: fieldText(entry, name) });
    });
    return out;
  }

  function renderDetail() {
    clearInterval(otpTimer);
    var host = $('detail');
    var e = entryId ? findEntry(entryId) : null;
    if (!e) {
      host.innerHTML = '<div class="empty">Select an entry, or create one. Copy a field — this app never fills another site.</div>';
      return;
    }
    var extras = extraFields(e);
    var extraHtml = extras.map(function (f, i) {
      return '<div class="copyrow" data-extra="' + i + '">' +
        '<input type="text" class="ex-name" value="' + esc(f.name) + '" placeholder="Field">' +
        '<input type="text" class="ex-val" value="' + esc(f.value) + '">' +
        '<button type="button" class="row-del" data-del-extra="' + i + '" title="Remove">' + DEL + '</button></div>';
    }).join('');
    var info = otpInfo(e);
    host.innerHTML =
      '<h2 id="d-title-h">' + esc(fieldText(e, 'Title') || 'Entry') + '</h2>' +
      '<div class="fields">' +
      '<label>Title<input type="text" id="d-title" value="' + esc(fieldText(e, 'Title')) + '"></label>' +
      '<label>Username<div class="copyrow"><input type="text" id="d-user" value="' + esc(fieldText(e, 'UserName')) + '">' +
      '<button type="button" class="ghost" id="d-copy-user">Copy</button></div></label>' +
      '<label>Password<div class="copyrow"><input type="password" id="d-pass" value="' + esc(fieldText(e, 'Password')) + '" autocomplete="off">' +
      '<button type="button" class="ghost" data-toggle="d-pass">Show</button>' +
      '<button type="button" class="ghost" id="d-copy-pass">Copy</button></div>' +
      '<div class="gen"><input type="range" id="d-glen" min="12" max="40" value="20"><span id="d-glen-n">20</span>' +
      '<button type="button" class="ghost" id="d-gen">Generate</button></div></label>' +
      '<label>URL<div class="copyrow"><input type="text" id="d-url" value="' + esc(fieldText(e, 'URL')) + '" spellcheck="false">' +
      '<button type="button" class="ghost" id="d-copy-url">Copy</button></div></label>' +
      '<label>Notes<textarea id="d-notes">' + esc(fieldText(e, 'Notes')) + '</textarea></label>' +
      '<div id="d-otp-wrap"' + (info ? '' : ' hidden') + '><div class="otp" id="d-otp">••••••</div>' +
      '<div class="otp-meta" id="d-otp-meta"></div>' +
      '<button type="button" class="ghost" id="d-copy-otp">Copy code</button></div>' +
      '<label>TOTP secret <span class="opt">(optional)</span><input type="text" id="d-otp-secret" value="' +
      esc(info && info.secret || '') + '" spellcheck="false" autocomplete="off"></label>' +
      '<div><b style="font-size:.82rem;color:var(--muted)">Custom fields</b>' + extraHtml +
      '<div class="row"><button type="button" class="ghost" id="d-add-field">Add field</button></div></div>' +
      '<div class="row">' +
      '<button type="button" id="d-save">Save entry</button>' +
      '<button type="button" class="danger" id="d-del">Delete</button>' +
      '</div></div>';
    wireDetail(e);
    if (info && info.secret) tickOtp(info);
  }

  function tickOtp(info) {
    var run = function () {
      totp(info).then(function (t) {
        if (!t) return;
        var el = $('d-otp'), meta = $('d-otp-meta');
        if (el) el.textContent = t.code;
        if (meta) meta.textContent = t.left + 's remaining · copy-paste only';
      }).catch(function () {});
    };
    run();
    otpTimer = setInterval(run, 1000);
  }

  function readExtras() {
    var nodes = document.querySelectorAll('#detail [data-extra]');
    var out = [];
    nodes.forEach(function (row) {
      var n = row.querySelector('.ex-name');
      var v = row.querySelector('.ex-val');
      var name = ((n && n.value) || '').trim();
      if (name && !STD[name]) out.push({ name: name, value: (v && v.value) || '' });
    });
    return out;
  }

  function applyEntry(entry) {
    entry.setField('Title', $('d-title').value || '', false);
    entry.setField('UserName', $('d-user').value || '', false);
    entry.setField('Password', $('d-pass').value || '', true);
    entry.setField('URL', $('d-url').value || '', false);
    entry.setField('Notes', $('d-notes').value || '', false);
    var secret = ($('d-otp-secret').value || '').trim();
    if (secret) entry.setField('TimeOtp-Secret', secret, true);
    else if (entry.fields) {
      entry.fields.delete('TimeOtp-Secret');
      entry.fields.delete('TimeOtp-Secret-Base32');
    }
    extraFields(entry).forEach(function (f) { entry.fields.delete(f.name); });
    readExtras().forEach(function (f) { entry.setField(f.name, f.value, false); });
    if (entry.times && entry.times.update) entry.times.update();
  }

  function wireDetail(entry) {
    $('d-copy-user').onclick = function () { copyText($('d-user').value, 'Username copied'); };
    $('d-copy-pass').onclick = function () { copyText($('d-pass').value, 'Password copied'); };
    $('d-copy-url').onclick = function () { copyText($('d-url').value, 'URL copied'); };
    var otpBtn = $('d-copy-otp');
    if (otpBtn) otpBtn.onclick = function () { copyText($('d-otp').textContent, 'Code copied'); };
    $('d-glen').oninput = function () { $('d-glen-n').textContent = $('d-glen').value; };
    $('d-gen').onclick = function () {
      $('d-pass').type = 'text';
      $('d-pass').value = genPassword(parseInt($('d-glen').value, 10));
    };
    $('d-add-field').onclick = function () {
      applyEntry(entry);
      var n = 1, name = 'Field';
      while (entry.fields.has(name)) { n++; name = 'Field ' + n; }
      entry.setField(name, '', false);
      renderDetail();
    };
    $('d-save').onclick = function () {
      applyEntry(entry);
      scheduleSave();
      render();
      toast('Entry saved');
    };
    $('d-del').onclick = function () {
      ask('Move this entry to the Recycle Bin?').then(function (yes) {
        if (!yes) return;
        kdbx.remove(entry);
        entryId = '';
        persist();
        render();
      });
    };
    $('d-title').oninput = function () {
      var h = $('d-title-h');
      if (h) h.textContent = $('d-title').value || 'Entry';
    };
  }

  function newEntry() {
    var g = findGroup(groupId) || defaultGroup();
    if (!g || isRecycle(g)) g = defaultGroup();
    var e = kdbx.createEntry(g);
    e.setField('Title', 'New entry', false);
    entryId = uidOf(e);
    groupId = uidOf(g);
    persist();
    render();
  }
  function newGroup() {
    var parent = findGroup(groupId) || defaultGroup();
    if (!parent || isRecycle(parent)) parent = defaultGroup();
    ask('Group name', 'New group').then(function (name) {
      if (!name) return;
      var g = kdbx.createGroup(parent, name);
      groupId = uidOf(g);
      persist();
      render();
    });
  }

  function exportKdbx() {
    if (!kdbx) return;
    kdbx.save().then(function (ab) {
      var name = ((kdbx.meta && kdbx.meta.name) || 'vault').replace(/[^\w.-]+/g, '_') + '.kdbx';
      var blob = new Blob([ab], { type: 'application/octet-stream' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      toast('Exported ' + name);
    }).catch(function (err) { setBar('Export failed: ' + errMsg(err)); });
  }

  function withBusy(fn) {
    if (busy) return;
    busy = true;
    Promise.resolve().then(fn).then(function () { busy = false; }, function () { busy = false; });
  }

  function unlockStored() {
    if (!stored || !stored.b64) { setMsg('unlock-status', 'No vault on this device yet.', 'warn'); return; }
    var pw = $('pw-unlock').value || '';
    if (!pw) { setMsg('unlock-status', 'Enter the master password.', 'warn'); return; }
    setMsg('unlock-status', 'Unlocking…');
    withBusy(function () {
      return readKey($('key-unlock')).then(function (keyAb) {
        var c = makeCreds(pw, keyAb);
        return c.ready.then(function () { return kw.Kdbx.load(b64ToAb(stored.b64), c); })
          .then(function (db) { openDb(db, c, stored); $('pw-unlock').value = ''; });
      }).catch(function (err) { setMsg('unlock-status', errMsg(err), 'warn'); });
    });
  }

  function createVault() {
    var name = ($('new-name').value || '').trim() || 'My Vault';
    var a = $('pw-new').value || '', b = $('pw-new2').value || '';
    if (a.length < 8) { setMsg('create-status', 'Use at least 8 characters.', 'warn'); return; }
    if (a !== b) { setMsg('create-status', 'Passwords do not match.', 'warn'); return; }
    var guard = (stored && stored.b64)
      ? ask('Replace the vault on this device? The old file is gone unless you exported it.')
      : Promise.resolve(true);
    guard.then(function (yes) { if (yes) reallyCreateVault(name, a); });
  }

  function reallyCreateVault(name, a) {
    setMsg('create-status', 'Creating…');
    withBusy(function () {
      return readKey($('key-new')).then(function (keyAb) {
        var c = makeCreds(a, keyAb);
        return c.ready.then(function () {
          var db = kw.Kdbx.create(c, name);
          kdbx = db;
          creds = c;
          return persist().then(function (rec) {
            $('pw-new').value = '';
            $('pw-new2').value = '';
            openDb(db, c, rec);
            setMsg('create-status', '');
          });
        });
      }).catch(function (err) { setMsg('create-status', errMsg(err), 'warn'); });
    });
  }

  var importBuf = null;
  var importName = '';

  function importVault() {
    if (!importBuf) { setMsg('import-status', 'Choose a .kdbx file.', 'warn'); return; }
    var pw = $('pw-import').value || '';
    if (!pw) { setMsg('import-status', 'Enter the master password.', 'warn'); return; }
    var guard = (stored && stored.b64)
      ? ask('Replace the vault on this device with this file?')
      : Promise.resolve(true);
    guard.then(function (yes) { if (yes) reallyImportVault(pw); });
  }

  function reallyImportVault(pw) {
    setMsg('import-status', 'Opening…');
    withBusy(function () {
      return readKey($('key-import')).then(function (keyAb) {
        var c = makeCreds(pw, keyAb);
        return c.ready.then(function () { return kw.Kdbx.load(importBuf, c); })
          .then(function (db) {
            kdbx = db;
            creds = c;
            if (db.meta && !db.meta.name) db.meta.name = importName.replace(/\.kdbx$/i, '') || 'Vault';
            return persist().then(function (rec) {
              $('pw-import').value = '';
              openDb(db, c, rec);
            });
          });
      }).catch(function (err) { setMsg('import-status', errMsg(err), 'warn'); });
    });
  }

  function takeFile(file) {
    if (!file) return;
    importName = file.name || 'vault.kdbx';
    $('import-name').textContent = importName;
    file.arrayBuffer().then(function (ab) { importBuf = ab; });
  }

  function wireToggles() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-toggle]');
      if (!t) return;
      var input = $(t.getAttribute('data-toggle'));
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      t.textContent = input.type === 'password' ? 'Show' : 'Hide';
    });
  }

  function boot() {
    if (!kw || !kw.Kdbx || !kw.Credentials || !kw.ProtectedValue) {
      setMsg('create-status', 'kdbxweb failed to load.', 'warn');
      return;
    }
    if (!kw.CryptoEngine || typeof kw.CryptoEngine.setArgon2Impl !== 'function') {
      setMsg('create-status', 'Crypto engine missing.', 'warn');
      return;
    }
    wireToggles();
    $('btn-unlock').onclick = unlockStored;
    $('btn-create').onclick = createVault;
    $('btn-import').onclick = importVault;
    $('btn-new-entry').onclick = newEntry;
    $('btn-export').onclick = exportKdbx;
    $('btn-lock').onclick = function () { doLock(''); };
    $('search').oninput = function () { renderList(); };
    $('pw-unlock').addEventListener('keydown', function (e) { if (e.key === 'Enter') unlockStored(); });
    $('pw-new2').addEventListener('keydown', function (e) { if (e.key === 'Enter') createVault(); });
    $('pw-import').addEventListener('keydown', function (e) { if (e.key === 'Enter') importVault(); });

    $('groups').addEventListener('click', function (e) {
      var g = e.target.closest('[data-gid]');
      if (g) { groupId = g.getAttribute('data-gid'); entryId = ''; render(); return; }
      if (e.target.id === 'btn-new-group' || (e.target.closest && e.target.closest('#btn-new-group'))) newGroup();
    });
    $('list').addEventListener('click', function (e) {
      var row = e.target.closest('[data-eid]');
      if (!row) return;
      entryId = row.getAttribute('data-eid');
      renderList();
      renderDetail();
    });
    $('detail').addEventListener('click', function (e) {
      var del = e.target.closest('[data-del-extra]');
      if (!del) return;
      var entry = findEntry(entryId);
      if (!entry) return;
      applyEntry(entry);
      var extras = extraFields(entry);
      var i = parseInt(del.getAttribute('data-del-extra'), 10);
      if (extras[i]) entry.fields.delete(extras[i].name);
      renderDetail();
      scheduleSave();
    });

    var drop = $('drop'), fileEl = $('file-import');
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) takeFile(f);
    });
    drop.addEventListener('click', function () { fileEl.click(); });
    fileEl.addEventListener('change', function () {
      if (fileEl.files && fileEl.files[0]) takeFile(fileEl.files[0]);
      fileEl.value = '';
    });
    ['key-unlock', 'key-new', 'key-import'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        var f = $(id).files && $(id).files[0];
        var name = $(id + '-name');
        if (name) name.textContent = f ? f.name : '';
      });
    });

    document.addEventListener('pointerdown', bumpIdle, { capture: true, passive: true });
    document.addEventListener('keydown', bumpIdle, { capture: true, passive: true });

    var load = vaultDb ? vaultDb.get('current') : Promise.resolve(null);
    load.then(function (rec) {
      stored = rec && rec.b64 ? rec : null;
      refreshGate();
    }).catch(function () { refreshGate(); });
  }

  boot();
})();
