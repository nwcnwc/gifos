/*
 * Aim and Shoot — GifOS shell.
 * Invite is OS chrome. Best generation is private. A room is a cabinet of
 * generations — each player aims in their own arena.
 */
(function (root) {
  'use strict';

  root.AAS = root.AAS || {};

  var api = typeof gifos !== 'undefined' ? gifos : null;
  var saveDb = null, playersDb = null;
  try {
    if (api && api.db) {
      saveDb = api.db('save');
      playersDb = api.db('players');
    }
  } catch (e) {}

  var hiEl = document.getElementById('hi');
  var rosterEl = document.getElementById('roster');
  var statusEl = document.getElementById('status');
  var best = 1;
  var gen = 1;
  var me = { id: 'local', name: 'You' };
  var others = {};
  var started = false;
  var COARSE = !!(root.matchMedia && (
    root.matchMedia('(pointer: coarse)').matches ||
    root.matchMedia('(hover: none)').matches
  ));
  AAS.coarse = COARSE;
  if (COARSE) document.body.classList.add('touch');
  if (statusEl && COARSE) {
    statusEl.textContent = 'Left stick moves. Right side aims. FIRE shoots.';
  }

  AAS.pad = { mx: 0, my: 0, ax: 200, ay: 0, aiming: false, fire: false };

  function setBest(n) {
    n = n | 0;
    if (n > best) best = n;
    if (hiEl) hiEl.textContent = 'BEST GEN ' + best;
  }

  function persist(n) {
    if (!saveDb || n <= best) { setBest(Math.max(best, n)); return; }
    setBest(n);
    saveDb.put({ id: 'best', generation: n }).catch(function () {});
  }

  function publish() {
    if (!started || !playersDb || !me.id || me.id === 'local') return;
    playersDb.put({
      id: me.id, name: me.name, generation: gen, best: best, t: Date.now()
    }).catch(function () {});
  }

  function paintRoster() {
    var list = [{ id: me.id, name: me.name, mine: true, generation: gen, best: best }];
    Object.keys(others).forEach(function (id) {
      var p = others[id];
      list.push({ id: p.id, name: p.name || 'Player', mine: false, generation: p.generation || 1, best: p.best || 1 });
    });
    if (list.length < 2) { rosterEl.hidden = true; return; }
    list.sort(function (a, b) { return (b.generation || 0) - (a.generation || 0); });
    rosterEl.hidden = false;
    rosterEl.innerHTML = list.map(function (p) {
      return '<div class="' + (p.mine ? 'me' : '') + '">' +
        (p.name || 'Player').replace(/[<>&]/g, '') +
        ' · gen ' + (p.generation || 1) +
        (p.best && p.best > 1 ? (' (best ' + p.best + ')') : '') +
        '</div>';
    }).join('');
  }

  root.AAS.onGeneration = function (g) {
    gen = g | 0;
    persist(gen);
    publish();
    paintRoster();
  };
  root.AAS.onGameover = function (g) {
    persist(g | 0);
    gen = 1;
    publish();
    paintRoster();
  };

  AAS.applyPad = function (player) {
    var p = AAS.pad;
    if (!p || !player || player.ai) return;
    if (p.mx || p.my) {
      player.speed.x += p.mx * player.velocity * 1.4;
      player.speed.y += p.my * player.velocity * 1.4;
    }
    if (p.aiming) {
      player.lookAt(player.pos.x + p.ax, player.pos.y + p.ay);
    }
    if (p.fire) player.isShooting = true;
  };

  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  AAS.showPad = function () {
    var wrap = document.getElementById('pad');
    if (!wrap || wrap.dataset.ready) {
      if (wrap) wrap.hidden = false;
      document.body.classList.add('touch');
      return;
    }
    wrap.dataset.ready = '1';
    wrap.hidden = false;
    document.body.classList.add('touch');
    var stick = document.getElementById('p-move');
    var knob = stick.querySelector('.p-knob');
    var look = document.getElementById('p-look');
    var fire = document.getElementById('p-fire');
    var moveId = null, lookId = null, DEAD = 0.16;

    stick.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      moveId = ev.pointerId;
      capture(stick, ev.pointerId);
      nudge(ev);
    });
    stick.addEventListener('pointermove', function (ev) {
      if (ev.pointerId !== moveId) return;
      ev.preventDefault();
      nudge(ev);
    });
    function moveUp(ev) {
      if (ev.pointerId !== moveId) return;
      moveId = null;
      AAS.pad.mx = 0; AAS.pad.my = 0;
      knob.style.transform = 'translate(-50%,-50%)';
    }
    stick.addEventListener('pointerup', moveUp);
    stick.addEventListener('pointercancel', moveUp);

    function nudge(ev) {
      var r = stick.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = ev.clientX - cx, dy = ev.clientY - cy;
      var max = r.width * 0.38;
      var d = Math.hypot(dx, dy) || 1;
      if (d > max) { dx *= max / d; dy *= max / d; }
      knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
      var jx = dx / max, jy = dy / max;
      AAS.pad.mx = Math.abs(jx) < DEAD ? 0 : jx;
      AAS.pad.my = Math.abs(jy) < DEAD ? 0 : jy;
    }

    look.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      lookId = ev.pointerId;
      AAS.pad.aiming = true;
      aimFrom(ev, look);
      capture(look, ev.pointerId);
    });
    look.addEventListener('pointermove', function (ev) {
      if (ev.pointerId !== lookId) return;
      ev.preventDefault();
      aimFrom(ev, look);
    });
    function lookUp(ev) {
      if (ev.pointerId !== lookId) return;
      lookId = null;
      AAS.pad.aiming = false;
    }
    look.addEventListener('pointerup', lookUp);
    look.addEventListener('pointercancel', lookUp);

    function aimFrom(ev, node) {
      var r = node.getBoundingClientRect();
      var jx = ((ev.clientX - r.left) / r.width) * 2 - 1;
      var jy = ((ev.clientY - r.top) / r.height) * 2 - 1;
      AAS.pad.ax = jx * 280;
      AAS.pad.ay = jy * 280;
      AAS.pad.aiming = true;
    }

    function fireOn(ev) {
      ev.preventDefault();
      AAS.pad.fire = true;
      if (AAS.isGameover && AAS.retry) AAS.retry();
      else if (AAS.isStarting && AAS.startPlay) AAS.startPlay();
    }
    function fireOff(ev) {
      ev.preventDefault();
      AAS.pad.fire = false;
    }
    fire.addEventListener('pointerdown', fireOn);
    fire.addEventListener('pointerup', fireOff);
    fire.addEventListener('pointercancel', fireOff);
  };

  document.addEventListener('touchstart', function reveal() {
    document.body.classList.add('touch');
    if (typeof root.AASShowPad === 'function') root.AASShowPad();
    else AAS.showPad();
    document.removeEventListener('touchstart', reveal);
  }, { passive: true });

  if (COARSE) {
    if (typeof root.AASShowPad === 'function') root.AASShowPad();
    else AAS.showPad();
  }

  if (api && api.onBack) {
    api.onBack(function () {
      if (AAS.isGameover && AAS.goTitle) { AAS.goTitle(); return true; }
      if (AAS.player && !AAS.isStarting && AAS.goTitle) { AAS.goTitle(); return true; }
      return false;
    });
  }

  function bootNet() {
    if (!api || !playersDb) return;
    api.me().then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      if (me.id === 'local') return;
      started = true;
      playersDb.subscribe(function (list) {
        var seen = {};
        (list || []).forEach(function (p) {
          if (!p || !p.id || p.id === me.id) return;
          seen[p.id] = 1;
          others[p.id] = p;
        });
        Object.keys(others).forEach(function (id) { if (!seen[id]) delete others[id]; });
        paintRoster();
      });
      publish();
    }).catch(function () {});
  }

  if (!saveDb) { bootNet(); return; }
  saveDb.get('best').then(function (row) {
    if (row && row.generation) setBest(row.generation | 0);
  }).catch(function () {}).then(bootNet);
})(window);
