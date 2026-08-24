/*
 * Sandspiel universe tick, compiled to wasm32 (clang -c, no libc).
 * Faithful C of apps/sandspiel/species.js — same species ids, same
 * 180×120 column-major grid, same LCG. Wind stays behind.
 *
 * Cells live at a fixed offset in the imported linear memory so the
 * object file stays tiny (no BSS blob). JS instantiates with
 * env.__linear_memory / __stack_pointer / __indirect_function_table.
 */
typedef unsigned char u8;
typedef unsigned int u32;

#define WIDTH 180
#define HEIGHT 120
#define CELL_COUNT (WIDTH * HEIGHT)
#define CELLS_OFF 65536

enum {
  SP_Empty = 0, SP_Wall = 1, SP_Sand = 2, SP_Water = 3, SP_Gas = 4,
  SP_Cloner = 5, SP_Fire = 6, SP_Wood = 7, SP_Lava = 8, SP_Ice = 9,
  SP_Plant = 11, SP_Acid = 12, SP_Stone = 13, SP_Dust = 14, SP_Mite = 15,
  SP_Oil = 16, SP_Rocket = 17, SP_Fungus = 18, SP_Seed = 19
};

typedef struct { u8 species, ra, rb, clock; } Cell;

static u8 generation;
static u32 rng = 0x734f6b89u;
static int ax, ay;

static Cell *grid(void) { return (Cell *)(unsigned)CELLS_OFF; }

static u8 wrap(int n) { return (u8)n; }

static u32 randu(void) {
  rng = rng * 1664525u + 1013904223u;
  return rng;
}
static int randInt(int n) {
  if (n <= 1) return 0;
  return (int)(randu() % (unsigned)n);
}
static int onceIn(int n) { return randInt(n) == 0; }
static int randDir(void) { return (randInt(1000) % 3) - 1; }
static int randDir2(void) { return (randInt(1000) % 2) == 0 ? -1 : 1; }
static float randFloat(void) { return randu() / 4294967296.f; }

static void randVec(int *dx, int *dy) {
  switch (randInt(2000) % 9) {
    case 0: *dx = 1; *dy = 1; break;
    case 1: *dx = 1; *dy = 0; break;
    case 2: *dx = 1; *dy = -1; break;
    case 3: *dx = 0; *dy = -1; break;
    case 4: *dx = -1; *dy = -1; break;
    case 5: *dx = -1; *dy = 0; break;
    case 6: *dx = -1; *dy = 1; break;
    case 7: *dx = 0; *dy = 1; break;
    default: *dx = 0; *dy = 0; break;
  }
}
static void randVec8(int *dx, int *dy) {
  switch (randInt(8)) {
    case 0: *dx = 1; *dy = 1; break;
    case 1: *dx = 1; *dy = 0; break;
    case 2: *dx = 1; *dy = -1; break;
    case 3: *dx = 0; *dy = -1; break;
    case 4: *dx = -1; *dy = -1; break;
    case 5: *dx = -1; *dy = 0; break;
    case 6: *dx = -1; *dy = 1; break;
    default: *dx = 0; *dy = 1; break;
  }
}

static Cell emptyCell(void) {
  Cell c; c.species = 0; c.ra = 0; c.rb = 0; c.clock = 0; return c;
}
static Cell spawn(u8 species) {
  Cell c;
  c.species = species;
  c.ra = wrap(100 + (int)(randFloat() * 50.f));
  c.rb = 0;
  c.clock = 0;
  return c;
}
static int genAbs(u8 g) {
  int m = g % 127;
  int d = m - 60;
  return d < 0 ? -d : d;
}

static Cell get(int dx, int dy) {
  int nx = ax + dx, ny = ay + dy;
  Cell wall;
  if (nx < 0 || nx > WIDTH - 1 || ny < 0 || ny > HEIGHT - 1) {
    wall.species = SP_Wall; wall.ra = 0; wall.rb = 0; wall.clock = generation;
    return wall;
  }
  return grid()[nx * HEIGHT + ny];
}
static void set(int dx, int dy, Cell v) {
  int nx = ax + dx, ny = ay + dy;
  if (nx < 0 || nx > WIDTH - 1 || ny < 0 || ny > HEIGHT - 1) return;
  v.clock = wrap((int)generation + 1);
  grid()[nx * HEIGHT + ny] = v;
}

