/**
 * PatternSVG — classic-script port of maxwellito/breaklock src/utils/patternSVG.js
 */
(function (root) {
  'use strict';

  var dom = root.BreakLockDom;

  function PatternSVG() {
    this.el = dom.create('svg', {
      viewBox: '0 0 ' + this.SVG_WIDTH + ' ' + this.SVG_WIDTH
    });
  }

  PatternSVG.prototype.SVG_WIDTH = 100;
  PatternSVG.prototype.SVG_COMB_EXP = 20;
  PatternSVG.prototype.SVG_MARGIN = 15;
  PatternSVG.prototype.GRID_GUTTER = 35;
  PatternSVG.prototype.DOT_BORDER = 2;
  // Upstream was 6 (≈19 px on a 320 px lock). Fat fingers miss it;
  // 12 units is about a 38 px magnet, still only the nearest dot.
  PatternSVG.prototype.DOT_MAGNET = 12;

  PatternSVG.prototype.addBackgroundLayer = function () {
    var rect = dom.create('rect', {
      fill: '#fff',
      'fill-opacity': '0',
      width: this.SVG_WIDTH,
      height: this.SVG_WIDTH
    });
    this.el.appendChild(rect);
    return rect;
  };

  PatternSVG.prototype.addPattern = function (pattern, size, color) {
    if (size == null) size = 14;
    if (color == null) color = '#fff';
    color = color instanceof Array ? color : [color];
    var lines = [];
    var i, lastDotIndex;
    for (i = 1; i < pattern.suite.length; i++) {
      lines.push(dom.create('line', {
        x1: (pattern.suite[i - 1] % 3) * this.GRID_GUTTER + this.SVG_MARGIN,
        y1: Math.floor(pattern.suite[i - 1] / 3) * this.GRID_GUTTER + this.SVG_MARGIN,
        x2: (pattern.suite[i] % 3) * this.GRID_GUTTER + this.SVG_MARGIN,
        y2: Math.floor(pattern.suite[i] / 3) * this.GRID_GUTTER + this.SVG_MARGIN,
        stroke: color[Math.min(color.length, i) - 1]
      }));
    }
    lastDotIndex = pattern.suite[pattern.suite.length - 1];
    if (lastDotIndex != null) {
      lines.push(dom.create('circle', {
        cx: (lastDotIndex % 3) * this.GRID_GUTTER + this.SVG_MARGIN,
        cy: Math.floor(lastDotIndex / 3) * this.GRID_GUTTER + this.SVG_MARGIN,
        fill: color[0],
        r: size / 4
      }));
    }
    return this.addGroup({
      'stroke-width': size,
      'stroke-linecap': 'round'
    }, lines);
  };

  PatternSVG.prototype.addDots = function (size, attr) {
    if (size == null) size = 3;
    if (attr == null) attr = {};
    var dots = [];
    var i;
    attr = {
      fill: attr.fill || '#fff',
      'class': attr['class'] || attr.class || ''
    };
    for (i = 0; i < 9; i++) {
      dots.push(dom.create('circle', {
        cx: (i % 3) * this.GRID_GUTTER + this.SVG_MARGIN,
        cy: Math.floor(i / 3) * this.GRID_GUTTER + this.SVG_MARGIN,
        rel: String(i),
        r: size
      }));
    }
    return this.addGroup(attr, dots);
  };

  PatternSVG.prototype.addGroup = function (attr, content) {
    var group = dom.create('g', attr, content);
    this.el.appendChild(group);
    return group;
  };

  PatternSVG.prototype.addCombinaison = function (goodDots, badPlacedDots, wrongDots) {
    var totalDots = goodDots + badPlacedDots + wrongDots;
    var dot = Math.min(Math.floor(this.SVG_WIDTH / totalDots), this.SVG_COMB_EXP);
    var dotWidth = Math.floor(dot * 0.75);
    var dotGap = Math.floor(dot * 0.25);
    var xGap = dotWidth + dotGap;
    var xStart = Math.floor((this.SVG_WIDTH - (totalDots - 1) * xGap) / 2);
    var yStart = this.SVG_WIDTH + Math.floor(this.SVG_COMB_EXP / 2);
    var dots = [];
    var i;
    this.el.setAttribute('viewBox', '0 0 ' + this.SVG_WIDTH + ' ' + (this.SVG_WIDTH + this.SVG_COMB_EXP));
    for (i = 0; i < totalDots; i++) {
      dots.push(dom.create('circle', {
        cx: xStart + i * xGap,
        cy: yStart,
        r: (dotWidth - this.DOT_BORDER) / 2,
        'stroke-width': this.DOT_BORDER,
        fill: i < goodDots ? '#fff' : '#000',
        stroke: i < (goodDots + badPlacedDots) ? '#fff' : '#000',
        'fill-opacity': i < goodDots ? '1' : '.25',
        'stroke-opacity': i < (goodDots + badPlacedDots) ? '1' : '.25'
      }));
    }
    return this.addGroup({}, dots);
  };

  PatternSVG.prototype.getSVG = function () {
    return this.el;
  };

  root.BreakLockPatternSVG = PatternSVG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
