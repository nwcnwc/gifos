# Research notes: P2P mesh literature (external reading — NOT a plan)

> **Status: EXPLORATORY READING ONLY. Nothing here is a decision, a design, a
> spec, or a roadmap item.** This file is a survey of what the outside academic
> and engineering literature says about peer-to-peer meshes, written down so we
> have shared context and vocabulary. It is *not* an instruction to build any of
> it. None of these ideas has been evaluated against GifOS's actual constraints,
> reviewed, or approved. Do **not** pick an item from here and start
> implementing it. Any change to the mesh is a deliberate act governed by
> `docs/healing-laws.md` (and, where derivations move, a flag day) — this
> document confers no such authority and skips all of that scrutiny on purpose.
> Treat every "GifOS angle" below as an **open question to think about**, never a
> requirement. When in doubt, this file is closer to a reading list than to
> `healing-laws.md`.

Context for the reading: GifOS is a browser-only, WebRTC, no-root ("rootless")
meeting mesh — a tree of C×C sections, self-healing "healing laws", tree gossip
for app traffic, folded media, and a zero-knowledge greeter registry for
bootstrap. The literature below was surveyed to see what's already known about
problems shaped like ours. Web fetches were blocked during the survey, so
quantitative figures come from search summaries of the cited primary sources
and should be treated as **approximate and unverified** until read in full.

---

## 1. Self-stabilizing overlay networks — the theory our healing laws echo

**What the field says.** "Self-stabilizing overlay maintenance" (Scheideler and
collaborators) studies exactly our problem: an overlay that returns to a correct
structure from *any* corrupted global state. Named results seen:
- **Re-Chord** (SPAA 2011): converges from any state in ≤ `c·n·log n` steps;
  once stable, a join costs O((log n)²) and a departure O(log n).
- **SKIP+** (JACM 2014): converges from any configuration in
  `3c·log n + log n + 2` rounds.
- **Ca-Re-Chord** (2013): a churn-resistant extension of Re-Chord.

**Ideas worth being aware of (not tasks):**
- The literature's defining stress test is recovery from *arbitrary global
  corruption*, not one clean fault at a time. Our laws are each written against a
  single named fault. Whether our design self-stabilizes from a globally
  scrambled state is an *open question* the reading raises, nothing more.
- Known theoretical hazards to keep in mind conceptually: **oscillation** (a heal
  that triggers another heal), and **split-brain under partition** — which CAP
  says is unavoidable, and which our R5 "surface the fork to a human, never
  auto-merge" already treats as a human-scale decision rather than a bug.

## 2. Epidemic broadcast trees & gossip — the Plumtree family

**What the field says.**
- **Plumtree / Epidemic Broadcast Trees** (Leitão, Pereira, Rodrigues, SRDS
  2007): an eager-push spanning tree for low-latency/low-redundancy delivery,
  plus a lazy-push gossip layer (IHAVE / GRAFT / PRUNE) that *repairs* the tree
  when nodes fail. The lazy layer also lets a node that *missed* a message
  discover it (by id) and pull it.
- **HyParView** (2007): churn-resilient membership with a small active view (~5)
  and larger passive view (~30); reportedly ~90% reliability even at 95% node
  failure within ~4 rounds.
- **Bimodal Multicast**: fast unreliable dissemination first, then a gossip
  anti-entropy phase to *mask omissions* — an early tree+gossip hybrid.
- General epidemic fact: gossip reaches all N in **O(log N) rounds**; eager push
  trades more redundant traffic for lower latency than lazy/pull.

**Ideas worth being aware of (not tasks):**
- The recurring theme is *gap recovery*: these systems let a lagging node notice
  and request what it missed, rather than relying only on being re-pushed to.
  Whether that property matters for us depends entirely on our app semantics —
  an open question, and one the separate code audit (below) looks at.
- Curiosity only: our C=5 row size coincides with HyParView's active view of ~5.

## 3. Application-layer multicast & live streaming — single-tree fragility

**What the field says.**
- **SplitStream** (Castro et al., SOSP 2003) exists *because* a single multicast
  tree is fragile: all forwarding load lands on interior nodes and any interior
  failure cuts its whole subtree. Its answer: split the stream into stripes over
  multiple trees, arranged so each node is interior in at most one tree.
- **Mesh-pull** systems (**CoolStreaming / DONet**, 2005): a node keeps multiple
  parents and pulls by buffer-map; more churn-resilient, at a latency cost.

