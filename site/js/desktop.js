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

  const VERSION = '0.4.0';
  const TRASH_ID = 'sys_trash';
  const REPO_URL = 'https://github.com/nwcnwc/gifos';

  let items = [];                 // all desktop items (files + folders)
  let currentFolder = null;       // null = root, else folder id
  const blobUrls = new Map();     // fileId -> object URL (for gif thumbnails)
  let selectedId = null;

  // ---------- data ----------
  function load() { return store.allItems().then((all) => { items = all; }); }

  function gridPosition(index) {
    const cols = Math.max(1, Math.floor((surface.clientWidth - 20) / 116));
    return { x: 16 + (index % cols) * 116, y: 16 + Math.floor(index / cols) * 116 };
  }

  async function seedIfEmpty() {
    if (items.length) return;
    const samples = await GifOS.samples.build();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const fileId = store.uid('file');
      await store.putFile({ id: fileId, name: s.name, bytes: s.bytes, kind: 'gif',
        isApp: true, appId: s.appId, accent: s.accent, mime: 'image/gif' });
      const pos = gridPosition(i);
      await store.putItem({ id: store.uid('item'), kind: 'file', fileId, name: s.name,
        parent: null, x: pos.x, y: pos.y, iconSize: 64 });
    }
    await load();
  }

  // The Trash exists on every desktop, including old ones from before it shipped.
  async function ensureSystemItems() {
    if (!items.find((i) => i.id === TRASH_ID)) {
      const spot = nearestFreeCell(GRID.origin, GRID.origin + 3 * GRID.pitch, null, null);
      await store.putItem({ id: TRASH_ID, kind: 'folder', name: 'Trash', parent: null,
        x: spot.x, y: spot.y, iconSize: 64 });
      await load();
    }
  }

  // ---------- rendering ----------
  function blobUrlFor(fileId, bytes) {
    if (blobUrls.has(fileId)) return blobUrls.get(fileId);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/gif' }));
    blobUrls.set(fileId, url);
    return url;
  }

  const FILE_EMOJI = { gif: '🖼️', other: '📄' };

  async function render() {
    surface.querySelectorAll('.icon, .hint').forEach((n) => n.remove());
    updateCrumbs();
    const visible = items.filter((it) => (it.parent || null) === currentFolder);
    if (!visible.length) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = currentFolder === TRASH_ID ? 'Trash is empty.'
        : currentFolder ? 'Empty folder — drop files here or use ＋ Add.'
        : 'Drop any file here, or use ＋ Add. Double-click an app GIF to run it.';
      surface.appendChild(hint);
    }
    for (const it of visible) await renderIcon(it);
    refreshStorage();
  }

  async function renderIcon(it) {
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
      thumb.textContent = '📁';
    } else {
      const file = await store.getFile(it.fileId);
      if (file && file.kind === 'gif') {
        const img = document.createElement('img');
        img.src = blobUrlFor(it.fileId, file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes));
        img.alt = it.name;
        img.draggable = false; // pointer-drag the icon, not the image
        thumb.appendChild(img);
      } else {
        thumb.textContent = FILE_EMOJI[file ? file.kind : 'other'] || '📄';
      }
    }
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = it.name;

    el.appendChild(thumb);
    el.appendChild(label);
    surface.appendChild(el);
    wireIcon(el, it);
  }

  function updateCrumbs() {
    if (!currentFolder) { crumbs.textContent = 'Desktop'; return; }
    const folder = items.find((i) => i.id === currentFolder);
    crumbs.innerHTML = '<a id="crumb-root">Desktop</a> › ' + (folder ? escapeHtml(folder.name) : '…');
    const rootLink = document.getElementById('crumb-root');
    if (rootLink) rootLink.onclick = () => { currentFolder = null; selectedId = null; render(); };
  }

  // ---------- grid snapping (Windows-style: drag anywhere, land on a cell) ----
  const GRID = { origin: 16, pitch: 116 };
  const gridCols = () => Math.max(1, Math.floor((surface.clientWidth - 20) / GRID.pitch));
  function cellOf(x, y, cols) {
    return {
      col: Math.min(cols - 1, Math.max(0, Math.round(((x || GRID.origin) - GRID.origin) / GRID.pitch))),
      row: Math.max(0, Math.round(((y || GRID.origin) - GRID.origin) / GRID.pitch)),
    };
  }
  // Nearest empty cell to (px,py) among siblings in `parent`, ring-searching outward.
  function nearestFreeCell(px, py, parent, excludeId) {
    const cols = gridCols();
    const target = cellOf(px, py, cols);
    const taken = new Set(items
      .filter((i) => (i.parent || null) === (parent || null) && i.id !== excludeId)
      .map((i) => { const c = cellOf(i.x, i.y, cols); return c.col + ',' + c.row; }));
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
      if (best) return { x: GRID.origin + best.col * GRID.pitch, y: GRID.origin + best.row * GRID.pitch };
    }
    return { x: px, y: py }; // desktop is impossibly full — leave as dropped
  }

  // ---------- icon interaction (drag, double-click, select) ----------
  // Pointer events unify mouse + touch; long-press opens the context menu on touch.
  function wireIcon(el, it) {
    let down = null, moved = false, lpTimer = null;
    const clearLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };

    el.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'INPUT') return;          // renaming — let the input work
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();                                 // no native image drag / text select
      selectedId = it.id;
      surface.querySelectorAll('.icon').forEach((n) => n.classList.toggle('selected', n === el));
      down = { x: e.clientX, y: e.clientY, ox: it.x || GRID.origin, oy: it.y || GRID.origin };
      moved = false;
      el.setPointerCapture(e.pointerId);
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
        el.style.left = Math.max(0, down.ox + dx) + 'px';
        el.style.top = Math.max(0, down.oy + dy) + 'px';
        highlightDropTarget(e, it);
      }
    });
    el.addEventListener('pointerup', async (e) => {
      clearLp();
      if (!down) return;
      const wasMoved = moved; down = null;
      if (!wasMoved) return;
      const targetFolder = folderUnder(e, it);
      if (targetFolder && it.id !== TRASH_ID) {
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
  function highlightDropTarget(e, dragItem) {
    clearDropTargets();
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
    if (file && file.kind === 'gif' && file.isApp) {
      root.open('run.html#id=' + encodeURIComponent(it.fileId), '_blank');
    } else {
      showModal('Not supported', 'GifOS can only run executable GIFs in its format. "' + escapeHtml(it.name) + '" opened as a file, not an app.');
    }
  }

  // ---------- import files (shared by OS drag-drop and the ＋ Add picker) -----
  async function importFiles(fileList, baseX, baseY) {
    let i = 0;
    for (const f of fileList) {
      const buf = new Uint8Array(await f.arrayBuffer());
      const isGif = f.type.includes('gif') || /\.gif$/i.test(f.name);
      const archive = isGif ? await gif.decode(buf) : null;
      const m = archive ? (gif.readManifest(archive) || {}) : {};

      // A whole-desktop backup GIF gets offered as a restore, not an icon.
      if (archive && m.type === 'desktop' && archive.files['desktop.json']) {
        await new Promise((done) => {
          showConfirm('Desktop backup detected',
            '"' + escapeHtml(f.name) + '" is a full GifOS desktop backup. Restore it? ' +
            '<b>This replaces everything currently on this desktop.</b>',
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
    await importFiles(Array.from(e.dataTransfer.files || []), e.offsetX, e.offsetY);
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
        { label: 'Restore to Desktop', fn: () => restoreFromTrash(it) },
        'sep',
        { label: 'Delete permanently', cls: 'danger', fn: () => confirmDeletePermanently(it) },
      ];
    } else if (it) {
      entries = [
        ...(it.kind === 'file' ? [{ label: 'Open', fn: () => openItem(it) }] : []),
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
    const it = { id: store.uid('item'), kind: 'folder', name: 'New Folder', parent: currentFolder,
      x: spot.x, y: spot.y, iconSize: 64 };
    await store.putItem(it); await load(); render();
    beginRename(it);
  }
  function beginRename(it) {
    const el = surface.querySelector('.icon[data-id="' + it.id + '"]');
    if (!el) return;
    const label = el.querySelector('.label');
    const input = document.createElement('input');
    input.value = it.name; label.innerHTML = ''; label.appendChild(input);
    input.focus(); input.select();
    const commit = async () => { it.name = input.value.trim() || it.name; await store.putItem(it); render(); };
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
    showModal('Desktop restored', 'Your desktop was restored from the backup GIF.');
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

  // ---------- storage pill ----------
  const storagePill = document.getElementById('storage-pill');
  function fmtBytes(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + ' KB';
    return n + ' B';
  }
  async function refreshStorage() {
    if (!navigator.storage || !navigator.storage.estimate) { storagePill.style.display = 'none'; return; }
    try {
      const est = await navigator.storage.estimate();
      storagePill.textContent = '💾 ' + fmtBytes(est.usage || 0);
      storagePill.title = fmtBytes(est.usage || 0) + ' used of ~' + fmtBytes(est.quota || 0) + ' available';
    } catch (e) { /* estimate unsupported */ }
  }
  storagePill.addEventListener('click', async () => {
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : { usage: 0, quota: 0 };
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    const status = persisted
      ? '✅ <b>Persistent storage is ON.</b> The browser will not evict this desktop under storage pressure.'
      : '⚠️ <b>Persistent storage is OFF.</b> Under storage pressure the browser could evict this desktop. Enable it — and keep a backup GIF (GifOS menu → Back up desktop).';
    showConfirm('Storage',
      'This desktop lives entirely in this browser.<br><br>Used: <b>' + fmtBytes(est.usage || 0) + '</b> of ~' + fmtBytes(est.quota || 0) + '<br><br>' + status,
      persisted ? [] : [{ label: 'Enable persistent storage', fn: async () => {
        const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false;
        showModal('Persistent storage', ok ? 'Enabled — the browser will protect this desktop from eviction.'
          : 'The browser declined for now. It usually grants this once a site is used more (or bookmarked/installed). Keep a backup GIF meanwhile.');
      } }]);
  });

  // ---------- system bar ----------
  const fileInput = document.getElementById('file-input');
  const restoreInput = document.getElementById('restore-input');
  const sysBtn = document.getElementById('sys-menu-btn');
  const addBtn = document.getElementById('add-btn');

  sysBtn.addEventListener('click', () => menuUnder(sysBtn, [
    { label: 'About GifOS', fn: () => showModal('GifOS v' + VERSION,
      'Your GIF-powered desktop. Apps are GIFs. Data is GIFs.<br><br>' +
      'Everything on this desktop lives in this browser — nothing on our servers.<br><br>' +
      '<a href="' + REPO_URL + '" target="_blank" rel="noopener">Source code</a> · ' +
      '<a href="https://gifos.app" target="_blank" rel="noopener">gifos.app</a>') },
    'sep',
    { label: 'Back up desktop…', fn: backupDesktop },
    { label: 'Restore from backup…', fn: () => restoreInput.click() },
    'sep',
    { label: 'Empty Trash', fn: emptyTrash },
    'sep',
    { label: 'Reset desktop…', cls: 'danger', fn: resetFlow },
  ]));

  addBtn.addEventListener('click', () => menuUnder(addBtn, [
    { label: 'Add file(s)…', fn: () => fileInput.click() },
    { label: 'New Folder', fn: () => newFolder(60, 60) },
  ]));

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
      showModal('Not a desktop backup', 'That GIF is not a GifOS desktop backup. (App snapshots load by dropping them on the desktop.)');
      return;
    }
    showConfirm('Restore this backup?',
      '<b>This replaces everything currently on this desktop</b> with the backup\'s contents.',
      [{ label: 'Replace desktop', danger: true, fn: () => restoreDesktop(archive) }]);
  });

  // Dev-only escape hatch — dies before 1.0. Backup is one click away on purpose.
  function resetFlow() {
    showConfirm('Reset this desktop?',
      'This erases <b>every file, folder, and app state</b> stored in this browser. There is no undo and no server copy.',
      [
        { label: 'Back up first, then reset', fn: async () => {
          await backupDesktop();
          showConfirm('Backup downloaded', 'Your desktop backup GIF is downloading. Reset now?',
            [{ label: 'Reset desktop', danger: true, fn: async () => { await store.clearAll(); location.reload(); } }]);
        } },
        { label: 'Reset without backup', danger: true, fn: async () => { await store.clearAll(); location.reload(); } },
      ]);
  }

  // deselect on empty click/tap
  surface.addEventListener('pointerdown', (e) => { if (e.target === surface) { selectedId = null; surface.querySelectorAll('.icon.selected').forEach((n) => n.classList.remove('selected')); } });

  // ---------- cross-tab live sync ----------
  // Two tabs on the same origin ARE the same desktop (one IndexedDB); keep the
  // views matched. Every local mutation announces on a BroadcastChannel and
  // other tabs re-render; a visibility refresh catches anything missed.
  if ('BroadcastChannel' in root) {
    const sync = new BroadcastChannel('gifos-desktop-sync');
    for (const k of ['putItem', 'deleteItem', 'putFile', 'deleteFile', 'setState', 'deleteState', 'clearAll']) {
      const orig = store[k].bind(store);
      store[k] = (...args) => orig(...args).then((r) => { sync.postMessage(1); return r; });
    }
    let pending = null;
    sync.onmessage = () => { // messages never echo to the posting tab
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => { pending = null; load().then(render); }, 200);
    };
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) load().then(render);
  });

  // ---------- boot ----------
  load().then(seedIfEmpty).then(ensureSystemItems).then(render);

  GifOS.desktop = { render, load };
})(typeof window !== 'undefined' ? window : globalThis);
