/* backup.js — the reader's own data, out of the app and back in.
 *
 * Export writes ONE GIF: the app's icon animation stamped DATA BACKUP
 * (baked at build time into backup-host.gif), with every private
 * collection — settings, highlights & notes, voice notes, reading plans —
 * riding in a GIFOSBK1 application-extension block spliced in before the
 * trailer. The file plays as an ordinary GIF everywhere, and the stamp
 * says what it is. The marker is deliberately NOT GIFOS1.0: a backup is
 * data, not an app, and the OS must never offer to install it.
 *
 * Import reads that block back and MERGES: records land by id, so a
 * restore never deletes work that only exists on this device. Audio
 * notes ride as base64 inside the JSON payload.
 */
(function (root) {
  'use strict';

  var MARKER = 'GIFOSBK1';   // 8 bytes — the application-extension identifier
  var AUTH = 'v1 ';          // 3 bytes — payload format version
  var KIND = 'gifos-bible-backup';

  /* ---------------- bytes <-> base64 (pure, chunked) ---------------- */
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64encode(bytes) {
    var n = bytes.length, out = [], i;
    for (i = 0; i < n; i += 3) {
      var a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      var v = (a << 16) | ((b || 0) << 8) | (c || 0);
      out.push(B64.charAt((v >> 18) & 63), B64.charAt((v >> 12) & 63),
        i + 1 < n ? B64.charAt((v >> 6) & 63) : '=',
        i + 2 < n ? B64.charAt(v & 63) : '=');
    }
    return out.join('');
  }
  var B64LUT = (function () {
    var t = [], i;
    for (i = 0; i < 256; i++) t[i] = -1;
    for (i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
    return t;
  })();
  function b64decode(str) {
    var n = str.length, out = new Uint8Array(Math.floor((n * 3) / 4));
    var p = 0, buf = 0, bits = 0, i;
    for (i = 0; i < n; i++) {
      var v = B64LUT[str.charCodeAt(i) & 255];
      if (v < 0) continue;
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out[p++] = (buf >> bits) & 0xff; }
    }
    return out.subarray(0, p);
  }
  function textToBytes(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var u = unescape(encodeURIComponent(s)), out = new Uint8Array(u.length);
    for (var i = 0; i < u.length; i++) out[i] = u.charCodeAt(i);
    return out;
  }
  function bytesToText(b) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(b);
    var s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return decodeURIComponent(escape(s));
  }

  /* ---------------- the GIFOSBK1 application extension ---------------- */
  function appExtBlock(payload) {
    // 0x21 0xFF 0x0B + 8-byte identifier + 3-byte auth, then ≤255-byte
    // sub-blocks, then a zero terminator — the framing every GIF reader skips.
    var head = 14, blocks = Math.ceil(payload.length / 255);
    var out = new Uint8Array(head + payload.length + blocks + 1);
    out[0] = 0x21; out[1] = 0xff; out[2] = 0x0b;
    var id = MARKER + AUTH, i;
    for (i = 0; i < 11; i++) out[3 + i] = id.charCodeAt(i);
    var p = head, s;
    for (s = 0; s < payload.length; s += 255) {
      var len = Math.min(255, payload.length - s);
      out[p++] = len;
      out.set(payload.subarray(s, s + len), p);
      p += len;
    }
    out[p] = 0;
    return out;
  }

  function findSpan(bytes) {
    var pos = 0, i;
    while (pos < bytes.length - 14) {
      if (bytes[pos] === 0x21 && bytes[pos + 1] === 0xff && bytes[pos + 2] === 0x0b) {
        var match = true;
        for (i = 0; i < 8; i++) if (bytes[pos + 3 + i] !== MARKER.charCodeAt(i)) { match = false; break; }
        if (match) {
          var headerEnd = pos + 14, p = headerEnd;
          while (p < bytes.length) {
            var size = bytes[p];
            if (size === 0) return { start: pos, headerEnd: headerEnd, end: p + 1 };
            p += 1 + size;
          }
          return null;
        }
      }
      pos++;
    }
    return null;
  }

  function readPayload(bytes) {
    var span = findSpan(bytes);
    if (!span) return null;
    var total = 0, p = span.headerEnd;
    while (bytes[p] !== 0) { total += bytes[p]; p += 1 + bytes[p]; }
    var out = new Uint8Array(total), o = 0;
    p = span.headerEnd;
    while (bytes[p] !== 0) {
      out.set(bytes.subarray(p + 1, p + 1 + bytes[p]), o);
      o += bytes[p]; p += 1 + bytes[p];
    }
    return out;
  }

  function buildGif(hostBytes, payload) {
    if (!hostBytes || hostBytes.length < 13 ||
        hostBytes[0] !== 0x47 || hostBytes[1] !== 0x49 || hostBytes[2] !== 0x46) {
      throw new Error('The backup art is not a GIF.');
    }
    var end = hostBytes.length;
    if (hostBytes[end - 1] === 0x3b) end -= 1; // re-add the trailer after our block
    var block = appExtBlock(payload);
    var out = new Uint8Array(end + block.length + 1);
    out.set(hostBytes.subarray(0, end), 0);
    out.set(block, end);
    out[out.length - 1] = 0x3b;
    return out;
  }

  /* ---------------- gathering and restoring ---------------- */
  function asU8(b) {
    if (b instanceof Uint8Array) return b;
    if (b && b.buffer) return new Uint8Array(b.buffer, b.byteOffset || 0, b.byteLength);
    return new Uint8Array(b || 0);
  }

  function collect(reader) {
    var store = reader.store;
    return Promise.all([
      store.prefs(),
      store.collection('marks').getAll(),
      store.collection('plans').getAll(),
      store.collection('voicenotes').getAll()
    ]).then(function (r) {
      var voices = [], rows = r[3] || [], i;
      for (i = 0; i < rows.length; i++) {
        var v = rows[i];
        voices.push({ id: v.id, mime: v.mime, ms: v.ms || 0, at: v.at || 0,
                      b64: b64encode(asU8(v.bytes)) });
      }
      return { kind: KIND, v: 1, at: Date.now(),
               prefs: r[0] || null, marks: r[1] || [], plans: r[2] || [],
               voicenotes: voices };
    });
  }

  function restore(reader, payload) {
    var store = reader.store;
    var marks = payload.marks || [], plans = payload.plans || [];
    var voices = payload.voicenotes || [];
    var puts = [], i;
    for (i = 0; i < marks.length; i++) puts.push(store.collection('marks').put(marks[i]));
    for (i = 0; i < plans.length; i++) puts.push(store.collection('plans').put(plans[i]));
    for (i = 0; i < voices.length; i++) {
      var v = voices[i];
      puts.push(store.collection('voicenotes').put({
        id: v.id, bytes: b64decode(v.b64 || ''), mime: v.mime, ms: v.ms || 0, at: v.at || 0
      }));
    }
    return Promise.all(puts).then(function () {
      if (!payload.prefs) return;
      var patch = {}, k;
      for (k in payload.prefs) if (k !== 'id') patch[k] = payload.prefs[k];
      for (k in patch) reader.prefs[k] = patch[k];
      return store.savePrefs(patch);
    }).then(function () {
      if (root.GifosBibleChrome) root.GifosBibleChrome(reader.prefs);
      reader.paint();
      return { marks: marks.length, plans: plans.length, voices: voices.length };
    });
  }

  /* ---------------- export & import, wired to buttons ---------------- */
  function download(bytes, name) {
    var blob = new Blob([bytes], { type: 'image/gif' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 4000);
  }

  function exportAll(reader) {
    var counted;
    return collect(reader).then(function (payload) {
      counted = payload;
      return fetch('backup-host.gif').then(function (res) {
        if (!res.ok) throw new Error('missing');
        return res.arrayBuffer();
      }).catch(function () {
        throw new Error('The backup art is missing — this copy was not packed by the build.');
      }).then(function (host) {
        var bytes = buildGif(new Uint8Array(host), textToBytes(JSON.stringify(payload)));
        var day = new Date().toISOString().slice(0, 10);
        download(bytes, 'bible-backup-' + day + '.gif');
        reader.toast('Backed up ' + counted.marks.length + ' highlights & notes, ' +
          counted.voicenotes.length + ' voice notes, ' + counted.plans.length + ' plans.');
      });
    }).catch(function (e) {
      reader.toast(e && e.message ? e.message : 'The backup could not be written.');
    });
  }

  function importFile(reader, file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(new Uint8Array(fr.result)); };
      fr.onerror = function () { reject(new Error('The file could not be read.')); };
      fr.readAsArrayBuffer(file);
    }).then(function (bytes) {
      var payload = readPayload(bytes);
      if (!payload) throw new Error('That GIF is not a Bible data backup.');
      var data = JSON.parse(bytesToText(payload));
      if (!data || data.kind !== KIND) throw new Error('That GIF is not a Bible data backup.');
      return restore(reader, data);
    }).then(function (n) {
      reader.toast('Restored ' + n.marks + ' highlights & notes, ' + n.voices +
        ' voice notes, ' + n.plans + ' plans, and your settings.');
    }).catch(function (e) {
      reader.toast(e && e.message ? e.message : 'The backup could not be read.');
    });
  }

  function importPick(reader) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/gif,.gif';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      input.remove();
      if (f) importFile(reader, f);
    });
    input.click();
  }

  root.GifosBibleBackup = {
    exportAll: exportAll, importPick: importPick, importFile: importFile,
    MARKER: MARKER, KIND: KIND,
    // the pure pieces, exposed so a node test can round-trip them
    _appExtBlock: appExtBlock, _readPayload: readPayload, _buildGif: buildGif,
    _b64encode: b64encode, _b64decode: b64decode
  };
})(typeof window !== 'undefined' ? window : globalThis);
