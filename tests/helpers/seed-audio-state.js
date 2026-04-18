import { FFT_SIZE } from '../../js/config.js';
import { state } from '../../js/state.js';
import { SpectrumBuffer } from '../../js/dsp.js';

/** Minimal graph so `capture.js` / `audio.js` paths can run without a real mic. */
export function seedAudioStateForCapture() {
  const binCount = 1024;
  state.audioCtx = { sampleRate: 48000 };
  state.analyser = { fftSize: FFT_SIZE, frequencyBinCount: binCount };
  state.dataArray = new Uint8Array(binCount).fill(40);
  state.floatTimeData = new Float32Array(FFT_SIZE);
  for (let i = 0; i < state.floatTimeData.length; i++) {
    state.floatTimeData[i] = 0.02 * Math.sin((2 * Math.PI * 120 * i) / 48000);
  }
  state.linearMags = new Float32Array(binCount).fill(0.01);
  state.spectrumBuffer = new SpectrumBuffer(90, binCount);
  for (let k = 0; k < 6; k++) {
    state.spectrumBuffer.push(new Float32Array(binCount).fill(0.02 + k * 0.001), 50 + k * 10);
  }
}
