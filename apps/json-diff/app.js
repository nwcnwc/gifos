/* JSON Diff: two paste boxes, visual / JSON / Patch, private last pair.
 * Meeting share is optional (mp.js). Nothing is fetched. */
(function (root) {
  'use strict';

  var SAMPLE_LEFT = '{\n  "name": "Ada",\n  "n": 1,\n  "tags": ["math", "notes"],\n  "user": { "id": "a1", "role": "editor" },\n  "items": [\n    { "id": "x", "qty": 2 },\n    { "id": "y", "qty": 1 }\n  ]\n}';
  var SAMPLE_RIGHT = '{\n  "name": "Ada Lovelace",\n  "n": 2,\n  "tags": ["math", "code"],\n  "ok": true,\n  "user": { "id": "a1", "role": "admin" },\n  "items": [\n    { "id": "y", "qty": 4 },\n    { "id": "z", "qty": 1 }\n  ]\n}';

  function parseJson(text) {
    var raw = String(text == null ? '' : text).trim();
    if (!raw) return { empty: true };
    try {
      return { value: JSON.parse(raw) };
    } catch (e) {
      return { error: true, message: friendlyJsonError(e) };
    }
  }

  function friendlyJsonError(e) {
    var msg = String(e && e.message || e);
    if (/Unexpected end/i.test(msg)) {
      return 'Not valid JSON — the text ends early. A quote or bracket may be missing. (' + msg + ')';
    }
    if (/Unexpected token/i.test(msg) || /Expected/i.test(msg)) {
      return 'Not valid JSON — ' + msg.replace(/^JSON\.parse:\s*/i, '');
    }
    return 'Not valid JSON — ' + msg;
  }

  function objectHash(obj, index) {
    if (obj && typeof obj === 'object') {
      if (obj.id != null) return 'id:' + String(obj.id);
      if (obj._id != null) return '_id:' + String(obj._id);
      if (obj.key != null) return 'key:' + String(obj.key);
    }
    return '$index:' + index;
  }

  function makeDiffer(matchById) {
    var J = root.jsondiffpatch;
    if (!J) return null;
    if (matchById && typeof J.create === 'function') {
      return J.create({ objectHash: objectHash, arrays: { detectMove: true } });
    }
    return J;
  }

  function statsOf(delta) {
    var s = { added: 0, removed: 0, changed: 0, moved: 0 };
    function walk(d) {
      if (!d || typeof d !== 'object') return;
      if (Array.isArray(d)) {
        if (d.length === 1) s.added++;
        else if (d.length === 2) s.changed++;
        else if (d.length === 3) {
          if (d[2] === 0) s.removed++;
          else if (d[2] === 2) s.changed++;
          else if (d[2] === 3) s.moved++;
        }
        return;
      }
      Object.keys(d).forEach(function (k) {
        if (k === '_t') return;
        walk(d[k]);
      });
    }
    walk(delta);
    return s;
  }

  function formatStats(s) {
    var bits = [];
    if (s.added) bits.push(s.added + ' added');
    if (s.removed) bits.push(s.removed + ' removed');
    if (s.changed) bits.push(s.changed + ' changed');
    if (s.moved) bits.push(s.moved + ' moved');
    return bits.join(' · ') || 'changed';
  }

  function diffPair(leftVal, rightVal, opts) {
    opts = opts || {};
    var differ = makeDiffer(!!opts.matchById);
    if (!differ || typeof differ.diff !== 'function') {
      return { error: 'diff engine missing' };
    }
    var delta = differ.diff(leftVal, rightVal);
    if (!delta) return { same: true, delta: undefined };
    var J = root.jsondiffpatch;
    var html = '';
    if (J && J.formatters && J.formatters.html && J.formatters.html.format) {
      html = J.formatters.html.format(delta, leftVal);
    }
    var patch = [];
    if (J && J.formatters && J.formatters.jsonpatch && J.formatters.jsonpatch.format) {
      try { patch = J.formatters.jsonpatch.format(delta); } catch (e) { patch = []; }
    }
    return {
      delta: delta,
      html: html,
      json: JSON.stringify(delta, null, 2),
      patch: JSON.stringify(patch, null, 2),
      stats: statsOf(delta)
    };
  }

  function compareTexts(leftText, rightText, opts) {
    var L = parseJson(leftText);
    var R = parseJson(rightText);
    if (L.empty && R.empty) {
      return { empty: true, message: 'Paste both sides to compare.' };
    }
    if (L.empty) return { empty: true, message: 'Left is empty — paste the old document.' };
    if (R.empty) return { empty: true, message: 'Right is empty — paste the new document.' };
    if (L.error || R.error) {
      return {
        invalid: true,
        left: L,
        right: R,
        message: 'Cannot compare until both sides are valid JSON.'
      };
    }
    var out = diffPair(L.value, R.value, opts);
    out.left = L;
    out.right = R;
    return out;
  }

  var $ = function (id) {
    return root.document ? root.document.getElementById(id) : null;
  };
  var saveDb = null, saveTimer = 0, applying = false;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var settings = {
    left: SAMPLE_LEFT,
    right: SAMPLE_RIGHT,
    unchanged: false,
    matchById: true,
    view: 'visual'
  };
  var tab = 'left';

  function persist(immediate) {
    if (applying || !saveDb) return;
    if (root.DiffMp && root.DiffMp.guest) return;
    if (saveTimer) clearTimeout(saveTimer);
    var write = function () {
      saveTimer = 0;
      saveDb.put({
        id: 'last',
        left: settings.left,
        right: settings.right,
        unchanged: !!settings.unchanged,
        matchById: settings.matchById !== false,
        view: settings.view || 'visual'
      }).catch(function () {});
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 250);
  }

  function showErr(id, parsed) {
    var el = $(id);
    var box = id === 'leftErr' ? $('left') : $('right');
    if (!el) return;
    if (parsed && parsed.error) {
      el.hidden = false;
      el.textContent = parsed.message;
      if (box) box.classList.add('bad');
    } else {
      el.hidden = true;
      el.textContent = '';
      if (box) box.classList.remove('bad');
    }
  }

  function paint() {
    var cmp = compareTexts(settings.left, settings.right, { matchById: settings.matchById !== false });
    var box = $('delta');
    var raw = $('raw');
    var same = $('same');
    var empty = $('empty');
    var stats = $('stats');
    var copyMsg = $('copyMsg');
    if (copyMsg) copyMsg.hidden = true;

    showErr('leftErr', cmp.left);
    showErr('rightErr', cmp.right);
    if (!cmp.left && !cmp.right) {
      showErr('leftErr', parseJson(settings.left));
      showErr('rightErr', parseJson(settings.right));
    }

    if (box) box.hidden = true;
    if (raw) raw.hidden = true;
    if (same) same.hidden = true;
    if (stats) stats.hidden = true;
    if (empty) empty.hidden = true;

    if (cmp.empty || cmp.invalid) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = cmp.message;
      }
      if (box) box.innerHTML = '';
      if (raw) raw.textContent = '';
      return;
    }
    if (cmp.same) {
      if (same) same.hidden = false;
      if (box) box.innerHTML = '';
      if (raw) raw.textContent = '';
      return;
    }
    if (stats && cmp.stats) {
      stats.hidden = false;
      stats.textContent = formatStats(cmp.stats);
    }
    var view = settings.view || 'visual';
    if (view === 'json') {
      if (raw) {
        raw.hidden = false;
        raw.textContent = cmp.json || '';
      }
    } else if (view === 'patch') {
      if (raw) {
        raw.hidden = false;
        raw.textContent = cmp.patch || '[]';
      }
    } else if (box) {
      box.hidden = false;
      box.className = 'delta' + (settings.unchanged ? ' jsondiffpatch-unchanged-showing' : ' jsondiffpatch-unchanged-hidden');
      if (cmp.html) box.innerHTML = cmp.html;
      else box.textContent = cmp.json || '';
    }
  }

  function readUi() {
    if ($('left')) settings.left = $('left').value;
    if ($('right')) settings.right = $('right').value;
    if ($('unchanged')) settings.unchanged = $('unchanged').checked;
    if ($('matchId')) settings.matchById = $('matchId').checked;
  }

  function writeUi() {
    applying = true;
    if ($('left')) $('left').value = settings.left;
    if ($('right')) $('right').value = settings.right;
    if ($('unchanged')) $('unchanged').checked = !!settings.unchanged;
    if ($('matchId')) $('matchId').checked = settings.matchById !== false;
    setView(settings.view || 'visual', true);
    applying = false;
  }

  function setView(view, skipPaint) {
    settings.view = view === 'json' || view === 'patch' ? view : 'visual';
    [['viewVisual', 'visual'], ['viewJson', 'json'], ['viewPatch', 'patch']].forEach(function (pair) {
      var el = $(pair[0]);
      if (!el) return;
      var on = pair[1] === settings.view;
      el.classList.toggle('on', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (!skipPaint) paint();
  }

  function setTab(next) {
    tab = next === 'right' || next === 'diff' ? next : 'left';
    if (!root.document || !root.document.body) return;
    root.document.body.classList.remove('tab-left', 'tab-right', 'tab-diff');
    root.document.body.classList.add('tab-' + tab);
    [['tabLeft', 'left'], ['tabRight', 'right'], ['tabDiff', 'diff']].forEach(function (pair) {
      var el = $(pair[0]);
      if (!el) return;
      el.classList.toggle('on', pair[1] === tab);
      el.setAttribute('aria-selected', pair[1] === tab ? 'true' : 'false');
    });
  }

  function applyRemote(row) {
    if (!row) return;
    applying = true;
    settings.left = row.left || '';
    settings.right = row.right || '';
    settings.unchanged = !!row.unchanged;
    if (typeof row.matchById === 'boolean') settings.matchById = row.matchById;
    if (row.view) settings.view = row.view;
    writeUi();
    applying = false;
    paint();
  }

  function onChange() {
    if (applying) return;
    if (root.DiffMp && root.DiffMp.guest) return;
    readUi();
    paint();
    persist();
    if (root.DiffMp) root.DiffMp.publish();
  }

  function pretty() {
    function one(id, errId) {
      var el = $(id);
      if (!el) return;
      var parsed = parseJson(el.value);
      if (parsed.empty) return;
      if (parsed.error) {
        showErr(errId, parsed);
        return;
      }
      el.value = JSON.stringify(parsed.value, null, 2);
    }
    one('left', 'leftErr');
    one('right', 'rightErr');
    onChange();
  }

  function swap() {
    var L = $('left') ? $('left').value : settings.left;
    var R = $('right') ? $('right').value : settings.right;
    settings.left = R;
    settings.right = L;
    writeUi();
    onChange();
  }

  function sample() {
    settings.left = SAMPLE_LEFT;
    settings.right = SAMPLE_RIGHT;
    writeUi();
    if (isPhone()) setTab('diff');
    onChange();
  }

  function clearPair() {
    settings.left = '';
    settings.right = '';
    writeUi();
    if (isPhone()) setTab('left');
    onChange();
  }

  function currentCopyText() {
    var cmp = compareTexts(settings.left, settings.right, { matchById: settings.matchById !== false });
    if (cmp.empty || cmp.invalid) return cmp.message || '';
    if (cmp.same) return '';
    if (settings.view === 'patch') return cmp.patch || '[]';
    return cmp.json || '';
  }

  function copyView() {
    var text = currentCopyText();
    var msg = $('copyMsg');
    function ok(okey) {
      if (!msg) return;
      msg.hidden = false;
      msg.textContent = okey ? 'Copied.' : (text ? 'Select the text below and copy it.' : 'Nothing to copy.');
    }
    if (!text) { ok(false); return; }
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(text).then(function () { ok(true); }).catch(function () {
        fallbackCopy(text); ok(false);
      });
    } else {
      fallbackCopy(text);
      ok(false);
    }
  }

  function fallbackCopy(text) {
    var raw = $('raw');
    if (raw) {
      raw.hidden = false;
      raw.textContent = text;
      try {
        var range = root.document.createRange();
        range.selectNodeContents(raw);
        var sel = root.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {}
    }
  }

  function readFileInto(file, side) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      if (side === 'left') settings.left = text;
      else settings.right = text;
      writeUi();
      onChange();
    };
    reader.readAsText(file);
  }

  function bindDrop(el, side) {
    if (!el) return;
    el.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) readFileInto(f, side);
    });
  }

  function loadSave() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (!r || r.id !== 'last') return;
        if (typeof r.left === 'string') settings.left = r.left;
        if (typeof r.right === 'string') settings.right = r.right;
        settings.unchanged = !!r.unchanged;
        if (typeof r.matchById === 'boolean') settings.matchById = r.matchById;
        if (r.view === 'json' || r.view === 'patch' || r.view === 'visual') settings.view = r.view;
      });
    }).catch(function () {});
  }

  function isPhone() {
    return !!(root.matchMedia && root.matchMedia('(max-width: 640px)').matches);
  }

  function boot() {
    writeUi();
    paint();
    setTab(isPhone() ? 'diff' : 'left');
    if ($('left')) $('left').addEventListener('input', onChange);
    if ($('right')) $('right').addEventListener('input', onChange);
    if ($('unchanged')) $('unchanged').addEventListener('change', onChange);
    if ($('matchId')) $('matchId').addEventListener('change', onChange);
    if ($('prettyBtn')) $('prettyBtn').addEventListener('click', pretty);
    if ($('swapBtn')) $('swapBtn').addEventListener('click', swap);
    if ($('sampleBtn')) $('sampleBtn').addEventListener('click', sample);
    if ($('clearBtn')) $('clearBtn').addEventListener('click', clearPair);
    if ($('copyBtn')) $('copyBtn').addEventListener('click', copyView);
    if ($('viewVisual')) $('viewVisual').addEventListener('click', function () { setView('visual'); persist(); });
    if ($('viewJson')) $('viewJson').addEventListener('click', function () { setView('json'); persist(); });
    if ($('viewPatch')) $('viewPatch').addEventListener('click', function () { setView('patch'); persist(); });
    if ($('tabLeft')) $('tabLeft').addEventListener('click', function () { setTab('left'); });
    if ($('tabRight')) $('tabRight').addEventListener('click', function () { setTab('right'); });
    if ($('tabDiff')) $('tabDiff').addEventListener('click', function () { setTab('diff'); });
    if ($('leftFile')) $('leftFile').addEventListener('change', function () {
      readFileInto($('leftFile').files && $('leftFile').files[0], 'left');
      $('leftFile').value = '';
    });
    if ($('rightFile')) $('rightFile').addEventListener('change', function () {
      readFileInto($('rightFile').files && $('rightFile').files[0], 'right');
      $('rightFile').value = '';
    });
    bindDrop($('left'), 'left');
    bindDrop($('right'), 'right');
    if (root.gifos && typeof root.gifos.onBack === 'function') {
      root.gifos.onBack(function () {
        if (isPhone() && tab !== 'left') {
          setTab('left');
          return true;
        }
        return false;
      });
    }
    var Mp = root.DiffMp;
    if (Mp) {
      Mp.getState = function () { return settings; };
      Mp.onRemote = applyRemote;
      Mp.onHost = function () {};
      Mp.onStatus = function (text, isGuest) {
        var el = $('meet');
        if (!el) return;
        el.textContent = text;
        el.classList.toggle('live', !!isGuest);
      };
      Mp.watch();
    } else if ($('meet')) {
      $('meet').textContent = 'Press Invite (top bar) to show this difference, read-only, in a meeting.';
    }
  }

  root.JsonDiffApp = {
    parseJson: parseJson,
    parseSide: function (text) { return parseJson(text); },
    diffPair: diffPair,
    compareTexts: compareTexts,
    statsOf: statsOf,
    formatStats: formatStats,
    objectHash: objectHash,
    sampleLeft: SAMPLE_LEFT,
    sampleRight: SAMPLE_RIGHT,
    SAMPLE_LEFT: SAMPLE_LEFT,
    SAMPLE_RIGHT: SAMPLE_RIGHT
  };

  if ($('left')) {
    loadSave().then(boot);
    root.addEventListener('pagehide', function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
      persist(true);
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
