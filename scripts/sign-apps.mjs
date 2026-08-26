#!/usr/bin/env node
/*
 * sign-apps.mjs — sign every listed App GIF as gifos.app.
 *
 *   node scripts/sign-apps.mjs              # sign what's unsigned, rebuild catalog
 *   node scripts/sign-apps.mjs --dry-run    # list, write nothing
 *   node scripts/sign-apps.mjs --force      # re-sign even if already gifos.app
 *   node scripts/sign-apps.mjs fluence      # just those slugs
 *   node scripts/sign-apps.mjs --remix-doc  # also seal llms.txt into each GIF
 *
 * --remix-doc packs site/llms.txt into the app filesystem, the same guide the
 * OS packer now puts in every app it builds (gifos-gif.js "remix doc"), so a
 * store app someone unpacks is as remixable as one built in the browser. It is
 * OPT-IN because it is not free: the listed GIFs predate the packer change, so
 * turning it on rewrites and re-signs all of them — every one a new blob in a
 * repo whose site/apps/ is already ~220 MB. Worth doing deliberately, once.
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
import { creditsJson, CREDITS_PATH } from './app-credits.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'apps');
const OUT = path.join(ROOT, 'site', 'apps');
const PUB_PATH = path.join(ROOT, 'site', 'gifos.key');
const DOMAIN = 'gifos.app';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const FORCE = argv.includes('--force');
const REMIX_DOC = argv.includes('--remix-doc');
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
const gif = globalThis.GifOS.gif;

// CREDITS UNDER THE SEAL. The listing's author / porter / basedOn /
// inspiredBy / license go INTO the GIF as credits.json (scripts/app-credits.mjs)
// so the Help screen's credit is signed bytes, not a store record. repack
// swaps only the data block — every pixel of the artwork stays. A GIF whose
// packed credits already match is left byte-identical (and keeps its sig).
const REMIX_DOC_PATH = gif.REMIX_DOC;   // 'llms.txt'
const remixDocText = () => fs.readFileSync(path.join(ROOT, 'site', REMIX_DOC_PATH), 'utf8');

async function withCredits(slug, bytes) {
  const want = creditsJson(JSON.parse(fs.readFileSync(path.join(SRC, slug, 'listing.json'), 'utf8')), slug);
  const archive = await gif.decode(bytes);
  if (!archive || !archive.files) throw new Error(slug + ': not a GifOS app GIF');
  const have = archive.files[CREDITS_PATH] ? Buffer.from(archive.files[CREDITS_PATH]).toString('utf8') : '';
  // The build guide rides under the same seal, for the same reason credits do:
  // an app someone unpacks should carry everything needed to repack it, and
  // signed bytes are the only version that can't have been swapped in transit.
  const doc = REMIX_DOC ? remixDocText() : null;
  const haveDoc = archive.files[REMIX_DOC_PATH] ? Buffer.from(archive.files[REMIX_DOC_PATH]).toString('utf8') : '';
  const needDoc = !!doc && haveDoc !== doc;
  if (have === want && !needDoc) return { bytes, changed: false };
  const files = Object.assign({}, archive.files);
  files[CREDITS_PATH] = want;
  if (needDoc) files[REMIX_DOC_PATH] = doc;
  return { bytes: await gif.repack(bytes, files), changed: true, doc: needDoc };
}
async function creditsState(slug, bytes) {
  try {
    const want = creditsJson(JSON.parse(fs.readFileSync(path.join(SRC, slug, 'listing.json'), 'utf8')), slug);
    const archive = await gif.decode(bytes);
    const have = archive && archive.files && archive.files[CREDITS_PATH] ? Buffer.from(archive.files[CREDITS_PATH]).toString('utf8') : '';
    return have === want ? 'credits:ok' : (have ? 'credits:stale' : 'credits:missing');
  } catch (e) { return 'credits:unreadable'; }
}

const all = listedSlugs();
const slugs = slugsWanted.length ? slugsWanted : all;
for (const s of slugs) {
  if (!all.includes(s)) die('not a listed app: ' + s);
}

if (DRY) {
  for (const slug of slugs) {
    const gifPath = path.join(OUT, slug, slug + '.gif');
    if (!fs.existsSync(gifPath)) { console.log(slug + '\tMISSING ' + path.relative(ROOT, gifPath)); continue; }
    const raw = fs.readFileSync(gifPath);
    const claim = claimOf(raw);
    const who = claim && claim.id ? (claim.type + ':' + claim.id) : 'unsigned';
    console.log(slug + '\t' + who + '\t' + await creditsState(slug, new Uint8Array(raw)));
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
  const packed = await withCredits(slug, new Uint8Array(raw));
  const bytes = packed.bytes;
  const claim = claimOf(Buffer.from(bytes));
  if (packed.changed) {
    console.log('pack  ' + slug + '  ' + [CREDITS_PATH, packed.doc ? REMIX_DOC_PATH : null].filter(Boolean).join(' + ') + ' — re-signing');
  }
  if (!packed.changed && !FORCE && claim && claim.type === 'domain' && claim.id === DOMAIN) {
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
