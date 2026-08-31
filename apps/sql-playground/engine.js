/* sql.js from packed bytes. Blob URL + wasmBinary; nothing is fetched. */
(function (root) {
  'use strict';

  var MISS = 'The SQLite engine did not start on this device.';
  var ROW_CAP = 500;

  function b64ToU8(b64) {
    var bin = atob(String(b64 || ''));
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function asU8(v) {
    if (!v) return null;
    if (v instanceof Uint8Array) return v;
    if (v instanceof ArrayBuffer) return new Uint8Array(v);
    if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    if (typeof v === 'string') {
      try { return b64ToU8(v); } catch (e) { return null; }
    }
    if (typeof v === 'object' && v.length != null) {
      try { return new Uint8Array(v); } catch (e) { return null; }
    }
    return null;
  }

  function quoteIdent(name) {
    return '"' + String(name == null ? '' : name).replace(/"/g, '""') + '"';
  }

  function looksLikeMutation(sql) {
    return /\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|VACUUM|REINDEX|TRUNCATE|ATTACH|DETACH)\b/i.test(String(sql || ''));
  }

  function friendlyError(e) {
    var msg = String((e && e.message) || e || 'SQL error');
    msg = msg.replace(/^Error:\s*/i, '').replace(/\s+/g, ' ').trim();
    if (msg.length > 240) msg = msg.slice(0, 237) + '…';
    return msg || 'SQL error';
  }

  function nowMs() {
    return (root.performance && performance.now) ? performance.now() : Date.now();
  }

  function cellText(v) {
    if (v == null) return { kind: 'null', text: 'NULL' };
    if (v instanceof Uint8Array) return { kind: 'blob', text: 'blob ' + v.length + ' B' };
    if (typeof v === 'number') return { kind: 'num', text: String(v) };
    if (typeof v === 'bigint') return { kind: 'num', text: v.toString() };
    return { kind: 'text', text: String(v) };
  }

  function clipResults(results) {
    var out = [];
    var clipped = 0;
    (results || []).forEach(function (set) {
      var values = set.values || [];
      var extra = 0;
      if (values.length > ROW_CAP) {
        extra = values.length - ROW_CAP;
        values = values.slice(0, ROW_CAP);
        clipped += extra;
      }
      out.push({ columns: set.columns || [], values: values, extra: extra });
    });
    return { sets: out, clipped: clipped };
  }

  function run(db, sql) {
    sql = String(sql == null ? '' : sql);
    if (!sql.trim()) return { ok: false, error: 'Type a SQL statement first.', ms: 0, sql: sql };
    var t0 = nowMs();
    try {
      var results = db.exec(sql) || [];
      var changes = 0;
      try { changes = db.getRowsModified(); } catch (e) {}
      var clip = clipResults(results);
      return {
        ok: true,
        results: clip.sets,
        clipped: clip.clipped,
        changes: changes,
        ms: Math.max(0, nowMs() - t0),
        sql: sql,
        mutated: looksLikeMutation(sql) || changes > 0
      };
    } catch (e) {
      return { ok: false, error: friendlyError(e), ms: Math.max(0, nowMs() - t0), sql: sql };
    }
  }

  function schema(db) {
    var out = [];
    var master;
    try {
      master = db.exec(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name"
      );
    } catch (e) {
      return out;
    }
    var rows = (master[0] && master[0].values) || [];
    for (var i = 0; i < rows.length; i++) {
      var name = rows[i][0];
      var type = rows[i][1];
      var cols = [];
      try {
        var info = db.exec('PRAGMA table_info(' + quoteIdent(name) + ')');
        var cv = (info[0] && info[0].values) || [];
        for (var j = 0; j < cv.length; j++) {
          cols.push({
            name: cv[j][1],
            type: cv[j][2] || '',
            notnull: !!cv[j][3],
            pk: !!cv[j][5]
          });
        }
      } catch (e) {}
      var count = null;
      try {
        var c = db.exec('SELECT COUNT(*) FROM ' + quoteIdent(name));
        count = c[0].values[0][0];
      } catch (e) {}
      out.push({ name: name, type: type, columns: cols, count: count });
    }
    return out;
  }

  function selectTableSql(name) {
    return 'SELECT * FROM ' + quoteIdent(name) + ' LIMIT 200;';
  }

  function explainSql(sql) {
    sql = String(sql || '').trim();
    if (!sql) return '';
    if (/^\s*explain\b/i.test(sql)) return sql;
    return 'EXPLAIN QUERY PLAN\n' + sql;
  }

  function start() {
    var init = root.initSqlJs;
    if (typeof init !== 'function') return Promise.reject(new Error(MISS));
    if (!root.SQL_WASM_B64) return Promise.reject(new Error(MISS));
    var bytes = b64ToU8(root.SQL_WASM_B64);
    var url = URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }));
    root.SQL_WASM_URL = url;
    return init({
      wasmBinary: bytes,
      locateFile: function () { return url; }
    }).catch(function (err) {
      var msg = friendlyError(err);
      throw new Error(msg && msg !== 'SQL error' ? msg : MISS);
    });
  }

  function open(SQL, bytes) {
    var u8 = asU8(bytes);
    if (u8 && u8.length) return new SQL.Database(u8);
    return new SQL.Database();
  }

  function loadSample(SQL) {
    var db = new SQL.Database();
    db.run(root.SQL_SAMPLE);
    return db;
  }

  root.SqlEngine = {
    MISS: MISS,
    ROW_CAP: ROW_CAP,
    b64ToU8: b64ToU8,
    asU8: asU8,
    quoteIdent: quoteIdent,
    looksLikeMutation: looksLikeMutation,
    friendlyError: friendlyError,
    cellText: cellText,
    clipResults: clipResults,
    run: run,
    schema: schema,
    selectTableSql: selectTableSql,
    explainSql: explainSql,
    start: start,
    open: open,
    loadSample: loadSample
  };
})(typeof window !== 'undefined' ? window : this);
