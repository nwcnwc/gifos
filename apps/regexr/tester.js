/*
 * In-thread JS matcher — BrowserSolver.js algorithm, no Worker.
 * Cap + empty-match guard instead of the 250ms worker timeout.
 */
(function (root) {
  'use strict';

  var MAX_MATCHES = 5000;
  var BUDGET_MS = 120;
  var ESC = { n: '\n', r: '\r', t: '\t', '\\': '\\' };
  var ESC_RE = /\\([nrt\\]|u([A-Fa-f0-9]{4}))/g;

  function unescSubst(str) {
    if (!str) return '';
    return String(str).replace(ESC_RE, function (a, b, c) {
      if (c) return String.fromCharCode(parseInt(c, 16));
      return ESC[b] != null ? ESC[b] : a;
    });
  }

  function compile(pattern, flags) {
    try {
      return { re: new RegExp(pattern, flags) };
    } catch (e) {
      return { error: { id: 'regexparse', name: e.name, message: e.message } };
    }
  }

  function groupsOf(match) {
    var g = [];
    for (var i = 1; i < match.length; i++) g.push({ s: match[i], n: i });
    var named = match.groups || null;
    return { list: g, named: named };
  }

  function solveText(pattern, flags, text) {
    var c = compile(pattern, flags);
    if (c.error) return { error: c.error, matches: [], time: null };
    var re = c.re;
    var matches = [];
    var error = null;
    var t0 = (root.performance && performance.now) ? performance.now() : Date.now();
    var last = -1;
    var src = String(text == null ? '' : text);
    if (!src.length && !pattern) return { matches: [], time: 0, error: null };
    try {
      var match;
      while ((match = re.exec(src))) {
        if (last === re.lastIndex) {
          error = { id: 'infinite', warning: true };
          re.lastIndex++;
        }
        last = re.lastIndex;
        var g = groupsOf(match);
        matches.push({
          i: match.index,
          l: match[0].length,
          s: match[0],
          groups: g.list,
          named: g.named
        });
        if (!re.global) break;
        if (matches.length >= MAX_MATCHES) {
          error = error || { id: 'capped', warning: true, message: 'Stopped after ' + MAX_MATCHES + ' matches.' };
          break;
        }
        var now = (root.performance && performance.now) ? performance.now() : Date.now();
        if (now - t0 > BUDGET_MS) {
          error = error || { id: 'timeout', warning: true, message: 'Stopped after ' + BUDGET_MS + 'ms.' };
          break;
        }
      }
    } catch (e) {
      return { error: { id: 'regexexec', name: e.name, message: e.message }, matches: matches, time: null };
    }
    var t1 = (root.performance && performance.now) ? performance.now() : Date.now();
    return { matches: matches, error: error, time: t1 - t0 };
  }

  function replaceAll(pattern, flags, text, subst) {
    var c = compile(pattern, flags);
    if (c.error) return { error: c.error, result: '' };
    var str = unescSubst(subst);
    try {
      return { result: String(text == null ? '' : text).replace(c.re, str) };
    } catch (e) {
      return { error: { id: 'replace', message: e.message }, result: '' };
    }
  }

  function listAll(pattern, flags, text, delim) {
    var c = compile(pattern, flags.replace('g', '') + (flags.indexOf('g') >= 0 ? '' : ''));
    if (c.error) return { error: c.error, result: '' };
    var src = String(text == null ? '' : text);
    var str = unescSubst(delim == null ? '$&\\n' : delim);
    var re;
    try { re = new RegExp(pattern, flags.replace('g', '')); }
    catch (e) { return { error: { id: 'regexparse', message: e.message }, result: '' }; }
    var result = '', trimR = 0;
    if (str.search(/\$[&1-9`']/) === -1) {
      trimR = str.length;
      str = '$&' + str;
    }
    var guard = 0;
    while (src.length && guard++ < MAX_MATCHES) {
      var ref = src.replace(re, '\b');
      var empty = ref.length > src.length;
      var index = ref.indexOf('\b');
      if (index === -1) break;
      var repl = src.replace(re, str);
      result += repl.substr(index, repl.length - ref.length + 1);
      src = ref.substr(index + (empty ? 2 : 1));
    }
    if (trimR) result = result.substr(0, result.length - trimR);
    return { result: result };
  }

  function runTests(pattern, flags, tests) {
    var c = compile(pattern, flags);
    if (c.error) return { error: c.error, results: [] };
    var out = [];
    for (var i = 0; i < tests.length; i++) {
      var t = tests[i];
      var re;
      try { re = new RegExp(pattern, flags); } catch (e) {
        out.push({ id: t.id, pass: false, match: null });
        continue;
      }
      re.lastIndex = 0;
      var m = re.exec(String(t.text || ''));
      var match = m ? { i: m.index, l: m[0].length, s: m[0] } : null;
      var pass = false;
      if (t.type === 'none') pass = !match;
      else if (t.type === 'all') pass = !!(match && match.i === 0 && match.l === String(t.text || '').length);
      else pass = !!match;
      out.push({ id: t.id, pass: pass, match: match });
    }
    return { results: out, error: null };
  }

  function byId(node, id, acc) {
    if (!node) return acc;
    if (node.id) acc[node.id] = node;
    var kids = node.kids;
    if (kids) for (var i = 0; i < kids.length; i++) byId(kids[i], id, acc);
    if (node.misc && node.misc.kids) {
      for (var j = 0; j < node.misc.kids.length; j++) byId(node.misc.kids[j], id, acc);
    }
    return acc;
  }

  var refMap = null;
  function map() {
    if (refMap) return refMap;
    refMap = {};
    if (root.RegExrReference) byId(root.RegExrReference, null, refMap);
    return refMap;
  }

  /* Plain-English walk of a token. Upstream Reference.fillTags + getChar /
   * getInsensitive / getQuant — a leftover `{{getChar(prev)}}` is not a tip. */
  var NONPRINTING = {
    0: 'NULL', 1: 'SOH', 2: 'STX', 3: 'ETX', 4: 'EOT', 5: 'ENQ', 6: 'ACK',
    7: 'BELL', 8: 'BS', 9: 'TAB', 10: 'LINE FEED', 11: 'VERTICAL TAB',
    12: 'FORM FEED', 13: 'CARRIAGE RETURN', 14: 'SO', 15: 'SI', 16: 'DLE',
    17: 'DC1', 18: 'DC2', 19: 'DC3', 20: 'DC4', 21: 'NAK', 22: 'SYN',
    23: 'ETB', 24: 'CAN', 25: 'EM', 26: 'SUB', 27: 'ESC', 28: 'FS', 29: 'GS',
    30: 'RS', 31: 'US', 32: 'SPACE', 127: 'DEL'
  };
  var UNICODE_CAT = {
    C: 'Other', Cc: 'Control', Cf: 'Format', Cn: 'Unassigned', Co: 'Private use',
    Cs: 'Surrogate', L: 'Letter', 'L&': 'Any letter ', Ll: 'Lower case letter',
    Lm: 'Modifier letter', Lo: 'Other letter', Lt: 'Title case letter',
    Lu: 'Upper case letter', M: 'Mark', Mc: 'Spacing mark', Me: 'Enclosing mark',
    Mn: 'Non-spacing mark', N: 'Number', Nd: 'Decimal number', Nl: 'Letter number',
    No: 'Other number', P: 'Punctuation', Pc: 'Connector punctuation',
    Pd: 'Dash punctuation', Pe: 'Close punctuation', Pf: 'Final punctuation',
    Pi: 'Initial punctuation', Po: 'Other punctuation', Ps: 'Open punctuation',
    S: 'Symbol', Sc: 'Currency symbol', Sk: 'Modifier symbol',
    Sm: 'Mathematical symbol', So: 'Other symbol', Z: 'Separator',
    Zl: 'Line separator', Zp: 'Paragraph separator', Zs: 'Space separator'
  };

  function stripTags(s) {
    return String(s == null ? '' : s).replace(/<[^>]+>/g, '');
  }

  function getNodeForToken(token) {
    if (!token) return null;
    var m = map();
    var errId = token.error && token.error.id;
    var id = (errId && m[errId]) ? errId
      : m[token.type] ? token.type
      : m[token.clss] ? token.clss
      : errId || token.type || token.clss;
    if (token.clss === 'quant') id = 'quant';
    if (token.clss === 'esc' && token.type !== 'escsequence') id = 'escchar';
    var node = m[id];
    while (node && node.proxy) node = m[node.proxy];
    return node || null;
  }

  function getChar(token) {
    if (!token || token.code == null) return '';
    var named = NONPRINTING[token.code];
    if (named) return named;
    return '"' + String.fromCharCode(token.code) + '"';
  }

  function getQuant(token) {
    if (!token) return '';
    var min = token.min, max = token.max;
    return min === max ? String(min) : max === -1 ? min + ' or more' : 'between ' + min + ' and ' + max;
  }

  function getUniCat(token) {
    return (token && UNICODE_CAT[token.value]) || '[Unrecognized]';
  }

  function getModes(token) {
    if (!token) return '';
    var str = token.on ? ' Enable "' + token.on + '".' : '';
    if (token.off) str += ' Disable "' + token.off + '".';
    return str;
  }

  function getInsensitive(token) {
    if (token && token.code) {
      var chr = String.fromCharCode(token.code);
      if (chr.toLowerCase() === chr.toUpperCase()) return '';
    }
    return token && token.modes ? 'Case ' + (token.modes.i ? 'in' : '') + 'sensitive.' : '';
  }

  function getDotAll(token) {
    return (token && token.modes && token.modes.s ? 'including' : 'except') + ' line breaks';
  }

  function getLabel(token) {
    var node = getNodeForToken(token);
    return node ? node.label || node.id || '' : (token && token.type) || '';
  }

  function getDescRaw(token) {
    var node = getNodeForToken(token);
    return node ? node.desc || '' : '';
  }

  function getLazy(token) {
    return token && token.modes && token.modes.U ? 'greedy' : 'lazy';
  }

  function getLazyFew(token) {
    return token && token.modes && token.modes.U ? 'many' : 'few';
  }

  function getEscChars() {
    var o = root.RegExrProfiles && root.RegExrProfiles.js && root.RegExrProfiles.js.escChars;
    var str = '';
    if (o) for (var n in o) str += n;
    return str;
  }

  var FUNCTS = {
    getChar: getChar,
    getQuant: getQuant,
    getUniCat: getUniCat,
    getModes: getModes,
    getInsensitive: getInsensitive,
    getDotAll: getDotAll,
    getLabel: getLabel,
    getDesc: function (token) { return stripTags(getDescRaw(token)); },
    getLazy: getLazy,
    getLazyFew: getLazyFew,
    getEscChars: getEscChars
  };

  function fillTags(str, data) {
    if (!str) return '';
    str = String(str);
    var match;
    while ((match = str.match(/\{\{~?[\w.()]*\}\}/))) {
      var val = match[0].substring(2, match[0].length - 2);
      if (val.charAt(0) === '~') val = val.slice(1);
      var call = val.match(/\([\w.]*\)/);
      var f = null;
      if (call) {
        f = val.slice(0, call.index);
        val = call[0].slice(1, -1);
      }
      var o = data, parts = val.split('.'), i;
      for (i = 0; i < parts.length; i++) {
        if (parts[i] && o) o = o[parts[i]];
      }
      val = o;
      if (f) val = FUNCTS[f] ? FUNCTS[f](val) : '';
      if (val == null) val = '';
      str = str.replace(match[0], stripTags(val));
    }
    return stripTags(str).replace(/[ \t]+/g, ' ').replace(/\s+\./g, '.').trim();
  }

  function labelOf(token) {
    var lab = getLabel(token) || token.type || token.clss || 'token';
    if (token.type === 'group' && token.num) lab += ' #' + token.num;
    return lab ? lab.charAt(0).toUpperCase() + lab.slice(1) : lab;
  }

  function descOf(token) {
    var node = getNodeForToken(token);
    if (!node) return '';
    return fillTags(node.tip || node.desc || '', token);
  }

  function errorText(err, token) {
    if (!err) return '';
    if (err.message) return err.message;
    var errors = (root.RegExrReference && root.RegExrReference.errors) || {};
    var t = errors[err.id];
    if (t) return fillTags(String(t), token || err);
    return err.id || 'Error';
  }

  function walkExplain(token) {
    var rows = [];
    if (!token) return rows;
    var t = token;
    while (t && t.type !== 'close') {
      if (t.type !== 'open' && !t.proxy && !t.open) {
        var i = t.i, l = t.l;
        if (t.set && t.set[0] && t.set[2]) {
          i = t.set[0].i;
          l = t.set[2].i + t.set[2].l - i;
        }
        rows.push({
          i: i,
          l: l,
          type: t.type,
          clss: t.clss,
          label: labelOf(t),
          desc: descOf(t),
          error: t.error || null,
          depth: t.depth || 0,
          open: !!t.close,
          num: t.num
        });
      }
      t = t.next;
    }
    return rows;
  }

  root.RegExrTester = {
    MAX_MATCHES: MAX_MATCHES,
    unescSubst: unescSubst,
    compile: compile,
    solveText: solveText,
    replaceAll: replaceAll,
    listAll: listAll,
    runTests: runTests,
    labelOf: labelOf,
    descOf: descOf,
    errorText: errorText,
    fillTags: fillTags,
    walkExplain: walkExplain,
    refMap: map
  };
})(window);
