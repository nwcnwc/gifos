/*
 * LRC Maker — load a local song, tap timings, export LRC.
 * Audio stays on this device, inside the file. Lyrics + times live with it.
 * Uses @lrc-maker/lrc-parser (MIT). Classic IIFE.
 */
(function (root) {
  'use strict';

  var P = root.lrcParser;
  var MAX_AUDIO = 8 * 1024 * 1024;

  function fmt(t) {
    if (t == null || !isFinite(t)) return '--:--.--';
    if (!P || !P.convertTimeToTag) {
      var m = Math.floor(t / 60), s = (t % 60).toFixed(2);
      return (m < 10 ? '0' : '') + m + ':' + (t % 60 < 10 ? '0' : '') + s;
    }
    return P.convertTimeToTag(t, 2, false);
  }

  function parseText(text) {
    text = String(text || '');
    var info = {};
    var lines;
    if (P && P.parser && /\[/.test(text)) {
      var st = P.parser(text, { trimStart: true, trimEnd: true });
      lines = st.lyric.map(function (l) { return { time: l.time, text: l.text }; });
      if (st.info && typeof st.info.forEach === 'function') {
        st.info.forEach(function (v, k) { info[k] = v; });
      }
      if (!lines.length) lines = text.split(/\r?\n/).map(function (s) { return { text: s }; });
    } else {
      lines = text.split(/\r?\n/).map(function (s) { return { text: s }; });
    }
    return { lines: lines, info: info };
  }

  function infoMap(info) {
    var m = new Map();
    if (!info) return m;
    Object.keys(info).forEach(function (k) { if (info[k]) m.set(k, info[k]); });
    return m;
  }

  function exportText(lines, info) {
    if (!P || !P.stringify) return '';
    return P.stringify({ info: infoMap(info), lyric: lines }, { spaceStart: 0, spaceEnd: 0, fixed: 2, endOfLine: '\n' });
  }

  function stampLine(lines, i, t) {
    if (!lines.length || i < 0 || i >= lines.length) return i;
    lines[i].time = t;
    return i < lines.length - 1 ? i + 1 : i;
  }

  function unstampLine(lines, i) {
    if (!lines.length || i < 0 || i >= lines.length) return i;
    lines[i].time = undefined;
    return i;
  }

  /* Last stamped line whose time is <= t. -1 if none. */
  function singingAt(lines, t) {
    var hit = -1;
    if (t == null || !isFinite(t)) return hit;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].time != null && isFinite(lines[i].time) && lines[i].time <= t) hit = i;
    }
    return hit;
  }

  function persistRecord(state) {
    var rec = {
      id: 'lrc',
      lines: state.lines || [],
      cur: state.cur || 0,
      info: state.info || {}
    };
    var bytes = state.audioBytes;
    var n = bytes && (bytes.byteLength || bytes.length) || 0;
    rec.audioTooBig = n > MAX_AUDIO;
    if (n && n <= MAX_AUDIO) {
      rec.audioName = state.audioName || '';
      rec.audioMime = state.audioMime || 'audio/mpeg';
      rec.audioBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    }
    return rec;
  }

  root.LRCCore = {
    MAX_AUDIO: MAX_AUDIO,
    fmt: fmt,
    parseText: parseText,
    exportText: exportText,
    stampLine: stampLine,
    unstampLine: unstampLine,
    singingAt: singingAt,
    persistRecord: persistRecord
  };

  var api = root.gifos || null;
  var saveDb = null;
  var saveTimer = 0;
  var audio = typeof Audio === 'function' ? new Audio() : { currentTime: 0, paused: true, duration: 0 };
  var lines = [];
  var cur = 0;
  var info = {};
  var objectUrl = null;
  var audioBytes = null;
  var audioName = '';
  var audioMime = '';
  var seeking = false;
  var $ = function (id) { return document.getElementById(id); };

  function showErr(msg) {
    var el = $('err');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = String(msg);
  }

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put(persistRecord({
        lines: lines, cur: cur, info: info,
        audioBytes: audioBytes, audioName: audioName, audioMime: audioMime
      })).catch(function () {});
    }, 250);
  }

  function setEditor(on) {
    var ed = $('editor');
    if (!ed) return;
    ed.hidden = !on;
    var b = $('editBtn');
    if (b) b.textContent = on ? 'Hide lyrics' : 'Edit lyrics';
    if (on) {
      var ta = $('lyrics');
      if (ta && ta.focus) setTimeout(function () { ta.focus(); }, 0);
    }
  }

  function render() {
    var box = $('lines');
    if (!box) return;
    var t = audio.currentTime || 0;
    var sing = (!audio.paused) ? singingAt(lines, t) : -1;
    var html = '';
    lines.forEach(function (ln, i) {
      var cls = [];
      if (i === cur) cls.push('on');
      if (ln.time != null) cls.push('timed');
      if (i === sing) cls.push('sing');
      html += '<li class="' + cls.join(' ') +
        '" data-i="' + i + '"><span class="t">' + fmt(ln.time) + '</span><span class="x">' +
        String(ln.text || '').replace(/[&<>]/g, function (c) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
        }) + '</span></li>';
    });
    if (!lines.length) {
      html = '<li class="empty" id="emptyHint">Paste lyrics, then tap Stamp as the line is sung.</li>';
    }
    box.innerHTML = html;
    var on = box.querySelector('.sing') || box.querySelector('.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    $('clock').textContent = fmt(t);
    var seek = $('seek');
    if (seek && !seeking) {
      var dur = audio.duration;
      if (isFinite(dur) && dur > 0) {
        seek.disabled = false;
        seek.max = String(dur);
        seek.value = String(t);
      }
    }
    var stamp = $('stampBtn');
    if (stamp) stamp.disabled = !lines.length;
    var play = $('playBtn');
    if (play) play.disabled = !audio.src;
  }

  function applyParsed(parsed) {
    lines = parsed.lines || [];
    info = parsed.info || {};
    cur = 0;
    var text = lines.map(function (l) { return l.text || ''; }).join('\n');
    if ($('lyrics') && $('lyrics').value !== text) $('lyrics').value = text;
    render(); persist();
  }

  function stamp() {
    if (!lines.length) {
      showErr('Paste lyrics first, then Stamp as each line is sung.');
      setEditor(true);
      return;
    }
    showErr('');
    setEditor(false);
    var t = audio.currentTime || 0;
    if (root.LRMp && root.LRMp.onStamp && root.LRMp.onStamp(cur, t)) return;
    cur = stampLine(lines, cur, t);
    render(); persist();
  }

  function unstamp() {
    if (!lines.length) return;
    cur = unstampLine(lines, cur);
    render(); persist();
  }

  function exportLrc() {
    if (!lines.length) {
      showErr('Nothing to export yet. Paste lyrics and stamp a few lines.');
      setEditor(true);
      return;
    }
    showErr('');
    var text = exportText(lines, info);
    var blob = new Blob([text], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var base = (audioName || 'lyrics').replace(/\.[^.]+$/, '');
    a.download = base + '.lrc';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function setAudioFromBlob(blob, name, mime, bytes) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    audio.src = objectUrl;
    audio.load();
    audioName = name || 'song';
    audioMime = mime || blob.type || 'audio/mpeg';
    audioBytes = bytes || null;
    var note = audioName;
    if (bytes && bytes.byteLength > MAX_AUDIO) {
      note += ' — too large to keep in the file (8 MB). Pick it again next time.';
    } else if (bytes) {
      note += ' — kept in this file.';
    }
    $('track').textContent = note;
    render(); persist();
  }

  function loadAudio(file) {
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      var buf = r.result;
      var bytes = new Uint8Array(buf);
      var blob = new Blob([bytes], { type: file.type || 'audio/mpeg' });
      setAudioFromBlob(blob, file.name, file.type || 'audio/mpeg', bytes);
    };
    r.onerror = function () { showErr('Could not read that audio file.'); };
    r.readAsArrayBuffer(file);
  }

  function bind() {
    $('audioFile').addEventListener('change', function () {
      if (this.files && this.files[0]) loadAudio(this.files[0]);
      this.value = '';
    });
    $('lrcFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        applyParsed(parseText(String(r.result || '')));
        setEditor(false);
      };
      r.readAsText(f);
    });
    $('playBtn').addEventListener('click', function (e) {
      e.preventDefault();
      if (!audio.src) { showErr('Pick a song first.'); return; }
      if (audio.paused) audio.play().catch(function (err) { showErr((err && err.message) || 'Could not play.'); });
      else audio.pause();
    });
    $('stampBtn').addEventListener('click', function (e) { e.preventDefault(); stamp(); });
    $('backBtn').addEventListener('click', function (e) { e.preventDefault(); audio.currentTime = Math.max(0, (audio.currentTime || 0) - 5); render(); });
    $('fwdBtn').addEventListener('click', function (e) { e.preventDefault(); audio.currentTime = (audio.currentTime || 0) + 5; render(); });
    $('exportBtn').addEventListener('click', function (e) { e.preventDefault(); exportLrc(); });
    $('editBtn').addEventListener('click', function (e) {
      e.preventDefault();
      setEditor($('editor').hidden);
    });
    var ta = $('lyrics');
    var lyricTimer = 0;
    function ingestLyrics() { applyParsed(parseText(ta.value)); }
    ta.addEventListener('input', function () {
      clearTimeout(lyricTimer);
      lyricTimer = setTimeout(ingestLyrics, 200);
    });
    ta.addEventListener('change', function () { ingestLyrics(); if (lines.length) setEditor(false); });
    $('lines').addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('#emptyHint')) { setEditor(true); return; }
      var li = e.target.closest('li[data-i]');
      if (!li) return;
      cur = parseInt(li.getAttribute('data-i'), 10) || 0;
      if (lines[cur] && lines[cur].time != null) audio.currentTime = lines[cur].time;
      render();
    });
    $('seek').addEventListener('input', function () {
      seeking = true;
      audio.currentTime = parseFloat(this.value) || 0;
      $('clock').textContent = fmt(audio.currentTime || 0);
    });
    $('seek').addEventListener('change', function () {
      seeking = false;
      audio.currentTime = parseFloat(this.value) || 0;
      render();
    });
    audio.addEventListener('timeupdate', function () { render(); });
    audio.addEventListener('loadedmetadata', function () { render(); });
    audio.addEventListener('play', function () { $('playBtn').textContent = 'Pause'; render(); });
    audio.addEventListener('pause', function () { $('playBtn').textContent = 'Play'; render(); });
    document.addEventListener('keydown', function (e) {
      if (e.target && (e.target.id === 'lyrics' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
      if (e.code === 'Space') { e.preventDefault(); stamp(); }
      else if (e.code === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!audio.src) return;
        if (audio.paused) audio.play(); else audio.pause();
      }
      else if (e.code === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === 'j' || e.key === 'J') { e.preventDefault(); cur = Math.max(0, cur - 1); render(); }
      else if (e.code === 'ArrowDown' || e.key === 's' || e.key === 'S' || e.key === 'k' || e.key === 'K') { e.preventDefault(); cur = Math.min(Math.max(0, lines.length - 1), cur + 1); render(); }
      else if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { audio.currentTime = Math.max(0, (audio.currentTime || 0) - 5); render(); }
      else if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') { audio.currentTime = (audio.currentTime || 0) + 5; render(); }
      else if (e.code === 'Backspace' || e.code === 'Delete') { e.preventDefault(); unstamp(); }
    });
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if ($('editor') && !$('editor').hidden) { setEditor(false); return true; }
        if (root.LRMp && root.LRMp.busy && root.LRMp.busy()) { root.LRMp.leave(); return true; }
        return false;
      });
    }
  }

  function boot() {
    if (typeof document === 'undefined' || !document.getElementById || !document.getElementById('shell')) return;
    bind();
    render();
    setEditor(false);
    if (!api || !api.db) return;
    saveDb = api.db('save');
    saveDb.get('lrc').then(function (row) {
      if (!row || (root.LRMp && root.LRMp.busy && root.LRMp.busy())) return;
      if (row.lines) lines = row.lines;
      cur = row.cur || 0;
      info = row.info || {};
      var text = lines.map(function (l) { return l.text || ''; }).join('\n');
      if ($('lyrics').value !== text) $('lyrics').value = text;
      if (row.audioBytes && row.audioBytes.byteLength) {
        var bytes = row.audioBytes instanceof Uint8Array ? row.audioBytes : new Uint8Array(row.audioBytes);
        audioBytes = bytes;
        var blob = new Blob([bytes], { type: row.audioMime || 'audio/mpeg' });
        setAudioFromBlob(blob, row.audioName || 'song', row.audioMime || 'audio/mpeg', bytes);
      } else if (row.audioTooBig || row.audioName) {
        $('track').textContent = (row.audioName || 'Last song') + ' was too large to keep. Pick it again.';
      }
      render();
    }).catch(function () {});
  }

  root.LRCApp = {
    persist: persist, render: render,
    getLines: function () { return lines; },
    setLines: function (ls, c) { lines = ls || []; cur = c || 0; render(); persist(); },
    stampAt: function (i, t) { if (lines[i]) { lines[i].time = t; if (i === cur && cur < lines.length - 1) cur += 1; render(); persist(); } }
  };
  boot();
})(typeof window !== 'undefined' ? window : this);