static void adjRight(int dx, int dy, int *ox, int *oy) {
  if (dx == 0 && dy == 1) { *ox = 1; *oy = 1; }
  else if (dx == 1 && dy == 1) { *ox = 1; *oy = 0; }
  else if (dx == 1 && dy == 0) { *ox = 1; *oy = -1; }
  else if (dx == 1 && dy == -1) { *ox = 0; *oy = -1; }
  else if (dx == 0 && dy == -1) { *ox = -1; *oy = -1; }
  else if (dx == -1 && dy == -1) { *ox = -1; *oy = 0; }
  else if (dx == -1 && dy == 0) { *ox = -1; *oy = 1; }
  else if (dx == -1 && dy == 1) { *ox = 0; *oy = 1; }
  else { *ox = 0; *oy = 0; }
}
static void adjLeft(int dx, int dy, int *ox, int *oy) {
  if (dx == 0 && dy == 1) { *ox = -1; *oy = 1; }
  else if (dx == 1 && dy == 1) { *ox = 0; *oy = 1; }
  else if (dx == 1 && dy == 0) { *ox = 1; *oy = 1; }
  else if (dx == 1 && dy == -1) { *ox = 1; *oy = 0; }
  else if (dx == 0 && dy == -1) { *ox = 1; *oy = -1; }
  else if (dx == -1 && dy == -1) { *ox = 0; *oy = -1; }
  else if (dx == -1 && dy == 0) { *ox = -1; *oy = -1; }
  else if (dx == -1 && dy == 1) { *ox = -1; *oy = 0; }
  else { *ox = 0; *oy = 0; }
}
static int joinDyDx(int dx, int dy) { return ((dx + 1) * 3) + (dy + 1); }
static void splitDyDx(int s, int *dx, int *dy) {
  s = s | 0;
  *dx = (s / 3) - 1;
  *dy = (s % 3) - 1;
}

static void updateSand(Cell cell) {
  int dx = randDir2();
  Cell nbr = get(0, 1);
  if (nbr.species == SP_Empty) {
    set(0, 0, emptyCell());
    set(0, 1, cell);
  } else if (get(dx, 1).species == SP_Empty) {
    set(0, 0, emptyCell());
    set(dx, 1, cell);
  } else if (nbr.species == SP_Water || nbr.species == SP_Gas ||
             nbr.species == SP_Oil || nbr.species == SP_Acid) {
    set(0, 0, nbr);
    set(0, 1, cell);
  } else {
    set(0, 0, cell);
  }
}

static void updateDust(Cell cell) {
  int dx = randDir();
  Cell nbr = get(0, 1);
  if (nbr.species == SP_Empty) {
    set(0, 0, emptyCell());
    set(0, 1, cell);
  } else if (nbr.species == SP_Water) {
    set(0, 0, nbr);
    set(0, 1, cell);
  } else if (get(dx, 1).species == SP_Empty) {
    set(0, 0, emptyCell());
    set(dx, 1, cell);
  } else {
    set(0, 0, cell);
  }
}

static void updateStone(Cell cell) {
  if (get(-1, -1).species == SP_Stone && get(1, -1).species == SP_Stone) return;
  Cell nbr = get(0, 1);
  u8 ns = nbr.species;
  if (ns == SP_Empty) {
    set(0, 0, emptyCell());
    set(0, 1, cell);
  } else if (ns == SP_Water || ns == SP_Gas || ns == SP_Oil || ns == SP_Acid) {
    set(0, 0, nbr);
    set(0, 1, cell);
  } else {
    set(0, 0, cell);
  }
}

