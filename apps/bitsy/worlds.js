/*
 * A few tiny worlds. The example is Adam le Doux's (BITSY_EXAMPLE_WORLD).
 * The others are original rooms that ship with this port.
 */
(function (root) {
  'use strict';

  var AVATAR = [
    '00011000',
    '00011000',
    '00011000',
    '00111100',
    '01111110',
    '10111101',
    '00100100',
    '00100100'
  ].join('\n');

  var BLOCK = [
    '11111111',
    '10000001',
    '10000001',
    '10011001',
    '10011001',
    '10000001',
    '10000001',
    '11111111'
  ].join('\n');

  function mapBox(inner) {
    var rows = [];
    var y, x, row, t;
    for (y = 0; y < 16; y++) {
      row = [];
      for (x = 0; x < 16; x++) {
        t = (x === 0 || y === 0 || x === 15 || y === 15) ? 'a' : '0';
        if (inner && inner[y] && inner[y][x]) t = inner[y][x];
        row.push(t);
      }
      rows.push(row.join(','));
    }
    return rows.join('\n');
  }

  function flags() {
    return [
      '# BITSY VERSION 8.15',
      '',
      '! VER_MAJ 8',
      '! VER_MIN 15',
      '! ROOM_FORMAT 1',
      '! DLG_COMPAT 0',
      '! TXT_MODE 0'
    ].join('\n');
  }

  var blank = [
    'a blank room',
    '',
    flags(),
    '',
    'PAL 0',
    '0,82,204',
    '128,159,255',
    '255,255,255',
    'NAME blueprint',
    '',
    'ROOM 0',
    mapBox(),
    'NAME empty room',
    'PAL 0',
    '',
    'TIL a',
    BLOCK,
    'NAME block',
    '',
    'SPR A',
    AVATAR,
    'POS 0 7,7',
    ''
  ].join('\n');

  var porchInner = {};
  (function () {
    var y, x;
    for (y = 1; y < 15; y++) {
      porchInner[y] = {};
      for (x = 1; x < 15; x++) porchInner[y][x] = 'b';
    }
    for (x = 0; x < 16; x++) {
      porchInner[0] = porchInner[0] || {};
      porchInner[0][x] = 'a';
      porchInner[15] = porchInner[15] || {};
      porchInner[15][x] = (x > 5 && x < 10) ? 'b' : 'a';
    }
    for (y = 0; y < 16; y++) {
      porchInner[y] = porchInner[y] || {};
      porchInner[y][0] = 'a';
      porchInner[y][15] = 'a';
    }
  })();

  var porch = [
    'the porch',
    '',
    flags(),
    '',
    'PAL 0',
    '24,16,48',
    '200,110,80',
    '255,230,190',
    'NAME evening',
    '',
    'ROOM 0',
    mapBox(porchInner),
    'NAME the porch',
    'PAL 0',
    'ITM 0 11,8',
    '',
    'TIL a',
    [
      '11111111',
      '11111111',
      '11011011',
      '11111111',
      '11111111',
      '11011011',
      '11111111',
      '11111111'
    ].join('\n'),
    'NAME wall',
    'WAL true',
    '',
    'TIL b',
    [
      '11111111',
      '10000001',
      '11111111',
      '10000001',
      '11111111',
      '10000001',
      '11111111',
      '10000001'
    ].join('\n'),
    'NAME boards',
    'WAL false',
    '',
    'SPR A',
    AVATAR,
    'POS 0 8,12',
    '',
    'SPR a',
    [
      '00011000',
      '00111100',
      '01111110',
      '00011000',
      '00011000',
      '00111100',
      '00100100',
      '01100110'
    ].join('\n'),
    'NAME plant',
    'DLG 0',
    'POS 0 4,10',
    '',
    'ITM 0',
    [
      '00000000',
      '00111110',
      '00100010',
      '00101010',
      '00100010',
      '00111110',
      '00000000',
      '00000000'
    ].join('\n'),
    'NAME note',
    'DLG 1',
    '',
    'DLG 0',
    'a little plant. it is doing its best',
    'NAME plant',
    '',
    'DLG 1',
    'the air is warm tonight',
    'NAME note',
    ''
  ].join('\n');

  var hallInner = {};
  var gardenInner = {};
  (function () {
    var y, x;
    for (y = 1; y < 15; y++) {
      hallInner[y] = {};
      gardenInner[y] = {};
      for (x = 1; x < 15; x++) {
        hallInner[y][x] = 'b';
        gardenInner[y][x] = (y > 10 && (x + y) % 3 === 0) ? 'c' : 'b';
      }
    }
    for (x = 0; x < 16; x++) {
      hallInner[0] = hallInner[0] || {};
      hallInner[0][x] = (x === 8) ? '0' : 'a';
      hallInner[15] = hallInner[15] || {};
      hallInner[15][x] = 'a';
      gardenInner[0] = gardenInner[0] || {};
      gardenInner[0][x] = 'a';
      gardenInner[15] = gardenInner[15] || {};
      gardenInner[15][x] = (x === 8) ? '0' : 'a';
    }
    for (y = 0; y < 16; y++) {
      hallInner[y] = hallInner[y] || {};
      hallInner[y][0] = 'a';
      hallInner[y][15] = 'a';
      gardenInner[y] = gardenInner[y] || {};
      gardenInner[y][0] = 'a';
      gardenInner[y][15] = 'a';
    }
  })();

  var nextdoor = [
    'next door',
    '',
    flags(),
    '',
    'PAL 0',
    '40,28,60',
    '160,90,120',
    '255,220,210',
    'NAME indoor',
    '',
    'PAL 1',
    '20,70,40',
    '70,150,60',
    '255,255,200',
    'NAME garden',
    '',
    'ROOM 0',
    mapBox(hallInner),
    'NAME inside',
    'PAL 0',
    'EXT 8,0 1 8,14',
    '',
    'ROOM 1',
    mapBox(gardenInner),
    'NAME the garden',
    'PAL 1',
    'EXT 8,15 0 8,1',
    '',
    'TIL a',
    BLOCK,
    'NAME wall',
    'WAL true',
    '',
    'TIL b',
    [
      '00000000',
      '00000000',
      '00000000',
      '00000000',
      '00000000',
      '00000000',
      '00000000',
      '00000000'
    ].join('\n'),
    'NAME floor',
    'WAL false',
    '',
    'TIL c',
    [
      '00000000',
      '00011000',
      '00111100',
      '00011000',
      '00011000',
      '00000000',
      '00000000',
      '00000000'
    ].join('\n'),
    'NAME sprout',
    'WAL false',
    '',
    'SPR A',
    AVATAR,
    'POS 0 8,10',
    '',
    'SPR a',
    [
      '00000000',
      '00100100',
      '00111100',
      '01011010',
      '00111100',
      '00011000',
      '00100100',
      '00100100'
    ].join('\n'),
    'NAME neighbour',
    'DLG 0',
    'POS 1 8,6',
    '',
    'DLG 0',
    'i come out here when the house is too quiet',
    'NAME neighbour',
    ''
  ].join('\n');

  root.BitsyWorlds = [
    { id: 'example', name: 'the example', data: root.BITSY_EXAMPLE_WORLD || '' },
    { id: 'blank', name: 'a blank room', data: blank },
    { id: 'porch', name: 'the porch', data: porch },
    { id: 'nextdoor', name: 'next door', data: nextdoor }
  ];
})(window);
