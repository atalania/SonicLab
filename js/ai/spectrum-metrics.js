export function analyzeFrequencySpectrum(freqValues, _word, sampleRate = 44100, fftSize = 1024) {
  if (!freqValues || freqValues.length === 0) {
    return {
      dominant_bin: 0, dominant_hz: 0, dominant_region: 'unknown',
      avg_amplitude: 0, max_amplitude: 0,
      energy_distribution: { low: 0, mid: 0, high: 0 },
      peakiness: 0, spectral_centroid: 0, spectral_spread: 0,
    };
  }

  const maxAmp = Math.max(...freqValues);
  const domBin = freqValues.indexOf(maxAmp);
  const avgAmp = freqValues.reduce((a, b) => a + b, 0) / freqValues.length;
  const hzPerBin = sampleRate / fftSize;
  const domHz = domBin * hzPerBin;
  const domRegion = domHz < 300 ? 'low-frequency range' : domHz < 1200 ? 'mid-frequency range' : 'high-frequency range';

  const n = freqValues.length;
  const lowE = freqValues.slice(0, Math.floor(n * 0.33)).reduce((a, b) => a + b, 0);
  const midE = freqValues.slice(Math.floor(n * 0.33), Math.floor(n * 0.66)).reduce((a, b) => a + b, 0);
  const highE = freqValues.slice(Math.floor(n * 0.66)).reduce((a, b) => a + b, 0);
  const totalE = lowE + midE + highE;

  const energyDist = totalE > 0
    ? { low: +(lowE / totalE * 100).toFixed(1), mid: +(midE / totalE * 100).toFixed(1), high: +(highE / totalE * 100).toFixed(1) }
    : { low: 0, mid: 0, high: 0 };

  const peakiness = +(maxAmp / (avgAmp + 1e-6)).toFixed(2);

  const weightedSum = freqValues.reduce((s, v, i) => s + i * v, 0);
  const total = freqValues.reduce((a, b) => a + b, 0) + 1e-6;
  const centroid = weightedSum / total;
  const spread = Math.sqrt(freqValues.reduce((s, v, i) => s + ((i - centroid) ** 2) * v, 0) / total);

  return {
    dominant_bin: domBin,
    dominant_hz: +domHz.toFixed(2),
    dominant_region: domRegion,
    avg_amplitude: +avgAmp.toFixed(2),
    max_amplitude: maxAmp,
    energy_distribution: energyDist,
    peakiness,
    spectral_centroid: +centroid.toFixed(2),
    spectral_spread: +spread.toFixed(2),
  };
}
