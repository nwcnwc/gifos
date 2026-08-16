/*
 * FPS Simple — what the frames actually cost, ON THE DEVICE.
 *
 * The goal this exists for is "no lag during a ten minute solo game", and that
 * is a claim about a phone. It cannot be checked from here: this phone takes no
 * debugger (CDP opens no socket on its Chrome, flag or no flag) and stable
 * Chrome puts no console lines in logcat. Every frame number gathered on a
 * desktop is a number about a desktop — and worse, gathered under a harness
 * whose requestAnimationFrame is throttled to 1 fps, which is how a whole day's
 * frame measurements turned out to be measurements of the harness.
 *
 * So the game times itself, on the real device, under the browser's own loop,
 * and writes the summary where something outside can read it: its private
 * store, which the dev beacon page then reports. No debugger, no console, no
 * throttled rAF — the same channel that made the load numbers trustworthy.
 *
 * WHAT IT KEEPS, and why it is not simply a list of frame times. Ten minutes at
 * 30 fps is eighteen thousand numbers, and writing that to a database on a
 * phone would itself be the lag it is looking for. So it keeps a HISTOGRAM
 * (which answers "how often is it smooth") and the WORST FEW FRAMES WITH THEIR
 * TIMESTAMPS (which answers "when did it hitch, and was it once or every ten
 * seconds"). A mean would hide exactly the thing being hunted: a stutter is a
 * tail, not an average.
 */
