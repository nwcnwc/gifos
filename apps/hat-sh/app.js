/*
 * hat.sh UI. Files stay in this tab: encrypt/decrypt via HatCrypto, download
 * the result as a blob. There is no network path.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var filesEnc = [], filesDec = [];
  var busy = false;

  function fmtBytes(n) {
    if (!n) return '0 B';
    var k = 1024, u = ['B', 'KB', 'MB', 'GB'], i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(k)));
    return (n / Math.pow(k, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
  }

  function setStatus(id, msg, kind) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function strength(pw) {
    if (!pw) return null;
    var score = 0;
    if (pw.length >= 12) score++;
    if (pw.length >= 16) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
    var labels = ['very weak', 'weak', 'moderate', 'good', 'strong'];
    return { score: Math.min(4, score), label: labels[Math.min(4, score)] };
  }

  function renderList(ul, files, onDel) {
    ul.innerHTML = '';
    files.forEach(function (f, i) {
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.textContent = f.name;
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = fmtBytes(f.size);
      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'Remove';
      del.onclick = function () { onDel(i); };
      li.appendChild(name);
      li.appendChild(meta);
      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  function addFiles(into, list) {
    Array.from(list || []).forEach(function (f) {
      if (!into.some(function (x) { return x.name === f.name && x.size === f.size; })) into.push(f);
    });
  }

  function wireDrop(drop, input, into, render) {
    ['dragover', 'dragenter'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files;
      if (f && f.length) { addFiles(into, f); render(); }
    });
    drop.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      if (input.files && input.files.length) { addFiles(into, input.files); render(); }
      input.value = '';
    });
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function addOut(host, blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.textContent = '⬇ ' + name + '  ·  ' + fmtBytes(blob.size);
    host.appendChild(a);
  }

  function showTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('on', t.getAttribute('data-tab') === name);
    });
    ['encrypt', 'decrypt', 'keys'].forEach(function (id) {
      var p = $('panel-' + id);
      if (p) p.hidden = id !== name;
    });
  }

  function methodOf(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : 'password';
  }

  function progressBar(host, done, total) {
    var bar = host.querySelector('.bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'bar';
      bar.innerHTML = '<span></span>';
      host.appendChild(bar);
    }
    var pct = total ? Math.max(2, Math.round(100 * done / total)) : 2;
    bar.firstChild.style.width = pct + '%';
  }

  function toggleMethod() {
    var enc = methodOf('enc-method');
    $('enc-password').hidden = enc !== 'password';
    $('enc-keys').hidden = enc !== 'keys';
    var dec = methodOf('dec-method');
    $('dec-password').hidden = dec !== 'password';
    $('dec-keys').hidden = dec !== 'keys';
  }

  function updatePw() {
    var pw = $('pw-enc').value || '';
    var el = $('pw-strength');
    var s = strength(pw);
    if (!s) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = 'Strength: <b>' + s.label + '</b>' + (pw.length < 12 ? ' — need 12 characters.' : '');
  }

  function canEnc() {
    if (busy || !filesEnc.length) return false;
    if (methodOf('enc-method') === 'password') {
      var a = $('pw-enc').value || '', b = $('pw-enc2').value || '';
      return a.length >= 12 && a === b;
    }
    return !!( $('enc-sk').value && $('enc-pk').value );
  }
  function canDec() {
    if (busy || !filesDec.length) return false;
    if (methodOf('dec-method') === 'password') return !!$('pw-dec').value;
    return !!( $('dec-sk').value && $('dec-pk').value );
  }
  function refreshButtons() {
    $('go-enc').disabled = !canEnc();
    $('go-dec').disabled = !canDec();
  }

  function renderEnc() {
    renderList($('list-enc'), filesEnc, function (i) { filesEnc.splice(i, 1); renderEnc(); });
    refreshButtons();
  }
  function renderDec() {
    renderList($('list-dec'), filesDec, function (i) { filesDec.splice(i, 1); renderDec(); });
    refreshButtons();
  }

  function runQueue(files, each, statusId, outId) {
    var host = $(outId);
    host.innerHTML = '';
    busy = true;
    refreshButtons();
    var i = 0;
    function next() {
      if (i >= files.length) {
        busy = false;
        setStatus(statusId, 'Done — ' + files.length + ' file' + (files.length === 1 ? '' : 's') + ', all on this device.', 'ok');
        refreshButtons();
        return;
      }
      var f = files[i];
      setStatus(statusId, 'Working on “' + f.name + '” (' + (i + 1) + '/' + files.length + ')…');
      progressBar($(statusId), 0, 1);
      each(f, function (done, total, phase) {
        if (phase === 'key') setStatus(statusId, 'Deriving the key for “' + f.name + '”…');
        else {
          setStatus(statusId, '“' + f.name + '”  ' + fmtBytes(done) + ' / ' + fmtBytes(total));
          progressBar($(statusId), done, total);
        }
      }).then(function (out) {
        addOut(host, out.blob, out.name);
        i++;
        next();
      }).catch(function (e) {
        busy = false;
        refreshButtons();
        setStatus(statusId, (e && e.message) || String(e), 'warn');
      });
    }
    next();
  }

  function goEnc() {
    if (!canEnc()) return;
    var method = methodOf('enc-method');
    runQueue(filesEnc.slice(), function (f, onP) {
      if (method === 'password') return window.HatCrypto.encryptPassword(f, $('pw-enc').value, onP);
      return window.HatCrypto.encryptKeys(f, $('enc-sk').value.trim(), $('enc-pk').value.trim(), onP);
    }, 'status-enc', 'out-enc');
  }

  function goDec() {
    if (!canDec()) return;
    var method = methodOf('dec-method');
    runQueue(filesDec.slice(), function (f, onP) {
      return window.HatCrypto.detect(f).then(function (kind) {
        if (kind === 'v1') throw new Error('“' + f.name + '” is hat.sh v1, which this port does not open. Re-encrypt it with current hat.sh first.');
        if (kind === 'plain') throw new Error('“' + f.name + '” does not look like a hat.sh file.');
        if (method === 'password') {
          if (kind !== 'v2_symmetric') throw new Error('“' + f.name + '” was locked with a key pair, not a password.');
          return window.HatCrypto.decryptPassword(f, $('pw-dec').value, onP);
        }
        if (kind !== 'v2_asymmetric') throw new Error('“' + f.name + '” was locked with a password, not a key pair.');
        return window.HatCrypto.decryptKeys(f, $('dec-sk').value.trim(), $('dec-pk').value.trim(), onP);
      });
    }, 'status-dec', 'out-dec');
  }

  function toggleShow(input, btn) {
    var hide = input.type === 'text';
    input.type = hide ? 'password' : 'text';
    btn.textContent = hide ? 'Show' : 'Hide';
  }

  function saveKey(text, name) {
    if (!text) return;
    download(new Blob([text], { type: 'text/plain' }), name);
  }

  function wire() {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { showTab(t.getAttribute('data-tab')); });
    });
    document.querySelectorAll('input[name="enc-method"], input[name="dec-method"]').forEach(function (r) {
      r.addEventListener('change', function () { toggleMethod(); refreshButtons(); });
    });
    wireDrop($('drop-enc'), $('file-enc'), filesEnc, renderEnc);
    wireDrop($('drop-dec'), $('file-dec'), filesDec, renderDec);

    ['pw-enc', 'pw-enc2', 'enc-sk', 'enc-pk', 'pw-dec', 'dec-sk', 'dec-pk'].forEach(function (id) {
      $(id).addEventListener('input', refreshButtons);
    });
    $('pw-enc').addEventListener('input', updatePw);

    $('pw-enc-show').onclick = function () { toggleShow($('pw-enc'), this); };
    $('pw-dec-show').onclick = function () { toggleShow($('pw-dec'), this); };
    $('gen-sk-show').onclick = function () { toggleShow($('gen-sk'), this); };

    $('pw-gen').onclick = function () {
      window.HatCrypto.generatePassword().then(function (pw) {
        $('pw-enc').value = pw;
        $('pw-enc2').value = pw;
        $('pw-enc').type = 'text';
        $('pw-enc-show').textContent = 'Hide';
        updatePw();
        refreshButtons();
      });
    };

    $('go-enc').onclick = goEnc;
    $('go-dec').onclick = goDec;

    $('go-keys').onclick = function () {
      setStatus('status-keys', 'Generating…');
      window.HatCrypto.generateKeyPair().then(function (kp) {
        $('gen-pk').value = kp.publicKey;
        $('gen-sk').value = kp.privateKey;
        $('dl-pk').disabled = false;
        $('dl-sk').disabled = false;
        setStatus('status-keys', 'A new pair. Save the private key somewhere you will not lose it.', 'ok');
      }).catch(function (e) { setStatus('status-keys', (e && e.message) || String(e), 'warn'); });
    };
    $('dl-pk').onclick = function () { saveKey($('gen-pk').value, 'key.public'); };
    $('dl-sk').onclick = function () { saveKey($('gen-sk').value, 'key.private'); };

    $('go-derive').onclick = function () {
      var sk = $('derive-sk').value.trim();
      if (!sk) return;
      window.HatCrypto.publicFromPrivate(sk).then(function (pk) {
        $('derive-pk').value = pk;
        setStatus('status-keys', 'Public key recovered from that private key.', 'ok');
      }).catch(function (e) { setStatus('status-keys', (e && e.message) || String(e), 'warn'); });
    };

    setStatus('status-enc', 'Loading libsodium…');
    window.HatCrypto.ready().then(function () {
      setStatus('status-enc', 'Ready — files stay on this device.');
    }).catch(function (e) {
      setStatus('status-enc', 'libsodium failed to start: ' + ((e && e.message) || e), 'warn');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
