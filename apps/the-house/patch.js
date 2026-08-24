/* Construct SoundManager after SM2_DEFER. HTML5 only — Flash stays behind.
   Hold onready until the save is in jStorage, otherwise the original boot
   paints the intro against an empty collected[] and a blank is_in. */
(function () {
  'use strict';
  if (typeof SoundManager !== 'function') return;
  var sm = new SoundManager();
  window.soundManager = sm;
  if (sm.setup) {
    sm.setup({
      url: '',
      useHTML5Audio: true,
      preferFlash: false,
      debugMode: false,
      debugFlash: false,
      flashLoadTimeout: 1,
      waitForWindowLoad: false,
      useFlashBlock: false
    });
  }
  sm.useHTML5Audio = true;
  sm.preferFlash = false;
  sm.ignoreFlash = true;
  sm.url = '';
  sm.flashLoadTimeout = 1;
  try { sm.html5Only = true; } catch (e) {}

  var hold = [];
  var released = false;
  var origReady = sm.onready ? sm.onready.bind(sm) : function (fn) { if (fn) fn.call(sm); };
  sm.onready = function (fn, scope) {
    if (typeof fn !== 'function') return sm;
    if (released) return origReady(fn, scope);
    hold.push([fn, scope]);
    return sm;
  };
  window.__houseReleaseSM = function () {
    if (released) return;
    released = true;
    sm.onready = origReady;
    var i;
    for (i = 0; i < hold.length; i++) origReady(hold[i][0], hold[i][1]);
    hold = [];
    if (sm.beginDelayedInit) sm.beginDelayedInit();
  };
})();
