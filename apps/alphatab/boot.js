/* Mount alphaTab, restore the last song, load Greensleeves on a first run. */
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var net = root.AtNet;
  var api = null;
  var AT = null;
  var ready = false;
  var state = {
    name: '', kind: 'tex', tex: '', bytes: null,
    tick: 0, time: 0, endTime: 0, playing: false,
    speed: 1, layout: 'page', stave: 'both', zoom: 1
  };
  var staveCycle = ['both', 'tab', 'score'];
  var lastTimeSec = -1;
  var pinchZoom = 0;

  function status(msg) { $('status').textContent = msg || ''; }

  function dataUrlToU8(url) {
    var i = String(url || '').indexOf(',');
    if (i < 0) return new Uint8Array(0);
    var b64 = url.slice(i + 1);
    var bin = atob(b64);
    var u = new Uint8Array(bin.length);
    for (var j = 0; j < bin.length; j++) u[j] = bin.charCodeAt(j);
    return u;
  }
  function dataUrlToText(url) {
    var u = dataUrlToU8(url);
    var s = '';
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return s;
  }

  function fmt(ms) {
    var sec = Math.max(0, (ms / 1000) | 0);
    var m = (sec / 60) | 0;
    var s = sec - m * 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function paintChrome() {
    $('title').textContent = state.name || 'alphaTab';
    $('time').textContent = fmt(state.time) + ' / ' + fmt(state.endTime);
    $('zoom-label').textContent = Math.round((state.zoom || 1) * 100) + '%';
    $('layout').textContent = state.layout === 'horizontal' ? 'Scroll' : 'Page';
    $('stave').textContent = state.stave === 'tab' ? 'Tab' : state.stave === 'score' ? 'Score' : 'Both';
    $('play').textContent = state.playing ? 'Pause' : 'Play';
    $('play').classList.toggle('playing', !!state.playing);
    $('play').setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  }

  function applyDisplay(render) {
    if (!api) return;
    var d = api.settings.display;
    d.scale = state.zoom;
    d.layoutMode = state.layout === 'horizontal' ? AT.LayoutMode.Horizontal : AT.LayoutMode.Page;
    if (state.stave === 'tab') d.staveProfile = AT.StaveProfile.Tab;
    else if (state.stave === 'score') d.staveProfile = AT.StaveProfile.Score;
    else d.staveProfile = AT.StaveProfile.ScoreTab;
    api.updateSettings();
    if (render !== false) api.render();
  }

  function pause() {
    if (!api) return;
    if (api.pause) api.pause();
    else api.playPause();
  }

  function snapshot() {
    return {
      name: state.name, kind: state.kind, tex: state.tex, bytes: state.bytes,
      tick: state.tick, speed: state.speed, layout: state.layout,
      stave: state.stave, zoom: state.zoom, playing: state.playing, time: state.time
    };
  }

  function paintTracks(score) {
    var box = $('tracks');
    box.innerHTML = '';
    var tracks = (score && score.tracks) || [];
    if (tracks.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    for (var i = 0; i < tracks.length; i++) {
      (function (track) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'track' + (i === 0 ? ' on' : '');
        b.textContent = track.name || ('Track ' + (track.index + 1));
        b.onclick = function () {
          var all = box.querySelectorAll('.track');
          for (var k = 0; k < all.length; k++) all[k].classList.remove('on');
          b.classList.add('on');
          api.renderTracks([track]);
        };
        box.appendChild(b);
      })(tracks[i]);
    }
  }

  function openTex(name, tex, fromRemote) {
    state.kind = 'tex';
    state.name = name || 'song.tex';
    state.tex = tex;
    state.bytes = null;
    document.body.classList.remove('ready');
    try { api.tex(tex); } catch (e) {
      status((e && e.message) || String(e));
      document.body.classList.add('ready');
      return;
    }
    if (!fromRemote) {
      net.persist(snapshot());
      net.publishSong(state);
      net.publishCursor(state);
    }
  }

  function openBytes(name, buf, fromRemote) {
    state.kind = 'bytes';
    state.name = name || 'song.gp';
    state.bytes = buf;
    state.tex = '';
    document.body.classList.remove('ready');
    try { api.load(buf); } catch (e) {
      status((e && e.message) || String(e));
      document.body.classList.add('ready');
      return;
    }
    if (!fromRemote) {
      net.persist(snapshot());
      net.publishSong(state);
      net.publishCursor(state);
    }
    if (buf && buf.byteLength > net.MAX_BYTES) {
      status((name || 'This file') + ' is too large to keep in the app (8 MB). Open it again next time.');
    }
  }

  function readFile(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error || new Error('Could not read the file.')); };
      var n = (file.name || '').toLowerCase();
      if (n.slice(-4) === '.tex') r.readAsText(file);
      else r.readAsArrayBuffer(file);
    });
  }

  function wireApi() {
    api.scoreLoaded.on(function (score) {
      state.name = (score && score.title) || state.name || 'Song';
      paintTracks(score);
      paintChrome();
      status(state.name);
    });
    api.renderStarted.on(function () { document.body.classList.remove('ready'); });
    api.renderFinished.on(function () { document.body.classList.add('ready'); });
    api.playerReady.on(function () {
      ready = true;
      $('play').disabled = false;
      $('stop').disabled = false;
      status(state.name ? (state.name + ' · ready') : 'Ready');
    });
    api.error.on(function (err) {
      document.body.classList.add('ready');
      status((err && (err.message || err)) || 'Could not open that file.');
    });
    api.playerStateChanged.on(function (e) {
      var playing = !!(AT.synth && e.state === AT.synth.PlayerState.Playing) || e.state === 1;
      state.playing = playing;
      paintChrome();
      if (!net.isApplying()) net.pulseCursor(state);
    });
    api.playerPositionChanged.on(function (e) {
      state.tick = e.currentTick | 0;
      state.time = e.currentTime || 0;
      state.endTime = e.endTime || 0;
      var sec = (state.time / 1000) | 0;
      if (sec !== lastTimeSec) {
        lastTimeSec = sec;
        $('time').textContent = fmt(state.time) + ' / ' + fmt(state.endTime);
      }
      if (!net.isApplying()) {
        net.pulseCursor(state);
        net.scheduleSave(snapshot());
      }
    });
  }

  function mount() {
    AT = root.alphaTab;
    if (!AT || !AT.AlphaTabApi) {
      status('The player did not load.');
      return;
    }

    var workerUrl = null;
    function srcUrl() {
      if (workerUrl) return workerUrl;
      var href = $('at-src').href;
      var u8 = dataUrlToU8(href);
      if (!u8.length) throw new Error('alphaTab source missing');
      workerUrl = URL.createObjectURL(new Blob([u8], { type: 'text/javascript' }));
      return workerUrl;
    }
    AT.Environment.initializeMain(function () {
      return new Worker(srcUrl());
    }, function () { return Promise.resolve(); });

    var fontUrl = $('font-link').href;
    var phone = root.AtTouch && root.AtTouch.isPhone();
    if (phone) {
      state.layout = 'horizontal';
      state.zoom = 0.85;
    }

    var settings = {
      core: {
        useWorkers: true,
        scriptFile: srcUrl(),
        fontDirectory: null,
        smuflFontSources: new Map([[AT.FontFileFormat.Woff2, fontUrl]])
      },
      display: {
        scale: state.zoom,
        layoutMode: phone ? AT.LayoutMode.Horizontal : AT.LayoutMode.Page,
        staveProfile: AT.StaveProfile.ScoreTab
      },
      player: {
        enablePlayer: true,
        playerMode: AT.PlayerMode.EnabledSynthesizer,
        outputMode: AT.PlayerOutputMode.WebAudioScriptProcessor,
        enableCursor: true,
        enableAnimatedBeatCursor: true,
        scrollElement: $('viewport'),
        scrollMode: AT.ScrollMode.Continuous
      }
    };

    api = new AT.AlphaTabApi($('main'), settings);
    api.settings.core.smuflFontSources = new Map([[AT.FontFileFormat.Woff2, fontUrl]]);
    api.settings.core.useWorkers = true;
    api.settings.player.outputMode = AT.PlayerOutputMode.WebAudioScriptProcessor;
    api.updateSettings();
    wireApi();

    var sf = dataUrlToU8($('sf-link').href);
    if (sf.length) api.loadSoundFont(sf);

    $('play').onclick = function () {
      if (!ready) return;
      api.playPause();
    };
    $('stop').onclick = function () {
      if (!ready) return;
      api.stop();
      state.playing = false;
      paintChrome();
      if (!net.isApplying()) net.publishCursor(state);
    };
    $('click').onclick = function () {
      var on = $('click').classList.toggle('on');
      $('click').setAttribute('aria-pressed', on ? 'true' : 'false');
      api.metronomeVolume = on ? 1 : 0;
    };
    $('speed').onchange = function () {
      state.speed = parseFloat($('speed').value) || 1;
      api.playbackSpeed = state.speed;
      net.scheduleSave(snapshot());
      if (!net.isApplying()) net.publishCursor(state);
    };
    $('layout').onclick = function () {
      state.layout = state.layout === 'horizontal' ? 'page' : 'horizontal';
      applyDisplay();
      net.scheduleSave(snapshot());
    };
    $('stave').onclick = function () {
      var i = staveCycle.indexOf(state.stave);
      state.stave = staveCycle[(i + 1) % staveCycle.length];
      applyDisplay();
      net.scheduleSave(snapshot());
    };
    $('zoom-in').onclick = function () {
      state.zoom = Math.min(2, Math.round((state.zoom + 0.1) * 10) / 10);
      applyDisplay();
      paintChrome();
      net.scheduleSave(snapshot());
    };
    $('zoom-out').onclick = function () {
      state.zoom = Math.max(0.5, Math.round((state.zoom - 0.1) * 10) / 10);
      applyDisplay();
      paintChrome();
      net.scheduleSave(snapshot());
    };

    $('file-input').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      readFile(f).then(function (data) {
        if (typeof data === 'string') openTex(f.name, data, false);
        else openBytes(f.name, data, false);
      }).catch(function (err) {
        status((err && err.message) || String(err));
      });
    });

    var stage = $('stage');
    stage.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    stage.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      readFile(f).then(function (data) {
        if (typeof data === 'string') openTex(f.name, data, false);
        else openBytes(f.name, data, false);
      }).catch(function (err) {
        status((err && err.message) || String(err));
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (ready) api.playPause();
      } else if (e.key === 'Escape') {
        if (ready && state.playing) pause();
      } else if (e.key === '+' || e.key === '=') {
        $('zoom-in').click();
      } else if (e.key === '-' || e.key === '_') {
        $('zoom-out').click();
      }
    });

    if (root.AtTouch) {
      root.AtTouch.bind($('viewport'), {
        zoom: function () { return state.zoom; },
        onPinch: function (z) {
          state.zoom = Math.max(0.5, Math.min(2, Math.round(z * 10) / 10));
          clearTimeout(pinchZoom);
          pinchZoom = setTimeout(function () {
            applyDisplay();
            paintChrome();
          }, 40);
        }
      });
    }

    net.start({
      onSong: function (rec) {
        net.setApplying(true);
        if (rec.kind === 'tex' && rec.tex) openTex(rec.name || 'shared.tex', rec.tex, true);
        else {
          var buf = net.bufOf(rec.bytes);
          if (buf) openBytes(rec.name || 'shared.gp', buf, true);
        }
        net.setApplying(false);
        $('meet').textContent = 'A friend sent this tab. Play follows the playhead.';
      },
      onCursor: function (rec) {
        net.setApplying(true);
        if (rec.speed && Math.abs(rec.speed - state.speed) > 0.01) {
          state.speed = rec.speed;
          api.playbackSpeed = rec.speed;
          $('speed').value = String(rec.speed);
        }
        if (rec.tick != null && api.tickPosition !== rec.tick) api.tickPosition = rec.tick | 0;
        if (rec.playing && !state.playing && ready) api.play();
        if (!rec.playing && state.playing && ready) pause();
        net.setApplying(false);
        var n = rec.name ? rec.name : 'A friend';
        $('meet').textContent = n + ' is on this tab. The playhead follows.';
      }
    }).then(function () {
      return net.loadSaved();
    }).then(function (rec) {
      if (rec) {
        if (rec.speed) { state.speed = rec.speed; api.playbackSpeed = rec.speed; $('speed').value = String(rec.speed); }
        if (rec.layout) state.layout = rec.layout;
        if (rec.stave) state.stave = rec.stave;
        if (rec.zoom) state.zoom = rec.zoom;
        applyDisplay(false);
        paintChrome();
        if (rec.kind === 'tex' && rec.tex) { openTex(rec.name || 'saved.tex', rec.tex, false); return; }
        var buf = net.bufOf(rec.bytes);
        if (buf) { openBytes(rec.name || 'saved.gp', buf, false); return; }
      }
      var tex = dataUrlToText($('sample-link').href);
      openTex('Greensleeves.tex', tex, false);
    }).catch(function (e) {
      status((e && e.message) || String(e));
      document.body.classList.add('ready');
    });

    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (state.playing && ready) { pause(); return true; }
        return false;
      });
    }
    paintChrome();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})(typeof window !== 'undefined' ? window : this);
