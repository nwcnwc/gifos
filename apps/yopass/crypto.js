// AES-GCM lock/unlock. Optional passphrase via PBKDF2.
// Classic IIFE. SubtleCrypto only. No wasm.
(function (root) {
  'use strict';

  function b64(bytes) {
    var bin = '', i, u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin);
  }
  function unb64(s) {
    var bin = atob(s), u8 = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function rand(n) {
    var u = new Uint8Array(n);
    (root.crypto || crypto).getRandomValues(u);
    return u;
  }
  function subtle() {
    var c = root.crypto || crypto;
    if (!c || !c.subtle) return Promise.reject(new Error('This device cannot encrypt.'));
    return Promise.resolve(c.subtle);
  }

  function importRaw(raw) {
    return subtle().then(function (s) {
      return s.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    });
  }

  function derive(pass, salt) {
    var enc = new TextEncoder();
    return subtle().then(function (s) {
      return s.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']).then(function (base) {
        return s.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
          base,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      });
    });
  }

  function lock(plain, passphrase) {
    var iv = rand(12);
    var enc = new TextEncoder();
    var data = enc.encode(String(plain || ''));
    if (passphrase) {
      var salt = rand(16);
      return derive(passphrase, salt).then(function (key) {
        return subtle().then(function (s) { return s.encrypt({ name: 'AES-GCM', iv: iv }, key, data); });
      }).then(function (ct) {
        return { ct: b64(ct), iv: b64(iv), salt: b64(salt), hasPass: true };
      });
    }
    var raw = rand(32);
    return importRaw(raw).then(function (key) {
      return subtle().then(function (s) { return s.encrypt({ name: 'AES-GCM', iv: iv }, key, data); });
    }).then(function (ct) {
      return { ct: b64(ct), iv: b64(iv), key: b64(raw), hasPass: false };
    });
  }

  function unlock(rec, passphrase) {
    if (!rec || !rec.ct || !rec.iv) return Promise.reject(new Error('Nothing locked.'));
    var iv, ct, salt, rawKey, usedPass = false;
    try {
      iv = unb64(rec.iv);
      ct = unb64(rec.ct);
    } catch (e) {
      return Promise.reject(new Error('Could not open it. The bytes were changed.'));
    }
    var keyP;
    if (rec.hasPass) {
      if (!passphrase) return Promise.reject(new Error('This secret needs a passphrase.'));
      if (!rec.salt) return Promise.reject(new Error('This secret is missing its salt.'));
      try { salt = unb64(rec.salt); } catch (e) {
        return Promise.reject(new Error('Could not open it. The bytes were changed.'));
      }
      usedPass = true;
      keyP = derive(passphrase, salt);
    } else {
      if (!rec.key) return Promise.reject(new Error('This secret is missing its key.'));
      try { rawKey = unb64(rec.key); } catch (e) {
        return Promise.reject(new Error('Could not open it. The bytes were changed.'));
      }
      keyP = importRaw(rawKey);
    }
    return keyP.then(function (key) {
      return subtle().then(function (s) { return s.decrypt({ name: 'AES-GCM', iv: iv }, key, ct); });
    }).then(function (pt) {
      return new TextDecoder().decode(pt);
    }).catch(function (err) {
      var m = String(err && err.message || err);
      if (/passphrase|salt|key|locked|Nothing locked|bytes were changed/i.test(m)) throw err;
      if (usedPass) throw new Error('Wrong passphrase.');
      throw new Error('Could not open it. The bytes were changed.');
    });
  }

  root.YopassCrypto = { lock: lock, unlock: unlock, b64: b64, unb64: unb64 };
})(typeof window !== 'undefined' ? window : globalThis);
