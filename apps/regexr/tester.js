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

  function labelOf(token) {
    var m = map();
    var row = m[token.type] || m[token.clss];
    if (row && row.label) return row.label;
    if (row && row.token) return row.token;
    return token.type || token.clss || 'token';
  }

  function descOf(token) {
    var m = map();
    var row = m[token.type] || m[token.clss];
    if (!row) return '';
    var s = row.tip || row.desc || '';
    if (token.clss === 'quant' || token.type === 'quant') {
      var mx = token.max === -1 ? 'unlimited' : token.max;
      s = 'Match ' + token.min + ' to ' + mx + ' of the preceding token.';
    }
    if (token.type === 'char' && token.code != null) {
      s = 'Matches a ' + JSON.stringify(String.fromCharCode(token.code)) + ' character (char code ' + token.code + ').';
    }
    if (token.name) s = s.replace(/\{\{name\}\}/g, token.name);
    return s;
  }

  function errorText(err, ref) {
    if (!err) return '';
    if (err.message) return err.message;
    var errors = (ref && ref.errors) || (root.RegExrReference && root.RegExrReference.errors) || {};
    var t = errors[err.id];
    if (t) return String(t).replace(/<[^>]+>/g, '');
    return err.id || 'Error';
  }

  function walkExplain(token) {
    var rows = [];
    if (!token) return rows;
    var t = token;
    while (t) {
      if (t.type !== 'open' && t.type !== 'close' && !t.proxy) {
        rows.push({
          i: t.i,
          l: t.l,
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
    walkExplain: walkExplain,
    refMap: map
  };
})(window);
