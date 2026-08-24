/* JSON Diff: two paste boxes, visual formatter, private last pair.
 * Meeting share is optional (mp.js). Nothing is fetched. */
(function (root) {
  'use strict';

  var SAMPLE_LEFT = '{\n  "name": "Ada",\n  "n": 1,\n  "tags": ["math", "notes"]\n}';
  var SAMPLE_RIGHT = '{\n  "name": "Ada Lovelace",\n  "n": 2,\n  "tags": ["math", "code"],\n  "ok": true\n}';

  var $ = function (id) {
    return root.document ? root.document.getElementById(id) : null;
  };
  var saveDb = null, saveTimer = 0, applying = false;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var settings = { left: SAMPLE_LEFT, right: SAMPLE_RIGHT, unchanged: false };

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
        unchanged: !!settings.unchanged
      }).catch(function () {});
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 250);
  }

  function parseSide(text, errId) {
    var el = $(errId);
    var raw = String(text || '').trim();
    if (!raw) {
      el.hidden = true;
      el.textContent = '';
      return { empty: true };
    }
    try {
      var v = JSON.parse(raw);
      el.hidden = true;
      el.textContent = '';
      return { value: v };
    } catch (e) {
      el.hidden = false;
      el.textContent = String(e && e.message || e);
      return { error: true };
    }
  }

  function paint() {
    var L = parseSide(settings.left, 'leftErr');
    var R = parseSide(settings.right, 'rightErr');
    var box = $('delta');
    var same = $('same');
    if (L.error || R.error || L.empty || R.empty) {
      box.innerHTML = '';
      same.hidden = true;
      return;
    }
    var J = root.jsondiffpatch;
    if (!J || !J.diff) return;
    var delta = J.diff(L.value, R.value);
    if (!delta) {
      box.innerHTML = '';
      same.hidden = false;
      return;
    }
    same.hidden = true;
    box.className = 'delta' + (settings.unchanged ? ' jsondiffpatch-unchanged-showing' : ' jsondiffpatch-unchanged-hidden');
    if (J.formatters && J.formatters.html) {
      box.innerHTML = J.formatters.html.format(delta, L.value);
    } else {
      box.textContent = JSON.stringify(delta, null, 2);
    }
  }

  function readUi() {
    settings.left = $('left').value;
    settings.right = $('right').value;
    settings.unchanged = $('unchanged').checked;
  }

  function writeUi() {
    applying = true;
    $('left').value = settings.left;
    $('right').value = settings.right;
    $('unchanged').checked = !!settings.unchanged;
    applying = false;
  }

  function applyRemote(row) {
    if (!row) return;
    applying = true;
    settings.left = row.left || '';
    settings.right = row.right || '';
    settings.unchanged = !!row.unchanged;
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
    function one(id) {
      var el = $(id);
      try {
        el.value = JSON.stringify(JSON.parse(el.value), null, 2);
      } catch (e) {}
    }
    one('left'); one('right');
    onChange();
  }

  function sample() {
    settings.left = SAMPLE_LEFT;
    settings.right = SAMPLE_RIGHT;
    writeUi();
    onChange();
  }

  function loadSave() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (!r || r.id !== 'last') return;
        if (typeof r.left === 'string') settings.left = r.left;
        if (typeof r.right === 'string') settings.right = r.right;
        settings.unchanged = !!r.unchanged;
      });
    }).catch(function () {});
  }

  function boot() {
    writeUi();
    paint();
    $('left').addEventListener('input', onChange);
    $('right').addEventListener('input', onChange);
    $('unchanged').addEventListener('change', onChange);
    $('prettyBtn').addEventListener('click', pretty);
    $('sampleBtn').addEventListener('click', sample);
    var Mp = root.DiffMp;
    if (Mp) {
      Mp.getState = function () { return settings; };
      Mp.onRemote = applyRemote;
      Mp.onHost = function () {};
      Mp.onStatus = function (text, isGuest) {
        var el = $('meet');
        el.textContent = text;
        el.classList.toggle('live', !!isGuest);
      };
      Mp.watch();
    } else if ($('meet')) {
      $('meet').textContent = 'Press Invite (top bar) to show this difference, read-only, in a meeting.';
    }
  }

  root.JsonDiffApp = { parseSide: parseSide, sampleLeft: SAMPLE_LEFT };

  if ($('left')) {
    loadSave().then(boot);
    root.addEventListener('pagehide', function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
      persist(true);
    });
  }
})(window);
