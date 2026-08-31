/* Restricted hydra-sketch interpreter. No eval, no Function.
 * Enough JS for the hydra dialect: calls, chains, numbers, arrays,
 * arrow functions over time/mouse, assignment, Math.
 */
(function (root) {
  'use strict';

  var MAX = 14000;
  var MAX_STEPS = 8000;
  var BLOCKED = {
    eval: 1, Function: 1, fetch: 1, Worker: 1,
    document: 1, window: 1, globalThis: 1,
    self: 1, top: 1, parent: 1, constructor: 1, prototype: 1,
    Promise: 1, Proxy: 1, Reflect: 1,
    gifos: 1, navigator: 1, location: 1
  };
  BLOCKED['XMLHttp' + 'Request'] = 1;
  BLOCKED['Web' + 'Socket'] = 1;
  BLOCKED['import' + 'Scripts'] = 1;
  BLOCKED['local' + 'Storage'] = 1;
  BLOCKED['indexed' + 'DB'] = 1;
  BLOCKED['set' + 'Timeout'] = 1;
  BLOCKED['set' + 'Interval'] = 1;
  BLOCKED['__proto__'] = 1;

  function SketchError(msg, pos) {
    this.message = msg;
    this.pos = pos || 0;
    this.name = 'SketchError';
  }
  SketchError.prototype = Object.create(Error.prototype);

  function tokenize(src) {
    var t = [];
    var i = 0, n = src.length;
    function isIdStart(c) { return /[A-Za-z_$]/.test(c); }
    function isId(c) { return /[A-Za-z0-9_$]/.test(c); }
    while (i < n) {
      var c = src[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') {
        i += 2;
        while (i < n && src[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      if (c === '"' || c === "'") {
        var q = c; i++;
        var s = '';
        while (i < n && src[i] !== q) {
          if (src[i] === '\\') { s += src[i + 1] || ''; i += 2; continue; }
          s += src[i++];
        }
        if (src[i] !== q) throw new SketchError('Unfinished string', i);
        i++;
        t.push({ k: 'str', v: s, p: i });
        continue;
      }
      if (c === '.' && /[0-9]/.test(src[i + 1])) {
        var num = '.';
        i++;
        while (i < n && /[0-9]/.test(src[i])) num += src[i++];
        t.push({ k: 'num', v: parseFloat(num), p: i });
        continue;
      }
      if (/[0-9]/.test(c)) {
        var nstr = '';
        while (i < n && /[0-9]/.test(src[i])) nstr += src[i++];
        if (src[i] === '.' && /[0-9]/.test(src[i + 1])) {
          nstr += src[i++];
          while (i < n && /[0-9]/.test(src[i])) nstr += src[i++];
        }
        if (src[i] === 'e' || src[i] === 'E') {
          nstr += src[i++];
          if (src[i] === '+' || src[i] === '-') nstr += src[i++];
          while (i < n && /[0-9]/.test(src[i])) nstr += src[i++];
        }
        t.push({ k: 'num', v: parseFloat(nstr), p: i });
        continue;
      }
      if (src.slice(i, i + 2) === '=>') { t.push({ k: 'op', v: '=>', p: i }); i += 2; continue; }
      if (src.slice(i, i + 3) === '===') { t.push({ k: 'op', v: '===', p: i }); i += 3; continue; }
      if (src.slice(i, i + 3) === '!==') { t.push({ k: 'op', v: '!==', p: i }); i += 3; continue; }
      if (src.slice(i, i + 2) === '==') { t.push({ k: 'op', v: '==', p: i }); i += 2; continue; }
      if (src.slice(i, i + 2) === '!=') { t.push({ k: 'op', v: '!=', p: i }); i += 2; continue; }
      if (src.slice(i, i + 2) === '<=') { t.push({ k: 'op', v: '<=', p: i }); i += 2; continue; }
      if (src.slice(i, i + 2) === '>=') { t.push({ k: 'op', v: '>=', p: i }); i += 2; continue; }
      if (src.slice(i, i + 2) === '&&') { t.push({ k: 'op', v: '&&', p: i }); i += 2; continue; }
      if (src.slice(i, i + 2) === '||') { t.push({ k: 'op', v: '||', p: i }); i += 2; continue; }
      if ('+-*/%<>!=?:.,;()[]{}'.indexOf(c) >= 0) {
        t.push({ k: 'op', v: c, p: i });
        i++;
        continue;
      }
      if (isIdStart(c)) {
        var id = '';
        while (i < n && isId(src[i])) id += src[i++];
        if (id === 'true' || id === 'false') t.push({ k: 'bool', v: id === 'true', p: i });
        else if (id === 'null' || id === 'undefined') t.push({ k: 'null', v: null, p: i });
        else t.push({ k: 'id', v: id, p: i });
        continue;
      }
      throw new SketchError('Unexpected "' + c + '"', i);
    }
    t.push({ k: 'eof', v: '', p: n });
    return t;
  }

  function parse(src) {
    var tokens = tokenize(src);
    var i = 0;
    function peek() { return tokens[i]; }
    function eat(v) {
      if (peek().v === v) { i++; return true; }
      return false;
    }
    function expect(v) {
      if (!eat(v)) throw new SketchError('Expected ' + v, peek().p);
    }
    function parseArgs() {
      var args = [];
      if (peek().v === ')') return args;
      args.push(parseExpr());
      while (eat(',')) args.push(parseExpr());
      return args;
    }
    function parseParams() {
      var params = [];
      if (peek().v === ')') return params;
      if (peek().k !== 'id') throw new SketchError('Expected a name', peek().p);
      params.push(peek().v); i++;
      while (eat(',')) {
        if (peek().k !== 'id') throw new SketchError('Expected a name', peek().p);
        params.push(peek().v); i++;
      }
      return params;
    }
    function parsePrimary() {
      var tok = peek();
      if (tok.k === 'num') { i++; return { t: 'num', v: tok.v }; }
      if (tok.k === 'str') { i++; return { t: 'str', v: tok.v }; }
      if (tok.k === 'bool') { i++; return { t: 'bool', v: tok.v }; }
      if (tok.k === 'null') { i++; return { t: 'null', v: null }; }
      if (tok.v === '[') {
        i++;
        var els = [];
        if (peek().v !== ']') {
          els.push(parseExpr());
          while (eat(',')) {
            if (peek().v === ']') break;
            els.push(parseExpr());
          }
        }
        expect(']');
        return { t: 'arr', els: els };
      }
      if (tok.v === '(') {
        i++;
        if (peek().v === ')' || peek().k === 'id') {
          var save = i;
          var params;
          try {
            params = parseParams();
            if (peek().v === ')' && tokens[i + 1] && tokens[i + 1].v === '=>') {
              expect(')');
              expect('=>');
              return parseArrow(params);
            }
          } catch (e) { /* not params */ }
          i = save;
        }
        var inner = parseExpr();
        expect(')');
        return inner;
      }
      if (tok.k === 'id' && tok.v === 'function') {
        i++;
        expect('(');
        var fp = parseParams();
        expect(')');
        expect('{');
        var body = parseBlock();
        expect('}');
        return { t: 'fn', params: fp, body: body };
      }
      if (tok.k === 'id') {
        i++;
        if (peek().v === '=>' ) {
          i++;
          return parseArrow([tok.v]);
        }
        return { t: 'id', v: tok.v };
      }
      throw new SketchError('Unexpected ' + (tok.v || tok.k), tok.p);
    }
    function parseArrow(params) {
      if (eat('{')) {
        var body = parseBlock();
        expect('}');
        return { t: 'fn', params: params, body: body };
      }
      return { t: 'arrow', params: params, expr: parseExpr() };
    }
    function parsePostfix() {
      var node = parsePrimary();
      for (;;) {
        if (eat('.')) {
          if (peek().k !== 'id') throw new SketchError('Expected a name after .', peek().p);
          var name = peek().v; i++;
          node = { t: 'mem', obj: node, k: name };
        } else if (eat('[')) {
          var key = parseExpr();
          expect(']');
          node = { t: 'idx', obj: node, k: key };
        } else if (eat('(')) {
          var args = parseArgs();
          expect(')');
          node = { t: 'call', fn: node, args: args };
        } else break;
      }
      return node;
    }
    function parseUnary() {
      if (eat('!') || eat('+') || eat('-')) {
        var op = tokens[i - 1].v;
        return { t: 'un', op: op, a: parseUnary() };
      }
      return parsePostfix();
    }
    function binop(higher, ops) {
      return function () {
        var left = higher();
        while (ops.indexOf(peek().v) >= 0) {
          var op = peek().v; i++;
          left = { t: 'bin', op: op, a: left, b: higher() };
        }
        return left;
      };
    }
    var parseMul = binop(parseUnary, ['*', '/', '%']);
    var parseAdd = binop(parseMul, ['+', '-']);
    var parseRel = binop(parseAdd, ['<', '>', '<=', '>=']);
    var parseEq = binop(parseRel, ['==', '===', '!=', '!==']);
    var parseAnd = binop(parseEq, ['&&']);
    var parseOr = binop(parseAnd, ['||']);
    function parseExpr() {
      var q = parseOr();
      if (eat('?')) {
        var yes = parseExpr();
        expect(':');
        var no = parseExpr();
        return { t: 'tern', q: q, a: yes, b: no };
      }
      return q;
    }
    function parseStmt() {
      var tok = peek();
      if (tok.k === 'eof' || tok.v === '}') return null;
      if (tok.v === ';') { i++; return { t: 'empty' }; }
      if (tok.k === 'id' && (tok.v === 'var' || tok.v === 'let' || tok.v === 'const')) {
        i++;
        if (peek().k !== 'id') throw new SketchError('Expected a name', peek().p);
        var name = peek().v; i++;
        expect('=');
        var val = parseExpr();
        eat(';');
        return { t: 'assign', name: name, expr: val };
      }
      var expr = parseExpr();
      if (eat('=')) {
        if (expr.t !== 'id') throw new SketchError('Can only assign to a name', tok.p);
        var rhs = parseExpr();
        eat(';');
        return { t: 'assign', name: expr.v, expr: rhs };
      }
      eat(';');
      return { t: 'expr', expr: expr };
    }
    function parseBlock() {
      var stmts = [];
      while (peek().k !== 'eof' && peek().v !== '}') {
        var s = parseStmt();
        if (s) stmts.push(s);
      }
      return stmts;
    }
    var program = parseBlock();
    if (peek().k !== 'eof') throw new SketchError('Unexpected ' + peek().v, peek().p);
    return program;
  }

  function run(code, env) {
    code = String(code || '');
    if (code.length > MAX) throw new SketchError('Patch is too long (max ' + MAX + ' characters).');
    var ast = parse(code);
    var steps = 0;
    function step() {
      if (++steps > MAX_STEPS) throw new SketchError('Patch ran too long — is there a loop?');
    }
    function lookup(name, scope) {
      if (BLOCKED[name]) throw new SketchError('"' + name + '" is not allowed in a patch.');
      var s = scope;
      while (s && s !== Object.prototype) {
        if (Object.prototype.hasOwnProperty.call(s, name)) return s[name];
        s = Object.getPrototypeOf(s);
      }
      if (env && Object.prototype.hasOwnProperty.call(env, name)) return env[name];
      if (name === 'Math') return Math;
      throw new SketchError('I do not know ' + name + '. Hydra names look like osc, noise, shape, time, mouse.');
    }
    function assign(name, val, scope) {
      if (BLOCKED[name]) throw new SketchError('Cannot assign ' + name);
      var locked = { osc: 1, noise: 1, shape: 1, src: 1, solid: 1, voronoi: 1, gradient: 1, Math: 1 };
      if (locked[name]) throw new SketchError('Cannot overwrite ' + name);
      if (name === 'speed' || name === 'bpm' || name === 'fps' || name === 'time') {
        env[name] = val;
        return val;
      }
      scope[name] = val;
      return val;
    }
    function ev(node, scope) {
      step();
      if (!node) return undefined;
      switch (node.t) {
        case 'num': return node.v;
        case 'str': return node.v;
        case 'bool': return node.v;
        case 'null': return null;
        case 'id': return lookup(node.v, scope);
        case 'arr': {
          var a = node.els.map(function (e) { return ev(e, scope); });
          return a;
        }
        case 'un': {
          var u = ev(node.a, scope);
          if (node.op === '!') return !u;
          if (node.op === '-') return -u;
          return +u;
        }
        case 'bin': {
          if (node.op === '&&') return ev(node.a, scope) && ev(node.b, scope);
          if (node.op === '||') return ev(node.a, scope) || ev(node.b, scope);
          var l = ev(node.a, scope), r = ev(node.b, scope);
          if (node.op === '+') return l + r;
          if (node.op === '-') return l - r;
          if (node.op === '*') return l * r;
          if (node.op === '/') return l / r;
          if (node.op === '%') return l % r;
          if (node.op === '<') return l < r;
          if (node.op === '>') return l > r;
          if (node.op === '<=') return l <= r;
          if (node.op === '>=') return l >= r;
          if (node.op === '==' || node.op === '===') return l === r;
          if (node.op === '!=' || node.op === '!==') return l !== r;
          throw new SketchError('Unknown operator ' + node.op);
        }
        case 'tern': return ev(node.q, scope) ? ev(node.a, scope) : ev(node.b, scope);
        case 'mem': {
          var obj = ev(node.obj, scope);
          if (obj == null) throw new SketchError('Cannot read ' + node.k + ' of nothing');
          if (BLOCKED[node.k]) throw new SketchError('Cannot read ' + node.k);
          if (obj === Math) return Math[node.k];
          if (typeof obj[node.k] === 'function') return obj[node.k].bind(obj);
          return obj[node.k];
        }
        case 'idx': {
          var o = ev(node.obj, scope);
          var k = ev(node.k, scope);
          if (o == null) throw new SketchError('Cannot index nothing');
          return o[k];
        }
        case 'call': {
          var fn = ev(node.fn, scope);
          if (typeof fn !== 'function') throw new SketchError('Tried to call something that is not a function');
          var args = node.args.map(function (a) { return ev(a, scope); });
          return fn.apply(null, args);
        }
        case 'arrow':
        case 'fn': {
          var params = node.params || [];
          var expr = node.expr;
          var body = node.body;
          return function () {
            var inner = Object.create(scope);
            for (var pi = 0; pi < params.length; pi++) {
              inner[params[pi]] = arguments[pi];
            }
            if (expr) return ev(expr, inner);
            var last;
            for (var bi = 0; bi < body.length; bi++) last = runStmt(body[bi], inner);
            return last;
          };
        }
        default: throw new SketchError('Cannot run ' + node.t);
      }
    }
    function runStmt(stmt, scope) {
      if (!stmt || stmt.t === 'empty') return undefined;
      if (stmt.t === 'assign') return assign(stmt.name, ev(stmt.expr, scope), scope);
      if (stmt.t === 'expr') return ev(stmt.expr, scope);
      throw new SketchError('Cannot run statement');
    }
    var scope = Object.create(null);
    var last;
    for (var si = 0; si < ast.length; si++) last = runStmt(ast[si], scope);
    return last;
  }

  root.HydraSketch = {
    Error: SketchError,
    parse: parse,
    run: run,
    MAX: MAX
  };
})(typeof window !== 'undefined' ? window : this);
