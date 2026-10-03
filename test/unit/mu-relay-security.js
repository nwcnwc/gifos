// mu-relay-security.js — the relay keeps no network address, nor any hash of one.
//
// The per-address caps are gone (3 Oct 2026): a socket cap, a join-rate log
// (joinLog) and an edge limiter (ipHits) all keyed on a salted address hash,
// and those maps were the only reason the relay kept anything derived from an
// address. Now nothing is kept: the attachment carries no address tag, the
// room object holds no per-address map, and the edge entry counts nothing.
// whoami still hands a socket its own address. That frame is not stored.
//
// Run: node test/unit/mu-relay-security.js
import { makeRoom } from '../lib/relay-worker.js';
import relay from '../../relay/src/relay.js';

let fails = 0;
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined && !cond ? '  ' + JSON.stringify(extra) : ''));
  if (!cond) fails++;
};
const q = (peer) => ({ role: 'mesh', token: 'T', peer, dev: peer + 'd' });

(async () => {
  const room = makeRoom({ ABUSE_SALT: 'mu-relay-sec' });
  const join = async (peer, ip) => {
    const r = await room.connect('rate-room', q(peer), ip);
    if (r.err || !r.server || r.server.closed) {
      check('connect ' + peer, false, { err: r.err && r.err.message, closed: r.server && r.server.closed });
      return null;
    }
    const att = room.session.att(r.server);
    const who = r.server.of('whoami')[0];
    return { ip, att, who: who && who.ip };
  };

  const a = await join('A', '198.51.100.20');
  const b = await join('B', '198.51.100.20');
  const v1 = await join('V1', '2001:db8:1:2::10');
  check('whoami still tells the socket its own address', !!(a && a.who === '198.51.100.20'));
  check('...and an IPv6 socket its own address', !!(v1 && v1.who === '2001:db8:1:2::10'));
  const keys = [a, b, v1].filter(Boolean).map((x) => Object.keys(x.att).sort().join(','));
  check('the attachment carries no address tag', [a, b, v1].every((x) => x && !('iph' in x.att)), keys);
  const dump = JSON.stringify([a, b, v1].map((x) => x && x.att));
  check('no attachment holds the address', dump.indexOf('198.51.100.20') < 0 && dump.indexOf('2001:db8') < 0);
  check('the room object holds no per-address map', !('joinLog' in room.session) && !('recountAt' in room.session) && !('iph' in room.session.ix()));

  async function edgeHit(ip) {
    const env = {
      SESSION: {
        idFromName() { return 'id'; },
        get() { return { fetch() { return new Response('ok', { status: 200 }); } }; },
      },
    };
    const res = await relay.fetch({
      url: 'https://relay.test/s/edge-room',
      headers: new Map([['CF-Connecting-IP', ip]]),
    }, env);
    return res.status;
  }
  let allowed = 0;
  for (let i = 1; i <= 301; i++) if ((await edgeHit('198.51.100.10')) === 200) allowed++;
  check('the edge passes 301 upgrades from one address', allowed === 301, { allowed });

  console.log(fails ? ('\n' + fails + ' FAIL') : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
