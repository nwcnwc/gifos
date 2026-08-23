/*
 * Picture bank + seeded generator for Nonogram.
 *
 * A few hand pictures so the first easy boards are something, then a
 * deterministic generator so a race can deal {size, index} and both
 * players paint the same hints. Nothing is fetched.
 */
(function (root) {
  'use strict';

  var SIZES = [5, 8, 10, 15];
  var FILLED = 1;
  var EMPTY = 0;

  function parsePic(str) {
    var lines = String(str).trim().split(/\n/);
    return lines.map(function (line) {
      line = line.replace(/\s/g, '');
      var row = [], i;
      for (i = 0; i < line.length; i++) {
        var ch = line.charAt(i);
        row.push(ch === '#' || ch === '1' ? FILLED : EMPTY);
      }
      return row;
    });
  }

  function hintsOfLine(line) {
    var hints = [], run = 0, i;
    for (i = 0; i < line.length; i++) {
      if (line[i] === FILLED) run += 1;
      else if (run) { hints.push(run); run = 0; }
    }
    if (run) hints.push(run);
    return hints;
  }

  function hintsOf(grid) {
    var m = grid.length, n = grid[0].length, i, j, col;
    var row = [], column = [];
    for (i = 0; i < m; i++) row.push(hintsOfLine(grid[i]));
    for (j = 0; j < n; j++) {
      col = [];
      for (i = 0; i < m; i++) col.push(grid[i][j]);
      column.push(hintsOfLine(col));
    }
    return { row: row, column: column };
  }

  function countFilled(grid) {
    var n = 0, i, j;
    for (i = 0; i < grid.length; i++) {
      for (j = 0; j < grid[i].length; j++) if (grid[i][j] === FILLED) n++;
    }
    return n;
  }

  function mulberry32(a) {
    return function () {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function generate(m, n, seed, threshold) {
    threshold = threshold == null ? 0.55 : threshold;
    var rng = mulberry32(seed >>> 0);
    var grid = [], i, j, filled = 0;
    for (i = 0; i < m; i++) {
      grid[i] = [];
      for (j = 0; j < n; j++) {
        var v = rng() < threshold ? FILLED : EMPTY;
        grid[i][j] = v;
        if (v) filled++;
      }
    }
    if (filled === 0) grid[0][0] = FILLED;
    var h = hintsOf(grid);
    return {
      m: m, n: n, seed: seed >>> 0,
      grid: grid, row: h.row, column: h.column,
      filled: countFilled(grid)
    };
  }

  var BANK = {
    5: [
      parsePic('..#..\n..#..\n#####\n..#..\n..#..'),
      parsePic('.#.#.\n#####\n#####\n.###.\n..#..'),
      parsePic('.#.#.\n.#.#.\n.....\n#...#\n.###.'),
      parsePic('..#..\n.##..\n#####\n.###.\n#####'),
      parsePic('#...#\n.#.#.\n..#..\n.#.#.\n#...#')
    ],
    8: [
      parsePic('...##...\n..####..\n.######.\n########\n##.##.##\n##.##.##\n########\n###..###'),
      parsePic('...##...\n..####..\n.######.\n..####..\n.######.\n########\n...##...\n..####..'),
      parsePic('#......#\n.#....#.\n..####..\n.#....#.\n#.#..#.#\n#......#\n.#....#.\n..####..'),
      parsePic('........\n..####..\n.#....#.\n#..##..#\n#......#\n.#....#.\n..####..\n........')
    ],
    10: [
      parsePic(
        '.##...##..\n' +
        '####.####.\n' +
        '##########\n' +
        '##########\n' +
        '##########\n' +
        '.########.\n' +
        '..######..\n' +
        '...####...\n' +
        '....##....\n' +
        '....##....'
      ),
      parsePic(
        '....##....\n' +
        '...####...\n' +
        '..######..\n' +
        '.########.\n' +
        '###.##.###\n' +
        '###.##.###\n' +
        '.########.\n' +
        '..######..\n' +
        '#.##..##.#\n' +
        '##......##'
      ),
      parsePic(
        '....##....\n' +
        '...####...\n' +
        '..######..\n' +
        '.###.#####\n' +
        '##########\n' +
        '.###.#####\n' +
        '..######..\n' +
        '...####...\n' +
        '....##....\n' +
        '.....#....'
      )
    ],
    15: [
      parsePic(
        '.....###.......\n' +
        '....#####......\n' +
        '...###.###.....\n' +
        '..###...###....\n' +
        '.###.....###...\n' +
        '###.......###..\n' +
        '###############\n' +
        '##...........##\n' +
        '##..##...##..##\n' +
        '##...........##\n' +
        '##...........##\n' +
        '##...#####...##\n' +
        '##...........##\n' +
        '##...........##\n' +
        '###############'
      )
    ]
  };

  function pack(grid, size, index) {
    var h = hintsOf(grid);
    return {
      m: size, n: size, index: index,
      grid: grid, row: h.row, column: h.column,
      filled: countFilled(grid)
    };
  }

  function bankCount(size) {
    return (BANK[size] || []).length;
  }

  function pick(size, index) {
    if (SIZES.indexOf(size) < 0) size = 5;
    index = index | 0;
    if (index < 0) index = 0;
    var bank = BANK[size] || [];
    if (index < bank.length) return pack(bank[index], size, index);
    var seed = (size * 10007 + index) >>> 0;
    var p = generate(size, size, seed, 0.55);
    p.index = index;
    return p;
  }

  function progress(player, solution) {
    var need = 0, got = 0, i, j;
    if (!player || !solution) return { filled: 0, total: 0 };
    for (i = 0; i < solution.length; i++) {
      for (j = 0; j < solution[i].length; j++) {
        if (solution[i][j] === FILLED) {
          need++;
          if (player[i] && player[i][j] === FILLED) got++;
        }
      }
    }
    return { filled: got, total: need || 1 };
  }

  root.NGPuzzles = {
    SIZES: SIZES.slice(),
    FILLED: FILLED,
    EMPTY: EMPTY,
    parsePic: parsePic,
    hintsOf: hintsOf,
    countFilled: countFilled,
    generate: generate,
    pick: pick,
    bankCount: bankCount,
    progress: progress
  };
})(this);
