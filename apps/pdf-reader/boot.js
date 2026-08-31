/* Mount the reader, restore the last file, load the sample on a first run. */
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var viewer = new root.PdfViewer({
    stage: $('stage'),
    wrap: $('page-wrap'),
    canvas: $('page-canvas'),
    textLayer: $('text-layer'),
    hlLayer: $('hl-layer'),
    pointer: $('pointer')
  });
  var net = root.PdfNet;
  var findOpen = false;
  var pwUpdate = null;
  var pinchDraw = 0;
  var pointing = false;
  var pointMode = false;

  function status(msg) { $('status').textContent = msg || ''; }
  function spinner(on) { $('spinner').hidden = !on; }

  function paintChrome() {
    var s = viewer.snapshot();
    $('page').value = s.page || 1;
    $('page').max = s.numPages || 1;
    $('of').textContent = '/ ' + (s.numPages || 1);
    var pct = Math.round((s.scale || 1) * 100);
    var label = s.fit === 'width' ? 'Width' : s.fit === 'page' ? 'Page' : (pct + '%');
    $('zoom-label').textContent = label;
    $('prev').disabled = !s.numPages || s.page <= 1;
    $('next').disabled = !s.numPages || s.page >= s.numPages;
    var who = s.name ? s.name.replace(/^.*[\\/]/, '') : '';
    var bits = [];
    if (who) bits.push(who);
    if (s.numPages) bits.push('page ' + s.page + ' of ' + s.numPages);
    status(bits.join(' · '));
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

  viewer.onPassword = function (update, reason) {
    pwUpdate = update;
    $('pw-msg').textContent = reason === 2
      ? 'That password was wrong. Try again.'
      : 'This PDF is locked. Enter the password.';
    $('pw-sheet').hidden = false;
    $('pw').value = '';
    $('pw').focus();
  };

  function openBytes(name, buf, fromRemote) {
    spinner(true);
    status('Opening ' + (name || 'PDF') + '…');
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
      var msg = (e && e.message) || String(e);
      if (!$('pw-sheet').hidden) return;
      status(msg);
    });
  }

  function decodeSample() {
    var b64 = root.SAMPLE_PDF_B64;
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
      viewer.page = 1;
      viewer.fit = 'width';
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
      viewer.page = 1;
      viewer.fit = 'width';
      return openBytes(f.name, buf, false);
    }).catch(function (err) {
      spinner(false);
      status((err && err.message) || String(err));
    });
  });

  $('prev').onclick = function () { viewer.prev(); };
  $('next').onclick = function () { viewer.next(); };
  $('page').addEventListener('change', function () { viewer.go(+$('page').value || 1); });
  $('zoom-in').onclick = function () { viewer.zoomBy(1.2); };
  $('zoom-out').onclick = function () { viewer.zoomBy(1 / 1.2); };
  $('zoom-label').onclick = function () { viewer.cycleFit(); };

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
    $('text-layer').style.pointerEvents = pointMode ? 'none' : '';
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

  $('pw-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!pwUpdate) return;
    var fn = pwUpdate;
    pwUpdate = null;
    $('pw-sheet').hidden = true;
    fn($('pw').value);
  });
  $('pw-cancel').onclick = function () {
    pwUpdate = null;
    $('pw-sheet').hidden = true;
    status('The file is locked.');
  };

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
    if (e.key === 'Escape') { setFind(false); return; }
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault(); viewer.next();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault(); viewer.prev();
    } else if (e.key === 'Home') {
      e.preventDefault(); viewer.go(1);
    } else if (e.key === 'End') {
      e.preventDefault(); viewer.go(viewer.numPages);
    } else if (e.key === '+' || e.key === '=') {
      viewer.zoomBy(1.2);
    } else if (e.key === '-' || e.key === '_') {
      viewer.zoomBy(1 / 1.2);
    } else if (e.key === '0') {
      viewer.setFit('width');
    }
  });

  var wrap = $('page-wrap');
  wrap.addEventListener('pointerdown', function (e) {
    if (!pointMode) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var n = viewer.eventToNorm(e);
    if (!n) return;
    pointing = true;
    viewer.setPointer(n.x, n.y, true);
    net.point(viewer, n, true);
    e.preventDefault();
  });
  wrap.addEventListener('pointermove', function (e) {
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
  wrap.addEventListener('pointerup', endPoint);
  wrap.addEventListener('pointercancel', endPoint);
  wrap.addEventListener('pointerleave', endPoint);

  stage.addEventListener('wheel', function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    viewer.zoomBy(e.deltaY > 0 ? 1 / 1.1 : 1.1);
  }, { passive: false });

  if (root.PdfTouch) {
    root.PdfTouch.bind(stage, viewer, {
      onSwipe: function (dir) { if (dir > 0) viewer.next(); else viewer.prev(); },
      onPinch: function () {
        clearTimeout(pinchDraw);
        pinchDraw = setTimeout(function () { viewer.draw(); }, 40);
      },
      onZoom: function () { viewer.draw(); }
    });
  }

  var remotePtrHide = 0;
  net.start({
    onDoc: function (rec) {
      var buf = net.bufOf(rec.bytes);
      if (!buf) return;
      net.setApplying(true);
      viewer.page = 1;
      openBytes(rec.name || 'shared.pdf', buf, true).then(function () {
        net.setApplying(false);
      });
    },
    onCursor: function (rec) {
      if (rec.page && rec.page !== viewer.page) {
        net.setApplying(true);
        viewer.go(rec.page).then(function () { net.setApplying(false); });
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
        viewer.page = rec.page || 1;
        viewer.fit = rec.fit || 'width';
        viewer.rot = rec.rot || 0;
        return openBytes(rec.name || 'saved.pdf', buf, false);
      }
    }
    var sample = decodeSample();
    if (sample) {
      viewer.page = 1;
      viewer.fit = 'width';
      return openBytes('paper-planes.pdf', sample, false);
    }
  }).catch(function (e) {
    status((e && e.message) || String(e));
  });

  root.addEventListener('resize', function () {
    if (viewer.pdf && (viewer.fit === 'width' || viewer.fit === 'page')) viewer.draw();
  });

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (!$('pw-sheet').hidden) { $('pw-cancel').click(); return true; }
      if (findOpen) { setFind(false); return true; }
      if (pointMode) { $('point-toggle').click(); return true; }
      return false;
    });
  }
})(typeof window !== 'undefined' ? window : this);
