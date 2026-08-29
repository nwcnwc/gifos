// The Bible's data backup is ONE GIF: the app's own animation stamped
// DATA BACKUP in red, carrying every private collection in a GIFOSBK1
// application-extension block. Two properties are load-bearing and guarded
// here: the stamp actually prints (a backup that looks like the app is a
// file someone installs by mistake), and the marker is NOT GIFOS1.0 (a
// backup the OS offers to install is the same mistake from the other side).
//
// Run: node test/unit/bible-backup.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bible = path.join(__dirname, '..', '..', 'apps', 'bible');
const read = (p) => fs.readFileSync(path.join(bible, p), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, what) => {
  if (cond) { pass++; console.log('PASS ' + what); }
  else { fail++; console.log('FAIL ' + what); }
};

(async function main() {
  // ---- the stamped animation ----------------------------------------------
  const icon = await import(path.join(bible, 'icon.mjs'));
  ok(typeof icon.backupIcon === 'function', 'icon.mjs exports backupIcon');
  const plain = icon.bibleIcon();
  const stamped = icon.backupIcon();
  ok(stamped.width === plain.width && stamped.height === plain.height &&
     stamped.frames.length === plain.frames.length,
     'the backup art is the same animation — size and frame count match');

  // The stamp colour sits in the palette beyond the icon's own colours.
  let redI = -1;
  for (let i = 0; i < stamped.numColors; i++) {
    if (stamped.palette[i * 3] === 211 && stamped.palette[i * 3 + 1] === 36 &&
        stamped.palette[i * 3 + 2] === 30) { redI = i; break; }
  }
  ok(redI >= 0, 'the stamp red is in the backup palette');
  const stampedEverywhere = stamped.frames.every(
    (f) => f.some((px) => px === redI));
  ok(stampedEverywhere, 'DATA BACKUP prints on EVERY frame, not just the first');
  const plainClean = plain.frames.every((f) => f.every((px) => px < 34));
  ok(plainClean, "the app's own icon never uses the stamp colours");

  // ---- the GIFOSBK1 block, round-tripped ----------------------------------
  const g = { console, Math, JSON, Object, String, RegExp, Array, Error,
              Uint8Array, Promise, Date, TextEncoder, TextDecoder };
  g.globalThis = g; g.self = g;
  vm.createContext(g);
  vm.runInContext(read('js/backup.js'), g, { filename: 'backup.js' });
  const B = g.GifosBibleBackup;
  ok(B && B.MARKER === 'GIFOSBK1', 'backup.js loads and names its own marker');

  // A minimal host: header + logical screen descriptor + trailer.
  const host = new Uint8Array(14);
  host.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
  host[13] = 0x3b;
  const payload = { kind: 'gifos-bible-backup', v: 1,
    prefs: { theme: 'paper' },
    marks: [{ id: 'JHN.3.16', colour: 'amber' }],
    voicenotes: [{ id: 'v.JHN.3.16', mime: 'audio/webm', b64: B._b64encode(new Uint8Array([0, 1, 2, 250, 255])) }],
    plans: [] };
  const gif = B._buildGif(host, new TextEncoder().encode(JSON.stringify(payload)));
  ok(gif[gif.length - 1] === 0x3b && gif[0] === 0x47,
     'the backup is still a GIF — header first, trailer last');
  const text = Buffer.from(gif).toString('latin1');
  ok(text.includes('GIFOSBK1') && !text.includes('GIFOS1.0'),
     'the block is GIFOSBK1 and NOT GIFOS1.0 — the OS must never offer to install a backup');
  const back = JSON.parse(new TextDecoder().decode(B._readPayload(gif)));
  ok(JSON.stringify(back) === JSON.stringify(payload),
     'the payload survives the trip out and back, byte for byte');
  const audio = B._b64decode(back.voicenotes[0].b64);
  ok(audio.length === 5 && audio[3] === 250 && audio[4] === 255,
     'audio bytes survive base64 both ways');
  ok(B._readPayload(host) === null, 'a plain GIF reads as "no backup", not garbage');

  // ---- the wiring ---------------------------------------------------------
  const html = read('index.html');
  const build = read('build.mjs');
  const r3 = read('js/reader3.js');
  ok(/js\/backup\.js/.test(html), 'index.html loads js/backup.js');
  ok(/'js\/backup\.js'/.test(build) && /backup-host\.gif/.test(build) && /backupIcon/.test(build),
     'build.mjs packs backup.js and bakes the stamped backup-host.gif');
  ok(/GifosBibleBackup\.exportAll/.test(r3) && /GifosBibleBackup\.importPick/.test(r3),
     'the More sheet wires Export and Import');
  ok(/Back up my data/.test(read('help.md')), 'help.md explains the backup');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FAIL suite crashed: ' + (e && e.stack || e)); process.exit(1); });
