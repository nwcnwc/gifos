/*
 * OCR worker — Tesseract.js-core, no network.
 *
 * build.mjs concatenates the vendored glue (window/global TesseractCore) in
 * front of this file and packs the result as window.OCR_WORKER_SRC. The app
 * mints a blob: Worker from that string. Wasm bytes and language data arrive
 * as transferred ArrayBuffers from gifos.assets() on the page — this worker
 * never fetches.
 *
 * instantiateWasm is the only wasm path we take: the glue also has fetch()
 * and XMLHttpRequest fallbacks that would throw under connect-src blob/data.
 */
(function (self) {
  'use strict';

  var Tess = null;
  var api = null;
  var langCode = null;

  function post(msg) { self.postMessage(msg); }
  function fail(err) { post({ type: 'error', error: String(err && err.message || err) }); }

  function u8of(buf) {
    if (buf instanceof Uint8Array) return buf;
    return new Uint8Array(buf);
  }

  function maybeGunzip(buf) {
    var u8 = u8of(buf);
    if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
      var stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    }
    return Promise.resolve(u8);
  }

  function boot(wasmBuf) {
    if (typeof TesseractCore !== 'function') throw new Error('TesseractCore factory missing');
    var wasm = u8of(wasmBuf);
    return TesseractCore({
      wasmBinary: wasm,
      locateFile: function (p) { return p; },
      instantiateWasm: function (imports, done) {
        WebAssembly.instantiate(wasm, imports).then(function (r) {
          done(r.instance, r.module);
        }).catch(function (e) { fail(e); });
        return {};
      },
      TesseractProgress: function (percent) {
        var p = Number(percent);
        if (!(p >= 0)) p = 0;
        post({ type: 'progress', phase: 'recognize', progress: Math.max(0, Math.min(1, (p - 30) / 70)) });
      },
      print: function () {},
      printErr: function () {}
    }).then(function (mod) {
      Tess = mod;
    });
  }

  function initLang(code, bytes) {
    return maybeGunzip(bytes).then(function (data) {
      if (!Tess) throw new Error('Engine is not booted.');
      if (api) { try { api.End(); } catch (e) {} api = null; }
      Tess.FS.writeFile(code + '.traineddata', data);
      api = new Tess.TessBaseAPI();
      var oem = (Tess.OEM_LSTM_ONLY != null) ? Tess.OEM_LSTM_ONLY : 1;
      var status = api.Init(null, code, oem);
      if (status === -1) throw new Error('Tesseract failed to initialise language “' + code + '”.');
      langCode = code;
    });
  }

  function recognize(image, opts) {
    if (!api) throw new Error('No language loaded.');
    opts = opts || {};
    Tess.FS.writeFile('/input', u8of(image));
    var angle = 0;
    if (opts.rotateAuto && api.FindLines && api.GetGradient) {
      var r0 = api.SetImageFile(1, 0);
      if (r0 === 1) throw new Error('Could not read the image.');
      api.FindLines();
      angle = api.GetGradient();
      if (!(Math.abs(angle) >= 0.005)) angle = 0;
    }
    var r = api.SetImageFile(1, angle);
    if (r === 1) throw new Error('Could not read the image.');
    if (opts.psm != null) api.SetVariable('tessedit_pageseg_mode', String(opts.psm));
    api.Recognize(null);
    var text = api.GetUTF8Text() || '';
    var confidence = api.MeanTextConf ? api.MeanTextConf() : null;
    var blocks = null;
    try {
      if (api.GetJSONText) {
        var parsed = JSON.parse(api.GetJSONText());
        blocks = parsed && parsed.blocks || null;
      }
    } catch (e) { blocks = null; }
    return { text: text, confidence: confidence, blocks: blocks, rotateRadians: angle };
  }

  self.onmessage = function (e) {
    var d = e.data || {};
    var p;
    if (d.type === 'boot') {
      p = boot(d.wasm).then(function () { post({ type: 'booted' }); });
    } else if (d.type === 'lang') {
      p = initLang(d.code, d.bytes).then(function () {
        var ver = null;
        try { ver = api.Version(); } catch (err) {}
        post({ type: 'lang-ready', code: langCode, version: ver });
      });
    } else if (d.type === 'recognize') {
      p = Promise.resolve().then(function () {
        var out = recognize(d.image, d.opts);
        post({
          type: 'result',
          text: out.text,
          confidence: out.confidence,
          blocks: out.blocks,
          rotateRadians: out.rotateRadians
        });
      });
    } else {
      return;
    }
    p.catch(fail);
  };
})(self);
