/*
 * jsnes — GifOS shell.
 *
 * Library, drop a dump, last-play snapshot + battery SRAM in gifos.db,
 * quick states, and the two-controller net. Invite is OS chrome — this
 * file never draws it.
 */
(function (root) {
  'use strict';

  var api = root.gifos || null;
  var samples = root.SAMPLE_ROMS || [];
  var userRoms = [];
  var prefs = { mute: false, last: '', slot: 1 };
  var slot = 1;
  var libOpen = false;
  var slotCache = {};

  var $ = function (id) { return document.getElementById(id); };
  var gamesBtn = $('btn-games'), closeBtn = $('lib-close'), dropBtn = $('btn-drop');
  var fileEl = $('file'), libEl = $('library');
  var nameEl = $('cart-name'), whoEl = $('who'), hintEl = $('hint');
  var pauseBtn = $('btn-pause'), resetBtn = $('btn-reset'), muteBtn = $('btn-mute');
  var saveBtn = $('btn-save'), loadBtn = $('btn-load'), slotBtn = $('btn-slot');

  function db(n) { return api && api.db ? api.db(n) : null; }

  function escape(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function bytesOf(x) {
    if (!x) return null;
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    if (typeof x === 'string') {
      var bin = atob(x), u = new Uint8Array(bin.length), i;
      for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    }
    if (Array.isArray(x)) return Uint8Array.from(x);
    return null;
  }

  function savePrefs() {
    var col = db('prefs');
    if (!col) return;
    col.put({ id: 'prefs', mute: prefs.mute, last: prefs.last, slot: slot }).catch(function () {});
  }

  function loadPrefs() {
    var col = db('prefs');
    if (!col) return Promise.resolve();
    return col.get('prefs').then(function (row) {
      if (!row) return;
      if (row.mute != null) prefs.mute = !!row.mute;
      if (row.last) prefs.last = row.last;
      if (row.slot) slot = row.slot | 0;
      if (slot < 1 || slot > 3) slot = 1;
    }).catch(function () {});
  }

  function loadLibrary() {
    var col = db('library');
    if (!col) return Promise.resolve();
    return col.getAll().then(function (list) {
      userRoms = [];
      for (var i = 0; i < (list || []).length; i++) {
        var r = list[i];
        if (!r || !r.bytes) continue;
        var b = bytesOf(r.bytes);
        if (!b || !root.Emu.isNes(b)) continue;
        userRoms.push({ id: r.id, name: r.name || 'Dump', hash: r.id, bytes: b, sample: false });
      }
    }).catch(function () {});
  }

  function persistDump(meta) {
    var col = db('library');
    if (!col) return;
    col.put({ id: meta.hash, name: meta.name, bytes: meta.bytes, t: Date.now() }).catch(function () {});
  }

  function findSample(id) {
    for (var i = 0; i < samples.length; i++) if (samples[i].id === id) return samples[i];
    return null;
  }

  function findByHash(h) {
    var i, s;
    for (i = 0; i < samples.length; i++) {
      s = samples[i];
      if (s.hash === h || s.id === h) return s;
    }
    for (i = 0; i < userRoms.length; i++) if (userRoms[i].hash === h || userRoms[i].id === h) return userRoms[i];
    return null;
  }

  function decorateSamples() {
    for (var i = 0; i < samples.length; i++) {
      var s = samples[i];
      if (!s.hash) s.hash = root.Emu.hashBytes(s.bytes);
      s.sample = true;
    }
  }

  function paintWho() {
    if (!root.Net || !root.Net.live() || root.Net.others() < 1) {
      whoEl.hidden = true;
      return;
    }
    whoEl.hidden = false;
    var pad = root.Net.owner() ? 'P1' : 'P2';
    whoEl.textContent = pad + ' · ' + root.Net.count() + ' pads';
  }

  function paintChrome() {
    var c = root.Emu.cart();
    nameEl.textContent = c ? c.name : 'jsnes';
    pauseBtn.textContent = root.Emu.paused() ? 'Play' : 'Pause';
    muteBtn.textContent = root.Emu.muted() ? 'Muted' : 'Mute';
    slotBtn.textContent = String(slot);
    paintWho();
    paintLibrary();
  }

  function paintLibrary() {
    var samplesEl = $('lib-samples'), userEl = $('lib-user');
    var cur = root.Emu.cart();
    var html = '', i, r, cls;
    for (i = 0; i < samples.length; i++) {
      r = samples[i];
      cls = cur && cur.hash === r.hash ? ' current' : '';
      html += '<button type="button" class="rom' + cls + '" data-sample="' + escape(r.id) + '">' +
        '<span class="n">' + escape(r.name) + '</span>' +
        '<span class="m">' + escape(r.by) + (r.players === 2 ? ' · two players' : '') +
        (r.battery ? ' · battery' : '') + ' — ' + escape(r.blurb) + '</span></button>';
    }
    samplesEl.innerHTML = html || '<div class="empty">No sample carts.</div>';
    html = '';
    for (i = 0; i < userRoms.length; i++) {
      r = userRoms[i];
      cls = cur && cur.hash === r.hash ? ' current' : '';
      html += '<button type="button" class="rom' + cls + '" data-hash="' + escape(r.hash) + '">' +
        '<span class="n">' + escape(r.name) + '</span>' +
        '<span class="m">Your dump · ' + (r.bytes.length / 1024 | 0) + ' KB</span></button>';
    }
    userEl.innerHTML = html || '<div class="empty">None yet. Drop a .nes file.</div>';
  }

  function setLib(on) {
    libOpen = !!on;
    libEl.hidden = !libOpen;
    if (libOpen) paintLibrary();
  }

  function loadSave(hash) {
    var col = db('saves');
    if (!col) return Promise.resolve(null);
    return col.get(hash).then(function (row) {
      return row || null;
    }).catch(function () { return null; });
  }

  /* Battery SRAM (when the iNES battery bit is set) AND a last-play
     snapshot (the two packed carts have no battery chip). Same row. */
  function storeSave(json, ram) {
    var c = root.Emu.cart();
    if (!c) return;
    var col = db('saves');
    if (!col) return;
    var rec = { id: c.hash, t: Date.now(), battery: !!c.battery };
    if (json) rec.json = json;
    if (ram) rec.ram = ram instanceof Uint8Array ? Array.from(ram) : ram;
    col.put(rec).catch(function () {});
  }

  function storeSram(bytes) {
    storeSave(root.Emu.toState(), bytes);
  }

  function play(meta, resume) {
    if (!meta || !meta.bytes) return Promise.resolve();
    if (!root.Emu.isNes(meta.bytes)) {
      hintEl.textContent = 'That file is not an iNES dump.';
      return Promise.resolve();
    }
    var hash = meta.hash || root.Emu.hashBytes(meta.bytes);
    meta.hash = hash;
    return loadSave(hash).then(function (row) {
      var ram = row ? bytesOf(row.ram) : null;
      try {
        root.Emu.loadROM(meta.bytes, meta, ram);
      } catch (err) {
        hintEl.textContent = 'Could not load that cart (' + (err && err.message ? err.message : 'unsupported mapper') + ').';
        return;
      }
      if (resume !== false && row && row.json) root.Emu.fromState(row.json);
      prefs.last = meta.sample ? meta.id : hash;
      savePrefs();
      setLib(false);
      paintChrome();
      if (root.Net && root.Net.owner()) {
        root.Net.publishSession();
        if (!meta.sample) root.Net.publishCart(meta.bytes, meta);
      }
    });
  }

  function playSample(id) {
    var s = findSample(id);
    if (s) return play(s);
  }

  function ingestFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var u8 = new Uint8Array(reader.result);
      if (!root.Emu.isNes(u8)) {
        hintEl.textContent = 'That file is not an iNES dump (.nes).';
        setLib(true);
        return;
      }
      if (u8.length > 2 * 1024 * 1024) {
        hintEl.textContent = 'That dump is larger than 2 MB.';
        return;
      }
      var name = String(file.name || 'Dump').replace(/\.nes$/i, '');
      var meta = { id: root.Emu.hashBytes(u8), name: name, bytes: u8, sample: false };
      meta.hash = meta.id;
      var found = false, i;
      for (i = 0; i < userRoms.length; i++) if (userRoms[i].hash === meta.hash) { userRoms[i] = meta; found = true; }
      if (!found) userRoms.push(meta);
      persistDump(meta);
      play(meta);
    };
    reader.readAsArrayBuffer(file);
  }

  function slotId() {
    var c = root.Emu.cart();
    if (!c) return null;
    return c.hash + ':' + slot;
  }

  function saveSlot() {
    var id = slotId(), json = root.Emu.toState();
    if (!id || !json) return;
    slotCache[id] = json;
    var col = db('slots');
    if (col) col.put({ id: id, json: json, t: Date.now() }).catch(function () {});
    if (root.Emu.flushNow) root.Emu.flushNow();
  }

  function loadSlot() {
    var id = slotId();
    if (!id) return;
    if (slotCache[id]) { root.Emu.fromState(slotCache[id]); return; }
    var col = db('slots');
    if (!col) return;
    col.get(id).then(function (row) {
      if (row && row.json) {
        slotCache[id] = row.json;
        root.Emu.fromState(row.json);
      }
    }).catch(function () {});
  }

  function cycleSlot() {
    slot = slot === 3 ? 1 : slot + 1;
    prefs.slot = slot;
    savePrefs();
    paintChrome();
  }

  function onKey(e) {
    if (e.repeat) return;
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA') return;
    if (e.keyCode === 80) { e.preventDefault(); togglePause(); }
    else if (e.keyCode === 82 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); doReset(); }
    else if (e.keyCode === 77) { e.preventDefault(); toggleMute(); }
    else if (e.keyCode === 116) { e.preventDefault(); saveSlot(); }
    else if (e.keyCode === 118) { e.preventDefault(); loadSlot(); }
    else if (e.keyCode === 49) { slot = 1; savePrefs(); paintChrome(); }
    else if (e.keyCode === 50) { slot = 2; savePrefs(); paintChrome(); }
    else if (e.keyCode === 51) { slot = 3; savePrefs(); paintChrome(); }
    else if (e.keyCode === 27) { setLib(false); }
  }

  function togglePause() {
    if (!root.Emu.running()) return;
    root.Emu.setPaused(!root.Emu.paused());
    if (root.Net && root.Net.owner()) root.Net.publishSession();
    paintChrome();
  }

  function doReset() {
    if (!root.Emu.running()) return;
    root.Emu.reset();
    if (root.Net && root.Net.owner()) root.Net.bumpReset();
    paintChrome();
  }

  function toggleMute() {
    prefs.mute = !root.Emu.muted();
    root.Emu.setMuted(prefs.mute);
    savePrefs();
    paintChrome();
  }

  function followHost(rec) {
    if (!rec || !rec.hash) return;
    var local = findByHash(rec.hash) || findSample(rec.sampleId);
    if (local) { play(local, false); return; }
    if (root.Net) {
      root.Net.fetchCart().then(function (row) {
        if (!row || !row.bytes) return;
        var b = bytesOf(row.bytes);
        if (!b) return;
        play({ id: row.hash || rec.hash, name: row.name || rec.name || 'Cart', bytes: b, hash: row.hash || rec.hash, sample: false }, false);
      });
    }
  }

  gamesBtn.addEventListener('click', function () { setLib(true); });
  closeBtn.addEventListener('click', function () { setLib(false); });
  dropBtn.addEventListener('click', function () { fileEl.click(); });
  fileEl.addEventListener('change', function () {
    if (fileEl.files && fileEl.files[0]) ingestFile(fileEl.files[0]);
    fileEl.value = '';
  });
  pauseBtn.addEventListener('click', togglePause);
  resetBtn.addEventListener('click', doReset);
  muteBtn.addEventListener('click', toggleMute);
  saveBtn.addEventListener('click', saveSlot);
  loadBtn.addEventListener('click', loadSlot);
  slotBtn.addEventListener('click', cycleSlot);

  $('lib-samples').addEventListener('click', function (e) {
    var n = e.target.closest ? e.target.closest('[data-sample]') : null;
    if (n) playSample(n.getAttribute('data-sample'));
  });
  $('lib-user').addEventListener('click', function (e) {
    var n = e.target.closest ? e.target.closest('[data-hash]') : null;
    if (!n) return;
    var h = n.getAttribute('data-hash');
    for (var i = 0; i < userRoms.length; i++) if (userRoms[i].hash === h) play(userRoms[i]);
  });

  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) ingestFile(f);
  });
  document.addEventListener('keydown', onKey);

  if (api && api.onBack) {
    api.onBack(function () {
      if (libOpen) { setLib(false); return true; }
      if (root.Emu.running() && !root.Emu.paused()) { togglePause(); return true; }
      return false;
    });
  }

  function boot() {
    decorateSamples();
    root.Emu.fit();
    root.Emu.onSaveSram(storeSram);
    root.Emu.onSaveResume(storeSave);
    root.Emu.onStatus(paintChrome);
    root.Emu.setMuted(prefs.mute);
    root.Touch.init();
    root.Emu.kick();
    paintChrome();
    setLib(!prefs.last);

    var roomP = root.Net ? root.Net.init() : Promise.resolve({ owner: true, others: 0 });
    roomP.then(function (room) {
      room = room || { owner: true, others: 0 };
      if (root.Net) {
        root.Net.onRoom(function () { paintWho(); });
        root.Net.onCart(followHost);
      }
      paintWho();
      if (!room.owner) {
        var pend = root.Net && root.Net.pendingCart();
        if (pend) followHost(pend);
        else setLib(true);
        return;
      }
      if (prefs.last) {
        var s = findSample(prefs.last) || findByHash(prefs.last);
        if (s) play(s);
        else setLib(true);
      }
    }).catch(function () {
      if (prefs.last) {
        var s = findSample(prefs.last) || findByHash(prefs.last);
        if (s) play(s);
      }
    });
  }

  function start() {
    loadPrefs().then(loadLibrary).then(boot);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
