// Optional vs required install-time assets (gifos-assets.js).
//
// Required pins download at install and on boot. Optional pins do not —
// gifos.assets(path) fetches that one row. This file guards the FILTER, not
// the network: list() / missing() decide what would be fetched. A regression
// that treated optional as required would make every installer pay for models
// they never pick (the vocal-remover karaoke weight, and anything after it).
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const nodeCrypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const sandbox = {
  window: {
    crypto: nodeCrypto.webcrypto,
    location: { origin: 'https://gifos.app' },
  },
  console,
  URL,
  Blob,
  Uint8Array,
};
sandbox.window.window = sandbox.window;
sandbox.fetch = () => Promise.reject(new Error('fetch not stubbed'));
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'site', 'js', 'gifos-assets.js'), 'utf8'),
  sandbox, { filename: 'gifos-assets.js' });
const A = sandbox.window.GifOS.assets;

let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d && !c ? '  ' + d : ''));
  if (!c) failures++;
};

const sha = 'a'.repeat(64);
const req = { url: 'https://example.com/must.bin', sha256: sha, path: 'must.bin', bytes: 9e7 };
const opt = { url: 'https://example.com/maybe.bin', sha256: sha, path: 'maybe.bin', bytes: 5e7, optional: true };
const m = { assets: [req, opt] };

const listed = A.list(m);
check('list() keeps both pins', listed.length === 2);
check('list() marks optional honestly', listed[0].optional === false && listed[1].optional === true);

