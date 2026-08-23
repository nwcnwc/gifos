// stroibot/Checkers AI — scripts/AI.js (MIT). Classic script; do not
// turn this into a module. Do not "improve" the search — the computer is
// the one that shipped with Checkers: a random legal move, kings preferred
// half the time, and a capture taken when the rules demand it.
(function (root) {
  'use strict';
  var CK = root.CK;
  if (!CK) throw new Error('board.js must load before vendor/ai.js');

  function aiMove(s) {
    var moves = CK.legalMoves(s);
    if (!moves.length) return null;
    var i, kings, pool, pick;
    if (moves[0].capture) {
      // AI.DoJump walks empty tiles then checkers and takes the first jump.
      return moves[0];
    }
    kings = [];
    for (i = 0; i < moves.length; i++) {
      if (CK.isKing(s.map[moves[i].fr][moves[i].fc])) kings.push(moves[i]);
    }
    // "If there's at least one king let AI prefer it with a 50% chance"
    pool = (kings.length && Math.random() >= 0.5) ? kings : moves;
    pick = pool[Math.floor(Math.random() * pool.length)];
    return pick || null;
  }

  CK.aiMove = aiMove;
})(typeof window !== 'undefined' ? window : this);
