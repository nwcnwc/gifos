/* GifOS port of Hextris. Original (C) 2014–2018 Logan Engstrom et al.
   GNU GPL v3 or later. Modified 2026: seeded RNG for a same-seed race. */
function rotatePoint(x, y, theta) {
	var thetaRad = theta * (Math.PI / 180);
	var rotX = Math.cos(thetaRad) * x - Math.sin(thetaRad) * y;
	var rotY = Math.sin(thetaRad) * x + Math.cos(thetaRad) * y;

	return {
		x: rotX,
		y: rotY
	};
}

function randInt(min, max) {
	var r = (window.HT && typeof window.HT.rand === 'function') ? window.HT.rand() : Math.random();
	return Math.floor((r * max) + min);
}
