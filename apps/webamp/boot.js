/*
 * Webamp — GifOS shell.
 *
 * Vendored Webamp (MIT) plays locally from File/Blob tracks. Library bytes,
 * EQ, playlist order, layout and a dropped skin persist in gifos.db.
 * Invite shares playlist titles and the graphic EQ (net.js).
 */
(function (root) {
  'use strict';

  var BANDS = ['preamp', 60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
  var AUDIO_RE = /\.(mp3|ogg|wav|flac|m4a|aac|opus)$/i;
  var SKIN_RE = /\.(wsz|zip|wal)$/i;

  var webamp = null;
  var saving = false;
  var applyingSkin = false;
  var applyingEq = false;
  var lastSer = '';
  var lastList = '';
  var saveTimer = 0;
  var blobs = {}; // libId -> Blob
  var applyingRemoteList = false;
  var netReady = false;
  var lastEqStr = '';

  function $(id) { return document.getElementById(id); }

  function db(name) {
    if (!root.gifos || !root.gifos.db) return null;
    try { return root.gifos.db(name); } catch (e) { return null; }
  }

  function asU8(b) {
    if (!b) return null;
    if (b instanceof Uint8Array) return b;
    if (b instanceof ArrayBuffer) return new Uint8Array(b);
    if (Array.isArray(b)) return new Uint8Array(b);
    if (b.buffer && typeof b.byteLength === 'number') {
      return new Uint8Array(b.buffer, b.byteOffset || 0, b.byteLength);
    }
    return null;
  }

  function toast(msg) {
    if (root.Touch && root.Touch.toast) root.Touch.toast(msg);
  }

  function isAudio(file) {
    var n = file && file.name || '';
    if (AUDIO_RE.test(n)) return true;
    return !!(file && file.type && file.type.indexOf('audio/') === 0);
  }
  function isSkin(file) {
    return SKIN_RE.test((file && file.name) || '');
  }

  function eqFromState(state) {
    var eq = state && state.equalizer;
    if (!eq) return null;
    return { on: !!eq.on, auto: !!eq.auto, sliders: eq.sliders || {} };
  }

  function applyEq(eq) {
    if (!webamp || !eq || !webamp.store) return;
    applyingEq = true;
    try {
      var sl = eq.sliders || {};
      BANDS.forEach(function (b) {
        var v = sl[b];
        if (v == null) v = sl[String(b)];
        if (typeof v === 'number') {
          webamp.store.dispatch({ type: 'SET_BAND_VALUE', band: b, value: v });
        }
      });
      webamp.store.dispatch({ type: eq.on === false ? 'SET_EQ_OFF' : 'SET_EQ_ON' });
      webamp.store.dispatch({ type: 'SET_EQ_AUTO', value: !!eq.auto });
    } finally {
      setTimeout(function () { applyingEq = false; }, 600);
    }
  }

  function playlistMeta() {
    if (!webamp || !webamp.getPlaylistTracks) return [];
    return webamp.getPlaylistTracks().map(function (t) {
      return {
        title: t.title || t.defaultName || 'Track',
        artist: t.artist || '',
        duration: t.duration == null ? null : t.duration,
        name: t.defaultName || ''
      };
    });
  }

  function nowPlaying() {
    var list = webamp && webamp.getPlaylistTracks ? webamp.getPlaylistTracks() : [];
    var status = webamp && webamp.getMediaStatus ? webamp.getMediaStatus() : 'STOPPED';
    var cur = null;
    if (webamp && webamp.store) {
      try {
        var st = webamp.store.getState();
        var id = st.playlist && st.playlist.currentTrack;
        if (id != null && st.tracks && st.tracks[id]) {
          var t = st.tracks[id];
          cur = { title: t.title || t.defaultName || '', artist: t.artist || '', status: status };
        }
      } catch (e) {}
    }
    if (!cur && list[0]) cur = { title: list[0].title || list[0].defaultName || '', artist: list[0].artist || '', status: status };
    return cur;
  }

  function publishRoom() {
    if (!root.Net || !root.Net.live()) return;
    if (applyingEq || applyingRemoteList) return;
    root.Net.publish({
      tracks: playlistMeta(),
      eq: webamp && webamp.store ? eqFromState(webamp.store.getState()) : null,
      now: nowPlaying()
    });
  }

  function persistSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }

  function persist() {
    if (!webamp || saving) return;
    var prefs = db('prefs');
    if (!prefs) return;
    var ser = null;
    try { ser = webamp.__getSerializedState(); } catch (e) { ser = null; }
    if (ser && ser.display) {
      // marquee ticks every frame — do not write that
      delete ser.display.marqueeStep;
      delete ser.display.skinImages;
      delete ser.display.skinCursors;
      delete ser.display.skinRegion;
      delete ser.display.skinGenLetterWidths;
      delete ser.display.skinColors;
      delete ser.display.skinPlaylistStyle;
    }
    var list = [];
    try {
      var st = webamp.store.getState();
      var order = (st.playlist && st.playlist.trackOrder) || [];
      var tracks = st.tracks || {};
      order.forEach(function (id) {
        var t = tracks[id];
        if (!t) return;
        list.push({
          libId: t._libId || null,
          title: t.title || '',
          artist: t.artist || '',
          duration: t.duration,
          name: t.defaultName || ''
        });
      });
    } catch (e) {}
    var serStr = JSON.stringify(ser);
    var listStr = JSON.stringify(list);
    if (serStr !== lastSer || listStr !== lastList) {
      lastSer = serStr;
      lastList = listStr;
      saving = true;
      prefs.put({ id: 'prefs', ser: ser, list: list, at: Date.now() }).then(function () {
        saving = false;
      }).catch(function () { saving = false; });
    }
    if (!netReady) return;
    var owner = root.Net && root.Net.me && root.Net.me().owner;
    var eqStr = JSON.stringify(eqFromState(webamp.store && webamp.store.getState()));
    if (!applyingEq && !applyingRemoteList) {
      if (owner) publishRoom();
      else if (lastEqStr && eqStr !== lastEqStr) publishRoom();
    }
    lastEqStr = eqStr;
  }

  function putFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var bytes = new Uint8Array(reader.result);
        var rec = {
          name: file.name || 'track',
          title: file.name || 'track',
          artist: '',
          mime: file.type || 'audio/mpeg',
          bytes: bytes,
          size: bytes.length
        };
        var lib = db('library');
        if (!lib) {
          var blob = new Blob([bytes], { type: rec.mime });
          rec.blob = blob;
          resolve(rec);
          return;
        }
        lib.put(rec).then(function (stored) {
          stored.blob = new Blob([asU8(stored.bytes) || bytes], { type: stored.mime || rec.mime });
          blobs[stored.id] = stored.blob;
          resolve(stored);
        }).catch(reject);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  function filesToTracks(fileList) {
    var files = [];
    for (var i = 0; i < fileList.length; i++) {
      if (isAudio(fileList[i])) files.push(fileList[i]);
    }
    if (!files.length) return Promise.resolve([]);
    return Promise.all(files.map(putFile)).then(function (recs) {
      return recs.map(function (r) {
        return {
          blob: r.blob,
          defaultName: r.name,
          metaData: (r.artist || (r.title && r.title !== r.name))
            ? { artist: r.artist || '', title: r.title || r.name }
            : undefined,
          _libId: r.id
        };
      });
    });
  }

  function stampLibIds() {
    if (!webamp || !webamp.store) return;
    try {
      var st = webamp.store.getState();
      var tracks = st.tracks || {};
      Object.keys(tracks).forEach(function (id) {
        var t = tracks[id];
        if (!t || t._libId) return;
        // match by defaultName against known blobs' records later via playlist persist names
      });
    } catch (e) {}
  }

  function applySkinFile(file) {
    if (!file || !webamp) return;
    var node = document.getElementById('webamp');
    if (!node || typeof DataTransfer === 'undefined') return;
    applyingSkin = true;
    try {
      var dt = new DataTransfer();
      dt.items.add(file);
      node.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    } catch (e) {
      toast('Could not apply that skin.');
    } finally {
      setTimeout(function () { applyingSkin = false; }, 50);
    }
  }

  function saveSkin(file) {
    var skins = db('skins');
    if (!skins) {
      applySkinFile(file);
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var bytes = new Uint8Array(reader.result);
      skins.put({ id: 'skin', name: file.name || 'skin.wsz', bytes: bytes }).catch(function () {});
      applySkinFile(file);
    };
    reader.readAsArrayBuffer(file);
  }

  function restoreSkin(rec) {
    var u8 = asU8(rec && rec.bytes);
    if (!u8) return;
    var file = new File([u8], rec.name || 'skin.wsz', { type: 'application/zip' });
    applySkinFile(file);
  }

  function handleDrop(e) {
    if (applyingSkin) return null;
    var files = e && e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return null;
    var audio = [];
    var skin = null;
    for (var i = 0; i < files.length; i++) {
      if (isSkin(files[i])) { if (!skin) skin = files[i]; }
      else if (isAudio(files[i])) audio.push(files[i]);
    }
    if (skin) saveSkin(skin);
    if (!audio.length) return null;
    return filesToTracks(audio).then(function (tracks) {
      if (root.Touch) root.Touch.setHint(tracks.length + ' in the library — saved in this file.');
      return tracks;
    });
  }

  function addAudioFiles(fileList) {
    filesToTracks(fileList).then(function (tracks) {
      if (!tracks.length || !webamp) return;
      webamp.appendTracks(tracks);
      if (root.Touch) root.Touch.setHint(tracks.length + ' added — saved in this file.');
      persistSoon();
    }).catch(function () { toast('Could not add those files.'); });
  }

  function paintSetlist(mix, people) {
    var box = $('setlist');
    var ol = $('setlist-ol');
    var room = $('room');
    var n = (people || []).length;
    if (room) {
      room.hidden = n < 1;
      if (n >= 1) room.textContent = (n + 1) + ' in the room';
    }
    var show = n >= 1;
    if (box) box.hidden = !show;
    if (!show || !ol) return;
    var tracks = (mix && mix.tracks) || [];
    var now = mix && mix.now;
    if (!tracks.length) {
      ol.innerHTML = '<li class="empty">Host playlist is empty.</li>';
      return;
    }
    var html = '';
    tracks.forEach(function (t) {
      var label = (t.artist ? t.artist + ' — ' : '') + (t.title || t.name || 'Track');
      var cls = (now && now.title && now.title === t.title) ? ' now' : '';
      html += '<li class="' + cls + '">' + escapeHtml(label) + '</li>';
    });
    ol.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function windowLayout() {
    if (root.Touch && root.Touch.isPhone()) {
      return {
        main: { position: { top: 0, left: 0 } },
        equalizer: { position: { top: 116, left: 0 } },
        playlist: { position: { top: 232, left: 0 }, size: { extraHeight: 6, extraWidth: 0 } }
      };
    }
    return {
      main: { position: { top: 0, left: 0 } },
      equalizer: { position: { top: 116, left: 0 } },
      playlist: { position: { top: 0, left: 275 }, size: { extraHeight: 10, extraWidth: 1 } }
    };
  }

  function loadAll() {
    var lib = db('library');
    var prefs = db('prefs');
    var skins = db('skins');
    var empty = { tracks: [], prefs: null, skin: null };
    var pLib = lib ? lib.getAll() : Promise.resolve([]);
    var pPrefs = prefs ? prefs.get('prefs') : Promise.resolve(null);
    var pSkin = skins ? skins.get('skin') : Promise.resolve(null);
    return Promise.all([pLib, pPrefs, pSkin]).then(function (pair) {
      var recs = pair[0] || [];
      var tracks = [];
      recs.forEach(function (r) {
        var u8 = asU8(r.bytes);
        if (!u8 || !u8.length) return;
        var blob = new Blob([u8], { type: r.mime || 'audio/mpeg' });
        if (r.id) blobs[r.id] = blob;
        var md = (r.artist || (r.title && r.title !== r.name))
          ? { artist: r.artist || '', title: r.title || r.name || 'Track' }
          : undefined;
        tracks.push({
          blob: blob,
          defaultName: r.name || r.title || 'Track',
          metaData: md,
          duration: typeof r.duration === 'number' ? r.duration : undefined,
          _libId: r.id
        });
      });
      var saved = pair[1];
      if (saved && saved.list && saved.list.length && tracks.length) {
        var byId = {};
        var byName = {};
        tracks.forEach(function (t) {
          if (t._libId) byId[t._libId] = t;
          byName[t.defaultName] = t;
        });
        var ordered = [];
        saved.list.forEach(function (row) {
          var t = (row.libId && byId[row.libId]) || byName[row.name];
          if (t) ordered.push(t);
        });
        if (ordered.length) tracks = ordered;
      }
      return { tracks: tracks, prefs: saved, skin: pair[2] };
    }).catch(function () { return empty; });
  }

  function bindWebamp(opts) {
    var W = root.Webamp;
    if (!W || !W.browserIsSupported()) {
      var fail = $('fail');
      if (fail) fail.hidden = false;
      return null;
    }
    var player = new W({
      initialTracks: opts.tracks,
      windowLayout: windowLayout(),
      enableHotkeys: true,
      enableMediaSession: true,
      zIndex: 5,
      handleTrackDropEvent: handleDrop,
      handleAddUrlEvent: function () {
        toast('This copy plays files you drop — nothing is fetched.');
        return [];
      },
      handleLoadListEvent: function () {
        return Promise.resolve(opts.tracks || []);
      },
      handleSaveListEvent: function () { persistSoon(); },
      filePickers: [
        {
          contextMenuName: 'Files on this device...',
          requiresNetwork: false,
          filePicker: function () {
            return new Promise(function (resolve) {
              var input = $('pick-mp3');
              if (!input) { resolve([]); return; }
              input.value = '';
              input.onchange = function () {
                var files = input.files;
                input.value = '';
                if (!files || !files.length) { resolve([]); return; }
                filesToTracks(files).then(resolve).catch(function () { resolve([]); });
              };
              input.click();
            });
          }
        }
      ]
    });
    player.onWillClose(function (cancel) { cancel(); });
    player.onClose(function () {
      if (root.Touch) root.Touch.setClosed(true);
    });
    player.onMinimize(function () {
      if (root.Touch) root.Touch.setClosed(true);
    });
    player.onTrackDidChange(function () { persistSoon(); publishRoom(); });
    return player;
  }

  function afterRender(saved, skin) {
    try { webamp.store.dispatch({ type: 'NETWORK_DISCONNECTED' }); } catch (e) {}
    if (saved && saved.ser) {
      try { webamp.__loadSerializedState(saved.ser); } catch (e) {}
    }
    if (skin) restoreSkin(skin);
    if (webamp.__onStateChange) {
      webamp.__onStateChange(function () {
        if (applyingEq || applyingRemoteList) return;
        persistSoon();
      });
    }
    if (root.Touch) {
      root.Touch.init({
        onAudio: addAudioFiles,
        onSkin: saveSkin,
        onShow: function () {
          try { webamp.reopen(); } catch (e) {}
          if (root.Touch) root.Touch.setClosed(false);
        }
      });
    }
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        var toastEl = $('toast');
        if (toastEl && !toastEl.hidden) { toastEl.hidden = true; return; }
        var sl = $('setlist');
        if (sl && !sl.hidden) { sl.hidden = true; return; }
      });
    }
    if (root.Net) {
      root.Net.onRoster(function (people) {
        paintSetlist(root.Net._lastMix, people);
      });
      root.Net.onMix(function (mix) {
        root.Net._lastMix = mix;
        if (mix && mix.eq && mix.by !== (root.Net.me() && root.Net.me().id)) applyEq(mix.eq);
        paintSetlist(mix, null);
      });
      root.Net.init().then(function (room) {
        netReady = true;
        if (room && room.others > 0 && root.Touch) {
          root.Touch.setHint('Room is live — playlist titles and EQ are shared.');
        }
        if (root.Net.me() && root.Net.me().owner) publishRoom();
      });
    }
    stampLibIds();
    persistSoon();
  }

  function boot() {
    loadAll().then(function (data) {
      webamp = bindWebamp({ tracks: data.tracks });
      if (!webamp) return;
      var node = $('desktop') || document.body;
      var ready = webamp.renderWhenReady(node);
      ready.then(function () {
        afterRender(data.prefs, data.skin);
        if (!data.tracks.length && root.Touch) {
          root.Touch.setHint('Drop MP3s. Playlist and EQ stay in this file.');
        } else if (data.tracks.length && root.Touch) {
          root.Touch.setHint(data.tracks.length + ' in the library — saved in this file.');
        }
      }).catch(function () {
        var fail = $('fail');
        if (fail) {
          fail.hidden = false;
          fail.textContent = 'Webamp failed to open.';
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
