/*
 * A small Bitsy editor: one room at a time, an 8×8 paint, a few words,
 * and the world as writing. Tunes and extra rooms in the writing are kept.
 */
(function (root) {
  'use strict';

  var SIZE = 16;
  var TILE = 8;
  var src = '';
  var world = null;
  var roomId = '0';
  var kind = 'TIL';
  var drawId = 'a';
  var frame = 0;
  var brush = 1;
  var onChange = null;
  var paintingRoom = false;
  var paintingPix = false;

  var $ = function (id) { return document.getElementById(id); };

  function emptyFrame() {
    var f = [], y, x, row;
    for (y = 0; y < TILE; y++) {
      row = [];
      for (x = 0; x < TILE; x++) row.push(0);
      f.push(row);
    }
    return f;
  }

  function extrasFrom(text) {
    var lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    var i = 1, out = [], block, line;
    while (i < lines.length) {
      line = lines[i];
      if (!line || line.charAt(0) === '#' || line.charAt(0) === '!') { i++; continue; }
      var type = line.split(/[ \t]/)[0];
      if (type === 'TUNE' || type === 'BLIP' || type === 'VAR' || type === 'FONT') {
        block = [line];
        i++;
        while (i < lines.length && lines[i].length > 0) { block.push(lines[i]); i++; }
        out.push(block.join('\n'));
      } else {
        i++;
        while (i < lines.length && lines[i].length > 0) i++;
      }
    }
    return out;
  }

  function titleOf(w) {
    if (w && w.dialog && w.dialog.title && w.dialog.title.src) return w.dialog.title.src;
    return 'untitled';
  }

  function palOf(w, id) {
    var p = w && w.palette && w.palette[id];
    if (p && p.colors && p.colors.length >= 3) return p.colors;
    return [[0, 82, 204], [128, 159, 255], [255, 255, 255]];
  }

  function drawingOf(w, type, id) {
    var drw = (type === 'AVA' ? 'SPR' : type) + '_' + id;
    if (w && w.drawings && w.drawings[drw] && w.drawings[drw].length) return w.drawings[drw];
    return [emptyFrame()];
  }

  function writeDrawing(frames) {
    var s = '', f, y, x, row;
    for (f = 0; f < frames.length; f++) {
      if (f) s += '>\n';
      for (y = 0; y < TILE; y++) {
        row = frames[f][y] || [];
        for (x = 0; x < TILE; x++) s += row[x] ? '1' : '0';
        s += '\n';
      }
    }
    return s;
  }

  function writeWorld(w, extra) {
    var s = titleOf(w) + '\n\n';
    s += '# BITSY VERSION 8.15\n\n';
    s += '! VER_MAJ 8\n! VER_MIN 15\n! ROOM_FORMAT 1\n! DLG_COMPAT 0\n! TXT_MODE 0\n\n';
    var id, i, y, x, pal, room, t, spr, it, dlg, frames, col;
    for (id in w.palette) {
      if (id === 'default') continue;
      pal = w.palette[id];
      s += 'PAL ' + id + '\n';
      for (i = 0; i < pal.colors.length; i++) {
        col = pal.colors[i];
        s += col[0] + ',' + col[1] + ',' + col[2] + '\n';
      }
      if (pal.name) s += 'NAME ' + pal.name + '\n';
      s += '\n';
    }
    for (id in w.room) {
      room = w.room[id];
      s += 'ROOM ' + id + '\n';
      for (y = 0; y < SIZE; y++) {
        var row = [];
        for (x = 0; x < SIZE; x++) row.push((room.tilemap[y] && room.tilemap[y][x]) || '0');
        s += row.join(',') + '\n';
      }
      if (room.name) s += 'NAME ' + room.name + '\n';
      if (room.pal) s += 'PAL ' + room.pal + '\n';
      if (room.tune && room.tune !== '0') s += 'TUNE ' + room.tune + '\n';
      if (room.items) {
        for (i = 0; i < room.items.length; i++) {
          s += 'ITM ' + room.items[i].id + ' ' + room.items[i].x + ',' + room.items[i].y + '\n';
        }
      }
      if (room.exits) {
        for (i = 0; i < room.exits.length; i++) {
          var e = room.exits[i];
          s += 'EXT ' + e.x + ',' + e.y + ' ' + e.dest.room + ' ' + e.dest.x + ',' + e.dest.y + '\n';
        }
      }
      s += '\n';
    }
    for (id in w.tile) {
      t = w.tile[id];
      frames = drawingOf(w, 'TIL', id);
      s += 'TIL ' + id + '\n' + writeDrawing(frames);
      if (t.name) s += 'NAME ' + t.name + '\n';
      if (t.isWall === true) s += 'WAL true\n';
      if (t.isWall === false) s += 'WAL false\n';
      s += '\n';
    }
    for (id in w.sprite) {
      spr = w.sprite[id];
      frames = drawingOf(w, id === 'A' ? 'AVA' : 'SPR', id);
      s += 'SPR ' + id + '\n' + writeDrawing(frames);
      if (spr.name) s += 'NAME ' + spr.name + '\n';
      if (spr.dlg) s += 'DLG ' + spr.dlg + '\n';
      if (spr.blip) s += 'BLIP ' + spr.blip + '\n';
      if (spr.room != null && spr.x >= 0 && spr.y >= 0) {
        s += 'POS ' + spr.room + ' ' + spr.x + ',' + spr.y + '\n';
      }
      s += '\n';
    }
    for (id in w.item) {
      it = w.item[id];
      frames = drawingOf(w, 'ITM', id);
      s += 'ITM ' + id + '\n' + writeDrawing(frames);
      if (it.name) s += 'NAME ' + it.name + '\n';
      if (it.dlg) s += 'DLG ' + it.dlg + '\n';
      if (it.blip) s += 'BLIP ' + it.blip + '\n';
      s += '\n';
    }
    for (id in w.dialog) {
      if (id === 'title') continue;
      dlg = w.dialog[id];
      s += 'DLG ' + id + '\n' + (dlg.src || '') + '\n';
      if (dlg.name) s += 'NAME ' + dlg.name + '\n';
      s += '\n';
    }
    for (i = 0; i < (extra || []).length; i++) s += extra[i] + '\n\n';
    return s;
  }

  function parse(text) {
    if (typeof parseWorld !== 'function') throw new Error('engine not loaded');
    return parseWorld(String(text || '').replace(/\r\n/g, '\n'));
  }

  function commit() {
    src = writeWorld(world, extrasFrom(src));
    var box = $('worldData');
    if (box && box.value !== src) box.value = src;
    if (onChange) onChange(src);
  }

  function palId() {
    var room = world.room[roomId];
    return (room && room.pal) || '0';
  }

  function rgb(c) {
    return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
  }

  function drawPix(ctx, frames, ox, oy, scale, pal, col, bgc) {
    var fr = frames[frame % frames.length] || frames[0] || emptyFrame();
    var y, x, v;
    for (y = 0; y < TILE; y++) for (x = 0; x < TILE; x++) {
      v = fr[y] && fr[y][x];
      ctx.fillStyle = rgb(v ? pal[col] || pal[2] : pal[bgc] || pal[0]);
      ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
    }
  }

  function paintRoom() {
    var c = $('roomCanvas');
    if (!c || !world) return;
    var cell = 16;
    c.width = SIZE * cell;
    c.height = SIZE * cell;
    var ctx = c.getContext('2d');
    var pal = palOf(world, palId());
    var room = world.room[roomId];
    var y, x, tid, t;
    ctx.fillStyle = rgb(pal[0]);
    ctx.fillRect(0, 0, c.width, c.height);
    if (!room) return;
    for (y = 0; y < SIZE; y++) for (x = 0; x < SIZE; x++) {
      tid = (room.tilemap[y] && room.tilemap[y][x]) || '0';
      if (tid && tid !== '0' && world.tile[tid]) {
        t = world.tile[tid];
        drawPix(ctx, drawingOf(world, 'TIL', tid), x * cell, y * cell, 2, pal, t.col || 1, t.bgc || 0);
      }
    }
    if (room.items) {
      for (var i = 0; i < room.items.length; i++) {
        var it = room.items[i];
        var item = world.item[it.id];
        if (!item) continue;
        drawPix(ctx, drawingOf(world, 'ITM', it.id), it.x * cell, it.y * cell, 2, pal, item.col || 2, item.bgc || 0);
      }
    }
    for (var sid in world.sprite) {
      var spr = world.sprite[sid];
      if (spr.room !== roomId) continue;
      drawPix(ctx, drawingOf(world, sid === 'A' ? 'AVA' : 'SPR', sid), spr.x * cell, spr.y * cell, 2, pal, spr.col || 2, spr.bgc || 0);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    for (y = 0; y <= SIZE; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(c.width, y * cell); ctx.stroke();
    }
    for (x = 0; x <= SIZE; x++) {
      ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, c.height); ctx.stroke();
    }
  }

  function paintDrawing() {
    var c = $('paintCanvas');
    if (!c || !world) return;
    var scale = 20;
    c.width = TILE * scale;
    c.height = TILE * scale;
    var ctx = c.getContext('2d');
    var pal = palOf(world, palId());
    var type = kind === 'SPR' && drawId === 'A' ? 'AVA' : kind;
    var frames = drawingOf(world, type, drawId);
    var obj = kind === 'TIL' ? world.tile[drawId] : kind === 'ITM' ? world.item[drawId] : world.sprite[drawId];
    var col = obj && obj.col != null ? obj.col : (kind === 'TIL' ? 1 : 2);
    var bgc = obj && obj.bgc != null ? obj.bgc : 0;
    drawPix(ctx, frames, 0, 0, scale, pal, col, bgc);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    var y, x;
    for (y = 0; y <= TILE; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * scale); ctx.lineTo(c.width, y * scale); ctx.stroke();
    }
    for (x = 0; x <= TILE; x++) {
      ctx.beginPath(); ctx.moveTo(x * scale, 0); ctx.lineTo(x * scale, c.height); ctx.stroke();
    }
  }

  function paintTools() {
    var box = $('drawTools');
    if (!box || !world) return;
    box.textContent = '';
    function chip(label, k, id) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.className = (kind === k && drawId === id) ? 'on' : '';
      b.addEventListener('click', function () {
        kind = k; drawId = id; frame = 0;
        paintTools(); paintDrawing(); fillWords();
      });
      box.appendChild(b);
    }
    chip('you', 'SPR', 'A');
    var id;
    for (id in world.tile) chip((world.tile[id].name || ('tile ' + id)), 'TIL', id);
    for (id in world.sprite) {
      if (id === 'A') continue;
      chip((world.sprite[id].name || ('friend ' + id)), 'SPR', id);
    }
    for (id in world.item) chip((world.item[id].name || ('thing ' + id)), 'ITM', id);
    var eraser = document.createElement('button');
    eraser.type = 'button';
    eraser.textContent = 'erase';
    eraser.className = kind === 'ERASE' ? 'on' : '';
    eraser.addEventListener('click', function () { kind = 'ERASE'; drawId = ''; paintTools(); });
    box.appendChild(eraser);
  }

  function fillRooms() {
    var sel = $('roomPick');
    if (!sel || !world) return;
    sel.textContent = '';
    for (var id in world.room) {
      var o = document.createElement('option');
      o.value = id;
      o.textContent = world.room[id].name || ('room ' + id);
      if (id === roomId) o.selected = true;
      sel.appendChild(o);
    }
  }

  function fillWords() {
    if (!world) return;
    var title = $('worldTitle');
    if (title) title.value = titleOf(world);
    var dlg = $('dlgText');
    var wall = $('wallChk');
    var obj = kind === 'TIL' ? world.tile[drawId] : kind === 'ITM' ? world.item[drawId] : world.sprite[drawId];
    if (wall) {
      wall.disabled = kind !== 'TIL' || !obj;
      wall.checked = !!(obj && obj.isWall);
    }
    if (!dlg) return;
    if (kind === 'SPR' || kind === 'ITM') {
      dlg.disabled = false;
      var did = obj && obj.dlg;
      dlg.value = (did && world.dialog[did]) ? world.dialog[did].src : '';
    } else {
      dlg.disabled = true;
      dlg.value = '';
    }
    var pal = palOf(world, palId());
    ['pal0', 'pal1', 'pal2'].forEach(function (id, i) {
      var el = $(id);
      if (!el || !pal[i]) return;
      function hex(n) { n = Math.max(0, Math.min(255, n | 0)); return (n < 16 ? '0' : '') + n.toString(16); }
      el.value = '#' + hex(pal[i][0]) + hex(pal[i][1]) + hex(pal[i][2]);
    });
  }

  function cellFrom(canvas, ev, n) {
    var r = canvas.getBoundingClientRect();
    var x = ((ev.clientX - r.left) / r.width) * n;
    var y = ((ev.clientY - r.top) / r.height) * n;
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= n || y >= n) return null;
    return { x: x, y: y };
  }

  function placeOnRoom(x, y) {
    var room = world.room[roomId];
    if (!room) return;
    var i, spr;
    if (kind === 'ERASE') {
      room.tilemap[y][x] = '0';
      room.items = (room.items || []).filter(function (it) { return !(it.x === x && it.y === y); });
      for (var sid in world.sprite) {
        spr = world.sprite[sid];
        if (spr.room === roomId && spr.x === x && spr.y === y) {
          spr.room = null; spr.x = -1; spr.y = -1;
        }
      }
    } else if (kind === 'TIL') {
      room.tilemap[y][x] = drawId;
    } else if (kind === 'ITM') {
      room.items = (room.items || []).filter(function (it) { return !(it.x === x && it.y === y); });
      room.items.push({ id: drawId, x: x, y: y });
    } else if (kind === 'SPR') {
      spr = world.sprite[drawId];
      if (!spr) return;
      spr.room = roomId; spr.x = x; spr.y = y;
    }
    commit();
    paintRoom();
  }

  function paintAt(x, y) {
    var type = kind === 'SPR' && drawId === 'A' ? 'AVA' : kind;
    if (type !== 'TIL' && type !== 'SPR' && type !== 'AVA' && type !== 'ITM') return;
    var frames = drawingOf(world, type, drawId);
    var fr = frames[frame % frames.length];
    if (!fr || !fr[y]) return;
    fr[y][x] = brush ? 1 : 0;
    var drw = (type === 'AVA' ? 'SPR' : type) + '_' + drawId;
    world.drawings[drw] = frames;
    commit();
    paintDrawing();
    paintRoom();
  }

  function nextId(used, alphabet) {
    var i, ch;
    for (i = 0; i < alphabet.length; i++) {
      ch = alphabet.charAt(i);
      if (!used[ch]) return ch;
    }
    return String(Object.keys(used).length);
  }

  function addTile() {
    var id = nextId(world.tile, 'abcdefghijklmnopqrstuvwxyz');
    world.tile[id] = createDrawingData('TIL', id);
    world.tile[id].name = 'tile ' + id;
    world.drawings['TIL_' + id] = [emptyFrame()];
    kind = 'TIL'; drawId = id;
    commit(); paintTools(); paintDrawing(); fillWords();
  }

  function addSprite() {
    var id = nextId(world.sprite, 'abcdefghijklmnopqrstuvwxyz');
    world.sprite[id] = createDrawingData('SPR', id);
    world.sprite[id].name = 'friend ' + id;
    world.drawings['SPR_' + id] = [emptyFrame()];
    var dlgId = String(Object.keys(world.dialog).length);
    world.dialog[dlgId] = { src: 'hello', name: world.sprite[id].name, id: dlgId };
    world.sprite[id].dlg = dlgId;
    kind = 'SPR'; drawId = id;
    commit(); paintTools(); paintDrawing(); fillWords();
  }

  function addItem() {
    var n = 0;
    while (world.item[String(n)]) n++;
    var id = String(n);
    world.item[id] = createDrawingData('ITM', id);
    world.item[id].name = 'thing ' + id;
    world.drawings['ITM_' + id] = [emptyFrame()];
    var dlgId = 'i' + id;
    world.dialog[dlgId] = { src: 'you found it', name: world.item[id].name, id: dlgId };
    world.item[id].dlg = dlgId;
    kind = 'ITM'; drawId = id;
    commit(); paintTools(); paintDrawing(); fillWords();
  }

  function hexToRgb(hex) {
    hex = String(hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    var n = parseInt(hex, 16);
    if (isNaN(n)) return [0, 0, 0];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function refresh() {
    fillRooms();
    paintTools();
    paintRoom();
    paintDrawing();
    fillWords();
    var box = $('worldData');
    if (box) box.value = src;
  }

  function load(text) {
    src = String(text || '').replace(/\r\n/g, '\n');
    world = parse(src);
    var ids = Object.keys(world.room || {});
    if (ids.indexOf(roomId) < 0) roomId = ids[0] || '0';
    if (!world.tile[drawId] && !world.sprite[drawId] && !world.item[drawId]) {
      kind = 'SPR'; drawId = 'A';
    }
    refresh();
  }

  function bind() {
    $('roomCanvas').addEventListener('pointerdown', function (e) {
      e.preventDefault();
      paintingRoom = true;
      try { $('roomCanvas').setPointerCapture(e.pointerId); } catch (err) {}
      var cell = cellFrom($('roomCanvas'), e, SIZE);
      if (cell) placeOnRoom(cell.x, cell.y);
    });
    $('roomCanvas').addEventListener('pointermove', function (e) {
      if (!paintingRoom) return;
      var cell = cellFrom($('roomCanvas'), e, SIZE);
      if (cell) placeOnRoom(cell.x, cell.y);
    });
    $('roomCanvas').addEventListener('pointerup', function () { paintingRoom = false; });
    $('roomCanvas').addEventListener('pointercancel', function () { paintingRoom = false; });

    $('paintCanvas').addEventListener('pointerdown', function (e) {
      e.preventDefault();
      paintingPix = true;
      try { $('paintCanvas').setPointerCapture(e.pointerId); } catch (err) {}
      var cell = cellFrom($('paintCanvas'), e, TILE);
      if (!cell) return;
      var type = kind === 'SPR' && drawId === 'A' ? 'AVA' : kind;
      var frames = drawingOf(world, type, drawId);
      var fr = frames[frame % frames.length];
      brush = fr && fr[cell.y] && fr[cell.y][cell.x] ? 0 : 1;
      paintAt(cell.x, cell.y);
    });
    $('paintCanvas').addEventListener('pointermove', function (e) {
      if (!paintingPix) return;
      var cell = cellFrom($('paintCanvas'), e, TILE);
      if (cell) paintAt(cell.x, cell.y);
    });
    $('paintCanvas').addEventListener('pointerup', function () { paintingPix = false; });
    $('paintCanvas').addEventListener('pointercancel', function () { paintingPix = false; });

    $('roomPick').addEventListener('change', function () {
      roomId = $('roomPick').value;
      paintRoom();
    });
    $('addTile').addEventListener('click', function (e) { e.preventDefault(); addTile(); });
    $('addSprite').addEventListener('click', function (e) { e.preventDefault(); addSprite(); });
    $('addItem').addEventListener('click', function (e) { e.preventDefault(); addItem(); });
    $('worldTitle').addEventListener('change', function () {
      if (!world.dialog.title) world.dialog.title = { src: '', name: null, id: 'title' };
      world.dialog.title.src = $('worldTitle').value;
      commit();
    });
    $('dlgText').addEventListener('change', function () {
      var obj = kind === 'ITM' ? world.item[drawId] : world.sprite[drawId];
      if (!obj) return;
      if (!obj.dlg) {
        obj.dlg = (kind === 'ITM' ? 'i' : 's') + drawId;
        world.dialog[obj.dlg] = { src: '', name: obj.name, id: obj.dlg };
      }
      world.dialog[obj.dlg].src = $('dlgText').value;
      commit();
    });
    $('wallChk').addEventListener('change', function () {
      if (kind !== 'TIL' || !world.tile[drawId]) return;
      world.tile[drawId].isWall = $('wallChk').checked;
      commit();
    });
    function onPal(i) {
      return function () {
        var pid = palId();
        if (!world.palette[pid]) return;
        world.palette[pid].colors[i] = hexToRgb($('pal' + i).value);
        commit();
        paintRoom();
        paintDrawing();
      };
    }
    $('pal0').addEventListener('input', onPal(0));
    $('pal1').addEventListener('input', onPal(1));
    $('pal2').addEventListener('input', onPal(2));
    $('applyData').addEventListener('click', function (e) {
      e.preventDefault();
      try { load($('worldData').value); commit(); }
      catch (err) { $('worldData').setAttribute('title', 'that world could not be read'); }
    });
  }

  root.BitsyEdit = {
    load: load,
    src: function () { return src; },
    bind: bind,
    refresh: refresh,
    onChange: function (fn) { onChange = fn; }
  };
})(window);
