# Ping Pong — Design Document

A real-time, two-player table-tennis game for GifOS. Each player opens the app, presses **Invite**, and joins from their own phone or computer. Both players see the table from their own end; the host runs the physics and broadcasts state, while the guest sends swing inputs back to the host.

## 1. Goals

- **Two-player synchronous ping pong** with each player looking down the table from their own side.
- **Pressure-sensitive hits**: how hard you tap (or click) determines how hard the ball leaves your paddle.
- **Smudge = spin**: the direction you smudge when you tap puts spin on the ball.
- **Visible spin**: the ball has a stripe on it so you can see it rotating through the air.
- **Disconnection recovery**: if a player drops offline, the game pauses and shows a "Tap when you're back" screen so they can be ready when the ball comes back at them.

## 2. App packaging

The game is a seeded default app, like Tic-Tac-Toe and Chess Tournament.

- **File**: `site/js/sample-apps.js`
- **App ID**: `pingpong`
- **Name**: `Ping Pong.gif`
- **Folder**: `Games`
- **Accent**: a warm sporty orange, e.g. `[255, 140, 60]`
- **Manifest capabilities**: `db`, `multiplayer: true`, `network: []`
- **Shared data**: `{ pingpong: RW }` (the single authoritative game-state record)
- **Theming mode**: `vars` (we hand-theme the canvas/table so the chrome can still follow the computer's palette)

The app is one self-contained HTML file, one `<canvas>` for the game, and a small overlay for the ready/disconnected state.

## 3. Roles: host vs. guest

- `gifos.info().owner` tells us which tab is the **host** (the person who opened the app and pressed Invite).
- The host is the physics authority.
- The guest sends **swing intents** to the host through the shared DB.
- If the host leaves, GifOS's existing host-failover promotes a mirrored guest to host; the promoted tab then starts running physics.

## 4. Coordinate model

We use a 2.5D table coordinate system so each player can render the same state from opposite ends.

| Axis | Meaning |
|------|---------|
| `x`  | Width of the table, left to right from the host's point of view. Range `[-W/2, W/2]`. |
| `y`  | Length of the table, from host's end (`0`) to the far end (`L`). |
| `z`  | Height above the table. `z = 0` is the table surface. |

For rendering:

- **Host** sees their own paddle at `y ≈ 0` (bottom of screen) and the opponent at `y ≈ L` (top).
- **Guest** sees the same state but renders with `y' = L - y`, so their paddle is at the bottom and the host is at the top.
- `x` and `z` are identical for both players.

This gives each player a natural first-person view without maintaining two copies of the world.

## 5. Game state

A single shared record `id: 'game'` in the `pingpong` collection:

```js
{
  id: 'game',
  // Ball
  bx, by, bz,           // position
  vx, vy, vz,           // velocity
  spinX, spinY, spinZ,  // angular velocity in radians/tick
  spinPhase,            // accumulated rotation around the visible axis (for the stripe)

  // Paddles
  hostPaddleX, guestPaddleX,    // x positions, controlled by pointer/mouse
  hostScore, guestScore,

  // Turn & phase
  serving: 'host' | 'guest' | null,  // who is serving right now
  lastHitter: 'host' | 'guest' | null,
  resetAt: 0,                          // timestamp of last point reset

  // Guest swing queue (host consumes these)
  swings: [{ player, t, force, dirX, dirY, hitX }],

  // Connection pause
  paused: false,
  pausedBy: 'host' | 'guest' | null,
  pausedAt: 0,

  // Epoch so re-joining guests know they are seeing fresh state
  epoch: 1
}
```

The record is small (a few dozen numbers) so it syncs cheaply every physics tick.

## 6. Physics

The host advances physics in a fixed-timestep loop (e.g. `dt = 16 ms`).

### 6.1 Ball motion

```
bx += vx * dt
by += vy * dt
bz += vz * dt
vz += gravity * dt
spinPhase += spin magnitude * dt
```

`gravity` is tuned so a lobbed ball hangs in the air for about one second.

### 6.2 Table bounce

When `z` crosses `0` while `by` is on the table:

- Reflect `vz` with a restitution factor (`~0.8`).
- Add a small horizontal kick from spin (Magnus approximation):
  - top spin increases forward velocity after bounce,
  - back spin reduces/reverses it,
  - side spin nudges `vx`.
- Clamp positions to the table surface.

### 6.3 Net

A low net sits at `y = L/2`, height `z = netH`. If the ball's trajectory crosses the net below `netH` on the wrong side, it is a fault and the point is awarded to the opponent.

### 6.4 Paddle hit

A hit happens when the ball is within the paddle's reach box and moving toward the player.

The outgoing velocity is a blend of:

1. **Incoming reflection** — mirror `vy` so the ball goes back.
2. **Hit position** — where on the paddle the ball struck (`x` offset) adds angle to `vx`.
3. **Tap force** — scales the outgoing speed.
4. **Smudge spin** — adds spin components based on the smudge direction.

Formula sketch:

```js
const speed = baseSpeed + force * maxForce;
vy = -Math.sign(vy) * speed;
vx += (hitX - paddleX) * angleScale + smudgeX * sideSpinScale;
spinZ += smudgeX * sideSpinGain;   // left/right smudge = side spin
spinY += smudgeY * topSpinGain;    // up/down smudge    = top/back spin
vz += upwardLift;                   // small automatic lift so the ball clears the net
```

`force` is normalized to `[0, 1]`. On phones with `PointerEvent.pressure` we use that; otherwise we estimate from contact area or the inverse of tap duration.

### 6.5 Smudge direction

A swing is captured like this:

```js
let smudge = { x: 0, y: 0 };
let pressure = 0;

onpointerdown: start = { x, y, t };
onpointermove:  accumulate dx/dy between down and up;
onpointerup:     smudge = { x: up.x - start.x, y: up.y - start.y };
                 pressure = e.pressure || estimateFromTouch(e);
```

Because the canvas is already flipped for the guest, we normalize the smudge in **table coordinates** before sending it to the host, so the host never has to think about screen orientation.

## 7. Input handling

- `pointerdown` / `pointermove` / `pointerup` on the canvas.
- Paddle `x` tracks the pointer's `x` while the pointer is down.
- A swing is triggered when the ball enters the paddle zone **and** the pointer is currently down. We do **not** require the user to time the down exactly; the paddle is "live" while the finger/mouse is pressed. This feels like holding a paddle ready to strike.
- On a hit, we sample the current `pressure` and recent smudge vector.
- For mouse users without pressure, fall back to a short key-press model (hold click → release) or use the duration of the press as an inverse proxy for force.

## 8. Rendering

A full-screen `<canvas>` with the table drawn in perspective.

### 8.1 Table

- Green/dark table surface with a center line and two half-court shadows.
- Net across the middle.
- Paddles drawn as rounded rectangles at each end.
- Scoreboard in the header.

### 8.2 Perspective

For each player we project table coordinates to screen coordinates:

```js
screenX = centerX + bx * scaleX * perspective
screenY = bottomY - by * scaleY * perspective - bz * scaleZ
screenR = ballRadius * perspective
```

where `perspective` shrinks slightly toward the far end so the table looks 3D.

### 8.3 The striped ball

The ball is drawn as a white circle with a dark or accent stripe running across it.

```js
ctx.beginPath();
ctx.arc(screenX, screenY, screenR, 0, Math.PI * 2);
ctx.fillStyle = '#fff';
ctx.fill();

// Stripe rotates with spinPhase
ctx.save();
ctx.translate(screenX, screenY);
ctx.rotate(spinPhase);
ctx.fillStyle = accentColor;
ctx.fillRect(-screenR, -screenR * 0.12, screenR * 2, screenR * 0.24);
ctx.restore();
```

Because we accumulate `spinPhase` from the spin vector's magnitude, a fast-spinning ball shows a rolling stripe. A side-spin ball appears to rotate around the vertical; a top-spin ball appears to rotate around the horizontal. We render the dominant axis.

## 9. Disconnection and the "ready" screen

GifOS already tracks connection health and will promote a guest to host if the original host disappears. The app adds its own player-level pause:

1. Each client watches the timestamp of the latest state record it received.
2. If no fresh state arrives within `MISSING_MS` (e.g. 2000 ms), the app shows the overlay:
   - "Connection paused. Tap Ready when you're back online."
3. The client also listens to `window.online` / `window.offline` for a quick UI hint.
4. When the player taps the overlay button, the client writes a `ready` intent to the shared record (or just waits until state resumes). Once fresh state is flowing again, the overlay disappears automatically.
5. While paused, the **host freezes physics** so the ball does not fly past a disconnected player. This is the key requirement: the returning player must be ready when the ball comes at them.

### 9.1 Host pause rule

The host checks the last time it received any input or state heartbeat from the guest. If the guest is quiet for more than `GUEST_TIMEOUT_MS` (e.g. 3000 ms), the host sets `paused: true` and stops advancing the ball. It keeps broadcasting the frozen state.

When the guest returns and sends a `ready: true` flag (or any new input), the host unpauses. If the ball was in mid-air toward the guest, it resumes from exactly that point.

## 10. Game flow

1. Host opens `Ping Pong.gif`. App seeds a fresh state and waits.
2. Host taps **Invite**; guest joins via the link.
3. Both see the table. Host serves by tapping/clicking.
4. Rally continues until someone misses. Host awards the point and resets the ball to the server's side.
5. First to 11 (by 2) wins. A "New game" button clears scores and re-serves.

## 11. Files to change

- `site/js/sample-apps.js`
  - Add `PINGPONG_HTML` template string.
  - Add `pingpong` to `VAR_APPS`.
  - Add `app('Ping Pong', 'pingpong', [255, 140, 60], PINGPONG_HTML, { data: { pingpong: RW } })` to the `Games` group.
- `site/themes/icons.js` (optional)
  - Add `ART.pingpong` if we want a custom icon; otherwise the pack's letter fallback (`P`) is used automatically.
- `test/browser/e2e.js`
  - Update the Games-folder assertions that currently expect exactly four games, and any list that enumerates game names, to include `Ping Pong.gif`.

No changes are required to the runtime, mesh, or relay: the game uses the existing `gifos.db` multiplayer primitives.

## 12. Testing plan

1. **Seeding**: run `node test/browser/e2e.js` and confirm the `Games` folder contains `Ping Pong.gif`.
2. **Local two-player**: open the app in two browsers via the local dev servers and verify both sides see the ball from opposite ends.
3. **Pressure/spin**: test on a phone with 3D Touch / Force Touch / stylus pressure, and on desktop with mouse/touchpad, to confirm force varies with input pressure.
4. **Disconnection**: turn off Wi-Fi on the guest device; confirm the game pauses and shows the ready overlay. Reconnect, tap Ready, and confirm the rally resumes.
5. **Snapshot**: export the Games folder as a GIF, import it on a fresh desktop, and confirm Ping Pong is included.

## 13. Open questions / future work

- Should the app support single-device hot-seat mode for quick testing? (Likely yes: if no guest is present, the same player controls both paddles top and bottom.)
- Should we add sound on paddle hits? (Yes, via a short Web Audio beep; no external assets needed.)
- Should there be an AI opponent? (Out of scope for the first version; the real opponent is another person.)
