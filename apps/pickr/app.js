/*
 * Pickr chrome around simonwep's color picker.
 *
 * vendor/pickr.js attaches window.Pickr. This file is the shell: the wash,
 * copy lines, and a private list of recent colors so they stay on this device.
 *
 * Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var MAX = 16;
  var DEFAULT = '#E8416C';
  var SWATCHES = [
    'rgba(244, 67, 54, 1)',
    'rgba(233, 30, 99, 0.95)',
    'rgba(156, 39, 176, 0.9)',
    'rgba(103, 58, 183, 0.85)',
    'rgba(63, 81, 181, 0.8)',
    'rgba(33, 150, 243, 0.75)',
    'rgba(0, 188, 212, 0.7)',
    'rgba(76, 175, 80, 0.8)',
    'rgba(255, 235, 59, 0.95)',
    'rgba(255, 193, 7, 1)'
  ];

  var saveDb = null;
  var timer = 0;
  var pickr = null;
  var current = DEFAULT;
  var recents = [];
  var values = { hex: DEFAULT, rgb: '', hsl: '', cmyk: '' };
  var applying = false;

  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var $ = function (id) {
    return root.document && root.document.getElementById ? root.document.getElementById(id) : null;
  };

  function say(msg) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = msg ? 'on' : '';
  }

  function luma(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function pushRecent(list, color, max) {
    color = String(color || '').toUpperCase();
    if (!color) return list || [];
    list = (list || []).filter(function (c) { return String(c).toUpperCase() !== color; });
    list.unshift(color);
    if (list.length > max) list = list.slice(0, max);
    return list;
  }

  function persist() {
    if (!saveDb) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (!saveDb) return;
    saveDb.put({
      id: 'state',
      color: current,
      recents: recents.slice(),
      at: Date.now()
    }).catch(function () {});
  }

  function paintCodes() {
    if ($('hex')) $('hex').textContent = values.hex;
    if ($('v-hex')) $('v-hex').textContent = values.hex;
    if ($('v-rgb')) $('v-rgb').textContent = values.rgb;
    if ($('v-hsl')) $('v-hsl').textContent = values.hsl;
    if ($('v-cmyk')) $('v-cmyk').textContent = values.cmyk;
  }

  function paintRecents() {
    var box = $('recents');
    if (!box) return;
    box.textContent = '';
    recents.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'recent';
      b.setAttribute('role', 'listitem');
      b.title = c;
      b.setAttribute('aria-label', c);
      b.style.setProperty('--swatch', c);
      b.addEventListener('click', function (e) {
        e.preventDefault();
        if (pickr) pickr.setColor(c);
      });
      box.appendChild(b);
    });
    if ($('clearRecents')) $('clearRecents').hidden = recents.length === 0;
  }

  function fromColor(color, keep) {
    if (!color) return;
    var rgba = color.toRGBA();
    var hex = color.toHEXA().toString().toUpperCase();
    current = hex;
    values.hex = hex;
    values.rgb = color.toRGBA().toString(0);
    values.hsl = color.toHSLA().toString(0);
    values.cmyk = color.toCMYK().toString(0);
    if (root.document && root.document.documentElement) {
      root.document.documentElement.style.setProperty(
        '--c',
        'rgba(' + Math.round(rgba[0]) + ', ' + Math.round(rgba[1]) + ', ' +
          Math.round(rgba[2]) + ', ' + rgba[3] + ')'
      );
      if (root.document.body) {
        root.document.body.classList.toggle(
          'light',
          luma(rgba[0], rgba[1], rgba[2]) * rgba[3] + (1 - rgba[3]) * 208 > 168
        );
      }
    }
    paintCodes();
    if (!keep) persist();
  }

  function remember() {
    recents = pushRecent(recents, current, MAX);
    paintRecents();
    flush();
  }

  function fallbackCopy(t, ok) {
    var ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); ok(); } catch (e) { say('Copy failed.'); }
    ta.remove();
  }

  function copy(t) {
    t = String(t || '');
    if (!t) return;
    var ok = function () { say('Copied ' + t); remember(); };
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(t).then(ok, function () { fallbackCopy(t, ok); });
    } else fallbackCopy(t, ok);
  }

  root.PickrApp = {
    luma: luma,
    pushRecent: pushRecent,
    defaultColor: DEFAULT
  };

  if (!root.Pickr || typeof root.Pickr.create !== 'function') {
    say('The picker did not load.');
    return;
  }

  pickr = root.Pickr.create({
    el: '#picker',
    theme: 'classic',
    inline: true,
    showAlways: true,
    comparison: false,
    default: DEFAULT,
    defaultRepresentation: 'HEXA',
    closeOnScroll: false,
    autoReposition: false,
    swatches: SWATCHES,
    components: {
      preview: true,
      opacity: true,
      hue: true,
      interaction: {
        hex: true,
        rgba: true,
        hsla: true,
        hsva: true,
        cmyk: true,
        input: true,
        save: true
      }
    }
  });

  pickr.on('init', function () {
    fromColor(pickr.getColor(), true);
    if (!saveDb) return;
    saveDb.getAll().then(function (rows) {
      var row = null;
      (rows || []).forEach(function (r) { if (r && r.id === 'state') row = r; });
      if (!row) return;
      applying = true;
      if (Array.isArray(row.recents)) recents = row.recents.slice(0, MAX);
      paintRecents();
      if (row.color && pickr.setColor(row.color, true)) fromColor(pickr.getColor(), true);
      applying = false;
    }).catch(function () {});
  });

  pickr.on('change', function (color) {
    if (applying) return;
    fromColor(color);
  });

  pickr.on('changestop', function () {
    if (applying) return;
    remember();
  });

  pickr.on('save', function (color) {
    if (color) fromColor(color);
    remember();
    say('Saved to recent.');
  });

  pickr.on('swatchselect', function (color) {
    fromColor(color);
    remember();
  });

  document.querySelectorAll('.code').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      copy(values[b.getAttribute('data-fmt')]);
    });
  });

  $('clearRecents').addEventListener('click', function (e) {
    e.preventDefault();
    recents = [];
    paintRecents();
    flush();
    say('Recent colors cleared.');
  });

  root.addEventListener('pagehide', flush);
  paintCodes();
  paintRecents();
})(window);
