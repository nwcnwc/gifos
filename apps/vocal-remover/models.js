/*
 * models.js — the MDX models this app carries, and what UVR knows about them.
 *
 * Every field except `asset`, `label` and `bytes` is copied from UVR's own
 * models/MDX_Net_Models/model_data/model_data.json, keyed there by an MD5 of
 * the last 10 MB of the .onnx (UVR.py get_model_hash). The keys are recorded
 * here so the copy can be checked against upstream rather than trusted:
 * test/unit/vocal-remover.js re-derives them from apps/.../MODEL-PINS.json.
 *
 * WHY ONLY TWO, STILL. Pins are optional: gifos.assets() fetches a model when
 * the job needs it, not at install. Two is still the line because each extra
 * flagship vocal model is a 67 MB quality knob the user waits on the first
 * time they pick it. The karaoke model is here because it does a job HQ 3
 * cannot do at all.
 */
(function (root) {
  'use strict';

  var MODELS = {
    'inst-hq3': {
      label: 'UVR-MDX-NET Inst HQ 3',
      asset: 'inst-hq3.onnx',
      bytes: 66759214,
      upstream: 'UVR-MDX-NET-Inst_HQ_3.onnx',
      uvrHash: '55657dd70583b0fedfba5f67df11d711',
      nFft: 6144, dimF: 3072, dimT: 256, hop: 1024, compensate: 1.022,
      primaryStem: 'Instrumental',
      secondaryStem: 'Vocals',
      // primary_stem is in MDX_NET_FREQ_CUT and is_match_frequency_pitch is on
      // by default, so the secondary stem is (frequency-cut mix) - primary
      // rather than (mix) - primary.
      freqCut: true,
    },
    'kara2': {
      label: 'UVR-MDX-NET Karaoke 2',
      asset: 'kara2.onnx',
      bytes: 52786726,
      upstream: 'UVR_MDXNET_KARA_2.onnx',
      uvrHash: '1d64a6d2c30f709b8c9b4ce1366d96ee',
      nFft: 5120, dimF: 2048, dimT: 256, hop: 1024, compensate: 1.065,
      // is_karaoke, and primary_stem is Instrumental rather than Vocals, so
      // UVR labels the vocal-split output BV_VOCAL_STEM / LEAD_VOCAL_STEM
      // (UVR.py: `primary = LEAD_VOCAL_STEM if primary_stem_native == VOCAL_STEM
      // else BV_VOCAL_STEM`). The model's own output is the BACKING side.
      primaryStem: 'Backing Vocals',
      secondaryStem: 'Lead Vocals',
      freqCut: false,          // 'Backing Vocals' is not in MDX_NET_FREQ_CUT
      isKaraoke: true,
    },
    'self-test': {
      label: 'Self-test (not a separator)',
      selfTest: true,
      bytes: 0,
      nFft: 4096, dimF: 1024, dimT: 256, hop: 1024, compensate: 1.0,
      primaryStem: 'Pass-through',
      secondaryStem: 'Residual',
      freqCut: true,
    },
  };

  // The three things the app can be asked to do. B is UVR's vocal-split chain:
  // the main model, then the karaoke model run on ITS vocal stem.
  var JOBS = {
    'split': {
      label: 'Vocals + Instrumental',
      detail: 'The usual one. Two files out.',
      chain: ['inst-hq3'],
    },
    'split4': {
      label: 'Vocals + Instrumental, then Lead + Backing',
      detail: 'UVR’s vocal-split chain: the karaoke model runs on the vocal stem. Four files out, and about twice the wait.',
      chain: ['inst-hq3', 'kara2'],
    },
    'karaoke': {
      label: 'Lead + Backing vocals',
      detail: 'For a track that is already an acapella.',
      chain: ['kara2'],
    },
  };

  root.VR_MODELS = { models: MODELS, jobs: JOBS };
})(typeof window !== 'undefined' ? window : globalThis);
