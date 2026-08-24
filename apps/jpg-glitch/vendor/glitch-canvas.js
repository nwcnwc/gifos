/* glitch-canvas by snorpey, MIT. Worker path stripped — sandbox has no workers.
 * Same JPEG-byte smash as scripts/lib/glitch-canvas-with-worker.js (no Worker).
 */
(function (root) {
  'use strict';

  var base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var base64Map = base64Chars.split('');
  var reversedBase64Map = {};
  var i;
  for (i = 0; i < base64Map.length; i++) reversedBase64Map[base64Map[i]] = i;

  function getNormalizedParameters(parameters) {
    parameters = parameters || {};
    return {
      seed: (parameters.seed || 0) / 100,
      quality: (parameters.quality || 0) / 100,
      amount: (parameters.amount || 0) / 100,
      iterations: parameters.iterations || 0
    };
  }

  function glitchJpegBytes(byteArray, jpgHeaderLength, seed, amount, iter, len) {
    var maxIndex = byteArray.length - jpgHeaderLength - 4;
    var pxMin = parseInt(maxIndex / len * iter, 10);
    var pxMax = parseInt(maxIndex / len * (iter + 1), 10);
    var delta = pxMax - pxMin;
    var pxIndex = parseInt(pxMin + delta * seed, 10);
    if (pxIndex > maxIndex) pxIndex = maxIndex;
    var index = Math.floor(jpgHeaderLength + pxIndex);
    byteArray[index] = Math.floor(amount * 256);
  }

  function smashBytes(byteArray, params) {
    var header = getJpegHeaderSize(byteArray);
    var n = params.iterations || 0;
    var k;
    for (k = 0; k < n; k++) {
      glitchJpegBytes(byteArray, header, params.seed, params.amount, k, n);
    }
    return byteArray;
  }

  function base64ToByteArray(str) {
    var result = [];
    var digitNum, cur, prev, len, idx;
    for (idx = 23, len = str.length; idx < len; idx++) {
      cur = reversedBase64Map[str.charAt(idx)];
      digitNum = (idx - 23) % 4;
      switch (digitNum) {
        case 1: result.push(prev << 2 | cur >> 4); break;
        case 2: result.push((prev & 15) << 4 | cur >> 2); break;
        case 3: result.push((prev & 3) << 6 | cur); break;
      }
      prev = cur;
    }
    return result;
  }

  function byteArrayToBase64(arr) {
    var result = ['data:image/jpeg;base64,'];
    var byteNum, cur, prev, idx, len;
    for (idx = 0, len = arr.length; idx < len; idx++) {
      cur = arr[idx];
      byteNum = idx % 3;
      switch (byteNum) {
        case 0: result.push(base64Map[cur >> 2]); break;
        case 1: result.push(base64Map[(prev & 3) << 4 | cur >> 4]); break;
        case 2:
          result.push(base64Map[(prev & 15) << 2 | cur >> 6]);
          result.push(base64Map[cur & 63]);
          break;
      }
      prev = cur;
    }
    if (byteNum === 0) {
      result.push(base64Map[(prev & 3) << 4]);
      result.push('==');
    } else if (byteNum === 1) {
      result.push(base64Map[(prev & 15) << 2]);
      result.push('=');
    }
    return result.join('');
  }

  function getJpegHeaderSize(data) {
    var result = 417;
    var idx, len;
    for (idx = 0, len = data.length; idx < len; idx++) {
      if (data[idx] === 255 && data[idx + 1] === 218) {
        result = idx + 2;
        break;
      }
    }
    return result;
  }

  function padBase64(base64) {
    switch (base64.length % 4) {
      case 3: return base64 + '=';
      case 2: return base64 + '==';
      case 1: return base64 + '===';
      default: return base64;
    }
  }

  function glitch(imageData, parameters, callback) {
    var params = getNormalizedParameters(parameters);
    var canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    var ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
    var q = typeof params.quality === 'number' && params.quality < 1 && params.quality > 0 ? params.quality : 0.1;
    var base64 = padBase64(canvas.toDataURL('image/jpeg', q));
    var bytes = smashBytes(base64ToByteArray(base64), params);
    var img = new Image();
    img.onload = function () {
      ctx.drawImage(img, 0, 0);
      callback(ctx.getImageData(0, 0, imageData.width, imageData.height));
    };
    img.src = byteArrayToBase64(bytes);
  }

  root.glitchCanvas = {
    glitch: glitch,
    smashBytes: smashBytes,
    getNormalizedParameters: getNormalizedParameters,
    getJpegHeaderSize: getJpegHeaderSize,
    glitchJpegBytes: glitchJpegBytes,
    base64ToByteArray: base64ToByteArray,
    byteArrayToBase64: byteArrayToBase64
  };
})(typeof window !== 'undefined' ? window : this);
