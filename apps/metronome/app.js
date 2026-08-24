/* Metronome: Chris Wilson lookahead scheduler, oscillator click, private save.
 * No Worker (srcdoc has no relative worker URL). No microphone. */
(function (root) {
  'use strict';

  var LOOKAHEAD = 25;
  var SCHEDULE_AHEAD = 0.1;
  var NOTE_BEEP = 0.05;
  var NOTE_CLICK = 0.028;
  var BEATS = { '2/4': 2, '3/4': 3, '4/4': 4, '6/8': 6 };
  var SUBDIV = { beat: 1, '8th': 2, trip: 3, '16th': 4 };
  var MARKS = [
    { name: 'Largo', bpm: 50 },
    { name: 'Adagio', bpm: 72 },
    { name: 'Andante', bpm: 92 },
    { name: 'Moderato', bpm: 108 },
    { name: 'Allegro', bpm: 132 },
    { name: 'Presto', bpm: 180 }
  ];

  function beatsOf(sig) {
    return BEATS[sig] || 4;
  }
  function subdivOf(sub) {
    return SUBDIV[sub] || 1;
  }
  function clampTempo(n) {
    n = Math.round(Number(n) || 0);
    if (n < 30) return 30;
    if (n > 240) return 240;
    return n;
  }
  function secondsPerBeat(tempo, sig) {
    var spb = 60.0 / (tempo || 120);
    if (sig === '6/8') spb = spb / 2;
    return spb;
  }
  function secondsPerClick(tempo, sig, subdiv) {
    return secondsPerBeat(tempo, sig) / subdivOf(subdiv);
  }
  function clicksInBar(sig, subdiv) {
    return beatsOf(sig) * subdivOf(subdiv);
  }
  function tempoMark(bpm) {
    if (bpm < 60) return 'Largo';
    if (bpm < 76) return 'Adagio';
    if (bpm < 108) return 'Andante';
    if (bpm < 120) return 'Moderato';
    if (bpm < 168) return 'Allegro';
    return 'Presto';
  }
  function scheduleBar(tempo, sig, subdiv, t0) {
    var mul = subdivOf(subdiv);
    var nBeats = beatsOf(sig);
    var dt = secondsPerClick(tempo, sig, subdiv);
    var out = [];
    var beat = 0, sub = 0, t = t0 || 0, i, total = nBeats * mul;
    for (i = 0; i < total; i++) {
      out.push({
        i: i, beat: beat, sub: sub, time: t,
        accent: beat === 0 && sub === 0,
        onBeat: sub === 0
      });
      t += dt;
      sub++;
      if (sub >= mul) { sub = 0; beat++; }
    }
    return out;
  }
  function tapBpm(times) {
    if (!times || times.length < 2) return null;
    var taps = times.slice(-6);
    var sum = 0, i;
    for (i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
    return clampTempo(Math.round(60000 / (sum / (taps.length - 1))));
  }

  var $ = function (id) {
    return root.document ? root.document.getElementById(id) : null;
  };
  var saveDb = null, saveTimer = 0, applying = false;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var settings = { tempo: 120, sig: '4/4', vol: 80, subdiv: 'beat', sound: 'click' };
  var audio = null, gain = null, playing = false, unlocked = false;
  var currentBeat = 0, currentSub = 0, nextNoteTime = 0, timerID = 0;
  var queue = [];
  var lastDrawn = { beat: -1, sub: 0, accent: false, onBeat: false };
  var raf = 0, playOrigin = 0, taps = [], holdTimer = 0, holdRepeat = 0;

  function persist(immediate) {
    if (applying || !saveDb) return;
    if (root.MetroMp && root.MetroMp.guest) return;
    if (saveTimer) clearTimeout(saveTimer);
    var write = function () {
      saveTimer = 0;
      saveDb.put({
        id: 'last',
        tempo: settings.tempo,
        sig: settings.sig,
        vol: settings.vol,
        subdiv: settings.subdiv,
        sound: settings.sound
      }).catch(function () {});
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 250);
  }

  function ensureAudio() {
    if (audio) return audio;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) throw new Error('This browser has no audio.');
    audio = new AC();
    gain = audio.createGain();
    gain.gain.value = settings.vol / 100;
    gain.connect(audio.destination);
    return audio;
  }

  function unlock() {
    if (unlocked || !audio) return;
    var buf = audio.createBuffer(1, 1, 22050);
    var node = audio.createBufferSource();
    node.buffer = buf;
    node.connect(gain);
    node.start(0);
    unlocked = true;
  }

  function beepAt(time, kind) {
    var osc = audio.createOscillator();
    var g = audio.createGain();
    osc.connect(g);
    g.connect(gain);
    osc.frequency.value = kind === 'accent' ? 880 : (kind === 'beat' ? 440 : 220);
    g.gain.setValueAtTime(1, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + NOTE_BEEP);
    osc.start(time);
    osc.stop(time + NOTE_BEEP);
  }

  function clickAt(time, kind) {
    var tick = audio.createOscillator();
    var body = audio.createOscillator();
    var g1 = audio.createGain();
    var g2 = audio.createGain();
    tick.type = 'square';
    body.type = 'triangle';
    tick.frequency.value = kind === 'accent' ? 1900 : (kind === 'beat' ? 1400 : 2100);
    body.frequency.value = kind === 'accent' ? 220 : 150;
    var peak = kind === 'sub' ? 0.35 : (kind === 'accent' ? 1 : 0.7);
    tick.connect(g1); g1.connect(gain);
    body.connect(g2); g2.connect(gain);
    g1.gain.setValueAtTime(peak, time);
    g1.gain.exponentialRampToValueAtTime(0.001, time + NOTE_CLICK);
    g2.gain.setValueAtTime(kind === 'sub' ? 0.08 : 0.45, time);
    g2.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    tick.start(time); tick.stop(time + NOTE_CLICK);
    body.start(time); body.stop(time + 0.045);
  }

  function scheduleNote(beatNumber, sub, time) {
    if (!audio || !gain) return;
    var accent = beatNumber === 0 && sub === 0;
    var onBeat = sub === 0;
    var kind = accent ? 'accent' : (onBeat ? 'beat' : 'sub');
    queue.push({ beat: beatNumber, sub: sub, accent: accent, onBeat: onBeat, time: time });
    if (settings.sound === 'beep') beepAt(time, kind);
    else clickAt(time, kind);
  }

  function nextNote() {
    nextNoteTime += secondsPerClick(settings.tempo, settings.sig, settings.subdiv);
    currentSub++;
    if (currentSub >= subdivOf(settings.subdiv)) {
      currentSub = 0;
      currentBeat++;
      if (currentBeat >= beatsOf(settings.sig)) currentBeat = 0;
    }
  }

  function scheduler() {
    if (!playing || !audio) return;
    while (nextNoteTime < audio.currentTime + SCHEDULE_AHEAD) {
      scheduleNote(currentBeat, currentSub, nextNoteTime);
      nextNote();
    }
    timerID = root.setTimeout(scheduler, LOOKAHEAD);
  }

  function pendAngle(now) {
    var spb = secondsPerBeat(settings.tempo, settings.sig);
    if (!(spb > 0)) return 0;
    var phase = (now - playOrigin) / spb;
    return 26 * Math.cos(Math.PI * phase);
  }

  function setPend(deg, rest) {
    var arm = $('pendArm');
    var py = $('pyramid');
    if (!arm) return;
    arm.style.setProperty('--pend', deg + 'deg');
    if (rest) arm.classList.add('rest');
    else arm.classList.remove('rest');
    if (py) {
      if (!rest && Math.abs(Math.abs(deg) - 26) < 2.4) py.classList.add('tick');
      else py.classList.remove('tick');
    }
  }

  function paintBeats(ev) {
    var n = beatsOf(settings.sig);
    var box = $('beats');
    if (!box) return;
    if (box.childNodes.length !== n) {
      box.innerHTML = '';
      for (var i = 0; i < n; i++) box.appendChild(document.createElement('span'));
    }
    var on = ev && ev.beat >= 0 ? ev.beat : -1;
    for (var j = 0; j < box.childNodes.length; j++) {
      var el = box.childNodes[j];
      el.className = '';
      if (j === on) el.className = j === 0 ? 'on accent' : 'on';
    }
  }

  function drawLoop() {
    if (!playing || !audio) return;
    raf = root.requestAnimationFrame ? root.requestAnimationFrame(drawLoop) : root.setTimeout(drawLoop, 16);
    var now = audio.currentTime;
    while (queue.length && queue[0].time <= now) {
      lastDrawn = queue.shift();
    }
    if (queue.length > 24) queue.splice(0, queue.length - 8);
    paintBeats(lastDrawn);
    setPend(pendAngle(now), false);
  }

  function start() {
    ensureAudio();
    unlock();
    if (audio.resume) audio.resume();
    playing = true;
    currentBeat = 0;
    currentSub = 0;
    queue = [];
    lastDrawn = { beat: -1, sub: 0, accent: false, onBeat: false };
    nextNoteTime = audio.currentTime + 0.05;
    playOrigin = nextNoteTime;
    var btn = $('playBtn');
    if (btn) btn.textContent = 'Stop';
    var arm = $('pendArm');
    if (arm) arm.classList.remove('rest');
    scheduler();
    drawLoop();
  }

  function stop() {
    playing = false;
    if (timerID) { clearTimeout(timerID); timerID = 0; }
    if (raf) {
      if (root.cancelAnimationFrame) root.cancelAnimationFrame(raf);
      else clearTimeout(raf);
      raf = 0;
    }
    queue = [];
    var btn = $('playBtn');
    if (btn) btn.textContent = 'Start';
    paintBeats({ beat: -1 });
    setPend(0, true);
    var py = $('pyramid');
    if (py) py.classList.remove('tick');
  }

  function readUi() {
    var tempoEl = $('tempo');
    if (tempoEl) settings.tempo = clampTempo(tempoEl.value);
    var volEl = $('vol');
    if (volEl) {
      settings.vol = parseInt(volEl.value, 10);
      if (settings.vol < 0) settings.vol = 0;
      if (settings.vol > 100) settings.vol = 100;
    }
  }

  function chipOn(boxId, attr, value) {
    var box = $(boxId);
    if (!box) return;
    var btns = box.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var v = btns[i].getAttribute(attr);
      btns[i].classList.toggle('on', v === value);
    }
  }

  function writeUi() {
    applying = true;
    var tempoEl = $('tempo');
    if (tempoEl) tempoEl.value = settings.tempo;
    var bpm = $('bpm');
    if (bpm) bpm.textContent = String(settings.tempo);
    var volEl = $('vol');
    if (volEl) volEl.value = settings.vol;
    var mark = $('mark');
    if (mark) mark.textContent = tempoMark(settings.tempo);
    chipOn('sigs', 'data-sig', settings.sig);
    chipOn('subs', 'data-sub', settings.subdiv);
    chipOn('sounds', 'data-sound', settings.sound);
    var marks = $('marks');
    if (marks) {
      var kids = marks.querySelectorAll('button');
      for (var i = 0; i < kids.length; i++) {
        kids[i].classList.toggle('on', parseInt(kids[i].getAttribute('data-bpm'), 10) === settings.tempo);
      }
    }
    applying = false;
    paintBeats(playing ? lastDrawn : { beat: -1 });
  }

  function applyVol() {
    if (gain) gain.gain.value = settings.vol / 100;
  }

  function applyRemote(row) {
    if (!row) return;
    applying = true;
    settings.tempo = clampTempo(row.tempo);
    settings.sig = BEATS[row.sig] ? row.sig : '4/4';
    if (SUBDIV[row.subdiv]) settings.subdiv = row.subdiv;
    writeUi();
    applying = false;
  }

  function onChange() {
    if (applying) return;
    if (root.MetroMp && root.MetroMp.guest) return;
    readUi();
    var bpm = $('bpm');
    if (bpm) bpm.textContent = String(settings.tempo);
    var mark = $('mark');
    if (mark) mark.textContent = tempoMark(settings.tempo);
    applyVol();
    paintBeats(playing ? lastDrawn : { beat: -1 });
    persist();
    if (root.MetroMp) root.MetroMp.publish();
    writeUi();
  }

  function setTempo(n) {
    if (root.MetroMp && root.MetroMp.guest) return;
    settings.tempo = clampTempo(n);
    writeUi();
    persist();
    if (root.MetroMp) root.MetroMp.publish();
  }

  function bumpTempo(d) {
    setTempo(settings.tempo + d);
  }

  function tapTempo() {
    if (root.MetroMp && root.MetroMp.guest) return;
    var now = Date.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    var pad = $('tapBtn');
    if (pad) {
      pad.classList.add('flash');
      setTimeout(function () { pad.classList.remove('flash'); }, 120);
    }
    var bpm = tapBpm(taps);
    if (bpm != null) setTempo(bpm);
  }

  function loadSave() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (!r || r.id !== 'last') return;
        if (r.tempo >= 30 && r.tempo <= 240) settings.tempo = r.tempo;
        if (BEATS[r.sig]) settings.sig = r.sig;
        if (r.vol >= 0 && r.vol <= 100) settings.vol = r.vol;
        if (SUBDIV[r.subdiv]) settings.subdiv = r.subdiv;
        if (r.sound === 'beep' || r.sound === 'click') settings.sound = r.sound;
      });
    }).catch(function () {});
  }

  function sayMeet(text, live, err) {
    var el = $('meet');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('live', !!live);
    el.classList.toggle('err', !!err);
  }

  function holdStart(dir) {
    holdStop();
    bumpTempo(dir);
    holdTimer = setTimeout(function () {
      holdRepeat = setInterval(function () { bumpTempo(dir); }, 80);
    }, 380);
  }
  function holdStop() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
    if (holdRepeat) { clearInterval(holdRepeat); holdRepeat = 0; }
  }

  function bindHold(el, dir) {
    if (!el) return;
    el.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
      holdStart(dir);
    });
    el.addEventListener('pointerup', holdStop);
    el.addEventListener('pointercancel', holdStop);
    el.addEventListener('pointerleave', holdStop);
  }

  function applyLaunch(a) {
    if (!a) return;
    var changed = false;
    if (a.bpm != null) {
      var n = clampTempo(parseInt(a.bpm, 10));
      if (n) { settings.tempo = n; changed = true; }
    }
    if (a.sig && BEATS[a.sig]) { settings.sig = a.sig; changed = true; }
    if (changed) {
      writeUi();
      persist();
      if (root.MetroMp) root.MetroMp.publish();
    }
  }

  function boot() {
    var marks = $('marks');
    if (marks && !marks.childNodes.length) {
      MARKS.forEach(function (m) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = m.name;
        b.setAttribute('data-bpm', String(m.bpm));
        b.addEventListener('click', function () { setTempo(m.bpm); });
        marks.appendChild(b);
      });
    }
    writeUi();
    var tempoEl = $('tempo');
    if (tempoEl) tempoEl.addEventListener('input', onChange);
    var volEl = $('vol');
    if (volEl) volEl.addEventListener('input', function () {
      readUi();
      applyVol();
      persist();
    });
    var sigs = $('sigs');
    if (sigs) sigs.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || root.MetroMp && root.MetroMp.guest) return;
      var v = t.getAttribute('data-sig');
      if (!BEATS[v]) return;
      settings.sig = v;
      writeUi();
      persist();
      if (root.MetroMp) root.MetroMp.publish();
    });
    var subs = $('subs');
    if (subs) subs.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || root.MetroMp && root.MetroMp.guest) return;
      var v = t.getAttribute('data-sub');
      if (!SUBDIV[v]) return;
      settings.subdiv = v;
      writeUi();
      persist();
      if (root.MetroMp) root.MetroMp.publish();
    });
    var sounds = $('sounds');
    if (sounds) sounds.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      var v = t.getAttribute('data-sound');
      if (v !== 'click' && v !== 'beep') return;
      settings.sound = v;
      writeUi();
      persist();
    });
    var playBtn = $('playBtn');
    if (playBtn) playBtn.addEventListener('click', function () {
      try {
        if (playing) stop();
        else start();
      } catch (err) {
        sayMeet(String(err && err.message || err), false, true);
      }
    });
    var tapBtn = $('tapBtn');
    if (tapBtn) tapBtn.addEventListener('click', tapTempo);
    bindHold($('tempoDown'), -1);
    bindHold($('tempoUp'), +1);

    root.addEventListener('keydown', function (e) {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      var tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        if (tag === 'BUTTON') return;
        e.preventDefault();
        try { if (playing) stop(); else start(); } catch (err) {}
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowRight') {
        e.preventDefault();
        bumpTempo(e.shiftKey ? 5 : 1);
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowLeft') {
        e.preventDefault();
        bumpTempo(e.shiftKey ? -5 : -1);
      }
    });

    try {
      if (root.gifos && typeof root.gifos.onBack === 'function') {
        root.gifos.onBack(function () {
          if (playing) { stop(); return true; }
          return false;
        });
      }
    } catch (e) {}

    var Mp = root.MetroMp;
    if (Mp) {
      Mp.getState = function () { return settings; };
      Mp.onRemote = applyRemote;
      Mp.onHost = function () {};
      Mp.onStatus = function (text, isGuest) {
        sayMeet(text, !!isGuest, false);
      };
      Mp.watch();
    } else {
      sayMeet('Press Invite (top bar) to show these numbers in a meeting. Each device plays its own click.');
    }

    try {
      if (root.gifos && typeof root.gifos.launch === 'function') {
        root.gifos.launch().then(applyLaunch).catch(function () {});
      }
    } catch (e) {}
  }

  root.MetronomeApp = {
    beatsOf: beatsOf,
    subdivOf: subdivOf,
    clampTempo: clampTempo,
    secondsPerBeat: secondsPerBeat,
    nextSeconds: secondsPerClick,
    secondsPerClick: secondsPerClick,
    clicksInBar: clicksInBar,
    tempoMark: tempoMark,
    scheduleBar: scheduleBar,
    tapBpm: tapBpm,
    MARKS: MARKS,
    BEATS: BEATS,
    LOOKAHEAD: LOOKAHEAD,
    SCHEDULE_AHEAD: SCHEDULE_AHEAD
  };

  if ($('tempo')) {
    loadSave().then(boot);
    root.addEventListener('pagehide', function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
      persist(true);
      stop();
    });
  }
})(typeof window !== 'undefined' ? window : this);
