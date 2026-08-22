/*
 * onnxseg.js — make an MDX .onnx's TIME dimension dynamic, in place, in the app.
 *
 * WHY. The UVR exports declare their input/output as [batch_size, 4, dim_f,
 * 256] — the time axis is a FIXED 256, and only the batch is symbolic. ONNX
 * Runtime Web's WebGPU backend uses that: with every shape static it plans and
 * ALLOCATES the whole graph's activation memory at session create — measured at
 * 1.82 GB for Inst HQ 3's 66 MB of weights (543 buffers, the largest 160 MB).
 * That allocation is what kills the device on a 4 GB phone and wedges a
 * Chromebook. The network itself is fully convolutional along time (Conv /
 * ConvTranspose / BatchNorm, the TDF MatMuls act on the frequency axis behind
 * a transpose — there is not one Reshape in the graph), so the 256 is a
 * declaration, not arithmetic: verified by patching the dim and comparing
 * against the unpatched model, bit-identical output at 256 and clean runs at
 * 64/32. With the dim symbolic, the app can create the session with
 * freeDimensionOverrides { time: 64 } and the same plan drops to ~0.5 GB.
 *
 * WHY BYTES AND NOT AN ONNX LIBRARY. The weights arrive sha256-pinned through
 * the asset store, and the pin must keep meaning the upstream bytes — so the
 * edit happens in memory, after verification, on the way into the engine. It
 * is a protobuf splice: for each graph input/output, the shape's LAST
 * Dimension has its `dim_value` (field 1, varint) replaced with `dim_param:
 * "time"` (field 2, string), and every enclosing message's length varint is
 * corrected for the few bytes of growth. Nothing else moves; the output is
 * assembled in one pass from the original plus a handful of splices, so a
 * 66 MB model costs one extra copy, not one per nesting level.
 *
 * The walk is strict on purpose: it must find ModelProto.graph (field 7),
 * at least one graph input (11) and output (12), each with a TypeProto
 * (2) -> tensor_type (1) -> shape (2) of EXACTLY FOUR dimensions whose last is
 * a positive dim_value. Anything else throws — a model this patcher does not
 * recognise should fail at load, loudly, not run at the wrong shape.
 *
 * Attaches window.VRONNX = { dynamicTime(bytes) -> Uint8Array }.
 */
