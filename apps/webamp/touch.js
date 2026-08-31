/*
 * Dock, file pickers, first-run hint, phone stacking.
 * Invite is OS chrome — this file never draws that button.
 */
(function (root) {
  'use strict';

  var toastTimer = 0;

  function $(id) { return document.getElementById(id); }

  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2800);
  }

  function isPhone() {
    return window.matchMedia && window.matchMedia('(max-width: 640px), (pointer: coarse)').matches;
  }

  function pick(input, cb) {
    if (!input) return;
    input.value = '';
    input.onchange = function () {
      var files = input.files;
      if (files && files.length) cb(files);
      input.value = '';
    };
    input.click();
  }

  var api = {
    toast: toast,
    isPhone: isPhone,
    init: function (hooks) {
      hooks = hooks || {};
      if (isPhone()) document.body.classList.add('phone', 'scroll');

      var addMp3 = $('add-mp3');
      var addSkin = $('add-skin');
      var show = $('show-player');
      var pickMp3 = $('pick-mp3');
      var pickSkin = $('pick-skin');

      if (addMp3) addMp3.addEventListener('click', function () {
        pick(pickMp3, function (files) {
          if (hooks.onAudio) hooks.onAudio(files);
        });
      });
      if (addSkin) addSkin.addEventListener('click', function () {
        pick(pickSkin, function (files) {
          if (hooks.onSkin && files[0]) hooks.onSkin(files[0]);
        });
      });
      if (show) show.addEventListener('click', function () {
        if (hooks.onShow) hooks.onShow();
      });

      api.setClosed = function (closed) {
        if (show) show.hidden = !closed;
      };
      api.setHint = function (text) {
        var h = $('hint');
        if (h) h.textContent = text;
      };
    }
  };

  root.Touch = api;
})(window);
