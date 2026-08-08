// The playback engine and the on-screen player. One engine drives both the
// screen (looping, like the TV loop the desktop app's MP4s relied on) and the
// exporter (one cycle into a MediaRecorder). Frames are drawn live from the
// plan - a visual state changes a few times a minute, so drawing only on
// state change costs nothing.
(function () {
  const SIO = (window.SIO = window.SIO || {});

  // Master the output the way the desktop encoder does with loudnorm: the
  // clips are already levelled individually (voice.js loud(), RMS 0.09 ≈
  // -21 dBFS), and streaming loudness sits around -14 LUFS, so one static
  // gain closes the gap and a hard limiter catches the peaks (TP -1 dB).
  // Before this the videos were a sixteen-decibel apology delivered through
  // every family's volume button.
  const MASTER_GAIN = 2.2;
  function masterChain(ctx, dest) {
    const gain = ctx.createGain();
    gain.gain.value = MASTER_GAIN;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    gain.connect(limiter);
    limiter.connect(dest);
    return gain; // sources connect here
  }

  // plan -> per-entry start offsets within one cycle.
  function cueTimes(plan) {
    const cues = [];
    let t = 0;
    for (const e of plan.entries) { cues.push(t); t += e.duration; }
    return cues;
  }

  // Schedule one cycle's audio. Returns the created sources (for stop()).
  function scheduleCycle(ctx, dest, plan, cycleStart) {
    const sources = [];
    let t = cycleStart;
    for (const e of plan.entries) {
      if (e.buffer) {
        const src = ctx.createBufferSource();
        src.buffer = e.buffer;
        src.connect(dest);
        src.start(t);
        sources.push(src);
      }
      t += e.duration;
    }
    return sources;
  }

  // Drive a plan against an AudioContext clock, drawing into `draw(seg)`.
  //   opts: { ctx, dest, loop, onCycle, onDone }
  function Engine(plan, opts) {
    this.plan = plan;
    this.ctx = opts.ctx;
    this.dest = opts.dest;
    this.loop = !!opts.loop;
    this.draw = opts.draw;
    this.onDone = opts.onDone || null;
    this.cues = cueTimes(plan);
    this.sources = [];
    this.raf = 0;
    this.cycleStart = 0;
    this.nextScheduled = false;
    this.lastIndex = -1;
    this.stopped = false;
  }

  Engine.prototype.start = function () {
    const now = this.ctx.currentTime;
    this.cycleStart = now + 0.15;
    this.sources = scheduleCycle(this.ctx, this.dest, this.plan, this.cycleStart);
    const tick = () => {
      if (this.stopped) return;
      const t = this.ctx.currentTime - this.cycleStart;
      if (t >= this.plan.duration) {
        if (this.loop) {
          // the next cycle was scheduled below; roll the clock forward
          this.cycleStart += this.plan.duration;
          this.nextScheduled = false;
          this.lastIndex = -1;
        } else {
          this.stop();
          if (this.onDone) this.onDone();
          return;
        }
      } else if (this.loop && !this.nextScheduled && t > this.plan.duration - 1.5) {
        this.sources = this.sources.concat(
          scheduleCycle(this.ctx, this.dest, this.plan, this.cycleStart + this.plan.duration));
        this.nextScheduled = true;
      }
      const idx = this.indexAt(Math.max(0, this.ctx.currentTime - this.cycleStart));
      if (idx !== this.lastIndex && idx < this.plan.entries.length) {
        this.lastIndex = idx;
        this.draw(this.plan.entries[idx].seg);
      }
      this.raf = requestAnimationFrame(tick);
    };
    // paint the first frame immediately, before audio starts
    if (this.plan.entries.length) this.draw(this.plan.entries[0].seg);
    this.raf = requestAnimationFrame(tick);
  };

  Engine.prototype.indexAt = function (t) {
    // linear scan from the last known index - entries advance monotonically
    let i = Math.max(0, this.lastIndex);
    if (this.cues[i] > t) i = 0;
    while (i + 1 < this.cues.length && this.cues[i + 1] <= t) i += 1;
    return i;
  };

  Engine.prototype.stop = function () {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    for (const s of this.sources) { try { s.stop(); } catch (e) { /* already ended */ } }
    this.sources = [];
  };

  // ---- the on-screen player -------------------------------------------------
  // A takeover overlay, not the Fullscreen API: the sandboxed app frame has no
  // fullscreen permission, and GifOS itself can be fullscreened around us. The
  // canvas letterboxes at 16:9 inside whatever window the app has.
  function openPlayer(plan, theme) {
    const dsp = SIO.dsp;
    const F = SIO.frames;

    const wrap = document.createElement('div');
    wrap.className = 'sio-player';
    const canvas = document.createElement('canvas');
    canvas.width = F.W; canvas.height = F.H;
    const exit = document.createElement('button');
    exit.className = 'sio-player-exit';
    exit.textContent = '✕ Stop';
    wrap.appendChild(canvas);
    wrap.appendChild(exit);
    document.body.appendChild(wrap);

    const cctx = canvas.getContext('2d');
    const actx = dsp.audioContext();
    if (actx.state === 'suspended') actx.resume();

    const engine = new Engine(plan, {
      ctx: actx,
      dest: masterChain(actx, actx.destination),
      loop: true,
      draw: (seg) => F.drawFrame(cctx, seg, theme),
    });
    engine.start();

    let hideTimer = 0;
    const showExit = () => {
      exit.classList.add('shown');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => exit.classList.remove('shown'), 2500);
    };
    showExit();
    wrap.addEventListener('pointerdown', showExit);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      engine.stop();
      clearTimeout(hideTimer);
      wrap.remove();
      if (SIO.ui && SIO.ui.playerClosed) SIO.ui.playerClosed();
    };
    exit.addEventListener('click', close);
    return { close };
  }

  SIO.player = { Engine, openPlayer, cueTimes, masterChain };
})();
