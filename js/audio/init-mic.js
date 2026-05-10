import { FFT_SIZE, SMOOTHING } from '../config.js';
import { state } from '../state.js';
import { el } from '../dom.js';
import { SpectrumBuffer } from '../dsp.js';
import { showStatus } from '../ui.js';
import { explainMicFailure } from './mic-errors.js';
import { updateFreqAxisLabels } from './freq-axis.js';
import { draw } from './live-loop.js';

export async function initAudio() {
  if (state.audioCtx) return;
  try {
    showStatus('Requesting microphone access…', 'info');
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = FFT_SIZE;
    state.analyser.smoothingTimeConstant = SMOOTHING;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recordingStream = stream;
    const source = state.audioCtx.createMediaStreamSource(stream);
    source.connect(state.analyser);

    const binCount = state.analyser.frequencyBinCount;
    state.dataArray     = new Uint8Array(binCount);
    state.floatFreqData = new Float32Array(binCount);
    state.floatTimeData = new Float32Array(state.analyser.fftSize);
    state.linearMags    = new Float32Array(binCount);
    state.spectrumBuffer = new SpectrumBuffer(90, binCount);
    state.isMicActive   = true;

    const binHz = Math.round(state.audioCtx.sampleRate / FFT_SIZE);
    showStatus(
      `✓ Mic on (${FFT_SIZE} FFT, ${binHz} Hz/bin). Type a word, say it, tap Capture — or turn on Auto, speak one word, pause, then label it.`,
      'success'
    );
    el.startBtn.disabled = true;
    el.startBtn.textContent = '✓ Mic Active';
    el.captureBtn.disabled = false;
    el.autoBtn.disabled = false;
    el.spectrumBadge.textContent = 'LIVE';
    el.liveCanvas.classList.add('glowing');
    el.liveReadout.style.display = 'grid';

    updateFreqAxisLabels();
    draw();
  } catch (err) {
    console.error('Microphone error:', err);
    showStatus(explainMicFailure(err), 'error');
  }
}
