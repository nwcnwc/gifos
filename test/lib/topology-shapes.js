/*
 * topology-shapes.js — the identifiers that are SHAPES, not names.
 *
 * A hostname can only be recognised by comparing against the local, never-
 * committed hosts file (see test/unit/no-topology.js for why the repo must
 * never learn them). These four are different: they are patterns, so they can
 * be written down here safely, and they work on a box with NO hosts file at
 * all — which is exactly the box where the name check goes quiet.
 *
 * TWO CALLERS, ONE COPY. test/unit/no-topology.js scans the tree with these at
 * gate time; scripts/hooks/commit-msg scans a draft commit message with them at
 * write time. That split is deliberate (a file can be edited, a pushed message
 * needs a history rewrite) but the PATTERNS must not drift apart — a shape the
 * gate rejects and the hook waves through is the worst of both.
 *
 * A bot token is not an identity, it is a live credential. It is in this list
 * because the cost of it reaching the public web is not embarrassment.
 */
'use strict';

const SHAPES = [
  ['a tailnet address (100.64/10)', '(^|[^0-9.])100\\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\\.[0-9]{1,3}\\.[0-9]{1,3}([^0-9]|$)'],
  ['a tailscale magic-dns name', '[a-z0-9-]+\\.[a-z0-9-]+\\.ts\\.net'],
  ['a telegram bot token', '[0-9]{8,10}:[A-Za-z0-9_-]{30,}'],
  // A serial is matched WHERE IT IS USED, not by its shape: a bare
  // `[A-Z]{2}[0-9][0-9A-Z]{6,}` also describes half the identifiers in a
  // minified bundle, and it flagged 29 vendored libraries on its first run.
  // `adb -s <serial>` cannot be a false positive, and a placeholder
  // (`adb -s <phone-a-serial>`) does not match because `<` is not in the class.
  ['a device serial handed to adb', 'adb +(-[a-z] +)*-s +[A-Za-z0-9]{6,}'],
];

// Line-by-line, so a caller can say WHERE. Never returns the matched text —
// the whole point is that this output is safe to paste into an issue.
function scanLines(lines) {
  const hits = [];
  lines.forEach((line, i) => {
    for (const [what, re] of SHAPES) {
      if (new RegExp(re, 'i').test(line)) { hits.push({ line: i + 1, what }); break; }
    }
  });
  return hits;
}

module.exports = { SHAPES, scanLines };
