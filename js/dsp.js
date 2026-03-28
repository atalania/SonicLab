import { FREQ_BANDS } from './config.js';

// ── Conversions ──────────────────────────────────────

export function dbToLinear(dB) {
  return Math.pow(10, Math.max(dB, -100) / 20);
}

// ── Spectral Features ────────────────────────────────

export function computeSpectralCentroid(mags, sampleRate, fftSize) {
  const bw = sampleRate / fftSize;
  let ws = 0, total = 0;
  for (let i = 1; i < mags.length; i++) {
    ws += (i * bw) * mags[i];
    total += mags[i];
  }
  return total > 0 ? ws / total : 0;
}

export function computeSpectralBandwidth(mags, centroid, sampleRate, fftSize) {
  const bw = sampleRate / fftSize;
  let wv = 0, total = 0;
  for (let i = 1; i < mags.length; i++) {
    const freq = i * bw;
    wv += mags[i] * (freq - centroid) * (freq - centroid);
    total += mags[i];
  }
  return total > 0 ? Math.sqrt(wv / total) : 0;
}

export function computeSpectralRolloff(mags, sampleRate, fftSize, pct = 0.85) {
  const bw = sampleRate / fftSize;
  let totalE = 0;
  for (let i = 0; i < mags.length; i++) totalE += mags[i] * mags[i];
  let cum = 0;
  for (let i = 0; i < mags.length; i++) {
    cum += mags[i] * mags[i];
    if (cum >= pct * totalE) return i * bw;
  }
  return (mags.length - 1) * bw;
}

export function computeSpectralFlatness(mags) {
  let logS = 0, linS = 0, n = 0;
  for (let i = 1; i < mags.length; i++) {
    const m = Math.max(mags[i], 1e-12);
    logS += Math.log(m);
    linS += m;
    n++;
  }
  if (n === 0 || linS === 0) return 0;
  return Math.min(1, Math.max(0, Math.exp(logS / n) / (linS / n)));
}

// ── Time-Domain Features ─────────────────────────────

export function computeZCR(timeData) {
  let c = 0;
  for (let i = 1; i < timeData.length; i++) {
    if ((timeData[i] >= 0) !== (timeData[i - 1] >= 0)) c++;
  }
  return c / (timeData.length - 1);
}

export function computeRMSdB(timeData) {
  let s = 0;
  for (let i = 0; i < timeData.length; i++) s += timeData[i] * timeData[i];
  const rms = Math.sqrt(s / timeData.length);
  return rms > 0 ? 20 * Math.log10(rms) : -100;
}

// ── Peak / Formant Detection ─────────────────────────

export function findDominantFrequencies(mags, sampleRate, fftSize, numPeaks = 6) {
  const bw = sampleRate / fftSize;
  const peaks = [];
  for (let i = 3; i < mags.length - 3; i++) {
    if (mags[i] > mags[i - 1] && mags[i] > mags[i + 1] &&
        mags[i] > mags[i - 2] && mags[i] > mags[i + 2]) {
      peaks.push({ freq: i * bw, magnitude: mags[i] });
    }
  }
  peaks.sort((a, b) => b.magnitude - a.magnitude);
  return peaks.slice(0, numPeaks);
}

export function estimateFormants(mags, sampleRate, fftSize) {
  const bw = sampleRate / fftSize;
  const win = Math.ceil(300 / bw);
  const smoothed = new Float32Array(mags.length);
  for (let i = 0; i < mags.length; i++) {
    let s = 0, c = 0;
    const lo = Math.max(0, i - win), hi = Math.min(mags.length - 1, i + win);
    for (let j = lo; j <= hi; j++) { s += mags[j]; c++; }
    smoothed[i] = s / c;
  }
  const minB = Math.ceil(200 / bw);
  const maxB = Math.min(mags.length - 1, Math.floor(5000 / bw));
  const formants = [];
  for (let i = minB + 1; i < maxB; i++) {
    if (smoothed[i] > smoothed[i - 1] && smoothed[i] > smoothed[i + 1]) {
      formants.push({ freq: i * bw, magnitude: smoothed[i] });
    }
  }
  formants.sort((a, b) => b.magnitude - a.magnitude);
  return formants.slice(0, 4).sort((a, b) => a.freq - b.freq);
}

