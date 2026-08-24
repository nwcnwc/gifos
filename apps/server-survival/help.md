# Server Survival

Build a cloud. Survive the traffic. You are the architect: place services, wire them, and keep reputation and budget alive while the load climbs.

This is an unofficial port of Server Survival by Kostyantyn Pshenychnyy. The game that teaches you to run servers, running with none.

## Modes

- **Survival** — endless. Traffic multiplies, random events hit, services wear down. Game over at 0% reputation or about −$1000.
- **Campaign** — 25 levels across five chapters (Basics → Optimization → Defense → Production → The AI Wave). Each level teaches one idea, with a debrief after.
- **Sandbox Mode** — any budget, any mix, no game over. A lab.

## How to play

1. Start Survival, Campaign, or Sandbox Mode from the menu.
2. Place a **Firewall** on the Internet node first. Malicious leaks destroy reputation.
3. Route STATIC/UPLOAD through a **CDN** into **Storage**. Route READ/WRITE/SEARCH into a database (or a cache in front of it).
4. Use **Link** to connect nodes. Flow direction matters: Internet → front door → compute → data.
5. Watch health. Click a damaged service to repair, or turn on Auto-Repair (it costs extra upkeep).
6. Scale before the next RPS surge. Queues buffer spikes. An API Gateway throttles instead of failing.

## Traffic

| Colour | Kind | Wants |
|---|---|---|
| Green | STATIC | CDN / Storage |
| Blue | READ | Replica / NoSQL / SQL |
| Orange | WRITE | NoSQL / SQL / Warehouse |
| Yellow | UPLOAD | Storage |
| Cyan | SEARCH | Search Engine (SQL fallback) |
| Fuchsia | INFERENCE | GPU via Inference Gateway |
| Red | MALICIOUS | Firewall / Identity Provider |

Earn money on legitimate success. Block attacks. Failed requests and leaked attacks cost reputation.

## Controls

- **Left click** — select, place, connect
- **Right-drag** — pan
- **Scroll** — zoom
- **WASD / arrows** — pan when zoomed in
- **R** — reset camera
- **T** — isometric / top-down
- **H** — hide HUD
- **1–5** — service category tabs
- **Esc** — menu (pauses)
- Time buttons: pause, 1×, 3×

On a phone, tap the toolbar, then tap the board to place. Drag with two fingers to pan; pinch to zoom.

## What is saved

Your last run, campaign stars, trophies, sound on/off, language, and toolbar tab stay in this copy of the app. Download a save file if you want a spare. Architecture PNG export is a snapshot, not a live share.
