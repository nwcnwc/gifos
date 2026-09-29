// Bundle-time stand-in for Node's `crypto`, aliased in pay/wrangler.toml.
//
// The Worker verifies app signatures through gifos-ed.js, whose js fallback
// is the vendored tweetnacl (site/js/vendor/nacl-fast.js, pinned by sha256,
// never edited). tweetnacl picks its random source at load: `self.crypto`
// first — which a Worker always has — and `require('crypto')` only when that
// is missing. The Worker never takes that branch, but the bundler still has
// to resolve the name, so it resolves here. Nothing in the Worker reads it.
export default {};
