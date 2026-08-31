/* Sketch a profile, extrude a B-rep solid. Last document is the GIF. */
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var pad, view, engine, db;
  var applying = false;
  var saveTimer = 0;
  var lastTri = 0;
  var me = { id: '', name: '' };

  function setBoot(msg, frac) {
    $('boot-msg').textContent = msg;
    $('boot-fill').style.width = Math.round(Math.max(8, Math.min(100, (frac || 0) * 100))) + '%';
  }
  function status(msg, kind) {
    var el = $('status');
    el.textContent = msg || '';
    el.className = kind || '';
  }
  function setSolid(n) {
    $('solid').textContent = n ? (n + ' triangles') : 'No solid yet';
  }

  function currentDoc() {
    var s = pad.doc();
    return {
      id: 'doc',
      points: s.points,
      closed: s.closed,
      radius: +$('radius').value,
      height: +$('height').value,
      by: me.id || ''
    };
  }

  function applyDoc(rec) {
    if (!rec || !rec.points) return;
    applying = true;
    pad.set(rec.points, rec.closed, rec.radius);
    if (rec.height != null) {
      $('height').value = rec.height;
      $('hVal').textContent = String(rec.height);
    }
    if (rec.radius != null) {
      $('radius').value = rec.radius;
      $('rVal').textContent = String(rec.radius);
      pad.radius = +rec.radius;
    }
    applying = false;
  }

  function saveDoc() {
    if (!db || applying) return;
    var rec = currentDoc();
    db.put(rec).catch(function (e) {
      status((e && e.message) || 'Could not save.', 'err');
    });
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDoc, 280);
  }

  function rebuild() {
    var s = pad.doc();
    if (!s.closed || s.points.length < 3) {
      view.setMesh(null);
      setSolid(0);
      status(s.points.length ? 'Close the loop to make a solid.' : 'Tap the plane to draw.');
      return Promise.resolve();
    }
    status('Building solid…');
    var height = +$('height').value;
    var radius = +$('radius').value;
    return engine.sketchSolid(s.points, height, radius).then(function (pair) {
      var mesh = root.CadView.flatten(pair);
      view.setMesh(mesh);
      lastTri = mesh.triCount | 0;
      setSolid(lastTri);
      status('Solid ready.', 'ok');
    }).catch(function (e) {
      view.setMesh(null);
      setSolid(0);
      status((e && e.message) || 'Could not build that solid.', 'err');
    });
  }

  function loadSample() {
    var s = root.SAMPLE_PLATE;
    applying = true;
    pad.set(s.points, true, s.radius);
    $('height').value = s.height;
    $('hVal').textContent = String(s.height);
    $('radius').value = s.radius;
    $('rVal').textContent = String(s.radius);
    pad.radius = s.radius;
    applying = false;
    saveDoc();
    return rebuild();
  }

  function wireUi() {
    pad.onChange = function () {
      if (applying) return;
      scheduleSave();
      rebuild();
    };
    $('height').addEventListener('input', function () {
      $('hVal').textContent = $('height').value;
      if (applying) return;
      scheduleSave();
      rebuild();
    });
    $('radius').addEventListener('input', function () {
      $('rVal').textContent = $('radius').value;
      pad.radius = +$('radius').value;
      if (applying) return;
      scheduleSave();
      rebuild();
    });
    $('undo').addEventListener('click', function () { pad.undo(); });
    $('close').addEventListener('click', function () { pad.close(); });
    $('clear').addEventListener('click', function () {
      pad.clear();
      view.setMesh(null);
      setSolid(0);
      scheduleSave();
    });
    $('sample').addEventListener('click', function () { loadSample(); });
    if (root.gifos && gifos.onBack) {
      gifos.onBack(function () { return pad.undo(); });
    }
  }

  function boot() {
    pad = new root.SketchPad($('sketch'));
    try { view = new root.CadView($('view')); }
    catch (e) {
      setBoot((e && e.message) || 'WebGL is not available.', 1);
      return;
    }
    engine = new root.CadEngine();
    engine.onlog = function (m) {
      if (/ERROR|error|Null/.test(m)) status(m, 'err');
    };
    engine.onprogress = function (p) {
      if (p && p.opType) status(p.opType + '…');
    };

    setBoot('Loading the CAD kernel…', 0.15);
    var ready = engine.init().then(function () {
      setBoot('Kernel ready.', 1);
      $('boot').hidden = true;
      $('app').hidden = false;
      pad.resize();
      view.resize();
      wireUi();
    });

    var who = (root.gifos && gifos.me) ? gifos.me().catch(function () { return {}; }) : Promise.resolve({});
    if (root.gifos && gifos.db) {
      try { db = gifos.db('doc'); } catch (e) { db = null; }
    }

    Promise.all([ready, who]).then(function (pair) {
      me = pair[1] || {};
      if (!db) { loadSample(); return; }
      db.subscribe(function (rows) {
        var rec = null;
        for (var i = 0; i < (rows || []).length; i++) if (rows[i].id === 'doc') rec = rows[i];
        if (!rec) {
          if (!pad.points.length) loadSample();
          return;
        }
        var same = JSON.stringify(rec.points) === JSON.stringify(pad.doc().points)
          && rec.closed === pad.closed
          && +rec.height === +$('height').value
          && +rec.radius === +$('radius').value;
        if (same) return;
        applyDoc(rec);
        rebuild();
      });
    }).catch(function (e) {
      setBoot((e && e.message) || 'Could not start.', 1);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
