// Share a pattern over Invite.
//
// Each player writes the beat on THEIR own row. The host (lowest present id)
// copies legal kits onto the `kit` row. Nobody writes anybody else's row.
// Patterns in gifos.db('patterns') stay private — this file never touches them
// except to freeze a copy on enter and restore it on leave.
// Invite is OS chrome. This file never draws an Invite button.
(function (root) {
  'use strict';

  var IO = root.IO808;
  var STALE_MS = 9000;
  var HB_MS = 3000;
  var PUB_MS = 180;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var hbTimer = 0;
  var pubTimer = 0;
  var lastList = [];
  var seenAt = {};
  var myN = 0;
  var pending = [];
  var lastKit = null;
  var lastPacked = '';

  var $ = function (id) { return document.getElementById(id); };
  var now = function () { return Date.now(); };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  };

  function legalNum(n, lo, hi) {
    return typeof n === 'number' && n === n && n >= lo && n <= hi;
  }
  function legalInst(inst) {
    if (!inst || typeof inst !== 'object') return false;
    var id;
    for (id = 0; id < 12; id++) {
      var s = inst[id] || inst[String(id)];
      if (!s || typeof s !== 'object') return false;
      if (!legalNum(s.level, 0, 100)) return false;
    }
    return true;
  }
  function legalPacked(p) {
    return p && typeof p.bits === 'string' && p.bits.length === 192 && /^[0-9a-f]+$/.test(p.bits) &&
      legalNum(p.pattern, 0, 15) && legalNum(p.first, 0, 16) && legalNum(p.second, 0, 16);
  }
  function legalKit(row) {
    return row && legalPacked(row.packed) && legalInst(row.instrumentState) &&
      legalNum(row.tempo, 30, 300) && legalNum(row.masterVolume, 0, 100);
  }

  function packStr(row) {
    try {
      return (row.packed && row.packed.bits || '') + '|' + row.tempo + '|' + row.fineTempo + '|' +
        row.masterVolume + '|' + row.selectedPattern + '|' + row.basicVariationPosition + '|' +
        row.currentPart + '|' + row.currentVariation + '|' + row.selectedInstrumentTrack;
    } catch (e) { return ''; }
  }

  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id || p.id === 'kit') return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      if (t - seenAt[p.id].seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }
  function isHost(people) {
    people = people || live(lastList);
    if (!people.length) return true;
    var m = people[0].id, i;
    for (i = 0; i < people.length; i++) if (people[i].id < m) m = people[i].id;
    return me.id === m;
  }
  function kitOf(list) {
    var i;
    for (i = 0; i < (list || []).length; i++) if (list[i] && list[i].id === 'kit') return list[i];
    return null;
  }

  function localKit() {
    var s = IO.Machine.shareKit();
    s.id = 'kit';
    s.host = me.id;
    s.seq = (lastKit && lastKit.seq) || 0;
    s.applied = (lastKit && lastKit.applied) || {};
    s.at = now();
    return s;
  }

  function snapshot(extra) {
    var row = {
      id: me.id,
      name: me.name,
      n: myN,
      pending: pending.slice(),
      at: now()
    };
    if (extra) {
      if (extra.pending) row.pending = extra.pending;
      if (extra.kit) row.kit = extra.kit;
    }
    return row;
  }

  function publish() {
    if (!on || !room || !me.id) return;
    room.put(snapshot()).catch(function () {});
  }
  function schedulePublish() {
    if (pubTimer) return;
    pubTimer = setTimeout(function () {
      pubTimer = 0;
      publish();
    }, PUB_MS);
  }

  function putKit(c) {
    lastKit = c;
    room.put(c).catch(function () {});
  }

  function applyShared(row) {
    if (!legalKit(row) || !IO.Machine) return;
    var packed = packStr(row);
    if (packed === lastPacked) return;
    lastPacked = packed;
    IO.Machine.applyKit({
      instrumentState: row.instrumentState,
      masterVolume: row.masterVolume,
      tempo: row.tempo,
      fineTempo: row.fineTempo,
      selectedPattern: row.selectedPattern,
      selectedInstrumentTrack: row.selectedInstrumentTrack,
      basicVariationPosition: row.basicVariationPosition,
      currentPart: row.currentPart,
      currentVariation: row.currentVariation
    }, { silent: true });
    if (IO.Machine.unpackPattern) IO.Machine.unpackPattern(row.packed);
    IO.Machine.render();
  }

  function dropSpent(kit) {
    if (!kit || !kit.applied) return;
    var keep = kit.applied[me.id] || 0;
    pending = pending.filter(function (op) { return op.n > keep; });
  }

  function reconcile(kit, people) {
    var next = {
      id: 'kit',
      host: me.id,
      seq: (kit.seq || 0),
      applied: {},
      instrumentState: kit.instrumentState,
      packed: kit.packed,
      masterVolume: kit.masterVolume,
      tempo: kit.tempo,
      fineTempo: kit.fineTempo,
      selectedPattern: kit.selectedPattern,
      selectedInstrumentTrack: kit.selectedInstrumentTrack,
      basicVariationPosition: kit.basicVariationPosition,
      currentPart: kit.currentPart,
      currentVariation: kit.currentVariation,
      at: now()
    };
    Object.keys(kit.applied || {}).forEach(function (k) { next.applied[k] = kit.applied[k]; });
    var dirty = false;
    people.forEach(function (p) {
      var last = next.applied[p.id] || 0;
      var ops = (p.pending || []).slice().sort(function (a, b) { return (a.n || 0) - (b.n || 0); });
      ops.forEach(function (op) {
        if (!op || (op.n || 0) <= last) return;
        last = op.n;
        if (op.t === 'kit' && legalKit(op.kit)) {
          next.instrumentState = op.kit.instrumentState;
          next.packed = op.kit.packed;
          next.masterVolume = op.kit.masterVolume;
          next.tempo = op.kit.tempo;
          next.fineTempo = op.kit.fineTempo;
          next.selectedPattern = op.kit.selectedPattern;
          next.selectedInstrumentTrack = op.kit.selectedInstrumentTrack;
          next.basicVariationPosition = op.kit.basicVariationPosition;
          next.currentPart = op.kit.currentPart;
          next.currentVariation = op.kit.currentVariation;
          dirty = true;
        }
      });
      next.applied[p.id] = last;
    });
    if (dirty) next.seq = (kit.seq || 0) + 1;
    var same = packStr(next) === packStr(kit) && JSON.stringify(next.applied) === JSON.stringify(kit.applied);
    return same ? null : next;
  }

  function pushOp(op) {
    myN += 1;
    op.n = myN;
    pending.push(op);
    if (pending.length > 64) pending = pending.slice(-48);
    schedulePublish();
  }

  function render() {
    if (!on) return;
    var people = live(lastList);
    var status = $('friend-status');
    var roster = $('friend-roster');
    var html = '';
    people.sort(function (a, b) {
      var an = a.name || '', bn = b.name || '';
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
    people.forEach(function (p) {
      var mine = p.id === me.id;
      html += '<li class="' + (mine ? 'me' : '') + '"><span class="name">' +
        (mine ? 'You' : esc(p.name || 'Player')) + '</span></li>';
    });
    roster.innerHTML = html || '<li>Just you so far</li>';
    var others = people.filter(function (p) { return p.id !== me.id; });
    if (!others.length) {
      status.textContent = 'Waiting for a friend… press Invite (GifOS menu) to send the link. They get this pattern.';
    } else {
      status.textContent = 'Same pattern. ' + others.length + ' with you.';
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var people = live(lastList);
    var kit = kitOf(lastList);
    if (!kit) {
      if (isHost(people)) putKit(localKit());
      render();
      return;
    }
    lastKit = kit;
    if (isHost(people)) {
      var next = reconcile(kit, people);
      if (next) {
        putKit(next);
        kit = next;
      }
    }
    dropSpent(kit);
    applyShared(kit);
    render();
  }

  function beat() {
    if (!on) return;
    publish();
    render();
  }

  function enter() {
    api = root.gifos;
    if (!api || !api.db) {
      $('friend-bar').hidden = false;
      $('friend-status').textContent = 'Sharing a pattern needs a GifOS room.';
      return;
    }
    room = api.db('room');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      on = true;
      pending = [];
      myN = 0;
      seenAt = {};
      lastPacked = '';
      lastKit = null;
      if (IO.Machine.flushSave) IO.Machine.flushSave();
      IO.Machine.setSharing(true);
      document.body.classList.add('together');
      $('friend-bar').hidden = false;
      $('shareBtn').hidden = true;
      $('friend-hint').textContent = 'Press Invite (GifOS menu) to send the link. They get this pattern.';
      pushOp({ t: 'kit', kit: IO.Machine.shareKit() });
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
    }).catch(function () {});
  }

  function leave() {
    on = false;
    pending = [];
    IO.Machine.setSharing(false);
    document.body.classList.remove('together');
    $('friend-bar').hidden = true;
    $('shareBtn').hidden = false;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (pubTimer) { clearTimeout(pubTimer); pubTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
    if (IO.Machine.restoreSave) IO.Machine.restoreSave();
  }

  function onKit() {
    if (!on) return;
    pushOp({ t: 'kit', kit: IO.Machine.shareKit() });
  }

  IO.Mp = {
    enter: enter,
    leave: leave,
    isOn: function () { return on; },
    isHost: isHost,
    onStep: function () { onKit(); },
    onKnob: function () { onKit(); },
    onTempo: function () { onKit(); },
    onKit: onKit
  };

  $('shareBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });
})(window);
