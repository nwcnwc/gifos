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
    const apps = [
      { name: 'Notes.gif', appId: 'notes', accent: [123, 92, 255],
        files: { 'manifest.json': manifest('notes', 'Notes', [123, 92, 255]), 'index.html': NOTES_HTML } },
      { name: 'Tic-Tac-Toe.gif', appId: 'tictactoe', accent: [92, 255, 123],
        files: { 'manifest.json': manifest('tictactoe', 'Tic-Tac-Toe', [92, 255, 123]), 'index.html': TICTACTOE_HTML } },
      { name: 'Guestbook.gif', appId: 'guestbook', accent: [255, 92, 170],
        files: { 'manifest.json': manifest('guestbook', 'Guestbook', [255, 92, 170]), 'index.html': GUESTBOOK_HTML } },
      // A GIF with NO index.html → browsable filesystem fallback, doubling as the manual.
      { name: 'Welcome.gif', appId: 'welcome', accent: [92, 200, 255],
        files: {
          'manifest.json': manifest('welcome', 'Welcome', [92, 200, 255], { entry: 'nonexistent.html' }),
          'README.txt': WELCOME_README,
        } },
    ];
    return Promise.all(apps.map((a) =>
      gif.encode(a.files, { accent: a.accent }).then((bytes) => ({
        name: a.name, appId: a.appId, accent: a.accent, bytes,
      }))
    ));
  }

  GifOS.samples = { build };
})(typeof window !== 'undefined' ? window : globalThis);
