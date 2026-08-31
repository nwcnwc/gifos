# DigitalJS — gauntlet

**Win:** Logisim and the DigitalJS web demo need an install or a live page; this GIF is the bench itself — the netlist lives in the file, it runs on a plane, and one invite is two people on the same circuit.

## Bars

- **ONE:** DigitalJS (digitaljs.tilk.eu) / Logisim — schematic of gates and flip-flops, click a button, watch a lamp, Play/Pause the clock.
- **TWO:** offline, state in the GIF (`gifos.db`), invite shares the bench with no server.

## Rounds

1. Vendored digitaljs@0.14.2 as a classic IIFE (dagre layout, no ELK worker). Sample **4-bit counter** constructs, starts at 0000, and increments on the clock (HeadlessCircuit: 0000→0001→0010→0011). ALU 5+3=8, 5−3=2.
2. Pins panel + pan/pinch/Fit so a phone can drive buttons without hunting 10 pt magnets.
3. Private save of netlist+pins; `room` last-rev-wins so an invite is the same bench.
4. Icon is four lamps counting; cover is the live bench at value 8 with q3 lit, Pause/Running, pins in agreement.
5. Phone: schematic Fit-centered, pins under the drawing, pan/pinch/+/−.
6. Listing leads with the file-is-the-save / invite / offline reason.

## Remaining gap

No in-app gate palette — you load a sample or paste DigitalJS JSON rather than drag an AND out of a toolbox. Logisim's drawing is the original's unfinished TODO too; the simulator and the shared bench are the product.
