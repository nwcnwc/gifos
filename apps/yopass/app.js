// Yopass — lock a secret, Invite is the room. Their server stays behind.
// Owner writes the lock. Guests open (and burn). Ciphertext lives in gifos.db.
(function () {
  'use strict';
  var C = window.YopassCrypto;
  var Core = window.YopassCore;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var SCREENS = ['home', 'locked', 'open', 'revealed', 'waiting', 'gone'];

  var saveDb = null, roomDb = null, me = { id: 'local', name: 'You' };
  var isOwner = true;
  var rec = null;
  var subbed = false;
  var drafting = false;
  var revealing = false;
  var lifetime = '1h';
  var tickTimer = 0;
  var lastScreen = 'home';
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
    SCREENS.forEach(function (k) { $(k).hidden = k !== id; });
    lastScreen = id;
  }
  function paintMeta(el, r) {
    el.textContent = Core.metaBits(r, nowMs()).join(' · ');
  }

  function applyRec(r) {
    var st = Core.status(r, nowMs());
    // Burn-after-read writes the gone row while the secret is still on screen.
    // Hold the revealed view so Copy/Hide still work; Hide then shows gone.
    if (revealing && lastScreen === 'revealed') {
      rec = (st === 'locked') ? r : (st === 'burned' || st === 'expired' ? r : rec);
      return;
    }
    if (drafting && st === 'locked' && rec && r && r.at === rec.at) {
      rec = r;
      return;
    }
    rec = (st === 'locked') ? r : (st === 'burned' || st === 'expired' ? r : null);
    if (st === 'expired' && r && !r.burned) {
      rec = r;
      burn(true).then(function () { applyRec(rec); });
      return;
    }
    var scr = Core.screen(r, me, isOwner, nowMs());
    if (scr === 'home') {
      show('home');
      setChip('ready', 'Ready');
      return;
    }
    if (scr === 'waiting') {
      show('waiting');
      setChip('wait', 'Waiting');
      return;
    }
    if (scr === 'gone') {
      var g = Core.goneCopy(r, nowMs());
      $('goneTitle').textContent = g.title;
      $('goneLede').textContent = g.lede;
      $('goneLock').hidden = !isOwner;
      show('gone');
      setChip('dead', st === 'expired' ? 'Expired' : 'Burned');
      return;
    }
    if (scr === 'locked') {
      show('locked');
      $('lockedLede').textContent = rec.hasPass
        ? 'Locked with a passphrase. Invite hands the ciphertext; they still type the passphrase.'
        : 'Locked. Invite is the one-time room — anyone who opens the link can read it.';
      paintMeta($('lockedMeta'), rec);
      setChip('lock', 'Locked');
      armTick();
      return;
    }
    show('open');
    $('openLede').textContent = rec.hasPass
      ? 'This secret needs the passphrase they told you.'
      : (rec.burn ? 'Open it. It will burn after this look.' : 'Open it. It stays until they burn it or it expires.');
    paintMeta($('openMeta'), rec);
    setPassVisible(!!rec.hasPass);
    $('openBtn').textContent = rec.burn ? 'Open and burn' : 'Open';
    $('openStatus').textContent = rec.burn ? 'Opening burns this secret. It will not open again.' : '';
    $('openStatus').className = rec.burn ? 'statusline warn' : 'statusline';
    setChip('lock', 'A secret');
    armTick();
  }

  function armTick() {
    if (tickTimer) return;
    tickTimer = setInterval(function () {
      if (!rec || !rec.expiresAt) return;
      if (Core.status(rec, nowMs()) === 'expired') {
        applyRec(rec);
        return;
      }
      if (lastScreen === 'locked') paintMeta($('lockedMeta'), rec);
      if (lastScreen === 'open') paintMeta($('openMeta'), rec);
    }, 1000);
  }

  function putSecret(row) {
    rec = row;
    drafting = false;
    var jobs = [];
    if (roomDb) jobs.push(roomDb.put(row));
    if (saveDb) {
      jobs.push(saveDb.put({
        id: 'last',
        ct: row.ct, iv: row.iv, salt: row.salt || null, key: row.key || null,
        hasPass: row.hasPass, burn: row.burn, lifetime: row.lifetime,
        expiresAt: row.expiresAt || 0, by: row.by, at: row.at
      }));
    }
    return Promise.all(jobs).catch(function (e) {
      $('lockStatus').textContent = (e && e.message) || 'Could not save.';
      $('lockStatus').className = 'statusline warn';
    });
  }

  function burn(silent) {
    if (!rec || rec.burned) return Promise.resolve();
    var gone = Core.burnRow(me, nowMs());
    rec = gone;
    var jobs = [];
    if (roomDb) jobs.push(roomDb.put(gone));
    if (saveDb) jobs.push(saveDb.delete('last'));
    return Promise.all(jobs).then(function () {
      if (!silent) applyRec(gone);
    }).catch(function () {
      if (!silent) applyRec(gone);
    });
  }

  $('lockBtn').onclick = function () {
    if (!isOwner) {
      $('lockStatus').textContent = 'Only the person who opened the room can lock a secret.';
      $('lockStatus').className = 'statusline warn';
      return;
    }
    var plain = $('plain').value;
    if (Core.isEmpty(plain)) {
      $('lockStatus').textContent = 'Type a secret first.';
      $('lockStatus').className = 'statusline warn';
      return;
    }
    var pass = String($('pass').value || '').trim();
    var doBurn = $('burn').checked;
    $('lockBtn').disabled = true;
    $('lockBtn').textContent = 'Locking…';
    C.lock(plain, pass).then(function (out) {
      $('plain').value = '';
      $('pass').value = '';
      $('plainCount').textContent = '0 / 8000';
      var row = Core.makeRow(out, { burn: doBurn, lifetime: lifetime }, me, nowMs());
      return putSecret(row).then(function () {
        applyRec(row);
      });
    }).catch(function (e) {
      $('lockStatus').textContent = (e && e.message) || 'Could not lock.';
      $('lockStatus').className = 'statusline warn';
    }).then(function () { $('lockBtn').disabled = false; $('lockBtn').textContent = 'Lock'; });
  };

  $('plain').oninput = function () {
    $('plainCount').textContent = ($('plain').value || '').length + ' / 8000';
  };
  $('plain').onkeydown = function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.keyCode === 13)) {
      e.preventDefault();
      $('lockBtn').click();
    }
  };

  (function bindLife() {
    var box = $('life');
    box.onclick = function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      var v = t.getAttribute('data-life');
      if (v == null) return;
      lifetime = v;
      var btns = box.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        btns[i].className = btns[i].getAttribute('data-life') === lifetime ? 'on' : '';
      }
    };
  })();

  function toggleEye(input, btn) {
    var hide = input.type === 'text';
    input.type = hide ? 'password' : 'text';
    btn.textContent = hide ? 'Show' : 'Hide';
  }
  $('passEye').onclick = function () { toggleEye($('pass'), $('passEye')); };
  $('openPassEye').onclick = function () { toggleEye($('openPass'), $('openPassEye')); };

  $('openMine').onclick = function () { showOpen(); };
  $('openBtn').onclick = function () { doOpen(); };
  $('openPass').onkeydown = function (e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      $('openBtn').click();
    }
  };
  function setPassVisible(on) {
    $('openPassRow').hidden = !on;
    var lab = document.querySelector('label[for="openPass"]');
    if (lab) lab.hidden = !on;
  }
  function showOpen() {
    if (!rec || Core.status(rec, nowMs()) !== 'locked') return;
    show('open');
    $('openLede').textContent = rec.hasPass ? 'Type the passphrase.' : 'Open the secret on this device.';
    setPassVisible(!!rec.hasPass);
    $('openBtn').textContent = rec.burn ? 'Open and burn' : 'Open';
    $('openStatus').textContent = rec.burn ? 'Opening burns this secret. It will not open again.' : '';
    $('openStatus').className = rec.burn ? 'statusline warn' : 'statusline';
  }
  function doOpen() {
    if (!rec || Core.status(rec, nowMs()) !== 'locked') {
      $('openStatus').textContent = Core.status(rec, nowMs()) === 'expired'
        ? 'This secret expired. It is gone.'
        : (rec && rec.burned ? 'Already burned.' : 'Nothing to open.');
      $('openStatus').className = 'statusline warn';
      if (rec && (rec.burned || Core.status(rec, nowMs()) === 'expired')) applyRec(rec);
      return;
    }
    var pass = String($('openPass').value || '').trim();
    if (rec.hasPass && !pass) {
      $('openStatus').textContent = 'This secret needs a passphrase.';
      $('openStatus').className = 'statusline warn';
      return;
    }
    $('openBtn').disabled = true;
    $('openBtn').textContent = 'Opening…';
    C.unlock(rec, rec.hasPass ? pass : null).then(function (text) {
      $('revText').textContent = text;
      $('revTitle').textContent = rec.burn ? 'Secret · burns after this look' : 'Secret';
      $('revNote').textContent = rec.burn ? 'Burned. It will not open again.' : 'Hide it when you are done.';
      $('revNote').className = rec.burn ? 'statusline warn' : 'statusline';
      revealing = true;
      show('revealed');
      setChip('ready', 'Open');
      if (rec.burn) return burn(true);
    }).catch(function (e) {
      $('openStatus').textContent = (e && e.message) || 'Could not open.';
      $('openStatus').className = 'statusline warn';
    }).then(function () {
      $('openBtn').disabled = false;
      if (rec && rec.burn) $('openBtn').textContent = 'Open and burn';
      else $('openBtn').textContent = 'Open';
    });
  }

  $('burnNow').onclick = function () {
    burn(false).then(function () {
      setChip('dead', 'Burned');
    });
  };
  function goHome() {
    drafting = true;
    revealing = false;
    show('home');
    $('lockStatus').textContent = '';
    $('lockStatus').className = 'statusline';
    setChip('ready', 'Ready');
  }
  $('newSecret').onclick = goHome;
  $('goneLock').onclick = goHome;
  $('hideBtn').onclick = function () {
    revealing = false;
    $('revText').textContent = '';
    $('openPass').value = '';
    applyRec(rec);
  };
  $('copyBtn').onclick = function () {
    var t = $('revText').textContent;
    if (!t) return;
    function ok() {
      $('revNote').textContent = 'Copied on this device.';
      $('revNote').className = 'statusline good';
    }
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = t;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        var done = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        if (done) ok();
        else $('revNote').textContent = 'Select the text and copy it.';
      } catch (e) {
        $('revNote').textContent = 'Select the text and copy it.';
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(ok).catch(fallback);
    } else {
      fallback();
    }
  };

  function findSecret(list) {
    var i, found = null;
    for (i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].id === 'secret') found = list[i];
    }
    return found;
  }

  function bootRoom(list) {
    applyRec(findSecret(list));
  }

  function start() {
    var who = window.gifos && gifos.me ? gifos.me() : Promise.resolve(me);
    var info = window.gifos && gifos.info ? gifos.info() : Promise.resolve({ owner: true });
    Promise.all([who, info]).then(function (pair) {
      var id = pair[0], inf = pair[1];
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      isOwner = !inf || inf.owner !== false;
      $('goneLock').hidden = !isOwner;
      if (roomDb && !subbed) {
        subbed = true;
        roomDb.subscribe(function (list) {
          var found = findSecret(list);
          if (!found && saveDb && isOwner) {
            saveDb.get('last').then(function (row) {
              if (row && row.ct && Core.status(findSecret(list), nowMs()) === 'empty') {
                applyRec(row);
              } else {
                applyRec(found);
              }
            }).catch(function () { applyRec(found); });
            return;
          }
          applyRec(found);
        });
      } else if (saveDb) {
        saveDb.get('last').then(function (row) {
          if (row && row.ct) applyRec(row);
          else applyRec(null);
        }).catch(function () { applyRec(null); });
      } else {
        applyRec(null);
      }
    }).catch(function () { applyRec(null); });
  }

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (!$('revealed').hidden) { $('hideBtn').click(); return true; }
      if (!$('open').hidden && isOwner && rec && Core.status(rec, nowMs()) === 'locked') {
        applyRec(rec);
        return true;
      }
      if (!$('gone').hidden && isOwner) { goHome(); return true; }
      return false;
    });
  }

  setChip('ready', 'Ready');
  start();
})();
