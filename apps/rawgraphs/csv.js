/* CSV / TSV parse + type inference. Classic IIFE. No network. */
(function (root) {
  'use strict';

  function looksSpreadsheet(name) {
    return /\.(xlsx|xls|ods)$/i.test(String(name || ''));
  }

  function detectDelim(text) {
    var first = String(text || '').split(/\r?\n/).filter(function (l) {
      return l.trim();
    })[0] || '';
    var tabs = (first.match(/\t/g) || []).length;
    var commas = (first.match(/,/g) || []).length;
    var semis = (first.match(/;/g) || []).length;
    if (tabs >= commas && tabs >= semis && tabs > 0) return '\t';
    if (semis > commas && semis > 0) return ';';
    return ',';
  }

  function parseRows(text, delim) {
    var rows = [];
    var row = [];
    var cur = '';
    var q = false;
    var s = String(text == null ? '' : text);
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (q) {
        if (c === '"') {
          if (s.charAt(i + 1) === '"') { cur += '"'; i++; }
          else q = false;
        } else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; }
      else if (c !== '\r') cur += c;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) {
      return r && r.some(function (c) { return String(c == null ? '' : c).trim() !== ''; });
    });
  }

  function uniqueName(name, used) {
    var base = name || 'field';
    var n = base, i = 2;
    while (used[n]) { n = base + '_' + i; i++; }
    used[n] = true;
    return n;
  }

  function parseCsv(text) {
    var raw = String(text == null ? '' : text);
    if (!raw.trim()) {
      return { empty: true, message: 'Paste a table, choose a CSV, or load the sample.' };
    }
    var delim = detectDelim(raw);
    var grid = parseRows(raw, delim);
    if (!grid.length) {
      return { empty: true, message: 'Paste a table, choose a CSV, or load the sample.' };
    }
    var header = grid[0].map(function (c) { return String(c == null ? '' : c).trim(); });
    if (!header.length || header.every(function (c) { return c === ''; })) {
      return { error: true, message: 'The header row is empty.' };
    }
    if (grid.length === 1) {
      return { error: true, message: 'Need a header row and at least one data row.', fields: header };
    }
    var used = Object.create(null);
    var fields = header.map(function (h, i) {
      return uniqueName(h || ('col_' + (i + 1)), used);
    });
    var rows = [];
    for (var r = 1; r < grid.length; r++) {
      var obj = {};
      for (var c = 0; c < fields.length; c++) {
        obj[fields[c]] = grid[r][c] == null ? '' : String(grid[r][c]).trim();
      }
      rows.push(obj);
    }
    return { data: rows, fields: fields, rows: rows.length, delim: delim };
  }

  function isNumberish(v) {
    if (v == null || v === '') return false;
    var s = String(v).replace(/,/g, '');
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) return false;
    return isFinite(+s);
  }

  function inferTypes(rows, fields) {
    var types = {};
    (fields || []).forEach(function (f) {
      var n = 0, k = 0;
      for (var i = 0; i < (rows || []).length; i++) {
        var v = rows[i][f];
        if (v == null || v === '') continue;
        k++;
        if (isNumberish(v)) n++;
      }
      types[f] = k && n / k >= 0.8 ? 'number' : 'string';
    });
    return types;
  }

  function asNumber(v) {
    if (v == null || v === '') return NaN;
    var n = +String(v).replace(/,/g, '');
    return isFinite(n) ? n : NaN;
  }

  root.RawCsv = {
    parseCsv: parseCsv,
    inferTypes: inferTypes,
    looksSpreadsheet: looksSpreadsheet,
    asNumber: asNumber,
    isNumberish: isNumberish
  };
}(typeof window !== 'undefined' ? window : globalThis));
