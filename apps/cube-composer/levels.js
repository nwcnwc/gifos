// All six chapters, copied from sharkdp/cube-composer src/Levels/.
(function (root) {
  'use strict';

  var CC = root.CC;
  var T = CC;

  var Y = 'Yellow', R = 'Red', C = 'Cyan', B = 'Brown', O = 'Orange';

  function tr(id, name, fn) { return { id: id, name: name, fn: fn }; }
  function lv(id, name, difficulty, help, initial, target) {
    return { id: id, name: name, difficulty: difficulty, help: help, initial: initial, target: target };
  }

  var chapters = [
    {
      name: 'Introduction',
      transformers: [
        tr('replaceYbyR', 'map {Yellow}↦{Red}', T.replaceSingle(Y, R)),
        tr('stackY', 'map (stack {Yellow})', T.mapStack(Y)),
        tr('replaceYbyYR', 'map {Yellow}↦[{Red}{Yellow}]', T.replaceMultiple(Y, [Y, R])),
        tr('rejectY', 'map (reject {Yellow})', T.mapReject(Y))
      ],
      levels: [
        lv('0.1', 'Transformation', 'Easy',
          'In this game, your goal is to create a sequence of functions which transforms the colored cubes into the desired pattern (shown above). To change yellow cubes to red cubes, add the function `replaceYbyR` to your program.',
          [[Y, Y, R], [Y, R], [R], [R], [Y, R], [Y, Y, R]],
          [[R, R, R], [R, R], [R], [R], [R, R], [R, R, R]]),
        lv('0.2', 'Rejection', 'Easy',
          'To remove all cubes of a specified color, use the <code>reject</code> function.',
          [[Y, Y, R], [Y, R], [R], [R], [Y, R], [Y, Y, R]],
          [[R], [R], [R], [R], [R], [R]]),
        lv('0.3', 'Composition', 'Easy',
          'Most levels require a combination of two or more functions. Try to add the functions `stackY` and `rejectY` to your program. Note that you can change the order of the functions by dragging. Try to understand the effect of `stackY` by observing how the cubes change.',
          [[Y, Y, R], [Y, R], [R], [R], [Y, R], [Y, Y, R]],
          [[R, Y], [R, Y], [R, Y], [R, Y], [R, Y], [R, Y]]),
        lv('0.4', 'Spanish flag', 'Medium',
          'Try this on your own. You need to compose three functions.',
          [[Y, Y, R], [Y, R], [R], [R], [Y, R], [Y, Y, R]],
          [[R, Y, R], [R, Y, R], [R, Y, R], [R, Y, R], [R, Y, R], [R, Y, R]])
      ]
    },
    {
      name: 'Chapter 1',
      transformers: [
        tr('mapYtoYR', 'map {Yellow}↦[{Red}{Yellow}]', T.replaceMultiple(Y, [Y, R])),
        tr('mapCtoRC', 'map {Cyan}↦[{Cyan}{Red}]', T.replaceMultiple(C, [R, C])),
        tr('rejectY', 'map (reject {Yellow})', T.mapReject(Y)),
        tr('rejectC', 'map (reject {Cyan})', T.mapReject(C)),
        tr('filterContainsR', 'filter (contains {Red})', function (w) {
          return T.clearEmpty(w.filter(function (s) { return s.indexOf(R) >= 0; }));
        }),
        tr('stackR', 'map (stack {Red})', T.mapStack(R)),
        tr('mapReverse', 'map reverse', function (w) {
          return w.map(function (s) { return s.slice().reverse(); });
        })
      ],
      levels: [
        lv('1.1', 'Mercury', 'Easy',
          'There are some new types of functions in this chapter. We will introduce them when they are needed. Note that you can always skip levels and come back later.',
          [[R, R], [R, Y], [C, Y], [C, C]],
          [[R, R, R], [R, Y, R], [R, Y, R], [R, R, R]]),
        lv('1.2', 'Venus', 'Medium',
          'The function `filterContainsR` removes columns without a red cube.',
          [[R, R], [R, Y], [C, Y], [C, C]],
          [[R, R], [R, R]]),
        lv('1.3', 'Earth', 'Easy',
          'You can flip each column vertically with `mapReverse`.',
          [[C, C, Y], [C, R], [C, R], [C, C, Y]],
          [[R, C, C], [R, C], [R, C], [R, C, C]]),
        lv('1.4', 'Mars', 'Medium',
          'In case you were wondering: the level names <s>have a rather deep philosophical meaning</s> are chosen randomly.',
          [[R, R], [R, Y], [C, Y], [C, C]],
          [[R, R], [R, R], [R, R], [R, R]])
      ]
    },
    {
      name: 'Chapter 2',
      transformers: [
        tr('replaceYbyB', 'map {Yellow}↦{Brown}', T.replaceSingle(Y, B)),
        tr('replaceYbyBY', 'map {Yellow}↦[{Yellow}{Brown}]', T.replaceMultiple(Y, [B, Y])),
        tr('replaceBbyOO', 'map {Brown}↦[{Orange}{Orange}]', T.replaceMultiple(B, [O, O])),
        tr('rejectO', 'map (reject {Orange})', T.mapReject(O)),
        tr('stackY', 'map (stack {Yellow})', T.mapStack(Y)),
        tr('stackEqualColumns', 'stackEqualColumns', T.stackEqualColumns)
      ],
      levels: [
        lv('2.1', 'Bricklayer', 'Easy',
          'This chapter introduces a new function `stackEqualColumns`. It takes <i>adjacent equal columns</i> and stacks them on top of each other. Try it!',
          [[B], [O], [O], [Y], [Y], [Y], [O], [O], [B]],
          [[B], [O, O], [B, B, B], [O, O], [B]]),
        lv('2.2', 'Gizeh', 'Medium',
          'You are on your own now...',
          [[B], [O], [O], [Y], [Y], [Y], [O], [O], [B]],
          [[B, B], [O, B, O, B], [B, B, B, B, B, B], [O, B, O, B], [B, B]]),
        lv('2.3', 'Poseidon', 'Hard',
          null,
          [[B], [O], [O], [Y], [Y], [Y], [O], [O], [B]],
          [[B, B], [B], [B, B, B, B], [B], [B, B]]),
        lv('2.4', 'Bowl', 'Hard',
          null,
          [[B], [O], [O], [B]],
          [[O, O, O, O], [O, O], [O, O], [O, O, O, O]]),
        lv('2.5', 'Stamp', 'Hard',
          null,
          [[B], [O], [O], [Y], [Y], [Y], [O], [O], [B]],
          [[Y], [Y], [Y, Y, Y, Y], [Y], [Y]])
      ]
    },
    {
      name: 'Chapter 3',
      transformers: [
        tr('mapXtoOX', 'map {X}↦[{X}{Orange}]', T.mapXtoOX),
        tr('mapCXtoX', 'map [{X}{Cyan}]↦{X}', function (w) { return w.map(T.cxToX); }),
        tr('mapOOtoC', 'map [{Orange}{Orange}]↦{Cyan}', function (w) { return w.map(T.ooToC); }),
        tr('mapCtoO', 'map {Cyan}↦{Orange}', T.replaceSingle(C, O))
      ],
      levels: [
        lv('3.1', 'Brick', 'Easy',
          'This chapter introduces wildcard cubes: {X}.',
          [[C, O], [C, C, O], [O, O], [C, C, O], [C, O]],
          [[C], [C, O], [C], [C, O], [C]]),
        lv('3.2', 'Fort', 'Hard',
          null,
          [[C, O], [C, C, O], [O, O], [C, C, O], [C, O]],
          [[O, C], [O, O], [O, C], [O, O], [O, C]]),
        lv('3.3', 'Castle', 'Medium',
          null,
          [[O], [O, O], [O, O, O], [O, O, O, O], [O, O, O], [O, O], [O]],
          [[O, O], [O, C], [O, O], [O, C], [O, O], [O, C], [O, O]])
      ]
    },
    {
      name: 'Chapter 4',
      transformers: [
        tr('replaceYbyR', 'map {Yellow}↦{Red}', T.replaceSingle(Y, R)),
        tr('replaceRbyC', 'map {Red}↦{Cyan}', T.replaceSingle(R, C)),
        tr('replaceCbyY', 'map {Cyan}↦{Yellow}', T.replaceSingle(C, Y)),
        tr('partitionContainsC', 'partition (contains {Cyan})', T.partitionContains(C)),
        tr('partitionContainsR', 'partition (contains {Red})', T.partitionContains(R))
      ],
      levels: [
        lv('4.1', 'Take sides!', 'Easy',
          'This chapter introduces partitioning. The function `partitionContainsR` reorders the columns so that the columns which do not contain a red cube are grouped on the left, and the columns which do are grouped on the right.',
          [[C, R], [C, C], [R, R], [C, C], [C, R]],
          [[C, C], [C, C], [C, R], [R, R], [C, R]]),
        lv('4.2', 'Take sides – again!', 'Medium',
          'Note that within each partition – the columns which don\'t satisfy the condition and the columns which do – the order remains the same as it was prior to partitioning.',
          [[C, R], [C, C], [R, R], [C, C], [C, R]],
          [[C, C], [C, C], [R, R], [C, R], [C, R]]),
        lv('4.3', 'Shift', 'Medium',
          'Can you partition this?',
          [[C, R], [R, C], [C, R], [R, C], [C, R]],
          [[R, C], [C, R], [R, C], [C, R], [R, C]]),
        lv('4.4', 'Robot eyes', 'Medium',
          null,
          [[B, B, B], [B, Y, B], [B, B, B], [B, Y, B], [B, B, B]],
          [[B, B, B], [B, B, B], [B, B, B], [B, Y, B], [B, Y, B]]),
        lv('4.5', 'Mountains', 'Hard',
          null,
          [[B, B, R, R], [B, B, B, C], [B, Y, Y, Y], [B, B, B, R], [B, B, C, C], [B, B, Y, Y]],
          [[B, C, C, C], [B, B, C, C], [B, B, C, C], [B, B, B, C], [B, B, B, C], [B, B, C, C]])
      ]
    },
    {
      name: 'Chapter 5',
      transformers: [
        tr('mapAdd1', 'map (+1)', T.mapNumbers(function (x) { return x + 1; })),
        tr('mapSub1', 'map (-1)', T.mapNumbers(function (x) { return x - 1; })),
        tr('mapMul2', 'map (×2)', T.mapNumbers(function (x) { return x * 2; })),
        tr('mapPow2', 'map (^2)', T.mapNumbers(function (x) { return x * x; })),
        tr('filterEven', 'filter even', T.filterEven)
      ],
      levels: [
        lv('5.1', '0b0 .. 0b111', 'Medium',
          'What could be the meaning of the title <code>0b0 .. 0b111</code>? Read from top to bottom. Calculate modulo eight.',
          [0, 1, 2, 3, 4, 5, 6, 7].map(T.toAStack),
          [1, 3, 5, 7, 1, 3, 5, 7].map(T.toAStack)),
        lv('5.2', 'Odd..', 'Easy',
          null,
          [0, 1, 2, 3, 4, 5, 6, 7].map(T.toAStack),
          [1, 3, 5, 7].map(T.toAStack)),
        lv('5.3', 'Zero', 'Hard',
          null,
          [0, 1, 2, 3, 4, 5, 6, 7].map(T.toAStack),
          [0, 0, 0, 0, 0, 0, 0, 0].map(T.toAStack)),
        lv('5.4', 'Don\'t panic', 'Hard',
          'This is the last level … for now. I hope you enjoyed the game.',
          [0, 1, 2, 3, 4, 5, 6, 7].map(T.toAStack),
          [4, 2, 4, 2, 4, 2, 4, 2].map(T.toAStack))
      ]
    }
  ];

  var allLevels = [];
  var byId = {};
  var chapterOf = {};
  chapters.forEach(function (ch) {
    var lookup = {};
    ch.transformers.forEach(function (t) { lookup[t.id] = t; });
    ch.lookup = lookup;
    ch.levels.forEach(function (level) {
      allLevels.push(level);
      byId[level.id] = level;
      chapterOf[level.id] = ch;
    });
  });

  CC.chapters = chapters;
  CC.allLevels = allLevels;
  CC.getLevel = function (id) { return byId[id]; };
  CC.getChapter = function (id) { return chapterOf[id]; };
  CC.firstLevel = allLevels[0].id;
  CC.nextLevel = function (id) {
    var i;
    for (i = 0; i < allLevels.length - 1; i++) if (allLevels[i].id === id) return allLevels[i + 1].id;
    return id;
  };
  CC.prevLevel = function (id) {
    var i;
    for (i = 1; i < allLevels.length; i++) if (allLevels[i].id === id) return allLevels[i - 1].id;
    return id;
  };
  CC.levelTitle = function (level) {
    return level.id + ' — ' + level.name + ' (' + level.difficulty + ')';
  };
  CC.getFns = function (chapter, ids) {
    var out = [], i, t;
    for (i = 0; i < ids.length; i++) {
      t = chapter.lookup[ids[i]];
      if (t) out.push(t.fn);
    }
    return out;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
