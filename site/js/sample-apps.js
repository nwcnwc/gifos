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
  li button{background:#eee;color:#900;padding:4px 8px}
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
  function render(items){
    notes = items;
    list.innerHTML = items.length
      ? items.map(n => '<li'+(n.done?' class="done"':'')+'><span data-t="'+n.id+'">'+esc(n.text)+' <small style="color:#999">— '+esc(n.by||'?')+'</small></span><button data-id="'+n.id+'">Delete</button></li>').join('')
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
</style>
<header>Tic-Tac-Toe</header>
<div class="status" id="status">Loading…</div>
<div class="score" id="score"></div>
<div class="board" id="board"></div>
<button id="new">New game</button>
<script>
  const db = gifos.db('game');
  const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const fresh = () => ({ id:'board', cells:[null,null,null,null,null,null,null,null,null], turn:'X', starts:'X', winner:null, line:null, players:{}, names:{}, score:{X:0,O:0,D:0} });
  let current = fresh();
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
  }
  db.subscribe(function(items){ const b = items.find(function(x){ return x.id === 'board'; }); if (b) current = b; render(); });
  // New game keeps the series score and alternates who starts.
  document.getElementById('new').onclick = function(){
    const nxt = fresh();
    nxt.score = Object.assign({X:0,O:0,D:0}, current.score);
    nxt.starts = current.starts === 'X' ? 'O' : 'X'; nxt.turn = nxt.starts;
    nxt.players = current.players; nxt.names = current.names;
    return db.put(nxt);
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
</style>
<header>Connect Four</header>
<div class="status" id="status">Loading…</div>
<div class="score" id="score"></div>
<div class="grid" id="grid"></div>
<button id="new">New game</button>
<script>
  const db = gifos.db('game'), W=7, H=6;
  const fresh = () => ({ id:'board', cells:new Array(W*H).fill(null), turn:'R', starts:'R', winner:null, line:null, players:{}, names:{}, score:{R:0,Y:0,D:0} });
  let cur = fresh(), me = { id:'local', name:'You' };
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
  }
  db.subscribe(function(items){ const b=items.find(function(x){return x.id==='board';}); if(b) cur=b; render(); });
  // New game keeps the series score and alternates who starts.
  document.getElementById('new').onclick=function(){
    const nxt=fresh();
    nxt.score=Object.assign({R:0,Y:0,D:0},cur.score);
    nxt.starts=cur.starts==='R'?'Y':'R'; nxt.turn=nxt.starts;
    nxt.players=cur.players; nxt.names=cur.names;
    return db.put(nxt);
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
  .quick{display:flex;gap:4px;padding:0 18px 8px}
  .quick button{background:var(--surface,#1c1c2b);font-size:18px;padding:6px 10px}
</style>
<header>Chat</header>
<div id="log"></div>
<div class="quick" id="quick"></div>
<form id="f"><button type="button" id="att" title="Attach a photo or file">📎</button><input type="file" id="fi" hidden><input id="t" placeholder="Message… (press Invite to chat with friends)" autocomplete="off"><button>Send</button></form>
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
  ['👍','❤️','😂','','😮','🔥'].forEach(function(e){
    const b=document.createElement('button'); b.type='button'; b.textContent=e;
    b.onclick=function(){ sendText(e); };
    document.getElementById('quick').appendChild(b);
  });
  document.getElementById('f').onsubmit=function(e){ e.preventDefault();
    const t=document.getElementById('t'); if(!t.value.trim()) return;
    sendText(t.value.trim()); t.value='';
  };
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

  const CALCULATOR_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:16px system-ui;margin:0;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;box-sizing:border-box;background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:14px 18px;font-weight:700;color:var(--accent,#5cc8ff)}
  #disp{width:264px;margin:16px;padding:14px 16px;text-align:right;font-size:30px;background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:12px;overflow:hidden}
  .keys{display:grid;grid-template-columns:repeat(4,60px);gap:8px}
  button{height:60px;border:1px solid var(--border,#1c1c2b);border-radius:12px;background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0);font-size:20px;cursor:pointer}
  button:hover{background:var(--border,#26263a)}
  button.op{background:var(--accent,#5cc8ff);color:var(--onaccent,#04223a);font-weight:700;border-color:transparent}
  button.eq{background:var(--accent2,#5cff7b);color:var(--onaccent,#04231b);font-weight:700;border-color:transparent}
  button.wide{grid-column:span 2}
</style>
<header>Calculator</header>
<div id="disp">0</div>
<div class="keys" id="keys"></div>
<script>
  const disp=document.getElementById('disp');
  let acc=null, op=null, cur='0', fresh=true;
  function show(){ disp.textContent=cur; }
  function num(d){ if(fresh||cur==='0'){ cur=(d==='.'?'0.':d); fresh=false; } else if(!(d==='.'&&cur.indexOf('.')>=0)){ cur+=d; } show(); }
  function apply(a,o,b){ a=parseFloat(a); b=parseFloat(b); return o==='+'?a+b:o==='-'?a-b:o==='×'?a*b:o==='÷'?(b?a/b:0):b; }
  function setOp(o){ if(op&&!fresh){ acc=String(apply(acc,op,cur)); cur=acc; show(); } else { acc=cur; } op=o; fresh=true; }
  function eq(){ if(op){ cur=String(apply(acc,op,cur)); op=null; acc=null; fresh=true; show(); } }
  function clr(){ acc=null; op=null; cur='0'; fresh=true; show(); }
  const rows=[['7','8','9','÷'],['4','5','6','×'],['1','2','3','-'],['0','.','=','+']];
  const keys=document.getElementById('keys');
  keys.appendChild(mk('C','wide',clr));
  keys.appendChild(mk('⌫','', function(){ cur=cur.length>1?cur.slice(0,-1):'0'; show(); }));
  rows.forEach(function(r){ r.forEach(function(k){
    if(k==='=') keys.appendChild(mk('=','eq',eq));
    else if('+-×÷'.indexOf(k)>=0) keys.appendChild(mk(k,'op',function(){ setOp(k); }));
    else keys.appendChild(mk(k,'',function(){ num(k); }));
  }); });
  function mk(t,cls,fn){ const b=document.createElement('button'); b.textContent=t; if(cls) b.className=cls; b.onclick=fn; return b; }
  // full keyboard support
  window.addEventListener('keydown',function(e){
    const k=e.key;
    if(k>='0'&&k<='9'||k==='.') num(k);
    else if(k==='+') setOp('+'); else if(k==='-') setOp('-');
    else if(k==='*'||k==='x') setOp('×'); else if(k==='/'){ e.preventDefault(); setOp('÷'); }
    else if(k==='Enter'||k==='=') eq();
    else if(k==='Backspace'){ cur=cur.length>1?cur.slice(0,-1):'0'; show(); }
    else if(k==='Escape'||k==='c'||k==='C') clr();
    else if(k==='%'){ cur=String(parseFloat(cur)/100); show(); }
  });
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

  // Shown only if this GIF is run somewhere WITHOUT the GifOS system routing
  // (an old build, another host). On a real desktop the runtime never mounts
  // this — it routes the icon straight to the trusted meet.html page.
  const MEET_FALLBACK_HTML = `<!doctype html><meta charset="utf-8"><style>
  body{font:15px system-ui;background:#0a0a0f;color:#e0e0f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
  .card{max-width:420px;padding:2rem;border:1px solid #2a2a3f;border-radius:1rem;background:#14141f}
  h2{color:#5ca0ff;margin-top:0} p{color:#9a9ab5;line-height:1.5} code{color:#5ca0ff}
</style><div class="card"><h2>Meeting</h2>
<p>This is a GifOS <b>system app</b>. Live camera and microphone can't run inside the
app sandbox (media is strictly peer-to-peer and needs trusted WebRTC), so this icon
opens the built-in meeting page when opened in GifOS.</p>
<p>Open this GIF on your Home Screen at <code>gifos.app</code> to start a meeting.</p></div>`;

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
  body{margin:0;font:16px system-ui;display:flex;flex-direction:column;height:100vh;transition:background .2s,color .2s}
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
  nav button.chip{font-size:15px;min-width:34px;text-align:center}
  main{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;background:var(--rbg)}
  .doc{max-width:680px;margin:0 auto;padding:22px 20px 64px;line-height:1.75;font-size:var(--fs);font-family:Georgia,'Times New Roman',serif;color:var(--rtext);overflow-wrap:anywhere}
  .doc img,.doc table{max-width:100%}
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
  var db=(window.gifos&&gifos.db)?gifos.db('bible'):null;
  var hist=[], hi=-1, curUrl=HOME;
  var prefs={ theme:'night', fs:18 };
  function esc(s){var d=document.createElement('div');d.textContent=s==null?'':s;return d.innerHTML;}
  function applyPrefs(){ document.body.setAttribute('data-read', prefs.theme); document.documentElement.style.setProperty('--fs', prefs.fs+'px');
    document.getElementById('theme').innerHTML = prefs.theme==='night' ? '&#9790;' : '&#9728;'; }
  function savePrefs(){ if(db) db.put({id:'prefs', theme:prefs.theme, fs:prefs.fs}); }
  function setStatus(msg,err){ main.innerHTML='<div class="status'+(err?' err':'')+'">'+msg+'</div>'; }
  function buttons(){ backB.disabled=hi<=0; fwdB.disabled=hi>=hist.length-1; }
  function shortLoc(u){ try{ var x=new URL(u); return (x.pathname+x.search)||'/'; }catch(e){ return u; } }
  function resolve(href, base){ try{ return new URL(href, base).toString(); }catch(e){ return null; } }
  // Base for resolving a page's relative links: honour <base href> if present,
  // else the page's own URL. (Old static Bible sites often set <base>, and
  // getting this wrong is what sends chapter links to the wrong file.)
  function baseFor(doc, url){ var b=doc.querySelector('base[href]'); if(b){ var r=resolve(b.getAttribute('href'), url); if(r) return r; } return url; }
  // Fetch + parse one page through the CORS proxy.
  function fetchDoc(url){ return gifos.fetch(url,{proxy:true}).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status+' for '+shortLoc(url)); return r.text(); })
    .then(function(t){ return new DOMParser().parseFromString(t,'text/html'); }); }
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
    return fetchDoc(url).then(function(doc){
      var base=baseFor(doc, url); absolutizeAnchors(doc, base);
      var frames=Array.prototype.slice.call(doc.querySelectorAll('frame[src],iframe[src]'));
      var same=frames.filter(function(fr){ var s=resolve(fr.getAttribute('src'), base); try{ return s && new URL(s).hostname===HOST; }catch(e){ return false; } });
      if(!same.length) return { root: doc.body || doc.documentElement };
      return Promise.all(same.map(function(fr){
        var src=resolve(fr.getAttribute('src'), base);
        return fetchDoc(src).then(function(fdoc){
          var fbase=baseFor(fdoc, src); absolutizeAnchors(fdoc, fbase);
          var holder=document.createElement('div'); holder.innerHTML=(fdoc.body?fdoc.body.innerHTML:'');
          if(fr.parentNode) fr.parentNode.replaceChild(holder, fr); else (doc.body||doc.documentElement).appendChild(holder);
        }).catch(function(){ if(fr.parentNode) fr.parentNode.removeChild(fr); });
      })).then(function(){ return { root: doc.body || doc.documentElement }; });
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
        if(href && href.charAt(0)==='#'){ el.setAttribute('href','#'); return; }
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
    main.scrollTop=0; locEl.textContent=shortLoc(curUrl);
  }
  function go(url, push){
    curUrl=url;
    if(push){ hist=hist.slice(0,hi+1); hist.push(url); hi=hist.length-1; }
    buttons(); locEl.textContent=shortLoc(url); setStatus('Loading '+esc(shortLoc(url))+'&hellip;');
    if(!window.gifos||!gifos.fetch){ setStatus('Open this from GifOS to reach the internet.', true); return; }
    var want=url;
    loadPage(url).then(function(res){ if(curUrl!==want) return; render(res.root); if(db) db.put({id:'last',url:url}); })
      .catch(function(e){ if(curUrl!==want) return; setStatus('Couldn&rsquo;t load that page. You may be offline, or this app&rsquo;s internet is switched off (the &ldquo;Internet&rdquo; button up top).<br><br><small>'+esc(e&&e.message||'')+'</small>', true); });
  }
  main.addEventListener('click', function(e){
    var a=e.target.closest&&e.target.closest('a[data-nav]');
    if(a){ e.preventDefault(); go(a.getAttribute('data-nav'), true); }
  });
  backB.onclick=function(){ if(hi>0){ hi--; go(hist[hi], false); buttons(); } };
  fwdB.onclick=function(){ if(hi<hist.length-1){ hi++; go(hist[hi], false); buttons(); } };
  document.getElementById('reload').onclick=function(){ go(curUrl, false); };
  document.getElementById('home').onclick=function(){ go(HOME, true); };
  document.getElementById('bigger').onclick=function(){ prefs.fs=Math.min(30, prefs.fs+2); applyPrefs(); savePrefs(); };
  document.getElementById('smaller').onclick=function(){ prefs.fs=Math.max(14, prefs.fs-2); applyPrefs(); savePrefs(); };
  document.getElementById('theme').onclick=function(){ prefs.theme=prefs.theme==='night'?'day':'night'; applyPrefs(); savePrefs(); };
  if(window.gifos&&gifos.onBack) gifos.onBack(function(){ if(hi>0){ hi--; go(hist[hi], false); buttons(); } });
  // Restore reading prefs + last page (both saved in this icon), then load.
  (db?db.get('prefs'):Promise.resolve(null)).then(function(p){ if(p){ if(p.theme) prefs.theme=p.theme; if(p.fs) prefs.fs=p.fs; } applyPrefs(); })
    .then(function(){ return db?db.get('last'):null; })
    .then(function(rec){ go(rec&&rec.url&&rec.url.indexOf('https://'+HOST)===0?rec.url:HOME, true); })
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
  const ASKAI_HTML = `<!doctype html><meta charset="utf-8">
<style>
  *{box-sizing:border-box} html,body{height:100%}
  body{font:15px system-ui;margin:0;background:#0a0a0f;color:#e0e0f0;display:flex;flex-direction:column}
  header{background:#14141f;border-bottom:1px solid #2a2a3f;padding:14px 18px;font-weight:700;color:#7b5cff}
  #log{flex:1;overflow-y:auto;padding:14px 18px;display:flex;flex-direction:column;gap:10px}
  .m{max-width:85%;padding:9px 13px;border-radius:12px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
  .m.you{align-self:flex-end;background:#14141f;border:1px solid #7b5cff}
  .m.ai{align-self:flex-start;background:#14141f;border:1px solid #2a2a3f}
  .note{color:#8888aa;font-size:.88rem;padding:16px 18px;line-height:1.5}
  .pick{display:flex;gap:6px;padding:0 18px 8px}
  .pick button{padding:6px 12px;border-radius:999px;border:1px solid #2a2a3f;background:#14141f;color:#8888aa;font-size:.8rem;cursor:pointer}
  .pick button.on{background:#7b5cff;color:#fff;border-color:#7b5cff}
  form{display:flex;gap:8px;padding:12px 18px;border-top:1px solid #2a2a3f}
  input{flex:1;padding:11px 12px;border:1px solid #2a2a3f;border-radius:9px;background:#1c1c2b;color:#e0e0f0;font:inherit}
  form button{padding:11px 16px;border:0;border-radius:9px;background:#7b5cff;color:#fff;font-weight:700;cursor:pointer}
</style>
<header>Ask AI</header>
<div id="log"></div>
<div class="pick"><button data-m="cheapest" class="on">Cheapest</button><button data-m="smartest">Smartest</button></div>
<form id="f"><input id="t" placeholder="Ask anything…" autocomplete="off"><button>Send</button></form>
<script>
const log=document.getElementById('log'); let model='cheapest', msgs=[];
function add(role,txt){ const d=document.createElement('div'); d.className='m '+(role==='user'?'you':'ai'); d.textContent=txt; log.appendChild(d); log.scrollTop=log.scrollHeight; return d; }
document.querySelectorAll('.pick button').forEach(b=>b.onclick=()=>{ model=b.dataset.m; document.querySelectorAll('.pick button').forEach(x=>x.classList.toggle('on',x===b)); });
(async()=>{
  if(!window.gifos||!gifos.ai){ log.innerHTML='<div class="note">Open this inside GifOS to use AI.</div>'; return; }
  const m=await gifos.ai.models().catch(()=>({available:[]}));
  if(!(m.available||[]).includes('cheapest')&&!(m.available||[]).includes('smartest'))
    log.innerHTML='<div class="note">No AI model is set up yet. On your GifOS Home Screen open <b>Settings → AI models</b>, add an OpenAI-compatible endpoint + key for “Cheapest text” or “Smartest text”, press <b>Test</b>, then come back. Your key stays in your browser — this app never sees it.</div>';
})();
document.getElementById('f').onsubmit=async e=>{
  e.preventDefault(); const t=document.getElementById('t'); const q=t.value.trim(); if(!q)return; t.value='';
  add('user',q); msgs.push({role:'user',content:q}); const holder=add('ai','…');
  try{ const r=await gifos.ai.chat({model:model,messages:msgs}); holder.textContent=r.text||'(no answer)'; msgs.push({role:'assistant',content:r.text||''}); }
  catch(err){ holder.textContent='⚠ '+((err&&err.message)||err); }
  log.scrollTop=log.scrollHeight;
};
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

  function build() {
    const gif = GifOS.gif;
    // Apps that hand-author their theming with CSS variables take 'vars' —
    // palette injected, no auto-remap. This is any app with a signature accent
    // the flat chrome-map can't reach: the board games (boards/marks need
    // contrast choices) and the tools whose own hue (calc blue, chat teal,
    // timer red, fortune gold) must become the computer's accent. Everything
    // else is a plain chrome app that takes the full remap.
    const VAR_APPS = { tictactoe: 1, connect4: 1, minesweeper: 1, chess: 1, calc: 1, chat: 1, timer: 1, fortune: 1, bible: 1 };
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
    // Each app gets its own hand-designed animated artwork (gifos-icons.js),
    // rasterized into the GIF. Fall back to the plain animated tile if the
    // icons module isn't present (e.g. non-browser).
    const iconFor = (a) => a.appId === 'bible' && GifOS.icons ? bibleIcon()
      : (GifOS.icons ? GifOS.icons.renderApp(a.appId, a.accent) : null);
    const enc = (a) => Promise.resolve(iconFor(a))
      .catch(() => null)
      .then((preview) => gif.encode(a.files, { accent: a.accent, preview }))
      .then((bytes) => ({ name: a.name, appId: a.appId, accent: a.accent, bytes }));

    const groups = [
      { name: 'Games', apps: [
        app('Tic-Tac-Toe', 'tictactoe', [92, 255, 123], TICTACTOE_HTML),
        app('Connect Four', 'connect4', [255, 180, 60], CONNECT_FOUR_HTML),
        app('Minesweeper', 'minesweeper', [255, 210, 60], MINESWEEPER_HTML),
        // Declares Smartest text so the in-board "Hint" button can ask the
        // computer's AI for a move — the app feeds it a clean FEN + the exact
        // legal-move list (from its own generator) so the model picks among
        // real moves, never a hallucinated one. Key stays in the runtime.
        app('Chess Tournament', 'chess', [232, 195, 122], CHESS_HTML, { capabilities: { db: true, multiplayer: true, network: [], ai: ['smartest'] } }),
      ] },
      { name: 'Studio', apps: [
        app('Paint', 'paint', [255, 92, 170], PAINT_HTML),
      ] },
      { name: 'Tools', apps: [
        app('Notes', 'notes', [123, 92, 255], NOTES_HTML),
        app('Calculator', 'calc', [92, 200, 255], CALCULATOR_HTML),
        app('Stopwatch', 'timer', [255, 120, 120], TIMER_HTML),
        // The one app that reaches out: it declares exactly the site it needs,
        // so opening it demonstrates the network acknowledgement on a real app.
        app('Fortune', 'fortune', [255, 206, 107], FORTUNE_HTML, { capabilities: { db: true, network: ['api.adviceslip.com'] } }),
        // Reads the Recovery Version through the GifOS CORS proxy — a live demo
        // of gifos.fetch({ proxy:true }) against a real, public, non-CORS site.
        app('Bible Browser', 'bible', [200, 162, 75], BIBLE_HTML, { capabilities: { db: true, network: ['text.recoveryversion.bible'] } }),
        // Showcases the brokered capabilities: a mic clip analysed on-device,
        // and the computer's own AI models. Both declare what they use.
        app('Speech Coach', 'speechcoach', [123, 92, 255], SPEECHCOACH_HTML, { capabilities: { db: true, microphone: true, network: [] } }),
        app('Ask AI', 'askai', [123, 92, 255], ASKAI_HTML, { capabilities: { db: true, ai: true, network: [] } }),
      ] },
      { name: 'Social', apps: [
        app('Guestbook', 'guestbook', [255, 92, 170], GUESTBOOK_HTML),
        app('Chat', 'chat', [92, 220, 180], CHAT_HTML),
      ] },
      // Party games where the phone just facilitates — dealing secrets,
      // keeping time, counting votes — and the action happens in person.
      // Top level: everyone joins from their own phone via Invite. The
      // pass-the-phone versions live in a "Single Phone" subfolder.
      { name: 'IRL Games',
        apps: (GifOS.irl ? GifOS.irl.netApps : []).map((g) => app(g.name, g.appId, g.accent, g.html)),
        sub: [{ name: 'Single Phone',
          apps: (GifOS.irl ? GifOS.irl.apps : []).map((g) => app(g.name, g.appId, g.accent, g.html)) }] },
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
      files: { 'manifest.json': manifest('welcome', 'Welcome', [92, 200, 255]), 'index.html': themeHtml(WELCOME_HTML, 'full'), 'README.txt': WELCOME_README },
    }, {
      name: 'Meeting.gif', appId: 'meet', accent: [92, 160, 255],
      files: { 'manifest.json': manifest('meet', 'Meeting', [92, 160, 255], { system: 'meet' }),
               'index.html': themeHtml(MEET_FALLBACK_HTML, 'full') },
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
