// Pure slot math. No DOM. Tests play the credit loop through this.
(function (g) {
  'use strict';
  var START = 1000;
  var STAKES = [10, 25, 50, 100];
  var REFILL = 1000;

  function middle(symbols) {
    return (symbols || []).map(function (col) { return col[1]; });
  }

  function runLength(m) {
    if (!m || !m.length) return 0;
    var n = 1, i;
    for (i = 1; i < m.length && m[i] === m[0]; i++) n++;
    return n;
  }

  function payout(symbols, stake) {
    stake = stake || 10;
    var m = middle(symbols);
    var n = runLength(m);
    if (n < 3) return 0;
    var seven = m[0] === 'seven';
    if (n === 5) return stake * (seven ? 250 : 100);
    if (n === 4) return stake * (seven ? 100 : 25);
    return stake * (seven ? 50 : 10);
  }

  function applySpin(credits, symbols, stake) {
    stake = stake || 10;
    var win = payout(symbols, stake);
    var next = Math.max(0, credits - stake) + win;
    return { credits: next, win: win, stake: stake };
  }

  function describe(symbols, win) {
    var m = middle(symbols);
    var n = runLength(m);
    if (!win) return m.join(' · ');
    if (n === 5 && m[0] === 'seven') return 'Jackpot — five 7s — ' + win + '!';
    if (n === 5) return 'Five of a kind — ' + win + '!';
    if (n === 4 && m[0] === 'seven') return 'Four 7s — ' + win + '!';
    if (n === 4) return 'Four ' + m[0] + 's — ' + win + '!';
    if (m[0] === 'seven') return 'Three 7s — ' + win + '!';
    return 'Three ' + m[0] + 's — ' + win + '!';
  }

  function clampStake(n) {
    var i;
    n = n | 0;
    for (i = 0; i < STAKES.length; i++) if (STAKES[i] === n) return n;
    return 10;
  }

  function randomGrid(rand) {
    rand = rand || Math.random;
    var names = (g.SLOT_NAMES || []).slice();
    function one() { return names[Math.floor(rand() * names.length)]; }
    function col() { return [one(), one(), one()]; }
    return [col(), col(), col(), col(), col()];
  }

  function grid(mid) {
    var i, out = [];
    for (i = 0; i < 5; i++) out.push(['cherry', mid[i], 'lemon']);
    return out;
  }

  g.SlotsMath = {
    START: START,
    STAKES: STAKES,
    REFILL: REFILL,
    middle: middle,
    runLength: runLength,
    payout: payout,
    applySpin: applySpin,
    describe: describe,
    clampStake: clampStake,
    randomGrid: randomGrid,
    grid: grid
  };
})(typeof window !== 'undefined' ? window : globalThis);
