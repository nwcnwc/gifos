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
  li span{flex:1}
  li button{background:#eee;color:#900;padding:4px 8px}
  .empty{color:#999;padding:0 18px}
</style>
<header>📝 Notes</header>
<form id="f"><input id="t" placeholder="Write a note and press Add…" autocomplete="off"><button>Add</button></form>
<ul id="list"></ul>
<script>
  const db = gifos.db('notes'), list = document.getElementById('list');
  let me = { name: 'You' };
  if (window.gifos) gifos.me().then(m => { me = { id: m.id, name: m.name || 'You' }; });
  const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function render(items){
    list.innerHTML = items.length
      ? items.map(n => '<li><span>'+esc(n.text)+' <small style="color:#999">— '+esc(n.by||'?')+'</small></span><button data-id="'+n.id+'">Delete</button></li>').join('')
      : '<div class="empty">No notes yet. Your notes persist in this GIF icon.</div>';
  }
  db.subscribe(render);
  document.getElementById('f').onsubmit = async e => {
    e.preventDefault();
    const t = document.getElementById('t');
    if (t.value.trim()) { await db.put({ text: t.value.trim(), by: me.name }); t.value=''; }
  };
  list.onclick = async e => { if (e.target.dataset.id) await db.delete(e.target.dataset.id); };
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
<header>📖 Shared Guestbook</header>
<div class="hint" id="hint">Go multiplayer and share the link — everyone signs with their screen name.</div>
<form id="f">
  <input id="msg" placeholder="Say something…" autocomplete="off">
  <button>Sign</button>
</form>
<ul id="list"></ul>
<script>
  const db = gifos.db('entries'), list = document.getElementById('list');
  let me = { name: 'You' };
  if (window.gifos) gifos.me().then(m => { me = { id: m.id, name: m.name || 'You' };
    document.getElementById('hint').textContent = 'Signing as ' + me.name + '. Go multiplayer to sign with friends.'; });
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
  body{font:16px system-ui;margin:0;background:#0a0a0f;color:#e0e0f0;display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;background:#14141f;border-bottom:1px solid #2a2a3f;padding:14px 18px;font-weight:700;color:#5cff7b;box-sizing:border-box}
  .status{margin:16px 0 4px;font-size:15px;color:#8888aa;min-height:22px}
  .board{display:grid;grid-template-columns:repeat(3,88px);grid-template-rows:repeat(3,88px);gap:8px;margin:14px 0}
  .cell{background:#14141f;border:1px solid #2a2a3f;border-radius:12px;font-size:44px;font-weight:800;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none}
  .cell:hover{border-color:#5cff7b}
  .cell.x{color:#7b5cff}.cell.o{color:#ff5caa}
  button{margin:10px 0 24px;padding:9px 20px;border:0;border-radius:8px;background:#5cff7b;color:#0a0a0f;cursor:pointer;font:inherit;font-weight:700}
</style>
<header>⭕ Tic-Tac-Toe</header>
<div class="status" id="status">Loading…</div>
<div class="board" id="board"></div>
<button id="new">New game</button>
<script>
  const db = gifos.db('game');
  const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const fresh = () => ({ id:'board', cells:[null,null,null,null,null,null,null,null,null], turn:'X', winner:null, players:{}, names:{} });
  let current = fresh();
  let me = { id: 'local', name: 'You' };
  if (window.gifos) gifos.me().then(function(m){ me = { id: m.id, name: m.name || 'You' }; render(); });
  const boardEl = document.getElementById('board'), statusEl = document.getElementById('status');
  function winnerOf(c){ for (const w of WINS) if (c[w[0]] && c[w[0]]===c[w[1]] && c[w[0]]===c[w[2]]) return c[w[0]];
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
        current.turn = seat === 'X' ? 'O' : 'X';
        await db.put(current);
        render();
      };
      boardEl.appendChild(d);
    });
    const vs = 'X: ' + label('X') + '  ·  O: ' + label('O');
    statusEl.textContent = current.winner === 'draw' ? 'Draw! Tap New game. — ' + vs
      : current.winner ? label(current.winner) + ' (' + current.winner + ') wins! 🎉 — ' + vs
      : (playable ? 'Your move (' + current.turn + ')' : 'Waiting for ' + (label(current.turn) || current.turn)) + '  —  ' + vs;
  }
  db.subscribe(function(items){ const b = items.find(function(x){ return x.id === 'board'; }); if (b) current = b; render(); });
  document.getElementById('new').onclick = function(){ return db.put(fresh()); };
  render();
</script>`;

  const CONNECT_FOUR_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:15px system-ui;margin:0;background:#0a0a0f;color:#e0e0f0;display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;box-sizing:border-box;background:#14141f;border-bottom:1px solid #2a2a3f;padding:14px 18px;font-weight:700;color:#ffb43c}
  .status{margin:14px 0 6px;color:#8888aa;min-height:20px;text-align:center;padding:0 12px}
  .grid{display:grid;grid-template-columns:repeat(7,44px);gap:6px;background:#12203a;padding:10px;border-radius:12px;margin:6px 0}
  .cell{width:44px;height:44px;border-radius:50%;background:#0a0a0f;cursor:pointer}
  .cell.r{background:#ff5c5c}.cell.y{background:#ffd23c}
  button{margin:12px;padding:9px 18px;border:0;border-radius:8px;background:#ffb43c;color:#0a0a0f;font-weight:700;cursor:pointer}
</style>
<header>🔴 Connect Four</header>
<div class="status" id="status">Loading…</div>
<div class="grid" id="grid"></div>
<button id="new">New game</button>
<script>
  const db = gifos.db('game'), W=7, H=6;
  const fresh = () => ({ id:'board', cells:new Array(W*H).fill(null), turn:'R', winner:null, players:{}, names:{} });
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
      for(const d of dirs){ let n=1; for(let k=1;k<4;k++){ const nx=x+d[0]*k,ny=y+d[1]*k; if(nx<0||nx>=W||ny<0||ny>=H||cells[ny*W+nx]!==c) break; n++; } if(n>=4) return c; } }
    return cells.every(Boolean)?'draw':null;
  }
  function drop(col){
    if(!canPlay()) return;
    let row=-1; for(let y=H-1;y>=0;y--){ if(!cur.cells[y*W+col]){ row=y; break; } }
    if(row<0) return;
    const seat=cur.turn;
    cur.players=Object.assign({},cur.players); cur.players[seat]=cur.players[seat]||me.id;
    cur.names=Object.assign({},cur.names); if(cur.players[seat]===me.id) cur.names[seat]=me.name;
    cur.cells=cur.cells.slice(); cur.cells[row*W+col]=seat;
    cur.winner=win(cur.cells); cur.turn=seat==='R'?'Y':'R';
    db.put(cur); render();
  }
  function render(){
    gridEl.innerHTML='';
    for(let i=0;i<W*H;i++){ const d=document.createElement('div'); const v=cur.cells[i];
      d.className='cell'+(v?' '+v.toLowerCase():''); d.onclick=function(){ drop(i%W); }; gridEl.appendChild(d); }
    const vs='🔴 '+label('R')+'  vs  🟡 '+label('Y');
    statusEl.textContent = cur.winner==='draw'?'Draw! — '+vs
      : cur.winner?label(cur.winner)+' wins! 🎉 — '+vs
      : (canPlay()?'Your move':'Waiting for '+label(cur.turn))+'  —  '+vs;
  }
  db.subscribe(function(items){ const b=items.find(function(x){return x.id==='board';}); if(b) cur=b; render(); });
  document.getElementById('new').onclick=function(){ return db.put(fresh()); };
  render();
</script>`;

  const CHAT_HTML = `<!doctype html><meta charset="utf-8">
<style>
  *{box-sizing:border-box} html,body{height:100%}
  body{font:15px system-ui;margin:0;background:#0a0a0f;color:#e0e0f0;display:flex;flex-direction:column}
  header{background:#14141f;border-bottom:1px solid #2a2a3f;padding:14px 18px;font-weight:700;color:#5cdcb4}
  #log{flex:1;overflow-y:auto;padding:14px 18px;display:flex;flex-direction:column;gap:8px}
  .m{max-width:80%;padding:8px 12px;border-radius:12px;background:#14141f;border:1px solid #2a2a3f}
  .m.mine{align-self:flex-end;background:#173a30;border-color:#2a5a48}
  .m b{color:#5cdcb4;font-size:12px;display:block;margin-bottom:2px}
  form{display:flex;gap:8px;padding:12px 18px;border-top:1px solid #2a2a3f}
  input{flex:1;padding:10px 12px;border:1px solid #2a2a3f;border-radius:8px;background:#1c1c2b;color:#e0e0f0;font:inherit}
  button{padding:10px 16px;border:0;border-radius:8px;background:#5cdcb4;color:#04231b;font-weight:700;cursor:pointer}
</style>
<header>💬 Chat</header>
<div id="log"></div>
<form id="f"><input id="t" placeholder="Message… (go multiplayer to chat with friends)" autocomplete="off"><button>Send</button></form>
<script>
  const db=gifos.db('messages'), log=document.getElementById('log');
  let me={id:'local',name:'You'};
  if(window.gifos) gifos.me().then(function(m){ me={id:m.id,name:m.name||'You'}; });
  const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function render(items){
    items=items.slice().sort(function(a,b){return (a.t||0)-(b.t||0);});
    log.innerHTML=items.map(function(m){ return '<div class="m'+(m.uid===me.id?' mine':'')+'"><b>'+esc(m.by||'anon')+'</b>'+esc(m.text)+'</div>'; }).join('');
    log.scrollTop=log.scrollHeight;
  }
  db.subscribe(render);
  document.getElementById('f').onsubmit=async function(e){ e.preventDefault();
    const t=document.getElementById('t'); if(!t.value.trim()) return;
    await db.put({ by:me.name, uid:me.id, text:t.value.trim(), t:Date.now() }); t.value='';
  };
</script>`;

  const PAINT_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:14px system-ui;margin:0;background:#0a0a0f;color:#e0e0f0;display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;box-sizing:border-box;background:#14141f;border-bottom:1px solid #2a2a3f;padding:14px 18px;font-weight:700;color:#ff5caa}
  .board{display:grid;grid-template-columns:repeat(16,20px);gap:1px;background:#2a2a3f;padding:1px;margin:14px;touch-action:none}
  .px{width:20px;height:20px;background:#14141f}
  .palette{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;padding:0 12px}
  .sw{width:26px;height:26px;border-radius:6px;cursor:pointer;border:2px solid transparent}
  .sw.sel{border-color:#fff}
  button{margin:12px;padding:8px 16px;border:0;border-radius:8px;background:#ff5caa;color:#fff;cursor:pointer}
</style>
<header>🎨 Paint — draw together</header>
<div class="palette" id="pal"></div>
<div class="board" id="board"></div>
<button id="clear">Clear</button>
<script>
  const db=gifos.db('canvas'), N=16, COLORS=['#14141f','#ff5c5c','#ffd23c','#5cff7b','#5cc8ff','#7b5cff','#ff5caa','#ffffff'];
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
  body{font:16px system-ui;margin:0;background:#0a0a0f;color:#e0e0f0;display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;box-sizing:border-box;background:#14141f;border-bottom:1px solid #2a2a3f;padding:14px 18px;font-weight:700;color:#5cc8ff}
  #disp{width:264px;margin:16px;padding:14px 16px;text-align:right;font-size:30px;background:#14141f;border:1px solid #2a2a3f;border-radius:12px;overflow:hidden}
  .keys{display:grid;grid-template-columns:repeat(4,60px);gap:8px}
  button{height:60px;border:0;border-radius:12px;background:#1c1c2b;color:#e0e0f0;font-size:20px;cursor:pointer}
  button:hover{background:#26263a}
  button.op{background:#5cc8ff;color:#04223a;font-weight:700}
  button.eq{background:#5cff7b;color:#04231b;font-weight:700}
  button.wide{grid-column:span 2}
</style>
<header>🔢 Calculator</header>
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
</script>`;

  const TIMER_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:16px system-ui;margin:0;background:#0a0a0f;color:#e0e0f0;display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;box-sizing:border-box;background:#14141f;border-bottom:1px solid #2a2a3f;padding:14px 18px;font-weight:700;color:#ff7878}
  #t{font-size:56px;font-variant-numeric:tabular-nums;margin:40px 0 20px;letter-spacing:2px}
  .row{display:flex;gap:10px}
  button{padding:12px 24px;border:0;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;background:#1c1c2b;color:#e0e0f0}
  button.go{background:#5cff7b;color:#04231b}button.stop{background:#ff7878;color:#2a0a0a}
</style>
<header>⏱️ Stopwatch</header>
<div id="t">00:00.0</div>
<div class="row">
  <button id="go" class="go">Start</button>
  <button id="reset">Reset</button>
</div>
<script>
  let running=false, base=0, elapsed=0, raf=0;
  const tEl=document.getElementById('t'), go=document.getElementById('go');
  function fmt(ms){ const m=Math.floor(ms/60000), s=Math.floor(ms/1000)%60, d=Math.floor(ms/100)%10;
    return (m<10?'0':'')+m+':'+(s<10?'0':'')+s+'.'+d; }
  function tick(){ tEl.textContent=fmt(elapsed+(running?Date.now()-base:0)); if(running) raf=requestAnimationFrame(tick); }
  go.onclick=function(){ if(running){ elapsed+=Date.now()-base; running=false; go.textContent='Start'; go.className='go'; cancelAnimationFrame(raf); }
    else { base=Date.now(); running=true; go.textContent='Stop'; go.className='stop'; tick(); } };
  document.getElementById('reset').onclick=function(){ running=false; elapsed=0; base=0; go.textContent='Start'; go.className='go'; cancelAnimationFrame(raf); tEl.textContent='00:00.0'; };
</script>`;

  const MINESWEEPER_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:14px system-ui;margin:0;background:#0a0a0f;color:#e0e0f0;display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;box-sizing:border-box;background:#14141f;border-bottom:1px solid #2a2a3f;padding:14px 18px;font-weight:700;color:#ffd23c}
  .bar{display:flex;gap:10px;align-items:center;margin:12px;flex-wrap:wrap;justify-content:center}
  .bar button{padding:8px 14px;border:0;border-radius:8px;background:#1c1c2b;color:#e0e0f0;cursor:pointer}
  .bar button.on{background:#ffd23c;color:#2a2400;font-weight:700}
  .grid{display:grid;grid-template-columns:repeat(10,30px);gap:2px;touch-action:manipulation}
  .c{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:4px;background:#2a3350;cursor:pointer;font-weight:700;user-select:none}
  .c.rev{background:#14141f;cursor:default}
  .c.mine{background:#ff5c5c}
  .n1{color:#5cc8ff}.n2{color:#5cff7b}.n3{color:#ff8f5c}.n4{color:#ff5caa}.n5{color:#ffd23c}.n6{color:#5cdcb4}
  .status{margin:10px;min-height:20px;color:#8888aa;text-align:center;padding:0 12px}
</style>
<header>💣 Minesweeper — co-op</header>
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
      gridEl.appendChild(d); }
    statusEl.textContent = g.over ? (g.win?'🎉 Cleared! Everyone wins.':'💥 Boom! Game over — New game to retry.')
      : (g.mines?('Mines: '+MINES+' · flags: '+Object.keys(g.flags).length):'Tap any square to start. Play together in multiplayer.');
  }
  document.getElementById('mode').onclick=function(){ flagMode=!flagMode; this.textContent='🚩 Flag mode: '+(flagMode?'on':'off'); this.className=flagMode?'on':''; };
  document.getElementById('new').onclick=function(){ g=fresh(); db.put(g); render(); };
  db.subscribe(function(items){ const b=items.find(function(x){return x.id==='game';}); if(b)g=b; render(); });
  render();
</script>`;

  const CHESS_HTML = `<!doctype html><meta charset="utf-8">
<style>
  body{font:14px system-ui;margin:0;background:#0a0a0f;color:#e0e0f0;display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;box-sizing:border-box;background:#14141f;border-bottom:1px solid #2a2a3f;padding:14px 18px;font-weight:700;color:#e8c37a}
  .status{margin:10px;min-height:20px;color:#8888aa;text-align:center;padding:0 12px}
  button{padding:8px 16px;border:0;border-radius:8px;background:#e8c37a;color:#241a04;font-weight:700;cursor:pointer;margin:6px}
  .lobby{padding:16px;max-width:420px;text-align:center}
  .players{list-style:none;padding:0;margin:12px 0}
  .players li{padding:8px 12px;background:#14141f;border:1px solid #2a2a3f;border-radius:8px;margin:6px 0}
  .bracket{display:flex;gap:24px;padding:16px;overflow:auto}
  .round{display:flex;flex-direction:column;gap:12px;justify-content:center}
  .match{background:#14141f;border:1px solid #2a2a3f;border-radius:8px;padding:8px 12px;min-width:140px;cursor:pointer}
  .match.mine{border-color:#e8c37a}
  .match .w{color:#5cff7b}
  .board{display:grid;grid-template-columns:repeat(8,44px);grid-template-rows:repeat(8,44px);margin:12px;border:2px solid #2a2a3f}
  .sq{display:flex;align-items:center;justify-content:center;font-size:30px;cursor:pointer}
  .sq.l{background:#3a3550}.sq.d{background:#241f38}
  .sq.sel{outline:3px solid #e8c37a;outline-offset:-3px}
  .sq.mv{box-shadow:inset 0 0 0 4px rgba(92,255,123,.5)}
  .back{background:#1c1c2b;color:#e0e0f0}
</style>
<header>♟️ Chess Tournament</header>
<div class="status" id="status">Loading…</div>
<div id="view"></div>
<script>
  const db=gifos.db('chess');
  let me={id:'local',name:'You'}, viewMatch=null, sel=null;
  const START='rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';
  const GLYPH={p:'♟',r:'♜',n:'♞',b:'♝',q:'♛',k:'♚',P:'♙',R:'♖',N:'♘',B:'♗',Q:'♕',K:'♔'};
  const view=document.getElementById('view'), statusEl=document.getElementById('status');
  let T={ id:'t', players:[], started:false, rounds:[], round:0 };

  function save(){ return db.put(T); }
  function joinLobby(){ if(T.started) return; if(!T.players.some(function(p){return p.id===me.id;})){ T.players=T.players.concat([{id:me.id,name:me.name}]); save(); } }
  function startTournament(){
    let ps=T.players.slice(); if(ps.length<2) return;
    const matches=[]; for(let i=0;i<ps.length;i+=2){ matches.push(makeMatch(ps[i], ps[i+1]||null)); }
    T.started=true; T.rounds=[matches]; T.round=0; save();
  }
  function makeMatch(a,b){ const m={ id:'m'+Math.random().toString(36).slice(2,8), a:a, b:b, board:START, turn:'w', winner:null };
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
  function doMove(m,fx,fy,tx,ty){
    const seat=mySeat(m); if(seat!==m.turn) return;
    const bd=m.board.split(''); const p=bd[fy*8+fx]; const target=bd[ty*8+tx];
    bd[ty*8+tx]=p; bd[fy*8+fx]='.';
    if(p==='P'&&ty===0) bd[ty*8+tx]='Q'; if(p==='p'&&ty===7) bd[ty*8+tx]='q'; // auto-queen
    m.board=bd.join(''); m.turn=m.turn==='w'?'b':'w';
    if(target==='k'||target==='K'){ m.winner=seat==='w'?m.a:m.b; }
    save(); if(m.winner) advance(); sel=null; render();
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
    const jb=document.createElement('button'); jb.textContent=inList?'Waiting… ('+T.players.length+' in)':'Join lobby'; jb.onclick=joinLobby;
    const sb=document.createElement('button'); sb.textContent='Start tournament'; sb.disabled=T.players.length<2; sb.onclick=startTournament;
    d.appendChild(jb); if(T.players.length>=2) d.appendChild(sb); view.appendChild(d);
    statusEl.textContent='Lobby — '+T.players.length+' player(s). Go multiplayer and share the link to invite.';
  }
  function renderBracket(){
    const wrap=document.createElement('div'); wrap.className='bracket';
    T.rounds.forEach(function(ms,ri){ const rd=document.createElement('div'); rd.className='round';
      ms.forEach(function(m){ const el=document.createElement('div'); el.className='match'+((mySeat(m))?' mine':'');
        const an=m.a?m.a.name:'—', bn=m.b?m.b.name:'(bye)';
        el.innerHTML='<div class="'+(m.winner&&m.winner.id===(m.a&&m.a.id)?'w':'')+'">'+esc(an)+'</div><div class="'+(m.winner&&m.b&&m.winner.id===m.b.id?'w':'')+'">'+esc(bn)+'</div>';
        el.onclick=function(){ viewMatch=m.id; sel=null; render(); };
        rd.appendChild(el); });
      wrap.appendChild(rd); });
    view.appendChild(wrap);
    const champ=(T.rounds[T.rounds.length-1]||[]).length===1 && T.rounds[T.rounds.length-1][0].winner;
    statusEl.textContent=champ?('🏆 Champion: '+esc(champ.name)):'Round '+(T.round+1)+' — tap a match to play or watch.';
  }
  function renderBoard(){
    const m=findMatch(viewMatch); if(!m){ viewMatch=null; return render(); }
    const back=document.createElement('button'); back.className='back'; back.textContent='← Bracket'; back.onclick=function(){ viewMatch=null; sel=null; render(); }; view.appendChild(back);
    const seat=mySeat(m); const bd=m.board;
    const legal = sel ? moves(bd, sel[0], sel[1]) : [];
    const board=document.createElement('div'); board.className='board';
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){ const sq=document.createElement('div'); sq.className='sq '+(((x+y)%2)?'d':'l');
      const p=bd[y*8+x]; if(p!=='.') sq.textContent=GLYPH[p];
      if(sel&&sel[0]===x&&sel[1]===y) sq.classList.add('sel');
      if(legal.some(function(c){return c[0]===x&&c[1]===y;})) sq.classList.add('mv');
      sq.onclick=(function(cx,cy){ return function(){
        if(m.winner||seat!==m.turn) return;
        if(sel){ if(legal.some(function(c){return c[0]===cx&&c[1]===cy;})){ doMove(m,sel[0],sel[1],cx,cy); return; } sel=null; }
        if(mine(bd[cy*8+cx], seat)) sel=[cx,cy];
        render();
      }; })(x,y);
      board.appendChild(sq); }
    view.appendChild(board);
    statusEl.textContent = m.winner ? ('Winner: '+esc(m.winner.name))
      : (seat? (m.turn===seat?'Your move ('+(seat==='w'?'White':'Black')+')':'Waiting for opponent') : 'Spectating')
        + ' — '+esc(m.a?m.a.name:'?')+' vs '+esc(m.b?m.b.name:'?');
  }
  function findMatch(id){ for(const r of T.rounds){ for(const m of r){ if(m.id===id) return m; } } return null; }
  const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  db.subscribe(function(items){ const t=items.find(function(x){return x.id==='t';}); if(t)T=t; render(); });
  if(window.gifos) gifos.me().then(function(mm){ me={id:mm.id,name:mm.name||'You'}; render(); });
  render();
</script>`;

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
    '  * Any app can go multiplayer: your browser becomes the server and',
    '    friends join from a share link. Traffic goes peer-to-peer when the',
    '    network allows, and falls back to a relay when it does not.',
    '  * Nothing lives on our servers. Your desktop stays in this browser.',
    '    Use the GifOS menu (top-left) to back up your whole desktop as one',
    '    GIF that you keep.',
    '',
    'THIS ICON IS A DEMO TOO',
    '  This GIF has no index.html inside, so GifOS shows you its files',
    '  instead of running it — like an open folder on a web server.',
    '',
    'gifos.app — Apps are GIFs. Data is GIFs. Everything is just files.',
  ].join('\n');

  function manifest(appId, name, accent, extra) {
    return JSON.stringify(Object.assign({
      gifos: '1.0', appId, name, version: '0.2.0', entry: 'index.html', accent,
      capabilities: { db: true, multiplayer: true, network: [] },
    }, extra || {}));
  }

  function build() {
    const gif = GifOS.gif;
    const app = (name, appId, accent, html) => ({
      name: name + '.gif', appId, accent,
      files: { 'manifest.json': manifest(appId, name, accent), 'index.html': html },
    });
    const seedOf = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
    const enc = (a) => gif.encode(a.files, { accent: a.accent, seed: seedOf(a.appId) })
      .then((bytes) => ({ name: a.name, appId: a.appId, accent: a.accent, bytes }));

    const groups = [
      { name: 'Games', apps: [
        app('Tic-Tac-Toe', 'tictactoe', [92, 255, 123], TICTACTOE_HTML),
        app('Connect Four', 'connect4', [255, 180, 60], CONNECT_FOUR_HTML),
        app('Minesweeper', 'minesweeper', [255, 210, 60], MINESWEEPER_HTML),
        app('Chess Tournament', 'chess', [232, 195, 122], CHESS_HTML),
      ] },
      { name: 'Studio', apps: [
        app('Paint', 'paint', [255, 92, 170], PAINT_HTML),
      ] },
      { name: 'Tools', apps: [
        app('Notes', 'notes', [123, 92, 255], NOTES_HTML),
        app('Calculator', 'calc', [92, 200, 255], CALCULATOR_HTML),
        app('Stopwatch', 'timer', [255, 120, 120], TIMER_HTML),
      ] },
      { name: 'Social', apps: [
        app('Guestbook', 'guestbook', [255, 92, 170], GUESTBOOK_HTML),
        app('Chat', 'chat', [92, 220, 180], CHAT_HTML),
      ] },
    ];
    // A GIF with NO index.html → browsable filesystem fallback, doubling as the manual.
    const loose = [{
      name: 'Welcome.gif', appId: 'welcome', accent: [92, 200, 255],
      files: { 'manifest.json': manifest('welcome', 'Welcome', [92, 200, 255], { entry: 'nonexistent.html' }), 'README.txt': WELCOME_README },
    }];

    return Promise.all([
      Promise.all(groups.map((g) => Promise.all(g.apps.map(enc)).then((apps) => ({ name: g.name, apps })))),
      Promise.all(loose.map(enc)),
    ]).then((r) => ({ folders: r[0], loose: r[1] }));
  }

  GifOS.samples = { build };
})(typeof window !== 'undefined' ? window : globalThis);
