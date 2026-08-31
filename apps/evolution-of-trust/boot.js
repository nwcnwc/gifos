/*
 * The Evolution of Trust — GifOS shell.
 *
 * Loads the vendored explorable's pictures from gifos.assets, keeps the
 * chapter you reached in gifos.db, fits the 960×540 stage onto a phone,
 * and lets Back step one chapter. Invite wiring lives in net.js.
 */
(function (root) {
  'use strict';

  var CHAPTERS = ['intro', 'oneoff', 'iterated', 'tournament', 'evolution', 'distrust', 'noise', 'sandbox', 'conclusion', 'credits'];
  var prefs = { chapter: '', mute: false, furthest: '' };
  var started = false;
  // main.js assigns window.onload. A srcdoc has nothing left to load, so
  // that fires in the gap while gifos.assets() is still landing pictures —
  // Splash then throws (no sprites) and a second start cannot find #preloader.
  var originalOnload = root.onload;
  root.onload = function () {};

  function $(id) { return document.getElementById(id); }

  function chapterIndex(id) {
    var i = CHAPTERS.indexOf(id);
    return i < 0 ? -1 : i;
  }

  var saveTimer = null;
  function savePrefs() {
    if (!root.gifos || !root.gifos.db) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      root.gifos.db('progress').put({
        id: 'progress',
        chapter: prefs.chapter || '',
        furthest: prefs.furthest || '',
        mute: !!prefs.mute
      }).catch(function () {});
    }, 40);
  }

  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    return root.gifos.db('progress').get('progress').then(function (row) {
      if (!row) return;
      if (row.chapter) prefs.chapter = String(row.chapter);
      if (row.furthest) prefs.furthest = String(row.furthest);
      if (row.mute != null) prefs.mute = !!row.mute;
    }).catch(function () {});
  }

  function markChapter(id) {
    if (!id) return;
    prefs.chapter = id;
    if (chapterIndex(id) >= chapterIndex(prefs.furthest)) prefs.furthest = id;
    savePrefs();
  }

  function fitStage() {
    var main = $('main');
    var footer = $('footer');
    var stage = $('slideshow_container');
    if (!main || !stage) return;
    var fw = footer ? footer.offsetHeight : 60;
    var w = window.innerWidth || 960;
    var h = Math.max(120, (window.innerHeight || 540) - fw);
    var s = Math.min(w / 960, h / 540);
    if (s > 1) s = 1;
    if (s < 0.28) s = 0.28;
    stage.style.transform = 'scale(' + s + ')';
    document.body.classList.toggle('phone', w <= 700 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
  }

  function showNotes(on) {
    var el = $('notes-overlay');
    if (!el) return;
    if (on == null) on = el.hidden;
    el.hidden = !on;
    if (on) el.scrollTop = 0;
  }

  function wireNotes() {
    var body = $('notes-body');
    if (body && root.TRUST_NOTES_HTML) body.innerHTML = root.TRUST_NOTES_HTML;
    document.addEventListener('click', function (e) {
      var a = e.target;
      while (a && a.tagName !== 'A') a = a.parentNode;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (href === 'notes' || href === 'notes/' || href === './notes' || /\/notes\/?$/.test(href)) {
        e.preventDefault();
        showNotes(true);
      }
    }, true);
    var close = $('notes-close');
    if (close) close.addEventListener('click', function () { showNotes(false); });
    var shade = $('notes-overlay');
    if (shade) shade.addEventListener('click', function (e) {
      if (e.target === shade) showNotes(false);
    });
  }

  function patchWords() {
    if (!root.Words) return;
    root.Words.convert = function () {
      var deferred = root.Q.defer();
      var html = root.TRUST_WORDS_HTML || '';
      var box = document.createElement('div');
      box.innerHTML = html;
      var paragraphs = box.querySelectorAll('p');
      root.Words.text = {};
      for (var i = 0; i < paragraphs.length; i++) {
        root.Words.text[paragraphs[i].id] = paragraphs[i].innerHTML;
      }
      deferred.resolve(root.Words.text);
      return deferred.promise;
    };
  }

  function bootBar(frac, note) {
    var bar = $('trust-boot-bar');
    var msg = $('trust-boot-note');
    if (bar) bar.style.width = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%';
    if (msg && note) msg.textContent = note;
  }

  function loadPackedAssets() {
    var idx = root.TRUST_ASSET_INDEX || {};
    var keys = Object.keys(idx);
    var g = root.gifos;
    if (!keys.length) return Promise.resolve();
    if (!g || typeof g.assets !== 'function') {
      bootBar(1, 'Open this inside GifOS so the pictures can load.');
      return Promise.resolve();
    }
    var total = 0, got = 0, i;
    for (i = 0; i < keys.length; i++) total += idx[keys[i]] || 1;
    var next = 0, inflight = 0, missing = 0;
    return new Promise(function (resolve) {
      function settle(k) {
        got += idx[k] || 1;
        inflight--;
        bootBar(got / total, 'Carrying the tournament in — ' +
          (got / 1048576).toFixed(1) + ' of ' + (total / 1048576).toFixed(1) + ' MB.');
        pump();
      }
      function fetchOne(k, retried) {
        inflight++;
        g.assets(k).then(function (buf) {
          root.TRUST.land(k, buf);
          settle(k);
        }).catch(function () {
          inflight--;
          if (!retried) { fetchOne(k, true); return; }
          missing++;
          inflight++;
          settle(k);
        });
      }
      function pump() {
        while (inflight < 4 && next < keys.length) fetchOne(keys[next++], false);
        if (!inflight && next >= keys.length) {
          bootBar(1, missing ? (missing + ' pieces did not arrive.') : 'Opening…');
          resolve();
        }
      }
      bootBar(0, 'Carrying the tournament in…');
      pump();
    });
  }

  function hideBoot() {
    var el = $('trust-boot');
    if (!el) return;
    el.classList.add('gone');
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 500);
  }

  function restoreChapter() {
    if (!prefs.chapter || chapterIndex(prefs.chapter) < 0) return;
    if (prefs.chapter === 'intro' && !started) return;
    var want = prefs.chapter;
    try {
      if (!started) {
        started = true;
        var sel = $('select');
        if (sel) sel.style.display = 'block';
        if (!prefs.mute && root.Loader && Loader.sounds && Loader.sounds.bg_music) {
          Loader.sounds.bg_music.volume(0.75).loop(true).play();
        }
      }
      if (root.slideshow && slideshow.gotoSlide) slideshow.gotoSlide(want);
      else root.publish('slideshow/scratch', [want]);
    } catch (e) {}
  }

  function wireSlideshow() {
    root.subscribe('slideshow/slideChange', function (id) {
      if (id) markChapter(id);
      if (root.Net && root.Net.onSlide) root.Net.onSlide(id);
    });
    root.subscribe('start/game', function () {
      started = true;
      var sel = $('select');
      if (sel) sel.style.display = 'block';
    });
    root.subscribe('preloader/done', function () {
      document.body.setAttribute('data-trust-play', '1');
      var guest = root.Net && root.Net.live() && !root.Net.owner();
      if (!guest) restoreChapter();
    });
  }

  function wireSound() {
    var btn = $('sound');
    if (prefs.mute && root.Howler) {
      root.Howler.mute(true);
      if (btn) btn.setAttribute('sound', 'off');
    }
    if (btn) {
      var orig = btn.onclick;
      btn.onclick = function () {
        if (typeof orig === 'function') orig();
        prefs.mute = btn.getAttribute('sound') === 'off';
        savePrefs();
      };
    }
  }

  function wireBack() {
    if (!root.gifos || !root.gifos.onBack) return;
    root.gifos.onBack(function () {
      if (!$('notes-overlay').hidden) { showNotes(false); return true; }
      var id = prefs.chapter;
      var i = chapterIndex(id);
      if (i > 0) {
        root.publish('slideshow/scratch', [CHAPTERS[i - 1]]);
        return true;
      }
      if (i === 0 || started) {
        try {
          if (root.slideshow) root.slideshow.reset();
          root.slideshow.nextSlide();
          started = false;
          var sel = $('select');
          if (sel) sel.style.display = 'none';
        } catch (e) {}
        return true;
      }
      return false;
    });
  }

  function noteError(msg) {
    msg = String(msg || 'error');
    document.body.setAttribute('data-trust-err', msg.slice(0, 240));
    bootBar(1, msg);
  }

  function startOriginal() {
    window.addEventListener('error', function (e) {
      noteError((e && e.error && e.error.message) || (e && e.message) || 'error');
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      noteError((r && r.message) || String(r) || 'rejection');
    });
    document.body.setAttribute('data-trust-step', 'start');
    patchWords();
    if (root.TRUST && root.TRUST.bakeCss) root.TRUST.bakeCss();
    document.body.setAttribute('data-trust-step', 'css');
    fitStage();
    wireNotes();
    var run = originalOnload;
    originalOnload = null;
    root.onload = null;
    wireSlideshow();
    document.body.setAttribute('data-trust-step', 'run');
    if (typeof run === 'function') {
      try { run(); } catch (e) { noteError(e && e.message || e); }
    }
    document.body.setAttribute('data-trust-step', 'ran');
    fitStage();
    wireSound();
    wireBack();
    if (root.Net && root.Net.init) {
      root.Net.init({ chapters: CHAPTERS }).catch(function () {});
    }
    var waited = 0;
    (function waitMain() {
      var main = $('main');
      var painted = document.querySelector('#slideshow canvas') ||
        (document.querySelector('.textbox') && (document.querySelector('.textbox').innerText || '').length > 2);
      if (main && main.style.display === 'block' && painted) { hideBoot(); return; }
      waited += 40;
      if (waited >= 15000) {
        noteError(document.body.getAttribute('data-trust-err') || 'The essay did not paint.');
        return;
      }
      setTimeout(waitMain, 40);
    })();
  }

  function boot() {
    window.addEventListener('resize', fitStage);
    loadPrefs().then(function () {
      return loadPackedAssets();
    }).then(function () {
      document.body.setAttribute('data-trust-step', 'landed');
      setTimeout(startOriginal, 0);
    }).catch(function (err) {
      bootBar(1, (err && err.message) || 'Could not start.');
      startOriginal();
    });
  }

  root.TRUST = root.TRUST || {};
  root.TRUST.CHAPTERS = CHAPTERS;
  root.TRUST.random = Math.random;
  root.TRUST.seed = function (s) {
    var n = (s >>> 0) || 1;
    root.TRUST.random = function () {
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
      return n / 4294967296;
    };
    return n;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
