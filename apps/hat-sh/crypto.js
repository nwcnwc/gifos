/*
 * hat.sh v2 crypto, faithfully: the same signatures, salt/header layout,
 * secretstream tags, Argon2id interactive limits, and X25519 session-key
 * roles the service-worker in sh-dv/hat.sh @ 540d3cc uses.
 *
 * Needs window.sodium (libsodium-wrappers sumo) already loaded.
 */
(function (global) {
  'use strict';

  var SIG = {
    v1: 'Encrypted Using Hat.sh',
    v2_symmetric: 'zDKO6XYXioc',
    v2_asymmetric: 'hTWKbfoikeg'
  };
  var CHUNK = 64 * 1024 * 1024;
  var ABYTES = 17;
  var encoder = new TextEncoder();
  var decoder = new TextDecoder();

  function sodium() {
    var s = global.sodium;
    if (!s) throw new Error('libsodium did not load.');
    return s;
  }

  function ready() {
    var s = sodium();
    return s.ready ? s.ready.then(function () { return s; }) : Promise.resolve(s);
  }

  function tick() {
    return new Promise(function (r) { setTimeout(r, 0); });
  }

  function asBlob(file) {
    if (file && typeof file.slice === 'function') return file;
    return new Blob([file]);
  }

  function concat(parts) {
    var n = 0, i;
    for (i = 0; i < parts.length; i++) n += parts[i].length;
    var out = new Uint8Array(n), o = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
    return out;
  }

  function detectBytes(u8) {
    var head = decoder.decode(u8.subarray(0, Math.min(22, u8.length)));
    if (head.slice(0, 11) === SIG.v2_symmetric) return 'v2_symmetric';
    if (head.slice(0, 11) === SIG.v2_asymmetric) return 'v2_asymmetric';
    if (head.slice(0, SIG.v1.length) === SIG.v1) return 'v1';
    return 'plain';
  }

  function detect(file) {
    return asBlob(file).slice(0, 22).arrayBuffer().then(function (buf) {
      return detectBytes(new Uint8Array(buf));
    });
  }

  function deriveKey(s, password, salt) {
    return s.crypto_pwhash(
      s.crypto_secretstream_xchacha20poly1305_KEYBYTES,
      password,
      salt,
      s.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      s.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      s.crypto_pwhash_ALG_ARGON2ID13
    );
  }

  function encKeyPair(s, privateKey, publicKey) {
    if (privateKey === publicKey) throw new Error('That is the same key twice — you need your private key and their public key.');
    var sk = s.from_base64(privateKey), pk = s.from_base64(publicKey);
    if (sk.length !== s.crypto_kx_SECRETKEYBYTES) throw new Error('That does not look like a private key.');
    if (pk.length !== s.crypto_kx_PUBLICKEYBYTES) throw new Error('That does not look like a public key.');
    var mine = s.to_base64(s.crypto_scalarmult_base(sk));
    if (mine === publicKey) throw new Error('That is the public key that belongs to this private key. Use the other person\'s public key.');
    var sess = s.crypto_kx_client_session_keys(s.crypto_scalarmult_base(sk), sk, pk);
    if (!sess) throw new Error('Those keys do not make a session.');
    return sess;
  }

  function decKeyPair(s, privateKey, publicKey) {
    if (privateKey === publicKey) throw new Error('That is the same key twice — you need your private key and their public key.');
    var sk = s.from_base64(privateKey), pk = s.from_base64(publicKey);
    if (sk.length !== s.crypto_kx_SECRETKEYBYTES) throw new Error('That does not look like a private key.');
    if (pk.length !== s.crypto_kx_PUBLICKEYBYTES) throw new Error('That does not look like a public key.');
    var mine = s.to_base64(s.crypto_scalarmult_base(sk));
    if (mine === publicKey) throw new Error('That is the public key that belongs to this private key. Use the other person\'s public key.');
    var sess = s.crypto_kx_server_session_keys(s.crypto_scalarmult_base(sk), sk, pk);
    if (!sess) throw new Error('Those keys do not make a session.');
    return sess;
  }

  function encryptStream(file, key, prefix, onProgress) {
    var s = sodium();
    var blob = asBlob(file);
    var size = blob.size;
    var res = s.crypto_secretstream_xchacha20poly1305_init_push(key);
    var parts = prefix.concat([res.header]);
    var index = 0;

    function step() {
      var last = index + CHUNK >= size;
      return blob.slice(index, index + CHUNK).arrayBuffer().then(function (buf) {
        index += CHUNK;
        var tag = last
          ? s.crypto_secretstream_xchacha20poly1305_TAG_FINAL
          : s.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;
        var enc = s.crypto_secretstream_xchacha20poly1305_push(res.state, new Uint8Array(buf), null, tag);
        parts.push(new Uint8Array(enc));
        if (onProgress) onProgress(Math.min(index, size), size);
        if (last) return new Blob(parts);
        return tick().then(step);
      });
    }
    return (size === 0 ? step() : step());
  }

  function decryptStream(file, key, start, onProgress) {
    var s = sodium();
    var blob = asBlob(file);
    var size = blob.size;
    return blob.slice(start, start + 24).arrayBuffer().then(function (hbuf) {
      var state = s.crypto_secretstream_xchacha20poly1305_init_pull(new Uint8Array(hbuf), key);
      if (!state) throw new Error('Wrong password, or this file is not a hat.sh v2 file.');
      var parts = [];
      var index = start + 24;

      function step() {
        var end = Math.min(index + CHUNK + ABYTES, size);
        var last = end >= size;
        return blob.slice(index, end).arrayBuffer().then(function (buf) {
          var pulled = s.crypto_secretstream_xchacha20poly1305_pull(state, new Uint8Array(buf));
          if (!pulled) throw new Error('Wrong password, or the file is damaged.');
          parts.push(new Uint8Array(pulled.message));
          index = end;
          if (onProgress) onProgress(Math.min(index, size), size);
          if (last) return new Blob(parts);
          return tick().then(step);
        });
      }
      return step();
    });
  }

  function outNameEnc(name) { return (name || 'file') + '.enc'; }
  function outNameDec(name) {
    name = name || 'file';
    return /\.enc$/i.test(name) ? name.replace(/\.enc$/i, '') : name + '.dec';
  }

  var api = {
    SIG: SIG,
    CHUNK: CHUNK,
    ready: ready,

    detect: detect,
    detectBytes: detectBytes,

    generatePassword: function () {
      return ready().then(function (s) {
        return s.to_base64(s.randombytes_buf(16), s.base64_variants.URLSAFE_NO_PADDING);
      });
    },

    generateKeyPair: function () {
      return ready().then(function (s) {
        var kp = s.crypto_kx_keypair();
        return { publicKey: s.to_base64(kp.publicKey), privateKey: s.to_base64(kp.privateKey) };
      });
    },

    publicFromPrivate: function (privateKey) {
      return ready().then(function (s) {
        return s.to_base64(s.crypto_scalarmult_base(s.from_base64(privateKey)));
      });
    },

    encryptPassword: function (file, password, onProgress) {
      if (!password || password.length < 12) return Promise.reject(new Error('Use at least 12 characters.'));
      return ready().then(function (s) {
        if (onProgress) onProgress(0, 1, 'key');
        var salt = s.randombytes_buf(s.crypto_pwhash_SALTBYTES);
        var key = deriveKey(s, password, salt);
        var sig = encoder.encode(SIG.v2_symmetric);
        return encryptStream(file, key, [sig, salt], onProgress);
      }).then(function (blob) {
        return { blob: blob, name: outNameEnc(file && file.name) };
      });
    },

    decryptPassword: function (file, password, onProgress) {
      if (!password) return Promise.reject(new Error('Enter the password.'));
      return ready().then(function (s) {
        return asBlob(file).slice(0, 27).arrayBuffer().then(function (buf) {
          var u = new Uint8Array(buf);
          if (detectBytes(u) !== 'v2_symmetric') throw new Error('This is not a password-encrypted hat.sh file.');
          if (onProgress) onProgress(0, 1, 'key');
          var salt = u.subarray(11, 27);
          var key = deriveKey(s, password, salt);
          return decryptStream(file, key, 27, onProgress);
        });
      }).then(function (blob) {
        return { blob: blob, name: outNameDec(file && file.name) };
      });
    },

    encryptKeys: function (file, privateKey, publicKey, onProgress) {
      return ready().then(function (s) {
        var sess = encKeyPair(s, privateKey, publicKey);
        var sig = encoder.encode(SIG.v2_asymmetric);
        return encryptStream(file, sess.sharedTx, [sig], onProgress);
      }).then(function (blob) {
        return { blob: blob, name: outNameEnc(file && file.name) };
      });
    },

    decryptKeys: function (file, privateKey, publicKey, onProgress) {
      return ready().then(function (s) {
        return asBlob(file).slice(0, 11).arrayBuffer().then(function (buf) {
          if (detectBytes(new Uint8Array(buf)) !== 'v2_asymmetric') {
            throw new Error('This is not a key-encrypted hat.sh file.');
          }
          var sess = decKeyPair(s, privateKey, publicKey);
          return decryptStream(file, sess.sharedRx, 11, onProgress);
        });
      }).then(function (blob) {
        return { blob: blob, name: outNameDec(file && file.name) };
      });
    },

    // Used by the test-decryption path in hat.sh: try the first ciphertext
    // chunk before spending the rest of the file.
    testPassword: function (file, password) {
      return ready().then(function (s) {
        var blob = asBlob(file);
        return Promise.all([
          blob.slice(0, 51).arrayBuffer(),
          blob.slice(51, 51 + CHUNK + ABYTES).arrayBuffer()
        ]).then(function (pair) {
          var head = new Uint8Array(pair[0]);
          if (detectBytes(head) !== 'v2_symmetric') throw new Error('This is not a password-encrypted hat.sh file.');
          var salt = head.subarray(11, 27);
          var header = head.subarray(27, 51);
          var key = deriveKey(s, password, salt);
          var state = s.crypto_secretstream_xchacha20poly1305_init_pull(header, key);
          if (!state) throw new Error('Wrong password.');
          var pulled = s.crypto_secretstream_xchacha20poly1305_pull(state, new Uint8Array(pair[1]));
          if (!pulled) throw new Error('Wrong password.');
          return true;
        });
      });
    }
  };

  global.HatCrypto = api;
})(typeof window !== 'undefined' ? window : globalThis);
