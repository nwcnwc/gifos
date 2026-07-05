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
  const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function render(items){
    list.innerHTML = items.length
      ? items.map(n => '<li><span>'+esc(n.text)+'</span><button data-id="'+n.id+'">Delete</button></li>').join('')
      : '<div class="empty">No notes yet. Your notes persist in this GIF icon.</div>';
  }
  db.subscribe(render);
  document.getElementById('f').onsubmit = async e => {
    e.preventDefault();
    const t = document.getElementById('t');
    if (t.value.trim()) { await db.put({ text: t.value.trim() }); t.value=''; }
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
<div class="hint">Open this same GIF in two tabs — entries sync live across them (one browser hosts the DB, the other reads it).</div>
<form id="f">
  <input id="name" placeholder="Your name" autocomplete="off">
  <input id="msg" placeholder="Say something…" autocomplete="off">
  <button>Sign</button>
</form>
<ul id="list"></ul>
<script>
  const db = gifos.db('entries'), list = document.getElementById('list');
  const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function render(items){
    list.innerHTML = items.map(e => '<li><b>'+esc(e.name||'anon')+'</b>: '+esc(e.msg)+'</li>').reverse().join('');
  }
  db.subscribe(render);
  document.getElementById('f').onsubmit = async e => {
    e.preventDefault();
    const name = document.getElementById('name'), msg = document.getElementById('msg');
    if (msg.value.trim()) { await db.put({ name: name.value.trim(), msg: msg.value.trim() }); msg.value=''; }
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
  const fresh = () => ({ id:'board', cells:[null,null,null,null,null,null,null,null,null], turn:'X', winner:null });
  let current = fresh();
  const boardEl = document.getElementById('board'), statusEl = document.getElementById('status');
  function winnerOf(c){ for (const w of WINS) if (c[w[0]] && c[w[0]]===c[w[1]] && c[w[0]]===c[w[2]]) return c[w[0]];
    return c.every(Boolean) ? 'draw' : null; }
  function render(){
    boardEl.innerHTML = '';
    current.cells.forEach(function(v,i){
      const d = document.createElement('div');
      d.className = 'cell' + (v ? ' ' + v.toLowerCase() : '');
      d.textContent = v || '';
      d.onclick = async function(){
        if (current.winner || current.cells[i]) return;
        current.cells[i] = current.turn;
        current.winner = winnerOf(current.cells);
        current.turn = current.turn === 'X' ? 'O' : 'X';
        await db.put(current);
        render();
      };
      boardEl.appendChild(d);
    });
    statusEl.textContent = current.winner === 'draw' ? 'Draw! Start a new game.'
      : current.winner ? current.winner + ' wins! 🎉'
      : current.turn + ' to move — go multiplayer and play a friend';
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
