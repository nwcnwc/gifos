/* Contrast Ratio: two colours, a WCAG number, a verdict.
 * Last pair is private. Nothing is fetched. */
(function (root) {
  'use strict';

  var $ = function (id) {
    return root.document ? root.document.getElementById(id) : null;
  };
  var saveDb = null;
  var saveTimer = 0;
  var applying = false;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var DEFAULT_BG = 'white';
  var DEFAULT_FG = 'hsla(200,0%,0%,.7)';

  var messages = {
    semitransparent: 'The background is semi-transparent, so the contrast ratio cannot be precise. Depending on what is underneath, it could be any of the following:',
    fail: 'Fails WCAG 2.0 and 2.1',
    'aa-large': 'Passes AA for large text (above 18pt or bold above 14pt) and AA for user interface components and graphical objects',
    aa: 'Passes AA level for any size text, AAA for large text (above 18pt or bold above 14pt), and AA for user interface components and graphical objects',
    aaa: 'Passes AAA level for any size text and AA for user interface components and graphical objects'
  };

  var levels = {
    fail: { range: [0, 3], color: 'hsl(0, 100%, 40%)' },
    'aa-large': { range: [3, 4.5], color: 'hsl(40, 100%, 45%)' },
    aa: { range: [4.5, 7], color: 'hsl(80, 60%, 45%)' },
    aaa: { range: [7, 22], color: 'hsl(95, 60%, 41%)' }
  };

  function floor(number, decimals) {
    decimals = +decimals || 0;
    var multiplier = Math.pow(10, decimals);
    return Math.floor(number * multiplier) / multiplier;
  }

  function rangeIntersect(min, max, upper, lower) {
    return (max < upper ? max : upper) - (lower < min ? min : lower);
  }

  function persist(immediate) {
    if (applying || !saveDb) return;
    var bg = $('background');
    var fg = $('foreground');
    if (!bg || !fg) return;
    if (saveTimer) clearTimeout(saveTimer);
    var write = function () {
      saveTimer = 0;
      saveDb.put({
        id: 'last',
        background: bg.value,
        foreground: fg.value
      }).catch(function () {});
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 250);
  }

  function updateLuminance(input, out) {
    var color = input.color;
    if (!color || !out) return;
    if (color.alpha < 1) {
      var lumBlack = color.overlayOn(Color.BLACK).luminance;
      var lumWhite = color.overlayOn(Color.WHITE).luminance;
      out.textContent = lumBlack + ' - ' + lumWhite;
      out.style.color = Math.min(lumBlack, lumWhite) < 0.2 ? 'white' : 'black';
    } else {
      out.textContent = color.luminance;
      out.style.color = color.luminance < 0.2 ? 'white' : 'black';
    }
  }

  function update() {
    var bg = $('background');
    var fg = $('foreground');
    var output = $('contrast');
    var ratioEl = $('ratio');
    var errorEl = $('error');
    var wcag = $('wcag');
    var precise = $('preciseContrast');
    if (!bg || !fg || !bg.color || !fg.color) return;

    var contrast = bg.color.contrast(fg.color);
    updateLuminance(bg, $('backgroundLum'));
    updateLuminance(fg, $('foregroundLum'));

    var min = contrast.min;
    var max = contrast.max;
    var range = max - min;
    var classes = [];
    var percentages = [];
    var level;
    for (level in levels) {
      if (!Object.prototype.hasOwnProperty.call(levels, level)) continue;
      var bounds = levels[level].range;
      var lower = bounds[0];
      var upper = bounds[1];
      if (min < upper && max >= lower) {
        classes.push(level);
        percentages.push({
          level: level,
          percentage: range ? 100 * rangeIntersect(min, max, upper, lower) / range : 100
        });
      }
    }

    ratioEl.textContent = String(floor(contrast.ratio, 2));

    if (contrast.error) {
      errorEl.textContent = '\u00b1' + floor(contrast.error, 2);
      errorEl.title = floor(min, 2) + ' - ' + floor(max, 2);
      precise.textContent = min + ' - ' + max;
    } else {
      errorEl.textContent = '';
      errorEl.title = '';
      precise.textContent = String(contrast.ratio);
    }

    wcag.textContent = '';
    if (classes.length <= 1) {
      wcag.textContent = messages[classes[0]] || '';
      output.style.backgroundImage = '';
      output.style.backgroundColor = levels[classes[0]] ? levels[classes[0]].color : '';
    } else {
      var p = document.createElement('p');
      p.textContent = messages.semitransparent;
      wcag.appendChild(p);
      var ul = document.createElement('ul');
      var i;
      for (i = 0; i < classes.length; i++) {
        var li = document.createElement('li');
        li.textContent = messages[classes[i]];
        ul.appendChild(li);
      }
      wcag.appendChild(ul);

      var stops = [];
      var previousPercentage = 0;
      for (i = 0; i < 2 * percentages.length; i++) {
        var info = percentages[i % percentages.length];
        var color = levels[info.level].color;
        var percentage = previousPercentage + info.percentage / 2;
        stops.push(color + ' ' + previousPercentage + '%', color + ' ' + percentage + '%');
        previousPercentage = percentage;
      }
      output.style.backgroundImage = 'linear-gradient(135deg, ' + stops.join(', ') + ')';
    }

    output.className = 'contrast ' + classes.join(' ');
    persist();
  }

  function colorChanged(input) {
    input.style.width = input.value.length + 'ch';
    var isForeground = input === $('foreground');
    var display = isForeground ? $('foregroundDisplay') : $('backgroundDisplay');
    var previousColor = getComputedStyle(display).backgroundColor;

    var match = input.value.match(/^[0-9a-f]{3,8}$/i);
    if (match && [3, 4, 6, 8].indexOf(match[0].length) >= 0) {
      input.value = '#' + input.value;
    }

    display.style.background = input.value;
    var color = getComputedStyle(display).backgroundColor;
    if (color && input.value && (color !== previousColor || color === 'transparent' || color === 'rgba(0, 0, 0, 0)')) {
      if (isForeground) $('backgroundDisplay').style.color = input.value;
      input.color = new Color(color);
      return true;
    }
    return false;
  }

  function syncPicker(which) {
    var input = $(which);
    var picker = $(which + 'ColorPicker');
    var display = $(which + 'Display');
    if (!input || !picker || !display || !input.color) return;
    try {
      var style = getComputedStyle(display).backgroundColor;
      picker.value = new Color(style).toHex(false);
    } catch (e) {}
  }

  function onInput() {
    if (applying) return;
    if (!colorChanged(this)) return;
    update();
    syncPicker(this.id);
  }

  function onPicker(which) {
    return function (ev) {
      var input = $(which);
      input.value = ev.target.value;
      colorChanged(input);
      update();
    };
  }

  function swap() {
    var bg = $('background');
    var fg = $('foreground');
    var tmp = bg.value;
    bg.value = fg.value;
    fg.value = tmp;
    colorChanged(bg);
    colorChanged(fg);
    update();
    syncPicker('background');
    syncPicker('foreground');
  }

  function applyPair(background, foreground) {
    applying = true;
    $('background').value = background || DEFAULT_BG;
    $('foreground').value = foreground || DEFAULT_FG;
    applying = false;
    colorChanged($('background'));
    colorChanged($('foreground'));
    update();
    syncPicker('background');
    syncPicker('foreground');
  }

  function loadSave() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      var last = null;
      (rows || []).forEach(function (r) {
        if (r && r.id === 'last') last = r;
      });
      if (last && last.background && last.foreground) {
        applyPair(last.background, last.foreground);
      }
    }).catch(function () {});
  }

  function boot() {
    $('background').addEventListener('input', onInput);
    $('foreground').addEventListener('input', onInput);
    $('backgroundColorPicker').addEventListener('input', onPicker('background'));
    $('foregroundColorPicker').addEventListener('input', onPicker('foreground'));
    $('swap').addEventListener('click', swap);
    applyPair(DEFAULT_BG, DEFAULT_FG);
    loadSave();
  }

  if ($('background') && root.Color) boot();

  root.addEventListener('pagehide', function () {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    persist(true);
  });

  root.ContrastRatio = { floor: floor, messages: messages };
})(window);
