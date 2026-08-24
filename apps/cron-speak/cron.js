/* Cron Speak — field split, next fire times, honest errors.
 * Classic IIFE. No fetch. Unix 5-field is the home dialect; 6/7 and @specials work too. */
(function (root) {
  'use strict';

  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  var DOWS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  var SPECIALS = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *'
  };
  var NAMES = [
    { id: 'minute', short: 'min', min: 0, max: 59 },
    { id: 'hour', short: 'hour', min: 0, max: 23 },
    { id: 'day of month', short: 'day', min: 1, max: 31 },
    { id: 'month', short: 'mon', min: 1, max: 12 },
    { id: 'day of week', short: 'dow', min: 0, max: 7 }
  ];
  var SUGGEST = {
    minute: ['*', '0', '*/5', '*/15', '0,30', '0-30/5'],
    hour: ['*', '0', '9', '12', '17', '9-17'],
    'day of month': ['*', '1', '15', '1,15', '1-7'],
    month: ['*', '1', '6', '1-6', '*/3'],
    'day of week': ['*', '1-5', '0', '6', '1,3,5']
  };

  function fail(msg) {
    var e = new Error(msg);
    e.cron = true;
    throw e;
  }

  function nint(s, names) {
    var t = String(s).toLowerCase();
    if (names && names[t] != null) return names[t];
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    fail("'" + s + "' is not a number or a name I know.");
  }

  function expandAtom(atom, min, max, names) {
    var step = 1;
    var body = atom;
    var slash = atom.indexOf('/');
    if (slash >= 0) {
      body = atom.slice(0, slash) || '*';
      step = parseInt(atom.slice(slash + 1), 10);
      if (!isFinite(step) || step < 1) fail('Step must be a number ≥ 1.');
    }
    var lo, hi;
    if (body === '*' || body === '') {
      lo = min; hi = max;
    } else if (body.indexOf('-') >= 0) {
      var bits = body.split('-');
      if (bits.length !== 2) fail('Range looks wrong: ' + atom);
      lo = nint(bits[0], names);
      hi = nint(bits[1], names);
    } else {
      lo = hi = nint(body, names);
    }
    if (lo < min || hi > max || lo > max || hi < min) {
      fail('Value out of range ' + min + '–' + max + ' in ' + atom + '.');
    }
    var span = max - min + 1;
    var out = [];
    var v;
    for (v = min; v <= max; v++) {
      var inRange = lo <= hi ? (v >= lo && v <= hi) : (v >= lo || v <= hi);
      if (!inRange) continue;
      var dist = (v - lo + span) % span;
      if (dist % step === 0) out.push(v);
    }
    if (!out.length) fail('Nothing in range for ' + atom + '.');
    return out;
  }

  function expandField(field, min, max, names) {
    var raw = String(field || '').trim();
    if (!raw) fail('A field is empty.');
    if (/[L#W]/i.test(raw) && !/^[A-Za-z]+$/.test(raw)) {
      return { quartz: true, raw: raw };
    }
    var parts = raw.split(',');
    var seen = {};
    var i, j, vals;
    for (i = 0; i < parts.length; i++) {
      vals = expandAtom(parts[i].trim(), min, max, names);
      for (j = 0; j < vals.length; j++) seen[vals[j]] = true;
    }
    var list = [];
    for (i = min; i <= max; i++) if (seen[i]) list.push(i);
    return { raw: raw, list: list };
  }

  function splitExpr(expr) {
    var s = String(expr || '').trim().replace(/\s+/g, ' ');
    if (!s) fail('Type a cron expression.');
    if (s.charAt(0) === '@') {
      if (s === '@reboot') return { kind: 'reboot', display: s, five: null };
      var exp = SPECIALS[s.toLowerCase()];
      if (!exp) fail('Unknown special. Try @hourly, @daily, @weekly, @monthly or @yearly.');
      return { kind: 'special', display: s, five: exp, expanded: exp };
    }
    var parts = s.split(' ');
    if (parts.length < 5) {
      fail('Need five fields: minute hour day-of-month month day-of-week. This has ' + parts.length + '.');
    }
    if (parts.length > 7) fail('Too many fields (' + parts.length + '). Unix cron is five; a sixth is seconds.');
    var five;
    var seconds = null;
    var year = null;
    if (parts.length === 5) {
      five = parts;
    } else if (parts.length === 6) {
      var last = parts[5];
      if (/^\d{4}$/.test(last) || last === '*') {
        five = parts.slice(0, 5);
        year = last;
      } else {
        seconds = parts[0];
        five = parts.slice(1);
      }
    } else {
      seconds = parts[0];
      five = parts.slice(1, 6);
      year = parts[6];
    }
    return {
      kind: seconds ? 'six' : (year ? 'year' : 'five'),
      display: s,
      five: five.join(' '),
      seconds: seconds,
      year: year,
      parts: five
    };
  }

  function parse(expr, opts) {
    var split = splitExpr(expr);
    if (split.kind === 'reboot') {
      return { kind: 'reboot', display: '@reboot', fields: [], five: null };
    }
    var five = (split.parts || split.five.split(' '));
    var fields = [];
    var i, spec, names;
    for (i = 0; i < 5; i++) {
      names = i === 3 ? MONTHS : (i === 4 ? DOWS : null);
      spec = expandField(five[i], NAMES[i].min, NAMES[i].max, names);
      fields.push({
        id: NAMES[i].id,
        short: NAMES[i].short,
        value: five[i],
        min: NAMES[i].min,
        max: NAMES[i].max,
        list: spec.list || null,
        quartz: !!spec.quartz
      });
    }
    if (opts && opts.dow0 === false && fields[4].list) {
      var mapped = {};
      fields[4].list.forEach(function (n) {
        var unix = n === 7 ? 6 : (n - 1);
        if (unix < 0) unix = 6;
        mapped[unix] = true;
      });
      fields[4].list = [0, 1, 2, 3, 4, 5, 6].filter(function (d) { return mapped[d]; });
    } else if (fields[4].list) {
      var u = {};
      fields[4].list.forEach(function (n) {
        if (n === 7) u[0] = true;
        else u[n] = true;
      });
      fields[4].list = [0, 1, 2, 3, 4, 5, 6].filter(function (d) { return u[d]; });
    }
    var seconds = { list: [0] };
    if (split.seconds != null && split.seconds !== '') {
      seconds = expandField(split.seconds, 0, 59, null);
    }
    return {
      kind: split.kind,
      display: split.display,
      five: split.five,
      fields: fields,
      seconds: seconds,
      year: split.year || null,
      quartz: fields.some(function (f) { return f.quartz; }) || !!(seconds && seconds.quartz)
    };
  }

  function dim(d) {
    return {
      y: d.getFullYear(),
      m: d.getMonth() + 1,
      d: d.getDate(),
      h: d.getHours(),
      min: d.getMinutes(),
      s: d.getSeconds(),
      dow: d.getDay()
    };
  }

  function lastDom(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function matches(p, t) {
    if (p.year && p.year !== '*' && String(t.y) !== String(p.year)) return false;
    var f = p.fields;
    if (f[0].list && f[0].list.indexOf(t.min) < 0) return false;
    if (f[1].list && f[1].list.indexOf(t.h) < 0) return false;
    if (f[3].list && f[3].list.indexOf(t.m) < 0) return false;
    var domStar = f[2].value === '*' || f[2].value === '?';
    var dowStar = f[4].value === '*' || f[4].value === '?';
    var domOk = !f[2].list || f[2].list.indexOf(t.d) >= 0;
    var dowOk = !f[4].list || f[4].list.indexOf(t.dow) >= 0;
    if (!domStar && !dowStar) {
      if (!(domOk || dowOk)) return false;
    } else {
      if (!domOk || !dowOk) return false;
    }
    if (t.d > lastDom(t.y, t.m)) return false;
    if (p.seconds && p.seconds.list && p.seconds.list.indexOf(t.s) < 0) return false;
    return true;
  }

  function nextTimes(expr, from, n, opts) {
    n = n || 5;
    var p = parse(expr, opts);
    if (p.kind === 'reboot') return { reboot: true, times: [] };
    if (p.quartz) return { quartz: true, times: [] };
    var out = [];
    var d = new Date(from.getTime());
    var useSec = p.seconds && p.seconds.list && !(p.seconds.list.length === 1 && p.seconds.list[0] === 0);
    if (useSec) {
      d.setMilliseconds(0);
      d.setSeconds(d.getSeconds() + 1);
    } else {
      d.setSeconds(0, 0);
      d.setMinutes(d.getMinutes() + 1);
    }
    var guard = 0;
    var cap = useSec ? (14 * 24 * 3600) : (400 * 24 * 60);
    while (out.length < n && guard++ < cap) {
      if (matches(p, dim(d))) out.push(new Date(d.getTime()));
      if (useSec) d.setSeconds(d.getSeconds() + 1);
      else d.setMinutes(d.getMinutes() + 1);
    }
    return { times: out, kind: p.kind, five: p.five };
  }

  function phrase(value) {
    var v = String(value || '').trim();
    if (v === '*' || v === '?') return 'every';
    if (v.indexOf('*/') === 0) return 'every ' + v.slice(2);
    if (v.indexOf(',') >= 0) return v.split(',').join(', ');
    if (v.indexOf('-') >= 0 && v.indexOf('/') >= 0) return v.replace('/', ' step ');
    if (v.indexOf('-') >= 0) return v.replace('-', '–');
    return v;
  }

  function humanError(err, expr) {
    var m = String(err && err.message || err || '').replace(/^Error:\s*/i, '');
    var s = String(expr || '').trim();
    if (!s) return 'Type a cron expression.';
    if (s === '@reboot' || /reboot/i.test(m)) return 'Next boot of this machine — not a clock time.';
    if (/Unknown special/i.test(m)) return 'Unknown special. Try @hourly, @daily, @weekly, @monthly or @yearly.';
    if (/only \d+ part/i.test(m) || /Need five fields/i.test(m)) {
      return 'Need five fields: minute hour day-of-month month day-of-week.';
    }
    if (/too many/i.test(m)) return 'Too many fields. Unix cron is five; a sixth is seconds.';
    if (/empty/i.test(m) && /expression/i.test(m)) return 'Type a cron expression.';
    return m;
  }

  function formatStamp(d, h24) {
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var hh = d.getHours();
    var mm = d.getMinutes();
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    var time;
    if (h24) time = pad(hh) + ':' + pad(mm);
    else {
      var ap = hh >= 12 ? 'PM' : 'AM';
      var h = hh % 12; if (!h) h = 12;
      time = h + ':' + pad(mm) + ' ' + ap;
    }
    return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + '  ' + time;
  }

  var api = {
    SPECIALS: SPECIALS,
    NAMES: NAMES,
    SUGGEST: SUGGEST,
    splitExpr: splitExpr,
    parse: parse,
    nextTimes: nextTimes,
    phrase: phrase,
    humanError: humanError,
    formatStamp: formatStamp
  };
  root.CronTalk = api;
})(typeof window !== 'undefined' ? window : this);
