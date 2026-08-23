// Pass the pad — a sheet, not a shared scribble.
//
// Each player writes their signature on THEIR own row. Nobody writes anybody
// else's row. There is no host-owned board: the sheet is just those rows.
// Invite is OS chrome. This file never draws an Invite button.
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;
  var PUB_MS = 140;
  var MAX_GROUPS = 40;
  var MAX_POINTS = 800;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var hbTimer = 0;
  var pubTimer = 0;
  var lastList = [];
  var seenAt = {};
  var lastPacked = '';

  var $ = function (id) { return document.getElementById(id); };
  var now = function () { return Date.now(); };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  };

  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id) return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      var rec = seenAt[p.id];
      if (t - rec.seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }

  function legalColor(c) {
    if (typeof c !== 'string' || c.length > 40) return false;
    if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return true;
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/.test(c)) return true;
    if (c === 'black' || c === 'blue' || c === 'navy') return true;
    return false;
  }

  function legalPoint(pt) {
    return pt && isFinite(pt.x) && isFinite(pt.y) &&
      pt.x >= -8 && pt.x <= 2400 && pt.y >= -8 && pt.y <= 2400;
  }

  function legalStrokes(data) {
    if (!Array.isArray(data) || data.length > MAX_GROUPS) return null;
    var out = [];
    for (var i = 0; i < data.length; i++) {
      var g = data[i];
      if (!g || !Array.isArray(g.points) || g.points.length > MAX_POINTS) return null;
      var points = [];
      for (var j = 0; j < g.points.length; j++) {
        if (!legalPoint(g.points[j])) return null;
        var p = g.points[j];
        points.push({
          x: Math.round(p.x * 100) / 100,
          y: Math.round(p.y * 100) / 100,
          pressure: isFinite(p.pressure) ? p.pressure : 0.5,
          time: isFinite(p.time) ? p.time : 0
        });
      }
      var col = legalColor(g.penColor) ? g.penColor : 'rgb(20, 22, 28)';
      out.push({
        points: points,
        penColor: col,
        minWidth: isFinite(g.minWidth) ? g.minWidth : 0.6,
        maxWidth: isFinite(g.maxWidth) ? g.maxWidth : 2.8,
        dotSize: g.dotSize,
        velocityFilterWeight: isFinite(g.velocityFilterWeight) ? g.velocityFilterWeight : 0.7
      });
    }
    return out;
  }

  function snapshot() {
    var packed = root.Pad && root.Pad.pack ? root.Pad.pack() : { strokes: [], empty: true, w: 0, h: 0, ink: 'black' };
    var strokes = legalStrokes(packed.strokes || []) || [];
    return {
      id: me.id,
      name: me.name,
      strokes: strokes,
      empty: !!packed.empty || !strokes.length,
      ink: packed.ink || 'black',
      w: packed.w | 0,
      h: packed.h | 0,
      at: now()
    };
  }

  function publish() {
    if (!on || !room || !me.id) return;
    var row = snapshot();
    var key = JSON.stringify({ e: row.empty, n: row.strokes.length, ink: row.ink, w: row.w, h: row.h, last: row.strokes.length ? row.strokes[row.strokes.length - 1] : 0 });
    lastPacked = key;
    room.put(row).catch(function () {});
  }
  function schedulePublish() {
    if (pubTimer) return;
    pubTimer = setTimeout(function () {
      pubTimer = 0;
      publish();
    }, PUB_MS);
  }

  function scaleStrokes(strokes, fromW, fromH, toW, toH) {
    var sx = (fromW > 0 && toW > 0) ? (toW / fromW) : 1;
    var sy = (fromH > 0 && toH > 0) ? (toH / fromH) : 1;
    if (sx === 1 && sy === 1) return strokes;
    return (strokes || []).map(function (g) {
      return {
        points: (g.points || []).map(function (pt) {
          return { x: pt.x * sx, y: pt.y * sy, pressure: pt.pressure, time: pt.time };
        }),
        penColor: g.penColor,
        minWidth: g.minWidth,
        maxWidth: g.maxWidth,
        dotSize: g.dotSize,
        velocityFilterWeight: g.velocityFilterWeight
      };
    });
  }

  function paintCanvas(canvas, row) {
    if (!canvas || !root.SignaturePad) return;
    var ratio = Math.max(root.devicePixelRatio || 1, 1);
    var w = canvas.offsetWidth;
    var h = canvas.offsetHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    canvas.getContext('2d').scale(ratio, ratio);
    var paper = (root.Pad && root.Pad.paper) || 'rgb(247, 243, 234)';
    var temp = new root.SignaturePad(canvas, { backgroundColor: paper, penColor: 'rgb(20, 22, 28)' });
    temp.off();
    var strokes = legalStrokes(row && row.strokes) || [];
    if (strokes.length) {
      temp.fromData(scaleStrokes(strokes, row.w, row.h, w, h));
    } else {
      temp.clear();
    }
  }

  function render() {
    if (!on) return;
    var people = live(lastList);
    var status = $('friend-status');
    var list = $('sheet-list');
    var label = $('your-label');
    label.textContent = 'You';
    var html = '';
    people.sort(function (a, b) {
      var an = a.name || '', bn = b.name || '';
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
    people.forEach(function (p) {
      if (p.id === me.id) return;
      html += '<div class="sig-row" data-id="' + esc(p.id) + '">' +
        '<div class="row-name">' + esc(p.name || 'Guest') +
        '<span class="meta' + (p.empty ? ' wait' : '') + '">' + (p.empty ? 'waiting' : 'signed') + '</span></div>' +
        '<div class="paper mini"><canvas></canvas></div></div>';
    });
    list.innerHTML = html;
    requestAnimationFrame(function () {
      list.querySelectorAll('.sig-row').forEach(function (rowEl) {
        var id = rowEl.getAttribute('data-id');
        var p = null;
        people.forEach(function (x) { if (x.id === id) p = x; });
        var c = rowEl.querySelector('canvas');
        if (p && c) paintCanvas(c, p);
      });
    });
    var others = people.filter(function (p) { return p.id !== me.id; });
    var signed = people.filter(function (p) { return !p.empty; }).length;
    if (!others.length) {
      status.textContent = 'Waiting for a friend… press Invite (GifOS menu) to send the link. You can sign your line in the meantime.';
    } else {
      status.textContent = others.length + ' with you. ' + signed + ' signed. Each line is theirs.';
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    render();
  }

  function beat() {
    if (!on) return;
    publish();
    render();
  }

  function onChanged() {
    if (!on) return;
    schedulePublish();
  }

  function saveSheet() {
    var mine = snapshot();
    var people = live(lastList).filter(function (p) { return p.id !== me.id; });
    people.unshift(mine);
    if (!people.some(function (p) { return !p.empty; })) {
      if (root.Pad && root.Pad.say) root.Pad.say('Sign first.', 'warn');
      return;
    }
    var W = 900, rowH = 160, head = 72, padX = 28;
    var H = head + people.length * rowH + 28;
    var c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#f7f3ea';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1e2a4a';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('Signature sheet', padX, 44);
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = '#6a6470';
    ctx.fillText('Each person signed their own line.', padX, 64);
    people.forEach(function (p, i) {
      var y = head + i * rowH;
      ctx.fillStyle = '#3a3a42';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText((p.id === me.id ? 'You' : (p.name || 'Guest')), padX, y + 18);
      ctx.strokeStyle = '#d9d0c0';
      ctx.beginPath();
      ctx.moveTo(padX, y + rowH - 18);
      ctx.lineTo(W - padX, y + rowH - 18);
      ctx.stroke();
      var slotW = W - padX * 2, slotH = rowH - 40;
      var tmp = document.createElement('canvas');
      tmp.style.cssText = 'position:absolute;left:-9999px;width:' + slotW + 'px;height:' + slotH + 'px';
      document.body.appendChild(tmp);
      paintCanvas(tmp, p);
      ctx.drawImage(tmp, padX, y + 24, slotW, slotH);
      tmp.remove();
    });
    if (root.Pad && root.Pad.say) root.Pad.say('');
    if (root.Pad && root.Pad.downloadPng) root.Pad.downloadPng(c.toDataURL('image/png'), 'signature-sheet.png');
  }

  function enter() {
    api = root.gifos;
    if (!api || !api.db) {
      $('friend-bar').hidden = false;
      $('friend-status').textContent = 'Passing the pad needs a GifOS room.';
      return;
    }
    room = api.db('room');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      on = true;
      seenAt = {};
      lastPacked = '';
      if (root.Pad.flushSave) root.Pad.flushSave();
      root.Pad.mp = true;
      document.body.classList.add('together');
      $('friend-bar').hidden = false;
      $('sheet').hidden = false;
      $('your-label').textContent = 'You';
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      } else {
        onRoom(lastList);
      }
      publish();
      beat();
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(beat, HB_MS);
      if (root.Pad.resize) root.Pad.resize();
    }).catch(function () {});
  }

  function leave() {
    on = false;
    root.Pad.mp = false;
    document.body.classList.remove('together');
    $('friend-bar').hidden = true;
    $('sheet').hidden = true;
    $('sheet-list').innerHTML = '';
    $('your-label').textContent = 'Sign above';
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (pubTimer) { clearTimeout(pubTimer); pubTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
    if (root.Pad.restoreSave) root.Pad.restoreSave();
    if (root.Pad.resize) root.Pad.resize();
  }

  root.Pad = root.Pad || {};
  root.Pad.Mp = {
    enter: enter,
    leave: leave,
    onChanged: onChanged,
    saveSheet: saveSheet,
    isOn: function () { return on; }
  };

  $('shareBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });
})(window);
