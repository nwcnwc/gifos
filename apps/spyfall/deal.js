// Deal one spy and a shared location. Same seed + player ids → same cards.
// Classic script: GifOS drops type=module.
(function (root) {
  'use strict';
  var SF = root.SF = root.SF || {};

  function hash(s) {
    var h = 2166136261 >>> 0, i;
    s = String(s);
    for (i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function rng(seed) {
    var a = hash(seed) || 1;
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rand) {
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(rand() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function deal(seed, playerIds, locations) {
    locations = locations || SF.LOCATIONS;
    if (!playerIds || !playerIds.length) throw new Error('no players');
    if (!locations || !locations.length) throw new Error('no locations');
    var ids = playerIds.slice();
    var rand = rng(String(seed) + '\n' + ids.join('\n'));
    var loc = locations[Math.floor(rand() * locations.length)];
    var spyId = ids[Math.floor(rand() * ids.length)];
    var firstId = ids[Math.floor(rand() * ids.length)];
    var roles = shuffle(loc.roles.slice(), rand);
    var cards = {}, i, id, role, ri = 0;
    var defRole = loc.roles[loc.roles.length - 1];
    for (i = 0; i < ids.length; i++) {
      id = ids[i];
      if (id === spyId) {
        cards[id] = { spy: true, location: null, role: 'Spy' };
      } else {
        role = roles[ri++] || defRole;
        cards[id] = { spy: false, location: loc.name, role: role };
      }
    }
    return {
      location: loc.name,
      spyId: spyId,
      firstId: firstId,
      cards: cards
    };
  }

  function names(locations) {
    return (locations || SF.LOCATIONS).map(function (l) { return l.name; });
  }

  SF.hash = hash;
  SF.rng = rng;
  SF.shuffle = shuffle;
  SF.deal = deal;
  SF.names = names;
})(typeof window !== 'undefined' ? window : globalThis);
