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

  // Pyodide annotates ModuleNotFoundError with micropip.install / loadPackage
  // for every wheel in the lock. Those wheels are not in this GIF and fetch
  // is a memory map of three files, so the annotation is a lie.
  var FALLBACK_BLOCKED = [
    'numpy', 'pandas', 'matplotlib', 'scipy', 'PIL', 'sklearn', 'requests',
    'micropip', 'pip', 'pylab', 'mpl_toolkits'
  ];

  function lockImportNames(buf) {
    var names = {};
    try {
      var lock = JSON.parse(new TextDecoder().decode(buf));
      var pkgs = lock && lock.packages || {};
      Object.keys(pkgs).forEach(function (k) {
        var imps = pkgs[k] && pkgs[k].imports;
        if (!imps || !imps.length) return;
        imps.forEach(function (imp) {
          var top = String(imp || '').split('.')[0];
          if (top) names[top] = true;
        });
      });
    } catch (e) {}
    FALLBACK_BLOCKED.forEach(function (n) { names[n] = true; });
    return Object.keys(names);
  }

  function honestMissing(name) {
    var who = name || 'That package';
    return who + ' is not in this file. This notebook ships the Python standard library only. There is no pip here.';
  }

  function hintedName(m) {
    var mm = String(m || '').match(/No module named ['"]([^'"]+)['"]/)
      || String(m || '').match(/The module ['"]([^'"]+)['"]/)
      || String(m || '').match(/^([A-Za-z_][\w.]*) is not in this file/);
    return mm ? mm[1].split('.')[0] : '';
  }

  function stripPipDoor(m) {
    return String(m || '')
      .split(/\nThe module |\nYou can install it by calling:|\nSee https:\/\/pyodide\.org/)[0]
      .trim();
  }

  function hint(err) {
    var m = String(err || '');
    if (/micropip|loadPackage|included in the Pyodide distribution|unvendored from the Python standard library/i.test(m)
        || /pyodide\.org\/en\/stable\/usage\/loading-packages/i.test(m)) {
      var head = stripPipDoor(m);
      if (/is not in this file/.test(head)) return head;
      return honestMissing(hintedName(m));
    }
    return m;
  }

  function honestHook(names) {
    return [
      'import json, sys',
      '_BLOCKED = set(json.loads(' + JSON.stringify(JSON.stringify(names)) + '))',
      'class _NotInThisFile:',
      '    def find_spec(self, fullname, path, target=None):',
      '        if path is not None:',
      '            return None',
      '        top = fullname.split(".", 1)[0]',
      '        if top not in _BLOCKED:',
      '            return None',
      '        raise ModuleNotFoundError(',
      '            "%s is not in this file. This notebook ships the Python standard library only. There is no pip here." % top,',
      '            name=fullname,',
      '        )',
      'sys.meta_path.append(_NotInThisFile())',
      'try:',
      '    from _pyodide import _importhook',
      '    _importhook.REPODATA_PACKAGES_IMPORT_TO_PACKAGE_NAME = {}',
      '    _importhook.UNVENDORED_STDLIBS_AND_TEST = set()',
      'except Exception:',
      '    pass'
    ].join('\n');
  }

  function boot(msg) {
    if (typeof loadPyodide !== 'function') throw new Error('Python loader missing.');
    if (typeof _createPyodideModule !== 'function') throw new Error('Python engine glue missing.');
    var files = {
      'pyodide.asm.wasm': u8of(msg.wasm),
      'python_stdlib.zip': u8of(msg.stdlib),
      'pyodide-lock.json': u8of(msg.lock)
    };
    var blocked = lockImportNames(files['pyodide-lock.json']);
    installFetch(files);
    stdoutBuf = [];
    stderrBuf = [];
    return loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/',
      stdin: function () { return ''; },
      stdout: function (s) { stdoutBuf.push(String(s)); },
      stderr: function (s) { stderrBuf.push(String(s)); }
    }).then(function (py) {
      return py.runPythonAsync(honestHook(blocked)).then(function () { return py; }, function () { return py; });
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
        stderr: hint(stderrBuf.join('\n')),
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
