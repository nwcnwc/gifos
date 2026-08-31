/* GifOS port of Hextris. Original (C) 2014–2018 Logan Engstrom et al.
   GNU GPL v3 or later. Modified 2026: scores go through HT.ls* (gifos.db). */
function lsGet(k) { return (window.HT && HT.lsGet) ? HT.lsGet(k) : null; }
function lsSet(k, v) { if (window.HT && HT.lsSet) HT.lsSet(k, v); }

function exportSaveState() {
	var state = {};

	if(gameState == 1 || gameState == -1 || (gameState === 0 && lsGet('saveState') !== undefined)) {
		state = {
			hex: $.extend(true, {}, MainHex),
			blocks: $.extend(true, [], blocks),
			score: score,
			wavegen: waveone,
			gdx: gdx,
			gdy: gdy,
			comboTime:settings.comboTime
		};

		state.hex.blocks.map(function(a){
			for (var i = 0; i < a.length; i++) {
				a[i] = $.extend(true, {}, a[i]);
			}

			a.map(descaleBlock);
		});

		for (var i = 0; i < state.blocks.length; i++) {
			state.blocks[i] = $.extend(true, {}, state.blocks[i]);
		}

		state.blocks.map(descaleBlock);
	}

	lsSet('highscores', JSON.stringify(highscores));

	return JSONfn.stringify(state);
}

function descaleBlock(b) {
	b.distFromHex /= settings.scale;
}

function writeHighScores() {
		highscores.sort(
		function(a,b){
			a = parseInt(a, 10);
			b = parseInt(b, 10);
			if (a < b) {
				return 1;
			} else if (a > b) {
				return -1;
			}else {
				return 0;
			}
		}
	);
	highscores = highscores.slice(0,3);
	lsSet("highscores", JSON.stringify(highscores));
}

function clearSaveState() {
	lsSet("saveState", "{}");
}

function isStateSaved() {
	return lsGet("saveState") != "{}" && lsGet("saveState") != undefined && lsGet("saveState") != null;
}
