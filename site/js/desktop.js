/*
 * desktop.js — The GifOS desktop.
 *
 * A persistent, local-first desktop: icons for every dropped file, folders,
 * drag to arrange, drag into folders, resize icons, double-click to run an
 * executable GIF in a new tab (unsupported files show a "not supported" note).
 * All layout + bytes live in IndexedDB (GifOS.store).
 */
(function (root) {
  const GifOS = root.GifOS;
  const store = GifOS.store, gif = GifOS.gif;
  const surface = document.getElementById('desktop');
  const crumbs = document.getElementById('crumbs');

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
      hint.textContent = currentFolder ? 'Empty folder — drop files here or right-click for New Folder.'
        : 'Drop any file here. Double-click an app GIF to run it.';
      surface.appendChild(hint);
    }
    for (const it of visible) await renderIcon(it);
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
    if (it.kind === 'folder') {
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
      if (targetFolder) {
        it.parent = targetFolder.id;                     // dropped into a folder
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

  // ---------- drop files from the OS ----------
  ['dragenter', 'dragover'].forEach((ev) => surface.addEventListener(ev, (e) => { e.preventDefault(); surface.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) => surface.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.target === surface) surface.classList.remove('dragover'); }));
  surface.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    let i = 0;
    for (const f of files) {
      const buf = new Uint8Array(await f.arrayBuffer());
      const isGif = f.type.includes('gif') || /\.gif$/i.test(f.name);
      const archive = isGif ? await gif.decode(buf) : null;
      const isApp = !!archive;
      let appId = null, accent = null;
      if (isApp) { const m = gif.readManifest(archive) || {}; appId = m.appId; accent = m.accent; }
      const fileId = store.uid('file');
      await store.putFile({ id: fileId, name: f.name, bytes: buf, kind: isGif ? 'gif' : 'other',
        isApp, appId, accent, mime: f.type || 'application/octet-stream' });
      const spot = nearestFreeCell(e.offsetX + i * 20, e.offsetY + i * 20, currentFolder, null);
      await store.putItem({ id: store.uid('item'), kind: 'file', fileId, name: f.name,
        parent: currentFolder, x: spot.x, y: spot.y, iconSize: 64 });
      await load(); // refresh items so the next file's free-cell search sees this one
      i++;
    }
    render();
  });

  // ---------- context menu ----------
  let ctxEl = null;
  function closeContext() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }
  function showContextMenu(e, it) {
    closeContext();
    const menu = document.createElement('div');
    menu.className = 'ctx';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    const add = (label, fn, cls) => {
      const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls;
      b.onclick = () => { closeContext(); fn(); }; menu.appendChild(b);
    };
    if (it) {
      if (it.kind === 'file') add('Open', () => openItem(it));
      add('Rename', () => beginRename(it));
      add('Bigger icon', () => resizeIcon(it, +16));
      add('Smaller icon', () => resizeIcon(it, -16));
      const sep = document.createElement('div'); sep.className = 'sep'; menu.appendChild(sep);
      add('Delete', () => deleteItem(it), 'danger');
    } else {
      add('New Folder', () => newFolder(e.offsetX, e.offsetY));
    }
    document.body.appendChild(menu);
    ctxEl = menu;
  }
  surface.addEventListener('contextmenu', (e) => { if (e.target === surface) { e.preventDefault(); showContextMenu(e, null); } });
  window.addEventListener('mousedown', (e) => { if (ctxEl && !ctxEl.contains(e.target)) closeContext(); });

  // ---------- item ops ----------
  async function resizeIcon(it, delta) {
    it.iconSize = Math.max(32, Math.min(160, (it.iconSize || 64) + delta));
    await store.putItem(it); render();
  }
  async function deleteItem(it) {
    if (it.kind === 'folder') {
      const children = items.filter((c) => c.parent === it.id);
      for (const c of children) { c.parent = it.parent || null; await store.putItem(c); }
    }
    if (it.fileId) { await store.deleteFile(it.fileId); if (blobUrls.has(it.fileId)) { URL.revokeObjectURL(blobUrls.get(it.fileId)); blobUrls.delete(it.fileId); } }
    await store.deleteItem(it.id);
    await load(); render();
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

  // ---------- modal ----------
  function showModal(title, msg) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<div class="modal"><h3>' + escapeHtml(title) + '</h3><p>' + msg + '</p><button>OK</button></div>';
    bg.querySelector('button').onclick = () => bg.remove();
    bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- toolbar ----------
  document.getElementById('new-folder').onclick = () => newFolder(60, 60);
  document.getElementById('reset').onclick = async () => {
    if (confirm('Reset the desktop? This clears all files, folders, and saved state in this browser.')) {
      await store.clearAll(); location.reload();
    }
  };

  // deselect on empty click/tap
  surface.addEventListener('pointerdown', (e) => { if (e.target === surface) { selectedId = null; surface.querySelectorAll('.icon.selected').forEach((n) => n.classList.remove('selected')); } });

  // ---------- boot ----------
  load().then(seedIfEmpty).then(render);

  GifOS.desktop = { render, load };
})(typeof window !== 'undefined' ? window : globalThis);
