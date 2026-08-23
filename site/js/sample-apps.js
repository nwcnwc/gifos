/*
 * sample-apps.js — Seed apps, packed into real App GIFs at first run so the
 * desktop isn't empty. Each is a tiny app authored against `window.gifos`.
 * Attaches to `GifOS.samples`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});

  const NOTES_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:15px system-ui;margin:0;background:#faf9ff;color:#1a1a2e}
  header{background:linear-gradient(135deg,#7b5cff,#ff5caa);color:#fff;padding:14px 18px;font-weight:700}
  form{display:flex;gap:8px;padding:14px 18px}
  input{flex:1;padding:9px 12px;border:1px solid #d5d0f0;border-radius:8px;font:inherit}
  button{padding:9px 14px;border:0;border-radius:8px;background:#7b5cff;color:#fff;cursor:pointer;font:inherit}
  ul{list-style:none;margin:0;padding:0 18px 18px}
  li{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fff;border:1px solid #eee;border-radius:8px;margin-bottom:8px}
  li span{flex:1;cursor:pointer}
  li.done span{text-decoration:line-through;color:#aaa}
  li button{background:none;border:none;color:#999;cursor:pointer;padding:4px 6px;line-height:0}
  li button:hover{color:#c22}
  li button svg{pointer-events:none}
  .empty{color:#999;padding:0 18px}
  .hint{color:#bbb;font-size:12px;padding:0 18px 10px}
</style>
<header>Notes</header>
<form id="f"><input id="t" placeholder="Write a note and press Add…" autocomplete="off"><button>Add</button></form>
<div class="hint">Tap a note to check it off.</div>
<ul id="list"></ul>
<script>
  const db = gifos.db('notes'), list = document.getElementById('list');
  let me = { name: 'You' };
  let notes = [];
  if (window.gifos) gifos.me().then(m => { me = { id: m.id, name: m.name || 'You' }; });
  const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const DEL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'; // the standard GifOS row-delete glyph
  function render(items){
    notes = items;
    list.innerHTML = items.length
      ? items.map(n => '<li'+(n.done?' class="done"':'')+'><span data-t="'+n.id+'">'+esc(n.text)+' <small style="color:#999">— '+esc(n.by||'?')+'</small></span><button data-id="'+n.id+'" title="Delete">' + DEL + '</button></li>').join('')
      : '<div class="empty">No notes yet. Your notes persist in this GIF icon.</div>';
  }
  db.subscribe(render);
  document.getElementById('f').onsubmit = async e => {
    e.preventDefault();
    const t = document.getElementById('t');
    if (t.value.trim()) { await db.put({ text: t.value.trim(), by: me.name, done: false }); t.value=''; }
  };
  list.onclick = async e => {
    if (e.target.dataset.id) { await db.delete(e.target.dataset.id); return; }
    const tid = e.target.dataset.t || (e.target.closest('span') && e.target.closest('span').dataset.t);
    if (tid) { const n = notes.find(x => x.id === tid); if (n) await db.put(Object.assign({}, n, { done: !n.done })); }
  };
</script>`;

  const GUESTBOOK_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:15px system-ui;margin:0;background:#0a0a0f;color:#e0e0f0}
  header{background:#14141f;border-bottom:1px solid #2a2a3f;padding:14px 18px;font-weight:700;color:#7b5cff}
  .hint{color:#8888aa;font-size:12px;padding:8px 18px}
  form{display:flex;gap:8px;padding:8px 18px 14px;flex-wrap:wrap}
  input{padding:9px 12px;border:1px solid #2a2a3f;border-radius:8px;font:inherit;background:#1c1c2b;color:#e0e0f0}
  #name{width:130px}#msg{flex:1;min-width:160px}
  button{padding:9px 14px;border:0;border-radius:8px;background:#7b5cff;color:#fff;cursor:pointer;font:inherit}
  ul{list-style:none;margin:0;padding:0 18px 18px}
  li{padding:10px 12px;background:#14141f;border:1px solid #2a2a3f;border-radius:8px;margin-bottom:8px}
  li b{color:#ff5caa}
</style>
<header>Shared Guestbook</header>
<div class="hint" id="hint">Press Invite and share the link — everyone signs with their screen name.</div>
<form id="f">
  <input id="msg" placeholder="Say something…" autocomplete="off">
  <button>Sign</button>
</form>
<div style="display:flex;gap:6px;padding:0 18px 10px" id="stamps"></div>
<ul id="list"></ul>
<script>
  const db = gifos.db('entries'), list = document.getElementById('list');
  ['💜','','⭐','🌈','✍️','🐸'].forEach(function(s){
    const b=document.createElement('button'); b.type='button'; b.textContent=s;
    b.style.cssText='background:#1c1c2b;border:1px solid #2a2a3f;font-size:17px;padding:5px 9px;border-radius:8px;cursor:pointer';
    b.onclick=function(){ const m=document.getElementById('msg'); m.value+=s; m.focus(); };
    document.getElementById('stamps').appendChild(b);
  });
  let me = { name: 'You' };
  if (window.gifos) gifos.me().then(m => { me = { id: m.id, name: m.name || 'You' };
    document.getElementById('hint').textContent = 'Signing as ' + me.name + '. Press Invite to sign with friends.'; });
  const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function render(items){
    list.innerHTML = items.map(e => '<li><b>'+esc(e.by||'anon')+'</b>: '+esc(e.msg)+'</li>').reverse().join('');
  }
  db.subscribe(render);
  document.getElementById('f').onsubmit = async e => {
    e.preventDefault();
    const msg = document.getElementById('msg');
    if (msg.value.trim()) { await db.put({ by: me.name, msg: msg.value.trim() }); msg.value=''; }
  };
</script>`;

  const TICTACTOE_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:16px system-ui;margin:0;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:14px 18px;font-weight:700;color:var(--accent,#5cff7b);box-sizing:border-box}
  .status{margin:16px 0 4px;font-size:15px;color:var(--muted,#8888aa);min-height:22px}
  .board{display:grid;grid-template-columns:repeat(3,88px);grid-template-rows:repeat(3,88px);gap:8px;margin:14px 0}
  .cell{background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:12px;font-size:44px;font-weight:800;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none}
  .cell:hover{border-color:var(--accent,#5cff7b)}
  .cell.x{color:var(--accent,#7b5cff)}.cell.o{color:var(--accent2,#ff5caa)}
  .cell.win{background:color-mix(in srgb,var(--accent,#5cff7b) 24%,var(--surface,#233a18));border-color:var(--accent,#5cff7b)}
  .score{color:var(--text,#e0e0f0);font-size:14px;margin-top:2px}
  button{margin:10px 0 24px;padding:9px 20px;border:0;border-radius:8px;background:var(--accent,#5cff7b);color:var(--onaccent,#0a0a0f);cursor:pointer;font:inherit;font-weight:700}
  .ask{margin:-6px 0 22px;color:var(--muted,#8888aa);text-align:center;padding:0 12px;min-height:1px}
  .ask button{margin:6px 5px 0;padding:7px 15px}
  .ask .no{background:var(--surface,#14141f);color:var(--text,#e0e0f0);border:1px solid var(--border,#2a2a3f)}
</style>
<header>Tic-Tac-Toe</header>
<div class="status" id="status">Loading…</div>
<div class="score" id="score"></div>
<div class="board" id="board"></div>
<button id="new">New game</button>
<div class="ask" id="ask"></div>
<script>
  const db = gifos.db('game');
  const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const fresh = () => ({ id:'board', cells:[null,null,null,null,null,null,null,null,null], turn:'X', starts:'X', winner:null, line:null, players:{}, names:{}, score:{X:0,O:0,D:0} });
  let current = fresh();
  let askLocal = false;   // solo confirm-before-reset flag (local, never shared)
  let me = { id: 'local', name: 'You' };
  if (window.gifos) gifos.me().then(function(m){ me = { id: m.id, name: m.name || 'You' }; render(); });
  const boardEl = document.getElementById('board'), statusEl = document.getElementById('status');
  function lineOf(c){ for (const w of WINS) if (c[w[0]] && c[w[0]]===c[w[1]] && c[w[0]]===c[w[2]]) return w; return null; }
  function winnerOf(c){ const l=lineOf(c); if(l) return c[l[0]];
    return c.every(Boolean) ? 'draw' : null; }
  function myMark(){ return current.players.X===me.id ? 'X' : current.players.O===me.id ? 'O' : null; }
  function opponentPresent(){
    return (current.players.X && current.players.X!==me.id) || (current.players.O && current.players.O!==me.id);
  }
  function canPlayTurn(){
    if (current.winner) return false;
    if (!opponentPresent()) return true;          // alone → hot-seat, play both marks
    const mm = myMark();
    if (mm) return current.turn === mm;           // real opponent → locked to my seat
    return !current.players[current.turn];        // unseated → may take the still-open seat on its turn
  }
  function label(s){ return current.names && current.names[s] ? current.names[s] : (s==='X'||s==='O'? s : ''); }
  function render(){
    boardEl.innerHTML = '';
    const playable = canPlayTurn();
    current.cells.forEach(function(v,i){
      const d = document.createElement('div');
      d.className = 'cell' + (v ? ' ' + v.toLowerCase() : '');
      d.textContent = v || '';
      d.onclick = async function(){
        if (current.cells[i] || !canPlayTurn()) return;
        if (current.rematch) delete current.rematch;   // a move supersedes any pending new-game request
        askLocal = false;
        const seat = current.turn;
        current.players = Object.assign({}, current.players); current.players[seat] = current.players[seat] || me.id;
        current.names = Object.assign({}, current.names); if (current.players[seat]===me.id) current.names[seat] = me.name;
        current.cells = current.cells.slice(); current.cells[i] = seat;
        current.winner = winnerOf(current.cells);
        current.line = lineOf(current.cells);
        if (current.winner){ const sc = Object.assign({X:0,O:0,D:0}, current.score);
          sc[current.winner==='draw'?'D':current.winner]++; current.score = sc; }
        current.turn = seat === 'X' ? 'O' : 'X';
        await db.put(current);
        render();
      };
      if (current.line && current.line.indexOf(i) >= 0) d.classList.add('win');
      boardEl.appendChild(d);
    });
    const vs = 'X: ' + label('X') + '  ·  O: ' + label('O');
    statusEl.textContent = current.winner === 'draw' ? 'Draw! Tap New game. — ' + vs
      : current.winner ? label(current.winner) + ' (' + current.winner + ') wins! — ' + vs
      : (playable ? 'Your move (' + current.turn + ')' : 'Waiting for ' + (label(current.turn) || current.turn)) + '  —  ' + vs;
    const sc = Object.assign({X:0,O:0,D:0}, current.score);
    document.getElementById('score').textContent = 'Series — X: ' + sc.X + ' · O: ' + sc.O + ' · draws: ' + sc.D;
    renderConsent();
  }
  db.subscribe(function(items){ const b = items.find(function(x){ return x.id === 'board'; }); if (b) current = b; render(); });
  // "New game" wipes the shared board, so it is guarded. With a real opponent
  // present it needs their consent (the request rides the shared board doc);
  // playing solo it still asks a local yes/no to guard against a fat-finger
  // reset. Either way an untouched board just starts fresh, and the series
  // score / alternating starter always carry over.
  function startNew(){
    askLocal = false;
    const nxt = fresh();
    nxt.score = Object.assign({X:0,O:0,D:0}, current.score);
    nxt.starts = current.starts === 'X' ? 'O' : 'X'; nxt.turn = nxt.starts;
    nxt.players = current.players; nxt.names = current.names;
    return db.put(nxt);   // fresh() carries no rematch flag, so this also clears any pending request
  }
  function clearRematch(){ const c = Object.assign({}, current); delete c.rematch; current = c; return db.put(c).then(render); }
  function cancelLocal(){ askLocal = false; render(); }
  function askButtons(askEl, text, onYes, onNo){
    const span = document.createElement('span'); span.textContent = text;
    const yes = document.createElement('button'); yes.textContent = 'Start new game'; yes.onclick = onYes;
    const no = document.createElement('button'); no.className = 'no'; no.textContent = 'Keep playing'; no.onclick = onNo;
    askEl.appendChild(span); askEl.appendChild(yes); askEl.appendChild(no);
  }
  function renderConsent(){
    const askEl = document.getElementById('ask'), btn = document.getElementById('new');
    askEl.textContent = '';
    const req = current.rematch;
    if (req && req.by !== me.id){                 // opponent asked — I decide
      btn.style.display = 'none';
      askButtons(askEl, (req.name ? req.name : 'Your opponent') + ' wants to start a new game. ', startNew, clearRematch);
    } else if (req){                              // my own request — waiting on the opponent
      btn.textContent = 'Cancel request'; btn.style.display = '';
      askEl.textContent = 'Waiting for the other player to accept a new game…';
    } else if (askLocal){                         // solo — confirm before wiping the board
      btn.style.display = 'none';
      askButtons(askEl, 'Start a new game? ', startNew, cancelLocal);
    } else {
      btn.textContent = 'New game'; btn.style.display = '';
    }
  }
  document.getElementById('new').onclick = function(){
    if (current.rematch && current.rematch.by === me.id) return clearRematch();   // cancel my pending request
    if (opponentPresent()){                                                       // real opponent — ask them to consent
      const c = Object.assign({}, current); c.rematch = { by: me.id, name: me.name }; current = c;
      return db.put(c).then(render);
    }
    askLocal = true; render();                                                    // solo — always confirm (fat-finger guard)
  };
  render();
</script>`;

  const CONNECT_FOUR_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:15px system-ui;margin:0;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;box-sizing:border-box;background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:14px 18px;font-weight:700;color:var(--accent,#ffb43c)}
  .status{margin:14px 0 6px;color:var(--muted,#8888aa);min-height:20px;text-align:center;padding:0 12px}
  /* The blue board + red/yellow discs are Connect Four's universal identity —
     they read on any computer's background, so only the chrome follows the theme. */
  .grid{display:grid;grid-template-columns:repeat(7,44px);gap:6px;background:#12203a;padding:10px;border-radius:12px;margin:6px 0}
  .cell{width:44px;height:44px;border-radius:50%;background:var(--bg,#0a0a0f);cursor:pointer}
  .cell.r{background:#ff5c5c}.cell.y{background:#ffd23c}
  .cell.win{box-shadow:0 0 0 4px var(--accent,#5cff7b) inset,0 0 10px var(--accent,#5cff7b)}
  .score{color:var(--text,#e0e0f0);font-size:14px}
  button{margin:12px;padding:9px 18px;border:0;border-radius:8px;background:var(--accent,#ffb43c);color:var(--onaccent,#0a0a0f);font-weight:700;cursor:pointer}
  .ask{margin:0 0 12px;color:var(--muted,#8888aa);text-align:center;padding:0 12px;min-height:1px}
  .ask button{margin:6px 5px 0;padding:7px 15px}
  .ask .no{background:var(--surface,#14141f);color:var(--text,#e0e0f0);border:1px solid var(--border,#2a2a3f)}
</style>
<header>Connect Four</header>
<div class="status" id="status">Loading…</div>
<div class="score" id="score"></div>
<div class="grid" id="grid"></div>
<button id="new">New game</button>
<div class="ask" id="ask"></div>
<script>
  const db = gifos.db('game'), W=7, H=6;
  const fresh = () => ({ id:'board', cells:new Array(W*H).fill(null), turn:'R', starts:'R', winner:null, line:null, players:{}, names:{}, score:{R:0,Y:0,D:0} });
  let cur = fresh(), me = { id:'local', name:'You' }, askLocal = false;   // askLocal: solo confirm-before-reset flag (local, never shared)
  if (window.gifos) gifos.me().then(function(m){ me={id:m.id,name:m.name||'You'}; render(); });
  const gridEl = document.getElementById('grid'), statusEl = document.getElementById('status');
  function opp(){ return (cur.players.R&&cur.players.R!==me.id)||(cur.players.Y&&cur.players.Y!==me.id); }
  function myMark(){ return cur.players.R===me.id?'R':cur.players.Y===me.id?'Y':null; }
  function canPlay(){ if(cur.winner) return false; if(!opp()) return true; const mm=myMark(); return mm?cur.turn===mm:!cur.players[cur.turn]; }
  function label(s){ return cur.names&&cur.names[s]?cur.names[s]:s; }
  function win(cells){
    const dirs=[[1,0],[0,1],[1,1],[1,-1]];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const c=cells[y*W+x]; if(!c) continue;
      for(const d of dirs){ const run=[y*W+x]; for(let k=1;k<4;k++){ const nx=x+d[0]*k,ny=y+d[1]*k; if(nx<0||nx>=W||ny<0||ny>=H||cells[ny*W+nx]!==c) break; run.push(ny*W+nx); } if(run.length>=4) return {mark:c,cells:run}; } }
    return cells.every(Boolean)?{mark:'draw',cells:[]}:null;
  }
  function drop(col){
    if(!canPlay()) return;
    let row=-1; for(let y=H-1;y>=0;y--){ if(!cur.cells[y*W+col]){ row=y; break; } }
    if(row<0) return;
    if(cur.rematch) delete cur.rematch;   // a move supersedes any pending new-game request
    askLocal=false;
    const seat=cur.turn;
    cur.players=Object.assign({},cur.players); cur.players[seat]=cur.players[seat]||me.id;
    cur.names=Object.assign({},cur.names); if(cur.players[seat]===me.id) cur.names[seat]=me.name;
    cur.cells=cur.cells.slice(); cur.cells[row*W+col]=seat;
    const w=win(cur.cells);
    cur.winner=w?w.mark:null; cur.line=w?w.cells:null;
    if(cur.winner){ const sc=Object.assign({R:0,Y:0,D:0},cur.score); sc[cur.winner==='draw'?'D':cur.winner]++; cur.score=sc; }
    cur.turn=seat==='R'?'Y':'R';
    db.put(cur); render();
  }
  function render(){
    gridEl.innerHTML='';
    for(let i=0;i<W*H;i++){ const d=document.createElement('div'); const v=cur.cells[i];
      d.className='cell'+(v?' '+v.toLowerCase():'');
      if(cur.line&&cur.line.indexOf(i)>=0) d.classList.add('win');
      d.onclick=function(){ drop(i%W); }; gridEl.appendChild(d); }
    const vs='🔴 '+label('R')+'  vs  🟡 '+label('Y');
    statusEl.textContent = cur.winner==='draw'?'Draw! — '+vs
      : cur.winner?label(cur.winner)+' wins! — '+vs
      : (canPlay()?'Your move':'Waiting for '+label(cur.turn))+'  —  '+vs;
    const sc=Object.assign({R:0,Y:0,D:0},cur.score);
    document.getElementById('score').textContent='Series — 🔴 '+sc.R+' · 🟡 '+sc.Y+' · draws: '+sc.D;
    renderConsent();
  }
  db.subscribe(function(items){ const b=items.find(function(x){return x.id==='board';}); if(b) cur=b; render(); });
  // "New game" wipes the shared board, so it is guarded. With a real opponent
  // present it needs their consent (the request rides the shared board doc);
  // playing solo it still asks a local yes/no to guard against a fat-finger
  // reset. Either way an untouched board just starts fresh, and the series
  // score / alternating starter always carry over.
  function startNew(){
    askLocal=false;
    const nxt=fresh();
    nxt.score=Object.assign({R:0,Y:0,D:0},cur.score);
    nxt.starts=cur.starts==='R'?'Y':'R'; nxt.turn=nxt.starts;
    nxt.players=cur.players; nxt.names=cur.names;
    return db.put(nxt);   // fresh() carries no rematch flag, so this also clears any pending request
  }
  function clearRematch(){ const c=Object.assign({},cur); delete c.rematch; cur=c; return db.put(c).then(render); }
  function cancelLocal(){ askLocal=false; render(); }
  function askButtons(askEl,text,onYes,onNo){
    const span=document.createElement('span'); span.textContent=text;
    const yes=document.createElement('button'); yes.textContent='Start new game'; yes.onclick=onYes;
    const no=document.createElement('button'); no.className='no'; no.textContent='Keep playing'; no.onclick=onNo;
    askEl.appendChild(span); askEl.appendChild(yes); askEl.appendChild(no);
  }
  function renderConsent(){
    const askEl=document.getElementById('ask'), btn=document.getElementById('new');
    askEl.textContent='';
    const req=cur.rematch;
    if(req && req.by!==me.id){                    // opponent asked — I decide
      btn.style.display='none';
      askButtons(askEl,(req.name?req.name:'Your opponent')+' wants to start a new game. ',startNew,clearRematch);
    } else if(req){                              // my own request — waiting on the opponent
      btn.textContent='Cancel request'; btn.style.display='';
      askEl.textContent='Waiting for the other player to accept a new game…';
    } else if(askLocal){                         // solo — confirm before wiping the board
      btn.style.display='none';
      askButtons(askEl,'Start a new game? ',startNew,cancelLocal);
    } else {
      btn.textContent='New game'; btn.style.display='';
    }
  }
  document.getElementById('new').onclick=function(){
    if(cur.rematch && cur.rematch.by===me.id) return clearRematch();   // cancel my pending request
    if(opp()){                                                         // real opponent — ask them to consent
      const c=Object.assign({},cur); c.rematch={by:me.id,name:me.name}; cur=c;
      return db.put(c).then(render);
    }
    askLocal=true; render();                                          // solo — always confirm (fat-finger guard)
  };
  render();
</script>`;

  const CHAT_HTML = `<!doctype html><meta charset="utf-8">
<style>
  *{box-sizing:border-box} html,body{height:100%}
  body{font:15px system-ui;margin:0;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);display:flex;flex-direction:column}
  header{background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:14px 18px;font-weight:700;color:var(--accent,#5cdcb4)}
  #log{flex:1;overflow-y:auto;padding:14px 18px;display:flex;flex-direction:column;gap:8px}
  .m{max-width:80%;padding:8px 12px;border-radius:12px;background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f)}
  .m.mine{align-self:flex-end;background:color-mix(in srgb,var(--accent,#5cdcb4) 18%,var(--surface,#173a30));border-color:var(--accent,#2a5a48)}
  .m b{color:var(--accent,#5cdcb4);font-size:12px;display:block;margin-bottom:2px}
  .m small{color:var(--muted,#667);font-size:10px;margin-left:6px;font-weight:400}
  .m .st{font-size:10px;color:var(--muted,#889);margin-left:5px;font-weight:400}
  .m .st.ok{color:var(--accent,#5cdcb4)}
  .m .st.fail{color:#ffb86c;cursor:pointer}
  .m img{display:block;max-width:100%;border-radius:8px;margin-top:4px}
  .m a.file{display:inline-flex;gap:6px;align-items:center;color:var(--accent,#5cdcb4);margin-top:4px;text-decoration:none;border:1px solid var(--accent,#2a5a48);border-radius:8px;padding:6px 10px}
  .m .fsz{color:var(--muted,#889);font-size:11px;font-weight:400}
  form{display:flex;gap:8px;padding:12px 18px;border-top:1px solid var(--border,#2a2a3f)}
  input{flex:1;padding:10px 12px;border:1px solid var(--border,#2a2a3f);border-radius:8px;background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0);font:inherit}
  button{padding:10px 16px;border:0;border-radius:8px;background:var(--accent,#5cdcb4);color:var(--onaccent,#04231b);font-weight:700;cursor:pointer}
  #att{background:var(--surface,#1c1c2b);padding:10px 12px}
  #ai{background:var(--surface,#1c1c2b);padding:10px 12px}
  #ai:disabled{opacity:.6;cursor:default}
  .quick{display:flex;gap:4px;padding:0 18px 8px}
  .quick button{background:var(--surface,#1c1c2b);font-size:18px;padding:6px 10px}
</style>
<header>Chat</header>
<div id="log"></div>
<div class="quick" id="quick"></div>
<form id="f"><button type="button" id="att" title="Attach a photo or file">📎</button><input type="file" id="fi" hidden><input id="t" placeholder="Message… (press Invite to chat with friends)" autocomplete="off"><button type="button" id="ai" title="Draft a reply with YOUR AI — it fills the box for you to review and edit; it never sends">✨</button><button>Send</button></form>
<script>
  const db=gifos.db('messages'), fdb=gifos.db('files'), log=document.getElementById('log');
  // Attachments ride gifos.db. The runtime fragments oversized messages, but
  // subscribers re-download a whole collection on every change — so file
  // bytes are base64-chunked (CS chars ≈ 64KB raw each) into the separate
  // 'files' collection, fetched lazily by id and never in the hot getAll
  // fan-out, and capped at MAX bytes (the relay-fallback path is bandwidth-
  // throttled by design). Images are shrunk to fit automatically.
  const MAX=256*1024, CS=87000, MAXCHUNKS=16;
  let me={id:'local',name:'You'}, last=[];
  if(window.gifos) gifos.me().then(function(m){ me={id:m.id,name:m.name||'You'}; });
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function hhmm(t){ if(!t) return ''; const d=new Date(t); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); }
  function fmt(n){ n=+n||0; return n>=1e6?(n/1e6).toFixed(1)+' MB':n>=1024?Math.round(n/1024)+' KB':n+' B'; }
  function b64(bytes){ let s=''; for(let i=0;i<bytes.length;i+=8192) s+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192)); return btoa(s); }
  const atts={}; // att id -> data URL | 'loading' | 'gone'
  function fetchAtt(m){
    atts[m.att]='loading';
    (async function(){
      try{
        const n=m.n|0; if(n<1||n>MAXCHUNKS) throw 0;
        const parts=[];
        for(let i=0;i<n;i++){ const c=await fdb.get(m.att+':'+i); if(!c||typeof c.data!=='string') throw 0; parts.push(c.data); }
        // Records arrive from other players: whitelist-sanitize everything
        // that gets interpolated into markup (mime + base64 payload).
        const mime=String(m.mime||'application/octet-stream').replace(/[^a-zA-Z0-9/.+-]/g,'');
        atts[m.att]='data:'+mime+';base64,'+parts.join('').replace(/[^A-Za-z0-9+/=]/g,'');
      }catch(e){ atts[m.att]='gone'; }
      paint();
    })();
  }
  function body(m){
    if(m.kind!=='file') return esc(m.text);
    const a=atts[m.att];
    if(!a||a==='loading') return '<span class="fsz">⏳ '+esc(m.name)+' ('+fmt(m.size)+')…</span>';
    if(a==='gone') return '<span class="fsz">📎 '+esc(m.name)+' — attachment unavailable</span>';
    if(String(m.mime).indexOf('image/')===0) return '<img src="'+a+'" alt="'+esc(m.name)+'">';
    return '<a class="file" download="'+esc(m.name)+'" href="'+a+'">📄 '+esc(m.name)+' <span class="fsz">'+fmt(m.size)+'</span></a>';
  }
  // Optimistic sends with delivery receipts: your message appears the moment
  // you hit Send (🕓 = on its way), flips to ✓ when the HOST's browser has
  // stored it, and ⚠️ lets you tap to resend if the host stays unreachable.
  // Without this, a backgrounded host makes your own message invisible to you.
  let pend=[]; // own messages not yet confirmed in the shared db
  function mark(m){
    if(m.uid!==me.id||m.kind==='file') return '';
    if(m.state==='sending') return '<span class="st" title="Sending…">🕓</span>';
    if(m.state==='failed') return '<span class="st fail" title="Not delivered — tap to resend">⚠️ tap to resend</span>';
    return '<span class="st ok" title="Received by the host">✓</span>';
  }
  function paint(){
    const seen={}; last.forEach(function(m){ if(m.id!=null) seen[m.id]=1; });
    pend=pend.filter(function(p){ return !seen[p.id]; });
    const items=last.concat(pend).sort(function(a,b){return (a.t||0)-(b.t||0);});
    log.innerHTML=items.map(function(m){ return '<div class="m'+(m.uid===me.id?' mine':'')+'"'+(m.state==='failed'?' data-retry="'+esc(m.id)+'"':'')+'><b>'+esc(m.by||'anon')+'<small>'+hhmm(m.t)+'</small>'+mark(m)+'</b>'+body(m)+'</div>'; }).join('');
    log.scrollTop=log.scrollHeight;
    items.forEach(function(m){ if(m.kind==='file'&&m.att&&!atts[m.att]) fetchAtt(m); });
  }
  db.subscribe(function(items){ last=items; paint(); });
  function sendText(text){
    const rec={ id:'m'+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36), by:me.name, uid:me.id, text:text, t:Date.now() };
    const p=Object.assign({state:'sending'},rec);
    pend.push(p); paint();
    db.put(rec).then(function(){ p.state='sent'; paint(); },function(){ p.state='failed'; paint(); });
  }
  log.addEventListener('click',function(ev){
    const el=ev.target.closest?ev.target.closest('.m[data-retry]'):null; if(!el) return;
    const p=pend.find(function(x){ return x.id===el.getAttribute('data-retry')&&x.state==='failed'; }); if(!p) return;
    p.state='sending'; paint();
    db.put({id:p.id,by:p.by,uid:p.uid,text:p.text,t:p.t}).then(function(){ p.state='sent'; paint(); },function(){ p.state='failed'; paint(); });
  });
  ['👍','❤️','😂','🎉','😮','🔥'].forEach(function(e){
    const b=document.createElement('button'); b.type='button'; b.textContent=e;
    b.onclick=function(){ sendText(e); };
    document.getElementById('quick').appendChild(b);
  });
  document.getElementById('f').onsubmit=function(e){ e.preventDefault();
    const t=document.getElementById('t'); if(!t.value.trim()) return;
    sendText(t.value.trim()); t.value='';
  };
  // ---- AI draft: write a reply with MY OWN AI, but never send it ----
  // A deliberate demo of GifOS's per-person key model: this runs entirely in
  // THIS browser and uses the AI model + key I set up in Settings — not the
  // host's, not anyone else's. Everyone in a shared chat drafts with their own.
  // It only FILLS the box; I review, edit, and press Send myself.
  const aiBtn=document.getElementById('ai');
  if(aiBtn){
    if(!(window.gifos&&gifos.ai)) aiBtn.style.display='none';
    else aiBtn.onclick=async function(){
      const t=document.getElementById('t'); const PH=t.getAttribute('placeholder');
      aiBtn.disabled=true; const glyph=aiBtn.textContent; aiBtn.textContent='…';
      try{
        // Recent conversation as chat turns: others are 'user' (named so the
        // model can follow a group thread), my own past lines are 'assistant'.
        const convo=(last||[]).filter(function(m){return m.kind!=='file'&&m.text;}).slice(-16)
          .map(function(m){ return m.uid===me.id
            ? {role:'assistant',content:String(m.text)}
            : {role:'user',content:(m.by?m.by+': ':'')+String(m.text)}; });
        const messages=[{role:'system',content:'You are helping '+(me.name||'me')+' write their next message in a casual chat. Read the conversation and draft a short, natural reply in their voice — usually one or two sentences. If someone asked something, answer it. No greetings unless they fit, no quotation marks, no preamble or explanation: output ONLY the message text.'}].concat(convo);
        if(!convo.length) messages.push({role:'user',content:'(The chat is empty. Write a friendly one-line opener to get it started.)'});
        // Prefer a cheap/fast model for a throwaway draft; fall back to whatever I configured.
        let model='cheapest';
        try{ const mm=await gifos.ai.models(); const av=(mm&&mm.available)||[];
          model = av.indexOf('cheapest')>=0?'cheapest':(av.indexOf('smartest')>=0?'smartest':'cheapest'); }catch(_){ }
        const r=await gifos.ai.chat({model:model,messages:messages,maxTokens:160,temperature:0.7,hint:'Draft a chat reply'});
        const text=String((r&&r.text)||'').trim().replace(/^["']+|["']+$/g,'').trim();
        if(text){ t.value=text; t.focus(); try{ t.setSelectionRange(t.value.length,t.value.length); }catch(_){ } }
        else { t.setAttribute('placeholder','The AI returned nothing — try again.'); setTimeout(function(){ t.setAttribute('placeholder',PH); },4000); }
      }catch(err){
        // A missing model pops the runtime's own Settings prompt (NOT_CONFIGURED);
        // anything else we surface briefly in the placeholder, then restore it.
        const msg=String(err&&err.message||err);
        if(!/NOT_CONFIGURED/.test(msg)){
          // A user opt-out (Abilities panel) comes back as a plain sentence — show it
          // as-is; anything else gets the generic prefix.
          const friendly=/turned .*off|Abilities panel/i.test(msg)?msg:('AI draft failed: '+msg.slice(0,60));
          t.setAttribute('placeholder',friendly.slice(0,90)); setTimeout(function(){ t.setAttribute('placeholder',PH); },5000);
        }
      }finally{ aiBtn.disabled=false; aiBtn.textContent=glyph; }
    };
  }
  // ---- attachments ----
  const fi=document.getElementById('fi'), attBtn=document.getElementById('att');
  attBtn.onclick=function(){ fi.click(); };
  fi.onchange=function(){ if(fi.files&&fi.files[0]) sendFile(fi.files[0]); };
  function shrink(file){ return new Promise(function(res,rej){
    const url=URL.createObjectURL(file), img=new Image();
    img.onload=function(){
      URL.revokeObjectURL(url);
      const attempt=function(scale,q){
        const c=document.createElement('canvas');
        c.width=Math.max(1,Math.round(img.width*scale)); c.height=Math.max(1,Math.round(img.height*scale));
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        c.toBlob(function(b){
          if(b&&b.size<=MAX) return res(b);
          if(q>0.55) return attempt(scale,q-0.15);
          if(scale>0.12) return attempt(scale*0.6,0.8);
          rej(new Error('too big'));
        },'image/jpeg',q);
      };
      attempt(Math.min(1,1280/Math.max(img.width,img.height)),0.85);
    };
    img.onerror=function(){ URL.revokeObjectURL(url); rej(new Error('unreadable')); };
    img.src=url;
  }); }
  async function sendFile(f){
    attBtn.disabled=true; attBtn.textContent='⏳';
    try{
      let blob=f, mime=f.type||'application/octet-stream', name=f.name||'file';
      if(mime.indexOf('image/')===0 && f.size>MAX){
        try{ blob=await shrink(f); mime='image/jpeg'; const dot=name.lastIndexOf('.'); name=(dot>0?name.slice(0,dot):name)+'.jpg'; }
        catch(e){ alert('That image could not be shrunk to fit — attachments are capped at '+fmt(MAX)+'.'); return; }
      }
      if(blob.size>MAX){ alert('Attachments here are capped at '+fmt(MAX)+' (images are shrunk automatically). For big files, share them in a Meeting instead — transfers there go direct, peer to peer.'); return; }
      const B=b64(new Uint8Array(await blob.arrayBuffer()));
      const n=Math.max(1,Math.ceil(B.length/CS));
      const att='a'+Date.now().toString(36)+Math.floor(Math.random()*1e6).toString(36);
      for(let i=0;i<n;i++) await fdb.put({ id:att+':'+i, data:B.slice(i*CS,(i+1)*CS) });
      await db.put({ by:me.name, uid:me.id, kind:'file', att:att, n:n, name:name, mime:mime, size:blob.size, t:Date.now() });
    } finally { attBtn.disabled=false; attBtn.textContent='📎'; fi.value=''; }
  }
</script>`;

  const PAINT_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:14px system-ui;margin:0;background:#0a0a0f;color:#e0e0f0;display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;box-sizing:border-box;background:#14141f;border-bottom:1px solid #2a2a3f;padding:14px 18px;font-weight:700;color:#ff5caa}
  .board{display:grid;grid-template-columns:repeat(16,var(--px,20px));gap:1px;background:#2a2a3f;padding:1px;margin:14px;touch-action:none;--px:min(20px,5.2vw)}
  .px{width:var(--px,20px);height:var(--px,20px);background:#14141f}
  .palette{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;padding:0 12px}
  .sw{width:26px;height:26px;border-radius:6px;cursor:pointer;border:2px solid transparent}
  .sw.sel{border-color:#fff}
  button{margin:12px;padding:8px 16px;border:0;border-radius:8px;background:#ff5caa;color:#fff;cursor:pointer}
</style>
<header>Paint — draw together</header>
<div class="palette" id="pal"></div>
<div class="board" id="board"></div>
<button id="clear">Clear</button>
<script>
  const db=gifos.db('canvas'), N=16, COLORS=['#14141f','#ff5c5c','#ff8f3c','#ffd23c','#5cff7b','#5cdcb4','#5cc8ff','#7b5cff','#ff5caa','#a06a4a','#8888aa','#ffffff'];
  let board={ id:'board', cells:new Array(N*N).fill(0) }, color=1, painting=false, pending=false;
  const boardEl=document.getElementById('board'), palEl=document.getElementById('pal');
  COLORS.forEach(function(c,i){ const s=document.createElement('div'); s.className='sw'+(i===1?' sel':''); s.style.background=c;
    s.onclick=function(){ color=i; palEl.querySelectorAll('.sw').forEach(function(x){x.classList.remove('sel');}); s.classList.add('sel'); }; palEl.appendChild(s); });
  const cellEls=[];
  for(let i=0;i<N*N;i++){ const d=document.createElement('div'); d.className='px'; cellEls.push(d);
    const paint=function(){ if(board.cells[i]===color) return; board.cells=board.cells.slice(); board.cells[i]=color; d.style.background=COLORS[color]; schedule(); };
    d.addEventListener('pointerdown',function(e){ e.preventDefault(); painting=true; paint(); });
    d.addEventListener('pointerenter',function(){ if(painting) paint(); });
    boardEl.appendChild(d); }
  window.addEventListener('pointerup',function(){ painting=false; });
  function schedule(){ if(pending) return; pending=true; setTimeout(function(){ pending=false; db.put(board); }, 60); }
  function render(){ for(let i=0;i<N*N;i++) cellEls[i].style.background=COLORS[board.cells[i]||0]; }
  db.subscribe(function(items){ const b=items.find(function(x){return x.id==='board';}); if(b){ board=b; render(); } });
  document.getElementById('clear').onclick=function(){ board={id:'board',cells:new Array(N*N).fill(0)}; render(); db.put(board); };
</script>`;

  // The Calculator is a GRAPHING calculator in the Desmos idiom: an expression
  // list that graphs as you type. Everything below is self-contained (the
  // sandbox has no network): hand-rolled tokenizer/parser (no regex escapes —
  // this source lives inside a template literal), an AST interpreter (no eval,
  // srcdoc CSP-safe), sliders, explicit/implicit/polar plots via adaptive
  // sampling + marching squares, and inequality shading. Plain arithmetic rows
  // still answer inline (= 7), so the old four-function calculator lives on as
  // the degenerate case. Expressions share over the room lane (calc, RW); the
  // viewport is per-person (prefs, PRIV) so guests pan freely.
  const CALCULATOR_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box}
  body{font:14px system-ui;margin:0;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);height:100vh;display:flex;flex-direction:column;overflow:hidden}
  header{background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:8px 14px;font-weight:700;color:var(--accent,#5cc8ff);flex:none}
  #wrap{flex:1;display:flex;min-height:0}
  #side{width:290px;flex:none;display:flex;flex-direction:column;border-right:1px solid var(--border,#2a2a3f);background:var(--surface,#101018)}
  #rows{flex:1;overflow-y:auto;min-height:0}
  .row{display:flex;align-items:flex-start;gap:6px;padding:6px 8px;border-bottom:1px solid var(--border,#1c1c2b)}
  .sw{width:18px;height:18px;border-radius:50%;flex:none;margin-top:5px;cursor:pointer;border:2px solid transparent}
  .sw.off{background:transparent!important;border-color:var(--muted,#8888aa)}
  .mid{flex:1;min-width:0}
  .row input.ex{width:100%;background:transparent;border:0;outline:0;color:var(--text,#e0e0f0);font:16px ui-monospace,Menlo,monospace;padding:4px 0}
  .val{color:var(--muted,#8888aa);font:13px ui-monospace,monospace;padding-bottom:2px}
  .err{color:#ff7878;font-size:12px;padding-bottom:2px}
  .del{flex:none;background:none;border:0;color:var(--muted,#8888aa);font-size:16px;cursor:pointer;padding:2px 6px;margin-top:3px}
  .del:hover{color:#ff7878}
  .sl{display:flex;align-items:center;gap:6px;padding:2px 0 4px}
  .sl input[type=range]{flex:1;accent-color:var(--accent,#5cc8ff)}
  .sl input[type=number]{width:58px;background:var(--bg,#0a0a0f);border:1px solid var(--border,#2a2a3f);border-radius:5px;color:var(--text,#e0e0f0);font-size:12px;padding:2px 4px}
  .sl .play{background:none;border:1px solid var(--border,#2a2a3f);border-radius:5px;color:var(--text,#e0e0f0);cursor:pointer;font-size:12px;padding:2px 7px}
  .sl .play.on{background:var(--accent,#5cc8ff);color:var(--onaccent,#04223a);border-color:transparent}
  #addrow{flex:none;margin:8px;padding:8px;border:1px dashed var(--border,#2a2a3f);border-radius:8px;background:none;color:var(--muted,#8888aa);cursor:pointer;font:inherit}
  #addrow:hover{color:var(--text,#e0e0f0);border-color:var(--accent,#5cc8ff)}
  #keypad{flex:none;display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:6px;border-top:1px solid var(--border,#2a2a3f)}
  #keypad button{padding:7px 0;border:1px solid var(--border,#1c1c2b);border-radius:6px;background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0);font-size:14px;cursor:pointer}
  #keypad button:hover{background:var(--border,#26263a)}
  #gwrap{flex:1;position:relative;min-width:0}
  #g{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab}
  #gbtns{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;gap:6px}
  #gbtns button{width:34px;height:34px;border-radius:8px;border:1px solid var(--border,#2a2a3f);background:var(--surface,#14141f);color:var(--text,#e0e0f0);font-size:17px;cursor:pointer;opacity:.9}
  @media (max-width:640px){ #wrap{flex-direction:column-reverse} #side{width:100%;height:45%;border-right:0;border-top:1px solid var(--border,#2a2a3f)} }
</style>
<header>Calculator</header>
<div id="wrap">
  <div id="side">
    <div id="rows"></div>
    <button id="addrow">+ expression</button>
    <div id="keypad"></div>
  </div>
  <div id="gwrap">
    <canvas id="g"></canvas>
    <div id="gbtns"><button id="zin">+</button><button id="zout">−</button><button id="zhome" title="Reset view">⌂</button></div>
  </div>
</div>
<script>
'use strict';
// ---------- expression language ----------
var FN1={sin:Math.sin,cos:Math.cos,tan:Math.tan,asin:Math.asin,acos:Math.acos,atan:Math.atan,
  sinh:Math.sinh,cosh:Math.cosh,tanh:Math.tanh,sqrt:Math.sqrt,abs:Math.abs,ln:Math.log,
  log:function(v){return Math.log(v)/Math.LN10;},exp:Math.exp,floor:Math.floor,ceil:Math.ceil,
  round:Math.round,sign:Math.sign};
var FN2={min:Math.min,max:Math.max,atan2:Math.atan2,mod:function(a,b){return a-b*Math.floor(a/b);},
  nroot:function(n,v){return v<0&&n%2===1?-Math.pow(-v,1/n):Math.pow(v,1/n);}};
var CONST={pi:Math.PI,tau:2*Math.PI,e:Math.E};
var RESERVED={x:1,y:1,r:1,theta:1};
function isDigit(c){return c>='0'&&c<='9';}
function isAlpha(c){return (c>='a'&&c<='z')||(c>='A'&&c<='Z');}
// Pretty glyphs the keypad (or a paste from anywhere) may contain.
function pre(s){
  s=s.split('π').join(' pi ');s=s.split('θ').join(' theta ');s=s.split('τ').join(' tau ');
  s=s.split('×').join('*');s=s.split('÷').join('/');s=s.split('−').join('-');
  s=s.split('≤').join('<=');s=s.split('≥').join('>=');s=s.split('²').join('^2');s=s.split('³').join('^3');
  s=s.split('√').join('sqrt');
  return s;
}
// Greedy longest-known-name match inside letter runs, single letters otherwise:
// "xsin(x)" is x*sin(x), "ab" is a*b unless "ab" is a defined name.
function tokenize(src,names){
  var t=[],i=0,s=pre(src),n=s.length;
  while(i<n){
    var c=s[i];
    if(c===' '||c==='\t'){i++;continue;}
    if(isDigit(c)||(c==='.'&&isDigit(s[i+1]||''))){
      var j=i;while(j<n&&(isDigit(s[j])||s[j]==='.'))j++;
      t.push({t:'num',v:parseFloat(s.slice(i,j))});i=j;continue;
    }
    if(isAlpha(c)){
      var j2=i;while(j2<n&&isAlpha(s[j2]))j2++;
      var run=s.slice(i,j2),k=0;
      while(k<run.length){
        var hit=null,L;
        for(L=run.length-k;L>=2;L--){var cand=run.substr(k,L);if(names[cand]){hit=cand;break;}}
        if(hit){t.push({t:'id',v:hit});k+=hit.length;}
        else{t.push({t:'id',v:run[k]});k++;}
      }
      i=j2;continue;
    }
    if(c==='<'||c==='>'){if(s[i+1]==='='){t.push({t:'op',v:c+'='});i+=2;}else{t.push({t:'op',v:c});i++;}continue;}
    if('+-*/^=(),!'.indexOf(c)>=0){t.push({t:'op',v:c});i++;continue;}
    throw new Error('unexpected "'+c+'"');
  }
  return t;
}
function parse(src,names){
  var toks=tokenize(src,names),p=0;
  function peek(){return toks[p];}
  function next(){return toks[p++];}
  function expect(v){var tk=next();if(!tk||tk.t!=='op'||tk.v!==v)throw new Error('expected "'+v+'"');}
  function atomStarts(tk){return tk&&(tk.t==='num'||tk.t==='id'||(tk.t==='op'&&tk.v==='('));}
  function parseAtom(){
    var tk=next();
    if(!tk)throw new Error('unexpected end');
    if(tk.t==='num')return{t:'num',v:tk.v};
    if(tk.t==='id'){
      if(peek()&&peek().t==='op'&&peek().v==='('&&(FN1[tk.v]||FN2[tk.v]||names['fn:'+tk.v])){
        next();var args=[parseCmpFree()];
        while(peek()&&peek().t==='op'&&peek().v===','){next();args.push(parseCmpFree());}
        expect(')');return{t:'call',f:tk.v,a:args};
      }
      return{t:'var',v:tk.v};
    }
    if(tk.t==='op'&&tk.v==='('){
      var a=parseCmpFree();
      if(peek()&&peek().t==='op'&&peek().v===','){next();var b=parseCmpFree();expect(')');return{t:'point',x:a,y:b};}
      expect(')');return{t:'paren',a:a};
    }
    throw new Error('unexpected "'+(tk.v!==undefined?tk.v:tk.t)+'"');
  }
  function parsePost(){
    var a=parseAtom();
    while(peek()&&peek().t==='op'&&peek().v==='!'){next();a={t:'call',f:'fact',a:[a]};}
    return a;
  }
  function parsePow(){
    var a=parsePost();
    if(peek()&&peek().t==='op'&&peek().v==='^'){next();return{t:'bin',op:'^',l:a,r:parseUnary()};}
    return a;
  }
  function parseUnary(){
    if(peek()&&peek().t==='op'&&peek().v==='-'){next();return{t:'neg',a:parseUnary()};}
    if(peek()&&peek().t==='op'&&peek().v==='+'){next();return parseUnary();}
    return parsePow();
  }
  function parseMul(){
    var a=parseUnary();
    for(;;){
      var tk=peek();
      if(tk&&tk.t==='op'&&(tk.v==='*'||tk.v==='/')){next();a={t:'bin',op:tk.v,l:a,r:parseUnary()};}
      else if(atomStarts(tk)){a={t:'bin',op:'*',l:a,r:parseUnary()};}
      else break;
    }
    return a;
  }
  function parseAdd(){
    var a=parseMul();
    for(;;){
      var tk=peek();
      if(tk&&tk.t==='op'&&(tk.v==='+'||tk.v==='-')){next();a={t:'bin',op:tk.v,l:a,r:parseMul()};}
      else break;
    }
    return a;
  }
  function parseCmpFree(){return parseAdd();}
  function parseCmp(){
    var a=parseAdd(),tk=peek();
    if(tk&&tk.t==='op'&&(tk.v==='='||tk.v==='<'||tk.v==='>'||tk.v==='<='||tk.v==='>=')){
      next();return{t:'bin',op:tk.v,l:a,r:parseAdd()};
    }
    return a;
  }
  var ast=parseCmp();
  if(p<toks.length)throw new Error('unexpected "'+toks[p].v+'"');
  return ast;
}
function fact(v){if(v<0||v!==Math.floor(v)||v>170)return NaN;var r=1;for(var i=2;i<=v;i++)r*=i;return r;}
function ev(n,env,depth){
  depth=depth||0;if(depth>64)return NaN;
  switch(n.t){
    case 'num':return n.v;
    case 'paren':return ev(n.a,env,depth);
    case 'neg':return -ev(n.a,env,depth);
    case 'var':
      if(n.v in env.vars)return env.vars[n.v];
      if(n.v in CONST)return CONST[n.v];
      return NaN;
    case 'bin':{
      var l=ev(n.l,env,depth),r=ev(n.r,env,depth);
      switch(n.op){case '+':return l+r;case '-':return l-r;case '*':return l*r;case '/':return l/r;
        case '^':return Math.pow(l,r);default:return NaN;}
    }
    case 'call':{
      if(n.f==='fact')return fact(ev(n.a[0],env,depth));
      if(FN1[n.f]&&n.a.length===1)return FN1[n.f](ev(n.a[0],env,depth));
      if(FN2[n.f]&&n.a.length===2)return FN2[n.f](ev(n.a[0],env,depth),ev(n.a[1],env,depth));
      if(FN2.min&&(n.f==='min'||n.f==='max')&&n.a.length>2){
        var vs=n.a.map(function(a){return ev(a,env,depth);});
        return n.f==='min'?Math.min.apply(null,vs):Math.max.apply(null,vs);
      }
      var fd=env.funcs[n.f];
      if(fd&&fd.params.length===n.a.length){
        var vars2={},k2;for(k2 in env.vars)vars2[k2]=env.vars[k2];
        for(var q=0;q<fd.params.length;q++)vars2[fd.params[q]]=ev(n.a[q],env,depth);
        return ev(fd.node,{vars:vars2,funcs:env.funcs},depth+1);
      }
      return NaN;
    }
    case 'point':return NaN;
  }
  return NaN;
}
function varsOf(n,set){
  if(!n)return set;
  if(n.t==='var'&&!(n.v in CONST))set[n.v]=1;
  if(n.a){if(Array.isArray(n.a))n.a.forEach(function(c){varsOf(c,set);});else varsOf(n.a,set);}
  if(n.l)varsOf(n.l,set);if(n.r)varsOf(n.r,set);if(n.x)varsOf(n.x,set);if(n.y)varsOf(n.y,set);
  return set;
}
// ---------- rows / model ----------
var PALETTE=['#4d8ee0','#e05a52','#4fb860','#9a6ee0','#f0913a','#3fc0c8','#e05aa8','#c9c94a'];
var rows=[];            // {id, s(source), hidden, el pieces}
var sliders={};         // name -> {v,min,max,step,anim}
var funcs={};           // name -> {params, node}
var plots=[];           // per visible row: classified plot object
var stats={curves:0,segs:0};
var rid=1;
function newRow(s){return{id:'r'+(rid++)+'_'+Math.random().toString(36).slice(2,7),s:s||'',hidden:false};}
// LHS "name =" scan (top level, not <=/>=/==): returns trimmed LHS or null.
function defLHS(s){
  var i,dep=0;s=pre(s);
  for(i=0;i<s.length;i++){
    var c=s[i];
    if(c==='(')dep++;else if(c===')')dep--;
    else if(c==='='&&dep===0){
      var prev=s[i-1]||'',nx=s[i+1]||'';
      if(prev==='<'||prev==='>'||prev==='!'||nx==='=')return null;
      return{lhs:s.slice(0,i).trim(),rhs:s.slice(i+1)};
    }
  }
  return null;
}
function isIdent(s){if(!s.length)return false;for(var i=0;i<s.length;i++)if(!isAlpha(s[i]))return false;return true;}
function nameSet(){
  var names={};var k;
  for(k in FN1)names[k]=1;for(k in FN2)names[k]=1;for(k in CONST)names[k]=1;
  names.theta=1;
  for(k in sliders)names[k]=1;
  for(k in funcs){names[k]=1;names['fn:'+k]=1;}
  return names;
}
// Pass 1: collect definitions (sliders + functions) so pass 2 can parse with
// the right name set. Sliders may reference each other — iterate to settle.
function collectDefs(){
  funcs={};
  var keep={},r,d,i;
  for(i=0;i<rows.length;i++){
    r=rows[i];d=defLHS(r.s);if(!d)continue;
    var m=d.lhs.indexOf('(');
    if(m>0&&d.lhs[d.lhs.length-1]===')'){
      var fn=d.lhs.slice(0,m).trim(),ps=d.lhs.slice(m+1,-1).split(',').map(function(v){return v.trim();});
      if(isIdent(fn)&&!FN1[fn]&&!FN2[fn]&&ps.every(isIdent))funcs[fn]={params:ps,node:null,rhs:d.rhs,row:r.id};
    } else if(isIdent(d.lhs)&&!RESERVED[d.lhs]&&!FN1[d.lhs]&&!FN2[d.lhs]&&!(d.lhs in CONST)){
      keep[d.lhs]={rhs:d.rhs,row:r.id};
    }
  }
  // parse function bodies with full name set (functions may call each other)
  var names=nameSet();var k;
  for(k in keep)names[k]=1;
  for(k in funcs){names[k]=1;names['fn:'+k]=1;}
  for(k in funcs){
    try{funcs[k].node=parse(funcs[k].rhs,names);}catch(e){funcs[k].node=null;funcs[k].err=e.message;}
  }
  // settle slider values (3 rounds covers slider-referencing-slider chains)
  var next={},round,name;
  for(round=0;round<3;round++){
    for(name in keep){
      var vsrc=keep[name],node;
      try{node=parse(vsrc.rhs,names);}catch(e){continue;}
      var vs=varsOf(node,{});var ok=true,vn;
      for(vn in vs)if(!(vn in next)&&!(vn in sliders)){ok=false;break;}
      if(!ok)continue;
      var vars={},sk;for(sk in sliders)vars[sk]=sliders[sk].v;for(sk in next)vars[sk]=next[sk];
      var val=ev(node,{vars:vars,funcs:funcs});
      if(isFinite(val))next[name]=val;
    }
  }
  // keep slider UI state (min/max/anim) for names that survive; adopt values
  // for NEW sliders only — an existing slider's value belongs to its handle.
  var out={};
  for(name in keep){
    if(!(name in next))continue;
    if(sliders[name]){out[name]=sliders[name];out[name].def=keep[name].row;}
    else{
      var v=next[name];
      var lo=Math.min(-10,Math.floor(v)),hi=Math.max(10,Math.ceil(v));
      out[name]={v:v,min:lo,max:hi,step:0.1,anim:false,def:keep[name].row};
    }
  }
  sliders=out;
}
function classify(r){
  var names=nameSet();
  var ast;
  try{ast=parse(r.s,names);}catch(e){return{kind:'err',msg:e.message};}
  var d=defLHS(r.s);
  if(d&&isIdent(d.lhs)&&sliders[d.lhs]&&sliders[d.lhs].def===r.id)return{kind:'slider',name:d.lhs};
  if(d){
    var m=d.lhs.indexOf('(');
    if(m>0&&d.lhs[d.lhs.length-1]===')'){
      var fn=d.lhs.slice(0,m).trim();
      if(funcs[fn]&&funcs[fn].row===r.id){
        if(funcs[fn].err)return{kind:'err',msg:funcs[fn].err};
        if(funcs[fn].params.length===1)return{kind:'explicit',node:{t:'call',f:fn,a:[{t:'var',v:funcs[fn].params[0]}]},pv:funcs[fn].params[0]};
        return{kind:'def'};
      }
    }
  }
  if(ast.t==='bin'&&(ast.op==='='||ast.op==='<'||ast.op==='>'||ast.op==='<='||ast.op==='>=')){
    var lv=varsOf(ast.l,{}),rv=varsOf(ast.r,{});
    var F={t:'bin',op:'-',l:ast.l,r:ast.r};
    if(ast.op==='='){
      if(ast.l.t==='var'&&ast.l.v==='y'&&!rv.y)return{kind:'explicit',node:ast.r,pv:'x'};
      if(ast.l.t==='var'&&ast.l.v==='x'&&!rv.x)return{kind:'sideways',node:ast.r};
      if(ast.l.t==='var'&&ast.l.v==='r')return{kind:'polar',node:ast.r};
      return{kind:'implicit',node:F};
    }
    return{kind:'region',node:F,op:ast.op};
  }
  if(ast.t==='point')return{kind:'point',node:ast};
  var vs=varsOf(ast,{});
  if(vs.theta)return{kind:'polar',node:ast};
  if(vs.y&&!vs.x)return{kind:'sideways',node:ast};
  if(vs.x||vs.y)return vs.y?{kind:'implicit',node:ast}:{kind:'explicit',node:ast,pv:'x'};
  var env=envNow();
  var val=ev(ast,env);
  return{kind:'value',v:val};
}
function envNow(){var vars={},k;for(k in sliders)vars[k]=sliders[k].v;return{vars:vars,funcs:funcs};}
// ---------- viewport / canvas ----------
var cv=document.getElementById('g'),ctx=cv.getContext('2d');
var view={cx:0,cy:0,ppu:40};  // pixels per unit; equal aspect
var W=0,H=0,DPR=1;
function resize(){
  DPR=window.devicePixelRatio||1;
  W=cv.clientWidth;H=cv.clientHeight;
  cv.width=Math.max(1,Math.round(W*DPR));cv.height=Math.max(1,Math.round(H*DPR));
  draw();
}
function sx(x){return (x-view.cx)*view.ppu+W/2;}
function sy(y){return H/2-(y-view.cy)*view.ppu;}
function ux(px){return (px-W/2)/view.ppu+view.cx;}
function uy(py){return (H/2-py)/view.ppu+view.cy;}
function niceStep(target){
  var raw=target/view.ppu,p=Math.pow(10,Math.floor(Math.log(raw)/Math.LN10)),m=raw/p;
  return (m<1.5?1:m<3.5?2:m<7.5?5:10)*p;
}
function fmtTick(v,step){
  if(Math.abs(v)<step/1e6)return '0';
  var d=Math.max(0,-Math.floor(Math.log(step)/Math.LN10)+0.5|0);
  var s=Math.abs(v)>=1e6||Math.abs(v)<1e-5?v.toExponential(2):v.toFixed(Math.min(6,d));
  if(s.indexOf('.')>=0){s=s.split('');while(s[s.length-1]==='0')s.pop();if(s[s.length-1]==='.')s.pop();s=s.join('');}
  return s;
}
function fmtVal(v){
  if(!isFinite(v))return String(v);
  var s=String(Math.round(v*1e10)/1e10);
  return s;
}
function theme(name,fb){var v=getComputedStyle(document.body).getPropertyValue(name).trim();return v||fb;}
function draw(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,W,H);
  var bg=theme('--bg','#0a0a0f'),grid=theme('--border','#2a2a3f'),txt=theme('--muted','#8888aa'),axis=theme('--text','#e0e0f0');
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  var step=niceStep(80),minor=step/(String(step)[0]==='2'?4:5);
  var x0=ux(0),x1=ux(W),y1=uy(0),y0=uy(H),i,v;
  ctx.lineWidth=1;
  ctx.strokeStyle=grid;ctx.globalAlpha=0.35;
  ctx.beginPath();
  for(v=Math.ceil(x0/minor)*minor;v<=x1;v+=minor){ctx.moveTo(sx(v),0);ctx.lineTo(sx(v),H);}
  for(v=Math.ceil(y0/minor)*minor;v<=y1;v+=minor){ctx.moveTo(0,sy(v));ctx.lineTo(W,sy(v));}
  ctx.stroke();
  ctx.globalAlpha=0.8;ctx.beginPath();
  for(v=Math.ceil(x0/step)*step;v<=x1;v+=step){ctx.moveTo(sx(v),0);ctx.lineTo(sx(v),H);}
  for(v=Math.ceil(y0/step)*step;v<=y1;v+=step){ctx.moveTo(0,sy(v));ctx.lineTo(W,sy(v));}
  ctx.stroke();
  ctx.globalAlpha=1;
  ctx.strokeStyle=axis;ctx.lineWidth=1.5;ctx.beginPath();
  ctx.moveTo(0,sy(0));ctx.lineTo(W,sy(0));ctx.moveTo(sx(0),0);ctx.lineTo(sx(0),H);ctx.stroke();
  ctx.fillStyle=txt;ctx.font='11px system-ui';
  var ax=Math.min(Math.max(sy(0),12),H-4),ay=Math.min(Math.max(sx(0),4),W-30);
  for(v=Math.ceil(x0/step)*step;v<=x1;v+=step){if(Math.abs(v)>step/1e6)ctx.fillText(fmtTick(v,step),sx(v)+3,ax-3);}
  for(v=Math.ceil(y0/step)*step;v<=y1;v+=step){if(Math.abs(v)>step/1e6)ctx.fillText(fmtTick(v,step),ay+4,sy(v)-3);}
  // plots
  stats={curves:0,segs:0};
  var env=envNow(),pi2;
  for(i=0;i<plots.length;i++){
    var P=plots[i];if(!P||P.hidden)continue;
    var col=P.color;
    if(P.kind==='region')drawRegion(P,env,col);
  }
  for(i=0;i<plots.length;i++){
    var P2=plots[i];if(!P2||P2.hidden)continue;
    var c2=P2.color;
    if(P2.kind==='explicit')drawExplicit(P2,env,c2,false);
    else if(P2.kind==='sideways')drawExplicit(P2,env,c2,true);
    else if(P2.kind==='polar')drawPolar(P2,env,c2);
    else if(P2.kind==='implicit')drawImplicit(P2,env,c2);
    else if(P2.kind==='point')drawPoint(P2,env,c2);
  }
}
function drawExplicit(P,env,col,side){
  var n=Math.max(64,Math.ceil((side?H:W)/2)),i,started=false,prev=null;
  ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.beginPath();
  var lim=4*(side?(ux(W)-ux(0)):(uy(0)-uy(H)));
  for(i=0;i<=n;i++){
    var t=side?uy(H)+(uy(0)-uy(H))*i/n:ux(0)+(ux(W)-ux(0))*i/n;
    env.vars[side?'y':P.pv||'x']=t;
    var o=ev(P.node,env);
    var px=side?sx(o):sx(t),py=side?sy(t):sy(o);
    if(isFinite(o)&&Math.abs(o)<1e9){
      if(started&&prev!==null&&Math.abs(o-prev)>lim){ctx.stroke();ctx.beginPath();started=false;}
      if(!started){ctx.moveTo(px,py);started=true;}else ctx.lineTo(px,py);
      prev=o;
    } else {if(started){ctx.stroke();ctx.beginPath();}started=false;prev=null;}
  }
  ctx.stroke();stats.curves++;
  delete env.vars[side?'y':P.pv||'x'];
}
function drawPolar(P,env,col){
  var n=720,i,started=false;
  ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();
  for(i=0;i<=n;i++){
    var th=i/n*2*Math.PI*2;   // two turns, so spirals and odd petals close
    env.vars.theta=th;
    var rr=ev(P.node,env);
    if(isFinite(rr)&&Math.abs(rr)<1e9){
      var px=sx(rr*Math.cos(th)),py=sy(rr*Math.sin(th));
      if(!started){ctx.moveTo(px,py);started=true;}else ctx.lineTo(px,py);
    } else started=false;
  }
  ctx.stroke();stats.curves++;
  delete env.vars.theta;
}
// marching squares over the viewport: F(x,y)=0 contour
function drawImplicit(P,env,col){
  var NX=96,NY=64,gx=new Array((NX+1)*(NY+1)),i,j;
  var xa=ux(0),xb=ux(W),ya=uy(H),yb=uy(0);
  for(j=0;j<=NY;j++)for(i=0;i<=NX;i++){
    env.vars.x=xa+(xb-xa)*i/NX;env.vars.y=ya+(yb-ya)*j/NY;
    var v=ev(P.node,env);gx[j*(NX+1)+i]=isFinite(v)?v:NaN;
  }
  delete env.vars.x;delete env.vars.y;
  ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();
  var n=0;
  function pt(i2,j2,i3,j3,va,vb){
    var t=va/(va-vb);
    var x=xa+(xb-xa)*(i2+(i3-i2)*t)/NX,y=ya+(yb-ya)*(j2+(j3-j2)*t)/NY;
    return[sx(x),sy(y)];
  }
  for(j=0;j<NY;j++)for(i=0;i<NX;i++){
    var a=gx[j*(NX+1)+i],b=gx[j*(NX+1)+i+1],c=gx[(j+1)*(NX+1)+i+1],d=gx[(j+1)*(NX+1)+i];
    if(!isFinite(a)||!isFinite(b)||!isFinite(c)||!isFinite(d))continue;
    var pts=[];
    if((a<0)!==(b<0))pts.push(pt(i,j,i+1,j,a,b));
    if((b<0)!==(c<0))pts.push(pt(i+1,j,i+1,j+1,b,c));
    if((d<0)!==(c<0))pts.push(pt(i,j+1,i+1,j+1,d,c));
    if((a<0)!==(d<0))pts.push(pt(i,j,i,j+1,a,d));
    if(pts.length>=2){ctx.moveTo(pts[0][0],pts[0][1]);ctx.lineTo(pts[1][0],pts[1][1]);n++;}
    if(pts.length===4){ctx.moveTo(pts[2][0],pts[2][1]);ctx.lineTo(pts[3][0],pts[3][1]);n++;}
  }
  ctx.stroke();stats.segs+=n;stats.curves++;
}
function drawRegion(P,env,col){
  var NX=96,NY=64,i,j;
  var xa=ux(0),xb=ux(W),ya=uy(H),yb=uy(0);
  ctx.fillStyle=col;ctx.globalAlpha=0.14;
  var cw=W/NX,ch=H/NY;
  for(j=0;j<NY;j++)for(i=0;i<NX;i++){
    env.vars.x=xa+(xb-xa)*(i+0.5)/NX;env.vars.y=ya+(yb-ya)*(j+0.5)/NY;
    var v=ev(P.node,env);
    var ok=P.op==='<'||P.op==='<='?v<0:v>0;
    if(ok)ctx.fillRect(i*cw,H-(j+1)*ch,cw+0.5,ch+0.5);
  }
  delete env.vars.x;delete env.vars.y;
  ctx.globalAlpha=1;
  // boundary: solid for <= / >=, dashed for strict
  if(P.op==='<'||P.op==='>')ctx.setLineDash([6,5]);
  drawImplicit(P,env,col);
  ctx.setLineDash([]);
}
function drawPoint(P,env,col){
  var x=ev(P.node.x,env),y=ev(P.node.y,env);
  if(!isFinite(x)||!isFinite(y))return;
  ctx.fillStyle=col;ctx.beginPath();ctx.arc(sx(x),sy(y),5,0,7);ctx.fill();
  ctx.fillStyle=theme('--text','#e0e0f0');ctx.font='11px system-ui';
  ctx.fillText('('+fmtVal(x)+', '+fmtVal(y)+')',sx(x)+8,sy(y)-8);
  stats.curves++;
}
// ---------- row UI ----------
var rowsEl=document.getElementById('rows');
var focused=null;
function rebuild(){
  collectDefs();
  plots=[];
  rowsEl.innerHTML='';
  rows.forEach(function(r,i){
    var color=PALETTE[i%PALETTE.length];
    var cls=classify(r);
    var el=document.createElement('div');el.className='row';el.dataset.rid=r.id;
    var sw=document.createElement('div');sw.className='sw'+(r.hidden?' off':'');sw.style.background=color;
    sw.title=r.hidden?'Show':'Hide';
    sw.onclick=function(){r.hidden=!r.hidden;save();rebuild();};
    var mid=document.createElement('div');mid.className='mid';
    var inp=document.createElement('input');inp.className='ex';inp.value=r.s;inp.spellcheck=false;
    inp.placeholder=i===0?'y = x^2  or  2+2':'';
    inp.autocapitalize='off';inp.autocomplete='off';
    inp.oninput=function(){r.s=inp.value;refresh();saveSoon();};
    inp.onfocus=function(){focused=inp;};
    mid.appendChild(inp);
    var meta=document.createElement('div');
    mid.appendChild(meta);
    var del=document.createElement('button');del.className='del';del.textContent='×';del.title='Delete row';
    del.onclick=function(){rows=rows.filter(function(q){return q!==r;});save();rebuild();};
    el.appendChild(sw);el.appendChild(mid);el.appendChild(del);
    rowsEl.appendChild(el);
    r._meta=meta;r._sw=sw;
    renderMeta(r,cls,color);
    if(cls.kind!=='err'&&cls.kind!=='value'&&cls.kind!=='slider'&&cls.kind!=='def'){
      plots.push({kind:cls.kind,node:cls.node,pv:cls.pv,op:cls.op,color:color,hidden:r.hidden});
    }
  });
  draw();
  syncDebug();
}
// re-classify + redraw without rebuilding the row DOM (typing must not steal focus)
function refresh(){
  collectDefs();
  plots=[];
  rows.forEach(function(r,i){
    var color=PALETTE[i%PALETTE.length];
    var cls=classify(r);
    renderMeta(r,cls,color);
    if(cls.kind!=='err'&&cls.kind!=='value'&&cls.kind!=='slider'&&cls.kind!=='def'){
      plots.push({kind:cls.kind,node:cls.node,pv:cls.pv,op:cls.op,color:color,hidden:r.hidden});
    }
  });
  draw();
  syncDebug();
}
function renderMeta(r,cls,color){
  var meta=r._meta;if(!meta)return;
  meta.innerHTML='';
  if(!r.s.trim())return;
  if(cls.kind==='err'){var e=document.createElement('div');e.className='err';e.textContent=cls.msg;meta.appendChild(e);return;}
  if(cls.kind==='value'){var v=document.createElement('div');v.className='val';v.textContent='= '+fmtVal(cls.v);meta.appendChild(v);return;}
  if(cls.kind==='slider'){
    var s=sliders[cls.name];if(!s)return;
    var sl=document.createElement('div');sl.className='sl';
    var lo=document.createElement('input');lo.type='number';lo.value=s.min;lo.title='Slider minimum';
    var rg=document.createElement('input');rg.type='range';rg.min=s.min;rg.max=s.max;rg.step=s.step;rg.value=s.v;
    var hi=document.createElement('input');hi.type='number';hi.value=s.max;hi.title='Slider maximum';
    var play=document.createElement('button');play.className='play'+(s.anim?' on':'');play.textContent='▶';play.title='Animate';
    rg.oninput=function(){
      s.v=parseFloat(rg.value);
      var inp=r._meta.parentElement.querySelector('.ex');
      var nv=cls.name+' = '+fmtVal(s.v);
      if(inp&&inp.value!==nv){inp.value=nv;r.s=nv;}
      refresh();saveSoon();
    };
    lo.onchange=function(){s.min=parseFloat(lo.value);rg.min=s.min;};
    hi.onchange=function(){s.max=parseFloat(hi.value);rg.max=s.max;};
    play.onclick=function(){s.anim=!s.anim;play.className='play'+(s.anim?' on':'');if(s.anim)animate();};
    sl.appendChild(lo);sl.appendChild(rg);sl.appendChild(hi);sl.appendChild(play);
    meta.appendChild(sl);
    r._range=rg;
    return;
  }
}
var animT=null;
function animate(){
  if(animT)return;
  var dir={};
  function tick(){
    var any=false,k;
    for(k in sliders){
      var s=sliders[k];if(!s.anim)continue;any=true;
      if(!(k in dir))dir[k]=1;
      var span=(s.max-s.min)||1;
      s.v+=dir[k]*span/240;
      if(s.v>=s.max){s.v=s.max;dir[k]=-1;}
      if(s.v<=s.min){s.v=s.min;dir[k]=1;}
      var r=rows.find(function(q){var d=defLHS(q.s);return d&&d.lhs===k;});
      if(r){var nv=k+' = '+fmtVal(Math.round(s.v*1000)/1000);r.s=nv;
        var el=rowsEl.querySelector('[data-rid="'+r.id+'"] .ex');if(el&&document.activeElement!==el)el.value=nv;
        if(r._range)r._range.value=s.v;}
    }
    if(any){refresh();animT=requestAnimationFrame(tick);}
    else animT=null;
  }
  animT=requestAnimationFrame(tick);
}
// ---------- keypad ----------
var KEYS=[['π','π'],['θ','θ'],['²','²'],['^','^'],['√','√('],['≤','≤'],['≥','≥'],
  ['x','x'],['y','y'],['(',' ('],[')',')'],['=','='],['<','<'],['>','>'],
  ['sin','sin('],['cos','cos('],['tan','tan('],['ln','ln('],['log','log('],['|a|','abs('],['!','!']];
var pad=document.getElementById('keypad');
KEYS.forEach(function(k){
  var b=document.createElement('button');b.textContent=k[0];
  b.onmousedown=function(e){e.preventDefault();};
  b.onclick=function(){
    var inp=focused||rowsEl.querySelector('.ex');
    if(!inp)return;
    var st=inp.selectionStart||inp.value.length;
    inp.value=inp.value.slice(0,st)+k[1]+inp.value.slice(inp.selectionEnd||st);
    inp.selectionStart=inp.selectionEnd=st+k[1].length;
    inp.focus();
    inp.dispatchEvent(new Event('input'));
  };
  pad.appendChild(b);
});
document.getElementById('addrow').onclick=function(){
  rows.push(newRow(''));save();rebuild();
  var inps=rowsEl.querySelectorAll('.ex');if(inps.length)inps[inps.length-1].focus();
};
// ---------- pan / zoom ----------
var drag=null,pins={};
cv.addEventListener('pointerdown',function(e){
  cv.setPointerCapture(e.pointerId);
  pins[e.pointerId]={x:e.clientX,y:e.clientY};
  var ks=Object.keys(pins);
  if(ks.length===1)drag={x:e.clientX,y:e.clientY};
  else drag=null;
});
cv.addEventListener('pointermove',function(e){
  if(!(e.pointerId in pins))return;
  var ks=Object.keys(pins);
  if(ks.length===2){
    var o=pins[e.pointerId],other=pins[ks[0]==String(e.pointerId)?ks[1]:ks[0]];
    var d0=Math.hypot(o.x-other.x,o.y-other.y);
    pins[e.pointerId]={x:e.clientX,y:e.clientY};
    var d1=Math.hypot(e.clientX-other.x,e.clientY-other.y);
    if(d0>10&&d1>10){
      var mx=(e.clientX+other.x)/2,my=(e.clientY+other.y)/2;
      zoomAt(mx,my,d1/d0);
    }
    return;
  }
  if(!drag)return;
  view.cx-=(e.clientX-drag.x)/view.ppu;
  view.cy+=(e.clientY-drag.y)/view.ppu;
  drag={x:e.clientX,y:e.clientY};
  draw();savePrefsSoon();
});
function lift(e){delete pins[e.pointerId];drag=null;var ks=Object.keys(pins);if(ks.length===1){var q=pins[ks[0]];drag={x:q.x,y:q.y};}}
cv.addEventListener('pointerup',lift);cv.addEventListener('pointercancel',lift);
cv.addEventListener('wheel',function(e){
  e.preventDefault();
  zoomAt(e.clientX-cv.getBoundingClientRect().left,e.clientY-cv.getBoundingClientRect().top,Math.pow(1.0015,-e.deltaY));
},{passive:false});
function zoomAt(px,py,f){
  f=Math.max(0.2,Math.min(5,f));
  var wx=ux(px),wy=uy(py);
  view.ppu=Math.max(1e-6,Math.min(1e7,view.ppu*f));
  view.cx=wx-(px-W/2)/view.ppu;
  view.cy=wy+(py-H/2)/view.ppu;
  draw();savePrefsSoon();
}
document.getElementById('zin').onclick=function(){zoomAt(W/2,H/2,1.5);};
document.getElementById('zout').onclick=function(){zoomAt(W/2,H/2,1/1.5);};
document.getElementById('zhome').onclick=function(){view={cx:0,cy:0,ppu:Math.max(20,W/22)};draw();savePrefsSoon();};
window.addEventListener('resize',resize);
// ---------- persistence (shared list, private viewport) ----------
var db=gifos.db('calc'),prefs=gifos.db('prefs');
var saveT=null,lastPut='';
function save(){
  var doc={id:'state',rows:rows.map(function(r){return{id:r.id,s:r.s,hidden:!!r.hidden};})};
  var j=JSON.stringify(doc);
  if(j===lastPut)return;
  lastPut=j;db.put(doc);
}
function saveSoon(){clearTimeout(saveT);saveT=setTimeout(save,500);}
var prefT=null;
function savePrefsSoon(){clearTimeout(prefT);prefT=setTimeout(function(){prefs.put({id:'view',cx:view.cx,cy:view.cy,ppu:view.ppu});},700);}
db.subscribe(function(items){
  var doc=items.find(function(d){return d.id==='state';});
  if(!doc||!doc.rows)return;
  var j=JSON.stringify(doc);
  if(j===lastPut)return;             // our own echo
  lastPut=j;
  rows=doc.rows.map(function(q){return{id:q.id,s:q.s,hidden:!!q.hidden};});
  // A collaborator's edit (or our own save echo with runtime metadata) must
  // not eat the caret: remember which row holds focus and restore it.
  var act=document.activeElement,rid2=null,caret=0;
  if(act&&act.className==='ex'){var rowEl=act.parentElement.parentElement;rid2=rowEl&&rowEl.dataset.rid;caret=act.selectionStart;}
  rebuild();
  if(rid2){
    var back=rowsEl.querySelector('[data-rid="'+rid2+'"] .ex');
    if(back){back.focus();try{back.selectionStart=back.selectionEnd=Math.min(caret,back.value.length);}catch(e){}}
  }
});
(async function boot(){
  try{
    var vs=await prefs.getAll();
    var v=vs.find(function(d){return d.id==='view';});
    if(v&&isFinite(v.ppu)){view.cx=v.cx;view.cy=v.cy;view.ppu=v.ppu;}
  }catch(e){}
  try{
    var items=await db.getAll();
    var doc=items.find(function(d){return d.id==='state';});
    if(doc&&doc.rows&&doc.rows.length){
      lastPut=JSON.stringify(doc);
      rows=doc.rows.map(function(q){return{id:q.id,s:q.s,hidden:!!q.hidden};});
    }
  }catch(e){}
  if(!rows.length){rows=[newRow('y = a sin(x)'),newRow('a = 1')];save();}
  resize();
  rebuild();
})();
// test hook: the suites read classifications and probe curves numerically
// instead of screenshot-diffing canvas pixels.
function syncDebug(){
  window.__calc={
    rows:rows.map(function(r,i){return{s:r.s,kind:classify(r).kind,hidden:!!r.hidden};}),
    sliders:Object.keys(sliders).map(function(k){return{name:k,v:sliders[k].v};}),
    stats:stats,
    evalRow:function(i,x){
      var cls=classify(rows[i]);
      if(cls.kind!=='explicit')return null;
      var env=envNow();env.vars[cls.pv||'x']=x;
      return ev(cls.node,env);
    },
  };
}
</script>`;

  const TIMER_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font:16px system-ui;margin:0;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;box-sizing:border-box;background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:14px 18px;font-weight:700;color:var(--accent,#ff7878)}
  .tabs{display:flex;gap:8px;margin:16px 0 0}
  .tabs button{padding:8px 18px;border:1px solid var(--border,#1c1c2b);border-radius:999px;background:var(--surface,#1c1c2b);color:var(--muted,#8888aa);font:inherit;font-weight:700;cursor:pointer}
  .tabs button.on{background:var(--accent,#ff7878);color:var(--onaccent,#2a0a0a);border-color:transparent}
  #t{font-size:56px;font-variant-numeric:tabular-nums;margin:28px 0 8px;letter-spacing:2px}
  #t.done{color:var(--accent,#ff7878);animation:blink .5s step-end infinite}
  @keyframes blink{50%{opacity:.25}}
  .row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin:8px 0}
  button{padding:12px 24px;border:1px solid var(--border,#1c1c2b);border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0)}
  button.go{background:var(--accent2,#5cff7b);color:var(--onaccent,#04231b);border-color:transparent}button.stop{background:var(--accent,#ff7878);color:var(--onaccent,#2a0a0a);border-color:transparent}
  .chips button{padding:8px 14px;font-size:14px;border-radius:999px}
</style>
<header>Timer &amp; Stopwatch</header>
<div class="tabs"><button id="tabS" class="on">Stopwatch</button><button id="tabT">Timer</button></div>
<div id="t">00:00.0</div>
<div class="chips row" id="presets" style="display:none">
  <button data-add="60">+1 min</button><button data-add="300">+5 min</button><button data-add="600">+10 min</button><button data-add="10">+10 s</button>
</div>
<div class="row">
  <button id="go" class="go">Start</button>
  <button id="reset">Reset</button>
</div>
<script>
  let mode='sw', running=false, base=0, elapsed=0, raf=0, left=0, target=0;
  const tEl=document.getElementById('t'), go=document.getElementById('go');
  function beep(f,ms){ try{ const C=window.AudioContext||window.webkitAudioContext; if(!C)return; window.__ac=window.__ac||new C();
    const o=__ac.createOscillator(), g=__ac.createGain(); o.frequency.value=f; g.gain.value=.15; o.connect(g); g.connect(__ac.destination);
    o.start(); setTimeout(function(){o.stop();},ms); }catch(e){} }
  function fmtSw(ms){ const m=Math.floor(ms/60000), s=Math.floor(ms/1000)%60, d=Math.floor(ms/100)%10;
    return (m<10?'0':'')+m+':'+(s<10?'0':'')+s+'.'+d; }
  function fmtT(ms){ const s=Math.max(0,Math.ceil(ms/1000)); return Math.floor(s/60)+':'+('0'+s%60).slice(-2); }
  function draw(){ if(mode==='sw'){ tEl.textContent=fmtSw(elapsed+(running?Date.now()-base:0)); }
    else { const rem=running?target-Date.now():left; tEl.textContent=fmtT(rem);
      if(running&&rem<=0){ stop(); tEl.classList.add('done'); beep(880,250); setTimeout(function(){beep(880,250);},350); setTimeout(function(){beep(660,600);},750); left=0; } }
    if(running) raf=requestAnimationFrame(draw); }
  function stop(){ if(mode==='sw'&&running) elapsed+=Date.now()-base; if(mode==='t'&&running) left=Math.max(0,target-Date.now());
    running=false; go.textContent='Start'; go.className='go'; cancelAnimationFrame(raf); }
  function start(){ if(mode==='t'&&left<=0) return; tEl.classList.remove('done');
    if(mode==='sw') base=Date.now(); else target=Date.now()+left;
    running=true; go.textContent='Pause'; go.className='stop'; draw(); }
  go.onclick=function(){ running?stop():start(); };
  document.getElementById('reset').onclick=function(){ stop(); elapsed=0; left=0; tEl.classList.remove('done'); draw0(); };
  function draw0(){ tEl.textContent=mode==='sw'?'00:00.0':fmtT(left); }
  document.getElementById('presets').onclick=function(e){ const a=e.target.dataset.add; if(!a||running) return;
    left+=a*1000; tEl.classList.remove('done'); draw0(); };
  function setMode(m){ stop(); mode=m; elapsed=0;
    document.getElementById('tabS').className=m==='sw'?'on':''; document.getElementById('tabT').className=m==='t'?'on':'';
    document.getElementById('presets').style.display=m==='t'?'flex':'none'; tEl.classList.remove('done'); draw0(); }
  document.getElementById('tabS').onclick=function(){ setMode('sw'); };
  document.getElementById('tabT').onclick=function(){ setMode('t'); };
</script>`;

  const MINESWEEPER_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:14px system-ui;margin:0;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;box-sizing:border-box;background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:14px 18px;font-weight:700;color:var(--accent,#ffd23c)}
  .bar{display:flex;gap:10px;align-items:center;margin:12px;flex-wrap:wrap;justify-content:center}
  .bar button{padding:8px 14px;border:1px solid var(--border,#2a2a3f);border-radius:8px;background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0);cursor:pointer}
  .bar button.on{background:var(--accent,#ffd23c);color:var(--onaccent,#2a2400);font-weight:700}
  .grid{display:grid;grid-template-columns:repeat(10,30px);gap:2px;touch-action:manipulation}
  /* unrevealed tiles ride a mid-tone so they stand off the board on any theme;
     revealed cells sit on the surface, numbers darken toward the text colour. */
  .c{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:4px;background:var(--border,#2a3350);cursor:pointer;font-weight:700;user-select:none}
  .c.rev{background:var(--surface,#14141f);cursor:default}
  .c.mine{background:#ff5c5c}
  .n1{color:color-mix(in srgb,#5cc8ff 60%,var(--text,#e0e0f0))}.n2{color:color-mix(in srgb,#3ac46a 60%,var(--text,#e0e0f0))}.n3{color:color-mix(in srgb,#ff8f5c 62%,var(--text,#e0e0f0))}.n4{color:color-mix(in srgb,#ff5caa 62%,var(--text,#e0e0f0))}.n5{color:color-mix(in srgb,#e0a520 62%,var(--text,#e0e0f0))}.n6{color:color-mix(in srgb,#3abfa0 62%,var(--text,#e0e0f0))}
  .status{margin:10px;min-height:20px;color:var(--muted,#8888aa);text-align:center;padding:0 12px}
</style>
<header>Minesweeper — co-op</header>
<div class="status" id="status">Loading…</div>
<div class="bar">
  <button id="mode">🚩 Flag mode: off</button>
  <button id="new">New game</button>
</div>
<div class="grid" id="grid"></div>
<script>
  const db=gifos.db('mine'), W=10, H=10, MINES=15;
  let me={id:'local',name:'You'}, flagMode=false;
  if(window.gifos) gifos.me().then(function(m){ me={id:m.id,name:m.name||'You'}; });
  const fresh=()=>({ id:'game', mines:null, rev:new Array(W*H).fill(false), flags:{}, over:false, win:false });
  let g=fresh();
  const gridEl=document.getElementById('grid'), statusEl=document.getElementById('status');
  function nbrs(i){ const x=i%W,y=(i/W|0),out=[]; for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue; const nx=x+dx,ny=y+dy; if(nx>=0&&nx<W&&ny>=0&&ny<H)out.push(ny*W+nx); } return out; }
  function count(i){ if(!g.mines)return 0; let n=0; nbrs(i).forEach(function(j){ if(g.mines.indexOf(j)>=0)n++; }); return n; }
  function genMines(safe){ const ex=[safe].concat(nbrs(safe)), m=[]; while(m.length<MINES){ const r=Math.floor(Math.random()*W*H); if(ex.indexOf(r)<0&&m.indexOf(r)<0)m.push(r); } return m; }
  function flood(i){ const st=[i]; while(st.length){ const c=st.pop(); if(g.rev[c])continue; g.rev[c]=true; if(count(c)===0&&g.mines.indexOf(c)<0) nbrs(c).forEach(function(j){ if(!g.rev[j])st.push(j); }); } }
  function reveal(i){ if(g.over||g.rev[i]||g.flags[i])return;
    if(!g.mines) g.mines=genMines(i);
    if(g.mines.indexOf(i)>=0){ g.rev[i]=true; g.over=true; g.win=false; db.put(g); render(); return; }
    flood(i);
    if(g.rev.filter(Boolean).length===W*H-MINES){ g.over=true; g.win=true; }
    db.put(g); render();
  }
  function flag(i){ if(g.over||g.rev[i])return; g.flags=Object.assign({},g.flags); if(g.flags[i])delete g.flags[i]; else g.flags[i]=me.name; db.put(g); render(); }
  function render(){
    gridEl.innerHTML='';
    for(let i=0;i<W*H;i++){ const d=document.createElement('div'); d.className='c';
      if(g.rev[i]){ d.classList.add('rev'); if(g.mines&&g.mines.indexOf(i)>=0){ d.classList.add('mine'); d.textContent='💣'; } else { const n=count(i); if(n){ d.textContent=n; d.classList.add('n'+n); } } }
      else if(g.flags[i]){ d.textContent='🚩'; d.title=g.flags[i]; }
      d.onclick=(function(k){ return function(){ flagMode?flag(k):reveal(k); }; })(i);
      d.oncontextmenu=(function(k){ return function(e){ e.preventDefault(); flag(k); }; })(i);
      // long-press = flag (phones have no right-click)
      (function(k){ let t=null, moved=false;
        d.addEventListener('pointerdown',function(){ moved=false; t=setTimeout(function(){ t=null; flag(k); },450); });
        d.addEventListener('pointermove',function(){ moved=true; if(t){clearTimeout(t);t=null;} });
        d.addEventListener('pointerup',function(e){ if(t){ clearTimeout(t); t=null; } else if(!moved){ e.preventDefault(); } });
      })(i);
      gridEl.appendChild(d); }
    statusEl.textContent = g.over ? (g.win?'Cleared! Everyone wins.':'💥 Boom! Game over — New game to retry.')
      : (g.mines?('💣 left: '+Math.max(0,MINES-Object.keys(g.flags).length)+' of '+MINES+' · long-press to flag')
                :'Tap any square to start. Long-press (or 🚩 mode) to flag. Press Invite to play together.');
  }
  document.getElementById('mode').onclick=function(){ flagMode=!flagMode; this.textContent='🚩 Flag mode: '+(flagMode?'on':'off'); this.className=flagMode?'on':''; };
  document.getElementById('new').onclick=function(){ g=fresh(); db.put(g); render(); };
  db.subscribe(function(items){ const b=items.find(function(x){return x.id==='game';}); if(b)g=b; render(); });
  render();
</script>`;

  const CHESS_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:14px system-ui;margin:0;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;box-sizing:border-box;background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:14px 18px;font-weight:700;color:var(--accent,#e8c37a)}
  .status{margin:10px;min-height:20px;color:var(--muted,#8888aa);text-align:center;padding:0 12px}
  button{padding:8px 16px;border:0;border-radius:8px;background:var(--accent,#e8c37a);color:var(--onaccent,#241a04);font-weight:700;cursor:pointer;margin:6px}
  .lobby{padding:16px;max-width:420px;text-align:center}
  .players{list-style:none;padding:0;margin:12px 0}
  .players li{padding:8px 12px;background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:8px;margin:6px 0}
  .bracket{display:flex;gap:24px;padding:16px;overflow:auto}
  .round{display:flex;flex-direction:column;gap:12px;justify-content:center}
  .match{background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:8px;padding:8px 12px;min-width:140px;cursor:pointer}
  .match.mine{border-color:var(--accent,#e8c37a)}
  .match .w{color:var(--accent,#5cff7b)}
  .settings{background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:10px;padding:10px 14px;margin:12px 0;text-align:left}
  .settings h3{margin:0 0 2px;font-size:14px;color:var(--accent,#e8c37a)}
  .settings .hint{color:var(--muted,#8888aa);font-size:12px;margin-bottom:8px}
  .settings label{display:flex;align-items:center;gap:8px;margin:8px 0;font-size:14px}
  .settings select{padding:6px 8px;border-radius:8px;background:var(--bg,#1c1c2b);color:var(--text,#e0e0f0);border:1px solid var(--border,#2a2a3f);font:inherit}
  .clock{display:flex;justify-content:center;font-variant-numeric:tabular-nums;font-weight:700;padding:4px 10px;margin:2px auto;border-radius:8px;background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);width:fit-content}
  .clock.live{border-color:var(--accent,#e8c37a);color:var(--accent,#e8c37a)}
  .clock.low{color:#ff7878}
  /* The wooden board + carved pieces are chess's universal identity; they read
     on any computer, so the theme dresses the chrome and leaves the board be. */
  .board{display:grid;grid-template-columns:repeat(8,44px);grid-template-rows:repeat(8,44px);margin:12px;border:3px solid #241a04;border-radius:4px}
  .sq{display:flex;align-items:center;justify-content:center;font-size:32px;cursor:pointer;line-height:1}
  .sq.l{background:#ecd9b5}.sq.d{background:#b08150}
  .sq.pw{color:#fffdf2;text-shadow:0 0 2px #241a04,0 1px 2px rgba(0,0,0,.55)}
  .sq.pb{color:#241a2e;text-shadow:0 0 2px rgba(255,255,255,.35)}
  .sq.sel{outline:3px solid var(--accent,#7b5cff);outline-offset:-3px}
  .sq.mv{box-shadow:inset 0 0 0 4px rgba(40,160,70,.65)}
  .sq.hintf{box-shadow:inset 0 0 0 4px rgba(120,90,255,.85)}
  .sq.hintt{box-shadow:inset 0 0 0 4px rgba(120,90,255,.85),inset 0 0 22px rgba(120,90,255,.55)}
  .hintbar{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;margin:2px 0}
  .hintbar .why{color:var(--muted,#8888aa);font-size:12.5px;max-width:340px;text-align:center}
  button.ghost{background:var(--surface,#1c1c2b);color:var(--accent,#e8c37a);border:1px solid var(--accent,#e8c37a)}
  button:disabled{opacity:.55;cursor:default}
  .back{background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0);border:1px solid var(--border,#2a2a3f)}
</style>
<header>Chess Tournament</header>
<div class="status" id="status">Loading…</div>
<div id="view"></div>
<script>
  const db=gifos.db('chess');
  let me={id:'local',name:'You'}, viewMatch=null, sel=null;
  // AI hint: {from:[x,y],to:[x,y],why} for the match currently on screen, or null.
  let hint=null, hinting=false;
  const START='rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';
  // Both sides use the FILLED glyphs and get their color from CSS (.pw/.pb):
  // the outline glyphs ♙♖… inherit whatever text color the platform font
  // picks, which made white and black pieces indistinguishable.
  const GLYPH={p:'♟',r:'♜',n:'♞',b:'♝',q:'♛',k:'♚'};
  const view=document.getElementById('view'), statusEl=document.getElementById('status');
  let T={ id:'t', players:[], started:false, rounds:[], round:0, settings:{ clock:'5+0', shuffle:true } };
  // Time controls: 'none' or 'base+inc' (minutes+seconds). Applies to EVERY
  // game in the tournament — set in the lobby, locked once play starts.
  const CLOCKS=[['none','No clock'],['1+0','Bullet 1 min'],['3+0','Blitz 3 min'],['3+2','Blitz 3|2'],['5+0','Blitz 5 min'],['5+3','Blitz 5|3'],['10+0','Rapid 10 min']];
  function clockSpec(){ const c=(T.settings&&T.settings.clock)||'none'; if(c==='none') return null;
    const p=c.split('+'); return { base:parseInt(p[0],10)*60000, inc:(parseInt(p[1],10)||0)*1000 }; }

  function save(){ return db.put(T); }
  function joinLobby(){ if(T.started) return; if(!T.players.some(function(p){return p.id===me.id;})){ T.players=T.players.concat([{id:me.id,name:me.name}]); save(); } }
  function startTournament(){
    let ps=T.players.slice(); if(ps.length<2) return;
    if(T.settings&&T.settings.shuffle){ for(let i=ps.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=ps[i]; ps[i]=ps[j]; ps[j]=t; } }
    const matches=[]; for(let i=0;i<ps.length;i+=2){ matches.push(makeMatch(ps[i], ps[i+1]||null)); }
    T.started=true; T.rounds=[matches]; T.round=0; save();
  }
  function makeMatch(a,b){ const spec=clockSpec();
    const m={ id:'m'+Math.random().toString(36).slice(2,8), a:a, b:b, board:START, turn:'w', winner:null,
      clock: spec?{ w:spec.base, b:spec.base, inc:spec.inc, last:null }:null };
    if(!b){ m.winner=a; } return m; }
  function curMatches(){ return T.rounds[T.round]||[]; }
  function advance(){
    const ms=curMatches(); if(!ms.every(function(m){return m.winner;})) return;
    const winners=ms.map(function(m){return m.winner;});
    if(winners.length===1){ save(); return; } // champion
    const next=[]; for(let i=0;i<winners.length;i+=2){ next.push(makeMatch(winners[i], winners[i+1]||null)); }
    T.rounds=T.rounds.concat([next]); T.round++; save();
  }
  // ---- chess rules (legal piece moves; king-capture wins; auto-queen) ----
  function at(bd,x,y){ return (x<0||x>7||y<0||y>7)?null:bd[y*8+x]; }
  function isW(p){ return p&&p>='A'&&p<='Z'; }
  function mine(p,color){ return p&&p!=='.'&&(color==='w'?isW(p):!isW(p)); }
  function moves(bd,x,y){
    const p=bd[y*8+x]; if(p==='.') return []; const wh=isW(p); const out=[]; const t=p.toLowerCase();
    const push=(nx,ny)=>{ const q=at(bd,nx,ny); if(q===null)return false; if(q==='.'){ out.push([nx,ny]); return true; } if(isW(q)!==wh){ out.push([nx,ny]); } return false; };
    const ray=(dx,dy)=>{ let nx=x+dx,ny=y+dy; while(push(nx,ny)){ nx+=dx; ny+=dy; } };
    if(t==='p'){ const dir=wh?-1:1, sy=wh?6:1;
      if(at(bd,x,y+dir)==='.'){ out.push([x,y+dir]); if(y===sy&&at(bd,x,y+2*dir)==='.') out.push([x,y+2*dir]); }
      [[-1,dir],[1,dir]].forEach(function(d){ const q=at(bd,x+d[0],y+d[1]); if(q&&q!=='.'&&isW(q)!==wh) out.push([x+d[0],y+d[1]]); });
    } else if(t==='n'){ [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(function(d){ const q=at(bd,x+d[0],y+d[1]); if(q!==null&&(q==='.'||isW(q)!==wh)) out.push([x+d[0],y+d[1]]); });
    } else if(t==='b'){ ray(1,1);ray(1,-1);ray(-1,1);ray(-1,-1);
    } else if(t==='r'){ ray(1,0);ray(-1,0);ray(0,1);ray(0,-1);
    } else if(t==='q'){ ray(1,1);ray(1,-1);ray(-1,1);ray(-1,-1);ray(1,0);ray(-1,0);ray(0,1);ray(0,-1);
    } else if(t==='k'){ [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].forEach(function(d){ const q=at(bd,x+d[0],y+d[1]); if(q!==null&&(q==='.'||isW(q)!==wh)) out.push([x+d[0],y+d[1]]); }); }
    return out;
  }
  function mySeat(m){ return m.a&&m.a.id===me.id?'w':m.b&&m.b.id===me.id?'b':null; }
  function remaining(m,side){ if(!m.clock) return null;
    let r=m.clock[side]; if(m.turn===side&&m.clock.last&&!m.winner) r-=Date.now()-m.clock.last; return r; }
  function flagFall(m){ // a player ran out of time — the other side wins
    if(!m.clock||m.winner) return false;
    if(remaining(m,'w')<=0){ m.winner=m.b; } else if(remaining(m,'b')<=0){ m.winner=m.a; } else return false;
    save(); advance(); render(); return true;
  }
  function doMove(m,fx,fy,tx,ty){
    const seat=mySeat(m); if(seat!==m.turn) return;
    if(m.clock){ const now=Date.now();
      if(m.clock.last){ m.clock[seat]-=now-m.clock.last; }
      if(m.clock[seat]<=0){ flagFall(m); return; }
      m.clock[seat]+=m.clock.inc||0; m.clock.last=now; }
    const bd=m.board.split(''); const p=bd[fy*8+fx]; const target=bd[ty*8+tx];
    bd[ty*8+tx]=p; bd[fy*8+fx]='.';
    if(p==='P'&&ty===0) bd[ty*8+tx]='Q'; if(p==='p'&&ty===7) bd[ty*8+tx]='q'; // auto-queen
    m.board=bd.join(''); m.turn=m.turn==='w'?'b':'w';
    if(target==='k'||target==='K'){ m.winner=seat==='w'?m.a:m.b; }
    save(); if(m.winner) advance(); sel=null; hint=null; render();
  }
  // ---- AI hint (brokered Smartest model) ------------------------------------
  // The board is unlabelled glyph divs, and LLMs invent illegal moves from
  // prose — so we hand the model a clean FEN AND the EXACT legal-move list from
  // our own generator, and constrain its answer to that list. The key never
  // leaves the runtime; the app only declared capabilities.ai:["smartest"].
  function algSq(x,y){ return 'abcdefgh'[x]+(8-y); }
  function toFEN(bd,turn){ const rows=[];
    for(let y=0;y<8;y++){ let row='',run=0;
      for(let x=0;x<8;x++){ const c=bd[y*8+x];
        if(c==='.'){ run++; } else { if(run){ row+=run; run=0; } row+=c; } }
      if(run) row+=run; rows.push(row); }
    return rows.join('/')+' '+turn+' - - 0 1';
  }
  function legalMoves(bd,turn){ const out=[];
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){ if(mine(bd[y*8+x],turn)){
      moves(bd,x,y).forEach(function(c){ out.push({uci:algSq(x,y)+algSq(c[0],c[1]), from:[x,y], to:c}); }); } }
    return out;
  }
  function askHint(m){
    const seat=mySeat(m); if(!seat||seat!==m.turn||m.winner||hinting) return;
    if(!(window.gifos&&gifos.ai)){ hint={err:'Hints need the computer’s AI.'}; render(); return; }
    const legal=legalMoves(m.board, m.turn);
    if(!legal.length){ hint={err:'No legal moves to suggest.'}; render(); return; }
    hinting=true; hint=null; render();
    const side=m.turn==='w'?'White':'Black';
    const sys='You are a strong chess coach. You are given a position as FEN plus the EXACT list of legal moves in coordinate (UCI) notation. Choose the single strongest move for '+side+'. Reply with ONLY compact JSON and nothing else: {"move":"<one move copied verbatim from the legal list>","why":"<one short plain-language sentence>"}.';
    const usr='FEN: '+toFEN(m.board,m.turn)+'\\nLegal moves: '+legal.map(function(l){return l.uci;}).join(' ')+'\\nPick the best move for '+side+'.';
    gifos.ai.chat({ model:'smartest', temperature:0, messages:[{role:'system',content:sys},{role:'user',content:usr}] })
      .then(function(r){
        const txt=((r&&r.text)||'').trim(); let uci=null, why='';
        try{ const j=JSON.parse(txt.replace(/\`\`\`json|\`\`\`/g,'').trim()); uci=String(j.move||'').trim().toLowerCase(); why=j.why||''; }catch(e){}
        if(!uci){ const mm=txt.toLowerCase().match(/[a-h][1-8][a-h][1-8]/); if(mm) uci=mm[0]; }
        let pick=legal.find(function(l){return l.uci===uci;});
        if(!pick){ pick=legal[0]; why=why||'A safe, legal option.'; } // model strayed off-list → point at a real move
        const cur=findMatch(viewMatch);
        if(cur&&cur.id===m.id&&cur.turn===m.turn&&!cur.winner) hint={ from:pick.from, to:pick.to, why:why, uci:pick.uci };
      })
      .catch(function(e){ const msg=String((e&&e.message)||e);
        hint={ err: /NOT_CONFIGURED/.test(msg) ? 'Set up your Smartest AI in Settings to get hints.' : 'Couldn’t get a hint right now.' };
      })
      .then(function(){ hinting=false; render(); });
  }
  // ---- rendering ----
  function render(){
    view.innerHTML='';
    if(!T.started){ renderLobby(); return; }
    if(viewMatch){ renderBoard(); return; }
    renderBracket();
  }
  function renderLobby(){
    const inList=T.players.some(function(p){return p.id===me.id;});
    const d=document.createElement('div'); d.className='lobby';
    d.innerHTML='<p>Join the lobby, then anyone can start. Players get paired into a single-elimination bracket — winners advance until one champion remains.</p>'+
      '<ul class="players">'+T.players.map(function(p){return '<li>'+esc(p.name)+(p.id===me.id?' (you)':'')+'</li>';}).join('')+'</ul>';
    // Tournament settings — one place, applies to every game, locked at start.
    const st=document.createElement('div'); st.className='settings';
    st.innerHTML='<h3>Tournament settings</h3><div class="hint">Apply to every game. Locked once the bracket starts.</div>';
    const row=document.createElement('label'); row.textContent='Time control ';
    const selEl=document.createElement('select');
    CLOCKS.forEach(function(c){ const o=document.createElement('option'); o.value=c[0]; o.textContent=c[1]; selEl.appendChild(o); });
    selEl.value=(T.settings&&T.settings.clock)||'none';
    selEl.onchange=function(){ T.settings=Object.assign({},T.settings,{clock:selEl.value}); save(); };
    row.appendChild(selEl); st.appendChild(row);
    const shl=document.createElement('label'); const shc=document.createElement('input'); shc.type='checkbox';
    shc.checked=!(T.settings&&T.settings.shuffle===false);
    shc.onchange=function(){ T.settings=Object.assign({},T.settings,{shuffle:shc.checked}); save(); };
    shl.appendChild(shc); shl.appendChild(document.createTextNode(' Shuffle the bracket seeding'));
    st.appendChild(shl); d.appendChild(st);
    const jb=document.createElement('button'); jb.textContent=inList?'Waiting… ('+T.players.length+' in)':'Join lobby'; jb.onclick=joinLobby;
    const sb=document.createElement('button'); sb.textContent='Start tournament'; sb.disabled=T.players.length<2; sb.onclick=startTournament;
    d.appendChild(jb); if(T.players.length>=2) d.appendChild(sb); view.appendChild(d);
    statusEl.textContent='Lobby — '+T.players.length+' player(s). Press Invite and share the link.';
  }
  function renderBracket(){
    const wrap=document.createElement('div'); wrap.className='bracket';
    T.rounds.forEach(function(ms,ri){ const rd=document.createElement('div'); rd.className='round';
      ms.forEach(function(m){ const el=document.createElement('div'); el.className='match'+((mySeat(m))?' mine':'');
        const an=m.a?m.a.name:'—', bn=m.b?m.b.name:'(bye)';
        el.innerHTML='<div class="'+(m.winner&&m.winner.id===(m.a&&m.a.id)?'w':'')+'">'+esc(an)+'</div><div class="'+(m.winner&&m.b&&m.winner.id===m.b.id?'w':'')+'">'+esc(bn)+'</div>';
        el.onclick=function(){ viewMatch=m.id; sel=null; hint=null; render(); };
        rd.appendChild(el); });
      wrap.appendChild(rd); });
    view.appendChild(wrap);
    const champ=(T.rounds[T.rounds.length-1]||[]).length===1 && T.rounds[T.rounds.length-1][0].winner;
    statusEl.textContent=champ?('🏆 Champion: '+esc(champ.name)):'Round '+(T.round+1)+' — tap a match to play or watch.';
  }
  function fmtClock(ms){ ms=Math.max(0,ms|0); const s=Math.ceil(ms/1000); return Math.floor(s/60)+':'+('0'+s%60).slice(-2); }
  function clockRow(m,side){
    const el=document.createElement('div'); el.className='clock'+(m.turn===side&&!m.winner?' live':'');
    const who=side==='w'?m.a:m.b;
    const r=remaining(m,side);
    el.textContent=(side==='w'?'⚪ ':'⚫ ')+(who?who.name:'?')+'  '+fmtClock(r);
    if(r<30000) el.classList.add('low');
    el.dataset.side=side;
    return el;
  }
  function renderBoard(){
    const m=findMatch(viewMatch); if(!m){ viewMatch=null; return render(); }
    const back=document.createElement('button'); back.className='back'; back.textContent='← Bracket'; back.onclick=function(){ viewMatch=null; sel=null; hint=null; render(); }; view.appendChild(back);
    const seat=mySeat(m); const bd=m.board;
    if(m.clock) view.appendChild(clockRow(m,'b'));
    const legal = sel ? moves(bd, sel[0], sel[1]) : [];
    const board=document.createElement('div'); board.className='board';
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){ const sq=document.createElement('div'); sq.className='sq '+(((x+y)%2)?'d':'l');
      const p=bd[y*8+x]; if(p!=='.'){ sq.textContent=GLYPH[p.toLowerCase()]; sq.classList.add(p>='A'&&p<='Z'?'pw':'pb'); }
      if(sel&&sel[0]===x&&sel[1]===y) sq.classList.add('sel');
      if(legal.some(function(c){return c[0]===x&&c[1]===y;})) sq.classList.add('mv');
      if(hint&&seat===m.turn&&!m.winner){ if(hint.from&&hint.from[0]===x&&hint.from[1]===y) sq.classList.add('hintf'); if(hint.to&&hint.to[0]===x&&hint.to[1]===y) sq.classList.add('hintt'); }
      sq.onclick=(function(cx,cy){ return function(){
        if(m.winner||seat!==m.turn) return;
        if(sel){ if(legal.some(function(c){return c[0]===cx&&c[1]===cy;})){ doMove(m,sel[0],sel[1],cx,cy); return; } sel=null; }
        if(mine(bd[cy*8+cx], seat)) sel=[cx,cy];
        render();
      }; })(x,y);
      board.appendChild(sq); }
    view.appendChild(board);
    if(m.clock) view.appendChild(clockRow(m,'w'));
    // AI hint — only when it's the player's live turn (not spectating/finished).
    if(seat&&seat===m.turn&&!m.winner){
      const hb=document.createElement('div'); hb.className='hintbar';
      const hbtn=document.createElement('button'); hbtn.className='ghost';
      hbtn.textContent=hinting?'Thinking…':'💡 Hint'; hbtn.disabled=hinting;
      hbtn.onclick=function(){ askHint(m); };
      hb.appendChild(hbtn);
      const why=document.createElement('div'); why.className='why';
      if(hinting) why.textContent='Reading the board and weighing your options…';
      else if(hint&&hint.err) why.textContent=hint.err;
      else if(hint&&hint.uci) why.textContent='Suggested: '+hint.uci.slice(0,2)+'→'+hint.uci.slice(2)+(hint.why?' — '+hint.why:'');
      else why.textContent='Ask the computer’s AI for your strongest move.';
      hb.appendChild(why); view.appendChild(hb);
    }
    statusEl.textContent = m.winner ? ('Winner: '+esc(m.winner.name))
      : (seat? (m.turn===seat?'Your move ('+(seat==='w'?'White':'Black')+')':'Waiting for opponent') : 'Spectating')
        + ' — '+esc(m.a?m.a.name:'?')+' vs '+esc(m.b?m.b.name:'?');
  }
  // tick the visible clocks (and catch flag falls) without rebuilding the board
  setInterval(function(){
    if(!viewMatch) return; const m=findMatch(viewMatch); if(!m||!m.clock||m.winner) return;
    if(mySeat(m)&&flagFall(m)) return;
    view.querySelectorAll('.clock').forEach(function(el){
      const side=el.dataset.side, who=side==='w'?m.a:m.b, r=remaining(m,side);
      el.textContent=(side==='w'?'⚪ ':'⚫ ')+(who?who.name:'?')+'  '+fmtClock(r);
      el.classList.toggle('low',r<30000);
      el.classList.toggle('live',m.turn===side&&!m.winner);
    });
  }, 500);
  function findMatch(id){ for(const r of T.rounds){ for(const m of r){ if(m.id===id) return m; } } return null; }
  const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  db.subscribe(function(items){ const t=items.find(function(x){return x.id==='t';}); if(t){ T=t; T.settings=T.settings||{clock:'none',shuffle:true}; } render(); });
  if(window.gifos) gifos.me().then(function(mm){ me={id:mm.id,name:mm.name||'You'}; render(); });
  render();
</script>`;

  const PINGPONG_HTML = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<style>
  * { box-sizing: border-box; -webkit-user-select: none; user-select: none; }
  html, body { height: 100%; margin: 0; overflow: hidden; background: #1a1512; color: #f0f0f0; font-family: system-ui, sans-serif; touch-action: none; }
  header { position: fixed; top: 0; left: 0; right: 0; height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; background: rgba(20,20,31,0.92); border-bottom: 1px solid #2a2a3f; z-index: 5; }
  h1 { font-size: 18px; margin: 0; color: #ff8c3c; }
  .score { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; color: #fff; }
  .sub { font-size: 11px; color: #8888aa; margin-left: 6px; }
  #wrap { position: fixed; top: 56px; left: 0; right: 0; bottom: 0; }
  canvas { display: block; width: 100%; height: 100%; }
  #overlay { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; flex-direction: column; background: rgba(0,0,0,.85); z-index: 10; padding: 24px; text-align: center; }
  #overlay.on { display: flex; }
  #overlay h2 { margin: 0 0 10px; color: #ff8c3c; font-size: 24px; }
  #overlay p { max-width: 300px; margin: 0 0 20px; color: #b8b8d0; font-size: 15px; line-height: 1.5; }
  #readyBtn { padding: 14px 28px; border: 0; border-radius: 12px; background: #ff8c3c; color: #1a0f00; font-size: 17px; font-weight: 800; cursor: pointer; }
  #readyBtn:active { transform: scale(0.97); }
  #hint { position: fixed; left: 50%; bottom: 10px; transform: translateX(-50%); font-size: 12px; color: #a0a0b0; background: rgba(0,0,0,.55); padding: 6px 12px; border-radius: 10px; pointer-events: none; z-index: 6; text-align: center; }
  #reset { margin-left: 12px; padding: 6px 12px; border: 1px solid #2a2a3f; border-radius: 8px; background: #1c1c2b; color: #f0f0f0; font-size: 12px; cursor: pointer; }
</style>
<header>
  <div><h1>Ping Pong</h1><span class="sub" id="sub">…</span></div>
  <div><span class="score" id="score">0 — 0</span><button id="reset">New game</button></div>
</header>
<div id="wrap"><canvas id="game"></canvas></div>
<div id="overlay">
  <h2 id="ot">Ready?</h2>
  <p id="ob">Tap the button when you are back online so you can return the next ball.</p>
  <button id="readyBtn">I'm ready</button>
</div>
<div id="hint">Drag paddle to move · Touch the ball to hit it · Swipe for power/spin</div>
<script>
  const db = gifos.db('pingpong');
  let me = { id: 'local', name: 'You' }, owner = false;
  if (window.gifos) {
    gifos.me().then(m => { me.id = m.id; me.name = m.name || 'You'; });
    gifos.info().then(i => { owner = !!(i && i.owner); boot(); });
  } else { boot(); }

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const sub = document.getElementById('sub');
  const scoreEl = document.getElementById('score');
  const overlay = document.getElementById('overlay');
  const ot = document.getElementById('ot');
  const ob = document.getElementById('ob');
  const readyBtn = document.getElementById('readyBtn');
  const resetBtn = document.getElementById('reset');

  // Coordinates: x across table width (-9..9), y down table length (0..36),
  // z height above table in small units. The projection maps this to a phone-
  // friendly trapezoid. These units keep the physics tuned and rallies playable.
  const TW = 18, TL = 36, NH = 2.6, BR = 0.75, PADW = 4.0, PADH = 1.0;
  const GRAV = -0.00025;
  const AIR_DRAG = 0.9998;
  const DT = 16;
  const BROADCAST = 3;
  const GUEST_TIMEOUT = 3500;
  const STATE_TIMEOUT = 3000;

  let game = freshGame();
  let gst = { id: 'guest', x: 0, y: TL - 4, heartbeat: 0, ready: false, swing: null, t: 0 };
  let pointer = null;
  let tick = 0, lastGuestBeat = 0, lastStateAt = 0;
  let bounces = { side: null, count: 0 };
  let nextSwing = { host: null, guest: null };
  let cpu = { targetX: 0, targetY: TL - 4, swingQueued: false };

  function freshGame() {
    return {
      id: 'game',
      bx: 0, by: 4, bz: 5, vx: 0, vy: 0, vz: 0,
      sx: 0, sy: 0, sz: 0, sp: 0,
      hostX: 0, hostY: 3,
      guestX: 0, guestY: TL - 4,
      hostScore: 0, guestScore: 0,
      serving: 'host', lastHitter: null,
      paused: false, pausedBy: null, pausedAt: 0, t: 0
    };
  }

  function boot() {
    sub.textContent = owner ? 'Drag paddle to move · touch the ball to hit (solo vs computer)' : 'Waiting for host to serve';
    if (!owner) resetBtn.style.display = 'none';
    resize();
    window.addEventListener('resize', resize);
    bindInput();
    bindOverlay();
    db.subscribe(items => {
      const g = items.find(x => x.id === 'game');
      if (g) { game = g; lastStateAt = Date.now(); }
      if (owner) {
        const n = items.find(x => x.id === 'guest');
        if (n) { gst = n; lastGuestBeat = n.heartbeat || n.t || 0; if (n.ready && game.paused) { game.paused = false; game.pausedBy = null; } }
      }
      updateOverlay();
    });
    setInterval(owner ? hostTick : guestTick, DT);
    requestAnimationFrame(render);
  }

  function isCpu() { return owner && (!lastGuestBeat || (Date.now() - lastGuestBeat > GUEST_TIMEOUT)); }

  function hostTick() {
    const now = Date.now();
    if (!isCpu() && lastGuestBeat && now - lastGuestBeat > GUEST_TIMEOUT && !game.paused) {
      game.paused = true; game.pausedBy = 'guest'; game.pausedAt = now;
    }
    if (gst.swing) { nextSwing.guest = gst.swing; gst.swing = null; }
    if (isCpu()) {
      runCpu(now);
    } else {
      game.guestX = clampX(gst.x || game.guestX);
      game.guestY = clamp(gst.y || game.guestY, TL / 2, TL - 1);
    }
    if (pointer) {
      game.hostX = clampX(pointer.tableX);
      // Host can also move a little forward/back with their finger y.
      const ty = screenToTableY(pointer.y);
      game.hostY = clamp(ty, 0.5, 8);
    }
    if (!game.paused) step(DT);
    game.t = now;
    if (++tick % BROADCAST === 0) db.put(game);
  }

  function guestTick() {
    const now = Date.now();
    if (pointer) {
      gst.x = clampX(pointer.tableX);
      // Guest local y maps to shared guest y; their bottom of screen = far end.
      const ty = screenToTableY(pointer.y);
      gst.y = clamp(TL - ty, TL / 2, TL - 1);
    }
    gst.heartbeat = now; gst.t = now;
    if (!game.paused) gst.ready = false;
    if (++tick % BROADCAST === 0) db.put(gst);
  }

  function step(dt) {
    if (game.serving) { serve(); return; }
    game.vz += GRAV * dt;
    game.bx += game.vx * dt;
    game.by += game.vy * dt;
    game.bz += game.vz * dt;
    game.sp += Math.sqrt(game.sx * game.sx + game.sy * game.sy + game.sz * game.sz) * dt;
    game.sx *= 0.9998; game.sy *= 0.9998; game.sz *= 0.9998;

    if (game.bz < -3) { miss(); return; }
    if (game.bz <= BR && game.by > 0 && game.by < TL) bounce();
    if (Math.abs(game.by - TL / 2) < 0.7 && game.bz < NH && game.vz < 0) { miss(); return; }
    if (game.by > TL) { score('host'); return; }
    if (game.by < 0) { score('guest'); return; }
    hit('host');
    hit('guest');
  }

  function serve() {
    const s = game.serving;
    game.vx = 0; game.vz = 0.12;
    game.vy = s === 'host' ? 0.020 : -0.020;
    game.sx = 0; game.sy = 0; game.sz = 0; game.sp = 0;
    game.lastHitter = s;
    game.serving = null;
    bounces = { side: null, count: 0 };
  }

  function bounce() {
    game.bz = BR;
    game.vz = -game.vz * 0.82;
    game.vx += game.sz * 0.0025;
    game.vy += game.sy * 0.0012;
    const side = game.by < TL / 2 ? 'host' : 'guest';
    if (bounces.side === side) bounces.count++;
    else { bounces.side = side; bounces.count = 1; }
    if (bounces.count >= 2) miss();
  }

  function miss() { score(game.lastHitter === 'host' ? 'guest' : 'host'); }

  function score(to) {
    if (to === 'host') game.hostScore++; else game.guestScore++;
    game.serving = to;
    resetBall(to);
    bounces = { side: null, count: 0 };
    nextSwing = { host: null, guest: null };
    cpu.swingQueued = false;
    playSound('score');
  }

  function resetBall(server) {
    game.bx = 0;
    game.by = server === 'host' ? 4 : TL - 4;
    game.bz = 5;
    game.vx = 0; game.vy = 0; game.vz = 0;
    game.sx = 0; game.sy = 0; game.sz = 0; game.sp = 0;
    game.lastHitter = null;
    cpu.targetY = TL - 4;
  }

  function hit(who) {
    const isHost = who === 'host';
    const py = isHost ? game.hostY : game.guestY;
    const movingToward = (isHost && game.vy < 0) || (!isHost && game.vy > 0);
    if (!movingToward) return;
    const dy = Math.abs(game.by - py);
    if (dy > 3.5) return;
    const px = isHost ? game.hostX : game.guestX;
    const dx = Math.abs(game.bx - px);
    if (dx > PADW / 2 + BR || game.bz > BR + 22) return;
    const s = nextSwing[who];
    if (s) nextSwing[who] = null;
    const force = s ? s.force : 0.5;
    const smx = s ? s.smudgeX : 0;
    const smy = s ? s.smudgeY : 0;
    const base = 0.018 + force * 0.022;
    game.vy = (isHost ? 1 : -1) * base;
    game.vx += (game.bx - px) * 0.0012 + smx * 0.00025;
    game.vz = 0.10 + Math.max(0, -smy) * 0.0002;
    game.sx += smy * 0.0004;
    game.sy += smx * 0.00025;
    game.sz += smx * 0.0004;
    game.lastHitter = who;
    bounces = { side: null, count: 0 };
    playSound('paddle');
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function clampX(x) { return Math.max(-TW / 2 + PADW / 2, Math.min(TW / 2 - PADW / 2, x)); }

  function bindInput() {
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      pointer = {
        id: e.pointerId, down: true,
        x: px, y: e.clientY - r.top,
        startX: px, startY: e.clientY - r.top,
        t: performance.now(), pressure: e.pressure || 0,
        tableX: screenToTableX(px)
      };
      // A quick tap while the ball is near the local paddle triggers an aggressive swing.
      const localWho = owner ? 'host' : 'guest';
      const localX = owner ? game.hostX : game.guestX;
      const localY = owner ? game.hostY : game.guestY;
      const byLocal = owner ? game.by : TL - game.by;
      if (game.serving) {
        // Tap during the toss adds a little extra pace to the auto-serve.
        nextSwing[localWho] = { force: 0.9, smudgeX: 0, smudgeY: -5, tableX: localX, t: performance.now() };
      } else if (Math.abs(game.bx - localX) < PADW + BR &&
                 Math.abs(byLocal - localY) < 4 && game.bz < 16) {
        const aimX = clampX(game.bx + (Math.random() - 0.5) * 4);
        const smx = (aimX - localX) * 2;
        nextSwing[localWho] = { force: 0.8, smudgeX: smx, smudgeY: -4, tableX: localX, t: performance.now() };
      }
    });
    window.addEventListener('pointermove', e => {
      if (!pointer || pointer.id !== e.pointerId) return;
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
      pointer.pressure = Math.max(pointer.pressure, e.pressure || 0);
      pointer.tableX = screenToTableX(pointer.x);
    });
    window.addEventListener('pointerup', e => {
      if (!pointer || pointer.id !== e.pointerId) return;
      const dt = performance.now() - pointer.t;
      const force = estimateForce(pointer.pressure, dt);
      const sx = pointer.x - pointer.startX;
      const sy = pointer.y - pointer.startY;
      recordSwing(force, sx, sy, pointer.tableX);
      pointer = null;
    });
    window.addEventListener('pointercancel', () => { pointer = null; });
  }

  function screenToTableX(px) {
    const W = canvas.clientWidth, cx = W / 2, nearW = W * 0.88;
    const dir = owner ? 1 : -1;
    return dir * (px - cx) / (nearW / TW);
  }

  function screenToTableY(py) {
    const H = canvas.clientHeight;
    // Map screen y to table y: bottom of screen = 0, top of screen = TL.
    return (1 - (py / H)) * TL * 1.15;
  }

  function estimateForce(pressure, dt) {
    if (pressure > 0) return Math.min(1, pressure * 1.3);
    return Math.min(1, Math.max(0.25, 1.1 - dt / 350));
  }

  function recordSwing(force, smudgeX, smudgeY, tableX) {
    const s = { force, smudgeX, smudgeY, tableX, t: performance.now() };
    if (owner) nextSwing.host = s; else gst.swing = s;
  }

  function bindOverlay() {
    readyBtn.addEventListener('click', () => {
      if (!owner) { gst.ready = true; db.put(gst); }
      else { game.paused = false; game.pausedBy = null; db.put(game); }
      overlay.classList.remove('on');
    });
    resetBtn.addEventListener('click', () => {
      if (!owner) return;
      game = freshGame();
      db.put(game);
    });
  }

  function updateOverlay() {
    const now = Date.now();
    let show = false, title = '', body = '';
    if (!owner && now - lastStateAt > STATE_TIMEOUT) {
      show = true; title = 'Connection paused'; body = 'Tap Ready when you are back online so you can return the next ball.';
    } else if (owner && game.paused && !isCpu()) {
      show = true; title = 'Opponent away'; body = 'Waiting for them to come back online and tap Ready.';
    }
    overlay.classList.toggle('on', show);
    if (show) { ot.textContent = title; ob.textContent = body; }
  }

  function runCpu(now) {
    // CPU paddle tracks ball x/y; lead it so it reaches the interception point.
    const leadT = 160;
    let leadX = game.bx + game.vx * leadT;
    let leadY = game.by + game.vy * leadT;
    cpu.targetX += (leadX - cpu.targetX) * 0.22;
    cpu.targetY += (leadY - cpu.targetY) * 0.18;
    game.guestX = clampX(cpu.targetX);
    game.guestY = clamp(cpu.targetY, TL / 2, TL - 1);

    const movingToward = game.vy > 0;
    const dy = Math.abs(game.by - game.guestY);
    const inReachY = dy < 3.5;
    const inReachX = Math.abs(game.bx - game.guestX) < PADW / 2 + 1.4;
    const inReachZ = game.bz < 22;
    if (movingToward && inReachY && inReachX && inReachZ && !cpu.swingQueued && !nextSwing.guest) {
      cpu.swingQueued = true;
      const delay = 10 + Math.random() * 40;
      setTimeout(() => {
        const aimX = clampX((Math.random() - 0.5) * 9);
        const smx = (aimX - game.guestX) * 2.2;
        const smy = -(3 + Math.random() * 3);
        const force = 0.45 + Math.random() * 0.35;
        nextSwing.guest = { force, smudgeX: smx, smudgeY: smy, t: performance.now() };
        cpu.swingQueued = false;
      }, delay);
    }
  }

  // ---- audio ----
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playSound(kind) {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    if (kind === 'paddle') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, t);
      osc.frequency.exponentialRampToValueAtTime(300, t + 0.08);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.start(t); osc.stop(t + 0.08);
    } else if (kind === 'table') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.start(t); osc.stop(t + 0.12);
    } else if (kind === 'net') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.start(t); osc.stop(t + 0.05);
    } else if (kind === 'score') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.start(t); osc.stop(t + 0.25);
    }
  }

  // ---- rendering ----
  let _W = 0, _H = 0;
  function render() {
    const W = canvas.width, H = canvas.height;
    _W = W; _H = H;
    ctx.clearRect(0, 0, W, H);

    // Gym background
    ctx.fillStyle = '#2a221c';
    ctx.fillRect(0, 0, W, H);

    // Floor
    const cy = H * 0.55;
    const grd = ctx.createLinearGradient(0, cy, 0, H);
    grd.addColorStop(0, '#5c4a3a');
    grd.addColorStop(1, '#3e3228');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(W, H);
    ctx.lineTo(W * 0.85, cy);
    ctx.lineTo(W * 0.15, cy);
    ctx.closePath();
    ctx.fill();

    const flip = !owner;
    const cx = W / 2, ny = H * 0.86, fy = H * 0.22, nw = W * 0.88;
    function p(wx, wy, wz) {
      let y = wy; if (flip) y = TL - y;
      const t = y / TL;
      const sc = 1 - 0.34 * t;
      return { x: cx + wx * (nw / TW) * sc, y: ny - y * (ny - fy) / TL - wz * (H * 0.026) * sc, sc: sc };
    }
    drawTable(p);
    drawNet(p);
    const guestX = owner ? game.guestX : gst.x;
    const guestY = owner ? game.guestY : gst.y;
    drawPaddle(p, game.hostX, owner ? game.hostY : (TL - game.hostY), '#ff4444');
    drawPaddle(p, guestX, guestY, '#4488ff');
    drawBall(p);
    scoreEl.textContent = game.hostScore + ' — ' + game.guestScore;
    requestAnimationFrame(render);
  }

  function drawTable(p) {
    const c = [p(-TW / 2, 0, 0), p(TW / 2, 0, 0), p(TW / 2, TL, 0), p(-TW / 2, TL, 0)];
    ctx.fillStyle = '#0b6b3e';
    ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(c[i].x, c[i].y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c[0].x, c[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(c[i].x, c[i].y); ctx.closePath(); ctx.stroke();
    const m1 = p(0, 0, 0), m2 = p(0, TL, 0);
    ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke();
  }

  function drawNet(p) {
    const n = [p(-TW / 2, TL / 2, 0), p(TW / 2, TL / 2, 0), p(TW / 2, TL / 2, NH), p(-TW / 2, TL / 2, NH)];
    ctx.strokeStyle = 'rgba(230,230,245,.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(n[0].x, n[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(n[i].x, n[i].y); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = 'rgba(230,230,245,.25)';
    for (let i = 1; i < 6; i++) {
      const a = p(-TW / 2 + (TW * i / 6), TL / 2, NH * 0.2);
      const b = p(-TW / 2 + (TW * i / 6), TL / 2, NH * 0.9);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  const PADDLE_RX = 0.11, PADDLE_RY = 0.13, PADDLE_Z = 1.2;
  const BALL_R = 0.06;

  function drawPaddle(p, x, y, color) {
    const pos = p(x, y, PADDLE_Z);
    const sc = pos.sc;
    const rx = PADDLE_RX * _W * 0.88 / TW * sc;
    const ry = rx * 1.25;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.scale(1, 0.82);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    const handleLen = 18 * sc;
    const handleAngle = (y < TL / 2) ? Math.PI / 2 + 0.25 : -Math.PI / 2 - 0.25;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(handleAngle);
    ctx.fillStyle = '#c4a06d';
    ctx.fillRect(-3 * sc, ry * 0.82 - 2 * sc, 6 * sc, handleLen);
    ctx.restore();
  }

  function drawBall(p) {
    const b = p(game.bx, game.by, game.bz);
    const r = BALL_R * _W * 0.88 / TW * b.sc;
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.rotate(game.sp);
    ctx.fillStyle = '#ff8c3c';
    ctx.fillRect(-r, -r * 0.16, r * 2, r * 0.32);
    ctx.restore();
  }

  function resize() {
    const r = document.getElementById('wrap').getBoundingClientRect();
    canvas.width = r.width; canvas.height = r.height;
  }
</script>`;

  // Shown only if this GIF is run somewhere WITHOUT the GifOS system routing
  // (an old build, another host). On a real desktop the runtime never mounts
  // this — it routes the icon straight to the trusted run.html page.
  const MEET_FALLBACK_HTML = `<!doctype html><meta charset="utf-8"><style>
  body{font:15px system-ui;background:#0a0a0f;color:#e0e0f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
  .card{max-width:420px;padding:2rem;border:1px solid #2a2a3f;border-radius:1rem;background:#14141f}
  h2{color:#5ca0ff;margin-top:0} p{color:#9a9ab5;line-height:1.5} code{color:#5ca0ff}
</style><div class="card"><h2>Meeting</h2>
<p>This one is built into GifOS. Ordinary apps are never allowed near your camera or
microphone, so this icon opens the built-in meeting page instead of running here.</p>
<p>Open this GIF on your Home Screen at <code>gifos.app</code> to start a meeting.</p></div>`;

  // Same idea for Broadcast: the Meet page wearing its broadcast skin — one
  // host live on the Stage, unlimited viewers, chat as the back-channel.
  const BROADCAST_FALLBACK_HTML = `<!doctype html><meta charset="utf-8"><style>
  body{font:15px system-ui;background:#0a0a0f;color:#e0e0f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
  .card{max-width:420px;padding:2rem;border:1px solid #2a2a3f;border-radius:1rem;background:#14141f}
  h2{color:#ff5c78;margin-top:0} p{color:#9a9ab5;line-height:1.5} code{color:#ff5c78}
</style><div class="card"><h2>Broadcast</h2>
<p>This one is built into GifOS. Ordinary apps are never allowed near your camera or
microphone, so this icon opens the built-in broadcast page instead of running here.</p>
<p>Open this GIF on your Home Screen at <code>gifos.app</code> to go live.</p></div>`;

  // Same idea for the App Store: the icon is a real GIF, but installing an app
  // means writing to this computer's Home Screen, which the app sandbox cannot
  // and must not do. The runtime routes it to the trusted store page instead.
  const STORE_FALLBACK_HTML = `<!doctype html><meta charset="utf-8"><style>
  body{font:15px system-ui;background:#0a0a0f;color:#e0e0f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
  .card{max-width:420px;padding:2rem;border:1px solid #2a2a3f;border-radius:1rem;background:#14141f}
  h2{color:#7b5cff;margin-top:0} p{color:#9a9ab5;line-height:1.5} code{color:#7b5cff}
</style><div class="card"><h2>App Store</h2>
<p>This one is built into GifOS. Ordinary apps are never allowed to put things on your
Home Screen, so this icon opens the built-in store page instead of running here.</p>
<p>Open this GIF on your Home Screen at <code>gifos.app</code> to browse apps.</p></div>`;

  // A real app now: friendly onboarding for non-technical people, with a live
  // checklist that demonstrates the core magic (state lives inside the icon).
  const WELCOME_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0}
  body{font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#0a0a0f;color:#e0e0f0;padding:1.2rem}
  .wrap{max-width:640px;margin:0 auto}
  h1{font-size:1.7rem;margin:.8rem 0 .3rem;background:linear-gradient(135deg,#7b5cff,#5cc8ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .lead{color:#9a9ab5;margin-bottom:1.2rem}
  .card{background:#14141f;border:1px solid #2a2a3f;border-radius:1rem;padding:1rem 1.1rem;margin-bottom:.8rem}
  .card h2{font-size:1.02rem;margin-bottom:.3rem}
  .card p{color:#9a9ab5;font-size:.92rem}
  .card b{color:#cfcfe8}
  .emoji{font-size:1.3rem;margin-right:.4rem}
  .try{margin-top:1.2rem}
  .try h2{font-size:1.05rem;margin-bottom:.2rem}
  .try p{color:#9a9ab5;font-size:.9rem;margin-bottom:.7rem}
  label.todo{display:flex;align-items:center;gap:.6rem;background:#14141f;border:1px solid #2a2a3f;border-radius:.7rem;padding:.6rem .8rem;margin-bottom:.5rem;cursor:pointer}
  label.todo input{width:1.15rem;height:1.15rem;accent-color:#7b5cff}
  label.todo.done span{text-decoration:line-through;color:#667}
  .magic{color:#5cc8ff;font-size:.85rem;margin-top:.6rem;display:none}
  .magic.show{display:block}
</style></head><body><div class="wrap">
  <h1>Welcome to GifOS</h1>
  <p class="lead">Your own computer that lives in your browser. No account, no installs — and everything you make is a file <b>you</b> keep.</p>

  <div class="card"><h2><span class="emoji">🖼️</span>Every app is a GIF</h2>
  <p>Those animated icons on your Home Screen are real GIF images — with a whole app tucked inside. Double-click one and it runs. Send one to a friend and they get your app <b>with your stuff in it</b>.</p></div>

  <div class="card"><h2><span class="emoji">💾</span>Your stuff stays put</h2>
  <p>Whatever you do in an app is saved with its icon automatically. Close the tab, come back tomorrow — you're right where you left off. Nothing is stored on anyone's servers.</p></div>

  <div class="card"><h2><span class="emoji">🔗</span>Play together with one link</h2>
  <p>Open any app and press <b>Invite</b>. Send the link to friends and they join you live — same game, same notes, same room. Try <b>Meeting</b>, right on your Home Screen — you can even run an app inside it!</p></div>

  <div class="card"><h2><span class="emoji"></span>Games for real-life hangouts</h2>
  <p>The <b>IRL Games</b> folder is for game night: everyone keeps their own phone — open a game, press <b>Invite</b>, and secret roles, hidden votes, and sneaky lies get dealt to each player's screen while the laughing and accusing happens face to face. Only one phone in the room? The <b>Single Phone</b> subfolder has pass-around versions.</p></div>

  <div class="card"><h2><span class="emoji">✨</span>Make your own apps</h2>
  <p>Press <b>＋ Add</b> in the top bar, copy the magic prompt into any AI (like Claude), tell it what you want, and paste back what it gives you. You just made an app. It's yours forever.</p></div>

  <div class="card"><h2><span class="emoji"></span>Or just steal one</h2>
  <p>See an app you like in a friend's session or a call? Press <b>Steal</b> and choose where the copy goes — your <b>Stolen Apps</b> chest or a downloaded GIF — and how much comes with it: <b>No data</b> for a fresh, empty copy, or the data <b>as it arrived</b> or <b>as it is now</b> to carry the game in progress or the shared notes. Anyone in the session can, since it's already synced to your browser. It's not rude here, it's the whole point: every app is a file, so taking one just copies the GIF. Then remix it with your AI and make it yours.</p></div>

  <div class="card"><h2><span class="emoji">💿</span>Your whole computer is one file</h2>
  <p>GifOS menu (top-left) → <b>Back up Home Screen</b> gives you a single GIF holding everything. Keep it safe, or double-click it anywhere to boot your computer — even inside another one.</p></div>

  <div class="try"><h2>See the magic for yourself</h2>
  <p>Check something off, close this tab, then open Welcome again — it remembers. That's your data living inside the icon.</p>
  <div id="list"></div><div class="magic" id="magic">Now close this tab and reopen Welcome from your desktop 😉</div></div>
</div>
<script>
  var STEPS=[["look","Looked around my new Home Screen"],["run","Opened an app (this one counts!)"],["invite","Invited a friend with one link"],["make","Made my own app with ＋ Add"],["backup","Backed up my computer to one GIF"]];
  var db=window.gifos?gifos.db("welcome"):null,state={};
  function render(){var el=document.getElementById("list");el.innerHTML="";STEPS.forEach(function(s){
    var l=document.createElement("label");l.className="todo"+(state[s[0]]?" done":"");
    var c=document.createElement("input");c.type="checkbox";c.checked=!!state[s[0]];
    c.onchange=function(){state[s[0]]=c.checked;if(db)db.put({id:s[0],done:c.checked});document.getElementById("magic").classList.add("show");render();};
    var t=document.createElement("span");t.textContent=s[1];l.appendChild(c);l.appendChild(t);el.appendChild(l);});}
  if(db){db.subscribe(function(items){state={};items.forEach(function(i){state[i.id]=i.done;});render();});}else{render();}
</script></body></html>`;

  const WELCOME_README = [
    'WELCOME TO GIFOS',
    '================',
    '',
    'Everything here is just files — and the files are GIFs.',
    '',
    'THE BIG IDEAS',
    '  * Apps are GIFs. Double-click an app GIF and it runs in a new tab.',
    '  * Your data lives INSIDE the icon. Close the tab, reopen the icon,',
    '    and you are right back where you were.',
    '  * Snapshot any app to a single .gif file. Send it to anyone —',
    '    they drop it on their desktop and get your app WITH your data.',
    '  * See an app you like in a friend session or call? Steal copies it',
    '    into your Stolen Apps chest or downloads it as a .gif. You pick how',
    '    much data rides along: none for a FRESH, EMPTY app, or the data as',
    '    it arrived / as it is now to carry the live state. Anyone in the',
    '    session can, since it is synced to your browser.',
    '  * Any app can go multiplayer: your browser becomes the server and',
    '    friends join from a share link. Traffic goes peer-to-peer when the',
    '    network allows, and falls back to a relay when it does not.',
    '  * Nothing lives on our servers. Your desktop stays in this browser.',
    '    Use the GifOS menu (top-left) to back up your whole desktop as one',
    '    GIF that you keep.',
    '  * A backup GIF is a COMPUTER IMAGE: double-click one and BOOT it as',
    '    a computer inside this computer — your real desktop is untouched.',
    '  * Right-click any icon and Download to export it (apps keep their',
    '    saved state and artwork). Meeting (Social) is strictly',
    '    peer-to-peer — the relay refuses to carry media.',
    '',
    'THIS ICON IS A DEMO TOO',
    '  This GIF has no index.html inside, so GifOS shows you its files',
    '  instead of running it — like an open folder on a web server.',
    '',
    'gifos.app — Apps are GIFs. Data is GIFs. Everything is just files.',
  ].join('\n');

  // The one default app that reaches the internet: it pulls a line of advice
  // from adviceslip.com through gifos.fetch(), so opening it shows the network
  // acknowledgement in action. It also degrades gracefully if the site is
  // unreachable OR the user has switched its internet off from the tab.
  const FORTUNE_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:16px system-ui;margin:0;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);display:flex;flex-direction:column;min-height:100vh}
  header{background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:14px 18px;font-weight:700;color:var(--accent,#ffce6b)}
  main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;max-width:460px;margin:0 auto;box-sizing:border-box}
  .cookie{font-size:52px;line-height:1;filter:drop-shadow(0 6px 14px rgba(255,190,80,.25))}
  /* The paper slip is the fortune's identity — always cream stock, dark ink. */
  .slip{background:#fffdf2;color:#3a3320;border-radius:14px;padding:20px 22px;min-height:56px;width:100%;box-sizing:border-box;
        display:flex;align-items:center;justify-content:center;text-align:center;font-size:18px;line-height:1.5;box-shadow:0 8px 30px rgba(0,0,0,.4)}
  .slip.err{background:#2a1710;color:#ffcbab;border:1px solid #ff8a3d}
  .row{display:flex;gap:10px}
  button{padding:11px 18px;border-radius:10px;border:1px solid var(--border,#2a2a3f);background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0);cursor:pointer;font-size:15px}
  button.go{background:var(--accent,#ffce6b);color:var(--onaccent,#3a2c05);border-color:var(--accent,#ffce6b);font-weight:700}
  button:disabled{opacity:.5;cursor:default}
  button:not(:disabled):hover{filter:brightness(1.08)}
  .kept{width:100%}
  .kept h4{color:var(--muted,#8888aa);font-size:.8rem;font-weight:600;margin:0 0 6px}
  .kept .k{background:var(--surface,#14141f);border:1px solid var(--border,#22222f);border-radius:8px;padding:8px 10px;font-size:13px;color:var(--text,#c8c8dc);margin-bottom:6px}
  .foot{color:var(--muted,#6a6a86);font-size:.72rem;text-align:center;line-height:1.5}
</style>
<header>Fortune</header>
<main>
  <div class="cookie">🥠</div>
  <div class="slip" id="slip">Crack open a cookie for a little wisdom…</div>
  <div class="row">
    <button class="go" id="crack">Crack a cookie</button>
    <button id="keep" disabled>Keep it</button>
  </div>
  <div class="kept" id="keptWrap" style="display:none"><h4>Kept fortunes</h4><div id="kept"></div></div>
  <p class="foot">Fortunes come from adviceslip.com over the internet — tap the “Internet” button up top to see or change that.</p>
</main>
<script>
  var slip=document.getElementById('slip'),crack=document.getElementById('crack'),keepBtn=document.getElementById('keep');
  var keptWrap=document.getElementById('keptWrap'),keptEl=document.getElementById('kept'),current=null;
  var db=(window.gifos&&gifos.db)?gifos.db('fortunes'):null;
  function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
  function showKept(items){items=(items||[]).slice().reverse();keptWrap.style.display=items.length?'':'none';
    keptEl.innerHTML=items.map(function(x){return '<div class="k">“'+esc(x.text)+'”</div>';}).join('');}
  if(db)db.subscribe(showKept);
  function fail(msg){current=null;slip.className='slip err';slip.textContent=msg;keepBtn.disabled=true;crack.disabled=false;}
  function crackOne(){
    slip.className='slip';slip.textContent='Cracking…';keepBtn.disabled=true;crack.disabled=true;
    if(!window.gifos||!gifos.fetch){fail('Open this from GifOS to reach the internet.');return;}
    gifos.fetch('https://api.adviceslip.com/advice?t='+Date.now())
      .then(function(r){if(!r.ok)throw new Error('bad');return r.json();})
      .then(function(d){current=(d&&d.slip&&d.slip.advice)||'…';slip.textContent='“'+current+'”';
        keepBtn.disabled=false;crack.disabled=false;})
      .catch(function(){fail('Couldn’t reach the fortune teller. You may be offline — or you’ve switched this app’s internet off with the “Internet” button up top.');});
  }
  crack.onclick=crackOne;
  keepBtn.onclick=function(){if(current&&db){db.put({text:current,t:Date.now()});keepBtn.disabled=true;}};
  crackOne();
</script>`;

  // Bible Browser — reads the Recovery Version straight from
  // text.recoveryversion.bible. That site sends no CORS headers, so a direct
  // browser fetch is blocked; the app calls gifos.fetch(url, { proxy:true }),
  // and the runtime routes it through the GifOS CORS proxy (which adds the
  // headers). A live demo of the proxy on a real, public, non-CORS site. The
  // fetched HTML is sanitised (scripts/styles/handlers stripped) and its
  // same-site links rewritten to navigate inside the app; the last page read is
  // remembered in the icon so it reopens where you left off.
  const BIBLE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{--fs:18px}
  *{box-sizing:border-box}
  body{margin:0;font:16px system-ui;display:flex;flex-direction:column;height:100vh;height:100dvh;transition:background .2s,color .2s}
  body[data-read="night"]{--rbg:#15120d;--rtext:#eae2d2;--rmuted:#a79e8b;--rlink:#d9b458;--rchrome:#1c1811;--rborder:#352d22;--rrule:#3a3226}
  body[data-read="day"]{--rbg:#f6efdf;--rtext:#2c2620;--rmuted:#7a7060;--rlink:#8a571a;--rchrome:#efe6cf;--rborder:#ddd0b2;--rrule:#e2d6b8}
  body{background:var(--rbg);color:var(--rtext)}
  header{background:var(--rchrome);border-bottom:1px solid var(--rborder);padding:10px 14px;display:flex;align-items:center;gap:10px;flex:0 0 auto}
  header .ttl{font-weight:800;color:var(--rlink);font-size:15px;white-space:nowrap;letter-spacing:.01em}
  header .loc{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--rmuted);font-size:12px;text-align:right}
  nav{display:flex;gap:6px;align-items:center;background:var(--rchrome);border-bottom:1px solid var(--rborder);padding:8px 12px;flex:0 0 auto;flex-wrap:wrap}
  nav button{padding:7px 11px;border-radius:9px;border:1px solid var(--rborder);background:var(--rbg);color:var(--rtext);cursor:pointer;font-size:14px;line-height:1}
  nav button:disabled{opacity:.4;cursor:default}
  nav .sp{flex:1}
  nav .grp{display:flex;gap:4px;align-items:center}
  nav button.home{background:var(--rlink);color:var(--rbg);border-color:var(--rlink);font-weight:700}
  nav button.follow{font-weight:700}
  nav button.follow.on{background:var(--rlink);color:var(--rbg);border-color:var(--rlink)}
  nav button.chip{font-size:15px;min-width:34px;text-align:center}
  main{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;background:var(--rbg)}
  .doc{max-width:680px;margin:0 auto;padding:22px 20px 64px;line-height:1.75;font-size:var(--fs);font-family:Georgia,'Times New Roman',serif;color:var(--rtext);overflow-wrap:anywhere}
  .doc img,.doc table{max-width:100%}
  /* Phones: narrow (portrait) OR short (landscape). Slim the two header rows and
     buttons so the actual scripture gets the screen, not the chrome. */
  @media (max-width:480px),(max-height:520px){
    header{padding:6px 12px}
    header .ttl{font-size:13px}
    nav{padding:5px 10px;gap:5px}
    nav button{padding:5px 9px;font-size:13px}
    nav button.chip{min-width:30px}
    .doc{padding:14px 16px 44px;line-height:1.6}
  }
  .doc h1,.doc h2,.doc h3{font-family:system-ui;color:var(--rlink);line-height:1.25}
  .doc a{color:var(--rlink);text-decoration:none}
  .doc a[data-nav]{border-bottom:1px dotted currentColor;cursor:pointer}
  .doc a.ext{color:var(--rmuted);cursor:default;border:0}
  .doc hr{border:0;border-top:1px solid var(--rrule);margin:1.2em 0}
  .doc table{width:100%;border-collapse:collapse}
  .doc td,.doc th{padding:2px 6px;vertical-align:top}
  .doc sup{color:var(--rlink);font-weight:700;font-size:.7em;padding-right:.15em}
  .status{padding:34px 20px;text-align:center;color:var(--rmuted);max-width:520px;margin:0 auto;line-height:1.6}
  .status.err{color:#d9694a}
  .foot{color:var(--rmuted);font-size:.72rem;text-align:center;padding:28px 20px 0;line-height:1.5;opacity:.85}
</style>
<header><span class="ttl">Bible Browser</span><span class="loc" id="loc"></span></header>
<nav>
  <button id="back" title="Back">&lsaquo;</button>
  <button id="fwd" title="Forward">&rsaquo;</button>
  <button id="reload" title="Reload">&#8635;</button>
  <button class="home" id="home">Home</button>
  <button class="follow" id="follow" style="display:none" title="Follow the meeting">Follow</button>
  <span class="sp"></span>
  <span class="grp">
    <button id="smaller" class="chip" title="Smaller text">A&minus;</button>
    <button id="bigger" class="chip" title="Bigger text">A&plus;</button>
    <button id="theme" class="chip" title="Day / night">&#9790;</button>
  </span>
</nav>
<main id="main"><div class="status">Loading the Recovery Version&hellip;</div></main>
<script>
  var HOST='text.recoveryversion.bible', HOME='https://text.recoveryversion.bible/';
  var main=document.getElementById('main'), locEl=document.getElementById('loc');
  var backB=document.getElementById('back'), fwdB=document.getElementById('fwd');
  var followB=document.getElementById('follow');
  // Three stores, three visibilities (declared in the manifest):
  //   nav      — the shared reading position (read-write, and leadable so the
  //              host can switch to "only I lead").
  //   presence — light heartbeats so everyone knows who's here (read-write).
  //   prefs    — MY theme, font size and last page (private: each reader keeps
  //              their own copy; it never leaves their tab).
  var hasDb=!!(window.gifos&&gifos.db);
  var navDb=hasDb?gifos.db('nav'):null, presDb=hasDb?gifos.db('presence'):null, prefsDb=hasDb?gifos.db('prefs'):null;
  var hist=[], hi=-1, curUrl=HOME;
  var prefs={ theme:'night', fs:18 };
  var me={ id:'', name:'' };
  // Follow-along (meetings): the group's current page lives in a single 'nav'
  // record in the SHARED (read-write) nav store — whoever turns a page while
  // following writes it and the others jump there. Follow is ON by default but
  // per-person and in-memory, so anyone can switch it off to peek elsewhere
  // without moving the group (or being moved). Reading prefs and last page live
  // in the PRIVATE prefs store, so they stay personal and never sync.
  var follow=true, shared=false, hbTimer=null, lastNav=null, othersHere=0;
  // Scroll is remembered per person AND shared with followers — as a FRACTION of
  // the page (0..1) so it lines up even when readers use different text sizes.
  var pendingFrac=null, applyingScroll=false, scrollSaveT=null, scrollPushT=null, lastFrac=-1;
  function esc(s){var d=document.createElement('div');d.textContent=s==null?'':s;return d.innerHTML;}
  function scrollFrac(){ var m=main.scrollHeight-main.clientHeight; return m>0?(main.scrollTop/m):0; }
  function applyFrac(f){ var m=main.scrollHeight-main.clientHeight; main.scrollTop=Math.max(0,Math.min(m,(f||0)*m)); }
  function saveLast(){ if(prefsDb) prefsDb.put({id:'last', url:curUrl, scroll:scrollFrac()}); }  // my last page + where I was on it (private)
  function applyPrefs(){ document.body.setAttribute('data-read', prefs.theme); document.documentElement.style.setProperty('--fs', prefs.fs+'px');
    document.getElementById('theme').innerHTML = prefs.theme==='night' ? '&#9790;' : '&#9728;'; }
  function myName(){ return me.name||'Someone'; }
  function savePrefs(){ if(prefsDb) prefsDb.put({id:'prefs', theme:prefs.theme, fs:prefs.fs}); }  // my own, never shared
  // Presence heartbeat: a light 'p:<id>' record so everyone knows who's here
  // (drives whether the Follow toggle is even shown). Kept fresh while shared.
  function heartbeat(){ if(presDb&&me.id) presDb.put({id:'p:'+me.id, name:myName(), ts:Date.now()}); }
  function startHeartbeat(){ if(hbTimer||!presDb||!me.id) return;
    hbTimer=setInterval(function(){ if(document.visibilityState!=='hidden') heartbeat(); }, 15000);
    heartbeat(); }  // set the guard BEFORE the first beat so a sync notify can't re-enter
  // Publish where I am so followers come along. Only called when I'm following.
  // The put is REFUSED when the host is leading (nav went read-only) — then I
  // just browse on my own; the reader drives everyone.
  function pushNav(url, frac){ if(navDb&&me.id) Promise.resolve(navDb.put({id:'nav', url:url, scroll:(frac==null?scrollFrac():frac), by:me.id, byName:myName(), ts:Date.now()})).catch(function(){ /* led room: the reader drives; I browse alone */ }); }
  function updateFollowUi(){ if(!followB) return;
    followB.style.display = shared ? '' : 'none';
    followB.classList.toggle('on', follow);
    followB.textContent = follow ? 'Following' : 'Follow';
    followB.title = follow ? 'Following the meeting — tap to browse on your own without moving anyone'
                           : 'Browsing on your own — tap to follow the meeting again'; }
  // Shared-state (and whether the Follow toggle even shows) depends on BOTH
  // who's present and whether someone else is driving nav — recomputed on any
  // change to either collection.
  function recompute(){
    var navByOther = !!(lastNav && lastNav.by && lastNav.by!==me.id && lastNav.url);
    shared = othersHere>0 || navByOther;
    if(shared) startHeartbeat();
    updateFollowUi();
    return navByOther; }
  // Presence collection changed: recount who's here (fresh 'p:<id>' beats).
  function onPresence(rows){ if(!Array.isArray(rows)) return; var now=Date.now(), others=0;
    for(var i=0;i<rows.length;i++){ var r=rows[i]; if(!r||!r.id) continue;
      if(r.id.slice(0,2)==='p:'&&r.id!=='p:'+me.id&&(now-(r.ts||0))<35000) others++; }
    othersHere=others; recompute(); }
  // Nav collection changed: where is the group reading, and do I follow there?
  function handleSync(rows){ if(!Array.isArray(rows)) return; var navRec=null;
    for(var i=0;i<rows.length;i++){ var r=rows[i]; if(r&&r.id==='nav'){ navRec=r; break; } }
    lastNav=navRec;
    var navByOther=recompute();
    if(follow && navByOther){
      if(navRec.url!==curUrl) go(navRec.url, true, true, navRec.scroll);
      else if(typeof navRec.scroll==='number' && Math.abs(navRec.scroll-scrollFrac())>0.008){
        applyingScroll=true; applyFrac(navRec.scroll); lastFrac=navRec.scroll;
        setTimeout(function(){ applyingScroll=false; }, 90);
      }
    } }
  function setStatus(msg,err){ main.innerHTML='<div class="status'+(err?' err':'')+'">'+msg+'</div>'; }
  function buttons(){ backB.disabled=hi<=0; fwdB.disabled=hi>=hist.length-1; }
  function shortLoc(u){ try{ var x=new URL(u); return (x.pathname+x.search)||'/'; }catch(e){ return u; } }
  function resolve(href, base){ try{ return new URL(href, base).toString(); }catch(e){ return null; } }
  // Base for resolving a page's relative links: honour <base href> if present,
  // else the page's own URL. (Old static Bible sites often set <base>, and
  // getting this wrong is what sends chapter links to the wrong file.)
  function baseFor(doc, url){ var b=doc.querySelector('base[href]'); if(b){ var r=resolve(b.getAttribute('href'), url); if(r) return r; } return url; }
  // Fetch + parse one page through the CORS proxy. Returns { doc, url } where url
  // is where the request actually LANDED: the proxy follows redirects server-side
  // (e.g. "nt-outlines" -> "nt-outlines/") and reports the final URL in a header,
  // so a page's relative links resolve against the right directory. Older proxies
  // omit it — then we fall back to the requested URL.
  function fetchDoc(url){ var finalUrl=url;
    return gifos.fetch(url,{proxy:true}).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status+' for '+shortLoc(url));
      var fin=r.headers&&r.headers['x-gifos-final-url']; if(fin){ var a=resolve(fin, url); if(a) finalUrl=a; }
      return r.text(); })
    .then(function(t){ return { doc:new DOMParser().parseFromString(t,'text/html'), url:finalUrl }; }); }
  // Rewrite every <a href> in a doc to an ABSOLUTE url against its base, so that
  // once frames are merged the hrefs still point at the right place.
  function absolutizeAnchors(doc, base){
    Array.prototype.forEach.call(doc.querySelectorAll('a[href]'), function(a){
      var h=a.getAttribute('href'); if(h && h.charAt(0)==='#') return;
      var abs=resolve(h, base); if(abs) a.setAttribute('href', abs); else a.removeAttribute('href');
    });
  }
  // Load a page and INLINE any same-site <frame>/<iframe> content one level deep
  // (these text sites keep the scripture in a content frame). Returns a body-ish
  // element with everything merged and links already absolute.
  function loadPage(url){
    return fetchDoc(url).then(function(res){
      var doc=res.doc, actual=res.url;
      var base=baseFor(doc, actual); absolutizeAnchors(doc, base);
      var frames=Array.prototype.slice.call(doc.querySelectorAll('frame[src],iframe[src]'));
      var same=frames.filter(function(fr){ var s=resolve(fr.getAttribute('src'), base); try{ return s && new URL(s).hostname===HOST; }catch(e){ return false; } });
      if(!same.length) return { root: doc.body || doc.documentElement, url: actual };
      return Promise.all(same.map(function(fr){
        var src=resolve(fr.getAttribute('src'), base);
        return fetchDoc(src).then(function(fres){
          var fdoc=fres.doc; var fbase=baseFor(fdoc, fres.url); absolutizeAnchors(fdoc, fbase);
          var holder=document.createElement('div'); holder.innerHTML=(fdoc.body?fdoc.body.innerHTML:'');
          if(fr.parentNode) fr.parentNode.replaceChild(holder, fr); else (doc.body||doc.documentElement).appendChild(holder);
        }).catch(function(){ if(fr.parentNode) fr.parentNode.removeChild(fr); });
      })).then(function(){ return { root: doc.body || doc.documentElement, url: actual }; });
    });
  }
  // Clean the merged DOM: drop unsafe/non-content nodes, strip handlers, turn
  // same-site absolute links into in-app navigation, neutralise the rest.
  function sanitize(root){
    Array.prototype.forEach.call(root.querySelectorAll('script,style,link,meta,noscript,base,object,embed,frame,iframe,frameset,svg,header,nav,footer'), function(n){ n.remove(); });
    Array.prototype.forEach.call(root.querySelectorAll('*'), function(el){
      for(var i=el.attributes.length-1;i>=0;i--){ if(el.attributes[i].name.slice(0,2).toLowerCase()==='on') el.removeAttribute(el.attributes[i].name); }
      var tag=el.tagName;
      if(tag==='IMG'){ var alt=el.getAttribute('alt')||''; if(el.parentNode) el.parentNode.replaceChild(document.createTextNode(alt), el); return; }
      if(tag==='A'){
        var href=el.getAttribute('href')||''; el.removeAttribute('target'); el.removeAttribute('rel');
        if(href && href.charAt(0)==='#'){ if(href.length>1) el.setAttribute('data-anchor', href.slice(1)); el.setAttribute('href','#'); return; }
        var host=''; try{ host=new URL(href).hostname; }catch(e){}
        if(href && host===HOST){ el.setAttribute('data-nav', href); el.setAttribute('href','#'); }
        else { el.removeAttribute('href'); el.className=(el.className+' ext').trim(); el.title='External link — open it in your own browser'; }
      }
    });
    return root.innerHTML;
  }
  function render(root){
    var html=sanitize(root);
    main.innerHTML='<div class="doc">'+html+'<p class="foot">Text from text.recoveryversion.bible, read through the GifOS CORS proxy &mdash; tap the &ldquo;Internet&rdquo; button up top to see or change that.</p></div>';
    // Land where the reader (or the meeting) last was on this page, not the top.
    // Re-apply on the next frame: right after innerHTML the new layout isn't
    // flushed yet, so a bare scrollTop set clamps against the old (short) height.
    var f=pendingFrac!=null?pendingFrac:0; pendingFrac=null;
    applyingScroll=true; applyFrac(f);
    requestAnimationFrame(function(){ applyFrac(f); setTimeout(function(){ applyingScroll=false; }, 60); });
    locEl.textContent=shortLoc(curUrl);
  }
  function go(url, push, fromSync, frac){
    curUrl=url;
    if(push){ hist=hist.slice(0,hi+1); hist.push(url); hi=hist.length-1; }
    buttons(); locEl.textContent=shortLoc(url); setStatus('Loading '+esc(shortLoc(url))+'&hellip;');
    if(!window.gifos||!gifos.fetch){ setStatus('Open this from GifOS to reach the internet.', true); return; }
    var want=url, target=(frac==null?0:frac);
    loadPage(url).then(function(res){ if(curUrl!==want) return; curUrl=res.url||url;
        pendingFrac=target; render(res.root); lastFrac=target; saveLast();
        if(!fromSync && follow) pushNav(curUrl, target); })  // my own move drives the group when following
      .catch(function(e){ if(curUrl!==want) return; setStatus('Couldn&rsquo;t load that page. You may be offline, or this app&rsquo;s internet is switched off (the &ldquo;Internet&rdquo; button up top).<br><br><small>'+esc(e&&e.message||'')+'</small>', true); });
  }
  main.addEventListener('click', function(e){
    var a=e.target.closest&&e.target.closest('a'); if(!a||!main.contains(a)) return;
    // This app runs in a srcdoc iframe, whose base URL is the HOST page (run.html).
    // Letting ANY in-doc link follow its href navigates the whole frame to
    // run.html — a blank app. So intercept every anchor: same-site links navigate
    // in-app, in-page (#verse) links scroll, everything else is inert.
    var nav=a.getAttribute('data-nav');
    if(nav){ e.preventDefault(); go(nav, true); return; }
    var anc=a.getAttribute('data-anchor');
    if(anc){ e.preventDefault(); var t=null; try{ t=main.querySelector('[id="'+anc.replace(/["\\\]]/g,'')+'"]'); }catch(_){ } if(t) t.scrollIntoView({block:'start'}); return; }
    if(a.hasAttribute('href')) e.preventDefault();
  });
  // Remember where I am on the page, and — while following in a meeting — carry
  // the group along with my scroll too. Debounced, and muted whenever we're the
  // ones moving the scrollbar (applyingScroll) so followers don't echo forever.
  main.addEventListener('scroll', function(){
    if(applyingScroll) return;
    clearTimeout(scrollSaveT); scrollSaveT=setTimeout(saveLast, 500);
    if(follow && shared){ clearTimeout(scrollPushT); scrollPushT=setTimeout(function(){
      var f=scrollFrac(); if(Math.abs(f-lastFrac)<0.01) return; lastFrac=f; pushNav(curUrl, f); }, 300); }
  }, {passive:true});
  backB.onclick=function(){ if(hi>0){ hi--; go(hist[hi], false); buttons(); } };
  fwdB.onclick=function(){ if(hi<hist.length-1){ hi++; go(hist[hi], false); buttons(); } };
  document.getElementById('reload').onclick=function(){ go(curUrl, false); };
  document.getElementById('home').onclick=function(){ go(HOME, true); };
  document.getElementById('bigger').onclick=function(){ prefs.fs=Math.min(30, prefs.fs+2); applyPrefs(); savePrefs(); };
  document.getElementById('smaller').onclick=function(){ prefs.fs=Math.max(14, prefs.fs-2); applyPrefs(); savePrefs(); };
  document.getElementById('theme').onclick=function(){ prefs.theme=prefs.theme==='night'?'day':'night'; applyPrefs(); savePrefs(); };
  if(followB) followB.onclick=function(){ follow=!follow;
    // Turning follow ON is a JOIN, never a broadcast: pull ME to wherever the
    // group is now — jump to another person's page, or match their scroll on the
    // same page. If there's no one else's spot to join (e.g. I was the last to
    // move), just start following quietly; the next person to turn a page leads.
    // We must NOT publish my own position here, or switching follow back on would
    // yank everyone to me instead of me catching up to them.
    if(follow && lastNav && lastNav.url && lastNav.by!==me.id && lastNav.url!==curUrl) go(lastNav.url, true, true, lastNav.scroll);
    else if(follow && lastNav && lastNav.url===curUrl && lastNav.by!==me.id && typeof lastNav.scroll==='number'){
      applyingScroll=true; applyFrac(lastNav.scroll); lastFrac=lastNav.scroll; setTimeout(function(){ applyingScroll=false; }, 90); }
    updateFollowUi(); };
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='visible' && shared) heartbeat(); });
  window.addEventListener('pagehide', function(){ if(presDb&&me.id){ try{ presDb.delete('p:'+me.id); }catch(e){} } });
  if(window.gifos&&gifos.onBack) gifos.onBack(function(){ if(hi>0){ hi--; go(hist[hi], false); buttons(); } });
  function firstPage(){ if(!prefsDb) return Promise.resolve({url:HOME});
    return prefsDb.get('last')
      .then(function(r){ var u=r&&r.url; return (u&&u.indexOf('https://'+HOST)===0)?{url:u, scroll:r.scroll}:{url:HOME}; }); }
  // Learn who I am, restore MY (private) prefs, then either JOIN whoever's
  // already reading or open my own last page — and from then on stay converged
  // via subscribe() on the two shared collections (nav + presence).
  (window.gifos&&gifos.me?gifos.me():Promise.resolve({id:'',name:''})).then(function(u){ me=u||{id:'',name:''}; })
    .then(function(){ return prefsDb?prefsDb.get('prefs'):null; })
    .then(function(p){ if(p){ if(p.theme) prefs.theme=p.theme; if(typeof p.fs==='number') prefs.fs=p.fs; } applyPrefs(); })
    .then(function(){ return navDb?navDb.getAll():[]; })
    .then(function(navRows){ heartbeat();
      var navRec=null; (navRows||[]).forEach(function(r){ if(r&&r.id==='nav') navRec=r; });
      lastNav=navRec;
      if(presDb&&presDb.subscribe) presDb.subscribe(onPresence);
      if(navDb&&navDb.subscribe) navDb.subscribe(handleSync);
      recompute();
      if(follow && navRec && navRec.by && navRec.by!==me.id && navRec.url){ go(navRec.url, true, true, navRec.scroll); return; }
      return firstPage().then(function(o){ go(o.url, true, false, o.scroll); }); })
    .catch(function(){ applyPrefs(); go(HOME, true); });
</script>`;

  // Speech Coach — showcases brokered capture + on-device DSP. Records a clip
  // via gifos.recordAudio (GifOS shows its own indicator), then analyses pace,
  // pauses and volume entirely locally with the Web Audio API. No network.
  const SPEECHCOACH_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:16px system-ui;margin:0;background:#0a0a0f;color:#e0e0f0;display:flex;flex-direction:column;min-height:100vh}
  header{background:#14141f;border-bottom:1px solid #2a2a3f;padding:14px 18px;font-weight:700;color:#7b5cff}
  main{flex:1;padding:18px;max-width:520px;margin:0 auto;width:100%;box-sizing:border-box}
  .lead{color:#8888aa;font-size:.9rem;line-height:1.5;margin-bottom:16px}
  button{padding:12px 20px;border:0;border-radius:10px;background:#7b5cff;color:#fff;font:inherit;font-weight:700;cursor:pointer}
  button:disabled{opacity:.5}
  .card{background:#14141f;border:1px solid #2a2a3f;border-radius:12px;padding:14px 16px;margin-top:16px}
  .card h3{margin:0 0 8px;font-size:1rem}
  .metric{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #2a2a3f;font-size:.9rem}
  .metric:last-child{border-bottom:0}
  .metric b{color:#7b5cff}
  .tip{color:#ffce6b;font-size:.88rem;margin-top:10px;line-height:1.45}
  audio{width:100%;margin-top:12px}
</style>
<header>Speech Coach</header>
<main>
  <p class="lead">Record up to 12 seconds of yourself talking. It’s analysed right on your device — nothing leaves it — for pace, pauses and volume.</p>
  <button id="rec">● Record &amp; analyse</button>
  <div id="out"></div>
</main>
<script>
const recBtn=document.getElementById('rec'), out=document.getElementById('out');
recBtn.onclick=async()=>{
  if(!window.gifos||!gifos.recordAudio){ out.innerHTML='<div class="card">Open this inside GifOS to use the microphone.</div>'; return; }
  recBtn.disabled=true; out.innerHTML='<div class="card">Recording… speak now.</div>';
  try{
    const clip=await gifos.recordAudio({maxSeconds:12});
    out.innerHTML='<div class="card">Analysing…</div>';
    const AC=window.AudioContext||window.webkitAudioContext; const ctx=new AC();
    const buf=await ctx.decodeAudioData(clip.bytes.slice(0));
    const data=buf.getChannelData(0), sr=buf.sampleRate, dur=buf.duration;
    const fs=Math.max(1,Math.floor(sr*0.03)), frames=[];
    for(let i=0;i+fs<data.length;i+=fs){ let s=0; for(let j=0;j<fs;j++){const v=data[i+j]; s+=v*v;} frames.push(Math.sqrt(s/fs)); }
    const peak=Math.max.apply(null,frames)||1e-6, thr=peak*0.12;
    const voiced=frames.map(f=>f>thr), voicedFrac=voiced.filter(Boolean).length/(voiced.length||1);
    let pauses=0,run=0; const perPause=Math.ceil(0.4/0.03);
    for(const v of voiced){ if(!v){ run++; if(run===perPause) pauses++; } else run=0; }
    const vf=frames.filter((f,i)=>voiced[i]), mean=vf.reduce((a,b)=>a+b,0)/(vf.length||1);
    const sd=Math.sqrt(vf.reduce((a,b)=>a+(b-mean)*(b-mean),0)/(vf.length||1)), cv=mean?sd/mean:0;
    let bursts=0,prev=false; for(const v of voiced){ if(v&&!prev)bursts++; prev=v; }
    const bps=bursts/(dur||1), pace=bps<2.2?'measured':bps>4.2?'quick':'steady';
    const tips=[];
    if(voicedFrac<0.45) tips.push('Lots of silence — fill it with confident delivery, or trim the dead air.');
    if(pauses>=3) tips.push('Several long pauses — a few land, too many lose the room.');
    if(cv>0.7) tips.push('Volume swings a lot — even it out so every word lands.');
    if(pace==='quick') tips.push('You’re quick — slow down on key points to let them sink in.');
    if(pace==='measured'&&voicedFrac>0.6) tips.push('Lovely measured pace — great for clarity.');
    if(!tips.length) tips.push('Well balanced — clear pace, steady volume, natural pauses. 👏');
    const url=URL.createObjectURL(new Blob([clip.bytes],{type:clip.mime}));
    out.innerHTML='<div class="card"><h3>Your delivery</h3>'+
      '<div class="metric"><span>Length</span><b>'+dur.toFixed(1)+'s</b></div>'+
      '<div class="metric"><span>Talking vs silence</span><b>'+Math.round(voicedFrac*100)+'% talking</b></div>'+
      '<div class="metric"><span>Long pauses</span><b>'+pauses+'</b></div>'+
      '<div class="metric"><span>Pace</span><b>'+pace+'</b></div>'+
      '<div class="metric"><span>Volume</span><b>'+(cv<0.4?'steady':cv<0.7?'ok':'uneven')+'</b></div>'+
      '<div class="tip">'+tips.join(' ')+'</div><audio controls src="'+url+'"></audio></div>';
    ctx.close();
  }catch(e){ out.innerHTML='<div class="card">Couldn’t record: '+((e&&e.message)||e)+'</div>'; }
  recBtn.disabled=false;
};
</script>`;

  // Ask AI — showcases gifos.ai. Uses the models the user wired in Settings; the
  // app never sees a key, and it feature-detects so it degrades honestly.
  //
  // The conversation is REMEMBERED: every turn is a record in the private
  // 'chat' collection (undeclared ⇒ private by default — a conversation is
  // nobody else's business), so closing the app and opening it tomorrow picks
  // up where you left off, and the model gets the history back as context.
  // Ordering is by an explicit `seq`, never by record id — the store's
  // auto-ids sort lexicographically, so chat_10 would land before chat_2.
  //
  // NOTHING IS EVER DELETED EXCEPT BY THE DELETE BUTTON. "＋ New chat" used to
  // erase the conversation it was leaving; now it only moves on. Every message
  // carries the id of the conversation it belongs to (`conv`), so the history
  // is DERIVED from the messages themselves — there is no second collection to
  // fall out of step with them, and the only way a chat leaves this computer is
  // the trash button in History, behind an explicit confirm.
  //
  // Everything carries a wall-clock stamp, and an answer also carries what it
  // cost you in time: time-to-first-word (only meaningful when the endpoint
  // streams) and the total. A slow model is then legible as slow rather than
  // as broken.
  //
  // Streaming is the OPTIONAL onDelta on gifos.ai.chat. An endpoint that
  // ignores stream:true, and a Provider app (which answers in one piece),
  // simply never call it — the final r.text is painted either way, so the app
  // is correct on all three paths.
  const ASKAI_HTML = `<!doctype html><meta charset="utf-8">
<style>
  *{box-sizing:border-box} html,body{height:100%}
  body{font:15px system-ui;margin:0;background:#0a0a0f;color:#e0e0f0;display:flex;flex-direction:column;position:relative}
  header{background:#14141f;border-bottom:1px solid #2a2a3f;padding:14px 18px;font-weight:700;color:#7b5cff;display:flex;align-items:center;gap:8px}
  header .sp{flex:1}
  header button{padding:6px 11px;border-radius:999px;border:1px solid #2a2a3f;background:#14141f;color:#8888aa;font:inherit;font-size:.78rem;font-weight:400;cursor:pointer}
  header button:hover{color:#e0e0f0}
  #log{flex:1;overflow-y:auto;padding:14px 18px;display:flex;flex-direction:column;gap:10px}
  .row{display:flex;flex-direction:column;gap:3px;max-width:85%}
  .row.you{align-self:flex-end;align-items:flex-end}
  .row.ai{align-self:flex-start;align-items:flex-start}
  .m{padding:9px 13px;border-radius:12px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
  .m.you{background:#14141f;border:1px solid #7b5cff}
  .m.ai{background:#14141f;border:1px solid #2a2a3f}
  .m.err{border-color:#ff5caa}
  .stamp{color:#8888aa;font-size:.72rem;padding:0 4px;font-variant-numeric:tabular-nums}
  .note{color:#8888aa;font-size:.88rem;padding:16px 18px;line-height:1.5}
  .pick{display:flex;gap:6px;padding:0 18px 8px}
  .pick button{padding:6px 12px;border-radius:999px;border:1px solid #2a2a3f;background:#14141f;color:#8888aa;font-size:.8rem;cursor:pointer}
  .pick button.on{background:#7b5cff;color:#fff;border-color:#7b5cff}
  form{display:flex;gap:8px;padding:12px 18px;border-top:1px solid #2a2a3f}
  input{flex:1;padding:11px 12px;border:1px solid #2a2a3f;border-radius:9px;background:#1c1c2b;color:#e0e0f0;font:inherit}
  form button{padding:11px 16px;border:0;border-radius:9px;background:#7b5cff;color:#fff;font-weight:700;cursor:pointer}
  form button:disabled{opacity:.5;cursor:default}
  /* History — every chat you ever had, searchable, and deletable ONLY here. */
  #hist{position:absolute;inset:0;background:#0a0a0f;display:none;flex-direction:column;z-index:5}
  #hist.on{display:flex}
  .hbar{display:flex;gap:8px;align-items:center;padding:12px 18px;border-bottom:1px solid #2a2a3f}
  .hbar b{color:#7b5cff;white-space:nowrap}
  .hbar button{padding:9px 13px;border-radius:9px;border:1px solid #2a2a3f;background:#14141f;color:#e0e0f0;font:inherit;cursor:pointer}
  #hlist{flex:1;overflow-y:auto;padding:4px 12px 16px}
  .hrow{display:flex;align-items:center;gap:4px;border-bottom:1px solid #14141f}
  .hopen{flex:1;min-width:0;text-align:left;background:none;border:0;color:#e0e0f0;font:inherit;cursor:pointer;padding:9px 8px;border-radius:8px}
  .hopen:hover{background:#14141f}
  .htitle{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .hmeta{display:block;color:#8888aa;font-size:.74rem;font-variant-numeric:tabular-nums;margin-top:3px}
  .hrow.cur .hmeta{color:#7b5cff}
  button.row-del{background:none;border:0;color:#8888aa;cursor:pointer;padding:.4rem .45rem;line-height:0;border-radius:.35rem;flex:0 0 auto}
  button.row-del:hover{color:#ff5caa;background:#14141f}
  .hconfirm{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:9px 8px;font-size:.86rem;color:#8888aa}
  .hconfirm button{padding:5px 11px;border-radius:8px;border:1px solid #2a2a3f;background:#14141f;color:#e0e0f0;font:inherit;font-size:.82rem;cursor:pointer}
  .hconfirm button.yes{border-color:#ff5caa;color:#ff5caa}
  .hempty{color:#8888aa;padding:18px 8px;line-height:1.5}
</style>
<header>Ask AI<span class="sp"></span><button id="histbtn" title="Every chat you have had, searchable">🕘 History</button><button id="new" title="Start a new chat — this one is kept in History">＋ New chat</button></header>
<div id="log"></div>
<div class="pick"><button data-m="cheapest" class="on">Cheapest</button><button data-m="smartest">Smartest</button></div>
<form id="f"><input id="t" placeholder="Ask anything…" autocomplete="off"><button id="send">Send</button></form>
<div id="hist"><div class="hbar"><b>Your chats</b><input id="hq" placeholder="Search by keyword…" autocomplete="off"><button id="hclose">Close</button></div><div id="hlist"></div></div>
<script>
const log=document.getElementById('log'), input=document.getElementById('t'), sendBtn=document.getElementById('send');
const histBox=document.getElementById('hist'), hlist=document.getElementById('hlist'), hq=document.getElementById('hq');
const CTX_MAX=40;                       // turns of memory handed back to the model
const DEL='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
let model='cheapest', db=null, prefs=null, busy=false;
let all=[];                             // every message ever, across every chat
let hist=[], conv=null, seq=0;          // the chat on screen, and its id
let pendingDel=null;                    // the chat whose delete is awaiting a yes
const pad=n=>(n<10?'0':'')+n;
function stamp(ts){ const d=new Date(ts);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds()); }
function stampMin(ts){ return stamp(ts).slice(0,16); }
function secs(ms){ return ms<1000?(Math.round(ms)+'ms'):((ms/1000).toFixed(1)+'s'); }
function esc(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function metaOf(r){
  const bits=[stamp(r.ts)];
  if(r.role==='assistant'){
    if(r.model) bits.push(r.model);
    if(r.firstMs!=null) bits.push('first word '+secs(r.firstMs));
    // A finished answer that never sent a first word did not stream. Say so:
    // silence here is how "GifOS is broken" and "this model answers in one
    // piece" became the same thing to look at.
    else if(r.ms!=null&&!r.error) bits.push('no streaming from this model');
    if(r.ms!=null) bits.push(secs(r.ms)+' total');
  }
  return bits.join(' · ');
}
function bottom(){ log.scrollTop=log.scrollHeight; }
function draw(r){
  const row=document.createElement('div'); row.className='row '+(r.role==='user'?'you':'ai');
  const b=document.createElement('div'); b.className='m '+(r.role==='user'?'you':'ai'); if(r.error) b.classList.add('err');
  b.textContent=r.content||'';
  const s=document.createElement('div'); s.className='stamp'; s.textContent=metaOf(r);
  row.appendChild(b); row.appendChild(s); log.appendChild(row); bottom();
  return {bubble:b, stamp:s};
}
function note(html){ const d=document.createElement('div'); d.className='note'; d.innerHTML=html; log.appendChild(d); bottom(); return d; }
function uid(p){ return (p||'m')+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
// One write path. all[] is the in-memory mirror of the collection, so the
// history list and the search see a message the instant it is sent.
function save(r){ all.push(r); if(db) db.put(r).catch(()=>{}); }
// What the model is told. Failed turns are shown but never sent — an error
// bubble is this app talking, not the assistant, and feeding it back would
// teach the model to apologise for GifOS.
function context(){
  return hist.filter(r=>!r.error&&r.content).slice(-CTX_MAX).map(r=>({role:r.role,content:r.content}));
}
function setModel(m){
  model=(m==='smartest')?'smartest':'cheapest';
  document.querySelectorAll('.pick button').forEach(x=>x.classList.toggle('on',x.dataset.m===model));
}
function remember(){ if(prefs) prefs.put({id:'askai',model:model,conv:conv}).catch(()=>{}); }
document.querySelectorAll('.pick button').forEach(b=>b.onclick=()=>{ setModel(b.dataset.m); remember(); });

// ---- the history, derived from the messages -------------------------------
// Grouped by conv, newest first. Messages written before conversations
// existed carry no id; they are one chat, stamped 'c0' once at boot.
function conversations(){
  const by={};
  for(const r of all){ const c=r.conv||'c0'; (by[c]||(by[c]=[])).push(r); }
  return Object.keys(by).map(id=>{
    const msgs=by[id].slice().sort((a,b)=>(a.seq||0)-(b.seq||0)||(a.ts-b.ts));
    return {id:id, msgs:msgs, started:msgs[0].ts, updated:msgs[msgs.length-1].ts};
  }).sort((a,b)=>b.updated-a.updated);
}
// The list shows the opening words, because that is what you remember a chat by.
function titleOf(c){
  const first=c.msgs.filter(m=>m.role==='user'&&m.content)[0]||c.msgs[0];
  const t=String((first&&first.content)||'').replace(/\\s+/g,' ').trim();
  return t?(t.length>72?t.slice(0,72)+'…':t):'Empty chat';
}
// Search reads the WHOLE chat, not just its title: you look for the answer you
// half-remember as often as for the question you asked. Every word must appear.
function matches(c,words){
  if(!words.length) return true;
  const h=(titleOf(c)+' '+c.msgs.map(m=>m.content||'').join(' ')).toLowerCase();
  return words.every(w=>h.indexOf(w)>=0);
}
function renderHistory(){
  const words=hq.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);
  const list=conversations().filter(c=>matches(c,words));
  if(!list.length){
    hlist.innerHTML='<div class="hempty">'+(words.length
      ? 'No chat mentions “'+esc(hq.value.trim())+'”.'
      : 'No chats yet. Everything you ask is kept here until you delete it.')+'</div>';
    return;
  }
  hlist.innerHTML=list.map(c=>{
    const n=c.msgs.length+' message'+(c.msgs.length===1?'':'s');
    if(pendingDel===c.id) return '<div class="hrow" data-c="'+esc(c.id)+'"><div class="hconfirm">'+
      '<span>Delete this chat and its '+n+'?</span>'+
      '<button class="yes" data-del="'+esc(c.id)+'">Delete</button><button class="no">Keep it</button></div></div>';
    return '<div class="hrow'+(c.id===conv?' cur':'')+'" data-c="'+esc(c.id)+'">'+
      '<button class="hopen" data-open="'+esc(c.id)+'">'+
        '<span class="htitle">'+esc(titleOf(c))+'</span>'+
        '<span class="hmeta">'+stampMin(c.updated)+' · '+n+(c.id===conv?' · open now':'')+'</span></button>'+
      '<button class="row-del" data-ask="'+esc(c.id)+'" title="Delete this chat">'+DEL+'</button></div>';
  }).join('');
}
function openHistory(){ pendingDel=null; hq.value=''; renderHistory(); histBox.classList.add('on'); try{ hq.focus(); }catch(e){} }
function closeHistory(){ histBox.classList.remove('on'); pendingDel=null; }
document.getElementById('histbtn').onclick=()=>histBox.classList.contains('on')?closeHistory():openHistory();
document.getElementById('hclose').onclick=closeHistory;
hq.oninput=renderHistory;
hlist.onclick=async e=>{
  const open=e.target.closest('[data-open]'); if(open){ closeHistory(); openConv(open.dataset.open); return; }
  const ask=e.target.closest('[data-ask]'); if(ask){ pendingDel=ask.dataset.ask; renderHistory(); return; }
  const del=e.target.closest('[data-del]'); if(del){ await deleteConv(del.dataset.del); pendingDel=null; renderHistory(); return; }
  if(e.target.closest('.no')){ pendingDel=null; renderHistory(); }
};
function openConv(id){
  const c=conversations().filter(x=>x.id===id)[0]; if(!c) return;
  conv=id; hist=c.msgs.slice(); seq=0;
  for(const r of hist) seq=Math.max(seq,r.seq||0);
  log.innerHTML=''; hist.forEach(draw);
  note('Reopened this chat from '+stampMin(c.started)+' — keep typing and it carries on.');
  remember();
}
// The ONLY thing in this app that erases anything, and it is one button click
// plus a confirm away from nothing happening.
async function deleteConv(id){
  const gone=all.filter(r=>(r.conv||'c0')===id);
  all=all.filter(r=>(r.conv||'c0')!==id);
  for(const r of gone){ try{ await db.delete(r.id); }catch(e){} }
  if(id===conv) startNew(true);
}
function startNew(quiet){
  conv=uid('c'); hist=[]; seq=0; log.innerHTML=''; remember();
  if(!quiet) note('New chat. The one you were in is saved — press <b>🕘 History</b> to find it again.');
}
document.getElementById('new').onclick=()=>{
  if(busy) return;
  if(!hist.length){ note('This chat is already empty — ask something.'); return; }
  startNew();
};
(async()=>{
  if(!window.gifos||!gifos.ai){ note('Open this inside GifOS to use AI.'); return; }
  db=gifos.db('chat'); prefs=gifos.db('prefs');
  const p=await prefs.get('askai').catch(()=>null);
  if(p&&p.model) setModel(p.model);
  let convs=[];
  try{
    const raw=await db.getAll();
    all=(raw||[]).filter(r=>r&&r.role&&r.ts!=null);
    // Records from before this app had a history belong to one chat. Stamp them
    // in place, once, so that chat has a stable id like any other.
    for(const r of all){ if(!r.conv){ r.conv='c0'; try{ await db.put(r); }catch(e){} } }
    convs=conversations();
    const want=(p&&p.conv)||null;
    // A remembered id with no messages is a chat the user started and left
    // empty — honour it rather than dragging the previous one back.
    const pick=want?(convs.filter(c=>c.id===want)[0]||null):(convs[0]||null);
    conv=want||(pick?pick.id:uid('c'));
    if(pick){ hist=pick.msgs.slice(); for(const r of hist) seq=Math.max(seq,r.seq||0); hist.forEach(draw); }
  }catch(e){ note('Couldn’t read your saved chats: '+((e&&e.message)||e)); }
  if(!conv) conv=uid('c');
  const others=convs.length-(hist.length?1:0);
  if(hist.length) note('Picking up where you left off — '+hist.length+' message'+(hist.length===1?'':'s')+' from '+stampMin(hist[0].ts)+'.'+
    (others>0?' '+others+' other chat'+(others===1?'':'s')+' in <b>🕘 History</b>.':''));
  else if(others>0) note('New chat. Your '+others+' earlier chat'+(others===1?'':'s')+' '+(others===1?'is':'are')+' in <b>🕘 History</b>.');
  remember();
  const m=await gifos.ai.models().catch(()=>({available:[]}));
  if(!(m.available||[]).includes('cheapest')&&!(m.available||[]).includes('smartest'))
    note('No AI model is set up yet. On your GifOS Home Screen open <b>Settings → AI models</b>, add an OpenAI-compatible endpoint + key for “Cheapest text LLM” or “Smartest text LLM”, press <b>Test</b>, then come back. Your key stays in your browser — this app never sees it.');
})();
document.getElementById('f').onsubmit=async e=>{
  e.preventDefault(); const q=input.value.trim(); if(!q||busy)return; input.value='';
  busy=true; sendBtn.disabled=true;
  const u={id:uid(),conv:conv,seq:++seq,role:'user',content:q,ts:Date.now()};
  hist.push(u); draw(u); save(u);
  const a={id:uid(),conv:conv,seq:++seq,role:'assistant',content:'',ts:Date.now(),model:model};
  const el=draw(a); el.bubble.textContent='…';
  const t0=Date.now(); let first=null, streamed='';
  try{
    const r=await gifos.ai.chat({model:model,messages:context(),onDelta:piece=>{
      if(first===null){ first=Date.now()-t0; a.firstMs=first; el.bubble.textContent=''; }
      streamed+=piece; el.bubble.textContent=streamed; el.stamp.textContent=metaOf(a); bottom();
    }});
    a.content=((r&&r.text)||streamed||'(no answer)');
    a.ms=Date.now()-t0;
    el.bubble.textContent=a.content;
  }catch(err){
    a.error=true; a.content='⚠ '+((err&&err.message)||err); a.ms=Date.now()-t0;
    el.bubble.classList.add('err'); el.bubble.textContent=a.content;
  }
  el.stamp.textContent=metaOf(a);
  hist.push(a); save(a); bottom();
  busy=false; sendBtn.disabled=false; input.focus();
};
</script>`;

  // Reader — paste anything, the computer reads it aloud via the brokered
  // Text → speech role (gifos.ai.tts). It neither knows nor cares WHO serves
  // the role: a cloud endpoint, or a Provider app like Offline Text to Speech answering
  // entirely on-device (docs/providers.md) — the consumer side of the
  // provider story. Long text is read in sentence chunks with one chunk of
  // lookahead synthesis, so speech starts fast and never stutters.
  const READER_HTML = `<!doctype html><meta charset="utf-8">
<style>
  *{box-sizing:border-box} html,body{height:100%}
  body{font:15px system-ui;margin:0;background:#0a0a0f;color:#e0e0f0;display:flex;flex-direction:column}
  header{background:#14141f;border-bottom:1px solid #2a2a3f;padding:14px 18px;font-weight:700;color:#7b5cff;display:flex;align-items:center;gap:10px}
  header .sp{flex:1}
  #text{flex:1;margin:14px 18px 8px;padding:12px 13px;border:1px solid #2a2a3f;border-radius:10px;background:#1c1c2b;color:#e0e0f0;font:inherit;line-height:1.55;resize:none}
  .bar{display:flex;gap:8px;align-items:center;padding:10px 18px 14px}
  select{padding:9px 10px;border:1px solid #2a2a3f;border-radius:9px;background:#14141f;color:#e0e0f0;font:inherit}
  .bar button{padding:11px 16px;border:0;border-radius:9px;background:#7b5cff;color:#fff;font-weight:700;cursor:pointer}
  .bar button:disabled{opacity:.5;cursor:default}
  .bar button.ghost{background:#14141f;border:1px solid #2a2a3f;color:#e0e0f0;font-weight:400}
  #status{color:#8888aa;font-size:.82rem;padding:0 18px 12px;min-height:1.1em}
  .note{color:#8888aa;font-size:.88rem;padding:0 18px 12px;line-height:1.5}
</style>
<header>📖 Reader<span class="sp"></span></header>
<textarea id="text" placeholder="Paste or type anything here, then press Read aloud."></textarea>
<div class="bar">
  <select id="voice"><option value="">Default voice</option><option value="nova">Nova</option><option value="shimmer">Shimmer</option><option value="fable">Fable</option><option value="echo">Echo</option><option value="onyx">Onyx</option><option value="alloy">Alloy</option></select>
  <button id="read">🔊 Read aloud</button>
  <button id="stop" class="ghost" style="display:none">■ Stop</button>
</div>
<div id="status"></div>
<div class="note" id="note" style="display:none"></div>
<script>
const T=document.getElementById('text'), V=document.getElementById('voice');
const readBtn=document.getElementById('read'), stopBtn=document.getElementById('stop');
const status=document.getElementById('status'), note=document.getElementById('note');
let db=null, playing=false, session=0;
function say(m){ status.textContent=m||''; }
// Sentence-ish chunks (~600 chars) so the first audio arrives fast and long
// reads never hit a provider's per-request ceiling.
function playBytes(r){ return new Promise((res,rej)=>{
  const url=URL.createObjectURL(new Blob([r.bytes],{type:r.mime||'audio/mpeg'}));
  const a=new Audio(url); window.__cur=a;
  a.onended=()=>{ URL.revokeObjectURL(url); res(); };
  a.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error('could not play the audio')); };
  a.play().catch(rej);
}); }
// LEARN HOW FAST THIS VOICE IS, then size the passages to suit it. Reader
// cannot know who serves Text -> speech — a cloud endpoint, a formant
// synthesiser, or a neural model on this very device — and those differ by two
// ORDERS OF MAGNITUDE. So do not guess: time the first passage, and pick the
// budget from what actually came back.
// A chunk's synthesis time is dead air at the end of the previous one, so the
// budget targets ~15s of work per passage: fast providers land on the 600-char
// cap and read in long, well-shaped runs, while a provider running near real
// time settles around 150 and trades one long silence for short, even ones.
let msPerChar=0;                     // measured, EMA over the passages so far
function budgetNow(first){
  if(first) return 1;                // the first passage is ONE SENTENCE: the
                                     // whole point is to start talking early
  if(!msPerChar) return 120;         // second passage, speed still unknown, so
                                     // take the SMALLEST bite: it costs a fast
                                     // provider one extra trivial call and
                                     // saves a slow one a 20s hole (measured:
                                     // a 200-char second passage left a 19s
                                     // silence after the opening sentence)
  return Math.max(120,Math.min(600,Math.round(15000/msPerChar)));
}
function sentencesOf(text){ return String(text).split(/(?<=[.!?\\n])\\s+/).filter(s=>s.trim()); }
function takeChunk(sents,i,first){
  const budget=budgetNow(first); let cur='';
  while(i<sents.length&&(!cur||(cur+' '+sents[i]).length<=budget)){ cur=cur?cur+' '+sents[i]:sents[i]; i++; }
  return {text:cur,next:i};
}
async function readAloud(){
  const text=T.value.trim(); if(!text){ say('Nothing to read yet.'); return; }
  const my=++session; playing=true; readBtn.style.display='none'; stopBtn.style.display='';
  if(db) db.put({id:'current',text:text}).catch(()=>{});
  const sents=sentencesOf(text); msPerChar=0;
  // THE FIRST CALL IS NOT A SPEED SAMPLE. It also pays for mounting the
  // provider and loading its model — measured at ~11s for an on-device neural
  // voice — so timing it says the voice is ~370 ms/character when the truth is
  // ~120, and every later passage comes out as a 40-character fragment that
  // reads badly. Warm calls only, hence the modest 200 for the second passage
  // while nothing is known yet.
  const speak=(c,cold)=>{
    const t0=Date.now(), chars=c.length;
    return gifos.ai.tts(Object.assign({text:c},V.value?{voice:V.value}:{})).then(r=>{
      if(!cold){ const per=(Date.now()-t0)/Math.max(1,chars); msPerChar=msPerChar?(msPerChar*0.5+per*0.5):per; }
      return r;
    });
  };
  try{
    let cut=takeChunk(sents,0,true);
    let next=speak(cut.text,true), n=0;
    while(playing&&my===session){
      const audio=await next;
      const after=takeChunk(sents,cut.next,false);      // sized by what we just learned
      next=after.text?speak(after.text):null;           // synthesize ahead while playing
      cut=after; n++;
      if(!playing||my!==session) break;
      say('Reading… ('+n+(next?' of '+(n+1)+'+':' — last')+')');
      await playBytes(audio);
      if(!next) break;
    }
    if(playing&&my===session) say('Done.');
  }catch(err){ say('⚠ '+((err&&err.message)||err)); }
  playing=false; readBtn.style.display=''; stopBtn.style.display='none';
}
readBtn.onclick=readAloud;
stopBtn.onclick=()=>{ playing=false; session++; if(window.__cur){ try{ window.__cur.pause(); }catch(e){} } say('Stopped.'); readBtn.style.display=''; stopBtn.style.display='none'; };
(async()=>{
  if(!window.gifos||!gifos.ai){ note.style.display=''; note.innerHTML='Open this inside GifOS to use it.'; return; }
  db=gifos.db('texts');
  db.get('current').then(d=>{ if(d&&d.text&&!T.value) T.value=d.text; }).catch(()=>{});
  const m=await gifos.ai.models().catch(()=>({available:[]}));
  if(!(m.available||[]).includes('tts')){
    note.style.display='';
    note.innerHTML='No <b>Text → speech</b> is set up yet. Easiest fix: install <b>Offline Text to Speech</b> from the App Store — a free Provider app that speaks entirely on this device (no account, no key). Or add an OpenAI-compatible endpoint under <b>Settings → AI models</b>. Then come back.';
  }
})();
</script>`;

  function manifest(appId, name, accent, extra) {
    return JSON.stringify(Object.assign({
      gifos: '1.0', appId, name, version: '0.2.0', entry: 'index.html', accent,
      capabilities: { db: true, multiplayer: true, network: [] },
    }, extra || {}));
  }

  // ---- theme the seeded apps ------------------------------------------------
  // Seeding runs on the specific computer, so its theme (gifos-themes.js) is
  // known. The recurring "chrome" hexes below map to CSS variables (their old
  // value kept as the fallback, so Aurora is byte-for-byte unchanged), and the
  // computer's palette is injected as a :root block. Because that block is
  // baked into the GIF, a stolen app keeps its birthplace's colours wherever it
  // travels — the same rule the icon art already follows.
  //
  // Two intensities: FULL repaints a chrome app end to end; ACCENT only swaps
  // the highlight colours, so a game keeps the exact board/piece palette it was
  // drawn for (a near-white themed surface would erase a chess board) while
  // still wearing the computer's accent. Rewrites touch ONLY <style> blocks —
  // never <script>, where a canvas fillStyle can't take a var().
  const FULL_MAP = [
    ['#0a0a0f', 'var(--bg,#0a0a0f)'], ['#faf9ff', 'var(--bg,#faf9ff)'],
    ['#14141f', 'var(--surface,#14141f)'], ['#1c1c2b', 'var(--surface,#1c1c2b)'],
    ['#2a2a3f', 'var(--border,#2a2a3f)'], ['#e0e0f0', 'var(--text,#e0e0f0)'],
    ['#8888aa', 'var(--muted,#8888aa)'],
    ['#7b5cff', 'var(--accent,#7b5cff)'], ['#ff5caa', 'var(--accent2,#ff5caa)'],
    ['color:#fff', 'color:var(--onaccent,#fff)'], ['background:#fff', 'background:var(--surface,#fff)'],
    // IRL party-game shell (irl-apps.js STYLE): cream paper + ink outline. These
    // hexes are used only there, so mapping them recolours every IRL game's
    // shared chrome and per-game extras in one place.
    ['#faf7ef', 'var(--bg,#faf7ef)'], ['#2b2440', 'var(--text,#2b2440)'], ['#7a7391', 'var(--muted,#7a7391)'],
  ];
  const ACCENT_MAP = [
    ['#7b5cff', 'var(--accent,#7b5cff)'], ['#ff5caa', 'var(--accent2,#ff5caa)'],
    ['color:#fff', 'color:var(--onaccent,#fff)'],
  ];
  function themeVars(ui) {
    const v = (k, d) => ui[k] || d;
    return '<style>:root{' +
      '--bg:' + v('bg', '#0a0a0f') + ';--surface:' + v('surface', '#14141f') +
      ';--border:' + v('border', '#2a2a3f') + ';--text:' + v('text', '#e0e0f0') +
      ';--muted:' + v('muted', '#8888aa') + ';--accent:' + v('accent', '#7b5cff') +
      ';--accent2:' + v('accent2', '#ff5caa') + ';--onaccent:' + v('onaccent', '#fff') + '}</style>';
  }
  function themeHtml(html, mode) {
    const ui = GifOS.theme && GifOS.theme.ui;
    if (!ui) return html; // Aurora / home: ship the hand-tuned originals untouched
    // 'vars'  — the app already references CSS variables by hand (the games);
    //           just inject the palette, no blind hex swap.
    // 'accent'— only recolour highlights.
    // 'full'  — remap the shared chrome hexes (chrome apps).
    const map = mode === 'vars' ? [] : mode === 'accent' ? ACCENT_MAP : FULL_MAP;
    const out = map.length ? html.replace(/<style>[\s\S]*?<\/style>/g, (block) => {
      let b = block; for (const p of map) b = b.split(p[0]).join(p[1]); return b;
    }) : html;
    return out.includes('<meta charset="utf-8">')
      ? out.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + themeVars(ui))
      : themeVars(ui) + out;
  }

  // My Media — a personal library for images, audio and video with built-in
  // players. Metadata (name, type, category, a small thumbnail) lives in the
  // subscribed 'media' collection; the raw bytes live per-item in 'blobs',
  // fetched only when you open something (so the grid stays light). Add from
  // files, or capture straight in with the brokered camera/mic. Open an item
  // to play it, or Download it back out as a real file. All local.
  const MYMEDIA_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box} html,body{height:100%}
  body{margin:0;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);font:13px system-ui,sans-serif;display:flex;flex-direction:column}
  header{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f)}
  header h1{font-size:.92rem;font-weight:800;margin:0;flex:1;color:var(--accent,#ff7850);white-space:nowrap}
  button{font:inherit;cursor:pointer;border-radius:8px}
  .btn{padding:5px 10px;border:0;background:var(--accent,#ff7850);color:var(--onaccent,#2a1000);font-weight:700}
  .btn.ghost{background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0);border:1px solid var(--border,#2a2a3f)}
  #cap{display:flex;gap:4px}
  #cap button{padding:4px 7px;border:1px solid var(--border,#2a2a3f);background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0);font-size:14px}
  #bar{display:flex;gap:6px;align-items:center;padding:6px 10px;flex-wrap:wrap;border-bottom:1px solid var(--border,#2a2a3f)}
  .seg{display:inline-flex;border:1px solid var(--border,#2a2a3f);border-radius:8px;overflow:hidden}
  .seg button{padding:4px 9px;border:0;background:transparent;color:var(--muted,#8888aa);font-size:.78rem}
  .seg button.on{background:var(--accent,#ff7850);color:var(--onaccent,#2a1000);font-weight:700}
  select{font:inherit;font-size:.78rem;padding:4px 8px;border-radius:8px;border:1px solid var(--border,#2a2a3f);background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0)}
  #count{margin-left:auto;color:var(--muted,#8888aa);font-size:.72rem}
  #grid{flex:1;overflow-y:auto;padding:8px 10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;align-content:start}
  .card{background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:9px;overflow:hidden;cursor:pointer;transition:transform .1s}
  .card:active{transform:scale(.97)}
  .thumb{position:relative;aspect-ratio:1/1;background:#0c0c14 center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:26px}
  .thumb .kind{position:absolute;top:4px;left:4px;background:rgba(0,0,0,.55);border-radius:5px;padding:0 5px;font-size:10px}
  .thumb .shared{position:absolute;top:4px;right:4px;background:color-mix(in srgb,var(--accent,#ff7850) 88%,#000);color:#fff;border-radius:5px;padding:0 5px;font-size:10px;font-weight:700}
  .thumb .play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:24px;text-shadow:0 2px 8px #000;color:#fff}
  .meta{padding:4px 6px}
  .meta .nm{font-size:.72rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .meta .cat{display:inline-block;margin-top:3px;font-size:.62rem;color:var(--accent,#ff7850);background:color-mix(in srgb,var(--accent,#ff7850) 16%,transparent);border-radius:4px;padding:0 5px}
  #empty{flex:1;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--muted,#8888aa);padding:2rem}
  #empty .big{font-size:44px;margin-bottom:.5rem}
  #drop{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:color-mix(in srgb,var(--accent,#ff7850) 22%,rgba(0,0,0,.6));font-size:1.2rem;font-weight:700;color:#fff;z-index:20;border:4px dashed #fff}
  #modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.82);z-index:30;padding:16px}
  .box{background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:14px;max-width:640px;width:100%;max-height:92vh;overflow:auto}
  .stage{background:#000;display:flex;align-items:center;justify-content:center;min-height:200px;max-height:60vh}
  .stage img,.stage video{max-width:100%;max-height:60vh;display:block}
  .stage audio{width:90%;margin:2rem 5%}
  .info{padding:14px 16px;display:flex;flex-direction:column;gap:10px}
  .info .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .info input[type=text]{flex:1;min-width:120px;padding:8px 10px;border-radius:8px;border:1px solid var(--border,#2a2a3f);background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);font:inherit}
  .info .sub{color:var(--muted,#8888aa);font-size:.78rem}
  .danger{background:#3a1717;color:#ff9a9a;border:1px solid #5a2626;padding:8px 12px}
  #toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#000c;color:#fff;padding:8px 14px;border-radius:10px;font-size:.85rem;opacity:0;transition:opacity .25s;pointer-events:none;z-index:40;max-width:88%}
  #visrow{align-items:center}
  .tgl{position:relative;display:inline-flex;align-items:center;cursor:pointer;flex:0 0 auto}
  .tgl input{position:absolute;opacity:0;width:0;height:0}
  .tgl .tslide{width:44px;height:26px;border-radius:14px;background:var(--border,#2a2a3f);transition:background .15s;position:relative;flex:0 0 auto}
  .tgl .tslide::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .15s}
  .tgl input:checked + .tslide{background:var(--accent,#ff7850)}
  .tgl input:checked + .tslide::after{transform:translateX(18px)}
  .visinfo .vt{font-weight:600;font-size:.9rem}
  #toast.on{opacity:1}
  #mgif,#mfliph,#mflipv,#mclip,#mrev{display:none}
  #gifpanel{display:none}
  #gifpanel.on{display:flex}
  #gifpanel.clip #gifbudget,#gifpanel.clip #gifspeeds,#gifpanel.clip .gifspeed-label{display:none}
  #gifpanel.aclip #filmstrip,#gifpanel.aclip #gifbudget,#gifpanel.aclip #gifspeeds,#gifpanel.aclip .gifspeed-label{display:none}
  .box.gifing .stage{max-height:36vh}
  .box.gifing .stage video{max-height:36vh}
  #filmstrip{display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:2px 0 4px}
  #filmstrip img{width:64px;height:48px;object-fit:cover;border-radius:6px;flex:0 0 auto;border:2px solid transparent;background:#000;cursor:pointer}
  #filmstrip img.on{border-color:var(--accent,#ff7850)}
  .gifrange{position:relative;height:44px;margin:2px 22px;touch-action:none;user-select:none}
  .gifrange-track{position:absolute;left:0;right:0;top:50%;height:8px;margin-top:-4px;background:var(--border,#2a2a3f);border-radius:4px}
  .gifrange-fill{position:absolute;top:0;bottom:0;background:var(--accent,#ff7850);border-radius:4px}
  .gifrange-h{position:absolute;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:var(--accent,#ff7850);border:3px solid #fff;box-shadow:0 1px 8px #0007;z-index:2;touch-action:none;cursor:grab}
  #giftimes{display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted,#8888aa)}
  #gifbudget{font-size:.82rem;font-weight:650}
  #gifbudget.warn{color:#ff9a9a}
  #gifspeeds{width:100%}
  #gifspeeds button{flex:1;min-width:44px;padding:8px 2px}
  #gifgo:disabled{opacity:.45}
</style></head><body>
<header>
  <h1>My Media</h1>
  <span id="cap"></span>
  <button class="btn" id="add">＋ Add</button>
</header>
<div id="bar">
  <span class="seg" id="types">
    <button data-t="all" class="on">All</button>
    <button data-t="image">🖼</button>
    <button data-t="audio">🎵</button>
    <button data-t="video">🎬</button>
  </span>
  <select id="cat"><option value="all">All categories</option></select>
  <span id="count"></span>
</div>
<div id="grid"></div>
<div id="empty"><div class="big">🎞️</div><div><b>No media yet</b></div><div class="sub" style="margin-top:.4rem">Tap <b>＋ Add</b> to import photos, audio or video — or drop files anywhere.</div></div>
<input type="file" id="fi" accept="image/*,audio/*,video/*" multiple hidden>
<div id="drop">Drop to add to your library</div>
<div id="modal"><div class="box">
  <div class="stage" id="stage"></div>
  <div class="info" id="detail">
    <input type="text" id="mname" placeholder="Name">
    <div class="row"><span class="sub">Category</span><input type="text" id="mcat" list="cats" placeholder="Unsorted"><button class="btn ghost" id="msave">Save</button></div>
    <datalist id="cats"></datalist>
    <div class="row" id="visrow" style="display:none"><label class="tgl"><input type="checkbox" id="mvis"><span class="tslide"></span></label><div class="visinfo"><div class="vt">Visible to invited guests</div><span class="sub" id="vishint">Private — only you can see it.</span></div></div>
    <div class="row"><span class="sub" id="minfo"></span><span style="flex:1"></span><button class="btn ghost" id="mfliph">Flip ↔️</button><button class="btn ghost" id="mflipv">Flip ↕️</button><button class="btn ghost" id="mclip">Clip</button><button class="btn ghost" id="mrev">Reverse</button><button class="btn" id="mgif">Make GIF</button><button class="btn ghost" id="mdown">Download</button><button class="danger" id="mdel">Delete</button><button class="btn ghost" id="mclose">Close</button></div>
  </div>
  <div class="info" id="gifpanel">
    <div id="filmstrip"></div>
    <div class="gifrange" id="gifrange">
      <div class="gifrange-track"><div class="gifrange-fill" id="giffill"></div></div>
      <div class="gifrange-h" id="gifh0"></div>
      <div class="gifrange-h" id="gifh1"></div>
    </div>
    <div id="giftimes"><span id="gifta"></span><span id="giftd"></span><span id="giftb"></span></div>
    <div id="gifbudget"></div>
    <div class="sub gifspeed-label">Speed</div>
    <div class="seg" id="gifspeeds">
      <button data-s="0.25">0.25×</button>
      <button data-s="0.5">0.5×</button>
      <button data-s="1" class="on">1×</button>
      <button data-s="1.25">1.25×</button>
      <button data-s="1.5">1.5×</button>
      <button data-s="2">2×</button>
    </div>
    <div class="row"><button class="btn" id="gifgo">Make GIF</button><button class="btn ghost" id="gifstop" style="display:none">Stop</button><button class="btn ghost" id="gifback">Cancel</button></div>
    <div id="gifprog" class="sub"></div>
  </div>
</div></div>
<div id="toast"></div>
<script src="gifenc.js"></script>
<script>
  var media = gifos.db('media'), blobs = gifos.db('blobs');
  var MAX = 25 * 1024 * 1024;
  var items = [], fType = 'all', fCat = 'all', curUrl = null, cur = null, owner = false;
  var gifAbort=false, gifBusy=false, gifSpeed=1, gifStart=0, gifEnd=0, gifSavedT=0, filmGen=0, panelMode='gif';
  var GIF_FPS=10, MAX_OUT_SEC=8, MAX_FRAMES=80, MAX_SIDE=480;
  // Only the library's owner (the host) can change what's shared. A guest view
  // sees the host's opted-in items plus its own private captures, read-only.
  if (window.gifos && gifos.info) gifos.info().then(function(i){ owner = !!(i && i.owner); if(cur) syncVisRow(); }).catch(function(){});
  function isVisible(m){ return !!(m && (m._vis==='read-only' || m._vis==='read-write')); }
  var grid = document.getElementById('grid'), gEmpty = document.getElementById('empty');
  function esc(s){ var d=document.createElement('div'); d.textContent=s==null?'':s; return d.innerHTML; }
  var toastT; function toast(m, hold){ var t=document.getElementById('toast'); t.textContent=m; t.classList.add('on'); clearTimeout(toastT); if(!hold) toastT=setTimeout(function(){ t.classList.remove('on'); }, 2600); }
  var KIND={ image:'🖼', audio:'🎵', video:'🎬' };
  function fmtSize(n){ n=+n||0; return n>=1e6?(n/1e6).toFixed(1)+' MB':n>=1024?Math.round(n/1024)+' KB':n+' B'; }

  // ---- thumbnails: a small jpeg baked at import so the grid never loads blobs ----
  function downscale(src, w, h){ if(!w||!h) return '';
    var max=280, sc=Math.min(1, max/Math.max(w,h));
    var c=document.createElement('canvas'); c.width=Math.max(1,Math.round(w*sc)); c.height=Math.max(1,Math.round(h*sc));
    try{ c.getContext('2d').drawImage(src,0,0,c.width,c.height); return c.toDataURL('image/jpeg',0.7); }catch(e){ return ''; } }
  function makeThumb(blob, type){ return new Promise(function(res){
    var url=URL.createObjectURL(blob);
    if(type==='image'){ var img=new Image(); img.onload=function(){ res(downscale(img,img.naturalWidth,img.naturalHeight)); URL.revokeObjectURL(url); }; img.onerror=function(){ URL.revokeObjectURL(url); res(''); }; img.src=url; return; }
    if(type==='video'){ var v=document.createElement('video'); v.muted=true; v.playsInline=true; var done=false;
      function fin(){ if(done) return; done=true; res(downscale(v,v.videoWidth,v.videoHeight)); URL.revokeObjectURL(url); }
      v.onloadeddata=function(){ try{ v.currentTime=Math.min(0.4,(v.duration||1)/3); }catch(e){ fin(); } };
      v.onseeked=fin; v.onerror=function(){ URL.revokeObjectURL(url); res(''); }; setTimeout(fin,2500); v.src=url; return; }
    URL.revokeObjectURL(url); res(''); // audio: icon only
  }); }

  function typeOf(mime){ mime=String(mime||''); return mime.indexOf('image/')===0?'image':mime.indexOf('audio/')===0?'audio':mime.indexOf('video/')===0?'video':''; }
  async function store(bytes, mime, name, category){
    var type=typeOf(mime); if(!type){ toast('Only images, audio and video can be added.'); return; }
    if(bytes.length>MAX){ toast((name||'That file')+' is too big (max 25 MB).'); return; }
    var id='m'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
    var thumb=''; try{ thumb=await makeThumb(new Blob([bytes],{type:mime}), type); }catch(e){}
    await blobs.put({ id:id, bytes:bytes });
    await media.put({ id:id, name:name||type, type:type, mime:mime, category:(category||'Unsorted'), size:bytes.length, at:Date.now(), thumb:thumb });
    return id;
  }
  async function importFile(file){
    try{ var buf=new Uint8Array(await file.arrayBuffer()); await store(buf, file.type||'', file.name||'file', 'Unsorted'); }
    catch(e){ toast('Could not read ' + (file&&file.name||'file')); }
  }

  // ---- library ----
  function categories(){ var s={}; items.forEach(function(m){ if(m.category) s[m.category]=1; }); return Object.keys(s).sort(); }
  function refreshCats(){
    var sel=document.getElementById('cat'), cur=sel.value; sel.innerHTML='<option value="all">All categories</option>';
    categories().forEach(function(c){ var o=document.createElement('option'); o.value=c; o.textContent=c; sel.appendChild(o); });
    if(fCat!=='all' && categories().indexOf(fCat)<0) fCat='all'; sel.value=fCat;
    var dl=document.getElementById('cats'); dl.innerHTML=''; categories().forEach(function(c){ var o=document.createElement('option'); o.value=c; dl.appendChild(o); });
  }
  function render(){
    refreshCats();
    var list=items.filter(function(m){ return (fType==='all'||m.type===fType) && (fCat==='all'||m.category===fCat); })
      .sort(function(a,b){ return (b.at||0)-(a.at||0); });
    document.getElementById('count').textContent = items.length ? (list.length+' of '+items.length) : '';
    gEmpty.style.display = items.length ? 'none' : 'flex';
    grid.style.display = items.length ? 'grid' : 'none';
    grid.innerHTML = list.map(function(m){
      var bg = m.thumb ? 'style="background-image:url('+m.thumb+')"' : '';
      var face = m.thumb ? (m.type!=='image'?'<div class="play">▶</div>':'') : ('<span>'+(KIND[m.type]||'📄')+'</span>');
      var shared = isVisible(m) ? '<span class="shared" title="Visible to invited guests">👁</span>' : '';
      return '<div class="card" data-id="'+m.id+'"><div class="thumb" '+bg+'><span class="kind">'+(KIND[m.type]||'')+'</span>'+shared+face+'</div>'+
        '<div class="meta"><div class="nm">'+esc(m.name)+'</div><span class="cat">'+esc(m.category||'Unsorted')+'</span></div></div>';
    }).join('');
  }
  media.subscribe(function(rows){ items=(rows||[]).filter(function(r){ return r&&r.id&&r.type; }); render(); });

  // ---- open one: fetch its blob, pick the right player ----
  grid.addEventListener('click', function(e){ var c=e.target.closest?e.target.closest('.card'):null; if(c) openItem(c.getAttribute('data-id')); });
  async function openItem(id){
    var m=items.filter(function(x){ return x.id===id; })[0]; if(!m) return;
    var rec=await blobs.get(id);
    if(!rec||!rec.bytes){ toast('The file for this item is missing.'); return; }
    var bytes = rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes);
    if(curUrl){ URL.revokeObjectURL(curUrl); curUrl=null; }
    curUrl = URL.createObjectURL(new Blob([bytes], { type:m.mime||'' })); cur=m;
    var stage=document.getElementById('stage');
    stage.innerHTML = m.type==='image' ? '<img src="'+curUrl+'" alt="'+esc(m.name)+'">'
      : m.type==='audio' ? '<audio src="'+curUrl+'" controls autoplay></audio>'
      : '<video src="'+curUrl+'" controls autoplay playsinline></video>';
    document.getElementById('mname').value = m.name||'';
    document.getElementById('mcat').value = m.category||'';
    document.getElementById('minfo').textContent = (KIND[m.type]||'')+' '+(m.mime||'')+' · '+fmtSize(m.size);
    syncVisRow();
    closeGifPanel();
    var mime=(m.mime||'').toLowerCase();
    var canFlip = m.type==='video' || (m.type==='image' && mime.indexOf('image/gif')!==0);
    document.getElementById('mfliph').style.display = canFlip ? 'inline-block' : 'none';
    document.getElementById('mflipv').style.display = canFlip ? 'inline-block' : 'none';
    document.getElementById('mclip').style.display = (m.type==='video'||m.type==='audio') ? 'inline-block' : 'none';
    document.getElementById('mrev').style.display = (m.type==='video'||m.type==='audio') ? 'inline-block' : 'none';
    document.getElementById('mgif').style.display = m.type==='video' ? 'inline-block' : 'none';
    document.getElementById('modal').style.display='flex';
  }
  // The visibility control — owner only. Reflects the current item's state and
  // lets the owner flip it. Marking visible opts the record AND its blob into
  // read-only, so an invited guest can see (and steal) exactly that one item.
  function syncVisRow(){
    var row=document.getElementById('visrow'); if(!row) return;
    if(!owner || !cur){ row.style.display='none'; return; }
    row.style.display='flex';
    var vis=isVisible(cur);
    document.getElementById('mvis').checked = vis;
    document.getElementById('vishint').textContent = vis
      ? 'Invited guests can see and steal this item.'
      : 'Only you can see it. Flip on to share it.';
  }
  document.getElementById('mvis').onchange=async function(){
    if(!cur||!owner) return;
    var makeVis=this.checked, level=makeVis?'read-only':'private';
    try{
      await media.setVisibility(cur.id, level);
      try{ await blobs.setVisibility(cur.id, level); }catch(e){}
      cur._vis=level; syncVisRow(); render();
      toast(makeVis?'Now visible to invited guests':'Now private');
    }catch(e){ this.checked=!makeVis; toast('Could not change visibility'); }
  };
  function closeModal(){
    gifAbort=true;
    closeGifPanel();
    var st=document.getElementById('stage'); st.innerHTML=''; // stops playback
    if(curUrl){ URL.revokeObjectURL(curUrl); curUrl=null; } cur=null;
    document.getElementById('modal').style.display='none';
  }
  function downloadName(m){
    var n=String((m&&m.name)||(m&&m.type)||'file');
    n=n.replace(/[\\/?%*:|"<>]/g,'-').replace(/\\s+/g,' ').trim()||'file';
    var ext={
      'image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg',
      'audio/wav':'wav','audio/wave':'wav','audio/x-wav':'wav','audio/mpeg':'mp3','audio/mp3':'mp3','audio/webm':'webm','audio/ogg':'ogg',
      'video/webm':'webm','video/mp4':'mp4','video/quicktime':'mov'
    }[String((m&&m.mime)||'').toLowerCase()];
    if(ext && n.slice(-(ext.length+1)).toLowerCase()!=='.'+ext) n+='.'+ext;
    return n;
  }
  function downloadCur(){
    if(!cur) return;
    if(!curUrl){ toast('The file for this item is missing.'); return; }
    var a=document.createElement('a');
    a.href=curUrl; a.download=downloadName(cur);
    document.body.appendChild(a); a.click(); a.remove();
  }
  document.getElementById('mdown').onclick=downloadCur;
  document.getElementById('mclose').onclick=closeModal;
  document.getElementById('modal').addEventListener('click', function(e){ if(e.target.id==='modal') closeModal(); });
  document.getElementById('msave').onclick=async function(){
    if(!cur) return;
    var name=document.getElementById('mname').value.trim()||cur.name;
    var cat=document.getElementById('mcat').value.trim()||'Unsorted';
    await media.put(Object.assign({}, cur, { name:name, category:cat }));
    toast('Saved'); cur.name=name; cur.category=cat;
  };
  document.getElementById('mdel').onclick=async function(){
    if(!cur) return; var id=cur.id; closeModal();
    try{ await media.delete(id); try{ await blobs.delete(id); }catch(e){} }
    catch(e){ toast('You can only remove your own items.'); }  // a guest can't delete the host's shared media
  };

  // ---- add: file picker + drag/drop ----
  document.getElementById('add').onclick=function(){ document.getElementById('fi').click(); };
  document.getElementById('fi').onchange=function(e){ var fs=e.target.files||[]; for(var i=0;i<fs.length;i++) importFile(fs[i]); e.target.value=''; };
  var dz=document.getElementById('drop'), dc=0;
  window.addEventListener('dragenter', function(e){ e.preventDefault(); dc++; dz.style.display='flex'; });
  window.addEventListener('dragover', function(e){ e.preventDefault(); });
  window.addEventListener('dragleave', function(e){ e.preventDefault(); if(--dc<=0){ dc=0; dz.style.display='none'; } });
  window.addEventListener('drop', function(e){ e.preventDefault(); dc=0; dz.style.display='none'; var fs=(e.dataTransfer&&e.dataTransfer.files)||[]; for(var i=0;i<fs.length;i++) importFile(fs[i]); });

  // ---- capture straight in (brokered camera/mic; honours the Abilities opt-out) ----
  var cap=document.getElementById('cap');
  function capBtn(glyph, title, fn){ var b=document.createElement('button'); b.textContent=glyph; b.title=title; b.onclick=fn; cap.appendChild(b); }
  async function capture(kind){
    try{
      var clip = kind==='photo' ? await gifos.takePhoto() : kind==='audio' ? await gifos.recordAudio() : await gifos.recordVideo();
      if(!clip||!clip.bytes) return;
      var bytes=new Uint8Array(clip.bytes);
      var mime=clip.mime||(kind==='photo'?'image/jpeg':kind==='audio'?'audio/webm':'video/webm');
      var label=(kind==='photo'?'Photo':kind==='audio'?'Recording':'Clip')+' · '+new Date().toLocaleString();
      await store(bytes, mime, label, 'Captured');
    }catch(err){ var m=String(err&&err.message||err); if(!/cancel/i.test(m)) toast(m.slice(0,90)); }
  }
  if(window.gifos && gifos.takePhoto){
    capBtn('📷','Take a photo', function(){ capture('photo'); });
    capBtn('🎙','Record audio', function(){ capture('audio'); });
    capBtn('🎬','Record a video clip', function(){ capture('video'); });
  }

  // ---- video → GIF (plain GIF89a via packed gifenc.js) ----
  function stageVideo(){ return document.querySelector('#stage video'); }
  function stageMedia(){ return document.querySelector('#stage video') || document.querySelector('#stage audio'); }
  function vidDur(){ var v=stageVideo(), d=v&&v.duration; return (isFinite(d)&&d>0)?d:0; }
  function mediaDur(){ var v=stageMedia(), d=v&&v.duration; return (isFinite(d)&&d>0)?d:0; }
  function rangeDur(){ return panelMode==='aclip' ? mediaDur() : vidDur(); }
  function rangeMaxSpan(){ var d=rangeDur(); return panelMode==='gif' ? Math.min(d, maxSrc()) : d; }
  function fmtT(t){ t=Math.max(0,+t||0); var m=Math.floor(t/60), s=t-m*60; return m+':'+(s<10?'0':'')+s.toFixed(1); }
  function maxSrc(){ return MAX_OUT_SEC*gifSpeed; }
  function gifNameFrom(m){
    var n=String((m&&m.name)||'Clip');
    n=n.replace(/\.(webm|mp4|mov|mkv|avi|ogv|m4v)$/i,'');
    if(/^Clip\s*·/i.test(n)) n='Clip';
    n=n.replace(/[\\/?%*:|"<>]/g,'-').replace(/\s+/g,' ').trim()||'Clip';
    return n+'.gif';
  }
  function seekTo(v, t){
    return new Promise(function(res){
      var done=false;
      function fin(){ if(done) return; done=true; v.removeEventListener('seeked', fin); v.removeEventListener('error', fin); res(); }
      v.addEventListener('seeked', fin);
      v.addEventListener('error', fin);
      try{
        if(Math.abs((v.currentTime||0)-t)<0.001 && v.readyState>=2){ fin(); return; }
        v.currentTime=t;
      }catch(e){ fin(); return; }
      setTimeout(fin, 2000);
    });
  }
  function clampGifRange(){
    var d=rangeDur(), max=rangeMaxSpan(), minSpan=Math.min(0.2, d||0.2);
    if(gifEnd>d) gifEnd=d;
    if(gifStart<0) gifStart=0;
    if(gifEnd-gifStart>max){
      gifEnd=gifStart+max;
      if(gifEnd>d){ gifEnd=d; gifStart=Math.max(0, gifEnd-max); }
    }
    if(gifEnd-gifStart<minSpan && d>0){
      gifEnd=Math.min(d, gifStart+minSpan);
      if(gifEnd-gifStart<minSpan) gifStart=Math.max(0, gifEnd-minSpan);
    }
  }
  function updateGifUI(){
    var d=rangeDur()||1;
    var a=gifStart/d*100, b=gifEnd/d*100;
    document.getElementById('gifh0').style.left=a+'%';
    document.getElementById('gifh1').style.left=b+'%';
    var fill=document.getElementById('giffill');
    fill.style.left=a+'%'; fill.style.width=Math.max(0,b-a)+'%';
    document.getElementById('gifta').textContent=fmtT(gifStart);
    document.getElementById('giftd').textContent=fmtT(gifEnd-gifStart);
    document.getElementById('giftb').textContent=fmtT(gifEnd);
    var sel=gifEnd-gifStart, max=maxSrc();
    var maxTxt=(Math.abs(max-Math.round(max))<1e-6)?String(Math.round(max)):max.toFixed(1);
    var spdTxt=gifSpeed+'×';
    var line=sel.toFixed(1)+'s selected · max '+maxTxt+'s at '+spdTxt;
    var budget=document.getElementById('gifbudget');
    budget.textContent=line;
    var over=panelMode==='gif' && sel>max+0.05;
    budget.classList.toggle('warn', over);
    document.getElementById('gifgo').disabled=over||gifBusy||sel<=0;
  }
  function syncSpeeds(){
    Array.prototype.forEach.call(document.getElementById('gifspeeds').children, function(c){
      c.classList.toggle('on', parseFloat(c.getAttribute('data-s'))===gifSpeed);
    });
  }
  function closeGifPanel(){
    gifAbort=true;
    var p=document.getElementById('gifpanel'); if(p){ p.classList.remove('on'); p.classList.remove('clip'); p.classList.remove('aclip'); }
    var det=document.getElementById('detail'); if(det) det.style.display='';
    var box=document.querySelector('#modal .box'); if(box) box.classList.remove('gifing');
    var v=stageVideo();
    if(v){ v.controls=true; v.muted=false; }
    var go=document.getElementById('gifgo'); if(go) go.textContent='Make GIF';
    panelMode='gif';
    var stop=document.getElementById('gifstop'); if(stop) stop.style.display='none';
    var prog=document.getElementById('gifprog'); if(prog) prog.textContent='';
  }
  function makeFilmstrip(){
    var v=stageVideo(); if(!v) return;
    var gen=++filmGen;
    var n=10, a=gifStart, b=gifEnd, span=Math.max(0.01, b-a);
    var strip=document.getElementById('filmstrip'); strip.innerHTML='';
    var probe=document.createElement('video');
    probe.muted=true; probe.playsInline=true; probe.preload='auto';
    probe.src=v.currentSrc||v.src||'';
    var i=0;
    function next(){
      if(gen!==filmGen){ probe.removeAttribute('src'); probe.load(); return; }
      if(i>=n){ probe.removeAttribute('src'); probe.load(); return; }
      var t=a+(i+0.5)*span/n;
      seekTo(probe, t).then(function(){
        if(gen!==filmGen) return;
        var c=document.createElement('canvas');
        var vw=probe.videoWidth||160, vh=probe.videoHeight||90;
        var sc=64/Math.max(vw,1);
        c.width=Math.max(1,Math.round(vw*sc)); c.height=Math.max(1,Math.round(vh*sc));
        try{ c.getContext('2d').drawImage(probe,0,0,c.width,c.height); }catch(e){}
        var img=document.createElement('img');
        try{ img.src=c.toDataURL('image/jpeg',0.6); }catch(e){}
        img.setAttribute('data-t', String(t));
        strip.appendChild(img);
        i++; setTimeout(next, 0);
      });
    }
    if(probe.readyState>=1) next();
    else probe.addEventListener('loadedmetadata', next);
    probe.addEventListener('error', function(){ if(gen===filmGen) strip.innerHTML=''; });
  }
  function openRangePanel(mode){
    panelMode=mode||'gif';
    var media=stageMedia(); if(!media) return;
    if(panelMode!=='aclip' && !stageVideo()) return;
    gifAbort=false; gifBusy=false; gifSpeed=1;
    gifSavedT=media.currentTime||0;
    media.pause();
    if(media.tagName==='VIDEO'){ media.muted=true; media.controls=false; }
    document.getElementById('detail').style.display='none';
    var p=document.getElementById('gifpanel');
    p.classList.add('on');
    p.classList.toggle('clip', panelMode==='clip'||panelMode==='aclip');
    p.classList.toggle('aclip', panelMode==='aclip');
    document.getElementById('gifgo').textContent = panelMode==='gif' ? 'Make GIF' : 'Clip';
    var box=document.querySelector('#modal .box'); if(box) box.classList.add('gifing');
    function ready(){
      var d=rangeDur();
      gifStart=0;
      gifEnd = panelMode==='gif' ? Math.min(d, maxSrc()) : d;
      if(d>0 && gifEnd<0.2) gifEnd=Math.min(d, 0.2);
      syncSpeeds(); updateGifUI();
      try{ media.currentTime=gifStart; }catch(e){}
      if(panelMode==='aclip') document.getElementById('filmstrip').innerHTML='';
      else makeFilmstrip();
    }
    if(media.readyState>=1 && isFinite(media.duration)) ready();
    else media.addEventListener('loadedmetadata', ready);
  }
  function openGifPanel(){ openRangePanel('gif'); }
  document.getElementById('mgif').onclick=openGifPanel;
  document.getElementById('mclip').onclick=function(){
    if(!cur) return;
    if(cur.type==='audio') openRangePanel('aclip');
    else openRangePanel('clip');
  };
  document.getElementById('gifback').onclick=function(){ gifAbort=true; if(!gifBusy) closeGifPanel(); };
  document.getElementById('gifstop').onclick=function(){ gifAbort=true; };
  document.getElementById('gifspeeds').addEventListener('click', function(e){
    var b=e.target.closest?e.target.closest('button[data-s]'):null; if(!b||gifBusy) return;
    gifSpeed=parseFloat(b.getAttribute('data-s'))||1;
    syncSpeeds();
    clampGifRange();
    updateGifUI();
    makeFilmstrip();
    var v=stageVideo(); if(v) try{ v.currentTime=gifStart; }catch(err){}
  });
  document.getElementById('filmstrip').onclick=function(e){
    var t=e.target&&e.target.getAttribute&&e.target.getAttribute('data-t');
    if(t==null) return;
    var v=stageVideo(); if(v) try{ v.currentTime=parseFloat(t); }catch(err){}
  };
  (function(){
    var which=null, range=document.getElementById('gifrange');
    function tFromX(clientX){
      var r=range.getBoundingClientRect();
      var x=r.width? (clientX-r.left)/r.width : 0;
      var d=rangeDur();
      return Math.max(0, Math.min(d, x*d));
    }
    function down(e, h){
      if(gifBusy) return;
      e.preventDefault(); e.stopPropagation();
      which=h;
      try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(err){}
      move(e);
    }
    function move(e){
      if(which==null) return;
      var t=tFromX(e.clientX), d=rangeDur(), max=rangeMaxSpan(), minSpan=Math.min(0.2, d||0.2);
      if(which===0){
        gifStart=Math.max(0, Math.min(t, gifEnd-minSpan));
        if(gifEnd-gifStart>max) gifStart=gifEnd-max;
      }else{
        gifEnd=Math.min(d, Math.max(t, gifStart+minSpan));
        if(gifEnd-gifStart>max) gifEnd=gifStart+max;
      }
      var v=stageMedia(); if(v) try{ v.currentTime=which===0?gifStart:gifEnd; }catch(err){}
      updateGifUI();
    }
    function up(){
      if(which==null) return;
      which=null;
      if(panelMode!=='aclip') makeFilmstrip();
    }
    document.getElementById('gifh0').addEventListener('pointerdown', function(e){ down(e,0); });
    document.getElementById('gifh1').addEventListener('pointerdown', function(e){ down(e,1); });
    document.getElementById('gifh0').addEventListener('pointermove', move);
    document.getElementById('gifh1').addEventListener('pointermove', move);
    document.getElementById('gifh0').addEventListener('pointerup', up);
    document.getElementById('gifh1').addEventListener('pointerup', up);
    document.getElementById('gifh0').addEventListener('pointercancel', up);
    document.getElementById('gifh1').addEventListener('pointercancel', up);
    range.addEventListener('pointerdown', function(e){
      if(gifBusy) return;
      if(e.target.id==='gifh0'||e.target.id==='gifh1') return;
      var t=tFromX(e.clientX);
      var v=stageMedia(); if(v) try{ v.currentTime=t; }catch(err){}
    });
  })();
  document.getElementById('gifgo').onclick=async function(){
    if(gifBusy) return;
    if(panelMode==='clip'){ await runVideoClip(); return; }
    if(panelMode==='aclip'){ await runAudioClip(); return; }
    var v=stageVideo();
    if(!v){ toast('No video to convert.'); return; }
    if(!window.GifEnc||!GifEnc.encode||!GifEnc.quantize){ toast('GIF encoder is missing.'); return; }
    var srcDur=gifEnd-gifStart;
    if(srcDur<=0){ toast('Pick a longer clip.'); return; }
    if(srcDur>maxSrc()+0.05){ toast('That clip is too long at this speed.'); return; }
    var nFrames=Math.round(srcDur/gifSpeed*GIF_FPS);
    if(nFrames<2) nFrames=2;
    if(nFrames>MAX_FRAMES) nFrames=MAX_FRAMES;
    var vw=v.videoWidth||0, vh=v.videoHeight||0;
    if(!vw||!vh){ toast('The video has not decoded yet.'); return; }
    var sc=Math.min(1, MAX_SIDE/Math.max(vw,vh));
    var tw=Math.max(1, Math.round(vw*sc)), th=Math.max(1, Math.round(vh*sc));
    gifBusy=true; gifAbort=false;
    var go=document.getElementById('gifgo'), stop=document.getElementById('gifstop'), prog=document.getElementById('gifprog');
    go.disabled=true; stop.style.display='';
    v.pause();
    var saved=v.currentTime;
    var canvas=document.createElement('canvas'); canvas.width=tw; canvas.height=th;
    var ctx=canvas.getContext('2d', { willReadFrequently:true });
    var rgba=[], id=null;
    try{
      for(var i=0;i<nFrames;i++){
        if(gifAbort) throw new Error('cancel');
        var t=gifStart+(i+0.5)*(srcDur/nFrames);
        prog.textContent='Sampling '+(i+1)+'/'+nFrames+'…';
        await seekTo(v, t);
        if(gifAbort) throw new Error('cancel');
        ctx.drawImage(v, 0, 0, tw, th);
        rgba.push(new Uint8Array(ctx.getImageData(0,0,tw,th).data));
        await new Promise(function(r){ setTimeout(r, 0); });
      }
      prog.textContent='Encoding…';
      await new Promise(function(r){ setTimeout(r, 0); });
      var q=GifEnc.quantize(rgba, tw, th);
      var bytes=GifEnc.encode({ width:tw, height:th, frames:q.frames, palette:q.palette, delayCs:10, loop:true });
      if(!bytes||bytes.length<6) throw new Error('Could not encode the GIF.');
      var hdr=String.fromCharCode(bytes[0],bytes[1],bytes[2],bytes[3],bytes[4],bytes[5]);
      if(hdr!=='GIF89a') throw new Error('Could not encode the GIF.');
      if(bytes.length>MAX){ toast('That GIF would be too big (max 25 MB).'); return; }
      var name=gifNameFrom(cur);
      var cat=(cur&&cur.category)||'Unsorted';
      id=await store(bytes, 'image/gif', name, cat);
      toast('Saved '+name);
    }catch(err){
      var msg=String(err&&err.message||err);
      if(!/cancel/i.test(msg)) toast(msg.slice(0,90));
    }finally{
      gifBusy=false;
      go.disabled=false; stop.style.display='none'; prog.textContent='';
      try{ if(v&&v.parentNode) v.currentTime=saved; }catch(e){}
    }
    if(!id){
      if(gifAbort && !document.getElementById('gifpanel').classList.contains('on')) return;
      return;
    }
    closeGifPanel();
    var tries=0;
    while(tries++<25 && !items.filter(function(x){ return x.id===id; })[0])
      await new Promise(function(r){ setTimeout(r, 40); });
    await openItem(id);
  };

  // ---- flip / later clip+reverse: new library item, original stays ----
  function suffixName(m, tag, ext){
    var n=String((m&&m.name)||'file');
    n=n.replace(/\.[^.]+$/,'');
    n=n.replace(/[\\/?%*:|"<>]/g,'-').replace(/\s+/g,' ').trim()||'file';
    return n+' ('+tag+').'+ext;
  }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  async function saveNew(bytes, mime, name){
    if(!bytes||!bytes.length) throw new Error('Nothing to save.');
    if(bytes.length>MAX){ toast('That file would be too big (max 25 MB).'); return null; }
    var cat=(cur&&cur.category)||'Unsorted';
    var id=await store(bytes, mime, name, cat);
    if(!id) return null;
    toast('Saved '+name);
    return id;
  }
  async function openNew(id){
    if(!id) return;
    var tries=0;
    while(tries++<25 && !items.filter(function(x){ return x.id===id; })[0])
      await new Promise(function(r){ setTimeout(r, 40); });
    await openItem(id);
  }
  function pickVideoMime(){
    var MR=window.MediaRecorder;
    if(!MR||!MR.isTypeSupported) return '';
    var cands=['video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm'];
    for(var i=0;i<cands.length;i++){
      try{ if(MR.isTypeSupported(cands[i])) return cands[i]; }catch(e){}
    }
    return '';
  }
  function paintFlipped(ctx, src, w, h, sx, sy){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);
    ctx.save();
    ctx.translate(sx<0?w:0, sy<0?h:0);
    ctx.scale(sx, sy);
    ctx.drawImage(src, 0, 0, w, h);
    ctx.restore();
  }
  async function recordEditedVideo(opts){
    opts=opts||{};
    var v=stageVideo();
    if(!v) throw new Error('No video to edit.');
    if(typeof MediaRecorder==='undefined') throw new Error('This browser cannot record video (no MediaRecorder).');
    var canvas=document.createElement('canvas');
    if(!canvas.captureStream) throw new Error('This browser cannot record video (no captureStream).');
    var w=v.videoWidth||0, h=v.videoHeight||0;
    if(!w||!h) throw new Error('The video has not decoded yet.');
    var start=+opts.start||0, end=opts.end, d=vidDur();
    if(!(end>start)) end=d;
    if(!(end>start)) throw new Error('That clip is empty.');
    var sx=opts.sx==null?1:opts.sx, sy=opts.sy==null?1:opts.sy;
    var reverse=!!opts.reverse;
    var fps=15;
    var n=Math.max(2, Math.round((end-start)*fps));
    if(n>900) n=900;
    canvas.width=w; canvas.height=h;
    var ctx=canvas.getContext('2d');
    var stream=canvas.captureStream(fps);
    var track=stream.getVideoTracks()[0];
    var mime=pickVideoMime();
    var rec;
    try{ rec=new MediaRecorder(stream, mime?{mimeType:mime}:undefined); }
    catch(e){ rec=new MediaRecorder(stream); }
    var chunks=[];
    rec.ondataavailable=function(e){ if(e.data&&e.data.size) chunks.push(e.data); };
    var stopped=new Promise(function(res, rej){
      rec.onerror=function(ev){ rej((ev&&ev.error)||new Error('Recording failed.')); };
      rec.onstop=function(){ res(); };
    });
    function emit(){
      paintFlipped(ctx, v, w, h, sx, sy);
      if(track&&track.requestFrame) try{ track.requestFrame(); }catch(e){}
    }
    v.pause(); v.muted=true;
    var frameMs=Math.round(1000/fps);
    try{
      rec.start(100);
      var firstT=reverse?Math.max(start, end-1/fps):start;
      await seekTo(v, firstT);
      emit(); await sleep(350); emit(); await sleep(50);
      for(var i=0;i<n;i++){
        if(gifAbort) throw new Error('cancel');
        var t=reverse ? end-(i+0.5)*(end-start)/n : start+(i+0.5)*(end-start)/n;
        if(opts.onProg) opts.onProg(i+1, n);
        await seekTo(v, t);
        if(gifAbort) throw new Error('cancel');
        emit();
        await sleep(frameMs);
      }
      emit(); await sleep(180);
      if(rec.state==='recording') rec.stop();
      await stopped;
    }catch(err){
      try{ if(rec.state==='recording') rec.stop(); }catch(e){}
      try{ stream.getTracks().forEach(function(t){ t.stop(); }); }catch(e){}
      throw err;
    }
    try{ stream.getTracks().forEach(function(t){ t.stop(); }); }catch(e){}
    var blob=new Blob(chunks, { type: rec.mimeType||mime||'video/webm' });
    if(!blob.size) throw new Error('Recording produced an empty file.');
    var buf=new Uint8Array(await blob.arrayBuffer());
    var outMime=(blob.type||'video/webm').split(';')[0]||'video/webm';
    return { bytes:buf, mime:outMime };
  }
  async function flipStill(h, v){
    if(!cur) throw new Error('Nothing to flip.');
    var rec=await blobs.get(cur.id);
    if(!rec||!rec.bytes) throw new Error('The file for this item is missing.');
    var bytes=rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes);
    var blob=new Blob([bytes], { type: cur.mime||'image/png' });
    var url=URL.createObjectURL(blob);
    var img;
    try{
      img=await new Promise(function(res, rej){
        var i=new Image();
        i.onload=function(){ res(i); };
        i.onerror=function(){ rej(new Error('Could not decode the image.')); };
        i.src=url;
      });
    }finally{ URL.revokeObjectURL(url); }
    var w=img.naturalWidth, ht=img.naturalHeight;
    if(!w||!ht) throw new Error('Could not decode the image.');
    var c=document.createElement('canvas'); c.width=w; c.height=ht;
    var ctx=c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    var before;
    try{ before=ctx.getImageData(0,0,w,ht).data.slice(); }
    catch(e){ throw new Error('Could not read the image pixels.'); }
    paintFlipped(ctx, img, w, ht, h?-1:1, v?-1:1);
    var after;
    try{ after=ctx.getImageData(0,0,w,ht).data; }
    catch(e){ throw new Error('Could not read the image pixels.'); }
    var changed=false, p;
    for(p=0;p<after.length;p+=4){
      if(after[p]!==before[p]||after[p+1]!==before[p+1]||after[p+2]!==before[p+2]){ changed=true; break; }
    }
    if(!changed) throw new Error('That image looks the same flipped.');
    var jm=(cur.mime||'').toLowerCase();
    var jpeg=jm==='image/jpeg'||jm==='image/jpg';
    var outMime=jpeg?'image/jpeg':'image/png';
    var out=await new Promise(function(res, rej){
      if(!c.toBlob){
        try{
          var data=c.toDataURL(outMime, jpeg?0.92:undefined);
          var bin=atob(data.split(',')[1]||''), u=new Uint8Array(bin.length);
          for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
          res(new Blob([u], { type: outMime }));
        }catch(err){ rej(new Error('Could not encode the image.')); }
        return;
      }
      c.toBlob(function(b){ if(!b) rej(new Error('Could not encode the image.')); else res(b); }, outMime, jpeg?0.92:undefined);
    });
    return { bytes:new Uint8Array(await out.arrayBuffer()), mime:outMime, ext:jpeg?'jpg':'png' };
  }
  async function doFlip(h, v){
    if(!cur||gifBusy) return;
    gifBusy=true; gifAbort=false;
    try{
      if(cur.type==='image'){
        var still=await flipStill(h, v);
        var sid=await saveNew(still.bytes, still.mime, suffixName(cur, 'flipped', still.ext));
        await openNew(sid);
      }else if(cur.type==='video'){
        toast('Flipping…', true);
        var d=vidDur();
        var recd=await recordEditedVideo({
          sx:h?-1:1, sy:v?-1:1, start:0, end:d, reverse:false,
          onProg:function(i,n){ toast('Flipping '+i+'/'+n+'…', true); }
        });
        var vidName=suffixName(cur, 'flipped', 'webm');
        var vid=await saveNew(recd.bytes, recd.mime, vidName);
        await openNew(vid);
      }
    }catch(err){
      var msg=String(err&&err.message||err);
      if(!/cancel/i.test(msg)) toast(msg.slice(0,90));
    }finally{ gifBusy=false; }
  }
  document.getElementById('mfliph').onclick=function(){ doFlip(true, false); };
  document.getElementById('mflipv').onclick=function(){ doFlip(false, true); };

  function encodeWav16(channels, sampleRate){
    var ch=channels.length, n=channels[0].length;
    var dataBytes=n*ch*2;
    var buf=new ArrayBuffer(44+dataBytes);
    var view=new DataView(buf), o=0;
    function str(s){ for(var i=0;i<s.length;i++) view.setUint8(o++, s.charCodeAt(i)); }
    str('RIFF'); view.setUint32(o, 36+dataBytes, true); o+=4; str('WAVE');
    str('fmt '); view.setUint32(o, 16, true); o+=4;
    view.setUint16(o, 1, true); o+=2;
    view.setUint16(o, ch, true); o+=2;
    view.setUint32(o, sampleRate, true); o+=4;
    view.setUint32(o, sampleRate*ch*2, true); o+=4;
    view.setUint16(o, ch*2, true); o+=2;
    view.setUint16(o, 16, true); o+=2;
    str('data'); view.setUint32(o, dataBytes, true); o+=4;
    var i,c,s,q;
    for(i=0;i<n;i++){
      for(c=0;c<ch;c++){
        s=channels[c][i];
        q=Math.round(Math.max(-1, Math.min(1, s))*32767);
        view.setInt16(o, q, true); o+=2;
      }
    }
    return new Uint8Array(buf);
  }
  async function decodeCurAudio(){
    if(!cur) throw new Error('Nothing to edit.');
    var rec=await blobs.get(cur.id);
    if(!rec||!rec.bytes) throw new Error('The file for this item is missing.');
    var bytes=rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes);
    var AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) throw new Error('This browser cannot decode audio.');
    var ctx=new AC();
    try{
      var copy=bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength);
      var buf=await ctx.decodeAudioData(copy);
      if(!buf||!buf.length) throw new Error('Could not decode the audio.');
      return buf;
    }catch(err){
      var msg=String(err&&err.message||err);
      if(/decode/i.test(msg)) throw err;
      throw new Error('Could not decode the audio.');
    }finally{
      try{ ctx.close(); }catch(e){}
    }
  }
  async function runAudioClip(){
    if(gifBusy) return;
    gifBusy=true; gifAbort=false;
    var go=document.getElementById('gifgo'), stop=document.getElementById('gifstop'), prog=document.getElementById('gifprog');
    go.disabled=true; stop.style.display='';
    var id=null;
    try{
      prog.textContent='Clipping…';
      var decoded=await decodeCurAudio();
      if(gifAbort) throw new Error('cancel');
      var sr=decoded.sampleRate||44100;
      var i0=Math.max(0, Math.floor(gifStart*sr));
      var i1=Math.min(decoded.length, Math.ceil(gifEnd*sr));
      if(i1-i0<2) throw new Error('Pick a longer clip.');
      var ch=[], c;
      for(c=0;c<decoded.numberOfChannels;c++){
        var dst=new Float32Array(i1-i0);
        decoded.copyFromChannel(dst, c, i0);
        ch.push(dst);
        if(c%2===1) await sleep(0);
      }
      var wav=encodeWav16(ch, sr);
      id=await saveNew(wav, 'audio/wav', suffixName(cur, 'clip', 'wav'));
    }catch(err){
      var msg=String(err&&err.message||err);
      if(!/cancel/i.test(msg)) toast(msg.slice(0,90));
    }finally{
      gifBusy=false;
      go.disabled=false; stop.style.display='none'; prog.textContent='';
    }
    if(!id) return;
    closeGifPanel();
    await openNew(id);
  }
  async function runVideoClip(){
    if(gifBusy) return;
    var v=stageVideo();
    if(!v){ toast('No video to clip.'); return; }
    gifBusy=true; gifAbort=false;
    var go=document.getElementById('gifgo'), stop=document.getElementById('gifstop'), prog=document.getElementById('gifprog');
    go.disabled=true; stop.style.display='';
    var id=null;
    try{
      var recd=await recordEditedVideo({
        sx:1, sy:1, start:gifStart, end:gifEnd, reverse:false,
        onProg:function(i,n){ prog.textContent='Clipping '+i+'/'+n+'…'; }
      });
      id=await saveNew(recd.bytes, recd.mime, suffixName(cur, 'clip', 'webm'));
    }catch(err){
      var msg=String(err&&err.message||err);
      if(!/cancel/i.test(msg)) toast(msg.slice(0,90));
    }finally{
      gifBusy=false;
      go.disabled=false; stop.style.display='none'; prog.textContent='';
    }
    if(!id){
      if(gifAbort && !document.getElementById('gifpanel').classList.contains('on')) return;
      return;
    }
    closeGifPanel();
    await openNew(id);
  }
  async function doReverse(){
    if(!cur||gifBusy) return;
    gifBusy=true; gifAbort=false;
    try{
      if(cur.type==='audio'){
        toast('Reversing…', true);
        var decoded=await decodeCurAudio();
        if(gifAbort) throw new Error('cancel');
        var ch=[], i;
        for(i=0;i<decoded.numberOfChannels;i++){
          var c=decoded.getChannelData(i).slice();
          c.reverse();
          ch.push(c);
          await sleep(0);
        }
        var wav=encodeWav16(ch, decoded.sampleRate||44100);
        var aid=await saveNew(wav, 'audio/wav', suffixName(cur, 'reversed', 'wav'));
        await openNew(aid);
      }else if(cur.type==='video'){
        toast('Reversing…', true);
        var recd=await recordEditedVideo({
          sx:1, sy:1, start:0, end:vidDur(), reverse:true,
          onProg:function(i,n){ toast('Reversing '+i+'/'+n+'…', true); }
        });
        var vid=await saveNew(recd.bytes, recd.mime, suffixName(cur, 'reversed', 'webm'));
        await openNew(vid);
      }
    }catch(err){
      var msg=String(err&&err.message||err);
      if(!/cancel/i.test(msg)) toast(msg.slice(0,90));
    }finally{ gifBusy=false; }
  }
  document.getElementById('mrev').onclick=function(){ doReverse(); };

  // ---- filters ----
  document.getElementById('types').addEventListener('click', function(e){ var b=e.target.closest?e.target.closest('button[data-t]'):null; if(!b) return;
    fType=b.getAttribute('data-t'); Array.prototype.forEach.call(this.children, function(c){ c.classList.toggle('on', c===b); }); render(); });
  document.getElementById('cat').onchange=function(){ fCat=this.value; render(); };
</script></body></html>`;

  // Packed into My Media as gifenc.js. Real GIF89a + variable-width LZW — not
  // the uncompressed-GIF trick in gifos-gif.js, and no GIFOS1.0 extension.
  const GIFENC_JS = `(function(root){
    var BAYER=[0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21];
    function clamp(n){ return n<0?0:n>255?255:n|0; }
    function lzw(indices, minCS){
      var clear=1<<minCS, eoi=clear+1;
      var codeSize=minCS+1, nextCode=eoi+1;
      var dict=Object.create(null);
      var bytes=[], acc=0, nbits=0;
      function put(code, size){
        acc |= (code << nbits);
        nbits += size;
        while(nbits>=8){
          bytes.push(acc&255);
          acc >>>= 8;
          nbits -= 8;
        }
      }
      function reset(){
        dict=Object.create(null);
        codeSize=minCS+1;
        nextCode=eoi+1;
      }
      var len=indices.length;
      put(clear, codeSize);
      if(!len){ put(eoi, codeSize); if(nbits) bytes.push(acc&255); return bytes; }
      var prefix=indices[0]&255;
      for(var i=1;i<len;i++){
        var pix=indices[i]&255;
        var key=prefix*256+pix;
        var found=dict[key];
        if(found!==undefined){ prefix=found; continue; }
        put(prefix, codeSize);
        if(nextCode<4096){
          dict[key]=nextCode;
          if(nextCode===(1<<codeSize) && codeSize<12) codeSize++;
          nextCode++;
        }else{
          put(clear, codeSize);
          reset();
        }
        prefix=pix;
      }
      put(prefix, codeSize);
      put(eoi, codeSize);
      if(nbits) bytes.push(acc&255);
      return bytes;
    }
    function subBlocks(data){
      var out=[];
      for(var i=0;i<data.length;i+=255){
        var n=Math.min(255, data.length-i);
        out.push(n);
        for(var j=0;j<n;j++) out.push(data[i+j]);
      }
      out.push(0);
      return out;
    }
    function quantize(rgbaFrames, w, h){
      var counts=new Uint32Array(32768);
      var i,p,f,data,k;
      for(f=0;f<rgbaFrames.length;f++){
        data=rgbaFrames[f];
        for(p=0;p<data.length;p+=4){
          k=((data[p]>>3)<<10)|((data[p+1]>>3)<<5)|(data[p+2]>>3);
          counts[k]++;
        }
      }
      var keys=[];
      for(i=0;i<32768;i++) if(counts[i]) keys.push(i);
      keys.sort(function(a,b){ return counts[b]-counts[a]; });
      if(keys.length>256) keys.length=256;
      var n=keys.length;
      if(!n){ keys=[0]; n=1; }
      var pal=new Uint8Array(768);
      var centers=new Uint8Array(n*3);
      for(i=0;i<n;i++){
        k=keys[i];
        var r=(((k>>10)&31)<<3)|4, g=(((k>>5)&31)<<3)|4, b=((k&31)<<3)|4;
        centers[i*3]=r; centers[i*3+1]=g; centers[i*3+2]=b;
        pal[i*3]=r; pal[i*3+1]=g; pal[i*3+2]=b;
      }
      var lut=new Uint8Array(32768);
      for(i=0;i<32768;i++){
        var r2=(((i>>10)&31)<<3)|4, g2=(((i>>5)&31)<<3)|4, b2=((i&31)<<3)|4;
        var best=0, bd=1e12, j;
        for(j=0;j<n;j++){
          var dr=r2-centers[j*3], dg=g2-centers[j*3+1], db=b2-centers[j*3+2];
          var dist=dr*dr+dg*dg+db*db;
          if(dist<bd){ bd=dist; best=j; if(!dist) break; }
        }
        lut[i]=best;
      }
      var dither=14;
      var frames=[], npx=w*h;
      for(f=0;f<rgbaFrames.length;f++){
        data=rgbaFrames[f];
        var idx=new Uint8Array(npx);
        for(p=0;p<npx;p++){
          var x=p%w, y=(p/w)|0;
          var t=(BAYER[(y&7)*8+(x&7)]/64-0.5)*dither;
          var r=clamp(data[p*4]+t), g=clamp(data[p*4+1]+t), b=clamp(data[p*4+2]+t);
          idx[p]=lut[((r>>3)<<10)|((g>>3)<<5)|(b>>3)];
        }
        frames.push(idx);
      }
      return { palette: pal, frames: frames };
    }
    function encode(opts){
      opts=opts||{};
      var w=opts.width|0, h=opts.height|0;
      var frames=opts.frames||[];
      var pal=opts.palette;
      var delay=opts.delayCs==null?10:opts.delayCs;
      var loop=opts.loop!==false;
      if(!w||!h||!frames.length) throw new Error('GifEnc: nothing to encode');
      var palette=new Uint8Array(768);
      if(pal){
        if(pal.length>=768) for(var pi=0;pi<768;pi++) palette[pi]=pal[pi];
        else for(var pj=0;pj<pal.length;pj++) palette[pj]=pal[pj];
      }
      var out=[];
      function byt(v){ out.push(v&255); }
      function u16(v){ out.push(v&255,(v>>8)&255); }
      function ascii(s){ for(var i=0;i<s.length;i++) out.push(s.charCodeAt(i)&255); }
      ascii('GIF89a');
      u16(w); u16(h);
      byt(0xF7); byt(0); byt(0);
      for(var i=0;i<768;i++) byt(palette[i]);
      if(loop){
        byt(0x21); byt(0xff); byt(0x0b); ascii('NETSCAPE'); ascii('2.0');
        byt(0x03); byt(0x01); u16(0); byt(0x00);
      }
      for(var f=0;f<frames.length;f++){
        byt(0x21); byt(0xf9); byt(0x04); byt(0x00); u16(delay); byt(0x00); byt(0x00);
        byt(0x2c); u16(0); u16(0); u16(w); u16(h); byt(0);
        byt(8);
        var sb=subBlocks(lzw(frames[f], 8));
        for(var j=0;j<sb.length;j++) byt(sb[j]);
      }
      byt(0x3b);
      return new Uint8Array(out);
    }
    root.GifEnc={ encode:encode, quantize:quantize };
  })(typeof window!=='undefined'?window:this);`;

  // Camera — a full-bleed shutter that asks the OS for a studio session
  // (gifos.camera). The sandbox never sees a live stream. Shots land in My
  // Media via gifos.library.put, and a Recents strip is this app's own roll.
  // Never interpolate ${} in this string: it is nested in an outer template.
  const CAMERA_HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
  *{box-sizing:border-box} html,body{height:100%;margin:0}
  body{background:#07070a;color:#f2f0e8;font:14px/1.35 system-ui,sans-serif;display:flex;flex-direction:column;overflow:hidden}
  #empty{flex:1;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:28px 24px;gap:12px}
  #empty.on{display:flex}
  #empty .ring{width:96px;height:96px;border-radius:50%;border:8px solid #e8b84a;box-shadow:inset 0 0 0 10px #14141c,0 8px 28px #0008;background:radial-gradient(circle at 38% 32%,#6a6a78,#0c0c12 62%);margin-bottom:8px}
  #empty h1{font-size:1.35rem;font-weight:800;margin:0;letter-spacing:-.02em}
  #empty p{margin:0;color:#9a9aaa;max-width:22em}
  #stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:#000;position:relative}
  #stage img,#stage video{max-width:100%;max-height:100%;object-fit:contain;display:block}
  #stage .ph{display:flex;flex-direction:column;align-items:center;gap:10px;color:#7a7a88}
  #stage .ph .ring{width:72px;height:72px;border-radius:50%;border:6px solid #e8b84a;background:radial-gradient(circle at 38% 32%,#4a4a58,#0c0c12 62%)}
  #hint{position:absolute;left:12px;right:12px;bottom:12px;text-align:center;font-size:12px;color:#c8c8b8;text-shadow:0 1px 8px #000;pointer-events:none}
  #film{display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:10px 14px 6px;min-height:76px;scrollbar-width:none}
  #film::-webkit-scrollbar{display:none}
  #film img,#film .v{width:64px;height:64px;object-fit:cover;border-radius:10px;flex:0 0 auto;border:2px solid transparent;background:#111;cursor:pointer}
  #film img.on,#film .v.on{border-color:#e8b84a}
  #film .v{display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px}
  #bar{display:flex;align-items:center;justify-content:space-around;padding:8px 18px max(16px,env(safe-area-inset-bottom));gap:12px}
  #shutter{width:74px;height:74px;border-radius:50%;border:4px solid #fff;background:transparent;padding:5px;cursor:pointer}
  #shutter span{display:block;width:100%;height:100%;border-radius:50%;background:#fff}
  #shutter:active span{transform:scale(.92)}
  .ghost{width:48px;height:48px;border:0;border-radius:50%;background:#1a1a22;color:#ddd;font:inherit;cursor:pointer}
  #toast{position:fixed;left:50%;bottom:110px;transform:translateX(-50%);background:#000c;color:#fff;padding:8px 14px;border-radius:10px;font-size:.85rem;opacity:0;transition:opacity .25s;pointer-events:none;max-width:88%;z-index:5}
  #toast.on{opacity:1}
  #ui{flex:1;display:flex;flex-direction:column;min-height:0}
  #ui.hide{display:none}
</style></head><body>
<div id="empty">
  <div class="ring"></div>
  <h1>No camera on this computer</h1>
  <p id="why">Allow the camera in the browser, then turn it on in this app’s Abilities chip at the top of the tab.</p>
</div>
<div id="ui">
  <div id="stage"><div class="ph"><div class="ring"></div><div>Tap the shutter</div></div><div id="hint"></div></div>
  <div id="film"></div>
  <div id="bar">
    <button class="ghost" id="flip" title="Front / back" style="visibility:hidden">🔄</button>
    <button id="shutter" aria-label="Open camera"><span></span></button>
    <button class="ghost" id="rollbtn" title="Recents">🎞️</button>
  </div>
</div>
<div id="toast"></div>
<script>
  var roll = gifos.db('roll');
  var items = [];
  var lastMode = 'photo';
  var toastT;
  function toast(m){ var t=document.getElementById('toast'); t.textContent=m; t.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(function(){ t.classList.remove('on'); }, 2800); }
  function typeOf(mime){ mime=String(mime||''); return mime.indexOf('image/')===0?'image':mime.indexOf('video/')===0?'video':mime.indexOf('audio/')===0?'audio':''; }
  function nameFor(shot){
    var t=new Date().toLocaleString();
    if(shot.kind==='video' || (shot.mime||'').indexOf('video/')===0) return 'Video · '+t;
    if((shot.mime||'')==='image/gif'){
      if(lastMode==='burst') return 'Burst · '+t;
      if(lastMode==='boomerang') return 'Boomerang · '+t;
      if(lastMode==='slowmo') return 'Slow-mo · '+t;
      if(lastMode==='timelapse') return 'Time-lapse · '+t;
      return 'Clip · '+t;
    }
    return 'Photo · '+t;
  }
  function renderFilm(){
    var film=document.getElementById('film');
    var list=items.slice().sort(function(a,b){ return (b.at||0)-(a.at||0); }).slice(0,24);
    film.innerHTML = list.map(function(m){
      if(m.type==='video' && !m.thumb) return '<div class="v" data-id="'+m.id+'">▶</div>';
      var src = m.thumb || '';
      return '<img data-id="'+m.id+'" alt="" '+(src?'src="'+src+'"':'')+'>';
    }).join('');
  }
  function showItem(id){
    var m=items.find(function(x){ return x.id===id; });
    var st=document.getElementById('stage');
    var hint=document.getElementById('hint');
    if(!m){ return; }
    Array.prototype.forEach.call(document.querySelectorAll('#film [data-id]'), function(el){ el.classList.toggle('on', el.getAttribute('data-id')===id); });
    if(m.type==='video'){
      st.innerHTML='<video controls playsinline autoplay muted></video><div id="hint"></div>';
      hint=document.getElementById('hint');
      hint.textContent = m.name+' — in My Media';
      if(m.bytes){ var u=URL.createObjectURL(new Blob([m.bytes],{type:m.mime||'video/webm'})); st.querySelector('video').src=u; }
      else { st.querySelector('video').poster=m.thumb||''; hint.textContent='Open My Media to play this clip.'; }
      return;
    }
    st.innerHTML='<img alt=""><div id="hint"></div>';
    hint=document.getElementById('hint');
    st.querySelector('img').src = m.thumb || '';
    hint.textContent = (m.name||'Photo')+' — in My Media';
    if(m.bytes){ st.querySelector('img').src=URL.createObjectURL(new Blob([m.bytes],{type:m.mime||'image/jpeg'})); }
  }
  document.getElementById('film').onclick=function(e){
    var el=e.target.closest?e.target.closest('[data-id]'):null;
    if(el) showItem(el.getAttribute('data-id'));
  };
  roll.subscribe(function(rows){ items=(rows||[]).filter(function(r){ return r&&r.id; }); renderFilm(); });

  async function putShot(shot){
    if(!shot||!shot.bytes) return;
    var mime=shot.mime||'image/jpeg';
    var type=typeOf(mime)||'image';
    try{
      var r=await gifos.library.put({ bytes:shot.bytes, mime:mime, name:nameFor(shot), type:type, category:'Camera', thumb:shot.thumb||'' });
      if(r && r.missing) toast(r.missing);
      else toast('Saved to My Media');
    }catch(e){ toast(String(e&&e.message||e).slice(0,90)); }
  }
  async function openStudio(){
    try{
      var shot=await gifos.camera({ mode:lastMode });
      if(shot && shot.kind) lastMode = shot.kind==='video' ? 'video' : lastMode;
      await putShot(shot);
      if(shot && shot.thumb){
        var st=document.getElementById('stage');
        st.innerHTML='<img alt=""><div id="hint"></div>';
        st.querySelector('img').src=shot.thumb;
        document.getElementById('hint').textContent='Saved to My Media';
      }
    }catch(e){
      var m=String(e&&e.message||e);
      if(!/cancel/i.test(m)) toast(m.slice(0,90));
    }
  }
  document.getElementById('shutter').onclick=function(){ openStudio(); };
  document.getElementById('rollbtn').onclick=function(){
    var latest=items.slice().sort(function(a,b){ return (b.at||0)-(a.at||0); })[0];
    if(latest) showItem(latest.id);
  };

  (async function boot(){
    var info=null;
    try{ info=await gifos.cameraInfo(); }catch(e){ info={ ok:false, reason:String(e&&e.message||e) }; }
    if(!info||!info.ok){
      document.getElementById('ui').classList.add('hide');
      document.getElementById('empty').classList.add('on');
      if(info && info.reason) document.getElementById('why').textContent=info.reason;
      return;
    }
    if(info.count>1 || (info.facingModes&&info.facingModes.indexOf('user')>=0&&info.facingModes.indexOf('environment')>=0)){
      document.getElementById('flip').style.visibility='visible';
    }
    await openStudio();
  })();
</script></body></html>`;

  function build() {
    const gif = GifOS.gif;
    // Apps that hand-author their theming with CSS variables take 'vars' —
    // palette injected, no auto-remap. This is any app with a signature accent
    // the flat chrome-map can't reach: the board games (boards/marks need
    // contrast choices) and the tools whose own hue (calc blue, chat teal,
    // timer red, fortune gold) must become the computer's accent. Everything
    // else is a plain chrome app that takes the full remap.
    const VAR_APPS = { tictactoe: 1, connect4: 1, minesweeper: 1, chess: 1, pingpong: 1, calc: 1, chat: 1, timer: 1, fortune: 1, bible: 1 };
    const app = (name, appId, accent, html, extra) => ({
      name: name + '.gif', appId, accent,
      files: {
        'manifest.json': manifest(appId, name, accent, extra),
        'index.html': themeHtml(html, VAR_APPS[appId] ? 'vars' : 'full'),
      },
    });
    // The Bible Browser gets a bespoke tile: a leather book that breathes open
    // and shut (a smooth cosine loop, so it never hard-cuts), cream pages with
    // faint text lines, a gold cross while nearly closed and a red ribbon once
    // open. Drawn straight to canvas via the icon rasterizer — independent of
    // the computer's icon pack, so a Bible always looks like a Bible.
    function bibleIcon() {
      const N = 12, S = 72;
      const painter = (f) => (ctx, s) => {
        const t = (1 - Math.cos((2 * Math.PI * f) / N)) / 2; // 0→1→0 breathing
        ctx.clearRect(0, 0, s, s);
        const cx = s * 0.5, cy = s * 0.52;
        const w = s * (0.11 + 0.33 * t);
        const topY = cy - s * 0.26, botY = cy + s * 0.24;
        const gTop = cy - s * 0.20 - s * 0.055 * t, gBot = cy + s * 0.19 - s * 0.03 * t;
        const quad = (x1, y1, x2, y2, x3, y3, x4, y4) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); };
        // soft drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.beginPath(); ctx.ellipse(cx, botY + s * 0.055, w + s * 0.07, s * 0.045, 0, 0, 7); ctx.fill();
        // leather covers (a touch larger, behind the pages)
        const c = s * 0.035;
        ctx.fillStyle = '#5a3a22';
        quad(cx - w - c, topY - c, cx, gTop - c, cx, gBot + c, cx - w - c, botY + c); ctx.fill();
        quad(cx + w + c, topY - c, cx, gTop - c, cx, gBot + c, cx + w + c, botY + c); ctx.fill();
        // cream pages
        ctx.fillStyle = '#f4ecd6';
        quad(cx - w, topY, cx, gTop, cx, gBot, cx - w, botY); ctx.fill();
        quad(cx + w, topY, cx, gTop, cx, gBot, cx + w, botY); ctx.fill();
        // text lines fade in as it opens
        if (t > 0.34) {
          ctx.strokeStyle = 'rgba(95,74,42,' + (0.55 * (t - 0.34) / 0.66).toFixed(3) + ')';
          ctx.lineWidth = Math.max(1, s * 0.012);
          for (let i = 1; i <= 4; i++) {
            const yy = topY + (botY - topY) * (i / 5), gy = gTop + (gBot - gTop) * (i / 5);
            ctx.beginPath(); ctx.moveTo(cx - w * 0.82, yy); ctx.lineTo(cx - w * 0.14, gy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx + w * 0.14, gy); ctx.lineTo(cx + w * 0.82, yy); ctx.stroke();
          }
        }
        // center gutter
        ctx.strokeStyle = 'rgba(70,46,24,0.4)'; ctx.lineWidth = Math.max(1, s * 0.02);
        ctx.beginPath(); ctx.moveTo(cx, gTop); ctx.lineTo(cx, gBot); ctx.stroke();
        // gold cross while nearly shut
        if (t < 0.32) {
          const a = ((0.32 - t) / 0.32).toFixed(3);
          ctx.strokeStyle = 'rgba(214,180,90,' + a + ')'; ctx.lineWidth = Math.max(1, s * 0.032); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx, cy - s * 0.135); ctx.lineTo(cx, cy + s * 0.10); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx - s * 0.058, cy - s * 0.045); ctx.lineTo(cx + s * 0.058, cy - s * 0.045); ctx.stroke();
        }
        // red ribbon once open
        if (t > 0.5) {
          ctx.fillStyle = 'rgba(198,58,58,' + ((t - 0.5) / 0.5).toFixed(3) + ')';
          ctx.fillRect(cx - s * 0.015, gBot - s * 0.02, s * 0.03, s * 0.17);
        }
      };
      const frames = []; for (let f = 0; f < N; f++) frames.push(painter(f));
      return GifOS.icons.rasterize(frames, S, 12);
    }
    // My Media gets a bespoke tile (independent of the computer's icon pack, so
    // it always reads as a media library): a photo card — sky, sun, hills — with
    // a play badge that pulses. Drawn straight to canvas via the rasterizer.
    function mediaIcon(accent) {
      const N = 14, S = 72;
      const ac = 'rgb(' + accent.map((v) => Math.max(0, Math.min(255, v | 0))).join(',') + ')';
      const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
      const painter = (f) => (ctx, s) => {
        const t = (1 - Math.cos((2 * Math.PI * f) / N)) / 2; // 0→1→0
        ctx.clearRect(0, 0, s, s);
        const cx = s * 0.5, cy = s * 0.47, w = s * 0.66, h = s * 0.5, x = cx - w / 2, y = cy - h / 2, r = s * 0.07;
        // contact shadow + card
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; rr(ctx, x + s * 0.02, y + s * 0.05, w, h, r); ctx.fill();
        ctx.fillStyle = '#fff'; rr(ctx, x, y, w, h, r); ctx.fill();
        // photo scene, clipped to the card
        ctx.save(); rr(ctx, x + s * 0.03, y + s * 0.03, w - s * 0.06, h - s * 0.06, r * 0.7); ctx.clip();
        const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#8ec9ff'); g.addColorStop(1, '#e6f3ff');
        ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#ffd23c'; ctx.beginPath(); ctx.arc(x + w * 0.72, y + h * 0.28, s * 0.055, 0, 7); ctx.fill();
        ctx.fillStyle = '#57a06a'; ctx.beginPath();
        ctx.moveTo(x, y + h); ctx.lineTo(x + w * 0.34, y + h * 0.42); ctx.lineTo(x + w * 0.52, y + h * 0.7);
        ctx.lineTo(x + w * 0.7, y + h * 0.36); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
        ctx.restore();
        // play badge, bottom-right, pulsing
        const bx = x + w, by = y + h, br = s * 0.15 * (0.92 + 0.12 * t);
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.arc(bx, by + 2, br, 0, 7); ctx.fill();
        ctx.fillStyle = ac; ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath();
        ctx.moveTo(bx - br * 0.28, by - br * 0.42); ctx.lineTo(bx + br * 0.46, by); ctx.lineTo(bx - br * 0.28, by + br * 0.42); ctx.closePath(); ctx.fill();
      };
      const frames = []; for (let f = 0; f < N; f++) frames.push(painter(f));
      return GifOS.icons.rasterize(frames, S, 11);
    }
    // Camera: a dark body with a gold ring and shutter blades that breathe,
    // plus a gleam that sweeps the glass. Independent of the icon pack so it
    // still reads at 64px on both light and dark tiles.
    function cameraIcon(accent) {
      const N = 16, S = 72;
      const body = 'rgb(' + accent.map((v) => Math.max(0, Math.min(255, v | 0))).join(',') + ')';
      const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
      const painter = (f) => (ctx, s) => {
        const t = f / N;
        const pulse = (1 - Math.cos(2 * Math.PI * t)) / 2;
        ctx.clearRect(0, 0, s, s);
        const cx = s * 0.5, cy = s * 0.54;
        const bw = s * 0.78, bh = s * 0.56, bx = cx - bw / 2, by = cy - bh / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        rr(ctx, bx + 2, by + 4, bw, bh, s * 0.1); ctx.fill();
        ctx.fillStyle = body;
        rr(ctx, bx, by, bw, bh, s * 0.1); ctx.fill();
        ctx.fillStyle = '#2a2a34';
        rr(ctx, cx - s * 0.13, by - s * 0.08, s * 0.26, s * 0.12, s * 0.04); ctx.fill();
        ctx.fillStyle = '#e8b84a';
        ctx.fillRect(cx + s * 0.22, by + s * 0.08, s * 0.07, s * 0.055);
        const R = s * 0.22;
        ctx.beginPath(); ctx.arc(cx, cy, R + s * 0.035, 0, 7); ctx.fillStyle = '#e8b84a'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx, cy, R + s * 0.012, 0, 7); ctx.fillStyle = '#1a1a22'; ctx.fill();
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
        ctx.fillStyle = '#0c0c12'; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        const n = 6, open = 0.2 + 0.22 * pulse;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + t * 0.55;
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, R, a, a + Math.PI * 2 / n * 0.9);
          ctx.closePath();
          ctx.fillStyle = i % 2 ? '#3a3a44' : '#22222c';
          ctx.fill();
        }
        ctx.beginPath(); ctx.arc(cx, cy, R * open, 0, 7);
        ctx.fillStyle = '#07070c'; ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
        const gx = cx - R + (2 * R) * t;
        const g = ctx.createLinearGradient(gx - 8, cy - R, gx + 8, cy + R);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,236,180,' + (0.22 + 0.2 * pulse).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        ctx.restore();
        ctx.beginPath(); ctx.arc(cx, cy, R + s * 0.035, 0, 7);
        ctx.strokeStyle = 'rgba(255,220,140,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
      };
      const frames = []; for (let f = 0; f < N; f++) frames.push(painter(f));
      return GifOS.icons.rasterize(frames, S, 10);
    }
    // Each app gets its own hand-designed animated artwork (gifos-icons.js),
    // rasterized into the GIF. Fall back to the plain animated tile if the
    // icons module isn't present (e.g. non-browser).
    const iconFor = (a) => a.appId === 'bible' && GifOS.icons ? bibleIcon()
      : a.appId === 'mymedia' && GifOS.icons ? mediaIcon(a.accent)
      : a.appId === 'camera' && GifOS.icons ? cameraIcon(a.accent)
      : (GifOS.icons ? GifOS.icons.renderApp(a.appId, a.accent) : null);
    const enc = (a) => Promise.resolve(iconFor(a))
      .catch(() => null)
      .then((preview) => gif.encode(a.files, { accent: a.accent, preview }))
      .then((bytes) => ({ name: a.name, appId: a.appId, accent: a.accent, bytes }));

    // Collection visibility (the sharing axis). An UNDECLARED collection is
    // private, so every app that means to share state must say so:
    //   RW   — read-write: guests see AND edit it (collaboration).
    //   RO   — read-only: guests see it, only the host writes (broadcast).
    //   PRIV — private: never leaves the owner's tab; each participant keeps
    //          their own copy (personal prefs, a guest's own library).
    const RW = { visibility: 'read-write' };
    const RO = { visibility: 'read-only' };
    const PRIV = { visibility: 'private' };

    const groups = [
      { name: 'Games', apps: [
        app('Tic-Tac-Toe', 'tictactoe', [92, 255, 123], TICTACTOE_HTML, { data: { game: RW } }),
        app('Connect Four', 'connect4', [255, 180, 60], CONNECT_FOUR_HTML, { data: { game: RW } }),
        app('Minesweeper', 'minesweeper', [255, 210, 60], MINESWEEPER_HTML, { data: { mine: RW } }),
        // Declares Smartest text so the in-board "Hint" button can ask the
        // computer's AI for a move — the app feeds it a clean FEN + the exact
        // legal-move list (from its own generator) so the model picks among
        // real moves, never a hallucinated one. Key stays in the runtime.
        app('Chess Tournament', 'chess', [232, 195, 122], CHESS_HTML, { capabilities: { db: true, multiplayer: true, network: [], ai: ['smartest'] }, data: { chess: RW } }),
        // Real-time table tennis: host runs physics, guest sends swings.
        // Pressure-aware taps set hit power; smudge direction sets spin.
        app('Ping Pong', 'pingpong', [255, 140, 60], PINGPONG_HTML, { data: { pingpong: RW } }),
      ] },
      { name: 'Studio', apps: [
        app('Paint', 'paint', [255, 92, 170], PAINT_HTML, { data: { canvas: RW } }),
      ] },
      { name: 'Tools', apps: [
        app('Notes', 'notes', [123, 92, 255], NOTES_HTML, { data: { notes: RW } }),
        // Desmos-idiom graphing calculator; the expression list is shared (a
        // classroom room graphs together), the viewport stays per-person.
        app('Calculator', 'calc', [92, 200, 255], CALCULATOR_HTML, { data: { calc: RW, prefs: PRIV } }),
        app('Stopwatch', 'timer', [255, 120, 120], TIMER_HTML),
        // The one app that reaches out: it declares exactly the site it needs,
        // so opening it demonstrates the network acknowledgement on a real app.
        app('Fortune', 'fortune', [255, 206, 107], FORTUNE_HTML, { capabilities: { db: true, network: ['api.adviceslip.com'] }, data: { fortunes: RW } }),
        // Reads the Recovery Version through the GifOS CORS proxy — a live demo
        // of gifos.fetch({ proxy:true }) against a real, public, non-CORS site.
        // Three collections, three visibilities: the shared reading position
        // (nav, read-write and leadable so the host can "only I lead"), who's
        // here (presence, read-write heartbeats), and each reader's OWN theme +
        // font size + last page (prefs, private — never leaves their tab).
        app('Bible Browser', 'bible', [200, 162, 75], BIBLE_HTML, { capabilities: { db: true, multiplayer: true, network: ['text.recoveryversion.bible'] },
          data: { nav: RW, presence: RW, prefs: PRIV }, lead: [{ collection: 'nav', id: 'nav' }] }),
        // Showcases the brokered capabilities: a mic clip analysed on-device,
        // and the computer's own AI models. Both declare what they use.
        app('Speech Coach', 'speechcoach', [123, 92, 255], SPEECHCOACH_HTML, { capabilities: { db: true, microphone: true, network: [] } }),
        // Typed ai declaration (it uses exactly these two roles): the ack
        // sheet then shows a status line PER ROLE — including naming a
        // Provider app when one serves it — instead of the bare generic row.
        app('Ask AI', 'askai', [123, 92, 255], ASKAI_HTML, { capabilities: { db: true, ai: ['cheapest', 'smartest'], network: [] } }),
        // The consumer half of the Provider story (docs/providers.md): reads
        // any pasted text through the brokered Text → speech role — served by
        // an endpoint OR an installed Provider app (e.g. Offline Text to Speech),
        // interchangeably. Saved text is personal, never shared.
        app('Reader', 'reader', [255, 170, 90], READER_HTML, { capabilities: { db: true, ai: ['tts'], network: [] }, data: { texts: PRIV } }),
      ] },
      { name: 'Social', apps: [
        app('Guestbook', 'guestbook', [255, 92, 170], GUESTBOOK_HTML, { data: { entries: RW } }),
        // The "✨ AI draft" button uses YOUR OWN AI model/key (from Settings),
        // brokered locally per person — declares ai so the runtime allows it.
        app('Chat', 'chat', [92, 220, 180], CHAT_HTML, { capabilities: { db: true, multiplayer: true, ai: ['cheapest', 'smartest'], network: [] }, data: { messages: RW, files: RW } }),
      ] },
      // Party games where the phone just facilitates — dealing secrets,
      // keeping time, counting votes — and the action happens in person.
      // Top level: everyone joins from their own phone via Invite. The
      // pass-the-phone versions live in a "Single Phone" subfolder.
      { name: 'IRL Games',
        // Each own-phone game shares one heartbeat collection ('party'): the
        // game doc + everyone's player docs, all read-write. (The Single Phone
        // versions run on one device, so they need no shared visibility.)
        apps: (GifOS.irl ? GifOS.irl.netApps : []).map((g) => app(g.name, g.appId, g.accent, g.html, Object.assign({ data: { party: RW } }, g.manifest))),
        sub: [{ name: 'Single Phone',
          apps: (GifOS.irl ? GifOS.irl.apps : []).map((g) => app(g.name, g.appId, g.accent, g.html, g.manifest)) }] },
    ];
    // Easter eggs: a themed computer (gifos-themes.js) can seed extra apps
    // that exist only on that digit — filed into a named folder, or loose.
    for (const egg of ((GifOS.theme && GifOS.theme.eggs) || [])) {
      const entry = app(egg.name, egg.appId, egg.accent, egg.html, egg.manifest);
      const g = groups.find((x) => x.name === egg.folder);
      if (g) g.apps.push(entry);
    }

    // Loose icons live at the desktop root: Welcome (a real onboarding app —
    // the README travels inside its GIF too) and Meeting (the killer app,
    // pinned top-right by the seeder, not buried in a folder).
    const loose = [{
      name: 'Welcome.gif', appId: 'welcome', accent: [92, 200, 255],
      files: { 'manifest.json': manifest('welcome', 'Welcome', [92, 200, 255], { data: { welcome: PRIV } }), 'index.html': themeHtml(WELCOME_HTML, 'full'), 'README.txt': WELCOME_README },
    }, {
      // Home Screen shutter, between Welcome and My Media. Declares camera +
      // microphone; the live stream stays in the trusted parent (camera-studio).
      name: 'Camera.gif', appId: 'camera', accent: [40, 40, 48],
      files: { 'manifest.json': manifest('camera', 'Camera', [40, 40, 48], { capabilities: { db: true, camera: true, microphone: true },
               data: { roll: PRIV } }),
               'index.html': themeHtml(CAMERA_HTML, 'vars') },
    }, {
      // A personal media library, on the Home Screen under Camera. Declares
      // microphone + camera so you can capture straight in (honours the per-app
      // Abilities opt-out); the app hand-authors its theming, so 'vars' mode.
      name: 'My Media.gif', appId: 'mymedia', accent: [255, 120, 80],
      files: { 'manifest.json': manifest('mymedia', 'My Media', [255, 120, 80], { capabilities: { db: true, microphone: true, camera: true },
               // Your library is PRIVATE by default — nothing rides along an
               // invite. Per item, you "make visible" (setVisibility → read-only)
               // so an invited guest can see and steal that ONE item; the blob
               // bytes are opted in the same way. Guests keep their own captures
               // private (they can't promote what isn't the host's to share).
               data: { media: PRIV, blobs: PRIV } }),
               'index.html': themeHtml(MYMEDIA_HTML, 'vars'),
               'gifenc.js': GIFENC_JS },
    }, {
      name: 'Meeting.gif', appId: 'meet', accent: [92, 160, 255],
      files: { 'manifest.json': manifest('meet', 'Meeting', [92, 160, 255], { system: 'meet' }),
               'index.html': themeHtml(MEET_FALLBACK_HTML, 'full') },
    }, {
      // Meeting's sibling: the same trusted page wearing the broadcast skin
      // (run.html#bc=1) — one host on the Stage, unlimited viewers, chat.
      name: 'Broadcast.gif', appId: 'broadcast', accent: [255, 92, 120],
      files: { 'manifest.json': manifest('broadcast', 'Broadcast', [255, 92, 120], { system: 'broadcast' }),
               'index.html': themeHtml(BROADCAST_FALLBACK_HTML, 'full') },
    }, {
      // Where more apps come from. A system launcher for the same reason
      // Meeting is one: the store installs onto this Home Screen, and the
      // sandbox has no such power (nor should it).
      name: 'App Store.gif', appId: 'appstore', accent: [123, 92, 255],
      files: { 'manifest.json': manifest('appstore', 'App Store', [123, 92, 255], { system: 'store' }),
               'index.html': themeHtml(STORE_FALLBACK_HTML, 'full') },
    }];

    const encGroup = (g) => Promise.all([
      Promise.all(g.apps.map(enc)),
      Promise.all((g.sub || []).map(encGroup)),
    ]).then((r) => ({ name: g.name, apps: r[0], sub: r[1] }));
    return Promise.all([
      Promise.all(groups.map(encGroup)),
      Promise.all(loose.map(enc)),
    ]).then((r) => ({ folders: r[0], loose: r[1] }));
  }

  GifOS.samples = { build };
})(typeof window !== 'undefined' ? window : globalThis);
