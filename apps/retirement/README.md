# Retirement Calculator

Answers *when can I stop working* and *will the money last* by running your plan
against every stretch of real market history long enough to hold it — Robert
Shiller's monthly record, January 1871 to now — and then telling you, in
measured numbers, what would change the answer.

Original work, not a port. `gifos.app/store/retirement`.

## What it is

Everything is in **today's dollars**, because the underlying series are already
real. That is not a display choice: it is why the arithmetic is simple, and why
a `$75,000` budget means a life that costs `$75,000` today, in year 1 and in
year 50.

- **A sweep, not a formula.** 1,268 fifty-year runs on the defaults; 1,508
  thirty-year ones. Every start month, in the order it actually happened.
- **Six inputs to a real answer.** It opens already answering, on defaults that
  land at 90% against a 95% bar *on purpose* — a calculator that reports a
  serene 100% before you have typed anything teaches you that it always says
  yes.
- **It ends with an instruction.** Seven levers, each re-simulated: spend less,
  work longer, save more, change the mix, agree to be flexible, cut fees, claim
  Social Security later. Nothing is a rule of thumb; press **Try it** to apply
  one.
- **Both risks on one axis.** *Rich, broke, or gone* puts the chance of running
  out beside the chance of not being there, from the SSA period life table.
- **Saved plans.** Name them, keep as many as you like, put two side by side.
  One **Invite** and someone else is in the same set of plans, live.
- **Light or dark**, selected rather than inverted — each palette validated
  against its own surface.
- **College and other spans.** An event runs for as many years as you say, so
  four years of tuition is one row.
- **Spending need not be flat.** *Spend less as I get older* uses Blanchett's
  retirement spending smile instead of a straight line. Off by default, because
  it makes every plan look better.

## Which `gifos.*` it uses

| | |
| --- | --- |
| `gifos.db('scenarios')` | saved plans — `read-write`, so one **Invite** puts two people in the same set of plans, live |
| `gifos.db('prefs')` | the working draft and which plan you had open — `private`, never shared |
| `gifos.onBack` | closes the modal, then the plan menu |

`capabilities` are **`db`** and **`multiplayer`** and nothing else. No
`network`, no `api`, no `ai` — the listing's promise that nothing is uploaded is
only true while those are absent, so `build.mjs` and the unit suite both refuse
a manifest that grows one.

## Files

```
data/market.js      Shiller monthly real TOTAL-return indices + CPI + CAPE, 1871-01..2026-08
data/mortality.js   SSA period life table (2023), l(x) for ages 30..119
sim.js              the engine — monthly, two sleeves, annual rebalance. No DOM.
advice.js           the levers. Every claim simulated, never asserted.
chart.js            SVG fan / curve / stack / table twin, hover + keyboard
app.js              plan state, scenarios, and the words around the charts
icon.mjs            the App GIF's animation
build.mjs           packs the GIF, and refuses to if the numbers have drifted
tools/              regenerate the data; drive and photograph the app
```

## Building

```bash
node apps/retirement/build.mjs                  # -> site/apps/retirement/retirement.gif
node scripts/build-app-catalog.mjs              # -> site/apps/retirement/{app.json,cover.jpg}
```

The build is **offline and deterministic**: everything it reads is committed.
The two data files are refreshed by hand and rarely:

```bash
python3 apps/retirement/tools/fetch-market-data.py    # Shiller, from shillerdata.com
python3 apps/retirement/tools/fetch-life-table.py     # SSA period life table
```

`build.mjs` will not write a GIF unless the arithmetic still reproduces the
record — 4% over 30 years at 75/25 in the mid-to-high 90s, the worst cohort in
the mid-1960s, real CAGRs in total-return range, and the published couple
survival odds. A price-only data refresh would make every answer about two
thirds better and throw nothing; that is what those checks are for.

## Testing

```bash
node test/unit/retirement.js                    # 86 assertions, ~10s, no browser
python3 -m http.server 8099 -d site
node test/browser/e2e-retirement.js             # the real GIF in the real sandbox
node test/servers/relay-local.js
node test/browser/e2e-retirement-mp.js          # two people, one Invite link
```

All three are discovered by `test/batteries/release.sh`, so they are gated from
the day they land.

- **unit** pins the arithmetic against published sources — Trinity, Bengen, the
  Bogleheads VPW table, Vanguard's band, the SSA life table — and re-simulates
  every suggestion the advice engine makes.
- **e2e** proves what the arithmetic cannot: saving a plan, reopening it with its
  numbers intact, comparing two, surviving a reload. It also guards the defects
  that got past review — that a redraw replaces its chart rather than stacking
  another one, that the headline tiles REFUSE for strategies which cannot fail
  instead of printing $185B, that an empty income row is worth nothing, and that
  no part of the input rail hides in a nested scroller. And it watches the wire:
  a full re-run touches no outside host.
- **mp** drives the listing's Invite claim through two browsers and a relay, and
  counts `getUserMedia` to prove no camera is opened.

```bash
node apps/retirement/tools/shot.js --gif           # look at it in the sandbox
node apps/retirement/tools/shot.js --gif --phone
node apps/retirement/tools/shot.js --gif --cover   # retake screenshot.png
```

`shot.js` prints every console error and failed request beside the screenshot. A
silent screenshot of a broken app is the failure mode it exists to prevent.

## What it does not do

- **No tax.** Same as FIRECalc, cFIREsim and FI Calc, and said plainly in the
  listing and in Help, because it is the thing a reader is most likely to assume
  and be wrong about.
- **US market history.** S&P 500, ten-year Treasuries, US CPI.
- **The past is not a promise.** It is the best evidence anyone has about how
  bad things get, and still only what has happened so far.

Sources and the arguments behind each choice are in `GAUNTLET.md`.
