/*
 * vendor.mjs — rebuild vendor/ from the pinned ghosh/uiGradients commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT
 * part of build.mjs: the App GIF must be buildable offline from what is
 * committed here. Run this only to move the pin.
 *
 *   node apps/ui-gradients/vendor.mjs
 *
 * WHAT IT PRODUCES. gradients.json is the community list; gradients.js is
 * the same list as a classic IIFE (GifOS inlines <script src> and DROPS
 * type="module", so a raw JSON file cannot ride in as-is).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const vendor = join(dir, 'vendor');
mkdirSync(vendor, { recursive: true });

// Moving the pin is a deliberate act: bump COMMIT + SHA256 together.
const COMMIT = 'c07376ba587c6607bfb01465a88b26ee5f92d80f';
const JSON_URL = 'https://raw.githubusercontent.com/ghosh/uiGradients/' + COMMIT + '/gradients.json';
const LIC_URL = 'https://raw.githubusercontent.com/ghosh/uiGradients/' + COMMIT + '/LICENSE.md';
const JSON_SHA256 = '56e1cf9e9c213aece92be9e1abe32aed958bf10c77031f2504431964b1cb7030';
const LICENSE_SHA256 = 'dbea8f3f615dceaaf0bdc386990302144d56f8e49164ca0e11fb475804aae2f2';

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

function wrap(jsonText) {
  const data = JSON.parse(jsonText);
  if (!Array.isArray(data) || data.length < 300) {
    throw new Error('gradients.json has ' + (data && data.length) + ' entries — expected hundreds');
  }
  const clean = data.map(function (g) {
    if (!g || typeof g.name !== 'string' || !Array.isArray(g.colors)) {
      throw new Error('bad gradient entry');
    }
    const colors = g.colors.map(function (c) {
      let s = String(c).trim();
      if (s.charAt(0) !== '#') s = '#' + s;
      if (!/^#[0-9a-fA-F]{3,8}$/.test(s)) throw new Error('bad colour ' + s + ' in ' + g.name);
      return s;
    });
    if (colors.length < 2) throw new Error('need two colours: ' + g.name);
    return { name: g.name, colors: colors };
  });
  const body = JSON.stringify(clean);
  if (/<\/script/i.test(body)) throw new Error('gradients.json contains </script — cannot inline safely');
  return '/* uiGradients gradients.json — GENERATED, run vendor.mjs */\n' +
    '(function (root) {\n' +
    "  'use strict';\n" +
    '  root.UIGradientsData = ' + body + ';\n' +
    '})(this);\n';
}

const jsonRes = await fetch(JSON_URL);
if (!jsonRes.ok) throw new Error('download failed: ' + jsonRes.status + ' ' + JSON_URL);
const jsonBuf = Buffer.from(await jsonRes.arrayBuffer());
const jsonHex = sha256(jsonBuf);
if (jsonHex !== JSON_SHA256) {
  throw new Error('gradients.json sha256 ' + jsonHex + ' ≠ pin ' + JSON_SHA256 + ' — move the pin deliberately.');
}

const licRes = await fetch(LIC_URL);
if (!licRes.ok) throw new Error('download failed: ' + licRes.status + ' ' + LIC_URL);
const licBuf = Buffer.from(await licRes.arrayBuffer());
const licHex = sha256(licBuf);
if (licHex !== LICENSE_SHA256) {
  throw new Error('LICENSE.md sha256 ' + licHex + ' ≠ pin ' + LICENSE_SHA256 + ' — move the pin deliberately.');
}
if (!licBuf.toString('utf8').includes('Indrashish Ghosh')) {
  throw new Error('LICENSE.md is not Indrashish Ghosh\'s MIT notice');
}

const js = wrap(jsonBuf.toString('utf8'));

writeFileSync(join(vendor, 'gradients.json'), jsonBuf);
writeFileSync(join(vendor, 'gradients.js'), js);
writeFileSync(join(vendor, 'COPYING-uigradients.txt'), licBuf);
writeFileSync(join(vendor, 'UPSTREAM.txt'),
  'vendor/gradients.json is GENERATED. Do not edit it;\n' +
  'run node apps/ui-gradients/vendor.mjs.\n\n' +
  'source:  ghosh/uiGradients\n' +
  'url:     https://github.com/ghosh/uiGradients\n' +
  'file:    gradients.json\n' +
  'commit:  ' + COMMIT + ' (last change to gradients.json)\n' +
  'sha256:  ' + JSON_SHA256 + '\n' +
  'count:   ' + JSON.parse(jsonBuf.toString('utf8')).length + '\n' +
  'entry:   vendor/gradients.js — classic IIFE, sets UIGradientsData\n\n' +
  'The MIT notice travels beside it as COPYING-uigradients.txt and is packed\n' +
  'into the GIF too, so a copy of this app that someone was handed still\n' +
  'carries the notice it is required to carry.\n\n' +
  'The original Vue site cannot ride in (GifOS drops type=module). This\n' +
  'directory is the port: the same colour list, browse and copy, private\n' +
  'favourites, and a shared pick. Nothing is fetched at run time.\n'
);

console.log('wrote vendor/gradients.json —', jsonBuf.length, 'bytes,',
            JSON.parse(jsonBuf.toString('utf8')).length, 'ramps, commit', COMMIT.slice(0, 10));
