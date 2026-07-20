// Unit test for the relay's Origin allowlist — the thing that stops random
// websites from freeloading on the relay. Pure logic, no server needed.
import { originAllowed } from '../../relay/src/relay.js';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }

// default allowlist (no env): gifos.app + subdomains, localhost, no-Origin
check('gifos.app is allowed', originAllowed('https://gifos.app'));
check('a digit subdomain is allowed', originAllowed('https://3.gifos.app'));
check('a deep subdomain is allowed', originAllowed('https://foo.bar.gifos.app'));
check('no Origin header is allowed (native apps, curl, same-origin nav)', originAllowed(''));
check('no Origin (undefined) is allowed', originAllowed(undefined));
check('localhost is always allowed (dev + tests)', originAllowed('http://localhost:8099'));
check('127.0.0.1 is always allowed', originAllowed('http://127.0.0.1:8791'));

// the whole point: random websites are turned away
check('a random website is BLOCKED', !originAllowed('https://evil.com'));
check('a lookalike suffix is BLOCKED (notgifos.app-style trick)', !originAllowed('https://evilgifos.app'));
check('a lookalike prefix host is BLOCKED (gifos.app.evil.com)', !originAllowed('https://gifos.app.evil.com'));
check('a bare hostname (no scheme) as origin is BLOCKED', !originAllowed('gifos.app.evil.com'));
check('garbage origin is BLOCKED', !originAllowed('not a url'));

// env override: operator can widen or replace the list
const env = { ALLOWED_ORIGINS: 'https://gifos.app,https://partner.example' };
check('env allows an extra explicit origin', originAllowed('https://partner.example', env));
check('env still blocks everyone else', !originAllowed('https://evil.com', env));
check('localhost stays allowed even under a strict env override', originAllowed('http://localhost:3000', env));
const star = { ALLOWED_ORIGINS: '*' };
check('a wildcard env opens it up (opt-in)', originAllowed('https://anywhere.example', star));

console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
process.exit(failures ? 1 : 0);
