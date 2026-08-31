// Extra keys a phone keyboard does not have. Letters go through the hidden
// input (#phone-kbd) so the system keyboard types into the emulated PC.
(function () {
  var SC = { ctrl: 0x1D, alt: 0x38, shift: 0x2A };
  var held = { ctrl: false, alt: false, shift: false };
  var emu = null;

  function sendSc(code, down) {
    if (!emu) return;
    var c = down ? code : (code | 0x80);
    emu.keyboard_send_scancodes([c]);
  }

  function setHeld(name, on) {
    if (held[name] === on) return;
    held[name] = on;
    sendSc(SC[name], on);
    var btn = document.querySelector('[data-mod="' + name + '"]');
    if (btn) btn.classList.toggle('on', on);
  }

  function tapSc(code) {
    if (!emu) return;
    emu.keyboard_send_scancodes([code, code | 0x80]);
  }

  window.v86Keys = {
    attach: function (e) { emu = e; },
    releaseMods: function () {
      setHeld('ctrl', false);
      setHeld('alt', false);
      setHeld('shift', false);
    },
    show: function (on) {
      var el = document.getElementById('keys');
      var btn = document.getElementById('btn-keys');
      if (!el) return;
      if (on == null) on = el.hidden;
      el.hidden = !on;
      if (btn) btn.classList.toggle('on', on);
      if (!on) window.v86Keys.releaseMods();
    },
    focusType: function () {
      var inp = document.getElementById('phone-kbd');
      if (inp) { inp.value = ''; inp.focus(); }
    }
  };

  document.getElementById('keys').addEventListener('pointerdown', function (ev) {
    var t = ev.target.closest('button');
    if (!t) return;
    ev.preventDefault();
    if (t.id === 'btn-type') { window.v86Keys.focusType(); return; }
    var mod = t.getAttribute('data-mod');
    if (mod) { setHeld(mod, !held[mod]); return; }
    var sc = t.getAttribute('data-sc');
    if (sc) tapSc(parseInt(sc, 10));
  });

  var inp = document.getElementById('phone-kbd');
  inp.addEventListener('keydown', function (ev) {
    // The emulator already listens on window; do not let the input eat keys.
    if (ev.key === 'Tab') ev.preventDefault();
  });
  inp.addEventListener('input', function () {
    // iOS composition can skip keydown; push leftover chars.
    var s = inp.value;
    if (s && emu && emu.keyboard_send_text) {
      emu.keyboard_send_text(s);
    }
    inp.value = '';
  });
})();
