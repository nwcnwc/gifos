/* Construct SoundManager after SM2_DEFER. HTML5 only — Flash stays behind. */
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
      flashLoadTimeout: 0,
      waitForWindowLoad: false
    });
  }
})();
