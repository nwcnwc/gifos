# Fluid

Drag a finger (or the mouse) through dark water. Colour follows and folds. Nothing is uploaded.

## Play

- **Drag** on the canvas. Each stroke drops dye and a shove of velocity.
- **Multi-touch** works: two fingers, two swirls.
- **Space** throws a handful of random splats. **P** pauses.
- The panel on the right (closed at first on a phone — tap the bar) is the original control sheet.

## The panel

- **Quality** — how fine the dye grid is (high / medium / low / very low). Lower is kinder to a cheap phone.
- **Sim resolution** — the velocity grid.
- **Density / velocity diffusion** — how fast colour and motion fade.
- **Pressure**, **vorticity**, **splat radius**.
- **Shading**, **colourful** (the hue walks as you drag).
- **Paused** — freeze the fold. A still of that freeze is saved in this file.
- **Random splats** — a handful of bursts.
- **Bloom** and **Sunrays** folders add glow. Turn them off if the phone is warm.
- **Capture** — background colour, transparent, take screenshot. The screenshot is saved in this file (and also offered as a download).

A cheap phone starts at a medium dye grid. If frames stay slow, quality drops on its own and a short note says so. If this browser has no WebGL, the page says so instead of sitting black.

## What is saved

Quality, dye, bloom, sunrays, pause, background, and a still of the last swirl live in this file on this device. They come back the next time you open it. The live GPU sim itself is not restored — drag and it folds from here.

Unofficial port of [WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) by Pavel Dobryakov.
