// Pure lock-room rules. Classic IIFE. No DOM, no gifos.
// Screens a stranger actually hits: home, locked, open, waiting, gone.
(function (root) {
  'use strict';

  var LIFE_MS = {
    '1h': 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000
  };

  function isEmpty(s) {
    return !String(s == null ? '' : s).trim();
  }

  function makeRow(out, opts, me, now) {
    opts = opts || {};
    me = me || { id: 'local' };
    now = now || 0;
    var life = opts.lifetime || '';
    var ms = LIFE_MS[life] || 0;
    return {
      id: 'secret',
      ct: out.ct,
      iv: out.iv,
      salt: out.salt || null,
      key: out.key || null,
      hasPass: !!out.hasPass,
      burn: !!opts.burn,
      burned: false,
      lifetime: life,
      expiresAt: ms ? now + ms : 0,
      by: me.id,
      at: now
    };
  }

  function burnRow(me, now) {
    return { id: 'secret', burned: true, at: now || 0, by: (me && me.id) || 'local' };
  }

  function status(rec, now) {
    if (!rec) return 'empty';
    if (rec.burned) return 'burned';
    if (!rec.ct) return rec.burned ? 'burned' : 'empty';
    now = now || 0;
    if (rec.expiresAt && now >= rec.expiresAt) return 'expired';
    return 'locked';
  }

  // Owner locks. Guest waits, opens, or sees gone. Never the lock form.
  function screen(rec, me, isOwner, now) {
    var st = status(rec, now);
    if (st === 'empty') return isOwner ? 'home' : 'waiting';
    if (st === 'burned' || st === 'expired') return 'gone';
    if (isOwner) return 'locked';
    return 'open';
  }

  function remain(expiresAt, now) {
    if (!expiresAt) return '';
    var s = Math.floor((expiresAt - (now || 0)) / 1000);
    if (s <= 0) return 'Expired';
    if (s < 60) return s + 's left';
    if (s < 3600) return Math.floor(s / 60) + ' min left';
    if (s < 86400) return Math.floor(s / 3600) + ' h left';
    return Math.floor(s / 86400) + ' d left';
  }

  function lifeLabel(life) {
    if (life === '1h') return '1 hour';
    if (life === '1d') return '1 day';
    if (life === '1w') return '1 week';
    return 'Until you burn it';
  }

  function metaBits(rec, now) {
    if (!rec) return [];
    var bits = [];
    bits.push(rec.hasPass ? 'Passphrase on' : 'Anyone in the room');
    bits.push(rec.burn ? 'Burns after reading' : 'Stays until burned');
    if (rec.expiresAt) bits.push(remain(rec.expiresAt, now) || lifeLabel(rec.lifetime));
    else bits.push(lifeLabel(rec.lifetime));
    return bits;
  }

  function goneCopy(rec, now) {
    var st = status(rec, now);
    if (st === 'expired') {
      return {
        title: 'Expired',
        lede: 'This secret ran out of time. It is gone — nothing left to open.'
      };
    }
    return {
      title: 'Already burned',
      lede: 'This secret was opened and burned. It will not open again.'
    };
  }

  root.YopassCore = {
    LIFE_MS: LIFE_MS,
    isEmpty: isEmpty,
    makeRow: makeRow,
    burnRow: burnRow,
    status: status,
    screen: screen,
    remain: remain,
    lifeLabel: lifeLabel,
    metaBits: metaBits,
    goneCopy: goneCopy
  };
})(typeof window !== 'undefined' ? window : globalThis);
