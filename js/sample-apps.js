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
      { name: 'Guestbook.gif', appId: 'guestbook', accent: [255, 92, 170],
        files: { 'manifest.json': manifest('guestbook', 'Guestbook', [255, 92, 170]), 'index.html': GUESTBOOK_HTML } },
      // An App GIF with NO index.html → browsable filesystem fallback.
      { name: 'Readme-folder.gif', appId: 'readme', accent: [92, 200, 255], notApp: false,
        files: {
          'manifest.json': manifest('readme', 'Readme', [92, 200, 255], { entry: 'nonexistent.html' }),
          'README.txt': 'This GIF has no index.html, so GifOS shows it as a browsable folder.',
          'notes/todo.txt': 'buy milk\nship gifos',
        } },
    ];
    return apps.map((a) => ({
      name: a.name, appId: a.appId, accent: a.accent,
      bytes: gif.encode(a.files, { accent: a.accent }),
    }));
  }

  GifOS.samples = { build };
})(typeof window !== 'undefined' ? window : globalThis);
