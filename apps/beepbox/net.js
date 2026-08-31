/*
 * Invite jams the same song.
 *
 * Each player writes the song JSON on THEIR own row. The host (lowest
 * present id) copies a legal song onto the `song` row. Nobody writes
 * anybody else's row. Solo work stays in gifos.db('songs') — this file
 * never touches that collection except to freeze a copy on enter.
 * Invite is OS chrome. This file never draws an Invite button.
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 2500;
  var PUB_MS = 280;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var lastList = [];
  var seenAt = {};
  var lastSong = null;
  var lastPacked = '';
  var myN = 0;
  var hbTimer = 0;
  var pubTimer = 0;
  var jamEl = null;
  var getJson = null;
  var applyJson = null;
  var frozen = null;

  function now() { return Date.now(); }

  function legalSong(j) {
    return j && typeof j === 'object' && j.format === 'BeepBox' &&
      Array.isArray(j.channels) && j.channels.length >= 1 &&
      typeof j.beatsPerMinute === 'number' &&
      j.beatsPerMinute >= 30 && j.beatsPerMinute <= 300;
  }

  function pack(j) {
    try { return JSON.stringify(j); } catch (e) { return ''; }
  }

  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id || p.id === 'song') return;
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

  function songOf(list) {
    var i;
    for (i = 0; i < (list || []).length; i++) if (list[i] && list[i].id === 'song') return list[i];
    return null;
  }

  function paintJam(people) {
    if (!jamEl) return;
    if (!on || people.length < 2) {
      jamEl.hidden = true;
      jamEl.textContent = '';
      return;
    }
    jamEl.hidden = false;
    jamEl.textContent = people.length + ' jamming this song';
  }

  function snapshot() {
    var j = getJson ? getJson() : null;
    return {
      id: me.id,
      name: me.name,
      n: myN,
      at: now(),
      json: legalSong(j) ? j : null
    };
  }

  function publish() {
    if (!on || !room || !me.id) return;
    room.put(snapshot()).catch(function () {});
  }

  function publishSong(json, seq) {
    if (!on || !room || !me.id) return;
    if (!legalSong(json)) return;
    var row = {
      id: 'song',
      host: me.id,
      seq: seq || ((lastSong && lastSong.seq) || 0) + 1,
      at: now(),
      json: json
    };
    lastSong = row;
    lastPacked = pack(json);
    room.put(row).catch(function () {});
  }

  function ingest(list) {
    lastList = list || [];
    var people = live(lastList);
    var others = 0, i;
    for (i = 0; i < people.length; i++) if (people[i].id !== me.id) others++;
    var became = others > 0;
    if (became && !on) {
      on = true;
      if (getJson) frozen = getJson();
    }
    if (!became && on && others === 0 && people.length <= 1) {
      /* stay on while we are the only one still in the room — host keeps the song */
    }
    paintJam(people);
    if (!on) return;

    var canonical = songOf(lastList);
    if (canonical && legalSong(canonical.json)) {
      var packed = pack(canonical.json);
      if (packed && packed !== lastPacked) {
        lastPacked = packed;
        lastSong = canonical;
        if (applyJson) applyJson(canonical.json);
      }
    }

    if (isHost(people)) {
      var newest = null;
      for (i = 0; i < people.length; i++) {
        var p = people[i];
        if (!legalSong(p.json)) continue;
        if (!newest || (p.n | 0) > (newest.n | 0) || ((p.n | 0) === (newest.n | 0) && p.at > newest.at)) {
          newest = p;
        }
      }
      if (newest) {
        var np = pack(newest.json);
        if (np && np !== lastPacked) publishSong(newest.json, (lastSong && lastSong.seq) || 0);
      } else if (getJson && !canonical) {
        publishSong(getJson(), 1);
      }
    }
  }

  function noteLocalChange() {
    if (!on || !me.id) return;
    myN += 1;
    publish();
    if (isHost()) {
      var j = getJson && getJson();
      if (legalSong(j)) publishSong(j);
    }
  }

  function init(opts) {
    getJson = opts && opts.getJson;
    applyJson = opts && opts.applyJson;
    jamEl = document.getElementById('jam');
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ owner: true, others: 0 });

    var owner = true;
    var infoP = api.info ? api.info().then(function (i) {
      owner = !!(i && i.owner);
      return owner;
    }).catch(function () { owner = true; return true; }) : Promise.resolve(true);

    return infoP.then(function () { return api.me(); }).then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'You';
      room = api.db('room');
      var settled = false;
      return new Promise(function (resolve) {
        var done = function () {
          if (settled) return;
          settled = true;
          resolve({ owner: owner, others: live(lastList).length });
        };
        setTimeout(done, 2200);
        room.subscribe(function (list) {
          ingest(list || []);
          done();
        });
      });
    }).then(function (roomInfo) {
      on = true;
      publish();
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(function () { publish(); }, HB_MS);
      if (pubTimer) clearInterval(pubTimer);
      pubTimer = setInterval(function () {
        if (!on) return;
        var j = getJson && getJson();
        var p = pack(j);
        if (p && p !== lastPacked && isHost()) publishSong(j);
      }, PUB_MS);
      return roomInfo;
    }).catch(function () { return { owner: true, others: 0 }; });
  }

  root.BeepNet = {
    init: init,
    noteLocalChange: noteLocalChange,
    live: function () { return on && live(lastList).length > 1; }
  };
})(window);
