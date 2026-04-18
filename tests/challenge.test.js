import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state } from '../js/state.js';
import { el } from '../js/dom.js';
import { startRound, redrawMystery, compareLiveToTarget } from '../js/challenge.js';

function makeLibraryWord(word) {
  const img = document.createElement('canvas');
  img.width = 48;
  img.height = 24;
  const ctx = img.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 48, 24);
  return {
    word,
    img,
    freq: new Uint8Array(128).fill(10),
    magnitudes: new Float32Array(128).fill(0.01),
    features: {
      spectralCentroid: 1500,
      spectralBandwidth: 400,
      spectralRolloff: 3000,
      spectralFlatness: 0.08,
      bandEnergies: [
        { name: 'Mid', pct: 40, range: [500, 2000], color: '#39ff14' },
        { name: 'Bass', pct: 20, range: [80, 250], color: '#ff6b35' },
      ],
      pitchHz: 120,
      dominantFreqs: [{ freq: 200, magnitude: 1 }],
      formants: [{ freq: 500, magnitude: 1 }],
      zcr: 0.02,
      pitchClarity: 0.5,
      rmsDb: -25,
    },
    analysis: 'Test analysis text',
    timestamp: '12:00:00',
  };
}

describe('challenge', () => {
  beforeEach(() => {
    const postMessage = vi.fn();
    Object.defineProperty(window, 'parent', {
      value: { postMessage },
      configurable: true,
      writable: true,
    });
    state.library.length = 0;
    state.totalRounds = 0;
    state.score = 0;
    state.difficulty = 2;
    state.currentTarget = null;
    state.liveFeatures = null;
    el.optionsContainer.innerHTML = '';
    el.feedback.textContent = '';
    el.challengeSection.style.display = 'flex';
    el.nextQ.textContent = '';
    el.studentTranscript.textContent = '';
    el.aiReply.textContent = '';
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
  });

  afterEach(() => {
    Object.defineProperty(window, 'parent', {
      value: window,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('startRound builds options and increments rounds', () => {
    for (const w of ['A', 'B', 'C', 'D']) state.library.push(makeLibraryWord(w));
    startRound();
    expect(state.totalRounds).toBe(1);
    expect(state.currentTarget).toBeTruthy();
    expect(el.optionsContainer.querySelectorAll('.option-btn').length).toBeGreaterThanOrEqual(1);
  });

  it('redrawMystery draws current target spectrogram', () => {
    state.currentTarget = makeLibraryWord('Z');
    expect(() => redrawMystery()).not.toThrow();
  });

  it('redrawMystery is a no-op without target', () => {
    state.currentTarget = null;
    expect(() => redrawMystery()).not.toThrow();
  });

  it('compareLiveToTarget shows zero meter without live features', () => {
    state.liveFeatures = null;
    state.currentTarget = makeLibraryWord('A');
    compareLiveToTarget();
    expect(el.aiMeterBar.style.width).toBe('0%');
  });

  it('compareLiveToTarget shows zero when target has no features', () => {
    state.liveFeatures = makeLibraryWord('A').features;
    state.currentTarget = makeLibraryWord('A');
    state.currentTarget.features = null;
    compareLiveToTarget();
    expect(el.aiMeterBar.style.width).toBe('0%');
  });

  it('compareLiveToTarget shows zero when live RMS is very low', () => {
    state.currentTarget = makeLibraryWord('A');
    state.liveFeatures = { ...makeLibraryWord('A').features, rmsDb: -60 };
    compareLiveToTarget();
    expect(el.aiMeterBar.style.width).toBe('0%');
  });

  it('compareLiveToTarget scores similarity including band and pitch branches', () => {
    const base = makeLibraryWord('A').features;
    state.currentTarget = makeLibraryWord('A');
    state.liveFeatures = {
      ...base,
      spectralCentroid: base.spectralCentroid * 1.02,
      spectralBandwidth: base.spectralBandwidth * 1.02,
      spectralRolloff: base.spectralRolloff * 1.02,
      spectralFlatness: base.spectralFlatness * 1.02,
      bandEnergies: base.bandEnergies,
      pitchHz: 130,
      rmsDb: -20,
    };
    compareLiveToTarget();
    const pct = Number.parseFloat(String(el.aiMeterBar.style.width).replace('%', ''));
    expect(pct).toBeGreaterThan(0);
  });

  it('compareLiveToTarget handles both pitch estimates missing', () => {
    state.currentTarget = makeLibraryWord('A');
    state.currentTarget.features.pitchHz = 0;
    state.liveFeatures = {
      ...makeLibraryWord('A').features,
      pitchHz: 0,
      rmsDb: -20,
    };
    compareLiveToTarget();
    expect(el.aiMeterBar.style.width).toMatch(/\d/);
  });
});
