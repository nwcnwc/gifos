/*
 * pay.js — optional fiat checkout URL for the App Store.
 *
 * Baked by scripts/stamp-pay-link.js from STRIPE_PAYMENT_LINK (repo variable
 * or Actions secret). The committed value is empty: a local checkout, and a
 * deploy with no link set, show no pay CTA. The catalog stays free either
 * way. This file must never hold a secret key — a Payment Link is a public
 * URL, and even that is injected at bake time so it can be rotated without
 * a source commit.
 *
 * window.GIFOS_PAY = { link: '' }
 */
window.GIFOS_PAY = { link: '' };
