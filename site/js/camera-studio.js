/*
 * camera-studio.js — full-viewport camera overlay owned by the trusted parent.
 *
 * A sandboxed app is an opaque origin and must never receive a live MediaStream.
 * Camera.app (and gifos.camera()) ask the OS for a studio session; this module
 * holds the device behind an unfakeable overlay, bakes filters into the file,
 * and hands back bytes. The small 380px capture dialog in runtime.js stays for
 * takePhoto / recordVideo.
 *
 * Attaches to GifOS.cameraStudio = { probe, open }.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});

  const FILTERS = [
    { id: 'normal', name: 'Normal', css: 'none' },
    { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.35) brightness(.92)' },
    { id: 'chrome', name: 'Chrome', css: 'contrast(1.28) saturate(1.45) brightness(1.06)' },
    { id: 'film', name: 'Film', css: 'contrast(1.12) sepia(.18) saturate(.88) brightness(.98)' },
    { id: 'vintage', name: 'Vintage', css: 'sepia(.48) contrast(1.12) saturate(.9) brightness(1.06)' },
    { id: 'warm', name: 'Warm', css: 'sepia(.28) saturate(1.22) hue-rotate(-12deg) brightness(1.04)' },
    { id: 'cool', name: 'Cool', css: 'saturate(1.12) hue-rotate(18deg) brightness(1.05) contrast(1.05)' },
    { id: 'fade', name: 'Fade', css: 'contrast(.82) brightness(1.12) saturate(.72)' },
    { id: 'process', name: 'Process', css: 'contrast(1.22) saturate(1.55) hue-rotate(-22deg)' },
    { id: 'punch', name: 'Punch', css: 'contrast(1.42) saturate(1.65) brightness(1.04)' },
    { id: 'glow', name: 'Glow', css: 'brightness(1.18) contrast(1.08) saturate(1.25)' },
    { id: 'mono', name: 'Mono', css: 'grayscale(1) contrast(1.08)' },
    { id: 'sepia', name: 'Sepia', css: 'sepia(1) contrast(1.05)' },
    { id: 'vhs', name: 'VHS', css: 'contrast(1.28) saturate(1.5) hue-rotate(8deg) brightness(1.02)' },
    { id: 'disposable', name: 'Disposable', css: 'sepia(.22) contrast(1.18) saturate(1.35) brightness(1.1)' },
    { id: 'neon', name: 'Neon', css: 'saturate(2.1) contrast(1.32) hue-rotate(42deg) brightness(1.08)' },
    { id: 'comic', name: 'Comic', css: 'contrast(1.85) saturate(1.9) brightness(1.05)' },
    { id: 'aurora', name: 'Aurora', css: 'hue-rotate(82deg) saturate(1.65) brightness(1.06) contrast(1.08)' },
    { id: 'golden', name: 'Golden', css: 'sepia(.35) saturate(1.4) hue-rotate(-8deg) brightness(1.12) contrast(1.08)' },
    { id: 'ice', name: 'Ice', css: 'saturate(.75) hue-rotate(190deg) brightness(1.08) contrast(1.15)' },
  ];

  const MODE_META = {
    photo: { name: 'PHOTO', kind: 'photo' },
    video: { name: 'VIDEO', kind: 'video' },
    burst: { name: 'BURST', kind: 'image' },
    boomerang: { name: 'BOOM', kind: 'image' },
    slowmo: { name: 'SLOW-MO', kind: 'image' },
    timelapse: { name: 'LAPSE', kind: 'image' },
    night: { name: 'NIGHT', kind: 'photo' },
    beauty: { name: 'BEAUTY', kind: 'photo' },
  };

  const capEsc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function pickMime(kind) {
    const MR = root.MediaRecorder;
    if (!MR || !MR.isTypeSupported) return '';
    const cands = kind === 'video'
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
      : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    for (let i = 0; i < cands.length; i++) {
      try { if (MR.isTypeSupported(cands[i])) return cands[i]; } catch (e) {}
    }
    return '';
  }

  function facingOf(settings, caps) {
    const m = (settings && settings.facingMode) || (caps && (Array.isArray(caps.facingMode) ? caps.facingMode[0] : caps.facingMode));
    return m === 'environment' || m === 'user' ? m : 'unknown';
  }

  function asArr(v) { return Array.isArray(v) ? v : (v ? [v] : []); }

  let probeCache = null, probeInflight = null;

  function doProbe() {
    const nav = root.navigator;
    const empty = (reason) => ({
      ok: false, reason: reason || 'No camera available here.',
      cameras: [], count: 0, facingModes: [], torch: false, zoom: null,
      focus: false, exposure: false, maxWidth: 0, maxHeight: 0, maxFrameRate: 0,
      video: false, mimeVideo: '', mimeAudio: '', highFps: false,
    });
    if (!(nav && nav.mediaDevices && nav.mediaDevices.getUserMedia)) {
      return Promise.resolve(empty('No camera API here.'));
    }
    const md = nav.mediaDevices;
    let stream = null;
    return md.getUserMedia({ video: true, audio: false }).then((s) => {
      stream = s;
      const track = (s.getVideoTracks() || [])[0];
      if (!track) return empty('No camera available here.');
      const caps = (track.getCapabilities && track.getCapabilities()) || {};
      const settings = (track.getSettings && track.getSettings()) || {};
      return md.enumerateDevices().catch(() => []).then((devs) => {
        const cams = (devs || []).filter((d) => d.kind === 'videoinput');
        const facingModes = asArr(caps.facingMode).filter((f) => f === 'user' || f === 'environment');
        if (!facingModes.length) {
          const f = facingOf(settings, caps);
          if (f !== 'unknown') facingModes.push(f);
        }
        const cameras = cams.length
          ? cams.map(() => ({ facing: 'unknown' }))
          : [{ facing: facingOf(settings, caps) }];
        if (cameras[0]) cameras[0].facing = facingOf(settings, caps);
        const zoom = caps.zoom && typeof caps.zoom.max === 'number' && caps.zoom.max > (caps.zoom.min || 1)
          ? { min: caps.zoom.min || 1, max: caps.zoom.max, step: caps.zoom.step || 0.1 }
          : null;
        const focusModes = asArr(caps.focusMode);
        const focus = !!(caps.focusDistance || focusModes.indexOf('manual') >= 0 || focusModes.indexOf('single-shot') >= 0);
        const exposure = !!(caps.exposureCompensation && typeof caps.exposureCompensation.max === 'number');
        const maxFrameRate = (caps.frameRate && caps.frameRate.max) || settings.frameRate || 0;
        const mimeVideo = pickMime('video');
        const mimeAudio = pickMime('audio');
        const video = !!root.MediaRecorder;
        return {
          ok: true,
          cameras,
          count: Math.max(cameras.length, 1),
          facingModes,
          torch: !!caps.torch,
          zoom,
          focus: !!focus,
          exposure: !!exposure,
          maxWidth: (caps.width && caps.width.max) || settings.width || 0,
          maxHeight: (caps.height && caps.height.max) || settings.height || 0,
          maxFrameRate: maxFrameRate || 0,
          video: !!video,
          mimeVideo,
          mimeAudio,
          highFps: maxFrameRate >= 60,
          exposureComp: exposure ? { min: caps.exposureCompensation.min, max: caps.exposureCompensation.max, step: caps.exposureCompensation.step || 0.1 } : null,
        };
      });
    }).catch((err) => {
      const denied = err && err.name === 'NotAllowedError';
      return empty(denied
        ? 'Permission to use the camera was denied. Allow it in the browser, and in this app’s Abilities chip.'
        : ((err && err.message) || 'No camera available here.'));
    }).then((info) => {
      try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
      return info;
    });
  }

  function probe() {
    if (probeCache && probeCache.ok) return Promise.resolve(probeCache);
    if (probeInflight) return probeInflight;
    probeInflight = doProbe().then((info) => {
      probeInflight = null;
      if (info && info.ok) probeCache = info;
      return info;
    }, (err) => { probeInflight = null; throw err; });
    return probeInflight;
  }

  // ---- compact GIF89a (global palette + LZW). Independent of My Media's gifenc.
  function lzwEncode(pixels, minCode) {
    const CLEAR = 1 << minCode, END = CLEAR + 1;
    let codeSize = minCode + 1, nextCode = END + 1;
    const dict = new Map();
    function reset() { dict.clear(); codeSize = minCode + 1; nextCode = END + 1; }
    const out = [];
    let buf = 0, nbits = 0;
    function emit(code) {
      buf |= code << nbits;
      nbits += codeSize;
      while (nbits >= 8) { out.push(buf & 255); buf >>= 8; nbits -= 8; }
    }
    reset();
    emit(CLEAR);
    let w = String.fromCharCode(pixels[0]);
    for (let i = 1; i < pixels.length; i++) {
      const c = String.fromCharCode(pixels[i]);
      const wc = w + c;
      if (dict.has(wc)) { w = wc; continue; }
      emit(w.length === 1 ? w.charCodeAt(0) : dict.get(w));
      if (nextCode < 4096) {
        dict.set(wc, nextCode++);
        if (nextCode >= (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        emit(CLEAR);
        reset();
      }
      w = c;
    }
    emit(w.length === 1 ? w.charCodeAt(0) : dict.get(w));
    emit(END);
    if (nbits) out.push(buf & 255);
    return out;
  }

  function encodeGif(rgbaFrames, w, h, delayCs) {
    if (!rgbaFrames || !rgbaFrames.length || !w || !h) return new Uint8Array(0);
    const hist = new Map();
    const step = Math.max(1, Math.floor((w * h) / 3500));
    for (let f = 0; f < rgbaFrames.length; f++) {
      const data = rgbaFrames[f];
      for (let i = 0; i < data.length; i += 4 * step) {
        const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
        hist.set(k, (hist.get(k) || 0) + 1);
      }
    }
    const top = Array.from(hist.entries()).sort((a, b) => b[1] - a[1]).slice(0, 256);
    const palette = new Uint8Array(256 * 3);
    const colors = [];
    for (let i = 0; i < top.length; i++) {
      const k = top[i][0];
      const r = ((k >> 10) & 31) << 3, g = ((k >> 5) & 31) << 3, b = (k & 31) << 3;
      palette[i * 3] = r; palette[i * 3 + 1] = g; palette[i * 3 + 2] = b;
      colors.push([r, g, b]);
    }
    if (!colors.length) { palette[0] = palette[1] = palette[2] = 0; colors.push([0, 0, 0]); }
    const lut = new Int16Array(32768);
    for (let i = 0; i < lut.length; i++) lut[i] = -1;
    function nearest(r, g, b) {
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      if (lut[key] >= 0) return lut[key];
      let best = 0, bd = 1e9;
      for (let i = 0; i < colors.length; i++) {
        const dr = r - colors[i][0], dg = g - colors[i][1], db = b - colors[i][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bd) { bd = d; best = i; }
      }
      lut[key] = best;
      return best;
    }
    const indexed = [];
    for (let f = 0; f < rgbaFrames.length; f++) {
      const data = rgbaFrames[f];
      const idx = new Uint8Array(w * h);
      for (let p = 0, i = 0; i < data.length; i += 4, p++) idx[p] = nearest(data[i], data[i + 1], data[i + 2]);
      indexed.push(idx);
    }
    const bytes = [];
    const u8 = (v) => bytes.push(v & 255);
    const u16 = (v) => { bytes.push(v & 255, (v >> 8) & 255); };
    bytes.push(71, 73, 70, 56, 57, 97);
    u16(w); u16(h);
    u8(0xF7); u8(0); u8(0);
    for (let i = 0; i < 768; i++) u8(palette[i] || 0);
    u8(0x21); u8(0xFF); u8(0x0B);
    const ns = 'NETSCAPE2.0';
    for (let i = 0; i < ns.length; i++) u8(ns.charCodeAt(i));
    u8(0x03); u8(0x01); u16(0); u8(0x00);
    const delay = Math.max(2, delayCs | 0);
    for (let f = 0; f < indexed.length; f++) {
      u8(0x21); u8(0xF9); u8(0x04); u8(0x00); u16(delay); u8(0); u8(0);
      u8(0x2C); u16(0); u16(0); u16(w); u16(h); u8(0);
      u8(8);
      const packed = lzwEncode(indexed[f], 8);
      for (let i = 0; i < packed.length; ) {
        const n = Math.min(255, packed.length - i);
        u8(n);
        for (let j = 0; j < n; j++) u8(packed[i + j]);
        i += n;
      }
      u8(0);
    }
    u8(0x3B);
    return new Uint8Array(bytes);
  }

  function u8ToBuf(u8) {
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  }

  function canvasToJpeg(canvas, q) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Could not capture a frame.'));
        blob.arrayBuffer().then((buf) => resolve({ bytes: buf, mime: blob.type || 'image/jpeg' }), reject);
      }, 'image/jpeg', q == null ? 0.9 : q);
    });
  }

  function coverCrop(vw, vh, dw, dh) {
    const vr = vw / (vh || 1), dr = dw / (dh || 1);
    if (vr > dr) { const sw = vh * dr, sh = vh; return { sx: (vw - sw) / 2, sy: 0, sw, sh }; }
    const sw = vw, sh = vw / dr; return { sx: 0, sy: (vh - sh) / 2, sw, sh };
  }

  function aspectSize(aspect, vw, vh) {
    const W = vw || 640, H = vh || 480;
    if (aspect === '1:1') { const s = Math.min(W, H); return { w: s, h: s }; }
    if (aspect === '16:9') {
      if (W / H > 16 / 9) return { w: Math.round(H * 16 / 9), h: H };
      return { w: W, h: Math.round(W * 9 / 16) };
    }
    if (aspect === '4:3') {
      if (W / H > 4 / 3) return { w: Math.round(H * 4 / 3), h: H };
      return { w: W, h: Math.round(W * 3 / 4) };
    }
    return { w: W, h: H };
  }

  const CSS = [
    '.cs{position:fixed;inset:0;z-index:2147483647;background:#000;color:#fff;font:13px/1.2 system-ui,sans-serif;display:flex;flex-direction:column;user-select:none;-webkit-user-select:none}',
    '.cs *{box-sizing:border-box}',
    '.cs-finder{flex:1;position:relative;min-height:0;background:#000;display:flex;align-items:center;justify-content:center;touch-action:none}',
    '.cs-frame{position:relative;overflow:hidden;background:#000;max-width:100%;max-height:100%}',
    '.cs-frame video{width:100%;height:100%;object-fit:cover;display:block;background:#000}',
    '.cs-grid{position:absolute;inset:0;pointer-events:none;display:none}',
    '.cs-grid.on{display:block}',
    '.cs-count{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22vw;font-weight:200;letter-spacing:-.04em;pointer-events:none;text-shadow:0 4px 28px #000;opacity:0;transition:opacity .12s}',
    '.cs-count.on{opacity:1}',
    '.cs-focus{position:absolute;width:72px;height:72px;margin:-36px 0 0 -36px;border:1.5px solid #ffe08a;border-radius:8px;pointer-events:none;opacity:0;transform:scale(1.25)}',
    '.cs-focus.on{opacity:1;transform:scale(1);transition:transform .18s ease,opacity .18s}',
    '.cs-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}',
    '.cs-top{position:absolute;top:0;left:0;right:0;display:flex;align-items:flex-start;justify-content:space-between;padding:max(10px,env(safe-area-inset-top)) 12px 8px;z-index:3;pointer-events:none}',
    '.cs-top > *{pointer-events:auto}',
    '.cs-icon{width:44px;height:44px;border:0;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font:inherit;font-size:18px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}',
    '.cs-icon.on{background:#e8b84a;color:#1a1408}',
    '.cs-top-r{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;max-width:62%}',
    '.cs-pill{display:inline-flex;align-items:center;gap:7px;background:rgba(0,0,0,.5);border:1px solid rgba(255,80,80,.55);border-radius:999px;padding:6px 12px;font-weight:700;letter-spacing:.04em;font-size:12px;pointer-events:none}',
    '.cs-pill i{width:8px;height:8px;border-radius:50%;background:#ff3b3b;box-shadow:0 0 8px #ff3b3b;display:block}',
    '.cs-pill.live i{animation:csblink 1s ease-in-out infinite}',
    '@keyframes csblink{50%{opacity:.35}}',
    '.cs-zoom{position:absolute;right:10px;top:50%;transform:translateY(-50%);z-index:3;height:38%;display:flex;align-items:center}',
    '.cs-zoom input{writing-mode:bt-lr;-webkit-appearance:slider-vertical;appearance:slider-vertical;width:28px;height:100%;accent-color:#e8b84a}',
    '.cs-modes{display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:8px 16px 4px;scrollbar-width:none;justify-content:center}',
    '.cs-modes::-webkit-scrollbar{display:none}',
    '.cs-modes button{flex:0 0 auto;border:0;background:transparent;color:rgba(255,255,255,.55);font:inherit;font-weight:700;letter-spacing:.12em;font-size:12px;padding:8px 10px;cursor:pointer}',
    '.cs-modes button.on{color:#e8b84a}',
    '.cs-filters{display:flex;gap:10px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding:6px 16px 8px;scrollbar-width:none}',
    '.cs-filters::-webkit-scrollbar{display:none}',
    '.cs-filters button{flex:0 0 auto;width:58px;border:0;background:transparent;color:#ddd;padding:0;cursor:pointer}',
    '.cs-filters .sw{width:54px;height:54px;border-radius:50%;border:2px solid transparent;background:#222 center/cover no-repeat;margin:0 auto 4px;box-shadow:inset 0 0 0 1px #0007}',
    '.cs-filters button.on .sw{border-color:#e8b84a}',
    '.cs-filters .nm{font-size:10px;font-weight:650;display:block;text-align:center;white-space:nowrap}',
    '.cs-bot{display:flex;align-items:center;justify-content:space-around;padding:8px 18px max(14px,env(safe-area-inset-bottom));gap:12px}',
    '.cs-shutter{width:78px;height:78px;border-radius:50%;border:4px solid #fff;background:transparent;padding:5px;cursor:pointer}',
    '.cs-shutter span{display:block;width:100%;height:100%;border-radius:50%;background:#fff}',
    '.cs-shutter.rec span{border-radius:10px;background:#ff3b3b;transform:scale(.72)}',
    '.cs-last{width:48px;height:48px;border-radius:10px;border:2px solid #fff8;background:#111 center/cover no-repeat;padding:0;overflow:hidden;opacity:.35;cursor:pointer}',
    '.cs-last.on{opacity:1}',
    '.cs-last img{width:100%;height:100%;object-fit:cover;display:block}',
    '.cs-side{width:48px;height:48px}',
    '.cs-timer{position:absolute;top:max(58px,calc(env(safe-area-inset-top) + 48px));left:50%;transform:translateX(-50%);background:rgba(0,0,0,.55);border-radius:999px;padding:6px 12px;font-variant-numeric:tabular-nums;font-weight:700;z-index:3;display:none}',
    '.cs-timer.on{display:block}',
    '.cs-review{position:absolute;inset:0;background:#000;z-index:5;display:none;flex-direction:column}',
    '.cs-review.on{display:flex}',
    '.cs-review .rv{flex:1;display:flex;align-items:center;justify-content:center;min-height:0}',
    '.cs-review img,.cs-review video{max-width:100%;max-height:100%;object-fit:contain}',
    '.cs-review .rb{padding:12px;display:flex;justify-content:center}',
    '.cs-busy{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#0006;z-index:4;font-weight:700;letter-spacing:.08em}',
    '.cs-busy.on{display:flex}',
    '.cs-exp{position:absolute;left:10px;top:50%;transform:translateY(-50%);z-index:3;height:34%;display:flex;align-items:center}',
    '.cs-exp input{writing-mode:bt-lr;-webkit-appearance:slider-vertical;appearance:slider-vertical;width:28px;height:100%;accent-color:#e8b84a}',
  ].join('');

  let live = null;

  function modesFor(info) {
    const out = [{ id: 'photo' }];
    if (info && info.video) out.push({ id: 'video' });
    out.push({ id: 'burst' }, { id: 'boomerang' });
    if (info && info.highFps) out.push({ id: 'slowmo' });
    out.push({ id: 'timelapse' });
    if (!info || (info.maxWidth || 640) >= 160) out.push({ id: 'night' });
    out.push({ id: 'beauty' });
    return out;
  }

  function filterCss(id, mode) {
    const f = FILTERS.find((x) => x.id === id) || FILTERS[0];
    let css = f.css || 'none';
    if (mode === 'night') css = (css === 'none' ? '' : css + ' ') + 'brightness(1.48) contrast(.9) saturate(.82)';
    if (mode === 'beauty') css = (css === 'none' ? '' : css + ' ') + 'blur(.55px) contrast(1.08) saturate(1.06) brightness(1.07)';
    return css.trim() || 'none';
  }

  function open(opts, ctx) {
    opts = opts || {};
    ctx = ctx || {};
    if (live) return Promise.reject(new Error('Camera is already open.'));
    const doc = root.document;
    const label = opts.label || 'Camera';
    const wantAudio = opts.audio !== false;
    let facing = opts.facing === 'environment' ? 'environment' : (opts.facing === 'user' ? 'user' : 'user');
    let mode = MODE_META[opts.mode] ? opts.mode : 'photo';
    let filter = FILTERS.some((f) => f.id === opts.filter) ? opts.filter : 'normal';
    let timer = opts.timer === 3 || opts.timer === 10 ? opts.timer : 0;
    let aspect = ({ '1:1': 1, '4:3': 1, '16:9': 1, full: 1 }[opts.aspect] ? opts.aspect : 'full');
    let gridOn = !!opts.grid;
    let torchOn = false, zoomVal = 1, expVal = 0;
    let stream = null, rec = null, recChunks = [], recStart = 0, recRaf = 0, recCanvas = null;
    let flipping = false, busy = false, recording = false, held = null, heldUrl = '';
    let info = null, closed = false, pinch0 = 0, zoom0 = 1;

    const bg = doc.createElement('div');
    bg.className = 'cs';
    bg.setAttribute('data-gifos-capture', '1');
    bg.setAttribute('data-gifos-studio', '1');
    bg.innerHTML = '<style>' + CSS + '</style><div class="cs-finder" data-cs="finder"><div class="cs-frame" data-cs="frame">'
      + '<video playsinline autoplay muted></video>'
      + '<canvas class="cs-grid" data-cs="grid"></canvas>'
      + '<div class="cs-count" data-cs="count"></div>'
      + '<div class="cs-focus" data-cs="focus"></div>'
      + '<div class="cs-flash" data-cs="flash"></div></div></div>'
      + '<div class="cs-top"><button class="cs-icon" data-cs="close" title="Close" aria-label="Close">✕</button>'
      + '<div class="cs-pill" data-cs="pill"><i></i><span>' + capEsc(label) + '</span></div>'
      + '<div class="cs-top-r" data-cs="tools"></div></div>'
      + '<div class="cs-timer" data-cs="rectime">0:00</div>'
      + '<div class="cs-zoom" data-cs="zoomwrap" style="display:none"><input data-cs="zoom" type="range" orient="vertical"></div>'
      + '<div class="cs-exp" data-cs="expwrap" style="display:none"><input data-cs="exposure" type="range" orient="vertical"></div>'
      + '<div class="cs-modes" data-cs="modes"></div>'
      + '<div class="cs-filters" data-cs="filters"></div>'
      + '<div class="cs-bot"><button class="cs-last" data-cs="last" title="Last shot"></button>'
      + '<button class="cs-shutter" data-cs="shutter" aria-label="Shutter"><span></span></button>'
      + '<div class="cs-side"></div></div>'
      + '<div class="cs-busy" data-cs="busy">Working…</div>'
      + '<div class="cs-review" data-cs="review"><div class="rv" data-cs="rv"></div><div class="rb"><button class="cs-icon" data-cs="unreview" title="Back">←</button></div></div>';
    doc.body.appendChild(bg);

    const video = bg.querySelector('video');
    const frame = bg.querySelector('[data-cs="frame"]');
    const finder = bg.querySelector('[data-cs="finder"]');
    const gridCv = bg.querySelector('[data-cs="grid"]');
    const countEl = bg.querySelector('[data-cs="count"]');
    const focusEl = bg.querySelector('[data-cs="focus"]');
    const flashEl = bg.querySelector('[data-cs="flash"]');
    const tools = bg.querySelector('[data-cs="tools"]');
    const modesEl = bg.querySelector('[data-cs="modes"]');
    const filtersEl = bg.querySelector('[data-cs="filters"]');
    const shutter = bg.querySelector('[data-cs="shutter"]');
    const lastBtn = bg.querySelector('[data-cs="last"]');
    const pill = bg.querySelector('[data-cs="pill"]');
    const recTime = bg.querySelector('[data-cs="rectime"]');
    const busyEl = bg.querySelector('[data-cs="busy"]');
    const review = bg.querySelector('[data-cs="review"]');
    const rv = bg.querySelector('[data-cs="rv"]');
    const zoomWrap = bg.querySelector('[data-cs="zoomwrap"]');
    const zoomIn = bg.querySelector('[data-cs="zoom"]');
    const expWrap = bg.querySelector('[data-cs="expwrap"]');
    const expIn = bg.querySelector('[data-cs="exposure"]');

    function setBusy(on, msg) {
      busy = !!on;
      busyEl.classList.toggle('on', busy);
      if (msg) busyEl.textContent = msg;
    }
    function applyPreview() {
      video.style.filter = filterCss(filter, mode);
      video.style.transform = facing === 'environment' ? 'none' : 'scaleX(-1)';
    }
    function layoutFrame() {
      const fw = finder.clientWidth || root.innerWidth || 320;
      const fh = finder.clientHeight || root.innerHeight || 480;
      let w = fw, h = fh;
      if (aspect === '1:1') { const s = Math.min(fw, fh); w = h = s; }
      else if (aspect === '16:9') {
        if (fw / fh > 16 / 9) { h = fh; w = fh * 16 / 9; } else { w = fw; h = fw * 9 / 16; }
      } else if (aspect === '4:3') {
        if (fw / fh > 4 / 3) { h = fh; w = fh * 4 / 3; } else { w = fw; h = fw * 3 / 4; }
      }
      frame.style.width = Math.round(w) + 'px';
      frame.style.height = Math.round(h) + 'px';
      drawGrid();
    }
    function drawGrid() {
      const w = frame.clientWidth, h = frame.clientHeight;
      if (!w || !h) return;
      gridCv.width = w; gridCv.height = h;
      const g = gridCv.getContext('2d');
      g.clearRect(0, 0, w, h);
      if (!gridOn) { gridCv.classList.remove('on'); return; }
      gridCv.classList.add('on');
      g.strokeStyle = 'rgba(255,255,255,.42)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(w / 3, 0); g.lineTo(w / 3, h);
      g.moveTo(2 * w / 3, 0); g.lineTo(2 * w / 3, h);
      g.moveTo(0, h / 3); g.lineTo(w, h / 3);
      g.moveTo(0, 2 * h / 3); g.lineTo(w, 2 * h / 3);
      g.stroke();
    }
    function paintCanvas(extraCss) {
      const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
      const as = aspectSize(aspect, vw, vh);
      const crop = coverCrop(vw, vh, as.w, as.h);
      const maxSide = 1280;
      const sc = Math.min(1, maxSide / Math.max(as.w, as.h));
      const c = doc.createElement('canvas');
      c.width = Math.max(1, Math.round(as.w * sc));
      c.height = Math.max(1, Math.round(as.h * sc));
      const ctx2 = c.getContext('2d', { willReadFrequently: true });
      ctx2.filter = extraCss || filterCss(filter, mode);
      ctx2.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, c.width, c.height);
      ctx2.filter = 'none';
      return c;
    }
    function grabRgba(maxSide) {
      const c = paintCanvas();
      const sc = Math.min(1, (maxSide || 360) / Math.max(c.width, c.height));
      if (sc < 1) {
        const d = doc.createElement('canvas');
        d.width = Math.max(1, Math.round(c.width * sc));
        d.height = Math.max(1, Math.round(c.height * sc));
        d.getContext('2d').drawImage(c, 0, 0, d.width, d.height);
        return { data: d.getContext('2d').getImageData(0, 0, d.width, d.height).data, w: d.width, h: d.height };
      }
      return { data: c.getContext('2d').getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
    }
    function thumbFromCanvas(c) {
      try {
        const max = 280, sc = Math.min(1, max / Math.max(c.width, c.height));
        const t = doc.createElement('canvas');
        t.width = Math.max(1, Math.round(c.width * sc));
        t.height = Math.max(1, Math.round(c.height * sc));
        t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
        return t.toDataURL('image/jpeg', 0.7);
      } catch (e) { return ''; }
    }
    function hold(result, previewUrl, previewKind) {
      held = result;
      if (heldUrl) { try { URL.revokeObjectURL(heldUrl); } catch (e) {} }
      heldUrl = previewUrl || '';
      lastBtn.classList.add('on');
      lastBtn.style.backgroundImage = previewKind === 'video' ? 'none' : (heldUrl ? 'url(' + heldUrl + ')' : (result.thumb ? 'url(' + result.thumb + ')' : 'none'));
      lastBtn.innerHTML = previewKind === 'video' ? '<span style="color:#fff;font-size:18px">▶</span>' : '';
    }
    function flash() {
      flashEl.style.opacity = '0.85';
      setTimeout(() => { flashEl.style.opacity = '0'; }, 90);
      try { if (root.navigator.vibrate) root.navigator.vibrate(18); } catch (e) {}
    }

    function renderTools() {
      tools.innerHTML = '';
      function add(cs, title, text, on) {
        const b = doc.createElement('button');
        b.className = 'cs-icon' + (on ? ' on' : '');
        b.setAttribute('data-cs', cs);
        b.title = title;
        b.textContent = text;
        tools.appendChild(b);
        return b;
      }
      add('timer', 'Timer', timer ? String(timer) + 's' : '⏱', !!timer).onclick = () => {
        timer = timer === 0 ? 3 : timer === 3 ? 10 : 0;
        renderTools();
      };
      add('aspect', 'Aspect', aspect === 'full' ? 'FULL' : aspect, aspect !== 'full').onclick = () => {
        aspect = aspect === 'full' ? '4:3' : aspect === '4:3' ? '1:1' : aspect === '1:1' ? '16:9' : 'full';
        layoutFrame();
        renderTools();
      };
      add('gridbtn', 'Grid', '▦', gridOn).onclick = () => { gridOn = !gridOn; drawGrid(); renderTools(); };
      if (info && info.torch) {
        add('torch', 'Flash', '⚡', torchOn).onclick = () => {
          torchOn = !torchOn;
          applyTrack({ torch: torchOn });
          renderTools();
        };
      }
      const canFlip = info && (info.count > 1 || (info.facingModes && info.facingModes.indexOf('user') >= 0 && info.facingModes.indexOf('environment') >= 0));
      if (canFlip) add('flip', 'Flip camera', '🔄', false).onclick = () => flip();
    }
    function renderModes() {
      const list = modesFor(info);
      if (!list.some((m) => m.id === mode)) mode = list[0].id;
      modesEl.innerHTML = list.map((m) => '<button data-cs="mode" data-mode="' + m.id + '"'
        + (m.id === mode ? ' class="on"' : '') + '>' + (MODE_META[m.id] || m).name + '</button>').join('');
      applyPreview();
      shutter.classList.toggle('rec', recording);
    }
    function renderFilters() {
      filtersEl.innerHTML = FILTERS.map((f) => {
        const css = f.css === 'none' ? '' : 'filter:' + f.css;
        return '<button data-cs="filter" data-filter="' + f.id + '"' + (f.id === filter ? ' class="on"' : '') + '>'
          + '<div class="sw" style="background:linear-gradient(135deg,#4a4a58,#1a1a22);' + css + '"></div>'
          + '<span class="nm">' + f.name + '</span></button>';
      }).join('');
    }

    function applyTrack(adv) {
      const t = stream && stream.getVideoTracks()[0];
      if (!t || !t.applyConstraints) return Promise.resolve();
      return t.applyConstraints({ advanced: [adv] }).catch(() => {});
    }
    function setZoom(v) {
      if (!(info && info.zoom)) return;
      const z = info.zoom;
      zoomVal = Math.max(z.min, Math.min(z.max, v));
      zoomIn.value = String(zoomVal);
      applyTrack({ zoom: zoomVal });
    }

    function acquire(f) {
      const nav = root.navigator.mediaDevices;
      const videoCon = { facingMode: f };
      if (mode === 'slowmo') videoCon.frameRate = { ideal: 120, min: 60 };
      const audio = wantAudio && (mode === 'video') && ctx.hasMic !== false;
      return nav.getUserMedia({ audio: !!audio, video: videoCon });
    }
    function stopStream(s) { try { (s || stream) && (s || stream).getTracks().forEach((t) => t.stop()); } catch (e) {} }
    function attach(s, f) {
      stream = s;
      facing = f;
      try { video.srcObject = s; } catch (e) {}
      const p = video.play && video.play(); if (p && p.catch) p.catch(() => {});
      applyPreview();
      if (info && info.zoom) {
        const st = (s.getVideoTracks()[0].getSettings && s.getVideoTracks()[0].getSettings()) || {};
        zoomVal = st.zoom || info.zoom.min || 1;
        zoomIn.min = String(info.zoom.min); zoomIn.max = String(info.zoom.max);
        zoomIn.step = String(info.zoom.step || 0.1); zoomIn.value = String(zoomVal);
      }
      if (torchOn) applyTrack({ torch: true });
    }
    function flip() {
      if (busy || recording || flipping) return;
      flipping = true;
      const next = facing === 'user' ? 'environment' : 'user';
      const prev = stream;
      acquire(next).then((s) => { stopStream(prev); attach(s, next); flipping = false; })
        .catch(() => { flipping = false; });
    }

    function waitMs(ms) { return new Promise((r) => setTimeout(r, ms)); }
    function countdown() {
      if (!timer) return Promise.resolve();
      return new Promise((resolve, reject) => {
        let n = timer;
        const tick = () => {
          if (closed) return reject(new Error('Capture cancelled.'));
          if (n <= 0) { countEl.classList.remove('on'); countEl.textContent = ''; return resolve(); }
          countEl.textContent = String(n);
          countEl.classList.add('on');
          n -= 1;
          setTimeout(tick, 1000);
        };
        tick();
      });
    }

    async function snapPhoto() {
      await countdown();
      flash();
      const useIc = filter === 'normal' && mode === 'photo' && aspect === 'full' && root.ImageCapture;
      if (useIc) {
        try {
          const track = stream.getVideoTracks()[0];
          const ic = new root.ImageCapture(track);
          const blob = await ic.takePhoto();
          if (blob && blob.size) {
            const buf = await blob.arrayBuffer();
            const u = new Uint8Array(buf);
            if (u[0] === 0xff && u[1] === 0xd8) {
              const c = paintCanvas();
              const result = { bytes: buf, mime: blob.type || 'image/jpeg', width: c.width, height: c.height, kind: 'photo', thumb: thumbFromCanvas(c) };
              const url = URL.createObjectURL(blob);
              hold(result, url, 'image');
              return result;
            }
          }
        } catch (e) { /* canvas is the truth */ }
      }
      const c = paintCanvas();
      const jpg = await canvasToJpeg(c, 0.9);
      const result = { bytes: jpg.bytes, mime: 'image/jpeg', width: c.width, height: c.height, kind: 'photo', thumb: thumbFromCanvas(c) };
      hold(result, URL.createObjectURL(new Blob([jpg.bytes], { type: 'image/jpeg' })), 'image');
      return result;
    }

    async function grabSequence(n, gapMs, maxSide) {
      const frames = [];
      let w = 0, h = 0;
      for (let i = 0; i < n; i++) {
        if (closed) throw new Error('Capture cancelled.');
        const g = grabRgba(maxSide || 360);
        frames.push(g.data); w = g.w; h = g.h;
        if (i < n - 1 && gapMs) await waitMs(gapMs);
      }
      return { frames, w, h };
    }

    async function snapGif(frames, w, h, delayCs, kind) {
      setBusy(true, 'Encoding…');
      await waitMs(10);
      const bytes = encodeGif(frames, w, h, delayCs);
      setBusy(false);
      if (!bytes || bytes.length < 14) throw new Error('Could not encode the GIF.');
      const buf = u8ToBuf(bytes);
      const c = paintCanvas();
      const result = { bytes: buf, mime: 'image/gif', width: w, height: h, kind: kind || 'image', thumb: thumbFromCanvas(c) };
      hold(result, URL.createObjectURL(new Blob([bytes], { type: 'image/gif' })), 'image');
      return result;
    }

    async function snapBurst() {
      await countdown();
      flash();
      setBusy(true, 'Burst…');
      const seq = await grabSequence(8, 70, 320);
      setBusy(false);
      return snapGif(seq.frames, seq.w, seq.h, 8, 'image');
    }
    async function snapBoom() {
      await countdown();
      setBusy(true, 'Boomerang…');
      const seq = await grabSequence(10, 140, 320);
      const ping = seq.frames.slice();
      for (let i = seq.frames.length - 2; i >= 1; i--) ping.push(seq.frames[i]);
      setBusy(false);
      return snapGif(ping, seq.w, seq.h, 9, 'image');
    }
    async function snapLapse() {
      await countdown();
      setBusy(true, 'Time-lapse…');
      const seq = await grabSequence(12, 400, 320);
      setBusy(false);
      return snapGif(seq.frames, seq.w, seq.h, 8, 'image');
    }
    async function snapSlowmo() {
      await countdown();
      setBusy(true, 'Slow-mo…');
      const seq = await grabSequence(24, 40, 320);
      setBusy(false);
      return snapGif(seq.frames, seq.w, seq.h, 12, 'image');
    }

    function recTick() {
      if (!recording) return;
      const s = Math.max(0, Math.floor((Date.now() - recStart) / 1000));
      recTime.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    function startVideo() {
      const mime = (info && info.mimeVideo) || pickMime('video');
      const filtered = filter !== 'normal' || mode === 'night' || mode === 'beauty' || aspect !== 'full';
      recChunks = [];
      recStart = Date.now();
      if (filtered) {
        recCanvas = paintCanvas();
        const ctx2 = recCanvas.getContext('2d');
        const fps = 30;
        const out = recCanvas.captureStream(fps);
        if (stream) stream.getAudioTracks().forEach((t) => { try { out.addTrack(t); } catch (e) {} });
        const draw = () => {
          if (!recording) return;
          ctx2.filter = filterCss(filter, mode);
          const vw = video.videoWidth || recCanvas.width, vh = video.videoHeight || recCanvas.height;
          const crop = coverCrop(vw, vh, recCanvas.width, recCanvas.height);
          ctx2.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, recCanvas.width, recCanvas.height);
          recRaf = root.requestAnimationFrame(draw);
        };
        recording = true;
        draw();
        try { rec = new root.MediaRecorder(out, mime ? { mimeType: mime } : undefined); }
        catch (e) { try { rec = new root.MediaRecorder(out); } catch (e2) { recording = false; throw new Error('Recording is not supported here.'); } }
      } else {
        recording = true;
        try { rec = new root.MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
        catch (e) { try { rec = new root.MediaRecorder(stream); } catch (e2) { recording = false; throw new Error('Recording is not supported here.'); } }
      }
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) recChunks.push(ev.data); };
      rec.onstop = () => {
        if (recRaf) { try { root.cancelAnimationFrame(recRaf); } catch (e) {} recRaf = 0; }
        const durationMs = Date.now() - recStart;
        const blob = new Blob(recChunks, { type: (rec && rec.mimeType) || mime || 'video/webm' });
        rec = null; recCanvas = null; recording = false;
        shutter.classList.remove('rec');
        recTime.classList.remove('on');
        pill.classList.remove('live');
        blob.arrayBuffer().then((buf) => {
          const c = paintCanvas();
          const result = { bytes: buf, mime: blob.type || 'video/webm', width: c.width, height: c.height, durationMs, kind: 'video', thumb: thumbFromCanvas(c) };
          hold(result, URL.createObjectURL(blob), 'video');
        });
      };
      rec.start(200);
      shutter.classList.add('rec');
      recTime.classList.add('on');
      pill.classList.add('live');
      recTick();
      const iv = setInterval(() => { if (!recording) { clearInterval(iv); return; } recTick(); }, 250);
      const maxMs = Math.min(Math.max(1, opts.maxSeconds || 60), 120) * 1000;
      setTimeout(() => { if (recording) stopVideo(); }, maxMs);
    }
    function stopVideo() {
      if (!recording || !rec) return;
      try { rec.stop(); } catch (e) { recording = false; }
    }

    async function shoot() {
      if (closed || busy || flipping) return;
      if (mode === 'video') {
        if (recording) { stopVideo(); return; }
        try { startVideo(); } catch (e) { setBusy(false); throw e; }
        return;
      }
      if (recording) return;
      try {
        setBusy(true, '…');
        if (mode === 'burst') await snapBurst();
        else if (mode === 'boomerang') await snapBoom();
        else if (mode === 'timelapse') await snapLapse();
        else if (mode === 'slowmo') await snapSlowmo();
        else await snapPhoto();
      } catch (e) {
        if (!closed && !/cancel/i.test(String(e && e.message || e))) {
          busyEl.textContent = String(e && e.message || e).slice(0, 80);
          busyEl.classList.add('on');
          setTimeout(() => { if (!busy) busyEl.classList.remove('on'); }, 1800);
        }
      } finally { setBusy(false); }
    }

    function teardown() {
      if (closed) return false;
      closed = true;
      live = null;
      if (recording) { try { rec && rec.stop(); } catch (e) {} recording = false; }
      stopStream();
      if (heldUrl) { try { URL.revokeObjectURL(heldUrl); } catch (e) {} }
      try { bg.remove(); } catch (e) {}
      root.removeEventListener('keydown', onKey);
      root.removeEventListener('resize', layoutFrame);
      return true;
    }
    function finish(ok) {
      const shot = held;
      if (!teardown()) return;
      if (ok && shot) pending.resolve(shot);
      else pending.reject(new Error('Capture cancelled.'));
    }

    function showReview() {
      if (!held) return;
      rv.innerHTML = '';
      if (held.kind === 'video') {
        const v = doc.createElement('video');
        v.controls = true; v.autoplay = true; v.playsInline = true;
        v.src = heldUrl || URL.createObjectURL(new Blob([held.bytes], { type: held.mime }));
        rv.appendChild(v);
      } else {
        const img = doc.createElement('img');
        img.src = heldUrl || held.thumb || '';
        rv.appendChild(img);
      }
      review.classList.add('on');
    }

    const pending = { resolve: null, reject: null };
    const result = new Promise((resolve, reject) => { pending.resolve = resolve; pending.reject = reject; });

    function onKey(e) {
      if (e.key === 'Escape') {
        if (review.classList.contains('on')) { review.classList.remove('on'); rv.innerHTML = ''; return; }
        finish(!!held);
      }
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); shoot(); }
    }

    bg.querySelector('[data-cs="close"]').onclick = () => finish(!!held);
    bg.querySelector('[data-cs="unreview"]').onclick = () => { review.classList.remove('on'); rv.innerHTML = ''; };
    shutter.onclick = () => shoot();
    lastBtn.onclick = () => showReview();
    function switchMode(next) {
      if (!next || next === mode || recording) return;
      const wasVideo = mode === 'video';
      mode = next;
      renderModes();
      if ((mode === 'video') !== wasVideo) {
        const prev = stream;
        acquire(facing).then((s) => { stopStream(prev); attach(s, facing); }).catch(() => {});
      }
    }
    modesEl.onclick = (e) => {
      const b = e.target.closest && e.target.closest('[data-mode]');
      if (!b) return;
      switchMode(b.getAttribute('data-mode'));
    };
    filtersEl.onclick = (e) => {
      const b = e.target.closest && e.target.closest('[data-filter]');
      if (!b) return;
      filter = b.getAttribute('data-filter');
      renderFilters();
      applyPreview();
    };
    zoomIn.oninput = () => setZoom(parseFloat(zoomIn.value));
    expIn.oninput = () => {
      expVal = parseFloat(expIn.value);
      applyTrack({ exposureCompensation: expVal });
    };
    finder.addEventListener('pointerdown', (e) => {
      if (!(info && info.focus) || e.target.closest && e.target.closest('button,input')) return;
      const r = frame.getBoundingClientRect();
      const x = (e.clientX - r.left) / (r.width || 1);
      const y = (e.clientY - r.top) / (r.height || 1);
      focusEl.style.left = (e.clientX - r.left) + 'px';
      focusEl.style.top = (e.clientY - r.top) + 'px';
      focusEl.classList.remove('on');
      void focusEl.offsetWidth;
      focusEl.classList.add('on');
      setTimeout(() => focusEl.classList.remove('on'), 700);
      const track = stream && stream.getVideoTracks()[0];
      if (root.ImageCapture && track) {
        try {
          const ic = new root.ImageCapture(track);
          if (ic.setOptions) ic.setOptions({ focusMode: 'single-shot', pointsOfInterest: [{ x, y }] }).catch(() => {});
        } catch (err) {}
      }
    });
    finder.addEventListener('touchstart', (e) => {
      if (!(info && info.zoom) || e.touches.length !== 2) return;
      const a = e.touches[0], b = e.touches[1];
      pinch0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      zoom0 = zoomVal;
    }, { passive: true });
    finder.addEventListener('touchmove', (e) => {
      if (!(info && info.zoom) || e.touches.length !== 2 || !pinch0) return;
      e.preventDefault();
      const a = e.touches[0], b = e.touches[1];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setZoom(zoom0 * (d / pinch0));
    }, { passive: false });

    let swipeX = 0, swipeOn = false;
    finder.addEventListener('pointerdown', (e) => { swipeOn = true; swipeX = e.clientX; });
    finder.addEventListener('pointerup', (e) => {
      if (!swipeOn || recording) { swipeOn = false; return; }
      const dx = e.clientX - swipeX;
      swipeOn = false;
      if (Math.abs(dx) < 64) return;
      const list = modesFor(info);
      let i = list.findIndex((m) => m.id === mode);
      i = dx < 0 ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1);
      switchMode(list[i].id);
    });

    root.addEventListener('keydown', onKey);
    root.addEventListener('resize', layoutFrame);
    live = bg;

    probe().then((p) => {
      info = p;
      if (!p || !p.ok) throw new Error((p && p.reason) || 'No camera available here.');
      if (opts.mode && modesFor(p).some((m) => m.id === opts.mode)) mode = opts.mode;
      if (p.zoom) zoomWrap.style.display = '';
      else if (zoomWrap && zoomWrap.parentNode) zoomWrap.parentNode.removeChild(zoomWrap);
      if (p.exposure && p.exposureComp) {
        expWrap.style.display = '';
        expIn.min = String(p.exposureComp.min);
        expIn.max = String(p.exposureComp.max);
        expIn.step = String(p.exposureComp.step || 0.1);
        expIn.value = '0';
      } else if (expWrap && expWrap.parentNode) expWrap.parentNode.removeChild(expWrap);
      renderTools();
      renderModes();
      renderFilters();
      layoutFrame();
      return acquire(facing);
    }).then((s) => {
      attach(s, facing);
      layoutFrame();
    }).catch((err) => {
      const e = err instanceof Error ? err : new Error(String(err && err.message || err));
      if (!teardown()) return;
      pending.reject(e);
    });

    return result;
  }

  GifOS.cameraStudio = { probe, open, FILTERS };
})(typeof window !== 'undefined' ? window : globalThis);
