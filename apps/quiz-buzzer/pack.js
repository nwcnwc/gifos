// Quiz Buzzer — original pack + host-authority scoring.
// Nothing is fetched. The pack is the file.
(function (root) {
  'use strict';

  var PACK = [
    { id: 's1', cat: 'science', q: 'Which planet has the Great Red Spot?',
      choices: ['Jupiter', 'Saturn', 'Mars', 'Neptune'], answer: 0 },
    { id: 's2', cat: 'science', q: 'Which particle has a negative electric charge?',
      choices: ['Proton', 'Electron', 'Neutron', 'Nucleus'], answer: 1 },
    { id: 's3', cat: 'science', q: 'At sea level, water boils at about…',
      choices: ['90 °C', '80 °C', '100 °C', '120 °C'], answer: 2 },
    { id: 's4', cat: 'science', q: 'Which of these mammals lays eggs?',
      choices: ['Dolphin', 'Bat', 'Whale', 'Platypus'], answer: 3 },
    { id: 's5', cat: 'science', q: 'The chemical symbol for iron is…',
      choices: ['Fe', 'Ir', 'In', 'I'], answer: 0 },
    { id: 's6', cat: 'science', q: 'How many chambers does a human heart have?',
      choices: ['2', '4', '3', '6'], answer: 1 },
    { id: 's7', cat: 'science', q: 'Sound cannot travel through…',
      choices: ['Water', 'Steel', 'A vacuum', 'Air'], answer: 2 },
    { id: 's8', cat: 'science', q: 'Ozone in the upper air is a form of…',
      choices: ['Nitrogen', 'Carbon', 'Helium', 'Oxygen'], answer: 3 },
    { id: 's9', cat: 'science', q: 'An adult human skeleton has about how many bones?',
      choices: ['186', '206', '256', '306'], answer: 1 },
    { id: 's10', cat: 'science', q: 'Photosynthesis in a green plant happens mainly in the…',
      choices: ['Roots', 'Flowers', 'Leaves', 'Seeds'], answer: 2 },

    { id: 'g1', cat: 'geography', q: 'Which ocean is the largest?',
      choices: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answer: 3 },
    { id: 'g2', cat: 'geography', q: 'What is the capital of Japan?',
      choices: ['Kyoto', 'Osaka', 'Tokyo', 'Nagoya'], answer: 2 },
    { id: 'g3', cat: 'geography', q: 'Which river flows through London?',
      choices: ['Seine', 'Thames', 'Rhine', 'Danube'], answer: 1 },
    { id: 'g4', cat: 'geography', q: 'Egypt is on which continent?',
      choices: ['Asia', 'Africa', 'Europe', 'Australia'], answer: 1 },
    { id: 'g5', cat: 'geography', q: 'Mount Everest stands in which range?',
      choices: ['Andes', 'Alps', 'Rockies', 'Himalayas'], answer: 3 },
    { id: 'g6', cat: 'geography', q: 'The smallest country by area is…',
      choices: ['Monaco', 'Vatican City', 'San Marino', 'Liechtenstein'], answer: 1 },
    { id: 'g7', cat: 'geography', q: 'Which country has the most people?',
      choices: ['India', 'China', 'United States', 'Indonesia'], answer: 0 },
    { id: 'g8', cat: 'geography', q: 'The Sahara is mainly in…',
      choices: ['South America', 'Africa', 'Australia', 'Asia'], answer: 1 },
    { id: 'g9', cat: 'geography', q: 'What is the capital of Australia?',
      choices: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], answer: 2 },
    { id: 'g10', cat: 'geography', q: 'Which of these is landlocked?',
      choices: ['Chile', 'Peru', 'Bolivia', 'Ecuador'], answer: 2 },

    { id: 'w1', cat: 'words', q: 'A synonym of “happy” is…',
      choices: ['Weary', 'Glad', 'Stern', 'Grim'], answer: 1 },
    { id: 'w2', cat: 'words', q: 'The opposite of “ancient” is…',
      choices: ['Historic', 'Antique', 'Modern', 'Aged'], answer: 2 },
    { id: 'w3', cat: 'words', q: 'How many letters are in the English alphabet?',
      choices: ['24', '25', '26', '27'], answer: 2 },
    { id: 'w4', cat: 'words', q: 'A group of wolves is a…',
      choices: ['Flock', 'Herd', 'Pack', 'School'], answer: 2 },
    { id: 'w5', cat: 'words', q: '“Colour” is the British spelling of…',
      choices: ['Color', 'Collar', 'Cooler', 'Caller'], answer: 0 },
    { id: 'w6', cat: 'words', q: 'Which word is a palindrome?',
      choices: ['Apple', 'Level', 'House', 'Table'], answer: 1 },
    { id: 'w7', cat: 'words', q: 'The prefix “un-” most often means…',
      choices: ['Again', 'Not', 'Before', 'Over'], answer: 1 },
    { id: 'w8', cat: 'words', q: 'A haiku is typically how many lines?',
      choices: ['2', '3', '4', '5'], answer: 1 },
    { id: 'w9', cat: 'words', q: 'In “their hats”, the word “their” is a…',
      choices: ['Verb', 'Noun', 'Pronoun', 'Adverb'], answer: 2 },
    { id: 'w10', cat: 'words', q: 'Which word is an anagram of “listen”?',
      choices: ['Silent', 'Listed', 'Stone', 'Inlet'], answer: 0 },

    { id: 'n1', cat: 'numbers', q: 'What is 7 × 8?',
      choices: ['54', '56', '58', '64'], answer: 1 },
    { id: 'n2', cat: 'numbers', q: 'The square root of 81 is…',
      choices: ['7', '8', '9', '10'], answer: 2 },
    { id: 'n3', cat: 'numbers', q: 'How many sides does a hexagon have?',
      choices: ['5', '6', '7', '8'], answer: 1 },
    { id: 'n4', cat: 'numbers', q: 'What is 15% of 200?',
      choices: ['20', '25', '30', '35'], answer: 2 },
    { id: 'n5', cat: 'numbers', q: 'Which of these is a prime number?',
      choices: ['9', '15', '21', '23'], answer: 3 },
    { id: 'n6', cat: 'numbers', q: 'What is 2 to the power of 5?',
      choices: ['16', '24', '32', '64'], answer: 2 },
    { id: 'n7', cat: 'numbers', q: 'The Roman numeral XL is…',
      choices: ['30', '40', '50', '60'], answer: 1 },
    { id: 'n8', cat: 'numbers', q: 'How many degrees in a right angle?',
      choices: ['45', '60', '90', '180'], answer: 2 },
    { id: 'n9', cat: 'numbers', q: 'Pi is approximately…',
      choices: ['2.14', '3.14', '4.14', '3.41'], answer: 1 },
    { id: 'n10', cat: 'numbers', q: '1 000 metres is one…',
      choices: ['Centimetre', 'Kilometre', 'Millimetre', 'Mile'], answer: 1 }
  ];

  var COLORS = [
    { bg: '#e23d3d', fg: '#ffffff' },
    { bg: '#2f7fe0', fg: '#ffffff' },
    { bg: '#e6c01e', fg: '#1a1408' },
    { bg: '#2bb673', fg: '#ffffff' }
  ];
  var SHAPES = ['▲', '◆', '●', '■'];
  var LETTERS = ['A', 'B', 'C', 'D'];
  var CAT_LABEL = {
    science: 'Science',
    geography: 'Geography',
    words: 'Words',
    numbers: 'Numbers',
    custom: 'This round'
  };

  function byId(id) {
    var i;
    for (i = 0; i < PACK.length; i++) if (PACK[i].id === id) return PACK[i];
    return null;
  }

  function shuffledOrder(n, seed) {
    var a = [], i, j, t, s = (seed >>> 0) || 1;
    function rnd() {
      s = (s + 0x6D2B79F5) >>> 0;
      var x = Math.imul(s ^ (s >>> 15), 1 | s);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    }
    for (i = 0; i < n; i++) a.push(i);
    for (i = n - 1; i > 0; i--) {
      j = (rnd() * (i + 1)) | 0;
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function isLegalBuzz(q, buzz) {
    if (!q || !buzz) return false;
    if (typeof buzz.choice !== 'number' || buzz.choice < 0 || buzz.choice > 3) return false;
    if (typeof buzz.at !== 'number') return false;
    if (buzz.at < q.startedAt) return false;
    if (q.deadline && buzz.at > q.deadline) return false;
    if (q.revealedAt && buzz.at > q.revealedAt) return false;
    return true;
  }

  // Host authority: first legal buzz that matches the right index scores.
  // Late / early / wrong are recorded and do not score.
  function scoreQuestion(q, buzzes) {
    var results = [];
    var i, b, legal, late, early, correct;
    var list = (buzzes || []).slice();
    for (i = 0; i < list.length; i++) {
      b = list[i] || {};
      early = typeof b.at === 'number' && b.at < q.startedAt;
      late = typeof b.at === 'number' && ((q.deadline && b.at > q.deadline) ||
        (q.revealedAt && b.at > q.revealedAt));
      legal = isLegalBuzz(q, b);
      correct = legal && b.choice === q.answer;
      results.push({
        id: b.id,
        name: b.name || 'Player',
        choice: typeof b.choice === 'number' ? b.choice : null,
        at: b.at || 0,
        legal: legal,
        correct: !!correct,
        late: !!late,
        early: !!early,
        score: 0
      });
    }
    var winners = results.filter(function (r) { return r.correct; });
    winners.sort(function (a, b) {
      if (a.at !== b.at) return a.at - b.at;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    var winner = winners.length ? winners[0] : null;
    if (winner) {
      for (i = 0; i < results.length; i++) {
        if (results[i].id === winner.id) results[i].score = 1;
      }
    }
    return {
      winner: winner ? { id: winner.id, name: winner.name, at: winner.at, choice: winner.choice } : null,
      results: results
    };
  }

  root.QuizBuzzer = {
    PACK: PACK,
    COLORS: COLORS,
    SHAPES: SHAPES,
    LETTERS: LETTERS,
    CAT_LABEL: CAT_LABEL,
    byId: byId,
    shuffledOrder: shuffledOrder,
    isLegalBuzz: isLegalBuzz,
    scoreQuestion: scoreQuestion
  };
})(typeof self !== 'undefined' ? self : this);
