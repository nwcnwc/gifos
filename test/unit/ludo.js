// LUDO HAS TO SEAT GUESTS AND FINISH A RACE.
//
// v1 claimed Invite was the lobby, but a guest never published a seat, so
// the second and third people both sat Green. Empty colours were not skipped.
// This suite PLAYS a full lap with forced dice, captures, three-six skip,
// and pins seatPeople so two live ids never share a colour.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'ludo');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load() {
  const sandbox = { console, Math, Object, Array, JSON, Date, String, Number, Boolean, window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'rules.js'), 'utf8'), sandbox, { filename: 'rules.js' });
  return sandbox.LUDO;
}

const L = load();
check('rules.js attaches LUDO', !!(L && L.fresh && L.roll && L.apply && L.seatPeople));
check('the loop is 52 squares', L.LOOP.length === 52, L.LOOP.length);

// ---- play a token all the way home ------------------------------------------
{
  let s = L.fresh(2);
  check('two-player: green and blue sit out', s.playing[0] && s.playing[2] && !s.playing[1] && !s.playing[3]);
  s = L.roll(s, 1);
  check('a 1 does not leave the yard', L.moves(s).length === 0, L.moves(s));
  check('…and the turn passes', s.turn === 2 && !s.rolled, { turn: s.turn, rolled: s.rolled });

  s = L.fresh(2);
  s = L.roll(s, 6);
  check('a 6 frees every yard token', L.moves(s).length === 4, L.moves(s).length);
  s = L.apply(s, 0);
  check('leaving the yard lands on start (step 0)', s.tokens[0][0] === 0, s.tokens[0][0]);
  check('a 6 is another roll', s.turn === 0 && !s.rolled, { turn: s.turn, rolled: s.rolled });

  // Walk without three sixes in a row: 6, 6, 5 (turn passes), opponent
  // has no move, red again. Then jump the remaining stretch with exact counts.
  s = L.roll(s, 6); s = L.apply(s, 0);
  check('second six advances to 6', s.tokens[0][0] === 6 && s.turn === 0, s.tokens[0][0]);
  s = L.roll(s, 5); s = L.apply(s, 0);
  check('a 5 lands on 11 and passes the turn', s.tokens[0][0] === 11 && s.turn === 2, { step: s.tokens[0][0], turn: s.turn });
  s = L.roll(s, 1);
  check('yellow with nothing out passes back to red', s.turn === 0 && !s.rolled, { turn: s.turn, log: s.log });
  s.tokens[0][0] = 50; s.sixes = 0; s.die = 0; s.rolled = false;
  s = L.roll(s, 6); s = L.apply(s, 0);
  check('an exact 6 from 50 takes it home (56)', s.tokens[0][0] === 56, s.tokens[0][0]);
  check('one token home is not a win', s.winner === -1, s.winner);
}

{
  // Overshooting home is refused.
  let s = L.fresh(2);
  s.tokens[0][0] = 55;
  s.turn = 0; s.die = 2; s.rolled = true;
  check('a 2 from 55 is not a legal home', L.moves(s).every((m) => m.t !== 0), L.moves(s));
  s.die = 1;
  check('a 1 from 55 is exact home', L.moves(s).some((m) => m.t === 0 && m.dest === 56), L.moves(s));
}

{
  // Capture: red on 14 lands on green who left start (green start is 0 = loop 13).
  let s = L.fresh(4);
  s.tokens[0][0] = 8;
  s.tokens[1][0] = 1; // green at loop 14
  s.turn = 0; s.die = 6; s.rolled = true;
  const mv = L.moves(s).filter((m) => m.t === 0)[0];
  check('landing on green off their start is a capture', !!(mv && mv.capture && mv.capture.p === 1), mv);
  s = L.apply(s, 0, 6);
  check('the captured token returns to the yard', s.tokens[1][0] === -1, s.tokens[1][0]);
  check('red stays on 14', s.tokens[0][0] === 14, s.tokens[0][0]);
}

{
  // Start square is safe.
  let s = L.fresh(4);
  s.tokens[0][0] = 7;
  s.tokens[1][0] = 0; // green on their start
  s.turn = 0; s.die = 6; s.rolled = true;
  const mv = L.moves(s).filter((m) => m.t === 0)[0];
  check('green on start is not captured', !!(mv && !mv.capture), mv);
}

