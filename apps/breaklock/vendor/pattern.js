/**
 * Pattern — object representation of a 3×3 lock combination.
 * Classic-script port of maxwellito/breaklock src/models/pattern.js
 *
 * For reference:
 *  0 1 2
 *  3 4 5
 *  6 7 8
 */
(function (root) {
  'use strict';

  function Pattern(dotLength) {
    this.dotLength = dotLength;
    this.suite = [];
  }

  Pattern.prototype.fillRandomly = function () {
    while (!this.isComplete()) {
      this.addDot(Math.floor(Math.random() * 9));
    }
  };

  /**
   * Add a dot. Android-style: a swipe that skips the median of a
   * collinear pair inserts that median first. Returns the list of
   * dots actually added (median + target), or [] if refused.
   */
  Pattern.prototype.addDot = function (dotIndex) {
    if (this.isComplete() || ~this.suite.indexOf(dotIndex)) return [];

    var lastDot = this.suite[this.suite.length - 1];
    var medianDot = (lastDot + dotIndex) / 2;

    if (lastDot != undefined &&
        medianDot >> 0 === medianDot &&
        (lastDot % 3) - (medianDot % 3) === (medianDot % 3) - (dotIndex % 3) &&
        Math.floor(lastDot / 3) - Math.floor(medianDot / 3) ===
          Math.floor(medianDot / 3) - Math.floor(dotIndex / 3)) {
      var addedPoints = this.addDot(medianDot);
      if (!this.isComplete()) {
        this.suite.push(dotIndex);
        addedPoints.push(dotIndex);
      }
      return addedPoints;
    }

    this.suite.push(dotIndex);
    return [dotIndex];
  };

  Pattern.prototype.isComplete = function () {
    return this.suite.length >= this.dotLength;
  };

  Pattern.prototype.gotDot = function (dotIndex) {
    return ~this.suite.indexOf(dotIndex);
  };

  /**
   * Compare another pattern to this (the secret).
   * [0] dots in the right place
   * [1] correct dots, wrong order
   * [2] dots that do not occur
   *
   * Upstream's counting, kept bit-for-bit: secrets and guesses are
   * unique-dot by construction, so the duplicate edge is unreachable.
   */
  Pattern.prototype.compare = function (pattern) {
    var goodPos = 0;
    var wrongPos = 0;
    var i, j;
    for (i = 0; i < this.dotLength; i++) {
      if (this.suite[i] === pattern.suite[i]) goodPos++;
      for (j = 0; j < this.dotLength; j++) {
        if (this.suite[j] === pattern.suite[i]) wrongPos++;
      }
    }
    return [goodPos, wrongPos - goodPos, this.dotLength - wrongPos];
  };

  Pattern.prototype.reset = function () {
    this.suite = [];
  };

  Pattern.fromSuite = function (suite) {
    var p = new Pattern(suite.length);
    p.suite = suite.slice();
    return p;
  };

  root.BreakLockPattern = Pattern;
})(typeof globalThis !== 'undefined' ? globalThis : this);
