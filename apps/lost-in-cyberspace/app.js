// Lost in CYBERSPACE — seats, room, both views.
// Invite is OS chrome. Each player writes ONLY their own row.
(function () {
  'use strict';
  var M = window.LIC;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var PRES_TTL = 9000, HB_MS = 3000;
  var view = 'home';
  var state = null;
  var tickTimer = 0;
  var helpOn = false;
  var canvas = $('view');
  var ctx = canvas.getContext('2d');
  var saveDb = null, roomDb = null;
  try {
    if (window.gifos) {
      saveDb = gifos.db('save');
      roomDb = gifos.db('room');
    }
  } catch (e) {}

  function setChip(cls, text) {
    $('chip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('chipText').textContent = text;
  }
  function show(id) {
    view = id;
    ['home', 'lobby', 'hacker', 'navigator'].forEach(function (k) {
      $(k).hidden = k !== id;
    });
    document.body.classList.toggle('play-on', id === 'hacker' || id === 'navigator');
  }

  var HINT = [
    '> access code',
    '',
    'Four ACCESS_CODEs from terminals',
    'in different sectors can be used',
    'by NAVIGATOR to map the network',
    'and locate the TARGET node.',
    '',
    '> hack',
    '',
    'HACK the TARGET node to destroy',
    'the corporate network and win.',
    '',
    'Beware — hacking wrong nodes',
    'makes you easier to locate.'
  ].join('\n');

  function startHacker(shared) {
    state = shared || M.fresh();
    helpOn = false;
    show('hacker');
    $('sendBtn').hidden = !mp.on;
    $('switchSeat').hidden = !mp.on;
    paint();
    renderTerm();
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      if (!state) return;
      M.tick(state);
      paint();
      renderTerm();
      if (mp.on) putMe();
    }, 1000);
    setChip('play', 'HACKER');
  }

  function startNav() {
    show('navigator');
    bootTerminal();
    setChip('ready', 'NAVIGATOR');
  }

  $('soloHacker').onclick = function () { mp.on = false; startHacker(); };
  $('soloNav').onclick = function () { mp.on = false; startNav(); };

  // ---- canvas room ----
  function hexRgb(h) {
    h = String(h || '#1fc').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function paint() {
    if (!state) return;
    var node = M.here(state);
    var W = canvas.width, H = canvas.height;
    var col = node.trap ? [255, 0, 0] : hexRgb(node.color);
    var i, y;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // ceiling / floor
    for (y = 0; y < H / 2; y++) {
      var t = y / (H / 2);
      ctx.fillStyle = 'rgb(' + Math.floor(col[0] * t * 0.15) + ',' + Math.floor(col[1] * t * 0.2) + ',' + Math.floor(col[2] * t * 0.18) + ')';
      ctx.fillRect(0, y, W, 1);
      ctx.fillRect(0, H - 1 - y, W, 1);
    }
    // back wall
    var inset = 90;
    ctx.fillStyle = 'rgb(' + Math.floor(col[0] * 0.25) + ',' + Math.floor(col[1] * 0.35) + ',' + Math.floor(col[2] * 0.3) + ')';
    ctx.fillRect(inset, inset * 0.6, W - inset * 2, H - inset * 1.2);
    ctx.strokeStyle = node.trap ? '#f00' : '#1fc';
    ctx.lineWidth = 2;
    ctx.strokeRect(inset, inset * 0.6, W - inset * 2, H - inset * 1.2);
    // side walls
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(inset, inset * 0.6); ctx.lineTo(inset, H - inset * 0.6); ctx.lineTo(0, H);
    ctx.moveTo(W, 0); ctx.lineTo(W - inset, inset * 0.6); ctx.lineTo(W - inset, H - inset * 0.6); ctx.lineTo(W, H);
    ctx.stroke();
    // door ahead
    if (M.doorAhead(state)) {
      var dw = 90, dh = 160, dx = (W - dw) / 2, dy = H - inset * 0.6 - dh;
      ctx.fillStyle = '#02080a';
      ctx.fillRect(dx, dy, dw, dh);
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(dx, dy, dw, dh);
      ctx.fillStyle = '#1fc';
      ctx.font = '14px monospace';
      ctx.fillText('DOOR', dx + 22, dy + dh / 2);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(inset + 20, inset * 0.6 + 20, W - inset * 2 - 40, 80);
      ctx.fillStyle = '#fff';
      ctx.font = '16px monospace';
      ctx.fillText('WALL', W / 2 - 22, inset * 0.6 + 66);
    }
    // grid lines
    ctx.strokeStyle = 'rgba(17,255,204,0.18)';
    ctx.lineWidth = 1;
    for (i = 0; i < 6; i++) {
      y = (H / 2) + i * 18;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    document.body.classList.toggle('trap-on', node.trap);
    $('hudTime').textContent = M.fmtTime(state.time);
    $('hudXy').textContent = node.x + ',' + node.y + '  S' + node.sector;
    $('hudMoves').textContent = Math.max(0, state.moves) + ' sw';
    drawMini();
  }

  function drawMini() {
    var html = '', x, y, key, cls;
    for (y = 0; y < 8; y++) {
      for (x = 0; x < 8; x++) {
        key = x + ',' + y;
        cls = '';
        if (state.visited[key]) cls = 'on';
        if (x === state.x && y === state.y) cls += ' here';
        if (state.visited[key] && M.isTrap(state.net, x, y)) cls += ' trap';
        html += '<i class="' + cls + '"></i>';
      }
    }
    $('minimap').innerHTML = html;
  }

  function renderTerm() {
    if (!state) return;
    var node = M.here(state);
    var lines = [];
    if (state.ticking && !state.win) {
      var pct = Math.floor((M.GAME_TIME - state.time) * 100 / M.GAME_TIME);
      var bar = Array(Math.min(10, Math.floor(pct / 10) + 1) + 1).join('=');
      bar += Array(Math.max(0, 11 - bar.length)).join(' ');
      lines.push('LOCATING INTRUDER');
      lines.push(pct + '% [' + bar + ']');
      lines.push('            ' + M.fmtTime(state.time));
      lines.push('');
    }
    if (node.trap) {
      lines.push('    INTRUDER  ');
      lines.push(state.over ? '   ELIMINATED' : '    DETECTED  ');
    } else if (state.win) {
      lines.push('> hack');
      lines.push('');
      lines.push('  ACCESS GRANTED');
      lines.push('');
      lines.push('TIME_TO_LOCATE_INTRUDER: ' + M.fmtTime(state.time));
      lines.push('INTRUDER_SWITCHES_COUNT: ' + Math.max(0, state.moves));
      lines.push('NETWORK_TOP_HACKER_CODE: ' + state.scoreCode);
      lines.push('');
      lines.push('YOU WIN!');
      setChip('win', 'WIN');
      if (saveDb && state.scoreCode) {
        saveDb.put({ id: 'scores', last: state.scoreCode, at: nowMs() }).catch(function () {});
      }
    } else if (state.over) {
      lines.push('A fatal timeout.');
      lines.push('You are lost in CYBERSPACE.');
      setChip('dead', 'LOST');
    } else if (node.hacked) {
      lines.push('> hack');
      lines.push('  ACCESS DENIED!');
    } else {
      lines.push('> access code');
      lines.push('  ' + node.code);
      if (helpOn) {
        lines.push('');
        lines.push(HINT);
      }
      lines.push('');
      lines.push('> ' + (node.target ? 'TARGET NODE' : 'sector ' + node.sector));
    }
    $('nodeTerm').textContent = lines.join('\n');
    var st = $('hackerStatus');
    if (state.win) {
      st.className = 'statusline good';
      st.textContent = 'Give the navigator the score code: ' + state.scoreCode;
    } else if (state.over) {
      st.className = 'statusline warn';
      st.textContent = 'Time ran out.';
    } else {
      st.className = 'statusline';
      st.textContent = node.target
        ? 'This is the TARGET. HACK it.'
        : 'Read the code to the navigator. Walk through the door ahead.';
    }
  }

  $('turnL').onclick = function () { if (state) { M.turnLeft(state); paint(); } };
  $('turnR').onclick = function () { if (state) { M.turnRight(state); paint(); } };
  $('goFwd').onclick = function () {
    if (!state) return;
    M.walkForward(state);
    paint();
    renderTerm();
    if (mp.on) putMe();
  };
  $('helpBtn').onclick = function () { helpOn = !helpOn; renderTerm(); };
  $('hackBtn').onclick = function () {
    if (!state) return;
    M.hack(state);
    paint();
    renderTerm();
    if (mp.on) putMe();
  };
  $('sendBtn').onclick = function () {
    if (!state || !mp.on) return;
    var node = M.here(state);
    if (!node.code) return;
    if (state.sent.indexOf(node.code) < 0) state.sent.push(node.code);
    putMe();
    $('hackerStatus').textContent = 'Sent ' + node.code + ' to the navigator.';
  };

  canvas.addEventListener('click', function (e) {
    if (!state) return;
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width;
    if (x < 0.28) M.turnLeft(state);
    else if (x > 0.72) M.turnRight(state);
    else M.walkForward(state);
    paint();
    renderTerm();
    if (mp.on) putMe();
  });

  document.addEventListener('keydown', function (e) {
    if (view === 'navigator') return;
    if (view !== 'hacker' || !state) return;
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { M.turnLeft(state); e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { M.turnRight(state); e.preventDefault(); }
    else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') { M.walkForward(state); e.preventDefault(); }
    else if (k === 'h' || k === 'H') { helpOn = !helpOn; }
    else if (k === 'g' || k === 'G') { M.hack(state); }
    else return;
    paint();
    renderTerm();
    if (mp.on) putMe();
  });

  // ---- navigator terminal ----
  var termEl, termInput, defaultTop;
  defaultTop = {
    '0x16C0D6': 'bartaz + calanthe',
    '0x2FE011': 'Project 2501',
    '0x1D2065': 'Oracle/Braniac',
    '0x6A60AA': 'The Lone Gunmen',
    '0xE6F0E1': "Acid Burn 'n' Crash Override",
    '0x8A014C': 'Wasp & Bob the Dog',
    '0xC6010C': 'Johnny Mnemonic and Jones',
    '0xA40139': 'Martin Brice with Cosmo',
    '0x92A18F': 'fsociety',
    '0x310203': 'Neo & Trinity'
  };
  var topScores = null;

  function loadScores(cb) {
    if (topScores) { cb(topScores); return; }
    if (!saveDb) { topScores = JSON.parse(JSON.stringify(defaultTop)); cb(topScores); return; }
    saveDb.get('top').then(function (row) {
      topScores = (row && row.map) ? row.map : JSON.parse(JSON.stringify(defaultTop));
      cb(topScores);
    }).catch(function () {
      topScores = JSON.parse(JSON.stringify(defaultTop));
      cb(topScores);
    });
  }

  function bootTerminal() {
    termEl = $('terminal');
    termInput = $('ti');
    termEl.innerHTML = '<p>Welcome NAVIGATOR!</p><p>Type `help` for list of available commands.</p>';
    termInput.value = '';
    setTimeout(function () { try { termInput.focus(); } catch (e) {} }, 50);
  }

  function p(html, cls) {
    var el = document.createElement('p');
    el.className = 'out ' + (cls || '');
    el.innerHTML = html;
    termEl.appendChild(el);
    termEl.scrollTop = termEl.scrollHeight;
  }

  function formatCode(code) {
    return code ? '0x' + String(code).replace(/^0x/i, '').toUpperCase() : 'unknown';
  }

  function runCmd(line) {
    var args = String(line || '').split(/\s+/).filter(Boolean);
    var cmd = (args.shift() || '').toLowerCase();
    var sudo = false;
    if (cmd === 'sudo') { sudo = true; cmd = (args.shift() || '').toLowerCase(); }
    if (args.indexOf('-h') >= 0 || args.indexOf('--help') >= 0) {
      args = [cmd];
      cmd = 'help';
    }
    p('<span class="color-green">&gt; ' + esc(line) + '</span>');
    if (cmd === 'help' || cmd === 'man') {
      if (args[0]) helpCmd(args[0]);
      else {
        p('<div>Available commands:</div>'
          + '<div class="pad">- <b>nmap [ACCESS_CODE...]</b> — map the network</div>'
          + '<div class="pad">- <b>help [COMMAND]</b> — details</div>'
          + '<div class="pad">- <b>top</b> — top hacker teams</div>'
          + '<div class="pad">- <b>make-me-a-sandwich</b></div>'
          + '<div class="pad">- <b>cat</b></div>');
      }
    } else if (cmd === 'nmap') {
      showMap(args);
    } else if (cmd === 'top') {
      showTop(args);
    } else if (cmd === 'make-me-a-sandwich') {
      p((sudo || args.indexOf('please') >= 0 || args.indexOf('--please') >= 0)
        ? 'Okay. (xkcd 149.)'
        : 'What? Make it yourself.');
    } else if (cmd === 'cat') {
      p("<span class='color-red'>,*'^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`</span><br>"
        + "<span style='color:#3C5'>*.,*'^`*.,*'^`*.,*'^`*.,*'^`</span>&nbsp;&nbsp;,---/V\\<br>"
        + "<span style='color:#3CF'>`*.,*'^`*.,*'^`*.,*'^`*.,*'^`</span>&nbsp;~|__(o.o)<br>"
        + "<span style='color:#FC3'>^`*.,*'^`*.,*'^`*.,*'^`*.,*'^`</span>&nbsp;UU&nbsp;&nbsp;UU");
    } else if (cmd) {
      p('COMMAND NOT FOUND: ' + esc(line));
    }
    termEl.scrollTop = termEl.scrollHeight;
  }

  function helpCmd(cmd) {
    if (cmd === 'nmap') {
      p("<div>NAME</div><div class='pad'><b>nmap</b> — display the map of network nodes</div>"
        + "<div>SYNOPSIS</div><div class='pad'><b>nmap</b> [ACCESS_CODE ...]</div>"
        + "<div>DESCRIPTION</div><div class='pad'>Four ACCESS_CODEs from the HACKER. Each fills in sectors, connections, traps, or the target. 0–4 codes, case insensitive, optional 0x prefix.</div>");
    } else if (cmd === 'top') {
      p("<div>NAME</div><div class='pad'><b>top</b> — top hacker teams</div>"
        + "<div>SYNOPSIS</div><div class='pad'><b>top</b> [NETWORK_TOP_HACKER_CODE] [TEAM_NAME]</div>");
    } else {
      p('No help entry for ' + esc(cmd));
    }
  }

  function legend(net) {
    function row(ok, name, code) {
      return '<li class="' + (ok ? 'color-springgreen' : 'color-red') + '">['
        + formatCode(code) + '] ' + name + '</li>';
    }
    return '<ul>'
      + row(net.colors, 'Sectors', net.colors && net.colors.code)
      + row(!!net.walls, 'Connections', net.walls && net.walls.code)
      + row(!!net.traps, 'Traps', net.traps && net.traps.code)
      + row(net.target, 'Target coordinates', net.target && net.target.code)
      + '</ul>';
  }

  function showMap(codes) {
    var net = networkFromCodes(codes);
    p('MAP OF THE NETWORK:');
    p(getNetworkMap(net), 'tm pad');
    p(legend(net));
    if (!codes.length) p('Network codes not provided.');
    if (net.errors) {
      net.errors.forEach(function (er) { p('<b>' + esc(er) + '</b> is not a valid ACCESS_CODE.'); });
    }
  }

  function showTop(args) {
    var code = args[0], name = args.slice(1).join(' '), error = null;
    if (code) {
      try {
        codeToScore(code);
        code = formatCode(code);
      } catch (e) {
        error = '<b>' + esc(args[0]) + '</b> is not a valid NETWORK_TOP_HACKER_CODE.';
        code = null;
      }
    }
    loadScores(function (scores) {
      if (code) {
        scores[code] = name;
        topScores = scores;
        if (saveDb) saveDb.put({ id: 'top', map: scores }).catch(function () {});
      }
      var list = Object.keys(scores).map(function (k) {
        var sc;
        try { sc = codeToScore(k); } catch (e) { sc = { time: 0, moves: 0 }; }
        return { code: k, name: scores[k], time: sc.time, moves: sc.moves };
      });
      list.sort(function (a, b) { return a.time !== b.time ? b.time - a.time : a.moves - b.moves; });
      p('<div>&nbsp;&nbsp;TOP HACKERS<br>&nbsp;&nbsp;-------------</div>'
        + list.map(function (s) {
          return '<div>' + M.fmtTime(s.time) + '  ' + s.moves + '  ' + esc(s.name || 'Anonymous') + '</div>';
        }).join(''));
      if (error) p(error);
    });
  }

  $('ti').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var v = this.value;
      this.value = '';
      runCmd(v);
    }
  });

  // ---- multiplayer ----
  var mp = { on: false, id: null, name: 'You', row: null, role: null, hb: 0, sub: false };
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

  function putMe(extra) {
    if (!roomDb || !mp.id) return;
    var row = {
      id: mp.id,
      name: mp.name,
      at: nowMs(),
      role: mp.role,
      codes: (state && state.sent) || [],
      score: (state && state.scoreCode) || null,
      over: !!(state && state.over),
      win: !!(state && state.win)
    };
    if (extra) Object.keys(extra).forEach(function (k) { row[k] = extra[k]; });
    mp.row = row;
    roomDb.put(row).catch(function () {});
  }

  $('friendBtn').onclick = mpEnter;
  function mpEnter() {
    if (!roomDb) {
      $('lobbyStatus').textContent = 'Play with a friend needs a GifOS room.';
      show('lobby');
      setChip('', 'No room');
      return;
    }
    (window.gifos && gifos.me ? gifos.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (me) {
      mp.id = (me && me.id) || 'local';
      mp.name = (me && me.name) || 'You';
      mp.on = true;
      mp.role = null;
      mp.row = null;
      state = null;
      show('lobby');
      setChip('ready', 'A room');
      if (!mp.sub) {
        mp.sub = true;
        roomDb.subscribe(function (items) { _items = items || []; mpRefresh(); });
      }
      putMe();
      if (mp.hb) clearInterval(mp.hb);
      mp.hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
      mpRefresh();
    }).catch(function () {});
  }

  function mpLeave() {
    mp.on = false;
    mp.role = null;
    if (mp.hb) { clearInterval(mp.hb); mp.hb = 0; }
    if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
    if (roomDb && mp.id) roomDb.delete(mp.id).catch(function () {});
    state = null;
    show('home');
    setChip('', 'Ready');
  }

  $('lobbyLeave').onclick = mpLeave;
  $('hackerLeave').onclick = function () {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
    if (mp.on) { show('lobby'); mpRefresh(); }
    else { state = null; show('home'); setChip('', 'Ready'); }
  };
  $('navLeave').onclick = function () {
    if (mp.on) { show('lobby'); mpRefresh(); }
    else { show('home'); setChip('', 'Ready'); }
  };

  $('roleHacker').onclick = function () {
    mp.role = 'hacker';
    putMe({ role: 'hacker' });
    startHacker();
  };
  $('roleNav').onclick = function () {
    mp.role = 'nav';
    putMe({ role: 'nav' });
    startNav();
  };

  function mpRefresh() {
    if (!mp.on) return;
    var people = livePeople(_items);
    if (!people.some(function (p) { return p.id === mp.id; })) {
      people.push(mp.row || { id: mp.id, name: mp.name, at: nowMs(), role: mp.role });
    }
    if (view === 'lobby') renderLobby(people);
    if (mp.role === 'nav') renderInbox(people);
  }

  function renderLobby(people) {
    var html = '', i, p;
    people.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    for (i = 0; i < people.length; i++) {
      p = people[i];
      html += '<li class="' + (p.id === mp.id ? 'me' : '') + '"><span class="name">'
        + esc(p.id === mp.id ? 'You' : (p.name || 'Player')) + '</span>'
        + '<span class="meta">' + (p.role === 'hacker' ? 'HACKER' : p.role === 'nav' ? 'NAVIGATOR' : '…') + '</span></li>';
    }
    $('lobbyList').innerHTML = html || '<li><span class="name">Just you so far</span></li>';
    if (people.length < 2) {
      $('lobbyStatus').textContent = 'Waiting for a friend… press Invite in the GifOS menu to send the link.';
    } else {
      $('lobbyStatus').textContent = people.length + ' here. Pick a seat. One hacker, one navigator.';
    }
    setChip('ready', people.length + ' here');
  }

  function renderInbox(people) {
    var codes = [], i, p, j, seen = {};
    for (i = 0; i < people.length; i++) {
      p = people[i];
      if (p.id === mp.id) continue;
      if (p.codes && p.codes.length) {
        for (j = 0; j < p.codes.length; j++) {
          if (!seen[p.codes[j]]) { seen[p.codes[j]] = 1; codes.push(p.codes[j]); }
        }
      }
      if (p.score) {
        $('inbox').hidden = false;
      }
    }
    if (!codes.length) { $('inbox').hidden = true; return; }
    $('inbox').hidden = false;
    $('inboxList').innerHTML = codes.map(function (c) {
      return '<button type="button" data-code="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
  }

  $('inboxList').addEventListener('click', function (e) {
    var b = e.target;
    if (!b || !b.getAttribute) return;
    var c = b.getAttribute('data-code');
    if (!c) return;
    if (view !== 'navigator') return;
    runCmd('nmap ' + c);
  });

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (view === 'hacker' || view === 'navigator') {
        if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
        if (mp.on) { show('lobby'); mpRefresh(); }
        else { state = null; show('home'); setChip('', 'Ready'); }
        return true;
      }
      if (view === 'lobby') {
        mpLeave();
        return true;
      }
      return false;
    });
  }

  setChip('', 'Ready');
})();
