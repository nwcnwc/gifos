/* Battle City remake — canvas sim + draw. Classic script, no modules.
   Stages and SFX from feichao93/battle-city (MIT). Host ticks; guests paint. */
(function (root) {
  'use strict';

  var B = 16, FIELD = 13, SIZE = 208, TANK = 16, BULLET = 3, STEEL_POWER = 3;
  var N_BRICK = 52, N_STEEL = 26, N_TILE = 13;
  var DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  var DIRL = ['up', 'down', 'left', 'right'];
  var LEVELS = ['basic', 'fast', 'power', 'armor'];
  var PUPS = ['tank', 'star', 'grenade', 'timer', 'helmet', 'shovel'];
  var SCORES = { basic: 100, fast: 200, power: 300, armor: 400 };
  var POWER_IDX = [3, 7, 12, 17];
  var SPAWN_P = [{ x: 4 * B, y: 12 * B }, { x: 8 * B, y: 12 * B }];
  var SPAWN_B = [{ x: 0, y: 0 }, { x: 6 * B, y: 0 }, { x: 12 * B, y: 0 }];
  var COL = {
    yellow: { a: '#E7E794', b: '#E79C21', c: '#6B6B00' },
    green: { a: '#B5F7CE', b: '#008C31', c: '#005200' },
    silver: { a: '#FFFFFF', b: '#ADADAD', c: '#00424A' },
    red: { a: '#FFFFFF', b: '#B53121', c: '#5A007B' }
  };
  var PUP_BMP = {
    tank: [' wwwwwwwwwwwwwg ','w             wb','w bbbbbbbbbbbbwb','w bbbbbwgg bbbwb','w bwwwwgggb bbwb','w b    gggb bbwb','w bbbwggbbgb bwb','w bbwgggggbb bwb','w bgbg      g wb','w bggwwwwgggb wb','w b w w w wbg wb','w bb ggggggg bwb','w bbb       bbwb','gwwwwwwwwwwwwwwg',' bbbbbbbbbbbbbb ','                '],
    star: [' wwwwwwwwwwwwwg ','w             wb','w bbbbbw bbbbbwb','w bbbbwwg bbbbwb','w bbbbwwg bbbbwb','w wwwwwggwwww wb','w bgggwgwggg  wb','w bbgwwwwgg  wwb','w bbwwggwwg bbwb','w bgwgg ggwg bwb','w bwgg   ggw bwb','w bg   bb  g bwb','w b  bbbbbb  bwb','gwwwwwwwwwwwwwgb',' bbbbbbbbbbbbbb ','                '],
    grenade: [' wwwwwwwwwwwwwg ','w             wb','w bbbwwwgg bbbwb','w bbbwgb  g bbwb','w bbwgggb  g bwb','w bwgbwgbg g bwb','w bg g  g  g bwb','w bwgbwgbg g bwb','w bg g  g  g bwb','w bwgbwgbg g bwb','w bbgb  g bbbbwb','w bbbwgg bbbbbwb','w bbb   bbbbbbwb','gwwwwwwwwwwwwwgb',' bbbbbbbbbbbbbb ','                '],
    timer: [' wwwwwwwwwwwwwg ','w             wb','w bbbbwgwg bbbwb','w bbbbg   wg bwb','w bbbgggg    bwb','w bbgwwwwg bbbwb','w bgwwbwwwg bbwb','w bgwwbwwwg bbwb','w bgwwwbwwg bbwb','w b gwwwwg bbbwb','w bb gggg bbbbwb','w bbb    bbbbbwb','w bbbbbbbbbbbbwb','gwwwwwwwwwwwwwgb',' bbbbbbbbbbbbbb ','                '],
    helmet: [' wwwwwwwwwwwwwg ','w             wb','w bbbbbbbbbbbbwb','w bbbbbbbbbbbbwb','w bbbwwwgg bbbwb','w bbwwggggg bbwb','w bbwgggggg bbwb','w bbggggggg bbwb','w bgggggggg bbwb','w b     gggg bwb','w bbbbbb     bwb','w bbbbbbbbbbbbwb','w bbbbbbbbbbbbwb','gwwwwwwwwwwwwwgb',' bbbbbbbbbbbbbb ','                '],
    shovel: [' wwwwwwwwwwwwwg ','w             wb','w bbbbbbbbwbbbwb','w bbbbbbbbwgbbwb','w bbbbbbbbgggbwb','w bbbbbbbw   bwb','w bbbwbbw bbbbwb','w bbwwgw bbbbbwb','w bwwgbw bbbbbwb','w bwgbggg bbbbwb','w bggggg bbbbbwb','w bgggg bbbbbbwb','w b    bbbbbbbwb','gwwwwwwwwwwwwwgb',' bbbbbbbbbbbbbb ','                ']
  };
  var PUP_COL = { ' ': null, w: '#FFFFFF', g: '#ADADAD', b: '#00424A' };
  var FOREST = ['dbbbcbad','bbcacaca','bbbccaaa','cbbaabca','bbacaaac','bcbaaaaa','aaaaacaa','daacaaad'];
  var FOREST_COL = { a: '#8CD600', b: '#005208', c: '#084A00', d: null };

  function moveSpeed(t) {
    if (t.side === 'player') return 0.045;
    if (t.level === 'fast') return 0.06;
    if (t.level === 'power') return 0.045;
    return 0.03;
  }
  function bulletSpeed(t) {
    if (t.side === 'player') return t.level === 'basic' ? 0.12 : 0.18;
    if (t.level === 'basic') return 0.12;
    if (t.level === 'power') return 0.24;
    return 0.18;
  }
  function bulletInterval(t) { return t.level === 'basic' ? 300 : 200; }
  function bulletLimit(t) {
    if (t.side === 'bot' || t.level === 'basic' || t.level === 'fast') return 1;
    return 2;
  }
  function bulletPower(t) {
    if (t.side === 'player' && t.level === 'armor') return 3;
    if (t.side === 'bot' && t.level === 'power') return 2;
    return 1;
  }
  function round8(x) { return Math.round(x / 8) * 8; }
  function nextId(tag, g) { g.ids[tag] = (g.ids[tag] || 0) + 1; return tag + g.ids[tag]; }
  function collide(a, b, th) {
    th = th || 0;
    return a.x - b.width - th <= b.x && b.x <= a.x + a.width + th &&
           a.y - b.height - th <= b.y && b.y <= a.y + a.height + th;
  }
  function rectTank(t) { return { x: t.x, y: t.y, width: TANK, height: TANK }; }
  function rectBlt(b) { return { x: b.x, y: b.y, width: BULLET, height: BULLET }; }
  function inField(r) {
    return r.x >= -0.01 && r.y >= -0.01 && r.x + r.width <= SIZE + 0.01 && r.y + r.height <= SIZE + 0.01;
  }
  function b64bits(arr) {
    var n = arr.length, bytes = [];
    for (var i = 0; i < n; i += 8) {
      var v = 0;
      for (var j = 0; j < 8 && i + j < n; j++) if (arr[i + j]) v |= 1 << j;
      bytes.push(v);
    }
    var s = '';
    for (var k = 0; k < bytes.length; k++) s += String.fromCharCode(bytes[k]);
    return btoa(s);
  }
  function bitsb64(s, n) {
    var bin = atob(s || ''), arr = new Array(n);
    for (var i = 0; i < n; i++) arr[i] = !!(bin.charCodeAt(i >> 3) & (1 << (i & 7)));
    return arr;
  }
  function parseBrickBits(str) {
    if (str.length === 1) {
      var short = parseInt(str, 16), lng = 0;
      if (short & 1) lng += 0xf000;
      if (short & 2) lng += 0x0f00;
      if (short & 4) lng += 0x00f0;
      if (short & 8) lng += 0x000f;
      return lng;
    }
    return parseInt(str, 16);
  }
  function emptyBool(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = false; return a; }

  function parseStage(raw) {
    var bricks = emptyBool(N_BRICK * N_BRICK);
    var steels = emptyBool(N_STEEL * N_STEEL);
    var rivers = emptyBool(N_TILE * N_TILE);
    var snows = emptyBool(N_TILE * N_TILE);
    var forests = emptyBool(N_TILE * N_TILE);
    var eagle = { x: 6 * B, y: 12 * B, broken: false };
    for (var row = 0; row < FIELD; row++) {
      var line = String(raw.map[row] || '').toLowerCase().trim().split(/ +/);
      for (var col = 0; col < FIELD; col++) {
        var item = (line[col] || 'x').trim();
        var ch = item.charAt(0);
        if (ch === 'b') {
          var bits = parseBrickBits(item.substring(1) || 'f');
          var br = 4 * row, bc = 4 * col, N = N_BRICK;
          var parts = [(bits >> 12) & 0xf, (bits >> 8) & 0xf, (bits >> 4) & 0xf, bits & 0xf];
          var ox = [0, 2, 0, 2], oy = [0, 0, 2, 2];
          for (var p = 0; p < 4; p++) {
            var part = parts[p], r0 = br + oy[p], c0 = bc + ox[p];
            if (part & 1) bricks[r0 * N + c0] = true;
            if (part & 2) bricks[r0 * N + c0 + 1] = true;
            if (part & 4) bricks[(r0 + 1) * N + c0] = true;
            if (part & 8) bricks[(r0 + 1) * N + c0 + 1] = true;
          }
        } else if (ch === 't') {
          var tb = parseInt(item.charAt(1) || 'f', 16);
          if (tb & 1) steels[(2 * row) * N_STEEL + 2 * col] = true;
          if (tb & 2) steels[(2 * row) * N_STEEL + 2 * col + 1] = true;
          if (tb & 4) steels[(2 * row + 1) * N_STEEL + 2 * col] = true;
          if (tb & 8) steels[(2 * row + 1) * N_STEEL + 2 * col + 1] = true;
        } else if (ch === 'r') rivers[row * N_TILE + col] = true;
        else if (ch === 'f') forests[row * N_TILE + col] = true;
        else if (ch === 's') snows[row * N_TILE + col] = true;
        else if (ch === 'e') eagle = { x: col * B, y: row * B, broken: false };
      }
    }
    var remain = [];
    (raw.bots || []).forEach(function (d) {
      var sp = String(d).split('*');
      var n = parseInt(sp[0], 10), lv = (sp[1] || 'basic').trim();
      for (var i = 0; i < n; i++) remain.push(lv);
    });
    return {
      name: String(raw.name || ''), difficulty: raw.difficulty || 1,
      bricks: bricks, steels: steels, rivers: rivers, snows: snows, forests: forests,
      eagle: eagle, remain: remain
    };
  }

  function hitMap(g, kind, r, th) {
    var size = kind === 'brick' ? 4 : kind === 'steel' ? 8 : B;
    var N = kind === 'brick' ? N_BRICK : kind === 'steel' ? N_STEEL : N_TILE;
    var grid = g.map[kind === 'brick' ? 'bricks' : kind === 'steel' ? 'steels' : kind === 'river' ? 'rivers' : kind];
    var c1 = Math.max(0, Math.floor(r.x / size)), c2 = Math.min(N - 1, Math.floor((r.x + r.width) / size));
    var r1 = Math.max(0, Math.floor(r.y / size)), r2 = Math.min(N - 1, Math.floor((r.y + r.height) / size));
    var hits = [];
    for (var rr = r1; rr <= r2; rr++) for (var cc = c1; cc <= c2; cc++) {
      var t = rr * N + cc;
      if (!grid[t]) continue;
      var sub = { x: cc * size, y: rr * size, width: size, height: size };
      if (collide(sub, r, th)) hits.push(t);
    }
    return hits;
  }

  function canMove(g, tank) {
    var r = rectTank(tank);
    if (!inField(r)) return false;
    if (g.map.eagle && !g.map.eagle.broken && collide(r, { x: g.map.eagle.x, y: g.map.eagle.y, width: B, height: B }, -0.01)) return false;
    if (hitMap(g, 'brick', r, -0.01).length) return false;
    if (hitMap(g, 'steel', r, -0.01).length) return false;
    if (hitMap(g, 'river', r, -0.01).length) return false;
    for (var i = 0; i < g.tanks.length; i++) {
      var o = g.tanks[i];
      /* tryMove tests a COPY of the mover, so identity never matches: compare
         by id or every tank blocks itself and the whole board freezes. */
      if (o === tank || o.id === tank.id || !o.alive) continue;
      if (collide(r, rectTank(o), -0.5)) return false;
    }
    return true;
  }

  function snapTurn(tank, dir) {
    var n = Object.assign({}, tank, { direction: dir });
    if ((tank.direction === 'left' || tank.direction === 'right') !== (dir === 'left' || dir === 'right')) {
      if (dir === 'up' || dir === 'down') n.x = round8(tank.x);
      else n.y = round8(tank.y);
    }
    return n;
  }

  function tryMove(g, tank, dist) {
    var d = DIRS[tank.direction];
    var n = Object.assign({}, tank, { x: tank.x + d.x * dist, y: tank.y + d.y * dist, moving: true });
    if (canMove(g, n)) { Object.assign(tank, n); return true; }
    tank.moving = false;
    return false;
  }

  function mkPlayer(slot, extra) {
    var sp = SPAWN_P[slot];
    return Object.assign({
      id: 'p' + slot, slot: slot, side: 'player', level: 'basic', hp: 1,
      x: sp.x, y: sp.y, direction: 'up', alive: true, visible: true,
      color: slot === 0 ? 'yellow' : 'green',
      cooldown: 0, helmet: 135 * (1000 / 60), frozen: 0, moving: false,
      lives: 3, score: 0, spawn: 0
    }, extra || {});
  }
  function mkBot(g, level, pos) {
    return {
      id: nextId('b', g), side: 'bot', level: level, hp: level === 'armor' ? 4 : 1,
      x: pos.x, y: pos.y, direction: 'down', alive: true, visible: true,
      color: 'silver', cooldown: 0, helmet: 0, frozen: 0, moving: false,
      withPower: false, aiDirT: 0, aiFireT: 200
    };
  }

  function loadStage(g, idx, keepScore) {
    var stages = root.BC_STAGES || [];
    if (idx < 0) idx = 0;
    if (idx >= stages.length) { g.phase = 'win'; return; }
    var parsed = parseStage(stages[idx]);
    g.stageIndex = idx;
    g.map = {
      bricks: parsed.bricks.slice(), steels: parsed.steels.slice(),
      rivers: parsed.rivers, snows: parsed.snows, forests: parsed.forests,
      eagle: { x: parsed.eagle.x, y: parsed.eagle.y, broken: false }
    };
    g.remain = parsed.remain.slice();
    g.difficulty = parsed.difficulty;
    g.bullets = [];
    g.fx = [];
    g.pup = null;
    g.frozenBots = 0;
    g.shovelT = 0;
    g.spawned = 0;
    g.spawnWait = 0;
    g.curtain = 1;
    g.phase = 'stage';
    g.stageT = 0;
    g.sfx = (g.sfx || []).concat(['stage_start']);
    g.paused = false;
    var scores = keepScore ? g.players.map(function (p) { return { lives: p.lives, score: p.score, level: p.level }; }) : null;
    g.tanks = [];
    var nP = g.twoPlayer ? 2 : 1;
    for (var s = 0; s < nP; s++) {
      var extra = scores && scores[s] ? { lives: scores[s].lives, score: scores[s].score, level: scores[s].level } : {};
      if (extra.lives == null || extra.lives < 1) extra.lives = keepScore ? (scores[s] && scores[s].lives) || 0 : 3;
      if (extra.lives > 0) {
        extra.lives -= 1;
        g.tanks.push(mkPlayer(s, extra));
      } else {
        g.tanks.push(mkPlayer(s, Object.assign({ alive: false, visible: false }, extra)));
      }
    }
    g.players = g.tanks.filter(function (t) { return t.side === 'player'; });
  }

  function playerOf(g, slot) {
    for (var i = 0; i < g.tanks.length; i++) if (g.tanks[i].side === 'player' && g.tanks[i].slot === slot) return g.tanks[i];
    return null;
  }

  function fireFrom(g, tank) {
    if (!tank.alive || tank.cooldown > 0) return false;
    var n = 0;
    for (var i = 0; i < g.bullets.length; i++) if (g.bullets[i].owner === tank.id) n++;
    if (n >= bulletLimit(tank)) return false;
    if (tank.side === 'bot' && g.frozenBots > 0) return false;
    var d = DIRS[tank.direction], start;
    if (tank.direction === 'up') start = { x: tank.x + 6, y: tank.y };
    else if (tank.direction === 'down') start = { x: tank.x + 6, y: tank.y + 13 };
    else if (tank.direction === 'left') start = { x: tank.x, y: tank.y + 6 };
    else start = { x: tank.x + 13, y: tank.y + 6 };
    g.bullets.push({
      id: nextId('u', g), owner: tank.id, side: tank.side, slot: tank.slot,
      x: start.x, y: start.y, direction: tank.direction,
      speed: bulletSpeed(tank), power: bulletPower(tank)
    });
    tank.cooldown = bulletInterval(tank);
    if (tank.side === 'player') g.sfx.push('bullet_shot');
    return true;
  }

  function explode(g, x, y, big) {
    g.fx.push({ x: x, y: y, t: 0, big: !!big, kind: 'boom' });
    g.sfx.push(big ? 'explosion_2' : 'explosion_1');
  }

  function killTank(g, tank, byPlayer) {
    tank.alive = false;
    tank.visible = false;
    explode(g, tank.x, tank.y, tank.side === 'player' || tank.level === 'armor');
    if (tank.side === 'bot') {
      if (byPlayer != null) {
        var p = playerOf(g, byPlayer);
        if (p) {
          p.score += SCORES[tank.level] || 100;
          if (Math.floor(p.score / 10000) > Math.floor((p.score - (SCORES[tank.level] || 100)) / 10000)) p.lives += 1;
        }
      }
      if (tank.withPower) spawnPup(g);
    } else {
      tank.level = 'basic';
      tank.hp = 1;
      tank.helmet = 0;
      g.sfx.push('explosion_2');
    }
  }

  function spawnPup(g) {
    var kind = PUPS[(Math.random() * PUPS.length) | 0];
    var x = ((Math.random() * 12) | 0) * B, y = ((Math.random() * 12) | 0) * B;
    g.pup = { x: x, y: y, kind: kind, blink: 0 };
    g.sfx.push('powerup_appear');
  }

  function applyPup(g, p, kind) {
    g.sfx.push('powerup_pick');
    p.score += 500;
    if (kind === 'tank') p.lives += 1;
    else if (kind === 'star') {
      var i = LEVELS.indexOf(p.level);
      if (i < 3) p.level = LEVELS[i + 1];
      else p.score += 5000;
    } else if (kind === 'grenade') {
      g.tanks.filter(function (t) { return t.side === 'bot' && t.alive; }).forEach(function (t) { killTank(g, t, p.slot); });
    } else if (kind === 'timer') g.frozenBots = 5000;
    else if (kind === 'helmet') p.helmet = 630 * (1000 / 60);
    else if (kind === 'shovel') { steelEagle(g, true); g.shovelT = 1076 * (1000 / 60); }
    g.pup = null;
  }

  function steelEagle(g, on) {
    var ex = g.map.eagle.x, ey = g.map.eagle.y;
    for (var dy = -8; dy < 24; dy += 8) for (var dx = -8; dx < 24; dx += 8) {
      var x = ex + dx, y = ey + dy;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
      if (x >= ex && x < ex + B && y >= ey && y < ey + B) continue;
      var sr = Math.floor(y / 8), sc = Math.floor(x / 8);
      var br = Math.floor(y / 4), bc = Math.floor(x / 4);
      if (on) {
        g.map.steels[sr * N_STEEL + sc] = true;
        for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) g.map.bricks[(br + i) * N_BRICK + (bc + j)] = false;
      } else {
        g.map.steels[sr * N_STEEL + sc] = false;
        for (var i2 = 0; i2 < 2; i2++) for (var j2 = 0; j2 < 2; j2++) g.map.bricks[(br + i2) * N_BRICK + (bc + j2)] = true;
      }
    }
  }

  function spreadRect(b) {
    var r = rectBlt(b), v = 4.01;
    if (b.direction === 'up' || b.direction === 'down') { r.x -= v; r.width += 2 * v; }
    else { r.y -= v; r.height += 2 * v; }
    return r;
  }

  function destroyAround(g, b, kind) {
    var hits = hitMap(g, kind, spreadRect(b), 0);
    var grid = kind === 'brick' ? g.map.bricks : g.map.steels;
    if (kind === 'steel' && b.power < STEEL_POWER) return hits.length > 0;
    for (var i = 0; i < hits.length; i++) grid[hits[i]] = false;
    return hits.length > 0;
  }

  function aligned(tank, tx, ty) {
    var cx = tank.x + 8, cy = tank.y + 8;
    if (tank.direction === 'up' && Math.abs(cx - tx) < 10 && cy > ty) return true;
    if (tank.direction === 'down' && Math.abs(cx - tx) < 10 && cy < ty) return true;
    if (tank.direction === 'left' && Math.abs(cy - ty) < 10 && cx > tx) return true;
    if (tank.direction === 'right' && Math.abs(cy - ty) < 10 && cx < tx) return true;
    return false;
  }

  function stepAI(g, tank, dt) {
    if (g.frozenBots > 0) { tank.moving = false; return; }
    tank.aiDirT -= dt;
    tank.aiFireT -= dt;
    if (tank.aiDirT <= 0 || !tank.moving) {
      var roll = Math.random(), dir = DIRL[(Math.random() * 4) | 0];
      var eagle = g.map.eagle;
      var players = g.tanks.filter(function (t) { return t.side === 'player' && t.alive; });
      var target = players[0];
      if (roll < 0.4 && eagle) {
        if (Math.abs(tank.x - eagle.x) > Math.abs(tank.y - eagle.y)) dir = tank.x > eagle.x ? 'left' : 'right';
        else dir = tank.y > eagle.y ? 'up' : 'down';
      } else if (roll < 0.65 && target) {
        if (Math.abs(tank.x - target.x) > Math.abs(tank.y - target.y)) dir = tank.x > target.x ? 'left' : 'right';
        else dir = tank.y > target.y ? 'up' : 'down';
      }
      Object.assign(tank, snapTurn(tank, dir));
      tank.aiDirT = 400 + Math.random() * 900;
    }
    tryMove(g, tank, moveSpeed(tank) * dt);
    var wantFire = tank.aiFireT <= 0;
    if (!wantFire) {
      var eagle2 = g.map.eagle;
      if (eagle2 && aligned(tank, eagle2.x + 8, eagle2.y + 8)) wantFire = true;
      g.tanks.forEach(function (p) {
        if (p.side === 'player' && p.alive && aligned(tank, p.x + 8, p.y + 8)) wantFire = true;
      });
    }
    if (wantFire) { fireFrom(g, tank); tank.aiFireT = 280 + Math.random() * 420; }
  }

  function spawnBot(g) {
    if (!g.remain.length) return;
    var cap = g.twoPlayer ? 4 : 2;
    var live = 0;
    for (var i = 0; i < g.tanks.length; i++) if (g.tanks[i].side === 'bot' && g.tanks[i].alive) live++;
    if (live >= cap) return;
    var free = [];
    outer: for (var s = 0; s < SPAWN_B.length; s++) {
      var pos = SPAWN_B[s], r = { x: pos.x, y: pos.y, width: TANK, height: TANK };
      for (var j = 0; j < g.tanks.length; j++) if (g.tanks[j].alive && collide(r, rectTank(g.tanks[j]), 0)) continue outer;
      free.push(pos);
    }
    if (!free.length) return;
    var pos2 = free[(Math.random() * free.length) | 0];
    var lv = g.remain.shift();
    var bot = mkBot(g, lv, pos2);
    bot.withPower = POWER_IDX.indexOf(g.spawned) >= 0;
    if (bot.withPower) bot.color = 'red';
    g.spawned++;
    g.tanks.push(bot);
  }

  function maybeRespawn(g, dt) {
    for (var s = 0; s < (g.twoPlayer ? 2 : 1); s++) {
      var p = playerOf(g, s);
      if (!p || p.alive || p.lives <= 0) continue;
      p.spawn = (p.spawn || 0) + dt;
      if (p.spawn < 1500) continue;
      var sp = SPAWN_P[s];
      var blocked = false;
      var r = { x: sp.x, y: sp.y, width: TANK, height: TANK };
      for (var i = 0; i < g.tanks.length; i++) if (g.tanks[i].alive && collide(r, rectTank(g.tanks[i]), 0)) blocked = true;
      if (blocked) continue;
      p.x = sp.x; p.y = sp.y; p.direction = 'up'; p.alive = true; p.visible = true;
      p.hp = 1; p.helmet = 135 * (1000 / 60); p.cooldown = 0; p.frozen = 0; p.spawn = 0;
      p.lives -= 1;
    }
  }

  function tickPlay(g, dt, inputs) {
    if (g.paused) return;
    g.sfx = [];
    if (g.frozenBots > 0) g.frozenBots = Math.max(0, g.frozenBots - dt);
    if (g.shovelT > 0) {
      g.shovelT -= dt;
      if (g.shovelT <= 0) steelEagle(g, false);
    }
    g.spawnWait -= dt;
    if (g.spawnWait <= 0) { spawnBot(g); g.spawnWait = 1800 / (g.difficulty || 1); }

    for (var s = 0; s < 2; s++) {
      var p = playerOf(g, s);
      var inp = inputs[s];
      if (!p || !p.alive || !inp) continue;
      if (p.frozen > 0) { p.frozen -= dt; p.moving = false; }
      else if (inp.dir) {
        if (inp.dir !== p.direction) Object.assign(p, snapTurn(p, inp.dir));
        else tryMove(g, p, moveSpeed(p) * dt);
      } else p.moving = false;
      if (inp.fire) fireFrom(g, p);
      if (inp.fireN && inp.fireN !== p.lastFireN) { p.lastFireN = inp.fireN; fireFrom(g, p); }
      if (inp.pose && typeof inp.pose.x === 'number' && s !== 0) {
        /* guest pose is a hint — host still sim'd from keys; snap if far */
        if (Math.abs(p.x - inp.pose.x) + Math.abs(p.y - inp.pose.y) > 24) {
          p.x = inp.pose.x; p.y = inp.pose.y; p.direction = inp.pose.dir || p.direction;
        }
      }
    }

    for (var i = 0; i < g.tanks.length; i++) {
      var t = g.tanks[i];
      if (!t.alive) continue;
      if (t.cooldown > 0) t.cooldown -= dt;
      if (t.helmet > 0) t.helmet -= dt;
      if (t.side === 'bot') stepAI(g, t, dt);
      if (g.pup && t.side === 'player' && collide(rectTank(t), { x: g.pup.x, y: g.pup.y, width: 16, height: 16 }, -2)) {
        applyPup(g, t, g.pup.kind);
      }
    }

    var nxt = [];
    for (var b = 0; b < g.bullets.length; b++) {
      var bl = g.bullets[b];
      var d = DIRS[bl.direction];
      bl.x += d.x * bl.speed * dt;
      bl.y += d.y * bl.speed * dt;
      var rr = rectBlt(bl);
      var dead = false, boom = false;
      if (bl.x < -2 || bl.y < -2 || bl.x > SIZE || bl.y > SIZE) { dead = true; boom = true; }
      if (!dead && destroyAround(g, bl, 'brick')) { dead = true; boom = true; g.sfx.push('bullet_hit_1'); }
      if (!dead && hitMap(g, 'steel', spreadRect(bl), 0).length) {
        if (bl.power >= STEEL_POWER) destroyAround(g, bl, 'steel');
        dead = true; boom = true; g.sfx.push('bullet_hit_2');
      }
      if (!dead && g.map.eagle && !g.map.eagle.broken && collide(spreadRect(bl), { x: g.map.eagle.x, y: g.map.eagle.y, width: B, height: B }, 0)) {
        g.map.eagle.broken = true;
        explode(g, g.map.eagle.x, g.map.eagle.y, true);
        dead = true;
        g.phase = 'over';
        g.overT = 0;
        g.sfx.push('game_over');
      }
      if (!dead) {
        for (var k = 0; k < g.tanks.length; k++) {
          var tk = g.tanks[k];
          if (!tk.alive || tk.id === bl.owner) continue;
          if (bl.side === 'bot' && tk.side === 'bot') continue;
          if (!collide(rr, rectTank(tk), -0.02)) continue;
          if (tk.side === 'player' && bl.side === 'player') { tk.frozen = 1000; dead = true; boom = true; break; }
          if (tk.helmet > 0) { dead = true; boom = false; g.sfx.push('bullet_hit_2'); break; }
          dead = true; boom = true;
          if (tk.side === 'bot') {
            tk.hp -= 1;
            if (tk.hp <= 0) killTank(g, tk, bl.slot);
            else g.sfx.push('bullet_hit_2');
          } else killTank(g, tk, null);
          break;
        }
      }
      if (!dead) {
        for (var o = b + 1; o < g.bullets.length; o++) {
          if (collide(rr, rectBlt(g.bullets[o]), 0)) { dead = true; g.bullets[o]._dead = true; boom = true; }
        }
      }
      if (bl._dead) dead = true;
      if (dead) { if (boom) g.fx.push({ x: bl.x - 4, y: bl.y - 4, t: 0, big: false, kind: 'spark' }); }
      else nxt.push(bl);
    }
    g.bullets = nxt;

    for (var f = g.fx.length - 1; f >= 0; f--) { g.fx[f].t += dt; if (g.fx[f].t > 450) g.fx.splice(f, 1); }
    if (g.pup) g.pup.blink += dt;

    maybeRespawn(g, dt);

    var botsLive = 0, botsAny = false;
    for (var z = 0; z < g.tanks.length; z++) {
      if (g.tanks[z].side === 'bot') { botsAny = true; if (g.tanks[z].alive) botsLive++; }
    }
    if (!g.remain.length && botsLive === 0 && botsAny) {
      g.clearT = (g.clearT || 0) + dt;
      if (g.clearT > 2200) { g.clearT = 0; loadStage(g, g.stageIndex + 1, true); }
    }
    var pLive = false;
    for (var s2 = 0; s2 < (g.twoPlayer ? 2 : 1); s2++) {
      var pl = playerOf(g, s2);
      if (pl && (pl.alive || pl.lives > 0)) pLive = true;
    }
    if (!pLive && g.phase === 'play') { g.phase = 'over'; g.overT = 0; g.sfx.push('game_over'); }
  }

  function snapshot(g) {
    function packTank(t) {
      return [t.id, t.side === 'player' ? 1 : 0, t.slot || 0, Math.round(t.x), Math.round(t.y),
        DIRL.indexOf(t.direction), LEVELS.indexOf(t.level), t.hp, t.alive ? 1 : 0,
        t.helmet > 0 ? 1 : 0, t.withPower ? 1 : 0, t.color, t.lives || 0, t.score || 0, t.moving ? 1 : 0];
    }
    return {
      ph: g.phase, st: g.stageIndex, two: g.twoPlayer ? 1 : 0, paused: g.paused ? 1 : 0,
      eagle: g.map.eagle.broken ? 0 : 1, ex: g.map.eagle.x, ey: g.map.eagle.y,
      br: b64bits(g.map.bricks), se: b64bits(g.map.steels),
      ri: b64bits(g.map.rivers), sn: b64bits(g.map.snows), fo: b64bits(g.map.forests),
      tk: g.tanks.map(packTank),
      bl: g.bullets.map(function (b) { return [Math.round(b.x), Math.round(b.y), DIRL.indexOf(b.direction), b.side === 'player' ? 1 : 0]; }),
      fx: g.fx.map(function (f) { return [Math.round(f.x), Math.round(f.y), f.t | 0, f.big ? 1 : 0]; }),
      pup: g.pup ? [g.pup.x, g.pup.y, g.pup.kind, g.pup.blink | 0] : null,
      remain: g.remain.length, curtain: g.curtain, stageT: g.stageT | 0, overT: g.overT | 0,
      time: g.time | 0, hi: g.hi || 0
    };
  }

  function applySnap(g, s) {
    if (!s) return;
    g.phase = s.ph; g.stageIndex = s.st; g.twoPlayer = !!s.two; g.paused = !!s.paused;
    g.map = g.map || {};
    g.map.bricks = bitsb64(s.br, N_BRICK * N_BRICK);
    g.map.steels = bitsb64(s.se, N_STEEL * N_STEEL);
    g.map.rivers = bitsb64(s.ri, N_TILE * N_TILE);
    g.map.snows = bitsb64(s.sn, N_TILE * N_TILE);
    g.map.forests = bitsb64(s.fo, N_TILE * N_TILE);
    g.map.eagle = { x: s.ex, y: s.ey, broken: !s.eagle };
    g.tanks = (s.tk || []).map(function (a) {
      return {
        id: a[0], side: a[1] ? 'player' : 'bot', slot: a[2], x: a[3], y: a[4],
        direction: DIRL[a[5]] || 'up', level: LEVELS[a[6]] || 'basic', hp: a[7],
        alive: !!a[8], helmet: a[9] ? 1 : 0, withPower: !!a[10], color: a[11] || 'silver',
        lives: a[12], score: a[13], moving: !!a[14], visible: !!a[8], cooldown: 0, frozen: 0
      };
    });
    g.players = g.tanks.filter(function (t) { return t.side === 'player'; });
    g.bullets = (s.bl || []).map(function (a, i) {
      return { id: 'r' + i, x: a[0], y: a[1], direction: DIRL[a[2]] || 'up', side: a[3] ? 'player' : 'bot' };
    });
    g.fx = (s.fx || []).map(function (a) { return { x: a[0], y: a[1], t: a[2], big: !!a[3], kind: 'boom' }; });
    g.pup = s.pup ? { x: s.pup[0], y: s.pup[1], kind: s.pup[2], blink: s.pup[3] } : null;
    g.remainN = s.remain; g.curtain = s.curtain; g.stageT = s.stageT; g.overT = s.overT;
    g.time = s.time; g.hi = s.hi || 0;
    if (!g.remain) g.remain = new Array(s.remain || 0);
  }

  /* ---------- draw ---------- */
  var GLYPH = {
    'A': [0x0e,0x11,0x11,0x1f,0x11,0x11,0x11], 'B': [0x1e,0x11,0x11,0x1e,0x11,0x11,0x1e],
    'C': [0x0e,0x11,0x10,0x10,0x10,0x11,0x0e], 'D': [0x1e,0x11,0x11,0x11,0x11,0x11,0x1e],
    'E': [0x1f,0x10,0x10,0x1e,0x10,0x10,0x1f], 'F': [0x1f,0x10,0x10,0x1e,0x10,0x10,0x10],
    'G': [0x0e,0x11,0x10,0x13,0x11,0x11,0x0e], 'H': [0x11,0x11,0x11,0x1f,0x11,0x11,0x11],
    'I': [0x0e,0x04,0x04,0x04,0x04,0x04,0x0e], 'J': [0x01,0x01,0x01,0x01,0x11,0x11,0x0e],
    'K': [0x11,0x12,0x14,0x18,0x14,0x12,0x11], 'L': [0x10,0x10,0x10,0x10,0x10,0x10,0x1f],
    'M': [0x11,0x1b,0x15,0x15,0x11,0x11,0x11], 'N': [0x11,0x19,0x15,0x13,0x11,0x11,0x11],
    'O': [0x0e,0x11,0x11,0x11,0x11,0x11,0x0e], 'P': [0x1e,0x11,0x11,0x1e,0x10,0x10,0x10],
    'R': [0x1e,0x11,0x11,0x1e,0x14,0x12,0x11], 'S': [0x0e,0x11,0x10,0x0e,0x01,0x11,0x0e],
    'T': [0x1f,0x04,0x04,0x04,0x04,0x04,0x04], 'U': [0x11,0x11,0x11,0x11,0x11,0x11,0x0e],
    'V': [0x11,0x11,0x11,0x11,0x11,0x0a,0x04], 'W': [0x11,0x11,0x11,0x15,0x15,0x1b,0x11],
    'Y': [0x11,0x11,0x0a,0x04,0x04,0x04,0x04], 'Z': [0x1f,0x01,0x02,0x04,0x08,0x10,0x1f],
    '0': [0x0e,0x11,0x13,0x15,0x19,0x11,0x0e], '1': [0x04,0x0c,0x04,0x04,0x04,0x04,0x0e],
    '2': [0x0e,0x11,0x01,0x06,0x08,0x10,0x1f], '3': [0x0e,0x11,0x01,0x06,0x01,0x11,0x0e],
    '4': [0x02,0x06,0x0a,0x12,0x1f,0x02,0x02], '5': [0x1f,0x10,0x1e,0x01,0x01,0x11,0x0e],
    '6': [0x06,0x08,0x10,0x1e,0x11,0x11,0x0e], '7': [0x1f,0x01,0x02,0x04,0x08,0x08,0x08],
    '8': [0x0e,0x11,0x11,0x0e,0x11,0x11,0x0e], '9': [0x0e,0x11,0x11,0x0f,0x01,0x02,0x0c],
    '-': [0x00,0x00,0x00,0x1f,0x00,0x00,0x00], '.': [0x00,0x00,0x00,0x00,0x00,0x06,0x06],
    ':': [0x00,0x06,0x06,0x00,0x06,0x06,0x00], ' ': [0,0,0,0,0,0,0],
    '!': [0x04,0x04,0x04,0x04,0x04,0x00,0x04],
    'Q': [0x0e,0x11,0x11,0x11,0x15,0x12,0x0d], 'X': [0x11,0x11,0x0a,0x04,0x0a,0x11,0x11],
    '(': [0x02,0x04,0x08,0x08,0x08,0x04,0x02], ')': [0x08,0x04,0x02,0x02,0x02,0x04,0x08],
    ',': [0x00,0x00,0x00,0x00,0x06,0x06,0x08], '/': [0x01,0x02,0x02,0x04,0x08,0x08,0x10]
  };
  function drawText(ctx, x, y, str, scale, color) {
    scale = scale || 1;
    ctx.fillStyle = color || '#fff';
    str = String(str).toUpperCase();
    for (var i = 0; i < str.length; i++) {
      var g = GLYPH[str.charAt(i)] || GLYPH[' '];
      for (var r = 0; r < 7; r++) for (var c = 0; c < 5; c++) if (g[r] & (1 << (4 - c)))
        ctx.fillRect(x + (c + i * 6) * scale, y + r * scale, scale, scale);
    }
  }

  function drawBrick(ctx, x, y, odd) {
    ctx.fillStyle = '#636363'; ctx.fillRect(x, y, 4, 4);
    ctx.fillStyle = '#6B0800'; ctx.fillRect(x + (odd ? 0 : 1), y, odd ? 4 : 3, 3);
    ctx.fillStyle = '#9C4A00'; ctx.fillRect(x + (odd ? 0 : 2), y + 1, odd ? 4 : 2, 2);
  }
  function drawSteel(ctx, x, y) {
    ctx.fillStyle = '#ADADAD'; ctx.fillRect(x, y, 8, 8);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x + 2, y + 2, 4, 4);
    ctx.fillStyle = '#636363'; ctx.fillRect(x + 6, y + 1, 2, 6); ctx.fillRect(x + 1, y + 6, 6, 2);
  }
  function drawRiver(ctx, x, y, t) {
    var sh = ((t / 240) | 0) % 2;
    ctx.fillStyle = '#4242FF'; ctx.fillRect(x, y, 16, 16);
    ctx.fillStyle = '#B5EFEF';
    var pts = sh ? [[7,0],[1,1],[2,2],[3,3],[6,3],[7,4],[3,5],[2,6],[4,6],[0,7]] : [[5,0],[0,2],[1,3],[4,3],[3,4],[5,4],[1,6],[2,7],[6,7]];
    for (var q = 0; q < 4; q++) {
      var ox = (q % 2) * 8, oy = (q < 2 ? 0 : 8);
      for (var i = 0; i < pts.length; i++) ctx.fillRect(x + ox + pts[i][0], y + oy + pts[i][1], 1, 1);
    }
  }
  function drawSnow(ctx, x, y) {
    ctx.fillStyle = '#ADADAD'; ctx.fillRect(x, y, 16, 16);
    ctx.fillStyle = '#fff';
    for (var i = 0; i < 8; i++) ctx.fillRect(x + i, y + 7 - i, 1, 1);
    ctx.fillRect(x + 8, y, 1, 1); ctx.fillRect(x + 3, y, 1, 1);
  }
  function drawForest(ctx, x, y) {
    for (var q = 0; q < 4; q++) {
      var ox = (q % 2) * 8, oy = (q < 2 ? 0 : 8);
      for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
        var ch = FOREST[r].charAt(c), col = FOREST_COL[ch];
        if (col) { ctx.fillStyle = col; ctx.fillRect(x + ox + c, y + oy + r, 1, 1); }
      }
    }
  }
  function drawEagle(ctx, x, y, broken) {
    if (broken) {
      ctx.fillStyle = '#9C4A00'; ctx.fillRect(x + 2, y + 6, 4, 8);
      ctx.fillStyle = '#636363'; ctx.fillRect(x + 6, y + 4, 8, 8);
      return;
    }
    ctx.fillStyle = '#636363';
    ctx.fillRect(x + 6, y + 2, 4, 2); ctx.fillRect(x + 4, y + 4, 8, 3);
    ctx.fillRect(x + 2, y + 7, 12, 4); ctx.fillRect(x + 5, y + 11, 6, 4);
    ctx.fillRect(x + 1, y + 8, 2, 3); ctx.fillRect(x + 13, y + 8, 2, 3);
    ctx.fillStyle = '#6B0800';
    [[8,3],[3,6],[4,7],[6,8],[9,8],[11,7],[12,6]].forEach(function (p) { ctx.fillRect(x + p[0], y + p[1], 1, 1); });
  }
  function drawTank(ctx, tank, time) {
    if (!tank.alive || !tank.visible) return;
    var col = tank.color;
    if (tank.withPower && ((time / 80 | 0) % 2)) col = 'red';
    if (tank.level === 'armor' && tank.hp === 2) col = ((time / 50 | 0) % 2) ? 'green' : 'yellow';
    if (tank.level === 'armor' && tank.hp === 3) col = ((time / 50 | 0) % 2) ? 'silver' : 'yellow';
    if (tank.level === 'armor' && tank.hp === 4) col = ((time / 50 | 0) % 2) ? 'silver' : 'green';
    var sch = COL[col] || COL.silver;
    ctx.save();
    ctx.translate(tank.x + 8, tank.y + 8);
    var rot = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[tank.direction] || 0;
    ctx.rotate(rot);
    ctx.translate(-8, -8);
    var sh = tank.moving ? ((time / 80 | 0) % 2) : 0;
    ctx.fillStyle = sch.a; ctx.fillRect(1, 4 + sh, 3, 11);
    ctx.fillStyle = sch.b; ctx.fillRect(2, 4 + sh, 1, 11);
    ctx.fillStyle = sch.c; ctx.fillRect(12, 4, 3, 11);
    ctx.fillStyle = sch.b; ctx.fillRect(12, 4 + sh, 2, 11);
    ctx.fillStyle = sch.a; ctx.fillRect(4, 5, 8, 9);
    ctx.fillStyle = sch.b; ctx.fillRect(5, 6, 6, 7);
    ctx.fillStyle = sch.c; ctx.fillRect(6, 7, 4, 5);
    ctx.fillStyle = sch.a;
    var gunH = tank.level === 'fast' || tank.level === 'power' ? 6 : 4;
    ctx.fillRect(7, 2, tank.level === 'power' || tank.level === 'armor' ? 2 : 1, gunH);
    if (tank.helmet > 0) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, 16, 16);
    }
    ctx.restore();
  }
  /* Sparks and blasts are drawn as filled pixel bursts, not as an expanding
     stroked circle: at 4 + t/30 that ring grew past a whole tile and read as a
     rendering fault rather than an explosion. */
  var BOOM_STEPS = [
    { r: 3, c: ['#FFFFFF'] },
    { r: 6, c: ['#E79C21', '#FFFFFF'] },
    { r: 9, c: ['#B53121', '#E79C21', '#FFFFFF'] },
    { r: 7, c: ['#B53121', '#E79C21'] },
    { r: 4, c: ['#6B0800', '#B53121'] }
  ];
  function drawBoom(ctx, f) {
    var life = f.big ? 450 : 180;
    var span = f.big ? BOOM_STEPS.length : 3;
    var k = Math.floor((f.t / life) * span);
    if (k < 0 || k >= span) return;
    var step = BOOM_STEPS[f.big ? k : k + 1];
    var cx = f.x + 8, cy = f.y + 8, scale = f.big ? 1 : 0.6;
    for (var i = step.c.length - 1; i >= 0; i--) {
      var rad = Math.max(1, Math.round(step.r * scale * (i + 1) / step.c.length));
      ctx.fillStyle = step.c[i];
      ctx.fillRect(cx - rad, cy - rad + 1, rad * 2, rad * 2 - 2);
      ctx.fillRect(cx - rad + 1, cy - rad, rad * 2 - 2, rad * 2);
    }
  }

  function drawPup(ctx, pup) {
    if (!pup) return;
    if (((pup.blink / 120) | 0) % 2) return;
    var bmp = PUP_BMP[pup.kind]; if (!bmp) return;
    for (var r = 0; r < bmp.length; r++) for (var c = 0; c < bmp[r].length; c++) {
      var col = PUP_COL[bmp[r].charAt(c)];
      if (col) { ctx.fillStyle = col; ctx.fillRect(pup.x + c, pup.y + r, 1, 1); }
    }
  }

  function drawField(ctx, g) {
    ctx.fillStyle = '#757575'; ctx.fillRect(0, 0, 256, 240);
    ctx.save();
    ctx.translate(B, B);
    ctx.beginPath(); ctx.rect(0, 0, SIZE, SIZE); ctx.clip();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SIZE, SIZE);
    var t = g.time || 0;
    for (var i = 0; i < N_TILE * N_TILE; i++) {
      var c = i % N_TILE, r = (i / N_TILE) | 0, x = c * B, y = r * B;
      if (g.map.rivers[i]) drawRiver(ctx, x, y, t);
      if (g.map.snows[i]) drawSnow(ctx, x, y);
    }
    for (i = 0; i < N_STEEL * N_STEEL; i++) if (g.map.steels[i]) drawSteel(ctx, (i % N_STEEL) * 8, ((i / N_STEEL) | 0) * 8);
    for (i = 0; i < N_BRICK * N_BRICK; i++) if (g.map.bricks[i]) {
      var bc = i % N_BRICK, br = (i / N_BRICK) | 0;
      drawBrick(ctx, bc * 4, br * 4, (bc + br) % 2 === 0);
    }
    if (g.map.eagle) drawEagle(ctx, g.map.eagle.x, g.map.eagle.y, g.map.eagle.broken);
    for (i = 0; i < g.bullets.length; i++) {
      ctx.fillStyle = '#fff'; ctx.fillRect(g.bullets[i].x, g.bullets[i].y, BULLET, BULLET);
    }
    for (i = 0; i < g.tanks.length; i++) drawTank(ctx, g.tanks[i], t);
    for (i = 0; i < N_TILE * N_TILE; i++) if (g.map.forests[i]) drawForest(ctx, (i % N_TILE) * B, ((i / N_TILE) | 0) * B);
    drawPup(ctx, g.pup);
    for (i = 0; i < g.fx.length; i++) drawBoom(ctx, g.fx[i]);
    ctx.restore();

    /* HUD */
    var remain = (g.remain && g.remain.length) || g.remainN || 0;
    var hx = SIZE + 1.5 * B, hy = 1.5 * B;
    ctx.fillStyle = '#000';
    for (i = 0; i < remain; i++) {
      var bx = hx + 8 * (i % 2), by = hy + 8 * ((i / 2) | 0);
      ctx.fillRect(bx + 1, by + 1, 1, 6); ctx.fillRect(bx + 6, by + 1, 1, 6);
      ctx.fillRect(bx + 2, by + 3, 5, 2); ctx.fillRect(bx + 3, by + 2, 3, 4);
    }
    var p1 = playerOf(g, 0) || { lives: 0 };
    var p2 = playerOf(g, 1);
    drawText(ctx, hx, hy + 6 * B, '1P', 1, '#000');
    drawText(ctx, hx + 8, hy + 6 * B + 10, String(p1.lives), 1, '#000');
    if (g.twoPlayer) {
      drawText(ctx, hx, hy + 8 * B, '2P', 1, '#000');
      drawText(ctx, hx + 8, hy + 8 * B + 10, String(p2 ? p2.lives : 0), 1, '#000');
    }
    drawText(ctx, hx, 13 * B, 'ST', 1, '#000');
    drawText(ctx, hx, 13 * B + 10, String(g.stageIndex + 1), 1, '#000');
  }

  function drawTitle(ctx, g) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 240);
    var bricks = [[0,0],[1,0],[2,0],[0,1],[2,1],[0,2],[1,2],[2,2]]; /* unused */
    drawText(ctx, 28, 36, 'BATTLE', 4, '#E79C21');
    drawText(ctx, 52, 72, 'CITY', 4, '#E79C21');
    var items = g.menu;
    for (var i = 0; i < items.length; i++) {
      var y = 130 + i * 18;
      if (g.choice === i) {
        drawTank(ctx, { x: 48, y: y - 4, direction: 'right', alive: true, visible: true, color: 'yellow', level: 'basic', moving: true, helmet: 0 }, g.time);
      }
      drawText(ctx, 72, y, items[i].label, 1, '#fff');
    }
    drawText(ctx, 40, 214, 'HI-' + String(g.hi || 20000), 1, '#E7E794');
    if (g.roomNote) drawText(ctx, 16, 198, g.roomNote, 1, '#B5F7CE');
  }

  function drawStageCurtain(ctx, g) {
    ctx.fillStyle = '#757575'; ctx.fillRect(0, 0, 256, 240);
    ctx.fillStyle = '#000';
    var h = (g.curtain || 1) * 120;
    ctx.fillRect(0, 0, 256, h);
    ctx.fillRect(0, 240 - h, 256, h);
    if (g.curtain > 0.5) {
      drawText(ctx, 80, 112, 'STAGE ' + String(g.stageIndex + 1), 2, '#fff');
    }
    if (g.curtain < 0.2) drawField(ctx, g);
  }

  function drawOver(ctx, g) {
    drawField(ctx, g);
    drawText(ctx, 72, 100, 'GAME', 3, '#B53121');
    drawText(ctx, 72, 130, 'OVER', 3, '#B53121');
  }

  function render(ctx, g) {
    if (g.phase === 'title') drawTitle(ctx, g);
    else if (g.phase === 'stage') drawStageCurtain(ctx, g);
    else if (g.phase === 'over' || g.phase === 'win') { if (g.phase === 'win') { ctx.fillStyle='#000'; ctx.fillRect(0,0,256,240); drawText(ctx, 40, 110, 'YOU WIN', 3, '#E79C21'); } else drawOver(ctx, g); }
    else drawField(ctx, g);
    if (g.paused && g.phase === 'play') drawText(ctx, 88, 112, 'PAUSE', 2, '#fff');
  }

  function create(opts) {
    opts = opts || {};
    var g = {
      phase: 'title', choice: 0, menu: [], twoPlayer: false, stageIndex: 0,
      tanks: [], bullets: [], fx: [], pup: null, map: { bricks: emptyBool(N_BRICK*N_BRICK), steels: emptyBool(N_STEEL*N_STEEL), rivers: emptyBool(N_TILE*N_TILE), snows: emptyBool(N_TILE*N_TILE), forests: emptyBool(N_TILE*N_TILE), eagle: { x: 96, y: 192, broken: false } },
      remain: [], ids: {}, time: 0, hi: opts.hi || 20000, sfx: [], paused: false,
      curtain: 0, stageT: 0, overT: 0, roomNote: '', players: []
    };
    g.menu = [
      { id: '1p', label: '1 PLAYER' },
      { id: '2p', label: '2 PLAYERS' }
    ];
    return g;
  }

  function start(g, two, fromStage) {
    g.twoPlayer = !!two;
    g.sfx = [];
    loadStage(g, fromStage || 0, false);
  }

  function tick(g, dt, inputs) {
    g.time += dt;
    g.sfx = g.sfx || [];
    if (g.phase === 'title') return;
    if (g.phase === 'stage') {
      g.stageT += dt;
      if (g.stageT < 400) g.curtain = Math.min(1, g.stageT / 400);
      else if (g.stageT < 1400) g.curtain = 1;
      else if (g.stageT < 1800) g.curtain = 1 - (g.stageT - 1400) / 400;
      else {
        g.phase = 'play'; g.curtain = 0;
        var cap0 = g.twoPlayer ? 4 : 2;
        for (var si = 0; si < cap0; si++) spawnBot(g);
        g.spawnWait = 1800 / (g.difficulty || 1);
      }
      return;
    }
    if (g.phase === 'over' || g.phase === 'win') { g.overT = (g.overT || 0) + dt; return; }
    tickPlay(g, dt, inputs || []);
    var p1 = playerOf(g, 0);
    if (p1 && p1.score > (g.hi || 0)) g.hi = p1.score;
  }

  function poseOf(g, slot) {
    var p = playerOf(g, slot);
    if (!p) return { x: SPAWN_P[slot].x, y: SPAWN_P[slot].y, dir: 'up' };
    return { x: p.x, y: p.y, dir: p.direction, lives: p.lives, score: p.score, alive: p.alive };
  }

  root.BattleCity = {
    create: create, start: start, tick: tick, render: render,
    snapshot: snapshot, applySnap: applySnap, poseOf: poseOf,
    playerOf: playerOf, parseStage: parseStage,
    B: B, SIZE: SIZE, stages: function () { return root.BC_STAGES || []; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
