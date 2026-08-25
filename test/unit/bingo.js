// WHOEVER SENT THE INVITE CALLS.
//
// Bingo used to pick its caller with "the lowest id in the room wins", and an
// id is a random string minted once per browser. So the ball fell to whichever
// of the two of you happened to sort first — reported from a real two-player
// game as "it was just randomly assigned to the guest" — and because the id
// never changes, the same guest took the ball off the same host every round.
//
// This suite stands up TWO vms, a host and a guest, through ONE fake room
// collection, and gives the guest the LOWER id on purpose: the shape that used
// to fail. It then hands the ball over and takes it back, because the room is
// the owner's to give.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'bingo');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

const flush = () => new Promise((r) => setImmediate(() => setImmediate(r)));

// ---- the room every device shares ------------------------------------------
// One collection, exactly like the runtime's: a row per player, a write from
// anyone echoed to everyone.
function makeRoom() {
  const rows = new Map();
  const subs = [];
  const items = () => Array.from(rows.values()).map((r) => JSON.parse(JSON.stringify(r)));
  const fire = () => { for (const cb of subs.slice()) cb(items()); };
  return {
    rows,
    items,
    fire,
    put(row) { rows.set(row.id, JSON.parse(JSON.stringify(row))); fire(); return Promise.resolve(row); },
    del(id) { rows.delete(id); fire(); return Promise.resolve(); },
    subscribe(cb) { subs.push(cb); cb(items()); },
  };
}

// ---- just enough DOM --------------------------------------------------------
function makeEl(id) {
  const handlers = {};
  const el = {
    id,
    hidden: false,
    disabled: false,
    className: '',
    innerHTML: '',
    textContent: '',
    value: '',
    width: 0,
    height: 0,
    style: {},
    children: [],
    onclick: null,
    dataset: {},
    attrs: {},
    classList: {
      set: new Set(),
      add(...n) { n.forEach((k) => el.classList.set.add(k)); },
      remove(...n) { n.forEach((k) => el.classList.set.delete(k)); },
      contains(k) { return el.classList.set.has(k); },
      toggle(k, on) { if (on) el.classList.set.add(k); else el.classList.set.delete(k); },
    },
    getAttribute(k) { return el.attrs[k] === undefined ? null : el.attrs[k]; },
    setAttribute(k, v) { el.attrs[k] = String(v); },
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    removeEventListener() {},
    appendChild(c) { el.children.push(c); return c; },
    removeChild(c) { el.children = el.children.filter((x) => x !== c); return c; },
    getContext() { return null; },
    fire(type, ev) { (handlers[type] || []).forEach((fn) => fn.call(el, ev)); },
  };
  return el;
}

function makeDoc() {
  const byId = new Map();
  const body = makeEl('body');
  return {
    body,
    el(id) {
      if (!byId.has(id)) byId.set(id, makeEl(id));
      return byId.get(id);
    },
    getElementById(id) { return this.el(id); },
    createElement(tag) { return makeEl(tag); },
  };
}

// ---- one device -------------------------------------------------------------
// `owner` is what the runtime's gifos.info() says: the app owner is the person
// whose link this is. `id` is the random per-browser identity.
function device({ id, name, owner, room }) {
  const doc = makeDoc();
  const timers = [];
  const sandbox = {
    console,
    Math,
    Date,
    JSON,
    Promise,
    document: doc,
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; },
    clearTimeout,
    setInterval: (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); return t; },
    clearInterval,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    // No speechSynthesis on purpose: the reveal pump then shows a call at once,
    // which keeps this suite about WHO CALLS and not about the voice.
    gifos: {
      db(nm) {
        if (nm === 'room') {
          return { put: (r) => room.put(r), delete: (i) => room.del(i), subscribe: (cb) => room.subscribe(cb) };
        }
        return { put: () => Promise.resolve(), delete: () => Promise.resolve(), subscribe: () => {} };
      },
      me: () => Promise.resolve({ id, name }),
      info: () => Promise.resolve({ appId: 'bingo', owner }),
      onBack: () => {},
    },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of ['deal.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), ctx, { filename: f });
  }
  return {
    id,
    doc,
    ctx,
    el: (k) => doc.el(k),
    lobby: () => doc.el('lobbyList').innerHTML,
    status: () => doc.el('lobbyStatus').textContent,
    callsHere: () => doc.el('dealBtn').hidden === false,
    enter: () => doc.el('friendBtn').onclick(),
    // Tap "give the ball" / "take the ball back" beside somebody in the lobby.
    pass: (to) => doc.el('lobbyList').fire('click', {
      target: { getAttribute: (k) => (k === 'data-pass' ? to : null), parentNode: null },
    }),
    stop: () => timers.forEach((t) => { clearTimeout(t); clearInterval(t); }),
  };
}

