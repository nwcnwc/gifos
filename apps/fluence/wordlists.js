// Word lists for deterministic feature extraction. Ported verbatim from the
// fluence project (pipeline/wordlists.js), rewired from ES-module exports to a
// shared window.FL namespace because the GifOS runtime inlines <script src> as
// classic scripts. No external dependency; kept small and self-contained.
window.FL = window.FL || {};

// Common discourse-marker fillers. "like"/"so"/"well" are noisy (legit uses),
// but counting them gives a useful upper bound and the coach LLM can
// disambiguate from the transcript.
FL.FILLERS = new Set([
  'um', 'uh', 'er', 'erm', 'ah', 'hm', 'hmm', 'mhm', 'huh',
  'uhm', 'umm', 'uhh',
  'like', 'so', 'well', 'right', 'okay', 'ok',
  'basically', 'actually', 'literally',
]);

// Multi-word fillers / hedges (matched on lowercased transcript, word-bounded).
FL.PHRASE_FILLERS = [
  'you know', 'i mean', 'sort of', 'kind of', 'i guess', 'i think',
  'or something', 'or whatever',
];

// Hedges proper — softeners that reduce perceived confidence.
FL.HEDGES = new Set([
  'maybe', 'perhaps', 'possibly', 'probably', 'somewhat', 'somehow',
  'just', 'really', 'pretty', 'fairly', 'rather',
]);

FL.PHRASE_HEDGES = [
  'i think', 'i guess', 'i feel like', 'in my opinion',
  'sort of', 'kind of', 'a little bit', 'a bit',
];

// Top ~250 most common English words. Anything NOT here is treated as "content
// reach" — a rough proxy for vocabulary breadth (a heuristic; a real Zipf table
// could replace it later).
FL.COMMON_WORDS = new Set([
  'the','of','and','a','to','in','is','you','that','it','he','was','for','on','are','as',
  'with','his','they','i','at','be','this','have','from','or','one','had','by','but','not',
  'what','all','were','we','when','your','can','said','there','use','an','each','which','she',
  'do','how','their','if','will','up','other','about','out','many','then','them','these','so',
  'some','her','would','make','like','him','into','time','has','look','two','more','go','see',
  'no','way','could','people','my','than','first','been','call','who','its','now','find','long',
  'down','day','did','get','come','made','may','part','over','new','take','only','little','work',
  'know','place','year','live','me','back','give','most','very','after','thing','our','just','name',
  'good','man','think','say','great','where','help','through','much','before','line','right','too',
  'mean','old','any','same','tell','boy','follow','came','want','show','also','around','form','three',
  'small','set','put','end','does','another','well','large','must','big','even','such','because','turn',
  'here','why','ask','went','men','read','need','land','different','home','us','move','try','kind',
  'hand','again','change','off','play','away','house','point','page','letter','mother','answer','found',
  'study','still','learn','should','world','high','every','near','add','food','between','own','below',
  'country','plant','last','school','father','keep','tree','never','start','city','earth','eye','light',
  'thought','head','under','story','saw','left','don','few','while','along','might','close','something',
  'seem','next','hard','open','example','begin','life','always','those','both','paper','together','got',
  'group','often','run','being','really','am','having','isn','wasn','aren','weren','doesn','didn','won',
  'wouldn','couldn','shouldn','i\'m','you\'re','he\'s','she\'s','we\'re','they\'re','it\'s','that\'s',
  'i\'ve','you\'ve','we\'ve','they\'ve','i\'ll','you\'ll','he\'ll','she\'ll','we\'ll','they\'ll',
  'don\'t','doesn\'t','didn\'t','won\'t','wouldn\'t','couldn\'t','shouldn\'t','can\'t','isn\'t','aren\'t',
  'lot','lots','really','kinda','sorta','gonna','wanna','gotta','yeah','yep','yes','no','nope',
]);

FL.SENTENCE_ENDS = /[.!?]+/;
