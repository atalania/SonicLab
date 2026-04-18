import { describe, it, expect } from 'vitest';
import {
  dbToLinear,
  computeSpectralCentroid,
  computeSpectralBandwidth,
  computeSpectralRolloff,
  computeSpectralFlatness,
  computeZCR,
  computeRMSdB,
  findDominantFrequencies,
  computeBandEnergies,
  computeAllFeatures,
  frequencyToNoteName,
  labelFrequency,
  generateEducationalNote,
  estimateFormants,
  SpectrumBuffer,
} from '../js/dsp.js';
import { FFT_SIZE } from '../js/config.js';

describe('dbToLinear', () => {
  it('converts 0 dB to 1', () => {
    expect(dbToLinear(0)).toBeCloseTo(1, 6);
  });

  it('clamps very negative dB', () => {
    expect(dbToLinear(-200)).toBeCloseTo(dbToLinear(-100), 6);
  });
});

describe('computeSpectralCentroid', () => {
  it('returns 0 for empty magnitudes', () => {
    expect(computeSpectralCentroid(new Float32Array(0), 48000, 1024)).toBe(0);
  });

  it('returns 0 when total energy is zero', () => {
    const m = new Float32Array(8);
    expect(computeSpectralCentroid(m, 48000, 1024)).toBe(0);
  });

  it('weights energy toward higher bins', () => {
    const m = new Float32Array(16);
    m[10] = 1;
    const c = computeSpectralCentroid(m, 48000, 1024);
    expect(c).toBeGreaterThan(0);
  });
});

describe('computeSpectralBandwidth', () => {
  it('returns 0 when total energy is zero', () => {
    const m = new Float32Array(8);
    expect(computeSpectralBandwidth(m, 1000, 48000, 1024)).toBe(0);
  });
});

describe('computeSpectralRolloff', () => {
  it('handles single-bin spectrum', () => {
    const m = new Float32Array(4);
    m[0] = 1;
    const r = computeSpectralRolloff(m, 48000, 1024, 0.85);
    expect(r).toBeGreaterThanOrEqual(0);
  });
});

describe('computeSpectralFlatness', () => {
  it('returns 0 for empty input', () => {
    expect(computeSpectralFlatness(new Float32Array(0))).toBe(0);
  });

  it('is in [0, 1] for simple spectrum', () => {
    const m = new Float32Array(32);
    for (let i = 1; i < m.length; i++) m[i] = 0.5;
    const f = computeSpectralFlatness(m);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  });
});

describe('computeZCR', () => {
  it('returns 0 for constant signal', () => {
    const t = new Float32Array(100).fill(0.5);
    expect(computeZCR(t)).toBe(0);
  });

  it('counts sign changes', () => {
    const t = new Float32Array([1, -1, 1, -1]);
    expect(computeZCR(t)).toBeCloseTo(1, 5);
  });
});

describe('computeRMSdB', () => {
  it('returns -100 for silence', () => {
    const t = new Float32Array(64);
    expect(computeRMSdB(t)).toBe(-100);
  });
});

describe('findDominantFrequencies', () => {
  it('returns empty when no peaks', () => {
    const m = new Float32Array(20).fill(0.1);
    expect(findDominantFrequencies(m, 48000, 1024, 3)).toEqual([]);
  });
});

describe('computeBandEnergies', () => {
  it('returns zero pct when total energy is zero', () => {
    const m = new Float32Array(8);
    const bands = computeBandEnergies(m, 48000, 1024);
    expect(bands.length).toBeGreaterThan(0);
    expect(bands.every(b => b.pct === 0)).toBe(true);
  });
});

describe('computeAllFeatures', () => {
  it('aggregates feature object', () => {
    const n = 256;
    const mags = new Float32Array(n);
    mags[20] = 1;
    const time = new Float32Array(FFT_SIZE);
    for (let i = 0; i < time.length; i++) time[i] = 0.01 * Math.sin((2 * Math.PI * 200 * i) / 48000);
    const f = computeAllFeatures(mags, time, 48000, n);
    expect(f).toHaveProperty('spectralCentroid');
    expect(f).toHaveProperty('bandEnergies');
    expect(Array.isArray(f.dominantFreqs)).toBe(true);
  });
});

describe('frequencyToNoteName', () => {
  it('returns empty for non-positive freq', () => {
    expect(frequencyToNoteName(0)).toBe('');
    expect(frequencyToNoteName(-1)).toBe('');
  });

  it('names A440', () => {
    expect(frequencyToNoteName(440)).toMatch(/^A/);
  });
});

describe('labelFrequency', () => {
  it('labels fundamental when close to f0', () => {
    expect(labelFrequency(100, 100)).toBe('Fundamental (F0)');
  });

  it('labels formant region F1', () => {
    expect(labelFrequency(500, 0)).toBe('Formant region (F1)');
  });
});

describe('generateEducationalNote', () => {
  it('builds a paragraph from feature bundle', () => {
    const text = generateEducationalNote({
      pitchHz: 120,
      spectralCentroid: 800,
      spectralFlatness: 0.02,
      formants: [{ freq: 400 }, { freq: 1800 }],
      bandEnergies: [{ name: 'Mid', pct: 42, range: [500, 2000] }],
    });
    expect(text).toMatch(/Fundamental|spectral|formant|band/i);
  });
});

describe('estimateFormants', () => {
  it('returns sorted formant candidates for vowel-like spectrum', () => {
    const fftSize = 1024;
    const sampleRate = 48000;
    const mags = new Float32Array(fftSize / 2);
    const bw = sampleRate / fftSize;
    const peakBin = Math.round(700 / bw);
    for (let i = peakBin - 2; i <= peakBin + 2; i++) {
      if (i > 1 && i < mags.length - 2) mags[i] = 5;
    }
    const f = estimateFormants(mags, sampleRate, fftSize);
    expect(Array.isArray(f)).toBe(true);
    if (f.length) {
      expect(f[0].freq).toBeLessThan(f[f.length - 1].freq);
    }
  });
});

describe('SpectrumBuffer', () => {
  it('averages top frames by energy', () => {
    const buf = new SpectrumBuffer(3, 4);
    buf.push(new Float32Array([1, 0, 0, 0]), 0.1);
    buf.push(new Float32Array([0, 1, 0, 0]), 0.9);
    buf.push(new Float32Array([0, 0, 1, 0]), 0.5);
    const avg = buf.getSpeechAverage(2);
    expect(avg).not.toBeNull();
    expect(avg[1]).toBeGreaterThan(avg[0]);
  });

  it('returns null when empty', () => {
    const buf = new SpectrumBuffer(2, 4);
    expect(buf.getSpeechAverage()).toBeNull();
  });
});
