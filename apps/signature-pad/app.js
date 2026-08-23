// Boot the pad: private save, PNG download, ink, undo, and the room hooks.
//
// Solo writes the strokes into gifos.db('save'). Pass-the-pad never touches
// that row — a meeting must not overwrite the signature you were in the middle of.
(function (root) {
  'use strict';

  var PAPER = 'rgb(247, 243, 234)';
  var INKS = { black: 'rgb(20, 22, 28)', blue: 'rgb(36, 72, 156)' };

  var saveDb = null;
  var saved = null;
  var timer = 0;
  var applying = false;
  var ink = 'black';
  var pad = null;
  var canvas = document.getElementById('pad');

  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };

  function say(msg, kind) {
    var el = $('status');
    el.textContent = msg || '';
    el.className = (msg ? 'on' : '') + (kind ? ' ' + kind : '');
  }

  function options() {
    return {
      backgroundColor: PAPER,
      penColor: INKS[ink] || INKS.black,
      minWidth: 0.6,
      maxWidth: 2.8,
      throttle: 16,
      minDistance: 2
    };
  }

  function resize() {
    if (!pad || !canvas) return;
    var ratio = Math.max(root.devicePixelRatio || 1, 1);
    var w = canvas.offsetWidth;
    var h = canvas.offsetHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    canvas.getContext('2d').scale(ratio, ratio);
    pad.redraw();
  }

  function persist() {
    if (!saveDb || (root.Pad && root.Pad.mp)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = 0;
      flushSave();
    }, 200);
  }

  function flushSave() {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (!saveDb || !pad || (root.Pad && root.Pad.mp)) return;
    saved = {
      id: 'pad',
      strokes: pad.toData() || [],
      empty: !!pad.isEmpty(),
      ink: ink,
      w: canvas.offsetWidth,
      h: canvas.offsetHeight,
      at: Date.now()
    };
    saveDb.put(saved).catch(function () {});
  }

  function applySaved(row) {
    if (!row || !pad) return;
    applying = true;
    if (row.ink && INKS[row.ink]) setInk(row.ink, true);
    if (row.strokes && row.strokes.length) pad.fromData(row.strokes);
    else pad.clear();
    applying = false;
  }

  function setInk(name, quiet) {
    if (!INKS[name]) return;
    ink = name;
    if (pad) pad.penColor = INKS[ink];
    document.querySelectorAll('.ink').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-ink') === ink);
    });
    if (!quiet) persist();
  }

  function changed() {
    if (applying) return;
    if (root.Pad && root.Pad.Mp && root.Pad.Mp.isOn()) {
      root.Pad.Mp.onChanged();
      return;
    }
    persist();
  }

  function downloadPng(dataURL, name) {
    var parts = String(dataURL).split(',');
    var raw = root.atob(parts[1] || '');
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    var blob = new Blob([bytes], { type: 'image/png' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  function savePng() {
    if (root.Pad && root.Pad.Mp && root.Pad.Mp.isOn()) {
      root.Pad.Mp.saveSheet();
      return;
    }
    if (!pad || pad.isEmpty()) {
      say('Sign first.', 'warn');
      return;
    }
    say('');
    downloadPng(pad.toDataURL('image/png'), 'signature.png');
  }

  root.Pad = root.Pad || {};
  root.Pad.pack = function () {
    return {
      strokes: pad ? pad.toData() : [],
      empty: !pad || pad.isEmpty(),
      ink: ink,
      w: canvas.offsetWidth,
      h: canvas.offsetHeight
    };
  };
  root.Pad.replace = function (row) { applySaved(row || {}); };
  root.Pad.empty = function () { if (pad) pad.clear(); };
  root.Pad.isEmpty = function () { return !pad || pad.isEmpty(); };
  root.Pad.png = function () { return pad ? pad.toDataURL('image/png') : ''; };
  root.Pad.resize = resize;
  root.Pad.flushSave = flushSave;
  root.Pad.restoreSave = function () {
    if (saved) applySaved(saved);
    else if (pad) pad.clear();
  };
  root.Pad.downloadPng = downloadPng;
  root.Pad.say = say;
  root.Pad.paper = PAPER;
  root.Pad.inks = INKS;
  root.Pad.canvas = canvas;

  if (!root.SignaturePad) {
    say('The pad did not load.', 'warn');
    return;
  }

  pad = new root.SignaturePad(canvas, options());
  pad.addEventListener('endStroke', changed);

  $('clearBtn').addEventListener('click', function (e) {
    e.preventDefault();
    if (pad) pad.clear();
    changed();
  });
  $('undoBtn').addEventListener('click', function (e) {
    e.preventDefault();
    if (!pad) return;
    var data = pad.toData();
    if (data && data.length) {
      data.pop();
      pad.fromData(data);
      changed();
    }
  });
  $('saveBtn').addEventListener('click', function (e) {
    e.preventDefault();
    savePng();
  });
  document.querySelectorAll('.ink').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      setInk(b.getAttribute('data-ink'));
    });
  });

  root.addEventListener('resize', resize);
  if (root.ResizeObserver) {
    new root.ResizeObserver(resize).observe($('paper'));
  }
  resize();

  function load() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (r && r.id === 'pad') saved = r;
      });
      if (saved) applySaved(saved);
    }).catch(function () {});
  }

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (root.Pad.Mp && root.Pad.Mp.isOn()) root.Pad.Mp.leave();
    });
  }
  root.addEventListener('pagehide', function () {
    if (timer) { clearTimeout(timer); timer = 0; }
    flushSave();
  });

  load();
})(window);