(async function run() {
  // The guest sorts BELOW the host. Under the old rule this alone handed the
  // guest the ball; it is the entire bug.
  const HOST = { id: 'user_zz9', name: 'Nathan' };
  const GUEST = { id: 'user_aa1', name: 'Sam' };
  check('the guest id sorts below the host id — the shape that used to fail', GUEST.id < HOST.id);

  const room = makeRoom();
  const host = device({ ...HOST, owner: true, room });
  const guest = device({ ...GUEST, owner: false, room });

  host.enter();
  guest.enter();
  await flush();
  await flush();

  check('both players are in the one room', room.rows.size === 2, Array.from(room.rows.keys()));
  check('only the owner says the room is theirs',
    room.rows.get(HOST.id).own === true && !room.rows.get(GUEST.id).own);

  // ---- the bug ---------------------------------------------------------------
  check('the person who sent the invite calls, though their id sorts last', host.callsHere());
  check('the guest is NOT handed the ball for having a lower id', !guest.callsHere());
  check('the guest is told who calls, by name', guest.status().indexOf('Nathan calls') >= 0, guest.status());
  check('the host is invited to start', host.status().indexOf('Start calling') >= 0, host.status());
  check("the lobby marks the caller on everyone's screen",
    host.lobby().indexOf('calls') >= 0 && guest.lobby().indexOf('calls') >= 0);
  check('a guest is offered no way to move the ball', guest.lobby().indexOf('data-pass') < 0);
  check('the owner is offered the handover', host.lobby().indexOf('data-pass="' + GUEST.id + '"') >= 0, host.lobby());

  // ---- handing the ball over -------------------------------------------------
  host.pass(GUEST.id);
  await flush();
  check('the handover rides in the OWNER row, not the guest row',
    room.rows.get(HOST.id).caller === GUEST.id && room.rows.get(GUEST.id).caller == null);
  check('the guest now calls', guest.callsHere());
  check('and the owner has stopped calling', !host.callsHere());
  check('both devices agree who it is', host.lobby().indexOf('calls') >= 0 && guest.lobby().indexOf('calls') >= 0);

  // ---- taking it back --------------------------------------------------------
  host.pass(HOST.id);
  await flush();
  check('the owner can take the ball back', host.callsHere() && !guest.callsHere());
  check('taking it back clears the handover', room.rows.get(HOST.id).caller == null);

  // ---- a caller who walks out ------------------------------------------------
  const gone = room.rows.get(HOST.id);
  gone.caller = 'user_someone_who_left';
  room.put(gone);
  await flush();
  check('a ball handed to somebody who is not here comes back to the owner', host.callsHere());

  // ---- a guest cannot deal itself the ball -----------------------------------
  const forged = room.rows.get(GUEST.id);
  forged.caller = GUEST.id;
  room.put(forged);
  await flush();
  check('a guest naming itself caller in its own row changes nothing',
    host.callsHere() && !guest.callsHere());

  host.stop();
  guest.stop();

  // ---- a room of copies older than this rule ---------------------------------
  // Nobody claims the room: every device must still agree on ONE caller, so the
  // old lowest-id rule is the fallback rather than nobody calling at all.
  const old = makeRoom();
  const a = device({ id: 'user_aa1', name: 'Sam', owner: false, room: old });
  const b = device({ id: 'user_zz9', name: 'Nathan', owner: false, room: old });
  a.enter();
  b.enter();
  await flush();
  await flush();
  for (const r of old.rows.values()) { delete r.own; }
  old.fire();
  await flush();
  check('with nobody claiming the room, the lowest id still calls — and only them',
    a.callsHere() && !b.callsHere());
  a.stop();
  b.stop();

  // ---- what the app promises the player --------------------------------------
  const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
  check('help says the inviter calls', /sent the invite/i.test(help));
  check('help explains the handover', /give the ball/i.test(help) && /take the ball back/i.test(help));
  check('help no longer claims the first person in the room calls', !/first person in the room/i.test(help));
  const mani = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
  check('manifest is a new version', mani.version !== '1.0', mani.version);

  console.log(failures ? '\n' + failures + ' FAILED' : '\nall pass');
  process.exit(failures ? 1 : 0);
})();