**Ideas worth being aware of (not tasks):**
- The general lesson — a single forwarding parent is a single point of failure
  for everything below it — is a *thing to understand about tree-shaped media*,
  not a prescription for GifOS. How much it matters for us, and whether our
  healing speed already covers it, is unexamined here.
- **WebRTC full-mesh ceiling (engineering rule of thumb, low confidence):** ~3–5
  participants comfortable, ~8 max; per-node bandwidth scales as `K·(N−1)`, CPU
  saturates around 8–9 on weak machines. Mentioned only as background on why
  sectioning exists at all.

## 4. Browser / WebRTC & NAT traversal — measured connectivity

**What the field says (approximate figures, unverified).**
- Hole-punch success is commonly cited at **~82–95%** under favorable NAT mixes,
  and **~70% ± 7%** in diverse real-world conditions (recent IPFS/DCUtR-style
  measurement campaigns, 2025–2026); TCP much lower.
- End-to-end "direct from scratch" is *lower* than the raw hole-punch rate
  because address discovery / relay-reservation steps themselves fail (~29% in
  one IPFS study — that figure is DCUtR-specific and only loosely applicable to a
  STUN-only browser stack).
- Relays reportedly succeed **>95% even under CGNAT**.

**Ideas worth being aware of (not tasks):**
- These numbers are just *context* for the already-separately-tracked idea of a
  relay tier; they are not themselves a decision. They do suggest that "direct or
  nothing" leaves some fraction of peer pairs unable to connect — how large a
  fraction, for our actual user base, is unmeasured.

## 5. Rootless rendezvous & bootstrap — prior art for sealed discovery

**What the field says.**
- **libp2p rendezvous** (any node can serve as a rendezvous point) and
  **peer-exchange** (every node provides the "hub") are standard decentralized
  discovery patterns.
- A **"WebRTC Swarms"** paper (MDPI *Future Internet*, 2025) describes
  decentralized WebRTC signaling that hides *both* identities and IP addresses
  using designated-verifier zero-knowledge auth — conceptually close to a sealed
  greeter registry.
- Leaderless *founding* under partition is fundamentally hard (leader election
  under CAP/FLP): guaranteeing a single founder with zero coordination while
  partitioned is not achievable.

**Ideas worth being aware of (not tasks):**
- The sealed-rendezvous idea is *not unprecedented* — there is prior art to read,
  and possibly to cite, if we ever formalize our own security story. That is a
  research observation, not a suggestion to change anything.
- The CAP/FLP framing is reassuring background for *why* keeping a minimal
  coordination point for genesis is a reasonable engineering stance — again,
  context, not a directive.

---

## Where the reading suggests we may be in genuinely under-studied territory

The published work overwhelmingly assumes long-lived nodes, native sockets, and
large stable swarms (streaming to thousands). Our regime — browser sandbox, no
listening sockets, dozens of peers, human-scale sessions of minutes, high churn,
self-stabilizing tree + folded media — is comparatively uncovered; the closest
practical knowledge lives in engineering write-ups (Jitsi, mediasoup, libp2p),
not papers. **The takeaway is epistemic, not actionable:** for the classic parts
there is prior art worth reading before reinventing; for the browser-specific
parts, our own simulator is likely the best available instrument, and outside
results may simply not transfer. Deciding what, if anything, to *do* with any of
this remains entirely future work under the normal design discipline.

## Sources (as surveyed; read in full before relying on any figure)

- Re-Chord (SPAA 2011) — cs.uni-paderborn.de/.../KKS-SPAA11.pdf
- SKIP+ (JACM 2014) — dl.acm.org/doi/10.1145/2629695
- Ca-Re-Chord (2013) — cs.hhu.de (Kalman & Graffi, IEEE NetSys)
- Epidemic Broadcast Trees / Plumtree (SRDS 2007) — dpss.inesc-id.pt/~ler/reports/srds07.pdf
- HyParView (2007) — researchgate.net/publication/4261663
- P2P Video Streaming review (SplitStream / CoolStreaming) — arxiv.org/pdf/1304.1235
- WebRTC topology (Mesh/SFU/MCU) — antmedia.io/webrtc-network-topology
- WebRTC mesh stream limits — tensorworks.com.au/blog/webrtc-stream-limits-investigation
- Large-scale NAT-traversal measurement (DCUtR/IPFS) — arxiv.org/pdf/2604.12484
- Decentralized NAT traversal measurement (2025) — arxiv.org/pdf/2510.27500
- libp2p rendezvous spec — github.com/libp2p/specs/blob/master/rendezvous/README.md
- WebRTC Swarms: ZK designated-verifier signaling (MDPI 2025) — mdpi.com/1999-5903/18/1/13