static void updateWater(Cell cell) {
  int dx = randDir();
  Cell below = get(0, 1);
  Cell dx1 = get(dx, 1);
  Cell out, nbr;
  int spreadx, spready, left;
  if (below.species == SP_Empty || below.species == SP_Oil) {
    set(0, 0, below);
    out = cell;
    if (onceIn(20)) out.ra = wrap(100 + randInt(50));
    set(0, 1, out);
    return;
  }
  if (dx1.species == SP_Empty || dx1.species == SP_Oil) {
    set(0, 0, dx1);
    set(dx, 1, cell);
    return;
  }
  if (get(-dx, 1).species == SP_Empty) {
    set(0, 0, emptyCell());
    set(-dx, 1, cell);
    return;
  }
  left = (cell.ra % 2) == 0;
  dx = left ? 1 : -1;
  {
    Cell dx0 = get(dx, 0);
    Cell dxd = get(dx * 2, 0);
    if (dx0.species == SP_Empty && dxd.species == SP_Empty) {
      set(0, 0, dxd);
      out = cell; out.rb = 6;
      set(2 * dx, 0, out);
      randVec8(&spreadx, &spready);
      nbr = get(spreadx, spready);
      if (nbr.species == SP_Water && (nbr.ra % 2) != (cell.ra % 2)) {
        set(spreadx, spready, cell);
      }
    } else if (dx0.species == SP_Empty || dx0.species == SP_Oil) {
      set(0, 0, dx0);
      out = cell; out.rb = 3;
      set(dx, 0, out);
      randVec8(&spreadx, &spready);
      nbr = get(spreadx, spready);
      if (nbr.species == SP_Water && (nbr.ra % 2) != (cell.ra % 2)) {
        set(spreadx, spready, cell);
      }
    } else if (cell.rb == 0) {
      if (get(-dx, 0).species == SP_Empty) {
        out = cell; out.ra = wrap((int)cell.ra + dx);
        set(0, 0, out);
      }
    } else {
      out = cell; out.rb = wrap((int)cell.rb - 1);
      set(0, 0, out);
    }
  }
}

static void updateOil(Cell cell) {
  int rb = cell.rb, dx, dy;
  Cell newCell = cell, nbr;
  randVec(&dx, &dy);
  nbr = get(dx, dy);
  if ((rb == 0 && nbr.species == SP_Fire) || nbr.species == SP_Lava ||
      (nbr.species == SP_Oil && nbr.rb > 1 && nbr.rb < 20)) {
    newCell.species = SP_Oil; newCell.ra = cell.ra; newCell.rb = 50; newCell.clock = 0;
  }
  if (rb > 1) {
    newCell.species = SP_Oil; newCell.ra = cell.ra; newCell.rb = (u8)(rb - 1); newCell.clock = 0;
    if (rb % 4 != 0 && nbr.species == SP_Empty) {
      Cell f; f.species = SP_Fire; f.ra = wrap(20 + randInt(30)); f.rb = 0; f.clock = 0;
      set(dx, dy, f);
    }
    if (nbr.species == SP_Water) {
      newCell.species = SP_Oil; newCell.ra = 50; newCell.rb = 0; newCell.clock = 0;
    }
  } else if (rb == 1) {
    Cell e; e.species = SP_Empty; e.ra = cell.ra; e.rb = 90; e.clock = 0;
    set(0, 0, e);
    return;
  }
  if (get(0, 1).species == SP_Empty) {
    set(0, 0, emptyCell()); set(0, 1, newCell);
  } else if (get(dx, 1).species == SP_Empty) {
    set(0, 0, emptyCell()); set(dx, 1, newCell);
  } else if (get(-dx, 1).species == SP_Empty) {
    set(0, 0, emptyCell()); set(-dx, 1, newCell);
  } else if (get(dx, 0).species == SP_Empty) {
    set(0, 0, emptyCell()); set(dx, 0, newCell);
  } else if (get(-dx, 0).species == SP_Empty) {
    set(0, 0, emptyCell()); set(-dx, 0, newCell);
  } else {
    set(0, 0, newCell);
  }
}

static void updateGas(Cell cell) {
  int dx, dy;
  Cell nbr, out;
  randVec(&dx, &dy);
  nbr = get(dx, dy);
  if (cell.rb == 0) {
    out = cell; out.rb = 5;
    set(0, 0, out);
  }
  if (nbr.species == SP_Empty) {
    if (cell.rb < 3) {
      set(0, 0, emptyCell());
      set(dx, dy, cell);
    } else {
      out = cell; out.rb = 1;
      set(0, 0, out);
      out = cell; out.rb = (u8)(cell.rb - 1);
      set(dx, dy, out);
    }
  } else if ((dx != 0 || dy != 0) && nbr.species == SP_Gas && nbr.rb < 4) {
    set(0, 0, emptyCell());
    out = cell; out.rb = (u8)(nbr.rb + cell.rb);
    set(dx, dy, out);
  }
}

