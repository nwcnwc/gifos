/*
 * models.js — the IS-Net weights this app pins.
 *
 * Names small/medium/large are upstream's aliases in schema.ts
 * (@imgly/background-removal 1.7.0). asset is the gifos.assets() path.
 */
(function (root) {
  'use strict';

  root.BR_MODELS = {
    small: {
      id: 'small',
      label: 'Small',
      detail: 'Faster, sometimes a little jagged. ~44 MB the first time.',
      asset: 'isnet-small.onnx',
      bytes: 44348940,
      upstream: 'isnet_quint8'
    },
    medium: {
      id: 'medium',
      label: 'Medium',
      detail: 'The usual choice. ~88 MB the first time.',
      asset: 'isnet-medium.onnx',
      bytes: 88152708,
      upstream: 'isnet_fp16'
    },
    large: {
      id: 'large',
      label: 'Large',
      detail: 'Full precision. Slowest to download (~176 MB) and to run.',
      asset: 'isnet-large.onnx',
      bytes: 176149806,
      upstream: 'isnet'
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
