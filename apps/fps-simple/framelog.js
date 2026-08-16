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
