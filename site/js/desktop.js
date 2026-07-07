/*
 * desktop.js — The GifOS desktop.
 *
 * A persistent, local-first desktop: icons for every dropped file, folders,
 * drag to arrange (grid snap), drag into folders, resize icons, double-click
 * to run an executable GIF in a new tab. System chrome lives in the top bar:
 * the GifOS menu (About, whole-desktop backup/restore as ONE GIF, Empty Trash,
 * dev-only Reset), an Add button (file picker + New Folder — phones can't
 * drag-and-drop), and a storage pill (browser quota + persistent-storage).
 * Deletes are recoverable: they move to a system Trash folder.
 * All layout + bytes live in IndexedDB (GifOS.store).
 */
(function (root) {
  const GifOS = root.GifOS;
  const store = GifOS.store, gif = GifOS.gif;
  const surface = document.getElementById('desktop');
  const crumbs = document.getElementById('crumbs');

  const VERSION = root.GIFOS_VERSION || '0.6.0';
  const TRASH_ID = 'sys_trash';
  const REPO_URL = 'https://github.com/nwcnwc/gifos';

  let latestVersion = VERSION;      // from version.json
  let availableVersions = [VERSION];
  const pinnedVersion = () => { try { return localStorage.getItem('gifos_pin'); } catch (e) { return null; } };
  // Compare dotted versions: >0 if a>b.
  function cmpVer(a, b) {
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
    return 0;
  }

  // Copy-paste onramp: paste into any AI, it learns the format then asks what
  // to build, and returns a single index.html you paste back to make an app.
  const AI_PROMPT = [
    'Build an app for GifOS (https://gifos.app) and deliver it as a REAL, FINISHED .gif FILE I can download — not just code. A GifOS app is a genuine animated GIF with a tiny filesystem (the app) hidden inside; I will drop the file onto my GifOS Home Screen and it runs.',
    '',
    'APP RULES',
    '1. The entry point is index.html. Single-file is simplest, but multi-file is fully supported: app.js, style.css, assets/… referenced normally (<script src="app.js">, <link href="style.css">) all travel inside the GIF — just include them in the files dict when packing. The ONLY hard rule: nothing external. No CDNs, frameworks, remote images, or web fonts — GifOS sandboxes apps and blocks all outside network access. Inline SVG and emoji are fine.',
    '2. Persistence (localStorage/cookies/indexedDB are disabled — never use them):',
    "     const db = gifos.db('items');       // a named collection",
    '     await db.put({ id, ...fields });    // add or update; omit id to auto-assign one',
    '     await db.get(id); await db.getAll(); await db.delete(id);   // all async',
    '     db.subscribe(items => renderFrom(items));   // called immediately and on every change',
    '   Everything in gifos.db() persists inside the icon AND syncs live to all players in multiplayer — keep all state there and render from subscribe().',
    '   HONESTY RULE for any in-app copy about saving: there is NO cloud and NO automatic cross-device sync. Data lives on THIS device only, inside the app\'s GIF in this browser. It reaches other devices exactly two ways: live sync while people are connected through an invite link, or by sharing/downloading the GIF file itself (state travels inside the file). Never claim the app "syncs across your devices" or "backs up to the cloud" — say something true instead, like "Saved on this device inside the app\'s GIF".',
    '3. Identity: const me = await gifos.me(); → { id, name }. Stamp me.id/me.name on records so every player sees who did what.',
    '4. If window.gifos is undefined (opened outside GifOS), degrade gracefully to in-memory state. Mobile-friendly, dark theme (#0a0a0f) by default.',
    '5. LIVE MEDIA IS OFF-LIMITS, by design: the sandbox blocks camera, microphone, screen capture, and WebRTC, so a video/voice/streaming app cannot work as a GifOS app — do not attempt one; if I ask for video chat, tell me GifOS already ships it (the Video Call icon on my Home Screen). Apps CAN bundle and display static media (images, GIFs, audio files) inside the GIF and store binary blobs (base64) in gifos.db — but keep hot collections lean: put big blobs (over ~100KB) in their OWN collection, fetched with db.get(), because subscribers re-download a whole collection on every change, and relay-fallback bandwidth is strictly throttled — bloated hot collections make an app slow for everyone.',
    '',
    'HOW TO DELIVER THE .gif (in order of preference)',
    'A. If you have the GifOS MCP connector (https://mcp.gifos.app/mcp): call pack_app — it returns the finished file. Done.',
    'B. If you can run code and attach files: (1) get the animation — MY OWN GIF COMES FIRST: if I provided a GIF (or say I have one), use its bytes as the host file WHOLESALE. Do NOT redraw, re-encode, resize, crop, recolor, or "improve" it in any way — the pack function below splices the app into it without touching a single pixel of my animation. Only if I have no GIF: ask me what kind of cute animation I would like, then draw it with PIL to my description — 2 to 6 frames, 64x64, styled like a cute STICKER: a little character with a dark outline on a TRANSPARENT background (GifOS icons float on the wallpaper — no background tile), and make it MOVE (blink, bounce, sweep); use mode "P" with palette index 0 reserved for transparency and save with im.save("icon.gif", save_all=True, append_images=frames[1:], duration=120, loop=0, transparency=0, disposal=2). (2) Splice the app into the GIF (mine or the drawn one) with EXACTLY this function — the wbits=-15 raw deflate is required:',
    '     import json, zlib, base64',
    '     def pack_gifos(gif_bytes, files):',
    '         a = {"v": 1, "files": {p: base64.b64encode(v.encode() if isinstance(v, str) else v).decode() for p, v in files.items()}}',
    '         c = zlib.compressobj(9, zlib.DEFLATED, -15)',
    '         payload = b"\\x01" + c.compress(json.dumps(a).encode()) + c.flush()',
    '         block = b"\\x21\\xff\\x0bGIFOS1.0GOS"',
    '         for i in range(0, len(payload), 255):',
    '             block += bytes([len(payload[i:i+255])]) + payload[i:i+255]',
    '         block += b"\\x00"',
    '         end = len(gif_bytes) - (gif_bytes[-1] == 0x3B)',
    '         return gif_bytes[:end] + block + b"\\x3b"',
    '     manifest = json.dumps({"gifos": "1.0", "appId": "my-app", "name": "My App", "entry": "index.html", "capabilities": {"db": True, "multiplayer": True}})',
    '     open("My App.gif", "wb").write(pack_gifos(open("icon.gif", "rb").read(), {"manifest.json": manifest, "index.html": HTML}))',
    '   Attach the resulting "My App.gif" for me to download. Remember: when the host GIF is mine, the result still looks and animates EXACTLY like my original everywhere — that is the point.',
    'C. ONLY if you can do neither A nor B: reply with a complete single-file index.html in a ```html code block (the paste box takes one file; multi-file needs a .zip) and tell me to paste it into GifOS → ＋ Add → the app builder.',
    '',
    'SIGNING (optional, recommended when I plan to share the app): after delivering the .gif, mention that I can sign it at https://gifos.app/sign.html with my domain (publishes a key at https://mydomain/gifos.key) or my email (my own PGP key via keys.openpgp.org — Ed25519 or RSA), so everyone who receives it sees "Signed by me" — and tampering is detected. Signing is done BY ME on that page, after the GIF is final. NEVER ask for my private key.',
    '',
    'MODDING IS ENCOURAGED: if I hand you an EXISTING GifOS app .gif and ask for changes, do not rebuild from scratch — extract its files, apply my changes, and splice them back into the SAME GIF so its animation and my saved data survive. To extract (Python): find b"\\x21\\xff\\x0bGIFOS1.0GOS" in the bytes; after those 14 header bytes read length-prefixed sub-blocks until a zero byte; the joined payload (skipping its first flag byte) is raw-deflate JSON {"files": {path: base64}}. Cut that whole block out of the GIF, modify the files, keep every ".state/…" entry unchanged (my data), then run pack_gifos on the remaining bytes. Cut out any "GIFOSSIG" block the same way — a mod is a new work I can re-sign.',
    '',
    'First, ask me: "What app do you want to build? Or is there an existing GifOS app you want me to MOD — if so, just upload its .gif." — and in the same message ask whether I have a GIF of my own to use for its animation (if yes, use it UNCHANGED; if no, ask what kind of cute animation I would like you to draw; if I am modding, the app\'s own GIF already IS the animation — keep it).',
    'After I answer, deliver the finished .gif (path A or B) with one line of instructions: open gifos.app, tap ＋ Add (or drag the file in), double-click the new icon.',
  ].join('\n');

  let items = [];                 // all desktop items (files + folders)
  let currentFolder = null;       // null = root, else folder id
  const blobUrls = new Map();     // fileId -> object URL (for gif thumbnails)
  let selectedId = null;

  // ---------- data ----------
  // Reload the item list, but keep the SAME object for any id that survives, so
  // live event closures (a drag in flight, a wired icon) go on seeing the same
  // object they captured — reassigning a fresh array would orphan them, and the
  // icon reconciler would then compare a node against a different object than
  // the handler mutated. New ids get their record; departed ids drop out.
  function load() {
    return store.allItems().then((all) => {
      const byId = new Map(items.map((i) => [i.id, i]));
      items = all.map((rec) => {
        const cur = byId.get(rec.id);
        if (!cur) return rec;
        for (const k of Object.keys(cur)) if (!(k in rec)) delete cur[k];
        return Object.assign(cur, rec);
      });
    });
  }
  // Namespace suffix for links to sibling pages (run.html, boot.html): the
  // default desktop emits clean URLs; a booted computer image threads its
  // own database name through so apps and nested boots stay inside it.
  const nsParam = (key) => (store.dbName === 'gifos' ? '' : key + encodeURIComponent(store.dbName));

  function gridPosition(index) {
    const cols = Math.max(1, Math.floor((surface.clientWidth - 20) / GRID.pitch));
    return { x: GRID.origin + (index % cols) * GRID.pitch, y: GRID.origin + Math.floor(index / cols) * GRID.rowPitch };
  }

  // ---------- folders ARE GIFs ----------
  // Every folder owns a real animated folder GIF (its icon and its shareable
  // form). Day-to-day the children live as store rows for speed; Download
  // packs a self-contained BUNDLE — children (state folded in) inside the
  // folder's own GIF, recursively — and dropping a bundle unpacks it back.
  const FOLDER_ACCENTS = { Games: [92, 255, 123], Studio: [255, 92, 170], Tools: [123, 92, 255], Social: [92, 220, 180], 'IRL Games': [255, 170, 60], 'Single Phone': [92, 200, 255], 'Stolen Apps': [255, 200, 80] };
  function accentFor(name) {
    if (FOLDER_ACCENTS[name]) return FOLDER_ACCENTS[name];
    let h = 0; const s = String(name || 'Folder');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const pool = [[255, 200, 80], [123, 92, 255], [92, 220, 180], [255, 92, 170], [92, 160, 255], [92, 255, 123]];
    return pool[h % pool.length];
  }
  async function makeFolderGif(name, accent, artId) {
    accent = accent || accentFor(name);
    const files = { 'manifest.json': JSON.stringify({ gifos: '1.0', type: 'folder', name }) };
    let preview = null;
    if (GifOS.icons) { try { preview = await GifOS.icons.renderApp(artId || 'folder', accent); } catch (e) { /* plain tile */ } }
    return gif.encode(files, { accent, preview });
  }
  async function createFolder(name, parent, x, y) {
    const fileId = store.uid('file');
    const bytes = await makeFolderGif(name);
    await store.putFile({ id: fileId, name: name + '.gif', bytes, kind: 'gif', isApp: false, mime: 'image/gif' });
    const it = { id: store.uid('item'), kind: 'folder', name, parent: parent || null, x, y, iconSize: 64, fileId };
    await store.putItem(it);
    return it;
  }

  async function seedIfEmpty() {
    if (items.length) return;
    const seed = await GifOS.samples.build();
    const putApp = async (a, parent, pos) => {
      const fileId = store.uid('file');
      await store.putFile({ id: fileId, name: a.name, bytes: a.bytes, kind: 'gif',
        isApp: true, appId: a.appId, accent: a.accent, mime: 'image/gif' });
      await store.putItem({ id: store.uid('item'), kind: 'file', fileId, name: a.name,
        parent, x: pos.x, y: pos.y, iconSize: 64 });
    };
    // Layout: Welcome top-left; Video Call (the killer app) alone in the
    // top-right corner; the app folders run down the right-hand side under it.
    const cols = Math.max(2, Math.floor((surface.clientWidth - 20) / GRID.pitch));
    const rightX = GRID.origin + (cols - 1) * GRID.pitch;
    const rowY = (r) => GRID.origin + r * GRID.rowPitch;
    let rightRow = 0, leftRow = 0;
    for (const a of seed.loose) {
      if (a.appId === 'video') await putApp(a, null, { x: rightX, y: rowY(rightRow++) });
      else await putApp(a, null, { x: GRID.origin, y: rowY(leftRow++) });
    }
    const putFolder = async (folder, parent, x, y) => {
      const f = await createFolder(folder.name, parent, x, y);
      let inside = 1; // cell 0 belongs to the up-hole
      for (const a of folder.apps) await putApp(a, f.id, gridPosition(inside++));
      for (const sub of folder.sub || []) { const p = gridPosition(inside++); await putFolder(sub, f.id, p.x, p.y); }
      return f;
    };
    for (const folder of seed.folders) await putFolder(folder, null, rightX, rowY(rightRow++));
    await load();
  }

  // System items exist on every desktop, including old ones from before they
  // shipped. 'sys_stolen' is shared with the runtime (run.html), which files
  // stolen apps into it — and creates it itself if a steal happens first.
  async function ensureSystemItems() {
    if (!items.find((i) => i.id === TRASH_ID)) {
      const spot = nearestFreeCell(GRID.origin, GRID.origin + 3 * GRID.pitch, null, null);
      await store.putItem({ id: TRASH_ID, kind: 'folder', name: 'Trash', parent: null,
        x: spot.x, y: spot.y, iconSize: 64 });
      await load();
    }
    let stolen = items.find((i) => i.id === 'sys_stolen');
    if (!stolen) {
      const spot = nearestFreeCell(GRID.origin, GRID.origin + 3 * GRID.pitch, null, null);
      stolen = { id: 'sys_stolen', kind: 'folder', name: 'Stolen Apps', parent: null,
        x: spot.x, y: spot.y, iconSize: 64 };
      await store.putItem(stolen);
      await load();
    }
    // The loot deserves a treasure chest. Also retrofits folders created bare
    // (by the runtime mid-steal, or by earlier versions of this code).
    if (!stolen.fileId) {
      try {
        const fileId = store.uid('file');
        const bytes = await makeFolderGif('Stolen Apps', FOLDER_ACCENTS['Stolen Apps'], 'chest');
        await store.putFile({ id: fileId, name: 'Stolen Apps.gif', bytes, kind: 'gif', isApp: false, mime: 'image/gif' });
        stolen.fileId = fileId;
        await store.putItem(stolen);
        await load();
      } catch (e) { /* falls back to the 📁 glyph */ }
    }
  }

  // ---------- rendering ----------
  function blobUrlFor(fileId, bytes) {
    if (blobUrls.has(fileId)) return blobUrls.get(fileId);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
    blobUrls.set(fileId, url);
    return url;
  }

  // A repaint used to re-read every icon's bytes from IndexedDB and rebuild
  // every DOM node — O(icons) DB round-trips on every selection, drag or folder
  // hop. Two caches make a repaint cost only what actually changed:
  //   fileCache — the file record per fileId, so bytes are read once, not per paint
  //   iconCache — the built <div.icon> per item, reused while its look is unchanged
  const fileCache = new Map(); // fileId -> file record (null when missing)
  const iconCache = new Map(); // itemId -> { el, key, fileId }
  function getFileCached(fileId) {
    if (!fileId) return Promise.resolve(null);
    if (fileCache.has(fileId)) return Promise.resolve(fileCache.get(fileId));
    return store.getFile(fileId).then((f) => { const v = f || null; fileCache.set(fileId, v); return v; });
  }
  // A file's bytes changed (or it was deleted): drop its cached record, blob URL
  // and any icon node built from it, so the next render rebuilds from fresh bytes.
  function forgetFile(fileId) {
    if (!fileId) return;
    fileCache.delete(fileId);
    if (blobUrls.has(fileId)) { URL.revokeObjectURL(blobUrls.get(fileId)); blobUrls.delete(fileId); }
    for (const [id, e] of iconCache) if (e.fileId === fileId) iconCache.delete(id);
  }
  // Another tab (or an app page) may have rewritten any file: forget everything
  // visual and repaint from scratch. Only runs on cross-tab / refocus events.
  function dropRenderCaches() {
    fileCache.clear();
    iconCache.clear();
    for (const url of blobUrls.values()) URL.revokeObjectURL(url);
    blobUrls.clear();
  }
  // Cache hygiene for very large computers: the byte cache and object URLs would
  // otherwise grow with every file ever shown. After each paint, trim the oldest
  // entries that aren't currently on screen (a re-read is cheap, and nothing
  // mounted references a revoked URL — off-folder icons aren't in the DOM).
  const CACHE_CAP = 300;
  function pruneFileCaches(keepFileIds) {
    if (fileCache.size > CACHE_CAP) {
      for (const id of fileCache.keys()) {
        if (fileCache.size <= CACHE_CAP) break;
        if (!keepFileIds.has(id)) fileCache.delete(id);
      }
    }
    if (blobUrls.size > CACHE_CAP) {
      for (const [id, url] of blobUrls) {
        if (blobUrls.size <= CACHE_CAP) break;
        if (!keepFileIds.has(id)) { URL.revokeObjectURL(url); blobUrls.delete(id); }
      }
    }
  }
  // Everything that changes how an icon LOOKS or WHERE it sits. Bytes aren't in
  // the key — forgetFile() evicts the node directly when bytes change — so a
  // repaint after a mere selection/drag reuses the untouched nodes.
  function iconKey(it, file) {
    const trash = it.id === TRASH_ID ? (items.some((i) => i.parent === TRASH_ID) ? 'full' : 'empty') : '';
    const verdict = (sigVerdicts.get(it.fileId) || {}).status || '';
    // Joined with a control char (U+0001) that can't appear in names/ids, so
    // distinct field combinations can never collide into the same key.
    return [it.fileId || '', it.name, it.x | 0, it.y | 0, it.iconSize || 64, it.kind,
      file ? file.kind : '', file ? (file.appId || '') : '', trash, verdict].join('');
  }

  const FILE_EMOJI = { gif: '🖼️', other: '📄' };

  // Renders can be triggered concurrently (create, import, cross-tab sync).
  // Read every visible icon's bytes in ONE cached batch, reuse the DOM nodes
  // whose look is unchanged, then swap the set in atomically; a superseded
  // render bails before touching the DOM, so no duplicate icons.
  let renderSeq = 0;
  let renderStats = null;
  async function render() {
    const seq = ++renderSeq;
    const visible = items.filter((it) => (it.parent || null) === currentFolder);
    // One batched, cached read instead of a serial getFile() per icon per paint.
    const files = await Promise.all(visible.map((it) => getFileCached(it.fileId)));
    if (seq !== renderSeq) return; // a newer render started — abandon this one
    // Reconcile: reuse the cached node when its key matches, rebuild only what
    // changed, and keep selection in sync on the survivors.
    const keep = new Set();
    let reused = 0;
    const els = visible.map((it, i) => {
      const key = iconKey(it, files[i]);
      let entry = iconCache.get(it.id);
      if (!entry || entry.key !== key) {
        entry = { el: buildIcon(it, files[i]), key, fileId: it.fileId };
        iconCache.set(it.id, entry);
      } else {
        // Reuse the node, but re-assert its authoritative position/selection —
        // a drag may have moved its inline style out from under the cache.
        entry.el.style.left = (it.x || 16) + 'px';
        entry.el.style.top = (it.y || 16) + 'px';
        entry.el.classList.toggle('selected', it.id === selectedId);
        reused++;
      }
      keep.add(it.id);
      return entry.el;
    });
    for (const id of Array.from(iconCache.keys())) if (!keep.has(id)) iconCache.delete(id);
    surface.querySelectorAll('.icon, .hint').forEach((n) => n.remove());
    updateCrumbs();
    if (!visible.length) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = currentFolder === TRASH_ID ? 'Trash is empty.'
        : currentFolder ? 'Empty folder — drop files here or use ＋ Add.'
        : 'Drop any file here, or use ＋ Add. Double-click an app GIF to run it.';
      surface.appendChild(hint);
    }
    if (currentFolder) surface.appendChild(buildUpHole());
    els.forEach((el) => surface.appendChild(el));
    dropHint.style.display = visible.length ? '' : 'none'; // the empty hint explains instead
    updateExtent();
    applyBackground();
    pruneFileCaches(new Set(visible.map((it) => it.fileId)));
    // Lightweight observability: how big the last paint was, how many icons it
    // reused vs. rebuilt, and current cache sizes. Read from the console via
    // GifOS.desktop.stats to validate the reconciler on a real desktop.
    renderStats = { icons: visible.length, rebuilt: els.length - reused, reused,
      fileCache: fileCache.size, iconCache: iconCache.size, blobUrls: blobUrls.size };
  }

  // The upper-left cell inside every folder is a HOLE back up to the parent:
  // click it to go up a level, or drop icons on it to send them there.
  function upTarget() {
    const folder = items.find((i) => i.id === currentFolder);
    return folder ? (folder.parent || null) : null;
  }
  function buildUpHole() {
    const upTo = upTarget();
    const parentName = upTo ? (items.find((i) => i.id === upTo) || {}).name || '…' : 'Home Screen';
    const el = document.createElement('div');
    el.className = 'icon uphole';
    el.dataset.id = '__up__';
    el.style.left = GRID.origin + 'px';
    el.style.top = GRID.origin + 'px';
    el.title = 'Up to ' + parentName + ' — or drop things here to move them there';
    el.innerHTML = '<div class="thumb"><div class="hole">⤴</div></div><div class="label">' + escapeHtml(parentName) + '</div>';
    el.addEventListener('click', () => { currentFolder = upTo; selectedId = null; render(); });
    return el;
  }

  // A thumbnail <img>. loading="lazy"/decoding="async" let the browser skip the
  // pixel decode for icons scrolled out of the endless surface until they near
  // the viewport — virtualization of the costly part without unmounting nodes.
  function thumbImg(fileId, bytes, alt) {
    const img = document.createElement('img');
    img.src = blobUrlFor(fileId, bytes);
    img.alt = alt;
    img.draggable = false; // pointer-drag the icon, not the image
    img.loading = 'lazy';
    img.decoding = 'async';
    return img;
  }
  function buildIcon(it, file) {
    const el = document.createElement('div');
    el.className = 'icon' + (it.kind === 'folder' ? ' folder' : '') + (it.id === selectedId ? ' selected' : '');
    el.style.left = (it.x || 16) + 'px';
    el.style.top = (it.y || 16) + 'px';
    el.dataset.id = it.id;
    const isize = it.iconSize || 64;
    el.style.setProperty('--isize', isize + 'px');

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (it.id === TRASH_ID) {
      thumb.textContent = items.some((i) => i.parent === TRASH_ID) ? '🗑️' : '🗑';
    } else if (it.kind === 'folder') {
      // folders are GIFs too — the icon IS the folder's own animated GIF
      if (file) {
        const fbytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
        thumb.appendChild(thumbImg(it.fileId, fbytes, it.name));
        signableFiles.add(it.fileId);
        addSigBadge(thumb, it, fbytes);
      } else {
        thumb.textContent = '📁'; // system folders (Trash, Stolen Apps) have no GIF
      }
    } else {
      if (file && file.kind === 'gif') {
        const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
        thumb.appendChild(thumbImg(it.fileId, bytes, it.name));
        signableFiles.add(it.fileId); // it's a GIF — signing/verifying applies
        addSigBadge(thumb, it, bytes); // shield if the GIF carries a signature
        if (file.appId === 'video') {
          // Honest signage: this launcher opens a SYSTEM page that runs with
          // camera/mic/WebRTC — capabilities sandboxed apps never get.
          const sys = document.createElement('span');
          sys.className = 'sysbadge';
          sys.textContent = 'SYSTEM';
          sys.title = 'System app — opens a trusted GifOS page with camera, microphone and WebRTC access. Regular apps run sandboxed with none of these.';
          thumb.appendChild(sys);
        }
      } else {
        thumb.textContent = FILE_EMOJI[file ? file.kind : 'other'] || '📄';
      }
    }
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = it.name;

    el.appendChild(thumb);
    el.appendChild(label);
    wireIcon(el, it);
    return el;
  }

  // ---------- provenance signatures ----------
  // Reading the sig BLOCK is local (no network) — so we can show a shield the
  // instant an icon renders. VERIFYING (fetching the key) happens on demand
  // (open the app, or "Verify signature"), and the verdict is cached per
  // session so icons don't re-ping domains/keyservers on every render.
  const sigVerdicts = new Map(); // fileId -> verdict object
  const signableFiles = new Set(); // fileId is a GIF (signing/verifying applies)
  const signedFiles = new Set();   // fileId carries a GIFOSSIG block
  const SIG_ICON = { valid: '✓', tampered: '⚠', unverified: '🛡', pending: '🛡' };
  const SIG_CLASS = { valid: 'sig-ok', tampered: 'sig-bad', unverified: 'sig-unk', pending: 'sig-unk' };
  function addSigBadge(thumb, it, bytes) {
    if (!GifOS.sign) return;
    const sig = GifOS.sign.readSig(bytes);
    if (!sig) { signedFiles.delete(it.fileId); return; }
    signedFiles.add(it.fileId);
    const cached = sigVerdicts.get(it.fileId);
    const state = cached ? cached.status : 'pending';
    const badge = document.createElement('span');
    badge.className = 'sig-badge ' + (SIG_CLASS[state] || 'sig-unk');
    badge.textContent = SIG_ICON[state] || '🛡';
    badge.title = cached ? sigLabel(cached) : ('Signed by ' + sig.id + ' — tap Verify to check');
    thumb.appendChild(badge);
  }
  function sigLabel(v) {
    if (v.status === 'valid') return 'Signed by ' + v.id + (v.ts ? ' · ' + v.ts : '') + (v.keyChanged ? ' (key changed since first seen!)' : '');
    if (v.status === 'tampered') return 'Tampered — contents changed after ' + (v.id ? v.id + ' ' : '') + 'signed';
    if (v.status === 'unverified') return 'Signed by ' + (v.id || '?') + ' — could not verify right now (' + (v.detail || 'offline') + ')';
    return 'Unsigned';
  }
  // Open the signing page with THIS GIF preloaded (by fileId + namespace),
  // so the user lands ready to sign — no re-download/re-drop needed.
  function signItem(it) {
    closeContext();
    root.open('sign.html#id=' + encodeURIComponent(it.fileId) + nsParam('&db='), '_blank');
  }
  async function verifyItem(it) {
    if (!GifOS.sign) return;
    const file = await store.getFile(it.fileId);
    if (!file) return;
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    const sig = GifOS.sign.readSig(bytes);
    if (!sig) { showModal('No signature', 'This GIF is <b>unsigned</b> — it carries no provenance. Anyone can make an unsigned GIF, so treat it like a file from an unknown source.'); return; }
    showModal('Checking signature…', 'Fetching the key for <b>' + escapeHtml(sig.id) + '</b>…');
    const v = await GifOS.sign.verify(bytes);
    sigVerdicts.set(it.fileId, v);
    render();
    const body = {
      valid: '✅ <b>Signed by ' + escapeHtml(v.id) + '</b>' + (v.type === 'email' ? ' (email/PGP)' : ' (domain)') + '.<br><br>The contents are unchanged since it was signed' + (v.ts ? ' on ' + escapeHtml(v.ts) : '') + '. This proves authorship — not that the app is safe.' + (v.keyChanged ? '<br><br>⚠️ The signing key is <b>different</b> from the first one you saw for this identity.' : ''),
      tampered: '⚠️ <b>Tampered.</b> This GIF claims to be signed by ' + escapeHtml(v.id || '?') + ', but its contents were <b>changed after signing</b>. Do not trust it as coming from them.',
      unverified: '🛡 <b>Signed by ' + escapeHtml(v.id || '?') + '</b>, but the signature couldn\'t be checked right now: ' + escapeHtml(v.detail || 'offline') + '.<br><br>' + (v.type === 'domain' ? 'The key must be published at <span class="mono">https://' + escapeHtml(v.id || '') + '/gifos.key</span> (with CORS).' : 'Their key must be on keys.openpgp.org.'),
      unsigned: 'This GIF is unsigned.',
    }[v.status] || 'Unknown signature state.';
    showModal(v.status === 'valid' ? 'Verified' : v.status === 'tampered' ? 'Tampered!' : 'Signature', body);
  }

  function updateCrumbs() {
    if (!currentFolder) { crumbs.textContent = 'Home Screen'; return; }
    const folder = items.find((i) => i.id === currentFolder);
    crumbs.innerHTML = '<a id="crumb-root">Home Screen</a> › ' + (folder ? escapeHtml(folder.name) : '…');
    const rootLink = document.getElementById('crumb-root');
    if (rootLink) rootLink.onclick = () => { currentFolder = null; selectedId = null; render(); };
  }

  // ---------- grid snapping (Windows-style: drag anywhere, land on a cell) ----
  // Cell pitch adapts to the screen: at least 5 icons fit across on phones,
  // capped on big screens so the desktop doesn't feel like sparse whitespace.
  function computePitch() {
    const w = surface.clientWidth || document.documentElement.clientWidth || 1024;
    return Math.max(72, Math.min(104, Math.floor((w - 24) / 5)));
  }
  // Rows stay tall enough for icon + two label lines even when columns tighten.
  const GRID = { origin: 12, pitch: computePitch(), rowPitch: Math.max(computePitch(), 104) };
  surface.style.setProperty('--cell', GRID.pitch + 'px');
  surface.style.setProperty('--row', GRID.rowPitch + 'px');
  const gridCols = () => Math.max(1, Math.floor((surface.clientWidth - 20) / GRID.pitch));
  function cellOf(x, y, cols) {
    return {
      col: Math.min(cols - 1, Math.max(0, Math.round(((x || GRID.origin) - GRID.origin) / GRID.pitch))),
      row: Math.max(0, Math.round(((y || GRID.origin) - GRID.origin) / GRID.rowPitch)),
    };
  }
  // Nearest empty cell to (px,py) among siblings in `parent`, ring-searching outward.
  function nearestFreeCell(px, py, parent, excludeId) {
    const cols = gridCols();
    const target = cellOf(px, py, cols);
    const taken = new Set(items
      .filter((i) => (i.parent || null) === (parent || null) && i.id !== excludeId)
      .map((i) => { const c = cellOf(i.x, i.y, cols); return c.col + ',' + c.row; }));
    if (parent) taken.add('0,0'); // the up-hole owns the corner cell inside folders
    for (let r = 0; r < 200; r++) {
      let best = null, bestD = Infinity;
      for (let dc = -r; dc <= r; dc++) {
        for (let dr = -r; dr <= r; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== r) continue; // ring perimeter only
          const col = target.col + dc, row = target.row + dr;
          if (col < 0 || col >= cols || row < 0) continue;
          const d = dc * dc + dr * dr;
          if (d < bestD && !taken.has(col + ',' + row)) { bestD = d; best = { col, row }; }
        }
      }
      if (best) return { x: GRID.origin + best.col * GRID.pitch, y: GRID.origin + best.row * GRID.rowPitch };
    }
    return { x: px, y: py }; // desktop is impossibly full — leave as dropped
  }

  // ---------- icon interaction (drag, double-click, select) ----------
  // Pointer events unify mouse + touch; long-press opens the context menu on touch.
  function wireIcon(el, it) {
    let down = null, moved = false, lpTimer = null, lastTap = 0;
    const clearLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };

    el.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'INPUT') return;          // renaming — let the input work
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();                                 // no native image drag / text select
      selectedId = it.id;
      surface.querySelectorAll('.icon').forEach((n) => n.classList.toggle('selected', n === el));
      down = { x: e.clientX, y: e.clientY, ox: it.x || GRID.origin, oy: it.y || GRID.origin, st: surface.scrollTop };
      moved = false;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic/stale pointer */ }
      if (e.pointerType !== 'mouse') {
        lpTimer = setTimeout(() => {                     // long-press → context menu
          if (!moved && down) { down = null; showContextMenu({ clientX: e.clientX, clientY: e.clientY }, it); }
        }, 500);
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) { moved = true; clearLp(); }
      if (moved) {
        // Dragging near the edges scrolls the endless surface along.
        const r = surface.getBoundingClientRect();
        if (e.clientY > r.bottom - 48) surface.scrollTop += 14;
        else if (e.clientY < r.top + 48 && surface.scrollTop > 0) surface.scrollTop -= 14;
        const sd = surface.scrollTop - down.st; // keep the icon under the finger while scrolled
        el.style.left = Math.max(0, down.ox + dx) + 'px';
        el.style.top = Math.max(0, down.oy + dy + sd) + 'px';
        highlightDropTarget(e, it);
      }
    });
    el.addEventListener('pointerup', async (e) => {
      clearLp();
      if (!down) return;
      const wasMoved = moved; down = null;
      if (!wasMoved) {
        // Touch double-tap → open. iOS/WebKit never synthesizes dblclick once
        // pointerdown is preventDefault'd, so we detect the two taps ourselves.
        if (e.pointerType !== 'mouse') {
          const now = Date.now();
          if (now - lastTap < 400) { lastTap = 0; openItem(it); }
          else lastTap = now;
        }
        return;
      }
      const targetFolder = folderUnder(e, it);
      const hole = upHoleUnder(e);
      if (hole && it.id !== TRASH_ID) {
        const upTo = upTarget();                          // dropped in the hole → up a level
        const spot = nearestFreeCell(GRID.origin, GRID.origin, upTo, it.id);
        it.parent = upTo; it.x = spot.x; it.y = spot.y;
      } else if (targetFolder && it.id !== TRASH_ID) {
        it.parent = targetFolder.id;                     // dropped into a folder (or Trash)
      } else {
        const snapped = nearestFreeCell(parseInt(el.style.left, 10), parseInt(el.style.top, 10), it.parent, it.id);
        it.x = snapped.x; it.y = snapped.y;
      }
      await store.putItem(it);
      clearDropTargets();
      render();
    });
    el.addEventListener('pointercancel', () => {         // scroll/gesture stole the pointer
      clearLp(); down = null;
      el.style.left = (it.x || GRID.origin) + 'px';
      el.style.top = (it.y || GRID.origin) + 'px';
      clearDropTargets();
    });

    el.addEventListener('dblclick', () => openItem(it));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); selectedId = it.id; showContextMenu(e, it); });
  }

  function iconElsExcept(id) {
    return Array.from(surface.querySelectorAll('.icon')).filter((n) => n.dataset.id !== id);
  }
  function folderUnder(e, dragItem) {
    for (const n of iconElsExcept(dragItem.id)) {
      const it = items.find((i) => i.id === n.dataset.id);
      if (it && it.kind === 'folder' && hit(n, e)) return it;
    }
    return null;
  }
  function upHoleUnder(e) {
    const n = surface.querySelector('.uphole');
    return n && hit(n, e) ? n : null;
  }
  function highlightDropTarget(e, dragItem) {
    clearDropTargets();
    const holeEl = upHoleUnder(e);
    if (holeEl) { holeEl.classList.add('drop-target'); return; }
    const f = folderUnder(e, dragItem);
    if (f) { const n = surface.querySelector('.icon[data-id="' + f.id + '"]'); if (n) n.classList.add('drop-target'); }
  }
  function clearDropTargets() { surface.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target')); }
  function hit(node, e) {
    const r = node.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }

  // ---------- open / run ----------
  async function openItem(it) {
    if (it.kind === 'folder') { currentFolder = it.id; selectedId = null; return render(); }
    const file = await store.getFile(it.fileId);
    if (!file) return;
    if (file.kind === 'gif' && file.isApp) {
      root.open('run.html#id=' + encodeURIComponent(it.fileId) + nsParam('&db='), '_blank');
      return;
    }
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    // A whole-desktop backup GIF is a COMPUTER IMAGE. Booting it runs that
    // computer in its own namespace (a computer inside this computer) and
    // touches nothing here; replacing this desktop is the destructive path.
    if (file.kind === 'gif') {
      const archive = await gif.decode(bytes);
      const m = archive ? gif.readManifest(archive) : null;
      if (archive && m && m.type === 'desktop' && archive.files['desktop.json']) {
        showConfirm('This GIF is a whole computer',
          '"' + escapeHtml(it.name) + '" holds a whole GifOS computer. <b>Boot it</b> to run that computer in a new tab — ' +
          'your Home Screen here is untouched. Or <b>replace</b> this Home Screen with it (destructive).',
          [
            { label: 'Boot this computer', fn: () => root.open('boot.html#id=' + encodeURIComponent(it.fileId) + nsParam('&from='), '_blank') },
            { label: 'Replace this Home Screen', danger: true, fn: () => restoreDesktop(archive) },
          ]);
        return;
      }
    }
    // Any other plain file (a normal GIF, an image, …) just opens in its own tab.
    openFileTab(file);
  }

  function openFileTab(file) {
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    const url = URL.createObjectURL(new Blob([bytes], { type: file.mime || 'application/octet-stream' }));
    root.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // ---------- import files (shared by OS drag-drop and the ＋ Add picker) -----
  async function importFiles(fileList, baseX, baseY) {
    let i = 0;
    for (const f of fileList) {
      const buf = new Uint8Array(await f.arrayBuffer());

      // A .zip becomes an App GIF: unpack its filesystem and pack it into a GIF.
      if (/\.zip$/i.test(f.name) || (GifOS.zip && GifOS.zip.looksLikeZip(buf))) {
        try {
          const files = await GifOS.zip.unpack(buf);
          const base = f.name.replace(/\.zip$/i, '');
          await createAppFromFiles(base, files, null);
        } catch (err) {
          showModal('Could not open zip', escapeHtml(err.message || String(err)));
        }
        i++;
        continue;
      }

      const isGif = f.type.includes('gif') || /\.gif$/i.test(f.name);
      const archive = isGif ? await gif.decode(buf) : null;
      const m = archive ? (gif.readManifest(archive) || {}) : {};

      // A folder bundle GIF unpacks into a live folder with all its children.
      if (archive && m.type === 'folder' && archive.files['folder.json']) {
        await unpackFolderBundle(buf, archive, m, baseX + i * 20, baseY + i * 20, currentFolder);
        i++;
        continue;
      }

      // A whole-desktop backup GIF gets offered as a restore, not an icon.
      if (archive && m.type === 'desktop' && archive.files['desktop.json']) {
        await new Promise((done) => {
          showConfirm('Desktop backup detected',
            '"' + escapeHtml(f.name) + '" is a full GifOS backup. Restore it? ' +
            '<b>This replaces everything currently on this Home Screen.</b>',
            [
              { label: 'Restore this backup', danger: true, fn: async () => { await restoreDesktop(archive); done(); } },
              { label: 'Add as a file instead', fn: async () => { await addFileIcon(f.name, buf, archive, m, baseX + i * 20, baseY + i * 20); done(); } },
            ], done);
        });
        i++;
        continue;
      }

      await addFileIcon(f.name, buf, archive, m, baseX + i * 20, baseY + i * 20);
      i++;
    }
    render();
  }

  async function addFileIcon(name, buf, archive, m, x, y) {
    const isGif = /\.gif$/i.test(name) || (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46);
    const fileId = store.uid('file');
    await store.putFile({ id: fileId, name, bytes: buf, kind: isGif ? 'gif' : 'other',
      isApp: !!archive, appId: m.appId || null, accent: m.accent || null,
      mime: isGif ? 'image/gif' : 'application/octet-stream' });
    const spot = nearestFreeCell(x, y, currentFolder, null);
    await store.putItem({ id: store.uid('item'), kind: 'file', fileId, name,
      parent: currentFolder, x: spot.x, y: spot.y, iconSize: 64 });
    await load(); // next import's free-cell search must see this one
  }

  // ---------- drop files from the OS ----------
  ['dragenter', 'dragover'].forEach((ev) => surface.addEventListener(ev, (e) => { e.preventDefault(); surface.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) => surface.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.target === surface) surface.classList.remove('dragover'); }));
  surface.addEventListener('drop', async (e) => {
    e.preventDefault();
    // Content coordinates (offsetX/Y would be relative to whatever icon was
    // under the cursor, and ignores how far the surface is scrolled).
    const r = surface.getBoundingClientRect();
    await importFiles(Array.from(e.dataTransfer.files || []),
      e.clientX - r.left + surface.scrollLeft, e.clientY - r.top + surface.scrollTop);
  });

  // Soft reminder that the whole surface is a drop zone (pointer devices only;
  // hidden while the empty-desktop hint is doing the explaining).
  const dropHint = document.createElement('div');
  dropHint.className = 'drop-hint';
  dropHint.textContent = 'drop files anywhere to add them';
  document.body.appendChild(dropHint);

  // ---------- endless scroll ----------
  // The Home Screen scrolls down forever: a sentinel keeps one screenful of
  // empty space below the lowest icon, and chasing the bottom edge grows it —
  // scroll as far as you like, park icons anywhere, positions persist.
  const extent = document.createElement('div');
  extent.className = 'extent';
  extent.style.cssText = 'position:absolute;width:1px;height:1px;pointer-events:none;';
  surface.appendChild(extent);
  function updateExtent() {
    let maxY = 0;
    for (const it of items) if ((it.parent || null) === currentFolder) maxY = Math.max(maxY, it.y || 0);
    extent.style.top = (maxY + GRID.rowPitch + Math.max(240, surface.clientHeight - GRID.rowPitch)) + 'px';
  }
  surface.addEventListener('scroll', () => {
    const extTop = parseInt(extent.style.top, 10) || 0;
    if (surface.scrollTop + surface.clientHeight > extTop - 80) {
      extent.style.top = (extTop + Math.max(300, surface.clientHeight)) + 'px';
    }
  });

  // ---------- menus (context menu + system menus share one dropdown) ----------
  let ctxEl = null;
  function closeContext() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }
  function buildMenu(x, y, entries) {
    closeContext();
    const menu = document.createElement('div');
    menu.className = 'ctx';
    menu.style.left = Math.min(x, root.innerWidth - 200) + 'px';
    menu.style.top = y + 'px';
    for (const entry of entries) {
      if (entry === 'sep') { const s = document.createElement('div'); s.className = 'sep'; menu.appendChild(s); continue; }
      const b = document.createElement('button');
      b.textContent = entry.label;
      if (entry.cls) b.className = entry.cls;
      b.onclick = () => { closeContext(); entry.fn(); };
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    ctxEl = menu;
  }
  function menuUnder(anchorEl, entries) {
    const r = anchorEl.getBoundingClientRect();
    buildMenu(r.left, r.bottom + 4, entries);
  }

  function isInTrash(it) {
    let p = it.parent || null;
    while (p) {
      if (p === TRASH_ID) return true;
      const parent = items.find((i) => i.id === p);
      p = parent ? (parent.parent || null) : null;
    }
    return false;
  }

  function showContextMenu(e, it) {
    let entries;
    if (it && it.id === TRASH_ID) {
      entries = [
        { label: 'Open', fn: () => openItem(it) },
        { label: 'Empty Trash', cls: 'danger', fn: emptyTrash },
      ];
    } else if (it && isInTrash(it)) {
      entries = [
        { label: 'Put back on Home Screen', fn: () => restoreFromTrash(it) },
        'sep',
        { label: 'Delete permanently', cls: 'danger', fn: () => confirmDeletePermanently(it) },
      ];
    } else if (it) {
      entries = [
        { label: 'Open', fn: () => openItem(it) },
        // Files AND folders are GIFs → both download (folders as a bundle) and sign.
        ...(it.fileId ? [{ label: it.kind === 'folder' ? 'Download (as one GIF)' : 'Download', fn: () => downloadItem(it) }] : []),
        ...(it.fileId && signableFiles.has(it.fileId)
          ? (signedFiles.has(it.fileId)
              ? [{ label: 'Verify signature', fn: () => verifyItem(it) }, { label: 'Re-sign this GIF…', fn: () => signItem(it) }]
              : [{ label: 'Sign this GIF…', fn: () => signItem(it) }])
          : []),
        { label: 'Rename', fn: () => beginRename(it) },
        { label: 'Bigger icon', fn: () => resizeIcon(it, +16) },
        { label: 'Smaller icon', fn: () => resizeIcon(it, -16) },
        'sep',
        { label: 'Move to Trash', cls: 'danger', fn: () => moveToTrash(it) },
      ];
    } else {
      entries = [
        { label: 'New Folder', fn: () => newFolder(e.offsetX, e.offsetY) },
        { label: 'Add file(s)…', fn: () => fileInput.click() },
      ];
    }
    buildMenu(e.clientX, e.clientY, entries);
  }
  surface.addEventListener('contextmenu', (e) => { if (e.target === surface) { e.preventDefault(); showContextMenu(e, null); } });
  window.addEventListener('pointerdown', (e) => { if (ctxEl && !ctxEl.contains(e.target)) closeContext(); });

  // ---------- item ops ----------
  // A file's shareable bytes: for a GifOS app with saved state, fold the state
  // in with repack() — swaps ONLY the embedded filesystem block, every pixel
  // and artwork byte stays intact. Everything else exports as-is.
  async function exportBytes(fileId) {
    const file = await store.getFile(fileId);
    if (!file) return null;
    let bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    if (file.isApp && gif.repack) {
      try {
        const state = await store.getState(fileId);
        if (state && state.collections && Object.keys(state.collections).length) {
          const archive = await gif.decode(bytes);
          if (archive && archive.files) {
            const out = {};
            for (const p in archive.files) if (!p.startsWith('.state/')) out[p] = archive.files[p];
            out['.state/db.json'] = gif.textToBytes(JSON.stringify(state));
            bytes = await gif.repack(bytes, out);
          }
        }
      } catch (e) { /* fall back to the raw stored bytes */ }
    }
    return { bytes, file };
  }
  function triggerDownload(bytes, name, mime) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'image/gif' }));
    const a = document.createElement('a');
    a.href = url; a.download = /\.[a-z0-9]+$/i.test(name) ? name : name + '.gif'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  // Download a file's GIF straight from storage — no need to open the app first.
  // Downloading a FOLDER packs a self-contained bundle: the folder's own GIF
  // with every child inside it (apps carrying their live state), recursively.
  async function downloadItem(it) {
    if (it.kind === 'folder') {
      const bytes = await packFolderBundle(it);
      if (bytes) triggerDownload(bytes, (it.name || 'Folder') + '.gif', 'image/gif');
      return;
    }
    const ex = await exportBytes(it.fileId);
    if (ex) triggerDownload(ex.bytes, it.name || ex.file.name || 'download', ex.file.mime);
  }

  // ---------- folder bundles (folders ARE GIFs) ----------
  // Pack: folder's own GIF artwork + folder.json (layout + per-child metadata)
  // + files/<n> (each child's shareable bytes; nested folders recurse into
  // bundles of their own). One GIF = the whole folder, hand it to anyone.
  async function packFolderBundle(folderIt) {
    const payload = { 'manifest.json': JSON.stringify({ gifos: '1.0', type: 'folder', name: folderIt.name }) };
    const list = [];
    let n = 0;
    for (const kid of items.filter((i) => i.parent === folderIt.id)) {
      const path = 'files/' + (n++);
      const base = { name: kid.name, x: kid.x, y: kid.y, iconSize: kid.iconSize || 64, file: path };
      if (kid.kind === 'folder') {
        payload[path] = await packFolderBundle(kid);
        list.push(Object.assign(base, { kind: 'folder' }));
      } else {
        const ex = await exportBytes(kid.fileId);
        if (!ex) { n--; continue; }
        payload[path] = ex.bytes;
        list.push(Object.assign(base, {
          kind: 'file', fileKind: ex.file.kind, mime: ex.file.mime,
          isApp: !!ex.file.isApp, appId: ex.file.appId || null, accent: ex.file.accent || null,
        }));
      }
    }
    payload['folder.json'] = JSON.stringify({ v: 1, items: list });
    const shell = folderIt.fileId ? await store.getFile(folderIt.fileId) : null;
    if (shell) {
      const shellBytes = shell.bytes instanceof Uint8Array ? shell.bytes : new Uint8Array(shell.bytes);
      try { return await gif.repack(shellBytes, payload); } catch (e) { /* shell not repackable */ }
    }
    return gif.encode(payload, { accent: accentFor(folderIt.name) });
  }
  // Unpack: recreate the live folder (its GIF keeps the artwork, children
  // stripped from the payload) and hydrate every child — recursively.
  async function unpackFolderBundle(bundleBytes, archive, m, x, y, parent) {
    const name = m.name || 'Folder';
    let shellBytes = bundleBytes;
    try { shellBytes = await gif.repack(bundleBytes, { 'manifest.json': JSON.stringify({ gifos: '1.0', type: 'folder', name }) }); }
    catch (e) { /* keep full bundle bytes as the shell */ }
    const fileId = store.uid('file');
    await store.putFile({ id: fileId, name: name + '.gif', bytes: shellBytes, kind: 'gif', isApp: false, mime: 'image/gif' });
    const spot = nearestFreeCell(x, y, parent || null, null);
    const folderId = store.uid('item');
    await store.putItem({ id: folderId, kind: 'folder', name, parent: parent || null, x: spot.x, y: spot.y, iconSize: 64, fileId });
    let fj = null;
    try { fj = JSON.parse(bytesToText(archive.files['folder.json'])); } catch (e) { /* empty folder bundle */ }
    for (const entry of (fj && fj.items) || []) {
      const data = archive.files[entry.file];
      if (!data) continue;
      if (entry.kind === 'folder') {
        const subArchive = await gif.decode(data);
        const subM = subArchive ? (gif.readManifest(subArchive) || {}) : {};
        if (subArchive && subM.type === 'folder') {
          await unpackFolderBundle(data, subArchive, subM, entry.x || GRID.origin, entry.y || GRID.origin, folderId);
        }
      } else {
        const fid = store.uid('file');
        await store.putFile({ id: fid, name: entry.name, bytes: data, kind: entry.fileKind || 'gif',
          isApp: !!entry.isApp, appId: entry.appId || null, accent: entry.accent || null,
          mime: entry.mime || 'image/gif' });
        await store.putItem({ id: store.uid('item'), kind: 'file', fileId: fid, name: entry.name,
          parent: folderId, x: entry.x || GRID.origin, y: entry.y || GRID.origin, iconSize: entry.iconSize || 64 });
      }
    }
    await load();
  }
  async function resizeIcon(it, delta) {
    it.iconSize = Math.max(32, Math.min(160, (it.iconSize || 64) + delta));
    await store.putItem(it); render();
  }
  async function moveToTrash(it) {
    if (it.id === TRASH_ID) return;
    it.parent = TRASH_ID;
    const spot = nearestFreeCell(GRID.origin, GRID.origin, TRASH_ID, it.id);
    it.x = spot.x; it.y = spot.y;
    await store.putItem(it);
    await load(); render();
  }
  async function restoreFromTrash(it) {
    it.parent = null;
    const spot = nearestFreeCell(it.x, it.y, null, it.id);
    it.x = spot.x; it.y = spot.y;
    await store.putItem(it);
    await load(); render();
  }
  function descendantsOf(id) {
    const out = [];
    const walk = (pid) => {
      for (const c of items.filter((i) => i.parent === pid)) { out.push(c); walk(c.id); }
    };
    walk(id);
    return out;
  }
  async function purgeItem(it) {
    if (it.fileId) {
      await store.deleteFile(it.fileId);
      await store.deleteState(it.fileId);
      await store.deleteState(it.fileId + '::session');
      if (blobUrls.has(it.fileId)) { URL.revokeObjectURL(blobUrls.get(it.fileId)); blobUrls.delete(it.fileId); }
    }
    await store.deleteItem(it.id);
  }
  function confirmDeletePermanently(it) {
    const doomed = [it, ...descendantsOf(it.id)];
    showConfirm('Delete permanently?',
      'This deletes <b>' + escapeHtml(it.name) + '</b>' + (doomed.length > 1 ? ' and ' + (doomed.length - 1) + ' item(s) inside it' : '') +
      ' forever. There is no undo.',
      [{ label: 'Delete forever', danger: true, fn: async () => {
        for (const d of doomed) await purgeItem(d);
        await load(); render();
      } }]);
  }
  function emptyTrash() {
    const doomed = items.filter((i) => isInTrash(i));
    if (!doomed.length) { showModal('Trash is empty', 'Nothing to delete.'); return; }
    showConfirm('Empty Trash?',
      'Permanently delete <b>' + doomed.length + ' item(s)</b>? There is no undo.',
      [{ label: 'Empty Trash', danger: true, fn: async () => {
        for (const d of doomed) await purgeItem(d);
        await load(); render();
      } }]);
  }
  async function newFolder(x, y) {
    const spot = nearestFreeCell(x || GRID.origin, y || GRID.origin, currentFolder, null);
    const it = await createFolder('New Folder', currentFolder, spot.x, spot.y);
    await load(); render();
    beginRename(it);
  }
  function beginRename(it) {
    const el = surface.querySelector('.icon[data-id="' + it.id + '"]');
    if (!el) return;
    const label = el.querySelector('.label');
    const input = document.createElement('input');
    input.value = it.name; label.innerHTML = ''; label.appendChild(input);
    input.focus(); input.select();
    const commit = async () => {
      it.name = input.value.trim() || it.name;
      await store.putItem(it);
      // keep a folder GIF's embedded manifest in sync with its display name
      if (it.kind === 'folder' && it.fileId) {
        const rec = await store.getFile(it.fileId);
        if (rec) {
          const bytes = rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes);
          try {
            const renamed = await gif.repack(bytes, { 'manifest.json': JSON.stringify({ gifos: '1.0', type: 'folder', name: it.name }) });
            await store.putFile(Object.assign({}, rec, { name: it.name + '.gif', bytes: renamed }));
            if (blobUrls.has(it.fileId)) { URL.revokeObjectURL(blobUrls.get(it.fileId)); blobUrls.delete(it.fileId); }
          } catch (e) { /* not repackable — keep the old gif */ }
        }
      }
      render();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') render(); });
    input.addEventListener('blur', commit);
  }

  // ---------- whole-desktop backup/restore: your computer as ONE GIF ----------
  async function backupDesktop() {
    const [allItems, allFiles, allStates] = await Promise.all([store.allItems(), store.allFiles(), store.allStates()]);
    const archive = {
      'manifest.json': JSON.stringify({ gifos: '1.0', type: 'desktop', name: 'GifOS Desktop Backup', version: VERSION, savedAt: store.nowISO() }),
      'desktop.json': JSON.stringify({
        items: allItems,
        states: allStates,
        fileMeta: allFiles.map((f) => ({ id: f.id, name: f.name, kind: f.kind, isApp: f.isApp, appId: f.appId, accent: f.accent, mime: f.mime })),
      }),
    };
    for (const f of allFiles) {
      archive['files/' + f.id] = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes);
    }
    const bytes = await gif.encode(archive, { accent: [123, 92, 255] });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'gifos-desktop.gif'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function restoreDesktop(archive) {
    const dj = JSON.parse(gif.bytesToText(archive.files['desktop.json']));
    await store.clearAll();
    for (const m of dj.fileMeta || []) {
      const bytes = archive.files['files/' + m.id];
      if (bytes) await store.putFile(Object.assign({}, m, { bytes }));
    }
    for (const it of dj.items || []) await store.putItem(it);
    for (const s of dj.states || []) await store.setState(s.fileId, s.state);
    for (const url of blobUrls.values()) URL.revokeObjectURL(url);
    blobUrls.clear();
    currentFolder = null; selectedId = null;
    await load(); await ensureSystemItems(); render();
    showModal('Home Screen restored', 'Your Home Screen was restored from the backup GIF.');
  }

  // ---------- modals ----------
  function showModal(title, msgHtml) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal"><h3>' + escapeHtml(title) + '</h3><p>' + msgHtml + '</p><button>OK</button></div>';
    bg.querySelector('button').onclick = () => bg.remove();
    bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
  }
  // Confirm with explicit action buttons. Cancel is always present.
  function showConfirm(title, msgHtml, buttons, onCancel) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    const box = document.createElement('div'); box.className = 'modal';
    box.innerHTML = '<h3>' + escapeHtml(title) + '</h3><p>' + msgHtml + '</p>';
    const row = document.createElement('div'); row.className = 'modal-actions';
    for (const btn of buttons) {
      const b = document.createElement('button');
      b.textContent = btn.label;
      if (btn.danger) b.className = 'danger';
      b.onclick = () => { bg.remove(); btn.fn(); };
      row.appendChild(b);
    }
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel'; cancel.className = 'ghost';
    cancel.onclick = () => { bg.remove(); if (onCancel) onCancel(); };
    row.appendChild(cancel);
    box.appendChild(row);
    bg.appendChild(box);
    document.body.appendChild(bg);
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- storage ----------
  // Persistent storage is requested automatically at boot — normal people
  // shouldn't have to know eviction exists. Details live in Settings→Advanced.
  function fmtBytes(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + ' KB';
    return n + ' B';
  }
  function requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) { /* unsupported */ }
  }

  // ---------- background (wallpaper) ----------
  const WALLPAPER_ID = 'sys_wallpaper';
  let wallpaperUrl = null;
  async function applyBackground() {
    let prefs = null;
    try { prefs = await store.getState('sys::prefs'); } catch (e) {}
    const bg = prefs && prefs.bg;
    if (bg && bg.image) {
      const rec = await store.getFile(WALLPAPER_ID);
      if (rec) {
        if (wallpaperUrl) URL.revokeObjectURL(wallpaperUrl);
        wallpaperUrl = URL.createObjectURL(new Blob([rec.bytes], { type: rec.mime || 'image/jpeg' }));
        surface.style.background = 'url(' + wallpaperUrl + ') center / cover no-repeat fixed';
        return;
      }
    }
    if (bg && bg.color) { surface.style.background = bg.color; return; }
    surface.style.background = '';   // the default CSS gradient
  }
  async function setBackgroundColor(color) {
    await store.setState('sys::prefs', { bg: { color } });
    applyBackground();
  }
  async function setBackgroundImage(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await store.putFile({ id: WALLPAPER_ID, name: file.name, bytes, kind: 'wallpaper', mime: file.type || 'image/jpeg' });
    await store.setState('sys::prefs', { bg: { image: true } });
    applyBackground();
  }
  async function resetBackground() {
    await store.setState('sys::prefs', { bg: null });
    await store.deleteFile(WALLPAPER_ID);
    applyBackground();
  }

  // ---------- system bar ----------
  const fileInput = document.getElementById('file-input');
  const restoreInput = document.getElementById('restore-input');
  const sysBtn = document.getElementById('sys-menu-btn');
  const addBtn = document.getElementById('add-btn');

  sysBtn.addEventListener('click', () => menuUnder(sysBtn, [
    { label: 'About GifOS', fn: () => showModal('GifOS v' + VERSION,
      'Your GIF-powered computer, right in your browser. Apps are GIFs. Data is GIFs.<br><br>' +
      'Everything on this Home Screen lives in this browser — nothing on our servers.<br><br>' +
      '<a href="about.html" target="_blank" rel="noopener">What is GifOS?</a> · ' +
      '<a href="' + REPO_URL + '" target="_blank" rel="noopener">Source code</a> · ' +
      '<a href="https://gifos.app" target="_blank" rel="noopener">gifos.app</a>') },
    'sep',
    { label: 'Back up Home Screen…', fn: backupDesktop },
    { label: 'Restore from backup…', fn: () => restoreInput.click() },
    'sep',
    { label: 'Empty Trash', fn: emptyTrash },
    'sep',
    { label: 'Settings…', fn: showSettings },
    { label: 'Erase This Computer…', cls: 'danger', fn: resetFlow },
  ]));

  // ---------- version: update nudge + pinning ----------
  const updateBar = document.getElementById('update-bar');
  function applyUpdateBar() {
    const pinned = pinnedVersion();
    const behind = cmpVer(latestVersion, VERSION) > 0;
    if (!behind) { updateBar.style.display = 'none'; return; }
    updateBar.style.display = '';
    const msg = document.getElementById('update-msg');
    const action = document.getElementById('update-action');
    if (pinned) {
      msg.textContent = 'You are pinned to v' + VERSION + '. Latest is v' + latestVersion + '.';
      action.textContent = 'Return to latest';
      action.onclick = returnToLatest;
    } else {
      msg.textContent = 'A new version of GifOS (v' + latestVersion + ') is available.';
      action.textContent = 'Reload';
      action.onclick = () => location.reload();
    }
  }
  document.getElementById('update-dismiss').onclick = () => { updateBar.style.display = 'none'; };
  function returnToLatest() { try { localStorage.removeItem('gifos_pin'); } catch (e) {} location.href = '/?latest=1'; }

  async function checkForUpdate() {
    try {
      const r = await fetch('/version.json?ts=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const info = await r.json();
      latestVersion = info.current || VERSION;
      availableVersions = Array.isArray(info.versions) && info.versions.length ? info.versions : [VERSION];
      applyUpdateBar();
    } catch (e) { /* offline or no version.json — stay silent */ }
  }

  // One-line, non-technical summary of the last paint for Settings → Advanced.
  function perfLine(s) {
    if (!s) return 'No repaint measured yet.';
    return s.icons + ' icons in view · ' + s.reused + ' reused, ' + s.rebuilt + ' rebuilt · '
      + 'cache holds ' + s.fileCache + ' files, ' + s.blobUrls + ' images.';
  }

  async function showSettings() {
    closeContext();
    const pinned = pinnedVersion();
    const behind = cmpVer(latestVersion, VERSION) > 0;
    const status = pinned ? 'Pinned to v' + VERSION + (behind ? ' (latest is v' + latestVersion + ')' : '')
      : behind ? 'Update available: v' + latestVersion + ' — <a id="set-reload" href="#">reload</a>'
      : 'You are on the latest version.';
    // Version rows (newest first); switching reloads through the bootstrap.
    const rows = availableVersions.slice().sort(cmpVer).reverse().map((v) => {
      const isLatest = v === latestVersion;
      const isActive = v === VERSION && !pinned;
      const tag = (isLatest ? ' (latest)' : '') + (isActive ? ' — current' : (pinned === v ? ' — pinned' : ''));
      const btn = isActive ? '<span class="vtag">current</span>'
        : '<button data-v="' + v + '" class="vbtn">' + (isLatest ? 'Return to latest' : 'Switch to this') + '</button>';
      return '<div class="vrow"><span>v' + escapeHtml(v) + escapeHtml(tag) + '</span>' + btn + '</div>';
    }).join('');
    let relay = ''; try { relay = localStorage.getItem('gifos_relay') || ''; } catch (e) {}

    // Storage facts for the Advanced section.
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate().catch(() => null) : null;
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
    const storageLine = est ? 'Using <b>' + fmtBytes(est.usage || 0) + '</b> of about ' + fmtBytes(est.quota || 0) + '.' : 'Storage details unavailable in this browser.';
    const persistLine = persisted
      ? 'Protected — the browser won\'t clear this Home Screen to free space.'
      : 'Not yet protected. GifOS asks automatically; browsers grant it once a site is used a bit. You can also keep a backup GIF (GifOS menu → Back up Home Screen).';

    let prefs = null; try { prefs = await store.getState('sys::prefs'); } catch (e) {}
    const curColor = (prefs && prefs.bg && prefs.bg.color) || '#0a0a0f';

    const bg = document.createElement('div'); bg.className = 'modal-bg';
    const box = document.createElement('div'); box.className = 'modal wide';
    box.innerHTML =
      '<h3>Settings</h3>' +
      '<h4>Your name</h4>' +
      '<p class="add-help">Friends see this name when you play or work together.</p>' +
      '<input id="set-name" maxlength="40" placeholder="Your name" value="' + escapeHtml(store.identity().name) + '">' +
      '<div class="add-sep"></div>' +
      '<h4>Background</h4>' +
      '<p class="add-help">Pick a color or use your own picture.</p>' +
      '<div class="bg-row">' +
        '<input type="color" id="set-bg-color" value="' + escapeHtml(curColor) + '" title="Background color">' +
        '<button id="set-bg-image">Use a picture…</button>' +
        '<button id="set-bg-reset" class="ghost">Reset</button>' +
      '</div>' +
      '<div class="add-sep"></div>' +
      '<details class="adv"><summary>Advanced settings</summary>' +
      '<h4>Storage</h4>' +
      '<p class="add-help">Your desktop lives entirely in this browser. ' + storageLine + '<br>' + persistLine + '</p>' +
      (persisted ? '' : '<button class="widebtn" id="set-persist">Protect this Home Screen now</button>') +
      '<h4>Version</h4>' +
      '<p class="add-help">Running <b>v' + escapeHtml(VERSION) + '</b>. ' + status + '</p>' +
      '<p class="add-help">Run a specific version — past builds are served unchanged from a subfolder. Your files and data are shared across versions (migrations are additive), so switching is safe and reversible.</p>' +
      '<div class="vlist">' + rows + '</div>' +
      '<h4>Multiplayer relay</h4>' +
      '<p class="add-help">Custom relay (leave blank for the default <span class="mono">wss://relay.gifos.app</span>). Applies to apps you launch afterward.</p>' +
      '<input id="set-relay" placeholder="wss://relay.gifos.app" value="' + escapeHtml(relay) + '">' +
      '<button class="widebtn" id="set-relay-test">Test connection</button>' +
      '<p class="add-help" id="set-relay-status"></p>' +
      '<h4>Performance</h4>' +
      '<p class="add-help">How the last repaint of your Home Screen went. Reused icons are reused as-is (fast); rebuilt ones changed. Mostly useful for spotting a slow, oversized desktop.</p>' +
      '<p class="add-help mono" id="set-perf">' + perfLine(renderStats) + '</p>' +
      '<button class="widebtn" id="set-perf-refresh">Repaint &amp; measure</button>' +
      '</details>' +
      '<div class="modal-actions"><button id="set-save">Save</button><button class="ghost" id="set-close">Close</button></div>';
    bg.appendChild(box); document.body.appendChild(bg);

    box.querySelectorAll('.vbtn').forEach((b) => { b.onclick = () => switchToVersion(b.getAttribute('data-v')); });
    const rel = box.querySelector('#set-reload'); if (rel) rel.onclick = (e) => { e.preventDefault(); location.reload(); };
    box.querySelector('#set-bg-color').addEventListener('input', (e) => setBackgroundColor(e.target.value));
    box.querySelector('#set-bg-image').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => { if (inp.files[0]) setBackgroundImage(inp.files[0]); };
      inp.click();
    };
    box.querySelector('#set-bg-reset').onclick = () => resetBackground();
    // Reachability probe: joining a session with no host makes a healthy relay
    // answer { t:'error', 'no host …' } — ANY message back proves it's alive.
    box.querySelector('#set-relay-test').onclick = () => {
      const out = box.querySelector('#set-relay-status');
      let url = box.querySelector('#set-relay').value.trim() || root.GIFOS_RELAY || '';
      if (!url) { out.textContent = 'No relay configured.'; return; }
      out.textContent = 'Testing ' + url + ' …';
      let done = false;
      const finish = (msg) => { if (!done) { done = true; out.textContent = msg; } };
      try {
        const ws = new WebSocket(url.replace(/\/$/, '') + '/s/connection-test?role=client');
        const timer = setTimeout(() => { finish('No answer after 8 seconds — the relay is unreachable from here.'); try { ws.close(); } catch (e) {} }, 8000);
        ws.onmessage = () => { clearTimeout(timer); finish('Relay is reachable — invites will work.'); try { ws.close(); } catch (e) {} };
        ws.onerror = () => { clearTimeout(timer); finish('Could not connect. If this is the default relay, its Worker may not be deployed on this domain (see relay/ in the repo).'); };
      } catch (e) { finish('Error: ' + (e.message || e)); }
    };
    const perfBtn = box.querySelector('#set-perf-refresh');
    if (perfBtn) perfBtn.onclick = async () => { await render(); box.querySelector('#set-perf').textContent = perfLine(renderStats); };
    const persistBtn = box.querySelector('#set-persist');
    if (persistBtn) persistBtn.onclick = async () => {
      const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false;
      persistBtn.textContent = ok ? 'Protected' : 'The browser declined for now — it grants this once the site is used more';
      persistBtn.disabled = true;
    };
    box.querySelector('#set-save').onclick = () => {
      const v = box.querySelector('#set-relay').value.trim();
      try { if (v) localStorage.setItem('gifos_relay', v); else localStorage.removeItem('gifos_relay'); } catch (e) {}
      store.setName(box.querySelector('#set-name').value);
      bg.remove();
    };
    box.querySelector('#set-close').onclick = () => bg.remove();
    bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  }

  function switchToVersion(v) {
    if (v === latestVersion) { returnToLatest(); return; }
    try { localStorage.setItem('gifos_pin', v); } catch (e) {}
    location.reload(); // bootstrap redirects to /versions/<v>/
  }

  addBtn.addEventListener('click', showAddDialog);

  // Turn a pasted index.html into a real App GIF on the desktop.
  async function createAppFromHtml(name, html, iconSrc) {
    return createAppFromFiles(name, { 'index.html': html }, iconSrc);
  }

  // Turn a set of files (index.html + optional js/css/assets) into an App GIF.
  // iconSrc (optional data URL) or a <link rel="icon"> inside index.html becomes
  // the GIF's visible artwork + desktop thumbnail.
  async function createAppFromFiles(name, files, iconSrc) {
    let manifest = {};
    if (files['manifest.json']) { try { manifest = JSON.parse(bytesToText(files['manifest.json'])); } catch (e) {} }
    const appName = (name || manifest.name || 'My App').toString().trim() || 'My App';
    const slug = (manifest.appId || appName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
    const hasIndex = !!files['index.html'];
    files = Object.assign({}, files);
    files['manifest.json'] = JSON.stringify(Object.assign(
      { gifos: '1.0', appId: slug, name: appName, entry: 'index.html', capabilities: { db: true } }, manifest));

    // Artwork: explicit icon, else an icon declared inside index.html.
    let preview = null;
    const idxHtml = !hasIndex ? '' : (typeof files['index.html'] === 'string' ? files['index.html'] : bytesToText(files['index.html']));
    const src = iconSrc || (hasIndex ? iconFromHtml(idxHtml) : null);
    if (src) { try { preview = await imageToPreview(src); } catch (e) { /* fall back to swatch */ } }

    let seed = 0; for (let i = 0; i < slug.length; i++) seed = (seed * 31 + slug.charCodeAt(i)) >>> 0;
    const bytes = await gif.encode(files, { accent: [123, 92, 255], preview, seed });
    const fileId = store.uid('file');
    const iconName = appName + '.gif';
    await store.putFile({ id: fileId, name: iconName, bytes, kind: 'gif', isApp: hasIndex, appId: slug, mime: 'image/gif' });
    const spot = nearestFreeCell(60, 60, currentFolder, null);
    await store.putItem({ id: store.uid('item'), kind: 'file', fileId, name: iconName,
      parent: currentFolder, x: spot.x, y: spot.y, iconSize: 64 });
    await load(); render();
    return fileId;
  }
  const bytesToText = (b) => gif.bytesToText(b);
  // Accept either raw HTML or an AI reply wrapped in a ```html fence.
  function extractHtml(s) {
    const m = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
    return (m ? m[1] : s).trim();
  }
  function iconFromHtml(html) {
    // Find the whole <link rel="icon"> tag, then pull href from it (any attr
    // order); the delimiter backreference tolerates quotes inside a data URL.
    const link = html.match(/<link\b[^>]*\brel=["']icon["'][^>]*>/i);
    if (link) { const h = link[0].match(/\bhref=(["'])([\s\S]*?)\1/i); if (h) return h[2]; }
    const meta = html.match(/<meta\b[^>]*\bname=["']gifos-icon["'][^>]*>/i);
    if (meta) { const c = meta[0].match(/\bcontent=(["'])([\s\S]*?)\1/i); if (c) return c[2]; }
    return null;
  }
  // Rasterize an image (data URL / object URL, incl. SVG) to a 96×96 RGB332
  // preview frame the GIF encoder can embed as the app's artwork.
  function imageToPreview(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const S = 96;
        const c = document.createElement('canvas'); c.width = S; c.height = S;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#0a0a0f'; ctx.fillRect(0, 0, S, S);
        // cover-fit
        const scale = Math.max(S / (img.width || S), S / (img.height || S));
        const w = (img.width || S) * scale, h = (img.height || S) * scale;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        const data = ctx.getImageData(0, 0, S, S).data;
        const palette = new Array(256 * 3);
        for (let i = 0; i < 256; i++) {
          palette[i * 3] = Math.round(((i >> 5) & 7) * 255 / 7);
          palette[i * 3 + 1] = Math.round(((i >> 2) & 7) * 255 / 7);
          palette[i * 3 + 2] = Math.round((i & 3) * 255 / 3);
        }
        const indices = new Uint8Array(S * S);
        for (let p = 0; p < S * S; p++) {
          const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
          indices[p] = ((r >> 5) & 7) << 5 | ((g >> 5) & 7) << 2 | ((b >> 6) & 3);
        }
        resolve({ width: S, height: S, palette, indices, numColors: 256, minCodeSize: 8 });
      };
      img.onerror = () => reject(new Error('could not load icon image'));
      img.src = src;
    });
  }

  function showAddDialog() {
    closeContext();
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    const box = document.createElement('div'); box.className = 'modal wide';
    box.innerHTML =
      '<h3>Add to your Home Screen</h3>' +
      '<div class="add-actions">' +
        '<button id="ad-file">📄 Add file(s)…</button>' +
        '<button id="ad-folder">📁 New Folder</button>' +
      '</div>' +
      '<div class="add-sep"></div>' +
      '<h4>✨ Ask an AI to build you an app</h4>' +
      '<p class="add-help">Copy this prompt into any AI (Claude, ChatGPT, Gemini…). It asks what you want, then hands you back a <b>finished .gif file</b> — add it with ＋ Add file(s) above, or just drop it on your Home Screen.</p>' +
      '<textarea id="ad-prompt" class="mono" readonly rows="5">' + escapeHtml(AI_PROMPT) + '</textarea>' +
      '<button id="ad-copy" class="widebtn">📋 Copy prompt</button>' +
      '<div class="add-sep"></div>' +
      '<h4>App builder — got HTML instead?</h4>' +
      '<p class="add-help">If your AI could only reply with code, paste its complete index.html below and GifOS packs the GIF for you right here. (A <b>.zip</b> via ＋ Add file(s) works for multi-file apps.)</p>' +
      '<input id="ad-name" placeholder="App name (e.g. Todo)">' +
      '<textarea id="ad-html" rows="4" placeholder="Paste the AI&#39;s complete index.html here (a ```html code block is fine)"></textarea>' +
      '<div class="add-sep"></div>' +
      '<p class="add-help">Made an app? <a href="sign.html" target="_blank" rel="noopener">Sign it 🛡️</a> so people see “Signed by you” — with your domain or email.</p>' +
      '<div class="modal-actions">' +
        '<button id="ad-create">Create app</button>' +
        '<button class="ghost" id="ad-close">Close</button>' +
      '</div>';
    bg.appendChild(box); document.body.appendChild(bg);

    box.querySelector('#ad-file').onclick = () => { bg.remove(); fileInput.click(); };
    box.querySelector('#ad-folder').onclick = () => { bg.remove(); newFolder(60, 60); };
    box.querySelector('#ad-copy').onclick = () => {
      const t = box.querySelector('#ad-prompt'); t.select();
      try { document.execCommand('copy'); } catch (e) {}
      if (navigator.clipboard) navigator.clipboard.writeText(AI_PROMPT).catch(() => {});
      box.querySelector('#ad-copy').textContent = 'Copied — now paste it into any AI';
    };
    box.querySelector('#ad-create').onclick = async () => {
      const html = extractHtml(box.querySelector('#ad-html').value);
      if (!html) { box.querySelector('#ad-html').focus(); return; }
      bg.remove();
      await createAppFromHtml(box.querySelector('#ad-name').value, html);
    };
    box.querySelector('#ad-close').onclick = () => bg.remove();
    bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  }

  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    fileInput.value = '';
    if (files.length) await importFiles(files, 60, 60);
  });

  restoreInput.addEventListener('change', async (e) => {
    const f = (e.target.files || [])[0];
    restoreInput.value = '';
    if (!f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const archive = await gif.decode(bytes);
    if (!archive || !archive.files['desktop.json']) {
      showModal('Not a backup GIF', 'That GIF is not a GifOS backup. (App snapshots load by dropping them on the Home Screen.)');
      return;
    }
    showConfirm('Restore this backup?',
      '<b>This replaces everything currently on this Home Screen</b> with the backup\'s contents.',
      [{ label: 'Replace Home Screen', danger: true, fn: () => restoreDesktop(archive) }]);
  });

  // Dev-only escape hatch — dies before 1.0. Backup is one click away on purpose.
  function resetFlow() {
    showConfirm('Erase this entire computer?',
      'This is not just the Home Screen layout — it wipes the <b>whole computer</b> stored in this browser: every app, file, folder, wallpaper, and all app state. There is no undo and no server copy.',
      [
        { label: 'Back up first, then erase', fn: async () => {
          await backupDesktop();
          showConfirm('Backup downloaded', 'Your computer image is downloading — it can boot or restore this exact computer later. Erase now?',
            [{ label: 'Erase This Computer', danger: true, fn: async () => { await store.clearAll(); location.reload(); } }]);
        } },
        { label: 'Erase without backup', danger: true, fn: async () => { await store.clearAll(); location.reload(); } },
      ]);
  }

  // deselect on empty click/tap
  surface.addEventListener('pointerdown', (e) => { if (e.target === surface) { selectedId = null; surface.querySelectorAll('.icon.selected').forEach((n) => n.classList.remove('selected')); } });

  // Any write to a file's bytes (create, rename, sign, wallpaper) or its removal
  // must drop that file's cached record/blob/node, so the next paint rebuilds it
  // from fresh bytes instead of the stale cache. Wrapped once, here, so every
  // call site is covered.
  (function invalidateOnFileWrites() {
    const put = store.putFile.bind(store);
    store.putFile = (rec) => { if (rec && rec.id) forgetFile(rec.id); return put(rec); };
    const del = store.deleteFile.bind(store);
    store.deleteFile = (id) => { forgetFile(id); return del(id); };
  })();

  // ---------- cross-tab live sync ----------
  // Two tabs on the same origin ARE the same desktop (one IndexedDB); keep the
  // views matched. Every local mutation announces on a BroadcastChannel and
  // other tabs re-render; a visibility refresh catches anything missed.
  if ('BroadcastChannel' in root) {
    const sync = new BroadcastChannel(store.syncChannel);
    for (const k of ['putItem', 'deleteItem', 'putFile', 'deleteFile', 'setState', 'deleteState', 'clearAll']) {
      const orig = store[k].bind(store);
      store[k] = (...args) => orig(...args).then((r) => { sync.postMessage(1); return r; });
    }
    let pending = null;
    sync.onmessage = () => { // messages never echo to the posting tab
      if (pending) clearTimeout(pending);
      // Another tab could have rewritten any file's bytes — repaint from scratch.
      pending = setTimeout(() => { pending = null; dropRenderCaches(); load().then(render); }, 200);
    };
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { dropRenderCaches(); load().then(render); }
  });

  // ---------- boot ----------
  requestPersistence();
  load().then(seedIfEmpty).then(ensureSystemItems).then(render).then(checkForUpdate);

  GifOS.desktop = { render, load, get stats() { return renderStats; } };
})(typeof window !== 'undefined' ? window : globalThis);
