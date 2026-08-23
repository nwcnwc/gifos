/* WiFi Card: type name + password, draw the WIFI: payload, print or show.
 * Last card is private. Meeting share is optional (mp.js). Nothing is fetched. */
(function (root) {
  'use strict';

  var $ = function (id) {
    return root.document ? root.document.getElementById(id) : null;
  };
  var saveDb = null;
  var saveTimer = 0;
  var applying = false;
  var firstLoad = true;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var settings = {
    ssid: '',
    password: '',
    encryptionMode: 'WPA',
    eapMethod: 'PWD',
    eapIdentity: '',
    hidePassword: false,
    hiddenSSID: false,
    portrait: false,
    additionalCards: 1,
    hideTip: false
  };

  function escapeWifi(v) {
    v = String(v == null ? '' : v);
    var out = '';
    for (var i = 0; i < v.length; i++) {
      var c = v.charAt(i);
      out += ('";,:\\'.indexOf(c) >= 0) ? ('\\' + c) : c;
    }
    return out;
  }

  function payload(s) {
    s = s || settings;
    var opts = {};
    opts.T = s.encryptionMode || 'nopass';
    if (s.encryptionMode === 'WPA2-EAP') {
      opts.E = s.eapMethod || 'PWD';
      opts.I = s.eapIdentity || '';
    }
    opts.S = escapeWifi(s.ssid);
    opts.P = escapeWifi(s.password);
    opts.H = !!s.hiddenSSID;
    var data = '';
    Object.keys(opts).forEach(function (k) { data += k + ':' + opts[k] + ';'; });
    return 'WIFI:' + data + ';';
  }

  function drawQR(canvas, text) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var size = canvas.width;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    if (!text || typeof qrcode !== 'function') return;
    if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
      qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    }
    var qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount();
    var quiet = 4;
    var dim = n + quiet * 2;
    var cell = size / dim;
    ctx.fillStyle = '#000';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell + 0.35, cell + 0.35);
        }
      }
    }
  }

  function persist(immediate) {
    if (applying || !saveDb) return;
    if (root.WifiMp && root.WifiMp.guest) return;
    if (saveTimer) clearTimeout(saveTimer);
    var write = function () {
      saveTimer = 0;
      saveDb.put({
        id: 'last',
        ssid: settings.ssid,
        password: settings.password,
        encryptionMode: settings.encryptionMode,
        eapMethod: settings.eapMethod,
        eapIdentity: settings.eapIdentity,
        hidePassword: settings.hidePassword,
        hiddenSSID: settings.hiddenSSID,
        portrait: settings.portrait,
        additionalCards: settings.additionalCards,
        hideTip: settings.hideTip
      }).catch(function () {});
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 250);
  }

  function readUi() {
    settings.ssid = $('ssid').value;
    settings.password = $('password').value;
    settings.eapIdentity = $('identity').value;
    settings.hidePassword = $('hidePassword').checked;
    settings.hiddenSSID = $('hiddenSSID').checked;
    settings.portrait = $('portrait').checked;
    settings.hideTip = $('hideTip').checked;
    var n = parseInt($('copies').value, 10);
    if (n >= 1 && n <= 10) settings.additionalCards = n;
    var enc = document.querySelector('input[name=enc]:checked');
    settings.encryptionMode = enc ? enc.value : 'WPA';
    settings.eapMethod = 'PWD';
  }

  function writeUi() {
    applying = true;
    $('ssid').value = settings.ssid;
    $('password').value = settings.password;
    $('identity').value = settings.eapIdentity;
    $('eapMethod').value = settings.eapMethod || 'PWD';
    $('hidePassword').checked = settings.hidePassword;
    $('hiddenSSID').checked = settings.hiddenSSID;
    $('portrait').checked = settings.portrait;
    $('hideTip').checked = settings.hideTip;
    $('copies').value = settings.additionalCards;
    var radios = document.querySelectorAll('input[name=enc]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].checked = radios[i].value === settings.encryptionMode;
    }
    applying = false;
  }

  function applyRemote(card) {
    if (!card) return;
    applying = true;
    settings.ssid = card.ssid || '';
    settings.password = card.password || '';
    settings.encryptionMode = card.encryptionMode || 'WPA';
    settings.eapMethod = card.eapMethod || 'PWD';
    settings.eapIdentity = card.eapIdentity || '';
    settings.hidePassword = !!card.hidePassword;
    settings.hiddenSSID = !!card.hiddenSSID;
    settings.portrait = !!card.portrait;
    settings.hideTip = !!card.hideTip;
    writeUi();
    applying = false;
    paint();
  }

  function validate() {
    if (!settings.ssid.length) return 'Network name cannot be empty';
    if (settings.encryptionMode === 'WPA' && settings.password.length < 8) {
      return 'Password must be at least 8 characters, or change the encryption to "None"';
    }
    if (settings.encryptionMode === 'WEP' && settings.password.length < 5) {
      return 'Password must be at least 5 characters, or change the encryption to "None"';
    }
    if (settings.encryptionMode === 'WPA2-EAP' && settings.password.length < 1) {
      return 'Password cannot be empty';
    }
    if (settings.encryptionMode === 'WPA2-EAP' && settings.eapIdentity.length < 1) {
      return 'Identity cannot be empty';
    }
    return '';
  }

  function paint() {
    var hidePw = settings.hidePassword || !settings.encryptionMode;
    var eap = settings.encryptionMode === 'WPA2-EAP';
    $('passwordLabel').hidden = hidePw;
    $('eapMethodLabel').hidden = !eap;
    $('identityLabel').hidden = !eap;
    $('tip').hidden = settings.hideTip;
    $('card').classList.toggle('portrait', settings.portrait);
    var e = validate();
    var err = $('err');
    if (e && settings.ssid) {
      err.hidden = false;
      err.textContent = e;
    } else {
      err.hidden = true;
      err.textContent = '';
    }
    drawQR($('qr'), payload());
  }

  function onChange() {
    if (applying) return;
    if (root.WifiMp && root.WifiMp.guest) return;
    readUi();
    paint();
    persist();
    if (root.WifiMp) root.WifiMp.publish();
  }

  function printCard() {
    var e = validate();
    if (e) {
      $('err').hidden = false;
      $('err').textContent = e;
      return;
    }
    document.title = 'WiFi Card - ' + settings.ssid;
    var n = settings.additionalCards || 1;
    var area = $('print-area');
    area.innerHTML = '';
    area.hidden = false;
    var tip = settings.hideTip ? '' : '<p class="tip">Point your phone\'s camera at the QR Code to connect automatically</p>';
    var hidePw = settings.hidePassword || !settings.encryptionMode;
    var eap = settings.encryptionMode === 'WPA2-EAP';
    var fields = '<label>Network name<div class="value"></div></label>';
    if (eap) {
      fields += '<label>EAP method<div class="value">PWD</div></label>';
      fields += '<label>Identity<div class="value"></div></label>';
    }
    if (!hidePw) fields += '<label>Password<div class="value"></div></label>';
    for (var i = 0; i < n; i++) {
      var el = document.createElement('article');
      el.className = 'card-print' + (settings.portrait ? ' portrait' : '');
      el.innerHTML =
        '<div class="card-head"><h2>WiFi Login</h2></div>' +
        '<div class="details"><canvas width="180" height="180"></canvas><div class="fields">' + fields + '</div></div>' +
        tip;
      var vals = el.querySelectorAll('.value');
      var vi = 0;
      vals[vi++].textContent = settings.ssid;
      if (eap) { vi++; vals[vi++].textContent = settings.eapIdentity; }
      if (!hidePw) vals[vi].textContent = settings.password;
      area.appendChild(el);
      drawQR(el.querySelector('canvas'), payload());
    }
    root.print();
  }

  function loadSave() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (!r || r.id !== 'last') return;
        settings.ssid = r.ssid || '';
        settings.password = r.password || '';
        settings.encryptionMode = r.encryptionMode || 'WPA';
        settings.eapMethod = r.eapMethod || 'PWD';
        settings.eapIdentity = r.eapIdentity || '';
        settings.hidePassword = !!r.hidePassword;
        settings.hiddenSSID = !!r.hiddenSSID;
        settings.portrait = !!r.portrait;
        settings.additionalCards = r.additionalCards >= 1 ? r.additionalCards : 1;
        settings.hideTip = !!r.hideTip;
      });
    }).catch(function () {});
  }

  function boot() {
    if (firstLoad && root.innerWidth < 500) settings.portrait = true;
    firstLoad = false;
    writeUi();
    paint();

    ['ssid', 'password', 'identity', 'copies'].forEach(function (id) {
      $(id).addEventListener('input', onChange);
    });
    ['hidePassword', 'hiddenSSID', 'portrait', 'hideTip'].forEach(function (id) {
      $(id).addEventListener('change', onChange);
    });
    var radios = document.querySelectorAll('input[name=enc]');
    for (var i = 0; i < radios.length; i++) radios[i].addEventListener('change', onChange);
    $('printBtn').addEventListener('click', printCard);

    var Mp = root.WifiMp;
    if (Mp) {
      Mp.getCard = function () { return settings; };
      Mp.onRemote = applyRemote;
      Mp.onHost = function () {};
      Mp.onStatus = function (text, isGuest) {
        var el = $('meet');
        el.textContent = text;
        el.classList.toggle('live', !!isGuest || /meeting/.test(text));
      };
      Mp.watch();
    } else if ($('meet')) {
      $('meet').textContent = 'Press Invite (top bar) to show this card in a meeting. Nothing is uploaded on its own.';
    }
  }

  root.WifiCard = {
    payload: payload,
    escapeWifi: escapeWifi,
    settings: function () { return settings; }
  };

  if ($('ssid')) {
    loadSave().then(boot);
    root.addEventListener('pagehide', function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
      persist(true);
    });
  }
})(window);
