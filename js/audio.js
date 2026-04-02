import { FFT_SIZE, SMOOTHING } from './config.js';
import { state } from './state.js';
import { el, liveCtx, fitCanvas, isLabMode } from './dom.js';
import { dbToLinear, computeAllFeatures, SpectrumBuffer } from './dsp.js';
import { showStatus } from './ui.js';
import { createPendingCapture } from './capture.js';
import { compareLiveToTarget } from './challenge.js';

let drawFrameCount = 0;

export async function initAudio() {
  if (state.audioCtx) return;
  try {
    showStatus('Requesting microphone access…', 'info');
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioCtx.createAnalyser();
    state.analyser.fftSize = FFT_SIZE;
    state.analyser.smoothingTimeConstant = SMOOTHING;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    showStatus(`✓ Microphone active — FFT size ${FFT_SIZE} (${binHz} Hz/bin) — ready to capture!`, 'success');
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
    showStatus('❌ Microphone access denied. Please allow access and try again.', 'error');
  }
}

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

function computeEnergy(dataArray) {
  const start = 4, end = Math.min(200, dataArray.length);
  let sum = 0;
  for (let i = start; i < end; i++) sum += dataArray[i];
  return sum / (end - start);
}

function draw() {
  if (!state.isMicActive) return;
  requestAnimationFrame(draw);
  if (!state.analyser || !state.dataArray) return;

  state.analyser.getByteFrequencyData(state.dataArray);
  state.analyser.getFloatFrequencyData(state.floatFreqData);
  state.analyser.getFloatTimeDomainData(state.floatTimeData);

  for (let i = 0; i < state.floatFreqData.length; i++) {
    state.linearMags[i] = dbToLinear(state.floatFreqData[i]);
  }

  const energy = computeEnergy(state.dataArray);
  state.spectrumBuffer.push(state.linearMags, energy);

  // ── Waterfall render ──
  const canvas = el.liveCanvas;
  const ctx    = liveCtx;
  const dpr    = window.devicePixelRatio || 1;
  const bufW   = canvas.width, bufH = canvas.height;
  const cssW   = bufW / dpr, cssH = bufH / dpr;

  const scrollCss = cssH <= 170 ? 1 : 2;
  const scrollPx  = Math.max(1, Math.round(scrollCss * dpr));

  if (bufH > scrollPx) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(canvas, 0, 0, bufW, bufH - scrollPx, 0, scrollPx, bufW, bufH - scrollPx);
    ctx.restore();
  }

  const maxBins    = state.dataArray.length;
  const targetCols = cssW < 520 ? Math.floor(cssW / 2) : Math.floor(cssW);
  const binsToShow = Math.min(maxBins, Math.max(120, targetCols));
  const barWidth   = cssW / binsToShow;
  const noiseFloor = 18, gamma = 1.6;
  state.lastBinsShown = binsToShow;

  for (let i = 0; i < binsToShow; i++) {
    const val = state.dataArray[i];
    let x = (val - noiseFloor) / (255 - noiseFloor);
    x = Math.max(0, Math.min(1, x));
    x = Math.pow(x, gamma);

    let r = 0, g = 0, b = 0;
    if (x < 0.5) {
      const t = x / 0.5;
      g = Math.floor(255 * t); b = Math.floor(180 + 75 * t);
    } else {
      const t = (x - 0.5) / 0.5;
      r = Math.floor(255 * t); g = 255; b = Math.floor(255 * (1 - t));
    }
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(i * barWidth, 0, Math.max(1, Math.ceil(barWidth)), scrollCss);
  }

  // ── Live readout (throttled) ──
  drawFrameCount++;
  if (drawFrameCount % 8 === 0) updateLiveReadout();

  // ── Auto-capture VAD ──
  if (state.autoCapture.enabled && !state.pendingCapture && isLabMode()) {
    runVAD(energy);
  }

  // ── Challenge comparison ──
  if (state.currentTarget && el.challengeSection.style.display === 'flex') {
    compareLiveToTarget();
  }
}

function updateLiveReadout() {
  if (!state.linearMags || !state.floatTimeData) return;
  const sr = state.audioCtx.sampleRate;
  const fft = state.analyser.fftSize;
  const features = computeAllFeatures(state.linearMags, state.floatTimeData, sr, fft);
  state.liveFeatures = features;

  const silent = features.rmsDb < -50;
  el.livePitch.textContent     = !silent && features.pitchHz > 30 ? `${Math.round(features.pitchHz)} Hz` : '—';
  el.liveCentroid.textContent  = !silent ? `${Math.round(features.spectralCentroid)} Hz` : '—';
  el.liveEnergy.textContent    = !silent ? `${features.rmsDb.toFixed(1)} dB` : '—';
  el.liveFlatness.textContent  = !silent ? features.spectralFlatness.toFixed(3) : '—';
  el.liveBandwidth.textContent = !silent ? `${Math.round(features.spectralBandwidth)} Hz` : '—';
  el.liveRolloff.textContent   = !silent ? `${Math.round(features.spectralRolloff)} Hz` : '—';
}

function runVAD(energy) {
  const now = Date.now();
  if (now < (state.autoCapture.cooldownUntil || 0)) return;
  const alpha = 0.05;

  if (!state.autoCapture.inSpeech) {
    state.autoCapture.baseline = state.autoCapture.baseline
      ? (1 - alpha) * state.autoCapture.baseline + alpha * energy
      : energy;
  }

  const threshold  = state.autoCapture.baseline + 12;
  const startNeed  = 6;
  const endNeed    = 10;
  const minSpeech  = 18;

  if (!state.autoCapture.inSpeech) {
    if (energy > threshold) {
      state.autoCapture.speechFrames++;
      if (state.autoCapture.speechFrames >= startNeed) {
        state.autoCapture.inSpeech = true;
        state.autoCapture.peak = energy;
        state.autoCapture.silenceFrames = 0;
      }
    } else {
      state.autoCapture.speechFrames = 0;
    }
  } else {
    state.autoCapture.peak = Math.max(state.autoCapture.peak, energy);
    if (energy < threshold) {
      state.autoCapture.silenceFrames++;
      if (state.autoCapture.silenceFrames >= endNeed) {
        const strong = state.autoCapture.peak > state.autoCapture.baseline + 18;
        const long   = state.autoCapture.speechFrames >= minSpeech;
        if (strong && long) {
          createPendingCapture();
          state.autoCapture.cooldownUntil = Date.now() + 900;
        }
        state.autoCapture.inSpeech     = false;
        state.autoCapture.speechFrames = 0;
        state.autoCapture.silenceFrames = 0;
        state.autoCapture.peak         = 0;
      }
    } else {
      state.autoCapture.silenceFrames = 0;
      state.autoCapture.speechFrames++;
    }
  }
}
