# DigitalJS — gauntlet critic

Blind A/B against **digitaljs.tilk.eu** (DigitalJS Online — Verilog/SystemVerilog + Yosys + live schematic, Marek Materzok) and **Logisim** (gate-palette schematic editor). Played the packed GIF `site/apps/digitaljs/digitaljs.gif` in the real GifOS sandbox (`run.html#id=` after install), desktop **1280×800**. Listing read from `site/apps/digitaljs/app.json` (the record `/store.html#app=digitaljs` paints). Catalog searched in `site/apps/index.json` (156 apps). Comp page fetched live. 390×844 and Invite were not recaptured after the box started SIGKILLing later Chromiums; phone layout is judged from the column chrome that already painted at 1280 plus the `max-width: 640px` CSS.

**winner:** COMP

**single biggest remaining gap:** After the counter ticks, a stranger who knows the original has nothing left that *is* DigitalJS or Logisim. No Verilog, no Yosys, no gate palette, and the combinational samples (4-bit add/sub, full adder) sit at **X**. This is a five-netlist player of `digitaljs@0.14.2`, not a bench you build on.

**would a stranger who knows the original use this copy:** "I would not. digitaljs.tilk.eu is where I type Verilog and press Run. Logisim is where I drag an AND. This GIF played me a counter, then handed me an adder whose Y never left x, a full adder whose sum/cout lamps stayed grey, and a JSON paste sheet. The plane / file-is-the-save / Invite story is the reason this port exists, and the store cannot even show the card — `digitaljs` is missing from `index.json`. Until I can *make* a circuit that computes, I stay on the website."

## Does the 4-bit counter actually tick?

**Yes.** That claim is true of the GIF that ships.

Cold boot: sample `4-bit counter`, status **Stopped**, hex **0**, four lamps grey (`—`, three-valued X), schematic Fit-centered (clk, reset, count DFF, +1, inc, value, q0–q3). `window.digitaljs`, `DjsApp`, SVG paper, pins panel all present. No in-app error.

Play: button flips to **Pause**, status **Running**. Hex sampled over 1.6 s: **0 → 0 → 0 → 1 → 1 → 1 → 2**. Pins `q1` checked at 2. Screenshot at that beat: value **2**, q1 green, q0/q2/q3 red, clock wire live. Left running longer, Step-paused at hex **b** (q0, q1, q3 on = 1011). The incrementer is not a drawing. It counts.

Step advances on clock edges (several clicks per increment — that is a Clock, not a bug). Reset while **Stopped** set the pin and did not clear the DFF; the engine was not running.

## Bar check

Bar ONE is not mediocre. digitaljs.tilk.eu is an HDL IDE: new tab, `.sv`/`.v`/Amaranth/Lua, load-example dropdown, Yosys (WASM or server), gate mapping, ElkJS/Dagre, waveform transport, file save, share URL. Logisim is a drawing program whose product *is* the palette. "As good as" would already lose on a port. This is a demo reel of five netlists plus JSON paste.

Bar TWO is why this should have won: the circuit in the GIF, Invite is the same bench, it runs on a plane. Sample id **does** survive close/reopen (left on 4-bit add/sub, came back on 4-bit add/sub). Invite is OS chrome (`#appinvite` visible, no in-app Invite button). Guest join was not driven this run. Combinational samples do not currently pay the "type A and B" sentence in help.md.

## Face (always judged)

- **Icon:** 16 frames, 120 ms, four lamps counting in binary under a clock that pulses. At Home Screen size it reads as a live logic bench, not a wiggle. Comp has no animated icon. Structural win. (Probe `putItem` stacked it on Welcome.gif — that is the harness, not the ornament.)

- **Cover:** `cover.jpg` is a **live** screenshot of the running counter at value **8**, q3 green, Pause/Running, pins in agreement. Not first-boot, not GifOS chrome, not the pixel-font fallback in `icon.mjs`. At hero (680) it sells "logic bench mid-count." At card (240×150, 16/10, top-center) the schematic still reads; the pins row is the first thing `object-fit: cover` will crop. Honesty nick: first paint is Stopped at 0 with grey X lamps, not the cover's red/green 8.

