/*
 * Puzzle — four animals, their pictures, legs, and traits. One screen.
 * Blocks are shuffled onto the workspace the same way upstream does.
 */
(function (root) {
  'use strict';

  var workspace, canvas, onChange;

  function shuffle(arr) {
    var i, j, t;
    for (i = arr.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  }

  function seed() {
    var data = root.BGBlocks.puzzleData();
    var animals = [], pics = [], traits = [], i, j, b;
    for (i = 0; i < data.length; i++) {
      b = workspace.newBlock('animal');
      b.populate(i + 1);
      animals.push(b);
      b = workspace.newBlock('picture');
      b.populate(i + 1);
      pics.push(b);
      for (j = 0; j < data[i].traits.length; j++) {
        b = workspace.newBlock('trait');
        b.populate(i + 1, j + 1);
        traits.push(b);
      }
    }
    shuffle(animals); shuffle(pics); shuffle(traits);
    var blocks = animals.concat(pics, traits);
    for (i = 0; i < blocks.length; i++) {
      blocks[i].setDeletable(false);
      blocks[i].initSvg();
      blocks[i].render();
    }
    root.Blockly.svgResize(workspace);
    var m = workspace.getMetrics();
    var ww = (m && (m.viewWidth || m.svgWidth)) || 640;
    var hh = (m && (m.viewHeight || m.svgHeight)) || 400;
    var x = 16, y = 16, rowH = 0;
    for (i = 0; i < blocks.length; i++) {
      var box = blocks[i].getSvgRoot().getBBox();
      if (x + box.width > ww - 24) { x = 16; y += rowH + 18; rowH = 0; }
      blocks[i].moveBy(x, y);
      x += box.width + 18;
      if (box.height > rowH) rowH = box.height;
    }
    workspace.clearUndo();
  }

  function paintStatus(text, ok) {
    var el = document.getElementById('puzzle-msg');
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.style.borderColor = ok ? '#3a9a3e' : '#3a4560';
  }

  function check() {
    var blocks = workspace.getAllBlocks(false);
    var errors = 0, i;
    for (i = 0; i < blocks.length; i++) {
      if (blocks[i].isCorrect && !blocks[i].isCorrect()) {
        errors++;
        blocks[i].select();
      }
    }
    var n = blocks.length;
    var msg;
    if (!errors) msg = 'Perfect! All ' + n + ' blocks are correct.';
    else if (errors === 1) msg = 'Almost! One block is incorrect. Keep trying.';
    else msg = errors + ' blocks are incorrect.';
    paintStatus(msg, errors === 0);
    return errors === 0;
  }

  root.PuzzleGame = {
    maxLevel: 1,
    maxBlocks: function () { return Infinity; },
    toolbox: function () { return { kind: 'flyoutToolbox', contents: [] }; },
    defaultXml: function () { return ''; },
    hint: function () {
      return 'For each animal (green), attach its picture, choose its number of legs, and make a stack of its traits.';
    },
    mount: function (ws, canvasEl) {
      workspace = ws;
      canvas = canvasEl;
      if (canvas) {
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0e121a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#9aa3b5';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Snap the pictures and traits onto the animals.', canvas.width / 2, canvas.height / 2);
      }
      paintStatus('', false);
    },
    seedIfEmpty: function () {
      if (!workspace.getAllBlocks(false).length) seed();
    },
    check: check,
    run: function (onDone) { onDone(check() ? 'win' : 'fail'); },
    reset: function () { paintStatus('', false); },
    resize: function () {}
  };
})(window);
