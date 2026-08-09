/*
 * Pocket Voice — the driver. Loads the eSpeak core (speak.js / meSpeak build,
 * GPLv3) plus its config + en-us voice from install-time assets
 * (gifos.assets — the OS downloaded and hash-verified them at install), then
 * serves the computer's **Text → speech** AI role via gifos.provider.serve.
 *
 * Derived from meSpeak v2 (N.Landsteiner / speak.js / eSpeak, GNU GPL) —
 * trimmed to the raw-WAV path: no audio pools, no playback, no queues. The
 * engine runs entirely inside the GifOS sandbox: no network, no key, nothing
 * leaves the device.
 */
(function () {
  'use strict';

  // Voice variants shipped with eSpeak (from meSpeak's VFS setup, GPL). These
  // land in espeak-data/voices/!v so "en-us+f2" etc. resolve.
  var OPTION_FILES = {
    croak: 'language variant\nname croak\ngender male 70\npitch 85 117\nflutter 20\nformant 0 100 80 110\n',
    f1: 'language variant\nname female1\ngender female 70\npitch 140 200\nflutter 8\nroughness 4\nformant 0 115 80 150\nformant 1 120 80 180\nformant 2 100 70 150 150\nformant 3 115 70 150\nformant 4 110 80 150\nformant 5 110 90 150\nformant 6 105 80 150\nformant 7 110 70 150\nformant 8 110 70 150\nstressAdd -10 -10 -20 -20 0 0 40 60\n',
    f2: 'language variant\nname female2\ngender female\npitch 142 220\nroughness 3\nformant 0 105 80 150\nformant 1 110 80 160\nformant 2 110 70 150\nformant 3 110 70 150\nformant 4 115 80 150\nformant 5 115 80 150\nformant 6 110 70 150\nformant 7 110 70 150\nformant 8 110 70 150\nstressAdd 0 0 -10 -10 0 0 10 40\nbreath 0 2 3 3 3 3 3 2\necho 140 10\nconsonants 125 125\n',
    f3: 'language variant\nname female3\ngender female\npitch 140 240\nformant 0 105 80 150\nformant 1 120 75 150 -50\nformant 2 135 70 150 -250\nformant 3 125 80 150\nformant 4 125 80 150\nformant 5 125 80 150\nformant 6 120 70 150\nformant 7 110 70 150\nformant 8 110 70 150\nstressAmp 18 18 20 20 20 20 20 20\nbreath 0 2 3 3 3 3 3 2\necho 120 10\nroughness 4\n',
    m1: 'language variant\nname male1\ngender male 70\npitch 75 109\nflutter 5\nroughness 4\nconsonants 80 100\nformant 0 98 100 100\nformant 1 97 100 100\nformant 2 97 95 100\nformant 3 97 95 100\nformant 4 97 85 100\nformant 5 105 80 100\nformant 6 95 80 100\nformant 7 100 100 100\nformant 8 100 100 100\n',
    m2: 'language variant\nname male2\ngender male\npitch 88 115\necho 130 15\nformant 0 100 80 120\nformant 1 90 85 120\nformant 2 110 85 120\nformant 3 105 90 120\nformant 4 100 90 120\nformant 5 100 90 120\nformant 6 100 90 120\nformant 7 100 90 120\nformant 8 100 90 120\n',
    m3: 'language variant\nname male3\ngender male\npitch 80 122\nformant 0 100 100 100\nformant 1 96 97 100\nformant 2 96 97 100\nformant 3 96 103 100\nformant 4 95 103 100\nformant 5 95 103 100\nformant 6 100 100 100\nformant 7 100 100 100\nformant 8 100 100 100\nstressAdd 10 10 0 0 0 0 -30 -30\n',
    whisper: 'language variant\nname whisper\npitch 75 125\nformant 0 100 125 100\nformant 1 100 90 80\nformant 2 100 70 90\nformant 3 100 60 90\nformant 4 100 60 90\nformant 5 75 50 90\nformant 6 90 50 100\nformant 7 100 50 100\nformant 8 100 50 100\nvoicing 155\n',
  };

  // The familiar OpenAI voice names, mapped onto eSpeak variants — so a
  // consumer app written against a cloud TTS "just works" when this provider
  // answers instead. Unknown names fall through to the plain voice.
  var VOICE_MAP = { alloy: 'm3', echo: 'm1', fable: 'f3', onyx: 'm2', nova: 'f1', shimmer: 'f2', whisper: 'whisper' };

  var cfgData = null, voiceData = null, eSpeak = null, enginePromise = null;

  function b64ToArr(str) {
    var bin = atob(String(str || '').replace(/\s+/g, ''));
    var out = new Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function strToArr(s) { var out = new Array(s.length); for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
  function decodeText(buf) { return new TextDecoder().decode(new Uint8Array(buf)); }

  // Build a fresh engine instance and load its virtual filesystem. Cheap-ish
  // (~100ms) — also the recovery path when the 2011-era emscripten FS trips.
  function bootInstance() {
    eSpeak = new window.__ESpeak();
    var FS = eSpeak.FS;
    var put = function (path, fname, data) {
      if (!FS.findObject(path)) FS.createPath('/', path.substring(1), true, true);
      FS.createDataFile(path, fname, data, true, false);
    };
    // FS.root exists only after the first createPath — order matters here.
    var vdir = '/espeak/espeak-data/voices/!v';
    FS.createPath('/', vdir.substring(1), true, true);
    FS.root.write = true;
    for (var fn in OPTION_FILES) FS.createDataFile(vdir, fn, strToArr(OPTION_FILES[fn]), true, true);
    ['config', 'phontab', 'phonindex', 'phondata', 'intonations'].forEach(function (k) {
      put('/espeak/espeak-data', k, b64ToArr(cfgData[k]));
    });
    if (voiceData.dict_id) put('/espeak/espeak-data', voiceData.dict_id, b64ToArr(voiceData.dict));
    var parts = voiceData.voice_id.split('/');
    var vpath = '/espeak/espeak-data/voices' + (parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '');
    put(vpath, parts[parts.length - 1], voiceData.voice_encoding === 'text' ? strToArr(voiceData.voice) : b64ToArr(voiceData.voice));
  }

  function ensureEngine(onStatus) {
    if (enginePromise) return enginePromise;
    if (onStatus) onStatus('Loading the voice engine…');
    enginePromise = Promise.all([
      gifos.assets('espeak.js'),
      gifos.assets('mespeak-config.json'),
      gifos.assets('voice-en-us.json'),
    ]).then(function (r) {
      // Execute the core via inline <script> injection — allowed by the app
      // CSP ('unsafe-inline'), no eval involved. The bytes were hash-pinned
      // by the manifest and verified by the OS before we ever see them.
      if (!window.__ESpeak) {
        var s = document.createElement('script');
        s.textContent = decodeText(r[0]);
        document.head.appendChild(s);
      }
      if (!window.__ESpeak) throw new Error('The voice engine core failed to load.');
      cfgData = JSON.parse(decodeText(r[1]));
      voiceData = JSON.parse(decodeText(r[2]));
      bootInstance();
      if (onStatus) onStatus('');
      return true;
    });
    enginePromise.catch(function () { enginePromise = null; }); // retryable
    return enginePromise;
  }

  // text → WAV bytes (22.05 kHz mono 16-bit). Mirrors meSpeak's speak()
  // rawdata path; one instance-reboot retry covers the engine's known
  // every-~80th-call FS flush failure.
  function synthesize(req) {
    var text = String(req.text || '').slice(0, 20000);
    if (!text.trim()) throw new Error('Nothing to say — empty text.');
    var variant = VOICE_MAP[String(req.voice || '').toLowerCase()] || (OPTION_FILES[req.voice] ? req.voice : '');
    var voice = 'en/en-us' + (variant ? '+' + variant : '');
    // OpenAI-style speed is a 0.25–4 multiplier on normal; eSpeak takes words
    // per minute (175 ≈ normal).
    var mult = Number(req.speed);
    var wpm = (mult >= 0.25 && mult <= 4) ? Math.round(175 * mult) : 175;
    var pitch = (Number(req.pitch) >= 0 && Number(req.pitch) <= 100) ? Math.round(Number(req.pitch)) : 50;
    var argstack = ['-w', 'wav.wav', '-a', '100', '-g', '0', '-p', String(pitch), '-s', String(wpm), '-b', '1', '-v', voice, '--path=/espeak', text];
    var run = function () {
      eSpeak.Module.arguments = argstack;
      eSpeak.run();
      var outfile = eSpeak.FS.root.contents['wav.wav'];
      if (!outfile || !outfile.contents || !outfile.contents.length) throw new Error('engine produced no audio');
      var raw = outfile.contents;
      var buf = new ArrayBuffer(raw.length);
      var u8 = new Uint8Array(buf);
      for (var i = 0; i < raw.length; i++) { var v = raw[i]; u8[i] = v >= 0 ? v : 256 + v; }
      outfile.contents.length = 0;
      return buf;
    };
    try { return run(); }
    catch (e) { bootInstance(); return run(); }
  }

  function ttsHandler(req) {
    return ensureEngine().then(function () {
      return { bytes: synthesize(req || {}), mime: 'audio/wav' };
    });
  }

  // Serve the role. In a normal (visible) mount this registration is inert —
  // requests only arrive when the OS mounts us as a hidden provider service.
  if (window.gifos && gifos.provider && gifos.provider.serve) {
    gifos.provider.serve({ tts: ttsHandler });
  }

  // ---- the visible page: explainer + Try box --------------------------------
  var $ = function (id) { return document.getElementById(id); };
  function setStatus(m) { var el = $('status'); if (el) el.textContent = m || ''; }
  if ($('speak')) {
    $('speak').onclick = function () {
      var text = $('text').value;
      var voice = $('voice').value;
      $('speak').disabled = true;
      setStatus('');
      ensureEngine(setStatus)
        .then(function () { return ttsHandler({ text: text, voice: voice }); })
        .then(function (r) {
          var url = URL.createObjectURL(new Blob([r.bytes], { type: r.mime }));
          var audio = new Audio(url);
          audio.onended = function () { URL.revokeObjectURL(url); };
          setStatus('Spoken on this device — ' + Math.round(r.bytes.byteLength / 1024) + ' KB of WAV, zero network.');
          return audio.play();
        })
        .catch(function (e) { setStatus('⚠ ' + (e && e.message || e)); })
        .then(function () { $('speak').disabled = false; });
    };
  }
})();
