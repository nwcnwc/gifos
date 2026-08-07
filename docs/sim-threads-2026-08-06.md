# `--threads` in the C++ sim: the TELEPORT detonation is a FALSE POSITIVE (2026-08-06)

**The question.** The scale audit (docs/scale-audit-2026-08-06.md § 6) reported
that `./mesh --service --threads=4` core-dumps on the TELEPORT assertion at
N=2000, tick ~128, 5/5 on two machines, while the same seed is clean 5/5
single-threaded. It flagged two readings and refused to guess between them:

- **(a)** an instrumentation/threading artifact in the harness — the assertion
  reads shared state without the discipline the mutators hold; or
- **(b)** a genuine race in the protocol that the deterministic single-threaded
  path cannot express — which would be a PRODUCT finding, because concurrency
  is what real life does, and would outrank everything else in that audit.

**The answer is (a), and it is not a close call.** Concurrency is not involved
at all. Below is the evidence, then the two separate harness defects the
investigation turned up — the second of which is worse than the one that
started it.

---

## 1. The decisive experiment: deferral WITHOUT concurrency

`Seat::emit` (`mesh.cpp:745`) has two paths:

```cpp
if(PAR){ tlsOut[curTid()].push_back({id,to,m}); } else { Msg mm=m; schedule(id,to,move(mm)); }
```

Serial goes straight to `schedule()` → `classifyEmit()` — adjacency is judged
**inline, at the moment of the send decision**. The parallel path buffers, and
`classifyEmit` runs later, in `flushTls()` (`mesh.cpp:968`), **after the whole
tick's work is done**.

So the hypothesis is: the assertion judges adjacency at FLUSH time for a send
decided at EMIT time. To test it with concurrency removed entirely, I made
`doTick` take the buffered path with **one** thread — same deferral, zero
parallelism, no second thread in the process:

```cpp
if(NTHREADS>1 || getenv("MESH_FORCE_PAR")){ doTickPar(); return; }
```

Same binary, same seed (`--det`, N=2000), the only difference being which path
the frames take:

| path | threads | teleports | adjacent AT EMIT | non-adjacent at emit | seated |
|---|---|---|---|---|---|
| serial (inline classify) | 1 | **0** | — | — | 2000/2000 |
| buffered (deferred classify) | **1** | **2,155** | **2,155 (100%)** | **0** | 2000/2000 |

**One thread. No concurrency. 2,155 teleports.** The detonation is produced by
*when* the assertion is evaluated and nothing else.

## 2. The same result across every threaded configuration

I stamped each buffered frame with the adjacency verdict computed at emit time
(`Pend.adjE`) and tallied every teleport instead of halting on the first
(`MESH_TELE_SOFT=1`, which keeps `ROUTE_ENFORCE` semantics intact — unlike
`--allow-teleport`, which reverts to the perfect bus and changes the régime):

| build | threads | seated | teleports | adj@emit | **non-adj@emit** |
|---|---|---|---|---|---|
| `-fopenmp` | 1 | 2000/2000 | 0 | 0 | 0 |
| `-fopenmp` | 2 | 2000/2000 | 2,112 | 2,112 | **0** |
| `-fopenmp` | 4 | 2000/2000 | 2,472 | 2,472 | **0** |
| no `-fopenmp` | 1 | 2000/2000 | 0 | 0 | 0 |
| no `-fopenmp` | 2 | 1000/2000 | 372 | 372 | **0** |
| no `-fopenmp` | 4 | 500/2000 | 93 | 93 | **0** |

**5,049 teleports across every configuration. Every single one was adjacent at
emit. Not one frame was ever genuinely non-adjacent when the send was made.**

Note also the `seated` column on the `-fopenmp` rows: **2000/2000, dups=0,
s1cells 25/25 at 2 and 4 threads.** The protocol converges perfectly well under
genuine concurrent execution. Reading (b) has no support anywhere in the data.

## 3. Why the verdict flips between emit and flush

The invalidating write is usually the **sender's own**, later in its own tick.
A seat emits at step 1 and mutates its own `occ` at step 2 (an E2 resolution, a
LEAVE, a heal) — all inside one `recv`/`tick`. Serial classified at step 1;
buffered classifies after step 2. The frame types confirm it: the tally is
dominated by `YIELD` (592), `ROUTE` (700), `PHONE` (694), `LEAVE` (196) — the
E2/duplicate-resolution and routing traffic, i.e. exactly the frames sent while
a cell's occupancy is being decided.

