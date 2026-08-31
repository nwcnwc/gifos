/*
 * Small tokenizer mapped onto Carbon's highlight keys.
 * Classic IIFE. No eval, no fetch.
 */
(function (root) {
  'use strict';

  var LANGS = [
    { id: 'auto', name: 'Auto' },
    { id: 'text', name: 'Plain Text' },
    { id: 'javascript', name: 'JavaScript' },
    { id: 'typescript', name: 'TypeScript' },
    { id: 'jsx', name: 'JSX' },
    { id: 'json', name: 'JSON' },
    { id: 'python', name: 'Python' },
    { id: 'rust', name: 'Rust' },
    { id: 'go', name: 'Go' },
    { id: 'html', name: 'HTML/XML' },
    { id: 'css', name: 'CSS' },
    { id: 'bash', name: 'Bash' },
    { id: 'markdown', name: 'Markdown' },
    { id: 'sql', name: 'SQL' },
    { id: 'java', name: 'Java' },
    { id: 'c', name: 'C' },
    { id: 'cpp', name: 'C++' },
    { id: 'csharp', name: 'C#' },
    { id: 'ruby', name: 'Ruby' },
    { id: 'php', name: 'PHP' },
    { id: 'yaml', name: 'YAML' },
    { id: 'swift', name: 'Swift' },
    { id: 'kotlin', name: 'Kotlin' },
    { id: 'toml', name: 'TOML' },
    { id: 'lua', name: 'Lua' },
    { id: 'haskell', name: 'Haskell' },
    { id: 'elixir', name: 'Elixir' },
    { id: 'scala', name: 'Scala' },
    { id: 'r', name: 'R' },
    { id: 'dockerfile', name: 'Docker' },
    { id: 'graphql', name: 'GraphQL' }
  ];

  function bag() {
    var o = Object.create(null), i;
    for (i = 0; i < arguments.length; i++) {
      String(arguments[i]).split(/\s+/).forEach(function (w) { if (w) o[w] = true; });
    }
    return o;
  }

  var KW = {
    javascript: bag('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield async await of from as static get set constructor typeof instanceof'),
    typescript: bag('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield async await of from as static get set constructor interface type enum namespace declare abstract implements private protected public readonly keyof infer never unknown any void boolean number string object'),
    python: bag('and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield match case'),
    rust: bag('as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while'),
    go: bag('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil'),
    java: bag('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record sealed yields'),
    c: bag('auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while _Bool _Complex _Imaginary'),
    cpp: bag('alignas alignof and and_eq asm auto bitand bitor bool break case catch char char8_t char16_t char32_t class compl concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public register reinterpret_cast requires return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while xor xor_eq'),
    csharp: bag('abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while var when yield async await record'),
    ruby: bag('alias and BEGIN begin break case class def defined do else elsif END end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield'),
    php: bag('abstract and array as break callable case catch class clone const continue declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield true false null'),
    swift: bag('associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as Any catch false is nil super self Self throw throws true try async await actor some'),
    kotlin: bag('as as? break class continue do else false for fun if in interface is null object package return super this throw true try typealias val var when while by catch constructor delegate dynamic field file finally get import init param property receiver set setparam where actual abstract annotation companion const crossinline data enum expect external final infix inline inner internal lateinits noinline open operator out override private protected public reified sealed suspend tailrec vararg'),
    scala: bag('abstract case catch class def do else extends false final finally for forSome if implicit import lazy match new null object override package private protected return sealed super this throw trait true try type val var while with yield given using enum then'),
    sql: bag('select from where insert into values update set delete create table drop alter index join left right inner outer on group by order having limit offset and or not null as in is like between distinct union all primary key foreign references default count sum avg min max case when then else end'),
    bash: bag('if then else elif fi for in do done while until case esac function select time coproc [[ ]] { }'),
    lua: bag('and break do else elseif end false for function goto if in local nil not or repeat return then true until while'),
    haskell: bag('case class data default deriving do else foreign if import in infix infixl infixr instance let in module newtype of then type where'),
    elixir: bag('alias and break case catch cond def defdelegate defexception defguard defguardp defimpl defmacro defmacrop defmodule defoverridable defp defprotocol defstruct destructure else end fn for if import in quote raise receive require reraise rescue super throw try unless unquote unquote_splicing use when with false true nil'),
    r: bag('if else repeat while function for in next break TRUE FALSE NULL Inf NaN NA NA_integer_ NA_real_ NA_complex_ NA_character_'),
    graphql: bag('query mutation subscription type interface union enum input extend schema scalar fragment on true false null implements'),
    dockerfile: bag('FROM RUN CMD LABEL MAINTAINER EXPOSE ENV ADD COPY ENTRYPOINT VOLUME USER WORKDIR ARG ONBUILD STOPSIGNAL HEALTHCHECK SHELL AS')
  };
  KW.jsx = KW.javascript;
  KW.typescript = KW.typescript;

  var BUILTIN = {
    javascript: bag('console Math JSON Object Array String Number Boolean Function Promise Date Error Map Set WeakMap WeakSet Symbol Proxy Reflect parseInt parseFloat isNaN isFinite undefined Infinity NaN document window Intl'),
    python: bag('print len range dict list str int float bool set tuple type open super object Exception True False None'),
    rust: bag('Some None Ok Err Vec String Option Result Box'),
    go: bag('append cap close complex copy delete imag len make new panic print println real recover error string int int64 uint uint64 byte rune float64 bool'),
    java: bag('String System Object Integer Boolean List Map Set Optional')
  };

  function isIdStart(c) { return /[A-Za-z_$\u00A0-\uFFFF]/.test(c); }
  function isId(c) { return /[A-Za-z0-9_$\u00A0-\uFFFF]/.test(c); }
  function isDigit(c) { return c >= '0' && c <= '9'; }

  function push(out, text, type) {
    if (!text) return;
    var last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ text: text, type: type || 'text' });
  }

  function scanClike(code, lang) {
    var kw = KW[lang] || KW.javascript;
    var builtin = BUILTIN[lang] || BUILTIN.javascript || {};
    var out = [];
    var i = 0, n = code.length;
    var defNext = false;
    var afterDot = false;
    var hashAttr = lang === 'rust';

    function takeWhile(pred) {
      var s = i;
      while (i < n && pred(code.charAt(i))) i++;
      return code.slice(s, i);
    }

    while (i < n) {
      var c = code.charAt(i);
      var n1 = code.charAt(i + 1);

      if (c === '\n') { push(out, '\n', 'text'); i++; defNext = false; afterDot = false; continue; }
      if (c === ' ' || c === '\t' || c === '\r') { push(out, takeWhile(function (ch) { return ch === ' ' || ch === '\t' || ch === '\r'; }), 'text'); continue; }

      if (lang === 'rust' && c === '#' && n1 === '[') {
        var s0 = i;
        i += 2;
        var depth = 1;
        while (i < n && depth) {
          if (code.charAt(i) === '[') depth++;
          else if (code.charAt(i) === ']') depth--;
          i++;
        }
        push(out, code.slice(s0, i), 'meta');
        continue;
      }

      if (c === '/' && n1 === '/') {
        var s = i; i += 2;
        while (i < n && code.charAt(i) !== '\n') i++;
        push(out, code.slice(s, i), 'comment');
        continue;
      }
      if (c === '/' && n1 === '*') {
        var s = i; i += 2;
        while (i < n && !(code.charAt(i) === '*' && code.charAt(i + 1) === '/')) i++;
        if (i < n) i += 2;
        push(out, code.slice(s, i), 'comment');
        continue;
      }
      if ((lang === 'php' || lang === 'ruby') && c === '#' && !(hashAttr && n1 === '[')) {
        var s = i;
        while (i < n && code.charAt(i) !== '\n') i++;
        push(out, code.slice(s, i), 'comment');
        continue;
      }

      if (c === '"' || c === "'" || c === '`') {
        var q = c, s = i; i++;
        while (i < n) {
          var ch = code.charAt(i);
          if (ch === '\\') { i += 2; continue; }
          if (ch === q) { i++; break; }
          if (q !== '`' && ch === '\n') break;
          i++;
        }
        push(out, code.slice(s, i), 'string');
        afterDot = false;
        continue;
      }

      if (c === '/' && lang !== 'rust' && !afterDot) {
        /* regex — only a guess, after operator or start */
        var prev = out.length ? out[out.length - 1] : null;
        var pt = prev ? prev.type : 'text';
        var ok = !prev || pt === 'operator' || pt === 'keyword' || /[=(:,;!?[&|+\-*\n]/.test((prev.text || '').slice(-1));
        if (ok) {
          var s = i; i++;
          var closed = false;
          while (i < n) {
            var ch = code.charAt(i);
            if (ch === '\\') { i += 2; continue; }
            if (ch === '/') { i++; closed = true; break; }
            if (ch === '\n') break;
            i++;
          }
          if (closed) {
            while (i < n && /[gimsuy]/.test(code.charAt(i))) i++;
            push(out, code.slice(s, i), 'string');
            afterDot = false;
            continue;
          }
          i = s;
        }
      }

      if (isDigit(c) || (c === '.' && isDigit(n1))) {
        var s = i;
        if (c === '0' && (n1 === 'x' || n1 === 'X' || n1 === 'b' || n1 === 'B' || n1 === 'o' || n1 === 'O')) i += 2;
        while (i < n && /[0-9a-fA-F._]/.test(code.charAt(i))) i++;
        if (code.charAt(i) === 'e' || code.charAt(i) === 'E') {
          i++;
          if (code.charAt(i) === '+' || code.charAt(i) === '-') i++;
          while (i < n && isDigit(code.charAt(i))) i++;
        }
        push(out, code.slice(s, i), 'number');
        afterDot = false;
        defNext = false;
        continue;
      }

      if (isIdStart(c) || (lang === 'php' && c === '$')) {
        var s = i;
        if (c === '$') i++;
        i = s;
        if (code.charAt(i) === '$') i++;
        while (i < n && isId(code.charAt(i))) i++;
        var w = code.slice(s, i);
        var type = 'variable';
        if (afterDot) type = 'property';
        else if (kw[w]) type = 'keyword';
        else if (builtin[w]) type = 'attribute';
        else if (defNext) type = 'definition';
        else if (w === 'true' || w === 'false' || w === 'null' || w === 'undefined' || w === 'None' || w === 'True' || w === 'False' || w === 'nil') type = 'number';
        push(out, w, type);
        defNext = (type === 'keyword' && /^(const|let|var|function|class|fn|def|func|interface|type|enum|struct|trait|import|export)$/.test(w));
        afterDot = false;
        continue;
      }

      if (c === '.' && isIdStart(n1)) {
        push(out, '.', 'operator');
        i++;
        afterDot = true;
        continue;
      }

      if (c === '=' && n1 === '>') { push(out, '=>', 'operator'); i += 2; afterDot = false; defNext = false; continue; }
      if ((c === '=' || c === '!' || c === '<' || c === '>') && n1 === '=') {
        var t = c + '=';
        i += 2;
        if (code.charAt(i) === '=') { t += '='; i++; }
        push(out, t, 'operator');
        afterDot = false;
        defNext = false;
        continue;
      }
      if ((c === '&' || c === '|' || c === '?' || c === ':') && n1 === c) {
        push(out, c + c, 'operator'); i += 2; afterDot = false; defNext = false; continue;
      }
      if ('+-*/%<>=!&|^~?:'.indexOf(c) >= 0) {
        push(out, c, 'operator'); i++; afterDot = false; defNext = false; continue;
      }

      if (lang === 'html' || lang === 'jsx') {
        /* fall through */
      }

      push(out, c, 'text');
      i++;
      afterDot = false;
    }
    return out;
  }

  function scanHash(code, lang) {
    var kw = KW[lang] || {};
    var out = [];
    var i = 0, n = code.length;
    var defNext = false;
    var afterDot = false;
    var commentChar = '#';
    if (lang === 'sql') commentChar = '-';

    while (i < n) {
      var c = code.charAt(i), n1 = code.charAt(i + 1);
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        var s = i;
        while (i < n && ' \t\r\n'.indexOf(code.charAt(i)) >= 0) i++;
        push(out, code.slice(s, i), 'text');
        if (code.slice(s, i).indexOf('\n') >= 0) { defNext = false; afterDot = false; }
        continue;
      }
      if (c === '#' || (lang === 'sql' && c === '-' && n1 === '-') || (lang === 'haskell' && c === '-' && n1 === '-')) {
        var s = i;
        while (i < n && code.charAt(i) !== '\n') i++;
        push(out, code.slice(s, i), 'comment');
        continue;
      }
      if (lang === 'sql' && c === '/' && n1 === '*') {
        var s = i; i += 2;
        while (i < n && !(code.charAt(i) === '*' && code.charAt(i + 1) === '/')) i++;
        if (i < n) i += 2;
        push(out, code.slice(s, i), 'comment');
        continue;
      }
      if (lang === 'python' && (c === '"' || c === "'") && code.substr(i, 3) === c + c + c) {
        var q = c + c + c, s = i; i += 3;
        var p = code.indexOf(q, i);
        i = p < 0 ? n : p + 3;
        push(out, code.slice(s, i), 'string');
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        var q = c, s = i; i++;
        while (i < n) {
          var ch = code.charAt(i);
          if (ch === '\\') { i += 2; continue; }
          if (ch === q) { i++; break; }
          if (ch === '\n' && lang !== 'bash') break;
          i++;
        }
        push(out, code.slice(s, i), 'string');
        afterDot = false;
        continue;
      }
      if (isDigit(c)) {
        var s = i;
        while (i < n && /[0-9_.]/.test(code.charAt(i))) i++;
        push(out, code.slice(s, i), 'number');
        afterDot = false; defNext = false;
        continue;
      }
      if (isIdStart(c)) {
        var s = i;
        while (i < n && (isId(code.charAt(i)) || (lang === 'bash' && code.charAt(i) === '-'))) i++;
        var w = code.slice(s, i);
        var type = 'variable';
        var wl = lang === 'sql' || lang === 'dockerfile' || lang === 'graphql' ? w.toLowerCase() : w;
        var wk = lang === 'sql' || lang === 'dockerfile' ? w.toLowerCase() : w;
        if (lang === 'dockerfile') wk = w;
        if (afterDot) type = 'property';
        else if (kw[w] || kw[w.toLowerCase()] || kw[wk]) type = 'keyword';
        else if (defNext) type = 'definition';
        else if (w === 'True' || w === 'False' || w === 'None' || w === 'true' || w === 'false' || w === 'null') type = 'number';
        else if (lang === 'yaml' && i < n && code.charAt(i) === ':') type = 'property';
        else if (lang === 'toml' && i < n && code.charAt(i) === '=') type = 'property';
        push(out, w, type);
        defNext = (type === 'keyword' && /^(def|class|fn|function|fun|func)$/.test(w));
        afterDot = false;
        continue;
      }
      if (c === '.' && isIdStart(n1)) { push(out, '.', 'operator'); i++; afterDot = true; continue; }
      if ('+-*/%<>=!&|^~?:'.indexOf(c) >= 0) { push(out, c, 'operator'); i++; afterDot = false; defNext = false; continue; }
      push(out, c, 'text'); i++; afterDot = false;
    }
    return out;
  }

  function scanHtml(code) {
    var out = [];
    var i = 0, n = code.length;
    while (i < n) {
      if (code.substr(i, 4) === '<!--') {
        var e = code.indexOf('-->', i + 4);
        var end = e < 0 ? n : e + 3;
        push(out, code.slice(i, end), 'comment');
        i = end;
        continue;
      }
      if (code.charAt(i) === '<') {
        push(out, '<', 'tag');
        i++;
        if (code.charAt(i) === '/' || code.charAt(i) === '!') { push(out, code.charAt(i), 'tag'); i++; }
        var s = i;
        while (i < n && /[A-Za-z0-9:_-]/.test(code.charAt(i))) i++;
        if (i > s) push(out, code.slice(s, i), 'tag');
        while (i < n && code.charAt(i) !== '>') {
          if (code.charAt(i) === ' ' || code.charAt(i) === '\n' || code.charAt(i) === '\t') {
            push(out, code.charAt(i), 'text'); i++; continue;
          }
          if (code.charAt(i) === '/' && code.charAt(i + 1) === '>') { push(out, '/>', 'tag'); i += 2; break; }
          if (/[A-Za-z_:]/.test(code.charAt(i))) {
            var a = i;
            while (i < n && /[A-Za-z0-9:._-]/.test(code.charAt(i))) i++;
            push(out, code.slice(a, i), 'attribute');
            continue;
          }
          if (code.charAt(i) === '=' ) { push(out, '=', 'operator'); i++; continue; }
          if (code.charAt(i) === '"' || code.charAt(i) === "'") {
            var q = code.charAt(i), st = i; i++;
            while (i < n && code.charAt(i) !== q) i++;
            if (i < n) i++;
            push(out, code.slice(st, i), 'string');
            continue;
          }
          push(out, code.charAt(i), 'text'); i++;
        }
        if (i < n && code.charAt(i) === '>') { push(out, '>', 'tag'); i++; }
        continue;
      }
      var s = i;
      while (i < n && code.charAt(i) !== '<' ) i++;
      push(out, code.slice(s, i), 'text');
    }
    return out;
  }

  function scanCss(code) {
    var out = [];
    var i = 0, n = code.length;
    while (i < n) {
      var c = code.charAt(i), n1 = code.charAt(i + 1);
      if (c === '/' && n1 === '*') {
        var s = i; i += 2;
        while (i < n && !(code.charAt(i) === '*' && code.charAt(i + 1) === '/')) i++;
        if (i < n) i += 2;
        push(out, code.slice(s, i), 'comment');
        continue;
      }
      if (c === '"' || c === "'") {
        var q = c, s = i; i++;
        while (i < n && code.charAt(i) !== q) { if (code.charAt(i) === '\\') i++; i++; }
        if (i < n) i++;
        push(out, code.slice(s, i), 'string');
        continue;
      }
      if (c === '#' && /[0-9A-Fa-f]/.test(n1)) {
        var s = i; i++;
        while (i < n && /[0-9A-Fa-f]/.test(code.charAt(i))) i++;
        push(out, code.slice(s, i), 'number');
        continue;
      }
      if (isDigit(c)) {
        var s = i;
        while (i < n && /[0-9.%]/.test(code.charAt(i))) i++;
        push(out, code.slice(s, i), 'number');
        continue;
      }
      if (c === '.' || c === '#') {
        var s = i; i++;
        while (i < n && /[A-Za-z0-9_-]/.test(code.charAt(i))) i++;
        push(out, code.slice(s, i), 'definition');
        continue;
      }
      if (isIdStart(c) || c === '-') {
        var s = i;
        while (i < n && /[A-Za-z0-9_-]/.test(code.charAt(i))) i++;
        var w = code.slice(s, i);
        var j = i;
        while (j < n && (code.charAt(j) === ' ' || code.charAt(j) === '\t')) j++;
        var type = (code.charAt(j) === ':') ? 'property' : (code.charAt(j) === '(' ? 'attribute' : 'tag');
        push(out, w, type);
        continue;
      }
      if ('{}:;,' .indexOf(c) >= 0) { push(out, c, 'operator'); i++; continue; }
      push(out, c, 'text'); i++;
    }
    return out;
  }

  function scanJson(code) {
    var out = [];
    var i = 0, n = code.length;
    var expectKey = false;
    var stack = [];
    function peek() { return stack[stack.length - 1]; }
    while (i < n) {
      var c = code.charAt(i);
      if (' \t\r\n'.indexOf(c) >= 0) { push(out, c, 'text'); i++; continue; }
      if (c === '{' || c === '[') { stack.push(c); expectKey = c === '{'; push(out, c, 'text'); i++; continue; }
      if (c === '}' || c === ']') { stack.pop(); expectKey = peek() === '{'; push(out, c, 'text'); i++; continue; }
      if (c === ',') { expectKey = peek() === '{'; push(out, c, 'text'); i++; continue; }
      if (c === ':') { expectKey = false; push(out, c, 'operator'); i++; continue; }
      if (c === '"') {
        var s = i; i++;
        while (i < n) {
          if (code.charAt(i) === '\\') { i += 2; continue; }
          if (code.charAt(i) === '"') { i++; break; }
          i++;
        }
        push(out, code.slice(s, i), expectKey ? 'property' : 'string');
        continue;
      }
      if (isDigit(c) || c === '-') {
        var s = i;
        if (c === '-') i++;
        while (i < n && /[0-9.eE+-]/.test(code.charAt(i))) i++;
        push(out, code.slice(s, i), 'number');
        continue;
      }
      if (/[tfn]/.test(c)) {
        var s = i;
        while (i < n && /[a-z]/.test(code.charAt(i))) i++;
        push(out, code.slice(s, i), 'number');
        continue;
      }
      push(out, c, 'text'); i++;
    }
    return out;
  }

  function scanMarkdown(code) {
    var out = [];
    var lines = code.split('\n');
    var i;
    for (i = 0; i < lines.length; i++) {
      if (i) push(out, '\n', 'text');
      var ln = lines[i];
      if (/^#{1,6}\s/.test(ln)) { push(out, ln, 'definition'); continue; }
      if (/^>\s/.test(ln)) { push(out, ln, 'comment'); continue; }
      if (/^(\s*[-*+]\s|\s*\d+\.\s)/.test(ln)) {
        var m = ln.match(/^(\s*[-*+]|\s*\d+\.)(\s)(.*)$/);
        if (m) { push(out, m[1], 'keyword'); push(out, m[2] + m[3], 'text'); continue; }
      }
      if (/^```/.test(ln)) { push(out, ln, 'meta'); continue; }
      var j = 0;
      while (j < ln.length) {
        if (ln.substr(j, 3) === '```') {
          push(out, '```', 'meta'); j += 3; continue;
        }
        if (ln.charAt(j) === '`' ) {
          var k = ln.indexOf('`', j + 1);
          if (k < 0) { push(out, ln.slice(j), 'string'); break; }
          push(out, ln.slice(j, k + 1), 'string');
          j = k + 1;
          continue;
        }
        push(out, ln.charAt(j), 'text');
        j++;
      }
    }
    return out;
  }

  function detect(code) {
    var t = String(code || '').trim();
    if (!t) return 'javascript';
    if ((t.charAt(0) === '{' || t.charAt(0) === '[') && /"\s*:/.test(t.slice(0, 200))) return 'json';
    if (/^#!/m.test(t)) return 'bash';
    if (/^(FROM|RUN|CMD|COPY|ENTRYPOINT)\s/m.test(t)) return 'dockerfile';
    if (/^\s*</.test(t) && /<\/?[A-Za-z]/.test(t)) return 'html';
    if (/^(\.|#)?[\w-]+\s*\{/m.test(t) && /:\s*[^;]+;/.test(t)) return 'css';
    if (/^(def |class |from |import |if __name__)/m.test(t)) return 'python';
    if (/^(fn |let mut |impl |pub |use )/m.test(t)) return 'rust';
    if (/^(package |func |fmt\.)/m.test(t)) return 'go';
    if (/^(SELECT |INSERT |CREATE TABLE |UPDATE )/im.test(t)) return 'sql';
    if (/^(query |mutation |type |schema )/m.test(t)) return 'graphql';
    if (/^---\s*$/m.test(t) || (/^[\w-]+:\s+\S/m.test(t) && !/function |const |let /.test(t))) return 'yaml';
    if (/\b(interface |type \w+\s*=|: string|: number|: boolean)\b/.test(t)) return 'typescript';
    if (/^(const |let |var |function |import |export |=>)/m.test(t)) return 'javascript';
    if (/^#\s/.test(t) && !/function |const /.test(t)) return 'markdown';
    return 'javascript';
  }

  function tokenize(code, lang) {
    code = String(code == null ? '' : code);
    if (lang === 'auto') lang = detect(code);
    if (lang === 'text' || !lang) return [{ text: code, type: 'text' }];
    if (lang === 'html') return scanHtml(code);
    if (lang === 'css') return scanCss(code);
    if (lang === 'json') return scanJson(code);
    if (lang === 'markdown') return scanMarkdown(code);
    if (lang === 'javascript' || lang === 'typescript' || lang === 'jsx' ||
        lang === 'java' || lang === 'c' || lang === 'cpp' || lang === 'csharp' ||
        lang === 'go' || lang === 'rust' || lang === 'swift' || lang === 'kotlin' ||
        lang === 'scala' || lang === 'php') {
      return scanClike(code, lang);
    }
    return scanHash(code, lang);
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function html(code, lang) {
    var toks = tokenize(code, lang);
    var out = '';
    var i;
    for (i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.type === 'text') out += esc(t.text);
      else out += '<span class="t-' + t.type + '">' + esc(t.text) + '</span>';
    }
    if (!out) out = ' ';
    return out;
  }

  root.CarbonSyntax = {
    langs: LANGS,
    detect: detect,
    tokenize: tokenize,
    html: html
  };
})(window);
