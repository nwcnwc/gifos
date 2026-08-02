# ONE runtime — the agreed design (Nathan, 2026-08-01)

The end state of roadmap §7, ratified in full. **No interim product states, no
backward compatibility** (pre-launch: no legacy links exist to honor). Built on
the `one-runtime` branch; lands on `main` as one green flag day.

## The model

**A room is a mesh session. Everything else is a component of it.**

- **Components:** the media plane (A/V + chat) and the app slot. Each is ON or
  OFF; each may be PINNED. Two traits minted with the room, immutable for its
  life: `appPinned`, `mediaPinned`.
- **The link is the promise.** `/join/<shortname>/…` promises the APP (app
  pinned, unmountable, the room IS the app); `/meet/<room>` promises the PEOPLE
  (media plane pinned, app slot free/swappable). Everything in roadmap §7's
  DO-NOT-LOSE list carries over verbatim: the shortname IS the room segment,
  `-anon` on unsigned apps is a security rule, `slug()`'s invariants are router
  invariants, `/join/<code>` self-healing links stay nameless by design, and a
  meeting mounting an app never adopts the app's address.

## The staged lifecycle (an app's journey)

1. **Run (solo).** `#id=<fileId>` — NO network object exists. No relay socket,
   no mesh, no room. The app runs locally against its icon's store. A persisted
   live link does NOT auto-rehost on boot (change from the old runtime): solo
   is solo until the human acts.
2. **Invite.** The room is MINTED: a media-less mesh room (headless node —
   control mesh + gossip, no camera, no packer). The inviter seats at genesis,
   mints the app OWNER key (Ed25519, `app-owner.js`), and app state rides the
   owner-signed snap/delta lane over the room's gossip — never a relay bus.
   App pinned; media plane OFF but available.
3. **Meeting mode (the extra step).** The media plane lights up IN THE SAME
   ROOM — no navigation, no second room, the address never changes. Strictly
   additive, and strictly per-person: the plane becoming available obligates
   nobody's camera (§7 carve-out: pinned/available is a ROOM affordance, never
   a personal obligation). Members who joined for the app see an explicit
   "N people are on camera — join the call?" affordance and stay dark until
   they tap. Blur/consent doctrine applies unchanged once they do.

A meeting-first room is the same object walked from the other end: media ON at
mint (pinned), app slot free.

## One room, one membership, two postures

There is ONE membership (seats) and ONE roster. "Invited to the app" vs
"invited into the meeting" are not two rooms, two rosters, or two relationships
with the room — they are two ARRIVAL POSTURES, set by which component the link
pins:

- A person's **relationship to the app** is the app's authority model — owner
  signature over state, manifest collection visibility, lead fence — identical
  regardless of which door they entered through.
- A person's **relationship to the people** is the room's — presence, blur
  consent, votes, open/admin class — also door-independent.
- The roster shows posture ("in the app" / "on camera"), never two lists.
- ONE link per room, forever. No separate "meeting invite" exists inside an
  app room; the room's address is its identity.

Presence-to-the-room (screen name, the honest network-address visibility) is
inherent in joining ANY room and is what an app invitee consents to by
clicking. A/V consent is separate, personal, and opt-in — and a quiet app room
growing a live call must be NOTICEABLE (banner), never silent tiles.

## Ownership and succession (replaces AUTO_TAKEOVER)

S4 per-participant identity (`mesh-identity.js` — LIVE) makes succession safe
to build now; the relay host-race is deleted.

- **Resilient / anyone-owns rooms (`/join/<code>`):** deterministic,
  S4-verified succession. When the owner's seat is confirmed gone (the mesh's
  own departure detection + a grace period), every seat computes the SAME
  successor — the lowest-seated participant holding a full state mirror. The
  successor mints a fresh owner key and announces it signed with its S4
  identity; every verifier re-pins on that signed, deterministic claim. No
  race, no impersonation, no server.
- **Owned / branded rooms (`/join/<shortname>/<verifier>/…`):** NO automatic
  succession — the verifier is the maker's trust anchor and never silently
  transfers. Writes freeze politely ("the owner is away"); reads/refresh
  continue from the retained snap; the owner returning (or explicitly handing
  off) resumes. The room survives as everyone's mirrors + the owner's GIF.