static void updateCloner(Cell cell) {
  int clone = cell.rb, i, j, dx, dy;
  u8 ns;
  Cell out;
  for (i = -1; i <= 1; i++) {
    for (j = -1; j <= 1; j++) {
      dx = i; dy = j;
      if (cell.rb == 0) {
        ns = get(dx, dy).species;
        if (ns != SP_Empty && ns != SP_Cloner && ns != SP_Wall) {
          clone = ns;
          out.species = cell.species; out.ra = 200; out.rb = (u8)clone; out.clock = 0;
          set(0, 0, out);
          return;
        }
      } else if (randInt(100) > 90 && get(dx, dy).species == SP_Empty) {
        out.species = (u8)clone;
        out.ra = wrap(80 + randInt(30) + genAbs(generation));
        out.rb = 0; out.clock = 0;
        set(dx, dy, out);
        return;
      }
    }
  }
}

static void updateRocket(Cell cell) {
  int clone, dx, dy, ra, turn;
  Cell sample, nbr, out;
  int svx, svy, ndx, ndy;
  if (cell.rb == 0) {
    out = cell; out.ra = 0; out.rb = 100;
    set(0, 0, out);
    return;
  }
  clone = cell.rb != 100 ? cell.rb : SP_Sand;
  randVec(&svx, &svy);
  sample = get(svx, svy);
  if (cell.rb == 100 && sample.species != SP_Empty && sample.species != SP_Rocket &&
      sample.species != SP_Wall && sample.species != SP_Cloner) {
    out = cell; out.ra = 1; out.rb = sample.species;
    set(0, 0, out);
    return;
  }
  ra = cell.ra;
  if (ra == 0) {
    dx = randDir();
    nbr = get(0, 1);
    if (nbr.species == SP_Empty) {
      set(0, 0, emptyCell()); set(0, 1, cell);
    } else if (get(dx, 1).species == SP_Empty) {
      set(0, 0, emptyCell()); set(dx, 1, cell);
    } else if (nbr.species == SP_Water || nbr.species == SP_Gas ||
               nbr.species == SP_Oil || nbr.species == SP_Acid) {
      set(0, 0, nbr); set(0, 1, cell);
    } else {
      set(0, 0, cell);
    }
  } else if (ra == 1) {
    out = cell; out.ra = 2;
    set(0, 0, out);
  } else if (ra == 2) {
    randVec8(&dx, &dy);
    nbr = get(dx, dy);
    if (nbr.species != SP_Empty) { dx = -dx; dy = -dy; }
    out = cell; out.ra = wrap(100 + joinDyDx(dx, dy));
    set(0, 0, out);
  } else if (ra > 50) {
    splitDyDx(cell.ra - 100, &dx, &dy);
    nbr = get(dx, dy * 2);
    if (nbr.species == SP_Empty || nbr.species == SP_Fire || nbr.species == SP_Rocket) {
      set(0, 0, spawn((u8)clone));
      set(0, dy, spawn((u8)clone));
      turn = randInt(100) % 5;
      if (turn == 0) adjLeft(dx, dy, &ndx, &ndy);
      else if (turn == 1) adjRight(dx, dy, &ndx, &ndy);
      else { ndx = dx; ndy = dy; }
      out = cell; out.ra = wrap(100 + joinDyDx(ndx, ndy));
      set(dx, dy * 2, out);
    } else {
      set(0, 0, emptyCell());
    }
  }
}

static void updateFire(Cell cell) {
  int ra = cell.ra, dx, rise, dy;
  Cell degraded, nbr;
  degraded = cell;
  degraded.ra = wrap(ra - (2 + randDir()));
  dx = randDir();
  rise = randInt(8);
  dy = rise < 5 ? -1 : rise < 7 ? 0 : 1;
  nbr = get(dx, dy);
  if (nbr.species == SP_Gas || nbr.species == SP_Dust) {
    Cell f; f.species = SP_Fire; f.ra = wrap(150 + (dx + dy) * 10); f.rb = 0; f.clock = 0;
    set(dx, dy, f);
  }
  if (ra < 5 || nbr.species == SP_Water) {
    set(0, 0, emptyCell());
  } else if (nbr.species == SP_Empty) {
    set(0, 0, emptyCell());
    set(dx, dy, degraded);
  } else {
    set(0, 0, degraded);
  }
}

