/*
 * gifos-purse.js — what this computer bought, what it spent, what it agreed to.
 *
 * The OS's own record keeping for the selling direction (docs/payments.md
 * §Apps that sell). Three things, all held by the OS and NONE of them by the
 * app:
 *
 *   ENTITLEMENTS  what was bought, keyed (appId, sku). The app asks; it does
 *                 not remember — because app state travels INSIDE the app's
 *                 GIF, so an app-held entitlement would be handed to everyone
 *                 the GIF is ever shared with.
 *   LEDGER        append-only record of every charge, for Settings and for the
 *                 user's own answer to "what did this app take from me?".
 *   PERMISSIONS   a Spend Permission envelope for subscriptions: a cap, a
 *                 period and an expiry the human signed once, against which
 *                 renewals are checked.
 *
 * PURE over an INJECTED store, so all of it unit tests in Node with a Map and
 * runs in the browser over IndexedDB. The store interface is deliberately tiny:
 *   { get(k) -> v|undefined, set(k, v), del(k), keys() -> [k] }
 *
 * Attaches to `GifOS.purse`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (GifOS.purse) return;

  const ENT = 'pay.ent:';    // pay.ent:<appId>:<sku>      -> receipt
  const LED = 'pay.led:';    // pay.led:<appId>:<seq>      -> entry
  const PERM = 'pay.perm:';  // pay.perm:<appId>           -> permission
  const PREFIXES = [ENT, LED, PERM];

  const big = (v) => BigInt(v || 0);

  // ---- THE RULE THAT PROTECTS EVERYTHING ELSE --------------------------------
  // Nothing here may ever leave this computer inside a GIF or a backup. An
  // entitlement that travelled would be a purchase given away with a share; a
  // ledger that travelled would be a spending history handed to a stranger.
  // Export paths ask this, and it answers for every key we own.
  function isExportable(key) {
    return !PREFIXES.some((p) => String(key).startsWith(p));
  }
  function redactForExport(keys) { return (keys || []).filter(isExportable); }

  function make(store) {
    if (!store || typeof store.get !== 'function') throw new Error('gifos-purse: needs a store');
    const g = (k) => store.get(k);
    const s = (k, v) => store.set(k, v);

    // ---- entitlements --------------------------------------------------------
    const entKey = (appId, sku) => ENT + appId + ':' + sku;
    function entitled(appId, sku) { return !!g(entKey(appId, sku)); }
    function grant(appId, sku, receipt) {
      if (!appId || !sku) throw new Error('gifos-purse: an entitlement needs an appId and a sku');
      // Idempotent: re-granting the same sku must not create a second purchase.
      if (entitled(appId, sku)) return g(entKey(appId, sku));
      s(entKey(appId, sku), receipt || { at: null });
      return g(entKey(appId, sku));
    }
    function entitlements(appId) {
      const pre = ENT + appId + ':';
      return store.keys().filter((k) => k.startsWith(pre)).map((k) => k.slice(pre.length));
    }

    // ---- ledger (append only) -----------------------------------------------
    function record(appId, entry) {
      const seq = store.keys().filter((k) => k.startsWith(LED + appId + ':')).length;
      const key = LED + appId + ':' + String(seq).padStart(6, '0');
      if (g(key) !== undefined) throw new Error('gifos-purse: ledger entries are append-only');
      s(key, Object.assign({ seq }, entry));
      return key;
    }
    function history(appId) {
      const pre = LED + appId + ':';
      return store.keys().filter((k) => k.startsWith(pre)).sort().map((k) => g(k));
    }
    function spentTotal(appId) {
      return history(appId).reduce((t, e) => t + big(e && e.amount), 0n);
    }

    // ---- spend permissions (subscriptions) ----------------------------------
    // What the human signed: an envelope, not a blank cheque. `periodMs` is the
    // window the cap applies to; `expiresAt` is when the whole agreement dies.
    function grantPermission(appId, p) {
      const cap = big(p && p.cap);
      if (cap <= 0n) throw new Error('gifos-purse: a permission needs a positive cap');
      if (!p.periodMs || p.periodMs <= 0) throw new Error('gifos-purse: a permission needs a period');
      if (!p.expiresAt) throw new Error('gifos-purse: a permission must expire — an endless one is a blank cheque');
      const perm = {
        cap: String(cap), periodMs: p.periodMs, expiresAt: p.expiresAt,
        signedAt: p.signedAt || null, payee: p.payee || null,
        windowStart: p.signedAt || 0, spent: '0',
      };
      s(PERM + appId, perm);
      return perm;
    }
    const permission = (appId) => g(PERM + appId) || null;
    function revoke(appId) { store.del(PERM + appId); return true; }

    /**
     * May this renewal be taken WITHOUT asking the human again?
     * Returns { allowed, reason?, permission } and does NOT mutate — commit()
     * is separate, so a refusal can never half-spend.
     */
    function checkPermission(appId, amount, nowMs) {
      const perm = permission(appId);
      if (!perm) return { allowed: false, reason: 'no spend permission was granted for this app' };
      if (nowMs >= perm.expiresAt) return { allowed: false, reason: 'the spend permission expired', permission: perm };
      const amt = big(amount);
      if (amt <= 0n) return { allowed: false, reason: 'amount must be positive', permission: perm };
      // Roll the window forward if we are past it: a monthly cap is per month,
      // not for all time.
      let windowStart = perm.windowStart, spent = big(perm.spent);
      if (nowMs - windowStart >= perm.periodMs) {
        const skipped = Math.floor((nowMs - windowStart) / perm.periodMs);
        windowStart = windowStart + skipped * perm.periodMs;
        spent = 0n;
      }
      if (spent + amt > big(perm.cap)) {
        return { allowed: false, reason: 'this renewal would exceed the ' + perm.cap + ' the user agreed to for this period', permission: perm };
      }
      return { allowed: true, permission: perm, windowStart, spentAfter: String(spent + amt) };
    }

    // Commit only what checkPermission just approved.
    function commitPermission(appId, decision) {
      if (!decision || !decision.allowed) throw new Error('gifos-purse: refusing to commit a spend that was not allowed');
      const perm = permission(appId);
      s(PERM + appId, Object.assign({}, perm, { windowStart: decision.windowStart, spent: decision.spentAfter }));
      return permission(appId);
    }

    return {
      entitled, grant, entitlements,
      record, history, spentTotal,
      grantPermission, permission, revoke, checkPermission, commitPermission,
    };
  }

  // A Map-backed store, for tests and for anything that wants one.
  function memoryStore() {
    const m = new Map();
    return { get: (k) => m.get(k), set: (k, v) => m.set(k, v), del: (k) => m.delete(k), keys: () => Array.from(m.keys()) };
  }

  GifOS.purse = { make, memoryStore, isExportable, redactForExport, PREFIXES };
})(typeof window !== 'undefined' ? window : globalThis);
