import { analyzeSound } from './ai.js';
import { state } from './state.js';
import { el, liveCtx } from './dom.js';
import { computeAllFeatures, generateEducationalNote } from './dsp.js';
import { showStatus, updateProgress, updateStats } from './ui.js';
import { addToGallery } from './gallery.js';
import { saveToLocalStorage } from './storage.js';
import { fireCaptureComplete, fireDatasetComplete } from './portal.js';

export function openLabelModal() {
  el.labelModal.classList.add('visible');
  el.modalWordInput.value = '';
  setTimeout(() => el.modalWordInput.focus(), 100);
}

export function closeLabelModal() {
  el.labelModal.classList.remove('visible');
}

export function createPendingCapture() {
  const dpr  = window.devicePixelRatio || 1;
  const cssW = el.liveCanvas.width / dpr;
  const cssH = el.liveCanvas.height / dpr;

  const snap = document.createElement('canvas');
  snap.width = cssW; snap.height = cssH;
  snap.getContext('2d').drawImage(
    el.liveCanvas, 0, 0, el.liveCanvas.width, el.liveCanvas.height, 0, 0, cssW, cssH
  );

  const sr = state.audioCtx.sampleRate;
  const fft = state.analyser.fftSize;
  const avgMags = state.spectrumBuffer.getSpeechAverage(25) || new Float32Array(state.linearMags);
  const features = computeAllFeatures(avgMags, state.floatTimeData, sr, fft);

  state.pendingCapture = {
    img: snap,
    freq: new Uint8Array(state.dataArray),
    magnitudes: avgMags,
    features,
    timestamp: new Date().toLocaleTimeString()
  };

  openLabelModal();
}

function buildApiPayload(word, freq, features) {
  return {
    word,
    frequencies: Array.from(freq).slice(0, 128),
    sampleRate: state.audioCtx.sampleRate,
    fftSize: state.analyser.fftSize,
    estimatedPitchHz: features?.pitchHz || 0,
    pitchClarity: features?.pitchClarity || 0,
    spectralCentroid: features?.spectralCentroid || 0,
    spectralBandwidth: features?.spectralBandwidth || 0,
    spectralRolloff: features?.spectralRolloff || 0,
    spectralFlatness: features?.spectralFlatness || 0,
    rmsDb: features?.rmsDb || 0,
    dominantFreqs: features?.dominantFreqs?.map(d => ({ freq: Math.round(d.freq), mag: d.magnitude.toFixed(4) })) || [],
    formants: features?.formants?.map(f => Math.round(f.freq)) || [],
    bandEnergies: features?.bandEnergies?.map(b => ({ name: b.name, pct: b.pct.toFixed(1) })) || []
  };
}

async function fetchAnalysis(word, freq, features) {
  try {
    const data = await analyzeSound(buildApiPayload(word, freq, features));
    showStatus(`✓ Analysis complete for "${word}"`, 'success');
    setTimeout(() => showStatus(data.analysis, 'analysis'), 500);
    return data.analysis;
  } catch {
    showStatus('⚠ Connection failed — using offline analysis.', 'error');
    if (features) {
      setTimeout(() => showStatus(generateEducationalNote(features), 'analysis'), 1000);
    }
    return 'Analysis unavailable (Offline Mode)';
  }
}

export async function captureWord() {
  const word = el.wordInput.value.toUpperCase().trim();
  if (!word) { alert('Please type the word you are saying!'); return; }
  if (state.library.some(item => item.word === word)) {
    alert('That word is already captured — use a different one.'); return;
  }

  const dpr  = window.devicePixelRatio || 1;
  const cssW = el.liveCanvas.width / dpr;
  const cssH = el.liveCanvas.height / dpr;

  const snap = document.createElement('canvas');
  snap.width = cssW; snap.height = cssH;
  snap.getContext('2d').drawImage(
    el.liveCanvas, 0, 0, el.liveCanvas.width, el.liveCanvas.height, 0, 0, cssW, cssH
  );

  const sr = state.audioCtx.sampleRate;
  const fft = state.analyser.fftSize;
  const avgMags = state.spectrumBuffer.getSpeechAverage(25) || new Float32Array(state.linearMags);
  const features = computeAllFeatures(avgMags, state.floatTimeData, sr, fft);
  const freq = new Uint8Array(state.dataArray);

  showStatus(`Analyzing spectral data for "${word}"…`, 'loading');
  el.captureBtn.disabled = true;
  el.recordingIndicator.classList.add('active');

  const aiAnalysis = await fetchAnalysis(word, freq, features);

  state.library.push({
    word, img: snap, freq,
    magnitudes: new Float32Array(avgMags),
    features, analysis: aiAnalysis,
    timestamp: new Date().toLocaleTimeString()
  });

  addToGallery(word, snap, state.library.length - 1);
  updateProgress();
  fireCaptureComplete(word, features);
  if (state.library.length === 4) fireDatasetComplete();
  el.wordInput.value = '';
  el.captureBtn.disabled = false;
  el.recordingIndicator.classList.remove('active');
  if (state.library.length === 1) el.statsBar.style.display = 'flex';
  saveToLocalStorage();
}

export async function savePendingCapture(word) {
  const pending = state.pendingCapture;
  if (!pending) return;
  closeLabelModal();

  showStatus(`Analyzing spectral data for "${word}"…`, 'loading');
  el.recordingIndicator.classList.add('active');

  const aiAnalysis = await fetchAnalysis(word, pending.freq, pending.features);

  state.library.push({
    word, img: pending.img, freq: pending.freq,
    magnitudes: pending.magnitudes,
    features: pending.features,
    analysis: aiAnalysis, timestamp: pending.timestamp
  });

  addToGallery(word, pending.img, state.library.length - 1);
  updateProgress();
  updateStats();
  fireCaptureComplete(word, pending.features);
  if (state.library.length === 4) fireDatasetComplete();
  el.recordingIndicator.classList.remove('active');
  if (state.library.length === 1) el.statsBar.style.display = 'flex';
  saveToLocalStorage();
  state.pendingCapture = null;
}
