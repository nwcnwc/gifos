/*
 * sample-apps.js — Seed apps, packed into real App GIFs at first run so the
 * desktop isn't empty. Each is a tiny app authored against `window.gifos`.
 * Attaches to `GifOS.samples`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});

  const NOTES_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box}
  html,body{height:100%;margin:0}
  body{font:15px system-ui;background:var(--bg,#faf9ff);color:var(--text,#1a1a2e);display:flex;flex-direction:column}
  header{background:var(--accent,#7b5cff);color:var(--onaccent,#fff);padding:12px 16px;font-weight:700;display:flex;align-items:center;gap:10px;flex:none}
  header h1{font-size:16px;margin:0;flex:none}
  #q{flex:1;min-width:0;padding:7px 10px;border:0;border-radius:8px;font:inherit;background:rgba(255,255,255,.18);color:inherit}
  #q::placeholder{color:rgba(255,255,255,.7)}
  #q:focus{outline:2px solid rgba(255,255,255,.55);background:rgba(255,255,255,.28)}
  #wrap{flex:1;display:flex;min-height:0}
  #listwrap{width:320px;flex:none;display:flex;flex-direction:column;border-right:1px solid var(--border,#d5d0f0);background:var(--surface,#fff);min-width:0}
  form{display:flex;gap:8px;padding:12px 12px 8px}
  #t{flex:1;min-width:0;padding:9px 12px;border:1px solid var(--border,#d5d0f0);border-radius:8px;font:inherit;background:var(--bg,#faf9ff);color:var(--text,#1a1a2e)}
  form button{padding:9px 14px;border:0;border-radius:8px;background:var(--accent,#7b5cff);color:var(--onaccent,#fff);cursor:pointer;font:inherit;font-weight:700}
  .hint{color:var(--muted,#999);font-size:12px;padding:0 12px 8px}
  ul{list-style:none;margin:0;padding:0 10px 16px;overflow-y:auto;flex:1}
  li{display:flex;align-items:flex-start;gap:8px;padding:10px 10px;background:var(--surface,#fff);border:1px solid var(--border,#eee);border-radius:10px;margin-bottom:8px;cursor:pointer}
  li.on{border-color:var(--accent,#7b5cff);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent,#7b5cff) 25%,transparent)}
  li.done .ttl{text-decoration:line-through;color:var(--muted,#aaa)}
  li .chk{margin-top:3px;flex:none;width:16px;height:16px;accent-color:var(--accent,#7b5cff)}
  li .body{flex:1;min-width:0}
  li span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  li .ttl{font-weight:650}
  li small{color:var(--muted,#999);font-size:11px}
  li button.row-del{background:none;border:none;color:var(--muted,#999);cursor:pointer;padding:4px 6px;line-height:0;flex:none}
  li button.row-del:hover{color:#c22}
  li button svg{pointer-events:none}
  .empty{color:var(--muted,#999);padding:18px 12px;line-height:1.45}
  #pane{flex:1;display:flex;flex-direction:column;min-width:0;background:var(--bg,#faf9ff)}
  #panebar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--border,#eee);flex:none}
  #back{display:none;padding:7px 12px;border:1px solid var(--border,#d5d0f0);border-radius:8px;background:var(--surface,#fff);color:var(--text,#1a1a2e);cursor:pointer;font:inherit}
  #who{color:var(--muted,#999);font-size:12px;flex:1}
  #saved{color:var(--muted,#999);font-size:12px}
  #body{flex:1;width:100%;border:0;resize:none;padding:16px 18px;font:16px/1.5 system-ui;background:transparent;color:var(--text,#1a1a2e);outline:0}
  #body[hidden]{display:none}
  #nobody{flex:1;align-items:center;justify-content:center;color:var(--muted,#999);padding:24px;text-align:center;line-height:1.45}
  #nobody:not([hidden]){display:flex}
  #nobody[hidden]{display:none}
  @media (max-width:640px){
    #listwrap{width:100%;border-right:0}
    #pane{display:none}
    body.show #listwrap{display:none}
    body.show #pane{display:flex}
    #back{display:inline-block}
  }
</style>
<header><h1>Notes</h1><input id="q" placeholder="Search…" autocomplete="off"></header>
<div id="wrap">
  <div id="listwrap">
    <form id="f"><input id="t" placeholder="Write a note and press Add…" autocomplete="off"><button>Add</button></form>
    <div class="hint">Tap a note to open it. Tick the box to check it off. Everything is saved in this icon.</div>
    <ul id="list"></ul>
  </div>
  <div id="pane">
    <div id="panebar"><button type="button" id="back">← List</button><div id="who"></div><div id="saved"></div></div>
    <textarea id="body" placeholder="Start writing…" hidden></textarea>
    <div id="nobody">Pick a note, or add one. Invite shares the list — the file is the save.</div>
  </div>
</div>
<script>
  const db = gifos.db('notes'), list = document.getElementById('list');
  let me = { name: 'You' };
  let notes = [];
  let sel = null;
  let filter = '';
  let saveT = null;
  if (window.gifos) gifos.me().then(m => { me = { id: m.id, name: m.name || 'You' }; });
  const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const DEL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
  function titleOf(n){ const t=String(n.text||'').trim(); const line=t.split('\\n')[0]; return line || 'Untitled'; }
  function when(n){
    const t=n.u||n.t; if(!t) return '';
    const d=new Date(t); if(!isFinite(d.getTime())) return '';
    const mo=d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
    const hm=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
    return mo+' '+hm;
  }
  function ordered(items){
    return items.slice().sort(function(a,b){ return (a.t||0)-(b.t||0) || String(a.id).localeCompare(String(b.id)); });
  }
  function render(items){
    if(items) notes = ordered(items);
    const q = filter.trim().toLowerCase();
    const shown = q ? notes.filter(function(n){ return String(n.text||'').toLowerCase().indexOf(q)>=0; }) : notes;
    list.innerHTML = shown.length
      ? shown.map(function(n){
          return '<li class="'+(n.done?'done ':'')+(n.id===sel?'on':'')+'" data-id="'+esc(n.id)+'">'
            +'<input class="chk" type="checkbox"'+(n.done?' checked':'')+' data-chk="'+esc(n.id)+'" title="Check off">'
            +'<div class="body"><span class="ttl" data-t="'+esc(n.id)+'">'+esc(titleOf(n))+' <small>— '+esc(n.by||'?')+'</small></span>'
            +'<small>'+esc(when(n))+'</small></div>'
            +'<button class="row-del" data-id="'+esc(n.id)+'" title="Delete">'+DEL+'</button></li>';
        }).join('')
      : '<div class="empty">'+(notes.length?'No notes match that search.':'No notes yet. Your notes persist in this GIF icon.')+'</div>';
    paintPane();
  }
  function paintPane(){
    const n = notes.find(function(x){ return x.id===sel; });
    const body = document.getElementById('body'), nobody=document.getElementById('nobody');
    const who = document.getElementById('who'), saved=document.getElementById('saved');
    if(!n){
      document.body.classList.remove('show');
      body.hidden=true; nobody.hidden=false;
      who.textContent=''; saved.textContent='';
      return;
    }
    document.body.classList.add('show');
    nobody.hidden=true; body.hidden=false;
    if(document.activeElement!==body) body.value = n.text||'';
    who.textContent = (n.by||'You') + (when(n) ? ' · '+when(n) : '');
    saved.textContent = 'Saved in this icon';
  }
  db.subscribe(render);
  document.getElementById('f').onsubmit = async e => {
    e.preventDefault();
    const t = document.getElementById('t');
    if (t.value.trim()) {
      const rec = await db.put({ text: t.value.trim(), by: me.name, done: false, t: Date.now(), u: Date.now() });
      if(rec && rec.id) sel = rec.id;
      t.value='';
      paintPane();
      const body=document.getElementById('body'); if(!body.hidden){ body.focus(); try{ body.selectionStart=body.selectionEnd=body.value.length; }catch(err){} }
    }
  };
  list.onclick = async e => {
    const del = e.target.closest && e.target.closest('button.row-del');
    if (del && del.dataset.id) {
      const id=del.dataset.id;
      await db.delete(id);
      if(sel===id) sel=null;
      return;
    }
    const chk = e.target.closest && e.target.closest('input.chk');
    if (chk && chk.dataset.chk) {
      const n = notes.find(function(x){ return x.id===chk.dataset.chk; });
      if (n) await db.put(Object.assign({}, n, { done: !n.done, u: Date.now() }));
      return;
    }
    const row = e.target.closest && e.target.closest('li[data-id]');
    if (row) { sel = row.dataset.id; render(); const body=document.getElementById('body'); if(!body.hidden) body.focus(); }
  };
  document.getElementById('body').oninput = function(){
    const n = notes.find(function(x){ return x.id===sel; });
    if(!n) return;
    n.text = this.value;
    const span = list.querySelector('span[data-t="'+n.id+'"]');
    if(span) span.innerHTML = esc(titleOf(n))+' <small>— '+esc(n.by||'?')+'</small>';
    clearTimeout(saveT);
    saveT = setTimeout(function(){ db.put(Object.assign({}, n, { text: n.text, u: Date.now() })); }, 280);
  };
  document.getElementById('q').oninput = function(){ filter=this.value; render(); };
  document.getElementById('back').onclick = function(){ sel=null; render(); };
</script>`;

  const GUESTBOOK_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box}
  body{font:15px system-ui;margin:0;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);display:flex;flex-direction:column;min-height:100vh}
  header{background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:14px 18px;display:flex;align-items:baseline;justify-content:space-between;gap:10px}
  header .ttl{font-weight:700;color:var(--accent,#ff5caa)}
  header .who{color:var(--muted,#8888aa);font-size:12px;font-weight:500}
  .hint{color:var(--muted,#8888aa);font-size:12px;padding:8px 18px;line-height:1.45}
  .hint b{color:var(--accent,#ff5caa)}
  form{display:flex;gap:8px;padding:8px 18px 14px}
  input{flex:1;min-width:0;padding:9px 12px;border:1px solid var(--border,#2a2a3f);border-radius:8px;font:inherit;background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0)}
  button{padding:9px 14px;border:0;border-radius:8px;background:var(--accent,#ff5caa);color:var(--onaccent,#fff);cursor:pointer;font:inherit;font-weight:700}
  .stamps{display:flex;gap:6px;padding:0 18px 10px;flex-wrap:wrap}
  .stamps button{background:var(--surface,#1c1c2b);border:1px solid var(--border,#2a2a3f);font-size:17px;padding:5px 9px;border-radius:8px;cursor:pointer;color:inherit;font-weight:400}
  ul{list-style:none;margin:0;padding:0 18px 18px;flex:1}
  li{padding:10px 12px;background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:8px;margin-bottom:8px}
  li b{color:var(--accent,#ff5caa)}
  li .when{color:var(--muted,#8888aa);font-size:11px;font-weight:400;margin-left:6px}
  .empty{color:var(--muted,#8888aa);padding:28px 12px;text-align:center;line-height:1.5}
  .empty b{color:var(--accent,#ff5caa)}
</style>
<header><span class="ttl">Guestbook</span><span class="who" id="who">just you — Invite</span></header>
<div class="hint" id="hint">Press <b>Invite</b> in the top bar and share the link — everyone signs with their screen name.</div>
<form id="f">
  <input id="msg" placeholder="Say something…" autocomplete="off">
  <button>Sign</button>
</form>
<div class="stamps" id="stamps"></div>
<ul id="list"></ul>
<script>
  const db = gifos.db('entries'), pres = (window.gifos&&gifos.db)?gifos.db('presence'):null, list = document.getElementById('list');
  ['💜','✨','⭐','🌈','✍️','🐸'].forEach(function(s){
    const b=document.createElement('button'); b.type='button'; b.textContent=s;
    b.onclick=function(){ const m=document.getElementById('msg'); m.value+=s; m.focus(); };
    document.getElementById('stamps').appendChild(b);
  });
  let me = { id:'local', name: 'You' }, others=0;
  const esc = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function setWho(){
    document.getElementById('who').textContent = others>0 ? ((others+1)+' here') : 'just you — Invite';
    var h=document.getElementById('hint');
    h.innerHTML = 'Signing as <b>'+esc(me.name)+'</b>. '+(others>0
      ? 'Friends in this room sign with their screen name — new lines appear here.'
      : 'Press <b>Invite</b> in the top bar to sign with friends.');
  }
  if (window.gifos) gifos.me().then(function(m){ me = { id: m.id, name: m.name || 'You' }; setWho(); beat(); });
  function ago(t){ if(!t) return ''; var d=Date.now()-t; if(d<45000) return 'just now'; if(d<3600000) return Math.max(1,Math.floor(d/60000))+'m ago'; if(d<86400000) return Math.floor(d/3600000)+'h ago'; var dt=new Date(t); return (dt.getMonth()+1)+'/'+dt.getDate(); }
  function render(items){
    items=items||[];
    list.innerHTML = items.length
      ? items.slice().reverse().map(function(e){ return '<li><b>'+esc(e.by||'anon')+'</b><span class="when">'+esc(ago(e.t))+'</span><div>'+esc(e.msg)+'</div></li>'; }).join('')
      : '<div class="empty">No one has signed yet. You are the first.<br>Press <b>Invite</b> in the top bar and send the link.</div>';
  }
  db.subscribe(render);
  document.getElementById('f').onsubmit = async e => {
    e.preventDefault();
    const msg = document.getElementById('msg');
    if (msg.value.trim()) { await db.put({ by: me.name, uid: me.id, msg: msg.value.trim(), t: Date.now() }); msg.value=''; }
  };
  function beat(){ if(!pres||!me.id||me.id==='local') return; pres.put({id:'p:'+me.id,name:me.name,ts:Date.now()}); }
  if(pres&&pres.subscribe){
    pres.subscribe(function(rows){
      var now=Date.now(); others=0;
      (rows||[]).forEach(function(r){ if(r&&r.id&&r.id.indexOf('p:')===0&&r.id!=='p:'+me.id&&(now-(r.ts||0))<35000) others++; });
      setWho();
    });
    setInterval(function(){ if(document.visibilityState!=='hidden') beat(); },15000);
  }
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='visible') beat(); });
</script>`;

  const TICTACTOE_HTML = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{height:100%;margin:0}
  body{font:15px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);
    display:flex;flex-direction:column;align-items:center;min-height:100vh;min-height:100dvh;padding:0 0 env(safe-area-inset-bottom)}
  header{width:100%;flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;
    background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:10px 14px;color:var(--accent,#5cff7b)}
  .brand{font-weight:800;display:flex;align-items:center;gap:8px}
  .logo{width:22px;height:22px;border-radius:6px;background:#f3e6c8;box-shadow:inset 0 0 0 1.5px #3a3226;position:relative;flex:none}
  .logo:before,.logo:after{content:"";position:absolute;background:#3a3226}
  .logo:before{left:7px;top:3px;bottom:3px;width:1.5px}
  .logo:after{top:7px;left:3px;right:3px;height:1.5px}
  .chip{font-size:11px;font-weight:700;color:var(--muted,#8888aa);background:var(--bg,#0a0a0f);
    border:1px solid var(--border,#2a2a3f);border-radius:999px;padding:4px 10px;max-width:55%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  main{width:100%;max-width:440px;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;gap:10px;padding:12px 14px 16px}
  .seats{display:flex;gap:8px;width:100%}
  .seat{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 8px;min-height:52px;
    border-radius:12px;background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);color:var(--muted,#8888aa);font-weight:700;font-size:13px}
  .seat .mk{width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;
    font-size:16px;line-height:1;font-weight:800;background:#f3e6c8;color:#1a1612;box-shadow:inset 0 0 0 1px #3a3226}
  .seat.o .mk{color:#9b3044}
  .seat .nm{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .seat .nm:empty{display:none}
  .seat .you{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent,#5cff7b)}
  .seat.on{color:var(--text,#e0e0f0);border-color:var(--accent,#5cff7b);box-shadow:0 0 0 2px var(--accent,#5cff7b) inset}
  .seat.win{color:#6dce7a;border-color:#6dce7a}
  .status{min-height:22px;font-weight:700;text-align:center}
  .status.good{color:#6dce7a}.status.warn{color:#ff7a6b}
  .hint{font-size:12.5px;color:var(--muted,#8888aa);text-align:center;min-height:16px;padding:0 4px}
  .score{display:flex;gap:18px;align-items:baseline;justify-content:center;font-variant-numeric:tabular-nums}
  .score b{font-size:22px;font-weight:800}
  .score span{font-size:13px;font-weight:700;color:var(--muted,#8888aa);margin-left:5px}
  .boardwrap{position:relative;width:min(92vw,calc(100dvh - 250px),400px);min-width:240px;aspect-ratio:1;flex:none}
  .board{width:100%;height:100%;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:0;
    background:linear-gradient(180deg,rgba(255,255,255,.28),transparent 42%),#f3e6c8;border-radius:14px;
    box-shadow:0 14px 36px rgba(0,0,0,.42),inset 0 0 0 1px rgba(58,50,38,.18);padding:3.4%;touch-action:manipulation}
  .cell{position:relative;border:0;background:transparent;cursor:pointer;padding:0;appearance:none;-webkit-appearance:none;
    min-width:0;min-height:44px;font:800 clamp(40px,14vw,72px)/1 ui-sans-serif,system-ui,'Segoe UI',sans-serif;color:transparent}
  .cell:not(:nth-child(3n)){border-right:3px solid #3a3226}
  .cell:nth-child(-n+6){border-bottom:3px solid #3a3226}
  .cell:disabled{cursor:default}
  .cell:not(:disabled):active{background:rgba(58,50,38,.08)}
  .cell.x{color:#1a1612}
  .cell.o{color:#9b3044}
  .cell.last{background:rgba(232,208,148,.28)}
  .cell.win{background:rgba(196,60,60,.16)}
  .cell.x:not(.settled),.cell.o:not(.settled){animation:pop .22s ease}
  @keyframes pop{from{transform:scale(.45);opacity:0}to{transform:scale(1);opacity:1}}
  .winline{position:absolute;inset:3.4%;pointer-events:none;overflow:visible}
  .winline line{stroke:#c43c3c;stroke-width:3.4;stroke-linecap:round;fill:none;opacity:0}
  .winline.on line{opacity:1;animation:draw .45s ease both}
  @keyframes draw{from{stroke-dasharray:150;stroke-dashoffset:150}to{stroke-dasharray:150;stroke-dashoffset:0}}
  .controls{display:flex;gap:8px;width:100%}
  button.act{flex:1;min-height:44px;padding:10px 14px;border:0;border-radius:11px;cursor:pointer;
    background:var(--accent,#5cff7b);color:var(--onaccent,#0a0a0f);font:inherit;font-weight:800}
  button.act.ghost{background:var(--surface,#14141f);color:var(--text,#e0e0f0);border:1px solid var(--border,#2a2a3f)}
  button.act:disabled{opacity:.45;cursor:default}
  button.act:active{transform:translateY(1px)}
  .ask{width:100%;color:var(--muted,#8888aa);text-align:center;padding:0 4px;min-height:1px}
  .ask .row{display:flex;gap:8px;margin-top:8px}
  @media (max-width:420px){
    header{padding:8px 12px}
    main{padding:8px 10px 12px;gap:8px}
    .boardwrap{width:min(94vw,calc(100dvh - 232px),420px)}
  }
</style>
<header>
  <div class="brand"><span class="logo" aria-hidden="true"></span> Tic-Tac-Toe</div>
  <div class="chip" id="chip">Alone</div>
</header>
<main>
  <div class="seats" aria-live="polite">
    <div class="seat x" id="seatX"><span class="mk" aria-hidden="true">X</span><span class="nm" id="nameX">X</span><span class="you" id="youX" hidden>You</span></div>
    <div class="seat o" id="seatO"><span class="mk" aria-hidden="true">O</span><span class="nm" id="nameO">O</span><span class="you" id="youO" hidden>You</span></div>
  </div>
  <div class="status" id="status">Loading…</div>
  <div class="hint" id="hint"></div>
  <div class="score" id="score"><div><b id="sx">0</b><span>X</span></div><div><b id="sd">0</b><span>draws</span></div><div><b id="so">0</b><span>O</span></div></div>
  <div class="boardwrap">
    <div class="board" id="board" role="grid" aria-label="Tic-tac-toe board"></div>
    <svg class="winline" id="win" viewBox="0 0 100 100" aria-hidden="true"><line id="seg" x1="0" y1="0" x2="0" y2="0"/></svg>
  </div>
  <div class="controls"><button class="act" id="new" type="button">New game</button></div>
  <div class="ask" id="ask"></div>
</main>
<script>
  const db = gifos.db('game');
  const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const PFX = 'p:';
  const LIVE = 8000;
  const fresh = function(){ return { id:'board', cells:[null,null,null,null,null,null,null,null,null], turn:'X', starts:'X', winner:null, line:null, players:{}, names:{}, score:{X:0,O:0,D:0} }; };
  let current = fresh();
  let askLocal = false;
  let me = { id:'local', name:'You' };
  let here = {};
  if (window.gifos) gifos.me().then(function(m){ me = { id:m.id, name:m.name || 'You' }; beat(); render(); });
  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const hintEl = document.getElementById('hint');
  const chipEl = document.getElementById('chip');
  const winEl = document.getElementById('win');
  const segEl = document.getElementById('seg');
  function now(){ return Date.now ? Date.now() : 0; }
  function lineOf(c){ for (let i=0;i<WINS.length;i++){ const w=WINS[i]; if(c[w[0]] && c[w[0]]===c[w[1]] && c[w[0]]===c[w[2]]) return w; } return null; }
  function winnerOf(c){ const l=lineOf(c); if(l) return c[l[0]]; return c.every(Boolean) ? 'draw' : null; }
  function myMark(){ return current.players.X===me.id ? 'X' : current.players.O===me.id ? 'O' : null; }
  function liveIds(){ const t=now(), out=[]; for (const id in here){ if (here[id] && (t-(here[id].t||0))<LIVE) out.push(id); } return out; }
  function opponentLive(){ return liveIds().some(function(id){ return id!==me.id; }); }
  function friendName(){ const ids=liveIds(); for (let i=0;i<ids.length;i++){ if(ids[i]!==me.id) return (here[ids[i]] && here[ids[i]].name) || 'a friend'; } return ''; }
  function label(s){ return (current.names && current.names[s]) ? current.names[s] : s; }
  function boardEmpty(){ return current.cells.every(function(v){ return !v; }); }
  function canPlayTurn(){
    if (current.winner) return false;
    if (!opponentLive()) return true;
    const mm = myMark();
    if (mm) return current.turn === mm;
    return !current.players[current.turn];
  }
  function beat(){
    if (!window.gifos || me.id==='local') return;
    db.put({ id:PFX+me.id, name:me.name, t:now() }).catch(function(){});
  }
  function ensureBoard(){
    if (boardEl.children.length===9) return;
    boardEl.innerHTML = '';
    for (let i=0;i<9;i++){
      const d=document.createElement('button');
      d.type='button'; d.className='cell'; d.setAttribute('data-i', String(i));
      d.setAttribute('aria-label','empty');
      d.onclick=function(){ play(i); };
      boardEl.appendChild(d);
    }
  }
  function paintWin(){
    const line = current.line;
    if (!line){ winEl.classList.remove('on'); return; }
    const a=line[0], b=line[2];
    segEl.setAttribute('x1', String(((a%3)+0.5)/3*100));
    segEl.setAttribute('y1', String((((a/3)|0)+0.5)/3*100));
    segEl.setAttribute('x2', String(((b%3)+0.5)/3*100));
    segEl.setAttribute('y2', String((((b/3)|0)+0.5)/3*100));
    if (!winEl.classList.contains('on')) winEl.classList.add('on');
  }
  function setSeat(el, youEl, nameEl, mark, on, win){
    const claimed = current.players && current.players[mark];
    const mine = claimed === me.id;
    const named = claimed && current.names && current.names[mark];
    nameEl.textContent = named ? current.names[mark] : (opponentLive() && !claimed ? 'Open' : '');
    youEl.hidden = !mine;
    el.classList.toggle('on', !!on);
    el.classList.toggle('win', !!win);
  }
  function render(){
    ensureBoard();
    const playable = canPlayTurn();
    const live = opponentLive();
    const mm = myMark();
    current.cells.forEach(function(v,i){
      const d = boardEl.children[i];
      const win = current.line && current.line.indexOf(i)>=0;
      const last = current.last===i && !win;
      const animate = !!(v && current.last===i && !win);
      d.textContent = v || '';
      const cls = 'cell'+(v?' '+v.toLowerCase():'')+(win?' win':'')+(last?' last':'')+((v&&!animate)?' settled':'');
      if (d.className !== cls) d.className = cls;
      d.disabled = !!(current.winner || v || !playable);
      d.setAttribute('aria-label', v || 'empty');
    });
    paintWin();
    const xOn = !current.winner && current.turn==='X';
    const oOn = !current.winner && current.turn==='O';
    setSeat(document.getElementById('seatX'), document.getElementById('youX'), document.getElementById('nameX'), 'X', xOn, current.winner==='X');
    setSeat(document.getElementById('seatO'), document.getElementById('youO'), document.getElementById('nameO'), 'O', oOn, current.winner==='O');
    const sc = Object.assign({X:0,O:0,D:0}, current.score);
    document.getElementById('sx').textContent = String(sc.X);
    document.getElementById('so').textContent = String(sc.O);
    document.getElementById('sd').textContent = String(sc.D);
    statusEl.className = 'status';
    hintEl.textContent = '';
    if (current.winner==='draw'){
      statusEl.textContent = 'Draw.';
      hintEl.textContent = 'New game keeps the series and swaps who starts.';
    } else if (current.winner){
      const w = current.winner;
      const you = !!(live && mm===w);
      statusEl.textContent = you ? 'You win.' : (label(w)+' wins.');
      statusEl.className = 'status '+(you?'good':(live && mm ? 'warn':''));
    } else if (playable){
      if (live && !mm) statusEl.textContent = 'Tap a square to sit as '+current.turn+'.';
      else if (live) statusEl.textContent = 'Your move.';
      else statusEl.textContent = 'Your move — '+current.turn+'.';
    } else {
      statusEl.textContent = 'Waiting for '+(label(current.turn) || current.turn)+'.';
    }
    if (!current.winner && !live) hintEl.textContent = 'Alone: play both marks. Invite (top bar) to play a friend.';
    else if (!current.winner && live && !mm) hintEl.textContent = 'First tap on a turn claims that seat. Then you only move on your turn.';
    else if (!current.winner && live && mm) hintEl.textContent = 'You are '+mm+'.';
    chipEl.textContent = live ? ('vs '+(friendName()||'a friend')) : 'Alone';
    renderConsent();
  }
  function play(i){
    if (current.cells[i] || !canPlayTurn()) return;
    if (current.rematch) delete current.rematch;
    askLocal = false;
    const seat = current.turn;
    if (opponentLive()){
      current.players = Object.assign({}, current.players);
      current.players[seat] = current.players[seat] || me.id;
      current.names = Object.assign({}, current.names);
      if (current.players[seat]===me.id) current.names[seat] = me.name;
    }
    current.cells = current.cells.slice();
    current.cells[i] = seat;
    current.last = i;
    current.winner = winnerOf(current.cells);
    current.line = lineOf(current.cells);
    if (current.winner){
      const sc = Object.assign({X:0,O:0,D:0}, current.score);
      sc[current.winner==='draw'?'D':current.winner]++;
      current.score = sc;
    }
    current.turn = seat==='X' ? 'O' : 'X';
    db.put(current);
    render();
  }
  function startNew(){
    askLocal = false;
    const nxt = fresh();
    nxt.score = Object.assign({X:0,O:0,D:0}, current.score);
    nxt.starts = current.starts==='X' ? 'O' : 'X'; nxt.turn = nxt.starts;
    nxt.players = current.players; nxt.names = current.names;
    return db.put(nxt);
  }
  function clearRematch(){ const c = Object.assign({}, current); delete c.rematch; current = c; return db.put(c).then(render); }
  function cancelLocal(){ askLocal = false; render(); }
  function askButtons(askEl, text, onYes, onNo){
    const span = document.createElement('div'); span.textContent = text;
    const row = document.createElement('div'); row.className = 'row';
    const yes = document.createElement('button'); yes.className='act'; yes.textContent='Start new game'; yes.onclick=onYes;
    const no = document.createElement('button'); no.className='act ghost'; no.textContent='Keep playing'; no.onclick=onNo;
    row.appendChild(yes); row.appendChild(no);
    askEl.appendChild(span); askEl.appendChild(row);
  }
  function renderConsent(){
    const askEl = document.getElementById('ask'), btn = document.getElementById('new');
    askEl.textContent = '';
    const req = current.rematch;
    if (req && req.by !== me.id){
      btn.style.display = 'none';
      askButtons(askEl, (req.name ? req.name : 'Your opponent')+' wants to start a new game.', startNew, clearRematch);
    } else if (req){
      btn.textContent = 'Cancel request'; btn.style.display = ''; btn.className = 'act ghost';
      askEl.textContent = 'Waiting for the other player to accept a new game…';
    } else if (askLocal){
      btn.style.display = 'none';
      askButtons(askEl, 'Start a new game? The series score stays.', startNew, cancelLocal);
    } else {
      btn.textContent = 'New game'; btn.style.display = ''; btn.className = 'act';
    }
  }
  document.getElementById('new').onclick = function(){
    if (current.rematch && current.rematch.by===me.id) return clearRematch();
    if (opponentLive()){
      const c = Object.assign({}, current); c.rematch = { by:me.id, name:me.name }; current = c;
      return db.put(c).then(render);
    }
    if (boardEmpty()) return;
    if (current.winner) return startNew();
    askLocal = true; render();
  };
  document.addEventListener('keydown', function(e){
    const k = e.key;
    if (k>='1' && k<='9') play(parseInt(k,10)-1);
  });
  db.subscribe(function(items){
    const b = items.find(function(x){ return x.id==='board'; });
    if (b){
      current = b;
      if (!current.cells || current.cells.length!==9) current.cells = fresh().cells;
      current.score = Object.assign({X:0,O:0,D:0}, current.score||{});
      current.players = current.players || {};
      current.names = current.names || {};
    }
    const next = {};
    const t = now();
    items.forEach(function(x){
      if (x && typeof x.id==='string' && x.id.indexOf(PFX)===0 && x.t && (t-x.t)<LIVE)
        next[x.id.slice(PFX.length)] = x;
    });
    here = next;
    render();
  });
  setInterval(beat, 2000);
  beat();
  render();
</script>`;

  const CONNECT_FOUR_HTML = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{height:100%;margin:0}
  body{font:15px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);
    display:flex;flex-direction:column;align-items:center;min-height:100vh;min-height:100dvh;padding:0 0 env(safe-area-inset-bottom)}
  header{width:100%;flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;
    background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:10px 14px;color:var(--accent,#ffb43c)}
  .brand{font-weight:800;display:flex;align-items:center;gap:8px}
  .logo{width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ff8a7a,#ef453b);
    box-shadow:0 1px 3px rgba(0,0,0,.45),inset 0 -2px 6px rgba(0,0,0,.35);flex:none}
  .chip{font-size:11px;font-weight:700;color:var(--muted,#8888aa);background:var(--bg,#0a0a0f);
    border:1px solid var(--border,#2a2a3f);border-radius:999px;padding:4px 10px;max-width:55%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  main{width:100%;max-width:480px;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 12px 14px}
  .seats{display:flex;gap:8px;width:100%}
  .seat{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 10px;min-height:48px;
    border-radius:12px;background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);color:var(--muted,#8888aa);font-weight:700;font-size:13px}
  .seat .disc{width:18px;height:18px;border-radius:50%;flex:none;box-shadow:inset -2px -3px 5px rgba(0,0,0,.35),0 1px 2px rgba(0,0,0,.4)}
  .seat.r .disc{background:radial-gradient(circle at 35% 30%,#ff8a7a,#ef453b)}
  .seat.y .disc{background:radial-gradient(circle at 35% 30%,#ffe27a,#e6b800)}
  .seat .nm{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .seat .you{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent,#ffb43c)}
  .seat.r.on{color:var(--text,#e0e0f0);border-color:#ef453b;box-shadow:0 0 0 2px #ff8a7a inset}
  .seat.y.on{color:var(--text,#e0e0f0);border-color:#e6b800;box-shadow:0 0 0 2px #ffe27a inset}
  .seat.win{border-color:#6dce7a;color:#6dce7a}
  .status{min-height:22px;font-weight:700;text-align:center}
  .status.good{color:#6dce7a}.status.warn{color:#ff7a6b}
  .hint{font-size:12.5px;color:var(--muted,#8888aa);text-align:center;min-height:16px;padding:0 4px}
  .score{display:flex;gap:18px;align-items:baseline;justify-content:center;font-variant-numeric:tabular-nums}
  .score b{font-size:22px;font-weight:800}
  .score span{font-size:12px;font-weight:600;color:var(--muted,#8888aa);margin-left:5px}
  .frame{width:min(96vw,calc((100dvh - 250px)*7/7.6),440px);min-width:280px;flex:none;display:flex;flex-direction:column}
  .rail{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;padding:2px 10px 6px;min-height:40px;align-items:end}
  .peek{width:78%;aspect-ratio:1;max-height:44px;margin:0 auto;border-radius:50%;opacity:0;transform:translateY(6px);transition:opacity .12s,transform .12s;
    box-shadow:inset -2px -3px 5px rgba(0,0,0,.35),0 1px 2px rgba(0,0,0,.4)}
  .peek.on{opacity:.95;transform:none}
  .peek.r{background:radial-gradient(circle at 35% 30%,#ff8a7a,#ef453b)}
  .peek.y{background:radial-gradient(circle at 35% 30%,#ffe27a,#e6b800)}
  .cols{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;background:#1a4fa3;padding:10px;border-radius:16px;
    box-shadow:0 16px 36px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.18);touch-action:manipulation}
  .col{display:grid;grid-template-rows:repeat(6,1fr);gap:6px;border:0;padding:0;background:transparent;cursor:pointer;min-width:0;min-height:0;border-radius:10px}
  .col.locked{cursor:default}
  .col:not(.locked):hover,.col:not(.locked):focus-visible{background:rgba(255,255,255,.08)}
  .col:not(.locked):active{background:rgba(0,0,0,.12)}
  .cell{width:100%;aspect-ratio:1;border-radius:50%;background:#070b12;box-shadow:inset 0 3px 6px rgba(0,0,0,.55)}
  .cell.r,.cell.y{box-shadow:inset -2px -3px 6px rgba(0,0,0,.4),0 1px 2px rgba(0,0,0,.35)}
  .cell.r{background:radial-gradient(circle at 35% 30%,#ff8a7a,#ef453b)}
  .cell.y{background:radial-gradient(circle at 35% 30%,#ffe27a,#e6b800)}
  .cell.win{box-shadow:0 0 0 3px #ffd23c,0 0 14px rgba(255,210,60,.75),inset -2px -3px 6px rgba(0,0,0,.4)}
  .cell.last:not(.win){box-shadow:0 0 0 2px rgba(255,255,255,.55),inset -2px -3px 6px rgba(0,0,0,.4)}
  .cell.fall{animation:fall .42s cubic-bezier(.15,.75,.25,1.12) both}
  @keyframes fall{from{transform:translateY(var(--from,-280px))}to{transform:none}}
  .controls{display:flex;gap:8px;width:100%}
  button.act{flex:1;min-height:44px;padding:10px 14px;border:0;border-radius:11px;cursor:pointer;
    background:var(--accent,#ffb43c);color:var(--onaccent,#0a0a0f);font:inherit;font-weight:800}
  button.act.ghost{background:var(--surface,#14141f);color:var(--text,#e0e0f0);border:1px solid var(--border,#2a2a3f)}
  button.act:disabled{opacity:.45;cursor:default}
  button.act:active{transform:translateY(1px)}
  .ask{width:100%;color:var(--muted,#8888aa);text-align:center;padding:0 4px;min-height:1px}
  .ask .row{display:flex;gap:8px;margin-top:8px}
  @media (max-width:420px){
    header{padding:8px 12px}
    main{padding:8px 8px 12px;gap:6px}
    .frame{width:min(96vw,calc((100dvh - 232px)*7/7.6),440px)}
    .cols{padding:8px;gap:5px;border-radius:14px}
    .col{gap:5px}
    .rail{padding:0 8px;gap:5px}
  }
</style>
<header>
  <div class="brand"><span class="logo" aria-hidden="true"></span> Connect Four</div>
  <div class="chip" id="chip">Alone</div>
</header>
<main>
  <div class="seats" aria-live="polite">
    <div class="seat r" id="seatR"><i class="disc" aria-hidden="true"></i><span class="nm" id="nameR">Red</span><span class="you" id="youR" hidden>You</span></div>
    <div class="seat y" id="seatY"><i class="disc" aria-hidden="true"></i><span class="nm" id="nameY">Yellow</span><span class="you" id="youY" hidden>You</span></div>
  </div>
  <div class="status" id="status">Loading…</div>
  <div class="hint" id="hint"></div>
  <div class="score"><div><b id="sr">0</b><span>red</span></div><div><b id="sd">0</b><span>draws</span></div><div><b id="sy">0</b><span>yellow</span></div></div>
  <div class="frame" id="frame">
    <div class="rail" id="rail" aria-hidden="true"></div>
    <div class="cols" id="cols" role="grid" aria-label="Connect Four board"></div>
  </div>
  <div class="controls"><button class="act" id="new" type="button">New game</button></div>
  <div class="ask" id="ask"></div>
</main>
<script>
  const db = gifos.db('game'), W=7, H=6, PFX='p:', LIVE=8000;
  const fresh = function(){ return { id:'board', cells:new Array(W*H).fill(null), turn:'R', starts:'R', winner:null, line:null, players:{}, names:{}, score:{R:0,Y:0,D:0} }; };
  let cur = fresh(), me = { id:'local', name:'You' }, askLocal = false, here = {}, hover = -1;
  if (window.gifos) gifos.me().then(function(m){ me={id:m.id,name:m.name||'You'}; beat(); render(); });
  const colsEl = document.getElementById('cols');
  const railEl = document.getElementById('rail');
  const statusEl = document.getElementById('status');
  const hintEl = document.getElementById('hint');
  const chipEl = document.getElementById('chip');
  const cellEls = [];
  const peekEls = [];
  function now(){ return Date.now ? Date.now() : 0; }
  function liveIds(){ const t=now(), out=[]; for (const id in here){ if (here[id] && (t-(here[id].t||0))<LIVE) out.push(id); } return out; }
  function opp(){ return liveIds().some(function(id){ return id!==me.id; }); }
  function friendName(){ const ids=liveIds(); for (let i=0;i<ids.length;i++){ if(ids[i]!==me.id) return (here[ids[i]] && here[ids[i]].name) || 'a friend'; } return ''; }
  function myMark(){ return cur.players.R===me.id?'R':cur.players.Y===me.id?'Y':null; }
  function canPlay(){ if(cur.winner) return false; if(!opp()) return true; const mm=myMark(); return mm?cur.turn===mm:!cur.players[cur.turn]; }
  function label(s){ return cur.names&&cur.names[s]?cur.names[s]:(s==='R'?'Red':s==='Y'?'Yellow':s); }
  function boardEmpty(){ return cur.cells.every(function(v){ return !v; }); }
  function colFull(c){ return !!cur.cells[c]; }
  function beat(){ if(!window.gifos || me.id==='local') return; db.put({id:PFX+me.id,name:me.name,t:now()}).catch(function(){}); }
  function win(cells){
    const dirs=[[1,0],[0,1],[1,1],[1,-1]];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const c=cells[y*W+x]; if(!c) continue;
      for(let di=0;di<dirs.length;di++){
        const d=dirs[di], run=[y*W+x];
        for(let k=1;k<4;k++){ const nx=x+d[0]*k, ny=y+d[1]*k; if(nx<0||nx>=W||ny<0||ny>=H||cells[ny*W+nx]!==c) break; run.push(ny*W+nx); }
        if(run.length>=4) return {mark:c,cells:run};
      }
    }
    return cells.every(Boolean)?{mark:'draw',cells:[]}:null;
  }
  function ensure(){
    if (colsEl.children.length===W) return;
    colsEl.innerHTML=''; railEl.innerHTML=''; cellEls.length=0; peekEls.length=0;
    for(let c=0;c<W;c++){
      const peek=document.createElement('div'); peek.className='peek'; railEl.appendChild(peek); peekEls.push(peek);
      const col=document.createElement('button'); col.type='button'; col.className='col';
      col.setAttribute('aria-label','Column '+(c+1));
      col.addEventListener('click', function(){ drop(c); });
      col.addEventListener('pointerenter', function(){ setHover(c); });
      col.addEventListener('pointerleave', function(){ if(hover===c) setHover(-1); });
      for(let r=0;r<H;r++){
        const d=document.createElement('div'); d.className='cell';
        col.appendChild(d); cellEls[r*W+c]=d;
      }
      colsEl.appendChild(col);
    }
  }
  function setHover(c){ hover=c; paintPeek(); }
  function paintPeek(){
    const playable=canPlay();
    for(let c=0;c<W;c++){
      const p=peekEls[c]; if(!p) continue;
      const show = playable && hover===c && !colFull(c);
      p.className='peek'+(show?' on '+(cur.turn.toLowerCase()):'');
    }
  }
  function setSeat(el, youEl, nameEl, mark, on, isWin){
    const claimed = cur.players && cur.players[mark];
    const mine = claimed===me.id;
    nameEl.textContent = claimed ? label(mark) : (opp() ? 'Open' : (mark==='R'?'Red':'Yellow'));
    youEl.hidden = !mine;
    el.classList.toggle('on', !!on);
    el.classList.toggle('win', !!isWin);
  }
  function render(){
    ensure();
    const playable=canPlay();
    const live=opp();
    const mm=myMark();
    for(let i=0;i<W*H;i++){
      const d=cellEls[i]; const v=cur.cells[i];
      const isWin = cur.line && cur.line.indexOf(i)>=0;
      const last = cur.last===i && !isWin;
      const animate = !!(v && cur.last===i);
      const row=(i/W)|0;
      const cls='cell'+(v?' '+v.toLowerCase():'')+(isWin?' win':'')+(last?' last':'')+(animate?' fall':'');
      if (d.className !== cls) d.className = cls;
      if (animate) d.style.setProperty('--from', (-(row+1)*58)+'px');
      else d.style.removeProperty('--from');
    }
    for(let c=0;c<W;c++){
      const col=colsEl.children[c];
      const locked = !!(cur.winner || !playable || colFull(c));
      col.classList.toggle('locked', locked);
      col.setAttribute('aria-disabled', locked ? 'true' : 'false');
    }
    paintPeek();
    setSeat(document.getElementById('seatR'), document.getElementById('youR'), document.getElementById('nameR'), 'R', !cur.winner && cur.turn==='R', cur.winner==='R');
    setSeat(document.getElementById('seatY'), document.getElementById('youY'), document.getElementById('nameY'), 'Y', !cur.winner && cur.turn==='Y', cur.winner==='Y');
    const sc=Object.assign({R:0,Y:0,D:0}, cur.score);
    document.getElementById('sr').textContent=String(sc.R);
    document.getElementById('sy').textContent=String(sc.Y);
    document.getElementById('sd').textContent=String(sc.D);
    statusEl.className='status';
    hintEl.textContent='';
    if (cur.winner==='draw'){
      statusEl.textContent='Draw.';
      hintEl.textContent='New game keeps the series and swaps who starts.';
    } else if (cur.winner){
      const you = mm===cur.winner;
      statusEl.textContent=(you?'You win.':label(cur.winner)+' wins.');
      statusEl.className='status '+(you?'good':(mm?'warn':''));
    } else if (playable){
      if (live && !mm) statusEl.textContent='Tap a column to sit as '+(cur.turn==='R'?'Red':'Yellow')+'.';
      else if (live) statusEl.textContent='Your move.';
      else statusEl.textContent='Your move — '+(cur.turn==='R'?'Red':'Yellow')+'.';
    } else {
      statusEl.textContent='Waiting for '+(label(cur.turn)||cur.turn)+'.';
    }
    if (!cur.winner && !live) hintEl.textContent='Alone: play both colours. Invite (top bar) to play a friend.';
    else if (!cur.winner && live && !mm) hintEl.textContent='First drop on a turn claims that colour. Then you only move on your turn.';
    else if (!cur.winner && live && mm) hintEl.textContent='You are '+(mm==='R'?'Red':'Yellow')+'. Tap a column to drop.';
    chipEl.textContent = live ? ('vs '+(friendName()||'a friend')) : 'Alone';
    renderConsent();
  }
  function drop(col){
    if(!canPlay()) return;
    let row=-1; for(let y=H-1;y>=0;y--){ if(!cur.cells[y*W+col]){ row=y; break; } }
    if(row<0) return;
    if(cur.rematch) delete cur.rematch;
    askLocal=false;
    const seat=cur.turn;
    if(opp()){
      cur.players=Object.assign({},cur.players); cur.players[seat]=cur.players[seat]||me.id;
      cur.names=Object.assign({},cur.names); if(cur.players[seat]===me.id) cur.names[seat]=me.name;
    }
    cur.cells=cur.cells.slice(); cur.cells[row*W+col]=seat;
    cur.last=row*W+col;
    const w=win(cur.cells);
    cur.winner=w?w.mark:null; cur.line=w?w.cells:null;
    if(cur.winner){ const sc=Object.assign({R:0,Y:0,D:0},cur.score); sc[cur.winner==='draw'?'D':cur.winner]++; cur.score=sc; }
    cur.turn=seat==='R'?'Y':'R';
    db.put(cur); render();
  }
  function startNew(){
    askLocal=false;
    const nxt=fresh();
    nxt.score=Object.assign({R:0,Y:0,D:0},cur.score);
    nxt.starts=cur.starts==='R'?'Y':'R'; nxt.turn=nxt.starts;
    nxt.players=cur.players; nxt.names=cur.names;
    hover=-1;
    return db.put(nxt);
  }
  function clearRematch(){ const c=Object.assign({},cur); delete c.rematch; cur=c; return db.put(c).then(render); }
  function cancelLocal(){ askLocal=false; render(); }
  function askButtons(askEl,text,onYes,onNo){
    const span=document.createElement('div'); span.textContent=text;
    const row=document.createElement('div'); row.className='row';
    const yes=document.createElement('button'); yes.className='act'; yes.textContent='Start new game'; yes.onclick=onYes;
    const no=document.createElement('button'); no.className='act ghost'; no.textContent='Keep playing'; no.onclick=onNo;
    row.appendChild(yes); row.appendChild(no);
    askEl.appendChild(span); askEl.appendChild(row);
  }
  function renderConsent(){
    const askEl=document.getElementById('ask'), btn=document.getElementById('new');
    askEl.textContent='';
    const req=cur.rematch;
    if(req && req.by!==me.id){
      btn.style.display='none';
      askButtons(askEl,(req.name?req.name:'Your opponent')+' wants to start a new game.',startNew,clearRematch);
    } else if(req){
      btn.textContent='Cancel request'; btn.style.display=''; btn.className='act ghost';
      askEl.textContent='Waiting for the other player to accept a new game…';
    } else if(askLocal){
      btn.style.display='none';
      askButtons(askEl,'Start a new game? The series score stays.',startNew,cancelLocal);
    } else {
      btn.textContent='New game'; btn.style.display=''; btn.className='act';
    }
  }
  document.getElementById('new').onclick=function(){
    if(cur.rematch && cur.rematch.by===me.id) return clearRematch();
    if(opp()){
      const c=Object.assign({},cur); c.rematch={by:me.id,name:me.name}; cur=c;
      return db.put(c).then(render);
    }
    if(boardEmpty()) return;
    if(cur.winner) return startNew();
    askLocal=true; render();
  };
  document.addEventListener('keydown', function(e){
    const k=e.key;
    if(k>='1' && k<='7') drop(parseInt(k,10)-1);
  });
  db.subscribe(function(items){
    const b=items.find(function(x){return x.id==='board';});
    if(b){
      cur=b;
      if(!cur.cells || cur.cells.length!==W*H) cur.cells=fresh().cells;
      cur.score=Object.assign({R:0,Y:0,D:0},cur.score||{});
      cur.players=cur.players||{}; cur.names=cur.names||{};
    }
    const next={}; const t=now();
    items.forEach(function(x){
      if(x && typeof x.id==='string' && x.id.indexOf(PFX)===0 && x.t && (t-x.t)<LIVE)
        next[x.id.slice(PFX.length)]=x;
    });
    here=next; render();
  });
  setInterval(beat, 2000);
  beat();
  render();
</script>`;

  const CHAT_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box} html,body{height:100%}
  body{font:15px system-ui;margin:0;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);display:flex;flex-direction:column}
  header{background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:14px 18px;font-weight:700;color:var(--accent,#5cdcb4);display:flex;align-items:baseline;justify-content:space-between;gap:10px}
  header .who{color:var(--muted,#8888aa);font-size:12px;font-weight:500}
  .empty{color:var(--muted,#8888aa);text-align:center;padding:48px 18px;line-height:1.5;max-width:28em;margin:auto}
  .empty b{color:var(--accent,#5cdcb4)}
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
  input{flex:1;min-width:0;padding:10px 12px;border:1px solid var(--border,#2a2a3f);border-radius:8px;background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0);font:inherit}
  button{padding:10px 16px;border:0;border-radius:8px;background:var(--accent,#5cdcb4);color:var(--onaccent,#04231b);font-weight:700;cursor:pointer}
  #att{background:var(--surface,#1c1c2b);padding:10px 12px}
  #ai{background:var(--surface,#1c1c2b);padding:10px 12px}
  #ai:disabled{opacity:.6;cursor:default}
  .quick{display:flex;gap:4px;padding:0 18px 8px}
  .quick button{background:var(--surface,#1c1c2b);font-size:18px;padding:6px 10px}
</style>
<header><span>Chat</span><span class="who" id="who">just you — Invite</span></header>
<div id="log"></div>
<div class="quick" id="quick"></div>
<form id="f"><button type="button" id="att" title="Attach a photo or file">📎</button><input type="file" id="fi" hidden><input id="t" placeholder="Message…" autocomplete="off"><button type="button" id="ai" title="Draft a reply with YOUR AI — it fills the box for you to review and edit; it never sends">✨</button><button>Send</button></form>
<script>
  const db=gifos.db('messages'), fdb=gifos.db('files'), pres=(window.gifos&&gifos.db)?gifos.db('presence'):null, log=document.getElementById('log');
  // Attachments ride gifos.db. The runtime fragments oversized messages, but
  // subscribers re-download a whole collection on every change — so file
  // bytes are base64-chunked (CS chars ≈ 64KB raw each) into the separate
  // 'files' collection, fetched lazily by id and never in the hot getAll
  // fan-out, and capped at MAX bytes (the relay-fallback path is bandwidth-
  // throttled by design). Images are shrunk to fit automatically.
  const MAX=256*1024, CS=87000, MAXCHUNKS=16;
  let me={id:'local',name:'You'}, last=[], others=0;
  function setWho(){
    var el=document.getElementById('who'); if(!el) return;
    el.textContent = others>0 ? ((others+1)+' here') : 'just you — Invite';
  }
  if(window.gifos) gifos.me().then(function(m){ me={id:m.id,name:m.name||'You'}; beat(); });
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
    if(!items.length){
      log.innerHTML='<div class="empty">'+(others>0
        ? 'No messages yet. Say hi — everyone in the room will see it.'
        : 'No messages yet.<br>Press <b>Invite</b> in the top bar and send the link. Friends land in this same thread.')+'</div>';
      return;
    }
    log.innerHTML=items.map(function(m){ return '<div class="m'+(m.uid===me.id?' mine':'')+'"'+(m.state==='failed'?' data-retry="'+esc(m.id)+'"':'')+'><b>'+esc(m.by||'anon')+' <small>'+hhmm(m.t)+'</small>'+mark(m)+'</b>'+body(m)+'</div>'; }).join('');
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
        t.value=''; t.setAttribute('placeholder','Drafting with your AI…');
        const r=await gifos.ai.chat({model:model,messages:messages,maxTokens:160,temperature:0.7,hint:'Draft a chat reply',
          onDelta:function(piece){ if(piece) t.value+=piece; }});
        const text=String((r&&r.text)||t.value||'').trim().replace(/^["']+|["']+$/g,'').trim();
        t.setAttribute('placeholder',PH);
        if(text){ t.value=text; t.focus(); try{ t.setSelectionRange(t.value.length,t.value.length); }catch(_){ } }
        else { t.value=''; t.setAttribute('placeholder','The AI returned nothing — try again.'); setTimeout(function(){ t.setAttribute('placeholder',PH); },4000); }
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
  function beat(){ if(!pres||!me.id||me.id==='local') return; pres.put({id:'p:'+me.id,name:me.name,ts:Date.now()}); }
  if(pres&&pres.subscribe){
    pres.subscribe(function(rows){
      var now=Date.now(); others=0;
      (rows||[]).forEach(function(r){ if(r&&r.id&&r.id.indexOf('p:')===0&&r.id!=='p:'+me.id&&(now-(r.ts||0))<35000) others++; });
      setWho(); if(!last.length&&!pend.length) paint();
    });
    setInterval(function(){ if(document.visibilityState!=='hidden') beat(); },15000);
  }
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='visible') beat(); });
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

  const PAINT_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  *{box-sizing:border-box}
  html,body{height:100%;margin:0}
  body{font:13px system-ui;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);display:flex;flex-direction:column;overflow:hidden}
  .bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);flex:none}
  .bar h1{font-size:14px;font-weight:700;margin:0 8px 0 0;color:var(--accent2,#ff5caa);white-space:nowrap}
  .tools{display:flex;gap:4px}
  .tools button,.bar .act{width:36px;height:36px;padding:0;border:1px solid var(--border,#2a2a3f);border-radius:8px;background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0);cursor:pointer;display:flex;align-items:center;justify-content:center}
  .tools button.on{background:var(--accent2,#ff5caa);color:var(--onaccent,#fff);border-color:transparent}
  .tools button:disabled,.bar .act:disabled{opacity:.35;cursor:default}
  .bar .act.danger{color:#ff7878}
  .pal{display:flex;gap:4px;flex-wrap:wrap;align-items:center}
  .sw{width:22px;height:22px;border-radius:6px;cursor:pointer;border:2px solid transparent;flex:none}
  .sw.sel{border-color:var(--text,#e0e0f0);box-shadow:0 0 0 1px var(--bg,#0a0a0f)}
  #custom{width:28px;height:28px;border:0;padding:0;background:none;cursor:pointer}
  .sz{display:flex;align-items:center;gap:6px;flex:1;min-width:90px;max-width:220px}
  .sz input{flex:1;accent-color:var(--accent2,#ff5caa)}
  .sz span{font:11px ui-monospace,monospace;color:var(--muted,#8888aa);min-width:28px}
  #stage{flex:1;min-height:0;position:relative;background:var(--bg,#0a0a0f)}
  #cv{position:absolute;inset:0;margin:auto;touch-action:none;cursor:crosshair;background:#fff;border-radius:4px;box-shadow:0 8px 28px rgba(0,0,0,.35)}
  .hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;color:#888;font-size:15px;text-align:center;padding:24px}
  .hint.hide{display:none}
  #ask{display:none;position:absolute;inset:0;align-items:center;justify-content:center;background:rgba(0,0,0,.45);z-index:4}
  #ask.on{display:flex}
  #ask .box{background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:12px;padding:16px 18px;max-width:280px;color:var(--text,#e0e0f0)}
  #ask .box p{margin:0 0 12px}
  #ask .row{display:flex;gap:8px;justify-content:flex-end}
  #ask button{padding:8px 14px;border-radius:8px;border:1px solid var(--border,#2a2a3f);background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0);cursor:pointer;font:inherit}
  #ask #askyes{background:var(--accent2,#ff5caa);color:var(--onaccent,#fff);border-color:transparent}
</style>
<div class="bar">
  <h1>Paint</h1>
  <div class="tools" id="tools">
    <button id="tbrush" class="on" title="Brush (B)" aria-label="Brush"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 19l8.5-8.5 3 3L8 22H5v-3z"/><path d="M14 7l3 3 3.5-3.5a2.1 2.1 0 0 0 0-3L19 2a2.1 2.1 0 0 0-3 0L14 7z"/></svg></button>
    <button id="terase" title="Eraser (E)" aria-label="Eraser"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 17l8-8 7 7-4 4H8z"/><path d="M14 9l-7 7"/></svg></button>
    <button id="tfill" title="Fill (G)" aria-label="Fill"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13l7-8 7 8H4z"/><path d="M6 13v2a4 4 0 0 0 4 4"/><path d="M16 19c1.2 0 2.5 1 2.5 2.4 0 1.6-2.5 2.6-2.5 2.6"/></svg></button>
    <button id="tpick" title="Eyedropper (I)" aria-label="Eyedropper"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 7l5 5"/><path d="M4 20l7-7 3 3-7 7H4v-3z"/><path d="M16 3l5 5-4 4-5-5z"/></svg></button>
  </div>
  <div class="pal" id="pal"></div>
  <input id="custom" type="color" value="#ff5c5c" title="Custom colour">
  <div class="sz"><input id="sz" type="range" min="1" max="64" value="8" title="Brush size"><span id="szv">8</span></div>
  <button class="act" id="undo" title="Undo (Ctrl+Z)" aria-label="Undo" disabled><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 8H5V4"/><path d="M5 8a9 9 0 1 1 2.2 5.7"/></svg></button>
  <button class="act" id="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 8h4V4"/><path d="M19 8a9 9 0 1 0-2.2 5.7"/></svg></button>
  <button class="act danger" id="clear" title="Clear">Clear</button>
</div>
<div id="stage">
  <canvas id="cv" width="1024" height="1024"></canvas>
  <div class="hint" id="hint">Draw on the page. Undo is in the bar. The picture lives in this icon — Invite to draw together.</div>
  <div id="ask"><div class="box"><p>Clear the picture? This cannot be undone.</p><div class="row"><button id="askno">Keep</button><button id="askyes">Clear</button></div></div></div>
</div>
<script>
'use strict';
var db=gifos.db('canvas');
var PAPER=1024, COLORS=['#14141f','#ff5c5c','#ff8f3c','#ffd23c','#5cff7b','#5cdcb4','#5cc8ff','#7b5cff','#ff5caa','#a06a4a','#8888aa','#ffffff'];
var cv=document.getElementById('cv'), ctx=cv.getContext('2d');
var tool='brush', color=COLORS[1], size=8, painting=false;
var cells=null;            // legacy 16x16 colour indices, still drawn as the base layer
var strokes=[];            // {k:'s'|'e'|'f', c, w, p:[x,y,...]}  paper-space
var undoStack=[], redoStack=[];
var lastPut='', pending=false, lastPt=null, live=null;
var beforeTool='brush';
function paperPt(e){
  var r=cv.getBoundingClientRect();
  return {x:(e.clientX-r.left)/r.width*PAPER, y:(e.clientY-r.top)/r.height*PAPER};
}
function layout(){
  var st=document.getElementById('stage'), pad=12;
  var W=st.clientWidth-pad*2, H=st.clientHeight-pad*2, s=Math.max(80, Math.min(W,H));
  cv.style.width=s+'px'; cv.style.height=s+'px';
}
function drawStroke(op, preview){
  if(op.k==='f'){ flood(op.p[0]|0, op.p[1]|0, op.c); return; }
  ctx.save();
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.lineWidth=op.w||1;
  if(op.k==='e'){ ctx.globalCompositeOperation='destination-out'; ctx.strokeStyle='#000'; }
  else { ctx.globalCompositeOperation='source-over'; ctx.strokeStyle=op.c; }
  var p=op.p, i;
  ctx.beginPath();
  if(p.length<4){ ctx.arc(p[0], p[1], (op.w||1)/2, 0, 7); ctx.fillStyle=ctx.strokeStyle; ctx.fill(); }
  else {
    ctx.moveTo(p[0], p[1]);
    for(i=2;i<p.length;i+=2) ctx.lineTo(p[i], p[i+1]);
    ctx.stroke();
  }
  ctx.restore();
}
function drawCells(){
  if(!cells||!cells.length) return;
  if(!cells.some(function(v){return v;})) return;
  var n=Math.round(Math.sqrt(cells.length))||16, s=PAPER/n, i, x, y;
  for(i=0;i<n*n && i<cells.length;i++){
    x=i%n; y=(i/n)|0;
    ctx.fillStyle=COLORS[cells[i]||0]||COLORS[0];
    ctx.fillRect(x*s, y*s, s+0.5, s+0.5);
  }
}
function replay(){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.globalCompositeOperation='source-over';
  ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,PAPER,PAPER);
  drawCells();
  var i; for(i=0;i<strokes.length;i++) drawStroke(strokes[i]);
  if(live) drawStroke(live, true);
  document.getElementById('hint').className='hint'+(strokes.length|| (cells && cells.some(function(v){return v;})) ?' hide':'');
  syncBtns();
  syncDebug();
}
function hexOf(r,g,b){
  return '#'+[r,g,b].map(function(v){ var s=v.toString(16); return s.length<2?'0'+s:s; }).join('');
}
function flood(sx,sy,hex){
  var img=ctx.getImageData(0,0,PAPER,PAPER), d=img.data;
  var w=PAPER, h=PAPER, x0=Math.max(0,Math.min(w-1,sx|0)), y0=Math.max(0,Math.min(h-1,sy|0));
  var i0=(y0*w+x0)*4, tr=d[i0], tg=d[i0+1], tb=d[i0+2], ta=d[i0+3];
  var m=hex.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if(!m) return;
  var nr=parseInt(m[1],16), ng=parseInt(m[2],16), nb=parseInt(m[3],16);
  if(tr===nr && tg===ng && tb===nb && ta===255) return;
  var seen=new Uint8Array(w*h), stack=[x0,y0], si=2, x, y, i, p;
  while(si){
    y=stack[--si]; x=stack[--si];
    p=y*w+x; if(seen[p]) continue; seen[p]=1;
    i=p*4; if(d[i]!==tr||d[i+1]!==tg||d[i+2]!==tb||d[i+3]!==ta) continue;
    d[i]=nr; d[i+1]=ng; d[i+2]=nb; d[i+3]=255;
    if(x>0){ stack[si++]=x-1; stack[si++]=y; }
    if(x<w-1){ stack[si++]=x+1; stack[si++]=y; }
    if(y>0){ stack[si++]=x; stack[si++]=y-1; }
    if(y<h-1){ stack[si++]=x; stack[si++]=y+1; }
  }
  ctx.putImageData(img,0,0);
}
function pickAt(x,y){
  var p=ctx.getImageData(Math.max(0,x|0), Math.max(0,y|0), 1, 1).data;
  return hexOf(p[0], p[1], p[2]);
}
function setColor(c){
  color=c; document.getElementById('custom').value=c;
  var sw=document.getElementById('pal').querySelectorAll('.sw');
  [].forEach.call(sw, function(el){ el.className='sw'+(el.dataset.c.toLowerCase()===c.toLowerCase()?' sel':''); });
}
function setTool(t){
  tool=t;
  ['brush','erase','fill','pick'].forEach(function(name){
    document.getElementById('t'+name).className=name===t?'on':'';
  });
  cv.style.cursor=t==='pick'?'copy':t==='fill'?'cell':'crosshair';
}
function snap(){ return {cells:cells?cells.slice():null, strokes:strokes.map(function(s){ return {k:s.k,c:s.c,w:s.w,p:s.p.slice()}; })}; }
function applySnap(s){ cells=s.cells; strokes=s.strokes; replay(); }
function pushUndo(){ undoStack.push(snap()); if(undoStack.length>40) undoStack.shift(); redoStack=[]; syncBtns(); }
function syncBtns(){
  document.getElementById('undo').disabled=!undoStack.length;
  document.getElementById('redo').disabled=!redoStack.length;
}
function docOf(){ return {id:'board', v:2, cells:cells, strokes:strokes}; }
function save(){
  var doc=docOf(), j=JSON.stringify(doc);
  if(j===lastPut) return;
  lastPut=j; db.put(doc);
}
function saveSoon(){ if(pending) return; pending=true; setTimeout(function(){ pending=false; save(); }, 80); }
function loadDoc(b){
  if(!b) return;
  var j=JSON.stringify(b);
  if(j===lastPut) return;
  lastPut=j;
  if(b.v===2 || (b.strokes && b.strokes.length) || (b.cells && b.cells.length && !b.v)){
    cells=Array.isArray(b.cells)?b.cells:null;
    strokes=Array.isArray(b.strokes)?b.strokes:[];
  } else if(Array.isArray(b.cells)){ cells=b.cells; strokes=[]; }
  undoStack=[]; redoStack=[];
  replay();
}
db.subscribe(function(items){
  if(painting) return;
  var b=items.find(function(x){ return x.id==='board'; });
  if(b) loadDoc(b);
});
// palette
COLORS.forEach(function(c,i){
  var s=document.createElement('button'); s.type='button'; s.className='sw'+(i===1?' sel':''); s.style.background=c; s.dataset.c=c;
  s.title=i===0?'Dark':''; s.setAttribute('aria-label','Colour '+c);
  s.onclick=function(){ setColor(c); if(tool==='erase') setTool('brush'); };
  document.getElementById('pal').appendChild(s);
});
document.getElementById('custom').oninput=function(){ setColor(this.value); if(tool==='erase') setTool('brush'); };
document.getElementById('sz').oninput=function(){ size=+this.value; document.getElementById('szv').textContent=String(size); };
document.getElementById('tbrush').onclick=function(){ setTool('brush'); };
document.getElementById('terase').onclick=function(){ setTool('erase'); };
document.getElementById('tfill').onclick=function(){ setTool('fill'); };
document.getElementById('tpick').onclick=function(){ beforeTool=tool==='pick'?beforeTool:'brush'; setTool('pick'); };
document.getElementById('undo').onclick=function(){
  if(!undoStack.length) return;
  redoStack.push(snap()); applySnap(undoStack.pop()); save();
};
document.getElementById('redo').onclick=function(){
  if(!redoStack.length) return;
  undoStack.push(snap()); applySnap(redoStack.pop()); save();
};
document.getElementById('clear').onclick=function(){ document.getElementById('ask').className='on'; };
document.getElementById('askno').onclick=function(){ document.getElementById('ask').className=''; };
document.getElementById('askyes').onclick=function(){
  document.getElementById('ask').className='';
  pushUndo(); cells=null; strokes=[]; live=null; replay(); save();
};
cv.addEventListener('pointerdown', function(e){
  if(e.button!=null && e.button!==0) return;
  e.preventDefault(); cv.setPointerCapture(e.pointerId);
  var pt=paperPt(e);
  if(tool==='pick'){ setColor(pickAt(pt.x, pt.y)); setTool(beforeTool||'brush'); return; }
  if(tool==='fill'){ pushUndo(); strokes.push({k:'f', c:color, w:0, p:[pt.x, pt.y]}); live=null; replay(); save(); return; }
  painting=true; live={k:tool==='erase'?'e':'s', c:color, w:size, p:[pt.x, pt.y]}; lastPt=pt; replay();
});
cv.addEventListener('pointermove', function(e){
  if(!painting||!live) return;
  var pt=paperPt(e);
  live.p.push(pt.x, pt.y); lastPt=pt;
  drawStroke({k:live.k,c:live.c,w:live.w,p:[live.p[live.p.length-4]||pt.x, live.p[live.p.length-3]||pt.y, pt.x, pt.y]});
});
function endStroke(){
  if(!painting) return;
  painting=false;
  if(live && live.p.length>=2){ pushUndo(); strokes.push(live); saveSoon(); }
  live=null; lastPt=null; replay();
}
cv.addEventListener('pointerup', endStroke);
cv.addEventListener('pointercancel', endStroke);
window.addEventListener('keydown', function(e){
  var k=(e.key||'').toLowerCase();
  if((e.ctrlKey||e.metaKey) && k==='z'){ e.preventDefault(); if(e.shiftKey) document.getElementById('redo').click(); else document.getElementById('undo').click(); return; }
  if((e.ctrlKey||e.metaKey) && k==='y'){ e.preventDefault(); document.getElementById('redo').click(); return; }
  if(e.target && (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')) return;
  if(k==='b') setTool('brush');
  else if(k==='e') setTool('erase');
  else if(k==='g') setTool('fill');
  else if(k==='i') setTool('pick');
  else if(k==='['){ var el=document.getElementById('sz'); el.value=String(Math.max(1,(+el.value)-2)); el.dispatchEvent(new Event('input')); }
  else if(k===']'){ var el2=document.getElementById('sz'); el2.value=String(Math.min(64,(+el2.value)+2)); el2.dispatchEvent(new Event('input')); }
});
window.addEventListener('resize', layout);
layout();
replay();
function syncDebug(){
  window.__paint={ tool:tool, color:color, size:size, n:strokes.length, cells:cells?cells.length:0, canUndo:!!undoStack.length, canRedo:!!redoStack.length };
}
syncDebug();
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
  header{background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:8px 14px;font-weight:700;color:var(--accent,#5cc8ff);flex:none;display:flex;align-items:center;gap:12px}
  header #tabs{margin-left:auto;font-weight:700}
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
  .row-del{flex:none;background:none;border:0;color:var(--muted,#8888aa);cursor:pointer;padding:4px 6px;margin-top:2px;line-height:0}
  .row-del:hover{color:#ff7878}
  .row-del svg{pointer-events:none}
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
  #gbtns{position:absolute;right:10px;top:10px;display:flex;flex-direction:column;gap:6px;z-index:2}
  #gbtns button{width:34px;height:34px;border-radius:8px;border:1px solid var(--border,#2a2a3f);background:var(--surface,#14141f);color:var(--text,#e0e0f0);font-size:17px;cursor:pointer;opacity:.9}
  #ov{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1}
  #readout{position:absolute;left:10px;bottom:10px;background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:8px;padding:6px 10px;font:12px ui-monospace,Menlo,monospace;pointer-events:none;display:none;max-width:72%;z-index:2;line-height:1.45;color:var(--text,#e0e0f0)}
  #readout.on{display:block}
  #tabs{display:none;gap:0;flex:none}
  #tabs button{flex:1;padding:8px;border:0;border-bottom:2px solid transparent;background:none;color:var(--muted,#8888aa);font:inherit;font-weight:700;cursor:pointer}
  #tabs button.on{color:var(--accent,#5cc8ff);border-bottom-color:var(--accent,#5cc8ff)}
  @media (max-width:640px){
    #tabs{display:flex}
    #wrap{flex-direction:column}
    #side{width:100%;height:auto;flex:1;border-right:0;border-top:1px solid var(--border,#2a2a3f)}
    body.mode-graph #side{display:none}
    body.mode-list #gwrap{display:none}
    body.mode-graph #wrap,body.mode-list #wrap{flex-direction:column}
  }
</style>
<header>Calculator <div id="tabs"><button type="button" id="tabG" class="on">Graph</button><button type="button" id="tabL">List</button></div></header>
<div id="wrap">
  <div id="side">
    <div id="rows"></div>
    <button id="addrow">+ expression</button>
    <div id="keypad"></div>
  </div>
  <div id="gwrap">
    <canvas id="g"></canvas>
    <canvas id="ov"></canvas>
    <div id="readout"></div>
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
var ov=document.getElementById('ov'),octx=ov.getContext('2d');
var readout=document.getElementById('readout');
var view={cx:0,cy:0,ppu:40};  // pixels per unit; equal aspect
var W=0,H=0,DPR=1,traceX=null;
function resize(){
  DPR=window.devicePixelRatio||1;
  W=cv.clientWidth;H=cv.clientHeight;
  cv.width=Math.max(1,Math.round(W*DPR));cv.height=Math.max(1,Math.round(H*DPR));
  ov.width=cv.width;ov.height=cv.height;
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
  ctx.fillStyle=axis;ctx.font='12px system-ui';
  ctx.fillText('x', W-14, Math.min(Math.max(sy(0)-6,12),H-6));
  ctx.fillText('y', Math.min(Math.max(sx(0)+6,4),W-12), 14);
  var polar=false,pi;
  for(pi=0;pi<plots.length;pi++) if(plots[pi]&&plots[pi].kind==='polar'&&!plots[pi].hidden) polar=true;
  if(polar){
    ctx.strokeStyle=grid;ctx.globalAlpha=0.45;ctx.lineWidth=1;
    var rmax=Math.max(Math.abs(x0),Math.abs(x1),Math.abs(y0),Math.abs(y1)),rr,k,ang;
    for(rr=step;rr<=rmax+step;rr+=step){ctx.beginPath();ctx.arc(sx(0),sy(0),rr*view.ppu,0,7);ctx.stroke();}
    for(k=0;k<12;k++){ang=k*Math.PI/6;ctx.beginPath();ctx.moveTo(sx(0),sy(0));ctx.lineTo(sx(rmax*Math.cos(ang)),sy(rmax*Math.sin(ang)));ctx.stroke();}
    ctx.globalAlpha=1;
  }
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
  drawTrace();
}
function drawTrace(){
  if(!octx)return;
  octx.setTransform(DPR,0,0,DPR,0,0);
  octx.clearRect(0,0,W,H);
  if(traceX==null||!isFinite(traceX)){readout.className='';readout.textContent='';return;}
  var x=traceX, px=sx(x), env=envNow(), lines=['x = '+fmtVal(Math.round(x*1e6)/1e6)], i;
  octx.strokeStyle=theme('--text','#e0e0f0');octx.globalAlpha=0.4;octx.lineWidth=1;
  octx.beginPath();octx.moveTo(px,0);octx.lineTo(px,H);octx.stroke();octx.globalAlpha=1;
  for(i=0;i<plots.length;i++){
    var P=plots[i];if(!P||P.hidden||P.kind!=='explicit')continue;
    env.vars[P.pv||'x']=x;
    var y=ev(P.node,env);
    delete env.vars[P.pv||'x'];
    if(!isFinite(y)||Math.abs(y)>1e9)continue;
    octx.fillStyle=P.color;octx.beginPath();octx.arc(px,sy(y),5,0,7);octx.fill();
    octx.strokeStyle=theme('--bg','#0a0a0f');octx.lineWidth=1.5;octx.stroke();
    lines.push('<span style="color:'+P.color+'">'+escTrace(P.src||'y')+'</span> = '+fmtVal(y));
  }
  readout.className='on';readout.innerHTML=lines.join('<br>');
  if(window.__calc) window.__calc.traceX=traceX;
}
function escTrace(s){
  return String(s).replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';}).slice(0,36);
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
    inp.onkeydown=function(e){
      if(e.key!=='Enter')return;
      e.preventDefault();
      var idx=rows.indexOf(r);
      rows.splice(idx+1,0,newRow(''));save();rebuild();
      var nx=rowsEl.querySelector('[data-rid="'+rows[idx+1].id+'"] .ex');if(nx)nx.focus();
    };
    mid.appendChild(inp);
    var meta=document.createElement('div');
    mid.appendChild(meta);
    var del=document.createElement('button');del.className='row-del';del.title='Delete row';
    del.innerHTML='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
    del.onclick=function(){rows=rows.filter(function(q){return q!==r;});save();rebuild();};
    el.appendChild(sw);el.appendChild(mid);el.appendChild(del);
    rowsEl.appendChild(el);
    r._meta=meta;r._sw=sw;
    renderMeta(r,cls,color);
    if(cls.kind!=='err'&&cls.kind!=='value'&&cls.kind!=='slider'&&cls.kind!=='def'){
      plots.push({kind:cls.kind,node:cls.node,pv:cls.pv,op:cls.op,color:color,hidden:r.hidden,src:r.s});
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
      plots.push({kind:cls.kind,node:cls.node,pv:cls.pv,op:cls.op,color:color,hidden:r.hidden,src:r.s});
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
  ['sin','sin('],['cos','cos('],['tan','tan('],['ln','ln('],['log','log('],['|a|','abs('],['e','e']];
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
  if(window.matchMedia && matchMedia('(max-width:640px)').matches) setMode('list');
};
function setMode(m){
  document.body.className=m==='list'?'mode-list':'mode-graph';
  document.getElementById('tabG').className=m==='graph'?'on':'';
  document.getElementById('tabL').className=m==='list'?'on':'';
  if(m==='graph') resize();
}
document.getElementById('tabG').onclick=function(){setMode('graph');};
document.getElementById('tabL').onclick=function(){setMode('list');};
if(window.matchMedia && matchMedia('(max-width:640px)').matches) setMode('graph');
// ---------- pan / zoom / trace ----------
var drag=null,pins={},moved=0,downPt=null;
function traceAt(clientX, clientY){
  var r=cv.getBoundingClientRect();
  traceX=ux(clientX-r.left);drawTrace();
}
cv.addEventListener('pointerdown',function(e){
  cv.setPointerCapture(e.pointerId);
  pins[e.pointerId]={x:e.clientX,y:e.clientY};
  moved=0;downPt={x:e.clientX,y:e.clientY};
  var ks=Object.keys(pins);
  if(ks.length===1)drag={x:e.clientX,y:e.clientY};
  else drag=null;
});
cv.addEventListener('pointermove',function(e){
  if(!(e.pointerId in pins)){
    if(e.pointerType==='mouse' && !(e.buttons&1)){traceAt(e.clientX,e.clientY);cv.style.cursor='crosshair';}
    return;
  }
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
  moved+=Math.hypot(e.clientX-drag.x,e.clientY-drag.y);
  if(moved>7){traceX=null;drawTrace();}
  view.cx-=(e.clientX-drag.x)/view.ppu;
  view.cy+=(e.clientY-drag.y)/view.ppu;
  drag={x:e.clientX,y:e.clientY};
  draw();savePrefsSoon();
});
function lift(e){
  var was=moved;
  delete pins[e.pointerId];drag=null;var ks=Object.keys(pins);if(ks.length===1){var q=pins[ks[0]];drag={x:q.x,y:q.y};}
  if(was<=7 && downPt){traceAt(e.clientX,e.clientY);}
  downPt=null;moved=0;
}
cv.addEventListener('pointerup',lift);cv.addEventListener('pointercancel',lift);
cv.addEventListener('pointerleave',function(e){ if(e.pointerType==='mouse' && !Object.keys(pins).length){ traceX=null; drawTrace(); cv.style.cursor='grab'; } });
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
    traceX:traceX,
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
  *{box-sizing:border-box}
  body{font:16px system-ui;margin:0;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);display:flex;flex-direction:column;align-items:center;min-height:100vh}
  header{width:100%;box-sizing:border-box;background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:14px 18px;font-weight:700;color:var(--accent,#ff7878)}
  .tabs{display:flex;gap:8px;margin:16px 0 0}
  .tabs button{padding:8px 18px;border:1px solid var(--border,#1c1c2b);border-radius:999px;background:var(--surface,#1c1c2b);color:var(--muted,#8888aa);font:inherit;font-weight:700;cursor:pointer}
  .tabs button.on{background:var(--accent,#ff7878);color:var(--onaccent,#2a0a0a);border-color:transparent}
  #t{font-size:clamp(40px,14vw,64px);font-variant-numeric:tabular-nums;margin:28px 0 4px;letter-spacing:1px;font-weight:700}
  #t.done{color:var(--accent,#ff7878);animation:blink .5s step-end infinite}
  @keyframes blink{50%{opacity:.25}}
  #lapnow{color:var(--muted,#8888aa);font-variant-numeric:tabular-nums;font-size:14px;min-height:1.2em;margin-bottom:4px}
  .row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin:10px 0;align-items:center}
  button{padding:14px 22px;min-width:96px;min-height:44px;border:1px solid var(--border,#1c1c2b);border-radius:999px;font-size:16px;font-weight:700;cursor:pointer;background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0)}
  button:disabled{opacity:.38;cursor:default}
  button.go{background:var(--accent2,#5cff7b);color:var(--onaccent,#04231b);border-color:transparent}
  button.stop{background:var(--accent,#ff7878);color:var(--onaccent,#2a0a0a);border-color:transparent}
  .chips button{padding:8px 14px;font-size:14px;min-width:0;min-height:36px}
  #laps{list-style:none;margin:8px 0 24px;padding:0 18px;width:100%;max-width:360px;flex:1;overflow-y:auto}
  #laps li{display:flex;justify-content:space-between;gap:12px;padding:8px 4px;border-bottom:1px solid var(--border,#1c1c2b);font-variant-numeric:tabular-nums;font-size:15px}
  #laps li .n{color:var(--muted,#8888aa)}
  #laps li.fast{color:#2a9f5a}
  #laps li.slow{color:#ff5c5c}
  #laps li.cur{color:var(--muted,#8888aa)}
</style>
<header>Timer &amp; Stopwatch</header>
<div class="tabs"><button id="tabS" class="on">Stopwatch</button><button id="tabT">Timer</button></div>
<div id="t">00:00.00</div>
<div id="lapnow"></div>
<div class="chips row" id="presets" style="display:none">
  <button data-add="60">+1 min</button><button data-add="300">+5 min</button><button data-add="600">+10 min</button><button data-add="10">+10 s</button>
</div>
<div class="row">
  <button id="lap" disabled>Lap</button>
  <button id="go" class="go">Start</button>
</div>
<ol id="laps"></ol>
<script>
  function pad2(n){ n=Math.floor(Math.abs(+n||0)); return (n<10?'0':'')+n; }
  function fmtSw(ms){
    ms=Math.max(0, Math.floor(+ms||0));
    var cs=Math.floor(ms/10)%100, s=Math.floor(ms/1000)%60, m=Math.floor(ms/60000)%60, h=Math.floor(ms/3600000);
    return (h?h+':':'')+pad2(m)+':'+pad2(s)+'.'+pad2(cs);
  }
  function fmtT(ms){
    var s=Math.max(0, Math.ceil((+ms||0)/1000));
    var h=Math.floor(s/3600); s=s%3600; var m=Math.floor(s/60); s=s%60;
    return (h?h+':':'')+m+':'+pad2(s);
  }
  var mode='sw', raf=0, ready=false;
  var sw={running:false, elapsed:0, base:0, laps:[]};
  var tm={running:false, left:0, target:0};
  var tEl=document.getElementById('t'), go=document.getElementById('go'), lapBtn=document.getElementById('lap');
  var lapNow=document.getElementById('lapnow'), lapsEl=document.getElementById('laps');
  var clockDb=(window.gifos&&gifos.db)?gifos.db('clock'):null, saveT=null;
  function now(){ return Date.now(); }
  function swMs(){ return sw.elapsed+(sw.running?now()-sw.base:0); }
  function tmMs(){ return tm.running?tm.target-now():tm.left; }
  function persist(){
    if(!clockDb||!ready) return;
    if(saveT) return;
    saveT=setTimeout(function(){ saveT=null;
      clockDb.put({id:'clock', mode:mode,
        sw:{running:sw.running,elapsed:sw.elapsed,base:sw.base,laps:sw.laps.slice()},
        tm:{running:tm.running,left:tm.left,target:tm.target}});
    }, 80);
  }
  function beep(f,ms){ try{ const C=window.AudioContext||window.webkitAudioContext; if(!C)return; window.__ac=window.__ac||new C();
    const o=__ac.createOscillator(), g=__ac.createGain(); o.frequency.value=f; g.gain.value=.15; o.connect(g); g.connect(__ac.destination);
    o.start(); setTimeout(function(){o.stop();},ms); }catch(e){} }
  function ring(){ beep(880,250); setTimeout(function(){beep(880,250);},350); setTimeout(function(){beep(660,600);},750); }
  function sumLaps(){ var s=0; for(var i=0;i<sw.laps.length;i++) s+=sw.laps[i]; return s; }
  function paintLaps(){
    if(mode!=='sw'){ lapsEl.innerHTML=''; lapNow.textContent=''; return; }
    var total=swMs(), split=Math.max(0,total-sumLaps());
    lapNow.textContent = (sw.laps.length||sw.running||total) ? ('Lap '+(sw.laps.length+1)+'  '+fmtSw(split)) : '';
    var n=sw.laps.length, fast=-1, slow=-1;
    if(n>=2){ fast=0; slow=0; for(var i=1;i<n;i++){ if(sw.laps[i]<sw.laps[fast]) fast=i; if(sw.laps[i]>sw.laps[slow]) slow=i; } }
    var html='';
    if(sw.running||split>0) html+='<li class="cur"><span class="n">Lap '+(n+1)+'</span><span>'+fmtSw(split)+'</span></li>';
    for(var i=n-1;i>=0;i--){
      var cls=(n>=2&&i===fast)?'fast':(n>=2&&i===slow)?'slow':'';
      html+='<li class="'+cls+'"><span class="n">Lap '+(i+1)+'</span><span>'+fmtSw(sw.laps[i])+'</span></li>';
    }
    lapsEl.innerHTML=html;
  }
  function buttons(){
    if(mode==='sw'){
      var has=swMs()>0||sw.laps.length;
      lapBtn.textContent=sw.running?'Lap':'Reset';
      lapBtn.disabled=sw.running?false:!has;
      go.disabled=false;
      go.textContent=sw.running?'Stop':'Start';
      go.className=sw.running?'stop':'go';
    } else {
      lapBtn.textContent='Reset';
      lapBtn.disabled=!(tm.running||tm.left>0);
      go.textContent=tm.running?'Pause':'Start';
      go.className=tm.running?'stop':'go';
      go.disabled=!tm.running&&tm.left<=0;
    }
  }
  function draw(){
    if(mode==='sw') tEl.textContent=fmtSw(swMs());
    else {
      var rem=tmMs();
      tEl.textContent=fmtT(rem);
      if(tm.running&&rem<=0){ tm.running=false; tm.left=0; tEl.classList.add('done'); ring(); persist(); }
    }
    paintLaps(); buttons();
  }
  function loop(){ draw(); if(sw.running||tm.running) raf=requestAnimationFrame(loop); else cancelAnimationFrame(raf); }
  function kick(){ cancelAnimationFrame(raf); loop(); persist(); }
  go.onclick=function(){
    tEl.classList.remove('done');
    if(mode==='sw'){
      if(sw.running){ sw.elapsed+=now()-sw.base; sw.running=false; }
      else { sw.base=now(); sw.running=true; }
    } else {
      if(tm.running){ tm.left=Math.max(0,tm.target-now()); tm.running=false; }
      else { if(tm.left<=0) return; tm.target=now()+tm.left; tm.running=true; }
    }
    kick();
  };
  lapBtn.onclick=function(){
    if(mode==='sw'){
      if(sw.running){ var split=swMs()-sumLaps(); if(split>=0) sw.laps.push(split); persist(); paintLaps(); }
      else { sw.running=false; sw.elapsed=0; sw.base=0; sw.laps=[]; tEl.classList.remove('done'); kick(); }
    } else {
      tm.running=false; tm.left=0; tEl.classList.remove('done'); kick();
    }
  };
  document.getElementById('presets').onclick=function(e){
    var a=e.target.dataset.add; if(!a||tm.running) return;
    tm.left+=a*1000; tEl.classList.remove('done'); kick();
  };
  function setMode(m){
    mode=m;
    document.getElementById('tabS').className=m==='sw'?'on':'';
    document.getElementById('tabT').className=m==='t'?'on':'';
    document.getElementById('presets').style.display=m==='t'?'flex':'none';
    lapsEl.style.display=m==='sw'?'':'none';
    lapNow.style.display=m==='sw'?'':'none';
    if(m!=='t') tEl.classList.remove('done');
    kick();
  }
  document.getElementById('tabS').onclick=function(){ setMode('sw'); };
  document.getElementById('tabT').onclick=function(){ setMode('t'); };
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='visible') kick(); });
  function boot(s){
    if(s){
      mode=s.mode==='t'?'t':'sw';
      if(s.sw){ sw.running=!!s.sw.running; sw.elapsed=+s.sw.elapsed||0; sw.base=+s.sw.base||0; sw.laps=Array.isArray(s.sw.laps)?s.sw.laps.map(Number).filter(function(x){return x>=0;}):[]; }
      if(s.tm){ tm.running=!!s.tm.running; tm.left=+s.tm.left||0; tm.target=+s.tm.target||0; }
      if(tm.running&&tm.target-now()<=0){ tm.running=false; tm.left=0; tEl.classList.add('done'); }
    }
    ready=true; setMode(mode);
  }
  if(clockDb) clockDb.get('clock').then(boot, function(){ boot(null); });
  else boot(null);
</script>`;

  const MINESWEEPER_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
  *{box-sizing:border-box;-webkit-user-select:none;user-select:none}
  html,body{margin:0;min-height:100%;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);font:14px system-ui}
  body{display:flex;flex-direction:column;align-items:center}
  header{width:100%;padding:12px 16px;font-weight:700;color:var(--accent,#ffd23c);background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f)}
  .hud{display:flex;align-items:center;justify-content:center;gap:14px;margin:12px 10px 8px;padding:8px 12px;background:#2b2b2b;border:3px solid;border-color:#111 #6a6a6a #6a6a6a #111;border-radius:4px}
  .lcd{font:700 22px/1 ui-monospace,Menlo,monospace;color:#ff3b30;background:#1a0909;padding:6px 10px;min-width:4.2em;text-align:center;border-radius:3px;letter-spacing:1px;font-variant-numeric:tabular-nums}
  .face{width:42px;height:42px;font-size:26px;line-height:1;border:3px solid;border-color:#eee #555 #555 #eee;background:#c0c0c0;border-radius:4px;cursor:pointer;padding:0}
  .face:active{border-color:#555 #eee #eee #555}
  .dens{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:4px 10px}
  .dens button,.bar button{padding:7px 12px;border:1px solid var(--border,#2a2a3f);border-radius:8px;background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0);cursor:pointer;font:inherit}
  .dens button.on,.bar button.on{background:var(--accent,#ffd23c);color:var(--onaccent,#2a2400);font-weight:700;border-color:transparent}
  .bar{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin:8px}
  .boardwrap{max-width:100%;overflow:auto;-webkit-overflow-scrolling:touch;padding:0 8px 8px}
  .grid{display:grid;gap:0;margin:8px auto;background:#808080;border:3px solid;border-color:#fff #808080 #808080 #fff;touch-action:manipulation}
  .c{width:var(--cell,32px);height:var(--cell,32px);display:flex;align-items:center;justify-content:center;font-weight:800;cursor:pointer;font-size:calc(var(--cell,32px)*0.55);line-height:1;background:#c0c0c0;border:2px solid;border-color:#fff #808080 #808080 #fff;color:#111}
  .c.rev{border:1px solid #8e8e8e;background:#b0b0b0;cursor:default;box-shadow:inset 1px 1px 0 #909090}
  .c.mine{background:#d0d0d0}.c.blast{background:#e33}
  .c.wrong{color:#c00;background:#bdbdbd}
  .c.flash{background:#e8e8a8}
  .n1{color:#0000ee}.n2{color:#008200}.n3{color:#ee0000}.n4{color:#000084}.n5{color:#840000}.n6{color:#008284}.n7{color:#000}.n8{color:#848484}
  .status{margin:4px 12px 10px;min-height:18px;color:var(--muted,#8888aa);text-align:center;padding:0 10px}
  .ask{margin:0 12px 12px;text-align:center;color:var(--muted,#8888aa)}
  .ask button{margin:6px 4px 0;padding:7px 14px;border:0;border-radius:8px;background:var(--accent,#ffd23c);color:var(--onaccent,#2a2400);font-weight:700;cursor:pointer}
  .ask .no{background:var(--surface,#14141f);color:var(--text,#e0e0f0);border:1px solid var(--border,#2a2a3f)}
  .best{color:var(--muted,#8888aa);font-size:12px;margin:0 0 12px}
</style>
<header>Minesweeper</header>
<div class="hud">
  <div class="lcd" id="mines">015</div>
  <button class="face" id="face" title="New game">🙂</button>
  <div class="lcd" id="time">0:00</div>
</div>
<div class="dens" id="dens"></div>
<div class="boardwrap"><div class="grid" id="grid"></div></div>
<div class="bar">
  <button id="mode">🚩 Flag mode: off</button>
</div>
<div class="status" id="status">Loading…</div>
<div class="ask" id="ask"></div>
<div class="best" id="best"></div>
<script>
  const db=gifos.db('mine');
  const DENS={
    easy:{id:'easy',w:9,h:9,n:10,label:'Easy'},
    medium:{id:'medium',w:10,h:10,n:15,label:'Medium'},
    hard:{id:'hard',w:16,h:16,n:40,label:'Hard'},
    expert:{id:'expert',w:30,h:16,n:99,label:'Expert'}
  };
  let dens='medium', flagMode=false, me={id:'local',name:'You'};
  let ask=null, skipClick=false, hold=null, faceHold=false;
  if(window.gifos) gifos.me().then(function(m){ me={id:m.id,name:m.name||'You'}; });
  function spec(id){ return DENS[id]||DENS.medium; }
  function fresh(id){ const s=spec(id||dens); return { id:'game', dens:s.id, w:s.w, h:s.h, n:s.n, mines:null, rev:new Array(s.w*s.h).fill(false), flags:{}, over:false, win:false, t0:null, elapsed:0, hit:null }; }
  function adopt(b){
    if(!b) return fresh();
    if(!b.w||!b.h){ b.w=10; b.h=10; b.n=Array.isArray(b.mines)?b.mines.length:15; b.dens=b.dens||'medium'; }
    if(!b.rev||b.rev.length!==b.w*b.h) b.rev=new Array(b.w*b.h).fill(false);
    if(!b.flags) b.flags={};
    dens = DENS[b.dens] ? b.dens : (b.w===9?'easy':b.w===16&&b.h===16?'hard':b.w>=24?'expert':'medium');
    return b;
  }
  let g=fresh(), stats={id:'stats', games:0, wins:0, best:{}};
  const gridEl=document.getElementById('grid'), statusEl=document.getElementById('status');
  function WH(){ return {w:g.w||10,h:g.h||10,n:g.n||15}; }
  function nbrs(i){ const s=WH(),x=i%s.w,y=(i/s.w)|0,out=[]; for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue; const nx=x+dx,ny=y+dy; if(nx>=0&&nx<s.w&&ny>=0&&ny<s.h)out.push(ny*s.w+nx); } return out; }
  function count(i){ if(!g.mines)return 0; let n=0; nbrs(i).forEach(function(j){ if(g.mines.indexOf(j)>=0)n++; }); return n; }
  function genMines(safe){
    const s=WH(); let ex=[safe].concat(nbrs(safe));
    if(s.w*s.h-ex.length<s.n) ex=[safe];
    const m=[], seen={}; ex.forEach(function(x){ seen[x]=1; });
    while(m.length<s.n){ const r=Math.floor(Math.random()*s.w*s.h); if(!seen[r]){ seen[r]=1; m.push(r); } }
    return m;
  }
  function inPlay(){ return !!(g.mines && !g.over); }
  function elapsed(){ if(g.over) return g.elapsed||0; if(!g.t0) return 0; return Date.now()-g.t0; }
  function fmt(ms){ const s=Math.min(9999,Math.floor(ms/1000)); return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2); }
  function pad3(n){ n=String(Math.abs(n|0)); return ('000'+n).slice(-3); }
  function lcdMines(){ const s=WH(); const left=s.n-Object.keys(g.flags).length; return (left<0?'-':'')+pad3(left); }
  function save(){ g.at=Date.now(); db.put(g); }
  function flood(i){
    const st=[i];
    while(st.length){ const c=st.pop(); if(g.rev[c]||g.flags[c]) continue; g.rev[c]=true;
      if(g.mines.indexOf(c)<0 && count(c)===0) nbrs(c).forEach(function(j){ if(!g.rev[j]&&!g.flags[j]) st.push(j); }); }
  }
  function finish(win, hit){
    const el=g.t0?Date.now()-g.t0:(g.elapsed||0);
    g.over=true; g.win=!!win; g.hit=hit==null?null:hit; g.elapsed=el; g.t0=g.t0||Date.now();
    if(win){ const s=WH(); for(let i=0;i<s.w*s.h;i++){ if(g.mines.indexOf(i)>=0) g.flags[i]=g.flags[i]||me.name; } }
    stats.games=(stats.games||0)+1; if(win){ stats.wins=(stats.wins||0)+1; const sec=Math.max(1,Math.round(g.elapsed/1000)); const prev=stats.best&&stats.best[g.dens]; if(!prev||sec<prev){ stats.best=Object.assign({},stats.best||{},{}); stats.best[g.dens]=sec; } }
    db.put(stats); save(); render();
  }
  function reveal(i){
    const s=WH(); if(g.over||g.rev[i]||g.flags[i]) return;
    if(!g.mines){ g.mines=genMines(i); g.t0=Date.now(); }
    if(g.mines.indexOf(i)>=0){ g.rev[i]=true; finish(false,i); return; }
    flood(i);
    const opened=g.rev.filter(Boolean).length;
    if(opened===s.w*s.h-s.n){ finish(true,null); return; }
    save(); render();
  }
  function flag(i){ if(g.over||g.rev[i]) return; g.flags=Object.assign({},g.flags); if(g.flags[i]) delete g.flags[i]; else g.flags[i]=me.name; save(); render(); }
  function chord(i){
    if(g.over||!g.rev[i]) return;
    const n=count(i); if(!n) return;
    const ns=nbrs(i); let f=0; ns.forEach(function(j){ if(g.flags[j]) f++; });
    if(f!==n){ pulse(ns); return; }
    let hit=null;
    ns.forEach(function(j){
      if(g.flags[j]||g.rev[j]) return;
      if(!g.mines) return;
      if(g.mines.indexOf(j)>=0){ g.rev[j]=true; hit=j; }
      else flood(j);
    });
    if(hit!=null){ finish(false,hit); return; }
    const s=WH(); if(g.rev.filter(Boolean).length===s.w*s.h-s.n){ finish(true,null); return; }
    save(); render();
  }
  function pulse(ns){
    ns.forEach(function(j){ const el=gridEl.children[j]; if(el&&!g.rev[j]&&!g.flags[j]) el.classList.add('flash'); });
    setTimeout(function(){ ns.forEach(function(j){ const el=gridEl.children[j]; if(el) el.classList.remove('flash'); }); }, 140);
  }
  function cellPx(){
    const s=WH();
    const wrap=Math.max(160, Math.min(document.documentElement.clientWidth-16, 920));
    const min=s.w>=24?20:22;
    return Math.max(min, Math.min(34, Math.floor(wrap/s.w)));
  }
  function faceGlyph(){ return g.over?(g.win?'😎':'😵'):(faceHold?'😮':'🙂'); }
  function render(){
    const s=WH();
    const px=cellPx();
    gridEl.style.setProperty('--cell', px+'px');
    gridEl.style.gridTemplateColumns='repeat('+s.w+', var(--cell))';
    gridEl.innerHTML='';
    for(let i=0;i<s.w*s.h;i++){
      const d=document.createElement('div'); d.className='c'; d.dataset.i=i;
      const flagged=!!g.flags[i];
      if(g.over && g.mines){
        const isMine=g.mines.indexOf(i)>=0;
        if(isMine && !flagged){ d.classList.add('rev','mine'); d.textContent='💣'; if(g.hit===i) d.classList.add('blast'); }
        else if(!isMine && flagged){ d.classList.add('rev','wrong'); d.textContent='✕'; }
        else if(flagged){ d.textContent='🚩'; }
        else if(g.rev[i]){ d.classList.add('rev'); const n=count(i); if(n){ d.textContent=n; d.classList.add('n'+n); } }
      } else if(g.rev[i]){
        d.classList.add('rev'); const n=count(i); if(n){ d.textContent=n; d.classList.add('n'+n); }
      } else if(flagged){ d.textContent='🚩'; if(g.flags[i]&&g.flags[i]!==me.name) d.title=g.flags[i]; }
      gridEl.appendChild(d);
    }
    document.getElementById('mines').textContent=lcdMines();
    document.getElementById('time').textContent=fmt(elapsed());
    document.getElementById('face').textContent=faceGlyph();
    const densEl=document.getElementById('dens'); densEl.innerHTML='';
    ['easy','medium','hard','expert'].forEach(function(id){
      const b=document.createElement('button'); b.textContent=DENS[id].label; if(dens===id) b.className='on';
      b.onclick=function(){ requestDens(id); }; densEl.appendChild(b);
    });
    statusEl.textContent = g.over ? (g.win?'Cleared in '+fmt(g.elapsed)+'. Everyone wins.':'💥 Boom — the face starts a new board.')
      : (g.mines? (flagMode?'Flag mode on — tap a square to plant or pull a flag.':'Tap to open · long-press / right-click to flag · tap a number to chord.')
                : 'Tap any square. The first tap is safe. Invite a friend to share this board.');
    const bestEl=document.getElementById('best');
    const bt=stats.best&&stats.best[dens];
    bestEl.textContent = (stats.games?('Boards: '+(stats.wins||0)+'/'+stats.games+' cleared. '):'')+(bt?('Best '+spec(dens).label+': '+fmt(bt*1000)+'.'):'');
    renderAsk();
    hook();
  }
  function hook(){
    window.__mine={
      state:function(){ return { dens:g.dens, w:g.w, h:g.h, n:g.n, over:g.over, win:g.win, mines:g.mines&&g.mines.slice(), rev:g.rev.filter(Boolean).length, flags:Object.keys(g.flags).length, t0:g.t0, hit:g.hit }; },
      reveal:reveal, flag:flag, chord:chord, fresh:function(id){ dens=id||dens; g=fresh(dens); save(); render(); },
      load:function(doc){ g=adopt(doc); dens=g.dens||dens; save(); render(); }
    };
  }
  function onCell(i, which){
    if(which==='flag') return flag(i);
    if(g.rev[i]) return chord(i);
    if(flagMode) return flag(i);
    reveal(i);
  }
  gridEl.addEventListener('click', function(e){
    const c=e.target.closest('.c'); if(!c) return;
    if(skipClick){ skipClick=false; return; }
    onCell(+c.dataset.i, 'open');
  });
  gridEl.addEventListener('contextmenu', function(e){
    const c=e.target.closest('.c'); if(!c) return; e.preventDefault(); onCell(+c.dataset.i, 'flag');
  });
  gridEl.addEventListener('pointerdown', function(e){
    const c=e.target.closest('.c'); if(!c) return;
    faceHold=true; document.getElementById('face').textContent=faceGlyph();
    const i=+c.dataset.i; const x0=e.clientX, y0=e.clientY;
    hold=setTimeout(function(){ hold=null; skipClick=true; faceHold=false; flag(i); }, 380);
    const move=function(ev){ if(Math.hypot(ev.clientX-x0, ev.clientY-y0)>12){ clearTimeout(hold); hold=null; } };
    const up=function(){ if(hold){ clearTimeout(hold); hold=null; } faceHold=false; document.getElementById('face').textContent=faceGlyph();
      gridEl.removeEventListener('pointermove', move); gridEl.removeEventListener('pointerup', up); gridEl.removeEventListener('pointercancel', up); };
    gridEl.addEventListener('pointermove', move); gridEl.addEventListener('pointerup', up); gridEl.addEventListener('pointercancel', up);
  });
  function requestNew(){ if(!inPlay()){ doNew(dens); return; } ask={kind:'new'}; renderAsk(); }
  function requestDens(id){ if(id===dens && !g.over && !g.mines) return; if(!inPlay()){ doNew(id); return; } ask={kind:'dens', id:id}; renderAsk(); }
  function doNew(id){ ask=null; dens=id||dens; g=fresh(dens); save(); render(); }
  function renderAsk(){
    const el=document.getElementById('ask'); el.textContent='';
    if(!ask) return;
    const span=document.createElement('span'); span.textContent=ask.kind==='dens'?('Start a new '+spec(ask.id).label+' board? '):'Start a new game? ';
    const yes=document.createElement('button'); yes.textContent='New game'; yes.onclick=function(){ doNew(ask.kind==='dens'?ask.id:dens); };
    const no=document.createElement('button'); no.className='no'; no.textContent='Keep playing'; no.onclick=function(){ ask=null; renderAsk(); };
    el.appendChild(span); el.appendChild(yes); el.appendChild(no);
  }
  document.getElementById('face').onclick=function(){ requestNew(); };
  document.getElementById('mode').onclick=function(){ flagMode=!flagMode; this.textContent='🚩 Flag mode: '+(flagMode?'on':'off'); this.className=flagMode?'on':''; };
  db.subscribe(function(items){
    const b=items.find(function(x){ return x.id==='game'; });
    const st=items.find(function(x){ return x.id==='stats'; });
    if(st) stats=st;
    if(b){ if(b.at&&g.at&&b.at<g.at) return; g=adopt(b); }
    render();
  });
  setInterval(function(){ if(!g.over && g.t0) document.getElementById('time').textContent=fmt(elapsed()); }, 250);
  window.addEventListener('resize', function(){ const px=cellPx(); gridEl.style.setProperty('--cell', px+'px'); });
  render();
</script>`;

  const CHESS_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;min-height:100%;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);font:14px system-ui}
  body{display:flex;flex-direction:column;align-items:center}
  header{width:100%;padding:12px 16px;font-weight:700;color:var(--accent,#e8c37a);background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f)}
  .status{margin:8px 12px;min-height:20px;color:var(--muted,#8888aa);text-align:center}
  button{padding:8px 16px;border:0;border-radius:8px;background:var(--accent,#e8c37a);color:var(--onaccent,#241a04);font-weight:700;cursor:pointer;margin:6px}
  button.ghost{background:var(--surface,#1c1c2b);color:var(--accent,#e8c37a);border:1px solid var(--accent,#e8c37a)}
  button.back{background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0);border:1px solid var(--border,#2a2a3f)}
  button:disabled{opacity:.55;cursor:default}
  .lobby{padding:12px 16px;max-width:440px;text-align:center}
  .players{list-style:none;padding:0;margin:10px 0}
  .players li{padding:8px 12px;background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:8px;margin:6px 0;text-align:left}
  .settings{background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:10px;padding:10px 14px;margin:12px 0;text-align:left}
  .settings h3{margin:0 0 2px;font-size:14px;color:var(--accent,#e8c37a)}
  .settings .hint{color:var(--muted,#8888aa);font-size:12px;margin-bottom:8px}
  .settings label{display:flex;align-items:center;gap:8px;margin:8px 0;font-size:14px;flex-wrap:wrap}
  .settings select{padding:6px 8px;border-radius:8px;background:var(--bg,#1c1c2b);color:var(--text,#e0e0f0);border:1px solid var(--border,#2a2a3f);font:inherit}
  .split{display:flex;align-items:center;gap:10px;margin:18px 0 10px;color:var(--muted,#8888aa);font-size:12px}
  .split:before,.split:after{content:'';flex:1;border-top:1px solid var(--border,#2a2a3f)}
  .playcpu{font-size:16px;padding:12px 22px}
  .bracket{display:flex;gap:20px;padding:12px;overflow:auto;max-width:100%}
  .round{display:flex;flex-direction:column;gap:12px;justify-content:center}
  .match{background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:8px;padding:8px 12px;min-width:150px;cursor:pointer}
  .match.mine{border-color:var(--accent,#e8c37a)}
  .match .w{color:var(--accent,#5cff7b)}
  .clock{display:flex;justify-content:center;font-variant-numeric:tabular-nums;font-weight:700;padding:4px 10px;margin:2px auto;border-radius:8px;background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);width:fit-content}
  .clock.live{border-color:var(--accent,#e8c37a);color:var(--accent,#e8c37a)}
  .clock.low{color:#ff7878}
  .board{display:grid;grid-template-columns:repeat(8,var(--sq,44px));grid-template-rows:repeat(8,var(--sq,44px));margin:8px auto;border:3px solid #241a04;border-radius:4px;position:relative;touch-action:manipulation}
  .sq{display:flex;align-items:center;justify-content:center;font-size:calc(var(--sq,44px)*0.72);cursor:pointer;line-height:1;position:relative}
  .sq.l{background:#ecd9b5}.sq.d{background:#b08150}
  .sq.pw{color:#fffdf2;text-shadow:0 0 2px #241a04,0 1px 2px rgba(0,0,0,.55)}
  .sq.pb{color:#241a2e;text-shadow:0 0 2px rgba(255,255,255,.35)}
  .sq.sel{outline:3px solid var(--accent,#7b5cff);outline-offset:-3px;z-index:1}
  .sq.last{box-shadow:inset 0 0 0 100px rgba(255,210,80,.32)}
  .sq.check{box-shadow:inset 0 0 0 100px rgba(220,40,40,.38)}
  .sq.mv::after{content:'';width:28%;height:28%;border-radius:50%;background:rgba(20,40,20,.32);position:absolute}
  .sq.cap::after{width:78%;height:78%;background:transparent;border:3px solid rgba(20,40,20,.38)}
  .sq.hintf{box-shadow:inset 0 0 0 4px rgba(120,90,255,.85)}
  .sq.hintt{box-shadow:inset 0 0 0 4px rgba(120,90,255,.85),inset 0 0 22px rgba(120,90,255,.55)}
  .hintbar{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;margin:2px 8px}
  .hintbar .why{color:var(--muted,#8888aa);font-size:12.5px;max-width:340px;text-align:center}
  .promo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#1c1c2b;border:2px solid var(--accent,#e8c37a);border-radius:10px;padding:8px;display:flex;gap:6px;z-index:5}
  .promo button{font-size:28px;margin:0;padding:6px 10px}
  .actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:6px}
  .files{display:flex;justify-content:center;gap:2px;color:var(--muted,#8888aa);font-size:11px;letter-spacing:6px;margin:0 0 4px}
</style>
<header>Chess Tournament</header>
<div class="status" id="status">Loading…</div>
<div id="view"></div>
<script>
  const db=gifos.db('chess');
  let me={id:'local',name:'You'}, viewMatch=null, sel=null, promo=null;
  let hint=null, hinting=false, cpuBusy=false;
  const START='rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';
  const GLYPH={p:'♟',r:'♜',n:'♞',b:'♝',q:'♛',k:'♚'};
  const view=document.getElementById('view'), statusEl=document.getElementById('status');
  let T={ id:'t', players:[], started:false, rounds:[], round:0, settings:{ clock:'5+0', shuffle:true, cpu:'medium', side:'w' } };
  const CLOCKS=[['none','No clock'],['1+0','Bullet 1 min'],['3+0','Blitz 3 min'],['3+2','Blitz 3|2'],['5+0','Blitz 5 min'],['5+3','Blitz 5|3'],['10+0','Rapid 10 min']];
  const CPUS=[['easy','Easy'],['medium','Medium'],['hard','Hard']];
  function clockSpec(){ const c=(T.settings&&T.settings.clock)||'none'; if(c==='none') return null;
    const p=c.split('+'); return { base:parseInt(p[0],10)*60000, inc:(parseInt(p[1],10)||0)*1000 }; }

  // ---- rules (castling, en passant, promotion, check, mate, stalemate) ----
  const KN=[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
  const KD=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const RK=[[1,0],[-1,0],[0,1],[0,-1]];
  const BI=[[1,1],[1,-1],[-1,1],[-1,-1]];
  function at(bd,x,y){ return (x<0||x>7||y<0||y>7)?null:bd[y*8+x]; }
  function isW(p){ return p&&p>='A'&&p<='Z'; }
  function white(p){ return p&&p!=='.'&&isW(p); }
  function black(p){ return p&&p!=='.'&&!isW(p); }
  function inferCastle(bd){ return { K:bd[60]==='K'&&bd[63]==='R', Q:bd[60]==='K'&&bd[56]==='R', k:bd[4]==='k'&&bd[7]==='r', q:bd[4]==='k'&&bd[0]==='r' }; }
  function castleOf(m){
    const c=m.castle;
    if(c&&typeof c==='object'&&!Array.isArray(c)) return {K:!!c.K,Q:!!c.Q,k:!!c.k,q:!!c.q};
    if(typeof c==='string') return {K:c.indexOf('K')>=0,Q:c.indexOf('Q')>=0,k:c.indexOf('k')>=0,q:c.indexOf('q')>=0};
    return inferCastle(m.board||START);
  }
  function gameOf(m){ return { board:m.board||START, turn:m.turn||'w', castle:castleOf(m), ep:m.ep||null, half:m.half||0, full:m.full||1 }; }
  function clone(s){ return { board:s.board, turn:s.turn, castle:{K:s.castle.K,Q:s.castle.Q,k:s.castle.k,q:s.castle.q}, ep:s.ep?s.ep.slice():null, half:s.half, full:s.full }; }
  function attacked(bd,tx,ty,byW){
    const pd=byW?1:-1;
    for(let k=0;k<2;k++){ const p=at(bd,tx+[-1,1][k],ty+pd); if(p&&p===(byW?'P':'p')) return true; }
    for(let i=0;i<8;i++){ const p=at(bd,tx+KN[i][0],ty+KN[i][1]); if(p&&p===(byW?'N':'n')) return true; }
    for(let i=0;i<8;i++){ const p=at(bd,tx+KD[i][0],ty+KD[i][1]); if(p&&p===(byW?'K':'k')) return true; }
    for(let i=0;i<4;i++){ let nx=tx+RK[i][0],ny=ty+RK[i][1]; for(;;){ const p=at(bd,nx,ny); if(p===null)break; if(p!=='.'){ if(byW?(p==='R'||p==='Q'):(p==='r'||p==='q')) return true; break; } nx+=RK[i][0]; ny+=RK[i][1]; } }
    for(let i=0;i<4;i++){ let nx=tx+BI[i][0],ny=ty+BI[i][1]; for(;;){ const p=at(bd,nx,ny); if(p===null)break; if(p!=='.'){ if(byW?(p==='B'||p==='Q'):(p==='b'||p==='q')) return true; break; } nx+=BI[i][0]; ny+=BI[i][1]; } }
    return false;
  }
  function kingPos(bd,w){ const i=bd.indexOf(w?'K':'k'); return i<0?null:[i%8,(i/8)|0]; }
  function inCheck(s,w){ const kp=kingPos(s.board,w); return kp?attacked(s.board,kp[0],kp[1],!w):false; }
  function pseudo(s){
    const bd=s.board, wh=s.turn==='w', out=[];
    const foe=wh?black:white;
    function add(fx,fy,tx,ty,ex){ const m={from:[fx,fy],to:[tx,ty]}; if(ex){ for(const k in ex) m[k]=ex[k]; } out.push(m); }
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const p=bd[y*8+x]; if(p==='.'||(wh?black(p):white(p))) continue;
      const t=p.toLowerCase();
      if(t==='p'){
        const dir=wh?-1:1, start=wh?6:1, pr=wh?0:7;
        if(at(bd,x,y+dir)==='.'){
          if(y+dir===pr){ ['q','r','b','n'].forEach(function(q){ add(x,y,x,y+dir,{promo:q}); }); }
          else add(x,y,x,y+dir);
          if(y===start&&at(bd,x,y+2*dir)==='.') add(x,y,x,y+2*dir,{dbl:true});
        }
        for(let k=0;k<2;k++){
          const dx=[-1,1][k], tx=x+dx, ty=y+dir, q=at(bd,tx,ty);
          if(q&&q!=='.'&&foe(q)){
            if(ty===pr) ['q','r','b','n'].forEach(function(r){ add(x,y,tx,ty,{promo:r}); });
            else add(x,y,tx,ty);
          } else if(s.ep&&s.ep[0]===tx&&s.ep[1]===ty) add(x,y,tx,ty,{ep:true});
        }
      } else if(t==='n'){ for(let i=0;i<8;i++){ const q=at(bd,x+KN[i][0],y+KN[i][1]); if(q!==null&&(q==='.'||foe(q))) add(x,y,x+KN[i][0],y+KN[i][1]); } }
      else if(t==='k'){
        for(let i=0;i<8;i++){ const q=at(bd,x+KD[i][0],y+KD[i][1]); if(q!==null&&(q==='.'||foe(q))) add(x,y,x+KD[i][0],y+KD[i][1]); }
        const rank=wh?7:0;
        if(y===rank&&x===4&&!attacked(bd,4,rank,!wh)){
          const cK=wh?s.castle.K:s.castle.k, cQ=wh?s.castle.Q:s.castle.q;
          if(cK&&at(bd,5,rank)==='.'&&at(bd,6,rank)==='.'&&bd[rank*8+7]===(wh?'R':'r')&&!attacked(bd,5,rank,!wh)&&!attacked(bd,6,rank,!wh)) add(4,rank,6,rank,{castle:'K'});
          if(cQ&&at(bd,3,rank)==='.'&&at(bd,2,rank)==='.'&&at(bd,1,rank)==='.'&&bd[rank*8+0]===(wh?'R':'r')&&!attacked(bd,3,rank,!wh)&&!attacked(bd,2,rank,!wh)) add(4,rank,2,rank,{castle:'Q'});
        }
      } else {
        const rays=t==='r'?RK:t==='b'?BI:RK.concat(BI);
        for(let i=0;i<rays.length;i++){ let nx=x+rays[i][0], ny=y+rays[i][1]; for(;;){ const q=at(bd,nx,ny); if(q===null)break; if(q==='.') add(x,y,nx,ny); else { if(foe(q)) add(x,y,nx,ny); break; } nx+=rays[i][0]; ny+=rays[i][1]; } }
      }
    }
    return out;
  }
  function make(s,mv){
    const n=clone(s), a=n.board.split(''), wh=s.turn==='w';
    const fx=mv.from[0], fy=mv.from[1], tx=mv.to[0], ty=mv.to[1];
    let p=a[fy*8+fx]; const cap=a[ty*8+tx];
    a[fy*8+fx]='.';
    if(mv.ep) a[fy*8+tx]='.';
    if(mv.promo) p=wh?mv.promo.toUpperCase():mv.promo;
    a[ty*8+tx]=p;
    if(mv.castle){ const rank=wh?7:0; if(mv.castle==='K'){ a[rank*8+5]=a[rank*8+7]; a[rank*8+7]='.'; } else { a[rank*8+3]=a[rank*8+0]; a[rank*8+0]='.'; } }
    n.board=a.join('');
    if(p==='K'){ n.castle.K=n.castle.Q=false; } if(p==='k'){ n.castle.k=n.castle.q=false; }
    function touch(x,y){ if(x===0&&y===7) n.castle.Q=false; if(x===7&&y===7) n.castle.K=false; if(x===0&&y===0) n.castle.q=false; if(x===7&&y===0) n.castle.k=false; }
    touch(fx,fy); touch(tx,ty);
    n.ep=mv.dbl?[fx,(fy+ty)/2]:null;
    n.half=(p.toLowerCase()==='p'||(cap&&cap!=='.'))?0:s.half+1;
    if(!wh) n.full=s.full+1;
    n.turn=wh?'b':'w';
    return n;
  }
  function legal(s){ return pseudo(s).filter(function(mv){ return !inCheck(make(s,mv), s.turn==='w'); }); }
  function statusOf(s){ const ms=legal(s); if(ms.length) return inCheck(s,s.turn==='w')?'check':'ok'; return inCheck(s,s.turn==='w')?'mate':'stale'; }
  function toFEN(s){
    const rows=[];
    for(let y=0;y<8;y++){ let row='',run=0; for(let x=0;x<8;x++){ const c=s.board[y*8+x]; if(c==='.') run++; else { if(run){ row+=run; run=0; } row+=c; } } if(run) row+=run; rows.push(row); }
    let cs=(s.castle.K?'K':'')+(s.castle.Q?'Q':'')+(s.castle.k?'k':'')+(s.castle.q?'q':''); if(!cs) cs='-';
    const ep=s.ep?'abcdefgh'[s.ep[0]]+(8-s.ep[1]):'-';
    return rows.join('/')+' '+s.turn+' '+cs+' '+ep+' '+(s.half||0)+' '+(s.full||1);
  }
  function algSq(x,y){ return 'abcdefgh'[x]+(8-y); }
  function moveUci(mv){ return algSq(mv.from[0],mv.from[1])+algSq(mv.to[0],mv.to[1])+(mv.promo||''); }

  // ---- a small onboard computer (material + square tables, alpha-beta) ----
  const VAL={p:100,n:320,b:330,r:500,q:900,k:0};
  const PST={
    p:[0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n:[-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b:[-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r:[0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q:[-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k:[-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
  };
  function pstAt(t,i,wh){ const tab=PST[t]; if(!tab) return 0; return tab[wh?i:(63-i)]||0; }
  function evalSide(bd,wh){
    let v=0;
    for(let i=0;i<64;i++){ const p=bd[i]; if(p==='.'||white(p)!==wh) continue; const t=p.toLowerCase(); v+=VAL[t]||0; v+=pstAt(t,i,wh); }
    return v;
  }
  function evalPos(s){ return evalSide(s.board,true)-evalSide(s.board,false); }
  let nodes=0;
  function search(s,depth,a,b){
    nodes++;
    if(nodes>14000) return evalPos(s);
    const ms=legal(s);
    if(!ms.length){ if(inCheck(s,s.turn==='w')) return s.turn==='w'?(-20000+depth):(20000-depth); return 0; }
    if(depth<=0) return evalPos(s);
    ms.sort(function(x,y){
      const cx=s.board[y.to[1]*8+y.to[0]]!=='.'?1:0, cy=s.board[x.to[1]*8+x.to[0]]!=='.'?1:0;
      return (cy-cx) || ((y.promo?1:0)-(x.promo?1:0));
    });
    if(s.turn==='w'){
      let best=-99999;
      for(let i=0;i<ms.length;i++){ const v=search(make(s,ms[i]),depth-1,a,b); if(v>best) best=v; if(best>a) a=best; if(a>=b) break; }
      return best;
    }
    let best=99999;
    for(let i=0;i<ms.length;i++){ const v=search(make(s,ms[i]),depth-1,a,b); if(v<best) best=v; if(best<b) b=best; if(a>=b) break; }
    return best;
  }
  function cpuPick(s,level){
    const ms=legal(s); if(!ms.length) return null;
    if(level==='easy' && Math.random()<0.45) return ms[(Math.random()*ms.length)|0];
    const depth=level==='hard'?3:level==='easy'?1:2;
    nodes=0;
    let best=null, bestV=s.turn==='w'?-99999:99999;
    const ordered=ms.slice().sort(function(x,y){
      const cx=s.board[y.to[1]*8+y.to[0]]!=='.'?1:0, cy=s.board[x.to[1]*8+x.to[0]]!=='.'?1:0;
      return cy-cx;
    });
    for(let i=0;i<ordered.length;i++){
      const v=search(make(s,ordered[i]), depth-1, -99999, 99999);
      const better=s.turn==='w'?v>bestV:v<bestV;
      if(best==null||better||(v===bestV&&Math.random()<0.2)){ best=ordered[i]; bestV=v; }
    }
    return best||ms[0];
  }

  function save(){ return db.put(T); }
  function settingsOf(){ return Object.assign({ clock:'5+0', shuffle:true, cpu:'medium', side:'w' }, T.settings||{}); }
  async function joinLobby(){
    const items=await db.getAll(); const t=items.find(function(x){ return x.id==='t'; }); if(t) T=t;
    T.settings=settingsOf();
    if(T.started) return render();
    if(!T.players.some(function(p){ return p.id===me.id; })){ T.players=T.players.concat([{id:me.id,name:me.name}]); await save(); }
    render();
  }
  function addCpu(){
    if(T.started) return;
    if(T.players.some(function(p){ return p.cpu; })) return;
    T.players=T.players.concat([{id:'cpu', name:'Computer', cpu:true}]); save();
  }
  function makeMatch(a,b){
    const spec=clockSpec();
    const m={ id:'m'+Math.random().toString(36).slice(2,8), a:a, b:b, board:START, turn:'w', winner:null, draw:null,
      castle:{K:true,Q:true,k:true,q:true}, ep:null, half:0, full:1, last:null,
      clock: spec?{ w:spec.base, b:spec.base, inc:spec.inc, last:Date.now() }:null };
    if(!b){ m.winner=a; } return m;
  }
  function startTournament(){
    let ps=T.players.slice(); if(ps.length<2) return;
    if(T.settings&&T.settings.shuffle){ for(let i=ps.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; const t=ps[i]; ps[i]=ps[j]; ps[j]=t; } }
    const matches=[]; for(let i=0;i<ps.length;i+=2){ matches.push(makeMatch(ps[i], ps[i+1]||null)); }
    T.started=true; T.rounds=[matches]; T.round=0; save();
    const mine=matches.find(function(m){ return mySeat(m); });
    if(mine && mine.b){ viewMatch=mine.id; }
    render(); queueCpu();
  }
  function playComputer(){
    const side=(T.settings&&T.settings.side)||'w';
    const cpu={id:'cpu', name:'Computer', cpu:true};
    const human={id:me.id, name:me.name};
    const pick=side==='random'?(Math.random()<0.5?'w':'b'):side;
    T.players=[human, cpu];
    T.settings=Object.assign({}, settingsOf(), {shuffle:false});
    const spec=clockSpec();
    const a=pick==='w'?human:cpu, b=pick==='w'?cpu:human;
    const m=makeMatch(a,b);
    T.started=true; T.rounds=[[m]]; T.round=0; viewMatch=m.id; sel=null; hint=null; promo=null;
    save(); render(); queueCpu();
  }
  function curMatches(){ return T.rounds[T.round]||[]; }
  function advance(){
    const ms=curMatches(); if(!ms.every(function(m){ return m.winner||m.draw; })) return;
    if(ms.some(function(m){ return m.draw && !m.winner; })) return; // a drawn match must rematch first
    const winners=ms.map(function(m){ return m.winner; }).filter(Boolean);
    if(winners.length<=1){ save(); return; }
    const next=[]; for(let i=0;i<winners.length;i+=2){ next.push(makeMatch(winners[i], winners[i+1]||null)); }
    T.rounds=T.rounds.concat([next]); T.round++; save();
  }
  function rematch(m){
    const n=makeMatch(m.a,m.b); n.id=m.id;
    const ms=curMatches();
    for(let i=0;i<ms.length;i++) if(ms[i].id===m.id) ms[i]=n;
    viewMatch=n.id; sel=null; hint=null; promo=null; save(); render(); queueCpu();
  }
  function resetTournament(){
    T.started=false; T.rounds=[]; T.round=0; viewMatch=null; sel=null; hint=null; promo=null;
    T.players=T.players.filter(function(p){ return p.id===me.id || !p.cpu; });
    save();
  }
  function mySeat(m){ return m.a&&m.a.id===me.id?'w':m.b&&m.b.id===me.id?'b':null; }
  function remaining(m,side){ if(!m.clock) return null; let r=m.clock[side]; if(m.turn===side&&m.clock.last&&!m.winner&&!m.draw) r-=Date.now()-m.clock.last; return r; }
  function flagFall(m){
    if(!m.clock||m.winner||m.draw) return false;
    if(remaining(m,'w')<=0){ m.winner=m.b; m.draw=null; } else if(remaining(m,'b')<=0){ m.winner=m.a; m.draw=null; } else return false;
    save(); advance(); render(); return true;
  }
  function writeState(m,s){ m.board=s.board; m.turn=s.turn; m.castle=s.castle; m.ep=s.ep; m.half=s.half; m.full=s.full; }
  function applyMv(m,mv){
    if(m.clock){ const now=Date.now(); const seat=m.turn;
      if(m.clock.last) m.clock[seat]-=now-m.clock.last;
      if(m.clock[seat]<=0){ flagFall(m); return; }
      m.clock[seat]+=m.clock.inc||0; m.clock.last=now; }
    const s=make(gameOf(m), mv);
    writeState(m,s);
    m.last={from:mv.from, to:mv.to};
    const st=statusOf(s);
    if(st==='mate'){ m.winner=m.turn==='b'?m.a:m.b; m.draw=null; }
    else if(st==='stale'){ m.draw='stalemate'; m.winner=null; }
    save(); if(m.winner) advance(); sel=null; hint=null; promo=null; render(); queueCpu();
  }
  function doMove(m,fx,fy,tx,ty,pr){
    const seat=mySeat(m); if(seat!==m.turn) return;
    const ms=legal(gameOf(m)).filter(function(mv){ return mv.from[0]===fx&&mv.from[1]===fy&&mv.to[0]===tx&&mv.to[1]===ty; });
    if(!ms.length) return;
    if(ms.length>1 && !pr){ promo={m:m, from:[fx,fy], to:[tx,ty], opts:ms}; render(); return; }
    const mv=pr? ms.find(function(x){ return x.promo===pr; })||ms[0] : ms[0];
    applyMv(m,mv);
  }
  function resign(m){
    const seat=mySeat(m); if(!seat||m.winner||m.draw) return;
    m.winner=seat==='w'?m.b:m.a; m.draw=null; save(); advance(); sel=null; render();
  }
  function queueCpu(){
    if(cpuBusy) return;
    const m=viewMatch&&findMatch(viewMatch); if(!m||m.winner||m.draw) return;
    const side=m.turn==='w'?m.a:m.b; if(!side||!side.cpu) return;
    cpuBusy=true;
    const level=(T.settings&&T.settings.cpu)||'medium';
    const cpuId=side.id;
    setTimeout(function(){
      cpuBusy=false;
      const cur=findMatch(m.id);
      if(!cur||cur.winner||cur.draw) return;
      const pl=cur.turn==='w'?cur.a:cur.b;
      if(!pl||!pl.cpu||pl.id!==cpuId) return;
      const mv=cpuPick(gameOf(cur), level); if(mv) applyMv(cur,mv);
    }, level==='hard'?280:160);
  }

  function algList(s){ return legal(s).map(moveUci); }
  function legalMoves(bd,turn){ // kept name: Hint uses FEN + this list
    return legal(typeof bd==='string'?gameOf({board:bd,turn:turn}):bd).map(function(mv){ return {uci:moveUci(mv), from:mv.from, to:mv.to, promo:mv.promo}; });
  }
  function askHint(m){
    const seat=mySeat(m); if(!seat||seat!==m.turn||m.winner||m.draw||hinting) return;
    if(!(window.gifos&&gifos.ai)){ hint={err:'Hints need the computer’s AI.'}; render(); return; }
    const s=gameOf(m); const list=legalMoves(s);
    if(!list.length){ hint={err:'No legal moves to suggest.'}; render(); return; }
    hinting=true; hint=null; render();
    const side=m.turn==='w'?'White':'Black';
    const sys='You are a strong chess coach. You are given a position as FEN plus the EXACT list of legal moves in coordinate (UCI) notation. Choose the single strongest move for '+side+'. Reply with ONLY compact JSON and nothing else: {"move":"<one move copied verbatim from the legal list>","why":"<one short plain-language sentence>"}.';
    const usr='FEN: '+toFEN(s)+'\\nLegal moves: '+list.map(function(l){return l.uci;}).join(' ')+'\\nPick the best move for '+side+'.';
    gifos.ai.chat({ model:'smartest', temperature:0, messages:[{role:'system',content:sys},{role:'user',content:usr}] })
      .then(function(r){
        const txt=((r&&r.text)||'').trim(); let uci=null, why='';
        try{ const j=JSON.parse(txt.replace(/\`\`\`json|\`\`\`/g,'').trim()); uci=String(j.move||'').trim().toLowerCase(); why=j.why||''; }catch(e){}
        if(!uci){ const mm=txt.toLowerCase().match(/[a-h][1-8][a-h][1-8][qrbn]?/); if(mm) uci=mm[0]; }
        let pick=list.find(function(l){return l.uci===uci;}) || list.find(function(l){return l.uci.slice(0,4)===uci;});
        if(!pick){ pick=list[0]; why=why||'A safe, legal option.'; }
        const cur=findMatch(viewMatch);
        if(cur&&cur.id===m.id&&cur.turn===m.turn&&!cur.winner&&!cur.draw) hint={ from:pick.from, to:pick.to, why:why, uci:pick.uci };
      })
      .catch(function(e){ const msg=String((e&&e.message)||e);
        hint={ err: /NOT_CONFIGURED/.test(msg) ? 'Set up your Smartest AI in Settings to get hints.' : 'Couldn’t get a hint right now.' };
      })
      .then(function(){ hinting=false; render(); });
  }

  function render(){
    view.innerHTML='';
    if(!T.started){ renderLobby(); return; }
    if(viewMatch){ renderBoard(); return; }
    renderBracket();
  }
  function renderLobby(){
    const inList=T.players.some(function(p){return p.id===me.id;});
    const d=document.createElement('div'); d.className='lobby';
    const cpuBtn=document.createElement('button'); cpuBtn.className='playcpu'; cpuBtn.textContent='Play the computer'; cpuBtn.onclick=playComputer;
    d.appendChild(cpuBtn);
    const st=document.createElement('div'); st.className='settings';
    st.innerHTML='<h3>Vs computer</h3><div class="hint">Works offline, in this GIF. Strength is a small onboard engine — not Stockfish.</div>';
    function addSel(label, key, opts, def){
      const row=document.createElement('label'); row.appendChild(document.createTextNode(label+' '));
      const selEl=document.createElement('select');
      opts.forEach(function(c){ const o=document.createElement('option'); o.value=c[0]; o.textContent=c[1]; selEl.appendChild(o); });
      selEl.value=(T.settings&&T.settings[key])||def;
      selEl.onchange=function(){ T.settings=Object.assign({},settingsOf()); T.settings[key]=selEl.value; save(); };
      row.appendChild(selEl); st.appendChild(row);
    }
    addSel('Strength', 'cpu', CPUS, 'medium');
    addSel('I play', 'side', [['w','White'],['b','Black'],['random','Random']], 'w');
    d.appendChild(st);
    const split=document.createElement('div'); split.className='split'; split.textContent='or a tournament'; d.appendChild(split);
    const p=document.createElement('p'); p.textContent='Invite a friend (top bar), then start. Winners advance until one champion remains. An odd player gets a bye.'; d.appendChild(p);
    const ul=document.createElement('ul'); ul.className='players';
    T.players.forEach(function(pl){ const li=document.createElement('li'); li.textContent=pl.name+(pl.id===me.id?' (you)':'')+(pl.cpu?' — computer':''); ul.appendChild(li); });
    d.appendChild(ul);
    const ts=document.createElement('div'); ts.className='settings';
    ts.innerHTML='<h3>Tournament settings</h3><div class="hint">Apply to every game. Locked once the bracket starts.</div>';
    (function(){
      const row=document.createElement('label'); row.appendChild(document.createTextNode('Time control '));
      const selEl=document.createElement('select');
      CLOCKS.forEach(function(c){ const o=document.createElement('option'); o.value=c[0]; o.textContent=c[1]; selEl.appendChild(o); });
      selEl.value=settingsOf().clock; selEl.onchange=function(){ T.settings=Object.assign({},settingsOf(),{clock:selEl.value}); save(); };
      row.appendChild(selEl); ts.appendChild(row);
    })();
    const shl=document.createElement('label'); const shc=document.createElement('input'); shc.type='checkbox';
    shc.checked=settingsOf().shuffle!==false;
    shc.onchange=function(){ T.settings=Object.assign({},settingsOf(),{shuffle:shc.checked}); save(); };
    shl.appendChild(shc); shl.appendChild(document.createTextNode(' Shuffle the bracket seeding'));
    ts.appendChild(shl); d.appendChild(ts);
    const jb=document.createElement('button'); jb.textContent=inList?'You’re in ('+T.players.length+')':'Join lobby'; jb.onclick=joinLobby;
    d.appendChild(jb);
    if(!T.players.some(function(p){ return p.cpu; })){
      const ac=document.createElement('button'); ac.className='ghost'; ac.textContent='Add a computer'; ac.onclick=addCpu; d.appendChild(ac);
    }
    if(T.players.length>=2){ const sb=document.createElement('button'); sb.textContent='Start tournament'; sb.onclick=startTournament; d.appendChild(sb); }
    view.appendChild(d);
    statusEl.textContent='Lobby — '+T.players.length+' player(s). Press Invite and share the link, or play the computer.';
  }
  function renderBracket(){
    const wrap=document.createElement('div'); wrap.className='bracket';
    T.rounds.forEach(function(ms){ const rd=document.createElement('div'); rd.className='round';
      ms.forEach(function(m){ const el=document.createElement('div'); el.className='match'+(mySeat(m)?' mine':'');
        const an=m.a?m.a.name:'—', bn=m.b?m.b.name:'(bye)';
        el.innerHTML='<div class="'+(m.winner&&m.winner.id===(m.a&&m.a.id)?'w':'')+'">'+esc(an)+'</div><div class="'+(m.winner&&m.b&&m.winner.id===m.b.id?'w':'')+'">'+esc(bn)+(m.draw?' · draw':'')+'</div>';
        el.onclick=function(){ viewMatch=m.id; sel=null; hint=null; promo=null; render(); queueCpu(); };
        rd.appendChild(el); });
      wrap.appendChild(rd); });
    view.appendChild(wrap);
    const last=(T.rounds[T.rounds.length-1]||[]);
    const champ=last.length===1 && last[0].winner && !last[0].draw;
    statusEl.textContent=champ?('🏆 Champion: '+esc(champ.name)):'Round '+(T.round+1)+' — tap a match to play or watch.';
    const actions=document.createElement('div'); actions.className='actions';
    const nt=document.createElement('button'); nt.className='ghost'; nt.textContent='New tournament'; nt.onclick=resetTournament; actions.appendChild(nt);
    view.appendChild(actions);
  }
  function fmtClock(ms){ ms=Math.max(0,ms|0); const s=Math.ceil(ms/1000); return Math.floor(s/60)+':'+('0'+s%60).slice(-2); }
  function clockRow(m,side){
    const el=document.createElement('div'); el.className='clock'+(m.turn===side&&!m.winner&&!m.draw?' live':'');
    const who=side==='w'?m.a:m.b; const r=remaining(m,side);
    el.textContent=(side==='w'?'⚪ ':'⚫ ')+(who?who.name:'?')+'  '+fmtClock(r);
    if(r<30000) el.classList.add('low'); el.dataset.side=side; return el;
  }
  function sqSize(){ const w=Math.min(document.documentElement.clientWidth-24, 420); return Math.max(28, Math.min(48, Math.floor(w/8))); }
  function renderBoard(){
    const m=findMatch(viewMatch); if(!m){ viewMatch=null; return render(); }
    const back=document.createElement('button'); back.className='back'; back.textContent='← Bracket'; back.onclick=function(){ viewMatch=null; sel=null; hint=null; promo=null; render(); }; view.appendChild(back);
    const seat=mySeat(m); const s=gameOf(m); const bd=s.board;
    const flip=seat==='b';
    const files=document.createElement('div'); files.className='files';
    files.textContent=flip?'hgfedcba':'abcdefgh';
    if(m.clock) view.appendChild(clockRow(m, seat==='b'?'w':'b'));
    const dests = sel ? legal(s).filter(function(mv){ return mv.from[0]===sel[0]&&mv.from[1]===sel[1]; }) : [];
    const stNow=statusOf(s); const kp=kingPos(bd,s.turn==='w');
    const board=document.createElement('div'); board.className='board'; board.style.setProperty('--sq', sqSize()+'px');
    for(let y=0;y<8;y++)for(let x=0;x<8;x++){
      const rx=flip?7-x:x, ry=flip?7-y:y;
      const sq=document.createElement('div'); sq.className='sq '+(((rx+ry)%2)?'d':'l');
      const p=bd[ry*8+rx]; if(p!=='.'){ sq.textContent=GLYPH[p.toLowerCase()]; sq.classList.add(p>='A'&&p<='Z'?'pw':'pb'); }
      if(sel&&sel[0]===rx&&sel[1]===ry) sq.classList.add('sel');
      const hit=dests.filter(function(c){ return c.to[0]===rx&&c.to[1]===ry; });
      if(hit.length){ sq.classList.add('mv'); if(p!=='.'||hit[0].ep) sq.classList.add('cap'); }
      if(m.last&&((m.last.from[0]===rx&&m.last.from[1]===ry)||(m.last.to[0]===rx&&m.last.to[1]===ry))) sq.classList.add('last');
      if((stNow==='check'||stNow==='mate')&&kp&&kp[0]===rx&&kp[1]===ry) sq.classList.add('check');
      if(hint&&seat===m.turn&&!m.winner&&!m.draw){ if(hint.from&&hint.from[0]===rx&&hint.from[1]===ry) sq.classList.add('hintf'); if(hint.to&&hint.to[0]===rx&&hint.to[1]===ry) sq.classList.add('hintt'); }
      sq.onclick=(function(cx,cy){ return function(){
        if(m.winner||m.draw||seat!==m.turn) return;
        if(sel){ const opts=legal(s).filter(function(mv){ return mv.from[0]===sel[0]&&mv.from[1]===sel[1]&&mv.to[0]===cx&&mv.to[1]===cy; });
          if(opts.length){ doMove(m,sel[0],sel[1],cx,cy); return; } sel=null; }
        if(s.turn===seat && (seat==='w'?white(bd[cy*8+cx]):black(bd[cy*8+cx]))) sel=[cx,cy];
        render();
      }; })(rx,ry);
      board.appendChild(sq);
    }
    if(promo&&promo.m&&promo.m.id===m.id){
      const box=document.createElement('div'); box.className='promo';
      [['q','Queen'],['r','Rook'],['b','Bishop'],['n','Knight']].forEach(function(pr){
        const b=document.createElement('button'); b.textContent=GLYPH[pr[0]]; b.title=pr[1];
        b.onclick=function(){ const P=promo; promo=null; doMove(P.m,P.from[0],P.from[1],P.to[0],P.to[1],pr[0]); };
        box.appendChild(b);
      });
      board.appendChild(box);
    }
    view.appendChild(board);
    view.appendChild(files);
    if(m.clock) view.appendChild(clockRow(m, seat==='b'?'b':'w'));
    if(seat&&seat===m.turn&&!m.winner&&!m.draw){
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
    const actions=document.createElement('div'); actions.className='actions';
    if(seat&&!m.winner&&!m.draw){ const rs=document.createElement('button'); rs.className='ghost'; rs.textContent='Resign'; rs.onclick=function(){ resign(m); }; actions.appendChild(rs); }
    if(m.draw && seat){ const rm=document.createElement('button'); rm.textContent='Rematch'; rm.onclick=function(){ rematch(m); }; actions.appendChild(rm); }
    view.appendChild(actions);
    statusEl.textContent = m.winner ? ('Winner: '+esc(m.winner.name))
      : m.draw ? ('Draw — '+(m.draw==='stalemate'?'stalemate':'draw')+'. Rematch to advance.')
      : (seat? (m.turn===seat?'Your move ('+(seat==='w'?'White':'Black')+(stNow==='check'?' — check':'')+')':((m.turn==='w'?m.a:m.b)&& (m.turn==='w'?m.a:m.b).cpu?'Computer is thinking…':'Waiting for opponent')) : 'Spectating')
        + ' — '+esc(m.a?m.a.name:'?')+' vs '+esc(m.b?m.b.name:'?');
  }
  setInterval(function(){
    if(!viewMatch) return; const m=findMatch(viewMatch); if(!m||!m.clock||m.winner||m.draw) return;
    if(mySeat(m)&&flagFall(m)) return;
    view.querySelectorAll('.clock').forEach(function(el){
      const side=el.dataset.side, who=side==='w'?m.a:m.b, r=remaining(m,side);
      el.textContent=(side==='w'?'⚪ ':'⚫ ')+(who?who.name:'?')+'  '+fmtClock(r);
      el.classList.toggle('low',r<30000);
      el.classList.toggle('live',m.turn===side&&!m.winner&&!m.draw);
    });
  }, 500);
  function findMatch(id){ for(let ri=0;ri<T.rounds.length;ri++){ const r=T.rounds[ri]; for(let i=0;i<r.length;i++){ if(r[i].id===id) return r[i]; } } return null; }
  const esc=function(s){ return String(s).replace(/[&<>]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); };
  db.subscribe(function(items){ const t=items.find(function(x){return x.id==='t';}); if(t){ T=t; T.settings=settingsOf(); } render(); queueCpu(); });
  if(window.gifos) gifos.me().then(function(mm){ me={id:mm.id,name:mm.name||'You'}; joinLobby(); });
  render();
  window.__chess={
    legal:function(m){ return legal(gameOf(m||{board:START,turn:'w'})).map(moveUci); },
    status:function(m){ return statusOf(gameOf(m)); },
    fen:function(m){ return toFEN(gameOf(m||{board:START,turn:'w'})); },
    cpuPick:function(m,lv){ const mv=cpuPick(gameOf(m), lv||'medium'); return mv&&moveUci(mv); }
  };
</script>`;

  // Ping Pong gauntlet: 3D table tennis, bar = Table Tennis Touch (Yakuto).
  // Finger tracks the paddle; hits are automatic (no "tap the ball"). First to 11
  // win by 2. Host runs physics; guest paddle/serve via gifos.db('pingpong').
  // Keep game/guest record ids and hostScore/guestScore so old GIFs still load.
  const PINGPONG_HTML = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover">
<style>
  * { box-sizing: border-box; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
  html, body { height: 100%; margin: 0; overflow: hidden; background: #070b14; color: #f4f4f8; font-family: system-ui, sans-serif; touch-action: none; }
  #wrap { position: fixed; inset: 0; }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; }
  #reset {
    position: fixed; top: calc(8px + env(safe-area-inset-top, 0px)); right: 10px;
    z-index: 6; pointer-events: auto; padding: 7px 11px; border: 0; border-radius: 9px;
    background: rgba(0,0,0,.45); color: #fff; font-size: 12px; font-weight: 700; cursor: pointer;
    border: 1px solid rgba(255,255,255,.18);
  }
  #status {
    position: fixed; top: calc(8px + env(safe-area-inset-top, 0px)); left: 10px; right: 88px;
    z-index: 6; pointer-events: none; font-size: 12px; font-weight: 700; letter-spacing: .04em;
    text-transform: uppercase; color: rgba(255,255,255,.72); text-shadow: 0 1px 6px #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  #banner {
    position: fixed; left: 50%; top: 40%; transform: translate(-50%, -50%);
    z-index: 8; pointer-events: none; text-align: center; opacity: 0; transition: opacity .12s;
    text-shadow: 0 6px 24px #000, 0 1px 0 #000;
  }
  #banner.on { opacity: 1; }
  #banner h2 { margin: 0; font-size: clamp(28px, 8vw, 52px); font-weight: 900; letter-spacing: .02em; }
  #banner p { margin: 6px 0 0; font-size: 14px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #ffd56a; }
  #hint {
    position: fixed; left: 50%; bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%); z-index: 6; pointer-events: none; max-width: 92%;
    font-size: 13px; font-weight: 650; color: #e8e8f0; background: rgba(0,0,0,.55);
    padding: 8px 14px; border-radius: 12px; text-align: center; line-height: 1.35;
  }
  #hint.hide { display: none; }
  #overlay { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; flex-direction: column; background: rgba(0,0,0,.82); z-index: 10; padding: 24px; text-align: center; }
  #overlay.on { display: flex; }
  #overlay h2 { margin: 0 0 10px; color: #7dffb0; font-size: 26px; }
  #overlay p { max-width: 300px; margin: 0 0 20px; color: #c8c8dc; font-size: 15px; line-height: 1.5; }
  #readyBtn { padding: 14px 28px; border: 0; border-radius: 12px; background: #7dffb0; color: #062014; font-size: 17px; font-weight: 800; cursor: pointer; }
  #readyBtn:active { transform: scale(0.97); }
</style>
<div id="wrap"><canvas id="game"></canvas></div>
<div id="status">First to 11</div>
<button id="reset">New game</button>
<div id="banner"><h2 id="bt"></h2><p id="bp"></p></div>
<div id="hint">Drag to move your paddle — it hits for you. Tap to serve.</div>
<div id="overlay">
  <h2 id="ot">Ready?</h2>
  <p id="ob">Tap the button when you are back so you can return the next ball.</p>
  <button id="readyBtn">I'm ready</button>
</div>
<script>
  var db = (window.gifos && gifos.db) ? gifos.db('pingpong') : { subscribe: function () {}, put: function () {} };
  var me = { id: 'local', name: 'You' }, owner = !window.gifos;
  if (window.gifos) {
    gifos.me().then(function (m) { me.id = m.id; me.name = m.name || 'You'; });
    gifos.info().then(function (i) { owner = !!(i && i.owner); boot(); });
  } else boot();

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');
  var overlay = document.getElementById('overlay');
  var ot = document.getElementById('ot');
  var ob = document.getElementById('ob');
  var readyBtn = document.getElementById('readyBtn');
  var resetBtn = document.getElementById('reset');
  var hint = document.getElementById('hint');
  var banner = document.getElementById('banner');
  var bt = document.getElementById('bt');
  var bp = document.getElementById('bp');

  var TW = 18, TL = 36, NH = 2.2, BR = 0.62, PADW = 4.1;
  var HOST_Y = 2.55, GUEST_Y = TL - 2.55;
  var G = -0.00005, REST = 0.9, DT = 16, BROADCAST = 3;
  var GUEST_TIMEOUT = 3500, STATE_TIMEOUT = 3000;
  var WIN = 11;

  var game = freshGame();
  var gst = { id: 'guest', x: 0, y: GUEST_Y, heartbeat: 0, ready: false, swing: null, t: 0, name: '' };
  var pointer = null;
  var tick = 0, lastGuestBeat = 0, lastStateAt = 0, lastNow = 0;
  var nextSwing = { host: null, guest: null };
  var cpu = { err: 0, serveAt: 0, vx: 0, reactUntil: 0, lastToward: false };
  var rules = { needOwn: false, needOpp: false };
  var pointOver = false;
  var freezeUntil = 0, matchOver = false, matchWinner = null, pendingServer = null;
  var myVx = 0, prevMyX = 0, hitFlash = 0, hitsDone = 0;
  var bannerUntil = 0, overlayMode = '';
  var sparks = [];
  var _W = 0, _H = 0, dpr = 1;
  var hoverOk = false;
  try { hoverOk = window.matchMedia('(hover:hover) and (pointer:fine)').matches; } catch (e) {}

  function freshGame() {
    return {
      id: 'game',
      bx: 0, by: HOST_Y + 0.8, bz: 3, vx: 0, vy: 0, vz: 0,
      sx: 0, sy: 0, sz: 0, sp: 0,
      hostX: 0, hostY: HOST_Y,
      guestX: 0, guestY: GUEST_Y,
      hostScore: 0, guestScore: 0,
      serving: 'host', lastHitter: null,
      paused: false, pausedBy: null, pausedAt: 0, t: 0,
      rally: 0, why: '', msgWho: null
    };
  }

  function adopt(g) {
    if (!g || g.id !== 'game') return game;
    if (typeof g.hostScore !== 'number') g.hostScore = 0;
    if (typeof g.guestScore !== 'number') g.guestScore = 0;
    if (g.hostY == null) g.hostY = HOST_Y;
    if (g.guestY == null) g.guestY = GUEST_Y;
    if (g.rally == null) g.rally = 0;
    return g;
  }

  function boot() {
    if (!owner) resetBtn.style.display = 'none';
    resize();
    window.addEventListener('resize', resize);
    bindInput();
    bindOverlay();
    db.subscribe(function (items) {
      var g = items.find(function (x) { return x.id === 'game'; });
      if (g) {
        var prevH = game.hostScore, prevG = game.guestScore;
        game = adopt(g);
        lastStateAt = Date.now();
        if (!owner && (game.hostScore !== prevH || game.guestScore !== prevG)) {
          onScoreSeen();
        }
      }
      if (owner) {
        var n = items.find(function (x) { return x.id === 'guest'; });
        if (n) {
          gst = n;
          lastGuestBeat = n.heartbeat || n.t || 0;
          if (n.ready && game.paused) { game.paused = false; game.pausedBy = null; }
        }
      }
      updateOverlay();
    });
    lastNow = Date.now();
    setInterval(owner ? hostTick : guestTick, DT);
    requestAnimationFrame(render);
    showBanner('PING PONG', 'first to 11 · win by 2', 1600);
  }

  function isCpu() { return owner && (!lastGuestBeat || (Date.now() - lastGuestBeat > GUEST_TIMEOUT)); }

  function themName() {
    if (isCpu()) return 'CPU';
    return (gst && gst.name) ? gst.name : (owner ? 'Friend' : 'Host');
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function clampX(x) { return clamp(x, -TW / 2 + PADW / 2, TW / 2 - PADW / 2); }

  function serverFor(h, g) {
    var tot = h + g;
    if (h >= 10 && g >= 10) return (tot % 2 === 0) ? 'host' : 'guest';
    return (Math.floor(tot / 2) % 2 === 0) ? 'host' : 'guest';
  }

  function won(a, b) { return a >= WIN && a - b >= 2; }

  function hostTick() {
    var now = Date.now();
    var dt = clamp(now - lastNow, 8, 48);
    lastNow = now;
    if (!isCpu() && lastGuestBeat && now - lastGuestBeat > GUEST_TIMEOUT && !game.paused) {
      game.paused = true; game.pausedBy = 'guest'; game.pausedAt = now;
    }
    if (isCpu() && game.paused) { game.paused = false; game.pausedBy = null; }
    if (gst.swing) { nextSwing.guest = gst.swing; gst.swing = null; }
    if (pointer) {
      var nx = clampX(pointer.tableX);
      myVx = myVx * 0.55 + (nx - game.hostX) / dt * 0.45;
      game.hostX = nx;
    } else {
      myVx *= 0.85;
    }
    game.hostY = HOST_Y;
    if (isCpu()) runCpu(dt, now);
    else {
      game.guestX = clampX(gst.x || game.guestX);
      game.guestY = GUEST_Y;
    }
    if (pendingServer && now >= freezeUntil && !matchOver) {
      resetBall(pendingServer);
      pendingServer = null;
    }
    if (!game.paused && now >= freezeUntil && !matchOver) step(dt);
    game.t = now;
    game.hostY = HOST_Y;
    game.guestY = GUEST_Y;
    if (++tick % BROADCAST === 0) db.put(game);
    updateHud();
  }

  function guestTick() {
    var now = Date.now();
    var dt = clamp(now - lastNow, 8, 48);
    lastNow = now;
    if (pointer) {
      var nx = clampX(pointer.tableX);
      myVx = myVx * 0.55 + (nx - gst.x) / dt * 0.45;
      gst.x = nx;
    } else myVx *= 0.85;
    gst.y = GUEST_Y;
    gst.heartbeat = now; gst.t = now; gst.name = me.name;
    if (!game.paused) gst.ready = false;
    if (++tick % BROADCAST === 0) db.put(gst);
    updateHud();
  }

  function step(dt) {
    if (game.serving) { holdServe(dt); return; }
    pointOver = false;
    var n = clamp(Math.ceil(Math.abs(game.vy) * dt / 0.7), 1, 5);
    var s = dt / n;
    for (var i = 0; i < n; i++) { substep(s); if (pointOver) return; }
  }

  function holdServe() {
    var who = game.serving;
    var px = who === 'host' ? game.hostX : game.guestX;
    var py = who === 'host' ? HOST_Y + 1.55 : GUEST_Y - 1.55;
    game.bx = px; game.by = py;
    game.bz = 2.7 + Math.sin(Date.now() / 170) * 0.38;
    game.vx = 0; game.vy = 0; game.vz = 0;
    if (who === 'guest' && nextSwing.guest) {
      var gs = nextSwing.guest; nextSwing.guest = null;
      doServe('guest', gs.force, gs.smudgeX);
      return;
    }
    if (isCpu() && who === 'guest') {
      if (!cpu.serveAt) cpu.serveAt = Date.now() + 520 + Math.random() * 380;
      if (Date.now() >= cpu.serveAt) {
        cpu.serveAt = 0;
        doServe('guest', 0.42 + Math.random() * 0.22, (Math.random() - 0.5) * 22);
      }
    }
  }

  function substep(dt) {
    var prevY = game.by, prevZ = game.bz, prevX = game.bx;
    game.vz += G * dt;
    game.vx *= 0.99992; game.vy *= 0.99992;
    game.bx += game.vx * dt;
    game.by += game.vy * dt;
    game.bz += game.vz * dt;
    game.sp += Math.sqrt(game.sx * game.sx + game.sy * game.sy + game.sz * game.sz) * dt * 0.9;
    game.sx *= 0.9996; game.sy *= 0.9996; game.sz *= 0.9996;

    var crossed = (prevY - TL / 2) * (game.by - TL / 2) <= 0 && prevY !== game.by;
    if (crossed) {
      var t = (TL / 2 - prevY) / (game.by - prevY);
      var zAt = prevZ + (game.bz - prevZ) * t;
      var xAt = prevX + (game.bx - prevX) * t;
      if (Math.abs(xAt) <= TW / 2 + 0.4 && zAt < NH + BR) {
        if (rules.needOwn) { endPoint(game.lastHitter === 'host' ? 'guest' : 'host', 'net'); return; }
        endPoint(game.lastHitter === 'host' ? 'guest' : 'host', 'net');
        return;
      }
    }

    if (game.bz <= BR) {
      var on = game.by > 0.05 && game.by < TL - 0.05 && Math.abs(game.bx) <= TW / 2;
      if (on) { bounce(); if (game.serving) return; }
      else if (game.bz < -0.2) { missOff(); return; }
    }

    if (game.by > TL + 0.6) { passEnd('guest'); return; }
    if (game.by < -0.6) { passEnd('host'); return; }

    tryHit('host');
    tryHit('guest');
  }

  function bounce() {
    game.bz = BR;
    game.vz = -game.vz * REST;
    game.vx += game.sz * 0.1;
    game.vy += game.sy * 0.04;
    playSound('table');
    var side = game.by < TL / 2 ? 'host' : 'guest';
    if (rules.needOwn) {
      if (side !== game.lastHitter) { endPoint(side, 'fault'); return; }
      rules.needOwn = false;
      var dir = game.lastHitter === 'host' ? 1 : -1;
      if (game.vz < 0.026) game.vz = 0.027 + Math.random() * 0.004;
      game.vy = dir * Math.max(Math.abs(game.vy), 0.026);
      return;
    }
    if (side === game.lastHitter) { endPoint(side === 'host' ? 'guest' : 'host', 'drop'); return; }
    if (!rules.needOpp) { endPoint(side === 'host' ? 'guest' : 'host', 'double'); return; }
    rules.needOpp = false;
  }

  function passEnd(end) {
    if (rules.needOwn || rules.needOpp) endPoint(game.lastHitter === 'host' ? 'guest' : 'host', 'out');
    else endPoint(end === 'host' ? 'guest' : 'host', 'miss');
  }

  function missOff() {
    if (rules.needOwn || rules.needOpp) endPoint(game.lastHitter === 'host' ? 'guest' : 'host', 'out');
    else endPoint(game.by < TL / 2 ? 'guest' : 'host', 'miss');
  }

  function tryHit(who) {
    if (game.serving) return;
    var isHost = who === 'host';
    var py = isHost ? game.hostY : game.guestY;
    var px = isHost ? game.hostX : game.guestX;
    var toward = (isHost && game.vy < 0) || (!isHost && game.vy > 0);
    if (!toward) return;
    if (game.lastHitter === who) return;
    if (isHost) { if (game.by > 8.8 || game.by < -1.3) return; }
    else { if (game.by < TL - 8.8 || game.by > TL + 1.3) return; }
    var dx = game.bx - px;
    var reach = PADW / 2 + BR + 0.35;
    if (Math.abs(dx) > reach) return;
    if (game.bz > 8.2 || game.bz < -0.2) return;
    if (who === 'guest' && isCpu() && Math.abs(dx) > 0.85 && Math.random() < 0.62) return;

    var swing = consumeSwing(who);
    var padV = isHost ? myVx : (isCpu() ? cpu.vx : (gst.svx || 0));
    var force = swing ? clamp(swing.force, 0.2, 1) : 0.52;
    if (swing && Math.abs(swing.smudgeY) > 18) force = clamp(force + 0.18, 0, 1);
    var speed = 0.026 + force * 0.022 + Math.min(0.012, Math.abs(game.vy) * 0.25);
    var aim = clampX(-dx * 3.8 + padV * 90 + (swing ? swing.smudgeX * 0.03 : 0));
    if (who === 'guest' && isCpu() && Math.random() < 0.3) {
      aim = clampX((Math.random() < 0.5 ? -1 : 1) * (4.6 + Math.random() * 2.4));
    } else if (Math.abs(aim) < 0.4) aim += (Math.random() - 0.5) * 2.2;
    var landY = isHost ? (TL - 3.6 + Math.random() * 1.6) : (3.6 - Math.random() * 1.6);
    launchShot(game.bx, game.by, Math.max(game.bz, 1.2), aim, landY, speed);
    var smx = swing ? swing.smudgeX : padV * 40;
    game.sz += smx * 0.0005;
    game.sy += (isHost ? 1 : -1) * (0.002 + force * 0.003);
    game.sx += (swing ? -swing.smudgeY : 0) * 0.0003;
    game.lastHitter = who;
    game.rally = (game.rally || 0) + 1;
    rules.needOwn = false;
    rules.needOpp = true;
    hitFlash = 1;
    hitsDone++;
    if (hitsDone >= 1) hint.classList.add('hide');
    addSpark(game.bx, game.by, game.bz);
    playSound(force > 0.78 ? 'smash' : 'paddle');
  }

  function consumeSwing(who) {
    var s = nextSwing[who];
    if (!s) return null;
    nextSwing[who] = null;
    if (performance.now() - s.t > 300) return null;
    return s;
  }

  function launchShot(fromX, fromY, fromZ, toX, toY, speed) {
    speed = clamp(speed, 0.022, 0.056);
    var dy = toY - fromY;
    var T = Math.abs(dy) / speed;
    T = clamp(T, 320, 980);
    var vy = dy / T;
    var vx = (toX - fromX) / T;
    var vz = (BR + 0.15 - fromZ - 0.5 * G * T * T) / T;
    var tNet = (TL / 2 - fromY) / vy;
    if (tNet > 40 && tNet < T) {
      var zNet = fromZ + vz * tNet + 0.5 * G * tNet * tNet;
      if (zNet < NH + BR + 0.45) {
        T = clamp(T * 1.2, 360, 1100);
        vy = dy / T; vx = (toX - fromX) / T;
        vz = (BR + 0.2 - fromZ - 0.5 * G * T * T) / T;
      }
    }
    game.vx = vx; game.vy = vy; game.vz = vz;
  }

  function doServe(who, force, smx) {
    if (!game.serving || game.serving !== who) return;
    force = clamp(force == null ? 0.5 : force, 0.2, 1);
    var dir = who === 'host' ? 1 : -1;
    var px = who === 'host' ? game.hostX : game.guestX;
    game.bx = px;
    game.by = who === 'host' ? HOST_Y + 0.9 : GUEST_Y - 0.9;
    game.bz = 3.05;
    game.vx = clamp((smx || 0) * 0.00022, -0.007, 0.007);
    game.vy = dir * (0.022 + force * 0.006);
    game.vz = 0.0015;
    game.sx = 0; game.sy = dir * 0.002; game.sz = (smx || 0) * 0.00025; game.sp = 0;
    game.serving = null;
    game.lastHitter = who;
    game.rally = 1;
    game.why = '';
    rules.needOwn = true;
    rules.needOpp = true;
    playSound('paddle');
    hint.classList.add('hide');
  }

  function endPoint(to, why) {
    if (pointOver) return;
    pointOver = true;
    if (to === 'host') game.hostScore++; else game.guestScore++;
    game.why = why || '';
    game.msgWho = to;
    game.rally = game.rally || 0;
    game.vx = 0; game.vy = 0; game.vz = 0;
    playSound('score');
    var my = owner ? to === 'host' : to === 'guest';
    var label = why === 'net' ? 'NET' : why === 'out' ? 'OUT' : why === 'double' ? 'DOUBLE BOUNCE' : why === 'fault' ? 'FAULT' : why === 'drop' ? 'DROP' : why === 'miss' ? 'MISS' : 'POINT';
    var big = my ? 'YOUR POINT' : (isCpu() ? 'CPU POINT' : 'THEIR POINT');
    if (game.rally >= 5) label = game.rally + ' SHOT RALLY · ' + label;
    showBanner(big, label, 900);
    freezeUntil = Date.now() + 900;
    if (won(game.hostScore, game.guestScore) || won(game.guestScore, game.hostScore)) {
      matchOver = true;
      matchWinner = won(game.hostScore, game.guestScore) ? 'host' : 'guest';
      pendingServer = null;
      freezeUntil = Date.now() + 999999;
      var iWin = owner ? matchWinner === 'host' : matchWinner === 'guest';
      showBanner(iWin ? 'YOU WIN' : (isCpu() ? 'CPU WINS' : 'THEY WIN'), game.hostScore + '  —  ' + game.guestScore, 4000);
      updateOverlay();
    } else {
      pendingServer = serverFor(game.hostScore, game.guestScore);
      game.serving = pendingServer;
    }
    rules.needOwn = false; rules.needOpp = false;
    nextSwing = { host: null, guest: null };
    cpu.serveAt = 0;
  }

  function resetBall(server) {
    game.bx = 0;
    game.by = server === 'host' ? HOST_Y + 0.8 : GUEST_Y - 0.8;
    game.bz = 2.8;
    game.vx = 0; game.vy = 0; game.vz = 0;
    game.sx = 0; game.sy = 0; game.sz = 0; game.sp = 0;
    game.lastHitter = null;
    game.serving = server;
  }

  function onScoreSeen() {
    var to = game.msgWho;
    if (!to) return;
    var my = to === 'guest';
    showBanner(my ? 'YOUR POINT' : 'THEIR POINT', (game.why || 'POINT').toUpperCase(), 900);
    if (won(game.hostScore, game.guestScore) || won(game.guestScore, game.hostScore)) {
      matchOver = true;
      matchWinner = won(game.hostScore, game.guestScore) ? 'host' : 'guest';
      var iWin = matchWinner === 'guest';
      showBanner(iWin ? 'YOU WIN' : 'THEY WIN', game.hostScore + '  —  ' + game.guestScore, 4000);
      updateOverlay();
    }
  }

  function runCpu(dt, now) {
    var toward = !game.serving && game.vy > 0;
    if (toward && !cpu.lastToward) cpu.reactUntil = now + 90 + Math.random() * 90;
    cpu.lastToward = toward;
    game.guestY = GUEST_Y;
    if (toward && now < cpu.reactUntil) { cpu.vx *= 0.8; return; }
    var target = game.guestX;
    var maxV;
    if (toward) {
      target = predictX(GUEST_Y);
      cpu.err += (Math.random() - 0.5) * 0.06;
      cpu.err *= 0.93;
      target = clampX(target + cpu.err * 1.3);
      maxV = Math.abs(game.vy) > 0.042 ? 0.008 : 0.01;
    } else {
      target = 0;
      cpu.err *= 0.88;
      maxV = 0.01;
    }
    var dx = target - game.guestX;
    var stepX = clamp(dx, -maxV * dt, maxV * dt);
    cpu.vx = stepX / dt;
    game.guestX = clampX(game.guestX + stepX);
  }

  function predictX(atY) {
    var x = game.bx, y = game.by, z = game.bz, vx = game.vx, vy = game.vy, vz = game.vz;
    for (var i = 0; i < 220; i++) {
      vz += G * DT; x += vx * DT; y += vy * DT; z += vz * DT;
      if (z <= BR && y > 0 && y < TL && Math.abs(x) <= TW / 2) { z = BR; vz = -vz * REST; }
      if (vy > 0 && y >= atY) return x;
      if (vy < 0 && y <= atY) return x;
      if (y < -3 || y > TL + 3) return x;
    }
    return x;
  }

  function screenToTableX(px) {
    var nearW = _W * 0.96;
    var dir = owner ? 1 : -1;
    return dir * (px - _W / 2) / (nearW / TW);
  }

  function bindInput() {
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      var r = canvas.getBoundingClientRect();
      var px = e.clientX - r.left;
      pointer = {
        id: e.pointerId, x: px, y: e.clientY - r.top,
        startX: px, startY: e.clientY - r.top, t: performance.now(),
        pressure: e.pressure || 0, tableX: screenToTableX(px)
      };
      applyPointer();
    });
    window.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      var px = e.clientX - r.left;
      if (pointer && pointer.id === e.pointerId) {
        pointer.x = px; pointer.y = e.clientY - r.top;
        pointer.pressure = Math.max(pointer.pressure, e.pressure || 0);
        pointer.tableX = screenToTableX(px);
        applyPointer();
      } else if (hoverOk && !pointer) {
        var dummy = { tableX: screenToTableX(px) };
        if (owner) game.hostX = clampX(dummy.tableX);
        else gst.x = clampX(dummy.tableX);
      }
    });
    window.addEventListener('pointerup', function (e) {
      if (!pointer || pointer.id !== e.pointerId) return;
      var dt = performance.now() - pointer.t;
      var sx = pointer.x - pointer.startX;
      var sy = pointer.y - pointer.startY;
      var force = estimateForce(pointer.pressure, dt, sx, sy);
      var localWho = owner ? 'host' : 'guest';
      if (game.serving === localWho && !matchOver) {
        if (owner) doServe(localWho, force, sx);
        else {
          gst.swing = { force: force, smudgeX: sx, smudgeY: sy, tableX: pointer.tableX, t: performance.now() };
          db.put(gst);
        }
      } else {
        recordSwing(force, sx, sy, pointer.tableX);
        if (!owner) db.put(gst);
      }
      pointer = null;
    });
    window.addEventListener('pointercancel', function () { pointer = null; });
  }

  function applyPointer() {
    if (!pointer) return;
    if (owner) game.hostX = clampX(pointer.tableX);
    else gst.x = clampX(pointer.tableX);
  }

  function estimateForce(pressure, dt, sx, sy) {
    var dist = Math.sqrt(sx * sx + sy * sy);
    var fromSwipe = clamp(dist / 140, 0, 1);
    var fromTap = clamp(1.05 - dt / 380, 0.25, 1);
    var p = pressure > 0.05 ? clamp(pressure * 1.2, 0, 1) : 0;
    return clamp(Math.max(fromSwipe, fromTap * 0.7, p), 0.28, 1);
  }

  function recordSwing(force, smudgeX, smudgeY, tableX) {
    var s = { force: force, smudgeX: smudgeX, smudgeY: smudgeY, tableX: tableX, t: performance.now() };
    if (owner) nextSwing.host = s; else gst.swing = s;
  }

  function bindOverlay() {
    readyBtn.addEventListener('click', function () {
      if (overlayMode === 'match' && owner) { newMatch(); return; }
      if (!owner) { gst.ready = true; db.put(gst); }
      else { game.paused = false; game.pausedBy = null; db.put(game); }
      overlay.classList.remove('on');
    });
    resetBtn.addEventListener('click', function () { if (owner) newMatch(); });
  }

  function newMatch() {
    game = freshGame();
    matchOver = false; matchWinner = null; freezeUntil = 0; pendingServer = null;
    rules = { needOwn: false, needOpp: false };
    cpu.serveAt = 0; hitsDone = 0;
    hint.classList.remove('hide');
    overlay.classList.remove('on'); overlayMode = '';
    showBanner('PING PONG', 'first to 11', 1200);
    db.put(game);
  }

  function updateOverlay() {
    var now = Date.now();
    var show = false, title = '', body = '', btn = "I'm ready";
    overlayMode = '';
    if (matchOver) {
      show = true; overlayMode = 'match';
      var iWin = owner ? matchWinner === 'host' : matchWinner === 'guest';
      title = iWin ? 'You win!' : (isCpu() ? 'CPU wins' : 'They win');
      body = game.hostScore + '  —  ' + game.guestScore + '. First to 11, win by 2.';
      btn = owner ? 'Play again' : 'Waiting for host';
      readyBtn.style.display = owner ? '' : 'none';
    } else if (!owner && now - lastStateAt > STATE_TIMEOUT && lastStateAt) {
      show = true; title = 'Connection paused'; body = 'Tap Ready when you are back so you can return the next ball.';
      readyBtn.style.display = '';
    } else if (owner && game.paused && !isCpu()) {
      show = true; title = 'Opponent away'; body = 'Waiting for them to come back online and tap Ready.';
      readyBtn.style.display = 'none';
    }
    overlay.classList.toggle('on', show);
    if (show) { ot.textContent = title; ob.textContent = body; readyBtn.textContent = btn; }
  }

  function updateHud() {
    var servingMe = game.serving && ((owner && game.serving === 'host') || (!owner && game.serving === 'guest'));
    var servingThem = game.serving && !servingMe;
    if (matchOver) statusEl.textContent = 'Match over';
    else if (game.paused) statusEl.textContent = 'Paused';
    else if (servingMe) statusEl.textContent = 'Your serve — tap or swipe';
    else if (servingThem) statusEl.textContent = themName() + ' serving';
    else statusEl.textContent = themName() + '  ·  first to 11';
    canvas.dataset.score = game.hostScore + '-' + game.guestScore;
    canvas.dataset.rally = String(game.rally || 0);
    canvas.dataset.phase = matchOver ? 'match' : (game.serving ? 'serve' : 'rally');
  }

  function showBanner(title, sub, ms) {
    bt.textContent = title;
    bp.textContent = sub || '';
    banner.classList.add('on');
    bannerUntil = Date.now() + (ms || 900);
  }

  function addSpark(x, y, z) { sparks.push({ x: x, y: y, z: z, t: 1 }); }

  var audioCtx = null;
  try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  function playSound(kind) {
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var t = audioCtx.currentTime;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    if (kind === 'paddle') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(980, t); osc.frequency.exponentialRampToValueAtTime(280, t + 0.07);
      gain.gain.setValueAtTime(0.2, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.start(t); osc.stop(t + 0.07);
    } else if (kind === 'smash') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(520, t); osc.frequency.exponentialRampToValueAtTime(140, t + 0.11);
      gain.gain.setValueAtTime(0.28, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.start(t); osc.stop(t + 0.11);
    } else if (kind === 'table') {
      osc.type = 'triangle'; osc.frequency.setValueAtTime(210, t); osc.frequency.exponentialRampToValueAtTime(70, t + 0.09);
      gain.gain.setValueAtTime(0.14, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.start(t); osc.stop(t + 0.09);
    } else if (kind === 'score') {
      osc.type = 'sine'; osc.frequency.setValueAtTime(660, t); osc.frequency.exponentialRampToValueAtTime(990, t + 0.18);
      gain.gain.setValueAtTime(0.12, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.start(t); osc.stop(t + 0.22);
    }
  }

  function p(wx, wy, wz) {
    var y = wy; if (!owner) y = TL - y;
    var t = y / TL;
    var sc = 1 - 0.5 * t;
    var ny = _H * 0.90, fy = _H * 0.14, nw = _W * 0.96;
    return { x: _W / 2 + wx * (nw / TW) * sc, y: ny - t * (ny - fy) - wz * (_H * 0.042) * sc, sc: sc };
  }

  function render() {
    if (Date.now() > bannerUntil) banner.classList.remove('on');
    hitFlash *= 0.85;
    var W = _W, H = _H;
    ctx.clearRect(0, 0, W, H);
    drawArena();
    drawFloor();
    drawTable();
    var myX = owner ? game.hostX : (gst.x != null ? gst.x : game.guestX);
    var myY = owner ? HOST_Y : GUEST_Y;
    var theirX = owner ? game.guestX : game.hostX;
    var theirY = owner ? GUEST_Y : HOST_Y;
    var ballViewY = owner ? game.by : TL - game.by;
    var myViewY = owner ? myY : TL - myY;
    var ballFar = ballViewY > TL * 0.5;
    var ballInFront = !ballFar && ballViewY <= myViewY + 1.1;
    drawPaddle(theirX, theirY, '#1a1a1a', false);
    if (ballFar) drawBall();
    drawNet();
    if (!ballFar && !ballInFront) drawBall();
    drawPaddle(myX, myY, '#d4222a', true);
    if (ballInFront) drawBall();
    drawScores();
    drawSparks();
    requestAnimationFrame(render);
  }

  function drawArena() {
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, _W, _H);
    var g = ctx.createRadialGradient(_W / 2, _H * 0.42, 30, _W / 2, _H * 0.48, _H * 0.8);
    g.addColorStop(0, 'rgba(70,110,170,0.20)');
    g.addColorStop(0.55, 'rgba(20,40,70,0.08)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, _W, _H);
  }

  function drawFloor() {
    var ny = _H * 0.90, fy = _H * 0.14;
    ctx.fillStyle = '#121826';
    ctx.beginPath();
    ctx.moveTo(0, _H); ctx.lineTo(_W, _H);
    ctx.lineTo(_W * 0.78, fy + 24); ctx.lineTo(_W * 0.22, fy + 24);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
    for (var i = 0; i < 8; i++) {
      var t = i / 7;
      var y = ny - t * (ny - fy - 20);
      var w = _W * (0.96 - 0.5 * t);
      ctx.beginPath(); ctx.moveTo(_W / 2 - w / 2, y); ctx.lineTo(_W / 2 + w / 2, y); ctx.stroke();
    }
  }

  function drawTable() {
    var nw = p(-TW / 2, 0, 0), ne = p(TW / 2, 0, 0), se = p(TW / 2, TL, 0), sw = p(-TW / 2, TL, 0);
    var drop = Math.max(16, _H * 0.028);
    ctx.fillStyle = '#082818';
    ctx.beginPath();
    ctx.moveTo(nw.x, nw.y); ctx.lineTo(ne.x, ne.y);
    ctx.lineTo(ne.x + 2, ne.y + drop); ctx.lineTo(nw.x - 2, nw.y + drop);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#061c12';
    ctx.beginPath(); ctx.moveTo(nw.x, nw.y); ctx.lineTo(sw.x, sw.y); ctx.lineTo(sw.x - 8, sw.y + drop * 0.45); ctx.lineTo(nw.x - 2, nw.y + drop); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(ne.x, ne.y); ctx.lineTo(se.x, se.y); ctx.lineTo(se.x + 8, se.y + drop * 0.45); ctx.lineTo(ne.x + 2, ne.y + drop); ctx.closePath(); ctx.fill();

    var sg = ctx.createLinearGradient(0, se.y, 0, nw.y);
    sg.addColorStop(0, '#0c5c30');
    sg.addColorStop(0.45, '#168a44');
    sg.addColorStop(1, '#1eaa54');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.moveTo(nw.x, nw.y); ctx.lineTo(ne.x, ne.y); ctx.lineTo(se.x, se.y); ctx.lineTo(sw.x, sw.y); ctx.closePath(); ctx.fill();

    var gloss = ctx.createLinearGradient(nw.x, 0, ne.x, 0);
    gloss.addColorStop(0, 'rgba(255,255,255,0)');
    gloss.addColorStop(0.35, 'rgba(255,255,255,0.07)');
    gloss.addColorStop(0.5, 'rgba(255,255,255,0.02)');
    gloss.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = gloss;
    ctx.fill();

    ctx.strokeStyle = '#f3f6f1'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(nw.x, nw.y); ctx.lineTo(ne.x, ne.y); ctx.lineTo(se.x, se.y); ctx.lineTo(sw.x, sw.y); ctx.closePath(); ctx.stroke();
    var m1 = p(0, 0, 0.02), m2 = p(0, TL, 0.02);
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke();

    if (!game.serving && game.lastHitter && ((owner && game.vy < 0) || (!owner && game.vy > 0))) {
      var a = p(-TW / 2, owner ? 0.15 : TL - 0.15, 0.03), b = p(TW / 2, owner ? 0.15 : TL - 0.15, 0.03);
      ctx.strokeStyle = 'rgba(255,230,120,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  function drawNet() {
    var n0 = p(-TW / 2, TL / 2, 0), n1 = p(TW / 2, TL / 2, 0);
    var n2 = p(TW / 2, TL / 2, NH), n3 = p(-TW / 2, TL / 2, NH);
    var postL0 = p(-TW / 2 - 0.25, TL / 2, 0), postL1 = p(-TW / 2 - 0.25, TL / 2, NH + 0.15);
    var postR0 = p(TW / 2 + 0.25, TL / 2, 0), postR1 = p(TW / 2 + 0.25, TL / 2, NH + 0.15);
    ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(postL0.x, postL0.y); ctx.lineTo(postL1.x, postL1.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(postR0.x, postR0.y); ctx.lineTo(postR1.x, postR1.y); ctx.stroke();
    ctx.fillStyle = 'rgba(230,230,240,0.12)';
    ctx.beginPath(); ctx.moveTo(n0.x, n0.y); ctx.lineTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y); ctx.lineTo(n3.x, n3.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(230,230,245,0.28)'; ctx.lineWidth = 1;
    var i, a, b;
    for (i = 1; i < 10; i++) {
      a = p(-TW / 2 + TW * i / 10, TL / 2, 0.1); b = p(-TW / 2 + TW * i / 10, TL / 2, NH);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (i = 1; i < 4; i++) {
      a = p(-TW / 2, TL / 2, NH * i / 4); b = p(TW / 2, TL / 2, NH * i / 4);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.strokeStyle = '#f7f7f7'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(n3.x, n3.y); ctx.lineTo(n2.x, n2.y); ctx.stroke();
  }

  function drawPaddle(x, y, rubber, near) {
    var pos = p(x, y, 1.25);
    var sh = p(x, y, 0);
    var sc = pos.sc;
    var rx = (PADW / 2) * 0.78 * (_W * 0.96 / TW) * sc;
    var ry = rx * 1.18;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + (near ? 0.32 : 0.22) + ')';
    ctx.beginPath(); ctx.ellipse(sh.x, sh.y + 4 * sc, rx * 0.95, ry * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(pos.x, pos.y);
    var tilt = (near ? myVx : (cpu.vx || 0)) * 8;
    ctx.rotate(clamp(tilt, -0.35, 0.35));
    ctx.scale(1, 0.78);
    var handle = ry * 0.95;
    ctx.save();
    ctx.rotate(near ? 0.12 : Math.PI + 0.12);
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(-rx * 0.16, ry * 0.72, rx * 0.32, handle);
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(-rx * 0.12, ry * 0.72, rx * 0.24, handle * 0.92);
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#d9b07a'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.88, ry * 0.88, 0, 0, Math.PI * 2);
    ctx.fillStyle = rubber; ctx.fill();
    if (hitFlash > 0.2 && near) {
      ctx.globalAlpha = hitFlash * 0.5;
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath(); ctx.ellipse(-rx * 0.28, -ry * 0.28, rx * 0.28, ry * 0.18, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();
  }

  function drawBall() {
    var b = p(game.bx, game.by, game.bz);
    var s = p(game.bx, game.by, 0);
    var r = Math.max(6.5, BR * 1.45 * (_W * 0.96 / TW) * b.sc);
    var lift = Math.max(0.15, Math.min(1.2, game.bz / 6));
    ctx.fillStyle = 'rgba(0,0,0,' + (0.32 / lift) + ')';
    ctx.beginPath(); ctx.ellipse(s.x, s.y, r * 0.9, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.12, b.x, b.y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#f0f0f2');
    g.addColorStop(1, '#b8b8c4');
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.clip();
    ctx.translate(b.x, b.y); ctx.rotate(game.sp);
    ctx.fillStyle = 'rgba(220, 64, 48, 0.85)';
    ctx.fillRect(-r, -r * 0.16, r * 2, r * 0.32);
    ctx.restore();
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawScores() {
    var my = owner ? game.hostScore : game.guestScore;
    var th = owner ? game.guestScore : game.hostScore;
    var far = p(0, TL * 0.78, 0.05);
    var near = p(0, TL * 0.18, 0.05);
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.font = '800 ' + Math.round(_W * 0.16) + 'px system-ui, sans-serif';
    ctx.fillText(String(th), far.x, far.y);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.font = '800 ' + Math.round(_W * 0.2) + 'px system-ui, sans-serif';
    ctx.fillText(String(my), near.x, near.y);
    ctx.font = '700 ' + Math.round(_W * 0.028) + 'px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText(themName(), far.x, far.y + _W * 0.055);
    ctx.fillText('YOU', near.x, near.y + _W * 0.07);
    ctx.restore();
  }

  function drawSparks() {
    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.t -= 0.08;
      if (s.t <= 0) { sparks.splice(i, 1); continue; }
      var q = p(s.x, s.y, s.z);
      ctx.globalAlpha = s.t;
      ctx.fillStyle = '#fff6c8';
      ctx.beginPath(); ctx.arc(q.x, q.y, 10 * s.t * q.sc, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function resize() {
    var box = document.getElementById('wrap').getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, box.width * dpr);
    canvas.height = Math.max(1, box.height * dpr);
    canvas.style.width = box.width + 'px';
    canvas.style.height = box.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _W = box.width; _H = box.height;
  }
</script>
`;

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

  <div class="card"><h2><span class="emoji">🔧</span>Change any app</h2>
  <p>Every app is yours — free to keep, free to pass on, free to modify and improve. Hand the GIF to any AI and ask for a change. It unpacks what's inside, edits it, and packs it back. You don't need to know how to code.</p></div>

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
    '  * Hand any app GIF to an AI and ask for a change. It unpacks the GIF,',
    '    edits it, and packs it back. You do not need to know how to code.',
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
  const FORTUNE_HTML = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font:16px system-ui;margin:0;background:var(--bg,#0a0a0f);color:var(--text,#e0e0f0);display:flex;flex-direction:column;min-height:100vh}
  header{background:var(--surface,#14141f);border-bottom:1px solid var(--border,#2a2a3f);padding:14px 18px;font-weight:700;color:var(--accent,#ffce6b)}
  main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;max-width:460px;margin:0 auto;box-sizing:border-box}
  .cookie{font-size:52px;line-height:1;filter:drop-shadow(0 6px 14px rgba(255,190,80,.25))}
  /* The paper slip is the fortune's identity — always cream stock, dark ink. */
  .slip{background:#fffdf2;color:#3a3320;border-radius:14px;padding:20px 22px;min-height:56px;width:100%;box-sizing:border-box;
        display:flex;align-items:center;justify-content:center;text-align:center;font-size:18px;line-height:1.5;box-shadow:0 8px 30px rgba(0,0,0,.4)}
  .slip.err{background:#2a1710;color:#ffcbab;border:1px solid #ff8a3d}
  .src{color:var(--muted,#6a6a86);font-size:.72rem;min-height:1em;text-align:center}
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
  <div class="src" id="src"></div>
  <div class="row">
    <button class="go" id="crack">Crack a cookie</button>
    <button id="keep" disabled>Keep it</button>
  </div>
  <div class="kept" id="keptWrap" style="display:none"><h4>Kept fortunes</h4><div id="kept"></div></div>
  <p class="foot">Fortunes come from adviceslip.com over the internet — tap the “Internet” button up top to see or change that. This app never invents a line.</p>
</main>
<script>
  var slip=document.getElementById('slip'),crack=document.getElementById('crack'),keepBtn=document.getElementById('keep');
  var srcEl=document.getElementById('src');
  var keptWrap=document.getElementById('keptWrap'),keptEl=document.getElementById('kept'),current=null,seq=0;
  var db=(window.gifos&&gifos.db)?gifos.db('fortunes'):null;
  function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
  function showKept(items){items=(items||[]).slice().reverse();keptWrap.style.display=items.length?'':'none';
    keptEl.innerHTML=items.map(function(x){return '<div class="k">“'+esc(x.text)+'”</div>';}).join('');}
  if(db)db.subscribe(showKept);
  function whyFail(err){
    var msg=String(err&&err.message||err||'');
    if(!window.gifos||!gifos.fetch) return 'Open this from GifOS to reach the internet. This app will not invent a fortune.';
    if(/Network denied/i.test(msg)) return 'Internet is off for this app. Tap “Internet” in the top bar to allow adviceslip.com. This app will not invent a fortune.';
    if(/timeout/i.test(msg)) return 'adviceslip.com took too long. Try again when you have a better connection.';
    if(/HTTP\\s*\\d+/i.test(msg)) return 'adviceslip.com returned '+(msg.match(/HTTP\\s*\\d+/i)||['an error'])[0]+' — not a fortune.';
    if(/empty|no advice/i.test(msg)) return 'That reply had no advice in it. Try another cookie.';
    return 'Couldn’t reach adviceslip.com. You may be offline. This app will not make a fortune up.';
  }
  function fail(err){current=null;slip.className='slip err';slip.textContent=whyFail(err);srcEl.textContent='';keepBtn.disabled=true;crack.disabled=false;}
  function fetchAdvice(){
    return new Promise(function(resolve,reject){
      var done=false;
      var to=setTimeout(function(){ if(done)return; done=true; reject(new Error('timeout')); }, 8000);
      gifos.fetch('https://api.adviceslip.com/advice?t='+Date.now())
        .then(function(r){ if(done)return; if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(d){ if(done)return; done=true; clearTimeout(to);
          var text=d&&d.slip&&String(d.slip.advice||'').trim(); if(!text) throw new Error('empty'); resolve(text); })
        .catch(function(e){ if(done)return; done=true; clearTimeout(to); reject(e); });
    });
  }
  function crackOne(){
    var n=++seq;
    slip.className='slip';slip.textContent='Asking adviceslip.com…';srcEl.textContent='';keepBtn.disabled=true;crack.disabled=true;current=null;
    if(!window.gifos||!gifos.fetch){fail(new Error('no gifos'));return;}
    fetchAdvice().then(function(text){
      if(n!==seq) return;
      current=text; slip.className='slip'; slip.textContent='“'+text+'”';
      srcEl.textContent='from adviceslip.com'; keepBtn.disabled=!db; crack.disabled=false;
    }, function(err){ if(n!==seq) return; fail(err); });
  }
  crack.onclick=crackOne;
  keepBtn.onclick=function(){if(current&&db){db.put({text:current,t:Date.now()});keepBtn.disabled=true;}};
  if(typeof navigator!=='undefined' && navigator.onLine===false) fail(new Error('offline'));
  else crackOne();
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
  .status button{margin-top:14px;padding:8px 14px;border-radius:9px;border:1px solid var(--rborder);background:var(--rbg);color:var(--rtext);cursor:pointer;font:inherit}
  .banner{background:var(--rchrome);border:1px solid var(--rborder);color:var(--rmuted);font:12.5px system-ui;padding:9px 12px;margin:0 0 16px;border-radius:9px;line-height:1.45}
  #jumper{display:none;gap:8px;align-items:center;flex-wrap:wrap;background:var(--rchrome);border-bottom:1px solid var(--rborder);padding:8px 12px;flex:0 0 auto}
  #jumper.on{display:flex}
  #jumper select,#jumper input{padding:6px 8px;border-radius:8px;border:1px solid var(--rborder);background:var(--rbg);color:var(--rtext);font:inherit}
  #jumper input{width:4.4em}
  #jumper label{color:var(--rmuted);font-size:13px}
  nav button.jump.on{background:var(--rlink);color:var(--rbg);border-color:var(--rlink)}
  .foot{color:var(--rmuted);font-size:.72rem;text-align:center;padding:28px 20px 0;line-height:1.5;opacity:.85}
</style>
<header><span class="ttl">Bible Browser</span><span class="loc" id="loc"></span></header>
<nav>
  <button id="back" title="Back">&lsaquo;</button>
  <button id="fwd" title="Forward">&rsaquo;</button>
  <button id="reload" title="Reload">&#8635;</button>
  <button class="home" id="home">Home</button>
  <button id="prevch" title="Previous chapter" disabled>&laquo;</button>
  <button id="nextch" title="Next chapter" disabled>&raquo;</button>
  <button id="jump" class="jump" title="Jump to a book or chapter">Go</button>
  <button class="follow" id="follow" style="display:none" title="Follow the meeting">Follow</button>
  <span class="sp"></span>
  <span class="grp">
    <button id="smaller" class="chip" title="Smaller text">A&minus;</button>
    <button id="bigger" class="chip" title="Bigger text">A&plus;</button>
    <button id="theme" class="chip" title="Day / night">&#9790;</button>
  </span>
</nav>
<div id="jumper">
  <select id="jbook"></select>
  <label>ch. <input id="jch" type="number" min="1" value="1"></label>
  <button id="jgo">Open</button>
</div>
<main id="main"><div class="status">Fetching the Recovery Version through the GifOS CORS proxy&hellip;</div></main>
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
  // Recently-read pages, PRIVATE: so a chapter you already opened can be re-read
  // on a plane. Never shared — a meeting still fetches (or pools) the live page.
  var pagesDb=hasDb?gifos.db('pages'):null;
  var hist=[], hi=-1, curUrl=HOME, fromCache=false;
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
  function setStatus(msg,err){ main.innerHTML='<div class="status'+(err?' err':'')+'">'+msg+(err?'<p><button type="button" id="retry">Try again</button></p>':'')+'</div>'; }
  function buttons(){ backB.disabled=hi<=0; fwdB.disabled=hi>=hist.length-1; updateChapBtns(); }
  function shortLoc(u){ try{ var x=new URL(u); return (x.pathname+x.search)||'/'; }catch(e){ return u; } }
  function resolve(href, base){ try{ return new URL(href, base).toString(); }catch(e){ return null; } }
  // The Recovery Version's chapter files are NN_Book_N.htm. Chapter counts are
  // the Protestant/RV ones — used only to drive Go / prev / next, never to
  // invent text. A miss just disables the buttons.
  var BOOKS=[{id:'01_Genesis',n:'Genesis',c:50},{id:'02_Exodus',n:'Exodus',c:40},{id:'03_Leviticus',n:'Leviticus',c:27},{id:'04_Numbers',n:'Numbers',c:36},{id:'05_Deuteronomy',n:'Deuteronomy',c:34},{id:'06_Joshua',n:'Joshua',c:24},{id:'07_Judges',n:'Judges',c:21},{id:'08_Ruth',n:'Ruth',c:4},{id:'09_1Samuel',n:'1 Samuel',c:31},{id:'10_2Samuel',n:'2 Samuel',c:24},{id:'11_1Kings',n:'1 Kings',c:22},{id:'12_2Kings',n:'2 Kings',c:25},{id:'13_1Chronicles',n:'1 Chronicles',c:29},{id:'14_2Chronicles',n:'2 Chronicles',c:36},{id:'15_Ezra',n:'Ezra',c:10},{id:'16_Nehemiah',n:'Nehemiah',c:13},{id:'17_Esther',n:'Esther',c:10},{id:'18_Job',n:'Job',c:42},{id:'19_Psalms',n:'Psalms',c:150},{id:'20_Proverbs',n:'Proverbs',c:31},{id:'21_Ecclesiastes',n:'Ecclesiastes',c:12},{id:'22_SongofSongs',n:'Song of Songs',c:8},{id:'23_Isaiah',n:'Isaiah',c:66},{id:'24_Jeremiah',n:'Jeremiah',c:52},{id:'25_Lamentations',n:'Lamentations',c:5},{id:'26_Ezekiel',n:'Ezekiel',c:48},{id:'27_Daniel',n:'Daniel',c:12},{id:'28_Hosea',n:'Hosea',c:14},{id:'29_Joel',n:'Joel',c:3},{id:'30_Amos',n:'Amos',c:9},{id:'31_Obadiah',n:'Obadiah',c:1},{id:'32_Jonah',n:'Jonah',c:4},{id:'33_Micah',n:'Micah',c:7},{id:'34_Nahum',n:'Nahum',c:3},{id:'35_Habakkuk',n:'Habakkuk',c:3},{id:'36_Zephaniah',n:'Zephaniah',c:3},{id:'37_Haggai',n:'Haggai',c:2},{id:'38_Zechariah',n:'Zechariah',c:14},{id:'39_Malachi',n:'Malachi',c:4},{id:'40_Matthew',n:'Matthew',c:28},{id:'41_Mark',n:'Mark',c:16},{id:'42_Luke',n:'Luke',c:24},{id:'43_John',n:'John',c:21},{id:'44_Acts',n:'Acts',c:28},{id:'45_Romans',n:'Romans',c:16},{id:'46_1Corinthians',n:'1 Corinthians',c:16},{id:'47_2Corinthians',n:'2 Corinthians',c:13},{id:'48_Galatians',n:'Galatians',c:6},{id:'49_Ephesians',n:'Ephesians',c:6},{id:'50_Philippians',n:'Philippians',c:4},{id:'51_Colossians',n:'Colossians',c:4},{id:'52_1Thessalonians',n:'1 Thessalonians',c:5},{id:'53_2Thessalonians',n:'2 Thessalonians',c:3},{id:'54_1Timothy',n:'1 Timothy',c:6},{id:'55_2Timothy',n:'2 Timothy',c:4},{id:'56_Titus',n:'Titus',c:3},{id:'57_Philemon',n:'Philemon',c:1},{id:'58_Hebrews',n:'Hebrews',c:13},{id:'59_James',n:'James',c:5},{id:'60_1Peter',n:'1 Peter',c:5},{id:'61_2Peter',n:'2 Peter',c:3},{id:'62_1John',n:'1 John',c:5},{id:'63_2John',n:'2 John',c:1},{id:'64_3John',n:'3 John',c:1},{id:'65_Jude',n:'Jude',c:1},{id:'66_Revelation',n:'Revelation',c:22}];
  function parseChap(u){
    try{ var p=new URL(u).pathname; var m=p.match(/\\/(\\d{2}_[A-Za-z0-9]+)_(\\d+)\\.htm$/); if(!m) return null;
      for(var i=0;i<BOOKS.length;i++) if(BOOKS[i].id===m[1]) return {book:BOOKS[i], ch:+m[2], i:i};
      return null; }catch(e){ return null; }
  }
  function chapUrl(book, ch){ return HOME+book.id+'_'+ch+'.htm'; }
  function niceLoc(u){ var p=parseChap(u); return p?(p.book.n+' '+p.ch):shortLoc(u); }
  function updateChapBtns(){
    var prev=document.getElementById('prevch'), next=document.getElementById('nextch');
    if(!prev||!next) return;
    var p=parseChap(curUrl);
    prev.disabled=!(p&&(p.i>0||p.ch>1));
    next.disabled=!(p&&(p.ch<p.book.c||p.i<BOOKS.length-1));
  }
  function neighbor(dir){
    var p=parseChap(curUrl); if(!p) return null;
    var ch=p.ch+dir, b=p.book, i=p.i;
    if(ch<1){ if(i<=0) return null; b=BOOKS[i-1]; ch=b.c; }
    else if(ch>b.c){ if(i>=BOOKS.length-1) return null; b=BOOKS[i+1]; ch=1; }
    return chapUrl(b,ch);
  }
  function explainErr(e){
    var msg=String((e&&e.message)||e||'');
    if(msg==='NO_GIFOS'||!window.gifos||!gifos.fetch) return 'Open this from GifOS to reach the internet.';
    if(typeof navigator!=='undefined'&&navigator.onLine===false) return 'You are offline, and this page has not been saved on this device yet. Chapters you have already opened can be re-read without a connection.';
    if(/Network denied/i.test(msg)) return 'This app&rsquo;s internet is switched off (the &ldquo;Internet&rdquo; button up top), or '+HOST+' is blocked.';
    if(/HTTP 404/.test(msg)) return 'That address is not on the Recovery Version site.';
    if(/HTTP 429/.test(msg)) return 'The CORS proxy asked us to slow down. Wait a moment and try again.';
    if(/Failed to fetch|NetworkError|Load failed|TypeError/i.test(msg)) return 'Couldn&rsquo;t reach the GifOS CORS proxy or the Bible site. You may be offline.';
    return 'Couldn&rsquo;t load that page.<br><br><small>'+esc(msg)+'</small>';
  }
  // Base for resolving a page's relative links: honour <base href> if present,
  // else the page's own URL. (Old static Bible sites often set <base>, and
  // getting this wrong is what sends chapter links to the wrong file.)
  function baseFor(doc, url){ var b=doc.querySelector('base[href]'); if(b){ var r=resolve(b.getAttribute('href'), url); if(r) return r; } return url; }
  // Fetch + parse one page through the CORS proxy. Returns { doc, url, cached }
  // where url is where the request actually LANDED: the proxy follows redirects
  // server-side (e.g. "nt-outlines" -> "nt-outlines/") and reports the final URL
  // in a header, so a page's relative links resolve against the right directory.
  // Older proxies omit it — then we fall back to the requested URL.
  // A failed live fetch falls back to a PRIVATE copy of a page this device has
  // already opened (so re-reading a chapter works offline). cached:true when so.
  function cachePut(url, html){
    if(!pagesDb||!url||html==null) return;
    pagesDb.put({id:url, html:html, t:Date.now()}).then(function(){ return pagesDb.getAll(); })
      .then(function(rows){ if(!rows||rows.length<=40) return;
        rows.sort(function(a,b){ return (a.t||0)-(b.t||0); });
        for(var i=0;i<rows.length-40;i++) try{ pagesDb.delete(rows[i].id); }catch(e){} })
      .catch(function(){}); }
  function cacheGet(url){
    if(!pagesDb||!url) return Promise.resolve(null);
    return pagesDb.get(url).then(function(r){ return (r&&typeof r.html==='string')?r:null; }).catch(function(){ return null; });
  }
  function fetchDoc(url){ var finalUrl=url;
    return gifos.fetch(url,{proxy:true}).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status+' for '+shortLoc(url));
      var fin=r.headers&&r.headers['x-gifos-final-url']; if(fin){ var a=resolve(fin, url); if(a) finalUrl=a; }
      return r.text(); })
    .then(function(t){ cachePut(finalUrl, t); if(finalUrl!==url) cachePut(url, t);
      return { doc:new DOMParser().parseFromString(t,'text/html'), url:finalUrl, cached:false }; })
    .catch(function(e){
      return cacheGet(url).then(function(hit){
        if(!hit && finalUrl!==url) return cacheGet(finalUrl);
        return hit;
      }).then(function(hit){
        if(!hit) throw e;
        return { doc:new DOMParser().parseFromString(hit.html,'text/html'), url:hit.id, cached:true };
      });
    }); }
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
      if(!same.length) return { root: doc.body || doc.documentElement, url: actual, cached:!!res.cached };
      return Promise.all(same.map(function(fr){
        var src=resolve(fr.getAttribute('src'), base);
        return fetchDoc(src).then(function(fres){
          var fdoc=fres.doc; var fbase=baseFor(fdoc, fres.url); absolutizeAnchors(fdoc, fbase);
          var holder=document.createElement('div'); holder.innerHTML=(fdoc.body?fdoc.body.innerHTML:'');
          if(fr.parentNode) fr.parentNode.replaceChild(holder, fr); else (doc.body||doc.documentElement).appendChild(holder);
        }).catch(function(){ if(fr.parentNode) fr.parentNode.removeChild(fr); });
      })).then(function(){ return { root: doc.body || doc.documentElement, url: actual, cached:!!res.cached }; });
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
    var banner=fromCache?'<div class="banner">Showing a copy saved on this device &mdash; the live fetch through the CORS proxy did not land. Tap &#8635; to try again.</div>':'';
    main.innerHTML='<div class="doc">'+banner+html+'<p class="foot">Text from text.recoveryversion.bible, read through the GifOS CORS proxy &mdash; tap the &ldquo;Internet&rdquo; button up top to see or change that. Chapters you open are saved on this device so you can re-read them offline.</p></div>';
    // Land where the reader (or the meeting) last was on this page, not the top.
    // Re-apply on the next frame: right after innerHTML the new layout isn't
    // flushed yet, so a bare scrollTop set clamps against the old (short) height.
    var f=pendingFrac!=null?pendingFrac:0; pendingFrac=null;
    applyingScroll=true; applyFrac(f);
    requestAnimationFrame(function(){ applyFrac(f); setTimeout(function(){ applyingScroll=false; }, 60); });
    locEl.textContent=niceLoc(curUrl);
    updateChapBtns();
    var p=parseChap(curUrl);
    if(p){ document.getElementById('jbook').value=p.book.id; document.getElementById('jch').value=p.ch; document.getElementById('jch').max=p.book.c; }
  }
  function go(url, push, fromSync, frac){
    curUrl=url; fromCache=false;
    if(push){ hist=hist.slice(0,hi+1); hist.push(url); hi=hist.length-1; }
    buttons(); locEl.textContent=niceLoc(url);
    var offline=typeof navigator!=='undefined'&&navigator.onLine===false;
    setStatus(offline
      ? 'You are offline &mdash; looking for a saved copy of '+esc(niceLoc(url))+'&hellip;'
      : 'Fetching '+esc(niceLoc(url))+' through the GifOS CORS proxy&hellip;');
    if(!window.gifos||!gifos.fetch){ setStatus('Open this from GifOS to reach the internet.', true); return; }
    var want=url, target=(frac==null?0:frac);
    loadPage(url).then(function(res){ if(curUrl!==want) return; curUrl=res.url||url;
        fromCache=!!res.cached; pendingFrac=target; render(res.root); lastFrac=target; saveLast();
        if(!fromSync && follow && !fromCache) pushNav(curUrl, target); })  // my own live move drives the group; a cached fallback does not
      .catch(function(e){ if(curUrl!==want) return; setStatus(explainErr(e), true); });
  }
  main.addEventListener('click', function(e){
    if(e.target&&e.target.id==='retry'){ e.preventDefault(); go(curUrl, false); return; }
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
  document.getElementById('prevch').onclick=function(){ var u=neighbor(-1); if(u) go(u, true); };
  document.getElementById('nextch').onclick=function(){ var u=neighbor(1); if(u) go(u, true); };
  (function fillJump(){
    var sel=document.getElementById('jbook');
    for(var i=0;i<BOOKS.length;i++){ var o=document.createElement('option'); o.value=BOOKS[i].id; o.textContent=BOOKS[i].n; sel.appendChild(o); }
    sel.onchange=function(){ var id=sel.value; for(var i=0;i<BOOKS.length;i++) if(BOOKS[i].id===id){ document.getElementById('jch').max=BOOKS[i].c; if(+document.getElementById('jch').value>BOOKS[i].c) document.getElementById('jch').value=1; } };
  })();
  document.getElementById('jump').onclick=function(){
    var box=document.getElementById('jumper'); var on=box.classList.toggle('on');
    this.classList.toggle('on', on);
    var p=parseChap(curUrl);
    if(p){ document.getElementById('jbook').value=p.book.id; document.getElementById('jch').value=p.ch; document.getElementById('jch').max=p.book.c; }
  };
  document.getElementById('jgo').onclick=function(){
    var id=document.getElementById('jbook').value, ch=+document.getElementById('jch').value||1, b=null;
    for(var i=0;i<BOOKS.length;i++) if(BOOKS[i].id===id) b=BOOKS[i];
    if(!b) return;
    document.getElementById('jumper').classList.remove('on');
    document.getElementById('jump').classList.remove('on');
    go(chapUrl(b, Math.max(1, Math.min(b.c, ch))), true);
  };
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
  .fine{color:#8888aa;font-size:.78rem;margin-top:8px;line-height:1.4}
  audio{width:100%;margin-top:12px}
  canvas.wave{width:100%;height:56px;display:block;margin-top:10px;background:#0a0a0f;border-radius:8px}
  .past{margin-top:8px}
  .past h3{margin:0 0 6px;font-size:.88rem;color:#8888aa;font-weight:600}
  .take{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid #2a2a3f;font-size:.82rem}
  .take:last-child{border-bottom:0}
  .take .when{color:#8888aa;font-variant-numeric:tabular-nums}
  .wait{color:#8888aa}
</style>
<header>Speech Coach</header>
<main>
  <p class="lead">Tap Record. GifOS shows its own mic indicator and records up to 12 seconds; this app receives the finished clip, never a live microphone. Analysis stays on this device — nothing is sent anywhere. Pace is estimated from bursts of sound, not from a transcript: this app does not listen for words.</p>
  <button id="rec">● Record &amp; analyse</button>
  <div id="out"></div>
  <div class="card past" id="hist" style="display:none"><h3>Earlier takes (scores only — the clip is not kept)</h3><div id="hlist"></div></div>
</main>
<script>
const recBtn=document.getElementById('rec'), out=document.getElementById('out');
const histBox=document.getElementById('hist'), hlist=document.getElementById('hlist');
const pad=n=>(n<10?'0':'')+n;
function when(ts){ const d=new Date(ts); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes()); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
let db=null, past=[];
function drawHist(){
  if(!past.length){ histBox.style.display='none'; return; }
  histBox.style.display='';
  hlist.innerHTML=past.slice().reverse().map(t=>'<div class="take"><span>'+esc(t.pace)+' · '+Math.round((t.talk||0)*100)+'% talking · '+t.pauses+' long pause'+(t.pauses===1?'':'s')+'</span><span class="when">'+when(t.ts)+' · '+(t.dur||0).toFixed(1)+'s</span></div>').join('');
}
function paintWave(frames, voiced){
  const c=document.getElementById('wave'); if(!c||!frames.length) return;
  const dpr=window.devicePixelRatio||1, w=c.clientWidth||320, h=c.clientHeight||56;
  c.width=Math.round(w*dpr); c.height=Math.round(h*dpr);
  const g=c.getContext('2d'); g.scale(dpr,dpr); g.clearRect(0,0,w,h);
  const peak=Math.max.apply(null,frames)||1, mid=h/2, bar=Math.max(1, w/frames.length);
  for(let i=0;i<frames.length;i++){
    const mag=Math.max(1, (frames[i]/peak)*mid*0.92);
    g.fillStyle=voiced[i]?(getComputedStyle(document.body).getPropertyValue('--accent').trim()||'#7b5cff'):(getComputedStyle(document.body).getPropertyValue('--border').trim()||'#2a2a3f');
    g.fillRect(i*bar, mid-mag, Math.max(1,bar-0.4), mag*2);
  }
}
function analyse(buf){
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
  const talkDur=voicedFrac*dur, wpm=talkDur>0.3?Math.round(bursts/talkDur*60):0;
  const bps=bursts/(dur||1), pace=bps<2.2?'measured':bps>4.2?'quick':'steady';
  const tips=[];
  if(dur<1.2) tips.push('That was very short — try a sentence or two so there is something to measure.');
  if(voicedFrac<0.08) tips.push('Almost no voice landed on the clip. Speak closer to the mic, or check GifOS still has the microphone allowed for this app.');
  else if(voicedFrac<0.45) tips.push('Lots of silence — fill it with confident delivery, or trim the dead air.');
  if(pauses>=3) tips.push('Several long pauses — a few land, too many lose the room.');
  if(cv>0.7) tips.push('Volume swings a lot — even it out so every word lands.');
  if(pace==='quick') tips.push('You’re quick — slow down on key points to let them sink in.');
  if(pace==='measured'&&voicedFrac>0.6) tips.push('Lovely measured pace — great for clarity.');
  if(!tips.length) tips.push('Well balanced — clear pace, steady volume, natural pauses.');
  return {dur,voicedFrac,pauses,pace,cv,wpm,bursts,frames,voiced,tips};
}
function card(a, url, vsLast){
  const vol=a.cv<0.4?'steady':a.cv<0.7?'ok':'uneven';
  const wpmLine=a.wpm?('<div class="metric"><span>Estimated pace</span><b>~'+a.wpm+' bursts/min</b></div>'):'';
  const delta=vsLast?('<div class="fine">Versus your last take: talking '+(a.voicedFrac>vsLast.talk?'up':'down')+' from '+Math.round(vsLast.talk*100)+'%, pace was '+esc(vsLast.pace)+'.</div>'):'';
  return '<div class="card"><h3>Your delivery</h3>'+
    '<div class="metric"><span>Length</span><b>'+a.dur.toFixed(1)+'s</b></div>'+
    '<div class="metric"><span>Talking vs silence</span><b>'+Math.round(a.voicedFrac*100)+'% talking</b></div>'+
    '<div class="metric"><span>Long pauses</span><b>'+a.pauses+'</b></div>'+
    '<div class="metric"><span>Pace</span><b>'+a.pace+'</b></div>'+wpmLine+
    '<div class="metric"><span>Volume</span><b>'+vol+'</b></div>'+
    '<canvas class="wave" id="wave"></canvas>'+
    '<div class="tip">'+a.tips.join(' ')+'</div>'+
    '<div class="fine">Bursts/min is counted from loud-vs-quiet, not words. This app never transcribes you.</div>'+delta+
    (url?'<audio controls src="'+url+'"></audio>':'')+'</div>';
}
async function keep(a){
  const rec={id:'t'+Date.now().toString(36), ts:Date.now(), dur:a.dur, talk:a.voicedFrac, pauses:a.pauses, pace:a.pace, cv:a.cv, wpm:a.wpm};
  past.push(rec); if(past.length>8) past=past.slice(-8);
  if(db){ try{ await db.put(rec);
    const all=await db.getAll();
    if(all&&all.length>8){ all.sort((x,y)=>(x.ts||0)-(y.ts||0)); for(let i=0;i<all.length-8;i++) try{ await db.delete(all[i].id); }catch(e){} }
  }catch(e){} }
  drawHist();
}
recBtn.onclick=async()=>{
  if(!window.gifos||!gifos.recordAudio){ out.innerHTML='<div class="card">Open this inside GifOS to use the microphone. GifOS records behind its own indicator; this app never sees a live mic.</div>'; return; }
  recBtn.disabled=true; out.innerHTML='<div class="card wait">GifOS is opening its recorder. Speak when the red indicator says it is capturing — tap <b>Stop &amp; use</b> there when you are done (it also stops at 12 seconds).</div>';
  try{
    const clip=await gifos.recordAudio({maxSeconds:12});
    out.innerHTML='<div class="card wait">Analysing the clip on this device…</div>';
    const AC=window.AudioContext||window.webkitAudioContext; const ctx=new AC();
    const buf=await ctx.decodeAudioData(clip.bytes.slice(0));
    const a=analyse(buf);
    const url=URL.createObjectURL(new Blob([clip.bytes],{type:clip.mime||'audio/webm'}));
    const last=past[past.length-1]||null;
    out.innerHTML=card(a,url,last);
    requestAnimationFrame(function(){ paintWave(a.frames, a.voiced); });
    await keep(a); ctx.close();
  }catch(e){
    const msg=String((e&&e.message)||e||'');
    if(/cancel/i.test(msg)) out.innerHTML='<div class="card">Recording cancelled. Nothing was kept.</div>';
    else if(/denied|Permission/i.test(msg)) out.innerHTML='<div class="card">The microphone was denied. Allow it when the browser asks, and leave it on in this app’s Abilities chip.</div>';
    else if(/turned .*off|Abilities/i.test(msg)) out.innerHTML='<div class="card">'+esc(msg)+'</div>';
    else out.innerHTML='<div class="card">Couldn’t record: '+esc(msg)+'</div>';
  }
  recBtn.disabled=false;
};
(async()=>{
  if(!window.gifos||!gifos.db) return;
  db=gifos.db('takes');
  try{ const rows=await db.getAll(); past=(rows||[]).filter(r=>r&&r.ts).sort((a,b)=>(a.ts||0)-(b.ts||0)).slice(-8); drawHist(); }catch(e){}
})();
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
  // fall out of step with them, and the only way a chat leaves this device is
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
  .m.streaming::after{content:'▍';margin-left:1px;animation:blink 1s step-end infinite;color:#7b5cff}
  @keyframes blink{50%{opacity:0}}
  .acts{display:flex;gap:6px;padding:0 4px}
  .acts button{padding:3px 8px;border-radius:7px;border:1px solid #2a2a3f;background:#14141f;color:#8888aa;font:inherit;font-size:.72rem;cursor:pointer}
  .acts button:hover{color:#e0e0f0}
  .stamp{color:#8888aa;font-size:.72rem;padding:0 4px;font-variant-numeric:tabular-nums}
  .note{color:#8888aa;font-size:.88rem;padding:16px 18px;line-height:1.5}
  .pick{display:flex;gap:6px;padding:0 18px 8px}
  .pick button{padding:6px 12px;border-radius:999px;border:1px solid #2a2a3f;background:#14141f;color:#8888aa;font-size:.8rem;cursor:pointer}
  .pick button.on{background:#7b5cff;color:#fff;border-color:#7b5cff}
  form{display:flex;gap:8px;padding:12px 18px;border-top:1px solid #2a2a3f;align-items:flex-end}
  #t{flex:1;padding:11px 12px;border:1px solid #2a2a3f;border-radius:9px;background:#1c1c2b;color:#e0e0f0;font:inherit;min-height:42px;max-height:160px;resize:vertical;line-height:1.4}
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
<form id="f"><textarea id="t" placeholder="Ask anything… (Enter to send, Shift+Enter for a new line)" autocomplete="off" rows="1"></textarea><button id="send">Send</button></form>
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
function copyBtn(text){
  const a=document.createElement('div'); a.className='acts';
  const b=document.createElement('button'); b.type='button'; b.textContent='Copy';
  b.onclick=async()=>{ try{ await navigator.clipboard.writeText(text); b.textContent='Copied'; setTimeout(()=>{ b.textContent='Copy'; },1200); }catch(e){ b.textContent='Couldn’t copy'; } };
  a.appendChild(b); return a;
}
function draw(r){
  const row=document.createElement('div'); row.className='row '+(r.role==='user'?'you':'ai');
  const b=document.createElement('div'); b.className='m '+(r.role==='user'?'you':'ai'); if(r.error) b.classList.add('err');
  b.textContent=r.content||'';
  const s=document.createElement('div'); s.className='stamp'; s.textContent=metaOf(r);
  row.appendChild(b); row.appendChild(s);
  if(r.role==='assistant'&&r.content&&!r.error) row.appendChild(copyBtn(r.content));
  log.appendChild(row); bottom();
  return {bubble:b, stamp:s, row:row};
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
  if(!(m.available||[]).includes('cheapest')&&!(m.available||[]).includes('smartest')){
    const n=note('No language model is set up on this computer yet. Send a question — GifOS will walk you through wiring one. The key stays in your browser; this app never sees it.');
    const b=document.createElement('button'); b.textContent='Set up a model'; b.style.cssText='display:block;margin-top:10px;padding:6px 12px;border-radius:8px;border:1px solid #2a2a3f;background:#14141f;color:#e0e0f0;font:inherit;font-size:.82rem;cursor:pointer';
    b.onclick=()=>{ if(gifos.aiSetup) gifos.aiSetup(model); };
    n.appendChild(b);
  }
})();
input.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); document.getElementById('f').requestSubmit(); }
});
document.getElementById('f').onsubmit=async e=>{
  e.preventDefault(); const q=input.value.trim(); if(!q||busy)return; input.value='';
  busy=true; sendBtn.disabled=true;
  const u={id:uid(),conv:conv,seq:++seq,role:'user',content:q,ts:Date.now()};
  hist.push(u); draw(u); save(u);
  const a={id:uid(),conv:conv,seq:++seq,role:'assistant',content:'',ts:Date.now(),model:model};
  const el=draw(a); el.bubble.textContent='…'; el.bubble.classList.add('streaming');
  const t0=Date.now(); let first=null, streamed='';
  try{
    const r=await gifos.ai.chat({model:model,messages:context(),onDelta:piece=>{
      if(first===null){ first=Date.now()-t0; a.firstMs=first; el.bubble.textContent=''; }
      streamed+=piece; el.bubble.textContent=streamed; el.stamp.textContent=metaOf(a); bottom();
    }});
    a.content=((r&&r.text)||streamed||'(no answer)');
    a.ms=Date.now()-t0;
    if(r&&r.streamed===false&&first===null) a.firstMs=undefined;
    el.bubble.textContent=a.content;
  }catch(err){
    const msg=String((err&&err.message)||err||'');
    el.bubble.classList.remove('streaming');
    // GifOS already popped its own setup sheet. Do not also paint a
    // NOT_CONFIGURED bubble — that string is for machines, not people.
    if(/NOT_CONFIGURED/.test(msg)){
      el.row.remove(); seq--;
      note('GifOS is asking you to set up a model. Come back and send again once it is wired.');
      busy=false; sendBtn.disabled=false; input.focus(); return;
    }
    a.error=true; a.content='⚠ '+msg; a.ms=Date.now()-t0;
    el.bubble.classList.add('err'); el.bubble.textContent=a.content;
  }
  el.bubble.classList.remove('streaming');
  el.stamp.textContent=metaOf(a);
  if(a.content&&!a.error) el.row.appendChild(copyBtn(a.content));
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
  #script{flex:1;margin:14px 18px 8px;padding:12px 13px;border:1px solid #2a2a3f;border-radius:10px;background:#1c1c2b;color:#e0e0f0;line-height:1.55;overflow:auto;display:none;white-space:pre-wrap}
  #script .sent{border-radius:4px}
  #script .sent.on{background:color-mix(in srgb,#7b5cff 28%,transparent);outline:1px solid #7b5cff}
  .bar{display:flex;gap:8px;align-items:center;padding:10px 18px 8px;flex-wrap:wrap}
  select{padding:9px 10px;border:1px solid #2a2a3f;border-radius:9px;background:#14141f;color:#e0e0f0;font:inherit}
  .bar button{padding:11px 16px;border:0;border-radius:9px;background:#7b5cff;color:#fff;font-weight:700;cursor:pointer}
  .bar button:disabled{opacity:.5;cursor:default}
  .bar button.ghost{background:#14141f;border:1px solid #2a2a3f;color:#e0e0f0;font-weight:400}
  #status{color:#8888aa;font-size:.82rem;padding:0 18px 8px;min-height:1.1em}
  .hint{color:#8888aa;font-size:.78rem;padding:0 18px 10px;line-height:1.4}
  .note{color:#8888aa;font-size:.88rem;padding:0 18px 12px;line-height:1.5}
</style>
<header>📖 Reader<span class="sp"></span><span id="wc" style="color:#8888aa;font-weight:400;font-size:.78rem"></span></header>
<textarea id="text" placeholder="Paste or type anything here, then press Read aloud."></textarea>
<div id="script"></div>
<div class="bar">
  <select id="voice" title="A hint for the voice this computer uses. On-device voices have their own names and ignore this.">
    <option value="">Default — this computer’s voice</option>
    <option value="nova">Nova (if the provider knows it)</option>
    <option value="shimmer">Shimmer (if the provider knows it)</option>
    <option value="fable">Fable (if the provider knows it)</option>
    <option value="echo">Echo (if the provider knows it)</option>
    <option value="onyx">Onyx (if the provider knows it)</option>
    <option value="alloy">Alloy (if the provider knows it)</option>
  </select>
  <button id="read">🔊 Read aloud</button>
  <button id="pause" class="ghost" style="display:none">⏸ Pause</button>
  <button id="stop" class="ghost" style="display:none">■ Stop</button>
</div>
<div class="hint">Named voices are a hint to a cloud TTS. An on-device voice uses its own names and ignores these.</div>
<div id="status"></div>
<div class="note" id="note" style="display:none"></div>
<script>
const T=document.getElementById('text'), V=document.getElementById('voice');
const readBtn=document.getElementById('read'), stopBtn=document.getElementById('stop'), pauseBtn=document.getElementById('pause');
const status=document.getElementById('status'), note=document.getElementById('note');
const script=document.getElementById('script'), wc=document.getElementById('wc');
let db=null, playing=false, session=0, paused=false;
function say(m){ status.textContent=m||''; }
function wordsOf(t){ return String(t||'').trim()?String(t).trim().split(/\\s+/).length:0; }
function countWords(){ const n=wordsOf(T.value); wc.textContent=n?(n+' word'+(n===1?'':'s')):''; }
T.addEventListener('input',()=>{ countWords(); remember(); });
V.addEventListener('change',remember);
function remember(){ if(db) db.put({id:'current',text:T.value,voice:V.value}).catch(()=>{}); }
function showScript(on){ script.style.display=on?'block':'none'; T.style.display=on?'none':'block'; }
function fillScript(sents){
  script.innerHTML=sents.map((s,i)=>'<span class="sent" data-i="'+i+'">'+s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</span>').join(' ');
}
function markSent(from,to){
  Array.prototype.forEach.call(script.querySelectorAll('.sent'), function(el){
    const i=+el.getAttribute('data-i'); el.classList.toggle('on', i>=from && i<to);
  });
  const on=script.querySelector('.sent.on'); if(on) try{ on.scrollIntoView({block:'nearest'}); }catch(e){}
}
// Sentence-ish chunks (~600 chars) so the first audio arrives fast and long
// reads never hit a provider's per-request ceiling.
function playBytes(r){ return new Promise((res,rej)=>{
  const url=URL.createObjectURL(new Blob([r.bytes],{type:r.mime||'audio/mpeg'}));
  const a=new Audio(url); window.__cur=a; paused=false; pauseBtn.textContent='⏸ Pause';
  a.onended=()=>{ URL.revokeObjectURL(url); if(window.__cur===a) window.__cur=null; res(); };
  a.onerror=()=>{ URL.revokeObjectURL(url); if(window.__cur===a) window.__cur=null; rej(new Error('could not play the audio')); };
  a.play().catch(rej);
}); }
pauseBtn.onclick=()=>{
  const a=window.__cur; if(!a) return;
  if(paused){ a.play().catch(()=>{}); paused=false; pauseBtn.textContent='⏸ Pause'; say('Reading…'); }
  else { a.pause(); paused=true; pauseBtn.textContent='▶ Resume'; say('Paused.'); }
};
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
  const budget=budgetNow(first); let cur='', start=i;
  while(i<sents.length&&(!cur||(cur+' '+sents[i]).length<=budget)){ cur=cur?cur+' '+sents[i]:sents[i]; i++; }
  return {text:cur,from:start,next:i};
}
async function readAloud(){
  const text=T.value.trim(); if(!text){ say('Nothing to read yet.'); return; }
  const my=++session; playing=true; paused=false;
  readBtn.style.display='none'; stopBtn.style.display=''; pauseBtn.style.display='';
  remember();
  const sents=sentencesOf(text); msPerChar=0;
  fillScript(sents); showScript(true);
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
      const span={from:cut.from, next:cut.next}; cut=after; n++;
      if(!playing||my!==session) break;
      markSent(span.from, span.next);
      say('Reading… sentence '+(span.from+1)+'–'+span.next+' of '+sents.length);
      await playBytes(audio);
      if(!next) break;
    }
    if(playing&&my===session) say('Done.');
  }catch(err){
    const msg=String((err&&err.message)||err||'');
    if(/NOT_CONFIGURED/.test(msg)) say('GifOS is asking you to set up Text → speech. Come back and press Read aloud once it is wired.');
    else say('⚠ '+msg);
  }
  playing=false; paused=false; showScript(false);
  readBtn.style.display=''; stopBtn.style.display='none'; pauseBtn.style.display='none';
}
readBtn.onclick=readAloud;
stopBtn.onclick=()=>{ playing=false; session++; paused=false; if(window.__cur){ try{ window.__cur.pause(); }catch(e){} window.__cur=null; } showScript(false); say('Stopped.'); readBtn.style.display=''; stopBtn.style.display='none'; pauseBtn.style.display='none'; };
(async()=>{
  if(!window.gifos||!gifos.ai){ note.style.display=''; note.innerHTML='Open this inside GifOS to use it.'; return; }
  db=gifos.db('texts');
  db.get('current').then(d=>{ if(d&&d.text&&!T.value) T.value=d.text; if(d&&typeof d.voice==='string') V.value=d.voice; countWords(); }).catch(()=>{});
  countWords();
  const m=await gifos.ai.models().catch(()=>({available:[]}));
  if(!(m.available||[]).includes('tts')){
    note.style.display='';
    note.innerHTML='No <b>Text → speech</b> is set up on this computer yet. Press <b>Read aloud</b> and GifOS will walk you through wiring a voice — a Provider app on this device, or an endpoint. This app never sees a key.';
    const b=document.createElement('button'); b.textContent='Set up a voice'; b.style.cssText='display:block;margin-top:10px;padding:6px 12px;border-radius:8px;border:1px solid #2a2a3f;background:#14141f;color:#e0e0f0;font:inherit;font-size:.82rem;cursor:pointer';
    b.onclick=()=>{ if(gifos.aiSetup) gifos.aiSetup('tts'); };
    note.appendChild(b);
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
  // to play it, or Download it back out as a real file. Delete moves an item
  // into the Deleted category (still in media/blobs); a second Delete, behind
  // a warning, removes the records for good. All local.
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
  #selbar{display:none;gap:6px;align-items:center;padding:6px 10px;flex-wrap:wrap;border-bottom:1px solid var(--border,#2a2a3f);background:var(--surface,#14141f)}
  #selbar.on{display:flex}
  #seln{font-weight:700;font-size:.82rem}
  #catpick{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.82);z-index:34;padding:16px}
  #catpick .box{max-width:360px}
  #catpick .picks{display:flex;flex-wrap:wrap;gap:6px}
  #catpick .picks button{padding:6px 10px}
  .seg{display:inline-flex;border:1px solid var(--border,#2a2a3f);border-radius:8px;overflow:hidden}
  .seg button{padding:4px 9px;border:0;background:transparent;color:var(--muted,#8888aa);font-size:.78rem}
  .seg button.on{background:var(--accent,#ff7850);color:var(--onaccent,#2a1000);font-weight:700}
  select{font:inherit;font-size:.78rem;padding:4px 8px;border-radius:8px;border:1px solid var(--border,#2a2a3f);background:var(--surface,#1c1c2b);color:var(--text,#e0e0f0)}
  #count{margin-left:auto;color:var(--muted,#8888aa);font-size:.72rem}
  #grid{flex:1;overflow-y:auto;padding:8px 10px;display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px;align-content:start}
  .card{position:relative;background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:9px;overflow:hidden;cursor:pointer;transition:transform .1s}
  .card:active{transform:scale(.97)}
  .card.on{outline:2px solid var(--accent,#ff7850);outline-offset:-1px}
  .sel{position:absolute;top:0;left:0;width:44px;height:44px;z-index:3;display:flex;align-items:center;justify-content:center;margin:0;padding:0;background:transparent;border:0;cursor:pointer}
  .sel input{width:20px;height:20px;margin:0;accent-color:var(--accent,#ff7850);pointer-events:none}
  .thumb{position:relative;aspect-ratio:1/1;background:#0c0c14 center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:26px}
  .thumb .kind{position:absolute;top:4px;left:40px;background:rgba(0,0,0,.55);border-radius:5px;padding:0 5px;font-size:10px}
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
  .gifrange-track{position:absolute;left:0;right:0;top:50%;height:8px;margin-top:-4px;background:var(--border,#2a2a3f);border-radius:4px;z-index:0}
  .gifrange-fill{position:absolute;top:0;bottom:0;z-index:1;touch-action:none;cursor:grab;background:color-mix(in srgb,var(--accent,#ff7850) 22%,transparent)}
  .gifrange-fill:after{content:'';position:absolute;left:0;right:0;top:50%;height:8px;margin-top:-4px;background:var(--accent,#ff7850);border-radius:4px;pointer-events:none}
  .gifrange-h{position:absolute;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:var(--accent,#ff7850);border:3px solid #fff;box-shadow:0 1px 8px #0007;z-index:2;touch-action:none;cursor:grab}
  #giftimes{display:flex;justify-content:space-between;font-size:.78rem;color:var(--muted,#8888aa)}
  #gifbudget{font-size:.82rem;font-weight:650}
  #gifbudget.warn{color:#ff9a9a}
  #gifspeeds{width:100%}
  #gifspeeds button{flex:1;min-width:44px;padding:8px 2px}
  #gifgo:disabled{opacity:.45}
  #delwarn{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.82);z-index:35;padding:16px}
  #delwarn .box{max-width:360px}
  #delwarn-msg{font-size:.95rem;line-height:1.45}
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
<div id="selbar">
  <span id="seln">0 selected</span>
  <button class="btn ghost" id="selall">Select all</button>
  <button class="btn" id="selcat">Categorize</button>
  <button class="danger" id="seldel">Delete</button>
  <button class="btn ghost" id="selclear">Clear</button>
</div>
<div id="grid"></div>
<div id="empty"><div class="big" id="empty-icon">🎞️</div><div><b id="empty-title">No media yet</b></div><div class="sub" id="empty-sub" style="margin-top:.4rem">Tap <b>＋ Add</b> to import photos, audio or video — or drop files anywhere.</div></div>
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
      <div class="gifrange-track"></div>
      <div class="gifrange-fill" id="giffill"></div>
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
<div id="delwarn"><div class="box"><div class="info">
  <div id="delwarn-msg"></div>
  <div class="row"><button class="danger" id="mdel-confirm">Delete forever</button><button class="btn ghost" id="mdel-cancel">Cancel</button></div>
</div></div></div>
<div id="catpick"><div class="box"><div class="info">
  <div class="sub">Move to a category — or type a new one. From Deleted, this puts items back in the library.</div>
  <div class="picks" id="catpick-list"></div>
  <div class="row"><input type="text" id="catpick-new" placeholder="New category"><button class="btn" id="catpick-go">Apply</button></div>
  <div class="row"><button class="btn ghost" id="catpick-cancel">Cancel</button></div>
</div></div></div>
<script src="gifenc.js"></script>
<script>
  var media = gifos.db('media'), blobs = gifos.db('blobs');
  var MAX = 25 * 1024 * 1024;
  var items = [], fType = 'all', fCat = 'all', curUrl = null, cur = null, owner = false;
  var pendingForever = null, selected = {};
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
  function isDeleted(m){ return /^deleted$/i.test((m&&m.category)||''); }
  function canonCat(c){
    c=String(c==null?'':c).trim();
    if(!c) return 'Unsorted';
    if(/^deleted$/i.test(c)) return 'Deleted';
    return c;
  }
  function categories(){
    var s={};
    items.forEach(function(m){ if(m.category && !isDeleted(m)) s[m.category]=1; });
    return Object.keys(s).sort();
  }
  function refreshCats(){
    var sel=document.getElementById('cat'); sel.innerHTML='<option value="all">All categories</option>';
    categories().forEach(function(c){ var o=document.createElement('option'); o.value=c; o.textContent=c; sel.appendChild(o); });
    var del=document.createElement('option'); del.value='Deleted'; del.textContent='Deleted'; sel.appendChild(del);
    if(fCat!=='all' && fCat!=='Deleted' && categories().indexOf(fCat)<0) fCat='all';
    sel.value=fCat;
    var dl=document.getElementById('cats'); dl.innerHTML='';
    categories().forEach(function(c){ var o=document.createElement('option'); o.value=c; dl.appendChild(o); });
    var dlo=document.createElement('option'); dlo.value='Deleted'; dl.appendChild(dlo);
  }
  function render(){
    refreshCats();
    var list=items.filter(function(m){
      if(fType!=='all' && m.type!==fType) return false;
      if(fCat==='Deleted') return isDeleted(m);
      return !isDeleted(m) && (fCat==='all' || m.category===fCat);
    }).sort(function(a,b){ return (b.at||0)-(a.at||0); });
    var live=0, bin=0;
    items.forEach(function(m){ if(isDeleted(m)) bin++; else live++; });
    var tot=fCat==='Deleted'?bin:live;
    document.getElementById('count').textContent = tot ? (list.length+' of '+tot) : '';
    if(list.length){
      gEmpty.style.display='none';
      grid.style.display='grid';
    }else{
      grid.style.display='none';
      gEmpty.style.display='flex';
      var ic=document.getElementById('empty-icon');
      var ti=document.getElementById('empty-title');
      var su=document.getElementById('empty-sub');
      if(!items.length){
        ic.textContent='🎞️';
        ti.textContent='No media yet';
        su.innerHTML='Tap <b>＋ Add</b> to import photos, audio or video — or drop files anywhere.';
      }else if(fCat==='Deleted'){
        ic.textContent='🗑️';
        ti.textContent='Nothing in Deleted';
        su.textContent='Items you Delete land here. Delete again to remove them for good.';
      }else if(!live && bin){
        ic.textContent='🎞️';
        ti.textContent='Nothing here — '+bin+' in Deleted';
        su.textContent='Open Deleted from the category list to see them.';
      }else{
        ic.textContent='🎞️';
        ti.textContent='Nothing here';
        su.textContent='Try a different type or category.';
      }
    }
    var keep={}; items.forEach(function(m){ keep[m.id]=1; });
    for(var k in selected) if(!keep[k]) delete selected[k];
    grid.innerHTML = list.map(function(m){
      var bg = m.thumb ? 'style="background-image:url('+m.thumb+')"' : '';
      var face = m.thumb ? (m.type!=='image'?'<div class="play">▶</div>':'') : ('<span>'+(KIND[m.type]||'📄')+'</span>');
      var shared = isVisible(m) ? '<span class="shared" title="Visible to invited guests">👁</span>' : '';
      var catLabel = isDeleted(m) ? 'Deleted' : (m.category||'Unsorted');
      var on=!!selected[m.id];
      return '<div class="card'+(on?' on':'')+'" data-id="'+m.id+'"><button type="button" class="sel" aria-label="Select"><input type="checkbox" class="pick"'+(on?' checked':'')+' tabindex="-1"></button>'+
        '<div class="thumb" '+bg+'><span class="kind">'+(KIND[m.type]||'')+'</span>'+shared+face+'</div>'+
        '<div class="meta"><div class="nm">'+esc(m.name)+'</div><span class="cat">'+esc(catLabel)+'</span></div></div>';
    }).join('');
    updateSelBar();
  }
  function selectedItems(){ return items.filter(function(m){ return !!selected[m.id]; }); }
  function updateSelBar(){
    var n=0; for(var k in selected) if(selected[k]) n++;
    var bar=document.getElementById('selbar');
    if(n){ bar.classList.add('on'); document.getElementById('seln').textContent=n+' selected'; }
    else bar.classList.remove('on');
  }
  function clearSelection(){
    selected={};
    Array.prototype.forEach.call(grid.querySelectorAll('.card'), function(c){
      c.classList.remove('on');
      var cb=c.querySelector('.pick'); if(cb) cb.checked=false;
    });
    updateSelBar();
  }
  media.subscribe(function(rows){ items=(rows||[]).filter(function(r){ return r&&r.id&&r.type; }); render(); });

  // ---- open one: fetch its blob, pick the right player ----
  grid.addEventListener('pointerdown', function(e){
    if(e.target.closest && e.target.closest('.sel')) e.stopPropagation();
  }, true);
  grid.addEventListener('click', function(e){
    var sel=e.target.closest?e.target.closest('.sel'):null;
    if(sel){
      e.preventDefault(); e.stopPropagation();
      var card=sel.closest('.card'); if(!card) return;
      var id=card.getAttribute('data-id');
      if(selected[id]) delete selected[id]; else selected[id]=1;
      var on=!!selected[id];
      card.classList.toggle('on', on);
      var cb=sel.querySelector('.pick'); if(cb) cb.checked=on;
      updateSelBar();
      return;
    }
    var c=e.target.closest?e.target.closest('.card'):null;
    if(c) openItem(c.getAttribute('data-id'));
  });
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
    document.getElementById('mcat').value = isDeleted(m) ? 'Deleted' : (m.category||'');
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
    document.getElementById('mdel').textContent = isDeleted(m) ? 'Delete forever' : 'Delete';
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
    var cat=canonCat(document.getElementById('mcat').value);
    if(cat==='Deleted' && !isDeleted(cur)){
      try{
        await media.put(Object.assign({}, cur, { name:name, category:'Deleted' }));
        toast('Moved to Deleted');
        closeModal();
      }catch(e){ toast('You can only remove your own items.'); }
      return;
    }
    try{
      await media.put(Object.assign({}, cur, { name:name, category:cat }));
      toast('Saved'); cur.name=name; cur.category=cat;
    }catch(e){ toast('You can only recategorize your own items.'); }
  };
  function hideDelWarn(){
    pendingForever=null;
    document.getElementById('delwarn').style.display='none';
  }
  function showDelWarn(list){
    pendingForever=list||[];
    var msg;
    if(pendingForever.length===1){
      var nm=pendingForever[0].name||'this item';
      msg='This deletes "'+nm+'" for good. It cannot be undone.';
    }else{
      msg='This deletes '+pendingForever.length+' items for good. It cannot be undone.';
    }
    document.getElementById('delwarn-msg').textContent=msg;
    document.getElementById('delwarn').style.display='flex';
  }
  async function deleteForever(list){
    try{
      for(var i=0;i<list.length;i++){
        await media.delete(list[i].id);
        try{ await blobs.delete(list[i].id); }catch(e){}
      }
      toast(list.length>1 ? ('Deleted '+list.length+' items') : 'Deleted for good');
    }catch(e){ toast('You can only remove your own items.'); }
  }
  document.getElementById('mdel').onclick=async function(){
    if(!cur) return;
    if(isDeleted(cur)){ showDelWarn([cur]); return; }
    var m=cur;
    closeModal();
    try{
      await media.put(Object.assign({}, m, { category:'Deleted' }));
      toast('Moved to Deleted');
    }catch(e){ toast('You can only remove your own items.'); }  // a guest can't delete the host's shared media
  };
  document.getElementById('mdel-cancel').onclick=function(){ hideDelWarn(); };
  document.getElementById('mdel-confirm').onclick=async function(){
    var list=pendingForever||[];
    hideDelWarn();
    closeModal();
    if(list.length) await deleteForever(list);
    clearSelection();
  };
  document.getElementById('selall').onclick=function(){
    Array.prototype.forEach.call(grid.querySelectorAll('.card'), function(c){
      var id=c.getAttribute('data-id'); if(!id) return;
      selected[id]=1; c.classList.add('on');
      var cb=c.querySelector('.pick'); if(cb) cb.checked=true;
    });
    updateSelBar();
  };
  document.getElementById('selclear').onclick=clearSelection;
  document.getElementById('seldel').onclick=async function(){
    var list=selectedItems();
    if(!list.length) return;
    if(fCat==='Deleted' || list.every(isDeleted)){ showDelWarn(list); return; }
    try{
      for(var i=0;i<list.length;i++){
        if(isDeleted(list[i])) continue;
        await media.put(Object.assign({}, list[i], { category:'Deleted' }));
      }
      toast(list.length===1 ? 'Moved to Deleted' : 'Moved '+list.length+' to Deleted');
      clearSelection();
    }catch(e){ toast('You can only remove your own items.'); }
  };
  function hideCatPick(){ document.getElementById('catpick').style.display='none'; }
  function openCatPick(){
    var list=document.getElementById('catpick-list'); list.innerHTML='';
    function addBtn(name){
      var b=document.createElement('button');
      b.type='button'; b.className='btn ghost'; b.textContent=name;
      b.onclick=function(){ applyCat(name); };
      list.appendChild(b);
    }
    addBtn('Unsorted');
    categories().forEach(function(c){ if(c!=='Unsorted') addBtn(c); });
    document.getElementById('catpick-new').value='';
    document.getElementById('catpick').style.display='flex';
  }
  async function applyCat(name){
    name=canonCat(name);
    var list=selectedItems();
    if(!list.length){ hideCatPick(); return; }
    try{
      for(var i=0;i<list.length;i++){
        await media.put(Object.assign({}, list[i], { category:name }));
      }
      hideCatPick();
      toast(name==='Deleted'
        ? (list.length===1 ? 'Moved to Deleted' : 'Moved '+list.length+' to Deleted')
        : 'Saved');
      clearSelection();
    }catch(e){ toast('You can only recategorize your own items.'); }
  }
  document.getElementById('selcat').onclick=openCatPick;
  document.getElementById('catpick-cancel').onclick=hideCatPick;
  document.getElementById('catpick-go').onclick=function(){
    var n=document.getElementById('catpick-new').value.trim();
    if(!n){ toast('Type a category or pick one.'); return; }
    applyCat(n);
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
    var rg=document.getElementById('gifrange');
    if(rg){ rg.setAttribute('data-start', gifStart.toFixed(3)); rg.setAttribute('data-end', gifEnd.toFixed(3)); }
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
    var moved=false, downX=0, grabT=0, grabStart=0, grabEnd=0;
    function tFromX(clientX){
      var r=range.getBoundingClientRect();
      var x=r.width? (clientX-r.left)/r.width : 0;
      var d=rangeDur();
      return Math.max(0, Math.min(d, x*d));
    }
    function down(e, h){
      if(gifBusy) return;
      e.preventDefault(); e.stopPropagation();
      which=h; moved=true;
      try{ e.currentTarget.setPointerCapture(e.pointerId); }catch(err){}
      move(e);
    }
    function downWin(e){
      if(gifBusy) return;
      e.preventDefault(); e.stopPropagation();
      which='w'; moved=false; downX=e.clientX;
      grabT=tFromX(e.clientX); grabStart=gifStart; grabEnd=gifEnd;
      try{ range.setPointerCapture(e.pointerId); }catch(err){}
    }
    function move(e){
      if(which==null) return;
      if(which==='w'){
        if(!moved && Math.abs(e.clientX-downX)<5) return;
        moved=true;
        var t=tFromX(e.clientX), d=rangeDur(), span=grabEnd-grabStart;
        var ns=grabStart+(t-grabT);
        if(ns<0) ns=0;
        if(ns+span>d) ns=Math.max(0, d-span);
        gifStart=ns; gifEnd=ns+span;
        var v=stageMedia();
        if(v) try{ v.currentTime=gifStart+(grabT-grabStart); }catch(err){}
        updateGifUI();
        return;
      }
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
    function up(e){
      if(which==null) return;
      var was=which, did=moved;
      which=null; moved=false;
      if(was==='w' && !did){
        var t=tFromX(e.clientX);
        var v=stageMedia(); if(v) try{ v.currentTime=t; }catch(err){}
        return;
      }
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
    range.addEventListener('pointermove', move);
    range.addEventListener('pointerup', up);
    range.addEventListener('pointercancel', up);
    range.addEventListener('pointerdown', function(e){
      if(gifBusy) return;
      if(e.target.id==='gifh0'||e.target.id==='gifh1') return;
      var t=tFromX(e.clientX);
      var onFill=e.target.id==='giffill' || (t>=gifStart && t<=gifEnd);
      if(onFill){ downWin(e); return; }
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
    var dot=n.lastIndexOf('.');
    if(dot>0 && n.length-dot<=5) n=n.slice(0,dot);
    n=n.replace(/[\\/?%*:|"<>]/g,'-').replace(/\\s+/g,' ').trim()||'file';
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
    function copyAb(){ return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength); }
    var sr=0;
    if(bytes.length>36){
      var riff=String.fromCharCode(bytes[0],bytes[1],bytes[2],bytes[3]);
      var wave=String.fromCharCode(bytes[8],bytes[9],bytes[10],bytes[11]);
      if(riff==='RIFF' && wave==='WAVE') sr=bytes[24]|(bytes[25]<<8)|(bytes[26]<<16)|(bytes[27]<<24);
    }
    var OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
    if(OAC && sr>=8000 && sr<=96000){
      try{
        var off=new OAC(1, 1, sr);
        var buf=await off.decodeAudioData(copyAb());
        if(buf&&buf.length) return buf;
      }catch(e){}
    }
    var AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) throw new Error('This browser cannot decode audio.');
    var ctx=new AC();
    try{
      var live=await ctx.decodeAudioData(copyAb());
      if(!live||!live.length) throw new Error('Could not decode the audio.');
      return live;
    }catch(err){
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
    fType=b.getAttribute('data-t'); Array.prototype.forEach.call(this.children, function(c){ c.classList.toggle('on', c===b); }); selected={}; render(); });
  document.getElementById('cat').onchange=function(){ fCat=this.value; selected={}; render(); };
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
  .ghost.wide{width:auto;min-width:48px;padding:0 16px;border-radius:24px;font-weight:650;white-space:nowrap}
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
    <button class="ghost wide" id="mmbtn" title="Open My Media">🖼️ My Media</button>
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
    var m=shot.mode||'';
    if(shot.kind==='video' || (shot.mime||'').indexOf('video/')===0) return 'Video · '+t;
    if((shot.mime||'')==='image/gif'){
      if(m==='burst') return 'Burst · '+t;
      if(m==='boomerang') return 'Boomerang · '+t;
      if(m==='slowmo') return 'Slow-mo · '+t;
      if(m==='timelapse') return 'Time-lapse · '+t;
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
    // Every capture arrives through onShot the moment it is taken and is saved
    // RIGHT THEN — closing the studio (or a crash) can no longer lose a shot.
    // The resolved value is just the last capture, already saved; it only
    // paints the stage.
    var saved=0;
    try{
      var last=await gifos.camera({ mode:lastMode }, function(shot){
        if(shot&&shot.mode) lastMode = shot.mode;
        saved++;
        putShot(shot);
      });
      if(last && last.thumb){
        var st=document.getElementById('stage');
        st.innerHTML='<img alt=""><div id="hint"></div>';
        st.querySelector('img').src=last.thumb;
        document.getElementById('hint').textContent=(saved>1?saved+' captures saved to My Media':'Saved to My Media')+' — tap My Media below to see them';
      }
    }catch(e){
      var m=String(e&&e.message||e);
      if(!/cancel/i.test(m)) toast(m.slice(0,90));
    }
  }
  document.getElementById('shutter').onclick=function(){ openStudio(); };
  document.getElementById('mmbtn').onclick=function(){
    gifos.library.open().catch(function(e){ toast(String(e&&e.message||e).slice(0,90)); });
  };
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
    const VAR_APPS = { tictactoe: 1, connect4: 1, minesweeper: 1, chess: 1, pingpong: 1, calc: 1, chat: 1, timer: 1, fortune: 1, bible: 1, paint: 1, notes: 1, guestbook: 1 };
    // OS Help markdown packed into each seeded GIF. Filled per appId; a
    // missing entry still shows Help (the OS fallback for Invite/Save/Steal).
    const SAMPLE_HELP = {
      tictactoe: `# Tic-Tac-Toe

Get three of your mark in a row — across, down, or diagonal. Whose turn it is is the glowing seat, not just a sentence.

## Play

Tap an empty square. **X** always starts the first game of a series; after that the starter alternates. Keys **1–9** place a mark too (top row is 1 2 3).

## Solo or a friend

- **Alone:** you play both marks. Pass the device, or just play both sides.
- **Invite** (top bar): send the link. When a friend is here, the first tap on a turn claims that seat, so you lock to **X** or **O**. Then you only move on your turn.

## New game

**New game** clears the board but keeps the series score and who starts.

- Alone, a finished game (or an empty board) starts at once. Mid-game it asks you to confirm so a stray tap does not wipe a close game.
- With a friend it sends them a request. They tap **Start new game** or **Keep playing**. You can **Cancel request** while you wait. A move on the board cancels a pending request.

## Saved

The board, whose turn it is, the seats, and the series (**X / O / draws**) live in this icon. Close it and come back — you are still mid-game.
`,
      connect4: `# Connect Four

Drop discs down a seven-wide, six-high grid. First to four in a row — across, down, or diagonal — wins. Whose turn it is is the glowing seat.

## Play

Tap any disc in a column to drop yours to the lowest empty slot. **Red** starts the first game of a series; then the starter alternates. Keys **1–7** pick a column.

## Solo or a friend

- **Alone:** you play both colours. Pass the device.
- **Invite** (top bar): send the link. When a friend is here, the first drop on a turn claims that colour, then you only move on your turn.

## New game

**New game** clears the grid but keeps the series score and who starts.

- Alone, a finished game (or an empty grid) starts at once. Mid-game it asks you to confirm so a stray tap does not wipe the board.
- With a friend they must accept. **Cancel request** while you wait. A drop cancels a pending request.

## Saved

The grid, turn, seats, and series (**red / yellow / draws**) live in this icon.
`,
      minesweeper: `# Minesweeper

Clear the board without hitting a mine. Numbers are how many mines touch that square. Clear every safe square and everyone wins.

## Densities

- **Easy** — 9×9, 10 mines
- **Medium** — 10×10, 15 mines (the default)
- **Hard** — 16×16, 40 mines
- **Expert** — 30×16, 99 mines

The face (or a density chip) starts a new board. Mid-game it asks first so a stray tap does not wipe a close one. The clock starts on the first tap; a best time per density is kept in this icon.

## Controls

- **Tap** a covered square to open it. Opening a mine ends the game.
- The first tap is always safe (and so are its neighbours).
- **Long-press** a square to plant or remove a flag. On a computer, right-click does the same.
- **Flag mode**: when it is on, a tap flags instead of opening — handy on a phone.
- **Tap a number** whose flags already match to open the rest (a chord). Wrong flags still blow up.

## Play together

This is co-op, not versus. **Invite** a friend and you share one board: their opens and flags show up on yours. A flag remembers who planted it.

## Saved

The board, mines, flags, density, clock, and whether you have won or lost live in this icon.
`,
      chess: `# Chess Tournament

Play the computer right now, or run a single-elimination bracket with friends from one Invite link. No account. The file is the save.

## Vs computer

**Play the computer** starts a game against an onboard engine (Easy / Medium / Hard). It works offline — nothing leaves this GIF. Pick White, Black, or random. **Hint** is still there if you have a Smartest model in Settings; the engine itself never needs the network.

## Tournament

1. **Invite** (top bar) is how friends appear in the lobby. You are joined automatically.
2. Set **Time control** (no clock, bullet, blitz, or rapid) and whether to **Shuffle the bracket seeding**. These lock once play starts. **Add a computer** fills a seat.
3. Anyone taps **Start tournament** when two or more players are in. Winners advance until one champion remains. An odd player gets a bye.
4. **New tournament** from the bracket returns everyone to the lobby.

## A match

Tap a match to play or watch. Tap one of your pieces, then a highlighted square (dots are empty landings, rings are captures). Castling, en passant, and promotion all work. A pawn that reaches the far rank asks which piece you want. Check is named on the status line; checkmate wins, stalemate is a draw (Rematch to advance). **Resign** concedes.

The board turns so you sit at the bottom. **← Bracket** goes back without ending the game. Clocks (if you chose one) run on your turn; flag fall loses the match.

**Hint** asks the computer’s Smartest model for your best legal move. You need that model set up in Settings. Spectators and the player whose turn it is not do not see Hint.

## Saved

The whole tournament — lobby, settings, boards, clocks, and results — lives in this icon.
`,
      pingpong: `# Ping Pong

Table tennis from your end of the table. First to 11, win by 2. Serve changes every two points (every point at 10–10).

## Controls

- **Move** — slide one finger (or the mouse) to move your paddle. The paddle is live: if the ball meets it, it returns. You do not have to tap the ball.
- **Serve** — when it is your serve the ball floats on your paddle. Tap or swipe toward the table to send it. A legal serve bounces on your side first, then theirs.
- **Aim / spin** — hit the ball off-centre to angle it. A swipe as you make contact adds pace and spin (the stripe on the ball shows the spin).

A miss, a shot into the net, a shot that never lands on their side, or a double bounce on one side is a point.

## Solo or a friend

- **Alone:** you are the near end, a computer plays the far end. It returns honest shots and can be wrong-footed.
- **Invite** (top bar): a friend gets the far end on their phone, looking the other way down the table. If they drop off, the table pauses until they tap **I'm ready**.
- Only the host sees **New game**.

## Saved

The score, ball, and paddles live in this icon. Close and reopen and you are still on the table.
`,
      paint: `# Paint

A sketch pad. The picture lives in this icon, so Save (top bar) is how you take it with you, and **Invite** is how a friend draws on the same page.

## Draw

Drag on the page to paint. The bar along the top is:

- **Brush** — freehand ink (keyboard **B**)
- **Eraser** — lift ink off the page (**E**)
- **Fill** — flood a region with the current colour (**G**)
- **Eyedropper** — tap the page to pick a colour already on it (**I**)

Tap a swatch, or the colour chip, to change ink. The slider is brush size (**[** / **]**).

## Undo

**Undo** / **Redo** (or Ctrl+Z / Ctrl+Shift+Z) walk back through your strokes. **Clear** wipes the whole page for everyone — it asks first, and it cannot be undone after you confirm.

## Together

On your own it is a sketchbook. **Invite** and you share one page: their strokes land on yours as they draw. Anyone can Clear.

## Saved

Every stroke is stored in this icon. Close it and the picture is still here. A doodle from the old 16×16 pad still opens as the base layer you can paint over.
`,
      notes: `# Notes

A notebook that lives in this icon. Save (top bar) takes the notes with you; **Invite** shares the list.

## Write

Type a line at the top and tap **Add** — or open a note and keep typing. Each note is as long as you want. Search at the top of the window.

Tap a note to open it. Tick the box to check it off. The trash removes it for everyone.

Each note shows who wrote it (your screen name from this computer).

## Private vs shared

On your own Home Screen these notes are yours. **Invite** (top bar) and everyone in the room can add, edit, check, and delete. There is no “only I edit” switch — if you need a private list, do not send the link.

## Saved

Every keystroke is saved in this icon. Close the tab and they are still here.
`,
      calc: `# Calculator

A graphing calculator. Type an expression on the left; the graph is on the right. Plain arithmetic still answers under the row (\`= 7\`). Hover or tap the graph to read values off a curve.

## Expressions

Tap **+ expression** (or press Enter) for a new row. Examples:

- \`2+2\` — a number
- \`y = x^2\` — a curve
- \`r = sin(3 theta)\` — polar
- \`x^2 + y^2 = 4\` — implicit
- \`y > x\` — a shaded region
- \`a = 1\` — a slider (drag, or tap ▶ to animate)
- \`(1, 2)\` — a point

Tap a row’s colour dot to hide that plot. The trash deletes the row. The keypad inserts π, e, θ, powers, roots, and functions without hunting the keyboard.

## Graph

Drag to pan, pinch or scroll to zoom. **+** / **−** zoom, **⌂** resets the view. Hover (or tap, on a phone) traces each curve at that x. Polar plots get a polar grid.

On a phone, **Graph** / **List** switch between the plot and the expression list.

## Private vs shared

**Invite** shares the expression list, so a class graphs together. Your pan and zoom stay on this device.

## Saved

Expressions are saved in this icon. Your last view is remembered here too, and is not sent with an Invite.
`,
      timer: `# Stopwatch

A stopwatch with laps, and a countdown, on this device only.

## Stopwatch

The default tab. **Start** runs, **Stop** holds the time, **Start** again continues. While it is running, **Lap** marks a split. After you stop, that same button is **Reset** and clears the time and the laps.

The display is hours (when needed), minutes, seconds, and hundredths — \`00:00.00\`. The current lap sits under the digits. Completed laps list newest first. With two or more laps, the fastest is green and the slowest is red.

The stopwatch and the countdown run independently. Switching tabs does not reset either one.

## Timer

Switch to **Timer**. Tap **+1 min**, **+5 min**, **+10 min**, or **+10 s** to add time — chips do nothing while it is running — then **Start**. **Pause** holds what is left. It beeps when it hits zero and the digits flash until you **Reset**.

## Saved

The time, whether it is running, and the laps live in this icon, so closing the tab does not throw them away. A running clock keeps counting while it is closed. **Invite** does not share a clock; each person has their own.
`,
      fortune: `# Fortune

Crack a cookie for a short piece of advice from the internet.

## Use it

**Crack a cookie** asks adviceslip.com for a new line. **Keep it** adds the current one to **Kept fortunes** at the bottom.

The Keep button stays off until a crack actually returns advice, so you cannot save a blank slip or the same one twice in a row.

Fortunes come from adviceslip.com. This app never invents a line. If you are offline, the site is down, the request times out, or you have turned this app’s **Internet** off in the top bar, the slip says so in those words.

## Private vs shared

On your own, kept fortunes are yours. **Invite** shares the kept list, so a room can collect them together. The slip on screen is just what you last cracked — it is not a chat.

## Saved

Kept fortunes live in this icon. Closing the app does not lose the list.
`,
      bible: `# Bible Browser

Read the Recovery Version of the Bible. Pages come from the Recovery Version site over the internet.

## Navigate

**Home** opens the table of contents. Tap a book or chapter. In-page links stay inside this reader. **‹** / **›** are back and forward; the reload button fetches the page again.

**A−** / **A+** change type size. The moon/sun button switches night and day. Those reading prefs are yours alone.

## Read together

**Invite** (top bar) and you share a meeting. **Following** (on by default once someone else is here) means when anyone turns a page or scrolls, the others come along. Tap it to **Follow** off if you want to peek without moving the group. The host can lock the room so only they lead.

**Go** jumps to a book and chapter. **«** / **»** turn the chapter.

Pages come through the GifOS CORS proxy (the Recovery Version site sends no CORS headers, so a direct fetch is blocked). You need the internet and this app’s **Internet** allowed for a first open.

## Offline

Chapters you have already opened are saved in this icon. Re-open them without a connection; a banner says when you are looking at a saved copy, not a live page. A chapter nobody on this device has opened yet cannot be invented.

In a meeting, people share the live download (pool) so the site is hit once.

## Saved

Your last page, scroll, theme, and type size are remembered in this icon. Saved chapters and the shared meeting position are remembered too.
`,
      speechcoach: `# Speech Coach

Record up to 12 seconds of yourself talking. The clip is measured on this device for pace, pauses, and volume — it does not leave the phone.

## Use it

Tap **Record & analyse**. GifOS shows its own recorder (red indicator). Speak, then tap **Stop & use** there — or wait 12 seconds. This app receives the finished clip, never a live microphone.

You get:

- length
- talking vs silence
- long pauses
- pace (measured / steady / quick)
- estimated bursts per minute (from loud-vs-quiet, not from words — this app does not transcribe)
- whether volume stays even
- a waveform of this take

Play the clip back from the card. Record again for another take.

## Saved

Scores from the last eight takes are remembered in this icon (so you can see if you sped up). The recording itself is not kept after you close the app.

## Private vs shared

This is a personal coach. Invite does not send your recording or scores.
`,
      askai: `# Ask AI

A private chat with the language models you set up on this computer.

## Talk

Type and tap **Send**. Pick **Cheapest** or **Smartest** under the thread — that is which model answers.

**＋ New chat** starts a fresh thread and keeps the old one. **🕘 History** lists every chat; search by any word you asked or were told. Delete a chat only from History, and only after you confirm.

## You need a model

If nothing is set up, send a question (or tap **Set up a model**) and GifOS will walk you through wiring Cheapest or Smartest. This app never sees your key.

## Private vs shared

Chats stay on this device. An Invite does not show anyone your history.

## Saved

Every message is kept in this icon until you delete that chat.
`,
      reader: `# Reader

Paste or type text, then hear it read aloud.

## Use it

Put text in the box. Tap **Read aloud**. **Pause** holds the current sentence; **Stop** cuts it off. The sentence being spoken is highlighted.

Long passages start speaking on the first sentence, then continue in chunks so it does not stall.

**Default** uses whatever voice this computer has set up. Named voices (Nova, Shimmer, and the rest) are a hint to a cloud TTS — an on-device voice has its own names and ignores them.

The text and the voice hint are remembered in this icon. Open Reader tomorrow and the box is still filled.

## You need a voice

This uses the computer’s **Text → speech**. Press Read aloud (or **Set up a voice**) and GifOS will walk you through wiring one — a Provider app on this device, or an endpoint. Until one is set up, it cannot start.

## Private vs shared

Your text stays on this device. **Invite** does not read it to anyone else.
`,
      guestbook: `# Guestbook

A shared wall of short messages.

## Sign

Type something and tap **Sign**. You sign as your screen name (set on this computer).

The stamp row inserts an emoji into the box; you can mix stamps with words.

Newest entries sit at the top, with when they were signed. There is no edit and no delete — treat it like a real guest book.

## Play together

On your own it is a private wall, and the header says **just you — Invite**. **Invite** (top bar) and send the link. Friends appear in the header as they join, and their names and lines show up for all of you.

## Saved

Every signature lives in this icon. Close it and the wall is still here.
`,
      chat: `# Chat

A live room for text, photos, and files.

## Send

Type and tap **Send**, or tap a quick emoji under the thread. **📎** attaches a photo or file. Images shrink to fit; attachments cap at 256 KB — for bigger files, share them in a Meeting instead.

**✨** drafts a reply with *your* AI into the box as the words arrive; it never sends. Edit it, then Send. You need a model in Settings for that button to work. If AI is off in Abilities, the box says so instead of pretending.

Your own lines show a clock while they travel, a check when the host has them, and a warning you can tap to resend if they did not land.

## Play together

On your own the header says **just you — Invite**. **Invite** (top bar) and send the link. Friends appear in the header and share one thread. The ✨ draft uses each person’s own model, never the host’s.

## Saved

Messages and attachments live in this icon.
`,
      welcome: `# Welcome

A short tour of this computer, plus a checklist that proves your stuff lives in the icon.

## Read

Cards cover the basics:

- Apps are GIFs you can send, with your work inside
- **Invite** is how you play together
- **IRL Games** is for game night (**Single Phone** when only one device is in the room)
- **＋ Add** is how you make an app
- **Steal** copies one you like
- The GifOS menu (top-left) backs up the whole Home Screen as one file

## Try it

Check items off (looked around, opened an app, invited a friend, made an app, backed up). Close this tab, open Welcome again — the ticks are still there. That is your data inside the icon.

The checklist is yours alone. **Invite** does not share it.
`,
      camera: `# Camera

Take photos and short clips. Everything you shoot is saved into **My Media**, not kept only here.

## Capture

Tap the shutter to open the camera. Shoot a still, or switch modes in that view for video, burst, boomerang, slow-mo, or time-lapse.

Each shot is saved the moment you take it, even if you close the camera right after.

Allow the camera (and microphone, for video) if asked, and leave them on in this app’s Abilities chip. If this computer has no camera, you will see that instead of a viewfinder.

## Recents

The film strip is your latest shots. Tap one to preview. **🖼️ My Media** opens the full library to rename, download, or delete. **🎞️** jumps to the newest item.

## Privacy

Your library is private. Inviting someone to Camera does not show them your roll. To let a guest see a shot, open it in **My Media** and turn on **Visible to invited guests**.
`,
      mymedia: `# My Media

Your private library of photos, audio, and video.

## Add

**＋ Add** picks files, or drop them onto the window. **📷** / **🎙** / **🎬** capture straight in (if this computer can). Items over 25 MB will not import.

Filter by type or category. Tap a card to open it. Check the corner to select several, then **Categorize** or **Delete**.

## Open an item

Rename it, set a category, **Download** it out, **Flip** a photo or video, **Clip** or **Reverse** audio/video, or **Make GIF** from a video (trim, pick a speed, go).

**Delete** moves it to the **Deleted** category. Open Deleted and delete again (you will be asked) to remove it for good.

## Privacy

The whole library is private. **Invite** does not show guests anything until you, the owner, open an item and flip **Visible to invited guests**. Then they can see and steal that one item. Guests cannot make your items visible, and their own captures stay private.

## Saved

Everything lives in this icon.
`,
      meet: `# Meeting

Tap this icon to open the built-in **Meeting** page — video, audio, chat, and apps in a call with people you invite.

## What tapping does

This is not an ordinary app you run in a tab. Meetings need the camera and microphone, so GifOS opens its trusted Meeting page instead of running a GIF here.

From that page you start or join a room, share a link, and can even run an app inside the call.

Use the Home Screen again when you are done.

## Camera and mic

Allow them when the browser asks. You can mute or stop video from the meeting controls. Ordinary apps on the Home Screen are not given that access.

## Saved

A meeting is live, not a file in this icon. Your Home Screen is unchanged when you leave the call.
`,
      broadcast: `# Broadcast

Tap this icon to open the built-in **Broadcast** page — you on stage, as many viewers as you like, and chat as the back channel.

## What tapping does

This is not an ordinary app you run in a tab. Going live needs the camera and microphone, so GifOS opens its trusted Broadcast page instead of running a GIF here.

From that page you go live and share the link. Viewers watch; they talk in chat.

Use the Home Screen again when you are done.

## Camera and mic

Allow them when the browser asks if you are the one on stage. Viewers do not need a camera. Ordinary apps on the Home Screen are not given that access.

## Saved

A broadcast is live, not a file in this icon. Your Home Screen is unchanged when you leave.
`,
      appstore: `# App Store

Tap this icon to open the built-in **App Store** — more apps to install onto this Home Screen.

## What tapping does

This is not an ordinary app you run in a tab. Installing writes to your Home Screen, so GifOS opens its trusted Store page instead of running a GIF here.

Browse listings, read each app’s Help, and tap Install. The new icon lands on this computer.

Use the Home Screen again when you are done.

## What you get

Installed apps are GIFs like the ones already on your desktop. They keep their own saved work.

You can Steal, Save, or trash them later like any other icon.

The Store itself does not keep a shopping cart in this icon.
`,
    };
    const app = (name, appId, accent, html, extra) => {
      extra = extra || {};
      const help = extra.help || SAMPLE_HELP[appId] || '';
      const rest = Object.assign({}, extra);
      delete rest.help;
      const files = {
        'manifest.json': manifest(appId, name, accent, rest),
        'index.html': themeHtml(html, VAR_APPS[appId] ? 'vars' : 'full'),
      };
      if (help) files['help.md'] = help;
      return { name: name + '.gif', appId, accent, files };
    };
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
        // 3D table tennis: finger tracks paddle, hits are automatic, first to 11.
        // Host runs physics; guest sends paddle + serve via gifos.db('pingpong').
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
        app('Stopwatch', 'timer', [255, 120, 120], TIMER_HTML, { capabilities: { db: true }, data: { clock: PRIV } }),
        // The one app that reaches out: it declares exactly the site it needs,
        // so opening it demonstrates the network acknowledgement on a real app.
        app('Fortune', 'fortune', [255, 206, 107], FORTUNE_HTML, { capabilities: { db: true, network: ['api.adviceslip.com'] }, data: { fortunes: RW } }),
        // Reads the Recovery Version through the GifOS CORS proxy — a live demo
        // of gifos.fetch({ proxy:true }) against a real, public, non-CORS site.
        // Three collections, three visibilities: the shared reading position
        // (nav, read-write and leadable so the host can "only I lead"), who's
        // here (presence, read-write heartbeats), and each reader's OWN theme +
        // font size + last page (prefs, private — never leaves their tab).
        app('Bible Browser', 'bible', [200, 162, 75], BIBLE_HTML, { capabilities: { db: true, multiplayer: true, network: ['text.recoveryversion.bible'], pool: ['text.recoveryversion.bible'] },
          data: { nav: RW, presence: RW, prefs: PRIV, pages: PRIV }, lead: [{ collection: 'nav', id: 'nav' }] }),
        // Showcases the brokered capabilities: a mic clip analysed on-device,
        // and the computer's own AI models. Both declare what they use.
        app('Speech Coach', 'speechcoach', [123, 92, 255], SPEECHCOACH_HTML, { capabilities: { db: true, microphone: true, network: [] }, data: { takes: PRIV } }),
        // Typed ai declaration (it uses exactly these two roles): the ack
        // sheet then shows a status line PER ROLE — including naming a
        // Provider app when one serves it — instead of the bare generic row.
        app('Ask AI', 'askai', [123, 92, 255], ASKAI_HTML, { capabilities: { db: true, ai: ['cheapest', 'smartest'], network: [] }, data: { chat: PRIV, prefs: PRIV } }),
        // The consumer half of the Provider story (docs/providers.md): reads
        // any pasted text through the brokered Text → speech role — served by
        // an endpoint OR an installed Provider app (e.g. Offline Text to Speech),
        // interchangeably. Saved text is personal, never shared.
        app('Reader', 'reader', [255, 170, 90], READER_HTML, { capabilities: { db: true, ai: ['tts'], network: [] }, data: { texts: PRIV } }),
      ] },
      { name: 'Social', apps: [
        app('Guestbook', 'guestbook', [255, 92, 170], GUESTBOOK_HTML, { capabilities: { db: true, multiplayer: true }, data: { entries: RW, presence: RW } }),
        // The "✨ AI draft" button uses YOUR OWN AI model/key (from Settings),
        // brokered locally per person — declares ai so the runtime allows it.
        app('Chat', 'chat', [92, 220, 180], CHAT_HTML, { capabilities: { db: true, multiplayer: true, ai: ['cheapest', 'smartest'], network: [] }, data: { messages: RW, files: RW, presence: RW } }),
      ] },
      // Party games where the phone just facilitates — dealing secrets,
      // keeping time, counting votes — and the action happens in person.
      // Top level: everyone joins from their own phone via Invite. The
      // pass-the-phone versions live in a "Single Phone" subfolder.
      { name: 'IRL Games',
        // Each own-phone game shares one heartbeat collection ('party'): the
        // game doc + everyone's player docs, all read-write. (The Single Phone
        // versions run on one device, so they need no shared visibility.)
        apps: (GifOS.irl ? GifOS.irl.netApps : []).map((g) => app(g.name, g.appId, g.accent, g.html, Object.assign({ data: { party: RW }, help: g.help }, g.manifest))),
        sub: [{ name: 'Single Phone',
          apps: (GifOS.irl ? GifOS.irl.apps : []).map((g) => app(g.name, g.appId, g.accent, g.html, Object.assign({ help: g.help }, g.manifest || {}))) }] },
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
    const withHelp = (appId, files) => {
      if (SAMPLE_HELP[appId]) files['help.md'] = SAMPLE_HELP[appId];
      return files;
    };
    const loose = [{
      name: 'Welcome.gif', appId: 'welcome', accent: [92, 200, 255],
      files: withHelp('welcome', { 'manifest.json': manifest('welcome', 'Welcome', [92, 200, 255], { data: { welcome: PRIV } }), 'index.html': themeHtml(WELCOME_HTML, 'full'), 'README.txt': WELCOME_README }),
    }, {
      // Home Screen shutter, between Welcome and My Media. Declares camera +
      // microphone; the live stream stays in the trusted parent (camera-studio).
      name: 'Camera.gif', appId: 'camera', accent: [40, 40, 48],
      files: withHelp('camera', { 'manifest.json': manifest('camera', 'Camera', [40, 40, 48], { capabilities: { db: true, camera: true, microphone: true },
               data: { roll: PRIV } }),
               'index.html': themeHtml(CAMERA_HTML, 'vars') }),
    }, {
      // A personal media library, on the Home Screen under Camera. Declares
      // microphone + camera so you can capture straight in (honours the per-app
      // Abilities opt-out); the app hand-authors its theming, so 'vars' mode.
      name: 'My Media.gif', appId: 'mymedia', accent: [255, 120, 80],
      files: withHelp('mymedia', { 'manifest.json': manifest('mymedia', 'My Media', [255, 120, 80], { capabilities: { db: true, microphone: true, camera: true },
               // Your library is PRIVATE by default — nothing rides along an
               // invite. Per item, you "make visible" (setVisibility → read-only)
               // so an invited guest can see and steal that ONE item; the blob
               // bytes are opted in the same way. Guests keep their own captures
               // private (they can't promote what isn't the host's to share).
               data: { media: PRIV, blobs: PRIV } }),
               'index.html': themeHtml(MYMEDIA_HTML, 'vars'),
               'gifenc.js': GIFENC_JS }),
    }, {
      name: 'Meeting.gif', appId: 'meet', accent: [92, 160, 255],
      files: withHelp('meet', { 'manifest.json': manifest('meet', 'Meeting', [92, 160, 255], { system: 'meet' }),
               'index.html': themeHtml(MEET_FALLBACK_HTML, 'full') }),
    }, {
      // Meeting's sibling: the same trusted page wearing the broadcast skin
      // (run.html#bc=1) — one host on the Stage, unlimited viewers, chat.
      name: 'Broadcast.gif', appId: 'broadcast', accent: [255, 92, 120],
      files: withHelp('broadcast', { 'manifest.json': manifest('broadcast', 'Broadcast', [255, 92, 120], { system: 'broadcast' }),
               'index.html': themeHtml(BROADCAST_FALLBACK_HTML, 'full') }),
    }, {
      // Where more apps come from. A system launcher for the same reason
      // Meeting is one: the store installs onto this Home Screen, and the
      // sandbox has no such power (nor should it).
      name: 'App Store.gif', appId: 'appstore', accent: [123, 92, 255],
      files: withHelp('appstore', { 'manifest.json': manifest('appstore', 'App Store', [123, 92, 255], { system: 'store' }),
               'index.html': themeHtml(STORE_FALLBACK_HTML, 'full') }),
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
