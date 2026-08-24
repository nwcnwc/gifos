/*
 * Mermaid — textarea + live SVG preview. Vendors mermaid.min.js (MIT).
 * The document lives in the file. Classic IIFE. No CDN.
 */
(function (root) {
  'use strict';

  var api = root.gifos || null;
  var saveDb = null;
  var saveTimer = 0;
  var renderTimer = 0;
  var seq = 0;
  var lastGood = '';
  var tab = 'src';

  var SAMPLES = {
    flowchart: 'flowchart TD\n  A[Start] --> B{Edit me}\n  B -->|Yes| C[Nice]\n  B -->|No| D[Try a sequence]\n  C --> E[Saved in this file]\n  D --> E',
    sequence: 'sequenceDiagram\n  participant You\n  participant Friend\n  You->>Friend: Type on the left\n  Friend-->>You: The picture updates\n  Note over You,Friend: The last chart stays in this file',
    class: 'classDiagram\n  class App {\n    +text: string\n    +draw()\n    +save()\n  }\n  class File {\n    +bytes\n  }\n  App --> File : is the save',
    pie: 'pie title How this GIF is spent\n  "Typing" : 40\n  "Looking" : 40\n  "Fixing a line" : 20'
  };
  var SAMPLE = SAMPLES.flowchart;
  var $ = function (id) { return document.getElementById(id); };

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put({ id: 'doc', text: $('src').value }).catch(function () {});
    }, 300);
  }

  function showError(msg) {
    var err = $('err');
    var view = $('view');
    if (msg) {
      err.hidden = false;
      err.textContent = msg;
    } else {
      err.hidden = true;
      err.textContent = '';
    }
    view.classList.toggle('bad', !!msg);
  }

  function tidyError(e) {
    var msg = (e && (e.str || e.message)) ? String(e.str || e.message) : 'Could not draw that.';
    var line = msg.match(/Parse error on line \d+[^\n]*/i);
    if (line) return line[0];
    var first = msg.split(/\n/).filter(function (s) { return s.trim(); })[0] || msg;
    first = first.replace(/^Error:\s*/i, '').trim();
    if (first.length > 180) first = first.slice(0, 177) + '…';
    return first || 'Could not draw that.';
  }

  function emptyHint() {
    $('view').innerHTML = '<p class="empty">Type a flowchart, sequence, or class diagram on the left. The picture will show up here.</p>';
  }

  function draw() {
    var text = ($('src').value || '').trim();
    var mermaid = root.mermaid;
    if (!text) {
      showError('');
      emptyHint();
      lastGood = '';
      return;
    }
    if (!mermaid || typeof mermaid.render !== 'function') {
      showError('Mermaid did not load.');
      return;
    }
    seq += 1;
    var my = seq;
    var id = 'mmd' + my;
    var p = mermaid.render(id, text);
    function ok(out) {
      if (my !== seq) return;
      var svg = typeof out === 'string' ? out : (out && out.svg);
      if (svg) {
        lastGood = svg;
        $('view').innerHTML = svg;
        showError('');
      }
    }
    function scrubBomb() {
      var kids = document.body && document.body.children;
      if (!kids) return;
      for (var i = kids.length - 1; i >= 0; i--) {
        var n = kids[i];
        if (!n || n.id === 'shell') continue;
        var t = n.textContent || '';
        if (/Syntax error in text/i.test(t) || (n.classList && (n.classList.contains('error-icon') || n.classList.contains('error-text')))) {
          n.parentNode.removeChild(n);
        }
      }
    }
    function bad(e) {
      if (my !== seq) return;
      showError(tidyError(e));
      if (lastGood) $('view').innerHTML = lastGood;
      scrubBomb();
    }
    if (p && typeof p.then === 'function') {
      p.then(ok).catch(bad);
    } else if (typeof p === 'string') {
      ok(p);
    } else {
      bad(p);
    }
  }

  function schedule() {
    if (root.MMMp && root.MMMp.onText && root.MMMp.onText($('src').value)) {
      if (renderTimer) clearTimeout(renderTimer);
      renderTimer = setTimeout(draw, 200);
      return;
    }
    persist();
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(draw, 200);
  }

  function setTab(which) {
    tab = which === 'pic' ? 'pic' : 'src';
    document.body.classList.toggle('tab-pic', tab === 'pic');
    document.body.classList.toggle('tab-src', tab === 'src');
    var a = $('tabSrc'), b = $('tabPic');
    if (a) a.classList.toggle('on', tab === 'src');
    if (b) b.classList.toggle('on', tab === 'pic');
    if (a) a.setAttribute('aria-selected', tab === 'src' ? 'true' : 'false');
    if (b) b.setAttribute('aria-selected', tab === 'pic' ? 'true' : 'false');
  }

  function copySvg() {
    var svg = lastGood || '';
    if (!svg) return;
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = svg;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(svg).catch(fallback);
    } else fallback();
    var btn = $('copyBtn');
    if (btn) {
      var old = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = old; }, 1200);
    }
  }

  function boot() {
    var mermaid = root.mermaid;
    if (mermaid && mermaid.initialize) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'strict',
        fontFamily: 'system-ui, sans-serif',
        flowchart: { htmlLabels: false, useMaxWidth: true },
        sequence: { useMaxWidth: true },
        suppressErrorRendering: true
      });
    }
    $('src').value = SAMPLE;
    $('src').addEventListener('input', schedule);
    $('sampleBtn').addEventListener('click', function (e) {
      e.preventDefault();
      var kind = $('kind') ? $('kind').value : 'flowchart';
      $('src').value = SAMPLES[kind] || SAMPLE;
      schedule();
      setTab('pic');
    });
    if ($('kind')) {
      $('kind').addEventListener('change', function () {
        $('src').value = SAMPLES[$('kind').value] || SAMPLE;
        schedule();
      });
    }
    if ($('copyBtn')) $('copyBtn').addEventListener('click', function (e) { e.preventDefault(); copySvg(); });
    if ($('tabSrc')) $('tabSrc').addEventListener('click', function (e) { e.preventDefault(); setTab('src'); $('src').focus(); });
    if ($('tabPic')) $('tabPic').addEventListener('click', function (e) { e.preventDefault(); setTab('pic'); });
    setTab('src');
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (root.MMMp && root.MMMp.busy && root.MMMp.busy()) { root.MMMp.leave(); return true; }
        if (tab === 'pic') { setTab('src'); return true; }
        return false;
      });
    }
    draw();
    if (!api || !api.db) return;
    saveDb = api.db('save');
    saveDb.get('doc').then(function (row) {
      if (!row || (root.MMMp && root.MMMp.busy && root.MMMp.busy())) return;
      if (row.text) { $('src').value = row.text; draw(); }
    }).catch(function () {});
  }

  root.MMApp = {
    draw: draw,
    persist: persist,
    sample: SAMPLE,
    samples: SAMPLES,
    tidyError: tidyError,
    setTab: setTab,
    tab: function () { return tab; }
  };
  boot();
})(window);
