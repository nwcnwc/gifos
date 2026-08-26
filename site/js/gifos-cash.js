/*
 * gifos-cash.js — optional tip / "feature this listing" on the App Store.
 *
 * THIS IS NOT gifos-pay / gifos-charge / x402. Those stay parked on testnet
 * (docs/payments.md). Near-term cash is a public Payment Link the deploy
 * may bake into js/pay.js. No account, no paywall, no SKU on a GIF: the
 * catalog installs free whether a link is configured or not.
 *
 * Pure. Every function is a decision over a string. Unit-tested with no
 * network and no credentials (test/unit/cash-link.js).
 *
 * Attaches to `GifOS.cash`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (GifOS.cash) return;

  function linkFrom(src) {
    if (src && typeof src === 'object' && typeof src.link === 'string') return src.link;
    if (root.GIFOS_PAY && typeof root.GIFOS_PAY.link === 'string') return root.GIFOS_PAY.link;
    return '';
  }

  // A checkout URL is https, has a host, and carries no userinfo. Anything
  // else (http, javascript:, a relative path, an empty string) is "no CTA"
  // — the store must not render a button that goes nowhere, or worse.
  function parse(link) {
    if (typeof link !== 'string') return null;
    const raw = link.trim();
    if (!raw) return null;
    let u;
    try { u = new URL(raw); } catch (e) { return null; }
    if (u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    if (!u.hostname) return null;
    return u;
  }

  // kind is omitted to validate the configured link; 'tip' or 'feature'
  // stamps Stripe's client_reference_id so a payment can be attributed
  // without an account. An already-set reference is left alone.
  function href(link, kind, slug) {
    const u = parse(link);
    if (!u) return '';
    if (kind == null || kind === '') return u.toString();
    if (kind !== 'tip' && kind !== 'feature') return '';
    if (kind === 'feature') {
      if (typeof slug !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(slug)) return '';
    }
    const ref = kind === 'feature' ? 'feature-' + slug.toLowerCase() : 'tip';
    if (!u.searchParams.has('client_reference_id')) u.searchParams.set('client_reference_id', ref);
    return u.toString();
  }

  function configuredLink(src) { return href(linkFrom(src), null); }
  function tipHref(link) { return href(link != null ? link : linkFrom(), 'tip'); }
  function featureHref(slug, link) { return href(link != null ? link : linkFrom(), 'feature', slug); }

  GifOS.cash = { href, configuredLink, tipHref, featureHref };
})(typeof window !== 'undefined' ? window : globalThis);
