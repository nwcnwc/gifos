import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const COMMIT = '475a0e9dcb5bb6925d9b7f3c522a1312aeefad3d';
const LICENSE_SHA256 = '6390a91c6d82a7cdb00c06c2104da7afacc3c029901d3621870b8762386c32ae';
const url = 'https://raw.githubusercontent.com/xdadda/mini-photo-editor/' + COMMIT + '/LICENSE';
const outDir = join(dir, 'vendor');
mkdirSync(outDir, { recursive: true });
const res = await fetch(url);
if (!res.ok) throw new Error('download failed: ' + res.status);
const buf = Buffer.from(await res.arrayBuffer());
const hex = createHash('sha256').update(buf).digest('hex');
if (hex !== LICENSE_SHA256) throw new Error('LICENSE sha256 ' + hex + ' ≠ pin ' + LICENSE_SHA256);
writeFileSync(join(outDir, 'COPYING-mini-photo-editor.txt'), buf);
console.log('wrote COPYING-mini-photo-editor.txt', buf.length, COMMIT.slice(0, 10));
