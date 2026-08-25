/*
 * gifos-lock.js — passkey lock for an installed GifOS app.
 *
 * Launch gate AND crypto wrap, always. A lock that only hid Open while leaving
 * private data readable would be a misunderstanding.
 *
 * WHAT IS WRAPPED. Private data at rest: saved state (IndexedDB gifos.db /
 * .state/* inside the app GIF). The wrapping key comes from WebAuthn PRF
 * (hmac-secret) on a platform passkey.
 *
 * WHAT STAYS CLEAR. GIF frames, the NETSCAPE loop, image descriptors, palettes,
 * the trailer — the animation. stripForDisplay still drops the whole GIFOS1.0
 * Application Extension, so the Home Screen ornament is unchanged and keeps
 * playing. App code (manifest, index.html, assets) stays in the clear
 * filesystem so a downloaded locked GIF is still a playable GIF that looks
 * like an app; only the private payload is sealed.
 *
 * FORMAT. The wrap lives INSIDE the GifOS Application Extension (the
 * filesystem), never in the pixel stream. GifOS.gif.repack swaps that block
 * and leaves every pixel byte identical.
 *
 *   index.html, app.js, manifest.json, assets/  — clear (the app itself)
 *   .state/*                                    — gone (moved into the wrap)
 *   .lock/v1                                    — AES-GCM of the private files
 *
 * .lock/v1 bytes:
 *   magic "GLK1" (4) | version u8=1 | iv (12) | ciphertext (AES-GCM-256,
 *   16-byte tag at the end). Plaintext is UTF-8 JSON
 *   { v:1, files:{ path: b64 } } of every .state/* file (and a packed
 *   .state/db.json of live IndexedDB state). Wrong key / truncated / bad
 *   magic → fail shut.
 *
 * WebAuthn runs in OS chrome (desktop.js / run.html), NEVER inside the GIF:
 * the sandbox is an opaque origin. Same shape as payments: a GifOS sheet
 * first, then the browser passkey dialog. userVerification required, platform
 * authenticator. No PRF → "This device cannot passkey-lock." No silent skip.
 *
 * Attaches to `GifOS.lock`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (GifOS.lock) return;

  const MAGIC = [0x47, 0x4c, 0x4b, 0x31]; // GLK1
  const LOCK_PATH = '.lock/v1';
  const INFO = 'gifos-app-lock-v1';
  const CANNOT = 'This device cannot passkey-lock.';

  const gif = () => GifOS.gif;
  const store = () => GifOS.store;
  const te = (s) => new TextEncoder().encode(s);
  const td = (b) => new TextDecoder().decode(b);
  const b64e = (b) => gif().b64encode(b);
  const b64d = (s) => gif().b64decode(s);
  const asBytes = (v) => (typeof v === 'string' ? gif().textToBytes(v) : (v instanceof Uint8Array ? v : new Uint8Array(v || [])));

  function isPrivatePath(p) {
    return typeof p === 'string' && p.indexOf('.state/') === 0;
  }
  function isLockPath(p) {
    return typeof p === 'string' && p.indexOf('.lock/') === 0;
  }

  // ---- AES-GCM wrap of a files dict ----------------------------------------
  async function importRawKey(raw) {
    const bytes = asBytes(raw);
    if (bytes.length < 32) throw new Error('passkey wrap key is too short');
    return crypto.subtle.importKey('raw', bytes.subarray(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
  async function keyFromPrf(prf) {
    const raw = prf instanceof Uint8Array ? prf : new Uint8Array(prf);
    if (raw.length < 32) throw new Error(CANNOT);
    const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: te(INFO) },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']);
  }

  function packFiles(files) {
    const out = {};
    for (const p of Object.keys(files || {})) out[p] = b64e(asBytes(files[p]));
    return JSON.stringify({ v: 1, files: out });
  }
  function unpackFiles(json) {
    const obj = JSON.parse(typeof json === 'string' ? json : td(json));
    if (!obj || obj.v !== 1 || !obj.files || typeof obj.files !== 'object') throw new Error('bad wrap payload');
    const out = {};
    for (const p of Object.keys(obj.files)) out[p] = b64d(obj.files[p]);
    return out;
  }

  async function encryptBytes(plain, key) {
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, asBytes(plain)));
    const out = new Uint8Array(4 + 1 + 12 + ct.length);
    out[0] = MAGIC[0]; out[1] = MAGIC[1]; out[2] = MAGIC[2]; out[3] = MAGIC[3];
    out[4] = 1;
    out.set(iv, 5);
    out.set(ct, 17);
    return out;
  }
  async function decryptBytes(wrapped, key) {
    const b = asBytes(wrapped);
    if (b.length < 17 + 16) throw new Error('truncated wrap');
    if (b[0] !== MAGIC[0] || b[1] !== MAGIC[1] || b[2] !== MAGIC[2] || b[3] !== MAGIC[3]) throw new Error('not a passkey wrap');
    if (b[4] !== 1) throw new Error('unknown wrap version');
    const iv = b.subarray(5, 17);
    const ct = b.subarray(17);
    try {
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
    } catch (e) {
      throw new Error('wrong passkey, or the wrap is damaged');
    }
  }

  async function wrapFiles(files, key) {
    const priv = {};
    for (const p of Object.keys(files || {})) if (isPrivatePath(p)) priv[p] = files[p];
    return encryptBytes(packFiles(priv), key);
  }
  async function unwrapFiles(blob, key) {
    return unpackFiles(await decryptBytes(blob, key));
  }

  function splitClear(files) {
    const clear = {}, priv = {};
    for (const p of Object.keys(files || {})) {
      if (isLockPath(p)) continue;
      if (isPrivatePath(p)) priv[p] = files[p];
      else clear[p] = files[p];
    }
    return { clear, priv };
  }
  function isWrappedFiles(files) {
    return !!(files && files[LOCK_PATH]);
  }

  async function wrapGif(bytes, key, extraPriv) {
    const g = gif();
    const archive = await g.decode(bytes);
    if (!archive || !archive.files) throw new Error('not a GifOS gif');
    const { clear, priv } = splitClear(archive.files);
    const merged = Object.assign({}, priv, extraPriv || {});
    clear[LOCK_PATH] = await wrapFiles(merged, key);
    return g.repack(bytes, clear);
  }
  async function unwrapGif(bytes, key) {
    const g = gif();
    const archive = await g.decode(bytes);
    if (!archive || !archive.files) throw new Error('not a GifOS gif');
    if (!archive.files[LOCK_PATH]) return { bytes, files: archive.files, changed: false };
    const priv = await unwrapFiles(archive.files[LOCK_PATH], key);
    const files = {};
    for (const p of Object.keys(archive.files)) if (!isLockPath(p)) files[p] = archive.files[p];
    Object.assign(files, priv);
    return { bytes: await g.repack(bytes, files), files, changed: true };
  }

  // ---- IndexedDB state blob -------------------------------------------------
  function isSealed(state) {
    return !!(state && state._gifosLock === 1 && typeof state.blob === 'string');
  }
  async function sealState(state, key) {
    const packed = (store() && store().packJSON) ? store().packJSON(state || { collections: {} }) : JSON.stringify(state || { collections: {} });
    const blob = await encryptBytes(packed, key);
    // Whole GLK1 blob as one b64 so getState returns a non-collections row
    // (not exploded into apprecords).
    return { _gifosLock: 1, v: 1, blob: b64e(blob) };
  }
  async function openState(sealed, key) {
    if (!isSealed(sealed)) return sealed;
    const plain = td(await decryptBytes(b64d(sealed.blob), key));
    if (store() && store().unpackJSON) return store().unpackJSON(plain);
    return JSON.parse(plain);
  }

  // ---- WebAuthn -------------------------------------------------------------
  const sessions = new Map(); // fileId -> CryptoKey (this tab only)

  function prfFrom(cred) {
    try {
      const ext = cred && cred.getClientExtensionResults && cred.getClientExtensionResults();
      const first = ext && ext.prf && ext.prf.results && ext.prf.results.first;
      if (!first) return null;
      const u = first instanceof Uint8Array ? first : new Uint8Array(first);
      return u.length ? u : null;
    } catch (e) { return null; }
  }
  function rand(n) {
    const u = new Uint8Array(n);
    crypto.getRandomValues(u);
    return u;
  }
  function rpId() {
    try { return root.location.hostname || undefined; } catch (e) { return undefined; }
  }

  async function canPasskeyLock() {
    if (overrideRaw()) return { ok: true, test: true };
    const C = root.PublicKeyCredential;
    if (!C || typeof root.navigator === 'undefined' || !root.navigator.credentials) {
      return { ok: false, reason: CANNOT };
    }
    try {
      if (typeof C.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        const uv = await C.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!uv) return { ok: false, reason: CANNOT };
      }
      if (typeof C.getClientCapabilities === 'function') {
        const caps = await C.getClientCapabilities();
        // Absent key: browser too old to advertise; we still try create+get.
        if (caps && caps['extension:prf'] === false) return { ok: false, reason: CANNOT };
      }
    } catch (e) {
      return { ok: false, reason: CANNOT };
    }
    return { ok: true };
  }

  function overrideRaw() {
    const direct = GifOS.lock && GifOS.lock._prfOverride;
    if (direct) return direct instanceof Uint8Array ? direct : new Uint8Array(direct);
    try {
      const s = root.localStorage && root.localStorage.getItem('gifos_lock_test_prf');
      if (s) return b64d(s);
    } catch (e) {}
    return null;
  }
  async function overrideKey() {
    const raw = overrideRaw();
    if (!raw) return null;
    return keyFromPrf(raw);
  }

  async function createLock(appName, fileId) {
    const forced = await overrideKey();
    if (forced) {
      return {
        key: forced,
        meta: {
          v: 1, credId: b64e(rand(16)), userId: b64e(rand(16)), salt: b64e(rand(32)),
          rpId: rpId() || '', createdAt: (store() && store().nowISO) ? store().nowISO() : '',
          test: true,
        },
      };
    }
    const cap = await canPasskeyLock();
    if (!cap.ok) throw new Error(cap.reason);
    const userId = rand(16);
    const salt = rand(32);
    const challenge = rand(32);
    const cred = await navigator.credentials.create({
      publicKey: {
        rp: { name: 'GifOS', id: rpId() },
        user: { id: userId, name: String(fileId), displayName: String(appName || 'App') },
        challenge,
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'required',
          requireResidentKey: true,
        },
        timeout: 120000,
        attestation: 'none',
        extensions: { prf: { eval: { first: salt } } },
      },
    });
    if (!cred || !cred.rawId) throw new Error(CANNOT);
    let prf = prfFrom(cred);
    if (!prf) {
      const got = await navigator.credentials.get({
        publicKey: {
          challenge: rand(32),
          rpId: rpId(),
          allowCredentials: [{ type: 'public-key', id: cred.rawId, transports: ['internal'] }],
          userVerification: 'required',
          timeout: 120000,
          extensions: { prf: { eval: { first: salt } } },
        },
      });
      prf = prfFrom(got);
    }
    if (!prf) throw new Error(CANNOT);
    const key = await keyFromPrf(prf);
    return {
      key,
      meta: {
        v: 1,
        credId: b64e(new Uint8Array(cred.rawId)),
        userId: b64e(userId),
        salt: b64e(salt),
        rpId: rpId() || '',
        createdAt: (store() && store().nowISO) ? store().nowISO() : '',
      },
    };
  }

  async function assertLock(meta) {
    if (!meta || !meta.credId || !meta.salt) throw new Error('This app is passkey-locked, but the lock record is missing.');
    const forced = await overrideKey();
    if (forced) return forced;
    const cap = await canPasskeyLock();
    if (!cap.ok) throw new Error('This passkey is not on this device.');
    const credId = b64d(meta.credId);
    const salt = b64d(meta.salt);
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: rand(32),
        rpId: meta.rpId || rpId(),
        allowCredentials: [{ type: 'public-key', id: credId, transports: ['internal'] }],
        userVerification: 'required',
        timeout: 120000,
        extensions: { prf: { eval: { first: salt } } },
      },
    });
    const prf = prfFrom(got);
    if (!prf) throw new Error('This passkey is not on this device.');
    return keyFromPrf(prf);
  }

  // ---- GifOS sheet (trusted display BEFORE the browser passkey dialog) ------
  const COPY = {
    lock: {
      title: 'Passkey lock',
      lead: (n) => 'Require a passkey (fingerprint, Face ID, or this device’s PIN) to open <b>' + n + '</b>. Your saved data is encrypted on this device. The icon still plays.',
      ok: 'Lock this app',
    },
    open: {
      title: (n) => 'Unlock ' + n,
      lead: () => 'This app’s private data is passkey-locked on this device. Use your passkey to open it.',
      ok: 'Unlock',
    },
    remove: {
      title: 'Remove passkey lock',
      lead: (n) => 'Your passkey will unwrap <b>' + n + '</b>’s private data on this device. Anyone who can use this computer can then open it.',
      ok: 'Remove lock',
    },
    export: {
      title: (n) => 'Download ' + n,
      lead: () => 'This app’s private data is passkey-locked. Unlock to download it with your saved data, or download the app without your data. The animation is included either way.',
      ok: 'Download with my data',
      alt: 'Download without my data',
    },
  };
  const CSS = '' +
    '.lock-modal{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:1rem}' +
    '.lock-box{background:var(--surface,#14141f);border:1px solid var(--border,#2a2a3f);border-radius:.8rem;padding:1.4rem 1.5rem;max-width:420px;width:100%;color:var(--text,#e0e0f0);font:15px system-ui,sans-serif}' +
    '.lock-box h3{margin:0 0 .5rem;font-size:1.1rem}' +
    '.lock-box .lead{color:var(--muted,#b0b0c8);font-size:.88rem;line-height:1.5;margin-bottom:1.1rem}' +
    '.lock-btns{display:flex;flex-direction:column;gap:.5rem}' +
    '.lock-box .ok{padding:.55rem 1.2rem;border-radius:.5rem;border:1px solid var(--accent,#7b5cff);background:var(--accent,#7b5cff);color:var(--onaccent,#fff);cursor:pointer;font:inherit}' +
    '.lock-box .ghost{padding:.55rem 1.2rem;border-radius:.5rem;border:1px solid var(--border,#2a2a3f);background:transparent;color:var(--text,#e0e0f0);cursor:pointer;font:inherit}';
  function injectCss() {
    const doc = root.document;
    if (!doc || doc.getElementById('gifos-lock-css')) return;
    const s = doc.createElement('style'); s.id = 'gifos-lock-css'; s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function sheet(kind, appName) {
    const c = COPY[kind] || COPY.lock;
    const name = appName || 'this app';
    return {
      kind,
      title: typeof c.title === 'function' ? c.title(name) : c.title,
      lead: c.lead(esc(name)),
      ok: c.ok,
      alt: c.alt || null,
    };
  }
  function showSheet(kind, appName) {
    const doc = root.document;
    if (!doc) return Promise.resolve('cancel');
    injectCss();
    const s = sheet(kind, appName);
    return new Promise((resolve) => {
      const bg = doc.createElement('div');
      bg.className = 'lock-modal';
      bg.setAttribute('data-gifos-lock-sheet', kind);
      const altBtn = s.alt ? '<button class="ghost" data-lock-act="alt">' + esc(s.alt) + '</button>' : '';
      bg.innerHTML = '<div class="lock-box" role="dialog" aria-modal="true"><h3>' + esc(s.title) + '</h3>' +
        '<p class="lead">' + s.lead + '</p>' +
        '<div class="lock-btns">' +
        '<button class="ok" data-lock-act="ok">' + esc(s.ok) + '</button>' +
        altBtn +
        '<button class="ghost" data-lock-act="cancel">Cancel</button>' +
        '</div></div>';
      const done = (act) => { try { bg.remove(); } catch (e) {} resolve(act); };
      bg.addEventListener('click', (e) => {
        if (e.target === bg) done('cancel');
        const b = e.target && e.target.closest && e.target.closest('[data-lock-act]');
        if (b) done(b.getAttribute('data-lock-act'));
      });
      doc.body.appendChild(bg);
    });
  }

  // ---- at-rest persist (IndexedDB + stored GIF) -----------------------------
  async function liveState(fileId) {
    const s = await store().getState(fileId);
    if (!s) return { collections: {} };
    if (isSealed(s)) return null; // caller must open with the key
    if (s.collections) return s;
    return { collections: {} };
  }
  async function writeSealed(fileId, state, key) {
    const sealed = await sealState(state, key);
    await store().deleteState(fileId);
    await store().setState(fileId, sealed);
  }
  async function wrapAtRest(fileId, key) {
    const file = await store().getFile(fileId);
    if (!file) throw new Error('file not found');
    let state = await liveState(fileId);
    if (state == null) {
      const cur = await store().getState(fileId);
      state = await openState(cur, key);
    }
    const extra = {};
    if (state && (state.collections && Object.keys(state.collections).length || store().packJSON)) {
      extra['.state/db.json'] = gif().textToBytes(store().packJSON(state));
    }
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    const wrapped = await wrapGif(bytes, key, extra);
    await store().putFile(Object.assign({}, file, { bytes: wrapped }));
    await writeSealed(fileId, state, key);
  }
  async function unwrapAtRest(fileId, key) {
    const file = await store().getFile(fileId);
    if (!file) throw new Error('file not found');
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    const opened = await unwrapGif(bytes, key);
    if (opened.changed) await store().putFile(Object.assign({}, file, { bytes: opened.bytes }));
    const sealed = await store().getState(fileId);
    let state = { collections: {} };
    if (isSealed(sealed)) state = await openState(sealed, key);
    else if (sealed && sealed.collections) state = sealed;
    else if (opened.files && opened.files['.state/db.json']) {
      try { state = store().unpackJSON(gif().bytesToText(opened.files['.state/db.json'])); } catch (e) {}
    }
    if (state && state.collections) await store().setState(fileId, state);
    else { await store().deleteState(fileId); }
  }

  // In-memory db for a locked launch. Reads are clear; every write re-seals
  // IndexedDB. The stored GIF stays wrapped until they remove the lock.
  function makeDb(fileId, key, onChange, initial) {
    let state = (initial && initial.collections) ? initial : { collections: {} };
    const chan = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel(store().appChannel(fileId)) : null;
    const persist = () => writeSealed(fileId, state, key);
    const notify = (collection) => { if (chan) chan.postMessage({ collection }); onChange(collection); };
    if (chan) {
      chan.onmessage = () => {
        store().getState(fileId).then((s) => openState(s, key)).then((st) => {
          if (st && st.collections) { state = st; onChange('*'); }
        }).catch(() => {});
      };
    }
    const collOf = (name) => {
      const c = state.collections[name] || (state.collections[name] = { items: {}, seq: 1 });
      if (!c.items) c.items = {};
      if (!c.seq) c.seq = 1;
      return c;
    };
    const full = () => Promise.resolve(state);
    return {
      owner: true,
      load: full,
      import: (s) => { state = s && s.collections ? s : { collections: {} }; return persist(); },
      getFullState: full,
      op(op, collection, id, value) {
        if (op === 'dump') return full();
        if (op === 'get') { const c = state.collections[collection]; return Promise.resolve((c && c.items && c.items[id]) || null); }
        if (op === 'getAll') { const c = state.collections[collection]; return Promise.resolve(c && c.items ? Object.values(c.items) : []); }
        if (op === 'put') {
          const rec = Object.assign(Object.create(null), value || {});
          const c = collOf(collection);
          if (rec.id == null) rec.id = collection + '_' + (c.seq++);
          c.items[rec.id] = rec;
          return persist().then(() => { notify(collection); return rec; });
        }
        if (op === 'delete') {
          const c = state.collections[collection];
          if (c && c.items) delete c.items[id];
          return persist().then(() => { notify(collection); return true; });
        }
        if (op === 'setVisibility') {
          const c = state.collections[collection];
          const rec = c && c.items && c.items[id];
          if (!rec) return Promise.resolve(null);
          rec._vis = value;
          return persist().then(() => { notify(collection); return rec; });
        }
        return Promise.resolve(null);
      },
    };
  }

  function itemOfFile(items, fileId) {
    return (items || []).find((i) => i && i.fileId === fileId && i.passkey) || (items || []).find((i) => i && i.fileId === fileId) || null;
  }
  function isLockedItem(it) { return !!(it && it.passkey && it.passkey.credId); }

  async function gateOpen(fileId, appName) {
    const items = await store().allItems();
    const it = itemOfFile(items, fileId);
    if (!isLockedItem(it)) return true;
    const act = await showSheet('open', appName);
    if (act !== 'ok') return false;
    const key = await assertLock(it.passkey);
    sessions.set(fileId, key);
    return true;
  }

  GifOS.lock = {
    LOCK_PATH, CANNOT,
    isPrivatePath, isLockPath, isWrappedFiles, isSealed, isLockedItem,
    importRawKey, keyFromPrf,
    wrapFiles, unwrapFiles, wrapGif, unwrapGif,
    sealState, openState,
    canPasskeyLock, createLock, assertLock,
    sheet, showSheet,
    wrapAtRest, unwrapAtRest, makeDb, writeSealed,
    gateOpen, itemOfFile,
    session: {
      get: (id) => sessions.get(id) || null,
      set: (id, key) => sessions.set(id, key),
      del: (id) => sessions.delete(id),
    },
    // Test-only: a page may stuff a raw 32-byte PRF here to skip WebAuthn
    // when the virtual authenticator has no hmac-secret. Production never sets it.
    _prfOverride: null,
  };
})(typeof window !== 'undefined' ? window : globalThis);
