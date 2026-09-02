/*
 * gifos-pay-broker.js — the OS side of gifos.charge(): verify, ask, move, record.
 *
 * The app asks, the OS asks the human, the OS moves the money
 * (docs/payments.md). This file is the trusted middle: it runs ONLY on the OS
 * page (run.html), never in an app frame. What the sandbox can cause is a
 * request; everything that decides — the signature gate, the ceiling, the
 * trusted display, the rail, the record — happens here, out of its reach.
 *
 * The DECISIONS are not made here either: gifos-charge.js (eligibility,
 * validation, the sheet's contents) and gifos-purse.js (entitlements, ledger)
 * are pure and unit-tested; this file wires them to the DOM, the purse store,
 * and the two settlement rails:
 *
 *   PAYPAL  the pay Worker creates an order paying the app's SIGNING IDENTITY
 *           (derived — payments@<domain> or the signing email) and hands back
 *           an approval URL. The human finishes in PayPal's own window. Proof
 *           is an Ed25519-signed receipt from the Worker, verified here
 *           against /gifos.key — the purse never takes the browser's word.
 *   X402    testnet USDC on Base Sepolia. The broker builds the 97/3 split
 *           itself — TWO transfers from ONE approval, no splitter contract —
 *           and hands them to the wallet adapter (GifOS.payWallet) to sign.
 *           Until the Base Account connection lands, no adapter is present in
 *           production and the rail says so instead of pretending.
 *
 * TEST RAILS ONLY. The Worker speaks PayPal sandbox; the chain is Base
 * Sepolia, pinned in gifos-charge.js/gifos-x402.js. Nothing here can reach a
 * mainnet asset.
 *
 * Attaches to `GifOS.payBroker`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (GifOS.payBroker) return;

  // ---- config ----------------------------------------------------------------
  const WORKER_KEY = 'gifos_pay_worker';           // localStorage override, for tests/self-hosters
  const DEFAULT_WORKER = 'https://pay.gifos.app';
  const POLICY_KEY = 'gifos_pay_policy';           // { "<appId>": { maxAmount: "<units>" } }
  // The per-call ceiling an app gets before anyone touches Settings. $20 in
  // USDC base units (6 decimals) — high enough for real unlocks, low enough
  // that the worst a hostile app can ASK for (a human still approves every
  // cent) is bounded. Settings can raise or lower it per app.
  const DEFAULT_MAX = '20000000';
  // GifOS's 3% (Nathan's 97/3, docs/payments.md). On PayPal the WORKER applies
  // it (platform_fees) — the client never computes fiat fees. On x402 the
  // split is built here, because the broker constructs the payment.
  const FEE_BPS = 300n;
  // Where the x402 fee lands. A Base Sepolia TEST address — replace alongside
  // the mainnet flag day, never before (docs/payments.md "What this does NOT do").
  const TREASURY = '0x1111111111111111111111111111111111111111';

  const ls = () => root.localStorage;

  // ---- the purse, over localStorage ------------------------------------------
  // localStorage is deliberate, not a shortcut: the desktop backup GIF packs
  // IndexedDB (items/files/states) and NOTHING else, so a purse here can never
  // travel inside a shared or backed-up GIF — the redaction rule of
  // gifos-purse.js holds by construction. Keys keep the purse's own pay.*
  // prefixes so isExportable() answers correctly if an export path ever asks.
  const store = {
    get(k) { try { const v = ls().getItem(k); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; } },
    set(k, v) { ls().setItem(k, JSON.stringify(v)); },
    del(k) { ls().removeItem(k); },
    keys() { const out = []; try { for (let i = 0; i < ls().length; i++) { const k = ls().key(i); if (/^pay\./.test(k)) out.push(k); } } catch (e) {} return out; },
  };
  const purse = () => GifOS.purse.make(store);

  function maxAmountFor(appId) {
    try {
      const p = JSON.parse(ls().getItem(POLICY_KEY) || '{}');
      const e = p && p[appId];
      if (e && /^[0-9]+$/.test(String(e.maxAmount))) return String(e.maxAmount);
    } catch (e) {}
    return DEFAULT_MAX;
  }
  function setMaxAmount(appId, units) {
    if (!/^[0-9]+$/.test(String(units))) throw new Error('ceiling must be a decimal integer string of base units');
    let p = {}; try { p = JSON.parse(ls().getItem(POLICY_KEY) || '{}') || {}; } catch (e) {}
    p[appId] = Object.assign(p[appId] || {}, { maxAmount: String(units) });
    ls().setItem(POLICY_KEY, JSON.stringify(p));
  }
  function workerBase() {
    try { const v = (ls().getItem(WORKER_KEY) || '').trim(); if (v) return v.replace(/\/+$/, ''); } catch (e) {}
    return DEFAULT_WORKER;
  }

  // ---- money display ---------------------------------------------------------
  // Base units are USDC's 6 decimals on BOTH rails ($1 = 1000000), so the app
  // API has one unit space. PayPal can only move whole cents, so that rail
  // demands amount % 10000 == 0 — refused per rail, never rounded: rounding
  // money silently is how a display and a charge come to disagree.
  const CENT = 10000n;
  function fmtUsd(units) {
    const n = BigInt(units);
    const cents = n / CENT, sub = n % CENT;
    const d = cents / 100n, c = cents % 100n;
    let out = '$' + d + '.' + String(c).padStart(2, '0');
    if (sub !== 0n) out += ' (+' + sub + ' millionths)';
    return out;
  }
  const wholeCents = (units) => BigInt(units) % CENT === 0n;
  // Exact USDC, six decimals, for the transfer rail — the buyer must send
  // EXACTLY this, dust and all, so nothing here may round or trim.
  function fmtUsdcExact(units) {
    const n = BigInt(units);
    return (n / 1000000n) + '.' + String(n % 1000000n).padStart(6, '0');
  }

  // ---- the signature verdict, once per BYTES ---------------------------------
  // verify() fetches the author's published key, so it is cached for the
  // session — keyed by the SHA-256 of the bytes it judged, never by appId: an
  // appId is a string any GIF can wear, and a cache keyed on it would let an
  // unsigned copy mounted after a valid one inherit that valid verdict. A
  // charge re-verifies only what this page loaded — the bytes that are
  // RUNNING — which is exactly the thing the payee derives from.
  const verdicts = new Map();
  async function verdictFor(manifest, appBytes) {
    const bytes = appBytes instanceof Uint8Array ? appBytes : new Uint8Array(appBytes || 0);
    let key;
    try { key = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join(''); }
    catch (e) { key = 'len:' + bytes.length; }
    if (!verdicts.has(key)) {
      verdicts.set(key, Promise.resolve().then(() => GifOS.sign.verify(bytes)).catch((e) => ({ status: 'unverified', detail: String(e && e.message || e) })));
    }
    return verdicts.get(key);
  }

  // ---- receipt ↔ request binding -----------------------------------------------
  // A verified receipt still has to be THIS payment's: same amount, same app,
  // same sku, and the rail that was actually driven. (A receipt for a cheaper
  // sku at the same price must not unlock a dearer one.)
  function bindReceipt(receipt, manifest, sheetData, amount, rail) {
    const skuOf = (v) => (v == null ? '' : String(v));
    if (String(receipt.amount) !== String(amount) || receipt.appId !== manifest.appId
        || skuOf(receipt.sku) !== skuOf(sheetData && sheetData.sku)
        || (receipt.rail != null && rail != null && receipt.rail !== rail)) {
      throw new Error('the signed receipt does not match this payment — refusing to record it');
    }
  }

  // ---- receipt verification --------------------------------------------------
  // The Worker signs the exact JSON STRING it returns; we verify those UTF-8
  // bytes against this site's own /gifos.key (the same key that certifies the
  // app catalog) before a cent is recorded. The purse never takes a redirect's
  // word — or this page's word — that money moved.
  let keyPromise = null;
  function receiptKey() {
    if (!keyPromise) keyPromise = fetch('/gifos.key').then(async (r) => {
      if (!r.ok) throw new Error('no /gifos.key on this site (HTTP ' + r.status + ')');
      const b64 = (await r.text()).trim().replace(/^-----BEGIN[^-]*-----/, '').replace(/-----END[^-]*-----$/, '').trim();
      const bytes = GifOS.sign._b64ToBytes(b64);
      if (bytes.length !== 32) throw new Error('/gifos.key is not a 32-byte Ed25519 key');
      return bytes;
    });
    return keyPromise;
  }
  async function verifyReceipt(receiptJson, sigB64) {
    const pub = await receiptKey();
    const ok = await GifOS.ed.verify(pub, GifOS.sign._b64ToBytes(sigB64), new TextEncoder().encode(receiptJson));
    if (!ok) throw new Error('the payment receipt does not verify against this site’s key — refusing to record it');
    return JSON.parse(receiptJson);
  }

  // ---- the approval sheet ----------------------------------------------------
  // A WebAuthn/PayPal window says only "approve" — it never shows WHAT is
  // being paid, to whom, from which app. This modal is the trusted display
  // (docs/payments.md §Consent), and it must be answered before either rail
  // is touched. Decline is a button, not an error.
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function showSheet(sheetData) {
    const doc = root.document;
    if (!doc || !doc.body) return Promise.reject(new Error('no display to ask the human on — payments need a visible page'));
    return new Promise((resolve) => {
      // A second ask while one is open answers the first as declined, so its
      // bridge call is replied to instead of hanging for the tab's life.
      const old = doc.getElementById('gifos-pay-sheet');
      if (old) { try { if (old.__decline) old.__decline(); } catch (e) {} old.remove(); }
      const bg = doc.createElement('div'); bg.id = 'gifos-pay-sheet';
      bg.__decline = () => resolve({ declined: true });
      bg.setAttribute('style', 'position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:1.2rem;');
      const box = doc.createElement('div');
      box.setAttribute('style', 'background:#14141f;color:#e8e8f4;border:1px solid #2a2a3f;border-radius:.8rem;max-width:24rem;width:100%;padding:1.2rem;font:15px/1.55 system-ui,-apple-system,sans-serif;');
      const walletReady = !!(GifOS.payWallet && GifOS.payWallet.available());
      const canPaypal = !!sheetData.rails.paypal && wholeCents(sheetData.amount);
      const canX402 = !!sheetData.rails.x402;
      box.innerHTML =
        '<h3 style="margin:0 0 .35rem;font-size:1.1rem">' + esc(sheetData.app || 'This app') + ' asks you to pay</h3>' +
        '<p style="margin:0 0 .8rem;color:#b6b6cf;font-size:.9rem">' + esc(sheetData.reason) + '</p>' +
        '<div style="background:#0e0e17;border:1px solid #23233a;border-radius:.6rem;padding:.8rem .9rem;margin-bottom:.9rem">' +
          '<div style="display:flex;justify-content:space-between;gap:.6rem"><span style="color:#9a9ab5">Amount</span><b id="gp-amt-show">' + esc(fmtUsd(sheetData.amount)) + '</b></div>' +
          (sheetData.editable ? '<div style="margin:.5rem 0 0"><input id="gp-amt" type="number" min="0.01" step="0.01" value="' + esc((Number(BigInt(sheetData.amount) / 10000n) / 100).toFixed(2)) + '" style="width:100%;box-sizing:border-box;background:#14141f;border:1px solid #2a2a3f;border-radius:.4rem;color:#e8e8f4;padding:.45rem .6rem;font:inherit"><div style="color:#9a9ab5;font-size:.78rem;margin-top:.25rem">You choose the amount — this is a tip.</div></div>' : '') +
          '<div style="display:flex;justify-content:space-between;gap:.6rem;margin-top:.45rem"><span style="color:#9a9ab5">Paying</span><span><b>' + esc(sheetData.payingTo) + '</b> <span style="color:#7ddb91">✓ verified</span></span></div>' +
          (sheetData.unlocks ? '<div style="display:flex;justify-content:space-between;gap:.6rem;margin-top:.45rem"><span style="color:#9a9ab5">Unlocks</span><span>' + esc(sheetData.sku) + ' (on this computer)</span></div>' : '') +
          '<div style="color:#9a9ab5;font-size:.78rem;margin-top:.55rem">Test rails — no real money moves. GifOS keeps 3%; the author gets the rest.</div>' +
        '</div>' +
        '<div id="gp-buttons" style="display:flex;flex-direction:column;gap:.5rem">' +
          (canPaypal ? '<button id="gp-paypal" style="padding:.6rem 1rem;border-radius:.5rem;border:none;background:#ffc439;color:#111;cursor:pointer;font:inherit;font-weight:600">Pay with PayPal (sandbox)</button>' : '') +
          (canX402 ? '<button id="gp-x402" ' + (walletReady ? '' : 'disabled ') + 'style="padding:.6rem 1rem;border-radius:.5rem;border:1px solid #2a2a3f;background:' + (walletReady ? '#1652f0' : '#20203255') + ';color:' + (walletReady ? '#fff' : '#9a9ab5') + ';cursor:' + (walletReady ? 'pointer' : 'default') + ';font:inherit">Pay with USDC — connected wallet' + (walletReady ? '' : ' (none yet)') + '</button>' : '') +
          (sheetData.rails.transfer ? '<button id="gp-transfer" style="padding:.6rem 1rem;border-radius:.5rem;border:1px solid #2a2a3f;background:#1d1d2c;color:#e8e8f4;cursor:pointer;font:inherit">Send USDC from any wallet (RockWallet, …)</button>' : '') +
          (sheetData.rails.fednow ? '<button id="gp-fednow" style="padding:.6rem 1rem;border-radius:.5rem;border:1px solid #2a2a3f;background:#1d1d2c;color:#e8e8f4;cursor:pointer;font:inherit">Pay from your bank (FedNow)</button>' : '') +
          '<button id="gp-decline" style="padding:.6rem 1rem;border-radius:.5rem;border:1px solid #2a2a3f;background:transparent;color:#b6b6cf;cursor:pointer;font:inherit">No thanks</button>' +
        '</div>' +
        '<div id="gp-status" style="display:none;color:#b6b6cf;font-size:.9rem;margin-top:.8rem"></div>';
      bg.appendChild(box); doc.body.appendChild(bg);

      const amountNow = () => {
        if (!sheetData.editable) return BigInt(sheetData.amount);
        // Parsed as a decimal STRING, never a float: 1.005 must not become
        // 100 cents by rounding, and what the human typed is what is charged.
        const m = /^\s*(\d{1,7})(?:[.,](\d{1,2}))?\s*$/.exec(String(box.querySelector('#gp-amt').value || ''));
        if (!m) return null;
        const cents = BigInt(m[1]) * 100n + BigInt((m[2] || '').padEnd(2, '0'));
        if (cents <= 0n) return null;
        return cents * CENT; // whole cents, exactly
      };
      const done = (result) => { bg.remove(); resolve(result); };

      box.querySelector('#gp-decline').onclick = () => done({ declined: true });
      const pp = box.querySelector('#gp-paypal');
      if (pp) pp.onclick = () => {
        const amt = amountNow();
        if (amt == null) return;
        // The popup MUST open inside this click — a blocker eats anything later.
        const win = root.open('about:blank', 'gifos-pay', 'width=480,height=640');
        done({ rail: 'paypal', amount: amt, win });
      };
      const xb = box.querySelector('#gp-x402');
      if (xb && !xb.disabled) xb.onclick = () => {
        const amt = amountNow();
        if (amt == null) return;
        done({ rail: 'x402', amount: amt });
      };
      const tb = box.querySelector('#gp-transfer');
      if (tb) tb.onclick = () => {
        const amt = amountNow();
        if (amt == null) return;
        done({ rail: 'transfer', amount: amt });
      };
      const fb = box.querySelector('#gp-fednow');
      if (fb) fb.onclick = () => {
        const amt = amountNow();
        if (amt == null) return;
        done({ rail: 'fednow', amount: amt });
      };
      bg.addEventListener('click', (e) => { if (e.target === bg) done({ declined: true }); });
    });
  }

  // A second, minimal modal for the in-flight state (the first closed when a
  // rail was chosen so its promise could resolve; this one owns the wait).
  function showBusy(msg) {
    const doc = root.document;
    const old = doc.getElementById('gifos-pay-busy'); if (old) old.remove();
    const bg = doc.createElement('div'); bg.id = 'gifos-pay-busy';
    bg.setAttribute('style', 'position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:1.2rem;');
    const box = doc.createElement('div');
    box.setAttribute('style', 'background:#14141f;color:#e8e8f4;border:1px solid #2a2a3f;border-radius:.8rem;max-width:22rem;width:100%;padding:1.1rem;font:15px/1.55 system-ui,-apple-system,sans-serif;');
    box.innerHTML = '<p id="gpb-msg" style="margin:0">' + esc(msg) + '</p>' +
      '<div style="text-align:right;margin-top:.8rem"><button id="gpb-cancel" style="padding:.4rem 1rem;border-radius:.4rem;border:1px solid #2a2a3f;background:transparent;color:#b6b6cf;cursor:pointer;font:inherit">Cancel</button></div>';
    bg.appendChild(box); doc.body.appendChild(bg);
    let cancelled = false;
    box.querySelector('#gpb-cancel').onclick = () => { cancelled = true; };
    return {
      say(m) { const el = box.querySelector('#gpb-msg'); if (el) el.textContent = m; },
      cancelled: () => cancelled,
      close() { bg.remove(); },
    };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- the PayPal rail -------------------------------------------------------
  async function payWithPaypal(manifest, sheetData, amount, win) {
    const base = workerBase();
    const busyUi = showBusy('Starting the PayPal checkout…');
    try {
      const r = await fetch(base + '/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appId: manifest.appId,
          amount: String(amount),
          sku: sheetData.sku || null,
          reason: sheetData.reason,
        }),
      });
      if (!r.ok) throw new Error('checkout failed (HTTP ' + r.status + '): ' + (await r.text()).slice(0, 200));
      const co = await r.json(); // { id, approveUrl }
      if (!co.id || !co.approveUrl) throw new Error('checkout answered without an order');
      // The popup is an about:blank window of THIS origin: only an https
      // URL may ever be assigned to it (a javascript: URL would run here).
      if (!/^https:\/\//i.test(String(co.approveUrl)) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(String(co.approveUrl))) throw new Error('checkout answered with an unusable approval link');
      if (win && !win.closed) win.location = co.approveUrl;
      busyUi.say('Finish the payment in the PayPal window…');
      // Poll for the signed receipt. PayPal may land the capture moments after
      // the window closes, so a closed window narrows the patience rather than
      // aborting: the receipt, not the window, is the truth.
      const deadline = Date.now() + 5 * 60 * 1000;
      let closedAt = 0;
      while (Date.now() < deadline) {
        if (busyUi.cancelled()) throw new Error(GifOS.charge.DECLINED);
        if (win && win.closed && !closedAt) closedAt = Date.now();
        if (closedAt && Date.now() - closedAt > 15000) throw new Error(GifOS.charge.DECLINED);
        // The claim came back with the checkout and only to this page: the
        // Worker signs a receipt for an order only to the claim it was minted with.
        const rr = await fetch(base + '/receipt/' + encodeURIComponent(co.id) + '?claim=' + encodeURIComponent(co.claim || '')).catch(() => null);
        if (rr && rr.ok) {
          const body = await rr.json(); // { status, receiptJson, sig }
          if (body.status === 'COMPLETED' && body.receiptJson && body.sig) {
            const receipt = await verifyReceipt(body.receiptJson, body.sig);
            bindReceipt(receipt, manifest, sheetData, amount, 'paypal');
            return { receipt, receiptJson: body.receiptJson, sig: body.sig };
          }
        }
        await sleep(1500);
      }
      throw new Error('the payment was not completed in time');
    } finally {
      busyUi.close();
      if (win && !win.closed) { try { win.close(); } catch (e) {} }
    }
  }

  // ---- the x402 rail ---------------------------------------------------------
  // TWO transfers from ONE approval — the 97/3 split needs no contract because
  // this broker constructs the payment (docs/payments.md). The wallet adapter
  // signs; the Worker's facilitator endpoint settles. Testnet only.
  async function payWithX402(manifest, sheetData, amount) {
    const wallet = GifOS.payWallet;
    if (!wallet || !wallet.available()) throw new Error('no wallet is available on this computer');
    const base = workerBase();
    const busyUi = showBusy('Asking your wallet to sign…');
    try {
      const fee = (amount * FEE_BPS) / 10000n;
      const toAuthor = amount - fee;
      const x = GifOS.x402;
      const network = x.ALLOWED.networks[0];
      const asset = x.ALLOWED.assets[network][0];
      const transfers = [
        { to: sheetData.rails.x402.address, amount: String(toAuthor), asset, network },
      ];
      if (fee > 0n) transfers.push({ to: TREASURY, amount: String(fee), asset, network });
      // The human authenticates HERE — the Base Account passkey prompt (or the
      // wallet's own confirm). One prompt per transfer of the split.
      const payloads = await wallet.signTransfers(transfers);
      if (busyUi.cancelled()) throw new Error(GifOS.charge.DECLINED);
      busyUi.say('Settling on Base Sepolia…');
      const r = await fetch(base + '/x402/settle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: manifest.appId, sku: sheetData.sku || null, amount: String(amount), transfers, payloads }),
      });
      if (!r.ok) throw new Error('settlement failed (HTTP ' + r.status + '): ' + (await r.text()).slice(0, 200));
      const body = await r.json(); // { status, receiptJson, sig }
      if (body.status !== 'COMPLETED' || !body.receiptJson || !body.sig) throw new Error('settlement did not complete');
      const receipt = await verifyReceipt(body.receiptJson, body.sig);
      bindReceipt(receipt, manifest, sheetData, amount, 'x402');
      return { receipt, receiptJson: body.receiptJson, sig: body.sig };
    } finally { busyUi.close(); }
  }

  // ---- the wallet-transfer rail (RockWallet and every other wallet) ---------
  // The one integration surface every self-custody wallet has: send exactly X
  // to address Y. The Worker mints a signed invoice with a dust-unique amount
  // and watches the chain; this side shows the human WHAT to send, exactly,
  // and polls for the receipt. Nothing connects, nothing signs here — the
  // buyer's own wallet does the paying.
  function showTransferSheet(inv) {
    const doc = root.document;
    const old2 = doc.getElementById('gifos-pay-transfer'); if (old2) old2.remove();
    const bg = doc.createElement('div'); bg.id = 'gifos-pay-transfer';
    bg.setAttribute('style', 'position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:1.2rem;');
    const box = doc.createElement('div');
    box.setAttribute('style', 'background:#14141f;color:#e8e8f4;border:1px solid #2a2a3f;border-radius:.8rem;max-width:24rem;width:100%;padding:1.2rem;font:15px/1.55 system-ui,-apple-system,sans-serif;');
    const exact = fmtUsdcExact(inv.expected);
    box.innerHTML =
      '<h3 style="margin:0 0 .35rem;font-size:1.05rem">Send from your wallet</h3>' +
      '<p style="margin:0 0 .8rem;color:#b6b6cf;font-size:.86rem">Open RockWallet — or any wallet that holds USDC on <b>Base Sepolia</b> — and send <b>exactly</b> this amount to this address. The extra fraction of a cent is how this payment is recognised as yours.</p>' +
      '<div style="background:#0e0e17;border:1px solid #23233a;border-radius:.6rem;padding:.8rem .9rem;margin-bottom:.9rem">' +
        '<div style="color:#9a9ab5;font-size:.78rem">Amount (USDC)</div>' +
        '<div style="display:flex;gap:.5rem;align-items:center"><b id="gpt-amt" style="font-size:1.05rem">' + esc(exact) + '</b><button data-copy="' + esc(exact) + '" class="gpt-copy" style="padding:.2rem .6rem;border-radius:.4rem;border:1px solid #2a2a3f;background:transparent;color:#b6b6cf;cursor:pointer;font:inherit;font-size:.78rem">Copy</button></div>' +
        '<div style="color:#9a9ab5;font-size:.78rem;margin-top:.6rem">To address</div>' +
        '<div style="display:flex;gap:.5rem;align-items:center"><b style="font-size:.8rem;word-break:break-all">' + esc(inv.payTo) + '</b><button data-copy="' + esc(inv.payTo) + '" class="gpt-copy" style="padding:.2rem .6rem;border-radius:.4rem;border:1px solid #2a2a3f;background:transparent;color:#b6b6cf;cursor:pointer;font:inherit;font-size:.78rem">Copy</button></div>' +
        (/^ethereum:/i.test(String(inv.uri || '')) ? '<a href="' + esc(inv.uri) + '" style="display:inline-block;margin-top:.6rem;color:#9db4ff;font-size:.82rem">Open in a wallet on this device</a>' : '') +
      '</div>' +
      '<div style="background:#0e0e17;border:1px solid #23233a;border-radius:.6rem;padding:.8rem .9rem;margin-bottom:.9rem">' +
        '<div style="color:#9a9ab5;font-size:.78rem">Sending from (your wallet address)</div>' +
        '<div style="display:flex;gap:.5rem;align-items:center;margin-top:.3rem"><input id="gpt-from" placeholder="0x…" spellcheck="false" style="flex:1;min-width:0;padding:.35rem .5rem;border-radius:.4rem;border:1px solid #2a2a3f;background:#14141f;color:#e8e8f4;font:inherit;font-size:.8rem"><button id="gpt-bind" style="padding:.3rem .7rem;border-radius:.4rem;border:1px solid #2a2a3f;background:transparent;color:#b6b6cf;cursor:pointer;font:inherit;font-size:.78rem">Bind</button></div>' +
        '<div id="gpt-bound" style="color:#9a9ab5;font-size:.78rem;margin-top:.4rem">Naming your wallet ties this payment to you: only a transfer from that address can complete it, and nobody else\'s can be mistaken for yours.</div>' +
      '</div>' +
      '<p id="gpt-status" style="color:#b6b6cf;font-size:.86rem;margin:0 0 .8rem">Watching for your transfer…</p>' +
      '<div style="text-align:right"><button id="gpt-cancel" style="padding:.5rem 1.2rem;border-radius:.5rem;border:1px solid #2a2a3f;background:transparent;color:#b6b6cf;cursor:pointer;font:inherit">Cancel</button></div>';
    bg.appendChild(box); doc.body.appendChild(bg);
    for (const b of box.querySelectorAll('.gpt-copy')) b.onclick = () => { try { root.navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; } catch (e) {} };
    let cancelled = false;
    box.querySelector('#gpt-cancel').onclick = () => { cancelled = true; };
    const api = { cancelled: () => cancelled, close: () => bg.remove(), onBind: null };
    const fromIn = box.querySelector('#gpt-from'), bindBtn = box.querySelector('#gpt-bind'), bound = box.querySelector('#gpt-bound');
    bindBtn.onclick = () => {
      const from = String(fromIn.value || '').trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(from)) { bound.textContent = 'That is not a 0x… wallet address.'; return; }
      if (!api.onBind) return;
      bindBtn.disabled = true;
      api.onBind(from).then(() => {
        fromIn.disabled = true;
        bound.textContent = 'Bound to ' + from.slice(0, 6) + '…' + from.slice(-4) + ' — only a transfer from that wallet completes this payment.';
      }, (e) => { bindBtn.disabled = false; bound.textContent = String(e && e.message || e); });
    };
    return api;
  }

  async function payWithTransfer(manifest, sheetData, amount) {
    const base = workerBase();
    const r = await fetch(base + '/transfer/invoice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: manifest.appId, amount: String(amount), sku: sheetData.sku || null, reason: sheetData.reason }),
    });
    if (!r.ok) throw new Error('could not start the transfer (HTTP ' + r.status + '): ' + (await r.text()).slice(0, 200));
    const inv = await r.json();
    const ui = showTransferSheet(inv);
    // Binding re-signs the same invoice with the payer's address (amount and
    // dust unchanged); the poll below reads inv.token, so it follows.
    ui.onBind = async (from) => {
      const rb = await fetch(base + '/transfer/bind', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: inv.token, from }),
      });
      if (!rb.ok) throw new Error('could not bind the payment to that wallet (HTTP ' + rb.status + ')');
      inv.token = (await rb.json()).token;
    };
    try {
      while (Date.now() < inv.exp) {
        if (ui.cancelled()) throw new Error(GifOS.charge.DECLINED);
        const rr = await fetch(base + '/transfer/receipt', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: inv.token }),
        }).catch(() => null);
        if (rr && rr.ok) {
          const body = await rr.json();
          if (body.status === 'COMPLETED' && body.receiptJson && body.sig) {
            const receipt = await verifyReceipt(body.receiptJson, body.sig);
            bindReceipt(receipt, manifest, sheetData, amount, 'transfer');
            return { receipt, receiptJson: body.receiptJson, sig: body.sig };
          }
        } else if (rr && rr.status === 410) {
          throw new Error('the transfer window expired — start the payment again');
        }
        await sleep(3000);
      }
      throw new Error('the transfer window expired — start the payment again');
    } finally { ui.close(); }
  }

  // ---- the FedNow rail ------------------------------------------------------
  // A Request-for-Payment through the provider; the human approves it in
  // their own banking app — there is nothing of ours to render there, so this
  // side only says what to do and waits for the settled receipt.
  async function payWithFednow(manifest, sheetData, amount) {
    const base = workerBase();
    const busyUi = showBusy('Sending the payment request to your bank…');
    try {
      const r = await fetch(base + '/fednow/rfp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: manifest.appId, amount: String(amount), sku: sheetData.sku || null, reason: sheetData.reason }),
      });
      if (!r.ok) throw new Error('bank payment not available: ' + (await r.text()).slice(0, 200));
      const rfp = await r.json();
      busyUi.say('Approve the request in your banking app…');
      const deadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < deadline) {
        if (busyUi.cancelled()) throw new Error(GifOS.charge.DECLINED);
        const rr = await fetch(base + '/fednow/receipt/' + encodeURIComponent(rfp.id)).catch(() => null);
        if (rr && rr.ok) {
          const body = await rr.json();
          if (body.status === 'COMPLETED' && body.receiptJson && body.sig) {
            const receipt = await verifyReceipt(body.receiptJson, body.sig);
            bindReceipt(receipt, manifest, sheetData, amount, 'fednow');
            return { receipt, receiptJson: body.receiptJson, sig: body.sig };
          }
        }
        await sleep(2000);
      }
      throw new Error('the payment was not completed in time');
    } finally { busyUi.close(); }
  }

  // ---- gifos.charge(), brokered ---------------------------------------------
  async function charge(manifest, appBytes, req, appName) {
    if (!manifest || !manifest.capabilities || !manifest.capabilities.pay) {
      throw new Error('This app did not declare the "pay" capability.');
    }
    const verdict = await verdictFor(manifest, appBytes);
    const elig = GifOS.charge.eligibility(verdict, manifest);
    if (!elig.allowed) throw new Error(elig.reason);
    const p = purse();
    const request = GifOS.charge.validateRequest(req, {
      maxAmount: maxAmountFor(manifest.appId),
      entitled: (sku) => p.entitled(manifest.appId, sku),
    });
    const sheetData = GifOS.charge.sheet(elig, request, appName || manifest.name);
    if (!sheetData.rails.paypal && !sheetData.rails.x402) throw new Error('this app has no rail it can be paid on');

    const choice = await showSheet(sheetData);
    if (choice.declined) throw new Error(GifOS.charge.DECLINED);

    // An edited (tip) amount still honors the app's ceiling — the human can
    // lower or raise a SUGGESTION, never outspend the app's own cap.
    const cap = BigInt(maxAmountFor(manifest.appId));
    if (choice.amount <= 0n) throw new Error(GifOS.charge.DECLINED);
    if (choice.amount > cap) throw new Error('that amount is over this app’s ceiling (' + fmtUsd(cap) + ')');
    sheetData.amount = String(choice.amount);

    const paid = choice.rail === 'paypal' ? await payWithPaypal(manifest, sheetData, choice.amount, choice.win)
      : choice.rail === 'x402' ? await payWithX402(manifest, sheetData, choice.amount)
      : choice.rail === 'transfer' ? await payWithTransfer(manifest, sheetData, choice.amount)
      : await payWithFednow(manifest, sheetData, choice.amount);
    const receipt = paid.receipt;

    // Record: entitlement (if a sku), then the ledger line. The receipt the
    // APP gets back is the pure-module shape — it never sees the Worker's raw
    // signed object, which names the payee account.
    const out = GifOS.charge.receipt(sheetData, receipt.tx || receipt.orderId || null, receipt.at || Date.now(), choice.rail);
    if (request.sku) p.grant(manifest.appId, request.sku, { tx: out.tx, amount: out.amount, rail: out.rail, at: out.at, payeeId: sheetData.payingTo });
    p.record(manifest.appId, { amount: String(choice.amount), rail: choice.rail, sku: request.sku || null, reason: request.reason, payeeId: sheetData.payingTo, tx: out.tx, at: out.at });
    // The receipt becomes a FILE (docs/payments.md "The receipt is a file"):
    // proof you can hold, back up, and carry to a new computer. Best-effort
    // and AFTER the money facts are recorded — a mint failure must never
    // unwind a payment that already happened.
    try { await mintReceiptFile(paid, request, sheetData, appName || manifest.name); } catch (e) { try { console.warn('receipt file not minted:', e); } catch (e2) {} }
    return out;
  }

  // entitled() and license() are keyed by appId, which is a free-text field
  // of an unsigned manifest — so they are gated exactly as charge() is: the
  // RUNNING bytes must verify for the identity that was paid. Otherwise any
  // GIF that copied a victim's appId could read its purchases and, through
  // license(), the transaction id sellers treat as the buyer's account. A
  // grant remembers the identity it was made for (payeeId); an older grant
  // without one falls back to "signed and valid".
  async function paidIdentityFor(manifest, appBytes, sku, what) {
    if (!manifest || !manifest.capabilities || !manifest.capabilities.pay) {
      throw new Error('This app did not declare the "pay" capability.');
    }
    if (typeof sku !== 'string' || !sku.trim()) throw new Error(what + '() needs a sku');
    const verdict = await verdictFor(manifest, appBytes);
    const elig = GifOS.charge.eligibility(verdict, manifest);
    if (!elig.allowed) throw new Error(elig.reason);
    return elig.identity && elig.identity.id;
  }
  function entitledTo(ent, identityId) {
    if (!ent) return false;
    return !ent.payeeId || !identityId || ent.payeeId === identityId;
  }
  async function entitled(manifest, sku, appBytes) {
    const who = await paidIdentityFor(manifest, appBytes, sku, 'entitled');
    return entitledTo(purse().entitlement(manifest.appId, sku), who);
  }

  // ---- the receipt as a FILE ------------------------------------------------
  // A purchase materializes as a small App GIF in the Purchases folder: the
  // Worker's SIGNED receipt verbatim (any GifOS can re-verify it against
  // gifos.app's published key), plus a tiny self-describing viewer. Opening
  // it on any computer re-grants the entitlement there — that is the restore
  // story, with no account anywhere. It is deliberately a BEARER artifact:
  // sharing it is handing over your license identity (see license() below),
  // which is exactly what makes it a family act rather than distribution.
  const PENDING_KEY = 'gifos_pay_pending';   // fileIds awaiting desktop placement

  // The file's contents come from ONE builder (gifos-charge.js receiptFile)
  // shared with the pay Worker, which packs the same file for an agent's
  // purchase — the Worker's signed strings go in VERBATIM either way.
  async function mintReceiptFile(paid, request, sheetData, appName) {
    const { label, files } = GifOS.charge.receiptFile(paid.receipt, paid.receiptJson, paid.sig, {
      appName: appName || paid.receipt.appId,
      payingTo: sheetData && sheetData.payingTo,
    });
    const bytes = await GifOS.gif.encode(files, { accent: [255, 196, 57] });
    const fileId = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fileId, name: label + '.gif', bytes, kind: 'gif', isApp: true, appId: 'gifos-receipt', mime: 'image/gif' });
    // The desktop places icons, never this page (saveItem's monopoly): queue
    // the fileId; desktop.js drains it into the Purchases folder on its next
    // boot or focus (it listens for this key's storage event too).
    let q = []; try { q = JSON.parse(ls().getItem(PENDING_KEY) || '[]') || []; } catch (e) {}
    q.push(fileId);
    ls().setItem(PENDING_KEY, JSON.stringify(q));
  }

  // A mounted GIF whose manifest says receipt:true passes its files here.
  // TRUST IS THE SIGNATURE, nothing else: the manifest and the viewer HTML
  // are attacker-editable bytes, but nothing is granted unless the embedded
  // receipt verifies against this site's published key — a forged or edited
  // receipt.json simply fails verification and grants nothing.
  async function ingestReceiptFiles(files) {
    const raw = files && files['receipt.json'];
    if (!raw) return null;
    const wrapped = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    const receipt = await verifyReceipt(wrapped.receiptJson, wrapped.sig);
    if (receipt.sku && receipt.appId) {
      purse().grant(receipt.appId, receipt.sku, { tx: receipt.tx, amount: receipt.amount, rail: receipt.rail, at: receipt.at });
    }
    return receipt;
  }

  // The app-facing LICENSE id: the receipt's transaction, stable and unique
  // per purchase, app-scoped by construction (the receipt names one appId).
  // The seller anchors whatever they like to it — a server account, a save
  // namespace, a room identity — which is what turns a shared receipt into a
  // shared IDENTITY rather than a free copy (docs/payments.md).
  async function license(manifest, sku, appBytes) {
    const who = await paidIdentityFor(manifest, appBytes, sku, 'license');
    const ent = purse().entitlement(manifest.appId, sku);
    return entitledTo(ent, who) && ent.tx ? String(ent.tx) : null;
  }

  GifOS.payBroker = {
    charge, entitled, license, ingestReceiptFiles,
    PENDING_KEY,
    // The Settings surface reads and writes through these — the panel owns no
    // storage of its own.
    purse, maxAmountFor, setMaxAmount, fmtUsd,
    DEFAULT_MAX, WORKER_KEY, POLICY_KEY,
  };
})(typeof window !== 'undefined' ? window : globalThis);
