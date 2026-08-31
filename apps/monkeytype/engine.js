/*
 * Monkeytype test engine — word generation, key handling, WPM / acc.
 *
 * Scoring matches monkeytype.com's about page:
 *   wpm  = (correct characters including spaces) / 5 / minutes
 *   raw  = (all typed characters including errors and extras) / 5 / minutes
 *   acc  = 100 * correct / (correct + incorrect + extra + missed)
 *   consistency from the stdev of 1-second raw-wpm bursts
 *
 * The React frontend is not here. This file is the test.
 */
(function (root) {
  'use strict';

  var DATA = root.MT_DATA || { english: [], english_1k: [], quotes: [] };

  var TIME_OPTS = [15, 30, 60, 120];
  var WORDS_OPTS = [10, 25, 50, 100];
  var QUOTE_OPTS = ['short', 'medium', 'long', 'all'];
  var LANGS = ['english', 'english_1k'];

  var PUNCT_TRAIL = [
    { ch: ',', p: 0.25 },
    { ch: '.', p: 0.32 },
    { ch: '!', p: 0.35 },
    { ch: '?', p: 0.38 },
    { ch: ';', p: 0.42 },
    { ch: ':', p: 0.45 }
  ];

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedFrom(s) {
    if (typeof s === 'function') return s;
    if (typeof s === 'number' && s === s) return mulberry32(s >>> 0);
    var h = 2166136261;
    var str = String(s == null ? 'monkeytype' : s);
    var i;
    for (i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return mulberry32(h >>> 0);
  }

  function wordList(lang) {
    if (lang === 'english_1k' && DATA.english_1k && DATA.english_1k.length) {
      return DATA.english_1k;
    }
    return DATA.english || [];
  }

  function pickWord(rng, list) {
    if (!list || !list.length) return 'the';
    return list[Math.floor(rng() * list.length)];
  }

  function capitalize(w) {
    if (!w) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }

  function wrapPunct(word, rng, capNext) {
    var w = capNext ? capitalize(word) : word;
    var r = rng();
    if (r < 0.06) w = '"' + w + '"';
    else if (r < 0.09) w = "'" + w + "'";
    else if (r < 0.11) w = '(' + w + ')';
    r = rng();
    var i, end = false;
    for (i = 0; i < PUNCT_TRAIL.length; i++) {
      if (r < PUNCT_TRAIL[i].p) {
        w += PUNCT_TRAIL[i].ch;
        end = PUNCT_TRAIL[i].ch === '.' || PUNCT_TRAIL[i].ch === '!' || PUNCT_TRAIL[i].ch === '?';
        break;
      }
    }
    return { word: w, end: end };
  }

  function numberWord(rng) {
    var span = rng();
    if (span < 0.4) return String(1 + Math.floor(rng() * 9));
    if (span < 0.75) return String(10 + Math.floor(rng() * 90));
    return String(100 + Math.floor(rng() * 900));
  }

  function generateWords(opts) {
    opts = opts || {};
    var list = wordList(opts.lang);
    var rng = seedFrom(opts.seed);
    var n = opts.count | 0;
    if (n < 1) n = 50;
    var out = [];
    var cap = !!opts.punct;
    var i, w, p;
    for (i = 0; i < n; i++) {
      if (opts.numbers && rng() < 0.12) w = numberWord(rng);
      else w = pickWord(rng, list);
      if (opts.punct) {
        p = wrapPunct(w, rng, cap);
        w = p.word;
        cap = p.end;
      }
      out.push(w);
    }
    return out;
  }

  function quoteBucket(q, want) {
    var L = q.length || (q.text ? q.text.length : 0);
    if (want === 'short') return L <= 100;
    if (want === 'medium') return L >= 101 && L <= 300;
    if (want === 'long') return L >= 301 && L <= 600;
    if (want === 'thicc') return L >= 601;
    return true;
  }

  function pickQuote(opts) {
    opts = opts || {};
    var all = DATA.quotes || [];
    var want = opts.mode2 || 'all';
    var pool = [];
    var i, q;
    for (i = 0; i < all.length; i++) {
      q = all[i];
      if (q && q.text && quoteBucket(q, want)) pool.push(q);
    }
    if (!pool.length) pool = all;
    if (!pool.length) {
      return { id: 0, text: 'Type this sentence to begin.', source: '', length: 29 };
    }
    var rng = seedFrom(opts.seed);
    return pool[Math.floor(rng() * pool.length)];
  }

  function wordsFromQuote(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  }

  function neededCount(mode, mode2) {
    if (mode === 'words') return Math.max(10, mode2 | 0);
    if (mode === 'time') {
      var t = mode2 | 0;
      if (t <= 15) return 140;
      if (t <= 30) return 240;
      if (t <= 60) return 420;
      return 800;
    }
    return 50;
  }

  function createTest(opts) {
    opts = opts || {};
    var mode = opts.mode === 'words' || opts.mode === 'quote' ? opts.mode : 'time';
    var mode2 = opts.mode2;
    if (mode === 'time') {
      mode2 = TIME_OPTS.indexOf(mode2 | 0) >= 0 ? (mode2 | 0) : 30;
    } else if (mode === 'words') {
      mode2 = WORDS_OPTS.indexOf(mode2 | 0) >= 0 ? (mode2 | 0) : 25;
    } else {
      mode2 = QUOTE_OPTS.indexOf(mode2) >= 0 ? mode2 : 'all';
    }
    var seed = opts.seed == null ? ((Math.random() * 0x100000000) >>> 0) : (opts.seed >>> 0);
    var lang = opts.lang === 'english_1k' ? 'english_1k' : 'english';
    var punct = !!opts.punct;
    var numbers = !!opts.numbers;
    var quote = null;
    var words;
    if (mode === 'quote') {
      quote = pickQuote({ seed: seed, mode2: mode2 });
      words = wordsFromQuote(quote.text);
    } else {
      words = generateWords({
        seed: seed, lang: lang, punct: punct, numbers: numbers,
        count: neededCount(mode, mode2)
      });
    }
    var typed = new Array(words.length);
    var i;
    for (i = 0; i < words.length; i++) typed[i] = '';
    return {
      mode: mode, mode2: mode2, lang: lang, punct: punct, numbers: numbers,
      seed: seed, quote: quote, words: words, typed: typed,
      wordIndex: 0, startedAt: 0, finishedAt: 0,
      bursts: [], lastBurstAt: 0, burstChars: 0,
      keys: 0
    };
  }

  function currentWord(t) {
    return t.words[t.wordIndex] || '';
  }

  function isFinished(t, now) {
    if (t.finishedAt) return true;
    if (t.mode === 'time' && t.startedAt) {
      var lim = (t.mode2 | 0) * 1000;
      if ((now || Date.now()) - t.startedAt >= lim) return true;
    }
    if (t.mode === 'words' || t.mode === 'quote') {
      return t.wordIndex >= t.words.length;
    }
    return false;
  }

  function finish(t, now) {
    if (t.finishedAt) return t;
    t.finishedAt = now || Date.now();
    if (!t.startedAt) t.startedAt = t.finishedAt;
    return t;
  }

  function startIfNeeded(t, now) {
    if (!t.startedAt) {
      t.startedAt = now || Date.now();
      t.lastBurstAt = t.startedAt;
    }
  }

  function noteBurst(t, now, extraChars) {
    t.burstChars += extraChars;
    if (!t.lastBurstAt) t.lastBurstAt = t.startedAt || now;
    while (now - t.lastBurstAt >= 1000) {
      t.bursts.push(t.burstChars);
      t.burstChars = 0;
      t.lastBurstAt += 1000;
    }
  }

  function typeChar(t, ch, now) {
    if (!ch || t.finishedAt) return t;
    now = now || Date.now();
    startIfNeeded(t, now);
    if (isFinished(t, now)) return finish(t, now);
    var word = currentWord(t);
    var cur = t.typed[t.wordIndex] || '';
    if (ch === ' ') {
      if (!cur.length) return t;
      if (t.wordIndex >= t.words.length - 1) {
        t.typed[t.wordIndex] = cur;
        t.wordIndex += 1;
        t.keys += 1;
        noteBurst(t, now, 1);
        return finish(t, now);
      }
      t.typed[t.wordIndex] = cur;
      t.wordIndex += 1;
      t.keys += 1;
      noteBurst(t, now, 1);
      return t;
    }
    if (ch.length !== 1) return t;
    if (cur.length >= word.length + 20) return t;
    t.typed[t.wordIndex] = cur + ch;
    t.keys += 1;
    noteBurst(t, now, 1);
    if (t.mode !== 'time' && t.wordIndex === t.words.length - 1 &&
        t.typed[t.wordIndex] === word) {
      t.wordIndex += 1;
      return finish(t, now);
    }
    return t;
  }

  function backspace(t, now) {
    if (t.finishedAt) return t;
    now = now || Date.now();
    var cur = t.typed[t.wordIndex] || '';
    if (cur.length) {
      t.typed[t.wordIndex] = cur.slice(0, -1);
      return t;
    }
    if (t.wordIndex <= 0) return t;
    var prev = t.words[t.wordIndex - 1];
    var prevTyped = t.typed[t.wordIndex - 1] || '';
    if (prevTyped === prev) return t;
    t.wordIndex -= 1;
    return t;
  }

  function wordChars(target, typed) {
    var correct = 0, incorrect = 0, extra = 0, missed = 0;
    var n = Math.min(target.length, typed.length);
    var i;
    for (i = 0; i < n; i++) {
      if (typed.charAt(i) === target.charAt(i)) correct++;
      else incorrect++;
    }
    if (typed.length > target.length) extra += typed.length - target.length;
    if (typed.length < target.length) missed += target.length - typed.length;
    return { correct: correct, incorrect: incorrect, extra: extra, missed: missed };
  }

  function charStats(t) {
    var c = { correct: 0, incorrect: 0, extra: 0, missed: 0 };
    var i, last, w, typed, st, submitted;
    last = Math.min(t.wordIndex, t.words.length);
    for (i = 0; i < t.words.length; i++) {
      w = t.words[i];
      typed = t.typed[i] || '';
      submitted = i < t.wordIndex;
      if (!submitted && i !== t.wordIndex) break;
      if (!typed.length && !submitted) continue;
      st = wordChars(w, typed);
      c.correct += st.correct;
      c.incorrect += st.incorrect;
      c.extra += st.extra;
      if (submitted) {
        c.missed += st.missed;
        c.correct += 1;
      } else {
        c.missed += 0;
      }
    }
    return c;
  }

  function elapsedMs(t, now) {
    if (!t.startedAt) return 0;
    var end = t.finishedAt || now || Date.now();
    if (t.mode === 'time') {
      var cap = (t.mode2 | 0) * 1000;
      var dt = end - t.startedAt;
      if (dt > cap) dt = cap;
      return dt;
    }
    return end - t.startedAt;
  }

  function remainingMs(t, now) {
    if (t.mode !== 'time') return 0;
    var cap = (t.mode2 | 0) * 1000;
    if (!t.startedAt) return cap;
    return Math.max(0, cap - ((t.finishedAt || now || Date.now()) - t.startedAt));
  }

  function wpmFrom(chars, ms) {
    if (!ms || ms < 1) return 0;
    return (chars / 5) * (60000 / ms);
  }

  function mean(arr) {
    if (!arr.length) return 0;
    var s = 0, i;
    for (i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function stdev(arr) {
    if (arr.length < 2) return 0;
    var m = mean(arr), s = 0, i;
    for (i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
    return Math.sqrt(s / (arr.length - 1));
  }

  function snapshot(t, now) {
    now = now || Date.now();
    if (t.mode === 'time' && t.startedAt && !t.finishedAt && isFinished(t, now)) {
      finish(t, now);
    }
    var chars = charStats(t);
    var ms = elapsedMs(t, now);
    var allTyped = chars.correct + chars.incorrect + chars.extra;
    var denom = chars.correct + chars.incorrect + chars.extra + chars.missed;
    var wpm = wpmFrom(chars.correct, ms);
    var raw = wpmFrom(allTyped, ms);
    var acc = denom ? (100 * chars.correct / denom) : 100;
    var burstWpm = [];
    var i;
    for (i = 0; i < t.bursts.length; i++) burstWpm.push(t.bursts[i] * 12);
    var m = mean(burstWpm);
    var cons = 100;
    if (burstWpm.length >= 2 && m > 0) {
      cons = Math.max(0, Math.min(100, 100 - (stdev(burstWpm) / m) * 100));
    }
    var totalWords = t.words.length;
    var progress;
    if (t.mode === 'time') {
      var cap = (t.mode2 | 0) * 1000;
      progress = t.startedAt ? Math.min(1, ms / cap) : 0;
    } else {
      progress = totalWords ? Math.min(1, t.wordIndex / totalWords) : 0;
    }
    return {
      wpm: wpm, raw: raw, acc: acc, consistency: cons,
      chars: chars, ms: ms, remaining: remainingMs(t, now),
      progress: progress, keys: t.keys,
      wordIndex: t.wordIndex, wordCount: totalWords,
      done: !!t.finishedAt,
      mode: t.mode, mode2: t.mode2, lang: t.lang,
      punct: t.punct, numbers: t.numbers, seed: t.seed,
      quote: t.quote
    };
  }

  function pbKey(mode, mode2, punct, numbers, lang) {
    return [mode, String(mode2), punct ? 'p' : '-', numbers ? 'n' : '-', lang || 'english'].join('|');
  }

  function modeLabel(mode, mode2, punct, numbers, lang) {
    var s = mode + ' ' + String(mode2);
    if (punct) s += ' punct';
    if (numbers) s += ' num';
    if (lang && lang !== 'english') s += ' 1k';
    return s;
  }

  function round1(n) { return Math.round(n * 10) / 10; }
  function round0(n) { return Math.round(n); }

  root.MonkeyEngine = {
    TIME_OPTS: TIME_OPTS,
    WORDS_OPTS: WORDS_OPTS,
    QUOTE_OPTS: QUOTE_OPTS,
    LANGS: LANGS,
    mulberry32: mulberry32,
    seedFrom: seedFrom,
    generateWords: generateWords,
    pickQuote: pickQuote,
    wordsFromQuote: wordsFromQuote,
    createTest: createTest,
    typeChar: typeChar,
    backspace: backspace,
    isFinished: isFinished,
    finish: finish,
    snapshot: snapshot,
    charStats: charStats,
    wordChars: wordChars,
    wpmFrom: wpmFrom,
    pbKey: pbKey,
    modeLabel: modeLabel,
    round1: round1,
    round0: round0,
    elapsedMs: elapsedMs,
    remainingMs: remainingMs
  };
})(this);
