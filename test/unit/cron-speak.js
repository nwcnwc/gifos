// CRON SPEAK HAS TO TRANSLATE, NOT JUST WRAP THE LIBRARY.
//
// A five-field expression becomes English, an invalid one is an honest error,
// next fire times are real clock times, and the last expression is what the
// file keeps. The UI (field pills, empty state, Invite-is-OS-chrome) is
// pinned by source scan — a vm cannot tap a chip.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'cron-speak');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Error, RegExp,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  for (const f of ['vendor/cronstrue.js', 'cron.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}

const S = load();
check('cronstrue + CronTalk + CronSpeak load', !!(S.cronstrue && S.CronTalk && S.CronSpeak && S.CronSpeak.speak));

const speak = S.CronSpeak.speak;
const Talk = S.CronTalk;

{
  const a = speak('0 0 * * *', {});
  check('midnight speaks', /12:00 AM|midnight/i.test(a), a);
  const b = speak('*/5 * * * *', {});
  check('every 5 minutes', /every 5 minutes/i.test(b), b);
  const c = speak('0 9 * * 1-5', { h24: true });
  check('weekday 09:00 in 24h', /09:00|9:00/.test(c), c);
  const d = speak('0 9 * * 1-5', { h24: false });
  check('weekday 9:00 AM', /9:00 AM/i.test(d), d);
  const e = speak('@hourly', {});
  check('@hourly is every hour', /every hour/i.test(e), e);
  const f = speak('@daily', {});
  check('@daily is midnight', /12:00 AM|midnight|every day/i.test(f), f);
  const fv = speak('@daily', { verbose: true });
  check('@daily verbose mentions every day', /every day/i.test(fv), fv);
}

{
  let msg = null;
  try { speak('99 * * * *', {}); } catch (e) { msg = String(e && e.message || e); }
  check('minute 99 throws', !!msg, msg);
  check('minute 99 names the range or the field', /minute|0 and 59|0-59/i.test(msg || ''), msg);

  msg = null;
  try { speak('0 0 * *', {}); } catch (e) { msg = String(e && e.message || e); }
  check('four fields throws', !!msg, msg);
  const human = Talk.humanError(new Error(msg), '0 0 * *');
  check('four fields is a five-field reminder', /five fields/i.test(human), human);

  msg = null;
  try { speak('@nope', {}); } catch (e) { msg = String(e && e.message || e); }
  check('unknown special throws', !!msg, msg);
  check('unknown special is honest', /special/i.test(Talk.humanError(new Error(msg), '@nope')), msg);

  check('empty is a type-it prompt, not a stack', Talk.humanError(new Error('cron expression is empty'), '') === 'Type a cron expression.');
  check('@reboot is next boot, not a clock', /boot/i.test(Talk.humanError(new Error('x'), '@reboot')));
}

{
  const p = Talk.parse('0 9 * * 1-5');
  check('five fields parsed', p.fields && p.fields.length === 5);
  check('hour field is 9', p.fields[1].value === '9', p.fields && p.fields[1]);
  check('dow field is 1-5', p.fields[4].value === '1-5');
  check('minute phrase for */5', Talk.phrase('*/5') === 'every 5');
  check('star phrase is every', Talk.phrase('*') === 'every');
}

