// gen-key.mjs — mint the pay Worker's OWN Ed25519 signing key.
//
// Receipts and invoice tokens are signed by the pay Worker, whose private key
// therefore lives in a Cloudflare secret. That key must NOT be the app-
// provenance key (site/gifos.key): docs/threat-model.md § 2 says provenance
// private keys never enter a Worker, and a Worker compromise must not be able
// to forge domain-signed apps. So the Worker gets a key of its own, and its
// PUBLIC half is published as site/gifos-pay.key for the OS to verify
// receipts against.
//
//   node pay/gen-key.mjs                 # writes ~/.config/gifos/pay-sign.jwk (0600)
//                                        # and site/gifos-pay.key; prints only the public half
//   npx wrangler secret put GIFOS_PAY_SIGN_JWK < ~/.config/gifos/pay-sign.jwk   (in pay/)
//
// Refuses to overwrite an existing private key file; move it aside on purpose.
import { webcrypto } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRIV = process.env.GIFOS_PAY_KEY_OUT || join(homedir(), '.config', 'gifos', 'pay-sign.jwk');
const PUB = join(ROOT, 'site', 'gifos-pay.key');

if (existsSync(PRIV)) { console.error('refusing to overwrite ' + PRIV + ' — move it aside first'); process.exit(2); }
const kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const jwk = await webcrypto.subtle.exportKey('jwk', kp.privateKey);
const pubRaw = Buffer.from(await webcrypto.subtle.exportKey('raw', kp.publicKey));
if (pubRaw.length !== 32) throw new Error('not a 32-byte Ed25519 public key');
mkdirSync(dirname(PRIV), { recursive: true, mode: 0o700 });
writeFileSync(PRIV, JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, d: jwk.d }), { mode: 0o600 });
writeFileSync(PUB, pubRaw.toString('base64') + '\n');
console.log('private key: ' + PRIV + '  (0600; never print it, never commit it)');
console.log('public key:  ' + PUB + '  = ' + pubRaw.toString('base64'));
console.log('next: cd pay && npx wrangler secret put GIFOS_PAY_SIGN_JWK < ' + PRIV);
