/* JSON Editor: last document is private. Meeting watch is optional (mp.js).
 * Nothing is fetched. Tree and code share one document. */
(function (root) {
  'use strict';

  var SAMPLE = {
    project: 'notes',
    offline: true,
    modes: ['tree', 'code'],
    user: { id: 'a1', role: 'editor' },
    items: [
      { id: 'x', n: 1 },
      { id: 'y', n: 2 }
    ]
  };

  function isEmptyDoc(doc) {
    if (Array.isArray(doc)) return doc.length === 0;
    if (doc && typeof doc === 'object') return Object.keys(doc).length === 0;
    return false;
  }

  function friendlyError(e) {
    var msg = String((e && e.message) || e || 'parse error');
    msg = msg.replace(/^JSON\.parse:\s*/i, '');
    if (/Unexpected end/i.test(msg)) {
      return 'Not valid JSON — the text ends early. A quote or bracket may be missing. (' + msg + ')';
    }
    if (/Unexpected token|Expected|Unexpected character|Bad control/i.test(msg)) {
      return 'Not valid JSON — ' + msg;
    }
    return 'Not valid JSON — ' + msg;
  }

  function parseJson(text) {
    var raw = String(text == null ? '' : text);
    if (!raw.trim()) return { empty: true, text: raw };
    try {
      return { value: JSON.parse(raw), text: raw };
    } catch (e) {
      return { error: true, message: friendlyError(e), text: raw };
    }
  }

  function stripComments(s) {
    var out = '', i = 0, n = s.length, inStr = false, q = '', esc = false;
    while (i < n) {
      var c = s.charAt(i), n1 = s.charAt(i + 1);
      if (inStr) {
        out += c;
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === q) inStr = false;
        i++;
        continue;
      }
      if (c === '"' || c === '\'') { inStr = true; q = c; out += c; i++; continue; }
      if (c === '/' && n1 === '/') {
        i += 2;
        while (i < n && s.charAt(i) !== '\n') i++;
        continue;
      }
      if (c === '/' && n1 === '*') {
        i += 2;
        while (i < n && !(s.charAt(i) === '*' && s.charAt(i + 1) === '/')) i++;
        i += 2;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }

  function repairText(text) {
    var raw = String(text == null ? '' : text);
    var parsed = parseJson(raw);
    if (parsed.empty) return { empty: true, text: raw };
    if (!parsed.error) {
      return { value: parsed.value, text: JSON.stringify(parsed.value, null, 2), repaired: false };
    }
    var fixed = stripComments(raw).replace(/,\s*([}\]])/g, '$1');
    fixed = fixed.replace(/([\{\[,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3');
    try {
      var value = JSON.parse(fixed);
      return { value: value, text: JSON.stringify(value, null, 2), repaired: true };
    } catch (e) {
      return { error: true, message: parsed.message, text: raw };
    }
  }

  function formatText(text) {
    var parsed = parseJson(text);
    if (parsed.empty) return parsed;
    if (parsed.error) return parsed;
    return { value: parsed.value, text: JSON.stringify(parsed.value, null, 2) };
  }

  function compactText(text) {
    var parsed = parseJson(text);
    if (parsed.empty) return parsed;
    if (parsed.error) return parsed;
    return { value: parsed.value, text: JSON.stringify(parsed.value) };
  }

  function setAt(doc, path, value) {
    if (!path || !path.length) return value;
    var cur = doc;
    for (var i = 0; i < path.length - 1; i++) {
      if (cur == null) return doc;
      cur = cur[path[i]];
    }
    if (cur == null) return doc;
    cur[path[path.length - 1]] = value;
    return doc;
  }

  function persistRecord(mode, parsed) {
    var rec = { id: 'last', mode: mode === 'code' || mode === 'text' ? 'code' : 'tree' };
    if (!parsed || parsed.empty) {
      rec.doc = null;
      rec.text = (parsed && parsed.text) || '';
    } else if (parsed.error) {
      rec.doc = null;
      rec.text = parsed.text || '';
    } else {
      rec.doc = parsed.value;
      rec.text = null;
    }
    return rec;
  }

  function loadRecord(rec) {
    var mode = rec && rec.mode === 'code' ? 'code' : (rec && rec.mode === 'text' ? 'code' : 'tree');
    if (!rec || (rec.doc == null && (rec.text == null || rec.text === ''))) {
      return { mode: 'tree', empty: true, doc: {}, text: '{}', parsed: parseJson('{}') };
    }
    if (rec.doc != null) {
      var text = JSON.stringify(rec.doc, null, 2);
      return {
        mode: mode,
        empty: isEmptyDoc(rec.doc),
        doc: rec.doc,
        text: text,
        parsed: { value: rec.doc, text: text }
      };
    }
    var parsed = parseJson(rec.text);
    if (parsed.empty) {
      return { mode: 'code', empty: true, doc: {}, text: rec.text || '', parsed: parsed };
    }
    if (parsed.error) {
      return { mode: 'code', empty: false, invalid: true, doc: null, text: rec.text, parsed: parsed, message: parsed.message };
    }
    return {
      mode: mode,
      empty: isEmptyDoc(parsed.value),
      doc: parsed.value,
      text: rec.text,
      parsed: parsed
    };
  }

  var App = {
    SAMPLE: SAMPLE,
    parseJson: parseJson,
    formatText: formatText,
    compactText: compactText,
    repairText: repairText,
    friendlyError: friendlyError,
    isEmptyDoc: isEmptyDoc,
    setAt: setAt,
    persistRecord: persistRecord,
    loadRecord: loadRecord
  };
  root.JsonEditorApp = App;

  var $ = function (id) {
    return root.document ? root.document.getElementById(id) : null;
  };

  var saveDb = null;
  var saveTimer = 0;
  var editor = null;
  var ready = false;
  var applying = false;
  var mode = 'tree';
  var guest = false;
  var localHold = null;

  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  function setStatus(msg) {
    var el = $('status');
    if (el) el.textContent = msg || '';
  }

  function setError(msg) {
    var el = $('err');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = msg;
  }

  function setHint(on) {
    var el = $('hint');
    if (el) el.hidden = !on;
  }

  function syncTabs(next) {
    mode = next === 'code' ? 'code' : 'tree';
    [['tabTree', 'tree'], ['tabCode', 'code']].forEach(function (pair) {
      var el = $(pair[0]);
      if (!el) return;
      var on = pair[1] === mode;
      el.classList.toggle('on', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function disableAceWorker(ed) {
    try {
      var ace = ed && ed.aceEditor;
      if (ace && ace.session && ace.session.setUseWorker) ace.session.setUseWorker(false);
    } catch (e) {}
  }

  function editorText() {
    if (!editor) return '';
    try { return editor.getText(); } catch (e) { return ''; }
  }

  function snapshotFromEditor() {
    var text = editorText();
    var parsed = parseJson(text);
    var cur = 'tree';
    try { if (editor && editor.getMode) cur = editor.getMode(); } catch (e) {}
    if (cur === 'text') cur = 'code';
    parsed.mode = cur === 'code' ? 'code' : 'tree';
    return parsed;
  }

  function persistSnap(parsed) {
    if (!ready || applying || !saveDb || guest) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      var rec = persistRecord(parsed.mode || mode, parsed);
      saveDb.put(rec).catch(function () {});
    }, 350);
  }

  function persistNow() {
    persistSnap(snapshotFromEditor());
  }

  function paintFromParsed(parsed) {
    var empty = !!(parsed.empty || (parsed.value != null && isEmptyDoc(parsed.value)));
    setHint(empty && !parsed.error);
    if (parsed.error) {
      setError(parsed.message);
      setStatus('Kept the text — it is not valid JSON yet');
    } else {
      setError('');
      if (empty) setStatus('Empty — still only on this device');
      else setStatus('Saved on this device');
    }
  }

  function onUserChange() {
    if (!ready || applying || guest) return;
    var parsed = snapshotFromEditor();
    parsed.mode = mode;
    paintFromParsed(parsed);
    persistSnap(parsed);
    if (root.JsonEditorMp) root.JsonEditorMp.publish();
  }

  function applyParsed(parsed, wantMode) {
    if (!editor) return;
    applying = true;
    var next = wantMode || (parsed.error ? 'code' : (parsed.empty ? 'tree' : mode));
    if (parsed.error) next = 'code';
    try {
      if (next === 'code') {
        try { editor.setMode('code'); } catch (e) { editor.setMode('text'); }
        disableAceWorker(editor);
        editor.setText(parsed.text || (parsed.value != null ? JSON.stringify(parsed.value, null, 2) : ''));
      } else {
        editor.setMode('tree');
        if (parsed.error) editor.set({});
        else if (parsed.empty) editor.set({});
        else editor.set(parsed.value);
      }
    } catch (e) {
      try {
        editor.setMode('code');
        disableAceWorker(editor);
        editor.setText(parsed.text || '');
        next = 'code';
      } catch (e2) {}
    }
    applying = false;
    syncTabs(next);
    paintFromParsed(parsed);
  }

  function requestMode(next) {
    next = next === 'code' ? 'code' : 'tree';
    var parsed = snapshotFromEditor();
    if (next === 'tree' && parsed.error) {
      setError(parsed.message);
      setStatus('Stay in Code until the text is valid JSON');
      syncTabs('code');
      return;
    }
    applyParsed(parsed, next);
    if (!guest) persistSnap(parsed);
    if (root.JsonEditorMp) root.JsonEditorMp.publish();
  }

  function loadIntoEditor(loaded) {
    mode = loaded.mode || 'tree';
    applyParsed(loaded.parsed || parseJson(loaded.text || '{}'), loaded.mode);
    if (loaded.invalid) {
      setError(loaded.message);
      setStatus('Last text on this device is not valid JSON yet');
    } else if (loaded.empty) {
      setStatus(saveDb ? 'Nothing in this file yet' : 'Empty document');
    } else {
      setStatus('Last document on this device');
    }
  }

  function newDoc() {
    if (guest || !editor) return;
    applyParsed(parseJson('{}'), 'tree');
    persistNow();
    if (root.JsonEditorMp) root.JsonEditorMp.publish();
    setStatus('Empty object');
  }

  function sampleDoc() {
    if (guest || !editor) return;
    var text = JSON.stringify(SAMPLE, null, 2);
    applyParsed(parseJson(text), mode === 'code' ? 'code' : 'tree');
    persistNow();
    if (root.JsonEditorMp) root.JsonEditorMp.publish();
    setStatus('Sample document');
  }

  function runFormat(kind) {
    if (guest) return;
    var parsed = kind === 'compact' ? compactText(editorText()) : (kind === 'repair' ? repairText(editorText()) : formatText(editorText()));
    if (parsed.empty) {
      setStatus('Nothing to ' + kind);
      return;
    }
    if (parsed.error) {
      setError(parsed.message);
      setStatus(kind === 'repair' ? 'Could not repair — still not valid JSON' : 'Cannot ' + kind + ' until the text is valid JSON');
      return;
    }
    applyParsed({ value: parsed.value, text: parsed.text }, mode);
    persistNow();
    if (root.JsonEditorMp) root.JsonEditorMp.publish();
    setStatus(kind === 'repair' && parsed.repaired ? 'Repaired' : (kind === 'compact' ? 'Compacted' : 'Formatted'));
  }

  function copyText() {
    var text = editorText();
    var msg = $('status');
    function done(ok) {
      if (msg) setStatus(ok ? 'Copied.' : (text ? 'Select the text and copy it.' : 'Nothing to copy.'));
    }
    if (!text) { done(false); return; }
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(text).then(function () { done(true); }).catch(function () { done(false); });
    } else done(false);
  }

  function openFile(file) {
    if (!file || guest) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed = parseJson(String(reader.result || ''));
      applyParsed(parsed, parsed.error || parsed.empty ? 'code' : mode);
      persistNow();
      if (root.JsonEditorMp) root.JsonEditorMp.publish();
      setStatus(parsed.error ? 'Opened — the file is not valid JSON' : 'Opened on this device');
    };
    reader.readAsText(file);
  }

  function isPhone() {
    return !!(root.matchMedia && root.matchMedia('(max-width: 640px)').matches);
  }

  function bind() {
    if ($('tabTree')) $('tabTree').addEventListener('click', function () { requestMode('tree'); });
    if ($('tabCode')) $('tabCode').addEventListener('click', function () { requestMode('code'); });
    if ($('newBtn')) $('newBtn').addEventListener('click', newDoc);
    if ($('sampleBtn')) $('sampleBtn').addEventListener('click', sampleDoc);
    if ($('formatBtn')) $('formatBtn').addEventListener('click', function () { runFormat('format'); });
    if ($('compactBtn')) $('compactBtn').addEventListener('click', function () { runFormat('compact'); });
    if ($('repairBtn')) $('repairBtn').addEventListener('click', function () { runFormat('repair'); });
    if ($('copyBtn')) $('copyBtn').addEventListener('click', copyText);
    if ($('file')) $('file').addEventListener('change', function () {
      var f = $('file').files && $('file').files[0];
      $('file').value = '';
      openFile(f);
    });
    if (root.gifos && typeof root.gifos.onBack === 'function') {
      root.gifos.onBack(function () {
        if (isPhone() && mode === 'code') {
          requestMode('tree');
          return true;
        }
        return false;
      });
    }
  }

  function makeEditor(el) {
    var opts = {
      mode: 'tree',
      modes: ['tree', 'code'],
      search: true,
      history: true,
      navigationBar: false,
      mainMenuBar: true,
      statusBar: true,
      colorPicker: false,
      onChange: onUserChange,
      onModeChange: function (newMode) {
        disableAceWorker(editor);
        syncTabs(newMode === 'code' || newMode === 'text' ? 'code' : 'tree');
        onUserChange();
      },
      onError: function (err) {
        setError(friendlyError(err));
      },
      onValidationError: function (errors) {
        var parseErr = null;
        (errors || []).forEach(function (e) {
          if (e && e.type === 'error') parseErr = e.error || e;
        });
        if (parseErr) setError(friendlyError(parseErr));
        else if (!errors || !errors.length) {
          var parsed = snapshotFromEditor();
          if (!parsed.error) setError('');
        }
      },
      onEditable: function () { return !guest; }
    };
    var ed = new root.JSONEditor(el, opts);
    disableAceWorker(ed);
    return ed;
  }

  function start(rec) {
    var el = $('editor');
    if (!el || typeof root.JSONEditor !== 'function') {
      setStatus('Editor failed to load.');
      return;
    }
    editor = makeEditor(el);
    var loaded = loadRecord(rec);
    ready = true;
    loadIntoEditor(loaded);
    bind();

    var Mp = root.JsonEditorMp;
    var meet = $('meet');
    if (meet && meet.textContent.indexOf('Invite') < 0) {
      meet.textContent = 'Press Invite (top bar) to let a meeting watch this document, read-only. Nothing is uploaded.';
    }
    if (Mp) {
      Mp.getState = function () {
        return { mode: mode, text: editorText() };
      };
      Mp.onRemote = function (row) {
        if (!row) return;
        localHold = localHold || persistRecord(mode, snapshotFromEditor());
        guest = true;
        var parsed = parseJson(row.text || '');
        applyParsed(parsed, row.mode === 'code' ? 'code' : 'tree');
        setStatus('Showing a read-only view of the host\'s document.');
      };
      Mp.onHost = function () {
        guest = false;
        var rec2 = localHold;
        localHold = null;
        loadIntoEditor(loadRecord(rec2));
      };
      Mp.onStatus = function (msg, isGuest) {
        guest = !!isGuest;
        var meet = $('meet');
        if (meet) {
          meet.textContent = msg;
          meet.classList.toggle('live', !!isGuest);
        }
      };
      Mp.watch();
    }
  }

  function boot() {
    if (!root.document) return;
    if (saveDb && saveDb.get) saveDb.get('last').then(start).catch(function () { start(null); });
    else start(null);
  }

  if (root.document) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : this);
