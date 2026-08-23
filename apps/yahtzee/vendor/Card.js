var Card = class Card {
  constructor(i, nb, color) {
    // todo: verifier le format de name
    this.index = i;
    this.nb = nb;
    this.color = color;
    this.width = 200;
    this.height = 280;
    this.canvas = document.getElementById(`d${i}`);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');

    this.colors = document.getElementById('colors');
    this.numbers = document.getElementById('nb');

    this.draw(nb, color);
  }

  draw(nb, color) {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.save();
    // index de couleur (0 : noir, 1 rouge)
    const index = (color < 2) ? 0 : 1;
    // central color
    this.ctx.drawImage(this.colors,
      color * 100, 0,
      100, 100,

      50, 90,
      100, 100);
    // left color
    this.ctx.drawImage(this.colors,
      color * 100, 0,
      100, 100,

      6, 36,
      30, 30);
    // left number
    this.ctx.drawImage(this.numbers,
      nb * 27, index * 27,
      27, 27,

      8, 8,
      27, 27);

    this.ctx.translate(100, 140);
    this.ctx.rotate(Math.PI);
    this.ctx.translate(-100, -140);
    // right color
    this.ctx.drawImage(this.colors,
      color * 100, 0,
      100, 100,

      6, 36,
      30, 30);
    // right number
    this.ctx.drawImage(this.numbers,
      nb * 27, index * 27,
      27, 27,

      8, 8,
      27, 27);
    this.ctx.restore();
  }
}
