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

  function ensureTick() {
    if (tickTimer) return;
    tickTimer = setInterval(function () {
      if (!state) return;
      M.tick(state);
      if (view === 'hacker') { paint(); renderTerm(); }
      if (view === 'navigator') renderNavHud();
      if (mp.on) putMe();
    }, 1000);
  }
  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
  }

  function startHacker(shared) {
    if (shared) state = shared;
    else if (!state || state.over || state.win) state = M.fresh();
    helpOn = false;
    show('hacker');
    $('sendBtn').hidden = !mp.on;
    paint();
    renderTerm();
    ensureTick();
    setChip('play', 'HACKER');
    if (mp.on) putMe();
  }

  function startNav() {
    show('navigator');
    bootTerminal();
    renderNavHud();
    setChip('ready', 'NAVIGATOR');
    if (mp.on) putMe();
    else if (state) fillInbox(M.foundCodes(state), true);
  }

  function switchToNav() {
    if (view === 'navigator') return;
    if (mp.on) {
      mp.role = 'nav';
      putMe({ role: 'nav' });
    }
    startNav();
  }
  function switchToHacker() {
    if (view === 'hacker') return;
    if (mp.on) {
      var other = liveHacker(livePeople(_items));
      if (other) return;
      mp.role = 'hacker';
      putMe({ role: 'hacker' });
    }
    startHacker(state);
  }

  $('soloHacker').onclick = function () { mp.on = false; state = null; startHacker(); };
  $('soloNav').onclick = function () { mp.on = false; state = null; startNav(); };
  $('hackerSwitch').onclick = switchToNav;
  $('navSwitch').onclick = switchToHacker;

  // ---- canvas room ----
  function hexRgb(h) {
    h = String(h || '#1fc').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgb(c, s) {
    s = s == null ? 1 : s;
    return 'rgb(' + Math.max(0, Math.min(255, Math.floor(c[0] * s))) + ','
      + Math.max(0, Math.min(255, Math.floor(c[1] * s))) + ','
      + Math.max(0, Math.min(255, Math.floor(c[2] * s))) + ')';
  }
  function lerp(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function paint() {
    if (!state) return;
    var node = M.here(state);
    var W = canvas.width, H = canvas.height;
    var col = node.trap ? [255, 32, 48] : hexRgb(node.color);
    if (node.target) col = lerp(col, [255, 204, 51], 0.45);
    var ds = M.doors(state);
    var face = state.facing;
    var leftOpen = face === 0 ? ds.w : face === 1 ? ds.n : face === 2 ? ds.e : ds.s;
    var rightOpen = face === 0 ? ds.e : face === 1 ? ds.s : face === 2 ? ds.w : ds.n;
    var ahead = M.doorAhead(state);
    var i, y, x, t;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // ceiling
    for (y = 0; y < H / 2; y++) {
      t = y / (H / 2);
      ctx.fillStyle = rgb(lerp([0, 0, 0], col, t * 0.22));
      ctx.fillRect(0, y, W, 1);
    }
    // floor — sector colour, perspective bands
    for (y = 0; y < H / 2; y++) {
      t = y / (H / 2);
      ctx.fillStyle = rgb(col, 0.08 + t * 0.55);
      ctx.fillRect(0, H / 2 + y, W, 1);
    }

    var nearL = 0, nearR = W, farL = W * 0.28, farR = W * 0.72;
    var horizon = H * 0.42, floorY = H * 0.78;

    // far wall
    ctx.fillStyle = rgb(col, node.trap ? 0.35 : 0.28);
    ctx.fillRect(farL, horizon, farR - farL, floorY - horizon);
    ctx.strokeStyle = node.trap ? '#f44' : rgb(col, 1.1);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(farL, horizon); ctx.lineTo(farR, horizon);
    ctx.lineTo(farR, floorY); ctx.lineTo(farL, floorY); ctx.closePath();
    ctx.stroke();

    function wallPoly(open, side) {
      var x0 = side < 0 ? nearL : nearR;
      var x1 = side < 0 ? farL : farR;
      ctx.beginPath();
      ctx.moveTo(x0, 0); ctx.lineTo(x1, horizon); ctx.lineTo(x1, floorY); ctx.lineTo(x0, H);
      ctx.closePath();
      ctx.fillStyle = rgb(col, open ? 0.12 : 0.42);
      ctx.fill();
      ctx.strokeStyle = node.trap ? 'rgba(255,60,60,0.7)' : 'rgba(17,255,204,0.45)';
      ctx.stroke();
      if (open) {
        var dw = Math.abs(x1 - x0) * 0.42, dh = (floorY - horizon) * 0.72;
        var dx = side < 0 ? x0 + 18 : x0 - 18 - dw;
        var dy = H - dh - 28;
        ctx.fillStyle = '#010608';
        ctx.fillRect(dx, dy, dw, dh);
        ctx.strokeStyle = '#c8fff4';
        ctx.strokeRect(dx, dy, dw, dh);
        ctx.fillStyle = rgb(col, 1);
        ctx.font = '11px monospace';
        ctx.fillText(side < 0 ? '◀' : '▶', dx + dw / 2 - 6, dy + dh / 2);
      }
    }
    wallPoly(leftOpen, -1);
    wallPoly(rightOpen, 1);

    if (ahead) {
      var dw = 88, dh = 168, dx = (W - dw) / 2, dy = floorY - dh + 8;
      ctx.fillStyle = '#02080a';
      ctx.fillRect(dx, dy, dw, dh);
      ctx.strokeStyle = node.target ? '#fc3' : '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(dx, dy, dw, dh);
      ctx.fillStyle = node.target ? '#fc3' : '#1fc';
      ctx.font = '13px monospace';
      ctx.fillText('DOOR', dx + 26, dy + dh / 2);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(farL + 16, horizon + 14, farR - farL - 32, 70);
      ctx.fillStyle = '#fff';
      ctx.font = '15px monospace';
      ctx.fillText('WALL', W / 2 - 20, horizon + 54);
    }

    // floor grid
    ctx.strokeStyle = 'rgba(17,255,204,0.16)';
    ctx.lineWidth = 1;
    for (i = 0; i < 8; i++) {
      t = i / 7;
      y = H / 2 + t * t * (H / 2);
      var inset = (1 - t) * (W * 0.28);
      ctx.beginPath();
      ctx.moveTo(inset, y);
      ctx.lineTo(W - inset, y);
      ctx.stroke();
    }

    // room terminal
    ctx.fillStyle = '#02140f';
    ctx.fillRect(W / 2 - 70, floorY - 36, 140, 28);
    ctx.strokeStyle = '#1fc';
    ctx.strokeRect(W / 2 - 70, floorY - 36, 140, 28);
    ctx.fillStyle = '#1fc';
    ctx.font = '10px monospace';
    ctx.fillText(node.code || '·····', W / 2 - 28, floorY - 18);

    if (node.target) {
      ctx.strokeStyle = '#fc3';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 22, H / 2 - 10); ctx.lineTo(W / 2 + 22, H / 2 + 34);
      ctx.moveTo(W / 2 + 22, H / 2 - 10); ctx.lineTo(W / 2 - 22, H / 2 + 34);
      ctx.stroke();
      ctx.fillStyle = '#fc3';
      ctx.font = '12px monospace';
      ctx.fillText('TARGET', W / 2 - 24, H / 2 - 18);
    }
    if (node.trap) {
      ctx.fillStyle = 'rgba(255,0,0,' + (0.12 + 0.1 * Math.sin(nowMs() / 180)) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

    document.body.classList.toggle('trap-on', node.trap);
    $('hudTime').textContent = M.fmtTime(state.time);
    $('hudFace').textContent = M.facingName(state);
    $('hudXy').textContent = node.x + ',' + node.y + '  S' + node.sector;
    $('hudMoves').textContent = Math.max(0, state.moves) + ' sw';
    drawMini();
  }

  function drawMini() {
    var html = '', x, y, key, cls, face = state.facing;
    var arrow = ['▲', '▶', '▼', '◀'][face] || '·';
    for (y = 0; y < 8; y++) {
      for (x = 0; x < 8; x++) {
        key = x + ',' + y;
        cls = '';
        if (state.visited[key]) cls = 'on';
        if (x === state.x && y === state.y) cls += ' here';
        if (state.visited[key] && M.isTrap(state.net, x, y)) cls += ' trap';
        if (state.visited[key] && M.isTarget(state.net, x, y)) cls += ' tgt';
        html += '<i class="' + cls + '">' + (x === state.x && y === state.y ? arrow : '') + '</i>';
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
        : (mp.on
          ? 'Read the code. Send it, or shout it. Walk through the door ahead.'
          : 'Read the code. Switch to Navigator to nmap it. Door ahead, or turn.');
    }
  }

  function renderNavHud() {
    var el = $('navTime');
    var t = null;
    if (state && state.ticking) t = state.time;
    else if (mp.on) {
      var people = livePeople(_items), i;
      for (i = 0; i < people.length; i++) {
        if (people[i].id !== mp.id && people[i].time != null) t = people[i].time;
      }
    }
    if (t == null) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = M.fmtTime(t);
  }

  function bump() {
    if (!state) return;
    paint();
    renderTerm();
    if (mp.on) putMe();
  }

  $('turnL').onclick = function () { if (state) { M.turnLeft(state); bump(); } };
  $('turnR').onclick = function () { if (state) { M.turnRight(state); bump(); } };
  $('turnB').onclick = function () { if (state) { M.turnBack(state); bump(); } };
  $('goFwd').onclick = function () {
    if (!state) return;
    M.walkForward(state);
    bump();
  };
  $('helpBtn').onclick = function () { helpOn = !helpOn; renderTerm(); };
  $('hackBtn').onclick = function () {
    if (!state) return;
    M.hack(state);
    bump();
  };
  $('sendBtn').onclick = function () {
    if (!state || !mp.on) return;
    var node = M.here(state);
    if (!node.code) return;
    M.rememberSent(state, node.code);
    putMe();
    $('hackerStatus').textContent = 'Sent ' + node.code + ' to the navigator.';
  };

  canvas.addEventListener('click', function (e) {
    if (!state) return;
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width;
    var y = (e.clientY - r.top) / r.height;
    if (y > 0.78) M.turnBack(state);
    else if (x < 0.28) M.turnLeft(state);
    else if (x > 0.72) M.turnRight(state);
    else M.walkForward(state);
    bump();
  });

  document.addEventListener('keydown', function (e) {
    if (view === 'navigator') return;
    if (view !== 'hacker' || !state) return;
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { M.turnLeft(state); e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { M.turnRight(state); e.preventDefault(); }
    else if (k === 'ArrowDown' || k === 's' || k === 'S') { M.turnBack(state); e.preventDefault(); }
    else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') { M.walkForward(state); e.preventDefault(); }
    else if (k === 'h' || k === 'H') { helpOn = !helpOn; }
    else if (k === 'g' || k === 'G') { M.hack(state); }
    else return;
    bump();
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
  var inboxCodes = [];
  var lastMapped = '';
  var lastScoreNote = '';

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
    lastMapped = '';
    lastScoreNote = '';
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
        + "<div>DESCRIPTION</div><div class='pad'>Four ACCESS_CODEs from the HACKER. Each fills in sectors, connections, traps, or the target. 0–4 codes, case insensitive, optional 0x prefix. Pass them together: one code is one layer.</div>");
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

  function nmapAll(codes) {
    codes = M.mergeCodes(codes, []);
    if (!codes.length) return;
    var key = codes.slice().sort().join(' ');
    if (key === lastMapped) return;
    lastMapped = key;
    runCmd('nmap ' + codes.join(' '));
  }

  function fillInbox(codes, autoMap) {
    codes = M.mergeCodes(codes, []);
    inboxCodes = codes;
    if (!codes.length) { $('inbox').hidden = true; return; }
    $('inbox').hidden = false;
    $('inboxList').innerHTML = codes.map(function (c) {
      return '<button type="button" data-code="' + esc(c) + '">' + esc(c) + '</button>';
    }).join('');
    if (autoMap) nmapAll(codes);
  }

  $('inboxList').addEventListener('click', function (e) {
    var b = e.target;
    if (!b || !b.getAttribute) return;
    var c = b.getAttribute('data-code');
    if (!c) return;
    if (view !== 'navigator') return;
    nmapAll(inboxCodes.length ? inboxCodes : [c]);
  });
  $('mapAll').onclick = function () { nmapAll(inboxCodes); };

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

  function liveHacker(people) {
    var i, p;
    for (i = 0; i < (people || []).length; i++) {
      p = people[i];
      if (p && p.role === 'hacker' && p.id !== mp.id) return p;
    }
    return null;
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
      win: !!(state && state.win),
      time: state ? state.time : null
    };
    if (extra) Object.keys(extra).forEach(function (k) { row[k] = extra[k]; });
    mp.row = row;
    roomDb.put(row).catch(function () {});
  }

  $('friendBtn').onclick = mpEnter;
  function mpEnter() {
    if (!roomDb) {
      $('lobbyStatus').textContent = 'Play with a friend needs a GifOS room. Press Invite in the bar above — or play both seats on this device.';
      show('lobby');
      setChip('', 'No room');
      $('roleHacker').disabled = true;
      $('roleNav').disabled = true;
      return;
    }
    $('roleHacker').disabled = false;
    $('roleNav').disabled = false;
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
    }).catch(function () {
      $('lobbyStatus').textContent = 'Could not join the room. Try Invite in the bar, or play on this device.';
      show('lobby');
    });
  }

  function mpLeave() {
    mp.on = false;
    mp.role = null;
    if (mp.hb) { clearInterval(mp.hb); mp.hb = 0; }
    stopTick();
    if (roomDb && mp.id) roomDb.delete(mp.id).catch(function () {});
    state = null;
    show('home');
    setChip('', 'Ready');
  }

  $('lobbyLeave').onclick = mpLeave;
  $('hackerLeave').onclick = function () {
    if (mp.on) { show('lobby'); mpRefresh(); }
    else { stopTick(); state = null; show('home'); setChip('', 'Ready'); }
  };
  $('navLeave').onclick = function () {
    if (mp.on) { show('lobby'); mpRefresh(); }
    else { stopTick(); show('home'); setChip('', 'Ready'); }
  };

  $('roleHacker').onclick = function () {
    var other = liveHacker(livePeople(_items));
    if (other) {
      $('lobbyStatus').textContent = (other.name || 'Someone') + ' is already the hacker. Be the navigator — one maze, two seats.';
      return;
    }
    mp.role = 'hacker';
    putMe({ role: 'hacker' });
    startHacker(state);
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
    if (mp.role === 'nav' || view === 'navigator') {
      renderInbox(people);
      renderNavHud();
    }
  }

  function renderLobby(people) {
    var html = '', i, p, otherH = liveHacker(people);
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
    } else if (otherH && mp.role !== 'hacker') {
      $('lobbyStatus').textContent = people.length + ' here. ' + (otherH.name || 'Someone') + ' is the hacker — be the navigator.';
    } else {
      $('lobbyStatus').textContent = people.length + ' here. Pick a seat. One hacker, one navigator.';
    }
    $('roleHacker').disabled = !!(otherH && mp.role !== 'hacker');
    setChip('ready', people.length + ' here');
  }

  function renderInbox(people) {
    var codes = [], i, p, j, seen = {}, score = null, over = false, win = false;
    for (i = 0; i < people.length; i++) {
      p = people[i];
      if (p.id === mp.id) continue;
      if (p.codes && p.codes.length) {
        for (j = 0; j < p.codes.length; j++) {
          if (!seen[p.codes[j]]) { seen[p.codes[j]] = 1; codes.push(p.codes[j]); }
        }
      }
      if (p.score) score = p.score;
      if (p.over) over = true;
      if (p.win) win = true;
    }
    fillInbox(codes, true);
    if (score && termEl && score !== lastScoreNote) {
      lastScoreNote = score;
      $('inbox').hidden = false;
      p('<span class="color-green">Hacker sent a score code: ' + esc(score) + ' — try <b>top ' + esc(score) + ' TEAM</b></span>');
    }
    if (over && !win && termEl && view === 'navigator' && lastScoreNote !== 'lost') {
      lastScoreNote = 'lost';
      p('<span class="color-red">The locator found the hacker. Lost in CYBERSPACE.</span>');
    }
  }

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (view === 'hacker' || view === 'navigator') {
        if (mp.on) { show('lobby'); mpRefresh(); }
        else { stopTick(); state = null; show('home'); setChip('', 'Ready'); }
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