(function (root) {
  'use strict';

  // Buckets in milliseconds. 16 is a smooth frame at 60 Hz, 33 at 30 Hz; past
  // 100 a person says "it stuttered", past 500 they say "it froze".
  var EDGES = [8, 16, 33, 50, 100, 250, 500, 1000];
  var counts = new Array(EDGES.length + 1).fill(0);
  var worst = [];                 // {ms, at} — the tail, which is the point
  var frames = 0, total = 0, started = 0, last = 0;
  var running = false, publishAt = 0;

  function bucket(ms) {
    for (var i = 0; i < EDGES.length; i++) if (ms <= EDGES[i]) return i;
    return EDGES.length;
  }

  // WHERE A TAP ACTUALLY LANDS.
  //
  // Driving this phone means synthesising taps with `adb shell input tap`, and
  // taps aimed dead centre on the Play button do not press it — they reach the
  // canvas underneath instead, which asks for pointer lock. The click cannot be
  // arriving and being ignored: the handler's FIRST line hides the gate, and the
  // gate is still there. So the app records what it was actually handed, and the
  // difference between that and where the button is says whether the harness is
  // aiming wrong or the page is lying about where its button is.
  var lastTap = null, tapCount = 0;
  function watchTaps() {
    ['pointerdown', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        try {
          var t = (e.touches && e.touches[0]) || e;
          var x = Math.round(t.clientX), y = Math.round(t.clientY);
          var go = document.getElementById('gate-go');
          var r = go && go.getBoundingClientRect ? go.getBoundingClientRect() : null;
          var hit = document.elementFromPoint(x, y);
          tapCount++;
          lastTap = {
            ev: ev, x: x, y: y,
            hit: hit ? (hit.tagName + (hit.id ? '#' + hit.id : '')) : null,
            go: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)].join(',') : null,
            vw: root.innerWidth, vh: root.innerHeight, dpr: root.devicePixelRatio || 1,
            vv: root.visualViewport ? Math.round(root.visualViewport.offsetTop) + '/' + (root.visualViewport.scale || 1) : '',
          };
          publish();
        } catch (err) {}
      }, true);   // capture: heard before anything can stop it
    });
  }

  // WHAT THE FRAME CONTAINED, and not only what it cost.
  //
  // A 122 ms frame that drew a street and a 122 ms frame that drew NOTHING are
  // the same number here, and on the moto they turned out to be the second one:
  // the HUD (which is DOM) painted over a black viewport for a whole ten-minute
  // session, and every frame time gathered was a measurement of that. So the
  // log says what the renderer was asked to do as well as how long it took.
  //
  // Counters alone could not settle it, though: 450 draw calls and 3.4M
  // triangles read exactly the same whether they land on a street or on
  // nothing. Reading the PIXELS needs care — after a frame is composited the
  // drawing buffer's contents are undefined, so a naive read from a separate
  // rAF returns black for a perfectly healthy game — which is why the sampler
  // below hangs off a wrapped rAF, in-frame, and why every number here is
  // quoted against the same build on a desktop before it is believed.
  // The lights, said briefly: "dir:1.9x1 amb:0.4 hemi:0.6 sh:2048" — type,
  // intensity, and whether a light that casts has a shadow map behind it.
  function lightInfo(r) {
    try {
      var scene = r.scene || (r.ctx && r.ctx.scene);
      if (!scene || !scene.traverse) return '';
      var out = [], shadowSizes = [];
      scene.traverse(function (o) {
        if (!o || !o.isLight) return;
        var t = (o.type || 'Light').replace('Light', '').slice(0, 4).toLowerCase();
        out.push(t + ':' + (o.intensity != null ? +Number(o.intensity).toFixed(2) : '?')
          + (o.visible === false ? '(hidden)' : ''));
        if (o.castShadow && o.shadow) {
          var m = o.shadow.map;
          shadowSizes.push(m ? (m.width + 'x' + m.height) : 'NOMAP');
        }
      });
      return out.join(' ') + (shadowSizes.length ? ' sh:' + shadowSizes.join(',') : ' sh:none');
    } catch (e) { return 'lightinfo:' + String((e && e.message) || e); }
  }

  // IS THE PICTURE BLACK, OR ONLY THE PHOTOGRAPH OF IT?
  //
  // Every capture from the moto shows a black viewport under a live HUD, and a
  // red-canvas control page proved `adb screenrecord` CAN capture WebGL on this
  // device — but that control was a top-level page, and the game's canvas lives
  // inside a sandboxed iframe. So the two stories are still open: a scene that
  // renders black, or a scene that renders fine and is composited or captured
  // black. They need opposite fixes, and only the pixels can say.
  //
  // Read straight after the engine's own draw call, in the same frame, which is
  // the one moment the drawing buffer is guaranteed to hold this frame's image
  // (after compositing its contents are undefined — that is why this is a wrap
  // and not another rAF). Sampled every couple of seconds: readPixels stalls
  // the pipeline, and this must not become the lag it is looking for.
  var pix = null, pixAt = 0, wrapped = false, rafCalls = 0, trail = [], stages = '';
  var lastEnd = 0, gapSum = 0, gapN = 0, gpuMs = 0;
  // Read one pixel out of each intermediate target. three.js knows each
  // target's type, so readRenderTargetPixels is given a buffer that matches:
  // a half-float target read into a Uint8Array comes back as zeroes, which
  // would frame a WORKING pass as the broken one.
  function stageRead(F, ren) {
    try {
      var r = F.ctx.peek('render'), out = [];
      ['gbuffer', 'hdrRt', 'viewRt', 'ldrRt'].forEach(function (name) {
        var t = r[name];
        var target = t && (t.isWebGLRenderTarget ? t : (t.rt || t.target || null));
        if (!target || !target.texture) return;
        var tex = target.texture.isTexture ? target.texture : (target.texture[0] || {});
        var half = (tex.type === 1016 || tex.type === 1015);
        var buf = half ? new Float32Array(4) : new Uint8Array(4);
        var x = target.width >> 1, y = target.height >> 1;
        try {
          ren.readRenderTargetPixels(target, x, y, 1, 1, buf);
          var v = Math.max(buf[0], buf[1], buf[2]);
          out.push(name + '=' + (half ? (+v.toFixed(3)) : v));
        } catch (e) { out.push(name + '=x'); }
      });
      return out.join(' ');
    } catch (e) { return 'stages:' + String((e && e.message) || e); }
  }
  // Sampled from a wrapped requestAnimationFrame rather than a wrapped
  // renderer.render: patching the renderer instance sampled NOTHING, on the
  // phone AND on a desktop where the street is plainly visible, so the engine
  // does not reach its draw through that property. Wrapping rAF puts this
  // immediately after whatever the engine did in the frame — draw included —
  // and still before the compositor takes the buffer.
  function wrapRAF() {
    if (wrapped || typeof root.requestAnimationFrame !== 'function') return;
    wrapped = true;
    var orig = root.requestAnimationFrame.bind(root);
    root.requestAnimationFrame = function (cb) {
      return orig(function (t) {
        // The gap between this frame's callback ENDING and the next one
        // STARTING is everything the page does that no JS timer can see:
        // style, layout, paint, compositing, and waiting for the GPU. With JS
        // at 40 ms in a 145 ms frame, that gap is the whole remaining question.
        var _now = (root.performance ? performance.now() : Date.now());
        if (lastEnd) { gapSum += _now - lastEnd; gapN++; }   // one clock, not two
        try { cb(t); } finally { rafCalls++; sample(); lastEnd = (root.performance ? performance.now() : Date.now()); }
      });
    };
  }
  function sample() {
    try {
      var now = (root.performance ? performance.now() : Date.now());
      if (now < pixAt) return;
      var F = root.__FPS__;
      if (!F || !F.ctx || !F.ctx.peek) return;
      var r = F.ctx.peek('render');
      var ren = r && r.renderer;
      if (!ren || !ren.getContext) return;
      var gl = ren.getContext();
      if (!gl) return;
      pixAt = now + 2000;
      // How much GPU work is still outstanding when the frame's JS is done?
      // gl.finish() returns only once the driver has drained it, so the time it
      // takes IS the wait. Sampled rarely — it is a full pipeline stall, and a
      // measurement that changes the thing it measures has to stay rare.
      var f0 = (root.performance ? performance.now() : Date.now());
      try { gl.finish(); } catch (e) {}
      gpuMs = (root.performance ? performance.now() : Date.now()) - f0;
      var tgt = ren.getRenderTarget ? ren.getRenderTarget() : null;
      var w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      var pts = [[w >> 1, h >> 1], [w >> 2, h >> 2], [w >> 1, (h >> 2) * 3], [(w >> 2) * 3, h >> 1]];
      var buf = new Uint8Array(4), max = 0, sum = 0;
      for (var i = 0; i < pts.length; i++) {
        gl.readPixels(pts[i][0], pts[i][1], 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        var v = Math.max(buf[0], buf[1], buf[2]);
        if (v > max) max = v;
        sum += (buf[0] + buf[1] + buf[2]) / 3;
      }
      var q = F.ctx.config && F.ctx.config.q;
      var sc = q && q.renderScale != null ? +Number(q.renderScale).toFixed(2) : null;
      // WHEN it went dark, against WHAT THE SCALER WAS DOING. The adaptive
      // scaler bang-bangs down to its 0.18 floor, and if the picture is bright
      // at 0.5 and black at 0.18 then the floor is the bug rather than the
      // driver. A single end-of-session number cannot tell those apart.
      trail.push(sc + ':' + max);
      if (trail.length > 10) trail.shift();
      // BISECT THE CHAIN. Geometry -> gbuffer -> hdrRt -> ldrRt -> screen. The
      // screen is black while every target is framebuffer-complete, so read the
      // targets themselves: whichever one is the FIRST to be black is the pass
      // that failed, and everything upstream of it is working.
      stages = stageRead(F, ren);
      pix = { max: max, mean: Math.round(sum / pts.length), n: (pix && pix.n || 0) + 1,
              tgt: tgt ? 'bound' : 'screen', raf: rafCalls, scale: sc,
              gpu: +gpuMs.toFixed(1), gap: gapN ? +(gapSum / gapN).toFixed(1) : null,
              first: (pix && pix.first) || (max + '@' + sc), trail: trail.join(' '),
              stages: stages };
    } catch (e) { pix = { err: String((e && e.message) || e), raf: rafCalls }; }
  }

  // THE TARGETS THE PICTURE IS SUPPOSED TO ARRIVE IN.
  // Asked once and remembered: binding framebuffers to interrogate them is not
  // something to do every publish.
  var rtCache = null;
  function rtInfo(r, ren) {
    if (rtCache) return rtCache;
    try {
      var gl = ren.getContext();
      var ext = function (n) { return gl.getExtension(n) ? 1 : 0; };
      var parts = ['cbf:' + ext('EXT_color_buffer_float'),
                   'cbhf:' + ext('EXT_color_buffer_half_float'),
                   'tfl:' + ext('OES_texture_float_linear')];
      ['hdrRt', 'viewRt', 'ldrRt', 'pingRt', 'gbuffer'].forEach(function (name) {
        var t = r[name];
        if (!t) return;
        var target = t.isWebGLRenderTarget ? t : (t.rt || t.target || null);
        if (!target || !target.texture) { parts.push(name + ':?'); return; }
        var tex = target.texture.isTexture ? target.texture : (target.texture[0] || {});
        var prev = ren.getRenderTarget();
        var status = '';
        try {
          ren.setRenderTarget(target);
          var st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
          status = (st === gl.FRAMEBUFFER_COMPLETE) ? 'ok' : ('ERR' + st);
        } catch (e) { status = 'x'; } finally { try { ren.setRenderTarget(prev); } catch (e) {} }
        parts.push(name + ':' + target.width + 'x' + target.height + ' type' + tex.type + ' fmt' + tex.format + ' ' + status);
      });
      rtCache = parts.join(' | ');
    } catch (e) { rtCache = 'rtinfo:' + String((e && e.message) || e); }
    return rtCache;
  }

  // WHERE THE FRAME WENT, in milliseconds, averaged over the window since the
  // last publish and then reset — a running total since boot would be dominated
  // by the first seconds forever. Written by the engine's step(), which is
  // patched to keep it (see vendor.mjs).
  function phaseMs(F) {
    try {
      var P = F.ctx && F.ctx.__phase;
      if (!P || !P.n) return '';
      var n = P.n;
      var out = 'fixed:' + (P.fixed / n).toFixed(1) + ' update:' + (P.update / n).toFixed(1)
        + ' late:' + (P.late / n).toFixed(1) + ' render:' + (P.render / n).toFixed(1)
        + ' substeps:' + (P.steps / n).toFixed(2) + ' over:' + n;
      P.fixed = P.update = P.late = P.render = P.steps = P.n = 0;
      return out;
    } catch (e) { return 'phase:' + String((e && e.message) || e); }
  }

  function renderStats() {
    try {
      var F = root.__FPS__;
      if (!F || !F.ctx || !F.ctx.peek) return null;
      var r = F.ctx.peek('render');
      if (!r || !r.renderer) return null;
      var ren = r.renderer;
      var info = ren.info && ren.info.render;
      var gl = ren.getContext ? ren.getContext() : null;
      var cv = ren.domElement || document.getElementById('game');
      // A render target still bound when the frame is over means the last pass
      // went somewhere other than the screen — which looks exactly like this.
      var rt = ren.getRenderTarget ? ren.getRenderTarget() : undefined;
      var q = F.ctx.config && F.ctx.config.q;
      return {
        calls: info ? info.calls : null,
        tris: info ? info.triangles : null,
        scale: q && q.renderScale != null ? +Number(q.renderScale).toFixed(3) : null,
        buf: cv ? (cv.width + 'x' + cv.height) : '',
        css: cv ? (cv.clientWidth + 'x' + cv.clientHeight) : '',
        lost: gl ? !!gl.isContextLost() : null,
        glerr: gl ? gl.getError() : null,
        target: rt === undefined ? 'n/a' : (rt ? ((rt.width || '?') + 'x' + (rt.height || '?')) : 'null'),
        eframe: F.engine && F.engine.time ? F.engine.time.frame : null,
        // WHY THE STREET IS BLACK ON THE PHONE AND SUNLIT EVERYWHERE ELSE.
        // Counters say the frame is healthy — 449 calls, 3.4M triangles,
        // straight to the default framebuffer, no GL error, textures baked
        // fresh this session — and the screen is still black. A scene that
        // draws everything and shows nothing is lighting: no lights, no
        // exposure, or a shadow map that failed to allocate and left every
        // surface fully shadowed. So report the lighting, not more counters.
        progs: (ren.info && ren.info.programs) ? ren.info.programs.length : null,
        badprogs: (ren.info && ren.info.programs || []).filter(function (p) {
          return p && p.diagnostics && p.diagnostics.runnable === false;
        }).length,
        shadow: ren.shadowMap ? ((ren.shadowMap.enabled ? 'on' : 'off') + '/' + ren.shadowMap.type) : 'n/a',
        tone: ren.toneMapping + '@' + (ren.toneMappingExposure != null ? ren.toneMappingExposure : '?'),
        cs: ren.outputColorSpace || ren.outputEncoding || '',
        phase: phaseMs(F),
        lights: lightInfo(r),
        pix: pix,
        // WHAT THE RENDER SYSTEM IS MADE OF. The geometry all draws and the
        // default framebuffer stays black, which is what an offscreen pass
        // whose final blit to the screen never lands looks like. So say whether
        // there IS such a pass, and whether anything is bound at the raw GL
        // level that three.js does not think is bound.
        sysKeys: Object.keys(r).join(',').slice(0, 220),
        fb: (function () { try { var g = ren.getContext(); return g.getParameter(g.FRAMEBUFFER_BINDING) ? 'bound' : 'default'; } catch (e) { return '?'; } })(),
        rt: rtInfo(r, ren),
        caps: (function () { try { var c = ren.capabilities || {}; return (c.isWebGL2 ? 'gl2' : 'gl1') + ' prec:' + c.precision + ' maxTex:' + c.maxTextures + ' float:' + !!c.floatFragmentTextures; } catch (e) { return '?'; } })(),
      };
    } catch (e) { return { probe: String((e && e.message) || e) }; }
  }

  function summary() {
    var lines = [], prev = 0;
    for (var i = 0; i < counts.length; i++) {
      if (!counts[i]) { prev = EDGES[i] || prev; continue; }
      var label = (i < EDGES.length) ? ('<=' + EDGES[i]) : ('>' + EDGES[EDGES.length - 1]);
      lines.push(label + ':' + counts[i]);
    }
    void prev;
    return {
      id: 'frames',
      at: Date.now(),
      seconds: Math.round((last - started) / 1000),
      frames: frames,
      mean: frames ? Math.round(total / frames) : 0,
      hist: lines.join(' '),
      // Sorted worst-first, with WHEN — a hitch at t=2s is a shader compiling,
      // the same hitch at t=2s, 12s, 22s is something with a period.
      worst: worst.map(function (w) { return w.ms + 'ms@' + Math.round(w.at / 1000) + 's'; }).join(' '),
      render: renderStats(),
      tap: lastTap,
      taps: tapCount,
    };
  }

  function publish() {
    if (!root.gifos || !root.gifos.db) return;
    try { root.gifos.db('perf').put(summary()).catch(function () {}); } catch (e) {}
  }

  function tick(now) {
    if (!running) return;
    if (last) {
      var ms = now - last;
      // A tab that was backgrounded reports one enormous "frame" on return.
      // That is not a stutter, it is arithmetic, and counting it would make
      // every session look broken.
      if (ms < 5000) {
        frames++; total += ms;
        counts[bucket(ms)]++;
        if (ms > 100) {
          worst.push({ ms: Math.round(ms), at: now - started });
          worst.sort(function (a, b) { return b.ms - a.ms; });
          if (worst.length > 12) worst.length = 12;
        }
      }
    } else { started = now; }
    last = now;
    // Every 10 s: often enough to survive the tab being closed mid-session,
    // rare enough that the write is never the thing being measured.
    if (now > publishAt) { publishAt = now + 10000; publish(); }
    root.requestAnimationFrame(tick);
  }

  /** Start counting. Called when the player actually enters the game. */
  function start() {
    if (running) return;
    running = true;
    publishAt = (root.performance ? performance.now() : 0) + 10000;
    root.requestAnimationFrame(tick);
  }

  // SELF-STARTING, so nothing else has to know this exists. The gate element is
  // removed when the player presses Play, which is exactly the moment gameplay
  // begins — no hook in boot.js, no coupling, and nothing to remember to call.
  // AUTOSTART, and why a measurement module is allowed to press Play.
  //
  // The goal is a claim about ten minutes of play on a phone, and the phone
  // cannot be driven: it takes no debugger, and `adb shell input` behaves as a
  // LONG PRESS here — it selects words and opens Chrome's touch-to-search, but
  // it does not produce a click, so the Play button cannot be pressed from
  // outside. Every frame number in this file was therefore unreachable on the
  // one device the goal is about.
  //
  // So the flag lives in the app's OWN prefs, which only something with store
  // access — the desktop, i.e. the owner of the device — can write. It is off
  // unless deliberately set. What it costs is honest: a scripted click is not a
  // user gesture, so pointer lock is refused and audio stays suspended. On a
  // phone that is no loss (aiming is the touch stick, and nothing here measures
  // sound), but it does mean an autostarted session is a measurement session
  // and not a portrait of a person playing.
  function armAutostart() {
    var tries = 0;
    var t = setInterval(function () {
      var go = document.getElementById('gate-go');
      if (!go) { clearInterval(t); return; }        // gate already gone
      if (!go.disabled) { clearInterval(t); try { go.click(); } catch (e) {} return; }
      if (++tries > 2400) clearInterval(t);         // ten minutes, then give up
    }, 250);
  }
  (function maybeAutostart(n) {
    if (root.gifos && root.gifos.db) {
      try {
        root.gifos.db('prefs').get('settings').then(function (rec) {
          if (rec && rec.autostart) armAutostart();
          // PRICING THE HUD. JS is 46 ms and the GPU is idle in a 146 ms frame,
          // so ~100 ms is the browser between frames — and the HUD is DOM,
          // restyled and repainted every frame on a phone. Hiding it is the
          // cheapest way to find out whether that is where the frame goes.
          if (rec && rec.nohud) {
            var hide = setInterval(function () {
              var ui = document.getElementById('ui');
              if (ui) { ui.style.display = 'none'; clearInterval(hide); }
            }, 250);
          }
        }).catch(function () {});
      } catch (e) {}
      return;
    }
    if (n > 60) return;
    setTimeout(function () { maybeAutostart(n + 1); }, 250);
  })(0);

  wrapRAF();
  watchTaps();      // before the gate clears — the tap that misses is the point
  // HEARTBEAT. Without one, "framelog never published" and "no tap ever
  // reached this document" are the same silence, and I have now spent an hour
  // telling them apart the slow way. gifos.db is not up at parse time, so the
  // first beat waits for it rather than dropping on the floor.
  (function beat(n) {
    if (root.gifos && root.gifos.db) { publish(); return; }
    if (n > 60) return;
    setTimeout(function () { beat(n + 1); }, 250);
  })(0);
  var watch = setInterval(function () {
    try {
      if (!document.getElementById('gate') && root.__FPS__) { clearInterval(watch); start(); }
    } catch (e) { clearInterval(watch); }
  }, 500);

  root.FrameLog = {
    start: start,
    publish: publish,
    stats: summary,
    reset: function () {
      counts = new Array(EDGES.length + 1).fill(0);
      worst = []; frames = 0; total = 0; started = 0; last = 0;
    },
  };
})(window);
