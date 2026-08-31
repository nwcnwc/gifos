// v86 from packed buffers. No url:, no wasm_path, no fetch.
(function () {
  var MEM = 16 * 1024 * 1024;
  var VGA = 2 * 1024 * 1024;
  var SNAP_MAX = 1500000;
  var FDA_ID = 'fda';
  var SNAP_ID = 'vm';
  var PREF_ID = 'ui';

  var emu = null;
  var factoryFda = null;
  var muted = false;
  var paused = false;
  var booted = false;
  var saveTimer = 0;
  var diskDb = null;
  var snapDb = null;
  var prefDb = null;

  function $(id) { return document.getElementById(id); }
  function setStatus(t) { $('stat-line').textContent = t; }
  function setDiskNote(t) { $('stat-disk').textContent = t; }
  function setLed(live) {
    document.body.classList.toggle('live', !!live);
    document.body.classList.toggle('paused', !live && booted);
  }

  function b64ToU8(b64) {
    var bin = atob(b64);
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function asU8(x) {
    if (!x) return null;
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    return null;
  }
  function copyBuf(u) {
    var n = new Uint8Array(u.byteLength);
    n.set(u);
    return n;
  }

  function deflate(u8) {
    if (typeof CompressionStream !== 'function') return Promise.resolve(null);
    var cs = new CompressionStream('deflate');
    var w = cs.writable.getWriter();
    w.write(u8);
    w.close();
    return new Response(cs.readable).arrayBuffer().then(function (ab) {
      return new Uint8Array(ab);
    }).catch(function () { return null; });
  }
  function inflate(u8) {
    if (typeof DecompressionStream !== 'function') return Promise.resolve(null);
    var ds = new DecompressionStream('deflate');
    var w = ds.writable.getWriter();
    w.write(u8);
    w.close();
    return new Response(ds.readable).arrayBuffer().then(function (ab) {
      return new Uint8Array(ab);
    }).catch(function () { return null; });
  }

  function wasmFn(imports) {
    return WebAssembly.instantiate(window.__v86wasm, imports).then(function (r) {
      return r.instance.exports;
    });
  }

  function applyMute() {
    try {
      if (emu && emu.speaker_adapter && emu.speaker_adapter.mixer) {
        emu.speaker_adapter.mixer.set_volume(muted ? 0 : 1, 2);
      }
    } catch (e) {}
    $('btn-mute').classList.toggle('on', muted);
    $('btn-mute').textContent = muted ? 'Muted' : 'Mute';
  }

  function fitScreen() {
    if (!emu || !emu.screen_set_scale) return;
    var box = $('stage').getBoundingClientRect();
    var scr = $('screen_container');
    var w = scr.offsetWidth || 720;
    var h = scr.offsetHeight || 400;
    if (w < 8 || h < 8) return;
    var sx = Math.max(0.5, (box.width - 28) / w);
    var sy = Math.max(0.5, (box.height - 28) / h);
    var s = Math.max(0.5, Math.min(sx, sy, 3));
    emu.screen_set_scale(s, s);
  }

  function currentFda() {
    if (!emu || !emu.get_disk_fda) return null;
    return asU8(emu.get_disk_fda());
  }

  function persistDisk() {
    if (!diskDb || !emu) return Promise.resolve();
    var fda = currentFda();
    if (!fda || !fda.length) return Promise.resolve();
    return diskDb.put({ id: FDA_ID, bytes: copyBuf(fda) }).then(function () {
      setDiskNote('floppy saved');
    }).catch(function (err) {
      setDiskNote(String(err && err.message || err));
    });
  }

  function persistSnap() {
    if (!snapDb || !emu || !emu.save_state) return Promise.resolve(false);
    return emu.save_state().then(function (ab) {
      var raw = asU8(ab);
      if (!raw) return false;
      return deflate(raw).then(function (z) {
        if (!z || z.length > SNAP_MAX) {
          setDiskNote('floppy saved · snapshot too big');
          return false;
        }
        return snapDb.put({ id: SNAP_ID, bytes: z, raw: raw.length }).then(function () {
          setDiskNote('asleep · ' + Math.round(z.length / 1024) + ' KB');
          return true;
        });
      });
    }).catch(function () { return false; });
  }

  function persistPrefs() {
    if (!prefDb) return Promise.resolve();
    return prefDb.put({
      id: PREF_ID,
      muted: muted,
      keys: !$('keys').hidden
    }).catch(function () {});
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      persistDisk();
    }, 12000);
  }

  function setPaused(on) {
    if (!emu) return;
    paused = !!on;
    if (paused) {
      emu.stop();
      persistDisk();
      $('btn-pause').textContent = 'Run';
      $('btn-pause').classList.add('on');
      setLed(false);
      setStatus('Paused · 16 MB RAM · FreeDOS 720K');
    } else {
      emu.run();
      $('btn-pause').textContent = 'Pause';
      $('btn-pause').classList.remove('on');
      setLed(true);
      setStatus('Running · 16 MB RAM · FreeDOS 720K · offline');
    }
  }

  function startEmulator(fdaU8, snapU8) {
    if (typeof V86 !== 'function') {
      fail('v86 library did not load.');
      return;
    }
    var bios = b64ToU8(window.V86_BIOS_B64);
    var vga = b64ToU8(window.V86_VGABIOS_B64);
    var opts = {
      wasm_fn: wasmFn,
      memory_size: MEM,
      vga_memory_size: VGA,
      screen_container: $('screen_container'),
      bios: { buffer: bios.buffer },
      vga_bios: { buffer: vga.buffer },
      fda: { buffer: fdaU8.buffer.slice(fdaU8.byteOffset, fdaU8.byteOffset + fdaU8.byteLength) },
      autostart: true,
      disable_speaker: false,
      fastboot: true
    };
    if (snapU8 && snapU8.length) {
      opts.initial_state = { buffer: snapU8.buffer.slice(snapU8.byteOffset, snapU8.byteOffset + snapU8.byteLength) };
    }
    try {
      emu = new V86(opts);
    } catch (err) {
      fail(String(err && err.message || err));
      return;
    }
    window.v86Keys.attach(emu);
    emu.add_listener('emulator-loaded', function () {
      applyMute();
      fitScreen();
      emu.wait_until_vga_screen_contains(/FreeDOS|A:\\>|A:>/i, { timeout_msec: 25000 }).then(function (ok) {
        $('boot-msg').hidden = true;
        document.body.classList.add('live');
        setStatus(ok
          ? 'Running · 16 MB RAM · FreeDOS 720K · offline'
          : 'Running · 16 MB RAM · still booting');
        scheduleSave();
      }).catch(function () {
        $('boot-msg').hidden = true;
        document.body.classList.add('live');
        setStatus('Running · 16 MB RAM · FreeDOS 720K');
      });
    });
    emu.add_listener('emulator-started', function () {
      booted = true;
      setLed(true);
      applyMute();
    });
    emu.add_listener('screen-set-size', function () {
      fitScreen();
    });
  }

  function fail(msg) {
    document.body.classList.add('err');
    $('boot-msg').hidden = false;
    $('boot-msg').textContent = msg;
    setStatus(msg);
  }

  function destroyEmu() {
    if (!emu) return Promise.resolve();
    var e = emu;
    emu = null;
    window.v86Keys.attach(null);
    return Promise.resolve(e.destroy ? e.destroy() : undefined).catch(function () {});
  }

  function rebootKeepDisk() {
    if (!emu) return;
    persistDisk();
    emu.restart();
    setStatus('Rebooting…');
  }

  function factoryReset() {
    persistDisk();
    destroyEmu().then(function () {
      if (diskDb) diskDb.delete(FDA_ID).catch(function () {});
      if (snapDb) snapDb.delete(SNAP_ID).catch(function () {});
      document.body.classList.remove('live', 'paused', 'err');
      $('boot-msg').hidden = false;
      $('boot-msg').textContent = 'Booting FreeDOS…';
      startEmulator(copyBuf(factoryFda), null);
      setDiskNote('factory floppy');
    });
  }

  function sleepNow() {
    if (!emu) return;
    setStatus('Sleeping…');
    setPaused(true);
    persistDisk().then(function () { return persistSnap(); }).then(function (ok) {
      persistPrefs();
      setStatus(ok ? 'Asleep — open again to resume here' : 'Paused — floppy saved, snapshot skipped');
    });
  }

  function wire() {
    $('btn-pause').onclick = function () { setPaused(!paused); };
    $('btn-reboot').onclick = rebootKeepDisk;
    $('btn-factory').onclick = factoryReset;
    $('btn-sleep').onclick = sleepNow;
    $('btn-mute').onclick = function () {
      muted = !muted;
      applyMute();
      persistPrefs();
    };
    $('btn-keys').onclick = function () {
      window.v86Keys.show();
      persistPrefs();
    };
    $('btn-full').onclick = function () {
      var el = $('bezel');
      if (!document.fullscreenElement) {
        (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    };
    $('crt').addEventListener('pointerdown', function () {
      window.v86Keys.focusType();
    });
    window.addEventListener('resize', fitScreen);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        persistDisk();
        persistPrefs();
      }
    });
    if (window.gifos && gifos.onBack) {
      gifos.onBack(function () {
        if (!$('keys').hidden) { window.v86Keys.show(false); return; }
        if (!paused) { setPaused(true); return; }
      });
    }
  }

  function boot() {
    wire();
    if (!window.V86_WASM_B64 || !window.V86_BIOS_B64 || !window.V86_FDA_B64) {
      fail('Packed BIOS or disk is missing.');
      return;
    }
    window.__v86wasm = b64ToU8(window.V86_WASM_B64).buffer;
    factoryFda = b64ToU8(window.V86_FDA_B64);

    var ready = Promise.resolve();
    if (window.gifos && gifos.db) {
      prefDb = gifos.db('prefs');
      diskDb = gifos.db('disk');
      snapDb = gifos.db('snap');
      ready = Promise.all([
        prefDb.get(PREF_ID).catch(function () { return null; }),
        diskDb.get(FDA_ID).catch(function () { return null; }),
        snapDb.get(SNAP_ID).catch(function () { return null; })
      ]);
    }
    ready.then(function (pack) {
      var prefs = pack && pack[0];
      var disk = pack && pack[1];
      var snap = pack && pack[2];
      if (prefs) {
        muted = !!prefs.muted;
        if (prefs.keys) window.v86Keys.show(true);
      }
      var fda = asU8(disk && disk.bytes);
      if (!fda || fda.length !== factoryFda.length) fda = copyBuf(factoryFda);
      else fda = copyBuf(fda);
      var snapU8 = asU8(snap && snap.bytes);
      var go = function (plain) { startEmulator(fda, plain || null); };
      if (snapU8 && snapU8.length) {
        return inflate(snapU8).then(function (plain) {
          if (plain && plain.length) {
            setDiskNote('waking…');
            go(plain);
          } else go(null);
        });
      }
      go(null);
    }).catch(function (err) {
      fail(String(err && err.message || err));
    });
  }

  boot();
})();
