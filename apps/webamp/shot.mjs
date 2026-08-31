// Photograph the real first-boot Webamp window into screenshot.png.
// Also proves EQ lands in prefs and the invite setlist paints.
//
//   node apps/webamp/shot.mjs
import { existsSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';

const dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(dir, 'screenshot.png');

function findChrome() {
  if (process.env.GIFOS_CHROME && existsSync(process.env.GIFOS_CHROME)) return process.env.GIFOS_CHROME;
  const home = homedir();
  const roots = [join(home, '.cache/ms-playwright'), '/opt/pw-browsers'];
  const found = [];
  for (const root of roots) {
    let names = [];
    try { names = readdirSync(root); } catch (e) { continue; }
    names.filter((n) => /^chromium-\d+$/.test(n))
      .sort((a, b) => parseInt(b.split('-')[1], 10) - parseInt(a.split('-')[1], 10))
      .forEach((n) => {
        found.push(join(root, n, 'chrome-linux', 'chrome'));
        found.push(join(root, n, 'chrome-linux64', 'chrome'));
      });
  }
  found.push('/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable');
  for (const p of found) if (existsSync(p)) return p;
  throw new Error('no Chromium — set GIFOS_CHROME');
}

function stubSource() {
  return '(' + function () {
    var stores = {};
    var subs = {};
    var seq = 0;
    function list(name) {
      return Object.keys(stores[name] || {}).map(function (k) { return stores[name][k]; });
    }
    function notify(name) {
      (subs[name] || []).forEach(function (fn) { fn(list(name)); });
    }
    window.__puts = [];
    window.gifos = {
      db: function (name) {
        stores[name] = stores[name] || {};
        subs[name] = subs[name] || [];
        return {
          put: function (rec) {
            rec = Object.assign({}, rec);
            if (!rec.id) rec.id = name + '-' + (++seq);
            stores[name][rec.id] = rec;
            window.__puts.push({
              name: name, id: rec.id,
              eq: rec.eq || null,
              list: rec.list || null
            });
            notify(name);
            return Promise.resolve(rec);
          },
          get: function (id) { return Promise.resolve(stores[name][id] || null); },
          getAll: function () { return Promise.resolve(list(name)); },
          subscribe: function (cb) {
            subs[name].push(cb);
            cb(list(name));
          },
          delete: function (id) { delete stores[name][id]; notify(name); return Promise.resolve(true); }
        };
      },
      me: function () { return Promise.resolve({ id: 'me', name: 'You' }); },
      info: function () { return Promise.resolve({ owner: true, appId: 'webamp' }); },
      onBack: function () {}
    };
  }.toString() + ')();';
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function launchChrome(bin) {
  const profile = mkdtempSync(join(tmpdir(), 'webamp-shot-'));
  const child = spawn(bin, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  child._profile = profile;
  let err = '';
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      reject(new Error('chrome did not print DevTools URL. stderr: ' + err.slice(-800)));
    }, 15000);
    function onData(buf) {
      err += String(buf);
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        child.stderr.off('data', onData);
        resolve({ child: child, wsUrl: m[1] });
      }
    }
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('exit', function (code) {
      if (!child._kept) reject(new Error('chrome exited ' + code + ' stderr=' + err.slice(-400)));
    });
  });
}

function attachCdp(wsUrl) {
  return new Promise(function (resolve, reject) {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener('open', function () { resolve(api); });
    ws.addEventListener('error', reject);
    ws.addEventListener('message', function (ev) {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.method + ': ' + JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
    });
    const api = {
      ws: ws,
      send: function (method, params, sessionId) {
        const i = ++id;
        const payload = { id: i, method: method, params: params || {} };
        if (sessionId) payload.sessionId = sessionId;
        ws.send(JSON.stringify(payload));
        return new Promise(function (res, rej) { pending.set(i, { resolve: res, reject: rej }); });
      },
    };
  });
}

async function evaluate(cdp, sessionId, expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (r.exceptionDetails) {
    const t = r.exceptionDetails.exception && r.exceptionDetails.exception.description;
    throw new Error(t || JSON.stringify(r.exceptionDetails));
  }
  return r.result && r.result.value;
}

