// End-to-end: the seeded Ask AI app REMEMBERS, STAMPS, TIMES and STREAMS —
// and the runtime plumbing underneath it.
//
// What broke before this suite existed: `msgs` lived in a page variable, so
// every open started a fresh conversation, the model was never told what had
// already been said, nothing carried a time, and the whole answer landed in
// one lump after an unexplained wait.
//
// Five things are guarded here, in the order a user meets them:
//   1. the RUNTIME contract — gifos.ai.chat({onDelta}) delivers fragments and
//      still resolves once with the whole answer; the SAME call without
//      onDelta is unchanged (streamed:false). Driven from a synthetic app, so
//      the API is guarded independently of what any one app does with it.
//   2. Ask AI paints an answer AS IT ARRIVES (caught half-drawn, not inferred).
//   3. every message carries a wall-clock datetime stamp, and an answer also
//      carries first-word + total time.
//   4. the conversation survives closing and reopening the app — AND is sent
//      back to the model as context (proved by the fake endpoint saying how
//      many messages it received).
//   5. "＋ New chat" erases it, and the erasure survives a reopen too.
//
// Needs: static server on 8099, and test/servers/fake-ai.js on 8791.
const { chromium, CHROME } = require('../lib/pw');
const need = require('../lib/need');   // fixtures must be up, or say so plainly

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const AI = 'http://127.0.0.1:8791';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const AI_CFG = JSON.stringify({
  cheapest: { url: AI, key: 'test-key', model: 'x' },
  smartest: { url: AI, key: 'test-key', model: 'x' },
});

const TEN = 'One two three four five six seven eight nine ten.';

// Dismiss the "…would like to…" acknowledgement if this app has not been
// acked yet in this profile. Silent when it is already gone.
async function ack(page) {
  const box = page.locator('.perm-box', { hasText: 'would like to' });
  try { await box.waitFor({ timeout: 5000 }); await box.locator('.done').click(); await sleep(200); } catch (e) { /* already acked */ }
}

// Open the seeded Ask AI (it lives in the Tools folder) and return its page.
async function openAskAI(context, page) {
  const icon = page.locator('.icon', { hasText: 'Ask AI.gif' });
  if (!(await icon.count())) {
    await page.locator('.icon', { hasText: 'Tools' }).dblclick();
    await page.waitForSelector('.icon', { timeout: 8000 });
    await sleep(400);
  }
  const [app] = await Promise.all([context.waitForEvent('page'), page.locator('.icon', { hasText: 'Ask AI.gif' }).dblclick()]);
  app.on('pageerror', (e) => console.log('  [askai pageerror]', e.message));
  await app.waitForSelector('#appmount iframe', { timeout: 10000 });
  await ack(app);
  return app;
}

// Poll the NEWEST answer bubble and collect every distinct value it holds on
// the way to `until`. Black-box on purpose: no injection into the sandboxed
// frame, just what a person watching the screen would see.
async function watchAnswer(fr, until, budgetMs) {
  const seen = [];
  const t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    const txt = await fr.locator('.row.ai').last().locator('.m').textContent().catch(() => null);
    if (txt != null && seen[seen.length - 1] !== txt) seen.push(txt);
    if (until.test(txt || '')) break;
    await sleep(45);
  }
  await settled(fr, budgetMs);
  return seen;
}

// THE LAST TOKEN IS NOT THE END OF THE TURN. With streaming, the final word is
// on screen while the call is still open — the total time, the saved record
// and the re-enabled Send button all land on the reply that follows. Waiting
// on the text alone made this suite report three product bugs that were purely
// its own race; the honest "done" signal is the total time appearing.
function settled(fr, budgetMs) {
  return fr.locator('.row.ai').last().locator('.stamp').filter({ hasText: /total/ }).waitFor({ timeout: budgetMs || 20000 });
}

