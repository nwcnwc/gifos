# DigitalJS

A live logic bench. Gates, flip-flops, adders, clocks. Press **Play** and the wires carry values; lamps light, numbers tick. The circuit you leave is the circuit you come back to.

## Samples

The menu at the top is the starter kit:

- **4-bit counter** — a clock, a reset button, an incrementer, four lamps and a hex digit. Play and watch it count. Hold **reset** to clear.
- **4-bit add/sub** — type A and B (hex). The **sub** button picks subtract instead of add.
- **Full adder** — tap **a**, **b**, and **cin**. Two half-adders make sum and carry. Double-tap a half-adder box to look inside.
- **8-bit LFSR** — a shifting byte that looks random. Reset seeds it.
- **D-latch** — **d** is the data, **en** the enable. When enable is on, q follows d; when it is off, q holds.

**JSON** pastes a DigitalJS netlist of your own, or copies the one on the bench.

## The bench

- **Play** runs the clock. **Pause** holds it. **Step** advances one tick.
- Drag the background to pan. Scroll, pinch, or use **+/−** to zoom. **Fit** frames the whole circuit.
- Click a square **button** on the schematic (or the matching row under **Pins**) to flip it. Type into a number box to drive a bus.
- On a phone the pins sit under the drawing so you do not have to hunt for a tiny control.

A green lamp is 1. A red lamp is 0. Wires show the value they carry.

## A friend on the bench

Press **Invite** in the bar above the app and send the link. They get this circuit. Anyone can flip a pin; Play is shared.

## What is saved

The netlist, the pin values, and which sample you were on. Close it, open it tomorrow, the counter is still there.
