/*
 * LRC Maker — load a local song, tap timings, export LRC.
 * Audio stays on this device. Lyrics + times live in the file.
 * Uses @lrc-maker/lrc-parser (MIT). Classic IIFE.
 */
(function (root) {
  'use strict';

  var P = root.lrcParser;
  var api = root.gifos || null;
  var saveDb = null;
  var saveTimer = 0;
  var audio = new Audio();
  var lines = [];
  var cur = 0;
  var objectUrl = null;
  var $ = function (id) { return document.getElementById(id); };

  function fmt(t) {
    if (t == null || !isFinite(t)) return '--:--.--';
    return P.convertTimeToTag(t, 2, false);
  }

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put({ id: 'lrc', lines: lines, cur: cur }).catch(function () {});
    }, 250);
  }

  function render() {
    var box = $('lines');
    var html = '';
    lines.forEach(function (ln, i) {
      html += '<li class="' + (i === cur ? 'on' : '') + (ln.time != null ? ' timed' : '') +
        '" data-i="' + i + '"><span class="t">' + fmt(ln.time) + '</span><span class="x">' +
        String(ln.text || '').replace(/[&<>]/g, function (c) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
        }) + '</span></li>';
    });
    box.innerHTML = html || '<li class="empty">Paste lyrics, then tap Stamp as the line is sung.</li>';
    var on = box.querySelector('.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    $('clock').textContent = fmt(audio.currentTime || 0);
  }

  function parseLyrics(text) {
    if (P && P.parser && /\[\d/.test(text)) {
      var st = P.parser(text, { trimStart: true, trimEnd: true });
      lines = st.lyric.map(function (l) { return { time: l.time, text: l.text }; });
      if (!lines.length) lines = text.split(/\r?\n/).map(function (s) { return { text: s }; });
    } else {
      lines = String(text || '').split(/\r?\n/).map(function (s) { return { text: s }; });
    }
    cur = 0;
    render(); persist();
  }

  function stamp() {
    if (!lines.length) return;
    if (root.LRMp && root.LRMp.onStamp && root.LRMp.onStamp(cur, audio.currentTime)) return;
    lines[cur].time = audio.currentTime || 0;
    if (cur < lines.length - 1) cur += 1;
    render(); persist();
  }

  function unstamp() {
    if (!lines.length) return;
    lines[cur].time = undefined;
    render(); persist();
  }

  function exportLrc() {
    if (!P || !P.stringify) return;
    var text = P.stringify({ info: new Map(), lyric: lines }, { spaceStart: 0, spaceEnd: 0, fixed: 2, endOfLine: '\n' });
    var blob = new Blob([text], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lyrics.lrc';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function loadAudio(file) {
    if (!file) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    audio.load();
    $('track').textContent = file.name;
  }

  function bind() {
    $('audioFile').addEventListener('change', function () {
      if (this.files && this.files[0]) loadAudio(this.files[0]);
      this.value = '';
    });
    $('playBtn').addEventListener('click', function (e) {
      e.preventDefault();
      if (audio.paused) audio.play(); else audio.pause();
    });
    $('stampBtn').addEventListener('click', function (e) { e.preventDefault(); stamp(); });
    $('backBtn').addEventListener('click', function (e) { e.preventDefault(); audio.currentTime = Math.max(0, (audio.currentTime || 0) - 5); });
    $('fwdBtn').addEventListener('click', function (e) { e.preventDefault(); audio.currentTime = (audio.currentTime || 0) + 5; });
    $('exportBtn').addEventListener('click', function (e) { e.preventDefault(); exportLrc(); });
    $('lyrics').addEventListener('change', function () { parseLyrics(this.value); });
    $('lines').addEventListener('click', function (e) {
      var li = e.target.closest('li[data-i]');
      if (!li) return;
      cur = parseInt(li.getAttribute('data-i'), 10) || 0;
      if (lines[cur] && lines[cur].time != null) audio.currentTime = lines[cur].time;
      render();
    });
    audio.addEventListener('timeupdate', function () { $('clock').textContent = fmt(audio.currentTime || 0); });
    audio.addEventListener('play', function () { $('playBtn').textContent = 'Pause'; });
    audio.addEventListener('pause', function () { $('playBtn').textContent = 'Play'; });
    document.addEventListener('keydown', function (e) {
      if (e.target && (e.target.id === 'lyrics' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
      if (e.code === 'Space') { e.preventDefault(); stamp(); }
      else if (e.code === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (audio.paused) audio.play(); else audio.pause(); }
      else if (e.code === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === 'j' || e.key === 'J') { e.preventDefault(); cur = Math.max(0, cur - 1); render(); }
      else if (e.code === 'ArrowDown' || e.key === 's' || e.key === 'S' || e.key === 'k' || e.key === 'K') { e.preventDefault(); cur = Math.min(lines.length - 1, cur + 1); render(); }
      else if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { audio.currentTime = Math.max(0, (audio.currentTime || 0) - 5); }
      else if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') { audio.currentTime = (audio.currentTime || 0) + 5; }
      else if (e.code === 'Backspace' || e.code === 'Delete') { e.preventDefault(); unstamp(); }
    });
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (root.LRMp && root.LRMp.busy && root.LRMp.busy()) { root.LRMp.leave(); return true; }
        return false;
      });
    }
  }

  function boot() {
    bind();
    render();
    if (!api || !api.db) return;
    saveDb = api.db('save');
    saveDb.get('lrc').then(function (row) {
      if (!row || (root.LRMp && root.LRMp.busy && root.LRMp.busy())) return;
      if (row.lines) lines = row.lines;
      cur = row.cur || 0;
      var text = lines.map(function (l) { return l.text || ''; }).join('\n');
      if ($('lyrics').value !== text) $('lyrics').value = text;
      render();
    }).catch(function () {});
  }

  root.LRCApp = {
    persist: persist, render: render,
    getLines: function () { return lines; },
    setLines: function (ls, c) { lines = ls || []; cur = c || 0; render(); },
    stampAt: function (i, t) { if (lines[i]) { lines[i].time = t; if (i === cur && cur < lines.length - 1) cur += 1; render(); } }
  };
  boot();
})(window);
