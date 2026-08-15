# Keeping a provider warm across tabs

Raised 2026-08-15, after the warm-up indicator shipped and made the wait
*visible* rather than shorter. Nothing here is decided. This is the write-up of
one question — **can an on-device model stay loaded across app tabs, and should
it?** — including the part where the answer might be "no, fix something else."

## 1. What is actually slow, and how often

A provider is mounted **per tab**: `providerServices` is a Map in the
`runtime.js` module (`fileId -> Promise<{call}>`), so it lives and dies with the
page. Apps open in their own tab — `root.open('run.html#id=…', '_blank')`
(`desktop.js:1437`) — so every app tab that asks for AI mounts its own hidden
provider iframe, boots its own wasm engine, and loads its own copy of the
weights.

Gemma 3's pinned GGUF is 769 MB. Two app tabs asking for `cheapest` therefore
hold **two** copies resident, and each paid the full load to get there.

That is the whole of the problem statement. Note what it is *not*: the weights
are already cached on disk (`appassets`, Blob-backed, verified once at install),
so this is not a download problem. It is an engine-instance problem.

## 2. The rule this would break

From [`providers.md`](providers.md) §"How a provider serves", written when the
feature shipped:

> a **hidden sandboxed iframe inside the consumer's own tab** … No shared
> provider tab, no cross-tab RPC: isolation stays structural, and a dead
> consumer tab cleans up its own provider instance. The cost (one engine
> instance per consuming tab) is the price of not inventing a new trust path.

So this is not a missing feature. It is a decision, taken deliberately, that
would have to be re-taken. Anything below that quietly erodes "isolation stays
structural" should be rejected on that basis alone.

## 3. Route A — a SharedWorker. Ruled out.

The textbook answer, and it is fatal here.

A provider is **untrusted code out of a downloaded GIF**. Today it runs in an
iframe with `sandbox="allow-scripts allow-forms allow-downloads"`
(`makeIframe`, `runtime.js`) — an opaque origin, `connect-src 'none'`, no
IndexedDB, no capture. That sandbox is the entire reason the consumer's ack
sheet can truthfully say *nothing leaves this browser*.

