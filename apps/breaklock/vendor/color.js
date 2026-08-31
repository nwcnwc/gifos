/**
 * greydient — classic-script port of maxwellito/breaklock src/utils/color.js
 */
(function (root) {
  'use strict';

  var color = {
    greydient: function (colorStart, colorEnd, steps) {
      if (steps == null) steps = 0;
      colorStart = typeof colorStart === 'string' ? parseInt(colorStart, 16) : colorStart;
      colorEnd = typeof colorEnd === 'string' ? parseInt(colorEnd, 16) : colorEnd;
      colorStart = Math.min(255, Math.max(0, colorStart));
      colorEnd = Math.min(255, Math.max(0, colorEnd));
      steps++;
      var output = [];
      var gap = (colorEnd - colorStart) / steps;
      var i, grey, greyHex;
      for (i = 0; i <= steps; i++) {
        grey = Math.round(colorStart + i * gap);
        greyHex = grey.toString(16);
        output.push('#' + greyHex + greyHex + greyHex);
      }
      return output;
    }
  };

  root.BreakLockColor = color;
})(typeof globalThis !== 'undefined' ? globalThis : this);