(function (root) {
  'use strict';

  // protobuf wire types: 0 varint, 1 fixed64, 2 length-delimited, 5 fixed32.
  function readVarint(buf, p, end) {
    var v = 0, mul = 1, b;
    do {
      if (p >= end) throw new Error('onnxseg: truncated varint');
      b = buf[p++];
      v += (b & 127) * mul;
      mul *= 128;
    } while (b & 128);
    if (!Number.isSafeInteger(v)) throw new Error('onnxseg: varint too large');
    return { v: v, p: p };
  }

  function varintBytes(n) {
    var out = [];
    do { var b = n % 128; n = Math.floor(n / 128); out.push(n > 0 ? b | 128 : b); } while (n > 0);
    return out;
  }

  // Iterate the fields of a message body [s, e). cb(fieldNo, wire, headStart,
  // dataStart, dataEnd, varintValue). For wire 2, [dataStart, dataEnd) is the
  // content; its length varint sits at [lenStart, dataStart).
  function eachField(buf, s, e, cb) {
    var p = s;
    while (p < e) {
      var head = p;
      var key = readVarint(buf, p, e); p = key.p;
      var fieldNo = Math.floor(key.v / 8), wire = key.v % 8;
      if (wire === 0) {
        var val = readVarint(buf, p, e);
        cb(fieldNo, 0, head, val.p, val.p, val.v, p);
        p = val.p;
      } else if (wire === 2) {
        var lenStart = p;
        var len = readVarint(buf, p, e); p = len.p;
        if (p + len.v > e) throw new Error('onnxseg: field overruns message');
        cb(fieldNo, 2, head, p, p + len.v, len.v, lenStart);
        p += len.v;
      } else if (wire === 5) { cb(fieldNo, 5, head, p, p + 4, 0, p); p += 4; }
      else if (wire === 1) { cb(fieldNo, 1, head, p, p + 8, 0, p); p += 8; }
      else throw new Error('onnxseg: unsupported wire type ' + wire);
    }
    if (p !== e) throw new Error('onnxseg: message body misaligned');
  }

  // The splice list an edit pass produces: replace [start, end) with bytes.
  // Each editor returns the total byte-length delta of its subtree, so the
  // caller can fix the enclosing length varint.
  function fixLength(buf, edits, lenStart, dataStart, oldLen, delta) {
    if (delta === 0) return 0;
    var nb = varintBytes(oldLen + delta);
    edits.push({ start: lenStart, end: dataStart, bytes: nb });
    return delta + (nb.length - (dataStart - lenStart));
  }

  // Dimension: replace `dim_value: N` (field 1) with `dim_param: "time"`
  // (field 2). A dim that is already symbolic is left alone.
  function editDim(buf, s, e, edits) {
    var kind = null, value = -1;
    eachField(buf, s, e, function (no, wire, hs, ds, de, v) {
      if (no === 1 && wire === 0) { kind = 'value'; value = v; }
      if (no === 2 && wire === 2) kind = 'param';
    });
    if (kind === 'param') return 0;
    if (kind !== 'value' || value <= 0) throw new Error('onnxseg: dimension has no dim_value');
    var repl = [0x12, 4, 0x74, 0x69, 0x6d, 0x65];   // field 2, len 4, "time"
    edits.push({ start: s, end: e, bytes: repl });
    return repl.length - (e - s);
  }

  // TensorShapeProto: repeated Dimension (field 1). Exactly four dims, and only
  // the LAST is rewritten — [batch, 4, dim_f, time].
  function editShape(buf, s, e, edits) {
    var dims = [];
    eachField(buf, s, e, function (no, wire, hs, ds, de, v, lenStart) {
      if (no === 1 && wire === 2) dims.push({ ds: ds, de: de, lenStart: lenStart, len: v });
    });
    if (dims.length !== 4) throw new Error('onnxseg: expected a 4-D shape, found ' + dims.length + ' dims');
    var d = dims[3];
    var delta = editDim(buf, d.ds, d.de, edits);
    return fixLength(buf, edits, d.lenStart, d.ds, d.len, delta);
  }

  // Descend one length-delimited field (fieldNo) of the message [s, e) and fix
  // its length for whatever changed inside. `fn` edits the inner body.
  function descend(buf, s, e, fieldNo, what, edits, fn) {
    var found = null;
    eachField(buf, s, e, function (no, wire, hs, ds, de, v, lenStart) {
      if (no === fieldNo && wire === 2 && !found) found = { ds: ds, de: de, lenStart: lenStart, len: v };
    });
    if (!found) throw new Error('onnxseg: no ' + what);
    var delta = fn(buf, found.ds, found.de, edits);
    return fixLength(buf, edits, found.lenStart, found.ds, found.len, delta);
  }

  // ValueInfoProto -> type (2) -> tensor_type (1) -> shape (2).
  function editValueInfo(buf, s, e, edits) {
    return descend(buf, s, e, 2, 'type on a graph input/output', edits, function (b, s2, e2, ed) {
      return descend(b, s2, e2, 1, 'tensor_type', ed, function (b2, s3, e3, ed2) {
        return descend(b2, s3, e3, 2, 'shape', ed2, editShape);
      });
    });
  }

  // GraphProto: every input (11) and output (12).
  function editGraph(buf, s, e, edits) {
    var vis = [];
    eachField(buf, s, e, function (no, wire, hs, ds, de, v, lenStart) {
      if ((no === 11 || no === 12) && wire === 2) vis.push({ no: no, ds: ds, de: de, lenStart: lenStart, len: v });
    });
    if (!vis.some(function (x) { return x.no === 11; })) throw new Error('onnxseg: graph has no inputs');
    if (!vis.some(function (x) { return x.no === 12; })) throw new Error('onnxseg: graph has no outputs');
    var delta = 0;
    for (var i = 0; i < vis.length; i++) {
      var d = editValueInfo(buf, vis[i].ds, vis[i].de, edits);
      delta += fixLength(buf, edits, vis[i].lenStart, vis[i].ds, vis[i].len, d);
    }
    return delta;
  }

  /**
   * dynamicTime(bytes: Uint8Array) -> Uint8Array — a copy of the model with
   * the last dimension of every graph input/output rewritten to the symbolic
   * name "time". Throws if the bytes are not a model of the expected shape.
   */
  function dynamicTime(bytes) {
    var edits = [];
    descend(bytes, 0, bytes.length, 7, 'graph in the model', edits, editGraph);

    edits.sort(function (a, b) { return a.start - b.start; });
    var grow = 0, i;
    for (i = 0; i < edits.length; i++) {
      if (i > 0 && edits[i].start < edits[i - 1].end) throw new Error('onnxseg: overlapping edits');
      grow += edits[i].bytes.length - (edits[i].end - edits[i].start);
    }
    var out = new Uint8Array(bytes.length + grow);
    var src = 0, dst = 0;
    for (i = 0; i < edits.length; i++) {
      var ed = edits[i];
      out.set(bytes.subarray(src, ed.start), dst); dst += ed.start - src;
      out.set(ed.bytes, dst); dst += ed.bytes.length;
      src = ed.end;
    }
    out.set(bytes.subarray(src), dst); dst += bytes.length - src;
    if (dst !== out.length) throw new Error('onnxseg: assembled size mismatch');
    return out;
  }

  root.VRONNX = { dynamicTime: dynamicTime };
})(typeof window !== 'undefined' ? window : globalThis);
