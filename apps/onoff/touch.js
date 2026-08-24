(function (root) {
  'use strict';
  var active = false;

  function phoneish() {
    var pts = (root.navigator && root.navigator.maxTouchPoints) || 0;
    var coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    var narrow = Math.min(root.innerWidth || 0, root.innerHeight || 0) <= 520;
    return (pts > 0 && coarse) || (pts > 0 && narrow);
  }

  function downSet() { return root.ONOFF_DOWN; }

  function apply(key, on) {
    var D = downSet();
    if (!D) return;
    var names = [];
    if (key === 'left') names = ['a', 'ArrowLeft'];
    else if (key === 'right') names = ['d', 'ArrowRight'];
    else if (key === 'jump') names = ['w', 'ArrowUp'];
    else if (key === 'toggle') names = [' '];
    for (var i = 0; i < names.length; i++) {
      if (on) D.add(names[i]);
      else D.delete(names[i]);
    }
    if (key === 'toggle' && on) {
      var ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
      document.dispatchEvent(ev);
    }
  }

  function bind(node) {
    var key = node.getAttribute('data-key');
    var set = function (on) {
      apply(key, on);
      if (on) node.classList.add('on'); else node.classList.remove('on');
    };
    var down = function (e) {
      e.preventDefault();
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      set(true);
    };
    var up = function (e) { e.preventDefault(); set(false); };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', function () { set(false); });
  }

  function reveal() {
    if (active) return;
    active = true;
    document.body.classList.add('touch');
    var wrap = document.getElementById('touch');
    if (wrap) wrap.hidden = false;
  }

  function init() {
    var wrap = document.getElementById('touch');
    if (!wrap) return;
    if (phoneish()) reveal();
    else addEventListener('touchstart', reveal, { passive: true });
    var btns = wrap.querySelectorAll('[data-key]');
    for (var i = 0; i < btns.length; i++) bind(btns[i]);
    wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
