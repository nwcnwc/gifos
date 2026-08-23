#!/usr/bin/env node
/*
 * sign-apps.mjs — sign every listed App GIF as gifos.app.
 *
 *   node scripts/sign-apps.mjs              # sign what's unsigned, rebuild catalog
 *   node scripts/sign-apps.mjs --dry-run    # list, write nothing
 *   node scripts/sign-apps.mjs --force      # re-sign even if already gifos.app
 *   node scripts/sign-apps.mjs fluence      # just those slugs
 *
 * THE KEY NEVER GOES TO GITHUB. GitHub Actions can store a secret and sign
 * in CI — that is how most "automated code signing" works, and it is the
 * wrong shape here. docs/threat-model.md: provenance private keys live on
 * the signer's machine, never in the repo, Workers, or any AI channel. A
 * leaked Actions secret would let anyone mint "✓ signed by gifos.app".
 * Pages publishes whatever is already in site/; this script is the step
 * before commit.
 *
 * Point GIFOS_SIGN_KEY at the JWK sign.html downloads. The public half MUST
 * match site/gifos.key, or this refuses to sign — otherwise a second key
 * would ship GIFs the live domain key cannot verify, and the store would
 * refuse the install.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable, Writable } from 'node:stream';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'apps');
const OUT = path.join(ROOT, 'site', 'apps');
const PUB_PATH = path.join(ROOT, 'site', 'gifos.key');
const DOMAIN = 'gifos.app';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const FORCE = argv.includes('--force');
const slugsWanted = argv.filter((a) => !a.startsWith('--'));
const KEY_PATH = process.env.GIFOS_SIGN_KEY || '';

function die(msg, code) {
  console.error(msg);
  process.exit(code == null ? 1 : code);
}

// Node 18's CompressionStream rejects deflate-raw. gifos-gif.js needs it to
// decode a real App GIF (contentHash). Wrap zlib; Node 22+ native is used
// when it actually accepts the format.
function installDeflateRaw() {
  const ok = (() => {
    try {
      new CompressionStream('deflate-raw');
      new DecompressionStream('deflate-raw');
      return true;
    } catch (e) { return false; }
  })();
  if (ok) return;
  globalThis.CompressionStream = class {
    constructor(format) {
      if (format !== 'deflate-raw') throw new TypeError('unsupported format ' + format);
      const t = zlib.createDeflateRaw();
      this.readable = Readable.toWeb(t);
      this.writable = Writable.toWeb(t);
    }
  };
  globalThis.DecompressionStream = class {
    constructor(format) {
      if (format !== 'deflate-raw') throw new TypeError('unsupported format ' + format);
      const t = zlib.createInflateRaw();
      this.readable = Readable.toWeb(t);
      this.writable = Writable.toWeb(t);
    }
  };
}

function b64urlToBytes(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - String(s).length % 4) % 4);
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function listedSlugs() {
  return fs.readdirSync(SRC).filter((d) => {
    const dir = path.join(SRC, d);
    return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'listing.json'));
  }).sort();
}

function claimOf(bytes) {
  const at = bytes.indexOf(Buffer.from('GIFOSSIG'));
  if (at < 0) return null;
  let p = at + 11;
  const parts = [];
  while (p < bytes.length) {
    const n = bytes[p];
    if (!n) break;
    parts.push(bytes.subarray(p + 1, p + 1 + n));
    p += 1 + n;
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch (e) { return { type: '', id: '' }; }
}

installDeflateRaw();
if (!globalThis.crypto) globalThis.crypto = crypto.webcrypto;
const require = createRequire(import.meta.url);
require(path.join(ROOT, 'site/js/gifos-gif.js'));
require(path.join(ROOT, 'site/js/gifos-ed.js'));
require(path.join(ROOT, 'site/js/gifos-sign.js'));
const sign = globalThis.GifOS.sign;
const ed = globalThis.GifOS.ed;

const all = listedSlugs();
const slugs = slugsWanted.length ? slugsWanted : all;
for (const s of slugs) {
  if (!all.includes(s)) die('not a listed app: ' + s);
}

if (DRY) {
  for (const slug of slugs) {
    const gifPath = path.join(OUT, slug, slug + '.gif');
    if (!fs.existsSync(gifPath)) { console.log(slug + '\tMISSING ' + path.relative(ROOT, gifPath)); continue; }
    const claim = claimOf(fs.readFileSync(gifPath));
    const who = claim && claim.id ? (claim.type + ':' + claim.id) : 'unsigned';
    console.log(slug + '\t' + who);
  }
  process.exit(0);
}

if (!KEY_PATH) {
  die('Set GIFOS_SIGN_KEY to the domain-signing JWK (the file sign.html downloads).\n' +
    'It does not go in the repo and does not go in GitHub Secrets.', 2);
}
if (!fs.existsSync(KEY_PATH)) {
  die('GIFOS_SIGN_KEY is not a readable file.', 2);
}

const jwk = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8'));
if (!jwk || jwk.crv !== 'Ed25519' || !jwk.d || !jwk.x) {
  die('signing key is not an Ed25519 JWK (need kty/crv/d/x). sign.html downloads this shape.');
}

const expectedPub = Buffer.from(fs.readFileSync(PUB_PATH, 'utf8').trim(), 'base64');
if (expectedPub.length !== 32) die('site/gifos.key is not a 32-byte Ed25519 public key');
const keyPub = Buffer.from(b64urlToBytes(jwk.x));
if (Buffer.compare(expectedPub, keyPub) !== 0) {
  die(
    'This private key does not match site/gifos.key.\n' +
    'Signing with it would ship GIFs the live domain key cannot verify, and the\n' +
    'store would refuse the install. Use the JWK that goes with the published gifos.key.',
    3
  );
}

const seed = b64urlToBytes(jwk.d);
if (seed.length !== 32) die('JWK d is not a 32-byte seed');
const { priv, pubRaw } = await ed.keysFromSeed(seed);
if (Buffer.compare(Buffer.from(pubRaw), expectedPub) !== 0) {
  die('derived public key still does not match site/gifos.key');
}
const keyPair = { privateKey: priv };
const today = new Date().toISOString().slice(0, 10);

let signed = 0, skipped = 0;
for (const slug of slugs) {
  const gifPath = path.join(OUT, slug, slug + '.gif');
  if (!fs.existsSync(gifPath)) die(slug + ': no GIF at ' + path.relative(ROOT, gifPath));
  const raw = fs.readFileSync(gifPath);
  const bytes = new Uint8Array(raw);
  const claim = claimOf(raw);
  if (!FORCE && claim && claim.type === 'domain' && claim.id === DOMAIN) {
    const chHex = Buffer.from(await sign.contentHash(bytes)).toString('hex');
    const st = sign.statement('domain', DOMAIN, chHex);
    const ok = await sign._ed25519Verify(new Uint8Array(expectedPub), sign._b64ToBytes(claim.sig), st);
    if (ok) {
      console.log('skip  ' + slug + '  already signed ' + (claim.ts || ''));
      skipped++;
      continue;
    }
    console.log('re-sign ' + slug + '  (block present but does not verify against gifos.key)');
  }
  const out = await sign.signDomain(bytes, DOMAIN, keyPair, today);
  fs.writeFileSync(gifPath, Buffer.from(out));
  console.log('signed ' + slug + '  ' + out.length + ' bytes  ts=' + today);
  signed++;
}

if (signed) {
  const cat = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-app-catalog.mjs')], {
    cwd: ROOT, stdio: 'inherit',
  });
  if (cat.status) die('catalog rebuild failed', cat.status);
}
console.log((signed ? 'Signed ' + signed : 'No GIFs signed') + (skipped ? ', skipped ' + skipped : '') + '.');
