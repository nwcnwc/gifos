(function() { // module pattern

  //-------------------------------------------------------------------------
  // POLYFILLS
  //-------------------------------------------------------------------------
  
  if (!window.requestAnimationFrame) { // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
    window.requestAnimationFrame = window.webkitRequestAnimationFrame || 
                                   window.mozRequestAnimationFrame    || 
                                   window.oRequestAnimationFrame      || 
                                   window.msRequestAnimationFrame     || 
                                   function(callback, element) {
                                     window.setTimeout(callback, 1000 / 60);
                                   }
  }

  //-------------------------------------------------------------------------
  // UTILITIES
  //-------------------------------------------------------------------------
  
  function timestamp() {
    return window.performance && window.performance.now ? window.performance.now() : new Date().getTime();
  }
  
  function bound(x, min, max) {
    return Math.max(min, Math.min(max, x));
  }

  function get(url, onsuccess) {
    var request = new XMLHttpRequest();
    request.onreadystatechange = function() {
      if ((request.readyState == 4) && (request.status == 200))
        onsuccess(request);
    }
    request.open("GET", url, true);
    request.send();
  }

  function overlap(x1, y1, w1, h1, x2, y2, w2, h2) {
    return !(((x1 + w1 - 1) < x2) ||
             ((x2 + w2 - 1) < x1) ||
             ((y1 + h1 - 1) < y2) ||
             ((y2 + h2 - 1) < y1))
  }
  
  //-------------------------------------------------------------------------
  // GAME CONSTANTS AND VARIABLES
  //-------------------------------------------------------------------------
  
  var MAP      = { tw: 64, th: 48 },
      TILE     = 32,
      METER    = TILE,
      GRAVITY  = 9.8 * 6, // default (exagerated) gravity
      MAXDX    = 15,      // default max horizontal speed (15 tiles per second)
      MAXDY    = 60,      // default max vertical speed   (60 tiles per second)
      ACCEL    = 1/2,     // default take 1/2 second to reach maxdx (horizontal acceleration)
      FRICTION = 1/6,     // default take 1/6 second to stop from maxdx (horizontal friction)
      IMPULSE  = 1500,    // default player jump impulse
      COLOR    = { BLACK: '#000000', YELLOW: '#ECD078', BRICK: '#D95B43', PINK: '#C02942', PURPLE: '#542437', GREY: '#333', SLATE: '#53777A', GOLD: 'gold' },
      COLORS   = [ COLOR.YELLOW, COLOR.BRICK, COLOR.PINK, COLOR.PURPLE, COLOR.GREY ],
      KEY      = { SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, A: 65, D: 68, W: 87, R: 82 };
      
  var fps      = 60,
      step     = 1/fps,
      canvas   = document.getElementById('canvas'),
      ctx      = canvas.getContext('2d'),
      VIEW_TW  = 20,
      VIEW_TH  = 15,
      width    = canvas.width  = VIEW_TW * TILE,
      height   = canvas.height = VIEW_TH * TILE,
      player   = {},
      monsters = [],
      treasure = [],
      cells    = [];
  
  var t2p      = function(t)     { return t*TILE;                  },
      p2t      = function(p)     { return Math.floor(p/TILE);      },
      cell     = function(x,y)   { return tcell(p2t(x),p2t(y));    },
      tcell    = function(tx,ty) { return cells[tx + (ty*MAP.tw)]; };
  
  
  //-------------------------------------------------------------------------
  // UPDATE LOOP
  //-------------------------------------------------------------------------

  function onkey(ev, key, down) {
    switch(key) {
      case KEY.LEFT:
      case KEY.A:     player.left  = down; ev.preventDefault(); return false;
      case KEY.RIGHT:
      case KEY.D:     player.right = down; ev.preventDefault(); return false;
      case KEY.SPACE:
      case KEY.UP:
      case KEY.W:     player.jump  = down; ev.preventDefault(); return false;
      case KEY.R:     if (down) restart(); ev.preventDefault(); return false;
    }
  }
  
  function update(dt) {
    updatePlayer(dt);
    updateMonsters(dt);
    checkTreasure();
  }

  function updatePlayer(dt) {
    updateEntity(player, dt);
  }

  function updateMonsters(dt) {
    var n, max;
    for(n = 0, max = monsters.length ; n < max ; n++)
      updateMonster(monsters[n], dt);
  }

  function updateMonster(monster, dt) {
    if (!monster.dead) {
      updateEntity(monster, dt);
      if (overlap(player.x, player.y, TILE, TILE, monster.x, monster.y, TILE, TILE)) {
        if ((player.dy > 0) && (monster.y - player.y > TILE/2))
          killMonster(monster);
        else
          killPlayer(player);
      }
    }
  }

  function checkTreasure() {
    var n, max, t;
    for(n = 0, max = treasure.length ; n < max ; n++) {
      t = treasure[n];
      if (!t.collected && overlap(player.x, player.y, TILE, TILE, t.x, t.y, TILE, TILE))
        collectTreasure(t);
    }
  }

  function killMonster(monster) {
    player.killed++;
    monster.dead = true;
    if (window.Tiny && window.Tiny.onProgress) window.Tiny.onProgress(player);
  }

  function killPlayer(player) {
    player.x = player.start.x;
    player.y = player.start.y;
    player.dx = player.dy = 0;
    player.hurt = 18;
    if (window.Tiny && window.Tiny.onHurt) window.Tiny.onHurt(player);
  }

  function caveCleared() {
    var n;
    for (n = 0; n < treasure.length; n++) if (!treasure[n].collected) return false;
    for (n = 0; n < monsters.length; n++) if (!monsters[n].dead) return false;
    return treasure.length > 0;
  }

  function restart() {
    var n, m;
    player.x = player.start.x;
    player.y = player.start.y;
    player.dx = player.dy = 0;
    player.collected = 0;
    player.killed = 0;
    player.jumping = false;
    player.falling = false;
    player.left = player.right = player.jump = false;
    player.coyote = player.jbuf = 0;
    player.hurt = 0;
    for (n = 0; n < treasure.length; n++) treasure[n].collected = false;
    for (n = 0; n < monsters.length; n++) {
      m = monsters[n];
      m.dead = false;
      m.x = m.start.x;
      m.y = m.start.y;
      m.dx = m.dy = 0;
      m.left = m.startLeft;
      m.right = m.startRight;
    }
    if (window.Tiny && window.Tiny.onProgress) window.Tiny.onProgress(player);
  }

  function collectTreasure(t) {
    player.collected++;
    t.collected = true;
    if (window.Tiny && window.Tiny.onProgress) window.Tiny.onProgress(player);
  }

  function updateEntity(entity, dt) {
    var wasleft    = entity.dx  < 0,
        wasright   = entity.dx  > 0,
        falling    = entity.falling,
        friction   = entity.friction * (falling ? 0.5 : 1),
        accel      = entity.accel    * (falling ? 0.5 : 1);
  
    entity.ddx = 0;
    entity.ddy = entity.gravity;
  
    if (entity.left)
      entity.ddx = entity.ddx - accel;
    else if (wasleft)
      entity.ddx = entity.ddx + friction;
  
    if (entity.right)
      entity.ddx = entity.ddx + accel;
    else if (wasright)
      entity.ddx = entity.ddx - friction;
  
    if (entity.player) {
      entity.coyote = entity.coyote || 0;
      entity.jbuf   = entity.jbuf   || 0;
      if (!falling) entity.coyote = 0.08;
      else          entity.coyote = Math.max(0, entity.coyote - dt);
      if (entity.jump) entity.jbuf = 0.08;
      else             entity.jbuf = Math.max(0, entity.jbuf - dt);
      if ((entity.jump || entity.jbuf > 0) && !entity.jumping && (!falling || entity.coyote > 0)) {
        entity.ddy = entity.ddy - entity.impulse;
        entity.jumping = true;
        entity.coyote = 0;
        entity.jbuf = 0;
      }
    } else if (entity.jump && !entity.jumping && !falling) {
      entity.ddy = entity.ddy - entity.impulse; // an instant big force impulse
      entity.jumping = true;
    }
  
    entity.x  = entity.x  + (dt * entity.dx);
    entity.y  = entity.y  + (dt * entity.dy);
    entity.dx = bound(entity.dx + (dt * entity.ddx), -entity.maxdx, entity.maxdx);
    entity.dy = bound(entity.dy + (dt * entity.ddy), -entity.maxdy, entity.maxdy);
  
    if ((wasleft  && (entity.dx > 0)) ||
        (wasright && (entity.dx < 0))) {
      entity.dx = 0; // clamp at zero to prevent friction from making us jiggle side to side
    }
  
    var tx        = p2t(entity.x),
        ty        = p2t(entity.y),
        nx        = entity.x%TILE,
        ny        = entity.y%TILE,
        cell      = tcell(tx,     ty),
        cellright = tcell(tx + 1, ty),
        celldown  = tcell(tx,     ty + 1),
        celldiag  = tcell(tx + 1, ty + 1);
  
    if (entity.dy > 0) {
      if ((celldown && !cell) ||
          (celldiag && !cellright && nx)) {
        entity.y = t2p(ty);
        entity.dy = 0;
        entity.falling = false;
        entity.jumping = false;
        ny = 0;
      }
    }
    else if (entity.dy < 0) {
      if ((cell      && !celldown) ||
          (cellright && !celldiag && nx)) {
        entity.y = t2p(ty + 1);
        entity.dy = 0;
        cell      = celldown;
        cellright = celldiag;
        ny        = 0;
      }
    }
  
    if (entity.dx > 0) {
      if ((cellright && !cell) ||
          (celldiag  && !celldown && ny)) {
        entity.x = t2p(tx);
        entity.dx = 0;
      }
    }
    else if (entity.dx < 0) {
      if ((cell     && !cellright) ||
          (celldown && !celldiag && ny)) {
        entity.x = t2p(tx + 1);
        entity.dx = 0;
      }
    }

    if (entity.monster) {
      if (entity.left && (cell || !celldown)) {
        entity.left = false;
        entity.right = true;
      }      
      else if (entity.right && (cellright || !celldiag)) {
        entity.right = false;
        entity.left  = true;
      }
    }
  
    entity.falling = ! (celldown || (nx && celldiag));
  
  }

  //-------------------------------------------------------------------------
  // RENDERING
  //-------------------------------------------------------------------------
  
  function camera() {
    var maxx = MAP.tw * TILE - width, maxy = MAP.th * TILE - height;
    return {
      x: bound(player.x - width / 2 + TILE / 2, 0, Math.max(0, maxx)),
      y: bound(player.y - height / 2 + TILE / 2, 0, Math.max(0, maxy))
    };
  }

  function render(ctx, frame, dt) {
    var cam = camera();
    ctx.setTransform(1, 0, 0, 1, -cam.x, -cam.y);
    ctx.clearRect(cam.x, cam.y, width, height);
    renderMap(ctx);
    renderTreasure(ctx, frame);
    renderPlayer(ctx, dt);
    renderMonsters(ctx, dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (window.Tiny && window.Tiny.onFrame) window.Tiny.onFrame(player, cam);
  }

  function renderMap(ctx) {
    var x, y, cell;
    for(y = 0 ; y < MAP.th ; y++) {
      for(x = 0 ; x < MAP.tw ; x++) {
        cell = tcell(x, y);
        if (cell) {
          ctx.fillStyle = COLORS[cell - 1];
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
    }
  }

  function renderPlayer(ctx, dt) {
    if (player.hurt) {
      player.hurt--;
      if ((player.hurt % 4) < 2) ctx.fillStyle = COLOR.PINK;
      else ctx.fillStyle = COLOR.YELLOW;
    } else {
      ctx.fillStyle = COLOR.YELLOW;
    }
    ctx.fillRect(player.x + (player.dx * dt), player.y + (player.dy * dt), TILE, TILE);
  }

  function renderMonsters(ctx, dt) {
    ctx.fillStyle = COLOR.SLATE;
    var n, max, monster;
    for(n = 0, max = monsters.length ; n < max ; n++) {
      monster = monsters[n];
      if (!monster.dead)
        ctx.fillRect(monster.x + (monster.dx * dt), monster.y + (monster.dy * dt), TILE, TILE);
    }
  }

  function renderTreasure(ctx, frame) {
    ctx.fillStyle   = COLOR.GOLD;
    ctx.globalAlpha = 0.25 + tweenTreasure(frame, 60);
    var n, max, t;
    for(n = 0, max = treasure.length ; n < max ; n++) {
      t = treasure[n];
      if (!t.collected)
        ctx.fillRect(t.x, t.y + TILE/3, TILE, TILE*2/3);
    }
    ctx.globalAlpha = 1;
  }

  function tweenTreasure(frame, duration) {
    var half  = duration/2
        pulse = frame%duration;
    return pulse < half ? (pulse/half) : 1-(pulse-half)/half;
  }

  //-------------------------------------------------------------------------
  // LOAD THE MAP
  //-------------------------------------------------------------------------
  
  function setup(map) {
    var data    = map.layers[0].data,
        objects = map.layers[1].objects,
        n, obj, entity;

    for(n = 0 ; n < objects.length ; n++) {
      obj = objects[n];
      entity = setupEntity(obj);
      switch(obj.type) {
      case "player"   : player = entity; break;
      case "monster"  : monsters.push(entity); break;
      case "treasure" : treasure.push(entity); break;
      }
    }

    cells = data;
  }

  function setupEntity(obj) {
    var entity = {};
    entity.x        = obj.x;
    entity.y        = obj.y;
    entity.dx       = 0;
    entity.dy       = 0;
    entity.gravity  = METER * (obj.properties.gravity || GRAVITY);
    entity.maxdx    = METER * (obj.properties.maxdx   || MAXDX);
    entity.maxdy    = METER * (obj.properties.maxdy   || MAXDY);
    entity.impulse  = METER * (obj.properties.impulse || IMPULSE);
    entity.accel    = entity.maxdx / (obj.properties.accel    || ACCEL);
    entity.friction = entity.maxdx / (obj.properties.friction || FRICTION);
    entity.monster  = obj.type == "monster";
    entity.player   = obj.type == "player";
    entity.treasure = obj.type == "treasure";
    entity.left      = obj.properties.left;
    entity.right     = obj.properties.right;
    entity.startLeft = !!obj.properties.left;
    entity.startRight= !!obj.properties.right;
    entity.start     = { x: obj.x, y: obj.y };
    entity.killed = entity.collected = 0;
    return entity;
  }

  //-------------------------------------------------------------------------
  // THE GAME LOOP
  //-------------------------------------------------------------------------
  
  var counter = 0, dt = 0, now,
      last = timestamp(),
      fpsmeter = { tickStart: function () {}, tick: function () {} };
  
  function frame() {
    fpsmeter.tickStart();
    now = timestamp();
    dt = dt + Math.min(1, (now - last) / 1000);
    while(dt > step) {
      dt = dt - step;
      update(step);
    }
    render(ctx, counter, dt);
    last = now;
    counter++;
    fpsmeter.tick();
    requestAnimationFrame(frame, canvas);
  }
  
  document.addEventListener('keydown', function(ev) { return onkey(ev, ev.keyCode, true);  }, false);
  document.addEventListener('keyup',   function(ev) { return onkey(ev, ev.keyCode, false); }, false);

  window.Tiny = window.Tiny || {};
  window.Tiny.player = function () { return player; };
  window.Tiny.monsters = function () { return monsters; };
  window.Tiny.treasure = function () { return treasure; };
  window.Tiny.totals = function () { return { coins: treasure.length, stomps: monsters.length }; };
  window.Tiny.cleared = caveCleared;
  window.Tiny.restart = restart;
  window.Tiny.step = function (n) {
    var i, times = n == null ? 1 : n;
    for (i = 0; i < times; i++) update(step);
  };
  window.Tiny.onkey = onkey;
  window.Tiny.KEY = KEY;
  window.Tiny.TILE = TILE;
  window.Tiny.COLOR = COLOR;

  if (!window.TINY_LEVEL) throw new Error("TINY_LEVEL missing");
  setup(window.TINY_LEVEL);
  if (!(window.Tiny && window.Tiny.headless)) frame();

})();