static void updateLava(Cell cell) {
  int dx, dy;
  Cell sample;
  randVec(&dx, &dy);
  sample = get(dx, dy);
  if (sample.species == SP_Gas || sample.species == SP_Dust) {
    Cell f; f.species = SP_Fire; f.ra = wrap(150 + (dx + dy) * 10); f.rb = 0; f.clock = 0;
    set(dx, dy, f);
  }
  if (sample.species == SP_Water) {
    Cell st; st.species = SP_Stone; st.ra = wrap(150 + (dx + dy) * 10); st.rb = 0; st.clock = 0;
    set(0, 0, st);
    set(dx, dy, emptyCell());
  } else if (get(0, 1).species == SP_Empty) {
    set(0, 0, emptyCell()); set(0, 1, cell);
  } else if (get(dx, 1).species == SP_Empty) {
    set(0, 0, emptyCell()); set(dx, 1, cell);
  } else if (get(dx, 0).species == SP_Empty) {
    set(0, 0, emptyCell()); set(dx, 0, cell);
  } else {
    set(0, 0, cell);
  }
}

static void updateWood(Cell cell) {
  int rb = cell.rb, dx, dy;
  u8 ns;
  Cell out, f;
  randVec(&dx, &dy);
  ns = get(dx, dy).species;
  if ((rb == 0 && ns == SP_Fire) || ns == SP_Lava) {
    out = cell; out.rb = 90; out.clock = 0;
    set(0, 0, out);
  }
  if (rb > 1) {
    out = cell; out.rb = (u8)(rb - 1); out.clock = 0;
    set(0, 0, out);
    if (rb % 4 == 0 && ns == SP_Empty) {
      f.species = SP_Fire; f.ra = wrap(30 + randInt(60)); f.rb = 0; f.clock = 0;
      set(dx, dy, f);
    }
    if (ns == SP_Water) {
      out.species = SP_Wood; out.ra = 50; out.rb = 0; out.clock = 0;
      set(0, 0, out);
    }
  } else if (rb == 1) {
    out.species = SP_Empty; out.ra = cell.ra; out.rb = 90; out.clock = 0;
    set(0, 0, out);
  }
}

static void updateIce(Cell cell) {
  int dx, dy, i;
  u8 ns;
  Cell out;
  randVec(&dx, &dy);
  i = randInt(100);
  ns = get(dx, dy).species;
  if (ns == SP_Fire || ns == SP_Lava) {
    out = cell; out.species = SP_Water;
    set(0, 0, out);
  } else if (ns == SP_Water && i < 7) {
    out = cell; out.species = SP_Ice;
    set(dx, dy, out);
  }
}

static void updatePlant(Cell cell) {
  int rb = cell.rb, i, dx, dy, drift;
  u8 ns, behind, ra;
  Cell out, f;
  randVec(&dx, &dy);
  i = randInt(100);
  ns = get(dx, dy).species;
  if ((rb == 0 && ns == SP_Fire) || ns == SP_Lava) {
    out = cell; out.rb = 20; out.clock = 0;
    set(0, 0, out);
  }
  if (ns == SP_Wood) {
    randVec(&dx, &dy);
    drift = (i % 15) - 7;
    if (get(dx, dy).species == SP_Empty) {
      out.species = SP_Plant; out.ra = wrap((int)cell.ra + drift); out.rb = 0; out.clock = 0;
      set(dx, dy, out);
    }
  }
  behind = get(-dx, dy).species;
  if (randInt(100) > 80 &&
      (ns == SP_Water || (ns == SP_Fungus && (behind == SP_Empty || behind == SP_Water || behind == SP_Fungus)))) {
    i = randInt(100);
    drift = (i % 15) - 7;
    out = cell; out.ra = wrap((int)cell.ra + drift); out.rb = 0;
    set(dx, dy, out);
    set(-dx, dy, emptyCell());
  }
  if (rb > 1) {
    out = cell; out.rb = (u8)(rb - 1);
    set(0, 0, out);
    if (ns == SP_Empty) {
      f.species = SP_Fire; f.ra = wrap(20 + randInt(30)); f.rb = 0; f.clock = 0;
      set(dx, dy, f);
    }
    if (ns == SP_Water) {
      out = cell; out.ra = 50; out.rb = 0;
      set(0, 0, out);
    }
  } else if (rb == 1) {
    set(0, 0, emptyCell());
  }
  ra = cell.ra;
  if (ra > 50 && get(1, 1).species != SP_Plant && get(-1, 1).species != SP_Plant) {
    if (get(0, 1).species == SP_Empty) {
      i = (int)(randFloat() * randFloat() * 100.f);
      drift = randInt(30) - 20;
      if ((i + ra) > 165) {
        out = cell; out.ra = wrap((int)ra + drift);
        set(0, 1, out);
      }
    } else {
      out = cell; out.ra = wrap((int)ra - 1);
      set(0, 0, out);
    }
  }
}

