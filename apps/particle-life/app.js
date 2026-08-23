/*
 * Particle Life — GifOS chrome around hunar4321's jar.
 *
 * vendor/particle-life.js is the attraction loop. This file is the shell:
 * touch to stir, the New mix / Reset buttons, the sliders, and a private
 * last-seed so the jar on this device is the one you left.
 *
 * Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var PL = root.ParticleLife;
  var api = root.gifos || null;
  var saveDb = null;
  var saveTimer = 0;
  var canvas = document.getElementById('jar');
  var pulling = false;
  var lastStir = 0;

  var $ = function (id) { return document.getElementById(id); };

  function paintSeed() {
    var el = $('seed');
    if (el) el.textContent = 'mix ' + String(PL.getSeed());
  }

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put({
        id: 'jar',
        seed: PL.getSeed(),
        colors: PL.settings.numColors,
        count: PL.settings.atoms.count
      }).catch(function () {});
    }, 250);
  }

  function newMix() {
    if (root.PLMp && root.PLMp.onNewMix && root.PLMp.onNewMix()) return;
    var seed = (Math.random() * 0x100000000) >>> 0;
    PL.setSeed(seed);
    paintSeed();
    persist();
  }

  function resetAtoms() {
    if (root.PLMp && root.PLMp.onReset && root.PLMp.onReset()) return;
    PL.resetAtoms();
  }

  function stirAt(e, sign) {
    var w = PL.worldFromEvent(e, canvas);
    if (!w) return;
    var s = sign != null ? sign : (pulling || e.shiftKey ? -1 : 1);
    PL.poke(w.x, w.y, s);
    if (root.PLMp && root.PLMp.onPoke) root.PLMp.onPoke(w.x / PL.WORLD_W, w.y / PL.WORLD_H, s);
  }

  function onPointerDown(e) {
    if (e.button != null && e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    lastStir = Date.now();
    stirAt(e, e.button === 2 ? -1 : null);
  }

  function onPointerMove(e) {
    if (e.buttons === 0 && e.pressure === 0) return;
    var t = Date.now();
    if (t - lastStir < 80) return;
    lastStir = t;
    stirAt(e);
  }

  function bind() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    $('mixBtn').addEventListener('click', function (e) { e.preventDefault(); newMix(); });
    $('resetBtn').addEventListener('click', function (e) { e.preventDefault(); resetAtoms(); });
    $('pullBtn').addEventListener('click', function (e) {
      e.preventDefault();
      pulling = !pulling;
      $('pullBtn').classList.toggle('on', pulling);
      $('pullBtn').textContent = pulling ? 'Pull' : 'Push';
    });

    document.addEventListener('keydown', function (e) {
      var tag = e.target && e.target.tagName;
      if (tag && /INPUT|SELECT|TEXTAREA/.test(tag)) return;
      if (e.key === 'r' || e.key === 'R') { e.preventDefault(); newMix(); }
      if (e.key === 'o' || e.key === 'O') { e.preventDefault(); resetAtoms(); }
    });

    var colors = $('colors');
    var count = $('count');
    colors.value = String(PL.settings.numColors);
    count.value = String(PL.settings.atoms.count);
    $('countN').textContent = String(PL.settings.atoms.count);
    colors.addEventListener('change', function () {
      var n = parseInt(colors.value, 10) || 4;
      if (root.PLMp && root.PLMp.onRecipe && root.PLMp.onRecipe({ colors: n })) return;
      PL.setNumColors(n);
      paintSeed();
      persist();
    });
    count.addEventListener('input', function () {
      $('countN').textContent = count.value;
    });
    count.addEventListener('change', function () {
      var n = parseInt(count.value, 10) || 180;
      if (root.PLMp && root.PLMp.onRecipe && root.PLMp.onRecipe({ count: n })) return;
      PL.setCount(n);
      persist();
    });
  }

  function sizeJar() {
    var st = $('stage');
    if (!st || !canvas) return;
    var s = Math.max(80, Math.min(st.clientWidth, st.clientHeight));
    canvas.style.width = s + 'px';
    canvas.style.height = s + 'px';
  }

  function boot() {
    PL.mount(canvas);
    sizeJar();
    PL.step(140);
    bind();
    paintSeed();
    PL.start();
    if (root.ResizeObserver) new ResizeObserver(sizeJar).observe($('stage'));
    else window.addEventListener('resize', sizeJar);
    root.requestAnimationFrame(sizeJar);

    if (!api || !api.db) return;
    saveDb = api.db('save');
    saveDb.get('jar').then(function (row) {
      if (!row || root.PLMp && root.PLMp.busy()) return;
      if (row.colors) PL.settings.numColors = row.colors;
      if (row.count) PL.settings.atoms.count = row.count;
      if (row.seed != null) PL.setSeed(row.seed);
      PL.step(140);
      $('colors').value = String(PL.settings.numColors);
      $('count').value = String(PL.settings.atoms.count);
      $('countN').textContent = String(PL.settings.atoms.count);
      paintSeed();
    }).catch(function () {});
  }

  root.PLApp = {
    newMix: newMix,
    resetAtoms: resetAtoms,
    paintSeed: paintSeed,
    persist: persist,
    stirAt: stirAt
  };

  boot();
})(window);
