// Two-context proof of the Invite join path, plus HEAD / staging / solved-hidden.
// Invite remounts the GIF in a new room. The host's in-memory `on` dies with
// the page; a guest who only waited 1.8s never saw a player. These sandboxes
// are that remount: two windows, one players collection, no taps on the guest.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function makeEl(id, extra) {
  return Object.assign({
    id,
    hidden: true,
    textContent: '',
    innerHTML: '',
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    style: {},
    addEventListener() {}
  }, extra || {});
}

function makeCol() {
  const rows = new Map();
  const subs = [];
  const snap = () => [...rows.values()].map((x) => JSON.parse(JSON.stringify(x)));
  return {
    put(item) {
      if (!item || item.id == null) return Promise.resolve();
      rows.set(item.id, JSON.parse(JSON.stringify(item)));
      const list = snap();
      subs.forEach((cb) => cb(list));
      return Promise.resolve();
    },
    get(id) {
      return Promise.resolve(rows.has(id) ? JSON.parse(JSON.stringify(rows.get(id))) : undefined);
    },
    getAll() { return Promise.resolve(snap()); },
    delete(id) {
      rows.delete(id);
      const list = snap();
      subs.forEach((cb) => cb(list));
      return Promise.resolve();
    },
    subscribe(cb) { subs.push(cb); cb(snap()); },
    _rows: rows
  };
}

