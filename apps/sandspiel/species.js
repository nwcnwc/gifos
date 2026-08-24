/*
 * Classic rewrite of MaxBittker/sandspiel crate/src/species.rs + Universe tick.
 * Wind / blow_wind skipped. Fire still rises randomly. Dust/stone/ice skip
 * the pressure>120 branches. Grid default 180×120, column-major x*height+y.
 */
(function (root) {
  'use strict';

  var SP = {
    Empty: 0, Wall: 1, Sand: 2, Water: 3, Gas: 4, Cloner: 5, Fire: 6,
    Wood: 7, Lava: 8, Ice: 9, Plant: 11, Acid: 12, Stone: 13, Dust: 14,
    Mite: 15, Oil: 16, Rocket: 17, Fungus: 18, Seed: 19
  };

  var PAL = [];
  PAL[0] = [26, 20, 16];
  PAL[1] = [74, 64, 56];
  PAL[2] = [230, 196, 110];
  PAL[3] = [74, 144, 217];
  PAL[4] = [200, 208, 216];
  PAL[5] = [196, 94, 200];
  PAL[6] = [255, 106, 42];
  PAL[7] = [138, 90, 50];
  PAL[8] = [224, 64, 32];
  PAL[9] = [184, 228, 240];
  PAL[11] = [76, 175, 80];
  PAL[12] = [184, 224, 64];
  PAL[13] = [138, 134, 128];
  PAL[14] = [210, 180, 140];
  PAL[15] = [232, 120, 160];
  PAL[16] = [58, 32, 80];
  PAL[17] = [240, 240, 234];
  PAL[18] = [123, 74, 160];
  PAL[19] = [200, 216, 74];

  var LABELS = [
    { id: SP.Empty, name: 'Erase' },
    { id: SP.Sand, name: 'Sand' },
    { id: SP.Water, name: 'Water' },
    { id: SP.Wall, name: 'Wall' },
    { id: SP.Plant, name: 'Plant' },
    { id: SP.Fire, name: 'Fire' },
    { id: SP.Wood, name: 'Wood' },
    { id: SP.Lava, name: 'Lava' },
    { id: SP.Ice, name: 'Ice' },
    { id: SP.Gas, name: 'Gas' },
    { id: SP.Oil, name: 'Oil' },
    { id: SP.Acid, name: 'Acid' },
    { id: SP.Stone, name: 'Stone' },
    { id: SP.Dust, name: 'Dust' },
    { id: SP.Seed, name: 'Seed' },
    { id: SP.Fungus, name: 'Fungus' },
    { id: SP.Mite, name: 'Mite' },
    { id: SP.Cloner, name: 'Cloner' },
    { id: SP.Rocket, name: 'Rocket' }
  ];

  var SIZE_MAP = [1, 3, 7, 19, 39];
  var WIDTH = 180, HEIGHT = 120, UNDO = 20;
  var THUMB_W = 48, THUMB_H = 27;
  var EMPTY = { species: 0, ra: 0, rb: 0, clock: 0 };

  function u8(n) { return n & 255; }
  function emptyCell() { return { species: 0, ra: 0, rb: 0, clock: 0 }; }
  function makeCell(species, ra, rb) {
    return {
      species: species | 0,
      ra: ra == null ? 120 : ra & 255,
      rb: rb == null ? 0 : rb & 255,
      clock: 0
    };
  }
  function adjRight(dx, dy) {
    if (dx === 0 && dy === 1) return [1, 1];
    if (dx === 1 && dy === 1) return [1, 0];
    if (dx === 1 && dy === 0) return [1, -1];
    if (dx === 1 && dy === -1) return [0, -1];
    if (dx === 0 && dy === -1) return [-1, -1];
    if (dx === -1 && dy === -1) return [-1, 0];
    if (dx === -1 && dy === 0) return [-1, 1];
    if (dx === -1 && dy === 1) return [0, 1];
    return [0, 0];
  }
  function adjLeft(dx, dy) {
    if (dx === 0 && dy === 1) return [-1, 1];
    if (dx === 1 && dy === 1) return [0, 1];
    if (dx === 1 && dy === 0) return [1, 1];
    if (dx === 1 && dy === -1) return [1, 0];
    if (dx === 0 && dy === -1) return [1, -1];
    if (dx === -1 && dy === -1) return [0, -1];
    if (dx === -1 && dy === 0) return [-1, -1];
    if (dx === -1 && dy === 1) return [-1, 0];
    return [0, 0];
  }
  function joinDyDx(dx, dy) { return ((dx + 1) * 3) + (dy + 1); }
  function splitDyDx(s) {
    s = s | 0;
    return [(s / 3 | 0) - 1, (s % 3) - 1];
  }
  function genAbs(g) {
    var m = g % 127;
    var d = m - 60;
    return d < 0 ? -d : d;
  }

  function bytesToB64(u8a) {
    var s = '', i, chunk = 0x8000;
    for (i = 0; i < u8a.length; i += chunk) {
      s += String.fromCharCode.apply(null, u8a.subarray(i, Math.min(i + chunk, u8a.length)));
    }
    return btoa(s);
  }
  function b64ToBytes(b64) {
    var s = atob(b64);
    var out = new Uint8Array(s.length), i;
    for (i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function packCells(cells) {
    var n = cells.length, bytes = new Uint8Array(n * 3), i, c;
    for (i = 0; i < n; i++) {
      c = cells[i];
      bytes[i * 3] = c.species;
      bytes[i * 3 + 1] = c.ra;
      bytes[i * 3 + 2] = c.rb;
    }
    return bytesToB64(bytes);
  }
  function unpackCells(b64, n) {
    var bytes = b64ToBytes(b64);
    var cells = new Array(n), i, o;
    for (i = 0; i < n; i++) {
      o = i * 3;
      cells[i] = {
        species: bytes[o] || 0,
        ra: bytes[o + 1] || 0,
        rb: bytes[o + 2] || 0,
        clock: 0
      };
    }
    return cells;
  }

  function SandApi(uni) {
    this.universe = uni;
    this.x = 0;
    this.y = 0;
  }
  SandApi.prototype.get = function (dx, dy) {
    var nx = this.x + dx, ny = this.y + dy, u = this.universe;
    if (nx < 0 || nx > u.width - 1 || ny < 0 || ny > u.height - 1) {
      return { species: SP.Wall, ra: 0, rb: 0, clock: u.generation };
    }
    return u.cells[nx * u.height + ny];
  };
  SandApi.prototype.set = function (dx, dy, v) {
    var nx = this.x + dx, ny = this.y + dy, u = this.universe, i;
    if (nx < 0 || nx > u.width - 1 || ny < 0 || ny > u.height - 1) return;
    i = nx * u.height + ny;
    u.cells[i] = {
      species: v.species,
      ra: v.ra,
      rb: v.rb,
      clock: u8(u.generation + 1)
    };
  };
  SandApi.prototype.randInt = function (n) { return this.universe.randInt(n); };
  SandApi.prototype.onceIn = function (n) { return this.randInt(n) === 0; };
  SandApi.prototype.randDir = function () { return (this.randInt(1000) % 3) - 1; };
  SandApi.prototype.randDir2 = function () { return (this.randInt(1000) % 2) === 0 ? -1 : 1; };
  SandApi.prototype.randVec = function () {
    switch (this.randInt(2000) % 9) {
      case 0: return [1, 1];
      case 1: return [1, 0];
      case 2: return [1, -1];
      case 3: return [0, -1];
      case 4: return [-1, -1];
      case 5: return [-1, 0];
      case 6: return [-1, 1];
      case 7: return [0, 1];
      default: return [0, 0];
    }
  };
  SandApi.prototype.randVec8 = function () {
    switch (this.randInt(8)) {
      case 0: return [1, 1];
      case 1: return [1, 0];
      case 2: return [1, -1];
      case 3: return [0, -1];
      case 4: return [-1, -1];
      case 5: return [-1, 0];
      case 6: return [-1, 1];
      default: return [0, 1];
    }
  };
  SandApi.prototype.randFloat = function () { return this.universe.randFloat(); };
  SandApi.prototype.spawn = function (species) {
    return {
      species: species,
      ra: u8(100 + ((this.randFloat() * 50) | 0)),
      rb: 0,
      clock: 0
    };
  };

  function updateSand(cell, api) {
    var dx = api.randDir2();
    var nbr = api.get(0, 1);
    if (nbr.species === SP.Empty) {
      api.set(0, 0, EMPTY);
      api.set(0, 1, cell);
    } else if (api.get(dx, 1).species === SP.Empty) {
      api.set(0, 0, EMPTY);
      api.set(dx, 1, cell);
    } else if (nbr.species === SP.Water || nbr.species === SP.Gas ||
               nbr.species === SP.Oil || nbr.species === SP.Acid) {
      api.set(0, 0, nbr);
      api.set(0, 1, cell);
    } else {
      api.set(0, 0, cell);
    }
  }

  function updateDust(cell, api) {
    var dx = api.randDir();
    var nbr = api.get(0, 1);
    if (nbr.species === SP.Empty) {
      api.set(0, 0, EMPTY);
      api.set(0, 1, cell);
    } else if (nbr.species === SP.Water) {
      api.set(0, 0, nbr);
      api.set(0, 1, cell);
    } else if (api.get(dx, 1).species === SP.Empty) {
      api.set(0, 0, EMPTY);
      api.set(dx, 1, cell);
    } else {
      api.set(0, 0, cell);
    }
  }

  function updateStone(cell, api) {
    if (api.get(-1, -1).species === SP.Stone && api.get(1, -1).species === SP.Stone) return;
    var nbr = api.get(0, 1);
    var ns = nbr.species;
    if (ns === SP.Empty) {
      api.set(0, 0, EMPTY);
      api.set(0, 1, cell);
    } else if (ns === SP.Water || ns === SP.Gas || ns === SP.Oil || ns === SP.Acid) {
      api.set(0, 0, nbr);
      api.set(0, 1, cell);
    } else {
      api.set(0, 0, cell);
    }
  }

  function updateWater(cell, api) {
    var dx = api.randDir();
    var below = api.get(0, 1);
    var dx1 = api.get(dx, 1);
    if (below.species === SP.Empty || below.species === SP.Oil) {
      api.set(0, 0, below);
      var ra = cell.ra;
      if (api.onceIn(20)) ra = u8(100 + api.randInt(50));
      api.set(0, 1, { species: cell.species, ra: ra, rb: cell.rb, clock: cell.clock });
      return;
    }
    if (dx1.species === SP.Empty || dx1.species === SP.Oil) {
      api.set(0, 0, dx1);
      api.set(dx, 1, cell);
      return;
    }
    if (api.get(-dx, 1).species === SP.Empty) {
      api.set(0, 0, EMPTY);
      api.set(-dx, 1, cell);
      return;
    }
    var left = cell.ra % 2 === 0;
    dx = left ? 1 : -1;
    var dx0 = api.get(dx, 0);
    var dxd = api.get(dx * 2, 0);
    var spread;
    if (dx0.species === SP.Empty && dxd.species === SP.Empty) {
      api.set(0, 0, dxd);
      api.set(2 * dx, 0, { species: cell.species, ra: cell.ra, rb: 6, clock: cell.clock });
      spread = api.randVec8();
      var nbr = api.get(spread[0], spread[1]);
      if (nbr.species === SP.Water && nbr.ra % 2 !== cell.ra % 2) {
        api.set(spread[0], spread[1], { species: cell.species, ra: cell.ra, rb: cell.rb, clock: cell.clock });
      }
    } else if (dx0.species === SP.Empty || dx0.species === SP.Oil) {
      api.set(0, 0, dx0);
      api.set(dx, 0, { species: cell.species, ra: cell.ra, rb: 3, clock: cell.clock });
      spread = api.randVec8();
      nbr = api.get(spread[0], spread[1]);
      if (nbr.species === SP.Water && nbr.ra % 2 !== cell.ra % 2) {
        api.set(spread[0], spread[1], { species: cell.species, ra: cell.ra, rb: cell.rb, clock: cell.clock });
      }
    } else if (cell.rb === 0) {
      if (api.get(-dx, 0).species === SP.Empty) {
        api.set(0, 0, { species: cell.species, ra: u8(cell.ra + dx), rb: cell.rb, clock: cell.clock });
      }
    } else {
      api.set(0, 0, { species: cell.species, ra: cell.ra, rb: u8(cell.rb - 1), clock: cell.clock });
    }
  }

  function updateOil(cell, api) {
    var rb = cell.rb;
    var v = api.randVec();
    var dx = v[0], dy = v[1];
    var newCell = cell;
    var nbr = api.get(dx, dy);
    if ((rb === 0 && nbr.species === SP.Fire) || nbr.species === SP.Lava ||
        (nbr.species === SP.Oil && nbr.rb > 1 && nbr.rb < 20)) {
      newCell = { species: SP.Oil, ra: cell.ra, rb: 50, clock: 0 };
    }
    if (rb > 1) {
      newCell = { species: SP.Oil, ra: cell.ra, rb: rb - 1, clock: 0 };
      if (rb % 4 !== 0 && nbr.species === SP.Empty) {
        api.set(dx, dy, { species: SP.Fire, ra: u8(20 + api.randInt(30)), rb: 0, clock: 0 });
      }
      if (nbr.species === SP.Water) {
        newCell = { species: SP.Oil, ra: 50, rb: 0, clock: 0 };
      }
    } else if (rb === 1) {
      api.set(0, 0, { species: SP.Empty, ra: cell.ra, rb: 90, clock: 0 });
      return;
    }
    if (api.get(0, 1).species === SP.Empty) {
      api.set(0, 0, EMPTY); api.set(0, 1, newCell);
    } else if (api.get(dx, 1).species === SP.Empty) {
      api.set(0, 0, EMPTY); api.set(dx, 1, newCell);
    } else if (api.get(-dx, 1).species === SP.Empty) {
      api.set(0, 0, EMPTY); api.set(-dx, 1, newCell);
    } else if (api.get(dx, 0).species === SP.Empty) {
      api.set(0, 0, EMPTY); api.set(dx, 0, newCell);
    } else if (api.get(-dx, 0).species === SP.Empty) {
      api.set(0, 0, EMPTY); api.set(-dx, 0, newCell);
    } else {
      api.set(0, 0, newCell);
    }
  }

  function updateGas(cell, api) {
    var v = api.randVec();
    var dx = v[0], dy = v[1];
    var nbr = api.get(dx, dy);
    if (cell.rb === 0) api.set(0, 0, { species: cell.species, ra: cell.ra, rb: 5, clock: cell.clock });
    if (nbr.species === SP.Empty) {
      if (cell.rb < 3) {
        api.set(0, 0, EMPTY);
        api.set(dx, dy, cell);
      } else {
        api.set(0, 0, { species: cell.species, ra: cell.ra, rb: 1, clock: cell.clock });
        api.set(dx, dy, { species: cell.species, ra: cell.ra, rb: cell.rb - 1, clock: cell.clock });
      }
    } else if ((dx !== 0 || dy !== 0) && nbr.species === SP.Gas && nbr.rb < 4) {
      api.set(0, 0, EMPTY);
      api.set(dx, dy, { species: cell.species, ra: cell.ra, rb: nbr.rb + cell.rb, clock: cell.clock });
    }
  }

  function updateCloner(cell, api) {
    var clone = cell.rb;
    var g = api.universe.generation;
    var dxs = [-1, 0, 1], dys = [-1, 0, 1], i, j, dx, dy, ns;
    for (i = 0; i < 3; i++) {
      for (j = 0; j < 3; j++) {
        dx = dxs[i]; dy = dys[j];
        if (cell.rb === 0) {
          ns = api.get(dx, dy).species;
          if (ns !== SP.Empty && ns !== SP.Cloner && ns !== SP.Wall) {
            clone = ns;
            api.set(0, 0, { species: cell.species, ra: 200, rb: clone, clock: 0 });
            return;
          }
        } else if (api.randInt(100) > 90 && api.get(dx, dy).species === SP.Empty) {
          api.set(dx, dy, {
            species: clone,
            ra: u8(80 + api.randInt(30) + genAbs(g)),
            rb: 0,
            clock: 0
          });
          return;
        }
      }
    }
  }

  function updateRocket(cell, api) {
    if (cell.rb === 0) {
      api.set(0, 0, { species: cell.species, ra: 0, rb: 100, clock: cell.clock });
      return;
    }
    var clone = cell.rb !== 100 ? cell.rb : SP.Sand;
    var sv = api.randVec();
    var sample = api.get(sv[0], sv[1]);
    if (cell.rb === 100 && sample.species !== SP.Empty && sample.species !== SP.Rocket &&
        sample.species !== SP.Wall && sample.species !== SP.Cloner) {
      api.set(0, 0, { species: cell.species, ra: 1, rb: sample.species, clock: cell.clock });
      return;
    }
    var ra = cell.ra;
    if (ra === 0) {
      var dx = api.randDir();
      var nbr = api.get(0, 1);
      if (nbr.species === SP.Empty) {
        api.set(0, 0, EMPTY); api.set(0, 1, cell);
      } else if (api.get(dx, 1).species === SP.Empty) {
        api.set(0, 0, EMPTY); api.set(dx, 1, cell);
      } else if (nbr.species === SP.Water || nbr.species === SP.Gas ||
                 nbr.species === SP.Oil || nbr.species === SP.Acid) {
        api.set(0, 0, nbr); api.set(0, 1, cell);
      } else {
        api.set(0, 0, cell);
      }
    } else if (ra === 1) {
      api.set(0, 0, { species: cell.species, ra: 2, rb: cell.rb, clock: cell.clock });
    } else if (ra === 2) {
      var d = api.randVec8();
      dx = d[0]; var dy = d[1];
      nbr = api.get(dx, dy);
      if (nbr.species !== SP.Empty) { dx = -dx; dy = -dy; }
      api.set(0, 0, { species: cell.species, ra: 100 + joinDyDx(dx, dy), rb: cell.rb, clock: cell.clock });
    } else if (ra > 50) {
      d = splitDyDx(cell.ra - 100);
      dx = d[0]; dy = d[1];
      nbr = api.get(dx, dy * 2);
      if (nbr.species === SP.Empty || nbr.species === SP.Fire || nbr.species === SP.Rocket) {
        api.set(0, 0, api.spawn(clone));
        api.set(0, dy, api.spawn(clone));
        var turn = api.randInt(100) % 5;
        var nd = turn === 0 ? adjLeft(dx, dy) : turn === 1 ? adjRight(dx, dy) : [dx, dy];
        api.set(dx, dy * 2, {
          species: cell.species,
          ra: 100 + joinDyDx(nd[0], nd[1]),
          rb: cell.rb,
          clock: cell.clock
        });
      } else {
        api.set(0, 0, EMPTY);
      }
    }
  }

  function updateFire(cell, api) {
    var ra = cell.ra;
    var degraded = {
      species: cell.species,
      ra: u8(ra - (2 + api.randDir())),
      rb: cell.rb,
      clock: cell.clock
    };
    var dx = api.randDir();
    var rise = api.randInt(8);
    var dy = rise < 5 ? -1 : rise < 7 ? 0 : 1;
    var nbr = api.get(dx, dy);
    if (nbr.species === SP.Gas || nbr.species === SP.Dust) {
      api.set(dx, dy, { species: SP.Fire, ra: u8(150 + (dx + dy) * 10), rb: 0, clock: 0 });
    }
    if (ra < 5 || nbr.species === SP.Water) {
      api.set(0, 0, EMPTY);
    } else if (nbr.species === SP.Empty) {
      api.set(0, 0, EMPTY);
      api.set(dx, dy, degraded);
    } else {
      api.set(0, 0, degraded);
    }
  }

  function updateLava(cell, api) {
    var v = api.randVec();
    var dx = v[0], dy = v[1];
    var sample = api.get(dx, dy);
    if (sample.species === SP.Gas || sample.species === SP.Dust) {
      api.set(dx, dy, { species: SP.Fire, ra: u8(150 + (dx + dy) * 10), rb: 0, clock: 0 });
    }
    if (sample.species === SP.Water) {
      api.set(0, 0, { species: SP.Stone, ra: u8(150 + (dx + dy) * 10), rb: 0, clock: 0 });
      api.set(dx, dy, EMPTY);
    } else if (api.get(0, 1).species === SP.Empty) {
      api.set(0, 0, EMPTY); api.set(0, 1, cell);
    } else if (api.get(dx, 1).species === SP.Empty) {
      api.set(0, 0, EMPTY); api.set(dx, 1, cell);
    } else if (api.get(dx, 0).species === SP.Empty) {
      api.set(0, 0, EMPTY); api.set(dx, 0, cell);
    } else {
      api.set(0, 0, cell);
    }
  }

  function updateWood(cell, api) {
    var rb = cell.rb;
    var v = api.randVec();
    var dx = v[0], dy = v[1];
    var ns = api.get(dx, dy).species;
    if ((rb === 0 && ns === SP.Fire) || ns === SP.Lava) {
      api.set(0, 0, { species: SP.Wood, ra: cell.ra, rb: 90, clock: 0 });
    }
    if (rb > 1) {
      api.set(0, 0, { species: SP.Wood, ra: cell.ra, rb: rb - 1, clock: 0 });
      if (rb % 4 === 0 && ns === SP.Empty) {
        api.set(dx, dy, { species: SP.Fire, ra: u8(30 + api.randInt(60)), rb: 0, clock: 0 });
      }
      if (ns === SP.Water) {
        api.set(0, 0, { species: SP.Wood, ra: 50, rb: 0, clock: 0 });
      }
    } else if (rb === 1) {
      api.set(0, 0, { species: SP.Empty, ra: cell.ra, rb: 90, clock: 0 });
    }
  }

  function updateIce(cell, api) {
    var v = api.randVec();
    var dx = v[0], dy = v[1];
    var i = api.randInt(100);
    var ns = api.get(dx, dy).species;
    if (ns === SP.Fire || ns === SP.Lava) {
      api.set(0, 0, { species: SP.Water, ra: cell.ra, rb: cell.rb, clock: 0 });
    } else if (ns === SP.Water && i < 7) {
      api.set(dx, dy, { species: SP.Ice, ra: cell.ra, rb: cell.rb, clock: 0 });
    }
  }

  function updatePlant(cell, api) {
    var rb = cell.rb;
    var i = api.randInt(100);
    var v = api.randVec();
    var dx = v[0], dy = v[1];
    var ns = api.get(dx, dy).species;
    if ((rb === 0 && ns === SP.Fire) || ns === SP.Lava) {
      api.set(0, 0, { species: SP.Plant, ra: cell.ra, rb: 20, clock: 0 });
    }
    if (ns === SP.Wood) {
      v = api.randVec();
      var drift = (i % 15) - 7;
      if (api.get(v[0], v[1]).species === SP.Empty) {
        api.set(v[0], v[1], { species: SP.Plant, ra: u8(cell.ra + drift), rb: 0, clock: 0 });
      }
    }
    var behind = api.get(-dx, dy).species;
    if (api.randInt(100) > 80 &&
        (ns === SP.Water || (ns === SP.Fungus && (behind === SP.Empty || behind === SP.Water || behind === SP.Fungus)))) {
      i = api.randInt(100);
      drift = (i % 15) - 7;
      api.set(dx, dy, { species: cell.species, ra: u8(cell.ra + drift), rb: 0, clock: cell.clock });
      api.set(-dx, dy, EMPTY);
    }
    if (rb > 1) {
      api.set(0, 0, { species: cell.species, ra: cell.ra, rb: rb - 1, clock: cell.clock });
      if (ns === SP.Empty) {
        api.set(dx, dy, { species: SP.Fire, ra: u8(20 + api.randInt(30)), rb: 0, clock: 0 });
      }
      if (ns === SP.Water) {
        api.set(0, 0, { species: cell.species, ra: 50, rb: 0, clock: cell.clock });
      }
    } else if (rb === 1) {
      api.set(0, 0, EMPTY);
    }
    var ra = cell.ra;
    if (ra > 50 && api.get(1, 1).species !== SP.Plant && api.get(-1, 1).species !== SP.Plant) {
      if (api.get(0, 1).species === SP.Empty) {
        i = (api.randFloat() * api.randFloat() * 100) | 0;
        var dec = api.randInt(30) - 20;
        if ((i + ra) > 165) {
          api.set(0, 1, { species: cell.species, ra: u8(ra + dec), rb: cell.rb, clock: cell.clock });
        }
      } else {
        api.set(0, 0, { species: cell.species, ra: u8(ra - 1), rb: cell.rb, clock: cell.clock });
      }
    }
  }

  function updateSeed(cell, api) {
    var rb = cell.rb, ra = cell.ra;
    var v = api.randVec();
    var dx = v[0], dy = v[1];
    var ns = api.get(dx, dy).species;
    if (ns === SP.Fire || ns === SP.Lava) {
      api.set(0, 0, { species: SP.Fire, ra: 5, rb: 0, clock: 0 });
      return;
    }
    if (rb === 0) {
      var dxf = api.randDir();
      var below = api.get(dxf, 1).species;
      if (below === SP.Sand || below === SP.Plant || below === SP.Fungus) {
        api.set(0, 0, { species: cell.species, ra: cell.ra, rb: u8(api.randInt(253) + 1), clock: cell.clock });
        return;
      }
      var nbr = api.get(0, 1);
      if (nbr.species === SP.Empty) {
        api.set(0, 0, EMPTY); api.set(0, 1, cell);
      } else if (api.get(dxf, 1).species === SP.Empty) {
        api.set(0, 0, EMPTY); api.set(dxf, 1, cell);
      } else if (nbr.species === SP.Water || nbr.species === SP.Gas ||
                 nbr.species === SP.Oil || nbr.species === SP.Acid) {
        api.set(0, 0, nbr); api.set(0, 1, cell);
      } else {
        api.set(0, 0, cell);
      }
    } else if (ra > 60) {
      var dxr = api.randDir();
      if (api.randInt(100) > 75) {
        var up = api.get(dxr, -1).species;
        if ((up === SP.Empty || up === SP.Sand || up === SP.Seed) &&
            api.get(1, -1).species !== SP.Plant && api.get(-1, -1).species !== SP.Plant) {
          api.set(dxr, -1, { species: cell.species, ra: u8(ra - api.randInt(10)), rb: cell.rb, clock: cell.clock });
          api.set(0, 0, { species: SP.Plant, ra: u8(80 + api.randInt(30)), rb: 0, clock: 0 });
        } else {
          api.set(0, 0, EMPTY);
        }
      }
    } else if (ra > 40) {
      var md = api.randVec();
      var ld = adjLeft(md[0], md[1]);
      var rd = adjRight(md[0], md[1]);
      var mid = api.get(md[0], md[1]).species;
      if ((mid === SP.Empty || mid === SP.Plant) &&
          (api.get(ld[0], ld[1]).species === SP.Empty || api.get(rd[0], rd[1]).species === SP.Empty)) {
        var ii = (api.randFloat() * api.randFloat() * 100) | 0;
        var dec = 9 - api.randInt(3);
        if ((ii + ra) > 100) {
          api.set(md[0], md[1], { species: cell.species, ra: u8(ra - dec), rb: cell.rb, clock: cell.clock });
        }
      }
    } else if (ns === SP.Water) {
      api.set(dx, dy, api.spawn(SP.Seed));
    }
  }

  function updateFungus(cell, api) {
    var rb = cell.rb;
    var v = api.randVec();
    var dx = v[0], dy = v[1];
    var ns = api.get(dx, dy).species;
    if ((rb === 0 && ns === SP.Fire) || ns === SP.Lava) {
      api.set(0, 0, { species: SP.Fungus, ra: cell.ra, rb: 10, clock: 0 });
    }
    var i = api.randInt(100);
    if (ns !== SP.Empty && ns !== SP.Fungus && ns !== SP.Fire && ns !== SP.Ice) {
      v = api.randVec();
      var drift = (i % 15) - 7;
      if (api.get(v[0], v[1]).species === SP.Empty) {
        api.set(v[0], v[1], { species: SP.Fungus, ra: u8(cell.ra + drift), rb: 0, clock: 0 });
      }
    }
    if (i > 9 && ns === SP.Wood && api.get(-dx, dy).species === SP.Wood &&
        api.get(dx, -dy).species === SP.Wood && api.get(dx, dy).ra % 4 !== 0) {
      i = api.randInt(100);
      drift = (i % 15) - 7;
      api.set(dx, dy, { species: cell.species, ra: u8(cell.ra + drift), rb: 0, clock: cell.clock });
    }
    if (rb > 1) {
      api.set(0, 0, { species: cell.species, ra: cell.ra, rb: rb - 1, clock: cell.clock });
      if (ns === SP.Empty) {
        api.set(dx, dy, { species: SP.Fire, ra: u8(10 + api.randInt(10)), rb: 0, clock: 0 });
      }
      if (ns === SP.Water) {
        api.set(0, 0, { species: cell.species, ra: 50, rb: 0, clock: cell.clock });
      }
    } else if (rb === 1) {
      api.set(0, 0, EMPTY);
    }
    var ra = cell.ra;
    if (ra > 120) {
      var md = api.randVec();
      var ld = adjLeft(md[0], md[1]);
      var rd = adjRight(md[0], md[1]);
      if (api.get(md[0], md[1]).species === SP.Empty &&
          api.get(ld[0], ld[1]).species !== SP.Fungus &&
          api.get(rd[0], rd[1]).species !== SP.Fungus) {
        i = (api.randFloat() * api.randFloat() * 100) | 0;
        var dec = 15 - api.randInt(20);
        if ((i + ra) > 165) {
          api.set(md[0], md[1], { species: cell.species, ra: u8(ra - dec), rb: cell.rb, clock: cell.clock });
        }
      }
    }
  }

  function updateAcid(cell, api) {
    var dx = api.randDir();
    var degraded = { species: cell.species, ra: u8(cell.ra - 60), rb: cell.rb, clock: cell.clock };
    if (degraded.ra < 80) degraded = EMPTY;
    if (api.get(0, 1).species === SP.Empty) {
      api.set(0, 0, EMPTY); api.set(0, 1, cell);
    } else if (api.get(dx, 0).species === SP.Empty) {
      api.set(0, 0, EMPTY); api.set(dx, 0, cell);
    } else if (api.get(-dx, 0).species === SP.Empty) {
      api.set(0, 0, EMPTY); api.set(-dx, 0, cell);
    } else if (api.get(0, 1).species !== SP.Wall && api.get(0, 1).species !== SP.Acid) {
      api.set(0, 0, EMPTY); api.set(0, 1, degraded);
    } else if (api.get(dx, 0).species !== SP.Wall && api.get(dx, 0).species !== SP.Acid) {
      api.set(0, 0, EMPTY); api.set(dx, 0, degraded);
    } else if (api.get(-dx, 0).species !== SP.Wall && api.get(-dx, 0).species !== SP.Acid) {
      api.set(0, 0, EMPTY); api.set(-dx, 0, degraded);
    } else if (api.get(0, -1).species !== SP.Wall && api.get(0, -1).species !== SP.Acid &&
               api.get(0, -1).species !== SP.Empty) {
      api.set(0, 0, EMPTY); api.set(0, -1, degraded);
    } else {
      api.set(0, 0, cell);
    }
  }

  function updateMite(cell, api) {
    var i = api.randInt(100);
    var dx = 0;
    if (cell.ra < 20) dx = (cell.ra | 0) - 1;
    var dy = 1;
    var mite = { species: cell.species, ra: cell.ra, rb: cell.rb, clock: cell.clock };
    if (cell.rb > 10) {
      mite.rb = mite.rb > 0 ? mite.rb - 1 : 0;
      dy = -1;
    } else if (cell.rb > 1) {
      mite.rb = mite.rb > 0 ? mite.rb - 1 : 0;
    } else {
      dx = 0;
    }
    var nbr = api.get(dx, dy);
    var sx = (i % 3) - 1;
    i = api.randInt(1000);
    var sy = (i % 3) - 1;
    var sample = api.get(sx, sy).species;
    if (sample === SP.Fire || sample === SP.Lava || sample === SP.Water || sample === SP.Oil) {
      api.set(0, 0, EMPTY);
      return;
    }
    if ((sample === SP.Plant || sample === SP.Wood || sample === SP.Seed) && i > 800) {
      api.set(0, 0, EMPTY);
      api.set(sx, sy, cell);
      return;
    }
    if (sample === SP.Dust) {
      api.set(sx, sy, i > 800 ? cell : EMPTY);
    }
    if (nbr.species === SP.Empty) {
      api.set(0, 0, EMPTY);
      api.set(dx, dy, mite);
    } else if (dy === 1 && i > 800) {
      i = api.randInt(100);
      var ndx = (i % 3) - 1;
      if (i < 6) ndx = dx;
      mite.ra = u8(1 + ndx);
      mite.rb = u8(10 + (i % 10));
      api.set(0, 0, mite);
    } else if (api.get(-1, 0).species === SP.Mite && api.get(1, 0).species === SP.Mite &&
               api.get(0, -1).species === SP.Mite) {
      api.set(0, 0, EMPTY);
    } else if (api.get(0, 1).species === SP.Ice) {
      if (api.get(dx, 0).species === SP.Empty) {
        api.set(0, 0, EMPTY);
        api.set(dx, 0, mite);
      }
    } else {
      api.set(0, 0, mite);
    }
  }

  var UPDATE = [];
  UPDATE[SP.Sand] = updateSand;
  UPDATE[SP.Dust] = updateDust;
  UPDATE[SP.Water] = updateWater;
  UPDATE[SP.Stone] = updateStone;
  UPDATE[SP.Gas] = updateGas;
  UPDATE[SP.Cloner] = updateCloner;
  UPDATE[SP.Rocket] = updateRocket;
  UPDATE[SP.Fire] = updateFire;
  UPDATE[SP.Wood] = updateWood;
  UPDATE[SP.Lava] = updateLava;
  UPDATE[SP.Ice] = updateIce;
  UPDATE[SP.Plant] = updatePlant;
  UPDATE[SP.Acid] = updateAcid;
  UPDATE[SP.Mite] = updateMite;
  UPDATE[SP.Oil] = updateOil;
  UPDATE[SP.Fungus] = updateFungus;
  UPDATE[SP.Seed] = updateSeed;

  function Universe(width, height) {
    this.width = width || WIDTH;
    this.height = height || HEIGHT;
    var n = this.width * this.height, i;
    this.cells = new Array(n);
    for (i = 0; i < n; i++) this.cells[i] = emptyCell();
    this.undo = [];
    this.generation = 0;
    this.rng = 0x734f6b89;
    this._api = new SandApi(this);
  }
  Universe.prototype.index = function (x, y) { return x * this.height + y; };
  Universe.prototype.getCell = function (x, y) { return this.cells[this.index(x, y)]; };
  Universe.prototype.setCell = function (x, y, cell) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.cells[this.index(x, y)] = {
      species: cell.species, ra: cell.ra, rb: cell.rb, clock: cell.clock || 0
    };
  };
  Universe.prototype.randInt = function (n) {
    n = n | 0;
    if (n <= 1) return 0;
    var x = this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return (x >>> 0) % n;
  };
  Universe.prototype.randFloat = function () {
    this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
    return (this.rng >>> 0) / 4294967296;
  };
  Universe.prototype.reset = function () {
    var i;
    for (i = 0; i < this.cells.length; i++) this.cells[i] = emptyCell();
  };
  Universe.prototype.tick = function () {
    var w = this.width, h = this.height, api = this._api, x, y, scanx, cell, fn;
    this.generation = u8(this.generation + 1);
    for (x = 0; x < w; x++) {
      scanx = (this.generation % 2 === 0) ? w - (1 + x) : x;
      for (y = 0; y < h; y++) {
        cell = this.cells[scanx * h + y];
        if (u8(cell.clock - this.generation) === 1) continue;
        fn = UPDATE[cell.species];
        if (!fn) continue;
        api.x = scanx;
        api.y = y;
        fn(cell, api);
      }
    }
    this.generation = u8(this.generation + 1);
  };
  Universe.prototype.paint = function (x, y, size, species) {
    var radius = size / 2;
    var floor = (radius + 1) | 0;
    var ciel = (radius + 1.5) | 0;
    var dx, dy, px, py, i, ra;
    for (dx = -floor; dx < ciel; dx++) {
      for (dy = -floor; dy < ciel; dy++) {
        if ((dx * dx + dy * dy) > radius * radius) continue;
        px = x + dx;
        py = y + dy;
        if (px < 0 || px > this.width - 1 || py < 0 || py > this.height - 1) continue;
        i = this.index(px, py);
        if (this.cells[i].species === SP.Empty || species === SP.Empty) {
          ra = u8(60 + size + ((this.randFloat() * 30) | 0) + genAbs(this.generation));
          this.cells[i] = { species: species, ra: ra, rb: 0, clock: this.generation };
        }
      }
    }
  };
  Universe.prototype.pushUndo = function () {
    var copy = new Array(this.cells.length), i, c;
    for (i = 0; i < this.cells.length; i++) {
      c = this.cells[i];
      copy[i] = { species: c.species, ra: c.ra, rb: c.rb, clock: c.clock };
    }
    this.undo.unshift(copy);
    if (this.undo.length > UNDO) this.undo.length = UNDO;
  };
  Universe.prototype.popUndo = function () {
    var old = this.undo.shift();
    if (old) this.cells = old;
  };
  Universe.prototype.pack = function () { return packCells(this.cells); };
  Universe.prototype.loadPacked = function (w, h, packed) {
    var cells = unpackCells(packed, (w | 0) * (h | 0));
    if (w === this.width && h === this.height && cells.length === this.cells.length) {
      this.cells = cells;
      return;
    }
    this.reset();
    var x, y, sx, sy, src;
    for (x = 0; x < this.width; x++) {
      for (y = 0; y < this.height; y++) {
        sx = w ? Math.min(w - 1, (x * w / this.width) | 0) : 0;
        sy = h ? Math.min(h - 1, (y * h / this.height) | 0) : 0;
        src = cells[sx * h + sy] || EMPTY;
        this.cells[this.index(x, y)] = {
          species: src.species, ra: src.ra, rb: src.rb, clock: 0
        };
      }
    }
  };
  Universe.prototype.thumb = function () {
    var tw = THUMB_W, th = THUMB_H, bytes = new Uint8Array(tw * th);
    var x, y, sx, sy;
    for (y = 0; y < th; y++) {
      for (x = 0; x < tw; x++) {
        sx = Math.min(this.width - 1, (x * this.width / tw) | 0);
        sy = Math.min(this.height - 1, (y * this.height / th) | 0);
        bytes[y * tw + x] = this.cells[this.index(sx, sy)].species;
      }
    }
    return bytesToB64(bytes);
  };

  function paintThumb(canvas, b64) {
    if (!canvas || !b64) return;
    var bytes = b64ToBytes(b64);
    var ctx = canvas.getContext('2d');
    var img = ctx.createImageData(THUMB_W, THUMB_H);
    var i, s, p, o;
    for (i = 0; i < THUMB_W * THUMB_H; i++) {
      s = bytes[i] || 0;
      p = PAL[s] || PAL[0];
      o = i * 4;
      img.data[o] = p[0]; img.data[o + 1] = p[1]; img.data[o + 2] = p[2]; img.data[o + 3] = 255;
    }
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    ctx.putImageData(img, 0, 0);
  }

  root.Sandspiel = {
    Species: SP,
    PALETTE: PAL,
    LABELS: LABELS,
    SIZE_MAP: SIZE_MAP,
    WIDTH: WIDTH,
    HEIGHT: HEIGHT,
    THUMB_W: THUMB_W,
    THUMB_H: THUMB_H,
    UNDO: UNDO,
    EMPTY: EMPTY,
    Universe: Universe,
    makeCell: makeCell,
    packCells: packCells,
    unpackCells: unpackCells,
    paintThumb: paintThumb
  };
})(window);
