/* The House — wrap the original rooms. Inventory/progress in gifos.db('save'). */
(function () {
  'use strict';

  function IM() { return window.HOUSE_IMAGES || {}; }
  function SND() { return window.HOUSE_SOUNDS || {}; }
  function ROOMS() { return window.HOUSE_ROOMS || {}; }

  function hideBoot() {
    var el = document.getElementById('house-boot');
    if (!el || el.classList.contains('gone')) return;
    el.classList.add('gone');
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 700);
  }

  function remapSrc(src) {
    if (!src || /^data:|^blob:/i.test(src)) return src;
    var u = String(src).trim().replace(/^['"]|['"]$/g, '').split('?')[0].replace(/\\/g, '/');
    u = u.replace(/^\.\//, '');
    while (u.indexOf('../') === 0) u = u.slice(3);
    if (u.charAt(0) === '/') u = u.slice(1);
    var images = IM(), sounds = SND();
    if (images[u]) return images[u];
    if (sounds[u]) return sounds[u];
    var m = u.match(/((?:images|fonts|sound)\/[^/?#]+)$/);
    if (m) {
      if (images[m[1]]) return images[m[1]];
      if (sounds[m[1]]) return sounds[m[1]];
    }
    /* SM2 concatenates location.pathname + 'sound/x.mp3' → 'srcdocsound/x.mp3' */
    m = u.match(/sound\/([^/?#]+)$/);
    if (m && sounds['sound/' + m[1]]) return sounds['sound/' + m[1]];
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
          if (typeof v === 'string' && (v.indexOf('images/') !== -1 || v.indexOf('url(') !== -1 || v.indexOf('fonts/') !== -1 || v.indexOf('sound/') !== -1)) {
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
    var rooms = ROOMS();
    if (rooms[u] != null) return u;
    var base = u.indexOf('/') >= 0 ? u.slice(u.lastIndexOf('/') + 1) : u;
    if (rooms[base] != null) return base;
    return null;
  }

  var skipIntro = false;

  function patchJquery() {
    if (!window.jQuery) return;
    var $ = window.jQuery;
    var origLoad = $.fn.load;
    $.fn.load = function (url, data, complete) {
      if (typeof url === 'string' && /\.html/i.test(url)) {
        var key = roomKey(url);
        if (key === 'intro.html' && skipIntro) {
          resumeRoom();
          return this;
        }
        if (key && ROOMS()[key] != null) {
          this.html(remapHtml(ROOMS()[key]));
          hideBoot();
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

  /* SM2 sniffs playability from the URL's extension. A remapped blob: URL has
     none, so without a type hint every sound is "unplayable" and the house
     goes silent. The hint comes from the extension the game ASKED for. */
  function soundMime(u) {
    u = String(u || '').split('?')[0];
    if (/\.ogg$/i.test(u)) return 'audio/ogg';
    if (/\.mp3$/i.test(u)) return 'audio/mpeg';
    return null;
  }

  function patchSounds() {
    var sm = window.soundManager;
    if (!sm || !sm.createSound) return;
    var orig = sm.createSound;
    sm.createSound = function (opts, url) {
      if (typeof opts === 'string') {
        var t = soundMime(url);
        url = remapSrc(url || '');
        return orig.call(this, { id: opts, url: url, type: t });
      }
      if (opts && opts.url) {
        var askType = soundMime(opts.url);
        opts.url = remapSrc(opts.url);
        if (askType && !opts.type) opts.type = askType;
      }
      return orig.call(this, opts);
    };
  }

  /* The vendor preloader scrapes document.styleSheets and regex-matches image
     paths out of every rule's concatenated cssText. After bakeCss() that text
     holds the packed art itself — megabytes of data:/blob: URL where upstream
     had "images/x.jpg" — and its [^("]+\.(gif|jpg|…) match BACKTRACKS
     CATASTROPHICALLY: measured >20 s for 0.9 MB of it, and the real sheet is
     ~11 MB, i.e. the page wedges solid with every timer dead behind it. That
     wedge was the whole "The house is assembling forever" hang. The port
     already KNOWS every picture — the packed map — so preloading is a walk
     over IM(), never a scrape of the CSSOM. */
  function patchPreloader() {
    if (!window.jQuery) return;
    $.preloadCssImages = function () {
      /* Everything is already local bytes, so there is nothing to WAIT for —
         the vendor's black curtain and red bar would only flash over the
         intro for one ugly frame (the blind load critique caught exactly
         that). The curtain lifts at once; the decode warm-up runs silently
         behind the intro, bounded so a bad picture can never pile up. */
      $('#preloader').hide();
      $('#black').stop(true).animate({ opacity: 0 }, 250, function () { $(this).remove(); });
      var images = IM(), urls = [], k;
      for (k in images) {
        if (Object.prototype.hasOwnProperty.call(images, k) && k.indexOf('images/') === 0) urls.push(images[k]);
      }
      var inflight = 0, i = 0;
      function pump() {
        while (inflight < 4 && i < urls.length) {
          (function (src) {
            inflight++;
            var im = new Image();
            var settled = false;
            var fin = function () {
              if (settled) return;
              settled = true;
              inflight--;
              pump();
            };
            im.onload = fin;
            im.onerror = fin;
            setTimeout(fin, 1500);
            im.src = src;
          })(urls[i++]);
        }
      }
      pump();
      return urls;
    };
  }

  function patchDrag() {
    if (!window.room || !room.draggable) return;
    var orig = room.draggable;
    room.draggable = function () {
      orig.call(room);
      try {
        var $el = $('#the_game').children('div:first-child');
        if ($el.length && $el.draggable) {
          $el.draggable('option', 'distance', 22);
          $el.draggable('option', 'cancel',
            '#note, [data-tooltip], [data-info], .close, #enter, #logo, #head_hole, #button, #switch_sound, #settings, #settings_reset, #options, #lightbox, a, button');
        }
      } catch (e) {}
    };
  }

  /* A tap is a click. jQuery UI 1.8 only listens to mouse, so a phone would
     pan the page (or drag the room 2px and swallow the click). */
  function punchTouch() {
    var touching = false, moved = false, sx = 0, sy = 0, last = null;
    function mouseFromTouch(type, touch, target) {
      var ev;
      try {
        ev = new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          detail: 1,
          screenX: touch.screenX,
          screenY: touch.screenY,
          clientX: touch.clientX,
          clientY: touch.clientY,
          button: 0
        });
      } catch (e) {
        ev = document.createEvent('MouseEvents');
        ev.initMouseEvent(type, true, true, window, 1,
          touch.screenX, touch.screenY, touch.clientX, touch.clientY,
          false, false, false, false, 0, null);
      }
      (target || touch.target).dispatchEvent(ev);
    }
    document.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) return;
      touching = true;
      moved = false;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      last = e.touches[0];
      mouseFromTouch('mousedown', last);
    }, true);
    document.addEventListener('touchmove', function (e) {
      if (!touching || !e.touches || e.touches.length !== 1) return;
      last = e.touches[0];
      var dx = last.clientX - sx, dy = last.clientY - sy;
      if (dx * dx + dy * dy > 64) moved = true;
      if (moved) e.preventDefault();
      mouseFromTouch('mousemove', last);
    }, { capture: true, passive: false });
    document.addEventListener('touchend', function (e) {
      if (!touching) return;
      touching = false;
      var t = (e.changedTouches && e.changedTouches[0]) || last;
      if (!t) return;
      var el = document.elementFromPoint(t.clientX, t.clientY) || t.target;
      e.preventDefault();
      mouseFromTouch('mouseup', t, el);
      if (!moved) mouseFromTouch('click', t, el);
    }, true);
  }

  function fillArray(dest, src) {
    var i, s = Array.isArray(src) ? src : [];
    if (!dest || !dest.splice) {
      dest = [];
    } else {
      dest.length = 0;
    }
    for (i = 0; i < s.length; i++) dest.push(s[i]);
    return dest;
  }

  function snapshotStore(jst) {
    var obj = {}, keys, i;
    if (!jst || !jst.index) return obj;
    keys = jst.index();
    for (i = 0; i < keys.length; i++) obj[keys[i]] = jst.get(keys[i]);
    return obj;
  }

  function restoreStore(jst, store, setFn) {
    if (!jst || !store) return;
    var k, set = setFn || (jst.set && jst.set.bind(jst));
    if (!set) return;
    for (k in store) {
      if (Object.prototype.hasOwnProperty.call(store, k)) set.call(jst, k, store[k]);
    }
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
      collected = fillArray(typeof collected !== 'undefined' ? collected : [], $.jStorage.get('collected', []));
      used = fillArray(typeof used !== 'undefined' ? used : [], $.jStorage.get('used', []));
      played = fillArray(typeof played !== 'undefined' ? played : [], $.jStorage.get('played', []));
      fish = fillArray(typeof fish !== 'undefined' ? fish : [], $.jStorage.get('fish', []));
      path = fillArray(typeof path !== 'undefined' ? path : [], $.jStorage.get('temp_path', []));
      is_in = $.jStorage.get('is_in');
      if (window.room && room.settings) {
        room.settings.collected_items = collected;
        room.settings.used_items = used;
      }
    } catch (e) {}
  }

  function persist(now) {
    if (!saveDb || !origSet) return;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    var write = function () {
      saveTimer = 0;
      var obj = snapshotStore($.jStorage);
      saveDb.put({ id: 'last', store: obj }).catch(function () {});
    };
    if (now) write();
    else saveTimer = setTimeout(write, 280);
  }

  function wrapStorage() {
    origSet = $.jStorage.set;
    origFlush = $.jStorage.flush;
    origDelete = $.jStorage.deleteKey;
    $.jStorage.set = function (key) {
      var r = origSet.apply(this, arguments);
      var now = key === 'is_in' || key === 'collected' || key === 'used' || key === 'played';
      persist(now);
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
    restoreStore($.jStorage, store, origSet);
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
    skipIntro = false;
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
          text: 'The game will start from the beginning. Save data will be erased.',
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

  function bindBack() {
    if (!window.gifos || typeof gifos.onBack !== 'function') return;
    gifos.onBack(function () {
      try {
        if ($('#lightbox').is(':visible')) {
          $('#lightbox').empty().hide();
          return true;
        }
        if ($('#room_view').length && $('.close').length) {
          $('.close').first().trigger('click');
          return true;
        }
        if ($('#dialogue_box').length) {
          if (window.dialogue_box && dialogue_box.destroy) dialogue_box.destroy();
          else $('#dialogue_box').remove();
          return true;
        }
        if ($('#settings').hasClass('on')) {
          $('#settings').trigger('click');
          return true;
        }
        if ($('#button').hasClass('up')) {
          $('#button').trigger('click');
          return true;
        }
      } catch (e) {}
      return false;
    });
  }

  var started = false;
  function start(rec) {
    if (started) return;
    started = true;
    wrapStorage();
    if (rec && rec.store) restore(rec.store);
    else syncGlobals();
    wrapSettings();
    bindBack();
    try {
      window.location.reload = houseRestart;
    } catch (e) {}
    skipIntro = !!(window.jQuery && $.jStorage && $.jStorage.get('is_in'));
    if (window.__houseReleaseSM) window.__houseReleaseSM();
    else if (window.soundManager && soundManager.beginDelayedInit) {
      soundManager.beginDelayedInit();
    }
    setTimeout(function () {
      if (!$('#the_game').children().length) houseShowIntro();
    }, 2800);
  }

  window.HousePort = {
    remapSrc: remapSrc,
    remapHtml: remapHtml,
    remapCssUrls: remapCssUrls,
    fillArray: fillArray,
    snapshotStore: snapshotStore,
    restoreStore: restoreStore,
    syncGlobals: syncGlobals,
    persistNow: function () { persist(true); },
    roomKey: roomKey
  };

  if (window.HOUSE_TEST) return;

  function mapsReady() {
    return Object.keys(IM()).length > 50 && Object.keys(SND()).length > 10 && ROOMS()['intro.html'] && ROOMS()['room.html'];
  }

  /* ---- the assembling card is a real gauge, not a mood ------------------- */
  function bootNote(msg) {
    var el = document.getElementById('house-boot-note');
    if (el) el.textContent = msg;
  }
  function bootBar(frac) {
    var el = document.getElementById('house-boot-bar');
    if (el) el.style.width = Math.max(0, Math.min(100, frac * 100)).toFixed(1) + '%';
  }

  /* The art and sounds ride the GIF as raw .assets/ files — bytes, not 24 MB
     of base64 inside the page — and arrive here on demand, so first paint is
     immediate and this bar moves by real megabytes. Legacy builds that still
     inline chunk scripts have no index and simply wait for the parser. */
  function loadPackedAssets(done) {
    var idx = window.HOUSE_ASSET_INDEX;
    if (!idx) {
      (function waitChunks() {
        if (mapsReady()) return done();
        setTimeout(waitChunks, 40);
      })();
      return;
    }
    var g = window.gifos;
    var keys = Object.keys(idx);
    if (!g || typeof g.assets !== 'function' || typeof URL === 'undefined' || !URL.createObjectURL) {
      bootNote('This GifOS cannot hand the house its pictures — update GifOS, then open the app again.');
      done();
      return;
    }
    var images = window.HOUSE_IMAGES = window.HOUSE_IMAGES || {};
    var sounds = window.HOUSE_SOUNDS = window.HOUSE_SOUNDS || {};
    var total = 0, got = 0, i;
    for (i = 0; i < keys.length; i++) total += idx[keys[i]] || 1;
    var next = 0, inflight = 0, missing = [];
    var mb = function (n) { return (n / 1048576).toFixed(1); };
    function mimeOf(k) {
      if (/\.png$/i.test(k)) return 'image/png';
      if (/\.jpe?g$/i.test(k)) return 'image/jpeg';
      if (/\.gif$/i.test(k)) return 'image/gif';
      if (/\.mp3$/i.test(k)) return 'audio/mpeg';
      if (/\.ogg$/i.test(k)) return 'audio/ogg';
      return 'application/octet-stream';
    }
    function land(k, buf) {
      var url = URL.createObjectURL(new Blob([buf], { type: mimeOf(k) }));
      (k.indexOf('sound/') === 0 ? sounds : images)[k] = url;
    }
    function settle(k) {
      got += idx[k] || 1;
      inflight--;
      bootBar(got / total);
      bootNote('Carrying things in — ' + mb(got) + ' of ' + mb(total) + ' MB.');
      pump();
    }
    function fetchOne(k, retried) {
      inflight++;
      g.assets(k).then(function (buf) {
        land(k, buf);
        settle(k);
      }).catch(function () {
        inflight--;
        if (!retried) { fetchOne(k, true); return; }
        missing.push(k);
        inflight++; // settle() undoes it — one bookkeeping path
        settle(k);
      });
    }
    function pump() {
      while (inflight < 4 && next < keys.length) fetchOne(keys[next++], false);
      if (!inflight && next >= keys.length) {
        bootBar(1);
        // Not silence at a full bar: the beat between "everything carried in"
        // and the intro painting is a named step, or it reads as a stall.
        bootNote(missing.length
          ? missing.length + ' pieces of the house did not arrive — it may look patchy.'
          : 'Opening the door…');
        done();
      }
    }
    bootNote('Carrying things in — 0.0 of ' + mb(total) + ' MB.');
    pump();
  }

  function libsReady() {
    return !!(window.jQuery && window.game && window.scene && window.soundManager &&
      ROOMS()['intro.html'] != null && ROOMS()['room.html'] != null);
  }

  function bootWhenReady() {
    if (!libsReady()) {
      setTimeout(bootWhenReady, 40);
      return;
    }
    loadPackedAssets(function () {
      if (!mapsReady()) {
        bootBar(0);
        bootNote('The house could not be assembled on this computer. Close the app and open it again.');
        return; // an honest refusal on the card beats a blank room
      }
      hookImages();
      patchJquery();
      patchSounds();
      patchDrag();
      patchPreloader();
      bakeCss();
      punchTouch();

      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') persist(true);
      });

      if (saveDb && saveDb.get) {
        saveDb.get('last').then(start).catch(function () { start(null); });
        setTimeout(function () { start(null); }, 4000);
      } else {
        start(null);
      }
      // The card normally leaves when the first room's markup lands (the
      // $.fn.load hook). If anything downstream stalls, it must never trap
      // the player behind an opaque card.
      setTimeout(hideBoot, 20000);
    });
  }
  bootWhenReady();
})();
