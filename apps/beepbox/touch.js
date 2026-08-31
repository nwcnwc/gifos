/*
 * Phone: the grid must be usable. BeepBox already stacks the editor under
 * 710px; the remaining gap is that the pattern canvas is still small.
 * Scale the editor (buttons + pinch) and pan with ordinary overflow scroll.
 * One-finger drawing is left to BeepBox; two-finger pinch is ours.
 */
(function (root) {
  'use strict';

  var MIN = 1, MAX = 2.6, STEP = 0.25;
  var scale = 1;
  var viewport, stage, label, inBtn, outBtn;
  var pinching = false;
  var startDist = 0;
  var startScale = 1;

  function clamp(n) {
    if (n < MIN) return MIN;
    if (n > MAX) return MAX;
    return Math.round(n * 20) / 20;
  }

  function apply() {
    if (!stage) return;
    stage.style.transform = scale === 1 ? '' : 'scale(' + scale + ')';
    if (label) label.textContent = Math.round(scale * 100) + '%';
    var editor = document.getElementById('beepboxEditorContainer');
    if (editor) {
      var w = editor.offsetWidth || 710;
      var h = editor.offsetHeight || 645;
      stage.style.width = Math.ceil(w * scale) + 'px';
      stage.style.height = Math.ceil(h * scale) + 'px';
    }
    try { root.dispatchEvent(new Event('resize')); } catch (e) {}
  }

  function setScale(n) {
    scale = clamp(n);
    apply();
  }

  function dist(a, b) {
    var dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function init() {
    viewport = document.getElementById('viewport');
    stage = document.getElementById('zoom-stage');
    label = document.getElementById('z-label');
    inBtn = document.getElementById('z-in');
    outBtn = document.getElementById('z-out');
    if (inBtn) inBtn.addEventListener('click', function () { setScale(scale + STEP); });
    if (outBtn) outBtn.addEventListener('click', function () { setScale(scale - STEP); });

    if (!viewport) return;
    viewport.addEventListener('touchstart', function (ev) {
      if (ev.touches.length === 2) {
        pinching = true;
        startDist = dist(ev.touches[0], ev.touches[1]);
        startScale = scale;
      }
    }, { passive: true });
    viewport.addEventListener('touchmove', function (ev) {
      if (!pinching || ev.touches.length !== 2) return;
      ev.preventDefault();
      var d = dist(ev.touches[0], ev.touches[1]);
      if (startDist < 8) return;
      setScale(startScale * (d / startDist));
    }, { passive: false });
    viewport.addEventListener('touchend', function (ev) {
      if (ev.touches.length < 2) pinching = false;
    }, { passive: true });
    viewport.addEventListener('touchcancel', function () { pinching = false; }, { passive: true });

    if (root.innerWidth <= 710) setScale(1.35);
    else apply();
    root.addEventListener('resize', function () {
      if (!pinching) apply();
    });
  }

  root.BeepTouch = { init: init, setScale: setScale };
})(window);
