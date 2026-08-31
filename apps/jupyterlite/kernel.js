/*
 * Pyodide kernel worker. Concatenated after vendor/pyodide.js and
 * vendor/pyodide.asm.js (which assign loadPyodide and _createPyodideModule).
 *
 * Wasm, stdlib and the lock file arrive as transferred ArrayBuffers from
 * gifos.assets() on the page. This worker never touches the network: fetch
 * is replaced with a map of those buffers, so loadPyodide's CDN URLs resolve
 * from memory (connect-src would refuse the real hosts).
 */
(function (self) {
  'use strict';

  var pyodide = null;
  var stdoutBuf = [];
  var stderrBuf = [];

  function post(msg) { self.postMessage(msg); }

  function fileName(url) {
    var u;
    if (url && typeof url === 'object') {
      if (typeof url.url === 'string') u = url.url;
      else if (typeof url.href === 'string') u = url.href;
      else u = String(url);
    } else u = String(url || '');
    var s = u.split('?')[0].split('#')[0];
    var i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
  }

  function u8of(buf) {
    if (buf instanceof Uint8Array) return buf;
    return new Uint8Array(buf);
  }

  function installFetch(files) {
    self.fetch = function (url) {
      var name = fileName(url);
      var body = files[name];
      if (!body) {
        return Promise.reject(new TypeError('blocked: ' + name));
      }
      var type = 'application/octet-stream';
      if (/\.wasm$/i.test(name)) type = 'application/wasm';
      else if (/\.json$/i.test(name)) type = 'application/json';
      else if (/\.zip$/i.test(name)) type = 'application/zip';
      var copy = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
      return Promise.resolve(new Response(copy, {
        status: 200,
        headers: { 'Content-Type': type }
      }));
    };
  }

  function freeze(v) {
    if (v === undefined || v === null) return null;
    var t = typeof v;
    if (t === 'string') return v;
    if (t === 'number' || t === 'boolean') return String(v);
    var s = null;
    try { s = v.toString(); } catch (e) { s = String(v); }
    try { if (v && typeof v.destroy === 'function') v.destroy(); } catch (e2) {}
    if (s === 'None' || s === 'undefined' || s === '') return null;
    return s;
  }

  function hint(err) {
    var m = String(err || '');
    if (/ModuleNotFoundError/.test(m) && /numpy|pandas|matplotlib|scipy|PIL|sklearn|requests/.test(m)) {
      return m + '\n\nThis notebook ships the Python standard library. Scientific packages are not in this file.';
    }
    return m;
  }

  function boot(msg) {
    if (typeof loadPyodide !== 'function') throw new Error('Python loader missing.');
    if (typeof _createPyodideModule !== 'function') throw new Error('Python engine glue missing.');
    var files = {
      'pyodide.asm.wasm': u8of(msg.wasm),
      'python_stdlib.zip': u8of(msg.stdlib),
      'pyodide-lock.json': u8of(msg.lock)
    };
    installFetch(files);
    stdoutBuf = [];
    stderrBuf = [];
    return loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/',
      stdin: function () { return ''; },
      stdout: function (s) { stdoutBuf.push(String(s)); },
      stderr: function (s) { stderrBuf.push(String(s)); }
    }).then(function (py) {
      pyodide = py;
      post({ type: 'ready', version: py.version || '0.27.7' });
    });
  }

  function run(id, code) {
    if (!pyodide) throw new Error('Python is not started.');
    stdoutBuf = [];
    stderrBuf = [];
    return pyodide.runPythonAsync(String(code == null ? '' : code)).then(function (val) {
      post({
        type: 'result',
        id: id,
        ok: true,
        stdout: stdoutBuf.join('\n'),
        stderr: stderrBuf.join('\n'),
        repr: freeze(val)
      });
    }, function (e) {
      post({
        type: 'result',
        id: id,
        ok: false,
        stdout: stdoutBuf.join('\n'),
        stderr: stderrBuf.join('\n'),
        error: hint(e && e.message || e)
      });
    });
  }

  self.onmessage = function (ev) {
    var d = ev.data || {};
    var p;
    try {
      if (d.type === 'boot') p = boot(d);
      else if (d.type === 'run') p = run(d.id, d.code);
      else throw new Error('unknown message');
    } catch (e) {
      p = Promise.reject(e);
    }
    p.catch(function (e) {
      post({ type: 'error', id: d.id, error: String(e && e.message || e) });
    });
  };
})(self);
