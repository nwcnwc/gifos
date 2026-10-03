// mu-relay-security.js — join-rate maps must not hold a raw network address.
//
// The door stores ipTag(), a salted hash of ipKey(), and uses that tag for
// the per-network socket cap. ipKey() itself is a raw IPv4 or an IPv6 /64.
// joinLog (this room object) and ipHits (the edge isolate) count joins on
// that same network. Keying them on ipKey() keeps recent joiner networks in
// memory, which the iph comment says the relay does not store. Both maps
// must key on the salted tag. One network is still one bucket, because the
// hash is over ipKey().
//
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
    const iph = room.session.att(r.server).iph;
    const who = r.server.of('whoami')[0];
    return { ip, iph, who: who && who.ip };
  };

  const a = await join('A', '198.51.100.20');
  const b = await join('B', '198.51.100.20');
  const keys4 = a && b ? [...room.session.joinLog.keys()] : [];
  const log4 = a && room.session.joinLog.get(a.iph);
  check('whoami still tells the socket its own address', !!(a && a.who === '198.51.100.20'));
  check('joinLog keys on the attachment ip tag, not the address', !!(a && b && keys4.length === 1 && keys4[0] === a.iph && a.iph === b.iph && log4 && log4.length === 2), { n: keys4.length, same: !!(a && b && a.iph === b.iph), len: log4 && log4.length });
  check('that tag is 24 hex chars and contains no address punctuation', !!(a && /^[0-9a-f]{24}$/.test(a.iph) && a.iph.indexOf('.') < 0 && a.iph.indexOf(':') < 0));

  const v1 = await join('V1', '2001:db8:1:2::10');
  const v2 = await join('V2', '2001:db8:1:2::11');
  const v3 = await join('V3', '2001:db8:9:9::1');
  const shared = v1 && room.session.joinLog.get(v1.iph);
  check('one IPv6 /64 is one join-rate bucket, keyed by the salted tag', !!(v1 && v2 && v1.iph === v2.iph && shared && shared.length === 2 && room.session.joinLog.has(v1.iph)));
  check('a different /64 is a different tag', !!(v1 && v3 && v1.iph !== v3.iph && room.session.joinLog.get(v3.iph) && room.session.joinLog.get(v3.iph).length === 1));
  const raw = [...room.session.joinLog.keys()].some((k) => String(k).indexOf(':') >= 0 || String(k).indexOf('.') >= 0 || String(k).indexOf('/') >= 0);
  check('no joinLog key is a raw address or an ipKey prefix', !raw);

  async function edgeHit(ip, salt) {
    const env = {
      ABUSE_SALT: salt,
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

  let allowed = 0, limitedAt = 0;
  for (let i = 1; i <= 301; i++) {
    const st = await edgeHit('198.51.100.10', 'salt-a');
    if (st === 200) allowed++;
    else { limitedAt = i; break; }
  }
  check('the 301st upgrade from one address is limited', limitedAt === 301 && allowed === 300, { limitedAt, allowed });
  check('a second address is not limited by the first', (await edgeHit('198.51.100.11', 'salt-a')) === 200);
  check('a new abuse salt is a new edge bucket for the same address', (await edgeHit('198.51.100.10', 'salt-b')) === 200);

  console.log(fails ? ('\n' + fails + ' FAIL') : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
