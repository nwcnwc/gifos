/* Paste JSON, draw the graph. Last document is private. Invite is OS chrome. */
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var saveDb = null;
  var applying = false;
  var saveTimer = 0;
  var collapsed = {};
  var lastGood = null;
  var pan = { x: 0, y: 0, s: 1, drag: false, sx: 0, sy: 0, ox: 0, oy: 0 };

  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  function persist() {
    if (applying || !saveDb) return;
    saveDb.put({ id: 'last', text: $('src').value, collapsed: collapsed }).catch(function () {});
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }

  function setErr(msg) {
    var el = $('err');
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = msg;
  }

  function applyPan() {
    var g = $('graph-inner');
    g.style.transform = 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + pan.s + ')';
  }

  function draw(data) {
    lastGood = data;
    var g = JsonCrack.toGraph(data);
    var laid = JsonCrack.layout(g, collapsed);
    JsonCrack.render($('graph-inner'), laid, collapsed, function (id) {
      collapsed[id] = !collapsed[id];
      draw(lastGood);
      scheduleSave();
    });
    $('meta').textContent = laid.nodes.length + ' cards, ' + laid.edges.length + ' edges';
  }

  function parseAndDraw() {
    var text = $('src').value;
    try {
      var data = JSON.parse(text);
      setErr('');
      draw(data);
      if (root.JsonCrackMp) root.JsonCrackMp.noteChange();
      scheduleSave();
    } catch (e) {
      setErr((e && e.message) || 'Invalid JSON');
    }
  }

  var parseTimer = 0;
  $('src').addEventListener('input', function () {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(parseAndDraw, 180);
  });
  $('format').addEventListener('click', function () {
    try {
      $('src').value = JSON.stringify(JSON.parse($('src').value), null, 2);
      parseAndDraw();
    } catch (e) { setErr((e && e.message) || 'Invalid JSON'); }
  });
  $('minify').addEventListener('click', function () {
    try {
      $('src').value = JSON.stringify(JSON.parse($('src').value));
      parseAndDraw();
    } catch (e) { setErr((e && e.message) || 'Invalid JSON'); }
  });
  $('file-input').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      $('src').value = String(r.result || '');
      parseAndDraw();
    };
    r.readAsText(f);
  });

  var stage = $('stage');
  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('.node')) return;
    pan.drag = true;
    pan.sx = e.clientX; pan.sy = e.clientY;
    pan.ox = pan.x; pan.oy = pan.y;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });
  stage.addEventListener('pointermove', function (e) {
    if (!pan.drag) return;
    pan.x = pan.ox + (e.clientX - pan.sx);
    pan.y = pan.oy + (e.clientY - pan.sy);
    applyPan();
  });
  stage.addEventListener('pointerup', function () { pan.drag = false; });
  stage.addEventListener('pointercancel', function () { pan.drag = false; });
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    var next = pan.s * (e.deltaY < 0 ? 1.08 : 0.92);
    pan.s = Math.max(0.3, Math.min(2.5, next));
    applyPan();
  }, { passive: false });

  root.JsonCrackApp = {
    getText: function () { return $('src').value; },
    setText: function (t) {
      applying = true;
      $('src').value = t;
      applying = false;
      parseAndDraw();
    }
  };

  function boot(rec) {
    applying = true;
    if (rec && rec.collapsed && typeof rec.collapsed === 'object') collapsed = rec.collapsed;
    if (rec && rec.text) $('src').value = rec.text;
    else $('src').value = JSON.stringify(JsonCrack.SAMPLE, null, 2);
    applying = false;
    parseAndDraw();
  }

  if (saveDb && saveDb.get) {
    saveDb.get('last').then(boot).catch(function () { boot(null); });
  } else boot(null);
})(typeof window !== 'undefined' ? window : this);
