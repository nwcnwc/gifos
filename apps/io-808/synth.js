// iO-808 synth — classic-script port of vincentriemer/io-808 src/synth/.
// Graphs, frequencies, envelopes and the 808 step key are copied from
// upstream. No samples. No CDN. Attaches window.IO808.
(function (root) {
  'use strict';

  var IO = root.IO808 = root.IO808 || {};

  var ACCENT = 0;
  var BASS_DRUM = 1;
  var SNARE_DRUM = 2;
  var LOW_CONGA_LOW_TOM = 3;
  var MID_CONGA_MID_TOM = 4;
  var HI_CONGA_HI_TOM = 5;
  var CLAVES_RIMSHOT = 6;
  var MARACAS_HANDCLAP = 7;
  var COWBELL = 8;
  var CYMBAL = 9;
  var OPEN_HIHAT = 10;
  var CLSD_HIHAT = 11;

  var FIRST_PART = 'FIRST_PART';
  var SECOND_PART = 'SECOND_PART';
  var A_VARIATION = 'A_VARIATION';
  var B_VARIATION = 'B_VARIATION';

  var SINE = 'sine';
  var SQUARE = 'square';
  var SAW = 'sawtooth';
  var TRIANGLE = 'triangle';
  var WHITE_NOISE = 'whitenoise';
  var PINK_NOISE = 'pinknoise';
  var LOWPASS = 'lowpass';
  var HIGHPASS = 'highpass';
  var BANDPASS = 'bandpass';
  var LINEAR = 'linear';
  var EXPONENTIAL = 'exponential';

  function equalPower(input) {
    var output = Math.cos((1.0 - input / 100) * 0.5 * Math.PI);
    return Math.round(output * 100) / 100;
  }

  function stepKey(pattern, instrument, part, variation, step) {
    return 'PATTERN_' + pattern + '-INSTRUMENT_' + instrument + '-' + part + '-' + variation + '-STEP_' + step;
  }

  function patternLengthKey(pattern, part) {
    return 'PATTERN_' + pattern + '-' + part + '-LENGTH';
  }

  function wire(Ctor) {
    Ctor.prototype.connect = function (node) {
      if (Object.prototype.hasOwnProperty.call(node, 'input')) this.output.connect(node.input);
      else this.output.connect(node);
    };
    Ctor.prototype.disconnect = function () {
      this.output.disconnect();
    };
    return Ctor;
  }

  function createWhiteNoiseOsc(audioCtx) {
    var buffer = audioCtx.createBuffer(1, 44100, 44100);
    var data = buffer.getChannelData(0);
    var i;
    for (i = 0; i < data.length; i++) data[i] = (Math.random() - 0.5) * 2;
    var source = audioCtx.createBufferSource();
    source.loop = true;
    source.buffer = buffer;
    return source;
  }

  function createPinkNoiseOsc(audioCtx) {
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    var buffer = audioCtx.createBuffer(1, 44100, 44100);
    var data = buffer.getChannelData(0);
    var i, white;
    for (i = 0; i < data.length; i++) {
      white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      data[i] *= 0.11;
      b6 = white * 0.115926;
    }
    var source = audioCtx.createBufferSource();
    source.loop = true;
    source.buffer = buffer;
    return source;
  }

  function VCO(type, audioCtx) {
    this.type = type;
    switch (type) {
      case WHITE_NOISE:
        this.oscillator = createWhiteNoiseOsc(audioCtx);
        break;
      case PINK_NOISE:
        this.oscillator = createPinkNoiseOsc(audioCtx);
        break;
      case SINE:
      case SQUARE:
      case SAW:
      case TRIANGLE:
        this.oscillator = audioCtx.createOscillator();
        this.oscillator.type = type;
        this.oscillator.frequency.value = 440;
        break;
      default:
        throw new Error('Invalid oscillator type provided: ' + type);
    }
    this.frequency = this.oscillator.frequency;
    this.output = this.oscillator;
  }
  VCO.prototype.start = function (time) { this.oscillator.start(time); };
  VCO.prototype.stop = function () { this.oscillator.stop(); };
  wire(VCO);

  function VCA(audioCtx) {
    this.gain = audioCtx.createGain();
    this.gain.gain.value = 0;
    this.input = this.gain;
    this.output = this.gain;
    this.amplitude = this.gain.gain;
  }
  wire(VCA);

  function VCF(type, audioCtx) {
    this.filter = audioCtx.createBiquadFilter();
    this.filter.frequency.value = 400;
    this.filter.Q.value = 1;
    this.filter.type = type;
    this.input = this.filter;
    this.output = this.filter;
    this.frequency = this.filter.frequency;
    this.Q = this.filter.Q;
  }
  wire(VCF);

  function ADGenerator(type, attack, decay, start, amount) {
    this.type = type;
    this.attack = attack;
    this.decay = decay;
    this.start = start;
    this.amount = amount;
  }
  ADGenerator.prototype.trigger = function (time) {
    this.param.cancelScheduledValues(0);
    this.param.linearRampToValueAtTime(this.start, time);
    var attackTime = time + this.attack / 1000;
    var decayTime = attackTime + this.decay / 1000;
    this.param.linearRampToValueAtTime(this.start + this.amount, attackTime);
    if (this.type === LINEAR) this.param.linearRampToValueAtTime(this.start, decayTime);
    else if (this.type === EXPONENTIAL) this.param.exponentialRampToValueAtTime(0.0001 + this.start, decayTime);
    else throw new Error('Invalid AD type');
  };
  ADGenerator.prototype.connect = function (param) { this.param = param; };

  var REVER_INTERVAL = 1 / 100;
  function SawEnvGenerator() {}
  SawEnvGenerator.prototype.connect = function (param) { this.param = param; };
  SawEnvGenerator.prototype.trigger = function (time) {
    this.param.cancelScheduledValues(0);
    var timeOffset = 0, i;
    for (i = 0; i < 4; i++) {
      this.param.setValueAtTime(1 - i / 2, time + timeOffset);
      timeOffset += REVER_INTERVAL;
      this.param.linearRampToValueAtTime(0, time + timeOffset);
    }
  };

  var WS_CURVE = (function () {
    var curve = new Float32Array(65536);
    var i;
    for (i = 0; i < 32768; i++) curve[i] = 0.0;
    for (i = 32768; i < 65536; i++) curve[i] = i / 32768 - 1;
    return curve;
  })();

  function HalfWaveRectifier(audioCtx) {
    this.waveshaper = audioCtx.createWaveShaper();
    this.waveshaper.curve = WS_CURVE;
    this.input = this.waveshaper;
    this.output = this.waveshaper;
  }
  wire(HalfWaveRectifier);

  var softClippingCurve = (function () {
    var n = 65536;
    var curve = new Float32Array(n);
    var i, x;
    for (i = 0; i < n; i++) {
      x = (i - n / 2) / (n / 2);
      curve[i] = Math.tanh(x);
    }
    return curve;
  })();

  function SoftClipper(drive, audioCtx) {
    this.gain = new VCA(audioCtx);
    this.gain.amplitude.value = drive;
    this.waveshaper = audioCtx.createWaveShaper();
    this.waveshaper.curve = softClippingCurve;
    this.waveshaper.oversample = '2x';
    this.gain.connect(this.waveshaper);
    this.input = this.gain.gain;
    this.output = this.waveshaper;
  }
  wire(SoftClipper);

  function SwingVCA(audioCtx) {
    this.rectifier = new HalfWaveRectifier(audioCtx);
    this.clipper = new SoftClipper(3, audioCtx);
    this.vca = new VCA(audioCtx);
    this.rectifier.connect(this.clipper);
    this.clipper.connect(this.vca);
    this.amplitude = this.vca.amplitude;
    this.input = this.rectifier.input;
    this.output = this.vca.output;
  }
  wire(SwingVCA);

  function Limiter(audioCtx) {
    this.limiter = audioCtx.createDynamicsCompressor();
    this.limiter.threshold.value = 0.0;
    this.limiter.knee.value = 0.0;
    this.limiter.ratio.value = 20.0;
    this.limiter.attack.value = 0.005;
    this.limiter.release.value = 0.005;
    this.input = this.limiter;
    this.output = this.limiter;
  }
  wire(Limiter);

  function PulseTrigger(audioCtx) {
    var sampleRate = audioCtx.sampleRate;
    var pulseLength = 0.001 * sampleRate;
    this.buffer = audioCtx.createBuffer(1, pulseLength, sampleRate);
    this.data = this.buffer.getChannelData(0);
    var i;
    for (i = 0; i < this.data.length; i++) this.data[i] = 1;
    this.vcf = new VCF(LOWPASS, audioCtx);
    this.vcf.frequency.value = 5000;
    this.gain = new VCA(audioCtx);
    this.gain.amplitude.value = 0.8;
    this.vcf.connect(this.gain);
    this.output = this.gain;
  }
  PulseTrigger.prototype.trigger = function (time, audioCtx) {
    var source = audioCtx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.vcf.output);
    source.start(time);
  };
  wire(PulseTrigger);

  var OSC_FREQUENCIES = [263, 400, 421, 474, 587, 845];
  var OSC_AMPLITUDE = 0.3;
  var DEFAULT_OSC_CONFIG = [true, true, true, true, true, true];

  function SquareOscBank(audioCtx, oscConfig) {
    var self = this;
    oscConfig = oscConfig || DEFAULT_OSC_CONFIG;
    this.output = new VCA(audioCtx);
    this.output.amplitude.value = 1;
    this.oscBank = OSC_FREQUENCIES.map(function (freq, index) {
      if (!oscConfig[index]) return null;
      var osc = new VCO(SQUARE, audioCtx);
      osc.frequency.value = freq;
      var vca = new VCA(audioCtx);
      vca.amplitude.value = OSC_AMPLITUDE;
      osc.connect(vca);
      vca.connect(self.output);
      return { osc: osc, vca: vca };
    }).filter(function (x) { return !!x; });
  }
  SquareOscBank.prototype.start = function (time) {
    this.oscBank.forEach(function (n) { n.osc.start(time); });
  };
  SquareOscBank.prototype.stop = function () {
    this.oscBank.forEach(function (n) { n.osc.stop(); });
  };
  wire(SquareOscBank);

  // ---- drum modules (upstream src/synth/drumModules) --------------------

  var FREQ_AMT = 50;
  var START_FREQ = 48;
  function bassDrum(audioCtx, destination, time, p) {
    var outputLevel = equalPower(p.level);
    var vcfFreq = 200 + p.tone * 20;
    var decayTime = p.decay * 5 + 50;
    var vco = new VCO(SINE, audioCtx);
    vco.frequency.value = START_FREQ;
    var vcf = new VCF(LOWPASS, audioCtx);
    vcf.frequency.value = vcfFreq;
    vcf.Q.value = 1;
    var click = new PulseTrigger(audioCtx);
    var vca = new VCA(audioCtx);
    vca.amplitude.value = 0;
    var outputVCA = new VCA(audioCtx);
    outputVCA.amplitude.value = outputLevel + 0.4;
    var softClipper = new SoftClipper(0.6, audioCtx);
    var oscEnv = new ADGenerator(EXPONENTIAL, 0.11, decayTime, START_FREQ, FREQ_AMT);
    var ampEnv = new ADGenerator(LINEAR, 2, decayTime, 0.0, 1.0);
    vco.connect(vca);
    click.connect(vca);
    vca.connect(vcf);
    vcf.connect(softClipper);
    softClipper.connect(outputVCA);
    oscEnv.connect(vco.frequency);
    ampEnv.connect(vca.amplitude);
    outputVCA.connect(destination);
    vco.start(time);
    ampEnv.trigger(time);
    oscEnv.trigger(time);
    click.trigger(time, audioCtx);
    window.setTimeout(function () {
      vco.oscillator.stop();
      outputVCA.disconnect();
    }, time - audioCtx.currentTime + 1000);
    return outputVCA;
  }

  function snareDrum(audioCtx, destination, time, p) {
    var outputLevel = equalPower(p.level);
    var noiseVCFFreq = p.tone * 100 + 800;
    var snappyEnvAmt = p.snappy / 200;
    var highOsc = new VCO(SINE, audioCtx);
    highOsc.frequency.value = 476;
    var lowOsc = new VCO(SINE, audioCtx);
    lowOsc.frequency.value = 238;
    var noiseOsc = new VCO(WHITE_NOISE, audioCtx);
    var noiseVCF = new VCF(HIGHPASS, audioCtx);
    noiseVCF.frequency.value = noiseVCFFreq;
    var oscVCA = new VCA(audioCtx);
    var noiseVCA = new VCA(audioCtx);
    var outputVCA = new VCA(audioCtx);
    outputVCA.amplitude.value = outputLevel;
    var noiseEnv = new ADGenerator(LINEAR, 0.1, 75, 0, 0.5);
    var snappyEnv = new ADGenerator(LINEAR, 0.1, 50, 0, snappyEnvAmt);
    highOsc.connect(oscVCA);
    lowOsc.connect(oscVCA);
    oscVCA.connect(outputVCA);
    noiseOsc.connect(noiseVCF);
    noiseVCF.connect(noiseVCA);
    noiseVCA.connect(outputVCA);
    noiseEnv.connect(noiseVCA.amplitude);
    snappyEnv.connect(oscVCA.amplitude);
    outputVCA.connect(destination);
    highOsc.start(time);
    lowOsc.start(time);
    noiseOsc.start(time);
    noiseEnv.trigger(time);
    snappyEnv.trigger(time);
    window.setTimeout(function () {
      highOsc.stop();
      lowOsc.stop();
      noiseOsc.stop();
      outputVCA.disconnect();
    }, time - audioCtx.currentTime + 1000);
    return outputVCA;
  }

  var tomMap = {
    low: [
      { frequencies: [220, 165], decay: [180, 200] },
      { frequencies: [100, 80], decay: [200, 200] }
    ],
    mid: [
      { frequencies: [310, 250], decay: [100, 155] },
      { frequencies: [160, 120], decay: [130, 155] }
    ],
    high: [
      { frequencies: [455, 370], decay: [180, 125] },
      { frequencies: [220, 165], decay: [200, 125] }
    ]
  };

  function tomConga(kind) {
    return function (audioCtx, destination, time, p) {
      var spec = tomMap[kind][p.selector];
      var highFreq = spec.frequencies[0], lowFreq = spec.frequencies[1];
      var oscDecay = spec.decay[0], noiseDecay = spec.decay[1];
      var oscFreq = (p.tuning / 100) * (highFreq - lowFreq) + lowFreq;
      var outputLevel = equalPower(p.level / 4);
      var osc = new VCO(SINE, audioCtx);
      osc.frequency.value = oscFreq;
      var noiseOsc = new VCO(PINK_NOISE, audioCtx);
      var click = new PulseTrigger(audioCtx);
      click.gain.amplitude.value = 0.3;
      var noiseVCF = new VCF(LOWPASS, audioCtx);
      noiseVCF.frequency.value = 10000;
      var oscVCA = new VCA(audioCtx);
      var noiseVCA = new VCA(audioCtx);
      var outputVCA = new VCA(audioCtx);
      outputVCA.amplitude.value = outputLevel;
      var oscEnv = new ADGenerator(LINEAR, 0.1, oscDecay, 0, 1);
      var noiseEnv = new ADGenerator(LINEAR, 0.1, noiseDecay, 0, 0.2);
      osc.connect(oscVCA);
      oscVCA.connect(outputVCA);
      if (p.selector === 1) {
        noiseOsc.connect(noiseVCF);
        noiseVCF.connect(noiseVCA);
        noiseVCA.connect(outputVCA);
      }
      click.connect(outputVCA);
      oscEnv.connect(oscVCA.amplitude);
      noiseEnv.connect(noiseVCA.amplitude);
      outputVCA.connect(destination);
      osc.start(time);
      noiseOsc.start(time);
      click.trigger(time, audioCtx);
      oscEnv.trigger(time);
      noiseEnv.trigger(time);
      window.setTimeout(function () {
        osc.stop();
        noiseOsc.stop();
        outputVCA.disconnect();
      }, time - audioCtx.currentTime + 1000);
      return outputVCA;
    };
  }

  function claveRimshot(audioCtx, destination, time, p) {
    var outputLevel = equalPower(p.level);
    var outputVCA = new VCA(audioCtx);
    outputVCA.amplitude.value = outputLevel;
    var rimOsc = new VCO(SINE, audioCtx);
    rimOsc.frequency.value = 480;
    var rimBandFilter = new VCF(BANDPASS, audioCtx);
    rimBandFilter.frequency.value = 480;
    var rimHighFilter = new VCF(HIGHPASS, audioCtx);
    rimHighFilter.frequency.value = 480;
    var swingVCA = new SwingVCA(audioCtx);
    var swingEnv = new ADGenerator(LINEAR, 0.11, 10, 0, 1.7);
    var claveOsc = new VCO(TRIANGLE, audioCtx);
    var claveFilter;
    if (p.selector === 0) {
      claveOsc.frequency.value = 2450;
      claveFilter = new VCF(BANDPASS, audioCtx);
    } else {
      claveOsc.frequency.value = 1750;
      claveFilter = new VCF(HIGHPASS, audioCtx);
    }
    claveFilter.frequency.value = 2450;
    var claveVCA = new VCA(audioCtx);
    var claveEnv = new ADGenerator(EXPONENTIAL, 0.11, 40, 0, 0.7);
    rimOsc.connect(rimBandFilter);
    rimBandFilter.connect(swingVCA);
    claveOsc.connect(claveFilter);
    claveFilter.connect(claveVCA);
    claveVCA.connect(swingVCA);
    swingVCA.connect(rimHighFilter);
    if (p.selector === 0) claveVCA.connect(outputVCA);
    else rimHighFilter.connect(outputVCA);
    swingEnv.connect(swingVCA.amplitude);
    claveEnv.connect(claveVCA.amplitude);
    outputVCA.connect(destination);
    claveOsc.start(time);
    rimOsc.start(time);
    claveEnv.trigger(time);
    swingEnv.trigger(time);
    window.setTimeout(function () {
      claveOsc.stop();
      rimOsc.stop();
      outputVCA.disconnect();
    }, time - audioCtx.currentTime + 1000);
    return outputVCA;
  }

  function maracasHandclap(audioCtx, destination, time, p) {
    var outputLevel = equalPower(p.level);
    var osc = new VCO(WHITE_NOISE, audioCtx);
    osc.start(time);
    var outputVCA = new VCA(audioCtx);
    outputVCA.amplitude.value = outputLevel;
    if (p.selector === 0) {
      var maracasFilter = new VCF(HIGHPASS, audioCtx);
      maracasFilter.frequency.value = 5000;
      var maracasVCA = new VCA(audioCtx);
      var maracasEnv = new ADGenerator(LINEAR, 0.2, 30, 0, 0.5);
      osc.connect(maracasFilter);
      maracasFilter.connect(maracasVCA);
      maracasVCA.connect(outputVCA);
      maracasEnv.connect(maracasVCA.amplitude);
      maracasEnv.trigger(time);
    } else if (p.selector === 1) {
      var clapFilter = new VCF(BANDPASS, audioCtx);
      clapFilter.frequency.value = 1000;
      var sawVCA = new VCA(audioCtx);
      var reverVCA = new VCA(audioCtx);
      var sawEnv = new SawEnvGenerator();
      var reverEnv = new ADGenerator(LINEAR, 0.2, 115, 0, 0.75);
      osc.connect(clapFilter);
      clapFilter.connect(sawVCA);
      clapFilter.connect(reverVCA);
      sawVCA.connect(outputVCA);
      reverVCA.connect(outputVCA);
      sawEnv.connect(sawVCA.amplitude);
      reverEnv.connect(reverVCA.amplitude);
      sawEnv.trigger(time);
      reverEnv.trigger(time);
    }
    outputVCA.connect(destination);
    window.setTimeout(function () {
      osc.stop();
      outputVCA.disconnect();
    }, time - audioCtx.currentTime + 1000);
    return outputVCA;
  }

  function cowbell(audioCtx, destination, time, p) {
    var outputLevel = equalPower(p.level);
    var highOsc = new VCO(SQUARE, audioCtx);
    highOsc.frequency.value = 800;
    var lowOsc = new VCO(SQUARE, audioCtx);
    lowOsc.frequency.value = 540;
    var bandFilter = new VCF(BANDPASS, audioCtx);
    bandFilter.frequency.value = 2640;
    bandFilter.Q.value = 1;
    var shortVCA = new VCA(audioCtx);
    var longVCA = new VCA(audioCtx);
    var outputVCA = new VCA(audioCtx);
    outputVCA.amplitude.value = outputLevel;
    var shortEnv = new ADGenerator(LINEAR, 0.11, 15, 0, (1.0 - 0.25) / 2);
    var longEnv = new ADGenerator(EXPONENTIAL, 15, 400, 0, 0.25 / 2);
    highOsc.connect(shortVCA);
    highOsc.connect(longVCA);
    lowOsc.connect(shortVCA);
    lowOsc.connect(longVCA);
    shortVCA.connect(bandFilter);
    longVCA.connect(bandFilter);
    bandFilter.connect(outputVCA);
    shortEnv.connect(shortVCA.amplitude);
    longEnv.connect(longVCA.amplitude);
    outputVCA.connect(destination);
    lowOsc.start(time);
    highOsc.start(time);
    shortEnv.trigger(time);
    longEnv.trigger(time);
    window.setTimeout(function () {
      lowOsc.stop();
      highOsc.stop();
      outputVCA.disconnect();
    }, time - audioCtx.currentTime + 1000);
    return outputVCA;
  }

  function hiHat(audioCtx, destination, time, outputLevel, decay) {
    var oscBank = new SquareOscBank(audioCtx);
    var midFilter = new VCF(BANDPASS, audioCtx);
    midFilter.frequency.value = 10000;
    var highFilter = new VCF(HIGHPASS, audioCtx);
    highFilter.frequency.value = 8000;
    var outputVCA = new VCA(audioCtx);
    outputVCA.amplitude.value = outputLevel;
    var modVCA = new VCA(audioCtx);
    var env = new ADGenerator(LINEAR, 0.1, decay, 0, 1);
    oscBank.connect(midFilter);
    midFilter.connect(modVCA);
    modVCA.connect(highFilter);
    highFilter.connect(outputVCA);
    env.connect(modVCA.amplitude);
    outputVCA.connect(destination);
    oscBank.start(time);
    env.trigger(time);
    window.setTimeout(function () {
      oscBank.stop();
      outputVCA.disconnect();
    }, time - audioCtx.currentTime + 1000);
    return outputVCA;
  }

  function openHat(audioCtx, destination, time, p) {
    return hiHat(audioCtx, destination, time, equalPower(p.level), p.decay * 3.6 + 90);
  }
  function clsdHat(audioCtx, destination, time, p) {
    return hiHat(audioCtx, destination, time, equalPower(p.level), 50);
  }

  function cymbal(audioCtx, destination, time, p) {
    var outputLevel = equalPower(p.level);
    var lowDecay = p.decay * 8.5 + 700;
    var lowEnvAmt = 0.666 - (p.tone / 100) * 0.666;
    var midEnvAmt = 0.333;
    var highEnvAmt = 0.666 - (1 - p.tone / 100) * 0.666;
    var oscBank = new SquareOscBank(audioCtx);
    var lowBandFilter = new VCF(BANDPASS, audioCtx);
    lowBandFilter.frequency.value = 5000;
    var lowVCA = new VCA(audioCtx);
    var lowHighpassFilter = new VCF(HIGHPASS, audioCtx);
    lowHighpassFilter.frequency.value = 5000;
    var midHighBandFilter = new VCF(BANDPASS, audioCtx);
    midHighBandFilter.frequency.value = 10000;
    var midVCA = new VCA(audioCtx);
    var midHighpassFilter = new VCF(HIGHPASS, audioCtx);
    midHighpassFilter.frequency.value = 10000;
    var highFilter = new VCF(HIGHPASS, audioCtx);
    highFilter.frequency.value = 8000;
    var highVCA = new VCA(audioCtx);
    var outputVCA = new VCA(audioCtx);
    outputVCA.amplitude.value = outputLevel;
    var lowEnv = new ADGenerator(EXPONENTIAL, 0.1, lowDecay, 0, lowEnvAmt);
    var midEnv = new ADGenerator(EXPONENTIAL, 0.1, 400, 0, midEnvAmt);
    var highEnv = new ADGenerator(EXPONENTIAL, 0.1, 150, 0, highEnvAmt);
    oscBank.connect(lowBandFilter);
    oscBank.connect(midHighBandFilter);
    lowBandFilter.connect(lowVCA);
    lowVCA.connect(lowHighpassFilter);
    lowHighpassFilter.connect(outputVCA);
    midHighBandFilter.connect(midVCA);
    midVCA.connect(midHighpassFilter);
    midHighpassFilter.connect(outputVCA);
    midHighBandFilter.connect(highVCA);
    highVCA.connect(highFilter);
    highFilter.connect(outputVCA);
    lowEnv.connect(lowVCA.amplitude);
    midEnv.connect(midVCA.amplitude);
    highEnv.connect(highVCA.amplitude);
    outputVCA.connect(destination);
    oscBank.start(time);
    lowEnv.trigger(time);
    midEnv.trigger(time);
    highEnv.trigger(time);
    window.setTimeout(function () {
      oscBank.stop();
      outputVCA.disconnect();
    }, time - audioCtx.currentTime + 2000);
    return outputVCA;
  }

  var drumModuleMapping = [
    [BASS_DRUM, bassDrum],
    [SNARE_DRUM, snareDrum],
    [LOW_CONGA_LOW_TOM, tomConga('low')],
    [MID_CONGA_MID_TOM, tomConga('mid')],
    [HI_CONGA_HI_TOM, tomConga('high')],
    [CLAVES_RIMSHOT, claveRimshot],
    [MARACAS_HANDCLAP, maracasHandclap],
    [COWBELL, cowbell],
    [CYMBAL, cymbal],
    [OPEN_HIHAT, openHat],
    [CLSD_HIHAT, clsdHat]
  ];

  var previousTriggers = {};
  var di;
  for (di = 1; di <= 11; di++) previousTriggers[di] = null;

  function getAccentGain(pattern, part, variation, step, storeState) {
    var stepId = stepKey(pattern, ACCENT, part, variation, step);
    var accentActive = storeState.steps[stepId];
    var accentLevel = storeState.instrumentState[ACCENT].level;
    var inactiveGainAmt = equalPower(100 - accentLevel / 1.5);
    return accentActive ? 1.0 : inactiveGainAmt;
  }

  function stepTrigger(storeState, deadline, destination, clock, audioCtx) {
    var currentPattern = storeState.currentPattern;
    var currentPart = storeState.currentPart;
    var currentVariation = storeState.currentVariation;
    var currentStep = storeState.currentStep;
    var accentGain = getAccentGain(currentPattern, currentPart, currentVariation, currentStep, storeState);
    var accentVCA = new VCA(audioCtx);
    accentVCA.amplitude.value = accentGain;
    accentVCA.connect(destination);
    window.setTimeout(function () { accentVCA.disconnect(); }, deadline - audioCtx.currentTime + 2000);
    drumModuleMapping.forEach(function (pair) {
      var drumID = pair[0], drumModuleTrigger = pair[1];
      var stepID = stepKey(currentPattern, drumID, currentPart, currentVariation, currentStep);
      var drumState = storeState.instrumentState[drumID];
      if (storeState.steps[stepID]) {
        if (previousTriggers[drumID] != null) {
          var prevModule = previousTriggers[drumID];
          prevModule.amplitude.cancelScheduledValues(audioCtx.currentTime);
          prevModule.amplitude.setValueAtTime(prevModule.amplitude.value, audioCtx.currentTime);
          prevModule.amplitude.linearRampToValueAtTime(0, deadline);
          previousTriggers[drumID] = null;
        }
        previousTriggers[drumID] = drumModuleTrigger(audioCtx, accentVCA, deadline, drumState);
      }
    });
  }

  // Minimal WAAClock stand-in: callbackAtTime / repeat / timeStretch / clear.
  function Clock(ctx) {
    this.ctx = ctx;
    this._running = false;
  }
  Clock.prototype.start = function () { this._running = true; };
  Clock.prototype.stop = function () { this._running = false; };
  Clock.prototype.callbackAtTime = function (fn, when) {
    var self = this;
    var ev = {
      next: when,
      interval: 0,
      dead: false,
      timer: 0,
      repeat: function (d) { ev.interval = d; return ev; },
      tolerance: function () { return ev; },
      clear: function () { ev.dead = true; if (ev.timer) clearTimeout(ev.timer); }
    };
    function loop() {
      if (ev.dead || !self._running) return;
      var now = self.ctx.currentTime;
      var ahead = 0.12;
      while (!ev.dead && ev.next <= now + ahead) {
        fn({ deadline: ev.next });
        if (!ev.interval) break;
        ev.next += ev.interval;
      }
      ev.timer = setTimeout(loop, 20);
    }
    ev.timer = setTimeout(loop, 0);
    return ev;
  };
  Clock.prototype.timeStretch = function (t, events, ratio) {
    (events || []).forEach(function (ev) {
      if (!ev || ev.dead) return;
      ev.interval = ev.interval * ratio;
    });
  };

  IO.ACCENT = ACCENT;
  IO.BASS_DRUM = BASS_DRUM;
  IO.SNARE_DRUM = SNARE_DRUM;
  IO.LOW_CONGA_LOW_TOM = LOW_CONGA_LOW_TOM;
  IO.MID_CONGA_MID_TOM = MID_CONGA_MID_TOM;
  IO.HI_CONGA_HI_TOM = HI_CONGA_HI_TOM;
  IO.CLAVES_RIMSHOT = CLAVES_RIMSHOT;
  IO.MARACAS_HANDCLAP = MARACAS_HANDCLAP;
  IO.COWBELL = COWBELL;
  IO.CYMBAL = CYMBAL;
  IO.OPEN_HIHAT = OPEN_HIHAT;
  IO.CLSD_HIHAT = CLSD_HIHAT;
  IO.FIRST_PART = FIRST_PART;
  IO.SECOND_PART = SECOND_PART;
  IO.A_VARIATION = A_VARIATION;
  IO.B_VARIATION = B_VARIATION;
  IO.equalPower = equalPower;
  IO.stepKey = stepKey;
  IO.patternLengthKey = patternLengthKey;
  IO.stepTrigger = stepTrigger;
  IO.Clock = Clock;
  IO.Limiter = Limiter;
  IO.VCA = VCA;
  IO.triggerSilent = function (audioCtx) {
    var buffer = audioCtx.createBuffer(1, 1, 22050);
    var source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
  };
})(window);
