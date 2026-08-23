// Song list and fret encoding from makaroni4/guitar_bro (MIT).
(function (root) {
  'use strict';

  var C = root.GBConfig;
  var NOTES = {};

  Object.keys(C.strings).forEach(function (id) {
    NOTES[id] = C.strings[id].freqs.slice(1, 13).map(function (row) { return row[1]; });
  });

  var SONGS = {
    'Random notes': null,
    'Happy Birthday': '0-0-2--0--5-4----0-0-2--0----7-5----0-0-9--7-5-4--2-2----10-10-9--5--7-5',
    'Guess what': '0--3--5---0--3--6--5---0--3--5---3--0',
    'Abba: Money Money Money v2 (Tempo=200)': [['F', 4], ['G', 8], ['G#', 4], ['F', 8], ['G', 4], ['G#', 4], ['-', 4], ['G#', 4], ['F', 8], ['G', 4], ['G#', 4], ['-', 4], ['G', 4], ['F', 8], ['G#', 4], ['G#', 4], ['-', 16], ['F', 1]],
    'Coca Cola(Tempo=125)': [['A', 8], ['A', 8], ['A', 8], ['A', 8], ['A#', 4], ['A', 8], ['G', 4], ['G', 8], ['C', 8], ['A', 4], ['F', 4], ['-', 2]],
    'Eiffel 65: Blue v1 (Tempo=140)': [['A', 4], ['A#', 4], ['G', 8], ['A#', 8], ['C', 8], ['F', 8], ['A', 8], ['A#', 4], ['G', 8], ['A#', 8], ['D', 8], ['D#', 4], ['D', 8], ['C', 8], ['A#', 4], ['G', 8], ['A#', 8], ['C', 8], ['F', 8], ['A', 8], ['A#', 4], ['G', 8], ['A#', 8], ['D', 8], ['D#', 4], ['D', 8], ['C', 8], ['A#', 4], ['G', 8], ['A#', 8], ['C', 8], ['F', 8], ['A', 8], ['A#', 4], ['G', 8], ['A#', 8], ['D', 8], ['D#', 4], ['D', 8], ['C', 8], ['A#', 4], ['G', 8], ['A#', 8], ['A', 8], ['F', 8], ['F', 8], ['G', 2]],
    'Europe: The Final Countdown (Tempo=125)': [['-', 4], ['-', 8], ['C', 16], ['A#', 16], ['C', 4], ['F', 4], ['-', 4], ['-', 8], ['C#', 16], ['C', 16], ['C#', 8], ['C', 8], ['A#', 4], ['-', 4], ['-', 8], ['C#', 16], ['C', 16], ['C#', 4], ['F', 4], ['-', 4], ['-', 8], ['A#', 16], ['G#', 16], ['A#', 8], ['G#', 8], ['G', 8], ['A#', 8], ['G#', 4], ['-', 8], ['G', 16], ['G#', 16], ['A#', 4], ['-', 8], ['G#', 16], ['A#', 16], ['C', 8], ['A#', 8], ['G#', 8], ['G', 8], ['F', 4], ['C#', 4], ['C', 2], ['-', 4], ['C', 16], ['C#', 16], ['C', 16], ['A#', 16], ['C', 1]],
    'Haddaway: What is Love (Tempo=225)': [['A#', 4], ['A', 4], ['A#', 4], ['G', 4], ['A#', 4], ['A', 4], ['A#', 4], ['G', 4], ['A#', 4], ['A', 4], ['A#', 4], ['F', 4], ['A#', 4], ['A', 4], ['A#', 4], ['F', 4], ['A', 4], ['G', 4], ['A', 4], ['F', 4], ['A', 4], ['G', 4], ['A', 4], ['F', 4], ['A', 4], ['G', 4], ['A', 4], ['F', 4], ['A', 4], ['G', 4], ['A', 4], ['F', 4]],
    'James Bond: Tomorrow Never Dies (Tempo=125)': [['F', 8], ['G', 16], ['G', 16], ['G', 8], ['G', 4], ['F', 8], ['F', 8], ['F', 8], ['F', 8], ['G#', 16], ['G#', 16], ['G#', 8], ['G#', 4], ['G', 8], ['G', 8], ['G', 8], ['F', 8], ['G', 16], ['G', 16], ['G', 8], ['G', 4], ['F', 8], ['F', 8], ['F', 8], ['F', 8], ['G#', 16], ['G#', 16], ['G#', 8], ['G#', 4], ['G', 8], ['G', 8], ['G', 8]],
    'Nirvana: Come as You Are (Tempo=225)': [['F', 8], ['F', 8], ['F#', 8], ['G', 8], ['-', 4], ['-', 4], ['A#', 8], ['G', 8], ['A#', 8], ['G', 8], ['G', 8], ['F#', 8], ['F', 8], ['C', 8], ['F', 8], ['F', 8], ['-', 4], ['-', 4], ['C', 8], ['F', 8], ['F#', 8], ['G', 8], ['-', 4], ['-', 4], ['A#', 8], ['G', 8], ['A#', 8], ['G', 8], ['G', 8], ['F#', 8], ['F', 8], ['C', 8], ['F', 8], ['F', 8], ['-', 4], ['-', 4], ['C', 8]],
    'Ricky Martin: Livin La Vida Loca (Tempo=160)': [['A#', 16], ['-', 8], ['-', 16], ['A#', 4], ['-', 16], ['-', 32], ['F#', 8], ['G#', 8], ['B', 16], ['-', 8], ['-', 16], ['B', 16], ['-', 8], ['-', 16], ['A#', 4], ['-', 4], ['-', 8], ['A#', 16], ['-', 8], ['-', 16], ['A#', 4], ['-', 16], ['-', 32], ['F#', 8], ['F', 8], ['G#', 8], ['-', 8], ['G#', 8], ['-', 8], ['F#', 4], ['-', 4], ['-', 8], ['A#', 16], ['-', 8], ['-', 16], ['A#', 4], ['-', 8], ['F#', 8], ['G#', 8], ['B', 16], ['-', 8], ['-', 16], ['B', 16], ['-', 8], ['-', 16], ['A#', 4], ['-', 4], ['-', 8], ['A#', 16], ['-', 8], ['-', 16], ['A#', 4], ['-', 8], ['F#', 8], ['F', 8], ['G#', 16], ['-', 8], ['-', 16], ['G#', 8], ['-', 8], ['F#', 4], ['-', 8]],
    'Smoke on the Water (Tempo=112)': [['F', 4], ['G#', 4], ['A#', 4], ['F', 4], ['G#', 4], ['B', 8], ['A#', 4], ['-', 4], ['F', 4], ['G#', 4], ['A#', 4], ['G#', 4], ['F', 4], ['-', 2], ['-', 8], ['F', 4], ['G#', 4], ['A#', 4], ['F', 4], ['G#', 4], ['B', 8], ['A#', 4], ['-', 4], ['F', 4], ['G#', 4], ['A#', 4], ['G#', 4], ['F', 4], ['-', 4]]
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function randomEncoded(seed) {
    var rng = mulberry32(seed >>> 0);
    var parts = [];
    var i;
    for (i = 0; i < 20; i++) parts.push(String(Math.floor(rng() * 12)));
    return parts.join('--------');
  }

  function parseSong(encoded, stringId) {
    var notes = NOTES[stringId];
    var song = [];
    var duration = 0;
    var last = null;
    var i, ch, fret;
    for (i = 0; i < encoded.length; i++) {
      ch = encoded.charAt(i);
      if (ch !== '-') {
        if (duration > 0 && last != null) song.push([last, 8 / duration]);
        fret = parseInt(ch, 10);
        last = fret === 0 ? 'E' : notes[fret - 1];
        duration = 0;
      } else {
        duration += 1;
      }
    }
    if (last != null) song.push([last, 1]);
    return song;
  }

  var GBSongs = {
    names: Object.keys(SONGS),
    notes: function (stringId) { return NOTES[stringId] || []; },
    findNoteIndex: function (note, stringId) {
      var notes = NOTES[stringId] || [];
      var i;
      for (i = 0; i < notes.length; i++) if (notes[i] === note) return i;
      return -1;
    },
    freqOf: function (note, stringId) {
      var rows = C.strings[stringId] && C.strings[stringId].freqs;
      var i;
      if (!rows) return 0;
      for (i = 0; i < rows.length; i++) if (rows[i][1] === note) return rows[i][0];
      return 0;
    },
    load: function (name, stringId, seed) {
      var raw = SONGS[name];
      if (name === 'Random notes' || raw == null) return parseSong(randomEncoded(seed == null ? 1 : seed), stringId);
      if (typeof raw !== 'string') return raw.slice();
      return parseSong(raw, stringId);
    }
  };

  root.GBSongs = GBSongs;
})(typeof window !== 'undefined' ? window : globalThis);