## One page

`run.html` and `meet.html` collapse into ONE room page backed by one runtime.
The `404.html` router maps both URL families to it; the entry decides only
`{appPinned, mediaPinned}` and the starting component set. The old pages die.
No thin-shell interim — the collapse happens now, pre-launch.

## One derivation (the flag day)

One room-derivation scheme for all rooms (the `deriveMeet` shape: sid, token,
E2E key, genesis registry — healing-laws R2/R3), one `DS` bump. `deriveJoin`
and the app-session star derivation are deleted. No dual-stack, no migration.

## The relay ends as greeter + door

Delete from the Worker: `t:'to'`, `t:'bcast'`, the client→host `from` forward,
`role:'host'`/`role:'client'` sessions, the owned-app host gate/epoch race, and
`AUTO_TAKEOVER`'s server side. (`t:'gossip'` already deleted 2026-08-01.)
What remains: `knock`, targeted `peer` signaling, and the signed door verbs
(`setpw`/`ban`/`unban`/`votekick`/`banlist`). The relay's header promise is
rewritten from "control traffic only" to greeter + door. Mirror every deletion
in `test/servers/relay-local.js`.

## Explicitly OUT of this build

- **W7 rook link-set** (home ring integrity): a mesh law change, sim-first,
  its own effort. This build leans on S4 (live), not W7.
- **S4's first-contact edge** (first-pin race / sybil at join) stays open, as
  documented in `mesh-identity.js` — succession claims are signed by pinned
  identities, so the edge is no worse here than for seat healing.

## Deliverables

1. **The room page IS the evolved `meet.html`** (reframed 2026-08-01, after
   tracing the seam). meet.html already runs the whole room core — mesh node,
   peer/DC machinery, §FWD sponsor forwarding, gossip, the app pane on the
   Stage lane, invite. Extracting its peer machinery into a separate
   `mesh-app.js` library for run.html to consume would be motion, not
   progress: under ONE PAGE, "no duplication" is achieved by having exactly
   ONE consumer of one mesh core — the room page, with the media plane simply
   never initialized when the room starts media-off. (A `mesh-app.js` module
   only appears if a genuinely page-free consumer materializes later, e.g.
   headless bots; none is needed for this build.)

   **run.html's unique surface migrates INTO the room page's app chrome:**
   - identity chrome: app GIF favicon/art, `appid` pill, `sig` (signature)
     pill, `perms` pill;
   - the Invite mint flow: link modal, lifetime picker, the owned-vs-resilient
     choice (which now also selects the succession class);
   - Steal (with the data-ride-along chooser) and Save-snapshot;
   - the mirror machinery (update-from-original / break-the-mirror);
   - boot entries: `#id=<fileId>` (solo, desktop store), `#j=<code>`,
     `#s=<shortname>.<verifier>&k=<code>`;
   - `tomeet` DIES — meeting mode is the in-room media toggle now;
   - `become-host`/Take Over DIES — replaced by succession.
   The runtime pieces these drive (stealApp, mirrors, lifetimeToSpec,
   sessionInfo, snapshots) already live page-agnostic in `runtime.js`.
2. The one room page + router rewrite; `run.html` deleted, `meet.html`
   renamed/kept as the room page (router maps both URL families to it).
3. Runtime: solo boot with no auto-rehost; Invite = room mint + owner lane
   (reusing `attachStageBus` / `bootClientBus` / `app-owner.js`); star-bus
   host/client code (`becomeHost` sockets, `bootClient`, mirrors of it) deleted.
4. Succession per room class, S4-signed, deterministic.
5. The A/V opt-in layer + posture roster in app-pinned rooms.
6. Relay stripped; local relay mirrored.
7. DS bump.
8. Tests: a multi-participant app-sync e2e over the mesh (host writes, guests
   converge, ZERO relay data frames — the test `app-mesh.md` demanded), a
   succession drill (owner killed → deterministic takeover → writes resume;
   owned room → freeze), an app-room-grows-a-call e2e (posture, opt-in, no
   silent camera), and re-greening of every existing meet/app suite. All
   reachable from `test/batteries/`.

