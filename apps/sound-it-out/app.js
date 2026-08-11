// Boot: install the bundled Andika face, load saved state, hand over to ui.js.
(function () {
  const SIO = window.SIO;

  // Andika (SIL OFL) is the literacy font the videos are set in - the a and g
  // shapes children are taught to write.
  async function installFont() {
    if (!window.SIO_FONT_B64 || !window.FontFace) return;
    try {
      const bytes = SIO.dsp.b64ToBytes(window.SIO_FONT_B64);
      const face = new FontFace('Andika', bytes.buffer, { weight: '400 700' });
      await face.load();
      document.fonts.add(face);
    } catch (e) { /* the system font carries it */ }
  }

  async function boot() {
    await installFont();
    let prefs = null, curriculum = null;
    try { prefs = await SIO.store.db('prefs').get('prefs'); } catch (e) { /* fresh */ }
    // The shared half of the setup: the sight-word list. Separate from prefs
    // because prefs is private per device and this is the whole room's
    // curriculum (see ui.js state.sightWords).
    try { curriculum = await SIO.store.db('curriculum').get('sight'); } catch (e) { /* fresh */ }
    await SIO.ui.init({ prefs: prefs || {}, curriculum: curriculum || null });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