(async () => {
  await need({ 8791: 'fake-ai' });
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  await context.addInitScript((cfg) => { try { window.localStorage.setItem('gifos_ai_config', cfg); } catch (e) {} }, AI_CFG);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });
  await sleep(500);

  // ---- 1. the runtime contract, from a synthetic app -----------------------
  // Two calls, same endpoint, differing only in whether onDelta was passed.
  {
    await page.evaluate(async () => {
      const html = '<!doctype html><meta charset="utf-8"><div id="out">…</div><div id="plain">…</div>' +
        '<script>(async function(){' +
        '  var parts=[], gaps=[], t=Date.now();' +
        '  try{ var r=await gifos.ai.chat({ model:"cheapest", messages:[{role:"user",content:"stream?"}],' +
        '         onDelta:function(p){ parts.push(p); gaps.push(Date.now()-t); t=Date.now(); } });' +
        '    document.getElementById("out").textContent="deltas="+parts.length+" streamed="+r.streamed' +
        '      +" joined="+(parts.join("")===r.text)+" spread="+(gaps.filter(function(g){return g>40;}).length)+" text="+r.text; }' +
        '  catch(e){ document.getElementById("out").textContent="err:"+e.message; }' +
        '  try{ var r2=await gifos.ai.chat({ model:"cheapest", messages:[{role:"user",content:"stream?"}] });' +
        '    document.getElementById("plain").textContent="streamed="+r2.streamed+" text="+r2.text; }' +
        '  catch(e){ document.getElementById("plain").textContent="err:"+e.message; }' +
        '})();<\/script>';
      const bytes = await GifOS.gif.encode({
        'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'streamprobe', name: 'Stream Probe', entry: 'index.html', capabilities: { db: true, ai: ['cheapest'] } }),
        'index.html': html,
      });
      const fid = GifOS.store.uid('file');
      await GifOS.store.putFile({ id: fid, name: 'Stream Probe.gif', bytes, kind: 'gif', isApp: true, appId: 'streamprobe', mime: 'image/gif' });
      await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Stream Probe.gif', parent: null, x: 620, y: 320, iconSize: 64 });
      await GifOS.desktop.load(); await GifOS.desktop.render();
    });

    const [probe] = await Promise.all([context.waitForEvent('page'), page.locator('.icon', { hasText: 'Stream Probe.gif' }).dblclick()]);
    probe.on('pageerror', (e) => console.log('  [probe pageerror]', e.message));
    await probe.waitForSelector('#appmount iframe', { timeout: 10000 });
    await ack(probe);
    const pf = probe.frameLocator('#appmount iframe');
    await pf.locator('#out').filter({ hasText: /deltas=|err:/ }).waitFor({ timeout: 20000 });
    const out = await pf.locator('#out').textContent();
    check('gifos.ai.chat({onDelta}) delivers the answer in fragments', /deltas=10\b/.test(out), out.slice(0, 120));
    check('…the fragments arrive SPREAD OVER TIME, not in one flush', /spread=([2-9]|\d\d)/.test(out), out.slice(0, 120));
    check('…and the promise still resolves once with the whole answer',
      out.indexOf('text=' + TEN) > 0 && /joined=true/.test(out) && /streamed=true/.test(out), out.slice(0, 200));

    await pf.locator('#plain').filter({ hasText: /streamed=|err:/ }).waitFor({ timeout: 20000 });
    const plain = await pf.locator('#plain').textContent();
    check('the SAME call without onDelta is unchanged — one shot, streamed:false',
      /streamed=false/.test(plain) && plain.indexOf('text=' + TEN) > 0, plain.slice(0, 160));
    await probe.close();
  }

  // ---- 2. Ask AI paints the answer as it arrives ---------------------------
  const app1 = await openAskAI(context, page);
  const fr1 = app1.frameLocator('#appmount iframe');
  await fr1.locator('#t').fill('stream?');
  await fr1.locator('#send').click();
  const frames = await watchAnswer(fr1, /ten\./, 25000);
  const partials = frames.filter((t) => t && t !== '…' && t !== TEN);
  check('Ask AI shows the answer BEING WRITTEN, not only when it is finished',
    partials.length >= 3, frames.length + ' frame(s): ' + JSON.stringify(frames.slice(0, 4)));
  check('…each frame is a prefix of the next (it grows, it does not flicker)',
    partials.every((t, i) => i === 0 || t.startsWith(partials[i - 1])), JSON.stringify(partials.slice(0, 3)));
  check('…and it lands on the complete answer',
    (await fr1.locator('.row.ai').last().locator('.m').textContent()) === TEN);

  // ---- 3. datetime stamps, and what the answer cost in time ----------------
  const stamps = await fr1.locator('.row .stamp').allTextContents();
  check('every message carries a wall-clock datetime stamp',
    stamps.length === 2 && stamps.every((s) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)), JSON.stringify(stamps));
  const aiStamp = stamps[stamps.length - 1];
  check('the answer says how long it took in total', /(\d+(\.\d)?s|\d+ms) total/.test(aiStamp), aiStamp);
  check('…and how long until the first word appeared', /first word (\d+(\.\d)?s|\d+ms)/.test(aiStamp), aiStamp);
  check('…and which model answered', /cheapest/.test(aiStamp), aiStamp);
  await app1.close();

  // ---- 4. the conversation survives a close, and is SENT BACK as context ---
  const app2 = await openAskAI(context, page);
  const fr2 = app2.frameLocator('#appmount iframe');
  await fr2.locator('.row').first().waitFor({ timeout: 8000 });
  const kept = await fr2.locator('.row .m').allTextContents();
  check('reopening the app shows the conversation it had before',
    kept.length === 2 && kept[0] === 'stream?' && kept[1] === TEN, JSON.stringify(kept).slice(0, 140));
  check('…and says so, rather than silently looking like a fresh app',
    /remembered/.test(await fr2.locator('.note').first().textContent().catch(() => '')));

  // The endpoint answers with what it was actually given. Three messages
  // (the old pair + this question) means the memory really crossed the wire —
  // a page variable would have sent one.
  await fr2.locator('#t').fill('ctx?');
  await fr2.locator('#send').click();
  await watchAnswer(fr2, /ctx=/, 20000);
  const ctxReply = await fr2.locator('.row.ai').last().locator('.m').textContent();
  check('the remembered conversation is HANDED BACK to the model as context',
    /^ctx=3 /.test(ctxReply), ctxReply.slice(0, 120));
  check('…with the original question intact, in order', /first=stream\?$/.test(ctxReply), ctxReply.slice(0, 120));

  // ---- 5. New chat erases, and the erasure sticks --------------------------
  await fr2.locator('#new').click();
  await fr2.locator('.note', { hasText: 'New conversation' }).waitFor({ timeout: 8000 });
  check('“＋ New chat” clears the conversation on screen', (await fr2.locator('.row').count()) === 0);
  await app2.close();

  const app3 = await openAskAI(context, page);
  const fr3 = app3.frameLocator('#appmount iframe');
  await sleep(1200); // the boot read is async — give it time to redraw anything left
  check('…and the erasure survives reopening the app', (await fr3.locator('.row').count()) === 0);
  await app3.close();

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
