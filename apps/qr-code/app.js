/* QR Code: type text, draw a code, print or download.
 * Last payload is private. Meeting share is optional (mp.js). Nothing is fetched. */
(function (root) {
  'use strict';

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
    ecc: 'M',
    size: 224,
    dark: '#000000',
    light: '#ffffff'
  };

  function eccOf(name) {
    var C = root.QRCode && root.QRCode.CorrectLevel;
    if (!C) return 0;
    return C[name] != null ? C[name] : C.M;
  }

  function persist(immediate) {
    if (applying || !saveDb) return;
    if (root.QrMp && root.QrMp.guest) return;
    if (saveTimer) clearTimeout(saveTimer);
    var write = function () {
      saveTimer = 0;
      saveDb.put({
        id: 'last',
        payload: settings.payload,
        ecc: settings.ecc,
        size: settings.size,
        dark: settings.dark,
        light: settings.light
      }).catch(function () {});
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 250);
  }

  function readUi() {
    settings.payload = $('payload').value;
    settings.size = parseInt($('size').value, 10) || 224;
    settings.dark = $('dark').value || '#000000';
    settings.light = $('light').value || '#ffffff';
    var ecc = document.querySelector('input[name=ecc]:checked');
    settings.ecc = ecc ? ecc.value : 'M';
  }

  function writeUi() {
    applying = true;
    $('payload').value = settings.payload;
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

  function applyRemote(row) {
    if (!row) return;
    applying = true;
    settings.payload = row.payload || '';
    settings.ecc = row.ecc || 'M';
    settings.size = row.size || 224;
    settings.dark = row.dark || '#000000';
    settings.light = row.light || '#ffffff';
    writeUi();
    applying = false;
    paint();
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
      return String(e && e.message || e || 'Could not draw that text');
    }
  }

  function paint() {
    $('sizeVal').textContent = String(settings.size);
    $('qr').style.width = settings.size + 'px';
    $('qr').style.height = settings.size + 'px';
    var err = $('err');
    var empty = $('empty');
    if (!settings.payload) {
      $('qr').innerHTML = '';
      qr = null;
      err.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    var r = drawQR();
    if (r === true) {
      err.hidden = true;
      err.textContent = '';
    } else {
      err.hidden = false;
      err.textContent = r || 'Could not draw that text. Try a shorter string or a lower correction level.';
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
    cap.textContent = settings.payload;
    el.appendChild(cap);
    area.appendChild(el);
    root.print();
  }

  function loadSave() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (!r || r.id !== 'last') return;
        settings.payload = r.payload || '';
        settings.ecc = r.ecc || 'M';
        settings.size = r.size >= 128 ? r.size : 224;
        settings.dark = r.dark || '#000000';
        settings.light = r.light || '#ffffff';
      });
    }).catch(function () {});
  }

  function boot() {
    writeUi();
    paint();
    $('payload').addEventListener('input', onChange);
    $('size').addEventListener('input', onChange);
    $('dark').addEventListener('input', onChange);
    $('light').addEventListener('input', onChange);
    var radios = document.querySelectorAll('input[name=ecc]');
    for (var i = 0; i < radios.length; i++) radios[i].addEventListener('change', onChange);
    $('pngBtn').addEventListener('click', downloadPng);
    $('printBtn').addEventListener('click', printCard);

    var Mp = root.QrMp;
    if (Mp) {
      Mp.getState = function () { return settings; };
      Mp.onRemote = applyRemote;
      Mp.onHost = function () {};
      Mp.onStatus = function (text, isGuest) {
        var el = $('meet');
        el.textContent = text;
        el.classList.toggle('live', !!isGuest || /meeting/.test(text));
      };
      Mp.watch();
    } else if ($('meet')) {
      $('meet').textContent = 'Press Invite (top bar) to show this code in a meeting. Nothing is uploaded on its own.';
    }
  }

  root.QrCodeApp = {
    settings: function () { return settings; },
    eccOf: eccOf
  };

  if ($('payload')) {
    loadSave().then(boot);
    root.addEventListener('pagehide', function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
      persist(true);
    });
  }
})(window);
