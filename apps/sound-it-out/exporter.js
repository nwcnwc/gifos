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
      const engine = new SIO.player.Engine(plan, {
        ctx: actx,
        // mastered exactly like the on-screen player, so the file and the
        // screen are the same loudness
        dest: SIO.player.masterChain(actx, dest),
        loop: false,
        draw: (seg) => F.drawFrame(cctx, seg, theme),
        onDone: () => {
          clearInterval(tickTimer);
          // let the last frame land before the recorder closes
          setTimeout(() => { try { rec.stop(); } catch (e) { /* already stopped */ } }, 300);
        },
      });

      rec.start(1000);
      engine.start();
      const started = actx.currentTime;
      if (onTick) {
        tickTimer = setInterval(() => onTick(Math.min(actx.currentTime - started, plan.duration), plan.duration), 500);
      }

      // hand back a cancel
      SIO.exporter._cancel = () => {
        clearInterval(tickTimer);
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
