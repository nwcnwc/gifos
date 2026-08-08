// Boot: install the bundled Andika face, load saved state, hand over to ui.js.
(function () {
  const SIO = window.SIO;

  // Andika (SIL OFL) is the literacy font the videos are set in - the a and g
  // shapes children are taught to write. Bundled as bytes; the FontFace API
  // takes them directly, no CSS url() needed.
  async function installFont() {
    if (!window.SIO_FONT_B64 || !window.FontFace) return;
    try {
      const bytes = SIO.dsp.b64ToBytes(window.SIO_FONT_B64);
      const face = new FontFace('Andika', bytes.buffer, { weight: '400 700' });
      await face.load();
      document.fonts.add(face);
    } catch (e) { /* the system font carries it */ }
  }

  async function loadState() {
    let prefs = null, wordsText = null;
    try { prefs = await SIO.store.db('prefs').get('prefs'); } catch (e) { /* fresh */ }
    try {
      const w = await SIO.store.db('words').get('wordlist');
      wordsText = w && w.text;
    } catch (e) { /* fresh */ }
    return {
      prefs: prefs || {},
      wordsText: (wordsText === null || wordsText === undefined) ? SIO.wordlist.DEFAULT_TEXT : wordsText,
    };
  }

  async function boot() {
    await installFont();
    const loaded = await loadState();
    await SIO.ui.init(loaded);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
