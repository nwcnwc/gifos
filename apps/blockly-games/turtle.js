/*
 * Turtle — ten drawing levels from Blockly Games. Answer layer is the
 * faint picture; alpha pixels are compared the same way upstream does.
 */
(function (root) {
  'use strict';

  var W = 400, H = 400;
  var canvas, ctx, ans, scratch, workspace, level = 1;
  var tx, ty, th, pen, visible, timers = [], running = false;
  var HINTS = [
    'Create a program that draws a square.',
    'Change your program to draw a pentagon instead of a square.',
    'There is a new block that changes the colour. Draw a yellow star.',
    'Lift the pen off the paper when you move. Draw a small yellow star, then a line above it.',
    'Instead of one star, draw four stars arranged in a square.',
    'Draw three yellow stars and one white line.',
    'Draw the stars, then draw four white lines.',
    'Drawing 360 white lines will look like the full moon.',
    'Add a black circle so the moon becomes a crescent.',
    'Draw anything you want. You have a huge number of new blocks. Have fun!'
  ];

  function speedMs() {
    var v = root.BG && root.BG.speed ? root.BG.speed() : 50;
    return Math.max(1, Math.pow(1 - v / 100, 2) * 400);
  }

  function resetTurtle() {
    tx = W / 2; ty = H / 2; th = 0; pen = true; visible = true;
    scratch.canvas.width = W;
    scratch.strokeStyle = '#fff';
    scratch.fillStyle = '#fff';
    scratch.lineWidth = 5;
    scratch.lineCap = 'round';
    display();
  }

  function display() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.2;
    ctx.drawImage(ans.canvas, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(scratch.canvas, 0, 0);
    if (!visible) return;
    ctx.strokeStyle = scratch.strokeStyle;
    ctx.fillStyle = scratch.fillStyle;
    var r = scratch.lineWidth / 2 + 10;
    ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.stroke();
    var rad = th * Math.PI / 180;
    var tipX = tx + (r + 10) * Math.sin(rad);
    var tipY = ty - (r + 10) * Math.cos(rad);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tx + (r + 4) * Math.sin(rad - 0.3), ty - (r + 4) * Math.cos(rad - 0.3));
    ctx.lineTo(tx + (r + 4) * Math.sin(rad + 0.3), ty - (r + 4) * Math.cos(rad + 0.3));
    ctx.closePath(); ctx.fill();
  }

  function move(dist) {
    if (pen) { scratch.beginPath(); scratch.moveTo(tx, ty); }
    var rad = th * Math.PI / 180;
    tx += dist * Math.sin(rad);
    ty -= dist * Math.cos(rad);
    if (pen) { scratch.lineTo(tx, ty || 0.1); scratch.stroke(); }
  }
  function turn(deg) { th = (th + deg + 360) % 360; }
  function colour(c) { scratch.strokeStyle = c; scratch.fillStyle = c; }

  function drawStar(len) {
    for (var i = 0; i < 5; i++) { move(len); turn(144); }
  }

  function answer(lv) {
    resetTurtle();
    switch (lv) {
      case 1: for (var i = 0; i < 4; i++) { move(100); turn(90); } break;
      case 2: for (i = 0; i < 5; i++) { move(100); turn(72); } break;
      case 3: colour('#ffff00'); drawStar(100); break;
      case 4: colour('#ffff00'); drawStar(50); pen = false; move(150); pen = true; move(20); break;
      case 5:
        colour('#ffff00');
        for (i = 0; i < 4; i++) { drawStar(50); pen = false; move(150); turn(90); pen = true; }
        break;
      case 6:
        colour('#ffff00');
        for (i = 0; i < 3; i++) { drawStar(50); pen = false; move(150); turn(120); pen = true; }
        pen = false; turn(-90); move(100); pen = true; colour('#ffffff'); move(50);
        break;
      case 7:
        colour('#ffff00');
        for (i = 0; i < 3; i++) { drawStar(50); pen = false; move(150); turn(120); pen = true; }
        pen = false; turn(-90); move(100); pen = true; colour('#ffffff');
        for (i = 0; i < 4; i++) { move(50); move(-50); turn(45); }
        break;
      case 8:
        colour('#ffff00');
        for (i = 0; i < 3; i++) { drawStar(50); pen = false; move(150); turn(120); pen = true; }
        pen = false; turn(-90); move(100); pen = true; colour('#ffffff');
        for (i = 0; i < 360; i++) { move(50); move(-50); turn(1); }
        break;
      case 9:
        colour('#ffff00');
        for (i = 0; i < 3; i++) { drawStar(50); pen = false; move(150); turn(120); pen = true; }
        pen = false; turn(-90); move(100); pen = true; colour('#ffffff');
        for (i = 0; i < 360; i++) { move(50); move(-50); turn(1); }
        turn(120); move(20); colour('#000000');
        for (i = 0; i < 360; i++) { move(50); move(-50); turn(1); }
        break;
    }
    ans.globalCompositeOperation = 'copy';
    ans.drawImage(scratch.canvas, 0, 0);
    ans.globalCompositeOperation = 'source-over';
  }

  function compile(block) {
    var ops = [], t, v;
    var B = root.BGBlocks;
    while (block) {
      t = block.type;
      if (t === 'turtle_move_internal' || t === 'turtle_move') {
        v = t === 'turtle_move' ? B.numValue(block, 'VALUE', 0) : Number(block.getFieldValue('VALUE'));
        ops.push({ op: block.getFieldValue('DIR'), v: v, id: block.id });
      } else if (t === 'turtle_turn_internal' || t === 'turtle_turn') {
        v = t === 'turtle_turn' ? B.numValue(block, 'VALUE', 0) : Number(block.getFieldValue('VALUE'));
        ops.push({ op: block.getFieldValue('DIR'), v: v, id: block.id });
      } else if (t === 'turtle_pen') {
        ops.push({ op: block.getFieldValue('PEN'), id: block.id });
      } else if (t === 'turtle_colour_internal') {
        ops.push({ op: 'colour', v: block.getFieldValue('COLOUR'), id: block.id });
      } else if (t === 'turtle_colour') {
        ops.push({ op: 'colour', v: B.colourValue(block, 'COLOUR', '#000000'), id: block.id });
      } else if (t === 'turtle_width') {
        ops.push({ op: 'width', v: B.numValue(block, 'WIDTH', 1), id: block.id });
      } else if (t === 'turtle_repeat_internal' || t === 'controls_repeat_ext') {
        v = t === 'controls_repeat_ext' ? B.numValue(block, 'TIMES', 0) : Number(block.getFieldValue('TIMES'));
        ops.push({ op: 'repeat', n: v, body: compile(block.getInputTargetBlock('DO')), id: block.id });
      }
      block = block.getNextBlock();
    }
    return ops;
  }

  function flatten(ops, out) {
    var i, j, op;
    for (i = 0; i < ops.length; i++) {
      op = ops[i];
      if (op.op === 'repeat') {
        for (j = 0; j < op.n; j++) flatten(op.body, out);
      } else out.push(op);
    }
  }

  function apply(op) {
    if (op.op === 'moveForward') move(op.v);
    else if (op.op === 'moveBackward') move(-op.v);
    else if (op.op === 'turnRight') turn(op.v);
    else if (op.op === 'turnLeft') turn(-op.v);
    else if (op.op === 'penUp') pen = false;
    else if (op.op === 'penDown') pen = true;
    else if (op.op === 'colour') colour(op.v);
    else if (op.op === 'width') scratch.lineWidth = op.v;
  }

  function pixelErrors() {
    var u = scratch.getImageData(0, 0, W, H).data;
    var a = ans.getImageData(0, 0, W, H).data;
    var i, d = 0;
    for (i = 3; i < u.length; i += 4) {
      if (Math.abs(u[i] - a[i]) > 64) d++;
    }
    return d;
  }

  function isCorrect(delta) {
    if (level === 10) return workspace.getAllBlocks(false).length > 1;
    var cap = level === 9 ? 600 : (level === 8 ? 350 : 100);
    if (delta > cap) return false;
    var n = workspace.getAllBlocks(false).length;
    if ((level <= 2 && n > 3) || (level === 3 && n > 4) || (level === 5 && n > 10)) {
      return 'loop';
    }
    return true;
  }

  function highlight(id) {
    if (workspace && workspace.highlightBlock) workspace.highlightBlock(id || null);
  }

  function play(list, i, onDone) {
    if (i >= list.length) {
      highlight(null);
      display();
      running = false;
      onDone(isCorrect(pixelErrors()));
      return;
    }
    highlight(list[i].id);
    apply(list[i]);
    display();
    timers.push(setTimeout(function () { play(list, i + 1, onDone); }, speedMs()));
  }

  function toolboxFor(lv) {
    if (lv === 10) {
      return {
        kind: 'categoryToolbox',
        contents: [
          { kind: 'category', name: 'Turtle', contents: [
            { kind: 'block', type: 'turtle_move', inputs: { VALUE: { shadow: { type: 'math_number', fields: { NUM: 10 } } } } },
            { kind: 'block', type: 'turtle_turn', inputs: { VALUE: { shadow: { type: 'math_number', fields: { NUM: 90 } } } } },
            { kind: 'block', type: 'turtle_width', inputs: { WIDTH: { shadow: { type: 'math_number', fields: { NUM: 1 } } } } },
            { kind: 'block', type: 'turtle_pen' }
          ]},
          { kind: 'category', name: 'Colour', contents: [
            { kind: 'block', type: 'turtle_colour', inputs: { COLOUR: { shadow: { type: 'colour_picker' } } } },
            { kind: 'block', type: 'colour_picker' }
          ]},
          { kind: 'category', name: 'Loops', contents: [
            { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 4 } } } } }
          ]}
        ]
      };
    }
    var c = [
      { kind: 'block', type: 'turtle_move_internal', fields: { VALUE: '100' } },
      { kind: 'block', type: 'turtle_turn_internal', fields: { VALUE: '90' } }
    ];
    if (lv > 3) c.push({ kind: 'block', type: 'turtle_pen' });
    if (lv > 2) c.push({ kind: 'block', type: 'turtle_colour_internal' });
    c.push({ kind: 'block', type: 'turtle_repeat_internal', fields: { TIMES: '4' } });
    return { kind: 'flyoutToolbox', contents: c };
  }

  function defaultXml(lv) {
    if (lv === 10) {
      return '<xml xmlns="https://developers.google.com/blockly/xml"><block type="turtle_move" x="70" y="70"><value name="VALUE"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block></xml>';
    }
    return '<xml xmlns="https://developers.google.com/blockly/xml"><block type="turtle_move_internal" x="70" y="70"><field name="VALUE">100</field></block></xml>';
  }

  root.TurtleGame = {
    maxLevel: 10,
    maxBlocks: function () { return Infinity; },
    toolbox: toolboxFor,
    defaultXml: defaultXml,
    hint: function (lv) { return HINTS[lv - 1]; },
    mount: function (ws, canvasEl, lv) {
      workspace = ws; canvas = canvasEl; level = lv;
      ctx = canvas.getContext('2d');
      scratch = document.createElement('canvas'); scratch.width = W; scratch.height = H;
      scratch = scratch.getContext('2d');
      ans = document.createElement('canvas'); ans.width = W; ans.height = H;
      ans = ans.getContext('2d');
      answer(lv);
      resetTurtle();
    },
    run: function (onDone) {
      if (running) return;
      timers.forEach(clearTimeout); timers = [];
      resetTurtle();
      var tops = workspace.getTopBlocks(true);
      var ops = compile(tops[0] || null);
      var flat = []; flatten(ops, flat);
      if (level < 10 && flat.length > 2000) { onDone(false); return; }
      running = true;
      play(flat, 0, onDone);
    },
    reset: function () {
      timers.forEach(clearTimeout); timers = []; running = false;
      highlight(null); resetTurtle();
    },
    resize: function () { if (ctx) display(); }
  };
})(window);
