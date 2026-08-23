// Spyfall — location + spy. Invite is the room. The Node socket room is gone.
// Host deals; each player stores their own card privately and publishes only
// their location vote. Nobody writes anybody else's row. Invite is OS chrome.
(function () {
  'use strict';
  var SF = window.SF;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var PRES_TTL = 9000, HB_MS = 3000;
  var view = 'home';
  var minutes = 8;
  var roleDb = null, votesDb = null;
  try {
    if (window.gifos) {
      roleDb = gifos.db('role');
      votesDb = gifos.db('votes');
    }
  } catch (e) {}

  function setChip(cls, text) {
    $('chip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('chipText').textContent = text;
  }
  function show(id) {
    view = id;
    ['home', 'hotseat', 'hsCard', 'lobby', 'play'].forEach(function (k) {
      $(k).hidden = k !== id;
    });
  }

  // ---- hotseat (pass this phone) ----
  var hs = { names: [], i: 0, deal: null, ids: [], hidden: false };

  function renderHsNames() {
    var ul = $('hsNames'), html = '', i, n;
    for (i = 0; i < hs.names.length; i++) {
      n = hs.names[i];
      html += '<li><span class="name">' + esc(n) + '</span>' +
        '<button type="button" class="row-del" data-i="' + i + '" aria-label="Remove">🗑</button></li>';
    }
    ul.innerHTML = html || '<li><span class="name">Nobody yet</span></li>';
  }
  $('hsNames').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.row-del') : null;
    if (!b) return;
    hs.names.splice(parseInt(b.getAttribute('data-i'), 10), 1);
    renderHsNames();
  });
  $('hsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = ($('hsInput').value || '').trim();
    if (v.length < 2 || v.length > 24) return;
    if (hs.names.indexOf(v) >= 0) return;
    hs.names.push(v);
    $('hsInput').value = '';
    renderHsNames();
  });
  $('hotseatBtn').onclick = function () { renderHsNames(); show('hotseat'); setChip('ready', 'This phone'); };
  $('hsBack').onclick = function () { show('home'); setChip('', 'Ready'); };

  function paintCard(el, card, first) {
    if (!card) { el.innerHTML = ''; return; }
    if (card.spy) {
      el.innerHTML = '<div class="spy">You are the spy!</div>' +
        (first ? '<div class="job">You will ask the first question.</div>' : '');
    } else {
      el.innerHTML = '<div class="notspy">You are <strong>not</strong> the spy</div>' +
        '<div class="place">' + esc(card.location) + '</div>' +
        '<div class="job">' + esc(card.role) + '</div>' +
        (first ? '<div class="job">You will ask the first question.</div>' : '');
    }
  }

  $('hsDeal').onclick = function () {
    if (hs.names.length < 3) { return; }
    hs.ids = hs.names.map(function (n, i) { return 'p' + i; });
    hs.deal = SF.deal(String(nowMs()) + '-' + hs.names.join(','), hs.ids);
    hs.i = 0;
    hs.hidden = false;
    showHsCard();
  };
  function showHsCard() {
    var id = hs.ids[hs.i], card = hs.deal.cards[id];
    var first = hs.deal.firstId === id;
    $('hsWho').textContent = hs.names[hs.i];
    $('hsPassHint').textContent = 'Look, then hide it before you pass the phone.';
    paintCard($('hsRole'), card, first);
    $('hsRole').className = 'role-card';
    $('hsNext').textContent = hs.i < hs.ids.length - 1 ? 'Hide and pass' : 'Everyone has seen · play';
    show('hsCard');
    setChip('play', 'Pass the phone');
  }
  $('hsNext').onclick = function () {
    if (hs.i < hs.ids.length - 1) {
      hs.i += 1;
      showHsCard();
    } else {
      enterLocalPlay();
    }
  };
  $('hsCardBack').onclick = function () { show('hotseat'); setChip('ready', 'This phone'); };

  var localPlay = null;
  function enterLocalPlay() {
    localPlay = {
      deal: hs.deal,
      names: hs.names.slice(),
      ids: hs.ids.slice(),
      as: 0,
      startedAt: nowMs(),
      duration: minutes * 60,
      paused: false,
      left: minutes * 60,
      voteLoc: {},
      voteSpy: {},
      hidden: false,
      ended: false
    };
    mp.on = false;
    openPlay();
  }

  // ---- multiplayer ----
  // One public collection (`votes`). Each person writes ONLY their own row.
  // The host (lowest live id) is the one who deals: they publish a seed on
  // THEIR row. Each player derives their card and writes it to private `role`.
  var mp = { on: false, id: null, name: 'You', row: null, people: [], hb: 0, sub: false, hidden: false, adopted: null };
  var _items = [];

  function livePeople(items, t) {
    t = t || nowMs();
    var out = [], i, it;
    for (i = 0; i < (items || []).length; i++) {
      it = items[i];
      if (!it || !it.id) continue;
      if (it.at && t - it.at >= PRES_TTL) continue;
      out.push(it);
    }
    return out;
  }
  function isHost(people) {
    if (!people.length) return true;
    var m = people[0].id, i;
    for (i = 1; i < people.length; i++) if (people[i].id < m) m = people[i].id;
    return mp.id === m;
  }
  function adoptedDeal(people) {
    var maxR = 0, i, p, cand = [];
    for (i = 0; i < people.length; i++) {
      p = people[i];
      if (p.seed && p.playerIds && (p.round || 0) > maxR) maxR = p.round || 0;
    }
    if (!maxR) return null;
    for (i = 0; i < people.length; i++) {
      p = people[i];
      if ((p.round || 0) === maxR && p.seed && p.playerIds) cand.push(p);
    }
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var src = {
      id: cand[0].id,
      round: cand[0].round,
      seed: cand[0].seed,
      startedAt: cand[0].startedAt,
      duration: cand[0].duration,
      playerIds: cand[0].playerIds,
      phase: cand[0].phase || 'play',
      paused: !!cand[0].paused,
      left: cand[0].left
    };
    for (i = 0; i < cand.length; i++) {
      if (cand[i].phase === 'ended') src.phase = 'ended';
    }
    return src;
  }

  function putRole(card, round) {
    if (!roleDb || !card) return;
    roleDb.put({
      id: 'me',
      round: round || 0,
      spy: !!card.spy,
      location: card.spy ? null : card.location,
      role: card.role
    }).catch(function () {});
  }

  function putMe(extra) {
    if (!votesDb || !mp.id) return;
    var row = {
      id: mp.id,
      name: mp.name,
      at: nowMs(),
      ready: true,
      voteLoc: null,
      voteSpy: null
    };
    if (mp.row) {
      ['round', 'seed', 'startedAt', 'duration', 'playerIds', 'phase', 'paused', 'left',
        'voteLoc', 'voteSpy'].forEach(function (k) {
        if (mp.row[k] !== undefined) row[k] = mp.row[k];
      });
    }
    if (extra) {
      Object.keys(extra).forEach(function (k) { row[k] = extra[k]; });
    }
    mp.row = row;
    votesDb.put(row).catch(function () {});
  }

  $('friendBtn').onclick = mpEnter;
  function mpEnter() {
    if (!votesDb) {
      $('lobbyStatus').textContent = 'Play with friends needs a GifOS room.';
      show('lobby');
      setChip('', 'No room');
      return;
    }
    (window.gifos && gifos.me ? gifos.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (me) {
      mp.id = (me && me.id) || 'local';
      mp.name = (me && me.name) || 'You';
      mp.on = true;
      mp.row = null;
      mp.adopted = null;
      mp.hidden = false;
      localPlay = null;
      show('lobby');
      setChip('ready', 'A room');
      if (!mp.sub) {
        mp.sub = true;
        votesDb.subscribe(function (items) { _items = items || []; mpRefresh(); });
      }
      putMe({ phase: 'lobby', round: 0, seed: null, playerIds: null, voteLoc: null, voteSpy: null });
      if (mp.hb) clearInterval(mp.hb);
      mp.hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
      mpRefresh();
    }).catch(function () {});
  }
  function mpLeave() {
    mp.on = false;
    if (mp.hb) { clearInterval(mp.hb); mp.hb = 0; }
    if (votesDb && mp.id) votesDb.delete(mp.id).catch(function () {});
    show('home');
    setChip('', 'Ready');
  }
  $('lobbyLeave').onclick = mpLeave;
  $('playLeave').onclick = function () {
    if (mp.on) mpLeave();
    else { localPlay = null; show('home'); setChip('', 'Ready'); }
  };

  $('timeSeg').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    b.classList.add('on');
    minutes = parseInt(b.getAttribute('data-min'), 10) || 8;
  });

  $('dealBtn').onclick = function () {
    if (!mp.on) return;
    var people = livePeople(_items);
    if (!people.some(function (p) { return p.id === mp.id; })) {
      people.push(mp.row || { id: mp.id, name: mp.name, at: nowMs() });
    }
    if (!isHost(people)) return;
    if (people.length < 2) return;
    var ids = people.map(function (p) { return p.id; });
    ids.sort();
    var ad = adoptedDeal(people);
    var round = ((ad && ad.round) || 0) + 1;
    var seed = nowMs().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
    var d = SF.deal(seed, ids);
    putRole(d.cards[mp.id], round);
    putMe({
      round: round,
      seed: seed,
      startedAt: nowMs(),
      duration: minutes * 60,
      playerIds: ids,
      phase: 'play',
      paused: false,
      left: minutes * 60,
      voteLoc: null,
      voteSpy: null
    });
  };

  $('endBtn').onclick = function () {
    if (localPlay) {
      localPlay.ended = true;
      renderPlay();
      return;
    }
    if (!mp.on || !mp.adopted) return;
    var people = livePeople(_items);
    if (!isHost(people)) return;
    putMe({ phase: 'ended' });
  };

  function remaining(d) {
    if (!d) return 0;
    var dur = d.duration || 0;
    if (d.paused) return Math.max(0, d.left || 0);
    var elapsed = (nowMs() - (d.startedAt || nowMs())) / 1000;
    return Math.max(0, dur - elapsed);
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  $('timer').onclick = function () {
    if (localPlay) {
      if (localPlay.ended) return;
      if (localPlay.paused) {
        localPlay.paused = false;
        localPlay.startedAt = nowMs();
        localPlay.duration = localPlay.left;
      } else {
        localPlay.left = remaining(localPlay);
        localPlay.paused = true;
      }
      renderPlay();
      return;
    }
    if (!mp.on || !mp.adopted) return;
    var people = livePeople(_items);
    if (!isHost(people)) return;
    if (mp.adopted.phase === 'ended') return;
    if (mp.row && mp.row.paused) {
      putMe({ paused: false, startedAt: nowMs(), duration: mp.row.left || remaining(mp.adopted) });
    } else {
      putMe({ paused: true, left: remaining(mp.adopted) });
    }
  };

  $('hideBtn').onclick = function () {
    if (localPlay) localPlay.hidden = !localPlay.hidden;
    else mp.hidden = !mp.hidden;
    renderPlay();
  };

  $('asSeg').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || !localPlay) return;
    localPlay.as = parseInt(b.getAttribute('data-as'), 10) || 0;
    localPlay.hidden = false;
    renderPlay();
  });
  $('playerList').addEventListener('click', function (e) {
    var li = e.target.closest ? e.target.closest('li') : null;
    if (!li) return;
    var id = li.getAttribute('data-id');
    if (!id) return;
    if (localPlay) {
      var kn = localPlay.names[localPlay.as] || localPlay.names[0];
      localPlay.voteSpy[kn] = localPlay.voteSpy[kn] === id ? null : id;
      renderPlay();
      return;
    }
    if (!mp.on || !mp.row) return;
    putMe({ voteSpy: mp.row.voteSpy === id ? null : id });
  });
  $('locList').addEventListener('click', function (e) {
    var li = e.target.closest ? e.target.closest('li') : null;
    if (!li) return;
    var name = li.getAttribute('data-loc');
    if (!name) return;
    if (localPlay) {
      var k = localPlay.names[localPlay.as] || localPlay.names[0];
      localPlay.voteLoc[k] = localPlay.voteLoc[k] === name ? null : name;
      renderPlay();
      return;
    }
    if (!mp.on || !mp.row) return;
    putMe({ voteLoc: mp.row.voteLoc === name ? null : name });
  });

  function mpRefresh() {
    if (!mp.on) return;
    var people = livePeople(_items);
    if (!people.some(function (p) { return p.id === mp.id; })) {
      people.push(mp.row || { id: mp.id, name: mp.name, at: nowMs() });
    }
    mp.people = people;
    var ad = adoptedDeal(people);
    if (ad && (!mp.adopted || mp.adopted.round !== ad.round || mp.adopted.seed !== ad.seed)) {
      var d = SF.deal(ad.seed, ad.playerIds);
      var mine = d.cards[mp.id];
      if (mine) putRole(mine, ad.round);
      mp.hidden = false;
      if (!mp.row || mp.row.round !== ad.round || mp.row.seed !== ad.seed) {
        putMe({
          round: ad.round,
          seed: ad.seed,
          startedAt: ad.startedAt,
          duration: ad.duration,
          playerIds: ad.playerIds,
          phase: ad.phase || 'play',
          paused: !!ad.paused,
          left: ad.left,
          voteLoc: null,
          voteSpy: null
        });
      }
    }
    if (ad && mp.row && ad.phase && mp.row.phase !== ad.phase && ad.round === mp.row.round) {
      putMe({ phase: ad.phase, paused: !!ad.paused, left: ad.left, startedAt: ad.startedAt, duration: ad.duration });
    }
    mp.adopted = ad;
    if (ad && (ad.phase === 'play' || ad.phase === 'ended')) {
      if (view !== 'play') openPlay();
      else renderPlay();
    } else {
      renderLobby(people);
      if (view !== 'lobby' && view !== 'home') show('lobby');
    }
  }

  function renderLobby(people) {
    var html = '', i, p, host = isHost(people);
    people.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    for (i = 0; i < people.length; i++) {
      p = people[i];
      html += '<li class="' + (p.id === mp.id ? 'me' : '') + '"><span class="name">' +
        esc(p.id === mp.id ? 'You' : (p.name || 'Player')) + '</span>' +
        (host && p.id === mp.id ? '<span class="meta">deals</span>' : '') + '</li>';
    }
    $('lobbyList').innerHTML = html || '<li><span class="name">Just you so far</span></li>';
    $('dealBtn').hidden = !host;
    $('dealBtn').disabled = people.length < 2;
    if (people.length < 2) {
      $('lobbyStatus').textContent = 'Waiting for friends… press Invite in the GifOS menu to send the link.';
    } else if (host) {
      $('lobbyStatus').textContent = people.length + ' here. Deal when you are ready.';
    } else {
      $('lobbyStatus').textContent = people.length + ' here. Waiting for the host to deal.';
    }
    setChip('ready', people.length + ' here');
  }

  function openPlay() {
    show('play');
    renderPlay();
  }

  function renderPlay() {
    var d, namesById = {}, votes = [], i, p, card, firstId, ended, locCounts = {}, spyCounts = {};
    var locNames = SF.names(), mineId, mineName;

    if (localPlay) {
      d = localPlay.deal;
      firstId = d.firstId;
      ended = localPlay.ended || remaining(localPlay) <= 0;
      mineId = localPlay.ids[localPlay.as] || localPlay.ids[0];
      mineName = localPlay.names[localPlay.as] || localPlay.names[0];
      card = d.cards[mineId];
      for (i = 0; i < localPlay.ids.length; i++) {
        namesById[localPlay.ids[i]] = localPlay.names[i];
        votes.push({
          id: localPlay.ids[i],
          name: localPlay.names[i],
          voteLoc: localPlay.voteLoc[localPlay.names[i]] || null,
          voteSpy: localPlay.voteSpy[localPlay.names[i]] || null
        });
      }
      $('playLeave').textContent = '← Home';
      $('endBtn').hidden = false;
      $('playTitle').textContent = 'On this phone';
      var asHtml = '', ai;
      for (ai = 0; ai < localPlay.names.length; ai++) {
        asHtml += '<button type="button" data-as="' + ai + '"' +
          (ai === localPlay.as ? ' class="on"' : '') + '>' + esc(localPlay.names[ai]) + '</button>';
      }
      $('asSeg').innerHTML = asHtml;
      $('asSeg').hidden = false;
    } else if (mp.on && mp.adopted) {
      d = SF.deal(mp.adopted.seed, mp.adopted.playerIds);
      firstId = d.firstId;
      ended = mp.adopted.phase === 'ended' || remaining(mp.adopted) <= 0;
      mineId = mp.id;
      mineName = 'You';
      card = d.cards[mp.id] || { spy: true, location: null, role: 'Spy' };
      votes = mp.people.slice();
      for (i = 0; i < votes.length; i++) namesById[votes[i].id] = votes[i].name || 'Player';
      $('playLeave').textContent = '← Leave';
      $('endBtn').hidden = !isHost(mp.people);
      $('playTitle').textContent = 'Round ' + (mp.adopted.round || 1);
      $('asSeg').hidden = true;
      $('asSeg').innerHTML = '';
    } else {
      return;
    }

    for (i = 0; i < votes.length; i++) {
      p = votes[i];
      if (p.voteLoc) locCounts[p.voteLoc] = (locCounts[p.voteLoc] || 0) + 1;
      if (p.voteSpy) spyCounts[p.voteSpy] = (spyCounts[p.voteSpy] || 0) + 1;
    }

    var left = localPlay ? remaining(localPlay) : remaining(mp.adopted);
    var paused = localPlay ? localPlay.paused : !!(mp.adopted && mp.adopted.paused);
    var tEl = $('timer');
    tEl.innerHTML = '<span>' + fmtTime(left) + '</span>';
    tEl.className = 'countdown' + (ended ? ' finished' : '') + (paused && !ended ? ' paused' : '');
    $('timerHint').textContent = ended ? 'Time.' : (paused ? 'Paused' : 'Tap to pause');

    var hidden = localPlay ? localPlay.hidden : mp.hidden;
    $('hideBtn').textContent = hidden ? 'Your role · tap to show' : 'Your role · tap to hide';
    $('roleCard').className = 'role-card' + (hidden ? ' hidden' : '');
    paintCard($('roleCard'), card, firstId === mineId);

    var firstName = namesById[firstId] || 'Someone';
    if (firstId === mineId) {
      $('firstLine').className = 'firstline you';
      $('firstLine').textContent = 'You will ask the first question.';
    } else {
      $('firstLine').className = 'firstline';
      $('firstLine').textContent = 'The first question will be asked by ' + firstName + '.';
    }

    var html = '';
    var order = localPlay ? localPlay.ids : (mp.adopted.playerIds || []).slice();
    for (i = 0; i < order.length; i++) {
      p = order[i];
      html += '<li class="' + (p === mineId ? 'me' : '') +
        ((localPlay ? localPlay.voteSpy[mineName] : (mp.row && mp.row.voteSpy)) === p ? ' on' : '') +
        '" data-id="' + esc(p) + '"><span class="name">' +
        esc(p === mineId ? 'You' : (namesById[p] || 'Player')) + '</span>' +
        (p === firstId ? '<span class="first">1st</span>' : '') +
        (spyCounts[p] ? '<span class="meta">' + spyCounts[p] + '</span>' : '') +
        '</li>';
    }
    $('playerList').innerHTML = html;

    html = '';
    for (i = 0; i < locNames.length; i++) {
      var loc = locNames[i];
      var mineVote = localPlay ? localPlay.voteLoc[mineName] : (mp.row && mp.row.voteLoc);
      html += '<li class="' + (mineVote === loc ? 'on' : '') + '" data-loc="' + esc(loc) + '">' +
        '<span class="name">' + esc(loc) + '</span>' +
        (locCounts[loc] ? '<span class="n">' + locCounts[loc] + '</span>' : '') +
        '</li>';
    }
    $('locList').innerHTML = html;

    var rev = $('reveal');
    if (ended && d) {
      rev.hidden = false;
      var spyName = d.spyId === mineId ? 'You' : (namesById[d.spyId] || 'The spy');
      rev.innerHTML = '<h3>The place was ' + esc(d.location) + '</h3>' +
        '<p class="spy">' + esc(spyName) + ' was the spy.</p>';
    } else {
      rev.hidden = true;
    }
    setChip(ended ? 'ready' : 'play', ended ? 'Round over' : 'Playing');
  }

  setInterval(function () {
    if (view === 'play') renderPlay();
  }, 500);

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (view === 'play') {
        if (mp.on) { show('lobby'); mpRefresh(); }
        else { localPlay = null; show('home'); setChip('', 'Ready'); }
        return true;
      }
      if (view === 'hsCard') { show('hotseat'); setChip('ready', 'This phone'); return true; }
      if (view === 'hotseat' || view === 'lobby') {
        if (mp.on) mpLeave();
        else { show('home'); setChip('', 'Ready'); }
        return true;
      }
      return false;
    });
  }

  renderHsNames();
  setChip('', 'Ready');
})();
