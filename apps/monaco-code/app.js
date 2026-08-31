/* Monaco Code: buffers persist in this file; Invite is a pair editor. */
(function (root) {
  'use strict';

  var MAX = 400 * 1024;
  var LANGS = [
    'plaintext', 'javascript', 'typescript', 'json', 'markdown',
    'html', 'css', 'python', 'yaml', 'xml', 'shell', 'sql', 'rust', 'go',
    'java', 'csharp', 'cpp', 'ruby', 'php', 'ini', 'dockerfile'
  ];
  var EXT = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    json: 'json', md: 'markdown', markdown: 'markdown',
    html: 'html', htm: 'html', css: 'css',
    py: 'python', yml: 'yaml', yaml: 'yaml', xml: 'xml',
    sh: 'shell', bash: 'shell', sql: 'sql', rs: 'rust', go: 'go',
    java: 'java', cs: 'csharp', cpp: 'cpp', h: 'cpp', c: 'cpp',
    rb: 'ruby', php: 'php', ini: 'ini', dockerfile: 'dockerfile',
    txt: 'plaintext'
  };

  var SAMPLE = [
    {
      id: 'hello.ts',
      name: 'hello.ts',
      lang: 'typescript',
      text: [
        '/** Pair-program from one invite. The buffers live in this file. */',
        'export type Guest = { name: string; driving: boolean };',
        '',
        'export function greet(who: Guest): string {',
        '  return who.driving',
        '    ? `${who.name} is typing.`',
        '    : `Waiting for ${who.name}…`;',
        '}',
        '',
        'const you: Guest = { name: \'you\', driving: true };',
        'console.log(greet(you));',
        ''
      ].join('\n')
    },
    {
      id: 'app.js',
      name: 'app.js',
      lang: 'javascript',
      text: [
        '// Classic JavaScript — IntelliSense still knows this file.',
        'function parseQuery(q) {',
        '  const out = {};',
        '  String(q || \'\').replace(/([^&=]+)=([^&]*)/g, (_, k, v) => {',
        '    out[decodeURIComponent(k)] = decodeURIComponent(v);',
        '    return \'\';',
        '  });',
        '  return out;',
        '}',
        '',
        'console.log(parseQuery(\'lang=ts&file=hello.ts\'));',
        ''
      ].join('\n')
    },
    {
      id: 'data.json',
      name: 'data.json',
      lang: 'json',
      text: JSON.stringify({
        app: 'Monaco Code',
        offline: true,
        invite: 'pair editor',
        languages: ['javascript', 'typescript', 'json', 'markdown']
      }, null, 2) + '\n'
    },
    {
      id: 'README.md',
      name: 'README.md',
      lang: 'markdown',
      text: [
        '# Monaco Code',
        '',
        'The buffers live in this GIF. Close it and they are still here.',
        '',
        'Press **Invite** in the bar above and a friend types with you.',
        '',
        '- `hello.ts` — TypeScript, with IntelliSense',
        '- `app.js` — JavaScript',
        '- `data.json` — JSON, validated as you type',
        ''
      ].join('\n')
    }
  ];

  var monaco = root.monaco;
  var Mp = root.MonacoMp;
  var api = root.gifos || null;
  var prefsDb = null;
  var filesDb = null;
  var editor = null;
  var models = Object.create(null);
  var files = Object.create(null);
  var order = [];
  var active = null;
  var applying = false;
  var seeded = false;
  var saveTimer = 0;
  var cursorTimer = 0;
  var lastPut = Object.create(null);
  var remoteWidgets = [];
  var remoteDecos = null;
  var phone = false;
  var drawer = false;
  var wrap = false;
  var theme = 'vs-dark';
  var pendingLaunch = null;
  var seenFiles = false;

  function $(id) { return document.getElementById(id); }

  function langOf(name) {
    var n = String(name || '');
    var i = n.lastIndexOf('.');
    var ext = i >= 0 ? n.slice(i + 1).toLowerCase() : '';
    if (n.toLowerCase() === 'dockerfile') return 'dockerfile';
    return EXT[ext] || 'plaintext';
  }

  function setStatus(msg, err) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.style.opacity = err ? '1' : '';
  }

  function setMeet(msg) {
    var el = $('meet');
    if (!el) return;
    el.innerHTML = '';
    if (!msg) return;
    var parts = String(msg).split('Invite');
    if (parts.length === 2) {
      el.appendChild(document.createTextNode(parts[0]));
      var b = document.createElement('b');
      b.textContent = 'Invite';
      el.appendChild(b);
      el.appendChild(document.createTextNode(parts[1]));
    } else {
      el.textContent = msg;
    }
  }

  function isPhone() {
    return root.matchMedia && root.matchMedia('(max-width: 719px)').matches;
  }

  function uriOf(name) {
    return monaco.Uri.parse('file:///' + encodeURIComponent(name));
  }

  function configureLangs() {
    if (!monaco.languages || !monaco.languages.typescript) return;
    var ts = monaco.languages.typescript;
    ts.typescriptDefaults.setEagerModelSync(true);
    ts.javascriptDefaults.setEagerModelSync(true);
    var opts = {
      target: ts.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      module: ts.ModuleKind.ESNext,
      noEmit: true,
      esModuleInterop: true,
      lib: ['es2020', 'dom']
    };
    ts.typescriptDefaults.setCompilerOptions(opts);
    ts.javascriptDefaults.setCompilerOptions({
      target: ts.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      checkJs: true,
      noEmit: true,
      lib: ['es2020', 'dom']
    });
    if (monaco.languages.json) {
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        allowComments: false
      });
    }
  }

  function fillLangSel() {
    var sel = $('langSel');
    if (!sel || sel.options.length) return;
    LANGS.forEach(function (l) {
      var o = document.createElement('option');
      o.value = l; o.textContent = l;
      sel.appendChild(o);
    });
  }

  function ensureModel(rec) {
    var id = rec.id;
    var name = rec.name || id;
    var lang = rec.lang || langOf(name);
    var text = rec.text == null ? '' : String(rec.text);
    var m = models[id];
    if (!m || m.isDisposed()) {
      m = monaco.editor.createModel(text, lang, uriOf(name));
      models[id] = m;
      m.onDidChangeContent(function () { onLocalEdit(id); });
    } else {
      if (m.getLanguageId() !== lang) monaco.editor.setModelLanguage(m, lang);
      if (!applying && m.getValue() !== text && !recentlyLocal(id)) {
        applying = true;
        m.setValue(text);
        applying = false;
      }
    }
    files[id] = {
      id: id, name: name, lang: lang, text: m.getValue(),
      at: rec.at || 0, by: rec.by
    };
    return m;
  }

  function recentlyLocal(id) {
    var t = lastPut[id];
    return t && (Date.now() - t < 900);
  }

  function disposeMissing(keep) {
    Object.keys(models).forEach(function (id) {
      if (keep[id]) return;
      try { models[id].dispose(); } catch (e) {}
      delete models[id];
      delete files[id];
    });
  }

  function paintFiles() {
    var list = $('fileList');
    var tabs = $('tabs');
    if (!list || !tabs) return;
    list.innerHTML = '';
    tabs.innerHTML = '';
    order.forEach(function (id) {
      var rec = files[id];
      if (!rec) return;
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'file-row' + (id === active ? ' on' : '');
      row.textContent = rec.name;
      row.addEventListener('click', function () { openFile(id, true); });
      list.appendChild(row);
      var tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'tab' + (id === active ? ' on' : '');
      tab.setAttribute('role', 'tab');
      tab.textContent = rec.name;
      tab.addEventListener('click', function () { openFile(id, true); });
      tabs.appendChild(tab);
    });
    var empty = $('empty');
    if (empty) empty.hidden = order.length > 0;
  }

  function openFile(id, closeDrawer) {
    var rec = files[id];
    if (!rec || !editor) return;
    active = id;
    editor.setModel(models[id] || ensureModel(rec));
    var sel = $('langSel');
    if (sel) sel.value = rec.lang || langOf(rec.name);
    var pill = $('langPill');
    if (pill) pill.textContent = rec.lang || langOf(rec.name);
    paintFiles();
    layoutEditor();
    persistPrefs();
    if (closeDrawer && phone) setDrawer(false);
    updatePos();
  }

  function layoutEditor() {
    phone = isPhone();
    if (!editor) return;
    wrap = wrap || phone;
    editor.updateOptions({
      minimap: { enabled: !phone },
      wordWrap: wrap ? 'on' : 'off',
      fontSize: phone ? 14 : 13,
      lineNumbers: 'on',
      padding: { top: 8, bottom: 8 },
      mouseWheelZoom: !phone,
      automaticLayout: false,
      scrollBeyondLastLine: false,
      tabSize: 2,
      renderLineHighlight: 'line',
      quickSuggestions: true,
      suggestOnTriggerCharacters: true
    });
    editor.layout();
  }

  function onLocalEdit(id) {
    if (applying) return;
    var m = models[id];
    if (!m) return;
    var rec = files[id];
    if (!rec) return;
    rec.text = m.getValue();
    lastPut[id] = Date.now();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveTimer = 0; persistFile(id); }, 220);
  }

  function persistFile(id) {
    var rec = files[id];
    var m = models[id];
    if (!rec || !m) return;
    rec.text = m.getValue();
    rec.lang = rec.lang || langOf(rec.name);
    if (rec.text.length > MAX) {
      setStatus('This file is over 400 KB — still editable, but it may lag a pair session.', true);
    }
    lastPut[id] = Date.now();
    var row = {
      id: rec.id, name: rec.name, lang: rec.lang, text: rec.text,
      at: Date.now(), by: (Mp && Mp.me && Mp.me.id) || 'local'
    };
    if (Mp && Mp.live && Mp.publishFile) Mp.publishFile(rec);
    else if (filesDb) {
      filesDb.put(row).catch(function (e) {
        setStatus(String((e && e.message) || e || 'Could not save.'), true);
      });
    }
  }

  function persistPrefs() {
    if (!prefsDb) return;
    prefsDb.put({
      id: 'ui',
      active: active,
      theme: theme,
      wrap: wrap
    }).catch(function () {});
  }

  function applyRemoteFiles(list) {
    list = list || [];
    if (!list.length && !seenFiles) return;
    if (list.length) seenFiles = true;
    var keep = Object.create(null);
    var next = [];
    list.forEach(function (rec) {
      if (!rec || rec.id == null || !rec.name) return;
      keep[rec.id] = true;
      next.push(rec.id);
      if (recentlyLocal(rec.id) && rec.text !== undefined) {
        var m = models[rec.id];
        if (m && m.getValue() === rec.text) {
          files[rec.id] = files[rec.id] || rec;
          files[rec.id].at = rec.at;
          return;
        }
      }
      ensureModel(rec);
    });
    if (next.length) order = next.slice().sort(function (a, b) {
      var na = (files[a] && files[a].name) || a;
      var nb = (files[b] && files[b].name) || b;
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
    disposeMissing(keep);
    if (!active && order.length) openFile(order[0], false);
    else if (active && !files[active] && order.length) openFile(order[0], false);
    else paintFiles();
    if (pendingLaunch) tryLaunch();
  }

  function seedIfEmpty(list) {
    if (seeded) return;
    seeded = true;
    if (list && list.length) return;
    SAMPLE.forEach(function (rec) {
      ensureModel(rec);
      persistFile(rec.id);
    });
    order = SAMPLE.map(function (r) { return r.id; });
    openFile('hello.ts', false);
    setStatus('Sample project — edit anything. It stays in this file.');
  }

  function applyCursors(live) {
    if (!editor || !monaco) return;
    if (!remoteDecos) remoteDecos = editor.createDecorationsCollection();
    var decos = [];
    remoteWidgets.forEach(function (w) { try { editor.removeContentWidget(w); } catch (e) {} });
    remoteWidgets = [];
    (live || []).forEach(function (c, i) {
      if (!c || c.fileId !== active) return;
      var line = Math.max(1, c.line | 0);
      var col = Math.max(1, c.col | 0);
      var range = new monaco.Range(line, col, line, col);
      decos.push({
        range: range,
        options: { className: 'remote-cursor', stickiness: 1 }
      });
      var node = document.createElement('div');
      node.className = 'remote-label';
      node.textContent = c.name || 'Friend';
      node.style.background = i % 2 ? '#cca700' : '#f14c4c';
      var widget = {
        getId: function () { return 'remote-' + c.id; },
        getDomNode: function () { return node; },
        getPosition: function () {
          return { position: { lineNumber: line, column: col }, preference: [0, 1] };
        }
      };
      editor.addContentWidget(widget);
      remoteWidgets.push(widget);
    });
    remoteDecos.set(decos);
  }

  function updatePos() {
    if (!editor) return;
    var p = editor.getPosition();
    var el = $('pos');
    if (el && p) el.textContent = 'Ln ' + p.lineNumber + ', Col ' + p.column;
    if (cursorTimer) clearTimeout(cursorTimer);
    cursorTimer = setTimeout(function () {
      cursorTimer = 0;
      if (Mp && Mp.publishCursor) {
        Mp.publishCursor(active, p ? p.lineNumber : 1, p ? p.column : 1);
      }
    }, 80);
  }

  function uniqueName(base) {
    var name = base, n = 2;
    function taken(nm) {
      return order.some(function (id) { return files[id] && files[id].name === nm; });
    }
    while (taken(name)) {
      var i = base.lastIndexOf('.');
      name = i > 0 ? base.slice(0, i) + '-' + n + base.slice(i) : base + '-' + n;
      n++;
    }
    return name;
  }

  function newId() {
    return 'f_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function addFile(name, text, lang) {
    name = uniqueName(String(name || 'untitled.ts').replace(/[/\\]/g, '').trim() || 'untitled.ts');
    var rec = {
      id: newId(),
      name: name,
      lang: lang || langOf(name),
      text: text == null ? '' : String(text)
    };
    ensureModel(rec);
    order.push(rec.id);
    persistFile(rec.id);
    openFile(rec.id, true);
    return rec;
  }

  function ask(title, value) {
    return new Promise(function (resolve) {
      var modal = $('modal'), input = $('modalInput'), msg = $('modalMsg');
      $('modalTitle').textContent = title;
      input.value = value || '';
      msg.hidden = true;
      modal.hidden = false;
      setTimeout(function () { input.focus(); input.select(); }, 30);
      function done(v) {
        modal.hidden = true;
        $('modalOk').removeEventListener('click', ok);
        $('modalCancel').removeEventListener('click', cancel);
        input.removeEventListener('keydown', keys);
        resolve(v);
      }
      function ok() { done(input.value); }
      function cancel() { done(null); }
      function keys(e) {
        if (e.key === 'Enter') { e.preventDefault(); ok(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      }
      $('modalOk').addEventListener('click', ok);
      $('modalCancel').addEventListener('click', cancel);
      input.addEventListener('keydown', keys);
    });
  }

  function setDrawer(on) {
    drawer = !!on;
    document.body.classList.toggle('files-open', drawer);
    $('filesBtn').setAttribute('aria-expanded', drawer ? 'true' : 'false');
  }

  function setMenu(on) {
    var menu = $('moreMenu');
    if (!menu) return;
    menu.hidden = !on;
    document.body.classList.toggle('menu-open', !!on);
    $('moreBtn').setAttribute('aria-expanded', on ? 'true' : 'false');
  }

  function currentName() {
    return (files[active] && files[active].name) || '';
  }

  function tryLaunch() {
    if (!pendingLaunch || !order.length) return;
    var want = String(pendingLaunch).trim();
    pendingLaunch = null;
    if (!want) return;
    var hit = order.filter(function (id) {
      return files[id] && files[id].name === want;
    })[0];
    if (!hit) {
      hit = order.filter(function (id) {
        return files[id] && files[id].name.toLowerCase() === want.toLowerCase();
      })[0];
    }
    if (hit) openFile(hit, true);
  }

  function readPicked(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(new Error('Could not read ' + file.name)); };
      r.readAsText(file);
    });
  }

  function downloadActive() {
    var rec = files[active];
    if (!rec) return;
    var blob = new Blob([rec.text || ''], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = rec.name || 'file.txt';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  function bind() {
    fillLangSel();
    $('filesBtn').addEventListener('click', function () { setDrawer(!drawer); setMenu(false); });
    $('moreBtn').addEventListener('click', function () { setMenu($('moreMenu').hidden); });
    $('newBtn').addEventListener('click', onNew);
    $('newSideBtn').addEventListener('click', onNew);
    $('findBtn').addEventListener('click', function () {
      if (editor) editor.getAction('actions.find').run();
    });
    $('formatBtn').addEventListener('click', function () {
      if (!editor) return;
      var act = editor.getAction('editor.action.formatDocument');
      if (act) act.run();
    });
    $('renameBtn').addEventListener('click', onRename);
    $('deleteBtn').addEventListener('click', onDelete);
    $('downloadBtn').addEventListener('click', function () { setMenu(false); downloadActive(); });
    $('wrapBtn').addEventListener('click', function () {
      wrap = !wrap;
      layoutEditor();
      persistPrefs();
      setMenu(false);
    });
    $('themeSel').addEventListener('change', function () {
      theme = $('themeSel').value || 'vs-dark';
      monaco.editor.setTheme(theme);
      persistPrefs();
    });
    $('langSel').addEventListener('change', function () {
      var rec = files[active];
      var m = models[active];
      if (!rec || !m) return;
      rec.lang = $('langSel').value;
      monaco.editor.setModelLanguage(m, rec.lang);
      $('langPill').textContent = rec.lang;
      persistFile(active);
    });
    $('open').addEventListener('change', function () {
      var input = $('open');
      var picked = input.files ? Array.prototype.slice.call(input.files) : [];
      input.value = '';
      picked.forEach(function (f) {
        readPicked(f).then(function (text) {
          addFile(f.name, text);
        }).catch(function (e) { setStatus(String(e.message || e), true); });
      });
    });
    document.addEventListener('click', function (e) {
      if (!$('moreMenu').hidden && !e.target.closest('#moreMenu') && !e.target.closest('#moreBtn')) {
        setMenu(false);
      }
    });
    root.addEventListener('resize', function () { layoutEditor(); });
  }

  function onNew() {
    setMenu(false);
    ask('New file name', 'untitled.ts').then(function (name) {
      if (name == null) return;
      name = String(name).replace(/[/\\]/g, '').trim();
      if (!name) return;
      addFile(name, '');
    });
  }

  function onRename() {
    setMenu(false);
    var rec = files[active];
    if (!rec) return;
    ask('Rename', rec.name).then(function (name) {
      if (name == null) return;
      name = String(name).replace(/[/\\]/g, '').trim();
      if (!name || name === rec.name) return;
      rec.name = uniqueName(name);
      rec.lang = langOf(rec.name);
      var old = models[rec.id];
      var text = old ? old.getValue() : rec.text;
      if (old) { try { old.dispose(); } catch (e) {} }
      models[rec.id] = monaco.editor.createModel(text, rec.lang, uriOf(rec.name));
      models[rec.id].onDidChangeContent(function () { onLocalEdit(rec.id); });
      persistFile(rec.id);
      openFile(rec.id, false);
    });
  }

  function onDelete() {
    setMenu(false);
    var rec = files[active];
    if (!rec) return;
    ask('Type the file name to delete it', rec.name).then(function (typed) {
      if (typed == null) return;
      if (String(typed) !== rec.name) {
        setStatus('Name did not match — file kept.', true);
        return;
      }
      var id = rec.id;
      if (models[id]) { try { models[id].dispose(); } catch (e) {} }
      delete models[id];
      delete files[id];
      order = order.filter(function (x) { return x !== id; });
      if (filesDb) filesDb.delete(id).catch(function () {});
      active = order[0] || null;
      if (active) openFile(active, false);
      else {
        if (editor) editor.setModel(null);
        paintFiles();
      }
    });
  }

  function bootEditor() {
    if (!monaco || !monaco.editor) {
      setStatus('The editor did not load.', true);
      return;
    }
    configureLangs();
    editor = monaco.editor.create($('editor'), {
      value: '',
      language: 'typescript',
      theme: theme,
      automaticLayout: false,
      minimap: { enabled: true },
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 13,
      tabSize: 2,
      renderWhitespace: 'selection',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      ariaLabel: 'Code editor'
    });
    editor.onDidChangeCursorPosition(updatePos);
    editor.onDidFocusEditorText(function () { setMenu(false); });
    if (root.ResizeObserver) {
      new ResizeObserver(function () { if (editor) editor.layout(); }).observe($('editor'));
    }
    layoutEditor();
    setStatus('Saved in this file.');
  }

  function loadPrefs(list) {
    var rec = null;
    (list || []).forEach(function (r) { if (r && r.id === 'ui') rec = r; });
    if (!rec) return;
    if (rec.theme && rec.theme !== theme) {
      theme = rec.theme;
      $('themeSel').value = theme;
      if (monaco && monaco.editor) monaco.editor.setTheme(theme);
    }
    if (typeof rec.wrap === 'boolean') wrap = rec.wrap;
    if (rec.active) active = rec.active;
  }

  function startDb() {
    if (!api || !api.db) {
      seedIfEmpty([]);
      if (Mp && Mp.onStatus) setMeet('Press Invite in the bar above to pair-edit these files.');
      return;
    }
    try {
      filesDb = api.db('files');
      prefsDb = api.db('prefs');
    } catch (e) {
      setStatus(String(e.message || e), true);
      return;
    }
    prefsDb.getAll().then(loadPrefs).catch(function () {});
    if (Mp) {
      Mp.onFiles = applyRemoteFiles;
      Mp.onCursors = applyCursors;
      Mp.onStatus = function (msg, err) {
        if (err) setStatus(msg, true);
        else setMeet(msg);
      };
      Mp.watch();
      Mp.startBeat();
    }
    filesDb.getAll().then(function (list) {
      if (!list || !list.length) seedIfEmpty([]);
      else applyRemoteFiles(list);
    }).catch(function () { seedIfEmpty([]); });
    if (api.launch) {
      api.launch().then(function (a) {
        if (a && a.file) { pendingLaunch = a.file; tryLaunch(); }
      }).catch(function () {});
    }
  }

  function onBack() {
    if (!$('modal').hidden) { $('modal').hidden = true; return true; }
    if (!$('moreMenu').hidden) { setMenu(false); return true; }
    if (drawer) { setDrawer(false); return true; }
    return false;
  }

  bind();
  bootEditor();
  startDb();
  if (api && api.onBack) api.onBack(onBack);

  root.MonacoCode = {
    langOf: langOf,
    uniqueName: uniqueName
  };
})(typeof window !== 'undefined' ? window : this);
