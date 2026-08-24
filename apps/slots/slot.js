// Destack of johakr/html5-slot-machine Slot.js + Reel.js + Symbol.js
// (MIT). Webpack require() of SVGs is gone; symbols ride as data URLs.
(function (g) {
  'use strict';

  var cache = {};

  function Symbol(name) {
    this.name = name || Symbol.random();
    if (cache[this.name]) {
      this.img = cache[this.name].cloneNode();
    } else {
      this.img = new Image();
      this.img.src = g.SlotSymbols[this.name];
      this.img.alt = this.name;
      cache[this.name] = this.img;
    }
  }
  Symbol.preload = function () {
    Symbol.symbols.forEach(function (s) { new Symbol(s); });
  };
  Object.defineProperty(Symbol, 'symbols', {
    get: function () { return g.SLOT_NAMES.slice(); }
  });
  Symbol.random = function () {
    return Symbol.symbols[Math.floor(Math.random() * Symbol.symbols.length)];
  };

  function Reel(reelContainer, idx, initialSymbols) {
    this.reelContainer = reelContainer;
    this.idx = idx;
    this.symbolContainer = document.createElement('div');
    this.symbolContainer.className = 'icons';
    this.reelContainer.appendChild(this.symbolContainer);

    var factor = this.factor;
    this.animation = this.symbolContainer.animate(
      [
        { top: 0, filter: 'blur(0)' },
        { filter: 'blur(2px)', offset: 0.5 },
        {
          top: 'calc((' + Math.floor(factor) * 10 + ' / 3) * -100% - (' +
            Math.floor(factor) * 10 + ' * 3px))',
          filter: 'blur(0)'
        }
      ],
      { duration: factor * 1000, easing: 'ease-in-out' }
    );
    this.animation.cancel();

    var self = this;
    initialSymbols.forEach(function (symbol) {
      self.symbolContainer.appendChild(new Symbol(symbol).img);
    });
  }
  Object.defineProperty(Reel.prototype, 'factor', {
    get: function () { return 1 + Math.pow(this.idx / 2, 2); }
  });
  Reel.prototype.renderSymbols = function (nextSymbols) {
    var fragment = document.createDocumentFragment();
    var floor = Math.floor(this.factor);
    var i, icon;
    for (i = 3; i < 3 + floor * 10; i++) {
      icon = new Symbol(
        i >= 10 * floor - 2 ? nextSymbols[i - floor * 10] : undefined
      );
      fragment.appendChild(icon.img);
    }
    this.symbolContainer.appendChild(fragment);
  };
  Reel.prototype.spin = function () {
    var self = this;
    var animationPromise = new Promise(function (resolve) {
      self.animation.onfinish = resolve;
    });
    var timeoutPromise = new Promise(function (resolve) {
      setTimeout(resolve, self.factor * 1000);
    });
    this.animation.cancel();
    this.animation.play();
    return Promise.race([animationPromise, timeoutPromise]).then(function () {
      if (self.animation.playState !== 'finished') self.animation.finish();
      var max = self.symbolContainer.children.length - 3;
      var i;
      for (i = 0; i < max; i++) self.symbolContainer.firstChild.remove();
    });
  };

  function Slot(domElement, config) {
    config = config || {};
    Symbol.preload();
    this.currentSymbols = [
      ['cherry', 'lemon', 'grape'],
      ['bell', 'seven', 'bar'],
      ['star', 'diamond', 'clover'],
      ['grape', 'bar', 'cherry'],
      ['seven', 'star', 'lemon']
    ];
    this.nextSymbols = [
      ['cherry', 'lemon', 'grape'],
      ['bell', 'seven', 'bar'],
      ['star', 'diamond', 'clover'],
      ['grape', 'bar', 'cherry'],
      ['seven', 'star', 'lemon']
    ];
    this.container = domElement;
    this.reels = Array.prototype.slice.call(
      this.container.getElementsByClassName('reel')
    ).map(function (reelContainer, idx) {
      return new Reel(reelContainer, idx, this.currentSymbols[idx]);
    }, this);
    this.spinButton = document.getElementById('spin');
    this.autoPlayCheckbox = document.getElementById('autoplay');
    if (config.inverted) this.container.classList.add('inverted');
    this.config = config;
    this.busy = false;
    this.fromRoom = false;
    this._autoTimer = 0;
  }
  Slot.prototype.setNext = function (symbols) {
    this.nextSymbols = symbols;
  };
  Slot.prototype.randomGrid = function () {
    return g.SlotsMath ? g.SlotsMath.randomGrid() : [
      [Symbol.random(), Symbol.random(), Symbol.random()],
      [Symbol.random(), Symbol.random(), Symbol.random()],
      [Symbol.random(), Symbol.random(), Symbol.random()],
      [Symbol.random(), Symbol.random(), Symbol.random()],
      [Symbol.random(), Symbol.random(), Symbol.random()]
    ];
  };
  Slot.prototype.cancelAuto = function () {
    if (this._autoTimer) {
      clearTimeout(this._autoTimer);
      this._autoTimer = 0;
    }
  };
  Slot.prototype.spinTo = function (symbols, fromRoom) {
    var self = this;
    this.cancelAuto();
    this.fromRoom = !!fromRoom;
    this.currentSymbols = this.nextSymbols;
    this.nextSymbols = symbols;
    this.onSpinStart(this.nextSymbols);
    return Promise.all(this.reels.map(function (reel) {
      reel.renderSymbols(self.nextSymbols[reel.idx]);
      return reel.spin();
    })).then(function () { self.onSpinEnd(self.nextSymbols); });
  };
  Slot.prototype.spin = function () {
    return this.spinTo(this.randomGrid());
  };
  Slot.prototype.onSpinStart = function (symbols) {
    this.busy = true;
    if (this.spinButton) this.spinButton.disabled = true;
    if (this.config.onSpinStart) this.config.onSpinStart(symbols);
  };
  Slot.prototype.onSpinEnd = function (symbols) {
    var self = this;
    this.busy = false;
    if (this.spinButton) this.spinButton.disabled = false;
    if (this.config.onSpinEnd) this.config.onSpinEnd(symbols);
    // Autoplay MUST go through config.onAutoPlay (app.js pull()), never
    // Slot.spin() — that path skipped the stake and the room.
    var autoOn = this.autoPlayCheckbox && this.autoPlayCheckbox.checked;
    if (autoOn && !this.fromRoom && this.config.onAutoPlay) {
      this._autoTimer = window.setTimeout(function () {
        self._autoTimer = 0;
        if (self.autoPlayCheckbox && self.autoPlayCheckbox.checked) self.config.onAutoPlay();
      }, 700);
    }
  };

  g.Slot = Slot;
  g.SlotSymbol = Symbol;
})(window);
