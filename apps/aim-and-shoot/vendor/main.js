let artwork, canvas, rect, _x, _y,  c, w, h, w2, h2, TWOPI, genetics, player, enemies, bullets, players, prevTime, nextTime, deltaTime, startTime, totalTime, isGameover, u, aPlayer, maxEnemies, generation = 1, isStarting = true;

/* The arena is a ROOM, not the screen. Upstream nailed it to 1366x768 and
   let CSS letterbox it — on a phone that put a 16:9 strip of pale grey in
   the middle of a pale grey page: the walls (which HURT) were invisible and
   a tank was nine pixels wide. The field now takes the shape of the box it
   is drawn in, with the short side fixed at ARENA_SHORT, so a tank is
   always the same fraction of the screen and the wall band around the
   canvas (style.css #arena) hugs the exact line a tank bounces off. */
const ARENA_SHORT = 620;

const fitArena = function(){

	const cw = (canvas && canvas.clientWidth) || 1366;

	const ch = (canvas && canvas.clientHeight) || 768;

	let r = cw / ch;

	if( !(r > 0) ) r = 1366 / 768;

	r = Math.max(0.42, Math.min(2.4, r));

	if( r >= 1 ){

		h = ARENA_SHORT;

		w = Math.round(ARENA_SHORT * r);

	}else{

		w = ARENA_SHORT;

		h = Math.round(ARENA_SHORT / r);

	}

	canvas.width = w;

	canvas.height = h;

	w2 = w / 2;

	h2 = h / 2;

	if( c ){

		c.font = Math.max(14, Math.round(ARENA_SHORT / 26)) + "px Arial";

		c.textAlign = "center";

	}

	rect = canvas.getBoundingClientRect();

	_x = w / (rect.width || w);

	_y = h / (rect.height || h);

};

/* Turn the phone, reveal the pad, watch the address bar go: the room
   changes shape. Carry everyone across proportionally rather than leaving
   them standing in a wall. */
const refit = function(){

	if( !canvas ) return;

	const ow = w, oh = h;

	fitArena();

	if( ow !== w || oh !== h ){

		const list = players || [];

		for(let i = 0; i < list.length; i++){

			const p = list[i];

			p.pos.x = Math.max(p.size, Math.min(w - p.size, p.pos.x * (w / ow)));

			p.pos.y = Math.max(p.size, Math.min(h - p.size, p.pos.y * (h / oh)));

			p.looking.x *= w / ow;

			p.looking.y *= h / oh;

		}

		for(let i = 0; i < (bullets || []).length; i++){

			bullets[i].pos.x *= w / ow;

			bullets[i].pos.y *= h / oh;

		}

	}

	if( isStarting ) startScreen();

	else if( isGameover ) failedScreen(1.2);

	else if( c ) draw();

};

/* The box changes with no resize event at all — the pad appearing shortens
   the arena, an app frame is remounted. Watch the canvas itself, or the
   field letterboxes inside its own walls and the hazard band ends up
   somewhere no tank can reach. */
let arenaWatch = null;

const watchArena = function(){

	if( typeof ResizeObserver !== 'function' || !canvas ) return;

	if( arenaWatch ) arenaWatch.disconnect();

	else arenaWatch = new ResizeObserver(_ => refit());

	arenaWatch.observe(canvas);

};

/* A bot bred at Math.random()*w can land inside a wall and bleed out before
   it has moved. Put every new arrival on the floor. */
const placeInside = function(list){

	for(let i = 0; i < (list || []).length; i++){

		const p = list[i];

		p.pos.x = Math.max(p.size, Math.min(w - p.size, p.pos.x));

		p.pos.y = Math.max(p.size, Math.min(h - p.size, p.pos.y));

	}

};

const init = function(){

	maxEnemies = 7;

	isGameover = false;

	const oldCanvas = document.querySelector('#game');

		if( oldCanvas )

			oldCanvas.remove();

		else

			addEventsListener();

	canvas = document.createElement('canvas');

	canvas.id = "game";

	canvas.width = w = 1366;

	canvas.height = h = 768;

	w2 = w/2;

	h2 = h/2;

	TWOPI = Math.PI * 2;

	prevTime = nextTime = deltaTime = startTime = Date.now();

	totalTime = 0;

	c = canvas.getContext('2d');

	(document.getElementById('arena') || document.body).appendChild(canvas);

	fitArena();

	watchArena();

	genetics = new Genetics();

	genetics.createPopulation();

	player = new Player();

	enemies = genetics.population.slice();

	placeInside(enemies);

	bullets = Array();

	players = [player, ...enemies];

	if( isStarting ){

		startScreen();

	}else{

		update();

	}

}


function syncAAS(){
	window.AAS = window.AAS || {};
	AAS.player = player;
	AAS.enemies = enemies;
	AAS.bullets = bullets;
	AAS.generation = generation;
	AAS.isStarting = isStarting;
	AAS.isGameover = isGameover;
	AAS.w = w;
	AAS.h = h;
}

const update = function(){

	nextTime = Date.now();

	deltaTime = nextTime - prevTime;

	totalTime += deltaTime;

	if (player && window.AAS && AAS.applyPad) AAS.applyPad(player);

	for(let i = bullets.length-1; i >= 0; i--){

		bullets[i].update();

		if( bullets[i].isGone )

			bullets.splice(i, 1)

	}

	for(let i = players.length-1; i >= 0 ; i--){

		if( !players[i].isDead )

			players[i].update(player);

	}

	draw();

	if( player.isDead ){

		gameover()

		return

	}

	let allDead = true;

	for(let i = 0; i < enemies.length; i++ ){

		if( !enemies[i].isDead ){

			allDead = false;

			break;

		}

	}

	if( allDead ){

		endRound()

		return

	}

	prevTime = nextTime;

	syncAAS();

	u = requestAnimationFrame( update );

}