The first detonation in both builds is the same shape:

```
TICK=123  msg=YIELD  FROM #44 coord=(0,3,0)  TO #168 coord=(1,3,0)
   FROM's owned links:  (1,3,0) -> #57          <-- flush-time view
   ADJACENT-AT-EMIT: YES — the send was LEGAL when it was made
```

`#44` sent a YIELD to `#168` while its occ said `(1,3,0) -> #168`; by flush time
E2 had resolved that duplicate and its occ said `#57`. Emit-time is the
physically correct moment — a frame handed to a DataChannel is *gone*; a link
that dies afterwards does not retroactively make the send a teleport.

## 4. The worse defect found on the way: `--threads` without `-fopenmp` silently simulates 1/N of the room

**`-fopenmp` appears nowhere in this repo.** Every documented build line — the
sim README, and all ten `test/sim/repro-*.sh` / `scale-frontier.sh` scripts — is
`g++ -O2 -std=c++17 -o … test/sim/mesh.cpp`. Without that flag `_OPENMP` is
undefined, `curTid()` is hardcoded to 0, and `#pragma omp parallel` is silently
ignored by the compiler. `doTickPar` then executes its body **once, as thread
0**, and:

- `actBuf[1..NTHREADS-1]` — never ticked;
- `inboxBuf[1..NTHREADS-1]` — never delivered, and already removed from the bus
  by `bus.erase(it)`, so those frames are **destroyed**.

Measured, and the numbers are exact:

| N | threads | seated |
|---|---|---|
| 2000 | 2 | **1000** (= N/2) |
| 2000 | 4 | **500** (= N/4) |
| 200 | 4 | **50** (= N/4) |

And per-seat at N=200, `--threads=4`: ids 0, 4, 8 are `seated`; ids 1, 2, 3 are
`joining` **forever**. Every id in the teleport dumps is ≡ 0 mod 4.

This is the more dangerous defect. It does not crash loudly — it produces a
plausible-looking run of a quarter of the room. Anyone who had used `--threads`
as documented to "go faster at big N" would have measured a different room than
the one they asked for.

## 5. And even built correctly, the parallel path is unsound

ThreadSanitizer (`-fsanitize=thread -fopenmp`, N=300, `--threads=4`):
**1,613 data-race reports.** The application-level ones are real, not allocator
noise — chiefly `Seat::emit` reading the **target** seat's `hasCoord`, `coord`,
`socketed()` and `gateway` (`mesh.cpp:745` and the `ROUTE_ENFORCE` arm above it)
while that seat's owner thread is mutating them, plus `Seat::recv`
(`mesh_seat.inc:1280/1283`) and the `doTickPar` shard bookkeeping.

The shards are not independent, so the comment above the threading block —
*"seats are independent within a tick … no shared reads between seats"* — is
false as written. `emit()` has always consulted the destination seat.

## 6. What was changed

`test/sim/mesh.cpp` now **refuses** `--threads>1` with a non-zero exit and an
explanation, rather than warning. A silently-quartered room looks exactly like a
real run, and a warning on stderr in a 400-second job is not a guard.

Nothing else changed. The single-threaded path — every gate, every number in
every repro script — is untouched and byte-identical; `--threads` was used by no
gate (`grep -rn "threads=" test/sim/*.sh test/batteries/*.sh` → nothing).

**To make `--threads` real** (nobody needs to today — N=20000 converges in ~8
minutes serially): classify at emit time under `PAR`, and either lock or
re-shard the cross-shard reads in `emit()` so a seat never reads another
shard's live fields. Both are required; the first alone would only make an
unsound mode stop complaining.

## 7. Consequence for the scale audit

`docs/scale-audit-2026-08-06.md` § 6 is **answered: reading (a)**. There is no
product finding here and no hidden protocol race — on the contrary, the
correctly-built parallel runs converge 2000/2000 with dups=0, which is the
first (weak, race-caveated) evidence we have that the seating protocol tolerates
concurrent execution at all. Every measurement in that audit was taken on the
single-threaded path and stands unaffected.

---

*Provenance note: the content of this document, the `--threads` guard in
`test/sim/mesh.cpp`, and the § 6 stamp on the scale audit were all committed —
accidentally, by a concurrent agent working in the same clone — under commit
`767a57e` ("relay-local: speak production's policy close codes"), whose message
describes none of them. Recorded here because the commit log is the thing this
project treats as valuable, and grepping the history for this investigation
would otherwise lead somewhere baffling.*
