/* simplefin.js — the one aggregator that fits a computer with no server.
 *
 * SimpleFIN exists because Mint died. The user sets up a connection at a
 * SimpleFIN server (the Bridge is the usual one), is handed a one-time SETUP
 * TOKEN, and claims it ONCE for an ACCESS URL that returns every account they
 * connected. That is the whole protocol, and it is the only reason this app
 * can pull balances at all: Plaid, Teller and MX all need a server-side secret
 * and GifOS has nowhere to keep one.
 *
 * TWO THINGS ABOUT THE ACCESS URL, both of which have bitten:
 *
 *   It carries the credential INSIDE the URL — https://<user>:<pass>@host/… —
 *   and a browser fetch() REJECTS such a URL outright, with a TypeError, before
 *   any request is made. It has to be split and re-sent as an Authorization:
 *   Basic header. GifOS Settings does that splitting when the entry is saved
 *   (desktop.js splitCreds), which is why this file never sees the URL and
 *   never sees the credential: it calls gifos.api('simplefin', …), the runtime
 *   attaches it, and pins the request to that host.
 *
 *   The host is different for every user, and self-hosted servers are a normal
 *   thing to run. That is exactly why this goes through gifos.api (a
 *   user-configured base URL) and not capabilities.network, whose allow-list is
 *   fixed in the manifest and could never name it.
 *
 * The response has been through a version change and both shapes are live in
 * the wild: the older one puts an `org` on every account and errors in
 * `errors`; the newer one hoists organisations into `connections` and renames
 * the error list `errlist`. Reading only one of them means a user on the other
 * server gets an app that says they have no accounts. Both are read.
 */
(function (root) {
  'use strict';

  var DAY = 86400;

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  /* Normalise either response shape to one list. `org` is what the user will
   * recognise — it is the bank's name, and without it a screen of accounts
   * called "Checking" and "Savings" is unusable. */
  function normalize(data) {
    var conns = {};
    (data.connections || []).forEach(function (c) {
      conns[c.conn_id] = c.name || c.org_id || '';
    });
    var accounts = (data.accounts || []).map(function (a) {
      var org = a.org || null;
      var orgName = org ? (org.name || org.domain || '') : (conns[a.conn_id] || '');
      return {
        id: String(a.id || ''),
        name: String(a.name || 'Account'),
        org: String(orgName || ''),
        orgUrl: (org && (org.url || org['sfin-url'])) || '',
        currency: String(a.currency || 'USD'),
        balance: num(a.balance),
        available: a['available-balance'] === undefined ? null : num(a['available-balance']),
        balanceDate: a['balance-date'] ? isoOf(a['balance-date']) : '',
        transactions: (a.transactions || []).map(function (t) {
          return {
            // SimpleFIN gives every transaction a stable id. That is worth a
            // lot: the ledger keys on it and re-pulling an overlapping window
            // cannot duplicate a thing, which is the failure a CSV import has
            // to work to avoid.
            srcId: String(t.id || ''),
            date: isoOf(t.transacted_at || t.posted),
            desc: String(t.description || '').slice(0, 200),
            amount: Math.round(num(t.amount) * 100) / 100,
            pending: !!t.pending,
            category: '',
          };
        }).filter(function (t) { return t.date; }),
      };
    });
    // errlist (newer) and errors (older) mean the same thing: some connection
    // did not answer. Surfaced rather than swallowed — a silent partial pull
    // is a net worth that is quietly wrong.
    var errs = (data.errlist || data.errors || []).map(function (e) {
      return typeof e === 'string' ? e : String(e.msg || e.code || 'error');
    });
    return { accounts: accounts, errors: errs };
  }

  function isoOf(unix) {
    var n = Number(unix);
    if (!isFinite(n) || !n) return '';
    var d = new Date(n * 1000);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
  }

  /* One call. `sinceDays` bounds the transaction window — pulling everything
   * every time is slow and pointless once the ledger has the history, and the
   * server is somebody's free tier. `balancesOnly` is the cheap call used to
   * refresh the net worth without dragging a year of rows across. */
  function pull(opts) {
    opts = opts || {};
    var query = {};
    if (opts.balancesOnly) query['balances-only'] = '1';
    else {
      var days = opts.sinceDays || 90;
      query['start-date'] = String(Math.floor(Date.now() / 1000) - days * DAY);
      if (opts.pending) query.pending = '1';
    }
    return root.gifos.api('simplefin', { path: '/accounts', method: 'GET', query: query, as: 'json' })
      .then(function (r) {
        if (!r || !r.ok) throw new Error(httpNote(r));
        var data = r.json || {};
        if (!data.accounts) throw new Error('SimpleFIN answered, but with nothing that looks like accounts.');
        return normalize(data);
      });
  }

  // The three failures a person can actually act on, in words that say what to
  // do. Anything else keeps its status code, because a made-up explanation is
  // worse than a number they can search for.
  function httpNote(r) {
    var s = r && r.status;
    if (s === 401 || s === 403) return 'SimpleFIN refused the credential. Re-claim your setup token and paste the new access URL into Settings → Third-party APIs.';
    if (s === 402) return 'SimpleFIN says this connection needs payment before it will answer.';
    if (s === 404) return 'That address answered, but there is no /accounts there — check the access URL is the whole thing SimpleFIN gave you.';
    return 'SimpleFIN answered with ' + (s || 'no status') + '.';
  }

  root.FinSimpleFIN = { pull: pull, normalize: normalize, isoOf: isoOf };
})(typeof window !== 'undefined' ? window : this);