// ── Band Energies ────────────────────────────────────

export function computeBandEnergies(mags, sampleRate, fftSize) {
  const bw = sampleRate / fftSize;
  let totalE = 0;
  for (let i = 0; i < mags.length; i++) totalE += mags[i] * mags[i];
  return FREQ_BANDS.map(band => {
    const s = Math.max(0, Math.floor(band.range[0] / bw));
    const e = Math.min(mags.length, Math.ceil(band.range[1] / bw));
    let energy = 0;
    for (let i = s; i < e; i++) energy += mags[i] * mags[i];
    return { ...band, energy, pct: totalE > 0 ? (energy / totalE * 100) : 0 };
  });
}

// ── Pitch Detection (Autocorrelation) ────────────────

export function detectPitchAutocorrelation(buffer, sampleRate) {
  const SIZE = buffer.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return { pitchHz: 0, clarity: 0 };

  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.floor(sampleRate / 60);
  let bestLag = -1, bestCorr = -1;

  for (let lag = minLag; lag <= Math.min(maxLag, SIZE - 1); lag++) {
    let corr = 0;
    for (let i = 0; i < SIZE - lag; i++) corr += buffer[i] * buffer[i + lag];
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }

  if (bestLag === -1 || bestCorr <= 0) return { pitchHz: 0, clarity: 0 };

  let zeroLag = 0;
  for (let i = 0; i < SIZE; i++) zeroLag += buffer[i] * buffer[i];
  const clarity = zeroLag > 0 ? bestCorr / zeroLag : 0;

  // Parabolic interpolation for sub-bin accuracy
  if (bestLag > 0 && bestLag < SIZE - 1) {
    let y1 = 0, y2 = 0, y3 = 0;
    for (let i = 0; i < SIZE - bestLag - 1; i++) {
      y1 += buffer[i] * buffer[i + bestLag - 1];
      y2 += buffer[i] * buffer[i + bestLag];
      y3 += buffer[i] * buffer[i + bestLag + 1];
    }
    const shift = (y1 - y3) / (2 * (y1 - 2 * y2 + y3));
    if (Number.isFinite(shift) && Math.abs(shift) < 1) {
      return {
        pitchHz: Math.round(sampleRate / (bestLag + shift) * 10) / 10,
        clarity: Math.max(0, Math.min(1, Math.round(clarity * 100) / 100))
      };
    }
  }

  const pitchHz = sampleRate / bestLag;
  return {
    pitchHz: Number.isFinite(pitchHz) ? Math.round(pitchHz * 10) / 10 : 0,
    clarity: Math.max(0, Math.min(1, Math.round(clarity * 100) / 100))
  };
}

// ── Helpers ──────────────────────────────────────────

export function frequencyToNoteName(freq) {
  if (freq <= 0) return '';
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const semi = 12 * Math.log2(freq / 440);
  const idx = Math.round(semi) + 69;
  if (idx < 0 || idx > 127) return '';
  return names[idx % 12] + (Math.floor(idx / 12) - 1);
}

export function labelFrequency(freq, f0) {
  const ord = n => n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  if (f0 > 30) {
    if (Math.abs(freq - f0) < f0 * 0.06) return 'Fundamental (F0)';
    for (let h = 2; h <= 10; h++) {
      if (Math.abs(freq - f0 * h) < f0 * 0.08) return `${h}${ord(h)} harmonic`;
    }
  }
  if (freq >= 200 && freq <= 900) return 'Formant region (F1)';
  if (freq >= 900 && freq <= 2500) return 'Formant region (F2)';
  if (freq >= 2500 && freq <= 3500) return 'Formant region (F3)';
  return frequencyToNoteName(freq);
}

// ── Aggregate Feature Computation ────────────────────

