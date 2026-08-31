/*
 * Classic worker. ffmpeg-core.js is concatenated ahead of this file by
 * build.mjs, so createFFmpegCore is already a factory on self. The wasm
 * bytes arrive on LOAD as a transferred ArrayBuffer — instantiateWasm is
 * the only path, so the glue never fetch()es.
 */
(function () {
  'use strict';

  var ffmpeg = null;

  function load(data) {
    if (typeof createFFmpegCore !== 'function') {
      return Promise.reject(new Error('ffmpeg core glue did not load.'));
    }
    var raw = data && data.wasm;
    if (!raw) return Promise.reject(new Error('No converter bytes arrived.'));
    var bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw)
      : (raw.buffer ? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) : new Uint8Array(raw));
    return createFFmpegCore({
      wasmBinary: bytes,
      locateFile: function (p) { return p; },
      instantiateWasm: function (imports, receive) {
        WebAssembly.instantiate(bytes, imports).then(function (result) {
          receive(result.instance, result.module);
        }, function (err) {
          throw err;
        });
        return {};
      }
    }).then(function (mod) {
      ffmpeg = mod;
      ffmpeg.setLogger(function (d) {
        self.postMessage({ type: 'LOG', data: d });
      });
      ffmpeg.setProgress(function (d) {
        self.postMessage({ type: 'PROGRESS', data: d });
      });
      return true;
    });
  }

  function exec(data) {
    var args = (data && data.args) || [];
    var timeout = data && data.timeout != null ? data.timeout : -1;
    ffmpeg.setTimeout(timeout);
    ffmpeg.exec.apply(ffmpeg, args);
    var ret = ffmpeg.ret;
    ffmpeg.reset();
    return ret;
  }

  function writeFile(data) {
    ffmpeg.FS.writeFile(data.path, data.data);
    return true;
  }

  function readFile(data) {
    return ffmpeg.FS.readFile(data.path, { encoding: data.encoding || 'binary' });
  }

  function deleteFile(data) {
    ffmpeg.FS.unlink(data.path);
    return true;
  }

  self.onmessage = function (ev) {
    var msg = ev.data || {};
    var id = msg.id;
    var type = msg.type;
    var payload = msg.data;
    var trans = [];
    var out;

    function reply(okType, value) {
      if (value instanceof Uint8Array) trans.push(value.buffer);
      self.postMessage({ id: id, type: okType, data: value }, trans);
    }

    try {
      if (type !== 'LOAD' && !ffmpeg) throw new Error('ffmpeg is not loaded');
      var p;
      if (type === 'LOAD') p = load(payload);
      else if (type === 'EXEC') out = exec(payload);
      else if (type === 'WRITE_FILE') out = writeFile(payload);
      else if (type === 'READ_FILE') out = readFile(payload);
      else if (type === 'DELETE_FILE') out = deleteFile(payload);
      else throw new Error('unknown message type');
      if (p && typeof p.then === 'function') {
        p.then(function (v) { reply(type, v); }, function (e) {
          self.postMessage({ id: id, type: 'ERROR', data: String(e && e.message || e) });
        });
        return;
      }
      reply(type, out);
    } catch (e) {
      self.postMessage({ id: id, type: 'ERROR', data: String(e && e.message || e) });
    }
  };
})();
