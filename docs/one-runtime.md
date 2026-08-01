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

1. `site/js/mesh-app.js` — the headless media-less mesh node factored OUT of
   `meet.html` (node bring-up, DC signaling glue, sponsor forwarding), consumed
   by the one room page for BOTH room kinds. No behavior fork between them.
2. The one room page + router rewrite; `run.html` / `meet.html` deleted.
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

Extraction before deletion, tests green at every commit on the branch:
mesh-app.js extraction → one page consuming it for meetings (parity) → app
rooms onto it (Invite mint, owner lane, succession) → A/V layer + postures →
delete star bus + strip relay + DS bump → full battery → merge.
