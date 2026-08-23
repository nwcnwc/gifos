// sign-apps.mjs: the catalog signer. The private key stays off GitHub; this
// suite holds the script to that — missing key, wrong key, dry-run listing.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'sign-apps.mjs');

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra && !cond ? '  ' + extra : ''));
  if (!cond) failures++;
}

function run(args, extraEnv) {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd: ROOT,
      env: Object.assign({}, process.env, extraEnv || {}),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout: out, stderr: '' };
  } catch (e) {
    return {
      status: e.status == null ? 1 : e.status,
      stdout: String(e.stdout || ''),
      stderr: String(e.stderr || ''),
    };
  }
}

const dry = run(['--dry-run']);
check('dry-run exits 0 without a key', dry.status === 0, 'status=' + dry.status + ' ' + dry.stderr.slice(0, 200));
check('dry-run lists fluence as already signed gifos.app',
  /^fluence\tdomain:gifos.app$/m.test(dry.stdout), dry.stdout.slice(0, 400));
check('dry-run lists at least one unsigned catalog GIF',
  /\tunsigned$/m.test(dry.stdout), dry.stdout);

const unset = run([], { GIFOS_SIGN_KEY: '' });
check('unset GIFOS_SIGN_KEY exits 2 and names GitHub Secrets as the wrong place',
  unset.status === 2 && /GitHub Secrets/.test(unset.stderr),
  'status=' + unset.status + ' ' + unset.stderr.slice(0, 300));
const missing = run([], { GIFOS_SIGN_KEY: path.join(os.tmpdir(), 'gifos-no-such-key-' + Date.now() + '.json') });
check('a missing GIFOS_SIGN_KEY file exits 2',
  missing.status === 2 && /not a readable file/.test(missing.stderr),
  'status=' + missing.status + ' ' + missing.stderr.slice(0, 300));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gifos-sign-'));
const wrongPath = path.join(tmp, 'gifos-signing-key.json');
// A well-formed Ed25519 JWK whose public half is not site/gifos.key.
fs.writeFileSync(wrongPath, JSON.stringify({
  kty: 'OKP', crv: 'Ed25519',
  d: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
}));
const wrong = run([], { GIFOS_SIGN_KEY: wrongPath });
check('a key that does not match site/gifos.key exits 3 and does not write',
  wrong.status === 3 && /does not match site\/gifos\.key/.test(wrong.stderr),
  'status=' + wrong.status + ' ' + wrong.stderr.slice(0, 300));

const cat = run(['--dry-run']); // catalog GIFs untouched
check('a refused key leaves fluence still the only signed listing in dry-run',
  (cat.stdout.match(/^fluence\tdomain:gifos.app$/m) ? 1 : 0) === 1);

if (failures) { console.log('\n' + failures + ' FAILURE(S)'); process.exit(1); }
console.log('\nALL PASS');
