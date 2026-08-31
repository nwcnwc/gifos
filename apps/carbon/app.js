/*
 * Carbon — GifOS shell. Themes from upstream; the snippet lives in the file.
 * Classic IIFE. No fetch, no eval.
 */
(function (root) {
  'use strict';

  var MAX = 20000;
  var RECENT_N = 24;
  var api = root.gifos || null;
  var saveDb = null;
  var recentsDb = null;
  var saveTimer = 0;
  var paintTimer = 0;
  var applying = false;
  var sheet = '';

  var S = {
    code: '',
    theme: 'seti',
    language: 'auto',
    bg: 'rgba(171, 184, 195, 1)',
    padding: 56,
    dropShadow: true,
    windowControls: true,
    windowTheme: 'none',
    lineNumbers: false,
    fontSize: 14,
    width: 680,
    autoWidth: true,
    title: '',
    scale: 2
  };

  var $ = function (id) { return document.getElementById(id); };

  function themes() { return (root.CarbonThemes && root.CarbonThemes.list) || []; }
  function syn() { return root.CarbonSyntax; }
  function themeOf() {
    return root.CarbonThemes ? root.CarbonThemes.byId(S.theme) : null;
  }

  function say(msg, err) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (err ? ' err' : '');
  }

  function meetSay(msg) {
    var el = $('meet');
    if (!el) return;
    el.textContent = msg || '';
  }

  function clamp(n, a, b) { n = +n; if (n < a) return a; if (n > b) return b; return n; }

  function longestLine(text) {
    var lines = String(text || '').split('\n');
    var m = 0, i;
    for (i = 0; i < lines.length; i++) if (lines[i].length > m) m = lines[i].length;
    return m;
  }

  function resolvedLang() {
    var synx = syn();
    if (S.language === 'auto' && synx) return synx.detect(S.code);
    return S.language || 'javascript';
  }

  function applyThemeVars() {
    var th = themeOf();
    var h = (th && th.highlights) || {};
    var st = document.documentElement.style;
    st.setProperty('--c-bg', h.background || '#151718');
    st.setProperty('--c-text', h.text || '#CFD2D1');
    st.setProperty('--c-variable', h.variable || h.text || '#CFD2D1');
    st.setProperty('--c-attribute', h.attribute || h.text || '#CFD2D1');
    st.setProperty('--c-definition', h.definition || h.text || '#CFD2D1');
    st.setProperty('--c-keyword', h.keyword || h.text || '#CFD2D1');
    st.setProperty('--c-operator', h.operator || h.text || '#CFD2D1');
    st.setProperty('--c-property', h.property || h.text || '#CFD2D1');
    st.setProperty('--c-number', h.number || h.text || '#CFD2D1');
    st.setProperty('--c-string', h.string || h.text || '#CFD2D1');
    st.setProperty('--c-comment', h.comment || '#888');
    st.setProperty('--c-meta', h.meta || h.text || '#CFD2D1');
    st.setProperty('--c-tag', h.tag || h.keyword || h.text || '#CFD2D1');
    st.setProperty('--bg-color', S.bg);
    st.setProperty('--pad', S.padding + 'px');
    st.setProperty('--font-size', S.fontSize + 'px');
    var w = S.autoWidth
      ? clamp(Math.round(longestLine(S.code) * (S.fontSize * 0.61) + 48 + (S.lineNumbers ? 36 : 0)), 320, 1024)
      : clamp(S.width, 320, 1280);
    st.setProperty('--win-w', w + 'px');
    document.body.classList.toggle('light', !!(th && th.light));
    document.body.classList.toggle('shadow', !!S.dropShadow);
    document.body.classList.toggle('no-chrome', !S.windowControls);
    document.body.classList.toggle('win-bw', S.windowTheme === 'bw');
    document.body.classList.toggle('win-sharp', S.windowTheme === 'sharp');
    document.body.classList.toggle('nums', !!S.lineNumbers);
  }

  function paintHl() {
    var synx = syn();
    var pre = $('hl');
    var ta = $('code');
    if (!pre || !ta) return;
    var src = ta.value;
    pre.innerHTML = synx ? synx.html(src, S.language) : escapeHtml(src);
    paintGutter(src);
  }

  function paintGutter(src) {
    var g = $('gutter');
    if (!g) return;
    if (!S.lineNumbers) { g.textContent = ''; return; }
    var n = String(src || '').split('\n').length;
    var out = '', i;
    for (i = 1; i <= n; i++) out += i + '\n';
    g.textContent = out;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function paintControls() {
    var th = S.theme;
    if ($('theme').value !== th) $('theme').value = th;
    if ($('language').value !== S.language) $('language').value = S.language;
    if ($('pad').value !== String(S.padding)) $('pad').value = S.padding;
    if ($('padVal')) $('padVal').textContent = S.padding + ' px';
    if ($('fsize').value !== String(S.fontSize)) $('fsize').value = S.fontSize;
    if ($('fsizeVal')) $('fsizeVal').textContent = S.fontSize + ' px';
    if ($('width').value !== String(S.width)) $('width').value = S.width;
    if ($('widthVal')) $('widthVal').textContent = S.width + ' px';
    $('autoW').checked = !!S.autoWidth;
    $('nums').checked = !!S.lineNumbers;
    $('chrome').checked = !!S.windowControls;
    $('shadow').checked = !!S.dropShadow;
    if ($('wtheme').value !== S.windowTheme) $('wtheme').value = S.windowTheme;
    if ($('title').value !== (S.title || '')) $('title').value = S.title || '';
    if ($('scale').value !== String(S.scale)) $('scale').value = S.scale;
    var sw = document.querySelectorAll('.swatch');
    var i;
    for (i = 0; i < sw.length; i++) {
      sw[i].classList.toggle('on', sw[i].getAttribute('data-bg') === S.bg);
    }
    var hex = rgbaToHex(S.bg);
    if ($('bgpick') && hex) $('bgpick').value = hex;
    var tl = $('title-live');
    if (tl) tl.textContent = S.title || '';
    $('window').setAttribute('aria-label', S.title || 'Code window');
  }

  function rgbaToHex(c) {
    var m = String(c).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) {
      if (/^#[0-9A-Fa-f]{6}$/.test(c)) return c;
      return '#abb8c3';
    }
    function h(n) { n = +n; var s = n.toString(16); return s.length < 2 ? '0' + s : s; }
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
  }

  function hexToRgba(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return S.bg;
    var n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', 1)';
  }

  function paint() {
    applyThemeVars();
    paintHl();
    paintControls();
    fit();
  }

  function fit() {
    var stage = $('stage');
    var frame = $('frame');
    if (!stage || !frame) return;
    frame.style.transform = 'none';
    var sw = stage.clientWidth - 16;
    var fw = frame.offsetWidth;
    var sc = fw > 0 ? Math.min(1, sw / fw) : 1;
    if (sc < 0.4) sc = 0.4;
    frame.style.transform = 'scale(' + sc + ')';
  }

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      var row = getState();
      row.id = 'current';
      saveDb.put(row).catch(function () {});
    }, 280);
  }

  function getState() {
    return {
      code: S.code,
      theme: S.theme,
      language: S.language,
      bg: S.bg,
      padding: S.padding,
      dropShadow: !!S.dropShadow,
      windowControls: !!S.windowControls,
      windowTheme: S.windowTheme,
      lineNumbers: !!S.lineNumbers,
      fontSize: S.fontSize,
      width: S.width,
      autoWidth: !!S.autoWidth,
      title: S.title || '',
      scale: S.scale
    };
  }

  function applyState(row, fromRemote) {
    if (!row) return;
    applying = true;
    if (row.code != null) S.code = String(row.code).slice(0, MAX);
    if (row.theme) S.theme = row.theme;
    if (row.language) S.language = row.language;
    if (row.bg) S.bg = row.bg;
    if (row.padding != null) S.padding = clamp(row.padding, 16, 96);
    if (row.dropShadow != null) S.dropShadow = !!row.dropShadow;
    if (row.windowControls != null) S.windowControls = !!row.windowControls;
    if (row.windowTheme) S.windowTheme = row.windowTheme;
    if (row.lineNumbers != null) S.lineNumbers = !!row.lineNumbers;
    if (row.fontSize != null) S.fontSize = clamp(row.fontSize, 12, 20);
    if (row.width != null) S.width = clamp(row.width, 320, 1280);
    if (row.autoWidth != null) S.autoWidth = !!row.autoWidth;
    if (row.title != null) S.title = String(row.title).slice(0, 80);
    if (row.scale != null) S.scale = clamp(row.scale, 1, 4);
    if ($('code').value !== S.code) $('code').value = S.code;
    paint();
    applying = false;
    persist();
  }

  function onChange() {
    if (applying) return;
    S.code = String($('code').value || '').slice(0, MAX);
    if ($('code').value !== S.code) $('code').value = S.code;
    if (paintTimer) clearTimeout(paintTimer);
    paintTimer = setTimeout(function () {
      paintTimer = 0;
      applyThemeVars();
      paintHl();
      fit();
    }, 30);
    persist();
    if (root.CarbonMp && root.CarbonMp.live) {
      if (onChange._t) clearTimeout(onChange._t);
      onChange._t = setTimeout(function () { root.CarbonMp.publish(); }, 180);
    }
  }

  function onSetting() {
    if (applying) return;
    persist();
    paint();
    if (root.CarbonMp && root.CarbonMp.live) root.CarbonMp.publish();
  }

  function openSheet(name) {
    sheet = name || '';
    $('sheet').hidden = !sheet;
    $('settings').hidden = sheet !== 'settings';
    $('recents').hidden = sheet !== 'recents';
    document.body.classList.toggle('sheet', !!sheet);
    if (sheet === 'recents') renderRecents();
  }

  function closeSheet() {
    openSheet('');
    return true;
  }

  /* ---- recents ---- */
  function recentName() {
    if (S.title && S.title.trim()) return S.title.trim().slice(0, 48);
    var line = (S.code.split('\n').filter(function (l) { return l.trim(); })[0] || 'snippet').trim();
    return line.slice(0, 48);
  }

  function keepRecent() {
    if (!recentsDb) { say('Recents need this file to save.', true); return; }
    var row = getState();
    row.id = 'r_' + Date.now();
    row.name = recentName();
    row.at = Date.now();
    recentsDb.put(row).then(function () {
      say('Kept “' + row.name + '” in recents.');
      pruneRecents();
      if (sheet === 'recents') renderRecents();
    }).catch(function (e) { say(String((e && e.message) || e), true); });
  }

  function pruneRecents() {
    if (!recentsDb) return;
    recentsDb.getAll().then(function (all) {
      all = (all || []).filter(function (r) { return r && r.id && r.id.indexOf('r_') === 0; });
      all.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      var i;
      for (i = RECENT_N; i < all.length; i++) recentsDb.delete(all[i].id).catch(function () {});
    }).catch(function () {});
  }

  function renderRecents() {
    var ul = $('recent-list');
    if (!ul) return;
    if (!recentsDb) { ul.innerHTML = '<li class="empty">Recents live in this file.</li>'; return; }
    recentsDb.getAll().then(function (all) {
      all = (all || []).filter(function (r) { return r && r.id && r.id.indexOf('r_') === 0; });
      all.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      if (!all.length) { ul.innerHTML = '<li class="empty">Nothing kept yet. Keep this snippet from the toolbar.</li>'; return; }
      var html = '', i;
      for (i = 0; i < all.length; i++) {
        var r = all[i];
        html += '<li><button type="button" class="open" data-id="' + escapeHtml(r.id) + '">' +
          '<span class="nm">' + escapeHtml(r.name || 'snippet') + '</span>' +
          '<span class="meta">' + escapeHtml(r.theme || '') + (r.language && r.language !== 'auto' ? ' · ' + r.language : '') + '</span>' +
          '</button><button type="button" class="row-del" data-del="' + escapeHtml(r.id) + '" aria-label="Remove">' +
          '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 2h4l.5 1H14v1H2V3h3.5L6 2zm1 4h1v6H7V6zm3 0h1v6h-1V6zM3 5h10l-.7 9.1A1 1 0 0 1 11.3 15H4.7a1 1 0 0 1-1-.9L3 5z"/></svg>' +
          '</button></li>';
      }
      ul.innerHTML = html;
    }).catch(function () { ul.innerHTML = '<li class="empty">Could not read recents.</li>'; });
  }

  function loadRecent(id) {
    if (!recentsDb) return;
    recentsDb.get(id).then(function (row) {
      if (!row) return;
      applyState(row, false);
      if (root.CarbonMp && root.CarbonMp.live) root.CarbonMp.publish();
      closeSheet();
      say('Loaded “' + (row.name || 'snippet') + '”.');
    }).catch(function (e) { say(String((e && e.message) || e), true); });
  }

  function delRecent(id) {
    if (!recentsDb) return;
    recentsDb.delete(id).then(renderRecents).catch(function () {});
  }

  /* ---- PNG export (drawn, not a screenshot of the DOM) ---- */
  var MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

  function cssColor(c) { return c || '#000'; }

  function roundRect(ctx, x, y, w, h, r) {
    if (r < 0) r = 0;
    if (r * 2 > w) r = w / 2;
    if (r * 2 > h) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawExport(scale) {
    var synx = syn();
    var th = themeOf() || { highlights: {} };
    var h = th.highlights;
    var code = S.code.replace(/\t/g, '  ');
    var lines = code.split('\n');
    var lang = S.language;
    var toks = synx ? synx.tokenize(code, lang) : [{ text: code, type: 'text' }];
    var fs = S.fontSize;
    var lh = Math.round(fs * 1.33);
    var padX = S.padding, padY = S.padding;
    var gutter = S.lineNumbers ? Math.max(28, String(lines.length).length * fs * 0.62 + 12) : 0;
    var inPadX = 18, inPadY = S.windowControls ? 48 : 18;
    var inPadB = 18;
    var charW;
    var measure = document.createElement('canvas').getContext('2d');
    measure.font = fs + 'px ' + MONO;
    charW = measure.measureText('M').width || fs * 0.6;
    var maxChars = 0, li;
    for (li = 0; li < lines.length; li++) if (lines[li].length > maxChars) maxChars = lines[li].length;
    var textW = maxChars * charW;
    var winW = S.autoWidth
      ? clamp(Math.round(textW + inPadX * 2 + gutter), 320, 1024)
      : clamp(S.width, 320, 1280);
    var winH = inPadY + Math.max(1, lines.length) * lh + inPadB;
    var blur = S.dropShadow ? 68 : 0;
    var offY = S.dropShadow ? 20 : 0;
    var margin = S.dropShadow ? Math.ceil(blur + offY * 0.3) : 8;
    var cssW = winW + padX * 2 + margin * 2;
    var cssH = winH + padY * 2 + margin * 2 + (S.dropShadow ? offY : 0);
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(cssW * scale));
    canvas.height = Math.max(1, Math.round(cssH * scale));
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = S.bg;
    ctx.fillRect(0, 0, cssW, cssH);

    var wx = padX + margin;
    var wy = padY + margin;
    var radius = S.windowTheme === 'sharp' ? 0 : 5;

    if (S.dropShadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = blur;
      ctx.shadowOffsetY = offY;
      ctx.fillStyle = cssColor(h.background);
      roundRect(ctx, wx, wy, winW, winH, radius);
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = cssColor(h.background);
    roundRect(ctx, wx, wy, winW, winH, radius);
    ctx.fill();
    if (S.windowTheme === 'bw') {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      roundRect(ctx, wx + 1, wy + 1, winW - 2, winH - 2, radius);
      ctx.stroke();
    }

    if (S.windowControls) {
      var cy = wy + 24;
      if (S.windowTheme === 'sharp') {
        ctx.strokeStyle = '#878787';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(wx + winW - 52, cy); ctx.lineTo(wx + winW - 42, cy); ctx.stroke();
        ctx.strokeRect(wx + winW - 36, cy - 6, 12, 12);
        ctx.beginPath();
        ctx.moveTo(wx + winW - 18, cy - 5); ctx.lineTo(wx + winW - 8, cy + 5);
        ctx.moveTo(wx + winW - 8, cy - 5); ctx.lineTo(wx + winW - 18, cy + 5);
        ctx.stroke();
      } else {
        var dots = S.windowTheme === 'bw'
          ? ['#878787', '#878787', '#878787']
          : ['#FF5F56', '#FFBD2E', '#27C93F'];
        var rings = S.windowTheme === 'bw'
          ? ['#878787', '#878787', '#878787']
          : ['#E0443E', '#DEA123', '#1AAB29'];
        var i;
        for (i = 0; i < 3; i++) {
          var dx = wx + 22 + i * 20;
          ctx.beginPath();
          ctx.fillStyle = dots[i];
          ctx.arc(dx, cy, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = rings[i];
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
      if (S.title) {
        ctx.fillStyle = (th && th.light) ? '#121212' : '#fff';
        ctx.font = '13px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(S.title, wx + winW / 2, cy);
        ctx.textAlign = 'left';
      }
    }

    ctx.font = fs + 'px ' + MONO;
    ctx.textBaseline = 'top';
    var x0 = wx + (S.lineNumbers ? 12 : inPadX);
    var y0 = wy + inPadY;
    if (S.lineNumbers) {
      ctx.fillStyle = cssColor(h.comment);
      ctx.textAlign = 'right';
      for (li = 0; li < lines.length; li++) {
        ctx.fillText(String(li + 1), wx + gutter - 8, y0 + li * lh);
      }
      ctx.textAlign = 'left';
      x0 = wx + gutter;
    }

    var col = {
      text: h.text, variable: h.variable, attribute: h.attribute, definition: h.definition,
      keyword: h.keyword, operator: h.operator, property: h.property, number: h.number,
      string: h.string, comment: h.comment, meta: h.meta, tag: h.tag
    };
    var x = x0, y = y0, ti;
    for (ti = 0; ti < toks.length; ti++) {
      var t = toks[ti];
      var parts = t.text.split('\n');
      var p;
      for (p = 0; p < parts.length; p++) {
        if (p) { x = x0; y += lh; }
        if (!parts[p]) continue;
        ctx.fillStyle = cssColor(col[t.type] || h.text);
        ctx.fillText(parts[p], x, y);
        x += ctx.measureText(parts[p]).width;
      }
    }

    return canvas;
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      if (canvas.toBlob) {
        canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('PNG failed.')); }, 'image/png');
      } else {
        try {
          var url = canvas.toDataURL('image/png');
          var bin = atob(url.split(',')[1] || '');
          var arr = new Uint8Array(bin.length);
          var i;
          for (i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: 'image/png' }));
        } catch (e) { reject(e); }
      }
    });
  }

  function fileName() {
    var n = (S.title || 'carbon').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
    return (n || 'carbon') + '.png';
  }

  function exportPng() {
    var canvas = drawExport(S.scale || 2);
    canvasToBlob(canvas).then(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      say('PNG saved — ' + canvas.width + '×' + canvas.height + '.');
      keepRecentQuiet();
      libraryPng(blob);
    }).catch(function (e) { say(String((e && e.message) || e), true); });
  }

  function keepRecentQuiet() {
    if (!recentsDb) return;
    var row = getState();
    row.id = 'r_' + Date.now();
    row.name = recentName();
    row.at = Date.now();
    recentsDb.put(row).then(pruneRecents).catch(function () {});
  }

  function libraryPng(blob) {
    if (!api || !api.library || !api.library.put) return;
    blob.arrayBuffer().then(function (bytes) {
      return api.library.put({ bytes: bytes, mime: 'image/png', name: fileName(), type: 'image' });
    }).catch(function () {});
  }

  function copyPng() {
    var canvas = drawExport(S.scale || 2);
    canvasToBlob(canvas).then(function (blob) {
      if (root.navigator && navigator.clipboard && navigator.clipboard.write && root.ClipboardItem) {
        return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function () {
          say('PNG copied.');
        });
      }
      throw new Error('no-clip');
    }).catch(function () {
      exportPng();
      say('Clipboard blocked — downloaded the PNG instead.');
    });
  }

  function copyCode() {
    var text = S.code;
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
    if (root.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(fallback);
    } else fallback();
    say('Code copied.');
  }

  function openFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      S.code = String(reader.result || '').slice(0, MAX);
      $('code').value = S.code;
      if (S.language === 'auto') { /* detect on paint */ }
      var name = file.name || '';
      var ext = name.split('.').pop().toLowerCase();
      var map = { js: 'javascript', mjs: 'javascript', ts: 'typescript', tsx: 'jsx', jsx: 'jsx', py: 'python', rs: 'rust', go: 'go', html: 'html', htm: 'html', css: 'css', json: 'json', md: 'markdown', sql: 'sql', rb: 'ruby', php: 'php', yml: 'yaml', yaml: 'yaml', sh: 'bash', bash: 'bash', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', java: 'java', cs: 'csharp', swift: 'swift', kt: 'kotlin', toml: 'toml', lua: 'lua', hs: 'haskell', ex: 'elixir', r: 'r', graphql: 'graphql' };
      if (map[ext]) S.language = map[ext];
      if (!S.title) S.title = name.replace(/\.[^.]+$/, '');
      paint();
      persist();
      if (root.CarbonMp && root.CarbonMp.live) root.CarbonMp.publish();
      say('Opened ' + name + '.');
    };
    reader.readAsText(file);
  }

  function resetSample() {
    var T = root.CarbonThemes;
    S.code = T ? T.DEFAULT_CODE : '';
    S.theme = T ? T.DEFAULT_THEME : 'seti';
    S.language = 'auto';
    S.bg = T ? T.DEFAULT_BG : 'rgba(171, 184, 195, 1)';
    S.padding = 56;
    S.dropShadow = true;
    S.windowControls = true;
    S.windowTheme = 'none';
    S.lineNumbers = false;
    S.fontSize = 14;
    S.width = 680;
    S.autoWidth = true;
    S.title = '';
    S.scale = 2;
    $('code').value = S.code;
    paint();
    persist();
    if (root.CarbonMp && root.CarbonMp.live) root.CarbonMp.publish();
    say('Sample snippet.');
  }

  function fillSelects() {
    var i, t = themes();
    var th = $('theme');
    th.innerHTML = '';
    for (i = 0; i < t.length; i++) {
      var o = document.createElement('option');
      o.value = t[i].id;
      o.textContent = t[i].name;
      th.appendChild(o);
    }
    var langs = (syn() && syn().langs) || [];
    var lg = $('language');
    lg.innerHTML = '';
    for (i = 0; i < langs.length; i++) {
      var o = document.createElement('option');
      o.value = langs[i].id;
      o.textContent = langs[i].name;
      lg.appendChild(o);
    }
    var presets = (root.CarbonThemes && root.CarbonThemes.BG_PRESETS) || [];
    var row = $('swatches');
    row.innerHTML = '';
    for (i = 0; i < presets.length; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.setAttribute('data-bg', presets[i]);
      b.style.background = presets[i];
      b.setAttribute('aria-label', 'Background ' + (i + 1));
      row.appendChild(b);
    }
  }

  function bind() {
    $('code').addEventListener('input', onChange);
    $('code').addEventListener('scroll', function () {
      $('hl').scrollTop = $('code').scrollTop;
      $('hl').scrollLeft = $('code').scrollLeft;
      $('gutter').scrollTop = $('code').scrollTop;
    });
    $('theme').addEventListener('change', function () { S.theme = $('theme').value; onSetting(); });
    $('language').addEventListener('change', function () { S.language = $('language').value; onSetting(); });
    $('pad').addEventListener('input', function () { S.padding = +$('pad').value; $('padVal').textContent = S.padding + ' px'; applyThemeVars(); fit(); });
    $('pad').addEventListener('change', function () { S.padding = +$('pad').value; onSetting(); });
    $('fsize').addEventListener('input', function () { S.fontSize = +$('fsize').value; $('fsizeVal').textContent = S.fontSize + ' px'; applyThemeVars(); paintHl(); fit(); });
    $('fsize').addEventListener('change', function () { S.fontSize = +$('fsize').value; onSetting(); });
    $('width').addEventListener('input', function () {
      S.width = +$('width').value; S.autoWidth = false; $('autoW').checked = false;
      $('widthVal').textContent = S.width + ' px'; applyThemeVars(); fit();
    });
    $('width').addEventListener('change', function () { S.width = +$('width').value; S.autoWidth = false; onSetting(); });
    $('autoW').addEventListener('change', function () { S.autoWidth = $('autoW').checked; onSetting(); });
    $('nums').addEventListener('change', function () { S.lineNumbers = $('nums').checked; onSetting(); });
    $('chrome').addEventListener('change', function () { S.windowControls = $('chrome').checked; onSetting(); });
    $('shadow').addEventListener('change', function () { S.dropShadow = $('shadow').checked; onSetting(); });
    $('wtheme').addEventListener('change', function () { S.windowTheme = $('wtheme').value; onSetting(); });
    $('title').addEventListener('input', function () { S.title = $('title').value.slice(0, 80); paintControls(); });
    $('title').addEventListener('change', function () { S.title = $('title').value.slice(0, 80); onSetting(); });
    $('scale').addEventListener('change', function () { S.scale = +$('scale').value; persist(); });
    $('swatches').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.swatch') : e.target;
      if (!b || !b.getAttribute) return;
      var bg = b.getAttribute('data-bg');
      if (!bg) return;
      S.bg = bg;
      onSetting();
    });
    $('bgpick').addEventListener('input', function () { S.bg = hexToRgba($('bgpick').value); applyThemeVars(); });
    $('bgpick').addEventListener('change', function () { S.bg = hexToRgba($('bgpick').value); onSetting(); });

    $('btnSettings').addEventListener('click', function () { openSheet(sheet === 'settings' ? '' : 'settings'); });
    $('btnRecents').addEventListener('click', function () { openSheet(sheet === 'recents' ? '' : 'recents'); });
    $('btnExport').addEventListener('click', exportPng);
    $('btnCopyImg').addEventListener('click', copyPng);
    $('btnCopy').addEventListener('click', copyCode);
    $('btnKeep').addEventListener('click', keepRecent);
    $('btnSample').addEventListener('click', resetSample);
    var xs = document.querySelectorAll('.sheet-x');
    var xi;
    for (xi = 0; xi < xs.length; xi++) xs[xi].addEventListener('click', closeSheet);
    $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });

    $('recent-list').addEventListener('click', function (e) {
      var t = e.target.closest ? (e.target.closest('[data-id]') || e.target.closest('[data-del]')) : e.target;
      if (!t) return;
      if (t.getAttribute('data-del')) { delRecent(t.getAttribute('data-del')); return; }
      if (t.getAttribute('data-id')) loadRecent(t.getAttribute('data-id'));
    });

    $('file').addEventListener('change', function () {
      if (this.files && this.files[0]) openFile(this.files[0]);
      this.value = '';
    });
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) openFile(f);
    });

    window.addEventListener('resize', fit);
    if (api && api.onBack) {
      api.onBack(function () {
        if (sheet) { closeSheet(); return true; }
        return false;
      });
    }
  }

  function boot() {
    fillSelects();
    var T = root.CarbonThemes;
    S.code = T ? T.DEFAULT_CODE : '';
    S.theme = T ? T.DEFAULT_THEME : 'seti';
    S.bg = T ? T.DEFAULT_BG : S.bg;
    $('code').value = S.code;
    bind();

    var Mp = root.CarbonMp;
    if (Mp) {
      Mp.getState = getState;
      Mp.onRemote = function (row) { applyState(row, true); };
      Mp.onStatus = function (msg, err) { meetSay(msg); if (err) say(msg, true); };
    }

    function go() {
      paint();
      if (Mp) { Mp.watch(); Mp.beat(); }
    }

    if (!api || !api.db) {
      go();
      say('Opened outside GifOS — changes will not be saved in a file.');
      return;
    }
    try { saveDb = api.db('save'); } catch (e) {}
    try { recentsDb = api.db('recents'); } catch (e) {}
    var load = saveDb ? saveDb.get('current') : Promise.resolve(null);
    load.then(function (row) {
      if (row && row.code != null) applyState(row, true);
      go();
      say('The snippet lives in this file.');
    }).catch(function () { go(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
