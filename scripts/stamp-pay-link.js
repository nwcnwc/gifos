#!/usr/bin/env node
// Bake site/js/pay.js from STRIPE_PAYMENT_LINK. Called at deploy (or by hand).
// A Payment Link is a public URL, not a secret key. Empty / invalid → no CTA.
// pages.yml cannot be updated by this token (needs `workflow` scope); drop
// `node scripts/stamp-pay-link.js` into the deploy job when that is available.
'use strict';
const fs = require('fs');
const path = require('path');
const raw = String(process.env.STRIPE_PAYMENT_LINK || process.env.GIFOS_PAYMENT_LINK || '').trim();
let link = '';
try {
  const u = new URL(raw);
  if (u.protocol === 'https:' && u.hostname && !u.username && !u.password) link = u.toString();
} catch (e) {}
const out = path.join(__dirname, '..', 'site', 'js', 'pay.js');
fs.writeFileSync(
  out,
  '/* baked at deploy by scripts/stamp-pay-link.js — empty means the store shows no pay CTA */\n' +
  'window.GIFOS_PAY = { link: ' + JSON.stringify(link) + ' };\n'
);
console.log(link ? 'payment CTA: on (host ' + new URL(link).host + ')' : 'payment CTA: off');
