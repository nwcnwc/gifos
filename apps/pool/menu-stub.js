// Tiny stand-in for the original sprite menu. Game.js constructs `new Menu()`
// at load; the GifOS shell never calls load() — boot.js draws an HTML menu.
function Menu() {}
Menu.prototype.init = function () {};
Menu.prototype.load = function () {};
Menu.prototype.draw = function () {};
Menu.prototype.handleInput = function () {};
