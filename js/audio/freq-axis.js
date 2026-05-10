import { state } from '../state.js';
import { el } from '../dom.js';

export function updateFreqAxisLabels() {
  if (!state.audioCtx || !state.analyser) return;
  const binWidth = state.audioCtx.sampleRate / state.analyser.fftSize;
  const maxBins = state.analyser.frequencyBinCount;
  const dpr = window.devicePixelRatio || 1;
  const cssW = el.liveCanvas.width / dpr;
  const targetCols = cssW < 520 ? Math.floor(cssW / 2) : Math.floor(cssW);
  const binsToShow = Math.min(maxBins, Math.max(120, targetCols));
  const maxFreq = binsToShow * binWidth;

  let step;
  if (maxFreq > 15000) step = 4000;
  else if (maxFreq > 8000) step = 2000;
  else if (maxFreq > 4000) step = 1000;
  else step = 500;

  const labels = [];
  for (let f = 0; f <= maxFreq; f += step) {
    labels.push(f === 0 ? '0' : f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)}k` : `${f}`);
  }
  el.freqAxis.innerHTML = labels.map(l => `<span>${l} Hz</span>`).join('');
}