const draw = function(){

	c.fillStyle = "#ececec";

	c.fillRect(0, 0, w, h);

	/* The line a tank bounces off, on the floor, inside the wall band. */
	c.strokeStyle = "rgba(0,0,0,.34)";

	c.lineWidth = 3;

	c.strokeRect(1.5, 1.5, w - 3, h - 3);

	c.strokeStyle = "black";

	c.lineWidth = 1;

	for(let i = 0; i < bullets.length; i++){

		bullets[i].show();

	}

	for(let i = 0; i < players.length; i++){

			players[i].show();

	}

	c.textAlign = "start";

	c.fillStyle = "black";

	c.fillText("Generation: "+generation, 10, 30 )

	c.textAlign = "center";

}

const endRound = function(){

	totalTime = (Date.now() - startTime) / 1000;

	genetics.evolve();

	enemies = genetics.population.slice();

	placeInside(enemies);

	players = [player, ...enemies];

	startTime = Date.now();

	generation += 1;
	if (window.AAS && AAS.onGeneration) AAS.onGeneration(generation);

	player.health = Math.min(10, player.health + player.health * 0.15)

	update();

}

const startScreen = function(){

	c.fillStyle = "#ececec";

	c.fillRect(0,0,w,h);

	if (artwork && artwork.complete && artwork.width){

		/* CONTAIN the title art — the field is whatever shape the screen is,
		   and a stretched Nole Ksum is nobody's Nole Ksum. */
		const s = Math.min(w / artwork.width, h / artwork.height);

		const dw = artwork.width * s, dh = artwork.height * s;

		c.drawImage(artwork, 0, 0, artwork.width, artwork.height, (w - dw) / 2, (h - dh) / 2, dw, dh);

	}

	c.fillStyle = "black";

	c.fillText((window.AAS && AAS.coarse) ? "Tap to Start" : "Click to Start", w2, h - h/8 )

}

const gameover = function(){

	if(u)

		cancelAnimationFrame(u)

	if (window.AAS && AAS.onGameover) AAS.onGameover(generation);

	generation = 1;

	isGameover = true;

	syncAAS();

	let i = 0;

	const drawGameover = function(){

		failedScreen(i += 0.01);

		if( i <= 1 )

			requestAnimationFrame( drawGameover );

	}

	drawGameover();

}

const failedScreen = function(fade){

	c.fillStyle = "rgba(0,0,0,"+fade+")";

	c.fillRect(0,0,w,h);

	c.fillStyle = "white";

	c.textAlign = "center";

	c.fillText("You have failed the human race.", w2, h2-25);

	c.fillText("You should move to mars or something.", w2, h2+25);

	if( fade > 1 )

		c.fillText((window.AAS && AAS.coarse) ? "Tap to try again." : "Click to try again.", w2, h2/2);

}

const addEventsListener = function(){

	document.body.addEventListener('mousemove', e => {

		/* rect is the canvas box, which no longer starts at 0,0 — the arena
		   is inset so the wall band is on screen. Aim through the offset. */
		player.lookAt((e.clientX - (rect ? rect.left : 0)) * _x, (e.clientY - (rect ? rect.top : 0)) * _y);

	});


	document.body.addEventListener('keydown', e => {

		e.preventDefault();

		switch(e.keyCode){

			case 37 :
			case 65 :

					player.isMoving.left = true;

				break;

			case 38 :
			case 87 :

					player.isMoving.up = true;

				break;

			case 39 :
			case 68 :

					player.isMoving.right = true;

				break;

			case 40 :
			case 83 :

					player.isMoving.down = true;

				break;
		}

	});


	document.body.addEventListener('keyup', e => {

		e.preventDefault();

		switch(e.keyCode){

			case 37 :
			case 65 :

					player.isMoving.left = false;

				break;

			case 38 :
			case 87 :

					player.isMoving.up = false;

				break;

			case 39 :
			case 68 :

					player.isMoving.right = false;

				break;

			case 40 :
			case 83 :

					player.isMoving.down = false;

				break;
		}

	});


	document.body.addEventListener('mouseup', e => {

		e.preventDefault();

		player.isShooting = false;

	});

	function pressStartOrShoot(){

		if( isGameover ){

			init();

			return true;

		}

		if( isStarting ){

			isStarting = false;

			update();

			return true;

		}

		return false;

	}

	document.body.addEventListener('mousedown', e => {

		e.preventDefault();

		if( pressStartOrShoot() ) return;

		player.isShooting = true;

	});

	document.body.addEventListener('touchend', e => {

		if( pressStartOrShoot() ){

			e.preventDefault();

		}

	}, {passive: false});

	window.onresize = _ => refit();

}

aPlayer = document.createElement('audio');

aPlayer.src = (window.AAS && AAS.shot) || "sounds/shoot.mp3";

artwork = new Image();

artwork.src = (window.AAS && AAS.artwork) || "artwork.png";

function bootGame(){
	if (window._aasBooted) return;
	window._aasBooted = true;
	init();
	syncAAS();
	window.AASShowPad = function () { if (window.AAS && AAS.showPad) AAS.showPad(); };
	AAS.startPlay = function () {
		if (isStarting) { isStarting = false; update(); }
	};
	AAS.retry = function () { init(); };
	AAS.goTitle = function () {
		if (u) cancelAnimationFrame(u);
		isStarting = true;
		isGameover = false;
		generation = 1;
		startScreen();
		syncAAS();
	};
	if (window.AAS && AAS.coarse && AAS.showPad) AAS.showPad();
}

artwork.onload = bootGame;
if (artwork.complete) bootGame();
if (typeof setTimeout === 'function') setTimeout(bootGame, 400);
