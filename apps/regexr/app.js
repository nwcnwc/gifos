/*
 * RegExr — GifOS shell. Lexer + reference from upstream; the pattern lives in the file.
 * Classic IIFE. No fetch, no eval.
 */
(function (root) {
  'use strict';

  var DEFAULT_PATTERN = '([A-Z])\\w+';
  var DEFAULT_FLAGS = 'g';
  var DEFAULT_TEXT = [
    'RegExr was created by gskinner.com.',
    '',
    'Edit the Expression & Text to see matches. Roll over matches or the expression for details. This copy runs JavaScript RegExp in this tab, fully offline. Validate your expression with Tests.',
    '',
    'The side bar includes a Cheatsheet and the full Reference. Recents live in this file. Press Invite to share the pattern with a friend.',
    '',
    'Explore results with the Tools below. Replace & List output custom results. Details lists capture groups. Explain describes your expression in plain English.'
  ].join('\n');
  var DEFAULT_SUBST = '$&';
  var DEFAULT_LIST = '$&\\n';
  var RECENT_N = 24;
  var FLAG_ORDER = 'gimsuy';
  var FLAG_LABEL = {
    g: 'global', i: 'ignore case', m: 'multiline',
    s: 'dotall', u: 'unicode', y: 'sticky'
  };
  var TRASH = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  var api = root.gifos || null;
  var saveDb = null, recentsDb = null;
  var saveTimer = 0, runTimer = 0;
  var applying = false;
  var sheet = '';
  var hoverTok = null;
  var selectedMatch = -1;
  var lastResult = { matches: [], error: null, time: 0 };
  var lexer = null;

  var S = {
    pattern: DEFAULT_PATTERN,
    flags: DEFAULT_FLAGS,
    text: DEFAULT_TEXT,
    subst: DEFAULT_SUBST,
    listDelim: DEFAULT_LIST,
    tool: 'replace',
    mode: 'text',
    tests: [],
    side: 'cheat'
  };

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

  function validFlags(str) {
    var out = '', seen = {};
    String(str || '').split('').forEach(function (c) {
      if (FLAG_ORDER.indexOf(c) < 0 || seen[c]) return;
      if (root.RegExrProfiles && root.RegExrProfiles.js && root.RegExrProfiles.js.flags[c] === false) return;
      seen[c] = true;
      out += c;
    });
    return out;
  }

  function fullExpr() {
    return '/' + S.pattern + '/' + S.flags;
  }

  function tokenAt(index) {
    if (!lexer || !lexer.token) return null;
    var t = lexer.token;
    while (t) {
      if (t.type === 'open' || t.type === 'close') { t = t.next; continue; }
      if (t.i <= index && index < t.i + t.l) {
        var hit = t;
        while (hit) {
          if (hit.open) hit = hit.open;
          else if (hit.proxy) hit = hit.proxy;
          else break;
        }
        return hit;
      }
      t = t.next;
    }
    return null;
  }

  function paintExpression() {
    var pre = $('expHl');
    var inp = $('exp');
    if (!pre || !inp) return;
    var src = '/' + S.pattern + '/' + S.flags;
    if (!lexer) return;
    lexer.profile = root.RegExrProfiles && root.RegExrProfiles.js;
    var tok = lexer.parse(src);
    var html = '';
    var t = tok;
    while (t) {
      var chunk = src.substr(t.i, t.l);
      if (t.i === 0 || t.i >= 1 + S.pattern.length) { t = t.next; continue; }
      var cls = 'exp-' + (t.clss || t.type);
      if (t.error) cls += t.error.warning ? ' exp-warning' : ' exp-error';
      if (hoverTok && (t === hoverTok || t.open === hoverTok || (hoverTok.related && hoverTok.related.indexOf(t) >= 0))) cls += ' exp-hot';
      html += '<span class="' + cls + '" data-i="' + t.i + '">' + esc(chunk) + '</span>';
      t = t.next;
    }
    pre.innerHTML = html || esc(S.pattern);
    var errN = (lexer.errors || []).filter(function (e) { return e.error && !e.error.warning; }).length;
    document.body.classList.toggle('exp-bad', errN > 0);
  }

  function paintText() {
    var pre = $('textHl');
    var ta = $('text');
    if (!pre || !ta) return;
    var src = S.text;
    var matches = lastResult.matches || [];
    if (!src) { pre.innerHTML = ''; return; }
    var html = '';
    var i = 0;
    for (var m = 0; m < matches.length; m++) {
      var hit = matches[m];
      if (hit.l === 0) continue;
      if (hit.i > i) html += esc(src.slice(i, hit.i));
      var cls = 'match' + (m % 2 ? ' alt' : '') + (m === selectedMatch ? ' sel' : '');
      html += '<mark class="' + cls + '" data-m="' + m + '">' + esc(src.substr(hit.i, hit.l)) + '</mark>';
      i = hit.i + hit.l;
    }
    if (i < src.length) html += esc(src.slice(i));
    pre.innerHTML = html + '\n';
  }

  function paintFlags() {
    var box = $('flagList');
    if (!box) return;
    var html = '';
    FLAG_ORDER.split('').forEach(function (c) {
      var on = S.flags.indexOf(c) >= 0;
      html += '<button type="button" class="flag' + (on ? ' on' : '') + '" data-flag="' + c + '" title="' + FLAG_LABEL[c] + '">' + c + '</button>';
    });
    box.innerHTML = html;
    var echo = $('flagEcho');
    if (echo) echo.textContent = S.flags || '';
  }

  function paintResult() {
    var el = $('result');
    if (!el) return;
    var r = lastResult;
    if (r.error && !r.error.warning) {
      el.textContent = r.error.message || (root.RegExrTester && root.RegExrTester.errorText(r.error)) || 'Error';
      el.className = 'result err';
      return;
    }
    var n = (r.matches || []).length;
    var empty = (r.matches || []).reduce(function (v, o) { return v + (o.l ? 0 : 1); }, 0);
    var txt = n ? (n + ' match' + (n === 1 ? '' : 'es') + (empty ? '*' : '')) : 'No match';
    if (r.time != null) txt += '  ' + r.time.toFixed(1) + 'ms';
    if (r.error && r.error.warning) txt += '  warning';
    el.textContent = txt;
    el.className = 'result' + (r.error ? ' warn' : (n ? ' ok' : ''));
  }

  function paintTools() {
    var body = $('toolBody');
    if (!body) return;
    document.querySelectorAll('#toolTabs [data-tool]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tool') === S.tool);
    });
    $('substRow').hidden = S.tool !== 'replace' && S.tool !== 'list';
    $('subst').value = S.tool === 'list' ? S.listDelim : S.subst;
    $('substLab').textContent = S.tool === 'list' ? 'Delimiter' : 'Replace with';
    if (S.tool === 'replace') {
      var rep = root.RegExrTester.replaceAll(S.pattern, S.flags, S.text, S.subst);
      body.innerHTML = '<pre class="out">' + esc(rep.error ? (rep.error.message || 'Error') : rep.result) + '</pre>';
    } else if (S.tool === 'list') {
      var lst = root.RegExrTester.listAll(S.pattern, S.flags, S.text, S.listDelim);
      body.innerHTML = '<pre class="out">' + esc(lst.error ? (lst.error.message || 'Error') : lst.result) + '</pre>';
    } else if (S.tool === 'details') {
      var m = lastResult.matches[selectedMatch] || lastResult.matches[0];
      if (!m) { body.innerHTML = '<p class="hint">Click a match in the text.</p>'; return; }
      var rows = '<div class="det"><div class="k">match ' + ((selectedMatch >= 0 ? selectedMatch : 0) + 1) + '</div><div class="v">' + esc(m.s) + '</div>';
      (m.groups || []).forEach(function (g, i) {
        rows += '<div class="k">group ' + (g.n || (i + 1)) + '</div><div class="v">' + (g.s == null ? '<em>undefined</em>' : esc(g.s)) + '</div>';
      });
      if (m.named) {
        Object.keys(m.named).forEach(function (k) {
          rows += '<div class="k">' + esc(k) + '</div><div class="v">' + esc(m.named[k]) + '</div>';
        });
      }
      body.innerHTML = rows + '</div>';
    } else if (S.tool === 'explain') {
      var rows2 = root.RegExrTester.walkExplain(lexer && lexer.token);
      if (!rows2.length) { body.innerHTML = '<p class="hint">Enter an expression above and it will be explained here.</p>'; return; }
      body.innerHTML = rows2.map(function (row) {
        var cls = 'ex-row' + (row.error ? ' err' : '');
        return '<div class="' + cls + '" data-i="' + row.i + '"><code>' + esc(fullExpr().substr(row.i, row.l)) + '</code> <span>' + esc(row.label) + (row.label ? '.' : '') + '</span><small>' + esc(row.desc) + '</small></div>';
      }).join('');
    }
  }

  function paintCheat() {
    var el = $('sideBody');
    if (!el) return;
    var q = ($('sideSearch') && $('sideSearch').value || '').toLowerCase();
    if (S.side === 'cheat') {
      var rows = root.RegExrCheatsheet || [];
      var html = '<table class="cheat">';
      rows.forEach(function (r) {
        if (r.h) { html += '<tr><th colspan="2">' + esc(r.h) + '</th></tr>'; return; }
        if (q && (r.t + ' ' + r.d).toLowerCase().indexOf(q) < 0) return;
        html += '<tr data-ins="' + esc(r.ins) + '"><td><code>' + esc(r.t) + '</code></td><td>' + esc(r.d) + '</td></tr>';
      });
      el.innerHTML = html + '</table>';
    } else if (S.side === 'ref') {
      var ref = root.RegExrReference;
      if (!ref) { el.innerHTML = ''; return; }
      var html2 = '';
      (ref.kids || []).forEach(function (sec) {
        if (sec.target === 'subst' && S.tool !== 'replace') { /* still show */ }
        var kids = (sec.kids || []).filter(function (k) {
          if (q && (k.label || k.id || k.token || '').toLowerCase().indexOf(q) < 0 &&
              String(k.desc || '').toLowerCase().indexOf(q) < 0) return false;
          var prof = root.RegExrProfiles && root.RegExrProfiles.js;
          if (prof && prof.tokens && k.id && prof.tokens[k.id] === false) return false;
          return true;
        });
        if (q && !kids.length && (sec.label || '').toLowerCase().indexOf(q) < 0) return;
        html2 += '<details class="refsec" open><summary>' + esc(sec.label || sec.id) + '</summary>';
        kids.forEach(function (k) {
          html2 += '<div class="refitem" data-ins="' + esc(k.token || '') + '" data-ex="' + esc((k.example && k.example[0]) || '') + '" data-ext="' + esc((k.example && k.example[1]) || '') + '">';
          html2 += '<code>' + esc(k.token || k.id) + '</code> <b>' + esc(k.label || k.id) + '</b>';
          html2 += '<p>' + String(k.desc || '').replace(/<[^>]+>/g, '') + '</p>';
          if (k.example) html2 += '<button type="button" class="loadex" data-ex="' + esc(k.example[0]) + '" data-ext="' + esc(k.example[1] || '') + '">Load example</button>';
          html2 += '</div>';
        });
        html2 += '</details>';
      });
      el.innerHTML = html2 || '<p class="hint">Nothing matches that search.</p>';
    } else {
      if (!recentsDb) { el.innerHTML = '<p class="hint">Patterns you Keep live in this file.</p>'; return; }
      recentsDb.getAll().then(function (rows) {
        rows = (rows || []).filter(function (r) { return r && r.id && r.id !== 'seed'; });
        rows.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
        if (!rows.length) {
          el.innerHTML = '<p class="hint">Patterns you Keep live in this file.</p>';
          return;
        }
        el.innerHTML = '<ul class="recents">' + rows.map(function (r) {
          return '<li data-id="' + esc(r.id) + '"><code>/' + esc(r.pattern) + '/' + esc(r.flags || '') + '</code><small>' + esc((r.text || '').slice(0, 80)) + '</small></li>';
        }).join('') + '</ul>';
      }).catch(function () {
        el.innerHTML = '<p class="hint">Could not read recents.</p>';
      });
    }
  }

  function paintTests() {
    var list = $('testList');
    if (!list) return;
    if (!S.tests.length) {
      list.innerHTML = '<p class="hint">Build a suite of tests that your expression should (or should not) match.</p>';
      return;
    }
    var run = root.RegExrTester.runTests(S.pattern, S.flags, S.tests);
    var by = {};
    (run.results || []).forEach(function (r) { by[r.id] = r; });
    list.innerHTML = S.tests.map(function (t) {
      var r = by[t.id] || {};
      var cls = r.pass ? 'pass' : 'fail';
      return '<article class="test ' + cls + '" data-id="' + esc(t.id) + '">' +
        '<header><input class="tn" value="' + esc(t.name || '') + '" placeholder="Untitled test">' +
        '<select class="tt">' +
        '<option value="any"' + (t.type === 'any' ? ' selected' : '') + '>Match any</option>' +
        '<option value="all"' + (t.type === 'all' ? ' selected' : '') + '>Match full</option>' +
        '<option value="none"' + (t.type === 'none' ? ' selected' : '') + '>Match none</option>' +
        '</select>' +
        '<button type="button" class="row-del tdel" aria-label="Delete test">' + TRASH + '</button></header>' +
        '<textarea class="tb" spellcheck="false">' + esc(t.text || '') + '</textarea></article>';
    }).join('');
    var fail = (run.results || []).filter(function (r) { return !r.pass; }).length;
    var n = S.tests.length;
    if (run.error) $('result').textContent = run.error.message || 'Error';
    else if (!n) $('result').textContent = 'No tests.';
    else $('result').textContent = fail ? fail + ' FAILED' : 'PASSED';
  }

  function run() {
    if (S.mode === 'tests') {
      paintExpression();
      paintFlags();
      paintTests();
      paintTools();
      return;
    }
    lastResult = root.RegExrTester.solveText(S.pattern, S.flags, S.text);
    if (selectedMatch >= lastResult.matches.length) selectedMatch = lastResult.matches.length ? 0 : -1;
    paintExpression();
    paintFlags();
    paintText();
    paintResult();
    paintTools();
  }

  function schedule() {
    if (runTimer) clearTimeout(runTimer);
    runTimer = setTimeout(run, 40);
    persist();
    if (root.RegExrNet) root.RegExrNet.publish();
  }

  function persist(immediate) {
    if (applying || !saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    var write = function () {
      saveDb.put({
        id: 'current',
        pattern: S.pattern,
        flags: S.flags,
        text: S.text,
        subst: S.subst,
        listDelim: S.listDelim,
        tool: S.tool,
        mode: S.mode,
        tests: S.tests,
        side: S.side
      }).catch(function () {});
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 280);
  }

  function applyState(row, fromRemote) {
    if (!row) return;
    applying = true;
    if (row.pattern != null) S.pattern = String(row.pattern);
    if (row.flags != null) S.flags = validFlags(row.flags);
    if (row.text != null) S.text = String(row.text);
    if (row.subst != null) S.subst = String(row.subst);
    if (row.listDelim != null) S.listDelim = String(row.listDelim);
    if (row.tool) S.tool = row.tool;
    if (row.mode) S.mode = row.mode;
    if (row.tests) S.tests = row.tests;
    if (row.side) S.side = row.side;
    $('exp').value = S.pattern;
    $('text').value = S.text;
    $('subst').value = S.tool === 'list' ? S.listDelim : S.subst;
    document.body.classList.toggle('tests', S.mode === 'tests');
    $('textBox').hidden = S.mode === 'tests';
    $('testList').hidden = S.mode !== 'tests';
    document.querySelectorAll('#modeTabs [data-mode]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === S.mode);
    });
    document.querySelectorAll('#sideTabs [data-side]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-side') === S.side);
    });
    applying = false;
    run();
    paintCheat();
    if (!fromRemote) persist();
  }

  function insertToken(s) {
    if (!s) return;
    var inp = $('exp');
    var start = inp.selectionStart | 0, end = inp.selectionEnd | 0;
    var v = inp.value;
    inp.value = v.slice(0, start) + s + v.slice(end);
    S.pattern = inp.value;
    inp.focus();
    inp.selectionStart = inp.selectionEnd = start + s.length;
    schedule();
  }

  function keepRecent() {
    if (!recentsDb) { say('Recents need this file.', true); return; }
    recentsDb.put({
      id: 'r_' + Date.now(),
      at: Date.now(),
      pattern: S.pattern,
      flags: S.flags,
      text: S.text.slice(0, 4000)
    }).then(function () {
      return recentsDb.getAll();
    }).then(function (rows) {
      rows = (rows || []).filter(function (r) { return r && String(r.id).indexOf('r_') === 0; });
      rows.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      var extra = rows.slice(RECENT_N);
      extra.forEach(function (r) { recentsDb.delete(r.id).catch(function () {}); });
      say('Kept in Recents.');
      if (S.side === 'recents') paintCheat();
    }).catch(function (e) { say(String((e && e.message) || e), true); });
  }

  function loadSample() {
    applyState({
      pattern: DEFAULT_PATTERN,
      flags: DEFAULT_FLAGS,
      text: DEFAULT_TEXT,
      subst: DEFAULT_SUBST,
      listDelim: DEFAULT_LIST,
      tool: 'replace',
      mode: 'text'
    });
    say('Sample pattern.');
  }

  function copyOut() {
    var pre = $('toolBody') && $('toolBody').querySelector('.out');
    var txt = pre ? pre.textContent : S.pattern;
    if (root.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { say('Copied.'); }).catch(function () { say('Could not copy.', true); });
    } else say('Could not copy.', true);
  }

  function showTip(html, x, y) {
    var tip = $('tip');
    if (!html) { tip.hidden = true; return; }
    tip.innerHTML = html;
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(root.innerWidth - w - 8, x + 12)) + 'px';
    tip.style.top = Math.max(8, Math.min(root.innerHeight - h - 8, y + 16)) + 'px';
  }

  function closeSheet() {
    sheet = '';
    document.body.classList.remove('side-open');
    $('sheet').hidden = true;
    document.querySelectorAll('#sheet .panel').forEach(function (p) { p.hidden = true; });
  }
  function openSheet(id) {
    sheet = id;
    $('sheet').hidden = false;
    document.querySelectorAll('#sheet .panel').forEach(function (p) { p.hidden = p.id !== id; });
  }

  function bind() {
    $('exp').addEventListener('input', function () {
      S.pattern = $('exp').value;
      schedule();
    });
    $('text').addEventListener('input', function () {
      S.text = $('text').value;
      selectedMatch = -1;
      schedule();
    });
    function syncScroll() {
      $('textHl').scrollTop = $('text').scrollTop;
      $('textHl').scrollLeft = $('text').scrollLeft;
    }
    $('text').addEventListener('scroll', syncScroll);
    $('subst').addEventListener('input', function () {
      if (S.tool === 'list') S.listDelim = $('subst').value;
      else S.subst = $('subst').value;
      schedule();
    });
    $('flagList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-flag]');
      if (!b) return;
      var c = b.getAttribute('data-flag');
      if (S.flags.indexOf(c) >= 0) S.flags = S.flags.replace(c, '');
      else S.flags = validFlags(S.flags + c);
      schedule();
    });
    $('modeTabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]');
      if (!b) return;
      S.mode = b.getAttribute('data-mode');
      document.body.classList.toggle('tests', S.mode === 'tests');
      $('textBox').hidden = S.mode === 'tests';
      $('testList').hidden = S.mode !== 'tests';
      document.querySelectorAll('#modeTabs [data-mode]').forEach(function (x) {
        x.classList.toggle('on', x === b);
      });
      schedule();
    });
    $('toolTabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tool]');
      if (!b) return;
      S.tool = b.getAttribute('data-tool');
      schedule();
    });
    $('sideTabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-side]');
      if (!b) return;
      S.side = b.getAttribute('data-side');
      document.querySelectorAll('#sideTabs [data-side]').forEach(function (x) {
        x.classList.toggle('on', x === b);
      });
      paintCheat();
      persist();
    });
    $('sideSearch').addEventListener('input', function () { paintCheat(); });
    $('sideBody').addEventListener('click', function (e) {
      var load = e.target.closest('.loadex');
      if (load) {
        applyState({ pattern: load.getAttribute('data-ex') || '', flags: S.flags.indexOf('g') >= 0 ? S.flags : S.flags + 'g', text: load.getAttribute('data-ext') || S.text, mode: 'text' });
        say('Loaded example.');
        return;
      }
      var tr = e.target.closest('[data-ins]');
      if (tr && tr.getAttribute('data-ins')) insertToken(tr.getAttribute('data-ins'));
      var rec = e.target.closest('.recents li');
      if (rec && recentsDb) {
        recentsDb.get(rec.getAttribute('data-id')).then(function (row) {
          if (row) applyState(row);
        }).catch(function () {});
      }
    });
    $('text').addEventListener('click', function () {
      var idx = $('text').selectionStart | 0;
      var hits = lastResult.matches || [];
      selectedMatch = -1;
      for (var i = 0; i < hits.length; i++) {
        if (hits[i].i <= idx && idx < hits[i].i + Math.max(hits[i].l, 1)) { selectedMatch = i; break; }
      }
      if (selectedMatch >= 0 && S.tool !== 'details') S.tool = 'details';
      paintText();
      paintTools();
    });
    $('exp').addEventListener('mousemove', function (e) {
      var inp = $('exp');
      var idx = 1 + (inp.selectionStart | 0); // +1 for leading /
      // approximate: use caret if moving? Use offset
      var dx = e.offsetX;
      var ch = Math.max(0, Math.min(S.pattern.length, Math.round(dx / 7.8)));
      var tok = tokenAt(1 + ch);
      hoverTok = tok;
      paintExpression();
      if (!tok) { showTip('', 0, 0); return; }
      var lab = root.RegExrTester.labelOf(tok);
      var desc = root.RegExrTester.descOf(tok) || '';
      var err = tok.error ? root.RegExrTester.errorText(tok.error, tok) : '';
      showTip('<b>' + esc(lab) + (lab ? '.' : '') + '</b>' + (err ? '<div class="err">' + esc(err) + '</div>' : '') + (desc ? '<div>' + esc(desc) + '</div>' : ''), e.clientX, e.clientY);
    });
    $('exp').addEventListener('mouseleave', function () {
      hoverTok = null;
      paintExpression();
      showTip('', 0, 0);
    });
    $('text').addEventListener('mousemove', function (e) {
      var ta = $('text');
      var idx = ta.selectionStart | 0;
      var hits = lastResult.matches || [];
      var hit = null, hi = -1;
      for (var i = 0; i < hits.length; i++) {
        if (hits[i].i <= idx && idx < hits[i].i + Math.max(hits[i].l, 1)) { hit = hits[i]; hi = i; break; }
      }
      if (!hit) { showTip('', 0, 0); return; }
      var g = (hit.groups || []).map(function (x, n) {
        return 'group ' + (x.n || n + 1) + ': ' + (x.s == null ? 'undefined' : JSON.stringify(x.s));
      }).join('<br>');
      showTip('<b>match ' + (hi + 1) + '</b><div>' + esc(hit.s) + '</div>' + (g ? '<div>' + g + '</div>' : ''), e.clientX, e.clientY);
    });
    $('text').addEventListener('mouseleave', function () { showTip('', 0, 0); });
    $('btnSample').addEventListener('click', loadSample);
    $('btnKeep').addEventListener('click', keepRecent);
    $('btnCopy').addEventListener('click', copyOut);
    $('btnAddTest').addEventListener('click', function () {
      S.tests.push({ id: 't_' + Date.now(), name: '', text: 'Enter your test text here.', type: 'any' });
      S.mode = 'tests';
      document.body.classList.add('tests');
      schedule();
      paintTests();
    });
    $('testList').addEventListener('input', function (e) {
      var art = e.target.closest('.test');
      if (!art) return;
      var id = art.getAttribute('data-id');
      var t = S.tests.filter(function (x) { return x.id === id; })[0];
      if (!t) return;
      if (e.target.classList.contains('tn')) t.name = e.target.value;
      if (e.target.classList.contains('tb')) t.text = e.target.value;
      if (e.target.classList.contains('tt')) t.type = e.target.value;
      persist();
      paintTests();
    });
    $('testList').addEventListener('click', function (e) {
      var del = e.target.closest('.tdel');
      if (!del) return;
      var art = del.closest('.test');
      var id = art && art.getAttribute('data-id');
      S.tests = S.tests.filter(function (x) { return x.id !== id; });
      schedule();
      paintTests();
    });
    $('btnSide').addEventListener('click', function () {
      document.body.classList.add('side-open');
      sheet = 'side';
    });
    document.querySelectorAll('.sheet-x').forEach(function (b) {
      b.addEventListener('click', closeSheet);
    });
    $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });
  }

  function boot() {
    lexer = new root.RegExrLexer();
    lexer.profile = root.RegExrProfiles && root.RegExrProfiles.js;
    try { if (api && api.db) { saveDb = api.db('save'); recentsDb = api.db('recents'); } } catch (e) {}
    bind();
    paintFlags();
    paintCheat();

    var net = root.RegExrNet;
    var fromRoom = false;
    if (net) {
      net.getState = function () {
        return { pattern: S.pattern, flags: S.flags, text: S.text, subst: S.subst, listDelim: S.listDelim, tool: S.tool, mode: S.mode, tests: S.tests };
      };
      net.onRemote = function (row) {
        fromRoom = true;
        applyState(row, true);
      };
      net.onStatus = function (msg) { meetSay(msg); };
    }

    var loaded = Promise.resolve(null);
    if (saveDb) loaded = saveDb.get('current').catch(function () { return null; });
    loaded.then(function (row) {
      if (fromRoom) return;
      if (row && (row.pattern || row.text)) applyState(row);
      else applyState({ pattern: DEFAULT_PATTERN, flags: DEFAULT_FLAGS, text: DEFAULT_TEXT });
    }).then(function () {
      /* Watch after the local row is on screen so the host publishes THIS
       * expression. A guest's first getAll then adopts it instead of the sample. */
      if (net) { net.watch(); net.beat(); }
      if (!api || !api.launch) return;
      return api.launch().then(function (go) {
        if (!go) return;
        var next = {};
        if (go.pattern) next.pattern = go.pattern;
        if (go.flags) next.flags = go.flags;
        if (go.text) next.text = go.text;
        if (next.pattern || next.text) {
          applyState(Object.assign({ pattern: S.pattern, flags: S.flags, text: S.text }, next));
          say('Opened from the link.');
        }
      }).catch(function () {});
    }).catch(function () {
      if (fromRoom) return;
      applyState({ pattern: DEFAULT_PATTERN, flags: DEFAULT_FLAGS, text: DEFAULT_TEXT });
    });

    if (api && api.onBack) {
      api.onBack(function () {
        if (sheet || document.body.classList.contains('side-open')) { closeSheet(); return true; }
        return false;
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
