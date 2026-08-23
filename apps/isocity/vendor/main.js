
const $ = _ => document.querySelector(_)

const $c = _ => document.createElement(_)

let canvas, bg, fg, cf, ntiles, tileWidth, tileHeight, texWidth,
	texHeight, map, tools, tool, activeTool, isPlacing, w, h

/* texture from https://opengameart.org/content/isometric-landscape */
const texture = document.getElementById('texSheet')
const boot = () => {
	if (!texture) return
	if (texture.complete && texture.naturalWidth) init()
	else texture.addEventListener('load', init)
}
// boot() is called at end of file so init / drawMap exist

const init = () => {

	tool = [0, 0]

	map = [
		[[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
		[[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
		[[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
		[[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
		[[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
		[[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
		[[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]
	]

	canvas = $("#bg")
	canvas.width = 910
	canvas.height = 666
	w = 910
	h = 462
	texWidth = 12
	texHeight = 6
	bg = canvas.getContext("2d")
	ntiles = 7
	tileWidth = 128
	tileHeight = 64
	bg.translate(w / 2, tileHeight * 2)

	drawMap()

	fg = $('#fg')
	fg.width = canvas.width
	fg.height = canvas.height
	cf = fg.getContext('2d')
	cf.translate(w / 2, tileHeight * 2)
	fg.addEventListener('mousemove', viz)
	fg.addEventListener('contextmenu', e => e.preventDefault())
	fg.addEventListener('mouseup', unclick)
	fg.addEventListener('mousedown', click)
	fg.addEventListener('touchstart', e => { e.preventDefault(); click(e) }, { passive: false })
	fg.addEventListener('touchmove', e => { e.preventDefault(); viz(e) }, { passive: false })
	fg.addEventListener('touchend', unclick)

	tools = $('#tools')

	let toolCount = 0
	for (let i = 0; i < texHeight; i++) {
		for (let j = 0; j < texWidth; j++) {
			const div = $c('div');
			div.id = `tool_${toolCount++}`
			div.style.display = "block"
			/* width of 132 instead of 130  = 130 image + 2 border = 132 */
			div.style.backgroundImage = 'url("' + texture.src + '")'
			div.style.backgroundPosition = '-' + (j * 130) + 'px -' + (i * 230) + 'px'
			div.addEventListener('click', e => {
				tool = [i, j]
				if (activeTool)
					$(`#${activeTool}`).classList.remove('selected')
				activeTool = e.target.id
				$(`#${activeTool}`).classList.add('selected')
			})
			tools.appendChild(div)
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

// From https://stackoverflow.com/a/36046727
const ToBase64 = u8 => {
	return btoa(String.fromCharCode.apply(null, u8))
}

const FromBase64 = str => {
	return atob(str).split('').map(c => c.charCodeAt(0))
}

const updateHashState = () => {
	if (window.IsoCity && window.IsoCity.onChanged) window.IsoCity.onChanged()
}

const click = e => {
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

const unclick = () => {
	if (isPlacing)
		isPlacing = false
}

const drawMap = () => {
	bg.clearRect(-w, -h, w * 2, h * 2)
	for (let i = 0; i < ntiles; i++) {
		for (let j = 0; j < ntiles; j++) {
			drawImageTile(bg, i, j, map[i][j][0], map[i][j][1])
		}
	}
}

const drawTile = (c, x, y, color) => {
	c.save()
	c.translate((y - x) * tileWidth / 2, (x + y) * tileHeight / 2)
	c.beginPath()
	c.moveTo(0, 0)
	c.lineTo(tileWidth / 2, tileHeight / 2)
	c.lineTo(0, tileHeight)
	c.lineTo(-tileWidth / 2, tileHeight / 2)
	c.closePath()
	c.fillStyle = color
	c.fill()
	c.restore()
}

const drawImageTile = (c, x, y, i, j) => {
	c.save()
	c.translate((y - x) * tileWidth / 2, (x + y) * tileHeight / 2)
	j *= 130
	i *= 230
	c.drawImage(texture, j, i, 130, 230, -65, -130, 130, 230)
	c.restore()
}

const eventXY = e => {
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

const viz = (e) => {
	if (isPlacing)
		click(e)
	const pos = getPosition(e)
	cf.clearRect(-w, -h, w * 2, h * 2)
	if (pos.x >= 0 && pos.x < ntiles && pos.y >= 0 && pos.y < ntiles)
		drawTile(cf, pos.x, pos.y, 'rgba(0,0,0,0.2)')
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
else boot()
