# Periodic Table

All 118 confirmed elements on this device. Tap a cell for a card. Quiz
yourself, or race a friend from one invite.

An unofficial port of **[Periodic Table](https://github.com/calebephrem/periodic-table)**
by calebephrem (MIT). The original is a static site you have to host, with
category filters, element cards, a multiple-choice quiz, and extra chemistry
tables. This copy vendors the 118 elements inside the GIF (no Wikipedia
fetches), rewrites the UI as classic scripts so the GifOS runtime (which
drops `type=module`) can boot it, and adds a same-seed quiz race.

118 is **Oganesson** (Og). Ununennium (Uue) would be 119 and is not a
confirmed element — we do not vendor it.

```
index.html          table / quiz / play a friend / extra tables
style.css           dark #0a0a0f, category colours, detail sheet
elements.js         118 elements + seeded quiz items
app.js              table, sheet, quiz, multiplayer race
icon.mjs            coloured cells, Au flashing; 1200×720 cover
build.mjs           packs the GIF into site/apps/periodic-table/
vendor/             MIT notice + upstream pin
```

## What you can do

- **Table** — compact 18-column grid. Tap an element for a card (name,
  symbol, number, mass, category, shells). Filter by family. Search by
  name, symbol or number. On a phone the cells stay readable because the
  card is a sheet, not a magnified cell.
- **Quiz** — "What is the symbol for Gold?" / "Which number is Fe?" Four
  choices, one right. Score is saved on this device.
- **Play a friend** — send the invite (top bar; that button is OS chrome).
  Same quiz seed, race to ten right. Each person writes only their own
  score row. The host writes the shared quiz.
- **More** — hydrocarbons, indicators, solubility rules, from the original's
  extra tables, compacted for a phone.

## capabilities

| capability | why |
|---|---|
| `db` | Local quiz score, and the shared race. |
| `multiplayer` | The room. |

No `wasm`, no `network`, no `pointer`. `minBuild` is **947**.

`save` is private (your score). `room` is read-write (the shared quiz plus
each player's own row). Nobody writes anybody else's row.

## Building

```bash
node apps/periodic-table/build.mjs
```

Writes `site/apps/periodic-table/periodic-table.gif`. The MIT notice rides
inside the GIF.

Do not run `scripts/build-app-catalog.mjs` from this change — `index.json`
is owned elsewhere.

## Licence

Periodic Table — MIT, Copyright (c) 2025 Caleb Ephrem. See
[`vendor/COPYING-periodic-table.txt`](vendor/COPYING-periodic-table.txt).