{
  const from = new Date(2026, 7, 24, 8, 0, 0, 0); // Mon 24 Aug 2026 08:00 local
  const n = Talk.nextTimes('0 9 * * 1-5', from, 3);
  check('weekday 9am yields 3 times', n.times && n.times.length === 3, n);
  if (n.times && n.times[0]) {
    check('first fire is today 09:00', n.times[0].getDate() === 24 && n.times[0].getHours() === 9 && n.times[0].getMinutes() === 0,
      { d: n.times[0].toString() });
    check('second fire is Tuesday 09:00', n.times[1].getDate() === 25 && n.times[1].getHours() === 9,
      { d: n.times[1].toString() });
  }
  const later = new Date(2026, 7, 24, 10, 0, 0, 0);
  const n2 = Talk.nextTimes('0 9 * * 1-5', later, 1);
  check('after 9am, next is Tuesday', n2.times[0] && n2.times[0].getDate() === 25, n2.times[0] && n2.times[0].toString());

  const fri = new Date(2026, 7, 28, 10, 0, 0, 0); // Friday after 9
  const n3 = Talk.nextTimes('0 9 * * 1-5', fri, 1);
  check('Friday after 9 → Monday', n3.times[0] && n3.times[0].getDay() === 1 && n3.times[0].getHours() === 9,
    n3.times[0] && n3.times[0].toString());

  const ev = Talk.nextTimes('*/5 * * * *', new Date(2026, 7, 24, 12, 1, 0, 0), 2);
  check('every 5 min: 12:05 then 12:10',
    ev.times[0] && ev.times[0].getMinutes() === 5 && ev.times[1] && ev.times[1].getMinutes() === 10,
    ev.times.map((d) => d.getMinutes()));

  const daily = Talk.nextTimes('@daily', new Date(2026, 7, 24, 0, 1, 0, 0), 1);
  check('@daily next is tomorrow midnight', daily.times[0] && daily.times[0].getDate() === 25 && daily.times[0].getHours() === 0,
    daily.times[0] && daily.times[0].toString());

  const first = Talk.nextTimes('0 0 1 * *', new Date(2026, 7, 24, 12, 0, 0, 0), 1);
  check('1st of month from Aug 24 is Sep 1', first.times[0] && first.times[0].getMonth() === 8 && first.times[0].getDate() === 1,
    first.times[0] && first.times[0].toString());

  const rb = Talk.nextTimes('@reboot', new Date(), 1);
  check('@reboot is flagged, no clock times', rb.reboot === true && rb.times.length === 0);
}

{
  // Both DOM and DOW restricted → OR (Vixie). 0 0 1 * 1 = 1st of month OR Mondays.
  const from = new Date(2026, 7, 24, 0, 1, 0, 0); // Monday after midnight
  const n = Talk.nextTimes('0 0 1 * 1', from, 4);
  check('DOM|DOW OR yields times', n.times.length === 4);
  const days = n.times.map((d) => d.getDay());
  const dates = n.times.map((d) => d.getDate());
  check('OR includes a Monday', days.some((d) => d === 1), { days, dates });
  check('OR includes the 1st', dates.some((d) => d === 1), { days, dates });
}

{
  let threw = false;
  try { Talk.parse('99 * * * *'); } catch (e) { threw = true; check('parse 99 is out of range', /range/i.test(e.message), e.message); }
  check('parse 99 throws', threw);
  threw = false;
  try { Talk.parse(''); } catch (e) { threw = true; }
  check('parse empty throws', threw);
}

// ---- source scan: phone, save, empty/error, no Invite button, no CDN ------
{
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  const mp = fs.readFileSync(path.join(APP, 'mp.js'), 'utf8');
  const listing = fs.readFileSync(path.join(APP, 'listing.json'), 'utf8');
  const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));

  check('viewport-fit for the phone notch', /viewport-fit=cover/.test(html));
  check('chips are 40px+ tap targets', /min-height:\s*40px/.test(css));
  check('field pills exist', /id="fields"/.test(html));
  check('next times exist', /id="next"/.test(html));
  check('empty state exists', /id="empty"/.test(html));
  check('error node exists', /id="err"/.test(html));
  check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html));
  check('tells you to press Invite', /Invite/.test(app) && /Invite/.test(mp));
  check('saves last expression as id last', /id:\s*'last'/.test(app) && /db\('save'\)/.test(app));
  check('no CDN / http in html', !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));
  check('classic scripts, no type=module', !/type=["']module["']/.test(html));
  check('launch.expr is declared', !!(manifest.launch && manifest.launch.expr));
  check('minBuild stays 947', manifest.minBuild === 947);
  check('save is private', manifest.data.save.visibility === 'private');
  check('room is read-only', manifest.data.room.visibility === 'read-only');
  check('listing does not mention internals', !/gifos\.db|WASM|sandbox|localStorage/.test(listing));
  check('help is a tool page, not empty', help.length > 400 && /next times/i.test(help));
  check('help does not document Invite/Save chrome', !/gifos\.db/.test(help));
  check('onBack is wired', /onBack/.test(app));
  check('history is persisted', /history/.test(app));
}

if (failures) {
  console.log('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nAll PASS');
