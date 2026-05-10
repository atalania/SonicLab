import { state } from '../state.js';
import { el, liveCtx, isLabMode } from '../dom.js';
import { dbToLinear, computeAllFeatures } from '../dsp.js';
import { showStatus } from '../ui.js';
import { createPendingCapture } from '../capture.js';
import { compareLiveToTarget } from '../challenge.js';

let drawFrameCount = 0;
/** Throttle on-screen hints when Auto Capture hears speech but rejects the burst. */
let lastVadRejectHintAt = 0;

function computeEnergy(dataArray) {
  const start = 4, end = Math.min(200, dataArray.length);
  let sum = 0;
  for (let i = start; i < end; i++) sum += dataArray[i];
  return sum / (end - start);
}

export function draw() {
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

  drawFrameCount = (drawFrameCount + 1) % 1_000_000;
  if (drawFrameCount % 8 === 0) updateLiveReadout();

  if (state.autoCapture.enabled && !state.pendingCapture && isLabMode()) {
    runVAD(energy);
  }

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
    state.autoCapture.baseline = state.autoCapture.baseline == null
      ? energy
      : (1 - alpha) * state.autoCapture.baseline + alpha * energy;
  }

  const threshold  = state.autoCapture.baseline + 8;
  const startNeed  = 4;
  const endNeed    = 8;
  const minSpeech  = 12;

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
        const strong = state.autoCapture.peak > state.autoCapture.baseline + 10;
        const long   = state.autoCapture.speechFrames >= minSpeech;
        if (strong && long) {
          createPendingCapture();
          state.autoCapture.cooldownUntil = Date.now() + 900;
        } else {
          state.autoCapture.cooldownUntil = Date.now() + 300;
          const t = Date.now();
          if (t - lastVadRejectHintAt > 2800) {
            lastVadRejectHintAt = t;
            if (!long) {
              showStatus('Auto: keep the word going a bit longer (~½ second), then pause.', 'info');
            } else if (!strong) {
              showStatus('Auto: try a bit louder or closer to the mic, then pause after the word.', 'info');
            }
          }
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
