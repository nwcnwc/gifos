/* The House — wrap the original rooms. Inventory/progress in gifos.db('save'). */
(function () {
  'use strict';

  var IM = window.HOUSE_IMAGES || {};
  var SND = window.HOUSE_SOUNDS || {};
  var ROOMS = window.HOUSE_ROOMS || {};

  function remapSrc(src) {
    if (!src || /^data:|^blob:/i.test(src)) return src;
    var u = String(src).trim().replace(/^['"]|['"]$/g, '').split('?')[0].replace(/\\/g, '/');
    u = u.replace(/^\.\//, '');
    while (u.indexOf('../') === 0) u = u.slice(3);
    if (u.charAt(0) === '/') u = u.slice(1);
    if (IM[u]) return IM[u];
    if (SND[u]) return SND[u];
    var m = u.match(/(images\/[^/?#]+)$/);
    if (m && IM[m[1]]) return IM[m[1]];
    m = u.match(/(fonts\/[^/?#]+)$/);
    if (m && IM[m[1]]) return IM[m[1]];
    m = u.match(/(sound\/[^/?#]+)$/);
    if (m && SND[m[1]]) return SND[m[1]];
    return src;
  }

  function remapCssUrls(s) {
    return String(s).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, function (all, q, path) {
      var r = remapSrc(path);
      return r !== path ? 'url(' + r + ')' : all;
    });
  }

  function remapHtml(html) {
    var s = String(html);
    s = s.replace(/(src\s*=\s*['"])([^'"]+)(['"])/gi, function (all, a, src, b) {
      return a + remapSrc(src) + b;
    });
    s = s.replace(/(src\s*=\s*)([^\s>]+)/gi, function (all, a, src) {
      if (src.charAt(0) === '"' || src.charAt(0) === "'") return all;
      return a + remapSrc(src);
    });
    return remapCssUrls(s);
  }

  function hookImages() {
    var proto = window.HTMLImageElement && HTMLImageElement.prototype;
    if (proto) {
      var desc = Object.getOwnPropertyDescriptor(proto, 'src');
      if (desc && desc.set) {
        Object.defineProperty(proto, 'src', {
          configurable: true,
          enumerable: desc.enumerable,
          get: desc.get,
          set: function (v) { desc.set.call(this, remapSrc(v)); }
        });
      }
    }
    if (window.Element && Element.prototype && Element.prototype.setAttribute) {
      var origSA = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (n, v) {
        var name = String(n).toLowerCase();
        if (name === 'src') v = remapSrc(v);
        else if (name === 'style' && v && String(v).indexOf('url(') !== -1) v = remapCssUrls(String(v));
        return origSA.call(this, n, v);
      };
    }
    var ih = window.Element && Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (ih && ih.set) {
      Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: true,
        enumerable: ih.enumerable,
        get: ih.get,
        set: function (v) {
          if (typeof v === 'string' && (v.indexOf('images/') !== -1 || v.indexOf('url(') !== -1 || v.indexOf('fonts/') !== -1)) {
            v = remapHtml(v);
          }
          ih.set.call(this, v);
        }
      });
    }
  }

  function bakeCss() {
    var sheets = document.styleSheets;
    var i, j, rules, r, p, name, val;
    if (!sheets) return;
    for (i = 0; i < sheets.length; i++) {
      try { rules = sheets[i].cssRules; } catch (e) { continue; }
      if (!rules) continue;
      for (j = 0; j < rules.length; j++) {
        r = rules[j];
        if (!r || !r.style) continue;
        for (p = r.style.length - 1; p >= 0; p--) {
          name = r.style[p];
          val = r.style.getPropertyValue(name);
          if (val && val.indexOf('url(') !== -1) {
            r.style.setProperty(name, remapCssUrls(val), r.style.getPropertyPriority(name));
          }
        }
      }
    }
  }

  function roomKey(url) {
    var u = String(url || '').split('?')[0].replace(/^\.\//, '');
    if (u.charAt(0) === '/') u = u.slice(1);
    if (ROOMS[u] != null) return u;
    var base = u.indexOf('/') >= 0 ? u.slice(u.lastIndexOf('/') + 1) : u;
    if (ROOMS[base] != null) return base;
    return null;
  }

  function patchJquery() {
    if (!window.jQuery) return;
    var $ = window.jQuery;
    var origLoad = $.fn.load;
    $.fn.load = function (url, data, complete) {
      if (typeof url === 'string' && /\.html/i.test(url)) {
        var key = roomKey(url);
        if (key && ROOMS[key] != null) {
          this.html(ROOMS[key]);
          var cb = typeof complete === 'function' ? complete : (typeof data === 'function' ? data : null);
          if (cb) {
            var el = this[0];
            cb.call(el);
          }
          return this;
        }
      }
      return origLoad.apply(this, arguments);
    };
    var origCss = $.fn.css;
    $.fn.css = function (prop, val) {
      if (typeof prop === 'string' && arguments.length > 1 && val != null && /background|cursor|list-style/i.test(prop)) {
        val = remapCssUrls(String(val));
        return origCss.call(this, prop, val);
      }
      if (prop && typeof prop === 'object') {
        var k, copy = {};
        for (k in prop) {
          if (Object.prototype.hasOwnProperty.call(prop, k)) {
            copy[k] = (/background|cursor|list-style/i.test(k) && prop[k])
              ? remapCssUrls(String(prop[k]))
              : prop[k];
          }
        }
        return origCss.call(this, copy);
      }
      return origCss.apply(this, arguments);
    };
  }

  function patchSounds() {
    var sm = window.soundManager;
    if (!sm || !sm.createSound) return;
    var orig = sm.createSound;
    sm.createSound = function (opts, url) {
      if (typeof opts === 'string') {
        url = remapSrc(url || '');
        return orig.call(this, opts, url);
      }
      if (opts && opts.url) opts.url = remapSrc(opts.url);
      return orig.call(this, opts);
    };
  }

  var saveDb = null;
  var saveTimer = 0;
  var origSet = null;
  var origFlush = null;
  var origDelete = null;
  try { if (window.gifos && window.gifos.db) saveDb = window.gifos.db('save'); } catch (e) {}

  function syncGlobals() {
    if (!window.jQuery || !$.jStorage) return;
    try {
      collected = $.jStorage.get('collected', []);
      used = $.jStorage.get('used', []);
      played = $.jStorage.get('played', []);
      is_in = $.jStorage.get('is_in');
      fish = $.jStorage.get('fish', []);
      path = $.jStorage.get('temp_path');
    } catch (e) {}
  }

  function persist(now) {
    if (!saveDb || !origSet) return;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    var write = function () {
      saveTimer = 0;
      var obj = {};
      var keys = $.jStorage.index();
      var i;
      for (i = 0; i < keys.length; i++) obj[keys[i]] = $.jStorage.get(keys[i]);
      saveDb.put({ id: 'last', store: obj }).catch(function () {});
    };
    if (now) write();
    else saveTimer = setTimeout(write, 280);
  }

  function wrapStorage() {
    origSet = $.jStorage.set;
    origFlush = $.jStorage.flush;
    origDelete = $.jStorage.deleteKey;
    $.jStorage.set = function () {
      var r = origSet.apply(this, arguments);
      persist(false);
      return r;
    };
    $.jStorage.flush = function () {
      var r = origFlush.apply(this, arguments);
      persist(true);
      return r;
    };
    if (origDelete) {
      $.jStorage.deleteKey = function () {
        var r = origDelete.apply(this, arguments);
        persist(false);
        return r;
      };
    }
  }

  function restore(store) {
    if (!store) return;
    var k;
    for (k in store) {
      if (Object.prototype.hasOwnProperty.call(store, k)) origSet.call($.jStorage, k, store[k]);
    }
    syncGlobals();
  }

  function resumeRoom() {
    var here = $.jStorage.get('is_in');
    $('#switch_sound, #settings').fadeIn();
    $('#lightbox').hide();
    if (here === '' || here == null) scene.intro();
    else if (here === 'room') game.room(5, 6);
    else if (here === 'corridor') game.corridor(17, 3);
    else if (here === 'hidden_corridor') game.hidden_corridor(1, 18);
    else if (here === 'aquarium') game.aquarium(20, 5);
    else if (here === 'picture') game.picture(5, 5);
    else if (here === 'picture_snow') game.picture_snow(7, 8);
    else if (here === 'kitchen') game.kitchen(4, 10);
    else if (here === 'toilet') game.toilet(2, 2);
    else if (here === 'bathroom') game.bathroom(4, 4);
    else if (here === 'big_room') game.big_room(4, 4);
    else if (here === 'boiler_room') game.boiler_room(9, 5);
    else if (here === 'fridge') game.fridge(5, 2);
    else if (here === 'kitchen_true') game.kitchen_true(5, 2);
    else if (here === 'cabin') scene.cabin();
    else if (here === 'train') game.train(2, 2);
    else if (here === 'last_corridor') {
      if ($.inArray('darkness_retract3', played) !== -1) game.last_corridor(2, 36);
      else game.last_corridor(0, 6);
    } else if (here === 'void') game.void(11, 11);
    else if (here === 'void_bathroom') game.void_bathroom(0, 7);
    else if (here === 'exit') game.exit(2, 2);
    else scene.intro();
    items.holder();
    settings.init();
  }

  function houseShowIntro() {
    $('#lightbox, #items, #switch_sound, #settings').hide();
    $('#the_game').load('intro.html', function () {
      var enterPulse = 500, houseFloat = 2000;
      function pulse() {
        $('#enter').animate({ opacity: 0.5 }, enterPulse, function () {
          $(this).animate({ opacity: 1 }, enterPulse, function () { pulse(); });
        });
      }
      function floatHouse() {
        $('#house').animate({ top: '+=10px' }, houseFloat, function () {
          $(this).animate({ top: '-=10px' }, houseFloat, function () { floatHouse(); });
        });
      }
      pulse();
      floatHouse();
      var black = $('<div id="black" />').appendTo('body');
      $('<div id="preloader" />').appendTo(black);
      black.css('opacity', 1);
      if ($.preloadCssImages) $.preloadCssImages({ statusBarEl: '#preloader' });
      $('#logo, #head_hole, #enter').click(function () {
        $('#head_hole, #head_back, #logo').fadeOut('500');
        $('#house').fadeOut('1000');
        resumeRoom();
      });
    });
  }

  function houseRestart() {
    origFlush.call($.jStorage);
    origSet.call($.jStorage, 'v', 9);
    origSet.call($.jStorage, 'collected', []);
    origSet.call($.jStorage, 'used', []);
    origSet.call($.jStorage, 'played', []);
    origSet.call($.jStorage, 'is_in', '');
    origSet.call($.jStorage, 'fish', []);
    origSet.call($.jStorage, 'temp_path', []);
    syncGlobals();
    persist(true);
    try { if (window.soundManager && soundManager.stopAll) soundManager.stopAll(); } catch (e) {}
    $('#lightbox').empty().hide();
    $('#dialogue_box, #dialogue_box_image, #no_click, #black, #white').remove();
    houseShowIntro();
  }

  function wrapSettings() {
    if (!window.settings) return;
    settings.reset = function () {
      $('#settings_reset').unbind('click').click(function () {
        dialogue_box.display({
          character: false,
          picture: false,
          text: 'The game will start from the beggining. Save data will be erased.',
          options: ['Ok', 'Cancel']
        });
        $('#options').unbind('click').delegate('#option_0', 'click', function () {
          dialogue_box.destroy();
          houseRestart();
        });
        $('#options').delegate('#option_1', 'click', function () {
          dialogue_box.destroy();
        });
      });
    };
    settings.fullScreen = function () {};
  }

  function start(rec) {
    hookImages();
    patchJquery();
    patchSounds();
    bakeCss();
    wrapStorage();
    if (rec && rec.store) restore(rec.store);
    else syncGlobals();
    wrapSettings();
    try {
      window.location.reload = houseRestart;
    } catch (e) {}
    if (window.soundManager && soundManager.beginDelayedInit) {
      soundManager.beginDelayedInit();
    }
  }

  if (saveDb && saveDb.get) {
    saveDb.get('last').then(start).catch(function () { start(null); });
  } else {
    start(null);
  }
})();
