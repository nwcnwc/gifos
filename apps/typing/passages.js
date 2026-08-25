// Lessons and passages. The random-charset drill is climech's original
// (letters / digits / punctuation). English and code passages are extra.
(function (root) {
  'use strict';
  var T = root.Typing || {};

  var LETTERS_LOWER = 'abcdefghijklmnopqrstuvwxyz';
  var LETTERS_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var DIGITS = '0123456789';
  var PUNCTUATION = '`~!@#$%^&*()_+-=[]\\{}|;\':",./<>?';

  T.ENGLISH = [
    'The home row is where your fingers rest. asdf jkl; eight keys, every time. Speed comes later; first the hands learn where each letter lives.',
    'A good typist looks at the screen, not the keyboard. Trust the hands. They know more than the eyes give them credit for.',
    'Close the app and come back whenever you like; the last runs are still here.',
    'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.',
    'Rain tapped the window while the kettle clicked off. She typed one more sentence, then another, until the page felt finished.',
    'Count the errors, then forget them. The next line is a clean start. Accuracy first; speed is what accuracy turns into.',
    'Space bar with the thumb. Enter with the right little finger. Backspace is a gift; use it, then keep going.',
    'When two friends type the same passage, finish well. Fast and sloppy is still sloppy. The clock will wait for a clean line.',
    'Sphinx of black quartz, judge my vow. The five boxing wizards jump quickly. Jackdaws love my big sphinx of quartz.',
    'Fingers curved, wrists level, shoulders quiet. The keyboard is a small instrument. Play it the same way every day.',
    'A short sentence is a good sentence. Cut the extra words. Then type what is left until it sits in the hands.',
    'Monday morning, coffee cooling, inbox growing. Type the reply you mean. Then type the next one. The day is a stack of small passages.',
    'She sold seashells by the seashore, then sat and sorted the shining ones. Tongue twisters are just passages with a sense of humor.',
    'Your history lives in this file, on this device, for you. Share the file and the runs go with it. Nobody else keeps a copy.',
    'Keep the eyes up. The letters will wait. A glance at the keys is a habit; breaking it is the whole point of practice.',
    'Now is the time for all good men to come to the aid of the party. A stitch in time saves nine. Look before you leap.',
    'The old typewriter in the corner still works. Ribbon dry, keys stiff, but every letter lands with a sound you can feel.',
    'Write the thing you came to write. Then write it again, shorter. The hands remember the second version better than the first.'
  ];

  T.CODE = [
    'function add(a, b) { return a + b; }',
    'const n = items.filter(function (x) { return x.active; }).length;',
    'for (var i = 0; i < arr.length; i++) sum += arr[i];',
    'if (user && user.id) return fetch("/api/" + user.id);',
    'try { JSON.parse(text); } catch (e) { return null; }',
    'var map = {}; for (var k in obj) if (obj.hasOwnProperty(k)) map[k] = obj[k];',
    'el.addEventListener("click", function (e) { e.preventDefault(); save(); });',
    'while (q.length) { var n = q.shift(); if (n.left) q.push(n.left); }',
    'function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }',
    'const [head, ...rest] = list; return { head: head, rest: rest };',
    'if (!db) return; db.put({ id: "run", wpm: wpm, at: Date.now() });',
    'SELECT id, name FROM users WHERE active = 1 ORDER BY name;',
    'def greet(name): return "hello, " + name',
    'git commit -m "fix: keep the caret on the current letter"',
    'im.save("icon.gif", save_all=True, append_images=frames[1:], loop=0)',
    'let total = 0; for (const n of nums) total += n; return total / nums.length;',
    'if (err != nil) { return err }; defer f.Close(); return json.NewEncoder(w).Encode(v)',
    'css.setProperty("--caret", focused ? "#ffc14a" : "transparent");'
  ];

  T.LESSONS = [
    {
      id: 'home-left',
      name: 'Home row, left',
      hint: 'Index on F. a s d f',
      row: 'asdf',
      keys: 'asdf',
      words: ['as', 'ad', 'fa', 'da', 'sad', 'fad', 'add', 'dad', 'fads', 'adds', 'sass', 'asdf', 'faff', 'dads', 'sads', 'affa']
    },
    {
      id: 'home-right',
      name: 'Home row, right',
      hint: 'Index on J. j k l ;',
      row: 'jkl;',
      keys: 'jkl;',
      words: ['jk', 'kl', 'lj', 'jj', 'kk', 'll', 'jkl', 'lkj', 'kjk', 'l;', ';;', 'j;', 'k;', 'jll', 'kll', 'jjk']
    },
    {
      id: 'home',
      name: 'Home row',
      hint: 'Both hands. asdfghjkl;',
      row: 'asdfghjkl;',
      keys: 'asdfghjkl;',
      words: ['a', 'as', 'ad', 'all', 'ask', 'sad', 'lad', 'fall', 'hall', 'flag', 'glad', 'has', 'ash', 'lag', 'half', 'flask', 'dash', 'salad', 'flash', 'shall', 'glass', 'asks', 'lads', 'gash', 'had', 'jag', 'hags', 'flask', 'flags']
    },
    {
      id: 'top',
      name: 'Top row',
      hint: 'q w e r t y u i o p',
      row: 'qwertyuiop',
      keys: 'qwertyuiopasdfghjkl;',
      words: ['we', 'or', 'to', 'it', 'you', 'quit', 'type', 'wet', 'write', 'quite', 'power', 'yet', 'query', 'tower', 'rope', 'trip', 'witty', 'pretty', 'quiet', 'pour', 'your', 'our', 'two', 'pie', 'wire', 'the', 'was', 'are', 'this', 'that', 'with', 'they', 'word', 'just', 'from', 'have', 'were', 'what', 'when', 'there', 'would', 'about', 'which', 'other', 'after', 'first']
    },
    {
      id: 'bottom',
      name: 'Bottom row',
      hint: 'z x c v b n m',
      row: 'zxcvbnm',
      keys: 'zxcvbnmasdfghjkl;',
      words: ['cab', 'van', 'ban', 'man', 'can', 'back', 'hack', 'lamb', 'jazz', 'calm', 'bam', 'nab', 'max', 'mix', 'zinc', 'cave', 'band', 'hand', 'sand', 'land', 'and', 'scan', 'clan', 'bald', 'flan', 'exam', 'vans', 'cabs']
    },
    {
      id: 'punct',
      name: 'Punctuation',
      hint: 'commas, quotes, braces',
      row: '.,;:\'"!?-()[]{}',
      keys: 'abcdefghijklmnopqrstuvwxyz.,;:\'"!?-()[]{}',
      words: ["it's", "don't", "can't", 'hello,', 'well;', 'wait:', 'yes?', 'no!', '(yes)', '[ok]', '{a}', 'a-b', 'e.g.', '"hi"', "'a'", 'end.', 'what?', 'wow!', 'foo:', 'bar,', 'ok;']
    },
    {
      id: 'numbers',
      name: 'Numbers',
      hint: '1 2 3 4 5 6 7 8 9 0',
      row: '1234567890',
      keys: 'abcdefghijklmnopqrstuvwxyz0123456789',
      words: ['1', '2', '12', '10', '42', '100', '2026', 'a1', 'b2', '3d', 'x4', 'set2', 'run1', 'bit8', '64', '128', '256', '1024', '3.14', '0']
    },
    {
      id: 'mixed',
      name: 'Mixed',
      hint: 'letters, numbers, signs',
      keys: LETTERS_LOWER + LETTERS_UPPER + DIGITS + PUNCTUATION,
      words: ['var x = 1;', 'a[0]', 'foo()', 'n != 0', 'a += 2', 'x: 3,', '{a: 1}', 'C-c', 'Q&A', 'it\'s 4.', 'ok?', 'end.', 'f(x)', 'n < 10', 'a->b']
    },
    {
      id: 'random',
      name: 'Random keys',
      hint: 'The original drill — mixed letters, digits, signs',
      random: true
    }
  ];

  function pick(list, seed) {
    if (!list || !list.length) return '';
    var i = (seed >>> 0) % list.length;
    return list[i];
  }

  T.passage = function (kind, seed) {
    var list = kind === 'code' ? T.CODE : T.ENGLISH;
    var p = pick(list, seed);
    return p || '';
  };

  T.lessonById = function (id) {
    var i;
    for (i = 0; i < T.LESSONS.length; i++) if (T.LESSONS[i].id === id) return T.LESSONS[i];
    return T.LESSONS[0];
  };

  // climech's random-word generator: length 1..9, charset weighted equally.
  T.randomWord = function (rng, charset, maxLen) {
    var n = 1 + ((rng() * (maxLen || 9)) | 0);
    var out = '', i;
    if (!charset || !charset.length) charset = LETTERS_LOWER;
    for (i = 0; i < n; i++) out += charset.charAt((rng() * charset.length) | 0);
    return out;
  };

  T.charset = function () {
    return LETTERS_LOWER + LETTERS_UPPER + DIGITS + PUNCTUATION;
  };

  T.drill = function (lesson, seed) {
    var rng = T.mulberry32(seed >>> 0);
    var words = [], n = 0, w, target = 80;
    if (!lesson) lesson = T.LESSONS[0];
    if (lesson.random) {
      var set = T.charset();
      while (n < target) {
        w = T.randomWord(rng, set, 9);
        words.push(w);
        n += w.length + 1;
      }
      return words.join(' ');
    }
    var bank = lesson.words || [];
    if (!bank.length) {
      var keys = lesson.keys || LETTERS_LOWER;
      while (n < target) {
        w = T.randomWord(rng, keys, 5);
        words.push(w);
        n += w.length + 1;
      }
      return words.join(' ');
    }
    while (n < target) {
      w = bank[(rng() * bank.length) | 0];
      words.push(w);
      n += w.length + 1;
    }
    return words.join(' ');
  };

  T.pickRun = function (mode, kind, lessonId, seed) {
    seed = seed >>> 0;
    if (mode === 'lesson') return T.drill(T.lessonById(lessonId), seed);
    return T.passage(kind === 'code' ? 'code' : 'english', seed);
  };

  root.Typing = T;
})(typeof window !== 'undefined' ? window : this);
