# Production port plan — genesis-key relay + sealing + W6/H8

**Status: WIP on branch `prod-genesis-relay`. NOT merged. Needs coordinated relay+client
changes + e2e/swarm validation before it goes to `main` (auto-deploys).**

The C++ reference sim (`sim/mesh.cpp` + `sim/mesh_seat.inc` + `sim/topo.h`) is the
**spec**. Its design is ahead of production `site/meet.html` (mid mesh-refactor,
steps 0-4 landed). This plan ports the deltas. The canonical laws are
`docs/healing-laws.md`.

Everything here is a **flag-day**: old and new clients land in different relay
behaviour, so it must ship as one coordinated change (relay + client together).

---

## 1. Relay (`relay/src/relay.js`) — zero-knowledge greeter registry (R2/R3)

Today the relay's greeter surface is the **live-socket roster** (`members()` /
`roster()` / `broadcastRoster()`). Replace the *greeter* semantics (NOT the
signaling/routing sockets — keep `{t:'peer'}`/`{t:'gossip'}` as-is) with a
per-session **stored registry**, keyed by the session id (already the hashed URL):

- Durable-Object storage per session: `{ gkHash: <hex H(genesisKey)>, greeters: Map<entryId, {blob, exp}> }`
  where `blob` = `Seal(K, address)` (opaque to the relay), `exp` = tick/ms TTL.
- **Knock** message `{t:'knock', key:<presentedKey>, entry:<Seal(K,addr)>}`:
  1. GC expired greeters; if the map is now empty, clear `gkHash`.
  2. Return the current sealed `greeters` blobs (shuffled) to the knocker.
  3. Admit: if the map was empty → `gkHash = H(key)`, add this entry (mint genesis).
     Else if `H(key) === gkHash` → add/refresh this entry (proven member). Else → don't add.
  - Cap at `C²+C` entries (existing `MAX_SOCKETS_PER_SESSION`). Reject-and-retry when full.
- Relay stores ONLY `gkHash` + sealed blobs + TTLs. No plaintext address, no
  seated/coord/home state, no arbitration. Cf. sim `relayKnock()` in `sim/mesh.cpp`.
- **Hibernation:** the registry must survive DO hibernation → put it in DO storage
  (or rebuild-tolerant). The current model is hibernation-safe via socket
  attachments; the registry needs the same care.
- **Hash the key** at rest (store `H(genesisKey)`, compare `H(presented)`), so a relay
  breach yields nothing usable. Present the key over TLS for v1; a nonce-HMAC
  challenge is a later hardening (do NOT use `MAC(K,inst)` — URL-computable = false trust).

Update fake relays + tests: `test/relay-local.js`, `test/fake-keyapi.js`,
`test/e2e-relay.js`, `test/relay-privacy.js` (privacy now also covers sealed greeters).

## 2. Client crypto/derivation (`site/js/gifos-net.js`)

- Derive the sealing key **K** from the meeting URL — this is the SAME meeting E2E
  key already derived (`deriveMeet`, label `meet-e2e-pw` / DS tag). No new secret.
- `Seal(K, address)` / `Open(K, blob)` for greeter entries (reuse the existing
  AES-256-GCM envelope). The relay never sees plaintext addresses.
- Genesis key = a per-occasion random (throwaway) value the founder mints; every
  member learns it during the newcomer dance (carried in the HOME reply, sealed
  under K). Store per-meeting; present it on E3 re-knock.

## 3. Mesh protocol (`site/meet.html` STADIUM section) — the big one

Bring the STADIUM mesh in line with the cpp sim. Port these, each named to its law:

- **Relay interaction (R2/R3/E3):** knock presents `myKey` (newcomer) or `genKey`
  (seated Section-1 member re-knock); empty greeter list ⇒ mint + found `('',0,0)`;
  learn `genKey` from the greeter's HOME reply; re-knock with `genKey` on seating.
  Drop any founder/roster-arbitration the relay used to do.
- **`ckey(0,0,0)==0` guard fixes (CRITICAL):** anywhere a coord-key of a *phone/owner*
  target is tested truthy (`if(tock && …)`, `if(oCk && …)`), fix it — `/0.0` is a
  real coord, not "unset". This bug (just fixed in the sim) silently breaks
  Section-1 row-0 healing and mints ghost owners. Audit meet.html for the same
  pattern.
- **W6 cousins-in-PONG:** S1SYNC carries each cell's `childOf`; an owner teaches its
  down-child (and row-mates) the heirs at its future owned-links.
- **H8 whole-section-death:** a head whose owner cell is dead + owner-row empty +
  cell-below empty heals it by FINDLEAF-ing a LEAF from its own subtree (head
  stays), wired by cousins. Relay-free Section-1 reconstruction.
- Confirm H1-S1 / H2 / H7 / C1-C3 / E1-E2 / W1-W5 match `docs/healing-laws.md`.

**Testing:** there is no JS sim harness anymore (Node sim retired). Validate via
the e2e suite (`test/e2e-rows*.js`, `e2e-autoheal`, `e2e-meet-*`) and then the
**home-LAN swarm** (`test/swarm.js`, tailnet recipe in memory `swarm-test-plan`):
run the real mesh on Pis/Jetsons/phone against `test/relay-local.js`, scaling up,
watching the `[diag] bot` row/faces/fold output. The swarm IS the scale validation
that the retired JS sim used to provide.

## Order of operations
1. relay.js registry + fake-relay/test updates → e2e-relay green.
2. gifos-net.js sealing + genesis-key derivation.
3. meet.html mesh: ckey-guard audit → R2/R3/E3 knock → W6 → H8. e2e green after each.
4. Home-LAN swarm smoke (a few bots) → scale up → then AWS per `swarm-test-plan`.
5. Merge `prod-genesis-relay` → `main` only after the swarm holds.
