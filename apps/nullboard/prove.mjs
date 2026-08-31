// Prove first paint: demo board with lists+notes, add a note, persist to gifos.db.
// Chromium cannot reach 127.0.0.1 HTTP on this box — use file:// + dump-dom.
// One Chrome, killed on exit. Run: node apps/nullboard/prove.mjs
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const dir = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.GIFOS_CHROME
  || process.env.HOME + '/.cache/ms-playwright/chromium-1228/chrome-linux/chrome';
if (!existsSync(CHROME)) throw new Error('no chrome at ' + CHROME);

const STUB = `
window.__nbPuts = [];
window.__nbErrors = [];
window.addEventListener('error', function (ev) {
  window.__nbErrors.push(String(ev.message || ev.error || 'error'));
});
window.addEventListener('unhandledrejection', function (ev) {
  window.__nbErrors.push(String((ev.reason && ev.reason.message) || ev.reason || 'reject'));
});
(function () {
  var stores = {};
  window.gifos = {
    db: function (name) {
      var store = stores[name] || (stores[name] = {});
      return {
        put: function (rec) {
          store[rec.id] = JSON.parse(JSON.stringify(rec));
          window.__nbPuts.push({ name: name, id: rec.id });
          return Promise.resolve(rec);
        },
        get: function (id) { return Promise.resolve(store[id] || null); },
        getAll: function () { return Promise.resolve(Object.keys(store).map(function (k) { return store[k]; })); },
        subscribe: function (cb) { cb(Object.keys(store).map(function (k) { return store[k]; })); },
        delete: function (id) { delete store[id]; return Promise.resolve(true); }
      };
    },
    me: function () { return Promise.resolve({ id: 'me', name: 'You' }); },
    info: function () { return Promise.resolve({ owner: true, appId: 'nullboard' }); },
    onBack: function () {}
  };
})();
`;

const RUNNER = `
(function () {
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function write(obj) {
    var el = document.getElementById('prove-out') || document.createElement('pre');
    el.id = 'prove-out';
    el.textContent = JSON.stringify(obj);
    document.body.appendChild(el);
  }
  (async function () {
    try {
      var t0 = Date.now();
      while (!(window.NB && window.NB.board && window.NBApp)) {
        if (window.__nbErrors && window.__nbErrors.length) throw new Error('boot error: ' + window.__nbErrors.join(' | '));
        if (Date.now() - t0 > 8000) throw new Error('boot timeout start=' + (typeof window.startNullboard));
        await sleep(40);
      }
      var lists = document.querySelectorAll('.wrap .board .list').length;
      var notes = document.querySelectorAll('.wrap .board .note').length;
      var title = (window.NB.board && window.NB.board.title) || '';
      var nbGlobal = (typeof NB !== 'undefined') && NB === window.NB;
      if (!nbGlobal) throw new Error('NB is not the window.NB global');
      if (lists < 3) throw new Error('demo board missing lists, have ' + lists);
      if (notes < 6) throw new Error('demo board missing notes, have ' + notes);
      if (!/Welcome/i.test(title)) throw new Error('demo title is ' + JSON.stringify(title));
      var before = notes;
      window.NBApp.addNote();
      t0 = Date.now();
      while (!document.querySelector('.wrap .board .note.editing .edit, .wrap .board .note.brand-new .edit')) {
        if (Date.now() - t0 > 4000) throw new Error('addNote did not start editing');
        await sleep(40);
      }
      var el = document.querySelector('.wrap .board .note.editing .edit, .wrap .board .note.brand-new .edit');
      el.value = 'persisted from prove';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.blur();
      await sleep(700);
      var afterNotes = document.querySelectorAll('.wrap .board .note').length;
      var puts = window.__nbPuts.filter(function (p) { return p.name === 'save'; }).length;
      var hasText = Array.prototype.some.call(document.querySelectorAll('.wrap .board .note .text'), function (n) {
        return /persisted from prove/.test(n.textContent || '');
      });
      if ((window.__nbErrors || []).some(function (m) { return /NB is not defined/i.test(m); })) {
        throw new Error('NB is not defined after addNote: ' + window.__nbErrors.join(' | '));
      }
      if (afterNotes <= before) throw new Error('addNote did not keep a note (' + before + ' → ' + afterNotes + ')');
      if (!hasText) throw new Error('typed note did not land in the board');
      if (puts < 1) throw new Error('gifos.db save was never put');
      write({ ok: true, lists: lists, notes: afterNotes, puts: puts, title: title });
    } catch (e) {
      write({ ok: false, err: String(e && e.message || e), errors: window.__nbErrors || [] });
    }
  })();
})();
`;

function fail(msg) { throw new Error('PROVE: ' + msg); }

let html = readFileSync(join(dir, 'index.html'), 'utf8');
html = html.replace('<head>', '<head>\n<script>' + STUB + '</script>');
html = html.replace(/<script src="([^"]+)"><\/script>/g, function (_, src) {
  return '<script src="' + pathToFileURL(join(dir, src)).href + '"></script>';
});
html = html.replace(/href="(vendor\/nullboard\.css|style\.css)"/g, function (_, href) {
  return 'href="' + pathToFileURL(join(dir, href)).href + '"';
});
html = html.replace('</body>', '<script>' + RUNNER + '</script>\n</body>');
const provePath = join(tmpdir(), 'nb-prove.html');
writeFileSync(provePath, html);

const r = spawnSync(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--allow-file-access-from-files',
  '--virtual-time-budget=12000',
  '--timeout=15000',
  '--dump-dom',
  pathToFileURL(provePath).href,
], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 25000 });

try { unlinkSync(provePath); } catch (e) {}
if (r.error) fail(String(r.error));
const dom = r.stdout || '';
const m = /id="prove-out"[^>]*>([^<]*)</.exec(dom);
if (!m) {
  const welcome = /Welcome to Nullboard/.test(dom);
  const lists = (dom.match(/class="list"/g) || []).length;
  fail('no prove-out (chrome status ' + r.status + ', welcome=' + welcome + ', lists=' + lists + ', err=' + (r.stderr || '').slice(-400) + ')');
}
let result;
try { result = JSON.parse(m[1]); } catch (e) { fail('bad prove-out JSON: ' + m[1]); }
if (!result.ok) fail(result.err || JSON.stringify(result));
console.log('PROVE ok —', result.lists, 'lists,', result.notes, 'notes, save puts', result.puts);
