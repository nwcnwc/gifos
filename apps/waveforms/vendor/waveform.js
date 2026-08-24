/* Waveform math from joshwcomeau/waveforms src/helpers/waveform.helpers.js.
 * Classic IIFE. Same sine/square/saw/triangle, harmonics, addition.
 */
(function (root) {
  'use strict';

  function range(start, end, step) {
    var out = [], i;
    step = step || 1;
    for (i = start; i < end; i += step) out.push(i);
    return out;
  }

  function getPositionAtPointRelativeToAxis(shape, frequency, amplitude, progress) {
    var cycleLength, totalLength, progressThroughDrawableArea, positionInRads;
    var progressThroughIteration, adjustedMax, quadrant, progressThroughQuadrant;
    switch (shape) {
      case 'sine':
        cycleLength = Math.PI * 2;
        totalLength = cycleLength * frequency;
        progressThroughDrawableArea = progress * (1 / frequency);
        positionInRads = (progressThroughDrawableArea * totalLength) / 100;
        return Math.sin(positionInRads) * amplitude;
      case 'square':
        progressThroughIteration = progress % 100;
        return progressThroughIteration < 50 ? amplitude : -amplitude;
      case 'sawtooth':
        progressThroughIteration = progress % 100;
        adjustedMax = amplitude * 2;
        return progressThroughIteration * adjustedMax / 100 - amplitude;
      case 'triangle':
        progressThroughIteration = progress % 100;
        quadrant = Math.floor(progressThroughIteration / 25) + 1;
        progressThroughQuadrant = progress % 25;
        switch (quadrant) {
          case 1: return progressThroughQuadrant / 25 * amplitude;
          case 2: return amplitude - progressThroughQuadrant / 25 * amplitude;
          case 3: return amplitude - progressThroughQuadrant / 25 * amplitude - amplitude;
          case 4: return progressThroughQuadrant / 25 * amplitude - amplitude;
          default: return 0;
        }
      default:
        return 0;
    }
  }

  function getPointsForWaveform(shape, frequency, amplitude, width, offset) {
    var ratio = 2;
    var xValues = range(0, width + 1, ratio);
    offset = offset || 0;
    return xValues.map(function (x) {
      var widthOfSingleCycle = width / frequency;
      var progressRelativeToCycles = x / widthOfSingleCycle;
      var progress = progressRelativeToCycles * 100 + offset;
      return {
        x: x,
        y: getPositionAtPointRelativeToAxis(shape, frequency, amplitude, progress)
      };
    });
  }

  function translateAxisRelativeYValue(yValue, height) {
    yValue *= -1;
    return ((yValue + 1) * height) / 2;
  }

  function applyWaveformAddition(mainWave, appliedWaves, ratio) {
    if (ratio === 0) return mainWave;
    return mainWave.map(function (point, index) {
      var applied = 0, i;
      for (i = 0; i < appliedWaves.length; i++) {
        if (appliedWaves[i][index]) applied += appliedWaves[i][index].y;
      }
      return { x: point.x, y: point.y * (1 - ratio) + applied * ratio };
    });
  }

  function getHarmonicsForWave(shape, baseFrequency, baseAmplitude, maxNumberToGenerate) {
    var i, harmonicIndex, out = [];
    if (!maxNumberToGenerate) return out;
    if (shape === 'sine') return out;
    if (shape === 'sawtooth') {
      for (i = 1; i <= maxNumberToGenerate; i++) {
        harmonicIndex = i + 1;
        out.push({ shape: 'sine', frequency: baseFrequency * harmonicIndex, amplitude: baseAmplitude / harmonicIndex });
      }
      return out;
    }
    if (shape === 'square') {
      for (i = 1; i <= maxNumberToGenerate; i++) {
        harmonicIndex = i * 2 + 1;
        out.push({ shape: 'sine', frequency: baseFrequency * harmonicIndex, amplitude: baseAmplitude / harmonicIndex });
      }
      return out;
    }
    if (shape === 'triangle') {
      for (i = 1; i <= maxNumberToGenerate; i++) {
        harmonicIndex = i * 2 + 1;
        out.push({
          shape: 'sine',
          frequency: baseFrequency * harmonicIndex,
          amplitude: baseAmplitude / (harmonicIndex * harmonicIndex) * (i % 2 !== 0 ? -1 : 1)
        });
      }
    }
    return out;
  }

  root.WaveformMath = {
    range: range,
    getPositionAtPointRelativeToAxis: getPositionAtPointRelativeToAxis,
    getPointsForWaveform: getPointsForWaveform,
    translateAxisRelativeYValue: translateAxisRelativeYValue,
    applyWaveformAddition: applyWaveformAddition,
    getHarmonicsForWave: getHarmonicsForWave,
    SHAPES: ['sine', 'triangle', 'square', 'sawtooth']
  };
})(typeof window !== 'undefined' ? window : this);
