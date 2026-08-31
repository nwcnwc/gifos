/* Mint Monaco workers from GIF bytes as blob: URLs. Classic workers only —
 * Chromium refuses type:module blob workers in an opaque origin. */
(function (root) {
  'use strict';

  var urls = Object.create(null);

  function blobUrl(buf) {
    return URL.createObjectURL(new Blob([buf], { type: 'text/javascript' }));
  }

  function workerFor(path) {
    if (urls[path]) return Promise.resolve(new Worker(urls[path]));
    var api = root.gifos;
    if (!api || !api.assets) {
      return Promise.reject(new Error('workers need GifOS'));
    }
    return api.assets(path).then(function (buf) {
      if (!buf || !buf.byteLength) throw new Error('empty worker ' + path);
      urls[path] = blobUrl(buf);
      return new Worker(urls[path]);
    });
  }

  function pathFor(label) {
    if (label === 'json') return 'json.worker.js';
    if (label === 'javascript' || label === 'typescript') return 'ts.worker.js';
    return 'editor.worker.js';
  }

  root.MonacoEnvironment = {
    getWorker: function (_id, label) {
      return workerFor(pathFor(label));
    }
  };
})(typeof self !== 'undefined' ? self : this);
