/* Must run first: defer SoundManager 2 auto-init, and give jStorage a store. */
(function () {
  'use strict';
  window.SM2_DEFER = true;

  var mem = {};
  var fake = {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    clear: function () { mem = {}; },
    key: function (i) {
      var ks = Object.keys(mem);
      return i >= 0 && i < ks.length ? ks[i] : null;
    }
  };
  Object.defineProperty(fake, 'length', {
    get: function () { return Object.keys(mem).length; }
  });

  var ok = false;
  try {
    if (window.localStorage) {
      window.localStorage.setItem('__house', '1');
      window.localStorage.removeItem('__house');
      ok = true;
    }
  } catch (e) { ok = false; }
  if (!ok) {
    try {
      Object.defineProperty(window, 'localStorage', { value: fake, configurable: true });
    } catch (e2) {
      window.localStorage = fake;
    }
  }
})();
