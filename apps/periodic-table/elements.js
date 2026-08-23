/* Periodic Table — 118 confirmed elements, quiz items, extra tables.
 * Data is vendored. Nothing is fetched. Classic script (no import/export).
 * 118 is Oganesson (Og). Ununennium (Uue) would be 119 and is not included.
 *
 * RAW: z, symbol, name, mass, category, shells
 * EXTRA (same order): state, year (0 = ancient), eneg, density g/cm3,
 *   melt C, boil C, oxidation, electron config.
 * Unknown numbers are 0 / '' — we do not guess superheavy properties.
 */
(function (root) {
  'use strict';

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

  // Same order as RAW. 0 / '' = unknown (not a guess). year 0 = known in antiquity.
  var EXTRA = [
    ['g', 1766, 2.20, 0.000090, -259, -253, '-1, +1', '1s1'],
    ['g', 1868, 0, 0.000179, -272, -269, '0', '1s2'],
    ['s', 1817, 0.98, 0.534, 181, 1342, '+1', '[He] 2s1'],
    ['s', 1798, 1.57, 1.85, 1287, 2470, '+2', '[He] 2s2'],
    ['s', 1808, 2.04, 2.08, 2076, 3927, '+3', '[He] 2s2 2p1'],
    ['s', 0, 2.55, 2.267, 3550, 4027, '-4, +2, +4', '[He] 2s2 2p2'],
    ['g', 1772, 3.04, 0.001251, -210, -196, '-3, +3, +5', '[He] 2s2 2p3'],
    ['g', 1774, 3.44, 0.001429, -219, -183, '-2, +2', '[He] 2s2 2p4'],
    ['g', 1886, 3.98, 0.001696, -220, -188, '-1', '[He] 2s2 2p5'],
    ['g', 1898, 0, 0.000900, -249, -246, '0', '[He] 2s2 2p6'],
    ['s', 1807, 0.93, 0.971, 98, 883, '+1', '[Ne] 3s1'],
    ['s', 1755, 1.31, 1.738, 650, 1090, '+2', '[Ne] 3s2'],
    ['s', 1825, 1.61, 2.70, 660, 2519, '+3', '[Ne] 3s2 3p1'],
    ['s', 1824, 1.90, 2.33, 1414, 3265, '+4', '[Ne] 3s2 3p2'],
    ['s', 1669, 2.19, 1.82, 44, 281, '-3, +3, +5', '[Ne] 3s2 3p3'],
    ['s', 0, 2.58, 2.07, 115, 445, '-2, +4, +6', '[Ne] 3s2 3p4'],
    ['g', 1774, 3.16, 0.003214, -102, -34, '-1, +1, +5, +7', '[Ne] 3s2 3p5'],
    ['g', 1894, 0, 0.001784, -189, -186, '0', '[Ne] 3s2 3p6'],
    ['s', 1807, 0.82, 0.862, 64, 759, '+1', '[Ar] 4s1'],
    ['s', 1808, 1.00, 1.54, 842, 1484, '+2', '[Ar] 4s2'],
    ['s', 1879, 1.36, 2.99, 1541, 2836, '+3', '[Ar] 3d1 4s2'],
    ['s', 1791, 1.54, 4.51, 1668, 3287, '+2, +3, +4', '[Ar] 3d2 4s2'],
    ['s', 1801, 1.63, 6.11, 1910, 3407, '+2, +3, +4, +5', '[Ar] 3d3 4s2'],
    ['s', 1797, 1.66, 7.15, 1907, 2671, '+2, +3, +6', '[Ar] 3d5 4s1'],
    ['s', 1774, 1.55, 7.21, 1246, 2061, '+2, +4, +7', '[Ar] 3d5 4s2'],
    ['s', 0, 1.83, 7.87, 1538, 2862, '+2, +3', '[Ar] 3d6 4s2'],
    ['s', 1735, 1.88, 8.90, 1495, 2927, '+2, +3', '[Ar] 3d7 4s2'],
    ['s', 1751, 1.91, 8.91, 1455, 2913, '+2', '[Ar] 3d8 4s2'],
    ['s', 0, 1.90, 8.96, 1085, 2562, '+1, +2', '[Ar] 3d10 4s1'],
    ['s', 0, 1.65, 7.14, 420, 907, '+2', '[Ar] 3d10 4s2'],
    ['s', 1875, 1.81, 5.91, 30, 2204, '+3', '[Ar] 3d10 4s2 4p1'],
    ['s', 1886, 2.01, 5.32, 938, 2833, '+2, +4', '[Ar] 3d10 4s2 4p2'],
    ['s', 0, 2.18, 5.73, 817, 614, '-3, +3, +5', '[Ar] 3d10 4s2 4p3'],
    ['s', 1817, 2.55, 4.81, 221, 685, '-2, +4, +6', '[Ar] 3d10 4s2 4p4'],
    ['l', 1826, 2.96, 3.12, -7, 59, '-1, +1, +5', '[Ar] 3d10 4s2 4p5'],
    ['g', 1898, 3.00, 0.003749, -157, -153, '0, +2', '[Ar] 3d10 4s2 4p6'],
    ['s', 1861, 0.82, 1.53, 39, 688, '+1', '[Kr] 5s1'],
    ['s', 1790, 0.95, 2.64, 777, 1382, '+2', '[Kr] 5s2'],
    ['s', 1794, 1.22, 4.47, 1526, 3336, '+3', '[Kr] 4d1 5s2'],
    ['s', 1789, 1.33, 6.52, 1855, 4409, '+4', '[Kr] 4d2 5s2'],
    ['s', 1801, 1.60, 8.57, 2477, 4744, '+3, +5', '[Kr] 4d4 5s1'],
    ['s', 1781, 2.16, 10.28, 2623, 4639, '+4, +6', '[Kr] 4d5 5s1'],
    ['s', 1937, 1.90, 11.50, 2157, 4265, '+4, +7', '[Kr] 4d5 5s2'],
    ['s', 1844, 2.20, 12.37, 2334, 4150, '+3, +4', '[Kr] 4d7 5s1'],
    ['s', 1803, 2.28, 12.45, 1964, 3695, '+3', '[Kr] 4d8 5s1'],
    ['s', 1803, 2.20, 12.02, 1555, 2963, '+2, +4', '[Kr] 4d10'],
    ['s', 0, 1.93, 10.49, 962, 2162, '+1', '[Kr] 4d10 5s1'],
    ['s', 1817, 1.69, 8.65, 321, 767, '+2', '[Kr] 4d10 5s2'],
    ['s', 1863, 1.78, 7.31, 157, 2072, '+3', '[Kr] 4d10 5s2 5p1'],
    ['s', 0, 1.96, 7.29, 232, 2602, '+2, +4', '[Kr] 4d10 5s2 5p2'],
    ['s', 0, 2.05, 6.70, 631, 1587, '-3, +3, +5', '[Kr] 4d10 5s2 5p3'],
    ['s', 1782, 2.10, 6.24, 450, 988, '-2, +4, +6', '[Kr] 4d10 5s2 5p4'],
    ['s', 1811, 2.66, 4.93, 114, 184, '-1, +1, +5, +7', '[Kr] 4d10 5s2 5p5'],
    ['g', 1898, 2.60, 0.005887, -112, -108, '0, +2, +4, +6', '[Kr] 4d10 5s2 5p6'],
    ['s', 1860, 0.79, 1.87, 28, 671, '+1', '[Xe] 6s1'],
    ['s', 1808, 0.89, 3.51, 727, 1845, '+2', '[Xe] 6s2'],
    ['s', 1839, 1.10, 6.15, 920, 3464, '+3', '[Xe] 5d1 6s2'],
    ['s', 1803, 1.12, 6.77, 799, 3426, '+3, +4', '[Xe] 4f1 5d1 6s2'],
    ['s', 1885, 1.13, 6.77, 931, 3512, '+3', '[Xe] 4f3 6s2'],
    ['s', 1885, 1.14, 7.01, 1021, 3074, '+3', '[Xe] 4f4 6s2'],
    ['s', 1945, 0, 7.26, 1042, 3000, '+3', '[Xe] 4f5 6s2'],
    ['s', 1879, 1.17, 7.52, 1074, 1794, '+2, +3', '[Xe] 4f6 6s2'],
    ['s', 1901, 0, 5.24, 822, 1529, '+2, +3', '[Xe] 4f7 6s2'],
    ['s', 1880, 1.20, 7.90, 1313, 3273, '+3', '[Xe] 4f7 5d1 6s2'],
    ['s', 1843, 0, 8.23, 1356, 3230, '+3', '[Xe] 4f9 6s2'],
    ['s', 1886, 1.22, 8.55, 1412, 2567, '+3', '[Xe] 4f10 6s2'],
    ['s', 1867, 1.23, 8.80, 1474, 2700, '+3', '[Xe] 4f11 6s2'],
    ['s', 1843, 1.24, 9.07, 1529, 2868, '+3', '[Xe] 4f12 6s2'],
    ['s', 1879, 1.25, 9.32, 1545, 1950, '+3', '[Xe] 4f13 6s2'],
    ['s', 1878, 0, 6.90, 824, 1196, '+2, +3', '[Xe] 4f14 6s2'],
    ['s', 1907, 1.27, 9.84, 1663, 3402, '+3', '[Xe] 4f14 5d1 6s2'],
    ['s', 1923, 1.30, 13.31, 2233, 4603, '+4', '[Xe] 4f14 5d2 6s2'],
    ['s', 1802, 1.50, 16.65, 3017, 5458, '+5', '[Xe] 4f14 5d3 6s2'],
    ['s', 1783, 2.36, 19.25, 3422, 5555, '+4, +6', '[Xe] 4f14 5d4 6s2'],
    ['s', 1925, 1.90, 21.02, 3186, 5596, '+4, +7', '[Xe] 4f14 5d5 6s2'],
    ['s', 1803, 2.20, 22.59, 3033, 5012, '+3, +4', '[Xe] 4f14 5d6 6s2'],
    ['s', 1803, 2.20, 22.56, 2466, 4428, '+3, +4', '[Xe] 4f14 5d7 6s2'],
    ['s', 1735, 2.28, 21.45, 1768, 3825, '+2, +4', '[Xe] 4f14 5d9 6s1'],
    ['s', 0, 2.54, 19.3, 1064, 2970, '+1, +3', '[Xe] 4f14 5d10 6s1'],
    ['l', 0, 2.00, 13.53, -39, 357, '+1, +2', '[Xe] 4f14 5d10 6s2'],
    ['s', 1861, 1.62, 11.85, 304, 1473, '+1, +3', '[Xe] 4f14 5d10 6s2 6p1'],
    ['s', 0, 2.33, 11.34, 327, 1749, '+2, +4', '[Xe] 4f14 5d10 6s2 6p2'],
    ['s', 1753, 2.02, 9.78, 271, 1564, '+3, +5', '[Xe] 4f14 5d10 6s2 6p3'],
    ['s', 1898, 2.00, 9.20, 254, 962, '+2, +4', '[Xe] 4f14 5d10 6s2 6p4'],
    ['s', 1940, 2.20, 7.00, 302, 337, '-1, +1, +5', '[Xe] 4f14 5d10 6s2 6p5'],
    ['g', 1900, 0, 0.00973, -71, -62, '0, +2', '[Xe] 4f14 5d10 6s2 6p6'],
    ['s', 1939, 0.70, 1.87, 27, 677, '+1', '[Rn] 7s1'],
    ['s', 1898, 0.90, 5.50, 700, 1737, '+2', '[Rn] 7s2'],
    ['s', 1899, 1.10, 10.07, 1051, 3198, '+3', '[Rn] 6d1 7s2'],
    ['s', 1829, 1.30, 11.72, 1750, 4788, '+4', '[Rn] 6d2 7s2'],
    ['s', 1913, 1.50, 15.37, 1572, 4000, '+5', '[Rn] 5f2 6d1 7s2'],
    ['s', 1789, 1.38, 18.95, 1135, 4131, '+3, +4, +6', '[Rn] 5f3 6d1 7s2'],
    ['s', 1940, 1.36, 20.25, 644, 4000, '+3, +4, +5', '[Rn] 5f4 6d1 7s2'],
    ['s', 1940, 1.28, 19.82, 640, 3230, '+3, +4, +6', '[Rn] 5f6 7s2'],
    ['s', 1944, 1.30, 13.67, 1176, 2011, '+3', '[Rn] 5f7 7s2'],
    ['s', 1944, 1.30, 13.51, 1345, 3110, '+3', '[Rn] 5f7 6d1 7s2'],
    ['s', 1949, 1.30, 14.78, 1050, 2627, '+3', '[Rn] 5f9 7s2'],
    ['s', 1950, 1.30, 15.10, 900, 1470, '+3', '[Rn] 5f10 7s2'],
    ['s', 1952, 1.30, 8.84, 860, 996, '+3', '[Rn] 5f11 7s2'],
    ['s', 1952, 1.30, 0, 1527, 0, '+3', '[Rn] 5f12 7s2'],
    ['s', 1955, 1.30, 0, 827, 0, '+3', '[Rn] 5f13 7s2'],
    ['s', 1958, 1.30, 0, 827, 0, '+3', '[Rn] 5f14 7s2'],
    ['s', 1961, 1.30, 0, 1627, 0, '+3', '[Rn] 5f14 7s2 7p1'],
    ['u', 1964, 0, 0, 0, 0, '+4', '[Rn] 5f14 6d2 7s2'],
    ['u', 1967, 0, 0, 0, 0, '', '[Rn] 5f14 6d3 7s2'],
    ['u', 1974, 0, 0, 0, 0, '', '[Rn] 5f14 6d4 7s2'],
    ['u', 1981, 0, 0, 0, 0, '', '[Rn] 5f14 6d5 7s2'],
    ['u', 1984, 0, 0, 0, 0, '', '[Rn] 5f14 6d6 7s2'],
    ['u', 1982, 0, 0, 0, 0, '', '[Rn] 5f14 6d7 7s2'],
    ['u', 1994, 0, 0, 0, 0, '', '[Rn] 5f14 6d8 7s2'],
    ['u', 1994, 0, 0, 0, 0, '', '[Rn] 5f14 6d9 7s2'],
    ['u', 1996, 0, 0, 0, 0, '', '[Rn] 5f14 6d10 7s2'],
    ['u', 2004, 0, 0, 0, 0, '', '[Rn] 5f14 6d10 7s2 7p1'],
    ['u', 1998, 0, 0, 0, 0, '', '[Rn] 5f14 6d10 7s2 7p2'],
    ['u', 2003, 0, 0, 0, 0, '', '[Rn] 5f14 6d10 7s2 7p3'],
    ['u', 2000, 0, 0, 0, 0, '', '[Rn] 5f14 6d10 7s2 7p4'],
    ['u', 2010, 0, 0, 0, 0, '', '[Rn] 5f14 6d10 7s2 7p5'],
    ['u', 2006, 0, 0, 0, 0, '0', '[Rn] 5f14 6d10 7s2 7p6']
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
  var SHORT = {
    alkali: 'Alkali',
    'alkaline-earth': 'Earth',
    transition: 'Transition',
    'post-transition': 'Other',
    metalloid: 'Metalloid',
    nonmetal: 'Nonmetal',
    halogen: 'Halogen',
    noble: 'Noble',
    lanthanide: 'La',
    actinide: 'Ac'
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
  // Ptable-like cell fills (pastel, dark ink). Distinct at 20px.
  var FILLS = {
    alkali: '#e8b4ff',
    'alkaline-earth': '#b8c2ff',
    transition: '#9de8b8',
    'post-transition': '#9eeaf0',
    metalloid: '#efe08a',
    nonmetal: '#ffa3e0',
    halogen: '#9ee7ff',
    noble: '#ffb0bb',
    lanthanide: '#f3e08a',
    actinide: '#ffc078'
  };
  var STATE_LABEL = { s: 'Solid', l: 'Liquid', g: 'Gas', u: 'Unknown' };

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
  function blockOf(z, g) {
    if ((z >= 57 && z <= 71) || (z >= 89 && z <= 103)) return 'f';
    if (z === 2) return 's';
    if (g === 1 || g === 2) return 's';
    if (g >= 3 && g <= 12) return 'd';
    return 'p';
  }
  // Visual cell in a 9×18 grid (lanthanides row 8, actinides row 9).
  function cellOf(z) {
    if (z >= 57 && z <= 71) return { r: 7, c: (z - 57) + 2 };
    if (z >= 89 && z <= 103) return { r: 8, c: (z - 89) + 2 };
    var g = groupOf(z);
    return { r: periodOf(z) - 1, c: g - 1 };
  }

  if (EXTRA.length !== RAW.length) {
    throw new Error('EXTRA length ' + EXTRA.length + ' != RAW ' + RAW.length);
  }

  var ELEMENTS = [];
  var BY_Z = {};
  var BY_SYM = {};
  var BY_NAME = {};
  var i, row, x, el, g;
  for (i = 0; i < RAW.length; i++) {
    row = RAW[i];
    x = EXTRA[i];
    g = groupOf(row[0]);
    el = {
      z: row[0],
      symbol: row[1],
      name: row[2],
      mass: row[3],
      category: row[4],
      shells: row[5],
      period: periodOf(row[0]),
      group: g,
      block: blockOf(row[0], g),
      cell: cellOf(row[0]),
      state: x[0],
      year: x[1],
      eneg: x[2],
      density: x[3],
      melt: x[4],
      boil: x[5],
      ox: x[6],
      config: x[7]
    };
    ELEMENTS.push(el);
    BY_Z[el.z] = el;
    BY_SYM[el.symbol] = el;
    BY_NAME[el.name.toLowerCase()] = el;
  }
  if (BY_Z[118]) BY_Z[118].former = 'Ununoctium';

  function byZ(z) { return BY_Z[z] || null; }
  function bySymbol(s) {
    if (!s) return null;
    var k = String(s);
    if (BY_SYM[k]) return BY_SYM[k];
    var low = k.toLowerCase();
    for (i = 0; i < ELEMENTS.length; i++) {
      if (ELEMENTS[i].symbol.toLowerCase() === low) return ELEMENTS[i];
    }
    return null;
  }
  function byName(n) { return BY_NAME[String(n).toLowerCase()] || null; }

  function findEl(q) {
    if (q == null || q === '') return null;
    var s = String(q).trim();
    if (!s) return null;
    var n = parseInt(s, 10);
    if (String(n) === s && n >= 1 && n <= 118) return byZ(n);
    return bySymbol(s) || byName(s);
  }

  function dash(v) { return (v === 0 || v === '' || v == null) ? '—' : String(v); }
  function yearText(y) {
    if (y === 0) return 'Ancient';
    if (!y) return '—';
    return String(y);
  }
  function densText(d) {
    if (!d) return '—';
    if (d < 0.05) return (Math.round(d * 1e6) / 1000) + ' g/L';
    return d + ' g/cm³';
  }
  function tempText(t) {
    if (t === 0 || t === '' || t == null) return '—';
    return t + ' °C';
  }

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

  function pickNear(rand, el, take, used) {
    var pool = [], e, d, v, k;
    for (k = 0; k < ELEMENTS.length; k++) {
      e = ELEMENTS[k];
      if (e.z === el.z) continue;
      d = e.z - el.z;
      if (d < 0) d = -d;
      if (e.period === el.period || e.category === el.category || d <= 6) pool.push(e);
    }
    shuffleIn(rand, pool);
    for (k = 0; k < pool.length; k++) {
      v = take(pool[k]);
      if (!used[v]) return v;
    }
    for (k = 0; k < ELEMENTS.length; k++) {
      v = take(ELEMENTS[(el.z + k * 7) % ELEMENTS.length]);
      if (!used[v]) return v;
    }
    return take(ELEMENTS[(el.z * 3) % ELEMENTS.length]);
  }

  function fillChoices(rand, correct, take, el) {
    var used = {}, choices = [correct], v, guard = 0;
    used[correct] = 1;
    while (choices.length < 4 && guard < 40) {
      guard++;
      v = pickNear(rand, el, take, used);
      if (used[v]) continue;
      used[v] = 1;
      choices.push(v);
    }
    shuffleIn(rand, choices);
    return choices;
  }

  function answerIndex(choices, correct) {
    var i, a = 0;
    for (i = 0; i < choices.length; i++) if (choices[i] === correct) a = i;
    return a;
  }

  // School-table first (H–Kr), then through radon, then the rest. Same seed → same pick.
  function pickEl(rand, index) {
    var r = rand();
    if (index < 5 || r < 0.62) return ELEMENTS[(rand() * 36) | 0];
    if (r < 0.88) return ELEMENTS[(rand() * 86) | 0];
    return ELEMENTS[(rand() * ELEMENTS.length) | 0];
  }

  // One quiz item: 4 choices, exactly one right. Same seed+index → same item.
  function quizItem(seed, index) {
    var rand = mulberry((seed >>> 0) * 1 + (index + 1) * 2654435761);
    var roll = rand();
    var el = pickEl(rand, index);
    var kind, prompt, correct, choices, take, cat, pool, k, other, v;
    if (roll < 0.26) {
      kind = 0;
      prompt = 'What is the symbol for ' + el.name + '?';
      correct = el.symbol;
      take = function (n) { return n.symbol; };
      choices = fillChoices(rand, correct, take, el);
    } else if (roll < 0.48) {
      kind = 1;
      prompt = 'Which number is ' + el.symbol + '?';
      correct = String(el.z);
      take = function (n) { return String(n.z); };
      choices = fillChoices(rand, correct, take, el);
    } else if (roll < 0.70) {
      kind = 2;
      prompt = 'What is the name of ' + el.symbol + '?';
      correct = el.name;
      take = function (n) { return n.name; };
      choices = fillChoices(rand, correct, take, el);
    } else if (roll < 0.82) {
      kind = 3;
      prompt = el.name + ' is a…';
      correct = LABELS[el.category];
      choices = catChoices(rand, el);
    } else if (roll < 0.92) {
      kind = 4;
      cat = CATS[(rand() * 8) | 0];
      pool = [];
      for (k = 0; k < ELEMENTS.length; k++) if (ELEMENTS[k].category === cat) pool.push(ELEMENTS[k]);
      el = pool[(rand() * Math.min(4, pool.length)) | 0];
      prompt = 'Which of these is in the ' + LABELS[cat].toLowerCase() + ' family?';
      correct = el.symbol;
      choices = [el.symbol];
      var seen = {};
      seen[el.symbol] = 1;
      seen[el.category] = 1;
      while (choices.length < 4) {
        other = ELEMENTS[(rand() * ELEMENTS.length) | 0];
        if (other.category === cat || seen[other.symbol]) continue;
        seen[other.symbol] = 1;
        choices.push(other.symbol);
      }
      shuffleIn(rand, choices);
    } else {
      kind = 5;
      prompt = 'What period is ' + el.symbol + ' in?';
      correct = String(el.period);
      choices = [correct];
      var usedP = {};
      usedP[correct] = 1;
      while (choices.length < 4) {
        v = String(1 + ((rand() * 7) | 0));
        if (usedP[v]) continue;
        usedP[v] = 1;
        choices.push(v);
      }
      shuffleIn(rand, choices);
    }
    return {
      prompt: prompt,
      choices: choices,
      answer: answerIndex(choices, correct),
      z: el.z,
      kind: kind
    };

    function catChoices(rand, el) {
      var correct = LABELS[el.category];
      var opts = [correct], seen = {}, c, lab;
      seen[el.category] = 1;
      while (opts.length < 4) {
        c = CATS[(rand() * CATS.length) | 0];
        if (seen[c]) continue;
        seen[c] = 1;
        lab = LABELS[c];
        if (lab === correct) continue;
        opts.push(lab);
      }
      shuffleIn(rand, opts);
      return opts;
    }
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
    SHORT: SHORT,
    COLORS: COLORS,
    FILLS: FILLS,
    STATE_LABEL: STATE_LABEL,
    RACE: 10,
    byZ: byZ,
    bySymbol: bySymbol,
    byName: byName,
    findEl: findEl,
    periodOf: periodOf,
    groupOf: groupOf,
    cellOf: cellOf,
    yearText: yearText,
    densText: densText,
    tempText: tempText,
    dash: dash,
    quizItem: quizItem,
    quiz: quiz,
    mulberry: mulberry,
    HYDROCARBONS: HYDROCARBONS,
    INDICATORS: INDICATORS,
    SOLUBILITY: SOLUBILITY
  };
})(typeof window !== 'undefined' ? window : this);