A.missing({}, m, null).then((all) => {
  check('missing() without requiredOnly wants both', all.length === 2, String(all.length));
  return A.missing({}, m, null, { requiredOnly: true });
}).then((reqOnly) => {
  check('missing({requiredOnly}) skips the optional pin',
    reqOnly.length === 1 && reqOnly[0].path === 'must.bin',
    JSON.stringify(reqOnly.map((a) => a.path)));
  return A.missing({}, { assets: [opt] }, null, { requiredOnly: true });
}).then((none) => {
  check('an app of only optional pins backfills nothing at boot', none.length === 0);
  return A.missing({}, m, null, { optionalOnly: true });
}).then((optOnly) => {
  check('missing({optionalOnly}) is just the extra files',
    optOnly.length === 1 && optOnly[0].path === 'maybe.bin',
    JSON.stringify(optOnly.map((a) => a.path)));
  check('an unknown path is not in the list (ensurePath must refuse it)',
    !A.list(m).some((a) => a.path === 'other.bin'));

  const sameHost = A.groupByHost([
    { url: '/apps/bible/packs/a.gbp', path: 'a.gbp' },
    { url: '/apps/bible/packs/b.gbp', path: 'b.gbp' },
    { url: 'https://gifos.app/apps/bible/packs/c.gbp', path: 'c.gbp' },
  ]);
  check('origin-relative pins and the same https host are one server',
    sameHost.order.length === 1 && sameHost.order[0] === 'gifos.app' &&
    sameHost.groups['gifos.app'].length === 3,
    JSON.stringify(sameHost.order));
  const split = A.groupByHost([
    { url: 'https://gifos.app/a.bin', path: 'a.bin' },
    { url: 'https://huggingface.co/b.bin', path: 'b.bin' },
    { url: 'https://gifos.app/c.bin', path: 'c.bin' },
  ]);
  check('different hosts stay in separate queues',
    split.order.length === 2 &&
    split.groups['gifos.app'].length === 2 &&
    split.groups['huggingface.co'].length === 1,
    JSON.stringify(split.order));

  const pin = { url: 'https://example.com/d.bin', sha256: sha, path: 'd.bin', bytes: 1449821, optional: true };
  check('a cached row with the pin’s hash is this pin',
    A.rowMatches({ blob: {}, bytes: 1449821, sha256: sha }, pin) === true);
  check('a cached row with a different hash is not this pin',
    A.rowMatches({ blob: {}, bytes: 1449821, sha256: 'b'.repeat(64) }, pin) === false);
  check('a pre-hash row of a different length is not this pin',
    A.rowMatches({ blob: {}, bytes: 1228922 }, pin) === false);
  check('a pre-hash row of the same length is still accepted (legacy cache)',
    A.rowMatches({ blob: {}, bytes: 1449821 }, pin) === true);

  const staleCache = {
    has: (path, p) => Promise.resolve(A.rowMatches({ blob: {}, bytes: 1228922 }, p)),
  };
  const freshCache = {
    has: (path, p) => Promise.resolve(A.rowMatches({ blob: {}, bytes: 1449821, sha256: sha }, p)),
  };
  return A.missing({}, { assets: [pin] }, staleCache).then((stale) => {
    check('missing() re-fetches a same-path pin whose cached length moved',
      stale.length === 1 && stale[0].path === 'd.bin', JSON.stringify(stale.map((a) => a.path)));
    return A.missing({}, { assets: [pin] }, freshCache);
  }).then((fresh) => {
    check('missing() keeps a cached pin whose stored hash still matches',
      fresh.length === 0, JSON.stringify(fresh.map((a) => a.path)));

    const body = Buffer.from('pin-bytes-for-hash');
    const shaPin = nodeCrypto.createHash('sha256').update(body).digest('hex');
    const pinOf = (url, p) => ({
      url, sha256: shaPin, path: p, bytes: body.length, optional: true,
    });
    const put = [];
    const cache = {
      has: () => Promise.resolve(false),
      put: (p) => { put.push(p); return Promise.resolve(); },
    };

    function stubFetch(delayOf) {
      const inflight = { n: 0, max: 0, host: Object.create(null), hostMax: Object.create(null) };
      sandbox.fetch = (url) => {
        const host = new URL(url).host;
        inflight.n++;
        inflight.max = Math.max(inflight.max, inflight.n);
        inflight.host[host] = (inflight.host[host] || 0) + 1;
        inflight.hostMax[host] = Math.max(inflight.hostMax[host] || 0, inflight.host[host]);
        const wait = delayOf ? delayOf(url) : 50;
        return new Promise((resolve) => setTimeout(() => {
          inflight.n--;
          inflight.host[host]--;
          resolve({
            ok: true,
            headers: { get: () => '' },
            blob: () => Promise.resolve(new Blob([body])),
          });
        }, wait));
      };
      return inflight;
    }

    const same = [
      pinOf('https://gifos.app/a.bin', 'a.bin'),
      pinOf('https://gifos.app/b.bin', 'b.bin'),
      pinOf('https://gifos.app/c.bin', 'c.bin'),
    ];
    const oneHost = stubFetch();
    return A.ensure({}, { assets: same }, null, cache, { optionalOnly: true, parallelHosts: true })
      .then((r) => {
        check('Download all on one host fetches every extra file',
          r.fetched === 3 && r.failed === 0, JSON.stringify(r));
        check('one host never opens a second socket on that server',
          oneHost.hostMax['gifos.app'] === 1 && oneHost.max === 1,
          'max=' + oneHost.max + ' hostMax=' + oneHost.hostMax['gifos.app']);

        const mixed = [
          pinOf('https://gifos.app/d.bin', 'd.bin'),
          pinOf('https://huggingface.co/e.bin', 'e.bin'),
        ];
        const twoHost = stubFetch(() => 80);
        put.length = 0;
        return A.ensure({}, { assets: mixed }, null, cache, { optionalOnly: true, parallelHosts: true })
          .then((r2) => {
            check('two hosts run at the same time',
              r2.fetched === 2 && twoHost.max >= 2,
              'max=' + twoHost.max + ' fetched=' + r2.fetched);
            check('each of those hosts still goes one file at a time',
              twoHost.hostMax['gifos.app'] === 1 && twoHost.hostMax['huggingface.co'] === 1,
              JSON.stringify(twoHost.hostMax));

            const broken = [
              pinOf('https://gifos.app/ok.bin', 'ok.bin'),
              pinOf('https://gifos.app/bad.bin', 'bad.bin'),
            ];
            sandbox.fetch = (url) => {
              if (/bad\.bin/.test(url)) {
                return Promise.resolve({
                  ok: false, status: 404, headers: { get: () => '' },
                  blob: () => Promise.resolve(new Blob([])),
                });
              }
              return Promise.resolve({
                ok: true, headers: { get: () => '' },
                blob: () => Promise.resolve(new Blob([body])),
              });
            };
            return A.ensure({}, { assets: broken }, null, cache, { optionalOnly: true, parallelHosts: true });
          });
      })
      .then((r3) => {
        check('a failed pin on Download all does not abandon the rest',
          r3.fetched === 1 && r3.failed === 1, JSON.stringify(r3));
        console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
        process.exit(failures ? 1 : 0);
      });
  });
}).catch((e) => {
  console.log('FAIL — ' + e && e.stack || e);
  process.exit(1);
});
