/*
 * Squoosh WASM codecs, instantiated from bytes gifos.assets() already holds.
 * connect-src stays 'none': nothing here fetches. Glue is window.SQUOOSH_*
 * (rewritten by build.mjs); wasm is packed under .assets/.
 *
 * Default options are Squoosh's own (src/features/encoders/<codec>/shared/
 * meta.ts at pin e8d35e0). Changing a default is a product decision, not a
 * guess. NOTE: never write a glob with a slash after the star in this block
 * comment — the star-slash pair terminates the comment and everything after
 * it parses as code (this file shipped dead-at-boot exactly that way).
 */
(function (root) {
  'use strict';

  // Paths gifos.assets() reads. build.mjs asserts each one is packed.
  var ASSETS = {
    mozjpeg: 'mozjpeg_enc.wasm',
    webp: 'webp_enc.wasm',
    avif: 'avif_enc.wasm',
    jxl: 'jxl_enc.wasm',
    qoi: 'qoi_enc.wasm',
    oxipng: 'oxipng.wasm'
  };

  var MozJpegColorSpace = { GRAYSCALE: 1, RGB: 2, YCbCr: 3 };
  var AVIFTune = { auto: 0, psnr: 1, ssim: 2 };

  var DEFAULTS = {
    mozjpeg: {
      quality: 75, baseline: false, arithmetic: false, progressive: true,
      optimize_coding: true, smoothing: 0, color_space: MozJpegColorSpace.YCbCr,
      quant_table: 3, trellis_multipass: false, trellis_opt_zero: false,
      trellis_opt_table: false, trellis_loops: 1, auto_subsample: true,
      chroma_subsample: 2, separate_chroma_quality: false, chroma_quality: 75
    },
    webp: {
      quality: 75, target_size: 0, target_PSNR: 0, method: 4, sns_strength: 50,
      filter_strength: 60, filter_sharpness: 0, filter_type: 1, partitions: 0,
      segments: 4, pass: 1, show_compressed: 0, preprocessing: 0, autofilter: 0,
      partition_limit: 0, alpha_compression: 1, alpha_filtering: 1, alpha_quality: 100,
      lossless: 0, exact: 0, image_hint: 0, emulate_jpeg_size: 0, thread_level: 0,
      low_memory: 0, near_lossless: 100, use_delta_palette: 0, use_sharp_yuv: 0
    },
    avif: {
      quality: 50, qualityAlpha: -1, denoiseLevel: 0, tileColsLog2: 0, tileRowsLog2: 0,
      speed: 6, subsample: 1, chromaDeltaQ: false, sharpness: 0, tune: AVIFTune.auto,
      enableSharpYUV: false
    },
    jxl: {
      effort: 7, quality: 75, progressive: false, epf: -1, lossyPalette: false,
      decodingSpeedTier: 0, photonNoiseIso: 0, lossyModular: false
    },
    oxipng: { level: 2, interlace: false },
    qoi: {}
  };

  var CODECS = [
    { id: 'mozjpeg', label: 'MozJPEG', mime: 'image/jpeg', ext: 'jpg', quality: true, lossless: false,
      note: 'JPEG, smaller than a typical export at the same quality.' },
    { id: 'webp',    label: 'WebP',    mime: 'image/webp', ext: 'webp', quality: true, lossless: true,
      note: 'Good default. Lossless is a checkbox, not a different format.' },
    { id: 'avif',    label: 'AVIF',    mime: 'image/avif', ext: 'avif', quality: true, lossless: false,
      note: 'Usually the smallest. The encoder is the heavy one — first use spins it up.' },
    { id: 'jxl',     label: 'JPEG XL', mime: 'image/jxl',  ext: 'jxl',  quality: true, lossless: false,
      note: 'Excellent, but not every app opens .jxl yet. Preview may be unavailable.' },
    { id: 'oxipng',  label: 'OxiPNG',  mime: 'image/png',  ext: 'png',  quality: false, lossless: true,
      note: 'Lossless PNG. Level is effort, not quality — higher is slower and a bit smaller.' },
    { id: 'qoi',     label: 'QOI',     mime: 'image/qoi',  ext: 'qoi',  quality: false, lossless: true,
      note: 'Quite OK Image — simple lossless. Preview may be unavailable.' }
  ];

  function assetBytes(path) {
    if (!(root.gifos && gifos.assets)) {
      return Promise.reject(new Error('This app needs to run inside GifOS to reach its codecs.'));
    }
    return gifos.assets(path).then(function (buf) {
      if (!buf || !buf.byteLength) throw new Error('“' + path + '” came back empty.');
      return buf;
    }, function (e) {
      throw new Error('Could not read “' + path + '” out of this app: ' + (e && e.message || e));
    });
  }

  var modules = {};

  function loadEmscripten(factoryName, wasmPath) {
    var factory = root[factoryName];
    if (typeof factory !== 'function') {
      return Promise.reject(new Error(factoryName + ' glue did not load.'));
    }
    return assetBytes(wasmPath).then(function (buf) {
      var bytes = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      return factory({
        wasmBinary: bytes,
        locateFile: function (p) { return p; },
        instantiateWasm: function (imports, receive) {
          WebAssembly.instantiate(bytes, imports).then(function (result) {
            receive(result.instance, result.module);
          });
          return {};
        }
      });
    });
  }

  function loadOxipng() {
    var api = root.SQUOOSH_OXIPNG;
    if (!api || typeof api.init !== 'function') {
      return Promise.reject(new Error('OxiPNG glue did not load.'));
    }
    return assetBytes(ASSETS.oxipng).then(function (buf) {
      return api.init(buf).then(function () { return api; });
    });
  }

  function load(id) {
    if (modules[id]) return modules[id];
    var p;
    if (id === 'mozjpeg') p = loadEmscripten('SQUOOSH_MOZJPEG', ASSETS.mozjpeg);
    else if (id === 'webp') p = loadEmscripten('SQUOOSH_WEBP', ASSETS.webp);
    else if (id === 'avif') p = loadEmscripten('SQUOOSH_AVIF', ASSETS.avif);
    else if (id === 'jxl') p = loadEmscripten('SQUOOSH_JXL', ASSETS.jxl);
    else if (id === 'qoi') p = loadEmscripten('SQUOOSH_QOI', ASSETS.qoi);
    else if (id === 'oxipng') p = loadOxipng();
    else return Promise.reject(new Error('Unknown codec: ' + id));
    modules[id] = p;
    p.catch(function () { delete modules[id]; });
    return p;
  }

  function merge(id, opts) {
    var base = DEFAULTS[id] || {};
    var out = {};
    var k;
    for (k in base) out[k] = base[k];
    if (opts) for (k in opts) if (Object.prototype.hasOwnProperty.call(opts, k) && opts[k] !== undefined) out[k] = opts[k];
    return out;
  }

  function pixels(imageData) {
    return imageData.data;
  }

  function encode(id, imageData, opts) {
    var options = merge(id, opts);
    var meta = CODECS.filter(function (c) { return c.id === id; })[0];
    if (!meta) return Promise.reject(new Error('Unknown codec: ' + id));
    return load(id).then(function (mod) {
      var out;
      if (id === 'oxipng') {
        out = mod.optimise(pixels(imageData), imageData.width, imageData.height, options.level | 0, !!options.interlace);
      } else if (id === 'qoi') {
        out = mod.encode(pixels(imageData), imageData.width, imageData.height, options);
      } else {
        out = mod.encode(pixels(imageData), imageData.width, imageData.height, options);
      }
      if (!out) throw new Error(meta.label + ' produced no output.');
      var bytes = out.buffer ? out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) : out;
      return { bytes: bytes, mime: meta.mime, ext: meta.ext, bytesLength: out.byteLength || bytes.byteLength };
    });
  }

  root.SquooshCodecs = {
    ASSETS: ASSETS,
    CODECS: CODECS,
    DEFAULTS: DEFAULTS,
    load: load,
    encode: encode,
    merge: merge
  };
})(typeof window !== 'undefined' ? window : globalThis);
