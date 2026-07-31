# Driving a real phone in a real meeting (the instrument interface)

Two Motos on the raspberrypi are the only instruments that answer "does a phone
gain or lose charge in a meeting". This is how to drive and read them without
believing things that are not true. Every trap below cost real time.

## Wiring up

```bash
adb devices -l                                    # ZT322P8ZJ3 · ZT322QJ3S8
adb -s ZT322P8ZJ3 forward tcp:9222 localabstract:chrome_devtools_remote
adb -s ZT322QJ3S8 forward tcp:9223 localabstract:chrome_devtools_remote
curl -s http://127.0.0.1:9222/json/version        # must answer, or Chrome is not running
```

**Chrome must already be running on the phone.** `connectOverCDP` attaches, it
does not launch. If the port answers nothing:

```bash
adb -s <serial> shell am start -a android.intent.action.VIEW \
  -d "https://gifos.app/robots.txt" -n com.android.chrome/com.google.android.apps.chrome.Main
adb -s <serial> forward --remove tcp:<port>; adb -s <serial> forward tcp:<port> localabstract:chrome_devtools_remote
```

`CDP_PORT` selects the phone in every tool here (`phone-meet-ctl.js`,
`phone-decode-probe.js`, `phone-tune-drive.js`, `cdp-phone-meet.js`). Nothing
may hardcode 9222 — two phones in ONE room at ONE time is the only A/B that
cancels time-varying conditions.

## Permissions — the thing that silently blocks everything

A meeting needs camera+mic at BOTH levels, and a pending prompt stops the app
from booting at all:

```bash
adb -s <serial> shell pm grant com.android.chrome android.permission.CAMERA
adb -s <serial> shell pm grant com.android.chrome android.permission.RECORD_AUDIO
```

That is the ANDROID grant. Chrome still asks per-origin ("gifos.app wants to use
your camera and microphone"), which is **native UI, invisible to the DOM** — a
page probe reports a happy page while a dialog covers the screen. Grant it over
CDP (`context.grantPermissions(['camera','microphone'], {origin:'https://gifos.app'})`)
or dismiss it by tapping. **When a phone behaves inexplicably, screenshot it —
`adb shell screencap -p /sdcard/s.png` then `adb pull`.** The DOM cannot see
what is on the screen; the screenshot is the ground truth and settles it in one
step.

Android also throttles background tabs hard enough that the app never boots.
`bringToFront()` before doing anything.

## Reading state — use these accessors, not the dumps

`window.__gifosVideo` is the surface. The purpose-built accessors are correct;
the big dumps are shaped differently than they look.

| want | call | note |
|---|---|---|
| my camera | `camOff()` | `true` = OFF |
| camera really live | `camTrackLive()` | a track exists AND is `live` |
| my mic | `micMuted()` | |
| my blur | `myBlur()` / `setBlur(0\|1\|2)` | 2 = Max |
| who I told to park | `visParkAsked()` | **the decode-dormancy verification** |
| who told me to park | `visParked()` | |
| per-peer senders | `mainSenders()` | `{id,name,v,a,tile}`; `v:'parked'`, `tile:'hidden'` |
| my seat | `meshCoord()` | `{pc,r,i}` |
| rung / tier | `powTier()`, `quality()`, `battTier()` | |
| inbound+outbound RTP | `avStats()` | per-peer rows, `slot` labelled |
| composites | `mosaic()`, `stadiumShown()` | |

### Traps, all of them real

- **`debugDump()` has no `camOff`.** `debugDump().me` is
  `{peer,name,coord,depth,compactMoves,state,links,occ}` — no camera field. A
  probe reading `d.me.camOff` gets `undefined`, coerces to `false`, and reports
  "camera on" for a phone whose camera is off. Use `camOff()`.
- **`parkAsked`/`parked` are NOT on `debugDump()`.** They live on
  `meshSelfReport()` (the DEBUG-TREE census, reachable via `probeTree()`).
  From a page, use `visParkAsked()` / `visParked()`.
- **`camOff()` false is not enough** — check `camTrackLive()` too. The camera
  button bails to `lateMedia('cam')` when there is no `localStream`, so the
  click can appear to work and change nothing.
- **`avStats()` slots**: `tile:<pid>` is a peer's MAIN video (lands in a
  `.tile`); `in:<rk>` is a subscribed composite; `std:<rk>` is a parked standby.
  The main-vs-composite split is the whole decode-side question.
- **VERIFY EVERY MUTATION.** `phone-meet-ctl.js` re-reads and returns
  `{ok:false}` rather than assuming a click landed.

## The room shape that exercises anything

`C = 5` (`SCALE.C`), so a row seats 5. A phone only has a NON-row-mate — the
case decode-side dormancy is about — once the room passes 5. Five bots fill
row 0 and both phones land in row 1 together, as row-mates of each other, with
the bots as their structural links. That is the symmetric A/B shape.

**A room with the camera off and no mosaic exercises almost none of the power
work.** Before believing any measurement, confirm `camOff()===false`,
`camTrackLive()===true`, and a non-empty `mosaic().claims`.

## Where bots may run

Bots are Chromium instances and they are heavy. **penguin (4 cores) cannot host
them** — 3 bots took it to loadavg 23, the bots forked (two claiming the same
seat, `occ=1`, `links=0`), and the data was garbage. It is also the box Nathan
talks to Claude on, so loading it makes the session laggy. Put bots on
**nvidia-laptop (8 cores)**; pi-16gb is available but runs a privacy stack that
must be restored. Always check `nproc` and `/proc/loadavg` before believing a
red, and `pkill -f "headless_shel[l]"` (bracketed) to clean up.

MonitorBot is a systemd user unit on the raspberrypi in room `test` — it shows
up as `meet.js --room test`. Never broad-pkill there; target your own room.

## Power sampling

`test/tools/phone-power-log.sh` with `PHONE_ADB_SERIAL`, 10s JSONL. Read
`docs/phone-power-tuning-results-2026-07-30.md` for method. The one that bites:
`current_now` is the charger SURPLUS only while `status:5` (FULL); at `status:2`
it is battery current and the two are NOT comparable. A phone pinned at 100%
masks the counter, which is why the second phone (mid-charge) is the one that
can answer the charge-slope question.
