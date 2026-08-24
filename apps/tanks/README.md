# Tanks

Drive a tank. Invite is the arena. No Node, no socket.io.

An unofficial port of
**[Realtime Multiplayer in HTML5](https://github.com/ruby0x1/realtime-multiplayer-in-html5)**
by Sven Bergström (MIT). Upstream is the Build New Games demo: an
Express + socket.io tick and two rectangles. **The server is gone.**
The host's browser holds the room. Tanks have turrets now. Phone
sticks. Invite is the arena.

```
index.html
style.css
net.js              each player owns one row
app.js              arena, tanks, shells, drones, touch
icon.mjs
build.mjs
vendor/COPYING-tanks.txt
vendor/UPSTREAM.txt
```

## capabilities

| capability | why |
|---|---|
| `db` | `players` (read-write) and private `prefs`. |
| `multiplayer` | The invite is the arena. |

No `network`. `minBuild` is **947**.

## Building

```bash
node apps/tanks/build.mjs
```

Do not run `scripts/build-app-catalog.mjs` from this change.
