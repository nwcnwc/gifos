/* Start Orca. The grid is the save. A first-run program plays a C. */
(function (root) {
  'use strict';

  var db = null;
  try { if (root.gifos && root.gifos.db) db = root.gifos.db('save'); } catch (e) {}
  var room = null;
  try { if (root.gifos && root.gifos.db) room = root.gifos.db('room'); } catch (e2) {}

  var client = new Client();
  client.install(document.body);

  /* The one first-run lesson: D bangs every 4 frames, * is the bang, :04C is a C. */
  var STARTER_W = 8;
  var STARTER_H = 3;
  var STARTER = [
    '.D4.....',
    '........',
    '.:04C...'
  ].join('');

  var me = { id: 'local', name: 'You' };
  var jamOn = false;
  var jamRound = 1;
  var lastPub = '';
  var taught = false;
  var actx = null;
  var voices = {};
  var hud = null;
  var bar = null;

  function snapshot() {
    return {
      id: 'grid',
      orca: '' + client.orca,
      w: client.orca.w,
      h: client.orca.h,
      f: client.orca.f,
      tilew: client.tile.w,
      tileh: client.tile.h,
      bpm: client.clock.speed.value,
      taught: taught
    };
  }

  function apply(rec) {
    if (!rec || !rec.orca) return false;
    var w = rec.w || 1, h = rec.h || 1;
    client.orca.load(w, h, rec.orca, rec.f || 0);
    if (rec.tilew && rec.tileh) {
      client.tile.w = rec.tilew;
      client.tile.h = rec.tileh;
    }
    if (rec.bpm && client.clock && client.clock.setSpeed) {
      client.clock.setSpeed(rec.bpm, rec.bpm, true);
    }
    client.history.reset();
    client.history.record(client.orca.s);
    client.resize();
    client.update();
    return true;
  }

  function loadStarter() {
    client.orca.load(STARTER_W, STARTER_H, STARTER, 0);
    client.history.reset();
    client.history.record(client.orca.s);
    client.resize();
    client.update();
  }

  function save() {
    if (!db) return;
    db.put(snapshot()).catch(function () {});
    if (jamOn && room && me.id) {
      var s = '' + client.orca;
      if (s !== lastPub) {
        jamRound += 1;
        lastPub = s;
      }
      room.put({
        id: me.id,
        name: me.name,
        at: Date.now(),
        round: jamRound,
        orca: s,
        w: client.orca.w,
        h: client.orca.h,
        f: client.orca.f,
        bpm: client.clock.speed.value
      }).catch(function () {});
    }
  }

  function unlockAudio() {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    if (!actx) actx = new AC();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  function voiceKey(item) {
    return String(item.channel) + ':' + item.octave + ':' + item.note;
  }

  function hearNote(item, down) {
    var ctx = actx;
    if (!ctx) return;
    var key = voiceKey(item);
    if (!down) {
      var v = voices[key];
      if (v) {
        try {
          v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
          v.o.stop(ctx.currentTime + 0.1);
        } catch (e3) {}
        delete voices[key];
      }
      return;
    }
    var tr = client.io.midi.transpose(item.note, item.octave);
    if (!tr) return;
    var freq = 440 * Math.pow(2, (tr.id - 69) / 12);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    var vel = (item.velocity > 0 ? item.velocity : 15) / 16;
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.11 * vel, ctx.currentTime, 0.008);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    if (voices[key]) {
      try { voices[key].o.stop(); } catch (e4) {}
    }
    voices[key] = { o: o, g: g };
  }

  function wrapMidi() {
    var orig = client.io.midi.trigger;
    client.io.midi.trigger = function (item, down) {
      if (!this.outputDevice()) hearNote(item, down);
      return orig.call(this, item, down);
    };
  }

  function setHud(html) {
    if (!hud) return;
    hud.innerHTML = html;
    hud.hidden = !html;
  }

  function dismissLesson() {
    taught = true;
    setHud('');
    document.body.classList.remove('has-lesson');
    if (client && client.resize) client.resize();
    save();
  }

  function showLesson(first) {
    if (taught) {
      setHud('');
      return;
    }
    var msg = first
      ? 'This grid is already a program. <b>D</b> bangs every 4 frames, <b>*</b> is the bang, <b>:04C</b> is a C.'
      : 'The browser needs one tap before it will play.';
    setHud(msg + ' <button type="button" id="hudHear">Hear</button> <button type="button" id="gotit">Got it</button>');
    document.body.classList.add('has-lesson');
    var b = document.getElementById('gotit');
    if (b) b.addEventListener('click', function (e) { e.preventDefault(); dismissLesson(); });
    var h = document.getElementById('hudHear');
    if (h) h.addEventListener('click', function (e) {
      e.preventDefault();
      unlockAudio();
      if (client.clock.isPaused) client.clock.play();
      client.update();
    });
  }

  function mkBtn(label, title, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (title) b.title = title;
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      unlockAudio();
      fn();
      client.update();
    });
    return b;
  }

  function installPad() {
    var pad = document.createElement('div');
    pad.id = 'pad';
    pad.setAttribute('aria-label', 'Orca pad');

    var row1 = document.createElement('div');
    row1.className = 'pad-row';
    var hearBtn = mkBtn('Hear', 'Unlock sound in this browser', function () {
      unlockAudio();
      if (client.clock.isPaused) client.clock.play();
      showLesson(true);
    });
    hearBtn.id = 'hear';
    var playBtn = mkBtn('Play', 'Play or pause', function () {
      unlockAudio();
      client.clock.togglePlay(false);
      playBtn.textContent = client.clock.isPaused ? 'Play' : 'Pause';
    });
    playBtn.id = 'play';
    row1.appendChild(hearBtn);
    row1.appendChild(playBtn);
    row1.appendChild(mkBtn('Guide', 'Operator guide', function () { client.toggleGuide(); }));
    pad.appendChild(row1);

    var row2 = document.createElement('div');
    row2.className = 'pad-row';
    [['←', function () { client.cursor.move(-1, 0); }],
     ['↑', function () { client.cursor.move(0, 1); }],
     ['↓', function () { client.cursor.move(0, -1); }],
     ['→', function () { client.cursor.move(1, 0); }],
     ['Del', function () { client.cursor.erase(); }]
    ].forEach(function (p) { row2.appendChild(mkBtn(p[0], p[0], p[1])); });
    pad.appendChild(row2);

    var row3 = document.createElement('div');
    row3.className = 'pad-row glyphs';
    'D4*:Ca.8E'.split('').forEach(function (g) {
      row3.appendChild(mkBtn(g, 'Type ' + g, function () { client.cursor.write(g); }));
    });
    pad.appendChild(row3);

    var keys = document.createElement('textarea');
    keys.id = 'keys';
    keys.setAttribute('aria-label', 'Type operators');
    keys.setAttribute('autocomplete', 'off');
    keys.setAttribute('autocapitalize', 'off');
    keys.setAttribute('autocorrect', 'off');
    keys.setAttribute('spellcheck', 'false');
    keys.setAttribute('inputmode', 'text');
    keys.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.ctrlKey || e.metaKey) return;
      if (e.key === 'Backspace') {
        e.preventDefault();
        client.cursor.erase();
        if (client.cursor.ins) client.cursor.move(-1, 0);
        client.update();
        return;
      }
      if (e.key === 'ArrowLeft') { e.preventDefault(); client.cursor.move(-1, 0); client.update(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); client.cursor.move(1, 0); client.update(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); client.cursor.move(0, 1); client.update(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); client.cursor.move(0, -1); client.update(); return; }
      if (e.key === ' ') {
        e.preventDefault();
        unlockAudio();
        if (client.cursor.ins) client.cursor.move(1, 0);
        else client.clock.togglePlay(false);
        client.update();
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        client.cursor.write(e.key);
        client.update();
      }
    });
    keys.addEventListener('keyup', function (e) { e.stopPropagation(); keys.value = ''; });

    var row4 = document.createElement('div');
    row4.className = 'pad-row';
    var keyBtn = mkBtn('Keyboard', 'Open the phone keyboard', function () { keys.focus(); });
    row4.appendChild(keyBtn);
    row4.appendChild(mkBtn('−', 'Zoom out', function () { client.modZoom(-0.0625); }));
    row4.appendChild(mkBtn('+', 'Zoom in', function () { client.modZoom(0.0625); }));
    pad.appendChild(row4);
    pad.appendChild(keys);

    document.body.appendChild(pad);

    client.el.addEventListener('pointerup', function () {
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) keys.focus();
    });
  }

  function installChrome() {
    hud = document.createElement('p');
    hud.id = 'lesson';
    hud.className = 'lesson';
    document.body.appendChild(hud);

    bar = document.createElement('p');
    bar.id = 'meet';
    bar.className = 'meet';
    bar.innerHTML = 'The grid stays on this device. Press <b>Invite</b> (top bar) to jam on the same canvas.';
    document.body.appendChild(bar);

    installPad();
  }

  function onRoom(rows) {
    var list = (rows || []).filter(function (r) { return r && r.id; });
    var others = list.filter(function (r) { return r.id !== me.id; });
    var n = others.length;
    jamOn = n > 0;
    if (!jamOn) {
      bar.innerHTML = 'The grid stays on this device. Press <b>Invite</b> (top bar) to jam on the same canvas.';
      return;
    }
    bar.innerHTML = (n === 1 ? (others[0].name || 'A friend') + ' is on this grid.' : n + ' friends on this grid.') +
      ' Anyone types; the canvas follows.';
    var best = null;
    list.forEach(function (r) {
      if (r.orca == null) return;
      if (!best || (r.round || 0) > (best.round || 0) ||
          ((r.round || 0) === (best.round || 0) && r.id < best.id)) best = r;
    });
    if (!best || best.id === me.id) return;
    if ((best.round || 0) < jamRound) return;
    if (best.orca === ('' + client.orca)) {
      jamRound = Math.max(jamRound, best.round || 0);
      return;
    }
    jamRound = best.round || jamRound;
    lastPub = best.orca;
    apply(best);
  }

  function boot() {
    client.start();
    wrapMidi();
    root.orcaClient = client;
    installChrome();

    function afterLoad(rec) {
      if (rec && rec.orca) {
        apply(rec);
        taught = !!rec.taught;
      } else {
        loadStarter();
        taught = false;
      }
      client.toggleGuide(false);
      showLesson(true);
      if (client.clock.isPaused) client.clock.play();
      if (client.resize) client.resize();
    }

    if (db && db.get) {
      db.get('grid').then(afterLoad).catch(function () { afterLoad(null); });
    } else {
      afterLoad(null);
    }

    root.addEventListener('pointerdown', function () { unlockAudio(); }, { once: false, passive: true });
    root.addEventListener('keydown', function () { unlockAudio(); }, { once: false, passive: true });
  }

  if (document.readyState === 'complete') boot();
  else root.addEventListener('load', boot);

  setInterval(save, 1500);
  root.addEventListener('blur', save);
  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      var closed = false;
      if (client.guide) { client.toggleGuide(false); closed = true; }
      if (client.commander && client.commander.isActive) { client.commander.stop(); closed = true; }
      if (hud && !hud.hidden) { dismissLesson(); closed = true; }
      return closed;
    });
  }

  if (room && room.subscribe) {
    (root.gifos.me ? root.gifos.me() : Promise.resolve(me)).then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
    }).catch(function () {});
    room.subscribe(onRoom);
  }

  root.OrcaApp = {
    starter: STARTER,
    starterW: STARTER_W,
    starterH: STARTER_H,
    snapshot: snapshot,
    apply: apply,
    loadStarter: loadStarter,
    unlockAudio: unlockAudio,
    hearNote: hearNote
  };
})(typeof window !== 'undefined' ? window : this);
