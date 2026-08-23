// Civiclock — GifOS wiring. Invite is OS chrome. Host ticks. Everyone paints.
(function () {
  'use strict';
  var C = window.Civiclock;
  var R = window.CiviclockRender;
  var $ = function (id) { return document.getElementById(id); };

  var TOOLS = [
    { id: 'pan', g: '✋', label: 'Pan', cost: 0 },
    { id: 'inspect', g: '🔍', label: 'Look', cost: 0 },
    { id: 'road', g: '━━', label: 'Road', cost: C.COST[C.T.ROAD] },
    { id: 'homes', g: '⌂', label: 'Homes', cost: C.COST[C.T.HOME] },
    { id: 'shops', g: '▦', label: 'Shops', cost: C.COST[C.T.SHOP] },
    { id: 'works', g: '▣', label: 'Works', cost: C.COST[C.T.WORK] },
    { id: 'plant', g: '♨', label: 'Plant', cost: C.COST[C.T.PLANT] },
    { id: 'pump', g: '💧', label: 'Pump', cost: C.COST[C.T.PUMP] },
    { id: 'park', g: '❀', label: 'Park', cost: C.COST[C.T.PARK] },
    { id: 'line', g: '⌁', label: 'Line', cost: C.COST[C.T.LINE] },
    { id: 'bulldoze', g: '✕', label: 'Clear', cost: C.BULLDOZE }
  ];

  var world = C.blank(7);
  var tool = 'road';
  var hover = { x: -1, y: -1 };
  var sheetKind = null;
  var me = { id: 'local', name: '' };
  var owner = true;
  var cityDb = null, editsDb = null, cursorsDb = null, prefsDb = null;
  var cursors = [];
  var cam = { x: 0, y: 0, s: 1 };
  var canvas = $('map');
  var ctx = canvas.getContext('2d');
  var dayT = 0.45, now0 = Date.now();
  var lastTickAt = 0;
  var pausedLocal = false;
  var coachOn = true;
  var lastPaint = { x: -1, y: -1 };
  var pointers = {};
  var pinch0 = null;
  var overlayStack = [];

  function hasGifos() {
    return !!(window.gifos && gifos.db);
  }

  var toolsEl = $('tools');
  TOOLS.forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tool ' + t.id;
    b.dataset.tool = t.id;
    b.innerHTML = '<span class="g">' + t.g + '</span>' + t.label +
      (t.cost ? '<span class="cost">$' + t.cost + '</span>' : '');
    b.addEventListener('click', function () { setTool(t.id); });
    toolsEl.appendChild(b);
  });

  function setTool(id) {
    tool = id;
    TOOLS.forEach(function (t) {
      var el = toolsEl.querySelector('[data-tool="' + t.id + '"]');
      if (el) el.classList.toggle('on', t.id === id);
    });
    savePrefs();
  }
  setTool('road');

  function resize() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, (w * dpr) | 0);
    canvas.height = Math.max(1, (h * dpr) | 0);
    if (!cam._inited) {
      var phone = w < 520;
      cam.s = Math.max(1.15, Math.min(2.4, dpr * (phone ? 1.55 : 1.35)));
      focusTile(8, 11, cam.s);
    }
  }
  window.addEventListener('resize', resize);

  function screenToTile(cx, cy) {
    var r = canvas.getBoundingClientRect();
    var dpr = canvas.width / Math.max(1, r.width);
    var mx = (cx - r.left) * dpr;
    var my = (cy - r.top) * dpr;
    var wx = (mx - cam.x) / cam.s;
    var wy = (my - cam.y) / cam.s;
    return R.pickTile(cam, wx, wy);
  }

  function hud() {
    var m = $('money');
    m.textContent = C.moneyStr(world.money);
    m.classList.toggle('broke', world.money < 0);
    $('pop').textContent = (world.pop || 0) + ' people';
    $('date').textContent = C.dateStr(world.month);
    var night = dayT < 0.22 || dayT > 0.78;
    $('tod').textContent = night ? '☾' : (dayT < 0.32 || dayT > 0.7 ? '🌅' : '☀');
    var p = $('pow'), wa = $('wat');
    p.textContent = '⚡ ' + (world.powerUsed || 0) + '/' + (world.powerCap || 0);
    wa.textContent = '💧 ' + (world.waterUsed || 0) + '/' + (world.waterCap || 0);
    p.className = 'svc' + (world.powerUsed > world.powerCap ? ' bad' : world.powerCap ? ' ok' : '');
    wa.className = 'svc' + (world.waterUsed > world.waterCap ? ' bad' : world.waterCap ? ' ok' : '');
    ['H', 'S', 'W'].forEach(function (k) {
      var el = document.querySelector('#demand i[data-k="' + k + '"]');
      if (!el) return;
      var v = (world.demand && world.demand[k]) || 0;
      var h = 4 + Math.max(0, v) * 22;
      el.style.height = h + 'px';
      el.style.opacity = v < 0 ? 0.35 : 1;
    });
    $('headline').textContent = world.headline || '';
    var sp = world.speed || 0;
    document.querySelectorAll('.speeds button').forEach(function (b) {
      b.classList.toggle('on', (b.dataset.sp | 0) === sp);
    });
  }

  function paintMap() {
    var agents = C.people(world, dayT);
    R.paint(ctx, world, cam, {
      dayT: dayT, now: Date.now() - now0, hover: hover,
      agents: agents, cursors: cursors, meId: me.id
    });
  }

  function loop() {
    var sp = pausedLocal ? 0 : (world.speed || 0);
    var period = sp <= 0 ? 0 : sp >= 3 ? 280 : 900;
    if (owner && period && Date.now() - lastTickAt >= period) {
      lastTickAt = Date.now();
      hostTick();
    }
    if (sp > 0) {
      dayT = (dayT + (sp >= 3 ? 0.004 : 0.0018)) % 1;
    }
    hud();
    paintMap();
    requestAnimationFrame(loop);
  }

  function persistWorld(w) {
    world = w;
    if (!cityDb) return;
    cityDb.put(C.dump(w)).catch(function () {});
  }

  function hostTick() {
    if (!owner) return;
    var apply = function (edits) {
      var w = C.applyEdits(world, edits || []);
      w = C.tick(w);
      persistWorld(w);
      if (editsDb && edits && edits.length) {
        edits.forEach(function (e) {
          if (e && e.id) editsDb.delete(e.id).catch(function () {});
        });
      }
    };
    if (!editsDb) { apply([]); return; }
    editsDb.getAll().then(function (rows) {
      apply(rows || []);
    }).catch(function () { apply([]); });
  }

  function doPaint(x, y) {
    if (tool === 'pan') return;
    if (tool === 'inspect') { openInspect(x, y); return; }
    if (lastPaint.x === x && lastPaint.y === y) return;
    lastPaint = { x: x, y: y };
    if (coachOn) hideCoach();
    var r = C.paint(world, x, y, tool, me.id);
    if (!r.ok) {
      flash(r.reason);
      return;
    }
    world = r.world;
    hud();
    if (editsDb && !owner) {
      editsDb.put({
        id: 'e_' + me.id + '_' + Date.now(),
        x: x, y: y, tool: tool, by: me.id, name: me.name, at: Date.now()
      }).catch(function (err) { flash(String(err && err.message || err)); });
    } else {
      persistWorld(world);
    }
  }

  function flash(msg) {
    if (!msg) return;
    $('headline').textContent = msg;
  }

  function openInspect(x, y) {
    var info = C.inspect(world, x, y);
    if (!info) return;
    sheetKind = 'inspect';
    $('sheetTitle').textContent = info.title.replace(/^./, function (ch) { return ch.toUpperCase(); });
    var chips = '<div class="kv">' +
      (C.isZone(info.type) ? '<span>' + info.occ + ' inside</span>' : '') +
      '<span class="' + (info.power ? 'ok' : 'no') + '">' + (info.power ? 'Powered' : 'No power') + '</span>' +
      '<span class="' + (info.water ? 'ok' : 'no') + '">' + (info.water ? 'Watered' : 'Dry') + '</span>' +
      '<span>Land ' + info.value + '</span>' +
      (info.traffic ? '<span>Traffic ' + info.traffic + '</span>' : '') +
      '</div>';
    var why = '<ul class="why">' + info.why.map(function (s) {
      return '<li>' + esc(s) + '</li>';
    }).join('') + '</ul>';
    $('sheetBody').innerHTML = chips + why;
    showSheet(true);
  }

  function openBudget() {
    sheetKind = 'budget';
    $('sheetTitle').textContent = 'Budget';
    var tax = world.tax;
    $('sheetBody').innerHTML =
      '<p>Rates on people and jobs pay for plants, pumps, parks and roads. The city lives in this file.</p>' +
      '<div class="taxrow"><span>Tax ' + tax + '%</span>' +
      '<input id="tax" type="range" min="0" max="20" value="' + tax + '"></div>' +
      '<table class="books"><tbody>' +
      '<tr><td>Rates last month</td><td class="in">' + C.moneyStr(world.income) + '</td></tr>' +
      '<tr><td>Power, water, parks, roads</td><td class="out">' + C.moneyStr(-world.expense) + '</td></tr>' +
      '<tr><td>Net</td><td class="' + (world.income - world.expense >= 0 ? 'in' : 'out') + '">' +
        C.moneyStr(world.income - world.expense) + '</td></tr>' +
      '<tr><td>Treasury</td><td>' + C.moneyStr(world.money) + '</td></tr>' +
      '</tbody></table>' +
      '<p class="lvl">Invite in the bar above this app puts a friend on the same land as co-mayor. No account.</p>' +
      '<button type="button" class="ghost wide danger" id="newEmpty">New empty land</button>' +
      '<button type="button" class="ghost wide" id="newVillage">New village</button>';
    showSheet(true);
    $('tax').addEventListener('input', function () {
      var v = this.value | 0;
      world = C.cloneWorld(world);
      world.tax = v;
      persistWorld(world);
      openBudget();
    });
    $('newEmpty').addEventListener('click', function () { resetCity('empty'); });
    $('newVillage').addEventListener('click', function () { resetCity('village'); });
  }

  function resetCity(kind) {
    world = kind === 'village' ? C.village(7) : C.blank(7);
    world.speed = 1;
    persistWorld(world);
    if (kind === 'village') hideCoach();
    else showCoach();
    closeSheet();
  }

  function esc(s) {
    return String(s || '').replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  }

  function showSheet(on) {
    $('sheet').hidden = !on;
    if (on) {
      if (overlayStack.indexOf('sheet') < 0) overlayStack.push('sheet');
    } else {
      overlayStack = overlayStack.filter(function (k) { return k !== 'sheet'; });
      sheetKind = null;
    }
  }
  function closeSheet() { showSheet(false); }

  function hideCoach() {
    coachOn = false;
    $('coach').hidden = true;
    savePrefs();
  }
  function showCoach() {
    coachOn = true;
    $('coach').hidden = false;
  }

  $('sheetClose').addEventListener('click', closeSheet);
  $('budgetBtn').addEventListener('click', openBudget);
  $('villageBtn').addEventListener('click', function () {
    world = C.village(7);
    world.speed = 1;
    persistWorld(world);
    hideCoach();
    focusTile(9, 10, Math.max(cam.s, canvas.width < 900 ? 1.7 : 1.45));
  });
  $('coachHide').addEventListener('click', hideCoach);

  document.querySelectorAll('.speeds button').forEach(function (b) {
    b.addEventListener('click', function () {
      world = C.cloneWorld(world);
      world.speed = b.dataset.sp | 0;
      persistWorld(world);
      hud();
    });
  });

  // pointer: one finger paints or pans; two fingers pan/pinch
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var n = Object.keys(pointers).length;
    if (n === 2) {
      var ids = Object.keys(pointers);
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch0 = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        s: cam.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
        cx: cam.x, cy: cam.y
      };
      return;
    }
    lastPaint = { x: -1, y: -1 };
    var t = screenToTile(e.clientX, e.clientY);
    hover = t;
    if (tool !== 'pan' && n === 1) doPaint(t.x, t.y);
    publishCursor(t);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!pointers[e.pointerId]) {
      hover = screenToTile(e.clientX, e.clientY);
      return;
    }
    var prev = pointers[e.pointerId];
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var n = Object.keys(pointers).length;
    if (n >= 2 && pinch0) {
      var ids = Object.keys(pointers);
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var dist = Math.hypot(a.x - b.x, a.y - b.y);
      var ns = pinch0.s * (dist / Math.max(8, pinch0.dist));
      ns = Math.max(0.55, Math.min(2.8, ns));
      cam.s = ns;
      return;
    }
    var t = screenToTile(e.clientX, e.clientY);
    hover = t;
    if (tool === 'pan' || n === 1 && tool === 'pan') {
      cam.x += (e.clientX - prev.x) * (canvas.width / canvas.getBoundingClientRect().width);
      cam.y += (e.clientY - prev.y) * (canvas.width / canvas.getBoundingClientRect().width);
    } else if (tool !== 'inspect' && tool !== 'pan') {
      doPaint(t.x, t.y);
    }
    publishCursor(t);
  });
  function endPtr(e) {
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinch0 = null;
  }
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('pointerleave', function () { hover = { x: -1, y: -1 }; });

  var wheelAcc = 0;
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var ns = cam.s * (e.deltaY > 0 ? 0.92 : 1.08);
    cam.s = Math.max(0.55, Math.min(2.8, ns));
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    if (e.key === ' ' ) {
      e.preventDefault();
      world = C.cloneWorld(world);
      world.speed = world.speed ? 0 : 1;
      persistWorld(world);
    }
    var map = { r: 'road', h: 'homes', s: 'shops', w: 'works', p: 'plant', u: 'pump', b: 'bulldoze', i: 'inspect', v: 'pan' };
    if (map[e.key]) setTool(map[e.key]);
    if (e.key === 'Escape') closeSheet();
  });

  var lastCursorAt = 0;
  function publishCursor(t) {
    if (!cursorsDb || !t) return;
    var n = Date.now();
    if (n - lastCursorAt < 180) return;
    lastCursorAt = n;
    cursorsDb.put({
      id: me.id, x: t.x, y: t.y, tool: tool, name: me.name || 'mayor', at: n
    }).catch(function () {});
  }

  function savePrefs() {
    if (!prefsDb) return;
    prefsDb.put({ id: 'ui', tool: tool, coach: coachOn ? 1 : 0, at: Date.now() }).catch(function () {});
  }

  function showMayors(list) {
    var live = (list || []).filter(function (c) {
      return c && Date.now() - (c.at || 0) < 8000;
    });
    cursors = live;
    var el = $('mayors');
    if (live.length <= 1) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = live.length + ' mayors on this land';
  }

  function focusTile(tx, ty, scale) {
    var p = R.iso(tx, ty);
    cam.s = scale;
    cam.x = canvas.width / 2 - p.sx * cam.s;
    cam.y = canvas.height * 0.42 - p.sy * cam.s;
    cam._inited = true;
  }

  function coverShot() {
    world = C.grownVillage(48);
    world.speed = 1;
    coachOn = false;
    $('coach').hidden = true;
    closeSheet();
    dayT = 0.42;
    resize();
    focusTile(9, 10, Math.min(2.2, (canvas.width / 760) * 1.55));
    hud();
    paintMap();
  }

  function bindBack() {
    if (!window.gifos || !gifos.onBack) return;
    gifos.onBack(function () {
      if (!$('sheet').hidden) { closeSheet(); return true; }
      if (coachOn && world.kind !== 'empty') { hideCoach(); return true; }
      return false;
    });
  }

  function boot() {
    resize();
    hud();
    requestAnimationFrame(loop);
    if (!hasGifos()) {
      bindBack();
      return;
    }
    try {
      cityDb = gifos.db('city');
      editsDb = gifos.db('edits');
      cursorsDb = gifos.db('cursors');
      prefsDb = gifos.db('prefs');
    } catch (e) {}
    Promise.resolve()
      .then(function () { return gifos.me ? gifos.me() : { id: 'local', name: '' }; })
      .then(function (m) { me = m || me; })
      .then(function () { return gifos.info ? gifos.info() : { owner: true }; })
      .then(function (info) { owner = !info || info.owner !== false; })
      .then(function () { return prefsDb ? prefsDb.get('ui') : null; })
      .then(function (ui) {
        if (ui && ui.tool) setTool(ui.tool);
        if (ui && ui.coach === 0) hideCoach();
      })
      .then(function () {
        if (cityDb && cityDb.subscribe) {
          cityDb.subscribe(function (rows) {
            var rec = null, i;
            for (i = 0; i < (rows || []).length; i++) if (rows[i].id === 'world') rec = rows[i];
            if (rec && rec.tiles) {
              if (!owner && rec.v && world.v && rec.v < world.v) return;
              world = C.load(rec);
              if (world.kind === 'village' || world.pop > 0) hideCoach();
            }
          });
        }
        if (cursorsDb && cursorsDb.subscribe) cursorsDb.subscribe(showMayors);
        return cityDb ? cityDb.get('world') : null;
      })
      .then(function (rec) {
        if (rec && rec.tiles) {
          world = C.load(rec);
          if (world.kind === 'village' || world.pop > 0) hideCoach();
        } else if (owner) {
          persistWorld(world);
        }
        return gifos.launch ? gifos.launch() : null;
      })
      .then(function (launch) {
        if (launch && launch.village && owner && world.month === 0 && world.pop === 0) {
          world = C.village(7);
          world.speed = 1;
          persistWorld(world);
          hideCoach();
        }
        bindBack();
      })
      .catch(function () { bindBack(); });
  }

  window.CiviclockApp = { coverShot: coverShot, world: function () { return world; }, setWorld: persistWorld };
  boot();
})();
