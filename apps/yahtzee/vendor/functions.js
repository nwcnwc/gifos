const $counter = document.querySelector('.counter');
const $paquet = document.querySelector('.paquet');
const $results = document.querySelector('.results');

let hiddenScores = true;

function removeClass(divs, css) {
  const $divs = document.querySelectorAll(divs);
  $divs.forEach(($div) => {
    $div.classList.remove(css);
  });
}
function resultHide() {
  hiddenScores = true;
  $results.style.transform = '';
}
function resultShow() {
  hiddenScores = false;
  $results.style.transform = 'translateY(0)';
}
/**
 * fait disparaitre counter et bouge paquet
 */
function endturn() {
  $counter.style.opacity = 0;
  setTimeout(() => {
    $paquet.style.transform = 'translate(125%, 69%) rotate(-180deg)';
    resultShow();
  }, 1000);
}

function clickDices({ player, dices }) {
  return function clickDice(e) {
    if (player.counter === 0) return;
    // on prend le chiffre dans l'id (par ex. 4 dans #d4)
    const nb = Number(e.currentTarget.id[1]);
    if (e.currentTarget.classList.contains('selected')) {
      e.currentTarget.classList.remove('selected');
      dices.selected[nb] = !1;
    } else {
      e.currentTarget.classList.add('selected');
      dices.selected[nb] = !0;
    }
  };
}

// eslint-disable-next-line object-curly-newline
function clickResult({ dices, player, type, i }) {
  return function clicRes(e) {
    // on sort si tout est cliqué
    if ((player[type][i].isSaved === 0)
    || (player[type][i].isSaved) > 0) return;
    player[type][i].isSaved = player[type][i].scoreNow;
    e.currentTarget.classList.add('saved');
    const total = document.querySelectorAll('.result').length;
    const saved = document.querySelectorAll('.result.saved').length;
    // si tous les multis -> cacher le bonus
    if (type === 'multi') {
      const multis = document.querySelectorAll('.multi').length;
      const multiSaved = document.querySelectorAll('.multi.saved').length;
      if (multis === multiSaved) {
        document.querySelector('#sum').style = 'opacity: 0';
      }
    }

    if (saved === total) {
      // fin de partie
      endturn();
      player.endgame();
      // cache les 2 divs de results
      const $total = document.querySelector('#total');
      $total.classList.add('endgame');
      const $divs = document.querySelectorAll('.results>div');
      $divs[0].style = 'display: none';
      $divs[1].style = 'display: none';

      // player.writeResult();
      // dices.display(player.dices);
    } else {
      // nouveau tour
      player.counter = 3;
      $paquet.style.transform = '';
      player.dices = player.randomAll();
      resultHide();
      setTimeout(() => {
        dices.parkInAll();
        player.writeResult();
        dices.display(player.dices);
        $counter.style.opacity = 1;
      }, 600);
    }
    //
  };
}

function clickTurn({ player, dices }) {
  return () => {
    if (player.counter === 0 && player.gameover) {
      // nouvelle partie
      dices.parkInAll();
      // cache scores
      resultHide();
      // bouge paquet
      $paquet.style.transform = '';
      // retirer .selected et .saved
      removeClass('.dice', '.selected');
      removeClass('.multi', 'saved');
      removeClass('.yams', 'saved');
      // reset #sum
      document.querySelector('#sum').style = '';
      // affiche les 2 divs de results
      const $total = document.querySelector('#total');
      $total.classList.remove('endgame');
      const $divs = document.querySelectorAll('.results>div');
      $divs[0].style = '';
      $divs[1].style = '';
      // reset player
      player.reset();
      // display dices
      dices.display(player.dices);
      return;
    }
    // random les selectionnes
    const selectedDices = [];
    dices.selected.forEach((selected, i) => {
      if (selected) {
        selectedDices.push(i);
        player.random(i);
      }
    });
    dices.parkIn(selectedDices);
    resultHide();
    player.counter -= 1;
    player.writeResult();
    // Redistribution des cartes
    setTimeout(() => {
      dices.clearSelected();
      dices.display(player.dices);
    }, 400);
    if (player.counter === 0) {
      // paquet up : fin de tour
      endturn();
    }
  };
}

function resultToggle() {
  if (hiddenScores) {
    resultShow();
  } else {
    resultHide();
  }
}
