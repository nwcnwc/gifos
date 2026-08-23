function scoringDices() {
  if (!scoringDices._d) {
    scoringDices._d = Object.create(Dices.prototype);
    scoringDices._d.result = [0, 0, 0, 0, 0, 0];
    scoringDices._d.ordered = [];
  }
  return scoringDices._d;
}
var Player = class Player {
  constructor() {
    this.dices = [];
    this.multi = [];
    this.yams = [];
    this.reset();
  }

  get bonus() {
    return (this.sums.multi >= 63) ? 25 : 0;
  }

  get dicesSum() {
    const [...allDices] = this.dices;
    let sum = 0;
    allDices.forEach((dice) => {
      sum += dice.number;
    });
    return sum;
  }

  get sums() {
    const sums = {};
    ['multi', 'yams'].forEach((type) => {
      let sum = 0;
      this[type].forEach((result) => {
        sum += result.isSaved;
      });
      sums[type] = sum;
    });
    return sums;
  }

  get total() {
    return this.sums.multi + this.sums.yams + this.bonus;
  }

  displayScores() {
    // affichage compteur
    document.querySelector('.counter').style.backgroundPosition = `left -${27 * (this.counter - 1)}px top 0`;
    // efface tous les scores  !!!  dans PLAYER
    const names = ['multi', 'yams'];
    names.forEach((type) => {
      const $scores = document.querySelectorAll(`.result.${type}`);
      this[type].forEach((score, i) => {
        if ((score.isSaved === 0)
          || ((score.isSaved) > 0)) return;
        const $score = $scores[i];
        const $val = $score.querySelector('.score');
        if (!score.isSaved) {
          $val.textContent = score.scoreNow;
        } else {
          $val.textContent = '';
        }
      });
    });
    document.querySelector('#sum .score').textContent = this.bonus;
    document.querySelector('#total .score').textContent = this.total;
  }

  endgame() {
    this.counter = 0;
    this.gameover = true;
  }

  random(nb = -1) {
    const number = Math.floor((Math.random() * 6)) + 1;
    const color = Math.floor((Math.random() * 5));
    if (nb >= 0) this.dices[nb].number = number;
    // todo ajouter la vérif de carte en double
    // (option)
    if (nb >= 0) this.dices[nb].color = color;
    return { number, color };
  }

  randomAll() {
    return this.dices.map(() => this.random());
  }

  reset() {
    this.gameover = false;
    this.dices.length = 0;
    for (let i = 0; i < 5; i += 1) {
      const dice = {
        number: 0,
        color: 0,
      };
      this.dices.push(dice);
    }
    this.dices = this.randomAll();
    this.counter = 3;
    // initialisation des resultats
    this.yams.length = 0;
    this.yams = [{
      nom: 'Brelan',
      score: 10,
    },
    {
      nom: 'Carré',
      score: 75,
    },
    {
      nom: 'suite',
      score: 15,
    },
    {
      nom: 'Suite',
      score: 30,
    },
    {
      nom: 'Full',
      score: 50,
    },
    {
      nom: 'Bonus',
      score: 0,
    },
    {
      nom: 'YAHTZEE',
      score: 100,
    },
    ];
    this.multi.length = 0;
    for (let i = 0; i < 6; i += 1) {
      this.multi.push({ score: 0 });
    }
    const fill = (res) => {
      res.forEach((o) => {
        o.isSaved = null;
        o.isTrue = !1;
      });
    };
    fill(this.yams);
    fill(this.multi);
    // yams.bonus = true -- toujours--
    this.yams[5].isTrue = true;
  }

  scoreYams(i) {
    if (!this.yams[i].isTrue) return 0;
    let score = 0;
    const scoreBase = this.yams[i].score;
    score = scoreBase + this.dicesSum;
    return score;
  }

  scoreMulti(i) {
    const hand = this.multi[i];
    if (!hand.isTrue) return 0;
    let score = 0;
    const scoreBase = hand.isTrue;
    score = scoreBase * (i + 1);
    return score;
  }

  writeResult() {
    const yahtzee = scoringDices().yahtzee(this.dices);
    const multi = [];
    const yams = [];
    multi.length = 6;
    yams.length = 7;
    multi.fill(0);
    yams.fill(false);
    // calcul des yams
    if (yahtzee) {
      const { nb } = yahtzee;
      if (nb >= 3) {
        // 'Brelan';
        yams[0] = true;
      }
      if (nb > 3) {
        // 'Carré';
        yams[1] = true;
      }
      if (nb > 4) {
        // 'YAHTZEE !!!';
        yams[6] = true;
      }
    }
    if (scoringDices().isFull(this.dices)) {
      yams[4] = true;
    }
    const suite = scoringDices().isStraight(this.dices);
    if (suite) {
      yams[2] = true;
      yams[3] = (suite === 2);
    }
    // sauvegarde des yams
    this.yams.forEach((hand, i) => {
      // toujours true : bonus (this.yams[5])
      hand.isTrue = (i === 5) ? true : yams[i];
      hand.scoreNow = this.scoreYams(i);
    });
    // sauvegarde des multis
    const results = scoringDices().sameDice(this.dices);
    this.multi.forEach((hand, i) => {
      hand.isTrue = (results[i] > 0) ? results[i] : 0;
      hand.scoreNow = this.scoreMulti(i);
    });

    this.displayScores();
  }
}
