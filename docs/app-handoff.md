# App → app handoff: one typed document, on a shelf the OS owns

Ratified 2026-08-25 (Nathan). Shipped with the Financial Tracker
(`apps/finance/`), whose whole reason to exist is that the numbers it works
out belong in the Retirement Calculator.

Until now two GifOS apps had exactly three ways to be in touch, and none of
them is this:

- **The same room.** `gifos.db` mirrors ONE app's collections between the
  people running THAT app (`docs/cors-and-networking.md` Part 1). Two
  *different* apps are never in each other's session.
- **A link argument.** `gifos.launch()` carries what a link asked for —
  strings, capped at 2000 characters, "an intention, not a payload". Right
  shape for *open this note*, wrong shape for a summary of seven numbers, and
  it needs a link in the first place.
- **The user, retyping.** Which is what actually happens today, and is the
  thing worth removing.

What was missing is small and specific: **one structured document, produced by
one app, picked up by another, on the same computer.**

## The shape

```javascript
// The producing app
await gifos.handoff.offer('finance.plan', {
  currentAge: 45, netWorth: 412000, portfolio: 180000,
  annualSavings: 18000, annualSpend: 75000
});
// -> { ok: true }  |  { ok: false, reason: 'declined' }

// The consuming app, at boot
const h = await gifos.handoff.take('finance.plan');
// -> { kind, doc, from: { appId, name }, at } | null
```

```json
{ "handoff": { "offers": ["finance.plan"], "takes": ["finance.plan"] } }
```

The shelf holds **one document per kind, per computer**, in the OS's own state
(`sys::handoff`) — never in either app's storage, so neither app can reach the
other's `gifos.db` and nothing about this weakens the rule that an app's data
is its own.

## The four rules, and why each one is there

**1. The KINDS are the OS's, not the app's.** `HANDOFF_KINDS` in `runtime.js`
is a fixed vocabulary with first-party, human-written words. This is the same
call `docs/providers.md` makes about capabilities — *"third-party text does not
get to define what a checkbox means"* — and for the same reason: an app that
could name its own kind would be writing the sentence the user reads before
agreeing to it. Adding a kind is a deliberate edit to the OS, in three places
that must stay in step (`HANDOFF_KINDS` in `runtime.js`, `HANDOFF_LABELS` in
`gifos-perms.js`, and this document).

**2. The OS names the FIELDS too, and the document is rebuilt from that list.**
`handoffShape()` constructs the stored object from `spec.fields`, coercing each
one; it never copies the app's object. Anything the app included that GifOS did
not ask for is **dropped, not carried**.

This is the rule that does the most work, and it is worth being explicit about
why. The consent sheet shows the document — so the sheet is only honest if what
it shows is all there is. Had the app's object been stored as given and merely
*rendered* through the field list, the sheet would show seven tidy rows while
an eighth key rode along underneath, and the difference would be invisible to
exactly the person being asked. Filtering first makes the sheet honest **by
construction** rather than by anyone remembering to check.

**3. An offer is a VISIBLE act, every time.** Every `offer()` raises a sheet the
runtime owns — real origin, unfakeable, same standing as the capture indicator
— naming the app and **showing the document itself** before a byte is written.

There is deliberately **no remembered consent**. Every other permission in
GifOS is a standing yes to a *kind* of thing: the microphone records a clip,
and the next clip is the same promise. A handoff is a yes to *these numbers*.
A "don't ask again" would be agreeing to something not yet written, which is
not a thing anybody can mean.

**4. Owner mounts only.** A guest looking at a mirror of somebody else's app
may neither read this computer's shelf nor write to it. `offer()` refuses with
an error; `take()` quietly resolves `null`, because an app booting inside a
shared room should carry on rather than fail. An invite link is not a way to
ask a stranger's computer what it is worth.

## What it deliberately does not do

- **No addressing.** An offer is not sent *to* an app; it is put *on a shelf*
  where any app that declared that kind can take it. Addressing would mean the
  OS enumerating installed apps and reading their manifests to find candidates
  — a file read per app, on a path that must stay fast (`docs/providers.md`, on
  why `render()` may never read a file) — to produce a picker for what is
  almost always a set of size one.
- **No history.** One document per kind. The shelf is a hand-off, not a log; a
  second offer replaces the first.
- **No notification.** The consuming app finds the document when it next looks.
  A "Financial Tracker has something for you" surface is a real idea and is not
  built.
- **No back-channel.** `take()` is a read. The consumer cannot answer, and the
  producer cannot tell whether anyone took it. Two apps wanting a conversation
  are two apps that should be one app, or a room.

## The kinds that exist

| kind | what it carries |
|------|-----------------|
| `finance.plan` | `currentAge`, `netWorth`, `portfolio`, `illiquid`, `debts`, `annualSavings`, `annualSpend`, `asOf` — the numbers a retirement calculator opens on. No account numbers, no institution names, no transactions. |

Guarded by `test/unit/app-handoff.js` (the vocabulary stays in step across the
three files) and `test/browser/e2e-handoff.js` (offer → sheet → take, the
unknown-key drop, and the guest refusal).
