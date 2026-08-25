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

  // One short title and one plain line each — the whole verdict, no lists.
  var verdicts = {
    fail: {
      title: 'Fails',
      note: 'Too close. Not readable at any size.'
    },
    'aa-large': {
      title: 'Large text only',
      note: 'AA above 18pt, or bold above 14pt, and for icons and controls.'
    },
    aa: {
      title: 'Passes AA',
      note: 'Any size. AAA for large text, AA for icons and controls.'
    },
    aaa: {
      title: 'Passes AAA',
      note: 'The strict level, at any size.'
    }
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

  // "fails, large text only, or passes AA" — the see-through case, in a line.
  function joinTitles(classes) {
    var names = [];
    for (var i = 0; i < classes.length; i++) {
      names.push(verdicts[classes[i]].title.charAt(0).toLowerCase() +
                 verdicts[classes[i]].title.slice(1));
    }
    if (names.length < 2) return names.join('');
    return names.slice(0, -1).join(', ') + ', or ' + names[names.length - 1];
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

  // Luminance, short: one number, or a range when the colour is see-through.
  function luminance(input) {
    var color = input && input.color;
    if (!color) return '?';
    if (color.alpha < 1) {
      return floor(color.overlayOn(Color.BLACK).luminance, 3) + '–' +
             floor(color.overlayOn(Color.WHITE).luminance, 3);
    }
    return String(floor(color.luminance, 3));
  }

  function update() {
    var bg = $('background');
    var fg = $('foreground');
    var output = $('contrast');
    var ratioEl = $('ratio');
    var errorEl = $('error');
    var wcag = $('wcag');
    var note = $('note');
    var detail = $('detail');
    if (!bg || !fg || !bg.color || !fg.color) return;

    var contrast = bg.color.contrast(fg.color);
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

    var exact;
    if (contrast.error) {
      errorEl.textContent = '±' + floor(contrast.error, 2);
      exact = floor(min, 2) + '–' + floor(max, 2);
    } else {
      errorEl.textContent = '';
      exact = String(floor(contrast.ratio, 4));
    }
    detail.textContent = 'exact ' + exact + ' · luminance ' +
      luminance(bg) + ' → ' + luminance(fg);

    if (classes.length <= 1) {
      var only = verdicts[classes[0]];
      wcag.textContent = only ? only.title : '';
      note.textContent = only ? only.note : '';
      output.style.backgroundImage = '';
      output.style.backgroundColor = levels[classes[0]] ? levels[classes[0]].color : '';
    } else {
      // See-through: the answer depends on what is underneath, so say the span.
      wcag.textContent = 'Between ' + floor(min, 2) + ' and ' + floor(max, 2);
      note.textContent = 'Depends on what is underneath: ' + joinTitles(classes) + '.';

      var stops = [];
      var previousPercentage = 0;
      for (var i = 0; i < 2 * percentages.length; i++) {
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

  // The swatch doubles as the parser: assign the typed value, read back what
  // the browser made of it. An unparseable value leaves the old colour alone.
  function colorChanged(input) {
    var isForeground = input === $('foreground');
    var swatch = isForeground ? $('foregroundSwatch') : $('backgroundSwatch');
    var previousColor = getComputedStyle(swatch).backgroundColor;

    var match = input.value.match(/^[0-9a-f]{3,8}$/i);
    if (match && [3, 4, 6, 8].indexOf(match[0].length) >= 0) {
      input.value = '#' + input.value;
    }

    swatch.style.background = input.value;
    var color = getComputedStyle(swatch).backgroundColor;
    if (color && input.value && (color !== previousColor || color === 'transparent' || color === 'rgba(0, 0, 0, 0)')) {
      var preview = $('preview').firstElementChild;
      if (isForeground) preview.style.color = input.value;
      else preview.style.background = input.value;
      input.color = new Color(color);
      return true;
    }
    return false;
  }

  function syncPicker(which) {
    var input = $(which);
    var picker = $(which + 'ColorPicker');
    var swatch = $(which + 'Swatch');
    if (!input || !picker || !swatch || !input.color) return;
    try {
      picker.value = new Color(getComputedStyle(swatch).backgroundColor).toHex(false);
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

  root.ContrastRatio = { floor: floor, verdicts: verdicts };
})(window);
