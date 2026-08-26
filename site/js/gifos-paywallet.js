/*
 * gifos-paywallet.js — the x402 rail's wallet adapter: connect, build, sign.
 *
 * The broker (gifos-pay-broker.js) decides WHAT is paid — the transfers, the
 * 97/3 split, the trusted display, the human's approval. This file is only
 * HOW a signature is produced for what was already approved: it builds the
 * EIP-3009 TransferWithAuthorization typed data for each transfer and asks a
 * wallet to sign it. It initiates nothing on its own — every entry point is
 * called by the broker after the sheet was answered.
 *
 * Wallet resolution, in order:
 *
 *   1. `window.__gifosTestProvider` — the gate's EIP-1193 fake, so tier 2
 *      exercises THIS file's real code path, not a stub around it.
 *   2. The vendored Base Account SDK (js/vendor/base-account.min.js,
 *      @base-org/account 2.5.10, sha256
 *      fd307e471e738cc16604aa5d5263d7505d6f6b76e45355c977e8c67e985f52fe) —
 *      the passkey-owned smart account the doctrine chose (docs/payments.md
 *      §BASE FIRST). Loaded LAZILY, from our own origin, never a CDN, and
 *      only on the OS page. Signing happens in Coinbase's own account
 *      surface; GifOS holds a connection, not a key.
 *   3. An injected `window.ethereum` (Coinbase Wallet extension and kin) —
 *      an INTERIM rail for tier-3 hand testing on Base Sepolia. It works
 *      today with a wallet a human already trusts; the Base Account is still
 *      the destination, because an extension keeps key custody in the
 *      extension rather than behind a passkey.
 *
 * TESTNET PINNED: the only chain this file will build for is Base Sepolia
 * (eip155:84532); a transfer naming any other network throws before any
 * wallet sees anything. Same doctrine as gifos-x402.js/gifos-charge.js.
 *
 * Attaches to `GifOS.payWallet`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (GifOS.payWallet) return;

  const CHAIN_CAIP = 'eip155:84532';       // Base Sepolia — the ONLY chain
  const CHAIN_ID = 84532;
  const CHAIN_HEX = '0x14a34';
  // USDC's EIP-712 domain on Base Sepolia. The x402 spec carries these in the
  // requirement's `extra` because they vary per token deployment; these are
  // the defaults for the one asset this build allows.
  const DOMAIN_NAME = 'USDC';
  const DOMAIN_VERSION = '2';

  const isAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);

  // ---- pure: the authorization and its typed data ---------------------------
  // Exported for unit tests: everything a wallet is asked to sign is built
  // here, deterministically, from a transfer the broker already validated —
  // plus a fresh random nonce and a short validity window.
  function buildAuthorization(transfer, from, nonceBytes, nowMs) {
    const t = transfer || {};
    if (t.network !== CHAIN_CAIP) throw new Error('payWallet: refusing network "' + t.network + '" — this build signs for Base Sepolia only');
    if (!isAddress(t.to)) throw new Error('payWallet: transfer.to is not an address');
    if (!isAddress(from)) throw new Error('payWallet: payer is not an address');
    if (typeof t.amount !== 'string' || !/^[0-9]+$/.test(t.amount) || BigInt(t.amount) <= 0n) {
      throw new Error('payWallet: amount must be a positive decimal integer string of base units');
    }
    if (!(nonceBytes instanceof Uint8Array) || nonceBytes.length !== 32) throw new Error('payWallet: nonce must be 32 bytes');
    let nonce = '0x';
    for (const b of nonceBytes) nonce += b.toString(16).padStart(2, '0');
    return {
      from,
      to: t.to,
      value: t.amount,
      validAfter: '0',
      // 10 minutes: long enough for a facilitator round-trip, short enough
      // that a leaked signature dies quickly.
      validBefore: String(Math.floor(nowMs / 1000) + 600),
      nonce,
    };
  }

  function typedData(authorization, asset, extra) {
    if (!isAddress(asset)) throw new Error('payWallet: asset is not an address');
    return {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      domain: {
        name: (extra && extra.name) || DOMAIN_NAME,
        version: (extra && extra.version) || DOMAIN_VERSION,
        chainId: CHAIN_ID,
        verifyingContract: asset,
      },
      message: authorization,
    };
  }

  // ---- the provider ---------------------------------------------------------
  let providerP = null;
  function haveVendor() {
    // The vendored SDK is optional in a checkout; absence is a plain answer,
    // not an error. We only know for sure after a load attempt — this is the
    // cheap pre-answer for available().
    return true;
  }
  function available() {
    return !!(root.__gifosTestProvider || root.ethereum || (typeof document !== 'undefined' && haveVendor()));
  }

  function loadVendorSdk() {
    return new Promise((res, rej) => {
      if (root.base && root.base.createBaseAccountSDK) return res(root.base);
      const s = document.createElement('script');
      s.src = 'js/vendor/base-account.min.js';
      s.onload = () => (root.base && root.base.createBaseAccountSDK) ? res(root.base) : rej(new Error('base-account vendor loaded but createBaseAccountSDK missing'));
      s.onerror = () => rej(new Error('no vendored Base Account SDK on this deployment'));
      document.head.appendChild(s);
    });
  }

  function provider() {
    if (providerP) return providerP;
    providerP = (async () => {
      if (root.__gifosTestProvider) return { p: root.__gifosTestProvider, kind: 'test' };
      // Base Account first — it is the doctrine's wallet. The SDK opens
      // Coinbase's own popup; the passkey never touches this page.
      try {
        const base = await loadVendorSdk();
        const sdk = base.createBaseAccountSDK({ appName: 'GifOS', appChainIds: [CHAIN_ID] });
        return { p: sdk.getProvider(), kind: 'base-account' };
      } catch (e) { /* fall through to an injected wallet */ }
      if (root.ethereum) return { p: root.ethereum, kind: 'injected' };
      throw new Error('no wallet is available on this computer');
    })();
    providerP.catch(() => { providerP = null; }); // a failed resolve may be retried
    return providerP;
  }

  async function ensureChain(p) {
    try {
      const id = await p.request({ method: 'eth_chainId' });
      if (parseInt(id, 16) === CHAIN_ID) return;
    } catch (e) { /* some providers only answer after connect; try the switch */ }
    try {
      await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
    } catch (e) {
      // 4902: the wallet has never seen Base Sepolia — offer to add it.
      if (e && (e.code === 4902 || /unrecognized|not added/i.test(String(e.message)))) {
        await p.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: CHAIN_HEX, chainName: 'Base Sepolia',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://sepolia.base.org'],
            blockExplorerUrls: ['https://sepolia.basescan.org'],
          }],
        });
      } else throw e;
    }
  }

  async function address() {
    const { p } = await provider();
    const accounts = await p.request({ method: 'eth_requestAccounts' });
    if (!accounts || !isAddress(accounts[0])) throw new Error('the wallet returned no account');
    await ensureChain(p);
    return accounts[0];
  }

  // ---- sign what the broker built -------------------------------------------
  // One signature per transfer. The Base Account / wallet shows its own
  // prompt for each; the trusted description of WHAT is being paid was
  // already shown by the broker's sheet — this step is authentication.
  async function signTransfers(transfers) {
    if (!Array.isArray(transfers) || !transfers.length) throw new Error('payWallet: nothing to sign');
    const { p } = await provider();
    const from = await address();
    const out = [];
    for (const t of transfers) {
      const nonce = new Uint8Array(32);
      (root.crypto || require('crypto').webcrypto).getRandomValues(nonce);
      const authorization = buildAuthorization(t, from, nonce, Date.now());
      const td = typedData(authorization, t.asset, t.extra);
      const signature = await p.request({
        method: 'eth_signTypedData_v4',
        params: [from, JSON.stringify(td)],
      });
      if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) {
        throw new Error('the wallet returned no signature');
      }
      out.push({ signature, authorization });
    }
    return out;
  }

  GifOS.payWallet = {
    CHAIN_CAIP, CHAIN_ID,
    available, address, signTransfers,
    // pure, for the unit tier
    buildAuthorization, typedData,
  };
})(typeof window !== 'undefined' ? window : globalThis);
