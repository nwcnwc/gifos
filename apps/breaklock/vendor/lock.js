/**
 * Lock — classic-script port of maxwellito/breaklock src/controllers/lock/lock.ctrl.js
 *
 * Upstream split touch and mouse. One pointer stream covers both, and
 * is what a phone actually sends. Magnet is PatternSVG.DOT_MAGNET.
 */
(function (root) {
  'use strict';

  var Pattern = root.BreakLockPattern;
  var PatternSVG = root.BreakLockPatternSVG;
  var dom = root.BreakLockDom;
  var COLORS = { BRIGHT: '#ffffff', SUCCESS: '#116699', ERROR: '#ff0000' };

  function LockCtrl(callback) {
    this.currentLine = null;
    this.onNewPattern = callback;
    this.dotLength = 4;
    this.pattern = new Pattern(this.dotLength);
    this.isPendingReset = null;
    this.enabled = true;
    this.drawing = false;
    this.setupTemplate();
  }

  LockCtrl.prototype.setupTemplate = function () {
    var myPatternSVG = new PatternSVG();
    myPatternSVG.addBackgroundLayer();
    this.el = myPatternSVG.getSVG();
    this.el.setAttribute('class', 'lock');
    this.el.setAttribute('role', 'img');
    this.el.setAttribute('aria-label', 'Pattern lock');
    this.patternEl = myPatternSVG.addGroup({
      'stroke-width': '2',
      stroke: COLORS.BRIGHT,
      'stroke-linecap': 'round'
    });
    this.bigDotsEl = myPatternSVG.addDots(9, { 'class': 'lock-flashdots' });
    myPatternSVG.addDots(2);
    return this.el;
  };

  LockCtrl.prototype.init = function () {
    var self = this;
    this.el.addEventListener('pointerdown', function (t) { self.onDown(t); });
    this.el.addEventListener('pointermove', function (t) { self.onMove(t); });
    this.el.addEventListener('pointerup', function (t) { self.onUp(t); });
    this.el.addEventListener('pointercancel', function (t) { self.onUp(t); });
    this.el.addEventListener('lostpointercapture', function () {
      if (self.drawing) self.onUp({ pointerId: -1 });
    });
    this.el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  LockCtrl.prototype.setDotLength = function (dotLength) {
    this.dotLength = dotLength;
    this.pattern = new Pattern(this.dotLength);
    this.reset();
  };

  LockCtrl.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    this.el.classList.toggle('disabled', !this.enabled);
    if (!this.enabled) this.reset();
  };

  LockCtrl.prototype.setCallback = function (fn) {
    this.onNewPattern = fn;
  };

  LockCtrl.prototype.onDown = function (t) {
    if (!this.enabled || t.button) return;
    t.preventDefault();
    try { this.el.setPointerCapture(t.pointerId); } catch (err) {}
    this.drawing = true;
    this.reset();
    this.updateFromEvent(t);
  };

  LockCtrl.prototype.onMove = function (t) {
    if (!this.drawing) return;
    t.preventDefault();
    this.updateFromEvent(t);
  };

  LockCtrl.prototype.onUp = function (t) {
    if (!this.drawing) return;
    this.drawing = false;
    if (t && t.pointerId >= 0) {
      try { this.el.releasePointerCapture(t.pointerId); } catch (err) {}
    }
    if (!this.isPendingReset) this.reset();
  };

  LockCtrl.prototype.updateFromEvent = function (t) {
    var proto = PatternSVG.prototype;
    var e = this.el.getBoundingClientRect();
    var x = Math.max(0, Math.min(proto.SVG_WIDTH,
      Math.round(proto.SVG_WIDTH / e.width * (t.clientX - e.left))));
    var y = Math.max(0, Math.min(proto.SVG_WIDTH,
      Math.round(proto.SVG_WIDTH / e.height * (t.clientY - e.top))));
    this.updatePoint(x, y);
  };

  LockCtrl.prototype.updatePoint = function (x, y) {
    if (this.isPendingReset) return;
    var proto = PatternSVG.prototype;
    var iX, iY, i, rangeStart, rangeEnd, dotIndex, ended;
    for (i = 0; i < 3; i++) {
      rangeStart = proto.GRID_GUTTER * i + proto.SVG_MARGIN - proto.DOT_MAGNET;
      rangeEnd = proto.GRID_GUTTER * i + proto.SVG_MARGIN + proto.DOT_MAGNET;
      if (rangeStart <= x && rangeEnd >= x) iX = i;
      if (rangeStart <= y && rangeEnd >= y) iY = i;
    }
    if (iX !== undefined && iY !== undefined) {
      dotIndex = iY * 3 + iX;
      ended = this.triggerDot(dotIndex);
    }
    if (!ended) this.updateLine(x, y);
  };

  LockCtrl.prototype.triggerDot = function (dotIndex) {
    if (this.pattern.gotDot(dotIndex)) return false;
    var newDots = this.pattern.addDot(dotIndex);
    if (!newDots.length) return this.pattern.isComplete();
    if (navigator.vibrate) {
      try { navigator.vibrate(20); } catch (err) {}
    }
    var proto = PatternSVG.prototype;
    var i, dot, dotX, dotY;
    for (i = 0; i < newDots.length; i++) {
      dot = newDots[i];
      dotX = proto.GRID_GUTTER * (dot % 3) + proto.SVG_MARGIN;
      dotY = proto.GRID_GUTTER * Math.floor(dot / 3) + proto.SVG_MARGIN;
      this.closeLine(dotX, dotY);
      if (this.bigDotsEl.childNodes[dot]) {
        this.bigDotsEl.childNodes[dot].classList.add('active');
      }
      if (i === newDots.length - 1 && this.pattern.isComplete()) {
        this.checkPattern();
        return true;
      }
      this.startLine(dotX, dotY);
    }
    return false;
  };

  LockCtrl.prototype.reset = function () {
    var i;
    clearTimeout(this.isPendingReset);
    this.isPendingReset = null;
    this.pattern.reset();
    this.currentLine = null;
    for (i = 0; i < 9; i++) {
      if (this.bigDotsEl.childNodes[i]) {
        this.bigDotsEl.childNodes[i].classList.remove('active');
      }
    }
    for (i = this.patternEl.childNodes.length - 1; i >= 0; i--) {
      this.patternEl.childNodes[i].remove();
    }
    this.patternEl.setAttribute('stroke', COLORS.BRIGHT);
  };

  LockCtrl.prototype.checkPattern = function () {
    var itsAmatch = false;
    if (this.onNewPattern) itsAmatch = !!this.onNewPattern(this.pattern);
    var self = this;
    this.isPendingReset = setTimeout(function () { self.reset(); }, 1000);
    this.patternEl.setAttribute('stroke', itsAmatch ? COLORS.SUCCESS : COLORS.ERROR);
    return itsAmatch;
  };

  LockCtrl.prototype.startLine = function (x, y) {
    this.currentLine = dom.create('line', { x1: x, y1: y, x2: x, y2: y });
    this.patternEl.appendChild(this.currentLine);
  };

  LockCtrl.prototype.updateLine = function (x, y) {
    if (!this.currentLine) return;
    this.currentLine.setAttribute('x2', x);
    this.currentLine.setAttribute('y2', y);
  };

  LockCtrl.prototype.closeLine = function (x, y) {
    this.updateLine(x, y);
    this.currentLine = null;
  };

  root.BreakLockLock = LockCtrl;
})(typeof globalThis !== 'undefined' ? globalThis : this);
