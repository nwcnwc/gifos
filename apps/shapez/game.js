/*
 * shapez.io slice — extractors, belts, cutter, rotator, painter, trash, hub.
 * The map is deterministic from a seed. Buildings and hub progress persist.
 */
(function (root) {
  'use strict';

  var SZ = null;
  var TILE = 48;
  var DX = [1, 0, -1, 0];
  var DY = [0, 1, 0, -1];
  var DIRN = ['E', 'S', 'W', 'N'];

  var LEVELS = [
    { goal: 'CuCuCuCu', need: 20, unlock: ['cutter', 'trash'], label: 'Uncolored circles' },
    { goal: '----CuCu', need: 25, unlock: [], label: 'Left half-circles' },
    { goal: 'RuRuRuRu', need: 30, unlock: [], label: 'Uncolored rectangles' },
    { goal: 'RuRu----', need: 30, unlock: ['rotator'], label: 'Right half-rectangles' },
    { goal: 'Cu----Cu', need: 35, unlock: [], label: 'Top half-circles' },
    { goal: 'Cu------', need: 30, unlock: ['painter'], label: 'Top-right quarter circles' },
    { goal: 'CrCrCrCr', need: 40, unlock: [], label: 'Red circles' },
    { goal: 'RbRb----', need: 35, unlock: [], label: 'Right half blue rectangles' }
  ];

  var STARTER = [
    { x: -6, y: -1, w: 4, h: 3, kind: 'C' },
    { x: 3, y: -1, w: 4, h: 3, kind: 'R' },
    { x: -1, y: -6, w: 3, h: 3, kind: 'r' },
    { x: 6, y: 5, w: 3, h: 3, kind: 'g' },
    { x: -8, y: 5, w: 3, h: 3, kind: 'b' },
    { x: 9, y: -4, w: 3, h: 3, kind: 'S' }
  ];

  var SPEED = {
    belt: 2.2,
    miner: 0.55,
    cutter: 0.7,
    rotator: 1.1,
    painter: 0.45
  };

  function key(x, y) { return x + ',' + y; }

  function hash(x, y, seed) {
    var n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed || 1, 1274126177);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (n ^ (n >>> 16)) >>> 0;
  }

  function isHub(x, y) {
    return x >= -1 && x <= 1 && y >= -1 && y <= 1;
  }

  function Game() {
    this.seed = 1;
    this.cells = {};
    this.mach = {};
    this.items = [];
    this._iid = 1;
    this.resCache = {};
    this.level = 0;
    this.delivered = 0;
    this.unlocks = { belt: true, miner: true };
    this.paused = false;
    this.drive = true;
    this.rate = 1;
    this.time = 0;
    this.camX = -1.6;
    this.camY = 0;
    this.zoom = 0.72;
    this.tool = 'miner';
    this.rot = 0;
    this.hint = 'Extractor is selected. Tap the grey circles west of the hub, then switch to Belt and drag into the hub.';
    this.toasts = [];
    this.particles = [];
    this.dirty = false;
    this.onChange = null;
    this.onUnlock = null;
    this.onLevel = null;
    this.stats = { placed: 0, delivered: 0 };
  }

  Game.prototype.init = function (sz, saved) {
    SZ = sz;
    if (saved) this.load(saved);
    this.ensureUnlocks();
    return this;
  };

  Game.prototype.ensureUnlocks = function () {
    var i, u, j;
    this.unlocks = { belt: true, miner: true };
    for (i = 0; i < this.level; i++) {
      u = LEVELS[i] && LEVELS[i].unlock;
      if (!u) continue;
      for (j = 0; j < u.length; j++) this.unlocks[u[j]] = true;
    }
  };

  Game.prototype.goal = function () {
    if (this.level < LEVELS.length) return LEVELS[this.level];
    return this._freeplayGoal();
  };

  Game.prototype._freeplayGoal = function () {
    var n = this.level - LEVELS.length;
    var kinds = ['C', 'R', 'S'];
    var cols = ['r', 'g', 'b', 'u'];
    var k = kinds[n % 3];
    var c = cols[(n >> 1) % 4];
    var code;
    if (n % 5 === 0) code = k + c + k + c + k + c + k + c;
    else if (n % 5 === 1) code = '----' + k + c + k + c;
    else if (n % 5 === 2) code = k + c + k + c + '----';
    else if (n % 5 === 3) code = k + c + '----' + k + c;
    else code = k + c + '------';
    return { goal: code, need: 25 + n * 5, unlock: [], label: 'Freeplay ' + (n + 1), freeplay: true };
  };

  Game.prototype.resourceAt = function (x, y) {
    var k = key(x, y);
    if (this.resCache[k] !== undefined) return this.resCache[k];
    if (isHub(x, y)) {
      this.resCache[k] = null;
      return null;
    }
    var i, p, h, kinds, kind, found = null;
    for (i = 0; i < STARTER.length; i++) {
      p = STARTER[i];
      if (x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) {
        found = p.kind;
        break;
      }
    }
    if (!found) {
      var cx = Math.floor(x / 8), cy = Math.floor(y / 8);
      if (Math.abs(cx) < 3 && Math.abs(cy) < 3) {
        this.resCache[k] = null;
        return null;
      }
      h = hash(cx, cy, this.seed);
      if ((h % 7) === 0) {
        kinds = ['C', 'R', 'S', 'W', 'r', 'g', 'b'];
        kind = kinds[h % kinds.length];
        var ox = (h >>> 8) % 5, oy = (h >>> 12) % 5;
        var lx = ((x % 8) + 8) % 8, ly = ((y % 8) + 8) % 8;
        if (lx >= ox && lx < ox + 3 && ly >= oy && ly < oy + 3) found = kind;
      }
    }
    this.resCache[k] = found;
    return found;
  };

  Game.prototype.cell = function (x, y) {
    return this.cells[key(x, y)] || null;
  };

  Game.prototype.canPlace = function (x, y, kind) {
    if (isHub(x, y)) return false;
    if (kind === 'miner') {
      var r = this.resourceAt(x, y);
      if (!r) return false;
    }
    return true;
  };

  Game.prototype.place = function (x, y, kind, rot, by) {
    if (!this.canPlace(x, y, kind)) return false;
    if (kind !== 'miner' && kind !== 'belt' && kind !== 'trash' && kind !== 'cutter' && kind !== 'rotator' && kind !== 'painter') return false;
    if (!this.unlocks[kind] && kind !== 'belt' && kind !== 'miner') return false;
    var id = key(x, y);
    var prev = this.cells[id];
    this.cells[id] = { k: kind, r: rot & 3, by: by || '', t: Date.now() };
    this.mach[id] = this._freshMach(kind);
    this._dropItemsAt(x, y);
    this.dirty = true;
    this.stats.placed += prev ? 0 : 1;
    return true;
  };

  Game.prototype.erase = function (x, y) {
    if (isHub(x, y)) return false;
    var id = key(x, y);
    if (!this.cells[id]) return false;
    delete this.cells[id];
    delete this.mach[id];
    this._dropItemsAt(x, y);
    this.dirty = true;
    return true;
  };

  Game.prototype.rotateCell = function (x, y) {
    var c = this.cell(x, y);
    if (!c) return false;
    c.r = (c.r + 1) & 3;
    this.dirty = true;
    return true;
  };

  Game.prototype._freshMach = function (kind) {
    if (kind === 'miner') return { cd: 0 };
    if (kind === 'cutter') return { inn: null, work: 0, busy: false, outL: null, outR: null };
    if (kind === 'rotator') return { inn: null, work: 0, busy: false, out: null };
    if (kind === 'painter') return { inn: null, col: null, work: 0, busy: false, out: null };
    return {};
  };

  Game.prototype._dropItemsAt = function (x, y) {
    var keep = [], i, it;
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];
      if (it.x === x && it.y === y) continue;
      keep.push(it);
    }
    this.items = keep;
  };

  Game.prototype.toast = function (msg, ms) {
    this.toasts.push({ msg: msg, t: (ms || 3200), born: this.time });
  };

  Game.prototype.tick = function (dt) {
    if (dt > 0.08) dt = 0.08;
    if (this.paused) dt = 0;
    dt *= this.rate;
    this.time += dt;
    if (dt > 0 && this.drive) {
      this._tickMiners(dt);
      this._tickMachines(dt);
      this._tickBelts(dt);
      this._tickHub();
    }
    this._tickFx(dt);
  };

  Game.prototype._tickFx = function (dt) {
    var i, p, t;
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (i = this.toasts.length - 1; i >= 0; i--) {
      t = this.toasts[i];
      t.t -= dt * 1000;
      if (t.t <= 0) this.toasts.splice(i, 1);
    }
  };

  Game.prototype._spawn = function (x, y, item, dir) {
    this.items.push({
      id: this._iid++,
      x: x, y: y,
      p: 0.15,
      dir: dir,
      item: item
    });
  };

  Game.prototype._tickMiners = function (dt) {
    var id, c, m, nx, ny, res, item, rate;
    rate = SPEED.miner * (1 + this.level * 0.06);
    for (id in this.cells) {
      c = this.cells[id];
      if (c.k !== 'miner') continue;
      m = this.mach[id] || (this.mach[id] = this._freshMach('miner'));
      m.cd -= dt * rate;
      if (m.cd > 0) continue;
      var xy = id.split(',');
      var x = +xy[0], y = +xy[1];
      res = this.resourceAt(x, y);
      if (!res) continue;
      nx = x + DX[c.r];
      ny = y + DY[c.r];
      if (!this._canAccept(nx, ny, (c.r + 2) & 3, true)) continue;
      if (res === 'r' || res === 'g' || res === 'b') item = { typ: 'c', c: res };
      else item = { typ: 's', code: SZ.fullUncolored(res) };
      if (!this._tryEnter(nx, ny, (c.r + 2) & 3, item, 0.02)) continue;
      m.cd = 1;
    }
  };

  Game.prototype._inDir = function (rot) { return (rot + 2) & 3; };
  Game.prototype._leftDir = function (rot) { return (rot + 3) & 3; };
  Game.prototype._rightDir = function (rot) { return (rot + 1) & 3; };

  Game.prototype._canAccept = function (x, y, fromDir, forNew) {
    if (isHub(x, y)) return true;
    var c = this.cell(x, y);
    if (!c) return false;
    var m, i, it;
    if (c.k === 'belt') {
      if (c.r === fromDir) return false;
      for (i = 0; i < this.items.length; i++) {
        it = this.items[i];
        if (it.x === x && it.y === y) return false;
      }
      return true;
    }
    if (c.k === 'trash') return true;
    m = this.mach[key(x, y)];
    if (!m) return false;
    if (c.k === 'cutter' || c.k === 'rotator') {
      if (fromDir !== this._inDir(c.r)) return false;
      return !m.inn && !m.busy;
    }
    if (c.k === 'painter') {
      if (fromDir === this._inDir(c.r)) return !m.inn && !m.busy;
      if (fromDir === this._rightDir(c.r)) return !m.col && !m.busy;
      return false;
    }
    return false;
  };

  Game.prototype._tryEnter = function (x, y, fromDir, item, p0) {
    if (!this._canAccept(x, y, fromDir, true)) return false;
    if (isHub(x, y)) {
      this._deliver(item);
      return true;
    }
    var c = this.cell(x, y);
    var m, id = key(x, y);
    if (c.k === 'belt') {
      this.items.push({ id: this._iid++, x: x, y: y, p: p0 || 0.05, dir: c.r, item: item });
      return true;
    }
    if (c.k === 'trash') return true;
    m = this.mach[id] || (this.mach[id] = this._freshMach(c.k));
    if (c.k === 'cutter' || c.k === 'rotator') {
      if (item.typ !== 's') return false;
      m.inn = item;
      return true;
    }
    if (c.k === 'painter') {
      if (fromDir === this._inDir(c.r)) {
        if (item.typ !== 's') return false;
        m.inn = item;
        return true;
      }
      if (fromDir === this._rightDir(c.r)) {
        if (item.typ !== 'c') return false;
        m.col = item;
        return true;
      }
    }
    return false;
  };

  Game.prototype._tickMachines = function (dt) {
    var id, c, m, x, y, xy, out, cut, nx, ny, took;
    for (id in this.cells) {
      c = this.cells[id];
      m = this.mach[id];
      if (!m) continue;
      xy = id.split(',');
      x = +xy[0]; y = +xy[1];

      if (c.k === 'cutter') {
        if (!m.busy && m.inn && !m.outL && !m.outR) {
          cut = SZ.cut(m.inn.code);
          m.outL = cut.left ? { typ: 's', code: cut.left } : null;
          m.outR = cut.right ? { typ: 's', code: cut.right } : null;
          m.inn = null;
          m.busy = true;
          m.work = 0;
        }
        if (m.busy) {
          m.work += dt * SPEED.cutter * (1 + this.level * 0.04);
          if (m.work >= 1) m.busy = false;
        }
        if (!m.busy) {
          if (m.outL) {
            nx = x + DX[this._leftDir(c.r)];
            ny = y + DY[this._leftDir(c.r)];
            if (this._tryEnter(nx, ny, (this._leftDir(c.r) + 2) & 3, m.outL, 0.05)) m.outL = null;
          }
          if (m.outR) {
            nx = x + DX[this._rightDir(c.r)];
            ny = y + DY[this._rightDir(c.r)];
            if (this._tryEnter(nx, ny, (this._rightDir(c.r) + 2) & 3, m.outR, 0.05)) m.outR = null;
          }
        }
      }

      if (c.k === 'rotator') {
        if (!m.busy && m.inn && !m.out) {
          m.out = { typ: 's', code: SZ.rotateCW(m.inn.code) };
          m.inn = null;
          m.busy = true;
          m.work = 0;
        }
        if (m.busy) {
          m.work += dt * SPEED.rotator;
          if (m.work >= 1) m.busy = false;
        }
        if (!m.busy && m.out) {
          nx = x + DX[c.r];
          ny = y + DY[c.r];
          if (this._tryEnter(nx, ny, this._inDir(c.r), m.out, 0.05)) m.out = null;
        }
      }

      if (c.k === 'painter') {
        if (!m.busy && m.inn && m.col && !m.out) {
          m.out = { typ: 's', code: SZ.paint(m.inn.code, m.col.c) };
          m.inn = null;
          m.col = null;
          m.busy = true;
          m.work = 0;
        }
        if (m.busy) {
          m.work += dt * SPEED.painter;
          if (m.work >= 1) m.busy = false;
        }
        if (!m.busy && m.out) {
          nx = x + DX[c.r];
          ny = y + DY[c.r];
          if (this._tryEnter(nx, ny, this._inDir(c.r), m.out, 0.05)) m.out = null;
        }
      }
    }
  };

  Game.prototype._itemOn = function (x, y) {
    var i;
    for (i = 0; i < this.items.length; i++) {
      if (this.items[i].x === x && this.items[i].y === y) return this.items[i];
    }
    return null;
  };

  Game.prototype._tickBelts = function (dt) {
    var i, it, c, nx, ny, step, dest, occ = {}, stay = [];
    var cur = this.items.slice();
    step = SPEED.belt * (1 + this.level * 0.05) * dt;
    cur.sort(function (a, b) { return b.p - a.p; });
    function taken(x, y) { return !!occ[x + ',' + y]; }
    function take(x, y) { occ[x + ',' + y] = 1; }
    for (i = 0; i < cur.length; i++) {
      it = cur[i];
      c = this.cell(it.x, it.y);
      if (!c || c.k !== 'belt') continue;
      it.dir = c.r;
      it.p += step;
      if (it.p < 1) {
        take(it.x, it.y);
        stay.push(it);
        continue;
      }
      nx = it.x + DX[c.r];
      ny = it.y + DY[c.r];
      if (isHub(nx, ny)) {
        this._deliver(it.item);
        continue;
      }
      dest = this.cell(nx, ny);
      if (dest && dest.k === 'belt' && dest.r !== ((c.r + 2) & 3) && !taken(nx, ny)) {
        it.x = nx;
        it.y = ny;
        it.p = Math.min(0.92, it.p - 1);
        it.dir = dest.r;
        take(nx, ny);
        stay.push(it);
        continue;
      }
      if (dest && dest.k !== 'belt' && this._tryEnter(nx, ny, (c.r + 2) & 3, it.item, 0.05)) {
        continue;
      }
      it.p = 0.98;
      take(it.x, it.y);
      stay.push(it);
    }
    this.items = stay;
  };

  Game.prototype._tickHub = function () {
    /* delivery happens in _deliver */
  };

  Game.prototype._deliver = function (item) {
    this.particles.push({
      x: 0, y: 0, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12,
      life: 0.45, item: item
    });
    if (!item || item.typ !== 's') return;
    var g = this.goal();
    if (!g) return;
    if (item.code === g.goal) {
      this.delivered += 1;
      this.stats.delivered += 1;
      this.dirty = true;
      if (this.delivered >= g.need) this._nextLevel();
    }
  };

  Game.prototype._nextLevel = function () {
    var g = this.goal();
    var i, name;
    this.level += 1;
    this.delivered = 0;
    this.ensureUnlocks();
    if (g && g.unlock) {
      for (i = 0; i < g.unlock.length; i++) {
        name = g.unlock[i];
        this.unlocks[name] = true;
        if (name === 'cutter') this.toast('Cutter unlocked — it splits a shape into left and right. Trash the half you do not need.');
        else if (name === 'rotator') this.toast('Rotator unlocked — turns a shape 90° clockwise.');
        else if (name === 'painter') this.toast('Painter unlocked — shape in the back, colour on the right, painted shape out the front.');
        else if (name === 'trash') this.toast('Trash unlocked — belts into it destroy anything. Cutters clog if one side backs up.');
      }
    }
    g = this.goal();
    this.toast('Level ' + this.level + ' — ' + (g && g.label ? g.label : 'new goal'));
    this.hint = '';
    this.dirty = true;
    if (this.onLevel) this.onLevel(this.level);
    if (this.onUnlock) this.onUnlock(this.unlocks);
  };

  Game.prototype.exportCells = function () {
    var out = [], id, c;
    for (id in this.cells) {
      c = this.cells[id];
      out.push({ id: id, k: c.k, r: c.r, by: c.by || '' });
    }
    return out;
  };

  Game.prototype.replaceCells = function (list) {
    var next = {}, i, rec, xy, x, y;
    list = list || [];
    for (i = 0; i < list.length; i++) {
      rec = list[i];
      if (!rec || !rec.id || !rec.k) continue;
      next[rec.id] = { k: rec.k, r: (rec.r || 0) & 3, by: rec.by || '', t: rec.t };
    }
    for (i in this.cells) {
      if (!next[i]) {
        xy = i.split(',');
        this._dropItemsAt(+xy[0], +xy[1]);
        delete this.mach[i];
      }
    }
    for (i in next) {
      if (!this.cells[i] || this.cells[i].k !== next[i].k) {
        this.mach[i] = this._freshMach(next[i].k);
      }
    }
    this.cells = next;
  };

  Game.prototype.exportItems = function () {
    var a = [], i, it, lim = Math.min(this.items.length, 360);
    for (i = 0; i < lim; i++) {
      it = this.items[i];
      a.push([it.x, it.y, Math.round(it.p * 100) / 100, SZ.itemKey(it.item)]);
    }
    return a;
  };

  Game.prototype.importItems = function (a) {
    var out = [], i, row;
    a = a || [];
    for (i = 0; i < a.length; i++) {
      row = a[i];
      if (!row) continue;
      out.push({
        id: i + 1,
        x: row[0], y: row[1], p: row[2],
        dir: 0,
        item: SZ.fromKey(row[3])
      });
    }
    this.items = out;
  };

  Game.prototype.snapshot = function () {
    return {
      seed: this.seed,
      level: this.level,
      delivered: this.delivered,
      cells: this.exportCells(),
      camX: this.camX,
      camY: this.camY,
      zoom: this.zoom,
      rate: this.rate
    };
  };

  Game.prototype.load = function (s) {
    if (!s) return;
    this.seed = s.seed || 1;
    this.level = s.level || 0;
    this.delivered = s.delivered || 0;
    if (s.camX != null) this.camX = s.camX;
    if (s.camY != null) this.camY = s.camY;
    if (s.zoom) this.zoom = s.zoom;
    this.rate = s.rate || 1;
    this.replaceCells(s.cells || []);
    this.ensureUnlocks();
    this.resCache = {};
    if (this.level === 0 && this.delivered === 0) {
      this.hint = 'Extractor is selected. Tap the grey circles west of the hub, then switch to Belt and drag into the hub.';
    } else {
      this.hint = '';
    }
  };

  Game.prototype.reset = function () {
    this.cells = {};
    this.mach = {};
    this.items = [];
    this.level = 0;
    this.delivered = 0;
    this.camX = -1.6;
    this.camY = 0;
    this.zoom = 0.72;
    this.ensureUnlocks();
    this.resCache = {};
    this.hint = 'Extractor is selected. Tap the grey circles west of the hub, then switch to Belt and drag into the hub.';
    this.dirty = true;
    this.toast('Factory cleared.');
  };

  Game.prototype.worldPoint = function (sx, sy, cw, ch) {
    var z = this.zoom * TILE;
    return {
      x: Math.floor((sx - cw / 2) / z + this.camX),
      y: Math.floor((sy - ch / 2) / z + this.camY)
    };
  };

  Game.prototype.screenPoint = function (tx, ty, cw, ch) {
    var z = this.zoom * TILE;
    return {
      x: (tx - this.camX) * z + cw / 2,
      y: (ty - this.camY) * z + ch / 2
    };
  };

  root.SZGame = Game;
  root.SZConst = {
    TILE: TILE, DX: DX, DY: DY, DIRN: DIRN, LEVELS: LEVELS, isHub: isHub, key: key
  };
})(window);