function makeContext(opts) {
  const els = {};
  ['friend-bar', 'friend-status', 'friend-scores', 'againBtn', 'friendBtn',
    'leaveBtn', 'lesson'].forEach((id) => { els[id] = makeEl(id); });
  els['friend-bar'].hidden = true;
  els.friendBtn.hidden = false;
  const goes = [];
  const sandbox = {
    console,
    Math, Object, Array, JSON, Date, String, Number, Boolean,
    Promise, setTimeout() { return 0; }, setInterval() { return 1; },
    clearTimeout() {}, clearInterval() {},
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById: (id) => { els[id] = els[id] || makeEl(id); return els[id]; }
    },
    gifos: {
      db: (name) => opts.db(name),
      me: () => Promise.resolve({ id: opts.id, name: opts.name }),
      info: () => Promise.resolve({ owner: !!opts.owner, appId: 'learn-git-branching' })
    },
    LGB_LEVELS: {
      levels: {
        'intro-commits': { name: 'Introduction to Git Commits' },
        'intro-branching': { name: 'Branching in Git' },
        'workingDir-staging': { name: 'The Staging Area' }
      }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.LGBApp = {
    levelId: opts.levelId || 'intro-commits',
    racing: !!opts.racing,
    commandCount: 0,
    solved: false,
    goes,
    goLevel(id, o) {
      this.levelId = id;
      goes.push({ id: id, opts: o || {} });
    },
    touchSave() { this.savedRacing = this.racing; }
  };
  vm.createContext(sandbox);
  vm.runInContext(read('net.js'), sandbox, { filename: 'net.js' });
  sandbox._els = els;
  sandbox._goes = goes;
  return sandbox;
}

function tick() { return new Promise((r) => setImmediate(r)); }

async function boot(ctx) {
  await ctx.LGBNet.init();
  ctx.LGBNet.bootJoin();
  await tick();
  await tick();
}

{
  const html = read('index.html');
  const css = read('style.css');
  const vis = read('vis.js');
  const app = read('app.js');
  const net = read('net.js');
  check('author CSS cannot un-hide [hidden] (Solved banner)',
    /\[hidden\][^{]*\{[^}]*display\s*:\s*none\s*!important/.test(css));
  check('#solved-banner is hidden in markup until paint says so',
    /id="solved-banner"[^>]*\shidden/.test(html));
  check('Staging Area is a labeled region in the window',
    html.includes('Staging Area') && html.includes('id="staged"') &&
    html.includes('Working Directory') && html.includes('id="workdir"'));
  check('paintFiles fills the staging lists from workingChanges',
    app.includes('function paintFiles') && app.includes("paintFiles(tree, 'files', 'workdir', 'staged')"));
  check('HEAD resolves a branch target to a commit before painting',
    vis.includes('if (branches[headAt]) headAt = branches[headAt].target'));
  check('Invite remount keeps watching; join is not a 1.8s one-shot',
    net.includes('maybeAutoJoin') && net.includes('bootJoin') &&
    net.includes('info.owner') && net.includes('lead:'));
  check('racing survives the GIF remount in the private save',
    app.includes('racing: !!G.racing') && app.includes('G.racing = !!row.racing'));
}

{
  const visSandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean,
    document: { createElementNS: () => ({ setAttribute() {}, appendChild() {} }) }
  };
  visSandbox.window = visSandbox;
  vm.createContext(visSandbox);
  vm.runInContext(read('vis.js'), visSandbox, { filename: 'vis.js' });
  const L = visSandbox.LGBVis.layout({
    branches: { main: { target: 'C1', id: 'main' }, bugFix: { target: 'C3', id: 'bugFix' } },
    commits: {
      C0: { parents: [], id: 'C0' },
      C1: { parents: ['C0'], id: 'C1' },
      C2: { parents: ['C1'], id: 'C2' },
      C3: { parents: ['C1'], id: 'C3' }
    },
    tags: {},
    HEAD: { id: 'HEAD', target: 'main' }
  });
  const head = L.labels.find((l) => l.text === 'HEAD');
  check('HEAD paints on C1 while attached to main, not on the branch id',
    !!(head && head.at === 'C1' && head.kind === 'head'), head);
  const det = visSandbox.LGBVis.layout({
    branches: { main: { target: 'C1', id: 'main' } },
    commits: { C0: { parents: [], id: 'C0' }, C1: { parents: ['C0'], id: 'C1' } },
    tags: {},
    HEAD: { id: 'HEAD', target: 'C0' }
  });
  const dHead = det.labels.find((l) => l.text === 'HEAD');
  check('detached HEAD still paints on the commit',
    !!(dHead && dHead.at === 'C0'), dHead);
}

{
  const engineBox = { console, Math, Object, Array, JSON, Date, String, Number, Boolean };
  engineBox.window = engineBox;
  engineBox.globalThis = engineBox;
  vm.createContext(engineBox);
  vm.runInContext(read('vendor/git-engine.js'), engineBox, { filename: 'git-engine.js' });
  const eng = new engineBox.LGB.Engine();
  eng.loadTree('{"branches":{"main":{"target":"C1","id":"main"}},"commits":{"C0":{"parents":[],"id":"C0","rootCommit":true},"C1":{"parents":["C0"],"id":"C1"}},"HEAD":{"target":"main","id":"HEAD"},"workingChanges":{"app.js":"modified","styles.css":"modified"}}');
  const before = eng.exportTree();
  check('The Staging Area starts with both files in the working directory',
    before.workingChanges['app.js'] === 'modified' &&
    before.workingChanges['styles.css'] === 'modified' &&
    before.changesModelEngaged === true,
    before.workingChanges);
  eng.runLines('git add app.js');
  const mid = eng.exportTree();
  check('git add app.js moves that file into the Staging Area',
    mid.workingChanges['app.js'] === 'staged' &&
    mid.workingChanges['styles.css'] === 'modified',
    mid.workingChanges);
}

{
  const players = makeCol();
  const db = (name) => name === 'players' ? players : makeCol();
  const host = makeContext({
    id: 'ada', name: 'Ada', owner: true,
    levelId: 'intro-branching', racing: true, db
  });
  const guest = makeContext({
    id: 'sam', name: 'Sam', owner: false,
    levelId: 'intro-commits', racing: false, db
  });
  await boot(host);
  check('host remount (racing in the GIF) auto-joins without Play a friend',
    host.LGBNet.live() === true && host._els['friend-bar'].hidden === false);
  await boot(guest);
  check('guest who opens Invite auto-joins with no tap', guest.LGBNet.live() === true);
  check('guest lands on the host lesson, not intro-commits',
    guest.LGBApp.levelId === 'intro-branching',
    { guest: guest.LGBApp.levelId, goes: guest._goes });
  check('guest goLevel is a race reset, so the intro slides stay closed',
    guest._goes.some((g) => g.id === 'intro-branching' && g.opts.race === true));
  check('friend-bar stays up on the remounted host',
    host._els['friend-bar'].hidden === false);
  const roster = await players.getAll();
  check('both names are in players',
    roster.some((p) => p.id === 'ada') && roster.some((p) => p.id === 'sam'),
    roster.map((p) => p.id));
  check('host row is the lead so a late intro-commits cannot steal the lesson',
    roster.filter((p) => p.id === 'ada')[0].lead === true &&
    roster.filter((p) => p.id === 'sam')[0].lead === false);
}

{
  const players = makeCol();
  const db = (name) => name === 'players' ? players : makeCol();
  const guest = makeContext({
    id: 'sam', name: 'Sam', owner: false,
    levelId: 'intro-commits', db
  });
  const host = makeContext({
    id: 'ada', name: 'Ada', owner: true,
    levelId: 'workingDir-staging', racing: true, db
  });
  await boot(guest);
  check('guest-first: still joins an empty room (owner false, no 1.8s wait)',
    guest.LGBNet.live() === true);
  await boot(host);
  await tick();
  check('guest-first still ends on the host lesson after the remount publishes',
    guest.LGBApp.levelId === 'workingDir-staging' && host.LGBApp.levelId === 'workingDir-staging',
    { guest: guest.LGBApp.levelId, host: host.LGBApp.levelId, goes: guest._goes });
}

{
  const players = makeCol();
  const db = (name) => name === 'players' ? players : makeCol();
  const host = makeContext({
    id: 'ada', name: 'Ada', owner: true,
    levelId: 'intro-branching', racing: false, db
  });
  const guest = makeContext({
    id: 'sam', name: 'Sam', owner: false,
    levelId: 'intro-commits', db
  });
  await boot(guest);
  await boot(host);
  await tick();
  check('Invite without Play a friend: host sees the guest and leads on their lesson',
    host.LGBNet.live() === true && guest.LGBApp.levelId === 'intro-branching',
    { hostLive: host.LGBNet.live(), guest: guest.LGBApp.levelId });
}

if (failures) {
  console.log('\n' + failures + ' failing');
  process.exit(1);
}
console.log('\nAll learn-git-branching join-path checks passed');