static void updateSeed(Cell cell) {
  int rb = cell.rb, ra = cell.ra, dx, dy, dxf, dxr;
  u8 ns, below, up;
  Cell nbr, out;
  int md0, md1, ld0, ld1, rd0, rd1, ii, dec;
  randVec(&dx, &dy);
  ns = get(dx, dy).species;
  if (ns == SP_Fire || ns == SP_Lava) {
    out.species = SP_Fire; out.ra = 5; out.rb = 0; out.clock = 0;
    set(0, 0, out);
    return;
  }
  if (rb == 0) {
    dxf = randDir();
    below = get(dxf, 1).species;
    if (below == SP_Sand || below == SP_Plant || below == SP_Fungus) {
      out = cell; out.rb = wrap(randInt(253) + 1);
      set(0, 0, out);
      return;
    }
    nbr = get(0, 1);
    if (nbr.species == SP_Empty) {
      set(0, 0, emptyCell()); set(0, 1, cell);
    } else if (get(dxf, 1).species == SP_Empty) {
      set(0, 0, emptyCell()); set(dxf, 1, cell);
    } else if (nbr.species == SP_Water || nbr.species == SP_Gas ||
               nbr.species == SP_Oil || nbr.species == SP_Acid) {
      set(0, 0, nbr); set(0, 1, cell);
    } else {
      set(0, 0, cell);
    }
  } else if (ra > 60) {
    dxr = randDir();
    if (randInt(100) > 75) {
      up = get(dxr, -1).species;
      if ((up == SP_Empty || up == SP_Sand || up == SP_Seed) &&
          get(1, -1).species != SP_Plant && get(-1, -1).species != SP_Plant) {
        out = cell; out.ra = wrap(ra - randInt(10));
        set(dxr, -1, out);
        out.species = SP_Plant; out.ra = wrap(80 + randInt(30)); out.rb = 0; out.clock = 0;
        set(0, 0, out);
      } else {
        set(0, 0, emptyCell());
      }
    }
  } else if (ra > 40) {
    randVec(&md0, &md1);
    adjLeft(md0, md1, &ld0, &ld1);
    adjRight(md0, md1, &rd0, &rd1);
    ns = get(md0, md1).species;
    if ((ns == SP_Empty || ns == SP_Plant) &&
        (get(ld0, ld1).species == SP_Empty || get(rd0, rd1).species == SP_Empty)) {
      ii = (int)(randFloat() * randFloat() * 100.f);
      dec = 9 - randInt(3);
      if ((ii + ra) > 100) {
        out = cell; out.ra = wrap(ra - dec);
        set(md0, md1, out);
      }
    }
  } else if (ns == SP_Water) {
    set(dx, dy, spawn(SP_Seed));
  }
}

