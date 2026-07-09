// Drives full-strength Stockfish (the lite single-threaded WASM build) inside
// the app. The engine is compiled with Asyncify, so `go` searches run
// asynchronously and yield to the event loop — the board stays responsive
// without a separate thread.
//
// capabilities.wasm is what makes this possible at all: the GifOS sandbox
// normally refuses WebAssembly ('wasm-unsafe-eval' absent). The engine gets
// ZERO network — its .wasm (with the NNUE net embedded) is handed to it as
// bytes via wasmBinary, so connect-src stays 'none' and nothing is ever
// fetched. Two files are inlined ahead of this one by the runtime:
//   sf-glue.js  — the engine glue; on load it sets window.SF_FACTORY (the
//                 build rewrites its self-init tail to expose the factory).
//   sf-wasm.js  — window.GM_WASM_B64, the wasm as base64.
(function () {
  function b64ToBuf(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }

  function Engine() { this.mod = null; this.lines = []; }

  // Instantiate the engine and finish the UCI handshake (uciok + readyok).
  Engine.prototype.start = function () {
    const self = this;
    if (self.mod) return Promise.resolve();
    if (typeof window.SF_FACTORY !== 'function') return Promise.reject(new Error('Engine did not load (SF_FACTORY missing).'));
    if (!window.GM_WASM_B64) return Promise.reject(new Error('Engine wasm did not load.'));
    // This build dispatches ALL engine output through Module.listener (it
    // rewrites print/printErr to call it); print/print-hooks are ignored.
    const Module = {
      wasmBinary: b64ToBuf(window.GM_WASM_B64),
      locateFile: function (p) { return p; },
      listener: function (line) { self.lines.forEach(function (fn) { fn(line); }); },
    };
    return new Promise(function (res, rej) {
      let out; try { out = window.SF_FACTORY(Module); } catch (e) { return rej(e); }
      // SF_FACTORY(Module) usually returns a thenable that resolves to the Module.
      // Guard the two-layer variant (a factory that returns another factory).
      const p = (out && typeof out.then === 'function') ? out
        : (typeof out === 'function' ? out(Module) : (Module.ready || Promise.resolve()));
      Promise.resolve(p).then(function () { self.mod = Module; self._handshake().then(res, rej); }, rej);
    });
  };

  Engine.prototype.send = function (cmd) { if (this.mod) this.mod.ccall('command', null, ['string'], [cmd], { async: /^go\b/.test(cmd) }); };
  Engine.prototype.onLine = function (fn) { this.lines.push(fn); };

  Engine.prototype._handshake = function () {
    const self = this;
    return self._await('uci', /^uciok/).then(function () { return self._await('isready', /^readyok/); });
  };
  Engine.prototype._await = function (cmd, re, timeoutMs) {
    const self = this;
    return new Promise(function (res, rej) {
      const to = setTimeout(function () { off(); rej(new Error('engine timeout: ' + cmd)); }, timeoutMs || 20000);
      function fn(line) { if (re.test(line)) { off(); res(line); } }
      function off() { clearTimeout(to); const i = self.lines.indexOf(fn); if (i >= 0) self.lines.splice(i, 1); }
      self.lines.push(fn);
      if (cmd) self.send(cmd);
    });
  };

  // Strength. Two independent knobs Stockfish exposes; we use one per level so
  // the ladder is monotonic: a capped Elo (1320..3190) below the top rung, and
  // full Skill Level 20 at the top. UCI_ShowWDL turns on the W/D/L read-out.
  Engine.prototype.configure = function (opts) {
    this.send('setoption name UCI_ShowWDL value true');
    if (opts.elo != null) {
      this.send('setoption name UCI_LimitStrength value true');
      this.send('setoption name UCI_Elo value ' + Math.max(1320, Math.min(3190, opts.elo | 0)));
      this.send('setoption name Skill Level value 20');
    } else {
      this.send('setoption name UCI_LimitStrength value false');
      this.send('setoption name Skill Level value ' + Math.max(0, Math.min(20, opts.skill == null ? 20 : opts.skill | 0)));
    }
  };

  Engine.prototype.newGame = function () { this.send('ucinewgame'); this.send('isready'); };

  // Search a FEN. go = {movetime:ms} or {depth:n}. onInfo(info) fires as the
  // engine deepens. Resolves { bestmove, ponder, score, mate, wdl, pv, depth }.
  Engine.prototype.search = function (fen, go, onInfo) {
    const self = this;
    let latest = { score: null, mate: null, wdl: null, pv: [], depth: 0 };
    return new Promise(function (res, rej) {
      const to = setTimeout(function () { off(); rej(new Error('search timeout')); }, (go.movetime || 0) + 60000);
      function fn(line) {
        if (line.indexOf('info ') === 0 && line.indexOf(' pv ') > -1) {
          const info = parseInfo(line);
          if (info.depth >= latest.depth) latest = info;
          if (onInfo) try { onInfo(info); } catch (e) {}
        } else if (line.indexOf('bestmove') === 0) {
          off();
          const parts = line.split(/\s+/);
          res({ bestmove: parts[1] || null, ponder: parts[3] || null, score: latest.score, mate: latest.mate, wdl: latest.wdl, pv: latest.pv, depth: latest.depth });
        }
      }
      function off() { clearTimeout(to); const i = self.lines.indexOf(fn); if (i >= 0) self.lines.splice(i, 1); }
      self.lines.push(fn);
      self.send('position fen ' + fen);
      self.send('go ' + (go.depth ? 'depth ' + go.depth : 'movetime ' + (go.movetime || 1000)));
    });
  };

  Engine.prototype.stop = function () { this.send('stop'); };

  function parseInfo(line) {
    const out = { score: null, mate: null, wdl: null, pv: [], depth: 0 };
    const toks = line.split(/\s+/);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t === 'depth') out.depth = +toks[i + 1] || 0;
      else if (t === 'score') { if (toks[i + 1] === 'cp') out.score = +toks[i + 2]; else if (toks[i + 1] === 'mate') out.mate = +toks[i + 2]; }
      else if (t === 'wdl') out.wdl = [+toks[i + 1], +toks[i + 2], +toks[i + 3]];
      else if (t === 'pv') { out.pv = toks.slice(i + 1); break; }
    }
    return out;
  }

  window.GM = window.GM || {};
  window.GM.Engine = Engine;
})();