export async function captureCover() {
  const bin = findChrome();
  const launched = await launchChrome(bin);
  launched.child._kept = true;
  const child = launched.child;
  let cdp = null;
  try {
    cdp = await attachCdp(launched.wsUrl);
    const created = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const attached = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true });
    const sid = attached.sessionId;
    await cdp.send('Page.enable', {}, sid);
    await cdp.send('Runtime.enable', {}, sid);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 900, height: 560, deviceScaleFactor: 2, mobile: false,
    }, sid);
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: stubSource() }, sid);
    const url = pathToFileURL(join(dir, 'index.html')).href;
    await cdp.send('Page.navigate', { url: url }, sid);
    await sleep(200);
    const readyExpr = `new Promise(function (resolve, reject) {
      var t0 = Date.now();
      var names = '';
      (function tick() {
        var w = window.WebampShell && window.WebampShell.getPlayer();
        var main = document.getElementById('main-window');
        if (w && w.getPlaylistTracks && main) {
          var t = w.getPlaylistTracks();
          names = t.map(function (x) { return (x.title || '') + ' ' + (x.defaultName || ''); }).join('|');
          if (t.length >= 3 && /Intro/i.test(names)) { resolve({ n: t.length, names: names }); return; }
        }
        if (Date.now() - t0 > 18000) reject(new Error('boot timeout names=' + names));
        else setTimeout(tick, 50);
      })();
    })`;
    const ready = await evaluate(cdp, sid, readyExpr);
    await evaluate(cdp, sid, `(function () {
      var w = window.WebampShell.getPlayer();
      try { w.play(); } catch (e) {}
      var dock = document.getElementById('dock'); if (dock) dock.style.visibility = 'hidden';
      var sl = document.getElementById('setlist'); if (sl) sl.style.visibility = 'hidden';
      return w.getMediaStatus();
    })()`);
    await sleep(1100);
    const clip = await evaluate(cdp, sid, `(function () {
      var ids = ['main-window', 'equalizer-window', 'playlist-window'];
      var x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0;
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
        x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom);
      });
      if (x1 <= x0) throw new Error('webamp windows not laid out');
      var pad = 28;
      return {
        x: Math.max(0, Math.floor(x0 - pad)),
        y: Math.max(0, Math.floor(y0 - pad)),
        width: Math.ceil(x1 - x0 + pad * 2),
        height: Math.ceil(y1 - y0 + pad * 2)
      };
    })()`);
    const pic = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: 1 },
      fromSurface: true,
    }, sid);
    const shot = Buffer.from(pic.data, 'base64');
    writeFileSync(OUT, shot);

    await evaluate(cdp, sid, `(function () {
      var sl = document.getElementById('setlist');
      if (sl) sl.style.visibility = '';
      window.WebampShell.getPlayer().store.dispatch({ type: 'SET_BAND_VALUE', band: 60, value: 100 });
      return true;
    })()`);
    const eqOk = await evaluate(cdp, sid, `new Promise(function (resolve, reject) {
      var t0 = Date.now();
      (function tick() {
        var ok = (window.__puts || []).some(function (p) {
          if (p.name !== 'prefs' || !p.eq || !p.eq.sliders) return false;
          var v = p.eq.sliders[60];
          if (v == null) v = p.eq.sliders['60'];
          return v === 100;
        });
        if (ok) { resolve(true); return; }
        if (Date.now() - t0 > 5000) reject(new Error('prefs.eq 60 Hz never wrote'));
        else setTimeout(tick, 50);
      })();
    })`);
    await evaluate(cdp, sid, `new Promise(function (resolve, reject) {
      var t0 = Date.now();
      (function tick() {
        if (window.Net && window.Net.live()) { resolve(true); return; }
        if (Date.now() - t0 > 5000) reject(new Error('Net not live'));
        else setTimeout(tick, 40);
      })();
    })`);
    await evaluate(cdp, sid, `(async function () {
      var room = gifos.db('room');
      await room.put({ id: 'guest-1', kind: 'peer', name: 'Sam', at: Date.now() });
      await room.put({
        id: 'mix', kind: 'mix',
        tracks: [
          { title: 'Intro', artist: 'GifOS' },
          { title: 'Green LED', artist: 'GifOS' },
          { title: 'On a Plane', artist: 'GifOS' }
        ],
        now: { title: 'Intro' }, by: 'me', at: Date.now()
      });
      return true;
    })()`);
    const setlistOk = await evaluate(cdp, sid, `new Promise(function (resolve, reject) {
      var t0 = Date.now();
      (function tick() {
        var box = document.getElementById('setlist');
        var text = box ? box.innerText : '';
        if (box && !box.hidden && /Intro/.test(text) && /Green LED/.test(text)) { resolve(true); return; }
        if (Date.now() - t0 > 5000) reject(new Error('setlist hidden or empty: hidden=' + (box && box.hidden) + ' text=' + JSON.stringify(text)));
        else setTimeout(tick, 50);
      })();
    })`);
    void eqOk; void setlistOk; void ready;
    return { path: OUT, bytes: shot.length, clip: clip, tracks: ready };
  } finally {
    try { if (cdp && cdp.ws) cdp.ws.close(); } catch (e) {}
    try { child.kill('SIGKILL'); } catch (e) {}
    if (child._profile) {
      try { rmSync(child._profile, { recursive: true, force: true }); } catch (e) {}
    }
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const r = await captureCover();
  console.log('wrote', r.path, (r.bytes / 1024).toFixed(0) + 'KB', r.clip, r.tracks);
}