{
  // Three sixes skip the turn.
  let s = L.fresh(2);
  s.sixes = 2; s.turn = 0;
  s = L.roll(s, 6);
  check('the third six skips the turn', s.turn === 2 && !s.rolled, { turn: s.turn, log: s.log });
}

{
  // Cannot land on your own token.
  let s = L.fresh(2);
  s.tokens[0][0] = 3;
  s.tokens[0][1] = 6;
  s.turn = 0; s.die = 3; s.rolled = true;
  check('a token may not land on one of its own',
    L.moves(s).every((m) => m.t !== 0 || m.dest !== 6), L.moves(s));
}

{
  // Four tokens home wins. Drive one colour home with exact counts.
  let s = L.fresh(2);
  s.tokens[0] = [56, 56, 56, 50];
  s.turn = 0; s.die = 6; s.rolled = true;
  s = L.apply(s, 3, 6);
  check('the fourth token home wins the race', s.winner === 0, { winner: s.winner, tokens: s.tokens[0] });
}

// ---- seating: the bug that shipped ------------------------------------------
{
  const a = L.seatPeople([null, null, null, null], ['host']);
  check('the first person sits Red', a[0] === 'host' && !a[1] && !a[2] && !a[3], a);

  const b = L.seatPeople(a, ['host', 'g1']);
  check('the first guest sits Green, not Red', b[0] === 'host' && b[1] === 'g1' && !b[2], b);

  const c = L.seatPeople(b, ['host', 'g2', 'g1']);
  check('a second guest sits Yellow — does NOT steal Green',
    c[0] === 'host' && c[1] === 'g1' && c[2] === 'g2' && !c[3], c);

  const d = L.seatPeople(c, ['g1', 'g2']);
  check('a missing host frees Red; the others keep their colours',
    d[0] === null && d[1] === 'g1' && d[2] === 'g2', d);

  const e = L.seatPeople(d, ['g1', 'g2', 'g3']);
  check('a late joiner takes the free Red seat', e[0] === 'g3' && e[1] === 'g1' && e[2] === 'g2', e);

  const same = L.seatPeople(['a', 'b', null, null], ['b', 'a', 'c']);
  check('seatPeople is deterministic for the same live set',
    same[0] === 'a' && same[1] === 'b' && same[2] === 'c', same);

  const play = L.playingFromSeats(['a', 'b', null, null]);
  check('empty seats are not playing', play[0] && play[1] && !play[2] && !play[3], play);

  let s = L.fresh(4);
  s.playing = play;
  s.turn = 1;
  L.nextTurn(s);
  check('nextTurn skips empty Yellow and Blue back to Red', s.turn === 0, s.turn);
}

// ---- source: guests publish, Invite is OS chrome, destack, onBack, save ------
{
  const app = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
  const listing = JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8'));
  check('no in-app Invite button', !html.includes('id="invite"') && !/>\s*Invite\s*</.test(html));
  check('app tells the player to press Invite', app.includes('Invite'));
  check('guests publish presence with putMe', app.includes('function putMe') && app.includes('putMe()'));
  check('host reconcile assigns seats', app.includes('seatPeople') && app.includes('reconcile'));
  check('gifos.db save is wired', app.includes("db('save')"));
  check('Continue resumes a local save', html.includes('id="contBtn"') && app.includes('contBtn'));
  check('onBack leaves the board for home', app.includes('onBack'));
  check('tokens destack on a shared square', css.includes('nth-child') && css.includes('.tok'));
  check('no React/Electron leftovers in the app',
    !app.includes('React') && !app.includes('electron') && !html.includes('type="module"'));
  check('help names Invite-as-lobby', /Invite/i.test(help) && help.trim().length >= 400);
  check('listing leads with the invite / no lobby reason',
    /invite|no lobby|no account/i.test(listing.description) && listing.tagline.length <= 120);
  check('listing does not mention React or gifos.db',
    !/React|gifos\.db|WebRTC/.test(JSON.stringify(listing)));
  check('generic Ludo, no trademarked skin names',
    !/parcheesi|sorry!|hasbro|ludo king/i.test(JSON.stringify(listing) + help));
}

if (failures) {
  console.log(failures + ' failure(s)');
  process.exit(1);
}
console.log('ok — ludo unit');
