/* Drop a .glb/.gltf, inspect it. Last model is private. Invite is OS chrome. */
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var saveDb = null;
  var roomDb = null;
  var viewer = null;
  var lastName = '';
  var lastBuf = null;
  var applying = false;
  var saveTimer = 0;

  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}
  try { if (root.gifos && root.gifos.db) roomDb = root.gifos.db('room'); } catch (e) {}

  function showErr(msg) {
    var el = $('err');
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = String(msg);
  }

  function spinner(on) { $('spinner').hidden = !on; }

  function ensureViewer() {
    if (viewer) return viewer;
    $('placeholder').hidden = true;
    $('viewer').hidden = false;
    viewer = new root.GltfViewer($('viewer'), {});
    syncControlsToViewer();
    return viewer;
  }

  function syncControlsToViewer() {
    if (!viewer) return;
    viewer.state.wireframe = $('wireframe').checked;
    viewer.state.grid = $('grid').checked;
    viewer.state.autoRotate = $('autoRotate').checked;
    viewer.state.environment = $('neutral').checked;
    viewer.updateDisplay();
    viewer.updateEnvironment();
  }

  function paintMeta() {
    if (!viewer || !viewer.content) {
      $('meta').textContent = 'No model yet.';
      $('tree').innerHTML = '';
      $('anim-sec').hidden = true;
      return;
    }
    var s = viewer.stats();
    var lines = [lastName || 'model'];
    lines.push(s.meshes + ' mesh' + (s.meshes === 1 ? '' : 'es') + ', ' +
      s.materials + ' material' + (s.materials === 1 ? '' : 's'));
    lines.push(s.triangles + ' triangles, ' + s.vertices + ' vertices');
    if (s.cameras) lines.push(s.cameras + ' camera' + (s.cameras === 1 ? '' : 's'));
    if (s.bones) lines.push(s.bones + ' bones');
    if (s.clips) lines.push(s.clips + ' clip' + (s.clips === 1 ? '' : 's'));
    $('meta').textContent = lines.join('\n');

    var tree = $('tree');
    tree.innerHTML = '';
    viewer.graph().forEach(function (row) {
      var div = document.createElement('div');
      div.className = 'row';
      div.style.paddingLeft = (4 + row.depth * 10) + 'px';
      div.textContent = row.label;
      div.title = row.label;
      div.onclick = function () { viewer.flash(row.uuid); };
      tree.appendChild(div);
    });

    var clips = $('clips');
    clips.innerHTML = '';
    if (!viewer.clips.length) {
      $('anim-sec').hidden = true;
      return;
    }
    $('anim-sec').hidden = false;
    viewer.clips.forEach(function (clip, i) {
      var lab = document.createElement('label');
      var inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.checked = i === 0;
      inp.onchange = function () { viewer.playClip(i, inp.checked); };
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(' ' + (clip.name || ('clip ' + (i + 1)))));
      clips.appendChild(lab);
    });
  }

  function persist() {
    if (applying || !saveDb) return;
    var rec = {
      id: 'last',
      name: lastName || '',
      wireframe: $('wireframe').checked,
      grid: $('grid').checked,
      autoRotate: $('autoRotate').checked,
      neutral: $('neutral').checked
    };
    if (lastBuf && lastBuf.byteLength < 4 * 1024 * 1024) {
      rec.bytes = new Uint8Array(lastBuf);
    }
    saveDb.put(rec).catch(function () {});
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }

  function openBuffer(name, buf, files) {
    spinner(true);
    showErr('');
    var v = ensureViewer();
    return v.loadBytes(name, buf, files).then(function () {
      lastName = name;
      lastBuf = buf;
      paintMeta();
      persist();
      spinner(false);
    }).catch(function (e) {
      spinner(false);
      showErr((e && e.message) || String(e));
    });
  }

  function readFile(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(r.error || new Error('read failed')); };
      r.readAsArrayBuffer(file);
    });
  }

  function loadFileList(list) {
    var files = new Map();
    var jobs = [];
    Array.prototype.forEach.call(list, function (f) {
      jobs.push(readFile(f).then(function (buf) {
        files.set(f.name, buf);
        files.set(f.name.replace(/^.*[\\/]/, ''), buf);
      }));
    });
    return Promise.all(jobs).then(function () {
      var rootFile = null, rootName = '';
      files.forEach(function (buf, name) {
        if (/\.(gltf|glb)$/i.test(name) && !rootFile) {
          rootFile = buf;
          rootName = name;
        }
      });
      if (!rootFile) throw new Error('No .gltf or .glb in that drop.');
      return openBuffer(rootName, rootFile, files);
    });
  }

  function onFiles(dt) {
    var list = dt && dt.files ? dt.files : null;
    if (!list || !list.length) return;
    spinner(true);
    loadFileList(list).catch(function (e) {
      spinner(false);
      showErr((e && e.message) || String(e));
    });
  }

  ['wireframe', 'grid', 'autoRotate', 'neutral'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      syncControlsToViewer();
      scheduleSave();
    });
  });
  $('playAll').addEventListener('click', function () {
    if (viewer) viewer.playAll();
  });
  $('file-input').addEventListener('change', function (e) {
    onFiles(e.target);
    e.target.value = '';
  });

  var drop = $('drop');
  drop.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    onFiles(e.dataTransfer);
  });

  function applySaved(rec) {
    if (!rec) return;
    applying = true;
    $('wireframe').checked = !!rec.wireframe;
    $('grid').checked = !!rec.grid;
    $('autoRotate').checked = !!rec.autoRotate;
    $('neutral').checked = rec.neutral !== false;
    applying = false;
    if (rec.bytes && rec.bytes.byteLength) {
      var buf = rec.bytes.buffer ? rec.bytes.buffer.slice(rec.bytes.byteOffset, rec.bytes.byteOffset + rec.bytes.byteLength) : rec.bytes;
      openBuffer(rec.name || 'saved.glb', buf, new Map());
    }
  }

  if (saveDb && saveDb.get) {
    saveDb.get('last').then(applySaved).catch(function () {});
  }

  if (roomDb && roomDb.subscribe) {
    roomDb.subscribe(function (rows) {
      var n = (rows || []).filter(function (r) { return r && r.id; }).length;
      if (n > 1) {
        $('meet').innerHTML = 'A friend is here. Each of you drops a file on your own device — nothing is uploaded.';
      }
    });
  }
})(typeof window !== 'undefined' ? window : this);