- **Listing copy:** Tagline *The circuit lives in the GIF. Invite shares the bench. It works on a plane.* Description leads with Play → counter climbs, close-and-keep, Invite, then the five samples, JSON, pan/zoom, phone pins, unofficial port. Right shape. Author Marek Materzok, porter GifOS, `blessed: false`, BSD-2-Clause, 609 KB, abilities db + multiplayer. Lead claim "Press Play and a 4-bit counter climbs" is **true**. "the same netlist is still loaded" is **true** of the sample. "a friend lands on that bench" was not driven. "Type A and B" in help is false of the Stopped engine — Y stayed **x** with A=5 B=3 sitting on the paper.

## Product notes

- **Clocked samples work.** Counter ticks. LFSR Play moved `out` **01 → 07** (screenshot after Pause). Latch paints q=0 from the DFF initial.

- **Combinational samples do not.** 4-bit add/sub: A and B default **x**, Y **x**. After setting 5 and 3 and pressing **sub**, the mux select went green and the sub button filled — Y still **x**, `+`/`−` empty. Full adder: a=1 b=1 (buttons black, wires green into ha1), **sum** and **cout** lamps grey, pin checks `—`. `boot.js` `stop()`s every load. `Step` is `updateGatesNext` (clock edge), not `updateGates` (combinational pass). digitaljs.tilk.eu starts the engine when you press Run. Ours labels Play like a clock, so a stranger typing A and B never thinks to press it — and this run never saw Y become 8.

- **No palette, no HDL.** Samples dropdown + JSON sheet (1495 bytes of the live latch, Load/Copy). Double-tap-into-subcircuit was not confirmed. Logisim's drawing and the original's Verilog tab are the product those users came for. GAUNTLET.md already names the palette as the remaining gap; it is still the gap, and the dead combinational samples make even the canned teaching kit a shrug.

- **JSON / zoom.** JSON sheet opens, dumps devices, Close works. `+` 1.6 → 1.92, Fit back to 1.6.

- **Save in the GIF.** Reopen of the same `run.html#id=` restored sample **alu**. Pin values were `xxxx` going in (invalid/unpropagated), `xxxx` coming out. The file is the sample, not a computed Y.

- **Phone (390).** Column chrome already puts **Pins** under the paper at desktop; `@media (max-width: 640px)` hides `.meet`, raises pins to 34vh, tightens the bar. That is the right shape. Viewport 390 was not photographed this run.

- **Invite.** `#appinvite` is visible on the solo bar; the app does not draw Invite. `net.js` is last-rev-wins of `{json, io, running, sample}`. Guest path not driven.

## Wall breaks

- **No CDN / no remote load:** vendor is packed (`digitaljs@0.14.2` sha pin, dagre, no ELK worker). Manifest has no `network`. App frame talked to `127.0.0.1:8099` on the desktop run.

- **Catalog index — fail to ship.** `site/apps/digitaljs/{digitaljs.gif,app.json,cover.jpg}` exist. `site/go/digitaljs/` exists. `site/apps/index.json` has **no** `digitaljs` (156 apps). Search for `circuit` → nothing; `gate` → nothing; `logic` → Queens; `simulator` → civiclock; `verilog` → nothing. **The store has no logic-gate simulator** because this slug is not in the catalog. A stranger browsing the grid cannot find it. Direct `#app=digitaljs` would still paint from `app.json`.

- **Listing truth:** counter claim holds. Combinational help/listing implication does not. Invite untested, not an overclaim we proved false.

- **minBuild 947 / unofficial / BSD-2-Clause inside the GIF / Invite is OS chrome:** honest on paper.

- **Saved data in gifos.db:** sample id round-tripped. Computed combinational state has nothing to save.

The run can leave on the stranger-reason the moment (1) the catalog names the slug, (2) typing 5 and 3 paints 8 without a secret Play, and (3) there is *a* way to add an AND — palette or Verilog, one is enough. Until then digitaljs.tilk.eu wins the A/B, and Logisim is not even in the same sport.
