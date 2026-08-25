/* Paste JSON, draw the graph. Last document is private. Invite is OS chrome. */
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var saveDb = null;
  var applying = false;
  var saveTimer = 0;
  var collapsed = {};
  var lastGood = null;
  var lastLaid = null;
  var fittedOnce = false;
  var tab = 'graph';
  var pan = { x: 24, y: 24, s: 1, drag: false, sx: 0, sy: 0, ox: 0, oy: 0 };
  var pts = {};
  var pinch = null;
  var toastTimer = 0;
  var NODE_CAP = 400;

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
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = msg;
  }

  function applyPan() {
    var g = $('graph-inner');
    if (!g) return;
    g.style.transform = 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + pan.s + ')';
  }

  function zoomAt(cx, cy, next) {
    next = Math.max(0.25, Math.min(3, next));
    var wx = (cx - pan.x) / pan.s;
    var wy = (cy - pan.y) / pan.s;
    pan.s = next;
    pan.x = cx - wx * pan.s;
    pan.y = cy - wy * pan.s;
    applyPan();
  }

  function stagePoint(e) {
    var stage = $('stage');
    var r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function frameRoot() {
    pan.s = 1;
    pan.x = 16;
    pan.y = 16;
    applyPan();
  }

  function fit() {
    var stage = $('stage');
    var laid = lastLaid;
    if (!stage || !laid) {
      frameRoot();
      return;
    }
    var sw = stage.clientWidth || 640;
    var sh = stage.clientHeight || 400;
    var s = Math.min((sw - 32) / Math.max(laid.width, 1), (sh - 32) / Math.max(laid.height, 1));
    pan.s = Math.max(0.35, Math.min(1.15, s));
    pan.x = Math.max(8, (sw - laid.width * pan.s) / 2);
    pan.y = Math.max(8, (sh - laid.height * pan.s) / 2);
    applyPan();
  }

  function showEmpty() {
    lastLaid = null;
    var inner = $('graph-inner');
    inner.innerHTML = '<div class="empty"><p><b>Paste JSON.</b> The graph of cards draws here.</p><p>It never leaves this device.</p></div>';
    $('meta').textContent = '';
    pan.x = 0; pan.y = 0; pan.s = 1;
    applyPan();
  }

  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 1200);
  }

  function copyText(text) {
    if (!text) return;
    function ok() { toast('Copied'); }
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(text).then(ok).catch(function () {
        fallbackCopy(text); ok();
      });
    } else {
      fallbackCopy(text); ok();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function draw(data) {
    lastGood = data;
    var g = JsonCrack.toGraph(data);
    if (g.nodes.length > NODE_CAP) {
      setErr('This JSON has ' + g.nodes.length + ' objects — too big to graph here. Format still works.');
      return;
    }
    var laid = JsonCrack.layout(g, collapsed);
    lastLaid = laid;
    var inner = $('graph-inner');
    inner.innerHTML = '';
    JsonCrack.render(inner, laid, collapsed, {
      onToggle: function (id) {
        collapsed[id] = !collapsed[id];
        draw(lastGood);
        scheduleSave();
      },
      onCopy: function (text) { copyText(text); }
    });
    $('meta').textContent = laid.nodes.length + ' cards · ' + laid.edges.length + ' edges';
    if (!fittedOnce) { fittedOnce = true; frameRoot(); }
  }

  function parseAndDraw() {
    var text = $('src').value;
    var p = JsonCrack.parseJson(text);
    if (p.empty) {
      setErr('');
      showEmpty();
      if (root.JsonCrackMp) root.JsonCrackMp.noteChange();
      scheduleSave();
      return;
    }
    if (p.error) {
      setErr(p.message);
      if (root.JsonCrackMp) root.JsonCrackMp.noteChange();
      scheduleSave();
      return;
    }
    setErr('');
    draw(p.value);
    if (root.JsonCrackMp) root.JsonCrackMp.noteChange();
    scheduleSave();
  }

  var parseTimer = 0;
  $('src').addEventListener('input', function () {
    clearTimeout(parseTimer);
    parseTimer = setTimeout(parseAndDraw, 180);
  });
  $('format').addEventListener('click', function () {
    var p = JsonCrack.parseJson($('src').value);
    if (p.empty) { setErr('Nothing to format — paste JSON first.'); return; }
    if (p.error) { setErr(p.message); return; }
    $('src').value = JSON.stringify(p.value, null, 2);
    parseAndDraw();
  });
  $('minify').addEventListener('click', function () {
    var p = JsonCrack.parseJson($('src').value);
    if (p.empty) { setErr('Nothing to minify — paste JSON first.'); return; }
    if (p.error) { setErr(p.message); return; }
    $('src').value = JSON.stringify(p.value);
    parseAndDraw();
  });
  $('sample').addEventListener('click', function () {
    $('src').value = JSON.stringify(JsonCrack.SAMPLE, null, 2);
    fittedOnce = false;
    parseAndDraw();
    setTab('graph');
  });
  $('file-input').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      $('src').value = String(r.result || '');
      fittedOnce = false;
      parseAndDraw();
      setTab('graph');
    };
    r.readAsText(f);
  });

  $('zoom-in').addEventListener('click', function () {
    var st = $('stage');
    zoomAt((st.clientWidth || 320) / 2, (st.clientHeight || 240) / 2, pan.s * 1.18);
  });
  $('zoom-out').addEventListener('click', function () {
    var st = $('stage');
    zoomAt((st.clientWidth || 320) / 2, (st.clientHeight || 240) / 2, pan.s * 0.85);
  });
  $('zoom-fit').addEventListener('click', function () { fit(); });

  function setTab(which) {
    tab = which === 'text' ? 'text' : 'graph';
    document.body.classList.toggle('tab-text', tab === 'text');
    document.body.classList.toggle('tab-graph', tab === 'graph');
    var t = $('tab-text'), g = $('tab-graph');
    if (t) { t.classList.toggle('on', tab === 'text'); t.setAttribute('aria-selected', tab === 'text' ? 'true' : 'false'); }
    if (g) { g.classList.toggle('on', tab === 'graph'); g.setAttribute('aria-selected', tab === 'graph' ? 'true' : 'false'); }
  }
  $('tab-text').addEventListener('click', function () { setTab('text'); });
  $('tab-graph').addEventListener('click', function () { setTab('graph'); });
  setTab('graph');

  var stage = $('stage');
  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest && (e.target.closest('.node') || e.target.closest('#zoom-hud'))) return;
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pts);
    if (ids.length >= 2) {
      pan.drag = false;
      var a = pts[ids[0]], b = pts[ids[1]];
      var mid = stagePoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: pan.s, mx: mid.x, my: mid.y };
      return;
    }
    pan.drag = true;
    pan.sx = e.clientX; pan.sy = e.clientY;
    pan.ox = pan.x; pan.oy = pan.y;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });
  stage.addEventListener('pointermove', function (e) {
    if (pts[e.pointerId]) { pts[e.pointerId].x = e.clientX; pts[e.pointerId].y = e.clientY; }
    var ids = Object.keys(pts);
    if (pinch && ids.length >= 2) {
      var a = pts[ids[0]], b = pts[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.d > 8) zoomAt(pinch.mx, pinch.my, pinch.s * (d / pinch.d));
      return;
    }
    if (!pan.drag) return;
    pan.x = pan.ox + (e.clientX - pan.sx);
    pan.y = pan.oy + (e.clientY - pan.sy);
    applyPan();
  });
  function endPtr(e) {
    delete pts[e.pointerId];
    if (Object.keys(pts).length < 2) pinch = null;
    if (!Object.keys(pts).length) pan.drag = false;
  }
  stage.addEventListener('pointerup', endPtr);
  stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('wheel', function (e) {
    e.preventDefault();
    var p = stagePoint(e);
    var next = pan.s * (e.deltaY < 0 ? 1.08 : 0.92);
    zoomAt(p.x, p.y, next);
  }, { passive: false });

  try {
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (tab === 'text') { setTab('graph'); return; }
        if (pan.s !== 1 || Math.abs(pan.x - 24) > 8 || Math.abs(pan.y - 24) > 8) { fit(); }
      });
    }
  } catch (e) {}

  root.JsonCrackApp = {
    getText: function () { return $('src').value; },
    setText: function (t) {
      applying = true;
      $('src').value = t;
      applying = false;
      parseAndDraw();
    },
    parseAndDraw: parseAndDraw,
    fit: fit,
    setTab: setTab
  };

  function boot(rec) {
    applying = true;
    if (rec && rec.collapsed && typeof rec.collapsed === 'object') collapsed = rec.collapsed;
    if (rec && typeof rec.text === 'string') $('src').value = rec.text;
    else $('src').value = JSON.stringify(JsonCrack.SAMPLE, null, 2);
    applying = false;
    parseAndDraw();
  }

  if (saveDb && saveDb.get) {
    saveDb.get('last').then(boot).catch(function () { boot(null); });
  } else boot(null);
})(typeof window !== 'undefined' ? window : this);