export function computeAllFeatures(magnitudes, timeData, sampleRate, fftSize) {
  const centroid = computeSpectralCentroid(magnitudes, sampleRate, fftSize);
  const pitch = detectPitchAutocorrelation(timeData, sampleRate);
  return {
    pitchHz: pitch.pitchHz,
    pitchClarity: pitch.clarity,
    spectralCentroid: Math.round(centroid * 10) / 10,
    spectralBandwidth: Math.round(computeSpectralBandwidth(magnitudes, centroid, sampleRate, fftSize) * 10) / 10,
    spectralRolloff: Math.round(computeSpectralRolloff(magnitudes, sampleRate, fftSize) * 10) / 10,
    spectralFlatness: Math.round(computeSpectralFlatness(magnitudes) * 1000) / 1000,
    rmsDb: Math.round(computeRMSdB(timeData) * 10) / 10,
    zcr: Math.round(computeZCR(timeData) * 10000) / 10000,
    dominantFreqs: findDominantFrequencies(magnitudes, sampleRate, fftSize),
    formants: estimateFormants(magnitudes, sampleRate, fftSize),
    bandEnergies: computeBandEnergies(magnitudes, sampleRate, fftSize)
  };
}

// ── Educational Note Generation ──────────────────────

export function generateEducationalNote(features) {
  const notes = [];
  if (features.pitchHz > 30) {
    const hz = Math.round(features.pitchHz);
    const note = frequencyToNoteName(features.pitchHz);
    if (hz < 150) notes.push(`Fundamental frequency: ${hz} Hz (${note}) — typical adult male range (85–180 Hz). This is the rate at which the vocal folds vibrate.`);
    else if (hz < 260) notes.push(`Fundamental frequency: ${hz} Hz (${note}) — typical adult female range (165–255 Hz). The vocal folds vibrate ${hz} times per second.`);
    else notes.push(`Fundamental frequency: ${hz} Hz (${note}) — a higher register, common in children's voices or falsetto.`);
  }
  if (features.spectralCentroid > 0) {
    const c = Math.round(features.spectralCentroid);
    if (c < 1000) notes.push(`Spectral centroid at ${c} Hz indicates a darker, warmer tonal quality.`);
    else if (c < 2000) notes.push(`Spectral centroid at ${c} Hz shows balanced brightness — typical of natural speech.`);
    else notes.push(`Spectral centroid at ${c} Hz indicates a bright, energetic sound.`);
  }
  if (features.spectralFlatness > 0.3) {
    notes.push(`Spectral flatness of ${features.spectralFlatness.toFixed(3)} is high, indicating noise-like content — common in fricatives or whispers.`);
  } else if (features.spectralFlatness < 0.05) {
    notes.push(`Spectral flatness of ${features.spectralFlatness.toFixed(3)} is very low, indicating a strongly tonal signal with clear harmonics.`);
  }
  if (features.formants.length >= 2) {
    const f1 = Math.round(features.formants[0].freq);
    const f2 = Math.round(features.formants[1].freq);
    notes.push(`Estimated formants: F1 ≈ ${f1} Hz, F2 ≈ ${f2} Hz. Formants define vowel identity — F1 correlates with jaw openness, F2 with tongue position.`);
  }
  if (features.bandEnergies) {
    const max = features.bandEnergies.reduce((a, b) => a.pct > b.pct ? a : b);
    if (max.pct > 30) {
      notes.push(`Dominant energy band: ${max.name} (${max.range[0]}–${max.range[1]} Hz) carrying ${max.pct.toFixed(1)}% of total spectral energy.`);
    }
  }
  return notes.join(' ');
}

// ── Spectrum Ring Buffer ─────────────────────────────

export class SpectrumBuffer {
  constructor(maxFrames, binCount) {
    this.maxFrames = maxFrames;
    this.binCount = binCount;
    this.frames = [];
    this.energies = [];
  }

  push(linearMags, energy) {
    if (this.frames.length >= this.maxFrames) {
      this.frames.shift();
      this.energies.shift();
    }
    this.frames.push(new Float32Array(linearMags));
    this.energies.push(energy);
  }

  getSpeechAverage(topN = 20) {
    if (this.frames.length === 0) return null;
    const indexed = this.energies.map((e, i) => ({ e, i }));
    indexed.sort((a, b) => b.e - a.e);
    const pick = indexed.slice(0, Math.min(topN, indexed.length));
    const avg = new Float32Array(this.binCount);
    for (const { i } of pick) {
      for (let k = 0; k < this.binCount; k++) avg[k] += this.frames[i][k];
    }
    for (let k = 0; k < this.binCount; k++) avg[k] /= pick.length;
    return avg;
  }

  clear() { this.frames = []; this.energies = []; }
}
