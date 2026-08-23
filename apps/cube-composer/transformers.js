// Cube-wall transformers. A Wall is an array of stacks; a stack is an array
// of colours, index 0 at the BOTTOM (PureScript List order). Each transformer
// is Wall -> Wall. Faithful to sharkdp/cube-composer src/Transformer.purs
// and the per-chapter helpers.
(function (root) {
  'use strict';

  var CC = root.CC = root.CC || {};

  function cloneWall(wall) {
    var out = [], i, j, s, t;
    for (i = 0; i < wall.length; i++) {
      s = wall[i]; t = [];
      for (j = 0; j < s.length; j++) t.push(s[j]);
      out.push(t);
    }
    return out;
  }

  function wallsEqual(a, b) {
    var i, j;
    if (!a || !b || a.length !== b.length) return false;
    for (i = 0; i < a.length; i++) {
      if (a[i].length !== b[i].length) return false;
      for (j = 0; j < a[i].length; j++) if (a[i][j] !== b[i][j]) return false;
    }
    return true;
  }

  function stacksEqual(a, b) {
    var i;
    if (a.length !== b.length) return false;
    for (i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function clearEmpty(wall) {
    var out = [], i;
    for (i = 0; i < wall.length; i++) if (wall[i].length) out.push(wall[i]);
    return out;
  }

  function mapReject(color) {
    return function (wall) {
      return clearEmpty(wall.map(function (stack) {
        return stack.filter(function (c) { return c !== color; });
      }));
    };
  }

  function mapStack(color) {
    return function (wall) {
      return wall.map(function (stack) { return stack.concat([color]); });
    };
  }

  function replaceSingle(a, b) {
    return function (wall) {
      return wall.map(function (stack) {
        return stack.map(function (c) { return c === a ? b : c; });
      });
    };
  }

  function replaceMultiple(a, bs) {
    return function (wall) {
      return wall.map(function (stack) {
        var out = [], i, j;
        for (i = 0; i < stack.length; i++) {
          if (stack[i] === a) for (j = 0; j < bs.length; j++) out.push(bs[j]);
          else out.push(stack[i]);
        }
        return out;
      });
    };
  }

  // Adjacent equal columns become one stacked column.
  function stackEqualColumns(wall) {
    var out = [], i = 0, j, k, merged;
    while (i < wall.length) {
      j = i + 1;
      while (j < wall.length && stacksEqual(wall[j], wall[i])) j++;
      merged = [];
      for (k = i; k < j; k++) merged = merged.concat(wall[k]);
      out.push(merged);
      i = j;
    }
    return out;
  }

  function partitionContains(cube) {
    return function (wall) {
      var no = [], yes = [], i;
      for (i = 0; i < wall.length; i++) {
        if (wall[i].indexOf(cube) >= 0) yes.push(wall[i]);
        else no.push(wall[i]);
      }
      return no.concat(yes);
    };
  }

  // Cyan under a cube → just that cube. Walks from the bottom.
  function cxToX(stack) {
    var out = [], i = 0;
    while (i < stack.length) {
      if (stack[i] === 'Cyan' && i + 1 < stack.length) {
        out.push(stack[i + 1]);
        i += 2;
      } else {
        out.push(stack[i]);
        i += 1;
      }
    }
    return out;
  }

  function ooToC(stack) {
    var out = [], i = 0;
    while (i < stack.length) {
      if (stack[i] === 'Orange' && i + 1 < stack.length && stack[i + 1] === 'Orange') {
        out.push('Cyan');
        i += 2;
      } else {
        out.push(stack[i]);
        i += 1;
      }
    }
    return out;
  }

  function mapXtoOX(wall) {
    return wall.map(function (stack) {
      var out = [], i;
      for (i = 0; i < stack.length; i++) {
        out.push('Orange');
        out.push(stack[i]);
      }
      return out;
    });
  }

  function toDigit(c) { return c === 'Orange' ? 0 : 1; }
  function toCube(n) { return n === 0 ? 'Orange' : 'Brown'; }

  // Bottom cube is the 1s bit, then 2s, then 4s. Extra cubes ignored.
  function toInt(stack) {
    var bits = [1, 2, 4], s = 0, i;
    for (i = 0; i < stack.length && i < 3; i++) s += bits[i] * toDigit(stack[i]);
    return s;
  }

  function digits(n) {
    n = n | 0;
    return [(n & 1) ? 1 : 0, (n & 2) ? 1 : 0, (n & 4) ? 1 : 0];
  }

  function toStack(n) { return digits(n).map(toCube); }
  function toAStack(n) { return toStack(n); }

  function mapNumbers(f) {
    return function (wall) {
      return wall.map(function (s) { return toStack(f(toInt(s))); });
    };
  }

  function filterEven(wall) {
    return wall.filter(function (s) { return (toInt(s) % 2) === 0; });
  }

  function allSteps(fns, initial) {
    var steps = [cloneWall(initial)], i, next;
    for (i = 0; i < fns.length; i++) {
      next = fns[i](steps[steps.length - 1]);
      steps.push(next);
    }
    return steps;
  }

  function transformed(fns, initial) {
    var wall = cloneWall(initial), i;
    for (i = 0; i < fns.length; i++) wall = fns[i](wall);
    return wall;
  }

  CC.cloneWall = cloneWall;
  CC.wallsEqual = wallsEqual;
  CC.clearEmpty = clearEmpty;
  CC.mapReject = mapReject;
  CC.mapStack = mapStack;
  CC.replaceSingle = replaceSingle;
  CC.replaceMultiple = replaceMultiple;
  CC.stackEqualColumns = stackEqualColumns;
  CC.partitionContains = partitionContains;
  CC.cxToX = cxToX;
  CC.ooToC = ooToC;
  CC.mapXtoOX = mapXtoOX;
  CC.toInt = toInt;
  CC.toStack = toStack;
  CC.toAStack = toAStack;
  CC.mapNumbers = mapNumbers;
  CC.filterEven = filterEven;
  CC.allSteps = allSteps;
  CC.transformed = transformed;
})(typeof globalThis !== 'undefined' ? globalThis : this);
