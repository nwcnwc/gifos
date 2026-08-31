window.Loader = {};

Loader.manifest = {};
Loader.manifestPreload = {};
Loader.sounds = {};

// Opaque-origin srcdoc + WebGL kills the renderer. autoDetectRenderer copies
// isWebGLSupported at load, so replacing the utils function is not enough —
// force the 4th Application argument (noWebGL) and the canvas renderer.
if (window.PIXI) {
	if (PIXI.utils) PIXI.utils.isWebGLSupported = function () { return false; };
	if (PIXI.autoDetectRenderer && PIXI.CanvasRenderer) {
		PIXI.autoDetectRenderer = function (w, h, opts) {
			return new PIXI.CanvasRenderer(w, h, opts);
		};
	}
	if (PIXI.Application) {
		var _PixiApp = PIXI.Application;
		PIXI.Application = function (w, h, opts) {
			return new _PixiApp(w, h, opts, true);
		};
		PIXI.Application.prototype = _PixiApp.prototype;
	}
}

function _trustHit(src) {
	return (window.TRUST && TRUST.lookup) ? TRUST.lookup(src) : null;
}

function _trustText(hit) {
	if (!hit) return '';
	if (hit.html != null) return String(hit.html);
	var buf = hit.bytes;
	if (!buf) return '';
	var u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
	if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) u8 = u8.subarray(3);
	if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u8);
	var s = '', i;
	for (i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
	return s;
}

function _blobUrl(src) {
	var hit = _trustHit(src);
	return hit && hit.blob ? hit.blob : null;
}

function _ensurePixiResources() {
	if (!window.PIXI || !PIXI.loader) return {};
	return PIXI.loader.resources;
}

function _putResource(key, rec) {
	var res = _ensurePixiResources();
	res[key] = rec;
}

function _textureCache() {
	if (PIXI.utils && PIXI.utils.TextureCache) return PIXI.utils.TextureCache;
	if (PIXI.TextureCache) return PIXI.TextureCache;
	return {};
}

function _cacheSheetTextures(sheet) {
	var cache = _textureCache();
	var t = sheet && sheet.textures;
	var name;
	if (!t) return;
	for (name in t) {
		if (Object.prototype.hasOwnProperty.call(t, name)) {
			cache[name] = t[name];
			if (PIXI.Texture && PIXI.Texture.addToCache) {
				try { PIXI.Texture.addToCache(t[name], name); } catch (e) {}
			}
		}
	}
}

function _loadImageFile(key, src, done) {
	var url = _blobUrl(src);
	if (!url) { done(); return; }
	var img = new Image();
	var finished = false;
	var finish = function (ok) {
		if (finished) return;
		finished = true;
		if (ok) {
			var tex = null;
			try {
				if (PIXI.Texture.fromLoader) tex = PIXI.Texture.fromLoader(img, url, key);
				else tex = new PIXI.Texture(new PIXI.BaseTexture(img));
			} catch (e) {
				try { tex = new PIXI.Texture(new PIXI.BaseTexture(img)); } catch (e2) {}
			}
			_putResource(key, {
				name: key, url: url, data: img, texture: tex, isComplete: true
			});
		}
		done();
	};
	img.onload = function () { finish(true); };
	img.onerror = function () { finish(false); };
	setTimeout(function () { finish(false); }, 4000);
	img.src = url;
}

function _loadSpritesheet(key, src, done) {
	var jsonHit = _trustHit(src);
	if (!jsonHit) { done(); return; }
	var data;
	try { data = JSON.parse(_trustText(jsonHit)); } catch (e) { done(); return; }
	var imgName = data && data.meta && data.meta.image;
	var dir = String(src).replace(/[^/]+$/, '');
	var imgSrc = imgName ? (dir + imgName) : '';
	var imgHit = _trustHit(imgSrc) || _trustHit(imgName);
	var imgUrl = imgHit && imgHit.blob ? imgHit.blob : null;
	if (!imgUrl) { done(); return; }

	var img = new Image();
	var finished = false;
	var finish = function (ok) {
		if (finished) return;
		finished = true;
		if (!ok) { done(); return; }
		try {
			var base = new PIXI.BaseTexture(img);
			var Sheet = PIXI.Spritesheet || (PIXI.extras && PIXI.extras.Spritesheet);
			if (!Sheet) { done(); return; }
			var sheet = new Sheet(base, data, imgUrl);
			sheet.parse(function () {
				_cacheSheetTextures(sheet);
				_putResource(key, {
					name: key,
					url: imgUrl,
					data: data,
					texture: new PIXI.Texture(base),
					spritesheet: sheet,
					textures: sheet.textures,
					isComplete: true
				});
				done();
			});
		} catch (e) { done(); }
	};
	img.onload = function () { finish(true); };
	img.onerror = function () { finish(false); };
	setTimeout(function () { finish(false); }, 4000);
	img.src = imgUrl;
}

function _loadSound(key, src, done) {
	var hit = _trustHit(src);
	var url = hit && hit.blob ? hit.blob : null;
	if (!url) { done(); return; }
	var ext = /\.wav(\?|$)/i.test(src) ? 'wav' : 'mp3';
	var sound;
	try {
		sound = new Howl({ src: [url], format: [ext] });
	} catch (e) { done(); return; }
	Loader.sounds[key] = sound;
	var finished = false;
	var finish = function () {
		if (finished) return;
		finished = true;
		done();
	};
	if (sound.state && sound.state() === 'loaded') { finish(); return; }
	sound.once('load', finish);
	sound.once('loaderror', finish);
	setTimeout(finish, 8000);
}

Loader.loadAssets = function(manifest, completeCallback, progressCallback){

	var deferred = Q.defer();
	completeCallback = completeCallback || function(){};
	progressCallback = progressCallback || function(){};

	var items = [];
	for (var key in manifest) {
		if (Object.prototype.hasOwnProperty.call(manifest, key)) {
			items.push({ key: key, src: manifest[key] });
		}
	}

	if (!items.length) {
		completeCallback();
		deferred.resolve();
		return deferred.promise;
	}

	var total = items.length;
	var loaded = 0;
	var _onOne = function(){
		loaded++;
		if (progressCallback) progressCallback(loaded / total);
		if (loaded >= total) {
			completeCallback();
			deferred.resolve();
		}
	};

	for (var i = 0; i < items.length; i++) {
		(function (item) {
			var src = item.src;
			if (/\.(mp3|wav)(\?|$)/i.test(src)) _loadSound(item.key, src, _onOne);
			else if (/\.json(\?|$)/i.test(src)) _loadSpritesheet(item.key, src, _onOne);
			else _loadImageFile(item.key, src, _onOne);
		})(items[i]);
	}

	return deferred.promise;
};

Loader.addToManifest = function(manifest, keyValues){
	for(var key in keyValues){
		manifest[key] = keyValues[key];
	}
};
