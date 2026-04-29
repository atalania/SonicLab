import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as ai from '../js/ai.js';
import { state } from '../js/state.js';
import { el } from '../js/dom.js';
import {
  openLabelModal,
  closeLabelModal,
  captureWord,
  createPendingCapture,
  savePendingCapture,
} from '../js/capture.js';
import { seedAudioStateForCapture } from './helpers/seed-audio-state.js';

describe('capture modal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    el.labelModal.classList.remove('visible');
    el.modalWordInput.value = 'x';
    el.modalWordInput.focus = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('openLabelModal shows overlay and focuses input', () => {
    openLabelModal();
    expect(el.labelModal.classList.contains('visible')).toBe(true);
    expect(el.modalWordInput.value).toBe('');
    vi.advanceTimersByTime(150);
    expect(el.modalWordInput.focus).toHaveBeenCalled();
  });

  it('closeLabelModal hides overlay', () => {
    el.labelModal.classList.add('visible');
    closeLabelModal();
    expect(el.labelModal.classList.contains('visible')).toBe(false);
  });
});

describe('capture pipeline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    seedAudioStateForCapture();
    state.library.length = 0;
    state.pendingCapture = null;
    el.wordInput.value = '';
    el.gallery.innerHTML = '';
    el.recordingIndicator.classList.remove('active');
    el.captureBtn.disabled = false;
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    Object.defineProperty(window, 'parent', {
      value: { postMessage: vi.fn() },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'parent', {
      value: window,
      configurable: true,
      writable: true,
    });
  });

  it('captureWord alerts on empty word', async () => {
    el.wordInput.value = '   ';
    await captureWord();
    expect(window.alert).toHaveBeenCalled();
  });

  it('captureWord alerts on duplicate word', async () => {
    state.library.push({ word: 'DUPE' });
    el.wordInput.value = 'dupe';
    await captureWord();
    expect(window.alert).toHaveBeenCalled();
  });

  it('captureWord saves analysis and updates gallery', async () => {
    vi.spyOn(ai, 'analyzeSound').mockResolvedValue({
      analysis: 'Line1\nLine2',
      report: {
        summary: 's',
        what_it_means: 'w',
        try_this: 't',
        vocab: { term: 'a', definition: 'b' },
      },
      metrics: { dominant_hz: 0 },
    });
    el.wordInput.value = 'alpha';
    await captureWord();
    vi.advanceTimersByTime(2000);
    expect(state.library.length).toBe(1);
    expect(state.library[0].word).toBe('ALPHA');
    expect(el.gallery.querySelectorAll('.capture-card').length).toBe(1);
  });

  it('captureWord uses offline educational note when analyzeSound rejects', async () => {
    vi.spyOn(ai, 'analyzeSound').mockRejectedValue(new Error('offline'));
    el.wordInput.value = 'beta';
    await captureWord();
    vi.advanceTimersByTime(2000);
    // The fallback path now stores the locally-generated educational note
    // (computed from the captured features) instead of a placeholder string,
    // so the gallery card has something useful to display.
    expect(state.library[0].analysis).toMatch(/Hz|spectral|fundamental|flatness|centroid/i);
  });

  it('createPendingCapture stores snapshot and opens modal', () => {
    createPendingCapture();
    expect(state.pendingCapture).not.toBeNull();
    expect(el.labelModal.classList.contains('visible')).toBe(true);
  });

  it('savePendingCapture commits pending capture', async () => {
    const pendingImg = document.createElement('canvas');
    pendingImg.width = 10;
    pendingImg.height = 10;
    state.pendingCapture = {
      img: pendingImg,
      freq: new Uint8Array(64).fill(3),
      magnitudes: new Float32Array(128).fill(0.01),
      features: {
        pitchHz: 0,
        spectralCentroid: 1000,
        spectralBandwidth: 200,
        spectralRolloff: 1000,
        spectralFlatness: 0.1,
        rmsDb: -20,
        zcr: 0.01,
        pitchClarity: 0,
        bandEnergies: [],
        dominantFreqs: [],
        formants: [],
      },
      timestamp: 'now',
    };
    vi.spyOn(ai, 'analyzeSound').mockResolvedValue({
      analysis: 'ok',
      report: {},
      metrics: {},
    });
    await savePendingCapture('gamma');
    vi.advanceTimersByTime(2000);
    expect(state.pendingCapture).toBeNull();
    expect(state.library.some(i => i.word === 'gamma')).toBe(true);
  });
});