## Engineering order (internal only — the PRODUCT lands whole)

Every commit on the branch green; the product cut only lands on main whole.

1. **Traits + entries on the room page:** meet.html learns
   `{appPinned, mediaPinned}` and the app-entry hashes (`#id=`, `#j=`,
   `#s=&k=`). `#id=` boots the app SOLO — no room, no relay, no mesh, no
   auto-rehost.
2. **Invite = room mint** in an app-pinned room: mint sid/key via the ONE
   derivation, boot the (media-off) mesh, owner lane via
   `attachStageBus`-style binding to the room's own gossip — clients arrive
   through `bootClientBus` semantics. The lifetime/resilience mint chrome
   migrates here.
3. **App chrome migration** (pills, Steal, Save, mirrors) into the app pane;
   app-pinned layout (app front-and-center, no unmount affordance).
4. **Media plane off-at-start + the opt-in call layer** (banner, postures in
   the roster) for app-pinned rooms; media-pinned rooms unchanged.
5. **Succession** (S4-signed deterministic takeover; owned rooms freeze).
6. **Delete** run.html + the star bus (`bootClient`, `becomeHost` sockets,
   `openHostSocket`, AUTO_TAKEOVER) → **strip the relay** to greeter + door
   (mirror in relay-local) → **DS bump** → router rewrite.
7. Full battery green → merge to main as the flag day.

## STAR VESTIGE STILL IN THE TREE: `need-app` (found 2026-08-02, NOT yet removed)

One-runtime deleted the star everywhere except one edge, and it survived because
nothing tested a room with more than one guest.

**What it is.** The app bytes are broadcast by the owner ONLY in reply to a
client's `need-app` request (`runtime.js`: `askApp()` → owner's
`m.kind === 'need-app'` → `sendAppBytes()`). Every joiner therefore DIALS THE
HOST for the file. That is the star pattern: it makes the owner — typically a
phone — an origin server for every guest who ever arrives, and it cannot scale
to a large room.

**Why it is also broken today.** The request rides the same stage channel as
everything else, and `sgaFan` sends only to peers whose DataChannel is ALREADY
open, dropping the frame for everyone else. A just-seated guest has no open
channel, so its asks vanish. Measured on one box: a guest sent five asks
(0/301/902/2103/4504 ms) while the owner's ledger read `asks=0`. Across three
machines, 14 sequential guests produced only 10 mounts, with 20-36s stalls.
`e2e-perms-share`'s long-standing "~40% flaky" was this bug all along.

**What has landed** (`meet.html`): the app frame is now RETAINED on every node
that receives it (`sgaApp`) and pull-served peer-to-peer — `sga-appreq` /
`sga-app`, mirroring the retained snap's `sga-req` / `sga-snap` pull-through,
including the "hold nothing, remember who asked, chase upstream myself" step.
The owner seeds itself in `broadcast()`, so it answers as an ordinary holder.
Undeliverable self-originated stage frames are also queued and flushed on the
next `dc.onopen` instead of being dropped. Successful mounts went 4.6-6.3s →
1.7-2.9s.

**What is NOT done.** Deleting `need-app` outright. I tried it in the same
session — owner seeds once at attach via `sendSnap().then(sendAppBytes)`, client
`askApp()` removed entirely — and ALL 8 guests then failed with empty traces
(no snap, no app), i.e. the peer-pull did not carry the load on its own. It was
reverted rather than left broken. The likely gap is that a guest with no open
channel cannot send `sga-appreq` either, so SOMETHING must re-drive the pull
when a channel finally opens; the `dc.onopen` flush covers frames already
queued, not a chase that never got to send. Fix that, then delete `need-app`.

**The guard:** `test/browser/e2e-approom-serial-guests.js` — 8 guests one after
another, all must mount. It is RED at 5/8 and is the acceptance test for the
work above. Reproduce across machines with `test/tools/approom-host.js` +
`approom-join.js` (see test/README.md "ONE BOX CANNOT ANSWER...").
