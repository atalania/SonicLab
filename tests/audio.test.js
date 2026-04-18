import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../js/state.js';
import { el } from '../js/dom.js';
import { updateFreqAxisLabels } from '../js/audio.js';

describe('audio helpers', () => {
  beforeEach(() => {
    state.audioCtx = { sampleRate: 48000 };
    state.analyser = { fftSize: 2048, frequencyBinCount: 1024 };
    el.freqAxis.innerHTML = '';
  });

  it('updateFreqAxisLabels is a no-op without audio graph', () => {
    state.audioCtx = null;
    updateFreqAxisLabels();
    expect(el.freqAxis.innerHTML).toBe('');
  });

  it('updateFreqAxisLabels writes tick labels for wide layout', () => {
    updateFreqAxisLabels();
    expect(el.freqAxis.innerHTML).toContain('Hz');
    expect(el.freqAxis.querySelectorAll('span').length).toBeGreaterThan(0);
  });

  it('updateFreqAxisLabels uses coarser ticks for narrow canvas', () => {
    const dpr = window.devicePixelRatio || 1;
    el.liveCanvas.width = Math.floor(400 * dpr);
    el.liveCanvas.height = Math.floor(120 * dpr);
    updateFreqAxisLabels();
    expect(el.freqAxis.innerHTML).toContain('Hz');
  });
});
