// Yopass — lock a secret, Invite is the room. Their server stays behind.
// Each player may write the shared secret row (read-write). Burn is a flag.
(function () {
  'use strict';
  var C = window.YopassCrypto;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };

  var saveDb = null, roomDb = null, me = { id: 'local', name: 'You' };
  var rec = null;
  var subbed = false;
  try {
    if (window.gifos) {
      saveDb = gifos.db('save');
      roomDb = gifos.db('room');
    }
  } catch (e) {}

  function setChip(cls, text) {
    $('chip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('chipText').textContent = text;
  }
  function show(id) {
    ['home', 'locked', 'open', 'revealed'].forEach(function (k) { $(k).hidden = k !== id; });
  }
  function metaLine(r) {
    if (!r) return '';
    var bits = [];
    bits.push(r.hasPass ? 'Passphrase on' : 'Anyone in the room');
    bits.push(r.burn ? 'Burns after reading' : 'Stays until you burn it');
    return bits.join(' · ');
  }

  function applyRec(r) {
    rec = r && r.ct && !r.burned ? r : (r && r.burned ? { burned: true } : null);
    if (rec && rec.burned) {
      show('home');
      $('lockStatus').textContent = 'That secret was burned.';
      $('lockStatus').className = 'statusline warn';
      setChip('dead', 'Burned');
      return;
    }
    if (!rec) {
      if ($('revealed').hidden === false) return;
      show('home');
      setChip('', 'Ready');
      return;
    }
    var mine = rec.by === me.id;
    if (mine) {
      show('locked');
      $('lockedLede').textContent = rec.hasPass
        ? 'Locked with a passphrase. Invite hands the ciphertext; they still type the passphrase.'
        : 'Locked. Invite is the one-time room — anyone who opens the link can read it.';
      $('lockedMeta').textContent = metaLine(rec);
      setChip('lock', 'Locked');
    } else {
      show('open');
      $('openLede').textContent = rec.hasPass
        ? 'This secret needs the passphrase they told you.'
        : 'Open it. ' + (rec.burn ? 'It will burn after this look.' : 'It stays until they burn it.');
      setPassVisible(!!rec.hasPass);
      setChip('lock', 'A secret');
    }
  }

  function putSecret(row) {
    rec = row;
    var jobs = [];
    if (roomDb) jobs.push(roomDb.put(row));
    if (saveDb) jobs.push(saveDb.put({ id: 'last', ct: row.ct, iv: row.iv, salt: row.salt || null, key: row.key || null, hasPass: row.hasPass, burn: row.burn, by: row.by, at: row.at }));
    return Promise.all(jobs).catch(function (e) {
      $('lockStatus').textContent = (e && e.message) || 'Could not save.';
      $('lockStatus').className = 'statusline warn';
    });
  }

  function burn() {
    if (!rec || rec.burned) return Promise.resolve();
    var gone = { id: 'secret', burned: true, at: nowMs(), by: me.id };
    rec = gone;
    var jobs = [];
    if (roomDb) jobs.push(roomDb.put(gone));
    if (saveDb) jobs.push(saveDb.delete('last'));
    return Promise.all(jobs).catch(function () {});
  }

  $('lockBtn').onclick = function () {
    var plain = $('plain').value;
    if (!plain) {
      $('lockStatus').textContent = 'Type a secret first.';
      $('lockStatus').className = 'statusline warn';
      return;
    }
    var pass = $('pass').value;
    var doBurn = $('burn').checked;
    $('lockBtn').disabled = true;
    C.lock(plain, pass).then(function (out) {
      $('plain').value = '';
      $('pass').value = '';
      var row = {
        id: 'secret',
        ct: out.ct,
        iv: out.iv,
        salt: out.salt || null,
        key: out.key || null,
        hasPass: !!out.hasPass,
        burn: doBurn,
        burned: false,
        by: me.id,
        at: nowMs()
      };
      return putSecret(row).then(function () {
        applyRec(row);
      });
    }).catch(function (e) {
      $('lockStatus').textContent = (e && e.message) || 'Could not lock.';
      $('lockStatus').className = 'statusline warn';
    }).then(function () { $('lockBtn').disabled = false; });
  };

  $('openMine').onclick = function () { showOpen(); };
  $('openBtn').onclick = function () { doOpen(); };
  function setPassVisible(on) {
    $('openPass').hidden = !on;
    var lab = document.querySelector('label[for="openPass"]');
    if (lab) lab.hidden = !on;
  }
  function showOpen() {
    show('open');
    $('openLede').textContent = rec && rec.hasPass ? 'Type the passphrase.' : 'Open the secret on this device.';
    setPassVisible(!!(rec && rec.hasPass));
  }
  function doOpen() {
    if (!rec || rec.burned) {
      $('openStatus').textContent = 'Nothing to open.';
      return;
    }
    var pass = $('openPass').value;
    $('openBtn').disabled = true;
    C.unlock(rec, rec.hasPass ? pass : null).then(function (text) {
      $('revText').textContent = text;
      $('revTitle').textContent = rec.burn ? 'Secret · burns after this look' : 'Secret';
      $('revNote').textContent = rec.burn ? 'Burned. It will not open again.' : 'Hide it when you are done.';
      $('revNote').className = rec.burn ? 'statusline warn' : 'statusline';
      show('revealed');
      setChip('ready', 'Open');
      if (rec.burn) return burn();
    }).catch(function (e) {
      $('openStatus').textContent = (e && e.message) || 'Could not open.';
      $('openStatus').className = 'statusline warn';
    }).then(function () { $('openBtn').disabled = false; });
  }

  $('burnNow').onclick = function () {
    burn().then(function () {
      show('home');
      $('lockStatus').textContent = 'Burned.';
      $('lockStatus').className = 'statusline';
      setChip('dead', 'Burned');
    });
  };
  $('newSecret').onclick = function () {
    show('home');
    setChip('', 'Ready');
  };
  $('hideBtn').onclick = function () {
    $('revText').textContent = '';
    if (rec && rec.burned) {
      show('home');
      setChip('dead', 'Burned');
    } else if (rec && rec.by === me.id) {
      applyRec(rec);
    } else {
      show('open');
    }
  };
  $('copyBtn').onclick = function () {
    var t = $('revText').textContent;
    if (!t) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () {
        $('revNote').textContent = 'Copied on this device.';
        $('revNote').className = 'statusline good';
      }).catch(function () { $('revNote').textContent = 'Select the text and copy it.'; });
    } else {
      $('revNote').textContent = 'Select the text and copy it.';
    }
  };

  function bootRoom(list) {
    var i, found = null;
    for (i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].id === 'secret') found = list[i];
    }
    applyRec(found);
  }

  function start() {
    var p = window.gifos && gifos.me ? gifos.me() : Promise.resolve(me);
    p.then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      if (roomDb && !subbed) {
        subbed = true;
        roomDb.subscribe(bootRoom);
      } else if (saveDb) {
        saveDb.get('last').then(function (row) {
          if (row && row.ct) applyRec(row);
        }).catch(function () {});
      }
    }).catch(function () {});
  }

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (!$('revealed').hidden) { $('hideBtn').click(); return true; }
      if (!$('open').hidden || !$('locked').hidden) { show('home'); return true; }
      return false;
    });
  }

  setChip('', 'Ready');
  start();
})();
