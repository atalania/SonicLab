import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { state } from '../js/state.js';
import { el } from '../js/dom.js';
import { updateFreqAxisLabels, initAudio } from '../js/audio.js';

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

describe('initAudio', () => {
  let rafCount = 0;

  beforeEach(() => {
    rafCount = 0;
    state.audioCtx = null;
    state.analyser = null;
    state.dataArray = null;
    state.floatFreqData = null;
    state.floatTimeData = null;
    state.linearMags = null;
    state.spectrumBuffer = null;
    state.isMicActive = false;
    el.startBtn.disabled = false;
    el.startBtn.textContent = 'start';
    el.wordHint.textContent = '';
    vi.spyOn(console, 'error').mockImplementation(() => {});

    class FakeAnalyser {
      fftSize = 2048;
      frequencyBinCount = 1024;
      smoothingTimeConstant = 0;
      getByteFrequencyData(a) {
        a.fill(50);
      }
      getFloatFrequencyData(a) {
        a.fill(-48);
      }
      getFloatTimeDomainData(a) {
        for (let i = 0; i < a.length; i++) a[i] = 0.05;
      }
    }

    class FakeCtx {
      sampleRate = 48000;
      createAnalyser() {
        return new FakeAnalyser();
      }
      createMediaStreamSource() {
        return { connect() {} };
      }
    }

    globalThis.AudioContext = FakeCtx;
    globalThis.webkitAudioContext = undefined;
    globalThis.navigator.mediaDevices = {
      getUserMedia: vi.fn(async () => ({})),
    };

    vi.stubGlobal('requestAnimationFrame', (cb) => {
      if (state.isMicActive && rafCount++ > 2) state.isMicActive = false;
      queueMicrotask(() => cb());
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns immediately when audio context already exists', async () => {
    state.audioCtx = new globalThis.AudioContext();
    await initAudio();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('starts analyser pipeline on success', async () => {
    await initAudio();
    expect(state.audioCtx).toBeTruthy();
    expect(el.startBtn.textContent).toContain('Mic Active');
  });

  it('shows an error when microphone permission fails', async () => {
    state.audioCtx = null;
    navigator.mediaDevices.getUserMedia = vi.fn(async () => {
      throw new Error('denied');
    });
    await initAudio();
    expect(el.wordHint.textContent).toMatch(/denied|Microphone/i);
  });
});
