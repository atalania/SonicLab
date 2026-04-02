import { FFT_SIZE } from './config.js';
import { state } from './state.js';
import { dbToLinear, computeAllFeatures } from './dsp.js';

const STORAGE_KEY = 'sonic-fingerprint-lab-data';
const STORAGE_VER = 2;

export function saveToLocalStorage() {
  try {
    const lib = state.library.map(item => ({
      word: item.word,
      imgDataUrl: item.img.toDataURL('image/png'),
      freq: Array.from(item.freq),
      magnitudes: item.magnitudes ? Array.from(item.magnitudes) : null,
      features: item.features || null,
      analysis: item.analysis,
      timestamp: item.timestamp
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VER,
      library: lib,
      score: state.score,
      difficulty: state.difficulty,
      points: state.points,
      dialogHistory: state.dialogHistory.slice(-20),
      savedAt: new Date().toISOString()
    }));
  } catch (err) {
    console.error('Save error:', err);
    if (err.name === 'QuotaExceededError') alert('Storage quota exceeded — try deleting some words.');
  }
}

/**
 * Loads saved data from localStorage. Returns an array of reconstructed
 * library items (with canvas images, typed arrays, and features) plus
 * session metadata, or null if nothing was saved.
 */
export async function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const data = JSON.parse(saved);

    if (data.version !== STORAGE_VER && data.version !== 1) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const items = [];
    for (const item of data.library) {
      const canvas = document.createElement('canvas');
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.getContext('2d').drawImage(img, 0, 0);
          res();
        };
        img.onerror = rej;
        img.src = item.imgDataUrl;
      });

      let magnitudes = null;
      if (item.magnitudes) {
        magnitudes = new Float32Array(item.magnitudes);
      } else if (item.freq) {
        magnitudes = new Float32Array(item.freq.length);
        for (let i = 0; i < item.freq.length; i++) {
          magnitudes[i] = dbToLinear((item.freq[i] / 255) * 70 - 100);
        }
      }

      let features = item.features || null;
      if (!features && magnitudes) {
        const syntheticTime = new Float32Array(FFT_SIZE);
        features = computeAllFeatures(magnitudes, syntheticTime, 48000, FFT_SIZE);
        features.pitchHz = item.pitchHz || 0;
        features.pitchClarity = item.pitchClarity || 0;
      }

      items.push({
        word: item.word,
        img: canvas,
        freq: new Uint8Array(item.freq),
        magnitudes,
        features,
        analysis: item.analysis,
        timestamp: item.timestamp
      });
    }

    return {
      items,
      score: data.score || 0,
      difficulty: data.difficulty || 1,
      points: data.points || 0,
      dialogHistory: data.dialogHistory || []
    };
  } catch (err) {
    console.error('Load error:', err);
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearSavedData() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
