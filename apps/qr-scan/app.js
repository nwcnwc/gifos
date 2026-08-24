/* QR Scan: still photo or drop, jsQR decode, private history.
 * Never opens a live camera stream. Nothing is fetched. */
(function (root) {
  'use strict';

  var DEL_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  var $ = function (id) {
    return root.document ? root.document.getElementById(id) : null;
  };
  var histDb = null;
  var lastText = '';
  try { if (root.gifos && root.gifos.db) histDb = root.gifos.db('history'); } catch (e) {}

  function say(msg, isErr) {
    var el = $('status');
    el.textContent = msg || '';
    el.classList.toggle('err', !!isErr);
  }

  function imageFromBytes(bytes, mime) {
    return new Promise(function (resolve, reject) {
      var blob = new Blob([bytes], { type: mime || 'image/jpeg' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read that picture'));
      };
      img.src = url;
    });
  }

  function decodeImage(img) {
    var canvas = $('preview');
    var max = 640;
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('Empty picture');
    var scale = Math.min(1, max / Math.max(w, h));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    var pix = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (typeof jsQR !== 'function') throw new Error('Decoder missing');
    return jsQR(pix.data, pix.width, pix.height, { inversionAttempts: 'attemptBoth' });
  }

  function drawLocation(code) {
    if (!code || !code.location) return;
    var canvas = $('preview');
    var ctx = canvas.getContext('2d');
    var loc = code.location;
    ctx.strokeStyle = '#40b48c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
    ctx.lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
    ctx.lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
    ctx.lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
    ctx.closePath();
    ctx.stroke();
  }

  function showText(text) {
    lastText = text || '';
    $('out').textContent = lastText;
    $('copyBtn').hidden = !lastText;
  }

  function remember(text, source) {
    if (!histDb || !text) return;
    histDb.put({
      text: text,
      source: source || 'photo',
      at: Date.now()
    }).catch(function () {});
  }

  function whenOf(ms) {
    try {
      return new Date(ms).toLocaleString();
    } catch (e) {
      return '';
    }
  }

  function renderHist(rows) {
    var ul = $('hist');
    ul.innerHTML = '';
    var list = (rows || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    $('histEmpty').hidden = list.length > 0;
    $('clearBtn').hidden = list.length === 0;
    list.forEach(function (r) {
      if (!r || !r.id) return;
      var li = document.createElement('li');
      var wrap = document.createElement('div');
      wrap.className = 'txt';
      wrap.textContent = r.text || '';
      var when = document.createElement('span');
      when.className = 'when';
      when.textContent = whenOf(r.at) + (r.source ? ' · ' + r.source : '');
      wrap.appendChild(when);
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'row-del';
      del.title = 'Remove';
      del.innerHTML = DEL_ICON;
      del.addEventListener('click', function () {
        if (histDb) histDb.delete(r.id).catch(function () {});
      });
      li.appendChild(wrap);
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  function handleCode(code, source) {
    if (!code || !code.data) {
      showText('');
      say('No code in that picture. Try a tighter crop or more light.', true);
      return;
    }
    showText(code.data);
    drawLocation(code);
    remember(code.data, source);
    say('Read ' + code.data.length + ' characters.');
  }

  function runBytes(bytes, mime, source) {
    say('Reading…');
    return imageFromBytes(bytes, mime).then(function (img) {
      var code = decodeImage(img);
      handleCode(code, source);
    }).catch(function (e) {
      say(String(e && e.message || e), true);
    });
  }

  function takePhoto() {
    if (!root.gifos || !root.gifos.takePhoto) {
      say('Photo capture is not available. Drop a picture instead.', true);
      return;
    }
    say('Opening camera…');
    root.gifos.takePhoto({ facing: 'environment' }).then(function (shot) {
      if (!shot || !shot.bytes) {
        say('Capture cancelled.');
        return;
      }
      return runBytes(shot.bytes, shot.mime || 'image/jpeg', 'photo');
    }).catch(function (e) {
      var m = String(e && e.message || e);
      if (/cancel/i.test(m)) say('Capture cancelled.');
      else say(m, true);
    });
  }

  function fileToBytes(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Could not read that file')); };
      r.readAsArrayBuffer(file);
    });
  }

  function onFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || '') && !/\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name || '')) {
      say('Drop a picture (JPEG or PNG).', true);
      return;
    }
    fileToBytes(file).then(function (buf) {
      return runBytes(buf, file.type || 'image/jpeg', 'file');
    }).catch(function (e) {
      say(String(e && e.message || e), true);
    });
  }

  function boot() {
    $('photoBtn').addEventListener('click', takePhoto);
    $('fileBtn').addEventListener('click', function () { $('file').click(); });
    $('file').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      onFile(f);
      ev.target.value = '';
    });
    $('copyBtn').addEventListener('click', function () {
      if (!lastText || !navigator.clipboard) return;
      navigator.clipboard.writeText(lastText).then(function () {
        say('Copied.');
      }).catch(function () { say('Could not copy.', true); });
    });
    $('clearBtn').addEventListener('click', function () {
      if (!histDb) return;
      histDb.getAll().then(function (rows) {
        (rows || []).forEach(function (r) {
          if (r && r.id) histDb.delete(r.id).catch(function () {});
        });
      }).catch(function () {});
    });

    var drag = 0;
    root.addEventListener('dragenter', function (e) {
      e.preventDefault();
      drag++;
      document.body.classList.add('drag');
    });
    root.addEventListener('dragover', function (e) { e.preventDefault(); });
    root.addEventListener('dragleave', function (e) {
      e.preventDefault();
      if (--drag <= 0) { drag = 0; document.body.classList.remove('drag'); }
    });
    root.addEventListener('drop', function (e) {
      e.preventDefault();
      drag = 0;
      document.body.classList.remove('drag');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      onFile(f);
    });

    if (histDb) histDb.subscribe(renderHist);
    else renderHist([]);
  }

  root.QrScanApp = { decodeImage: decodeImage };

  if ($('photoBtn')) boot();
})(window);
