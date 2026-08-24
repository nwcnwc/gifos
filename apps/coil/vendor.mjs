/*
 * vendor.mjs — rebuild vendor/ from the pinned leereilly/Coil commit
 * (Hakim El Hattab's Coil, MIT).
 *
 *   node apps/coil/vendor.mjs
 *   COIL_SRC=/path/to/checkout node apps/coil/vendor.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');
const UPSTREAM = 'https://github.com/leereilly/Coil.git';
const PIN = 'ea6fd3afae10a6d8a53b07e82be4211619206ede';
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

let src = process.env.COIL_SRC, tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'coil-'));
  src = join(tmp, 'coil');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN);

mkdirSync(out, { recursive: true });
copyFileSync(join(src, 'LICENSE'), join(out, 'COPYING.txt'));
copyFileSync(join(src, 'js', 'libs', 'jquery-1.6.2.min.js'), join(out, 'jquery.min.js'));
copyFileSync(join(src, 'js', 'util.js'), join(out, 'util.js'));
copyFileSync(join(src, 'css', 'reset.css'), join(out, 'reset.css'));

const tex = 'data:image/png;base64,' + readFileSync(join(src, 'images', 'texture.png')).toString('base64');
const bg = 'data:image/jpeg;base64,' + readFileSync(join(src, 'images', 'background.jpg')).toString('base64');
writeFileSync(join(out, 'assets.js'),
  'window.COIL_TEXTURE = ' + JSON.stringify(tex) + ';\n' +
  'window.COIL_BG = ' + JSON.stringify(bg) + ';\n');

let css = readFileSync(join(src, 'css', 'main.css'), 'utf8');
css = css.replace("url('../images/background.jpg')", 'url(' + bg + ')');
css = css.replace(/Molengo, Helvetica, Arial, sans-serif/g, 'Georgia, serif');
css = css.replace(/Ubuntu, Helvetica, Arial, sans-serif/g, 'ui-sans-serif, Helvetica, Arial, sans-serif');
writeFileSync(join(out, 'main.css'), css);

let js = readFileSync(join(src, 'js', 'coil.js'), 'utf8');
js = js.replace(
  'var TOUCH_INPUT = navigator.userAgent.match( /(iPhone|iPad|iPod|Android)/i );',
  "var TOUCH_INPUT = ('ontouchstart' in window) || ((navigator.maxTouchPoints || 0) > 0);"
);
js = js.replace(
  "effectsTexture = WebGLUtil.loadTexture( context3d, 'images/texture.png', $.proxy( function() {",
  "effectsTexture = WebGLUtil.loadTexture( context3d, window.COIL_TEXTURE, $.proxy( function() {"
);
js = js.replace(
  `function stop() {
		scorePanel.style.display = 'block';
		scorePanel.querySelector( 'p' ).innerHTML = Math.floor( score );`,
  `function stop() {
		scorePanel.style.display = 'block';
		scorePanel.querySelector( 'p' ).innerHTML = Math.floor( score );
		if (window.CoilOnStop) window.CoilOnStop(Math.floor(score));`
);

js = js.replace(
  "\t\t\tdocument.addEventListener('mousedown', onDocumentMouseDownHandler, false);\n" +
  "\t\t\tdocument.addEventListener('mousemove', onDocumentMouseMoveHandler, false);\n" +
  "\t\t\tdocument.addEventListener('mouseup', onDocumentMouseUpHandler, false);\n" +
  "\t\t\tcanvas.addEventListener('touchstart', onCanvasTouchStartHandler, false);\n" +
  "\t\t\tcanvas.addEventListener('touchmove', onCanvasTouchMoveHandler, false);\n" +
  "\t\t\tcanvas.addEventListener('touchend', onCanvasTouchEndHandler, false);\n",
  "\t\t\tdocument.addEventListener('mousedown', onDocumentMouseDownHandler, false);\n" +
  "\t\t\tdocument.addEventListener('mousemove', onDocumentMouseMoveHandler, false);\n" +
  "\t\t\tdocument.addEventListener('mouseup', onDocumentMouseUpHandler, false);\n" +
  "\t\t\tcanvas.addEventListener('touchstart', onCanvasTouchStartHandler, false);\n" +
  "\t\t\tcanvas.addEventListener('touchmove', onCanvasTouchMoveHandler, false);\n" +
  "\t\t\tcanvas.addEventListener('touchend', onCanvasTouchEndHandler, false);\n" +
  "\t\t\tdocument.addEventListener('pointerdown', onDocumentPointerDownHandler, false);\n" +
  "\t\t\tdocument.addEventListener('pointermove', onDocumentPointerMoveHandler, false);\n" +
  "\t\t\tdocument.addEventListener('pointerup', onDocumentPointerUpHandler, false);\n" +
  "\t\t\tdocument.addEventListener('pointercancel', onDocumentPointerUpHandler, false);\n"
);

js = js.replace(
  `\tfunction onDocumentMouseMoveHandler(event){
		mouse.previousX = mouse.x;
		mouse.previousY = mouse.y;
		
		mouse.x = event.clientX - (window.innerWidth - world.width) * 0.5;
		mouse.y = event.clientY - (window.innerHeight - world.height) * 0.5;
		
		mouse.velocityX = Math.abs( mouse.x - mouse.previousX ) / world.width;
		mouse.velocityY = Math.abs( mouse.y - mouse.previousY ) / world.height;
	}`,
  `\tfunction pointerToWorld(clientX, clientY, pointerType) {
		var rect = canvas.getBoundingClientRect();
		var rw = rect.width || world.width || 1;
		var rh = rect.height || world.height || 1;
		mouse.previousX = mouse.x;
		mouse.previousY = mouse.y;
		mouse.x = (clientX - rect.left) * (world.width / rw);
		mouse.y = (clientY - rect.top) * (world.height / rh);
		if (pointerType === 'touch') mouse.y -= 28;
		mouse.velocityX = Math.abs( mouse.x - mouse.previousX ) / world.width;
		mouse.velocityY = Math.abs( mouse.y - mouse.previousY ) / world.height;
	}

	function onDocumentMouseMoveHandler(event){
		if (event.pointerType) return;
		pointerToWorld(event.clientX, event.clientY, 'mouse');
	}

	function onDocumentPointerDownHandler(event){
		mouse.down = true;
		pointerToWorld(event.clientX, event.clientY, event.pointerType);
	}

	function onDocumentPointerMoveHandler(event){
		pointerToWorld(event.clientX, event.clientY, event.pointerType);
	}

	function onDocumentPointerUpHandler(event){
		mouse.down = false;
	}`
);

js = js.replace(
  `\tfunction onCanvasTouchStartHandler(event) {
		if(event.touches.length == 1) {
			event.preventDefault();
			
			mouse.x = event.touches[0].pageX - (window.innerWidth - world.width) * 0.5;
			mouse.y = event.touches[0].pageY - (window.innerHeight - world.height) * 0.5;
			
			mouse.down = true;
		}
	}
	
	function onCanvasTouchMoveHandler(event) {
		if(event.touches.length == 1) {
			event.preventDefault();

			mouse.x = event.touches[0].pageX - (window.innerWidth - world.width) * 0.5;
			mouse.y = event.touches[0].pageY - (window.innerHeight - world.height) * 0.5 - 20;
		}
	}`,
  `\tfunction onCanvasTouchStartHandler(event) {
		if(event.touches.length == 1) {
			event.preventDefault();
			pointerToWorld(event.touches[0].clientX, event.touches[0].clientY, 'touch');
			mouse.down = true;
		}
	}
	
	function onCanvasTouchMoveHandler(event) {
		if(event.touches.length == 1) {
			event.preventDefault();
			pointerToWorld(event.touches[0].clientX, event.touches[0].clientY, 'touch');
		}
	}`
);

js = js.replace(
  `\t\t\tvar center = bounds.center();
			
			// Solid fill, faster
			// context.fillStyle = 'rgba(0,255,255,0.2)';
			// context.closePath();
			
			// Gradient fill, prettier
			var gradient = context.createRadialGradient( center.x, center.y, 0, center.x, center.y, bounds.size() );
			gradient.addColorStop(1,'rgba(0, 255, 255, 0.0)');
			gradient.addColorStop(0,'rgba(0, 255, 255, 0.2)');
			context.fillStyle = gradient;
			context.closePath();
			
			context.fill();
			
		}
		
		// Only check for collisions every third frame to reduce lag
		if ( frameCount % 2 == 1 ) {
			
			var bmp = context.getImageData(0, 0, world.width, world.height);
			var bmpw = bmp.width;
			var pixels = bmp.data;
			
			var casualties = [];
			
			var i = enemies.length;
			
			while (i--) {
				var enemy = enemies[i];
				
				var ex = Math.round( enemy.x );
				var ey = Math.round( enemy.y );
				
				var indices = [	
					((ey * bmpw) + Math.round(ex - ENEMY_SIZE)) * 4, 
					((ey * bmpw) + Math.round(ex + ENEMY_SIZE)) * 4, 
					((Math.round(ey - ENEMY_SIZE) * bmpw) + ex) * 4, 
					((Math.round(ey + ENEMY_SIZE) * bmpw) + ex) * 4
				];
				
				var j = indices.length;
				
				while (j--) {
					var index = indices[j];
					
					if (pixels[index + 1] === 255 && pixels[index + 2] === 255) {
					
						if (enemy.type === ENEMY_TYPE_BOMB || enemy.type === ENEMY_TYPE_BOMB_MOVER) {
							handleBombInClosure(enemy);
						}
						else {
							handleEnemyInClosure(enemy);
							
							casualties.push(enemy);
						}
						
						enemies.splice(i, 1);
						
						break;
					}
				}
			}
			
			// If more than one enemy was killed, show the multiplier
			if (casualties.length > 1) {
				// Increase the score exponential depending on the number of
				// casualties
				var scoreChange = adjustScore(casualties.length * SCORE_PER_ENEMY);
				
				notify(scoreChange, player.x, player.y - 10, casualties.length / 1.5, [250, 250, 100]);
			}
			
		}
	}`,
  `\t\t\tvar center = bounds.center();
			
			var gradient = context.createRadialGradient( center.x, center.y, 0, center.x, center.y, bounds.size() );
			gradient.addColorStop(1,'rgba(0, 255, 255, 0.0)');
			gradient.addColorStop(0,'rgba(0, 255, 255, 0.2)');
			context.fillStyle = gradient;
			context.closePath();
			
			context.fill();

			loopPolys.push(points);
			
		}

		var casualties = [];
		var ei = enemies.length;
		var inPoly = (window.CoilCore && window.CoilCore.pointInPoly) ? window.CoilCore.pointInPoly : function(){ return false; };

		while (ei--) {
			var enemy = enemies[ei];
			var enclosed = false;
			var pi = loopPolys.length;
			while (pi--) {
				if (inPoly(loopPolys[pi], enemy.x, enemy.y)) { enclosed = true; break; }
			}
			if (!enclosed) continue;
			if (enemy.type === ENEMY_TYPE_BOMB || enemy.type === ENEMY_TYPE_BOMB_MOVER) {
				handleBombInClosure(enemy);
			} else {
				handleEnemyInClosure(enemy);
				casualties.push(enemy);
			}
			enemies.splice(ei, 1);
		}

		if (casualties.length > 1) {
			var scoreChange = adjustScore(casualties.length * SCORE_PER_ENEMY);
			notify(scoreChange, player.x, player.y - 10, casualties.length / 1.5, [250, 250, 100]);
		}
	}`
);

js = js.replace(
  `\tfunction solveIntersections() {
		
		while( intersections.length ) {
			var ix = intersections.pop();`,
  `\tfunction solveIntersections() {
		var loopPolys = [];
		while( intersections.length ) {
			var ix = intersections.pop();`
);

js = js.replace(
  `\t\tmenu.css( {
			left: ( world.width - menu.width() ) / 2,
			top: ( world.height - menu.height() ) / 2
		} );`,
  `\t\tvar mw = Math.min(menu.width() || 830, Math.max(200, world.width - 16));
		var mh = Math.min(menu.height() || 440, Math.max(160, world.height - 16));
		menu.css( {
			left: Math.max(8, ( world.width - mw ) / 2),
			top: Math.max(8, ( world.height - mh ) / 2),
			width: mw,
			maxHeight: world.height - 16
		} );`
);

js = js.replace(
  `\tinitialize();
	
})();`,
  `\twindow.CoilAPI = {
		start: start,
		stop: stop,
		isPlaying: function(){ return playing; },
		score: function(){ return score; },
		energy: function(){ return player ? player.energy : 0; },
		setPointer: function(x,y){ mouse.x = x; mouse.y = y; },
		disableEffects: disable3dEffects,
		effectsOn: function(){ return effectsEnabled; }
	};

	initialize();
	
})();`
);

if (js.includes("'images/texture.png'")) throw new Error('texture path remains');
if (js.includes('getImageData')) throw new Error('getImageData enclosure remains');
if (!js.includes('CoilCore.pointInPoly')) throw new Error('enclosure must use CoilCore');
if (!js.includes('pointerToWorld')) throw new Error('pointerToWorld missing');
if (/<\/script/i.test(js)) throw new Error('</script');
writeFileSync(join(out, 'coil.js'), js);

const sha = (p) => createHash('sha256').update(readFileSync(join(out, p))).digest('hex');
writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/coil/vendor.mjs.

upstream: ${UPSTREAM.replace(/\.git$/, '')}
commit:   ${PIN}
license:  MIT, Hakim El Hattab (COPYING.txt)

Patches: touch detection, texture data URI, CoilOnStop hook,
  pointer-to-canvas coords, CoilCore enclosure (no getImageData),
  CoilAPI, menu fit on a small screen.

sha256:
  coil.js      ${sha('coil.js')}
  util.js      ${sha('util.js')}
  COPYING.txt  ${sha('COPYING.txt')}
`);
if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log('wrote apps/coil/vendor/ from', PIN.slice(0, 10));

