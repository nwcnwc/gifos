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
texcache.js     the world's surfaces, kept between launches
meshcache.js    built geometry and the nav grid, kept between launches
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

"The same code as shooting a bot" has one seam, and it has to be sewn by hand.
`damage:dealt` carries the wound already scaled by the collider that was hit —
which is where the headshot multiplier lives — but not by RANGE: the AI system
applies its own distance falloff (full damage inside 22 m, tapering to 0.45x by
77 m) at the moment it hands the wound to an agent, and a net body never takes
that path because it never takes damage locally. Claiming the raw number made a
person cost less than half what a soldier costs at the far end of the street.
`remote.js` asks the AI system for the same falloff, so a person and a bot are
worth the same shot.

The other seam is the kill. Upstream reports one from `damage:dealt.killed`,
set when an agent dies locally — and a net body, by design, never does. The
shooter genuinely cannot know: it claims damage and the target decides whether
that was fatal. So the kill is reported at the only moment the shooter can
learn it, when the target's own row comes back naming its killer, and it is
credited by ID. (It was credited by NAME once. Two players called "Player" —
which is the default for anyone who never set one — and the kill went to
whichever the roster reached first.)

## What is kept between launches, and what deliberately is not

Everything in this game is generated at boot, and none of it varies: one seed,
no input, the same street every time. So it is built once and kept —
`texcache.js` for the procedural surfaces, `meshcache.js` for geometry and the
navigation grid, both in the app's own `gifos.db`, both written AFTER the Play
button lights so nobody waits on the write.

Every hook they use is patched into the vendored engine by `vendor.mjs`, and
every patch defaults to upstream's exact behaviour when the hook is absent.

| kept | rebuilt | restored |
|---|---|---|
| viewmodel geometry (merged + mask-baked, per assembly) | 1320 ms | 429 ms |
| the three soldier variants (one skinned geometry each) | 538 ms | 3 ms |
| the nav grid + 1353 cover points (~340 KB, and it is data, not geometry) | 488 ms | 1 ms |

Warm launch on a fleet box, end to end: **8.7 s → 8.3 s** (READY 7679 ms →
7156 ms).

**And an honest asterisk on that total.** A/B'd on one box, same profile, same
texture cache, same compiled-shader cache, minutes apart: 2.4 s of work goes
away and `READY` moves by a fraction of it. The rest reappears in
`AiSystem.prewarmMaterials`, which goes from 406 ms to 2282 ms — on a machine
with no graphics chip the boot after the world is bounded by shader compilation
in the GPU process, and the CPU work removed here is what used to overlap it.
The geometry cost is gone; the wall clock is now waiting on something else.
That something else is the biggest item left in front of the Play button, and
it is the same shape of problem `boot.js` already solved for `COD.prewarm` by
not making anybody wait for it.

**Never materials.** Every material is procedural: its maps are rendered on the
GPU into render targets and its shader is rewritten at runtime by
`render.patcher`. A restored soldier calls upstream's own `resolveMaterials()`
and a restored viewmodel calls `mats.get(matKey)`, exactly as a fresh one does.
Geometry is cached; the look of it is always rebuilt.

**Not the world**, and the reason is a measurement rather than an opinion. The
street is the biggest single item in the boot and the seam is real — but its
603k static triangles plus 7989 instances weigh **61.6 MB** of attribute data,
measured, against 7.1 MB for everything above and 5.1 MB for the whole texture
cache. That is what would have to cross the sandbox bridge into a phone's
IndexedDB, and stay there, to buy back ~3.4 s. The figure is re-measured on
every run and reported as `mesh.worldMB`, so the decision can be re-argued
against a number rather than a memory. Caching it well needs its own storage
design — chunking, quantised positions, a real eviction budget — and that is a
different piece of work.

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
- **Tab is the scoreboard, not the weapon swap.** Upstream binds Tab to
  swapWeapon alongside 1 and 2; this app binds it to the scoreboard and tells
  you to hold it, so the two readers of upstream's binding table are wrapped to
  drop Tab from that one action. 1 and 2 still swap.
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

Guarded by `test/browser/e2e-fps-simple.js` (its solo half boots from the real
GIF and locks the pointer anywhere; its deathmatch half declares **NEEDS-FLEET**
and takes a machine per player, because presence is published from the engine's
own update and two 3D browsers on one box render at about a frame a second —
every timing it depends on would otherwise be a timing about that box),
`test/browser/e2e-fps-touch.js` (the thumb controls) and
`test/browser/e2e-pointer-lock.js` (the capability itself).

**What no suite can answer, and a person has to.** Whether 6 Hz feels like
gliding or like lag when you try to lead a shot; whether the left pad sits
under a thumb on a phone with a notch, in both orientations, and whether
`LOOK_GAIN` (1.7) is right for a real finger; whether Esc releases the pointer
on Safari 17 and Firefox as reliably as it does on Chrome. The suites guard the
mechanisms underneath all three.

## Licences

Both MIT, and both notices are packed **inside** the GIF as well as living here,
because a copy of this app that someone was handed is a distribution of both
works: `vendor/COPYING-claude-of-duty.txt` and `vendor/COPYING-three.txt`.
Upstream's `package.json` says `ISC` while its `LICENSE` file says MIT; the
`LICENSE` file governs, and both are permissive in the same way regardless.
