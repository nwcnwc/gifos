/* Metronome: Chris Wilson lookahead scheduler, oscillator click, private save.
 * No Worker (srcdoc has no relative worker URL). No microphone. */
(function (root) {
  'use strict';

  var LOOKAHEAD = 25;
  var SCHEDULE_AHEAD = 0.1;
  var NOTE_LENGTH = 0.05;
  var BEATS = { '2/4': 2, '3/4': 3, '4/4': 4, '6/8': 6 };

  var $ = function (id) {
    return root.document ? root.document.getElementById(id) : null;
  };
  var saveDb = null, saveTimer = 0, applying = false;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var settings = { tempo: 120, sig: '4/4', vol: 80 };
  var audio = null, gain = null, playing = false, unlocked = false;
  var currentBeat = 0, nextNoteTime = 0, timerID = 0, lastDrawn = -1;
  var taps = [];

  function beatsOf(sig) {
    return BEATS[sig] || 4;
  }

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
        vol: settings.vol
      }).catch(function () {});
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 250);
  }

  function ensureAudio() {
    if (audio) return audio;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) throw new Error('This browser has no audio');
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

  function nextNote() {
    var secondsPerBeat = 60.0 / settings.tempo;
    var n = beatsOf(settings.sig);
    if (settings.sig === '6/8') secondsPerBeat = 60.0 / settings.tempo / 2;
    nextNoteTime += secondsPerBeat;
    currentBeat++;
    if (currentBeat >= n) currentBeat = 0;
  }

  function scheduleNote(beatNumber, time) {
    if (!audio || !gain) return;
    var osc = audio.createOscillator();
    var g = audio.createGain();
    osc.connect(g);
    g.connect(gain);
    osc.frequency.value = beatNumber === 0 ? 880 : 440;
    g.gain.setValueAtTime(1, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + NOTE_LENGTH);
    osc.start(time);
    osc.stop(time + NOTE_LENGTH);
  }

  function scheduler() {
    if (!playing || !audio) return;
    while (nextNoteTime < audio.currentTime + SCHEDULE_AHEAD) {
      scheduleNote(currentBeat, nextNoteTime);
      lastDrawn = currentBeat;
      paintBeats(currentBeat);
      nextNote();
    }
    timerID = root.setTimeout(scheduler, LOOKAHEAD);
  }

  function start() {
    ensureAudio();
    unlock();
    if (audio.resume) audio.resume();
    playing = true;
    currentBeat = 0;
    nextNoteTime = audio.currentTime + 0.05;
    $('playBtn').textContent = 'Stop';
    scheduler();
  }

  function stop() {
    playing = false;
    if (timerID) { clearTimeout(timerID); timerID = 0; }
    $('playBtn').textContent = 'Start';
    paintBeats(-1);
  }

  function paintBeats(on) {
    var n = beatsOf(settings.sig);
    var box = $('beats');
    if (box.childNodes.length !== n) {
      box.innerHTML = '';
      for (var i = 0; i < n; i++) {
        var s = document.createElement('span');
        box.appendChild(s);
      }
    }
    for (var j = 0; j < box.childNodes.length; j++) {
      var el = box.childNodes[j];
      el.className = '';
      if (j === on) el.className = j === 0 ? 'on accent' : 'on';
    }
  }

  function readUi() {
    settings.tempo = parseInt($('tempo').value, 10) || 120;
    settings.vol = parseInt($('vol').value, 10);
    if (settings.vol < 0) settings.vol = 0;
    if (settings.vol > 100) settings.vol = 100;
    var sig = document.querySelector('input[name=sig]:checked');
    settings.sig = sig ? sig.value : '4/4';
  }

  function writeUi() {
    applying = true;
    $('tempo').value = settings.tempo;
    $('bpm').textContent = String(settings.tempo);
    $('vol').value = settings.vol;
    var radios = document.querySelectorAll('input[name=sig]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].checked = radios[i].value === settings.sig;
    }
    applying = false;
    paintBeats(playing ? lastDrawn : -1);
  }

  function applyVol() {
    if (gain) gain.gain.value = settings.vol / 100;
  }

  function applyRemote(row) {
    if (!row) return;
    applying = true;
    settings.tempo = row.tempo >= 30 && row.tempo <= 240 ? row.tempo : 120;
    settings.sig = BEATS[row.sig] ? row.sig : '4/4';
    settings.vol = row.vol == null ? 80 : row.vol;
    writeUi();
    applying = false;
    applyVol();
  }

  function onChange() {
    if (applying) return;
    if (root.MetroMp && root.MetroMp.guest) return;
    readUi();
    $('bpm').textContent = String(settings.tempo);
    applyVol();
    paintBeats(playing ? lastDrawn : -1);
    persist();
    if (root.MetroMp) root.MetroMp.publish();
  }

  function tapTempo() {
    var now = Date.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length < 2) return;
    if (taps.length > 6) taps.shift();
    var sum = 0;
    for (var i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
    var avg = sum / (taps.length - 1);
    var bpm = Math.round(60000 / avg);
    if (bpm < 30) bpm = 30;
    if (bpm > 240) bpm = 240;
    $('tempo').value = bpm;
    onChange();
  }

  function loadSave() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (!r || r.id !== 'last') return;
        if (r.tempo >= 30 && r.tempo <= 240) settings.tempo = r.tempo;
        if (BEATS[r.sig]) settings.sig = r.sig;
        if (r.vol >= 0 && r.vol <= 100) settings.vol = r.vol;
      });
    }).catch(function () {});
  }

  function boot() {
    writeUi();
    $('tempo').addEventListener('input', onChange);
    $('vol').addEventListener('input', onChange);
    var radios = document.querySelectorAll('input[name=sig]');
    for (var i = 0; i < radios.length; i++) radios[i].addEventListener('change', onChange);
    $('playBtn').addEventListener('click', function () {
      try {
        if (playing) stop();
        else start();
      } catch (e) {
        $('meet').textContent = String(e && e.message || e);
      }
    });
    $('tapBtn').addEventListener('click', tapTempo);
    var Mp = root.MetroMp;
    if (Mp) {
      Mp.getState = function () { return settings; };
      Mp.onRemote = applyRemote;
      Mp.onHost = function () {};
      Mp.onStatus = function (text, isGuest) {
        var el = $('meet');
        el.textContent = text;
        el.classList.toggle('live', !!isGuest);
      };
      Mp.watch();
    } else if ($('meet')) {
      $('meet').textContent = 'Press Invite (top bar) to show these numbers in a meeting. Each device plays its own click.';
    }
  }

  root.MetronomeApp = {
    beatsOf: beatsOf,
    nextSeconds: function (tempo, sig) {
      var secondsPerBeat = 60.0 / tempo;
      if (sig === '6/8') secondsPerBeat = 60.0 / tempo / 2;
      return secondsPerBeat;
    }
  };

  if ($('tempo')) {
    loadSave().then(boot);
    root.addEventListener('pagehide', function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
      persist(true);
      stop();
    });
  }
})(window);