static void updateFungus(Cell cell) {
  int rb = cell.rb, dx, dy, i, drift, ra, dec;
  u8 ns;
  Cell out, f;
  int md0, md1, ld0, ld1, rd0, rd1;
  randVec(&dx, &dy);
  ns = get(dx, dy).species;
  if ((rb == 0 && ns == SP_Fire) || ns == SP_Lava) {
    out = cell; out.rb = 10; out.clock = 0;
    set(0, 0, out);
  }
  i = randInt(100);
  if (ns != SP_Empty && ns != SP_Fungus && ns != SP_Fire && ns != SP_Ice) {
    randVec(&dx, &dy);
    drift = (i % 15) - 7;
    if (get(dx, dy).species == SP_Empty) {
      out.species = SP_Fungus; out.ra = wrap((int)cell.ra + drift); out.rb = 0; out.clock = 0;
      set(dx, dy, out);
    }
  }
  if (i > 9 && ns == SP_Wood && get(-dx, dy).species == SP_Wood &&
      get(dx, -dy).species == SP_Wood && (get(dx, dy).ra % 4) != 0) {
    i = randInt(100);
    drift = (i % 15) - 7;
    out = cell; out.ra = wrap((int)cell.ra + drift); out.rb = 0;
    set(dx, dy, out);
  }
  if (rb > 1) {
    out = cell; out.rb = (u8)(rb - 1);
    set(0, 0, out);
    if (ns == SP_Empty) {
      f.species = SP_Fire; f.ra = wrap(10 + randInt(10)); f.rb = 0; f.clock = 0;
      set(dx, dy, f);
    }
    if (ns == SP_Water) {
      out = cell; out.ra = 50; out.rb = 0;
      set(0, 0, out);
    }
  } else if (rb == 1) {
    set(0, 0, emptyCell());
  }
  ra = cell.ra;
  if (ra > 120) {
    randVec(&md0, &md1);
    adjLeft(md0, md1, &ld0, &ld1);
    adjRight(md0, md1, &rd0, &rd1);
    if (get(md0, md1).species == SP_Empty &&
        get(ld0, ld1).species != SP_Fungus &&
        get(rd0, rd1).species != SP_Fungus) {
      i = (int)(randFloat() * randFloat() * 100.f);
      dec = 15 - randInt(20);
      if ((i + ra) > 165) {
        out = cell; out.ra = wrap(ra - dec);
        set(md0, md1, out);
      }
    }
  }
}

static void updateAcid(Cell cell) {
  int dx = randDir();
  Cell degraded = cell;
  degraded.ra = wrap((int)cell.ra - 60);
  if (degraded.ra < 80) degraded = emptyCell();
  if (get(0, 1).species == SP_Empty) {
    set(0, 0, emptyCell()); set(0, 1, cell);
  } else if (get(dx, 0).species == SP_Empty) {
    set(0, 0, emptyCell()); set(dx, 0, cell);
  } else if (get(-dx, 0).species == SP_Empty) {
    set(0, 0, emptyCell()); set(-dx, 0, cell);
  } else if (get(0, 1).species != SP_Wall && get(0, 1).species != SP_Acid) {
    set(0, 0, emptyCell()); set(0, 1, degraded);
  } else if (get(dx, 0).species != SP_Wall && get(dx, 0).species != SP_Acid) {
    set(0, 0, emptyCell()); set(dx, 0, degraded);
  } else if (get(-dx, 0).species != SP_Wall && get(-dx, 0).species != SP_Acid) {
    set(0, 0, emptyCell()); set(-dx, 0, degraded);
  } else if (get(0, -1).species != SP_Wall && get(0, -1).species != SP_Acid &&
             get(0, -1).species != SP_Empty) {
    set(0, 0, emptyCell()); set(0, -1, degraded);
  } else {
    set(0, 0, cell);
  }
}

static void updateMite(Cell cell) {
  int i = randInt(100), dx = 0, dy = 1, sx, sy;
  Cell mite = cell, nbr;
  u8 sample;
  if (cell.ra < 20) dx = ((int)cell.ra) - 1;
  if (cell.rb > 10) {
    mite.rb = mite.rb > 0 ? (u8)(mite.rb - 1) : 0;
    dy = -1;
  } else if (cell.rb > 1) {
    mite.rb = mite.rb > 0 ? (u8)(mite.rb - 1) : 0;
  } else {
    dx = 0;
  }
  nbr = get(dx, dy);
  sx = (i % 3) - 1;
  i = randInt(1000);
  sy = (i % 3) - 1;
  sample = get(sx, sy).species;
  if (sample == SP_Fire || sample == SP_Lava || sample == SP_Water || sample == SP_Oil) {
    set(0, 0, emptyCell());
    return;
  }
  if ((sample == SP_Plant || sample == SP_Wood || sample == SP_Seed) && i > 800) {
    set(0, 0, emptyCell());
    set(sx, sy, cell);
    return;
  }
  if (sample == SP_Dust) {
    set(sx, sy, i > 800 ? cell : emptyCell());
  }
  if (nbr.species == SP_Empty) {
    set(0, 0, emptyCell());
    set(dx, dy, mite);
  } else if (dy == 1 && i > 800) {
    i = randInt(100);
    {
      int ndx = (i % 3) - 1;
      if (i < 6) ndx = dx;
      mite.ra = wrap(1 + ndx);
      mite.rb = wrap(10 + (i % 10));
      set(0, 0, mite);
    }
  } else if (get(-1, 0).species == SP_Mite && get(1, 0).species == SP_Mite &&
             get(0, -1).species == SP_Mite) {
    set(0, 0, emptyCell());
  } else if (get(0, 1).species == SP_Ice) {
    if (get(dx, 0).species == SP_Empty) {
      set(0, 0, emptyCell());
      set(dx, 0, mite);
    }
  } else {
    set(0, 0, mite);
  }
}

