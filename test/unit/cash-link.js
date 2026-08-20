// gifos-cash: the store's optional tip / feature-listing checkout.
//
// Pure decisions over a URL string. No network, no Stripe, no secret. The
// committed pay.js is empty on purpose — a missing link is the normal state
// and must not paywall the catalog.
const path = require('path');
require(path.join(__dirname, '..', '..', 'site', 'js', 'gifos-cash.js'));
const C = globalThis.GifOS.cash;

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

const LINK = 'https://buy.stripe.com/test_gifos';

check('an empty link is no CTA', C.href('') === '' && C.href(null) === '' && C.href(undefined) === '');
check('whitespace alone is no CTA', C.href('   ') === '');
check('http is refused', C.href('http://buy.stripe.com/test_gifos') === '');
check('javascript: is refused', C.href('javascript:alert(1)') === '');
check('a relative path is refused', C.href('/store') === '');
check('userinfo in the URL is refused', C.href('https://user:pass@buy.stripe.com/test_gifos') === '');
check('a garbage string is refused', C.href('not a url') === '');
check('https with a host is accepted', C.href(LINK) === LINK + '/' || C.href(LINK) === LINK, C.href(LINK));

const tip = C.href(LINK, 'tip');
check('tip stamps client_reference_id=tip', /[?&]client_reference_id=tip(?:&|$)/.test(tip), tip);
check('an unknown kind is refused rather than guessed at', C.href(LINK, 'sku') === '');
check('feature without a slug is refused', C.href(LINK, 'feature') === '' && C.href(LINK, 'feature', '') === '');
check('a hostile feature slug is refused', C.href(LINK, 'feature', '../x') === '' && C.href(LINK, 'feature', 'a b') === '');

const feat = C.href(LINK, 'feature', 'anyroad');
check('feature stamps client_reference_id=feature-<slug>',
  /[?&]client_reference_id=feature-anyroad(?:&|$)/.test(feat), feat);

const preset = C.href(LINK + '?client_reference_id=already', 'tip');
check('an already-set reference is left alone',
  /client_reference_id=already/.test(preset) && !/client_reference_id=tip/.test(preset), preset);

// configuredLink / tipHref / featureHref read GIFOS_PAY when no arg is given.
globalThis.GIFOS_PAY = { link: '' };
check('configuredLink is empty when pay.js is empty', C.configuredLink() === '');
check('tipHref is empty when pay.js is empty', C.tipHref() === '');
check('featureHref is empty when pay.js is empty', C.featureHref('anyroad') === '');

globalThis.GIFOS_PAY = { link: LINK };
check('configuredLink accepts the baked https URL', /^https:\/\/buy\.stripe\.com\//.test(C.configuredLink()));
check('tipHref tags a baked link as a tip', /client_reference_id=tip/.test(C.tipHref()));
check('featureHref tags a baked link with the listing slug',
  /client_reference_id=feature-chess-grandmaster/.test(C.featureHref('chess-grandmaster')));
check('an explicit link wins over GIFOS_PAY',
  /example\.com/.test(C.tipHref('https://example.com/pay')));

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
process.exit(failures ? 1 : 0);
