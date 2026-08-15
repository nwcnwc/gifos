# FPS Simple

A first-person shooter that runs as an ordinary sandboxed GifOS app. Solo, a
garrison patrols a market street and hunts you; send the invite link and the
same street becomes a deathmatch.

The engine is **[Claude of Duty](https://github.com/mshumer/Claude-of-Duty)** by
mshumer — MIT, Three.js r180, ~66k lines across eleven subsystems. This
directory is the GifOS port: the shell around it, the touch controls, the
pointer handling, and the multiplayer, none of which upstream has.

```
index.html      the shell: canvas, the gate, touch markup, scoreboard
style.css       gate / touch / scoreboard (upstream styles its own HUD)
boot.js         our entry: quality, prefs, the netplay system, death & respawn
net.js          transport — presence, hit claims, the scoreboard roster
remote.js       remote players as bodies in the world
touch.js        thumb controls, written into the channels Input already has
icon.mjs        the procedural app icon
vendor/game.js  GENERATED. The pinned upstream engine as one IIFE. Never edit.
vendor.mjs      rebuilds vendor/game.js from the pin. The only step needing net.
build.mjs       packs all of the above into site/apps/fps-simple/fps-simple.gif
```

## Why this app can exist at all

Upstream generates every texture, mesh, animation and sound from code at load
time. There are no assets to fetch, so `connect-src 'none'` costs it nothing —
this is the rare large game that is *already* shaped like a GifOS app. It uses
no `localStorage`, no `indexedDB`, no workers, no WebAssembly, and makes no
network calls at all. The app declares **no `network` capability** and needs
none.

(That is an engineering note about portability, not a sales pitch. Nothing the
player reads mentions it — they should be told about the street and the
garrison, which is what they actually came for.)

## capabilities

| capability | why |
|---|---|
| `pointer` | Pointer lock. A sandboxed frame is refused it outright, and the refusal is a `SecurityError` thrown *inside* the app — without the declaration the game mounts, renders, and silently cannot aim. Needs build **1285**, which is what `minBuild` records. |
| `db` | Settings in a `private` collection; player state in a `read-write` one. |
| `multiplayer` | The room. |

No `network`, no `wasm` (it is plain JS), no `gpu` (WebGL2 is not a
permissions-policy feature — verified, it works in the sandbox untouched).

## The port, in three parts

**Touch.** Upstream is keyboard, pointer-locked mouse and gamepad. On a phone it
renders beautifully and you cannot move or aim. `touch.js` adds a thumb layout
without forking anything, by writing into the channels `Input` already exposes
to a gamepad — `stick.moveX/moveY`, the `_rawLook` accumulator, and the button
edge queues. A thumb therefore arrives downstream as the same numbers a gamepad
or a mouse would produce. Sprint came free: upstream sprints when the stick
passes 0.92, so shoving the pad to its edge sprints with no button for it. Move
is a stick, look is a drag — the stick channel is a turn *rate*, which feels
like stirring soup when your thumb is on glass.

**The shared world.** It needed no protocol. The street is built procedurally
from the engine's RNG, so seeding every client identically puts everyone in the
same street, with the same cover and props, having sent nothing. One constant
(`WORLD_SEED` in boot.js) is the entire map-distribution problem. More than one
map would mean publishing the seed in the room; one is enough today.

**Damage.** Remote players are AI soldier bodies with the brain removed and the
transform fed from the wire. That is what makes this cheap: agents carry hit
capsules pushed onto the animated skeleton every frame, and the ballistics
system already raycasts bullets against them and emits `damage:dealt` naming
what it hit — so shooting a person uses the same code as shooting a bot, down to
the headshots and the hitmarkers.

The shooter decides what it hit; the target decides what that costs it and
publishes its own health. Nobody ever writes to anybody else's row (anyroad's
rule — it means there is no authority to arbitrate). Claims ride on the
shooter's own row and are deduped on `(shooter, sequence)`.

## Honest limits

- **6 Hz.** A subscriber re-downloads the whole collection on every change, so
  traffic is O(players²) and the platform wants a low publish rate with
  interpolation. Remote players are rendered ~166 ms in the past so they glide
  instead of snapping. This is deathmatch with friends over a link, not
  competitive netcode, and it should not be sold as the latter. Comfortable up
  to about six players.
- **Trusting clients.** A target applies its own damage, so a modified client
  could decline to die. The room is people you sent a link to; the simple design
  is the right one, and pretending otherwise would need a server there isn't.
- **One map.** See `WORLD_SEED` above.
- **Solo or deathmatch, not both.** The garrison is generated locally by each
  client, so in a shared room two players would each see private soldiers
  standing in different places — one player shooting at something the other
  cannot see. Alone you fight the garrison; in a room the room is the
  opposition. Joining mid-session does not retire a garrison that already
  spawned.

## Building

```bash
node apps/fps-simple/vendor.mjs      # only when moving the upstream pin (needs net)
node apps/fps-simple/build.mjs       # -> site/apps/fps-simple/fps-simple.gif
node scripts/build-app-catalog.mjs   # refresh the store catalog
```

Guarded by `test/browser/e2e-fps-simple.js` (boots from the real GIF, locks the
pointer, and runs a two-peer deathmatch over the local relay) and
`test/browser/e2e-pointer-lock.js` (the capability itself).

## Licences

Both MIT, and both notices are packed **inside** the GIF as well as living here,
because a copy of this app that someone was handed is a distribution of both
works: `vendor/COPYING-claude-of-duty.txt` and `vendor/COPYING-three.txt`.
Upstream's `package.json` says `ISC` while its `LICENSE` file says MIT; the
`LICENSE` file governs, and both are permissive in the same way regardless.
