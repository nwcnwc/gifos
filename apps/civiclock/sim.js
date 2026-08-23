// Civiclock — original city tick. Pure functions. Classic script.
// window.Civiclock.
(function (root) {
  'use strict';
  var N = 24;
  var T = {
    GRASS: 0, WATER: 1, ROAD: 2, LINE: 3, PLANT: 4, PUMP: 5, PARK: 6,
    HOME: 7, SHOP: 8, WORK: 9
  };
  var NAME = ['grass', 'water', 'road', 'power line', 'plant', 'pump', 'park',
    'homes', 'shops', 'works'];
  var COST = {};
  COST[T.ROAD] = 10; COST[T.LINE] = 5; COST[T.PLANT] = 2500; COST[T.PUMP] = 800;
  COST[T.PARK] = 50; COST[T.HOME] = 20; COST[T.SHOP] = 20; COST[T.WORK] = 20;
  var BULLDOZE = 8;
  var DIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var OCC = {
    7: [0, 4, 10, 22],
    8: [0, 3, 8, 16],
    9: [0, 6, 14, 26]
  };
  var TOOLS = ['pan', 'inspect', 'road', 'homes', 'shops', 'works',
    'plant', 'pump', 'park', 'line', 'bulldoze'];
  var TOOL_T = {
    road: T.ROAD, homes: T.HOME, shops: T.SHOP, works: T.WORK,
    plant: T.PLANT, pump: T.PUMP, park: T.PARK, line: T.LINE
  };

  function idx(x, y) { return y * N + x; }
  function inb(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }
  function hash(a, b, c) {
    var s = (a * 374761393 + (b || 0) * 668265263 + (c || 0) * 1274126177) | 0;
    s = (s ^ (s >>> 13)) * 1274126177;
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function tileOcc(tl) {
    if (!tl || tl.a || tl.s < 1) return 0;
    var row = OCC[tl.t];
    return row ? row[tl.s] : 0;
  }
  function isZone(t) { return t === T.HOME || t === T.SHOP || t === T.WORK; }
  function isBuilt(t) {
    return t === T.ROAD || t === T.LINE || t === T.PLANT || t === T.PUMP ||
      t === T.PARK || isZone(t);
  }
  function conductsPower(t) {
    return t === T.ROAD || t === T.LINE || t === T.PLANT || t === T.PUMP || isZone(t);
  }
  function conductsWater(t) {
    return t === T.ROAD || t === T.PUMP || isZone(t) || t === T.PLANT;
  }

  function makeTile(t) {
    return { t: t, s: 0, a: 0, age: 0, p: 0, u: 0, k: 0, v: 30 };
  }
  function cloneTile(tl) {
    return { t: tl.t, s: tl.s, a: tl.a, age: tl.age, p: tl.p, u: tl.u, k: tl.k, v: tl.v };
  }
  function cloneWorld(w) {
    var tiles = new Array(N * N), i;
    for (i = 0; i < tiles.length; i++) tiles[i] = cloneTile(w.tiles[i]);
    return {
      id: 'world', n: N, tiles: tiles, money: w.money, month: w.month, tax: w.tax,
      speed: w.speed, seed: w.seed, demand: { H: w.demand.H, S: w.demand.S, W: w.demand.W },
      pop: w.pop, jobs: w.jobs, shops: w.shops, powerUsed: w.powerUsed, powerCap: w.powerCap,
      waterUsed: w.waterUsed, waterCap: w.waterCap, income: w.income, expense: w.expense,
      headline: w.headline, bankrupt: w.bankrupt, v: w.v, kind: w.kind || 'empty',
      plantsOn: w.plantsOn, alerts: (w.alerts || []).slice()
    };
  }

  function blank(seed) {
    var tiles = new Array(N * N), x, y, t, i;
    seed = seed == null ? 1 : seed;
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      t = T.GRASS;
      if (x === 0 || (x === 1 && hash(x, y, seed) > 0.22)) t = T.WATER;
      if (x === 1 && y > 6 && y < 18 && hash(x, y, seed + 9) > 0.55) t = T.WATER;
      tiles[idx(x, y)] = makeTile(t);
    }
    return {
      id: 'world', n: N, tiles: tiles, money: 10000, month: 0, tax: 8, speed: 1,
      seed: seed, demand: { H: 0.4, S: 0.08, W: 0.55 }, pop: 0, jobs: 0, shops: 0,
      powerUsed: 0, powerCap: 0, waterUsed: 0, waterCap: 0, income: 0, expense: 0,
      headline: 'Empty land. Lay a road, paint homes, give them power.',
      bankrupt: 0, v: 1, kind: 'empty', plantsOn: 1, alerts: []
    };
  }

  function place(w, x, y, t, stage) {
    if (!inb(x, y)) return;
    var tl = w.tiles[idx(x, y)];
    if (tl.t === T.WATER && t !== T.WATER) return;
    tl.t = t; tl.s = stage || 0; tl.a = 0; tl.age = 0;
  }

  function village(seed) {
    var w = blank(seed == null ? 7 : seed), x, y;
    w.kind = 'village';
    w.money = 8200;
    w.headline = 'A small town is already ticking. Paint more, or wreck it.';
    w.tiles[idx(1, 11)].t = T.WATER;
    w.tiles[idx(1, 12)].t = T.WATER;
    for (y = 4; y <= 19; y++) place(w, 4, y, T.ROAD);
    for (x = 2; x <= 18; x++) place(w, x, 11, T.ROAD);
    for (x = 4; x <= 14; x++) place(w, x, 7, T.ROAD);
    for (y = 7; y <= 15; y++) place(w, 10, y, T.ROAD);
    place(w, 2, 11, T.PUMP);
    place(w, 3, 13, T.PLANT);
    place(w, 3, 11, T.ROAD);
    place(w, 3, 12, T.ROAD);
    place(w, 5, 10, T.PARK);
    place(w, 6, 10, T.PARK);
    place(w, 9, 8, T.PARK);
    for (y = 5; y <= 9; y++) for (x = 5; x <= 8; x++) {
      if (w.tiles[idx(x, y)].t === T.GRASS) place(w, x, y, T.HOME);
    }
    for (y = 12; y <= 15; y++) for (x = 5; x <= 8; x++) {
      if (w.tiles[idx(x, y)].t === T.GRASS) place(w, x, y, T.SHOP);
    }
    for (y = 5; y <= 9; y++) for (x = 11; x <= 14; x++) {
      if (w.tiles[idx(x, y)].t === T.GRASS) place(w, x, y, T.WORK);
    }
    for (y = 12; y <= 14; y++) for (x = 11; x <= 13; x++) {
      if (w.tiles[idx(x, y)].t === T.GRASS) place(w, x, y, T.HOME);
    }
    return w;
  }

  function grownVillage(months) {
    var w = village(7), i, n = months == null ? 36 : months;
    w.speed = 1;
    for (i = 0; i < n; i++) w = tick(w);
    return w;
  }

  function neighbors4(x, y, fn) {
    var i, nx, ny;
    for (i = 0; i < 4; i++) {
      nx = x + DIR[i][0]; ny = y + DIR[i][1];
      if (inb(nx, ny)) fn(nx, ny, i);
    }
  }
  function roadAdj(w, x, y) {
    var ok = false;
    neighbors4(x, y, function (nx, ny) {
      if (w.tiles[idx(nx, ny)].t === T.ROAD) ok = true;
    });
    return ok;
  }
  function waterAdj(w, x, y) {
    var ok = false;
    neighbors4(x, y, function (nx, ny) {
      if (w.tiles[idx(nx, ny)].t === T.WATER) ok = true;
    });
    return ok;
  }

  function flood(w, sources, conduct) {
    var mark = new Uint8Array(N * N), q = [], i, s, t, x, y, id, tl;
    for (i = 0; i < sources.length; i++) {
      s = sources[i];
      if (!inb(s.x, s.y)) continue;
      id = idx(s.x, s.y);
      if (mark[id]) continue;
      mark[id] = 1;
      q.push(s.x, s.y);
    }
    i = 0;
    while (i < q.length) {
      x = q[i++]; y = q[i++];
      neighbors4(x, y, function (nx, ny) {
        var nid = idx(nx, ny);
        if (mark[nid]) return;
        t = w.tiles[nid].t;
        if (!conduct(t)) return;
        mark[nid] = 1;
        q.push(nx, ny);
      });
    }
    return mark;
  }

  function services(w) {
    var plants = [], pumps = [], i, x, y, tl, capP = 0, capU = 0;
    var plantsOn = w.bankrupt >= 3 ? 0 : 1;
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      tl = w.tiles[idx(x, y)];
      if (tl.t === T.PLANT && plantsOn) { plants.push({ x: x, y: y }); capP += 80; }
      if (tl.t === T.PUMP && waterAdj(w, x, y)) { pumps.push({ x: x, y: y }); capU += 55; }
    }
    var pow = flood(w, plants, conductsPower);
    var wat = flood(w, pumps, conductsWater);
    var usedP = 0, usedU = 0;
    for (i = 0; i < N * N; i++) {
      tl = w.tiles[i];
      tl.p = pow[i] ? 1 : 0;
      tl.u = wat[i] ? 1 : 0;
      if (tl.t === T.PUMP) usedP += 2;
      if (isZone(tl.t) && tl.s > 0 && !tl.a) {
        usedP += tl.s;
        usedU += tl.s;
      }
    }
    w.powerCap = capP; w.powerUsed = usedP;
    w.waterCap = capU; w.waterUsed = usedU;
    w.plantsOn = plantsOn;
    if (usedP > capP && capP > 0) {
      // brownouts: farthest-from-plant lots lose power
      for (i = 0; i < N * N; i++) {
        if (!isZone(w.tiles[i].t)) continue;
        if (hash(i, w.month, 3) < (usedP - capP) / (usedP + 1)) w.tiles[i].p = 0;
      }
    }
    if (usedU > capU && capU > 0) {
      for (i = 0; i < N * N; i++) {
        if (!isZone(w.tiles[i].t)) continue;
        if (hash(i, w.month, 5) < (usedU - capU) / (usedU + 1)) w.tiles[i].u = 0;
      }
    }
  }

  function landValue(w) {
    var i, x, y, tl, v, dx, dy, ox, oy, ot, d, park, smoke, shopN;
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      tl = w.tiles[idx(x, y)];
      v = 36;
      if (tl.t === T.WATER || tl.t === T.GRASS) { tl.v = 20; continue; }
      park = 0; smoke = 0; shopN = 0;
      for (dy = -3; dy <= 3; dy++) for (dx = -3; dx <= 3; dx++) {
        ox = x + dx; oy = y + dy;
        if (!inb(ox, oy)) continue;
        d = Math.abs(dx) + Math.abs(dy);
        if (d === 0 || d > 3) continue;
        ot = w.tiles[idx(ox, oy)].t;
        if (ot === T.PARK) park += 4 - d;
        if (ot === T.WORK) smoke += 4 - d;
        if (ot === T.SHOP && w.tiles[idx(ox, oy)].s > 0) shopN += 3 - d;
        if (ot === T.WATER) v += 2;
        if (w.tiles[idx(ox, oy)].a) v -= 3;
      }
      v += park * 4;
      v -= smoke * 3;
      v += shopN * 2;
      if (!tl.p) v -= 18;
      if (!tl.u) v -= 10;
      v -= Math.min(24, (tl.k || 0) / 6);
      if (tl.a) v -= 20;
      tl.v = clamp(v | 0, 4, 100);
    }
  }

  function census(w) {
    var i, tl, pop = 0, jobs = 0, shops = 0, homes = 0, works = 0, shopLots = 0;
    var needH = 0, needS = 0, needW = 0;
    for (i = 0; i < N * N; i++) {
      tl = w.tiles[i];
      if (tl.t === T.HOME) {
        homes += 1; pop += tileOcc(tl);
        if (tl.s < 3 && !tl.a) needH += 3 - tl.s;
      } else if (tl.t === T.SHOP) {
        shopLots += 1; shops += tileOcc(tl);
        if (tl.s < 3 && !tl.a) needS += 3 - tl.s;
      } else if (tl.t === T.WORK) {
        works += 1; jobs += tileOcc(tl);
        if (tl.s < 3 && !tl.a) needW += 3 - tl.s;
      }
    }
    w.pop = pop; w.jobs = jobs; w.shops = shops;
    w.lots = { H: homes, S: shopLots, W: works };
    return { pop: pop, jobs: jobs, shops: shops, homes: homes, works: works, shopLots: shopLots,
      needH: needH, needS: needS, needW: needW };
  }

  function demandOf(w, c) {
    var boot = w.month < 18 ? 0.28 : (w.month < 36 ? 0.12 : 0);
    var taxP = w.tax <= 8 ? 0 : (w.tax - 8) * 0.045;
    var jobsGap = (c.jobs - c.pop * 0.75) / 40;
    var shopGap = (c.pop - c.shops * 1.6) / 50;
    var workGap = (c.pop * 0.85 - c.jobs) / 40;
    var H = clamp(0.38 + boot + jobsGap - taxP + (c.pop > 0 && c.jobs === 0 ? -0.35 : 0), -1, 1);
    var S = clamp(0.06 + boot * 0.4 + shopGap + c.pop * 0.0015 - taxP * 0.6, -1, 1);
    var W = clamp(0.5 + boot + workGap - taxP * 0.5 - (c.jobs > c.pop + 20 ? 0.4 : 0), -1, 1);
    if (c.homes === 0) H = clamp(H + 0.15, -1, 1);
    if (c.works === 0) W = clamp(W + 0.2, -1, 1);
    w.demand = { H: H, S: S, W: W };
  }

  function grow(w) {
    var x, y, tl, dem, chance, maxS, growOk, leave, r;
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      tl = w.tiles[idx(x, y)];
      if (!isZone(tl.t)) continue;
      dem = tl.t === T.HOME ? w.demand.H : tl.t === T.SHOP ? w.demand.S : w.demand.W;
      r = hash(x, y, w.month + w.seed);
      growOk = roadAdj(w, x, y) && tl.p && dem > -0.05 && w.money > -500;
      maxS = !tl.u ? 1 : (tl.v >= 62 ? 3 : tl.v >= 40 ? 2 : 1);
      if (!tl.p) maxS = 0;
      if (w.tax >= 16) maxS = Math.min(maxS, 1);
      leave = (!tl.p && tl.s > 0) || dem < -0.35 || w.tax >= 18 || (tl.t === T.HOME && w.jobs === 0 && w.month > 8 && tl.s > 0);
      if (leave && tl.s > 0) {
        if (r < 0.38 || !tl.p) {
          tl.age = (tl.age || 0) + 1;
          if (tl.age >= 2) {
            if (tl.s >= 2 && r < 0.55) { tl.s -= 1; tl.a = 0; tl.age = 0; }
            else { tl.a = 1; tl.age = 0; }
          }
        }
        continue;
      }
      if (tl.a) {
        if (growOk && dem > 0.1 && r < 0.4) { tl.a = 0; tl.age = 0; }
        continue;
      }
      if (!growOk) {
        if (tl.s > 0 && r < 0.12) tl.age = (tl.age || 0) + 1;
        if (tl.age >= 4) { tl.a = 1; tl.age = 0; }
        continue;
      }
      tl.age = 0;
      chance = 0.22 + dem * 0.45 + tl.v / 400;
      if (w.tax <= 6) chance += 0.08;
      if (tl.s === 0) chance += 0.18;
      if (tl.s >= maxS) {
        if (tl.s > maxS && r < 0.3) tl.s = maxS;
        continue;
      }
      if (r < chance) tl.s = Math.min(3, tl.s + 1);
    }
  }

  function trafficAndBudget(w) {
    var i, x, y, tl, inc = 0, exp = 0, roads = 0;
    for (i = 0; i < N * N; i++) w.tiles[i].k = Math.max(0, ((w.tiles[i].k || 0) * 0.55) | 0);
    // commute load: each occupied home dumps traffic onto nearby roads toward works
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      tl = w.tiles[idx(x, y)];
      if (tl.t === T.HOME && tileOcc(tl) > 0) addCommuteTraffic(w, x, y, tileOcc(tl));
    }
    for (i = 0; i < N * N; i++) {
      tl = w.tiles[i];
      if (isZone(tl.t) && !tl.a) inc += tileOcc(tl) * (w.tax / 100) * (7 + tl.v / 18);
      if (tl.t === T.PLANT) exp += w.plantsOn ? 40 : 8;
      if (tl.t === T.PUMP) exp += 14;
      if (tl.t === T.PARK) exp += 2;
      if (tl.t === T.ROAD) { roads += 1; exp += 0.35 + (tl.k || 0) / 140; }
    }
    inc = inc | 0; exp = exp | 0;
    w.income = inc; w.expense = exp;
    w.money = (w.money + inc - exp) | 0;
    if (w.money < 0) w.bankrupt = (w.bankrupt || 0) + 1;
    else w.bankrupt = 0;
  }

  function addCommuteTraffic(w, x, y, load) {
    var job = nearest(w, x, y, T.WORK);
    var shop = nearest(w, x, y, T.SHOP);
    var path, i, tl;
    if (job) {
      path = bfsRoad(w, x, y, job.x, job.y);
      if (path) for (i = 0; i < path.length; i++) {
        tl = w.tiles[idx(path[i].x, path[i].y)];
        if (tl.t === T.ROAD) tl.k = Math.min(255, (tl.k || 0) + load);
      }
    }
    if (shop && (w.month % 2 === 0)) {
      path = bfsRoad(w, x, y, shop.x, shop.y);
      if (path) for (i = 0; i < path.length; i++) {
        tl = w.tiles[idx(path[i].x, path[i].y)];
        if (tl.t === T.ROAD) tl.k = Math.min(255, (tl.k || 0) + (load / 2) | 0);
      }
    }
  }

  function nearest(w, x, y, type) {
    var bx = -1, by = -1, bd = 1e9, ox, oy, tl, d, occ, used = nearest._used || (nearest._used = {});
    if (type !== nearest._type || nearest._month !== w.month) {
      nearest._used = used = {};
      nearest._type = type;
      nearest._month = w.month;
    }
    for (oy = 0; oy < N; oy++) for (ox = 0; ox < N; ox++) {
      tl = w.tiles[idx(ox, oy)];
      if (tl.t !== type || tl.a || tl.s < 1) continue;
      occ = tileOcc(tl);
      if ((used[idx(ox, oy)] || 0) >= occ && occ > 0) continue;
      d = Math.abs(ox - x) + Math.abs(oy - y);
      if (d < bd) { bd = d; bx = ox; by = oy; }
    }
    if (bx < 0) return null;
    used[idx(bx, by)] = (used[idx(bx, by)] || 0) + 4;
    return { x: bx, y: by };
  }

  function bfsRoad(w, x0, y0, x1, y1) {
    // walk from a zone onto an adjacent road, then along roads, then step onto target
    var start = null, goal = {};
    neighbors4(x0, y0, function (nx, ny) {
      if (w.tiles[idx(nx, ny)].t === T.ROAD && !start) start = { x: nx, y: ny };
    });
    neighbors4(x1, y1, function (nx, ny) {
      if (w.tiles[idx(nx, ny)].t === T.ROAD) goal[idx(nx, ny)] = 1;
    });
    if (!start) return null;
    var q = [start.x, start.y], seen = new Int32Array(N * N), i, x, y, id, pid;
    for (i = 0; i < seen.length; i++) seen[i] = -2;
    seen[idx(start.x, start.y)] = -1;
    i = 0;
    var found = -1;
    while (i < q.length) {
      x = q[i++]; y = q[i++];
      id = idx(x, y);
      if (goal[id]) { found = id; break; }
      neighbors4(x, y, function (nx, ny) {
        var nid = idx(nx, ny);
        if (seen[nid] !== -2) return;
        if (w.tiles[nid].t !== T.ROAD) return;
        seen[nid] = id;
        q.push(nx, ny);
      });
    }
    if (found < 0) return null;
    var path = [];
    id = found;
    while (id >= 0) {
      path.push({ x: id % N, y: (id / N) | 0 });
      pid = seen[id];
      if (pid === -1) break;
      id = pid;
    }
    path.reverse();
    return path;
  }

  function headline(w, c, prevPop) {
    var h = '', alerts = [];
    if (w.money < 0) { h = 'Treasury empty. Plants will go dark if this lasts.'; alerts.push('broke'); }
    else if (w.powerUsed > w.powerCap) { h = 'Blackouts. Build another plant, or the lights die.'; alerts.push('power'); }
    else if (w.waterUsed > w.waterCap) { h = 'Taps run dry. Put a pump on the river.'; alerts.push('water'); }
    else if (c.pop < prevPop - 4) { h = 'People are leaving. Check power, tax, and jobs.'; alerts.push('leave'); }
    else if (w.demand.H > 0.55 && c.needH > 4) h = 'Homes are packed. Paint more lots along a road.';
    else if (w.demand.W > 0.55) h = 'Workers need jobs. Paint works near the road.';
    else if (w.demand.S > 0.5) h = 'Shops would fill if you zoned them.';
    else if (c.pop === 0 && w.month > 2) h = 'No one lives here yet. Homes, a road, and power.';
    else if (c.pop > 80 && w.month % 7 === 0) h = 'A living city. Night lights mean the grid is holding.';
    else if (c.pop > 0) h = c.pop + ' people, ' + c.jobs + ' jobs. Tax ' + w.tax + '%.';
    else h = 'Empty lots wait. Time is running.';
    w.headline = h;
    w.alerts = alerts;
  }

  function tick(world) {
    var w = cloneWorld(world);
    var prevPop = w.pop;
    nearest._type = null;
    services(w);
    landValue(w);
    var c = census(w);
    demandOf(w, c);
    grow(w);
    c = census(w);
    demandOf(w, c);
    trafficAndBudget(w);
    w.month += 1;
    w.v = (w.v || 0) + 1;
    headline(w, c, prevPop);
    return w;
  }

  function toolCost(tool) {
    if (tool === 'bulldoze') return BULLDOZE;
    var t = TOOL_T[tool];
    return t == null ? 0 : (COST[t] || 0);
  }

  function canPaint(w, x, y, tool) {
    if (!inb(x, y)) return 'off the map';
    var tl = w.tiles[idx(x, y)];
    if (tool === 'pan' || tool === 'inspect') return null;
    if (tool === 'bulldoze') {
      if (tl.t === T.WATER || tl.t === T.GRASS) return 'nothing to clear';
      return null;
    }
    var t = TOOL_T[tool];
    if (t == null) return 'unknown tool';
    if (tl.t === T.WATER) return 'cannot build on water';
    if (tool === 'pump' && !waterAdj(w, x, y)) return 'pumps sit next to the river';
    if (tl.t === t && !isZone(t)) return 'already there';
    if (w.money < (COST[t] || 0) && w.money < 0) return 'no money';
    return null;
  }

  function paint(world, x, y, tool, by) {
    var err = canPaint(world, x, y, tool);
    if (err) return { ok: false, reason: err, world: world };
    var w = cloneWorld(world);
    var tl = w.tiles[idx(x, y)];
    if (tool === 'bulldoze') {
      w.money -= BULLDOZE;
      w.tiles[idx(x, y)] = makeTile(T.GRASS);
    } else {
      var t = TOOL_T[tool];
      w.money -= COST[t] || 0;
      tl.t = t;
      tl.s = 0;
      tl.a = 0;
      tl.age = 0;
    }
    w.v = (w.v || 0) + 1;
    w.lastEdit = { x: x, y: y, tool: tool, by: by || '' };
    services(w);
    landValue(w);
    var c = census(w);
    demandOf(w, c);
    return { ok: true, world: w };
  }

  function inspect(w, x, y) {
    if (!inb(x, y)) return null;
    var tl = w.tiles[idx(x, y)];
    var why = [];
    var title = NAME[tl.t] || 'lot';
    if (isZone(tl.t)) {
      title = NAME[tl.t] + (tl.a ? ' · abandoned' : tl.s === 0 ? ' · empty lot' : tl.s === 1 ? ' · cottages' : tl.s === 2 ? ' · blocks' : ' · towers');
      if (!roadAdj(w, x, y)) why.push('No road. Paint a road against this lot.');
      if (!tl.p) why.push('No power. Run a plant to a road that touches this lot.');
      if (!tl.u) why.push('No water. A pump on the river sends water down the road.');
      if (tl.t === T.HOME && w.jobs < w.pop * 0.4 && w.pop > 8) why.push('Not enough jobs. Paint works.');
      if (w.tax >= 16) why.push('Tax is punishing. People will not stay.');
      var dem = tl.t === T.HOME ? w.demand.H : tl.t === T.SHOP ? w.demand.S : w.demand.W;
      if (dem < 0 && tl.s === 0) why.push('No demand for this zone right now.');
      if (tl.s >= 1 && tl.s < 3 && !tl.u) why.push('Without water this lot cannot grow past shacks.');
      if (tl.v < 28) why.push('Land value is low — parks help, works next door hurt.');
      if (!why.length && tl.s === 0) why.push('Waiting to grow. Unpause and watch.');
      if (!why.length && tl.s === 3) why.push('Fully grown. This is as dense as the land will take.');
      if (!why.length && tl.s > 0 && !tl.a) why.push('Growing with the city. Power, water and the road are holding.');
      if (tl.a) why.push('Abandoned. Restore power, drop the tax, or give them jobs.');
    } else if (tl.t === T.PLANT) {
      why.push(w.plantsOn ? 'Producing 80 power.' : 'Offline — the city is bankrupt.');
    } else if (tl.t === T.PUMP) {
      why.push(waterAdj(w, x, y) ? 'Drawing 55 water from the river.' : 'Not next to water — it does nothing.');
    } else if (tl.t === T.ROAD) {
      var k = tl.k || 0;
      why.push(k > 140 ? 'Jammed. People crawl.' : k > 60 ? 'Busy.' : 'Quiet.');
    } else if (tl.t === T.GRASS) {
      why.push('Empty land. Paint a zone or a road.');
    } else if (tl.t === T.WATER) {
      why.push('River. Pumps must touch this.');
    } else if (tl.t === T.PARK) {
      why.push('Raises land value around it. Costs a little each month.');
    } else if (tl.t === T.LINE) {
      why.push('Carries power across grass. Roads already carry power.');
    }
    return {
      x: x, y: y, title: title, type: tl.t, stage: tl.s, abandoned: !!tl.a,
      power: !!tl.p, water: !!tl.u, traffic: tl.k || 0, value: tl.v || 0,
      occ: tileOcc(tl), why: why
    };
  }

  function people(w, dayT) {
    // dayT 0..1 night→dawn→day→dusk→night. Returns drawable agents.
    var out = [], y, x, tl, n, p, job, shop, path, tMove, pos, kind, i;
    var isNight = dayT < 0.22 || dayT > 0.82;
    var morning = dayT >= 0.22 && dayT < 0.38;
    var midday = dayT >= 0.38 && dayT < 0.62;
    var evening = dayT >= 0.62 && dayT < 0.82;
    nearest._type = null;
    nearest._month = -1;
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      tl = w.tiles[idx(x, y)];
      if (tl.t !== T.HOME || tl.a) continue;
      n = tileOcc(tl);
      if (!n) continue;
      for (p = 0; p < n && out.length < 90; p++) {
        if (hash(x, y, p + 11) > 0.72 && n > 2) continue;
        kind = p % 3;
        job = nearest(w, x, y, T.WORK);
        shop = nearest(w, x, y, T.SHOP);
        path = null;
        tMove = 0;
        if (isNight) {
          out.push({ x: x + 0.3 + hash(p, 1, y) * 0.4, y: y + 0.3 + hash(p, 2, x) * 0.4, k: 'home', z: 0 });
          continue;
        }
        if (kind === 0 && job) {
          path = bfsRoad(w, x, y, job.x, job.y);
          if (morning) tMove = (dayT - 0.22) / 0.16;
          else if (midday) {
            out.push({ x: job.x + 0.4, y: job.y + 0.4, k: 'work', z: 1 });
            continue;
          } else if (evening) tMove = 1 - (dayT - 0.62) / 0.2;
        } else if (shop) {
          path = bfsRoad(w, x, y, shop.x, shop.y);
          if (morning || midday) tMove = clamp((dayT - 0.3) / 0.25, 0, 1);
          else tMove = 1 - (dayT - 0.62) / 0.2;
        }
        if (!path || path.length < 1) {
          out.push({ x: x + 0.45, y: y + 0.45, k: 'home', z: 0 });
          continue;
        }
        tMove = clamp(tMove, 0, 1);
        var u = tMove * (path.length - 1), a = u | 0, f = u - a;
        var A = path[a], B = path[Math.min(path.length - 1, a + 1)];
        out.push({
          x: A.x + (B.x - A.x) * f + 0.5,
          y: A.y + (B.y - A.y) * f + 0.5,
          k: kind === 0 ? 'work' : 'shop',
          z: 1
        });
      }
    }
    return out;
  }

  function dateStr(month) {
    var y = 1 + ((month / 12) | 0);
    return MONTHS[month % 12] + ' · Y' + y;
  }

  function moneyStr(n) {
    var s = n < 0 ? '-' : '';
    n = Math.abs(n | 0);
    return s + '$' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function applyEdits(world, edits) {
    var w = world, i, e, r;
    if (!edits || !edits.length) return w;
    edits = edits.slice().sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    for (i = 0; i < edits.length; i++) {
      e = edits[i];
      if (!e || !e.tool) continue;
      r = paint(w, e.x | 0, e.y | 0, e.tool, e.by);
      if (r.ok) w = r.world;
    }
    return w;
  }

  function dump(w) {
    // lean record for gifos.db — drop derived-only if needed; keep tiles.
    return cloneWorld(w);
  }

  function load(rec) {
    if (!rec || !rec.tiles || rec.tiles.length !== N * N) return blank(1);
    var w = cloneWorld(rec);
    w.id = 'world';
    if (!w.demand) w.demand = { H: 0, S: 0, W: 0 };
    return w;
  }

  root.Civiclock = {
    N: N, T: T, NAME: NAME, COST: COST, BULLDOZE: BULLDOZE, TOOLS: TOOLS, TOOL_T: TOOL_T,
    MONTHS: MONTHS, idx: idx, inb: inb, hash: hash, tileOcc: tileOcc, isZone: isZone,
    blank: blank, village: village, grownVillage: grownVillage, tick: tick, paint: paint,
    canPaint: canPaint, inspect: inspect, people: people, dateStr: dateStr, moneyStr: moneyStr,
    cloneWorld: cloneWorld, applyEdits: applyEdits, dump: dump, load: load, toolCost: toolCost,
    roadAdj: roadAdj, services: services, census: census, bfsRoad: bfsRoad
  };
})(typeof window !== 'undefined' ? window : globalThis);