A SharedWorker runs **at `gifos.app`**, with `fetch` and IndexedDB. There is no
opaque origin inside a worker and no way to build one: workers have no sandbox
attribute, no CSP of their own worth the name, and no equivalent of a null
origin. Moving a provider there would hand a downloaded model file the whole
computer's storage and a way off the device, to save a minute of loading. The
hard rule in `providers.md` ("providers are network-less… refused
mechanically") would become unenforceable.

Browser support is not the deciding factor and should not be argued as one.
There is also a secondary practical problem — wllama mints its own worker from
a blob URL, and nested workers inside a SharedWorker are uneven — but the trust
argument settles it before that matters.

**Verdict: no. Not "hard", not "later". The sandbox is the product.**

## 4. Route B — one tab hosts the mount, the others ask it

The only shape that keeps the isolation intact.

The provider still runs in exactly the sandbox it runs in today. What changes is
*which tab's document* hosts that iframe, and that other tabs reach it by
message instead of by direct `postMessage` to a local frame.

**The new trust path is between GifOS's own runtime code in two tabs** — same
origin, same build, same user — and never between app code. A sandboxed app
cannot reach a `gifos.app` BroadcastChannel at all: its origin is opaque, and
BroadcastChannel is partitioned by origin. The app still calls
`gifos.ai.chat()` and still cannot tell where the answer came from, which is the
existing contract.

The transport already exists and is already namespaced per computer:
`store.syncChannel` and `store.appChannel(fileId)` are used for cross-tab store
sync today (`desktop.js`, `runtime.js`). A booted computer image runs against
`gifos_vm_<fileId>`, so a provider channel MUST be namespaced the same way or
two computers end up sharing one brain — which would be a genuine isolation
break, not a cosmetic one.

### 4a. Who hosts: elected, or the desktop?

**Election** (first tab to need a provider claims it, others route to it) is the
obvious design and mostly produces churn: every time the leader closes, the next
asker pays full price, and the failure mode is invisible ("why was it fast
yesterday?").

**The desktop as a fixed host** is stronger. `index.html` is the tab everything
opens *from*, so it is the one reliably still there, and hosting has no election,
no split brain, and one obvious lifetime: warm for as long as your Home Screen
is open. Cost: `index.html` does not load `runtime.js` today, so it would need
the provider half of it, and that tab would hold the 769 MB.

### 4b. What has to cross the channel

More than it would have a month ago, because streaming landed:

- **request** — role + `req`. Small.
- **provider-progress** — the warm-up notes, or the pill in the asking tab goes
  silent and the feature that prompted all this regresses.
- **provider-delta** — *every fragment, per token*. This is now a high-rate
  channel, not an occasional RPC.
- **result** — `{text}` for chat; for `tts`/`image` it is **bytes**, which
  structured-clone across as a copy.

And the idle clock comes with it: `PROVIDER_CALL_MS` is re-armed by progress and
delta, so **a dropped relay reads as "wedged" and kills a generation that is
working fine**.

## 5. What it actually buys

**Memory, more than latency.** Two AI tabs today is two resident copies of the
weights; on a phone that is not a slow wait, it is a tab crash. One instance is
the real prize.

**Latency second — and streaming already took the worst edge off it.**
`ctx.delta` means an answer now *starts appearing* while it is written; the
six-minutes-of-nothing case that made the load feel infinite is already gone. A
shared host removes a repeated wait; it no longer rescues a broken experience.

**And it only helps the second asker.** The first cold load in a session costs
full price no matter what. If the common usage shape is "open one app, ask, close
it", a shared host helps only in the desktop-as-host variant, and only while
that tab lives.

## 6. The four hard parts

1. **The host is, by definition, a background tab.** Phones freeze those
   aggressively — `runtime.js` already carries scar tissue about exactly this
   for sockets. A frozen host stops answering, the asking tab must fail over,
   and failover means paying the cold cost anyway. This is the one that could
   make the whole thing not worth building: the warm instance can evaporate
   precisely in the case it exists to serve.
2. **One engine, N askers, so requests queue.** wllama is a single instance;
   today two tabs generate in parallel (paying memory for it). A shared host
   serialises them, and tab B waits behind tab A with no way to know why. That
   is a behaviour change users will feel, not an implementation detail.
3. **Guard ownership.** `providerGuard` refuses a provider whose icon is not a
   direct child of `sys_providers`, reads `gifos_ai_config`, and raises the
   system setup modal on failure. If the host mounts on behalf of another tab,
   **which tab's guard decision counts?** The asking tab holds the user's
   assignment and should almost certainly stay the one that guards and the one
   that shows the modal — but that must be settled, not assumed.
4. **Lifecycle.** Host closes mid-request; two tabs both believe they host; the
   host's computer namespace differs from the asker's. Each needs a defined
   answer before any of this is safe.

## 7. What it is not

**Not a daemon.** No browser gives us a process that outlives the tabs. Close
every GifOS tab and the model is gone; "warm across tabs" can only ever mean
"while at least one tab lives". A Service Worker does not change this — it is
killed on idle, has no DOM to host a sandboxed iframe, and carries the same
origin-trust problem as §3.

## 8. Measure before building any of it

The OS now records per provider, per computer: `sys::provider-timing`, cold and
warm kept apart. What that does **not** yet tell us, and what would decide this:

- **The split inside a cold call** — blob read out of IndexedDB, versus wasm
  engine boot, versus llama.cpp allocating and parsing the model, versus first
  token. If the bulk is allocation, then a smaller quant, a lower `n_ctx`, or a
  different model buys more than any architecture here, for a fraction of the
  risk. This is a few lines on top of the existing `ctx.progress` phases.
- **How often two AI tabs actually coexist.** If the honest answer is "rarely",
  the memory argument (§5) mostly evaporates and only the desktop-host variant
  is worth anything.

## 9. Open questions

1. Is the desktop-as-fixed-host variant acceptable, given it puts ~800 MB in the
   Home Screen tab — the one tab a user never expects to be heavy?
2. Does tab freezing kill this outright on phones, which is where the wait hurts
   most? (Answerable with a measurement, on real devices, per
   `test/README.md` → "ONE BOX CANNOT ANSWER…".)
3. Is serialising concurrent askers acceptable, and if so what does the second
   asker see — "waiting for another app's question" is at least honest.
4. Where does the guard run, and where does the setup modal appear (§6.3)?
5. Does the per-token delta relay hold up as a BroadcastChannel load, or does
   streaming across tabs need batching — and does batching then undo the
   responsiveness streaming was added for?
6. Is any of this better than making the cold load cheaper, which is the
   comparison §8 exists to settle?
