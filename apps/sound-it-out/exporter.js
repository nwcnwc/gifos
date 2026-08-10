// Save-as-a-file: the plan is performed once, in real time, into a
// MediaRecorder - the canvas stream carries the frames and a WebAudio
// destination stream carries the sound, so nothing is heard while it runs.
//
// This is deliberately NOT the desktop app's ffmpeg MP4 pipeline: the sandbox
// has no ffmpeg and no threads to give it, and a realtime capture of a
// renderer we already trust is the honest browser equivalent. The cost is
// real: a 10 minute video takes 10 minutes to save, with the app left open.
// The output is WebM, which TVs are patchier about than MP4 - the on-screen
// player is the first-choice way to put this on a TV, and the file is for
// USB sticks and sending to relatives.
(function () {
  const SIO = (window.SIO = window.SIO || {});

  function pickMime() {
    const tryList = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
      for (const m of tryList) if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  function supported() {
    return !!(window.MediaRecorder && document.createElement('canvas').captureStream);
  }

  // Perform the plan once and resolve with a Blob. onTick(seconds, total).
  function exportVideo(plan, theme, onTick) {
    return new Promise((resolve, reject) => {
      if (!supported()) { reject(new Error('This browser cannot record video.')); return; }
      const dsp = SIO.dsp, F = SIO.frames;

      const canvas = document.createElement('canvas');
      canvas.width = F.W; canvas.height = F.H;
      const cctx = canvas.getContext('2d');

      const actx = dsp.audioContext();
      if (actx.state === 'suspended') actx.resume();
      const dest = actx.createMediaStreamDestination();

      // 15fps, the desktop app's own rate: the picture is static text that
      // changes a few times a minute.
      const stream = canvas.captureStream(15);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

      const rec = new MediaRecorder(stream, pickMime() ? { mimeType: pickMime() } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onerror = (e) => reject((e && e.error) || new Error('Recording failed.'));
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || 'video/webm' }));

      let tickTimer = 0;
      // The picture is not a side effect of the sound here, it IS the video
      // track: captureStream only emits a frame when the canvas is PAINTED.
      // Painting only on state change gave a 14 second video 14 frames, and
      // ended the video track at the last visual change - the closing pause
      // was simply missing from the file, audio outlasting video by seconds.
      // So the export repaints the current frame at the capture rate, right
      // through every pad, until the plan is over.
      let lastSeg = null;
      const paint = (seg) => { lastSeg = seg; F.drawFrame(cctx, seg, theme); };
      const engine = new SIO.player.Engine(plan, {
        ctx: actx,
        // mastered exactly like the on-screen player, so the file and the
        // screen are the same loudness
        dest: SIO.player.masterChain(actx, dest),
        loop: false,
        external: true, // clocked by the pump below, never by rAF
        draw: paint,
        onDone: () => {
          clearInterval(tickTimer);
          stopPump();
          // let the last frame land before the recorder closes
          setTimeout(() => { try { rec.stop(); } catch (e) { /* already stopped */ } }, 300);
        },
      });

      // The clock. NOT requestAnimationFrame and NOT setInterval: a save runs
      // in real time - ten minutes of video is ten minutes of waiting - so the
      // tab is in the background for almost all of it, where rAF stops dead
      // and timers are throttled to a crawl. Audio is the one thing a hidden
      // tab keeps running at full rate (that is why music plays in background
      // tabs), so the export is driven by an audio callback. Before this, a
      // backgrounded save recorded a frozen picture over correct sound - and
      // never finished at all, because the engine's own end-of-plan check
      // rode on the same stalled loop.
      const pump = actx.createScriptProcessor ? actx.createScriptProcessor(2048, 1, 1) : null;
      const mute = actx.createGain();
      mute.gain.value = 0;
      let lastPaint = -1;
      function stopPump() {
        if (!pump) return;
        pump.onaudioprocess = null;
        try { pump.disconnect(); mute.disconnect(); } catch (e) { /* already gone */ }
      }
      // A beat of the opening frame before anything happens, because the
      // recorder's first chunk carries the first 1920x1080 keyframe and
      // encoding it stalls the capture for the best part of a second -
      // measured at 0.65-0.93s on a software encoder, always right at the
      // start, and it survives dropping the chunk timeslice. Landing that on a
      // still frame costs a second of held picture; landing it on the plan
      // ate the first highlight change out of the file entirely.
      const WARMUP = 2.5;
      let planStarted = 0; // the audio-clock moment the plan itself began
      const beginPlan = () => { planStarted = actx.currentTime; engine.start(); };
      if (pump) {
        const t0 = actx.currentTime;
        pump.onaudioprocess = () => {
          const now = actx.currentTime;
          if (!planStarted && now - t0 >= WARMUP) beginPlan();
          if (planStarted) engine.tick();
          if (lastSeg && (lastPaint < 0 || now - lastPaint >= 1 / 15)) {
            lastPaint = now;
            F.drawFrame(cctx, lastSeg, theme);
          }
        };
        pump.connect(mute);
        mute.connect(dest); // silent, but the graph must be pulled for it to fire
      }

      // the opening frame exists from the first captured frame, warm-up or not
      if (plan.entries.length) paint(plan.entries[0].seg);
      rec.start(1000);
      if (!pump) { // no ScriptProcessor: fall back to the rAF loop rather than nothing
        engine.external = false;
        beginPlan();
        const loop = () => { if (engine.stopped) return; engine.tick(); requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      }
      if (onTick) {
        // progress is measured from the plan, not from the warm-up
        tickTimer = setInterval(() => onTick(
          Math.min(planStarted ? actx.currentTime - planStarted : 0, plan.duration), plan.duration), 500);
      }

      // hand back a cancel
      SIO.exporter._cancel = () => {
        clearInterval(tickTimer);
        stopPump();
        engine.stop();
        try { rec.stop(); } catch (e) { /* fine */ }
        reject(new Error('cancelled'));
      };
    });
  }

  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
  }

  SIO.exporter = {
    exportVideo, download, supported,
    _cancel: null,
    cancel: () => { if (SIO.exporter._cancel) SIO.exporter._cancel(); },
  };
})();
