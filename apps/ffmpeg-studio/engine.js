/*
 * ffmpeg.wasm client. The worker source is window.FF_WORKER_SRC (glue +
 * worker.js, minted by build.mjs). Wasm bytes come from gifos.assets().
 * Classic worker only (opaque origins reject module workers).
 */
(function (root) {
  'use strict';

  var WASM_PATH = 'ffmpeg-core.wasm';
  var WASM_BYTES = 32232419;

  var worker = null;
  var seq = 0;
  var pending = {};
  var loggers = [];
  var progressors = [];
  var loaded = false;
  var loading = null;

  function fail(msg) { return Promise.reject(new Error(msg)); }

  function assetBytes(path) {
    if (!(root.gifos && gifos.assets)) {
      return fail('This app needs to run inside GifOS to reach its converter.');
    }
    return gifos.assets(path).then(function (buf) {
      if (!buf || !buf.byteLength) throw new Error('“' + path + '” came back empty.');
      return buf;
    }, function (e) {
      throw new Error('Could not read “' + path + '”: ' + (e && e.message || e));
    });
  }

  function onMessage(ev) {
    var d = ev.data || {};
    if (d.type === 'LOG') {
      for (var i = 0; i < loggers.length; i++) try { loggers[i](d.data); } catch (e) {}
      return;
    }
    if (d.type === 'PROGRESS') {
      for (var j = 0; j < progressors.length; j++) try { progressors[j](d.data); } catch (e) {}
      return;
    }
    var slot = pending[d.id];
    if (!slot) return;
    delete pending[d.id];
    if (d.type === 'ERROR') slot.rej(new Error(String(d.data || 'ffmpeg error')));
    else slot.res(d.data);
  }

  function send(type, data, transfer) {
    if (!worker) return fail('Converter worker is not running.');
    return new Promise(function (res, rej) {
      var id = ++seq;
      pending[id] = { res: res, rej: rej };
      try {
        worker.postMessage({ id: id, type: type, data: data }, transfer || []);
      } catch (e) {
        delete pending[id];
        rej(e);
      }
    });
  }

  function killWorker(err) {
    var e = err || new Error('Converter worker stopped.');
    var ids = Object.keys(pending);
    for (var i = 0; i < ids.length; i++) {
      var slot = pending[ids[i]];
      delete pending[ids[i]];
      try { slot.rej(e); } catch (x) {}
    }
    if (worker) {
      try { worker.terminate(); } catch (x) {}
      worker = null;
    }
    loaded = false;
    loading = null;
  }

  function ensureWorker() {
    if (worker) return;
    if (!root.FF_WORKER_SRC) throw new Error('The converter worker did not load.');
    var blob = new Blob([root.FF_WORKER_SRC], { type: 'text/javascript' });
    worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = onMessage;
    worker.onerror = function (ev) {
      var msg = (ev && ev.message) || 'Converter worker failed.';
      killWorker(new Error(msg));
    };
  }

  function load(onNote) {
    if (loaded) return Promise.resolve();
    if (loading) return loading;
    try { ensureWorker(); } catch (e) { return Promise.reject(e); }
    if (onNote) onNote('Loading the converter… the first install downloads ' + (WASM_BYTES / 1e6).toFixed(0) + ' MB, then it stays on this device.');
    loading = assetBytes(WASM_PATH).then(function (buf) {
      if (onNote) onNote('Starting ffmpeg…');
      var transfer = buf instanceof ArrayBuffer ? [buf] : (buf.buffer ? [buf.buffer] : []);
      return send('LOAD', { wasm: buf }, transfer);
    }).then(function () {
      loaded = true;
      loading = null;
    }, function (e) {
      loading = null;
      killWorker(e);
      throw e;
    });
    return loading;
  }

  function write(path, data) {
    var src = data instanceof Uint8Array ? data : new Uint8Array(data);
    // Copy before transfer — the caller's buffer (S.bytes) must stay usable.
    var u8 = new Uint8Array(src.byteLength);
    u8.set(src);
    return send('WRITE_FILE', { path: path, data: u8 }, [u8.buffer]);
  }

  function read(path) {
    return send('READ_FILE', { path: path, encoding: 'binary' });
  }

  function unlink(path) {
    return send('DELETE_FILE', { path: path }).catch(function () { return false; });
  }

  function exec(args, timeout) {
    return send('EXEC', { args: args, timeout: timeout == null ? -1 : timeout });
  }

  function onLog(fn) { loggers.push(fn); }
  function onProgress(fn) { progressors.push(fn); }

  root.FFmpegStudio = {
    WASM_PATH: WASM_PATH,
    WASM_BYTES: WASM_BYTES,
    load: load,
    exec: exec,
    write: write,
    read: read,
    unlink: unlink,
    onLog: onLog,
    onProgress: onProgress,
    isLoaded: function () { return loaded; }
  };
})(typeof window !== 'undefined' ? window : self);
