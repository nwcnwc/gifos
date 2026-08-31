# DigitalJS

A live logic bench. Gates, flip-flops, adders, clocks. Combinational circuits light as you type; press **Play** and clocks tick. The circuit you leave is the circuit you come back to.

## Samples

The menu at the top is the starter kit:

- **4-bit counter** — a clock, a reset button, an incrementer, four lamps and a hex digit. Play and watch it count. Hold **reset** to clear.
- **4-bit add/sub** — A starts at 5, B at 3, so **Y is 8** and the y3 lamp is on. Type new hex values. The **sub** button picks subtract. Combinational — you do not need Play.
- **Full adder** — tap **a**, **b**, and **cin**. Two half-adders make sum and carry on the lamps immediately. Double-tap a half-adder box to look inside.
- **8-bit LFSR** — a shifting byte that looks random. Reset seeds it.
- **D-latch** — **d** is the data, **en** the enable. When enable is on, q follows d; when it is off, q holds.

**JSON** pastes a DigitalJS netlist of your own, or copies the one on the bench.

## The bench

- **Play** runs clocks (counter, LFSR). **Pause** holds them. **Step** advances one tick, then combinational logic settles. Add/sub and the full adder update as you type or tap — they do not wait for Play.
- Drag the background to pan. Scroll, pinch, or use **+/−** to zoom. **Fit** frames the whole circuit.
- Click a square **button** on the schematic (or the matching row under **Pins**) to flip it. Type into a number box to drive a bus.
- On a phone the pins sit under the drawing so you do not have to hunt for a tiny control.

A green lamp is 1. A red lamp is 0. Wires show the value they carry.

## A friend on the bench

Press **Invite** in the bar above the app and send the link. They get this circuit. Anyone can flip a pin; Play is shared.

## What is saved

The netlist, the pin values, and which sample you were on. Close it, open it tomorrow, the counter is still there.
