/* JupyterLite: notebook UI. Kernel in a blob worker. Last notebook is private-shared. */
(function () {
  'use strict';

  var WASM_ASSET = 'pyodide.asm.wasm';
  var STDLIB_ASSET = 'python_stdlib.zip';
  var LOCK_ASSET = 'pyodide-lock.json';
  var WASM_BYTES = 10105545;
  var MAX_CELLS = 80;
  var MAX_SRC = 50000;
  var MAX_OUT = 20000;

  var STARTER_NAME = 'Welcome.ipynb';
  var STARTER = [
    {
      type: 'markdown',
      source: '# Welcome\n\nA Python notebook in this file. **Shift+Enter** runs a cell (on a phone, the play button). The first Run starts Python — about 10 MB, once.'
    },
    {
      type: 'code',
      source: 'import sys, math\nprint(sys.version.split()[0])\nprint("π ≈", round(math.pi, 6))'
    },
    {
      type: 'code',
      source: 'from collections import Counter\nwords = "to be or not to be that is the question".split()\nCounter(words)'
    },
    {
      type: 'code',
      source: 'def fib(n):\n    a, b = 0, 1\n    out = []\n    for _ in range(n):\n        out.append(a)\n        a, b = b, a + b\n    return out\n\nfib(12)'
    }
  ];

  function $(id) { return document.getElementById(id); }
  function nid() { return 'c' + Math.random().toString(36).slice(2, 9); }
  function clip(s, n) {
    s = String(s == null ? '' : s);
    if (s.length <= n) return s;
    return s.slice(0, n) + '\n…';
  }

  function seedCells() {
    return STARTER.map(function (c) {
      return {
        id: nid(),
        type: c.type,
        source: c.source,
        outputs: [],
        exec: null,
        preview: c.type === 'markdown'
      };
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }
  function inlineMd(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return s;
  }
  function renderMd(src) {
    var lines = String(src || '').split('\n');
    var html = [];
    var list = false;
    function close() { if (list) { html.push('</ul>'); list = false; } }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^### /.test(line)) { close(); html.push('<h3>' + inlineMd(line.slice(4)) + '</h3>'); }
      else if (/^## /.test(line)) { close(); html.push('<h2>' + inlineMd(line.slice(3)) + '</h2>'); }
      else if (/^# /.test(line)) { close(); html.push('<h1>' + inlineMd(line.slice(2)) + '</h1>'); }
      else if (/^[-*] /.test(line)) {
        if (!list) { html.push('<ul>'); list = true; }
        html.push('<li>' + inlineMd(line.slice(2)) + '</li>');
      } else if (!line.trim()) {
        close();
      } else {
        close();
        html.push('<p>' + inlineMd(line) + '</p>');
      }
    }
    close();
    return html.join('') || '<p class="ph">Empty text cell. Tap to edit.</p>';
  }

  var state = {
    name: STARTER_NAME,
    cells: seedCells(),
    sel: null,
    rev: 0,
    exec: 0,
    ready: false,
    writing: false
  };

  var nbDb = null;
  var saveTimer = 0;
  var worker = null;
  var booted = false;
  var booting = null;
  var pending = null;
  var runQueue = [];
  var runningId = null;

  try { if (window.gifos && gifos.db) nbDb = gifos.db('notebook'); } catch (e) {}

  function setStatus(msg, warn) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (warn ? ' warn' : '');
  }
  function setKernel(msg, kind) {
    var el = $('kstatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'kstatus' + (kind ? ' ' + kind : '');
  }
  function setBar(frac) {
    var bar = $('prog'), fill = $('progfill');
    if (!bar || !fill) return;
    if (frac == null) { bar.hidden = true; fill.style.width = '0'; return; }
    bar.hidden = false;
    fill.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
  }

  function persist() {
    if (!state.ready || !nbDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      state.rev += 1;
      var rec = {
        id: 'current',
        name: state.name,
        cells: state.cells.map(function (c) {
          return {
            id: c.id,
            type: c.type,
            source: String(c.source || '').slice(0, MAX_SRC),
            outputs: (c.outputs || []).map(function (o) {
              return { type: o.type, text: clip(o.text, MAX_OUT) };
            }),
            exec: c.exec,
            preview: !!c.preview
          };
        }),
        exec: state.exec,
        rev: state.rev
      };
      state.writing = true;
      nbDb.put(rec).then(function () {
        state.writing = false;
      }, function (e) {
        state.writing = false;
        setStatus(String(e && e.message || e), true);
      });
    }, 350);
  }

  function applyRecord(rec) {
    if (!rec || rec.id !== 'current') return;
    if (typeof rec.rev === 'number' && rec.rev < state.rev) return;
    state.name = rec.name || STARTER_NAME;
    state.exec = rec.exec || 0;
    state.rev = rec.rev || state.rev;
    if (Array.isArray(rec.cells) && rec.cells.length) {
      state.cells = rec.cells.map(function (c) {
        return {
          id: c.id || nid(),
          type: c.type === 'markdown' ? 'markdown' : 'code',
          source: String(c.source || '').slice(0, MAX_SRC),
          outputs: Array.isArray(c.outputs) ? c.outputs : [],
          exec: c.exec || null,
          preview: c.type === 'markdown' ? (c.preview !== false) : false
        };
      });
    }
    var title = $('title');
    if (title && title.value !== state.name) title.value = state.name;
    if (!state.sel || !state.cells.some(function (c) { return c.id === state.sel; })) {
      state.sel = state.cells[0] && state.cells[0].id;
    }
    paint();
  }

  function cellById(id) {
    for (var i = 0; i < state.cells.length; i++) if (state.cells[i].id === id) return state.cells[i];
    return null;
  }
  function cellIndex(id) {
    for (var i = 0; i < state.cells.length; i++) if (state.cells[i].id === id) return i;
    return -1;
  }

  function autosize(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.max(52, Math.min(420, ta.scrollHeight)) + 'px';
  }

  function paintCell(c) {
    var art = document.createElement('article');
    art.className = 'cell ' + (c.type === 'markdown' ? 'md' : 'code') + (state.sel === c.id ? ' sel' : '') + (runningId === c.id ? ' running' : '');
    art.setAttribute('data-id', c.id);

    var g = document.createElement('div');
    g.className = 'gutter';
    var pr = document.createElement('span');
    pr.className = 'prompt';
    if (c.type === 'markdown') pr.textContent = 'Md';
    else if (runningId === c.id) pr.textContent = 'In [*]:';
    else pr.textContent = 'In [' + (c.exec == null ? ' ' : c.exec) + ']:';
    g.appendChild(pr);

    var play = document.createElement('button');
    play.type = 'button';
    play.className = 'play';
    play.textContent = '▶';
    play.title = 'Run';
    play.addEventListener('click', function (ev) { ev.stopPropagation(); select(c.id); runOne(c.id, true); });
    g.appendChild(play);

    var up = document.createElement('button');
    up.type = 'button';
    up.textContent = '↑';
    up.title = 'Move up';
    up.addEventListener('click', function (ev) { ev.stopPropagation(); move(c.id, -1); });
    g.appendChild(up);
    var down = document.createElement('button');
    down.type = 'button';
    down.textContent = '↓';
    down.title = 'Move down';
    down.addEventListener('click', function (ev) { ev.stopPropagation(); move(c.id, 1); });
    g.appendChild(down);
    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'row-del';
    del.title = 'Delete cell';
    del.setAttribute('aria-label', 'Delete cell');
    del.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
    del.addEventListener('click', function (ev) { ev.stopPropagation(); removeCell(c.id); });
    g.appendChild(del);
    art.appendChild(g);

    var body = document.createElement('div');
    body.className = 'body';

    if (c.type === 'markdown' && c.preview) {
      var view = document.createElement('div');
      view.className = 'mdview' + (c.source && c.source.trim() ? '' : ' ph');
      view.innerHTML = renderMd(c.source);
      view.addEventListener('click', function () {
        c.preview = false;
        select(c.id);
        paint();
        persist();
        var ta = document.querySelector('article[data-id="' + c.id + '"] textarea');
        if (ta) { ta.focus(); autosize(ta); }
      });
      body.appendChild(view);
    } else {
      var ta = document.createElement('textarea');
      ta.spellcheck = false;
      ta.setAttribute('autocapitalize', 'off');
      ta.setAttribute('autocomplete', 'off');
      ta.setAttribute('autocorrect', 'off');
      ta.setAttribute('inputmode', 'text');
      ta.value = c.source || '';
      ta.addEventListener('focus', function () { select(c.id); });
      ta.addEventListener('input', function () {
        c.source = ta.value;
        autosize(ta);
        persist();
      });
      ta.addEventListener('keydown', function (ev) { onEditorKey(ev, c, ta); });
      body.appendChild(ta);
    }

    if (c.type === 'code' && c.outputs && c.outputs.length) {
      var out = document.createElement('div');
      out.className = 'out';
      c.outputs.forEach(function (o) {
        if (o.type === 'result') {
          var cap = document.createElement('div');
          cap.className = 'cap';
          cap.textContent = 'Out [' + (c.exec == null ? ' ' : c.exec) + ']:';
          out.appendChild(cap);
        }
        var pre = document.createElement('div');
        pre.className = o.type === 'error' ? 'error' : (o.type === 'result' ? 'result' : 'stream');
        pre.textContent = o.text || '';
        out.appendChild(pre);
      });
      body.appendChild(out);
    }
    art.appendChild(body);
    art.addEventListener('click', function () { select(c.id); });
    return art;
  }

  function paint() {
    var box = $('cells');
    if (!box) return;
    var keep = null;
    var ae = document.activeElement;
    if (ae && ae.tagName === 'TEXTAREA' && box.contains(ae)) keep = { id: ae.closest('.cell').getAttribute('data-id'), start: ae.selectionStart, end: ae.selectionEnd };
    box.textContent = '';
    state.cells.forEach(function (c) { box.appendChild(paintCell(c)); });
    box.querySelectorAll('textarea').forEach(autosize);
    if (keep) {
      var ta = box.querySelector('article[data-id="' + keep.id + '"] textarea');
      if (ta) {
        ta.focus();
        try { ta.setSelectionRange(keep.start, keep.end); } catch (e) {}
      }
    }
  }

  function select(id) {
    if (state.sel === id) return;
    state.sel = id;
    document.querySelectorAll('.cell').forEach(function (el) {
      el.classList.toggle('sel', el.getAttribute('data-id') === id);
    });
  }

  function addCell(type, afterId) {
    if (state.cells.length >= MAX_CELLS) { setStatus('This notebook is full (' + MAX_CELLS + ' cells).', true); return; }
    var c = { id: nid(), type: type, source: '', outputs: [], exec: null, preview: false };
    var i = cellIndex(afterId != null ? afterId : state.sel);
    if (i < 0) state.cells.push(c);
    else state.cells.splice(i + 1, 0, c);
    state.sel = c.id;
    paint();
    persist();
    var ta = document.querySelector('article[data-id="' + c.id + '"] textarea');
    if (ta) ta.focus();
  }

  function removeCell(id) {
    if (state.cells.length <= 1) { setStatus('A notebook needs at least one cell.'); return; }
    var i = cellIndex(id);
    if (i < 0) return;
    state.cells.splice(i, 1);
    var next = state.cells[Math.min(i, state.cells.length - 1)];
    state.sel = next && next.id;
    paint();
    persist();
  }

  function move(id, dir) {
    var i = cellIndex(id);
    var j = i + dir;
    if (i < 0 || j < 0 || j >= state.cells.length) return;
    var t = state.cells[i];
    state.cells[i] = state.cells[j];
    state.cells[j] = t;
    state.sel = id;
    paint();
    persist();
  }

  function onEditorKey(ev, c, ta) {
    if (ev.key === 'Tab' && !ev.altKey) {
      ev.preventDefault();
      var a = ta.selectionStart, b = ta.selectionEnd;
      ta.value = ta.value.slice(0, a) + '    ' + ta.value.slice(b);
      ta.selectionStart = ta.selectionEnd = a + 4;
      c.source = ta.value;
      persist();
      return;
    }
    var runStay = (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey));
    var runNext = (ev.key === 'Enter' && ev.shiftKey);
    if (runStay || runNext) {
      ev.preventDefault();
      c.source = ta.value;
      runOne(c.id, runNext);
    }
  }

  function hasGifos() { return !!(window.gifos && gifos.assets); }

  function assetBytes(path) {
    if (!hasGifos()) {
      return Promise.reject(new Error('This app needs to run inside GifOS to start Python.'));
    }
    return gifos.assets(path).then(function (buf) {
      if (!buf || !buf.byteLength) throw new Error('“' + path + '” came back empty.');
      return buf;
    }, function (e) {
      throw new Error('Could not read “' + path + '”: ' + (e && e.message || e));
    });
  }

  function waitFor(type) {
    return new Promise(function (res, rej) {
      pending = { type: type, res: res, rej: rej };
    });
  }

  function onWorkerMessage(e) {
    var d = e.data || {};
    if (d.type === 'error') {
      var err = new Error(d.error || 'Kernel error');
      if (pending) { pending.rej(err); pending = null; }
      else setStatus(err.message, true);
      return;
    }
    if (pending && pending.type === d.type) {
      pending.res(d);
      pending = null;
    }
  }

  function ensureWorker() {
    if (worker) return Promise.resolve();
    if (!window.KERNEL_WORKER_SRC) return Promise.reject(new Error('The Python worker did not load.'));
    var blob = new Blob([window.KERNEL_WORKER_SRC], { type: 'text/javascript' });
    try {
      worker = new Worker(URL.createObjectURL(blob));
    } catch (e) {
      return Promise.reject(new Error(String(e && e.message || e)));
    }
    worker.onmessage = onWorkerMessage;
    worker.onerror = function (ev) {
      var msg = (ev && ev.message) || 'Python worker failed';
      if (pending) { pending.rej(new Error(msg)); pending = null; }
      else setStatus(msg, true);
    };
    return Promise.resolve();
  }

  function killWorker() {
    if (worker) {
      try { worker.terminate(); } catch (e) {}
      worker = null;
    }
    booted = false;
    pending = null;
    runningId = null;
  }

  function bootKernel() {
    if (booted) return Promise.resolve();
    if (booting) return booting;
    setKernel('Python starting…', 'busy');
    setStatus('Downloading Python… the first time this is about ' + (WASM_BYTES / 1e6).toFixed(0) + ' MB, then it stays on this device.');
    setBar(0.08);
    booting = ensureWorker().then(function () {
      setBar(0.15);
      return Promise.all([
        assetBytes(WASM_ASSET),
        assetBytes(STDLIB_ASSET),
        assetBytes(LOCK_ASSET)
      ]);
    }).then(function (bufs) {
      setStatus('Starting Python…');
      setBar(0.55);
      var p = waitFor('ready');
      worker.postMessage({ type: 'boot', wasm: bufs[0], stdlib: bufs[1], lock: bufs[2] }, bufs);
      return p;
    }).then(function (msg) {
      booted = true;
      booting = null;
      setBar(null);
      var ver = msg && msg.version ? 'Python ' + msg.version : 'Python';
      setKernel(ver + ' · idle', 'ok');
      setStatus('');
    }).catch(function (e) {
      booting = null;
      killWorker();
      setBar(null);
      setKernel('Python not started', 'bad');
      setStatus(String(e && e.message || e), true);
      throw e;
    });
    return booting;
  }

  function drainQueue() {
    if (runningId || !runQueue.length) return;
    var job = runQueue.shift();
    var c = cellById(job.id);
    if (!c) { drainQueue(); return; }
    if (c.type === 'markdown') {
      c.preview = true;
      runningId = null;
      paint();
      persist();
      if (job.advance) advance(c.id);
      drainQueue();
      return;
    }
    runningId = c.id;
    paint();
    setKernel('Python · busy', 'busy');
    var p = waitFor('result');
    worker.postMessage({ type: 'run', id: c.id, code: c.source || '' });
    p.then(function (msg) {
      runningId = null;
      state.exec += 1;
      c.exec = state.exec;
      var outs = [];
      if (msg.stdout) outs.push({ type: 'stream', text: clip(msg.stdout, MAX_OUT) });
      if (msg.stderr) outs.push({ type: 'stream', text: clip(msg.stderr, MAX_OUT) });
      if (msg.ok && msg.repr) outs.push({ type: 'result', text: clip(msg.repr, MAX_OUT) });
      if (!msg.ok && msg.error) outs.push({ type: 'error', text: clip(msg.error, MAX_OUT) });
      c.outputs = outs;
      setKernel('Python · idle', 'ok');
      setStatus(msg.ok ? '' : 'That cell did not run.', !msg.ok);
      paint();
      persist();
      if (job.advance) advance(c.id);
      drainQueue();
    }, function (e) {
      runningId = null;
      setKernel('Python · idle', 'ok');
      setStatus(String(e && e.message || e), true);
      paint();
      drainQueue();
    });
  }

  function runOne(id, advanceAfter) {
    var c = cellById(id) || cellById(state.sel);
    if (!c) return;
    if (c.type === 'markdown') {
      c.preview = true;
      paint();
      persist();
      if (advanceAfter) advance(c.id);
      return;
    }
    bootKernel().then(function () {
      runQueue.push({ id: c.id, advance: !!advanceAfter });
      drainQueue();
    }, function () {});
  }

  function runAll() {
    bootKernel().then(function () {
      state.cells.forEach(function (c) {
        if (c.type === 'markdown') c.preview = true;
        else runQueue.push({ id: c.id, advance: false });
      });
      paint();
      persist();
      drainQueue();
    }, function () {});
  }

  function advance(id) {
    var i = cellIndex(id);
    if (i < 0) return;
    if (i === state.cells.length - 1) {
      addCell('code', id);
      return;
    }
    var n = state.cells[i + 1];
    state.sel = n.id;
    paint();
    var ta = document.querySelector('article[data-id="' + n.id + '"] textarea');
    if (ta) ta.focus();
  }

  function restart() {
    killWorker();
    runQueue = [];
    setKernel('Python starting…', 'busy');
    bootKernel().then(function () {
      setStatus('Kernel restarted. Cell text is the same; run again for new output.');
    }, function () {});
  }

  function toIpynb() {
    return {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        kernelspec: { name: 'python3', display_name: 'Python 3', language: 'python' },
        language_info: { name: 'python', version: '3.12.7' }
      },
      cells: state.cells.map(function (c) {
        if (c.type === 'markdown') {
          return { cell_type: 'markdown', metadata: {}, source: splitSrc(c.source) };
        }
        var outputs = (c.outputs || []).map(function (o) {
          if (o.type === 'error') {
            return { output_type: 'error', ename: 'Error', evalue: o.text, traceback: String(o.text || '').split('\n') };
          }
          if (o.type === 'result') {
            return { output_type: 'execute_result', metadata: {}, data: { 'text/plain': splitSrc(o.text) }, execution_count: c.exec };
          }
          return { output_type: 'stream', name: 'stdout', text: splitSrc(o.text) };
        });
        return {
          cell_type: 'code',
          metadata: {},
          execution_count: c.exec,
          source: splitSrc(c.source),
          outputs: outputs
        };
      })
    };
  }
  function splitSrc(s) {
    s = String(s == null ? '' : s);
    if (!s) return [];
    var lines = s.split('\n');
    return lines.map(function (ln, i) { return ln + (i < lines.length - 1 ? '\n' : ''); });
  }

  function fromIpynb(obj) {
    if (!obj || !Array.isArray(obj.cells)) throw new Error('That file is not a notebook.');
    var cells = obj.cells.map(function (c) {
      var src = Array.isArray(c.source) ? c.source.join('') : String(c.source || '');
      var type = c.cell_type === 'markdown' ? 'markdown' : 'code';
      var outputs = [];
      if (type === 'code' && Array.isArray(c.outputs)) {
        c.outputs.forEach(function (o) {
          if (!o) return;
          if (o.output_type === 'stream') {
            outputs.push({ type: 'stream', text: clip([].concat(o.text).join(''), MAX_OUT) });
          } else if (o.output_type === 'error') {
            outputs.push({ type: 'error', text: clip((o.ename || '') + ': ' + (o.evalue || '') + '\n' + (o.traceback || []).join('\n'), MAX_OUT) });
          } else if (o.data && o.data['text/plain']) {
            outputs.push({ type: 'result', text: clip([].concat(o.data['text/plain']).join(''), MAX_OUT) });
          }
        });
      }
      return {
        id: nid(),
        type: type,
        source: src.slice(0, MAX_SRC),
        outputs: outputs,
        exec: c.execution_count || null,
        preview: type === 'markdown'
      };
    }).filter(Boolean);
    if (!cells.length) cells = seedCells();
    if (cells.length > MAX_CELLS) cells = cells.slice(0, MAX_CELLS);
    return cells;
  }

  function downloadIpynb() {
    var blob = new Blob([JSON.stringify(toIpynb(), null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.name || 'notebook').replace(/[^\w.-]+/g, '_') || 'notebook.ipynb';
    if (!/\.ipynb$/i.test(a.download)) a.download += '.ipynb';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function openFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var obj = JSON.parse(String(reader.result || ''));
        state.cells = fromIpynb(obj);
        state.name = file.name || 'notebook.ipynb';
        state.sel = state.cells[0].id;
        state.exec = 0;
        $('title').value = state.name;
        paint();
        persist();
        setStatus('Opened ' + state.name + '.');
      } catch (e) {
        setStatus(String(e && e.message || 'Could not read that notebook.'), true);
      }
    };
    reader.readAsText(file);
  }

  function fresh() {
    if (!window.confirm('Start a new notebook? The current cells on this device will be replaced.')) return;
    state.cells = seedCells();
    state.name = STARTER_NAME;
    state.sel = state.cells[0].id;
    state.exec = 0;
    $('title').value = state.name;
    paint();
    persist();
  }

  function bind() {
    $('run').addEventListener('click', function () { runOne(state.sel, true); });
    $('runall').addEventListener('click', runAll);
    $('addcode').addEventListener('click', function () { addCell('code'); });
    $('addmd').addEventListener('click', function () { addCell('markdown'); });
    $('restart').addEventListener('click', restart);
    $('dl').addEventListener('click', downloadIpynb);
    $('fresh').addEventListener('click', fresh);
    $('file').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      openFile(f);
    });
    $('title').addEventListener('input', function () {
      state.name = $('title').value || STARTER_NAME;
      persist();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.target && ev.target.tagName === 'TEXTAREA') return;
      if (ev.target && ev.target.id === 'title') return;
      if (ev.key === 'Enter' && ev.shiftKey) { ev.preventDefault(); runOne(state.sel, true); }
    });
    if (window.gifos && gifos.onBack) {
      gifos.onBack(function () {
        var ae = document.activeElement;
        if (ae && (ae.tagName === 'TEXTAREA' || ae.id === 'title')) { ae.blur(); return; }
        var c = cellById(state.sel);
        if (c && c.type === 'code' && !c.preview) { /* already viewing */ }
        if (c && c.type === 'markdown' && !c.preview) {
          c.preview = true;
          paint();
          persist();
        }
      });
    }
  }

  function bootLaunch() {
    if (!window.gifos || !gifos.launch) return;
    gifos.launch().then(function (a) {
      if (!a || a.src == null || a.src === '') return;
      addCell('code');
      var c = cellById(state.sel);
      if (!c) return;
      c.source = String(a.src).slice(0, MAX_SRC);
      paint();
      persist();
      runOne(c.id, false);
    }, function () {});
  }

  function start() {
    bind();
    state.sel = state.cells[0].id;
    paint();
    if (nbDb && nbDb.subscribe) {
      nbDb.subscribe(function (rows) {
        if (state.writing) return;
        var rec = null;
        for (var i = 0; i < (rows || []).length; i++) if (rows[i] && rows[i].id === 'current') rec = rows[i];
        if (!rec) {
          state.ready = true;
          persist();
          return;
        }
        var first = !state.ready;
        state.ready = true;
        applyRecord(rec);
        if (first) bootKernel().catch(function () {});
      });
    } else {
      state.ready = true;
      persist();
      bootKernel().catch(function () {});
    }
    bootLaunch();
    setTimeout(function () { if (!booted && !booting) bootKernel().catch(function () {}); }, 400);
  }

  start();
})();
