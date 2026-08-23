# Civiclock

A first-party city simulation that **ticks**. Zones, a budget, power and
water, people who walk to jobs, traffic on the roads, night lights, and a
query tool that tells you why a lot will not grow. Inspired by SimCity —
original engine and original pictures, not a port.

```
index.html     HUD, map canvas, tools, inspect/budget sheet, first-run coach
style.css      dark, phone-first, gold night-city
sim.js         pure tick (Civiclock) — growth, services, demand, people
render.js      isometric painter, original geometry
app.js         gifos.db + co-mayor edits, host clock, input
icon.mjs       night city lighting up; a commuter crossing
tools/shoot.js Playwright cover (grown village, dusk)
build.mjs      packs site/apps/civiclock/civiclock.gif
```

## Why this, not a boxed city sim

No account, no install, no city server. Works on a plane. The file is the
save. One Invite (OS chrome) is a co-mayor on the same land.

## Play

Paint **homes / shops / works** against a **road**. A **plant** feeds power
down the road; a **pump** on the river feeds water down the road. Unpause.
Lots grow when demand, power, water and land value allow; they abandon when
you cut the plant, jack the tax, or leave them with no jobs. **Look** on a
lot to see why. **Budget** is the tax slider and last month’s books.

**Drop a village** puts a small powered town on the land so the tick is
visible immediately. A launch link can ask for that (`go.village=1`).

## Multiplayer

Host ticks `city`. Guests write `edits`; the host applies them, then ticks.
`cursors` are presence. `prefs` (tool, coach) stay on this device.

## capabilities

| capability | why |
|---|---|
| `db` | The city is the save. |
| `multiplayer` | Co-mayors. |

No `wasm`, no `network`. `minBuild` is **947**.

## Building

```bash
node apps/civiclock/build.mjs
node apps/civiclock/tools/shoot.js
```

Writes `site/apps/civiclock/civiclock.gif`. `build.mjs` does not clobber a
Playwright `screenshot.png`.

## Licence

MIT. Original engine and art, GifOS.
