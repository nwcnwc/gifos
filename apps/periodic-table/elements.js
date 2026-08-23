/* Periodic Table — 118 confirmed elements, quiz items, extra tables.
 * Data is vendored. Nothing is fetched. Classic script (no import/export).
 * 118 is Oganesson (Og). Ununennium (Uue) would be 119 and is not included.
 */
(function (root) {
  'use strict';

  // z, symbol, name, mass, category, shells (Bohr occupancy)
  var RAW = [
    [1, 'H', 'Hydrogen', 1.008, 'nonmetal', '1'],
    [2, 'He', 'Helium', 4.0026, 'noble', '2'],
    [3, 'Li', 'Lithium', 6.94, 'alkali', '2-1'],
    [4, 'Be', 'Beryllium', 9.0122, 'alkaline-earth', '2-2'],
    [5, 'B', 'Boron', 10.81, 'metalloid', '2-3'],
    [6, 'C', 'Carbon', 12.011, 'nonmetal', '2-4'],
    [7, 'N', 'Nitrogen', 14.007, 'nonmetal', '2-5'],
    [8, 'O', 'Oxygen', 15.999, 'nonmetal', '2-6'],
    [9, 'F', 'Fluorine', 18.998, 'halogen', '2-7'],
    [10, 'Ne', 'Neon', 20.180, 'noble', '2-8'],
    [11, 'Na', 'Sodium', 22.990, 'alkali', '2-8-1'],
    [12, 'Mg', 'Magnesium', 24.305, 'alkaline-earth', '2-8-2'],
    [13, 'Al', 'Aluminium', 26.982, 'post-transition', '2-8-3'],
    [14, 'Si', 'Silicon', 28.085, 'metalloid', '2-8-4'],
    [15, 'P', 'Phosphorus', 30.974, 'nonmetal', '2-8-5'],
    [16, 'S', 'Sulfur', 32.06, 'nonmetal', '2-8-6'],
    [17, 'Cl', 'Chlorine', 35.45, 'halogen', '2-8-7'],
    [18, 'Ar', 'Argon', 39.948, 'noble', '2-8-8'],
    [19, 'K', 'Potassium', 39.098, 'alkali', '2-8-8-1'],
    [20, 'Ca', 'Calcium', 40.078, 'alkaline-earth', '2-8-8-2'],
    [21, 'Sc', 'Scandium', 44.956, 'transition', '2-8-9-2'],
    [22, 'Ti', 'Titanium', 47.867, 'transition', '2-8-10-2'],
    [23, 'V', 'Vanadium', 50.942, 'transition', '2-8-11-2'],
    [24, 'Cr', 'Chromium', 51.996, 'transition', '2-8-13-1'],
    [25, 'Mn', 'Manganese', 54.938, 'transition', '2-8-13-2'],
    [26, 'Fe', 'Iron', 55.845, 'transition', '2-8-14-2'],
    [27, 'Co', 'Cobalt', 58.933, 'transition', '2-8-15-2'],
    [28, 'Ni', 'Nickel', 58.693, 'transition', '2-8-16-2'],
    [29, 'Cu', 'Copper', 63.546, 'transition', '2-8-18-1'],
    [30, 'Zn', 'Zinc', 65.38, 'transition', '2-8-18-2'],
    [31, 'Ga', 'Gallium', 69.723, 'post-transition', '2-8-18-3'],
    [32, 'Ge', 'Germanium', 72.630, 'metalloid', '2-8-18-4'],
    [33, 'As', 'Arsenic', 74.922, 'metalloid', '2-8-18-5'],
    [34, 'Se', 'Selenium', 78.971, 'nonmetal', '2-8-18-6'],
    [35, 'Br', 'Bromine', 79.904, 'halogen', '2-8-18-7'],
    [36, 'Kr', 'Krypton', 83.798, 'noble', '2-8-18-8'],
    [37, 'Rb', 'Rubidium', 85.468, 'alkali', '2-8-18-8-1'],
    [38, 'Sr', 'Strontium', 87.62, 'alkaline-earth', '2-8-18-8-2'],
    [39, 'Y', 'Yttrium', 88.906, 'transition', '2-8-18-9-2'],
    [40, 'Zr', 'Zirconium', 91.224, 'transition', '2-8-18-10-2'],
    [41, 'Nb', 'Niobium', 92.906, 'transition', '2-8-18-12-1'],
    [42, 'Mo', 'Molybdenum', 95.95, 'transition', '2-8-18-13-1'],
    [43, 'Tc', 'Technetium', 97, 'transition', '2-8-18-13-2'],
    [44, 'Ru', 'Ruthenium', 101.07, 'transition', '2-8-18-15-1'],
    [45, 'Rh', 'Rhodium', 102.91, 'transition', '2-8-18-16-1'],
    [46, 'Pd', 'Palladium', 106.42, 'transition', '2-8-18-18'],
    [47, 'Ag', 'Silver', 107.87, 'transition', '2-8-18-18-1'],
    [48, 'Cd', 'Cadmium', 112.41, 'transition', '2-8-18-18-2'],
    [49, 'In', 'Indium', 114.82, 'post-transition', '2-8-18-18-3'],
    [50, 'Sn', 'Tin', 118.71, 'post-transition', '2-8-18-18-4'],
    [51, 'Sb', 'Antimony', 121.76, 'metalloid', '2-8-18-18-5'],
    [52, 'Te', 'Tellurium', 127.60, 'metalloid', '2-8-18-18-6'],
    [53, 'I', 'Iodine', 126.90, 'halogen', '2-8-18-18-7'],
    [54, 'Xe', 'Xenon', 131.29, 'noble', '2-8-18-18-8'],
    [55, 'Cs', 'Caesium', 132.91, 'alkali', '2-8-18-18-8-1'],
    [56, 'Ba', 'Barium', 137.33, 'alkaline-earth', '2-8-18-18-8-2'],
    [57, 'La', 'Lanthanum', 138.91, 'lanthanide', '2-8-18-18-9-2'],
    [58, 'Ce', 'Cerium', 140.12, 'lanthanide', '2-8-18-19-9-2'],
    [59, 'Pr', 'Praseodymium', 140.91, 'lanthanide', '2-8-18-21-8-2'],
    [60, 'Nd', 'Neodymium', 144.24, 'lanthanide', '2-8-18-22-8-2'],
    [61, 'Pm', 'Promethium', 145, 'lanthanide', '2-8-18-23-8-2'],
    [62, 'Sm', 'Samarium', 150.36, 'lanthanide', '2-8-18-24-8-2'],
    [63, 'Eu', 'Europium', 151.96, 'lanthanide', '2-8-18-25-8-2'],
    [64, 'Gd', 'Gadolinium', 157.25, 'lanthanide', '2-8-18-25-9-2'],
    [65, 'Tb', 'Terbium', 158.93, 'lanthanide', '2-8-18-27-8-2'],
    [66, 'Dy', 'Dysprosium', 162.50, 'lanthanide', '2-8-18-28-8-2'],
    [67, 'Ho', 'Holmium', 164.93, 'lanthanide', '2-8-18-29-8-2'],
    [68, 'Er', 'Erbium', 167.26, 'lanthanide', '2-8-18-30-8-2'],
    [69, 'Tm', 'Thulium', 168.93, 'lanthanide', '2-8-18-31-8-2'],
    [70, 'Yb', 'Ytterbium', 173.05, 'lanthanide', '2-8-18-32-8-2'],
    [71, 'Lu', 'Lutetium', 174.97, 'lanthanide', '2-8-18-32-9-2'],
    [72, 'Hf', 'Hafnium', 178.49, 'transition', '2-8-18-32-10-2'],
    [73, 'Ta', 'Tantalum', 180.95, 'transition', '2-8-18-32-11-2'],
    [74, 'W', 'Tungsten', 183.84, 'transition', '2-8-18-32-12-2'],
    [75, 'Re', 'Rhenium', 186.21, 'transition', '2-8-18-32-13-2'],
    [76, 'Os', 'Osmium', 190.23, 'transition', '2-8-18-32-14-2'],
    [77, 'Ir', 'Iridium', 192.22, 'transition', '2-8-18-32-15-2'],
    [78, 'Pt', 'Platinum', 195.08, 'transition', '2-8-18-32-17-1'],
    [79, 'Au', 'Gold', 196.97, 'transition', '2-8-18-32-18-1'],
    [80, 'Hg', 'Mercury', 200.59, 'transition', '2-8-18-32-18-2'],
    [81, 'Tl', 'Thallium', 204.38, 'post-transition', '2-8-18-32-18-3'],
    [82, 'Pb', 'Lead', 207.2, 'post-transition', '2-8-18-32-18-4'],
    [83, 'Bi', 'Bismuth', 208.98, 'post-transition', '2-8-18-32-18-5'],
    [84, 'Po', 'Polonium', 209, 'metalloid', '2-8-18-32-18-6'],
    [85, 'At', 'Astatine', 210, 'halogen', '2-8-18-32-18-7'],
    [86, 'Rn', 'Radon', 222, 'noble', '2-8-18-32-18-8'],
    [87, 'Fr', 'Francium', 223, 'alkali', '2-8-18-32-18-8-1'],
    [88, 'Ra', 'Radium', 226, 'alkaline-earth', '2-8-18-32-18-8-2'],
    [89, 'Ac', 'Actinium', 227, 'actinide', '2-8-18-32-18-9-2'],
    [90, 'Th', 'Thorium', 232.04, 'actinide', '2-8-18-32-18-10-2'],
    [91, 'Pa', 'Protactinium', 231.04, 'actinide', '2-8-18-32-20-9-2'],
    [92, 'U', 'Uranium', 238.03, 'actinide', '2-8-18-32-21-9-2'],
    [93, 'Np', 'Neptunium', 237, 'actinide', '2-8-18-32-22-9-2'],
    [94, 'Pu', 'Plutonium', 244, 'actinide', '2-8-18-32-24-8-2'],
    [95, 'Am', 'Americium', 243, 'actinide', '2-8-18-32-25-8-2'],
    [96, 'Cm', 'Curium', 247, 'actinide', '2-8-18-32-25-9-2'],
    [97, 'Bk', 'Berkelium', 247, 'actinide', '2-8-18-32-27-8-2'],
    [98, 'Cf', 'Californium', 251, 'actinide', '2-8-18-32-28-8-2'],
    [99, 'Es', 'Einsteinium', 252, 'actinide', '2-8-18-32-29-8-2'],
    [100, 'Fm', 'Fermium', 257, 'actinide', '2-8-18-32-30-8-2'],
    [101, 'Md', 'Mendelevium', 258, 'actinide', '2-8-18-32-31-8-2'],
    [102, 'No', 'Nobelium', 259, 'actinide', '2-8-18-32-32-8-2'],
    [103, 'Lr', 'Lawrencium', 266, 'actinide', '2-8-18-32-32-8-3'],
    [104, 'Rf', 'Rutherfordium', 267, 'transition', '2-8-18-32-32-10-2'],
    [105, 'Db', 'Dubnium', 268, 'transition', '2-8-18-32-32-11-2'],
    [106, 'Sg', 'Seaborgium', 269, 'transition', '2-8-18-32-32-12-2'],
    [107, 'Bh', 'Bohrium', 270, 'transition', '2-8-18-32-32-13-2'],
    [108, 'Hs', 'Hassium', 269, 'transition', '2-8-18-32-32-14-2'],
    [109, 'Mt', 'Meitnerium', 278, 'transition', '2-8-18-32-32-15-2'],
    [110, 'Ds', 'Darmstadtium', 281, 'transition', '2-8-18-32-32-16-2'],
    [111, 'Rg', 'Roentgenium', 282, 'transition', '2-8-18-32-32-17-2'],
    [112, 'Cn', 'Copernicium', 285, 'transition', '2-8-18-32-32-18-2'],
    [113, 'Nh', 'Nihonium', 286, 'post-transition', '2-8-18-32-32-18-3'],
    [114, 'Fl', 'Flerovium', 289, 'post-transition', '2-8-18-32-32-18-4'],
    [115, 'Mc', 'Moscovium', 290, 'post-transition', '2-8-18-32-32-18-5'],
    [116, 'Lv', 'Livermorium', 293, 'post-transition', '2-8-18-32-32-18-6'],
    [117, 'Ts', 'Tennessine', 294, 'halogen', '2-8-18-32-32-18-7'],
    [118, 'Og', 'Oganesson', 294, 'noble', '2-8-18-32-32-18-8']
  ];

  var CATS = [
    'alkali', 'alkaline-earth', 'transition', 'post-transition',
    'metalloid', 'nonmetal', 'halogen', 'noble', 'lanthanide', 'actinide'
  ];
  var LABELS = {
    alkali: 'Alkali metal',
    'alkaline-earth': 'Alkaline earth',
    transition: 'Transition metal',
    'post-transition': 'Other metal',
    metalloid: 'Metalloid',
    nonmetal: 'Nonmetal',
    halogen: 'Halogen',
    noble: 'Noble gas',
    lanthanide: 'Lanthanide',
    actinide: 'Actinide'
  };
  var COLORS = {
    alkali: '#c46bff',
    'alkaline-earth': '#7b8cff',
    transition: '#3dce7a',
    'post-transition': '#2ec9d4',
    metalloid: '#d4c04a',
    nonmetal: '#ff4ec8',
    halogen: '#3ec6ff',
    noble: '#ff4d6d',
    lanthanide: '#e6c84a',
    actinide: '#ff9900'
  };

  function periodOf(z) {
    if (z <= 2) return 1;
    if (z <= 10) return 2;
    if (z <= 18) return 3;
    if (z <= 36) return 4;
    if (z <= 54) return 5;
    if (z <= 86) return 6;
    return 7;
  }
  function groupOf(z) {
    if (z === 1) return 1;
    if (z === 2) return 18;
    if (z >= 3 && z <= 4) return z - 2;
    if (z >= 5 && z <= 10) return z + 8;
    if (z >= 11 && z <= 12) return z - 10;
    if (z >= 13 && z <= 18) return z;
    if (z >= 19 && z <= 36) return z - 18;
    if (z >= 37 && z <= 54) return z - 36;
    if (z === 55 || z === 56) return z - 54;
    if (z >= 57 && z <= 71) return 0;
    if (z >= 72 && z <= 86) return z - 68;
    if (z === 87 || z === 88) return z - 86;
    if (z >= 89 && z <= 103) return 0;
    if (z >= 104 && z <= 118) return z - 100;
    return 0;
  }
  // Visual cell in a 9×18 grid (lanthanides row 8, actinides row 9).
  function cellOf(z) {
    if (z >= 57 && z <= 71) return { r: 7, c: (z - 57) + 2 };
    if (z >= 89 && z <= 103) return { r: 8, c: (z - 89) + 2 };
    var g = groupOf(z);
    return { r: periodOf(z) - 1, c: g - 1 };
  }

  var ELEMENTS = [];
  var BY_Z = {};
  var BY_SYM = {};
  var BY_NAME = {};
  var i, row, el;
  for (i = 0; i < RAW.length; i++) {
    row = RAW[i];
    el = {
      z: row[0],
      symbol: row[1],
      name: row[2],
      mass: row[3],
      category: row[4],
      shells: row[5],
      period: periodOf(row[0]),
      group: groupOf(row[0]),
      cell: cellOf(row[0])
    };
    ELEMENTS.push(el);
    BY_Z[el.z] = el;
    BY_SYM[el.symbol] = el;
    BY_NAME[el.name.toLowerCase()] = el;
  }
  // Former systematic name of 118; Ununennium is 119 (not vendored).
  if (BY_Z[118]) BY_Z[118].former = 'Ununoctium';

  function byZ(z) { return BY_Z[z] || null; }
  function bySymbol(s) { return BY_SYM[s] || null; }
  function byName(n) { return BY_NAME[String(n).toLowerCase()] || null; }

  function mulberry(seed) {
    var t = seed >>> 0;
    return function () {
      t += 0x6D2B79F5;
      var r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleIn(rand, arr) {
    var i, j, tmp;
    for (i = arr.length - 1; i > 0; i--) {
      j = (rand() * (i + 1)) | 0;
      tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function uniquePick(rand, want, isUsed) {
    var n, guard = 0, v;
    do {
      n = ELEMENTS[(rand() * ELEMENTS.length) | 0];
      v = want(n);
      guard++;
    } while (isUsed(v) && guard < 80);
    return v;
  }

  // One quiz item: 4 choices, exactly one right. Same seed+index → same item.
  function quizItem(seed, index) {
    var rand = mulberry((seed >>> 0) + (index + 1) * 2654435761);
    var kind = (rand() * 3) | 0;
    var el = ELEMENTS[(rand() * ELEMENTS.length) | 0];
    var prompt, correct, choices, used, take, i, answer;
    used = {};
    if (kind === 0) {
      prompt = 'What is the symbol for ' + el.name + '?';
      correct = el.symbol;
      take = function (e) { return e.symbol; };
    } else if (kind === 1) {
      prompt = 'Which number is ' + el.symbol + '?';
      correct = String(el.z);
      take = function (e) { return String(e.z); };
    } else {
      prompt = 'What is the name of ' + el.symbol + '?';
      correct = el.name;
      take = function (e) { return e.name; };
    }
    used[correct] = 1;
    choices = [correct];
    while (choices.length < 4) {
      var d = uniquePick(rand, take, function (v) { return used[v]; });
      if (used[d]) {
        d = take(ELEMENTS[(choices.length * 17 + el.z) % ELEMENTS.length]);
      }
      if (used[d]) continue;
      used[d] = 1;
      choices.push(d);
    }
    shuffleIn(rand, choices);
    answer = 0;
    for (i = 0; i < 4; i++) if (choices[i] === correct) answer = i;
    return { prompt: prompt, choices: choices, answer: answer, z: el.z, kind: kind };
  }

  function quiz(seed, n) {
    var out = [], i;
    n = n || 10;
    for (i = 0; i < n; i++) out.push(quizItem(seed, i));
    return out;
  }

  var HYDROCARBONS = [
    { name: 'Methane', formula: 'CH4', kind: 'alkane' },
    { name: 'Ethane', formula: 'C2H6', kind: 'alkane' },
    { name: 'Propane', formula: 'C3H8', kind: 'alkane' },
    { name: 'Butane', formula: 'C4H10', kind: 'alkane' },
    { name: 'Pentane', formula: 'C5H12', kind: 'alkane' },
    { name: 'Hexane', formula: 'C6H14', kind: 'alkane' },
    { name: 'Heptane', formula: 'C7H16', kind: 'alkane' },
    { name: 'Octane', formula: 'C8H18', kind: 'alkane' },
    { name: 'Ethene', formula: 'C2H4', kind: 'alkene' },
    { name: 'Ethyne', formula: 'C2H2', kind: 'alkyne' },
    { name: 'Benzene', formula: 'C6H6', kind: 'aromatic' }
  ];
  var INDICATORS = [
    { name: 'Litmus', acid: 'Red', alkali: 'Blue' },
    { name: 'Phenolphthalein', acid: 'Colourless', alkali: 'Pink' },
    { name: 'Methyl orange', acid: 'Red', alkali: 'Yellow' },
    { name: 'Universal indicator', acid: 'Red to yellow', alkali: 'Blue to purple' }
  ];
  var SOLUBILITY = [
    'All nitrates dissolve in water.',
    'All sodium, potassium and ammonium salts dissolve.',
    'Most chlorides dissolve; silver and lead chlorides do not.',
    'Most sulfates dissolve; barium, lead and calcium sulfates do not.',
    'Most carbonates do not dissolve; sodium, potassium and ammonium carbonates do.',
    'Most hydroxides do not dissolve; sodium, potassium and barium hydroxides do.'
  ];

  root.PT = {
    ELEMENTS: ELEMENTS,
    CATS: CATS,
    LABELS: LABELS,
    COLORS: COLORS,
    RACE: 10,
    byZ: byZ,
    bySymbol: bySymbol,
    byName: byName,
    periodOf: periodOf,
    groupOf: groupOf,
    cellOf: cellOf,
    quizItem: quizItem,
    quiz: quiz,
    mulberry: mulberry,
    HYDROCARBONS: HYDROCARBONS,
    INDICATORS: INDICATORS,
    SOLUBILITY: SOLUBILITY
  };
})(typeof window !== 'undefined' ? window : this);