static void updateCell(Cell cell) {
  switch (cell.species) {
    case SP_Sand: updateSand(cell); break;
    case SP_Dust: updateDust(cell); break;
    case SP_Water: updateWater(cell); break;
    case SP_Stone: updateStone(cell); break;
    case SP_Gas: updateGas(cell); break;
    case SP_Cloner: updateCloner(cell); break;
    case SP_Rocket: updateRocket(cell); break;
    case SP_Fire: updateFire(cell); break;
    case SP_Wood: updateWood(cell); break;
    case SP_Lava: updateLava(cell); break;
    case SP_Ice: updateIce(cell); break;
    case SP_Plant: updatePlant(cell); break;
    case SP_Acid: updateAcid(cell); break;
    case SP_Mite: updateMite(cell); break;
    case SP_Oil: updateOil(cell); break;
    case SP_Fungus: updateFungus(cell); break;
    case SP_Seed: updateSeed(cell); break;
    default: break;
  }
}

__attribute__((export_name("sand_width")))
int sand_width(void) { return WIDTH; }
__attribute__((export_name("sand_height")))
int sand_height(void) { return HEIGHT; }
__attribute__((export_name("sand_cells")))
int sand_cells(void) { return CELLS_OFF; }
__attribute__((export_name("sand_count")))
int sand_count(void) { return CELL_COUNT; }

__attribute__((export_name("sand_reset")))
void sand_reset(void) {
  int i;
  Cell *g = grid();
  for (i = 0; i < CELL_COUNT; i++) {
    g[i].species = 0; g[i].ra = 0; g[i].rb = 0; g[i].clock = 0;
  }
}

__attribute__((export_name("sand_init")))
void sand_init(void) {
  generation = 0;
  rng = 0x734f6b89u;
  sand_reset();
}

__attribute__((export_name("sand_tick")))
void sand_tick(void) {
  int x, y, scanx;
  Cell cell;
  Cell *g = grid();
  generation = wrap((int)generation + 1);
  for (x = 0; x < WIDTH; x++) {
    scanx = (generation % 2 == 0) ? WIDTH - (1 + x) : x;
    for (y = 0; y < HEIGHT; y++) {
      cell = g[scanx * HEIGHT + y];
      if (wrap((int)cell.clock - (int)generation) == 1) continue;
      ax = scanx;
      ay = y;
      updateCell(cell);
    }
  }
  generation = wrap((int)generation + 1);
}

__attribute__((export_name("sand_paint")))
void sand_paint(int x, int y, int size, int species) {
  float radius = ((float)size) / 2.f;
  int floor = (int)(radius + 1.f);
  int ciel = (int)(radius + 1.5f);
  int dx, dy, px, py, i;
  Cell *g = grid();
  Cell c;
  for (dx = -floor; dx < ciel; dx++) {
    for (dy = -floor; dy < ciel; dy++) {
      if (((float)(dx * dx + dy * dy)) > (radius * radius)) continue;
      px = x + dx;
      py = y + dy;
      if (px < 0 || px > WIDTH - 1 || py < 0 || py > HEIGHT - 1) continue;
      i = px * HEIGHT + py;
      if (g[i].species == SP_Empty || species == SP_Empty) {
        c.species = (u8)species;
        c.ra = wrap(60 + size + (int)(randFloat() * 30.f) + genAbs(generation));
        c.rb = 0;
        c.clock = generation;
        g[i] = c;
      }
    }
  }
}

__attribute__((export_name("sand_get")))
int sand_get(int x, int y) {
  Cell c;
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return 0;
  c = grid()[x * HEIGHT + y];
  return (int)c.species | ((int)c.ra << 8) | ((int)c.rb << 16) | ((int)c.clock << 24);
}

__attribute__((export_name("sand_set")))
void sand_set(int x, int y, int species, int ra, int rb) {
  Cell c;
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  c.species = (u8)species; c.ra = (u8)ra; c.rb = (u8)rb; c.clock = 0;
  grid()[x * HEIGHT + y] = c;
}
