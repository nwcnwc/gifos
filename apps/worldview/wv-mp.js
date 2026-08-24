/*
 * wv-mp.js — two people, one map.
 *
 * Press Invite on the app bar and whoever opens the link is looking at the
 * SAME Earth: same place, same day, same layer stack, live, with their pointer
 * on it. NASA's Worldview can hand you a URL; this is the other thing — the
 * map moves under both of you while you are talking about it.
 *
 * The whole implementation is two shared collections, because the platform
 * does the hard parts (transport, signing, late joins). `session` carries the
 * view the room is looking at; `cursors` carries one small record per person.
 * Everything else — who may drive, what happens when the host goes away — is
 * the OS's rule, not ours.
 */
(function () {
  'use strict';

  var U = window.WVUtil;
  var D = window.WVData;
  var M = window.WVMap;

  var MP = {};
  var app = null, state = null;
  var sessionDb = null, cursorsDb = null;
  var me = { id: 'local', name: '' };
  var follow = true;
  var lastPush = 0, pushTimer = 0;
  var lastCursor = 0;
  var others = {};
  var chip = null, applying = false;

  var owner = true;               // false on a guest, from gifos.info()
  var COLOURS = ['#57d9a3', '#ffb454', '#ff8fa3', '#b39dff', '#4cc2ff', '#ffe066'];
  function colourFor(id) {
    var n = 0;
    for (var i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) & 0xffff;
    return COLOURS[n % COLOURS.length];
  }

  MP.init = function (a) {
    app = a;
    state = a.state;
    if (!window.gifos || !gifos.db) return;
    sessionDb = gifos.db('session');
    cursorsDb = gifos.db('cursors');
    /*
     * SOMEBODY HAS TO SPEAK FIRST. Both sides used to write only once they had
     * seen the other — the host waited for a cursor, the guest waited for the
     * room's view — and two people in the same room sat in silence looking at
     * different maps. A guest announces itself the moment it arrives, and keeps
     * a heartbeat so the host knows it is still there.
     */
    gifos.me().then(function (m) { me = m || me; }).catch(function () {});
    gifos.info().then(function (i) {
      owner = !(i && i.owner === false);
      if (!owner) {
        // A join is a race on this side too: the app is ready before the room's
        // lane necessarily is, and a presence record written into a room that
        // is not listening yet is simply lost — leaving the host with no idea
        // anyone is there and the guest on its own default Earth. So say hello
        // several times while the room settles, then keep a slow heartbeat.
        [0, 900, 2500, 5000, 9000].forEach(function (ms) { setTimeout(hello, ms); });
        setInterval(hello, 12000);
      }
    }).catch(function () {});

    sessionDb.subscribe(function (recs) {
      var rec = recs.filter(function (r) { return r.id === 'view'; })[0];
      if (!rec || rec.by === me.id) return;
      seen(rec.by, rec.byName);
      if (!follow) { paintChip(); return; }
      applying = true;
      if (rec.layers && rec.layers.length) {
        state.layers = rec.layers.map(function (r) { return { id: r.id, on: r.on, opacity: r.opacity }; })
          .filter(function (r) { return D.layer(r.id); });
      }
      if (rec.date) state.date = rec.date;
      if (rec.view) M.setView(rec.view);
      window.WVUI.renderAll();
      M.invalidate();
      applying = false;
    });

    cursorsDb.subscribe(function (recs) {
      var now = Date.now();
      var list = [];
      recs.forEach(function (r) {
        if (r.id === me.id) return;
        seen(r.id, r.name);
        if (now - (r.at || 0) > 25000) return;
        list.push({ lon: r.lon, lat: r.lat, name: r.name || 'Someone', colour: colourFor(r.id) });
      });
      M.furniture.cursors = list;
      M.invalidate();
      paintChip();
    });
  };

  // A guest's "I am here": its own cursor record, at the middle of its view.
  function hello() {
    if (!cursorsDb) return;
    var c = M.toWorld(M.size().w / 2, M.size().h / 2);
    cursorsDb.put({
      id: me.id, name: me.name || '', at: Date.now(),
      lon: U.wrapLon(c.lon), lat: c.lat,
    }).catch(function () {});
  }

  function seen(id, name) {
    if (!id || id === me.id) return;
    var was = others[id];
    others[id] = { name: name || 'Someone', at: Date.now() };
    if (!was) {
      window.WVUI.toast((name || 'Someone') + ' joined — you are looking at the same map');
      paintChip();
      /*
       * Somebody just walked in: hand them the view NOW, and again a few times
       * over the next few seconds. Waiting for the next pan leaves a guest on
       * their own default Earth until the host happens to move — the first
       * thing they see and the last thing they should. The repeats are there
       * because a join is a race: the guest's app may still have been mounting
       * when the first record went out, and one missed record is a room that
       * looks broken until someone touches the map.
       */
      if (owner) {
        MP.push(true);
        [2000, 6000, 12000].forEach(function (ms) {
          setTimeout(function () { if (activeOthers()) MP.push(true); }, ms);
        });
      }
    }
  }

  function activeOthers() {
    var now = Date.now(), n = 0;
    for (var k in others) if (now - others[k].at < 40000) n++;
    return n;
  }

  // The chip only exists when someone else is here. A "share" control that is
  // always on screen would be a lie: Invite is the OS's button, on the app bar.
  function paintChip() {
    var n = activeOthers();
    if (!chip) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip together';
      chip.addEventListener('click', function () {
        follow = !follow;
        paintChip();
        window.WVUI.toast(follow ? 'Following the room again' : 'Looking around on your own — the room will not move your map');
        if (follow) MP.push(true);
      });
      var right = document.querySelector('.top-right');
      if (right) right.insertBefore(chip, right.firstChild);
    }
    chip.hidden = n === 0;
    chip.innerHTML = '<span class="dot" style="background:' + (follow ? '#57d9a3' : '#ffb454') + '"></span>' +
      '<span class="lbl">' + (follow ? 'Together' : 'On your own') + (n > 1 ? ' · ' + n : '') + '</span>';
    chip.title = follow
      ? 'Everyone here sees the same view — tap to look around on your own'
      : 'You are moving on your own — tap to rejoin the room';
  }

  MP.moved = function () { MP.push(); };

  MP.push = function (force) {
    if (!sessionDb || applying) return;
    // A guest pushes as soon as it moves — it already knows the room is there,
    // it just arrived in it. A host waits until somebody else is present rather
    // than writing a shared-view record into a solo file for ever.
    if (!force && owner && !activeOthers()) return;
    var now = Date.now();
    clearTimeout(pushTimer);
    var wait = Math.max(0, 400 - (now - lastPush));
    pushTimer = setTimeout(function () {
      lastPush = Date.now();
      var v = M.view;
      sessionDb.put({
        id: 'view',
        by: me.id,
        byName: me.name || '',
        at: Date.now(),
        date: state.date,
        view: { lon: v.lon, lat: v.lat, res: v.res },
        layers: state.layers.map(function (r) { return { id: r.id, on: r.on, opacity: r.opacity }; }),
      }).catch(function (e) {
        // A guest in a room the host made read-only, or a host who has stepped
        // away: the platform's message is written for the person, so show it.
        var msg = String(e && e.message || e);
        if (msg && !/read-only/i.test(msg)) window.WVUI.toast(msg, true);
      });
    }, wait);
  };

  MP.cursor = function (world) {
    if (!cursorsDb || (owner && !activeOthers())) return;
    var now = Date.now();
    if (now - lastCursor < 140) return;
    lastCursor = now;
    cursorsDb.put({
      id: me.id, name: me.name || '', at: now,
      lon: U.wrapLon(world.lon), lat: world.lat,
    }).catch(function () {});
  };

  // A seam for the multiplayer suite (and for anyone debugging a room that
  // looks silent): who this tab thinks it is, and who it thinks is here.
  MP.debug = function () {
    return { owner: owner, me: me.id, follow: follow, others: Object.keys(others).length };
  };

  window.WVMP = MP;
})();
