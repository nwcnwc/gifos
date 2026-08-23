/*
 * vendor.mjs — rebuild vendor/ from the pinned victorqribeiro/isocity commit.
 *
 * This is the ONLY step that needs the network, and it is deliberately NOT part
 * of build.mjs: the App GIF must be buildable offline from what is committed
 * here. Run this only to move the pin.
 *
 *   node apps/isocity/vendor.mjs
 *   ISOCITY_SRC=/path/to/checkout node apps/isocity/vendor.mjs
 *
 * WHAT IT PRODUCES. The original classic script (already a page script, not a
 * module), patched so the Kenney sheet is the <img id=texSheet> the runtime
 * rewrites, hash-save is gone (sandbox has no history we want), and a click
 * lands through IsoCity.onPlace so the room can apply it. CSS background-image
 * is stripped — inlined stylesheets cannot resolve a relative url(). The
 * texture PNG is copied as-is.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const out = join(dir, 'vendor');

const UPSTREAM = 'https://github.com/victorqribeiro/isocity.git';
const PIN = 'c5772412d3e423318f2cf479ebdd50a2b9029d84'; // 2024-10-14 "delete .github folder"
const TEX = 'textures/01_130x66_130x230.png';

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit', timeout: 120000 });

function mustReplace(src, find, replace, why) {
  if (typeof find === 'string') {
    if (!src.includes(find)) throw new Error('PATCH NO LONGER APPLIES: ' + why);
    return src.split(find).join(replace);
  }
  if (!find.test(src)) throw new Error('PATCH NO LONGER APPLIES: ' + why);
  return src.replace(find, replace);
}

let src = process.env.ISOCITY_SRC;
let tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'isocity-'));
  src = join(tmp, 'isocity');
  console.log('cloning ' + UPSTREAM + ' @ ' + PIN.slice(0, 10) + '…');
  run('git', ['clone', '--quiet', UPSTREAM, src]);
  run('git', ['checkout', '--quiet', PIN], src);
}
const at = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: src, encoding: 'utf8' }).trim();
if (at !== PIN) throw new Error('checkout is at ' + at + ', not the pin ' + PIN + ' — move PIN deliberately.');

mkdirSync(join(out, 'textures'), { recursive: true });
copyFileSync(join(src, TEX), join(out, TEX));
copyFileSync(join(src, 'LICENSE'), join(out, 'COPYING-isocity.txt'));

writeFileSync(join(out, 'COPYING-kenney.txt'),
`IsoCity's tile sheet is Kenney's isometric landscape / city art, CC0.

  https://opengameart.org/content/isometric-landscape
  https://opengameart.org/content/isometric-city
  https://kenney.nl

CC0 1.0 Universal (CC0 1.0) Public Domain Dedication
https://creativecommons.org/publicdomain/zero/1.0/

Credit "Kenney.nl" or "www.kenney.nl" is requested, not required.
`);

let css = readFileSync(join(src, 'css', 'main.css'), 'utf8');
css = mustReplace(
  css,
  "\tbackground-image: url('../textures/01_130x66_130x230.png');\n",
  '\t/* background-image is set in JS from #texSheet — inlined CSS cannot resolve a relative url() */\n',
  'css texture url',
);
if (/url\(\s*['"]?[^)'"]+/.test(css)) {
  throw new Error('vendor/main.css still has a relative url() — it would 404 once the stylesheet is inlined');
}
writeFileSync(join(out, 'main.css'), css);

let js = readFileSync(join(src, 'js', 'main.js'), 'utf8');

js = mustReplace(
  js,
  `const texture = new Image()
texture.src = "textures/01_130x66_130x230.png"
texture.onload = _ => init()
`,
  `const texture = document.getElementById('texSheet')
const boot = () => {
	if (!texture) return
	if (texture.complete && texture.naturalWidth) init()
	else texture.addEventListener('load', init)
}
// boot() is called at end of file so init / drawMap exist
`,
  'texture from #texSheet',
);

js = mustReplace(
  js,
  `let canvas, bg, fg, cf, ntiles, tileWidth, tileHeight, texWidth,
	texHeight, map, tools, tool, activeTool, isPlacing, previousState
`,
  `let canvas, bg, fg, cf, ntiles, tileWidth, tileHeight, texWidth,
	texHeight, map, tools, tool, activeTool, isPlacing, w, h
`,
  'declare w,h; drop previousState',
);

js = mustReplace(
  js,
  `			div.style.backgroundPosition = \`-\${j * 130 + 2}px -\${i * 230}px\`
`,
  `			div.style.backgroundImage = 'url("' + texture.src + '")'
			div.style.backgroundPosition = '-' + (j * 130) + 'px -' + (i * 230) + 'px'
`,
  'tool background from texSheet',
);

js = mustReplace(
  js,
  `	fg.addEventListener('mousemove', viz)
	fg.addEventListener('contextmenu', e => e.preventDefault())
	fg.addEventListener('mouseup', unclick)
	fg.addEventListener('mousedown', click)
	fg.addEventListener('touchend', click)
	fg.addEventListener('pointerup', click)
`,
  `	fg.addEventListener('mousemove', viz)
	fg.addEventListener('contextmenu', e => e.preventDefault())
	fg.addEventListener('mouseup', unclick)
	fg.addEventListener('mousedown', click)
	fg.addEventListener('touchstart', e => { e.preventDefault(); click(e) }, { passive: false })
	fg.addEventListener('touchmove', e => { e.preventDefault(); viz(e) }, { passive: false })
	fg.addEventListener('touchend', unclick)
`,
  'touch paint, drop double-firing pointerup',
);

js = mustReplace(
  js,
  `	tools.appendChild(div)
		}
	}

}
`,
  `	tools.appendChild(div)
		}
	}

	window.IsoCity = window.IsoCity || {}
	window.IsoCity.map = () => map
	window.IsoCity.ntiles = () => ntiles
	window.IsoCity.texWidth = () => texWidth
	window.IsoCity.texHeight = () => texHeight
	window.IsoCity.tool = () => tool
	window.IsoCity.setTool = t => { tool = t }
	window.IsoCity.drawMap = drawMap
	window.IsoCity.setCell = (x, y, a, b) => {
		if (!map[x] || !map[x][y]) return
		map[x][y] = [a, b]
	}
	window.IsoCity.replaceMap = cells => {
		for (let i = 0; i < ntiles; i++) {
			for (let j = 0; j < ntiles; j++) {
				const t = cells[i * ntiles + j] || 0
				map[i][j] = [Math.trunc(t / texWidth), Math.trunc(t % texWidth)]
			}
		}
		drawMap()
	}
	window.IsoCity.emptyMap = () => {
		for (let i = 0; i < ntiles; i++)
			for (let j = 0; j < ntiles; j++) map[i][j] = [0, 0]
		drawMap()
	}
	window.IsoCity.pack = () => {
		const out = []
		for (let i = 0; i < ntiles; i++)
			for (let j = 0; j < ntiles; j++) out.push(map[i][j][0] * texWidth + map[i][j][1])
		return out
	}
	if (window.IsoCity.onReady) window.IsoCity.onReady()
}
`,
  'expose IsoCity API at end of init',
);

js = mustReplace(
  js,
  `const updateHashState = () => {
	let c = 0
	const u8 = new Uint8Array(ntiles * ntiles)
	for (let i = 0; i < ntiles; i++) {
		for (let j = 0; j < ntiles; j++) {
			u8[c++] = map[i][j][0] * texWidth + map[i][j][1]
		}
	}
	const state = ToBase64(u8)
	if (!previousState || previousState != state) {
		history.pushState(undefined, undefined, \`#\${state}\`)
		previousState = state
	}
}

window.addEventListener('popstate', function () {
	loadHashState(document.location.hash.substring(1))
	drawMap()
})

const loadHashState = state => {
	const u8 = FromBase64(state)
	let c = 0
	for (let i = 0; i < ntiles; i++) {
		for (let j = 0; j < ntiles; j++) {
			const t = u8[c++] || 0
			const x = Math.trunc(t / texWidth)
			const y = Math.trunc(t % texWidth)
			map[i][j] = [x, y]
		}
	}
}
`,
  `const updateHashState = () => {
	if (window.IsoCity && window.IsoCity.onChanged) window.IsoCity.onChanged()
}
`,
  'hash save → onChanged',
);

js = mustReplace(
  js,
  `	loadHashState(document.location.hash.substring(1))
	drawMap()
`,
  `	drawMap()
`,
  'do not load location.hash',
);

js = mustReplace(
  js,
  `const click = e => {
	const pos = getPosition(e)
	if (pos.x >= 0 && pos.x < ntiles && pos.y >= 0 && pos.y < ntiles) {
		map[pos.x][pos.y][0] = (e.which === 3) ? 0 : tool[0]
		map[pos.x][pos.y][1] = (e.which === 3) ? 0 : tool[1]
		isPlacing = true
		drawMap()
		cf.clearRect(-w, -h, w * 2, h * 2)
	}
	updateHashState();
}
`,
  `const click = e => {
	const pos = getPosition(e)
	if (pos.x >= 0 && pos.x < ntiles && pos.y >= 0 && pos.y < ntiles) {
		const erase = (e.which === 3 || e.button === 2)
		const a = erase ? 0 : tool[0]
		const b = erase ? 0 : tool[1]
		if (window.IsoCity && window.IsoCity.onPlace) {
			if (window.IsoCity.onPlace(pos.x, pos.y, a, b) === false) return
		}
		map[pos.x][pos.y][0] = a
		map[pos.x][pos.y][1] = b
		isPlacing = true
		drawMap()
		cf.clearRect(-w, -h, w * 2, h * 2)
	}
	updateHashState();
}
`,
  'click → onPlace',
);

js = mustReplace(
  js,
  `const getPosition = e => {
	const _y = (e.offsetY - tileHeight * 2) / tileHeight
	const _x = e.offsetX / tileWidth - ntiles / 2
	x = Math.floor(_y - _x)
	y = Math.floor(_x + _y)
	return { x, y }
}
`,
  `const eventXY = e => {
	const rect = fg.getBoundingClientRect()
	const sx = fg.width / Math.max(1, rect.width)
	const sy = fg.height / Math.max(1, rect.height)
	const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
	const cx = t ? t.clientX : e.clientX
	const cy = t ? t.clientY : e.clientY
	return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy }
}

const getPosition = e => {
	const p = eventXY(e)
	const _y = (p.y - tileHeight * 2) / tileHeight
	const _x = p.x / tileWidth - ntiles / 2
	const x = Math.floor(_y - _x)
	const y = Math.floor(_x + _y)
	return { x, y }
}
`,
  'touch + CSS-scaled hit testing',
);

js += `
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
else boot()
`

if (js.includes('textures/01_')) throw new Error('main.js still mentions a textures/ path');
if (js.includes('history.pushState')) throw new Error('main.js still pushes history');
if (js.includes('location.hash')) throw new Error('main.js still reads location.hash');
if (js.includes('pointerup')) throw new Error('main.js still listens for pointerup (double-fire)');
if (!js.includes('window.IsoCity')) throw new Error('main.js does not expose IsoCity');
if (/<\/script/i.test(js)) throw new Error('main.js contains </script');
if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(js)) {
  throw new Error('main.js uses ESM — classic scripts only');
}

writeFileSync(join(out, 'main.js'), js);

const sha = (p) => createHash('sha256').update(readFileSync(join(out, p))).digest('hex');
const texBuf = readFileSync(join(out, TEX));
if (texBuf[0] !== 0x89 || texBuf[1] !== 0x50) throw new Error('texture is not a PNG');

writeFileSync(join(out, 'UPSTREAM.txt'),
`vendor/* is GENERATED. Do not edit it; run node apps/isocity/vendor.mjs.

upstream: ${UPSTREAM}
commit:   ${PIN}
date:     2024-10-14
license:  MIT, Victor Ribeiro (COPYING-isocity.txt)
tiles:    Kenney isometric landscape/city, CC0 (COPYING-kenney.txt)

js/main.js is the original page script with these seams:
  texture from #texSheet (runtime rewrites static <img src>)
  no location.hash / history.pushState — save is gifos.db
  click goes through IsoCity.onPlace so a shared map can apply it
  touchstart/move paint; pointerup dropped (it double-fired with mouseup)
  getPosition uses the canvas box, so a CSS-scaled canvas still hits
  IsoCity.* API appended at the end of init()

css/main.css is the original with the texture url() removed (inlined
stylesheets cannot resolve a relative path). JS sets background-image
from the sheet.

sha256:
  main.js     ${sha('main.js')}
  main.css    ${sha('main.css')}
  texture     ${sha(TEX)}
  COPYING     ${sha('COPYING-isocity.txt')}

Notices travel INSIDE the GIF as COPYING-isocity.txt and COPYING-kenney.txt.
`);

if (tmp) rmSync(tmp, { recursive: true, force: true });

console.log('wrote apps/isocity/vendor/ — main.js + main.css + Kenney sheet + COPYING');
console.log('pin', PIN.slice(0, 10), 'main.js', sha('main.js').slice(0, 12) + '…',
            'texture', (texBuf.length / 1024).toFixed(0), 'KB');
