/*
 * gifos-charge.js — may this app take money, from whom, and how much?
 *
 * The SELLING direction (docs/payments.md §Apps that sell): an app asks its own
 * user for payment — unlock, per-item, tip, subscription — and the money goes
 * to the app's AUTHOR.
 *
 * PURE. Every function here is a decision over data that is handed to it: the
 * signature verdict, the manifest, the request, the policy. It performs no I/O,
 * touches no wallet, and cannot move a cent. That is deliberate — it means the
 * rules that decide whether money may move are unit tested in milliseconds,
 * with no chain, no network and no credentials (docs/payments-testing.md).
 *
 * Attaches to `GifOS.charge`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (GifOS.charge) return;

  // Pinned, same as gifos-x402.js. An app cannot ask to be paid on mainnet.
  const CHAIN = 'eip155:84532';       // Base Sepolia
  const CHAIN_NAME = 'Base Sepolia';
  const MAX_REASON = 140;
  const MAX_SKU = 64;

  const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

  // ---- the CHAIN payee, out of the SIGNED manifest ---------------------------
  // manifest.pay = { to: "0x…", chain: "eip155:84532" } — OPTIONAL since the
  // PayPal rail (below) derives its payee from the signing identity and needs
  // no field at all. When the block IS present it is covered by the app
  // signature's content hash — editing it breaks the signature, which is what
  // makes `eligibility()` below meaningful. Absent block = no chain rail;
  // MALFORMED block = refused outright (a wrong address is never "no rail").
  function payeeOf(manifest) {
    const pay = manifest && manifest.pay;
    if (!pay || typeof pay !== 'object') throw new Error('this app declares no payee (manifest.pay), so it cannot be paid');
    if (!isAddress(pay.to)) throw new Error('manifest.pay.to is not an address');
    if (pay.chain && pay.chain !== CHAIN) throw new Error('manifest.pay.chain "' + pay.chain + '" is refused — this build pays on ' + CHAIN_NAME + ' only');
    return { to: pay.to, chain: CHAIN };
  }

  // ---- the FIAT payee, DERIVED from the signing identity ---------------------
  // THE PAYEE RULE (docs/payments.md): signed by an email -> that email is the
  // PayPal payee; signed by a domain -> payments@<domain>. Nothing is declared,
  // so nothing can be tampered with — redirecting revenue means taking over
  // the signing identity itself. Derives ONLY from a verified identity:
  // deriving from an unverified one would pay whoever forged it.
  function paypalPayeeOf(identity) {
    const id = identity || {};
    if (id.verified !== true) throw new Error('the fiat payee derives from a VERIFIED signing identity only');
    if (id.type === 'email') return id.id;
    if (id.type === 'domain') return 'payments@' + id.id;
    throw new Error('unknown signing identity type "' + id.type + '" — no payee can be derived');
  }

  // ---- may this app charge at all? -------------------------------------------
  // Takes the RESULT of GifOS.sign.verify(bytes) — not the bytes — so this
  // stays pure and network-free. verify() itself fetches the author's published
  // key; that is the caller's job, once, before asking this.
  //
  // The refusals are absolute. An unsigned or tampered app does not get a
  // scary-coloured warning and a Pay button; it cannot charge.
  function eligibility(verdict, manifest) {
    const v = verdict || {};
    if (v.status === 'unsigned') {
      return { allowed: false, reason: 'This app is not signed, so there is no verified author to pay. Unsigned apps cannot take payments.' };
    }
    if (v.status === 'tampered') {
      return { allowed: false, reason: 'This app has been changed since it was signed' + (v.detail ? ' (' + v.detail + ')' : '') + '. Its payee cannot be trusted, so it cannot take payments.' };
    }
    if (v.status !== 'valid') {
      return { allowed: false, reason: 'This app’s signature could not be verified, so it cannot take payments.' };
    }
    // The author's published key is not the one we pinned when we first saw
    // them. That is either an honest key rotation or an identity takeover, and
    // nothing here can tell which — so it is refused rather than guessed at.
    if (v.keyChanged) {
      return { allowed: false, reason: 'The signing key published by ' + v.id + ' has changed since this computer last saw it. Payments are refused until that is resolved.' };
    }
    const identity = { id: v.id, type: v.type, verified: true, signedAt: v.ts || null };
    // The chain rail rides on manifest.pay, and the block is optional — but a
    // block that is PRESENT and wrong is a refusal, never a silent "no rail".
    let payee = null;
    if (manifest && manifest.pay != null) {
      try { payee = payeeOf(manifest); } catch (e) { return { allowed: false, reason: e.message }; }
    }
    // The fiat rail derives from the identity that just verified. It cannot
    // fail for a valid identity, but guard anyway rather than half-answer.
    let paypal = null;
    try { paypal = paypalPayeeOf(identity); } catch (e) { return { allowed: false, reason: e.message }; }
    return {
      allowed: true,
      payee,                       // chain rail: { to, chain } | null
      paypal,                      // fiat rail: the derived PayPal payee email
      // What the human is shown. An address means nothing to a person; the
      // verified identity is the thing they can judge (docs/payments.md).
      identity,
    };
  }

  // ---- the request the app made ----------------------------------------------
  // policy: { maxAmount: string, entitled: (sku)=>bool }
  function validateRequest(req, policy) {
    const r = req || {}, p = policy || {};
    const out = { kind: 'charge' };

    if (r.sku != null) {
      if (typeof r.sku !== 'string' || !r.sku.trim() || r.sku.length > MAX_SKU || !/^[\w.\-:]+$/.test(r.sku)) {
        throw new Error('sku must be a short plain identifier (letters, digits, . - _ :)');
      }
      out.sku = r.sku;
    }

    if (typeof r.reason !== 'string' || !r.reason.trim()) throw new Error('a charge must say what it is for (reason)');
    if (r.reason.length > MAX_REASON) throw new Error('reason is too long to show honestly (max ' + MAX_REASON + ' chars)');
    out.reason = r.reason.trim();

    // Tips: the app suggests, the human decides. No sku, so nothing is unlocked.
    out.editable = !!r.editable;
    if (out.editable && out.sku) throw new Error('an editable (tip) amount cannot also unlock a sku — a tip buys nothing');

    if (typeof r.amount !== 'string' || !/^[0-9]+$/.test(r.amount)) {
      throw new Error('amount must be a decimal integer string of base units (no floats on money)');
    }
    const amount = BigInt(r.amount);
    if (amount <= 0n) throw new Error('amount must be positive');
    const cap = BigInt(p.maxAmount || 0);
    if (cap <= 0n) throw new Error('no spending ceiling is set for this app — nothing may be charged');
    if (amount > cap) throw new Error('this app asked for ' + amount + ' but its ceiling is ' + cap);
    out.amount = amount;

    // Already bought? Say so instead of charging twice for the same thing.
    if (out.sku && typeof p.entitled === 'function' && p.entitled(out.sku)) {
      throw new Error('already purchased on this computer (' + out.sku + ')');
    }
    return out;
  }

  // ---- what the human is shown, BEFORE any passkey prompt --------------------
  // A WebAuthn dialog says only "use your passkey". This is the trusted display.
  function sheet(elig, request, appName) {
    return {
      app: appName || '',
      payingTo: elig.identity.id,
      payingToType: elig.identity.type,
      verified: true,
      // The rails this app can be paid on. PayPal always (derived); the chain
      // only when the signed manifest carries an address. The sheet renders a
      // button per rail — never a rail with a null payee.
      rails: {
        paypal: elig.paypal || null,
        x402: elig.payee ? { address: elig.payee.to, chain: CHAIN_NAME } : null,
        // The universal rail: send exactly X to the signed payee, from ANY
        // self-custody wallet (RockWallet included) — same address authority
        // as x402, no connection needed.
        transfer: elig.payee ? { address: elig.payee.to, chain: CHAIN_NAME } : null,
        // FedNow rides the verified identity like PayPal does; whether that
        // identity is REGISTERED with the provider is the Worker's answer at
        // request time, not a claim made here.
        fednow: elig.paypal ? { identity: elig.identity.id } : null,
      },
      // Back-compat fields (address/chain) kept while the x402 rail is the
      // only on-chain one; prefer rails.* in new code.
      address: elig.payee ? elig.payee.to : null,
      chain: CHAIN_NAME,
      amount: String(request.amount),
      editable: !!request.editable,
      reason: request.reason,
      sku: request.sku || null,
      unlocks: !!request.sku,
    };
  }

  // ---- the receipt the OS records, and hands back ---------------------------
  function receipt(sheetData, txId, atMs, rail) {
    rail = rail || 'x402';                  // 'paypal' | 'x402' | 'transfer' | 'fednow'
    const onChain = rail === 'x402' || rail === 'transfer';
    return {
      ok: true,
      rail,
      amount: sheetData.amount,
      chain: onChain ? CHAIN : null,
      payee: onChain ? sheetData.address
        : rail === 'paypal' ? ((sheetData.rails && sheetData.rails.paypal) || null)
        : null,                             // fednow: the bank account is the provider's business, not the app's
      payeeId: sheetData.payingTo,
      sku: sheetData.sku,
      reason: sheetData.reason,
      tx: txId || null,
      at: atMs || null,
    };
  }

  // A decline is a NORMAL outcome, not an error condition. Apps must handle it.
  const DECLINED = 'DECLINED_BY_USER';

  GifOS.charge = {
    CHAIN, CHAIN_NAME, DECLINED,
    payeeOf, paypalPayeeOf, eligibility, validateRequest, sheet, receipt,
  };
})(typeof window !== 'undefined' ? window : globalThis);
