/*
 * Sample netlists in DigitalJS JSON. Counter and ALU are original to this
 * port; full adder, LFSR and latch are the upstream teaching examples.
 */
(function (root) {
  'use strict';

  var COUNTER = {
    devices: {
      clk: { type: 'Clock', label: 'clk', net: 'clk', bits: 1, propagation: 10 },
      rst: { type: 'Button', label: 'reset', net: 'reset', bits: 1 },
      cnt: {
        type: 'Dff', label: 'count', bits: 4,
        polarity: { clock: true, arst: true },
        arst_value: '0000',
        initial: '0000'
      },
      one: { type: 'Constant', label: '+1', constant: '0001' },
      add: { type: 'Addition', label: 'inc', bits: { in1: 4, in2: 4, out: 4 } },
      hex: { type: 'NumDisplay', label: 'value', net: 'value', bits: 4, numbase: 'hex' },
      split: { type: 'BusUngroup', groups: [1, 1, 1, 1] },
      q0: { type: 'Lamp', label: 'q0', bits: 1 },
      q1: { type: 'Lamp', label: 'q1', bits: 1 },
      q2: { type: 'Lamp', label: 'q2', bits: 1 },
      q3: { type: 'Lamp', label: 'q3', bits: 1 }
    },
    connectors: [
      { from: { id: 'clk', port: 'out' }, to: { id: 'cnt', port: 'clk' } },
      { from: { id: 'rst', port: 'out' }, to: { id: 'cnt', port: 'arst' } },
      { from: { id: 'cnt', port: 'out' }, to: { id: 'add', port: 'in1' } },
      { from: { id: 'one', port: 'out' }, to: { id: 'add', port: 'in2' } },
      { from: { id: 'add', port: 'out' }, to: { id: 'cnt', port: 'in' } },
      { from: { id: 'cnt', port: 'out' }, to: { id: 'hex', port: 'in' } },
      { from: { id: 'cnt', port: 'out' }, to: { id: 'split', port: 'in' } },
      { from: { id: 'split', port: 'out0' }, to: { id: 'q0', port: 'in' } },
      { from: { id: 'split', port: 'out1' }, to: { id: 'q1', port: 'in' } },
      { from: { id: 'split', port: 'out2' }, to: { id: 'q2', port: 'in' } },
      { from: { id: 'split', port: 'out3' }, to: { id: 'q3', port: 'in' } }
    ],
    subcircuits: {}
  };

  var ALU = {
    devices: {
      a: { type: 'NumEntry', label: 'A', net: 'A', bits: 4, numbase: 'hex' },
      b: { type: 'NumEntry', label: 'B', net: 'B', bits: 4, numbase: 'hex' },
      op: { type: 'Button', label: 'sub', net: 'sub', bits: 1 },
      add: { type: 'Addition', label: '+', bits: { in1: 4, in2: 4, out: 4 } },
      sub: { type: 'Subtraction', label: '−', bits: { in1: 4, in2: 4, out: 4 } },
      mux: { type: 'Mux', label: 'op', bits: { in: 4, sel: 1 } },
      y: { type: 'NumDisplay', label: 'Y', net: 'Y', bits: 4, numbase: 'hex' }
    },
    connectors: [
      { from: { id: 'a', port: 'out' }, to: { id: 'add', port: 'in1' } },
      { from: { id: 'b', port: 'out' }, to: { id: 'add', port: 'in2' } },
      { from: { id: 'a', port: 'out' }, to: { id: 'sub', port: 'in1' } },
      { from: { id: 'b', port: 'out' }, to: { id: 'sub', port: 'in2' } },
      { from: { id: 'add', port: 'out' }, to: { id: 'mux', port: 'in0' } },
      { from: { id: 'sub', port: 'out' }, to: { id: 'mux', port: 'in1' } },
      { from: { id: 'op', port: 'out' }, to: { id: 'mux', port: 'sel' } },
      { from: { id: 'mux', port: 'out' }, to: { id: 'y', port: 'in' } }
    ],
    subcircuits: {}
  };

  var FULLADDER = {
    devices: {
      dev0: { type: 'Button', label: 'a', net: 'a', order: 0, bits: 1 },
      dev1: { type: 'Button', label: 'b', net: 'b', order: 1, bits: 1 },
      dev2: { type: 'Button', label: 'cin', net: 'cin', order: 2, bits: 1 },
      dev3: { type: 'Lamp', label: 'sum', net: 'sum', order: 3, bits: 1 },
      dev4: { type: 'Lamp', label: 'cout', net: 'cout', order: 4, bits: 1 },
      dev5: { type: 'Or', label: 'or', bits: 1 },
      dev6: { type: 'Subcircuit', label: 'ha1', celltype: 'halfadder' },
      dev7: { type: 'Subcircuit', label: 'ha2', celltype: 'halfadder' }
    },
    connectors: [
      { to: { id: 'dev6', port: 'a' }, from: { id: 'dev0', port: 'out' }, name: 'a' },
      { to: { id: 'dev6', port: 'b' }, from: { id: 'dev1', port: 'out' }, name: 'b' },
      { to: { id: 'dev7', port: 'b' }, from: { id: 'dev2', port: 'out' }, name: 'cin' },
      { to: { id: 'dev3', port: 'in' }, from: { id: 'dev7', port: 'o' }, name: 'sum' },
      { to: { id: 'dev4', port: 'in' }, from: { id: 'dev5', port: 'out' }, name: 'cout' },
      { to: { id: 'dev5', port: 'in1' }, from: { id: 'dev6', port: 'c' }, name: 'c1' },
      { to: { id: 'dev5', port: 'in2' }, from: { id: 'dev7', port: 'c' }, name: 'c2' },
      { to: { id: 'dev7', port: 'a' }, from: { id: 'dev6', port: 'o' }, name: 't' }
    ],
    subcircuits: {
      halfadder: {
        devices: {
          dev0: { type: 'Input', label: 'a', net: 'a', order: 0, bits: 1 },
          dev1: { type: 'Input', label: 'b', net: 'b', order: 1, bits: 1 },
          dev2: { type: 'Output', label: 'o', net: 'o', order: 2, bits: 1 },
          dev3: { type: 'Output', label: 'c', net: 'c', order: 3, bits: 1 },
          dev4: { type: 'And', label: 'and', bits: 1 },
          dev5: { type: 'Xor', label: 'xor', bits: 1 }
        },
        connectors: [
          { to: { id: 'dev4', port: 'in1' }, from: { id: 'dev0', port: 'out' } },
          { to: { id: 'dev5', port: 'in1' }, from: { id: 'dev0', port: 'out' } },
          { to: { id: 'dev4', port: 'in2' }, from: { id: 'dev1', port: 'out' } },
          { to: { id: 'dev5', port: 'in2' }, from: { id: 'dev1', port: 'out' } },
          { to: { id: 'dev2', port: 'in' }, from: { id: 'dev5', port: 'out' } },
          { to: { id: 'dev3', port: 'in' }, from: { id: 'dev4', port: 'out' } }
        ]
      }
    }
  };

  var LFSR = {
    devices: {
      dev0: { type: 'NumDisplay', label: 'out', net: 'out', order: 0, bits: 8 },
      dev1: { type: 'Clock', label: 'clk', net: 'clk', order: 1, bits: 1, propagation: 10 },
      dev2: { type: 'Button', label: 'reset', net: 'reset', order: 2, bits: 1 },
      dev4: {
        label: 'reg', type: 'Dff', bits: 8,
        polarity: { clock: true, arst: true },
        arst_value: '00000001',
        initial: '00000001'
      },
      dev5: { label: 'fb', type: 'Xnor', bits: 1 },
      dev6: { type: 'BusGroup', groups: [1, 7] },
      dev7: { type: 'BusSlice', slice: { first: 7, count: 1, total: 8 } },
      dev8: { type: 'BusSlice', slice: { first: 3, count: 1, total: 8 } },
      dev9: { type: 'BusSlice', slice: { first: 0, count: 7, total: 8 } }
    },
    connectors: [
      { to: { id: 'dev0', port: 'in' }, from: { id: 'dev4', port: 'out' }, name: 'out' },
      { to: { id: 'dev7', port: 'in' }, from: { id: 'dev4', port: 'out' }, name: 'out' },
      { to: { id: 'dev8', port: 'in' }, from: { id: 'dev4', port: 'out' }, name: 'out' },
      { to: { id: 'dev9', port: 'in' }, from: { id: 'dev4', port: 'out' }, name: 'out' },
      { to: { id: 'dev4', port: 'clk' }, from: { id: 'dev1', port: 'out' }, name: 'clk' },
      { to: { id: 'dev4', port: 'arst' }, from: { id: 'dev2', port: 'out' }, name: 'reset' },
      { to: { id: 'dev6', port: 'in0' }, from: { id: 'dev5', port: 'out' }, name: 'linear_feedback' },
      { to: { id: 'dev4', port: 'in' }, from: { id: 'dev6', port: 'out' } },
      { to: { id: 'dev5', port: 'in1' }, from: { id: 'dev7', port: 'out' } },
      { to: { id: 'dev5', port: 'in2' }, from: { id: 'dev8', port: 'out' } },
      { to: { id: 'dev6', port: 'in1' }, from: { id: 'dev9', port: 'out' } }
    ],
    subcircuits: {}
  };

  var LATCH = {
    devices: {
      dev0: { type: 'Button', net: 'd', order: 0, bits: 1, label: 'd' },
      dev1: { type: 'Button', net: 'en', order: 1, bits: 1, label: 'en' },
      dev2: { type: 'Lamp', net: 'q', order: 2, bits: 1, label: 'q' },
      dev3: { label: 'latch', type: 'Dff', bits: 1, polarity: { enable: true }, initial: '0' }
    },
    connectors: [
      { to: { id: 'dev3', port: 'in' }, from: { id: 'dev0', port: 'out' }, name: 'd' },
      { to: { id: 'dev3', port: 'en' }, from: { id: 'dev1', port: 'out' }, name: 'en' },
      { to: { id: 'dev2', port: 'in' }, from: { id: 'dev3', port: 'out' }, name: 'q' }
    ],
    subcircuits: {}
  };

  var CATALOG = [
    { id: 'counter', name: '4-bit counter', blurb: 'Clock + reset. Watch the nibble climb.', json: COUNTER },
    { id: 'alu', name: '4-bit add/sub', blurb: 'Type A and B. Press sub to subtract.', json: ALU },
    { id: 'fulladder', name: 'Full adder', blurb: 'Two half-adders. Tap a, b, cin.', json: FULLADDER },
    { id: 'lfsr', name: '8-bit LFSR', blurb: 'A shifting random-looking byte.', json: LFSR },
    { id: 'latch', name: 'D-latch', blurb: 'Hold D while enable is on.', json: LATCH }
  ];

  function clone(id) {
    var i, item;
    for (i = 0; i < CATALOG.length; i++) {
      if (CATALOG[i].id === id) {
        item = CATALOG[i];
        return JSON.parse(JSON.stringify(item.json));
      }
    }
    return JSON.parse(JSON.stringify(COUNTER));
  }

  function byId(id) {
    var i;
    for (i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i];
    return CATALOG[0];
  }

  root.DjsCircuits = {
    DEFAULT: 'counter',
    catalog: CATALOG,
    clone: clone,
    byId: byId
  };
})(typeof window !== 'undefined' ? window : this);
