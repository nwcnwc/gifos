// The editable word list. One text file (well: one gifos.db record) is the
// single source of truth for both the recording checklist and what appears on
// screen, so a word only ever has to be written down once.
// Port of sound-it-out gen/wordlists.py.
(function () {
  const SIO = (window.SIO = window.SIO || {});

  // "Chase  #4da6ff"  ->  { word: "Chase", color: "#4da6ff" }
  const LINE = /^([^#\[\]]+?)(?:\s+(#[0-9a-fA-F]{3,8}))?\s*$/;

  function parse(text) {
    const groups = [];
    let current = null;
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('[') && line.endsWith(']')) {
        current = { name: line.slice(1, -1).trim(), words: [] };
        groups.push(current);
        continue;
      }
      const m = LINE.exec(line);
      if (!m) continue;
      const word = m[1].trim();
      if (!word) continue;
      if (current === null) { // words before any [group] heading
        current = { name: 'Words', words: [] };
        groups.push(current);
      }
      current.words.push([word, m[2] || null]);
    }
    return groups.filter((g) => g.words.length);
  }

  function allWords(groups) {
    const seen = new Set(), out = [];
    for (const g of groups) for (const [w] of g.words) {
      const k = w.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(w); }
    }
    return out;
  }

  function colors(groups) {
    const out = {};
    for (const g of groups) for (const [w, c] of g.words) if (c) out[w] = c;
    return out;
  }

  // The example names the default [People] group ships with. While any are
  // still present the Words tab nags: real names matter more than any other
  // words in the app.
  const PLACEHOLDERS = new Set(['alex', 'mum', 'dad', 'nana', 'grandad']);

  function placeholders(groups) {
    return allWords(groups).filter((w) => PLACEHOLDERS.has(w.toLowerCase()));
  }

  // wordlists/sight-words.default.txt, verbatim.
  const DEFAULT_TEXT = `# Sight words for Sound It Out
# =============================
#
# THIS LIST IS YOURS TO EDIT. Add, remove or change anything.
#
# How it works:
#   - One word per line.
#   - Lines starting with # are notes. They're ignored.
#   - [Square brackets] start a new group.
#   - A colour after a word is optional - it's the colour that word appears in
#     on screen. Leave it off and the word uses the normal colour.
#
# This is the same list used for two things, so you only write it once:
#   1. Your recording checklist - the words you'll be asked to say.
#   2. What your child actually sees on the TV.
#
# So if you add "Bluey" here, you'll be asked to record "Bluey", and then
# "Bluey" starts appearing in their videos. Nothing else to do.
#
# Start small. Ten words they love beats fifty they don't.


[Paw Patrol]
# Level 1. Colours are each pup's kit, so the word looks like the character.
Chase        #4da6ff
Marshall     #ff5a4d
Skye         #ff8fc7
Rubble       #ffd23f
Rocky        #6fcf6f
Zuma         #ff9f45
Everest      #7fd4d4
Ryder        #e94f64
Tracker      #8fbf5f
Liberty      #c77fd4
pup
pups
truck
badge
rescue


[People]
# >>> REPLACE THESE WITH YOUR REAL NAMES. <<<
# This group matters more than any other. The research on reading and Down
# syndrome is specific about it: start with words that mean something to him
# personally. Their own name, the people they love, the pets. Those are the
# words they'll learn fastest, because they already care about them.
#
# Delete the ones that don't apply. Add as many as you like.
Alex
Mum
Dad
Nana
Grandad
# brother or sister names here
Sam

# pet names here
# anyone else they see often


[Home]
# Things he sees and uses every day. Change these to match your house.
home
bed
car
dog
cat
ball
book
cup
shoes
bath
teddy
park


[First words]
# Small, high-value words that unlock simple sentences.
I
me
my
you
go
stop
yes
no
more
look
like
love
big
little
up
down
in
on
hot
cold`;

  SIO.wordlist = { parse, allWords, colors, placeholders, DEFAULT_TEXT };
})();
