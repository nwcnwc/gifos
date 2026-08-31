/*
 * Custom blocks for Puzzle, Maze, and Turtle.
 * Walked as a tree at run time — the sandbox has no eval.
 */
(function (root) {
  'use strict';

  var MOVEMENT = 290, LOOPS = 120, LOGIC = 210, TURTLE = 160, COLOUR = 20, MATH = 230;
  var ANIMAL = 120, PICTURE = 30, TRAIT = 290;

  function markerSrc() {
    return (root.BG_ASSETS && root.BG_ASSETS.marker) || '';
  }

  function initCommon() {
    if (!root.Blockly.Blocks['math_number']) {
      root.Blockly.defineBlocksWithJsonArray([
        {
          type: 'math_number',
          message0: '%1',
          args0: [{ type: 'field_number', name: 'NUM', value: 0 }],
          output: 'Number',
          colour: MATH
        },
        {
          type: 'colour_picker',
          message0: '%1',
          args0: [{ type: 'field_colour', name: 'COLOUR', colour: '#ff0000' }],
          output: 'Colour',
          colour: COLOUR
        }
      ]);
    }
  }

  function initMaze() {
    if (root.Blockly.Blocks['maze_moveForward']) return;
    root.Blockly.defineBlocksWithJsonArray([
      {
        type: 'maze_moveForward',
        message0: 'move forward',
        previousStatement: null,
        nextStatement: null,
        colour: MOVEMENT,
        tooltip: 'Moves the player forward one space.'
      },
      {
        type: 'maze_turn',
        message0: '%1',
        args0: [{
          type: 'field_dropdown',
          name: 'DIR',
          options: [
            ['turn left  \u21BA', 'turnLeft'],
            ['turn right  \u21BB', 'turnRight']
          ]
        }],
        previousStatement: null,
        nextStatement: null,
        colour: MOVEMENT,
        tooltip: 'Turns the player left or right by 90 degrees.'
      },
      {
        type: 'maze_if',
        message0: '%1 %2 do %3',
        args0: [
          {
            type: 'field_dropdown',
            name: 'DIR',
            options: [
              ['if path ahead', 'isPathForward'],
              ['if path to the left  \u21BA', 'isPathLeft'],
              ['if path to the right  \u21BB', 'isPathRight']
            ]
          },
          { type: 'input_dummy' },
          { type: 'input_statement', name: 'DO' }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: LOGIC,
        tooltip: 'If there is a path in the specified direction, then do some actions.'
      },
      {
        type: 'maze_ifElse',
        message0: '%1 %2 do %3 else %4',
        args0: [
          {
            type: 'field_dropdown',
            name: 'DIR',
            options: [
              ['if path ahead', 'isPathForward'],
              ['if path to the left  \u21BA', 'isPathLeft'],
              ['if path to the right  \u21BB', 'isPathRight']
            ]
          },
          { type: 'input_dummy' },
          { type: 'input_statement', name: 'DO' },
          { type: 'input_statement', name: 'ELSE' }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: LOGIC,
        tooltip: 'If there is a path, do the first actions. Otherwise, do the second.'
      },
      {
        type: 'maze_forever',
        message0: 'repeat until %1 %2 do %3',
        args0: [
          { type: 'field_image', src: markerSrc(), width: 12, height: 16 },
          { type: 'input_dummy' },
          { type: 'input_statement', name: 'DO' }
        ],
        previousStatement: null,
        colour: LOOPS,
        tooltip: 'Repeat the enclosed actions until the finish is reached.'
      }
    ]);
  }

  function initTurtle() {
    if (root.Blockly.Blocks['turtle_move_internal']) return;
    if (root.Blockly.FieldColour) {
      root.Blockly.FieldColour.COLUMNS = 3;
      root.Blockly.FieldColour.COLOURS = [
        '#ff0000', '#ffcc33', '#ffff00',
        '#009900', '#3333ff', '#cc33cc',
        '#ffffff', '#999999', '#000000'
      ];
    }
    root.Blockly.defineBlocksWithJsonArray([
      {
        type: 'turtle_move_internal',
        message0: '%1 %2',
        args0: [
          {
            type: 'field_dropdown',
            name: 'DIR',
            options: [
              ['move forward by', 'moveForward'],
              ['move backward by', 'moveBackward']
            ]
          },
          {
            type: 'field_dropdown',
            name: 'VALUE',
            options: [['20', '20'], ['50', '50'], ['100', '100'], ['150', '150']]
          }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: TURTLE
      },
      {
        type: 'turtle_turn_internal',
        message0: '%1 %2',
        args0: [
          {
            type: 'field_dropdown',
            name: 'DIR',
            options: [
              ['turn right by  \u21BB', 'turnRight'],
              ['turn left by  \u21BA', 'turnLeft']
            ]
          },
          {
            type: 'field_dropdown',
            name: 'VALUE',
            options: [
              ['1\u00B0', '1'], ['45\u00B0', '45'], ['72\u00B0', '72'],
              ['90\u00B0', '90'], ['120\u00B0', '120'], ['144\u00B0', '144']
            ]
          }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: TURTLE
      },
      {
        type: 'turtle_move',
        message0: '%1 %2',
        args0: [
          {
            type: 'field_dropdown',
            name: 'DIR',
            options: [
              ['move forward by', 'moveForward'],
              ['move backward by', 'moveBackward']
            ]
          },
          { type: 'input_value', name: 'VALUE', check: 'Number' }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: TURTLE
      },
      {
        type: 'turtle_turn',
        message0: '%1 %2',
        args0: [
          {
            type: 'field_dropdown',
            name: 'DIR',
            options: [
              ['turn right by  \u21BB', 'turnRight'],
              ['turn left by  \u21BA', 'turnLeft']
            ]
          },
          { type: 'input_value', name: 'VALUE', check: 'Number' }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: TURTLE
      },
      {
        type: 'turtle_pen',
        message0: '%1',
        args0: [{
          type: 'field_dropdown',
          name: 'PEN',
          options: [['pen up', 'penUp'], ['pen down', 'penDown']]
        }],
        previousStatement: null,
        nextStatement: null,
        colour: TURTLE
      },
      {
        type: 'turtle_colour_internal',
        message0: 'set colour to %1',
        args0: [{ type: 'field_colour', name: 'COLOUR', colour: '#ff0000' }],
        previousStatement: null,
        nextStatement: null,
        colour: COLOUR
      },
      {
        type: 'turtle_colour',
        message0: 'set colour to %1',
        args0: [{ type: 'input_value', name: 'COLOUR', check: 'Colour' }],
        previousStatement: null,
        nextStatement: null,
        colour: COLOUR
      },
      {
        type: 'turtle_width',
        message0: 'set width to %1',
        args0: [{ type: 'input_value', name: 'WIDTH', check: 'Number' }],
        previousStatement: null,
        nextStatement: null,
        colour: TURTLE
      },
      {
        type: 'turtle_repeat_internal',
        message0: 'repeat %1 times %2 do %3',
        args0: [
          {
            type: 'field_dropdown',
            name: 'TIMES',
            options: [['3', '3'], ['4', '4'], ['5', '5'], ['360', '360']]
          },
          { type: 'input_dummy' },
          { type: 'input_statement', name: 'DO' }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: LOOPS
      },
      {
        type: 'controls_repeat_ext',
        message0: 'repeat %1 times %2 do %3',
        args0: [
          { type: 'input_value', name: 'TIMES', check: 'Number' },
          { type: 'input_dummy' },
          { type: 'input_statement', name: 'DO' }
        ],
        previousStatement: null,
        nextStatement: null,
        colour: LOOPS
      }
    ]);
  }

  function puzzleData() {
    var A = root.BG_ASSETS || {};
    return [
      { name: 'Duck', pic: A.duck, legs: 2, traits: ['Feathers', 'Beak'] },
      { name: 'Cat', pic: A.cat, legs: 4, traits: ['Whiskers', 'Fur'] },
      { name: 'Bee', pic: A.bee, legs: 6, traits: ['Honey', 'Stinger'] },
      { name: 'Snail', pic: A.snail, legs: 0, traits: ['Shell', 'Slime'] }
    ];
  }

  function legsList() {
    var data = puzzleData();
    var pad = '\u00a0\u00a0';
    var list = [['choose...', '0']];
    var items = data.map(function (d, i) { return { legs: d.legs, id: i + 1 }; });
    items.sort(function (a, b) { return a.legs - b.legs; });
    for (var i = 0; i < items.length; i++) {
      list.push([pad + items[i].legs + pad, String(items[i].id)]);
    }
    return list;
  }

  function initPuzzle() {
    if (root.Blockly.Blocks['animal']) return;
    var Align = (root.Blockly.ALIGN_RIGHT != null) ? root.Blockly.ALIGN_RIGHT : 2;

    root.Blockly.Blocks['animal'] = {
      init: function () {
        this.setColour(ANIMAL);
        this.appendDummyInput().appendField('', 'NAME');
        this.appendValueInput('PIC').setAlign(Align).appendField('picture:');
        this.appendDummyInput()
          .setAlign(Align)
          .appendField('legs:')
          .appendField(new root.Blockly.FieldDropdown(legsList), 'LEGS');
        this.appendStatementInput('TRAITS').appendField('traits:');
        this.setInputsInline(false);
      },
      mutationToDom: function () {
        var c = document.createElement('mutation');
        c.setAttribute('animal', this.animal);
        return c;
      },
      domToMutation: function (xml) {
        this.populate(parseInt(xml.getAttribute('animal'), 10));
      },
      animal: 0,
      populate: function (n) {
        var data = puzzleData();
        this.animal = n;
        this.setFieldValue(data[n - 1].name, 'NAME');
      },
      isCorrect: function () {
        return Number(this.getFieldValue('LEGS')) === this.animal;
      }
    };

    root.Blockly.Blocks['picture'] = {
      init: function () {
        this.setColour(PICTURE);
        this.appendDummyInput('PIC');
        this.setOutput(true);
      },
      mutationToDom: root.Blockly.Blocks['animal'].mutationToDom,
      domToMutation: root.Blockly.Blocks['animal'].domToMutation,
      animal: 0,
      populate: function (n) {
        this.animal = n;
        var data = puzzleData()[n - 1];
        this.getInput('PIC').appendField(
          new root.Blockly.FieldImage(data.pic, data.pic ? 100 : 40, 70)
        );
      },
      isCorrect: function () {
        var p = this.getParent();
        return !!(p && p.animal === this.animal);
      }
    };

    root.Blockly.Blocks['trait'] = {
      init: function () {
        this.setColour(TRAIT);
        this.appendDummyInput().appendField('', 'NAME');
        this.setPreviousStatement(true);
        this.setNextStatement(true);
      },
      mutationToDom: function () {
        var c = document.createElement('mutation');
        c.setAttribute('animal', this.animal);
        c.setAttribute('trait', this.trait);
        return c;
      },
      domToMutation: function (xml) {
        this.populate(parseInt(xml.getAttribute('animal'), 10),
                      parseInt(xml.getAttribute('trait'), 10));
      },
      animal: 0,
      trait: 0,
      populate: function (n, m) {
        this.animal = n;
        this.trait = m;
        this.setFieldValue(puzzleData()[n - 1].traits[m - 1], 'NAME');
      },
      isCorrect: function () {
        var p = this.getSurroundParent();
        return !!(p && p.animal === this.animal);
      }
    };
  }

  function chain(block) {
    var out = [];
    while (block) {
      out.push(block);
      block = block.getNextBlock();
    }
    return out;
  }

  function numValue(block, name, fallback) {
    var t = block.getInputTargetBlock(name);
    if (!t) return fallback;
    if (t.type === 'math_number') return Number(t.getFieldValue('NUM'));
    return fallback;
  }

  function colourValue(block, name, fallback) {
    var t = block.getInputTargetBlock(name);
    if (!t) return fallback;
    if (t.type === 'colour_picker') return t.getFieldValue('COLOUR');
    return fallback;
  }

  root.BGBlocks = {
    initCommon: initCommon,
    initMaze: initMaze,
    initTurtle: initTurtle,
    initPuzzle: initPuzzle,
    puzzleData: puzzleData,
    chain: chain,
    numValue: numValue,
    colourValue: colourValue
  };
})(window);
