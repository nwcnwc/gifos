/* Mount the reader, restore the last book, load the sample on a first run. */
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var viewer = new root.EpubViewer({
    stage: $('stage'),
    paper: $('paper'),
    flow: $('flow'),
    pointer: $('pointer')
  });
  var net = root.EpubNet;
  var findOpen = false;
  var tocOpen = false;
  var pointing = false;
  var pointMode = false;

  function status(msg) { $('status').textContent = msg || ''; }
  function spinner(on) { $('spinner').hidden = !on; }

  function paintChrome() {
    var s = viewer.snapshot();
    $('place').textContent = (s.page || 1) + ' / ' + (s.pages || 1);
    $('prev').disabled = !s.spineLen || (s.spine <= 0 && s.page <= 1);
    $('next').disabled = !s.spineLen || (s.spine >= s.spineLen - 1 && s.page >= s.pages);
    var who = s.title || (s.name ? s.name.replace(/^.*[\\/]/, '') : '');
    var bits = [];
    if (who) bits.push(who);
    if (s.spineLen) bits.push('ch ' + (s.spine + 1) + ' of ' + s.spineLen);
    if (s.pages) bits.push('page ' + s.page + ' of ' + s.pages);
    status(bits.join(' · '));
    paintToc();
  }

  function paintToc() {
    var list = $('toc-list');
    list.innerHTML = '';
    var toc = viewer.toc || [];
    if (!toc.length) {
      for (var i = 0; i < viewer.spineLen; i++) {
        toc.push({ label: 'Chapter ' + (i + 1), href: '', depth: 0, spine: i });
      }
    }
    toc.forEach(function (it, n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = it.label;
      b.className = 'd' + Math.min(2, it.depth || 0);
      var here = false;
      if (it.href && viewer.href && it.href.split('#')[0] === viewer.href.split('#')[0]) here = true;
      if (it.spine === viewer.spineIndex) here = true;
      if (here) b.classList.add('here');
      b.addEventListener('click', function () {
        if (it.href) viewer.goHref(it.href);
        else if (it.spine != null) viewer.showChapter(it.spine, 0, true);
        setToc(false);
      });
      list.appendChild(b);
    });
  }

  function showFindCount() {
    var n = viewer.matches.length;
    var el = $('find-count');
    if (!viewer.query) { el.textContent = ''; return; }
    if (!n) { el.textContent = 'none'; return; }
    el.textContent = (viewer.matchI + 1) + ' / ' + n;
  }

  viewer.onChange = function () {
    document.body.classList.add('loaded');
    $('empty').hidden = true;
    paintChrome();
    showFindCount();
    net.scheduleSave(viewer);
    if (!net.isApplying()) net.publishCursor(viewer, null, pointing);
  };

  function openBytes(name, buf, fromRemote) {
    spinner(true);
    return viewer.open(name, buf).then(function () {
      spinner(false);
      document.body.classList.add('loaded');
      paintChrome();
      if (!fromRemote) {
        net.persist(viewer);
        net.publishDoc(viewer);
        net.publishCursor(viewer, null, false);
      }
      if (buf && buf.byteLength > net.MAX_BYTES) {
        status((name || 'This file') + ' is too large to keep in the app (8 MB). Open it again next time.');
      }
    }).catch(function (e) {
      spinner(false);
      status((e && e.message) || String(e));
    });
  }

  function decodeSample() {
    var b64 = root.SAMPLE_EPUB_B64;
    if (!b64) return null;
    var bin = atob(b64);
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  function readFile(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error || new Error('Could not read the file.')); };
      r.readAsArrayBuffer(file);
    });
  }

  $('file-input').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    spinner(true);
    readFile(f).then(function (buf) {
      viewer.spineIndex = 0;
      viewer.pageI = 0;
      return openBytes(f.name, buf, false);
    }).catch(function (err) {
      spinner(false);
      status((err && err.message) || String(err));
    });
  });

  var stage = $('stage');
  stage.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  stage.addEventListener('drop', function (e) {
    e.preventDefault();
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    spinner(true);
    readFile(f).then(function (buf) {
      viewer.spineIndex = 0;
      viewer.pageI = 0;
      return openBytes(f.name, buf, false);
    }).catch(function (err) {
      spinner(false);
      status((err && err.message) || String(err));
    });
  });

  $('prev').onclick = function () { viewer.prev(); };
  $('next').onclick = function () { viewer.next(); };
  $('font-up').onclick = function () { viewer.setFont(viewer.fontPx + 2); };
  $('font-down').onclick = function () { viewer.setFont(viewer.fontPx - 2); };

  function setToc(on) {
    tocOpen = !!on;
    $('toc').hidden = !tocOpen;
    $('toc-toggle').classList.toggle('on', tocOpen);
    if (tocOpen) paintToc();
  }
  $('toc-toggle').onclick = function () { setToc(!tocOpen); };

  function setFind(on) {
    findOpen = !!on;
    $('findbar').hidden = !findOpen;
    if (findOpen) {
      $('find').focus();
      $('find').select();
    } else {
      viewer.search('').then(showFindCount);
    }
  }
  $('point-toggle').onclick = function () {
    pointMode = !pointMode;
    $('point-toggle').classList.toggle('on', pointMode);
    $('point-toggle').setAttribute('aria-pressed', pointMode ? 'true' : 'false');
    if (!pointMode) {
      pointing = false;
      viewer.setPointer(0, 0, false);
      net.point(viewer, null, false);
    }
  };
  $('find-toggle').onclick = function () { setFind(!findOpen); };
  $('find-close').onclick = function () { setFind(false); };
  $('find').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) viewer.goMatch(viewer.matchI - 1).then(showFindCount);
      else if (viewer.matches.length && viewer.query === $('find').value.trim()) {
        viewer.goMatch(viewer.matchI + 1).then(showFindCount);
      } else {
        viewer.search($('find').value).then(showFindCount);
      }
    }
  });
  $('find-next').onclick = function () {
    if (!viewer.matches.length) viewer.search($('find').value).then(showFindCount);
    else viewer.goMatch(viewer.matchI + 1).then(showFindCount);
  };
  $('find-prev').onclick = function () {
    if (!viewer.matches.length) viewer.search($('find').value).then(showFindCount);
    else viewer.goMatch(viewer.matchI - 1).then(showFindCount);
  };

  $('flow').addEventListener('click', function (e) {
    if (pointMode) return;
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    if (/^https?:/i.test(href)) return;
    viewer.goHref(href);
  });

  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      if (e.key === 'Escape') { e.target.blur(); setFind(false); }
      return;
    }
    if (e.key === 'f' || e.key === 'F' || ((e.ctrlKey || e.metaKey) && e.key === 'f')) {
      e.preventDefault();
      setFind(true);
      return;
    }
    if (e.key === 'c' || e.key === 'C') { setToc(!tocOpen); return; }
    if (e.key === 'Escape') { setFind(false); setToc(false); return; }
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault(); viewer.next();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault(); viewer.prev();
    } else if (e.key === ']') {
      viewer.nextChapter();
    } else if (e.key === '[') {
      viewer.prevChapter();
    } else if (e.key === 'Home') {
      e.preventDefault(); viewer.showChapter(0, 0, true);
    } else if (e.key === 'End') {
      e.preventDefault(); viewer.showChapter(viewer.spineLen - 1, 0, true);
    } else if (e.key === '+' || e.key === '=') {
      viewer.setFont(viewer.fontPx + 2);
    } else if (e.key === '-' || e.key === '_') {
      viewer.setFont(viewer.fontPx - 2);
    }
  });

  var paper = $('paper');
  paper.addEventListener('pointerdown', function (e) {
    if (!pointMode) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var n = viewer.eventToNorm(e);
    if (!n) return;
    pointing = true;
    viewer.setPointer(n.x, n.y, true);
    net.point(viewer, n, true);
    e.preventDefault();
  });
  paper.addEventListener('pointermove', function (e) {
    if (!pointing) return;
    var n = viewer.eventToNorm(e);
    if (!n) return;
    viewer.setPointer(n.x, n.y, true);
    net.point(viewer, n, true);
  });
  function endPoint() {
    if (!pointing) return;
    pointing = false;
    viewer.setPointer(0, 0, false);
    net.point(viewer, null, false);
  }
  paper.addEventListener('pointerup', endPoint);
  paper.addEventListener('pointercancel', endPoint);
  paper.addEventListener('pointerleave', endPoint);

  if (root.EpubTouch) {
    root.EpubTouch.bind(stage, viewer, {
      onSwipe: function (dir) { if (dir > 0) viewer.next(); else viewer.prev(); }
    });
  }

  var remotePtrHide = 0;
  net.start({
    onDoc: function (rec) {
      var buf = net.bufOf(rec.bytes);
      if (!buf) return;
      net.setApplying(true);
      viewer.spineIndex = 0;
      viewer.pageI = 0;
      openBytes(rec.name || 'shared.epub', buf, true).then(function () {
        net.setApplying(false);
      });
    },
    onCursor: function (rec) {
      if (rec.spine != null && rec.spine !== viewer.spineIndex) {
        net.setApplying(true);
        viewer.showChapter(rec.spine, rec.fraction != null ? rec.fraction : rec.page || 0, rec.fraction == null).then(function () {
          net.setApplying(false);
        });
      } else if (rec.fraction != null && viewer.pageN) {
        var want = Math.round(rec.fraction * Math.max(0, viewer.pageN - 1));
        if (want !== viewer.pageI) {
          net.setApplying(true);
          viewer.goPage(want).then(function () { net.setApplying(false); });
        }
      } else if (rec.page != null && rec.page !== viewer.pageI) {
        net.setApplying(true);
        viewer.goPage(rec.page).then(function () { net.setApplying(false); });
      }
      if (rec.pointing && rec.px != null) {
        viewer.setPointer(rec.px, rec.py, true);
        clearTimeout(remotePtrHide);
        remotePtrHide = setTimeout(function () { viewer.setPointer(0, 0, false); }, 1200);
      } else {
        viewer.setPointer(0, 0, false);
      }
      var n = rec.name ? rec.name : 'A friend';
      $('meet').textContent = n + ' is reading with you. Hold on the page to point.';
    }
  }).then(function () {
    return net.loadSaved();
  }).then(function (rec) {
    if (rec && rec.bytes) {
      var buf = net.bufOf(rec.bytes);
      if (buf) {
        viewer.spineIndex = rec.spine || 0;
        viewer.pageI = rec.page || 0;
        if (rec.fontPx) viewer.fontPx = rec.fontPx;
        return openBytes(rec.name || 'saved.epub', buf, false);
      }
    }
    var sample = decodeSample();
    if (sample) {
      viewer.spineIndex = 0;
      viewer.pageI = 0;
      return openBytes('paper-boats.epub', sample, false);
    }
  }).catch(function (e) {
    status((e && e.message) || String(e));
  });

  root.addEventListener('resize', function () {
    if (viewer.book) viewer.relayout();
  });

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (findOpen) { setFind(false); return true; }
      if (tocOpen) { setToc(false); return true; }
      if (pointMode) { $('point-toggle').click(); return true; }
      return false;
    });
  }
})(typeof window !== 'undefined' ? window : this);
