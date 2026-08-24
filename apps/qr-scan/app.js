/* QR Scan: still photo or file, jsQR decode, private history.
 * Never opens a live camera stream. Nothing is fetched. */
(function (root) {
  'use strict';

  var DEL_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  function unescapeWifi(v) {
    return String(v == null ? '' : v).replace(/\\([\\;,:"])/g, '$1');
  }

  function classify(text) {
    text = String(text || '');
    if (!text) return { kind: 'empty', label: '', hint: '' };
    if (/^WIFI:/i.test(text)) {
      var ssid = unescapeWifi((text.match(/S:((?:[^\\;]|\\.)*)/i) || [])[1] || '');
      var pass = unescapeWifi((text.match(/P:((?:[^\\;]|\\.)*)/i) || [])[1] || '');
      return {
        kind: 'wifi',
        label: 'Wi-Fi',
        hint: ssid ? ('Network ' + ssid) : 'A Wi-Fi login',
        ssid: ssid,
        password: pass
      };
    }
    if (/^BEGIN:VCARD/i.test(text)) {
      var fn = ((text.match(/^FN[:;]([^\r\n]+)/im) || [])[1] || '').trim();
      return { kind: 'contact', label: 'Contact', hint: fn || 'A contact card', fn: fn };
    }
    if (/^tel:/i.test(text)) {
      return { kind: 'phone', label: 'Phone', hint: text.slice(4) };
    }
    if (/^SMSTO:/i.test(text)) {
      var rest = text.slice(6);
      var cut = rest.indexOf(':');
      var num = cut < 0 ? rest : rest.slice(0, cut);
      return { kind: 'sms', label: 'SMS', hint: num || 'A text message' };
    }
    if (/^sms:/i.test(text)) return { kind: 'sms', label: 'SMS', hint: 'A text message' };
    if (/^mailto:/i.test(text)) {
      return { kind: 'email', label: 'Email', hint: text.slice(7).split('?')[0] };
    }
    if (/^geo:/i.test(text)) return { kind: 'geo', label: 'Place', hint: 'A map point' };
    if (/^https?:\/\//i.test(text) || /^www\./i.test(text)) {
      return { kind: 'url', label: 'Link', hint: 'A web address. Copy it, then paste it in a browser.' };
    }
    return { kind: 'text', label: 'Text', hint: '' };
  }

  function decodePixels(data, width, height) {
    if (typeof jsQR !== 'function') throw new Error('Decoder missing');
    if (!data || !width || !height) return null;
    return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' });
  }

  function uniqueNums(list) {
    var seen = {}, out = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (n == null || seen[n]) continue;
      seen[n] = 1;
      out.push(n);
    }
    return out;
  }

  var $ = function (id) {
    return root.document ? root.document.getElementById(id) : null;
  };
  var histDb = null;
  var lastText = '';
  var hasShot = false;
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
        reject(new Error('Could not read that picture. Try a JPEG or a PNG.'));
      };
      img.src = url;
    });
  }

  function rasterAt(img, maxSide) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var scale;
    if (!maxSide) scale = 1;
    else if (maxSide < Math.max(w, h)) scale = maxSide / Math.max(w, h);
    else scale = Math.min(3, maxSide / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * scale));
    var ch = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.drawImage(img, 0, 0, cw, ch);
    return { canvas: canvas, ctx: ctx, pix: ctx.getImageData(0, 0, cw, ch) };
  }

  function showPreview(srcCanvas) {
    var canvas = $('preview');
    var wrap = $('previewWrap');
    canvas.width = srcCanvas.width;
    canvas.height = srcCanvas.height;
    canvas.getContext('2d').drawImage(srcCanvas, 0, 0);
    canvas.hidden = false;
    $('emptyShot').hidden = true;
    wrap.classList.remove('is-empty');
    hasShot = true;
    $('clearShotBtn').hidden = false;
  }

  function drawLocation(code) {
    if (!code || !code.location) return;
    var canvas = $('preview');
    var ctx = canvas.getContext('2d');
    var loc = code.location;
    ctx.strokeStyle = '#40b48c';
    ctx.lineWidth = Math.max(3, Math.round(Math.min(canvas.width, canvas.height) / 80));
    ctx.beginPath();
    ctx.moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
    ctx.lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
    ctx.lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
    ctx.lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
    ctx.closePath();
    ctx.stroke();
  }

  function decodeImage(img) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('That picture is empty.');
    if (typeof jsQR !== 'function') throw new Error('Decoder missing');
    var maxSide = Math.max(w, h);
    var tries = [];
    if (maxSide > 1600) tries.push(1600);
    if (maxSide > 1024) tries.push(1024);
    tries.push(Math.min(maxSide, 800));
    if (maxSide < 280) tries.push(Math.max(320, maxSide * 2));
    tries = uniqueNums(tries);
    var last = null;
    var found = null;
    for (var i = 0; i < tries.length; i++) {
      last = rasterAt(img, tries[i]);
      var code = decodePixels(last.pix.data, last.pix.width, last.pix.height);
      if (code && code.data) { found = { code: code, raster: last }; break; }
    }
    if (!last) last = rasterAt(img, Math.min(maxSide, 800));
    if (found) {
      showPreview(found.raster.canvas);
      drawLocation(found.code);
      return found.code;
    }
    showPreview(last.canvas);
    return null;
  }

  function showText(text) {
    lastText = text || '';
    var info = classify(lastText);
    var out = $('out');
    var chip = $('kindChip');
    var hint = $('kindHint');
    if (!lastText) {
      out.textContent = 'The words will show up here.';
      out.classList.add('is-empty');
      chip.hidden = true;
      hint.hidden = true;
      $('copyBtn').hidden = true;
      return;
    }
    out.classList.remove('is-empty');
    out.textContent = lastText;
    if (info.kind === 'wifi' && info.ssid) {
      out.textContent = lastText + '\n\nNetwork: ' + info.ssid +
        (info.password ? ('\nPassword: ' + info.password) : '');
    }
    if (info.label && info.kind !== 'text') {
      chip.hidden = false;
      chip.textContent = info.label;
    } else {
      chip.hidden = true;
    }
    if (info.hint && info.kind !== 'text') {
      hint.hidden = false;
      hint.textContent = info.hint;
    } else {
      hint.hidden = true;
    }
    $('copyBtn').hidden = false;
  }

  function remember(text, source) {
    if (!histDb || !text) return;
    var info = classify(text);
    histDb.put({
      text: text,
      source: source || 'photo',
      kind: info.kind,
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
      var wrap = document.createElement('button');
      wrap.type = 'button';
      wrap.className = 'txt';
      wrap.appendChild(document.createTextNode(r.text || ''));
      var when = document.createElement('span');
      when.className = 'when';
      var info = classify(r.text || '');
      var tag = info.kind && info.kind !== 'text' ? info.label + ' · ' : '';
      when.textContent = tag + whenOf(r.at) + (r.source ? ' · ' + r.source : '');
      wrap.appendChild(when);
      wrap.addEventListener('click', function () {
        showText(r.text || '');
        say('Restored from history.');
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'row-del';
      del.title = 'Remove';
      del.innerHTML = DEL_ICON;
      del.addEventListener('click', function (ev) {
        ev.stopPropagation();
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
      say('No QR code in that picture. Try a tighter crop, more light, or a flatter angle.', true);
      return;
    }
    showText(code.data);
    remember(code.data, source);
    say('Read ' + code.data.length + ' characters.');
  }

  function runBytes(bytes, mime, source) {
    say('Reading…');
    return imageFromBytes(bytes, mime).then(function (img) {
      var code = decodeImage(img);
      handleCode(code, source);
    }).catch(function (e) {
      say(String(e && e.message || e || 'Could not read that picture. Try a JPEG or a PNG.'), true);
    });
  }

  function clearShot() {
    hasShot = false;
    lastText = '';
    var canvas = $('preview');
    canvas.hidden = true;
    canvas.width = 320;
    canvas.height = 240;
    $('emptyShot').hidden = false;
    $('previewWrap').classList.add('is-empty');
    $('clearShotBtn').hidden = true;
    showText('');
    say('');
  }

  function takePhoto() {
    if (!root.gifos || !root.gifos.takePhoto) {
      say('Photo capture is not available. Choose a picture instead.', true);
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
      say('That is not a picture. Choose a JPEG or a PNG.', true);
      return;
    }
    fileToBytes(file).then(function (buf) {
      return runBytes(buf, file.type || 'image/jpeg', 'file');
    }).catch(function (e) {
      say(String(e && e.message || e), true);
    });
  }

  function copyText() {
    if (!lastText) return;
    var ok = function () { say('Copied.'); };
    var fail = function () { say('Could not copy.', true); };
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(lastText).then(ok).catch(fail);
      return;
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = lastText;
      document.body.appendChild(ta);
      ta.select();
      var worked = document.execCommand('copy');
      document.body.removeChild(ta);
      if (worked) ok(); else fail();
    } catch (e) { fail(); }
  }

  function boot() {
    showText('');
    $('photoBtn').addEventListener('click', takePhoto);
    $('fileBtn').addEventListener('click', function () { $('file').click(); });
    $('file').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      onFile(f);
      ev.target.value = '';
    });
    $('copyBtn').addEventListener('click', copyText);
    $('clearShotBtn').addEventListener('click', clearShot);
    $('clearBtn').addEventListener('click', function () {
      if (!histDb) return;
      histDb.getAll().then(function (rows) {
        (rows || []).forEach(function (r) {
          if (r && r.id) histDb.delete(r.id).catch(function () {});
        });
      }).catch(function () {});
    });

    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (hasShot) { clearShot(); return; }
      });
    }

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

  root.QrScanApp = {
    classify: classify,
    decodePixels: decodePixels,
    decodeImage: decodeImage
  };

  if ($('photoBtn')) boot();
})(window);
