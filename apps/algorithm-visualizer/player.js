/*
 * Step through recorded chunks. Seeking backwards rebuilds from chunk 0 —
 * each chunk is a delta, not a snapshot, and a sort of 12 numbers is short.
 */
(function (root) {
  'use strict';

  function Player(renderer) {
    this.renderer = renderer;
    this.rec = null;
    this.cursor = 0;
    this.playing = false;
    this.speed = 1;
    this.timer = 0;
    this.onChange = null;
  }

  Player.prototype.load = function (rec, opts) {
    opts = opts || {};
    this.stopTimer();
    this.rec = rec;
    this.renderer.reset(rec);
    this.cursor = 0;
    this.playing = !!opts.play;
    if (this.cursor < this.len() && (this.rec.chunks[0].commands || []).length) {
      this.renderer.apply(this.rec.chunks[0].commands);
      this.cursor = 1;
    }
    if (opts.cursor != null) this.seek(opts.cursor);
    if (this.playing) this.arm();
    this.emit();
  };

  Player.prototype.len = function () {
    return this.rec && this.rec.chunks ? this.rec.chunks.length : 0;
  };

  Player.prototype.seek = function (n) {
    if (!this.rec) return;
    n = Math.max(0, Math.min(this.len(), n | 0));
    if (n < this.cursor) {
      this.renderer.reset(this.rec);
      this.cursor = 0;
    }
    while (this.cursor < n) {
      var ch = this.rec.chunks[this.cursor];
      if (ch && ch.commands) this.renderer.apply(ch.commands);
      this.cursor++;
    }
    this.emit();
  };

  Player.prototype.step = function (dir) {
    if (!this.rec) return;
    this.playing = false;
    this.stopTimer();
    if (dir < 0) this.seek(this.cursor - 1);
    else this.seek(this.cursor + 1);
  };

  Player.prototype.play = function (on) {
    this.playing = on !== false;
    if (this.playing) {
      if (this.cursor >= this.len()) this.seek(0);
      this.arm();
    } else {
      this.stopTimer();
    }
    this.emit();
  };

  Player.prototype.toggle = function () {
    if (this.playing) this.play(false);
    else this.play(true);
  };

  Player.prototype.setSpeed = function (s) {
    this.speed = Math.max(0.25, Math.min(8, +s || 1));
    if (this.playing) this.arm();
    this.emit();
  };

  Player.prototype.arm = function () {
    var self = this;
    this.stopTimer();
    if (!this.playing) return;
    var wait = 520 / this.speed;
    this.timer = setTimeout(function () {
      if (!self.playing) return;
      if (self.cursor >= self.len()) {
        self.playing = false;
        self.emit();
        return;
      }
      self.seek(self.cursor + 1);
      if (self.cursor >= self.len()) {
        self.playing = false;
        self.emit();
        return;
      }
      self.arm();
    }, wait);
  };

  Player.prototype.stopTimer = function () {
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
  };

  Player.prototype.emit = function () {
    if (this.onChange) this.onChange(this.snapshot());
  };

  Player.prototype.snapshot = function () {
    return {
      cursor: this.cursor,
      len: this.len(),
      playing: this.playing,
      speed: this.speed
    };
  };

  root.AVPlayer = Player;
})(typeof window !== 'undefined' ? window : globalThis);
