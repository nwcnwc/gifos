/*
 * Kana tables from anzzstuff/kanaquiz (MIT).
 * Transcribed to a classic script — GifOS drops type=module.
 * Do not "improve" the mappings.
 */
(function (root) {
  'use strict';
var TABLES = {
  'hiragana': {
    'h_group1': { characters: { 'あ': ['a'], 'い': ['i'], 'う': ['u'], 'え': ['e'], 'お': ['o'] } },
    'h_group2': { characters: { 'か': ['ka'], 'き': ['ki'], 'く': ['ku'], 'け': ['ke'], 'こ': ['ko'] } },
    'h_group3': { characters: { 'さ': ['sa'], 'し': ['shi','si'], 'す': ['su'], 'せ': ['se'], 'そ': ['so'] } },
    'h_group4': { characters: { 'た': ['ta'], 'ち': ['chi','ti'], 'つ': ['tsu','tu'], 'て': ['te'], 'と': ['to'] } },
    'h_group5': { characters: { 'な': ['na'], 'に': ['ni'], 'ぬ': ['nu'], 'ね': ['ne'], 'の': ['no'] } },
    'h_group6': { characters: { 'は': ['ha'], 'ひ': ['hi'], 'ふ': ['fu','hu'], 'へ': ['he'], 'ほ': ['ho'] } },
    'h_group7': { characters: { 'ま': ['ma'], 'み': ['mi'], 'む': ['mu'], 'め': ['me'], 'も': ['mo'] } },
    'h_group8': { characters: { 'や': ['ya'], 'ゆ': ['yu'], 'よ': ['yo'] } },
    'h_group9': { characters: { 'ら': ['ra'], 'り': ['ri'], 'る': ['ru'], 'れ': ['re'], 'ろ': ['ro'] } },
    'h_group10': { characters: { 'わ': ['wa'], 'を': ['wo','o'], 'ん': ['n'] } },
    'h_group11_a': { characters: { 'が': ['ga'], 'ぎ': ['gi'], 'ぐ': ['gu'], 'げ': ['ge'], 'ご': ['go'] } },
    'h_group12_a': { characters: { 'ざ': ['za'], 'じ': ['ji','zi'], 'ず': ['zu','du'], 'ぜ': ['ze'], 'ぞ': ['zo'] } },
    'h_group13_a': { characters: { 'だ': ['da'], 'ぢ': ['ji','di','dzi'], 'づ': ['zu','dzu'], 'で': ['de'], 'ど': ['do'] } },
    'h_group14_a': { characters: { 'ば': ['ba'], 'び': ['bi'], 'ぶ': ['bu'], 'べ': ['be'], 'ぼ': ['bo'] } },
    'h_group15_a': { characters: { 'ぱ': ['pa'], 'ぴ': ['pi'], 'ぷ': ['pu'], 'ぺ': ['pe'], 'ぽ': ['po'] } },
    'h_group16_a': { characters: { 'きゃ': ['kya'], 'きゅ': ['kyu'], 'きょ': ['kyo'] } },
    'h_group17_a': { characters: { 'しゃ': ['sha','sya'], 'しゅ': ['shu','syu'], 'しょ': ['sho','syo'] } },
    'h_group18_a': { characters: { 'ちゃ': ['cha','cya','tya'], 'ちゅ': ['chu','cyu'], 'ちょ': ['cho','cyo'] } },
    'h_group19_a': { characters: { 'にゃ': ['nya'], 'にゅ': ['nyu'], 'にょ': ['nyo'] } },
    'h_group20_a': { characters: { 'ひゃ': ['hya'], 'ひゅ': ['hyu'], 'ひょ': ['hyo'] } },
    'h_group21_a': { characters: { 'みゃ': ['mya'], 'みゅ': ['myu'], 'みょ': ['myo'] } },
    'h_group22_a': { characters: { 'りゃ': ['rya'], 'りゅ': ['ryu'], 'りょ': ['ryo'] } },
    'h_group23_a': { characters: { 'ぎゃ': ['gya'], 'ぎゅ': ['gyu'], 'ぎょ': ['gyo'] } },
    'h_group24_a': { characters: { 'じゃ': ['ja','jya'], 'じゅ': ['ju','jyu'], 'じょ': ['jo','jyo'] } },
    'h_group25_a': { characters: { 'びゃ': ['bya'], 'びゅ': ['byu'], 'びょ': ['byo'] } },
    'h_group26_a': { characters: { 'ぴゃ': ['pya'], 'ぴゅ': ['pyu'], 'ぴょ': ['pyo'] } }
  },
  'katakana': {
    'k_group1': { characters: { 'ア': ['a'], 'イ': ['i'], 'ウ': ['u'], 'エ': ['e'], 'オ': ['o'] } },
    'k_group2': { characters: { 'カ': ['ka'], 'キ': ['ki'], 'ク': ['ku'], 'ケ': ['ke'], 'コ': ['ko'] } },
    'k_group3': { characters: { 'サ': ['sa'], 'シ': ['shi','si'], 'ス': ['su'], 'セ': ['se'], 'ソ': ['so'] } },
    'k_group4': { characters: { 'タ': ['ta'], 'チ': ['chi','ti'], 'ツ': ['tsu','tu'], 'テ': ['te'], 'ト': ['to'] } },
    'k_group5': { characters: { 'ナ': ['na'], 'ニ': ['ni'], 'ヌ': ['nu'], 'ネ': ['ne'], 'ノ': ['no'] } },
    'k_group6': { characters: { 'ハ': ['ha'], 'ヒ': ['hi'], 'フ': ['fu','hu'], 'ヘ': ['he'], 'ホ': ['ho'] } },
    'k_group7': { characters: { 'マ': ['ma'], 'ミ': ['mi'], 'ム': ['mu'], 'メ': ['me'], 'モ': ['mo'] } },
    'k_group8': { characters: { 'ヤ': ['ya'], 'ユ': ['yu'], 'ヨ': ['yo'] } },
    'k_group9': { characters: { 'ラ': ['ra'], 'リ': ['ri'], 'ル': ['ru'], 'レ': ['re'], 'ロ': ['ro'] } },
    'k_group10': { characters: { 'ワ': ['wa'], 'ヲ': ['wo','o'], 'ン': ['n'] } },
    'k_group11_s': { characters: { 'シ': ['shi','si'], 'ツ': ['tsu','tu'], 'ソ': ['so'], 'ン': ['n'], 'ノ': ['no'] } },
    'k_group12_s': { characters: { 'ウ': ['u'], 'フ': ['fu','hu'], 'ワ': ['wa'], 'ラ': ['ra'], 'ス': ['su'], 'ヌ': ['nu'], 'ヲ': ['wo','o'] } },
    'k_group13_a': { characters: { 'ガ': ['ga'], 'ギ': ['gi'], 'グ': ['gu'], 'ゲ': ['ge'], 'ゴ': ['go'] } },
    'k_group14_a': { characters: { 'ザ': ['za'], 'ジ': ['ji','zi'], 'ズ': ['zu','du'], 'ゼ': ['ze'], 'ゾ': ['zo'] } },
    'k_group15_a': { characters: { 'ダ': ['da'], 'ヂ': ['ji','di','dzi'], 'ヅ': ['zu','dzu'], 'デ': ['de'], 'ド': ['do'] } },
    'k_group16_a': { characters: { 'バ': ['ba'], 'ビ': ['bi'], 'ブ': ['bu'], 'ベ': ['be'], 'ボ': ['bo'] } },
    'k_group17_a': { characters: { 'パ': ['pa'], 'ピ': ['pi'], 'プ': ['pu'], 'ペ': ['pe'], 'ポ': ['po'] } },
    'k_group18_a': { characters: { 'キャ': ['kya'], 'キュ': ['kyu'], 'キョ': ['kyo'] } },
    'k_group19_a': { characters: { 'シャ': ['sha','sya'], 'シュ': ['shu','syu'], 'ショ': ['sho','syo'] } },
    'k_group20_a': { characters: { 'チャ': ['cha','cya','tya'], 'チュ': ['chu','cyu'], 'チョ': ['cho','cyo'] } },
    'k_group21_a': { characters: { 'ニャ': ['nya'], 'ニュ': ['nyu'], 'ニョ': ['nyo'] } },
    'k_group22_a': { characters: { 'ヒャ': ['hya'], 'ヒュ': ['hyu'], 'ヒョ': ['hyo'] } },
    'k_group23_a': { characters: { 'ミャ': ['mya'], 'ミュ': ['myu'], 'ミョ': ['myo'] } },
    'k_group24_a': { characters: { 'リャ': ['rya'], 'リュ': ['ryu'], 'リョ': ['ryo'] } },
    'k_group25_a': { characters: { 'ギャ': ['gya'], 'ギュ': ['gyu'], 'ギョ': ['gyo'] } },
    'k_group26_a': { characters: { 'ジャ': ['ja','jya'], 'ジュ': ['ju','jyu'], 'ジョ': ['jo','jyo'] } },
    'k_group27_a': { characters: { 'ビャ': ['bya'], 'ビュ': ['byu'], 'ビョ': ['byo'] } },
    'k_group28_a': { characters: { 'ピャ': ['pya'], 'ピュ': ['pyu'], 'ピョ': ['pyo'] } },
    'k_group29_a': { characters: { 'ファ': ['fa'], 'フィ': ['fi'], 'フェ': ['fe'], 'フォ': ['fo'], 'フュ': ['fyu'] } },
    'k_group30_a': { characters: { 'ウィ': ['wi'], 'ウェ': ['we'], 'ウォ': ['wo'], 'ヴァ': ['va'], 'ヴィ': ['vi'], 'ヴェ': ['ve'], 'ヴォ': ['vo'] } },
    'k_group31_a': { characters: { 'ツァ': ['tsa'], 'ツィ': ['tsi'], 'ツェ': ['tse'], 'ツォ': ['tso'] } },
    'k_group32_a': { characters: { 'チェ': ['che'], 'シェ': ['she'], 'ジェ': ['je'] } },
    'k_group33_a': { characters: { 'ティ': ['ti'], 'ディ': ['di'], 'デュ': ['du'], 'トゥ': ['tu'] } }
  }
};

  var LABELS = {"h_group1": "あ-row", "h_group2": "か-row", "h_group3": "さ-row", "h_group4": "た-row", "h_group5": "な-row", "h_group6": "は-row", "h_group7": "ま-row", "h_group8": "や-row", "h_group9": "ら-row", "h_group10": "わ-row", "h_group11_a": "が dakuten", "h_group12_a": "ざ dakuten", "h_group13_a": "だ dakuten", "h_group14_a": "ば dakuten", "h_group15_a": "ぱ handakuten", "h_group16_a": "きゃ yōon", "h_group17_a": "しゃ yōon", "h_group18_a": "ちゃ yōon", "h_group19_a": "にゃ yōon", "h_group20_a": "ひゃ yōon", "h_group21_a": "みゃ yōon", "h_group22_a": "りゃ yōon", "h_group23_a": "ぎゃ yōon", "h_group24_a": "じゃ yōon", "h_group25_a": "びゃ yōon", "h_group26_a": "ぴゃ yōon", "k_group1": "ア-row", "k_group2": "カ-row", "k_group3": "サ-row", "k_group4": "タ-row", "k_group5": "ナ-row", "k_group6": "ハ-row", "k_group7": "マ-row", "k_group8": "ヤ-row", "k_group9": "ラ-row", "k_group10": "ワ-row", "k_group11_s": "シ ツ look-alikes", "k_group12_s": "ウ フ look-alikes", "k_group13_a": "ガ dakuten", "k_group14_a": "ザ dakuten", "k_group15_a": "ダ dakuten", "k_group16_a": "バ dakuten", "k_group17_a": "パ handakuten", "k_group18_a": "キャ yōon", "k_group19_a": "シャ yōon", "k_group20_a": "チャ yōon", "k_group21_a": "ニャ yōon", "k_group22_a": "ヒャ yōon", "k_group23_a": "ミャ yōon", "k_group24_a": "リャ yōon", "k_group25_a": "ギャ yōon", "k_group26_a": "ジャ yōon", "k_group27_a": "ビャ yōon", "k_group28_a": "ピャ yōon", "k_group29_a": "ファ extra", "k_group30_a": "ウィ extra", "k_group31_a": "ツァ extra", "k_group32_a": "チェ extra", "k_group33_a": "ティ extra"};
  var KINDS = {"h_group1": "basic", "h_group2": "basic", "h_group3": "basic", "h_group4": "basic", "h_group5": "basic", "h_group6": "basic", "h_group7": "basic", "h_group8": "basic", "h_group9": "basic", "h_group10": "basic", "h_group11_a": "dakuten", "h_group12_a": "dakuten", "h_group13_a": "dakuten", "h_group14_a": "dakuten", "h_group15_a": "dakuten", "h_group16_a": "yoon", "h_group17_a": "yoon", "h_group18_a": "yoon", "h_group19_a": "yoon", "h_group20_a": "yoon", "h_group21_a": "yoon", "h_group22_a": "yoon", "h_group23_a": "yoon", "h_group24_a": "yoon", "h_group25_a": "yoon", "h_group26_a": "yoon", "k_group1": "basic", "k_group2": "basic", "k_group3": "basic", "k_group4": "basic", "k_group5": "basic", "k_group6": "basic", "k_group7": "basic", "k_group8": "basic", "k_group9": "basic", "k_group10": "basic", "k_group11_s": "alike", "k_group12_s": "alike", "k_group13_a": "dakuten", "k_group14_a": "dakuten", "k_group15_a": "dakuten", "k_group16_a": "dakuten", "k_group17_a": "dakuten", "k_group18_a": "yoon", "k_group19_a": "yoon", "k_group20_a": "yoon", "k_group21_a": "yoon", "k_group22_a": "yoon", "k_group23_a": "yoon", "k_group24_a": "yoon", "k_group25_a": "yoon", "k_group26_a": "yoon", "k_group27_a": "yoon", "k_group28_a": "yoon", "k_group29_a": "extra", "k_group30_a": "extra", "k_group31_a": "extra", "k_group32_a": "extra", "k_group33_a": "extra"};

  function buildGroups() {
    var list = [], script, id, chars, first;
    for (script in TABLES) {
      if (!Object.prototype.hasOwnProperty.call(TABLES, script)) continue;
      for (id in TABLES[script]) {
        if (!Object.prototype.hasOwnProperty.call(TABLES[script], id)) continue;
        chars = Object.keys(TABLES[script][id].characters);
        first = chars[0] || '';
        list.push({
          id: id,
          script: script,
          kind: KINDS[id] || 'basic',
          label: LABELS[id] || (first + '-row'),
          keys: chars
        });
      }
    }
    return list;
  }

  root.KANA = {
    tables: TABLES,
    groups: buildGroups(),
    labels: LABELS,
    kinds: KINDS
  };
})(this);
