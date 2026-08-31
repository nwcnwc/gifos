/*
 * ffmpeg.wasm Studio — drop a file, pick a job, run, save.
 * Persistence is gifos.db. The converter never leaves this device.
 */
(function () {
  'use strict';

  var MAX_IN = 80 * 1024 * 1024;
  var MAX_KEEP = 12 * 1024 * 1024;
  var HIST_KEEP = 12;
  var E = window.FFmpegStudio;
  var $ = function (id) { return document.getElementById(id); };

  var JOBS = [
    { id: 'trim', label: 'Trim' },
    { id: 'mp3', label: 'To MP3' },
    { id: 'gif', label: 'To GIF' },
    { id: 'mp4', label: 'To MP4' },
    { id: 'audio', label: 'Extract audio' },
    { id: 'custom', label: 'Custom' }
  ];

  var S = {
    file: null,
    bytes: null,
    name: '',
    ext: 'mp4',
    size: 0,
    duration: null,
    job: 'trim',
    busy: false,
    out: null,
    outUrl: null,
    inPath: null
  };

  var logs = [];

  function setStatus(msg, kind) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }
  function setEngine(html) {
    var el = $('engine');
    if (el) el.innerHTML = html || '';
  }
  function setBar(frac) {
    var bar = $('bar'), fill = $('barfill');
    if (!bar || !fill) return;
    if (frac == null) { bar.classList.remove('on'); fill.style.width = '0'; return; }
    bar.classList.add('on');
    fill.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
  }
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }
  function pad2(n) { n = n | 0; return n < 10 ? '0' + n : String(n); }
  function formatTime(sec) {
    if (sec == null || !isFinite(sec)) return '';
    if (sec < 0) sec = 0;
    var s = Math.floor(sec % 60);
    var m = Math.floor(sec / 60) % 60;
    var h = Math.floor(sec / 3600);
    var frac = sec - Math.floor(sec);
    var tail = frac >= 0.05 ? ('.' + Math.round(frac * 10)) : '';
    if (h) return h + ':' + pad2(m) + ':' + pad2(s) + tail;
    return m + ':' + pad2(s) + tail;
  }
  function parseTime(str) {
    if (str == null) return null;
    var t = String(str).trim();
    if (!t) return null;
    if (/^\d+(\.\d+)?$/.test(t)) return parseFloat(t);
    var p = t.split(':');
    if (p.length === 2) return (+p[0]) * 60 + parseFloat(p[1]);
    if (p.length === 3) return (+p[0]) * 3600 + (+p[1]) * 60 + parseFloat(p[2]);
    return null;
  }
  function extOf(name) {
    var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }
  function baseOf(name) {
    var n = String(name || 'clip');
    var i = n.lastIndexOf('.');
    return i > 0 ? n.slice(0, i) : n;
  }
  function safeName(n) {
    return String(n || 'file').replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '') || 'file';
  }
  function mimeOf(ext) {
    ext = String(ext || '').toLowerCase();
    if (ext === 'mp3') return 'audio/mpeg';
    if (ext === 'wav') return 'audio/wav';
    if (ext === 'aac' || ext === 'm4a') return 'audio/mp4';
    if (ext === 'ogg') return 'audio/ogg';
    if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
    if (ext === 'webm') return 'video/webm';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'mkv') return 'video/x-matroska';
    if (ext === 'mov') return 'video/quicktime';
    return 'application/octet-stream';
  }
  function kindOf(mime) {
    if ((mime || '').indexOf('audio/') === 0) return 'audio';
    if ((mime || '').indexOf('image/') === 0) return 'image';
    return 'video';
  }

  function logLine(d) {
    var msg = (d && d.message) || String(d || '');
    if (!msg) return;
    logs.push(msg);
    if (logs.length > 200) logs = logs.slice(-160);
    var el = $('log');
    if (el) {
      el.textContent = logs.slice(-80).join('\n');
      el.scrollTop = el.scrollHeight;
    }
    if (S.duration == null) {
      var m = msg.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) {
        S.duration = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
        paintFile();
      }
    }
  }

  function paintJobs() {
    var box = $('jobs');
    box.innerHTML = '';
    JOBS.forEach(function (j) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = j.label;
      b.className = S.job === j.id ? 'on' : '';
      b.setAttribute('aria-selected', S.job === j.id ? 'true' : 'false');
      b.onclick = function () { S.job = j.id; paintJobs(); paintFields(); savePrefs(); };
      box.appendChild(b);
    });
  }

  function paintFields() {
    var box = $('fields');
    box.innerHTML = '';
    function field(html) {
      var w = document.createElement('div');
      w.innerHTML = html;
      while (w.firstChild) box.appendChild(w.firstChild);
    }
    if (S.job === 'trim') {
      field('<label>Start <input id="f_start" type="text" inputmode="decimal" placeholder="0:00" value="0:00"></label>');
      field('<label>End <input id="f_end" type="text" inputmode="decimal" placeholder="end" value="' +
        (S.duration ? formatTime(S.duration) : '') + '"></label>');
      field('<label class="chk"><input id="f_copy" type="checkbox" checked> Copy (fast, no re-encode)</label>');
      field('<p class="note">Copy keeps the original quality. Turn it off if a player will not open the cut.</p>');
    } else if (S.job === 'mp3') {
      field('<label>Quality <input id="f_q" type="number" min="0" max="9" value="2"></label>');
      field('<p class="note">VBR 0 is best / largest, 9 is smallest. 2 is a good default.</p>');
    } else if (S.job === 'gif') {
      field('<label>Width <input id="f_width" type="number" min="80" max="720" value="320"></label>');
      field('<label>FPS <input id="f_fps" type="number" min="4" max="24" value="12"></label>');
      field('<label>Seconds <input id="f_t" type="number" min="1" max="30" value="8"></label>');
      field('<p class="note">GIFs get huge. This job uses the first 8 seconds unless you change it.</p>');
    } else if (S.job === 'mp4') {
      field('<label>CRF <input id="f_crf" type="number" min="18" max="36" value="28"></label>');
      field('<p class="note">Lower is better / larger. 28 plus the fast preset is the phone-friendly default. Re-encoding is slow.</p>');
    } else if (S.job === 'audio') {
      field('<label>Format <select id="f_afmt"><option value="mp3" selected>MP3</option><option value="wav">WAV</option></select></label>');
    } else if (S.job === 'custom') {
      field('<textarea id="f_args" spellcheck="false" placeholder="-vn -c:a libmp3lame -q:a 2 out.mp3">-vn -c:a libmp3lame -q:a 2 out.mp3</textarea>');
      field('<p class="note">After the input. Last word is the output filename. Do not add <code>-i</code>.</p>');
    }
  }

  function val(id, fallback) {
    var el = $(id);
    if (!el) return fallback;
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  }

  function splitArgs(s) {
    var out = [], cur = '', q = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (q) {
        if (c === q) q = '';
        else cur += c;
      } else if (c === '"' || c === '\'') {
        q = c;
      } else if (/\s/.test(c)) {
        if (cur) { out.push(cur); cur = ''; }
      } else cur += c;
    }
    if (cur) out.push(cur);
    return out;
  }

  function outNameFor(ext) {
    return safeName(baseOf(S.name)) + '-' + S.job + '.' + ext;
  }

  function buildArgs(inPath) {
    var outPath, args;
    if (S.job === 'trim') {
      var start = val('f_start', '0:00');
      var end = val('f_end', '');
      var copy = val('f_copy', true);
      var ext = S.ext || 'mp4';
      if (ext === 'mov') ext = 'mp4';
      outPath = outNameFor(ext);
      var hasStart = start && start !== '0:00' && start !== '0' && start !== '0:0';
      args = [];
      // Input-side -ss/-to so End is a timestamp on the source, not a duration.
      if (hasStart) args.push('-ss', start);
      if (end) args.push('-to', end);
      args.push('-i', inPath);
      if (copy) args.push('-c', 'copy', '-avoid_negative_ts', 'make_zero');
      else args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac');
      args.push('-y', outPath);
    } else if (S.job === 'mp3') {
      outPath = outNameFor('mp3');
      args = ['-i', inPath, '-vn', '-c:a', 'libmp3lame', '-q:a', String(val('f_q', '2') || '2'), '-y', outPath];
    } else if (S.job === 'gif') {
      outPath = outNameFor('gif');
      var w = Math.max(80, Math.min(720, val('f_width', '320') | 0 || 320));
      var fps = Math.max(4, Math.min(24, val('f_fps', '12') | 0 || 12));
      var t = Math.max(1, Math.min(30, val('f_t', '8') | 0 || 8));
      var vf = 'fps=' + fps + ',scale=' + w + ':-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse';
      args = ['-t', String(t), '-i', inPath, '-vf', vf, '-loop', '0', '-y', outPath];
    } else if (S.job === 'mp4') {
      outPath = outNameFor('mp4');
      var crf = Math.max(18, Math.min(36, val('f_crf', '28') | 0 || 28));
      args = ['-i', inPath, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', String(crf),
        '-c:a', 'aac', '-movflags', '+faststart', '-y', outPath];
    } else if (S.job === 'audio') {
      var af = val('f_afmt', 'mp3') || 'mp3';
      outPath = outNameFor(af);
      if (af === 'wav') args = ['-i', inPath, '-vn', '-c:a', 'pcm_s16le', '-y', outPath];
      else args = ['-i', inPath, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', '-y', outPath];
    } else if (S.job === 'custom') {
      var rest = splitArgs(val('f_args', '') || '');
      if (!rest.length) throw new Error('Type the rest of the command, ending with an output filename.');
      outPath = safeName(rest[rest.length - 1]);
      if (outPath.indexOf('/') !== -1 || outPath === 'input' || outPath.indexOf('..') !== -1) {
        throw new Error('Output filename must be a plain name, no folders.');
      }
      rest = rest.slice(0, -1);
      args = ['-i', inPath].concat(rest).concat(['-y', outPath]);
    } else {
      throw new Error('Unknown job.');
    }
    return { args: args, outPath: outPath };
  }

  function paintFile() {
    var el = $('filemeta');
    if (!S.file) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    var bits = [S.name, fmtBytes(S.size)];
    if (S.duration != null) bits.push(formatTime(S.duration));
    el.innerHTML = '<div>' + escapeHtml(bits[0]) + '</div><div class="k">' +
      bits.slice(1).map(escapeHtml).join(' · ') + '</div>';
    $('run').disabled = !S.file || S.busy;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function clearOut() {
    if (S.outUrl) { try { URL.revokeObjectURL(S.outUrl); } catch (e) {} }
    S.outUrl = null;
    S.out = null;
    $('outcard').hidden = true;
    $('preview').hidden = true;
    $('preview').innerHTML = '';
  }

  function showOut(bytes, name, mime) {
    clearOut();
    S.out = { bytes: bytes, name: name, mime: mime, size: bytes.byteLength || bytes.length };
    var blob = new Blob([bytes], { type: mime });
    S.outUrl = URL.createObjectURL(blob);
    var box = $('preview');
    var k = kindOf(mime);
    if (k === 'video') {
      box.innerHTML = '<video controls playsinline src="' + S.outUrl + '"></video>';
      box.hidden = false;
    } else if (k === 'audio') {
      box.innerHTML = '<audio controls src="' + S.outUrl + '"></audio>';
      box.hidden = false;
    } else if (k === 'image') {
      box.innerHTML = '<img alt="" src="' + S.outUrl + '">';
      box.hidden = false;
    }
    $('outmeta').textContent = name + ' · ' + fmtBytes(S.out.size);
    $('outcard').hidden = false;
  }

  function takeFile(file) {
    if (!file) return;
    if (file.size > MAX_IN) {
      setStatus('This file is ' + fmtBytes(file.size) + '. The converter runs in this browser and files over ' +
        fmtBytes(MAX_IN) + ' usually run out of memory. Pick a shorter clip.', 'err');
      return;
    }
    S.file = file;
    S.name = file.name || 'clip';
    S.ext = extOf(S.name) || 'mp4';
    S.size = file.size;
    S.duration = null;
    S.bytes = null;
    S.inPath = null;
    clearOut();
    paintFile();
    setStatus('Reading ' + S.name + '…');
    var reader = new FileReader();
    reader.onload = function () {
      S.bytes = new Uint8Array(reader.result);
      setStatus('Ready. Pick a job and Run.');
      $('run').disabled = S.busy;
      loadEngine().then(probe).catch(function (e) {
        setStatus(e.message || String(e), 'err');
      });
    };
    reader.onerror = function () { setStatus('Could not read that file.', 'err'); };
    reader.readAsArrayBuffer(file);
  }

  function loadEngine() {
    return E.load(function (note) { setStatus(note); }).then(function () {
      setEngine('<b>ffmpeg</b> ready · on this device');
    });
  }

  function inPath() {
    return 'input.' + (S.ext || 'bin');
  }

  function probe() {
    if (!S.bytes || !E.isLoaded()) return Promise.resolve();
    var path = inPath();
    setStatus('Reading duration…');
    return E.write(path, S.bytes).then(function () {
      S.inPath = path;
      return E.exec(['-hide_banner', '-i', path]);
    }).then(function () {
      setStatus('Ready. Pick a job and Run.');
    }, function () {
      // ffmpeg -i always exits non-zero; duration comes from the log.
      setStatus('Ready. Pick a job and Run.');
    });
  }

  function cleanupFs(paths) {
    var p = Promise.resolve();
    (paths || []).forEach(function (n) {
      p = p.then(function () { return E.unlink(n); });
    });
    return p;
  }

  function runJob() {
    if (!S.file || !S.bytes || S.busy) return;
    var built;
    try { built = buildArgs(inPath()); }
    catch (e) { setStatus(e.message || String(e), 'err'); return; }
    S.busy = true;
    $('run').disabled = true;
    logs = [];
    $('log').textContent = '';
    setBar(0.02);
    setStatus('Running ' + S.job + '…');
    var t0 = Date.now();
    var outPath = built.outPath;
    var path = inPath();

    loadEngine().then(function () {
      if (!S.inPath) return E.write(path, S.bytes).then(function () { S.inPath = path; });
    }).then(function () {
      setBar(0.08);
      return E.exec(built.args);
    }).then(function (code) {
      if (code && code !== 0) throw new Error('ffmpeg exited ' + code + '. Open Log for the reason.');
      return E.read(outPath);
    }).then(function (data) {
      var u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
      var copy = new Uint8Array(u8.byteLength);
      copy.set(u8);
      var ext = extOf(outPath) || 'bin';
      showOut(copy, outPath, mimeOf(ext));
      var ms = Date.now() - t0;
      setStatus('Done in ' + (ms / 1000).toFixed(1) + 's — ' + fmtBytes(copy.byteLength) + '.', 'ok');
      setBar(1);
      remember(outPath, mimeOf(ext), copy.byteLength, ms, copy);
      return cleanupFs([outPath]);
    }).catch(function (e) {
      setStatus(e.message || String(e), 'err');
      setBar(null);
    }).then(function () {
      S.busy = false;
      $('run').disabled = !S.file;
      setTimeout(function () { setBar(null); }, 800);
    });
  }

  function downloadOut() {
    if (!S.out) return;
    var a = document.createElement('a');
    a.href = S.outUrl || URL.createObjectURL(new Blob([S.out.bytes], { type: S.out.mime }));
    a.download = S.out.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function keepOut() {
    if (!S.out) return;
    if (!window.gifos || !gifos.db) {
      setStatus('Keeping a clip needs to run inside GifOS.', 'err');
      return;
    }
    if (S.out.size > MAX_KEEP) {
      setStatus('This result is ' + fmtBytes(S.out.size) + '. Keep in this file caps at ' +
        fmtBytes(MAX_KEEP) + ' so the app stays small — Download it instead.', 'err');
      return;
    }
    var rec = {
      id: 'last',
      name: S.out.name,
      mime: S.out.mime,
      size: S.out.size,
      job: S.job,
      at: Date.now(),
      bytes: S.out.bytes
    };
    Promise.resolve(gifos.db('files').put(rec)).then(function () {
      setStatus('Kept in this file. Close it and come back still holding ' + S.out.name + '.', 'ok');
      return stashHistory(rec, true);
    }).catch(function (e) {
      setStatus(e.message || String(e), 'err');
    });
  }

  function remember(name, mime, size, ms, bytes) {
    var rec = { name: name, mime: mime, size: size, job: S.job, at: Date.now(), ms: ms };
    if (bytes && bytes.byteLength <= MAX_KEEP) rec.hasBytes = true;
    stashHistory(rec, false);
    if (window.gifos && gifos.library && gifos.library.put && bytes && bytes.byteLength <= 25 * 1024 * 1024) {
      /* optional: do not auto-deposit; Keep is explicit */
    }
  }

  function stashHistory(rec, withBytes) {
    if (!(window.gifos && gifos.db)) return Promise.resolve();
    var db = gifos.db('history');
    return Promise.resolve(db.getAll()).then(function (rows) {
      rows = (rows || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      var row = {
        id: 'h_' + Date.now(),
        name: rec.name,
        mime: rec.mime,
        size: rec.size,
        job: rec.job,
        at: rec.at || Date.now(),
        ms: rec.ms || 0,
        hasBytes: !!withBytes
      };
      return db.put(row).then(function () {
        var drop = rows.slice(HIST_KEEP - 1);
        var p = Promise.resolve();
        drop.forEach(function (d) {
          p = p.then(function () { return db.delete(d.id); });
        });
        return p;
      });
    }).catch(function () {});
  }

  function paintHistory(rows) {
    var box = $('history');
    var ul = $('histlist');
    rows = (rows || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    if (!rows.length) { box.hidden = true; ul.innerHTML = ''; return; }
    box.hidden = false;
    ul.innerHTML = '';
    rows.forEach(function (r) {
      var li = document.createElement('li');
      var left = document.createElement('span');
      left.textContent = (r.name || 'clip') + ' · ' + fmtBytes(r.size || 0);
      li.appendChild(left);
      if (r.hasBytes) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = 'Open';
        b.onclick = function () { restoreLast(); };
        li.appendChild(b);
      }
      ul.appendChild(li);
    });
  }

  function restoreLast() {
    if (!(window.gifos && gifos.db)) return;
    Promise.resolve(gifos.db('files').get('last')).then(function (row) {
      if (!row || !row.bytes) { setStatus('That clip is no longer in this file.', 'err'); return; }
      var bytes = row.bytes;
      if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
      showOut(bytes, row.name || 'clip', row.mime || 'application/octet-stream');
      setStatus('Restored ' + (row.name || 'clip') + '.', 'ok');
    }).catch(function (e) { setStatus(e.message || String(e), 'err'); });
  }

  function savePrefs() {
    if (!(window.gifos && gifos.db)) return;
    gifos.db('prefs').put({ id: 'prefs', job: S.job }).catch(function () {});
  }
  function loadPrefs() {
    if (!(window.gifos && gifos.db)) return Promise.resolve();
    return Promise.resolve(gifos.db('prefs').get('prefs')).then(function (row) {
      if (row && row.job) {
        for (var i = 0; i < JOBS.length; i++) if (JOBS[i].id === row.job) S.job = row.job;
      }
    }).catch(function () {});
  }

  function bindDrop() {
    var drop = $('drop');
    var file = $('file');
    function over(on) { drop.classList.toggle('over', !!on); }
    drop.addEventListener('click', function () { file.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
    });
    file.addEventListener('change', function () {
      if (file.files && file.files[0]) takeFile(file.files[0]);
      file.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (t) {
      drop.addEventListener(t, function (e) { e.preventDefault(); over(true); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      drop.addEventListener(t, function (e) { e.preventDefault(); over(false); });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) takeFile(f);
    });
  }

  function boot() {
    paintJobs();
    paintFields();
    bindDrop();
    $('run').addEventListener('click', runJob);
    $('clear').addEventListener('click', function () {
      S.file = null; S.bytes = null; S.duration = null; S.inPath = null;
      paintFile();
      clearOut();
      setStatus('');
      $('run').disabled = true;
    });
    $('download').addEventListener('click', downloadOut);
    $('keep').addEventListener('click', keepOut);
    if (E && E.onLog) E.onLog(logLine);
    if (E && E.onProgress) E.onProgress(function (d) {
      var p = d && typeof d.progress === 'number' ? d.progress : 0;
      setBar(0.08 + 0.9 * Math.max(0, Math.min(1, p)));
    });
    loadPrefs().then(function () { paintJobs(); paintFields(); });
    if (window.gifos && gifos.db) {
      gifos.db('history').subscribe(paintHistory);
    }
    if (window.gifos && gifos.onBack) {
      gifos.onBack(function () {
        if (!$('outcard').hidden) { clearOut(); return true; }
        if (S.file) { $('clear').click(); return true; }
        return false;
      });
    }
    setEngine('Converter loads the first time you pick a file.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
