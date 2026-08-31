/* Milkdown: last document is private. Meeting share is optional (mp.js).
 * Nothing is fetched. Write and Source share one markdown string.
 * Invite is OS chrome — the meet line tells the user to press it. */
(function (root) {
  'use strict';

  var MAX = 100000;
  var SAVE_MS = 350;
  var SAMPLE = [
    '# Packing for the train',
    '',
    'The notes **live in this file**. Close it, come back — same list.',
    '',
    '## Bring',
    '',
    '- [x] Tickets',
    '- [ ] Chargers',
    '- [ ] The paperback',
    '',
    '> If we miss the 09:40, the 10:12 still gets us there.',
    '',
    'Who has what:',
    '',
    '| Who | Job |',
    '| --- | --- |',
    '| You | Snacks |',
    '| Them | Maps |',
    '',
    'The invite is the same page — no vault, no account.',
    '',
    'A fence for a line you want verbatim:',
    '',
    '```',
    'meet at the north kiosk',
    '```',
    ''
  ].join('\n');

  var api = root.gifos || null;
  var saveDb = null;
  var ed = null;
  var ready = false;
  var applying = false;
  var mode = 'write';
  var markdown = '';
  var saveTimer = 0;
  var sheetOpen = false;
  var moreOpen = false;

  var $ = function (id) { return document.getElementById(id); };

  function clamp(s) {
    s = String(s == null ? '' : s);
    if (s.length > MAX) s = s.slice(0, MAX);
    return s;
  }

  function words(s) {
    var t = String(s || '').replace(/\s+/g, ' ').trim();
    if (!t) return 0;
    return t.split(' ').length;
  }

  function setErr(msg) {
    var el = $('err');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = msg;
  }

  function setStatus(msg) {
    var el = $('status');
    if (el) el.textContent = msg || '';
  }

  function paintStatus() {
    var n = words(markdown);
    var empty = !String(markdown || '').trim();
    if (empty) setStatus('Empty — still only on this device');
    else setStatus((n === 1 ? '1 word' : n + ' words') + ' · saved on this device');
  }

  function syncTabs() {
    [['tabWrite', 'write'], ['tabSource', 'source']].forEach(function (pair) {
      var el = $(pair[0]);
      if (!el) return;
      var on = pair[1] === mode;
      el.classList.toggle('on', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.body.classList.toggle('source-on', mode === 'source');
    var paper = $('paper');
    var src = $('source');
    if (paper) paper.hidden = mode !== 'write';
    if (src) src.hidden = mode !== 'source';
  }

  function persistNow() {
    if (!ready || applying || !saveDb) return;
    saveDb.put({ id: 'doc', markdown: markdown, mode: mode }).catch(function () {});
  }

  function persist() {
    if (!ready || applying || !saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      persistNow();
    }, SAVE_MS);
  }

  function publish() {
    if (root.MilkdownMp) root.MilkdownMp.publish();
  }

  function setMarkdown(next, fromRemote) {
    next = clamp(next);
    if (next === markdown && !fromRemote) return;
    markdown = next;
    var src = $('source');
    if (src && src.value !== next) src.value = next;
    if (ed && mode === 'write') {
      var cur = '';
      try { cur = ed.getMarkdown(); } catch (e) { cur = ''; }
      if (cur !== next) {
        applying = true;
        try { ed.setMarkdown(next, true); } catch (e) {}
        applying = false;
      }
    }
    paintStatus();
    if (!fromRemote) {
      persist();
      publish();
    } else {
      persistNow();
    }
  }

  function pullFromEditor() {
    if (!ed) return markdown;
    try { return clamp(ed.getMarkdown()); } catch (e) { return markdown; }
  }

  function onUserMarkdown(md) {
    if (!ready || applying) return;
    markdown = clamp(md);
    var src = $('source');
    if (src && src.value !== markdown) src.value = markdown;
    paintStatus();
    persist();
    publish();
  }

  function requestMode(next) {
    next = next === 'source' ? 'source' : 'write';
    if (next === mode) return;
    if (mode === 'write') markdown = pullFromEditor();
    else markdown = clamp($('source').value);
    mode = next;
    if (mode === 'write' && ed) {
      applying = true;
      try { ed.setMarkdown(markdown, true); } catch (e) {}
      applying = false;
      try { ed.focus(); } catch (e) {}
    } else if (mode === 'source') {
      $('source').value = markdown;
      $('source').focus();
    }
    syncTabs();
    persist();
  }

  function run(name, payload) {
    if (!ed || !ed.keys || mode !== 'write') return;
    var key = ed.keys[name];
    if (!key) return;
    try { ed.command(key, payload); ed.focus(); } catch (e) {}
  }

  function insertMd(chunk) {
    if (mode === 'source') {
      var src = $('source');
      var start = src.selectionStart || src.value.length;
      var end = src.selectionEnd || start;
      src.value = src.value.slice(0, start) + chunk + src.value.slice(end);
      src.selectionStart = src.selectionEnd = start + chunk.length;
      markdown = clamp(src.value);
      paintStatus();
      persist();
      publish();
      src.focus();
      return;
    }
    if (!ed) return;
    try { ed.insert(chunk); ed.focus(); } catch (e) {}
  }

  function setMore(open) {
    moreOpen = !!open;
    var menu = $('moreMenu');
    var btn = $('moreBtn');
    if (menu) menu.hidden = !moreOpen;
    if (btn) btn.setAttribute('aria-expanded', moreOpen ? 'true' : 'false');
  }

  function closeSheet() {
    sheetOpen = false;
    $('linkSheet').hidden = true;
  }

  function openSheet() {
    sheetOpen = true;
    $('linkHref').value = '';
    $('linkSheet').hidden = false;
    setTimeout(function () { $('linkHref').focus(); }, 0);
  }

  function applyLink() {
    var href = String($('linkHref').value || '').trim();
    closeSheet();
    if (!href) return;
    if (mode === 'source') {
      insertMd('[' + href + '](' + href + ')');
      return;
    }
    if (!ed || !ed.keys) return;
    try {
      var ok = ed.command(ed.keys.link, { href: href });
      if (!ok) ed.insert('[' + href + '](' + href + ')');
      ed.focus();
    } catch (e) {
      insertMd('[' + href + '](' + href + ')');
    }
  }

  function copyMd() {
    if (mode === 'write') markdown = pullFromEditor();
    else markdown = clamp($('source').value);
    var t = markdown;
    function ok() { setStatus('Copied the markdown'); }
    function fail() { setStatus('Could not copy — switch to Source and select it'); }
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(t).then(ok).catch(fail);
      return;
    }
    try {
      $('source').hidden = false;
      $('source').value = t;
      $('source').select();
      var did = document.execCommand && document.execCommand('copy');
      if (mode === 'write') $('source').hidden = true;
      if (did) ok(); else fail();
    } catch (e) { fail(); }
  }

  function confirmWipe(why) {
    if (!String(markdown || '').trim()) return true;
    return root.confirm ? root.confirm(why) : true;
  }

  function loadSample() {
    if (!confirmWipe('Replace this document with the sample note?')) return;
    mode = 'write';
    syncTabs();
    setMarkdown(SAMPLE, false);
    if (ed) {
      applying = true;
      try { ed.setMarkdown(SAMPLE, true); } catch (e) {}
      applying = false;
      try { ed.focus(); } catch (e) {}
    }
  }

  function loadNew() {
    if (!confirmWipe('Clear this document?')) return;
    mode = 'write';
    syncTabs();
    setMarkdown('', false);
    if (ed) {
      applying = true;
      try { ed.setMarkdown('', true); } catch (e) {}
      applying = false;
      try { ed.focus(); } catch (e) {}
    }
  }

  function openFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      setMarkdown(String(reader.result || ''), false);
      if (mode === 'write' && ed) {
        applying = true;
        try { ed.setMarkdown(markdown, true); } catch (e) {}
        applying = false;
      }
    };
    reader.readAsText(file);
  }

  function bind() {
    $('tabWrite').addEventListener('click', function () { requestMode('write'); });
    $('tabSource').addEventListener('click', function () { requestMode('source'); });
    $('btnBold').addEventListener('click', function () { run('bold'); });
    $('btnItalic').addEventListener('click', function () { run('italic'); });
    $('btnStrike').addEventListener('click', function () { run('strike'); });
    $('btnCode').addEventListener('click', function () { run('code'); });
    $('btnH1').addEventListener('click', function () { run('heading', 1); });
    $('btnH2').addEventListener('click', function () { run('heading', 2); });
    $('btnQuote').addEventListener('click', function () { run('quote'); });
    $('btnBullet').addEventListener('click', function () { run('bullet'); });
    $('btnOrdered').addEventListener('click', function () { run('ordered'); });
    $('btnTask').addEventListener('click', function () { insertMd('- [ ] '); });
    $('btnCodeBlock').addEventListener('click', function () { run('codeBlock'); });
    $('btnTable').addEventListener('click', function () { run('table', { row: 3, col: 3 }); });
    $('btnHr').addEventListener('click', function () { run('hr'); });
    $('btnLink').addEventListener('click', openSheet);
    $('linkCancel').addEventListener('click', closeSheet);
    $('linkApply').addEventListener('click', applyLink);
    $('linkHref').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
      if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
    });
    $('moreBtn').addEventListener('click', function (e) {
      e.stopPropagation();
      setMore(!moreOpen);
    });
    $('moreMenu').addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { if (moreOpen) setMore(false); });
    $('sampleBtn').addEventListener('click', function () { setMore(false); loadSample(); });
    $('copyBtn').addEventListener('click', function () { setMore(false); copyMd(); });
    $('newBtn').addEventListener('click', function () { setMore(false); loadNew(); });
    $('file').addEventListener('change', function () {
      var f = $('file').files && $('file').files[0];
      $('file').value = '';
      setMore(false);
      if (f) openFile(f);
    });
    $('source').addEventListener('input', function () {
      if (mode !== 'source' || applying) return;
      markdown = clamp($('source').value);
      paintStatus();
      persist();
      publish();
    });
    $('linkSheet').addEventListener('click', function (e) {
      if (e.target === $('linkSheet')) closeSheet();
    });
  }

  function bootEditor(initial) {
    var Milkdown = root.Milkdown;
    if (!Milkdown || typeof Milkdown.create !== 'function') {
      setErr('Milkdown did not load.');
      return Promise.resolve();
    }
    return Milkdown.create({
      root: $('paper'),
      defaultValue: initial,
      onMarkdown: onUserMarkdown
    }).then(function (inst) {
      ed = inst;
    }).catch(function (e) {
      setErr(String((e && e.message) || e || 'Editor failed to start.'));
    });
  }

  function boot() {
    bind();
    syncTabs();
    try { if (api && api.db) saveDb = api.db('save'); } catch (e) {}
    var start = Promise.resolve(null);
    if (saveDb && saveDb.get) start = saveDb.get('doc').catch(function () { return null; });
    start.then(function (rec) {
      var initial = SAMPLE;
      if (rec && typeof rec.markdown === 'string') {
        initial = rec.markdown;
        if (rec.mode === 'source') mode = 'source';
      }
      markdown = clamp(initial);
      $('source').value = markdown;
      syncTabs();
      return bootEditor(markdown);
    }).then(function () {
      ready = true;
      paintStatus();
      if (mode === 'source') $('source').focus();
      var Mp = root.MilkdownMp;
      if (Mp) {
        Mp.getState = function () { return { markdown: markdown }; };
        Mp.onRemote = function (row) {
          if (!row) return;
          var next = clamp(row.markdown);
          if (next === markdown) return;
          applying = true;
          markdown = next;
          $('source').value = next;
          if (ed) {
            try { ed.setMarkdown(next, true); } catch (e) {}
          }
          applying = false;
          paintStatus();
          persistNow();
        };
        Mp.onStatus = function (msg, err) {
          var el = $('meet');
          if (!el) return;
          el.textContent = msg || '';
          var occupied = /is on this document|friends on this document/i.test(msg || '');
          el.classList.toggle('live', !!(err || occupied));
        };
        Mp.watch();
      }
      if (api && api.onBack) {
        api.onBack(function () {
          if (sheetOpen) { closeSheet(); return true; }
          if (moreOpen) { setMore(false); return true; }
          if (mode === 'source') { requestMode('write'); return true; }
          return false;
        });
      }
    });
  }

  boot();
})(typeof window !== 'undefined' ? window : this);
