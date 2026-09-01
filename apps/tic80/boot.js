/*
 * TIC-80 — GifOS shell.
 *
 * Tap to start (unlocks audio), load the wasm from the GIF, wrap IDBFS so
 * the disk is gifos.db, run HELLO WORLD. Invite is OS chrome — this file
 * never draws it.
 */
(function (root) {
  'use strict';

  var api = root.gifos || null;
  var started = false;
  var current = 'hello';
  var me = { id: null, name: '' };
  var owner = true;

  var $ = function (id) { return document.getElementById(id); };
  var statusEl = $('status');
  var nameEl = $('cart-name');
  var whoEl = $('who');
  var startEl = $('start');
  var libEl = $('library');
  var fileEl = $('file');

  function say(s) {
    if (!statusEl) return;
    statusEl.hidden = !s;
    statusEl.textContent = s || '';
  }

  function escape(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function setName(n) {
    current = n || current;
    if (nameEl) nameEl.textContent = current;
  }

  var inRun = false;
  var typeBusy = false;
  var typeQ = [];

  function fireKey(spec, down) {
    var type = down ? 'keydown' : 'keyup';
    var ev = new KeyboardEvent(type, {
      key: spec.key, code: spec.code, keyCode: spec.keyCode, which: spec.keyCode,
      shiftKey: !!spec.shift, bubbles: true, cancelable: true
    });
    try { Object.defineProperty(ev, 'keyCode', { get: function () { return spec.keyCode; } }); } catch (e) {}
    var canvas = $('canvas');
    if (canvas) canvas.dispatchEvent(ev);
    window.dispatchEvent(ev);
    if (down && spec.ch) {
      var press = new KeyboardEvent('keypress', {
        key: spec.ch, charCode: spec.ch.charCodeAt(0), keyCode: spec.ch.charCodeAt(0),
        bubbles: true, cancelable: true
      });
      if (canvas) canvas.dispatchEvent(press);
      window.dispatchEvent(press);
    }
  }

  function keySpec(name) {
    var map = {
      Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
      Enter: { key: 'Enter', code: 'Enter', keyCode: 13 },
      ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
      ' ': { key: ' ', code: 'Space', keyCode: 32, ch: ' ' }
    };
    if (map[name]) return map[name];
    if (name === '&') return { key: '&', code: 'Digit7', keyCode: 55, shift: true, ch: '&' };
    var ch = String(name);
    var up = ch.toUpperCase();
    var code = (ch >= 'a' && ch <= 'z') ? ('Key' + up) : ('Digit' + ch);
    return { key: ch, code: code, keyCode: up.charCodeAt(0), ch: ch };
  }

  function pumpType() {
    if (typeBusy || !typeQ.length) return;
    typeBusy = true;
    var spec = typeQ.shift();
    if (spec.wait) {
      setTimeout(function () { typeBusy = false; pumpType(); }, spec.wait);
      return;
    }
    fireKey(spec, true);
    setTimeout(function () {
      fireKey(spec, false);
      setTimeout(function () { typeBusy = false; pumpType(); }, spec.gap || 50);
    }, spec.hold || 50);
  }

  function typeLine(line) {
    var i, ch;
    for (i = 0; i < line.length; i++) {
      ch = line.charAt(i);
      typeQ.push(keySpec(ch));
    }
    typeQ.push(keySpec('Enter'));
    pumpType();
  }

  function engineLoad(name) {
    var stem = String(name || '').replace(/\.[^.]+$/, '').replace(/^.*[/\\]/, '');
    if (!stem) return;
    setName(stem);
    if (root.TicNet) root.TicNet.publishSession(stem);
    if (!started) return;
    if (inRun) {
      typeQ.push(keySpec('Escape'));
      typeQ.push({ wait: 220 });
      typeQ.push(keySpec('ArrowDown'));
      typeQ.push(keySpec('ArrowDown'));
      typeQ.push(keySpec('Enter'));
      typeQ.push({ wait: 220 });
      inRun = false;
    }
    typeLine('load ' + stem + ' & run');
    inRun = true;
  }

  function cmdLoad(name) {
    engineLoad(name);
  }

  function paintLib() {
    var samples = root.TIC_CARTS || [];
    var sampEl = $('lib-samples');
    var userEl = $('lib-user');
    var i, c, html;
    if (sampEl) {
      html = '';
      for (i = 0; i < samples.length; i++) {
        c = samples[i];
        html += '<button type="button" class="cart" data-sample="' + escape(c.id) + '">' +
          '<span class="n">' + escape(c.name) + '</span>' +
          '<span class="m">' + escape(c.blurb) + '</span></button>';
      }
      sampEl.innerHTML = html;
    }
    if (userEl && root.TicFS) {
      var list = root.TicFS.listCarts();
      var skip = {};
      for (i = 0; i < samples.length; i++) skip[samples[i].file] = 1;
      html = '';
      for (i = 0; i < list.length; i++) {
        if (skip[list[i].name]) continue;
        html += '<button type="button" class="cart" data-user="' + escape(list[i].name) + '">' +
          '<span class="n">' + escape(list[i].name) + '</span></button>';
      }
      userEl.innerHTML = html || '<p class="lib-lead">None yet — save from the console, or drop a file.</p>';
    }
  }

  function openLib() {
    paintLib();
    if (libEl) libEl.hidden = false;
  }
  function closeLib() {
    if (libEl) libEl.hidden = true;
  }

  function loadSample(id) {
    var carts = root.TIC_CARTS || [];
    var i, c;
    for (i = 0; i < carts.length; i++) if (carts[i].id === id) c = carts[i];
    if (!c) return;
    if (root.TicFS) root.TicFS.putCart(c.file, c.bytes);
    setName(c.id);
    closeLib();
    if (!started) start(c.id);
    else engineLoad(c.id);
  }

  function ingestFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var u = new Uint8Array(reader.result);
      var name = file.name || 'drop.tic';
      if (root.TicFS) root.TicFS.putCart(name, u);
      if (root.TicNet) root.TicNet.publishCart(name, u);
      var stem = name.replace(/\.[^.]+$/, '');
      setName(stem);
      closeLib();
      paintLib();
      if (!started) current = stem;
      else engineLoad(stem);
    };
    reader.readAsArrayBuffer(file);
  }

  function bootEngine(wasmBuf, cartName) {
    var canvas = $('canvas');
    var want = cartName || 'hello';
    var Module = {
      canvas: canvas,
      wasmBinary: wasmBuf instanceof Uint8Array ? wasmBuf : new Uint8Array(wasmBuf),
      arguments: ['--skip', '--fs=/work', '--cmd', 'load ' + want + ' & run'],
      noExitRuntime: true,
      preRun: [function () {
        if (root.TicFS) root.TicFS.patch();
      }],
      onRuntimeInitialized: function () {
        document.body.classList.add('on');
        setName(want);
        inRun = true;
        if (root.TicFS) root.TicFS.persist();
      }
    };
    root.Module = Module;
    if (typeof root.TIC80_START !== 'function') {
      say('The engine glue did not load.');
      return;
    }
    try {
      root.TIC80_START(Module);
    } catch (e) {
      say((e && e.message) || String(e));
    }
  }

  function start(cartName) {
    if (started) return;
    started = true;
    say('Loading the tiny computer…');
    if (!api || !api.assets) {
      say('This app needs to run inside GifOS to reach its engine.');
      return;
    }
    api.assets('tic80.wasm').then(function (buf) {
      if (!buf || !buf.byteLength) throw new Error('engine came back empty');
      say('');
      startEl.hidden = true;
      bootEngine(buf, cartName);
    }, function (e) {
      started = false;
      say((e && e.message) || 'Could not read the engine out of this file.');
    });
  }

  function onRoom(list) {
    if (!whoEl) return;
    if (!list || list.length < 2) { whoEl.hidden = true; return; }
    whoEl.hidden = false;
    whoEl.textContent = list.length + ' at this desk';
  }

  function wire() {
    $('btn-start').addEventListener('click', function () { start(current); });
    $('btn-carts').addEventListener('click', openLib);
    $('lib-close').addEventListener('click', closeLib);
    $('btn-drop').addEventListener('click', function () { fileEl.click(); });
    $('btn-drop2').addEventListener('click', function () { fileEl.click(); });
    fileEl.addEventListener('change', function () {
      ingestFile(fileEl.files && fileEl.files[0]);
      fileEl.value = '';
    });
    libEl.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-sample],[data-user]');
      if (!t) return;
      if (t.getAttribute('data-sample')) loadSample(t.getAttribute('data-sample'));
      else if (t.getAttribute('data-user')) {
        var un = t.getAttribute('data-user');
        setName(un.replace(/\.[^.]+$/, ''));
        closeLib();
        if (!started) { current = un.replace(/\.[^.]+$/, ''); start(current); }
        else engineLoad(un);
      }
    });

    var stage = $('stage');
    stage.addEventListener('dragover', function (e) { e.preventDefault(); });
    stage.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) ingestFile(f);
    });

    if (api && api.onBack) {
      api.onBack(function () {
        if (libEl && !libEl.hidden) { closeLib(); return true; }
        var modal = $('add-modal');
        if (modal && modal.style.display === 'block') { modal.style.display = 'none'; return true; }
        return false;
      });
    }

    root.TicTouch.init();
    if (root.TicFS) {
      root.TicFS.init(api, { onDisk: function () { if (libEl && !libEl.hidden) paintLib(); } });
    }

    var go = Promise.resolve();
    if (api && api.me) {
      go = api.me().then(function (who) { if (who) me = who; }).catch(function () {});
    }
    go.then(function () {
      if (api && api.info) {
        return api.info().then(function (inf) {
          if (inf && inf.owner === false) owner = false;
        }).catch(function () {});
      }
    }).then(function () {
      if (root.TicNet) {
        root.TicNet.start(api, me, owner, {
          onRoom: onRoom,
          onDesk: function () { if (libEl && !libEl.hidden) paintLib(); }
        });
      }
    });

    if (api && api.launch) {
      api.launch().then(function (ask) {
        if (ask && ask.cart) {
          current = String(ask.cart).replace(/[^a-z0-9._-]+/gi, '') || 'hello';
          setName(current);
        }
      }).catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})(window);
