/* yoinks: paste a link, pick a format, the browser saves the file.
 * Port of pablostanley/yoinks (MIT). Upstream drives yt-dlp on the machine;
 * this one asks a cobalt instance the person names, and hands the tunnel URL
 * to the browser's own downloader (the bytes never cross the app bridge).
 * The pure parts hang off window.Yoinks so test/unit/yoinks.js can hold them.
 */
(function (root) {
  'use strict';

  var TAGLINE = 'yoink any video. paste. yoink. done.';
  var YOINK_BUTTON = 'yoink';
  var DONE_LABEL = '↵ yoink another';
  var HISTORY_LIMIT = 50;
  var META_BUDGET_MS = 6000;
  var QUALITIES = ['2160', '1440', '1080', '720', '480', '360', '240', '144'];

  // ---- platforms (upstream lib/platforms.ts) --------------------------------
  var PLATFORMS = [
    { hosts: ['youtube.com', 'youtu.be', 'music.youtube.com'], key: 'youtube', label: 'YouTube', service: 'youtube' },
    { hosts: ['x.com', 'twitter.com'], key: 'x', label: 'X / Twitter', service: 'twitter' },
    { hosts: ['instagram.com'], key: 'instagram', label: 'Instagram', service: 'instagram' },
    { hosts: ['threads.net', 'threads.com'], key: 'threads', label: 'Threads', service: 'threads' },
    { hosts: ['tiktok.com'], key: 'tiktok', label: 'TikTok', service: 'tiktok' },
    { hosts: ['vimeo.com'], key: 'vimeo', label: 'Vimeo', service: 'vimeo' },
    { hosts: ['twitch.tv'], key: 'twitch', label: 'Twitch', service: 'twitch' },
    { hosts: ['reddit.com'], key: 'reddit', label: 'Reddit', service: 'reddit' },
    { hosts: ['facebook.com', 'fb.watch'], key: 'facebook', label: 'Facebook', service: 'facebook' },
    { hosts: ['bsky.app'], key: 'bluesky', label: 'Bluesky', service: 'bluesky' },
    { hosts: ['soundcloud.com'], key: 'soundcloud', label: 'SoundCloud', service: 'soundcloud' },
    { hosts: ['pinterest.com', 'pin.it'], key: 'pinterest', label: 'Pinterest', service: 'pinterest' },
    { hosts: ['tumblr.com'], key: 'tumblr', label: 'Tumblr', service: 'tumblr' },
    { hosts: ['bilibili.com', 'b23.tv'], key: 'bilibili', label: 'Bilibili', service: 'bilibili' },
    { hosts: ['dailymotion.com', 'dai.ly'], key: 'dailymotion', label: 'Dailymotion', service: 'dailymotion' },
    { hosts: ['streamable.com'], key: 'streamable', label: 'Streamable', service: 'streamable' },
    { hosts: ['loom.com'], key: 'loom', label: 'Loom', service: 'loom' },
    { hosts: ['snapchat.com'], key: 'snapchat', label: 'Snapchat', service: 'snapchat' },
    { hosts: ['vk.com', 'vkvideo.ru'], key: 'vk', label: 'VK', service: 'vk' },
    { hosts: ['ok.ru'], key: 'ok', label: 'OK', service: 'ok' },
    { hosts: ['rutube.ru'], key: 'rutube', label: 'Rutube', service: 'rutube' },
    { hosts: ['xiaohongshu.com', 'xhslink.com'], key: 'xiaohongshu', label: 'Xiaohongshu', service: 'xiaohongshu' },
    { hosts: ['newgrounds.com'], key: 'newgrounds', label: 'Newgrounds', service: 'newgrounds' }
  ];
  var SERVICE_LABEL = { twitter: 'x', youtube: 'youtube' };

  function detectPlatform(url) {
    var hostname;
    try { hostname = new URL(url).hostname.toLowerCase(); } catch (e) { return { key: 'unknown', label: 'Unknown site', service: '' }; }
    for (var i = 0; i < PLATFORMS.length; i++) {
      var p = PLATFORMS[i];
      for (var j = 0; j < p.hosts.length; j++) {
        var h = p.hosts[j];
        if (hostname === h || hostname.slice(-(h.length + 1)) === '.' + h) return { key: p.key, label: p.label, service: p.service };
      }
    }
    return { key: 'generic', label: hostname, service: '' };
  }

  function isProbablyUrl(input) {
    try {
      var u = new URL(String(input || '').trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) { return false; }
  }

  // ---- choices (upstream buildChoices, minus the sizes yt-dlp knew) ---------
  // yt-dlp listed every height the video really had. A cobalt instance takes a
  // wish and serves the nearest at or below it, so YouTube gets the whole
  // ladder and every other site, which serves one file, gets best + audio.
  function buildChoices(platform) {
    var out = [];
    if (platform && platform.key === 'youtube') {
      for (var i = 0; i < QUALITIES.length; i++) out.push({ kind: 'video', label: QUALITIES[i] + 'p · mp4', quality: QUALITIES[i] });
    } else {
      out.push({ kind: 'video', label: 'best available · mp4', quality: 'max' });
    }
    out.push({ kind: 'audio', label: 'audio only · mp3', quality: 'max' });
    return out;
  }
  function choiceLabel(choice) { return (choice.kind === 'audio' ? '♪ ' : '▶ ') + choice.label; }

  // The POST / body (cobalt docs/api.md). Every key here exists in cobalt 10,
  // so an older instance does not reject the body for a key it never heard of.
  function requestBody(url, choice) {
    var b = {
      url: url,
      videoQuality: choice.quality,
      filenameStyle: 'basic',
      alwaysProxy: true
    };
    if (choice.kind === 'audio') {
      b.downloadMode = 'audio';
      b.audioFormat = 'mp3';
      b.audioBitrate = '320';
    } else {
      b.downloadMode = 'auto';
      b.youtubeVideoCodec = 'h264';
    }
    return b;
  }

  // "cobalt.example.com", "https://cobalt.example.com/" and a pasted API URL
  // all mean the same origin. https only: the bridge refuses anything else.
  function cleanInstance(s) {
    s = String(s || '').trim();
    if (!s) return '';
    if (!/^[a-z]+:\/\//i.test(s)) s = 'https://' + s;
    var u;
    try { u = new URL(s); } catch (e) { return ''; }
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'))) return '';
    if (!u.hostname) return '';
    var path = u.pathname.replace(/\/+$/, '');
    return u.origin + path;
  }

  function authHeaders(headers, apiKey) {
    apiKey = String(apiKey || '').trim();
    if (apiKey) headers.Authorization = /^(api-key|bearer)\s/i.test(apiKey) ? apiKey : 'Api-Key ' + apiKey;
    return headers;
  }

  // What the instance said, in a sentence (codes from cobalt's error.json).
  var ERRORS = {
    'error.api.auth.jwt.missing': 'this instance needs a browser challenge yoinks can’t pass here — add an api key in settings, or use another instance',
    'error.api.auth.jwt.invalid': 'the instance rejected its own session token — try again',
    'error.api.auth.key.missing': 'this instance wants an api key — add one in settings',
    'error.api.auth.key.invalid': 'the instance refused that api key',
    'error.api.auth.key.not_api_key': 'that key isn’t shaped like a cobalt api key',
    'error.api.auth.turnstile.missing': 'this instance needs a browser challenge yoinks can’t pass here — add an api key, or use another instance',
    'error.api.link.invalid': 'the instance couldn’t make sense of that link',
    'error.api.link.unsupported': 'that link isn’t one this instance can yoink',
    'error.api.service.unsupported': 'this instance doesn’t serve that site',
    'error.api.service.disabled': 'that site is switched off on this instance',
    'error.api.service.audio_not_supported': 'that site has no audio-only on this instance — pick a video format',
    'error.api.fetch.fail': 'the instance couldn’t fetch that page — try again',
    'error.api.fetch.empty': 'the instance found nothing to download there',
    'error.api.fetch.critical': 'the instance hit a wall fetching that — try again later',
    'error.api.fetch.rate': 'the site is rate-limiting the instance — try again later',
    'error.api.fetch.short_link': 'the instance couldn’t expand that short link',
    'error.api.rate_exceeded': 'slow down — the instance is rate-limiting you',
    'error.api.capacity': 'the instance is full right now — try again in a minute',
    'error.api.invalid_body': 'the instance rejected the request — it may be running a cobalt older than 10',
    'error.api.unreachable': 'the instance can’t be reached',
    'error.api.timed_out': 'the instance timed out',
    'error.api.generic': 'the instance hit an error it didn’t explain',
    'error.api.unknown_response': 'the instance answered something yoinks doesn’t understand',
    'error.api.content.too_long': 'too long — this instance stops at {limit} minutes',
    'error.api.content.video.unavailable': 'that video isn’t available',
    'error.api.content.video.live': 'that’s a live stream — wait until it ends',
    'error.api.content.video.private': 'that video is private',
    'error.api.content.video.age': 'that video is age-restricted',
    'error.api.content.video.region': 'that video is blocked where the instance lives',
    'error.api.content.post.unavailable': 'that post isn’t available',
    'error.api.content.post.private': 'that post is private',
    'error.api.content.post.age': 'that post is age-restricted',
    'error.api.youtube.login': 'youtube wants the instance to sign in — the instance owner needs to add cookies',
    'error.api.youtube.token_expired': 'youtube’s token on the instance expired — try again',
    'error.api.youtube.no_hls_streams': 'no streams for that format — try another',
    'error.api.youtube.codec': 'no stream in that codec — try another format',
    'error.api.youtube.drm': 'that video is DRM-protected',
    'error.api.youtube.api_error': 'youtube refused the instance — try again later',
    'error.api.youtube.temporary_disabled': 'youtube is switched off on this instance for now',
    'error.api.youtube.no_matching_format': 'no format matched — try another',
    'error.api.youtube.no_session_tokens': 'the instance has no youtube session tokens — the owner needs to fix it'
  };
  function errorText(code, context) {
    code = String(code || '');
    var text = ERRORS[code];
    if (!text) return code ? 'the instance said: ' + code.replace(/^error\.api\./, '') : 'the instance hit an error it didn’t explain';
    if (context && context.limit != null) text = text.replace('{limit}', String(context.limit));
    return text.replace('{limit}', 'a few');
  }

  // The POST answer, reduced to what the screens need.
  function parseResponse(j) {
    if (!j || typeof j !== 'object') return { kind: 'error', message: errorText('error.api.unknown_response') };
    if (j.status === 'error') return { kind: 'error', message: errorText(j.error && j.error.code, j.error && j.error.context) };
    if ((j.status === 'tunnel' || j.status === 'redirect') && typeof j.url === 'string') {
      return { kind: 'file', url: j.url, filename: String(j.filename || '') };
    }
    if (j.status === 'picker' && Array.isArray(j.picker)) {
      var items = [];
      for (var i = 0; i < j.picker.length; i++) {
        var it = j.picker[i];
        if (it && typeof it.url === 'string') items.push({ type: it.type === 'photo' || it.type === 'gif' ? it.type : 'video', url: it.url });
      }
      return { kind: 'picker', items: items, audio: typeof j.audio === 'string' ? j.audio : '', audioFilename: String(j.audioFilename || '') };
    }
    if (j.status === 'local-processing') {
      var tunnel = Array.isArray(j.tunnel) ? j.tunnel.filter(function (u) { return typeof u === 'string'; }) : [];
      return {
        kind: 'local',
        type: String(j.type || ''),
        urls: tunnel,
        filename: String((j.output && j.output.filename) || '')
      };
    }
    return { kind: 'error', message: errorText('error.api.unknown_response') };
  }

  // The instance's GET / answer.
  function parseInstance(j, base) {
    if (!j || !j.cobalt || typeof j.cobalt.version !== 'string') return null;
    var services = Array.isArray(j.cobalt.services) ? j.cobalt.services.map(String) : [];
    return { base: base, version: j.cobalt.version, services: services, turnstile: !!j.cobalt.turnstileSitekey };
  }

  function sitesLine(services) {
    if (!services || !services.length) return 'youtube · x · instagram · tiktok · +more';
    var lead = ['youtube', 'twitter', 'instagram', 'tiktok'].filter(function (s) { return services.indexOf(s) >= 0; });
    var rest = services.length - lead.length;
    var names = lead.map(function (s) { return SERVICE_LABEL[s] || s; });
    if (!names.length) names = services.slice(0, 4).map(function (s) { return SERVICE_LABEL[s] || s; });
    rest = services.length - names.length;
    return names.join(' · ') + (rest > 0 ? ' · +' + rest + ' more' : '');
  }

  function oembedUrl(url, platform) {
    var enc = encodeURIComponent(url);
    if (platform.key === 'youtube') return 'https://www.youtube.com/oembed?format=json&url=' + enc;
    if (platform.key === 'tiktok') return 'https://www.tiktok.com/oembed?url=' + enc;
    if (platform.key === 'vimeo') return 'https://vimeo.com/api/oembed.json?url=' + enc;
    return 'https://noembed.com/embed?url=' + enc;
  }

  function truncate(text, max) { text = String(text || ''); return text.length > max ? text.slice(0, max - 1) + '…' : text; }

  root.Yoinks = {
    TAGLINE: TAGLINE,
    QUALITIES: QUALITIES,
    detectPlatform: detectPlatform,
    isProbablyUrl: isProbablyUrl,
    buildChoices: buildChoices,
    choiceLabel: choiceLabel,
    requestBody: requestBody,
    cleanInstance: cleanInstance,
    authHeaders: authHeaders,
    errorText: errorText,
    parseResponse: parseResponse,
    parseInstance: parseInstance,
    sitesLine: sitesLine,
    oembedUrl: oembedUrl,
    truncate: truncate
  };

  if (!root.document || typeof root.document.getElementById !== 'function') return;

  // =========================================================================
  // the screen
  // =========================================================================
  var doc = root.document;
  function $(id) { return doc.getElementById(id); }
  function el(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  var reduced = false;
  try { reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // ---- logo (upstream components/logo.tsx) -----------------------------------
  var ART = [
    '▓ ▓ █▀█ ▀█▀ █▀▄█ █ █ █▀▀',
    '▀█▀ █ ▓  ▓  █  ▓ ▓▀▄ ▀▀▓',
    ' ▀  ▀▀▀ ▀▀▀ ▀  ▀ ▀ ▀ ▀▀▀'
  ];
  var INTRO_MS = 900, INTRO_SPREAD_MS = 550, SWEEP_MS = 1000, SWEEP_EVERY_MS = 7000, TILT = 2, HALF = 2.4;
  var LIGHTER = { '█': '▒', '▓': '░' };
  var HALF_BLOCKS = { '▀': 1, '▄': 1 };
  var cells = [];
  var logoPhase = 'idle', logoStart = 0, logoTimer = 0, logoRaf = 0;
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function buildLogo() {
    var logo = $('logo');
    logo.textContent = '';
    cells = [];
    for (var r = 0; r < ART.length; r++) {
      var row = el('span', 'r');
      var chars = Array.from(ART[r]);
      var rowCells = [];
      for (var c = 0; c < chars.length; c++) {
        var s = el('span', chars[c] === '▓' ? 'g' : '', chars[c]);
        rowCells.push({ ch: chars[c], node: s, delay: Math.random() * INTRO_SPREAD_MS });
        row.appendChild(s);
      }
      cells.push(rowCells);
      logo.appendChild(row);
    }
  }
  function paintLogoCell(cell, ch, cls) {
    if (cell.node.textContent !== ch) cell.node.textContent = ch;
    if (cell.node.className !== cls) cell.node.className = cls;
  }
  function paintLogo(t) {
    var cols = cells[0].length, rows = cells.length;
    var pMin = -TILT * rows - HALF, pMax = cols + HALF;
    var p = pMin + ease(Math.min(1, t / SWEEP_MS)) * (pMax - pMin);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cell = cells[r][c], ch = cell.ch;
        var base = ch === '▓' ? 'g' : '';
        if (ch === ' ' || logoPhase === 'idle') { paintLogoCell(cell, ch, base); continue; }
        if (logoPhase === 'intro') {
          var dt = t - cell.delay;
          if (dt < 0) paintLogoCell(cell, ' ', base);
          else if (dt < 110) paintLogoCell(cell, HALF_BLOCKS[ch] ? ch : '░', 'h');
          else if (dt < 220) paintLogoCell(cell, HALF_BLOCKS[ch] ? ch : '▒', 'h');
          else paintLogoCell(cell, ch, base);
          continue;
        }
        var d = Math.abs(c - (rows - 1 - r) * TILT - p);
        if (d <= HALF && 1 - d / HALF > 0.35) {
          if (HALF_BLOCKS[ch]) paintLogoCell(cell, ch, 'h');
          else paintLogoCell(cell, LIGHTER[ch] || ch, base);
        } else paintLogoCell(cell, ch, base);
      }
    }
  }
  function logoTick() {
    var elapsed = Date.now() - logoStart;
    var duration = logoPhase === 'intro' ? INTRO_MS : SWEEP_MS;
    if (elapsed >= duration) {
      logoPhase = 'idle';
      paintLogo(0);
      logoTimer = setTimeout(function () { startLogo('sweep'); }, SWEEP_EVERY_MS);
      return;
    }
    paintLogo(elapsed);
    logoRaf = root.requestAnimationFrame(logoTick);
  }
  function startLogo(phase) {
    if (reduced) return;
    if (logoTimer) clearTimeout(logoTimer);
    if (logoRaf) root.cancelAnimationFrame(logoRaf);
    logoPhase = phase;
    logoStart = Date.now();
    logoTick();
  }

  // ---- state -------------------------------------------------------------------
  var prefsDb = null, histDb = null;
  try { if (root.gifos && root.gifos.db) { prefsDb = root.gifos.db('prefs'); histDb = root.gifos.db('history'); } } catch (e) {}
  var prefs = { id: 'prefs', theme: 'auto', instance: '', apiKey: '' };
  var history = [];
  var instance = null;         // parseInstance() of the configured base, once per session
  var phase = { name: 'input' };
  var url = '', urlDraft = '', histIndex = -1;
  var platform = null, info = null, choices = [], highlight = 0;
  var pendingUrl = '';
  var runId = 0;
  var spinnerTimer = 0;
  var SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  function bridge(target, opts) {
    if (!root.gifos || typeof root.gifos.fetch !== 'function') return Promise.reject(new Error('this GifOS has no network bridge — update it'));
    return root.gifos.fetch(target, opts);
  }
  function withBudget(p, ms, what) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; reject(new Error(what || 'timed out')); } }, ms);
      p.then(function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } },
             function (e) { if (!done) { done = true; clearTimeout(t); reject(e); } });
    });
  }
  function friendly(e) {
    var m = String((e && e.message) || e || '');
    if (/Network denied/.test(m)) return 'GifOS blocked that host — allow it under Abilities in the bar above';
    if (/response too large/.test(m)) return 'the instance sent more than the bridge carries';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'couldn’t reach the instance — is the address right, and does it allow browsers (CORS)?';
    return m || 'something went wrong';
  }

  function applyTheme() {
    doc.body.className = 'theme-' + (prefs.theme || 'auto');
  }
  function savePrefs() {
    if (!prefsDb) return Promise.resolve();
    return prefsDb.put({ id: 'prefs', theme: prefs.theme, instance: prefs.instance, apiKey: prefs.apiKey }).catch(function () {});
  }
  function cycleTheme() {
    var modes = ['auto', 'light', 'dark'];
    prefs.theme = modes[(modes.indexOf(prefs.theme) + 1) % modes.length];
    applyTheme();
    savePrefs();
    renderHints();
  }
  function addToHistory(u) {
    history = [u].concat(history.filter(function (h) { return h !== u; })).slice(0, HISTORY_LIMIT);
    if (!histDb) return;
    histDb.put({ id: u, url: u, at: Date.now() }).then(function () {
      return histDb.getAll();
    }).then(function (all) {
      all = (all || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      for (var i = HISTORY_LIMIT; i < all.length; i++) histDb.delete(all[i].id).catch(function () {});
    }).catch(function () {});
  }

  // ---- phases ----------------------------------------------------------------
  function setPhase(p) {
    phase = p;
    render();
  }
  function resetToInput(keepUrl) {
    runId++;
    var keep = keepUrl ? url : '';
    url = '';
    urlDraft = keep;
    histIndex = -1;
    platform = null;
    info = null;
    choices = [];
    highlight = 0;
    setPhase({ name: 'input' });
  }
  function cancelRun() { resetToInput(true); }

  function ensureInstance(token) {
    if (instance && instance.base === prefs.instance) return Promise.resolve(instance);
    var base = prefs.instance;
    setPhase({ name: 'probing', status: 'checking the instance…' });
    return withBudget(bridge(base + '/', { method: 'GET', headers: authHeaders({ Accept: 'application/json' }, prefs.apiKey) }), 15000, 'the instance took too long to answer')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var inst = parseInstance(j, base);
        if (!inst) throw new Error('that address didn’t answer like a cobalt instance');
        if (token === runId) { instance = inst; $('sites').textContent = sitesLine(inst.services); }
        return inst;
      }, function (e) {
        var m = String((e && e.message) || '');
        if (/^that address|took too long/.test(m)) throw e;
        throw new Error(friendly(e));
      });
  }

  function fetchMeta(target, plat) {
    return withBudget(bridge(oembedUrl(target, plat), { method: 'GET', headers: { Accept: 'application/json' } }), META_BUDGET_MS)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || typeof j !== 'object' || j.error) return null;
        return { title: String(j.title || ''), uploader: String(j.author_name || '') };
      })
      .catch(function () { return null; });
  }

  function startProbe(target) {
    var token = ++runId;
    url = target;
    platform = detectPlatform(target);
    info = null;
    if (!prefs.instance) {
      pendingUrl = target;
      setPhase({ name: 'settings', note: 'no instance yet — name one, and your link is kept' });
      return;
    }
    setPhase({ name: 'probing', status: 'warming up…' });
    ensureInstance(token).then(function (inst) {
      if (token !== runId) return;
      if (inst.turnstile && !String(prefs.apiKey || '').trim()) throw new Error(errorText('error.api.auth.jwt.missing'));
      if (inst.services.length && platform.service && inst.services.indexOf(platform.service) < 0) {
        throw new Error('this instance doesn’t serve ' + platform.label.toLowerCase() + ' — it serves ' + sitesLine(inst.services));
      }
      setPhase({ name: 'probing', status: 'fetching video info…' });
      return fetchMeta(target, platform).then(function (meta) {
        if (token !== runId) return;
        info = meta;
        choices = buildChoices(platform);
        highlight = 0;
        setPhase({ name: 'picking' });
      });
    }).catch(function (e) {
      if (token !== runId) return;
      setPhase({ name: 'error', message: friendly(e) });
    });
  }

  function handOff(target) {
    var w = null;
    try { w = root.open(target, '_blank'); } catch (e) { w = null; }
    if (w) { try { w.opener = null; } catch (e) {} }
    return !!w;
  }

  function handlePick(index) {
    var choice = choices[index];
    if (!choice) return;
    var token = ++runId;
    setPhase({ name: 'downloading', choice: choice });
    var body = JSON.stringify(requestBody(url, choice));
    withBudget(bridge(prefs.instance + '/', {
      method: 'POST',
      headers: authHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' }, prefs.apiKey),
      body: body
    }), 90000, 'the instance took too long — try again')
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (token !== runId) return;
        var res = parseResponse(j);
        if (res.kind === 'error') { setPhase({ name: 'error', message: res.message }); return; }
        if (res.kind === 'picker') {
          if (!res.items.length && !res.audio) { setPhase({ name: 'error', message: errorText('error.api.fetch.empty') }); return; }
          addToHistory(url);
          highlight = 0;
          setPhase({ name: 'picker', items: res.items, audio: res.audio, audioFilename: res.audioFilename });
          return;
        }
        if (res.kind === 'local') {
          if (res.urls.length === 1) {
            addToHistory(url);
            setPhase({ name: 'ready', url: res.urls[0], filename: res.filename, note: 'this instance leaves the ' + (res.type || 'remux') + ' to the client, which yoinks can’t do here — this saves the raw stream as it is' });
          } else {
            setPhase({ name: 'error', message: 'this instance leaves the ' + (res.type || 'merge') + ' to the client (local processing), which yoinks can’t do here — use an instance that processes on the server' });
          }
          return;
        }
        addToHistory(url);
        if (handOff(res.url)) setPhase({ name: 'done', url: res.url, filename: res.filename });
        else setPhase({ name: 'ready', url: res.url, filename: res.filename });
      })
      .catch(function (e) {
        if (token !== runId) return;
        setPhase({ name: 'error', message: friendly(e) });
      });
  }

  function handleUrlSubmit(value) {
    var trimmed = String(value || '').trim();
    if (!isProbablyUrl(trimmed)) {
      urlDraft = value;
      setPhase({ name: 'input', warning: 'that doesn’t look like a link — paste a full url' });
      return;
    }
    urlDraft = '';
    startProbe(trimmed);
  }

  function saveSettings() {
    var instInput = $('inst'), keyInput = $('key');
    var base = cleanInstance(instInput ? instInput.value : '');
    var key = keyInput ? keyInput.value.trim() : '';
    if (!base) {
      setPhase({ name: 'settings', note: 'that doesn’t look like an https address', keep: { inst: instInput ? instInput.value : '', key: key } });
      return;
    }
    prefs.instance = base;
    prefs.apiKey = key;
    instance = null;
    savePrefs();
    var token = ++runId;
    setPhase({ name: 'settings', checking: true, note: 'checking ' + base + '…' });
    ensureInstance(token).then(function (inst) {
      if (token !== runId) return;
      var note = '✓ cobalt ' + inst.version + ' · ' + (inst.services.length ? inst.services.length + ' sites' : 'sites unknown');
      if (inst.turnstile && !key) note += ' · needs a browser challenge or an api key';
      if (pendingUrl) { var u = pendingUrl; pendingUrl = ''; startProbe(u); return; }
      setPhase({ name: 'settings', note: note, saved: true });
    }).catch(function (e) {
      if (token !== runId) return;
      setPhase({ name: 'settings', note: '✗ ' + friendly(e), saved: true });
    });
  }

  // ---- render ------------------------------------------------------------------
  function frameInput(title, opts) {
    var wrap = el('div', 'frame-input');
    var frame = el('div', 'frame' + (opts.button ? '' : ' closed'));
    frame.appendChild(el('span', 'frame-title', title));
    frame.appendChild(el('span', 'prompt', '❯'));
    if (opts.input) frame.appendChild(opts.input);
    else frame.appendChild(el('span', 'value', opts.value || ''));
    wrap.appendChild(frame);
    if (opts.button) {
      var b = el('button', 'frame-btn' + (opts.dim ? ' dim' : ''), opts.button);
      b.type = 'button';
      if (opts.onClick && !opts.dim) b.addEventListener('click', opts.onClick);
      wrap.appendChild(b);
    }
    return wrap;
  }
  function textInput(id, placeholder, value) {
    var i = el('input');
    i.id = id;
    i.type = 'text';
    i.autocomplete = 'off';
    i.spellcheck = false;
    i.placeholder = placeholder;
    i.value = value || '';
    i.setAttribute('aria-label', placeholder);
    return i;
  }
  function panel(title) {
    var p = el('div', 'panel');
    p.appendChild(el('span', 'frame-title', title));
    return p;
  }
  function bar(percent) {
    var width = 30;
    var filled = Math.round(Math.max(0, Math.min(1, percent)) * width);
    var b = el('div', 'bar');
    b.appendChild(el('span', 'fill', new Array(filled + 1).join('█')));
    b.appendChild(el('span', 'rest', new Array(width - filled + 1).join('░')));
    b.appendChild(el('span', 'fill', ' ' + (String(Math.round(percent * 100)) + '%').padStart(4)));
    return b;
  }
  function spinnerLine(text) {
    var line = el('div', 'meta-line');
    var s = el('span', 'spin', SPIN[0]);
    s.setAttribute('data-spin', '1');
    line.appendChild(s);
    line.appendChild(el('span', 'dim', ' ' + text));
    return line;
  }
  function tickSpinner() {
    var nodes = doc.querySelectorAll('[data-spin]');
    if (!nodes.length) return;
    var i = Math.floor(Date.now() / 80) % SPIN.length;
    for (var k = 0; k < nodes.length; k++) nodes[k].textContent = SPIN[i];
  }

  function render() {
    var stage = $('stage');
    stage.textContent = '';
    var p = phase;

    if (p.name === 'input') {
      var input = textInput('url', 'https://youtube.com/watch?v=…', urlDraft);
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); handleUrlSubmit(input.value); }
        else if (ev.key === 'ArrowUp' && history.length) {
          ev.preventDefault();
          if (histIndex === -1) urlDraft = input.value;
          histIndex = Math.min(history.length - 1, histIndex + 1);
          input.value = history[histIndex];
        } else if (ev.key === 'ArrowDown' && histIndex >= 0) {
          ev.preventDefault();
          histIndex--;
          input.value = histIndex < 0 ? urlDraft : history[histIndex];
        } else if (ev.key === ',' && !input.value) {
          ev.preventDefault();
          setPhase({ name: 'settings' });
        }
      });
      input.addEventListener('paste', function (ev) {
        var text = '';
        try { text = (ev.clipboardData || root.clipboardData).getData('text'); } catch (e) {}
        if (!input.value && isProbablyUrl(text)) { ev.preventDefault(); input.value = text.trim(); handleUrlSubmit(input.value); }
      });
      stage.appendChild(frameInput('Paste a link', { input: input, button: YOINK_BUTTON, onClick: function () { handleUrlSubmit(input.value); } }));
      var note = el('div', 'note dim');
      if (p.warning) { note.className = 'note dim warn'; note.textContent = p.warning; }
      else if (!prefs.instance) note.textContent = 'no instance yet — press , or tap settings to name one';
      stage.appendChild(note);
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 0);
    }

    if (p.name === 'probing') {
      stage.appendChild(frameInput(platform ? platform.label : 'Paste a link', { value: url, button: YOINK_BUTTON, dim: true }));
    }

    if (p.name === 'picking') {
      var pick = el('div', 'pick');
      var meta = el('div', 'meta');
      meta.appendChild(el('div', 'title', (info && info.title) || truncate(url, 60)));
      var by = '▸ ' + platform.label + (info && info.uploader ? ' · ' + info.uploader : '');
      meta.appendChild(el('div', 'by dim', by));
      pick.appendChild(meta);
      var pnl = panel('Download');
      var ul = el('ul', 'choices');
      choices.forEach(function (c, i) {
        var li = el('li', i === highlight ? 'sel' : '');
        li.appendChild(el('span', 'ind', i === highlight ? '❯' : ''));
        li.appendChild(doc.createTextNode(choiceLabel(c)));
        li.addEventListener('click', function () { highlight = i; handlePick(i); });
        ul.appendChild(li);
      });
      pnl.appendChild(ul);
      pick.appendChild(pnl);
      stage.appendChild(pick);
    }

    if (p.name === 'picker') {
      var pk = el('div', 'pick');
      var m2 = el('div', 'meta');
      m2.appendChild(el('div', 'title', (info && info.title) || truncate(url, 60)));
      m2.appendChild(el('div', 'by dim', '▸ ' + platform.label + ' · ' + p.items.length + (p.items.length === 1 ? ' item' : ' items')));
      pk.appendChild(m2);
      var pn2 = panel('Pick one');
      var ul2 = el('ul', 'choices');
      var rows = p.items.map(function (it, i) { return { label: (it.type === 'video' ? '▶ ' : '▣ ') + it.type + ' ' + (i + 1), url: it.url }; });
      if (p.audio) rows.push({ label: '♪ background audio', url: p.audio });
      rows.forEach(function (r, i) {
        var li = el('li');
        var a = el('a', i === highlight ? 'sel' : '');
        a.href = r.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.appendChild(el('span', 'ind', i === highlight ? '❯' : ''));
        a.appendChild(doc.createTextNode(r.label));
        a.addEventListener('click', function () { highlight = i; renderSelection(); });
        li.appendChild(a);
        ul2.appendChild(li);
      });
      pn2.appendChild(ul2);
      pk.appendChild(pn2);
      stage.appendChild(pk);
    }

    if (p.name === 'downloading') {
      stage.appendChild(el('div', 'dim', (info && info.title ? truncate(info.title, 42) + ' · ' : '') + p.choice.label));
      stage.appendChild(bar(0));
      stage.appendChild(spinnerLine('starting download…'));
    }

    if (p.name === 'done' || p.name === 'ready') {
      var done = el('div', 'done');
      var head = el('div');
      if (p.name === 'done') {
        head.appendChild(el('b', '', '✓ yoinked! '));
        head.appendChild(doc.createTextNode('your browser is saving:'));
      } else {
        head.appendChild(el('b', '', '✓ ready. '));
        head.appendChild(doc.createTextNode('tap to save:'));
      }
      done.appendChild(head);
      done.appendChild(el('div', 'file dim', p.filename || truncate(p.url, 60)));
      if (p.name === 'done') {
        var again = el('button', 'again', DONE_LABEL);
        again.type = 'button';
        again.addEventListener('click', function () { resetToInput(false); });
        done.appendChild(again);
        var small = el('div', 'small');
        var a2 = el('a', '', 'didn’t start? save it again');
        a2.href = p.url; a2.target = '_blank'; a2.rel = 'noopener';
        small.appendChild(a2);
        done.appendChild(small);
      } else {
        var save = el('a', 'again primary', '↵ save ' + (p.filename ? truncate(p.filename, 28) : 'file'));
        save.id = 'save';
        save.href = p.url; save.target = '_blank'; save.rel = 'noopener';
        save.addEventListener('click', function () { setTimeout(function () { if (phase === p) setPhase({ name: 'done', url: p.url, filename: p.filename }); }, 400); });
        done.appendChild(el('div'));
        done.appendChild(save);
        if (p.note) done.appendChild(el('div', 'small dim', p.note));
      }
      stage.appendChild(done);
    }

    if (p.name === 'error') {
      stage.appendChild(el('div', 'error', '✗ ' + p.message));
    }

    if (p.name === 'settings') {
      var box = el('div', 'settings');
      var inst = textInput('inst', 'https://cobalt.example.com', p.keep ? p.keep.inst : prefs.instance);
      var key = textInput('key', 'api key, if the owner gave you one', p.keep ? p.keep.key : prefs.apiKey);
      var onEnter = function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); saveSettings(); } };
      inst.addEventListener('keydown', onEnter);
      key.addEventListener('keydown', onEnter);
      box.appendChild(frameInput('cobalt instance', { input: inst, button: 'save', dim: !!p.checking, onClick: saveSettings }));
      box.appendChild(frameInput('api key', { input: key }));
      stage.appendChild(box);
      var n3 = el('div', 'note dim', p.note || 'any cobalt 10+ instance that lets browsers in. running one is a single container: search “cobalt run an instance”.');
      stage.appendChild(n3);
      if (!p.checking) setTimeout(function () { try { (prefs.instance ? key : inst).focus(); } catch (e) {} }, 0);
    }

    renderHints();
  }

  function renderSelection() {
    var items = doc.querySelectorAll('.choices > li');
    for (var i = 0; i < items.length; i++) {
      var target = items[i].querySelector('a') || items[i];
      target.className = i === highlight ? 'sel' : '';
      var ind = target.querySelector('.ind');
      if (ind) ind.textContent = i === highlight ? '❯' : '';
    }
  }

  function hintsFor() {
    var theme = ['alt+t', 'theme:' + prefs.theme];
    switch (phase.name) {
      case 'input': {
        var h = [['↵', 'yoink']];
        if (history.length) h.push(['↑', 'history']);
        h.push([',', 'settings'], theme);
        return h;
      }
      case 'probing': return [['esc', 'cancel'], theme];
      case 'picking': return [['↑↓', 'choose'], ['↵', 'yoink'], ['esc', 'back'], theme];
      case 'picker': return [['↑↓', 'choose'], ['↵', 'save'], ['esc', 'back'], theme];
      case 'downloading': return [['esc', 'cancel'], theme];
      case 'done': return [['↵', 'yoink another'], theme];
      case 'ready': return [['↵', 'save'], ['esc', 'back'], theme];
      case 'error': return [['↵', 'try again'], [',', 'settings'], theme];
      case 'settings': return [['↵', 'save'], ['esc', 'back'], theme];
    }
    return [theme];
  }
  function hintAction(key) {
    if (key === 'alt+t') return cycleTheme;
    if (key === ',') return function () { setPhase({ name: 'settings' }); };
    if (key === 'esc') return (phase.name === 'probing' || phase.name === 'downloading') ? cancelRun : function () { resetToInput(false); };
    if (key === '↵') {
      if (phase.name === 'input') return function () { var i = $('url'); handleUrlSubmit(i ? i.value : ''); };
      if (phase.name === 'picking') return function () { handlePick(highlight); };
      if (phase.name === 'picker') return function () { clickSelected(); };
      if (phase.name === 'ready') return function () { var s = $('save'); if (s) s.click(); };
      if (phase.name === 'settings') return saveSettings;
      if (phase.name === 'error' || phase.name === 'done') return function () { resetToInput(false); };
    }
    return null;
  }
  function renderHints() {
    var nav = $('hints');
    nav.textContent = '';
    if (phase.name === 'probing') {
      var lead = el('span', 'lead');
      var s = el('span', 'spin', SPIN[0]);
      s.setAttribute('data-spin', '1');
      lead.appendChild(s);
      lead.appendChild(el('span', 'dim', ' ' + phase.status));
      nav.appendChild(lead);
      nav.appendChild(el('span', 'sep', '  ·  '));
    }
    hintsFor().forEach(function (h, i) {
      if (i > 0) nav.appendChild(el('span', 'sep', '  ·  '));
      var action = hintAction(h[0]);
      var b = el('button', 'hint' + (action ? '' : ' plain'));
      b.type = 'button';
      b.appendChild(doc.createTextNode(h[0]));
      b.appendChild(el('span', 'l', ' ' + h[1]));
      if (action) b.addEventListener('click', action);
      nav.appendChild(b);
    });
  }
  function clickSelected() {
    var items = doc.querySelectorAll('.choices > li');
    var li = items[highlight];
    var a = li && li.querySelector('a');
    if (a) a.click();
  }

  // ---- keys --------------------------------------------------------------------
  doc.addEventListener('keydown', function (ev) {
    if (ev.altKey && (ev.key === 't' || ev.key === 'T')) { ev.preventDefault(); cycleTheme(); return; }
    var typing = ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA');
    if (ev.key === 'Escape') {
      ev.preventDefault();
      if (phase.name === 'probing' || phase.name === 'downloading') cancelRun();
      else if (phase.name !== 'input') resetToInput(false);
      return;
    }
    if (typing) return;
    var listy = phase.name === 'picking' || phase.name === 'picker';
    var count = listy ? doc.querySelectorAll('.choices > li').length : 0;
    if (listy && count) {
      if (ev.key === 'ArrowDown' || ev.key === 'j') { ev.preventDefault(); highlight = (highlight + 1) % count; renderSelection(); return; }
      if (ev.key === 'ArrowUp' || ev.key === 'k') { ev.preventDefault(); highlight = (highlight - 1 + count) % count; renderSelection(); return; }
      if (/^[1-9]$/.test(ev.key)) {
        var n = Number(ev.key) - 1;
        if (n < count) { ev.preventDefault(); highlight = n; if (phase.name === 'picking') handlePick(n); else { renderSelection(); clickSelected(); } }
        return;
      }
    }
    if (ev.key === 'Enter') {
      var act = hintAction('↵');
      if (act) { ev.preventDefault(); act(); }
      return;
    }
    if (ev.key === ',' && (phase.name === 'error' || phase.name === 'done')) { ev.preventDefault(); setPhase({ name: 'settings' }); }
  });

  $('logo').addEventListener('click', function () {
    if (phase.name === 'probing' || phase.name === 'downloading') cancelRun();
    else if (phase.name !== 'input') resetToInput(false);
    startLogo('sweep');
  });
  try { if (root.gifos && typeof root.gifos.onBack === 'function') root.gifos.onBack(function () { if (phase.name !== 'input') resetToInput(false); }); } catch (e) {}

  // ---- boot --------------------------------------------------------------------
  buildLogo();
  applyTheme();
  render();
  startLogo('intro');
  spinnerTimer = setInterval(tickSpinner, 80);
  void spinnerTimer;

  var demo = root.YOINKS_DEMO;
  if (demo) {
    if (demo.theme) { prefs.theme = demo.theme; applyTheme(); }
    if (demo.instance) prefs.instance = demo.instance;
    if (demo.url) { url = demo.url; platform = detectPlatform(demo.url); }
    if (demo.info) info = demo.info;
    if (demo.phase === 'picking') { choices = buildChoices(platform); highlight = 0; setPhase({ name: 'picking' }); }
    logoPhase = 'idle'; paintLogo(0);
    if (logoRaf) root.cancelAnimationFrame(logoRaf);
    if (logoTimer) clearTimeout(logoTimer);
    return;
  }

  var loads = [];
  if (prefsDb) loads.push(prefsDb.get('prefs').then(function (r) {
    if (r) {
      if (r.theme === 'light' || r.theme === 'dark' || r.theme === 'auto') prefs.theme = r.theme;
      prefs.instance = cleanInstance(r.instance) || '';
      prefs.apiKey = String(r.apiKey || '');
    }
  }).catch(function () {}));
  if (histDb) loads.push(histDb.getAll().then(function (all) {
    history = (all || []).filter(function (r) { return r && typeof r.url === 'string'; })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); })
      .map(function (r) { return r.url; }).slice(0, HISTORY_LIMIT);
  }).catch(function () {}));
  Promise.all(loads).then(function () {
    applyTheme();
    if (phase.name === 'input') {
      var i = $('url');
      var draft = i ? i.value : '';
      urlDraft = draft;
      render();
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
